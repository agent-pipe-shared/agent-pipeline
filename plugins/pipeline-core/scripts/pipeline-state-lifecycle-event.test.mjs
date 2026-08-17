// SPDX-License-Identifier: SUL-1.0
/**
 * PHX L-AC-01, call-site coverage: `pipeline-state.mjs continuity-cas` is the
 * only transaction that installs a `queueHead.dispatch`, and it is where the
 * dispatch lifecycle event is produced and durably written.
 *
 * This is a NEW suite rather than an addition to `harness/scripts/pipeline-state.test.mjs`:
 * that file gates the state writer this dispatch modifies, and TP-5/QG-04 forbid an
 * implementing agent from editing the tests that gate its own implementation. The
 * gating suite therefore stays byte-identical and is run unmodified as the
 * regression check.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, readState, statePath } from "./pipeline-state.mjs";
import { validateLifecycleGovernanceEvent } from "../lib/lifecycle-governance-events.mjs";

const FEATURE = "feature-lifecycle";
const NOW = () => "2026-08-17T00:00:00.000Z";
const A = "a".repeat(64), B = "b".repeat(64), D = "d".repeat(64);
const COMMIT = "9".repeat(40), TREE = "8".repeat(40);
const OUT = "artifacts/lifecycle/dispatch-1.json";

function identity(overrides = {}) {
  return {
    featureId: FEATURE,
    queueRevision: 0,
    packageId: "P1",
    actionId: "continuity-writer",
    dispatchId: "dispatch-1",
    attemptId: "attempt-1",
    // `authority.result` is null in this fixture, so the dispatch must report the
    // same absence -- the continuity validator binds the two.
    authorityDigests: { prdSha256: A, specSha256: B, resultSha256: null },
    routeRequestSha256: D,
    mayDelegate: false,
    ...overrides,
  };
}

function queue(overrides = {}) {
  return { packageId: "P1", actionId: "continuity-writer", nextAction: "poll", productRetryCount: 0, environmentRerouteCount: 0, dispatch: identity(), ...overrides };
}

function continuityState(overrides = {}) {
  return {
    schema: "pipeline.continuity.v0",
    featureId: FEATURE,
    revision: 0,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" },
    authority: { prd: { path: "specs/prd.md", sha256: A }, spec: { path: "specs/spec.md", sha256: B }, result: null },
    queueHead: queue({ nextAction: "dispatch", dispatch: null }),
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    capacity: { concurrencyLimit: 3, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
    ...overrides,
  };
}

const deps = (dir) => ({ dir, now: NOW, gitCandidate: () => ({ ok: true, commit: COMMIT, tree: TREE }) });
const args = (sub, revision, requestFile) => [sub, "--expected-revision", String(revision), "--request-file", requestFile, "--lock-token", "token-00000001"];
const lifecycleFlags = (out = OUT) => ["--lifecycle-event-out", out, "--parent-orchestration-id", "orchestration-1", "--worker-id", "worker-1", "--correlation-id", "corr-1"];

function request(dir, name, value) {
  const rel = `${name}.json`;
  writeFileSync(join(dir, rel), `${JSON.stringify(value, null, 2)}\n`);
  return rel;
}

/** A repository at revision 0 with no admitted dispatch, plus the admitting next state. */
function fixture(name) {
  const dir = mkdtempSync(join(tmpdir(), `ps-lifecycle-${name}-`));
  assert.equal(run(["set-feature", "--id", FEATURE, "--plan-path", "specs/prd.md"], { dir, now: NOW }), 0);
  assert.equal(run(args("continuity-init", "absent", request(dir, "init", continuityState())), deps(dir)), 0);
  const next = structuredClone(readState(dir).state.continuity);
  next.revision = 1;
  next.queueHead = queue({ dispatch: identity({ queueRevision: 1 }) });
  next.resume = { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" };
  return { dir, next };
}

// --- the admission produces a durable, schema-valid lifecycle event -----------
{
  const { dir, next } = fixture("emit");
  const code = run([...args("continuity-cas", 0, request(dir, "admission", next)), ...lifecycleFlags()], deps(dir));
  assert.equal(code, 0);
  assert.equal(readState(dir).state.continuity.revision, 1);
  assert.equal(existsSync(join(dir, OUT)), true);
  // Read back from disk and let the closed schema itself decide admissibility.
  const persisted = validateLifecycleGovernanceEvent(JSON.parse(readFileSync(join(dir, OUT), "utf8")));
  assert.equal(persisted.kind, "dispatch");
  assert.equal(persisted.status, "active");
  assert.equal(persisted.reasonCode, "DISPATCH_ADMITTED");
  assert.deepEqual(persisted.correlation, { packageId: "P1", dispatchId: "dispatch-1", attemptId: "attempt-1", workerId: "worker-1", correlationId: "corr-1", queueRevision: 1 });
  assert.deepEqual(persisted.candidate, { commit: COMMIT, tree: TREE });
  assert.equal(persisted.invalidatesEventId, null);
  assert.equal(persisted.supersedesEventId, null);
}

// --- absent flags keep the previous behaviour exactly ------------------------
{
  const { dir, next } = fixture("opt-in");
  assert.equal(run(args("continuity-cas", 0, request(dir, "admission", next)), deps(dir)), 0);
  assert.equal(readState(dir).state.continuity.revision, 1);
  assert.equal(existsSync(join(dir, OUT)), false);
}

// --- an occupied target is refused, never overwritten, with zero mutation -----
{
  const { dir, next } = fixture("collision");
  mkdirSync(join(dir, "artifacts", "lifecycle"), { recursive: true });
  writeFileSync(join(dir, OUT), "occupied");
  const before = readFileSync(statePath(dir), "utf8");
  assert.equal(run([...args("continuity-cas", 0, request(dir, "admission", next)), ...lifecycleFlags()], deps(dir)), 2);
  assert.equal(readFileSync(join(dir, OUT), "utf8"), "occupied");
  assert.equal(readFileSync(statePath(dir), "utf8"), before);
}

// --- a target outside the repository root is refused --------------------------
{
  const { dir, next } = fixture("escape");
  const before = readFileSync(statePath(dir), "utf8");
  assert.equal(run([...args("continuity-cas", 0, request(dir, "admission", next)), ...lifecycleFlags("../escaped.json")], deps(dir)), 2);
  assert.equal(readFileSync(statePath(dir), "utf8"), before);
}

// --- orchestration identity is all-or-nothing --------------------------------
{
  const { dir, next } = fixture("partial");
  const before = readFileSync(statePath(dir), "utf8");
  assert.equal(run([...args("continuity-cas", 0, request(dir, "admission", next)), "--lifecycle-event-out", OUT, "--worker-id", "worker-1"], deps(dir)), 2);
  assert.equal(existsSync(join(dir, OUT)), false);
  assert.equal(readFileSync(statePath(dir), "utf8"), before);
}

// --- a transition that admits no dispatch is refused, not silently skipped ----
{
  const { dir } = fixture("no-admission");
  const idle = structuredClone(readState(dir).state.continuity);
  idle.revision = 1;
  idle.resume = { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" };
  const before = readFileSync(statePath(dir), "utf8");
  assert.equal(run([...args("continuity-cas", 0, request(dir, "idle", idle)), ...lifecycleFlags()], deps(dir)), 2);
  assert.equal(existsSync(join(dir, OUT)), false);
  assert.equal(readFileSync(statePath(dir), "utf8"), before);
}

// --- the flag belongs to continuity-cas only ---------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), "ps-lifecycle-scope-"));
  assert.equal(run(["set-feature", "--id", FEATURE, "--plan-path", "specs/prd.md"], { dir, now: NOW }), 0);
  assert.equal(run([...args("continuity-init", "absent", request(dir, "init", continuityState())), ...lifecycleFlags()], deps(dir)), 2);
  assert.equal(existsSync(join(dir, OUT)), false);
}

// --- a candidate the repository cannot observe yields no invented candidate ---
{
  const { dir, next } = fixture("no-candidate");
  const blind = { ...deps(dir), gitCandidate: () => ({ ok: false, error: "not a repository" }) };
  const before = readFileSync(statePath(dir), "utf8");
  assert.equal(run([...args("continuity-cas", 0, request(dir, "admission", next)), ...lifecycleFlags()], blind), 2);
  assert.equal(existsSync(join(dir, OUT)), false);
  assert.equal(readFileSync(statePath(dir), "utf8"), before);
}

console.log("pipeline-state-lifecycle-event: ok");
