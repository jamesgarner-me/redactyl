# Safari < 17.4 graceful degradation at the model gate

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (Redactyl v1) — see the `### Hosting` section ("Browser compatibility consequence") and [ADR 0001](../../../docs/adr/0001-browser-only-delivery-via-firebase-and-hf-cdn.md).

## What to build

The hosting choice locks the response header `Cross-Origin-Embedder-Policy: credentialless` (forced by the cross-origin HuggingFace CDN fetch — see ADR 0001). `credentialless` is not supported in Safari < 17.4, which means those browsers do not grant `SharedArrayBuffer`, which means the threaded ONNX WASM path used by transformers.js cannot start. Currently the model gate would happily begin a 770 MB download on those browsers and then fail confusingly during inference.

Add a pre-flight check at the model gate: if `globalThis.crossOriginIsolated !== true` (or `typeof SharedArrayBuffer === 'undefined'`), the gate enters a new `unsupported` state instead of `missing`. The user sees a clear advisory (recommended browsers: current Chrome, Firefox, or Safari 17.4+) and the download button is not offered. No model bytes are fetched, no IndexedDB writes, no false-start error toast.

The check fits cleanly into the existing `modelGateReducer` state machine in `src/model/modelGate.ts`: add an `unsupported` state and a `probe_unsupported` event emitted from `useModelGate` during the initial probe.

## Acceptance criteria

- [ ] `useModelGate` probes for `crossOriginIsolated` / `SharedArrayBuffer` before checking the IndexedDB cache and emits `probe_unsupported` when absent
- [ ] `modelGateReducer` handles `probe_unsupported` by transitioning `probing → unsupported`; the state is terminal (no Download button rendered)
- [ ] The UI for `unsupported` names the browsers that work (Chrome, Firefox, Safari 17.4+) and explains why in one sentence, in the same calm tone as the `missing` gate
- [ ] Unit tests cover the new state transition in `modelGateReducer.test.ts`
- [ ] On a Safari 17.3-or-lower user-agent (or with `SharedArrayBuffer` deleted in DevTools), the app loads, shows the advisory, and makes zero model-related network requests

## Blocked by

None — purely client-side; independent of issues 13 and 14, though only meaningful once hosting is live.
