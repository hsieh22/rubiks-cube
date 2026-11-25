// CFOP：十字 → F2L（公式表）→ OLL → PLL，白色在底
import { ALGS, type Alg } from './algs.ts';
import { CENTER, SOLVED, apply, invert, isSolved, parseAlg, parseMove, formatMove, simplify, type State } from './cube.ts';
import { CORNER_FACELETS, EDGE_FACELETS } from './cubie.ts';
import { AUF, auf, inFrame, solveCross, view, whiteDown } from './lbl.ts';

export interface CfopStage { name: string; moves: string[]; alg?: Alg }

const { U: CU, R: CR, F: CF, D: CD, L: CL } = CENTER;
const CB = 49;

// 常見與進階的 F2L 公式（前右槽）；F 側版本由鏡像自動產生
const F2L_ALGS = [
  // 角塊、邊塊都在頂層
  "R U R'", "U R U' R'", "U' R U R' U2 R U' R'", "U' R U2 R' U2 R U' R'",
  "U' R U' R' U F' U' F", "U' R U R' U R U R'", "U' R U2 R' U F' U' F",
  "R U' R' U R U' R' U2 R U' R'", "U' R U' R' U R U R'", "R U' R' U2 F' U' F",
  "R U2 R' U' R U R'", "U R U2 R' U R U' R'", "U2 R U R' U R U' R'",
  "U R U' R' U' R U' R' U R U' R'", "R U R' U2 R U R' U' R U R'",
  "U' R U' R' U2 R U' R'", "U R U R' U2 R U R'", "U' R U R' U' R U2 R'",
  "R' U2 R2 U R2 U R", "U R U2 R2 F R F'", "R U2 R' U2 R U' R'",
  "U2 R2 U2 R' U' R U' R2", "U R U' R' U R U' R' U R U' R'", "U2 R U' R' U' F' U' F",
  "U R U' R' U' F' U F", "U' R U R' U F' U F",
  // 角塊在頂層、邊塊在槽內
  "U' R' F R F' R U R'", "U R U' R' F R' F' R", "R U' R' U R U' R'", "R U R' U' R U R'",
  "R U R' U' F R' F' R", "R' F R F' R U' R' U R U' R'", "R U' R' U R U2 R' U R U' R'",
  // 角塊在槽內、邊塊在頂層
  "U' R' F R F' R U' R'", "R U' R' U' R U R' U' R U R'", "R U R' U' R U R' U' R U R'",
  "U2 R U' R' U F' U F", "U R U' R' U R U' R'",
  // 角塊、邊塊都在槽內
  "R2 U2 F R2 F' U2 R' U R'", "R U' R' U' R U R' U2 R U' R'", "R U' R' U R U2 R' U R U' R'",
  "R U2 R' U R U2 R' U F' U' F", "R U' R' U F' U2 F U F' U2 F", "R U R' U' R U2 R' U' R U R'",
  "R U' R' U' R U R' U' R U2 R'", "R U2 R U R' U R U2 R2", "R U' R' U R U' R' U2 R U' R'",
];

// 以通過 FR 稜的面做鏡像：R↔F、L↔B，方向相反
function mirror(alg: string): string {
  const m: Record<string, string> = { R: 'F', F: 'R', L: 'B', B: 'L', U: 'U', D: 'D' };
  return parseAlg(alg)
    .map((t) => {
      const mv = parseMove(t)!;
      return formatMove({ base: m[mv.base], amount: (4 - mv.amount) % 4 || 4 });
    })
    .join(' ');
}

const setOf = (s: State, f: number[]) => f.map((i) => s[i]).sort().join('');

// 目前視角下，前右槽那組角塊＋邊塊的位置與方向
function pairKey(v: State): string {
  const cc = [v[CD], v[CF], v[CR]];
  const want = cc.slice().sort().join('');
  const ci = CORNER_FACELETS.findIndex((f) => setOf(v, f) === want);
  const co = CORNER_FACELETS[ci].findIndex((i) => v[i] === cc[0]);
  const ew = [v[CF], v[CR]].sort().join('');
  const ei = EDGE_FACELETS.findIndex((f) => setOf(v, f) === ew);
  const eo = EDGE_FACELETS[ei].findIndex((i) => v[i] === v[CF]);
  return `${ci},${co},${ei},${eo}`;
}

const slotDone = (v: State) => v[29] === v[CD] && v[26] === v[CF] && v[15] === v[CR] && v[23] === v[CF] && v[12] === v[CR];
const crossOk = (s: State) =>
  [28, 30, 32, 34].every((i) => s[i] === s[CD]) && s[25] === s[CF] && s[16] === s[CR] && s[43] === s[CL] && s[52] === s[CB];

let table: Map<string, string[]> | null = null;

