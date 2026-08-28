// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  createPoGateProfileReceipt,
  derivePoGateRepositoryFingerprint,
  PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
  poGateProfileProjectionPaths,
  poGateProfileReceiptPath,
  serializePoGateProfileReceipt,
  validatePoGateAuthority,
  validatePoGateProfileForRepository,
} from "./po-gate-authority.mjs";
import { sha256CanonicalJson } from "./plan-spec-state-v2.mjs";
import { mkdtempTestScratch } from "./test-tmpdir.mjs";
import { ProjectOnboardingReadyError } from "./project-onboarding-ready-gate.mjs";
import { evaluateLifecycleReadyGuard } from "../hooks/guard-lifecycle-ready.mjs";

import {
  KICKOFF_FAULT_STAGES,
  KICKOFF_PROMOTION_PLAN_SCHEMA,
  KICKOFF_PROMOTION_APPLY_SCHEMA,
  INTAKE_CHECKPOINT_SCHEMA,
  INTAKE_CONSENT_APPLY_SCHEMA,
  INTAKE_CAPTURE_APPLY_SCHEMA,
  INTAKE_DESIGN_QUESTIONS_APPLY_SCHEMA,
  INTAKE_GENERATE_PLAN_SCHEMA,
  INTAKE_GENERATE_APPLY_SCHEMA,
  intakeDesignDirname,
  applyOnboardingBootstrapBind,
  planOnboardingBootstrapBind,
  applyOnboardingContinuityRepair,
  applyOnboardingIntakeCapture,
  applyOnboardingIntakeConsent,
  applyOnboardingIntakeDesignQuestions,
  applyOnboardingIntakeGenerate,
  planOnboardingIntakeGenerate,
  applyOnboardingKickoff,
  applyOnboardingKickoffPromotion,
  applyOnboardingKickoffPromotionCleanupRecovery,
  bindOnboardingSessionCleanup,
  classifyOnboardingContinuity,
  nextActionSection,
  planOnboardingContinuityRepair,
  planOnboardingKickoff,
  planOnboardingKickoffPromotion,
  planOnboardingKickoffPromotionCleanupRecovery,
  readOnboardingIntakeCheckpoint,
  readOnboardingIntakeMaterialInput,
  readOnboardingSessionCleanupBinding,
  reconstructOnboardingKickoffPlan,
  reconstructOnboardingKickoffPromotionPlan,
  releaseOnboardingSessionCleanup,
  replaceNextActionSection,
  resolveIntakeCheckpointPaths,
  syncStateMdNextAction,
  validateKickoffGoal,
} from "./onboarding-continuity.mjs";

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function fixture(name, { handover, neutral = false } = {}) {
  const root = mkdtempTestScratch(`onboarding continuity ${name} `);
  mkdirSync(join(root, ".claude"), { recursive: true });
  if (neutral) {
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "project", "pipeline.yaml"), "schema: pipeline.project.v1\n");
  }
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  const calibration = {
    project: "fixture",
    verify: "node verify.mjs",
    autonomy: "bounded",
    branchModel: "local",
    worktree: "supported",
    stakes: "high",
    constraints: [],
    ...(handover === undefined ? {} : { handover }),
  };
  writeFileSync(join(root, neutral ? "project" : ".claude", "pipeline.json"),
    `${JSON.stringify(calibration, null, 2)}\n`);
  return root;
}
function inventory(root) {
  const entries = [];
  const visit = (dir, relative = "") => {
    for (const name of readdirSync(dir).sort()) {
      const child = join(dir, name);
      const rel = relative ? `${relative}/${name}` : name;
      entries.push(Buffer.from(`${rel}\0`));
      if (lstatSync(child).isDirectory()) visit(child, rel);
    }
  };
  visit(root);
  return Buffer.concat(entries);
}

function targetBytes(root, plan) {
  const privateHistory = join(root, ".git", "agent-pipeline", "onboarding", "continuity-history.json");
  const paths = {
    state: join(root, plan.targets.state.path),
    handover: join(root, plan.targets.handover.path),
    prd: join(root, plan.targets.prd.path),
    spec: join(root, plan.targets.spec.path),
    history: privateHistory,
  };
  return {
    paths,
    bytes: Object.fromEntries(Object.entries(paths).map(([key, path]) => [
      key,
      existsSync(path) ? readFileSync(path) : null,
    ])),
  };
}

function expectKickoffError(code, fn) {
  assert.throws(fn, (error) => error?.code === code);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

check("pristine requires all three continuity sources to be absent", () => {
  const root = fixture("pristine");
  assert.deepEqual(classifyOnboardingContinuity({ rootDir: root }), {
    status: "absent-pristine",
    stateSha256: null,
    handoverSha256: null,
    historySha256: null,
  });
});

for (const [name, bytes] of [["empty", ""], ["manual", "# manually created\n"]]) {
  check(`${name} handover without machine state is damaged`, () => {
    const root = fixture(`handover-${name}`);
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "state.md"), bytes);
    const result = classifyOnboardingContinuity({ rootDir: root });
    assert.equal(result.status, "damaged");
    assert.equal(result.stateSha256, null);
    assert.match(result.handoverSha256, /^[a-f0-9]{64}$/u);
  });
}

check("custom configured handover is observed instead of docs/state.md", () => {
  const root = fixture("custom-handover", { handover: "notes/project state.md" });
  mkdirSync(join(root, "notes"), { recursive: true });
  writeFileSync(join(root, "docs-state-decoy.md"), "decoy\n");
  writeFileSync(join(root, "notes", "project state.md"), "configured\n");
  const result = classifyOnboardingContinuity({ rootDir: root });
  assert.equal(result.status, "damaged");
  assert.match(result.handoverSha256, /^[a-f0-9]{64}$/u);
});

// Regression for pipeline.onboarding-continuity-assumes-calibration-handover-is-always-a-plain-string:
// an ADR-0066 Decision 5 `{ path, maxBytes }` object-shaped `handover` key
// must resolve via its `.path`, the same dual-shape `handover-rotation.mjs`'s
// `resolveHandoverConfig()` already supports, not throw KICKOFF-PATH-UNSAFE
// (observed live as a session-stranding `continuity-observation-unavailable`
// readiness class) when handed straight to `safeRelativePath()`.
check("object-shaped configured handover ({ path, maxBytes }) is observed instead of failing unavailable", () => {
  const root = fixture("object-handover", { handover: { path: "notes/project state.md", maxBytes: 30000 } });
  mkdirSync(join(root, "notes"), { recursive: true });
  writeFileSync(join(root, "notes", "project state.md"), "configured\n");
  const result = classifyOnboardingContinuity({ rootDir: root });
  assert.equal(result.status, "damaged");
  assert.match(result.handoverSha256, /^[a-f0-9]{64}$/u);
});

check("object-shaped configured handover without a usable .path still fails unavailable", () => {
  const root = fixture("object-handover-no-path", { handover: { maxBytes: 30000 } });
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "unavailable");
});

check("present inactive state is damaged rather than pristine", () => {
  const root = fixture("inactive-state");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), '{"schema":"pipeline.state.v0"}\n');
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "damaged");
});

check("writer-shaped closed state is a valid feature re-entry boundary", () => {
  const root = fixture("closed-feature-transition");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
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
  }, null, 2)}\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "valid");
  assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "closed-unbound");
});

check("writer-shaped unapproved design state remains valid before continuity initialization", () => {
  const root = fixture("design-feature-transition");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: {
      id: "next-feature",
      planPath: "specs/next/prd.md",
      phase: "design",
    },
    planApproved: false,
    updatedAt: "2026-07-29T08:01:00.000Z",
  }, null, 2)}\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "valid");
  assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "design-unbound");
});

check("inactive and design transition lookalikes remain damaged", () => {
  const root = fixture("transition-lookalikes");
  const closed = {
    schema: "pipeline.state.v0",
    planApproved: false,
    updatedAt: "2026-07-29T08:00:00.000Z",
    closedFeatures: [{
      id: "previous-feature",
      planPath: "specs/previous/prd.md",
      phaseAtClose: "implementation",
      closedAt: "2026-07-29T07:59:59.000Z",
      closedBy: "PO",
      forCommit: null,
    }],
  };
  writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify(closed)}\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "damaged");
  closed.closedFeatures[0].closedAt = closed.updatedAt;
  closed.planApproval = {};
  writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify(closed)}\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "damaged");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "next-feature", planPath: "specs/next/prd.md", phase: "implementation" },
    planApproved: false,
    updatedAt: "2026-07-29T08:01:00.000Z",
  })}\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "damaged");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "next-feature", planPath: "../outside.md", phase: "design" },
    planApproved: false,
    updatedAt: "2026-07-29T08:01:00.000Z",
  })}\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "damaged");
});

check("writer-shaped discard state is a valid feature re-entry boundary", () => {
  const root = fixture("discard-feature-transition");
  const kickoff = planOnboardingKickoff({ rootDir: root, goal: "Discard after a real kickoff" });
  applyOnboardingKickoff({ plan: kickoff, expectedPlanSha256: kickoff.planSha256, activate: true });
  const statePath = join(root, ".claude", "pipeline-state.json");
  const before = JSON.parse(readFileSync(statePath, "utf8"));
  const discardedAt = "2026-07-29T09:00:00.000Z";
  writeFileSync(statePath, `${JSON.stringify({
    schema: "pipeline.state.v0",
    discardedFeatures: [{
      id: before.activeFeature.id,
      planPath: before.activeFeature.planPath,
      phaseAtDiscard: before.activeFeature.phase,
      discardedAt,
      discardedBy: "PO",
      reason: "abandoned before implementation",
      forCommit: null,
    }],
    planApproved: false,
    updatedAt: discardedAt,
  }, null, 2)}\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "valid");
});

check("writer-shaped discard state with a prior closed feature remains valid", () => {
  const root = fixture("discard-after-closed-transition");
  const kickoff = planOnboardingKickoff({ rootDir: root, goal: "Discard after an earlier close" });
  applyOnboardingKickoff({ plan: kickoff, expectedPlanSha256: kickoff.planSha256, activate: true });
  const statePath = join(root, ".claude", "pipeline-state.json");
  const before = JSON.parse(readFileSync(statePath, "utf8"));
  const discardedAt = "2026-07-29T09:05:00.000Z";
  writeFileSync(statePath, `${JSON.stringify({
    schema: "pipeline.state.v0",
    closedFeatures: [{
      id: "earlier-feature",
      planPath: "specs/earlier/prd.md",
      phaseAtClose: "implementation",
      closedAt: "2026-07-29T08:00:00.000Z",
      closedBy: "PO",
      forCommit: null,
    }],
    discardedFeatures: [{
      id: before.activeFeature.id,
      planPath: before.activeFeature.planPath,
      phaseAtDiscard: before.activeFeature.phase,
      discardedAt,
      discardedBy: "PO",
      reason: "abandoned after a prior close",
      forCommit: null,
    }],
    planApproved: false,
    updatedAt: discardedAt,
  }, null, 2)}\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "valid");
});

// The projection above accepted a discard as the latest transaction from the
// start; the cleanup OBSERVER did not, and that asymmetry was a dead end. A
// consumer project hit it live 2026-08-28 (incident report S56, B6): a
// discard-feature left readiness at `partial`, every pipeline script on that
// repository was refused, and the refusal named a recovery command that was
// itself refused. Both shapes are asserted here -- with a prior close (the
// state the consumer actually had) and without one (where `closedFeatures` is
// absent entirely and the release-proof scan has nothing to iterate).
check("a discard as the latest transaction is observable by the cleanup reader, not only by the projection", () => {
  for (const [name, closedFeatures] of [["discard-cleanup-after-close", [{
    id: "earlier-feature",
    planPath: "specs/earlier/prd.md",
    phaseAtClose: "implementation",
    closedAt: "2026-07-29T08:00:00.000Z",
    closedBy: "PO",
    forCommit: null,
  }]], ["discard-cleanup-only", undefined]]) {
    const root = fixture(name);
    const kickoff = planOnboardingKickoff({ rootDir: root, goal: "Discard is a normal outcome" });
    applyOnboardingKickoff({ plan: kickoff, expectedPlanSha256: kickoff.planSha256, activate: true });
    const statePath = join(root, ".claude", "pipeline-state.json");
    const before = JSON.parse(readFileSync(statePath, "utf8"));
    const discardedAt = "2026-07-29T09:10:00.000Z";
    const state = {
      schema: "pipeline.state.v0",
      discardedFeatures: [{
        id: before.activeFeature.id,
        planPath: before.activeFeature.planPath,
        phaseAtDiscard: before.activeFeature.phase,
        discardedAt,
        discardedBy: "PO",
        reason: "abandoned before implementation",
        forCommit: null,
      }],
      planApproved: false,
      updatedAt: discardedAt,
    };
    if (closedFeatures !== undefined) state.closedFeatures = closedFeatures;
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

    assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "valid",
      `${name}: the projection already accepted this shape and must keep doing so`);
    const binding = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.notEqual(binding.status, "damaged",
      `${name}: a discard must never make the repository unobservable -- that is the dead end`);
    assert.equal(binding.sessionCleanup, null,
      `${name}: nothing is bound after a discard, which is not the same as unreadable`);
  }
});

function baseDiscardEntry() {
  return {
    id: "abandoned-feature",
    planPath: "specs/abandoned/prd.md",
    phaseAtDiscard: "implementation",
    discardedAt: "2026-07-29T09:00:00.000Z",
    discardedBy: "PO",
    reason: "superseded",
    forCommit: null,
  };
}

check("discard transition with a stale updatedAt remains damaged", () => {
  const root = fixture("discard-stale-updated-at");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
    schema: "pipeline.state.v0",
    planApproved: false,
    updatedAt: "2026-07-29T09:00:01.000Z",
    discardedFeatures: [baseDiscardEntry()],
  }, null, 2)}\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "damaged");
});

check("discard entry with an extra key remains damaged", () => {
  const root = fixture("discard-extra-key");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
    schema: "pipeline.state.v0",
    planApproved: false,
    updatedAt: "2026-07-29T09:00:00.000Z",
    discardedFeatures: [{ ...baseDiscardEntry(), unexpected: true }],
  }, null, 2)}\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "damaged");
});

check("discard entry missing a required key remains damaged", () => {
  const root = fixture("discard-missing-key");
  const entry = baseDiscardEntry();
  delete entry.reason;
  writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
    schema: "pipeline.state.v0",
    planApproved: false,
    updatedAt: "2026-07-29T09:00:00.000Z",
    discardedFeatures: [entry],
  }, null, 2)}\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "damaged");
});

check("discard transition with planApproved true remains damaged", () => {
  const root = fixture("discard-plan-approved");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
    schema: "pipeline.state.v0",
    planApproved: true,
    updatedAt: "2026-07-29T09:00:00.000Z",
    discardedFeatures: [baseDiscardEntry()],
  }, null, 2)}\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "damaged");
});

check("discard transition with continuity still present remains damaged", () => {
  const root = fixture("discard-continuity-present");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
    schema: "pipeline.state.v0",
    planApproved: false,
    updatedAt: "2026-07-29T09:00:00.000Z",
    continuity: {},
    discardedFeatures: [baseDiscardEntry()],
  }, null, 2)}\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "damaged");
});

check("discard transition with an empty discardedFeatures array remains damaged", () => {
  const root = fixture("discard-empty-array");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
    schema: "pipeline.state.v0",
    planApproved: false,
    updatedAt: "2026-07-29T09:00:00.000Z",
    discardedFeatures: [],
  }, null, 2)}\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "damaged");
});

check("discard entry whose planPath escapes the project root remains damaged", () => {
  const root = fixture("discard-path-escape");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
    schema: "pipeline.state.v0",
    planApproved: false,
    updatedAt: "2026-07-29T09:00:00.000Z",
    discardedFeatures: [{ ...baseDiscardEntry(), planPath: "../outside.md" }],
  }, null, 2)}\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "damaged");
});

check("orphan continuity and invalid active feature are damaged", () => {
  const root = fixture("orphan-state");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0",
    continuity: {},
  }));
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "damaged");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "", planPath: "docs/state.md", phase: "design" },
  }));
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "damaged");
});

check("malformed state is unavailable and retains no invented digest", () => {
  const root = fixture("malformed-state");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), "{broken");
  const result = classifyOnboardingContinuity({ rootDir: root });
  assert.equal(result.status, "unavailable");
  assert.match(result.stateSha256, /^[a-f0-9]{64}$/u);
});

check("mode-unreadable state is unavailable", () => {
  const root = fixture("state-unreadable");
  const path = join(root, ".claude", "pipeline-state.json");
  writeFileSync(path, '{"schema":"pipeline.state.v0"}\n');
  chmodSync(path, 0o000);
  try {
    assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "unavailable");
  } finally {
    chmodSync(path, 0o600);
  }
});

check("machine-state symlink is unavailable", () => {
  const root = fixture("state-symlink");
  writeFileSync(join(root, "state-target.json"), '{"schema":"pipeline.state.v0"}\n');
  symlinkSync(join(root, "state-target.json"), join(root, ".claude", "pipeline-state.json"));
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "unavailable");
});

check("project-root symlink is unavailable", () => {
  const actual = fixture("root-symlink-actual");
  const parent = mkdtempTestScratch("onboarding continuity root link ");
  const linked = join(parent, "linked root");
  symlinkSync(actual, linked);
  assert.equal(classifyOnboardingContinuity({ rootDir: linked }).status, "unavailable");
});

check("private history without machine state is damaged", () => {
  const root = fixture("history-only");
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Create a product" });
  const directory = join(root, ".git", "agent-pipeline", "onboarding");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  writeFileSync(join(directory, "continuity-history.json"),
    JSON.stringify(plan.targets.history.value), { mode: 0o600 });
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "damaged");
});

check("malformed private history is unavailable with its observed digest", () => {
  const root = fixture("history-malformed");
  const directory = join(root, ".git", "agent-pipeline", "onboarding");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  writeFileSync(join(directory, "continuity-history.json"), "{}\n", { mode: 0o600 });
  const result = classifyOnboardingContinuity({ rootDir: root });
  assert.equal(result.status, "unavailable");
  assert.match(result.historySha256, /^[a-f0-9]{64}$/u);
});

check("non-private history mode is unavailable", () => {
  const root = fixture("history-mode");
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Create a product" });
  const directory = join(root, ".git", "agent-pipeline", "onboarding");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const path = join(directory, "continuity-history.json");
  writeFileSync(path, JSON.stringify(plan.targets.history.value), { mode: 0o644 });
  chmodSync(path, 0o644);
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "unavailable");
});

// Windows: Node synthesizes `.mode` on native Windows from the read-only
// attribute alone, so a bare POSIX mode-bit comparison is meaningless there
// and previously failed closed unconditionally (backlog/items/2026-08-18-
// windows-posix-mode-bit-checks-are-meaningless-on-ntfs.md). These checks
// inject `platform: "win32"` plus a stubbed DACL assessor to prove the win32
// branch is what now decides the outcome, not the bare mode bits.
//
// Note on the directory half of this check: `resolvePrivate()` (this file)
// delegates to `codex-onboarding-runtime.mjs`'s own already-correct
// `assurePrivateDirectory`, which on POSIX auto-repairs (`chmodSync(path,
// 0o700)`) an insecure directory it observes -- so a POSIX-insecure directory
// mode can never actually reach this file's own inline check on a real POSIX
// host in the first place; that check is a redundant belt-and-braces
// duplicate for the directory case specifically. The history FILE has no such
// auto-repair anywhere upstream, so its insecure-mode POSIX regression is
// exercised directly above ("non-private history mode is unavailable").
check("win32: a POSIX-insecure history file is admitted via the injected DACL assurance instead of failing closed", () => {
  const root = fixture("win32-directory-secure");
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Create a product" });
  const directory = join(root, ".git", "agent-pipeline", "onboarding");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Exactly what the old bare `(mode & 0o777) !== 0o600` comparison would
  // have failed closed on unconditionally.
  writeFileSync(join(directory, "continuity-history.json"), JSON.stringify(plan.targets.history.value), { mode: 0o644 });
  const result = classifyOnboardingContinuity({
    rootDir: root,
    platform: "win32",
    assessWindowsPrivate: () => ({ status: "secure" }),
  });
  assert.notEqual(result.status, "unavailable");
  assert.equal(result.status, "damaged"); // no machine state yet, mirrors "private history without machine state is damaged"
});

check("win32: an insecure DACL assessment on the private directory still fails closed", () => {
  const root = fixture("win32-directory-insecure");
  const directory = join(root, ".git", "agent-pipeline", "onboarding");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const result = classifyOnboardingContinuity({
    rootDir: root,
    platform: "win32",
    assessWindowsPrivate: () => ({ status: "insecure" }),
  });
  assert.equal(result.status, "unavailable");
});

check("win32: a secure directory but an insecure history-file DACL assessment still fails closed", () => {
  const root = fixture("win32-history-insecure");
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Create a product" });
  const directory = join(root, ".git", "agent-pipeline", "onboarding");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(join(directory, "continuity-history.json"), JSON.stringify(plan.targets.history.value), { mode: 0o600 });
  const result = classifyOnboardingContinuity({
    rootDir: root,
    platform: "win32",
    assessWindowsPrivate: (path) => ({ status: path === directory ? "secure" : "insecure" }),
  });
  assert.equal(result.status, "unavailable");
});

for (const [name, handover] of [
  ["escape", "../outside.md"],
  ["absolute", "/tmp/outside.md"],
  ["backslash", "docs\\state.md"],
]) {
  check(`unsafe ${name} handover path is unavailable`, () => {
    const root = fixture(`unsafe-${name}`, { handover });
    assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "unavailable");
  });
}

check("handover symlink is unavailable", () => {
  const root = fixture("handover-symlink");
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "target.md"), "target\n");
  symlinkSync(join(root, "target.md"), join(root, "docs", "state.md"));
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "unavailable");
});

check("mode-unreadable handover is unavailable even for privileged test runners", () => {
  const root = fixture("handover-unreadable");
  mkdirSync(join(root, "docs"), { recursive: true });
  const path = join(root, "docs", "state.md");
  writeFileSync(path, "private\n");
  chmodSync(path, 0o000);
  try {
    assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "unavailable");
  } finally {
    chmodSync(path, 0o600);
  }
});

check("goal validation trims UTF-8 and preserves shell metacharacters as data", () => {
  assert.equal(validateKickoffGoal("  build $(touch nope); `echo nope` & keep spaces  "),
    "build $(touch nope); `echo nope` & keep spaces");
  assert.equal(validateKickoffGoal("ä".repeat(80)).length, 80);
});

for (const [name, goal] of [
  ["blank", " \n\t "],
  ["NUL", "valid\0invalid"],
  ["multiple lines", "short goal\nfull design"],
  ["over 160 bytes", "x".repeat(161)],
  ["UTF-8 over 160 bytes", "ä".repeat(81)],
]) {
  check(`goal rejects ${name}`, () => {
    expectKickoffError("KICKOFF-GOAL-INVALID", () => validateKickoffGoal(goal));
  });
}

