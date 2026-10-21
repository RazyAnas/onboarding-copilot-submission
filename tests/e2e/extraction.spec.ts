import { test, expect, type Page } from "@playwright/test";

interface ExtractedEl {
  id: string;
  role: string;
  name: string;
  testId: string | null;
  sectionRole: string | null;
  sectionLabel: string | null;
  ordinal: number;
  visible: boolean;
}

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

async function extract(page: Page): Promise<ExtractedEl[]> {
  return page.evaluate(() => {
    const cp = (window as unknown as { __copilot?: { captureElements: () => unknown[] } })
      .__copilot;
    if (!cp) throw new Error("window.__copilot not present (debug mode off?)");
    return cp.captureElements() as ExtractedEl[];
  });
}

/**
 * Parse Playwright's aria snapshot (the real accessibility tree, rendered as
 * YAML) into a set of "role|name" keys. Lines look like: `- button "Invite"`.
 */
function flattenOracle(ariaYaml: string): Set<string> {
  const set = new Set<string>();
  const re = /-\s+([a-z][a-z-]*)\s+"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ariaYaml)) !== null) {
    set.add(`${m[1]}|${norm(m[2]!)}`);
  }
  return set;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/#/settings/members");
  await page.getByTestId("members-invite").waitFor();
});

test("extracts both duplicate Invite buttons with disambiguating section context", async ({
  page,
}) => {
  const els = await extract(page);
  const invites = els
    .filter((e) => e.role === "button" && norm(e.name) === "invite")
    .sort((a, b) => a.ordinal - b.ordinal);

  expect(invites).toHaveLength(2);
  // Distinct stable ids despite identical role+name.
  expect(invites[0]!.id).not.toBe(invites[1]!.id);
  // Section context separates them — the core disambiguation signal.
  const sections = invites.map((i) => i.sectionLabel);
  expect(sections).toContain("Top navigation");
  expect(sections).toContain("Members");
  // testIds correctly captured.
  expect(invites.map((i) => i.testId).sort()).toEqual([
    "members-invite",
    "topnav-invite",
  ]);
});

test("extracted roles+names align with the real accessibility tree (oracle)", async ({
  page,
}) => {
  const els = await extract(page);
  const oracle = flattenOracle(await page.locator("body").ariaSnapshot());

  // Compare named, interactive elements against Chromium's a11y tree.
  const checkRoles = new Set(["button", "link", "textbox", "combobox", "checkbox"]);
  const named = els.filter((e) => checkRoles.has(e.role) && e.name.length > 0);
  expect(named.length).toBeGreaterThan(3);

  const mismatches = named.filter((e) => !oracle.has(`${e.role}|${norm(e.name)}`));
  // Every named interactive element we extract must exist in the real a11y tree.
  expect(mismatches, JSON.stringify(mismatches, null, 2)).toHaveLength(0);
});
