import { describe, it, expect } from "vitest";
import { encodeElements, decodeSnapshot, MIN_GROUP_SIZE } from "../delta/codec.js";
import { PageSnapshotSchema } from "../schemas/snapshot.js";
import type { SemanticElement } from "../schemas/element.js";
import { makeEl } from "./helpers.js";

function snapshotWith(parts: {
  elements: SemanticElement[];
  deltaGroups?: ReturnType<typeof encodeElements>["deltaGroups"];
}) {
  return PageSnapshotSchema.parse({
    url: "https://example.test/",
    title: "t",
    viewport: { width: 1280, height: 800 },
    elements: parts.elements,
    deltaGroups: parts.deltaGroups,
    capturedAt: 0,
  });
}

function sortById(els: SemanticElement[]) {
  return [...els].sort((a, b) => a.id.localeCompare(b.id));
}

describe("delta codec", () => {
  it("delta-encodes a run of structurally identical siblings", () => {
    // 5 table-row cells sharing structure but differing by id/text/bbox.
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeEl({
        id: `row-${i}`,
        role: "row",
        tag: "tr",
        name: `Member ${i}`,
        text: `Member ${i}`,
        parentChain: ["table#members", "section#members"],
        bbox: { x: 0, y: i * 40, width: 600, height: 40 },
        ordinal: i,
      }),
    );

    const { elements, deltaGroups } = encodeElements(rows);
    expect(elements).toHaveLength(0);
    expect(deltaGroups).toHaveLength(1);

    const group = deltaGroups[0]!;
    // Shared structure is hoisted to the template, not repeated per instance.
    expect(group.template.role).toBe("row");
    expect(group.template.parentChain).toEqual(["table#members", "section#members"]);
    expect(group.varyingKeys).toContain("id");
    expect(group.varyingKeys).toContain("text");
    expect(group.varyingKeys).toContain("bbox");
    expect(group.varyingKeys).not.toContain("role");
  });

  it("round-trips delta-encoded elements losslessly", () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      makeEl({ id: `r-${i}`, role: "row", tag: "tr", text: `Row ${i}`, ordinal: i }),
    );
    const encoded = encodeElements(rows);
    const decoded = decodeSnapshot(snapshotWith(encoded));
    expect(sortById(decoded)).toEqual(sortById(rows));
  });

  it("keeps small groups plain (below MIN_GROUP_SIZE)", () => {
    const few = Array.from({ length: MIN_GROUP_SIZE - 1 }, (_, i) =>
      makeEl({ id: `b-${i}`, role: "link", tag: "a", text: `L${i}` }),
    );
    const { elements, deltaGroups } = encodeElements(few);
    expect(elements).toHaveLength(few.length);
    expect(deltaGroups).toHaveLength(0);
  });

  it("decodes a mixed plain + delta snapshot (backward compatible)", () => {
    const plain = [makeEl({ id: "solo", role: "search", tag: "input" })];
    const rows = Array.from({ length: 4 }, (_, i) =>
      makeEl({ id: `m-${i}`, role: "row", tag: "tr", text: `M${i}`, ordinal: i }),
    );
    const enc = encodeElements([...plain, ...rows]);
    const decoded = decodeSnapshot(snapshotWith(enc));
    expect(decoded).toHaveLength(5);
    expect(decoded.map((e) => e.id)).toContain("solo");
  });

  it("decodes a plain-only snapshot with no deltaGroups", () => {
    const els = [makeEl({ id: "x" }), makeEl({ id: "y" })];
    const decoded = decodeSnapshot(snapshotWith({ elements: els }));
    expect(sortById(decoded)).toEqual(sortById(els));
  });
});
