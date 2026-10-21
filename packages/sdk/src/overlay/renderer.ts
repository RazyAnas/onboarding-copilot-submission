import type { ThemeConfig } from "@copilot/shared";
import { applyTheme, resolveTheme } from "../ui/theme.js";
import { OVERLAY_CSS } from "./styles.js";

export interface TooltipContent {
  title?: string;
  body: string;
  cta?: string;
}

/** Returns the target's current viewport rect, or null if it isn't resolvable. */
export type RectProvider = () => DOMRect | null;

/** Coachmark metadata — present only for the engine-driven guidance card. */
export interface CardMeta {
  stepIndex: number;
  totalSteps: number;
  stepState?: "waiting" | "active";
  paused?: boolean;
  /** Flow finished — show a completion badge and hide step navigation. */
  done?: boolean;
  /** Manual mode (user navigated explicitly) — offers "Resume auto". */
  manual?: boolean;
  /** All step titles — renders the expandable checklist (the trust artifact). */
  steps?: string[];
}

export interface OverlayHandlers {
  onNext?: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  /** Optional one-tap reason captured AFTER a skip (analytics, non-blocking). */
  onSkipReason?: (reason: string) => void;
  /** Hand control back to auto-advance after manual navigation. */
  onResume?: () => void;
  /** Open the summoned composer to ask a free-form question (Layer 3). */
  onAsk?: () => void;
  onPause?: () => void;
  onHide?: () => void;
  onDismiss?: () => void;
  onRelaunch?: () => void;
}

export interface ShowOptions {
  content: TooltipContent;
  /** When present, render the full guidance card (controls + step badge). */
  meta?: CardMeta;
  onCta?: () => void;
  /**
   * Identity of the current attention target (e.g. stepId). When it CHANGES,
   * the spotlight/card travel to the new position (animated); while it stays
   * the same, tracking is frame-exact with no easing lag.
   */
  targetKey?: string;
}

/** Companion FSM states, exposed as data-cp-state for styling and tests. */
export type CompanionState =
  | "idle" | "active" | "waiting" | "celebrating" | "paused" | "hidden";

const SPOTLIGHT_PADDING = 6;
const CARD_GAP = 12;

/**
 * Renders a soft spotlight + a non-blocking guidance card in an isolated shadow
 * root. The card persists (and stays controllable) even when there is no target
 * to highlight. Holds no DOM node for the target — it re-asks the RectProvider
 * each frame, so it survives rerenders.
 */
export class OverlayRenderer {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private spotlight: HTMLDivElement;
  private card: HTMLDivElement;
  private badge: HTMLSpanElement;
  private titleEl: HTMLParagraphElement;
  private bodyEl: HTMLParagraphElement;
  private ctaButton: HTMLButtonElement;
  private nav: HTMLDivElement;
  private backBtn: HTMLButtonElement;
  private skipBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private topCtl: HTMLDivElement;
  private pauseBtn: HTMLButtonElement;
  private launcher: HTMLButtonElement;
  private resumeBtn!: HTMLButtonElement;
  private stepsToggle!: HTMLButtonElement;
  private stepsList!: HTMLOListElement;
  private skipReasons!: HTMLDivElement;
  private stepsOpen = false;
  private skipReasonTimer: ReturnType<typeof setTimeout> | null = null;
  private scrim!: HTMLDivElement;
  private progress!: HTMLDivElement;
  private celebrateWrap!: HTMLDivElement;
  private lastTargetKey: string | null = null;
  private travelTimer: ReturnType<typeof setTimeout> | null = null;
  private celebrationTimer: ReturnType<typeof setTimeout> | null = null;
  private scrimEnabled = false;
  private celebrationEnabled = true;
  private lastBody = "";

  private handlers: OverlayHandlers = {};
  private rectProvider: RectProvider | null = null;
  private rafId: number | null = null;
  private onCta: (() => void) | null = null;
  private userHidden = false;

