import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { SemanticElement } from "@copilot/shared";
import { buildApp } from "../app.js";
import type { AiProvider } from "../ai/provider.js";

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

/** Always authors the same 1-step flow targeting "Invite" in "Members". */
class FakeProvider implements AiProvider {
  readonly name = "fake-ai";
  readonly isAi = true;
  authored = 0;
  async decide() {
    return { stepId: "x", targetElementId: null, rationale: "n/a", confidence: 0 };
  }
  async chat() {
    return (async function* () {})();
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
    this.authored += 1;
    return {
      feasible: true,
      reason: "ok",
      title: "Custom guide",
      steps: [
        {
          instruction: "Click Invite in Members.",
          goal: "invite",
          targetRole: "button",
          targetName: "Invite",
          targetSection: "Members",
          targetTestId: "",
          advanceType: "manual" as const,
          advanceUrlContains: "",
          advanceName: "",
          advanceTestId: "",
        },
      ],
    };
  }
}

const MEMBERS = makeEl({ id: "members", testId: "members-invite", sectionLabel: "Members" });
/** A page where the authored target does NOT exist (grounding must fail). */
const UNRELATED = makeEl({ id: "other", name: "Export", text: "Export", sectionLabel: "Reports" });

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

async function guidance(app: FastifyInstance, payload: Record<string, unknown>) {
  const res = await app.inject({ method: "POST", url: "/v1/guidance", payload });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe("M7 events + stats + self-healing plan cache", () => {
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

  it("emits lifecycle events and reports the funnel in /v1/stats", async () => {
    // Walk the seeded invite-teammate flow to completion with manual controls.
    const start = await guidance(app, {
      apiKey: "demo-key",
      flowKey: "invite-teammate",
      snapshot: snapshot([MEMBERS]),
      recentEvents: [],
    });
    let last = start;
    for (let i = 0; i < last.totalSteps; i += 1) {
      last = await guidance(app, {
        apiKey: "demo-key",
        sessionId: start.sessionId,
        control: "next",
        snapshot: snapshot([MEMBERS]),
        recentEvents: [],
      });
    }
    expect(last.instruction.kind).toBe("done");

    const stats = (
      await app.inject({ method: "GET", url: "/v1/stats?apiKey=demo-secret" })
    ).json();
    const invite = stats.flows.find((f: { key: string }) => f.key === "invite-teammate");
    expect(invite.sessions).toBe(1);
    expect(invite.completed).toBe(1);
    expect(invite.completionRate).toBe(1);
  });

  it("rejects /v1/stats and /v1/events without a valid api key", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/stats?apiKey=nope" })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/events",
          payload: { apiKey: "nope", events: [{ sessionId: "s", type: "click", at: 1 }] },
        })
      ).statusCode,
    ).toBe(401);
  });

  it("accepts SDK events for owned sessions and drops foreign ones", async () => {
    const start = await guidance(app, {
      apiKey: "demo-key",
      flowKey: "invite-teammate",
      snapshot: snapshot([MEMBERS]),
      recentEvents: [],
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/events",
      payload: {
        apiKey: "demo-key",
        events: [
          { sessionId: start.sessionId, type: "click", payload: { tag: "button" }, at: Date.now() },
          { sessionId: "s_not_yours", type: "click", at: Date.now() },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(1);
  });

  it("self-heals: repeated grounding failures evict the cached AI plan and recompile", async () => {
    // A goal that names NO on-page element, so it goes through authoring (the
    // path this test exercises) rather than the precise single-step match.
    const goal = "set up the billing integration";

    // Session 1 compiles + caches the plan; target missing → target_lost.
    await guidance(app, { apiKey: "demo-key", aiGoal: goal, snapshot: snapshot([UNRELATED]), recentEvents: [] });
    expect(fake.authored).toBe(1);

    // Sessions 2–3: cache hits (no re-authoring), each losing the target.
    await guidance(app, { apiKey: "demo-key", aiGoal: goal, snapshot: snapshot([UNRELATED]), recentEvents: [] });
    await guidance(app, { apiKey: "demo-key", aiGoal: goal, snapshot: snapshot([UNRELATED]), recentEvents: [] });
    expect(fake.authored).toBe(1);

    const stats = (
      await app.inject({ method: "GET", url: "/v1/stats?apiKey=demo-secret" })
    ).json();
    expect(stats.ai.compiled).toBe(1);
    expect(stats.ai.invalidated).toBe(1); // 3 distinct lost sessions → evicted

    // Next equivalent goal finds no cached plan → compiles fresh.
    await guidance(app, { apiKey: "demo-key", aiGoal: goal, snapshot: snapshot([UNRELATED]), recentEvents: [] });
    expect(fake.authored).toBe(2);
  });
});
