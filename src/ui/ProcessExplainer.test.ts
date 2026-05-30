import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ModelGate, canDismissModal } from './ModelGate';
import type { ModelState } from '../model/modelGate';

// The modal's content is always mounted (switched by `state`), so static markup
// reflects whichever view the given state selects — no DOM/jsdom needed.
function render(state: ModelState): string {
  return renderToStaticMarkup(
    createElement(ModelGate, {
      state,
      onDownload: () => {},
      onRetry: () => {},
      onCancel: () => {},
    }),
  );
}

const DISCLAIMER =
  'Privacy Filter is a redaction and data minimization aid, not an anonymization, compliance, or a safety guarantee.';

describe('model modal — downloading view', () => {
  const html = render({ name: 'downloading', progress: null });

  it('renders the model-author disclaimer verbatim', () => {
    expect(html).toContain(DISCLAIMER);
  });

  it('keeps the disclaimer outside the collapsible <details> panel', () => {
    const detailsInner = html.slice(html.indexOf('<details'), html.indexOf('</details>'));
    expect(detailsInner).not.toContain(DISCLAIMER);
  });

  it('renders the seven pipeline stages in flow order', () => {
    const order = ['File', 'Extract', 'Detect', 'Review', 'Redact', 'Verify', 'Output'].map((s) =>
      html.indexOf(`>${s}<`),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe('model modal — describe view (missing)', () => {
  const html = render({ name: 'missing' });

  it('discloses HuggingFace as the model source and the sole outbound request', () => {
    expect(html).toContain('huggingface.co');
    expect(html).toContain('only network request');
  });

  it('shows the disclaimer here too, and never inside a <details>', () => {
    expect(html).toContain(DISCLAIMER);
    expect(html).not.toContain('<details'); // describe view has no collapsible panel
  });

  it('offers the download action', () => {
    expect(html).toContain('Download model');
  });
});

describe('landing card', () => {
  it('leads with the purpose, then the privacy promise, then Get Started', () => {
    const html = render({ name: 'missing' });
    const purpose = html.indexOf('removes personal data');
    const promise = html.indexOf('Nothing leaves your device');
    const cta = html.indexOf('Get Started');
    expect(purpose).toBeGreaterThanOrEqual(0);
    expect(promise).toBeGreaterThan(purpose);
    expect(cta).toBeGreaterThan(promise);
  });

  it('avoids the reserved user-facing verb "strip"', () => {
    expect(render({ name: 'missing' }).toLowerCase()).not.toContain('strip');
  });
});

describe('canDismissModal', () => {
  it('blocks dismissal only while downloading', () => {
    expect(canDismissModal({ name: 'downloading', progress: null })).toBe(false);
    expect(canDismissModal({ name: 'missing' })).toBe(true);
    expect(canDismissModal({ name: 'error', message: 'x' })).toBe(true);
  });
});
