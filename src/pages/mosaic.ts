import { COLOR_HEX, COLOR_NAME, apply, invert, simplify, type State } from '../cube/cube.ts';
import { kociemba } from '../cube/kociemba-client.ts';
import { cubePattern, faceTarget, gridSize, quantize } from '../cube/mosaic.ts';
import { CubeView } from '../view/cube3d.ts';
import { h, save, store, svg } from '../view/ui.ts';
import type { Page } from './page.ts';

interface MosaicData { img: string; n: number; done: number[] }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

function shrink(im: HTMLImageElement, max = 512): string {
  const k = Math.min(1, max / Math.max(im.width, im.height));
  const c = document.createElement('canvas');
  c.width = Math.round(im.width * k);
  c.height = Math.round(im.height * k);
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}

function pixels(im: HTMLImageElement, W: number, H: number): Uint8ClampedArray {
  const a = W / H;
  let sw = im.width;
  let sh = im.height;
  if (sw / sh > a) sw = sh * a;
  else sh = sw / a;
  const sx = (im.width - sw) / 2;
  const sy = (im.height - sh) / 2;
  // 先縮到中間尺寸再縮到目標，取樣較平均
  const mid = document.createElement('canvas');
  mid.width = W * 4;
  mid.height = H * 4;
  const mg = mid.getContext('2d')!;
  mg.imageSmoothingQuality = 'high';
  mg.drawImage(im, sx, sy, sw, sh, 0, 0, mid.width, mid.height);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(mid, 0, 0, W, H);
  return g.getImageData(0, 0, W, H).data;
}

const stat = (label: string, v: string) =>
  h('div', { class: 'stat' }, h('span', { class: 'label' }, label), h('b', {}, v));

function mini(p: string, size = 72): SVGElement {
  const root = svg('svg', { viewBox: '0 0 30 30', width: size, height: size });
  root.append(svg('rect', { x: 0, y: 0, width: 30, height: 30, rx: 2, fill: '#161616' }));
  for (let i = 0; i < 9; i++)
    root.append(svg('rect', { x: 1 + (i % 3) * 9.4, y: 1 + Math.floor(i / 3) * 9.4, width: 8.6, height: 8.6, rx: 1.2, fill: COLOR_HEX[p[i]] }));
  return root;
}

