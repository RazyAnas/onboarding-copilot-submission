import type { SemanticElement, TargetDescriptor } from "../schemas/element.js";
import type { MatchCriteria } from "../schemas/flow.js";
import type { TextMatcher } from "../schemas/common.js";
import { matchText, normalizeText } from "./text.js";

/**
 * Unified internal match spec. Both TargetDescriptor (server→SDK) and
 * MatchCriteria (flow authoring) are normalized into this so the scoring
 * function has a single shape to reason about.
 */
export interface MatchSpec {
  internalId?: string;
  role?: string;
  name?: TextMatcher;
  text?: TextMatcher;
  testId?: string;
  ariaLabel?: string;
  sectionHint?: string;
  ordinal?: number;
  ancestryHints?: string[];
  bboxHint?: { x: number; y: number; width: number; height: number };
}

export function specFromDescriptor(t: TargetDescriptor): MatchSpec {
  const spec: MatchSpec = { role: t.role, name: t.name, ancestryHints: t.ancestryHints };
  if (t.internalId !== undefined) spec.internalId = t.internalId;
  if (t.text !== undefined) spec.text = t.text;
  if (t.testId !== undefined) spec.testId = t.testId;
  if (t.ariaLabel !== undefined) spec.ariaLabel = t.ariaLabel;
  if (t.sectionHint !== undefined) spec.sectionHint = t.sectionHint;
  if (t.ordinalHint !== undefined) spec.ordinal = t.ordinalHint;
  if (t.bboxHint !== undefined) spec.bboxHint = t.bboxHint;
  return spec;
}

export function specFromCriteria(c: MatchCriteria): MatchSpec {
  const spec: MatchSpec = {};
  if (c.role !== undefined) spec.role = c.role;
  if (c.name !== undefined) spec.name = c.name;
  if (c.text !== undefined) spec.text = c.text;
  if (c.testId !== undefined) spec.testId = c.testId;
  if (c.sectionHint !== undefined) spec.sectionHint = c.sectionHint;
  if (c.ordinal !== undefined) spec.ordinal = c.ordinal;
  if (c.ancestryHints !== undefined) spec.ancestryHints = c.ancestryHints;
  return spec;
}

/** Per-signal weights. Higher = more reliable / discriminating. */
const WEIGHTS = {
  testId: 1.0,
  internalId: 0.7,
  name: 0.9,
  ariaLabel: 0.8,
  text: 0.6,
  role: 0.5,
  section: 0.5,
  ordinal: 0.3,
  ancestry: 0.3,
  bbox: 0.15,
} as const;

export interface ScoreBreakdown {
  /** Normalized 0..1 score after applying state multipliers. */
  total: number;
  /** Raw contribution per signal (for debugging/observability). */
  signals: Record<string, number>;
}

function bboxProximity(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const acx = a.x + a.width / 2;
  const acy = a.y + a.height / 2;
  const bcx = b.x + b.width / 2;
  const bcy = b.y + b.height / 2;
  const dist = Math.hypot(acx - bcx, acy - bcy);
  // 0px apart → 1, ~800px apart → ~0.
  return Math.max(0, 1 - dist / 800);
}

/**
 * Score a candidate element against a match spec. Only signals the spec actually
 * specifies contribute to the denominator, so a sparse spec (e.g. role+name) is
 * not penalized for omitting bbox/section. Visibility/enabled apply as soft
 * multipliers — a hidden element can still match but ranks below a visible one.
 */
export function scoreCandidate(el: SemanticElement, spec: MatchSpec): ScoreBreakdown {
  let num = 0;
  let denom = 0;
  const signals: Record<string, number> = {};

  const add = (key: keyof typeof WEIGHTS, matched: boolean, strength = 1) => {
    const w = WEIGHTS[key];
    denom += w;
    const contribution = matched ? w * strength : 0;
    num += contribution;
    signals[key] = contribution;
  };

  if (spec.testId !== undefined) add("testId", el.testId === spec.testId);
  if (spec.internalId !== undefined) add("internalId", el.id === spec.internalId);
  if (spec.role !== undefined) add("role", el.role === spec.role);
  if (spec.name !== undefined) {
    const r = matchText(el.name, spec.name);
    add("name", r.matched, r.strength);
  }
  if (spec.ariaLabel !== undefined) {
    add("ariaLabel", normalizeText(el.aria.label ?? "") === normalizeText(spec.ariaLabel));
  }
  if (spec.text !== undefined) {
    const r = matchText(el.text, spec.text);
    add("text", r.matched, r.strength);
  }
  if (spec.sectionHint !== undefined) {
    const r = matchText(el.sectionLabel ?? "", { contains: spec.sectionHint });
    add("section", r.matched, r.strength);
  }
  if (spec.ordinal !== undefined) add("ordinal", el.ordinal === spec.ordinal);
  if (spec.ancestryHints !== undefined && spec.ancestryHints.length > 0) {
    const chain = el.parentChain.map(normalizeText);
    const hit = spec.ancestryHints.every((h) =>
      chain.some((c) => c.includes(normalizeText(h))),
    );
    add("ancestry", hit);
  }
  if (spec.bboxHint !== undefined) {
    const prox = bboxProximity(el.bbox, spec.bboxHint);
    denom += WEIGHTS.bbox;
    num += WEIGHTS.bbox * prox;
    signals.bbox = WEIGHTS.bbox * prox;
  }

  let total = denom > 0 ? num / denom : 0;
  if (!el.visible) total *= 0.5;
  if (!el.enabled) total *= 0.7;

  return { total, signals };
}

export interface RankedCandidate {
  element: SemanticElement;
  score: ScoreBreakdown;
}

/** Score and sort candidates best-first. */
export function rankCandidates(
  elements: SemanticElement[],
  spec: MatchSpec,
): RankedCandidate[] {
  return elements
    .map((element) => ({ element, score: scoreCandidate(element, spec) }))
    .sort((a, b) => b.score.total - a.score.total);
}

export interface BestMatch {
  best: RankedCandidate | null;
  /** Top two are within `ambiguityGap` of each other → AI disambiguation recommended. */
  ambiguous: boolean;
  ranked: RankedCandidate[];
}

/**
 * Resolve the single best candidate.
 * - `minScore`: below this the best is treated as "not found" (null).
 * - `ambiguityGap`: if the top two scores are closer than this and both clear
 *   minScore, the result is flagged ambiguous (triggers AI assist server-side).
 */
export function bestMatch(
  elements: SemanticElement[],
  spec: MatchSpec,
  opts: { minScore?: number; ambiguityGap?: number } = {},
): BestMatch {
  const minScore = opts.minScore ?? 0.35;
  const ambiguityGap = opts.ambiguityGap ?? 0.08;
  const ranked = rankCandidates(elements, spec);
  const top = ranked[0];

  if (!top || top.score.total < minScore) {
    return { best: null, ambiguous: false, ranked };
  }

  const second = ranked[1];
  const ambiguous =
    !!second &&
    second.score.total >= minScore &&
    top.score.total - second.score.total < ambiguityGap;

  return { best: top, ambiguous, ranked };
}
