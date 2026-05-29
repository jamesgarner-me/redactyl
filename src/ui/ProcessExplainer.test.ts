import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ModelGate } from './ModelGate';

// Render the model gate's `downloading` state to static HTML and assert the
// explainer contract: the disclaimer is shown, it lives *outside* the
// collapsible <details>, and the seven pipeline stages appear in flow order.
function renderDownloading(): string {
  return renderToStaticMarkup(
    createElement(ModelGate, {
      state: { name: 'downloading', progress: null },
      onDownload: () => {},
      onRetry: () => {},
      onCancel: () => {},
    }),
  );
}

const DISCLAIMER =
  'Privacy Filter is a redaction and data minimization aid, not an anonymization, compliance, or a safety guarantee.';

describe('ProcessExplainer on the downloading screen', () => {
  it('renders the model-author disclaimer verbatim', () => {
    expect(renderDownloading()).toContain(DISCLAIMER);
  });

  it('keeps the disclaimer outside the collapsible <details> panel', () => {
    const html = renderDownloading();
    const detailsInner = html.slice(html.indexOf('<details'), html.indexOf('</details>'));
    expect(detailsInner).not.toContain(DISCLAIMER);
  });

  it('renders the seven pipeline stages in flow order', () => {
    const html = renderDownloading();
    const order = ['File', 'Extract', 'Detect', 'Review', 'Redact', 'Verify', 'Output'].map((s) =>
      html.indexOf(`>${s}<`),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
