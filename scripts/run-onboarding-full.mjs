// Purpose: run the project-onboarding orchestrator suite with a private TMPDIR outside every git repository and show only the failing lines.
// Usage:   node scripts/run-onboarding-full.mjs          (run from the repository root; no arguments)
// Inputs:  plugins/pipeline-core/lib/project-onboarding-v3.test.mjs.
// Output:  "exit <code>, <n> lines" plus up to 80 failing lines on stdout; the FULL output goes to scratch/onboarding-full.log (untracked, per-run data).
// Data:    scratch/onboarding-full.log. Does not modify tracked files; the 30-minute timeout kills a hung run.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "onb-"));
const r = spawnSync(process.execPath, ["plugins/pipeline-core/lib/project-onboarding-v3.test.mjs"], { env: { ...process.env, TMPDIR: dir }, encoding: "utf8", maxBuffer: 1024 * 1024 * 1024, timeout: 1800000 });
const text = `${r.stdout}\n${r.stderr}`;
writeFileSync("scratch/onboarding-full.log", text);
const lines = text.split("\n");
console.log(`exit ${r.status}, ${lines.length} lines`);
console.log(lines.filter((l) => /not ok|✖|FAIL|failed|AssertionError|Error:|exit 1/u.test(l)).slice(0, 80).join("\n"));
