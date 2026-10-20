// SPDX-License-Identifier: SUL-1.0
//
// D70 (a) / AC-203: the activated release of a lost cleanup binding, end to end against the real registry, the real
// private binding and the real recovery verb. The one injected seam is the owner-runtime probe of the OWNER-LIVE case.
// NOTE: this file needs registering in the protected harness/verify-suites.json (C16) before Verify runs it.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { continuityAuthorityRepository, observeSessionCleanupState } from "./onboarding-continuity.mjs";
import {
  inspectSessionAuthorityRegistryRead,
  releaseLostSessionAuthorityMember,
  withSessionAuthorityBoundary,
} from "./session-authority-registry.mjs";
import {
  LostBindingReleaseError,
  digest,
  recoveryBinding,
  releaseLostSessionCleanupBinding,
} from "./session-cleanup-lost-binding.mjs";
import { planSessionCleanupRecovery } from "./session-cleanup-recovery.mjs";
import {
  applyRecoveryInFreshProcess,
  createLegacyLayoutFixture,
  invokeCleanupCli,
} from "./test-session-cleanup-requester-fixture.mjs";
import {
  inspectSignedDescriptorCustodyRepository,
  listActiveSessionDescriptors,
  loadSessionDescriptor,
} from "./worktree-lifecycle.mjs";

function lostFixture(name) {
  const root = createLegacyLayoutFixture({ prefix: "lost-binding", name, goal: "Test lost binding release" });
  const started = invokeCleanupCli(["start", "--repo", root, "--session", `session-${name}`], {});
  assert.equal(started.code, 0);
  const loaded = loadSessionDescriptor(root, started.output.sessionId, {
    expectedDescriptorSha256: started.output.descriptorSha256,
  });
  const bytes = readFileSync(loaded.path);
  unlinkSync(loaded.path);
  const plan = planSessionCleanupRecovery({ rootDir: root });
  assert.equal(plan.status, "ready");
  assert.equal(plan.recovery, "release-lost-binding");
  return { root, plan, descriptorPath: loaded.path, descriptorBytes: bytes };
}

function registryRoot(root) {
  return join(inspectSignedDescriptorCustodyRepository(root).commonDir, "agent-pipeline", "session-authority");
}

function treeDigest(directory) {
  const rows = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name !== "registry.lock") rows.push([path.slice(directory.length), createHash("sha256").update(readFileSync(path)).digest("hex")]);
    }
  };
  walk(directory);
  return digest(rows);
}

function snapshot(root) {
  const state = observeSessionCleanupState(root);
  return {
    state: { stateSha256: state.stateSha256, revision: state.revision, sessionCleanup: state.sessionCleanup },
    descriptors: listActiveSessionDescriptors(root).map((entry) => entry.sessionId),
    registry: treeDigest(registryRoot(root)),
  };
}

function resign(plan, changes) {
  const next = { ...plan, ...changes };
  next.planSha256 = digest(recoveryBinding(next));
  return next;
}

function inBoundary(root, callback) {
  const repository = continuityAuthorityRepository(inspectSignedDescriptorCustodyRepository(root));
  return withSessionAuthorityBoundary({ repository }, callback);
}

function releaseLostMember(root, tuple) {
  return inBoundary(root, (token) => releaseLostSessionAuthorityMember({
    boundary: token, producerId: "onboarding-continuity", target: tuple,
  }));
}

function releaseTerminals(root) {
  const releases = join(registryRoot(root), "releases", "onboarding-continuity");
  return readdirSync(releases).map((name) => JSON.parse(readFileSync(join(releases, name), "utf8")).terminal);
}

