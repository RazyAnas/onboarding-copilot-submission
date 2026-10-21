import { normalizeText } from "@copilot/shared";

/** FNV-1a 32-bit hash → short hex string. Deterministic and dependency-free. */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Stable internal id from the element's *stable* attributes only — deliberately
 * excludes volatile bits like text/bbox so the id survives rerenders. Ordinal +
 * section keep duplicates distinct.
 */
export function computeStableId(parts: {
  role: string;
  name: string;
  testId: string | null;
  sectionRole: string | null;
  sectionLabel: string | null;
  parentChain: string[];
  ordinal: number;
}): string {
  const key = [
    parts.role,
    normalizeText(parts.name),
    parts.testId ?? "",
    parts.sectionRole ?? "",
    normalizeText(parts.sectionLabel ?? ""),
    parts.parentChain.join(">"),
    parts.ordinal,
  ].join("|");
  return `e_${hashString(key)}`;
}

/** Assign each element its index among page elements sharing (role, name). */
export function assignOrdinals<T extends { role: string; name: string; ordinal: number }>(
  elements: T[],
): void {
  const counts = new Map<string, number>();
  for (const el of elements) {
    const key = `${el.role}|${normalizeText(el.name)}`;
    const n = counts.get(key) ?? 0;
    el.ordinal = n;
    counts.set(key, n + 1);
  }
}
