import { z } from "zod";

/**
 * Tenant theming — TOKENS ONLY, never layout. Customers can make the companion
 * theirs; they cannot make it broken. Every field maps 1:1 to a CSS custom
 * property on the SDK's shadow host.
 */
export const ThemeConfigSchema = z.object({
  /** Color scheme: fixed, or "auto" (samples the host page's luminance). */
  mode: z.enum(["light", "dark", "auto"]).default("auto"),
  /** Brand accent (buttons, progress, spotlight ring). */
  accent: z.string().optional(),
  /** Corner radius scale, px (clamped 0–20). */
  radius: z.number().min(0).max(20).default(12),
  /** Elevation 0–3 (flat → floating). */
  shadow: z.number().int().min(0).max(3).default(2),
  /** "inherit" wears the host app's font; otherwise a CSS font-family string. */
  fontFamily: z.string().default("inherit"),
  /** cozy = default spacing; compact = denser card + always-visible footer. */
  density: z.enum(["cozy", "compact"]).default("cozy"),
  /** Companion corner. */
  placement: z
    .enum(["bottom-right", "bottom-left", "top-right", "top-left"])
    .default("bottom-right"),
  /** Dim the page around the spotlight target. */
  scrim: z.boolean().default(false),
  /** Completion celebration animation. */
  celebration: z.boolean().default(true),
});
export type ThemeConfig = z.infer<typeof ThemeConfigSchema>;
