// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w82 (C18-7): the patch exists, applies to the repository HEAD
// and touches only the two named files.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
const patch = resolve(import.meta.dirname, "w82-c18-7-conventional-commit-prints-the-guard-conformant-trailer-set.patch");
const ALLOWED = [
  "plugins/pipeline-core/skills/conventional-commit/SKILL.md",
  "plugins/pipeline-core/lib/commit-message-policy.test.mjs",
];

test("the patch exists and is non-empty", () => {
  assert.ok(existsSync(patch));
  assert.ok(statSync(patch).size > 0);
});

test("git apply --check of the patch against the repository root exits 0", () => {
  const result = spawnSync("git", ["apply", "--check", patch], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("the patch touches only the named files", () => {
  const text = readFileSync(patch, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(touched.length > 0);
  for (const file of touched) assert.ok(ALLOWED.includes(file), file);
  for (const file of ALLOWED) assert.ok(touched.includes(file), file);
});
