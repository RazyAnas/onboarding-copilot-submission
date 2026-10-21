import { getAccessibleName } from "./accname.js";
import { getRole, isLandmarkRole } from "./roles.js";

export function isVisible(el: Element): boolean {
  const rects = el.getClientRects();
  if (rects.length === 0) return false;
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  if (Number(style.opacity) === 0) return false;
  return true;
}

export function isEnabled(el: Element): boolean {
  if ("disabled" in el && (el as HTMLInputElement).disabled) return false;
  return el.getAttribute("aria-disabled") !== "true";
}

/** Whether a text-entry control currently holds a non-empty value (no raw value read out). */
export function isFilled(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    if (type === "checkbox" || type === "radio") {
      return (el as HTMLInputElement).checked;
    }
    return (el as HTMLInputElement | HTMLTextAreaElement).value.trim().length > 0;
  }
  if (el.getAttribute("contenteditable") === "true") {
    return (el.textContent ?? "").trim().length > 0;
  }
  return false;
}

export function getBBox(el: Element): { x: number; y: number; width: number; height: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

export function getZIndex(el: Element): number {
  const z = getComputedStyle(el).zIndex;
  const n = Number.parseInt(z, 10);
  return Number.isNaN(n) ? 0 : n;
}

export function getTestId(el: Element): string | null {
  return (
    el.getAttribute("data-testid") ??
    el.getAttribute("data-test") ??
    el.getAttribute("data-cy") ??
    null
  );
}

/** Compact token for an ancestor, e.g. "section#members" or "nav[navigation]". */
function ancestorToken(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  const role = el.getAttribute("role");
  if (role) return `${tag}[${role}]`;
  const cls = (el.getAttribute("class") ?? "").trim().split(/\s+/)[0];
  return cls ? `${tag}.${cls}` : tag;
}

export function getParentChain(el: Element, maxDepth = 6): string[] {
  const chain: string[] = [];
  let cur = el.parentElement;
  while (cur && cur !== document.documentElement && chain.length < maxDepth) {
    chain.push(ancestorToken(cur));
    cur = cur.parentElement;
  }
  return chain;
}

/** Nearest scrollable ancestor's token, or null for the document scroller. */
export function getScrollContainerId(el: Element): string | null {
  let cur = el.parentElement;
  while (cur && cur !== document.body) {
    const style = getComputedStyle(cur);
    const oy = style.overflowY;
    if ((oy === "auto" || oy === "scroll") && cur.scrollHeight > cur.clientHeight) {
      return ancestorToken(cur);
    }
    cur = cur.parentElement;
  }
  return null;
}

export interface SectionContext {
  sectionRole: string | null;
  sectionLabel: string | null;
}

/**
 * Nearest enclosing landmark and its accessible name — the key signal for
 * telling apart duplicate controls in different regions of the page.
 */
export function getSectionContext(el: Element): SectionContext {
  let cur = el.parentElement;
  while (cur && cur !== document.body) {
    const role = getRole(cur);
    if (isLandmarkRole(role)) {
      return { sectionRole: role, sectionLabel: getAccessibleName(cur) || null };
    }
    cur = cur.parentElement;
  }
  return { sectionRole: null, sectionLabel: null };
}

export function getNearbyLabels(el: Element): string[] {
  const labels: string[] = [];
  const describedby = el.getAttribute("aria-describedby");
  if (describedby) {
    for (const id of describedby.split(/\s+/)) {
      const t = el.ownerDocument.getElementById(id)?.textContent?.trim();
      if (t) labels.push(t);
    }
  }
  const prev = el.previousElementSibling;
  if (prev && (prev.tagName === "LABEL" || prev.tagName === "LEGEND")) {
    const t = prev.textContent?.trim();
    if (t) labels.push(t);
  }
  return labels;
}

/** Best-effort unique-ish CSS selector — last-resort fallback only. */
export function getCssPath(el: Element, maxDepth = 5): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement && parts.length < maxDepth) {
    let part = cur.tagName.toLowerCase();
    if (cur.id) {
      parts.unshift(`${part}#${cur.id}`);
      break;
    }
    const parent = cur.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (c) => c.tagName === cur!.tagName,
      );
      if (sameTag.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(cur) + 1})`;
      }
    }
    parts.unshift(part);
    cur = cur.parentElement;
  }
  return parts.join(" > ");
}
