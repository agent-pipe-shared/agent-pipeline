// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w96 (C18-1E attempt-terminal binding accepts the typed moved-HEAD lineage, AC-108): the patch exists, is non-empty
// and touches only the named plugin files. It is a delta on top of w76, w90 and w95, so it is NOT applied against the repository here;
// the notes state the order. No producer or product run.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..", "..", "..", "..");
const patch = join(import.meta.dirname, "w96-c18-1e-the-attempt-terminal-binding-accepts-the-typed-moved-head-lineage.patch");
const ALLOWED = [
  "plugins/pipeline-core/scripts/dispatch-record-write.mjs",
  "plugins/pipeline-core/scripts/dispatch-record-write.test.mjs",
  "plugins/pipeline-core/lib/native-goldfish-host-finalizer.test.mjs",
];

test("the w96 patch exists and is non-empty", () => {
  assert.equal(existsSync(patch), true);
  assert.ok(statSync(patch).size > 0);
});

test("the w96 patch touches only the named files", () => {
  const run = spawnSync("git", ["apply", "--numstat", patch], { cwd: root, encoding: "utf8", timeout: 30_000 });
  assert.equal(run.status, 0, run.stderr);
  const touched = run.stdout.split("\n").filter(Boolean).map((line) => line.split("\t")[2]).sort();
  assert.ok(touched.length > 0);
  assert.deepEqual(touched.filter((path) => !ALLOWED.includes(path)), []);
});