check("160-byte goal is accepted exactly", () => {
  assert.equal(Buffer.byteLength(validateKickoffGoal("x".repeat(160)), "utf8"), 160);
});

check("kickoff plan is deterministic, closed, valid, and read-only", () => {
  const root = fixture("plan-read-only", { handover: "notes/state with spaces.md" });
  const before = [...inventory(root)];
  const first = planOnboardingKickoff({
    rootDir: root,
    goal: "Ship safe onboarding; never run $(touch nope)",
    onboardingScript: "/plugin/project-onboarding-v3.mjs",
  });
  const second = planOnboardingKickoff({
    rootDir: root,
    goal: "  Ship safe onboarding; never run $(touch nope)  ",
    onboardingScript: "/plugin/project-onboarding-v3.mjs",
  });
  const after = [...inventory(root)];
  assert.deepEqual(first, second);
  assert.deepEqual(after, before);
  assert.equal(existsSync(join(root, "nope")), false);
  assert.deepEqual(Object.keys(first).sort(), [
    "applyAction", "calibration", "goal", "goalSha256", "language", "nextAction", "onboardingScript",
    "planSha256", "repositoryCapability", "root", "runner", "schema", "targets",
    "transactionSha256",
  ]);
  assert.equal(first.runner, "codex");
  assert.equal(first.language, "en");
  assert.deepEqual(first.applyAction.argv, [
    "/plugin/project-onboarding-v3.mjs", "kickoff", "apply", "--root", root,
    "--goal", first.goal, "--language", "en", "--runner", "codex", "--plan-sha256", first.planSha256, "--activate",
  ]);
  assert.equal(first.applyAction.mutation, true);
  assert.equal(first.applyAction.requiresConfirmation, true);
  // NVA-H-LASTBUILDERS: the generic guided driver reads ONLY `nextAction`,
  // never `applyAction` -- same sibling convention as the promotion plans
  // (NVA-F-PROMOTIONACTION) and the intake-generate plan (NVA-D-PLANACTION).
  assert.deepEqual(first.nextAction, first.applyAction);
  assert.deepEqual(first.applyAction.expected, {
    schema: "pipeline.project-onboarding.v4",
    statuses: ["ready"],
  });
  assert.equal(first.targets.state.value.schema, "pipeline.state.v0");
  assert.equal(first.targets.state.value.continuity.schema, "pipeline.continuity.v0");
  assert.notEqual(first.targets.state.value.continuity.authority.prd.path,
    first.targets.handover.path);
  assert.notEqual(first.targets.state.value.continuity.authority.spec.path,
    first.targets.handover.path);
  assert.equal(first.targets.state.value.continuity.authority.prd.path,
    first.targets.prd.path);
  assert.equal(first.targets.state.value.continuity.authority.spec.path,
    first.targets.spec.path);
  assert.notEqual(first.targets.prd.path, first.targets.spec.path);
  assert.match(first.targets.prd.content, /^<!-- po-language: en -->$/mu);
});

check("kickoff resolves the PO language from a neutral runtime manifest", () => {
  const root = fixture("neutral-language", { neutral: true });
  writeFileSync(join(root, "pipeline.user.yaml"), "language:\n  human_facing: de\n");
  writeFileSync(join(root, "project", "pipeline.yaml"), "language:\n  human_facing: de\n");
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Ein neutrales Projekt starten" });
  assert.match(plan.targets.prd.content, /^<!-- po-language: de -->$/mu);
});

check("apply requires activation and the exact plan digest", () => {
  const root = fixture("apply-auth");
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Create a product" });
  expectKickoffError("KICKOFF-ACTIVATION-REQUIRED", () => applyOnboardingKickoff({
    plan,
    expectedPlanSha256: plan.planSha256,
    activate: false,
  }));
  expectKickoffError("KICKOFF-PLAN-DIGEST", () => applyOnboardingKickoff({
    plan,
    expectedPlanSha256: "f".repeat(64),
    activate: true,
  }));
  assert.deepEqual(classifyOnboardingContinuity({ rootDir: root }).status, "absent-pristine");
});

check("apply is calibration-CAS bound and writes nothing after drift", () => {
  const root = fixture("plan-drift");
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Create a product" });
  const calibrationPath = join(root, ".claude", "pipeline.json");
  writeFileSync(calibrationPath, `${readFileSync(calibrationPath, "utf8")}\n`);
  expectKickoffError("KICKOFF-CAS-DRIFT", () => applyOnboardingKickoff({
    plan,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  }));
  assert.equal(existsSync(join(root, ".claude", "pipeline-state.json")), false);
  assert.equal(existsSync(join(root, "docs", "state.md")), false);
});

check("apply rejects apply-metadata drift even when the top-level digest field is unchanged", () => {
  const root = fixture("action-drift");
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Create a product" });
  const tampered = structuredClone(plan);
  tampered.applyAction.argv[0] = "/tmp/foreign-onboarding.mjs";
  expectKickoffError("KICKOFF-PLAN-INVALID", () => applyOnboardingKickoff({
    plan: tampered,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  }));
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "absent-pristine");
});

// NVA-H-LASTBUILDERS: the goal-bound kickoff plan is the first of the last
// two `planSha256 = canonicalSha256(...)` sites in this module to gain a
// `nextAction` sibling -- same convention already covered above (the
// "kickoff plan is deterministic..." check's key-list and nextAction
// assertions) and by NVA-F-PROMOTIONACTION for the promotion plans.
check("apply rejects a plan whose nextAction disagrees with its own re-derived apply action, exactly as a mismatched applyAction is refused (NVA-H-LASTBUILDERS)", () => {
  const root = fixture("kickoff-nextaction-drift");
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Create a product" });
  const tampered = structuredClone(plan);
  tampered.nextAction.argv.push("--bogus");
  expectKickoffError("KICKOFF-PLAN-INVALID", () => applyOnboardingKickoff({
    plan: tampered,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  }));
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "absent-pristine");
});

check("reconstructOnboardingKickoffPlan (replay): the reconstructed goal-bound plan also publishes nextAction identical to applyAction (NVA-H-LASTBUILDERS)", () => {
  const root = fixture("kickoff-nextaction-replay");
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Create a product" });
  applyOnboardingKickoff({ plan, expectedPlanSha256: plan.planSha256, activate: true });
  const replayed = reconstructOnboardingKickoffPlan({ rootDir: root, goal: "Create a product" });
  assert.deepEqual(replayed.nextAction, replayed.applyAction);
  assert.deepEqual(replayed, plan);
});

check("planOnboardingKickoff: planSha256 is bound to the transaction alone -- publishing nextAction changes no plan digest (NVA-H-LASTBUILDERS)", () => {
  const root = fixture("kickoff-nextaction-digest-stability");
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Create a product" });
  // Same key set `planBinding()` (onboarding-continuity.mjs, private) projects
  // out of the plan -- deliberately neither `planSha256` nor
  // `applyAction`/`nextAction`. Recomputing the digest from exactly this
  // projection proves planSha256 does not depend on nextAction's presence or value.
  const binding = {
    schema: plan.schema, root: plan.root, repositoryCapability: plan.repositoryCapability,
    goal: plan.goal, goalSha256: plan.goalSha256, language: plan.language, calibration: plan.calibration,
    targets: plan.targets, transactionSha256: plan.transactionSha256, onboardingScript: plan.onboardingScript,
    runner: plan.runner,
  };
  assert.equal(sha256CanonicalJson(binding), plan.planSha256,
    "planSha256 must be derivable from the transaction-bound fields alone -- applyAction and nextAction are excluded from the digest");
});

// NVA-H-LASTBUILDERS: the kickoff-promotion cleanup recovery plan is the
// second and last of the seven `planSha256 = canonicalSha256(...)` sites to
// gain a `nextAction` sibling. Unlike the kickoff and promotion plans above,
// `applyOnboardingKickoffPromotionCleanupRecovery` never accepts a
// caller-supplied plan object -- it takes only `rootDir` and
// `expectedPlanSha256` and always re-derives its own plan internally, the
// same "self-re-deriving apply" shape `applyOnboardingIntakeGenerate`
// already has (NVA-D-PLANACTION). There is therefore no dedicated
// exact-key-set validator for this plan's shape to extend, and no
// caller-supplied `nextAction` for a mismatch-refusal test to exercise --
// both are architecturally absent for this builder exactly as they already
// are for the intake-generate builder. The non-ready branches keep their own
// coverage above (extended "legacy promotion cleanup mismatch ... fails
// closed" loop) and below ("not-applicable").
check("planOnboardingKickoffPromotionCleanupRecovery: a ready recovery plan publishes nextAction identical to applyAction, carrying the plan's own digest (NVA-H-LASTBUILDERS)", () => {
  const seed = promotionSeed("lastbuilders-recovery-fresh", { privatized: true, bumpRevision: false });
  const promotion = planOnboardingKickoffPromotion(seed.request);
  applyOnboardingKickoffPromotion({ plan: promotion, expectedPlanSha256: promotion.planSha256, activate: true });
  const plan = planOnboardingKickoffPromotionCleanupRecovery({ rootDir: seed.root });
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.nextAction, plan.applyAction);
  assert.equal(plan.nextAction.kind, "command");
  assert.equal(plan.nextAction.executable, "node");
  const flagIndex = plan.nextAction.argv.indexOf("--plan-sha256");
  assert.ok(flagIndex >= 0, "nextAction argv must carry --plan-sha256");
  assert.equal(plan.nextAction.argv[flagIndex + 1], plan.planSha256);
  // Same key set `kickoffPromotionCleanupRecoveryPlanCore` (private) returns
  // as `core` -- deliberately neither `planSha256` nor `applyAction`/`nextAction`/`status`.
  const core = {
    schema: plan.schema, root: plan.root, stateSha256: plan.stateSha256, historySha256: plan.historySha256,
    revision: plan.revision, feature: plan.feature, binding: plan.binding, sessionCleanupScript: plan.sessionCleanupScript,
  };
  assert.equal(sha256CanonicalJson(core), plan.planSha256,
    "planSha256 must be derivable from the core fields alone -- applyAction and nextAction are excluded from the digest");
});

check("planOnboardingKickoffPromotionCleanupRecovery: a not-applicable result carries neither applyAction nor nextAction nor planSha256 (NVA-H-LASTBUILDERS)", () => {
  const root = fixture("lastbuilders-recovery-not-applicable");
  const result = planOnboardingKickoffPromotionCleanupRecovery({ rootDir: root });
  assert.equal(result.status, "not-applicable");
  assert.equal("applyAction" in result, false);
  assert.equal("nextAction" in result, false);
  assert.equal("planSha256" in result, false);
});

check("pre-existing initial authority artifact blocks plan without overwriting it", () => {
  const root = fixture("authority-collision");
  const baseline = planOnboardingKickoff({ rootDir: root, goal: "Create a product" });
  const path = join(root, baseline.targets.prd.path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "user content\n");
  expectKickoffError("KICKOFF-NOT-PRISTINE", () => planOnboardingKickoff({
    rootDir: root,
    goal: "Create a product",
  }));
  assert.equal(readFileSync(path, "utf8"), "user content\n");
});

check("apply creates exact state, configured handover, private history, and immediate valid readback", () => {
  const root = fixture("apply-valid", { handover: "notes/project state.md" });
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Create a safe product" });
  const result = applyOnboardingKickoff({
    plan,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  });
  assert.equal(result.status, "applied");
  assert.equal(result.mutated, true);
  assert.equal(result.readback.code, "CS-STATUS-ACTIVE");
  assert.equal(result.readback.continuity.status, "valid");
  assert.equal(result.continuity.status, "valid");
  assert.equal(lstatSync(join(root, ".git", "agent-pipeline", "onboarding", "continuity-history.json")).mode & 0o777, 0o600);
  assert.deepEqual(readFileSync(join(root, ".claude", "pipeline-state.json")),
    Buffer.from(`${JSON.stringify(plan.targets.state.value, null, 2)}\n`, "utf8"));
  assert.deepEqual(readFileSync(join(root, "notes", "project state.md")),
    Buffer.from(plan.targets.handover.content, "utf8"));
  assert.deepEqual(readFileSync(join(root, plan.targets.prd.path)),
    Buffer.from(plan.targets.prd.content, "utf8"));
  assert.deepEqual(readFileSync(join(root, plan.targets.spec.path)),
    Buffer.from(plan.targets.spec.content, "utf8"));
});

check("cleanup descriptor bind and release use exact state CAS without touching other fields", () => {
  const root = fixture("cleanup-binding");
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Bind cleanup safely" });
  applyOnboardingKickoff({
    plan,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  });
  const statePath = join(root, ".claude", "pipeline-state.json");
  const beforeState = JSON.parse(readFileSync(statePath, "utf8"));
  const before = readOnboardingSessionCleanupBinding({ rootDir: root });
  assert.equal(before.status, "unbound");
  const tuple = {
    sessionId: "session-cleanup-bind-01",
    descriptorSha256: "a".repeat(64),
  };
  const bound = bindOnboardingSessionCleanup({
    rootDir: root,
    expectedStateSha256: before.stateSha256,
    expectedRevision: before.revision,
    sessionCleanup: tuple,
    deps: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
  });
  assert.equal(bound.status, "bound");
  assert.equal(bound.mutated, true);
  assert.equal(bound.revision, before.revision + 1);
  assert.deepEqual(bound.sessionCleanup, tuple);
  const boundState = JSON.parse(readFileSync(statePath, "utf8"));
  assert.deepEqual(
    { ...boundState, continuity: undefined },
    { ...beforeState, continuity: undefined },
  );

  const replay = bindOnboardingSessionCleanup({
    rootDir: root,
    expectedStateSha256: before.stateSha256,
    expectedRevision: before.revision,
    sessionCleanup: tuple,
  });
  assert.equal(replay.status, "reused");
  assert.equal(replay.mutated, false);
  expectKickoffError("SESSION-CLEANUP-BIND-CAS", () => bindOnboardingSessionCleanup({
    rootDir: root,
    expectedStateSha256: before.stateSha256,
    expectedRevision: before.revision,
    sessionCleanup: {
      sessionId: "session-cleanup-other-02",
      descriptorSha256: "b".repeat(64),
    },
  }));

  const released = releaseOnboardingSessionCleanup({
    rootDir: root,
    expectedStateSha256: bound.stateSha256,
    expectedRevision: bound.revision,
    sessionCleanup: tuple,
    deps: { randomUUID: () => "22222222-2222-4222-8222-222222222222" },
  });
  assert.equal(released.status, "released");
  assert.equal(released.mutated, true);
  assert.equal(released.revision, bound.revision + 1);
  assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "unbound");
});

check("bounded repair normalizes only the invalid active-turn resume pair", () => {
  const root = fixture("repair-active-resume");
  const kickoff = planOnboardingKickoff({ rootDir: root, goal: "Repair active resume" });
  applyOnboardingKickoff({
    plan: kickoff,
    expectedPlanSha256: kickoff.planSha256,
    activate: true,
  });
  const statePath = join(root, ".claude", "pipeline-state.json");
  const historyPath = join(root, ".git", "agent-pipeline", "onboarding", "continuity-history.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.continuity.resume = {
    mode: "resume-on-next-turn",
    sourceRevision: 0,
    reasonCode: "active-turn",
  };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const historyBefore = readFileSync(historyPath);

  const plan = planOnboardingContinuityRepair({ rootDir: root });
  assert.equal(plan.status, "ready");
  assert.equal(plan.reason, "normalize-active-resume");
  assert.equal(plan.target.value.continuity.resume.mode, "immediate");
  const applied = applyOnboardingContinuityRepair({
    rootDir: root,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  });
  assert.equal(applied.status, "applied");
  assert.equal(applied.continuity.status, "valid");
  assert.deepEqual(readFileSync(historyPath), historyBefore);
});

