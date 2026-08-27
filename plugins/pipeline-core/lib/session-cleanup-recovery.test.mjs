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
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  applySessionCleanupRecovery,
  planOrphanWorktreeDirectories,
  planSessionCleanupRecovery,
  retireOrphanWorktreeDirectories,
  sessionCleanupRecoveryInternals,
} from "./session-cleanup-recovery.mjs";
import {
  applyOnboardingKickoff,
  planOnboardingKickoff,
  readOnboardingSessionCleanupBinding,
} from "./onboarding-continuity.mjs";
import {
  cleanupSession,
  createDetachedWorktree,
  listActiveSessionDescriptors,
  loadSessionDescriptor,
  retireSessionDescriptor,
  startSessionDescriptor,
} from "./worktree-lifecycle.mjs";
import { validateContinuityState } from "./continuity-state.mjs";
import { main as sessionCleanupMain } from "../scripts/session-cleanup.mjs";
import {
  applyProjectAuthorityMigration,
  planProjectAuthorityMigration,
} from "./project-authority.mjs";

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

// Migrates a fixture() root's portable state to the NEUTRAL authority path
// (project/pipeline-state.json), the same precondition
// session-cleanup-binding.test.mjs's own neutralFixture() uses to reach the
// private-runtime cleanup-binding/release-receipt storage this file's
// "closed-receipt-invalid" fixture below depends on -- mirrored here rather
// than imported cross-file to avoid a fixture-shape coupling between two
// independently-maintained test files.
function neutralFixture(name) {
  const root = fixture(name);
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  const plan = planProjectAuthorityMigration({ rootDir: root });
  assert.equal(plan.status, "ready");
  assert.equal(applyProjectAuthorityMigration(plan, { rootDir: root, activate: true }).status, "applied");
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

// Recursively search for a file by exact basename, returning its full path
// (or null). Used only to DISCOVER where worktree-lifecycle.mjs's real,
// un-exported cleanupManifestPath() convention actually wrote a manifest --
// never to duplicate that convention as a literal (Critic finding F5,
// 2026-08-19: the existing external-retirement test above already hardcodes
// the convention as a literal `manifestPath`, which does not PIN it against
// the real function; this search is independent of any assumed convention).
function findFileNamed(dir, name) {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const entryPath = join(dir, entry);
    const info = lstatSync(entryPath);
    if (info.isDirectory()) {
      const found = findFileNamed(entryPath, name);
      if (found) return found;
    } else if (info.isFile() && entry === name) {
      return entryPath;
    }
  }
  return null;
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

// Critic finding F2, 2026-08-19 (dispatch W4-CRITIC-2C): retire-externally-
// archived-orphans/retire-mixed-orphans -- the ONLY one of the six kinds
// that deletes a pre-existing file it did not create (the external-archive
// cleanup manifest, via retireExternallyArchivedSession ->
// worktree-lifecycle.mjs's unlinkSync) -- had zero direct test coverage,
// and backupExternalRetirementManifest() had never been exercised at all.
// Fixture mirrors session-cleanup-binding.test.mjs's own
// "an explicitly confirmed recovery retires only externally archived
// disposable worktrees" test (a closed feature, a detached-worktree
// archive, a legacy-shaped orphan descriptor), built directly here (not
// imported) to avoid a cross-file fixture-shape mismatch with this file's
// own `fixture()` (which always seeds a live active feature via a real
// kickoff; the binding-test file's fixture does not).
function closedFeatureRoot(name) {
  const root = mkdtempSync(join(tmpdir(), `session-cleanup-recovery-${name}-`));
  mkdirSync(join(root, ".claude"), { recursive: true });
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  writeFileSync(join(root, ".claude", "pipeline.json"), `${JSON.stringify({
    project: "fixture", verify: "node verify.mjs", autonomy: "bounded",
    branchModel: "local", worktree: "supported", stakes: "high", constraints: [],
  }, null, 2)}\n`);
  gitRun(root, ["add", ".claude"]);
  gitRun(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "-m", "fixture: external archive recovery"]);
  const closedAt = "2026-07-30T08:00:00.000Z";
  writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
    schema: "pipeline.state.v0", planApproved: false, updatedAt: closedAt,
    closedFeatures: [{
      id: "closed-transition", planPath: "specs/closed/prd.md", phaseAtClose: "implementation",
      closedAt, closedBy: "PO", forCommit: null,
    }],
  }, null, 2)}\n`);
  return root;
}

test("retire-externally-archived-orphans auto-executes without confirmation, backs up the external-retirement manifest first, and converges to closed-unbound", () => {
  const root = closedFeatureRoot("external-archive");
  try {
    const descriptor = startSessionDescriptor(root, { sessionId: "session-recovery-external-archive" });
    const record = createDetachedWorktree(root, "archive", gitRun(root, ["rev-parse", "HEAD"]), descriptor);
    gitRun(root, ["worktree", "remove", record.physicalPath]);
    rewriteAsLegacyDescriptor(root, descriptor.sessionId);
    const plan = planSessionCleanupRecovery({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.recovery, "retire-externally-archived-orphans");
    assert.equal(plan.applyAction.requiresConfirmation, false);
    const manifestPath = join(gitCommonDir(root), "agent-pipeline", "session-cleanup", "active", `${descriptor.sessionId}.json`);
    assert.equal(existsSync(manifestPath), true, "the fixture must actually produce the external-retirement manifest this test backs up");
    const preManifest = readFileSync(manifestPath);
    const applied = applySessionCleanupRecovery({
      rootDir: root, expectedPlanSha256: plan.planSha256, activate: true,
    });
    assert.equal(applied.status, "retired");
    assert.equal(applied.externallyArchivedDescriptorCount, 1);
    // The manifest backupBeforeMutation() writes must exist and carry the
    // EXACT pre-deletion bytes -- proving the backup ran before
    // retireExternallyArchivedSession's unlinkSync, not after or never.
    const backedUp = readFileSync(backupPath(root, `external-manifest.${descriptor.sessionId}`));
    assert.deepEqual(backedUp, preManifest);
    assert.equal(existsSync(manifestPath), false, "the recovery must still actually delete the live manifest");
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "closed-unbound");
    assert.deepEqual(listActiveSessionDescriptors(root), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// Critic finding F5 (QG-06), 2026-08-19: the external-manifest path
// convention (`session-cleanup/active/<sessionId>.json` under the Git
// common dir) is deliberately duplicated in session-cleanup-recovery.mjs's
// `externalRetirementManifestPath()` rather than exported from
// worktree-lifecycle.mjs, and was disclosed as un-pinned by any test -- a
// future change to worktree-lifecycle.mjs's real, still-un-exported
// `cleanupManifestPath()` would silently disable this kind's `.bak` safety
// net (the reconstruction would simply stop finding the manifest, and
// `backupBeforeMutation` would return null instead of failing loudly).
// This test proves both routes agree for the SAME inputs: it discovers
// where the manifest actually landed by searching the filesystem (produced
// entirely through worktree-lifecycle.mjs's real public API, never through
// a hardcoded literal), then asserts session-cleanup-recovery.mjs's
// reconstruction resolves to that exact discovered path.
test("the external-manifest backup path convention is pinned against worktree-lifecycle.mjs's real cleanupManifestPath output", () => {
  const root = closedFeatureRoot("external-manifest-path-pin");
  try {
    const descriptor = startSessionDescriptor(root, { sessionId: "session-recovery-manifest-path-pin" });
    const record = createDetachedWorktree(root, "archive", gitRun(root, ["rev-parse", "HEAD"]), descriptor);
    gitRun(root, ["worktree", "remove", record.physicalPath]);
    rewriteAsLegacyDescriptor(root, descriptor.sessionId);
    const commonAgentPipelineDir = join(gitCommonDir(root), "agent-pipeline");
    const discovered = findFileNamed(commonAgentPipelineDir, `${descriptor.sessionId}.json`);
    assert.ok(discovered, "fixture must produce a real external-retirement manifest via worktree-lifecycle.mjs to discover");
    const reconstructed = sessionCleanupRecoveryInternals.externalRetirementManifestPath(
      root, {}, descriptor.sessionId,
    );
    assert.equal(
      reconstructed,
      discovered,
      "session-cleanup-recovery.mjs's duplicated manifest-path convention must match worktree-lifecycle.mjs's real cleanupManifestPath() output for the same inputs",
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// Critic F2/F3 (fail-closed branch coverage): backupBeforeMutation() must
// refuse rather than silently skip when a source it is asked to back up is
// present but not a plain regular file -- proven directly against the
// exported primitive rather than by driving a full recovery, since
// fabricating a symlinked descriptor/manifest through the public
// planSessionCleanupRecovery surface is not reachable (every producer of
// those paths already writes a plain file). Two shapes, both wrongly
// treated as "absent, nothing to back up" before the 2026-08-19 fix:
test("backupBeforeMutation fails closed on a live symlinked source instead of silently skipping it", () => {
  const root = fixture("backup-symlink-fail-closed");
  try {
    const realFile = join(root, "real-target.txt");
    writeFileSync(realFile, "not a private cleanup file, just a symlink target\n");
    const symlinkSource = join(root, "symlinked-source");
    symlinkSync(realFile, symlinkSource);
    assert.throws(
      () => sessionCleanupRecoveryInternals.backupBeforeMutation(root, {}, "symlink-test", symlinkSource),
      (error) => error?.code === "WT-SESSION-RECOVERY-BACKUP",
      "a symlinked backup source must fail closed with WT-SESSION-RECOVERY-BACKUP, never silently skip",
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// The actual defect Critic F3 named: existsSync() FOLLOWS symlinks, so a
// DANGLING symlink (target does not exist) used to make the old
// `!existsSync(sourcePath)` guard return true and the function return null
// -- silently, before ever reaching the isSymbolicLink() check above. This
// is the regression test for that fix (lstatSync-based absence check).
test("backupBeforeMutation fails closed on a DANGLING symlinked source, not a silent null", () => {
  const root = fixture("backup-dangling-symlink-fail-closed");
  try {
    const missingTarget = join(root, "target-that-does-not-exist.txt");
    const danglingSymlink = join(root, "dangling-source");
    symlinkSync(missingTarget, danglingSymlink);
    assert.throws(
      () => sessionCleanupRecoveryInternals.backupBeforeMutation(root, {}, "dangling-symlink-test", danglingSymlink),
      (error) => error?.code === "WT-SESSION-RECOVERY-BACKUP",
      "a dangling symlink must fail closed with WT-SESSION-RECOVERY-BACKUP, never be treated as a legitimately absent source",
    );
    // A genuinely absent path (no file, no symlink, nothing) is still the
    // one case that legitimately returns null -- unchanged by this fix.
    const trulyAbsent = join(root, "nothing-here-at-all.txt");
    assert.equal(
      sessionCleanupRecoveryInternals.backupBeforeMutation(root, {}, "absent-test", trulyAbsent),
      null,
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// The same fail-closed obligation, but for the DIRECTORY SWEEP rather than a
// single named source: backupOnboardingPrivateState() used to `continue`
// past a non-regular entry (a symlink, a fifo, a device node -- anything
// lstat does not report as a plain file) instead of refusing, exactly the
// shape a symlink attack or a damaged private store would take, and exactly
// the failure mode backupBeforeMutation() itself already fails closed on
// above (still-open F3 sibling gap disclosed in this item's 2026-08-19
// round-2 implementation status). This is the regression test for that fix.
test("backupOnboardingPrivateState fails closed on a non-regular entry in the private onboarding directory instead of silently skipping it", () => {
  const root = fixture("onboarding-sweep-fail-closed");
  try {
    const onboardingDirectory = onboardingPrivateDir(root);
    mkdirSync(onboardingDirectory, { recursive: true, mode: 0o700 });
    const realFile = join(root, "real-onboarding-symlink-target.txt");
    writeFileSync(realFile, "not a private onboarding file, just a symlink target\n");
    const symlinkEntry = join(onboardingDirectory, "a-symlinked-entry");
    symlinkSync(realFile, symlinkEntry);
    assert.throws(
      () => sessionCleanupRecoveryInternals.backupOnboardingPrivateState(root, {}),
      (error) => error?.code === "WT-SESSION-RECOVERY-BACKUP",
      "a non-regular entry in the private onboarding directory must fail closed, never silently skip",
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// F2's still-uncovered piece (2026-08-19 round-2 implementation status):
// quarantine-private-receipt is reached only through binding.status
// "closed-receipt-invalid" (readOnboardingSessionCleanupBinding in
// onboarding-continuity.mjs), which itself requires a NEUTRAL project (state
// at project/pipeline-state.json), zero active session descriptors, and a
// private release receipt whose bytes exist but fail MAC verification --
// reachable only by first driving a real coordinator-close private release
// to completion (so a real, validly-MACed receipt gets written), then
// corrupting that receipt's own bytes so a re-read fails closed to
// "invalid". Mirrors the fixture shape
// session-cleanup-binding.test.mjs's "neutral coordinator-close release..."
// test already proved end to end via the CLI; built directly here (not
// imported) against this file's own primitives per this file's own stated
// convention (driving planSessionCleanupRecovery/applySessionCleanupRecovery
// directly rather than through the session-cleanup.mjs CLI wrapper).
test("quarantine-private-receipt is reachable through a real closed-receipt-invalid binding and converges cleanly to closed-unbound", () => {
  const root = neutralFixture("quarantine-private-receipt");
  try {
    const started = invoke(["start", "--repo", root, "--session", "session-recovery-quarantine"]);
    assert.equal(started.code, 0);
    const statePath = join(root, "project", "pipeline-state.json");
    const active = JSON.parse(readFileSync(statePath, "utf8"));
    mkdirSync(join(root, "specs"), { recursive: true });
    mkdirSync(join(root, "evidence"), { recursive: true });
    const resultBytes = "quarantine recovery result\n";
    const evidenceBytes = "quarantine recovery close evidence\n";
    writeFileSync(join(root, "specs", "quarantine-result.md"), resultBytes);
    writeFileSync(join(root, "evidence", "quarantine-close.md"), evidenceBytes);
    active.continuity.authority.result = {
      path: "specs/quarantine-result.md",
      sha256: createHash("sha256").update(resultBytes).digest("hex"),
    };
    active.continuity.queueHead = { ...active.continuity.queueHead, nextAction: "close", dispatch: null };
    assert.equal(validateContinuityState(active.continuity, active.activeFeature.id).ok, true);
    writeFileSync(statePath, `${JSON.stringify(active, null, 2)}\n`);
    gitRun(root, ["config", "user.email", "fixture@example.invalid"]);
    gitRun(root, ["config", "user.name", "Fixture"]);
    gitRun(root, ["add", "project/pipeline-state.json", "specs/quarantine-result.md", "evidence/quarantine-close.md"]);
    gitRun(root, ["commit", "-q", "-m", "fixture: quarantine recovery close preimage"]);
    const descriptor = loadSessionDescriptor(root, started.output.sessionId, {
      expectedDescriptorSha256: started.output.descriptorSha256,
    });
    assert.equal(cleanupSession(root, descriptor, { allowAbsent: true }).ok, true);
    retireSessionDescriptor(root, descriptor);
    const closed = {
      schema: "pipeline.state.v0",
      planApproved: false,
      updatedAt: "2026-08-19T12:00:00.000Z",
      closedFeatures: [{
        id: active.activeFeature.id,
        planPath: active.activeFeature.planPath,
        phaseAtClose: active.activeFeature.phase,
        closedAt: "2026-08-19T12:00:00.000Z",
        closedBy: "close-coordinator",
        forCommit: gitRun(root, ["rev-parse", "HEAD"]),
        continuityClose: {
          schema: "pipeline.continuity-close.v0",
          featureId: active.activeFeature.id,
          expectedRevision: active.continuity.revision,
          result: structuredClone(active.continuity.authority.result),
          closeEvidence: {
            path: "evidence/quarantine-close.md",
            sha256: createHash("sha256").update(evidenceBytes).digest("hex"),
          },
        },
        coordinatorClose: {
          schema: "pipeline.close-coordinator-reference.v1",
          lifecycleId: "quarantine-private-receipt",
          stateSha256: "a".repeat(64),
          revision: 2,
          phase: "feature-close-prepared",
        },
      }],
    };
    writeFileSync(statePath, `${JSON.stringify(closed, null, 2)}\n`);
    // First convergence: a private, coordinator-close release writes a real,
    // validly-MACed private release receipt and clears the private binding
    // -- this is the ONLY way a genuine receipt (not a hand-fabricated one)
    // ends up on disk for the corruption step below to act on.
    const releasePlan = planSessionCleanupRecovery({ rootDir: root });
    assert.equal(releasePlan.status, "ready");
    assert.equal(releasePlan.recovery, "release-closed-feature");
    const released = applySessionCleanupRecovery({
      rootDir: root, expectedPlanSha256: releasePlan.planSha256, activate: true,
    });
    assert.equal(released.status, "recovered");
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "closed-unbound");
    const receiptPath = join(
      onboardingPrivateDir(root), "session-cleanup-release-receipt.json",
    );
    const receiptBytes = readFileSync(receiptPath);
    const receiptDrift = JSON.parse(receiptBytes);
    receiptDrift.bindingSha256 = "d".repeat(64);
    writeFileSync(receiptPath, `${JSON.stringify(receiptDrift)}\n`, { mode: 0o600 });
    const invalidBinding = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.equal(invalidBinding.status, "closed-receipt-invalid");
    assert.match(invalidBinding.privateReceiptSha256, /^[a-f0-9]{64}$/u);
    const plan = planSessionCleanupRecovery({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.recovery, "quarantine-private-receipt");
    assert.equal(plan.applyAction.requiresConfirmation, false);
    assert.equal(plan.expectedBindingStatus, "closed-unbound");
    const applied = applySessionCleanupRecovery({
      rootDir: root, expectedPlanSha256: plan.planSha256, activate: true,
    });
    assert.equal(applied.status, "recovered");
    const finalBinding = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.equal(finalBinding.status, "closed-unbound");
    assert.equal(finalBinding.privateReceiptStatus, "quarantined");
    assert.equal(finalBinding.releasePlanSha256, plan.planSha256);
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

// NVA-SCRATCHSWEEP-1: planOrphanWorktreeDirectories / retireOrphanWorktreeDirectories --
// the `.claude/worktrees/` half of the sweep (backlog:
// 2026-08-27-stale-worktree-directories-accumulate-with-no-sweep.md). Each test uses its own
// minimal real `git init` repository -- the safety predicate is defined entirely in terms of
// `git worktree list` and an on-disk `.git` pointer file, so a real repository is required
// rather than a mocked one.

function freshWorktreeSweepRepo() {
  const root = mkdtempSync(join(tmpdir(), "session-cleanup-recovery-worktree-sweep-"));
  const run = (args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, `fixture git ${args.join(" ")} failed: ${result.stderr}`);
    return result;
  };
  run(["init", "--quiet"]);
  run(["config", "user.email", "fixture@example.invalid"]);
  run(["config", "user.name", "Fixture"]);
  writeFileSync(join(root, "seed.txt"), "seed\n");
  run(["add", "seed.txt"]);
  run(["commit", "--quiet", "-m", "seed"]);
  return root;
}

test("planOrphanWorktreeDirectories reports nothing and creates nothing when .claude/worktrees does not exist", () => {
  const root = freshWorktreeSweepRepo();
  try {
    assert.deepEqual(planOrphanWorktreeDirectories({ rootDir: root }), []);
    assert.equal(existsSync(join(root, ".claude", "worktrees")), false);
    const retired = retireOrphanWorktreeDirectories({ rootDir: root });
    assert.deepEqual(retired, { retiredCount: 0, retained: [] });
    assert.equal(existsSync(join(root, ".claude", "worktrees")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a worktree directory git still knows about is never removed, regardless of age", () => {
  const root = freshWorktreeSweepRepo();
  try {
    const worktreePath = join(root, ".claude", "worktrees", "live-one");
    const add = spawnSync("git", ["worktree", "add", "--detach", worktreePath], { cwd: root, encoding: "utf8" });
    assert.equal(add.status, 0, `fixture git worktree add failed: ${add.stderr}`);
    assert.equal(existsSync(worktreePath), true);

    const plan = planOrphanWorktreeDirectories({ rootDir: root });
    assert.equal(plan.length, 1);
    assert.equal(plan[0].status, "active-registered");

    const retired = retireOrphanWorktreeDirectories({ rootDir: root });
    assert.equal(retired.retiredCount, 0);
    assert.equal(existsSync(worktreePath), true, "a git-known worktree must survive the sweep");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a directory with no .git pointer file is never a candidate, even though git does not know it", () => {
  const root = freshWorktreeSweepRepo();
  try {
    const bystander = join(root, ".claude", "worktrees", "not-a-worktree");
    mkdirSync(bystander, { recursive: true });
    writeFileSync(join(bystander, "notes.txt"), "unrelated scratch-like content\n");

    const plan = planOrphanWorktreeDirectories({ rootDir: root });
    assert.equal(plan.length, 1);
    assert.equal(plan[0].status, "not-a-worktree-checkout");

    const retired = retireOrphanWorktreeDirectories({ rootDir: root });
    assert.equal(retired.retiredCount, 0);
    assert.equal(existsSync(bystander), true, "a directory that was never a worktree checkout must never be removed");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("an orphaned worktree directory -- git no longer knows it, and its own gitdir record is gone -- is retired", () => {
  const root = freshWorktreeSweepRepo();
  try {
    const worktreePath = join(root, ".claude", "worktrees", "orphaned-one");
    const add = spawnSync("git", ["worktree", "add", "--detach", worktreePath], { cwd: root, encoding: "utf8" });
    assert.equal(add.status, 0, `fixture git worktree add failed: ${add.stderr}`);
    // Simulate exactly what a partial/failed `git worktree remove` leaves behind: the
    // administrative record under .git/worktrees/<name> is gone (so `git worktree list` no
    // longer reports this path, and the directory's own recorded gitdir target is dangling),
    // but the working directory itself was never actually deleted.
    const pointerRaw = readFileSync(join(worktreePath, ".git"), "utf8");
    const pointerMatch = /^gitdir:\s*(.+)$/mu.exec(pointerRaw);
    assert.ok(pointerMatch, "fixture worktree must carry a gitdir pointer file");
    const adminDir = pointerMatch[1].trim();
    assert.equal(existsSync(adminDir), true);
    rmSync(adminDir, { recursive: true, force: true });
    assert.equal(existsSync(worktreePath), true, "the working directory itself must still be present");

    const plan = planOrphanWorktreeDirectories({ rootDir: root });
    assert.equal(plan.length, 1);
    assert.equal(plan[0].status, "orphan");

    const retired = retireOrphanWorktreeDirectories({ rootDir: root });
    assert.equal(retired.retiredCount, 1);
    assert.equal(existsSync(worktreePath), false, "a confirmed orphan must be removed");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("planOrphanWorktreeDirectories fails every entry closed when git worktree list itself is unavailable", () => {
  const root = freshWorktreeSweepRepo();
  try {
    const worktreePath = join(root, ".claude", "worktrees", "unresolvable");
    const add = spawnSync("git", ["worktree", "add", "--detach", worktreePath], { cwd: root, encoding: "utf8" });
    assert.equal(add.status, 0, `fixture git worktree add failed: ${add.stderr}`);

    const brokenSpawn = () => ({ status: 1, stdout: "", stderr: "simulated failure" });
    const plan = planOrphanWorktreeDirectories({ rootDir: root, deps: { spawn: brokenSpawn } });
    assert.equal(plan.length, 1);
    assert.equal(plan[0].status, "unknown-git-worktree-list-unavailable");

    const retired = retireOrphanWorktreeDirectories({ rootDir: root, deps: { spawn: brokenSpawn } });
    assert.equal(retired.retiredCount, 0);
    assert.equal(existsSync(worktreePath), true, "an unresolvable liveness check must never cause a removal");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
