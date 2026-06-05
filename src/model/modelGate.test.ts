import { describe, expect, it } from 'vitest';
import { initialModelState, modelGateReducer, type ModelState } from './modelGate';

const progress = { file: 'onnx/model_quantized.onnx', loaded: 50, total: 100 };

describe('modelGateReducer', () => {
  it('starts in probing', () => {
    expect(initialModelState).toEqual({ name: 'probing' });
  });

  it('cache probe jumps straight to ready', () => {
    expect(modelGateReducer({ name: 'probing' }, { type: 'probe_hit' })).toEqual({ name: 'ready' });
  });

  it('a probe miss shows the gate (missing)', () => {
    expect(modelGateReducer({ name: 'probing' }, { type: 'probe_miss' })).toEqual({
      name: 'missing',
    });
  });

  it('downloads from missing, then reports progress, then becomes ready', () => {
    let state: ModelState = { name: 'missing' };
    state = modelGateReducer(state, { type: 'download_start' });
    expect(state).toEqual({ name: 'downloading', progress: null });
    state = modelGateReducer(state, { type: 'progress', progress });
    expect(state).toEqual({ name: 'downloading', progress });
    state = modelGateReducer(state, { type: 'download_success' });
    expect(state).toEqual({ name: 'ready' });
  });

  it('surfaces a download error and retries back into downloading', () => {
    const errored = modelGateReducer(
      { name: 'downloading', progress },
      { type: 'download_error', message: 'Network error — retry.' },
    );
    expect(errored).toEqual({ name: 'error', message: 'Network error — retry.' });
    expect(modelGateReducer(errored, { type: 'download_start' })).toEqual({
      name: 'downloading',
      progress: null,
    });
  });

  it('cancel returns to the gate (missing)', () => {
    expect(modelGateReducer({ name: 'downloading', progress }, { type: 'cancel' })).toEqual({
      name: 'missing',
    });
  });

  it('re-download from ready re-enters downloading', () => {
    expect(modelGateReducer({ name: 'ready' }, { type: 'download_start' })).toEqual({
      name: 'downloading',
      progress: null,
    });
  });

  it('clear cache returns to the gate from ready', () => {
    expect(modelGateReducer({ name: 'ready' }, { type: 'clear' })).toEqual({ name: 'missing' });
  });

  it('ignores progress and success unless a download is in flight', () => {
    expect(modelGateReducer({ name: 'missing' }, { type: 'progress', progress })).toEqual({
      name: 'missing',
    });
    expect(modelGateReducer({ name: 'ready' }, { type: 'download_success' })).toEqual({
      name: 'ready',
    });
  });

  it('ignores a late probe result once past probing', () => {
    expect(modelGateReducer({ name: 'ready' }, { type: 'probe_miss' })).toEqual({ name: 'ready' });
  });

  it('probe_unsupported transitions probing → unsupported, carrying the reason', () => {
    expect(
      modelGateReducer({ name: 'probing' }, { type: 'probe_unsupported', reason: 'platform' }),
    ).toEqual({ name: 'unsupported', reason: 'platform' });
    expect(
      modelGateReducer({ name: 'probing' }, { type: 'probe_unsupported', reason: 'browser' }),
    ).toEqual({ name: 'unsupported', reason: 'browser' });
  });

  it('unsupported ignores model-lifecycle events', () => {
    const s: ModelState = { name: 'unsupported', reason: 'browser' };
    expect(modelGateReducer(s, { type: 'probe_hit' })).toEqual(s);
    expect(modelGateReducer(s, { type: 'probe_miss' })).toEqual(s);
    expect(modelGateReducer(s, { type: 'download_start' })).toEqual(s);
  });

  it('probe_unsupported from a non-probing state is ignored', () => {
    expect(
      modelGateReducer({ name: 'missing' }, { type: 'probe_unsupported', reason: 'platform' }),
    ).toEqual({ name: 'missing' });
  });
});
