// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const PATCH = join(import.meta.dirname, "w101-agy-refusal-texts-name-the-way-forward.patch");
const ALLOWED = [
  "plugins/pipeline-core/scripts/design-review-receipt.mjs",
  "plugins/pipeline-core/scripts/design-review-receipt.test.mjs",
  "plugins/pipeline-core/scripts/pipeline-state.mjs",
];

test("the w101 patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH));
  assert.ok(statSync(PATCH).size > 0);
});

test("the w101 patch applies to the repository root", () => {
  const result = spawnSync("git", ["apply", "--check", PATCH], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("the w101 patch touches only the named files", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = new Set([...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]));
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(ALLOWED.includes(file), `unexpected file ${file}`);
});
