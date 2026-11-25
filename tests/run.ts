import { SOLVED, apply, invert, isSolved, parseAlg, randomScramble, relabel, FACELET_POS } from '../src/cube/cube.ts';
import { CORNER_FACELETS, EDGE_FACELETS, toCubie } from '../src/cube/cubie.ts';
import { ALGS, caseState } from '../src/cube/algs.ts';
import { solveLBL, currentStage, STAGES } from '../src/cube/lbl.ts';
import { init, solveState } from '../src/cube/kociemba.ts';
import { faceTarget, gridSize } from '../src/cube/mosaic.ts';
import { solveCFOP, cfopStage, F2L_INVALID } from '../src/cube/cfop.ts';

let fails = 0;
function check(name: string, ok: boolean, info = '') {
  if (!ok) {
    fails++;
    console.log(`✗ ${name} ${info}`);
  }
}

// 幾何：同一塊的貼紙位置相同
for (const f of [...CORNER_FACELETS, ...EDGE_FACELETS]) {
  const ps = f.map((i) => FACELET_POS[i].join(','));
  check('facelet geometry', new Set(ps).size === 1, f.join(','));
}

// 轉動
for (const b of 'URFDLBMESxyzurfdlb') {
  check(`${b}x4`, apply(SOLVED, [b, b, b, b]) === SOLVED);
  check(`${b} ${b}'`, apply(SOLVED, [b, b + "'"]) === SOLVED);
  check(`${b}2`, apply(SOLVED, [b + '2']) === apply(SOLVED, [b, b]));
}
check('Rw = r', apply(SOLVED, 'Rw') === apply(SOLVED, 'r'));
check('r = R M\'', apply(SOLVED, 'r') === apply(SOLVED, "R M'"));
check('x = R M\' L\'', apply(SOLVED, 'x') === apply(SOLVED, "R M' L'"));
check('sexy x6', apply(SOLVED, "R U R' U' ".repeat(6)) === SOLVED);
// R 把 F 面的貼紙送到 U
check('R direction', apply(SOLVED, 'R')[8] === 'F');
check('U direction', apply(SOLVED, 'U')[18] === 'R');

// 塊層級
for (let i = 0; i < 50; i++) {
  const s = apply(SOLVED, randomScramble());
  check('cubie valid', typeof toCubie(s) !== 'string');
}
const twisted = SOLVED.split('');
[twisted[8], twisted[9], twisted[20]] = [twisted[9], twisted[20], twisted[8]];
check('twist detect', typeof toCubie(twisted.join('')) === 'string');

// 公式
const f2l = (s: string) => {
  const t = relabel(s);
  const idx = [27, 28, 29, 30, 31, 32, 33, 34, 35, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 39, 40, 41, 42, 43, 44, 48, 49, 50, 51, 52, 53];
  return idx.every((i) => t[i] === 'URFDLB'[Math.floor(i / 9)]);
};
const TOP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47];
const aufs = ['', 'U', 'U2', "U'"];
const ollKeys = new Set<string>();
const pllKeys = new Map<string, string>();
for (const a of ALGS) {
  let s: string;
  try {
    s = caseState(a.alg);
  } catch (e) {
    check(a.name, false, String(e));
    continue;
  }
  check(`${a.name} F2L`, f2l(s), a.alg);
  check(`${a.name} solves`, isSolved(apply(s, parseAlg(a.alg))) || aufs.some((u) => isSolved(apply(s, [...parseAlg(a.alg), u]))));
  if (a.set === 'OLL') {
    const k = aufs.map((u) => TOP.map((i) => (apply(s, u ? [u] : [])[i] === 'D' ? 1 : 0)).join('')).sort()[0];
    check(`${a.name} not trivial`, !k.startsWith('111111111'));
    check(`${a.name} distinct`, !ollKeys.has(k), a.alg);
    ollKeys.add(k);
  } else {
    check(`${a.name} oriented`, [0, 1, 2, 3, 5, 6, 7, 8].every((i) => s[i] === 'D'));
    const keys: string[] = [];
    for (const u of aufs) for (const y of ['', 'y', 'y2', "y'"]) {
      const t = relabel(apply(apply(s, u ? [u] : []), y ? [y] : []));
      const side = TOP.map((i) => t[i]).join('');
      for (const cyc of [0, 1, 2, 3]) {
        const order = 'FRBL';
        keys.push(side.replace(/[FRBL]/g, (c) => order[(order.indexOf(c) + cyc) % 4]));
      }
    }
    const k = keys.sort()[0];
    check(`${a.name} distinct`, !pllKeys.has(k), `same as ${pllKeys.get(k)}`);
    pllKeys.set(k, a.name);
  }
}
console.log(`OLL ${ollKeys.size}/57  PLL ${pllKeys.size}/21`);

