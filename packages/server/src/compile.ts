import {
  FlowDefinitionSchema,
  type FlowDefinition,
  type MatchCriteria,
  type SemanticElement,
} from "@copilot/shared";
import type { DB } from "./db/connection.js";
import { createFlow, getFlowByKey, type FlowRow } from "./db/repos.js";
import { goalFlowKey, retrieveFlowForGoal, tokens } from "./ai/retrieve.js";
import { toFlowDefinition, type AuthoredFlow } from "./ai/authored-flow.js";
import { toCandidate } from "./ai/select.js";
import { searchKnowledge } from "./knowledge.js";
import type { AiProvider } from "./ai/index.js";
import type { Embedder } from "./ai/embeddings.js";

export type PlanResolution =
  | {
      kind: "flow";
      flowRow: FlowRow;
      def: FlowDefinition;
      source: "retrieval" | "cache" | "compiled" | "reactive";
    }
  | { kind: "infeasible"; reason: string }
  | { kind: "none"; cause: "no_ai" | "authoring_failed" };

/**
 * Deterministic single-step fallback: if the goal names a visible element (every
 * meaningful word of an element's accessible name appears in the goal), guide
 * straight to it — no LLM, instant, and precise. This rescues simple "show me /
 * where is X" goals when full multi-step authoring fails or is overkill (e.g.
 * "view the account menu" when the menu button is right there in the top nav).
 */
/**
 * How strongly a visible element's accessible name matches a goal (0 = no match).
 * Single-word names need that word present; multi-word names need ≥2 shared words.
 * Shared by chat-feasibility and the guide's single-step fallback so the two AGREE
 * — chat never says "doable" for something the guide can't ground, and vice-versa.
 */
export function elementMatchesGoal(goalTokens: Set<string>, el: SemanticElement): number {
  if (!el.visible || !el.name) return 0;
  const nameTokens = tokens(el.name);
  if (nameTokens.length === 0) return 0;
  const shared = nameTokens.filter((t) => goalTokens.has(t)).length;
  if (nameTokens.length === 1) return shared; // single-word: needs that word
  return shared >= 2 ? shared : 0; // multi-word: needs ≥2 shared words
}

function singleStepFor(
  goal: string,
  elements: SemanticElement[],
  key: string,
): FlowDefinition | null {
  const goalTokens = new Set(tokens(goal));
  let best: { el: SemanticElement; score: number } | null = null;
  for (const el of elements) {
    const score = elementMatchesGoal(goalTokens, el);
    if (score > 0 && (!best || score > best.score)) best = { el, score };
  }
  if (!best) return null;
  const el = best.el;
  const match: MatchCriteria = { role: el.role, name: { contains: el.name } };
  if (el.sectionLabel) match.sectionHint = el.sectionLabel;
  if (el.testId) match.testId = el.testId;
  return FlowDefinitionSchema.parse({
    key,
    name: `Find "${el.name}"`,
    version: 1,
    steps: [
      {
        id: "s0",
        goal: `Locate ${el.name}`,
        instruction: `Here it is — "${el.name}".`,
        match,
        advanceOn: { type: "manual" },
        aiAssist: false,
      },
    ],
  });
}

/**
 * Resolve a free-form goal to a runnable plan, cheapest first:
 * authored-flow retrieval → cached AI plan → compile new (ONE authorFlow call,
 * grounded in tenant knowledge) → infeasible / none. Pure resolution: callers
 * own sessions and event emission.
 */
export async function resolvePlanForGoal(
  db: DB,
  tenantId: string,
  goal: string,
  url: string,
  elements: SemanticElement[],
  provider: AiProvider,
  log: { info: (o: unknown, m: string) => void; warn: (o: unknown, m: string) => void },
  embedder?: Embedder | null,
): Promise<PlanResolution> {
  const retrieval = await retrieveFlowForGoal(db, tenantId, goal, embedder);
  let flowRow = retrieval.match?.row ?? getFlowByKey(db, tenantId, goalFlowKey(goal));
  let source: "retrieval" | "cache" | "compiled" = retrieval.match ? "retrieval" : "cache";

  if (!flowRow) {
    // Cheap, precise rescue available in every branch below.
    const single = singleStepFor(goal, elements, goalFlowKey(goal));
    const persistReactive = (def: FlowDefinition): PlanResolution => {
      const row = createFlow(db, tenantId, def, JSON.stringify(def));
      log.info({ goal, flowKey: def.key }, "reactive single-step guide");
      return { kind: "flow", flowRow: row, def, source: "reactive" };
    };

    // A precise single visible-element match (e.g. "go to settings" → the Settings
    // link) is more reliable AND faster than asking the model to author a flow —
    // flash often hallucinates the WRONG target (it guessed "Dashboard" for a
    // settings goal). So prefer it, AFTER authored-flow retrieval above (which
    // still owns real multi-step journeys like "invite a teammate"). Authoring is
    // reserved for genuinely compound goals that don't name one on-page element.
    if (single) return persistReactive(single);

    if (!provider.isAi) return { kind: "none", cause: "no_ai" };

    let authored: AuthoredFlow | null = null;
    try {
      authored = await provider.authorFlow({
        goal,
        url,
        candidates: elements.filter((e) => e.visible && (e.name || e.testId)).map(toCandidate),
        knowledge: [
          ...(await searchKnowledge(db, tenantId, goal, embedder)),
          ...retrieval.knownPaths,
        ],
      });
    } catch (err) {
      log.warn({ err, goal }, "flow authoring failed");
    }

    if (authored && authored.feasible && authored.steps.length > 0) {
      const def = toFlowDefinition(authored, goalFlowKey(goal));
      flowRow = createFlow(db, tenantId, def, JSON.stringify(def));
      source = "compiled";
      log.info({ goal, flowKey: def.key, steps: def.steps.length }, "compiled ai flow");
    } else if (authored && !authored.feasible) {
      return { kind: "infeasible", reason: authored.reason };
    } else {
      return { kind: "none", cause: "authoring_failed" };
    }
  }

  const def = FlowDefinitionSchema.parse(JSON.parse(flowRow.definition_json));
  return { kind: "flow", flowRow, def, source };
}
