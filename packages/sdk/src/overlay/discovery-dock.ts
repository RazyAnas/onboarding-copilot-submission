import type { OnboardingResponse, ThemeConfig } from "@copilot/shared";
import { applyTheme, resolveTheme } from "../ui/theme.js";
import { resolvePlacement } from "../ui/placement.js";

export interface DiscoveryHandlers {
  onStartFlow?: (flowKey: string) => void;
  onAsk?: () => void;
}

const DOCK_CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: var(--cp-font); }
  @media (prefers-reduced-motion: reduce) { * { transition-duration: 1ms !important; } }

  .wrap { display: flex; flex-direction: column; gap: 8px; align-items: stretch; pointer-events: auto; }
  .wrap--up { flex-direction: column-reverse; }

  .pill {
    display: inline-flex; align-items: center; gap: 10px;
    background: var(--cp-surface); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
    border: 1px solid var(--cp-border); border-radius: 999px;
    box-shadow: var(--cp-shadow); padding: 7px 14px 7px 8px; cursor: pointer;
    color: var(--cp-text); font-size: 13px; min-width: 180px;
    transition: transform var(--cp-motion-fast) var(--cp-ease);
  }
  .pill:hover { transform: translateY(-1px); }
  .pill__ring { flex: none; }
  .pill__label { font-weight: 600; letter-spacing: -0.005em; }
  .pill__count { color: var(--cp-text-2); margin-left: auto; font-size: 12px; }
  .pill__chev { color: var(--cp-text-3); font-size: 11px; }

  .panel {
    width: 300px; background: var(--cp-surface);
    -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
    border: 1px solid var(--cp-border); border-radius: var(--cp-radius);
    box-shadow: var(--cp-shadow); padding: 16px; color: var(--cp-text);
    animation: cp-pop var(--cp-motion-base) var(--cp-ease) 1;
  }
  @keyframes cp-pop { from { opacity: 0; transform: translateY(6px) scale(0.98); } to { opacity: 1; transform: none; } }
  .panel__head { display: flex; align-items: baseline; justify-content: space-between; }
  .panel__title { font-weight: 600; font-size: 15px; }
  .panel__close { background: transparent; border: 0; color: var(--cp-text-3); cursor: pointer; font-size: 13px; padding: 2px 4px; }
  .panel__sub { color: var(--cp-text-2); font-size: 12px; margin: 2px 0 10px; }
  .bar { height: 4px; border-radius: 2px; background: var(--cp-surface-2); overflow: hidden; margin-bottom: 12px; }
  .bar__fill { height: 100%; background: var(--cp-accent); border-radius: 2px; transition: width 480ms var(--cp-ease); }

  .item { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: var(--cp-radius-sm); }
  .item--next { background: var(--cp-surface-2); }
  .item__mark { flex: none; width: 18px; height: 18px; }
  .item__name { font-size: 13px; flex: 1; }
  .item--done .item__name { color: var(--cp-text-2); text-decoration: line-through; text-decoration-color: var(--cp-border); }
  .item--next .item__name { font-weight: 600; }
  .item__start {
    appearance: none; border: 0; border-radius: 999px; background: var(--cp-accent);
    color: var(--cp-on-accent); font: 600 12px/1 var(--cp-font); padding: 6px 12px; cursor: pointer;
  }
  .ask { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--cp-border); }
  .ask__btn { background: transparent; border: 0; color: var(--cp-accent); font: 500 13px/1 var(--cp-font); cursor: pointer; padding: 2px 0; }
  .hidden { display: none !important; }
