// ---- in-page code (stringified) ----
export const PAGE_SETUP = `(() => {
  const norm = (s) => (s || "").replace(/\\s+/g, " ").trim().toLowerCase();
  window.__norm = norm;
  const cp = window.__cp;
  // tag everything in pristine DOM
  let n = 0;
  document.body.querySelectorAll("*").forEach((e) => e.setAttribute("data-gt", String(n++)));
  const cands = cp.extractCandidates(document);
  const ok = new Set(["button", "link", "textbox", "checkbox", "combobox", "searchbox", "tab", "menuitem", "radio", "switch"]);
  const keyCount = new Map();
  cands.forEach((c) => { const k = c.element.role + "|" + norm(c.element.name); keyCount.set(k, (keyCount.get(k) || 0) + 1); });
  let pool = cands.filter((c) => c.element.visible && c.element.enabled && ok.has(c.element.role) && c.element.name.length >= 2 && c.element.name.length <= 60 && c.element.bbox.width > 0);
  window.__pool = pool.map((c) => ({ node: c.node, element: c.element, dup: keyCount.get(c.element.role + "|" + norm(c.element.name)) > 1 }));
  // pristine copies
  window.__pristineBody = document.body.cloneNode(true);
  // collect css text once
  window.__css = [];
  for (const sh of Array.from(document.styleSheets)) {
    try { window.__css.push(Array.from(sh.cssRules).map((r) => r.cssText).join("\\n")); } catch (e) { window.__css.push(null); }
  }
  window.__cssBlocked = window.__css.filter((x) => x === null).length;
  return { pool: window.__pool.length, dups: window.__pool.filter((p) => p.dup).length, cssBlocked: window.__cssBlocked, sheets: window.__css.length };
})()`;

export const CHOOSE_TARGETS = `((max, seed) => {
  function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  const r = rng(seed);
  const idx = window.__pool.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const dupIdx = idx.filter((i) => window.__pool[i].dup).slice(0, Math.min(3, max));
  const rest = idx.filter((i) => !dupIdx.includes(i)).slice(0, max - dupIdx.length);
  const chosen = [...dupIdx, ...rest];
  const norm = window.__norm, cp = window.__cp, finder = window.__finder;
  function xpath(el) { const parts = []; while (el && el.nodeType === 1 && el !== document.documentElement) { let i = 1, s = el.previousElementSibling; while (s) { if (s.tagName === el.tagName) i++; s = s.previousElementSibling; } parts.unshift(el.tagName.toLowerCase() + "[" + i + "]"); el = el.parentElement; } return "/html[1]/" + parts.join("/"); }
  window.__auth = chosen.map((i) => {
    const p = window.__pool[i]; const el = p.element; const node = p.node;
    let css = null; try { css = finder(node, { root: document.body }); } catch (e) { css = null; }
    const xp = xpath(node);
    const desc = cp.descriptorFromElement(el);
    const crit = { role: el.role, name: { equals: el.name } };
    if (el.testId) crit.testId = el.testId;
    if (el.sectionLabel) crit.sectionHint = el.sectionLabel;
    const sim = { tag: node.tagName.toLowerCase(), cls: (node.getAttribute('class')||'').trim(), id: node.id||'', aria: node.getAttribute('aria-label')||node.getAttribute('name')||node.getAttribute('placeholder')||'', href: node.getAttribute('href')||'', text: norm(node.textContent).slice(0,80), xp, bb: el.bbox, pcls: (node.parentElement && node.parentElement.getAttribute('class')) || '', prev: norm((node.previousElementSibling||{}).textContent||'').slice(0,40), next: norm((node.nextElementSibling||{}).textContent||'').slice(0,40) };
    return { sim, gt: node.getAttribute("data-gt"), dup: p.dup, hasTestId: !!el.testId, hasSection: !!el.sectionLabel, css, xp, id: node.id || null, tag: node.tagName.toLowerCase(), text: norm(node.textContent), role: el.role, name: norm(el.name), desc, crit };
  });
  return window.__auth.length;
})`;

