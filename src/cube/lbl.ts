// 層先法（初學者解法），白色在底。
import { CENTER, apply, findOrientation, isSolved, simplify, type State } from './cube.ts';
import { EDGE_FACELETS, CORNER_FACELETS } from './cubie.ts';

export interface Stage { key: StageKey; moves: string[] }
export type StageKey = 'cross' | 'corners' | 'middle' | 'ycross' | 'yface' | 'ycorners' | 'yedges';

export const STAGES: { key: StageKey; name: string; alg?: string }[] = [
  { key: 'cross', name: '白色十字' },
  { key: 'corners', name: '白色角塊', alg: "R U R' U'" },
  { key: 'middle', name: '中層', alg: "U R U' R' U' F' U F ／ U' L' U L U F U' F'" },
  { key: 'ycross', name: '黃色十字', alg: "F R U R' U' F'" },
  { key: 'yface', name: '黃色面', alg: "R U R' U R U2 R'" },
  { key: 'ycorners', name: '頂層角塊', alg: "R' F R' B2 R F' R' B2 R2" },
  { key: 'yedges', name: '頂層邊塊', alg: "R U' R U R U R U' R' U' R2" },
];

const WHITE = 'U';
export const AUF = ['', 'U', 'U2', "U'"];
export const auf = (t: number) => (t ? [AUF[t]] : []);
const FRAME: Record<string, string>[] = [
  {},
  { F: 'R', R: 'B', B: 'L', L: 'F' },
  { F: 'B', R: 'L', B: 'F', L: 'R' },
  { F: 'L', R: 'F', B: 'R', L: 'B' },
];
const Y = ['', 'y', 'y2', "y'"];
export const view = (s: State, k: number) => (k ? apply(s, [Y[k]]) : s);
export const inFrame = (seq: string, k: number) =>
  seq.split(' ').map((t) => (FRAME[k][t[0]] ?? t[0]) + t.slice(1));

const SEXY = "R U R' U'";
const RIGHT = "U R U' R' U' F' U F";
const LEFT = "U' L' U L U F U' F'";
const FRUR = "F R U R' U' F'";
const FURU = "F U R U' R' F'";
const SUNE = "R U R' U R U2 R'";
const A_PERMS = ["R' F R' B2 R F' R' B2 R2", "R2 B2 R F R' B2 R F' R"];
const U_PERMS = ["R U' R U R U R U' R' U' R2", "R2 U R U R' U' R' U' R' U R'"];

const { U: CU, R: CR, F: CF, D: CD, L: CL } = CENTER;

// ---------- 階段判斷（白色需在底） ----------
const same = (s: State, idx: number[], c: number) => idx.every((i) => s[i] === s[c]);
const crossDone = (s: State) =>
  same(s, [28, 30, 32, 34], CD) && s[25] === s[CF] && s[16] === s[CR] && s[43] === s[CL] && s[52] === s[49];
const firstLayer = (s: State) =>
  same(s, [27, 28, 29, 30, 32, 33, 34, 35], CD) &&
  same(s, [24, 25, 26], CF) && same(s, [15, 16, 17], CR) && same(s, [42, 43, 44], CL) && same(s, [51, 52, 53], 49);
const middleSlot = (v: State) => v[23] === v[CF] && v[12] === v[CR];
const middleDone = (s: State) =>
  firstLayer(s) && same(s, [21, 23], CF) && same(s, [12, 14], CR) && same(s, [39, 41], CL) && same(s, [48, 50], 49);
const ycrossDone = (s: State) => middleDone(s) && same(s, [1, 3, 5, 7], CU);
const yfaceDone = (s: State) => middleDone(s) && same(s, [0, 1, 2, 3, 5, 6, 7, 8], CU);
const cornersAligned = (s: State) =>
  AUF.some((a) => {
    const t = a ? apply(s, [a]) : s;
    return same(t, [9, 11], CR) && same(t, [18, 20], CF) && same(t, [36, 38], CL) && same(t, [45, 47], 49);
  });
const ycornersDone = (s: State) => yfaceDone(s) && cornersAligned(s);

export const STAGE_DONE: Record<StageKey, (s: State) => boolean> = {
  cross: crossDone,
  corners: firstLayer,
  middle: middleDone,
  ycross: ycrossDone,
  yface: yfaceDone,
  ycorners: ycornersDone,
  yedges: isSolved,
};

