import { test, expect, type Page } from "@playwright/test";

const MOD = process.platform === "darwin" ? "Meta" : "Control";
const field = (page: Page) => page.locator('[data-cp-composer="input"]');
const answer = (page: Page) => page.locator('[data-cp-composer="answer"]');

function openComposer(page: Page): Promise<void> {
  return page.evaluate(() =>
    (window as unknown as { __copilot: { openChat: () => void } }).__copilot.openChat(),
  );
}

async function spotlightDistance(page: Page, selector: string): Promise<number | null> {
  return page.evaluate((sel) => {
    const host = document.querySelector("[data-copilot-overlay]");
    const spot = host?.shadowRoot?.querySelector(".spotlight") as HTMLElement | null;
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

/**
 * M9.6 Layer 3 — the summoned composer (Raycast-style), replacing the old
 * bottom-right chat widget. Single-shot, page-aware, no persistent toggle.
 */
test("the old bottom-right chat toggle is gone", async ({ page }) => {
  await page.goto("/#/settings/members");
  await page.getByTestId("members-invite").waitFor();
  // No persistent chat host, no "?" toggle — the chatbot entry is retired.
  await expect(page.locator("[data-copilot-chat]")).toHaveCount(0);
  await expect(page.locator('[data-cp-chat="toggle"]')).toHaveCount(0);
  // The composer exists but is closed (zero footprint) until summoned.
  await expect(page.locator('[data-cp-composer="scrim"]')).toBeHidden();
});

test("summons with the hotkey, answers a page-aware question, closes with Esc", async ({ page }) => {
  await page.goto("/#/settings/members");
  await page.getByTestId("members-invite").waitFor();

  await page.keyboard.press(`${MOD}+k`);
  await expect(field(page)).toBeVisible();

  await field(page).fill("How do I invite a teammate?");
  await field(page).press("Enter");

  await expect.poll(() => answer(page).textContent(), { timeout: 15000 }).toContain("invite");
  const reply = (await answer(page).textContent()) ?? "";
  expect(reply.length).toBeGreaterThan(10);

  await page.keyboard.press("Escape");
  await expect(page.locator('[data-cp-composer="scrim"]')).toBeHidden();
});

test('"Guide me" converts a composer answer into a live on-screen guide', async ({ page }) => {
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "Settings" }).waitFor();

  await openComposer(page);
  await field(page).fill("How do I invite a teammate?");
  await field(page).press("Enter");

  await page.locator('[data-cp-composer="guide"]').click({ timeout: 15000 });

  // The spotlight lands on the Settings link (step 1 of the retrieved invite flow).
  await expect
    .poll(() => spotlightDistance(page, ".sidebar a:nth-of-type(2)"), { timeout: 8000 })
    .toBeLessThan(16);
});

test("continuous multi-turn chat keeps prior messages in the transcript", async ({ page }) => {
  await page.goto("/#/settings/members");
  await page.getByTestId("members-invite").waitFor();
  const composer = page.locator("[data-copilot-composer]");

  await openComposer(page);
  await field(page).fill("How do I invite a teammate?");
  await field(page).press("Enter");
  await expect.poll(() => answer(page).count(), { timeout: 15000 }).toBe(1);

  // Ask a follow-up — the composer must NOT clear; both turns stay.
  await field(page).fill("and how do I remove one?");
  await field(page).press("Enter");
  await expect
    .poll(() => composer.evaluate((el) => el.shadowRoot?.querySelectorAll(".msg--user").length ?? 0), {
      timeout: 15000,
    })
    .toBe(2);
  // Two user bubbles + at least two assistant messages = a real conversation.
  const bots = await composer.evaluate((el) => el.shadowRoot?.querySelectorAll(".msg--bot").length ?? 0);
  expect(bots).toBeGreaterThanOrEqual(2);
});

test("the discovery dock's Ask opens the composer (Layer 1 → Layer 3)", async ({ page }) => {
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "Settings" }).waitFor();
  const dock = page.locator("[data-copilot-dock]");
  await expect
    .poll(() => dock.evaluate((el) => el.shadowRoot?.querySelector('[data-cp="dock-pill"]') ? 1 : 0), {
      timeout: 8000,
    })
    .toBe(1);

  await dock.evaluate((el) => {
    const sr = el.shadowRoot!;
    (sr.querySelector('[data-cp="dock-pill"]') as HTMLButtonElement).click();
    (sr.querySelector('[data-cp="dock-ask"]') as HTMLButtonElement).click();
  });
  await expect(field(page)).toBeVisible();
});
