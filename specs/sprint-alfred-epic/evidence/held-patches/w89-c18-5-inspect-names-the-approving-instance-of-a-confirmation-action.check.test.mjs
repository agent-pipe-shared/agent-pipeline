import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const HERE = import.meta.dirname;
const ROOT = resolve(HERE, "..", "..", "..", "..");
const PATCH = join(HERE, "w89-c18-5-inspect-names-the-approving-instance-of-a-confirmation-action.patch");
const ALLOWED = [
  "plugins/pipeline-core/scripts/pipeline-state.mjs",
  "plugins/pipeline-core/scripts/pipeline-state-late-verify.test.mjs",
];

test("w89 the patch exists and is non-empty", () => {
  assert.equal(existsSync(PATCH), true);
  assert.ok(statSync(PATCH).size > 0);
});

test("w89 the patch applies to the repository root", () => {
  const result = spawnSync("git", ["apply", "--check", PATCH], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("w89 the patch touches only the two named files", () => {
  const result = spawnSync("git", ["apply", "--numstat", PATCH], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const files = result.stdout.split("\n").filter(Boolean).map((line) => line.split("\t")[2]).sort();
  assert.deepEqual(files, [...ALLOWED].sort());
});