`;

/**
 * Layer 1 (M9.6): the onboarding-first discovery surface. A low-footprint progress
 * pill that expands into a checklist of recommended flows. Adaptively placed (it
 * never docks over host chrome) and self-retiring (hides when there is nothing
 * pending or everything is done). No text input — discovery is recognition, not a
 * prompt; the blank composer lives only in Layer 3.
 */
export class DiscoveryDock {
  private host: HTMLDivElement | null = null;
  private root: ShadowRoot | null = null;
  private wrap!: HTMLDivElement;
  private pill!: HTMLButtonElement;
  private panel!: HTMLDivElement;
  private handlers: DiscoveryHandlers = {};
  private data: OnboardingResponse | null = null;
  private open = false;
  private theme: Partial<ThemeConfig> | undefined;
  private onResize = (): void => this.place();

  setHandlers(h: DiscoveryHandlers): void {
    this.handlers = h;
  }
  setTheme(theme: Partial<ThemeConfig> | undefined): void {
    this.theme = theme;
    if (this.host) applyTheme(this.host, resolveTheme(theme).vars);
  }

  mount(): void {
    if (this.host) return;
    this.host = document.createElement("div");
    this.host.setAttribute("data-copilot-dock", "");
    this.host.style.position = "fixed";
    this.host.style.zIndex = "2147483646";
    this.root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = DOCK_CSS;
    this.root.append(style);

    this.wrap = document.createElement("div");
    this.wrap.className = "wrap";
    this.panel = document.createElement("div");
    this.panel.className = "panel hidden";
    this.panel.dataset.cp = "dock-panel";
    this.pill = document.createElement("button");
    this.pill.className = "pill hidden";
    this.pill.dataset.cp = "dock-pill";
    this.pill.addEventListener("click", () => this.toggle());
    this.wrap.append(this.panel, this.pill);
    this.root.append(this.wrap);

    applyTheme(this.host, resolveTheme(this.theme).vars);
    document.body.append(this.host);
    window.addEventListener("resize", this.onResize);
    this.place();
  }

  /** Feed the discovery data. Retires the dock when nothing is pending. */
  setData(data: OnboardingResponse | null): void {
    this.data = data;
    if (!this.host) return;
    const pending = !!data && data.total > 0 && data.completed < data.total;
    this.host.classList.toggle("hidden", !pending);
    this.host.style.display = pending ? "block" : "none";
    if (!pending) return;
    this.renderPill(data!);
    if (this.open) this.renderPanel(data!);
    this.place();
  }

  private toggle(): void {
    this.open = !this.open;
    this.panel.classList.toggle("hidden", !this.open);
    if (this.open && this.data) this.renderPanel(this.data);
    this.place();
  }

  private renderPill(d: OnboardingResponse): void {
    const pct = d.total ? d.completed / d.total : 0;
    const c = 2 * Math.PI * 8;
    this.pill.classList.remove("hidden");
    this.pill.innerHTML =
      `<svg class="pill__ring" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">` +
      `<circle cx="11" cy="11" r="8" fill="none" stroke="var(--cp-surface-2)" stroke-width="2.5"/>` +
      `<circle cx="11" cy="11" r="8" fill="none" stroke="var(--cp-accent)" stroke-width="2.5" stroke-linecap="round"` +
      ` stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct)).toFixed(1)}" transform="rotate(-90 11 11)"/></svg>` +
      `<span class="pill__label">Get started</span>` +
      `<span class="pill__count">${d.completed} of ${d.total}</span>` +
      `<span class="pill__chev">${this.open ? "▾" : "▴"}</span>`;
  }

  private renderPanel(d: OnboardingResponse): void {
    this.panel.classList.remove("hidden");
    const left = d.total - d.completed;
    const rows = d.flows
      .map((f) => {
        const mark =
          f.status === "done"
            ? `<svg class="item__mark" viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="var(--cp-accent)"/><path d="M5.5 9 L8 11.5 L12.5 6.5" fill="none" stroke="var(--cp-on-accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            : f.status === "next"
              ? `<svg class="item__mark" viewBox="0 0 18 18"><circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--cp-accent)" stroke-width="2"/><circle cx="9" cy="9" r="3" fill="var(--cp-accent)"/></svg>`
              : `<svg class="item__mark" viewBox="0 0 18 18"><circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--cp-border)" stroke-width="1.5"/></svg>`;
        const start =
          f.status !== "done"
            ? `<button class="item__start" data-cp="dock-start" data-flow="${f.flowKey}">Start</button>`
            : "";
        return `<div class="item item--${f.status}">${mark}<span class="item__name">${f.name}</span>${start}</div>`;
      })
      .join("");
    this.panel.innerHTML =
      `<div class="panel__head"><span class="panel__title">Get started</span>` +
      `<button class="panel__close" data-cp="dock-close" aria-label="Close">✕</button></div>` +
      `<p class="panel__sub">${d.completed} of ${d.total} done${left ? ` · ${left} to go` : ""}</p>` +
      `<div class="bar"><div class="bar__fill" style="width:${Math.round((d.completed / d.total) * 100)}%"></div></div>` +
      rows +
      `<div class="ask"><button class="ask__btn" data-cp="dock-ask">Ask for something else →</button></div>`;

    this.panel.querySelectorAll<HTMLElement>('[data-cp="dock-start"]').forEach((b) =>
      b.addEventListener("click", () => {
        const key = b.dataset.flow;
        if (key) this.handlers.onStartFlow?.(key);
        this.collapse();
      }),
    );
    this.panel.querySelector('[data-cp="dock-close"]')?.addEventListener("click", () => this.collapse());
    this.panel.querySelector('[data-cp="dock-ask"]')?.addEventListener("click", () => {
      this.handlers.onAsk?.();
      this.collapse();
    });
  }

  collapse(): void {
    this.open = false;
    this.panel.classList.add("hidden");
    if (this.data) this.renderPill(this.data);
  }

  /** Adaptively position the host so it never docks over host chrome. */
  private place(): void {
    if (!this.host) return;
    const p = resolvePlacement();
    const s = this.host.style;
    s.top = s.bottom = s.left = s.right = "auto";
    s.transform = "";
    if (p.bottom !== undefined) s.bottom = `${p.bottom}px`;
    if (p.top !== undefined) s.top = `${p.top}px`;
    if (p.left !== undefined) s.left = `${p.left}px`;
    if (p.right !== undefined) s.right = `${p.right}px`;
    if (p.centerX) {
      s.left = "50%";
      s.transform = "translateX(-50%)";
    }
    // Bottom-docked → panel grows upward (pill stays at the bottom).
    this.wrap.classList.toggle("wrap--up", p.bottom !== undefined);
    this.host.dataset.cpAnchor = p.anchor;
  }

  destroy(): void {
    window.removeEventListener("resize", this.onResize);
    this.host?.remove();
    this.host = null;
    this.root = null;
  }
}
