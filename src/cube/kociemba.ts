// Kociemba 兩階段演算法
import { SOLVED, apply } from './cube.ts';
import { identity, multiply, toCubie, type Cubie } from './cubie.ts';

export const MOVES = ['U', 'U2', "U'", 'R', 'R2', "R'", 'F', 'F2', "F'", 'D', 'D2', "D'", 'L', 'L2', "L'", 'B', 'B2', "B'"];
const ALL18 = MOVES.map((_, i) => i);
const P2 = [0, 1, 2, 9, 10, 11, 4, 7, 13, 16]; // U D 全部 + R2 F2 L2 B2
const P2SET = new Uint8Array(18);
for (const m of P2) P2SET[m] = 1;

const N_TWIST = 2187;
const N_FLIP = 2048;
const N_SLICE = 495;
const N_PERM = 40320;
const N_SP = 24;

const SLICE_MASKS: number[] = [];
const SLICE_IDX = new Int16Array(4096).fill(-1);
{
  const masks: number[] = [];
  for (let m = 0; m < 4096; m++) {
    let b = 0;
    for (let i = 0; i < 12; i++) b += (m >> i) & 1;
    if (b === 4 && m !== 0xf00) masks.push(m);
  }
  masks.unshift(0xf00);
  masks.forEach((m, i) => {
    SLICE_MASKS.push(m);
    SLICE_IDX[m] = i;
  });
}

function rank(a: number[]): number {
  let r = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) {
    let c = 0;
    for (let j = i + 1; j < n; j++) if (a[j] < a[i]) c++;
    r = r * (n - i) + c;
  }
  return r;
}

function unrank(r: number, n: number): number[] {
  const d = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    d[i] = r % (n - i);
    r = Math.floor(r / (n - i));
  }
  const avail = Array.from({ length: n }, (_, i) => i);
  return d.map((k) => avail.splice(k, 1)[0]);
}

const getTwist = (c: Cubie) => c.co.slice(0, 7).reduce((t, x) => t * 3 + x, 0);
function setTwist(c: Cubie, t: number) {
  let s = 0;
  for (let i = 6; i >= 0; i--) {
    c.co[i] = t % 3;
    s += c.co[i];
    t = Math.floor(t / 3);
  }
  c.co[7] = (3 - (s % 3)) % 3;
}
const getFlip = (c: Cubie) => c.eo.slice(0, 11).reduce((t, x) => t * 2 + x, 0);
function setFlip(c: Cubie, t: number) {
  let s = 0;
  for (let i = 10; i >= 0; i--) {
    c.eo[i] = t % 2;
    s += c.eo[i];
    t = Math.floor(t / 2);
  }
  c.eo[11] = s % 2;
}
function getSlice(c: Cubie) {
  let m = 0;
  for (let i = 0; i < 12; i++) if (c.ep[i] >= 8) m |= 1 << i;
  return SLICE_IDX[m];
}
function setSlice(c: Cubie, idx: number) {
  const m = SLICE_MASKS[idx];
  let s = 8;
  let o = 0;
  for (let i = 0; i < 12; i++) c.ep[i] = (m >> i) & 1 ? s++ : o++;
}
const getCp = (c: Cubie) => rank(c.cp);
const setCp = (c: Cubie, r: number) => { c.cp = unrank(r, 8); };
const getEp = (c: Cubie) => rank(c.ep.slice(0, 8));
function setEp(c: Cubie, r: number) {
  const a = unrank(r, 8);
  for (let i = 0; i < 8; i++) c.ep[i] = a[i];
}
const getSp = (c: Cubie) => rank(c.ep.slice(8).map((x) => x - 8));
function setSp(c: Cubie, r: number) {
  const a = unrank(r, 4);
  for (let i = 0; i < 4; i++) c.ep[8 + i] = 8 + a[i];
}

let moveCube: Cubie[] = [];
let twistMv: Uint16Array, flipMv: Uint16Array, sliceMv: Uint16Array;
let cpMv: Uint16Array, epMv: Uint16Array, spMv: Uint16Array;
let pTS: Int8Array, pFS: Int8Array, pCS: Int8Array, pES: Int8Array;
let ready = false;

function buildMove(n: number, set: (c: Cubie, i: number) => void, get: (c: Cubie) => number, moves: number[]) {
  const t = new Uint16Array(n * 18);
  for (let i = 0; i < n; i++) {
    const c = identity();
    set(c, i);
    for (const m of moves) t[i * 18 + m] = get(multiply(c, moveCube[m]));
  }
  return t;
}

function buildPrune(n1: number, n2: number, m1: Uint16Array, m2: Uint16Array, moves: number[]) {
  const size = n1 * n2;
  const p = new Int8Array(size).fill(-1);
  p[0] = 0;
  let depth = 0;
  let added = 1;
  while (added) {
    added = 0;
    for (let i = 0; i < size; i++) {
      if (p[i] !== depth) continue;
      const a = Math.floor(i / n2);
      const b = i - a * n2;
      for (const m of moves) {
        const j = m1[a * 18 + m] * n2 + m2[b * 18 + m];
        if (p[j] === -1) {
          p[j] = depth + 1;
          added++;
        }
      }
    }
    depth++;
  }
  return p;
}

