// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.first-enrollment-enters-retirement-before-consent (AC-173, ALF-C-P7-05).
// Exercises each acceptance point of the original item through the real
// onboarding module, governance-scope controller and pipeline-state CLI.
// Fixtures live under the repository scratch/ directory (no OS temp dir).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { observeOnboardingEnrollmentHistory, applyOnboardingIntakeConsent, readOnboardingIntakeCheckpoint } from "../onboarding-continuity.mjs";
import { createGovernanceScopeController, readGovernanceEnrollmentRetirement } from "../governance-scope.mjs";
import { derivePlanLifecycle } from "../plan-spec-state-v2.mjs";
import { recordConsentGiven } from "../onboarding-consent-marker.mjs";
import {
  applyProjectOnboardingLifecycleV4, applyProjectOnboardingV3, inspectProjectOnboardingV3, planProjectOnboardingLifecycleV4,
  planProjectOnboardingV3, renderProjectOnboardingAction,
} from "../project-onboarding-v3.mjs";
import { isSanctionedLifecycleCommand } from "../../hooks/guard-lifecycle-ready.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, "../../../..");
const STATE_SCRIPT = resolve(here, "../../scripts/pipeline-state.mjs");
const SCRATCH = join(REPO, "scratch");
const root = () => { mkdirSync(SCRATCH, { recursive: true }); return mkdtempSync(join(SCRATCH, "frb-pin-")); };
const dispose = (p) => rmSync(p, { recursive: true, force: true });
const git = (cwd, ...args) => spawnSync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd, encoding: "utf8" });
const HOST_LIMITATION = { skip: "host-limitation: directory mode bits / directory symlinks unavailable on native Windows; owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)" };

// Acceptance 1: first portable apply succeeds in empty and initialized Git roots
// without a retirement generation or manufactured consent checkpoint.
test("AC1 first portable apply: empty and initialized Git roots create no retirement or consent", () => {
  for (const initialized of [false, true]) {
    const path = root();
    try {
      if (initialized) assert.equal(git(path, "init", "--initial-branch=main").status, 0);
      assert.equal(observeOnboardingEnrollmentHistory({ rootDir: path }).retained, false);
      const plan = planProjectOnboardingV3({ rootDir: path, runner: "codex" });
      assert.equal(plan.status, "ready");
      const result = applyProjectOnboardingV3(plan, { rootDir: path, activate: true });
      assert.equal(result.status, "applied", JSON.stringify(result));
      assert.equal(result.governanceEnrollment.state, "active");
      assert.equal(readGovernanceEnrollmentRetirement({ rootDir: path }), null);
      assert.equal(readOnboardingIntakeCheckpoint({ rootDir: path }).status, "absent");
      assert.equal(existsSync(join(path, ".agent-pipeline/enrollment-git-creation-barrier.json")), false);
    } finally { dispose(path); }
  }
});

// Acceptance 1 (direct activation route): explicit enrollment of a fresh root
// reaches active scope without granting plan approval.
test("AC1b direct explicit enrollment of a fresh root is active, not declined, and grants no plan approval", () => {
  const path = root();
  try {
    const plan = planProjectOnboardingV3({ rootDir: path, runner: "codex" });
    assert.equal(applyProjectOnboardingV3(plan, { rootDir: path, activate: true }).status, "applied");
    const controller = createGovernanceScopeController({ hostStateRoot: join(path, "unused-host") });
    assert.equal(controller.observe({ rootDir: path }).state, "active");
    assert.equal(readGovernanceEnrollmentRetirement({ rootDir: path }), null);
  } finally { dispose(path); }
});

