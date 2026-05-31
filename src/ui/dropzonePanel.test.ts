import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Regression guard: the `.dropzone-panel` card chrome (added in "Wrap dropzone in
// landing-style panel") was once silently orphaned — the CSS survived a refactor
// but the className wrapping the model-ready dropzone was dropped, so the styled
// blue card vanished while tests stayed green. This pins the contract that the
// styled class and its usage move together, wherever the wrapper ends up living.
const srcDir = fileURLToPath(new URL('..', import.meta.url));

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

// Every .tsx under src/, concatenated — so the test doesn't care whether the
// wrapper lives in App.tsx or gets extracted into its own component later.
function allTsx(dir: string): string {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return [allTsx(path)];
      return entry.name.endsWith('.tsx') ? [readFileSync(path, 'utf8')] : [];
    })
    .join('\n');
}

describe('dropzone-panel card chrome', () => {
  it('is styled in the stylesheet', () => {
    expect(read('../styles.css')).toMatch(/\.dropzone-panel\s*\{/);
  });

  it('is actually rendered by a component (not an orphaned class)', () => {
    expect(allTsx(srcDir)).toMatch(/className="dropzone-panel"/);
  });
});