// 讓白色中心在底的整體轉動
export function whiteDown(s: State): string[] {
  for (const o of [[], ['z2'], ['x'], ["x'"], ['z'], ["z'"]]) if (apply(s, o)[CD] === WHITE) return o;
  return findOrientation(s, (t) => t[CD] === WHITE) ?? [];
}

// 目前在第幾個階段（0..7，7 代表完成）
export function currentStage(s: State): number {
  const t = apply(s, whiteDown(s));
  const i = STAGES.findIndex((st) => !STAGE_DONE[st.key](t));
  return i < 0 ? STAGES.length : i;
}

// ---------- 白色十字：對 4 個邊塊做 BFS ----------
const FACE_MOVES = ['U', 'U2', "U'", 'R', 'R2', "R'", 'F', 'F2', "F'", 'D', 'D2', "D'", 'L', 'L2', "L'", 'B', 'B2', "B'"];
const EDGE_STICKERS = EDGE_FACELETS.flat(); // 24
const EDGE_ID = new Int8Array(54).fill(-1);
EDGE_STICKERS.forEach((f, i) => (EDGE_ID[f] = i));
let edgeMoveTable: Int8Array | null = null;

function edgeMoves(): Int8Array {
  if (edgeMoveTable) return edgeMoveTable;
  const t = new Int8Array(18 * 24);
  const base = Array.from({ length: 54 }, (_, i) => String.fromCharCode(48 + i)).join('');
  FACE_MOVES.forEach((m, mi) => {
    const s = apply(base, [m]);
    for (let dest = 0; dest < 54; dest++) {
      const src = s.charCodeAt(dest) - 48;
      if (EDGE_ID[src] >= 0) t[mi * 24 + EDGE_ID[src]] = EDGE_ID[dest];
    }
  });
  return (edgeMoveTable = t);
}

export function solveCross(s: State): string[] {
  const tbl = edgeMoves();
  const white = s[CD];
  const sides = [CF, CR, 49, CL].map((c) => s[c]);
  const goal = [28, 32, 34, 30].map((f) => EDGE_ID[f]); // DF DR DB DL 的白色貼紙位置
  const start = sides.map((col) => {
    for (const [a, b] of EDGE_FACELETS) {
      if (s[a] === white && s[b] === col) return EDGE_ID[a];
      if (s[b] === white && s[a] === col) return EDGE_ID[b];
    }
    throw new Error('找不到白色邊塊');
  });
  const enc = (e: number[]) => ((e[0] * 24 + e[1]) * 24 + e[2]) * 24 + e[3];
  const goalCode = enc(goal);
  const startCode = enc(start);
  if (startCode === goalCode) return [];
  const prev = new Int32Array(24 ** 4).fill(-1);
  const via = new Int8Array(24 ** 4);
  prev[startCode] = startCode;
  let q = [startCode];
  while (q.length) {
    const nq: number[] = [];
    for (const code of q) {
      const e = [Math.floor(code / 13824), Math.floor(code / 576) % 24, Math.floor(code / 24) % 24, code % 24];
      for (let m = 0; m < 18; m++) {
        const n = enc(e.map((x) => tbl[m * 24 + x]));
        if (prev[n] !== -1) continue;
        prev[n] = code;
        via[n] = m;
        if (n === goalCode) {
          const path: string[] = [];
          for (let c = n; c !== startCode; c = prev[c]) path.push(FACE_MOVES[via[c]]);
          return path.reverse();
        }
        nq.push(n);
      }
    }
    q = nq;
  }
  throw new Error('十字求解失敗');
}

// ---------- 主程式 ----------
const has = (s: State, f: number[], cols: string[]) => {
  const a = f.map((i) => s[i]).sort().join('');
  return a === cols.slice().sort().join('');
};

