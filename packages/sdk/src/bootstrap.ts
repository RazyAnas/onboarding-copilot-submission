import type {
  SemanticElement,
  PageSnapshot,
  GuidanceResponse,
  TargetDescriptor,
  Control,
} from "@copilot/shared";
import { resolveConfig, type CopilotConfig, type ResolvedConfig } from "./config.js";
import { Logger } from "./log.js";
import { OverlayRenderer, type CardMeta, type TooltipContent } from "./overlay/renderer.js";
import { DebugPanel } from "./overlay/debug-panel.js";
import { Composer } from "./overlay/composer.js";
import { browserHost, type HostAdapter } from "./host/host-adapter.js";
import { GuidanceEngine } from "./engine/guidance-engine.js";
import { DiscoveryController } from "./discovery/discovery-controller.js";
import { streamChat } from "./transport.js";

export type CopilotState = "idle" | "running" | "paused";

/** How long a re-resolved node is trusted before re-running the matcher. */
const RESOLVE_TTL_MS = 500;
/**
 * Event-class-aware tick scheduling (M9.5). Ticks are LOCAL and ~free, so
 * user-intent events re-plan almost immediately; only anonymous DOM mutation
 * bursts get a settle window.
 */
const SETTLE_INTENT_MS = 50; // clicks, route changes, user input
const SETTLE_MUTATION_MS = 120; // anonymous DOM churn (render bursts)

/**
 * Public SDK facade + orchestrator. Owns lifecycle, the render loop, and wiring
 * between the modular boundaries — host integration ({@link HostAdapter}), the
 * headless {@link GuidanceEngine}, discovery ({@link DiscoveryController}), the
 * overlay, and the composer. The orchestrator holds no host globals and no
 * guidance state itself; each concern evolves independently behind its module.
 */
export class Copilot {
  readonly config: ResolvedConfig;
  private readonly log: Logger;
  private readonly host: HostAdapter;
  private readonly overlay: OverlayRenderer;
  private readonly composer: Composer;
  private readonly engine: GuidanceEngine;
  private readonly discovery: DiscoveryController;
  private readonly debugPanel: DebugPanel | null;

  private state: CopilotState = "idle";
  private currentTarget: TargetDescriptor | null = null;
  private resolveCache: { node: Element | null; at: number } = { node: null, at: 0 };

  private routeCleanup: (() => void) | null = null;
  private mutationCleanup: (() => void) | null = null;
  private clickCleanup: (() => void) | null = null;
  private inputCleanup: (() => void) | null = null;
  private scheduleTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(config: CopilotConfig) {
    this.config = resolveConfig(config);
    this.log = new Logger(this.config.debug);
    this.host = browserHost();

    this.composer = new Composer();
    this.composer.setTheme(this.config.theme);
    this.composer.setHandlers({
      onSubmit: (text) => void this.askComposer(text),
      onGuide: (goal) => this.startAiGuide(goal),
      onStartFlow: (flowKey) => this.startFlow(flowKey),
    });

    this.engine = new GuidanceEngine({
      config: this.config,
      host: this.host,
      log: this.log,
      onAnswer: (text) => this.composer.showAnswer(text),
    });

    this.overlay = new OverlayRenderer();
    this.overlay.setTheme(this.config.theme);
    this.overlay.setHandlers({
      onNext: () => this.next(),
      onBack: () => this.back(),
      onSkip: () => this.skip(),
      onAsk: () => this.openChat(),
      onSkipReason: (reason) =>
        this.engine.report("step_skipped", { reason, stepId: this.engine.stepId }),
      onResume: () => this.sendControl("resume"),
      onPause: () => (this.state === "paused" ? this.resume() : this.pause()),
      onHide: () => this.hide(),
      onDismiss: () => this.dismiss(),
      onRelaunch: () => this.relaunch(),
    });

    this.debugPanel = this.config.debug ? new DebugPanel() : null;
    this.discovery = new DiscoveryController({
      config: this.config,
      log: this.log,
      onStartFlow: (flowKey) => this.startFlow(flowKey),
      onAsk: () => this.openChat(),
      onSuggestions: (prompts) => this.composer.setSuggestions(prompts),
      onGuides: (guides) => this.composer.setGuides(guides),
    });
    this.log.info("initialized", { serverUrl: this.config.serverUrl });
  }

  static init(config: CopilotConfig): Copilot {
    const instance = new Copilot(config);
    instance.overlay.mount();
    instance.composer.mount();
    instance.debugPanel?.mount();
    instance.discovery.mount();
    void instance.refreshDiscovery();
    if (instance.config.debug) {
      (window as unknown as { __copilot?: Copilot }).__copilot = instance;
    }
    if (instance.config.autoStart) instance.start();
    return instance;
  }

  /** Re-fetch the Layer 1 discovery feed and re-render the dock. Best-effort. */
  refreshDiscovery(): Promise<void> {
    return this.discovery.refresh();
  }

