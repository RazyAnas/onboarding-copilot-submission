/** Server runtime configuration, sourced from the environment. */
/** Vendor-agnostic AI configuration. Provider is swappable; Gemini is the first impl. */
export interface AiConfig {
  /** Which provider implementation to use. "none" = deterministic fallback only. */
  provider: "gemini" | "none";
  /** API key for the selected provider (from AI_API_KEY or GEMINI_API_KEY). */
  apiKey?: string;
  /** Model id, e.g. "gemini-2.5-pro". */
  model: string;
}

export interface ServerConfig {
  port: number;
  host: string;
  /** Max request body size in bytes (snapshots can be large). */
  bodyLimit: number;
  /** SQLite file path, or ":memory:" for tests. */
  dbPath: string;
  ai: AiConfig;
}

function loadAiConfig(): AiConfig {
  const apiKey = process.env.AI_API_KEY ?? process.env.GEMINI_API_KEY;
  // Default to gemini when a key is present, otherwise deterministic-only.
  const provider = (process.env.AI_PROVIDER as AiConfig["provider"] | undefined) ??
    (apiKey ? "gemini" : "none");
  const config: AiConfig = {
    provider,
    model: process.env.AI_MODEL ?? "gemini-2.5-pro",
  };
  if (apiKey) config.apiKey = apiKey;
  return config;
}

export function loadConfig(): ServerConfig {
  return {
    port: Number(process.env.PORT ?? 8787),
    host: process.env.HOST ?? "0.0.0.0",
    bodyLimit: Number(process.env.BODY_LIMIT ?? 8 * 1024 * 1024),
    dbPath: process.env.DB_PATH ?? "data/copilot.db",
    ai: loadAiConfig(),
  };
}
