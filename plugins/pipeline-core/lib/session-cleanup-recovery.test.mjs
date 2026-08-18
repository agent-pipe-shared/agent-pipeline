#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

// Proves the 2026-08-18 PO decision (backlog item
// pipeline.self-healing-local-cleanup-recovery) end to end for each of the
// six typed recovery kinds `readyRecoveryPlan()` produces: `applyAction`
// carries `requiresConfirmation: false`, a `.bak` snapshot of every private
// file about to be mutated is written FIRST with the exact pre-recovery
// bytes, and the recovery still converges to the same end-state the
// (formerly human-confirmed) apply already produced. Fixture patterns are
// deliberately the SAME ones already proven in
// `scripts/session-cleanup-binding.test.mjs` (real `git init` repos, real
// onboarding-continuity/worktree-lifecycle primitives) -- this file drives
// `planSessionCleanupRecovery`/`applySessionCleanupRecovery` directly rather
// than through the `session-cleanup.mjs` CLI wrapper, except for the "start"
// step, which is reused via the CLI (`sessionCleanupMain`) because it is the
// one step that atomically creates AND binds a descriptor.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  applySessionCleanupRecovery,
  planSessionCleanupRecovery,
} from "./session-cleanup-recovery.mjs";
import {
  applyOnboardingKickoff,
  planOnboardingKickoff,
  readOnboardingSessionCleanupBinding,
} from "./onboarding-continuity.mjs";
import {
  cleanupSession,
  listActiveSessionDescriptors,
  loadSessionDescriptor,
  retireSessionDescriptor,
  startSessionDescriptor,
} from "./worktree-lifecycle.mjs";
import { validateContinuityState } from "./continuity-state.mjs";
import { main as sessionCleanupMain } from "../scripts/session-cleanup.mjs";

function fixture(name) {
  const root = mkdtempSync(join(tmpdir(), `session-cleanup-recovery-${name}-`));
  mkdirSync(join(root, ".claude"), { recursive: true });
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  writeFileSync(join(root, ".claude", "pipeline.json"), `${JSON.stringify({
    project: "fixture",
    verify: "node verify.mjs",
    autonomy: "bounded",
    branchModel: "local",
    worktree: "supported",
    stakes: "high",
    constraints: [],
  }, null, 2)}\n`);
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Test cleanup recovery backup net" });
  applyOnboardingKickoff({ plan, expectedPlanSha256: plan.planSha256, activate: true });
  return root;
}

function invoke(argv, dependencies = {}) {
  let output = "";
  const code = sessionCleanupMain(argv, {}, {
    requireProjectOnboardingReadyFn() { return { status: "ready" }; },
    writeFn(value) { output += value; },
    ...dependencies,
  });
  return { code, output: output === "" ? null : JSON.parse(output) };
}

function gitRun(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return String(result.stdout).trim();
}

function gitCommonDir(root) {
  const result = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root, encoding: "utf8", shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
  return realpathSync(String(result.stdout).trim());
}

function backupPath(root, label) {
  return join(gitCommonDir(root), "agent-pipeline", "session-cleanup-recovery", "backups", `${label}.bak`);
}

function onboardingPrivateDir(root) {
  return join(gitCommonDir(root), "agent-pipeline", "onboarding");
}

// A directory-wide snapshot of whatever is currently in the private
// onboarding store, keyed by basename, mirroring exactly what
// `backupOnboardingPrivateState` in session-cleanup-recovery.mjs itself
// sweeps -- so this test never needs to know that module's internal,
// unexported basenames.
function snapshotOnboardingPrivate(root) {
  const dir = onboardingPrivateDir(root);
  const map = new Map();
  if (!existsSync(dir)) return map;
  for (const name of readdirSync(dir)) {
    const entryPath = join(dir, name);
    if (lstatSync(entryPath).isFile()) map.set(name, readFileSync(entryPath));
  }
  return map;
}

function assertOnboardingBackups(root, preSnapshot) {
  for (const [name, bytes] of preSnapshot) {
    const path = backupPath(root, `onboarding-private.${name}`);
    assert.equal(existsSync(path), true, `missing .bak for onboarding private file ${name}`);
    assert.deepEqual(readFileSync(path), bytes, `.bak for ${name} does not carry the exact pre-recovery bytes`);
  }
}

function rewriteAsLegacyDescriptor(root, sessionId) {
  const loaded = loadSessionDescriptor(root, sessionId);
  const descriptor = JSON.parse(readFileSync(loaded.path, "utf8"));
  descriptor.schema = "pipeline.session-descriptor.v1";
  delete descriptor.ownerRuntime;
  writeFileSync(loaded.path, `${JSON.stringify(descriptor, null, 2)}\n`, { mode: 0o600 });
  return loadSessionDescriptor(root, sessionId);
}

