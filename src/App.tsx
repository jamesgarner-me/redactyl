import { useEffect, useMemo, useRef, useState } from 'react';
import { createModelWorker } from './detection/detector';
import type { Item, Span } from './domain/types';
import { createTextDocument } from './document/textDocument';
import { createDocumentOpener } from './document/opener';
import type { Document } from './document/document';
import { renderPageToPng } from './pdf/pdfRender';
import {
  activeFile,
  createBatch,
  isComplete,
  recordFailure,
  recordSuccess,
  skipActive,
  type Batch,
  type BatchFailure,
  type BatchOutput,
} from './batch/batch';
import { assessIntake, type SkippedFile } from './batch/intake';
import { TopBar } from './ui/TopBar';
import { FileDropZone } from './ui/FileDropZone';
import { IntakeWarningModal } from './ui/IntakeWarningModal';
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
// vs PDF) lives entirely behind the Document seam, never branched here. A Batch
// (held in a ref) drives the loop across multiple files; the receipt lists every
// accumulated output and any files that failed.
type Screen =
  | { name: 'dropzone'; error?: string }
  | { name: 'analyzing'; filename: string; progress?: { processed: number; total: number } }
  | { name: 'review'; id: number; document: Document; items: Item[]; advisory?: string }
  | { name: 'redacting'; filename: string }
  | { name: 'receipt'; outputs: BatchOutput[]; failures: BatchFailure[] };

const ALL_UNSUPPORTED_ERROR =
  'None of these are supported. Redactyl handles .pdf, .txt, .md and .csv.';

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'dropzone' });
  // The gated-intake warning (slice 05): set when a drop mixes processable files
  // with files to skip. Rendered as a modal over the dropzone.
  const [pendingIntake, setPendingIntake] = useState<{
    accepted: File[];
    skipped: SkippedFile[];
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const [regexEnabled, setRegexEnabled] = useRegexDetection();
  const modelWorker = useMemo(() => createModelWorker(), []);
  const model = useModelGate(modelWorker.client);
  const runIdRef = useRef(0);
  // The in-flight Batch. Kept in a ref (not state) so the orchestration reads the
  // latest value synchronously across the async open → review → redact loop; the
  // receipt screen snapshots the accumulated outputs/failures when it's shown.
  const batchRef = useRef<Batch | null>(null);

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

  // Open and analyse the Batch's active file, or — when the Batch is done —
  // present the receipt. An open-time failure (e.g. encrypted PDF) marks the
  // file failed and continues with the rest rather than aborting the Batch.
  async function processNext(batch: Batch) {
    batchRef.current = batch;
    if (isComplete(batch)) {
      setScreen({ name: 'receipt', outputs: [...batch.outputs], failures: [...batch.failures] });
      return;
    }
    const file = activeFile(batch);
    if (!file) return;
    setScreen({ name: 'analyzing', filename: file.name });
    const result = await opener.open(file);
    if (!result.ok) {
      void processNext(recordFailure(batch, { filename: file.name, reason: result.message }));
      return;
    }
    await analyze(result.document);
  }

  // Begin a Batch over the supported, in-cap files chosen at intake.
  function startBatch(files: File[]) {
    void processNext(createBatch(files));
  }

  // Assess a drop/selection up front: proceed silently when everything is
  // processable, warn before skipping anything, or fall back to the dropzone
  // error when nothing is supported. See ADR 0005 / slice 05.
  function handleFiles(files: File[]) {
    const { accepted, skipped } = assessIntake(files);
    if (accepted.length === 0) {
      setScreen({ name: 'dropzone', error: ALL_UNSUPPORTED_ERROR });
      return;
    }
    if (skipped.length === 0) {
      startBatch(accepted);
      return;
    }
    setPendingIntake({ accepted, skipped });
  }

  function goHome() {
    batchRef.current = null;
    setPendingIntake(null);
    setScreen({ name: 'dropzone' });
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

  // Redaction is uniform across sources: ask the Document to redact. A
  // fail-closed outcome (PDF leak, file flagged unsafe) marks the file failed
  // and the Batch continues; a success records the output and advances.
  async function handleRedact(acceptedSpans: Span[], saveMapping: boolean) {
    if (screen.name !== 'review') return;
    const batch = batchRef.current;
    if (!batch) return;
    const doc = screen.document;
    setScreen({ name: 'redacting', filename: doc.filename });
    // Let the redacting screen paint before the (synchronous) text rewrite.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const outcome = await doc.redact(acceptedSpans, { saveMapping });
    if (!outcome.ok) {
      void processNext(recordFailure(batch, { filename: doc.filename, reason: outcome.message }));
      return;
    }
    void processNext(
      recordSuccess(batch, {
        outputName: outcome.outputName,
        blob: outcome.blob,
        mapping: outcome.mapping,
        rasterisedPages: outcome.rasterisedPages,
      }),
    );
  }

  // The review screen's "all clear" affordance. In a single-file Batch this is
  // the terminal step (back to the dropzone, as before); mid multi-file Batch a
  // clean Document produces no output, so advance to the next one.
  function handleReviewDone() {
    const batch = batchRef.current;
    if (batch && batch.files.length > 1) {
      void processNext(skipActive(batch));
      return;
    }
    goHome();
  }

  // Demo mode (?demo): replay the e2e flow from an embedded fixture so the UI
  // can be reviewed without a real file. Builds a text Document so it travels
  // the same path as a real file, wrapped in a Batch of one.
  function loadSample() {
    const sample = sampleReview();
    const doc = createTextDocument(sample.filename, sample.text);
    const file = new File([sample.text], sample.filename, { type: 'text/plain' });
    batchRef.current = createBatch([file]);
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
        onHome={goHome}
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
              <FileDropZone onFiles={handleFiles} error={screen.error} />
            </div>
            {pendingIntake && (
              <IntakeWarningModal
                acceptedCount={pendingIntake.accepted.length}
                skipped={pendingIntake.skipped}
                onContinue={() => {
                  const { accepted } = pendingIntake;
                  setPendingIntake(null);
                  startBatch(accepted);
                }}
                onCancel={goHome}
              />
            )}
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
            outputs={screen.outputs}
            failures={screen.failures}
            onRedactAnother={goHome}
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
            onRedactAnother={handleReviewDone}
          />
        );
    }
  }
}
