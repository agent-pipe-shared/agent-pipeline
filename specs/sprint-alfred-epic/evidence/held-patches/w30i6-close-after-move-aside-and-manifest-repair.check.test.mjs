// SPDX-License-Identifier: SUL-1.0
// Check of the held patch w30i6 (C30I-S7, queue C30-22): the patch exists, is non-empty and touches only the files its scope names.
// It does not run git apply against the repository: the patch is a delta on the 30h chain plus the skill split, the agent fields, the bound-session advance and the registration --supersedes (the clone base7), see the notes file for the order.

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const DIR = import.meta.dirname;
const PATCH = join(DIR, "w30i6-close-after-move-aside-and-manifest-repair.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/finish-feature.mjs",
  "plugins/pipeline-core/scripts/finish-feature.test.mjs",
  "plugins/pipeline-core/scripts/close-coordinator.mjs",
  "plugins/pipeline-core/scripts/close-coordinator.test.mjs",
  "plugins/pipeline-core/scripts/close-coordinator-audit-lifecycle.test.mjs",
  "plugins/pipeline-core/lib/feature-package-topology.mjs",
  "plugins/pipeline-core/lib/feature-package-topology.test.mjs",
  "plugins/pipeline-core/lib/feature-package-registration.mjs",
  "plugins/pipeline-core/scripts/register-feature-package-readback.test.mjs",
  "harness/config/verify-case-completion-augmentations.v1.json",
]);

test("the w30i6 patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0);
});

test("the w30i6 patch touches only the files its scope names", () => {
  const text = readFileSync(PATCH, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `outside the scope: ${path}`);
  for (const path of ["plugins/pipeline-core/scripts/finish-feature.mjs", "plugins/pipeline-core/lib/feature-package-topology.mjs", "plugins/pipeline-core/lib/feature-package-registration.mjs", "plugins/pipeline-core/scripts/close-coordinator.mjs"]) {
    assert.ok(touched.includes(path), `the production change is in the patch: ${path}`);
  }
});
