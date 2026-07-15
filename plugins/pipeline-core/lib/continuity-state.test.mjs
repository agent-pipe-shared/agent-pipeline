import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CONTINUITY_STATE_CODES,
  applyDecisionSelection,
  clearDecisionSelection,
  compareAndSwapContinuity,
  continuityDispatchAllowed,
  integrateContinuityFinal,
  validateContinuityState,
} from "./continuity-state.mjs";
import { computeContinuityFinalDigest } from "./continuity-host-adapter.mjs";
import { validateAgainstSchema } from "./schema-lite.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const FEATURE = "v0.3-phase2.6-sdlc-throughput-hardening";
const schema = JSON.parse(readFileSync(fileURLToPath(new URL("../scripts/continuity-state.schema.json", import.meta.url)), "utf8"));

function identity(overrides = {}) {
  return {
    featureId: FEATURE,
    queueRevision: 0,
    packageId: "P1",
    actionId: "continuity-state",
    dispatchId: "dispatch-p1-02",
    attemptId: "attempt-01",
    authorityDigests: { prdSha256: A, specSha256: B, resultSha256: C },
    routeRequestSha256: D,
    mayDelegate: false,
    ...overrides,
  };
}

function queueHead(overrides = {}) {
  return {
    packageId: "P1",
    actionId: "continuity-state",
    nextAction: "poll",
    productRetryCount: 0,
    environmentRerouteCount: 0,
    dispatch: identity(),
    ...overrides,
  };
}

function courseBlocker() {
  return {
    type: "course",
    signature: "repeat-product-v1",
    resumeCondition: { kind: "po-decision", evidenceSha256: A },
    decisionBrief: {
      decisionBriefId: "brief-01",
      decisionBriefSha256: B,
      resultPath: "specs/result.md",
    },
  };
}

function state(overrides = {}) {
  return {
    schema: "pipeline.continuity.v0",
    featureId: FEATURE,
    revision: 0,
    authority: {
      prd: { path: "specs/prd.md", sha256: A },
      spec: { path: "specs/spec.md", sha256: B },
      result: { path: "specs/result.md", sha256: C },
    },
    queueHead: queueHead(),
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    capacity: {
      concurrencyLimit: 3,
      reservedCriticSlots: 1,
      reservedRecoverySlots: 1,
      fallbackPolicy: "defer",
    },
    ...overrides,
  };
}

function finalObservation(finalOutcome = "succeeded", result = { verdict: "pass" }, id = identity()) {
  const resultJson = JSON.stringify(result);
  const envelope = {
    schema: "pipeline.continuity-final.v0",
    identity: id,
    outcome: finalOutcome,
    resultJson,
    resultBytes: Buffer.byteLength(resultJson, "utf8"),
  };
  return {
    status: "completed",
    identity: structuredClone(id),
    final: { ...envelope, resultDigest: computeContinuityFinalDigest(envelope) },
  };
}

function integratedNext(current, observation, finalOutcome = "succeeded") {
  const next = structuredClone(current);
  next.revision += 1;
  next.acknowledgedFinal = {
    identity: structuredClone(observation.identity),
    resultDigest: observation.final.resultDigest,
    finalOutcome,
    integratedRevision: next.revision,
  };
  next.resume = { mode: "immediate", sourceRevision: next.revision, reasonCode: "active-turn" };
  if (finalOutcome === "succeeded") {
    next.queueHead = queueHead({
      actionId: "continuity-writer",
      nextAction: "dispatch",
      dispatch: null,
    });
    next.blocker = null;
  } else {
    next.queueHead = null;
    next.blocker = {
      type: "product",
      signature: "product-final-failed-v1",
      resumeCondition: { kind: "manual", evidenceSha256: observation.final.resultDigest },
      decisionBrief: null,
    };
  }
  return next;
}

check("valid queue state passes runtime and supported schema subset", () => {
  const value = state();
  assert.deepEqual(validateContinuityState(value, FEATURE), { ok: true, code: "CS-VALID" });
  assert.equal(validateAgainstSchema(value, schema).valid, true);
});

check("valid blocker state passes", () => {
  const value = state({ queueHead: null, blocker: courseBlocker() });
  assert.equal(validateContinuityState(value, FEATURE).ok, true);
});

