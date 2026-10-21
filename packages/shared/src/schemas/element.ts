import { z } from "zod";
import { BoundingBoxSchema } from "./common.js";

/**
 * The unified element representation — the semantic backbone of the system.
 * Generated deterministically by the SDK from the live DOM, consumed by the
 * matcher (SDK + server) and serialized into snapshots. Never holds a DOM node
 * reference: everything here is plain serializable data so it survives transport
 * and rerenders.
 */
export const SemanticElementSchema = z.object({
  /** Stable internal id: hash of (role, name, testId, structural path signature). */
  id: z.string(),
  /** ARIA role — explicit (role attr) or implicit (derived from tag). */
  role: z.string(),
  /** Accessible name computed via the accname-subset algorithm in the SDK. */
  name: z.string(),
  /** Trimmed/normalized visible text content. */
  text: z.string(),
  /** Lowercase tag name. */
  tag: z.string(),
  /** Relevant aria-* attributes (sans the "aria-" prefix). */
  aria: z.record(z.string()),
  /** data-testid / data-test / data-cy if present. */
  testId: z.string().nullable(),
  bbox: BoundingBoxSchema,
  /** Best-effort unique CSS selector — last-resort fallback only. */
  cssPath: z.string(),
  /** Compact ancestor tokens from nearest to furthest, e.g. "section#members". */
  parentChain: z.array(z.string()),
  /** Nearby visible labels (preceding label, legend, etc.) for disambiguation. */
  nearbyLabels: z.array(z.string()),
  /** Accessible name of the nearest enclosing landmark/heading — key for dedup. */
  sectionLabel: z.string().nullable(),
  /** Role of the nearest enclosing landmark, e.g. "navigation", "dialog". */
  sectionRole: z.string().nullable(),
  /** Index among page elements sharing the same (role, name) — disambiguates duplicates. */
  ordinal: z.number().int(),
  visible: z.boolean(),
  enabled: z.boolean(),
  /** For inputs/textareas/contenteditable: has a non-empty value (privacy-safe; no raw value). */
  filled: z.boolean().default(false),
  zIndex: z.number(),
  /** Internal id of the nearest scrollable ancestor, or null for the document. */
  scrollContainerId: z.string().nullable(),
  /** Frame indices from the top document; empty array = top frame. */
  framePath: z.array(z.number().int()),
  /** Extraction confidence 0..1 (lower for weak-semantic / inferred-role nodes). */
  confidence: z.number().min(0).max(1),
  /** Epoch ms when last observed. */
  lastSeen: z.number(),
});
export type SemanticElement = z.infer<typeof SemanticElementSchema>;

/**
 * A resilient locator the SDK re-resolves against the live DOM every tick.
 * Deliberately redundant: carries multiple independent signals so matching
 * degrades gracefully when any single one breaks.
 */
export const TargetDescriptorSchema = z.object({
  /** Last-known internal id — a strong hint, never a hard requirement. */
  internalId: z.string().optional(),
  role: z.string(),
  name: z.string(),
  text: z.string().optional(),
  testId: z.string().optional(),
  ariaLabel: z.string().optional(),
  /** Ancestor tokens that should appear in the candidate's parent chain. */
  ancestryHints: z.array(z.string()).default([]),
  /** Nearest-section label to disambiguate duplicates (e.g. "Members"). */
  sectionHint: z.string().optional(),
  /** Expected ordinal among duplicates. */
  ordinalHint: z.number().int().optional(),
  /** Last-known bbox — used only as a tiebreak. */
  bboxHint: BoundingBoxSchema.optional(),
});
export type TargetDescriptor = z.infer<typeof TargetDescriptorSchema>;
