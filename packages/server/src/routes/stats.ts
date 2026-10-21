import type { FastifyInstance } from "fastify";
import type { DB } from "../db/connection.js";
import { getTenantBySecretKey, listFlows } from "../db/repos.js";

interface FlowStats {
  key: string;
  name: string;
  sessions: number;
  completed: number;
  completionRate: number;
  /** Active (not completed) sessions grouped by the step they're stuck on. */
  stuckByStep: Record<string, number>;
  targetLost: number;
}

/** Count tenant-scoped events of one type (events join sessions for tenancy). */
function countEvents(db: DB, tenantId: string, type: string): number {
  const { n } = db
    .prepare(
      `SELECT COUNT(*) AS n FROM events e
       JOIN sessions s ON s.id = e.session_id
       WHERE s.tenant_id = ? AND e.type = ?`,
    )
    .get(tenantId, type) as { n: number };
  return n;
}

/**
 * GET /v1/stats?apiKey=<SECRET key> — the onboarding funnel, computed from
 * server-emitted events + session state. Requires the tenant's SECRET key:
 * the publishable browser key must never be able to read funnel data.
 */
export function registerStatsRoute(app: FastifyInstance, db: DB): void {
  app.get<{ Querystring: { apiKey?: string } }>("/v1/stats", async (request, reply) => {
    const tenant = getTenantBySecretKey(db, request.query.apiKey ?? "");
    if (!tenant) {
      reply.code(401);
      return { error: "invalid_api_key" };
    }

    const flows: FlowStats[] = listFlows(db, tenant.id).map((flow) => {
      const { sessions, completed } = db
        .prepare(
          `SELECT COUNT(*) AS sessions,
                  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
           FROM sessions WHERE tenant_id = ? AND flow_id = ?`,
        )
        .get(tenant.id, flow.id) as { sessions: number; completed: number | null };

      const stuck = db
        .prepare(
          `SELECT current_step_id AS stepId, COUNT(*) AS n FROM sessions
           WHERE tenant_id = ? AND flow_id = ? AND status != 'completed' AND current_step_id IS NOT NULL
           GROUP BY current_step_id`,
        )
        .all(tenant.id, flow.id) as { stepId: string; n: number }[];

      const { lost } = db
        .prepare(
          `SELECT COUNT(*) AS lost FROM events
           WHERE type = 'target_lost' AND json_extract(payload_json, '$.flowId') = ?`,
        )
        .get(flow.id) as { lost: number };

      const done = completed ?? 0;
      return {
        key: flow.key,
        name: flow.name,
        sessions,
        completed: done,
        completionRate: sessions > 0 ? Math.round((done / sessions) * 100) / 100 : 0,
        stuckByStep: Object.fromEntries(stuck.map((s) => [s.stepId, s.n])),
        targetLost: lost,
      };
    });

    const { totalSessions } = db
      .prepare("SELECT COUNT(*) AS totalSessions FROM sessions WHERE tenant_id = ?")
      .get(tenant.id) as { totalSessions: number };
    const { jitSessions } = db
      .prepare(
        `SELECT COUNT(*) AS jitSessions FROM sessions
         WHERE tenant_id = ? AND state_json LIKE '%"ai_guide"%'`,
      )
      .get(tenant.id) as { jitSessions: number };

    return {
      flows,
      ai: {
        compiled: countEvents(db, tenant.id, "ai_flow_compiled"),
        invalidated: countEvents(db, tenant.id, "plan_invalidated"),
        infeasible: countEvents(db, tenant.id, "ai_flow_infeasible"),
        authoringFailed: countEvents(db, tenant.id, "ai_authoring_failed"),
        jitFallbackSessions: jitSessions,
      },
      totals: { sessions: totalSessions },
    };
  });
}
