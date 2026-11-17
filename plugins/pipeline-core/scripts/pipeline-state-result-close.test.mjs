#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach } from "node:test";

import {
  approveSubmittedPlan,
  derivePlanLifecycle,
  enterPlanImplementation,
  sha256CanonicalJson,
  submitPlan,
} from "../lib/plan-spec-state-v2.mjs";
import { run } from "./pipeline-state.mjs";

const h = (character) => character.repeat(64);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const NOW = "2026-07-31T12:00:00.000Z";
const PLAN = h("1");
const SPEC = h("2");
const PROFILE = h("3");
const AUTHORITY = {
  schema: "pipeline.po-gate-authority.v2",
  humanFacing: "en",
  sourceSha256: h("4"),
  runtimeSha256: h("5"),
  receiptSha256: h("6"),
  repositoryFingerprint: h("7"),
  planPath: "specs/feature/prd.md",
  planSha256: PLAN,
  specPath: "specs/feature/spec.md",
  specSha256: SPEC,
};
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function continuity(overrides = {}) {
  return {
    schema: "pipeline.continuity.v0",
    featureId: "feature",
    revision: 20,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
    authority: {
      prd: { path: AUTHORITY.planPath, sha256: PLAN },
      spec: { path: AUTHORITY.specPath, sha256: SPEC },
      result: null,
    },
    queueHead: {
      packageId: "continuity-adoption",
      actionId: "review-active-feature",
      nextAction: "review",
      productRetryCount: 0,
      environmentRerouteCount: 0,
      dispatch: null,
    },
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 20, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    closeTransition: null,
    capacity: {
      concurrencyLimit: 4,
      reservedCriticSlots: 1,
      reservedRecoverySlots: 1,
      fallbackPolicy: "defer",
    },
    ...overrides,
  };
}

function approvedImplementation() {
  const draft = {
    schema: "pipeline.state.v0",
    activeFeature: { id: "feature", planPath: AUTHORITY.planPath, phase: "design" },
    planApproved: false,
    continuity: continuity(),
    updatedAt: "2026-07-31T11:00:00.000Z",
  };
  const submitted = submitPlan({
    state: draft,
    expectedStateSha256: sha256CanonicalJson(draft),
    poGateAuthority: AUTHORITY,
    profile: "feature",
    profileSha256: PROFILE,
    by: "Coordinator",
    at: "2026-07-31T11:05:00.000Z",
  });
  assert.equal(submitted.ok, true);
  const lifecycle = derivePlanLifecycle(submitted.state);
  const approved = approveSubmittedPlan({
    state: submitted.state,
    expectedStateSha256: sha256CanonicalJson(submitted.state),
    expectedSubmissionSha256: lifecycle.submissionSha256,
    poGateAuthority: AUTHORITY,
    profileSha256: PROFILE,
    by: "PO",
    at: "2026-07-31T11:10:00.000Z",
    designAdvisorAdmissionSha256: h("8"),
    // In-memory state fixture: preserve the current feature approval shape.
    // The PO proof/complete-package ceremony is exercised in its own suite.
    designWorkflowPackagePath: "specs/feature/evidence/design-workflow-package.json",
    designWorkflowPackageSha256: h("9"),
    designWorkflowApproval: {
      schema: "pipeline.design-workflow-package-approval.v1",
      mode: "chat",
      approvedBy: "PO",
      approvedAt: "2026-07-31T11:10:00.000Z",
      packageSha256: h("9"),
      intentSha256: null,
      proofSha256: null,
      proof: null,
    },
  });
  assert.equal(approved.ok, true);
  const implementation = enterPlanImplementation({
    state: approved.state,
    expectedStateSha256: sha256CanonicalJson(approved.state),
    at: "2026-07-31T11:12:00.000Z",
  });
  assert.equal(implementation.ok, true);
  return { ...implementation.state, updatedAt: "2026-07-31T11:15:00.000Z" };
}

// The fixture owns its repository, so it can never resolve an enclosing one.
function initRepo(dir) {
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
}