export function isReady() {
  return ready;
}

export function init() {
  if (ready) return;
  moveCube = MOVES.map((m) => toCubie(apply(SOLVED, [m])) as Cubie);
  twistMv = buildMove(N_TWIST, setTwist, getTwist, ALL18);
  flipMv = buildMove(N_FLIP, setFlip, getFlip, ALL18);
  sliceMv = buildMove(N_SLICE, setSlice, getSlice, ALL18);
  cpMv = buildMove(N_PERM, setCp, getCp, P2);
  epMv = buildMove(N_PERM, setEp, getEp, P2);
  spMv = buildMove(N_SP, setSp, getSp, P2);
  pTS = buildPrune(N_TWIST, N_SLICE, twistMv, sliceMv, ALL18);
  pFS = buildPrune(N_FLIP, N_SLICE, flipMv, sliceMv, ALL18);
  pCS = buildPrune(N_PERM, N_SP, cpMv, spMv, P2);
  pES = buildPrune(N_PERM, N_SP, epMv, spMv, P2);
  ready = true;
}

export interface SolveOptions { maxLength?: number; timeout?: number; hardTimeout?: number }

export function solveCubie(root: Cubie, opts: SolveOptions = {}): string[] | null {
  init();
  const timeout = opts.timeout ?? 800;
  const hard = opts.hardTimeout ?? 15000;
  const t0 = Date.now();
  const sol = new Array<number>(64).fill(-1);
  let best: number[] | null = null;
  let maxTotal = opts.maxLength ?? 30;
  let stop = false;
  let nodes = 0;

  function p2(cp: number, ep: number, sp: number, depth: number, togo: number): boolean {
    if (togo === 0) return cp === 0 && ep === 0 && sp === 0;
    const last = depth > 0 ? (sol[depth - 1] / 3) | 0 : -1;
    for (const m of P2) {
      const f = (m / 3) | 0;
      if (f === last || f === last - 3) continue;
      const c2 = cpMv[cp * 18 + m];
      const e2 = epMv[ep * 18 + m];
      const s2 = spMv[sp * 18 + m];
      if (Math.max(pCS[c2 * N_SP + s2], pES[e2 * N_SP + s2]) > togo - 1) continue;
      sol[depth] = m;
      if (p2(c2, e2, s2, depth + 1, togo - 1)) return true;
    }
    return false;
  }

  function startP2(d1: number) {
    let cc = root;
    for (let i = 0; i < d1; i++) cc = multiply(cc, moveCube[sol[i]]);
    const cp = getCp(cc);
    const ep = getEp(cc);
    const sp = getSp(cc);
    const h = Math.max(pCS[cp * N_SP + sp], pES[ep * N_SP + sp]);
    for (let d2 = h; d1 + d2 <= maxTotal; d2++) {
      if (p2(cp, ep, sp, d1, d2)) {
        best = sol.slice(0, d1 + d2);
        maxTotal = d1 + d2 - 1;
        break;
      }
    }
  }

  function p1(tw: number, fl: number, sl: number, depth: number, togo: number) {
    if (stop) return;
    if (++nodes % 4096 === 0) {
      const dt = Date.now() - t0;
      if ((best && dt > timeout) || dt > hard) stop = true;
    }
    if (togo === 0) {
      if (tw === 0 && fl === 0 && sl === 0) {
        if (depth > 0 && P2SET[sol[depth - 1]]) return;
        startP2(depth);
      }
      return;
    }
    const last = depth > 0 ? (sol[depth - 1] / 3) | 0 : -1;
    for (let m = 0; m < 18; m++) {
      const f = (m / 3) | 0;
      if (f === last || f === last - 3) continue;
      const t2 = twistMv[tw * 18 + m];
      const f2 = flipMv[fl * 18 + m];
      const s2 = sliceMv[sl * 18 + m];
      if (Math.max(pTS[t2 * N_SLICE + s2], pFS[f2 * N_SLICE + s2]) > togo - 1) continue;
      sol[depth] = m;
      p1(t2, f2, s2, depth + 1, togo - 1);
      if (stop) return;
    }
  }

  const tw = getTwist(root);
  const fl = getFlip(root);
  const sl = getSlice(root);
  for (let d1 = 0; d1 <= maxTotal && !stop; d1++) p1(tw, fl, sl, 0, d1);
  const b = best as number[] | null;
  return b ? b.map((m) => MOVES[m]) : null;
}

export function solveState(s: string, opts?: SolveOptions): string[] | string {
  const c = toCubie(s);
  if (typeof c === 'string') return c;
  return solveCubie(c, opts) ?? '找不到解法';
}
