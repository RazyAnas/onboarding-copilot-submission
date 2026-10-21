import type {
  Control,
  EventReport,
  FlowDefinition,
  GuidanceResponse,
} from "@copilot/shared";
import { planNext } from "@copilot/shared";
import type { ResolvedConfig } from "../config.js";
import type { Logger } from "../log.js";
import type { HostAdapter } from "../host/host-adapter.js";
import { postCheckpoint, resumeSession, startSession } from "../transport.js";

export interface EngineDeps {
  config: ResolvedConfig;
  host: HostAdapter;
  log: Logger;
  /** Surface honest text when no guided plan is possible (infeasible / no AI). */
  onAnswer: (text: string) => void;
}

/**
 * The headless guidance engine (M9 runtime split). Owns the local-execution
 * state machine: fetch/resume the compiled plan once, then run the shared
 * deterministic executor against the live page every tick with zero network,
 * persisting asynchronously via checkpoints. Renders nothing and touches no
 * globals — it talks to the page only through the {@link HostAdapter}, so it is
 * reusable and testable independent of any host site.
 */
export class GuidanceEngine {
  private readonly config: ResolvedConfig;
  private readonly host: HostAdapter;
  private readonly log: Logger;
  private readonly onAnswer: (text: string) => void;

  private plan_: FlowDefinition | null = null;
  private sessionId: string | undefined;
  private aiGoal: string | undefined;
  private flowOverride: string | undefined;
  private currentStepId: string | null = null;
  private manual = false;
  private flowStatus: "active" | "completed" = "active";
  /** Events awaiting the next checkpoint flush (funnel truth). */
  private checkpointQueue: EventReport[] = [];
  private lastLostStepId: string | null = null;
  /** Ring buffer of user events, drained into each tick. */
  private recentEvents: EventReport[] = [];

  constructor(deps: EngineDeps) {
    this.config = deps.config;
    this.host = deps.host;
    this.log = deps.log;
    this.onAnswer = deps.onAnswer;
  }

  get plan(): FlowDefinition | null {
    return this.plan_;
  }
  get stepId(): string | null {
    return this.currentStepId;
  }
  get bufferedEvents(): number {
    return this.recentEvents.length;
  }

  /** Buffer a user event for the next tick (capped ring buffer). */
  recordEvent(type: EventReport["type"], payload?: Record<string, unknown>): void {
    this.recentEvents.push({
      sessionId: this.sessionId ?? "",
      type,
      ...(payload ? { payload } : {}),
      at: Date.now(),
    });
    if (this.recentEvents.length > 20) this.recentEvents.shift();
  }

  /** Immediate funnel report (bypasses the per-tick buffer), e.g. a skip reason. */
  report(type: EventReport["type"], payload?: Record<string, unknown>): void {
    this.checkpointQueue.push({
      sessionId: this.sessionId ?? "",
      type,
      ...(payload ? { payload } : {}),
      at: Date.now(),
    });
    this.checkpoint();
  }

  /** The next new session is an AI-generated guide for this free-form goal. */
  setGoal(goal: string): void {
    this.aiGoal = goal;
    this.flowOverride = undefined;
    this.resetSession();
  }
  /** The next new session runs this specific authored flow. */
  setFlow(flowKey: string): void {
    this.flowOverride = flowKey;
    this.aiGoal = undefined;
    this.resetSession();
  }
  reset(): void {
    this.aiGoal = undefined;
    this.flowOverride = undefined;
    this.resetSession();
  }
  /** Flush pending events (e.g. on unload; the checkpoint uses keepalive). */
  flush(): void {
    this.checkpoint();
  }

  /**
   * One guidance tick. Fetches/resumes the plan on first call, then executes it
   * locally. Returns an honest tooltip response when no plan can be produced.
   */
  async tick(control?: Control): Promise<GuidanceResponse> {
    if (!this.plan_) {
      const answer = await this.ensureSession();
      if (answer !== null) {
        return {
          sessionId: this.sessionId ?? "",
          stepId: null,
          stepIndex: 0,
          totalSteps: 0,
          instruction: { kind: "tooltip", content: { title: "Can't guide that here", body: answer } },
          confidence: 0,
          mode: "ai",
          reasoning: "no plan — answered instead",
        };
      }
    }
    const response = this.localTick(control);
    this.log.debug("guidance(local)", response);
    return response;
  }

  // ---- internals -----------------------------------------------------------

  private resetSession(): void {
    this.sessionId = undefined;
    this.plan_ = null;
    this.currentStepId = null;
    this.manual = false;
    this.host.storage.remove(this.storageKey);
  }

