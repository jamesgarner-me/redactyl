import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DropzoneIntro } from './DropzoneIntro';
import { TopBar } from './TopBar';

// The purpose + privacy promise that the pre-ready landing carries must survive
// onto the model-ready dropzone, in the same order and under the same glossary
// rules (CONTEXT.md: lead with "personal data", never user-facing "strip").
describe('DropzoneIntro', () => {
  const html = renderToStaticMarkup(createElement(DropzoneIntro));

  it('leads with the purpose, then the privacy promise', () => {
    const purpose = html.indexOf('removes personal data');
    const promise = html.indexOf('Nothing leaves your device');
    expect(purpose).toBeGreaterThanOrEqual(0);
    expect(promise).toBeGreaterThan(purpose);
  });

  it('avoids the reserved user-facing verb "strip" and "PII"', () => {
    expect(html.toLowerCase()).not.toContain('strip');
    expect(html).not.toContain('PII');
  });
});

// The persistent header tagline sits above the dropzone, so it lives under the
// same glossary rules as the intro it now complements.
describe('TopBar tagline', () => {
  const html = renderToStaticMarkup(
    createElement(TopBar, {
      theme: 'dark',
      onToggleTheme: () => {},
      onOpenSettings: () => {},
      onHome: () => {},
    }),
  );

  it('names "personal data" and avoids "strip"/"PII"', () => {
    expect(html).toContain('personal data');
    expect(html.toLowerCase()).not.toContain('strip');
    expect(html).not.toContain('PII');
  });
});
