// SPDX-License-Identifier: SUL-1.0
// Check of the held patch w30j04 (C30J-J4): the patch exists, is non-empty and touches only the files its scope names.
// It does not run git apply against the repository: the patch is a delta on the integrated 30i tree (see the notes file for the order).

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const DIR = import.meta.dirname;
const PATCH = join(DIR, "w30j04-a-pending-state-retires-at-its-own-integration.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/routine-repair.mjs",
  "plugins/pipeline-core/lib/routine-repair.test.mjs",
  "plugins/pipeline-core/lib/native-goldfish-host-state.mjs",
  "plugins/pipeline-core/lib/native-goldfish-host-state.test.mjs",
  "plugins/pipeline-core/lib/native-goldfish-host-parallel-admission.test.mjs",
  "plugins/pipeline-core/scripts/session-authority-repair.mjs",
  "plugins/pipeline-core/scripts/session-authority-repair.test.mjs",
  "plugins/pipeline-core/scripts/session-authority-repair-aside.test.mjs",
  "plugins/pipeline-core/lib/native-managed-authority-support.mjs",
  "plugins/pipeline-core/lib/session-authority-registry.mjs",
  "plugins/pipeline-core/lib/session-authority-registry-leftover.test.mjs",
]);

test("the w30j04 patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0);
});

test("the w30j04 patch touches only the files its scope names", () => {
  const text = readFileSync(PATCH, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `outside the scope: ${path}`);
  assert.ok(touched.includes("plugins/pipeline-core/lib/native-goldfish-host-state.mjs"), "the production change is in the patch");
  assert.ok(touched.includes("plugins/pipeline-core/lib/native-goldfish-host-state.test.mjs"), "the new cases are in the patch");
});
