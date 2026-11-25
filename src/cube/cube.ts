// 魔術方塊的貼紙模型：54 個字元，順序 U R F D L B，每面 9 格（Kociemba 標準展開）。
// 字元代表顏色：U 白、R 紅、F 綠、D 黃、L 橘、B 藍。

export type State = string;
export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type Face = (typeof FACES)[number];
export const SOLVED: State = FACES.map((f) => f.repeat(9)).join('');
export const CENTER = { U: 4, R: 13, F: 22, D: 31, L: 40, B: 49 } as const;

export type Vec = [number, number, number];
export const FACELET_POS: Vec[] = [];
export const FACELET_NORMAL: Vec[] = [];

for (let f = 0; f < 6; f++) {
  for (let i = 0; i < 9; i++) {
    const r = Math.floor(i / 3);
    const c = i % 3;
    let p: Vec;
    let n: Vec;
    switch (FACES[f]) {
      case 'U': p = [c - 1, 1, r - 1]; n = [0, 1, 0]; break;
      case 'R': p = [1, 1 - r, 1 - c]; n = [1, 0, 0]; break;
      case 'F': p = [c - 1, 1 - r, 1]; n = [0, 0, 1]; break;
      case 'D': p = [c - 1, -1, 1 - r]; n = [0, -1, 0]; break;
      case 'L': p = [-1, 1 - r, c - 1]; n = [-1, 0, 0]; break;
      default: p = [1 - c, 1 - r, -1]; n = [0, 0, -1];
    }
    FACELET_POS.push(p);
    FACELET_NORMAL.push(n);
  }
}

const key = (p: Vec, n: Vec) => `${p.join(',')}|${n.join(',')}`;
const INDEX = new Map<string, number>();
for (let i = 0; i < 54; i++) INDEX.set(key(FACELET_POS[i], FACELET_NORMAL[i]), i);

// 以右手定則繞軸旋轉 q 個 90 度
function rot(v: Vec, axis: number, q: number): Vec {
  let [x, y, z] = v;
  const n = ((q % 4) + 4) % 4;
  for (let i = 0; i < n; i++) {
    if (axis === 0) [y, z] = [-z, y];
    else if (axis === 1) [z, x] = [-x, z];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}

interface Def { axis: 0 | 1 | 2; layers: number[]; q: number }
const ALL = [-1, 0, 1];
const DEFS: Record<string, Def> = {
  R: { axis: 0, layers: [1], q: -1 },
  L: { axis: 0, layers: [-1], q: 1 },
  M: { axis: 0, layers: [0], q: 1 },
  x: { axis: 0, layers: ALL, q: -1 },
  r: { axis: 0, layers: [0, 1], q: -1 },
  l: { axis: 0, layers: [-1, 0], q: 1 },
  U: { axis: 1, layers: [1], q: -1 },
  D: { axis: 1, layers: [-1], q: 1 },
  E: { axis: 1, layers: [0], q: 1 },
  y: { axis: 1, layers: ALL, q: -1 },
  u: { axis: 1, layers: [0, 1], q: -1 },
  d: { axis: 1, layers: [-1, 0], q: 1 },
  F: { axis: 2, layers: [1], q: -1 },
  B: { axis: 2, layers: [-1], q: 1 },
  S: { axis: 2, layers: [0], q: -1 },
  z: { axis: 2, layers: ALL, q: -1 },
  f: { axis: 2, layers: [0, 1], q: -1 },
  b: { axis: 2, layers: [-1, 0], q: 1 },
};

export interface Move { base: string; amount: number } // amount: 1、2、3（3 = 逆時針）

const TOKEN = /^([URFDLBMESxyzurfdlb])(w?)(2'|2|'|)$/;

export function parseMove(tok: string): Move | null {
  const m = TOKEN.exec(tok.replace(/[’′]/g, "'"));
  if (!m) return null;
  let base = m[1];
  if (m[2]) {
    if (!'URFDLB'.includes(base)) return null;
    base = base.toLowerCase();
  }
  const amount = m[3] === "'" ? 3 : m[3].startsWith('2') ? 2 : 1;
  return { base, amount };
}

export function formatMove(m: Move): string {
  return m.base + (m.amount === 2 ? '2' : m.amount === 3 ? "'" : '');
}

export function parseAlg(alg: string): string[] {
  const out: string[] = [];
  for (const t of alg.replace(/[()[\]]/g, ' ').split(/\s+/)) {
    if (!t) continue;
    const m = parseMove(t);
    if (!m) throw new Error(`無效的轉動：${t}`);
    out.push(formatMove(m));
  }
  return out;
}

const PERM = new Map<string, Int16Array>();

function permOf(tok: string): Int16Array {
  let p = PERM.get(tok);
  if (p) return p;
  const mv = parseMove(tok);
  if (!mv) throw new Error(`無效的轉動：${tok}`);
  const d = DEFS[mv.base];
  const q = d.q * mv.amount;
  p = new Int16Array(54);
  for (let i = 0; i < 54; i++) p[i] = i;
  for (let j = 0; j < 54; j++) {
    const pos = FACELET_POS[j];
    if (!d.layers.includes(pos[d.axis])) continue;
    const k = INDEX.get(key(rot(pos, d.axis, q), rot(FACELET_NORMAL[j], d.axis, q)))!;
    p[k] = j;
  }
  PERM.set(tok, p);
  return p;
}

export function moveInfo(tok: string): { axis: 0 | 1 | 2; layers: number[]; quarter: number } {
  const mv = parseMove(tok);
  if (!mv) throw new Error(`無效的轉動：${tok}`);
  const d = DEFS[mv.base];
  return { axis: d.axis, layers: d.layers, quarter: d.q * (mv.amount === 3 ? -1 : mv.amount) };
}

export function apply(s: State, moves: string | readonly string[]): State {
  const list = typeof moves === 'string' ? parseAlg(moves) : moves;
  let a = s.split('');
  for (const t of list) {
    if (!t) continue;
    const p = permOf(t);
    const n = new Array<string>(54);
    for (let i = 0; i < 54; i++) n[i] = a[p[i]];
    a = n;
  }
  return a.join('');
}

export function invert(moves: readonly string[]): string[] {
  return moves
    .slice()
    .reverse()
    .map((t) => {
      const m = parseMove(t)!;
      return formatMove({ base: m.base, amount: (4 - m.amount) % 4 || 4 });
    });
}

export function simplify(moves: readonly string[]): string[] {
  const st: Move[] = [];
  for (const t of moves) {
    const m = parseMove(t)!;
    const top = st[st.length - 1];
    if (top && top.base === m.base) {
      const a = (top.amount + m.amount) % 4;
      st.pop();
      if (a) st.push({ base: m.base, amount: a });
    } else st.push({ ...m });
  }
  return st.map(formatMove);
}

const AXIS_OF: Record<string, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };

