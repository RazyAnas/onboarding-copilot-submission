import type { FastifyInstance } from "fastify";
import {
  FlowDefinitionSchema,
  OnboardingResponseSchema,
  type OnboardingItem,
} from "@copilot/shared";
import type { DB } from "../db/connection.js";
import { completedFlowIds, getTenantByApiKey, listFlows } from "../db/repos.js";

/**
 * GET /v1/onboarding?apiKey=<publishable>[&userRef=] — Layer 1 discovery feed.
 * Read-only: the tenant's authored onboarding flows (AI-compiled `ai:*` plans are
 * excluded) plus this user's completion status. The first incomplete flow is the
 * recommended "next"; the rest are "todo". Nothing here touches planning or the
 * execution hot path.
 */
export function registerOnboardingRoute(app: FastifyInstance, db: DB): void {
  app.get<{ Querystring: { apiKey?: string; userRef?: string } }>(
    "/v1/onboarding",
    async (request, reply) => {
      const tenant = getTenantByApiKey(db, request.query.apiKey ?? "");
      if (!tenant) {
        reply.code(401);
        return { error: "invalid_api_key" };
      }

      const done = completedFlowIds(db, tenant.id, request.query.userRef);
      const flows = listFlows(db, tenant.id).filter((f) => !f.key.startsWith("ai:"));

      let nextAssigned = false;
      const items: OnboardingItem[] = flows.map((row) => {
        const def = FlowDefinitionSchema.parse(JSON.parse(row.definition_json));
        let status: OnboardingItem["status"];
        if (done.has(row.id)) {
          status = "done";
        } else if (!nextAssigned) {
          status = "next";
          nextAssigned = true;
        } else {
          status = "todo";
        }
        return { flowKey: row.key, name: row.name, status, totalSteps: def.steps.length };
      });

      return OnboardingResponseSchema.parse({
        flows: items,
        completed: items.filter((i) => i.status === "done").length,
        total: items.length,
      });
    },
  );
}
