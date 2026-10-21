import { z } from "zod";
import { TextMatcherSchema } from "./common.js";

/** Deterministic criteria for selecting a target element among candidates. */
export const MatchCriteriaSchema = z.object({
  role: z.string().optional(),
  name: TextMatcherSchema.optional(),
  text: TextMatcherSchema.optional(),
  testId: z.string().optional(),
  /** Nearest-section label to disambiguate duplicate controls. */
  sectionHint: z.string().optional(),
  /** Expected ordinal among duplicates. */
  ordinal: z.number().int().optional(),
  ancestryHints: z.array(z.string()).optional(),
});
export type MatchCriteria = z.infer<typeof MatchCriteriaSchema>;

/** A page-state condition used both for step completion and for step gating. */
export const AdvanceConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), match: MatchCriteriaSchema }),
  z.object({ type: z.literal("url"), contains: z.string() }),
  z.object({ type: z.literal("elementVisible"), match: MatchCriteriaSchema }),
  z.object({ type: z.literal("elementGone"), match: MatchCriteriaSchema }),
  /** An input/textarea matching `match` has a non-empty value. */
  z.object({ type: z.literal("inputFilled"), match: MatchCriteriaSchema }),
  z.object({ type: z.literal("manual") }),
]);
export type AdvanceCondition = z.infer<typeof AdvanceConditionSchema>;

export const StepSchema = z.object({
  id: z.string(),
  /** Natural-language goal for AI navigation reasoning. */
  goal: z.string(),
  /** Tooltip body shown to the end user when the step is active. */
  instruction: z.string(),
  /** Deterministic target criteria for the action to highlight when active. */
  match: MatchCriteriaSchema,
  advanceOn: AdvanceConditionSchema,
  /**
   * Optional gate: while this condition is NOT satisfied the step is in the
   * "waiting" state — it shows `waitingInstruction` and highlights `waitingMatch`
   * (e.g. an input) instead of the action target. Lets guidance wait for user
   * input before suggesting the next action.
   */
  activateWhen: AdvanceConditionSchema.optional(),
  waitingInstruction: z.string().optional(),
  waitingMatch: MatchCriteriaSchema.optional(),
  /** When true the planner may ask the LLM to disambiguate/recover for this step. */
  aiAssist: z.boolean().default(false),
  /** Explicit next step id; defaults to array order. */
  next: z.string().optional(),
  /** Conditional branches evaluated before the default `next`. */
  branches: z
    .array(z.object({ when: AdvanceConditionSchema, to: z.string() }))
    .optional(),
});
export type Step = z.infer<typeof StepSchema>;

export const FlowDefinitionSchema = z.object({
  key: z.string(),
  name: z.string(),
  version: z.number().int().default(1),
  steps: z.array(StepSchema).min(1),
});
export type FlowDefinition = z.infer<typeof FlowDefinitionSchema>;
