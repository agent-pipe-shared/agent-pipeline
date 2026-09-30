#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * verify.mjs — THE one verify entry point of this repo (E5/QG-02, self-application E13).
 *
 * Wired as .claude/pipeline.json field `verify` (AC-G4-2, spec 2026-07-06-painkiller).
 * Runs the FULL test set of this repo (guard family, hook suites, plugin libs,
 * manifest/state/security-scan suites — suite list extended in the AP1 W-WIRE wave
 * and the retro-speed W-WIRE-2 wave (plan 2026-07-07-retro-speed),
 * plan 2026-07-07-ap1-pipeline-tuning Amendment 1, under explicit PO approval since
 * this file is TP-3-protected) and writes a machine-generated JSON evidence artifact
 * per guardrails/quality-gates.md
 * QG-03, schema `pipeline.verify-evidence.v0` (reduced scope, AC-G4-2/B-6: no
 * registry, no expiry fields — those are backlog #2, CUT).
 *
 * Manifest-gated phase steps (AP1 W-WIRE): when the project opts into the manifest
 * layer (a manifest present at its resolved authority tier — ADR-0054:
 * `project/pipeline.yaml`, else `.claude/pipeline.yaml`), two extra steps run after the suites:
 * validate-manifest (exit 2 on an invalid manifest, fail-closed once a manifest
 * EXISTS) and security-scan (adapter statuses PASS|FINDINGS|SKIPPED|ERROR; SKIPPED
 * never blocks, so machines without the scanner binaries stay green — QG-05 honesty
 * lives in the evidence artifact, not in a false red). No manifest -> step list stays
 * suites-only, so manifest-less projects keep the pre-AP1 verify shape (regression guard).
 * NOTE on how absence is detected: `resolveAuthorityArtifactPath` deliberately ALWAYS
 * returns a path — it falls back to the legacy relpath when nothing resolves, so a
 * reader is never made stricter by being routed (ADR-0054 step 1). It therefore never
 * signals absence. The manifest-less case is decided solely by the ENOENT branch below;
 * do not rewrite that branch to trust `.path` or `.exists` as the opt-out signal.
 *
 * Full chain note (QG-01/QG-02): this repo's calibration (`project/pipeline.json` at
 * the resolved tier, field `verification: "docs+tests"`) has no separate format/lint/typecheck/build
 * stage — the test suites plus the manifest-gated phase steps ARE the full chain
 * for a docs+guardrails repo. `steps[]` below therefore lists one entry per step run,
 * not the generic format/lint/typecheck/tests/build shape from the QG-03 sketch (gate
 * honesty, QG-05: this gate checks executable harness behavior plus internal
 * Markdown link/anchor and calibrated handover-authority contracts; it does not
 * judge prose semantics or fetch external URLs).
 *
 * Evidence artifact: final-boundary modes (`candidate`, `push`, `release`) write
 * `evidence/verify-latest.json`.  Development modes (`work`, `critic`) write a
 * mode-local latest slot instead, so a focused check cannot invalidate a valid
 * final-candidate proof.  Candidate and release are full-registry boundaries;
 * work and critic are impact-selected development evidence.
 *
 * Exit code: 0 iff every step exited 0; the first non-zero step's code otherwise
 * (mirrors `npm run`-style aggregation). Complete suite stdout/stderr stays in
 * owner-private bounded logs; the interactive channel receives only bounded
 * machine-readable start/terminal progress records.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAndApplyVerifyCaseCompletionAugmentations } from "./verify-case-completion-augmentation.mjs";
import { duplicateSuiteIds, loadDeclarativeVerifySuites } from "./check-verify-suite-registration.mjs";
import { UNREPLACED_MANUAL_CHECK_PLACEHOLDER, computeManualVerifyStep } from "./manual-check-logic.mjs";
import { writeVerifyEvidencePair } from "./verify-evidence-writer.mjs";
import {
  NOVA_APPROVAL_PENDING_BINDING,
  NOVA_APPROVAL_PENDING_STATUS,
  NOVA_APPROVAL_STATE_PATH,
  classifyNovaCandidateWorktree,
} from "../../plugins/pipeline-core/lib/nova-candidate-freeze.mjs";
import { resolveAuthorityArtifactPath } from "../../plugins/pipeline-core/lib/project-authority.mjs";
import { validateScopedVerifyRegistration } from "../../plugins/pipeline-core/lib/scoped-verify-registration.mjs";
import { validateWindowsAssuranceVerifyRegistration } from "../../plugins/pipeline-core/lib/windows-assurance-verify-registration.mjs";
import { createPublicVerifyRunEvidence } from "../../plugins/pipeline-core/lib/verify-resume.mjs";
import {
  buildGovernanceVerificationAction,
  buildGovernanceVerificationRetry,
  preflightGovernanceVerificationActionOutput,
  writeGovernanceVerificationAction,
} from "../../plugins/pipeline-core/lib/governance-verification-action.mjs";
import { runVerifyJournal } from "../../plugins/pipeline-core/scripts/verify-journal.mjs";
import { buildSelfVerifyGovernanceSource, parseVerifyInvocation, renderVerifyCommand, resolveSelfVerifySelection } from "./self-verify-selection.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const phase26Result = process.env.PIPELINE_PHASE26_RESULT ?? null;
const phase3Result = process.env.PIPELINE_PHASE3_RESULT ?? null;
const reviewRetryInput = process.env.PIPELINE_REVIEW_RETRY_INPUT ?? null;
const hooksDir = join(repoRoot, "plugins", "pipeline-core", "hooks");

const libDir = join(repoRoot, "plugins", "pipeline-core", "lib");
const pluginScriptsDir = join(repoRoot, "plugins", "pipeline-core", "scripts");

/** Capture one exact clean Git candidate; an unavailable Git fixture stays explicit. */
function candidateIdentity() {
  try {
    const commit = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: repoRoot });
    const tree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8", cwd: repoRoot });
    const worktree = spawnSync("git", ["status", "--porcelain=v1"], { encoding: "utf8", cwd: repoRoot });
    if (commit.status !== 0 || tree.status !== 0 || worktree.status !== 0) return { status: "unavailable", commit: null, tree: null };
    const commitId = commit.stdout.trim();
    return {
      status: classifyNovaCandidateWorktree({
        porcelain: worktree.stdout,
        headCommit: commitId,
        readHeadState: () => {
          const blob = spawnSync("git", ["show", `${commitId}:${NOVA_APPROVAL_STATE_PATH}`], { encoding: "utf8", cwd: repoRoot });
          return blob.status === 0 ? blob.stdout : null;
        },
        readWorktreeState: () => readFileSync(join(repoRoot, NOVA_APPROVAL_STATE_PATH), "utf8"),
      }),
      commit: commitId,
      tree: tree.stdout.trim(),
    };
  } catch { return { status: "unavailable", commit: null, tree: null }; }
}
function gitCommonDirectory() {
  const result = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8", cwd: repoRoot });
  if (result.status !== 0 || result.stdout.trim() === "") throw new Error("VERIFY-GIT-COMMON-DIR-UNAVAILABLE");
  return result.stdout.trim();
}
const startedCandidate = candidateIdentity();
let invocation;
try { invocation = parseVerifyInvocation(process.argv.slice(2), process.env); }
catch (error) { console.error(error.message); process.exit(2); }
const command = renderVerifyCommand(invocation);
// Evidence must always land at the PRIMARY worktree root (the parent of Git's
// common directory), never at the invoking worktree's own root: the push gate
// (guard-push.mjs's resolveEvidenceProject) only ever reads evidence from the
// primary checkout, but the prescribed clean-candidate route runs THIS script
// from the detached `.git/phx-verify` worktree -- backlog
// 2026-08-09-push-gate-reads-evidence-from-a-location-the-prescribed-verify-run-never-writes-to.md
// (PO Decision, Option B, 2026-08-18). This is deliberately narrower than
// redirecting `repoRoot` itself: `repoRoot` -- and every one of its other
// consumers, including candidateIdentity()'s dirty-check above and
// hooksDir/libDir/pluginScriptsDir below -- keeps resolving against the
// INVOKING worktree. A full `repoRoot` redirect would make the candidate
// preflight inspect the PRIMARY worktree instead, which is permanently dirty
// by this repo's own convention, and would fail the prescribed route forever.
const primaryRoot = dirname(gitCommonDirectory());
const evidenceDir = join(primaryRoot, "evidence");
const finalEvidenceMode = new Set(["candidate", "push", "release"]).has(invocation.mode);
const evidencePath = join(evidenceDir, finalEvidenceMode ? "verify-latest.json" : `verify-${invocation.mode}-latest.json`);
const runId = `verify-${Date.now()}-${randomBytes(8).toString("hex")}`;
const runEvidencePath = join(evidenceDir, `${runId}.json`);
const verifyStartedAt = new Date().toISOString();
let verificationActionPlan = null;
if (invocation.eventOutPath !== null) {
  if (startedCandidate.status !== "clean" && startedCandidate.status !== NOVA_APPROVAL_PENDING_STATUS) {
    console.error("VERIFY-ACTION-PREFLIGHT: an action event requires an exact stable candidate before source execution.");
    process.exit(2);
  }
  try {
    verificationActionPlan = preflightGovernanceVerificationActionOutput({ rootDir: primaryRoot, eventOutPath: invocation.eventOutPath });
    for (const sourcePath of [evidencePath, runEvidencePath]) {
      if (verificationActionPlan.target === sourcePath
        || verificationActionPlan.target.startsWith(`${sourcePath}${sep}`)
        || sourcePath.startsWith(`${verificationActionPlan.target}${sep}`)) throw new Error("VERIFY-ACTION-PATH-COLLISION");
    }
  } catch (error) {
    console.error(`VERIFY-ACTION-PREFLIGHT: ${error?.code ?? error?.message ?? "unavailable"}`);
    process.exit(2);
  }
}
function writeEvidence(evidence, phase) {
  writeVerifyEvidencePair({
    runPath: runEvidencePath,
    latestPath: evidencePath,
    value: evidence,
    phase,
  });
}
// Invalidate an older result before any suite can begin.  If this process is
// killed, crashes, or loses its host while a suite is running, a later reader
// sees this red record instead of accidentally trusting prior-candidate proof.
writeEvidence({
  schema: "pipeline.verify-evidence.v0",
  project: "agent-pipeline",
  command,
  commit: startedCandidate.commit ?? "unknown",
  tree: startedCandidate.tree ?? "unknown",
  candidate: { start: startedCandidate, finish: null, binding: "running" },
  startedAt: verifyStartedAt,
  finishedAt: null,
  steps: [{ name: "verify-running", exitCode: 1 }],
  verifyRun: null,
  exitCode: 1,
}, "running");
const SCOPED_VERIFY_SUITES = Object.freeze([
  Object.freeze({
    name: "scoped-verify-registration-tests",
    file: "plugins/pipeline-core/lib/scoped-verify-registration.test.mjs",
  }),
  Object.freeze({
    name: "workflow-preflight-tests",
    file: "plugins/pipeline-core/lib/workflow-preflight.test.mjs",
  }),
  Object.freeze({
    name: "interaction-continuity-tests",
    file: "plugins/pipeline-core/lib/interaction-continuity.test.mjs",
  }),
]);
const SCOPED_VERIFY_REGISTRATION = Object.freeze({
  schema: "pipeline.scoped-verify-registration.v1",
  taskId: "pipeline.verify-gate-scoped-registration",
  authority: Object.freeze({
    prd: Object.freeze({
      path: "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md",
      sha256: "d341affed12a7894bb70c86b3e229c8f78c12b013383ed41253cb084690a3d0f",
    }),
  }),
  suites: SCOPED_VERIFY_SUITES,
});
const WINDOWS_ASSURANCE_VERIFY_SUITES = Object.freeze([
  Object.freeze({
    name: "trusted-tool-resolution-tests",
    file: "plugins/pipeline-core/lib/trusted-tool-resolution.test.mjs",
  }),
  Object.freeze({
    name: "advisory-receipt-assurance-tests",
    file: "plugins/pipeline-core/lib/advisory-receipt-assurance.test.mjs",
  }),
  Object.freeze({
    name: "toolchain-preflight-tests",
    file: "plugins/pipeline-core/scripts/toolchain-preflight.test.mjs",
  }),
]);
const WINDOWS_ASSURANCE_VERIFY_REGISTRATION = Object.freeze({
  schema: "pipeline.windows-assurance-verify-registration.v1",
  taskId: "pipeline.windows-assurance-verify-binding",
  authority: Object.freeze({
    matrix: Object.freeze({
      path: "specs/2026-07-19-sprint-sentinel-epic/windows-trusted-tool-resolution-ac-matrix.md",
      sha256: "0b1a6c9256b7a517e95f401d6d86a75e5ce6d6ff87a61ded012ec7e672cf3a2e",
    }),
  }),
  suites: WINDOWS_ASSURANCE_VERIFY_SUITES,
});