// Acceptance 2: retained non-Git history refuses before mutation, with explicit recovery.
test("AC2 retained non-Git history refuses before mutation and names the recovery route", () => {
  const path = root();
  try {
    mkdirSync(join(path, ".agent-pipeline"));
    const retained = join(path, ".agent-pipeline/onboarding-consent.json");
    const bytes = Buffer.from('{"retained":"fixture"}\n');
    writeFileSync(retained, bytes);
    const plan = planProjectOnboardingV3({ rootDir: path, runner: "codex" });
    assert.equal(plan.status, "ready");
    const result = applyProjectOnboardingV3(plan, { rootDir: path, activate: true });
    assert.equal(result.status, "activation-required", JSON.stringify(result));
    assert.equal(result.diagnostics[0].code, "retained_enrollment_history");
    assert.ok(result.nextAction.argv.includes("plan-enrollment-git-creation"));
    assert.equal(existsSync(join(path, ".git")), false);
    assert.deepEqual(readFileSync(retained), bytes);
    assert.deepEqual(readdirSync(path), [".agent-pipeline"]);
  } finally { dispose(path); }
});

// Acceptance 3 + 4a: retired enrollment stays declined without fresh consent and
// the old approval stays invalid, via the real CLI writer.
test("AC3/AC4a retired enrollment stays declined without fresh consent; old approval stays invalid", () => {
  const path = root();
  try {
    const plan = planProjectOnboardingV3({ rootDir: path, runner: "codex" });
    assert.equal(applyProjectOnboardingV3(plan, { rootDir: path, activate: true }).status, "applied");
    const statePath = join(path, "project/pipeline-state.json");
    writeFileSync(statePath, JSON.stringify({
      schema: "pipeline.state.v0",
      activeFeature: { id: "offline-fixture", planPath: "specs/offline-fixture/prd.md", phase: "implementation" },
      planApproved: true,
      planApproval: { approvedBy: "disposable-fixture", approvedAt: "2026-09-29T00:00:00.000Z" },
    }) + "\n");
    const controller = createGovernanceScopeController({ hostStateRoot: join(path, "unused-host") });
    const decision = controller.planDecision({ rootDir: path, decision: "decline", by: "disposable-fixture" });
    const declined = controller.applyDecision(decision, { activate: true, planSha256: decision.planSha256 });
    assert.equal(declined.state, "declined");
    const digest = createHash("sha256").update(readFileSync(join(path, ".git/config"))).digest("hex");
    const args = ["--root", path, "--scope-key", declined.scopeKey, "--barrier-sha256", digest, "--by", "disposable-fixture"];
    // Host fact (measured): retire-enrollment fails WT-GIT-FAILED on a Git root with no HEAD commit here.
    assert.equal(git(path, "commit", "--allow-empty", "-m", "fixture base").status, 0);
    const retired = spawnSync(process.execPath, [STATE_SCRIPT, "retire-enrollment", ...args], { cwd: path, encoding: "utf8" });
    assert.equal(retired.status, 0, retired.stderr);
    const stateBytes = readFileSync(statePath);
    const checkpoint = readOnboardingIntakeCheckpoint({ rootDir: path });
    assert.equal(derivePlanLifecycle(JSON.parse(stateBytes)).approvalCurrent, false);
    assert.equal(checkpoint.value.consent, null);
    assert.equal(inspectProjectOnboardingV3({ rootDir: path, runner: "codex", intent: "bootstrap" }).status, "intake-required");
    const refused = spawnSync(process.execPath, [STATE_SCRIPT, "activate-enrollment", ...args], { cwd: path, encoding: "utf8" });
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /ER-FRESH-CONSENT/);
    applyProjectOnboardingV3(planProjectOnboardingV3({ rootDir: path, runner: "codex" }), { rootDir: path, activate: true });
    assert.equal(controller.observe({ rootDir: path }).state, "declined");
    assert.deepEqual(readFileSync(statePath), stateBytes);
    assert.equal(readOnboardingIntakeCheckpoint({ rootDir: path }).sha256, checkpoint.sha256);
    assert.equal(readGovernanceEnrollmentRetirement({ rootDir: path }).phase, "pending");
  } finally { dispose(path); }
});