export function randomScramble(n = 25): string[] {
  const faces = 'URFDLB';
  const out: string[] = [];
  const fs: string[] = [];
  while (out.length < n) {
    const f = faces[Math.floor(Math.random() * 6)];
    const a = fs[fs.length - 1];
    const b = fs[fs.length - 2];
    if (f === a) continue;
    if (a && b && AXIS_OF[f] === AXIS_OF[a] && AXIS_OF[a] === AXIS_OF[b]) continue;
    fs.push(f);
    out.push(f + ['', '2', "'"][Math.floor(Math.random() * 3)]);
  }
  return out;
}

export function isSolved(s: State): boolean {
  for (let f = 0; f < 6; f++) {
    const c = s[f * 9 + 4];
    for (let i = 0; i < 9; i++) if (s[f * 9 + i] !== c) return false;
  }
  return true;
}

// 24 種整體方向
export const ORIENTATIONS: string[][] = [];
for (const a of [[], ['x'], ['x2'], ["x'"], ['z'], ["z'"]]) {
  for (const b of [[], ['y'], ['y2'], ["y'"]]) ORIENTATIONS.push([...a, ...b]);
}

export function findOrientation(s: State, pred: (t: State) => boolean): string[] | null {
  for (const o of ORIENTATIONS) if (pred(apply(s, o))) return o;
  return null;
}

// 依中心塊重新命名顏色（中心在哪一面，那個顏色就叫那一面）
export function relabel(s: State): State {
  const map: Record<string, string> = {};
  for (let f = 0; f < 6; f++) map[s[f * 9 + 4]] = FACES[f];
  return s
    .split('')
    .map((c) => map[c] ?? '?')
    .join('');
}

export const COLOR_HEX: Record<string, string> = {
  U: '#ffffff',
  R: '#d32f2f',
  F: '#1e9e55',
  D: '#ffd60a',
  L: '#ff7a1a',
  B: '#1f5fd1',
  X: '#d9d9d9',
};

export const COLOR_NAME: Record<string, string> = { U: '白', R: '紅', F: '綠', D: '黃', L: '橘', B: '藍' };
