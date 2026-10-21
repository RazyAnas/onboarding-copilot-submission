import type { PageSnapshot } from "@copilot/shared";
import { PageSnapshotSchema, encodeElements } from "@copilot/shared";
import { extractSemanticElements, type ExtractOptions } from "./extraction/extract.js";

/**
 * Build a transport-ready snapshot: extract elements, delta-compress repeated
 * sibling runs, and validate the result. The output is plain serializable data.
 */
export function buildPageSnapshot(
  doc: Document = document,
  options: ExtractOptions = {},
): PageSnapshot {
  const elements = extractSemanticElements(doc, options);
  const { elements: plain, deltaGroups } = encodeElements(elements);
  const view = doc.defaultView ?? window;

  return PageSnapshotSchema.parse({
    url: view.location.href,
    title: doc.title,
    viewport: { width: view.innerWidth, height: view.innerHeight },
    elements: plain,
    deltaGroups: deltaGroups.length > 0 ? deltaGroups : undefined,
    frames: [],
    capturedAt: Date.now(),
  });
}
