import { z } from "zod";
import { PageSnapshotSchema } from "./snapshot.js";
import { TargetDescriptorSchema } from "./element.js";
import { EventReportSchema } from "./events.js";

export const GuidanceRequestSchema = z.object({
  apiKey: z.string().min(1),
  /** Existing session to continue; omit to start a new one. */
  sessionId: z.string().optional(),
  /** Flow to run when starting a new session. */
  flowKey: z.string().optional(),
  /** Free-form goal for an AI-generated guide (e.g. the user's chat question). */
  aiGoal: z.string().optional(),
  /** Explicit user navigation; next/back/skip latch manual mode, resume clears it. */
  control: z.enum(["next", "back", "skip", "resume"]).optional(),
  snapshot: PageSnapshotSchema,
  recentEvents: z.array(EventReportSchema).default([]),
});
export type GuidanceRequest = z.infer<typeof GuidanceRequestSchema>;

export const InstructionKindSchema = z.enum([
  "highlight",
  "tooltip",
  "navigate",
  "done",
]);
export type InstructionKind = z.infer<typeof InstructionKindSchema>;

export const InstructionSchema = z.object({
  kind: InstructionKindSchema,
  /** Present for highlight/tooltip; the SDK re-resolves this against the DOM. */
  target: TargetDescriptorSchema.optional(),
  content: z.object({
    title: z.string().optional(),
    body: z.string(),
    cta: z.string().optional(),
  }),
});
export type Instruction = z.infer<typeof InstructionSchema>;

export const GuidanceResponseSchema = z.object({
  sessionId: z.string(),
  stepId: z.string().nullable(),
  stepIndex: z.number().int(),
  totalSteps: z.number().int(),
  /** Whether the active step is waiting on a precondition or ready to act. */
  stepState: z.enum(["waiting", "active"]).optional(),
  /** True when the session is in user-driven manual mode (auto-advance paused). */
  manual: z.boolean().optional(),
  instruction: InstructionSchema,
  confidence: z.number().min(0).max(1),
  mode: z.enum(["ai", "deterministic"]),
  /** Human-readable explanation of the decision (observability). */
  reasoning: z.string().optional(),
});
export type GuidanceResponse = z.infer<typeof GuidanceResponseSchema>;

/**
 * Strict structured output the LLM must return. The model only ever selects an
 * element by id from the candidates we provide — never freeform DOM or selectors.
 */
export const AiDecisionSchema = z.object({
  stepId: z.string(),
  /** Chosen candidate's internal id, or null if none is appropriate. */
  targetElementId: z.string().nullable(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
});
export type AiDecision = z.infer<typeof AiDecisionSchema>;

/**
 * One step of an AI-generated guide. The model picks the next on-screen action
 * toward a free-form goal, choosing an element by id, or signals completion /
 * impossibility. Never emits selectors — only ids from the supplied candidates.
 */
export const AiGuideDecisionSchema = z.object({
  kind: z.enum(["highlight", "done", "not_possible"]),
  /** Candidate id to highlight (required when kind=highlight). */
  targetElementId: z.string().nullable(),
  /** User-facing instruction / message for this step. */
  instruction: z.string(),
  rationale: z.string(),
});
export type AiGuideDecision = z.infer<typeof AiGuideDecisionSchema>;
