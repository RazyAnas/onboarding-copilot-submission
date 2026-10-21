import { z } from "zod";
import {
  FlowDefinitionSchema,
  type AdvanceCondition,
  type FlowDefinition,
  type MatchCriteria,
} from "@copilot/shared";

/**
 * FLAT schema the LLM fills in (the Google structured-output path rejects
 * z.union/z.record, so every field is a plain scalar; "" means "not set"). The
 * model emits SEMANTIC criteria — names/sections/testids — never CSS selectors.
 */
export const AuthoredStepSchema = z.object({
  instruction: z.string().describe("Short imperative instruction shown to the user"),
  goal: z.string().describe("Why this step exists"),
  targetRole: z.string().describe("ARIA role of the element to act on: button|link|textbox, or ''"),
  targetName: z.string().describe("Accessible name/label of the element, or ''"),
  targetSection: z.string().describe("Section/landmark the element is in (disambiguates duplicates), or ''"),
  targetTestId: z.string().describe("data-testid of the element if known, or ''"),
  advanceType: z
    .enum(["manual", "navigate", "appear", "fill", "disappear"])
    .describe("How the step completes. Use 'manual' if unsure (the user clicks Next)."),
  advanceUrlContains: z.string().describe("For navigate: a substring of the resulting URL, else ''"),
  advanceName: z.string().describe("For appear/disappear/fill: the element's name, else ''"),
  advanceTestId: z.string().describe("For appear/disappear/fill: the element's testid, else ''"),
});

export const AuthoredFlowSchema = z.object({
  feasible: z.boolean().describe("False if this goal cannot be done in this product/page"),
  reason: z.string().describe("If not feasible, explain briefly; else a one-line summary"),
  title: z.string(),
  steps: z.array(AuthoredStepSchema),
});
export type AuthoredFlow = z.infer<typeof AuthoredFlowSchema>;

function targetMatch(s: z.infer<typeof AuthoredStepSchema>): MatchCriteria {
  const m: MatchCriteria = {};
  if (s.targetTestId) m.testId = s.targetTestId;
  if (s.targetRole) m.role = s.targetRole;
  if (s.targetName) m.name = { contains: s.targetName };
  if (s.targetSection) m.sectionHint = s.targetSection;
  return m;
}

function advanceMatch(s: z.infer<typeof AuthoredStepSchema>): MatchCriteria {
  const m: MatchCriteria = {};
  if (s.advanceTestId) m.testId = s.advanceTestId;
  if (s.advanceName) m.name = { contains: s.advanceName };
  return m;
}

function advanceCondition(s: z.infer<typeof AuthoredStepSchema>): AdvanceCondition {
  switch (s.advanceType) {
    case "navigate":
      return { type: "url", contains: s.advanceUrlContains || "/" };
    case "appear":
      return { type: "elementVisible", match: advanceMatch(s) };
    case "disappear":
      return { type: "elementGone", match: advanceMatch(s) };
    case "fill":
      return { type: "inputFilled", match: targetMatch(s) };
    case "manual":
    default:
      return { type: "manual" };
  }
}

/** Convert the flat AI output into a validated internal FlowDefinition. */
export function toFlowDefinition(authored: AuthoredFlow, key: string): FlowDefinition {
  const steps = authored.steps.map((s, i) => ({
    id: `s${i}`,
    goal: s.goal || s.instruction,
    instruction: s.instruction,
    match: targetMatch(s),
    advanceOn: advanceCondition(s),
    aiAssist: false,
  }));
  return FlowDefinitionSchema.parse({
    key,
    name: authored.title || "Guide",
    version: 1,
    steps,
  });
}
