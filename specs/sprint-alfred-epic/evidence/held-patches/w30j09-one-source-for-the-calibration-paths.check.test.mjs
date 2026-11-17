// SPDX-License-Identifier: SUL-1.0
// C30J-J9 check: the held patch exists, is not empty and touches only the briefed files. No producer or product run.
// The patch is a delta on the integrated 30i tree (the clone base9), which is not applied to the repository yet, so this check never
// runs `git apply` against the repository root: the notes name the required order (apply that tree first, then this patch).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const PATCH = join(import.meta.dirname, "w30j09-one-source-for-the-calibration-paths.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/project-authority-read.mjs",
  "plugins/pipeline-core/lib/project-authority-read.test.mjs",
  "plugins/pipeline-core/lib/project-authority.mjs",
  "plugins/pipeline-core/lib/project-authority.test.mjs",
  "plugins/pipeline-core/lib/calibration-verify-commit-transition.mjs",
  "plugins/pipeline-core/lib/calibration-verify-commit-transition.test.mjs",
  "plugins/pipeline-core/lib/project-calibration-identity.mjs",
  "plugins/pipeline-core/lib/runtime-projection-v3.mjs",
  "plugins/pipeline-core/lib/onboarding-continuity.mjs",
  "plugins/pipeline-core/lib/project-pipeline-footprint.mjs",
  "plugins/pipeline-core/lib/governance-scope.mjs",
  "plugins/pipeline-core/lib/close-quality-readback.mjs",
  "plugins/pipeline-core/lib/security-close-status.mjs",
]);

test("the patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0);
});

test("the patch touches only the briefed files", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `${path} is outside the briefed files`);
});

test("the patch exports the one calibration path list and carries the cases that pin it", () => {
  const text = readFileSync(PATCH, "utf8");
  for (const needle of ["export const CALIBRATION_PATHS", "C30J-J9 (analysis C8", "the calibration read orders stay what each reader did"]) {
    assert.ok(text.includes(needle), `${needle} is part of the patch`);
  }
});