// 層先法
let total = 0;
const N = 300;
let t0 = performance.now();
for (let i = 0; i < N; i++) {
  const s = apply(SOLVED, randomScramble());
  try {
    const st = solveLBL(s);
    let cur = s;
    for (let j = 0; j < st.length; j++) {
      cur = apply(cur, st[j].moves);
      check('stage progress', currentStage(cur) > j, `${STAGES[j].name} ${i}`);
    }
    check('lbl solved', isSolved(cur));
    total += st.reduce((n, x) => n + x.moves.length, 0);
  } catch (e) {
    check('lbl', false, String(e));
  }
}
console.log(`LBL 平均 ${(total / N).toFixed(1)} 步，${((performance.now() - t0) / N).toFixed(1)} ms/次`);

// CFOP
check('f2l algs valid', F2L_INVALID().length === 0, F2L_INVALID().join(' | '));
{
  let tot = 0;
  let f2l = 0;
  const t1 = performance.now();
  for (let i = 0; i < N; i++) {
    const s = apply(SOLVED, randomScramble());
    try {
      const st = solveCFOP(s);
      let cur = s;
      for (let j = 0; j < st.length; j++) {
        cur = apply(cur, st[j].moves);
        check('cfop stage', cfopStage(cur) > j, `${st[j].name} ${i}`);
      }
      check('cfop solved', isSolved(cur));
      tot += st.reduce((n, x) => n + x.moves.length, 0);
      f2l += st.slice(1, 5).reduce((n, x) => n + x.moves.length, 0);
    } catch (e) {
      check('cfop', false, String(e));
    }
  }
  console.log(`CFOP 平均 ${(tot / N).toFixed(1)} 步（F2L ${(f2l / N).toFixed(1)}），${((performance.now() - t1) / N).toFixed(1)} ms/次`);
}

// Kociemba
t0 = performance.now();
init();
console.log(`Kociemba 建表 ${(performance.now() - t0).toFixed(0)} ms`);
let lens = 0;
t0 = performance.now();
const K = 20;
for (let i = 0; i < K; i++) {
  const s = apply(SOLVED, randomScramble());
  const r = solveState(s, { timeout: 300 });
  if (typeof r === 'string') {
    check('kociemba', false, r);
    continue;
  }
  check('kociemba solved', isSolved(apply(s, r)));
  lens += r.length;
}
console.log(`Kociemba 平均 ${(lens / K).toFixed(1)} 步，${((performance.now() - t0) / K).toFixed(0)} ms/次`);
check('kociemba solved cube', JSON.stringify(solveState(SOLVED)) === '[]');
check('invert', apply(apply(SOLVED, "R U F'"), invert(parseAlg("R U F'"))) === SOLVED);

// 馬賽克
for (let i = 0; i < 200; i++) {
  const pat = Array.from({ length: 9 }, () => 'URFDLB'[Math.floor(Math.random() * 6)]).join('');
  const { start, target } = faceTarget(pat);
  check('mosaic face', target.slice(0, 9) === pat, pat);
  check('mosaic valid', typeof toCubie(target) !== 'string', pat);
  if (i < 15) {
    const r = solveState(target, { timeout: 100 });
    check('mosaic solve', typeof r !== 'string' && apply(start, invert(r)) === target, pat);
  }
}
check('grid', gridSize(100, 1).join() === '10,10', gridSize(100, 1).join());
check('grid 16:9', gridSize(144, 16 / 9).join() === '16,9', gridSize(144, 16 / 9).join());

console.log(fails ? `${fails} 項失敗` : '全部通過');
