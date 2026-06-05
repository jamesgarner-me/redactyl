import { describe, it, expect } from 'vitest';
import { chunkText } from './chunk';

describe('chunkText', () => {
  it('returns a single zero-offset chunk for text within the limit', () => {
    expect(chunkText('hello world', 2000)).toEqual([{ text: 'hello world', offset: 0 }]);
  });

  it('yields no chunks for blank text, so NER is never run on an empty string', () => {
    // A fully rasterised PDF page re-extracts to empty text; an empty NER forward
    // pass hangs the worker, so an empty document must produce zero model calls.
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\t ')).toEqual([]);
  });

  it('splits on line boundaries, leaving every line intact', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line ${i} has a few words here`);
    const chunks = chunkText(lines.join('\n'), 120, 0);
    for (const line of lines) {
      expect(chunks.some((c) => c.text.includes(line))).toBe(true);
    }
  });

  it('never splits a name in a heading across a boundary (the Salvatierra bug)', () => {
    // The window lands inside the heading line; the old space-break sliced the
    // name into "Domingo H. " | "Salvatierra". Line-breaking must keep it whole.
    const text = `${'x'.repeat(180)}\n## 2.13 Domingo H. Salvatierra\nbody text follows here\n`;
    const chunks = chunkText(text, 200, 0);
    expect(chunks.some((c) => c.text.includes('Domingo H. Salvatierra'))).toBe(true);
    expect(chunks.some((c) => /Domingo H\.\s*$/.test(c.text))).toBe(false);
  });

  it('keeps offsets anchored: slice(offset) returns the chunk text', () => {
    const text = Array.from({ length: 60 }, (_, i) => `entry number ${i}`).join('\n');
    for (const c of chunkText(text, 80, 16)) {
      expect(text.slice(c.offset, c.offset + c.text.length)).toBe(c.text);
    }
  });

  it('covers every source character with no gaps', () => {
    const text = Array.from({ length: 60 }, (_, i) => `entry number ${i}`).join('\n');
    const chunks = chunkText(text, 80, 16);
    expect(chunks[0].offset).toBe(0);
    for (let k = 1; k < chunks.length; k++) {
      // Each chunk starts no later than the previous one ended → no gap.
      expect(chunks[k].offset).toBeLessThanOrEqual(
        chunks[k - 1].offset + chunks[k - 1].text.length,
      );
    }
    const last = chunks[chunks.length - 1];
    expect(last.offset + last.text.length).toBe(text.length);
  });

  it('overlaps adjacent chunks so boundary text appears in both', () => {
    const text = Array.from({ length: 30 }, (_, i) => `paragraph ${i} content`).join('\n');
    const chunks = chunkText(text, 100, 40);
    const overlapped = chunks.some(
      (c, k) => k > 0 && c.offset < chunks[k - 1].offset + chunks[k - 1].text.length,
    );
    expect(overlapped).toBe(true);
  });

  it('hard-cuts when a single line exceeds the window', () => {
    expect(chunkText('x'.repeat(25), 10, 0).map((c) => c.text)).toEqual([
      'xxxxxxxxxx',
      'xxxxxxxxxx',
      'xxxxx',
    ]);
  });
});
