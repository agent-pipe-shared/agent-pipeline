// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w95 (C18-1D observation accepts a commit on a moved HEAD, AC-108): the patch exists, is non-empty and touches
// only the three named plugin files. It is a delta on top of w76 and w90, so it is NOT applied against the repository here; the notes
// state the order. No producer or product run.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..", "..", "..", "..");
const patch = join(import.meta.dirname, "w95-c18-1d-the-host-observation-accepts-a-commit-on-a-moved-head.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/native-goldfish-host-observation.mjs",
  "plugins/pipeline-core/lib/native-goldfish-host-finalizer.mjs",
  "plugins/pipeline-core/lib/native-goldfish-host-finalizer.test.mjs",
];

test("the w95 patch exists and is non-empty", () => {
  assert.equal(existsSync(patch), true);
  assert.ok(statSync(patch).size > 0);
});

test("the w95 patch touches only the three named files", () => {
  const run = spawnSync("git", ["apply", "--numstat", patch], { cwd: root, encoding: "utf8", timeout: 30_000 });
  assert.equal(run.status, 0, run.stderr);
  const touched = run.stdout.split("\n").filter(Boolean).map((line) => line.split("\t")[2]).sort();
  assert.ok(touched.length > 0);
  assert.deepEqual(touched.filter((path) => !ALLOWED.includes(path)), []);
});
