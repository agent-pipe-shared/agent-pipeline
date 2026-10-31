// SPDX-License-Identifier: SUL-1.0
// Shared test-fixture builder for boundary-bound Verify evidence.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planVerifySelection } from "./verify-selection.mjs";
import { CURRENT_APPROVAL_SCHEMA, PLAN_SUBMISSION_SCHEMA, sha256CanonicalJson } from "./plan-spec-state-v2.mjs";

/**
 * Commit an approved low-rigor (mini) feature into a fixture repository and return the new HEAD.
 *
 * The push gate resolves the publication-review duty from the PUSHED commit's own project state
 * (publication-review-requirement.mjs): absent, unreadable or unapproved state, or any registered
 * package, requires an independent Critic review bound to the candidate, which a bare fixture
 * repository can never carry. An allow case that is about something else (a security mode, an
 * approval mode, a destination shape, a working-directory binding) therefore models a candidate
 * whose pushed state is an approved mini plan, exactly as publication-guard-candidate.test.mjs does.
 * Block cases keep their repository bare and keep refusing for their own reason.
 *
 * Call it BEFORE the HEAD an evidence file or a signed approval binds to is read.
 *
 * Committed state and working-tree state are read by different checks: the review duty reads the
 * COMMITTED state of the pushed commit, while the push-approval check reads the working-tree state file.
 * A case may therefore overwrite `.claude/pipeline-state.json` in the working tree with a push-approval
 * record afterwards; that does not undo the committed mini state this helper installs.
 */
export function commitApprovedMiniFixtureState(dir, { featureId = "fixture-feature" } = {}) {
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8", shell: false });
    if (result.status !== 0) throw new Error(`fixture git ${args[0]} failed: ${result.stderr}`);
    return result.stdout.trim();
  };
  const planPath = `specs/${featureId}/prd.md`, specPath = `specs/${featureId}/spec.md`;
  const planBytes = "# PRD\n", specBytes = "# Spec\n";
  const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
  mkdirSync(join(dir, "specs", featureId), { recursive: true });
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, planPath), planBytes);
  writeFileSync(join(dir, specPath), specBytes);
  const profileSha256 = "a".repeat(64);
  const submission = { schema: PLAN_SUBMISSION_SCHEMA, featureId, planPath, planSha256: sha(planBytes),
    specPath, specSha256: sha(specBytes), profile: "mini", profileSha256,
    submittedBy: "fixture", submittedAt: "2026-10-24T00:00:00.000Z" };
  const poGateAuthority = { schema: "pipeline.po-gate-authority.v2", humanFacing: "en",
    sourceSha256: "b".repeat(64), runtimeSha256: "c".repeat(64), receiptSha256: "d".repeat(64),
    repositoryFingerprint: "e".repeat(64), planPath, planSha256: submission.planSha256,
    specPath, specSha256: submission.specSha256 };
  const state = { schema: "pipeline.state.v0", activeFeature: { id: featureId, planPath, phase: "implementation" },
    planApproved: true, planSubmission: submission,
    planApproval: { schema: CURRENT_APPROVAL_SCHEMA, approvedBy: "fixture", approvedAt: "2026-10-24T00:01:00.000Z",
      submissionSha256: sha256CanonicalJson(submission), profileSha256, poGateAuthority,
      priorInvalidationSha256: null, designApprovalBinding: null, designApproval: null } };
  writeFileSync(join(dir, ".claude", "pipeline-state.json"), JSON.stringify(state));
  git("add", ".claude/pipeline-state.json", planPath, specPath);
  git("commit", "-q", "-m", "approved mini fixture state");
  return git("rev-parse", "HEAD");
}

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
