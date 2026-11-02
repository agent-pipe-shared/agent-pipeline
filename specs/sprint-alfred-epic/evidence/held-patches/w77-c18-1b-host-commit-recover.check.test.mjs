// SPDX-License-Identifier: SUL-1.0
// C18-1B (AC-164): the held patch exists, applies to the repository HEAD, and touches only the recover command, its examiner and the guard catalogue.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..", "..", "..", "..");
const patch = join(import.meta.dirname, "w77-c18-1b-host-commit-recover.patch");

test("the held patch exists and is non-empty", () => {
  assert.equal(existsSync(patch), true);
  assert.ok(statSync(patch).size > 0);
});

test("the held patch applies to the repository HEAD", () => {
  const result = spawnSync("git", ["-C", root, "apply", "--check", patch], { encoding: "utf8", timeout: 50_000 });
  assert.equal(result.status, 0, result.stderr);
});

test("the held patch touches only the recover command, its examiner and the guard catalogue", () => {
  const files = [...readFileSync(patch, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0);
  const allowed = new Set([
    "plugins/pipeline-core/scripts/goldfish-host-commit-recover.mjs",
    "plugins/pipeline-core/scripts/goldfish-host-commit-recover.test.mjs",
    "plugins/pipeline-core/lib/guard/command-catalogue.mjs",
  ]);
  for (const file of files) assert.ok(allowed.has(file), `unexpected path in patch: ${file}`);
});
