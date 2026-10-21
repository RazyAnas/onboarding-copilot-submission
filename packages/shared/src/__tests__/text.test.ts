import { describe, it, expect } from "vitest";
import { normalizeText, matchText } from "../scoring/text.js";

describe("normalizeText", () => {
  it("collapses whitespace, trims, lowercases", () => {
    expect(normalizeText("  Invite   Teammate\n")).toBe("invite teammate");
  });
});

describe("matchText", () => {
  it("matches a bare string exactly (normalized)", () => {
    expect(matchText("Invite", "invite").matched).toBe(true);
    expect(matchText("Invite member", "invite").matched).toBe(false);
  });

  it("supports contains with reduced strength", () => {
    const r = matchText("Invite member", { contains: "invite" });
    expect(r.matched).toBe(true);
    expect(r.strength).toBeLessThan(1);
  });

  it("supports regex (case-insensitive)", () => {
    expect(matchText("Invite (3)", { regex: "^invite" }).matched).toBe(true);
  });

  it("returns no match for invalid regex instead of throwing", () => {
    expect(matchText("x", { regex: "(" }).matched).toBe(false);
  });
});
