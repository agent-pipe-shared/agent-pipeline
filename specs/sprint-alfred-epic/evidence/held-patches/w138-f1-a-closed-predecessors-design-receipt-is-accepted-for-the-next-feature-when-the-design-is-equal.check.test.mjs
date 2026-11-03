// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const HERE = import.meta.dirname;
const ROOT = resolve(HERE, "..", "..", "..", "..");
const PATCH = join(HERE, "w138-f1-a-closed-predecessors-design-receipt-is-accepted-for-the-next-feature-when-the-design-is-equal.patch");
const ALLOWED = ["plugins/pipeline-core/lib/architecture-design.mjs", "plugins/pipeline-core/lib/architecture-design.test.mjs"];

test("w138 patch exists and is non-empty", () => {
  assert.equal(existsSync(PATCH), true);
  assert.ok(statSync(PATCH).size > 0);
});

test("w138 patch applies to the repository root", () => {
  const result = spawnSync("git", ["apply", "--check", PATCH], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("w138 patch touches only the two named files", () => {
  const files = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap(match => [match[1], match[2]]);
  assert.ok(files.length > 0);
  assert.deepEqual([...new Set(files)].sort(), ALLOWED);
});
