import type { AiDecisionInput, AiGuideInput, AuthorFlowInput } from "./provider.js";

/**
 * Build a stable, structured prompt from the provider-neutral input. Deliberately
 * terse and schema-shaped: the model reasons over the semantic candidate list,
 * never raw markup, and must answer by candidate id.
 */
export function buildPrompt(input: AiDecisionInput): string {
  const candidates = input.candidates.map((c) => ({
    id: c.id,
    role: c.role,
    name: c.name,
    text: c.text.slice(0, 80),
    section: c.section,
    testId: c.testId,
    visible: c.visible,
    enabled: c.enabled,
  }));

  return [
    "You guide users through a SaaS onboarding flow.",
    "Select the single best UI element for the current step.",
    "Choose strictly from the candidate list and answer with its `id`.",
    "If no candidate fits, set targetElementId to null.",
    "",
    `Flow: ${input.flowName}`,
    `Step: ${input.stepId}`,
    `Goal: ${input.goal}`,
    `Instruction shown to user: ${input.instruction}`,
    `Page URL: ${input.url}`,
    ...(input.knowledge?.length
      ? ["", "Reference notes:", ...input.knowledge.map((k) => `- ${k}`)]
      : []),
    "",
    "Candidates (JSON):",
    JSON.stringify(candidates, null, 2),
    "",
    'Respond as JSON: { "stepId", "targetElementId", "rationale", "confidence" }.',
    "confidence is 0..1. Prefer visible, enabled elements whose section matches the goal.",
  ].join("\n");
}

/**
 * Prompt for authoring a COMPLETE guide in one call (plan-time compilation).
 * The model sees the goal, retrieved app knowledge, and the current page's
 * candidates, and emits criteria-based steps — semantic names/sections/testids,
 * never live element ids (those are resolved deterministically at run-time).
 */
export function buildAuthorPrompt(input: AuthorFlowInput): string {
  const candidates = input.candidates.map((c) => ({
    role: c.role,
    name: c.name,
    text: c.text.slice(0, 60),
    section: c.section,
    testId: c.testId,
  }));

  return [
    "Author a complete step-by-step in-product guide for the user's goal.",
    `Goal: ${input.goal}`,
    `User is currently on: ${input.url}`,
    ...(input.knowledge.length
      ? ["", "Known app structure and docs (ground every step in these):", ...input.knowledge.map((k) => `- ${k}`)]
      : []),
    "",
    "Interactive elements on the CURRENT page (the guide may start from one of these):",
    JSON.stringify(candidates, null, 2),
    "",
    "Rules:",
    "- Cover the WHOLE journey from the current page to the goal, one action per step.",
    "- Describe targets by accessible name + section (+ testid if shown). Steps on later pages must use names from the known app structure.",
    "- Use advanceType navigate/appear/fill only when the docs make the transition explicit; otherwise 'manual'.",
    "- If the goal cannot be accomplished in this product, set feasible=false and explain.",
  ].join("\n");
}

/**
 * Prompt for one agentic guide step. The model sees the goal, what it has
 * already told the user, retrieved known paths, and the live page candidates —
 * then picks the SINGLE next element to highlight (by id), or done/not_possible.
 */
export function buildGuidePrompt(input: AiGuideInput): string {
  const candidates = input.candidates.map((c) => ({
    id: c.id,
    role: c.role,
    name: c.name,
    text: c.text.slice(0, 60),
    section: c.section,
    testId: c.testId,
  }));

  return [
    "You are a live onboarding guide. Lead the user, one action at a time, toward their goal.",
    `Goal: ${input.goal}`,
    `Current page: ${input.url}`,
    ...(input.knownPaths?.length
      ? ["", "Known paths in this product (use to plan navigation):", ...input.knownPaths.map((k) => `- ${k}`)]
      : []),
    ...(input.history.length
      ? ["", "Steps you already gave the user (do not repeat):", ...input.history.map((h) => `- ${h}`)]
      : []),
    "",
    "Candidate elements on the CURRENT page (choose the next action's element by id):",
    JSON.stringify(candidates, null, 2),
    "",
    "Decide the next step:",
    '- kind "highlight": set targetElementId to a candidate id and write a short instruction (e.g. "Click Settings to open your team").',
    '- kind "done": the goal is already achieved on this page.',
    '- kind "not_possible": this product/page cannot accomplish the goal — explain briefly in instruction.',
    "Only choose an id from the candidate list. Never invent ids or selectors.",
    'Respond as JSON: { "kind", "targetElementId", "instruction", "rationale" }.',
  ].join("\n");
}
