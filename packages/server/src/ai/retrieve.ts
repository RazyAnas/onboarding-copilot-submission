import { FlowDefinitionSchema, type FlowDefinition } from "@copilot/shared";
import type { DB } from "../db/connection.js";
import { listAuthoredFlows, type FlowRow } from "../db/repos.js";
import { cosine, type Embedder } from "./embeddings.js";

const STOPWORDS = new Set([
  "the", "a", "an", "to", "how", "do", "i", "can", "my", "me", "is", "in", "on",
  "of", "for", "and", "with", "you", "your", "please", "want", "need", "help",
]);

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => !STOPWORDS.has(t));
}

/**
 * Normalized cache key for AI-authored flows: same goal phrased with the same
 * meaningful words hits the cache instead of re-authoring. (Embedding-based
 * keying is the planned upgrade; lexical normalization is the v1.)
 */
export function goalFlowKey(goal: string): string {
  const t = [...new Set(tokens(goal))].sort();
  return `ai:${t.join("-").slice(0, 80) || "goal"}`;
}

/** The text whose embedding represents a flow's INTENT (name + step goals). */
export function flowIntentText(def: FlowDefinition): string {
  return [def.name, ...def.steps.map((s) => s.goal)].join(". ");
}

/**
 * Pre-embed the whole corpus (flow intents + knowledge chunks) at startup so the
 * FIRST user query hits a warm cache instead of paying ~2s of embedding latency.
 * Fire-and-forget; embeds are parallel and memoized in the embedder.
 */
export async function warmRetrieval(db: DB, embedder: Embedder | null): Promise<void> {
  if (!embedder) return;
  const flowRows = db
    .prepare("SELECT definition_json FROM flows WHERE key NOT LIKE 'ai:%'")
    .all() as { definition_json: string }[];
  const knowRows = db.prepare("SELECT title, content FROM knowledge").all() as {
    title: string;
    content: string;
  }[];
  const texts = [
    ...flowRows.map((r) => flowIntentText(FlowDefinitionSchema.parse(JSON.parse(r.definition_json)))),
    ...knowRows.map((r) => `${r.title} ${r.content}`),
  ];
  await Promise.all(texts.map((t) => embedder.embed(t)));
}

export interface FlowRetrieval {
  /** Best-matching authored flow, if confident enough to run deterministically. */
  match: { row: FlowRow; def: FlowDefinition } | null;
  /** One-line summaries of all flows — fed to the AI as "known paths". */
  knownPaths: string[];
}

/**
 * Cosine ≥ this counts as a confident semantic (same-intent) flow match. Set from
 * measured data (gemini-embedding-001): same-intent paraphrases score 0.70–0.83,
 * unrelated goals 0.44–0.56 — 0.65 separates them cleanly with margin.
 */
const SEMANTIC_MATCH = 0.65;

/**
 * Hybrid retrieval over authored flows (the RAG step): lexical token overlap
 * PLUS — when an embedder is available — semantic similarity, so paraphrases
 * ("add a colleague" → the invite flow) match even with no shared keywords.
 * Confident if the goal is lexically strong OR semantically clearly the same
 * intent. With no embedder (AI off), it's exactly the original lexical behavior.
 */
export async function retrieveFlowForGoal(
  db: DB,
  tenantId: string,
  goal: string,
  embedder?: Embedder | null,
): Promise<FlowRetrieval> {
  const goalTokens = new Set(tokens(goal));
  const rows = listAuthoredFlows(db, tenantId); // never scan ai:* cache → bounded
  const queryVec = embedder ? await embedder.embed(goal) : null;

  let best:
    | { row: FlowRow; def: FlowDefinition; lexical: number; semantic: number; combined: number }
    | null = null;
  const knownPaths: string[] = [];

  const parsed = rows.map((row) => {
    const def = FlowDefinitionSchema.parse(JSON.parse(row.definition_json));
    // Lexical wants every keyword; semantic wants INTENT — so embed the name +
    // step goals (what the flow achieves), not the click-by-click instructions,
    // which are UI noise that dilutes the intent signal.
    const flowText = [def.name, ...def.steps.map((s) => `${s.goal} ${s.instruction}`)].join(" ");
    return { row, def, flowText, flowIntent: flowIntentText(def) };
  });
  // Embed all flow intents in PARALLEL (sequential awaits were stacking seconds).
  const flowVecs =
    queryVec && embedder
      ? await Promise.all(parsed.map((p) => embedder.embed(p.flowIntent)))
      : parsed.map(() => null);

  for (let i = 0; i < parsed.length; i += 1) {
    const { row, def, flowText } = parsed[i]!;
    const flowTokens = new Set(tokens(flowText));
    let overlap = 0;
    for (const t of goalTokens) if (flowTokens.has(t)) overlap += 1;
    const lexical = goalTokens.size > 0 ? overlap / goalTokens.size : 0;

    const fv = flowVecs[i];
    const semantic = queryVec && fv ? cosine(queryVec, fv) : 0;
    const combined = Math.max(lexical, semantic);

    knownPaths.push(
      `To ${def.name.toLowerCase()}: ${def.steps.map((s) => s.instruction).join(" → ")}`,
    );
    if (!best || combined > best.combined) best = { row, def, lexical, semantic, combined };
  }

  const confident =
    !!best && ((best.lexical >= 0.4 && goalTokens.size >= 2) || best.semantic >= SEMANTIC_MATCH);
  return {
    match: confident ? { row: best!.row, def: best!.def } : null,
    knownPaths,
  };
}
