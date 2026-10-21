import { test, expect, type Page } from "@playwright/test";

const dock = (page: Page) => page.locator("[data-copilot-dock]");

function pillText(page: Page): Promise<string> {
  return dock(page).evaluate(
    (el) => el.shadowRoot?.querySelector('[data-cp="dock-pill"]')?.textContent ?? "",
  );
}

/**
 * M9.6 Layer 1 — the discovery dock: a low-footprint progress launcher that
 * expands into a recommended-flows checklist, adaptively placed, that launches a
 * guide on demand (push discovery for confused users — no command palette needed).
 */
test("dock shows progress and opens a checklist of recommended flows", async ({ page }) => {
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "Settings" }).waitFor();

  await expect.poll(() => pillText(page), { timeout: 8000 }).toContain("of");

  // Expand → checklist lists real authored flows with a Start affordance.
  await dock(page).evaluate((el) =>
    (el.shadowRoot?.querySelector('[data-cp="dock-pill"]') as HTMLButtonElement).click(),
  );
  const panel = await dock(page).evaluate(
    (el) => el.shadowRoot?.querySelector('[data-cp="dock-panel"]')?.textContent ?? "",
  );
  expect(panel).toContain("Invite a teammate");
  const starts = await dock(page).evaluate(
    (el) => el.shadowRoot?.querySelectorAll('[data-cp="dock-start"]').length ?? 0,
  );
  expect(starts).toBeGreaterThan(0);
});

test("starting a flow from the checklist launches the on-screen guide", async ({ page }) => {
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "Settings" }).waitFor();
  await expect.poll(() => pillText(page), { timeout: 8000 }).toContain("of");

  await dock(page).evaluate((el) => {
    const sr = el.shadowRoot!;
    (sr.querySelector('[data-cp="dock-pill"]') as HTMLButtonElement).click();
    (sr.querySelector('[data-cp="dock-start"]') as HTMLButtonElement).click();
  });

  // The companion overlay becomes an active guide (Layer 1 → Layer 2 handoff).
  await expect
    .poll(() => page.locator("[data-copilot-overlay]").getAttribute("data-cp-state"), {
      timeout: 8000,
    })
    .toMatch(/active|waiting/);
});

test("adaptive placement rises above the demo's fixed bottom toolbar", async ({ page }) => {
  await page.goto("/#/dashboard");
  await expect.poll(() => pillText(page), { timeout: 8000 }).toContain("of");

  // The demo's .devbar is a fixed full-width bottom bar (~3 levels deep). The dock
  // must detect it and dock ABOVE it, not overlap it.
  const bottom = await dock(page).evaluate(
    (el) => parseFloat((el as HTMLElement).style.bottom) || 0,
  );
  const barTop = await page.locator(".devbar").evaluate((b) => b.getBoundingClientRect().top);
  const dockBottomY = await page.evaluate(
    (b) => window.innerHeight - b,
    bottom,
  );
  // The dock's lower edge sits above the toolbar's top edge.
  expect(dockBottomY).toBeLessThanOrEqual(barTop + 1);
  expect(bottom).toBeGreaterThan(16);
});
