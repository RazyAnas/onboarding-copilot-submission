import { z } from "zod";
import { SemanticElementSchema } from "./element.js";

/**
 * Delta-compressed group of structurally-similar sibling elements (table rows,
 * list items, cards). `template` holds field values shared by every instance;
 * each instance only carries the fields that vary. The decoder reconstitutes
 * full SemanticElements. Backward compatible: a snapshot may omit deltaGroups
 * entirely and send everything in `elements`.
 */
export const DeltaGroupSchema = z.object({
  /** Field values common to all instances in the group. */
  template: z.record(z.unknown()),
  /** Names of the SemanticElement fields that vary per instance. */
  varyingKeys: z.array(z.string()),
  /** Per-instance values for the varying keys. */
  instances: z.array(z.record(z.unknown())),
});
export type DeltaGroup = z.infer<typeof DeltaGroupSchema>;

export const FrameInfoSchema = z.object({
  path: z.array(z.number().int()),
  url: z.string(),
});
export type FrameInfo = z.infer<typeof FrameInfoSchema>;

/** Capped, compressed representation of a page at a moment in time. */
export const PageSnapshotSchema = z.object({
  url: z.string(),
  title: z.string(),
  viewport: z.object({ width: z.number(), height: z.number() }),
  /** Plainly-encoded elements (may be empty if everything is delta-encoded). */
  elements: z.array(SemanticElementSchema).default([]),
  /** Optional delta-compressed groups; concatenated after `elements` on decode. */
  deltaGroups: z.array(DeltaGroupSchema).optional(),
  frames: z.array(FrameInfoSchema).default([]),
  capturedAt: z.number(),
});
export type PageSnapshot = z.infer<typeof PageSnapshotSchema>;
