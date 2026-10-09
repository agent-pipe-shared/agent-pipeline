#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-devplan-design-approval-v7.test.mjs -- the Dev-Plan-Gate on a v7 plan approval whose
 * private Advisor course store is ABSENT (ADR-0085 row 3b, Ruling 77(c), slice T0c-b).
 *
 * Target path: plugins/pipeline-core/hooks/guard-devplan-design-approval-v7.test.mjs
 *
 * Contract: design note section 17 ("Implementation authority" and "Legacy approvals"): the
 * implementation predicate reads no private Advisor course store, no Advisor or readiness host
 * evidence and no live candidate; a v7 design-workflow-package approval stays verifiable through the
 * re-read mode (package bytes against the approved digest, PRD and Spec digests, the Advisor-exception
 * binding, the signature against the trust anchor) "on a fresh clone and on a second machine wherever
 * the approved package bytes are tracked".
 *
 * Cases (one fixture, run in this order -- the second removes what the first needs):
 *   control  the live-shaped v7 record, course store PRESENT: both lanes admit. Green today; it is
 *            also the proof that the package/approval fixture is valid, so a red control is a fixture
 *            defect and never a finding.
 *   target   the SAME record after the course store directory is deleted (a fresh clone): both lanes
 *            must admit. RED today, because the v7 branch calls readApprovedDesignWorkflowPackage and
 *            its v2 "unavailable" path re-reads the private course store.
 *            Today (measured under WSL, 2026-10-09): the package re-read returns
 *            {ok:false, code:"DWP2-DURABLE-FAILURE"} (design-workflow-package-v2.mjs:97, the check that the
 *            durable course is reuse-terminal) and the Edit lane exits 2 with that code. Only the Edit-lane
 *            assertion is reached: it throws before the Bash-lane assertion runs, so the Bash lane's own
 *            refusal is not measured. (An earlier draft of this header predicted DWP2-PHYSICAL-OR-GIT; that
 *            is not the code that fires.)
 *            The assertion pins the TARGET (admission); it does not assert today's refusal, so the
 *            case turns green exactly when the boundary stops reading the store. Today's refusal code
 *            is printed in the failure text for the record, not asserted.
 *
 * Fixture route (no production change, no production-only state):
 *   - repo and sources from the existing advisorHostFixture (git repo with prd.md/spec.md/...);
 *   - governance enrollment of that repo FIRST, right after the fixture returns (as the v8 test enrolls after
 *     git init): governance-scope enrollmentHistory() counts .claude/pipeline-state.json, so enrolling after
 *     the state file is written is recorded as `declined`, never `active`;
 *   - the REAL native-runner (claude) no-child Advisor-unavailable course through
 *     coordinateInitialDesignAdvisory, which writes the real course store under the git common dir --
 *     the shape of this repository's live record (advisorException kind advisor-unavailable, failure
 *     code native-initial-answer-provenance-unavailable, signature mode);
 *   - the readiness receipt is STRUCTURALLY valid but hand-materialised (same shape as
 *     test-design-workflow-fixture.mjs): the boundary's approved re-read passes
 *     requireReadinessExecution:false, so no readiness host execution is verified there;
 *   - the PO signature is a generated Ed25519 key over the intent of the real approval request;
 *     project/critical-human-proof.json is absent, so the boundary passes no trust anchors;
 *   - the package, readiness and failure evidence are committed (tracked), as in a fresh clone.
 *
 * Assumptions named, not fixed by the note: (a) the claude no-child shape stands for "this repo's v7
 * shape"; (b) the v7 branch never reads gates.human_approval, so no pipeline.user.yaml mode fixture is
 * needed; (c) the course store lives at <git-common-dir>/agent-pipeline/design-advisor-courses
 * (design-advisor-course-store.mjs, not exported), and removing that directory is what "absent" means.
 *
 * Run under WSL (the readiness fixture is Linux-only; on win32 the case is skipped with its reason):
 *   node --test plugins/pipeline-core/hooks/guard-devplan-design-approval-v7.test.mjs
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { advisorHostFixture } from "../lib/codex-advisor-host.fixture.mjs";
import { canonicalJson } from "../lib/codex-sandbox-compatibility.mjs";
import { coordinateInitialDesignAdvisory } from "../lib/design-advisory-coordinator-v2.mjs";
import { designAdvisorValueSha256 } from "../lib/design-advisor-course.mjs";
import { observeAdvisorCandidate, observeInitialAdvisorSources } from "../lib/design-advisor-provenance.mjs";
import { designReadinessReportSha256 } from "../lib/design-readiness-host-evidence.mjs";
import { createDesignWorkflowPackageApprovalRequest, verifyDesignWorkflowPackageApproval } from "../lib/design-workflow-approval.mjs";
import { designWorkflowAdvisorExceptionBinding, readApprovedDesignWorkflowPackage, readDesignWorkflowPackageFromRepository } from "../lib/design-workflow-package.mjs";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
import { createNativeInitialAdvisorExecution } from "../lib/native-initial-advisor-execution.mjs";
import { sha256CanonicalJson } from "../lib/plan-spec-state-v2.mjs";
import { loadRunnerProfilesV3Registry } from "../lib/runner-profiles-v3.mjs";
import { exportCodexDesignAdvisorArtifacts } from "../scripts/codex-design-advisor-bootstrap.mjs";
import { evaluateLifecycleReadyGuard } from "./guard-lifecycle-ready.mjs";

