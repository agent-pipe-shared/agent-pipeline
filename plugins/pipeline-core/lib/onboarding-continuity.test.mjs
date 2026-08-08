// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  createPoGateProfileReceipt,
  derivePoGateRepositoryFingerprint,
  poGateProfileReceiptPath,
  serializePoGateProfileReceipt,
  validatePoGateAuthority,
} from "./po-gate-authority.mjs";

import {
  KICKOFF_FAULT_STAGES,
  applyOnboardingContinuityRepair,
  applyOnboardingKickoff,
  applyOnboardingKickoffPromotion,
  applyOnboardingKickoffPromotionCleanupRecovery,
  bindOnboardingSessionCleanup,
  classifyOnboardingContinuity,
  planOnboardingContinuityRepair,
  planOnboardingKickoff,
  planOnboardingKickoffPromotion,
  planOnboardingKickoffPromotionCleanupRecovery,
  readOnboardingSessionCleanupBinding,
  reconstructOnboardingKickoffPlan,
  reconstructOnboardingKickoffPromotionPlan,
  releaseOnboardingSessionCleanup,
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
  const root = mkdtempSync(join(tmpdir(), `onboarding continuity ${name} `));
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
  const parent = mkdtempSync(join(tmpdir(), "onboarding continuity root link "));
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
    "applyAction", "calibration", "goal", "goalSha256", "onboardingScript",
    "planSha256", "repositoryCapability", "root", "runner", "schema", "targets",
    "transactionSha256",
  ]);
  assert.equal(first.runner, "codex");
  assert.deepEqual(first.applyAction.argv, [
    "/plugin/project-onboarding-v3.mjs", "kickoff", "apply", "--root", root,
    "--goal", first.goal, "--runner", "codex", "--plan-sha256", first.planSha256, "--activate",
  ]);
  assert.equal(first.applyAction.mutation, true);
  assert.equal(first.applyAction.requiresConfirmation, true);
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

function promotionSeed(name, { privatized = false } = {}) {
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
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.continuity.revision = 1;
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  }
  const directory = join(root, "specs", "promoted");
  mkdirSync(directory, { recursive: true });
  const specBytes = `# ${name} specification\n`;
  writeFileSync(join(directory, "spec.md"), specBytes);
  // The promoted PRD is the approval subject, so it carries the PO-gate
  // markers: the human-facing language and the digest of the Spec beside it.
  writeFileSync(join(directory, "prd_promoted.md"), [
    "<!-- po-language: en -->",
    `<!-- technical-spec-sha256: ${digest(specBytes)} -->`,
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

for (const stage of [
  "promotion-history-published",
  "promotion-cleanup-binding-published",
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
    "featureId", "kickoffFeatureId", "kind", "planPath", "prdSha256",
    "previousTransactionSha256", "profile", "specPath", "specSha256", "transactionSha256",
  ]);
  assert.equal(entry.specPath, seed.request.specPath);
  assert.equal(entry.planPath, seed.request.planPath);
});

for (const stage of [
  "promotion-history-published",
  "promotion-cleanup-binding-published",
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
    assert.equal(planOnboardingKickoffPromotionCleanupRecovery({ rootDir: seed.root }).status, "recovery-unavailable");
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
  writeFileSync(path, readFileSync(path, "utf8").replace(
    /<!-- technical-spec-sha256: [0-9a-f]{64} -->/u,
    `<!-- technical-spec-sha256: ${"a".repeat(64)} -->`,
  ));
  assert.throws(() => planOnboardingKickoffPromotion(seed.request),
    (error) => error?.code === "KICKOFF-PROMOTION-PRD-SPEC-MARKER-MISMATCH");
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
    .replace("<!-- po-language: en -->", "<!-- po-language: fr -->"));
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

function publishPoGateProfile(root) {
  const gitCommonDir = join(root, ".git");
  writeFileSync(join(root, "pipeline.user.yaml"),
    "schema: pipeline.user.v1\nlanguage:\n  human_facing: en\n  agent_facing: en\n");
  writeFileSync(join(root, ".claude", "pipeline.yaml"),
    "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: en\n");
  const receipt = createPoGateProfileReceipt({
    repositoryFingerprint: derivePoGateRepositoryFingerprint({ gitCommonDir, primaryRoot: root }),
    primaryRoot: root,
    sourceBytes: readFileSync(join(root, "pipeline.user.yaml")),
    runtimeBytes: readFileSync(join(root, ".claude", "pipeline.yaml")),
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

console.log(`${passed} onboarding continuity/kickoff checks passed.`);
