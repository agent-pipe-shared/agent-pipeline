// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w258 (C20-G208B-AGY-ISOLATION): the patch exists, is non-empty, touches only the permitted plugin surfaces and carries
// the M4b isolation rule, the worktree governance resolution, the confinement and the sanctioned take-over route with its guard admission.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w258-c20-agy-native-isolation.patch"), "utf8");
const ALLOWED = [
  "plugins/pipeline-core/lib/",
  "plugins/pipeline-core/hooks/antigravity-",
  "plugins/pipeline-core/hooks/guard-dispatch",
  "plugins/pipeline-core/scripts/",
  "plugins/pipeline-core/config/",
  "plugins/pipeline-core/skills/pipeline-start/references/",
];

test("w258 patch exists, is non-empty and touches only the permitted plugin surfaces", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.ok(ALLOWED.some((prefix) => file.startsWith(prefix)), `outside the permitted surfaces: ${file}`);
  }
  for (const needed of [
    "plugins/pipeline-core/lib/agy-native-goldfish.mjs",
    "plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs",
    "plugins/pipeline-core/scripts/agy-native-integrate.mjs",
    "plugins/pipeline-core/lib/guard/command-catalogue.mjs",
    "plugins/pipeline-core/lib/guard/constants.mjs",
    "plugins/pipeline-core/lib/pins/antigravity-native-goldfish-dispatch-needs-consent-and-has-no-parent-binding.test.mjs",
    "plugins/pipeline-core/skills/pipeline-start/references/antigravity-native-dispatch.md",
  ]) assert.ok(files.includes(needed), needed);
});

test("w258 patch carries the isolation rule, the worktree governance, the confinement and the take-over route", () => {
  for (const needle of [
    "AGY-NATIVE-WORKSPACE-NOT-ISOLATED", "AGY-NATIVE-WORKTREE-UNCOMMITTED", "AGY-NATIVE-WORKTREE-UNREGISTERED",
    "AGY-NATIVE-CHILD-WRITE-OUTSIDE-WORKTREE", "resolveNativeChildGovernance", "projectNativeChildInput",
    "pipeline.agy-native-integrate-plan.v1", "AGYI-PLAN-DIGEST-MISMATCH", "AGY_NATIVE_INTEGRATE_SCRIPT", "sanctionedAgyNativeIntegrateArgs",
  ]) assert.ok(patch.includes(needle), needle);
  // The serialization switch and the alive-count refusal are removed, not merely bypassed.
  assert.match(patch, /^-export const AGY_NATIVE_SERIALIZE_CODE_WRITERS/m);
  assert.match(patch, /^-.*AGY-NATIVE-CODE-WRITER-ALIVE/m);
  assert.doesNotMatch(patch, /^\+.*AGY-NATIVE-CODE-WRITER-ALIVE/m);
});
