import type { SemanticElement } from "../schemas/element.js";

let seq = 0;

/** Build a valid SemanticElement with sensible defaults for tests. */
export function makeEl(overrides: Partial<SemanticElement> = {}): SemanticElement {
  seq += 1;
  return {
    id: `el-${seq}`,
    role: "button",
    name: "Click me",
    text: "Click me",
    tag: "button",
    aria: {},
    testId: null,
    bbox: { x: 0, y: 0, width: 80, height: 32 },
    cssPath: "button",
    parentChain: ["body"],
    nearbyLabels: [],
    sectionLabel: null,
    sectionRole: null,
    ordinal: 0,
    visible: true,
    enabled: true,
    filled: false,
    zIndex: 0,
    scrollContainerId: null,
    framePath: [],
    confidence: 1,
    lastSeen: 0,
    ...overrides,
  };
}
