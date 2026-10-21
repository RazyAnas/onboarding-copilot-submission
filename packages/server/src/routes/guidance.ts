import type { FastifyInstance } from "fastify";
import {
  FlowDefinitionSchema,
  GuidanceRequestSchema,
  GuidanceResponseSchema,
  decodeSnapshot,
} from "@copilot/shared";
import type { DB } from "../db/connection.js";
import {
  createFlow,
  createSession,
  getFlowById,
  getFlowByKey,
  getSession,
  getTenantByApiKey,
  updateSession,
  type SessionRow,
} from "../db/repos.js";
import { planGuidance } from "../planner.js";
import type { AiProvider } from "../ai/index.js";
import { retrieveFlowForGoal } from "../ai/retrieve.js";
import { planAiGuide } from "../ai/guide.js";
import { resolvePlanForGoal } from "../compile.js";
import { recordEvent, recordTargetLost } from "../telemetry.js";

/** Per-session state stored in sessions.state_json. */
interface SessionState {
  kind?: "flow" | "ai_guide";
  goal?: string;
  manual?: boolean;
  history?: string[];
}

function safeParseState(json: string): SessionState {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as SessionState) : {};
  } catch {
    return {};
  }
}

/**
 * POST /v1/guidance — the main loop endpoint. Supports two session kinds:
 *  - "flow": a pre-authored deterministic flow (+ optional AI disambiguation).
 *  - "ai_guide": an AI-generated guide for a free-form goal, grounded in the page.
 * A free-form `aiGoal` is first retrieved against authored flows (RAG); a confident
 * match runs the reliable flow, otherwise we plan agentically against the live page.
 */
export function registerGuidanceRoute(
  app: FastifyInstance,
  db: DB,
  aiProvider: AiProvider,
  embedder?: Parameters<typeof resolvePlanForGoal>[7],
): void {
  app.post("/v1/guidance", async (request, reply) => {
    const parsed = GuidanceRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_request", issues: parsed.error.issues };
    }
    const { apiKey, snapshot, sessionId, flowKey, aiGoal, recentEvents, control } =
      parsed.data;

    const tenant = getTenantByApiKey(db, apiKey);
    if (!tenant) {
      reply.code(401);
      return { error: "invalid_api_key" };
    }

    let session = sessionId ? getSession(db, sessionId) : undefined;
    if (session && session.tenant_id !== tenant.id) {
      reply.code(403);
      return { error: "session_tenant_mismatch" };
    }

    const elements = decodeSnapshot(snapshot);

    // --- Start a new session if needed -----------------------------------
    if (!session) {
      if (aiGoal) {
        // Plan-time compilation (retrieval → cache → compile); see compile.ts.
        const resolved = await resolvePlanForGoal(
          db, tenant.id, aiGoal, snapshot.url, elements, aiProvider, request.log, embedder,
        );

        if (resolved.kind === "infeasible") {
          session = createSession(db, {
            tenantId: tenant.id,
            flowId: "",
            currentStepId: null,
            stateJson: JSON.stringify({ kind: "ai_guide", goal: aiGoal }),
          });
          updateSession(db, session.id, { currentStepId: null, status: "completed" });
          recordEvent(db, session.id, "ai_flow_infeasible", { goal: aiGoal, reason: resolved.reason });
          return GuidanceResponseSchema.parse({
            sessionId: session.id,
            stepId: null,
            stepIndex: 0,
            totalSteps: 0,
            instruction: {
              kind: "tooltip",
              content: { title: "Can't guide that here", body: resolved.reason },
            },
            confidence: 0,
            mode: "ai",
            reasoning: "authoring judged goal infeasible",
          });
        }

        if (resolved.kind === "flow") {
          session = createSession(db, {
            tenantId: tenant.id,
            flowId: resolved.flowRow.id,
            currentStepId: resolved.def.steps[0]!.id,
            stateJson: JSON.stringify({ kind: "flow", goal: aiGoal }),
          });
          recordEvent(db, session.id, "flow_started", {
            flowKey: resolved.flowRow.key,
            goal: aiGoal,
            source: resolved.source,
          });
          if (resolved.source === "compiled") {
            recordEvent(db, session.id, "ai_flow_compiled", {
              flowKey: resolved.flowRow.key,
              goal: aiGoal,
            });
          }
        } else {
          // JIT fallback: agentic page-grounded guide, one step at a time.
          session = createSession(db, {
            tenantId: tenant.id,
            flowId: "",
            currentStepId: null,
            stateJson: JSON.stringify({ kind: "ai_guide", goal: aiGoal, history: [] }),
          });
          recordEvent(db, session.id, "flow_started", { goal: aiGoal, source: "jit_guide" });
          if (resolved.cause === "authoring_failed") {
            recordEvent(db, session.id, "ai_authoring_failed", { goal: aiGoal });
          }
        }
      } else if (flowKey) {
        const flowRow = getFlowByKey(db, tenant.id, flowKey);
        if (!flowRow) {
          reply.code(400);
          return { error: "flow_key_required_or_unknown" };
        }
        const flowDef = FlowDefinitionSchema.parse(JSON.parse(flowRow.definition_json));
        session = createSession(db, {
          tenantId: tenant.id,
          flowId: flowRow.id,
          currentStepId: flowDef.steps[0]!.id,
          stateJson: JSON.stringify({ kind: "flow" }),
        });
        recordEvent(db, session.id, "flow_started", { flowKey, source: "configured" });
      } else {
        reply.code(400);
        return { error: "flow_key_or_ai_goal_required" };
      }
    }

    const state = safeParseState(session.state_json);

    const response =
      state.kind === "ai_guide"
        ? await runAiGuide(db, session, state, snapshot.url, elements, aiProvider, request.log)
        : await runFlow(db, session, state, snapshot.url, elements, recentEvents, control, aiProvider, request.log);

    return GuidanceResponseSchema.parse(response);
  });
}

