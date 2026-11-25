import { COLOR_HEX, SOLVED, apply, invert, randomScramble, type State } from '../cube/cube.ts';
import { toCubie } from '../cube/cubie.ts';
import { kociemba } from '../cube/kociemba-client.ts';
import { STAGES, currentStage, solveLBL, whiteDown } from '../cube/lbl.ts';
import { CFOP_STAGES, cfopStage, findOLL, findPLL, solveCFOP } from '../cube/cfop.ts';
import { caseState, type Alg } from '../cube/algs.ts';
import { CubeView } from '../view/cube3d.ts';
import { h, keyToMove, movePad, net, save, store, topView } from '../view/ui.ts';
import type { Page } from './page.ts';

interface Group { name: string; start: number; end: number; alg?: Alg }
type Algo = 'lbl' | 'cfop' | 'kociemba';
const caseLabel = (a: Alg) => (a.set === 'OLL' ? a.name : `PLL ${a.name}`);

const CFOP_GOAL = [
  '底面拼出白色十字，側面顏色對齊中心',
  '角塊與邊塊配對後放入槽',
  '角塊與邊塊配對後放入槽',
  '角塊與邊塊配對後放入槽',
  '角塊與邊塊配對後放入槽',
  '頂面全黃',
  '頂層歸位',
];

const GOAL = [
  '底面拼出白色十字，側面顏色對齊中心',
  '四個白色角塊放進底層',
  '中層四個邊塊歸位',
  '頂面拼出黃色十字',
  '頂面全黃',
  '頂層四個角塊位置正確',
  '頂層邊塊歸位',
];