for (const [name, mutate] of [
  ["both queue and blocker", (value) => { value.blocker = courseBlocker(); }],
  ["neither queue nor blocker", (value) => { value.queueHead = null; }],
  ["wrong active feature", (value) => { value.featureId = "other-feature"; }],
  ["unknown root field", (value) => { value.rawLog = "private"; }],
  ["unknown nested field", (value) => { value.queueHead.extra = true; }],
  ["negative revision", (value) => { value.revision = -1; }],
  ["fractional revision", (value) => { value.revision = 0.5; }],
  ["unsafe authority path", (value) => { value.authority.prd.path = "../private/prd.md"; }],
  ["uppercase digest", (value) => { value.authority.prd.sha256 = A.toUpperCase(); }],
  ["delegating dispatch", (value) => { value.queueHead.dispatch.mayDelegate = true; }],
  ["future dispatch revision", (value) => { value.queueHead.dispatch.queueRevision = 1; }],
  ["product retry above one", (value) => { value.queueHead.productRetryCount = 2; }],
  ["missing critic reservation", (value) => { value.capacity.reservedCriticSlots = 0; }],
]) {
  check(`${name} fails closed`, () => {
    const value = state();
    mutate(value);
    assert.equal(validateContinuityState(value, FEATURE).ok, false);
  });
}

check("result authority may be absent without creating a prose copy", () => {
  const value = state();
  value.authority.result = null;
  value.queueHead.dispatch.authorityDigests.resultSha256 = null;
  assert.equal(validateContinuityState(value, FEATURE).ok, true);
});

check("a live dispatch from a lower state revision is stale and invalid", () => {
  const value = state({
    revision: 1,
    resume: { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" },
  });
  assert.equal(value.queueHead.dispatch.queueRevision, 0);
  assert.equal(validateContinuityState(value, FEATURE).ok, false);
});

check("a pre-seeded acknowledgement without an integration revision is invalid", () => {
  const value = state();
  value.acknowledgedFinal = {
    identity: identity(), resultDigest: A, finalOutcome: "succeeded", integratedRevision: 0,
  };
  assert.equal(validateContinuityState(value, FEATURE).ok, false);
});

check("maximal bounded hot-state fixture remains below 8 KiB", () => {
  const id = "x".repeat(128);
  const originId = "o".repeat(128);
  const fallbackId = "f".repeat(128);
  const path = `d/${"p".repeat(237)}`;
  const dispatch = identity({
    featureId: id, queueRevision: 1, packageId: id, actionId: id,
    dispatchId: fallbackId, attemptId: id,
  });
  const value = state({
    featureId: id,
    revision: 1,
    authority: {
      prd: { path, sha256: A }, spec: { path, sha256: B }, result: { path, sha256: C },
    },
    queueHead: queueHead({
      packageId: id, actionId: id, environmentRerouteCount: 1, dispatch,
    }),
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "compact-reload" },
    recovery: {
      originLaneId: originId, originDispatchId: originId, originAttemptId: originId,
      environmentEvidenceSha256: A, sameLaneRetryProhibited: true, fallbackStatus: "running",
      fallbackLaneId: fallbackId, fallbackDispatchId: fallbackId,
      narrowingContractSha256: B, originProductRetryCount: 0, resultDigest: null, count: 1,
    },
    decisionTxn: {
      idempotencyKey: id, briefSha256: A, intentSha256: B, selectedOptionId: id,
      preSelectionRevision: 0, selectedRevision: 1, dispatchableRevision: 2, phase: "state-applied",
    },
  });
  value.queueHead.dispatch.authorityDigests = { prdSha256: A, specSha256: B, resultSha256: C };
  assert.equal(validateContinuityState(value, id).ok, true);
  assert.equal(Buffer.byteLength(JSON.stringify(value), "utf8") < 8_192, true);
});

check("stale CAS is zero mutation and input remains byte-identical", () => {
  const current = state();
  const before = JSON.stringify(current);
  const next = structuredClone(current); next.revision = 1;
  const result = compareAndSwapContinuity(current, { expectedRevision: 1, next }, FEATURE);
  assert.deepEqual(result, { ok: false, code: "CS-STALE", mutated: false, state: null });
  assert.equal(JSON.stringify(current), before);
});

check("CAS accepts exactly one validated revision", () => {
  const current = state();
  current.queueHead.dispatch = null;
  current.queueHead.nextAction = "verify";
  const next = structuredClone(current);
  next.revision = 1;
  next.resume = { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "po-interrupt" };
  const result = compareAndSwapContinuity(current, { expectedRevision: 0, next }, FEATURE);
  assert.equal(result.code, "CS-CAS-APPLIED");
  assert.equal(result.state.revision, 1);
  result.state.resume.mode = "immediate";
  assert.equal(next.resume.mode, "resume-on-next-turn");
});

