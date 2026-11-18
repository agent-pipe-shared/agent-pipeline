// SPDX-License-Identifier: SUL-1.0
// C30J-J24 check: the held patch exists, is not empty and touches only the briefed files. No producer or product run.
// The patch is a delta on the integrated 30j tree (the clone int30j), which is not applied to the repository yet, so this check never
// runs `git apply` against the repository root: the notes name the required order (apply that tree first, then this patch).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const PATCH = join(import.meta.dirname, "w30j24-the-soft-plugin-refresh-status-offers-the-hook-refresh.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/pipeline-start-preflight.mjs",
  "plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs",
  "plugins/pipeline-core/lib/pins/bootstrap-should-refresh-hooks-when-the-plugin-updated.test.mjs",
  "plugins/pipeline-core/scripts/mid-session-hook-refresh.test.mjs",
  "plugins/pipeline-core/skills/pipeline-start/references/onboarding-recovery.md",
  "plugins/pipeline-core/skills/pipeline-start/SKILL.md",
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
