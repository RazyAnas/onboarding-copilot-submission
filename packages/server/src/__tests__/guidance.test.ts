import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { SemanticElement } from "@copilot/shared";
import { buildApp } from "../app.js";

let seq = 0;
function makeEl(overrides: Partial<SemanticElement> = {}): SemanticElement {
  seq += 1;
  return {
    id: `el-${seq}`,
    role: "button",
    name: "Button",
    text: "Button",
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

function snapshot(url: string, elements: SemanticElement[]) {
  return {
    url,
    title: "Acme",
    viewport: { width: 1280, height: 800 },
    elements,
    frames: [],
    capturedAt: Date.now(),
  };
}

const SETTINGS_LINK = makeEl({ role: "link", name: "Settings", tag: "a" });
const TOPNAV_INVITE = makeEl({
  role: "button",
  name: "Invite",
  testId: "topnav-invite",
  sectionLabel: "Top navigation",
  sectionRole: "navigation",
});
const MEMBERS_INVITE = makeEl({
  role: "button",
  name: "Invite",
  testId: "members-invite",
  sectionLabel: "Members",
  sectionRole: "region",
});
const SEND_INVITE = makeEl({ role: "button", name: "Send invite", testId: "send-invite" });
const EMAIL_EMPTY = makeEl({
  role: "textbox",
  name: "Email address",
  tag: "input",
  testId: "invite-email",
  filled: false,
});
const EMAIL_FILLED = makeEl({
  role: "textbox",
  name: "Email address",
  tag: "input",
  testId: "invite-email",
  filled: true,
});
const ON_SETTINGS = "http://acme.test/#/settings/members";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({
    port: 0,
    host: "127.0.0.1",
    bodyLimit: 8 << 20,
    dbPath: ":memory:",
    ai: { provider: "none", model: "x" },
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

async function post(payload: Record<string, unknown>) {
  const res = await app.inject({ method: "POST", url: "/v1/guidance", payload });
  return { status: res.statusCode, body: res.json() };
}

describe("deterministic planner over /v1/guidance", () => {
  it("walks the invite-teammate flow step by step from observable state", async () => {
    // Step 1: on the dashboard — highlight Settings.
    const s1 = await post({
      apiKey: "demo-key",
      flowKey: "invite-teammate",
      snapshot: snapshot("http://acme.test/#/dashboard", [SETTINGS_LINK, TOPNAV_INVITE]),
      recentEvents: [],
    });
    expect(s1.status).toBe(200);
    expect(s1.body.stepId).toBe("open-settings");
    expect(s1.body.instruction.kind).toBe("highlight");
    expect(s1.body.instruction.target.role).toBe("link");
    expect(s1.body.instruction.target.name).toBe("Settings");
    const sessionId = s1.body.sessionId as string;

    // Step 2: now on /settings — step 1 advances; highlight the MEMBERS Invite,
    // disambiguated from the identical top-nav Invite via sectionHint.
    const s2 = await post({
      apiKey: "demo-key",
      sessionId,
      snapshot: snapshot("http://acme.test/#/settings/members", [
        TOPNAV_INVITE,
        MEMBERS_INVITE,
      ]),
      recentEvents: [],
    });
    expect(s2.body.stepId).toBe("click-invite");
    expect(s2.body.instruction.target.testId).toBe("members-invite");

    // Step 3 WAITING: modal open but email empty — gate highlights the email
    // input and prompts for input, NOT the Send button yet.
    const s3wait = await post({
      apiKey: "demo-key",
      sessionId,
      snapshot: snapshot(ON_SETTINGS, [TOPNAV_INVITE, MEMBERS_INVITE, EMAIL_EMPTY, SEND_INVITE]),
      recentEvents: [],
    });
    expect(s3wait.body.stepId).toBe("send-invite");
    expect(s3wait.body.stepState).toBe("waiting");
    expect(s3wait.body.instruction.target.testId).toBe("invite-email");

    // Step 3 ACTIVE: email now filled — gate satisfied, highlight Send invite.
    const s3active = await post({
      apiKey: "demo-key",
      sessionId,
      snapshot: snapshot(ON_SETTINGS, [TOPNAV_INVITE, MEMBERS_INVITE, EMAIL_FILLED, SEND_INVITE]),
      recentEvents: [],
    });
    expect(s3active.body.stepId).toBe("send-invite");
    expect(s3active.body.stepState).toBe("active");
    expect(s3active.body.instruction.target.testId).toBe("send-invite");

    // Done: modal closed (send-invite gone) — flow completes.
    const done = await post({
      apiKey: "demo-key",
      sessionId,
      snapshot: snapshot(ON_SETTINGS, [TOPNAV_INVITE, MEMBERS_INVITE]),
      recentEvents: [],
    });
    expect(done.body.stepId).toBeNull();
    expect(done.body.instruction.kind).toBe("done");
  });

  it("honors user controls (next/back/skip) and latches manual mode", async () => {
    const start = await post({
      apiKey: "demo-key",
      flowKey: "invite-teammate",
      snapshot: snapshot("http://acme.test/#/dashboard", [SETTINGS_LINK]),
      recentEvents: [],
    });
    expect(start.body.stepIndex).toBe(0);
    const sessionId = start.body.sessionId as string;

    const next1 = await post({
      apiKey: "demo-key",
      sessionId,
      control: "next",
      snapshot: snapshot("http://acme.test/#/dashboard", [SETTINGS_LINK]),
      recentEvents: [],
    });
    expect(next1.body.stepIndex).toBe(1);
    expect(next1.body.manual).toBe(true);
    // BUG FIX: on the dashboard the Members "Invite" isn't present, so jumping to
    // the click-invite step must NOT highlight the top-nav duplicate — no target.
    expect(next1.body.instruction.kind).toBe("tooltip");
    expect(next1.body.instruction.target).toBeUndefined();

    // Manual mode must suppress auto-advance even when state would satisfy it.
    const noAuto = await post({
      apiKey: "demo-key",
      sessionId,
      snapshot: snapshot(ON_SETTINGS, [TOPNAV_INVITE, MEMBERS_INVITE]),
      recentEvents: [],
    });
    expect(noAuto.body.stepIndex).toBe(1); // did NOT auto-advance

    const back = await post({
      apiKey: "demo-key",
      sessionId,
      control: "back",
      snapshot: snapshot(ON_SETTINGS, []),
      recentEvents: [],
    });
    expect(back.body.stepIndex).toBe(0);

    const skip = await post({
      apiKey: "demo-key",
      sessionId,
      control: "skip",
      snapshot: snapshot(ON_SETTINGS, []),
      recentEvents: [],
    });
    expect(skip.body.stepIndex).toBe(1);
  });

  it("rejects an unknown API key with 401", async () => {
    const res = await post({
      apiKey: "nope",
      flowKey: "invite-teammate",
      snapshot: snapshot("http://acme.test/", []),
      recentEvents: [],
    });
    expect(res.status).toBe(401);
  });

  it("requires a flow key when starting a new session", async () => {
    const res = await post({
      apiKey: "demo-key",
      snapshot: snapshot("http://acme.test/", []),
      recentEvents: [],
    });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid request body with 400", async () => {
    const res = await post({ apiKey: "demo-key" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });
});

describe("POST /v1/chat (deterministic fallback)", () => {
  it("answers from the flow definition when AI is off", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat",
      payload: { apiKey: "demo-key", flowKey: "invite-teammate", message: "how do I invite a teammate?" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-copilot-mode"]).toBe("deterministic");
    expect(res.payload.toLowerCase()).toContain("invite");
    expect(res.headers["x-copilot-guidable"]).toBe("1"); // related to the flow
  });

  it("does NOT recite the flow steps for an unrelated/impossible goal", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat",
      payload: {
        apiKey: "demo-key",
        flowKey: "invite-teammate",
        message: "how do I edit my profile link?",
      },
    });
    expect(res.statusCode).toBe(200);
    // The bug: it used to dump "1. Open Settings… 2. Click Invite…" for any goal.
    expect(res.payload.toLowerCase()).not.toContain("click invite");
    expect(res.headers["x-copilot-guidable"]).toBe("0"); // not doable → no "Guide me"
  });

  it("rejects chat with an unknown API key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat",
      payload: { apiKey: "nope", message: "hi" },
    });
    expect(res.statusCode).toBe(401);
  });
});
