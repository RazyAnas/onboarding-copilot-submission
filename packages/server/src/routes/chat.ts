import type { FastifyInstance } from "fastify";
import { PassThrough } from "node:stream";
import {
  ChatRequestSchema,
  FlowDefinitionSchema,
  decodeSnapshot,
  type FlowDefinition,
  type SemanticElement,
} from "@copilot/shared";
import type { DB } from "../db/connection.js";
import {
  getFlowById,
  getFlowByKey,
  getSession,
  getTenantByApiKey,
} from "../db/repos.js";
import type { AiProvider } from "../ai/index.js";
import type { Embedder } from "../ai/embeddings.js";
import { searchKnowledge } from "../knowledge.js";
import { retrieveFlowForGoal, tokens } from "../ai/retrieve.js";
import { elementMatchesGoal } from "../compile.js";

/**
 * Structured, model-neutral context: WHERE the user is (leads — answers must be
 * tailored to the current page), what's on their screen, app docs, and the
 * reference workflow. Page-awareness is the point: a user already on Settings
 * asking "how do I invite?" must be told to continue from there, not to
 * navigate to Settings again.
 */
function buildContext(
  flow: FlowDefinition | null,
  currentStepId: string | null,
  url: string | null,
  elements: SemanticElement[],
  knowledge: string[],
): string {
  const lines: string[] = [];

  if (url) lines.push(`The user is CURRENTLY at: ${url}`);
  const sections = [
    ...new Set(elements.filter((e) => e.visible && e.sectionLabel).map((e) => e.sectionLabel)),
  ].slice(0, 8);
  if (sections.length) lines.push(`Sections visible on their screen right now: ${sections.join(", ")}.`);
  const actions = elements
    .filter((e) => e.visible && e.name)
    .map((e) => (e.sectionLabel ? `${e.name} (in ${e.sectionLabel})` : e.name))
    .slice(0, 20);
  if (actions.length) lines.push(`Actions visible on their screen right now: ${actions.join(", ")}.`);

  lines.push(
    "",
    "IMPORTANT: answer relative to where the user already is. If they are already on the right page, acknowledge it (e.g. \"You're already on the Settings page\") and start from the NEXT action. Never tell them to navigate somewhere they already are. Skip any reference steps they have effectively completed.",
  );

  if (knowledge.length) {
    lines.push("", "App documentation (reference — adapt to the user's current location):");
    for (const k of knowledge) lines.push(`- ${k}`);
  }

  if (flow) {
    lines.push("", `Reference workflow "${flow.name}" (full recipe — adapt, don't recite):`);
    flow.steps.forEach((s, i) => lines.push(`${i + 1}. ${s.goal} — ${s.instruction}`));
    if (currentStepId) {
      const idx = flow.steps.findIndex((s) => s.id === currentStepId);
      if (idx >= 0) lines.push(`The user's guide session is on step ${idx + 1}.`);
    }
  }
  return lines.join("\n");
}

/** Does the message relate to the active/configured flow? */
function relatesToFlow(flow: FlowDefinition, message: string): boolean {
  const flowTokens = new Set(
    tokens(`${flow.name} ${flow.steps.map((s) => `${s.goal} ${s.instruction}`).join(" ")}`),
  );
  return tokens(message).some((t) => flowTokens.has(t));
}

/**
 * Feasibility from REAL grounding, not a model self-report (the reliable signal):
 * is there an authored flow, a visible on-page element, or the active flow that
 * actually covers this goal? If not, it isn't doable here. Docs alone are NOT
 * enough — they inform the answer but don't prove the action exists.
 */
async function assessGuidable(
  db: DB,
  tenantId: string,
  message: string,
  flow: FlowDefinition | null,
  elements: SemanticElement[],
  embedder?: Embedder | null,
): Promise<boolean> {
  if ((await retrieveFlowForGoal(db, tenantId, message, embedder)).match) return true;
  const msgTokens = new Set(tokens(message));
  if (elements.some((el) => elementMatchesGoal(msgTokens, el) > 0)) return true;
  if (flow && relatesToFlow(flow, message)) return true;
  return false;
}