  getState(): CopilotState {
    return this.state;
  }

  // ---- Lifecycle -----------------------------------------------------------

  start(): void {
    if (this.state === "running") return;
    this.state = "running";
    this.installObservers();
    this.scheduleGuidance(0);
    this.log.info("started");
  }

  pause(): void {
    if (this.state !== "running") return;
    this.state = "paused";
    this.teardownObservers();
    this.overlay.setPaused(true);
    this.log.info("paused");
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.state = "running";
    this.overlay.setPaused(false);
    this.installObservers();
    this.scheduleGuidance(0);
    this.log.info("resumed");
  }

  reset(): void {
    this.teardownObservers();
    this.overlay.clear();
    this.currentTarget = null;
    this.engine.reset();
    this.state = "idle";
    this.log.info("reset");
  }

  /** Collapse the guide to a launcher pill; the engine keeps running silently. */
  hide(): void {
    this.overlay.collapseToLauncher();
    this.log.info("hidden");
  }

  /** Dismiss the guide for now: stop the loop and collapse to the launcher. */
  dismiss(): void {
    this.teardownObservers();
    this.state = "paused";
    this.overlay.collapseToLauncher();
    this.log.info("dismissed");
  }

  /** Re-open from the launcher pill (restarts the loop if it was stopped). */
  relaunch(): void {
    this.overlay.reveal();
    if (this.state === "running") {
      this.scheduleGuidance(0);
    } else {
      this.state = "idle";
      this.start();
    }
    this.log.info("relaunched");
  }

  next(): void {
    this.sendControl("next");
  }
  back(): void {
    this.sendControl("back");
  }
  skip(): void {
    this.sendControl("skip");
  }

  private sendControl(control: Control): void {
    if (this.state === "idle") return;
    if (this.state === "paused") this.resume();
    void this.applyGuidance(control);
  }

  destroy(): void {
    this.engine.flush(); // flush pending events (keepalive survives unload)
    this.teardownObservers();
    this.overlay.destroy();
    this.composer.destroy();
    this.debugPanel?.destroy();
    this.discovery.destroy();
    this.state = "idle";
    this.log.info("destroyed");
  }

  // ---- Page understanding (also useful standalone / for tests) -------------

  captureElements(): SemanticElement[] {
    return this.host.extractElements();
  }

  buildSnapshot(): PageSnapshot {
    return this.host.buildSnapshot();
  }

  /** One guidance tick (delegated to the headless engine). */
  requestGuidance(control?: Control): Promise<GuidanceResponse> {
    return this.engine.tick(control);
  }

  // ---- Public surface controls ---------------------------------------------

  /** Re-theme every surface at runtime (token overrides; validated + clamped). */
  setTheme(theme: Parameters<OverlayRenderer["setTheme"]>[0]): void {
    this.overlay.setTheme(theme);
    this.composer.setTheme(theme);
    this.discovery.setTheme(theme);
  }

  /** Open / close the summoned composer programmatically. */
  openChat(): void {
    this.composer.open();
  }
  closeChat(): void {
    this.composer.close();
  }

  /** Start a specific authored flow (e.g. chosen from the discovery checklist). */
  startFlow(flowKey: string): void {
    this.engine.setFlow(flowKey);
    this.currentTarget = null;
    this.discovery.collapse();
    this.kick();
    this.log.info("startFlow", { flowKey });
  }

  /** Start an AI-generated live guide for a free-form goal (e.g. a chat question). */
  startAiGuide(goal: string): void {
    this.engine.setGoal(goal);
    this.currentTarget = null;
    this.composer.close();
    // Immediate feedback — building a guide can take a couple seconds, so never
    // leave the user staring at nothing while authoring runs.
    this.overlay.show(() => null, {
      content: { title: "Guiding you", body: "Planning your guide…" },
      meta: { stepIndex: 0, totalSteps: 0 },
      targetKey: "planning",
    });
    this.kick();
    this.log.info("startAiGuide", { goal });
  }

  /**
   * Answer a question in the summoned composer, STREAMING tokens for an instant
   * feel. Feasibility (whether "Guide me" is offered) comes from the server's
   * real grounding — so chat and the guide never contradict.
   */
  async askComposer(message: string): Promise<void> {
    const history = this.composer.getHistory(); // prior turns (multi-turn context)
    this.composer.beginStream();
    try {
      const { guidable, mode } = await streamChat(
        this.config.serverUrl,
        {
          apiKey: this.config.apiKey,
          ...(this.config.flowKey ? { flowKey: this.config.flowKey } : {}),
          message,
          history,
          snapshot: this.host.buildSnapshot(),
        },
        (chunk) => this.composer.appendToken(chunk),
      );
      this.composer.finishStream({ guidable, goal: message });
      this.log.debug("chat", { mode, guidable });
    } catch (err) {
      this.composer.appendToken("Sorry — I couldn't reach the assistant. Please try again.");
      this.composer.finishStream({ guidable: false });
      this.log.warn("chat failed", err);
    }
  }

