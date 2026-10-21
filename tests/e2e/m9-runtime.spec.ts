import { test, expect, type Page } from "@playwright/test";

interface Res {
  sessionId: string;
  stepId: string | null;
  stepIndex: number;
  totalSteps: number;
}

function requestGuidance(page: Page): Promise<Res> {
  return page.evaluate(() =>
    (window as unknown as { __copilot: { requestGuidance: () => Promise<Res> } })
      .__copilot.requestGuidance(),
  );
}

/** M9 proof: the plan executes locally and the session survives a page refresh. */
test("resumes mid-flow after a page refresh (same session, same step)", async ({ page }) => {
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "Settings" }).waitFor();

  const first = await requestGuidance(page);
  expect(first.stepId).toBe("open-settings");

  // Act on step 1 → SPA route satisfies the url condition → auto-advance.
  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForTimeout(250);
  const second = await requestGuidance(page);
  expect(second.stepId).not.toBe("open-settings");
  expect(second.sessionId).toBe(first.sessionId);

  // Refresh: a brand-new SDK instance must resume the SAME session and step.
  await page.reload();
  await page.getByRole("link", { name: "Settings" }).waitFor();
  const resumed = await requestGuidance(page);
  expect(resumed.sessionId).toBe(first.sessionId);
  expect(resumed.stepId).toBe(second.stepId);
});

test("card shows the full-journey checklist (the trust artifact)", async ({ page }) => {
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "Settings" }).waitFor();
  await page.getByRole("button", { name: "Start guide" }).click();

  const overlay = page.locator("[data-copilot-overlay]");
  await expect
    .poll(() =>
      overlay.evaluate((el) =>
        el.shadowRoot?.querySelector('[data-cp="steps-toggle"]')?.textContent ?? "",
      ),
    )
    .toContain("Show all steps");

  await overlay.evaluate((el) =>
    (el.shadowRoot?.querySelector('[data-cp="steps-toggle"]') as HTMLButtonElement).click(),
  );
  const items = await overlay.evaluate(
    (el) => el.shadowRoot?.querySelectorAll('[data-cp="steps"] .step').length ?? 0,
  );
  expect(items).toBeGreaterThan(1);
  const current = await overlay.evaluate(
    (el) => el.shadowRoot?.querySelector(".step--current")?.textContent ?? "",
  );
  expect(current).toContain("●");
});
