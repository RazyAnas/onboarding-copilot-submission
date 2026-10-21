import type { DB } from "./db/connection.js";
import { listKnowledge } from "./db/repos.js";
import { tokens } from "./ai/retrieve.js";
import { cosine, type Embedder } from "./ai/embeddings.js";

/** Max knowledge chunks injected into a prompt. */
const TOP_K = 3;
/** Cosine ≥ this counts a chunk as semantically relevant even with no shared words. */
const SEMANTIC_RELEVANT = 0.6;

/**
 * Hybrid retrieval over tenant knowledge chunks (docs/help-center text): keyword
 * overlap PLUS — when an embedder is available — semantic similarity, so a chunk
 * is surfaced when it's lexically OR semantically relevant. With no embedder
 * (AI off) this is exactly the original keyword behavior.
 */
export async function searchKnowledge(
  db: DB,
  tenantId: string,
  query: string,
  embedder?: Embedder | null,
): Promise<string[]> {
  const queryTokens = new Set(tokens(query));
  const rows = listKnowledge(db, tenantId);
  if (rows.length === 0) return [];
  const queryVec = embedder ? await embedder.embed(query) : null;

  const texts = rows.map((row) => `${row.title} ${row.content}`);
  // Embed all chunks in PARALLEL (sequential awaits were stacking seconds).
  const vecs =
    queryVec && embedder
      ? await Promise.all(texts.map((t) => embedder.embed(t)))
      : texts.map(() => null);

  const scored = rows.map((row, i) => {
    const chunkTokens = new Set(tokens(texts[i]!));
    let overlap = 0;
    for (const t of queryTokens) if (chunkTokens.has(t)) overlap += 1;
    const lexical = queryTokens.size > 0 ? overlap / queryTokens.size : 0;
    const cv = vecs[i];
    const semantic = queryVec && cv ? cosine(queryVec, cv) : 0;
    return { row, lexical, semantic, score: Math.max(lexical, semantic) };
  });

  return scored
    .filter((s) => s.lexical > 0 || s.semantic >= SEMANTIC_RELEVANT)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)
    .map((s) => `${s.row.title}: ${s.row.content}`);
}
