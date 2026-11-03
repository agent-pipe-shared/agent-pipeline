// SPDX-License-Identifier: SUL-1.0
// Pins the held patch w136 (E5): it exists, applies to the repository root and touches only the two named files.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const here = import.meta.dirname;
const root = resolve(here, "..", "..", "..", "..");
const patch = join(here, "w136-e5-the-intake-design-plan-warns-when-its-text-holds-a-private-identifier.patch");
const allowed = [
  "plugins/pipeline-core/lib/onboarding-continuity.mjs",
  "plugins/pipeline-core/lib/onboarding-continuity.test.mjs",
];

test("the patch exists and is non-empty", () => {
  assert.equal(existsSync(patch), true);
  assert.ok(statSync(patch).size > 0);
});

test("the patch applies to the repository root", () => {
  const result = spawnSync("git", ["apply", "--check", patch], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
});

test("the patch touches only the named files", () => {
  const touched = [...readFileSync(patch, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)]
    .flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(allowed.includes(path), `unexpected file ${path}`);
});
