import { test, expect, type Page } from "@playwright/test";

interface Target { role: string; name: string; testId?: string }
interface Res {
  stepId: string | null;
  instruction: { kind: string; target?: Target; content: { body: string } };
}

const overlay = (page: Page) => page.locator("[data-copilot-overlay]");

async function act(page: Page, target: Target): Promise<void> {
  if (target.role === "textbox" && target.testId) {
    await page.getByTestId(target.testId).fill("teammate@acme.com");
  } else if (target.testId) {
    await page.getByTestId(target.testId).click();
  } else {
    await page
      .getByRole(target.role as "link" | "button", { name: target.name, exact: true })
      .first()
      .click();
  }
}

/**
 * M9.5 proof #1 — the completion bug is dead: after the user's FINAL action the
 * companion transitions to "celebrating" quickly, and the Next button does not
 * linger on screen.
 */
test("final step transitions to celebration without a stale Next", async ({ page }) => {
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "Settings" }).waitFor();
  // Start the engine so observers (event-aware scheduling) drive the ticks.
  await page.getByRole("button", { name: "Start guide" }).click();

  // Walk the flow by acting on whatever the engine highlights.
  for (let i = 0; i < 10; i++) {
    const res = await page.evaluate(() =>
      (window as unknown as { __copilot: { requestGuidance: () => Promise<Res> } })
        .__copilot.requestGuidance(),
    );
    if (res.instruction.kind === "done") break;
    expect(res.instruction.target).toBeTruthy();
    await act(page, res.instruction.target!);
    await page.waitForTimeout(220); // intent settle (50ms) + render headroom
  }

  // The companion must reach the celebrating state on its own ticks…
  await expect
    .poll(() => overlay(page).getAttribute("data-cp-state"), { timeout: 3000 })
    .toBe("celebrating");
  // …and once celebrating, navigation (incl. Next) must be gone.
  await expect(page.locator('[data-cp="next"]')).toBeHidden();
  await expect(page.locator(".celebrate__check")).toBeVisible();
});

/** M9.5 proof #2 — token theming applies at runtime, layout untouched. */
test("theme tokens restyle the companion at runtime", async ({ page }) => {
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "Settings" }).waitFor();
  await page.getByRole("button", { name: "Start guide" }).click();
  await expect(page.locator(".card__badge")).toContainText("Step");

  await page.evaluate(() =>
    (window as unknown as { __copilot: { setTheme: (t: object) => void } }).__copilot.setTheme({
      mode: "light",
      accent: "#0ea5e9",
      radius: 18,
      density: "compact",
    }),
  );
  const vars = await overlay(page).evaluate((el) => ({
    accent: el.style.getPropertyValue("--cp-accent"),
    radius: el.style.getPropertyValue("--cp-radius"),
    surface: el.style.getPropertyValue("--cp-surface"),
  }));
  expect(vars.accent).toBe("#0ea5e9");
  expect(vars.radius).toBe("18px");
  expect(vars.surface).toContain("255"); // light surface
  // Layout/controls unchanged — same data-cp contract.
  await expect(page.locator('[data-cp="next"]')).toBeVisible();
});
