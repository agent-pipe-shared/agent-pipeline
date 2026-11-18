// SPDX-License-Identifier: SUL-1.0
// C30J-J7 check: the held patch exists, is not empty and touches only the briefed files. No producer or product run.
// The patch is a delta on the integrated 30i tree (the clone base9), which is not applied to the repository yet, so this check never
// runs `git apply` against the repository root: the notes name the required order (apply that tree first, then this patch).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const PATCH = join(import.meta.dirname, "w30j07-close-chain-deleted-evidence-back-move-and-gate-change-way-out.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/finish-feature.mjs",
  "plugins/pipeline-core/scripts/finish-feature.test.mjs",
  "plugins/pipeline-core/scripts/commit-pipeline-owned.mjs",
  "plugins/pipeline-core/scripts/commit-pipeline-owned.test.mjs",
  "plugins/pipeline-core/scripts/close-coordinator.mjs",
  "plugins/pipeline-core/scripts/close-coordinator.test.mjs",
  "plugins/pipeline-core/lib/gate-definition-changes.mjs",
  "plugins/pipeline-core/lib/gate-definition-changes.test.mjs",
  "plugins/pipeline-core/scripts/close-path-e2e.test.mjs",
  "plugins/pipeline-core/scripts/pipeline-state-inspect.test.mjs",
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

test("the patch carries the three changes: the owned-commit recovery, the package back-move on every run and the gate-change way out", () => {
  const text = readFileSync(PATCH, "utf8");
  for (const needle of ["foreignChangesRepair", "packageBackToCorrection", "gateChangeWayOutText"]) {
    assert.ok(text.includes(needle), `${needle} is part of the patch`);
  }
});
