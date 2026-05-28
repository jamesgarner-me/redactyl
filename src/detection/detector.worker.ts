import { runDetectors } from './patterns';

interface DetectRequest {
  id: number;
  text: string;
}

self.onmessage = (event: MessageEvent) => {
  const { id, text } = event.data as DetectRequest;
  const spans = runDetectors(text);
  (self as unknown as { postMessage(message: unknown): void }).postMessage({ id, spans });
};