function fixture(name = "case") {
  const root = mkdtempSync(join(tmpdir(), `pipeline-result-close-${name}-`));
  roots.push(root);
  initRepo(root);
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "specs", "feature"), { recursive: true });
  const state = approvedImplementation();
  const statePath = join(root, ".claude", "pipeline-state.json");
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
  const resultPath = "specs/feature/Result.md";
  const resultBytes = Buffer.from("# Result\n\nVerified implementation result.\n", "utf8");
  writeFileSync(join(root, resultPath), resultBytes);
  return {
    root,
    state,
    statePath,
    revision: state.continuity.revision,
    resultPath,
    resultSha256: sha256(resultBytes),
  };
}

function invoke(root, argv, now = NOW) {
  const stdout = [];
  const stderr = [];
  const priorLog = console.log;
  const priorError = console.error;
  console.log = (...parts) => stdout.push(parts.join(" "));
  console.error = (...parts) => stderr.push(parts.join(" "));
  try {
    const status = run(argv, { dir: root, now: () => now });
    return { status, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally {
    console.log = priorLog;
    console.error = priorError;
  }
}

function plan(f) {
  const before = readFileSync(f.statePath);
  const planned = invoke(f.root, [
    "continuity-result-close-plan",
    "--feature-id", "feature",
    "--expected-revision", String(f.revision),
    "--result-path", f.resultPath,
    "--result-sha256", f.resultSha256,
  ]);
  assert.equal(planned.status, 0, planned.stderr);
  assert.deepEqual(readFileSync(f.statePath), before, "plan must be read-only");
  return JSON.parse(planned.stdout);
}

test("read-only plan returns one complete digest-bound confirmed apply action", () => {
  const f = fixture("plan");
  const planned = plan(f);
  assert.equal(planned.schema, "pipeline.continuity-result-close-plan.v1");
  assert.equal(planned.featureId, "feature");
  assert.equal(planned.expectedRevision, f.revision);
  assert.equal(planned.preimage.queueAction, "review");
  assert.equal(planned.postimage.queueAction, "close");
  assert.equal(planned.result.path, f.resultPath);
  assert.equal(planned.result.sha256, f.resultSha256);
  assert.equal(planned.applyAction.mutation, true);
  assert.equal(planned.applyAction.requiresConfirmation, true);
  assert.equal(planned.applyAction.argv.at(-1), "--activate");
  assert.equal(planned.applyAction.argv.filter((value) => value === "--plan-sha256").length, 1);
});

test("confirmed apply changes only the bounded continuity fields and exact replay is zero-write", () => {
  const f = fixture("apply");
  const planned = plan(f);
  const applied = invoke(f.root, planned.applyAction.argv.slice(1));
  assert.equal(applied.status, 0, applied.stderr);
  const appliedReceipt = JSON.parse(applied.stdout);
  assert.equal(appliedReceipt.status, "applied");
  assert.deepEqual(appliedReceipt.completion, {
    scope: "feature-closure", state: "in-progress", queueAction: "close", workflowTerminal: false,
  });
  const after = JSON.parse(readFileSync(f.statePath, "utf8"));
  const expected = structuredClone(f.state);
  expected.continuity.revision = f.revision + 1;
  expected.continuity.authority.result = { path: f.resultPath, sha256: f.resultSha256 };
  expected.continuity.queueHead.nextAction = "close";
  expected.continuity.resume = { mode: "immediate", sourceRevision: f.revision + 1, reasonCode: "active-turn" };
  expected.updatedAt = NOW;
  assert.deepEqual(after, expected);
  const postBytes = readFileSync(f.statePath);
  const replay = invoke(f.root, planned.applyAction.argv.slice(1));
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(JSON.parse(replay.stdout).status, "replayed");
  assert.deepEqual(readFileSync(f.statePath), postBytes);
});

test("Result-close finalizes an exact Result previously bound by bootstrap", () => {
  const f = fixture("bootstrap-bound");
  const bootstrap = JSON.parse(readFileSync(f.statePath, "utf8"));
  bootstrap.continuity.revision = f.revision + 1;
  bootstrap.continuity.resume.sourceRevision = f.revision + 1;
  bootstrap.continuity.authority.result = { path: f.resultPath, sha256: f.resultSha256 };
  writeFileSync(f.statePath, JSON.stringify(bootstrap, null, 2) + "\n");
  f.revision += 1;
  const planned = plan(f);
  assert.equal(planned.preimage.queueAction, "review");
  const applied = invoke(f.root, planned.applyAction.argv.slice(1));
  assert.equal(applied.status, 0, applied.stderr);
  const after = JSON.parse(readFileSync(f.statePath, "utf8"));
  assert.equal(after.continuity.revision, f.revision + 1);
  assert.equal(after.continuity.queueHead.nextAction, "close");
  assert.deepEqual(after.continuity.authority.result, { path: f.resultPath, sha256: f.resultSha256 });
});

test("apply rejects missing activation, stale State and Result byte drift", () => {
  for (const mode of ["activation", "state", "result"]) {
    const f = fixture(mode);
    const planned = plan(f);
    const before = readFileSync(f.statePath);
    let argv = planned.applyAction.argv.slice(1);
    if (mode === "activation") argv = argv.slice(0, -1);
    if (mode === "state") {
      const changed = JSON.parse(before.toString("utf8"));
      changed.continuity.resume.reasonCode = "compact-reload";
      writeFileSync(f.statePath, JSON.stringify(changed, null, 2) + "\n");
    }
    if (mode === "result") writeFileSync(join(f.root, f.resultPath), "# drift\n");
    const refused = invoke(f.root, argv);
    assert.equal(refused.status, 2, mode);
    if (mode === "activation" || mode === "result") assert.deepEqual(readFileSync(f.statePath), before);
  }
});

test("plan rejects duplicate/malformed input, retries and conflicting Result authority", () => {
  for (const mode of ["duplicate", "retry", "conflict"]) {
    const f = fixture(mode);
    if (mode !== "duplicate") {
      const state = JSON.parse(readFileSync(f.statePath, "utf8"));
      if (mode === "retry") state.continuity.queueHead.productRetryCount = 1;
      if (mode === "conflict") {
        state.continuity.authority.result = { path: f.resultPath, sha256: h("f") };
        state.continuity.queueHead.nextAction = "close";
        state.continuity.revision = f.revision + 1;
        state.continuity.resume.sourceRevision = f.revision + 1;
      }
      writeFileSync(f.statePath, JSON.stringify(state, null, 2) + "\n");
    }
    const argv = [
      "continuity-result-close-plan",
      "--feature-id", "feature",
      "--expected-revision", String(f.revision),
      "--result-path", f.resultPath,
      "--result-sha256", f.resultSha256,
    ];
    if (mode === "duplicate") argv.push("--result-path", f.resultPath);
    const before = readFileSync(f.statePath);
    assert.equal(invoke(f.root, argv).status, 2, mode);
    assert.deepEqual(readFileSync(f.statePath), before);
  }
});

test("physical Result must be a stable regular single-link file", () => {
  for (const mode of ["symlink", "hardlink"]) {
    const f = fixture(mode);
    const absolute = join(f.root, f.resultPath);
    const target = join(f.root, "specs", "feature", "real-result.md");
    const bytes = readFileSync(absolute);
    rmSync(absolute);
    writeFileSync(target, bytes);
    if (mode === "symlink") symlinkSync("real-result.md", absolute);
    else linkSync(target, absolute);
    assert.equal(invoke(f.root, [
      "continuity-result-close-plan",
      "--feature-id", "feature",
      "--expected-revision", String(f.revision),
      "--result-path", f.resultPath,
      "--result-sha256", f.resultSha256,
    ]).status, 2, mode);
  }
});

// ---- C30G-D1 (AC-108): a refused Result close names its cause; the code PS-RESULT-CLOSE-RESULT and the exit code 2 stay as they were ----
const closePlanArgv = (f, resultPath = f.resultPath, resultSha256 = f.resultSha256) => [
  "continuity-result-close-plan", "--feature-id", "feature", "--expected-revision", String(f.revision), "--result-path", resultPath, "--result-sha256", resultSha256];

const CAUSES = [
  ["missing", "missing-or-unsafe", /does not exist/u, (f, abs) => rmSync(abs)],
  ["symlink", "missing-or-unsafe", /symbolic link/u, (f, abs) => { const target = join(f.root, "specs", "feature", "real-result.md"); const bytes = readFileSync(abs); rmSync(abs); writeFileSync(target, bytes); symlinkSync("real-result.md", abs); }],
  ["hardlink", "missing-or-unsafe", /more than one hard link/u, (f, abs) => linkSync(abs, join(f.root, "specs", "feature", "second-name.md"))],
  ["changed", "digest-changed", /bound [0-9a-f]{12}, current [0-9a-f]{12}/u, (f, abs) => writeFileSync(abs, "# Result\n\nEdited after the Result was bound.\n")],
  ["empty", "empty-or-oversized", /is empty/u, (f, abs) => writeFileSync(abs, "")],
  ["oversized", "empty-or-oversized", /larger than 1048576 bytes/u, (f, abs) => writeFileSync(abs, Buffer.alloc(1048577, 97))],
];

test("C30G-D1: a refused Result close plan and apply name the cause after the unchanged code, and write nothing", () => {
  for (const [name, cause, pattern, mutate] of CAUSES) {
    const f = fixture(`cause-${name}`);
    const planned = plan(f);
    mutate(f, join(f.root, f.resultPath));
    const before = readFileSync(f.statePath);
    const refusedPlan = invoke(f.root, closePlanArgv(f));
    assert.equal(refusedPlan.status, 2, name);
    assert.match(refusedPlan.stderr, new RegExp(`PS-RESULT-CLOSE-RESULT: ${cause}: `, "u"), `${name} plan: ${refusedPlan.stderr}`);
    assert.match(refusedPlan.stderr, pattern, `${name} plan: ${refusedPlan.stderr}`);
    assert.match(refusedPlan.stderr, new RegExp(f.resultPath.replaceAll(".", "\\."), "u"), `${name} plan names the Result path`);
    const refusedApply = invoke(f.root, planned.applyAction.argv.slice(1));
    assert.equal(refusedApply.status, 2, name);
    assert.match(refusedApply.stderr, new RegExp(`Result-close apply refused \\(PS-RESULT-CLOSE-RESULT: ${cause}: `, "u"), `${name} apply: ${refusedApply.stderr}`);
    assert.match(refusedApply.stderr, pattern, `${name} apply: ${refusedApply.stderr}`);
    assert.match(refusedApply.stderr, /zero mutation/u);
    assert.deepEqual(readFileSync(f.statePath), before, `${name}: nothing is written`);
  }
});

test("C30G-D1: a Result that equals the Spec path is named as such (the plan; its apply cannot be planned)", () => {
  const f = fixture("spec-path");
  const specBytes = Buffer.from("# Spec\n", "utf8");
  writeFileSync(join(f.root, AUTHORITY.specPath), specBytes);
  const refused = invoke(f.root, closePlanArgv(f, AUTHORITY.specPath, sha256(specBytes)));
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /PS-RESULT-CLOSE-RESULT: is-prd-or-spec: /u);
  assert.match(refused.stderr, /specs\/feature\/spec\.md/u);
});

test("C30G-D1: a changed Result is repaired by restoring the bound bytes, never by a rebind; the same plan then goes through", () => {
  const f = fixture("restore");
  const abs = join(f.root, f.resultPath);
  const bound = readFileSync(abs);
  writeFileSync(abs, "# Result\n\nReverted to something else.\n");
  const refused = invoke(f.root, closePlanArgv(f));
  assert.match(refused.stderr, /digest-changed: /u);
  assert.match(refused.stderr, /commit or revert of the Result after the Result bootstrap changes the bytes the State binds/u);
  assert.match(refused.stderr, /git restore --source=<commit> -- specs\/feature\/Result\.md/u);
  assert.doesNotMatch(refused.stderr, /rebind/iu, "the rebind route cannot repair a changed digest and is never named as the repair");
  writeFileSync(abs, bound);
  const accepted = invoke(f.root, closePlanArgv(f));
  assert.equal(accepted.status, 0, accepted.stderr);
});
