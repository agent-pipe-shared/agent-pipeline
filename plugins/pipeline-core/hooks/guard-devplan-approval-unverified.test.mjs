// SPDX-License-Identifier: SUL-1.0
/**
 * PO decision D117 (decision BI of backlog item denial-names-a-diagnosis-it-refuses, second half): an approved
 * feature whose approval cannot be RE-VERIFIED degrades to ONE advisory instead of blocking; a genuinely invalid
 * approval keeps blocking with its current code. "Cannot be re-verified" is deliberately narrow: a verification INPUT
 * is unavailable (today: the approved design workflow package file is missing, DWP-PACKAGE-PHYSICAL), never a mismatch.
 *
 * Both lanes are exercised against the same project: the Edit|Write hook as a process and the Bash lane
 * (GUARD-DEVPLAN-SHELL) through evaluateLifecycleReadyGuard. The advisory travels on the channel the guard already
 * uses for admission notices: exit 0 with the text on stderr.
 *
 * RED on the unchanged guard: the missing-package cases are refused (exit 2, DWP-PACKAGE-PHYSICAL) there. The negative
 * controls are green before and after, which is what shows the degradation did not widen into a bypass.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
import { sha256CanonicalJson } from "../lib/plan-spec-state-v2.mjs";
import {
  UNVERIFIABLE_APPROVAL_CODES, UNVERIFIED_APPROVAL_ADVISORY_CODE, designAdvisoryAdmission, unverifiedApprovalAdvisory,
} from "../lib/guard-devplan-policy.mjs";
import { evaluateLifecycleReadyGuard } from "./guard-lifecycle-ready.mjs";

const GUARD = fileURLToPath(new URL("./guard-devplan.mjs", import.meta.url));
const FEATURE_ID = "unverified-feature";
const PLAN_PATH = "specs/feature/prd.md";
const SPEC_PATH = "specs/feature/spec.md";
const PACKAGE_PATH = "evidence/package.json";
const PLAN_BYTES = "# PRD\n";
const SPEC_BYTES = "# Spec\n";
const PACKAGE_BYTES = '{"schema":"fixture"}\n';
const MANIFEST_BLOCKING = "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const DIRS = [];
after(() => { for (const dir of DIRS) rmSync(dir, { recursive: true, force: true }); });

function writeText(dir, rel, text) {
  const target = join(dir, ...rel.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

/** A governed git repo whose state carries a v7 approval naming PACKAGE_PATH. `variant` shapes the one thing under test. */
function fixture({ packageBytes = null, recordedPackageSha = sha256(PACKAGE_BYTES), planApproved = true, withApproval = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "guard-devplan-unverified-"));
  DIRS.push(dir);
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", timeout: 20_000 }).trim();
  git("init", "--quiet");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  const governance = createGovernanceScopeController({ hostStateRoot: join(dir, "fixture-host-state") });
  const plan = governance.planDecision({ rootDir: dir, decision: "enroll", by: "disposable-guard-fixture" });
  const active = governance.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  assert.equal(active.state, "active", "fixture enrollment must become active");
  writeText(dir, PLAN_PATH, PLAN_BYTES);
  writeText(dir, SPEC_PATH, SPEC_BYTES);
  if (packageBytes !== null) writeText(dir, PACKAGE_PATH, packageBytes);
  const submission = {
    schema: "pipeline.plan-submission.v1", featureId: FEATURE_ID, planPath: PLAN_PATH, planSha256: sha256(PLAN_BYTES),
    specPath: SPEC_PATH, specSha256: sha256(SPEC_BYTES), profile: "feature", profileSha256: "3".repeat(64),
    submittedBy: "Coordinator", submittedAt: "2026-10-22T09:00:00.000Z",
  };
  const approval = {
    schema: "pipeline.plan-approval.v7", approvedBy: "PO", approvedAt: "2026-10-22T10:00:00.000Z",
    submissionSha256: sha256CanonicalJson(submission), profileSha256: submission.profileSha256,
    poGateAuthority: {
      schema: "pipeline.po-gate-authority.v2", humanFacing: "en", sourceSha256: "1".repeat(64), runtimeSha256: "2".repeat(64),
      receiptSha256: "3".repeat(64), repositoryFingerprint: "7".repeat(64), planPath: PLAN_PATH, planSha256: submission.planSha256,
      specPath: SPEC_PATH, specSha256: submission.specSha256,
    },
    priorInvalidationSha256: null, designAdvisorAdmissionSha256: null,
    designWorkflowPackagePath: PACKAGE_PATH, designWorkflowPackageSha256: recordedPackageSha,
    designWorkflowApproval: {
      schema: "pipeline.design-workflow-package-approval.v1", mode: "chat", approvedBy: "PO", approvedAt: "2026-10-22T10:00:00.000Z",
      packageSha256: recordedPackageSha, intentSha256: null, proofSha256: null, proof: null,
    },
  };
  const state = {
    schema: "pipeline.state.v0",
    activeFeature: { id: FEATURE_ID, planPath: PLAN_PATH, phase: "implementation" },
    planApproved,
    planSubmission: submission,
    ...(withApproval ? { planApproval: approval } : {}),
  };
  writeText(dir, ".claude/pipeline.yaml", MANIFEST_BLOCKING);
  writeText(dir, ".claude/pipeline-state.json", JSON.stringify(state));
  return { dir, state, git };
}