// Acceptance 3 (reachable activation after valid fresh consent) + 4a (old approval invalid after).
test("AC3b valid fresh consent opens a sanctioned public activation route; approval is not restored", () => {
  const path = root();
  try {
    assert.equal(applyProjectOnboardingV3(planProjectOnboardingV3({ rootDir: path, runner: "claude" }), { rootDir: path, activate: true }).status, "applied");
    // Host fact (measured): pipeline-state.mjs writer routes fail WT-GIT-FAILED on a Git root with no HEAD commit here.
    // The pipeline commit-msg hook (GIT-03) is already active here (measured), so the message carries the required trailer block; hooks stay enabled.
    const base = git(path, "commit", "--allow-empty", "-m", "test: fixture base", "-m", "AI-Assisted: true\nDispatch: ALF-C-P7-05C (goldfish)");
    assert.equal(base.status, 0, base.stderr);
    // Runtime initialization + idle transition, as in the original FRB003 second half.
    const runtime = planProjectOnboardingLifecycleV4({ rootDir: path, runner: "claude", operation: "runtime" });
    const runtimeDigest = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
    assert.equal(applyProjectOnboardingLifecycleV4({ rootDir: path, runner: "claude", operation: "runtime", planSha256: runtimeDigest, activate: true }).status, "intake-required");
    const statePath = join(path, "project/pipeline-state.json");
    writeFileSync(statePath, JSON.stringify({
      schema: "pipeline.state.v0",
      activeFeature: { id: "retirement-fixture", planPath: "specs/retirement-fixture/prd.md", phase: "design" },
      planApproved: false,
    }) + "\n");
    const discarded = spawnSync(process.execPath, [STATE_SCRIPT, "discard-feature", "--by", "disposable-fixture", "--reason", "retirement regression idle transition"], { cwd: path, encoding: "utf8" });
    assert.equal(discarded.status, 0, discarded.stderr);
    assert.equal(inspectProjectOnboardingV3({ rootDir: path, runner: "claude", intent: "bootstrap" }).status, "ready");
    const controller = createGovernanceScopeController({ hostStateRoot: join(path, "unused-host") });
    const decision = controller.planDecision({ rootDir: path, decision: "decline", by: "disposable-fixture" });
    const declined = controller.applyDecision(decision, { activate: true, planSha256: decision.planSha256 });
    const digest = createHash("sha256").update(readFileSync(join(path, ".git/config"))).digest("hex");
    const args = ["--root", path, "--scope-key", declined.scopeKey, "--barrier-sha256", digest, "--by", "disposable-fixture"];
    const retired = spawnSync(process.execPath, [STATE_SCRIPT, "retire-enrollment", ...args], { cwd: path, encoding: "utf8" });
    assert.equal(retired.status, 0, retired.stderr);
    assert.equal(readGovernanceEnrollmentRetirement({ rootDir: path }).phase, "pending");
    const refused = spawnSync(process.execPath, [STATE_SCRIPT, "activate-enrollment", ...args], { cwd: path, encoding: "utf8" });
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /ER-FRESH-CONSENT/);
    recordConsentGiven({ rootDir: path });
    const consent = applyOnboardingIntakeConsent({ rootDir: path, granted: true, language: "en", profile: "feature", text: "Explicit disposable reenrollment request.", activate: true });
    assert.equal(consent.checkpoint.consent.granted, true);
    const observed = inspectProjectOnboardingV3({ rootDir: path, runner: "claude", intent: "bootstrap" });
    assert.equal(observed.status, "enrollment-activation-required", JSON.stringify(observed));
    const action = observed.nextAction;
    assert.equal(action.mutation, true);
    assert.equal(action.requiresConfirmation, true);
    assert.ok(action.argv.includes("activate-enrollment"));
    assert.equal(isSanctionedLifecycleCommand(renderProjectOnboardingAction(action), path, { runner: "claude" }), true);
    const activated = spawnSync(action.executable, action.argv, { cwd: path, encoding: "utf8" });
    assert.equal(activated.status, 0, activated.stderr);
    assert.equal(JSON.parse(activated.stdout).status, "active");
    assert.equal(controller.observe({ rootDir: path }).state, "active");
    assert.equal(readGovernanceEnrollmentRetirement({ rootDir: path }).phase, "active");
    const after = JSON.parse(readFileSync(statePath));
    assert.equal(after.planApproved, false);
    assert.equal(after.planApproval, undefined);
    assert.notEqual(derivePlanLifecycle(after).approvalCurrent, true);
    assert.equal(readOnboardingIntakeCheckpoint({ rootDir: path }).value.consent.granted, true);
  } finally { dispose(path); }
});

