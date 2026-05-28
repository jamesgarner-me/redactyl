import type { Span } from '../domain/types';

interface DetectResponse {
  id: number;
  spans: Span[];
}

// The single externally-callable detection surface. Hides the worker boundary
// behind a promise; later slices add layers inside the worker, not here.
export interface Detector {
  detect(text: string): Promise<Span[]>;
  terminate(): void;
}

export function createDetector(): Detector {
  const worker = new Worker(new URL('./detector.worker.ts', import.meta.url), {
    type: 'module',
  });

  let nextId = 0;
  const pending = new Map<number, (spans: Span[]) => void>();

  worker.onmessage = (event: MessageEvent<DetectResponse>) => {
    const { id, spans } = event.data;
    const resolve = pending.get(id);
    if (resolve) {
      pending.delete(id);
      resolve(spans);
    }
  };

  return {
    detect(text: string) {
      const id = nextId++;
      return new Promise<Span[]>((resolve) => {
        pending.set(id, resolve);
        worker.postMessage({ id, text });
      });
    },
    terminate() {
      worker.terminate();
    },
  };
}