  // ---- Manual controls (demo hooks) ----------------------------------------

  highlightSelector(selector: string, content: TooltipContent, onCta?: () => void): void {
    this.overlay.show(() => this.host.rectOf(selector), onCta ? { content, onCta } : { content });
    this.log.debug("highlightSelector", selector);
  }

  clearHighlight(): void {
    this.overlay.clear();
  }

  // ---- Orchestration internals ---------------------------------------------

  /** Begin a freshly-set guide: schedule a tick, starting the loop if idle. */
  private kick(): void {
    if (this.state === "running") {
      this.scheduleGuidance(0);
    } else {
      this.state = "idle";
      this.start();
    }
  }

  private installObservers(): void {
    if (!this.mutationCleanup) {
      this.mutationCleanup = this.host.onMutation(() => this.scheduleGuidance(SETTLE_MUTATION_MS));
    }
    if (!this.routeCleanup) {
      this.routeCleanup = this.host.onRouteChange(() => {
        this.engine.recordEvent("route_change", { url: this.host.url() });
        this.scheduleGuidance(SETTLE_INTENT_MS);
      });
    }
    if (!this.clickCleanup) {
      this.clickCleanup = this.host.onClick((info) => {
        this.engine.recordEvent("click", { tag: info.tag, text: info.text, testId: info.testId });
        // A click IS user intent — re-plan immediately.
        this.scheduleGuidance(SETTLE_INTENT_MS);
      });
    }
    if (!this.inputCleanup) {
      this.inputCleanup = this.host.onInput(() => this.scheduleGuidance(SETTLE_INTENT_MS));
    }
  }

  private teardownObservers(): void {
    this.mutationCleanup?.();
    this.mutationCleanup = null;
    this.routeCleanup?.();
    this.routeCleanup = null;
    this.clickCleanup?.();
    this.clickCleanup = null;
    this.inputCleanup?.();
    this.inputCleanup = null;
    if (this.scheduleTimer !== null) {
      clearTimeout(this.scheduleTimer);
      this.scheduleTimer = null;
    }
  }

  private scheduleGuidance(delay = SETTLE_MUTATION_MS): void {
    if (this.state !== "running") return;
    if (this.scheduleTimer !== null) clearTimeout(this.scheduleTimer);
    this.scheduleTimer = setTimeout(() => {
      this.scheduleTimer = null;
      void this.applyGuidance();
    }, delay);
  }

  /** Run a tick and render its result onto the overlay. */
  private async applyGuidance(control?: Control): Promise<void> {
    if (this.state !== "running") return;
    let res: GuidanceResponse;
    try {
      res = await this.requestGuidance(control);
    } catch (err) {
      this.log.warn("guidance request failed", err);
      return;
    }
    if (this.state !== "running") return;

    this.debugPanel?.update(res, { state: this.state, bufferedEvents: this.engine.bufferedEvents });

    const meta: CardMeta = { stepIndex: res.stepIndex, totalSteps: res.totalSteps };
    if (res.stepState) meta.stepState = res.stepState;
    if (res.manual) meta.manual = true;
    // The checklist: proof the guide knows the whole journey, not just this step.
    const plan = this.engine.plan;
    if (plan) meta.steps = plan.steps.map((s) => s.instruction);

    if (res.instruction.kind === "done") {
      this.currentTarget = null;
      this.resolveCache = { node: null, at: 0 };
      meta.done = true;
      this.overlay.show(() => null, { content: res.instruction.content, meta, targetKey: "done" });
      this.log.info("flow complete", { sessionId: res.sessionId });
      void this.refreshDiscovery(); // a flow just completed — update the checklist
      return;
    }

    this.currentTarget = res.instruction.target ?? null;
    this.resolveCache = { node: null, at: 0 };
    const rectProvider = this.currentTarget ? () => this.resolveRect() : () => null;
    this.overlay.show(rectProvider, {
      content: res.instruction.content,
      meta,
      targetKey: `${res.stepId ?? "none"}:${res.stepState ?? "active"}`,
    });
  }

  /**
   * Live rect for the current target. Fast-paths a still-connected node and only
   * re-runs the matcher on a TTL or when the node vanished (rerender recovery).
   */
  private resolveRect(): DOMRect | null {
    if (!this.currentTarget) return null;
    const now = this.host.now();
    const cached = this.resolveCache.node;
    if (cached && cached.isConnected && now - this.resolveCache.at < RESOLVE_TTL_MS) {
      return cached.getBoundingClientRect();
    }
    const node = this.host.resolveElement(this.currentTarget);
    this.resolveCache = { node, at: now };
    return node ? node.getBoundingClientRect() : null;
  }
}
