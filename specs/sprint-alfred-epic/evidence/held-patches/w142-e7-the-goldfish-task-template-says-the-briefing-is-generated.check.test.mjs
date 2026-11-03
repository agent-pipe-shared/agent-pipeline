// SPDX-License-Identifier: SUL-1.0
// Held-patch check (E7 Goldfish task template says the briefing is generated): the patch exists, applies to the repository HEAD and touches only the named files.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const REPO = resolve(import.meta.dirname, "..", "..", "..", "..");
const PATCH = join(import.meta.dirname, "w142-e7-the-goldfish-task-template-says-the-briefing-is-generated.patch");
const ALLOWED = new Set([
  "templates/prompts/goldfish-task.md",
  "plugins/pipeline-core/templates/prompts/goldfish-task.md",
]);

test("the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH));
  assert.ok(statSync(PATCH).size > 0);
});

test("git apply --check of the patch against the repository root exits 0", () => {
  const result = spawnSync("git", ["apply", "--check", PATCH], { cwd: REPO, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("the patch touches only the named files", () => {
  const result = spawnSync("git", ["apply", "--numstat", PATCH], { cwd: REPO, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const touched = result.stdout.split("\n").filter(Boolean).map((line) => line.split("\t")[2]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.has(path), `unexpected path ${path}`);
});
