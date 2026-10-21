import type { ThemeConfig } from "@copilot/shared";
import type { ResolvedConfig } from "../config.js";
import type { Logger } from "../log.js";
import { DiscoveryDock } from "../overlay/discovery-dock.js";
import { fetchOnboarding } from "../transport.js";

export interface DiscoveryDeps {
  config: ResolvedConfig;
  log: Logger;
  onStartFlow: (flowKey: string) => void;
  onAsk: () => void;
  /** Feed example prompts (derived from onboarding flows) to the composer. */
  onSuggestions: (prompts: string[]) => void;
  /** Feed premade guides (startable flows) to the composer's empty state. */
  onGuides: (guides: { flowKey: string; name: string }[]) => void;
}

/**
 * Layer 1 discovery boundary: owns the progress dock and the onboarding feed.
 * Isolated so the discovery surface can evolve (announce/beacon, host-anchored,
 * etc.) without touching the guidance engine or the orchestrator.
 */
export class DiscoveryController {
  private readonly deps: DiscoveryDeps;
  private readonly dock: DiscoveryDock | null;

  constructor(deps: DiscoveryDeps) {
    this.deps = deps;
    this.dock = deps.config.discovery ? new DiscoveryDock() : null;
    this.dock?.setTheme(deps.config.theme);
    this.dock?.setHandlers({ onStartFlow: deps.onStartFlow, onAsk: deps.onAsk });
  }

  mount(): void {
    this.dock?.mount();
  }
  setTheme(theme: Partial<ThemeConfig> | undefined): void {
    this.dock?.setTheme(theme);
  }
  collapse(): void {
    this.dock?.collapse();
  }
  destroy(): void {
    this.dock?.destroy();
  }

  /** Fetch the recommended-flows feed and (re)render the dock + composer hints. */
  async refresh(): Promise<void> {
    try {
      const data = await fetchOnboarding(this.deps.config.serverUrl, this.deps.config.apiKey);
      this.dock?.setData(data);
      if (data) {
        this.deps.onSuggestions(data.flows.map((f) => `How do I ${f.name.toLowerCase()}?`));
        this.deps.onGuides(data.flows.map((f) => ({ flowKey: f.flowKey, name: f.name })));
      }
    } catch (err) {
      this.deps.log.warn("discovery fetch failed", err);
    }
  }
}
