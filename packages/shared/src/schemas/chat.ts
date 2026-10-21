import { z } from "zod";
import { PageSnapshotSchema } from "./snapshot.js";

export const ChatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;

export const ChatRequestSchema = z.object({
  apiKey: z.string().min(1),
  sessionId: z.string().optional(),
  /** Flow context for grounding the answer (used if no session). */
  flowKey: z.string().optional(),
  message: z.string().min(1).max(2000),
  /** Prior conversation turns for continuous, multi-turn chat (bounded). */
  history: z.array(ChatTurnSchema).max(12).default([]),
  /** Optional page context so the assistant can reason about what's on screen. */
  snapshot: PageSnapshotSchema.optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  reply: z.string(),
  mode: z.enum(["ai", "deterministic"]),
  /**
   * True only when the goal is actually doable in this app, so a live guide can
   * be offered. False for infeasible/out-of-scope questions — this is what keeps
   * the answer and the "Guide me" action honest and consistent.
   */
  guidable: z.boolean().default(false),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
