import { bestMatch, specFromDescriptor, type TargetDescriptor } from "@copilot/shared";
import { extractCandidates } from "./extraction/extract.js";

export interface ResolveResult {
  node: Element;
  score: number;
  /** Top two candidates were close — the descriptor is weakly discriminating. */
  ambiguous: boolean;
}

/**
 * Deterministically re-resolve a TargetDescriptor against the *live* DOM. Re-runs
 * extraction + the shared scorer every call, so it naturally follows rerenders
 * and picks the right element among duplicates by section/ordinal/testId.
 */
export function resolveTarget(
  descriptor: TargetDescriptor,
  doc: Document = document,
  opts: { minScore?: number } = {},
): ResolveResult | null {
  const candidates = extractCandidates(doc);
  const elements = candidates.map((c) => c.element);
  const { best, ambiguous } = bestMatch(elements, specFromDescriptor(descriptor), {
    minScore: opts.minScore ?? 0.4,
  });
  if (!best) return null;

  const match = candidates.find((c) => c.element.id === best.element.id);
  return match ? { node: match.node, score: best.score.total, ambiguous } : null;
}
