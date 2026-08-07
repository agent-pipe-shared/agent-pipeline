#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * REBIND-RUNNER-04: the `po-authority-rebind-apply` recovery transaction must
 * observe its in-transaction V4 lifecycle readback with the invoking
 * session's own runner (ADR-0051 class), never the historical "codex"
 * default -- while `po-authority-decision-apply` (a different subcommand
 * sharing the same `runPoAuthorityRebindApply` helper) stays byte-for-byte
 * unaffected. New file (not an edit of the guarded `harness/scripts/
 * pipeline-state.test.mjs` / TP-5 suite) exercising the same public `run`
 * export and the same pre-existing `deps.v4Inspection` injection seam.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";
import { dirname, join } from "node:path";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { run, SCHEMA_ID, statePath } from "./pipeline-state.mjs";

const roots = [];
afterEach(() => { while (roots.length) rmSync(roots.pop(), { recursive: true, force: true }); });

const h = (value) => value.repeat(64);
const hash = (value) => createHash("sha256").update(value).digest("hex");
let nonce = 0;

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

test("rebind-apply: explicit --runner claude reaches all three V4 intents", () => {
  const f = fixture("explicit-claude");
  const plan = planRebind(f);
  const observed = [];
  const applied = invoke([...plan.applyAction.argv.slice(1), "--runner", "claude"], {
    ...f.deps,
    v4Inspection: ({ intent, runner }) => { observed.push({ intent, runner }); return { status: "ready" }; },
  });
  assert.equal(applied.status, 0, applied.err);
  assert.deepEqual(observed.map((entry) => entry.intent), ["bootstrap", "session", "dispatch"]);
  assert.ok(observed.every((entry) => entry.runner === "claude"));
});

test("rebind-apply: absent --runner resolves via CLAUDECODE at the CLI boundary (claude)", () => {
  const f = fixture("env-claude");
  const plan = planRebind(f);
  const observed = [];
  const applied = invoke(plan.applyAction.argv.slice(1), {
    ...f.deps, env: { CLAUDECODE: "1" },
    v4Inspection: ({ runner }) => { observed.push(runner); return { status: "ready" }; },
  });
  assert.equal(applied.status, 0, applied.err);
  assert.deepEqual(observed, ["claude", "claude", "claude"]);
});

test("rebind-apply: absent --runner without CLAUDECODE resolves explicitly to codex", () => {
  const f = fixture("env-codex");
  const plan = planRebind(f);
  const observed = [];
  const applied = invoke(plan.applyAction.argv.slice(1), {
    ...f.deps, env: {},
    v4Inspection: ({ runner }) => { observed.push(runner); return { status: "ready" }; },
  });
  assert.equal(applied.status, 0, applied.err);
  assert.deepEqual(observed, ["codex", "codex", "codex"]);
});

test("rebind-apply: invalid explicit --runner fails closed without mutation", () => {
  const f = fixture("invalid-runner");
  const plan = planRebind(f);
  const before = readFileSync(statePath(f.dir), "utf8");
  const rejected = invoke([...plan.applyAction.argv.slice(1), "--runner", "codepilot"], f.deps);
  assert.equal(rejected.status, 2);
  assert.equal(readFileSync(statePath(f.dir), "utf8"), before);
});

test("decision-apply: V4 request carries no runner (unaffected by the rebind-apply flag)", () => {
  const f = fixture("decision-unaffected");
  const planned = invoke(["po-authority-decision-plan"], f.deps);
  assert.equal(planned.status, 0, planned.err);
  const plan = JSON.parse(planned.out);
  const selectionAction = plan.selectionActions.find((action) => action.selectedCandidate === "spec");
  const selected = invoke(selectionAction.argv.slice(1), f.deps);
  assert.equal(selected.status, 0, selected.err);
  const selection = JSON.parse(selected.out);
  const observed = [];
  const applied = invoke(selection.applyAction.argv.slice(1), {
    ...f.deps, env: { CLAUDECODE: "1" },
    v4Inspection: ({ runner }) => { observed.push(runner); return { status: "ready" }; },
  });
  assert.equal(applied.status, 0, applied.err);
  assert.deepEqual(observed, [undefined, undefined, undefined]);
});
