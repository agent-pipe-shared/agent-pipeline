// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w76 (C18-1A host-commit diagnostics, AC-164): the patch exists, applies to the repository HEAD
// and touches only the seven named plugin files. No producer or product run.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..", "..", "..", "..");
const patch = join(import.meta.dirname, "w76-c18-1a-host-commit-diagnostics.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/native-goldfish-host-return.mjs",
  "plugins/pipeline-core/lib/native-goldfish-host-return.test.mjs",
  "plugins/pipeline-core/lib/agy-host-commit-admission.mjs",
  "plugins/pipeline-core/lib/agy-host-commit-admission.test.mjs",
  "plugins/pipeline-core/lib/native-goldfish-host-finalizer.mjs",
  "plugins/pipeline-core/lib/native-goldfish-host-finalizer.test.mjs",
  "plugins/pipeline-core/hooks/native-goldfish-host.mjs",
];

test("the w76 patch exists and is non-empty", () => {
  assert.equal(existsSync(patch), true);
  assert.ok(statSync(patch).size > 0);
});

test("git apply --check of the w76 patch against the repository root exits 0", () => {
  const run = spawnSync("git", ["apply", "--check", patch], { cwd: root, encoding: "utf8", timeout: 30_000 });
  assert.equal(run.status, 0, run.stderr);
});

test("the w76 patch touches only the seven named files", () => {
  const run = spawnSync("git", ["apply", "--numstat", patch], { cwd: root, encoding: "utf8", timeout: 30_000 });
  assert.equal(run.status, 0, run.stderr);
  const touched = run.stdout.split("\n").filter(Boolean).map((line) => line.split("\t")[2]).sort();
  assert.ok(touched.length > 0);
  assert.deepEqual(touched.filter((path) => !ALLOWED.includes(path)), []);
});