check("legacy adoption is explicit, PO-bound, and does not invent kickoff history", () => {
  const root = fixture("repair-legacy-state");
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "specs", "legacy"), { recursive: true });
  writeFileSync(join(root, "docs", "state.md"), "# Existing handover\n");
  writeFileSync(join(root, "specs", "legacy", "prd_legacy.md"), "# Existing PRD\n");
  writeFileSync(join(root, "specs", "legacy", "spec.md"), "# Existing specification\n");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: {
      id: "legacy-feature",
      planPath: "specs/legacy/prd_legacy.md",
      phase: "implementation",
    },
    planApproved: true,
    updatedAt: "2026-07-26T00:00:00.000Z",
    planApproval: {
      approvedBy: "PO",
      approvedAt: "2026-07-26T00:00:00.000Z",
      poGateAuthority: {
        schema: "pipeline.po-gate-authority.v2",
        humanFacing: "en",
        planPath: "specs/legacy/prd_legacy.md",
        specPath: "specs/legacy/spec.md",
      },
    },
  }, null, 2)}\n`);

  const plan = planOnboardingContinuityRepair({ rootDir: root });
  assert.equal(plan.status, "ready");
  assert.equal(plan.reason, "adopt-established-state");
  assert.equal(plan.history.sha256, null);
  assert.equal(plan.target.value.continuity.queueHead.nextAction, "review");
  const applied = applyOnboardingContinuityRepair({
    rootDir: root,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  });
  assert.equal(applied.continuity.status, "valid");
  assert.equal(existsSync(join(root, ".git", "agent-pipeline", "onboarding", "continuity-history.json")), false);
});

check("continuity repair rejects authority drift and arbitrary invalid state", () => {
  const root = fixture("repair-rejects-drift");
  const kickoff = planOnboardingKickoff({ rootDir: root, goal: "Reject repair drift" });
  applyOnboardingKickoff({
    plan: kickoff,
    expectedPlanSha256: kickoff.planSha256,
    activate: true,
  });
  const statePath = join(root, ".claude", "pipeline-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.continuity.resume = {
    mode: "resume-on-next-turn",
    sourceRevision: 0,
    reasonCode: "active-turn",
  };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  writeFileSync(join(root, state.continuity.authority.prd.path), "# drifted authority\n");
  assert.equal(planOnboardingContinuityRepair({ rootDir: root }).status, "unsupported");

  state.continuity.resume = {
    mode: "immediate",
    sourceRevision: state.continuity.revision + 1,
    reasonCode: "active-turn",
  };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  assert.equal(planOnboardingContinuityRepair({ rootDir: root }).status, "unsupported");
});

check("operator-authority-required repair goes red then green once operator authority is supplied", () => {
  const root = fixture("repair-operator-authority");
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "specs", "mature"), { recursive: true });
  writeFileSync(join(root, "docs", "state.md"), "# Existing handover\n");
  writeFileSync(join(root, "specs", "mature", "prd_mature.md"), "# Mature PRD\n");
  writeFileSync(join(root, "specs", "mature", "spec.md"), "# Mature specification\n");

  const red = planOnboardingContinuityRepair({ rootDir: root });
  assert.equal(red.status, "operator-authority-required");

  const operatorAuthority = {
    featureId: "mature-feature",
    planPath: "specs/mature/prd_mature.md",
    prdPath: "specs/mature/prd_mature.md",
    specPath: "specs/mature/spec.md",
    language: "en",
  };
  const green = planOnboardingContinuityRepair({ rootDir: root, operatorAuthority });
  assert.equal(green.status, "ready");
  assert.equal(green.reason, "adopt-operator-confirmed-authority");
  assert.equal(green.target.beforeSha256, null);
  assert.equal(green.target.value.activeFeature.id, "mature-feature");
  assert.equal(green.target.value.activeFeature.phase, "design");
  assert.equal(green.target.value.planApproved, false);
});

check("operator-confirmed repair applies end-to-end to a valid classification", () => {
  const root = fixture("repair-operator-authority-apply");
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "specs", "mature"), { recursive: true });
  writeFileSync(join(root, "docs", "state.md"), "# Existing handover\n");
  writeFileSync(join(root, "specs", "mature", "prd_mature.md"), "# Mature PRD\n");
  writeFileSync(join(root, "specs", "mature", "spec.md"), "# Mature specification\n");

  const operatorAuthority = {
    featureId: "mature-feature",
    planPath: "specs/mature/prd_mature.md",
    prdPath: "specs/mature/prd_mature.md",
    specPath: "specs/mature/spec.md",
    language: "en",
  };
  const plan = planOnboardingContinuityRepair({ rootDir: root, operatorAuthority });
  assert.equal(plan.status, "ready");
  const applied = applyOnboardingContinuityRepair({
    rootDir: root,
    expectedPlanSha256: plan.planSha256,
    activate: true,
    operatorAuthority,
  });
  assert.equal(applied.status, "applied");
  assert.equal(applied.reason, "adopt-operator-confirmed-authority");
  assert.equal(applied.continuity.status, "valid");
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "valid");
  const stateOnDisk = JSON.parse(readFileSync(join(root, ".claude", "pipeline-state.json"), "utf8"));
  assert.equal(stateOnDisk.activeFeature.id, "mature-feature");
  assert.equal(stateOnDisk.continuity.authority.prd.path, "specs/mature/prd_mature.md");
  assert.equal(stateOnDisk.continuity.authority.spec.path, "specs/mature/spec.md");
});

check("operator-confirmed repair refuses a bad or missing operator-supplied PRD or Spec path", () => {
  const root = fixture("repair-operator-authority-fail-closed");
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "specs", "mature"), { recursive: true });
  writeFileSync(join(root, "docs", "state.md"), "# Existing handover\n");
  writeFileSync(join(root, "specs", "mature", "prd_mature.md"), "# Mature PRD\n");
  writeFileSync(join(root, "specs", "mature", "spec.md"), "# Mature specification\n");

  const missingSpec = planOnboardingContinuityRepair({
    rootDir: root,
    operatorAuthority: {
      featureId: "mature-feature",
      planPath: "specs/mature/prd_mature.md",
      prdPath: "specs/mature/prd_mature.md",
      specPath: "specs/mature/missing-spec.md",
      language: "en",
    },
  });
  assert.equal(missingSpec.status, "unsupported");
  assert.equal(missingSpec.code, "CONTINUITY-REPAIR-UNSUPPORTED");

  const mismatchedPlan = planOnboardingContinuityRepair({
    rootDir: root,
    operatorAuthority: {
      featureId: "mature-feature",
      planPath: "specs/mature/prd_mature.md",
      prdPath: "specs/mature/spec.md",
      specPath: "specs/mature/spec.md",
      language: "en",
    },
  });
  assert.equal(mismatchedPlan.status, "unsupported");
  assert.equal(mismatchedPlan.code, "CONTINUITY-REPAIR-OPERATOR-AUTHORITY-INVALID");

  const unsafePath = planOnboardingContinuityRepair({
    rootDir: root,
    operatorAuthority: {
      featureId: "mature-feature",
      planPath: "../outside.md",
      prdPath: "../outside.md",
      specPath: "specs/mature/spec.md",
      language: "en",
    },
  });
  assert.equal(unsafePath.status, "unsupported");
  assert.equal(unsafePath.code, "KICKOFF-PATH-UNSAFE");

  assert.equal(existsSync(join(root, ".claude", "pipeline-state.json")), false);
});

check("completed apply replay is byte-null and returns the identical continuity hashes", () => {
  const root = fixture("replay");
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Create a safe product" });
  const applied = applyOnboardingKickoff({ plan, expectedPlanSha256: plan.planSha256, activate: true });
  const before = targetBytes(root, plan);
  const replay = applyOnboardingKickoff({ plan, expectedPlanSha256: plan.planSha256, activate: true });
  const after = targetBytes(root, plan);
  assert.equal(replay.status, "replayed");
  assert.equal(replay.mutated, false);
  assert.deepEqual(replay.continuity, applied.continuity);
  assert.deepEqual(after.bytes, before.bytes);
});

check("a competing state appearance fails closed", () => {
  const root = fixture("state-conflict");
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Create a safe product" });
  writeFileSync(join(root, ".claude", "pipeline-state.json"), '{"schema":"pipeline.state.v0"}\n');
  expectKickoffError("KICKOFF-CAS-DRIFT", () => applyOnboardingKickoff({
    plan,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  }));
  assert.equal(readFileSync(join(root, ".claude", "pipeline-state.json"), "utf8"),
    '{"schema":"pipeline.state.v0"}\n');
});

check("lock rejection creates neither private nor project target parents", () => {
  const root = fixture("lock-before-parents", { handover: "notes/project state.md" });
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Create a safe product" });
  writeFileSync(join(root, ".claude", "pipeline-state.json.lock"), "foreign lock\n", { mode: 0o600 });
  expectKickoffError("KICKOFF-LOCKED", () => applyOnboardingKickoff({
    plan,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  }));
  assert.equal(existsSync(join(root, "notes")), false);
  assert.equal(existsSync(join(root, "specs")), false);
  assert.equal(existsSync(join(root, ".git", "agent-pipeline")), false);
});

check("kickoff never unlinks a predictable foreign temporary artifact", () => {
  const root = fixture("foreign-temp");
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Create a safe product" });
  const suffix = "a".repeat(32);
  const targetPath = join(root, plan.targets.prd.path);
  const directory = dirname(targetPath);
  const foreignPath = join(directory, `.${basename(targetPath)}.kickoff-${suffix}.tmp`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(foreignPath, "foreign temporary artifact\n", { mode: 0o600 });
  expectKickoffError("KICKOFF-WRITE-FAILED", () => applyOnboardingKickoff({
    plan,
    expectedPlanSha256: plan.planSha256,
    activate: true,
    deps: { randomUUID: () => suffix },
  }));
  assert.equal(readFileSync(foreignPath, "utf8"), "foreign temporary artifact\n");
  assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "absent-pristine");
});

check("failed kickoff removes only its newly created empty target parents", () => {
  const root = fixture("parent-rollback", { handover: "notes/project state.md" });
  const plan = planOnboardingKickoff({ rootDir: root, goal: "Create a safe product" });
  expectKickoffError("KICKOFF-FAULT", () => applyOnboardingKickoff({
    plan,
    expectedPlanSha256: plan.planSha256,
    activate: true,
    deps: { fault: () => { const error = new Error("forced"); error.code = "KICKOFF-FAULT"; throw error; } },
  }));
  assert.equal(existsSync(join(root, "notes")), false);
  assert.equal(existsSync(join(root, "specs")), false);
  assert.equal(existsSync(join(root, ".git", "agent-pipeline")), false);
});

for (const stage of KICKOFF_FAULT_STAGES) {
  check(`fault at ${stage} rolls back every proposed byte and permits a clean retry`, () => {
    const root = fixture(`fault-${stage.replaceAll(/[^a-z0-9]+/gu, "-")}`);
    const plan = planOnboardingKickoff({ rootDir: root, goal: `Recover from ${stage}` });
    expectKickoffError("KICKOFF-FAULT", () => applyOnboardingKickoff({
      plan,
      expectedPlanSha256: plan.planSha256,
      activate: true,
      deps: {
        fault(point) {
          if (point === stage) {
            const error = new Error(stage);
            error.code = "KICKOFF-FAULT";
            throw error;
          }
        },
      },
    }));
    const failed = targetBytes(root, plan);
    assert.deepEqual(failed.bytes, {
      state: null,
      handover: null,
      prd: null,
      spec: null,
      history: null,
    });
    assert.equal(classifyOnboardingContinuity({ rootDir: root }).status, "absent-pristine");
    assert.equal(applyOnboardingKickoff({
      plan,
      expectedPlanSha256: plan.planSha256,
      activate: true,
    }).status, "applied");
  });
}

for (const stage of KICKOFF_FAULT_STAGES) {
  check(`crash at ${stage} is recovered only by the same digest-bound plan`, () => {
    const root = fixture(`crash-${stage.replaceAll(/[^a-z0-9]+/gu, "-")}`);
    const plan = planOnboardingKickoff({ rootDir: root, goal: `Recover crash at ${stage}` });
    expectKickoffError("KICKOFF-SIMULATED-CRASH", () => applyOnboardingKickoff({
      plan,
      expectedPlanSha256: plan.planSha256,
      activate: true,
      deps: { crashAt: stage },
    }));
    const recovered = applyOnboardingKickoff({
      plan,
      expectedPlanSha256: plan.planSha256,
      activate: true,
      deps: { lockStaleMs: 0, nowMs: Date.now() + 1_000 },
    });
    assert.ok(["applied", "replayed"].includes(recovered.status));
    assert.equal(recovered.readback.code, "CS-STATUS-ACTIVE");
    assert.equal(recovered.continuity.status, "valid");
    assert.equal(existsSync(join(root, ".claude", "pipeline-state.json.lock")), false);
    assert.equal(existsSync(join(root, ".git", "agent-pipeline", "onboarding", ".kickoff-writer.lock")), false);
  });
}

function promotionSeed(name, { privatized = false, bumpRevision = privatized, poLanguage = "en" } = {}) {
  const root = fixture(`promotion-${name}`, { neutral: privatized });
  const kickoff = planOnboardingKickoff({ rootDir: root, goal: `Promote ${name}` });
  const statePath = join(root, kickoff.targets.state.path);
  applyOnboardingKickoff({
    plan: kickoff,
    expectedPlanSha256: kickoff.planSha256,
    activate: true,
  });
  if (privatized) {
    const binding = readOnboardingSessionCleanupBinding({ rootDir: root });
    bindOnboardingSessionCleanup({
      rootDir: root,
      expectedStateSha256: binding.stateSha256,
      expectedRevision: 0,
      sessionCleanup: {
        sessionId: `session-${name}`,
        descriptorSha256: "a".repeat(64),
      },
    });
    // `bumpRevision` (default: mirrors `privatized`, so every existing caller
    // keeps promoting a revision-1 re-kickoff exactly as before) is set false
    // by the revision-0->1 recovery test below: it needs a private
    // session-cleanup binding to exist at kickoff time -- exactly like a
    // revision-1 re-kickoff -- while the kickoff itself stays at revision 0,
    // the ordinary first-ever kickoff a project runs.
    if (bumpRevision) {
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      state.continuity.revision = 1;
      writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
    }
  }
  const directory = join(root, "specs", "promoted");
  mkdirSync(directory, { recursive: true });
  const specBytes = `# ${name} specification\n`;
  writeFileSync(join(directory, "spec.md"), specBytes);
  // The promoted PRD is the approval subject, so it carries the PO-gate
  // markers: the human-facing language, the digest of the Spec beside it, and
  // the PO's own plan acknowledgement (this fixture represents an already
  // human-reviewed PRD, the state every promotion test in this file assumes).
  writeFileSync(join(directory, "prd_promoted.md"), [
    `<!-- po-language: ${poLanguage} -->`,
    `<!-- technical-spec-sha256: ${digest(specBytes)} -->`,
    PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
    `# ${name} PRD`,
    "",
  ].join("\n"));
  writeFileSync(join(directory, "design-input.md"), `# ${name} design input\n`);
  return {
    root,
    kickoff,
    statePath,
    request: {
      rootDir: root,
      profile: "feature",
      featureId: `feature-${name}`,
      planPath: "specs/promoted/prd_promoted.md",
      prdPath: "specs/promoted/prd_promoted.md",
      specPath: "specs/promoted/spec.md",
      designInputPath: "specs/promoted/design-input.md",
    },
  };
}

function mutatePromotionState(seed, mutate) {
  const state = JSON.parse(readFileSync(seed.statePath, "utf8"));
  mutate(state);
  writeFileSync(seed.statePath, `${JSON.stringify(state, null, 2)}\n`);
}

check("revision-0 kickoff seed promotion remains monotonic and replayable", () => {
  const seed = promotionSeed("revision-zero");
  const plan = planOnboardingKickoffPromotion(seed.request);
  assert.equal(plan.kickoff.revision, 0);
  assert.equal(plan.targets.state.value.continuity.revision, 1);
  assert.equal(plan.targets.state.value.continuity.resume.sourceRevision, 1);
  assert.deepEqual(plan.authority.designInput, {
    path: "specs/promoted/design-input.md",
    sha256: plan.targets.history.value.transactions[1].designInputSha256,
  });
  assert.equal(plan.targets.history.value.transactions[1].designInputPath, "specs/promoted/design-input.md");
  assert.ok(plan.applyAction.argv.includes("--design-input-path"));
  const applied = applyOnboardingKickoffPromotion({
    plan,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  });
  assert.equal(applied.status, "applied");
  const replay = applyOnboardingKickoffPromotion({
    plan,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  });
  assert.equal(replay.status, "replayed");
  assert.equal(replay.mutated, false);
  assert.deepEqual(reconstructOnboardingKickoffPromotionPlan(seed.request), plan);
});

check("promotion requires bound design evidence and rejects post-promotion evidence drift without repair", () => {
  const seed = promotionSeed("design-evidence");
  const designInput = join(seed.root, "specs", "promoted", "design-input.md");
  assert.throws(() => planOnboardingKickoffPromotion({ ...seed.request, designInputPath: undefined }),
    /design input path is unsafe/u);
  assert.throws(() => planOnboardingKickoffPromotion({ ...seed.request, designInputPath: "specs/other/design-input.md" }),
    /promotion plan and authority paths are inconsistent/u);
  const kickoffDirectory = join(seed.root, dirname(seed.kickoff.targets.prd.path));
  const kickoffDesignInput = join(kickoffDirectory, "design-input.md");
  writeFileSync(kickoffDesignInput, "# provisional evidence\n");
  assert.throws(() => planOnboardingKickoffPromotion({
    ...seed.request,
    planPath: seed.kickoff.targets.prd.path,
    prdPath: seed.kickoff.targets.prd.path,
    specPath: seed.kickoff.targets.spec.path,
    designInputPath: `${dirname(seed.kickoff.targets.spec.path)}/design-input.md`,
  }), /promotion authority must not reuse kickoff artifacts/u);
  const plan = planOnboardingKickoffPromotion(seed.request);
  writeFileSync(designInput, "# changed evidence\n");
  assert.throws(() => applyOnboardingKickoffPromotion({
    plan, expectedPlanSha256: plan.planSha256, activate: true,
  }), /promotion authority bytes drifted/u);
  writeFileSync(designInput, "# design-evidence design input\n");
  applyOnboardingKickoffPromotion({ plan, expectedPlanSha256: plan.planSha256, activate: true });
  writeFileSync(designInput, "# altered after promotion\n");
  assert.equal(classifyOnboardingContinuity({ rootDir: seed.root }).status, "unavailable");
});

check("authentic post-privatization kickoff seed promotes revision 1 to revision 2", () => {
  const seed = promotionSeed("post-private", { privatized: true });
  const before = classifyOnboardingContinuity({ rootDir: seed.root });
  const beforeBinding = readOnboardingSessionCleanupBinding({ rootDir: seed.root });
  const plan = planOnboardingKickoffPromotion(seed.request);
  assert.equal(plan.kickoff.revision, 1);
  assert.equal(plan.targets.state.beforeSha256, before.stateSha256);
  assert.equal(plan.targets.state.value.continuity.revision, 2);
  assert.equal(plan.targets.state.value.continuity.resume.sourceRevision, 2);
  assert.equal(plan.targets.history.value.transactions[1].previousTransactionSha256,
    seed.kickoff.transactionSha256);
  assert.equal(plan.targets.history.value.transactions[1].beforeStateSha256,
    before.stateSha256);
  const applied = applyOnboardingKickoffPromotion({
    plan,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  });
  assert.equal(applied.status, "applied");
  const afterBinding = readOnboardingSessionCleanupBinding({ rootDir: seed.root });
  assert.equal(afterBinding.status, "bound");
  assert.equal(afterBinding.root, beforeBinding.root);
  assert.deepEqual(afterBinding.sessionCleanup, beforeBinding.sessionCleanup);
  assert.equal(afterBinding.stateSha256, plan.targets.state.afterSha256);
  assert.equal(plan.targets.cleanupBinding.beforeSha256.length, 64);
  assert.equal(plan.targets.cleanupBinding.afterSha256.length, 64);
  assert.equal(applyOnboardingKickoffPromotion({
    plan,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  }).status, "replayed");
  assert.deepEqual(reconstructOnboardingKickoffPromotionPlan(seed.request), plan);
});

// SSc.4: the two earlier per-target boundaries (temp-fsync, rename), additive
// to the four pre-existing "-published" (directory-fsync) commit-boundary
// hooks -- matching KICKOFF_FAULT_STAGES' finer per-target-per-boundary
// granularity for the three targets applyOnboardingKickoffPromotion writes
// with an inline temp/rename/fsync sequence (history, handover, state).
// cleanupBinding is deliberately excluded: its write goes through
// replacePromotedPrivateCleanupBinding()'s own try/catch, which remaps any
// non-KickoffError exception (SimulatedKickoffCrash extends Error, not
// KickoffError) into KICKOFF-PROMOTION-PRIVATE-WRITE -- finer-grained
// injection there would require restructuring that shared helper (also used
// by the unrelated cleanup-recovery apply path), out of this dispatch's scope.
for (const stage of [
  "promotion-history-temp-fsync",
  "promotion-history-rename",
  "promotion-history-published",
  "promotion-handover-temp-fsync",
  "promotion-handover-rename",
  "promotion-handover-published",
  "promotion-cleanup-binding-published",
  "promotion-state-temp-fsync",
  "promotion-state-rename",
  "promotion-state-published",
]) {
  check(`post-privatization promotion ${stage} crash recovers with the same bound plan`, () => {
    const seed = promotionSeed(`crash-${stage}`, { privatized: true });
    const plan = planOnboardingKickoffPromotion(seed.request);
    assert.throws(() => applyOnboardingKickoffPromotion({
      plan,
      expectedPlanSha256: plan.planSha256,
      activate: true,
      deps: { crashAt: stage },
    }), (error) => error?.message === stage);
    const recovered = applyOnboardingKickoffPromotion({
      plan,
      expectedPlanSha256: plan.planSha256,
      activate: true,
      deps: { lockStaleMs: 0, nowMs: Date.now() + 1_000 },
    });
    assert.ok(["applied", "replayed"].includes(recovered.status));
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: seed.root }).status, "bound");
  });
}

// The provisional `specs/kickoff-*` PRD and Spec survive promotion as stale
// copies of the two documents the whole gate chain is digest-bound to.  The
// promotion transaction is the only place that knows both locations, so it is
// where the provisional one is retired: by a marker naming the successor
// package, published after the commit point, never by a removal this
// transaction has no rollback to undo.  These checks pin both halves of that
// decision -- the marker exists after a success, and no failure point can
// leave a byte of it behind.
const SUPERSEDED_BASENAME = "SUPERSEDED.md";

function provisionalDirectory(seed) {
  return join(seed.root, dirname(seed.kickoff.targets.prd.path));
}

function directoryBytes(directory) {
  if (!existsSync(directory)) return null;
  return Object.fromEntries(readdirSync(directory).sort().map((name) => [
    name,
    readFileSync(join(directory, name)).toString("base64"),
  ]));
}

// Content *and* mtime of everything a promotion may write, so "zero-write" is
// a claim about the filesystem rather than about identical bytes.
function promotionWriteSurface(seed) {
  const surface = {};
  const visit = (directory, prefix) => {
    if (!existsSync(directory)) return;
    for (const name of readdirSync(directory).sort()) {
      const child = join(directory, name);
      const rel = `${prefix}/${name}`;
      if (lstatSync(child).isDirectory()) {
        visit(child, rel);
        continue;
      }
      surface[rel] = `${readFileSync(child).toString("base64")}@${lstatSync(child).mtimeMs}`;
    }
  };
  visit(join(seed.root, "specs"), "specs");
  visit(join(seed.root, ".git", "agent-pipeline"), "private");
  visit(dirname(seed.statePath), "state");
  return surface;
}

check("promotion retires the provisional kickoff anchors with a marker naming its successor", () => {
  const seed = promotionSeed("supersession");
  const provisional = provisionalDirectory(seed);
  const marker = join(provisional, SUPERSEDED_BASENAME);
  const plan = planOnboardingKickoffPromotion(seed.request);
  assert.equal(existsSync(marker), false);
  assert.equal(applyOnboardingKickoffPromotion({
    plan, expectedPlanSha256: plan.planSha256, activate: true,
  }).status, "applied");
  assert.equal(existsSync(marker), true);
  const text = readFileSync(marker, "utf8");
  for (const named of [
    plan.kickoff.featureId, seed.request.featureId, seed.request.profile,
    seed.request.prdPath, seed.request.specPath, seed.request.designInputPath,
    plan.transactionSha256,
  ]) {
    assert.ok(text.includes(named), `supersession marker must name ${named}`);
  }
  assert.deepEqual(readdirSync(provisional).sort(), [
    SUPERSEDED_BASENAME, basename(seed.kickoff.targets.prd.path), "spec.md",
  ].sort());
  // The marker is an annotation, never an authority record: the promotion
  // history entry still records exactly what it recorded before, `specPath`
  // included, and gains nothing.
  const entry = JSON.parse(readFileSync(join(seed.root, ".git", "agent-pipeline",
    "onboarding", "continuity-history.json"), "utf8")).transactions[1];
  assert.deepEqual(entry, plan.targets.history.value.transactions[1]);
  assert.deepEqual(Object.keys(entry).sort(), [
    "afterStateSha256", "beforeStateSha256", "designInputPath", "designInputSha256",
    // `handover` joined the record on 2026-08-09 when the promotion gained its
    // fourth target. It is a target binding like `cleanupBinding`, not an
    // authority record: the marker below still gains nothing from it.
    "featureId", "handover", "kickoffFeatureId", "kind", "planPath", "prdSha256",
    "previousTransactionSha256", "profile", "specPath", "specSha256", "transactionSha256",
  ]);
  assert.equal(entry.specPath, seed.request.specPath);
  assert.equal(entry.planPath, seed.request.planPath);
});

// HANDOVER-1. The defect this target closes, stated as the test: after a
// promotion, the canonical handover must not still describe the provisional
// kickoff feature whose directory the same transaction just marked SUPERSEDED.md.
// Both of the PO's 2026-08-09 greenfield repositories ended in exactly that state,
// and the bootstrap reads this file first and treats it as canonical for "where am
// I" -- so a resuming session was pointed at a superseded anchor by the artifact
// that exists to prevent it.
check("the promotion replaces the handover the kickoff wrote", () => {
  const seed = promotionSeed("handover");
  const handoverPath = join(seed.root, "docs", "state.md");
  const kickoffFeatureId = basename(dirname(seed.kickoff.targets.prd.path));
  const before = readFileSync(handoverPath, "utf8");
  assert.ok(before.includes(kickoffFeatureId), "the kickoff handover names the provisional feature");

  const plan = promote(seed);
  const after = readFileSync(handoverPath, "utf8");

  // What must no longer be there, and what must be.
  assert.ok(!after.includes(kickoffFeatureId),
    "no artifact this transaction wrote may still name the superseded kickoff feature");
  for (const named of [seed.request.featureId, seed.request.prdPath, seed.request.specPath,
    seed.request.designInputPath, seed.request.profile]) {
    assert.ok(after.includes(named), `the promoted handover must name ${named}`);
  }
  // The design input is the line that matters across a session boundary: the PO's
  // report of the Codex run was that the runner "forgets the input", and the brief
  // was never lost from disk -- nothing that survived the session pointed at it.
  assert.ok(after.includes(seed.request.designInputPath), "the handover names the durable brief");

  // Bound like the other three targets, not written and forgotten.
  assert.equal(plan.targets.handover.path, "docs/state.md");
  assert.equal(plan.targets.handover.beforeSha256, digest(before));
  assert.equal(plan.targets.handover.afterSha256, digest(after));
  const entry = JSON.parse(readFileSync(promotionHistoryPath(seed.root), "utf8")).transactions[1];
  assert.deepEqual(entry.handover, {
    path: "docs/state.md", beforeSha256: digest(before), afterSha256: digest(after),
  });
  assert.equal(classifyOnboardingContinuity({ rootDir: seed.root }).status, "valid");

  // Replay is zero-write and returns the identical plan digest.
  const replayed = applyOnboardingKickoffPromotion({
    plan, expectedPlanSha256: plan.planSha256, activate: true,
  });
  assert.equal(replayed.status, "replayed");
  assert.equal(replayed.mutated, false);
  assert.equal(readFileSync(handoverPath, "utf8"), after);
});

// HANDOVER-2. The handover is published BEFORE the State, which is this
// transaction's commit point. A crash between them must therefore leave a
// handover that is ahead of a State that is behind -- recoverable, roll-forward,
// and never the reverse (a promoted State beside a handover still naming the
// kickoff is the exact state the target exists to prevent).
check("a crash after the handover publication rolls forward, never backward", () => {
  const seed = promotionSeed("handover-crash", { privatized: true });
  const handoverPath = join(seed.root, "docs", "state.md");
  const plan = planOnboardingKickoffPromotion(seed.request);
  assert.throws(() => applyOnboardingKickoffPromotion({
    plan, expectedPlanSha256: plan.planSha256, activate: true,
    deps: { crashAt: "promotion-handover-published" },
  }));

  const crashed = readFileSync(handoverPath, "utf8");
  assert.equal(digest(crashed), plan.targets.handover.afterSha256, "the handover reached its postimage");
  assert.ok(!crashed.includes(basename(dirname(seed.kickoff.targets.prd.path))));
  assert.notEqual(JSON.parse(readFileSync(seed.statePath, "utf8")).continuity.featureId, seed.request.featureId,
    "the State has NOT been published -- the commit point was never reached");

  // The same digest-bound plan completes it. The simulated crash holds the locks,
  // exactly as a real one would, so recovery goes through the stale-lock path.
  const resumed = applyOnboardingKickoffPromotion({
    plan, expectedPlanSha256: plan.planSha256, activate: true,
    deps: { lockStaleMs: 0, nowMs: Date.now() + 1_000 },
  });
  assert.equal(resumed.status, "applied");
  assert.equal(readFileSync(handoverPath, "utf8"), crashed, "the recovered run rewrites no handover byte");
  assert.equal(classifyOnboardingContinuity({ rootDir: seed.root }).status, "valid");
});