const GUARD = fileURLToPath(new URL("./guard-devplan.mjs", import.meta.url));
const FEATURE_ID = "advisor-feature";
const PACKAGE_PATH = "evidence/package.json";
const MANIFEST_BLOCKING = "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function enrollFixture(dir) {
  const governance = createGovernanceScopeController({ hostStateRoot: join(dir, "fixture-host-state") });
  const plan = governance.planDecision({ rootDir: dir, decision: "enroll", by: "disposable-guard-fixture" });
  const active = governance.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  if (active.state !== "active" || active.requiresEnforcement !== true) throw new Error("fixture enrollment did not become active");
}

function runGuard(toolName, filePath, projectDir) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath, old_string: "a", new_string: "b" } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    timeout: 60_000,
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

/** The Edit|Write lane (the hook as a process) and the Bash lane (GUARD-DEVPLAN-SHELL), same project. */
function lanes(dir) {
  const direct = runGuard("Edit", "src/foo.ts", dir);
  const shell = evaluateLifecycleReadyGuard(
    { tool_name: "Bash", tool_input: { command: "cp scratch/change.ts src/foo.ts" } },
    { projectDir: dir, requireProjectOnboardingReadyFn: () => ({ schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" }) },
  );
  return { direct, shell };
}

async function buildLiveShapedV7Fixture(t) {
  const f = advisorHostFixture(t, "cross-citation");
  const root = f.root;
  // Enroll first, as draft A does right after git init: governance-scope enrollmentHistory() lists .claude/pipeline-state.json,
  // so enrolling after the state file is written is recorded as `declined` (retained history), never `active`.
  enrollFixture(root);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 20_000 }).trim();
  const candidate = observeAdvisorCandidate(root);
  const sourcePaths = Object.fromEntries(Object.entries(f.sources).map(([name, s]) => [name, s.path]));
  const sources = observeInitialAdvisorSources({ repoRoot: root, candidate, sourcePaths }).sources;
  const route = { model: null, effort: null, sourceSha256: designAdvisorValueSha256(loadRunnerProfilesV3Registry()), candidateCommit: candidate.commit };

  // The real native-runner no-child Advisor-unavailable course. This writes the private course store.
  const failure = await coordinateInitialDesignAdvisory({
    repoRoot: root, runner: "claude", featureId: FEATURE_ID, authoringDispatchId: "elephant-author", sources: f.sources,
    reason: "risk-review", profile: "feature", dispatch: f.args.dispatch, route,
    hostExecution: createNativeInitialAdvisorExecution({ runner: "claude" }),
  });
  assert.equal(failure.status, "unavailable-pending-final-approval", JSON.stringify(failure));
  mkdirSync(join(root, "evidence"));
  const artifacts = exportCodexDesignAdvisorArtifacts(root, "evidence/failure", failure);
  assert.ok(artifacts.failure && artifacts.initial);

  const rationale = "Advisor-unavailable exception, feature advisor-feature, runner claude.\nThe PO accepts, once, at the final approval: this design is approved without an Advisor answer.\n";
  const preparation = {
    schema: "pipeline.design-readiness-preparation.v2", featureId: FEATURE_ID, authoringDispatchId: "elephant-author", candidate, sources,
    advisor: {
      status: "unavailable", runner: "claude", profile: "feature", route, initialContext: artifacts.initial, courseBinding: failure.courseBinding,
      consultation: null, hostReceipt: failure.hostReceipt, receipt: artifacts.receipt ?? null, report: null, disposition: null, revisions: [],
      failureEvidence: artifacts.failure, proposedException: { kind: "advisor-unavailable", approval: "final", oneTime: true, rationale },
    },
    createdAt: new Date().toISOString(),
  };
  // Structurally valid readiness receipt; the approved re-read does not verify its host execution.
  const readinessReport = {
    schema: "pipeline.design-readiness-receipt.v1", dispatchId: "failure-final-readiness", runner: "codex", candidate, sources,
    outcome: "ready-for-po-review", findings: [{ code: "TRACE-OK", severity: "non-blocking", summary: "The source requirements are traced." }],
    unresolvedChoices: [], summary: "The current sources are ready for one final PO review.",
  };
  const readiness = {
    ...readinessReport,
    hostExecution: {
      schema: "pipeline.design-readiness-host-execution.v1", runner: "codex", repoFingerprint: f.repoFingerprint, selectionId: `css_${"a".repeat(25)}e`,
      selectionSha256: "5".repeat(64), executionReceiptSha256: "6".repeat(64), dutyReceiptSha256: designReadinessReportSha256(readinessReport),
      route: { model: "gpt-6-luna", effort: "high", sourceSha256: "8".repeat(64), candidateCommit: candidate.commit },
    },
  };
  const readinessBytes = Buffer.from(canonicalJson(readiness));
  writeFileSync(join(root, "evidence/readiness.json"), readinessBytes);
  const packageObject = {
    ...preparation, schema: "pipeline.design-workflow-package.v2",
    readiness: { path: "evidence/readiness.json", sha256: sha256(readinessBytes), dispatchId: "failure-final-readiness" },
  };
  const packageBytes = Buffer.from(canonicalJson(packageObject));
  writeFileSync(join(root, PACKAGE_PATH), packageBytes);
  const packageSha256 = sha256(packageBytes);

  const planPath = f.sources.prd.path, specPath = f.sources.spec.path;
  const planSha256 = sha256(readFileSync(join(root, planPath))), specSha256 = sha256(readFileSync(join(root, specPath)));
  assert.equal(planSha256, sources.prd.sha256);
  assert.equal(specSha256, sources.spec.sha256);
  // readDesignWorkflowPackageFromRepository ignores this callback for a v2 package (it calls the v2 reader, which observes
  // HEAD itself), so a frozen callback would have no effect; the live observation is the honest one.
  const readCandidate = () => observeAdvisorCandidate(root);

  // The approved bytes are tracked, as on a fresh clone. The approval request refuses an untracked
  // bound path (DWP-BOUND-PATH-UNTRACKED), so the evidence is committed BEFORE the request is built.
  // HEAD then differs from the package candidate, and the v2 reader admits that only as an EVIDENCE-ONLY descendant
  // (design-workflow-package-v2.mjs isEvidenceOnlyDescendant): every path in `diff-tree candidate..HEAD` must be added or
  // modified AND belong to the package's bound set. So stage EXACTLY the bound paths, derived from the package object
  // (not `git add -- evidence`, which would also sweep in any unbound file the export wrote).
  const boundPaths = [...new Set([
    PACKAGE_PATH, packageObject.readiness.path, packageObject.advisor.initialContext.path, packageObject.advisor.failureEvidence.path,
    packageObject.advisor.receipt?.path, packageObject.advisor.report?.path,
  ].filter((p) => typeof p === "string" && p.length > 0))];
  git("add", "--", ...boundPaths);
  assert.deepEqual(git("diff", "--cached", "--name-only").split("\n").filter(Boolean).sort(), [...boundPaths].sort(), "the evidence commit must hold exactly the bound paths");
  git("-c", "commit.gpgsign=false", "commit", "-q", "-m", "Track the approved design workflow package evidence");

  // The real approval request, then a generated-key signature over its intent, verified by the real verifier.
  const prepared = createDesignWorkflowPackageApprovalRequest({
    repoRoot: root, packagePath: PACKAGE_PATH, featureId: FEATURE_ID, planPath, planSha256, specPath, specSha256, readCandidate,
    verifyReadinessExecution: () => ({ ok: true }),
  });
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.equal(prepared.packageRead.packageSha256, packageSha256);
  const { privateKey } = generateKeyPairSync("ed25519");
  const proof = {
    schema: "pipeline.po-approval-proof.v1", intentSha256: prepared.request.approvalIntent.sha256, keyReference: "local-po-key",
    publicKey: createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString(),
    signatureBase64: sign(null, Buffer.from(prepared.request.approvalIntent.sha256), privateKey).toString("base64"),
  };
  const verified = verifyDesignWorkflowPackageApproval({
    repoRoot: root, request: prepared.request, proof, anchors: [], packagePath: PACKAGE_PATH, featureId: FEATURE_ID,
    planPath, planSha256, specPath, specSha256, readCandidate, allowUnrelatedCommits: true,
  });
  assert.equal(verified.ok, true, `fixture signature must verify with no anchors: ${JSON.stringify(verified)}`);
  const exceptionBinding = designWorkflowAdvisorExceptionBinding(readDesignWorkflowPackageFromRepository({
    repoRoot: root, packagePath: PACKAGE_PATH, readCandidate, requireCurrentCandidate: false, requireReadinessExecution: false,
  }));
  assert.equal(exceptionBinding?.kind, "advisor-unavailable");

  const approvedBy = `verified:${verified.signer.keyReference}`;
  const approvedAt = new Date().toISOString();
  const submission = {
    schema: "pipeline.plan-submission.v1", featureId: FEATURE_ID, planPath, planSha256, specPath, specSha256, profile: "feature",
    profileSha256: "3".repeat(64), submittedBy: "Coordinator", submittedAt: approvedAt,
  };
  const state = {
    schema: "pipeline.state.v0",
    activeFeature: { id: FEATURE_ID, planPath, phase: "implementation" },
    planApproved: true,
    planSubmission: submission,
    planApproval: {
      schema: "pipeline.plan-approval.v7", approvedBy, approvedAt,
      submissionSha256: sha256CanonicalJson(submission), profileSha256: submission.profileSha256,
      poGateAuthority: {
        schema: "pipeline.po-gate-authority.v2", humanFacing: "en", sourceSha256: "1".repeat(64), runtimeSha256: "2".repeat(64),
        receiptSha256: "3".repeat(64), repositoryFingerprint: f.repoFingerprint, planPath, planSha256, specPath, specSha256,
      },
      priorInvalidationSha256: null, designAdvisorAdmissionSha256: null,
      designWorkflowPackagePath: PACKAGE_PATH, designWorkflowPackageSha256: packageSha256,
      designWorkflowApproval: {
        schema: "pipeline.design-workflow-package-approval.v1", mode: "signature", approvedBy, approvedAt,
        packageSha256, intentSha256: verified.intentSha256, proofSha256: verified.proofSha256, proof: verified.proof,
        advisorException: verified.advisorException,
      },
    },
  };
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline.yaml"), MANIFEST_BLOCKING);
  writeFileSync(join(root, ".claude", "pipeline-state.json"), JSON.stringify(state));

  const gitCommonDir = git("rev-parse", "--path-format=absolute", "--git-common-dir");
  const storeDir = join(gitCommonDir, "agent-pipeline", "design-advisor-courses");
  const reread = () => readApprovedDesignWorkflowPackage({
    repoRoot: root, packagePath: PACKAGE_PATH, packageSha256, featureId: FEATURE_ID, planPath, planSha256, specPath, specSha256,
    readCandidate, advisorExceptionBinding: exceptionBinding,
  });
  return { root, storeDir, reread };
}

test("v7 plan approval with an Advisor-unavailable exception: devplan boundary with the private course store absent (ADR-0085 Ruling 77(c))", async (t) => {
  if (process.platform === "win32") {
    t.skip("win32: advisorHostFixture needs the linux-only codex-design-readiness-host-store (CRHS-INPUT); run via WSL: wsl.exe -e bash -lc \"cd <repo-root-in-wsl>; node --test plugins/pipeline-core/hooks/guard-devplan-design-approval-v7.test.mjs\"");
    return;
  }
  const fx = await buildLiveShapedV7Fixture(t);

  await t.test("control: live-shaped v7 record, course store present -> both lanes admit (green today)", () => {
    assert.ok(existsSync(fx.storeDir), "the fixture must hold a real private course store");
    const read = fx.reread();
    assert.equal(read.ok, true, `fixture package must re-read with the store present: ${JSON.stringify({ ok: read.ok, code: read.code })}`);
    const { direct, shell } = lanes(fx.root);
    assert.equal(direct.code, 0, `Edit lane must admit (exit 0), got ${direct.code}: ${direct.stderr}`);
    assert.equal(shell.exitCode, 0, `Bash lane must admit (exit 0), got ${shell.exitCode}: ${shell.stderr}`);
  });

  await t.test("target: the same record with the course store absent (fresh clone) -> both lanes admit (RED today)", () => {
    rmSync(fx.storeDir, { recursive: true, force: true });
    assert.equal(existsSync(fx.storeDir), false, "the private course store must be absent for this case");
    const read = fx.reread();
    const { direct, shell } = lanes(fx.root);
    const today = `package re-read today: ${JSON.stringify({ ok: read.ok, code: read.code ?? null })}`;
    assert.equal(direct.code, 0, `target (note section 17): Edit lane admits without a course store; exit ${direct.code}; ${today}; stderr: ${direct.stderr}`);
    assert.equal(shell.exitCode, 0, `target (note section 17): Bash lane admits without a course store; exit ${shell.exitCode}; ${today}; stderr: ${shell.stderr}`);
  });
});
