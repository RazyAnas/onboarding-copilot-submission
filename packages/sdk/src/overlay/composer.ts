import type { ThemeConfig } from "@copilot/shared";
import { applyTheme, resolveTheme } from "../ui/theme.js";

const MIC_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 19v3"/></svg>`;
const SEND_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`;
const SPARK_SVG = `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 1.5 L10.4 6.6 L15.5 8 L10.4 9.4 L9 14.5 L7.6 9.4 L2.5 8 L7.6 6.6 Z" fill="currentColor"/></svg>`;

/** "What it's doing" states — reflect the real pipeline so waiting doesn't feel dead. */
const THINKING_STATES = ["Reading this page", "Searching your guides", "Thinking", "Writing"];

const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: var(--cp-font); }
  @media (prefers-reduced-motion: reduce) { * { animation-duration: 1ms !important; transition-duration: 1ms !important; } }

  .scrim {
    position: fixed; inset: 0; background: var(--cp-scrim);
    display: flex; justify-content: center; align-items: flex-start;
    pointer-events: auto; z-index: 2147483646;
    animation: cp-fade var(--cp-motion-fast) var(--cp-ease) 1;
  }
  @keyframes cp-fade { from { opacity: 0; } to { opacity: 1; } }

  .panel {
    margin-top: 7vh; width: min(560px, calc(100vw - 32px)); max-height: 82vh;
    display: flex; flex-direction: column;
    background: var(--cp-surface); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
    border: 1px solid var(--cp-border); border-radius: var(--cp-radius);
    box-shadow: var(--cp-shadow); color: var(--cp-text); overflow: hidden;
    animation: cp-pop var(--cp-motion-base) var(--cp-ease) 1;
  }
  @keyframes cp-pop { from { opacity: 0; transform: translateY(-6px) scale(0.99); } to { opacity: 1; transform: none; } }

  .head { display: flex; align-items: center; gap: 9px; padding: 12px 14px; border-bottom: 1px solid var(--cp-border); }
  .head .spark { color: var(--cp-accent); display: inline-flex; }
  .head .title { font-weight: 600; font-size: 14px; flex: 1; }
  .iconbtn {
    appearance: none; border: 0; background: transparent; color: var(--cp-text-2);
    width: 30px; height: 30px; border-radius: 999px; cursor: pointer; display: grid; place-items: center;
  }
  .iconbtn:hover { background: var(--cp-surface-2); color: var(--cp-text); }
  .iconbtn svg { width: 16px; height: 16px; }

  .body { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
  .msg { max-width: 86%; font-size: 14px; line-height: 1.55; animation: cp-fadein var(--cp-motion-base) var(--cp-ease) 1; }
  @keyframes cp-fadein { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .msg--user {
    align-self: flex-end; background: var(--cp-accent); color: var(--cp-on-accent);
    padding: 9px 13px; border-radius: 16px 16px 4px 16px; white-space: pre-wrap;
  }
  .msg--bot { align-self: flex-start; width: 100%; }
  .msg--bot .text { color: var(--cp-text); white-space: pre-wrap; }
  .msg__row { display: flex; align-items: flex-start; gap: 8px; }
  .msg__avatar { flex: none; width: 22px; height: 22px; border-radius: 50%; background: var(--cp-surface-2); color: var(--cp-accent); display: grid; place-items: center; margin-top: 1px; }
  .msg__avatar svg { width: 13px; height: 13px; }
  .actions { display: flex; gap: 4px; margin: 7px 0 0 30px; }
  .actions.hidden { display: none; }
  .act { appearance: none; border: 0; background: transparent; color: var(--cp-text-3); cursor: pointer; padding: 4px; border-radius: 6px; font: 12px/1 var(--cp-font); }
  .act:hover { background: var(--cp-surface-2); color: var(--cp-text); }
  .act.on { color: var(--cp-accent); }

  .thinking { display: inline-flex; align-items: center; gap: 7px; color: var(--cp-text-2); font-size: 13px; }
  .thinking .dots { display: inline-flex; gap: 3px; }
  .thinking .dots i { width: 4px; height: 4px; border-radius: 50%; background: var(--cp-accent); display: inline-block; animation: cp-bounce 1s infinite; }
  .thinking .dots i:nth-child(2) { animation-delay: 0.15s; } .thinking .dots i:nth-child(3) { animation-delay: 0.3s; }
  @keyframes cp-bounce { 0%,100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-3px); } }

  .guide {
    margin: 9px 0 0 30px; appearance: none; border: 0; border-radius: 999px; cursor: pointer;
    background: var(--cp-accent); color: var(--cp-on-accent); font: 600 13px/1 var(--cp-font); padding: 9px 14px;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .guide.hidden { display: none; }
  .guide svg { width: 13px; height: 13px; }

  .sugg { display: flex; flex-direction: column; gap: 7px; padding: 2px 14px 12px; }
  .sugg.hidden { display: none; }
  .sugg__label { font-size: 12px; color: var(--cp-text-3); margin: 4px 0 2px; }
  .chip {
    appearance: none; text-align: left; border: 1px solid var(--cp-border); background: var(--cp-surface-2);
    color: var(--cp-text); font: 500 13px/1.3 var(--cp-font); padding: 11px 13px; border-radius: var(--cp-radius-sm);
    cursor: pointer; display: flex; align-items: center; gap: 10px;
  }
  .chip:hover { border-color: var(--cp-accent); }
  .chip .lead { color: var(--cp-accent); flex: none; display: inline-flex; }
  .chip .lead svg { width: 15px; height: 15px; }
  .chip .play { margin-left: auto; color: var(--cp-text-3); flex: none; }
  .chip .play svg { width: 14px; height: 14px; }

  .composer { display: flex; align-items: center; gap: 9px; padding: 11px 12px; border-top: 1px solid var(--cp-border); }
  .composer .spark { color: var(--cp-accent); flex: none; display: inline-flex; }
  .composer .spark svg { width: 18px; height: 18px; }
  .input { flex: 1; border: 0; outline: none; background: transparent; color: var(--cp-text); font: 500 15px/1.4 var(--cp-font); padding: 4px 0; }
  .input::placeholder { color: var(--cp-text-3); font-weight: 400; }
  .send { flex: none; width: 36px; height: 36px; border-radius: 50%; border: 0; cursor: pointer; background: var(--cp-accent); color: var(--cp-on-accent); display: grid; place-items: center; }
  .send svg { width: 17px; height: 17px; }
  .mic { flex: none; width: 32px; height: 32px; border-radius: 50%; border: 0; cursor: pointer; background: var(--cp-surface-2); color: var(--cp-text-2); display: grid; place-items: center; }
  .mic svg { width: 16px; height: 16px; } .mic.recording { background: var(--cp-accent); color: var(--cp-on-accent); } .mic[disabled] { display: none; }
  .hidden { display: none !important; }
`;

export interface ComposerGuide {
  flowKey: string;
  name: string;
}
export interface ComposerHandlers {
  onSubmit?: (text: string) => void;
  onGuide?: (goal: string) => void;
  onStartFlow?: (flowKey: string) => void;
}
interface Turn {
  role: "user" | "assistant";
  content: string;
}

/**
 * The conversational agent panel (M-redesign): summoned (⌘K / dock "Ask"), but a
 * full MULTI-TURN chat — transcript with history, premade guides, streamed
 * answers with live "what it's doing" states, per-message actions. Still zero
 * footprint when closed. Test hooks preserved: data-cp-composer scrim/input/answer/guide.
 */
export class Composer {
  private host: HTMLDivElement | null = null;
  private root: ShadowRoot | null = null;
  private scrim!: HTMLDivElement;
  private body!: HTMLDivElement;
  private input!: HTMLInputElement;
  private micBtn!: HTMLButtonElement;
  private suggEl!: HTMLDivElement;
  private handlers: ComposerHandlers = {};
  private theme: Partial<ThemeConfig> | undefined;
  private suggestions: string[] = [];
  private guides: ComposerGuide[] = [];
  private turns: Turn[] = [];
  private restoreFocus: HTMLElement | null = null;
  private recognition: { start: () => void; stop: () => void } | null = null;
  private hotkey: string | false = "k";

  // Streaming state for the in-flight assistant message.
  private streamTextEl: HTMLDivElement | null = null;
  private streamActions: HTMLDivElement | null = null;
  private streamGuide: HTMLButtonElement | null = null;
  private streamBuffer = "";
  private thinkingTimer: ReturnType<typeof setInterval> | null = null;
  private lastGoal = "";

  private onKeydown = (e: KeyboardEvent): void => {
    if (this.hotkey && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === this.hotkey) {
      e.preventDefault();
      this.toggle();
    } else if (e.key === "Escape" && this.isOpen()) {
      e.preventDefault();
      this.close();
    }
  };

  setHandlers(h: ComposerHandlers): void {
    this.handlers = h;
  }
  setTheme(theme: Partial<ThemeConfig> | undefined): void {
    this.theme = theme;
    if (this.host) applyTheme(this.host, resolveTheme(theme).vars);
  }
  setHotkey(key: string | false): void {
    this.hotkey = key;
  }
  setSuggestions(s: string[]): void {
    this.suggestions = s.slice(0, 3);
    if (this.host) this.renderSuggestions();
  }
  /** Premade guides (from onboarding) shown as one-tap startable chips. */
  setGuides(g: ComposerGuide[]): void {
    this.guides = g.slice(0, 4);
    if (this.host) this.renderSuggestions();
  }

  mount(): void {
    if (this.host) return;
    this.host = document.createElement("div");
    this.host.setAttribute("data-copilot-composer", "");
    this.root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    this.root.append(style);

    this.scrim = el("div", "scrim hidden");
    this.scrim.dataset.cpComposer = "scrim";
    this.scrim.addEventListener("click", (e) => {
      if (e.target === this.scrim) this.close();
    });

    const panel = el("div", "panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Copilot chat");

    // Header
    const head = el("div", "head");
    const hs = el("span", "spark");
    hs.innerHTML = SPARK_SVG;
    const title = el("span", "title");
    title.textContent = "Copilot";
    const newBtn = iconBtn(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
      "New chat",
    );
    newBtn.addEventListener("click", () => this.newChat());
    const closeBtn = iconBtn(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
      "Close",
    );
    closeBtn.addEventListener("click", () => this.close());
    head.append(hs, title, newBtn, closeBtn);

    // Transcript
    this.body = el("div", "body");

    // Suggestions / premade guides
    this.suggEl = el("div", "sugg");

    // Input bar
    const composer = el("div", "composer");
    const cs = el("span", "spark");
    cs.innerHTML = SPARK_SVG;
    this.input = document.createElement("input");
    this.input.className = "input";
    this.input.dataset.cpComposer = "input";
    this.input.placeholder = "Ask anything about this app…";
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.submit();
    });
    this.micBtn = el("button", "mic") as HTMLButtonElement;
    this.micBtn.setAttribute("aria-label", "Speak");
    this.micBtn.innerHTML = MIC_SVG;
    this.micBtn.addEventListener("click", () => this.toggleMic());
    const sendBtn = el("button", "send") as HTMLButtonElement;
    sendBtn.setAttribute("aria-label", "Send");
    sendBtn.innerHTML = SEND_SVG;
    sendBtn.addEventListener("click", () => this.submit());
    composer.append(cs, this.input, this.micBtn, sendBtn);

    panel.append(head, this.body, this.suggEl, composer);
    this.scrim.append(panel);
    this.root.append(this.scrim);

    applyTheme(this.host, resolveTheme(this.theme).vars);
    document.body.append(this.host);
    document.addEventListener("keydown", this.onKeydown);
    this.setupSpeech();
    this.renderSuggestions();
  }

  isOpen(): boolean {
    return !!this.scrim && !this.scrim.classList.contains("hidden");
  }
  toggle(): void {
    this.isOpen() ? this.close() : this.open();
  }

  open(prefill?: string): void {
    this.mount();
    this.restoreFocus = (document.activeElement as HTMLElement) ?? null;
    this.scrim.classList.remove("hidden");
    if (prefill) this.input.value = prefill;
    this.renderSuggestions();
    this.input.focus();
    this.input.select();
  }

  close(): void {
    if (!this.scrim) return;
    this.scrim.classList.add("hidden");
    this.restoreFocus?.focus?.();
    this.restoreFocus = null;
  }

  /** Clear the conversation and show the premade guides again. */
  newChat(): void {
    this.stopThinking();
    this.turns = [];
    this.streamTextEl = null;
    if (this.body) this.body.textContent = "";
    this.renderSuggestions();
    this.input.focus();
  }

  /** Prior turns for multi-turn context (excludes the just-submitted message). */
  getHistory(): Turn[] {
    const t = this.turns;
    const prior = t.length && t[t.length - 1]!.role === "user" ? t.slice(0, -1) : t;
    return prior.slice(-10);
  }

  // ---- Streaming an assistant reply -----------------------------------------

  /** Start a new assistant bubble with a live "what it's doing" state. */
  beginStream(): void {
    if (!this.host) this.mount();
    if (!this.isOpen()) this.open();
    this.suggEl.classList.add("hidden");

    const msg = el("div", "msg msg--bot");
    const row = el("div", "msg__row");
    const avatar = el("span", "msg__avatar");
    avatar.innerHTML = SPARK_SVG;
    const text = el("div", "text");
    text.dataset.cpComposer = "answer";
    row.append(avatar, text);
    const actions = el("div", "actions hidden");
    const guide = el("button", "guide hidden") as HTMLButtonElement;
    guide.dataset.cpComposer = "guide";
    guide.innerHTML = `${SPARK_SVG}<span>Guide me</span>`;
    guide.addEventListener("click", () => {
      if (this.lastGoal) this.handlers.onGuide?.(this.lastGoal);
    });
    msg.append(row, actions, guide);
    this.body.append(msg);

    this.streamTextEl = text;
    this.streamActions = actions;
    this.streamGuide = guide;
    this.streamBuffer = "";
    this.startThinking(text);
    this.scrollDown();
  }

  appendToken(chunk: string): void {
    if (!this.streamTextEl) return;
    if (this.thinkingTimer) this.stopThinking();
    this.streamBuffer += chunk;
    this.streamTextEl.textContent = this.streamBuffer;
    this.scrollDown();
  }

  finishStream(opts: { guidable?: boolean; goal?: string } = {}): void {
    if (!this.streamTextEl) return;
    this.stopThinking();
    const text = this.streamBuffer || "I couldn't get a response. Please try again.";
    const clean = text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1");
    this.streamTextEl.textContent = clean;
    this.turns.push({ role: "assistant", content: clean });
    if (opts.goal) this.lastGoal = opts.goal;
    if (this.streamGuide) this.streamGuide.classList.toggle("hidden", !opts.guidable || !this.lastGoal);
    this.addMessageActions(clean);
    this.streamTextEl = null;
    this.scrollDown();
  }

  /** Render an answer directly (e.g. an honest "can't guide that" notice). */
  showAnswer(text: string, opts: { guidable?: boolean; goal?: string } = {}): void {
    this.beginStream();
    this.appendToken(text);
    this.finishStream(opts);
  }

  destroy(): void {
    this.stopThinking();
    document.removeEventListener("keydown", this.onKeydown);
    this.host?.remove();
    this.host = null;
  }

  // ---- internals ------------------------------------------------------------

  private submit(): void {
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = "";
    this.lastGoal = text;
    this.addUserMessage(text);
    this.handlers.onSubmit?.(text);
  }

  private addUserMessage(text: string): void {
    const msg = el("div", "msg msg--user");
    msg.textContent = text;
    this.body.append(msg);
    this.turns.push({ role: "user", content: text });
    this.suggEl.classList.add("hidden");
    this.scrollDown();
  }

  private addMessageActions(text: string): void {
    if (!this.streamActions) return;
    this.streamActions.textContent = "";
    this.streamActions.classList.remove("hidden");
    const copy = act("Copy");
    copy.addEventListener("click", () => {
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      copy.textContent = "Copied";
      setTimeout(() => (copy.textContent = "Copy"), 1200);
    });
    const up = act("👍");
    const down = act("👎");
    up.addEventListener("click", () => {
      up.classList.toggle("on");
      down.classList.remove("on");
    });
    down.addEventListener("click", () => {
      down.classList.toggle("on");
      up.classList.remove("on");
    });
    this.streamActions.append(copy, up, down);
  }

  private startThinking(textEl: HTMLDivElement): void {
    let i = 0;
    const render = () => {
      textEl.innerHTML = `<span class="thinking">${THINKING_STATES[i % THINKING_STATES.length]}<span class="dots"><i></i><i></i><i></i></span></span>`;
    };
    render();
    this.thinkingTimer = setInterval(() => {
      i += 1;
      render();
    }, 900);
  }

  private stopThinking(): void {
    if (this.thinkingTimer) {
      clearInterval(this.thinkingTimer);
      this.thinkingTimer = null;
    }
  }

  private renderSuggestions(): void {
    if (!this.suggEl) return;
    // Only shown in the empty state (start of a conversation).
    if (this.turns.length > 0 || (this.guides.length === 0 && this.suggestions.length === 0)) {
      this.suggEl.classList.add("hidden");
      return;
    }
    this.suggEl.classList.remove("hidden");
    this.suggEl.textContent = "";
    if (this.guides.length) {
      const l = el("div", "sugg__label");
      l.textContent = "Guides for you";
      this.suggEl.append(l);
      for (const g of this.guides) {
        const chip = el("button", "chip");
        chip.innerHTML = `<span class="lead">${SPARK_SVG}</span><span>${escape(g.name)}</span><span class="play"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l14 9-14 9V3z"/></svg></span>`;
        chip.addEventListener("click", () => this.handlers.onStartFlow?.(g.flowKey));
        this.suggEl.append(chip);
      }
    }
    if (this.suggestions.length) {
      const l = el("div", "sugg__label");
      l.textContent = "Try asking";
      this.suggEl.append(l);
      for (const s of this.suggestions) {
        const chip = el("button", "chip");
        chip.innerHTML = `<span class="lead">${SPARK_SVG}</span><span>${escape(s)}</span>`;
        chip.addEventListener("click", () => {
          this.input.value = s;
          this.submit();
        });
        this.suggEl.append(chip);
      }
    }
  }

  private scrollDown(): void {
    if (this.body) this.body.scrollTop = this.body.scrollHeight;
  }

  // ---- optional Web Speech mic ----
  private setupSpeech(): void {
    const Ctor =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    if (!Ctor) {
      this.micBtn.disabled = true;
      return;
    }
    const recognition = new (Ctor as new () => {
      lang: string;
      interimResults: boolean;
      start: () => void;
      stop: () => void;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onend: (() => void) | null;
    })();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      this.input.value = e.results[0]?.[0]?.transcript ?? "";
    };
    recognition.onend = () => this.micBtn.classList.remove("recording");
    this.recognition = recognition;
  }

  private toggleMic(): void {
    if (!this.recognition) return;
    if (this.micBtn.classList.contains("recording")) {
      this.recognition.stop();
      this.micBtn.classList.remove("recording");
    } else {
      this.micBtn.classList.add("recording");
      this.recognition.start();
    }
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
function iconBtn(svg: string, label: string): HTMLButtonElement {
  const b = el("button", "iconbtn");
  b.innerHTML = svg;
  b.setAttribute("aria-label", label);
  return b;
}
function act(label: string): HTMLButtonElement {
  const b = el("button", "act");
  b.textContent = label;
  return b;
}
function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
