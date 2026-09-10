// SPDX-License-Identifier: SUL-1.0
// Shared test-fixture builder for boundary-bound Verify evidence.
import { planVerifySelection } from "./verify-selection.mjs";

export function verifyEvidenceFixture(commit, mode = "push") {
  const suite = "fixture-suite";
  return {
    exitCode: 0,
    commit,
    selection: planVerifySelection({
      mode,
      baseCommit: commit,
      candidateCommit: commit,
      changedPaths: [],
      registeredSuiteIds: [suite],
      policy: {
        schema: "pipeline.verify-selection.v1",
        baseline: [suite],
        areas: [{ id: "fixture", paths: ["**"], suites: [suite] }],
      },
    }),
  };
}
