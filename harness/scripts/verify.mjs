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
 * layer (`.claude/pipeline.yaml` present), two extra steps run after the suites:
 * validate-manifest (exit 2 on an invalid manifest, fail-closed once a manifest
 * EXISTS) and security-scan (adapter statuses PASS|FINDINGS|SKIPPED|ERROR; SKIPPED
 * never blocks, so machines without the scanner binaries stay green — QG-05 honesty
 * lives in the evidence artifact, not in a false red). No manifest -> step list stays
 * suites-only, so manifest-less projects keep the pre-AP1 verify shape (regression guard).
 *
 * Full chain note (QG-01/QG-02): this repo's calibration (`.claude/pipeline.json`,
 * field `verification: "docs+tests"`) has no separate format/lint/typecheck/build
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
 * (mirrors `npm run`-style aggregation). stdout of both suites is passed through
 * unchanged so a human sees the same PASS/FAIL lines the suites themselves print.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateScopedVerifyRegistration } from "../../plugins/pipeline-core/lib/scoped-verify-registration.mjs";
import { validateWindowsAssuranceVerifyRegistration } from "../../plugins/pipeline-core/lib/windows-assurance-verify-registration.mjs";

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
    const worktree = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=no"], { encoding: "utf8", cwd: repoRoot });
    if (commit.status !== 0 || tree.status !== 0 || worktree.status !== 0) return { status: "unavailable", commit: null, tree: null };
    return {
      status: worktree.stdout === "" ? "clean" : "dirty",
      commit: commit.stdout.trim(),
      tree: tree.stdout.trim(),
    };
  } catch { return { status: "unavailable", commit: null, tree: null }; }
}
const startedCandidate = candidateIdentity();
const command = "node harness/scripts/verify.mjs";
const evidenceDir = join(repoRoot, "evidence");
const evidencePath = join(evidenceDir, "verify-latest.json");
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
  startedAt: new Date().toISOString(),
  finishedAt: null,
  steps: [{ name: "verify-running", exitCode: 1 }],
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
  { name: "state-budget-tests", file: join(pluginScriptsDir, "check-state-budgets.test.mjs") },
  { name: "state-budget-check", file: join(pluginScriptsDir, "check-state-budgets.mjs") },
  { name: "repository-freshness-tests", file: join(pluginScriptsDir, "repository-freshness.test.mjs") },
  { name: "ruleset-freshness-tests", file: join(pluginScriptsDir, "ruleset-freshness.test.mjs") },
  { name: "bootstrap-env-check-tests", file: join(pluginScriptsDir, "bootstrap-env-check.test.mjs") },
  { name: "critic-bare-tests", file: join(pluginScriptsDir, "critic-bare.test.mjs") },
  { name: "codex-critic-host-tests", file: join(pluginScriptsDir, "codex-critic-host.test.mjs") },
  { name: "claude-critic-host-tests", file: join(pluginScriptsDir, "critic-claude-host.test.mjs") },
  { name: "continuity-host-adapter-tests", file: join(libDir, "continuity-host-adapter.test.mjs") },
  { name: "continuity-state-tests", file: join(libDir, "continuity-state.test.mjs") },
  { name: "main-session-route-tests", file: join(libDir, "main-session-route.test.mjs") },
  { name: "session-power-core-tests", file: join(libDir, "session-power.test.mjs") },
  { name: "session-power-controller-tests", file: join(pluginScriptsDir, "session-power-controller.test.mjs") },
  { name: "session-power-cli-tests", file: join(pluginScriptsDir, "session-power.test.mjs") },
  { name: "session-cleanup-power-tests", file: join(pluginScriptsDir, "session-cleanup-power.test.mjs") },
  { name: "review-economy-tests", file: join(libDir, "review-economy.test.mjs") },
  { name: "guard-git-tests", file: join(hooksDir, "guard-git.test.mjs") },
  { name: "guard-testpath-tests", file: join(hooksDir, "guard-testpath.test.mjs") },
  { name: "staleness-check-tests", file: join(hooksDir, "staleness-check.test.mjs") },
  { name: "guard-devplan-tests", file: join(hooksDir, "guard-devplan.test.mjs") },
  { name: "guard-push-tests", file: join(hooksDir, "guard-push.test.mjs") },
  { name: "stop-suggest-tests", file: join(hooksDir, "stop-suggest.test.mjs") },
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
  { name: "project-authority-tests", file: join(libDir, "project-authority.test.mjs") },
  { name: "project-authority-migration-cli-tests", file: join(pluginScriptsDir, "project-authority-migration.test.mjs") },
  { name: "feature-package-topology-tests", file: join(libDir, "feature-package-topology.test.mjs") },
  { name: "human-role-label-tests", file: join(libDir, "human-role-labels.test.mjs") },
  { name: "human-role-rendering-tests", file: join(libDir, "human-role-rendering.test.mjs") },
  { name: "advisory-receipt-tests", file: join(libDir, "advisory-receipt.test.mjs") },
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
  { name: "codex-host-advisor-route-tests", file: join(pluginScriptsDir, "codex-host-advisor-route.test.mjs") },
  { name: "host-advisor-status-tests", file: join(libDir, "host-advisor-status.test.mjs") },
  { name: "host-advisor-workspace-tests", file: join(pluginScriptsDir, "host-advisor-workspace.test.mjs") },
  { name: "codex-plugin-validator-parity-tests", file: join(pluginScriptsDir, "codex-plugin-validator-parity.test.mjs") },
  { name: "worktree-lifecycle-tests", file: join(libDir, "worktree-lifecycle.test.mjs") },
  { name: "advisor-consult-v3-tests", file: join(repoRoot, "plugins", "pipeline-core", "skills", "advisor-consult", "advisor-consult-v3.test.mjs") },
  { name: "sandboxed-readonly-duty-tests", file: join(libDir, "sandboxed-readonly-duty.test.mjs") },
  { name: "sandboxed-readonly-host-bridge-tests", file: join(pluginScriptsDir, "sandboxed-readonly-host-bridge.test.mjs") },
  { name: "spec-readiness-host-tests", file: join(pluginScriptsDir, "spec-readiness-host.test.mjs") },
  { name: "pipeline-start-v3-tests", file: join(repoRoot, "plugins", "pipeline-core", "skills", "pipeline-start", "pipeline-start-v3.test.mjs") },
  { name: "runner-usage-v1-tests", file: join(libDir, "runner-usage-v1.test.mjs") },
  { name: "p3b-runner-conformance-tests", file: join(libDir, "p3b-runner-conformance.test.mjs") },
  { name: "git-cmd-tests", file: join(libDir, "git-cmd.test.mjs") },
  { name: "workflow-writer-preflight-tests", file: join(libDir, "workflow-writer-preflight.test.mjs") },
  { name: "workflow-runner-boundary-tests", file: join(libDir, "workflow-runner-boundary.test.mjs") },
  { name: "control-execution-exchange-tests", file: join(libDir, "control-execution-exchange.test.mjs") },
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
  { name: "parallel-dispatch-planner-tests", file: join(libDir, "parallel-dispatch-planner.test.mjs") },
  { name: "continuity-status-tests", file: join(libDir, "continuity-status.test.mjs") },
  { name: "continuity-status-cli-tests", file: join(pluginScriptsDir, "continuity-status.test.mjs") },
  { name: "delivery-course-tests", file: join(libDir, "delivery-course.test.mjs") },
  { name: "critic-packet-governance-tests", file: join(libDir, "critic-packet-governance.test.mjs") },
];

// Manifest-gated phase steps: see header — only projects with `.claude/pipeline.yaml`
// get these two entries; everyone else keeps the suites-only step list.
const manifestPath = join(repoRoot, ".claude", "pipeline.yaml");
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
      for (const suite of [...TEST_SUITES, ...scopedTests, ...windowsAssuranceTests, ...PHASE_STEPS]) {
        console.log(`\n=== ${suite.name} (${suite.file}) ===`);
        const res = spawnSync(process.execPath, [suite.file, ...(suite.args ?? [])], { encoding: "utf8", cwd: repoRoot });
        if (res.stdout) process.stdout.write(res.stdout);
        if (res.stderr) process.stderr.write(res.stderr);
        const exitCode = res.status ?? 1;
        steps.push({ name: suite.name, exitCode });
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
  finishedAt: new Date().toISOString(),
  steps,
  exitCode: overallExitCode,
};

writeEvidence(evidence);

console.log(`\nEvidence written: ${evidencePath}`);
console.log(`Overall: ${steps.map((s) => `${s.name}=${s.exitCode}`).join(", ")} -> exit ${overallExitCode}`);

process.exit(overallExitCode);
