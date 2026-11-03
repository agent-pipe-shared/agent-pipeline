// SPDX-License-Identifier: SUL-1.0
// Check for the held patch w117 (C19-G3, AC-115): the patch exists, applies to the repository
// root, and touches only the four named plugin files.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const here = import.meta.dirname;
const repositoryRoot = resolve(here, "..", "..", "..", "..");
const patch = join(here, "w117-c19-g3-a-drift-that-a-typed-command-lifts-is-never-worded-as-a-block.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/continuity-drift-exits.test.mjs",
  "plugins/pipeline-core/lib/guard/denial-route.mjs",
  "plugins/pipeline-core/lib/onboarding-continuity.mjs",
  "plugins/pipeline-core/lib/project-onboarding-v3.mjs",
];

test("the patch exists and is non-empty", { timeout: 60_000 }, () => {
  assert.ok(existsSync(patch));
  assert.ok(statSync(patch).size > 0);
});

test("git apply --check of the patch against the repository root exits 0", { timeout: 60_000 }, () => {
  const result = spawnSync("git", ["apply", "--check", patch], { cwd: repositoryRoot, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
});

test("the patch touches only the four named files", { timeout: 60_000 }, () => {
  const result = spawnSync("git", ["apply", "--numstat", patch], { cwd: repositoryRoot, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  const touched = result.stdout.split("\n").filter(Boolean).map((line) => line.split("\t")[2]).sort();
  assert.deepEqual(touched, [...ALLOWED].sort());
  assert.equal(dirname(patch).endsWith("held-patches"), true);
});
