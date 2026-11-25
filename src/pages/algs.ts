import { ALGS, caseState, type Alg } from '../cube/algs.ts';
import { h, save, store, topView } from '../view/ui.ts';
import type { Page } from './page.ts';

type Level = 0 | 1 | 2; // 未學 / 學習中 / 已熟
const LEVEL_NAME = ['未學', '學習中', '已熟'];

export function algsPage(): Page {
  const levels = store<Record<string, Level>>('cube.algs', {});
  let set: 'OLL' | 'PLL' = 'PLL';
  let filter: -1 | Level = -1;
  let mode: 'list' | 'drill' = 'list';
  let current: Alg | null = null;
  let revealed = false;

  const lv = (a: Alg): Level => levels[a.id] ?? 0;
  const setLv = (a: Alg, l: Level) => {
    levels[a.id] = l;
    save('cube.algs', levels);
  };
  const pool = () => ALGS.filter((a) => a.set === set && (filter === -1 || lv(a) === filter));

  const seg = <T,>(opts: [T, string][], get: () => T, put: (v: T) => void) =>
    h('div', { class: 'seg' }, opts.map(([v, label]) =>
      h('button', { class: get() === v ? 'on' : '', onclick: () => { put(v); render(); } }, label)));

  const body = h('div');
  const bar = h('div', { class: 'row wrap' });
  const el = h('section', { class: 'page algs' }, bar, body);

  function card(a: Alg) {
    const l = lv(a);
    return h(
      'div',
      { class: 'card' },
      topView(caseState(a.alg), a.set, 88),
      h('div', { class: 'card-head' },
        h('b', {}, a.name),
        h('button', {
          class: `lv lv${l}`,
          title: LEVEL_NAME[l],
          onclick: () => { setLv(a, ((l + 1) % 3) as Level); render(); },
        }, LEVEL_NAME[l]),
      ),
      h('div', { class: 'alg' }, a.alg),
    );
  }

  function pick() {
    const p = pool();
    if (!p.length) { current = null; return; }
    const w = p.map((a) => [3, 2, 1][lv(a)]);
    let r = Math.random() * w.reduce((x, y) => x + y, 0);
    let i = 0;
    while ((r -= w[i]) > 0) i++;
    const next = p[Math.min(i, p.length - 1)];
    current = next === current && p.length > 1 ? p[(i + 1) % p.length] : next;
    revealed = false;
  }

  function drill() {
    if (!current || !pool().includes(current)) pick();
    if (!current) return h('div', { class: 'muted pad-y' }, '沒有符合的公式');
    const a = current;
    const answer = (ok: boolean) => {
      setLv(a, ok ? (Math.min(2, lv(a) + 1) as Level) : 1);
      pick();
      render();
    };
    return h(
      'div',
      { class: 'drill' },
      topView(caseState(a.alg), a.set, 200),
      revealed
        ? h('div', { class: 'col' },
            h('b', {}, a.name),
            h('div', { class: 'alg big' }, a.alg),
            h('div', { class: 'row' },
              h('button', { class: 'btn', onclick: () => answer(false) }, '不會'),
              h('button', { class: 'btn primary', onclick: () => answer(true) }, '會')))
        : h('button', { class: 'btn primary', onclick: () => { revealed = true; render(); } }, '顯示公式'),
      h('div', { class: 'muted' }, `${LEVEL_NAME[lv(a)]}`),
    );
  }

  function render() {
    const all = ALGS.filter((a) => a.set === set);
    const known = all.filter((a) => lv(a) === 2).length;
    bar.replaceChildren(
      seg<'OLL' | 'PLL'>([['PLL', 'PLL'], ['OLL', 'OLL']], () => set, (v) => { set = v; current = null; }),
      seg<-1 | Level>([[-1, '全部'], [0, '未學'], [1, '學習中'], [2, '已熟']], () => filter, (v) => { filter = v; current = null; }),
      seg<'list' | 'drill'>([['list', '列表'], ['drill', '練習']], () => mode, (v) => { mode = v; }),
      h('span', { class: 'muted' }, `已熟 ${known}/${all.length}`),
    );
    body.replaceChildren(mode === 'list' ? h('div', { class: 'grid' }, pool().map(card)) : drill());
  }
  render();

  return {
    el,
    show() {},
    hide() {},
    onKey(e) {
      if (mode !== 'drill' || !current) return;
      if (e.code === 'Space' && !revealed) {
        e.preventDefault();
        revealed = true;
        render();
      }
    },
  };
}
