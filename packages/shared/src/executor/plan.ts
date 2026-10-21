import type {
  AdvanceCondition,
  EventReport,
  FlowDefinition,
  Instruction,
  MatchCriteria,
  SemanticElement,
  Step,
  TargetDescriptor,
} from "../schemas/index.js";
import { matchText } from "../scoring/text.js";
import { bestMatch, specFromCriteria } from "../scoring/score.js";

/** Minimum match score for an element to count as "present/visible" in a condition. */
const PRESENCE_THRESHOLD = 0.4;
/**
 * Minimum score to actually draw a spotlight. Below this (or when a required
 * sectionHint doesn't match) we show the instruction text WITHOUT a highlight —
 * a wrong highlight is worse than no highlight.
 */
const HIGHLIGHT_THRESHOLD = 0.6;

/** Build a resilient locator from an element, optionally enriched by step criteria. */
export function descriptorFromElement(
  el: SemanticElement,
  match?: MatchCriteria,
): TargetDescriptor {
  const d: TargetDescriptor = {
    internalId: el.id,
    role: el.role,
    name: el.name,
    ancestryHints: [],
    ordinalHint: el.ordinal,
    bboxHint: el.bbox,
  };
  if (el.text) d.text = el.text;
  if (el.testId) d.testId = el.testId;
  if (el.aria.label) d.ariaLabel = el.aria.label;
  const sectionHint = match?.sectionHint ?? el.sectionLabel ?? undefined;
  if (sectionHint) d.sectionHint = sectionHint;
  return d;
}

function sectionMatches(el: SemanticElement, match: MatchCriteria): boolean {
  return (
    !match.sectionHint ||
    matchText(el.sectionLabel ?? "", { contains: match.sectionHint }).matched
  );
}

/**
 * User navigation controls. next/back/skip switch the session into manual mode
 * (the user drives); "resume" hands control back to auto-advance.
 */
export type Control = "next" | "back" | "skip" | "resume";
export interface PlannerState {
  manual?: boolean;
}

function matchedElement(elements: SemanticElement[], match: MatchCriteria) {
  const { best } = bestMatch(elements, specFromCriteria(match), {
    minScore: PRESENCE_THRESHOLD,
  });
  return best?.element ?? null;
}

/** Is a page-state condition satisfied right now? */
function isSatisfied(
  cond: AdvanceCondition,
  elements: SemanticElement[],
  url: string,
  events: EventReport[],
): boolean {
  switch (cond.type) {
    case "url":
      return url.includes(cond.contains);
    case "elementVisible": {
      const el = matchedElement(elements, cond.match);
      return !!el && el.visible;
    }
    case "elementGone": {
      const el = matchedElement(elements, cond.match);
      return !el || !el.visible;
    }
    case "inputFilled": {
      const el = matchedElement(elements, cond.match);
      return !!el && el.filled;
    }
    case "click":
      return events.some((e) => e.type === "click");
    case "manual":
      return events.some((e) => e.type === "step_advanced");
  }
}

export interface PlanResult {
  currentStepId: string | null;
  status: "active" | "completed";
  stepId: string | null;
  stepIndex: number;
  totalSteps: number;
  stepState?: "waiting" | "active";
  manual: boolean;
  instruction: Instruction;
  confidence: number;
  ambiguous: boolean;
  mode: "ai" | "deterministic";
  reasoning: string;
  /** The active step (null when the flow is complete) — for AI disambiguation. */
  activeStep: Step | null;
  /** The criteria used to pick the current target (waiting vs active aware). */
  activeMatch: MatchCriteria | null;
}

/**
 * Deterministic step machine with user control + step gating. THE single executor:
 * the SDK runs it locally every tick (instant guidance, no network), and the server
 * runs the same code for checkpoint validation — one implementation in shared.
 * - `control` next/back/skip moves the pointer explicitly and latches manual mode;
 *   `resume` clears it and lets auto-advance catch up through satisfied steps.
 * - In auto mode it advances through any already-satisfied steps.
 * - A step with an unmet `activateWhen` is "waiting": it shows waitingInstruction
 *   and highlights `waitingMatch` instead of the action target.
 */
export function planNext(
  flow: FlowDefinition,
  currentStepId: string | null,
  state: PlannerState,
  elements: SemanticElement[],
  url: string,
  events: EventReport[],
  control?: Control,
): PlanResult {
  const total = flow.steps.length;
  let manual = state.manual ?? false;

  let idx: number;
  if (currentStepId == null) idx = total;
  else {
    idx = flow.steps.findIndex((s) => s.id === currentStepId);
    if (idx < 0) idx = 0;
  }

  if (control === "resume") manual = false;
  if (control && control !== "resume") {
    manual = true;
    if (control === "back") idx = Math.max(0, idx - 1);
    else idx = Math.min(total, idx + 1); // next / skip
  } else if (!manual) {
    let guard = 0;
    while (idx < total) {
      const step = flow.steps[idx]!;
      if (!isSatisfied(step.advanceOn, elements, url, events) || guard > total) break;
      idx += 1;
      guard += 1;
    }
  }

  if (idx >= total) {
    return {
      currentStepId: null,
      status: "completed",
      stepId: null,
      stepIndex: total,
      totalSteps: total,
      manual,
      instruction: {
        kind: "done",
        content: { title: "All set!", body: `You've completed "${flow.name}".` },
      },
      confidence: 1,
      ambiguous: false,
      mode: "deterministic",
      reasoning: "flow complete",
      activeStep: null,
      activeMatch: null,
    };
  }

  const step = flow.steps[idx]!;

  // Step gating: waiting until activateWhen holds.
  let stepState: "waiting" | "active" = "active";
  let activeMatch: MatchCriteria | undefined = step.match;
  let body = step.instruction;
  if (step.activateWhen && !isSatisfied(step.activateWhen, elements, url, events)) {
    stepState = "waiting";
    body = step.waitingInstruction ?? step.instruction;
    activeMatch = step.waitingMatch;
  }

  const matchResult = activeMatch
    ? bestMatch(elements, specFromCriteria(activeMatch))
    : { best: null, ambiguous: false };
  // Only highlight when we're genuinely confident the right element is present.
  let target: TargetDescriptor | undefined;
  if (matchResult.best && activeMatch) {
    const el = matchResult.best.element;
    const confident =
      matchResult.best.score.total >= HIGHLIGHT_THRESHOLD && sectionMatches(el, activeMatch);
    if (confident) target = descriptorFromElement(el, activeMatch);
  }

  return {
    currentStepId: step.id,
    status: "active",
    stepId: step.id,
    stepIndex: idx,
    totalSteps: total,
    stepState,
    manual,
    instruction: {
      kind: target ? "highlight" : "tooltip",
      ...(target ? { target } : {}),
      content: { title: flow.name, body },
    },
    confidence: matchResult.best ? matchResult.best.score.total : 0,
    ambiguous: matchResult.ambiguous,
    mode: "deterministic",
    reasoning: `${stepState} step ${step.id}${manual ? " (manual)" : ""}`,
    activeStep: step,
    activeMatch: activeMatch ?? null,
  };
}
