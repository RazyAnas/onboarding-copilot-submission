import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { SemanticElement, AiDecision } from "@copilot/shared";
import { buildApp } from "../app.js";
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

class FakeProvider implements AiProvider {
  readonly name = "fake-ai";
  readonly isAi = true;
  decided = 0;
  chatted = 0;
  async decide(input: AiDecisionInput): Promise<AiDecision> {
    this.decided += 1;
    return {
      stepId: input.stepId,
      targetElementId: "members",
      rationale: "members section matches the goal",
      confidence: 0.9,
    };
  }
  lastChatContext = "";
  async chat(input: { message: string; context: string }): Promise<AsyncIterable<string>> {
    this.chatted += 1;
    this.lastChatContext = input.context;
    const message = input.message;
    return (async function* () {
      yield `AI answer to: ${message}`;
    })();
  }
  authored = 0;
  /** Goal-keyed behavior: "crash" → throw (JIT fallback), "impossible" → infeasible. */
  async authorFlow(input: { goal: string }) {
    this.authored += 1;
    if (input.goal.includes("crash")) throw new Error("authoring boom");
    if (input.goal.includes("impossible")) {
      return { feasible: false, reason: "This app has no such feature.", title: "", steps: [] };
    }
    const step = (instruction: string, goal: string) => ({
      instruction,
      goal,
      targetRole: "button",
      targetName: "Invite",
      targetSection: "Members",
      targetTestId: "",
      advanceType: "manual" as const,
      advanceUrlContains: "",
      advanceName: "",
      advanceTestId: "",
    });
    return {
      feasible: true,
      reason: "ok",
      title: "Custom guide",
      steps: [step("Open the Members section.", "navigate"), step("Click Invite in Members.", "invite")],
    };
  }
  guided = 0;
  async guide(input: { candidates: { id: string }[] }) {
    this.guided += 1;
    // Pick the members element if present, by id (agentic page-grounded choice).
    const pick = input.candidates.find((c) => c.id === "members") ?? input.candidates[0];
    return {
      kind: "highlight" as const,
      targetElementId: pick?.id ?? null,
      instruction: "Click Invite in the Members section.",
      rationale: "members section matches the goal",
    };
  }
}

const TOPNAV = makeEl({ id: "topnav", testId: "topnav-invite", sectionLabel: "Top navigation", ordinal: 0 });
const MEMBERS = makeEl({ id: "members", testId: "members-invite", sectionLabel: "Members", ordinal: 1 });

function snapshot(elements: SemanticElement[]) {
  return {
    url: "http://acme.test/#/settings/members",
    title: "Acme",
    viewport: { width: 1280, height: 800 },
    elements,
    frames: [],
    capturedAt: Date.now(),
  };
}