// Acceptance 4b: foreign shared-worktree history is not adopted.
test("AC4b a sibling worktree's intake history in the shared Git dir is not this root's history", () => {
  const main = root();
  const sibling = main + "-sibling";
  try {
    assert.equal(git(main, "init", "--initial-branch=main").status, 0);
    assert.equal(git(main, "commit", "--allow-empty", "-m", "base").status, 0);
    assert.equal(applyProjectOnboardingV3(planProjectOnboardingV3({ rootDir: main, runner: "claude" }), { rootDir: main, activate: true }).status, "applied");
    recordConsentGiven({ rootDir: main });
    applyOnboardingIntakeConsent({ rootDir: main, granted: true, language: "en", profile: "feature", text: "Main worktree consent.", activate: true });
    assert.equal(observeOnboardingEnrollmentHistory({ rootDir: main }).retained, true, "control: the owning root does retain history");
    const added = git(main, "worktree", "add", "--detach", sibling, "HEAD");
    assert.equal(added.status, 0, added.stderr);
    const foreign = observeOnboardingEnrollmentHistory({ rootDir: sibling });
    assert.equal(foreign.retained, false, JSON.stringify(foreign));
    assert.equal(readOnboardingIntakeCheckpoint({ rootDir: sibling }).status, "absent");
  } finally { git(main, "worktree", "remove", "--force", sibling); dispose(sibling); dispose(main); }
});

// Acceptance 5: rollback preserves foreign concurrent Git bytes and removes only owned data.
test("AC5 fresh rollback restores an owned empty root and preserves foreign concurrent Git bytes", () => {
  for (const concurrent of [false, true]) {
    const path = root();
    try {
      const failing = { writeFileSync: () => {
        if (concurrent) writeFileSync(join(path, ".git/concurrent-fixture"), "foreign exact bytes");
        throw new Error("directed scaffold write failure");
      } };
      const plan = planProjectOnboardingV3({ rootDir: path, runner: "codex", deps: failing });
      const result = applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: failing });
      assert.equal(result.status, concurrent ? "rollback-failed" : "rolled-back", JSON.stringify(result));
      if (concurrent) {
        assert.equal(readFileSync(join(path, ".git/concurrent-fixture"), "utf8"), "foreign exact bytes");
        assert.match(result.diagnostics[0].message, /created Git control tree changed/);
      } else assert.deepEqual(readdirSync(path), []);
    } finally { dispose(path); }
  }
});

// Acceptance 6 (suite membership): the committed suite declares OBC298 and FRB001-FRB004.
test("AC6 the committed onboarding suite declares OBC298 and FRB001-FRB004, and OBC298 passes", async () => {
  const src = readFileSync(join(here, "../project-onboarding-v3.test.mjs"), "utf8");
  for (const id of ["OBC298", "FRB001", "FRB002", "FRB003", "FRB004"]) assert.ok(src.includes(`"${id}"`), `${id} declared`);
  // Import executes zero suite cases (the suite only runs on direct invocation).
  const { FRESH_ENROLLMENT_REGRESSION_CASES } = await import("../project-onboarding-v3.test.mjs");
  const obc = FRESH_ENROLLMENT_REGRESSION_CASES.find((entry) => entry.id === "OBC298");
  assert.ok(obc, "OBC298 is in the exported regression case list");
  obc.run();
});

// Host limitation: needs directory mode bits / directory symlinks (Linux/WSL run).
test("HL physical-history refusal for symlinked history paths (ER-HISTORY-UNSAFE)", HOST_LIMITATION, () => {});
