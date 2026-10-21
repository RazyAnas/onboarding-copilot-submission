import { test, expect } from "@playwright/test";

const SERVER = "http://localhost:8787";

/**
 * M7 proof: lifecycle events are recorded server-side, the funnel is queryable
 * via /v1/stats, and the SDK debug overlay surfaces live decision state.
 */
test("records funnel events and exposes them via /v1/stats", async ({ page, request }) => {
  const before = await (await request.get(`${SERVER}/v1/stats?apiKey=demo-secret`)).json();
  const inviteBefore = before.flows.find((f: { key: string }) => f.key === "invite-teammate");

  // Start a session (the demo auto-starts the invite-teammate flow) and advance once.
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "Settings" }).waitFor();
  await page.evaluate(() =>
    (window as unknown as { __copilot: { requestGuidance: (c?: string) => Promise<unknown> } })
      .__copilot.requestGuidance(),
  );
  await page.evaluate(() =>
    (window as unknown as { __copilot: { requestGuidance: (c?: string) => Promise<unknown> } })
      .__copilot.requestGuidance("next"),
  );

  const after = await (await request.get(`${SERVER}/v1/stats?apiKey=demo-secret`)).json();
  const invite = after.flows.find((f: { key: string }) => f.key === "invite-teammate");
  expect(invite.sessions).toBeGreaterThan(inviteBefore?.sessions ?? 0);
  expect(after.totals.sessions).toBeGreaterThan(before.totals.sessions ?? 0);
});

test("debug overlay shows live decision state (step, mode, confidence)", async ({ page }) => {
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "Settings" }).waitFor();
  // Start the engine via the demo dev toolbar, then wait for a guidance tick.
  await page.getByRole("button", { name: "Start guide" }).click();
  const panel = page.locator("[data-copilot-debug]");
  await expect(panel).toBeAttached();
  await expect
    .poll(async () => panel.evaluate((el) => el.shadowRoot?.textContent ?? ""), {
      timeout: 10_000,
    })
    .toContain("decision");
  const text = await panel.evaluate((el) => el.shadowRoot?.textContent ?? "");
  expect(text).toContain("conf=");
  expect(text).toMatch(/deterministic|ai/);
});
