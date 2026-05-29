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

// Rendered only inside the `downloading` branch of ModelGate. The disclaimer
// and the <details> panel are siblings — the disclaimer must stay outside the
// collapsible panel so collapsing the panel can never hide the warning.
export function ProcessExplainer() {
  return (
    <>
      <blockquote className="model-disclaimer">
        <span className="model-disclaimer-icon" aria-hidden="true">
          ⚠
        </span>
        <span>
          “Privacy Filter is a redaction and data minimization aid, not an anonymization,
          compliance, or a safety guarantee.”
          <span className="model-disclaimer-attr">
            OpenAI Privacy Filter model card{' '}
            <a href={MODEL_CARD_URL} target="_blank" rel="noopener noreferrer">
              (link)
            </a>
          </span>
        </span>
      </blockquote>

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

        <div className="model-detail">
          <p className="model-describe">
            openai/privacy-filter is a token-classification model trained to identify personal data
            in text. It runs entirely in this browser (on WebGPU where available, falling back to
            WebAssembly otherwise), so no document content is ever sent anywhere.
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
      </details>
    </>
  );
}
