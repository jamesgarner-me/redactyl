// openai/privacy-filter has a 128k-token context and is designed to run WITHOUT
// chunking; its documented weakness is low-context names at boundaries. We chunk
// only to bound browser/WASM memory per forward pass and to report progress — so
// we chunk as coarsely as is safe and never in a way that costs recall:
//
//   • Large chunks. The model's effective (banded) attention is ~257 tokens, so
//     context beyond a chunk barely matters; big chunks just mean fewer risky
//     boundaries.
//   • Line-boundary splits, never mid-line. A name in a heading must never be
//     sliced across chunks (the bug where "Domingo H. Salvatierra" broke at the
//     space and neither half was detected).
//   • Overlap. Adjacent chunks re-include the previous tail so an entity near a
//     boundary still has local context on both sides in at least one chunk.
//     Duplicate detections collapse in mergeSpans.
//
// Kept transformers.js-free so tests can import it directly (like nerSpans).
export interface Chunk {
  // The chunk text, and its start offset in the source so NER spans found within
  // it can be relocated to absolute source positions.
  text: string;
  offset: number;
}

// ~10k chars ≈ 2.5k tokens — only ~2% of the model's 128k context, so this is a
// browser/WASM memory + progress ceiling, NOT a model limit. Tunable here; the
// line-break + overlap mitigations below keep any boundary from costing recall.
const NER_CHUNK_CHARS = 10000;
const NER_OVERLAP_CHARS = 512;

export function chunkText(
  text: string,
  size = NER_CHUNK_CHARS,
  overlap = NER_OVERLAP_CHARS,
): Chunk[] {
  // Blank text has nothing to classify, and feeding the NER pipeline an empty
  // string hangs the worker (no tokens → the forward pass never settles, and the
  // detect handler posts no result). This is reached when verification re-runs on
  // a fully rasterised PDF page, whose flattened content has no text layer.
  if (text.trim().length === 0) return [];
  if (text.length <= size) return [{ text, offset: 0 }];
  const chunks: Chunk[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    if (end < text.length) {
      // Break at the last complete line. Only fall back to a space (then a hard
      // cut) when a single line is itself longer than the whole window.
      const nl = text.lastIndexOf('\n', end);
      if (nl > i) end = nl + 1;
      else {
        const sp = text.lastIndexOf(' ', end);
        if (sp > i) end = sp + 1;
      }
    }
    chunks.push({ text: text.slice(i, end), offset: i });
    if (end >= text.length) break;
    // Step the next chunk back by `overlap`, snapped to a line start, so the
    // boundary region is seen with full context in the following chunk too.
    let next = end - overlap;
    const nl = text.lastIndexOf('\n', next);
    if (nl > i) next = nl + 1;
    if (next <= i) next = end; // never stall or move backwards
    i = next;
  }
  return chunks;
}
