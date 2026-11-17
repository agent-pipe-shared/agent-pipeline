// SPDX-License-Identifier: SUL-1.0
// C30G-M16 check: the held patch exists, is not empty and touches only the briefed files. No producer or product run.
// The patch is a delta on the 30h chain (30g, E1, E2 and P1), which is not applied to the repository yet, so this check never runs
// `git apply` against the repository root: the notes name the required order (apply the chain first, then this patch).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const PATCH = join(import.meta.dirname, "w30h1-dispatch-model-exception.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/dispatch-model-enforcement.mjs",
  "plugins/pipeline-core/lib/dispatch-model-enforcement.test.mjs",
  "plugins/pipeline-core/lib/dispatch-model-exception.mjs",
  "plugins/pipeline-core/scripts/dispatch-model-exception.mjs",
  "plugins/pipeline-core/scripts/dispatch-model-exception.test.mjs",
  "plugins/pipeline-core/hooks/guard-dispatch.mjs",
  "plugins/pipeline-core/hooks/guard-dispatch-model.test.mjs",
  "plugins/pipeline-core/hooks/guard-dispatch-budget.mjs",
  "plugins/pipeline-core/hooks/guard-dispatch-budget.test.mjs",
  "plugins/pipeline-core/scripts/dispatch-briefing.mjs",
  "plugins/pipeline-core/scripts/dispatch-briefing.test.mjs",
  "plugins/pipeline-core/scripts/dispatch-record-write.mjs",
  "plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs",
  "plugins/pipeline-core/lib/agent-model-registry.mjs",
  "plugins/pipeline-core/lib/guard/command-catalogue.mjs",
  "plugins/pipeline-core/config/runner-capabilities.json",
  "docs/product-capability-inventory.json",
  "plugins/pipeline-core/reader-inputs/product-capability-inventory.json",
  "harness/verify-suites.json",
  "plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md",
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

test("the patch carries the new store, the script and the guard wiring", () => {
  const text = readFileSync(PATCH, "utf8");
  for (const needle of ["plugins/pipeline-core/lib/dispatch-model-exception.mjs", "DISPATCH-MODEL-EXCEPTION", "consumeModelException"]) {
    assert.ok(text.includes(needle), `${needle} is part of the patch`);
  }
});
