# Chunk NER input on line boundaries with overlap, despite the model's 128k context

`openai/privacy-filter` has a **128,000-token context window and is explicitly designed to run without chunking** — feeding it the whole document in one pass is the intended usage. We chunk anyway, but only for two browser-specific reasons, and we shape the chunks so they cost no recall.

The reasons to chunk at all: a single forward pass over a large document in the browser's WASM runtime holds the whole activation set in memory and runs for many seconds with no signal to the user, which reads as a hang; and a one-shot call gives us no progress to report. Chunking bounds per-pass memory and lets us emit per-chunk progress.

The trap we fell into first: a 2,000-char chunker that broke at the **last whitespace** in the window (`Math.max(lastNewline, lastSpace)`). Because the last space is almost always *after* the last newline, it broke mid-line — and sliced a heading name (`## 2.13 Domingo H. Salvatierra`) into `Domingo H. ` at the tail of one chunk and `Salvatierra` at the head of the next. Neither fragment carried enough context for the model (whose *effective* attention is a ~257-token band), so the name was detected in neither chunk and leaked. This is the model's documented worst case — low-context / boundary names — manufactured by our own splitting.

The current strategy (`src/detection/chunk.ts`):

- **Large chunks (10,000 chars ≈ 2.5k tokens, ~2% of the 128k context).** This is a browser/WASM memory + progress ceiling, not a model limit. Context beyond the ~257-token attention band doesn't help the model, so large chunks are quality-neutral and simply reduce the number of risky boundaries. The size is a single named constant (`NER_CHUNK_CHARS`), tunable in one place.
- **Line-boundary splits, never mid-line.** Break at the last `\n` in the window; fall back to a space (then a hard cut) only when a single line is longer than the whole window. A heading or short line is therefore never split.
- **512-char overlap.** The next chunk re-includes the previous tail (snapped to a line start) so an entity sitting at a boundary still has local context on both sides in at least one chunk. Duplicate detections across the overlap collapse in `mergeSpans` (identical/overlapping spans resolve to one), so overlap is free correctness insurance.

## Considered options

- **No chunking — one forward pass, as the model intends.** Best for recall and simplest. Rejected for now purely on browser UX: large files risk an apparent hang and give no progress. Revisit if WebGPU is reliably available (fast enough to not need the memory/progress hedge) or if we move inference off the main story.
- **Small chunks (the original 2,000) split on any whitespace.** Rejected: this is the bug. More boundaries and mid-line cuts, directly attacking the model's weakest case.
- **Sentence/heading-aware segmentation.** More precise boundaries, but markdown-structure parsing is complexity we don't need: line-boundary + overlap already guarantees no entity is split and every entity keeps local context.

## Consequences

- Overlap reprocesses ~5% of the text (512 / 10,000). Acceptable, and it relies on `mergeSpans` to dedupe — so the merge step is now load-bearing for chunk correctness, not only for cross-layer (regex + NER) resolution.
- We are running the transformers.js token-classification pipeline with `aggregation_strategy: 'simple'`, i.e. **per-token argmax**. The reference implementation decodes with a constrained **BIOES Viterbi** pass and a recall-leaning operating point, which the model card credits for boundary stability and recall on mixed-format text. Porting Viterbi (or its transition biases) is the most promising next lever for the remaining low-context misses (e.g. bare names in headings) and for over-fragmented boundaries — tracked as a follow-up.
- The tokenizer must match the model's **tiktoken** byte-level vocab; an offset mismatch would silently corrupt span boundaries. We rely on transformers.js loading the correct tokenizer from the HF repo — worth an explicit check if boundary drift ever appears.
