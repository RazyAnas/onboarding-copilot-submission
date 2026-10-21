import { chromium } from "./node/node_modules/playwright-core/index.mjs";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { PAGE_SETUP, CHOOSE_TARGETS } from "./lib.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const bundle = fs.readFileSync(path.join(here, "cp.bundle.js"), "utf8"), fb = fs.readFileSync(path.join(here, "finder.bundle.js"), "utf8");
const b = await chromium.launch({ channel: "chrome", headless: true });
for (const name of ["shadcn-dashboard", "adminlte", "bootstrap-dashboard", "python-docs"]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); await ctx.addInitScript({ content: bundle }); await ctx.addInitScript({ content: fb });
  const p = await ctx.newPage(); await p.goto("file://" + path.join(here, "../corpus", name + ".mhtml")); await p.waitForTimeout(400);
  await p.evaluate(PAGE_SETUP); await p.evaluate(`(${CHOOSE_TARGETS})(80, 12345)`);
  const l = await p.evaluate(() => window.__auth.filter(a => a.dup && a.hasSection).slice(0, 8).map(a => [a.role, a.name, a.crit.sectionHint]));
  console.log(name, JSON.stringify(l)); await ctx.close();
}
await b.close();
