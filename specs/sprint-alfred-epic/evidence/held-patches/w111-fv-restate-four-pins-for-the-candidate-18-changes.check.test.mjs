// Held-patch check for w111: four pins restated for candidate 18 changes. It does not run git apply: the patch is a delta on the applied candidate 18 tree.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w111-fv-restate-four-pins-for-the-candidate-18-changes.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/pins/plan-submission-must-not-require-separate-po-approval.test.mjs",
  "plugins/pipeline-core/lib/pins/consumer-spec-criterion-binds-the-first-item-delivery.test.mjs",
  "plugins/pipeline-core/scripts/measure-tofu-push-e2e.test.mjs",
  "plugins/pipeline-core/lib/agy-final-return.test.mjs",
];

test("w111: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH), "patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "patch file is empty");
});

test("w111: the patch touches only the four pin files", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "patch has no diff header");
  for (const file of files) assert.ok(ALLOWED.includes(file), `patch touches an unexpected file: ${file}`);
  for (const allowed of ALLOWED) assert.ok(files.includes(allowed), `patch misses ${allowed}`);
});

test("w111: every restated pin carries its QG-04 comment", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.equal([...text.matchAll(/^\+\s*\/\/ Restated 2026-11-02 \(candidate 18/gmu)].length >= 4, true);
});
