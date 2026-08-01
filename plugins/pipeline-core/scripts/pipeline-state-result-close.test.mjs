#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
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
  });
  assert.equal(approved.ok, true);
  const implementation = enterPlanImplementation({
    state: approved.state,
    expectedStateSha256: sha256CanonicalJson(approved.state),
  });
  assert.equal(implementation.ok, true);
  return { ...implementation.state, updatedAt: "2026-07-31T11:15:00.000Z" };
}

function fixture(name = "case") {
  const root = mkdtempSync(join(tmpdir(), `pipeline-result-close-${name}-`));
  roots.push(root);
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
  assert.equal(planned.preimage.nextAction, "review");
  assert.equal(planned.postimage.nextAction, "close");
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
  assert.equal(JSON.parse(applied.stdout).status, "applied");
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
  assert.equal(planned.preimage.nextAction, "review");
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
