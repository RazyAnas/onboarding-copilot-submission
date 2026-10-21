import { chromium } from "./node/node_modules/playwright-core/index.mjs";
import fs from "node:fs";
const OUT = "../corpus";
const pages = [
  ["bootstrap-signin", "https://getbootstrap.com/docs/5.3/examples/sign-in/", "web"],
  ["bootstrap-checkout", "https://getbootstrap.com/docs/5.3/examples/checkout/", "web"],
  ["bootstrap-pricing", "https://getbootstrap.com/docs/5.3/examples/pricing/", "web"],
  ["bootstrap-navbar", "https://getbootstrap.com/docs/5.3/components/navbar/", "web"],
  ["django-docs", "https://docs.djangoproject.com/en/stable/", "web"],
  ["vuejs", "https://vuejs.org/", "web"],
  ["angular-dev", "https://angular.dev/", "web"],
  ["svelte-dev", "https://svelte.dev/", "web"],
  ["tailwind-docs", "https://tailwindcss.com/docs/installation", "web"],
  ["nextjs-docs", "https://nextjs.org/docs", "web"],
  ["flask-docs", "https://flask.palletsprojects.com/en/stable/", "web"],
  ["pypi", "https://pypi.org/", "web"],
  ["shadcn-tasks", "https://ui.shadcn.com/examples/tasks", "web"],
  ["adminlte-forms", "https://adminlte.io/themes/v3/pages/forms/general.html", "web"],
  ["adminlte-tables", "https://adminlte.io/themes/v3/pages/tables/data.html", "web"],
  ["archive-org", "https://archive.org/", "web"],
  ["w3c", "https://www.w3.org/", "web"],
];
const b = await chromium.launch({ channel: "chrome", headless: true });
for (const [name, url, kind] of pages) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  try {
    await p.goto(url, { waitUntil: "load", timeout: 30000 });
    await p.waitForTimeout(2500);
    if (kind === "demo-modal") { await p.locator('[data-testid="members-invite"]').click(); await p.waitForTimeout(500); }
    await p.evaluate(() => { document.querySelectorAll("script,noscript,iframe").forEach(e => e.remove()); document.querySelectorAll("[data-cp-root],[id^=copilot]").forEach(e=>e.remove()); });
    const cdp = await ctx.newCDPSession(p);
    const { data } = await cdp.send("Page.captureSnapshot", { format: "mhtml" });
    fs.writeFileSync(`${OUT}/${name}.mhtml`, data);
    console.log("OK", name, (data.length/1024).toFixed(0)+"KB");
  } catch (e) { console.log("FAIL", name, String(e).slice(0,100)); }
  await ctx.close();
}
await b.close();
