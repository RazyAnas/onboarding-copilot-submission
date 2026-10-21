import { chromium } from "./node/node_modules/playwright-core/index.mjs";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(here, "../corpus"), OUT = path.join(here, "../results");
const bundle = fs.readFileSync(path.join(here, "cp.bundle.js"), "utf8");
const b = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript({ content: bundle });
const timing = {};
for (const f of fs.readdirSync(CORPUS).filter(f => f.endsWith(".mhtml"))) {
  const name = f.replace(".mhtml", ""); const p = await ctx.newPage();
  await p.goto("file://" + path.join(CORPUS, f), { waitUntil: "load" }); await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const cp = window.__cp; const t = [];
    let cands; for (let i = 0; i < 5; i++) { const t0 = performance.now(); cands = cp.extractCandidates(document); t.push(performance.now() - t0); }
    t.sort((a, b) => a - b); const els = cands.map(c => c.element);
    const all = document.querySelectorAll("a[href],button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem]").length;
    const d = cp.descriptorFromElement(els[Math.floor(els.length / 2)]); const spec = cp.specFromDescriptor(d);
    const s = []; for (let i = 0; i < 20; i++) { const t0 = performance.now(); cp.bestMatch(els, spec); s.push(performance.now() - t0); } s.sort((a, b) => a - b);
    return { els, extractMs: t[2], scoreMs: s[10], nInteractive: all, nKept: els.length };
  });
  fs.writeFileSync(path.join(OUT, "snapshots", name + ".json"), JSON.stringify(r.els));
  timing[name] = { extractMs: r.extractMs, scoreMs: r.scoreMs, nInteractive: r.nInteractive, nKept: r.nKept };
  console.log(name, JSON.stringify(timing[name])); await p.close();
}
// synthetic scaling: N interactive elements
const p = await ctx.newPage(); await p.goto("about:blank");
const scale = [];
for (const N of [50, 100, 250, 500, 1000, 2000, 5000]) {
  const r = await p.evaluate((N) => {
    document.body.innerHTML = '<main aria-label="App">' + Array.from({ length: N }, (_, i) => `<section aria-label="Group ${i % 20}"><button>Action ${i % 37}</button></section>`).join("") + "</main>";
    const cp = window.__cp; const ex = [];
    let cands; for (let i = 0; i < 3; i++) { const t0 = performance.now(); cands = cp.extractCandidates(document); ex.push(performance.now() - t0); } ex.sort((a, b) => a - b);
    const els = cands.map(c => c.element); const spec = cp.specFromDescriptor(cp.descriptorFromElement(els[els.length >> 1]));
    const sc = []; for (let i = 0; i < 20; i++) { const t0 = performance.now(); cp.bestMatch(els, spec); sc.push(performance.now() - t0); } sc.sort((a, b) => a - b);
    // full-scan scoring cost (no cap) to show scorer scaling itself
    const big = []; for (let k = 0; k < Math.ceil(N / els.length); k++) big.push(...els); const t1 = performance.now(); cp.bestMatch(big.slice(0, N), spec); const full = performance.now() - t1;
    return { N, kept: els.length, extractMs: ex[1], scoreMs: sc[10], scoreAllMs: full };
  }, N);
  scale.push(r); console.log("scale", JSON.stringify(r));
}
fs.writeFileSync(path.join(OUT, "timing.json"), JSON.stringify({ pages: timing, scale }, null, 1));
await b.close();