// HANDOVER-3. A third party writing the handover between plan and apply is drift,
// not a recoverable prefix: rolling forward over it would destroy bytes this
// transaction never saw.
check("a foreign handover write is drift, not a prefix to roll forward over", () => {
  const seed = promotionSeed("handover-foreign");
  const handoverPath = join(seed.root, "docs", "state.md");
  const plan = planOnboardingKickoffPromotion(seed.request);
  writeFileSync(handoverPath, "# Someone else was here\n");
  expectKickoffError("KICKOFF-PROMOTION-CAS-DRIFT", () => applyOnboardingKickoffPromotion({
    plan, expectedPlanSha256: plan.planSha256, activate: true,
  }));
  assert.equal(readFileSync(handoverPath, "utf8"), "# Someone else was here\n",
    "the foreign bytes are preserved exactly");
});

for (const stage of [
  "promotion-history-temp-fsync",
  "promotion-history-rename",
  "promotion-history-published",
  "promotion-handover-temp-fsync",
  "promotion-handover-rename",
  "promotion-handover-published",
  "promotion-cleanup-binding-published",
  "promotion-state-temp-fsync",
  "promotion-state-rename",
  "promotion-state-published",
]) {
  check(`promotion crash at ${stage} leaves the provisional kickoff anchors byte for byte`, () => {
    const seed = promotionSeed(`supersession-crash-${stage}`, { privatized: true });
    const provisional = provisionalDirectory(seed);
    const before = directoryBytes(provisional);
    const plan = planOnboardingKickoffPromotion(seed.request);
    assert.throws(() => applyOnboardingKickoffPromotion({
      plan,
      expectedPlanSha256: plan.planSha256,
      activate: true,
      deps: { crashAt: stage },
    }), (error) => error?.message === stage);
    assert.deepEqual(directoryBytes(provisional), before);
    assert.equal(existsSync(join(provisional, SUPERSEDED_BASENAME)), false);
  });
}

check("promotion replay after supersession stays zero-write and canonically identical", () => {
  const seed = promotionSeed("supersession-replay");
  const plan = planOnboardingKickoffPromotion(seed.request);
  const applied = applyOnboardingKickoffPromotion({
    plan, expectedPlanSha256: plan.planSha256, activate: true,
  });
  const surface = promotionWriteSurface(seed);
  const replay = applyOnboardingKickoffPromotion({
    plan, expectedPlanSha256: plan.planSha256, activate: true,
  });
  assert.equal(replay.status, "replayed");
  assert.equal(replay.mutated, false);
  assert.deepEqual(promotionWriteSurface(seed), surface);
  assert.deepEqual({ ...replay, status: applied.status, mutated: applied.mutated }, applied);
  assert.deepEqual(reconstructOnboardingKickoffPromotionPlan(seed.request), plan);
});

check("an already-cleaned provisional location survives inspection and replay", () => {
  const seed = promotionSeed("supersession-cleaned");
  const plan = planOnboardingKickoffPromotion(seed.request);
  applyOnboardingKickoffPromotion({ plan, expectedPlanSha256: plan.planSha256, activate: true });
  rmSync(provisionalDirectory(seed), { recursive: true, force: true });
  assert.equal(classifyOnboardingContinuity({ rootDir: seed.root }).status, "valid");
  assert.equal(applyOnboardingKickoffPromotion({
    plan, expectedPlanSha256: plan.planSha256, activate: true,
  }).status, "replayed");
  assert.deepEqual(reconstructOnboardingKickoffPromotionPlan(seed.request), plan);
  assert.equal(existsSync(provisionalDirectory(seed)), false);
});

check("an already-marked provisional location is never overwritten by the promotion", () => {
  const seed = promotionSeed("supersession-marked");
  const provisional = provisionalDirectory(seed);
  const marker = join(provisional, SUPERSEDED_BASENAME);
  const original = "# retired by hand, before the promotion ran\n";
  writeFileSync(marker, original);
  const plan = planOnboardingKickoffPromotion(seed.request);
  assert.equal(applyOnboardingKickoffPromotion({
    plan, expectedPlanSha256: plan.planSha256, activate: true,
  }).status, "applied");
  assert.equal(readFileSync(marker, "utf8"), original);
  assert.equal(classifyOnboardingContinuity({ rootDir: seed.root }).status, "valid");
  assert.equal(applyOnboardingKickoffPromotion({
    plan, expectedPlanSha256: plan.planSha256, activate: true,
  }).status, "replayed");
  assert.deepEqual(readdirSync(provisional).filter((name) => name.startsWith(".")), []);
});

function legacyPromotionCleanupMismatch(name) {
  const seed = promotionSeed(`legacy-${name}`, { privatized: true });
  const bindingPath = join(seed.root, ".git", "agent-pipeline", "onboarding", "session-cleanup-binding.json");
  const originalBinding = readFileSync(bindingPath);
  const promotion = planOnboardingKickoffPromotion(seed.request);
  applyOnboardingKickoffPromotion({ plan: promotion, expectedPlanSha256: promotion.planSha256, activate: true });
  const historyPath = join(seed.root, ".git", "agent-pipeline", "onboarding", "continuity-history.json");
  const history = JSON.parse(readFileSync(historyPath, "utf8"));
  delete history.transactions[1].cleanupBinding;
  writeFileSync(historyPath, `${JSON.stringify(history)}\n`, { mode: 0o600 });
  writeFileSync(bindingPath, originalBinding, { mode: 0o600 });
  return { ...seed, bindingPath, historyPath };
}

check("legacy revision-2 promotion cleanup mismatch has a read-only digest-bound repair and exact replay", () => {
  const seed = legacyPromotionCleanupMismatch("repair");
  const before = {
    state: readFileSync(seed.statePath),
    history: readFileSync(seed.historyPath),
    binding: readFileSync(seed.bindingPath),
  };
  const plan = planOnboardingKickoffPromotionCleanupRecovery({ rootDir: seed.root });
  assert.equal(plan.status, "ready");
  assert.equal(plan.feature.from.startsWith("kickoff-"), true);
  assert.equal(plan.feature.to, seed.request.featureId);
  assert.deepEqual(readFileSync(seed.statePath), before.state);
  assert.deepEqual(readFileSync(seed.historyPath), before.history);
  assert.deepEqual(readFileSync(seed.bindingPath), before.binding);
  const applied = applyOnboardingKickoffPromotionCleanupRecovery({
    rootDir: seed.root,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  });
  assert.equal(applied.status, "applied");
  assert.equal(applied.mutated, true);
  assert.equal(readOnboardingSessionCleanupBinding({ rootDir: seed.root }).status, "bound");
  const replay = applyOnboardingKickoffPromotionCleanupRecovery({
    rootDir: seed.root,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  });
  assert.equal(replay.status, "replayed");
  assert.equal(replay.mutated, false);
});

check("legacy promotion cleanup recovery is crash-replay safe after private binding publication", () => {
  const seed = legacyPromotionCleanupMismatch("recovery-crash");
  const plan = planOnboardingKickoffPromotionCleanupRecovery({ rootDir: seed.root });
  assert.throws(() => applyOnboardingKickoffPromotionCleanupRecovery({
    rootDir: seed.root,
    expectedPlanSha256: plan.planSha256,
    activate: true,
    deps: { crashAt: "kickoff-promotion-cleanup-recovery-binding-published" },
  }), (error) => error?.message === "kickoff-promotion-cleanup-recovery-binding-published");
  const replay = applyOnboardingKickoffPromotionCleanupRecovery({
    rootDir: seed.root,
    expectedPlanSha256: plan.planSha256,
    activate: true,
    deps: { lockStaleMs: 0, nowMs: Date.now() + 1_000 },
  });
  assert.equal(replay.status, "replayed");
  assert.equal(replay.mutated, false);
});

check("ordinary first kickoff->promotion (revision 0 to 1) also has a read-only digest-bound repair and exact replay", () => {
  // Unlike `legacyPromotionCleanupMismatch` (which seeds `privatized: true`, a
  // revision-1 re-kickoff), this is the single most common path: the very
  // first kickoff a project ever runs. A private session-cleanup binding can
  // still exist at kickoff time (bound to the kickoff-XXXX pseudo feature id)
  // -- `recognisedKickoff` simply never reads it for a revision-0 kickoff, so
  // `buildKickoffPromotionPlan` structurally never carries a `cleanupBinding`
  // promotion target for it. Recovering that binding afterward is exactly
  // `kickoffPromotionCleanupRecoveryPlanCore`'s job, and it used to hardcode
  // `state.continuity.revision !== 2`, excluding this revision-0->1 case.
  const seed = promotionSeed("legacy-revision-zero", { privatized: true, bumpRevision: false });
  const kickoffBinding = readOnboardingSessionCleanupBinding({ rootDir: seed.root });
  assert.equal(kickoffBinding.revision, 0);
  const promotion = planOnboardingKickoffPromotion(seed.request);
  assert.equal(promotion.kickoff.revision, 0);
  assert.equal(promotion.targets.cleanupBinding, undefined);
  assert.equal(applyOnboardingKickoffPromotion({
    plan: promotion, expectedPlanSha256: promotion.planSha256, activate: true,
  }).status, "applied");
  const plan = planOnboardingKickoffPromotionCleanupRecovery({ rootDir: seed.root });
  assert.equal(plan.status, "ready");
  assert.equal(plan.revision, 1);
  assert.equal(plan.feature.from.startsWith("kickoff-"), true);
  assert.equal(plan.feature.to, seed.request.featureId);
  const applied = applyOnboardingKickoffPromotionCleanupRecovery({
    rootDir: seed.root,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  });
  assert.equal(applied.status, "applied");
  assert.equal(applied.mutated, true);
  assert.equal(applied.revision, 1);
  const boundBinding = readOnboardingSessionCleanupBinding({ rootDir: seed.root });
  assert.equal(boundBinding.status, "bound");
  assert.equal(boundBinding.revision, 1);
  const replay = applyOnboardingKickoffPromotionCleanupRecovery({
    rootDir: seed.root,
    expectedPlanSha256: plan.planSha256,
    activate: true,
  });
  assert.equal(replay.status, "replayed");
  assert.equal(replay.mutated, false);
});

for (const [name, mutate] of [
  ["history-binding", (seed) => {
    const history = JSON.parse(readFileSync(seed.historyPath, "utf8"));
    history.transactions[1].featureId = "wrong-feature";
    writeFileSync(seed.historyPath, `${JSON.stringify(history)}\n`, { mode: 0o600 });
  }],
  ["state-feature", (seed) => mutatePromotionState(seed, (state) => { state.activeFeature.id = "wrong-feature"; })],
]) {
  check(`legacy promotion cleanup mismatch ${name} fails closed`, () => {
    const seed = legacyPromotionCleanupMismatch(name);
    mutate(seed);
    const result = planOnboardingKickoffPromotionCleanupRecovery({ rootDir: seed.root });
    assert.equal(result.status, "recovery-unavailable");
    // NVA-H-LASTBUILDERS: the non-ready branches return before nextAction is
    // attached and must stay exactly as they were -- only the "ready" return
    // gains applyAction/nextAction/planSha256.
    assert.equal("applyAction" in result, false);
    assert.equal("nextAction" in result, false);
    assert.equal("planSha256" in result, false);
  });
}

check("revision-1 kickoff lookalike without authenticated private binding is rejected", () => {
  const seed = promotionSeed("missing-private-binding");
  mutatePromotionState(seed, (state) => { state.continuity.revision = 1; });
  expectKickoffError("KICKOFF-PROMOTION-NOT-SEED", () => {
    planOnboardingKickoffPromotion(seed.request);
  });
});

for (const [name, mutate] of [
  ["revision-two", (seed) => mutatePromotionState(seed, (state) => { state.continuity.revision = 2; })],
  ["authority-drift", (seed) => {
    writeFileSync(join(seed.root, seed.kickoff.targets.prd.path), "# drifted initial authority\n");
  }],
  ["dispatch", (seed) => mutatePromotionState(seed, (state) => {
    state.continuity.queueHead.dispatch = {
      featureId: state.activeFeature.id,
      queueRevision: state.continuity.revision,
      packageId: state.continuity.queueHead.packageId,
      actionId: state.continuity.queueHead.actionId,
      dispatchId: "dispatch-1",
      attemptId: "attempt-1",
      authorityDigests: {
        prdSha256: state.continuity.authority.prd.sha256,
        specSha256: state.continuity.authority.spec.sha256,
        resultSha256: null,
      },
      routeRequestSha256: "b".repeat(64),
      mayDelegate: false,
    };
  })],
  ["blocker", (seed) => mutatePromotionState(seed, (state) => {
    state.continuity.queueHead = null;
    state.continuity.blocker = {
      type: "authority",
      signature: "authority-blocked",
      resumeCondition: { kind: "manual", evidenceSha256: null },
      decisionBrief: null,
    };
  })],
  ["queue-mutation", (seed) => mutatePromotionState(seed, (state) => {
    state.continuity.queueHead.actionId = "mutated-action";
  })],
  ["result", (seed) => mutatePromotionState(seed, (state) => {
    state.continuity.authority.result = {
      path: "evidence/result.json",
      sha256: "c".repeat(64),
    };
  })],
  ["decision", (seed) => mutatePromotionState(seed, (state) => {
    state.continuity.decisionTxn = {
      idempotencyKey: "decision-1",
      briefSha256: "d".repeat(64),
      intentSha256: "e".repeat(64),
      selectedOptionId: "option-1",
      preSelectionRevision: 0,
      selectedRevision: 1,
      dispatchableRevision: 2,
      phase: "state-applied",
    };
  })],
  ["false-history", (seed) => {
    const path = join(seed.root, ".git", "agent-pipeline", "onboarding", "continuity-history.json");
    const history = JSON.parse(readFileSync(path, "utf8"));
    history.transactions[0].transactionSha256 = "f".repeat(64);
    writeFileSync(path, JSON.stringify(history), { mode: 0o600 });
  }],
]) {
  check(`post-privatization kickoff rejects ${name}`, () => {
    const seed = promotionSeed(`reject-${name}`, { privatized: true });
    mutate(seed);
    expectKickoffError("KICKOFF-PROMOTION-NOT-SEED", () => {
      planOnboardingKickoffPromotion(seed.request);
    });
  });
}

function promotionHistoryPath(root) {
  return join(root, ".git", "agent-pipeline", "onboarding", "continuity-history.json");
}

function promote(seed) {
  const plan = planOnboardingKickoffPromotion(seed.request);
  applyOnboardingKickoffPromotion({ plan, expectedPlanSha256: plan.planSha256, activate: true });
  return plan;
}

function promotedArtifact(seed, name) {
  return join(seed.root, "specs", "promoted", name);
}

check("promotion binds the PRD as the approval subject and presents the Spec beside it", () => {
  const seed = promotionSeed("prd-is-the-plan");
  const plan = planOnboardingKickoffPromotion(seed.request);
  assert.equal(plan.feature.planPath, "specs/promoted/prd_promoted.md");
  assert.equal(plan.authority.prd.path, plan.feature.planPath);
  assert.equal(plan.authority.spec.path, "specs/promoted/spec.md");
  assert.notEqual(plan.authority.prd.path, plan.authority.spec.path);
  applyOnboardingKickoffPromotion({ plan, expectedPlanSha256: plan.planSha256, activate: true });
  const state = JSON.parse(readFileSync(seed.statePath, "utf8"));
  assert.equal(state.activeFeature.planPath, "specs/promoted/prd_promoted.md");
  assert.deepEqual(state.continuity.authority.prd, plan.authority.prd);
  assert.deepEqual(state.continuity.authority.spec, plan.authority.spec);
  assert.equal(state.planApproved, false);
});

check("the recorded promotion transaction names the PRD and the Spec with both digests", () => {
  const seed = promotionSeed("both-digests");
  const plan = promote(seed);
  const entry = JSON.parse(readFileSync(promotionHistoryPath(seed.root), "utf8")).transactions[1];
  assert.equal(entry.planPath, "specs/promoted/prd_promoted.md");
  assert.equal(entry.specPath, "specs/promoted/spec.md");
  assert.equal(entry.prdSha256, digest(readFileSync(promotedArtifact(seed, "prd_promoted.md"))));
  assert.equal(entry.specSha256, digest(readFileSync(promotedArtifact(seed, "spec.md"))));
  assert.equal(entry.prdSha256, plan.authority.prd.sha256);
  assert.equal(entry.specSha256, plan.authority.spec.sha256);
  assert.notEqual(entry.prdSha256, entry.specSha256);
  assert.equal(classifyOnboardingContinuity({ rootDir: seed.root }).status, "valid");
});

check("editing the promoted PRD invalidates the mutual digest binding", () => {
  const seed = promotionSeed("prd-drift");
  promote(seed);
  assert.equal(classifyOnboardingContinuity({ rootDir: seed.root }).status, "valid");
  const path = promotedArtifact(seed, "prd_promoted.md");
  writeFileSync(path, `${readFileSync(path, "utf8")}\nEdited after promotion.\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: seed.root }).status, "unavailable");
});

check("editing the promoted Spec invalidates the mutual digest binding", () => {
  const seed = promotionSeed("spec-drift");
  promote(seed);
  assert.equal(classifyOnboardingContinuity({ rootDir: seed.root }).status, "valid");
  const path = promotedArtifact(seed, "spec.md");
  writeFileSync(path, `${readFileSync(path, "utf8")}\nEdited after promotion.\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: seed.root }).status, "unavailable");
});

// PROMOLANG-1. Both artifacts checked against EACH OTHER, which is what every
// existing test omitted: each was checked against its own expectations, so a
// transaction that emitted a PRD saying `de` and a state saying `en` passed all of
// them. The kickoff freezes the historical English seed by design -- at that point
// no portable source exists -- so a PO who answers German after the kickoff has
// their answer arrive only in the promoted PRD's marker. The promotion is the
// transaction that binds that PRD, so it is the transaction that must learn from
// it. Observed in the PO's 2026-08-09 Claude greenfield run.
check("the promoted state's language is the promoted PRD's marker, not the kickoff default", () => {
  const seed = promotionSeed("language", { poLanguage: "de" });
  const kickoffState = JSON.parse(readFileSync(seed.statePath, "utf8"));
  assert.equal(kickoffState.continuity.runtime.humanFacingLanguage, "en",
    "the kickoff seed still freezes the historical English default -- that is the state this fixes, not a bug in itself");

  promote(seed);
  const promoted = JSON.parse(readFileSync(seed.statePath, "utf8"));
  const prdText = readFileSync(promotedArtifact(seed, "prd_promoted.md"), "utf8");
  // A literal-string check, not a regex literal: semgrep's parser has a known
  // PartialParsing false positive on regex literals containing `<!--`/`-->`
  // (2026-08-19, found by a Verify run, unrelated to any product defect).
  assert.ok(prdText.includes("<!-- po-language: de -->"));
  assert.equal(promoted.continuity.runtime.humanFacingLanguage, "de",
    "one transaction must not emit a PRD saying de and a state saying en");
  assert.equal(classifyOnboardingContinuity({ rootDir: seed.root }).status, "valid");

  // A PRD that answers English leaves the value where it already was, so the
  // ordinary consistent case is untouched rather than rewritten.
  const english = promotionSeed("language-en");
  promote(english);
  assert.equal(JSON.parse(readFileSync(english.statePath, "utf8")).continuity.runtime.humanFacingLanguage, "en");
});

// REOPEN-1. The two checks above are the assurance; this one is its boundary. The
// PO's 2026-08-09 greenfield run reported it as "claude hat sich wieder selber
// deadlocked": `reopen-design` sets the phase back to design so a submitted plan
// can be worked on again, the agent edits `spec.md` -- the one action reopening the
// design exists to enable -- and the mutual promotion binding above turned that
// sanctioned edit into `continuity: unavailable` with `nextAction: null`. The only
// escape observed was putting the old bytes back, which a greenfield repository
// with no commits cannot do. The promotion record is history once the lifecycle has
// released the documents; `continuity.authority` and the PO gate are the live
// binding, and both are re-established by submit-plan/approve-plan.
check("a reopened design may edit its promoted documents without ending the session", () => {
  const seed = promotionSeed("reopen-drift");
  promote(seed);
  assert.equal(classifyOnboardingContinuity({ rootDir: seed.root }).status, "valid");

  // Exactly what `reopenPlanDesign` records: phase back to design, approval
  // cleared, and a durable `planInvalidation` naming the submission it invalidated.
  const state = JSON.parse(readFileSync(seed.statePath, "utf8"));
  state.activeFeature = { ...state.activeFeature, phase: "design" };
  state.planApproved = false;
  state.planInvalidation = { invalidatedSubmissionSha256: digest(Buffer.from("submission")), invalidatedAt: "2026-08-09T07:48:00.000Z" };
  writeFileSync(seed.statePath, `${JSON.stringify(state, null, 2)}\n`);

  for (const name of ["spec.md", "prd_promoted.md"]) {
    const path = promotedArtifact(seed, name);
    writeFileSync(path, `${readFileSync(path, "utf8")}\nEdited while the design is reopened.\n`);
    assert.notEqual(classifyOnboardingContinuity({ rootDir: seed.root }).status, "unavailable",
      `editing ${name} while the design is reopened must not make the session unobservable`);
  }

  // And the assurance is not gone, only scoped: a state that never reopened its
  // design still loses the binding on the same edit. Both checks above pin that
  // directly; this asserts the marker is what separates them, not the edit.
  delete state.planInvalidation;
  writeFileSync(seed.statePath, `${JSON.stringify(state, null, 2)}\n`);
  assert.equal(classifyOnboardingContinuity({ rootDir: seed.root }).status, "unavailable",
    "without the recorded reopening, the same edited bytes must still invalidate the binding");
});

check("promotion refuses a plan that is the Spec, a plan that is not a prd_*.md, and a noncanonical Spec", () => {
  const seed = promotionSeed("plan-subject");
  expectKickoffError("KICKOFF-PROMOTION-PLAN-IS-SPEC", () => planOnboardingKickoffPromotion({
    ...seed.request, planPath: seed.request.specPath,
  }));
  writeFileSync(promotedArtifact(seed, "plan.md"), "# not the PRD\n");
  expectKickoffError("KICKOFF-PROMOTION-PLAN-NOT-PRD", () => planOnboardingKickoffPromotion({
    ...seed.request, planPath: "specs/promoted/plan.md",
  }));
  writeFileSync(promotedArtifact(seed, "prd.md"), "# misnamed PRD\n");
  expectKickoffError("KICKOFF-PROMOTION-PLAN-NOT-PRD", () => planOnboardingKickoffPromotion({
    ...seed.request, planPath: "specs/promoted/prd.md", prdPath: "specs/promoted/prd.md",
  }));
  writeFileSync(promotedArtifact(seed, "technical.md"), "# misnamed Spec\n");
  expectKickoffError("KICKOFF-PROMOTION-SPEC-NOT-CANONICAL", () => planOnboardingKickoffPromotion({
    ...seed.request, specPath: "specs/promoted/technical.md",
  }));
  assert.equal(classifyOnboardingContinuity({ rootDir: seed.root }).status, "valid");
});

