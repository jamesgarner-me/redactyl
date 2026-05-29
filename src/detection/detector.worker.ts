import { mergeSpans } from './merge';
import { regexScoredSpans, type CustomPattern } from './patterns';
import { clearNerPipeline, detectNer, loadNerPipeline } from './ner';

// The worker owns the model: the gate's download/probe/clear and the detector's
// inference all run here against one pipeline. Messages are multiplexed by type.
type Incoming =
  | { type: 'load' }
  | { type: 'clear' }
  | { type: 'detect'; id: number; text: string; customPatterns?: CustomPattern[] };

const post = (message: unknown) =>
  (self as unknown as { postMessage(m: unknown): void }).postMessage(message);

const TRANSFORMERS_CACHE = 'transformers-cache';

self.onmessage = async (event: MessageEvent<Incoming>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'load':
      try {
        await loadNerPipeline((p) => post({ type: 'progress', ...p }));
        post({ type: 'ready' });
      } catch (err) {
        post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      }
      return;

    case 'clear':
      clearNerPipeline();
      try {
        await caches.delete(TRANSFORMERS_CACHE);
      } catch {
        /* best effort */
      }
      post({ type: 'cleared' });
      return;

    case 'detect': {
      // Regex (sync) + NER (only if the model is loaded/loading), merged once.
      const regex = regexScoredSpans(msg.text, msg.customPatterns);
      const ner = await detectNer(msg.text);
      post({ type: 'spans', id: msg.id, spans: mergeSpans([...regex, ...ner]) });
      return;
    }
  }
};