check("CAS rejects a skipped revision", () => {
  const current = state(); current.queueHead.dispatch = null; current.queueHead.nextAction = "verify";
  const next = structuredClone(current); next.revision = 2;
  assert.equal(compareAndSwapContinuity(current, { expectedRevision: 0, next }, FEATURE).code, "CS-REVISION");
});

check("generic CAS cannot forge an acknowledgement", () => {
  const current = state(); current.queueHead.dispatch = null; current.queueHead.nextAction = "verify";
  const next = structuredClone(current); next.revision = 1;
  next.acknowledgedFinal = {
    identity: identity(), resultDigest: A, finalOutcome: "succeeded", integratedRevision: 1,
  };
  assert.equal(compareAndSwapContinuity(current, { expectedRevision: 0, next }, FEATURE).code, "CS-PROTECTED-ACK");
});

check("generic CAS cannot install or clear a decision marker", () => {
  const current = state(); current.queueHead.dispatch = null; current.queueHead.nextAction = "verify";
  const next = structuredClone(current); next.revision = 1; next.decisionTxn = decisionTxn();
  assert.equal(compareAndSwapContinuity(current, { expectedRevision: 0, next }, FEATURE).code, "CS-PROTECTED-DECISION");
});

check("a polling head is valid but not dispatchable", () => {
  assert.deepEqual(continuityDispatchAllowed(state(), FEATURE), {
    ok: true, code: "CS-NOT-DISPATCH-ACTION", allowed: false,
  });
});

check("an existing dispatch cannot be created a second time", () => {
  const value = state(); value.queueHead.nextAction = "dispatch";
  assert.deepEqual(continuityDispatchAllowed(value, FEATURE), {
    ok: true, code: "CS-NOT-DISPATCH-ACTION", allowed: false,
  });
});

check("exact succeeded final acknowledges and advances in one proposal", () => {
  const current = state();
  const observation = finalObservation();
  const next = integratedNext(current, observation);
  const result = integrateContinuityFinal(current, { expectedRevision: 0, observation, next }, FEATURE);
  assert.equal(result.code, "CS-FINAL-INTEGRATED");
  assert.equal(result.mutated, true);
  assert.equal(result.state.revision, 1);
  assert.equal(result.state.acknowledgedFinal.resultDigest, observation.final.resultDigest);
  assert.equal(result.state.queueHead.actionId, "continuity-writer");
});

check("failed structured final requires and accepts a blocker disposition", () => {
  const current = state();
  const observation = finalObservation("failed", { blocker: "product" });
  const next = integratedNext(current, observation, "failed");
  const result = integrateContinuityFinal(current, { expectedRevision: 0, observation, next }, FEATURE);
  assert.equal(result.code, "CS-FINAL-INTEGRATED");
  assert.equal(result.state.blocker.type, "product");
});

check("failed final cannot silently advance to another queue head", () => {
  const current = state();
  const observation = finalObservation("failed", { blocker: "product" });
  const next = integratedNext(current, observation, "succeeded");
  next.acknowledgedFinal.finalOutcome = "failed";
  const result = integrateContinuityFinal(current, { expectedRevision: 0, observation, next }, FEATURE);
  assert.equal(result.code, "CS-ACK-MISMATCH");
});

check("exact replay after head advance is a zero-mutation duplicate", () => {
  const current = state();
  const observation = finalObservation();
  const integrated = integrateContinuityFinal(current, {
    expectedRevision: 0,
    observation,
    next: integratedNext(current, observation),
  }, FEATURE).state;
  const before = JSON.stringify(integrated);
  const replay = integrateContinuityFinal(integrated, { expectedRevision: 1, observation, next: integrated }, FEATURE);
  assert.equal(replay.code, "CS-DUPLICATE-FINAL");
  assert.equal(replay.mutated, false);
  assert.equal(JSON.stringify(integrated), before);
});

for (const [name, mutate] of [
  ["dispatch mismatch", (observation) => { observation.identity.dispatchId = "other"; observation.final.identity.dispatchId = "other"; }],
  ["attempt mismatch", (observation) => { observation.identity.attemptId = "other"; observation.final.identity.attemptId = "other"; }],
  ["digest mismatch", (observation) => { observation.final.resultDigest = A; }],
  ["outcome flip", (observation) => { observation.final.outcome = "failed"; }],
]) {
  check(`${name} final is null-mutating`, () => {
    const current = state();
    const before = JSON.stringify(current);
    const observation = finalObservation();
    mutate(observation);
    const result = integrateContinuityFinal(current, { expectedRevision: 0, observation, next: current }, FEATURE);
    assert.equal(result.ok, false);
    assert.equal(result.mutated, false);
    assert.equal(JSON.stringify(current), before);
  });
}

