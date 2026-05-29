import { useEffect, useMemo, useRef, useState } from 'react';
import { createModelWorker } from './detection/detector';
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
import { SettingsSheet } from './ui/SettingsSheet';
import { ModelGate } from './ui/ModelGate';
import { useTheme } from './ui/useTheme';
import { useRegexDetection } from './ui/useRegexDetection';
import { useModelGate } from './model/useModelGate';
import { isDemoEnabled } from './demo/flag';
import { sampleReview } from './demo/sampleDocument';

type Screen =
  | { name: 'dropzone'; error?: string }
  | { name: 'analyzing'; filename: string; progress?: { processed: number; total: number } }
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const [regexEnabled, setRegexEnabled] = useRegexDetection();
  const modelWorker = useMemo(() => createModelWorker(), []);
  const model = useModelGate(modelWorker.client);
  const runIdRef = useRef(0);

  useEffect(() => () => modelWorker.terminate(), [modelWorker]);

  async function analyze(text: string, filename: string, regex: boolean) {
    setScreen({ name: 'analyzing', filename });
    const spans = await modelWorker.detector.detect(text, {
      regex,
      onProgress: (processed, total) =>
        setScreen((s) => (s.name === 'analyzing' ? { ...s, progress: { processed, total } } : s)),
    });
    setScreen({
      name: 'review',
      id: ++runIdRef.current,
      filename,
      text,
      items: groupItems(spans),
    });
  }

  async function handleFile(file: File) {
    setScreen({ name: 'analyzing', filename: file.name });
    const text = await file.text();
    await analyze(text, file.name, regexEnabled);
  }

  // Toggling regex changes detection, so re-scan the current document to reflect
  // it. The review screen is keyed by run id, so this remounts (state resets).
  function handleToggleRegex() {
    const next = !regexEnabled;
    setRegexEnabled(next);
    if (screen.name === 'review') void analyze(screen.text, screen.filename, next);
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

  // Demo mode (?demo): replay the e2e flow from an embedded fixture so the UI
  // can be reviewed without a real file. Mirrors handleFile's analyzing beat.
  function loadSample() {
    const sample = sampleReview();
    setScreen({ name: 'analyzing', filename: sample.filename });
    setTimeout(() => {
      setScreen({
        name: 'review',
        id: ++runIdRef.current,
        filename: sample.filename,
        text: sample.text,
        items: sample.items,
      });
    }, 600);
  }

  const modelReady = model.state.name === 'ready';

  return (
    <div className="app">
      <TopBar
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
        onHome={() => setScreen({ name: 'dropzone' })}
      />
      <p className="small-screen-advisory" role="note">
        Redactyl works best on desktop. The detector is a small model run in-browser, with a
        one-time 770 MB download and heavy local processing.
      </p>
      <main className="surface">
        {modelReady ? (
          renderScreen()
        ) : (
          <ModelGate
            state={model.state}
            onDownload={model.startDownload}
            onRetry={model.retry}
            onCancel={model.cancel}
          />
        )}
      </main>
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        regexEnabled={regexEnabled}
        onToggleRegex={handleToggleRegex}
        // Recovery actions only make sense once the model is cached.
        onRedownload={
          modelReady
            ? () => {
                setSettingsOpen(false);
                model.startDownload();
              }
            : undefined
        }
        onClearCache={
          modelReady
            ? () => {
                setSettingsOpen(false);
                void model.clearCache();
              }
            : undefined
        }
      />
    </div>
  );

  function renderScreen() {
    switch (screen.name) {
      case 'dropzone':
        return (
          <>
            <FileDropZone
              onFile={handleFile}
              onReject={(error) => setScreen({ name: 'dropzone', error })}
              error={screen.error}
            />
            {isDemoEnabled() && (
              <button type="button" className="demo-button" onClick={loadSample}>
                ▶ Load sample document (demo)
              </button>
            )}
          </>
        );
      case 'analyzing':
        return <Analyzing filename={screen.filename} label="Analyzing…" progress={screen.progress} />;
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
