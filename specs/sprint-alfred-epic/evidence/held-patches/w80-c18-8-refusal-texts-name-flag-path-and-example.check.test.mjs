// SPDX-License-Identifier: SUL-1.0
// Check for the held patch w80 (C18-8): the patch exists, applies to the repository root and touches only the briefed files.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..", "..", "..", "..");
const patch = join(import.meta.dirname, "w80-c18-8-refusal-texts-name-flag-path-and-example.patch");
const ALLOWED = [
  "plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs",
  "plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs",
  "plugins/pipeline-core/scripts/critic-diagnostic-evidence.mjs",
  "plugins/pipeline-core/lib/guard/grammar-denials.mjs",
  "plugins/pipeline-core/lib/guard/read-scope.mjs",
  "plugins/pipeline-core/lib/guard/powershell-dialect.mjs",
  "plugins/pipeline-core/lib/guard/g23-read-help.test.mjs",
];

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("git apply --check of the patch against the repository root exits 0", () => {
  const result = spawnSync("git", ["apply", "--check", patch], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, String(result.stderr));
});

test("the patch touches only the briefed files", () => {
  const touched = [...readFileSync(patch, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(touched.length > 0);
  for (const file of touched) assert.ok(ALLOWED.includes(file), `unexpected file in patch: ${file}`);
});
