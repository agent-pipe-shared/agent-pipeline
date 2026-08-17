// SPDX-License-Identifier: SUL-1.0
// PHX-WP-HAC12 verification runner. Runs every suite this dispatch touched (plus the two gated
// regression suites its edits sit inside) and WRITES ITS OWN evidence log next to this file --
// the log is machine-written, never transcribed by hand. Paths are repo-relative; the repo root
// is derived from this file's own location, so no machine-specific absolute path is stored.
// Run: node specs/sprint-phoenix-epic/evidence/PHX-WP-HAC12/verify-run.mjs
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
const OUT = join(HERE, "verify-log.txt");

const suites = [
  ["--check", "plugins/pipeline-core/hooks/guard-push.mjs"],
  ["--check", "plugins/pipeline-core/scripts/pipeline-state.mjs"],
  ["--check", "plugins/pipeline-core/hooks/guard-push-decision-reference.test.mjs"],
  ["--check", "harness/scripts/pipeline-state-decision-reference.test.mjs"],
  ["plugins/pipeline-core/hooks/guard-push-decision-reference.test.mjs"],
  ["harness/scripts/pipeline-state-decision-reference.test.mjs"],
  ["plugins/pipeline-core/lib/decision-reference-dual-evaluation.test.mjs"],
  ["harness/scripts/pipeline-state.test.mjs"],
  ["plugins/pipeline-core/hooks/guard-push.test.mjs"],
  ["plugins/pipeline-core/hooks/guard-push-external-ledger.test.mjs"],
  ["harness/scripts/pipeline-state-external-push-ledger.test.mjs"],
];

const lines = [
  "PHX-WP-HAC12 verification log (written by verify-run.mjs itself)",
  `startedAt: ${new Date().toISOString()}`,
  `node: ${process.version}`,
  "",
];
let anyFailed = false;

for (const args of suites) {
  const started = Date.now();
  const res = spawnSync(process.execPath, args, { cwd: REPO, encoding: "utf8", timeout: 540000 });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  const tally = out.split("\n").filter((line) => /passed|failed|# (pass|fail)/i.test(line)).slice(-6);
  if (res.status !== 0) anyFailed = true;
  lines.push(
    "=".repeat(92),
    `command : node ${args.join(" ")}`,
    `exitCode: ${res.status}${res.signal ? ` (signal ${res.signal})` : ""}`,
    `duration: ${((Date.now() - started) / 1000).toFixed(1)}s`,
    `tally   : ${tally.length === 0 ? "(no tally line emitted)" : ""}`,
    ...tally.map((line) => `          ${line.trim()}`),
  );
  if (res.status !== 0) {
    const failing = out.split("\n").filter((line) => /^\s*(FAIL|not ok|✖)/.test(line));
    lines.push(
      `failing cases (${failing.length}):`,
      ...failing.map((line) => `          ${line.trim().slice(0, 400)}`),
    );
  }
  lines.push("");
}

lines.push("=".repeat(92), `overall : ${anyFailed ? "FAILED" : "ALL GREEN"}`, `finishedAt: ${new Date().toISOString()}`);
writeFileSync(OUT, `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
process.exit(anyFailed ? 1 : 0);