for (const [name, mutate] of [
  ["reroute count zero", (value) => { value.queueHead.environmentRerouteCount = 0; }],
  ["product retry drift", (value) => { value.queueHead.productRetryCount = 1; }],
  ["unrelated dispatch", (value) => { value.queueHead.dispatch.dispatchId = "unrelated-dispatch"; }],
]) {
  check(`failed recovery rejects ${name} while a queue remains`, () => {
    const fallbackIdentity = identity({ dispatchId: "fallback-dispatch" });
    const value = state({
      queueHead: queueHead({ environmentRerouteCount: 1, dispatch: fallbackIdentity }),
      recovery: {
        originLaneId: "origin-lane", originDispatchId: "origin-dispatch", originAttemptId: "origin-attempt",
        environmentEvidenceSha256: A, sameLaneRetryProhibited: true, fallbackStatus: "failed",
        fallbackLaneId: "fallback-lane", fallbackDispatchId: "fallback-dispatch",
        narrowingContractSha256: B, originProductRetryCount: 0, resultDigest: null, count: 1,
      },
    });
    mutate(value);
    assert.equal(validateContinuityState(value, FEATURE).ok, false);
  });
}

check("failed recovery is coherent only as a typed terminal blocker without a queue", () => {
  const value = state({
    queueHead: null,
    blocker: {
      type: "environment", signature: "fallback-environment-failed-v1",
      resumeCondition: { kind: "manual", evidenceSha256: A }, decisionBrief: null,
    },
    recovery: {
      originLaneId: "origin-lane", originDispatchId: "origin-dispatch", originAttemptId: "origin-attempt",
      environmentEvidenceSha256: A, sameLaneRetryProhibited: true, fallbackStatus: "failed",
      fallbackLaneId: "fallback-lane", fallbackDispatchId: "fallback-dispatch",
      narrowingContractSha256: B, originProductRetryCount: 0, resultDigest: null, count: 1,
    },
  });
  assert.equal(validateContinuityState(value, FEATURE).ok, true);
});

check("completed without final is represented but not integrated", () => {
  const current = state();
  const observation = { status: "completed", identity: identity(), final: null };
  const result = integrateContinuityFinal(current, { expectedRevision: 0, observation, next: current }, FEATURE);
  assert.equal(result.code, "CS-COMPLETED-UNDELIVERED");
  assert.equal(result.mutated, false);
});

check("superseded origin final is null-mutating during fallback", () => {
  const fallbackIdentity = identity({ dispatchId: "fallback-dispatch", attemptId: "fallback-attempt" });
  const current = state({
    queueHead: queueHead({
      environmentRerouteCount: 1,
      dispatch: fallbackIdentity,
    }),
    recovery: {
      originLaneId: "origin-lane",
      originDispatchId: "dispatch-p1-02",
      originAttemptId: "attempt-01",
      environmentEvidenceSha256: A,
      sameLaneRetryProhibited: true,
      fallbackStatus: "running",
      fallbackLaneId: "fallback-lane",
      fallbackDispatchId: "fallback-dispatch",
      narrowingContractSha256: B,
      originProductRetryCount: 0,
      resultDigest: null,
      count: 1,
    },
  });
  const observation = finalObservation("succeeded", { verdict: "late" }, identity());
  const result = integrateContinuityFinal(current, { expectedRevision: 0, observation, next: current }, FEATURE);
  assert.equal(result.code, "CS-SUPERSEDED-ORIGIN-FINAL");
  assert.equal(result.mutated, false);
});

for (const [name, mutate] of [
  ["same lane", (recovery) => { recovery.fallbackLaneId = recovery.originLaneId; }],
  ["same dispatch", (recovery) => { recovery.fallbackDispatchId = recovery.originDispatchId; }],
  ["second reroute count", (recovery) => { recovery.count = 2; }],
  ["same-lane retry not prohibited", (recovery) => { recovery.sameLaneRetryProhibited = false; }],
  ["product retry drift", (recovery) => { recovery.originProductRetryCount = 1; }],
]) {
  check(`recovery ${name} fails closed`, () => {
    const value = state();
    value.queueHead.environmentRerouteCount = 1;
    value.queueHead.dispatch.dispatchId = "fallback-dispatch";
    value.recovery = {
      originLaneId: "origin-lane", originDispatchId: "origin-dispatch", originAttemptId: "attempt-origin",
      environmentEvidenceSha256: A, sameLaneRetryProhibited: true, fallbackStatus: "running",
      fallbackLaneId: "fallback-lane", fallbackDispatchId: "fallback-dispatch",
      narrowingContractSha256: B, originProductRetryCount: 0, resultDigest: null, count: 1,
    };
    mutate(value.recovery);
    assert.equal(validateContinuityState(value, FEATURE).ok, false);
  });
}

