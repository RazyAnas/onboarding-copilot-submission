import { test, expect, type Page } from "@playwright/test";

interface TargetDescriptor {
  role: string;
  name: string;
  testId?: string;
}
interface GuidanceResponse {
  stepId: string | null;
  instruction: { kind: string; target?: TargetDescriptor; content: { body: string } };
}

async function requestGuidance(page: Page): Promise<GuidanceResponse> {
  return page.evaluate(() =>
    (
      window as unknown as {
        __copilot: { requestGuidance: () => Promise<GuidanceResponse> };
      }
    ).__copilot.requestGuidance(),
  );
}

/** Act on the highlighted target the way a guided user would. */
async function act(page: Page, target: TargetDescriptor): Promise<void> {
  if (target.role === "textbox" && target.testId) {
    await page.getByTestId(target.testId).fill("teammate@acme.com");
  } else if (target.testId) {
    await page.getByTestId(target.testId).click();
  } else {
    await page.getByRole(target.role as "link" | "button", { name: target.name, exact: true }).first().click();
  }
  await page.waitForTimeout(250); // let the SPA route / modal / gate settle
}

test("deterministically walks the invite-teammate flow end to end", async ({ page }) => {
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "Settings" }).waitFor();

  const visited: string[] = [];
  let done = false;

  for (let i = 0; i < 8 && !done; i++) {
    const res = await requestGuidance(page);
    if (res.instruction.kind === "done") {
      done = true;
      break;
    }
    expect(res.instruction.target, `step ${res.stepId} should have a target`).toBeTruthy();
    if (visited[visited.length - 1] !== res.stepId) visited.push(res.stepId!);

    // The Invite step must resolve to the MEMBERS button, not the top-nav duplicate.
    if (res.stepId === "click-invite") {
      expect(res.instruction.target!.testId).toBe("members-invite");
    }

    await act(page, res.instruction.target!);
  }

  expect(done).toBe(true);
  // send-invite appears once it advances (waiting → active are the same step id).
  expect(visited).toEqual(["open-settings", "click-invite", "send-invite"]);
});
