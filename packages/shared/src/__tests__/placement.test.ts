import { describe, it, expect } from "vitest";
import { pickPlacement, type PRect } from "../placement/place.js";

const VP = { width: 1280, height: 800 };

describe("pickPlacement (M9.6 discovery dock)", () => {
  it("picks bottom-center on a clean page", () => {
    const r = pickPlacement(VP, []);
    expect(r.anchor).toBe("bottom-center");
    expect(r.centerX).toBe(true);
    expect(r.bottom).toBe(16);
  });

  it("rises above a sticky bottom bar instead of overlapping it", () => {
    const footer: PRect = { x: 0, y: 740, width: 1280, height: 60 };
    const r = pickPlacement(VP, [footer]);
    expect(r.anchor).toBe("bottom-center");
    expect(r.bottom).toBe(76); // 16 margin + 60 bar height
  });

  it("avoids a centered bottom widget by moving to bottom-left", () => {
    // A fixed element sitting where bottom-center's pill would land (not full width).
    const widget: PRect = { x: 540, y: 736, width: 200, height: 56 };
    const r = pickPlacement(VP, [widget]);
    expect(r.anchor).toBe("bottom-left");
  });

  it("never returns bottom-right by default (support reflex)", () => {
    // Occupy both bottom-center and bottom-left so only bottom-right/top remain.
    const occupied: PRect[] = [
      { x: 400, y: 736, width: 480, height: 56 }, // covers center
      { x: 0, y: 736, width: 320, height: 56 }, // covers bottom-left
    ];
    const r = pickPlacement(VP, occupied);
    expect(r.anchor).not.toBe("bottom-right");
    expect(["top-center", "edge-right"]).toContain(r.anchor);
  });

  it("falls back to the right-edge handle when every pill slot is blocked", () => {
    // Narrow (non-bar) fixed widgets parked on each candidate slot, so there is
    // no wide bottom bar to rise above — every pill position collides.
    const occupied: PRect[] = [
      { x: 520, y: 730, width: 240, height: 60 }, // blocks bottom-center
      { x: 0, y: 730, width: 300, height: 60 }, // blocks bottom-left
      { x: 520, y: 0, width: 240, height: 70 }, // blocks top-center
    ];
    const r = pickPlacement(VP, occupied);
    expect(r.anchor).toBe("edge-right");
  });

  it("respects an explicit anchor exclusion / ordering", () => {
    const r = pickPlacement(VP, [], { order: ["bottom-left", "bottom-center"], exclude: [] });
    expect(r.anchor).toBe("bottom-left");
  });
});
