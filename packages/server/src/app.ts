import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { loadConfig, type ServerConfig } from "./config.js";
import { openDb } from "./db/connection.js";
import { seed } from "./db/seed.js";
import { createAiProvider, type AiProvider } from "./ai/index.js";
import { createEmbedder } from "./ai/embeddings.js";
import { warmRetrieval } from "./ai/retrieve.js";
import { registerGuidanceRoute } from "./routes/guidance.js";
import { registerChatRoute } from "./routes/chat.js";
import { registerEventsRoute } from "./routes/events.js";
import { registerStatsRoute } from "./routes/stats.js";
import { registerSessionsRoutes } from "./routes/sessions.js";
import { registerOnboardingRoute } from "./routes/onboarding.js";

export interface AppDeps {
  /** Inject a provider (e.g. a fake) for tests; defaults to the configured one. */
  aiProvider?: AiProvider;
}

/** Build a configured Fastify instance (no listen) — used by both the server and tests. */
export async function buildApp(
  config: ServerConfig = loadConfig(),
  deps: AppDeps = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: config.bodyLimit,
  });

  const db = openDb(config.dbPath);
  seed(db);
  app.addHook("onClose", async () => db.close());

  const aiProvider = deps.aiProvider ?? createAiProvider(config.ai);
  app.log.info({ aiProvider: aiProvider.name, isAi: aiProvider.isAi }, "ai provider ready");
  // Hybrid-retrieval semantic signal; null when AI is off → lexical-only fallback.
  const embedder = createEmbedder(config.ai);
  // Pre-embed the corpus so the first user query doesn't pay cold-start latency.
  void warmRetrieval(db, embedder).catch((err) => app.log.warn({ err: String(err) }, "warm failed"));

  // The SDK runs on customer origins; reflect origin for local/dev use.
  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ status: "ok" }));
  registerGuidanceRoute(app, db, aiProvider, embedder);
  registerChatRoute(app, db, aiProvider, embedder);
  registerEventsRoute(app, db);
  registerStatsRoute(app, db);
  registerSessionsRoutes(app, db, aiProvider, embedder);
  registerOnboardingRoute(app, db);

  return app;
}
