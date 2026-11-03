// SPDX-License-Identifier: SUL-1.0
// Check for the held patch w119 (C19, AC-140): the patch exists, applies to the repository
// root, and touches only the named Full Verify files.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const here = import.meta.dirname;
const repositoryRoot = resolve(here, "..", "..", "..", "..");
const patch = join(here, "w119-c19-the-full-verify-keeps-red-suite-logs-and-resumes-from-its-journal.patch");
const ALLOWED = [
  "harness/scripts/verify.mjs",
  "plugins/pipeline-core/scripts/verify-journal.mjs",
  "plugins/pipeline-core/scripts/verify-journal.test.mjs",
  "scripts/full-verify.mjs",
  "scripts/full-verify.test.mjs",
];

test("the patch exists and is non-empty", { timeout: 60_000 }, () => {
  assert.ok(existsSync(patch));
  assert.ok(statSync(patch).size > 0);
});

test("git apply --check of the patch against the repository root exits 0", { timeout: 60_000 }, () => {
  const result = spawnSync("git", ["apply", "--check", patch], { cwd: repositoryRoot, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
});

test("the patch touches only the named files", { timeout: 60_000 }, () => {
  const result = spawnSync("git", ["apply", "--numstat", patch], { cwd: repositoryRoot, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  const touched = result.stdout.split("\n").filter(Boolean).map((line) => line.split("\t")[2]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.includes(path), `unexpected file in the patch: ${path}`);
});
