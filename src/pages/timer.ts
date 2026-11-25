import { SOLVED, apply, randomScramble } from '../cube/cube.ts';
import { fmtTime, h, net, save, store } from '../view/ui.ts';
import type { Page } from './page.ts';

interface Solve { t: number; pen: 0 | 2 | -1; s: string; d: number }

const value = (x: Solve) => (x.pen === -1 ? Infinity : x.t + (x.pen === 2 ? 2000 : 0));

function avg(list: Solve[], n: number): number | null | undefined {
  if (list.length < n) return undefined;
  const v = list.slice(0, n).map(value).sort((a, b) => a - b);
  const trim = Math.ceil(n * 0.05);
  const mid = v.slice(trim, n - trim);
  if (mid.some((x) => !isFinite(x))) return null;
  return mid.reduce((a, b) => a + b, 0) / mid.length;
}

export function timerPage(): Page {
  let solves = store<Solve[]>('cube.times', []); // 新的在前
  let scramble = randomScramble(20);
  let phase: 'idle' | 'hold' | 'ready' | 'run' = 'idle';
  let holdTimer = 0;
  let t0 = 0;
  let raf = 0;

  const scrEl = h('div', { class: 'scramble' });
  const netBox = h('div', { class: 'netbox' });
  const timeEl = h('div', { class: 'time' }, '0.00');
  const stats = h('div', { class: 'stats' });
  const list = h('ol', { class: 'times' });
  const chart = h('canvas', { class: 'chart' });

  const newScramble = () => {
    scramble = randomScramble(20);
    scrEl.textContent = scramble.join(' ');
    netBox.replaceChildren(net(apply(SOLVED, scramble), { cell: 11 }));
  };

  const persist = () => {
    save('cube.times', solves);
    render();
  };

  function stat(label: string, v: string) {
    return h('div', { class: 'stat' }, h('span', { class: 'label' }, label), h('b', {}, v));
  }

  function render() {
    const vals = solves.map(value).filter(isFinite);
    const show = (x: number | null | undefined) => (x === undefined ? '—' : fmtTime(x));
    stats.replaceChildren(
      stat('ao5', show(avg(solves, 5))),
      stat('ao12', show(avg(solves, 12))),
      stat('最佳', vals.length ? fmtTime(Math.min(...vals)) : '—'),
      stat('平均', vals.length ? fmtTime(vals.reduce((a, b) => a + b, 0) / vals.length) : '—'),
      stat('次數', String(solves.length)),
    );
    list.replaceChildren(
      ...solves.slice(0, 100).map((x, i) =>
        h(
          'li',
          { title: x.s },
          h('span', { class: 'n' }, String(solves.length - i)),
          h('span', { class: 't' }, x.pen === -1 ? 'DNF' : fmtTime(value(x)) + (x.pen === 2 ? '+' : '')),
          h('button', { class: 'tiny', onclick: () => { x.pen = x.pen === 2 ? 0 : 2; persist(); } }, '+2'),
          h('button', { class: 'tiny', onclick: () => { x.pen = x.pen === -1 ? 0 : -1; persist(); } }, 'DNF'),
          h('button', { class: 'tiny', onclick: () => { solves.splice(i, 1); persist(); } }, '×'),
        ),
      ),
    );
    drawChart();
  }

  function drawChart() {
    const pts = solves.slice(0, 100).reverse();
    const w = chart.clientWidth || 300;
    const hh = chart.clientHeight || 120;
    const dpr = Math.min(devicePixelRatio, 2);
    chart.width = w * dpr;
    chart.height = hh * dpr;
    const g = chart.getContext('2d')!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, hh);
    const vals = pts.map(value);
    const fin = vals.filter(isFinite);
    if (fin.length < 2) return;
    const lo = Math.min(...fin);
    const hi = Math.max(...fin);
    const pad = 8;
    const X = (i: number) => pad + (i / (pts.length - 1)) * (w - pad * 2);
    const Y = (v: number) => hh - pad - ((v - lo) / (hi - lo || 1)) * (hh - pad * 2);
    const line = (ys: (number | null)[], color: string, width: number) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      let on = false;
      ys.forEach((v, i) => {
        if (v == null || !isFinite(v)) { on = false; return; }
        if (on) g.lineTo(X(i), Y(v));
        else g.moveTo(X(i), Y(v));
        on = true;
      });
      g.stroke();
    };
    line(vals, '#c7c7c7', 1);
    const ao5 = pts.map((_, i) => (i >= 4 ? (avg(pts.slice(i - 4, i + 1).reverse(), 5) ?? null) : null));
    line(ao5, '#111', 1.5);
  }

  const setPhase = (p: typeof phase) => {
    phase = p;
    timeEl.dataset.phase = p;
    document.body.classList.toggle('focus', p === 'run');
  };

  const tick = () => {
    timeEl.textContent = fmtTime(performance.now() - t0).replace(/\d$/, '');
    raf = requestAnimationFrame(tick);
  };

  function press() {
    if (phase === 'run') {
      cancelAnimationFrame(raf);
      const t = Math.round(performance.now() - t0);
      timeEl.textContent = fmtTime(t);
      solves.unshift({ t, pen: 0, s: scramble.join(' '), d: Date.now() });
      setPhase('idle');
      persist();
      newScramble();
      return true;
    }
    if (phase === 'idle') {
      setPhase('hold');
      timeEl.textContent = '0.00';
      holdTimer = window.setTimeout(() => setPhase('ready'), 300);
    }
    return false;
  }
  function release() {
    clearTimeout(holdTimer);
    if (phase === 'ready') {
      t0 = performance.now();
      setPhase('run');
      tick();
    } else if (phase === 'hold') setPhase('idle');
  }

  let justStopped = false;
  timeEl.addEventListener('touchstart', (e) => { e.preventDefault(); justStopped = press(); }, { passive: false });
  timeEl.addEventListener('touchend', (e) => { e.preventDefault(); if (!justStopped) release(); justStopped = false; });

  const el = h(
    'section',
    { class: 'page timer' },
    h('div', { class: 'timer-main' }, scrEl, netBox, timeEl),
    h(
      'div',
      { class: 'timer-side' },
      stats,
      chart,
      list,
      h('button', {
        class: 'btn small',
        onclick: () => {
          if (solves.length && confirm('清除全部成績？')) {
            solves = [];
            persist();
          }
        },
      }, '清除全部'),
    ),
  );
  newScramble();
  render();
  new ResizeObserver(drawChart).observe(chart);

  return {
    el,
    show() {},
    hide() {
      if (phase === 'run') cancelAnimationFrame(raf);
      clearTimeout(holdTimer);
      setPhase('idle');
    },
    onKey(e) {
      if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
      if (phase === 'run') {
        e.preventDefault();
        justStopped = press();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        justStopped = false;
        press();
      }
    },
    onKeyUp(e) {
      if (e.code !== 'Space') return;
      e.preventDefault();
      if (justStopped) { justStopped = false; return; }
      release();
    },
  };
}
