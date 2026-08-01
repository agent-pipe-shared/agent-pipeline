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
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

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
    "planSha256", "repositoryCapability", "root", "schema", "targets",
    "transactionSha256",
  ]);
  assert.deepEqual(first.applyAction.argv, [
    "/plugin/project-onboarding-v3.mjs", "kickoff", "apply", "--root", root,
    "--goal", first.goal, "--plan-sha256", first.planSha256, "--activate",
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
  writeFileSync(join(directory, "prd.md"), `# ${name} PRD\n`);
  writeFileSync(join(directory, "spec.md"), `# ${name} specification\n`);
  return {
    root,
    kickoff,
    statePath,
    request: {
      rootDir: root,
      profile: "feature",
      featureId: `feature-${name}`,
      planPath: "specs/promoted/spec.md",
      prdPath: "specs/promoted/prd.md",
      specPath: "specs/promoted/spec.md",
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

console.log(`${passed} onboarding continuity/kickoff checks passed.`);
