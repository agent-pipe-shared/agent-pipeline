#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { planVerifySelection, validateVerifySelection, verifyEvidenceSatisfiesBoundary } from "./verify-selection.mjs";

const policy = {
  schema: "pipeline.verify-selection.v1",
  baseline: ["baseline"],
  areas: [
    { id: "source", paths: ["src/**"], suites: ["source-test"] },
    { id: "docs", paths: ["docs/**", "README.md"], suites: ["docs-test"] },
  ],
};
const common = { baseCommit: "a", candidateCommit: "b", registeredSuiteIds: ["baseline", "docs-test", "source-test"], policy };

const impacted = planVerifySelection({ ...common, mode: "critic", changedPaths: ["src/a.mjs"] });
assert.equal(impacted.execution, "impacted");
assert.deepEqual(impacted.selectedSuiteIds, ["baseline", "source-test"]);
assert.deepEqual(impacted.omittedSuiteIds, ["docs-test"]);
assert.equal(impacted.fallbackReason, null);
assert.equal(validateVerifySelection(impacted), true);
assert.equal(verifyEvidenceSatisfiesBoundary({ commit: "b", exitCode: 0, selection: impacted }, "critic"), true);

const specificRecovery = planVerifySelection({
  mode: "critic",
  baseCommit: "a",
  candidateCommit: "b",
  changedPaths: ["plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs"],
  registeredSuiteIds: ["baseline", "broad-implementation", "lifecycle-recovery"],
  policy: {
    schema: "pipeline.verify-selection.v1",
    baseline: ["baseline"],
    areas: [
      { id: "implementation", paths: ["plugins/**"], suites: ["broad-implementation"] },
      { id: "lifecycle-recovery", paths: ["plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs"], suites: ["lifecycle-recovery"] },
    ],
  },
});
assert.equal(specificRecovery.execution, "impacted");
assert.deepEqual(specificRecovery.matchedAreaIds, ["lifecycle-recovery"]);
assert.deepEqual(specificRecovery.selectedSuiteIds, ["baseline", "lifecycle-recovery"]);
assert.deepEqual(specificRecovery.omittedSuiteIds, ["broad-implementation"]);

for (const [label, input, reason] of [
  ["release is always full", { ...common, mode: "release", changedPaths: ["src/a.mjs"] }, "full-boundary"],
  ["missing base is full", { ...common, mode: "work", baseCommit: null, changedPaths: ["src/a.mjs"] }, "missing-binding"],
  ["equal base is full", { ...common, mode: "push", baseCommit: "b", changedPaths: [] }, "invalid-base"],
  ["unknown path is full", { ...common, mode: "push", changedPaths: ["secrets/new.bin"] }, "unclassified-change"],
  ["unclassified suite is full", { ...common, mode: "candidate", registeredSuiteIds: [...common.registeredSuiteIds, "orphan"], changedPaths: ["src/a.mjs"] }, "unclassified-suite"],
]) {
  const result = planVerifySelection(input);
  assert.equal(result.execution, "full", label);
  assert.equal(result.fallbackReason, reason, label);
  assert.deepEqual(result.omittedSuiteIds, [], label);
}

const forced = planVerifySelection({ ...common, mode: "push", changedPaths: ["src/a.mjs", "unknown/new.bin"], forceFullReason: "invalid-base" });
assert.equal(forced.execution, "full");
assert.deepEqual(forced.changedPaths, ["src/a.mjs", "unknown/new.bin"]);
assert.deepEqual(forced.unmatchedPaths, ["unknown/new.bin"]);

const release = planVerifySelection({ ...common, mode: "release", changedPaths: [] });
assert.equal(verifyEvidenceSatisfiesBoundary({ commit: "b", exitCode: 0, selection: release }, "release"), true);
assert.equal(verifyEvidenceSatisfiesBoundary({ commit: "b", exitCode: 0, selection: impacted }, "release"), false);
assert.equal(verifyEvidenceSatisfiesBoundary({ commit: "other", exitCode: 0, selection: impacted }, "critic"), false);
const conservativeCritic = planVerifySelection({ ...common, mode: "critic", changedPaths: ["unknown/new.bin"] });
assert.equal(conservativeCritic.execution, "full");
assert.deepEqual(conservativeCritic.unmatchedPaths, ["unknown/new.bin"]);
assert.equal(verifyEvidenceSatisfiesBoundary({ commit: "b", exitCode: 0, selection: conservativeCritic }, "critic"), true);
assert.equal(verifyEvidenceSatisfiesBoundary({ commit: "b", exitCode: 0, selection: conservativeCritic }, "push"), false);
assert.equal(validateVerifySelection({ ...impacted, omittedSuiteIds: [] }), false);
assert.equal(validateVerifySelection({ ...impacted, selectionSha256: "0".repeat(64) }), false);

console.log("verify-selection: 19 tests passed");
