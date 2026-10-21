import { embed } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { AiConfig } from "../config.js";

/**
 * Semantic retrieval signal (hybrid RAG). Research is clear that keyword + vector
 * beats either alone — embeddings catch synonyms/paraphrase ("add a colleague" ≈
 * "invite teammate") that token-overlap misses, while keyword keeps precision on
 * exact names. So this is ADDITIVE: callers combine cosine() with their lexical
 * score and fall back to lexical-only when no embedder is available (AI off).
 */
export interface Embedder {
  /** Embed a text; null on any failure so callers degrade to lexical retrieval. */
  embed(text: string): Promise<number[] | null>;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const EMBED_MODEL = process.env.AI_EMBED_MODEL ?? "gemini-embedding-001";

/**
 * Build an embedder from AI config; null when AI is off (no key) — which keeps
 * deterministic mode and the whole test suite on the existing lexical path with
 * zero behavior change. Embeddings are memoized per text (the corpus is tiny and
 * queries repeat), so each unique string costs one API call per process.
 */
/**
 * Max cached embeddings. The corpus is small + sticky; the churn is unique user
 * QUERIES, so an LRU cap bounds memory (else every query's 3072-dim vector would
 * be cached forever — a slow leak). At ~25KB/vector this caps the cache near 50MB.
 */
const CACHE_MAX = 2000;

export function createEmbedder(config: AiConfig): Embedder | null {
  if (config.provider === "none" || !config.apiKey) return null;
  const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
  const model = google.textEmbeddingModel(EMBED_MODEL);
  // Map preserves insertion order → reuse it as an LRU (re-insert on hit, evict
  // the oldest key once over the cap).
  const cache = new Map<string, number[] | null>();
  const remember = (key: string, value: number[] | null) => {
    cache.set(key, value);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  };
  return {
    async embed(text: string): Promise<number[] | null> {
      const key = text.slice(0, 500);
      if (cache.has(key)) {
        const hit = cache.get(key)!;
        cache.delete(key);
        cache.set(key, hit); // mark most-recently-used
        return hit;
      }
      try {
        const { embedding } = await embed({ model, value: key });
        remember(key, embedding);
        return embedding;
      } catch {
        remember(key, null); // don't retry a failing string; fall back to lexical
        return null;
      }
    },
  };
}
