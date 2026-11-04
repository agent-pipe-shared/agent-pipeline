// SPDX-License-Identifier: SUL-1.0
// Held-patch check (F2b registration of the analysis-run admission suite): the patch exists and touches only the named files. It is a delta on w148, so it does NOT run git apply --check against the repository (the order is stated in the notes).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const REPO = resolve(import.meta.dirname, "..", "..", "..", "..");
const PATCH = join(import.meta.dirname, "w149-f2b-register-the-analysis-run-admission-suite.patch");
const ALLOWED = new Set([
  "harness/verify-suites.json",
  "docs/product-capability-inventory.json",
]);

test("the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH));
  assert.ok(statSync(PATCH).size > 0);
});

test("the patch touches only the named files", () => {
  const result = spawnSync("git", ["apply", "--numstat", PATCH], { cwd: REPO, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const touched = result.stdout.split("\n").filter(Boolean).map((line) => line.split("\t")[2]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.has(path), `unexpected path ${path}`);
});
