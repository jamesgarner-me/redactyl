import { useEffect, useRef, useState } from 'react';
import { createDetector, type Detector } from './detection/detector';
import { groupItems, itemKey } from './domain/items';
import type { Item } from './domain/types';
import { assignTokens } from './redaction/tokeniser';
import { redact } from './redaction/textRedactor';
import { TopBar } from './ui/TopBar';
import { FileDropZone } from './ui/FileDropZone';
import { Analyzing } from './ui/Analyzing';
import { EntityReviewList } from './ui/EntityReviewList';
import { RedactButton } from './ui/RedactButton';
import { Receipt } from './ui/Receipt';

type Screen =
  | { name: 'dropzone'; error?: string }
  | { name: 'analyzing'; filename: string }
  | { name: 'review'; filename: string; text: string; items: Item[] }
  | { name: 'redacting'; filename: string }
  | { name: 'receipt'; outputName: string; blob: Blob };

// `notes.txt` -> `notes.redacted.txt`; `notes.md` -> `notes.redacted.md`.
function redactedName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return `${filename}.redacted`;
  return `${filename.slice(0, dot)}.redacted${filename.slice(dot)}`;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'dropzone' });
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const detectorRef = useRef<Detector | null>(null);

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
    setExcluded(new Set());
    setScreen({ name: 'review', filename: file.name, text, items: groupItems(spans) });
  }

  async function handleRedact() {
    if (screen.name !== 'review') return;
    const { filename, text, items } = screen;
    setScreen({ name: 'redacting', filename });
    // Let the redacting screen paint before the (synchronous) rewrite.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const acceptedSpans = items
      .filter((item) => !excluded.has(itemKey(item.category, item.value)))
      .flatMap((item) => item.spans);
    const tokens = assignTokens(acceptedSpans);
    const output = redact(text, acceptedSpans, tokens);
    const blob = new Blob([output], { type: 'text/plain' });
    setScreen({ name: 'receipt', outputName: redactedName(filename), blob });
  }

  function toggle(key: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
            onRedactAnother={() => setScreen({ name: 'dropzone' })}
          />
        );
      case 'review':
        return renderReview(screen);
    }
  }

  function renderReview(screen: Extract<Screen, { name: 'review' }>) {
    const { filename, items } = screen;

    if (items.length === 0) {
      return (
        <div className="empty-state">
          <p className="empty-headline">✓ No personal data detected in {filename}</p>
          <p className="empty-caveat">
            Detection isn't perfect — eyeball your file before pasting. No output file is produced.
          </p>
          <button
            type="button"
            className="link-button"
            onClick={() => setScreen({ name: 'dropzone' })}
          >
            Redact another file
          </button>
        </div>
      );
    }

    const accepted = items.filter((item) => !excluded.has(itemKey(item.category, item.value)));
    const occurrenceCount = accepted.reduce((sum, item) => sum + item.spans.length, 0);

    return (
      <div className="review">
        <EntityReviewList items={items} excluded={excluded} onToggle={toggle} />
        <RedactButton
          itemCount={accepted.length}
          occurrenceCount={occurrenceCount}
          onClick={handleRedact}
        />
      </div>
    );
  }
}
