#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * REBIND-RUNNER-04: the `po-authority-rebind-apply` recovery transaction must
 * observe its in-transaction V4 lifecycle readback with the invoking
 * session's own runner (ADR-0051 class), never the historical "codex"
 * default. New file (not an edit of the guarded `harness/scripts/
 * pipeline-state.test.mjs` / TP-5 suite) exercising the same public `run`
 * export and the same pre-existing `deps.v4Inspection` injection seam.
 *
 * AUTHAPPLY-1 (2026-08-08): `po-authority-decision-apply` (a different
 * subcommand sharing the same `runPoAuthorityRebindApply` helper) used to
 * leave its `runner` option undefined, falling through two layers down to
 * `inspectProjectOnboardingV3`'s own "codex" default -- reachable and
 * consequential, since that readback gates the postimage check the apply
 * must pass. It now resolves via the same `resolvePoRebindRunner` the
 * rebind path already used, so the "unaffected" framing below no longer
 * holds; see backlog/items/2026-08-08-the-authority-decision-apply-path-
 * still-defaults-to-codex.md.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";
import { dirname, join } from "node:path";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { run, SCHEMA_ID, statePath } from "./pipeline-state.mjs";
import { sha256CanonicalJson } from "../lib/plan-spec-state-v2.mjs";
import { isSanctionedLifecycleCommand } from "../hooks/guard-lifecycle-ready.mjs";

const roots = [];
afterEach(() => { while (roots.length) rmSync(roots.pop(), { recursive: true, force: true }); });

const h = (value) => value.repeat(64);
const hash = (value) => createHash("sha256").update(value).digest("hex");
let nonce = 0;

function runnerEnv(runner) {
  if (runner === "claude") return { CLAUDECODE: "1" };
  if (runner === "antigravity") return { ANTIGRAVITY_AGENT: "1" };
  return { CODEX_SESSION_ID: "codex-runner-fixture" };
}

function withoutRunnerTail(argv) {
  assert.deepEqual(argv.slice(-2, -1), ["--runner"]);
  return argv.slice(0, -2);
}

function actionCommand(action) {
  return [action.executable, ...action.argv].map((part) => JSON.stringify(part)).join(" ");
}

function invoke(argv, deps) {
  const out = []; const err = []; const log = console.log; const error = console.error;
  console.log = (...value) => out.push(value.join(" ")); console.error = (...value) => err.push(value.join(" "));
  try { return { status: run(argv, deps), out: out.join("\n"), err: err.join("\n") }; }
  finally { console.log = log; console.error = error; }
}

