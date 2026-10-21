import { ThemeConfigSchema, type ThemeConfig } from "@copilot/shared";

/** Resolved palette applied as CSS custom properties on the shadow host. */
export interface ThemeVars {
  [key: `--cp-${string}`]: string;
}

const SHADOWS = [
  "none",
  "0 2px 8px rgba(0,0,0,0.10)",
  "0 8px 28px rgba(0,0,0,0.16)",
  "0 16px 48px rgba(0,0,0,0.24)",
];

function parseColor(c: string): [number, number, number] | null {
  const el = document.createElement("div");
  el.style.color = c;
  document.body.appendChild(el);
  const rgb = getComputedStyle(el).color.match(/\d+(\.\d+)?/g);
  el.remove();
  if (!rgb || rgb.length < 3) return null;
  return [Number(rgb[0]), Number(rgb[1]), Number(rgb[2])];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * "auto" mode: sample the host page's effective background where the companion
 * lives and match it — the trick that makes the overlay feel native on any site.
 */
function hostPrefersDark(): boolean {
  let el: Element | null = document.body;
  while (el) {
    const bg = getComputedStyle(el).backgroundColor;
    const rgba = bg.match(/\d+(\.\d+)?/g)?.map(Number);
    if (rgba && rgba.length >= 3 && (rgba.length < 4 || rgba[3]! > 0.1)) {
      return luminance([rgba[0]!, rgba[1]!, rgba[2]!]) < 0.4;
    }
    el = el.parentElement;
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** Contrast guardrail: customers can brand the accent, never break legibility. */
function clampAccent(accent: string, dark: boolean): string {
  const rgb = parseColor(accent);
  if (!rgb) return dark ? "#7c86ff" : "#4f46e5";
  const lum = luminance(rgb);
  // Accent must read against the card surface; nudge extremes back in range.
  if (dark && lum < 0.08) return "#7c86ff";
  if (!dark && lum > 0.7) return "#4f46e5";
  return accent;
}

/** Resolve a (partial, untrusted) theme config into concrete CSS variables. */
export function resolveTheme(input: unknown = {}): { vars: ThemeVars; config: ThemeConfig } {
  const parsed = ThemeConfigSchema.safeParse(input ?? {});
  const config = parsed.success ? parsed.data : ThemeConfigSchema.parse({});
  const dark = config.mode === "auto" ? hostPrefersDark() : config.mode === "dark";
  const accent = clampAccent(config.accent ?? (dark ? "#7c86ff" : "#4f46e5"), dark);
  const compact = config.density === "compact";

  const vars: ThemeVars = dark
    ? {
        "--cp-surface": "rgba(23, 25, 35, 0.92)",
        "--cp-surface-2": "rgba(255,255,255,0.06)",
        "--cp-text": "#f4f5f8",
        "--cp-text-2": "rgba(244,245,248,0.62)",
        "--cp-text-3": "rgba(244,245,248,0.40)",
        "--cp-border": "rgba(255,255,255,0.09)",
        "--cp-scrim": "rgba(0,0,0,0.32)",
      }
    : {
        "--cp-surface": "rgba(255, 255, 255, 0.96)",
        "--cp-surface-2": "rgba(15,18,30,0.05)",
        "--cp-text": "#171922",
        "--cp-text-2": "rgba(23,25,34,0.62)",
        "--cp-text-3": "rgba(23,25,34,0.40)",
        "--cp-border": "rgba(15,18,30,0.10)",
        "--cp-scrim": "rgba(10,12,20,0.22)",
      };

  vars["--cp-accent"] = accent;
  vars["--cp-on-accent"] = "#ffffff";
  vars["--cp-radius"] = `${config.radius}px`;
  vars["--cp-radius-sm"] = `${Math.max(4, Math.round(config.radius * 0.6))}px`;
  vars["--cp-shadow"] = SHADOWS[config.shadow] ?? SHADOWS[2]!;
  vars["--cp-font"] =
    config.fontFamily === "inherit"
      ? `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif`
      : config.fontFamily;
  vars["--cp-pad"] = compact ? "12px" : "16px";
  vars["--cp-gap"] = compact ? "6px" : "10px";
  vars["--cp-text-size"] = compact ? "13px" : "14px";
  vars["--cp-hero-size"] = compact ? "14px" : "15px";
  // Motion tokens (zeroed by the reduced-motion media query in CSS).
  vars["--cp-motion-fast"] = "120ms";
  vars["--cp-motion-base"] = "200ms";
  vars["--cp-motion-travel"] = "320ms";
  vars["--cp-ease"] = "cubic-bezier(0.2, 0, 0, 1)";

  return { vars, config };
}

/** Apply resolved variables to the shadow host element. */
export function applyTheme(host: HTMLElement, vars: ThemeVars): void {
  for (const [k, v] of Object.entries(vars)) host.style.setProperty(k, v);
}
