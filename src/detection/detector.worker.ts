import { runDetectors, type CustomPattern } from './patterns';

interface DetectRequest {
  id: number;
  text: string;
  customPatterns?: CustomPattern[];
}

self.onmessage = (event: MessageEvent) => {
  const { id, text, customPatterns } = event.data as DetectRequest;
  const spans = runDetectors(text, customPatterns);
  (self as unknown as { postMessage(message: unknown): void }).postMessage({ id, spans });
};