/** Mirrors harness/scripts/pipeline-state.test.mjs's seedPoAuthorityRebind fixture shape. */
function fixture(name) {
  const dir = mkdtempSync(join(tmpdir(), `pipeline-rebind-runner-${name}-`)); roots.push(dir);
  const featureDir = join(dir, "specs", "runner-shaped");
  mkdirSync(featureDir, { recursive: true });
  mkdirSync(dirname(statePath(dir)), { recursive: true });
  const planPath = "specs/runner-shaped/prd_runner.md";
  const specPath = "specs/runner-shaped/spec.md";
  const oldSpecSha = hash("# older Spec\n");
  writeFileSync(join(dir, specPath), "# later Spec\n");
  const newSpecSha = hash(readFileSync(join(dir, specPath)));
  writeFileSync(join(dir, planPath), `<!-- po-language: en -->\n<!-- technical-spec-sha256: ${oldSpecSha} -->\n# Runner-shaped PRD\n`);
  const planSha = hash(readFileSync(join(dir, planPath)));
  const profile = { schema: "pipeline.po-gate-authority-evidence.v1", humanFacing: "en", sourceSha256: h("1"), runtimeSha256: h("2"), receiptSha256: h("3"), repositoryFingerprint: h("4") };
  const continuity = {
    schema: "pipeline.continuity.v0", featureId: "runner-shaped", revision: 3,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" },
    authority: { prd: { path: planPath, sha256: planSha }, spec: { path: specPath, sha256: oldSpecSha }, result: null },
    queueHead: { packageId: "runner", actionId: "rebind", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
  const state = {
    schema: SCHEMA_ID, activeFeature: { id: "runner-shaped", planPath, phase: "implementation" }, planApproved: true,
    planApproval: {
      schema: "pipeline.plan-approval.v2", approvedBy: "PO (runner-04 fixture)", approvedAt: "2026-07-26T14:08:37.500Z",
      specBoundBy: "PO (runner-04 fixture)", specBoundAt: "2026-07-26T14:08:37.500Z",
      poGateAuthority: { ...profile, schema: "pipeline.po-gate-authority.v2", planPath, planSha256: planSha, specPath, specSha256: oldSpecSha },
    },
    continuity, updatedAt: "2026-07-26T14:08:37.500Z",
  };
  writeFileSync(statePath(dir), JSON.stringify(state, null, 2) + "\n");
  const deps = {
    dir, now: () => "2026-07-28T10:00:00.000Z", ownerNonce: () => `rebind-runner-${String(++nonce).padStart(8, "0")}`,
    env: runnerEnv("codex"),
    poGateProfile: () => ({ ok: true, value: profile }),
    poGateAuthority: ({ expectedPlanSha256, expectedSpecSha256 }) => expectedSpecSha256 === newSpecSha && typeof expectedPlanSha256 === "string"
      ? { ok: true, value: { ...profile, schema: "pipeline.po-gate-authority.v2", planPath, planSha256: expectedPlanSha256, specPath, specSha256: newSpecSha } }
      : { ok: false, code: "PO-GATE-AUTHORITY-STALE" },
    v4Inspection: () => ({ status: "ready" }),
  };
  return { dir, deps, planPath, specPath };
}

function planRebind(f) {
  const result = invoke(["po-authority-rebind-plan"], f.deps);
  assert.equal(result.status, 0, result.err);
  return JSON.parse(result.out);
}

function acknowledgeFixture(name) {
  const f = fixture(`ack-${name}`);
  const state = JSON.parse(readFileSync(statePath(f.dir), "utf8"));
  state.planApproved = false;
  state.continuity.authority.spec.sha256 = hash(readFileSync(join(f.dir, state.continuity.authority.spec.path)));
  writeFileSync(statePath(f.dir), JSON.stringify(state, null, 2) + "\n");
  return f;
}

function planAcknowledge(f, runner) {
  const result = invoke([
    "po-authority-acknowledge-plan", "--root", f.dir,
    "--by", "Runner PO", "--runner", runner,
  ], { ...f.deps, env: {} });
  assert.equal(result.status, 0, result.err);
  return JSON.parse(result.out);
}

test("acknowledge returned-action roundtrip carries every supported runner into markerless attended apply", () => {
  for (const runner of ["claude", "codex", "antigravity"]) {
    const f = acknowledgeFixture(runner);
    const plan = planAcknowledge(f, runner);
    assert.deepEqual(plan.applyAction.argv.slice(-2), ["--runner", runner]);
    assert.equal(isSanctionedLifecycleCommand(actionCommand(plan.applyAction), f.dir), true);
    const observed = [];
    const applied = invoke(plan.applyAction.argv.slice(1), {
      ...f.deps,
      env: {},
      isattyFn: () => true,
      readLineFn: () => "CONFIRM",
      v4Inspection: ({ runner: observedRunner }) => { observed.push(observedRunner); return { status: "ready" }; },
    });
    assert.equal(applied.status, 0, `${runner}: ${applied.err}`);
    assert.deepEqual(observed, [runner, runner, runner]);
  }
});

test("acknowledge plan rejects absent and invalid runner without mutation", () => {
  for (const runnerArgs of [[], ["--runner", "codepilot"]]) {
    const f = acknowledgeFixture(runnerArgs.length === 0 ? "missing-runner" : "invalid-runner");
    const before = readFileSync(statePath(f.dir), "utf8");
    const rejected = invoke([
      "po-authority-acknowledge-plan", "--root", f.dir, "--by", "Runner PO", ...runnerArgs,
    ], { ...f.deps, env: {} });
    assert.equal(rejected.status, 2);
    assert.equal(readFileSync(statePath(f.dir), "utf8"), before);
  }
});

test("markerless external acknowledge apply succeeds only with the plan-returned runner tail", () => {
  const f = acknowledgeFixture("external-tail");
  const plan = planAcknowledge(f, "codex");
  const before = readFileSync(statePath(f.dir), "utf8");
  const attended = {
    ...f.deps, env: {}, isattyFn: () => true, readLineFn: () => "CONFIRM",
    v4Inspection: () => ({ status: "ready" }),
  };
  const rejected = invoke(withoutRunnerTail(plan.applyAction.argv).slice(1), attended);
  assert.equal(rejected.status, 2);
  assert.match(rejected.err, /PO-REBIND-RUNNER-UNKNOWN/u);
  assert.equal(readFileSync(statePath(f.dir), "utf8"), before);
  const applied = invoke(plan.applyAction.argv.slice(1), attended);
  assert.equal(applied.status, 0, applied.err);
});

function generatorSubmitFixture(name, { exempt }) {
  const dir = mkdtempSync(join(tmpdir(), `pipeline-generator-submit-${name}-`)); roots.push(dir);
  const featureId = `generator-${name}`;
  const planPath = `specs/${featureId}/prd_${featureId}.md`;
  const specPath = `specs/${featureId}/spec.md`;
  mkdirSync(join(dir, `specs/${featureId}`), { recursive: true });
  mkdirSync(dirname(statePath(dir)), { recursive: true });
  writeFileSync(join(dir, specPath), "# Generated specification\n");
  const specSha256 = hash(readFileSync(join(dir, specPath)));
  writeFileSync(join(dir, planPath), `<!-- po-language: en -->\n<!-- technical-spec-sha256: ${specSha256} -->\n# Generated plan\n`);
  const planSha256 = hash(readFileSync(join(dir, planPath)));
  const profile = {
    schema: "pipeline.po-gate-authority-evidence.v1", humanFacing: "en",
    sourceSha256: h("1"), runtimeSha256: h("2"), receiptSha256: h("3"), repositoryFingerprint: h("4"),
  };
  const authority = {
    ...profile, schema: "pipeline.po-gate-authority.v2",
    planPath, planSha256, specPath, specSha256,
  };
  const continuity = {
    schema: "pipeline.continuity.v0", featureId, revision: 0,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" },
    authority: { prd: { path: planPath, sha256: planSha256 }, spec: { path: specPath, sha256: specSha256 }, result: null },
    queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
  const state = {
    schema: SCHEMA_ID, activeFeature: { id: featureId, planPath, phase: "design" },
    planApproved: false, continuity, updatedAt: "2026-08-30T10:00:00.000Z",
  };
  writeFileSync(statePath(dir), JSON.stringify(state, null, 2) + "\n");
  const deps = {
    dir,
    now: () => "2026-08-30T10:01:00.000Z",
    poGateProfile: () => ({ ok: true, value: profile }),
    poGateAuthority: (request) => request.expectedPlanSha256 === undefined
      ? { ok: true, value: authority }
      : { ok: false, code: "PO-GATE-PRD-ACKNOWLEDGEMENT-MISSING", reason: "marker missing", repair: "PO acknowledgement required" },
    observeBootstrapBindAcknowledgement: () => ({
      acknowledged: false,
      exempt,
      prd: { path: planPath, sha256: planSha256 },
      spec: { path: specPath, sha256: specSha256 },
    }),
  };
  return { dir, deps };
}

test("submit-plan honors the exact generator-identical acknowledgement exemption", () => {
  const f = generatorSubmitFixture("exact", { exempt: true });
  const submitted = invoke(["submit-plan", "--by", "coordinator", "--profile", "feature"], f.deps);
  assert.equal(submitted.status, 0, submitted.err);
  assert.ok(JSON.parse(readFileSync(statePath(f.dir), "utf8")).planSubmission);
});

test("submit-plan still demands PO acknowledgement for modified non-exempt bytes", () => {
  const f = generatorSubmitFixture("modified", { exempt: false });
  const before = readFileSync(statePath(f.dir), "utf8");
  const rejected = invoke(["submit-plan", "--by", "coordinator", "--profile", "feature"], f.deps);
  assert.equal(rejected.status, 2);
  assert.match(rejected.out, /PO-GATE-PRD-ACKNOWLEDGEMENT-MISSING/u);
  assert.equal(readFileSync(statePath(f.dir), "utf8"), before);
});

test("submit-plan rejects an exempt observation whose artifact identity does not match the bound authority", () => {
  const f = generatorSubmitFixture("identity-mismatch", { exempt: true });
  const observe = f.deps.observeBootstrapBindAcknowledgement;
  f.deps.observeBootstrapBindAcknowledgement = () => {
    const result = observe();
    return { ...result, prd: { ...result.prd, sha256: h("f") } };
  };
  const before = readFileSync(statePath(f.dir), "utf8");
  const rejected = invoke(["submit-plan", "--by", "coordinator", "--profile", "feature"], f.deps);
  assert.equal(rejected.status, 2);
  assert.match(rejected.out, /PO-GATE-PRD-ACKNOWLEDGEMENT-MISSING/u);
  assert.equal(readFileSync(statePath(f.dir), "utf8"), before);
});

test("inspect exposes one typed PO approval action after submit and presentation, independent of runner", () => {
  for (const runner of ["claude", "codex", "antigravity"]) {
    const f = generatorSubmitFixture(`approval-${runner}`, { exempt: true });
    const runnerDeps = { ...f.deps, env: runnerEnv(runner) };
    assert.equal(invoke(["submit-plan", "--by", "coordinator", "--profile", "feature"], runnerDeps).status, 0);
    assert.equal(invoke(["present-plan", "--by", "coordinator"], runnerDeps).status, 0);
    const inspected = invoke(["inspect"], runnerDeps);
    assert.equal(inspected.status, 0, inspected.err);
    const action = JSON.parse(inspected.out).nextAction;
    assert.equal(action.kind, "collect-input");
    assert.deepEqual(action.input, { name: "by", encoding: "utf8", trim: true, minBytes: 1, maxBytes: 128, singleLine: true, rejectNul: true });
    assert.equal(action.applyAction.executable, process.execPath);
    assert.deepEqual(action.applyAction.argv, [
      new URL("./pipeline-state.mjs", import.meta.url).pathname,
      "approve-plan", "--by", "<PO_PLAN_APPROVER_NAME>",
    ]);
    assert.equal(action.applyAction.mutation, true);
    assert.equal(action.applyAction.requiresConfirmation, true);
    assert.equal(action.applyAction.argv.includes("--runner"), false);
    assert.ok(action.applyAction.copyCommand?.posix);
    const approvedArgv = action.applyAction.argv.slice(1).map((value) => value === "<PO_PLAN_APPROVER_NAME>" ? "Runner PO" : value);
    assert.equal(isSanctionedLifecycleCommand(actionCommand({ ...action.applyAction, argv: [action.applyAction.argv[0], ...approvedArgv] }), f.dir), true);
    assert.equal(invoke(approvedArgv, runnerDeps).status, 0);
    assert.equal(JSON.parse(invoke(["inspect"], runnerDeps).out).lifecycle.status, "approved");
  }
});

/**
 * PHX-WP-REBIND-V4-SCHEMA: same physical shape as fixture(), but planApproval.schema
 * is "pipeline.plan-approval.v4" (this repository's live schema) -- bound via a
 * planSubmission rather than v2's own specBoundBy/specBoundAt, mirroring
 * validPriorAuthority's v4 fallback (pipeline-state.mjs, ~line 4786).
 */
function fixtureV4(name) {
  const dir = mkdtempSync(join(tmpdir(), `pipeline-rebind-runner-v4-${name}-`)); roots.push(dir);
  const featureDir = join(dir, "specs", "runner-v4-shaped");
  mkdirSync(featureDir, { recursive: true });
  mkdirSync(dirname(statePath(dir)), { recursive: true });
  const planPath = "specs/runner-v4-shaped/prd_runner_v4.md";
  const specPath = "specs/runner-v4-shaped/spec.md";
  const oldSpecSha = hash("# older V4 Spec\n");
  writeFileSync(join(dir, specPath), "# later V4 Spec\n");
  const newSpecSha = hash(readFileSync(join(dir, specPath)));
  writeFileSync(join(dir, planPath), `<!-- po-language: en -->\n<!-- technical-spec-sha256: ${oldSpecSha} -->\n# Runner-V4-shaped PRD\n`);
  const planSha = hash(readFileSync(join(dir, planPath)));
  const profile = { schema: "pipeline.po-gate-authority-evidence.v1", humanFacing: "en", sourceSha256: h("1"), runtimeSha256: h("2"), receiptSha256: h("3"), repositoryFingerprint: h("4") };
  const continuity = {
    schema: "pipeline.continuity.v0", featureId: "runner-v4-shaped", revision: 3,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" },
    authority: { prd: { path: planPath, sha256: planSha }, spec: { path: specPath, sha256: oldSpecSha }, result: null },
    queueHead: { packageId: "runner-v4", actionId: "rebind", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
  const poGateAuthority = { ...profile, schema: "pipeline.po-gate-authority.v2", planPath, planSha256: planSha, specPath, specSha256: oldSpecSha };
  const submission = {
    schema: "pipeline.plan-submission.v1", featureId: "runner-v4-shaped", planPath, planSha256: planSha, specPath, specSha256: oldSpecSha,
    profile: "feature", profileSha256: h("5"), submittedBy: "PO (runner-04 v4 fixture submission)", submittedAt: "2026-07-26T14:00:00.000Z",
  };
  const planApproval = {
    schema: "pipeline.plan-approval.v4", approvedBy: "PO (runner-04 v4 fixture)", approvedAt: "2026-07-26T14:08:37.500Z",
    submissionSha256: sha256CanonicalJson(submission), profileSha256: submission.profileSha256,
    poGateAuthority, priorInvalidationSha256: null,
  };
  const state = {
    schema: SCHEMA_ID, activeFeature: { id: "runner-v4-shaped", planPath, phase: "implementation" }, planApproved: true,
    planApproval, planSubmission: submission, continuity, updatedAt: "2026-07-26T14:08:37.500Z",
  };
  writeFileSync(statePath(dir), JSON.stringify(state, null, 2) + "\n");
  const deps = {
    dir, now: () => "2026-07-28T10:00:00.000Z", ownerNonce: () => `rebind-runner-v4-${String(++nonce).padStart(8, "0")}`,
    env: runnerEnv("codex"),
    poGateProfile: () => ({ ok: true, value: profile }),
    poGateAuthority: ({ expectedPlanSha256, expectedSpecSha256 }) => expectedSpecSha256 === newSpecSha && typeof expectedPlanSha256 === "string"
      ? { ok: true, value: { ...profile, schema: "pipeline.po-gate-authority.v2", planPath, planSha256: expectedPlanSha256, specPath, specSha256: newSpecSha } }
      : { ok: false, code: "PO-GATE-AUTHORITY-STALE" },
    v4Inspection: () => ({ status: "ready" }),
  };
  return { dir, deps, planPath, specPath, newSpecSha };
}

test("rebind-plan (V4-SCHEMA): a v4-schema planApproval with a genuinely stale, otherwise-valid authority now succeeds", () => {
  const f = fixtureV4("stale");
  const plan = planRebind(f);
  assert.equal(plan.schema, "pipeline.po-authority-rebind-plan.v1");
  assert.deepEqual(plan.applyAction.argv.slice(-2), ["--runner", "codex"]);
  const applied = invoke(plan.applyAction.argv.slice(1), { ...f.deps, env: {} });
  assert.equal(applied.status, 0, applied.err);
  const result = JSON.parse(applied.out);
  assert.equal(result.phase, "design");
});

test("rebind-plan (V4-SCHEMA): a v4-schema planApproval that is NOT stale still fails PO-REBIND-NOT-STALE, not PO-REBIND-APPROVAL", () => {
  const f = fixtureV4("not-stale");
  writeFileSync(join(f.dir, f.planPath), `<!-- po-language: en -->\n<!-- technical-spec-sha256: ${f.newSpecSha} -->\n# Runner-V4-shaped PRD\n`);
  const rejected = invoke(["po-authority-rebind-plan"], f.deps);
  assert.equal(rejected.status, 2);
  assert.match(rejected.err, /PO-REBIND-NOT-STALE/);
  assert.ok(!/PO-REBIND-APPROVAL/.test(rejected.err), rejected.err);
});

test("rebind-apply: every explicit supported runner reaches all three V4 intents unchanged", () => {
  for (const runner of ["claude", "codex", "antigravity"]) {
    const f = fixture(`explicit-${runner}`);
    const plan = planRebind({ ...f, deps: { ...f.deps, env: runnerEnv(runner) } });
    assert.deepEqual(plan.applyAction.argv.slice(-2), ["--runner", runner]);
    assert.equal(isSanctionedLifecycleCommand(actionCommand(plan.applyAction), f.dir), true);
    const observed = [];
    const applied = invoke(plan.applyAction.argv.slice(1), {
      ...f.deps, env: {},
      v4Inspection: ({ intent, runner: observedRunner }) => { observed.push({ intent, runner: observedRunner }); return { status: "ready" }; },
    });
    assert.equal(applied.status, 0, `${runner}: ${applied.err}`);
    assert.deepEqual(observed.map((entry) => entry.intent), ["bootstrap", "session", "dispatch"]);
    assert.ok(observed.every((entry) => entry.runner === runner), JSON.stringify(observed));
  }
});

test("rebind-apply: absent --runner resolves via CLAUDECODE at the CLI boundary (claude)", () => {
  const f = fixture("env-claude");
  const plan = planRebind(f);
  const observed = [];
  const applied = invoke(withoutRunnerTail(plan.applyAction.argv).slice(1), {
    ...f.deps, env: { CLAUDECODE: "1" },
    v4Inspection: ({ runner }) => { observed.push(runner); return { status: "ready" }; },
  });
  assert.equal(applied.status, 0, applied.err);
  assert.deepEqual(observed, ["claude", "claude", "claude"]);
});

test("rebind-apply: absent --runner without a recognized runner marker fails closed instead of guessing codex", () => {
  const f = fixture("env-absent");
  const plan = planRebind(f);
  const observed = [];
  const before = readFileSync(statePath(f.dir), "utf8");
  const applied = invoke(withoutRunnerTail(plan.applyAction.argv).slice(1), {
    ...f.deps, env: {},
    v4Inspection: ({ runner }) => { observed.push(runner); return { status: "ready" }; },
  });
  assert.equal(applied.status, 2);
  assert.match(applied.err, /PO-REBIND-RUNNER-UNKNOWN/u);
  assert.deepEqual(observed, []);
  assert.equal(readFileSync(statePath(f.dir), "utf8"), before);
});

test("rebind-apply: invalid explicit --runner fails closed without mutation", () => {
  const f = fixture("invalid-runner");
  const plan = planRebind(f);
  const before = readFileSync(statePath(f.dir), "utf8");
  const rejectedArgv = [...plan.applyAction.argv.slice(1)];
  rejectedArgv[rejectedArgv.length - 1] = "codepilot";
  const rejected = invoke(rejectedArgv, f.deps);
  assert.equal(rejected.status, 2);
  assert.equal(readFileSync(statePath(f.dir), "utf8"), before);
});

function planAndSelectDecision(f, runner = "codex") {
  const planned = invoke(["po-authority-decision-plan"], { ...f.deps, env: runnerEnv(runner) });
  assert.equal(planned.status, 0, planned.err);
  const plan = JSON.parse(planned.out);
  const selectionAction = plan.selectionActions.find((action) => action.selectedCandidate === "spec");
  assert.deepEqual(selectionAction.argv.slice(-2), ["--runner", runner]);
  assert.equal(isSanctionedLifecycleCommand(actionCommand(selectionAction), f.dir), true);
  const selected = invoke(selectionAction.argv.slice(1), { ...f.deps, env: {} });
  assert.equal(selected.status, 0, selected.err);
  const selection = JSON.parse(selected.out);
  assert.deepEqual(selection.applyAction.argv.slice(-2), ["--runner", runner]);
  assert.equal(isSanctionedLifecycleCommand(actionCommand(selection.applyAction), f.dir), true);
  return selection;
}

test("decision returned-action roundtrip carries every supported runner explicitly through plan, select, and apply", () => {
  for (const runner of ["claude", "codex", "antigravity"]) {
    const f = fixture(`decision-env-${runner}`);
    const selection = planAndSelectDecision(f, runner);
    const observed = [];
    const applied = invoke(selection.applyAction.argv.slice(1), {
      ...f.deps, env: {},
      v4Inspection: ({ runner: observedRunner }) => { observed.push(observedRunner); return { status: "ready" }; },
    });
    assert.equal(applied.status, 0, `${runner}: ${applied.err}`);
    assert.deepEqual(observed, [runner, runner, runner]);
  }
});

test("decision-apply: legacy action without runner or recognized marker fails closed instead of guessing codex", () => {
  const f = fixture("decision-env-absent");
  const selection = planAndSelectDecision(f);
  const observed = [];
  const before = readFileSync(statePath(f.dir), "utf8");
  const applied = invoke(withoutRunnerTail(selection.applyAction.argv).slice(1), {
    ...f.deps, env: {},
    v4Inspection: ({ runner }) => { observed.push(runner); return { status: "ready" }; },
  });
  assert.equal(applied.status, 2);
  assert.match(applied.err, /PO-REBIND-RUNNER-UNKNOWN/u);
  assert.deepEqual(observed, []);
  assert.equal(readFileSync(statePath(f.dir), "utf8"), before);
});

test("rebind returned-action roundtrip recognizes both Codex session identity signals", () => {
  for (const [signal, value] of [["CODEX_SESSION_ID", "session-1"], ["CODEX_THREAD_ID", "thread-1"]]) {
    const f = fixture(`codex-${signal.toLowerCase()}`);
    const plan = planRebind({ ...f, deps: { ...f.deps, env: { [signal]: value } } });
    assert.deepEqual(plan.applyAction.argv.slice(-2), ["--runner", "codex"]);
    const observed = [];
    const applied = invoke(plan.applyAction.argv.slice(1), {
      ...f.deps, env: {},
      v4Inspection: ({ runner }) => { observed.push(runner); return { status: "ready" }; },
    });
    assert.equal(applied.status, 0, `${signal}: ${applied.err}`);
    assert.deepEqual(observed, ["codex", "codex", "codex"]);
  }
});

test("whitespace-only Codex identity signals do not impersonate a Codex runner", () => {
  for (const signal of ["CODEX_SESSION_ID", "CODEX_THREAD_ID"]) {
    const f = fixture(`blank-${signal.toLowerCase()}`);
    const rejected = invoke(["po-authority-rebind-plan"], {
      ...f.deps,
      env: { [signal]: "   " },
    });
    assert.equal(rejected.status, 2);
    assert.match(rejected.err, /PO-REBIND-RUNNER-UNKNOWN/u);
  }
});
