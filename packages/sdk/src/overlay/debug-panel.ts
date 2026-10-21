import type { GuidanceResponse } from "@copilot/shared";

/**
 * Tiny observability surface (`debug: true`): a Shadow-DOM panel showing the
 * engine's live decision state — step, mode, confidence, reasoning. Read-only,
 * pointer-transparent, isolated from host CSS like the main overlay.
 */
export class DebugPanel {
  private host: HTMLDivElement | null = null;
  private body: HTMLPreElement | null = null;

  mount(): void {
    if (this.host) return;
    this.host = document.createElement("div");
    this.host.setAttribute("data-copilot-debug", "");
    Object.assign(this.host.style, {
      position: "fixed",
      left: "12px",
      bottom: "12px",
      zIndex: "2147483646",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);

    const root = this.host.attachShadow({ mode: "open" });
    const box = document.createElement("div");
    box.style.cssText =
      "background:rgba(10,12,20,.88);color:#9fe8b8;font:11px/1.5 ui-monospace,Menlo,monospace;" +
      "padding:8px 10px;border-radius:8px;max-width:340px;border:1px solid rgba(159,232,184,.25)";
    const title = document.createElement("div");
    title.textContent = "copilot debug";
    title.style.cssText = "color:#6ea8fe;margin-bottom:4px;font-weight:600";
    this.body = document.createElement("pre");
    this.body.style.cssText = "margin:0;white-space:pre-wrap;word-break:break-word";
    this.body.textContent = "waiting for guidance…";
    box.append(title, this.body);
    root.append(box);
    document.body.append(this.host);
  }

  update(res: GuidanceResponse, extra: { state: string; bufferedEvents: number }): void {
    if (!this.body) return;
    const step =
      res.totalSteps > 0 ? `${Math.min(res.stepIndex + 1, res.totalSteps)}/${res.totalSteps}` : "—";
    this.body.textContent = [
      `state    ${extra.state}${res.manual ? " (manual)" : ""}`,
      `session  ${res.sessionId}`,
      `step     ${res.stepId ?? "done"} ${step}${res.stepState ? ` [${res.stepState}]` : ""}`,
      `decision ${res.mode} conf=${res.confidence.toFixed(2)} ${res.instruction.kind}`,
      `why      ${res.reasoning ?? "—"}`,
      `events   ${extra.bufferedEvents} buffered`,
    ].join("\n");
  }

  destroy(): void {
    this.host?.remove();
    this.host = null;
    this.body = null;
  }
}
