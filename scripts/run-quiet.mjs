// SPDX-License-Identifier: SUL-1.0
// Purpose: run each test file once with a private TMPDIR outside the checkout and print only its counts and failing case names.
// Usage:   node scripts/run-quiet.mjs <label | absolute tmp dir outside the checkout> <test-file>...     (run from the directory the test paths are relative to)
//          A bare label resolves to <home>/pipeline-test-tmp/<label>. Normally invoked through scripts/run-in.mjs.
// Inputs:  the test files; plugins/pipeline-core/lib/session-power-address-repair.mjs of the repository that holds this script.
// Output:  per file "GREEN|RED exit <code> tests/pass/fail/skip/todo <n>" plus failing case names; exit 1 if any file failed.
// Data:    private TMPDIRs under the chosen directory; after each suite it moves address slots of vanished fixture
//          repositories aside (D71/D72). Not read-only for that home-level repair; tracked files are untouched.
import { spawnSync } from "node:child_process";
import { mkdirSync, chmodSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { homedir, userInfo } from "node:os";
import { repairAddressRootQuietly } from "../plugins/pipeline-core/lib/session-power-address-repair.mjs";
const [tmpArg, ...files] = process.argv.slice(2);
if (!tmpArg || files.length === 0) { console.error("usage: run-quiet.mjs <label|absolute tmp dir> <test-file>..."); process.exit(2); }
// A bare label resolves to a private directory outside the checkout: <home>/pipeline-test-tmp/<label>.
const tmpRoot = isAbsolute(tmpArg) ? tmpArg : join(homedir(), "pipeline-test-tmp", tmpArg);
let worst = 0;
files.forEach((file, i) => {
  const tmp = join(tmpRoot, String(i));
  mkdirSync(tmp, { recursive: true, mode: 0o700 }); chmodSync(tmp, 0o700);
  const env = { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, [file], { encoding: "utf8", env, timeout: 3600000, maxBuffer: 256 * 1024 * 1024 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const num = (k) => (new RegExp(`^ℹ ${k} (\\d+)`, "m").exec(out) ?? [])[1] ?? "?";
  const failing = [...new Set([...out.matchAll(/^✖ (.+?) \(\d/gm)].map((m) => m[1]).filter((t) => t !== "failing tests:"))];
  console.log(`${r.status === 0 ? "GREEN" : "RED  "} exit ${r.status} tests ${num("tests")} pass ${num("pass")} fail ${num("fail")} skip ${num("skipped")} todo ${num("todo")}  ${file}`);
  for (const f of failing) console.log(`   ✖ ${f.slice(0, 160)}`);
  if (num("tests") === "?") console.log(`   (no summary) tail: ${out.trim().split("\n").slice(-3).join(" | ").slice(0, 400)}`);
  if (r.status !== 0) worst = 1;
  // D71/D72: move address slots of fixture repositories that no longer exist aside after each suite.
  const repair = repairAddressRootQuietly({ home: userInfo().homedir });
  if (repair.status !== "nothing-to-do") console.log(`   address-root repair: ${repair.status} ${repair.code} moved ${repair.moved}`);
});
process.exit(worst);
