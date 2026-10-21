import { z } from "zod";

/** Axis-aligned bounding box in CSS pixels relative to the viewport. */
export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

/**
 * A flexible text matcher used by flow authoring and matching. A bare string
 * means "normalized exact match"; the object forms allow contains/regex.
 */
export const TextMatcherSchema = z.union([
  z.string(),
  z.object({ equals: z.string() }),
  z.object({ contains: z.string() }),
  z.object({ regex: z.string() }),
]);
export type TextMatcher = z.infer<typeof TextMatcherSchema>;
