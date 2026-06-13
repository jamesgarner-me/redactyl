import { describe, expect, it } from 'vitest';
import {
  activeFile,
  createBatch,
  isComplete,
  recordFailure,
  recordSuccess,
  skipActive,
  type BatchOutput,
} from './batch';

// The Batch advance logic is the orchestration core (sequencing, pointer,
// accumulated outputs/failures) and is deliberately React-free so it can be
// exercised directly. We model files with a minimal stand-in carrying just the
// `name` the loop reads.
function file(name: string): File {
  return { name } as File;
}

function output(name: string): BatchOutput {
  return { outputName: name, blob: new Blob([name]) };
}

describe('Batch advance logic', () => {
  // Core behaviour: three files worked through in order, each recording one
  // output, leaving the pointer at the end and the outputs in completion order.
  it('sequences through the files, advancing the pointer and accumulating outputs', () => {
    let batch = createBatch([file('a.txt'), file('b.txt'), file('c.txt')]);

    expect(activeFile(batch)?.name).toBe('a.txt');
    expect(isComplete(batch)).toBe(false);

    batch = recordSuccess(batch, output('a.redacted.txt'));
    expect(activeFile(batch)?.name).toBe('b.txt');

    batch = recordSuccess(batch, output('b.redacted.txt'));
    expect(activeFile(batch)?.name).toBe('c.txt');

    batch = recordSuccess(batch, output('c.redacted.txt'));
    expect(isComplete(batch)).toBe(true);
    expect(activeFile(batch)).toBeUndefined();
    expect(batch.outputs.map((o) => o.outputName)).toEqual([
      'a.redacted.txt',
      'b.redacted.txt',
      'c.redacted.txt',
    ]);
    expect(batch.failures).toHaveLength(0);
  });

  // A Batch of one mirrors the single-file flow: one output, immediately complete.
  it('treats a Batch of one like the single-file flow', () => {
    let batch = createBatch([file('only.txt')]);
    batch = recordSuccess(batch, output('only.redacted.txt'));
    expect(isComplete(batch)).toBe(true);
    expect(batch.outputs).toHaveLength(1);
  });

  // Edge case: a failure mid-Batch is quarantined out of the outputs but the
  // loop still advances and the remaining files bundle — the skip-and-continue
  // guarantee from ADR 0005.
  it('keeps failures out of the outputs while continuing the Batch', () => {
    let batch = createBatch([file('a.txt'), file('bad.pdf'), file('c.txt')]);
    batch = recordSuccess(batch, output('a.redacted.txt'));
    batch = recordFailure(batch, { filename: 'bad.pdf', reason: 'encrypted' });
    expect(activeFile(batch)?.name).toBe('c.txt');
    batch = recordSuccess(batch, output('c.redacted.txt'));

    expect(isComplete(batch)).toBe(true);
    expect(batch.outputs.map((o) => o.outputName)).toEqual(['a.redacted.txt', 'c.redacted.txt']);
    expect(batch.failures).toEqual([{ filename: 'bad.pdf', reason: 'encrypted' }]);
  });

  // Edge case: a clean Document (no personal data) advances without recording an
  // output or a failure, so the bundle simply omits it.
  it('skips a clean Document without recording output or failure', () => {
    let batch = createBatch([file('clean.txt'), file('b.txt')]);
    batch = skipActive(batch);
    expect(activeFile(batch)?.name).toBe('b.txt');
    batch = recordSuccess(batch, output('b.redacted.txt'));
    expect(batch.outputs).toHaveLength(1);
    expect(batch.failures).toHaveLength(0);
  });

  // The Auto-redact decision is snapshotted onto the Batch at creation (ADR
  // 0006): attended by default, opt-in via the flag, and it must survive every
  // advance helper so the whole run honours the choice read once at the start.
  it('snapshots the unattended flag at creation and preserves it across advances', () => {
    expect(createBatch([file('a.txt')]).unattended).toBe(false);

    let batch = createBatch([file('a.txt'), file('bad.pdf'), file('c.txt')], true);
    expect(batch.unattended).toBe(true);

    batch = recordSuccess(batch, output('a.redacted.txt'));
    batch = recordFailure(batch, { filename: 'bad.pdf', reason: 'scanned image' });
    batch = skipActive(batch);
    // The flag is unchanged after a success, a failure and a skip.
    expect(batch.unattended).toBe(true);
  });
});