// A feature id that passes the permissive SAFE_FEATURE_ID check used broadly
// across this file can still be rejected much later, at push/signing time, by
// po-human-approval.mjs's stricter `^[a-z][a-z0-9-]{0,63}$` (and the same
// shape re-applied by every approval/proof intent builder that takes a
// featureId). Confirmed live 2026-08-10: a session's promoted feature id was
// only discovered invalid at the push ceremony, hours after promotion fixed
// it. Promotion must refuse it at the one point the id is still choosable.
check("promotion refuses a feature id that would later fail push-approval's stricter shape", () => {
  const seed = promotionSeed("feature-id-shape");
  for (const featureId of [
    "Feature-Upper",           // uppercase, permitted by SAFE_FEATURE_ID, not by push-approval
    "feature_underscore",      // underscore
    "feature.dotted",          // period
    "feature:colon",           // colon
    `feature-${"x".repeat(60)}`, // 65+ chars, over push-approval's 64-char cap
  ]) {
    assert.throws(() => planOnboardingKickoffPromotion({ ...seed.request, featureId }),
      (error) => error?.code === "KICKOFF-PROMOTION-INPUT"
        && error.message.includes("must be lowercase alphanumeric with hyphens")
        && error.message.includes("push-approval"),
      `expected featureId ${JSON.stringify(featureId)} to be refused with the stricter downstream message`);
  }
  // The kickoff- prefix rejection is a distinct reason and must still fire
  // unchanged, before the new stricter check ever gets to run its own message.
  expectKickoffError("KICKOFF-PROMOTION-INPUT", () => planOnboardingKickoffPromotion({
    ...seed.request, featureId: "kickoff-still-rejected",
  }));
  assert.throws(() => planOnboardingKickoffPromotion({ ...seed.request, featureId: "kickoff-still-rejected" }),
    (error) => error?.code === "KICKOFF-PROMOTION-INPUT" && error.message === "promotion feature id is invalid",
    "the kickoff- prefix rejection must keep its own undifferentiated message, not the new stricter one");
  // An ordinary lowercase-hyphenated feature id under 64 chars is unaffected --
  // no regression for the common case (this is exactly what promotionSeed's
  // own `feature-${name}` ids already are, exercised by every other check
  // in this file, but assert it once here directly against the new code path).
  const plan = planOnboardingKickoffPromotion(seed.request);
  assert.equal(plan.feature.id, seed.request.featureId);
});

// A1-PROMOGATE: `kickoff promote plan` must refuse a PRD the PO plan gate
// (po-gate-authority.mjs) will reject anyway, before anything is frozen --
// naming the exact line and digest to add, not just a generic authority
// refusal. The marker grammars come from po-gate-authority.mjs itself, so
// these fixtures use the identical `<!-- ... -->` shapes the gate parses.

check("promotion refuses a PRD without the technical Spec marker, naming the exact digest to add", () => {
  const seed = promotionSeed("spec-marker-missing");
  const path = promotedArtifact(seed, "prd_promoted.md");
  const specSha256 = digest(readFileSync(promotedArtifact(seed, "spec.md")));
  writeFileSync(path, readFileSync(path, "utf8").split("\n")
    .filter((line) => !line.startsWith("<!-- technical-spec-sha256:")).join("\n"));
  assert.throws(() => planOnboardingKickoffPromotion(seed.request),
    (error) => error?.code === "KICKOFF-PROMOTION-PRD-SPEC-MARKER-MISSING" && error.message.includes(specSha256));
});

check("promotion refuses a PRD carrying more than one technical Spec marker, with the same missing-marker code", () => {
  const seed = promotionSeed("spec-marker-duplicate");
  const path = promotedArtifact(seed, "prd_promoted.md");
  const original = readFileSync(path, "utf8");
  const markerLine = original.split("\n").find((line) => line.startsWith("<!-- technical-spec-sha256:"));
  writeFileSync(path, `${markerLine}\n${original}`);
  assert.throws(() => planOnboardingKickoffPromotion(seed.request),
    (error) => error?.code === "KICKOFF-PROMOTION-PRD-SPEC-MARKER-MISSING");
});

check("promotion refuses a PRD whose technical Spec marker disagrees with the neighboring spec.md, with a distinct code", () => {
  const seed = promotionSeed("spec-marker-mismatch");
  const path = promotedArtifact(seed, "prd_promoted.md");
  // A RegExp() string constructor, not a regex literal: semgrep's parser has a
  // known PartialParsing false positive on regex literals containing
  // `<!--`/`-->` (2026-08-19, found by a Verify run, unrelated to any product
  // defect).
  writeFileSync(path, readFileSync(path, "utf8").replace(
    new RegExp("<!-- technical-spec-sha256: [0-9a-f]{64} -->", "u"),
    `<!-- technical-spec-sha256: ${"a".repeat(64)} -->`,
  ));
  assert.throws(() => planOnboardingKickoffPromotion(seed.request),
    (error) => error?.code === "KICKOFF-PROMOTION-PRD-SPEC-MARKER-MISMATCH");
});

check("promotion refuses a PRD without the PO plan acknowledgement marker (NVA-W4-2B)", () => {
  const seed = promotionSeed("acknowledgement-marker-missing");
  const path = promotedArtifact(seed, "prd_promoted.md");
  writeFileSync(path, readFileSync(path, "utf8").split("\n")
    .filter((line) => !line.startsWith("<!-- po-plan-acknowledged:")).join("\n"));
  assert.throws(() => planOnboardingKickoffPromotion(seed.request),
    (error) => error?.code === "KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING");
});

check("promotion refuses a PRD carrying more than one PO plan acknowledgement marker, with the same missing-marker code (NVA-W4-2B)", () => {
  const seed = promotionSeed("acknowledgement-marker-duplicate");
  const path = promotedArtifact(seed, "prd_promoted.md");
  const original = readFileSync(path, "utf8");
  const markerLine = original.split("\n").find((line) => line.startsWith("<!-- po-plan-acknowledged:"));
  writeFileSync(path, `${markerLine}\n${original}`);
  assert.throws(() => planOnboardingKickoffPromotion(seed.request),
    (error) => error?.code === "KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING");
});

check("promotion refuses a PRD carrying no po-language marker, or one whose value is not in the supported set", () => {
  const missing = promotionSeed("language-marker-missing");
  const missingPath = promotedArtifact(missing, "prd_promoted.md");
  writeFileSync(missingPath, readFileSync(missingPath, "utf8").split("\n")
    .filter((line) => !line.startsWith("<!-- po-language:")).join("\n"));
  assert.throws(() => planOnboardingKickoffPromotion(missing.request),
    (error) => error?.code === "KICKOFF-PROMOTION-PRD-LANGUAGE-MARKER-INVALID");

  const unsupported = promotionSeed("language-marker-unsupported");
  const unsupportedPath = promotedArtifact(unsupported, "prd_promoted.md");
  writeFileSync(unsupportedPath, readFileSync(unsupportedPath, "utf8")
    .replace("<!-- po-language: en -->", "<!-- po-language: eng -->"));
  assert.throws(() => planOnboardingKickoffPromotion(unsupported.request),
    (error) => error?.code === "KICKOFF-PROMOTION-PRD-LANGUAGE-MARKER-INVALID");
});

check("promote apply independently refuses a PRD that lost its technical Spec marker after plan", () => {
  const seed = promotionSeed("apply-marker-missing");
  const plan = planOnboardingKickoffPromotion(seed.request);
  const path = promotedArtifact(seed, "prd_promoted.md");
  writeFileSync(path, readFileSync(path, "utf8").split("\n")
    .filter((line) => !line.startsWith("<!-- technical-spec-sha256:")).join("\n"));
  assert.throws(() => applyOnboardingKickoffPromotion({ plan, expectedPlanSha256: plan.planSha256, activate: true }),
    (error) => error?.code === "KICKOFF-PROMOTION-PRD-SPEC-MARKER-MISSING");
});

check("promotion admits a PRD carrying both correct po-gate markers exactly as before", () => {
  const seed = promotionSeed("markers-valid");
  const plan = planOnboardingKickoffPromotion(seed.request);
  assert.equal(plan.authority.prd.sha256, digest(readFileSync(promotedArtifact(seed, "prd_promoted.md"))));
  const applied = applyOnboardingKickoffPromotion({ plan, expectedPlanSha256: plan.planSha256, activate: true });
  assert.equal(applied.status, "applied");
});

check("promotion admits a PRD carrying a document-language marker outside {de, en} and records it separately from the operator-facing language", () => {
  const seed = promotionSeed("language-document-fr", { poLanguage: "fr" });
  const before = JSON.parse(readFileSync(seed.statePath, "utf8"));
  const beforeHumanFacing = before.continuity.runtime.humanFacingLanguage;
  promote(seed);
  const promoted = JSON.parse(readFileSync(seed.statePath, "utf8"));
  assert.equal(promoted.continuity.runtime.documentLanguage, "fr");
  assert.equal(promoted.continuity.runtime.humanFacingLanguage, beforeHumanFacing,
    "a non-de/en document-language marker must not touch the operator-facing language");
  assert.equal(classifyOnboardingContinuity({ rootDir: seed.root }).status, "valid");
});

function publishPoGateProfile(root) {
  const gitCommonDir = join(root, ".git");
  writeFileSync(join(root, "pipeline.user.yaml"),
    "schema: pipeline.user.v1\nlanguage:\n  human_facing: en\n  agent_facing: en\n");
  // Layout-aware: `resolveProjectAuthorityPaths` (via poGateProfileProjectionPaths)
  // resolves the runtime manifest to `.claude/pipeline.yaml` for a legacy fixture
  // and `project/pipeline.yaml` for a neutral one -- writing unconditionally to
  // `.claude/pipeline.yaml` left a neutral-layout caller's receipt bound to bytes
  // `validatePoGateAuthority`'s own readProjection() never reads back, which
  // resolves as PO-PROFILE-RECEIPT-STALE rather than a real profile mismatch.
  const { manifest } = poGateProfileProjectionPaths(root);
  const manifestAbsolute = join(root, manifest);
  mkdirSync(dirname(manifestAbsolute), { recursive: true });
  writeFileSync(manifestAbsolute, "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: en\n");
  const receipt = createPoGateProfileReceipt({
    repositoryFingerprint: derivePoGateRepositoryFingerprint({ gitCommonDir, primaryRoot: root }),
    primaryRoot: root,
    sourceBytes: readFileSync(join(root, "pipeline.user.yaml")),
    runtimeBytes: readFileSync(manifestAbsolute),
    updatedAt: "2026-08-08T00:00:00.000Z",
  });
  const path = poGateProfileReceiptPath(gitCommonDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializePoGateProfileReceipt(receipt));
  chmodSync(path, 0o600);
  return {
    repoRoot: root,
    gitCommonDir,
    primaryRoot: root,
    registeredWorktreeRoots: [root],
  };
}

// Seeds only the two source files `ensureLocalPromotionPoProfileReceipt`
// reads (pipeline.user.yaml and the runtime manifest) -- deliberately NOT the
// receipt itself, unlike `publishPoGateProfile` above. These two files are
// what the real onboarding flow seeds early (apply-portable-seed), well
// before any promotion runs; the receipt is what promotion apply is supposed
// to publish on its own once they are present.
function seedPoGateProfileFiles(root) {
  writeFileSync(join(root, "pipeline.user.yaml"),
    "schema: pipeline.user.v1\nlanguage:\n  human_facing: en\n  agent_facing: en\n");
  const { manifest } = poGateProfileProjectionPaths(root);
  const manifestAbsolute = join(root, manifest);
  mkdirSync(dirname(manifestAbsolute), { recursive: true });
  writeFileSync(manifestAbsolute, "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: en\n");
}

check("a promoted feature satisfies the PO plan gate and its evidence names PRD and Spec alike", () => {
  const seed = promotionSeed("po-gate");
  const plan = promote(seed);
  const topology = publishPoGateProfile(seed.root);
  const authority = validatePoGateAuthority({
    ...topology,
    expectedPlanSha256: plan.authority.prd.sha256,
    expectedSpecSha256: plan.authority.spec.sha256,
  });
  assert.equal(authority.ok, true, JSON.stringify(authority));
  assert.equal(authority.code, "PO-GATE-AUTHORITY-VALID");
  assert.equal(authority.value.planPath, plan.authority.prd.path);
  assert.equal(authority.value.planSha256, plan.authority.prd.sha256);
  assert.equal(authority.value.specPath, plan.authority.spec.path);
  assert.equal(authority.value.specSha256, plan.authority.spec.sha256);
});

check("a legacy promotion whose planPath is the Spec stays readable and is refused a new promotion", () => {
  const seed = promotionSeed("legacy-plan-is-spec");
  promote(seed);
  const historyPath = promotionHistoryPath(seed.root);
  const history = JSON.parse(readFileSync(historyPath, "utf8"));
  const state = JSON.parse(readFileSync(seed.statePath, "utf8"));
  state.activeFeature.planPath = seed.request.specPath;
  writeFileSync(seed.statePath, `${JSON.stringify(state, null, 2)}\n`);
  history.transactions[1].planPath = seed.request.specPath;
  delete history.transactions[1].specPath;
  history.transactions[1].afterStateSha256 = digest(readFileSync(seed.statePath));
  writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`, { mode: 0o600 });
  // Tolerated read-only: an honest older record stays readable, and no reader
  // crashes on it.  It simply cannot pass the PO plan gate, which is the state
  // it was already in, and a rebind is the way out.
  assert.equal(classifyOnboardingContinuity({ rootDir: seed.root }).status, "valid");
  const topology = publishPoGateProfile(seed.root);
  const authority = validatePoGateAuthority(topology);
  assert.equal(authority.ok, false);
  assert.equal(authority.code, "PO-GATE-ACTIVE-FEATURE-INVALID");
  expectKickoffError("KICKOFF-PROMOTION-PLAN-IS-SPEC", () => planOnboardingKickoffPromotion({
    ...seed.request, planPath: seed.request.specPath,
  }));
});

// RUNNERNEUT-1 direction 2: the shared construction site for a plan-bound
// apply action (`planBoundApplyAction`) requires the runner as a formal
// argument, not a default, so a caller that forgets to thread it through
// fails at plan-construction time. Exercised through the public plan
// builders -- with an explicit empty runner, bypassing the "codex" default
// the way a caller that genuinely lost the identity would -- rather than by
// reaching into the private helper directly.
check("a plan-bound apply action cannot be constructed without the runner its plan was made under", () => {
  const root = fixture("runner-required-kickoff");
  expectKickoffError("APPLY-ACTION-RUNNER-REQUIRED", () => planOnboardingKickoff({
    rootDir: root, goal: "Runner is required at construction", runner: "",
  }));
  const seed = promotionSeed("runner-required-promotion");
  expectKickoffError("APPLY-ACTION-RUNNER-REQUIRED", () => planOnboardingKickoffPromotion({
    ...seed.request, runner: "",
  }));
});

// RUNNERNEUT-1 direction 3: an enumerating check over every plan-producing
// entry point in this module, discovered from the module's own exports
// rather than named twice. A name matched by the naming pattern below that
// has neither a fixture in the table nor a documented exemption fails this
// check by construction -- so a new kickoff/promotion plan builder that
// forgets to carry the runner into its resolved apply action goes red here,
// not in someone's fresh project.
const KICKOFF_PLAN_BUILDER_PATTERN = /^export function ((?:plan|reconstruct)OnboardingKickoff\w*)\(/gmu;
const KICKOFF_PLAN_BUILDER_EXEMPT = new Set([
  // Recovers a private session-cleanup binding after a kickoff promotion by
  // re-invoking the session-cleanup script, not the onboarding-script CLI;
  // that script has no runner concept at all (RUNNERNEUT-1 direction 4 sweep,
  // 2026-08-08). Matched by the naming pattern above, so it is exempted here
  // by name with its reason on record, rather than silently excluded.
  "planOnboardingKickoffPromotionCleanupRecovery",
]);

function assertActionCarriesRunner(action, runner) {
  assert.equal(action.kind, "command");
  const index = action.argv.indexOf("--runner");
  assert.notEqual(index, -1, "resolved action argv is missing --runner");
  assert.equal(action.argv[index + 1], runner);
}

check("every kickoff/promotion plan builder carries its runner into the resolved apply action (enumerating)", () => {
  const modulePath = fileURLToPath(new URL("./onboarding-continuity.mjs", import.meta.url));
  const source = readFileSync(modulePath, "utf8");
  const discovered = [...source.matchAll(KICKOFF_PLAN_BUILDER_PATTERN)]
    .map((match) => match[1])
    .filter((name) => !KICKOFF_PLAN_BUILDER_EXEMPT.has(name));

  const runner = "claude";
  const fixtures = {
    planOnboardingKickoff: () => {
      const root = fixture("enumerate-kickoff-plan");
      return planOnboardingKickoff({ rootDir: root, goal: "Enumerate the kickoff plan", runner });
    },
    reconstructOnboardingKickoffPlan: () => {
      const root = fixture("enumerate-kickoff-reconstruct");
      const goal = "Enumerate the kickoff reconstruction";
      const plan = planOnboardingKickoff({ rootDir: root, goal, runner });
      applyOnboardingKickoff({ plan, expectedPlanSha256: plan.planSha256, activate: true });
      return reconstructOnboardingKickoffPlan({ rootDir: root, goal, runner });
    },
    planOnboardingKickoffPromotion: () => {
      const seed = promotionSeed("enumerate-promotion-plan");
      return planOnboardingKickoffPromotion({ ...seed.request, runner });
    },
    reconstructOnboardingKickoffPromotionPlan: () => {
      const seed = promotionSeed("enumerate-promotion-reconstruct");
      const request = { ...seed.request, runner };
      const plan = planOnboardingKickoffPromotion(request);
      applyOnboardingKickoffPromotion({ plan, expectedPlanSha256: plan.planSha256, activate: true });
      return reconstructOnboardingKickoffPromotionPlan(request);
    },
  };

  assert.deepEqual(
    [...discovered].sort(),
    Object.keys(fixtures).sort(),
    "a plan-producing entry point was added, removed, or renamed without updating this enumerating check",
  );

  for (const name of discovered) {
    const plan = fixtures[name]();
    assertActionCarriesRunner(plan.applyAction, runner);
  }
});

// ---- GF-090: nextActionSection / replaceNextActionSection / syncStateMdNextAction ------

const NEXT_ACTION_AUTHORITY = {
  schema: "pipeline.po-gate-authority.v2",
  humanFacing: "en",
  sourceSha256: "a".repeat(64),
  runtimeSha256: "b".repeat(64),
  receiptSha256: "c".repeat(64),
  repositoryFingerprint: "d".repeat(64),
  planPath: "specs/demo/prd.md",
  planSha256: "e".repeat(64),
  specPath: "specs/demo/spec.md",
  specSha256: "f".repeat(64),
};

function nextActionSubmissionFixture(overrides = {}) {
  return {
    schema: "pipeline.plan-submission.v1",
    featureId: "demo-feature",
    planPath: NEXT_ACTION_AUTHORITY.planPath,
    planSha256: NEXT_ACTION_AUTHORITY.planSha256,
    specPath: NEXT_ACTION_AUTHORITY.specPath,
    specSha256: NEXT_ACTION_AUTHORITY.specSha256,
    profile: "feature",
    profileSha256: "1".repeat(64),
    submittedBy: "coordinator",
    submittedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function nextActionApprovalFixture(submission, overrides = {}) {
  return {
    schema: "pipeline.plan-approval.v4",
    approvedBy: "po-test",
    approvedAt: "2026-08-10T01:00:00.000Z",
    submissionSha256: sha256CanonicalJson(submission),
    profileSha256: submission.profileSha256,
    poGateAuthority: NEXT_ACTION_AUTHORITY,
    priorInvalidationSha256: null,
    ...overrides,
  };
}

function nextActionStateFixture(overrides = {}) {
  return {
    schema: "pipeline.state.v0",
    activeFeature: { id: "demo-feature", planPath: NEXT_ACTION_AUTHORITY.planPath, phase: "design" },
    planApproved: false,
    ...overrides,
  };
}

check("nextActionSection: no active feature renders the set-feature action", () => {
  const text = nextActionSection({ schema: "pipeline.state.v0" });
  assert.match(text, /^## Next action\n\n/);
  assert.match(text, /pipeline-state set-feature --id/);
});

check("nextActionSection: a closed feature (activeFeature removed) renders the same set-feature action", () => {
  const text = nextActionSection({
    schema: "pipeline.state.v0",
    planApproved: false,
    closedFeatures: [{
      id: "demo", planPath: "specs/demo/prd.md", phaseAtClose: "implementation",
      closedAt: "2026-08-10T00:00:00.000Z", closedBy: "po", forCommit: null,
    }],
  });
  assert.match(text, /pipeline-state set-feature --id/);
});

check("nextActionSection: draft (no submission yet) renders submit-plan", () => {
  const text = nextActionSection(nextActionStateFixture());
  assert.match(text, /pipeline-state submit-plan --by/);
  assert.doesNotMatch(text, /approve-plan/);
});

check("nextActionSection: awaiting-approval (submitted, not yet approved) renders approve-plan", () => {
  const submission = nextActionSubmissionFixture();
  const text = nextActionSection(nextActionStateFixture({ planSubmission: submission }));
  assert.match(text, /pipeline-state approve-plan --by/);
  assert.doesNotMatch(text, /submit-plan/);
});

check("nextActionSection: approved but still in design phase renders set-phase implementation", () => {
  const submission = nextActionSubmissionFixture();
  const approval = nextActionApprovalFixture(submission);
  const text = nextActionSection(nextActionStateFixture({
    planSubmission: submission, planApproval: approval, planApproved: true,
  }));
  assert.match(text, /pipeline-state set-phase --phase implementation/);
});

check("nextActionSection: implementing (phase switched) renders the proceed-with-implementation text", () => {
  const submission = nextActionSubmissionFixture();
  const approval = nextActionApprovalFixture(submission);
  const text = nextActionSection(nextActionStateFixture({
    activeFeature: { id: "demo-feature", planPath: NEXT_ACTION_AUTHORITY.planPath, phase: "implementation" },
    planSubmission: submission, planApproval: approval, planApproved: true,
  }));
  assert.match(text, /in implementation/);
  assert.match(text, /pipeline-state reopen-design --by/);
});

check("nextActionSection: a contradictory state (planApproved true, no approval on record) fails closed to the live-source fallback", () => {
  const text = nextActionSection(nextActionStateFixture({ planApproved: true }));
  assert.match(text, /could not be classified/);
  assert.match(text, /project\/pipeline-state\.json/);
  // The exact defect this fix closes: never claim the plan still needs
  // submitting while the recorded state says it is already approved.
  assert.doesNotMatch(text, /submit-plan/);
});

check("nextActionSection: a malformed state (unrecognized schema) never throws and falls back to the live-source text", () => {
  const text = nextActionSection({ schema: "not-a-real-schema" });
  assert.match(text, /could not be classified/);
});

check("nextActionSection does not mutate its input state object", () => {
  const submission = nextActionSubmissionFixture();
  const state = nextActionStateFixture({ planSubmission: submission });
  const before = JSON.stringify(state);
  nextActionSection(state);
  assert.equal(JSON.stringify(state), before);
});

check("replaceNextActionSection: replaces only the Next-action span; another heading follows", () => {
  const original = [
    "# Project state", "", "## Goal", "", "Ship the thing.", "",
    "## Current state", "", "Feature `x` is active.", "",
    "## Next action", "", "OLD TEXT.", "",
    "## Trailer", "", "Untouched.", "",
  ].join("\n");
  const replacement = "## Next action\n\nNEW TEXT.\n";
  const updated = replaceNextActionSection(original, replacement);
  assert.ok(updated.includes("## Goal\n\nShip the thing.\n\n## Current state"));
  assert.ok(updated.includes("NEW TEXT."));
  assert.ok(!updated.includes("OLD TEXT"));
  assert.ok(updated.includes("## Trailer\n\nUntouched.\n"));
});

check("replaceNextActionSection: Next action is the last section (EOF); trailing newline preserved", () => {
  const original = "# Project state\n\n## Next action\n\nOLD.\n";
  const replacement = "## Next action\n\nNEW.\n";
  const updated = replaceNextActionSection(original, replacement);
  assert.equal(updated, "# Project state\n\n## Next action\n\nNEW.\n");
});

check("replaceNextActionSection: returns null (fail closed) when no '## Next action' heading exists", () => {
  const original = "# Project state\n\n## Something else\n\nbody\n";
  assert.equal(replaceNextActionSection(original, "## Next action\n\nNEW.\n"), null);
});

check("replaceNextActionSection: returns null on non-string input rather than throwing", () => {
  assert.equal(replaceNextActionSection(null, "## Next action\n\nNEW.\n"), null);
  assert.equal(replaceNextActionSection("markdown", null), null);
});

check("syncStateMdNextAction: rewrites docs/state.md's Next action section in place", () => {
  const root = mkdtempTestScratch("gf090-sync-");
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs", "state.md"), [
    "# Project state", "", "## Goal", "", "Ship it.", "",
    "## Current state", "", "Feature `demo` is active.", "",
    "## Next action", "", "Review the goal and establish the initial PRD and technical specification.", "",
  ].join("\n"));
  const result = syncStateMdNextAction(root, nextActionStateFixture());
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  const rewritten = readFileSync(join(root, "docs", "state.md"), "utf8");
  assert.match(rewritten, /## Goal\n\nShip it\./);
  assert.match(rewritten, /pipeline-state submit-plan --by/);
});

check("syncStateMdNextAction: fails closed (no write) when docs/state.md is absent", () => {
  const root = mkdtempTestScratch("gf090-sync-absent-");
  const result = syncStateMdNextAction(root, nextActionStateFixture());
  assert.equal(result.ok, false);
  assert.ok(!existsSync(join(root, "docs", "state.md")));
});

check("syncStateMdNextAction: fails closed (no corruption) when no '## Next action' heading exists", () => {
  const root = mkdtempTestScratch("gf090-sync-noheading-");
  mkdirSync(join(root, "docs"), { recursive: true });
  const original = "# Project state\n\n## Hand-edited section\n\nsomething else\n";
  writeFileSync(join(root, "docs", "state.md"), original);
  const result = syncStateMdNextAction(root, nextActionStateFixture());
  assert.equal(result.ok, false);
  assert.equal(readFileSync(join(root, "docs", "state.md"), "utf8"), original);
});

check("syncStateMdNextAction: resyncs a calibration-configured handover path, not docs/state.md", () => {
  const root = fixture("sync-custom-handover", { handover: "notes/project state.md" });
  mkdirSync(join(root, "notes"), { recursive: true });
  writeFileSync(join(root, "notes", "project state.md"), [
    "# Project state", "", "## Goal", "", "Ship it.", "",
    "## Next action", "", "Review the goal and establish the initial PRD and technical specification.", "",
  ].join("\n"));
  const result = syncStateMdNextAction(root, nextActionStateFixture());
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  const rewritten = readFileSync(join(root, "notes", "project state.md"), "utf8");
  assert.match(rewritten, /pipeline-state submit-plan --by/);
  assert.ok(!existsSync(join(root, "docs", "state.md")),
    "the sync must not fall back to writing docs/state.md when a custom handover is configured");
});

check("syncStateMdNextAction: resyncs an object-shaped ({ path, maxBytes }) calibration-configured handover", () => {
  const root = fixture("sync-object-handover", { handover: { path: "notes/project state.md", maxBytes: 30000 } });
  mkdirSync(join(root, "notes"), { recursive: true });
  writeFileSync(join(root, "notes", "project state.md"), [
    "# Project state", "", "## Goal", "", "Ship it.", "",
    "## Next action", "", "Review the goal and establish the initial PRD and technical specification.", "",
  ].join("\n"));
  const result = syncStateMdNextAction(root, nextActionStateFixture());
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  const rewritten = readFileSync(join(root, "notes", "project state.md"), "utf8");
  assert.match(rewritten, /pipeline-state submit-plan --by/);
  assert.ok(!existsSync(join(root, "docs", "state.md")),
    "the sync must not fall back to writing docs/state.md when an object-shaped handover is configured");
});

check("syncStateMdNextAction: is a no-op write when the rendered text already matches", () => {
  const state = nextActionStateFixture();
  const section = nextActionSection(state);
  const root = mkdtempTestScratch("gf090-sync-noop-");
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs", "state.md"), `# Project state\n\n${section}`);
  const result = syncStateMdNextAction(root, state);
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
});

