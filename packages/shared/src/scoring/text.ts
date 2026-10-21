import type { TextMatcher } from "../schemas/common.js";

/** Collapse whitespace, trim, lowercase — the canonical form for text comparison. */
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export interface TextMatchResult {
  matched: boolean;
  /** 1 = exact, 0.7 = contains, 0 = no match. */
  strength: number;
}

/** Match a concrete value against a TextMatcher (or bare string = exact). */
export function matchText(value: string, matcher: TextMatcher): TextMatchResult {
  const v = normalizeText(value);

  if (typeof matcher === "string") {
    return { matched: v === normalizeText(matcher), strength: 1 };
  }
  if ("equals" in matcher) {
    return { matched: v === normalizeText(matcher.equals), strength: 1 };
  }
  if ("contains" in matcher) {
    return { matched: v.includes(normalizeText(matcher.contains)), strength: 0.7 };
  }
  // regex
  try {
    return { matched: new RegExp(matcher.regex, "i").test(value), strength: 1 };
  } catch {
    return { matched: false, strength: 0 };
  }
}
