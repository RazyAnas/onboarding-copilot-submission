import type { EventType } from "@copilot/shared";
import type { DB } from "./db/connection.js";
import { deleteFlow, insertEvent, type FlowRow } from "./db/repos.js";

/**
 * Distinct sessions that must lose a step's target before an AI-authored plan is
 * judged stale and evicted from the cache (forcing a fresh compile next time).
 */
const INVALIDATE_AFTER_SESSIONS = 3;

/** Record one lifecycle event. All funnel truth is server-emitted, never SDK-trusted. */
export function recordEvent(
  db: DB,
  sessionId: string,
  type: EventType,
  payload?: Record<string, unknown>,
): void {
  insertEvent(db, { sessionId, type, payload });
}

/**
 * Record that a step's target could not be confidently grounded on the live page
 * (active step rendered as tooltip-without-highlight). Deduped per session+step so
 * the polling loop doesn't spam. For AI-authored flows ("ai:*" keys) this also
 * powers the SELF-HEALING CACHE: repeated failures across distinct sessions evict
 * the cached plan, and the next equivalent goal recompiles against current docs/UI.
 *
 * Returns true if the flow was invalidated.
 */
export function recordTargetLost(
  db: DB,
  sessionId: string,
  flow: FlowRow,
  stepId: string,
): boolean {
  const last = db
    .prepare(
      "SELECT payload_json FROM events WHERE session_id = ? AND type = 'target_lost' ORDER BY id DESC LIMIT 1",
    )
    .get(sessionId) as { payload_json: string | null } | undefined;
  if (last?.payload_json && (JSON.parse(last.payload_json) as { stepId?: string }).stepId === stepId) {
    return false; // same loss already recorded for this session
  }

  recordEvent(db, sessionId, "target_lost", { stepId, flowId: flow.id, flowKey: flow.key });

  if (!flow.key.startsWith("ai:")) return false;
  const { n } = db
    .prepare(
      `SELECT COUNT(DISTINCT session_id) AS n FROM events
       WHERE type = 'target_lost' AND json_extract(payload_json, '$.flowId') = ?`,
    )
    .get(flow.id) as { n: number };
  if (n < INVALIDATE_AFTER_SESSIONS) return false;

  deleteFlow(db, flow.id);
  recordEvent(db, sessionId, "plan_invalidated", {
    flowId: flow.id,
    flowKey: flow.key,
    lostSessions: n,
  });
  return true;
}
