import { useEffect, useMemo, useRef, useState } from 'react';
import { createModelWorker } from './detection/detector';
import { groupItems } from './domain/items';
import type { Item, Span } from './domain/types';
import { createTextDocument } from './document/textDocument';
import { createPdfDocument } from './document/pdfDocument';
import type { Document } from './document/document';
import { extractPdf, type GlyphBox, type PdfSafety } from './pdf/pdfExtractor';
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

// What the document was extracted from. PDFs carry the per-glyph geometry and
// original bytes needed to redact (blank + black box) and re-verify the output,
// plus the raw safety result the PdfDocument turns into a banner. (Folded into
// the Document seam directly in the opener slice; encrypted never reaches here.)
type ReviewBase =
  | { source: 'text'; filename: string; text: string }
  | {
      source: 'pdf';
      filename: string;
      text: string;
      glyphs: GlyphBox[];
      bytes: Uint8Array;
      safety: Exclude<PdfSafety, { kind: 'encrypted' }> | null;
    };

type Screen =
  | { name: 'dropzone'; error?: string }
  | { name: 'analyzing'; filename: string; progress?: { processed: number; total: number } }
  | ({ name: 'review'; id: number; items: Item[] } & ReviewBase)
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

  useEffect(() => () => modelWorker.terminate(), [modelWorker]);

  // Deps the PdfDocument captures to re-verify its own output. `detect` is
  // regex-aware so verification matches the current setting.
  const pdfDeps = {
    detect: (t: string) => modelWorker.detector.detect(t, { regex: regexEnabled }),
    renderPage: renderPageToPng,
  };

  // The opened Document for a review screen — the one place text vs PDF is
  // chosen. Everything downstream (locate, redact, capabilities) reads off it.
  function reviewDocument(s: Extract<Screen, { name: 'review' }>): Document {
    return s.source === 'pdf'
      ? createPdfDocument(
          { filename: s.filename, text: s.text, glyphs: s.glyphs, bytes: s.bytes, safety: s.safety },
          pdfDeps,
        )
      : createTextDocument(s.filename, s.text);
  }

  // Detect against the already-extracted text, then build the review screen,
  // carrying the source-specific context (PDF glyphs + bytes) through unchanged.
  async function analyze(base: ReviewBase, regex: boolean) {
    setScreen({ name: 'analyzing', filename: base.filename });
    const spans = await modelWorker.detector.detect(base.text, {
      regex,
      onProgress: (processed, total) =>
        setScreen((s) => (s.name === 'analyzing' ? { ...s, progress: { processed, total } } : s)),
    });
    setScreen({ name: 'review', id: ++runIdRef.current, items: groupItems(spans), ...base });
  }

  async function handleFile(file: File) {
    setScreen({ name: 'analyzing', filename: file.name });
    try {
      if (/\.pdf$/i.test(file.name)) {
        // Keep the original bytes — extractPdf copies internally (pdfjs neuters
        // its input), so the same buffer feeds redaction later.
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { text, glyphs, safety } = await extractPdf(bytes);
        // Encrypted is fatal: no usable text, so show a blocking error, no list.
        if (safety?.kind === 'encrypted') {
          setScreen({
            name: 'dropzone',
            error: 'This PDF is password-protected. Decrypt it first, then try again.',
          });
          return;
        }
        await analyze(
          { source: 'pdf', filename: file.name, text, glyphs, bytes, safety: safety ?? null },
          regexEnabled,
        );
      } else {
        const text = await file.text();
        await analyze({ source: 'text', filename: file.name, text }, regexEnabled);
      }
    } catch {
      setScreen({
        name: 'dropzone',
        error: `Could not read ${file.name}. It may be encrypted or not a supported PDF.`,
      });
    }
  }

  // Toggling regex changes detection, so re-scan the current document to reflect
  // it. The review screen is keyed by run id, so this remounts (state resets).
  function handleToggleRegex() {
    const next = !regexEnabled;
    setRegexEnabled(next);
    if (screen.name !== 'review') return;
    const base: ReviewBase =
      screen.source === 'pdf'
        ? {
            source: 'pdf',
            filename: screen.filename,
            text: screen.text,
            glyphs: screen.glyphs,
            bytes: screen.bytes,
            safety: screen.safety,
          }
        : { source: 'text', filename: screen.filename, text: screen.text };
    void analyze(base, next);
  }

  // Redaction is now uniform across sources: build the Document and ask it to
  // redact. The fail-closed cases (PDF leak, file flagged unsafe) come back as
  // an `ok: false` outcome and route to the dropzone error.
  async function handleRedact(acceptedSpans: Span[], saveMapping: boolean) {
    if (screen.name !== 'review') return;
    const doc = reviewDocument(screen);
    setScreen({ name: 'redacting', filename: screen.filename });
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
  // can be reviewed without a real file. Mirrors handleFile's analyzing beat.
  function loadSample() {
    const sample = sampleReview();
    setScreen({ name: 'analyzing', filename: sample.filename });
    setTimeout(() => {
      setScreen({
        name: 'review',
        id: ++runIdRef.current,
        source: 'text',
        filename: sample.filename,
        text: sample.text,
        items: sample.items,
      });
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
            <DropzoneIntro />
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
            rasterisedPages={screen.rasterisedPages}
            onRedactAnother={() => setScreen({ name: 'dropzone' })}
          />
        );
      case 'review': {
        const doc = reviewDocument(screen);
        return (
          <ReviewScreen
            key={screen.id}
            filename={screen.filename}
            items={screen.items}
            locate={doc.locate}
            allowMapping={doc.allowMapping}
            safetyWarning={doc.safetyWarning}
            onRedact={handleRedact}
            onRedactAnother={() => setScreen({ name: 'dropzone' })}
          />
        );
      }
    }
  }
}
