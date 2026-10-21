import type { AiDecision, AiGuideDecision } from "@copilot/shared";
import type { AuthoredFlow } from "./authored-flow.js";

/**
 * A compact, provider-neutral view of one candidate element. This is the ONLY
 * shape the LLM ever sees — derived deterministically from the semantic graph,
 * never raw DOM. The model selects among these by `id`.
 */
export interface AiCandidate {
  id: string;
  role: string;
  name: string;
  text: string;
  section: string | null;
  testId: string | null;
  visible: boolean;
  enabled: boolean;
}

/** Everything a provider needs to make a pick-by-id decision for one step. */
export interface AiDecisionInput {
  goal: string;
  instruction: string;
  flowName: string;
  url: string;
  stepId: string;
  candidates: AiCandidate[];
  /** Optional doc/knowledge snippets to ground the decision (future use). */
  knowledge?: string[];
}

/**
 * The seam that keeps us un-coupled from any single vendor. Swapping Gemini for
 * another model/company means adding one implementation of this interface.
 */
/** A free-form chat turn, grounded in pre-built page/flow context. */
export interface AiChatInput {
  message: string;
  /** Structured, model-neutral context (flow steps, on-screen actions, etc.). */
  context: string;
  /** Prior conversation turns for multi-turn continuity. */
  history?: { role: "user" | "assistant"; content: string }[];
}

/**
 * One agentic guide step for a free-form goal — the JIT-repair path. The compiled
 * (authorFlow) path is preferred; this runs only when authoring fails or a
 * compiled step cannot be grounded on the live page.
 */
export interface AiGuideInput {
  goal: string;
  url: string;
  candidates: AiCandidate[];
  /** Instructions already given to the user (avoid repeats). */
  history: string[];
  /** One-line summaries of authored flows, grounding navigation. */
  knownPaths: string[];
}

/** Everything needed to author a full guide for a free-form goal, in one call. */
export interface AuthorFlowInput {
  goal: string;
  url: string;
  /** Interactive elements on the page the user is currently looking at. */
  candidates: AiCandidate[];
  /** Retrieved app knowledge (routes/sections/actions) to ground navigation. */
  knowledge: string[];
}

export interface AiProvider {
  /** Identifier for logging/telemetry, e.g. "gemini-2.5-pro" or "deterministic". */
  readonly name: string;
  /** True for real LLM backends; false for the deterministic stand-in. */
  readonly isAi: boolean;
  /** Choose the best candidate by id (or null). Implementations must validate output. */
  decide(input: AiDecisionInput): Promise<AiDecision>;
  /**
   * Answer a user question grounded in the provided context, STREAMING tokens so
   * the UI feels instant (low time-to-first-token). Must ground strictly in the
   * context and abstain ("not available here") rather than invent steps — but
   * feasibility for offering a live guide is decided by the route from real
   * grounding, not self-reported here.
   */
  chat(input: AiChatInput): Promise<AsyncIterable<string>>;
  /** Author a complete, criteria-based guide for a goal in one structured call. */
  authorFlow(input: AuthorFlowInput): Promise<AuthoredFlow>;
  /** Plan ONE next step toward a goal from live candidates (repair/fallback path). */
  guide(input: AiGuideInput): Promise<AiGuideDecision>;
}
