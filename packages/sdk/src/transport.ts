import type {
  ChatRequest,
  CheckpointRequest,
  GuidanceRequest,
  GuidanceResponse,
  OnboardingResponse,
  SessionResumeResponse,
  SessionStartRequest,
  SessionStartResponse,
} from "@copilot/shared";
import {
  GuidanceResponseSchema,
  OnboardingResponseSchema,
  SessionResumeResponseSchema,
  SessionStartResponseSchema,
} from "@copilot/shared";

export interface PostOptions {
  signal?: AbortSignal;
}

/**
 * POST a guidance request and validate the response. Network/HTTP failures
 * throw — callers decide whether to retry; we never silently swallow errors.
 */
export async function postGuidance(
  serverUrl: string,
  body: GuidanceRequest,
  options: PostOptions = {},
): Promise<GuidanceResponse> {
  const res = await fetch(`${serverUrl}/v1/guidance`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`guidance request failed: ${res.status} ${detail}`.trim());
  }

  return GuidanceResponseSchema.parse(await res.json());
}

/** Fetch the Layer 1 discovery feed (recommended flows + completion status). */
export async function fetchOnboarding(
  serverUrl: string,
  apiKey: string,
): Promise<OnboardingResponse | null> {
  const res = await fetch(`${serverUrl}/v1/onboarding?apiKey=${encodeURIComponent(apiKey)}`);
  if (!res.ok) return null; // discovery is best-effort; never block the page
  return OnboardingResponseSchema.parse(await res.json());
}

/** Start a session: the server resolves/compiles the plan and ships it whole. */
export async function startSession(
  serverUrl: string,
  body: SessionStartRequest,
  options: PostOptions = {},
): Promise<SessionStartResponse> {
  const res = await fetch(`${serverUrl}/v1/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`session start failed: ${res.status} ${detail}`.trim());
  }
  return SessionStartResponseSchema.parse(await res.json());
}

/** Resume a persisted session (page refresh / return visit). Null if gone. */
export async function resumeSession(
  serverUrl: string,
  sessionId: string,
  apiKey: string,
): Promise<SessionResumeResponse | null> {
  const res = await fetch(
    `${serverUrl}/v1/sessions/${encodeURIComponent(sessionId)}?apiKey=${encodeURIComponent(apiKey)}`,
  );
  if (!res.ok) return null; // 404/410 → start fresh; resume is best-effort
  return SessionResumeResponseSchema.parse(await res.json());
}

/** Fire a checkpoint (pointer persistence + event flush). Best-effort async. */
export async function postCheckpoint(
  serverUrl: string,
  sessionId: string,
  body: CheckpointRequest,
): Promise<void> {
  await fetch(`${serverUrl}/v1/sessions/${encodeURIComponent(sessionId)}/checkpoint`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true, // survives page unload
  }).catch(() => undefined);
}

/**
 * Stream a chat answer token-by-token (low time-to-first-token = feels instant).
 * `onToken` fires per chunk; feasibility (`guidable`) + `mode` arrive as response
 * headers up front, before the body streams.
 */
export async function streamChat(
  serverUrl: string,
  body: ChatRequest,
  onToken: (chunk: string) => void,
): Promise<{ guidable: boolean; mode: string }> {
  const res = await fetch(`${serverUrl}/v1/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`chat request failed: ${res.status} ${detail}`.trim());
  }
  const guidable = res.headers.get("x-copilot-guidable") === "1";
  const mode = res.headers.get("x-copilot-mode") ?? "deterministic";
  const reader = res.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) onToken(text);
    }
  }
  return { guidable, mode };
}