export function solveLBL(input: State): Stage[] {
  let cur = input;
  const out: Stage[] = [];
  let buf: string[] = [];
  const run = (seq: string[] | string) => {
    const list = typeof seq === 'string' ? seq.split(' ').filter(Boolean) : seq;
    cur = apply(cur, list);
    buf.push(...list);
  };
  const close = (key: StageKey) => {
    out.push({ key, moves: simplify(buf) });
    buf = [];
  };

  run(whiteDown(cur));
  run(solveCross(cur));
  close('cross');

  // 白色角塊
  for (let k = 0; k < 4; k++) {
    for (let guard = 0; guard < 12; guard++) {
      const v = view(cur, k);
      const target = [v[CD], v[CF], v[CR]];
      if (v[29] === v[CD] && v[26] === v[CF] && v[15] === v[CR]) break;
      const pos = CORNER_FACELETS.findIndex((f) => has(v, f, target));
      if (pos >= 4) {
        const j = [0, 1, 2, 3].find((j) => has(view(cur, j), CORNER_FACELETS[4], target))!;
        run(inFrame("R U R'", j));
        continue;
      }
      const t = [0, 1, 2, 3].find((t) => has(apply(v, auf(t)), CORNER_FACELETS[0], target))!;
      run(auf(t));
      for (let i = 0; i < 6; i++) {
        const w = view(cur, k);
        if (w[29] === w[CD] && w[26] === w[CF] && w[15] === w[CR]) break;
        run(inFrame(SEXY, k));
      }
    }
  }
  close('corners');

  // 中層
  for (let guard = 0; guard < 30 && !middleDone(cur); guard++) {
    let done = false;
    for (let t = 0; t < 4 && !done; t++) {
      for (let k = 0; k < 4 && !done; k++) {
        const v = view(apply(cur, auf(t)), k);
        const u = v[7];
        const f = v[19];
        if (u === v[CU] || f === v[CU] || f !== v[CF]) continue;
        if (u === v[CR]) run([...auf(t), ...inFrame(RIGHT, k)]);
        else if (u === v[CL]) run([...auf(t), ...inFrame(LEFT, k)]);
        else continue;
        done = true;
      }
    }
    if (done) continue;
    for (let k = 0; k < 4; k++) {
      if (!middleSlot(view(cur, k))) {
        run(inFrame(RIGHT, k));
        break;
      }
    }
  }
  close('middle');

  // 黃色十字
  for (let guard = 0; guard < 6; guard++) {
    const ok = [1, 3, 5, 7].filter((i) => cur[i] === cur[CU]).length;
    if (ok === 4) break;
    if (ok < 2) {
      run(FRUR);
      continue;
    }
    for (let t = 0; t < 4; t++) {
      const s = apply(cur, auf(t));
      const o = (i: number) => s[i] === s[CU];
      if (o(3) && o(5)) { run([...auf(t), ...FRUR.split(' ')]); break; }
      if (o(1) && o(3)) { run([...auf(t), ...FURU.split(' ')]); break; }
    }
  }
  close('ycross');

  // 黃色面
  for (let guard = 0; guard < 10; guard++) {
    const n = [0, 2, 6, 8].filter((i) => cur[i] === cur[CU]).length;
    if (n === 4) break;
    let t = [0, 1, 2, 3].find((t) => {
      const s = apply(cur, auf(t));
      const y = s[CU];
      if (n === 1) return s[6] === y;
      if (n === 0) return s[38] === y;
      return s[18] === y;
    });
    run([...auf(t ?? 0), ...SUNE.split(' ')]);
  }
  close('yface');

  // 頂層角塊
  for (let guard = 0; guard < 4 && !cornersAligned(cur); guard++) {
    let done = false;
    for (let t = 0; t < 4 && !done; t++) {
      for (const a of A_PERMS) {
        const seq = [...auf(t), ...a.split(' ')];
        if (cornersAligned(apply(cur, seq))) {
          run(seq);
          done = true;
          break;
        }
      }
    }
    if (!done) run(A_PERMS[0]);
  }
  close('ycorners');

  // 頂層邊塊
  for (let guard = 0; guard < 4 && !isSolved(cur); guard++) {
    let done = false;
    for (let t0 = 0; t0 < 4 && !done; t0++) {
      for (const a of ['', ...U_PERMS]) {
        for (let t1 = 0; t1 < 4 && !done; t1++) {
          const seq = [...auf(t0), ...(a ? a.split(' ') : []), ...auf(t1)];
          if (isSolved(apply(cur, seq))) {
            run(seq);
            done = true;
          }
        }
        if (done) break;
      }
    }
    if (!done) run(U_PERMS[0]);
  }
  close('yedges');

  if (!isSolved(cur)) throw new Error('層先法求解失敗');
  return out;
}
