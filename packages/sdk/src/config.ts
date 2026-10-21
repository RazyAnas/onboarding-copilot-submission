import type { ThemeConfig } from "@copilot/shared";

export interface CopilotConfig {
  /** Customer site/company API key. */
  apiKey: string;
  /** Backend base URL. Defaults to http://localhost:8787. */
  serverUrl?: string;
  /** Flow to run when a session starts. */
  flowKey?: string;
  /** Enable verbose console logging + the debug overlay. */
  debug?: boolean;
  /** Start the guidance loop immediately after init. Default false. */
  autoStart?: boolean;
  /** Brand theming — tokens only (validated + contrast-clamped). */
  theme?: Partial<ThemeConfig>;
  /** Show the Layer 1 discovery dock (progress + checklist). Default true. */
  discovery?: boolean;
}

export type ResolvedConfig = Required<Omit<CopilotConfig, "flowKey" | "theme">> & {
  flowKey?: string;
  theme?: Partial<ThemeConfig>;
};

const DEFAULTS = {
  serverUrl: "http://localhost:8787",
  debug: false,
  autoStart: false,
} as const;

export function resolveConfig(config: CopilotConfig): ResolvedConfig {
  if (!config.apiKey || typeof config.apiKey !== "string") {
    throw new Error("[copilot] config.apiKey is required");
  }
  const resolved: ResolvedConfig = {
    apiKey: config.apiKey,
    serverUrl: config.serverUrl ?? DEFAULTS.serverUrl,
    debug: config.debug ?? DEFAULTS.debug,
    autoStart: config.autoStart ?? DEFAULTS.autoStart,
    discovery: config.discovery ?? true,
  };
  if (config.flowKey !== undefined) resolved.flowKey = config.flowKey;
  if (config.theme !== undefined) resolved.theme = config.theme;
  return resolved;
}
