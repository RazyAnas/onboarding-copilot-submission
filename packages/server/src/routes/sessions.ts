import type { FastifyInstance } from "fastify";
import {
  CheckpointRequestSchema,
  FlowDefinitionSchema,
  SessionResumeResponseSchema,
  SessionStartRequestSchema,
  SessionStartResponseSchema,
  decodeSnapshot,
} from "@copilot/shared";
import type { DB } from "../db/connection.js";
import {
  createSession,
  getFlowById,
  getFlowByKey,
  getSession,
  getTenantByApiKey,
  insertEvent,
  updateSession,
} from "../db/repos.js";
import { resolvePlanForGoal } from "../compile.js";
import { recordEvent, recordTargetLost } from "../telemetry.js";

/**
 * M9 runtime split. The server's job collapses to four moments:
 *  - POST /v1/sessions             start: resolve/compile the plan, ship it whole
 *  - GET  /v1/sessions/:id         resume (after refresh / return visit)
 *  - POST /v1/sessions/:id/checkpoint   async pointer persistence + event flush
 * Everything between checkpoints runs locally in the SDK (shared executor).
 * There is NO step-less guide here: if no plan can be produced, the honest
 * response is an answer, not a fake guide.
 */
export function registerSessionsRoutes(
  app: FastifyInstance,
  db: DB,
  aiProvider: Parameters<typeof resolvePlanForGoal>[5],
  embedder?: Parameters<typeof resolvePlanForGoal>[7],
): void {
  app.post("/v1/sessions", async (request, reply) => {
    const parsed = SessionStartRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_request", issues: parsed.error.issues };
    }
    const { apiKey, flowKey, aiGoal, snapshot } = parsed.data;
    const tenant = getTenantByApiKey(db, apiKey);
    if (!tenant) {
      reply.code(401);
      return { error: "invalid_api_key" };
    }

    let flowRow;
    let source = "configured";
    let goal: string | undefined;

    if (aiGoal) {
      const resolved = await resolvePlanForGoal(
        db, tenant.id, aiGoal,
        snapshot.url, decodeSnapshot(snapshot), aiProvider, request.log, embedder,
      );
      if (resolved.kind === "infeasible") {
        return SessionStartResponseSchema.parse({ kind: "answer", answer: resolved.reason });
      }
      if (resolved.kind === "none") {
        return SessionStartResponseSchema.parse({
          kind: "answer",
          answer:
            resolved.cause === "no_ai"
              ? "I don't have a guide for that yet, and the assistant isn't available to build one right now."
              : "I couldn't build a reliable guide for that just now. Please try again.",
        });
      }
      flowRow = resolved.flowRow;
      source = resolved.source;
      goal = aiGoal;
    } else if (flowKey) {
      flowRow = getFlowByKey(db, tenant.id, flowKey);
      if (!flowRow) {
        reply.code(400);
        return { error: "flow_key_required_or_unknown" };
      }
    } else {
      reply.code(400);
      return { error: "flow_key_or_ai_goal_required" };
    }

    const def = FlowDefinitionSchema.parse(JSON.parse(flowRow.definition_json));
    const session = createSession(db, {
      tenantId: tenant.id,
      flowId: flowRow.id,
      currentStepId: def.steps[0]!.id,
      stateJson: JSON.stringify({ kind: "flow", ...(goal ? { goal } : {}) }),
    });
    recordEvent(db, session.id, "flow_started", {
      flowKey: flowRow.key,
      source,
      ...(goal ? { goal } : {}),
    });
    if (source === "compiled") {
      recordEvent(db, session.id, "ai_flow_compiled", { flowKey: flowRow.key, goal });
    }
    request.log.info({ sessionId: session.id, flowKey: flowRow.key, source }, "session start");

    return SessionStartResponseSchema.parse({
      kind: "flow",
      sessionId: session.id,
      flow: def,
      stepId: def.steps[0]!.id,
      manual: false,
      source,
    });
  });

  app.get<{ Params: { id: string }; Querystring: { apiKey?: string } }>(
    "/v1/sessions/:id",
    async (request, reply) => {
      const tenant = getTenantByApiKey(db, request.query.apiKey ?? "");
      if (!tenant) {
        reply.code(401);
        return { error: "invalid_api_key" };
      }
      const session = getSession(db, request.params.id);
      if (!session || session.tenant_id !== tenant.id) {
        reply.code(404);
        return { error: "session_not_found" };
      }
      const flowRow = getFlowById(db, session.flow_id);
      if (!flowRow) {
        reply.code(410);
        return { error: "flow_gone" }; // e.g. self-healed away — start fresh
      }
      let manual = false;
      try {
        manual = !!(JSON.parse(session.state_json) as { manual?: boolean }).manual;
      } catch { /* default false */ }
      return SessionResumeResponseSchema.parse({
        sessionId: session.id,
        flow: FlowDefinitionSchema.parse(JSON.parse(flowRow.definition_json)),
        stepId: session.current_step_id,
        status: session.status === "completed" ? "completed" : "active",
        manual,
      });
    },
  );

  app.post<{ Params: { id: string } }>("/v1/sessions/:id/checkpoint", async (request, reply) => {
    const parsed = CheckpointRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_request", issues: parsed.error.issues };
    }
    const tenant = getTenantByApiKey(db, parsed.data.apiKey);
    if (!tenant) {
      reply.code(401);
      return { error: "invalid_api_key" };
    }
    const session = getSession(db, request.params.id);
    if (!session || session.tenant_id !== tenant.id) {
      reply.code(404);
      return { error: "session_not_found" };
    }

    const { stepId, status, manual, events } = parsed.data;
    const prevStepId = session.current_step_id;
    const prevStatus = session.status;

    let state: Record<string, unknown> = {};
    try {
      state = JSON.parse(session.state_json) as Record<string, unknown>;
    } catch { /* fresh state */ }
    updateSession(db, session.id, {
      currentStepId: stepId,
      status,
      stateJson: JSON.stringify({ ...state, manual }),
    });

    // Server-emitted funnel edges — checkpoints are the transition stream.
    if (stepId !== prevStepId && prevStatus === "active" && status === "active") {
      recordEvent(db, session.id, "step_advanced", { from: prevStepId, to: stepId });
    }
    if (status === "completed" && prevStatus !== "completed") {
      recordEvent(db, session.id, "flow_completed", {});
    }

    const flowRow = getFlowById(db, session.flow_id);
    for (const ev of events) {
      if (ev.type === "target_lost" && flowRow) {
        const lostStep = (ev.payload as { stepId?: string } | undefined)?.stepId ?? stepId ?? "";
        const invalidated = recordTargetLost(db, session.id, flowRow, lostStep);
        if (invalidated) {
          request.log.info(
            { flowKey: flowRow.key, stepId: lostStep },
            "self-healed: stale ai plan evicted from cache",
          );
        }
      } else {
        insertEvent(db, { sessionId: session.id, type: ev.type, payload: ev.payload });
      }
    }
    return { ok: true };
  });
}
