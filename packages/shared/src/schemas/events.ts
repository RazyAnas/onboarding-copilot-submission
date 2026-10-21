import { z } from "zod";

export const EventTypeSchema = z.enum([
  "flow_started",
  "click",
  "route_change",
  "step_advanced",
  "step_skipped",
  "target_lost",
  "flow_completed",
  // Plan-compiler lifecycle (server-emitted): authoring outcomes + cache health.
  "ai_flow_compiled",
  "ai_flow_infeasible",
  "ai_authoring_failed",
  "plan_invalidated",
  "custom",
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const EventReportSchema = z.object({
  sessionId: z.string(),
  type: EventTypeSchema,
  payload: z.record(z.unknown()).optional(),
  at: z.number(),
});
export type EventReport = z.infer<typeof EventReportSchema>;
