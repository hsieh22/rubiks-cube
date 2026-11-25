import { COLOR_HEX, type State } from '../cube/cube.ts';

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

const SVG = 'http://www.w3.org/2000/svg';
export function svg(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export function store<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 無法儲存時略過 */
  }
}

// 展開圖：U 在上，L F R B 一排，D 在下
const NET_ORIGIN: Record<string, [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
const ORDER = 'URFDLB';

export function net(
  state: State,
  opts: { cell?: number; onClick?: (i: number) => void } = {},
): SVGSVGElement {
  const c = opts.cell ?? 14;
  const p = Math.max(1, c * 0.08);
  const g = Math.max(2, c * 0.15);
  const F = 3 * c + 2 * p;
  const W = 4 * F + 3 * g;
  const H = 3 * F + 2 * g;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'net' }) as SVGSVGElement;
  for (const f of ORDER) {
    const [fx, fy] = NET_ORIGIN[f];
    root.append(svg('rect', { x: fx * (F + g), y: fy * (F + g), width: F, height: F, rx: p * 1.5, fill: '#161616' }));
  }
  for (let i = 0; i < 54; i++) {
    const f = ORDER[Math.floor(i / 9)];
    const [fx, fy] = NET_ORIGIN[f];
    const k = i % 9;
    const x = fx * (F + g) + p + (k % 3) * c;
    const y = fy * (F + g) + p + Math.floor(k / 3) * c;
    const r = svg('rect', { x: x + p / 2, y: y + p / 2, width: c - p, height: c - p, rx: c * 0.12, fill: COLOR_HEX[state[i]] ?? COLOR_HEX.X, class: 'st' });
    r.dataset.i = String(i);
    if (opts.onClick && k !== 4) {
      r.classList.add('click');
      r.addEventListener('click', () => opts.onClick!(i));
    }
    root.append(r);
  }
  return root;
}

// 頂視圖（公式卡用）
export function topView(s: State, mode: 'OLL' | 'PLL', size = 96): SVGSVGElement {
  const root = svg('svg', { viewBox: '0 0 100 100', width: size, height: size, class: 'topview' }) as SVGSVGElement;
  const color = (i: number) => (mode === 'OLL' ? (s[i] === s[4] ? COLOR_HEX.D : COLOR_HEX.X) : COLOR_HEX[s[i]]);
  const cell = 22;
  const o = 17;
  const rect = (x: number, y: number, w: number, hh: number, i: number) =>
    root.append(svg('rect', { x, y, width: w, height: hh, rx: 2.5, fill: color(i), stroke: '#222', 'stroke-width': 1.2 }));
  for (let k = 0; k < 9; k++) rect(o + (k % 3) * cell + 1, o + Math.floor(k / 3) * cell + 1, cell - 2, cell - 2, k);
  const t = 9;
  [47, 46, 45].forEach((i, k) => rect(o + k * cell + 1, o - t - 3, cell - 2, t, i));
  [18, 19, 20].forEach((i, k) => rect(o + k * cell + 1, o + 3 * cell + 3, cell - 2, t, i));
  [36, 37, 38].forEach((i, k) => rect(o - t - 3, o + k * cell + 1, t, cell - 2, i));
  [11, 10, 9].forEach((i, k) => rect(o + 3 * cell + 3, o + k * cell + 1, t, cell - 2, i));
  return root;
}

export function fmtTime(ms: number | null): string {
  if (ms == null || !isFinite(ms)) return 'DNF';
  const cs = Math.floor(ms / 10);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = String(cs % 100).padStart(2, '0');
  return m ? `${m}:${String(s).padStart(2, '0')}.${c}` : `${s}.${c}`;
}

const PAD_ROWS = [
  ['U', "U'", 'U2', 'D', "D'", 'D2'],
  ['R', "R'", 'R2', 'L', "L'", 'L2'],
  ['F', "F'", 'F2', 'B', "B'", 'B2'],
  ['M', "M'", 'E', "E'", 'S', "S'"],
  ['x', "x'", 'y', "y'", 'z', "z'"],
];

export function movePad(onMove: (m: string) => void, rows = PAD_ROWS): HTMLElement {
  return h(
    'div',
    { class: 'pad' },
    rows.flat().map((m) => h('button', { class: 'mv', onclick: () => onMove(m) }, m)),
  );
}

// 鍵盤：U R F D L B M E S x y z，Shift 為逆時針
export function keyToMove(e: KeyboardEvent, allowRot = true): string | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const k = e.key.toLowerCase();
  const map: Record<string, string> = { u: 'U', r: 'R', f: 'F', d: 'D', l: 'L', b: 'B', m: 'M', e: 'E', s: 'S' };
  let base = map[k];
  if (!base && allowRot && 'xyz'.includes(k) && k.length === 1) base = k;
  if (!base) return null;
  return base + (e.shiftKey ? "'" : '');
}
