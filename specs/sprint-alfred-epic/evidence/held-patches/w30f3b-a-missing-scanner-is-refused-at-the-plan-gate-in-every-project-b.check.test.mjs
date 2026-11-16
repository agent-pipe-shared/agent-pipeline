// SPDX-License-Identifier: SUL-1.0
// Check of the held patch w30f3b (C30F-G3B): the patch exists, is non-empty and touches only the files its scope names.
// It does not run git apply against the repository: the patch is a delta on the 30e chain (see the notes file for the order).

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const DIR = import.meta.dirname;
const PATCH = join(DIR, "w30f3b-a-missing-scanner-is-refused-at-the-plan-gate-in-every-project-b.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/security-close-status.mjs",
  "plugins/pipeline-core/lib/toolchain-doc.mjs",
  "plugins/pipeline-core/lib/toolchain-deferrals.mjs",
  "plugins/pipeline-core/lib/toolchain-registry.test.mjs",
  "plugins/pipeline-core/scripts/pipeline-state.mjs",
  "plugins/pipeline-core/scripts/pipeline-state.test.mjs",
  "plugins/pipeline-core/scripts/toolchain-preflight.mjs",
  "plugins/pipeline-core/scripts/toolchain-preflight.test.mjs",
  "plugins/pipeline-core/lib/pins/security-close-chain-is-hard-per-calibration.test.mjs",
  "plugins/pipeline-core/lib/pins/configure-verify-names-the-unmet-approval-condition.test.mjs",
  "plugins/pipeline-core/docs/toolchain.md",
  "docs/toolchain.md",
]);

test("the w30f3b patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0);
});

test("the w30f3b patch touches only the files its scope names", () => {
  const text = readFileSync(PATCH, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `outside the scope: ${path}`);
  assert.ok(touched.includes("plugins/pipeline-core/lib/security-close-status.mjs"), "the production change is in the patch");
  assert.ok(touched.includes("plugins/pipeline-core/scripts/pipeline-state.mjs"), "the gate caller is in the patch");
  assert.ok(touched.includes("docs/toolchain.md") && touched.includes("plugins/pipeline-core/docs/toolchain.md"), "both generated copies of the toolchain document are in the patch");
});