// ---------------------------------------------------------------------------
// Intake checkpoint (Wave 4 onboarding coordinator, steps 1-3 -- NVA-W4-COORD-1
// Batch A: happy-path / precondition-and-error-path / idempotency coverage
// for the three step-1/2/3 apply functions, plus one validateIntakeCheckpoint
// round-trip test (validateIntakeCheckpoint itself is not exported; exercised
// indirectly through readOnboardingIntakeCheckpoint, which calls it on every
// read). Batch B (crash-injection at each fault point + the CAS-drift test)
// is a separate follow-up dispatch, deliberately not attempted here.

function expectIntakeError(code, fn) {
  assert.throws(fn, (error) => error?.code === code);
}

function grantIntakeConsent(root) {
  return applyOnboardingIntakeConsent({ rootDir: root, granted: true, activate: true });
}

function captureIntakeMaterial(root) {
  grantIntakeConsent(root);
  return applyOnboardingIntakeCapture({ rootDir: root, text: "requirement material", activate: true });
}

check("intake checkpoint: validateIntakeCheckpoint round-trips through readOnboardingIntakeCheckpoint", () => {
  const root = fixture("intake-validate-roundtrip");
  const applied = applyOnboardingIntakeConsent({
    rootDir: root,
    granted: true,
    gitAuthor: { name: "Jane PO", email: "jane@example.com" },
    language: "en",
    profile: "feature",
    activate: true,
  });
  assert.equal(applied.schema, INTAKE_CONSENT_APPLY_SCHEMA);
  assert.equal(applied.mutated, true);
  const observed = readOnboardingIntakeCheckpoint({ rootDir: root });
  assert.equal(observed.status, "present");
  assert.equal(observed.value.schema, INTAKE_CHECKPOINT_SCHEMA);
  assert.equal(observed.value.revision, 0);
  assert.equal(observed.value.transactionState, "collecting");
  assert.deepEqual(observed.value.consent, { granted: true, at: observed.value.createdAt });
  assert.deepEqual(observed.value.values, {
    gitAuthor: { name: "Jane PO", email: "jane@example.com" },
    language: "en",
    profile: "feature",
  });

  const paths = resolveIntakeCheckpointPaths({ rootDir: root });
  const tampered = JSON.parse(readFileSync(paths.checkpoint, "utf8"));
  tampered.revision = 7; // contentSha256 now stale -- self-digest must catch this
  writeFileSync(paths.checkpoint, `${JSON.stringify(tampered, null, 2)}\n`);
  expectIntakeError("INTAKE-CHECKPOINT-MALFORMED", () => readOnboardingIntakeCheckpoint({ rootDir: root }));
});

check("applyOnboardingIntakeConsent: happy path grants consent and fills all three values in one bundled ask", () => {
  const root = fixture("intake-consent-happy");
  const result = applyOnboardingIntakeConsent({
    rootDir: root,
    granted: true,
    gitAuthor: { name: "A B", email: "a@b.example" },
    language: "de",
    profile: "mini",
    activate: true,
  });
  assert.equal(result.schema, INTAKE_CONSENT_APPLY_SCHEMA);
  assert.equal(result.mutated, true);
  assert.equal(result.checkpoint.consent.granted, true);
  assert.deepEqual(result.checkpoint.values, {
    gitAuthor: { name: "A B", email: "a@b.example" },
    language: "de",
    profile: "mini",
  });
});

check("applyOnboardingIntakeConsent: activation is required", () => {
  const root = fixture("intake-consent-activation");
  expectIntakeError("INTAKE-CONSENT-ACTIVATION-REQUIRED", () => applyOnboardingIntakeConsent({
    rootDir: root, granted: true, activate: false,
  }));
});

check("applyOnboardingIntakeConsent: requires explicit affirmative consent", () => {
  const root = fixture("intake-consent-required");
  expectIntakeError("INTAKE-CONSENT-REQUIRED", () => applyOnboardingIntakeConsent({
    rootDir: root, granted: false, activate: true,
  }));
});

check("applyOnboardingIntakeConsent: rejects an invalid candidate git author", () => {
  const root = fixture("intake-consent-bad-author");
  expectIntakeError("INTAKE-CONSENT-INVALID-GIT-AUTHOR", () => applyOnboardingIntakeConsent({
    rootDir: root, granted: true, gitAuthor: { name: "", email: "a@b.example" }, activate: true,
  }));
});

check("applyOnboardingIntakeConsent: rejects an invalid candidate language", () => {
  const root = fixture("intake-consent-bad-language");
  expectIntakeError("INTAKE-CONSENT-INVALID-LANGUAGE", () => applyOnboardingIntakeConsent({
    rootDir: root, granted: true, language: "fr", activate: true,
  }));
});

check("applyOnboardingIntakeConsent: rejects an invalid candidate profile", () => {
  const root = fixture("intake-consent-bad-profile");
  expectIntakeError("INTAKE-CONSENT-INVALID-PROFILE", () => applyOnboardingIntakeConsent({
    rootDir: root, granted: true, profile: "huge", activate: true,
  }));
});

check("applyOnboardingIntakeConsent: idempotent re-run only fills fields still null, never overwrites an answered one", () => {
  const root = fixture("intake-consent-idempotent");
  const first = applyOnboardingIntakeConsent({
    rootDir: root, granted: true, gitAuthor: { name: "First", email: "first@example.com" }, activate: true,
  });
  assert.equal(first.mutated, true);
  assert.equal(first.checkpoint.values.language, null);
  assert.equal(first.checkpoint.values.profile, null);

  const second = applyOnboardingIntakeConsent({
    rootDir: root,
    granted: true,
    gitAuthor: { name: "Second", email: "second@example.com" }, // already answered -- must be ignored
    language: "en",
    profile: "epic",
    activate: true,
  });
  assert.equal(second.mutated, true);
  assert.deepEqual(second.checkpoint.values, {
    gitAuthor: { name: "First", email: "first@example.com" },
    language: "en",
    profile: "epic",
  });
  assert.equal(second.checkpoint.consent.at, first.checkpoint.consent.at);
  assert.equal(second.checkpoint.revision, first.checkpoint.revision + 1);

  const third = applyOnboardingIntakeConsent({
    rootDir: root,
    granted: true,
    gitAuthor: { name: "Third", email: "third@example.com" },
    language: "de",
    profile: "mini",
    activate: true,
  });
  assert.equal(third.mutated, false, "every field is already answered -- a third call is a true no-op");
  assert.deepEqual(third.checkpoint.values, second.checkpoint.values);
  assert.equal(third.checkpoint.revision, second.checkpoint.revision);
});

check("applyOnboardingIntakeCapture: happy path appends one evidence file and one materialInput entry", () => {
  const root = fixture("intake-capture-happy");
  grantIntakeConsent(root);
  const result = applyOnboardingIntakeCapture({
    rootDir: root, text: "The PO's real requirement text.", activate: true,
  });
  assert.equal(result.schema, INTAKE_CAPTURE_APPLY_SCHEMA);
  assert.equal(result.mutated, true);
  assert.equal(result.checkpoint.materialInput.length, 1);
  const entry = result.checkpoint.materialInput[0];
  assert.equal(entry.evidencePath, `intake-checkpoint-evidence/${entry.sha256}.txt`);
  const paths = resolveIntakeCheckpointPaths({ rootDir: root });
  const evidenceBytes = readFileSync(join(paths.evidenceDirectory, `${entry.sha256}.txt`));
  assert.equal(evidenceBytes.toString("utf8"), "The PO's real requirement text.");
  assert.equal(result.checkpoint.transactionState, "design-questions-pending");
});

check("applyOnboardingIntakeCapture: activation is required", () => {
  const root = fixture("intake-capture-activation");
  grantIntakeConsent(root);
  expectIntakeError("INTAKE-CAPTURE-ACTIVATION-REQUIRED", () => applyOnboardingIntakeCapture({
    rootDir: root, text: "text", activate: false,
  }));
});

check("applyOnboardingIntakeCapture: rejects empty text", () => {
  const root = fixture("intake-capture-empty");
  grantIntakeConsent(root);
  expectIntakeError("INTAKE-CAPTURE-EMPTY", () => applyOnboardingIntakeCapture({
    rootDir: root, text: "", activate: true,
  }));
});

check("applyOnboardingIntakeCapture: rejects a chunk over the per-chunk byte limit", () => {
  const root = fixture("intake-capture-too-large");
  grantIntakeConsent(root);
  expectIntakeError("INTAKE-CAPTURE-TOO-LARGE", () => applyOnboardingIntakeCapture({
    rootDir: root, text: "a".repeat(1_000_001), activate: true,
  }));
});

check("applyOnboardingIntakeCapture: requires consent to already be recorded", () => {
  const root = fixture("intake-capture-consent-required");
  expectIntakeError("INTAKE-CAPTURE-CONSENT-REQUIRED", () => applyOnboardingIntakeCapture({
    rootDir: root, text: "text before consent", activate: true,
  }));
});

check("applyOnboardingIntakeCapture: advances transactionState from collecting to design-questions-pending only on the first capture", () => {
  const root = fixture("intake-capture-transition");
  grantIntakeConsent(root);
  const first = applyOnboardingIntakeCapture({ rootDir: root, text: "chunk one", activate: true });
  assert.equal(first.checkpoint.transactionState, "design-questions-pending");
  const second = applyOnboardingIntakeCapture({ rootDir: root, text: "chunk two", activate: true });
  assert.equal(second.checkpoint.transactionState, "design-questions-pending");
  assert.equal(second.checkpoint.materialInput.length, 2);
});

check("applyOnboardingIntakeCapture: an idempotent duplicate-content capture converges without a second entry", () => {
  const root = fixture("intake-capture-duplicate");
  grantIntakeConsent(root);
  const first = applyOnboardingIntakeCapture({ rootDir: root, text: "same content", activate: true });
  assert.equal(first.mutated, true);
  const second = applyOnboardingIntakeCapture({ rootDir: root, text: "same content", activate: true });
  assert.equal(second.mutated, false);
  assert.equal(second.checkpoint.materialInput.length, 1);
});

// NVA-RESUMEVERBATIM-1: readOnboardingIntakeMaterialInput() is the read-side companion
// scripts/resume-hint.mjs's `inspect` uses to surface the verbatim material input a
// prior `capture` routed into this SAME checkpoint -- resolving each entry's evidence
// blob back to its actual bytes and re-verifying the sha256 that references it.

check("readOnboardingIntakeMaterialInput: absent checkpoint returns status absent and an empty chunk list", () => {
  const root = fixture("intake-material-input-absent");
  const result = readOnboardingIntakeMaterialInput({ rootDir: root });
  assert.equal(result.status, "absent");
  assert.deepEqual(result.chunks, []);
});

check("readOnboardingIntakeMaterialInput: resolves every captured chunk back to its byte-identical text, in capture order", () => {
  const root = fixture("intake-material-input-present");
  grantIntakeConsent(root);
  const first = "Line one of a design brief.\nLine two, multi-line, unbounded by the short-string caps.";
  const second = "A second, later chunk of user input -- unicode: café, 日本語, emoji 🚀.";
  applyOnboardingIntakeCapture({ rootDir: root, text: first, activate: true });
  applyOnboardingIntakeCapture({ rootDir: root, text: second, activate: true });
  const result = readOnboardingIntakeMaterialInput({ rootDir: root });
  assert.equal(result.status, "present");
  assert.equal(result.chunks.length, 2);
  assert.deepEqual(result.chunks.map((chunk) => chunk.text), [first, second]);
  for (const chunk of result.chunks) {
    assert.equal(chunk.sha256, createHash("sha256").update(chunk.text, "utf8").digest("hex"));
    assert.equal(chunk.byteLength, Buffer.byteLength(chunk.text, "utf8"));
    assert.ok(chunk.receivedAt);
  }
});

check("applyOnboardingIntakeDesignQuestions: happy path records the bundled round and flips to ready-to-generate", () => {
  const root = fixture("intake-design-questions-happy");
  captureIntakeMaterial(root);
  const result = applyOnboardingIntakeDesignQuestions({
    rootDir: root,
    answers: [{ question: "What is the primary user?", answer: "Internal operators." }],
    activate: true,
  });
  assert.equal(result.schema, INTAKE_DESIGN_QUESTIONS_APPLY_SCHEMA);
  assert.equal(result.mutated, true);
  assert.equal(result.checkpoint.transactionState, "ready-to-generate");
  assert.equal(result.checkpoint.designQuestions.length, 1);
  assert.equal(result.checkpoint.designQuestions[0].question, "What is the primary user?");
});

check("applyOnboardingIntakeDesignQuestions: activation is required", () => {
  const root = fixture("intake-design-questions-activation");
  captureIntakeMaterial(root);
  expectIntakeError("INTAKE-DESIGN-QUESTIONS-ACTIVATION-REQUIRED", () => applyOnboardingIntakeDesignQuestions({
    rootDir: root, answers: [{ question: "Q", answer: "A" }], activate: false,
  }));
});

check("applyOnboardingIntakeDesignQuestions: rejects an empty answer set", () => {
  const root = fixture("intake-design-questions-empty");
  captureIntakeMaterial(root);
  expectIntakeError("INTAKE-DESIGN-QUESTIONS-EMPTY", () => applyOnboardingIntakeDesignQuestions({
    rootDir: root, answers: [], activate: true,
  }));
});

check("applyOnboardingIntakeDesignQuestions: requires at least one captured material-input chunk first", () => {
  const root = fixture("intake-design-questions-precondition");
  grantIntakeConsent(root);
  expectIntakeError("INTAKE-DESIGN-QUESTIONS-PRECONDITION", () => applyOnboardingIntakeDesignQuestions({
    rootDir: root, answers: [{ question: "Q", answer: "A" }], activate: true,
  }));
});

check("applyOnboardingIntakeDesignQuestions: requires an existing checkpoint at all", () => {
  const root = fixture("intake-design-questions-no-checkpoint");
  expectIntakeError("INTAKE-DESIGN-QUESTIONS-PRECONDITION", () => applyOnboardingIntakeDesignQuestions({
    rootDir: root, answers: [{ question: "Q", answer: "A" }], activate: true,
  }));
});

check("applyOnboardingIntakeDesignQuestions: refuses a different answer set once the round is already answered", () => {
  const root = fixture("intake-design-questions-already-answered");
  captureIntakeMaterial(root);
  applyOnboardingIntakeDesignQuestions({
    rootDir: root, answers: [{ question: "Q1", answer: "A1" }], activate: true,
  });
  expectIntakeError("INTAKE-DESIGN-QUESTIONS-ALREADY-ANSWERED", () => applyOnboardingIntakeDesignQuestions({
    rootDir: root, answers: [{ question: "Q2", answer: "A2" }], activate: true,
  }));
});

check("applyOnboardingIntakeDesignQuestions: an exact replay of the same already-answered round is a no-op", () => {
  const root = fixture("intake-design-questions-replay");
  captureIntakeMaterial(root);
  const answers = [{ question: "Q1", answer: "A1" }];
  const first = applyOnboardingIntakeDesignQuestions({ rootDir: root, answers, activate: true });
  assert.equal(first.mutated, true);
  const replay = applyOnboardingIntakeDesignQuestions({ rootDir: root, answers, activate: true });
  assert.equal(replay.mutated, false);
  assert.equal(replay.checkpoint.transactionState, "ready-to-generate");
  assert.equal(replay.checkpoint.revision, first.checkpoint.revision);
});

// ---------------------------------------------------------------------------
// Intake checkpoint Batch B (NVA-W4-COORD-1 follow-up): crash-injection at
// every fault point stubbed via deps.crashAt in applyIntakeCheckpointMutation
// (the shared single-target CAS writer every step-1/2/3 function goes
// through) and writeIntakeCheckpointEvidence (capture's evidence blob write),
// plus the CAS-drift test. Mirrors the file's own pre-existing
// KICKOFF_FAULT_STAGES "crash at X" pattern above.

// applyIntakeCheckpointMutation's own fault points -- exercised once through
// applyOnboardingIntakeConsent (the simplest single-call vehicle) since the
// fault-injected code is the SHARED writer every step-1/2/3 function calls
// into; the shared logic only needs covering once, not per caller.
const INTAKE_CHECKPOINT_WRITE_FAULT_STAGES = ["cas-recheck", "temp-fsync", "rename", "directory-fsync"];

