import { init, isReady, solveState } from './kociemba.ts';

self.onmessage = (e: MessageEvent<{ id: number; state: string; timeout: number }>) => {
  const { id, state, timeout } = e.data;
  if (!isReady()) {
    self.postMessage({ id, status: 'init' });
    init();
  }
  const r = solveState(state, { timeout });
  self.postMessage(typeof r === 'string' ? { id, error: r } : { id, moves: r });
};