export function f2lTable(): Map<string, string[]> {
  if (table) return table;
  table = new Map();
  const base = apply(SOLVED, ['z2']);
  const others = (s: State) => [1, 2, 3].every((k) => slotDone(view(s, k))) && crossOk(s);
  const pool = [...new Set(F2L_ALGS.flatMap((a) => [a, mirror(a)]))];
  for (const a of pool) {
    const seq = parseAlg(a);
    if (!others(apply(base, invert(seq)))) continue;
    for (let t = 0; t < 4; t++) {
      const full = simplify([...auf(t), ...seq]);
      const key = pairKey(apply(base, invert(full)));
      const old = table.get(key);
      if (!old || full.length < old.length) table.set(key, full);
    }
  }
  return table;
}

export const F2L_INVALID = () =>
  F2L_ALGS.filter((a) => {
    const base = apply(SOLVED, ['z2']);
    const s = apply(base, invert(parseAlg(a)));
    return ![1, 2, 3].every((k) => slotDone(view(s, k))) || !crossOk(s);
  });

const U_LAYER_C = new Set([0, 1, 2, 3, 4]);
const U_LAYER_E = new Set([0, 1, 2, 3, 8]);

const OLLS = ALGS.filter((a) => a.set === 'OLL');
const PLLS = ALGS.filter((a) => a.set === 'PLL');
const oriented = (s: State) => [0, 1, 2, 3, 5, 6, 7, 8].every((i) => s[i] === s[CU]);

export function findOLL(s: State): { pre: string[]; alg: Alg } | null {
  for (let t = 0; t < 4; t++)
    for (const a of OLLS) if (oriented(apply(s, [...auf(t), ...parseAlg(a.alg)]))) return { pre: auf(t), alg: a };
  return null;
}

export function findPLL(s: State): { pre: string[]; alg: Alg; post: string[] } | null {
  for (let t = 0; t < 4; t++)
    for (const a of PLLS)
      for (let u = 0; u < 4; u++)
        if (isSolved(apply(s, [...auf(t), ...parseAlg(a.alg), ...auf(u)]))) return { pre: auf(t), alg: a, post: auf(u) };
  return null;
}

export const CFOP_STAGES = ['十字', 'F2L 1', 'F2L 2', 'F2L 3', 'F2L 4', 'OLL', 'PLL'];

// 目前完成到哪一階段（白色需在底，否則先轉）
export function cfopStage(input: State): number {
  const s = apply(input, whiteDown(input));
  if (!crossOk(s)) return 0;
  const n = [0, 1, 2, 3].filter((k) => slotDone(view(s, k))).length;
  if (n < 4) return 1 + n;
  if (!oriented(s)) return 5;
  if (!isSolved(s)) return 6;
  return 7;
}

export function solveCFOP(input: State): CfopStage[] {
  const tbl = f2lTable();
  let cur = input;
  const out: CfopStage[] = [];
  let buf: string[] = [];
  const run = (seq: string[]) => {
    cur = apply(cur, seq);
    buf.push(...seq);
  };
  const close = (name: string, alg?: Alg) => {
    out.push({ name, moves: simplify(buf), alg });
    buf = [];
  };

  run(whiteDown(cur));
  run(solveCross(cur));
  close(CFOP_STAGES[0]);

  for (let pair = 1; pair <= 4; pair++) {
    for (let guard = 0; guard < 6; guard++) {
      const open = [0, 1, 2, 3].filter((k) => !slotDone(view(cur, k)));
      if (open.length !== 5 - pair) break;
      let best: { k: number; seq: string[] } | null = null;
      for (const k of open) {
        const seq = tbl.get(pairKey(view(cur, k)));
        if (seq && (!best || seq.length < best.seq.length)) best = { k, seq };
      }
      if (best) {
        run(inFrame(best.seq.join(' '), best.k));
        break;
      }
      // 角塊或邊塊卡在別的槽：先取出
      const k = open[0];
      const [ci, , ei] = pairKey(view(cur, k)).split(',').map(Number);
      const stuck = !U_LAYER_C.has(ci) ? CORNER_FACELETS[ci] : !U_LAYER_E.has(ei) ? EDGE_FACELETS[ei] : null;
      const cols = stuck ? stuck.map((i) => view(cur, k)[i]).sort().join('') : '';
      const j = [0, 1, 2, 3].find((j) => {
        const v = view(cur, j);
        return setOf(v, CORNER_FACELETS[4]) === cols || setOf(v, EDGE_FACELETS[8]) === cols;
      });
      run(inFrame("R U R'", j ?? k));
    }
    close(CFOP_STAGES[pair]);
  }

  let oll: Alg | undefined;
  if (!oriented(cur)) {
    const r = findOLL(cur);
    if (!r) throw new Error('找不到 OLL');
    run([...r.pre, ...parseAlg(r.alg.alg)]);
    oll = r.alg;
  }
  close('OLL', oll);

  let pll: Alg | undefined;
  const t = [0, 1, 2, 3].find((t) => isSolved(apply(cur, auf(t))));
  if (t !== undefined) run(auf(t));
  else {
    const r = findPLL(cur);
    if (!r) throw new Error('找不到 PLL');
    run([...r.pre, ...parseAlg(r.alg.alg), ...r.post]);
    pll = r.alg;
  }
  close('PLL', pll);

  if (!isSolved(cur)) throw new Error('CFOP 求解失敗');
  return out;
}

export { AUF };
