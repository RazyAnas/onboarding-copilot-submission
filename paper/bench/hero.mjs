import { chromium } from "./node/node_modules/playwright-core/index.mjs";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { PAGE_SETUP, CHOOSE_TARGETS, RUN_TRIAL } from "./lib.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const bundle = fs.readFileSync(path.join(here, "cp.bundle.js"), "utf8"), fb = fs.readFileSync(path.join(here, "finder.bundle.js"), "utf8");
const CASES = JSON.parse(process.env.CASES || '[["demo-members","invite","Members"]]');
const OUT = path.join(here, "../figs/hero"); fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: "chrome", headless: true });
const meta = [];
for (const [name, tname, tsec] of CASES) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript({ content: bundle }); await ctx.addInitScript({ content: fb });
  const p = await ctx.newPage(); await p.goto("file://" + path.join(here, "../corpus", name + ".mhtml")); await p.waitForTimeout(500);
  await p.evaluate(PAGE_SETUP); await p.evaluate(`(${CHOOSE_TARGETS})(60, 12345)`);
  const tIdx = await p.evaluate(([tn, ts]) => window.__auth.findIndex(a => a.name === tn && (!ts || (a.crit.sectionHint || "").includes(ts))), [tname, tsec]);
  if (tIdx < 0) { console.log("no target", name); continue; }
  // screenshot of v0 with the authored target outlined
  const draw = async (items) => p.evaluate((items) => { document.querySelectorAll(".__ov").forEach(e => e.remove()); items.forEach(([gtOrSel, color, label, mode]) => { const n = mode === "gt" ? document.querySelector('[data-gt="' + gtOrSel + '"]') : null; if (!n) return; n.scrollIntoView({ block: "center" }); const r = n.getBoundingClientRect(); const d = document.createElement("div"); d.className = "__ov"; d.style.cssText = `position:fixed;left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px;border:3px solid ${color};border-radius:8px;box-shadow:0 0 0 4px ${color}33;z-index:2147483647;pointer-events:none`; const l = document.createElement("div"); l.textContent = label; l.style.cssText = `position:absolute;top:-22px;left:-3px;background:${color};color:#fff;font:600 12px Arial;padding:2px 6px;border-radius:4px;white-space:nowrap`; d.appendChild(l); document.body.appendChild(d); }); }, items);
  const shot = async (f, ids) => { await p.waitForTimeout(150);
    const clip = await p.evaluate((ids) => { const rs = ids.map((id) => document.querySelector('[data-gt="' + id + '"]')).filter(Boolean).map((n) => n.getBoundingClientRect()); if (!rs.length) return null; const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top)), rr = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom)); const W = 560, Hh = 330; let w = Math.max(W, rr - l + 120), h = Math.max(Hh, b - t + 100); w = Math.min(w, innerWidth); h = Math.min(h, innerHeight); let x = Math.max(0, Math.min(innerWidth - w, (l + rr) / 2 - w / 2)), y = Math.max(0, Math.min(innerHeight - h, (t + b) / 2 - h / 2)); return { x, y, width: w, height: h }; }, ids);
    await p.screenshot({ path: path.join(OUT, f), ...(clip ? { clip } : {}) }); };
  await p.evaluate(`(${RUN_TRIAL})("classes", 0, 1)`);
  const a0 = await p.evaluate((i) => window.__auth[i].gt, tIdx);
  await draw([[a0, "#1b7f3b", "authored target", "gt"]]); await shot(`${name}_v0.png`, [a0]);
  // find a seed where selector fails/wrong, text wrong and ours right
  let chosen = null;
  for (let seed = 1; seed <= 60 && !chosen; seed++) {
    const res = await p.evaluate(`(${RUN_TRIAL})("redeploy", 0.5, ${seed * 31})`);
    const r = Object.fromEntries(res.rec.filter(x => x[0] === tIdx).map(x => [x[1], x[2]]));
    if (r.css !== "c" && (r.text === "w" || r.rolename === "w") && r.o_D === "c") chosen = { seed: seed * 31, r };
  }
  if (!chosen) { console.log("no seed for", name); await ctx.close(); continue; }
  // re-run chosen to leave DOM perturbed, then resolve each method to a node and mark it
  await p.evaluate(`(${RUN_TRIAL})("redeploy", 0.5, ${chosen.seed})`);
  const picks = await p.evaluate((ti) => {
    const a = window.__auth[ti], cp = window.__cp, norm = window.__norm, body = document.body;
    const tag = (n) => { if (!n) return null; if (!n.getAttribute("data-gt")) n.setAttribute("data-gt", "x" + Math.random()); return n.getAttribute("data-gt"); };
    let css = null; try { css = body.ownerDocument.querySelector(a.css); } catch (e) {}
    let text = null; for (const e of document.body.querySelectorAll(a.tag)) { if (norm(e.textContent) === a.text) { text = e; break; } }
    const cands = cp.extractCandidates(document), els = cands.map(c => c.element);
    const rn = cands.filter(c => c.element.role === a.role && norm(c.element.name) === a.name)[0];
    const ranked = cp.rankCandidates(els, cp.specFromDescriptor(a.desc)); const top = ranked[0]; const node = top ? cands.find(c => c.element === top.element).node : null;
    return { gt: a.gt, css: tag(css), text: tag(text), rolename: tag(rn && rn.node), ours: tag(node), oursScore: top ? top.score.total : 0 };
  }, tIdx);
  const panel = async (key, label, f) => {
    const id = picks[key]; if (!id) { await draw([]); await p.evaluate((a0) => document.querySelector('[data-gt="' + a0 + '"]')?.scrollIntoView({ block: "center" }), picks.gt); await p.evaluate((g) => { const n = document.querySelector('[data-gt="' + g + '"]'); const r = n.getBoundingClientRect(); const d = document.createElement("div"); d.className = "__ov"; d.textContent = "selector matches nothing: no highlight"; d.style.cssText = `position:fixed;left:${Math.max(8, r.left - 120)}px;top:${r.bottom + 14}px;background:#555;color:#fff;font:600 13px Arial;padding:6px 10px;border-radius:6px;z-index:2147483647`; document.body.appendChild(d); }, picks.gt); await shot(f, [picks.gt]); return "none"; }
    const ok = id === picks.gt; await draw([[id, ok ? "#1b7f3b" : "#d62828", label + (ok ? " ✓" : " ✗ wrong element"), "gt"]]); await shot(f, [id, picks.gt]); return ok ? "correct" : "wrong";
  };
  const o = {};
  o.css = await panel("css", "CSS selector", `${name}_css.png`);
  o.text = await panel("text", "Text rule", `${name}_text.png`);
  o.rolename = await panel("rolename", "Role+name", `${name}_rolename.png`);
  o.ours = await panel("ours", "Ours", `${name}_ours.png`);
  meta.push({ name, target: tname, seed: chosen.seed, outcomes: o, oursScore: picks.oursScore });
  console.log(name, JSON.stringify(o));
  await ctx.close();
}
fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta, null, 1));
await b.close();