export const RUN_TRIAL = `((op, rho, seed) => {
  function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  const r = rng(seed);
  const norm = window.__norm, cp = window.__cp;
  // reset
  document.getElementById("__bench_css")?.remove();
  Array.from(document.styleSheets).forEach((s) => { if (s.ownerNode && s.ownerNode.id !== "__bench_css") s.disabled = false; });
  document.body.replaceWith(window.__pristineBody.cloneNode(true));
  const body = document.body;
  const all = () => Array.from(body.querySelectorAll("*")).filter((e) => !["SCRIPT", "STYLE"].includes(e.tagName));
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rewrites = []; // [kind, from, to]
  const applyCss = () => {
    if (!rewrites.length) return;
    let blocked = 0, text = [];
    window.__css.forEach((t) => { if (t === null) { blocked++; return; } let s = t; for (const [k, a, b] of rewrites) { const re = new RegExp((k === "c" ? "\\\\." : "#") + CSS.escape(a).replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&") + "(?![\\\\w-])", "g"); s = s.replace(re, (k === "c" ? "." : "#") + CSS.escape(b)); } text.push(s); });
    const st = document.createElement("style"); st.id = "__bench_css"; st.textContent = text.join("\\n"); document.head.appendChild(st);
    Array.from(document.styleSheets).forEach((s) => { if (s.ownerNode && s.ownerNode.id !== "__bench_css" && !s.ownerNode.__keep) { try { s.cssRules; s.disabled = true; } catch (e) {} } });
  };
  const opClasses = (p) => {
    const names = new Set(); body.querySelectorAll("[class]").forEach((e) => (e.getAttribute("class") || "").split(/\\s+/).filter(Boolean).forEach((c) => names.add(c)));
    const chosen = Array.from(names).filter(() => r() < p);
    const map = new Map(chosen.map((c, i) => [c, "x" + Math.floor(r() * 1e9).toString(36) + i]));
    body.querySelectorAll("[class]").forEach((e) => e.setAttribute("class", (e.getAttribute("class") || "").split(/\\s+/).filter(Boolean).map((c) => map.get(c) || c).join(" ")));
    map.forEach((b, a) => rewrites.push(["c", a, b]));
  };
  const opIds = (p) => {
    const map = new Map();
    body.querySelectorAll("[id]").forEach((e) => { if (r() < p) { const nid = "id" + Math.floor(r() * 1e9).toString(36); map.set(e.id, nid); } });
    body.querySelectorAll("[id]").forEach((e) => { if (map.has(e.id)) e.id = map.get(e.id); });
    const fix = (e, attr) => { const v = e.getAttribute(attr); if (!v) return; e.setAttribute(attr, v.split(/\\s+/).map((t) => map.get(t) || t).join(" ")); };
    body.querySelectorAll("[for]").forEach((e) => fix(e, "for"));
    body.querySelectorAll("[aria-labelledby]").forEach((e) => fix(e, "aria-labelledby"));
    body.querySelectorAll("[aria-describedby]").forEach((e) => fix(e, "aria-describedby"));
    body.querySelectorAll("[aria-controls]").forEach((e) => fix(e, "aria-controls"));
    body.querySelectorAll('a[href^="#"]').forEach((e) => { const k = e.getAttribute("href").slice(1); if (map.has(k)) e.setAttribute("href", "#" + map.get(k)); });
    map.forEach((b, a) => rewrites.push(["i", a, b]));
  };
  const opReorder = (p) => {
    const parents = all().filter((e) => e.children.length >= 2 && r() < p * 0.5);
    parents.forEach((par) => { const kids = Array.from(par.children).filter((k) => !["SCRIPT", "STYLE"].includes(k.tagName)); const sh = shuffle(kids.slice()); sh.forEach((k) => par.appendChild(k)); });
  };
  const opWrap = (p) => {
    all().forEach((e) => { if (!e.parentElement || !e.isConnected) return; if (r() < p * 0.6) { const w = document.createElement("div"); w.style.display = "contents"; e.parentElement.insertBefore(w, e); w.appendChild(e); } });
    all().forEach((e) => { if (!e.parentElement || e.hasAttribute("data-bench-ins")) return; if (r() < p * 0.4) { const s = document.createElement("span"); s.style.display = "none"; s.setAttribute("data-bench-ins", "1"); e.parentElement.insertBefore(s, e); } });
  };
  const INTER = "a[href],button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem]";
  const opCopy = (p) => {
    const tf = [(s) => s + " now", (s) => s.toUpperCase(), (s) => s + " \\u2192", (s) => s.replace(/^(\\w)/, "Quick $1"), (s) => s + "s"];
    body.querySelectorAll(INTER).forEach((e) => {
      if (r() >= p) return; const f = tf[Math.floor(r() * tf.length)];
      const al = e.getAttribute("aria-label"); if (al) e.setAttribute("aria-label", f(al));
      const tn = Array.from(e.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim());
      if (tn) tn.textContent = f(tn.textContent.trim()); else if (e.children.length === 0 && e.textContent.trim()) e.textContent = f(e.textContent.trim());
    });
  };
  const gtNodes = () => window.__auth.map((a) => body.querySelector('[data-gt="' + a.gt + '"]'));
  const clone = (n) => { const c = n.cloneNode(true); c.removeAttribute("data-gt"); c.querySelectorAll("[data-gt]").forEach((x) => x.removeAttribute("data-gt")); c.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id")); c.removeAttribute("id"); return c; };
  const opDupSection = (p) => {
    const nodes = gtNodes(); const hosts = all().filter((e) => e.children.length > 0 && e.tagName !== "TABLE" && e.tagName !== "TBODY");
    nodes.forEach((n) => { if (!n || r() >= p) return; const h = hosts[Math.floor(r() * hosts.length)]; if (!h || h.contains(n)) return; h.insertBefore(clone(n), h.firstChild); });
  };
  const opDupAdjacent = (p) => {
    gtNodes().forEach((n) => { if (!n || r() >= p || !n.parentElement) return; n.parentElement.insertBefore(clone(n), n.nextSibling); });
  };
  if (rho > 0) {
    if (op === "classes") opClasses(rho);
    else if (op === "ids") opIds(rho);
    else if (op === "reorder") opReorder(rho);
    else if (op === "wrap") opWrap(rho);
    else if (op === "copy") opCopy(rho);
    else if (op === "dup_section") opDupSection(rho);
    else if (op === "dup_adjacent") opDupAdjacent(rho);
    else if (op === "redeploy") { opClasses(rho); opIds(rho); opWrap(rho * 0.5); opCopy(rho * 0.35); opReorder(rho * 0.3); opDupSection(rho * 0.3); }
    applyCss();
  }
  // ---------- resolve ----------
  const gtOf = (n) => (n && n.getAttribute ? n.getAttribute("data-gt") : null);
  const out = (a, node) => (node == null ? "a" : gtOf(node) === a.gt ? "c" : "w");
  const byCss = (s) => { if (!s) return null; try { return body.ownerDocument.querySelector(s); } catch (e) { return null; } };
  const byXp = (s) => { try { return document.evaluate(s, document, null, 9, null).singleNodeValue; } catch (e) { return null; } };
  const byText = (tag, t) => { for (const e of document.body.querySelectorAll(tag)) { if (norm(e.textContent) === t) return e; } return null; };
  const cands = cp.extractCandidates(document);
  const els = cands.map((c) => c.element);
  const nodeOf = (el) => (cands.find((c) => c.element === el) || {}).node || null;

  if (window.__collect) {
    const bg = (x) => { x = norm(x); const m = new Map(); for (let i = 0; i < x.length - 1; i++) { const g = x.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return [m, Math.max(0, x.length - 1)]; };
    const dice = (A, B) => { if (!A && !B) return 1; if (!A || !B) return 0; if (A === B) return 1; const [m1, n1] = bg(A), [m2, n2] = bg(B); if (n1 + n2 === 0) return 0; let o = 0; m1.forEach((c, g) => { o += Math.min(c, m2.get(g) || 0); }); return (2 * o) / (n1 + n2); };
    const xpathOf = (el) => { const parts = []; while (el && el.nodeType === 1 && el !== document.documentElement) { let i = 1, s2 = el.previousElementSibling; while (s2) { if (s2.tagName === el.tagName) i++; s2 = s2.previousElementSibling; } parts.unshift(el.tagName.toLowerCase() + "[" + i + "]"); el = el.parentElement; } return "/html[1]/" + parts.join("/"); };
    const nmap = new Map(cands.map((c) => [c.node, c.element]));
    const groups = window.__auth.map((a, ti) => {
      const sm = a.sim, d = a.desc; const list = [];
      for (const e of document.body.querySelectorAll(sm.tag)) {
        const r = e.getBoundingClientRect(), el = nmap.get(e) || null;
        const f = [
          dice(sm.cls, e.getAttribute("class") || ""), sm.id && sm.id === e.id ? 1 : 0, dice(sm.id, e.id || ""),
          dice(sm.aria, e.getAttribute("aria-label") || e.getAttribute("name") || e.getAttribute("placeholder") || ""),
          sm.href && sm.href === (e.getAttribute("href") || "") ? 1 : 0, dice(sm.text, norm(e.textContent).slice(0, 80)), dice(sm.xp, xpathOf(e)),
          Math.max(0, 1 - Math.hypot(sm.bb.x - r.x, sm.bb.y - r.y) / 800), Math.max(0, 1 - (Math.abs(sm.bb.width - r.width) + Math.abs(sm.bb.height - r.height)) / Math.max(1, sm.bb.width + sm.bb.height)),
          el ? (el.role === a.role ? 1 : 0) : 0, el ? (norm(el.name) === a.name ? 1 : 0) : 0, el ? dice(a.name, norm(el.name)) : 0,
          el && d.sectionHint ? dice(norm(el.sectionLabel || "").slice(0, 200), norm(d.sectionHint).slice(0, 200)) : 0,
          el && d.ordinalHint !== undefined ? (el.ordinal === d.ordinalHint ? 1 : 0) : 0, r.width > 0 && r.height > 0 ? 1 : 0, el && d.testId && el.testId === d.testId ? 1 : 0, el ? 1 : 0,
          dice(sm.pcls, (e.parentElement && e.parentElement.getAttribute("class")) || ""), dice(sm.prev, norm((e.previousElementSibling || {}).textContent || "").slice(0, 40)), dice(sm.next, norm((e.nextElementSibling || {}).textContent || "").slice(0, 40)),
        ];
        const pre = f[5] + f[3] + f[2] + f[0] + f[11] + f[7] + f[6] + f[9];
        list.push([pre, f, e.getAttribute("data-gt") === a.gt ? 1 : 0]);
      }
      list.sort((x, y) => y[0] - x[0]); const top = list.slice(0, 15);
      return { t: ti, y: top.findIndex((x) => x[2] === 1), X: top.map((x) => x[1].map((v) => Math.round(v * 100))) };
    });
    return { groups, dup: window.__auth.map((x) => (x.dup ? 1 : 0)) };
  }
  const TH = 0.6;
  const rec = [];
  window.__auth.forEach((a, ti) => {
    const R = (m, o, extra) => rec.push([ti, m, o, extra || null]);
    R("css", out(a, byCss(a.css)));
    R("xpath", out(a, byXp(a.xp)));
    R("text", out(a, byText(a.tag, a.text)));
    let ch = (a.id && byCss("#" + CSS.escape(a.id))) || byCss(a.css) || byText(a.tag, a.text) || byXp(a.xp);
    R("chain", out(a, ch));
    const rn = cands.filter((c) => c.element.role === a.role && norm(c.element.name) === a.name);
    R("rolename", out(a, rn[0] ? rn[0].node : null));
    R("rolename_strict", rn.length === 1 ? out(a, rn[0].node) : "a");
    {
      const bg = (x) => { x = norm(x); const m = new Map(); for (let i = 0; i < x.length - 1; i++) { const g = x.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return [m, Math.max(0, x.length - 1)]; };
      const dice = (A, B) => { if (!A && !B) return 1; if (!A || !B) return 0; if (A === B) return 1; const [m1, n1] = bg(A), [m2, n2] = bg(B); if (n1 + n2 === 0) return 0; let o = 0; m1.forEach((c, g) => { o += Math.min(c, m2.get(g) || 0); }); return (2 * o) / (n1 + n2); };
      const xpath = (el) => { const parts = []; while (el && el.nodeType === 1 && el !== document.documentElement) { let i = 1, s2 = el.previousElementSibling; while (s2) { if (s2.tagName === el.tagName) i++; s2 = s2.previousElementSibling; } parts.unshift(el.tagName.toLowerCase() + "[" + i + "]"); el = el.parentElement; } return "/html[1]/" + parts.join("/"); };
      const W = { cls: 0.5, id: 1.5, aria: 0.8, href: 1.0, text: 1.5, xp: 0.5, loc: 0.5, size: 0.5 };
      const sm = a.sim; let best = null, b1 = -1, b2 = -1;
      for (const e of document.body.querySelectorAll(sm.tag)) {
        const r = e.getBoundingClientRect();
        const sc = W.cls * dice(sm.cls, e.getAttribute('class') || '') + W.id * (sm.id === (e.id || '') ? 1 : dice(sm.id, e.id || '')) + W.aria * dice(sm.aria, e.getAttribute('aria-label') || e.getAttribute('name') || e.getAttribute('placeholder') || '') + W.href * (sm.href === (e.getAttribute('href') || '') ? 1 : 0) + W.text * dice(sm.text, norm(e.textContent).slice(0, 80)) + W.xp * dice(sm.xp, xpath(e)) + W.loc * Math.max(0, 1 - Math.hypot(sm.bb.x - r.x, sm.bb.y - r.y) / 800) + W.size * Math.max(0, 1 - (Math.abs(sm.bb.width - r.width) + Math.abs(sm.bb.height - r.height)) / Math.max(1, sm.bb.width + sm.bb.height));
        const t = sc / (W.cls + W.id + W.aria + W.href + W.text + W.xp + W.loc + W.size);
        if (t > b1) { b2 = b1; b1 = t; best = e; } else if (t > b2) b2 = t;
      }
      R("similo", best ? out(a, best) : "a", [b1, b2]);
    }

    // ours-C: authored criteria, planNext gates
    {
      const spec = { role: a.crit.role, name: a.crit.name }; if (a.crit.testId) spec.testId = a.crit.testId; if (a.crit.sectionHint) spec.sectionHint = a.crit.sectionHint;
      const { best } = cp.bestMatch(els, spec, {});
      if (!best) R("oursC", "a");
      else { const secOk = !a.crit.sectionHint || cp.matchText(best.element.sectionLabel || "", { contains: a.crit.sectionHint }).matched; const conf = best.score.total >= TH && secOk; R("oursC", conf ? out(a, nodeOf(best.element)) : "a", [best.score.total]); }
    }
    // ours-D variants: record top1 correctness + s1,s2 for offline gate sweeps
    const d = a.desc;
    const variants = {
      D: d,
      D_rolename: { role: d.role, name: d.name, ancestryHints: [] },
      D_noctx: { role: d.role, name: d.name, text: d.text, testId: d.testId, ariaLabel: d.ariaLabel, ancestryHints: [] },
      D_nobbox: { ...d, bboxHint: undefined },
      D_noid: { ...d, internalId: undefined },
      D_nosection: { ...d, sectionHint: undefined, ordinalHint: undefined },
    };
    for (const [vn, vd] of Object.entries(variants)) {
      const ranked = cp.rankCandidates(els, cp.specFromDescriptor(vd));
      const t1 = ranked[0], t2 = ranked[1];
      const node = t1 ? nodeOf(t1.element) : null;
      rec.push([ti, "o_" + vn, t1 ? (gtOf(node) === a.gt ? "c" : "w") : "a", [t1 ? t1.score.total : 0, t2 ? t2.score.total : 0, t1 && t1.element.sectionLabel === (d.sectionHint || null) ? 1 : 0]]);
    }
  });
  return { rec, dup: window.__auth.map((x) => x.dup ? 1 : 0), nEls: els.length };
})`;

