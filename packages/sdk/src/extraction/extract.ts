import type { SemanticElement } from "@copilot/shared";
import { normalizeText } from "@copilot/shared";
import { getRole, INTERACTIVE_SELECTOR } from "./roles.js";
import { getAccessibleName } from "./accname.js";
import {
  getBBox,
  getCssPath,
  getNearbyLabels,
  getParentChain,
  getScrollContainerId,
  getSectionContext,
  getTestId,
  getZIndex,
  isEnabled,
  isFilled,
  isVisible,
} from "./dom.js";
import { assignOrdinals, computeStableId } from "../semantic-graph.js";

function collectAria(el: Element): Record<string, string> {
  const aria: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith("aria-")) aria[attr.name.slice(5)] = attr.value;
  }
  return aria;
}

function confidenceFor(role: string, name: string): number {
  let c = 1;
  if (name === "") c -= 0.4;
  if (role === "generic") c *= 0.7;
  return Math.max(0, Math.min(1, c));
}

export interface ExtractOptions {
  /** Hard cap on elements per snapshot (visible-first). */
  maxElements?: number;
}

/** A SemanticElement paired with its live DOM node — runtime only, never serialized. */
export interface Candidate {
  element: SemanticElement;
  node: Element;
}

type Draft = Omit<SemanticElement, "id" | "ordinal"> & { ordinal: number; node: Element };

function buildDraft(el: Element, now: number): Draft {
  const role = getRole(el);
  const name = getAccessibleName(el);
  const section = getSectionContext(el);
  return {
    role,
    name,
    text: normalizeText(el.textContent ?? ""),
    tag: el.tagName.toLowerCase(),
    aria: collectAria(el),
    testId: getTestId(el),
    bbox: getBBox(el),
    cssPath: getCssPath(el),
    parentChain: getParentChain(el),
    nearbyLabels: getNearbyLabels(el),
    sectionLabel: section.sectionLabel,
    sectionRole: section.sectionRole,
    ordinal: 0,
    visible: isVisible(el),
    enabled: isEnabled(el),
    filled: isFilled(el),
    zIndex: getZIndex(el),
    scrollContainerId: getScrollContainerId(el),
    framePath: [],
    confidence: confidenceFor(role, name),
    lastSeen: now,
    node: el,
  };
}

/**
 * Walk the document for interactive elements, returning each SemanticElement
 * paired with its live node. The runtime matcher uses the node to read the
 * current rect; serialization drops it.
 */
export function extractCandidates(
  doc: Document = document,
  options: ExtractOptions = {},
): Candidate[] {
  const maxElements = options.maxElements ?? 250;
  const now = Date.now();

  const all = Array.from(doc.querySelectorAll(INTERACTIVE_SELECTOR));

  // SCALE GUARD: `buildDraft` is expensive (3× getComputedStyle + bbox + accname
  // + ancestor walks), and we only ever keep `maxElements`. On a heavy page
  // (thousands of interactive nodes) doing that for every element froze the tab
  // for seconds. So on large pages, cheaply pre-select the viewport-nearest
  // candidates FIRST (one batched layout read), then do the expensive work on
  // just those. Small pages keep the original full pass.
  let chosen: Element[];
  if (all.length <= maxElements * 2) {
    chosen = all;
  } else {
    const vh = doc.defaultView?.innerHeight ?? 800;
    const ranked = all.map((el) => {
      const r = el.getBoundingClientRect(); // reads batch into a single layout flush
      const rendered = r.width > 0 && r.height > 0;
      // 0 when on-screen; otherwise distance from the viewport (near-fold kept).
      const dist = r.bottom < 0 ? -r.bottom : r.top > vh ? r.top - vh : 0;
      return { el, rendered, dist };
    });
    ranked.sort((a, b) => Number(b.rendered) - Number(a.rendered) || a.dist - b.dist);
    chosen = ranked.slice(0, maxElements * 2).map((r) => r.el);
  }

  const drafts = chosen.map((el) => buildDraft(el, now));

  // Prioritize (truly) visible elements when capping to the final budget.
  drafts.sort((a, b) => Number(b.visible) - Number(a.visible));
  const capped = drafts.slice(0, maxElements);
  assignOrdinals(capped);

  return capped.map(({ node, ...d }) => ({
    node,
    element: {
      ...d,
      id: computeStableId({
        role: d.role,
        name: d.name,
        testId: d.testId,
        sectionRole: d.sectionRole,
        sectionLabel: d.sectionLabel,
        parentChain: d.parentChain,
        ordinal: d.ordinal,
      }),
    },
  }));
}

/**
 * Build the deterministic SemanticElement[] backbone for serialization. Holds no
 * node references in the output.
 */
export function extractSemanticElements(
  doc: Document = document,
  options: ExtractOptions = {},
): SemanticElement[] {
  return extractCandidates(doc, options).map((c) => c.element);
}