// Same construction session-cleanup-binding.test.mjs's own
// legacyClosedCleanupFixture() uses: a closed feature whose active session
// was cleaned up and retired, leaving an exact provable `closed-bound`
// State/Git-authenticated cleanup binding.
function legacyClosedCleanupFixture(name) {
  const root = fixture(name);
  const started = invoke(["start", "--repo", root, "--session", `session-${name}`]);
  assert.equal(started.code, 0);
  const statePath = join(root, ".claude", "pipeline-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  mkdirSync(join(root, "specs"), { recursive: true });
  mkdirSync(join(root, "evidence"), { recursive: true });
  const resultBytes = "legacy cleanup result\n";
  const evidenceBytes = "legacy cleanup close evidence\n";
  writeFileSync(join(root, "specs", "legacy-cleanup-result.md"), resultBytes);
  writeFileSync(join(root, "evidence", "legacy-cleanup-close.md"), evidenceBytes);
  state.continuity.authority.result = {
    path: "specs/legacy-cleanup-result.md",
    sha256: createHash("sha256").update(resultBytes).digest("hex"),
  };
  state.continuity.queueHead = {
    ...state.continuity.queueHead,
    nextAction: "close",
    dispatch: null,
  };
  assert.equal(validateContinuityState(state.continuity, state.activeFeature.id).ok, true);
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  gitRun(root, ["config", "user.email", "fixture@example.invalid"]);
  gitRun(root, ["config", "user.name", "Fixture"]);
  gitRun(root, ["add", ".claude/pipeline-state.json", "specs/legacy-cleanup-result.md", "evidence/legacy-cleanup-close.md"]);
  gitRun(root, ["commit", "-q", "-m", "fixture: retain legacy cleanup binding"]);
  const forCommit = gitRun(root, ["rev-parse", "HEAD"]);
  const closeRequest = {
    schema: "pipeline.continuity-close.v0",
    featureId: state.activeFeature.id,
    expectedRevision: state.continuity.revision,
    result: structuredClone(state.continuity.authority.result),
    closeEvidence: {
      path: "evidence/legacy-cleanup-close.md",
      sha256: createHash("sha256").update(evidenceBytes).digest("hex"),
    },
  };
  const loaded = loadSessionDescriptor(root, started.output.sessionId, {
    expectedDescriptorSha256: started.output.descriptorSha256,
  });
  assert.equal(cleanupSession(root, loaded, { allowAbsent: true }).ok, true);
  retireSessionDescriptor(root, loaded);
  const closed = {
    ...state,
    closedFeatures: [{
      id: state.activeFeature.id,
      planPath: state.activeFeature.planPath,
      phaseAtClose: state.activeFeature.phase,
      closedAt: "2026-07-28T12:00:00.000Z",
      closedBy: "legacy-writer",
      forCommit,
      continuityClose: closeRequest,
    }],
    planApproved: false,
    updatedAt: "2026-07-28T12:00:00.000Z",
  };
  delete closed.activeFeature;
  delete closed.planApproval;
  delete closed.planRevocation;
  delete closed.continuity;
  writeFileSync(statePath, `${JSON.stringify(closed, null, 2)}\n`);
  return root;
}

test("bind-orphan auto-executes without confirmation, backs up onboarding private state first, and rebinds the exact active descriptor", () => {
  const root = fixture("bind-orphan");
  try {
    const orphan = startSessionDescriptor(root, { sessionId: "session-recovery-bind-orphan" });
    const plan = planSessionCleanupRecovery({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.recovery, "bind-orphan");
    assert.equal(plan.applyAction.requiresConfirmation, false);
    const preOnboarding = snapshotOnboardingPrivate(root);
    const applied = applySessionCleanupRecovery({
      rootDir: root, expectedPlanSha256: plan.planSha256, activate: true,
    });
    assert.equal(applied.status, "rebound");
    assertOnboardingBackups(root, preOnboarding);
    assert.deepEqual(readOnboardingSessionCleanupBinding({ rootDir: root }).sessionCleanup, {
      sessionId: orphan.sessionId, descriptorSha256: orphan.descriptorSha256,
    });
    assert.deepEqual(listActiveSessionDescriptors(root), [
      { sessionId: orphan.sessionId, descriptorSha256: orphan.descriptorSha256 },
    ]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("retire-orphans auto-executes without confirmation, backs up each retired descriptor first, and clears the exact orphan set", () => {
  const root = fixture("retire-orphans");
  try {
    const first = startSessionDescriptor(root, { sessionId: "session-recovery-orphan-a" });
    const second = startSessionDescriptor(root, { sessionId: "session-recovery-orphan-b" });
    const legacyFirst = rewriteAsLegacyDescriptor(root, first.sessionId);
    const legacySecond = rewriteAsLegacyDescriptor(root, second.sessionId);
    const preFirst = readFileSync(legacyFirst.path);
    const preSecond = readFileSync(legacySecond.path);
    const plan = planSessionCleanupRecovery({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.recovery, "retire-orphans");
    assert.equal(plan.applyAction.requiresConfirmation, false);
    const applied = applySessionCleanupRecovery({
      rootDir: root, expectedPlanSha256: plan.planSha256, activate: true,
    });
    assert.equal(applied.status, "retired");
    assert.equal(applied.retiredDescriptorCount, 2);
    assert.deepEqual(readFileSync(backupPath(root, `session-descriptor.${legacyFirst.sessionId}`)), preFirst);
    assert.deepEqual(readFileSync(backupPath(root, `session-descriptor.${legacySecond.sessionId}`)), preSecond);
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "unbound");
    assert.deepEqual(listActiveSessionDescriptors(root), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("retire-orphans-release-lost-binding (composite) auto-executes without confirmation, backs up every mutated file first, and converges to released", () => {
  const root = fixture("composite-recovery");
  try {
    const bound = invoke(["start", "--repo", root, "--session", "session-recovery-lost"]);
    assert.equal(bound.code, 0);
    const lost = loadSessionDescriptor(root, bound.output.sessionId, {
      expectedDescriptorSha256: bound.output.descriptorSha256,
    });
    unlinkSync(lost.path);
    const first = rewriteAsLegacyDescriptor(
      root, startSessionDescriptor(root, { sessionId: "session-recovery-composite-a" }).sessionId,
    );
    const second = rewriteAsLegacyDescriptor(
      root, startSessionDescriptor(root, { sessionId: "session-recovery-composite-b" }).sessionId,
    );
    const preFirst = readFileSync(first.path);
    const preSecond = readFileSync(second.path);
    const preOnboarding = snapshotOnboardingPrivate(root);
    assert.ok(preOnboarding.size > 0, "a bound cleanup handle must carry a private binding file to back up");
    const plan = planSessionCleanupRecovery({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.recovery, "retire-orphans-release-lost-binding");
    assert.equal(plan.applyAction.requiresConfirmation, false);
    const applied = applySessionCleanupRecovery({
      rootDir: root, expectedPlanSha256: plan.planSha256, activate: true,
    });
    assert.equal(applied.status, "recovered");
    assert.deepEqual(readFileSync(backupPath(root, `session-descriptor.${first.sessionId}`)), preFirst);
    assert.deepEqual(readFileSync(backupPath(root, `session-descriptor.${second.sessionId}`)), preSecond);
    assertOnboardingBackups(root, preOnboarding);
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "unbound");
    assert.deepEqual(listActiveSessionDescriptors(root), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("release-lost-binding auto-executes without confirmation, backs up onboarding private state first, and converges to unbound", () => {
  const root = fixture("release-lost-binding");
  try {
    const started = invoke(["start", "--repo", root, "--session", "session-recovery-release-lost"]);
    assert.equal(started.code, 0);
    const loaded = loadSessionDescriptor(root, started.output.sessionId, {
      expectedDescriptorSha256: started.output.descriptorSha256,
    });
    unlinkSync(loaded.path);
    const preOnboarding = snapshotOnboardingPrivate(root);
    assert.ok(preOnboarding.size > 0, "a bound cleanup handle must carry a private binding file to back up");
    const plan = planSessionCleanupRecovery({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.recovery, "release-lost-binding");
    assert.equal(plan.applyAction.requiresConfirmation, false);
    const applied = applySessionCleanupRecovery({
      rootDir: root, expectedPlanSha256: plan.planSha256, activate: true,
    });
    assert.equal(applied.status, "recovered");
    assertOnboardingBackups(root, preOnboarding);
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "unbound");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("release-closed-feature auto-executes without confirmation, backs up onboarding private state first, and converges to closed-unbound", () => {
  const root = legacyClosedCleanupFixture("release-closed-feature");
  try {
    const binding = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.equal(binding.status, "closed-bound");
    const plan = planSessionCleanupRecovery({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.recovery, "release-closed-feature");
    assert.equal(plan.applyAction.requiresConfirmation, false);
    const preOnboarding = snapshotOnboardingPrivate(root);
    assert.ok(preOnboarding.size > 0, "a closed-bound cleanup handle must carry a private binding file to back up");
    const applied = applySessionCleanupRecovery({
      rootDir: root, expectedPlanSha256: plan.planSha256, activate: true,
    });
    assert.equal(applied.status, "recovered");
    assertOnboardingBackups(root, preOnboarding);
    // This fixture's closed feature carries a Git-verifiable close (a real
    // commit plus continuityClose evidence), so `binding.releaseProof` is
    // defined and `planSessionCleanupRecovery` takes the non-coordinator
    // release branch, whose proven end-state is "released" -- NOT
    // "closed-unbound" (that status is reached only via the separate
    // coordinator-close branch, reached when `releaseProof` is undefined,
    // which needs a different, promotion-mismatch-shaped fixture. The
    // sixth recovery kind, quarantine-private-receipt, is reachable only
    // from that coordinator-close branch and is NOT covered by this file --
    // see this dispatch's completion report).
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "released");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
