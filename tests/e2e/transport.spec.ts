import { test, expect, type Page } from "@playwright/test";

interface RoundTrip {
  extracted: number;
  sentPlain: number;
  sentDeltaGroups: number;
  sentTotal: number;
  stepId: string | null;
  kind: string;
  hasTarget: boolean;
}

async function roundTrip(page: Page): Promise<RoundTrip> {
  return page.evaluate(async () => {
    const cp = (
      window as unknown as {
        __copilot: {
          captureElements: () => unknown[];
          buildSnapshot: () => {
            elements: unknown[];
            deltaGroups?: { instances: unknown[] }[];
          };
          requestGuidance: () => Promise<{
            stepId: string | null;
            instruction: { kind: string; target?: unknown };
          }>;
        };
      }
    ).__copilot;
    const extracted = cp.captureElements().length;
    const snap = cp.buildSnapshot();
    const sentTotal =
      snap.elements.length +
      (snap.deltaGroups ?? []).reduce((n, g) => n + g.instances.length, 0);
    const res = await cp.requestGuidance();
    return {
      extracted,
      sentPlain: snap.elements.length,
      sentDeltaGroups: (snap.deltaGroups ?? []).length,
      sentTotal,
      stepId: res.stepId,
      kind: res.instruction.kind,
      hasTarget: res.instruction.target != null,
    };
  });
}

test("delta-compressed snapshot round-trips losslessly over HTTP", async ({ page }) => {
  await page.goto("/#/settings/members");
  await page.getByTestId("members-invite").waitFor();

  const rt = await roundTrip(page);

  // Compression actually engaged (the dev-bar buttons form a repeated-sibling run).
  expect(rt.sentDeltaGroups).toBeGreaterThan(0);
  // Serialize is internally consistent: plain + delta instances == extracted count.
  expect(rt.sentTotal).toBe(rt.extracted);
  // The compressed snapshot reached the planner over HTTP and produced guidance.
  // (Exact decode-count losslessness is asserted in the server unit test.)
  expect(rt.stepId).toBeTruthy();
  expect(rt.kind).toBe("highlight");
  expect(rt.hasTarget).toBe(true);
});
