const MODEL_CARD_URL = 'https://huggingface.co/openai/privacy-filter';

// The seven-stage pipeline, in flow order, each with a one-line summary of what
// happens there. `Detect` is compound: it runs a pattern (regex) layer and a
// local AI-model layer — the AI model is the layer being fetched on this screen.
const STAGES = [
  { label: 'File', desc: 'Your PDF or text file, opened in the browser.' },
  { label: 'Extract', desc: 'Pull the raw text out of the file.' },
  { label: 'Detect', desc: 'Scan that text for anything that looks personal.' },
  { label: 'Review', desc: 'You confirm or dismiss each item found.' },
  { label: 'Redact', desc: 'Accepted items are swapped for safe tokens.' },
  { label: 'Verify', desc: 'Re-check the output for anything left behind.' },
  { label: 'Output', desc: 'Download your sanitised copy.' },
] as const;

const FACTS = [
  ['Model', 'openai/privacy-filter'],
  ['Detects', 'people, addresses, account numbers'],
  ['Runtime', 'in this browser'],
  ['Size', '770 MB (quantised)'],
] as const;

// The model-author disclaimer. Shown in BOTH the describe and downloading views
// of the modal — it must never be hidden inside a collapsible panel (it's a
// safety caveat, not fill-the-wait detail).
export function ModelDisclaimer() {
  return (
    <blockquote className="model-disclaimer">
      <span>
        Privacy Filter is a redaction and data minimization aid, not an anonymization, compliance,
        or a safety guarantee.
        <span className="model-disclaimer-attr">
          -- OpenAI Privacy Filter model card{' '}
          <a href={MODEL_CARD_URL} target="_blank" rel="noopener noreferrer">
            (link)
          </a>
        </span>
      </span>
    </blockquote>
  );
}

// Decision-support shown in the modal's describe view, BEFORE the user commits
// to the 770 MB download: what the model is, that it runs locally, and the one
// outbound request it makes (the HuggingFace CDN disclosure — issue 16). The HF
// fetch passes COEP `require-corp` via the CDN's CORS headers (see ADR 0001), so
// the disclosure stays simple — no CORP caveat.
export function ModelDescription() {
  return (
    <div className="model-detail">
      <p className="model-describe">
        Redactyl detects personal data with <code>openai/privacy-filter</code>, a small open model
        that runs entirely in your browser — on your GPU where available, otherwise your CPU. It is
        downloaded once from <strong>huggingface.co</strong> (the only network request Redactyl ever
        makes) and cached on this device. After that, your files are processed with no network at
        all.
      </p>

      <dl className="model-facts">
        {FACTS.map(([term, value]) => (
          <div key={term} className="model-fact">
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Fill-the-wait content for the downloading view: the seven-stage pipeline,
// collapsed by default. Decision-support (ModelDescription) has already been
// read in the describe view, so this is purely "while you wait, here's the flow".
export function ProcessPipeline() {
  return (
    <details className="model-explainer">
      <summary>How does this process work?</summary>

      <div
        className="pipeline"
        role="img"
        aria-label="Pipeline flow: File, then Extract, then Detect (which runs a pattern layer and a local AI-model layer), then Review, Redact, Verify, and Output."
      >
        {STAGES.map((stage) =>
          stage.label === 'Detect' ? (
            <div key={stage.label} className="pipeline-node pipeline-detect">
              <span className="pipeline-label">Detect</span>
              <span className="pipeline-desc">{stage.desc}</span>
              <div className="pipeline-subnodes">
                <span className="pipeline-subnode">
                  <span className="pipeline-sublabel">Patterns</span>
                  <span className="pipeline-subdesc">Rules catch emails, numbers, IDs.</span>
                </span>
                <span className="pipeline-subnode pipeline-ner">
                  <span className="pipeline-sublabel">Local AI model</span>
                  <span className="pipeline-subdesc">Reads context to spot names and addresses.</span>
                </span>
              </div>
            </div>
          ) : (
            <div key={stage.label} className="pipeline-node">
              <span className="pipeline-label">{stage.label}</span>
              <span className="pipeline-desc">{stage.desc}</span>
            </div>
          ),
        )}
      </div>
    </details>
  );
}
