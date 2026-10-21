import { z } from "zod";

/**
 * Layer 1 discovery feed (M9.6). Read-only: the recommended onboarding flows for
 * a tenant plus this user's completion status. Drives the progress dock + checklist.
 */
export const OnboardingItemSchema = z.object({
  flowKey: z.string(),
  name: z.string(),
  /** done = completed; next = the first incomplete (recommended); todo = later. */
  status: z.enum(["done", "next", "todo"]),
  totalSteps: z.number().int(),
});
export type OnboardingItem = z.infer<typeof OnboardingItemSchema>;

export const OnboardingResponseSchema = z.object({
  flows: z.array(OnboardingItemSchema),
  completed: z.number().int(),
  total: z.number().int(),
});
export type OnboardingResponse = z.infer<typeof OnboardingResponseSchema>;
