// 馬賽克：圖片轉方塊色格，以及單顆方塊頂面圖案的目標狀態
import { COLOR_HEX, FACES, ORIENTATIONS, SOLVED, apply, type State } from './cube.ts';
import { CORNER_FACELETS, EDGE_FACELETS, identity, type Cubie } from './cubie.ts';

export const PALETTE = 'URFDLB';

// 依方塊總數與圖片比例決定 寬 × 高
export function gridSize(n: number, aspect: number): [number, number] {
  let best: [number, number] = [1, 1];
  let bs = Infinity;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.max(1, Math.floor(n / cols));
    if (cols * rows > n) continue;
    const s = Math.abs(Math.log(cols / rows / aspect)) + (0.5 * (n - cols * rows)) / n;
    if (s < bs) {
      bs = s;
      best = [cols, rows];
    }
  }
  return best;
}

const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function lab([r, g, b]: number[]): number[] {
  const lin = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const PAL_RGB = PALETTE.split('').map((c) => hexRgb(COLOR_HEX[c]));
const PAL_LAB = PAL_RGB.map(lab);

function nearest(rgb: number[]): number {
  const l = lab(rgb.map((v) => Math.max(0, Math.min(255, v))));
  let bi = 0;
  let bd = Infinity;
  PAL_LAB.forEach((p, i) => {
    const d = (p[0] - l[0]) ** 2 + (p[1] - l[1]) ** 2 + (p[2] - l[2]) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  return bi;
}

// rgba：W×H 像素（每格一張貼紙）；回傳每格的顏色字元
export function quantize(rgba: Uint8ClampedArray, W: number, H: number, dither: boolean): string {
  const buf = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) for (let k = 0; k < 3; k++) buf[i * 3 + k] = rgba[i * 4 + k];
  const out: string[] = new Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const px = [buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]];
      const ci = nearest(px);
      out[i] = PALETTE[ci];
      if (!dither) continue;
      const err = px.map((v, k) => v - PAL_RGB[ci][k]);
      const push = (dx: number, dy: number, w: number) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= W || ny >= H) return;
        const j = (ny * W + nx) * 3;
        for (let k = 0; k < 3; k++) buf[j + k] += err[k] * w;
      };
      push(1, 0, 7 / 16);
      push(-1, 1, 3 / 16);
      push(0, 1, 5 / 16);
      push(1, 1, 1 / 16);
    }
  return out.join('');
}

// 第 (cx, cy) 顆方塊的 9 格圖案（列優先）
export function cubePattern(cells: string, cols: number, cx: number, cy: number): string {
  const W = cols * 3;
  let s = '';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) s += cells[(cy * 3 + r) * W + cx * 3 + c];
  return s;
}

const CC: string[][] = CORNER_FACELETS.map((f) => f.map((i) => FACES[Math.floor(i / 9)]));
const EC: string[][] = EDGE_FACELETS.map((f) => f.map((i) => FACES[Math.floor(i / 9)]));
const U_CORNER = [8, 6, 0, 2]; // URF UFL ULB UBR 的 U 貼紙
const U_EDGE = [5, 7, 3, 1]; // UR UF UL UB 的 U 貼紙

function assign(want: string[], pieces: string[][], used: boolean[], k: number, out: number[]): boolean {
  if (k === want.length) return true;
  for (let j = 0; j < pieces.length; j++) {
    if (used[j] || !pieces[j].includes(want[k])) continue;
    used[j] = true;
    out[k] = j;
    if (assign(want, pieces, used, k + 1, out)) return true;
    used[j] = false;
  }
  return false;
}

const parity = (p: number[]) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) s++;
  return s % 2;
};

function toFacelets(c: Cubie): string {
  const a = new Array<string>(54);
  for (let f = 0; f < 6; f++) a[f * 9 + 4] = FACES[f];
  CORNER_FACELETS.forEach((fs, i) => fs.forEach((idx, n) => (a[idx] = CC[c.cp[i]][(n - c.co[i] + 3) % 3])));
  EDGE_FACELETS.forEach((fs, i) => fs.forEach((idx, n) => (a[idx] = EC[c.ep[i]][(n + c.eo[i]) % 2])));
  return a.join('');
}

// 讓頂面呈現 pattern 的目標狀態。start：拿方塊的方向（已還原）；target：轉完的狀態
export function faceTarget(pattern: string): { hold: string[]; start: State; target: State } {
  const hold = ORIENTATIONS.find((o) => apply(SOLVED, o)[4] === pattern[4])!;
  const start = apply(SOLVED, hold);
  const toFace: Record<string, string> = {};
  const toColor: Record<string, string> = {};
  for (let f = 0; f < 6; f++) {
    toFace[start[f * 9 + 4]] = FACES[f];
    toColor[FACES[f]] = start[f * 9 + 4];
  }
  const p = pattern.split('').map((x) => toFace[x]);
  const c = identity();

  const cw = U_CORNER.map((i) => p[i]);
  const ci: number[] = [];
  assign(cw, CC, new Array(8).fill(false), 0, ci);
  const restC = [0, 1, 2, 3, 4, 5, 6, 7].filter((j) => !ci.includes(j));
  for (let s = 0; s < 8; s++) {
    if (s < 4) {
      c.cp[s] = ci[s];
      c.co[s] = (3 - CC[ci[s]].indexOf(cw[s])) % 3;
    } else {
      c.cp[s] = restC[s - 4];
      c.co[s] = 0;
    }
  }
  const ew = U_EDGE.map((i) => p[i]);
  const ei: number[] = [];
  assign(ew, EC, new Array(12).fill(false), 0, ei);
  const restE = Array.from({ length: 12 }, (_, j) => j).filter((j) => !ei.includes(j));
  for (let s = 0; s < 12; s++) {
    if (s < 4) {
      c.ep[s] = ei[s];
      c.eo[s] = EC[ei[s]].indexOf(ew[s]);
    } else {
      c.ep[s] = restE[s - 4];
      c.eo[s] = 0;
    }
  }
  c.co[7] = (c.co[7] + 3 - (c.co.reduce((a, b) => a + b, 0) % 3)) % 3;
  c.eo[11] = (c.eo[11] + (c.eo.reduce((a, b) => a + b, 0) % 2)) % 2;
  if (parity(c.cp) !== parity(c.ep)) [c.ep[4], c.ep[5]] = [c.ep[5], c.ep[4]];

  const target = toFacelets(c)
    .split('')
    .map((x) => toColor[x])
    .join('');
  return { hold, start, target };
}