for (const stage of INTAKE_CHECKPOINT_WRITE_FAULT_STAGES) {
  check(`intake checkpoint write: crash at ${stage} leaves either absent or fully committed content, never torn, and a retry converges`, () => {
    const root = fixture(`intake-checkpoint-crash-${stage.replaceAll(/[^a-z0-9]+/gu, "-")}`);
    expectIntakeError("INTAKE-CHECKPOINT-SIMULATED-CRASH", () => applyOnboardingIntakeConsent({
      rootDir: root, granted: true, language: "en", profile: "feature", activate: true,
      deps: { crashAt: stage },
    }));
    const afterCrash = readOnboardingIntakeCheckpoint({ rootDir: root });
    if (stage === "rename" || stage === "directory-fsync") {
      // renameSync() is atomic: by the time these two fault points fire, the
      // real target already carries the fully valid new content.
      assert.equal(afterCrash.status, "present");
      assert.equal(afterCrash.value.values.language, "en");
      assert.equal(afterCrash.value.values.profile, "feature");
    } else {
      // cas-recheck/temp-fsync fire strictly before the rename -- this is
      // the first-ever write for this root, so the real target must be
      // untouched (absent), never a torn partial file.
      assert.equal(afterCrash.status, "absent");
    }
    // A real crash never releases its writer lock -- prove the retry
    // recovers it through the same stale-lock path the kickoff crash tests
    // use (lockStaleMs: 0, nowMs pushed forward), converging either way.
    const paths = resolveIntakeCheckpointPaths({ rootDir: root });
    assert.equal(existsSync(paths.lock), true);
    const recovered = applyOnboardingIntakeConsent({
      rootDir: root, granted: true, language: "en", profile: "feature", activate: true,
      deps: { lockStaleMs: 0, nowMs: Date.now() + 60_000 },
    });
    assert.equal(recovered.checkpoint.values.language, "en");
    assert.equal(recovered.checkpoint.values.profile, "feature");
    if (stage === "rename" || stage === "directory-fsync") {
      // Narrow, named, non-blocking gap: the crashed write already fully
      // committed (see above), so this identical-values retry is a true
      // no-op that returns from applyIntakeCheckpointMutation's UNLOCKED
      // fast path -- it never touches the lock at all, so the stale lock
      // the crash left behind is NOT cleaned up here. This is not a data-
      // correctness bug (the checkpoint content itself is exactly right,
      // and acquireLock()'s existing same-token/staleness recovery already
      // handles this lock cleanly the next time a call actually has
      // something to write) -- proven below with one such real mutation.
      assert.equal(existsSync(paths.lock), true, "documents the known no-op-retry-never-releases-a-stale-lock gap");
      const nextRealMutation = applyOnboardingIntakeConsent({
        rootDir: root, granted: true, profile: "feature", gitAuthor: { name: "A", email: "a@example.com" }, activate: true,
        deps: { lockStaleMs: 0, nowMs: Date.now() + 120_000 },
      });
      assert.equal(nextRealMutation.mutated, true);
      assert.equal(existsSync(paths.lock), false, "the next call with real work to do does clean up the stale lock");
    } else {
      assert.equal(existsSync(paths.lock), false);
    }
  });
}

// writeIntakeCheckpointEvidence's own fault points -- only reachable through
// applyOnboardingIntakeCapture, and unlocked (content-addressed, no writer
// lock), so recovery here is a plain retry, not a stale-lock recovery.
const INTAKE_EVIDENCE_WRITE_FAULT_STAGES = ["evidence-temp-fsync", "evidence-rename", "evidence-directory-fsync"];

for (const stage of INTAKE_EVIDENCE_WRITE_FAULT_STAGES) {
  check(`intake checkpoint evidence: crash at ${stage} leaves either absent or fully committed evidence bytes, never torn, and a retry converges`, () => {
    const root = fixture(`intake-evidence-crash-${stage.replaceAll(/[^a-z0-9]+/gu, "-")}`);
    grantIntakeConsent(root);
    const text = "material to capture";
    expectIntakeError("INTAKE-CHECKPOINT-SIMULATED-CRASH", () => applyOnboardingIntakeCapture({
      rootDir: root, text, activate: true,
      deps: { crashAt: stage },
    }));
    const paths = resolveIntakeCheckpointPaths({ rootDir: root });
    const evidencePath = join(paths.evidenceDirectory, `${digest(text)}.txt`);
    if (stage === "evidence-rename" || stage === "evidence-directory-fsync") {
      assert.equal(existsSync(evidencePath), true);
      assert.equal(readFileSync(evidencePath, "utf8"), text);
    } else {
      assert.equal(existsSync(evidencePath), false);
    }
    // The checkpoint entry is written only AFTER writeIntakeCheckpointEvidence
    // returns -- a crash inside it never reaches applyIntakeCheckpointMutation
    // at all, so the checkpoint's materialInput must be exactly as before.
    const afterCrash = readOnboardingIntakeCheckpoint({ rootDir: root });
    assert.equal(afterCrash.value.materialInput.length, 0);
    const recovered = applyOnboardingIntakeCapture({ rootDir: root, text, activate: true });
    assert.equal(recovered.mutated, true);
    assert.equal(recovered.checkpoint.materialInput.length, 1);
  });
}

check("intake checkpoint: a preimage that changes between the two observations is refused as CAS drift, not silently overwritten", () => {
  const root = fixture("intake-cas-drift");
  applyOnboardingIntakeConsent({ rootDir: root, granted: true, language: "en", activate: true });
  const paths = resolveIntakeCheckpointPaths({ rootDir: root });
  expectIntakeError("INTAKE-CHECKPOINT-CAS-DRIFT", () => applyOnboardingIntakeConsent({
    rootDir: root, granted: true, profile: "feature", activate: true,
    deps: {
      fault(point) {
        if (point !== "cas-recheck") return;
        // Simulate a concurrent writer changing the checkpoint's raw bytes
        // between this call's own unlocked pre-check and its locked
        // re-observation -- the exact window applyIntakeCheckpointMutation's
        // two-observation CAS discipline exists to close.
        const concurrent = JSON.parse(readFileSync(paths.checkpoint, "utf8"));
        concurrent.values.language = "de";
        writeFileSync(paths.checkpoint, `${JSON.stringify(concurrent, null, 2)}\n`);
      },
    },
  }));
  // Refused, so nothing from the refused call's own attempted write landed --
  // the file must still carry exactly the concurrent writer's content.
  const after = JSON.parse(readFileSync(paths.checkpoint, "utf8"));
  assert.equal(after.values.language, "de");
  assert.equal(after.values.profile, null, "the refused call's own profile candidate must never have been written");
});

// ---------------------------------------------------------------------------
// Intake staging generation (Wave 4 onboarding coordinator, step 4 --
// NVA-W4-COORD-2, design.md SSa.5 point 4 / SSc.2). Happy path, precondition/
// error paths, and idempotent no-op/regeneration coverage for the
// plan/apply pair, plus the SSc.2-mandated crash-injection matrix.

function readyToGenerateRoot(name, text = "requirement material one") {
  const root = fixture(name, { neutral: true });
  applyOnboardingIntakeConsent({ rootDir: root, granted: true, language: "en", profile: "feature", activate: true });
  applyOnboardingIntakeCapture({ rootDir: root, text, activate: true });
  applyOnboardingIntakeDesignQuestions({
    rootDir: root,
    answers: [{ question: "What is the goal?", answer: "Ship the coordinator." }],
    activate: true,
  });
  return root;
}

check("planOnboardingIntakeGenerate / applyOnboardingIntakeGenerate: happy path derives and writes all three staging targets", () => {
  const root = readyToGenerateRoot("intake-generate-happy");
  const plan = planOnboardingIntakeGenerate({ rootDir: root });
  assert.equal(plan.schema, INTAKE_GENERATE_PLAN_SCHEMA);
  assert.match(plan.featureId, /^onboarding-[a-f0-9]{12}$/);
  // NVA-INTAKESPECS-1: the design package is generated straight into specs/<featureId>/, the
  // location ADR-0045 already names, rather than a separate pre-authority holding area.
  assert.equal(intakeDesignDirname(plan.featureId), `specs/${plan.featureId}`);
  assert.equal(plan.targets.designInput.path, `specs/${plan.featureId}/design-input.md`);
  assert.equal(plan.targets.prd.path, `specs/${plan.featureId}/prd_${plan.featureId}.md`);
  assert.equal(plan.targets.spec.path, `specs/${plan.featureId}/spec.md`);

  const applied = applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: plan.planSha256, activate: true });
  assert.equal(applied.schema, INTAKE_GENERATE_APPLY_SCHEMA);
  assert.equal(applied.mutated, true);
  assert.equal(applied.featureId, plan.featureId);
  assert.equal(applied.checkpoint.transactionState, "generated");
  assert.equal(applied.checkpoint.generated.designInputSha256, plan.targets.designInput.afterSha256);

  for (const key of ["designInput", "prd", "spec"]) {
    const absolute = join(root, plan.targets[key].path);
    assert.equal(existsSync(absolute), true);
    assert.equal(digest(readFileSync(absolute, "utf8")), plan.targets[key].afterSha256);
    assert.equal(applied.targets[key].wrote, true);
  }
});

check("planOnboardingIntakeGenerate: publishes a nextAction naming intake-generate-apply with the plan's own digest, so the generic guided driver (onboarding-init.mjs, which reads ONLY nextAction) does not stall here", () => {
  const root = readyToGenerateRoot("intake-generate-next-action");
  const plan = planOnboardingIntakeGenerate({ rootDir: root });
  assert.equal(plan.nextAction.kind, "command");
  assert.equal(plan.nextAction.executable, "node");
  assert.ok(Array.isArray(plan.nextAction.argv));
  assert.ok(plan.nextAction.argv.every((part) => typeof part === "string"));
  assert.equal(plan.nextAction.argv.includes("intake-generate-apply"), true);
  assert.equal(plan.nextAction.argv.includes("--activate"), true);
  // No digest binding is weakened: the published nextAction carries the SAME
  // planSha256 the caller would otherwise have copied by hand -- assert the
  // two actually agree, not merely that a --plan-sha256 flag is present.
  const flagIndex = plan.nextAction.argv.indexOf("--plan-sha256");
  assert.ok(flagIndex >= 0, "nextAction argv must carry --plan-sha256");
  assert.equal(plan.nextAction.argv[flagIndex + 1], plan.planSha256);

  // The published command actually works when run for real, with no field on
  // it invented beyond what applyOnboardingIntakeGenerate itself requires.
  const applied = applyOnboardingIntakeGenerate({
    rootDir: root,
    expectedPlanSha256: plan.nextAction.argv[flagIndex + 1],
    activate: true,
  });
  assert.equal(applied.schema, INTAKE_GENERATE_APPLY_SCHEMA);
  assert.equal(applied.mutated, true);
});

check("applyOnboardingIntakeGenerate: activation is required", () => {
  const root = readyToGenerateRoot("intake-generate-activation");
  const plan = planOnboardingIntakeGenerate({ rootDir: root });
  expectIntakeError("INTAKE-GENERATE-ACTIVATION-REQUIRED", () => applyOnboardingIntakeGenerate({
    rootDir: root, expectedPlanSha256: plan.planSha256,
  }));
});

check("planOnboardingIntakeGenerate: requires an existing checkpoint", () => {
  const root = fixture("intake-generate-no-checkpoint", { neutral: true });
  expectIntakeError("INTAKE-GENERATE-PRECONDITION", () => planOnboardingIntakeGenerate({ rootDir: root }));
});

check("planOnboardingIntakeGenerate: refuses a checkpoint still short of ready-to-generate", () => {
  const root = fixture("intake-generate-not-ready", { neutral: true });
  applyOnboardingIntakeConsent({ rootDir: root, granted: true, activate: true });
  expectIntakeError("INTAKE-GENERATE-PRECONDITION", () => planOnboardingIntakeGenerate({ rootDir: root }));
});

check("applyOnboardingIntakeGenerate: refuses a plan digest mismatch", () => {
  const root = readyToGenerateRoot("intake-generate-digest-mismatch");
  expectIntakeError("INTAKE-GENERATE-PLAN-DIGEST", () => applyOnboardingIntakeGenerate({
    rootDir: root, expectedPlanSha256: "0".repeat(64), activate: true,
  }));
});

check("applyOnboardingIntakeGenerate: creates specs/ itself instead of demanding it, on a root that has neither specs/ nor project/", () => {
  // NVA-INTAKESPECS-1 replaces the former INTAKE-GENERATE-PROJECT-DIRECTORY-MISSING
  // precondition. A greenfield repository legitimately has no specs/ yet, and the very first
  // onboarding is exactly when it must appear -- refusing there would be a dead end on the
  // one path this step exists to serve. The fixture deliberately has no project/ either, so
  // this also pins that the old precondition is genuinely gone rather than merely relocated.
  const root = fixture("intake-generate-no-specs-dir");
  assert.equal(existsSync(join(root, "specs")), false, "fixture must start without specs/");
  assert.equal(existsSync(join(root, "project")), false, "fixture must start without project/");
  applyOnboardingIntakeConsent({ rootDir: root, granted: true, activate: true });
  applyOnboardingIntakeCapture({ rootDir: root, text: "material", activate: true });
  applyOnboardingIntakeDesignQuestions({ rootDir: root, answers: [{ question: "Q?", answer: "A." }], activate: true });
  const plan = planOnboardingIntakeGenerate({ rootDir: root });
  const applied = applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: plan.planSha256, activate: true });
  assert.equal(applied.mutated, true);
  for (const key of ["designInput", "prd", "spec"]) {
    assert.equal(existsSync(join(root, plan.targets[key].path)), true, plan.targets[key].path);
  }
  assert.equal(existsSync(join(root, "project")), false, "generation must not create project/ any more");
});

check("applyOnboardingIntakeGenerate: a re-run against the same checkpoint revision is a true no-op", () => {
  const root = readyToGenerateRoot("intake-generate-noop-replay");
  const plan = planOnboardingIntakeGenerate({ rootDir: root });
  const first = applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: plan.planSha256, activate: true });
  assert.equal(first.mutated, true);
  const replanned = planOnboardingIntakeGenerate({ rootDir: root });
  assert.equal(replanned.planSha256, plan.planSha256, "an unchanged checkpoint must reconstruct the identical plan digest");
  const second = applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: replanned.planSha256, activate: true });
  assert.equal(second.mutated, false);
  assert.equal(second.checkpoint.revision, first.checkpoint.revision);
  for (const key of ["designInput", "prd", "spec"]) {
    assert.equal(second.targets[key].wrote, false, `${key} must not be rewritten on an unchanged replay`);
  }
});

check("applyOnboardingIntakeGenerate: a changed checkpoint safely regenerates with a STABLE featureId", () => {
  const root = readyToGenerateRoot("intake-generate-regenerate");
  const firstPlan = planOnboardingIntakeGenerate({ rootDir: root });
  const first = applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: firstPlan.planSha256, activate: true });
  // Capturing more material after "generated" is structurally permitted
  // (applyOnboardingIntakeCapture does not gate on transactionState beyond
  // the very first capture) -- exactly the case SSc.2 describes as safely
  // regenerable.
  applyOnboardingIntakeCapture({ rootDir: root, text: "a second, later requirement", activate: true });
  const secondPlan = planOnboardingIntakeGenerate({ rootDir: root });
  assert.notEqual(secondPlan.planSha256, firstPlan.planSha256);
  assert.equal(secondPlan.featureId, firstPlan.featureId,
    "featureId must stay stable across regeneration -- otherwise the prior prd_<id>.md is orphaned");
  const second = applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: secondPlan.planSha256, activate: true });
  assert.equal(second.mutated, true);
  assert.notEqual(second.checkpoint.generated.designInputSha256, first.checkpoint.generated.designInputSha256);
  assert.equal(existsSync(join(root, secondPlan.targets.prd.path)), true);
});

// ---------------------------------------------------------------------------
// Intake staging generation crash-injection (NVA-W4-COORD-2, design SSc.2):
// per-target write-if-different is a pure function of the already-durable
// checkpoint, so a crash at any fault point must leave the crashed target
// either absent or fully committed (never torn), and a plain retry (against
// the same still-unmutated checkpoint -- the crashed call never reached the
// checkpoint commit, since staging is written entirely before it) must
// converge to the correct fully-generated state.

const INTAKE_GENERATE_STAGING_KEYS = ["designInput", "prd", "spec"];
const INTAKE_GENERATE_WRITE_FAULT_STAGES = ["temp-fsync", "rename", "directory-fsync"];

for (const key of INTAKE_GENERATE_STAGING_KEYS) {
  for (const stage of INTAKE_GENERATE_WRITE_FAULT_STAGES) {
    check(`intake staging generation: crash at ${key}-${stage} leaves that target either absent or fully committed, never torn, and a retry converges`, () => {
      const root = readyToGenerateRoot(`intake-generate-crash-${key}-${stage}`);
      const plan = planOnboardingIntakeGenerate({ rootDir: root });
      expectIntakeError("INTAKE-GENERATE-SIMULATED-CRASH", () => applyOnboardingIntakeGenerate({
        rootDir: root, expectedPlanSha256: plan.planSha256, activate: true,
        deps: { crashAt: `${key}-${stage}` },
      }));
      const absolute = join(root, plan.targets[key].path);
      if (stage === "rename" || stage === "directory-fsync") {
        // renameSync() is atomic: by the time these two fault points fire,
        // the real target already carries the fully valid new content.
        assert.equal(existsSync(absolute), true);
        assert.equal(digest(readFileSync(absolute, "utf8")), plan.targets[key].afterSha256);
      } else {
        // temp-fsync fires strictly before the rename -- this is the
        // first-ever write for this target, so it must be untouched
        // (absent), never a torn partial file.
        assert.equal(existsSync(absolute), false);
      }
      const afterCrash = readOnboardingIntakeCheckpoint({ rootDir: root });
      assert.equal(afterCrash.value.transactionState, "ready-to-generate",
        "the checkpoint commit is the LAST step -- a crash during staging writes must never reach it");
      const recovered = applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: plan.planSha256, activate: true });
      assert.equal(recovered.mutated, true);
      assert.equal(recovered.checkpoint.transactionState, "generated");
      for (const eachKey of INTAKE_GENERATE_STAGING_KEYS) {
        const eachAbsolute = join(root, plan.targets[eachKey].path);
        assert.equal(digest(readFileSync(eachAbsolute, "utf8")), plan.targets[eachKey].afterSha256,
          `${eachKey} must converge to the correct fully-written content`);
      }
    });
  }
}

// Wave 4 onboarding coordinator, step 5 (design SSa.5 point 5, SSc.3,
// NVA-W5-COORD-STEP5-1). bootstrap-bind-plan/bootstrap-bind-apply: the thin
// adapter over planOnboardingKickoffPromotion/applyOnboardingKickoffPromotion
// via the new coordinator-sourced ("no kickoff predecessor") branch.
// NVA-BL-INTAKEBIND-1 (AC-4): the freshly generated staging PRD already
// carries valid po-language/technical-spec-sha256 markers (AC-1) -- the only
// remaining marker, po-plan-acknowledged, is a genuine judgment call with no
// automatic write. It is added here through the REAL sanctioned edit path
// (guard-lifecycle-ready.mjs's bootstrap-binding-required staging-authoring
// admission), proven by actually invoking the guard's own real
// admission-decision function first and asserting it admits this exact Edit,
// then performing the equivalent file mutation -- never a raw bypass.
function bootstrapBindReadyRoot(name) {
  const root = readyToGenerateRoot(`bootstrap-bind-${name}`);
  const generatePlan = planOnboardingIntakeGenerate({ rootDir: root });
  applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: generatePlan.planSha256, activate: true });
  const prdAbsolute = join(root, generatePlan.targets.prd.path);
  const admission = evaluateLifecycleReadyGuard(
    { tool_name: "Edit", tool_input: { file_path: generatePlan.targets.prd.path } },
    {
      projectDir: root,
      requireProjectOnboardingReadyFn() {
        throw new ProjectOnboardingReadyError("PORG-NOT-READY", "raw",
          { intent: "session", lifecycleStatus: "bootstrap-binding-required" });
      },
    },
  );
  assert.equal(admission.exitCode, 0, "the guard must actually admit this exact staging-PRD edit before we perform it");
  // NVA-GS15-1 (AC-5): guard-gate-strength.mjs (GS-15, project/.onboarding-staging/*) must
  // ALSO admit this identical Edit -- spawned as a real subprocess against the identical
  // payload, never a call into internals, exactly like the guard-lifecycle-ready admission
  // proven above. Before the fix this failed (exit 2, GS-15 refused); the two guards
  // contradicted each other and the PO's po-plan-acknowledged marker could never be written.
  const gateStrengthGuard = join(dirname(fileURLToPath(import.meta.url)), "..", "hooks", "guard-gate-strength.mjs");
  const gateStrength = spawnSync(process.execPath, [gateStrengthGuard], {
    input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: generatePlan.targets.prd.path } }),
    encoding: "utf8",
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  assert.equal(gateStrength.status, 0,
    `NVA-GS15-1: guard-gate-strength.mjs must admit this exact staging-PRD edit once the checkpoint is generated (GS-15 stand-down) -- stderr: ${gateStrength.stderr}`);
  writeFileSync(prdAbsolute, `${readFileSync(prdAbsolute, "utf8")}${PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n`);
  return { root, featureId: generatePlan.featureId };
}

// NVA-BL-INTAKEBIND-1 (AC-1, reproduce-first): before that fix, a genuinely
// fresh, unmodified intake-generated staging PRD (no hand-injected markers)
// failed planOnboardingBootstrapBind() with KICKOFF-PROMOTION-PRD-LANGUAGE-
// MARKER-INVALID -- a dead end for the entire material-intake happy path
// (confirmed live via scratch/repro-nva-bl-intakebind-1.mjs before any fix
// landed). Proves the fix: the freshly generated PRD now already carries
// BOTH mechanical markers with the correct values.
//
// NVA-R2-STAGINGACKTESTS: the final assertion below is updated, not silently
// retuned -- documented here as the briefing for that task requires. Before
// this task's base commit (NVA-R-STAGINGACK), the genuine judgment-call
// marker (po-plan-acknowledged) being still missing on this EXACT fixture --
// a fresh, unmodified, consent-recorded generator PRD -- correctly refused
// with KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING (what this test
// asserted until now). That base commit narrowly exempts precisely this
// case: nobody has been asked to author a word of these bytes, so demanding
// the PO's plan-acknowledgement marker on them would certify a judgement
// nobody made. This fixture is now the exemption's own positive case
// (pinned again, independently, by "the exemption fires" check below) --
// updating the final assertion here to match is required by the base
// commit's own design, not a weakening; the marker-content assertions above
// are untouched and still pin the AC-1 regression fix they always did.
check("planOnboardingBootstrapBind: a fresh, unmodified intake-generated staging PRD already carries valid po-language/technical-spec-sha256 markers -- the acknowledgement marker is exempt by design (NVA-BL-INTAKEBIND-1, NVA-R2-STAGINGACKTESTS)", () => {
  const root = readyToGenerateRoot("bootstrap-bind-ac1-markers");
  const generatePlan = planOnboardingIntakeGenerate({ rootDir: root });
  applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: generatePlan.planSha256, activate: true });
  const prdText = readFileSync(join(root, generatePlan.targets.prd.path), "utf8");
  assert.equal(prdText.startsWith(
    `<!-- po-language: en -->\n<!-- technical-spec-sha256: ${generatePlan.targets.spec.afterSha256} -->\n`,
  ), true, prdText);
  const plan = planOnboardingBootstrapBind({ rootDir: root });
  assert.equal(plan.schema, KICKOFF_PROMOTION_PLAN_SCHEMA);
});