export function solverPage(): Page {
  const saved = store<{ state: State; scramble: string[]; history: string[] }>('cube.sim', { state: SOLVED, scramble: [], history: [] });
  let cur: State = saved.state;
  let scramble: string[] = saved.scramble;
  let paint = 'U';
  let algo: Algo = 'lbl';
  let base: State = SOLVED;
  let moves: string[] = [];
  let groups: Group[] = [];
  let pos = 0;
  let playing = false;
  let history: string[] = saved.history;

  const stage = h('div', { class: 'stage' });
  const view = new CubeView(stage, cur);
  const netBox = h('div', { class: 'netbox' });
  const palette = h('div', { class: 'palette' });
  const msg = h('div', { class: 'msg' });
  const algoSeg = h('div', { class: 'seg' });
  const solution = h('div', { class: 'solution' });
  const steps = h('ol', { class: 'steps' });
  const scrEl = h('div', { class: 'alg muted' });
  const histEl = h('div', { class: 'alg' });
  const record = h('div', { class: 'col tight' }, h('div', { class: 'label' }, '打亂'), scrEl, h('div', { class: 'label' }, '紀錄'), histEl);
  const counter = h('span', { class: 'muted' });
  const playBtn = h('button', { class: 'btn', onclick: () => togglePlay() }, '播放');
  const controls = h(
    'div',
    { class: 'row' },
    h('button', { class: 'btn', onclick: () => jump(0) }, '⏮'),
    h('button', { class: 'btn', onclick: () => step(-1) }, '◀'),
    playBtn,
    h('button', { class: 'btn', onclick: () => step(1) }, '▶'),
    h('button', { class: 'btn', onclick: () => jump(moves.length) }, '⏭'),
    counter,
  );
  const pad = movePad(manual);

  const clearSolution = () => {
    moves = [];
    groups = [];
    pos = 0;
    playing = false;
  };

  const setCube = (s: State, scr: string[] = []) => {
    cur = s;
    scramble = scr;
    history = [];
    clearSolution();
    msg.textContent = '';
    view.setState(s);
    render();
  };

  function manual(m: string) {
    if (pos < moves.length && moves[pos] === m) {
      step(1);
      return;
    }
    clearSolution();
    cur = apply(cur, [m]);
    history.push(m);
    view.move(m);
    render();
  }

  function undo() {
    if (moves.length) return step(-1);
    const m = history.pop();
    if (!m) return;
    const inv = invert([m])[0];
    cur = apply(cur, [inv]);
    view.move(inv);
    render();
  }

  function stageNow(): number {
    if (moves.length) {
      const g = groups.findIndex((x) => pos < x.end);
      return g < 0 ? groups.length : g;
    }
    return algo === 'cfop' ? cfopStage(cur) : currentStage(cur);
  }

  // CFOP 的 OLL／PLL 案例
  function caseAt(i: number): Alg | undefined {
    if (moves.length) return groups[i]?.alg;
    const s = apply(cur, whiteDown(cur));
    return i === 5 ? findOLL(s)?.alg : i === 6 ? findPLL(s)?.alg : undefined;
  }

  function renderPalette() {
    palette.replaceChildren(
      ...'URFDLB'.split('').map((c) =>
        h('button', {
          class: `swatch${paint === c ? ' on' : ''}`,
          style: `background:${COLOR_HEX[c]}`,
          onclick: () => { paint = c; renderPalette(); },
        }),
      ),
    );
  }

  function render() {
    save('cube.sim', { state: cur, scramble, history });
    scrEl.textContent = scramble.join(' ');
    histEl.textContent = history.join(' ');
    record.hidden = !scramble.length && !history.length;
    netBox.replaceChildren(
      net(cur, {
        cell: 22,
        onClick: (i) => {
          const a = cur.split('');
          a[i] = paint;
          setCube(a.join(''));
        },
      }),
    );
    algoSeg.replaceChildren(
      ...([['lbl', '層先法'], ['cfop', 'CFOP'], ['kociemba', 'Kociemba']] as const).map(([v, label]) =>
        h('button', { class: algo === v ? 'on' : '', onclick: () => { algo = v; clearSolution(); msg.textContent = ''; render(); } }, label)),
    );
    solution.replaceChildren(
      ...groups.filter((g) => g.end > g.start).map((g) =>
        h('div', { class: 'group' },
              g.name ? h('div', { class: 'label' }, g.name) : null,
              h('div', { class: 'chips' },
                moves.slice(g.start, g.end).map((m, k) => {
                  const i = g.start + k;
                  return h('button', { class: `chip${i < pos ? ' done' : ''}${i === pos ? ' cur' : ''}`, onclick: () => jump(i + 1) }, m);
                }),
              ),
            ),
      ),
    );
    counter.textContent = moves.length ? `${pos} / ${moves.length}` : '';
    playBtn.textContent = playing ? '暫停' : '播放';
    controls.style.display = moves.length ? '' : 'none';

    steps.hidden = algo === 'kociemba';
    if (algo !== 'kociemba') {
      const now = typeof toCubie(cur) !== 'string' ? stageNow() : -1;
      const cfop = algo === 'cfop';
      const names = cfop ? CFOP_STAGES : STAGES.map((s) => s.name);
      steps.replaceChildren(
        ...names.map((name, i) => {
          const c = cfop && i >= 5 && i <= now ? caseAt(i) : undefined;
          const alg = cfop ? c?.alg : STAGES[i].alg;
          return h('li', { class: i < now ? 'done' : i === now ? 'cur' : '' },
            h('div', { class: 'step-name' }, c ? caseLabel(c) : name),
            i === now ? h('div', { class: 'step-goal' }, (cfop ? CFOP_GOAL : GOAL)[i]) : null,
            i === now && c ? topView(caseState(c.alg), c.set, 72) : null,
            i === now && alg ? h('div', { class: 'alg' }, alg) : null,
          );
        }),
      );
      if (now >= names.length) steps.append(h('li', { class: 'cur' }, h('div', { class: 'step-name' }, '完成')));
    }
  }

  function jump(i: number) {
    playing = false;
    pos = Math.max(0, Math.min(moves.length, i));
    cur = apply(base, moves.slice(0, pos));
    view.setState(cur);
    render();
  }

  async function step(d: 1 | -1) {
    let m: string;
    if (d === 1 && pos < moves.length) m = moves[pos++];
    else if (d === -1 && pos > 0) m = invert([moves[--pos]])[0];
    else return;
    cur = apply(cur, [m]);
    render();
    await view.move(m);
  }

  async function togglePlay() {
    if (playing) { playing = false; render(); return; }
    if (pos >= moves.length) jump(0);
    playing = true;
    render();
    while (playing && pos < moves.length) await step(1);
    playing = false;
    render();
  }

  async function solve() {
    const c = toCubie(cur);
    if (typeof c === 'string') { msg.textContent = c; return; }
    msg.textContent = '';
    base = cur;
    let list: string[];
    let gs: Group[];
    try {
      if (algo === 'lbl') {
        const st = solveLBL(base);
        list = st.flatMap((s) => s.moves);
        let k = 0;
        gs = st.map((s, i) => ({ name: STAGES[i].name, start: k, end: (k += s.moves.length) }));
      } else if (algo === 'cfop') {
        const st = solveCFOP(base);
        list = st.flatMap((s) => s.moves);
        let k = 0;
        gs = st.map((s) => ({ name: s.alg ? caseLabel(s.alg) : s.name, start: k, end: (k += s.moves.length), alg: s.alg }));
      } else {
        msg.textContent = '計算中…';
        list = await kociemba(base, { onInit: () => (msg.textContent = '第一次使用，建表中…') });
        gs = [{ name: '', start: 0, end: list.length }];
      }
    } catch (e) {
      msg.textContent = (e as Error).message;
      return;
    }
    if (cur !== base) return; // 計算期間方塊被動過
    moves = list;
    groups = gs;
    msg.textContent = moves.length ? `${moves.length} 步` : '已經是還原狀態';
    jump(0);
  }

  const newScramble = () => {
    const scr = randomScramble();
    setCube(apply(SOLVED, algo === 'kociemba' ? scr : ['z2', ...scr]), scr);
  };

  const el = h(
    'section',
    { class: 'page two' },
    h('div', { class: 'col' }, stage, record, controls, solution),
    h(
      'div',
      { class: 'side' },
      netBox,
      palette,
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn', onclick: newScramble }, '打亂'),
        h('button', { class: 'btn', onclick: () => setCube(SOLVED) }, '重設'),
        h('button', { class: 'btn', onclick: () => undo() }, '上一步'),
      ),
      h('div', { class: 'row' }, algoSeg, h('button', { class: 'btn primary', onclick: solve }, '求解')),
      msg,
      steps,
      pad,
    ),
  );
  renderPalette();
  render();

  return {
    el,
    show: () => view.setActive(true),
    hide: () => { playing = false; view.setActive(false); },
    onKey(e) {
      if (moves.length) {
        if (e.key === 'ArrowRight') return void step(1);
        if (e.key === 'ArrowLeft') return void step(-1);
        if (e.code === 'Space') { e.preventDefault(); return void togglePlay(); }
      }
      const m = keyToMove(e);
      if (m) {
        e.preventDefault();
        manual(m);
      }
    },
  };
}