/** Deterministic (AI-off) answer, honest about what's actually doable here. */
function deterministicAnswer(
  flow: FlowDefinition | null,
  message: string,
  guidable: boolean,
): string {
  if (!guidable) {
    return "I can help with this app, but I don't see a way to do that here. Try a task from the setup checklist, or ask about something on this page.";
  }
  if (flow && relatesToFlow(flow, message)) {
    const steps = flow.steps.map((s, i) => `${i + 1}. ${s.instruction}`).join("\n");
    return `Here's how to ${flow.name.toLowerCase()}:\n${steps}`;
  }
  return 'That\'s on this page — click "Guide me" and I\'ll point it out for you.';
}

export function registerChatRoute(
  app: FastifyInstance,
  db: DB,
  provider: AiProvider,
  embedder?: Embedder | null,
): void {
  app.post("/v1/chat", async (request, reply) => {
    const parsed = ChatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_request", issues: parsed.error.issues };
    }
    const { apiKey, message, sessionId, flowKey, snapshot, history } = parsed.data;

    const tenant = getTenantByApiKey(db, apiKey);
    if (!tenant) {
      reply.code(401);
      return { error: "invalid_api_key" };
    }

    const session = sessionId ? getSession(db, sessionId) : undefined;
    const flowRow = session
      ? getFlowById(db, session.flow_id)
      : flowKey
        ? getFlowByKey(db, tenant.id, flowKey)
        : undefined;
    const flow = flowRow
      ? FlowDefinitionSchema.parse(JSON.parse(flowRow.definition_json))
      : null;
    const elements = snapshot ? decodeSnapshot(snapshot) : [];

    // --- Pipeline profiling: where do the milliseconds before first token go? ---
    const t0 = performance.now();
    const knowledge = await searchKnowledge(db, tenant.id, message, embedder);
    const tKnowledge = performance.now();
    const context = buildContext(flow, session?.current_step_id ?? null, snapshot?.url ?? null, elements, knowledge);
    // Feasibility from grounding (decided here, not by the model) — sent as a
    // header so the SDK only offers "Guide me" when guiding can actually work.
    const guidable = await assessGuidable(db, tenant.id, message, flow, elements, embedder);
    const tGuidable = performance.now();
    const mode = provider.isAi ? "ai" : "deterministic";
    reply.header("x-copilot-guidable", guidable ? "1" : "0");
    reply.header("x-copilot-mode", mode);
    reply.header("access-control-expose-headers", "x-copilot-guidable, x-copilot-mode");
    reply.type("text/plain; charset=utf-8");

    // STREAM tokens for low time-to-first-token (feels instant). Deterministic mode
    // streams its honest, grounded answer as a single chunk.
    if (provider.isAi) {
      const out = new PassThrough();
      void (async () => {
        const stream = await provider.chat({ message, context, history });
        const tStreamReady = performance.now();
        let first = true;
        try {
          for await (const chunk of stream) {
            if (first) {
              first = false;
              request.log.info(
                {
                  knowledge_ms: Math.round(tKnowledge - t0),
                  guidable_ms: Math.round(tGuidable - tKnowledge),
                  stream_setup_ms: Math.round(tStreamReady - tGuidable),
                  model_ttft_ms: Math.round(performance.now() - tStreamReady),
                  total_ttft_ms: Math.round(performance.now() - t0),
                },
                "chat timing",
              );
            }
            out.write(chunk);
          }
        } catch (err) {
          request.log.warn({ err: String(err) }, "chat stream failed");
          out.write(deterministicAnswer(flow, message, guidable));
        } finally {
          out.end();
        }
      })();
      return reply.send(out);
    }
    request.log.info({ mode, guidable }, "chat (deterministic)");
    return reply.send(deterministicAnswer(flow, message, guidable));
  });
}