  constructor(accentColor?: string) {
    this.host = document.createElement("div");
    this.host.setAttribute("data-copilot-overlay", "");
    this.host.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
    this.root = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = OVERLAY_CSS;
    this.root.appendChild(style);
    this.setTheme(accentColor ? { accent: accentColor } : {});
    this.setState("idle");

    this.scrim = el("div", "scrim");
    this.spotlight = el("div", "spotlight hidden");

    this.card = el("div", "card hidden");
    this.progress = el("div", "card__progress");
    this.card.append(this.progress);

    // Celebration surface (animated check) — injected above the body when done.
    this.celebrateWrap = el("div", "hidden");
    this.celebrateWrap.innerHTML =
      '<svg class="celebrate__check" viewBox="0 0 44 44" aria-hidden="true">' +
      '<circle cx="22" cy="22" r="20.5"/><path d="M13.5 22.5l6 6 11-12"/></svg>';
    const head = el("div", "card__head");
    this.badge = el("span", "card__badge");
    this.topCtl = el("div", "card__topctl");
    const askBtn = iconBtn("Ask", () => this.handlers.onAsk?.());
    askBtn.dataset.cp = "ask";
    this.pauseBtn = iconBtn("Pause", () => this.handlers.onPause?.());
    this.pauseBtn.dataset.cp = "pause";
    const hideBtn = iconBtn("Hide", () => this.handlers.onHide?.());
    hideBtn.dataset.cp = "hide";
    const dismissBtn = iconBtn("✕", () => this.handlers.onDismiss?.());
    dismissBtn.dataset.cp = "dismiss";
    this.topCtl.append(askBtn, this.pauseBtn, hideBtn, dismissBtn);
    head.append(this.badge, this.topCtl);

    this.titleEl = el("p", "card__title hidden");
    this.bodyEl = el("p", "card__body");
    this.ctaButton = el("button", "card__cta hidden");
    this.ctaButton.addEventListener("click", () => this.onCta?.());

    this.nav = el("div", "card__nav");
    this.backBtn = navBtn("Back", () => this.handlers.onBack?.());
    this.backBtn.dataset.cp = "back";
    this.skipBtn = navBtn("Skip", () => {
      this.handlers.onSkip?.();
      this.showSkipReasons(); // skip is instant; the "why" is optional, after
    });
    this.skipBtn.dataset.cp = "skip";
    this.resumeBtn = navBtn("Resume auto", () => this.handlers.onResume?.());
    this.resumeBtn.dataset.cp = "resume";
    this.resumeBtn.classList.add("hidden");
    this.nextBtn = navBtn("Next", () => this.handlers.onNext?.(), true);
    this.nextBtn.dataset.cp = "next";
    this.nav.append(this.backBtn, this.skipBtn, this.resumeBtn, el("div", "spacer"), this.nextBtn);

    // Expandable checklist of every step (collapsed by default).
    this.stepsToggle = el("button", "card__stepstoggle hidden");
    this.stepsToggle.dataset.cp = "steps-toggle";
    this.stepsToggle.addEventListener("click", () => {
      this.stepsOpen = !this.stepsOpen;
      this.stepsList.classList.toggle("hidden", !this.stepsOpen);
      if (this.lastMeta) this.renderSteps(this.lastMeta);
    });
    this.stepsList = el("ol", "card__steps hidden");
    this.stepsList.dataset.cp = "steps";

    // One-tap skip-reason chips (shown briefly after a skip; never blocking).
    this.skipReasons = el("div", "card__skipreasons hidden");
    for (const reason of ["Already done", "Not now", "Can't find it"]) {
      const chip = el("button", "chip");
      chip.textContent = reason;
      chip.addEventListener("click", () => {
        this.handlers.onSkipReason?.(reason);
        this.hideSkipReasons();
      });
      this.skipReasons.append(chip);
    }

    this.card.append(
      head, this.celebrateWrap, this.titleEl, this.bodyEl, this.ctaButton,
      this.skipReasons, this.stepsToggle, this.stepsList, this.nav,
    );

    this.launcher = el("button", "launcher hidden");
    this.launcher.textContent = "Guide";
    this.launcher.dataset.cp = "launcher";
    this.launcher.addEventListener("click", () => this.handlers.onRelaunch?.());

    this.root.append(this.scrim, this.spotlight, this.card, this.launcher);
  }

