import fs from "node:fs"; import zlib from "node:zlib";
import { encodeElements, decodeSnapshot } from "../../packages/shared/src/delta/codec";
const dir = "../results/snapshots"; const out: any[] = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort()) {
  const els = JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
  const raw = Buffer.from(JSON.stringify(els));
  const enc = encodeElements(els); const encB = Buffer.from(JSON.stringify({ elements: enc.elements, deltaGroups: enc.deltaGroups }));
  const dec = decodeSnapshot({ elements: enc.elements, deltaGroups: enc.deltaGroups } as any);
  const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  const key = (e: any) => JSON.stringify(canon(e));
  const a = new Set(els.map(key)), b = new Set(dec.map(key));
  const lossless = a.size === b.size && [...a].every(x => b.has(x)) && dec.length === els.length;
  out.push({ page: f.replace(".json", ""), n: els.length, groups: enc.deltaGroups.length, grouped: els.length - enc.elements.length,
    raw: raw.length, delta: encB.length, gzRaw: zlib.gzipSync(raw).length, gzDelta: zlib.gzipSync(encB).length, lossless });
}
fs.writeFileSync("../results/codec.json", JSON.stringify(out, null, 1));
for (const r of out) console.log(r.page.padEnd(20), "n=" + r.n, "grp=" + r.groups, "raw=" + r.raw, "delta=" + r.delta, (r.delta / r.raw).toFixed(2), "gz=" + r.gzRaw, "gz+delta=" + r.gzDelta, r.lossless ? "OK" : "LOSSY");