async function runFlow(
  db: DB,
  session: SessionRow,
  state: SessionState,
  url: string,
  elements: ReturnType<typeof decodeSnapshot>,
  recentEvents: Parameters<typeof planGuidance>[5],
  control: Parameters<typeof planGuidance>[6],
  aiProvider: AiProvider,
  log: { info: (o: unknown, m: string) => void },
) {
  const flowRow = getFlowById(db, session.flow_id);
  if (!flowRow) {
    return doneResponse(session.id, "This guide is no longer available.");
  }
  const flow = FlowDefinitionSchema.parse(JSON.parse(flowRow.definition_json));
  const prevStepId = session.current_step_id;
  const prevStatus = session.status;
  const plan = await planGuidance(
    flow,
    session.current_step_id,
    state,
    elements,
    url,
    recentEvents,
    control,
    { provider: aiProvider },
  );
  updateSession(db, session.id, {
    currentStepId: plan.currentStepId,
    status: plan.status,
    stateJson: JSON.stringify({ ...state, manual: plan.manual }),
  });

  // Server-emitted funnel events (transition-edge triggered, so polling is silent).
  if (plan.currentStepId !== prevStepId && prevStatus === "active" && plan.status === "active") {
    recordEvent(db, session.id, "step_advanced", {
      from: prevStepId,
      to: plan.currentStepId,
      stepIndex: plan.stepIndex,
      ...(control ? { control } : {}),
    });
  }
  if (plan.status === "completed" && prevStatus !== "completed") {
    recordEvent(db, session.id, "flow_completed", { flowKey: flowRow.key });
  }
  if (
    plan.status === "active" &&
    plan.stepState === "active" &&
    plan.instruction.kind === "tooltip" &&
    plan.stepId
  ) {
    const invalidated = recordTargetLost(db, session.id, flowRow, plan.stepId);
    if (invalidated) {
      log.info(
        { flowKey: flowRow.key, stepId: plan.stepId },
        "self-healed: stale ai plan evicted from cache",
      );
    }
  }
  log.info({ sessionId: session.id, kind: "flow", stepId: plan.stepId, mode: plan.mode }, "guidance");
  return {
    sessionId: session.id,
    stepId: plan.stepId,
    stepIndex: plan.stepIndex,
    totalSteps: plan.totalSteps,
    ...(plan.stepState ? { stepState: plan.stepState } : {}),
    manual: plan.manual,
    instruction: plan.instruction,
    confidence: plan.confidence,
    mode: plan.mode,
    reasoning: plan.reasoning,
  };
}

async function runAiGuide(
  db: DB,
  session: SessionRow,
  state: SessionState,
  url: string,
  elements: ReturnType<typeof decodeSnapshot>,
  aiProvider: AiProvider,
  log: { info: (o: unknown, m: string) => void },
) {
  if (session.status === "completed") {
    return doneResponse(session.id, "Guide complete.");
  }
  const retrieval = await retrieveFlowForGoal(db, session.tenant_id, state.goal ?? "");
  const result = await planAiGuide(aiProvider, {
    goal: state.goal ?? "",
    url,
    elements,
    history: state.history ?? [],
    knownPaths: retrieval.knownPaths,
  });
  updateSession(db, session.id, {
    currentStepId: null,
    status: result.status,
    stateJson: JSON.stringify({ ...state, history: result.history }),
  });
  if (result.status === "completed" && session.status !== "completed") {
    recordEvent(db, session.id, "flow_completed", { kind: "ai_guide", goal: state.goal });
  }
  log.info(
    { sessionId: session.id, kind: "ai_guide", status: result.status, mode: result.mode },
    "guidance",
  );
  return {
    sessionId: session.id,
    stepId: "ai-guide",
    stepIndex: 0,
    totalSteps: 0,
    instruction: result.instruction,
    confidence: result.confidence,
    mode: result.mode,
    reasoning: result.reasoning,
  };
}

function doneResponse(sessionId: string, body: string) {
  return {
    sessionId,
    stepId: null,
    stepIndex: 0,
    totalSteps: 0,
    instruction: { kind: "done" as const, content: { title: "Done", body } },
    confidence: 1,
    mode: "deterministic" as const,
    reasoning: "completed",
  };
}
