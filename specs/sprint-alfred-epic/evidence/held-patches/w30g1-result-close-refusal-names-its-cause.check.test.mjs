// SPDX-License-Identifier: SUL-1.0
// C30G-D1 check: the held patch exists, applies to the repository root and touches only the briefed files. No producer or product run.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const REPOSITORY = resolve(import.meta.dirname, "../../../..");
const PATCH = join(import.meta.dirname, "w30g1-result-close-refusal-names-its-cause.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/pipeline-state.mjs",
  "plugins/pipeline-core/scripts/pipeline-state-result-close.test.mjs",
  "plugins/pipeline-core/scripts/continuity-owner-route.mjs",
  "plugins/pipeline-core/scripts/finish-feature.mjs",
  "plugins/pipeline-core/scripts/finish-feature.test.mjs",
  "plugins/pipeline-core/scripts/close-path-e2e.test.mjs",
  "plugins/pipeline-core/scripts/pipeline-state-result-bootstrap.test.mjs",
]);

test("the patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0);
});

test("git apply --check of the patch against the repository root exits 0", () => {
  const checked = spawnSync("git", ["apply", "--check", PATCH], { cwd: REPOSITORY, encoding: "utf8" });
  assert.equal(checked.status, 0, `${checked.stdout}${checked.stderr}`);
});

test("the patch touches only the briefed files", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `${path} is outside the briefed files`);
});
