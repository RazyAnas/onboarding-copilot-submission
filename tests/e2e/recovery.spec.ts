import { test, expect, type Page } from "@playwright/test";

/** Distance from the live spotlight center to a target element's center, in px. */
async function spotlightDistanceTo(page: Page, selector: string): Promise<number | null> {
  return page.evaluate((sel) => {
    const host = document.querySelector("[data-copilot-overlay]");
    if (!host) return null;
    const spot = host.shadowRoot!.querySelector(".spotlight") as HTMLElement;
    if (!spot || spot.classList.contains("hidden")) return null;
    const el = document.querySelector(sel);
    if (!el) return null;
    const s = spot.getBoundingClientRect();
    const t = el.getBoundingClientRect();
    return Math.hypot(
      s.left + s.width / 2 - (t.left + t.width / 2),
      s.top + s.height / 2 - (t.top + t.height / 2),
    );
  }, selector);
}

/** Wait until the spotlight is centered on `selector` (within tolerance). */
async function expectSpotlightOn(page: Page, selector: string): Promise<void> {
  await expect
    .poll(async () => (await spotlightDistanceTo(page, selector)) ?? 9999, {
      timeout: 4000,
      message: `spotlight never centered on ${selector}`,
    })
    .toBeLessThan(16);
}

async function startGuide(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as unknown as { __copilot: { start: () => void } }).__copilot.start(),
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/#/settings/members");
  await page.getByTestId("members-invite").waitFor();
});

test("auto-highlights the MEMBERS invite, not the top-nav duplicate", async ({ page }) => {
  await startGuide(page);
  await expectSpotlightOn(page, '[data-testid="members-invite"]');
  // And it is clearly NOT on the top-nav duplicate.
  const distTopnav = await spotlightDistanceTo(page, '[data-testid="topnav-invite"]');
  expect(distTopnav ?? 0).toBeGreaterThan(100);
});

test("recovers the highlight after a forced React remount (node replacement)", async ({
  page,
}) => {
  await startGuide(page);
  await expectSpotlightOn(page, '[data-testid="members-invite"]');

  const handleBefore = await page.getByTestId("members-invite").elementHandle();
  await page.getByRole("button", { name: "Force remount" }).click();

  // The underlying node is genuinely replaced...
  await expect
    .poll(async () =>
      page.evaluate(
        (prev) => prev !== document.querySelector('[data-testid="members-invite"]'),
        handleBefore,
      ),
    )
    .toBe(true);
  // ...yet the spotlight re-resolves onto the new node.
  await expectSpotlightOn(page, '[data-testid="members-invite"]');
});

test("follows a modal/portal target after the user acts", async ({ page }) => {
  await startGuide(page);
  await expectSpotlightOn(page, '[data-testid="members-invite"]');

  // Clicking opens the portal dialog; the gated send step waits on the email
  // field first, so the engine re-targets the email input inside the portal.
  await page.getByTestId("members-invite").click();
  await expectSpotlightOn(page, '[data-testid="invite-email"]');
  // Confirm the target really is inside the portal dialog.
  expect(
    await page
      .getByTestId("invite-email")
      .evaluate((el) => el.closest('[role="dialog"]') !== null),
  ).toBe(true);
});

test("recovers across an SPA route change", async ({ page }) => {
  // Start on the dashboard — highlight should be on the Settings link.
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "Settings" }).waitFor();
  await startGuide(page);
  await expectSpotlightOn(page, ".sidebar a:nth-of-type(2)"); // Settings link

  // Navigate (hash route change) — engine re-requests and re-targets the Members invite.
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expectSpotlightOn(page, '[data-testid="members-invite"]');
});