describe("AI provider wiring over /v1/guidance", () => {
  let app: FastifyInstance;
  const fake = new FakeProvider();

  beforeAll(async () => {
    app = await buildApp(
      { port: 0, host: "127.0.0.1", bodyLimit: 8 << 20, dbPath: ":memory:", ai: { provider: "none", model: "x" } },
      { aiProvider: fake },
    );
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("routes an ambiguous aiAssist step through the AI provider and reports mode=ai", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/guidance",
      payload: {
        apiKey: "demo-key",
        flowKey: "ai-demo",
        snapshot: snapshot([TOPNAV, MEMBERS]),
        recentEvents: [],
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(fake.decided).toBeGreaterThan(0);
    expect(body.mode).toBe("ai");
    expect(body.instruction.target.testId).toBe("members-invite");
  });

  it("streams a chat answer via the AI provider (mode=ai)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat",
      payload: { apiKey: "demo-key", flowKey: "invite-teammate", message: "how do I invite someone?" },
    });
    expect(res.statusCode).toBe(200);
    expect(fake.chatted).toBeGreaterThan(0);
    expect(res.headers["x-copilot-mode"]).toBe("ai");
    expect(res.payload).toContain("how do I invite someone?"); // streamed body
    // Grounded feasibility: the invite flow covers this → guidable.
    expect(res.headers["x-copilot-guidable"]).toBe("1");
  });

  it("reports guidable=0 for an infeasible goal (grounding, not self-report)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat",
      payload: { apiKey: "demo-key", flowKey: "invite-teammate", message: "do the impossible thing" },
    });
    expect(res.statusCode).toBe(200);
    // No flow, element, or active-flow match → not doable → no "Guide me".
    expect(res.headers["x-copilot-guidable"]).toBe("0");
  });

  it("chat context is page-aware: leads with the user's current location", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat",
      payload: {
        apiKey: "demo-key",
        flowKey: "invite-teammate",
        message: "how do I invite new members?",
        snapshot: snapshot([TOPNAV, MEMBERS]),
      },
    });
    expect(res.statusCode).toBe(200);
    // The model must know WHERE the user is so it can answer from there…
    expect(fake.lastChatContext).toContain("CURRENTLY at: http://acme.test/#/settings/members");
    expect(fake.lastChatContext).toContain("Members");
    // …and must be instructed to adapt, not recite, the reference recipe.
    expect(fake.lastChatContext).toContain("Never tell them to navigate somewhere they already are");
    // Location must come BEFORE the reference workflow so it frames the answer.
    expect(fake.lastChatContext.indexOf("CURRENTLY at")).toBeLessThan(
      fake.lastChatContext.indexOf("Reference workflow"),
    );
  });

  it("retrieves and runs an authored flow for a matching goal (RAG)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/guidance",
      payload: {
        apiKey: "demo-key",
        aiGoal: "how do I invite a teammate",
        snapshot: snapshot([TOPNAV, MEMBERS]),
        recentEvents: [],
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    // Matched the invite-teammate flow → ran it deterministically (not an ad-hoc guide).
    expect(body.stepId).toBe("click-invite");
    expect(body.instruction.target.testId).toBe("members-invite");
  });

  it("compiles a full flow for a novel goal and reports real progress", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/guidance",
      payload: {
        apiKey: "demo-key",
        aiGoal: "configure custom widgets",
        snapshot: snapshot([TOPNAV, MEMBERS]),
        recentEvents: [],
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(fake.authored).toBe(1);
    // Compiled into a real flow: progress + deterministic execution, not a reactive guide.
    expect(body.totalSteps).toBe(2);
    expect(body.stepIndex).toBe(0);
    expect(body.stepId).toBe("s0");
    expect(body.instruction.kind).toBe("highlight");
    expect(body.instruction.target.testId).toBe("members-invite");
  });

  it("reuses the cached compiled flow for an equivalent goal (no re-authoring)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/guidance",
      payload: {
        apiKey: "demo-key",
        aiGoal: "Configure the custom widgets",
        snapshot: snapshot([TOPNAV, MEMBERS]),
        recentEvents: [],
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(fake.authored).toBe(1); // cache hit — authorFlow not called again
    expect(body.totalSteps).toBe(2);
    expect(body.stepId).toBe("s0");
  });

  it("answers honestly when authoring judges the goal infeasible", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/guidance",
      payload: {
        apiKey: "demo-key",
        aiGoal: "do the impossible thing",
        snapshot: snapshot([TOPNAV, MEMBERS]),
        recentEvents: [],
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.instruction.kind).toBe("tooltip");
    expect(body.instruction.content.title).toBe("Can't guide that here");
    expect(body.instruction.content.body).toContain("no such feature");
    expect(body.totalSteps).toBe(0);
  });

  it("prefers a precise element match over authoring (no hallucinated target)", async () => {
    const settings = makeEl({ id: "set", name: "Settings", testId: "nav-settings", sectionLabel: "Primary" });
    const dash = makeEl({ id: "dash", name: "Dashboard", testId: "nav-dashboard", sectionLabel: "Primary" });
    const before = fake.authored;
    const res = await app.inject({
      method: "POST",
      url: "/v1/guidance",
      payload: {
        apiKey: "demo-key",
        aiGoal: "how do I go to the settings page",
        snapshot: snapshot([dash, settings]),
        recentEvents: [],
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.totalSteps).toBe(1);
    // Spotlights Settings (the precise match) — NOT Dashboard, and not via authoring.
    expect(body.instruction.target.testId).toBe("nav-settings");
    expect(fake.authored).toBe(before); // single-step preempted the model
  });

  it("guides to a visible element when authoring fails but the target is on-page", async () => {
    const acct = makeEl({
      id: "acct",
      name: "Account menu",
      text: "AB",
      testId: "account-menu",
      sectionLabel: "Top navigation",
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/guidance",
      payload: {
        // "crash" makes the fake's authorFlow throw; the account-menu element is
        // right here, so the single-step fallback must spotlight it.
        apiKey: "demo-key",
        aiGoal: "crash but show me the account menu",
        snapshot: snapshot([TOPNAV, acct]),
        recentEvents: [],
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.totalSteps).toBe(1);
    expect(body.stepId).toBe("s0");
    expect(body.instruction.kind).toBe("highlight");
    expect(body.instruction.target.testId).toBe("account-menu");
  });

  it("falls back to the reactive per-step guide when authoring fails", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/guidance",
      payload: {
        apiKey: "demo-key",
        aiGoal: "crash something custom xyzzy unrelated",
        snapshot: snapshot([TOPNAV, MEMBERS]),
        recentEvents: [],
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(fake.guided).toBeGreaterThan(0);
    expect(body.stepId).toBe("ai-guide");
    expect(body.mode).toBe("ai");
    expect(body.instruction.kind).toBe("highlight");
    expect(body.instruction.target.testId).toBe("members-invite");
  });
});
