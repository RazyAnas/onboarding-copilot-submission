/** Tiny namespaced logger. No-ops unless debug is enabled. */
export class Logger {
  constructor(private enabled: boolean) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  debug(...args: unknown[]): void {
    if (this.enabled) console.debug("[copilot]", ...args);
  }

  info(...args: unknown[]): void {
    if (this.enabled) console.info("[copilot]", ...args);
  }

  /** Warnings always surface — we never fail silently. */
  warn(...args: unknown[]): void {
    console.warn("[copilot]", ...args);
  }

  error(...args: unknown[]): void {
    console.error("[copilot]", ...args);
  }
}