const TEST_SUITES = [
  { name: "setup-tests", file: join(repoRoot, "setup.test.mjs") },
  { name: "enforcement-conformance-tests", file: join(pluginScriptsDir, "enforcement-conformance.test.mjs") },
  { name: "control-placement-tests", file: join(pluginScriptsDir, "control-placement.test.mjs") },
  { name: "interruption-receipts-tests", file: join(libDir, "interruption-receipts.test.mjs") },
  { name: "routing-projection-tests", file: join(pluginScriptsDir, "check-routing-projections.test.mjs") },
  { name: "routing-projection-check", file: join(pluginScriptsDir, "check-routing-projections.mjs") },
  { name: "route-receipt-tests", file: join(libDir, "route-receipt.test.mjs") },
  { name: "recovery-preview-attestation-tests", file: join(libDir, "recovery-preview-attestation.test.mjs") },
  { name: "repository-path-identity-tests", file: join(libDir, "repository-path-identity.test.mjs") },
  { name: "artifact-lifecycle-tests", file: join(pluginScriptsDir, "check-artifact-lifecycle.test.mjs") },
  { name: "artifact-lifecycle-check", file: join(pluginScriptsDir, "check-artifact-lifecycle.mjs") },
  { name: "artifact-topology-tests", file: join(pluginScriptsDir, "check-artifact-topology.test.mjs") },
  { name: "artifact-topology-check", file: join(pluginScriptsDir, "check-artifact-topology.mjs") },
  { name: "afk-ledger-tests", file: join(libDir, "afk-ledger.test.mjs") },
  { name: "state-budget-tests", file: join(pluginScriptsDir, "check-state-budgets.test.mjs") },
  { name: "state-budget-check", file: join(pluginScriptsDir, "check-state-budgets.mjs") },
  { name: "repository-freshness-tests", file: join(pluginScriptsDir, "repository-freshness.test.mjs") },
  { name: "ruleset-freshness-tests", file: join(pluginScriptsDir, "ruleset-freshness.test.mjs") },
  { name: "pipeline-update-channel-tests", file: join(pluginScriptsDir, "pipeline-update-channel.test.mjs") },
  { name: "bootstrap-env-check-tests", file: join(pluginScriptsDir, "bootstrap-env-check.test.mjs") },
  { name: "critic-bare-tests", file: join(pluginScriptsDir, "critic-bare.test.mjs") },
  { name: "codex-critic-host-tests", file: join(pluginScriptsDir, "codex-critic-host.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 135 }, (_, index) => `CCH${String(index + 1).padStart(3, "0")}`), maxBytes: 65_536 } },
  { name: "codex-native-critic-host-tests", file: join(pluginScriptsDir, "codex-native-critic-host.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 8 }, (_, index) => `NCH${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "codex-critic-isolation-tests", file: join(pluginScriptsDir, "codex-critic-isolation.test.mjs") },
  { name: "codex-isolated-critic-contract-tests", file: join(pluginScriptsDir, "codex-isolated-critic-contract.test.mjs") },
  { name: "claude-critic-host-tests", file: join(pluginScriptsDir, "critic-claude-host.test.mjs") },
  { name: "continuity-host-adapter-tests", file: join(libDir, "continuity-host-adapter.test.mjs") },
  { name: "continuity-result-bootstrap-tests", file: join(pluginScriptsDir, "pipeline-state-result-bootstrap.test.mjs") },
  { name: "continuity-result-close-tests", file: join(pluginScriptsDir, "pipeline-state-result-close.test.mjs") },
  { name: "continuity-result-rebind-tests", file: join(pluginScriptsDir, "pipeline-state-result-rebind.test.mjs") },
  { name: "continuity-result-case-migration-tests", file: join(pluginScriptsDir, "pipeline-state-result-case-migration.test.mjs") },
  { name: "continuity-state-tests", file: join(libDir, "continuity-state.test.mjs") },
  { name: "main-session-route-tests", file: join(libDir, "main-session-route.test.mjs") },
  { name: "model-role-session-tests", file: join(libDir, "model-role-session.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 39 }, (_, index) => `MRS${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "model-role-dispatch-tests", file: join(libDir, "model-role-dispatch.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 3 }, (_, index) => `MRD${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "model-role-dispatch-select-tests", file: join(pluginScriptsDir, "model-role-dispatch-select.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: ["MDS01", "MDS02", "MDS03", "MDS04", "MDS05", "MDS06", "MDS07"], maxBytes: 65_536 } },
  { name: "model-role-approved-policy-tests", file: join(libDir, "model-role-approved-policy.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 5 }, (_, index) => `MRP${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "model-role-bootstrap-tests", file: join(pluginScriptsDir, "model-role-bootstrap.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 16 }, (_, index) => `MRB${String(index + 1).padStart(2, "0")}`), maxBytes: 131_072 } },
  { name: "model-role-host-observations-tests", file: join(libDir, "model-role-host-observations.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 7 }, (_, index) => `MRO${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "model-role-host-identity-tests", file: join(libDir, "model-role-host-identity.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 3 }, (_, index) => `MRI${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "model-role-host-session-tests", file: join(libDir, "model-role-host-session.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 4 }, (_, index) => `MRH${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "model-role-host-store-tests", file: join(libDir, "model-role-host-store.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: ["MRSR01", "MRSR02", "MRSR03", "MRSR04", "MRSR05"], maxBytes: 65_536 } },
  { name: "model-role-v3-baseline-tests", file: join(libDir, "model-role-v3-baseline.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: ["MVB01", "MVB02", "MVB03", "MVB04"], maxBytes: 65_536 } },
  { name: "agy-final-return-tests", file: join(libDir, "agy-final-return.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 16 }, (_, index) => `AFR${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "agy-host-commit-admission-tests", file: join(libDir, "agy-host-commit-admission.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 6 }, (_, index) => `AHC${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "agy-host-commit-execution-tests", file: join(libDir, "agy-host-commit-execution.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 13 }, (_, index) => `AHE${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "wsl-ipc-compatibility-tests", file: join(libDir, "wsl-ipc-compatibility.test.mjs") },
  { name: "session-power-core-tests", file: join(libDir, "session-power.test.mjs") },
  { name: "session-power-controller-tests", file: join(pluginScriptsDir, "session-power-controller.test.mjs") },
  { name: "session-power-cli-tests", file: join(pluginScriptsDir, "session-power.test.mjs") },
  { name: "session-cleanup-power-tests", file: join(pluginScriptsDir, "session-cleanup-power.test.mjs") },
  { name: "session-cleanup-binding-tests", file: join(pluginScriptsDir, "session-cleanup-binding.test.mjs") },
  { name: "human-guard-override-tests", file: join(libDir, "human-guard-override.test.mjs") },
  { name: "guard-maintenance-window-tests", file: join(libDir, "guard-maintenance-window.test.mjs") },
  { name: "guard-maintenance-window-cli-tests", file: join(pluginScriptsDir, "guard-maintenance-window.test.mjs") },
  { name: "review-economy-tests", file: join(libDir, "review-economy.test.mjs") },
  { name: "guard-git-tests", file: join(hooksDir, "guard-git.test.mjs") },
  { name: "guard-apply-patch-tests", file: join(hooksDir, "guard-apply-patch.test.mjs") },
  { name: "guard-testpath-tests", file: join(hooksDir, "guard-testpath.test.mjs") },
  { name: "staleness-check-tests", file: join(hooksDir, "staleness-check.test.mjs") },
  { name: "guard-devplan-tests", file: join(hooksDir, "guard-devplan.test.mjs") },
  { name: "guard-lifecycle-ready-tests", file: join(hooksDir, "guard-lifecycle-ready.test.mjs") },
  { name: "lifecycle-denial-loop-tests", file: join(libDir, "lifecycle-denial-loop.test.mjs"), caseCompletion: {schema:"pipeline.verify-case-completion-policy.v1",caseIds:["RC16C001","RC16C002","RC16C003","RC16C004","RC16C005","RC16C006","RC16C007","RC16C008","RC16C009","RC16C010","RC16C011","RC16C012","RC16C013","RC16C014","RC16C015","RC16C016","RC16C017","RC16C018","RC16C019","RC16C020"],maxBytes:65536} },
  { name: "lifecycle-denial-loop-guard-tests", file: join(hooksDir, "lifecycle-denial-loop-guard.test.mjs"), caseCompletion: {schema:"pipeline.verify-case-completion-policy.v1",caseIds:["RC04C001","RC04C002","RC04C003","RC04C004","RC04C005"],maxBytes:65536} },
  { name: "pipeline-state-revocation-tests", file: join(pluginScriptsDir, "pipeline-state-revocation.test.mjs") },
  { name: "pipeline-state-rebind-runner-tests", file: join(pluginScriptsDir, "pipeline-state-rebind-runner.test.mjs") },
  { name: "codex-pretool-guard-tests", file: join(hooksDir, "codex-pretool-guard.test.mjs") },
  { name: "codex-session-start-hint-tests", file: join(hooksDir, "codex-session-start-hint.test.mjs") },
  { name: "guard-push-tests", file: join(hooksDir, "guard-push.test.mjs") },
  { name: "guard-push-architecture-tests", file: join(hooksDir, "guard-push-architecture.test.mjs") },
  { name: "guard-push-v2-tests", file: join(hooksDir, "guard-push-v2.test.mjs") },
  { name: "guard-push-attestation-diagnostics-tests", file: join(hooksDir, "guard-push-attestation-diagnostics.test.mjs") },
  { name: "push-destination-policy-tests", file: join(libDir, "push-destination-policy.test.mjs") },
  { name: "architecture-push-currency-tests", file: join(libDir, "architecture-push-currency.test.mjs") },
  { name: "checkpoint-push-audit-tests", file: join(libDir, "checkpoint-push-audit.test.mjs") },
  { name: "stop-suggest-tests", file: join(hooksDir, "stop-suggest.test.mjs") },
  { name: "close-coordinator-tests", file: join(pluginScriptsDir, "close-coordinator.test.mjs") },
  { name: "post-compact-reground-tests", file: join(hooksDir, "post-compact-reground.test.mjs") },
  { name: "setup-check-tests", file: join(hooksDir, "setup-check.test.mjs") },
  { name: "statusline-context-tests", file: join(pluginScriptsDir, "statusline-context.test.mjs") },
  { name: "yaml-lite-tests", file: join(libDir, "yaml-lite.test.mjs") },
  { name: "schema-lite-tests", file: join(libDir, "schema-lite.test.mjs") },
  { name: "runner-profiles-v2-tests", file: join(libDir, "runner-profiles-v2.test.mjs") },
  { name: "runtime-projection-v2-tests", file: join(libDir, "runtime-projection-v2.test.mjs") },
  { name: "runner-profile-migration-v2-tests", file: join(libDir, "runner-profile-migration-v2.test.mjs") },
  { name: "runner-profiles-v3-tests", file: join(libDir, "runner-profiles-v3.test.mjs") },
  { name: "runtime-projection-v3-tests", file: join(libDir, "runtime-projection-v3.test.mjs") },
  { name: "runner-profile-migration-v3-tests", file: join(libDir, "runner-profile-migration-v3.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 54 }, (_, index) => `RPM${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "project-onboarding-v3-tests", file: join(libDir, "project-onboarding-v3.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: ["POV-00ddbc796e449f17", "POV-01ee71f24ad67847", "POV-0276da1cde1564c2", "POV-02912c387210350a", "POV-0373d32f758e8d31", "POV-04032a9983c9fe4a", "POV-04e6debab7d9a4be", "POV-055eafcff81b4dda", "POV-0715659135c026ec", "POV-07da0944b1ec0b4f", "POV-083a78a2f3946112", "POV-0a141e159c01479b", "POV-0b661179261503d9", "POV-0bb33608193d0b98", "POV-0e6ddd160ede7621", "POV-107ff4bc450f915d", "POV-10f53050fa82bf9a", "POV-135b7d1c7e591883", "POV-185af79f7d57db60", "POV-1920850a60927347", "POV-1936d59b5229accd", "POV-1985a2667aaa448d", "POV-1993715936636004", "POV-19b8d135db3ea311", "POV-1bc3c1178af90243", "POV-1bfb0a42d218c5cf", "POV-1c65985138083f00", "POV-1d5f3d0abc2a287e", "POV-1fd81ac84c6d02c5", "POV-20a3806d9e40d456", "POV-20ab90fb3038caaf", "POV-20d7cc958baf563a", "POV-2122e04615a2a64c", "POV-2192591f669166e1", "POV-21db7c1b992e9c90", "POV-227afe4e773338a8", "POV-236fff164061d288", "POV-23b0b044ffc59d2e", "POV-2480d183b7d56199", "POV-25efe9be5c4012b9", "POV-26420bf85a7d4fc5", "POV-26a1dcd3f0584b6a", "POV-272dc682918eb418", "POV-274390584d8de067", "POV-2775339dd0f57625", "POV-27d398facc5fee7f", "POV-2a90d7b2376554f8", "POV-2c857f07be4d6f2b", "POV-2f1698bde7c199dd", "POV-2f32a4164bd5122a", "POV-31a467df40d91682", "POV-327106f4fb615499", "POV-331992dad7988cf6", "POV-35e8c78d54ee4321", "POV-36eb348cf28c5158", "POV-37e46d6edf6bf272", "POV-388da32fad62ad9c", "POV-39c338e79243591d", "POV-39dff492daff6a96", "POV-3b1d68d331feee57", "POV-3b5e8d9cac28d3c1", "POV-3e71bffbb1014642", "POV-40031932c7d8be71", "POV-40aa964462eeba1d", "POV-40df3488697a411d", "POV-4130c4ce7167bd02", "POV-420b1e3b0d9c44a6", "POV-42887e4088661553", "POV-42dd4f3d224029cc", "POV-437a6ff66e05f1e0", "POV-460a76837e7b5ec0", "POV-465c717cde41215f", "POV-496312c00ceefb08", "POV-4aef2c78ffbc85a9", "POV-4c55c2f7de51781c", "POV-4dc69d8296d0df85", "POV-4e74c13b2543e050", "POV-4e8f0cbb5bac9cd1", "POV-4ea3045119660272", "POV-4f50f1b7e1d6bf0e", "POV-51e8335012ea9e8c", "POV-53268324b257a6f9", "POV-55c5de9e1f917d14", "POV-5786f961395b4d14", "POV-59771443076a7e6f", "POV-59e8dca80e532033", "POV-5ad747f219cca159", "POV-5c3343a07429c542", "POV-5e9a1b911133e313", "POV-610806ff5f007007", "POV-618f937930e9476f", "POV-61efa600e0f4b8d4", "POV-64a98eb9c326189d", "POV-64fcac60ee4626fa", "POV-66e49da101f15ade", "POV-68560f1c9516707f", "POV-693de860360f354d", "POV-6b31952e1741596c", "POV-6bc13949b2b629e3", "POV-6dcfdc87a1602815", "POV-6edec87c2101a040", "POV-6f1560272250337d", "POV-72603af2fccea9c9", "POV-7373b000a289a43c", "POV-74508137addc92c8", "POV-746a0936efae16d2", "POV-74a0efd0bbb3aa6c", "POV-74e8aa112d26f055", "POV-750a22b103cbd861", "POV-753466dc869f6ee5", "POV-77f707b8547e50a5", "POV-785de9cd0d3d9bd7", "POV-787734883cd0ec98", "POV-79cf7aa27d4d6b6e", "POV-7af7a985ae76440c", "POV-7c48d18e69827af7", "POV-7cf6b3882bc5174b", "POV-7e14b5d37548d7d7", "POV-81b42c7101b78049", "POV-81ececc626bbbf3a", "POV-846df0423c7f95eb", "POV-875092a78e50a194", "POV-881eb0bacd823364", "POV-8c3467e290e07c55", "POV-8ca8f5fdd2a0a77d", "POV-8d3cbe84bd17ce5c", "POV-8d4dcf31f411b761", "POV-942c4ec49421949b", "POV-97a918937f9e098d", "POV-9a0f4a638e4c9c9a", "POV-9a3d108daa8941ec", "POV-9a79d587ee12a898", "POV-9b276f2255197696", "POV-9ef63a6f5a2e1064", "POV-9f3c2272d6bcaa9b", "POV-a1b4e0eaf478a708", "POV-a2b2cf71bfa9a02b", "POV-a4d45fdfb2521d93", "POV-a59cef7de0904395", "POV-a79a3836be6e951d", "POV-a90c7844592b6f26", "POV-ac9bb43fea5d43d5", "POV-ad5a1c5426775a32", "POV-ad675b3ae5319535", "POV-ae3963a33e9df5ad", "POV-b039c9431f677416", "POV-b0b71e067d2c084e", "POV-b0d2179eb68bb6ad", "POV-b25c62308a31b3fe", "POV-b47ad8994c4f308c", "POV-b4965efe00ba3fb9", "POV-b7e0593579d4dbe9", "POV-b8f4cb642d646067", "POV-ba8863a0ac82adbe", "POV-bc426c016d0302a8", "POV-bcea98ff28388145", "POV-bdac72aca0ec56ec", "POV-bdfd72d46b09668d", "POV-c40f6a54a3065b3d", "POV-c6bb046e9ce1e375", "POV-ca4c6a07de50be54", "POV-cb076d6a3c92ced1", "POV-cc168d91c7bd5c5d", "POV-cc229033b370d574", "POV-ccbe2c297d490d7b", "POV-cff5c8cd6982470e", "POV-d05cdcb0d2b2217b", "POV-d1a15155eb153871", "POV-d1f08fbcf7f4cad0", "POV-d308d8473a11c9ed", "POV-d563f040762882e5", "POV-d5778f82678f8fcc", "POV-d7250b2b95e730fa", "POV-d85a6fea3e10b5e7", "POV-d8eb6777746d881c", "POV-d998ddbfe1c3b412", "POV-d9b8a46a728c8800", "POV-dc481f4808ca173c", "POV-dc813e6f97dbfa35", "POV-dd5a32f014d6f6ad", "POV-dd635fa29ad729e9", "POV-dffae61eec0c7881", "POV-e1cf2fd3e8682c5a", "POV-e26dbbe8e7bf8062", "POV-e3b1deb6f648b10d", "POV-e3eaffaa27941341", "POV-e51e66f758c096b3", "POV-e534ee76e0ede4ce", "POV-e67d403f0a1de295", "POV-e68ae592fbfeb492", "POV-e7c3b37e6e29c20c", "POV-e8b019f7f76b281a", "POV-e8c9af39808c1133", "POV-ebc68a0a2fce3057", "POV-ebebd3c77f67c772", "POV-ebf73112679cb62f", "POV-ebfe7ed51688a952", "POV-ec30cc79fa6df70b", "POV-ec3b6c2b31b38111", "POV-ef1eb4827109991c", "POV-ef59d4494680d112", "POV-ef98e543a3684587", "POV-f0f2f735f2910b87", "POV-f2cfb72587803df2", "POV-f37e711f591b74ff", "POV-f452dd1e7c4436f9", "POV-f5900571b26c339b", "POV-f5b7719b5ea3a938", "POV-f60f94ad91f95677", "POV-f8ffc2fbd9030218", "POV-f96a801753a9e357", "POV-fa4b7e199dde24a1", "POV-fc4d55a6719443b5", "POV-fc4ed152ab2d5f3b", "POV-fd0099aa72e63783", "POV-fe2dfb26586ebb38"], maxBytes: 65536 } },
  { name: "onboarding-first-restart-intake-tests", file: join(libDir, "onboarding-first-restart-intake.test.mjs"), caseCompletion: {schema:"pipeline.verify-case-completion-policy.v1",caseIds:["RC17C001","RC17C002","RC17C003","RC17C004","RC17C005","RC17C006","RC17C007"],maxBytes:65536} },
  { name: "project-onboarding-ready-gate-tests", file: join(libDir, "project-onboarding-ready-gate.test.mjs") },
  { name: "codex-onboarding-runtime-tests", file: join(libDir, "codex-onboarding-runtime.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: ["COR001","COR002","COR003","COR004","COR005","COR006","COR007","COR008","COR009","COR010","COR011","COR012","COR013","COR014","COR015","COR016","COR017","COR018","COR019","COR020","COR021","COR022","COR023","COR024"], maxBytes: 65536 } },
  { name: "codex-onboarding-capabilities-tests", file: join(libDir, "codex-onboarding-capabilities.test.mjs") },
  { name: "onboarding-continuity-tests", file: join(libDir, "onboarding-continuity.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 298 }, (_, index) => `OBC${String(index + 1).padStart(3, "0")}`), maxBytes: 65_536 } },
  { name: "codex-onboarding-app-server-tests", file: join(libDir, "codex-onboarding-app-server.test.mjs") },
  { name: "v3-bootstrap-authority-tests", file: join(pluginScriptsDir, "v3-bootstrap-authority.test.mjs") },
  { name: "project-onboarding-e2e-tests", file: join(pluginScriptsDir, "project-onboarding-e2e.test.mjs") },
  // ADR-0051/ADR-0057 R1: walks the consumer chain executing each returned action
  // verbatim, which is how the identity substitution was found in the first place.
  { name: "onboarding-runner-identity-tests", file: join(pluginScriptsDir, "onboarding-runner-identity.test.mjs") },
  { name: "project-authority-tests", file: join(libDir, "project-authority.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 36 }, (_, index) => `PAT${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "project-authority-migration-cli-tests", file: join(pluginScriptsDir, "project-authority-migration.test.mjs") },
  { name: "feature-package-topology-tests", file: join(libDir, "feature-package-topology.test.mjs") },
  { name: "human-role-label-tests", file: join(libDir, "human-role-labels.test.mjs") },
  { name: "human-role-rendering-tests", file: join(libDir, "human-role-rendering.test.mjs") },
  { name: "advisory-receipt-tests", file: join(libDir, "advisory-receipt.test.mjs") },
  { name: "advisory-lifecycle-v2-tests", file: join(libDir, "advisory-lifecycle-v2.test.mjs") },
  { name: "codex-host-process-journal-tests", file: join(libDir, "codex-host-process-journal.test.mjs") },
  { name: "advisory-coordinator-tests", file: join(libDir, "advisory-coordinator.test.mjs") },
  { name: "advisory-decision-event-tests", file: join(libDir, "advisory-decision-event.test.mjs") },
  { name: "critic-export-policy-tests", file: join(libDir, "critic-export-policy.test.mjs") },
  { name: "advisory-host-bridge-tests", file: join(pluginScriptsDir, "advisory-host-bridge.test.mjs") },
  { name: "codex-sandbox-preflight-tests", file: join(scriptDir, "codex-sandbox-preflight.test.mjs") },
  { name: "codex-sandbox-compatibility-tests", file: join(libDir, "codex-sandbox-compatibility.test.mjs") },
  { name: "codex-sandbox-select-tests", file: join(pluginScriptsDir, "codex-sandbox-select.test.mjs") },
  { name: "codex-sandbox-runtime-tests", file: join(pluginScriptsDir, "codex-sandbox-runtime.test.mjs") },
  { name: "codex-app-server-health-tests", file: join(pluginScriptsDir, "codex-app-server-health.test.mjs") },
  { name: "codex-advisory-app-server-tests", file: join(pluginScriptsDir, "codex-advisory-app-server.test.mjs") },
  { name: "codex-advisory-bootstrap-tests", file: join(pluginScriptsDir, "codex-advisory-bootstrap.test.mjs") },
  { name: "advisor-capability-preflight-tests", file: join(pluginScriptsDir, "advisor-capability-preflight.test.mjs") },
  { name: "codex-host-advisor-route-tests", file: join(pluginScriptsDir, "codex-host-advisor-route.test.mjs") },
  { name: "codex-host-repository-init-tests", file: join(pluginScriptsDir, "codex-host-repository-init.test.mjs") },
  { name: "host-advisor-status-tests", file: join(libDir, "host-advisor-status.test.mjs") },
  { name: "host-advisor-workspace-tests", file: join(pluginScriptsDir, "host-advisor-workspace.test.mjs") },
  { name: "codex-plugin-validator-parity-tests", file: join(pluginScriptsDir, "codex-plugin-validator-parity.test.mjs") },
  { name: "worktree-lifecycle-tests", file: join(libDir, "worktree-lifecycle.test.mjs") },
  { name: "lifecycle-ready-enforcement-tests", file: join(pluginScriptsDir, "lifecycle-ready-enforcement.test.mjs") },
  // Walks the gate: mandatory AND satisfiable, for both runners. Unit suites were
  // green while the gate was unwired on Claude and its own remediation was refused.
  { name: "lifecycle-gate-satisfiability-tests", file: join(hooksDir, "lifecycle-gate-satisfiability.test.mjs") },
  // An agent that can weaken the gate authorizing its own actions has no gate.
  { name: "gate-strength-guard-tests", file: join(hooksDir, "guard-gate-strength.test.mjs") },
  // ...and a guard that never runs is not a guard either. Executes the wired hooks and
  // the bootstrap chain through a real symlink -- the layout that silently disarmed six
  // of them, exiting 0 with no output, which for a PreToolUse guard means ALLOW.
  { name: "entrypoint-reachability-tests", file: join(libDir, "entrypoint.test.mjs") },
  // A write-capable tool that no matcher names is not gated at all: NotebookEdit reached
  // none of the four write guards, and they read file_path while it supplies notebook_path.
  { name: "notebook-write-coverage-tests", file: join(hooksDir, "notebook-write-coverage.test.mjs") },
  // The audited escape hatch for guard-testpath. Its own suite is TP-2 protected, so the
  // override's checks live in a separate file; the safety half is what is gated here.
  { name: "guard-testpath-override-tests", file: join(hooksDir, "guard-testpath-override.test.mjs") },
  { name: "guard-dispatch-tests", file: join(hooksDir, "guard-dispatch.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 43 }, (_, index) => `GD${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "guard-slicing-tests", file: join(hooksDir, "guard-slicing.test.mjs") },
  { name: "advisor-consult-v3-tests", file: join(repoRoot, "plugins", "pipeline-core", "skills", "advisor-consult", "advisor-consult-v3.test.mjs") },
  { name: "sandboxed-readonly-duty-tests", file: join(libDir, "sandboxed-readonly-duty.test.mjs") },
  { name: "sandboxed-readonly-host-bridge-tests", file: join(pluginScriptsDir, "sandboxed-readonly-host-bridge.test.mjs") },
  { name: "spec-readiness-host-tests", file: join(pluginScriptsDir, "spec-readiness-host.test.mjs") },
  { name: "codex-readiness-app-server-tests", file: join(pluginScriptsDir, "codex-readiness-app-server.test.mjs") },
  { name: "codex-design-readiness-host-tests", file: join(pluginScriptsDir, "codex-design-readiness-host.test.mjs") },
  { name: "codex-design-readiness-bootstrap-tests", file: join(pluginScriptsDir, "codex-design-readiness-bootstrap.test.mjs") },
  { name: "runner-design-readiness-bootstrap-tests", file: join(pluginScriptsDir, "runner-design-readiness-bootstrap.test.mjs") },
  { name: "design-readiness-host-evidence-tests", file: join(libDir, "design-readiness-host-evidence.test.mjs") },
  { name: "physical-scratch-boundary-tests", file: join(libDir, "physical-scratch-boundary.test.mjs"), caseCompletion: {schema:"pipeline.verify-case-completion-policy.v1",caseIds:["RC18C001","RC18C002","RC18C003","RC18C004","RC18C005","RC18C006","RC18C007"],maxBytes:65536} },
  { name: "codex-design-readiness-host-store-tests", file: join(libDir, "codex-design-readiness-host-store.test.mjs") },
  { name: "codex-readiness-finalization-tests", file: join(libDir, "codex-readiness-finalization.test.mjs") },
  { name: "codex-readiness-shared-parent-tests", file: join(libDir, "codex-design-readiness-host-store.shared-parent.test.mjs") },
  { name: "codex-tool-free-design-readiness-tests", file: join(libDir, "codex-tool-free-design-readiness.test.mjs") },
  { name: "codex-host-output-custody-tests", file: join(libDir, "codex-host-output-custody.test.mjs") },
  { name: "design-readiness-runner-host-store-tests", file: join(libDir, "design-readiness-runner-host-store.test.mjs") },
  { name: "pipeline-start-v3-tests", file: join(repoRoot, "plugins", "pipeline-core", "skills", "pipeline-start", "pipeline-start-v3.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 7 }, (_, index) => `PSV${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "pipeline-start-preflight-tests", file: join(pluginScriptsDir, "pipeline-start-preflight.test.mjs") },
  { name: "runner-usage-v1-tests", file: join(libDir, "runner-usage-v1.test.mjs") },
  { name: "p3b-runner-conformance-tests", file: join(libDir, "p3b-runner-conformance.test.mjs") },
  { name: "git-cmd-tests", file: join(libDir, "git-cmd.test.mjs") },
  { name: "workflow-writer-preflight-tests", file: join(libDir, "workflow-writer-preflight.test.mjs") },
  { name: "workflow-runner-boundary-tests", file: join(libDir, "workflow-runner-boundary.test.mjs") },
  { name: "control-execution-exchange-tests", file: join(libDir, "control-execution-exchange.test.mjs") },
  { name: "security-policy-resolver-tests", file: join(libDir, "security-policy-resolver.test.mjs") },
  { name: "control-catalog-schema-tests", file: join(libDir, "control-catalog-schema.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 33 }, (_, index) => `CCS${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "control-evaluation-receipt-tests", file: join(libDir, "control-evaluation-receipt.test.mjs") },
  { name: "control-waiver-lifecycle-tests", file: join(libDir, "control-waiver-lifecycle.test.mjs") },
  { name: "control-catalog-drift-tests", file: join(libDir, "control-catalog-drift.test.mjs") },
  { name: "provenance-attestation-tests", file: join(libDir, "provenance-attestation.test.mjs") },
  { name: "provenance-envelope-tests", file: join(libDir, "provenance-envelope.test.mjs") },
  { name: "provenance-fixture-matrix-tests", file: join(libDir, "provenance-fixture-matrix.test.mjs") },
  { name: "provenance-local-builder-tests", file: join(libDir, "provenance-local-builder.test.mjs") },
  { name: "security-evidence-fixture-matrix-tests", file: join(libDir, "security-evidence-fixture-matrix.test.mjs") },
  { name: "security-evidence-evaluator-tests", file: join(libDir, "security-evidence-evaluator.test.mjs") },
  { name: "ai-assisted-hardening-tests", file: join(libDir, "ai-assisted-hardening.test.mjs") },
  { name: "finding-lifecycle-tests", file: join(libDir, "finding-lifecycle.test.mjs") },
  { name: "security-readiness-tests", file: join(libDir, "security-readiness.test.mjs") },
  { name: "stack-adapter-contract-tests", file: join(libDir, "stack-adapter-contract.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 23 }, (_, index) => `SAC${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "stack-dynamic-boundary-tests", file: join(libDir, "stack-dynamic-boundary.test.mjs") },
  { name: "stack-fuzz-replay-tests", file: join(libDir, "stack-fuzz-replay.test.mjs") },
  { name: "stack-discovery-tests", file: join(libDir, "stack-discovery.test.mjs") },
  { name: "stack-run-outcome-tests", file: join(libDir, "stack-run-outcome.test.mjs") },
  { name: "threat-model-discovery-tests", file: join(libDir, "threat-model-discovery.test.mjs") },
  { name: "threat-model-fixture-matrix-tests", file: join(libDir, "threat-model-fixture-matrix.test.mjs") },
  { name: "threat-model-tests", file: join(libDir, "threat-model.test.mjs") },
  { name: "po-approval-proof-tests", file: join(libDir, "po-approval-proof.test.mjs") },
  { name: "critical-human-proof-policy-tests", file: join(libDir, "critical-human-proof-policy.test.mjs") },
  { name: "trust-anchor-bootstrap-circularity-repro-tests", file: join(libDir, "trust-anchor-bootstrap-circularity.repro.test.mjs") },
  // Registered in the same commit that created them. An unregistered suite is not a test
  // Verify forgot to run -- it is a test that protects nothing, and the gap is invisible
  // precisely because the file exists and passes when run by hand.
  { name: "critical-action-authorization-tests", file: join(libDir, "critical-action-authorization.test.mjs") },
  { name: "commit-message-policy-tests", file: join(libDir, "commit-message-policy.test.mjs") },
  { name: "dispatch-budget-core-tests", file: join(libDir, "dispatch-budget-core.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 11 }, (_, index) => `DBC${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "dispatch-budget-calibration-tests", file: join(libDir, "dispatch-budget-calibration.test.mjs") },
  { name: "dispatch-policy-tests", file: join(libDir, "dispatch-policy.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 38 }, (_, index) => `DPT${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "dispatch-record-tests", file: join(libDir, "dispatch-record.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 13 }, (_, index) => `DRC${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "push-batch-contract-tests", file: join(libDir, "push-batch-contract.test.mjs") },
  { name: "push-batch-execution-tests", file: join(libDir, "push-batch-execution.test.mjs") },
  { name: "push-batch-executor-tests", file: join(pluginScriptsDir, "push-batch-executor.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: ["PBE01", "PBE02"], maxBytes: 65_536 } },
  { name: "installed-plugin-attestation-tests", file: join(libDir, "installed-plugin-attestation.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 9 }, (_, index) => `IPA${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "threat-model-approval-request-tests", file: join(libDir, "threat-model-approval-request.test.mjs") },
  { name: "sbom-lifecycle-tests", file: join(libDir, "sbom-lifecycle.test.mjs") },
  { name: "sbom-manifest-tests", file: join(libDir, "sbom-manifest.test.mjs") },
  { name: "sbom-node-adapter-tests", file: join(libDir, "sbom-node-adapter.test.mjs") },
  { name: "sbom-discovery-tests", file: join(libDir, "sbom-discovery.test.mjs") },
  { name: "sbom-discovery-cli-tests", file: join(pluginScriptsDir, "sbom-discovery.test.mjs") },
  { name: "sbom-fixture-matrix-tests", file: join(libDir, "sbom-fixture-matrix.test.mjs") },
  { name: "sbom-release-binding-tests", file: join(libDir, "sbom-release-binding.test.mjs") },
  { name: "po-gate-authority-fixture-tests", file: join(libDir, "po-gate-authority.test.mjs") },
  { name: "public-core-observation-tests", file: join(libDir, "public-core-observation.test.mjs") },
  { name: "public-core-origin-allowlist-tests", file: join(libDir, "public-core-origin-allowlist.test.mjs") },
  { name: "bootstrap-source-attestation-acceptance-tests", file: join(libDir, "bootstrap-source-attestation-acceptance.test.mjs") },
  { name: "external-push-ledger-tests", file: join(libDir, "external-push-ledger.test.mjs") },
  { name: "guard-push-external-ledger-tests", file: join(hooksDir, "guard-push-external-ledger.test.mjs") },
  { name: "guard-gate-strength-gmw-tests", file: join(hooksDir, "guard-gate-strength-gmw.test.mjs") },
  { name: "guard-gate-strength-ledger-tests", file: join(hooksDir, "guard-gate-strength-ledger.test.mjs") },
  { name: "guard-gate-strength-origin-attestation-tests", file: join(hooksDir, "guard-gate-strength-origin-attestation.test.mjs") },
  { name: "guard-handover-size-tests", file: join(hooksDir, "guard-handover-size.test.mjs") },
  { name: "guard-testpath-gmw-tests", file: join(hooksDir, "guard-testpath-gmw.test.mjs") },
  { name: "private-overlay-activation-tests", file: join(libDir, "private-overlay-activation.test.mjs") },
  { name: "private-overlay-runtime-projection-tests", file: join(libDir, "private-overlay-runtime-projection.test.mjs") },
  { name: "po-gate-profile-publisher-tests", file: join(libDir, "po-gate-profile-publisher.test.mjs") },
  { name: "private-overlay-bootstrap-status-tests", file: join(libDir, "private-overlay-bootstrap-status.test.mjs") },
  { name: "private-overlay-activation-cli-tests", file: join(pluginScriptsDir, "private-overlay-activation.test.mjs") },
  { name: "private-overlay-activation-e2e-tests", file: join(pluginScriptsDir, "private-overlay-activation.e2e.test.mjs") },
  { name: "codex-private-overlay-activation-tests", file: join(pluginScriptsDir, "codex-private-overlay-activation.test.mjs") },
  { name: "po-language-projection-tests", file: join(scriptDir, "po-language-projection.test.mjs") },
  { name: "po-language-projection-check", file: join(scriptDir, "check-po-language-projection.mjs") },
  { name: "error-register-tests", file: join(scriptDir, "check-error-register.test.mjs") },
  { name: "error-register-check", file: join(scriptDir, "check-error-register.mjs") },
  { name: "critic-fail-closed-tests", file: join(scriptDir, "check-critic-fail-closed.test.mjs") },
  { name: "critic-fail-closed-check", file: join(scriptDir, "check-critic-fail-closed.mjs") },
  { name: "agents-adapter-migration-tests", file: join(scriptDir, "check-agents-adapter-migration.test.mjs") },
  { name: "agents-adapter-migration-check", file: join(scriptDir, "check-agents-adapter-migration.mjs") },
  { name: "validate-manifest-tests", file: join(scriptDir, "validate-manifest.test.mjs") },
  { name: "capture-observation-intake-tests", file: join(repoRoot, "plugins", "pipeline-core", "skills", "capture-observation", "scripts", "observation-intake.test.mjs") },
  { name: "github-issue-operations-tests", file: join(pluginScriptsDir, "github-issue-operations.test.mjs") },
  { name: "github-actions-permissions-tests", file: join(scriptDir, "check-github-actions-permissions.test.mjs") },
  { name: "github-actions-permissions-check", file: join(scriptDir, "check-github-actions-permissions.mjs") },
  { name: "publication-executor-tests", file: join(pluginScriptsDir, "publication-executor.test.mjs") },
  { name: "publication-gate-evidence-tests", file: join(pluginScriptsDir, "publication-gate-evidence.test.mjs") },
  { name: "release-preflight-cli-tests", file: join(pluginScriptsDir, "release-preflight-cli.test.mjs") },
  { name: "migrate-backlog-state-tests", file: join(pluginScriptsDir, "migrate-backlog-state.test.mjs") },
  { name: "spec-retention-tests", file: join(pluginScriptsDir, "check-spec-retention.test.mjs") },
  { name: "spec-retention-check", file: join(pluginScriptsDir, "check-spec-retention.mjs") },
  { name: "observation-governance-tests", file: join(scriptDir, "check-observation-governance.test.mjs") },
  { name: "document-hooks-tests", file: join(libDir, "document-hooks.test.mjs") },
  { name: "document-identifier-tests", file: join(libDir, "document-identifiers.test.mjs") },
  { name: "document-lifecycle-tests", file: join(libDir, "document-lifecycle.test.mjs") },
  { name: "document-hooks-manifest-tests", file: join(pluginScriptsDir, "document-hooks-manifest.test.mjs") },
  { name: "check-runner-manifest-parity", file: join(pluginScriptsDir, "check-runner-manifest-parity.test.mjs") },
  { name: "install-agy-tests", file: join(repoRoot, "plugins", "pipeline-core", "install-agy.test.mjs") },
  { name: "antigravity-start-hint-tests", file: join(hooksDir, "antigravity-start-hint.test.mjs") },
  { name: "signed-quality-package-tests", file: join(libDir, "signed-quality-package.test.mjs") },
  { name: "private-document-binding-tests", file: join(pluginScriptsDir, "document-binding.test.mjs") },
  { name: "release-version-plan-tests", file: join(pluginScriptsDir, "release-version-plan.test.mjs") },
  { name: "product-capability-inventory-tests", file: join(scriptDir, "check-product-capability-inventory.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 30 }, (_, index) => `PCI${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "module-cluster-reachability-tests", file: join(scriptDir, "check-module-cluster-reachability.test.mjs") },
  { name: "pipeline-state-tests", file: join(scriptDir, "pipeline-state.test.mjs") },
  { name: "pipeline-state-late-verify-tests", file: join(pluginScriptsDir, "pipeline-state-late-verify.test.mjs") },
  { name: "dispatch-provenance-tests", file: join(scriptDir, "check-dispatch-provenance.test.mjs") },
  { name: "guard-git-phoenix-authority-grant-tests", file: join(hooksDir, "guard-git-phoenix-authority-grant.test.mjs") },
  { name: "decision-reference-dual-evaluation-tests", file: join(libDir, "decision-reference-dual-evaluation.test.mjs") },
  { name: "human-authority-grant-tests", file: join(pluginScriptsDir, "human-authority-grant.test.mjs") },
  { name: "po-approval-gate-tests", file: join(pluginScriptsDir, "po-approval-gate.test.mjs") },
  { name: "doc-contract-tests", file: join(scriptDir, "check-doc-contracts.test.mjs") },
  { name: "doc-reader-terminal-binding-tests", file: join(scriptDir, "doc-reader-terminal-binding.test.mjs"), caseCompletion: {schema:"pipeline.verify-case-completion-policy.v1",caseIds:["RC01C001","RC01C002","RC01C003","RC01C004","RC01C005","RC01C006","RC01C007","RC01C008","RC01C009"],maxBytes:65536} },
  { name: "doc-contract-check", file: join(scriptDir, "check-doc-contracts.mjs") },
  { name: "auth-gate-inventory-drift-tests", file: join(scriptDir, "check-auth-gate-inventory-drift.test.mjs") },
  { name: "auth-gate-inventory-drift-check", file: join(scriptDir, "check-auth-gate-inventory-drift.mjs") },
  { name: "section-citation-tests", file: join(scriptDir, "check-section-citations.test.mjs") },
  { name: "section-citation-check", file: join(scriptDir, "check-section-citations.mjs") },
  { name: "authority-tier-agreement-tests", file: join(scriptDir, "check-authority-tier-agreement.test.mjs") },
  { name: "authority-tier-agreement-check", file: join(scriptDir, "check-authority-tier-agreement.mjs") },
  { name: "language-canon-tests", file: join(scriptDir, "check-language-canon.test.mjs") },
  { name: "language-canon-check", file: join(scriptDir, "check-language-canon.mjs") },
  { name: "license-contract-tests", file: join(scriptDir, "check-license-contract.test.mjs") },
  { name: "license-contract-check", file: join(scriptDir, "check-license-contract.mjs") },
  { name: "pr-contributor-gate-tests", file: join(scriptDir, "check-pr-contributor-gates.test.mjs") },
  { name: "security-scan-tests", file: join(pluginScriptsDir, "security-scan.test.mjs") },
  { name: "no-autoupdate-key-tests", file: join(scriptDir, "no-autoupdate-key.test.mjs") },
  { name: "phase26-invariants-tests", file: join(scriptDir, "check-phase26-invariants.test.mjs") },
  { name: "phase26-invariants-check", file: join(scriptDir, "check-phase26-invariants.mjs"), args: phase26Result ? ["--result", phase26Result] : [] },
  { name: "sdlc-run-graph-tests", file: join(scriptDir, "sdlc-run-graph.test.mjs") },
  { name: "phase3-sdlc-coherence-tests", file: join(scriptDir, "check-phase3-sdlc-coherence.test.mjs") },
  { name: "phase3-sdlc-coherence-check", file: join(scriptDir, "check-phase3-sdlc-coherence.mjs"), args: phase3Result ? ["--result", phase3Result] : [] },
  { name: "sdlc-efficiency-metrics-tests", file: join(scriptDir, "sdlc-efficiency-metrics.test.mjs") },
  { name: "check-ownership-tests", file: join(scriptDir, "check-ownership.test.mjs") },
  { name: "backlog-state-tests", file: join(libDir, "backlog-state.test.mjs") },
  // Distinct from nova-backlog-reconciliation-tests below (delivery-status
  // reconciliation); this one covers the transition-LEDGER reconciliation.
  { name: "backlog-ledger-reconciliation-tests", file: join(pluginScriptsDir, "reconcile-backlog-ledger.test.mjs") },
  // The ledger drifted for weeks because nothing gated it. Remedy when this goes red:
  // node plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs --activate
  { name: "backlog-state-check", file: join(pluginScriptsDir, "check-backlog-state.mjs") },
  { name: "deferred-backlog-tests", file: join(pluginScriptsDir, "check-deferred-backlog.test.mjs") },
  { name: "deferred-backlog-check", file: join(pluginScriptsDir, "check-deferred-backlog.mjs") },
  { name: "parallel-dispatch-planner-tests", file: join(libDir, "parallel-dispatch-planner.test.mjs") },
  { name: "parallel-sprint-integration-tests", file: join(libDir, "parallel-sprint-integration.test.mjs") },
  { name: "epic-ac02-publication-check-tests", file: join(pluginScriptsDir, "check-epic-ac02-publication.test.mjs") },
  { name: "epic-ac02-publication-check", file: join(pluginScriptsDir, "check-epic-ac02-publication.mjs") },
  { name: "continuity-status-tests", file: join(libDir, "continuity-status.test.mjs") },
  { name: "continuity-status-cli-tests", file: join(pluginScriptsDir, "continuity-status.test.mjs") },
  { name: "delivery-course-tests", file: join(libDir, "delivery-course.test.mjs") },
  { name: "critic-packet-governance-tests", file: join(libDir, "critic-packet-governance.test.mjs") },
  { name: "critic-course-admission-tests", file: join(libDir, "critic-course-admission.test.mjs") },
  { name: "critic-dispatch-preflight-tests", file: join(pluginScriptsDir, "critic-dispatch-preflight.test.mjs") },
  { name: "observe-critic-preflight-tests", file: join(pluginScriptsDir, "observe-critic-preflight.test.mjs") },
  { name: "requirement-traceability-tests", file: join(libDir, "requirement-traceability.test.mjs") },
  { name: "session-critic-finalizer-tests", file: join(pluginScriptsDir, "session-critic-finalizer.test.mjs") },
  { name: "windows-private-state-tests", file: join(libDir, "windows-private-state.test.mjs") },
  { name: "windows-assurance-verify-registration-tests", file: join(libDir, "windows-assurance-verify-registration.test.mjs") },
  { name: "symlink-capability-tests", file: join(libDir, "symlink-capability.test.mjs") },
  { name: "runner-native-continuation-tests", file: join(libDir, "runner-native-continuation.test.mjs") },
  { name: "bootstrap-payload-budget-tests", file: join(libDir, "bootstrap-payload-budget.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 10 }, (_, index) => `BPB${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "governance-action-artifact-tests", file: join(libDir, "governance-action-artifact.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 8 }, (_, index) => `GAA${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "governance-gate-action-tests", file: join(libDir, "governance-gate-action.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 7 }, (_, index) => `GGA${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "governance-recovery-reconciliation-action-tests", file: join(libDir, "governance-recovery-reconciliation-action.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 9 }, (_, index) => `GRRA${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "governance-review-action-tests", file: join(libDir, "governance-review-action.test.mjs") },
  { name: "governance-verification-action-tests", file: join(libDir, "governance-verification-action.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 8 }, (_, index) => `GVA${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "bootstrap-payload-measure-cli-tests", file: join(pluginScriptsDir, "bootstrap-payload-measure.test.mjs") },
  { name: "local-supervisor-state-tests", file: join(libDir, "local-supervisor-state.test.mjs") },
  { name: "local-supervisor-setup-tests", file: join(pluginScriptsDir, "local-supervisor-setup.test.mjs") },
  { name: "local-worker-supervisor-core-tests", file: join(libDir, "local-worker-supervisor.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 15 }, (_, index) => `LWS${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "local-worker-supervisor-cli-tests", file: join(pluginScriptsDir, "local-worker-supervisor.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 10 }, (_, index) => `LWSC${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "codex-goal-host-tests", file: join(pluginScriptsDir, "codex-goal-host.test.mjs") },
  { name: "claude-goal-host-tests", file: join(pluginScriptsDir, "claude-goal-host.test.mjs") },
  { name: "nova-backlog-reconciliation-tests", file: join(libDir, "backlog-delivery-reconciliation.test.mjs") },
  { name: "nova-backlog-reconciler-cli-tests", file: join(pluginScriptsDir, "reconcile-backlog-delivery.test.mjs") },
  { name: "nova-runner-capability-tests", file: join(libDir, "runner-capability-report.test.mjs") },
  { name: "nova-sandbox-disposition-tests", file: join(libDir, "selected-sandbox-disposition.test.mjs") },
  { name: "nova-invocation-reliability-tests", file: join(libDir, "invocation-reliability.test.mjs") },
  { name: "nova-invocation-preflight-tests", file: join(pluginScriptsDir, "invocation-preflight.test.mjs") },
  { name: "nova-execution-plane-tests", file: join(libDir, "execution-plane-contract.test.mjs") },
  { name: "nova-scheduling-lifecycle-tests", file: join(libDir, "scheduling-lifecycle.test.mjs") },
  { name: "nova-critic-lineage-tests", file: join(libDir, "critic-review-lineage.test.mjs") },
  { name: "nova-critic-packet-tests", file: join(pluginScriptsDir, "critic-packet-preflight.test.mjs") },
  { name: "nova-benchmark-tests", file: join(libDir, "multi-cli-benchmark.test.mjs") },
  { name: "nova-release-preflight-tests", file: join(pluginScriptsDir, "release-preflight.test.mjs") },
  { name: "nova-increment-receipt-tests", file: join(libDir, "nova-increment-receipt.test.mjs") },
  { name: "nova-macos-acceptance-tests", file: join(libDir, "macos-acceptance.test.mjs") },
  { name: "nova-b2-gitlab-ci-broker-core-tests", file: join(libDir, "gitlab-ci-execution-broker.test.mjs") },
  { name: "nova-b2-gitlab-ci-broker-cli-tests", file: join(pluginScriptsDir, "gitlab-ci-execution-broker.test.mjs") },
  { name: "nova-b4-git-transport-contract-tests", file: join(libDir, "git-transport-contract.test.mjs") },
  { name: "nova-b4-github-forge-adapter-tests", file: join(pluginScriptsDir, "github-forge-adapter.test.mjs") },
  { name: "nova-b4-gitlab-forge-adapter-tests", file: join(pluginScriptsDir, "gitlab-forge-adapter.test.mjs") },
  { name: "nova-candidate-freeze-tests", file: join(libDir, "nova-candidate-freeze.test.mjs") },
  { name: "nova-verify-resume-tests", file: join(libDir, "verify-resume.test.mjs") },
  { name: "verify-selection-tests", file: join(libDir, "verify-selection.test.mjs") },
  { name: "consumer-baseline-verify-tests", file: join(libDir, "consumer-baseline-verify.test.mjs") },
  { name: "self-verify-selection-tests", file: join(scriptDir, "self-verify-selection.test.mjs") },
  { name: "nova-verify-journal-tests", file: join(pluginScriptsDir, "verify-journal.test.mjs") },
  { name: "test-case-completion-tests", file: join(libDir, "test-case-completion.test.mjs") },
  { name: "verify-case-completion-receipt-tests", file: join(libDir, "verify-case-completion-receipt.test.mjs") },
  { name: "verify-case-completion-registry-tests", file: join(scriptDir, "check-verify-case-completion.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 30 }, (_, index) => `VCR${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "verify-case-completion-check", file: join(scriptDir, "check-verify-case-completion.mjs") },
  { name: "afk-assumption-mode-tests", file: join(libDir, "afk-assumption-mode.test.mjs") },
  { name: "afk-capability-worker-tests", file: join(libDir, "afk-capability-worker.test.mjs") },
  { name: "afk-git-adapter-tests", file: join(libDir, "afk-git-adapter.test.mjs") },
  { name: "afk-review-tests", file: join(libDir, "afk-review.test.mjs") },
  { name: "afk-transaction-host-tests", file: join(libDir, "afk-transaction-host.test.mjs") },
  { name: "afk-claude-host-tests", file: join(pluginScriptsDir, "afk-claude-host.test.mjs") },
  { name: "codex-sandbox-preflight-host-control-tests", file: join(scriptDir, "codex-sandbox-preflight-host-control.test.mjs") },
  { name: "codex-isolation-control-decomposition-tests", file: join(pluginScriptsDir, "codex-isolation-control-decomposition.test.mjs") },
  { name: "codex-critic-packet-host-tests", file: join(pluginScriptsDir, "codex-critic-packet-host.test.mjs") },
  { name: "codex-critic-probe-split-tests", file: join(pluginScriptsDir, "codex-critic-probe-split.test.mjs") },
  { name: "codex-critic-shadow-tests", file: join(pluginScriptsDir, "codex-critic-shadow.test.mjs") },
  { name: "codex-isolated-critic-claims-tests", file: join(pluginScriptsDir, "codex-isolated-critic-claims.test.mjs") },
  { name: "run-codex-critic-isolation-tests", file: join(pluginScriptsDir, "run-codex-critic-isolation.test.mjs") },
  { name: "run-codex-critic-probe-split-tests", file: join(pluginScriptsDir, "run-codex-critic-probe-split.test.mjs") },
  { name: "evidence-view-model-tests", file: join(libDir, "evidence-view-model.test.mjs") },
  { name: "evidence-view-renderer-tests", file: join(libDir, "evidence-view-renderer.test.mjs") },
  { name: "evidence-viewer-tests", file: join(pluginScriptsDir, "evidence-viewer.test.mjs") },
  { name: "governance-authority-resolver-tests", file: join(libDir, "governance-authority-resolver.test.mjs") },
  { name: "governance-event-projection-tests", file: join(libDir, "governance-event-projection.test.mjs") },
  { name: "governance-event-store-tests", file: join(libDir, "governance-event-store.test.mjs") },
  { name: "governance-event-core-tests", file: join(libDir, "governance-event.test.mjs") },
  { name: "governance-export-adapter-tests", file: join(libDir, "governance-export-adapter.test.mjs") },
  { name: "governance-export-delivery-tests", file: join(libDir, "governance-export-delivery.test.mjs") },
  { name: "governance-export-outbox-store-tests", file: join(libDir, "governance-export-outbox-store.test.mjs") },
  { name: "governance-export-outbox-tests", file: join(libDir, "governance-export-outbox.test.mjs") },
  { name: "governance-replay-view-tests", file: join(libDir, "governance-replay-view.test.mjs") },
  { name: "governance-replay-core-tests", file: join(libDir, "governance-replay.test.mjs") },
  { name: "human-governance-ledger-tests", file: join(libDir, "human-governance-ledger.test.mjs") },
  { name: "lifecycle-governance-events-tests", file: join(libDir, "lifecycle-governance-events.test.mjs") },
  { name: "lifecycle-governance-events-schema-parity-tests", file: join(libDir, "lifecycle-governance-events-schema-parity.test.mjs") },
  { name: "governance-action-events-tests", file: join(libDir, "governance-action-events.test.mjs") },
  { name: "governance-authority-tests", file: join(pluginScriptsDir, "governance-authority.test.mjs") },
  { name: "governance-event-cli-tests", file: join(pluginScriptsDir, "governance-event.test.mjs") },
  { name: "governance-export-tests", file: join(pluginScriptsDir, "governance-export.test.mjs") },
  { name: "governance-replay-viewer-tests", file: join(pluginScriptsDir, "governance-replay-viewer.test.mjs") },
  { name: "governance-replay-cli-tests", file: join(pluginScriptsDir, "governance-replay.test.mjs") },
  { name: "phoenix-governance-threat-model-tests", file: join(pluginScriptsDir, "phoenix-governance-threat-model.test.mjs") },
  { name: "phoenix-authority-approval-tests", file: join(pluginScriptsDir, "phoenix-authority-approval.test.mjs") },
  { name: "critical-human-proof-gate-tests", file: join(pluginScriptsDir, "critical-human-proof-gate.test.mjs") },
  { name: "guard-human-override-tests", file: join(pluginScriptsDir, "guard-human-override.test.mjs") },
  { name: "human-guard-override-capability-scan-tests", file: join(libDir, "human-guard-override-capability-scan.test.mjs"), caseCompletion: {schema:"pipeline.verify-case-completion-policy.v1",caseIds:["RC15C001","RC15C002","RC15C003"],maxBytes:65536} },
  { name: "po-human-approval-tests", file: join(pluginScriptsDir, "po-human-approval.test.mjs") },
  { name: "network-lockdown-tests", file: join(scriptDir, "network-lockdown.test.mjs") },
  { name: "pipeline-state-external-push-ledger-tests", file: join(scriptDir, "pipeline-state-external-push-ledger.test.mjs") },
  { name: "agent-decision-journal-tests", file: join(libDir, "agent-decision-journal.test.mjs") },
  { name: "async-execution-tests", file: join(libDir, "async-execution.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 5 }, (_, index) => `AEX${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "authority-revision-proof-tests", file: join(libDir, "authority-revision-proof.test.mjs") },
  { name: "credential-lease-tests", file: join(libDir, "credential-lease.test.mjs") },
  { name: "critical-action-approval-request-tests", file: join(libDir, "critical-action-approval-request.test.mjs") },
  { name: "external-command-offer-tests", file: join(libDir, "external-command-offer.test.mjs") },
  { name: "forge-capability-tests", file: join(libDir, "forge-capability.test.mjs") },
  { name: "gate-estimate-tests", file: join(libDir, "gate-estimate.test.mjs") },
  { name: "local-worker-pool-tests", file: join(libDir, "local-worker-pool.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 6 }, (_, index) => `LWP${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "plan-spec-state-v2-tests", file: join(libDir, "plan-spec-state-v2.test.mjs") },
  { name: "remote-provisional-receipt-tests", file: join(libDir, "remote-provisional-receipt.test.mjs") },
  { name: "ruleset-source-tests", file: join(libDir, "ruleset-source.test.mjs") },
  { name: "security-capability-plan-builder-tests", file: join(libDir, "security-capability-plan-builder.test.mjs") },
  { name: "security-completeness-gate-tests", file: join(libDir, "security-completeness-gate.test.mjs") },
  { name: "security-evidence-v1-migration-fixture-tests", file: join(libDir, "security-evidence-v1-migration-fixture.test.mjs") },
  { name: "source-observation-tests", file: join(libDir, "source-observation.test.mjs") },
  { name: "stack-capability-plan-tests", file: join(libDir, "stack-capability-plan.test.mjs") },
  { name: "ai-assisted-hardening-gate-tests", file: join(pluginScriptsDir, "ai-assisted-hardening-gate.test.mjs") },
  { name: "antigravity-alpha-adapter-tests", file: join(pluginScriptsDir, "antigravity-alpha-adapter.test.mjs") },
  { name: "check-close-security-completeness-tests", file: join(pluginScriptsDir, "check-close-security-completeness.test.mjs") },
  { name: "check-completeness-vocabulary-doclint-tests", file: join(pluginScriptsDir, "check-completeness-vocabulary-doclint.test.mjs") },
  { name: "check-release-state-consistency-tests", file: join(pluginScriptsDir, "check-release-state-consistency.test.mjs") },
  { name: "critic-route-activation-tests", file: join(pluginScriptsDir, "critic-route-activation.test.mjs") },
  { name: "critic-t1-po-override-tests", file: join(pluginScriptsDir, "critic-t1-po-override.test.mjs") },
  { name: "live-runner-certification-tests", file: join(pluginScriptsDir, "live-runner-certification.test.mjs") },
  { name: "native-plugin-readback-tests", file: join(pluginScriptsDir, "native-plugin-readback.test.mjs") },
  { name: "neutral-range-plan-tests", file: join(pluginScriptsDir, "neutral-range-plan.test.mjs") },
  { name: "pipeline-state-reopen-design-tests", file: join(pluginScriptsDir, "pipeline-state-reopen-design.test.mjs") },
  { name: "po-guarded-push-tests", file: join(pluginScriptsDir, "po-guarded-push.test.mjs") },
  { name: "public-baseline-diagnose-tests", file: join(pluginScriptsDir, "public-baseline-diagnose.test.mjs") },
  { name: "ruleset-update-policy-tests", file: join(pluginScriptsDir, "ruleset-update-policy.test.mjs") },
  { name: "run-codex-isolation-control-decomposition-tests", file: join(pluginScriptsDir, "run-codex-isolation-control-decomposition.test.mjs") },
  { name: "runner-contracts.schema-tests", file: join(pluginScriptsDir, "runner-contracts.schema.test.mjs") },
  { name: "verify-topology-preflight-tests", file: join(pluginScriptsDir, "verify-topology-preflight.test.mjs") },
  { name: "worktree-target-binding-tests", file: join(pluginScriptsDir, "worktree-target-binding.test.mjs") },
  { name: "critic-review-scope-tests", file: join(repoRoot, "plugins", "pipeline-core", "skills", "critic-review", "critic-review-scope.test.mjs") },
  { name: "audit-bundle-core-tests", file: join(libDir, "audit-bundle.test.mjs") },
  { name: "change-control-core-tests", file: join(libDir, "change-control.test.mjs") },
  { name: "control-catalog-migration-tests", file: join(libDir, "control-catalog-migration.test.mjs") },
  { name: "organization-policy-activation-tests", file: join(libDir, "organization-policy-activation.test.mjs") },
  { name: "organization-policy-core-tests", file: join(libDir, "organization-policy.test.mjs") },
  { name: "audit-bundle-cli-tests", file: join(pluginScriptsDir, "audit-bundle.test.mjs") },
  { name: "change-control-cli-tests", file: join(pluginScriptsDir, "change-control.test.mjs") },
  { name: "organization-policy-cli-tests", file: join(pluginScriptsDir, "organization-policy.test.mjs") },
  { name: "publication-state-authority-tests", file: join(scriptDir, "publication-state-authority.test.mjs") },
  { name: "provenance-release-binding-tests", file: join(libDir, "provenance-release-binding.test.mjs") },
  { name: "publication-authority-tests", file: join(libDir, "publication-authority.test.mjs") },
  { name: "publication-bundle-v2-tests", file: join(libDir, "publication-bundle-v2.test.mjs") },
  { name: "publication-bundle-tests", file: join(libDir, "publication-bundle.test.mjs") },
  { name: "publication-capability-preflight-tests", file: join(libDir, "publication-capability-preflight.test.mjs") },
  { name: "publication-close-journal-tests", file: join(pluginScriptsDir, "publication-close-journal.test.mjs") },
  { name: "publication-executor-v2-tests", file: join(pluginScriptsDir, "publication-executor-v2.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 14 }, (_, index) => `PEV${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "external-reference-adapter-tests", file: join(libDir, "external-reference-adapter.test.mjs") },
  { name: "reference-catalog-views-tests", file: join(libDir, "reference-catalog-views.test.mjs") },
  { name: "reference-catalog-tests", file: join(libDir, "reference-catalog.test.mjs") },
  { name: "external-reference-tests", file: join(pluginScriptsDir, "external-reference.test.mjs") },
  { name: "gitleaks-tests", file: join(pluginScriptsDir, "security-adapters", "gitleaks.test.mjs") },
  { name: "license-check-tests", file: join(pluginScriptsDir, "security-adapters", "license-check.test.mjs") },
  { name: "osv-scanner-tests", file: join(pluginScriptsDir, "security-adapters", "osv-scanner.test.mjs") },
  { name: "semgrep-tests", file: join(pluginScriptsDir, "security-adapters", "semgrep.test.mjs") },
  { name: "security-readiness-harness-tests", file: join(scriptDir, "security-readiness", "security-readiness.test.mjs") },
  { name: "security-scan-v2-integration-tests", file: join(pluginScriptsDir, "security-scan-v2-integration.test.mjs") },
  { name: "verify-suite-registration-tests", file: join(scriptDir, "check-verify-suite-registration.test.mjs") },
  { name: "verify-suite-registration-check", file: join(scriptDir, "check-verify-suite-registration.mjs") },
  { name: "self-application-attestation-gate-tests", file: join(libDir, "self-application-attestation-gate.test.mjs") },
  { name: "pipeline-state-decision-reference-tests", file: join(scriptDir, "pipeline-state-decision-reference.test.mjs") },
  { name: "guard-push-decision-reference-tests", file: join(hooksDir, "guard-push-decision-reference.test.mjs") },
  { name: "control-execution-lifecycle-event-tests", file: join(libDir, "control-execution-lifecycle-event.test.mjs") },
  { name: "governance-export-view-status-tests", file: join(libDir, "governance-export-view-status.test.mjs") },
  { name: "guard-authority-ledger-intake-tests", file: join(libDir, "guard-authority-ledger-intake.test.mjs") },
  { name: "guard-handoff-offer-tests", file: join(libDir, "guard-handoff-offer.test.mjs") },
  { name: "pipeline-state-lifecycle-event-tests", file: join(pluginScriptsDir, "pipeline-state-lifecycle-event.test.mjs") },
  { name: "epic-file-contract-tests", file: join(scriptDir, "check-epic-file-contract.test.mjs") },
  { name: "plan-spec-state-v2-legacy-tests", file: join(repoRoot, "harness", "lib", "plan-spec-state-v2.test.mjs") },
  { name: "recovery-bridge-approval-tests", file: join(scriptDir, "recovery-bridge-approval.test.mjs") },
  { name: "guard-git-phoenix-tests", file: join(hooksDir, "guard-git-phoenix.test.mjs") },
  { name: "afk-activation-tests", file: join(pluginScriptsDir, "afk-activation.test.mjs") },
  { name: "codex-isolated-critic-protected-preimage-tests", file: join(pluginScriptsDir, "codex-isolated-critic-protected-preimage.test.mjs") },
  { name: "resume-hint-tests", file: join(libDir, "resume-hint.test.mjs") },
  // Distinct from resume-hint-tests above: two files share a basename, libDir
  // vs. pluginScriptsDir (same precedent as harness-lib-plan-spec-state-v2-tests /
  // lib-plan-spec-state-v2-tests further down). NVA-R26-VERIFYPREP.
  { name: "resume-hint-scripts-tests", file: join(pluginScriptsDir, "resume-hint.test.mjs") },
  { name: "guard-el01-tripwire-tests", file: join(hooksDir, "guard-el01-tripwire.test.mjs") },
  { name: "guard-onboarding-consent-lock-tests", file: join(hooksDir, "guard-onboarding-consent-lock.test.mjs") },
  { name: "onboarding-consent-marker-tests", file: join(libDir, "onboarding-consent-marker.test.mjs") },
  { name: "onboarding-consent-guard-tests", file: join(hooksDir, "onboarding-consent-guard.test.mjs") },
  { name: "protected-test-paths-tests", file: join(libDir, "protected-test-paths.test.mjs") },
  { name: "rebase-authority-tests", file: join(libDir, "rebase-authority.test.mjs") },
  { name: "onboarding-consent-mark-tests", file: join(pluginScriptsDir, "onboarding-consent-mark.test.mjs") },
  { name: "clean-candidate-run-tests", file: join(pluginScriptsDir, "clean-candidate-run.test.mjs") },
  { name: "verify-evidence-root-tests", file: join(scriptDir, "verify-evidence-root.test.mjs") },
  { name: "human-decision-attribution-tests", file: join(libDir, "human-decision-attribution.test.mjs") },
  { name: "handover-rotate-tests", file: join(pluginScriptsDir, "handover-rotate.test.mjs") },
  { name: "pipeline-state-rebind-mutable-tests", file: join(pluginScriptsDir, "pipeline-state-rebind-mutable.test.mjs") },
  // --- merged from Nova (feat/sprint-nova-codex-v046) during the Phoenix/Nova
  // integration merge, PHX-VERIFY: present on the Nova side, absent from Phoenix's list. ---
  { name: "session-cleanup-owner-nonce-tests", file: join(pluginScriptsDir, "session-cleanup-owner-nonce.test.mjs") },
  { name: "antigravity-pretool-guard-tests", file: join(hooksDir, "antigravity-pretool-guard.test.mjs") },
  { name: "worktree-create-tests", file: join(pluginScriptsDir, "worktree-create.test.mjs") },
  { name: "state-numeric-claims-tests", file: join(pluginScriptsDir, "check-state-numeric-claims.test.mjs") },
  { name: "state-numeric-claims-check", file: join(pluginScriptsDir, "check-state-numeric-claims.mjs") },
  { name: "codex-sandbox-preflight-plugin-tests", file: join(pluginScriptsDir, "codex-sandbox-preflight.test.mjs") },
  { name: "nova-sandbox-launch-tests", file: join(pluginScriptsDir, "selected-sandbox-launch.test.mjs") },
  { name: "nova-execution-plane-real-tests", file: join(libDir, "execution-plane-contract-real.test.mjs") },
  { name: "machine-plane-tests", file: join(libDir, "machine-plane.test.mjs") },
  { name: "initial-answers-state-tests", file: join(libDir, "onboarding-initial-answers-state.test.mjs") },
  { name: "initial-answers-transaction-tests", file: join(libDir, "onboarding-initial-answers-transaction.test.mjs") },
  { name: "consumer-safe-paths-tests", file: join(repoRoot, "harness", "scripts", "check-consumer-safe-paths.test.mjs") },
  { name: "verify-evidence-producer-tests", file: join(pluginScriptsDir, "verify-evidence-producer.test.mjs") },
  { name: "lifecycle-recovery-contract-tests", file: join(hooksDir, "guard-lifecycle-recovery-contract.test.mjs") },
  { name: "pipeline-state-inspection-contract-tests", file: join(pluginScriptsDir, "pipeline-state-inspection-contract.test.mjs") },
  { name: "project-reset-tests", file: join(pluginScriptsDir, "project-reset.test.mjs") },
  { name: "reference-path-tests", file: join(scriptDir, "check-reference-paths.test.mjs") },
  { name: "reference-path-check", file: join(scriptDir, "check-reference-paths.mjs") },
  { name: "repair-map-tests", file: join(pluginScriptsDir, "repair-map.test.mjs") },
  { name: "obligations-contract-tests", file: join(scriptDir, "generate-agent-obligations.test.mjs") },
  // NOT a duplicate of `lib-plan-spec-state-v2-tests` below: these are two
  // DIFFERENT files that share a basename — `harness/lib/plan-spec-state-v2.test.mjs`
  // (9,902 bytes) and `plugins/pipeline-core/lib/plan-spec-state-v2.test.mjs`
  // (28,852 bytes). A review round read the pair as one file registered twice and
  // both entries were removed, silently dropping two real suites from the gate.
  { name: "harness-lib-plan-spec-state-v2-tests", file: join(repoRoot, "harness", "lib", "plan-spec-state-v2.test.mjs") },
  { name: "check-directory-contract-tests", file: join(scriptDir, "check-directory-contract.test.mjs") },
  { name: "check-gitignore-anchoring-tests", file: join(scriptDir, "check-gitignore-anchoring.test.mjs") },
  { name: "check-review-retry-plan-tests", file: join(scriptDir, "check-review-retry-plan.test.mjs") },
  { name: "review-retry-plan-check", file: join(scriptDir, "check-review-retry-plan.mjs"), args: reviewRetryInput ? ["--review-retry-input", reviewRetryInput] : [] },
  { name: "check-session-bootstrap-directory-contract-tests", file: join(scriptDir, "check-session-bootstrap-directory-contract.test.mjs") },
  { name: "generate-vendored-canon-tests", file: join(scriptDir, "generate-vendored-canon.test.mjs") },
  { name: "agent-model-registry-tests", file: join(libDir, "agent-model-registry.test.mjs") },
  { name: "backlog-dispatch-reference-tests", file: join(libDir, "backlog-dispatch-reference.test.mjs") },
  { name: "guard-maintenance-window-kernel-closure-tests", file: join(libDir, "guard-maintenance-window-kernel-closure.test.mjs") },
  { name: "handover-rotation-tests", file: join(libDir, "handover-rotation.test.mjs") },
  { name: "observation-governance-bootstrap-tests", file: join(libDir, "observation-governance-bootstrap.test.mjs") },
  // See the note on `harness-lib-plan-spec-state-v2-tests` above: same basename,
  // different file, different directory. Both entries are required.
  { name: "lib-plan-spec-state-v2-tests", file: join(libDir, "plan-spec-state-v2.test.mjs") },
  { name: "review-retry-planner-tests", file: join(libDir, "review-retry-planner.test.mjs") },
  { name: "session-cleanup-recovery-tests", file: join(libDir, "session-cleanup-recovery.test.mjs") },
  { name: "test-tmpdir-budget-tests", file: join(libDir, "test-tmpdir-budget.test.mjs") },
  { name: "test-tmpdir-tests", file: join(libDir, "test-tmpdir.test.mjs") },
  { name: "transfer-classification-tests", file: join(libDir, "transfer-classification.test.mjs") },
  { name: "antigravity-execution-host-tests", file: join(libDir, "antigravity-execution-host.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 24 }, (_, index) => `EPH${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "goldfish-antigravity-host-tests", file: join(pluginScriptsDir, "goldfish-antigravity-host.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 15 }, (_, index) => `E3H${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "antigravity-native-dispatch-coordinator-tests", file: join(libDir, "antigravity-native-dispatch-coordinator.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 20 }, (_, index) => `ANDC${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "antigravity-native-dispatch-pretool-tests", file: join(hooksDir, "antigravity-native-dispatch-pretool.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 8 }, (_, index) => `ANDP${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "backlog-item-strip-for-dispatch-tests", file: join(pluginScriptsDir, "backlog-item-strip-for-dispatch.test.mjs") },
  { name: "check-backlog-state-tests", file: join(pluginScriptsDir, "check-backlog-state.test.mjs") },
  { name: "check-suite-registration-tests", file: join(pluginScriptsDir, "check-suite-registration.test.mjs") },
  { name: "check-vendored-template-sync-tests", file: join(pluginScriptsDir, "check-vendored-template-sync.test.mjs") },
  { name: "dispatch-authorship-verify-tests", file: join(pluginScriptsDir, "dispatch-authorship-verify.test.mjs") },
  { name: "dispatch-record-write-tests", file: join(pluginScriptsDir, "dispatch-record-write.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 17 }, (_, index) => `DRW${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "execution-plane-launch-tests", file: join(pluginScriptsDir, "execution-plane-launch.test.mjs") },
  { name: "installed-plugin-attestation-host-tests", file: join(pluginScriptsDir, "installed-plugin-attestation-host.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 9 }, (_, index) => `IPH${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "nova-a8-benchmark-runner-tests", file: join(pluginScriptsDir, "nova-a8-benchmark-runner.test.mjs") },
  { name: "pipeline-start-scratch-lifecycle-tests", file: join(pluginScriptsDir, "pipeline-start-scratch-lifecycle.test.mjs") },
  { name: "pipeline-state-approve-announce-tests", file: join(pluginScriptsDir, "pipeline-state-approve-announce.test.mjs") },
  { name: "pipeline-state-approve-push-argv-closure-tests", file: join(pluginScriptsDir, "pipeline-state-approve-push-argv-closure.test.mjs") },
  { name: "pipeline-state-discard-feature-tests", file: join(pluginScriptsDir, "pipeline-state-discard-feature.test.mjs") },
  { name: "pipeline-state-observer-conformance-tests", file: join(pluginScriptsDir, "pipeline-state-observer-conformance.test.mjs") },
  { name: "pipeline-state-gate-action-event-tests", file: join(pluginScriptsDir, "pipeline-state-gate-action-event.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 8 }, (_, index) => `PSG${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "pipeline-state-inspect-tests", file: join(pluginScriptsDir, "pipeline-state-inspect.test.mjs") },
  { name: "scripts-pipeline-state-tests", file: join(pluginScriptsDir, "pipeline-state.test.mjs") },
  { name: "project-onboarding-v3-argv-closure-tests", file: join(pluginScriptsDir, "project-onboarding-v3-argv-closure.test.mjs") },
  { name: "publication-executor-productive-flow-tests", file: join(pluginScriptsDir, "publication-executor-productive-flow.test.mjs") },
  { name: "push-prepare-tests", file: join(pluginScriptsDir, "push-prepare.test.mjs") },
  { name: "push-release-flow-docs-contract-tests", file: join(pluginScriptsDir, "push-release-flow-docs-contract.test.mjs") },
  { name: "rotate-handover-sections-tests", file: join(pluginScriptsDir, "rotate-handover-sections.test.mjs") },
  { name: "settings-allowlist-merge-tests", file: join(pluginScriptsDir, "settings-allowlist-merge.test.mjs") },
  { name: "signing-ceremony-tests", file: join(pluginScriptsDir, "signing-ceremony.test.mjs") },
  { name: "tmp-leak-enumerate-tests", file: join(pluginScriptsDir, "tmp-leak-enumerate.test.mjs") },
  { name: "tmp-leak-guard-tests", file: join(pluginScriptsDir, "tmp-leak-guard.test.mjs") },
  { name: "usage-ledger-tests", file: join(pluginScriptsDir, "usage-ledger.test.mjs") },
  // Landed after both merge sides diverged (commit ab347a74); registered here per PHX-VERIFY 1b.
  { name: "pipeline-start-preflight-antigravity-hard-enforcement-tests", file: join(pluginScriptsDir, "pipeline-start-preflight-antigravity-hard-enforcement.test.mjs") },
  { name: "guard-dispatch-budget-tests", file: join(hooksDir, "guard-dispatch-budget.test.mjs") },
  { name: "dispatch-budget-binding-tests", file: join(libDir, "dispatch-budget-binding.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 8 }, (_, index) => `DBB${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "wire-dispatch-budget-hook-tests", file: join(repoRoot, "harness", "scripts", "wire-dispatch-budget-hook.test.mjs") },
  { name: "pipeline-user-v3-drift-tests", file: join(libDir, "pipeline-user-v3-drift.test.mjs") },
  { name: "hooks-manifest-shape-tests", file: join(hooksDir, "hooks-manifest-shape.test.mjs") },
  // AK-2: suites that existed but were never registered here, so the gate could
  // pass while they were never run. check-suite-registration.mjs reports the gap.
  { name: "check-adr-consistency-tests", file: join(repoRoot, "harness", "scripts", "check-adr-consistency.test.mjs") },
  { name: "check-critic-contract-citations-tests", file: join(repoRoot, "harness", "scripts", "check-critic-contract-citations.test.mjs") },
  { name: "check-doc-reconciliation-tests", file: join(repoRoot, "harness", "scripts", "check-doc-reconciliation.test.mjs") },
  { name: "pipeline-start-preflight-pre-push-observation-tests", file: join(pluginScriptsDir, "pipeline-start-preflight-pre-push-observation.test.mjs") },
  { name: "pre-push-hook-install-tests", file: join(pluginScriptsDir, "pre-push-hook-install.test.mjs") },
  // NVA-SPRINTFIELD-1: the sprint-assignment reporter's own suite, over synthetic fixtures.
  { name: "check-backlog-sprint-assignment-tests", file: join(pluginScriptsDir, "check-backlog-sprint-assignment.test.mjs") },
  // NVA-SPRINTGATE-2 (2026-08-28): the suite above exercises the reporter against fixture
  // directories and proves nothing about this repository's own backlog. Until this line the
  // registration comment claimed the value set was "enforced by the gate", and three further
  // documents claimed an exit-1 rule for undeclared open items -- while nothing executed the
  // script against the real backlog/items/ tree. Running the script here is what makes that
  // claim true; the suite alone is shape evidence, not result evidence.
  { name: "backlog-sprint-assignment-check", file: join(pluginScriptsDir, "check-backlog-sprint-assignment.mjs") },
  // Same reasoning as the sprint-assignment check directly above, for the sibling predicate
  // checker: its suite proves the shape, only running it here proves the result. Registered
  // 2026-09-07 under a PO-signed TP-3 override, after the four contradictions it reported on
  // first run were resolved -- three finished items still booked open, and one predicate that
  // named a test anchor which already existed when it was written, so the item read satisfied
  // from the moment it was declared while the defect stayed live.
  { name: "backlog-done-predicate-check", file: join(pluginScriptsDir, "check-backlog-done-predicate.mjs") },
  { name: "copy-safe-command-tests", file: join(libDir, "copy-safe-command.test.mjs") },
  { name: "project-onboarding-v3-pre-push-hook-offer-tests", file: join(pluginScriptsDir, "project-onboarding-v3-pre-push-hook-offer.test.mjs") },
  { name: "onboarding-init-tests", file: join(pluginScriptsDir, "onboarding-init.test.mjs") },
  { name: "push-gate-satisfiability-tests", file: join(pluginScriptsDir, "push-gate-satisfiability.test.mjs") },
  { name: "bootstrap-trust-recovery-tests", file: join(pluginScriptsDir, "bootstrap-trust-recovery.test.mjs") },
  { name: "intake-material-reference-tests", file: join(libDir, "intake-material-reference.test.mjs") },
  { name: "passive-read-policy-tests", file: join(libDir, "passive-read-policy.test.mjs") },
  { name: "design-readiness-course-e2e-tests", file: join(pluginScriptsDir, "design-readiness-course.e2e.test.mjs") },
  { name: "chat-gate-ceremony-tests", file: join(libDir, "chat-gate-ceremony.test.mjs") },
  // NVA-A-060: both suites existed on disk but were never registered here, so the
  // gate reported green while neither ever ran. push-init.test.mjs covers the
  // push-path driver; semgrep-default-rules.test.mjs covers the shipped default
  // rule set. check-suite-registration.mjs named exactly these two.
  { name: "push-init-tests", file: join(pluginScriptsDir, "push-init.test.mjs") },
  { name: "runner-transcript-recovery-tests", file: join(pluginScriptsDir, "runner-transcript-recovery.test.mjs") },
  { name: "semgrep-default-rules-tests", file: join(repoRoot, "plugins", "pipeline-core", "config", "security", "semgrep-default-rules.test.mjs") },
  // NVA-DONEWHEN-1: the done_when predicate checker's own suite. It passed
  // standalone since the day it was written but never ran in the gate, which is
  // the exact shape of defect it exists to catch -- a declaration nothing
  // mechanically checks. check-suite-registration.mjs named it as the last
  // genuine opt-out; its two sibling entries were already stale.
  { name: "backlog-done-predicate-tests", file: join(pluginScriptsDir, "check-backlog-done-predicate.test.mjs") },
  // NVA-CF-VERIFYREG: 8 suites existed on disk but were never registered here (found by
  // Critic round-1, verified live via check-suite-registration.mjs), so the gate reported
  // green while none of them ever ran.
  { name: "generate-elephant-role-prohibitions-tests", file: join(scriptDir, "generate-elephant-role-prohibitions.test.mjs") },
  { name: "guard-push-scratch-advisory-tests", file: join(hooksDir, "guard-push-scratch-advisory.test.mjs") },
  { name: "critic-skip-decision-tests", file: join(libDir, "critic-skip-decision.test.mjs") },
  { name: "worktree-count-check-tests", file: join(libDir, "worktree-count-check.test.mjs") },
  { name: "browser-evidence-preflight-tests", file: join(pluginScriptsDir, "browser-evidence-preflight.test.mjs"), caseCompletion: {schema:"pipeline.verify-case-completion-policy.v1",caseIds:["RC20C001","RC20C002","RC20C003","RC20C004","RC20C005","RC20C006","RC20C007"],maxBytes:65536} },
  { name: "check-protected-path-integrity-tests", file: join(pluginScriptsDir, "check-protected-path-integrity.test.mjs") },
  { name: "check-resume-consumption-tests", file: join(pluginScriptsDir, "check-resume-consumption.test.mjs") },
  // NVA-CF-RESUMEGATE (2026-08-30, PO explicit request "bauen wir es jetzt ein sonst
  // findet es ja keiner"): check-resume-consumption.mjs's own header explained why it was
  // deliberately never registered here -- no live session id for a batch run to supply.
  // NVA-CF-RESUMECHECKANYSESSION (commit 2437d338) closed that gap with an --any-session
  // mode: PASS when no card is available or at least one recorded receipt (from any
  // session) matches the card's current digest; FATAL when a card is available and no
  // receipt anywhere matches -- the F12/F13 regression shape, now checked repo-wide.
  { name: "resume-consumption-check", file: join(pluginScriptsDir, "check-resume-consumption.mjs"), args: ["--root", repoRoot, "--any-session"] },
  { name: "check-state-phase-consistency-tests", file: join(pluginScriptsDir, "check-state-phase-consistency.test.mjs") },
  { name: "check-private-identifiers-tests", file: join(pluginScriptsDir, "check-private-identifiers.test.mjs") },
  { name: "pre-commit-hook-install-tests", file: join(pluginScriptsDir, "pre-commit-hook-install.test.mjs") },
  { name: "commit-msg-hook-install-tests", file: join(pluginScriptsDir, "commit-msg-hook-install.test.mjs") },
  { name: "manual-check-logic-tests", file: join(repoRoot, "harness", "scripts", "manual-check-logic.test.mjs") },
  { name: "pre-commit-hook-install-trust-anchor-bootstrap-tests", file: join(pluginScriptsDir, "pre-commit-hook-install.trust-anchor-bootstrap.test.mjs") },
  { name: "project-onboarding-v3-unborn-head-tests", file: join(pluginScriptsDir, "project-onboarding-v3-unborn-head.test.mjs") },
  { name: "print-verify-failures-tests", file: join(scriptDir, "print-verify-failures.test.mjs") },
  { name: "guard-push-release-tag-ancestry-tests", file: join(hooksDir, "guard-push-release-tag-ancestry.test.mjs") },
  { name: "check-critic-skip-coverage-tests", file: join(pluginScriptsDir, "check-critic-skip-coverage.test.mjs") },
  { name: "critic-skip-coverage-check", file: join(pluginScriptsDir, "check-critic-skip-coverage.mjs") },
  { name: "measure-tofu-push-e2e-tests", file: join(pluginScriptsDir, "measure-tofu-push-e2e.test.mjs") },
  { name: "suite-registration-check", file: join(pluginScriptsDir, "check-suite-registration.mjs") },
  { name: "pre-gate-tests", file: join(scriptDir, "pre-gate.test.mjs") },
  { name: "capture-evidence-tests", file: join(pluginScriptsDir, "capture-evidence.test.mjs") },
  { name: "verify-evidence-writer-tests", file: join(scriptDir, "verify-evidence-writer.test.mjs") },
  { name: "dispatch-record-strip-for-critic-tests", file: join(libDir, "dispatch-record-strip-for-critic.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 11 }, (_, index) => `DRS${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 } },
  { name: "design-workflow-package-tests", file: join(libDir, "design-workflow-package.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: ["DWP01", "DWP02", "DWP03", "DWP04", "DWP05", "DWP06", "DWP07", "DWP08", "DWP09", "DWP10", "DWP11", "DWP12", "DWP13", "DWP14", "DWP15", "DWP16", "DWP17", "DWP18", "DWP19", "DWP20", "DWP21"], maxBytes: 65_536 } },
  // Initial Advisor/course and revised final-package regressions.
  { name: "codex-advisor-execution-tests", file: join(libDir, "codex-advisor-execution.test.mjs"), caseCompletion: {schema:"pipeline.verify-case-completion-policy.v1",caseIds:["RC06C001","RC06C002","RC06C003","RC06C004","RC06C005","RC06C006","RC06C007"],maxBytes:65536} },
  { name: "design-advisor-course-store-tests", file: join(libDir, "design-advisor-course-store.test.mjs"), caseCompletion: {schema:"pipeline.verify-case-completion-policy.v1",caseIds:["RC08C001","RC08C002","RC08C003","RC08C004","RC08C005","RC08C006","RC08C007","RC08C008","RC08C009","RC08C010"],maxBytes:65536} },
  { name: "design-advisor-course-tests", file: join(libDir, "design-advisor-course.test.mjs"), caseCompletion: {schema:"pipeline.verify-case-completion-policy.v1",caseIds:["RC09C001","RC09C002","RC09C003","RC09C004","RC09C005","RC09C006"],maxBytes:65536} },
  { name: "design-advisor-provenance-tests", file: join(libDir, "design-advisor-provenance.test.mjs"), caseCompletion: {schema:"pipeline.verify-case-completion-policy.v1",caseIds:["RC10C001","RC10C002","RC10C003","RC10C004"],maxBytes:65536} },
  { name: "design-advisory-coordinator-v2-tests", file: join(libDir, "design-advisory-coordinator-v2.test.mjs"), caseCompletion: {schema:"pipeline.verify-case-completion-policy.v1",caseIds:["RC11C001","RC11C002","RC11C003"],maxBytes:65536} },
  { name: "design-workflow-package-v2-tests", file: join(libDir, "design-workflow-package-v2.test.mjs"), caseCompletion: {schema:"pipeline.verify-case-completion-policy.v1",caseIds:["RC12C001"],maxBytes:65536} },
];
const declarativeSuitesPath = join(repoRoot, "harness", "verify-suites.json");
const declarativeSuitesResult = loadDeclarativeVerifySuites(declarativeSuitesPath);
const augmentedDeclarativeSuitesResult = declarativeSuitesResult.ok
  ? loadAndApplyVerifyCaseCompletionAugmentations({ rootDir: repoRoot, suites: declarativeSuitesResult.suites })
  : declarativeSuitesResult;
let declarativeSuitesStep = null;
if (!augmentedDeclarativeSuitesResult.ok) {
  console.error(`VERIFY-DECLARATIVE-SUITES: ${augmentedDeclarativeSuitesResult.error}`);
  declarativeSuitesStep = { name: "declarative-verify-suites-registration", exitCode: 1 };
} else if (declarativeSuitesResult.exists) {
  for (const suite of augmentedDeclarativeSuitesResult.suites) {
    const entry = { name: suite.name, file: join(repoRoot, suite.file) };
    if (suite.caseCompletion) {
      entry.caseCompletion = suite.caseCompletion;
    }
    TEST_SUITES.push(entry);
  }
}


// Manifest-gated phase steps: see header — only projects that carry a manifest at
// their resolved authority tier (ADR-0054: `project/pipeline.yaml` or the legacy
// `.claude/pipeline.yaml`) get these two entries; everyone else keeps the
// suites-only step list.
const manifestPath = resolveAuthorityArtifactPath("manifest", { rootDir: repoRoot }).path;
// Distinguish confirmed absence from unreadable presence. Confirmed ENOENT preserves the
// suites-only evidence shape; any other read failure still runs validation and therefore
// fails closed instead of being misclassified as opt-out. Security remains present-only.
let manifestPresence = "present";
try {
  readFileSync(manifestPath, "utf8");
} catch (error) {
  manifestPresence = error && typeof error === "object" && error.code === "ENOENT" ? "absent" : "unreadable";
}
const PHASE_STEPS =
  manifestPresence === "absent"
    ? []
    : [
        { name: "validate-manifest", file: join(scriptDir, "validate-manifest.mjs") },
        ...(manifestPresence === "present" ? [{ name: "security-scan", file: join(pluginScriptsDir, "security-scan.mjs") }] : []),
      ];

// pipeline.verify-manual-check-placeholder-detection / pipeline.reject-unreplaced-manual-check-placeholder
// (NVA-R26-VERIFYPREP, backlog 2026-08-29-mandatory-verify-gate-has-no-path-for-a-project-with-no-tests-yet.md
// and 2026-08-29-verify-placeholder-manual-check-required-accepted-by-gate.md; pure logic
// extracted to ./manual-check-logic.mjs by NVA-CF-ITEM25EXTRACT so it is independently unit-
// testable -- this file has no isDirectInvocation guard, so importing verify.mjs itself for its
// exports would trigger the entire suite run as a side effect): a project's calibration
// (`project/pipeline.json`, or legacy `.claude/pipeline.json` -- ADR-0054) may declare an
// optional `verifyManualStatus` string field distinguishing three cases that would otherwise
// collapse into one indistinguishable "nothing to report" result: genuinely nothing configured
// yet (honestly declared, never a silent pass and never an indefinite block), a real filled-in
// manual-check note, or an unfilled scaffold placeholder that was never replaced (rejected as a
// FAILURE, never accepted as a pass). Absent field: no step is added and behavior is unchanged --
// this repo's own calibration carries no such field.
let manualVerifyCalibration = null;
try {
  const manualVerifyCalibrationPath = resolveAuthorityArtifactPath("calibration", { rootDir: repoRoot }).path;
  manualVerifyCalibration = JSON.parse(readFileSync(manualVerifyCalibrationPath, "utf8"));
} catch {
  // absent/unreadable calibration: no manual-verify field to read, no step added.
}
const manualVerifyResult = computeManualVerifyStep(manualVerifyCalibration);
if (manualVerifyResult.step && manualVerifyResult.step.name === "verify-manual-check-placeholder-rejected") {
  console.error(`VERIFY-MANUAL-CHECK-PLACEHOLDER: verifyManualStatus is the unreplaced scaffold placeholder ${JSON.stringify(UNREPLACED_MANUAL_CHECK_PLACEHOLDER)} -- replace it with a real result before Verify can pass.`);
}

const steps = [];
let verifyRun = null;
let verifyRunEvidence = null;
let execution = null;
let verifySelection = null;
// A known dirty candidate cannot produce delivery evidence.  Fail before any
// expensive or externally-dependent suite so this is an actionable preflight,
// not a misleading red full run.  Non-Git fixtures retain the historic
// portability behavior and report an unavailable (never exact) binding.
if (startedCandidate.status === "dirty") {
  console.error("VERIFY-CANDIDATE-PREFLIGHT: Commit or stash tracked changes before Verify; no suite was started.");
  steps.push({ name: "candidate-preflight", exitCode: 1 });
} else {
  const windowsAssuranceRegistration = validateWindowsAssuranceVerifyRegistration(WINDOWS_ASSURANCE_VERIFY_REGISTRATION);
  if (!windowsAssuranceRegistration.ok) {
    console.error(`Invalid Windows-assurance Verify registration: ${windowsAssuranceRegistration.code}`);
    steps.push({ name: "windows-assurance-verify-registration", exitCode: 1 });
  } else {
    const scopedRegistration = validateScopedVerifyRegistration(SCOPED_VERIFY_REGISTRATION);
    if (!scopedRegistration.ok) {
      console.error(`Invalid scoped Verify registration: ${scopedRegistration.code}`);
      steps.push({ name: "scoped-verify-registration", exitCode: 1 });
    } else if (declarativeSuitesStep !== null) {
      steps.push(declarativeSuitesStep);
    } else {
      const scopedTests = SCOPED_VERIFY_SUITES.map((suite) => ({ name: suite.name, file: join(repoRoot, suite.file) }));
      const windowsAssuranceTests = WINDOWS_ASSURANCE_VERIFY_SUITES.map((suite) => ({ name: suite.name, file: join(repoRoot, suite.file) }));
      const phaseSteps = PHASE_STEPS.map((suite, index) => ({ ...suite, dependsOn: index === 0 ? [] : [PHASE_STEPS[index - 1].name] }));
      const registeredSuites = [...TEST_SUITES, ...scopedTests, ...windowsAssuranceTests, ...phaseSteps];
      // AC-P3/R1.4: report a duplicate registration as a step rather than letting
      // planVerifyResume throw before any suite runs. Without this the registration check
      // below never executes for the defect class it was written to catch, because the
      // throw aborts the whole journal.
      const registrationDuplicates = duplicateSuiteIds(registeredSuites);
      if (registrationDuplicates.length > 0) {
        for (const duplicate of registrationDuplicates) {
          console.error(`VERIFY-REGISTRATION-DUPLICATE: suite id ${JSON.stringify(duplicate.id)} is registered ${duplicate.count} times`);
        }
        steps.push({ name: "verify-suite-registration-duplicates", exitCode: 1 });
      } else {
        try {
          const resolvedSelection = resolveSelfVerifySelection({ repoRoot, candidateCommit: startedCandidate.commit, registeredSuites, invocation });
          verifySelection = resolvedSelection.selection;
          verifyRun = await runVerifyJournal({
            gitCommonDir: gitCommonDirectory(),
            runId,
            repoRoot,
            candidate: { commit: startedCandidate.commit, tree: startedCandidate.tree },
            suites: resolvedSelection.suites,
            policyInputs: {
              command,
              harnessSha256: createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex"),
              phase26Result,
              phase3Result,
              selectionSha256: verifySelection.selectionSha256,
            },
            allowCrossCandidateReuse: verifySelection.execution === "impacted",
            reuseReceipts: invocation.reuseReceipts,
          });
          steps.push(...verifyRun.steps.map(({ name, exitCode, durationMs, reused }) => ({ name, exitCode, durationMs, reused })));
          execution = verifyRun.execution;
          verifyRunEvidence = createPublicVerifyRunEvidence({
            runId: verifyRun.runId,
            policySha256: verifyRun.policySha256,
            resumePlanSha256: verifyRun.plan.planSha256,
            terminalSha256: verifyRun.terminal.terminalSha256,
            registeredSuiteCount: resolvedSelection.suites.length,
            terminalReceiptCount: verifyRun.terminal.receipts.length,
            terminalStatus: verifyRun.terminal.status,
            receiptReuse: invocation.reuseReceipts ? "allowed" : "disabled",
          });
          if (verifyRunEvidence.status !== "passed" && steps.every((step) => step.exitCode === 0)) {
            steps.push({ name: "verify-terminal-coverage", exitCode: 1 });
          }
        } catch (error) {
          const diagnostic = error instanceof Error ? error.message.slice(0, 256) : "VERIFY-JOURNAL-UNAVAILABLE";
          console.error(`VERIFY-JOURNAL-FAILED: ${diagnostic}`);
          steps.push({ name: "verify-journal", exitCode: 1 });
        }
      }
    }
  }
}

if (manualVerifyResult.step) steps.push(manualVerifyResult.step);

const finishedCandidate = candidateIdentity();
// An `approval-pending` candidate earns the same stability obligation as a clean one: the
// tolerated dirt is a fixed, already-classified record, so any further movement while the
// suites ran is drift exactly as it would be on a pristine tree.
if (startedCandidate.status === "clean" || startedCandidate.status === NOVA_APPROVAL_PENDING_STATUS) {
  const stable = finishedCandidate.status === startedCandidate.status
    && startedCandidate.commit === finishedCandidate.commit
    && startedCandidate.tree === finishedCandidate.tree;
  if (!stable) {
    console.error("VERIFY-CANDIDATE-DRIFT: Verify requires one clean, unchanged Git candidate from start through evidence write.");
    steps.push({ name: "candidate-binding", exitCode: 1 });
  }
}
const overallExitCode = steps.find((s) => s.exitCode !== 0)?.exitCode ?? 0;
const commit = startedCandidate.commit ?? "unknown";

const evidence = {
  schema: "pipeline.verify-evidence.v0",
  execution,
  project: "agent-pipeline",
  command,
  commit,
  tree: startedCandidate.tree ?? "unknown",
  candidate: {
    start: startedCandidate,
    finish: finishedCandidate,
    // `approval-pending` is deliberately NOT `exact`: a run under an armed push approval must
    // never be readable as a run on a pristine tree (ADR-0061 Change 3).
    binding: startedCandidate.status === "unavailable" ? "unavailable" : startedCandidate.status === "dirty" ? "preflight-rejected" : steps.some((step) => step.name === "candidate-binding") ? "drift" : startedCandidate.status === NOVA_APPROVAL_PENDING_STATUS ? NOVA_APPROVAL_PENDING_BINDING : "exact",
  },
  startedAt: verifyStartedAt,
  finishedAt: new Date().toISOString(),
  steps,
  verifyRun: verifyRunEvidence,
  selection: verifySelection,
  coverage: "repository-calibrated",
  verifyManualStatus: manualVerifyResult.evidence,
  exitCode: overallExitCode,
};

const verificationActionSource = verificationActionPlan === null ? null : buildSelfVerifyGovernanceSource({
  evidence, startedCandidate, finishedCandidate, overallExitCode,
});
const verificationActionEvent = verificationActionSource === null ? null : buildGovernanceVerificationAction(verificationActionSource);
const verificationActionSourceStatus = verificationActionSource?.outcome ?? "unavailable";

writeEvidence(evidence, "terminal");

let verificationActionResult = null;
if (verificationActionPlan !== null) {
  if (verificationActionEvent === null) {
    verificationActionResult = { status: "source-unavailable", sourceStatus: "unavailable", eventOutPath: verificationActionPlan.eventOutPath };
  } else {
    let sourceReadback = null;
    try { sourceReadback = JSON.parse(readFileSync(runEvidencePath, "utf8")); } catch { sourceReadback = null; }
    if (JSON.stringify(sourceReadback) !== JSON.stringify(evidence)) {
      verificationActionResult = { status: "source-complete/event-unavailable", sourceStatus: verificationActionSourceStatus, code: "VERIFY-ACTION-SOURCE-READBACK", eventOutPath: verificationActionPlan.eventOutPath };
    } else {
      try {
        const written = writeGovernanceVerificationAction({ rootDir: primaryRoot, eventOutPath: verificationActionPlan.eventOutPath, event: verificationActionEvent });
        verificationActionResult = { status: "event-written", sourceStatus: verificationActionSourceStatus, eventOutPath: verificationActionPlan.eventOutPath, eventId: written.event.eventId };
      } catch {
        verificationActionResult = {
          status: "source-complete/event-unavailable",
          sourceStatus: verificationActionSourceStatus,
          eventOutPath: verificationActionPlan.eventOutPath,
          eventRetry: buildGovernanceVerificationRetry({ eventOutPath: verificationActionPlan.eventOutPath, event: verificationActionEvent }),
        };
      }
    }
  }
  console.log(JSON.stringify({ schema: "pipeline.verify-governance-action-result.v1", ...verificationActionResult }));
}

console.log(`\nEvidence written: ${evidencePath} (run record: ${runEvidencePath})`);
console.log(`Overall: ${steps.map((s) => `${s.name}=${s.exitCode}`).join(", ")} -> exit ${overallExitCode}`);

const finalExitCode = overallExitCode === 0 && verificationActionResult?.status === "source-complete/event-unavailable" ? 2 : overallExitCode;
process.exit(finalExitCode);
