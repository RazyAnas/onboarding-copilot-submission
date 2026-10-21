import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

const SNAPSHOT = {
  url: "http://acme.test/#/settings/members",
  title: "Acme",
  viewport: { width: 1280, height: 800 },
  elements: [
    {
      id: "members-invite",
      role: "button",
      name: "Invite",
      text: "Invite",
      tag: "button",
      aria: {},
      testId: "members-invite",
      bbox: { x: 0, y: 0, width: 60, height: 32 },
      cssPath: "button",
      parentChain: ["body"],
      nearbyLabels: [],
      sectionLabel: "Members",
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
    },
  ],
  frames: [],
  capturedAt: Date.now(),
};

describe("GET /v1/onboarding (Layer 1 discovery feed)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      port: 0, host: "127.0.0.1", bodyLimit: 8 << 20, dbPath: ":memory:",
      ai: { provider: "none", model: "x" },
    });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("lists authored flows with a single recommended 'next'", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/onboarding?apiKey=demo-key" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeGreaterThan(0);
    expect(body.flows.some((f: { flowKey: string }) => f.flowKey === "invite-teammate")).toBe(true);
    // No AI-compiled (ai:*) plans leak into the onboarding checklist.
    expect(body.flows.every((f: { flowKey: string }) => !f.flowKey.startsWith("ai:"))).toBe(true);
    // Exactly one "next" (the first incomplete), the rest todo/done.
    expect(body.flows.filter((f: { status: string }) => f.status === "next").length).toBe(1);
  });

  it("marks a flow done after its session completes, advancing 'next'", async () => {
    const start = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { apiKey: "demo-key", flowKey: "invite-teammate", snapshot: SNAPSHOT },
    });
    const s = start.json();
    // Drive it to completion via checkpoints.
    await app.inject({
      method: "POST",
      url: `/v1/sessions/${s.sessionId}/checkpoint`,
      payload: { apiKey: "demo-key", stepId: null, status: "completed", manual: false, events: [] },
    });

    const after = (
      await app.inject({ method: "GET", url: "/v1/onboarding?apiKey=demo-key" })
    ).json();
    const invite = after.flows.find((f: { flowKey: string }) => f.flowKey === "invite-teammate");
    expect(invite.status).toBe("done");
    expect(after.completed).toBeGreaterThanOrEqual(1);
  });

  it("rejects an unknown api key", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/v1/onboarding?apiKey=nope" })).statusCode,
    ).toBe(401);
  });
});