test("a PO-activated recovery in a fresh process releases a lost binding, closes its registry member, and a new bound start succeeds", () => {
  const { root, plan } = lostFixture("green");
  try {
    const before = snapshot(root);
    assert.equal(before.state.sessionCleanup.sessionId, plan.sessionCleanup.sessionId);
    const applied = applyRecoveryInFreshProcess({ rootDir: root, expectedPlanSha256: plan.planSha256 });
    assert.equal(applied.status, "recovered");
    assert.equal(observeSessionCleanupState(root).sessionCleanup, null);
    assert.deepEqual(inspectSessionAuthorityRegistryRead({ repository: inspectSignedDescriptorCustodyRepository(root) }), { status: "readable" });
    assert.deepEqual(releaseTerminals(root), ["lost-binding-recovered"]);
    const again = invokeCleanupCli(["start", "--repo", root, "--session", "session-green-after"], {});
    assert.equal(again.code, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("each refusal code leaves the binding, the descriptor set and the registry unchanged", () => {
  const { root, plan, descriptorPath, descriptorBytes } = lostFixture("refusals");
  try {
    const refuses = (code, input) => {
      const before = snapshot(root);
      assert.throws(() => releaseLostSessionCleanupBinding(input), (error) => {
        assert.ok(error instanceof LostBindingReleaseError);
        assert.equal(error.code, code);
        assert.match(error.repair, /^node /u);
        return true;
      });
      assert.deepEqual(snapshot(root), before);
    };
    const ready = { plan, expectedPlanSha256: plan.planSha256, activate: true };
    refuses("WT-LOST-BINDING-ACTIVATION", { ...ready, activate: false });
    refuses("WT-LOST-BINDING-PLAN", { ...ready, expectedPlanSha256: "a".repeat(64) });
    const wrongTuple = resign(plan, { sessionCleanup: { ...plan.sessionCleanup, descriptorSha256: "b".repeat(64) } });
    refuses("WT-LOST-BINDING-TUPLE", { plan: wrongTuple, expectedPlanSha256: wrongTuple.planSha256, activate: true });
    const staleState = resign(plan, { stateSha256: "c".repeat(64) });
    refuses("WT-LOST-BINDING-CAS", { plan: staleState, expectedPlanSha256: staleState.planSha256, activate: true });
    refuses("WT-LOST-BINDING-OWNER-LIVE", { ...ready, deps: { inspectSessionOwnerRuntimeFn: () => ({ status: "live" }) } });
    writeFileSync(descriptorPath, descriptorBytes, { mode: 0o600 });
    refuses("WT-LOST-BINDING-DESCRIPTOR-LIVE", ready);
    assert.ok(existsSync(descriptorPath));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a crash after the registry member step converges when the recovery is rerun in a fresh process", () => {
  const { root, plan } = lostFixture("crash");
  try {
    const member = releaseLostMember(root, plan.sessionCleanup);
    assert.equal(member.status, "released");
    // The process "died" here: the member is released, the private binding is still present.
    assert.equal(observeSessionCleanupState(root).sessionCleanup.sessionId, plan.sessionCleanup.sessionId);
    const applied = applyRecoveryInFreshProcess({ rootDir: root, expectedPlanSha256: plan.planSha256 });
    assert.equal(applied.status, "recovered");
    assert.equal(observeSessionCleanupState(root).sessionCleanup, null);
    assert.deepEqual(inspectSessionAuthorityRegistryRead({ repository: inspectSignedDescriptorCustodyRepository(root) }), { status: "readable" });
    assert.deepEqual(releaseTerminals(root), ["lost-binding-recovered"]);
    assert.deepEqual(releaseLostMember(root, plan.sessionCleanup), { status: "none" });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("releaseLostSessionAuthorityMember refuses while the target's active descriptor exists and writes nothing", () => {
  const { root, plan, descriptorPath, descriptorBytes } = lostFixture("descriptor-live");
  try {
    inBoundary(root, () => null); // settle: a boundary entry may itself heal, which is not what this case measures
    writeFileSync(descriptorPath, descriptorBytes, { mode: 0o600 });
    const before = snapshot(root);
    assert.throws(() => releaseLostMember(root, plan.sessionCleanup), (error) => {
      assert.equal(error.code, "SDC-DESCRIPTOR-CAS");
      assert.match(String(error.reason ?? error.message), /lost-member-descriptor-live/u);
      return true;
    });
    assert.deepEqual(snapshot(root), before);
    assert.deepEqual(readdirSync(join(registryRoot(root), "releases")), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
