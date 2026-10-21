import { chromium } from "./node/node_modules/playwright-core/index.mjs";
import fs from "node:fs";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const rec = [];
p.on("request", r => { if (r.url().endsWith("/v1/guidance")) rec.push({ t: Date.now(), bytes: (r.postData() || "").length, url: r.url() }); });
p.on("response", r => { if (r.url().endsWith("/v1/guidance")) { const q = rec.find(x => !x.ms); if (q) { q.ms = Date.now() - q.t; q.status = r.status(); } } });
for (const hash of ["#/dashboard", "#/settings/members"]) {
  await p.goto("http://localhost:5181/" + hash, { waitUntil: "load" }); await p.waitForTimeout(1200);
  for (let i = 0; i < 5; i++) { await p.locator("text=Send snapshot").click(); await p.waitForTimeout(250); }
}
await p.waitForTimeout(800);
console.log(JSON.stringify(rec.map(r => ({ bytes: r.bytes, ms: r.ms, status: r.status }))));
fs.writeFileSync("../results/legacy_guidance.json", JSON.stringify(rec));
await b.close();
