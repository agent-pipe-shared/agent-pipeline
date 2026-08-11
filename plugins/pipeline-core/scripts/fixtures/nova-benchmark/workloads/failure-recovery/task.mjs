// SPDX-License-Identifier: SUL-1.0
// NVA-A8-RUNNER "failure-recovery" workload: deliberate first failure, second-call recovery.
// argv[2] is an absolute path to a counter file the RUNNER creates/resets to absent before
// each repetition begins. Deterministic by construction -- behavior depends only on whether
// the counter file exists, never on time/randomness.
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const counterPath = process.argv[2];
if (!counterPath) {
  throw new Error("failure-recovery task requires an absolute counter-file path as argv[2]");
}
if (!existsSync(counterPath)) {
  writeFileSync(counterPath, "1");
  process.exit(1);
}
writeFileSync(join(dir, "result.txt"), "failure-recovery:recovered");
process.exit(0);
