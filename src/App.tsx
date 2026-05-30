import { useEffect, useMemo, useRef, useState } from 'react';
import { createModelWorker } from './detection/detector';
import { groupItems } from './domain/items';
import {
  formatLocator,
  formatPageLocator,
  itemLines,
  makeLineIndex,
  makePageIndex,
} from './domain/locators';
import type { Item, Span } from './domain/types';
import { assignTokens } from './redaction/tokeniser';
import { redact } from './redaction/textRedactor';
import { buildMapping, mappingName } from './redaction/mappingExporter';
import { extractPdf, type GlyphBox, type PdfSafety } from './pdf/pdfExtractor';
import { redactAndVerifyPdf } from './pdf/pdfRedactor';
import { renderPageToPng } from './pdf/pdfRender';
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

// What the document was extracted from. PDFs carry the per-glyph geometry and
// original bytes needed to redact (blank + black box) and re-verify the output.
type ReviewBase =
  | { source: 'text'; filename: string; text: string }
  | {
      source: 'pdf';
      filename: string;
      text: string;
      glyphs: GlyphBox[];
      bytes: Uint8Array;
      // Set for scanned/garbled PDFs: redaction is blocked and this is shown as
      // a banner. Encrypted PDFs never reach review (blocking error instead).
      warning?: string;
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
      verified?: boolean;
      rasterisedPages?: number[];
    };

// `notes.txt` -> `notes.redacted.txt`; `report.pdf` -> `report.redacted.pdf`.
function redactedName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return `${filename}.redacted`;
  return `${filename.slice(0, dot)}.redacted${filename.slice(dot)}`;
}

// Banner copy for a non-fatal PDF safety issue (scanned/garbled). Both block
// redaction and stress that the file is NOT sanitised.
function safetyMessage(safety: Exclude<PdfSafety, { kind: 'encrypted' }>): string {
  const pages = safety.pages.join(', ');
  const plural = safety.pages.length > 1 ? 's' : '';
  return safety.kind === 'scanned'
    ? `Page${plural} ${pages} appear to be scans with no text layer. v1 doesn't OCR, so this file is NOT sanitised — don't paste it into an AI tool assuming it's clean.`
    : `Page${plural} ${pages} produced unreadable text, so detection can't be trusted. This file is NOT sanitised.`;
}

// Source-specific review locator: page numbers for PDFs, line numbers for text.
function makeLocator(review: ReviewBase): (item: Item) => string {
  if (review.source === 'pdf') {
    const pageAt = makePageIndex(review.glyphs);
    return (item) => formatPageLocator(itemLines(item, pageAt));
  }
  const lineAt = makeLineIndex(review.text);
  return (item) => formatLocator(itemLines(item, lineAt));
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
        const warning = safety ? safetyMessage(safety) : undefined;
        await analyze({ source: 'pdf', filename: file.name, text, glyphs, bytes, warning }, regexEnabled);
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
            warning: screen.warning,
          }
        : { source: 'text', filename: screen.filename, text: screen.text };
    void analyze(base, next);
  }

  async function handleRedact(acceptedSpans: Span[], saveMapping: boolean) {
    if (screen.name !== 'review') return;
    if (screen.source === 'pdf') return redactPdfFile(screen, acceptedSpans);

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

  // True PDF redaction: blank the glyphs + draw black boxes, then re-parse and
  // re-detect. The guarantee is fail-closed — a verification leak blocks the
  // download rather than shipping a still-leaky file (rasterise fallback is a
  // later slice).
  async function redactPdfFile(
    review: Extract<ReviewBase, { source: 'pdf' }>,
    acceptedSpans: Span[],
  ) {
    const { filename, bytes, glyphs, warning } = review;
    // Defence in depth: the UI disables Redact when a safety warning is present,
    // but never produce output for a file we've flagged as unsafe.
    if (warning) return;
    setScreen({ name: 'redacting', filename });
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const outcome = await redactAndVerifyPdf(bytes, acceptedSpans, glyphs, {
        detect: (t) => modelWorker.detector.detect(t, { regex: regexEnabled }),
        renderPage: renderPageToPng,
      });
      if (!outcome.ok) {
        // A leak survived even the rasterise fallback — fail closed.
        setScreen({
          name: 'dropzone',
          error: `Redaction couldn't be verified even after flattening affected pages. No file was produced.`,
        });
        return;
      }
      // Uint8Array.from yields an ArrayBuffer-backed copy (a valid BlobPart);
      // pdf-lib's save() return is typed over the broader ArrayBufferLike.
      const blob = new Blob([Uint8Array.from(outcome.bytes)], { type: 'application/pdf' });
      setScreen({
        name: 'receipt',
        outputName: redactedName(filename),
        blob,
        verified: true,
        rasterisedPages: outcome.rasterisedPages,
      });
    } catch {
      setScreen({ name: 'dropzone', error: 'Could not redact this PDF. No file was produced.' });
    }
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
            verified={screen.verified}
            rasterisedPages={screen.rasterisedPages}
            onRedactAnother={() => setScreen({ name: 'dropzone' })}
          />
        );
      case 'review':
        return (
          <ReviewScreen
            key={screen.id}
            filename={screen.filename}
            items={screen.items}
            locate={makeLocator(screen)}
            allowMapping={screen.source === 'text'}
            safetyWarning={screen.source === 'pdf' ? screen.warning : undefined}
            onRedact={handleRedact}
            onRedactAnother={() => setScreen({ name: 'dropzone' })}
          />
        );
    }
  }
}
