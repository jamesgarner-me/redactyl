import { describe, expect, it } from 'vitest';
import { ProgressTracker } from './loadProgress';

describe('ProgressTracker', () => {
  it('sums bytes across multiple files into one aggregate', () => {
    const t = new ProgressTracker();
    t.update('config.json', 500, 1000);
    const agg = t.update('tokenizer.json', 1_000_000, 2_000_000);
    expect(agg).toEqual({ file: 'tokenizer.json', loaded: 1_000_500, total: 2_001_000 });
  });

  it('replaces a file’s figure on update rather than double-counting', () => {
    const t = new ProgressTracker();
    t.update('model.onnx_data', 100, 800_000_000);
    const agg = t.update('model.onnx_data', 400_000_000, 800_000_000);
    expect(agg.loaded).toBe(400_000_000);
    expect(agg.total).toBe(800_000_000);
  });

  it('keeps total monotonic as a later, larger file appears', () => {
    const t = new ProgressTracker();
    const small = t.update('config.json', 1000, 1000); // tiny file complete
    const big = t.update('model.onnx_data', 0, 772_000_000); // weights announced
    expect(big.total).toBeGreaterThan(small.total);
    expect(big.loaded).toBe(1000); // small file's bytes retained
  });

  it('reports the most-recently-updated file as the label', () => {
    const t = new ProgressTracker();
    t.update('a.json', 1, 2);
    expect(t.update('b.onnx', 3, 4).file).toBe('b.onnx');
  });
});
