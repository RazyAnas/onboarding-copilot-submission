import {
  descriptorFromElement,
  planNext,
  type Control,
  type EventReport,
  type FlowDefinition,
  type PlannerState,
  type PlanResult,
  type SemanticElement,
} from "@copilot/shared";
import { selectWithAi, type AiProvider } from "./ai/index.js";

// The deterministic step machine now lives in @copilot/shared/executor (it runs
// locally in the SDK too — single implementation). Re-exported for existing callers.
export { planNext, type Control, type PlannerState, type PlanResult };

/**
 * Deterministic plan + optional AI disambiguation. The deterministic planner does
 * all extraction/ranking/gating; the LLM is consulted ONLY when the step opts in
 * (`aiAssist`) and the deterministic match is genuinely ambiguous. The model picks
 * among the shortlisted candidates by id; on any failure we keep the deterministic
 * choice. This is the locked division of labor — AI reasons, determinism renders.
 */
export async function planGuidance(
  flow: FlowDefinition,
  currentStepId: string | null,
  state: PlannerState,
  elements: SemanticElement[],
  url: string,
  events: EventReport[],
  control: Control | undefined,
  ai: { provider: AiProvider } | undefined,
): Promise<PlanResult> {
  const base = planNext(flow, currentStepId, state, elements, url, events, control);

  const eligible =
    ai?.provider.isAi === true &&
    base.activeStep !== null &&
    base.activeMatch !== null &&
    base.stepState === "active" &&
    base.activeStep.aiAssist &&
    base.ambiguous;

  if (!eligible || !ai) return base;

  const selection = await selectWithAi(ai.provider, {
    step: base.activeStep!,
    match: base.activeMatch!,
    elements,
    url,
    flowName: flow.name,
  });
  if (!selection) return base; // fall back to deterministic

  return {
    ...base,
    instruction: {
      ...base.instruction,
      kind: "highlight",
      target: descriptorFromElement(selection.element, base.activeMatch!),
    },
    confidence: selection.confidence,
    mode: "ai",
    reasoning: `ai(${ai.provider.name}): ${selection.rationale}`,
  };
}
