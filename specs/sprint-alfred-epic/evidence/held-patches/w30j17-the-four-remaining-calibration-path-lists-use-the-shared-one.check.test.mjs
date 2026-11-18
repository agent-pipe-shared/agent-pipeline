// Check for held patch C30J-J17: the patch exists, is non-empty and touches only the briefed files.
// It does not apply the patch: the patch is a delta on the integrated 30i tree plus the held patch of C30J-J9.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patchPath = join(here, "w30j17-the-four-remaining-calibration-path-lists-use-the-shared-one.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/critic-evidence-carry.mjs",
  "plugins/pipeline-core/lib/critic-evidence-carry.test.mjs",
  "plugins/pipeline-core/lib/analysis-run.mjs",
  "plugins/pipeline-core/lib/analysis-run.test.mjs",
  "plugins/pipeline-core/lib/maintenance-delivery.mjs",
  "plugins/pipeline-core/lib/maintenance-delivery.test.mjs",
  "plugins/pipeline-core/lib/push-threat-model-materialize.mjs",
  "plugins/pipeline-core/lib/calibration-verify-commit-transition.test.mjs",
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
