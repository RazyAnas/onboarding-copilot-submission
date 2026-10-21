import type { AiConfig } from "../config.js";
import type { AiProvider } from "./provider.js";
import { DeterministicProvider } from "./deterministic.js";
import { GeminiProvider } from "./gemini.js";

export type { AiProvider, AiCandidate, AiDecisionInput } from "./provider.js";
export { selectWithAi } from "./select.js";

/**
 * Build the configured provider. Vendor selection lives here and nowhere else —
 * add a `case` to support another model/company.
 */
export function createAiProvider(config: AiConfig): AiProvider {
  switch (config.provider) {
    case "gemini":
      if (config.apiKey) return new GeminiProvider(config.apiKey, config.model);
      return new DeterministicProvider();
    case "none":
    default:
      return new DeterministicProvider();
  }
}
