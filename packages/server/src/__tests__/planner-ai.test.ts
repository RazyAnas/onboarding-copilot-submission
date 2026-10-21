import { describe, it, expect } from "vitest";
import {
  FlowDefinitionSchema,
  type AiDecision,
  type FlowDefinition,
  type SemanticElement,
} from "@copilot/shared";
import { planGuidance } from "../planner.js";
import { DeterministicProvider } from "../ai/deterministic.js";
import type { AiDecisionInput, AiProvider } from "../ai/provider.js";

let seq = 0;
function makeEl(overrides: Partial<SemanticElement> = {}): SemanticElement {
  seq += 1;
  return {
    id: `el-${seq}`,
    role: "button",
    name: "Invite",
    text: "Invite",
    tag: "button",
    aria: {},
    testId: null,
    bbox: { x: 0, y: 0, width: 60, height: 32 },
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

// Two identical "Invite" buttons → deterministic match is ambiguous.
const TOPNAV = makeEl({ id: "topnav", testId: "topnav-invite", sectionLabel: "Top navigation", ordinal: 0 });
const MEMBERS = makeEl({ id: "members", testId: "members-invite", sectionLabel: "Members", ordinal: 1 });
const ELEMENTS = [TOPNAV, MEMBERS];

const FLOW: FlowDefinition = FlowDefinitionSchema.parse({
  key: "ai-demo",
  name: "AI demo",
  version: 1,
  steps: [
    {
      id: "pick-invite",
      goal: "Open invite in the Members section",
      instruction: "Click Invite in Members.",
      match: { role: "button", name: { equals: "Invite" } },
      aiAssist: true,
      advanceOn: { type: "manual" },
    },
  ],
});

class FakeProvider implements AiProvider {
  readonly name = "fake";
  readonly isAi = true;
  constructor(private readonly fn: (input: AiDecisionInput) => AiDecision) {}
  async decide(input: AiDecisionInput): Promise<AiDecision> {
    return this.fn(input);
  }
  async chat(): Promise<AsyncIterable<string>> {
    return (async function* () {
      yield "fake chat";
    })();
  }
  async guide() {
    return {
      kind: "not_possible" as const,
      targetElementId: null,
      instruction: "n/a",
      rationale: "n/a",
    };
  }
  async authorFlow() {
    return { feasible: false, reason: "n/a", title: "", steps: [] };
  }
}

const URL = "http://acme.test/#/settings/members";

describe("planGuidance — AI disambiguation", () => {
  it("uses the AI-chosen candidate (by id) for an ambiguous, aiAssist step", async () => {
    const provider = new FakeProvider((input) => ({
      stepId: input.stepId,
      targetElementId: "members",
      rationale: "members section matches the goal",
      confidence: 0.92,
    }));

    const plan = await planGuidance(FLOW, "pick-invite", {}, ELEMENTS, URL, [], undefined, {
      provider,
    });

    expect(plan.ambiguous).toBe(true);
    expect(plan.mode).toBe("ai");
    expect(plan.instruction.target?.testId).toBe("members-invite");
    expect(plan.reasoning).toContain("ai(fake)");
  });

  it("hands the model only a candidate shortlist (semantic, never raw DOM)", async () => {
    let seen: AiDecisionInput | null = null;
    const provider = new FakeProvider((input) => {
      seen = input;
      return { stepId: input.stepId, targetElementId: "members", rationale: "x", confidence: 1 };
    });
    await planGuidance(FLOW, "pick-invite", {}, ELEMENTS, URL, [], undefined, { provider });

    expect(seen!.candidates.map((c) => c.id).sort()).toEqual(["members", "topnav"]);
    // Candidates expose semantic fields, not markup.
    expect(seen!.candidates[0]).toHaveProperty("role");
    expect(seen!.candidates[0]).not.toHaveProperty("cssPath");
  });

  it("falls back to deterministic when the provider throws", async () => {
    const provider = new FakeProvider(() => {
      throw new Error("network down");
    });
    const plan = await planGuidance(FLOW, "pick-invite", {}, ELEMENTS, URL, [], undefined, {
      provider,
    });
    expect(plan.mode).toBe("deterministic");
    expect(plan.instruction.target?.testId).toBe("topnav-invite"); // deterministic top
  });

  it("ignores a hallucinated id and falls back to deterministic", async () => {
    const provider = new FakeProvider((input) => ({
      stepId: input.stepId,
      targetElementId: "does-not-exist",
      rationale: "made up",
      confidence: 1,
    }));
    const plan = await planGuidance(FLOW, "pick-invite", {}, ELEMENTS, URL, [], undefined, {
      provider,
    });
    expect(plan.mode).toBe("deterministic");
  });

  it("never calls AI in deterministic mode (isAi=false provider)", async () => {
    const plan = await planGuidance(FLOW, "pick-invite", {}, ELEMENTS, URL, [], undefined, {
      provider: new DeterministicProvider(),
    });
    expect(plan.mode).toBe("deterministic");
  });

  it("skips AI when the step does not opt in (aiAssist=false)", async () => {
    const noAssist = FlowDefinitionSchema.parse({
      ...FLOW,
      steps: [{ ...FLOW.steps[0], aiAssist: false }],
    });
    const provider = new FakeProvider((input) => ({
      stepId: input.stepId,
      targetElementId: "members",
      rationale: "x",
      confidence: 1,
    }));
    const plan = await planGuidance(noAssist, "pick-invite", {}, ELEMENTS, URL, [], undefined, {
      provider,
    });
    expect(plan.mode).toBe("deterministic");
  });
});
