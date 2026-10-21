import {
  AiGuideDecisionSchema,
  type Instruction,
  type SemanticElement,
} from "@copilot/shared";
import { descriptorFromElement } from "../target.js";
import { toCandidate } from "./select.js";
import type { AiProvider } from "./provider.js";

/** Max live candidates handed to the model per step. */
const MAX_CANDIDATES = 30;

export interface AiGuideResult {
  instruction: Instruction;
  status: "active" | "completed";
  mode: "ai" | "deterministic";
  confidence: number;
  reasoning: string;
  /** Updated instruction history to persist on the session. */
  history: string[];
}

function tooltip(body: string, title?: string): Instruction {
  return { kind: "tooltip", content: title ? { title, body } : { body } };
}

/**
 * Plan one step of an AI-generated guide toward a free-form goal, grounded in the
 * live page. The model chooses the next element by id from the on-screen
 * candidates (validated here), or signals done / not_possible. Any failure
 * degrades to a safe, non-misleading message — never a hallucinated highlight.
 */
export async function planAiGuide(
  provider: AiProvider,
  args: {
    goal: string;
    url: string;
    elements: SemanticElement[];
    history: string[];
    knownPaths: string[];
  },
): Promise<AiGuideResult> {
  if (!provider.isAi) {
    return {
      instruction: tooltip(
        "Custom guides need AI, which isn't available right now.",
        "Can't guide that here",
      ),
      status: "completed",
      mode: "deterministic",
      confidence: 0,
      reasoning: "no ai provider",
      history: args.history,
    };
  }

  const visible = args.elements.filter((e) => e.visible && (e.name || e.testId));
  const candidates = visible.slice(0, MAX_CANDIDATES).map(toCandidate);
  const allowed = new Map(candidates.map((c) => [c.id, c]));

  let decision;
  try {
    decision = await provider.guide({
      goal: args.goal,
      url: args.url,
      candidates,
      history: args.history,
      knownPaths: args.knownPaths,
    });
  } catch {
    return {
      instruction: tooltip("I couldn't reach the assistant to build that guide. Please try again."),
      status: "completed",
      mode: "deterministic",
      confidence: 0,
      reasoning: "ai error",
      history: args.history,
    };
  }

  const valid = AiGuideDecisionSchema.safeParse(decision);
  if (!valid.success) {
    return {
      instruction: tooltip("I couldn't work out the next step here."),
      status: "completed",
      mode: "ai",
      confidence: 0,
      reasoning: "invalid ai output",
      history: args.history,
    };
  }
  const d = valid.data;

  if (d.kind === "done") {
    return {
      instruction: { kind: "done", content: { title: "Done", body: d.instruction || "You're all set." } },
      status: "completed",
      mode: "ai",
      confidence: 1,
      reasoning: d.rationale,
      history: args.history,
    };
  }

  if (d.kind === "not_possible") {
    return {
      instruction: tooltip(d.instruction, "Can't guide that here"),
      status: "completed",
      mode: "ai",
      confidence: 0,
      reasoning: d.rationale,
      history: args.history,
    };
  }

  // kind === "highlight": the id must be one of the live candidates.
  if (!d.targetElementId || !allowed.has(d.targetElementId)) {
    return {
      instruction: tooltip(d.instruction || "Looking for the next step…"),
      status: "active",
      mode: "ai",
      confidence: 0,
      reasoning: "ai picked no valid on-screen element",
      history: args.history,
    };
  }

  const el = args.elements.find((e) => e.id === d.targetElementId)!;
  return {
    instruction: {
      kind: "highlight",
      target: descriptorFromElement(el),
      content: { title: "Guide", body: d.instruction },
    },
    status: "active",
    mode: "ai",
    confidence: 0.9,
    reasoning: d.rationale,
    history: [...args.history, d.instruction].slice(-8),
  };
}
