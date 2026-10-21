import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { EventReportSchema } from "@copilot/shared";
import type { DB } from "../db/connection.js";
import { getSession, getTenantByApiKey, insertEvent } from "../db/repos.js";

const EventsRequestSchema = z.object({
  apiKey: z.string(),
  events: z.array(EventReportSchema).min(1).max(50),
});

/**
 * POST /v1/events — SDK/integrator-reported events (clicks, route changes,
 * custom analytics). Each event must reference a session owned by the caller's
 * tenant; unknown/foreign sessions are dropped, not errored, so one bad entry
 * can't poison a batch.
 */
export function registerEventsRoute(app: FastifyInstance, db: DB): void {
  app.post("/v1/events", async (request, reply) => {
    const parsed = EventsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_request", issues: parsed.error.issues };
    }
    const tenant = getTenantByApiKey(db, parsed.data.apiKey);
    if (!tenant) {
      reply.code(401);
      return { error: "invalid_api_key" };
    }

    let accepted = 0;
    for (const ev of parsed.data.events) {
      const session = getSession(db, ev.sessionId);
      if (!session || session.tenant_id !== tenant.id) continue;
      insertEvent(db, { sessionId: ev.sessionId, type: ev.type, payload: ev.payload });
      accepted += 1;
    }
    request.log.info({ accepted, sent: parsed.data.events.length }, "events ingested");
    return { accepted };
  });
}
