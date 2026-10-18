// Performance budget: fails when the files a first-time visitor must download get too big.
// Run after `npm run build`:  npm run check:budget
// What loads for the home page = the entry script + the chunks it imports straight away + CSS.
// Pages, charts and maps load later (lazy), so they are measured separately.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const dist = "dist";
const KB = 1024;
const budget = { firstLoadJsGz: 200 * KB, firstLoadCssGz: 40 * KB, anyLazyChunkGz: 130 * KB };
const gz = (f) => gzipSync(readFileSync(join(dist, f))).length;
const html = readFileSync(join(dist, "index.html"), "utf8");
const first = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const js = first.filter((f) => f.endsWith(".js")), css = first.filter((f) => f.endsWith(".css"));
const sum = (a) => a.reduce((n, f) => n + gz(f), 0);
const all = readdirSync(join(dist, "assets")).filter((f) => f.endsWith(".js"));
const biggest = all.map((f) => [f, gz("assets/" + f)]).sort((a, b) => b[1] - a[1])[0];
const rows = [
  ["First-load JS (gzip)", sum(js), budget.firstLoadJsGz],
  ["First-load CSS (gzip)", sum(css), budget.firstLoadCssGz],
  [`Largest chunk ${biggest[0]} (gzip)`, biggest[1], budget.anyLazyChunkGz],
];
let fail = false;
for (const [name, size, max] of rows) {
  const ok = size <= max; fail ||= !ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${(size / KB).toFixed(1)} KB (limit ${(max / KB).toFixed(0)} KB)`);
}
process.exit(fail ? 1 : 0);
