import { chromium } from "./node/node_modules/playwright-core/index.mjs";
import fs from "node:fs";
const OUT = "../corpus";
const pages = [
  ["demo-members", "http://localhost:5181/#/settings/members", "demo"],
  ["demo-dashboard", "http://localhost:5181/#/dashboard", "demo"],
  ["demo-modal", "http://localhost:5181/#/settings/members", "demo-modal"],
  ["todomvc", "https://todomvc.com/examples/react/dist/", "web"],
  ["adminlte", "https://adminlte.io/themes/v3/index3.html", "web"],
  ["bootstrap-dashboard", "https://getbootstrap.com/docs/5.3/examples/dashboard/", "web"],
  ["bootstrap-forms", "https://getbootstrap.com/docs/5.3/forms/overview/", "web"],
  ["hackernews", "https://news.ycombinator.com/", "web"],
  ["python-docs", "https://docs.python.org/3/", "web"],
  ["react-dev", "https://react.dev/", "web"],
  ["shadcn-dashboard", "https://ui.shadcn.com/examples/dashboard", "web"],
  ["mdn-button", "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/button", "web"],
  ["wikipedia-main", "https://en.wikipedia.org/wiki/Main_Page", "web"],
  ["github-playwright", "https://github.com/microsoft/playwright", "web"],
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