function decisionTxn() {
  return {
    idempotencyKey: "decision-txn-01",
    briefSha256: B,
    intentSha256: C,
    selectedOptionId: "defer",
    preSelectionRevision: 0,
    selectedRevision: 1,
    dispatchableRevision: 2,
    phase: "state-applied",
  };
}

check("decision selection installs one dispatch-blocking marker", () => {
  const current = state({ queueHead: null, blocker: courseBlocker() });
  const selectedBlocker = courseBlocker();
  selectedBlocker.signature = "deferred-repeat-product-v1";
  const request = {
    expectedRevision: 0,
    decisionTxn: decisionTxn(),
    queueHead: null,
    blocker: selectedBlocker,
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "blocker" },
  };
  const applied = applyDecisionSelection(current, request, FEATURE);
  assert.equal(applied.code, "CS-CAS-APPLIED");
  assert.deepEqual(continuityDispatchAllowed(applied.state, FEATURE), {
    ok: true, code: "CS-DECISION-PENDING", allowed: false,
  });
});

check("same decision transaction replay is idempotent and conflict blocks", () => {
  const current = state({
    revision: 1,
    queueHead: null,
    blocker: courseBlocker(),
    decisionTxn: decisionTxn(),
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "blocker" },
  });
  const replay = applyDecisionSelection(current, {
    expectedRevision: 1,
    decisionTxn: structuredClone(current.decisionTxn),
    queueHead: null,
    blocker: current.blocker,
    resume: current.resume,
  }, FEATURE);
  assert.equal(replay.code, "CS-DECISION-REPLAY");
  const conflictTxn = structuredClone(current.decisionTxn); conflictTxn.selectedOptionId = "stop";
  const conflict = applyDecisionSelection(current, {
    expectedRevision: 1, decisionTxn: conflictTxn, queueHead: null,
    blocker: current.blocker, resume: current.resume,
  }, FEATURE);
  assert.equal(conflict.code, "CS-DECISION-CONFLICT");
});

check("matching durable decision receipt clears marker at dispatchable revision", () => {
  const current = state({
    revision: 1,
    queueHead: null,
    blocker: courseBlocker(),
    decisionTxn: decisionTxn(),
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "blocker" },
  });
  const receipt = {
    idempotencyKey: "decision-txn-01", briefSha256: B, intentSha256: C,
    selectedOptionId: "defer", receiptSha256: D, selectedRevision: 1, dispatchableRevision: 2,
  };
  const cleared = clearDecisionSelection(current, { expectedRevision: 1, receipt }, FEATURE);
  assert.equal(cleared.code, "CS-CAS-APPLIED");
  assert.equal(cleared.state.revision, 2);
  assert.equal(cleared.state.decisionTxn, null);
});

check("mismatched decision receipt is zero mutation", () => {
  const current = state({
    revision: 1, queueHead: null, blocker: courseBlocker(), decisionTxn: decisionTxn(),
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "blocker" },
  });
  const receipt = {
    idempotencyKey: "other", briefSha256: B, intentSha256: C,
    selectedOptionId: "defer", receiptSha256: D, selectedRevision: 1, dispatchableRevision: 2,
  };
  const result = clearDecisionSelection(current, { expectedRevision: 1, receipt }, FEATURE);
  assert.equal(result.code, "CS-DECISION-RECEIPT-MISMATCH");
  assert.equal(result.mutated, false);
});

check("clearing without a live decision marker never claims replay", () => {
  const receipt = {
    idempotencyKey: "decision-txn-01", briefSha256: B, intentSha256: C,
    selectedOptionId: "defer", receiptSha256: D, selectedRevision: 1, dispatchableRevision: 2,
  };
  const result = clearDecisionSelection(state(), { expectedRevision: 0, receipt }, FEATURE);
  assert.equal(result.code, "CS-NO-DECISION-TXN");
  assert.equal(result.mutated, false);
});

check("closed code vocabulary has no raw-data channel", () => {
  assert.equal(new Set(CONTINUITY_STATE_CODES).size, CONTINUITY_STATE_CODES.length);
  assert.equal(CONTINUITY_STATE_CODES.every((code) => /^CS-[A-Z0-9-]+$/.test(code)), true);
});

process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
