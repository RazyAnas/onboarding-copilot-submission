import { pickPlacement, type PlacementResult, type PRect } from "@copilot/shared";

/** Our own shadow hosts — never treat the companion as a host obstacle. */
const SELF = "[data-copilot-overlay],[data-copilot-dock],[data-copilot-debug]";

/**
 * Bounded selector net for likely edge furniture — semantic landmarks, common bar
 * class/inline patterns, and known support/cookie widgets. Each candidate is still
 * filtered by *computed* `position: fixed|sticky` + edge-hugging, so non-fixed
 * matches (a static sidebar, an in-flow footer) are dropped. This catches fixed
 * bars nested deep in the host tree without walking every element.
 */
const CANDIDATE_SELECTOR = [
  "header", "footer", "nav", "aside",
  "[role='banner']", "[role='contentinfo']", "[role='navigation']", "[role='toolbar']",
  "[class*='bar']", "[class*='footer']", "[class*='header']", "[class*='nav']",
  "[class*='toolbar']", "[class*='dock']", "[style*='fixed']", "[style*='sticky']",
  "#intercom-container", ".intercom-lightweight-app", "#drift-frame-controller",
  "#crisp-chatbox", "[id*='cookie']", "[class*='cookie']", "[aria-label*='cookie' i]",
].join(",");

function consider(el: Element, vw: number, vh: number, out: PRect[], seen: Set<Element>): void {
  if (seen.has(el)) return;
  seen.add(el);
  if (el.closest(SELF)) return;
  const st = getComputedStyle(el as HTMLElement);
  if (st.position !== "fixed" && st.position !== "sticky") return;
  if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return;
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return;
  // Ignore full-screen overlays (modals/backdrops) — they're transient, not chrome.
  if (r.width >= vw * 0.92 && r.height >= vh * 0.92) return;
  // Only edge-hugging elements compete for dock space.
  const m = 4;
  const hugs = r.top <= m || r.bottom >= vh - m || r.left <= m || r.right >= vw - m;
  if (!hugs) return;
  out.push({ x: r.left, y: r.top, width: r.width, height: r.height });
}

/**
 * Probe the host for fixed/sticky edge furniture (top/bottom bars, side rails) and
 * known support/cookie widgets. Bounded: scans body-level children (where fixed
 * bars usually live) plus a curated widget selector list — not the whole tree.
 */
export function detectOccupied(doc: Document = document): PRect[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const out: PRect[] = [];
  const seen = new Set<Element>();
  for (const el of Array.from(doc.body?.children ?? [])) consider(el, vw, vh, out, seen);
  for (const el of Array.from(doc.querySelectorAll(CANDIDATE_SELECTOR))) consider(el, vw, vh, out, seen);
  return out;
}

/** Resolve a safe, visible dock placement for the current page. */
export function resolvePlacement(doc: Document = document): PlacementResult {
  return pickPlacement(
    { width: window.innerWidth, height: window.innerHeight },
    detectOccupied(doc),
  );
}
