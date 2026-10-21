import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

const SNAPSHOT = {
  url: "http://acme.test/#/dashboard",
  title: "Acme",
  viewport: { width: 1280, height: 800 },
  elements: [],
  frames: [],
  capturedAt: Date.now(),
};

describe("M9 sessions API (runtime split)", () => {
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

  it("start ships the whole plan; checkpoint persists; resume returns the pointer", async () => {
    const start = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { apiKey: "demo-key", flowKey: "invite-teammate", snapshot: SNAPSHOT },
    });
    expect(start.statusCode).toBe(200);
    const s = start.json();
    expect(s.kind).toBe("flow");
    expect(s.flow.steps.length).toBeGreaterThan(1);
    expect(s.stepId).toBe(s.flow.steps[0].id);

    const second = s.flow.steps[1].id;
    const cp = await app.inject({
      method: "POST",
      url: `/v1/sessions/${s.sessionId}/checkpoint`,
      payload: { apiKey: "demo-key", stepId: second, status: "active", manual: true, events: [] },
    });
    expect(cp.statusCode).toBe(200);

    const resumed = (
      await app.inject({ method: "GET", url: `/v1/sessions/${s.sessionId}?apiKey=demo-key` })
    ).json();
    expect(resumed.stepId).toBe(second);
    expect(resumed.manual).toBe(true);
    expect(resumed.flow.key).toBe("invite-teammate");
  });

  it("answers honestly (kind=answer) for a goal it cannot plan without AI", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { apiKey: "demo-key", aiGoal: "frobnicate the quantum widgets", snapshot: SNAPSHOT },
    });
    const body = res.json();
    expect(body.kind).toBe("answer");
    expect(body.sessionId).toBeUndefined();
    expect(body.answer).toContain("assistant isn't available");
  });

  it("rejects foreign sessions and bad keys", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/sessions",
          payload: { apiKey: "nope", flowKey: "invite-teammate", snapshot: SNAPSHOT },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: "GET", url: "/v1/sessions/s_missing?apiKey=demo-key" }))
        .statusCode,
    ).toBe(404);
  });
});