  /**
   * Resume the persisted session if one exists, else start a new one (the server
   * resolves/compiles the plan and ships it whole). Returns an answer string when
   * no plan could be produced (infeasible goal / AI unavailable), else null.
   */
  private async ensureSession(): Promise<string | null> {
    if (!this.aiGoal) {
      const stored = this.host.storage.get(this.storageKey);
      if (stored) {
        const resumed = await resumeSession(this.config.serverUrl, stored, this.config.apiKey);
        if (resumed && resumed.status === "active") {
          this.sessionId = resumed.sessionId;
          this.plan_ = resumed.flow;
          this.currentStepId = resumed.stepId;
          this.manual = resumed.manual;
          this.flowStatus = "active";
          this.log.info("session resumed", { sessionId: resumed.sessionId, stepId: resumed.stepId });
          return null;
        }
        this.host.storage.remove(this.storageKey);
      }
      if (!this.flowOverride && !this.config.flowKey)
        throw new Error("no flowKey configured and no AI goal set");
    }

    const flowKey = this.flowOverride ?? this.config.flowKey;
    const res = await startSession(this.config.serverUrl, {
      apiKey: this.config.apiKey,
      ...(this.aiGoal ? { aiGoal: this.aiGoal } : { flowKey: flowKey! }),
      snapshot: this.host.buildSnapshot(),
    });
    this.aiGoal = undefined; // consumed either way

    if (res.kind === "answer") {
      const answer = res.answer ?? "I can't guide that here.";
      this.onAnswer(answer); // honest text, not a fake guide
      return answer;
    }
    this.sessionId = res.sessionId!;
    this.plan_ = res.flow!;
    this.currentStepId = res.stepId ?? res.flow!.steps[0]!.id;
    this.manual = !!res.manual;
    this.flowStatus = "active";
    this.lastLostStepId = null;
    this.host.storage.set(this.storageKey, res.sessionId!);
    this.log.info("session started", { sessionId: res.sessionId, source: res.source });
    return null;
  }

  /** One synchronous executor tick against the live DOM. */
  private localTick(control?: Control): GuidanceResponse {
    const elements = this.host.extractElements();
    const events = this.recentEvents.slice();
    const result = planNext(
      this.plan_!,
      this.currentStepId,
      { manual: this.manual },
      elements,
      this.host.url(),
      events,
      control,
    );
    // Events get one shot at satisfying conditions, then flush to the funnel.
    this.checkpointQueue.push(...this.recentEvents.splice(0));

    // Grounding failure: an ACTIVE step we wanted to highlight but couldn't —
    // reported once per step; feeds the server's self-healing plan cache.
    if (
      result.status === "active" &&
      result.stepState === "active" &&
      result.instruction.kind === "tooltip" &&
      result.stepId
    ) {
      if (this.lastLostStepId !== result.stepId) {
        this.lastLostStepId = result.stepId;
        this.checkpointQueue.push({
          sessionId: this.sessionId ?? "",
          type: "target_lost",
          payload: { stepId: result.stepId },
          at: Date.now(),
        });
      }
    } else {
      this.lastLostStepId = null;
    }

    const changed =
      result.currentStepId !== this.currentStepId ||
      result.status !== this.flowStatus ||
      result.manual !== this.manual;
    this.currentStepId = result.currentStepId;
    this.manual = result.manual;
    this.flowStatus = result.status;
    if (changed || this.checkpointQueue.length > 0) this.checkpoint();
    if (result.status === "completed") this.host.storage.remove(this.storageKey);

    return {
      sessionId: this.sessionId ?? "",
      stepId: result.stepId,
      stepIndex: result.stepIndex,
      totalSteps: result.totalSteps,
      ...(result.stepState ? { stepState: result.stepState } : {}),
      manual: result.manual,
      instruction: result.instruction,
      confidence: result.confidence,
      mode: result.mode,
      reasoning: result.reasoning,
    };
  }

  /** Async, best-effort persistence of the step pointer + buffered events. */
  private checkpoint(): void {
    if (!this.sessionId) return;
    void postCheckpoint(this.config.serverUrl, this.sessionId, {
      apiKey: this.config.apiKey,
      stepId: this.currentStepId,
      status: this.flowStatus,
      manual: this.manual,
      events: this.checkpointQueue.splice(0, 50),
    });
  }

  private get storageKey(): string {
    return `__copilot_session_${this.config.apiKey}`;
  }
}
