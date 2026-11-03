// Held-patch check for w123: the dispatch-briefing help audit passes in a checkout below the home directory. The patch applies to the repository on its own.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const PATCH = join(HERE, "w123-fv-the-dispatch-briefing-help-audit-passes-in-a-checkout-below-the-home-directory.patch");
const FILE = "plugins/pipeline-core/scripts/dispatch-briefing.test.mjs";

test("w123: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH), "patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "patch file is empty");
});

test("w123: git apply --check of the patch against the repository root exits 0", () => {
  const result = spawnSync("git", ["apply", "--check", PATCH], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("w123: the patch touches only the one examiner and keeps the three forbidden conditions", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0 && files.every((file) => file === FILE), `unexpected files: ${files.join(", ")}`);
  assert.match(text, /text\.startsWith\(process\.cwd\(\)\) \|\| text\.startsWith\(process\.env\.HOME\) \|\| text\.includes\('\/\.git\/agent-pipeline\/'\)/u);
  assert.equal([...text.matchAll(/^-(?!-)\s*assert/gmu)].length, 0, "an assertion line is removed");
});