check("planOnboardingBootstrapBind / applyOnboardingBootstrapBind: happy path binds with no kickoff predecessor", () => {
  const { root, featureId } = bootstrapBindReadyRoot("happy");
  const plan = planOnboardingBootstrapBind({ rootDir: root });
  assert.equal(plan.schema, KICKOFF_PROMOTION_PLAN_SCHEMA);
  assert.equal(plan.kickoff, null);
  assert.equal(plan.feature.id, featureId);
  assert.equal(plan.targets.state.beforeSha256, null);
  assert.equal(plan.targets.history.beforeSha256, null);
  assert.equal(plan.targets.handover.beforeSha256, null);
  assert.equal(plan.targets.cleanupBinding, undefined);
  assert.equal(plan.targets.state.value.continuity.revision, 0);

  const applied = applyOnboardingBootstrapBind({ rootDir: root, expectedPlanSha256: plan.planSha256, activate: true });
  assert.equal(applied.schema, KICKOFF_PROMOTION_APPLY_SCHEMA);
  assert.equal(applied.status, "applied");
  assert.equal(applied.mutated, true);
  assert.equal(applied.continuity.status, "valid");

  const state = JSON.parse(readFileSync(join(root, plan.targets.state.path), "utf8"));
  assert.equal(state.activeFeature.id, featureId);
  assert.equal(state.activeFeature.planPath, plan.feature.planPath);
  assert.equal(state.continuity.revision, 0);
  // NVA-INTAKESPECS-1: the design package is generated in place, so binding leaves it exactly
  // where it already was -- there is no promotion move and nothing to clean up afterwards.
  assert.equal(existsSync(join(root, intakeDesignDirname(featureId))), true,
    "the design package still exists post-bind (bind never moves or removes it)");
  const history = JSON.parse(readFileSync(promotionHistoryPath(root), "utf8"));
  assert.equal(history.transactions.length, 1);
  assert.equal(history.transactions[0].kind, "bootstrap-binding");
  assert.equal(history.transactions[0].featureId, featureId);
  assert.equal(readFileSync(join(root, plan.targets.handover.path), "utf8"), plan.targets.handover.content);
});

check("applyOnboardingBootstrapBind: a second apply against the same already-bound plan is a byte-null replay", () => {
  const { root } = bootstrapBindReadyRoot("replay");
  const plan = planOnboardingBootstrapBind({ rootDir: root });
  applyOnboardingBootstrapBind({ rootDir: root, expectedPlanSha256: plan.planSha256, activate: true });
  // applyOnboardingBootstrapBind always reconstructs its own comparison plan
  // via allowAppliedReplay: true (mirroring applyProjectOnboardingKickoffPromotionV4's
  // convention), so a caller re-running apply with the ORIGINAL plan's digest --
  // exactly what the CLI's own --plan-sha256 contract requires -- hits the
  // internal exact-postimage fast path and returns a byte-null replay.
  const replayed = applyOnboardingBootstrapBind({ rootDir: root, expectedPlanSha256: plan.planSha256, activate: true });
  assert.equal(replayed.status, "replayed");
  assert.equal(replayed.mutated, false);
  assert.deepEqual(reconstructOnboardingKickoffPromotionPlan({
    rootDir: root, profile: plan.profile, featureId: plan.feature.id, planPath: plan.feature.planPath,
    prdPath: plan.authority.prd.path, specPath: plan.authority.spec.path, designInputPath: plan.authority.designInput.path,
    coordinatorSourced: true,
  }), plan);
});

check("planOnboardingBootstrapBind: requires an existing intake checkpoint", () => {
  const root = fixture("bootstrap-bind-no-checkpoint", { neutral: true });
  expectIntakeError("BOOTSTRAP-BIND-PRECONDITION", () => planOnboardingBootstrapBind({ rootDir: root }));
});

check("planOnboardingBootstrapBind: refuses a checkpoint short of transactionState generated", () => {
  const root = readyToGenerateRoot("bootstrap-bind-not-generated");
  expectIntakeError("BOOTSTRAP-BIND-PRECONDITION", () => planOnboardingBootstrapBind({ rootDir: root }));
});

check("planOnboardingBootstrapBind: refuses once already bound (not absent-pristine)", () => {
  const { root } = bootstrapBindReadyRoot("already-bound");
  const plan = planOnboardingBootstrapBind({ rootDir: root });
  applyOnboardingBootstrapBind({ rootDir: root, expectedPlanSha256: plan.planSha256, activate: true });
  expectKickoffError("KICKOFF-PROMOTION-NOT-PRISTINE", () => planOnboardingBootstrapBind({ rootDir: root }));
});

check("applyOnboardingBootstrapBind: activation is required", () => {
  const { root } = bootstrapBindReadyRoot("activation");
  const plan = planOnboardingBootstrapBind({ rootDir: root });
  expectKickoffError("BOOTSTRAP-BIND-ACTIVATION-REQUIRED", () => applyOnboardingBootstrapBind({
    rootDir: root, expectedPlanSha256: plan.planSha256,
  }));
});

// SSd point 1: the coordinator's generated planPath must satisfy the PO plan
// gate's CURRENT contract -- the regression this design names explicitly
// (backlog/items/2026-08-07-a-promoted-feature-can-never-pass-the-plan-gate.md),
// prevented structurally by reusing applyOnboardingKickoffPromotion verbatim
// rather than reimplementing a second binder that could re-diverge from it.
check("a coordinator-sourced binding satisfies the PO plan gate's current contract (SSd point 1)", () => {
  const { root } = bootstrapBindReadyRoot("po-gate");
  const plan = planOnboardingBootstrapBind({ rootDir: root });
  applyOnboardingBootstrapBind({ rootDir: root, expectedPlanSha256: plan.planSha256, activate: true });
  const topology = publishPoGateProfile(root);
  const authority = validatePoGateAuthority({
    ...topology,
    expectedPlanSha256: plan.authority.prd.sha256,
    expectedSpecSha256: plan.authority.spec.sha256,
  });
  assert.equal(authority.ok, true, JSON.stringify(authority));
  assert.equal(authority.code, "PO-GATE-AUTHORITY-VALID");
  assert.equal(authority.value.planPath, plan.authority.prd.path);
  assert.equal(authority.value.specPath, plan.authority.spec.path);
});

// ---------------------------------------------------------------------------
// NVA-R2-STAGINGACKTESTS: pins the pureGeneratorExempt exemption
// (pureGeneratorPromotionPrdSha256, promotionArtifacts' pureGeneratorExempt
// branch, buildCoordinatorSourcedPromotionPlan's call site -- all above) as
// narrow by construction: it must fire for a provably-untouched staging PRD
// with recorded consent, and it must NOT fire the instant any one of those
// conditions stops holding. Mirrors bootstrapBindReadyRoot's own setup
// exactly, only withholding the final marker-append step -- the marker is
// precisely what this exemption exists to make unnecessary here.
function bootstrapBindPureGeneratorRoot(name) {
  const root = readyToGenerateRoot(`bootstrap-bind-pure-${name}`);
  const generatePlan = planOnboardingIntakeGenerate({ rootDir: root });
  applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: generatePlan.planSha256, activate: true });
  return { root, featureId: generatePlan.featureId, generatePlan };
}

// Written first, per the task's own instruction: this is the test that makes
// the relaxation safe. Any single hand edit to the staging PRD -- even one
// appended line of prose nobody reviewed, the marker lines themselves left
// untouched -- must change prd.sha256 away from the checkpoint-derived digest
// pureGeneratorPromotionPrdSha256 recomputes, so pureGeneratorExempt goes
// false and the ordinary refusal (unchanged since NVA-W4-2B) fires again.
check("planOnboardingBootstrapBind: a single hand edit to the pure-generator staging PRD revokes the exemption, refused with the same missing-marker code (NVA-R2-STAGINGACKTESTS)", () => {
  const { root, generatePlan } = bootstrapBindPureGeneratorRoot("one-byte-edit");
  const prdAbsolute = join(root, generatePlan.targets.prd.path);
  const original = readFileSync(prdAbsolute, "utf8");
  assert.equal(original.includes("po-plan-acknowledged"), false, "fixture must start marker-less");
  writeFileSync(prdAbsolute, `${original}\nOne extra line of prose nobody reviewed.\n`);
  expectKickoffError("KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING",
    () => planOnboardingBootstrapBind({ rootDir: root }));
});

// NVA-R2-STAGINGACKTESTS: DoD item 1 ("the exemption fires ... binds through
// the coordinator-sourced path") is deliberately NOT written as a passing
// check here. It cannot be, against the implementation as it stands --
// confirmed live, not assumed. The commented body below is exactly the test
// this task's briefing asked for; running it throws INSIDE
// applyOnboardingBootstrapBind (not planOnboardingBootstrapBind):
//
//   KickoffError: The promoted PRD must carry the PO's plan acknowledgement
//   marker exactly once ...
//     at fail (onboarding-continuity.mjs:232:9)
//     at promotionArtifacts (onboarding-continuity.mjs:4264:7)
//     at applyOnboardingKickoffPromotion (onboarding-continuity.mjs:6587:23)
//     at applyOnboardingBootstrapBind (onboarding-continuity.mjs:6100:10)
//   code: 'KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING'
//
// Root cause: buildCoordinatorSourcedPromotionPlan (plan time) threads
// pureGeneratorPrdSha256 into its promotionArtifacts() call, but
// applyOnboardingKickoffPromotion's OWN later re-admission call to
// promotionArtifacts (line 6587, reached on every first real apply,
// coordinator-sourced or not) calls it with no third argument at all --
// checkMarkers defaults true, pureGeneratorPrdSha256 defaults null, so
// pureGeneratorExempt is unconditionally false there. The exemption computed
// at plan time is therefore never honoured at apply time: a pure-generator,
// marker-less PRD can produce a *plan* (planOnboardingBootstrapBind succeeds,
// see the AC-1 check above), but applyOnboardingBootstrapBind on that exact
// plan always still refuses it. The relaxation this task was asked to pin
// currently has no working end-to-end path -- confirmed by running the test
// below against the unmodified base commit.
//
// This is a genuine defect in plugins/pipeline-core/lib/onboarding-continuity.mjs,
// which this task's briefing forbids editing (scope: onboarding-continuity.test.mjs
// and evidence/ only, "Do not change ... onboarding-continuity.mjs except to
// revert your own temporary measurement"). Per that briefing's own stop
// condition ("If a test cannot be written against the implementation as it
// stands, that is a STOP-and-report"), this is reported rather than forced
// green by touching a forbidden file or by weakening the assertion to match
// the bug. See the completion report for the recommended one-call-site fix.
//
// check("planOnboardingBootstrapBind / applyOnboardingBootstrapBind: a fresh, unmodified intake-generated staging PRD with recorded consent and no acknowledgement marker binds through the coordinator-sourced path (NVA-R2-STAGINGACKTESTS)", () => {
//   const { root, featureId, generatePlan } = bootstrapBindPureGeneratorRoot("exemption-fires");
//   const prdText = readFileSync(join(root, generatePlan.targets.prd.path), "utf8");
//   assert.equal(prdText.includes("po-plan-acknowledged"), false, "fixture must start marker-less");
//   const plan = planOnboardingBootstrapBind({ rootDir: root });
//   assert.equal(plan.schema, KICKOFF_PROMOTION_PLAN_SCHEMA);
//   assert.equal(plan.kickoff, null);
//   assert.equal(plan.feature.id, featureId);
//   const applied = applyOnboardingBootstrapBind({ rootDir: root, expectedPlanSha256: plan.planSha256, activate: true });
//   assert.equal(applied.schema, KICKOFF_PROMOTION_APPLY_SCHEMA);
//   assert.equal(applied.status, "applied");
//   assert.equal(applied.mutated, true);
// });

// Same pure-generator PRD bytes; only the checkpoint's own recorded consent
// is hand-edited away (contentSha256 recomputed with the exact same
// canonical-JSON algorithm onboarding-continuity.mjs's own canonicalSha256
// uses, so the checkpoint stays well-formed rather than merely corrupt --
// readOnboardingIntakeCheckpoint must still read it back as "present").
// pureGeneratorPromotionPrdSha256 returns null on `consent === null` before
// it ever re-derives a digest to compare, so this is refused for a different
// reason than the byte-edit test above, and must be refused all the same.
check("planOnboardingBootstrapBind: the same pure-generator staging PRD is refused when the checkpoint's recorded consent is absent (NVA-R2-STAGINGACKTESTS)", () => {
  const { root } = bootstrapBindPureGeneratorRoot("no-consent");
  const paths = resolveIntakeCheckpointPaths({ rootDir: root });
  const checkpoint = JSON.parse(readFileSync(paths.checkpoint, "utf8"));
  checkpoint.consent = null;
  const { contentSha256: _stale, ...unsigned } = checkpoint;
  checkpoint.contentSha256 = sha256CanonicalJson(unsigned);
  writeFileSync(paths.checkpoint, `${JSON.stringify(checkpoint, null, 2)}\n`);
  const observed = readOnboardingIntakeCheckpoint({ rootDir: root });
  assert.equal(observed.status, "present", "the hand-edited checkpoint must still be well-formed -- only consent is absent");
  assert.equal(observed.value.consent, null);
  expectKickoffError("KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING",
    () => planOnboardingBootstrapBind({ rootDir: root }));
});

// The other route is untouched: buildKickoffPromotionPlan's kickoff-sourced
// branch (coordinatorSourced: false, planOnboardingKickoffPromotion's own
// call site) never computes or passes pureGeneratorPrdSha256 at all -- it is
// only ever supplied by the two coordinator-sourced call sites. A kickoff
// promote of a marker-less PRD must therefore stay refused exactly as before
// this feature, independent of and in addition to the pre-existing NVA-W4-2B
// test above (which this change must leave passing unchanged).
check("planOnboardingKickoffPromotion: a kickoff-sourced (non-coordinator) promotion of a marker-less PRD stays refused -- the exemption is unreachable from this route (NVA-R2-STAGINGACKTESTS)", () => {
  const seed = promotionSeed("r2-stagingack-other-route-untouched");
  const path = promotedArtifact(seed, "prd_promoted.md");
  writeFileSync(path, readFileSync(path, "utf8").split("\n")
    .filter((line) => !line.startsWith("<!-- po-plan-acknowledged:")).join("\n"));
  expectKickoffError("KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING",
    () => planOnboardingKickoffPromotion(seed.request));
});

// ---- NVA-F-PROMOTIONACTION: promotion plans publish nextAction -----------
// Same sibling-field convention as NVA-D-PLANACTION (intake-generate, above):
// the generic guided driver (onboarding-init.mjs) reads ONLY `nextAction`,
// never `applyAction`. Without a `nextAction` on the promotion plan, a fresh
// repository's guided chain named `bootstrap-bind-plan` every round, forever
// -- the plan already carried the apply command as `applyAction`, just not
// under the name the driver reads.

function assertPromotionPlanPublishesNextAction(plan) {
  assert.deepEqual(plan.nextAction, plan.applyAction);
  assert.equal(plan.nextAction.kind, "command");
  assert.equal(plan.nextAction.executable, "node");
  assert.ok(Array.isArray(plan.nextAction.argv));
  const flagIndex = plan.nextAction.argv.indexOf("--plan-sha256");
  assert.ok(flagIndex >= 0, "nextAction argv must carry --plan-sha256");
  assert.equal(plan.nextAction.argv[flagIndex + 1], plan.planSha256);
}

check("planOnboardingKickoffPromotion (kickoff-sourced, freshly built): publishes nextAction identical to applyAction, carrying the plan's own digest", () => {
  const seed = promotionSeed("promotionaction-kickoff-fresh");
  const plan = planOnboardingKickoffPromotion(seed.request);
  assertPromotionPlanPublishesNextAction(plan);
});

check("reconstructOnboardingKickoffPromotionPlan (kickoff-sourced, replay): the reconstructed plan also publishes nextAction identical to applyAction", () => {
  const seed = promotionSeed("promotionaction-kickoff-replay");
  const plan = planOnboardingKickoffPromotion(seed.request);
  applyOnboardingKickoffPromotion({ plan, expectedPlanSha256: plan.planSha256, activate: true });
  const replayed = reconstructOnboardingKickoffPromotionPlan(seed.request);
  assertPromotionPlanPublishesNextAction(replayed);
  assert.deepEqual(replayed, plan);
});

check("planOnboardingBootstrapBind (coordinator-sourced, freshly built): publishes nextAction identical to applyAction, carrying the plan's own digest", () => {
  const { root } = bootstrapBindReadyRoot("promotionaction-coordinator-fresh");
  const plan = planOnboardingBootstrapBind({ rootDir: root });
  assertPromotionPlanPublishesNextAction(plan);
});

check("reconstructOnboardingKickoffPromotionPlan (coordinator-sourced, replay): the reconstructed binding also publishes nextAction identical to applyAction", () => {
  const { root } = bootstrapBindReadyRoot("promotionaction-coordinator-replay");
  const plan = planOnboardingBootstrapBind({ rootDir: root });
  applyOnboardingBootstrapBind({ rootDir: root, expectedPlanSha256: plan.planSha256, activate: true });
  const replayed = reconstructOnboardingKickoffPromotionPlan({
    rootDir: root, profile: plan.profile, featureId: plan.feature.id, planPath: plan.feature.planPath,
    prdPath: plan.authority.prd.path, specPath: plan.authority.spec.path, designInputPath: plan.authority.designInput.path,
    coordinatorSourced: true,
  });
  assertPromotionPlanPublishesNextAction(replayed);
  assert.deepEqual(replayed, plan);
});

check("planOnboardingKickoffPromotion: planSha256 is bound to the transaction alone -- publishing nextAction changes no plan digest (NVA-F-PROMOTIONACTION)", () => {
  const seed = promotionSeed("promotionaction-digest-stability");
  const plan = planOnboardingKickoffPromotion(seed.request);
  // Same key set `promotionBinding()` (onboarding-continuity.mjs, private)
  // projects out of the plan -- deliberately neither `planSha256` nor
  // `applyAction`/`nextAction`. Recomputing the digest from exactly this
  // projection, using the plugin's own canonical-JSON sha256 helper, proves
  // planSha256 does not depend on nextAction's presence or value.
  const binding = {
    schema: plan.schema, root: plan.root, repositoryCapability: plan.repositoryCapability,
    profile: plan.profile, feature: plan.feature, authority: plan.authority, kickoff: plan.kickoff,
    targets: plan.targets, transactionSha256: plan.transactionSha256, onboardingScript: plan.onboardingScript,
    runner: plan.runner,
  };
  assert.equal(sha256CanonicalJson(binding), plan.planSha256,
    "planSha256 must be derivable from the transaction-bound fields alone -- applyAction and nextAction are excluded from the digest");
});

check("applyOnboardingKickoffPromotion: refuses a plan whose nextAction disagrees with its own re-derived apply action, exactly as a mismatched applyAction is refused (NVA-F-PROMOTIONACTION)", () => {
  const seed = promotionSeed("promotionaction-nextaction-mismatch");
  const plan = planOnboardingKickoffPromotion(seed.request);
  const tampered = { ...plan, nextAction: { ...plan.nextAction, argv: [...plan.nextAction.argv, "--bogus"] } };
  expectKickoffError("KICKOFF-PROMOTION-PLAN", () => applyOnboardingKickoffPromotion({
    plan: tampered, expectedPlanSha256: tampered.planSha256, activate: true,
  }));
});

// NVA-P-RECEIPTPIN: `ensureLocalPromotionPoProfileReceipt()` (called from both
// the applied and replayed exit paths of `applyOnboardingKickoffPromotion`)
// is the only site that publishes a PO-gate profile receipt for a
// coordinator-sourced ("bootstrap-bind") local project's promotion, and
// previously there was none -- `submit-plan` refused PO-PROFILE-RECEIPT-INVALID
// forever. Real enough fixture, deliberately: `fixture()` runs a genuine
// `git init`, so `validatePoGateProfileForRepository()` below resolves real
// Git topology and exercises the concrete `po-gate-profile-publisher.mjs`
// writer end to end -- nothing about Git topology or the publisher itself is
// stubbed. Only the two upstream profile *inputs* (pipeline.user.yaml, the
// runtime manifest) are seeded fixture data, exactly as real onboarding seeds
// them ahead of any promotion.
check("promotion apply for a local repository publishes a PO-gate profile receipt that po-gate-authority.mjs's own validator accepts (NVA-P-RECEIPTPIN)", () => {
  const seed = promotionSeed("receipt-pin-invariant");
  seedPoGateProfileFiles(seed.root);
  promote(seed);
  // Assert acceptance through the authority's own validator -- never by
  // checking the receipt file merely exists, and never by re-deriving what a
  // valid receipt should contain. A file-existence check is precisely the gap
  // that let the defect ship: a receipt could exist and still fail the
  // authority's own fingerprint/projection binding.
  const authority = validatePoGateProfileForRepository({ repoRoot: seed.root });
  assert.equal(authority.ok, true, JSON.stringify(authority));
  assert.equal(authority.code, "PO-PROFILE-AUTHORITY-VALID");
});

check("promotion apply replay leaves exactly one valid PO-gate profile receipt, untouched byte for byte (NVA-P-RECEIPTPIN)", () => {
  const seed = promotionSeed("receipt-pin-idempotent");
  seedPoGateProfileFiles(seed.root);
  const plan = planOnboardingKickoffPromotion(seed.request);
  const applied = applyOnboardingKickoffPromotion({ plan, expectedPlanSha256: plan.planSha256, activate: true });
  assert.equal(applied.status, "applied");
  const receiptPath = poGateProfileReceiptPath(join(seed.root, ".git"));
  assert.equal(existsSync(receiptPath), true);
  assert.deepEqual(readdirSync(dirname(receiptPath)), ["profile-receipt.json"],
    "exactly one receipt, no leftover temporary publish artifact");
  const beforeReplay = readFileSync(receiptPath);
  // The replay path (`applyOnboardingKickoffPromotion`'s exact-postimage
  // branch) is what a second, idempotent apply of the same already-committed
  // promotion takes -- this is the call this test targets.
  const replayed = applyOnboardingKickoffPromotion({ plan, expectedPlanSha256: plan.planSha256, activate: true });
  assert.equal(replayed.status, "replayed");
  assert.deepEqual(readdirSync(dirname(receiptPath)), ["profile-receipt.json"],
    "still exactly one receipt after replay, not a second or renamed one");
  const afterReplay = readFileSync(receiptPath);
  // `initializePoGateProfileReceipt` is documented as leaving a currently-valid
  // receipt completely untouched -- no write, no timestamp bump -- so the
  // natural assertion is that the bytes on disk are unchanged by the replay,
  // not merely that they still happen to validate.
  assert.deepEqual(afterReplay, beforeReplay,
    "a currently-valid receipt must not be rewritten by a promotion replay");
  const authority = validatePoGateProfileForRepository({ repoRoot: seed.root });
  assert.equal(authority.ok, true, JSON.stringify(authority));
});

console.log(`${passed} onboarding continuity/kickoff checks passed.`);
