import { useEffect, useRef, useState } from 'react';
import { createDetector, type Detector } from './detection/detector';
import { groupItems } from './domain/items';
import type { Item, Span } from './domain/types';
import { assignTokens } from './redaction/tokeniser';
import { redact } from './redaction/textRedactor';
import { buildMapping, mappingName } from './redaction/mappingExporter';
import { TopBar } from './ui/TopBar';
import { FileDropZone } from './ui/FileDropZone';
import { Analyzing } from './ui/Analyzing';
import { ReviewScreen } from './ui/ReviewScreen';
import { Receipt } from './ui/Receipt';

type Screen =
  | { name: 'dropzone'; error?: string }
  | { name: 'analyzing'; filename: string }
  | { name: 'review'; id: number; filename: string; text: string; items: Item[] }
  | { name: 'redacting'; filename: string }
  | {
      name: 'receipt';
      outputName: string;
      blob: Blob;
      mapping?: { name: string; blob: Blob };
    };

// `notes.txt` -> `notes.redacted.txt`; `notes.md` -> `notes.redacted.md`.
function redactedName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return `${filename}.redacted`;
  return `${filename.slice(0, dot)}.redacted${filename.slice(dot)}`;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'dropzone' });
  const detectorRef = useRef<Detector | null>(null);
  const runIdRef = useRef(0);

  useEffect(() => {
    const detector = createDetector();
    detectorRef.current = detector;
    return () => {
      detector.terminate();
      detectorRef.current = null;
    };
  }, []);

  async function handleFile(file: File) {
    setScreen({ name: 'analyzing', filename: file.name });
    const text = await file.text();
    const spans = await detectorRef.current!.detect(text);
    setScreen({
      name: 'review',
      id: ++runIdRef.current,
      filename: file.name,
      text,
      items: groupItems(spans),
    });
  }

  async function handleRedact(acceptedSpans: Span[], saveMapping: boolean) {
    if (screen.name !== 'review') return;
    const { filename, text } = screen;
    setScreen({ name: 'redacting', filename });
    // Let the redacting screen paint before the (synchronous) rewrite.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const tokens = assignTokens(acceptedSpans);
    const output = redact(text, acceptedSpans, tokens);
    const blob = new Blob([output], { type: 'text/plain' });
    const mapping = saveMapping
      ? {
          name: mappingName(filename),
          blob: new Blob([JSON.stringify(buildMapping(tokens.entries, filename), null, 2)], {
            type: 'application/json',
          }),
        }
      : undefined;
    setScreen({ name: 'receipt', outputName: redactedName(filename), blob, mapping });
  }

  return (
    <div className="app">
      <TopBar />
      <main className="surface">{renderScreen()}</main>
    </div>
  );

  function renderScreen() {
    switch (screen.name) {
      case 'dropzone':
        return (
          <FileDropZone
            onFile={handleFile}
            onReject={(error) => setScreen({ name: 'dropzone', error })}
            error={screen.error}
          />
        );
      case 'analyzing':
        return <Analyzing filename={screen.filename} label="Analyzing…" />;
      case 'redacting':
        return <Analyzing filename={screen.filename} label="Redacting…" />;
      case 'receipt':
        return (
          <Receipt
            outputName={screen.outputName}
            blob={screen.blob}
            mapping={screen.mapping}
            onRedactAnother={() => setScreen({ name: 'dropzone' })}
          />
        );
      case 'review':
        return (
          <ReviewScreen
            key={screen.id}
            filename={screen.filename}
            text={screen.text}
            items={screen.items}
            onRedact={handleRedact}
            onRedactAnother={() => setScreen({ name: 'dropzone' })}
          />
        );
    }
  }
}
