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
 * Evidence artifact: written to `evidence/verify-latest.json` (git-ignored — see
 * root .gitignore; a fresh, regenerated-every-run status snapshot is not a durable
 * audit trail like the override ledger, and committing it would create stale-diff
 * noise on every run). ONE canonical path, overwritten each run — no registry (#2 CUT).
 *
 * Exit code: 0 iff every step exited 0; the first non-zero step's code otherwise
 * (mirrors `npm run`-style aggregation). Complete suite stdout/stderr stays in
 * owner-private bounded logs; the interactive channel receives only bounded
 * machine-readable start/terminal progress records.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAuthorityArtifactPath } from "../../plugins/pipeline-core/lib/project-authority.mjs";
import { validateScopedVerifyRegistration } from "../../plugins/pipeline-core/lib/scoped-verify-registration.mjs";
import { validateWindowsAssuranceVerifyRegistration } from "../../plugins/pipeline-core/lib/windows-assurance-verify-registration.mjs";
import { createPublicVerifyRunEvidence } from "../../plugins/pipeline-core/lib/verify-resume.mjs";
import { runVerifyJournal } from "../../plugins/pipeline-core/scripts/verify-journal.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const phase26Result = process.env.PIPELINE_PHASE26_RESULT ?? null;
const phase3Result = process.env.PIPELINE_PHASE3_RESULT ?? null;
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
    return {
      status: worktree.stdout === "" ? "clean" : "dirty",
      commit: commit.stdout.trim(),
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
const command = "node harness/scripts/verify.mjs";
const evidenceDir = join(repoRoot, "evidence");
const evidencePath = join(evidenceDir, "verify-latest.json");
const verifyStartedAt = new Date().toISOString();
function writeEvidence(evidence) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
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
});
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
  { name: "routing-projection-tests", file: join(pluginScriptsDir, "check-routing-projections.test.mjs") },
  { name: "routing-projection-check", file: join(pluginScriptsDir, "check-routing-projections.mjs") },
  { name: "route-receipt-tests", file: join(libDir, "route-receipt.test.mjs") },
  { name: "recovery-preview-attestation-tests", file: join(libDir, "recovery-preview-attestation.test.mjs") },
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
  { name: "codex-critic-host-tests", file: join(pluginScriptsDir, "codex-critic-host.test.mjs") },
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
  { name: "wsl-ipc-compatibility-tests", file: join(libDir, "wsl-ipc-compatibility.test.mjs") },
  { name: "session-power-core-tests", file: join(libDir, "session-power.test.mjs") },
  { name: "session-power-controller-tests", file: join(pluginScriptsDir, "session-power-controller.test.mjs") },
  { name: "session-power-cli-tests", file: join(pluginScriptsDir, "session-power.test.mjs") },
  { name: "session-cleanup-power-tests", file: join(pluginScriptsDir, "session-cleanup-power.test.mjs") },
  { name: "session-cleanup-binding-tests", file: join(pluginScriptsDir, "session-cleanup-binding.test.mjs") },
  { name: "human-guard-override-tests", file: join(libDir, "human-guard-override.test.mjs") },
  { name: "guard-maintenance-window-tests", file: join(libDir, "guard-maintenance-window.test.mjs") },
  { name: "review-economy-tests", file: join(libDir, "review-economy.test.mjs") },
  { name: "guard-git-tests", file: join(hooksDir, "guard-git.test.mjs") },
  { name: "guard-apply-patch-tests", file: join(hooksDir, "guard-apply-patch.test.mjs") },
  { name: "guard-testpath-tests", file: join(hooksDir, "guard-testpath.test.mjs") },
  { name: "staleness-check-tests", file: join(hooksDir, "staleness-check.test.mjs") },
  { name: "guard-devplan-tests", file: join(hooksDir, "guard-devplan.test.mjs") },
  { name: "guard-lifecycle-ready-tests", file: join(hooksDir, "guard-lifecycle-ready.test.mjs") },
  { name: "pipeline-state-revocation-tests", file: join(pluginScriptsDir, "pipeline-state-revocation.test.mjs") },
  { name: "pipeline-state-rebind-runner-tests", file: join(pluginScriptsDir, "pipeline-state-rebind-runner.test.mjs") },
  { name: "codex-pretool-guard-tests", file: join(hooksDir, "codex-pretool-guard.test.mjs") },
  { name: "codex-session-start-hint-tests", file: join(hooksDir, "codex-session-start-hint.test.mjs") },
  { name: "guard-push-tests", file: join(hooksDir, "guard-push.test.mjs") },
  { name: "guard-push-v2-tests", file: join(hooksDir, "guard-push-v2.test.mjs") },
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
  { name: "runner-profile-migration-v3-tests", file: join(libDir, "runner-profile-migration-v3.test.mjs") },
  { name: "project-onboarding-v3-tests", file: join(libDir, "project-onboarding-v3.test.mjs") },
  { name: "project-onboarding-ready-gate-tests", file: join(libDir, "project-onboarding-ready-gate.test.mjs") },
  { name: "codex-onboarding-runtime-tests", file: join(libDir, "codex-onboarding-runtime.test.mjs") },
  { name: "codex-onboarding-capabilities-tests", file: join(libDir, "codex-onboarding-capabilities.test.mjs") },
  { name: "onboarding-continuity-tests", file: join(libDir, "onboarding-continuity.test.mjs") },
  { name: "codex-onboarding-app-server-tests", file: join(libDir, "codex-onboarding-app-server.test.mjs") },
  { name: "v3-bootstrap-authority-tests", file: join(pluginScriptsDir, "v3-bootstrap-authority.test.mjs") },
  { name: "project-onboarding-e2e-tests", file: join(pluginScriptsDir, "project-onboarding-e2e.test.mjs") },
  // ADR-0051/ADR-0057 R1: walks the consumer chain executing each returned action
  // verbatim, which is how the identity substitution was found in the first place.
  { name: "onboarding-runner-identity-tests", file: join(pluginScriptsDir, "onboarding-runner-identity.test.mjs") },
  { name: "project-authority-tests", file: join(libDir, "project-authority.test.mjs") },
  { name: "project-authority-migration-cli-tests", file: join(pluginScriptsDir, "project-authority-migration.test.mjs") },
  { name: "feature-package-topology-tests", file: join(libDir, "feature-package-topology.test.mjs") },
  { name: "human-role-label-tests", file: join(libDir, "human-role-labels.test.mjs") },
  { name: "human-role-rendering-tests", file: join(libDir, "human-role-rendering.test.mjs") },
  { name: "advisory-receipt-tests", file: join(libDir, "advisory-receipt.test.mjs") },
  { name: "advisory-lifecycle-v2-tests", file: join(libDir, "advisory-lifecycle-v2.test.mjs") },
  { name: "advisory-coordinator-tests", file: join(libDir, "advisory-coordinator.test.mjs") },
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
  { name: "guard-dispatch-tests", file: join(hooksDir, "guard-dispatch.test.mjs") },
  { name: "advisor-consult-v3-tests", file: join(repoRoot, "plugins", "pipeline-core", "skills", "advisor-consult", "advisor-consult-v3.test.mjs") },
  { name: "sandboxed-readonly-duty-tests", file: join(libDir, "sandboxed-readonly-duty.test.mjs") },
  { name: "sandboxed-readonly-host-bridge-tests", file: join(pluginScriptsDir, "sandboxed-readonly-host-bridge.test.mjs") },
  { name: "spec-readiness-host-tests", file: join(pluginScriptsDir, "spec-readiness-host.test.mjs") },
  { name: "pipeline-start-v3-tests", file: join(repoRoot, "plugins", "pipeline-core", "skills", "pipeline-start", "pipeline-start-v3.test.mjs") },
  { name: "pipeline-start-preflight-tests", file: join(pluginScriptsDir, "pipeline-start-preflight.test.mjs") },
  { name: "runner-usage-v1-tests", file: join(libDir, "runner-usage-v1.test.mjs") },
  { name: "p3b-runner-conformance-tests", file: join(libDir, "p3b-runner-conformance.test.mjs") },
  { name: "git-cmd-tests", file: join(libDir, "git-cmd.test.mjs") },
  { name: "workflow-writer-preflight-tests", file: join(libDir, "workflow-writer-preflight.test.mjs") },
  { name: "workflow-runner-boundary-tests", file: join(libDir, "workflow-runner-boundary.test.mjs") },
  { name: "control-execution-exchange-tests", file: join(libDir, "control-execution-exchange.test.mjs") },
  { name: "security-policy-resolver-tests", file: join(libDir, "security-policy-resolver.test.mjs") },
  { name: "control-catalog-schema-tests", file: join(libDir, "control-catalog-schema.test.mjs") },
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
  { name: "stack-adapter-contract-tests", file: join(libDir, "stack-adapter-contract.test.mjs") },
  { name: "stack-dynamic-boundary-tests", file: join(libDir, "stack-dynamic-boundary.test.mjs") },
  { name: "stack-fuzz-replay-tests", file: join(libDir, "stack-fuzz-replay.test.mjs") },
  { name: "stack-discovery-tests", file: join(libDir, "stack-discovery.test.mjs") },
  { name: "stack-run-outcome-tests", file: join(libDir, "stack-run-outcome.test.mjs") },
  { name: "threat-model-discovery-tests", file: join(libDir, "threat-model-discovery.test.mjs") },
  { name: "threat-model-fixture-matrix-tests", file: join(libDir, "threat-model-fixture-matrix.test.mjs") },
  { name: "threat-model-tests", file: join(libDir, "threat-model.test.mjs") },
  { name: "po-approval-proof-tests", file: join(libDir, "po-approval-proof.test.mjs") },
  { name: "critical-human-proof-policy-tests", file: join(libDir, "critical-human-proof-policy.test.mjs") },
  // Registered in the same commit that created them. An unregistered suite is not a test
  // Verify forgot to run -- it is a test that protects nothing, and the gap is invisible
  // precisely because the file exists and passes when run by hand.
  { name: "critical-action-authorization-tests", file: join(libDir, "critical-action-authorization.test.mjs") },
  { name: "commit-message-policy-tests", file: join(libDir, "commit-message-policy.test.mjs") },
  { name: "dispatch-policy-tests", file: join(libDir, "dispatch-policy.test.mjs") },
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
  { name: "private-document-binding-tests", file: join(pluginScriptsDir, "document-binding.test.mjs") },
  { name: "release-version-plan-tests", file: join(pluginScriptsDir, "release-version-plan.test.mjs") },
  { name: "product-capability-inventory-tests", file: join(scriptDir, "check-product-capability-inventory.test.mjs") },
  { name: "pipeline-state-tests", file: join(scriptDir, "pipeline-state.test.mjs") },
  { name: "doc-contract-tests", file: join(scriptDir, "check-doc-contracts.test.mjs") },
  { name: "doc-contract-check", file: join(scriptDir, "check-doc-contracts.mjs") },
  { name: "authority-tier-agreement-tests", file: join(scriptDir, "check-authority-tier-agreement.test.mjs") },
  { name: "authority-tier-agreement-check", file: join(scriptDir, "check-authority-tier-agreement.mjs") },
  { name: "language-canon-tests", file: join(scriptDir, "check-language-canon.test.mjs") },
  { name: "language-canon-check", file: join(scriptDir, "check-language-canon.mjs") },
  { name: "license-contract-tests", file: join(scriptDir, "check-license-contract.test.mjs") },
  { name: "license-contract-check", file: join(scriptDir, "check-license-contract.mjs") },
  { name: "pr-contributor-gate-tests", file: join(scriptDir, "check-pr-contributor-gates.test.mjs") },
  { name: "security-scan-tests", file: join(scriptDir, "security-scan.test.mjs") },
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
  { name: "parallel-dispatch-planner-tests", file: join(libDir, "parallel-dispatch-planner.test.mjs") },
  { name: "parallel-sprint-integration-tests", file: join(libDir, "parallel-sprint-integration.test.mjs") },
  { name: "continuity-status-tests", file: join(libDir, "continuity-status.test.mjs") },
  { name: "continuity-status-cli-tests", file: join(pluginScriptsDir, "continuity-status.test.mjs") },
  { name: "delivery-course-tests", file: join(libDir, "delivery-course.test.mjs") },
  { name: "critic-packet-governance-tests", file: join(libDir, "critic-packet-governance.test.mjs") },
  { name: "critic-dispatch-preflight-tests", file: join(pluginScriptsDir, "critic-dispatch-preflight.test.mjs") },
  { name: "windows-private-state-tests", file: join(libDir, "windows-private-state.test.mjs") },
  { name: "symlink-capability-tests", file: join(libDir, "symlink-capability.test.mjs") },
  { name: "runner-native-continuation-tests", file: join(libDir, "runner-native-continuation.test.mjs") },
  { name: "bootstrap-payload-budget-tests", file: join(libDir, "bootstrap-payload-budget.test.mjs") },
  { name: "bootstrap-payload-measure-cli-tests", file: join(pluginScriptsDir, "bootstrap-payload-measure.test.mjs") },
  { name: "local-supervisor-state-tests", file: join(libDir, "local-supervisor-state.test.mjs") },
  { name: "local-supervisor-setup-tests", file: join(pluginScriptsDir, "local-supervisor-setup.test.mjs") },
  { name: "local-worker-supervisor-core-tests", file: join(libDir, "local-worker-supervisor.test.mjs") },
  { name: "local-worker-supervisor-cli-tests", file: join(pluginScriptsDir, "local-worker-supervisor.test.mjs") },
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
  { name: "nova-verify-journal-tests", file: join(pluginScriptsDir, "verify-journal.test.mjs") },
];

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
        ...(manifestPresence === "present" ? [{ name: "security-scan", file: join(scriptDir, "security-scan.mjs") }] : []),
      ];

