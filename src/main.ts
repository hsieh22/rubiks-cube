import './style.css';
import { algsPage } from './pages/algs.ts';
import type { Page } from './pages/page.ts';
import { mosaicPage } from './pages/mosaic.ts';
import { solverPage } from './pages/solver.ts';
import { timerPage } from './pages/timer.ts';

const ROUTES: { id: string; label: string; make: () => Page }[] = [
  { id: 'timer', label: '計時器', make: timerPage },
  { id: 'cube', label: '模擬器/求解', make: solverPage },
  { id: 'algs', label: '公式', make: algsPage },
  { id: 'mosaic', label: '馬賽克', make: mosaicPage },
];

const app = document.getElementById('app')!;
const tabs = document.getElementById('tabs')!;
const pages = new Map<string, Page>();
let active: Page | null = null;

for (const r of ROUTES) {
  const a = document.createElement('a');
  a.href = `#/${r.id}`;
  a.textContent = r.label;
  a.dataset.id = r.id;
  tabs.append(a);
}

function route() {
  const id = location.hash.replace('#/', '') || ROUTES[0].id;
  const r = ROUTES.find((x) => x.id === id) ?? ROUTES[0];
  let p = pages.get(r.id);
  if (!p) {
    p = r.make();
    pages.set(r.id, p);
    app.append(p.el);
  }
  if (active && active !== p) {
    active.hide();
    active.el.hidden = true;
  }
  p.el.hidden = false;
  p.show();
  active = p;
  for (const a of tabs.querySelectorAll('a')) a.classList.toggle('on', a.dataset.id === r.id);
}

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
};
window.addEventListener('keydown', (e) => {
  if (!typing(e) && !(e.target instanceof HTMLButtonElement && e.code === 'Enter')) active?.onKey?.(e);
});
window.addEventListener('keyup', (e) => {
  if (!typing(e)) active?.onKeyUp?.(e);
});
// 空白鍵不要觸發按鈕
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target instanceof HTMLButtonElement) e.preventDefault();
}, true);

window.addEventListener('hashchange', route);
route();
