import {
  AiDecisionSchema,
  rankCandidates,
  specFromCriteria,
  type MatchCriteria,
  type SemanticElement,
} from "@copilot/shared";
import type { AiCandidate, AiProvider } from "./provider.js";

/** Max candidates handed to the model — keeps the prompt bounded and cheap. */
const SHORTLIST_SIZE = 8;

export function toCandidate(el: SemanticElement): AiCandidate {
  return {
    id: el.id,
    role: el.role,
    name: el.name,
    text: el.text,
    section: el.sectionLabel,
    testId: el.testId,
    visible: el.visible,
    enabled: el.enabled,
  };
}

export interface AiSelection {
  element: SemanticElement;
  rationale: string;
  confidence: number;
}

/**
 * Ask the provider to pick the best element for a step, but only from a
 * deterministically-ranked shortlist. Guards against hallucinated ids and any
 * provider error by returning null — the caller then falls back to deterministic.
 */
export async function selectWithAi(
  provider: AiProvider,
  args: {
    step: { id: string; goal: string; instruction: string };
    match: MatchCriteria;
    elements: SemanticElement[];
    url: string;
    flowName: string;
    knowledge?: string[];
  },
): Promise<AiSelection | null> {
  const ranked = rankCandidates(args.elements, specFromCriteria(args.match)).slice(
    0,
    SHORTLIST_SIZE,
  );
  if (ranked.length === 0) return null;
  const candidates = ranked.map((r) => toCandidate(r.element));
  const allowed = new Set(candidates.map((c) => c.id));

  try {
    const decision = await provider.decide({
      goal: args.step.goal,
      instruction: args.step.instruction,
      flowName: args.flowName,
      url: args.url,
      stepId: args.step.id,
      candidates,
      ...(args.knowledge ? { knowledge: args.knowledge } : {}),
    });

    const valid = AiDecisionSchema.safeParse(decision);
    if (!valid.success) return null;
    const id = valid.data.targetElementId;
    if (!id || !allowed.has(id)) return null; // null pick or hallucinated id

    const element = args.elements.find((e) => e.id === id);
    if (!element) return null;
    return { element, rationale: valid.data.rationale, confidence: valid.data.confidence };
  } catch {
    return null; // network/parse/provider failure → deterministic fallback
  }
}
