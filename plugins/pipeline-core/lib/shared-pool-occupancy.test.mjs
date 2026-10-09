// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalLocalWorkerPoolJson, computeEffectiveCapacity, createLocalWorkerPool, reduceLocalWorkerPool, validateLocalWorkerPool } from "./local-worker-pool.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

// Only existing closed v1 fields: no exit receipt or invented occupancy API.
const A = "a".repeat(64), B = "b".repeat(64), C = "c".repeat(64);
const O = "1".repeat(40), OTHER = "2".repeat(40);
function capacity(limit = 1) {
  const bound = { concurrentTasks: limit, required: true };
  const value = { configured: { ...bound }, operator: { ...bound }, certified: { ...bound }, observed: { ...bound }, pressure: { ...bound }, reserved: { elephant: 0, verify: 0, critic: 0 } };
  return { ...value, effective: computeEffectiveCapacity(value) };
}
function worker(subject = A, state = "running") {
  const suffix = subject === A ? "1" : "2";
  return { subjectSha256: subject, workspaceLease: { leaseId: `lease-${suffix}`, subjectSha256: subject, repository: A, baseCommit: O, candidateCommit: O, worktreePathSha256: subject, writePaths: [`lib/worker-${suffix}.mjs`], ownerNonce: `owner-${suffix}`, issuedMonotonicMs: 0, expiresMonotonicMs: 60000, cleanupState: "active", evidenceSha256: C }, process: { identitySha256: subject, separation: "observed", assuranceEvidenceSha256: C }, heartbeat: { intervalMs: 1000, orphanAfterMs: 3000, lastObservedMonotonicMs: 0, evidenceSha256: C }, state, lastTransitionMonotonicMs: 0, stateEvidenceSha256: C };
}
function admission(value) {
  return { taskId: value.subjectSha256 === A ? "task-1" : "task-2", subjectSha256: value.subjectSha256, requestSha256: B, baseCommit: O, candidateCommit: O, writePaths: [...value.workspaceLease.writePaths], state: "admitted" };
}
const sort = (values) => values.sort((a, b) => canonicalLocalWorkerPoolJson(a).localeCompare(canonicalLocalWorkerPoolJson(b)));
function input(limit = 1) {
  const value = worker();
  return { poolId: "occupancy-pool", candidate: { repositorySha256: A, baseCommit: O, candidateCommit: O }, queueRevision: 0, capacity: capacity(limit), workers: [value], admissionSet: [admission(value)], cleanupOwner: { subjectSha256: A, ownerNonce: "owner-1", evidenceSha256: C }, serialFallback: false };
}
function addDistinct(value) {
  const next = structuredClone(value), additional = worker(B, "admitted");
  next.workers = sort([...next.workers, additional]);
  next.admissionSet = sort([...next.admissionSet, admission(additional)]);
  return next;
}
function observe(value, kind, monotonicMs, candidateCommit = O) {
  const result = reduceLocalWorkerPool(value, { kind, subjectSha256: A, candidateCommit, monotonicMs, evidenceSha256: B });
  assert.equal(result.ok, true, `SETUP: existing ${kind} observation must reduce`);
  assert.equal(validateLocalWorkerPool(result.pool).ok, true, "SETUP: reduced single-worker pool must be valid");
  assert.deepEqual(result.pool.workers[0].process, value.workers[0].process, "SETUP: observation supplies no new process disposition");
  return result.pool;
}
function createCode(value) {
  const { schema, ...fields } = value;
  try { createLocalWorkerPool(fields); return null; } catch (error) { return error.message; }
}
function pin(t, value, expected = "BOUND:capacity-exceeded") {
  const over = addDistinct(value);
  t.diagnostic(`fixture=${canonicalLocalWorkerPoolJson(over)}`);
  t.diagnostic(`fixtureSha256=${createHash("sha256").update(canonicalLocalWorkerPoolJson(over)).digest("hex")}`);
  assert.deepEqual({ validation: validateLocalWorkerPool(over), creationCode: createCode(over) }, { validation: { ok: false, code: expected }, creationCode: expected }, "SP-OCC unresolved process identity must remain occupied");
}
const cases = [
  { id: "SP-OCC01", name: "timeout keeps an unresolved execution occupied at C1", run(t) {
    const value = observe(createLocalWorkerPool(input()), "timeout", 1000);
    assert.equal(value.workers[0].state, "timed-out");
    pin(t, value);
  } },
  { id: "SP-OCC02", name: "orphaned after suspicion keeps an unresolved execution occupied at C1", run(t) {
    let value = observe(createLocalWorkerPool(input()), "orphan-suspected", 3000);
    value = observe(value, "orphaned", 3001);
    assert.equal(value.workers[0].state, "orphaned");
    pin(t, value);
  } },
  { id: "SP-OCC03", name: "recovered observation alone keeps an unresolved execution occupied at C1", run(t) {
    let value = observe(createLocalWorkerPool(input()), "orphan-suspected", 3000);
    value = observe(value, "recovered", 3001);
    assert.equal(value.workers[0].state, "recovered");
    pin(t, value);
  } },
  { id: "SP-OCC04", name: "stale-candidate invalidation keeps the unresolved process occupied at C1", run(t) {
    const value = observe(createLocalWorkerPool(input()), "stale-candidate", 1000, OTHER);
    assert.equal(value.workers[0].state, "rejected");
    assert.equal(value.admissionSet[0].state, "invalidated");
    pin(t, value);
  } },
  { id: "SP-OCC05", name: "running cancellation and orphan suspicion retain capacity refusals", run(t) {
    const running = createLocalWorkerPool(input());
    pin(t, running);
    pin(t, observe(running, "cancel", 1000));
    pin(t, observe(running, "orphan-suspected", 3000));
    const unavailable = structuredClone(running);
    unavailable.workers[0].process.separation = "unavailable";
    assert.equal(validateLocalWorkerPool(unavailable).ok, true);
    pin(t, unavailable);
  } },
  { id: "SP-OCC06", name: "over-capacity unavailable bounds and serial limits still refuse", run() {
    const over = addDistinct(createLocalWorkerPool(input()));
    assert.equal(validateLocalWorkerPool(over).code, "BOUND:capacity-exceeded");
    const unknown = structuredClone(over);
    unknown.capacity.certified.concurrentTasks = null;
    unknown.capacity.effective = computeEffectiveCapacity(unknown.capacity);
    assert.equal(validateLocalWorkerPool(unknown).code, "AUTHORITY:parallel-unavailable");
    const serial = addDistinct(createLocalWorkerPool(input(2)));
    serial.serialFallback = true;
    assert.equal(validateLocalWorkerPool(serial).code, "BOUND:serial-fallback");
  } },
  { id: "SP-OCC07", name: "malformed lease stale owner and foreign candidate still refuse", run() {
    const original = createLocalWorkerPool(input());
    const lease = structuredClone(original);
    lease.workers[0].workspaceLease.expiresMonotonicMs = 0;
    assert.equal(validateLocalWorkerPool(lease).code, "BOUND:pool-members");
    const owner = structuredClone(original);
    owner.cleanupOwner.ownerNonce = "stale-owner";
    assert.equal(validateLocalWorkerPool(owner).code, "STALE:cleanup-owner");
    const candidate = structuredClone(original);
    candidate.workers[0].workspaceLease.candidateCommit = OTHER;
    assert.equal(validateLocalWorkerPool(candidate).code, "AUTHORITY:workspace-binding");
  } },
  { id: "SP-OCC08", name: "result import and stale evidence cannot supply release authority", run() {
    const running = createLocalWorkerPool(input());
    const unresolved = [running, observe(running, "timeout", 1000), observe(observe(running, "orphan-suspected", 3000), "orphaned", 3001), observe(observe(running, "orphan-suspected", 3000), "recovered", 3001), observe(running, "stale-candidate", 1000, OTHER)];
    for (const value of unresolved) {
      const event = { kind: "result-import", subjectSha256: A, candidateCommit: O, monotonicMs: 4000, evidenceSha256: B };
      assert.deepEqual(reduceLocalWorkerPool(value, event), { ok: false, code: "UNAVAILABLE:result-import-authority", pool: null });
      if (value !== running) assert.equal(reduceLocalWorkerPool(value, { ...event, kind: "heartbeat", monotonicMs: 0 }).code, "STALE:observation");
    }
  } },
];
assert.equal(cases.length, 8, "the bounded SP-OCC corpus must be registered before execution");
registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? "3"), maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
