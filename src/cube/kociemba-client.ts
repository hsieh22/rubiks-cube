// 在 Web Worker 裡跑 Kociemba
let worker: Worker | null = null;
let reqId = 0;

export function kociemba(state: string, opts: { timeout?: number; onInit?: () => void } = {}): Promise<string[]> {
  worker ??= new Worker(new URL('./solver-worker.ts', import.meta.url), { type: 'module' });
  const id = ++reqId;
  const w = worker;
  return new Promise((resolve, reject) => {
    const on = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      if (e.data.status === 'init') return opts.onInit?.();
      w.removeEventListener('message', on);
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.moves);
    };
    w.addEventListener('message', on);
    w.postMessage({ id, state, timeout: opts.timeout ?? 1000 });
  });
}
