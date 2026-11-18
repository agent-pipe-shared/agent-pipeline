// Check for held patch C30K-K11: the patch exists, is non-empty and touches only the briefed files.
// It does not apply the patch: the patch is a delta on the integrated 30j tree (the clone int30j).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patchPath = join(here, "w30k11-the-five-remaining-calibration-lists-and-two-guard-texts-use-the-shared-list.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/repository-mode-promote.mjs",
  "plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs",
  "plugins/pipeline-core/hooks/guard-dispatch-budget.mjs",
  "plugins/pipeline-core/scripts/push-prepare.mjs",
  "plugins/pipeline-core/hooks/guard-gate-strength.mjs",
  "plugins/pipeline-core/lib/calibration-verify-commit-transition.test.mjs",
  "plugins/pipeline-core/scripts/repository-mode-promote.test.mjs",
  "plugins/pipeline-core/scripts/push-prepare.test.mjs",
  "plugins/pipeline-core/hooks/guard-gate-strength.test.mjs",
]);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patchPath).size > 0);
});

test("the patch touches only the briefed files", () => {
  const text = readFileSync(patchPath, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "the patch names files");
  const outside = [...new Set(files)].filter((f) => !ALLOWED.has(f));
  assert.deepEqual(outside, []);
});
