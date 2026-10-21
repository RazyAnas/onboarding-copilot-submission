// Robustness benchmark: re-resolve authored targets after seeded DOM perturbations.
// Ground truth = a data-gt attribute injected into the pristine DOM and carried by every
// perturbation (clones for duplicate-injection do NOT carry it). No method may read data-gt.
import { chromium } from "./node/node_modules/playwright-core/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(here, "../corpus");
const COLLECT = process.env.COLLECT === "1";
const OUT = path.join(here, COLLECT ? "../results/feats.jsonl" : "../results/robustness.jsonl");
const bundle = fs.readFileSync(path.join(here, "cp.bundle.js"), "utf8");
const finderBundle = fs.readFileSync(path.join(here, "finder.bundle.js"), "utf8");

const OPS = ["classes", "ids", "reorder", "wrap", "copy", "dup_section", "dup_adjacent", "redeploy"];
const RHOS = [0, 0.1, 0.25, 0.5, 0.75, 1.0];
const SEEDS = Number(process.env.SEEDS ?? 5);
const MAX_TARGETS = Number(process.env.MAX_TARGETS ?? 10);
const WORKERS = Number(process.env.WORKERS ?? 4);
const pagesAll = fs.readdirSync(CORPUS).filter((f) => f.endsWith(".mhtml")).map((f) => f.replace(".mhtml", "")).sort();
const pages = process.env.PAGES ? process.env.PAGES.split(",") : pagesAll;

import { PAGE_SETUP, CHOOSE_TARGETS, RUN_TRIAL } from "./lib.mjs";
async function runPage(browser, name, log) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript({ content: bundle });
  await ctx.addInitScript({ content: finderBundle });
  const page = await ctx.newPage();
  await page.goto("file://" + path.join(CORPUS, name + ".mhtml"), { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(500);
  const info = await page.evaluate(PAGE_SETUP);
  if (COLLECT) await page.evaluate("window.__collect = true");
  const nT = await page.evaluate(`(${CHOOSE_TARGETS})(${MAX_TARGETS}, 12345)`);
  log(`page ${name}: pool=${info.pool} dups=${info.dups} cssBlocked=${info.cssBlocked}/${info.sheets} targets=${nT}`);
  const lines = [];
  for (const op of OPS) {
    for (const rho of RHOS) {
      if (rho === 0 && op !== "classes") continue; // identity measured once
      for (let seed = 1; seed <= SEEDS; seed++) {
        const res = await page.evaluate(`(${RUN_TRIAL})(${JSON.stringify(op)}, ${rho}, ${seed * 7919 + Math.round(rho * 100)})`);
        if (COLLECT) { for (const g of res.groups) lines.push(JSON.stringify({ p: name, op: rho === 0 ? 'identity' : op, rho, seed, t: g.t, d: res.dup[g.t], y: g.y, X: g.X })); continue; }
        for (const [ti, m, o, extra] of res.rec) lines.push(JSON.stringify({ p: name, op: rho === 0 ? "identity" : op, rho, seed, t: ti, d: res.dup[ti], m, o, x: extra }));
      }
    }
  }
  await ctx.close();
  return { lines, info, nT };
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
fs.writeFileSync(OUT, "");
const queue = pages.slice();
const meta = {};
const log = (s) => console.log(new Date().toISOString().slice(11, 19), s);
await Promise.all(Array.from({ length: WORKERS }, async () => {
  while (queue.length) {
    const name = queue.shift();
    try { const t0 = Date.now(); const { lines, info, nT } = await runPage(browser, name, log); fs.appendFileSync(OUT, lines.join("\n") + "\n"); meta[name] = { ...info, targets: nT }; log(`done ${name} (${((Date.now() - t0) / 1000).toFixed(0)}s, ${lines.length} rows)`); }
    catch (e) { log(`FAIL ${name}: ${String(e).slice(0, 200)}`); }
  }
}));
if (!COLLECT) fs.writeFileSync(path.join(here, "../results/corpus_meta.json"), JSON.stringify(meta, null, 1));
await browser.close();
