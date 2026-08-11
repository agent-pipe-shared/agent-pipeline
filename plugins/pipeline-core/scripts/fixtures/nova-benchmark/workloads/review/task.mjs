// SPDX-License-Identifier: SUL-1.0
// NVA-A8-RUNNER "review" workload: one fixed, simple pattern check (banned-token regex scan)
// over the fixed sample sub-tree, no I/O beyond writing result.txt. Deterministic by
// construction (sample/ is clean-by-construction, so this always finds 0 violations).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const sampleDir = join(dir, "sample");
const bannedToken = /\beval\s*\(/u;
const files = readdirSync(sampleDir)
  .filter((name) => name.endsWith(".mjs"))
  .sort();
let violations = 0;
for (const file of files) {
  const text = readFileSync(join(sampleDir, file), "utf8");
  if (bannedToken.test(text)) violations++;
}
writeFileSync(join(dir, "result.txt"), `review:${violations}-violations`);