function editLane(dir) {
  const result = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "src/foo.ts", old_string: "a", new_string: "b" } }),
    encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, timeout: 60_000,
  });
  return { code: result.status, stderr: String(result.stderr ?? "") };
}
function shellLane(dir) {
  const result = evaluateLifecycleReadyGuard(
    { tool_name: "Bash", tool_input: { command: "cp scratch/change.ts src/foo.ts" } },
    { projectDir: dir, requireProjectOnboardingReadyFn: () => ({ schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" }) },
  );
  return { code: result.exitCode, stderr: String(result.stderr ?? "") };
}
const occurrences = (text, needle) => text.split(needle).length - 1;
const LANES = [["Edit|Write hook", editLane], ["Bash lane (GUARD-DEVPLAN-SHELL)", shellLane]];

test("precondition: the missing-package fixture reaches admission and designAdvisoryAdmission still reports it as NOT authority", () => {
  const { dir, state } = fixture();
  const admission = designAdvisoryAdmission(state, dir, PLAN_PATH, SPEC_PATH);
  assert.equal(admission.ok, false);
  assert.equal(admission.code, "DWP-PACKAGE-PHYSICAL");
});

for (const [label, lane] of LANES) {
  test(`D117 ${label}: approval record present, package file missing -> allowed with ONE self-describing advisory`, () => {
    const { dir } = fixture();
    const run = lane(dir);
    assert.equal(run.code, 0, `must be allowed, got ${run.code}: ${run.stderr.slice(0, 400)}`);
    assert.equal(occurrences(run.stderr, UNVERIFIED_APPROVAL_ADVISORY_CODE), 1, `exactly one typed advisory: ${run.stderr}`);
    assert.ok(run.stderr.includes("DWP-PACKAGE-PHYSICAL"), "names the cause");
    assert.ok(run.stderr.includes(PACKAGE_PATH), "names what could not be verified");
    assert.match(run.stderr, /Nothing was verified/u);
    assert.equal(occurrences(run.stderr, "reopen-design"), 1, "names the single repair command");
    assert.ok(!run.stderr.includes("BLOCKED"), "an advisory is not a block");
  });

  test(`negative control ${label}: package present but its digest differs from the approval (tampered) -> still blocked with its own code`, () => {
    const { dir } = fixture({ packageBytes: '{"schema":"tampered"}\n' });
    const run = lane(dir);
    assert.equal(run.code, 2, `must stay blocked: ${run.stderr.slice(0, 400)}`);
    assert.ok(run.stderr.includes("DWP-APPROVAL-DIGEST-DRIFT"), run.stderr);
    assert.ok(!run.stderr.includes(UNVERIFIED_APPROVAL_ADVISORY_CODE), "no advisory on a mismatch");
  });

  test(`negative control ${label}: approval revoked (planApproved false) with the package missing -> still blocked, no advisory`, () => {
    const { dir } = fixture({ planApproved: false });
    const run = lane(dir);
    assert.equal(run.code, 2, `must stay blocked: ${run.stderr.slice(0, 400)}`);
    assert.ok(!run.stderr.includes(UNVERIFIED_APPROVAL_ADVISORY_CODE), "a revoked approval never degrades");
  });

  test(`negative control ${label}: no approval record at all -> still blocked, no advisory`, () => {
    const { dir } = fixture({ withApproval: false });
    const run = lane(dir);
    assert.equal(run.code, 2, `must stay blocked: ${run.stderr.slice(0, 400)}`);
    assert.ok(!run.stderr.includes(UNVERIFIED_APPROVAL_ADVISORY_CODE));
  });
}

test("negative control: only an unavailable verification INPUT degrades; every mismatch, wrong-signer, wrong-candidate and setup code does not", () => {
  assert.deepEqual([...UNVERIFIABLE_APPROVAL_CODES], ["DWP-PACKAGE-PHYSICAL"]);
  const state = { planApproval: { designWorkflowPackagePath: PACKAGE_PATH } };
  assert.equal(unverifiedApprovalAdvisory({ ok: false, code: "DWP-PACKAGE-PHYSICAL" }, state)?.code, UNVERIFIED_APPROVAL_ADVISORY_CODE);
  for (const code of [
    "DWP-APPROVAL-DIGEST-DRIFT", "DWP-APPROVAL-SOURCE-DRIFT", "DWP-APPROVAL-PLAN-SPEC-MISMATCH", "DWP-APPROVAL-FEATURE-MISMATCH",
    "DWP-APPROVAL-RECORD-DRIFT", "DWP-APPROVAL-INTENT-DRIFT", "DWP-BOUND-PATH-MODIFIED", "DWP-PACKAGE-SHAPE",
    "DAA-PO-APPROVAL-TRUST-MISMATCH", "DAA-PO-APPROVAL-INVALID", "DAA-PO-APPROVAL-TRUST-ANCHOR-SETUP", "DAA-PO-APPROVAL-TRUST-POLICY",
    "DAA-PO-APPROVAL-RECORD-DRIFT", "DAA-DESIGN-APPROVAL-BINDING-DRIFT", "DAA-DESIGN-SOURCE-DRIFT", "DAA-PUBLIC-UNAVAILABLE",
    "DAA-UNAVAILABLE-FINAL-APPROVAL", "DAA-PRIVATE-INVALID",
  ]) assert.equal(unverifiedApprovalAdvisory({ ok: false, code }, state), null, `${code} must keep blocking`);
  assert.equal(unverifiedApprovalAdvisory({ ok: true }, state), null);
  assert.equal(unverifiedApprovalAdvisory(undefined, state), null);
});
