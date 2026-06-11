import { useEffect, useMemo, useRef, useState } from 'react';
import { createModelWorker } from './detection/detector';
import type { Item, Span } from './domain/types';
import { createTextDocument } from './document/textDocument';
import { createDocumentOpener } from './document/opener';
import type { Document } from './document/document';
import { renderPageToPng } from './pdf/pdfRender';
import { TopBar } from './ui/TopBar';
import { FileDropZone } from './ui/FileDropZone';
import { DropzoneIntro } from './ui/DropzoneIntro';
import { Analyzing } from './ui/Analyzing';
import { ReviewScreen } from './ui/ReviewScreen';
import { Receipt } from './ui/Receipt';
import { SettingsSheet } from './ui/SettingsSheet';
import { ModelGate } from './ui/ModelGate';
import { PterodactylMark } from './ui/PterodactylMark';
import { useTheme } from './ui/useTheme';
import { useRegexDetection } from './ui/useRegexDetection';
import { useModelGate } from './model/useModelGate';
import { isDemoEnabled } from './demo/flag';
import { sampleReview } from './demo/sampleDocument';

// The screen carries the opened Document straight through review — source (text
// vs PDF) lives entirely behind the Document seam, never branched here.
type Screen =
  | { name: 'dropzone'; error?: string }
  | { name: 'analyzing'; filename: string; progress?: { processed: number; total: number } }
  | { name: 'review'; id: number; document: Document; items: Item[]; advisory?: string }
  | { name: 'redacting'; filename: string }
  | {
      name: 'receipt';
      outputName: string;
      blob: Blob;
      mapping?: { name: string; blob: Blob };
      rasterisedPages?: number[];
    };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'dropzone' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const [regexEnabled, setRegexEnabled] = useRegexDetection();
  const modelWorker = useMemo(() => createModelWorker(), []);
  const model = useModelGate(modelWorker.client);
  const runIdRef = useRef(0);

  // The opener (and the PdfDocuments it builds) is constructed once, but PDF
  // verification must reflect the *current* regex setting — so the detect dep
  // reads a ref, kept in sync with the toggle on every render.
  const regexEnabledRef = useRef(regexEnabled);
  regexEnabledRef.current = regexEnabled;

  useEffect(() => () => modelWorker.terminate(), [modelWorker]);

  const opener = useMemo(
    () =>
      createDocumentOpener({
        detect: (t) => modelWorker.detector.detect(t, { regex: regexEnabledRef.current }),
        renderPage: renderPageToPng,
      }),
    [modelWorker],
  );

  // Detect against the opened Document's text, then enter review carrying the
  // Document so locate/redact/capabilities are read straight off it. Detection
  // returns user-facing Items directly — no grouping step here.
  async function analyze(doc: Document) {
    setScreen({ name: 'analyzing', filename: doc.filename });
    const detected = await modelWorker.detector.detect(doc.text, {
      regex: regexEnabledRef.current,
      onProgress: (processed, total) =>
        setScreen((s) => (s.name === 'analyzing' ? { ...s, progress: { processed, total } } : s)),
    });
    // Let the Document refine the shared detection (CSV fills in names the model
    // missed in name-titled columns and may raise a non-blocking advisory).
    const refined = doc.refineDetection?.(detected);
    const items = refined?.items ?? detected;
    setScreen({
      name: 'review',
      id: ++runIdRef.current,
      document: doc,
      items,
      advisory: refined?.advisory,
    });
  }

  async function handleFile(file: File) {
    setScreen({ name: 'analyzing', filename: file.name });
    const result = await opener.open(file);
    if (!result.ok) {
      setScreen({ name: 'dropzone', error: result.message });
      return;
    }
    await analyze(result.document);
  }

  // Toggling regex changes detection, so re-scan the current Document to reflect
  // it. The review screen is keyed by run id, so this remounts (state resets).
  function handleToggleRegex() {
    const next = !regexEnabled;
    setRegexEnabled(next);
    regexEnabledRef.current = next; // analyze reads the ref synchronously below
    if (screen.name !== 'review') return;
    void analyze(screen.document);
  }

  // Redaction is uniform across sources: ask the Document to redact. The
  // fail-closed cases (PDF leak, file flagged unsafe) come back as an
  // `ok: false` outcome and route to the dropzone error.
  async function handleRedact(acceptedSpans: Span[], saveMapping: boolean) {
    if (screen.name !== 'review') return;
    const doc = screen.document;
    setScreen({ name: 'redacting', filename: doc.filename });
    // Let the redacting screen paint before the (synchronous) text rewrite.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const outcome = await doc.redact(acceptedSpans, { saveMapping });
    if (!outcome.ok) {
      setScreen({ name: 'dropzone', error: outcome.message });
      return;
    }
    setScreen({
      name: 'receipt',
      outputName: outcome.outputName,
      blob: outcome.blob,
      mapping: outcome.mapping,
      rasterisedPages: outcome.rasterisedPages,
    });
  }

  // Demo mode (?demo): replay the e2e flow from an embedded fixture so the UI
  // can be reviewed without a real file. Builds a text Document so it travels
  // the same path as a real file.
  function loadSample() {
    const sample = sampleReview();
    const doc = createTextDocument(sample.filename, sample.text);
    setScreen({ name: 'analyzing', filename: sample.filename });
    setTimeout(() => {
      setScreen({ name: 'review', id: ++runIdRef.current, document: doc, items: sample.items });
    }, 600);
  }

  const modelReady = model.state.name === 'ready';

  return (
    <div className="app">
      <PterodactylMark />
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
            {/* The pre-ready landing's bordered light-blue card chrome wraps the
                intro + the dashed drop target, so the ready screen mirrors the
                homepage rather than dropping onto a bare drop target. */}
            <div className="dropzone-panel">
              <DropzoneIntro />
              <FileDropZone
                onFile={handleFile}
                onReject={(error) => setScreen({ name: 'dropzone', error })}
                error={screen.error}
              />
            </div>
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
            rasterisedPages={screen.rasterisedPages}
            onRedactAnother={() => setScreen({ name: 'dropzone' })}
          />
        );
      case 'review':
        return (
          <ReviewScreen
            key={screen.id}
            filename={screen.document.filename}
            items={screen.items}
            locate={screen.document.locate}
            allowMapping={screen.document.allowMapping}
            safetyWarning={screen.document.safetyWarning}
            advisory={screen.advisory}
            onRedact={handleRedact}
            onRedactAnother={() => setScreen({ name: 'dropzone' })}
          />
        );
    }
  }
}
