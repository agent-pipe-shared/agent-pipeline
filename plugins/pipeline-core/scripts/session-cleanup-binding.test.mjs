#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  applyOnboardingKickoff,
  planOnboardingKickoff,
  readOnboardingSessionCleanupBinding,
} from "../lib/onboarding-continuity.mjs";
import {
  cleanupSession,
  listActiveSessionDescriptors,
  loadSessionDescriptor,
  retireSessionDescriptor,
  startSessionDescriptor,
} from "../lib/worktree-lifecycle.mjs";
import { main as sessionCleanupMain } from "./session-cleanup.mjs";

function fixture(name) {
  const root = mkdtempSync(join(tmpdir(), `session-cleanup-binding-${name}-`));
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
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Test cleanup binding" });
  applyOnboardingKickoff({
    plan,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  });
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

test("start binds once, resumes the exact descriptor and rotates only after closure", () => {
  const root = fixture("lifecycle");
  try {
    const first = invoke(["start", "--repo", root, "--session", "session-binding-first"]);
    assert.equal(first.code, 0);
    assert.equal(first.output.code, "WT-SESSION-STARTED");
    const bound = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.equal(bound.status, "bound");
    assert.deepEqual(bound.sessionCleanup, {
      sessionId: first.output.sessionId,
      descriptorSha256: first.output.descriptorSha256,
    });
    assert.deepEqual(listActiveSessionDescriptors(root), [bound.sessionCleanup]);

    const resumed = invoke(["start", "--repo", root]);
    assert.equal(resumed.output.code, "WT-SESSION-REUSED");
    assert.deepEqual(resumed.output, {
      ok: true,
      code: "WT-SESSION-REUSED",
      ...bound.sessionCleanup,
    });
    assert.deepEqual(listActiveSessionDescriptors(root), [bound.sessionCleanup]);
    assert.throws(
      () => invoke(["start", "--repo", root, "--session", "session-binding-other"]),
      (error) => error?.code === "WT-SESSION-BINDING",
    );

    const cleaned = invoke([
      "cleanup",
      "--repo", root,
      "--session-descriptor", bound.sessionCleanup.sessionId,
      "--expected-descriptor-sha256", bound.sessionCleanup.descriptorSha256,
    ]);
    assert.equal(cleaned.code, 0);
    assert.equal(cleaned.output.status, "complete");
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "unbound");

    const next = invoke(["start", "--repo", root, "--session", "session-binding-next"]);
    assert.equal(next.output.code, "WT-SESSION-STARTED");
    assert.equal(next.output.sessionId, "session-binding-next");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release-binding completes an interrupted post-cleanup State release", () => {
  const root = fixture("release-retry");
  try {
    const started = invoke(["start", "--repo", root, "--session", "session-binding-release"]);
    const loaded = loadSessionDescriptor(root, started.output.sessionId, {
      expectedDescriptorSha256: started.output.descriptorSha256,
    });
    assert.equal(cleanupSession(root, loaded, { allowAbsent: true }).ok, true);
    retireSessionDescriptor(root, loaded);
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "bound");
    const released = invoke(["release-binding", "--repo", root]);
    assert.equal(released.output.code, "WT-SESSION-BINDING-RELEASED");
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "unbound");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("failed first-persist retires its newly created descriptor", () => {
  const root = fixture("rollback");
  try {
    assert.throws(() => invoke(
      ["start", "--repo", root, "--session", "session-binding-rollback"],
      {
        bindOnboardingSessionCleanupFn() {
          const error = new Error("injected CAS failure");
          error.code = "SESSION-CLEANUP-BIND-CAS";
          throw error;
        },
      },
    ), /injected CAS failure/u);
    assert.deepEqual(listActiveSessionDescriptors(root), []);
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "unbound");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unbound private descriptor blocks creation of a second descriptor", () => {
  const root = fixture("orphan");
  try {
    assert.throws(() => invoke(
      ["start", "--repo", root, "--session", "session-binding-orphan"],
      {
        bindOnboardingSessionCleanupFn() {
          throw new Error("stop after descriptor creation");
        },
        retireSessionDescriptorFn() {
          throw new Error("simulate crash before rollback");
        },
      },
    ), (error) => error?.code === "WT-SESSION-BIND-ROLLBACK");
    assert.equal(listActiveSessionDescriptors(root).length, 1);
    assert.throws(
      () => invoke(["start", "--repo", root, "--session", "session-binding-second"]),
      (candidate) => candidate?.code === "WT-SESSION-UNBOUND-DESCRIPTOR",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unbound continuity state without descriptors needs no recovery", () => {
  const root = fixture("no-orphan-recovery");
  try {
    assert.deepEqual(invoke(["plan-recovery", "--repo", root]).output, {
      schema: "pipeline.session-cleanup-recovery-plan.v1",
      status: "not-needed",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("status lists sanitized descriptor owner observations in sorted order", () => {
  const root = fixture("owner-status");
  try {
    const second = startSessionDescriptor(root, { sessionId: "session-owner-status-z" });
    const first = startSessionDescriptor(root, { sessionId: "session-owner-status-a" });
    const status = invoke(["status", "--repo", root]).output;
    assert.deepEqual(status.schema, "pipeline.session-cleanup-status.v1");
    assert.equal(status.status, "observed");
    assert.deepEqual(status.descriptors.map(({ sessionId }) => sessionId), [first.sessionId, second.sessionId]);
    assert.deepEqual(status.descriptors.map(({ descriptorSha256 }) => descriptorSha256), [
      first.descriptorSha256,
      second.descriptorSha256,
    ]);
    assert.equal(status.descriptors.every(({ status: ownerStatus }) => new Set([
      "live", "not-live", "reused", "unavailable", "unobserved",
    ]).has(ownerStatus)), true);
    const serialized = JSON.stringify(status);
    assert.equal(serialized.includes(first.ownerNonce), false);
    assert.equal(serialized.includes(second.ownerNonce), false);
    assert.equal(serialized.includes("processStartId"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a single unbound descriptor requires an activated digest-bound rebind", () => {
  const root = fixture("orphan-rebind");
  try {
    const orphan = startSessionDescriptor(root, { sessionId: "session-binding-orphan-rebind" });
    const plan = invoke(["plan-recovery", "--repo", root]).output;
    assert.equal(plan.status, "ready");
    assert.equal(plan.recovery, "bind-orphan");
    assert.equal(plan.closure, "active");
    assert.equal(plan.activeDescriptorCount, 1);
    assert.deepEqual(plan.sessionCleanup, {
      sessionId: orphan.sessionId,
      descriptorSha256: orphan.descriptorSha256,
    });
    assert.equal(plan.applyAction.requiresConfirmation, true);
    assert.deepEqual(plan.applyAction.expected.statuses, ["rebound"]);
    assert.throws(
      () => invoke([
        "apply-recovery", "--repo", root,
        "--plan-sha256", plan.planSha256,
      ]),
      (error) => error?.code === "WT-SESSION-RECOVERY-ACTIVATION",
    );
    assert.throws(
      () => invoke([
        "apply-recovery", "--repo", root,
        "--plan-sha256", "f".repeat(64),
        "--activate",
      ]),
      (error) => error?.code === "WT-SESSION-RECOVERY-PLAN",
    );
    const applied = invoke([
      "apply-recovery", "--repo", root,
      "--plan-sha256", plan.planSha256,
      "--activate",
    ]).output;
    assert.equal(applied.status, "rebound");
    assert.deepEqual(readOnboardingSessionCleanupBinding({ rootDir: root }).sessionCleanup, plan.sessionCleanup);
    assert.deepEqual(listActiveSessionDescriptors(root), [plan.sessionCleanup]);
    assert.equal(invoke(["start", "--repo", root]).output.code, "WT-SESSION-REUSED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unbound recovery refuses multiple or replaced active descriptors", () => {
  const root = fixture("orphan-rebind-refusal");
  try {
    const first = startSessionDescriptor(root, { sessionId: "session-binding-orphan-first" });
    startSessionDescriptor(root, { sessionId: "session-binding-orphan-second" });
    const multiple = invoke(["plan-recovery", "--repo", root]).output;
    assert.deepEqual(multiple, {
      schema: "pipeline.session-cleanup-recovery-plan.v1",
      status: "orphan-recovery-unavailable",
      activeDescriptorCount: 2,
    });

    unlinkSync(loadSessionDescriptor(root, "session-binding-orphan-second").path);
    const plan = invoke(["plan-recovery", "--repo", root]).output;
    unlinkSync(first.path);
    const replacement = startSessionDescriptor(root, { sessionId: first.sessionId });
    assert.throws(
      () => invoke([
        "apply-recovery", "--repo", root,
        "--plan-sha256", plan.planSha256,
        "--activate",
      ]),
      (error) => error?.code === "WT-SESSION-RECOVERY-PLAN",
    );
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "unbound");
    assert.deepEqual(listActiveSessionDescriptors(root), [{
      sessionId: replacement.sessionId,
      descriptorSha256: replacement.descriptorSha256,
    }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unknown descriptor loss requires an exact activated PO recovery plan", () => {
  const root = fixture("recovery");
  try {
    const first = invoke(["start", "--repo", root, "--session", "session-binding-recovery"]);
    const loaded = loadSessionDescriptor(root, first.output.sessionId, {
      expectedDescriptorSha256: first.output.descriptorSha256,
    });
    unlinkSync(loaded.path);
    const plan = invoke(["plan-recovery", "--repo", root]).output;
    assert.equal(plan.status, "ready");
    assert.equal(plan.closure, "unknown");
    assert.equal(plan.activeDescriptorCount, 0);
    assert.equal(plan.applyAction.requiresConfirmation, true);
    assert.equal(plan.applyAction.argv.at(-1), "--activate");
    assert.throws(
      () => invoke([
        "apply-recovery", "--repo", root,
        "--plan-sha256", plan.planSha256,
      ]),
      (error) => error?.code === "WT-SESSION-RECOVERY-ACTIVATION",
    );
    assert.throws(
      () => invoke([
        "apply-recovery", "--repo", root,
        "--plan-sha256", "f".repeat(64),
        "--activate",
      ]),
      (error) => error?.code === "WT-SESSION-RECOVERY-PLAN",
    );
    const applied = invoke([
      "apply-recovery", "--repo", root,
      "--plan-sha256", plan.planSha256,
      "--activate",
    ]).output;
    assert.equal(applied.status, "recovered");
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "unbound");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
