import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CLIPBOARD_BLOCKED_HINT,
  PASTED_TEXT_FILENAME,
  hasAnalyzableText,
} from './pasteConstants';
import { PasteScreen } from './PasteScreen';

// No jsdom in this repo — static markup plus exported pure helpers (the existing
// UI-test convention here). Interactive clipboard/clear behaviour is covered
// by the helpers and the initial disabled CTA state.

function render(): string {
  return renderToStaticMarkup(
    createElement(PasteScreen, { onAnalyze: () => {}, onCancel: () => {} }),
  );
}

describe('PasteScreen — structure', () => {
  it('renders a focusable textarea and the paste workflow controls', () => {
    const html = render();
    expect(html).toContain('Paste text');
    expect(html).toContain('<textarea');
    expect(html).toContain('Paste from clipboard');
    expect(html).toContain('Clear');
    expect(html).toContain('Analyze text');
    expect(html).toContain('Cancel');
  });

  it('disables Analyze text when the textarea is empty', () => {
    const html = render();
    expect(html).toContain('Analyze text');
    expect(html).toContain('disabled=""');
  });
});

describe('hasAnalyzableText', () => {
  it('returns false for empty and whitespace-only input', () => {
    expect(hasAnalyzableText('')).toBe(false);
    expect(hasAnalyzableText('   \n\t  ')).toBe(false);
  });

  it('returns true when there is non-whitespace content', () => {
    expect(hasAnalyzableText('hello')).toBe(true);
    expect(hasAnalyzableText('  hello  ')).toBe(true);
  });
});

describe('PasteScreen — clipboard blocked hint', () => {
  it('documents the graceful fallback message for blocked clipboard reads', () => {
    expect(CLIPBOARD_BLOCKED_HINT).toContain('⌘V');
    expect(CLIPBOARD_BLOCKED_HINT).toContain('Ctrl+V');
  });

  it('uses the synthetic pasted-text filename expected by the opener', () => {
    expect(PASTED_TEXT_FILENAME).toBe('pasted-text.txt');
  });
});
