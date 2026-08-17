// SPDX-License-Identifier: SUL-1.0
/**
 * PHX-WP-LAC01B verification runner. Writes its own artifact (`verify.txt`) so the
 * evidence is machine-written: exact command, exit code and tail of each suite's
 * own output, never a model-formulated summary.
 *
 * Usage: node specs/sprint-phoenix-epic/evidence/PHX-WP-LAC01B/verify.mjs
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..", "..");
const suites = [
  "plugins/pipeline-core/lib/control-execution-lifecycle-event.test.mjs",
  "plugins/pipeline-core/lib/lifecycle-governance-events.test.mjs",
  "plugins/pipeline-core/lib/control-execution-exchange.test.mjs",
  "plugins/pipeline-core/scripts/pipeline-state-lifecycle-event.test.mjs",
  "harness/scripts/pipeline-state.test.mjs",
];

const lines = [`# PHX-WP-LAC01B verify — ${new Date().toISOString()}`, ""];
let failed = 0;
for (const suite of suites) {
  const result = spawnSync(process.execPath, [join(root, suite)], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = (result.stdout ?? "").trimEnd().split("\n");
  // The verdict of a suite lives on its own stdout summary, not in CLI noise on
  // stderr, so the artifact keeps the summary and every reported failure line.
  const verdict = out.filter((line) => /cases passed|^Failures:|^ {2}- |^ℹ (pass|fail) |: ok$/u.test(line));
  if (result.status !== 0) failed += 1;
  lines.push(`## node ${suite}`, `exit=${result.status}`, ...(verdict.length > 0 ? verdict : out.slice(-6)), "");
}
lines.push(`suites=${suites.length} failed=${failed}`, "");
writeFileSync(join(here, "verify.txt"), lines.join("\n"));
console.log(`verify: suites=${suites.length} failed=${failed}; artifact ${relative(root, join(here, "verify.txt"))}`);
process.exit(failed === 0 ? 0 : 1);
