import type { AiDecision, AiGuideDecision } from "@copilot/shared";
import type {
  AiChatInput,
  AiDecisionInput,
  AiGuideInput,
  AuthorFlowInput,
  AiProvider,
} from "./provider.js";
import type { AuthoredFlow } from "./authored-flow.js";

/**
 * The deterministic stand-in. Picks the first (already best-ranked) candidate.
 * `isAi=false` means the planner never routes ambiguity through it — it exists so
 * the system always has a provider and "AI off" mode is first-class.
 */
export class DeterministicProvider implements AiProvider {
  readonly name = "deterministic";
  readonly isAi = false;

  async decide(input: AiDecisionInput): Promise<AiDecision> {
    const best = input.candidates[0];
    return {
      stepId: input.stepId,
      targetElementId: best?.id ?? null,
      rationale: "deterministic top-ranked candidate",
      confidence: best ? 0.5 : 0,
    };
  }

  // Never called when isAi=false (the route streams its prebuilt fallback answer),
  // but implemented to satisfy the interface and as a safe default.
  async chat(_input: AiChatInput): Promise<AsyncIterable<string>> {
    return (async function* () {})();
  }

  // Authoring a new flow needs real reasoning; deterministic can't.
  async authorFlow(_input: AuthorFlowInput): Promise<AuthoredFlow> {
    return {
      feasible: false,
      reason: "AI is unavailable, so a custom guide cannot be authored.",
      title: "",
      steps: [],
    };
  }

  // Custom (un-authored) guides need real reasoning; deterministic can't.
  async guide(_input: AiGuideInput): Promise<AiGuideDecision> {
    return {
      kind: "not_possible",
      targetElementId: null,
      instruction: "Custom guides need AI, which is currently unavailable.",
      rationale: "deterministic provider cannot generate ad-hoc guides",
    };
  }
}
