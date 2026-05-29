import { mergeSpans } from './merge';
import { labelledFieldSpans, regexScoredSpans, type CustomPattern } from './patterns';
import { clearNerPipeline, detectNer, loadNerPipeline } from './ner';
import { propagateOccurrences } from './propagate';

// The worker owns the model: the gate's download/probe/clear and the detector's
// inference all run here against one pipeline. Messages are multiplexed by type.
type Incoming =
  | { type: 'load' }
  | { type: 'clear' }
  | {
      type: 'detect';
      id: number;
      text: string;
      customPatterns?: CustomPattern[];
      regex?: boolean;
    };

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
      // NER (only if the model is loaded/loading) plus the regex sweep, which the
      // caller can switch off (Advanced). Regex catches patterned values the model
      // misses in prose, so it's on by default. Merged once either way.
      const regex = msg.regex
        ? [...regexScoredSpans(msg.text, msg.customPatterns), ...labelledFieldSpans(msg.text)]
        : [];
      const ner = await detectNer(msg.text, (processed, total) =>
        post({ type: 'detect-progress', id: msg.id, processed, total }),
      );
      // Propagate each detected value to its every verbatim occurrence, so an
      // entity caught once (in its strongly-contexted field) is masked at the
      // prose/heading occurrences the model misses non-deterministically.
      const detected = [...regex, ...ner];
      const propagated = propagateOccurrences(msg.text, detected);
      post({ type: 'spans', id: msg.id, spans: mergeSpans([...detected, ...propagated]) });
      return;
    }
  }
};
