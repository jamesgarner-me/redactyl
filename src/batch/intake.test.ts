import { describe, expect, it } from 'vitest';
import { assessIntake, DEFAULT_FILE_CAP } from './intake';

function file(name: string): File {
  return { name } as File;
}

describe('assessIntake — partition + cap', () => {
  // Core behaviour: all-supported, within-cap drops proceed with nothing to skip
  // (App reads skipped.length === 0 to mean "no modal").
  it('accepts every supported file and skips nothing when within the cap', () => {
    const { accepted, skipped } = assessIntake([
      file('a.pdf'),
      file('b.txt'),
      file('c.md'),
      file('d.csv'),
    ]);
    expect(accepted.map((f) => f.name)).toEqual(['a.pdf', 'b.txt', 'c.md', 'd.csv']);
    expect(skipped).toHaveLength(0);
  });

  // A mixed drop partitions unsupported files into the skip list while keeping
  // the processable ones, preserving order in each bucket.
  it('skips unsupported files and keeps the supported ones', () => {
    const { accepted, skipped } = assessIntake([
      file('a.pdf'),
      file('photo.png'),
      file('b.txt'),
      file('archive.zip'),
    ]);
    expect(accepted.map((f) => f.name)).toEqual(['a.pdf', 'b.txt']);
    expect(skipped).toEqual([
      { filename: 'photo.png', reason: 'unsupported' },
      { filename: 'archive.zip', reason: 'unsupported' },
    ]);
  });

  // Edge case: supported files beyond the soft cap of 10 are skipped as
  // 'over-cap' so the warning lists them alongside unsupported files.
  it('caps supported files at the limit and marks the rest over-cap', () => {
    const files = Array.from({ length: 12 }, (_, i) => file(`doc-${i}.txt`));
    const { accepted, skipped } = assessIntake(files);
    expect(accepted).toHaveLength(DEFAULT_FILE_CAP);
    expect(skipped).toEqual([
      { filename: 'doc-10.txt', reason: 'over-cap' },
      { filename: 'doc-11.txt', reason: 'over-cap' },
    ]);
  });

  // Edge case: an all-unsupported drop yields no accepted files — App uses this
  // (accepted.length === 0) to fall back to the dropzone error, not the modal.
  it('accepts nothing when every file is unsupported', () => {
    const { accepted, skipped } = assessIntake([file('a.png'), file('b.zip')]);
    expect(accepted).toHaveLength(0);
    expect(skipped).toHaveLength(2);
  });
});
