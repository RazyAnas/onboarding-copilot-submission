import { test, expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    __copilot: { start: () => void };
  }
}

async function startGuide(page: Page): Promise<void> {
  await page.evaluate(() => window.__copilot.start());
}

/** data-testid (or tag) of the page element under the spotlight center, via elementFromPoint. */
async function spotlightTarget(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const host = document.querySelector("[data-copilot-overlay]");
    const spot = host?.shadowRoot?.querySelector(".spotlight");
    if (!spot || spot.classList.contains("hidden")) return null;
    const r = spot.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el?.getAttribute("data-testid") ?? el?.tagName ?? null;
  });
}

const badge = (page: Page) => page.locator(".card__badge");
const card = (page: Page) => page.locator(".card");
const launcher = (page: Page) => page.locator(".launcher");
const cp = (page: Page, name: string) => page.locator(`[data-cp="${name}"]`);

test.describe("guidance UX layer", () => {
  test("renders the full set of soft controls", async ({ page }) => {
    await page.goto("/#/settings/members");
    await page.getByTestId("members-invite").waitFor();
    await startGuide(page);
    await expect(card(page)).toBeVisible();

    for (const ctl of ["pause", "hide", "dismiss", "back", "skip", "next"]) {
      await expect(cp(page, ctl)).toBeVisible();
    }
    // Back is disabled on the first step.
    await expect(badge(page)).toContainText("Step");
  });

  test("waits for user input, then suggests the next action (waiting → active)", async ({
    page,
  }) => {
    await page.goto("/#/settings/members");
    await page.getByTestId("members-invite").waitFor();
    await startGuide(page);

    // Open the invite dialog.
    await page.getByTestId("members-invite").click();

    // WAITING: highlights the email field and says to enter an email.
    await expect.poll(() => badge(page).textContent()).toContain("waiting");
    await expect.poll(() => spotlightTarget(page)).toBe("invite-email");

    // The user types an email.
    await page.getByTestId("invite-email").fill("teammate@acme.com");

    // ACTIVE: gate satisfied — now (and only now) it points at Send invite.
    await expect.poll(() => badge(page).textContent()).not.toContain("waiting");
    await expect.poll(() => spotlightTarget(page)).toBe("send-invite");
  });

  test("supports Next / Back / Skip navigation", async ({ page }) => {
    await page.goto("/#/dashboard");
    await page.getByRole("link", { name: "Settings" }).waitFor();
    await startGuide(page);
    await expect.poll(() => badge(page).textContent()).toContain("Step 1 of 3");
    await expect(cp(page, "back")).toBeDisabled();

    await cp(page, "next").click();
    await expect.poll(() => badge(page).textContent()).toContain("Step 2 of 3");
    await expect(cp(page, "back")).toBeEnabled();

    await cp(page, "back").click();
    await expect.poll(() => badge(page).textContent()).toContain("Step 1 of 3");

    await cp(page, "skip").click();
    await expect.poll(() => badge(page).textContent()).toContain("Step 2 of 3");
  });

  test("manually advancing past the page does NOT highlight a wrong duplicate", async ({
    page,
  }) => {
    await page.goto("/#/dashboard");
    await page.getByRole("link", { name: "Settings" }).waitFor();
    await startGuide(page);
    await expect.poll(() => badge(page).textContent()).toContain("Step 1 of 3");

    // Jump to the "click Invite in Members" step while still on the dashboard.
    await cp(page, "next").click();
    await expect.poll(() => badge(page).textContent()).toContain("Step 2 of 3");
    // The instruction shows, but nothing is spotlighted — and certainly NOT the
    // top-nav Invite duplicate (the original bug).
    await expect(card(page)).toBeVisible();
    expect(await spotlightTarget(page)).not.toBe("topnav-invite");
  });

  test("Pause freezes guidance (no auto-advance) and toggles to Resume", async ({
    page,
  }) => {
    await page.goto("/#/settings/members");
    await page.getByTestId("members-invite").waitFor();
    await startGuide(page);
    await expect.poll(() => badge(page).textContent()).toContain("Step 2 of 3");

    await cp(page, "pause").click();
    await expect(badge(page)).toHaveText("Paused");
    await expect(cp(page, "pause")).toHaveText("Resume");

    // Opening the modal would normally auto-advance — but paused it must not.
    await page.getByTestId("members-invite").click();
    await page.waitForTimeout(700);
    await expect(badge(page)).toHaveText("Paused");
  });

  test("Hide collapses to a launcher pill and relaunches", async ({ page }) => {
    await page.goto("/#/settings/members");
    await page.getByTestId("members-invite").waitFor();
    await startGuide(page);
    await expect(card(page)).toBeVisible();

    await cp(page, "hide").click();
    await expect(card(page)).toBeHidden();
    await expect(launcher(page)).toBeVisible();

    await cp(page, "launcher").click();
    await expect(card(page)).toBeVisible();
    await expect(launcher(page)).toBeHidden();
  });

  test("Dismiss for now stops the guide and collapses to the launcher", async ({
    page,
  }) => {
    await page.goto("/#/settings/members");
    await page.getByTestId("members-invite").waitFor();
    await startGuide(page);
    await expect(card(page)).toBeVisible();

    await cp(page, "dismiss").click();
    await expect(card(page)).toBeHidden();
    await expect(launcher(page)).toBeVisible();
  });
});