export function mosaicPage(): Page {
  const data = store<MosaicData>('cube.mosaic', { img: '', n: 100, done: [] });
  let image: HTMLImageElement | null = null;
  let cols = 0;
  let rows = 0;
  let cells = '';
  let sel = -1;
  let start: State = '';
  let moves: string[] = [];
  let pos = 0;
  let playing = false;
  let token = 0;

  const canvas = h('canvas', { class: 'mosaic' });
  const board = h('div', { class: 'board' }, canvas);
  const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const countInput = h('input', { type: 'number', min: 1, max: 3000, value: data.n, class: 'num' });
  const info = h('div', { class: 'stats' });
  const detail = h('div', { class: 'col' });
  const stage = h('div', { class: 'stage small' });
  const view = new CubeView(stage);
  const chips = h('div', { class: 'chips' });
  const playBtn = h('button', { class: 'btn', onclick: () => togglePlay() }, '播放');
  const doneBtn = h('button', { class: 'btn', onclick: () => toggleDone() }, '');

  const persist = () => save('cube.mosaic', data);

  async function rebuild(resetDone: boolean) {
    if (!image) return;
    const [c, r] = gridSize(Math.max(1, data.n), image.width / image.height);
    if (c !== cols || r !== rows || resetDone) {
      data.done = [];
      sel = -1;
    }
    cols = c;
    rows = r;
    cells = quantize(pixels(image, cols * 3, rows * 3), cols * 3, rows * 3, false);
    persist();
    draw();
    renderSide();
    if (sel >= 0) select(sel);
  }

  function layout() {
    const w = board.clientWidth || 600;
    const maxH = Math.max(240, window.innerHeight - 140);
    const q = Math.max(6, Math.floor(Math.min(w / cols, maxH / rows)));
    return { q, w: q * cols, h: q * rows };
  }

  function draw() {
    if (!cells) return;
    const { q, w, h: hh } = layout();
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = w * dpr;
    canvas.height = hh * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${hh}px`;
    const g = canvas.getContext('2d')!;
    g.scale(dpr, dpr);
    const gap = q >= 18 ? 1 : 0;
    const s = Math.floor((q - gap - 2) / 3);
    const pad = Math.floor((q - gap - 3 * s) / 2);
    const done = new Set(data.done);
    for (let cy = 0; cy < rows; cy++)
      for (let cx = 0; cx < cols; cx++) {
        const x0 = cx * q;
        const y0 = cy * q;
        g.fillStyle = '#161616';
        g.fillRect(x0, y0, q - gap, q - gap);
        const p = cubePattern(cells, cols, cx, cy);
        for (let i = 0; i < 9; i++) {
          g.fillStyle = COLOR_HEX[p[i]];
          const inset = q >= 12 ? Math.max(0.5, Math.round(s * 0.06 * 2) / 2) : 0;
          g.fillRect(x0 + pad + (i % 3) * s + inset, y0 + pad + Math.floor(i / 3) * s + inset, s - inset * 2, s - inset * 2);
        }
        const idx = cy * cols + cx;
        if (done.has(idx)) {
          g.fillStyle = 'rgba(30,158,85,.9)';
          g.beginPath();
          g.moveTo(x0 + q - gap, y0);
          g.lineTo(x0 + q - gap, y0 + q * 0.35);
          g.lineTo(x0 + q - gap - q * 0.35, y0);
          g.fill();
        }
      }
    if (sel >= 0) {
      g.strokeStyle = '#ff2d55';
      g.lineWidth = Math.max(2, q * 0.08);
      g.strokeRect((sel % cols) * q + 1, Math.floor(sel / cols) * q + 1, q - 2, q - 2);
    }
  }

  canvas.addEventListener('click', (e) => {
    if (!cells) return;
    const { q } = layout();
    const r = canvas.getBoundingClientRect();
    const cx = Math.floor((e.clientX - r.left) / q);
    const cy = Math.floor((e.clientY - r.top) / q);
    if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) select(cy * cols + cx);
  });

  async function select(i: number) {
    sel = i;
    playing = false;
    draw();
    const cx = i % cols;
    const cy = Math.floor(i / cols);
    const p = cubePattern(cells, cols, cx, cy);
    const t = faceTarget(p);
    start = t.start;
    moves = [];
    pos = 0;
    view.setState(start);
    renderDetail(p);
    const my = ++token;
    try {
      const sol = await kociemba(t.target, { timeout: 200 });
      if (my !== token) return;
      moves = simplify(invert(sol));
      jump(moves.length);
    } catch {
      if (my === token) chips.textContent = '計算失敗';
    }
  }

  function renderDetail(p: string) {
    if (sel < 0) {
      detail.replaceChildren();
      return;
    }
    const cx = sel % cols;
    const cy = Math.floor(sel / cols);
    chips.textContent = '計算中…';
    detail.replaceChildren(
      h('div', { class: 'row' },
        mini(p),
        h('div', { class: 'stats three' },
          stat('位置', `${cy + 1} 列 ${cx + 1} 行`),
          stat('拿法', `${COLOR_NAME[start[4]]}上${COLOR_NAME[start[22]]}前`),
          stat('擺放', `${COLOR_NAME[start[22]]}朝下`),
        ),
      ),
      stage,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => jump(0) }, '⏮'),
        playBtn,
        h('button', { class: 'btn', onclick: () => jump(moves.length) }, '⏭'),
        doneBtn,
        h('button', { class: 'btn primary', onclick: () => next() }, '下一顆'),
      ),
      chips,
    );
    renderDone();
  }

  function renderChips() {
    chips.replaceChildren(
      ...moves.map((m, i) =>
        h('button', { class: `chip${i < pos ? ' done' : ''}${i === pos ? ' cur' : ''}`, onclick: () => jump(i + 1) }, m)),
    );
    playBtn.textContent = playing ? '暫停' : '播放';
  }

  function jump(i: number) {
    playing = false;
    pos = Math.max(0, Math.min(moves.length, i));
    view.setState(apply(start, moves.slice(0, pos)));
    renderChips();
  }

  async function togglePlay() {
    if (playing) { playing = false; renderChips(); return; }
    if (pos >= moves.length) jump(0);
    playing = true;
    renderChips();
    while (playing && pos < moves.length) {
      const m = moves[pos++];
      renderChips();
      await view.move(m);
    }
    playing = false;
    renderChips();
  }

  function renderDone() {
    const d = data.done.includes(sel);
    doneBtn.textContent = d ? '已完成 ✓' : '標記完成';
    doneBtn.classList.toggle('ok', d);
  }

  function toggleDone() {
    if (sel < 0) return;
    const k = data.done.indexOf(sel);
    if (k >= 0) data.done.splice(k, 1);
    else data.done.push(sel);
    persist();
    renderDone();
    renderSide();
    draw();
  }

  function next() {
    const total = cols * rows;
    for (let k = 1; k <= total; k++) {
      const i = (sel + k) % total;
      if (!data.done.includes(i)) return select(i);
    }
  }

  function renderSide() {
    info.replaceChildren(
      ...(cells ? [stat('尺寸', `${cols} × ${rows}`), stat('方塊', String(cols * rows)), stat('完成', String(data.done.length))] : []),
    );
    board.classList.toggle('empty', !cells);
  }

  async function useImage(src: string, fresh: boolean) {
    try {
      image = await loadImage(src);
    } catch {
      return;
    }
    if (fresh) {
      data.img = shrink(image);
      image = await loadImage(data.img);
    }
    rebuild(fresh);
  }

  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => useImage(String(r.result), true);
    r.readAsDataURL(f);
    fileInput.value = '';
  });
  board.addEventListener('dragover', (e) => e.preventDefault());
  board.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (!f || !f.type.startsWith('image/')) return;
    const r = new FileReader();
    r.onload = () => useImage(String(r.result), true);
    r.readAsDataURL(f);
  });
  countInput.addEventListener('change', () => {
    data.n = Math.max(1, Math.min(3000, Math.round(Number(countInput.value) || 1)));
    countInput.value = String(data.n);
    rebuild(false);
  });

  const pickBtn = h('button', { class: 'btn primary', onclick: () => fileInput.click() }, '選擇圖片');
  board.append(h('button', { class: 'btn drop', onclick: () => fileInput.click() }, '選擇圖片'));

  const el = h(
    'section',
    { class: 'page two' },
    board,
    h(
      'div',
      { class: 'side' },
      h('div', { class: 'row wrap' }, pickBtn, fileInput,
        h('label', { class: 'row' }, h('span', { class: 'label' }, '方塊數'), countInput)),
      info,
      detail,
    ),
  );
  renderSide();
  new ResizeObserver(() => draw()).observe(board);
  if (data.img) useImage(data.img, false);

  return {
    el,
    show: () => view.setActive(true),
    hide: () => { playing = false; view.setActive(false); },
  };
}
