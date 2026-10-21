import { describe, it, expect } from "vitest";
import {
  scoreCandidate,
  bestMatch,
  specFromDescriptor,
  specFromCriteria,
} from "../scoring/score.js";
import { makeEl } from "./helpers.js";

describe("scoreCandidate", () => {
  it("scores an exact role+name match highly", () => {
    const el = makeEl({ role: "button", name: "Invite teammate" });
    const spec = specFromCriteria({ role: "button", name: "Invite teammate" });
    expect(scoreCandidate(el, spec).total).toBeGreaterThan(0.9);
  });

  it("penalizes hidden and disabled elements via soft multipliers", () => {
    const spec = specFromCriteria({ role: "button", name: "Save" });
    const visible = makeEl({ name: "Save" });
    const hidden = makeEl({ name: "Save", visible: false });
    const disabled = makeEl({ name: "Save", enabled: false });
    expect(scoreCandidate(visible, spec).total).toBeGreaterThan(
      scoreCandidate(hidden, spec).total,
    );
    expect(scoreCandidate(visible, spec).total).toBeGreaterThan(
      scoreCandidate(disabled, spec).total,
    );
  });

  it("ranks testId as the most reliable single signal", () => {
    const byTestId = makeEl({ name: "wrong text", testId: "invite-btn" });
    const byNameOnly = makeEl({ name: "Invite", testId: null });
    const spec = specFromCriteria({ testId: "invite-btn" });
    expect(scoreCandidate(byTestId, spec).total).toBeGreaterThan(
      scoreCandidate(byNameOnly, spec).total,
    );
  });
});

describe("duplicate-button disambiguation", () => {
  // Two identical "Invite" buttons in different sections — the core hard case.
  const headerInvite = makeEl({
    id: "invite-header",
    role: "button",
    name: "Invite",
    sectionLabel: "Top navigation",
    sectionRole: "navigation",
    ordinal: 0,
  });
  const membersInvite = makeEl({
    id: "invite-members",
    role: "button",
    name: "Invite",
    sectionLabel: "Members",
    sectionRole: "region",
    ordinal: 1,
  });
  const candidates = [headerInvite, membersInvite];

  it("is ambiguous without a section hint", () => {
    const spec = specFromCriteria({ role: "button", name: "Invite" });
    const result = bestMatch(candidates, spec);
    expect(result.ambiguous).toBe(true);
  });

  it("resolves to the right section with a sectionHint", () => {
    const spec = specFromCriteria({
      role: "button",
      name: "Invite",
      sectionHint: "Members",
    });
    const result = bestMatch(candidates, spec);
    expect(result.ambiguous).toBe(false);
    expect(result.best?.element.id).toBe("invite-members");
  });
});

describe("bestMatch", () => {
  it("returns null when nothing clears minScore", () => {
    const els = [makeEl({ role: "link", name: "Home" })];
    const spec = specFromCriteria({ role: "button", name: "Totally different" });
    expect(bestMatch(els, spec).best).toBeNull();
  });

  it("prefers internalId when it still holds (historical match)", () => {
    const keep = makeEl({ id: "keep", role: "button", name: "Next" });
    const other = makeEl({ id: "other", role: "button", name: "Next" });
    const spec = specFromDescriptor({
      internalId: "keep",
      role: "button",
      name: "Next",
      ancestryHints: [],
    });
    expect(bestMatch([other, keep], spec).best?.element.id).toBe("keep");
  });
});
