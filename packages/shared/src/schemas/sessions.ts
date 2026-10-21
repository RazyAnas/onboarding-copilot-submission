import { z } from "zod";
import { PageSnapshotSchema } from "./snapshot.js";
import { FlowDefinitionSchema } from "./flow.js";
import { EventReportSchema } from "./events.js";

/**
 * The M9 runtime-split API: the server resolves/compiles a plan ONCE and ships
 * it whole to the SDK, which executes it locally (shared executor) and posts
 * async checkpoints. No per-step server round trips.
 */

export const SessionStartRequestSchema = z.object({
  apiKey: z.string().min(1),
  /** Start a pre-authored flow… */
  flowKey: z.string().optional(),
  /** …or resolve/compile a plan for a free-form goal. */
  aiGoal: z.string().optional(),
  snapshot: PageSnapshotSchema,
});
export type SessionStartRequest = z.infer<typeof SessionStartRequestSchema>;

export const SessionStartResponseSchema = z.object({
  /** "flow": run the returned plan locally. "answer": no guided plan — show text. */
  kind: z.enum(["flow", "answer"]),
  sessionId: z.string().optional(),
  flow: FlowDefinitionSchema.optional(),
  stepId: z.string().nullable().optional(),
  manual: z.boolean().optional(),
  /** How the plan was resolved (observability): retrieval | cache | compiled. */
  source: z.string().optional(),
  /** For kind="answer": the honest text response (infeasible / AI unavailable). */
  answer: z.string().optional(),
});
export type SessionStartResponse = z.infer<typeof SessionStartResponseSchema>;

export const SessionResumeResponseSchema = z.object({
  sessionId: z.string(),
  flow: FlowDefinitionSchema,
  stepId: z.string().nullable(),
  status: z.enum(["active", "completed"]),
  manual: z.boolean(),
});
export type SessionResumeResponse = z.infer<typeof SessionResumeResponseSchema>;

export const CheckpointRequestSchema = z.object({
  apiKey: z.string().min(1),
  stepId: z.string().nullable(),
  status: z.enum(["active", "completed"]),
  manual: z.boolean(),
  /** Buffered user/engine events since the last checkpoint (incl. target_lost). */
  events: z.array(EventReportSchema).max(50).default([]),
});
export type CheckpointRequest = z.infer<typeof CheckpointRequestSchema>;
