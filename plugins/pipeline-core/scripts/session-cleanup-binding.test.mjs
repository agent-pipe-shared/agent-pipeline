#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  applyOnboardingKickoff,
  applyOnboardingKickoffPromotion,
  planOnboardingKickoff,
  planOnboardingKickoffPromotion,
  readOnboardingSessionCleanupBinding,
} from "../lib/onboarding-continuity.mjs";
import {
  applySessionCleanupRecovery,
  SessionCleanupRecoveryError,
  sessionCleanupRecoveryInternals,
} from "../lib/session-cleanup-recovery.mjs";
import { validateContinuityState } from "../lib/continuity-state.mjs";
import {
  cleanupSession,
  createDetachedWorktree,
  listActiveSessionDescriptors,
  loadSessionDescriptor,
  registerTemporaryIntent,
  retireSessionDescriptor,
  startSessionDescriptor,
} from "../lib/worktree-lifecycle.mjs";
import { main as sessionCleanupMain } from "./session-cleanup.mjs";
import {
  applyProjectAuthorityMigration,
  planProjectAuthorityMigration,
} from "../lib/project-authority.mjs";

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

test("human recovery plan is read-only when automatic cleanup observation is unavailable", () => {
  const root = fixture("human-recovery-plan");
  try {
    const planned = invoke(["plan-human-recovery", "--repo", root], {
      planSessionCleanupRecoveryFn() {
        const error = new Error("private binding conflicts");
        error.code = "SESSION-CLEANUP-PRIVATE-CAS";
        throw error;
      },
    });
    assert.equal(planned.code, 0);
    assert.equal(planned.output.schema, "pipeline.session-cleanup-human-recovery-plan.v1");
    assert.equal(planned.output.status, "decision-required");
    assert.equal(planned.output.root, root);
    assert.deepEqual(planned.output.observed, {
      status: "observation-unavailable",
      code: "SESSION-CLEANUP-PRIVATE-CAS",
    });
    assert.deepEqual(planned.output.candidates.map((candidate) => candidate.id), [
      "retain-and-observe",
      "attended-host-recovery",
    ]);
    assert.equal(planned.output.automaticMutation, false);
    assert.match(planned.output.planSha256, /^[a-f0-9]{64}$/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function legacyPromotionCleanupMismatch(name) {
  const root = neutralFixture(`promotion-mismatch-${name}`);
  const statePath = join(root, "project", "pipeline-state.json");
  const started = invoke(["start", "--repo", root, "--session", `promotion-mismatch-${name}`]);
  const bindingPath = join(root, ".git", "agent-pipeline", "onboarding", "session-cleanup-binding.json");
  const kickoffBinding = readFileSync(bindingPath);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.continuity.revision = 1;
  state.continuity.resume = { mode: "resume-on-next-turn", sourceRevision: 0, reasonCode: "host-no-background-wakeup" };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const authorityDir = join(root, "specs", "rune");
  mkdirSync(authorityDir, { recursive: true });
  writeFileSync(join(authorityDir, "prd.md"), "# Rune PRD\n");
  writeFileSync(join(authorityDir, "spec.md"), "# Rune spec\n");
  const promotion = planOnboardingKickoffPromotion({
    rootDir: root, profile: "feature", featureId: "rune-game",
    planPath: "specs/rune/spec.md", prdPath: "specs/rune/prd.md", specPath: "specs/rune/spec.md",
  });
  applyOnboardingKickoffPromotion({ plan: promotion, expectedPlanSha256: promotion.planSha256, activate: true });
  const historyPath = join(root, ".git", "agent-pipeline", "onboarding", "continuity-history.json");
  const history = JSON.parse(readFileSync(historyPath, "utf8"));
  delete history.transactions[1].cleanupBinding;
  writeFileSync(historyPath, `${JSON.stringify(history)}\n`, { mode: 0o600 });
  writeFileSync(bindingPath, kickoffBinding, { mode: 0o600 });
  return { root, statePath, bindingPath, historyPath, started };
}

function rewriteAsLegacyDescriptor(root, sessionId) {
  const loaded = loadSessionDescriptor(root, sessionId);
  const descriptor = JSON.parse(readFileSync(loaded.path, "utf8"));
  descriptor.schema = "pipeline.session-descriptor.v1";
  delete descriptor.ownerRuntime;
  writeFileSync(loaded.path, `${JSON.stringify(descriptor, null, 2)}\n`, { mode: 0o600 });
  return loadSessionDescriptor(root, sessionId);
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
    const released = invoke(["release-binding", "--repo", root], {
      requireProjectOnboardingReadyFn() {
        throw new Error("legacy authority migration is still pending");
      },
    });
    assert.equal(released.output.code, "WT-SESSION-BINDING-RELEASED");
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "unbound");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plan-recovery repairs only the exact historical kickoff-promotion cleanup mismatch", () => {
  const fixture = legacyPromotionCleanupMismatch("exact");
  try {
    const before = {
      state: readFileSync(fixture.statePath),
      history: readFileSync(fixture.historyPath),
      binding: readFileSync(fixture.bindingPath),
    };
    const planned = invoke(["plan-recovery", "--repo", fixture.root]);
    assert.equal(planned.code, 0);
    assert.equal(planned.output.status, "ready");
    assert.equal(JSON.stringify(planned.output).includes(fixture.started.output.descriptorSha256), false);
    assert.deepEqual(readFileSync(fixture.statePath), before.state);
    assert.deepEqual(readFileSync(fixture.historyPath), before.history);
    assert.deepEqual(readFileSync(fixture.bindingPath), before.binding);
    const applied = invoke([
      "apply-recovery", "--repo", fixture.root,
      "--plan-sha256", planned.output.planSha256, "--activate",
    ]);
    assert.equal(applied.output.status, "applied");
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: fixture.root }).status, "bound");
    const replay = invoke([
      "apply-recovery", "--repo", fixture.root,
      "--plan-sha256", planned.output.planSha256, "--activate",
    ]);
    assert.equal(replay.output.status, "replayed");
    assert.equal(replay.output.mutated, false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("sanctioned neutral start/reuse/release keeps portable State structurally redacted", () => {
  const root = neutralFixture("neutral-private-binding");
  const statePath = join(root, "project", "pipeline-state.json");
  try {
    const before = readFileSync(statePath);
    const started = invoke(["start", "--repo", root, "--session", "neutral-session"]);
    assert.equal(started.output.code, "WT-SESSION-STARTED");
    assert.deepEqual(readFileSync(statePath), before);
    const portable = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(portable.continuity.runtime.sessionCleanup, null);
    assert.equal(JSON.stringify(portable).includes(started.output.sessionId), false);
    assert.equal(JSON.stringify(portable).includes(started.output.descriptorSha256), false);
    const structuralStatus = {
      status: readOnboardingSessionCleanupBinding({ rootDir: root }).status,
      descriptor: "<redacted>",
      portableSessionCleanup: portable.continuity.runtime.sessionCleanup,
    };
    assert.deepEqual(structuralStatus, {
      status: "bound",
      descriptor: "<redacted>",
      portableSessionCleanup: null,
    });

    const resumed = invoke(["start", "--repo", root]);
    assert.equal(resumed.output.code, "WT-SESSION-REUSED");
    assert.deepEqual(readFileSync(statePath), before);
    const loaded = loadSessionDescriptor(root, started.output.sessionId, {
      expectedDescriptorSha256: started.output.descriptorSha256,
    });
    assert.equal(cleanupSession(root, loaded, { allowAbsent: true }).ok, true);
    retireSessionDescriptor(root, loaded);
    assert.equal(invoke(["release-binding", "--repo", root]).output.code, "WT-SESSION-BINDING-RELEASED");
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "unbound");
    assert.deepEqual(readFileSync(statePath), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hostile neutral portable cleanup identity fails closed without private rebinding", () => {
  const root = neutralFixture("neutral-hostile-state");
  const statePath = join(root, "project", "pipeline-state.json");
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.continuity.runtime.sessionCleanup = {
      sessionId: "hostile-session",
      descriptorSha256: "f".repeat(64),
    };
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
    const before = readFileSync(statePath);
    assert.throws(
      () => readOnboardingSessionCleanupBinding({ rootDir: root }),
      (error) => error?.code === "SESSION-CLEANUP-STATE-NONPORTABLE",
    );
    assert.throws(
      () => invoke(["start", "--repo", root]),
      (error) => error?.code === "SESSION-CLEANUP-STATE-NONPORTABLE",
    );
    assert.deepEqual(readFileSync(statePath), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sanctioned privatization converges one historical neutral cleanup tuple without projecting identity", () => {
  const root = neutralFixture("neutral-privatization");
  const statePath = join(root, "project", "pipeline-state.json");
  const active = startSessionDescriptor(root, {
    sessionId: "historical-neutral-session",
    ownerNonce: "historical-neutral-owner",
  });
  const leaked = {
    sessionId: active.sessionId,
    descriptorSha256: active.descriptorSha256,
  };
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.continuity.runtime.sessionCleanup = leaked;
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });

    const planned = invoke(["plan-privatization", "--repo", root]).output;
    assert.equal(planned.status, "ready");
    assert.equal(JSON.stringify(planned).includes(leaked.sessionId), false);
    assert.equal(JSON.stringify(planned).includes(leaked.descriptorSha256), false);
    assert.deepEqual(planned.applyAction, {
      kind: "command",
      executable: "node",
      argv: [
        planned.sessionCleanupScript,
        "apply-privatization",
        "--repo",
        root,
        "--plan-sha256",
        planned.planSha256,
        "--activate",
      ],
      mutation: true,
      requiresConfirmation: true,
      executionBoundary: "host-authorized-wsl",
      expected: {
        schema: "pipeline.session-cleanup-privatization-apply.v1",
        statuses: ["applied", "noop"],
      },
    });
    assert.equal(JSON.stringify(planned.applyAction).includes(leaked.sessionId), false);
    assert.equal(JSON.stringify(planned.applyAction).includes(leaked.descriptorSha256), false);
    assert.throws(
      () => invoke([
        "apply-privatization",
        "--repo",
        root,
        "--plan-sha256",
        planned.planSha256,
      ]),
      (error) => error?.code === "SESSION-CLEANUP-PRIVATIZE-ACTIVATION",
    );
    assert.throws(
      () => invoke([
        "apply-privatization",
        "--repo",
        root,
        "--plan-sha256",
        "f".repeat(64),
        "--activate",
      ]),
      (error) => error?.code === "SESSION-CLEANUP-PRIVATIZE-CAS",
    );
    const applied = invoke([
      "apply-privatization",
      "--repo",
      root,
      "--plan-sha256",
      planned.planSha256,
      "--activate",
    ]).output;
    assert.equal(applied.status, "applied");
    assert.equal(applied.portable, true);
    const portable = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(portable.continuity.runtime.sessionCleanup, null);
    assert.equal(JSON.stringify(portable).includes(leaked.sessionId), false);
    assert.equal(JSON.stringify(portable).includes(leaked.descriptorSha256), false);
    const binding = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.equal(binding.status, "bound");
    assert.deepEqual(binding.sessionCleanup, leaked);
    assert.deepEqual(listActiveSessionDescriptors(root), [{
      sessionId: leaked.sessionId,
      descriptorSha256: leaked.descriptorSha256,
    }]);

    const replayPlan = invoke(["plan-privatization", "--repo", root]).output;
    assert.equal(replayPlan.status, "noop");
    const beforeReplay = readFileSync(statePath);
    const replay = invoke([
      "apply-privatization",
      "--repo",
      root,
      "--plan-sha256",
      replayPlan.planSha256,
      "--activate",
    ]).output;
    assert.equal(replay.status, "noop");
    assert.deepEqual(readFileSync(statePath), beforeReplay);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("privatization planning rejects missing, replaced, or multiple active descriptors", () => {
  for (const mode of ["missing", "replaced", "multiple"]) {
    const root = neutralFixture(`neutral-privatization-${mode}`);
    const statePath = join(root, "project", "pipeline-state.json");
    try {
      const active = startSessionDescriptor(root, {
        sessionId: `historical-${mode}`,
        ownerNonce: `historical-owner-${mode}`,
      });
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      state.continuity.runtime.sessionCleanup = {
        sessionId: active.sessionId,
        descriptorSha256: mode === "replaced" ? "e".repeat(64) : active.descriptorSha256,
      };
      writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      if (mode === "missing") {
        retireSessionDescriptor(root, active);
      } else if (mode === "multiple") {
        startSessionDescriptor(root, {
          sessionId: "unrelated-active-session",
          ownerNonce: "unrelated-active-owner",
        });
      }
      assert.throws(
        () => invoke(["plan-privatization", "--repo", root]),
        (error) => error?.code === "SESSION-CLEANUP-PRIVATIZE-DESCRIPTOR",
      );
      assert.equal(JSON.parse(readFileSync(statePath, "utf8"))
        .continuity.runtime.sessionCleanup.sessionId, active.sessionId);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("double-confirmed privatization recovery clears only a leaked tuple and remains blocked when owner observation is unavailable", () => {
  const root = neutralFixture("privatization-owner-observation-unavailable");
  const statePath = join(root, "project", "pipeline-state.json");
  try {
    const started = invoke(["start", "--repo", root, "--session", "unavailable-owner-123"]);
    assert.equal(started.code, 0);
    const binding = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.equal(binding.status, "bound");
    const beforeBinding = readFileSync(join(root, ".git", "agent-pipeline", "onboarding", "session-cleanup-binding.json"));
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.continuity.runtime.sessionCleanup = binding.sessionCleanup;
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    const descriptorPath = join(root, ".git", "agent-pipeline", "session-descriptors", "active", `${binding.sessionCleanup.sessionId}.json`);
    writeFileSync(descriptorPath, "{broken descriptor}\n", { mode: 0o600 });

    const plan = invoke(["plan-privatization", "--repo", root]).output;
    assert.equal(plan.status, "ready");
    assert.equal(plan.mode, "owner-observation-recovery");
    assert.equal(JSON.stringify(plan).includes(binding.sessionCleanup.sessionId), false);
    assert.equal(JSON.stringify(plan).includes(binding.sessionCleanup.descriptorSha256), false);
    assert.deepEqual(plan.applyAction.argv.slice(-3), [
      "--plan-sha256", plan.planSha256, "--accept",
    ]);
    assert.throws(() => invoke([
      "apply-privatization", "--repo", root, "--plan-sha256", plan.planSha256, "--activate",
    ]), (error) => error?.code === "SESSION-CLEANUP-PRIVATIZE-CONFIRMATION");

    const confirmed = invoke(plan.applyAction.argv.slice(1)).output;
    assert.equal(confirmed.status, "confirmed");
    assert.equal(confirmed.planSha256, plan.planSha256);
    assert.equal(JSON.stringify(confirmed).includes(binding.sessionCleanup.sessionId), false);
    const applied = invoke(confirmed.applyAction.argv.slice(1)).output;
    assert.equal(applied.status, "blocked");
    assert.equal(applied.lifecycleStatus, "ready");
    assert.equal(applied.ownerObservation, "unavailable");
    assert.match(applied.auditSha256, /^[a-f0-9]{64}$/u);
    assert.equal(JSON.parse(readFileSync(statePath, "utf8")).continuity.runtime.sessionCleanup, null);
    assert.deepEqual(readFileSync(join(root, ".git", "agent-pipeline", "onboarding", "session-cleanup-binding.json")), beforeBinding);
    const auditPath = join(root, ".git", "agent-pipeline", "onboarding", `session-cleanup-privatization-audit.${plan.planSha256}.json`);
    assert.equal(existsSync(auditPath), true);
    assert.equal(JSON.stringify(JSON.parse(readFileSync(auditPath, "utf8"))).includes(binding.sessionCleanup.sessionId), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("privatization planning rejects malformed, multiply embedded, or conflicting bindings", () => {
  for (const mode of ["malformed", "multiple-binding", "private-conflict"]) {
    const root = neutralFixture(`neutral-privatization-${mode}`);
    const statePath = join(root, "project", "pipeline-state.json");
    try {
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      let expectedCode = "SESSION-CLEANUP-PRIVATIZE-SHAPE";
      if (mode === "malformed") {
        state.continuity.runtime.sessionCleanup = {
          sessionId: "historical-malformed",
          descriptorSha256: "a".repeat(64),
          unexpected: true,
        };
      } else if (mode === "multiple-binding") {
        const active = startSessionDescriptor(root, {
          sessionId: "historical-multiple-binding",
          ownerNonce: "historical-multiple-binding-owner",
        });
        state.continuity.runtime.sessionCleanup = {
          sessionId: active.sessionId,
          descriptorSha256: active.descriptorSha256,
        };
        state.unexpected = {
          sessionCleanup: {
            sessionId: "second-private-session",
            descriptorSha256: "b".repeat(64),
          },
        };
      } else {
        const bound = invoke(["start", "--repo", root, "--session", "private-bound-session"]).output;
        state.continuity.runtime.sessionCleanup = {
          sessionId: "conflicting-portable-session",
          descriptorSha256: "c".repeat(64),
        };
        assert.notEqual(bound.sessionId, state.continuity.runtime.sessionCleanup.sessionId);
        expectedCode = "SESSION-CLEANUP-PRIVATE-CAS";
      }
      writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      const before = readFileSync(statePath);
      assert.throws(
        () => invoke(["plan-privatization", "--repo", root]),
        (error) => error?.code === expectedCode,
      );
      assert.deepEqual(readFileSync(statePath), before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("privatization apply rejects portable State drift after planning", () => {
  const root = neutralFixture("neutral-privatization-drift");
  const statePath = join(root, "project", "pipeline-state.json");
  try {
    const active = startSessionDescriptor(root, {
      sessionId: "historical-drift",
      ownerNonce: "historical-owner-drift",
    });
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.continuity.runtime.sessionCleanup = {
      sessionId: active.sessionId,
      descriptorSha256: active.descriptorSha256,
    };
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    const plan = invoke(["plan-privatization", "--repo", root]).output;
    state.updatedAt = "2026-07-31T09:30:00.000Z";
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    assert.throws(
      () => invoke([
        "apply-privatization",
        "--repo",
        root,
        "--plan-sha256",
        plan.planSha256,
        "--activate",
      ]),
      (error) => error?.code === "SESSION-CLEANUP-PRIVATIZE-CAS",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function gitRun(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return String(result.stdout).trim();
}

function legacyClosedCleanupFixture(name) {
  const root = fixture(name);
  const started = invoke(["start", "--repo", root, "--session", `session-${name}`]);
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
  return { root, statePath, sessionCleanup: {
    sessionId: started.output.sessionId,
    descriptorSha256: started.output.descriptorSha256,
  } };
}

test("legacy post-close binding is recovered only from exact Git and closure proof", () => {
  const fixtureState = legacyClosedCleanupFixture("legacy-closed-release");
  try {
    const binding = readOnboardingSessionCleanupBinding({ rootDir: fixtureState.root });
    assert.equal(binding.status, "closed-bound");
    assert.deepEqual(binding.sessionCleanup, fixtureState.sessionCleanup);
    assert.equal(binding.releaseProof.schema, "pipeline.session-cleanup-release-proof.v1");
    const plan = invoke(["plan-recovery", "--repo", fixtureState.root]).output;
    assert.equal(plan.status, "ready");
    assert.equal(plan.recovery, "release-closed-feature");
    assert.equal(plan.closure.status, "closed");
    assert.match(plan.closure.receiptSha256, /^[a-f0-9]{64}$/u);
    assert.equal(plan.applyAction.requiresConfirmation, true);
    const applied = invoke([
      "apply-recovery", "--repo", fixtureState.root,
      "--plan-sha256", plan.planSha256,
      "--activate",
    ]).output;
    assert.equal(applied.status, "recovered");
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: fixtureState.root }).status, "released");
    const state = JSON.parse(readFileSync(fixtureState.statePath, "utf8"));
    assert.equal(state.cleanupReleases.length, 1);
    assert.equal(state.cleanupReleases[0].recoveryPlanSha256, plan.planSha256);
    const replay = invoke([
      "apply-recovery", "--repo", fixtureState.root,
      "--plan-sha256", plan.planSha256,
      "--activate",
    ]).output;
    assert.equal(replay.status, "recovered");
    assert.equal(replay.mutated, false);
    assert.equal(JSON.parse(readFileSync(fixtureState.statePath, "utf8")).cleanupReleases.length, 1);
  } finally {
    rmSync(fixtureState.root, { recursive: true, force: true });
  }
});

test("legacy post-close recovery rejects close-entry drift after planning", () => {
  const fixtureState = legacyClosedCleanupFixture("legacy-closed-drift");
  try {
    const plan = invoke(["plan-recovery", "--repo", fixtureState.root]).output;
    const drifted = JSON.parse(readFileSync(fixtureState.statePath, "utf8"));
    drifted.closedFeatures[0].closedBy = "foreign-writer";
    writeFileSync(fixtureState.statePath, `${JSON.stringify(drifted, null, 2)}\n`);
    assert.throws(
      () => invoke([
        "apply-recovery", "--repo", fixtureState.root,
        "--plan-sha256", plan.planSha256,
        "--activate",
      ]),
      (error) => error?.code === "WT-SESSION-RECOVERY-PLAN",
    );
    assert.equal(JSON.parse(readFileSync(fixtureState.statePath, "utf8")).cleanupReleases, undefined);
  } finally {
    rmSync(fixtureState.root, { recursive: true, force: true });
  }
});

test("neutral coordinator-close release is private, byte-stable, and replayable", () => {
  const root = neutralFixture("private-coordinator-release");
  try {
    const started = invoke(["start", "--repo", root, "--session", "session-private-coordinator"]);
    const statePath = join(root, "project", "pipeline-state.json");
    const active = JSON.parse(readFileSync(statePath, "utf8"));
    mkdirSync(join(root, "specs"), { recursive: true });
    mkdirSync(join(root, "evidence"), { recursive: true });
    const resultBytes = "private coordinator result\n";
    const evidenceBytes = "private coordinator evidence\n";
    writeFileSync(join(root, "specs", "private-coordinator-result.md"), resultBytes);
    writeFileSync(join(root, "evidence", "private-coordinator-close.md"), evidenceBytes);
    active.continuity.authority.result = {
      path: "specs/private-coordinator-result.md",
      sha256: createHash("sha256").update(resultBytes).digest("hex"),
    };
    active.continuity.queueHead = { ...active.continuity.queueHead, nextAction: "close", dispatch: null };
    assert.equal(validateContinuityState(active.continuity, active.activeFeature.id).ok, true);
    writeFileSync(statePath, `${JSON.stringify(active, null, 2)}\n`);
    gitRun(root, ["config", "user.email", "fixture@example.invalid"]);
    gitRun(root, ["config", "user.name", "Fixture"]);
    gitRun(root, ["add", "project/pipeline-state.json", "specs/private-coordinator-result.md", "evidence/private-coordinator-close.md"]);
    gitRun(root, ["commit", "-q", "-m", "fixture: private coordinator close preimage"]);
    const descriptor = loadSessionDescriptor(root, started.output.sessionId, {
      expectedDescriptorSha256: started.output.descriptorSha256,
    });
    assert.equal(cleanupSession(root, descriptor, { allowAbsent: true }).ok, true);
    retireSessionDescriptor(root, descriptor);
    const closed = {
      schema: "pipeline.state.v0",
      planApproved: false,
      updatedAt: "2026-07-31T12:00:00.000Z",
      closedFeatures: [{
        id: active.activeFeature.id,
        planPath: active.activeFeature.planPath,
        phaseAtClose: active.activeFeature.phase,
        closedAt: "2026-07-31T12:00:00.000Z",
        closedBy: "close-coordinator",
        forCommit: gitRun(root, ["rev-parse", "HEAD"]),
        continuityClose: {
          schema: "pipeline.continuity-close.v0", featureId: active.activeFeature.id,
          expectedRevision: active.continuity.revision,
          result: structuredClone(active.continuity.authority.result),
          closeEvidence: {
            path: "evidence/private-coordinator-close.md",
            sha256: createHash("sha256").update(evidenceBytes).digest("hex"),
          },
        },
        coordinatorClose: {
          schema: "pipeline.close-coordinator-reference.v1",
          lifecycleId: "private-coordinator-release",
          stateSha256: "a".repeat(64), revision: 2, phase: "feature-close-prepared",
        },
      }],
    };
    writeFileSync(statePath, `${JSON.stringify(closed, null, 2)}\n`);
    const stateBefore = readFileSync(statePath);
    const closureReceiptPath = join(
      root,
      ".git",
      "agent-pipeline",
      "session-cleanup",
      "receipts",
      `${started.output.sessionId}.json`,
    );
    const closureReceiptBytes = readFileSync(closureReceiptPath);
    unlinkSync(closureReceiptPath);
    assert.equal(invoke(["plan-recovery", "--repo", root]).output.status, "closed-recovery-unavailable");
    writeFileSync(closureReceiptPath, closureReceiptBytes, { mode: 0o600, flag: "wx" });
    const plan = invoke(["plan-recovery", "--repo", root]).output;
    assert.equal(plan.status, "ready");
    assert.equal(plan.recovery, "release-closed-feature");
    assert.equal(plan.releaseProof, null);
    assert.match(plan.coordinatorCloseSha256, /^[a-f0-9]{64}$/u);
    assert.equal(JSON.stringify(plan).includes(started.output.sessionId), false);
    assert.equal(JSON.stringify(plan).includes(started.output.descriptorSha256), false);
    const bindingPath = join(root, ".git", "agent-pipeline", "onboarding", "session-cleanup-binding.json");
    const receiptPath = join(root, ".git", "agent-pipeline", "onboarding", "session-cleanup-release-receipt.json");
    const bindingBytes = readFileSync(bindingPath);
    const wrongFeature = JSON.parse(stateBefore);
    wrongFeature.closedFeatures[0].id = "wrong-private-feature";
    wrongFeature.closedFeatures[0].continuityClose.featureId = "wrong-private-feature";
    writeFileSync(statePath, `${JSON.stringify(wrongFeature, null, 2)}\n`);
    const wrongFeaturePlan = invoke(["plan-recovery", "--repo", root]).output;
    assert.equal(wrongFeaturePlan.status, "ready");
    assert.throws(
      () => invoke([
        "apply-recovery", "--repo", root,
        "--plan-sha256", wrongFeaturePlan.planSha256,
        "--activate",
      ]),
      (error) => error?.code === "SESSION-CLEANUP-PRIVATE-RELEASE-CAS",
    );
    writeFileSync(statePath, stateBefore);
    const coordinatorDrift = JSON.parse(stateBefore);
    coordinatorDrift.closedFeatures[0].coordinatorClose.stateSha256 = "b".repeat(64);
    writeFileSync(statePath, `${JSON.stringify(coordinatorDrift, null, 2)}\n`);
    assert.throws(
      () => invoke(["apply-recovery", "--repo", root, "--plan-sha256", plan.planSha256, "--activate"]),
      (error) => error?.code === "WT-SESSION-RECOVERY-PLAN",
    );
    writeFileSync(statePath, stateBefore);
    const revisionDrift = JSON.parse(stateBefore);
    revisionDrift.closedFeatures[0].coordinatorClose.revision = 3;
    writeFileSync(statePath, `${JSON.stringify(revisionDrift, null, 2)}\n`);
    assert.throws(
      () => readOnboardingSessionCleanupBinding({ rootDir: root }),
      (error) => error?.code === "SESSION-CLEANUP-STATE-MALFORMED",
    );
    writeFileSync(statePath, stateBefore);
    const bindingDrift = JSON.parse(bindingBytes);
    bindingDrift.featureId = "wrong-feature";
    writeFileSync(bindingPath, `${JSON.stringify(bindingDrift)}\n`, { mode: 0o600 });
    assert.throws(
      () => readOnboardingSessionCleanupBinding({ rootDir: root }),
      (error) => error?.code === "SESSION-CLEANUP-PRIVATE-AUTH",
    );
    writeFileSync(bindingPath, bindingBytes, { mode: 0o600 });
    const unexpectedDescriptor = startSessionDescriptor(root, { sessionId: "session-private-release-unexpected" });
    assert.throws(
      () => applySessionCleanupRecovery({
        rootDir: root, expectedPlanSha256: plan.planSha256, activate: true,
      }),
      (error) => error?.code === "SESSION-CLEANUP-PRIVATE-RELEASE-CAS",
    );
    retireSessionDescriptor(root, unexpectedDescriptor);
    assert.throws(
      () => applySessionCleanupRecovery({
        rootDir: root,
        expectedPlanSha256: plan.planSha256,
        activate: true,
        deps: {
          afterPrivateReleaseReceiptWrite() { throw new Error("simulated crash after receipt write"); },
        },
      }),
      (error) => error?.code === "SESSION-CLEANUP-PRIVATE-RELEASE-WRITE",
    );
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "closed-bound");
    assert.equal(existsSync(bindingPath), true);
    assert.equal(existsSync(receiptPath), true);
    assert.deepEqual(readFileSync(statePath), stateBefore);
    const receiptBytes = readFileSync(receiptPath);
    const receiptDrift = JSON.parse(receiptBytes);
    receiptDrift.bindingSha256 = "c".repeat(64);
    writeFileSync(receiptPath, `${JSON.stringify(receiptDrift)}\n`, { mode: 0o600 });
    const driftedReceiptBinding = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.equal(driftedReceiptBinding.status, "closed-bound");
    assert.equal(driftedReceiptBinding.privateReceiptStatus, "invalid");
    const driftedReceiptPlan = invoke(["plan-recovery", "--repo", root]).output;
    assert.equal(driftedReceiptPlan.status, "ready");
    assert.equal(driftedReceiptPlan.recovery, "release-closed-feature");
    assert.equal(driftedReceiptPlan.privateReceiptRecoverySha256, driftedReceiptBinding.privateReceiptSha256);
    assert.equal(JSON.stringify(driftedReceiptPlan).includes(started.output.sessionId), false);
    assert.equal(JSON.stringify(driftedReceiptPlan).includes(started.output.descriptorSha256), false);
    writeFileSync(receiptPath, receiptBytes, { mode: 0o600 });
    const applied = invoke(["apply-recovery", "--repo", root, "--plan-sha256", plan.planSha256, "--activate"]).output;
    assert.equal(applied.status, "recovered");
    assert.equal(applied.mutated, true);
    assert.deepEqual(readFileSync(statePath), stateBefore);
    const binding = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.equal(binding.status, "closed-unbound");
    assert.equal(binding.releasePlanSha256, plan.planSha256);
    assert.equal(existsSync(bindingPath), false);
    assert.equal(existsSync(receiptPath), true);
    assert.equal(invoke(["plan-recovery", "--repo", root]).output.status, "not-needed");
    writeFileSync(bindingPath, bindingBytes, { mode: 0o600, flag: "wx" });
    assert.throws(
      () => applySessionCleanupRecovery({
        rootDir: root,
        expectedPlanSha256: plan.planSha256,
        activate: true,
        deps: {
          afterPrivateReleaseBindingUnlink() { throw new Error("simulated crash after binding unlink"); },
        },
      }),
      (error) => error?.code === "SESSION-CLEANUP-PRIVATE-RELEASE-WRITE",
    );
    assert.equal(existsSync(bindingPath), false);
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "closed-unbound");
    assert.deepEqual(readFileSync(statePath), stateBefore);
    const replay = invoke(["apply-recovery", "--repo", root, "--plan-sha256", plan.planSha256, "--activate"]).output;
    assert.equal(replay.mutated, false);

    writeFileSync(statePath, `${JSON.stringify(active, null, 2)}\n`);
    const next = invoke(["start", "--repo", root, "--session", "session-after-private-release"]);
    assert.equal(next.output.code, "WT-SESSION-STARTED");
    const archivedReceiptPath = join(
      root,
      ".git",
      "agent-pipeline",
      "onboarding",
      `session-cleanup-release-receipt.${plan.planSha256}.json`,
    );
    assert.equal(existsSync(receiptPath), false);
    assert.equal(existsSync(archivedReceiptPath), true);
    assert.deepEqual(readFileSync(archivedReceiptPath), receiptBytes);
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "bound");

    const nextDescriptor = loadSessionDescriptor(root, next.output.sessionId, {
      expectedDescriptorSha256: next.output.descriptorSha256,
    });
    assert.equal(cleanupSession(root, nextDescriptor, { allowAbsent: true }).ok, true);
    retireSessionDescriptor(root, nextDescriptor);
    assert.equal(invoke(["release-binding", "--repo", root]).output.code, "WT-SESSION-BINDING-RELEASED");
    writeFileSync(statePath, stateBefore);
    const detachedReceiptDrift = JSON.parse(receiptBytes);
    detachedReceiptDrift.bindingSha256 = "d".repeat(64);
    writeFileSync(receiptPath, `${JSON.stringify(detachedReceiptDrift)}\n`, { mode: 0o600, flag: "wx" });
    const invalidDetached = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.equal(invalidDetached.status, "closed-receipt-invalid");
    const quarantinePlan = invoke(["plan-recovery", "--repo", root]).output;
    assert.equal(quarantinePlan.status, "ready");
    assert.equal(quarantinePlan.recovery, "quarantine-private-receipt");
    assert.equal(JSON.stringify(quarantinePlan).includes(started.output.sessionId), false);
    assert.equal(JSON.stringify(quarantinePlan).includes(started.output.descriptorSha256), false);
    const quarantined = invoke([
      "apply-recovery", "--repo", root,
      "--plan-sha256", quarantinePlan.planSha256,
      "--activate",
    ]).output;
    assert.equal(quarantined.mutated, true);
    const quarantineReadback = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.equal(quarantineReadback.status, "closed-unbound");
    assert.equal(quarantineReadback.privateReceiptStatus, "quarantined");
    assert.equal(quarantineReadback.releasePlanSha256, quarantinePlan.planSha256);
    assert.equal(invoke(["plan-recovery", "--repo", root]).output.status, "not-needed");
    const quarantineReplay = invoke([
      "apply-recovery", "--repo", root,
      "--plan-sha256", quarantinePlan.planSha256,
      "--activate",
    ]).output;
    assert.equal(quarantineReplay.mutated, false);

    writeFileSync(bindingPath, bindingBytes, { mode: 0o600, flag: "wx" });
    const conflictingReceiptPlan = invoke(["plan-recovery", "--repo", root]).output;
    assert.equal(conflictingReceiptPlan.status, "ready");
    assert.equal(
      conflictingReceiptPlan.privateReceiptRecoverySha256,
      quarantineReadback.privateReceiptSha256,
    );
    const conflictingReceiptApplied = invoke([
      "apply-recovery", "--repo", root,
      "--plan-sha256", conflictingReceiptPlan.planSha256,
      "--activate",
    ]).output;
    assert.equal(conflictingReceiptApplied.mutated, true);
    const repairedReceipt = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.equal(repairedReceipt.status, "closed-unbound");
    assert.equal(repairedReceipt.privateReceiptStatus, "valid");
    assert.equal(repairedReceipt.releasePlanSha256, conflictingReceiptPlan.planSha256);
    assert.equal(invoke([
      "apply-recovery", "--repo", root,
      "--plan-sha256", conflictingReceiptPlan.planSha256,
      "--activate",
    ]).output.mutated, false);
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

test("start is an exact no-op at writer-shaped closed and design transition boundaries", () => {
  const rows = [
    ["closed", {
      schema: "pipeline.state.v0",
      planApproved: false,
      updatedAt: "2026-07-29T08:00:00.000Z",
      closedFeatures: [{
        id: "previous-feature",
        planPath: "specs/previous/prd.md",
        phaseAtClose: "implementation",
        closedAt: "2026-07-29T08:00:00.000Z",
        closedBy: "PO",
        forCommit: null,
      }],
    }, "closed-unbound"],
    ["design", {
      schema: "pipeline.state.v0",
      activeFeature: {
        id: "next-feature",
        planPath: "specs/next/prd.md",
        phase: "design",
      },
      planApproved: false,
      updatedAt: "2026-07-29T08:01:00.000Z",
    }, "design-unbound"],
  ];
  for (const [name, state, bindingStatus] of rows) {
    const root = fixture(`not-required-${name}`);
    try {
      const statePath = join(root, ".claude", "pipeline-state.json");
      writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
      const before = readFileSync(statePath);
      const started = invoke([
        "start", "--repo", root, "--session", `session-not-required-${name}`,
      ]);
      assert.deepEqual(started, {
        code: 0,
        output: {
          ok: true,
          code: "WT-SESSION-NOT-REQUIRED",
          bindingStatus,
        },
      });
      assert.deepEqual(readFileSync(statePath), before);
      assert.deepEqual(listActiveSessionDescriptors(root), []);
      assert.deepEqual(invoke(["plan-recovery", "--repo", root]).output, {
        schema: "pipeline.session-cleanup-recovery-plan.v1",
        status: "not-needed",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("a closed transition remains fail-closed when an unbound descriptor survives", () => {
  const root = fixture("closed-transition-orphan");
  try {
    const closedAt = "2026-07-29T08:00:00.000Z";
    writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
      schema: "pipeline.state.v0",
      planApproved: false,
      updatedAt: closedAt,
      closedFeatures: [{
        id: "closed-transition",
        planPath: "specs/closed/prd.md",
        phaseAtClose: "implementation",
        closedAt,
        closedBy: "PO",
        forCommit: null,
      }],
    }, null, 2)}\n`);
    startSessionDescriptor(root, { sessionId: "session-closed-transition-orphan" });
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "closed-unbound");
    const plan = invoke(["plan-recovery", "--repo", root]).output;
    assert.equal(plan.status, "orphan-recovery-unavailable");
    assert.equal(plan.activeDescriptorCount, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("start does not replace a provable post-close binding", () => {
  const fixtureState = legacyClosedCleanupFixture("closed-start-refusal");
  try {
    assert.throws(
      () => invoke(["start", "--repo", fixtureState.root]),
      (error) => error?.code === "WT-SESSION-RECOVERY-REQUIRED",
    );
    assert.deepEqual(listActiveSessionDescriptors(fixtureState.root), []);
    assert.equal(
      readOnboardingSessionCleanupBinding({ rootDir: fixtureState.root }).status,
      "closed-bound",
    );
  } finally {
    rmSync(fixtureState.root, { recursive: true, force: true });
  }
});

test("a closed transition retires exact legacy orphans and preserves its closed authority", () => {
  const root = fixture("closed-transition-legacy-retirement");
  try {
    const closedAt = "2026-07-29T08:00:00.000Z";
    writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
      schema: "pipeline.state.v0",
      planApproved: false,
      updatedAt: closedAt,
      closedFeatures: [{
        id: "closed-transition",
        planPath: "specs/closed/prd.md",
        phaseAtClose: "implementation",
        closedAt,
        closedBy: "PO",
        forCommit: null,
      }],
    }, null, 2)}\n`);
    const created = startSessionDescriptor(root, {
      sessionId: "session-closed-transition-legacy-orphan",
    });
    const legacy = rewriteAsLegacyDescriptor(root, created.sessionId);
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "closed-unbound");

    const plan = invoke(["plan-recovery", "--repo", root]).output;
    assert.equal(plan.status, "ready");
    assert.equal(plan.recovery, "retire-orphans");
    assert.equal(plan.expectedBindingStatus, "closed-unbound");
    assert.deepEqual(plan.orphanDescriptors, [{
      sessionId: legacy.sessionId,
      descriptorSha256: legacy.descriptorSha256,
      ownerStatus: "unobserved",
    }]);

    const applied = invoke([
      "apply-recovery", "--repo", root,
      "--plan-sha256", plan.planSha256,
      "--activate",
    ]).output;
    assert.equal(applied.status, "retired");
    assert.equal(applied.retiredDescriptorCount, 1);
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "closed-unbound");
    assert.deepEqual(listActiveSessionDescriptors(root), []);
    assert.deepEqual(invoke(["plan-recovery", "--repo", root]).output, {
      schema: "pipeline.session-cleanup-recovery-plan.v1",
      status: "not-needed",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an explicitly confirmed recovery retires only externally archived disposable worktrees", () => {
  const root = fixture("closed-transition-external-archive");
  try {
    gitRun(root, ["add", ".claude"]);
    gitRun(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "-m", "fixture: external archive recovery"]);
    const closedAt = "2026-07-30T08:00:00.000Z";
    writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
      schema: "pipeline.state.v0",
      planApproved: false,
      updatedAt: closedAt,
      closedFeatures: [{
        id: "closed-transition",
        planPath: "specs/closed/prd.md",
        phaseAtClose: "implementation",
        closedAt,
        closedBy: "PO",
        forCommit: null,
      }],
    }, null, 2)}\n`);
    const descriptor = startSessionDescriptor(root, {
      sessionId: "session-closed-transition-external-archive",
    });
    const record = createDetachedWorktree(root, "archive", gitRun(root, ["rev-parse", "HEAD"]), descriptor);
    gitRun(root, ["worktree", "remove", record.physicalPath]);
    const legacy = rewriteAsLegacyDescriptor(root, descriptor.sessionId);

    const plan = invoke(["plan-recovery", "--repo", root]).output;
    assert.equal(plan.status, "ready");
    assert.equal(plan.recovery, "retire-externally-archived-orphans");
    assert.deepEqual(plan.externalRetirements[0].resources, [{
      resourceId: `detached-archive-${gitRun(root, ["rev-parse", "HEAD"]).slice(0, 12)}`,
      type: "disposable-worktree",
      classification: "disposable-control",
    }]);
    const applied = invoke([
      "apply-recovery", "--repo", root,
      "--plan-sha256", plan.planSha256,
      "--activate",
    ]).output;
    assert.equal(applied.status, "retired");
    assert.equal(applied.externallyArchivedDescriptorCount, 1);
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "closed-unbound");
    assert.deepEqual(listActiveSessionDescriptors(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a mixed recovery binds external archival proof to only its matching descriptor", () => {
  const root = fixture("closed-transition-mixed-archive");
  try {
    gitRun(root, ["add", ".claude"]);
    gitRun(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "-m", "fixture: mixed archive recovery"]);
    const closedAt = "2026-07-30T08:00:00.000Z";
    writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
      schema: "pipeline.state.v0",
      planApproved: false,
      updatedAt: closedAt,
      closedFeatures: [{
        id: "closed-transition",
        planPath: "specs/closed/prd.md",
        phaseAtClose: "implementation",
        closedAt,
        closedBy: "PO",
        forCommit: null,
      }],
    }, null, 2)}\n`);
    const archived = startSessionDescriptor(root, {
      sessionId: "session-closed-transition-mixed-archive",
    });
    const record = createDetachedWorktree(root, "archive", gitRun(root, ["rev-parse", "HEAD"]), archived);
    gitRun(root, ["worktree", "remove", record.physicalPath]);
    const archivedLegacy = rewriteAsLegacyDescriptor(root, archived.sessionId);
    const capability = rewriteAsLegacyDescriptor(root, startSessionDescriptor(root, {
      sessionId: "capability-closed-transition-mixed-archive",
    }).sessionId);

    const plan = invoke(["plan-recovery", "--repo", root]).output;
    assert.equal(plan.status, "ready");
    assert.equal(plan.recovery, "retire-mixed-orphans");
    assert.deepEqual(plan.externalRetirements.map((entry) => entry.sessionId), [archivedLegacy.sessionId]);
    assert.deepEqual(plan.orphanDescriptors.map((entry) => entry.sessionId).sort(), [
      archivedLegacy.sessionId,
      capability.sessionId,
    ].sort());
    const applied = invoke([
      "apply-recovery", "--repo", root,
      "--plan-sha256", plan.planSha256,
      "--activate",
    ]).output;
    assert.equal(applied.status, "retired");
    assert.equal(applied.retiredDescriptorCount, 2);
    assert.equal(applied.externallyArchivedDescriptorCount, 1);
    assert.deepEqual(listActiveSessionDescriptors(root), []);
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
  const root = neutralFixture("orphan-rebind");
  const statePath = join(root, "project", "pipeline-state.json");
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
    const portable = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(portable.continuity.runtime.sessionCleanup, null);
    assert.equal(JSON.stringify(portable).includes(orphan.sessionId), false);
    assert.equal(JSON.stringify(portable).includes(orphan.descriptorSha256), false);
    assert.deepEqual(readOnboardingSessionCleanupBinding({ rootDir: root }).sessionCleanup, plan.sessionCleanup);
    assert.deepEqual(listActiveSessionDescriptors(root), [plan.sessionCleanup]);
    assert.equal(invoke(["start", "--repo", root]).output.code, "WT-SESSION-REUSED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("multiple empty legacy orphans require one exact activated Human retirement", () => {
  const root = fixture("legacy-orphan-retirement");
  try {
    const first = startSessionDescriptor(root, {
      sessionId: "session-binding-legacy-orphan-a",
    });
    const second = startSessionDescriptor(root, {
      sessionId: "session-binding-legacy-orphan-b",
    });
    const legacyFirst = rewriteAsLegacyDescriptor(root, first.sessionId);
    const legacySecond = rewriteAsLegacyDescriptor(root, second.sessionId);
    const plan = invoke(["plan-recovery", "--repo", root]).output;
    assert.equal(plan.status, "ready");
    assert.equal(plan.recovery, "retire-orphans");
    assert.equal(plan.closure, "unbound-orphans");
    assert.equal(plan.activeDescriptorCount, 2);
    assert.equal(plan.sessionCleanup, null);
    assert.deepEqual(plan.orphanDescriptors, [
      {
        sessionId: legacyFirst.sessionId,
        descriptorSha256: legacyFirst.descriptorSha256,
        ownerStatus: "unobserved",
      },
      {
        sessionId: legacySecond.sessionId,
        descriptorSha256: legacySecond.descriptorSha256,
        ownerStatus: "unobserved",
      },
    ]);
    assert.equal(plan.applyAction.requiresConfirmation, true);
    assert.deepEqual(plan.applyAction.expected.statuses, ["retired"]);
    assert.throws(
      () => invoke([
        "apply-recovery", "--repo", root,
        "--plan-sha256", plan.planSha256,
      ]),
      (error) => error?.code === "WT-SESSION-RECOVERY-ACTIVATION",
    );
    const applied = invoke([
      "apply-recovery", "--repo", root,
      "--plan-sha256", plan.planSha256,
      "--activate",
    ]).output;
    assert.equal(applied.status, "retired");
    assert.equal(applied.retiredDescriptorCount, 2);
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "unbound");
    assert.deepEqual(listActiveSessionDescriptors(root), []);
    assert.equal(invoke([
      "start", "--repo", root, "--session", "session-binding-after-retirement",
    ]).output.code, "WT-SESSION-STARTED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("multiple legacy orphans remain blocked when any cleanup manifest is active", () => {
  const root = fixture("legacy-orphan-active-manifest");
  try {
    const first = startSessionDescriptor(root, {
      sessionId: "session-binding-legacy-active-a",
    });
    const second = startSessionDescriptor(root, {
      sessionId: "session-binding-legacy-active-b",
    });
    registerTemporaryIntent(root, {
      sessionId: first.sessionId,
      ownerNonce: first.ownerNonce,
      resourceId: "legacy-active-resource",
      type: "scratch-file",
      path: join(root, "legacy-active-resource"),
      contentClass: "scratch",
      soleCopy: false,
      cleanupPolicy: "unlink-file",
    });
    rewriteAsLegacyDescriptor(root, first.sessionId);
    rewriteAsLegacyDescriptor(root, second.sessionId);
    assert.deepEqual(invoke(["plan-recovery", "--repo", root]).output, {
      schema: "pipeline.session-cleanup-recovery-plan.v1",
      status: "orphan-recovery-unavailable",
      activeDescriptorCount: 2,
    });
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

test("lost binding plus an exact retirable orphan set converges in one confirmed composite recovery", () => {
  const root = fixture("lost-binding-with-orphans");
  try {
    const bound = invoke(["start", "--repo", root, "--session", "session-binding-lost"]);
    const lost = loadSessionDescriptor(root, bound.output.sessionId, {
      expectedDescriptorSha256: bound.output.descriptorSha256,
    });
    unlinkSync(lost.path);
    const first = rewriteAsLegacyDescriptor(
      root,
      startSessionDescriptor(root, { sessionId: "session-orphan-a" }).sessionId,
    );
    const second = rewriteAsLegacyDescriptor(
      root,
      startSessionDescriptor(root, { sessionId: "session-orphan-b" }).sessionId,
    );
    const before = readOnboardingSessionCleanupBinding({ rootDir: root });
    const plan = invoke(["plan-recovery", "--repo", root]).output;
    assert.equal(plan.status, "ready");
    assert.equal(plan.recovery, "retire-orphans-release-lost-binding");
    assert.equal(plan.expectedBindingStatus, "bound");
    assert.match(plan.expectedPostStateSha256, /^[a-f0-9]{64}$/u);
    assert.deepEqual(plan.sessionCleanup, before.sessionCleanup);
    assert.equal(plan.writerIdentity.path.endsWith("/scripts/session-cleanup.mjs"), true);
    assert.match(plan.writerIdentity.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(plan.writerIdentity.plugin.name, "pipeline-core");
    assert.match(plan.writerIdentity.plugin.manifestSha256, /^[a-f0-9]{64}$/u);
    assert.deepEqual(plan.orphanDescriptors, [
      { sessionId: first.sessionId, descriptorSha256: first.descriptorSha256, ownerStatus: "unobserved" },
      { sessionId: second.sessionId, descriptorSha256: second.descriptorSha256, ownerStatus: "unobserved" },
    ]);
    const applied = invoke([
      "apply-recovery", "--repo", root,
      "--plan-sha256", plan.planSha256,
      "--activate",
    ]).output;
    assert.equal(applied.status, "recovered");
    assert.equal(applied.retiredDescriptorCount, 2);
    assert.equal(applied.revision, before.revision + 1);
    assert.deepEqual(listActiveSessionDescriptors(root), []);
    const after = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.equal(after.status, "unbound");
    assert.equal(after.sessionCleanup, null);
    assert.equal(after.revision, before.revision + 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("composite recovery remains fail-closed when one orphan cannot be retired", () => {
  const root = fixture("lost-binding-unsafe-orphan");
  try {
    const bound = invoke(["start", "--repo", root, "--session", "session-binding-lost-unsafe"]);
    unlinkSync(loadSessionDescriptor(root, bound.output.sessionId, {
      expectedDescriptorSha256: bound.output.descriptorSha256,
    }).path);
    const unsafe = startSessionDescriptor(root, { sessionId: "session-orphan-unsafe" });
    registerTemporaryIntent(root, {
      sessionId: unsafe.sessionId,
      ownerNonce: unsafe.ownerNonce,
      resourceId: "still-active",
      type: "scratch-file",
      path: join(root, "still-active"),
      contentClass: "scratch",
      soleCopy: false,
      cleanupPolicy: "unlink-file",
    });
    assert.deepEqual(invoke(["plan-recovery", "--repo", root]).output, {
      schema: "pipeline.session-cleanup-recovery-plan.v1",
      status: "orphan-recovery-unavailable",
      activeDescriptorCount: 1,
    });
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "bound");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("composite recovery resumes exactly after a crash between descriptor retirement and journal advance", () => {
  const root = fixture("composite-retirement-crash");
  try {
    const bound = invoke(["start", "--repo", root, "--session", "session-binding-crash-retire"]);
    unlinkSync(loadSessionDescriptor(root, bound.output.sessionId, {
      expectedDescriptorSha256: bound.output.descriptorSha256,
    }).path);
    rewriteAsLegacyDescriptor(
      root,
      startSessionDescriptor(root, { sessionId: "session-crash-orphan-a" }).sessionId,
    );
    rewriteAsLegacyDescriptor(
      root,
      startSessionDescriptor(root, { sessionId: "session-crash-orphan-b" }).sessionId,
    );
    const plan = invoke(["plan-recovery", "--repo", root]).output;
    let crashed = false;
    assert.throws(() => applySessionCleanupRecovery({
      rootDir: root,
      expectedPlanSha256: plan.planSha256,
      activate: true,
      deps: {
        compositeCrashFn(phase) {
          if (!crashed && phase === "after-retire-before-journal") {
            crashed = true;
            throw new Error("simulated crash after retirement");
          }
        },
      },
    }), /simulated crash after retirement/u);
    assert.equal(listActiveSessionDescriptors(root).length, 1);
    const resumed = applySessionCleanupRecovery({
      rootDir: root,
      expectedPlanSha256: plan.planSha256,
      activate: true,
    });
    assert.equal(resumed.status, "recovered");
    assert.equal(resumed.retiredDescriptorCount, 2);
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "unbound");
    const replay = applySessionCleanupRecovery({
      rootDir: root,
      expectedPlanSha256: plan.planSha256,
      activate: true,
    });
    assert.equal(replay.status, "recovered");
    assert.equal(replay.mutated, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("composite recovery recognizes an exact post-release crash without replaying State mutation", () => {
  const root = fixture("composite-release-crash");
  try {
    const bound = invoke(["start", "--repo", root, "--session", "session-binding-crash-release"]);
    unlinkSync(loadSessionDescriptor(root, bound.output.sessionId, {
      expectedDescriptorSha256: bound.output.descriptorSha256,
    }).path);
    rewriteAsLegacyDescriptor(
      root,
      startSessionDescriptor(root, { sessionId: "session-release-orphan" }).sessionId,
    );
    const before = readOnboardingSessionCleanupBinding({ rootDir: root });
    const plan = invoke(["plan-recovery", "--repo", root]).output;
    assert.throws(() => applySessionCleanupRecovery({
      rootDir: root,
      expectedPlanSha256: plan.planSha256,
      activate: true,
      deps: {
        compositeCrashFn(phase) {
          if (phase === "after-release-before-journal") {
            throw new Error("simulated crash after State release");
          }
        },
      },
    }), /simulated crash after State release/u);
    const postCrash = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.equal(postCrash.status, "unbound");
    assert.equal(postCrash.revision, before.revision + 1);
    const resumed = applySessionCleanupRecovery({
      rootDir: root,
      expectedPlanSha256: plan.planSha256,
      activate: true,
    });
    assert.equal(resumed.status, "recovered");
    assert.equal(resumed.revision, before.revision + 1);
    assert.deepEqual(listActiveSessionDescriptors(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("composite recovery rejects arbitrary same-shape State bytes after a post-release crash", () => {
  const root = fixture("composite-release-postimage-drift");
  try {
    const bound = invoke(["start", "--repo", root, "--session", "session-binding-postimage-drift"]);
    unlinkSync(loadSessionDescriptor(root, bound.output.sessionId, {
      expectedDescriptorSha256: bound.output.descriptorSha256,
    }).path);
    rewriteAsLegacyDescriptor(
      root,
      startSessionDescriptor(root, { sessionId: "session-postimage-drift-orphan" }).sessionId,
    );
    const plan = invoke(["plan-recovery", "--repo", root]).output;
    assert.throws(() => applySessionCleanupRecovery({
      rootDir: root,
      expectedPlanSha256: plan.planSha256,
      activate: true,
      deps: {
        compositeCrashFn(phase) {
          if (phase === "after-release-before-journal") {
            throw new Error("simulated crash after State release");
          }
        },
      },
    }), /simulated crash after State release/u);
    const statePath = join(root, ".claude", "pipeline-state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.updatedAt = "2026-07-29T11:00:00.000Z";
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
    assert.throws(
      () => applySessionCleanupRecovery({
        rootDir: root,
        expectedPlanSha256: plan.planSha256,
        activate: true,
      }),
      (error) => error instanceof SessionCleanupRecoveryError
        && error.code === "WT-SESSION-RECOVERY-READBACK",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a dead process composite lock is reclaimed and the journal resumes", () => {
  const root = fixture("composite-dead-lock");
  try {
    const bound = invoke(["start", "--repo", root, "--session", "session-binding-dead-lock"]);
    unlinkSync(loadSessionDescriptor(root, bound.output.sessionId, {
      expectedDescriptorSha256: bound.output.descriptorSha256,
    }).path);
    rewriteAsLegacyDescriptor(
      root,
      startSessionDescriptor(root, { sessionId: "session-dead-lock-orphan" }).sessionId,
    );
    const plan = invoke(["plan-recovery", "--repo", root]).output;
    const paths = sessionCleanupRecoveryInternals.recoveryJournalPaths(
      root,
      plan.planSha256,
      {},
    );
    const child = spawnSync(process.execPath, [
      "-e",
      [
        "const fs=require('node:fs');",
        `fs.writeFileSync(${JSON.stringify(paths.lock)},`,
        `JSON.stringify({schema:"pipeline.session-cleanup-composite-recovery-lock.v1",planSha256:${JSON.stringify(plan.planSha256)},pid:process.pid,processIdentity:null,nonce:"${"a".repeat(32)}"})+"\\n",`,
        "{mode:0o600,flag:'wx'});",
      ].join(""),
    ], { encoding: "utf8", shell: false });
    assert.equal(child.status, 0, child.stderr);
    const applied = applySessionCleanupRecovery({
      rootDir: root,
      expectedPlanSha256: plan.planSha256,
      activate: true,
    });
    assert.equal(applied.status, "recovered");
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "unbound");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("composite recovery rejects State and orphan-set drift before any planned retirement", () => {
  for (const drift of ["state", "orphan-set"]) {
    const root = fixture(`composite-${drift}-drift`);
    try {
      const bound = invoke(["start", "--repo", root, "--session", `session-binding-${drift}`]);
      unlinkSync(loadSessionDescriptor(root, bound.output.sessionId, {
        expectedDescriptorSha256: bound.output.descriptorSha256,
      }).path);
      rewriteAsLegacyDescriptor(
        root,
        startSessionDescriptor(root, { sessionId: `session-${drift}-orphan-a` }).sessionId,
      );
      const plan = invoke(["plan-recovery", "--repo", root]).output;
      if (drift === "state") {
        const statePath = join(root, ".claude", "pipeline-state.json");
        const state = JSON.parse(readFileSync(statePath, "utf8"));
        state.updatedAt = "2026-07-29T09:00:00.000Z";
        writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
      } else {
        rewriteAsLegacyDescriptor(
          root,
          startSessionDescriptor(root, { sessionId: "session-orphan-set-added" }).sessionId,
        );
      }
      const beforeDescriptors = listActiveSessionDescriptors(root);
      assert.throws(
        () => applySessionCleanupRecovery({
          rootDir: root,
          expectedPlanSha256: plan.planSha256,
          activate: true,
        }),
        (error) => /plan digest does not match|preimage changed/u.test(error.message),
      );
      assert.deepEqual(listActiveSessionDescriptors(root), beforeDescriptors);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("composite recovery private journal uses native-Windows DACL assurance fail-closed", () => {
  const root = mkdtempSync(join(tmpdir(), "session-cleanup-windows-assurance-"));
  try {
    const existing = join(root, "existing");
    mkdirSync(existing, { mode: 0o700 });
    assert.equal(sessionCleanupRecoveryInternals.securePrivateDirectory(existing, {
      platform: "win32",
      assessWindowsPrivatePathFn() { return { status: "secure" }; },
    }), undefined);
    assert.throws(
      () => sessionCleanupRecoveryInternals.securePrivateDirectory(existing, {
        platform: "win32",
        assessWindowsPrivatePathFn() { return { status: "insecure" }; },
      }),
      (error) => error instanceof SessionCleanupRecoveryError
        && error.code === "WT-SESSION-RECOVERY-JOURNAL",
    );
    const created = join(root, "created");
    sessionCleanupRecoveryInternals.securePrivateDirectory(created, {
      platform: "win32",
      hardenWindowsPrivateDirectoryFn() { return { status: "secure" }; },
    });
    const privateFile = join(root, "journal.json");
    writeFileSync(privateFile, "{}\n", { mode: 0o600 });
    assert.throws(
      () => sessionCleanupRecoveryInternals.safePrivateFile(privateFile, {
        platform: "win32",
        assessWindowsPrivatePathFn() { return { status: "unknown" }; },
      }),
      (error) => error instanceof SessionCleanupRecoveryError
        && error.code === "WT-SESSION-RECOVERY-JOURNAL",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