const steps = [];
let verifyRun = null;
let verifyRunEvidence = null;
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
    } else {
      const scopedTests = SCOPED_VERIFY_SUITES.map((suite) => ({ name: suite.name, file: join(repoRoot, suite.file) }));
      const windowsAssuranceTests = WINDOWS_ASSURANCE_VERIFY_SUITES.map((suite) => ({ name: suite.name, file: join(repoRoot, suite.file) }));
      const phaseSteps = PHASE_STEPS.map((suite, index) => ({ ...suite, dependsOn: index === 0 ? [] : [PHASE_STEPS[index - 1].name] }));
      const registeredSuites = [...TEST_SUITES, ...scopedTests, ...windowsAssuranceTests, ...phaseSteps];
      try {
        verifyRun = runVerifyJournal({
          gitCommonDir: gitCommonDirectory(),
          repoRoot,
          candidate: { commit: startedCandidate.commit, tree: startedCandidate.tree },
          suites: registeredSuites,
          policyInputs: {
            command,
            harnessSha256: createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex"),
            phase26Result,
            phase3Result,
          },
        });
        steps.push(...verifyRun.steps.map(({ name, exitCode }) => ({ name, exitCode })));
        verifyRunEvidence = createPublicVerifyRunEvidence({
          runId: verifyRun.runId,
          policySha256: verifyRun.policySha256,
          resumePlanSha256: verifyRun.plan.planSha256,
          terminalSha256: verifyRun.terminal.terminalSha256,
          registeredSuiteCount: registeredSuites.length,
          terminalReceiptCount: verifyRun.terminal.receipts.length,
          terminalStatus: verifyRun.terminal.status,
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

const finishedCandidate = candidateIdentity();
if (startedCandidate.status === "clean") {
  const stable = finishedCandidate.status === "clean"
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
  project: "agent-pipeline",
  command,
  commit,
  tree: startedCandidate.tree ?? "unknown",
  candidate: {
    start: startedCandidate,
    finish: finishedCandidate,
    binding: startedCandidate.status === "unavailable" ? "unavailable" : startedCandidate.status === "dirty" ? "preflight-rejected" : steps.some((step) => step.name === "candidate-binding") ? "drift" : "exact",
  },
  startedAt: verifyStartedAt,
  finishedAt: new Date().toISOString(),
  steps,
  verifyRun: verifyRunEvidence,
  exitCode: overallExitCode,
};

writeEvidence(evidence);

console.log(`\nEvidence written: ${evidencePath}`);
console.log(`Overall: ${steps.map((s) => `${s.name}=${s.exitCode}`).join(", ")} -> exit ${overallExitCode}`);

process.exit(overallExitCode);
