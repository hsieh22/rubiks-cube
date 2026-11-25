// 塊層級表示（角塊 / 邊塊的位置與方向），供 Kociemba 求解器與合法性檢查使用。
import { relabel, type State } from './cube.ts';

export interface Cubie { cp: number[]; co: number[]; ep: number[]; eo: number[] }

// 角塊：URF UFL ULB UBR DFR DLF DBL DRB
export const CORNER_FACELETS = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
// 邊塊：UR UF UL UB DR DF DL DB FR FL BL BR
export const EDGE_FACELETS = [
  [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25],
  [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14],
];

const FC = 'URFDLB';
const faceOf = (i: number) => FC[Math.floor(i / 9)];
const CORNER_COLORS = CORNER_FACELETS.map((f) => f.map(faceOf));
const EDGE_COLORS = EDGE_FACELETS.map((f) => f.map(faceOf));

export function identity(): Cubie {
  return {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}

export function multiply(a: Cubie, b: Cubie): Cubie {
  const c = identity();
  for (let i = 0; i < 8; i++) {
    c.cp[i] = a.cp[b.cp[i]];
    c.co[i] = (a.co[b.cp[i]] + b.co[i]) % 3;
  }
  for (let i = 0; i < 12; i++) {
    c.ep[i] = a.ep[b.ep[i]];
    c.eo[i] = (a.eo[b.ep[i]] + b.eo[i]) % 2;
  }
  return c;
}

function parity(p: number[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) s++;
  return s % 2;
}

// 回傳 Cubie，或錯誤訊息
export function toCubie(s: State): Cubie | string {
  const centers = new Set([4, 13, 22, 31, 40, 49].map((i) => s[i]));
  if (centers.size !== 6) return '中心塊顏色重複';
  const count: Record<string, number> = {};
  for (const ch of s) count[ch] = (count[ch] ?? 0) + 1;
  if (Object.values(count).some((n) => n !== 9)) return '每種顏色都必須剛好 9 格';

  const t = relabel(s);
  const c = identity();
  const seenC = new Set<number>();
  for (let i = 0; i < 8; i++) {
    const cols = CORNER_FACELETS[i].map((k) => t[k]);
    const ori = cols.findIndex((x) => x === 'U' || x === 'D');
    if (ori < 0) return '有不存在的角塊';
    const c1 = cols[(ori + 1) % 3];
    const c2 = cols[(ori + 2) % 3];
    const j = CORNER_COLORS.findIndex((cc) => cc[0] === cols[ori] && cc[1] === c1 && cc[2] === c2);
    if (j < 0 || seenC.has(j)) return '有不存在或重複的角塊';
    seenC.add(j);
    c.cp[i] = j;
    c.co[i] = ori;
  }
  const seenE = new Set<number>();
  for (let i = 0; i < 12; i++) {
    const [a, b] = EDGE_FACELETS[i].map((k) => t[k]);
    let j = EDGE_COLORS.findIndex((e) => e[0] === a && e[1] === b);
    let o = 0;
    if (j < 0) {
      j = EDGE_COLORS.findIndex((e) => e[0] === b && e[1] === a);
      o = 1;
    }
    if (j < 0 || seenE.has(j)) return '有不存在或重複的邊塊';
    seenE.add(j);
    c.ep[i] = j;
    c.eo[i] = o;
  }
  if (c.co.reduce((x, y) => x + y, 0) % 3) return '有角塊被扭轉，無法還原';
  if (c.eo.reduce((x, y) => x + y, 0) % 2) return '有邊塊被翻轉，無法還原';
  if (parity(c.cp) !== parity(c.ep)) return '有兩個塊被交換，無法還原';
  return c;
}