  setHandlers(handlers: OverlayHandlers): void {
    this.handlers = handlers;
  }

  /** Apply tenant theme tokens (validated + clamped) to the shadow host. */
  setTheme(config: Partial<ThemeConfig> | undefined): void {
    const { vars, config: resolved } = resolveTheme(config);
    applyTheme(this.host, vars);
    this.scrimEnabled = resolved.scrim;
    this.celebrationEnabled = resolved.celebration;
    if (this.launcher) {
      const [v, h] = resolved.placement.split("-") as ["top" | "bottom", "left" | "right"];
      this.launcher.style.top = v === "top" ? "18px" : "auto";
      this.launcher.style.bottom = v === "bottom" ? "18px" : "auto";
      this.launcher.style.left = h === "left" ? "18px" : "auto";
      this.launcher.style.right = h === "right" ? "18px" : "auto";
    }
  }

  /** Current FSM state — visible to CSS and tests via data-cp-state. */
  private setState(state: CompanionState): void {
    this.host.setAttribute("data-cp-state", state);
  }

  mount(): void {
    if (!this.host.isConnected) document.body.appendChild(this.host);
  }

  /** Begin tracking a target and render the card. Respects the user-hidden state. */
  show(rectProvider: RectProvider, options: ShowOptions): void {
    this.mount();
    this.rectProvider = rectProvider;
    this.onCta = options.onCta ?? null;

    // Attention shift: when the target IDENTITY changes, the ring + card travel
    // (eased); while it's the same target, tracking stays frame-exact.
    const key = options.targetKey ?? null;
    if (key !== this.lastTargetKey) {
      this.lastTargetKey = key;
      this.spotlight.classList.add("spotlight--travel", "spotlight--arrive");
      if (this.travelTimer) clearTimeout(this.travelTimer);
      this.travelTimer = setTimeout(() => {
        this.spotlight.classList.remove("spotlight--travel", "spotlight--arrive");
        this.travelTimer = null;
      }, 1000);
    }

    this.renderContent(options);
    if (this.userHidden) {
      this.collapseToLauncher();
      return;
    }
    this.launcher.classList.add("hidden");
    this.card.classList.remove("hidden");
    if (this.rafId === null) this.tick();
  }

  /** User pressed Hide / Dismiss: collapse to the launcher pill. */
  collapseToLauncher(): void {
    this.userHidden = true;
    this.spotlight.classList.add("hidden");
    this.scrim.classList.remove("scrim--on");
    this.card.classList.add("hidden");
    this.launcher.classList.remove("hidden");
    this.setState("hidden");
  }

  /** Re-reveal the card after a Hide. */
  reveal(): void {
    this.userHidden = false;
    this.launcher.classList.add("hidden");
    if (this.rectProvider) {
      this.card.classList.remove("hidden");
      if (this.rafId === null) this.tick();
    }
  }

  setPaused(paused: boolean): void {
    this.pauseBtn.textContent = paused ? "Resume" : "Pause";
    if (this.lastMeta) this.renderBadge({ ...this.lastMeta, paused });
    if (paused) this.setState("paused");
    else if (this.lastMeta) this.setState(this.lastMeta.stepState === "waiting" ? "waiting" : "active");
  }

  clear(): void {
    this.rectProvider = null;
    this.onCta = null;
    this.userHidden = false;
    this.lastTargetKey = null;
    if (this.celebrationTimer) {
      clearTimeout(this.celebrationTimer);
      this.celebrationTimer = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.spotlight.classList.add("hidden");
    this.scrim.classList.remove("scrim--on");
    this.card.classList.add("hidden");
    this.launcher.classList.add("hidden");
    this.setState("idle");
  }

  destroy(): void {
    this.clear();
    this.host.remove();
  }

  // ---- internals -----------------------------------------------------------

  private lastMeta: CardMeta | null = null;

  private renderContent(options: ShowOptions): void {
    const { content, meta } = options;

    if (content.title) {
      this.titleEl.textContent = content.title;
      this.titleEl.classList.remove("hidden");
    } else {
      this.titleEl.classList.add("hidden");
    }
    if (content.body !== this.lastBody) {
      this.lastBody = content.body;
      this.bodyEl.textContent = content.body;
      // Re-trigger the entrance animation so new instructions visibly arrive.
      this.bodyEl.style.animation = "none";
      void this.bodyEl.offsetWidth;
      this.bodyEl.style.animation = "";
    }

    if (content.cta) {
      this.ctaButton.textContent = content.cta;
      this.ctaButton.classList.remove("hidden");
    } else {
      this.ctaButton.classList.add("hidden");
    }

    // Engine card chrome (badge, top controls, nav) only when meta is provided.
    this.lastMeta = meta ?? null;
    if (meta) {
      this.renderBadge(meta);
      this.renderSteps(meta);
      this.topCtl.classList.remove("hidden");
      this.nav.classList.toggle("hidden", meta.done === true);
      this.backBtn.disabled = meta.stepIndex <= 0;
      this.resumeBtn.classList.toggle("hidden", !meta.manual || meta.done === true);

      // Ambient progress: the hairline fills as the journey advances.
      const pct =
        meta.done || meta.totalSteps === 0
          ? 100
          : Math.max(6, Math.round((meta.stepIndex / meta.totalSteps) * 100));
      this.progress.style.width = `${pct}%`;

      // Completion is a designed STATE, not a content swap: the celebration
      // surface enters the same frame the engine reports done — the nav (and
      // its Next button) is unmounted by this transition, never left to linger.
      if (meta.done) {
        this.setState("celebrating");
        this.card.classList.add("card--celebrate");
        this.celebrateWrap.classList.toggle("hidden", !this.celebrationEnabled);
        const check = this.celebrateWrap.querySelector("path");
        if (check && this.celebrationEnabled) {
          (check as SVGPathElement).style.animation = "none";
          void this.celebrateWrap.offsetWidth;
          (check as SVGPathElement).style.animation = "";
        }
        if (!this.celebrationTimer) {
          this.celebrationTimer = setTimeout(() => {
            this.celebrationTimer = null;
            this.collapseToLauncher();
          }, 4500);
        }
      } else {
        this.setState(meta.stepState === "waiting" ? "waiting" : "active");
        this.card.classList.remove("card--celebrate");
        this.celebrateWrap.classList.add("hidden");
        if (this.celebrationTimer) {
          clearTimeout(this.celebrationTimer);
          this.celebrationTimer = null;
        }
      }
    } else {
      this.badge.textContent = "";
      this.topCtl.classList.add("hidden");
      this.nav.classList.add("hidden");
      this.stepsToggle.classList.add("hidden");
      this.stepsList.classList.add("hidden");
      this.progress.style.width = "0";
      this.card.classList.remove("card--celebrate");
      this.celebrateWrap.classList.add("hidden");
      this.setState("active");
    }
  }

  /** Render the expandable all-steps checklist (done ✓ / current ● / upcoming ○). */
  private renderSteps(meta: CardMeta): void {
    const steps = meta.steps ?? [];
    if (steps.length === 0) {
      this.stepsToggle.classList.add("hidden");
      this.stepsList.classList.add("hidden");
      return;
    }
    this.stepsToggle.classList.remove("hidden");
    this.stepsToggle.textContent = this.stepsOpen ? "Hide steps ▴" : "Show all steps ▾";
    this.stepsList.classList.toggle("hidden", !this.stepsOpen);
    if (!this.stepsOpen) return;
    this.stepsList.textContent = "";
    steps.forEach((title, i) => {
      const li = document.createElement("li");
      const state = meta.done || i < meta.stepIndex ? "done" : i === meta.stepIndex ? "current" : "upcoming";
      li.className = `step step--${state}`;
      li.textContent = `${state === "done" ? "✓" : state === "current" ? "●" : "○"} ${title}`;
      this.stepsList.append(li);
    });
  }

  private showSkipReasons(): void {
    this.skipReasons.classList.remove("hidden");
    if (this.skipReasonTimer) clearTimeout(this.skipReasonTimer);
    this.skipReasonTimer = setTimeout(() => this.hideSkipReasons(), 6000);
  }

  private hideSkipReasons(): void {
    this.skipReasons.classList.add("hidden");
    if (this.skipReasonTimer) {
      clearTimeout(this.skipReasonTimer);
      this.skipReasonTimer = null;
    }
  }

  private renderBadge(meta: CardMeta): void {
    if (meta.done) {
      this.badge.textContent = "Completed ✓";
      return;
    }
    if (meta.paused) {
      this.badge.textContent = "Paused";
      return;
    }
    if (meta.totalSteps === 0) {
      // AI-generated guide — no fixed step count.
      this.badge.textContent = "✨ Guiding you";
      return;
    }
    const label = `Step ${meta.stepIndex + 1} of ${meta.totalSteps}${meta.manual ? " · manual" : ""}`;
    this.badge.textContent = "";
    if (meta.stepState === "waiting") {
      this.badge.append(dot(), document.createTextNode(`${label} · waiting`));
    } else {
      this.badge.textContent = label;
    }
  }

  private tick = (): void => {
    this.rafId = requestAnimationFrame(this.tick);
    if (this.userHidden) return;
    const rect = this.rectProvider?.() ?? null;
    if (rect && (rect.width > 0 || rect.height > 0)) {
      this.positionSpotlight(rect);
      this.positionCardNear(rect);
      this.scrim.classList.toggle("scrim--on", this.scrimEnabled);
    } else {
      // No target to highlight — keep the card visible & controllable, parked.
      this.spotlight.classList.add("hidden");
      this.scrim.classList.remove("scrim--on");
      this.positionCardDefault();
    }
  };

  private positionSpotlight(rect: DOMRect): void {
    const s = this.spotlight.style;
    s.left = `${rect.left - SPOTLIGHT_PADDING}px`;
    s.top = `${rect.top - SPOTLIGHT_PADDING}px`;
    s.width = `${rect.width + SPOTLIGHT_PADDING * 2}px`;
    s.height = `${rect.height + SPOTLIGHT_PADDING * 2}px`;
    this.spotlight.classList.remove("hidden");
  }

  private positionCardNear(rect: DOMRect): void {
    const cw = this.card.offsetWidth;
    const ch = this.card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = rect.bottom + CARD_GAP;
    if (top + ch > vh - 8) top = Math.max(8, rect.top - CARD_GAP - ch);
    let left = Math.min(Math.max(8, rect.left), Math.max(8, vw - cw - 8));
    this.card.style.top = `${top}px`;
    this.card.style.left = `${left}px`;
  }

  private positionCardDefault(): void {
    const cw = this.card.offsetWidth;
    const ch = this.card.offsetHeight;
    this.card.style.left = `${window.innerWidth - cw - 18}px`;
    this.card.style.top = `${window.innerHeight - ch - 18}px`;
  }
}

// ---- small DOM helpers -----------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function iconBtn(label: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", "iconbtn");
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function navBtn(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const b = el("button", primary ? "navbtn navbtn--primary" : "navbtn");
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function dot(): HTMLSpanElement {
  return el("span", "dot");
}
