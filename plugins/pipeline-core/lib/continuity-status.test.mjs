// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import {
  CONTINUITY_STATUS_CODES,
  projectContinuityStatus,
  projectReadContinuityStatus,
} from "./continuity-status.mjs";

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
const FEATURE = "storm-operational-control";

function continuity(overrides = {}) {
  return {
    schema: "pipeline.continuity.v0",
    featureId: FEATURE,
    revision: 4,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
    authority: {
      prd: { path: "specs/prd.md", sha256: A },
      spec: { path: "specs/spec.md", sha256: B },
      result: { path: "specs/result.md", sha256: C },
    },
    queueHead: {
      packageId: "status-package",
      actionId: "status-action",
      nextAction: "review",
      productRetryCount: 0,
      environmentRerouteCount: 0,
      dispatch: null,
    },
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 4, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    capacity: {
      concurrencyLimit: 3,
      reservedCriticSlots: 1,
      reservedRecoverySlots: 1,
      fallbackPolicy: "defer",
    },
    closeTransition: null,
    ...overrides,
  };
}

function state(overrides = {}) {
  return {
    schema: "pipeline.state.v0",
    activeFeature: {
      id: FEATURE,
      planPath: "specs/2026-07-17-sprint-storm-operational-control/implementation-plan.md",
      phase: "implementation",
    },
    planApproved: true,
    planApproval: { approvedBy: "po", approvedAt: "2026-07-17T21:18:45.687Z" },
    closedFeatures: [{ id: "p3b", planPath: "specs/p3b.md", phaseAtClose: "close", closedAt: "2026-07-17T20:00:00.000Z", closedBy: "po", forCommit: D.repeat(40) }],
    ...overrides,
  };
}

check("absent state reports inactive rather than a made-up ETA", () => {
  assert.deepEqual(projectReadContinuityStatus({ status: "absent" }), {
    stateStatus: "absent",
    lifecycle: "inactive",
    code: "CS-STATUS-STATE-ABSENT",
    activeFeature: null,
    continuity: { status: "absent", revision: null },
    nextAction: { state: "unknown", value: null },
    resume: { mode: null, reasonCode: null },
    eta: { state: "unknown", rangeMinutes: null, source: null },
  });
});

check("active state without continuity retains work and reports only unknown next action/ETA", () => {
  const input = state();
  const before = JSON.stringify(input);
  const result = projectContinuityStatus(input);
  assert.equal(result.lifecycle, "active");
  assert.equal(result.code, "CS-STATUS-ACTIVE-NO-CONTINUITY");
  assert.equal(result.activeFeature.id, FEATURE);
  assert.equal(result.activeFeature.phase, "implementation");
  assert.deepEqual(result.continuity, { status: "absent", revision: null });
  assert.deepEqual(result.nextAction, { state: "unknown", value: null });
  assert.deepEqual(result.resume, { mode: "resume-on-next-turn", reasonCode: "host-no-background-wakeup" });
  assert.deepEqual(result.eta, { state: "unknown", rangeMinutes: null, source: null });
  assert.equal(JSON.stringify(input), before, "status read must not mutate active/approval/closed state");
  assert.equal(input.activeFeature.id, FEATURE, "status read must not close active work");
  assert.equal(input.planApproved, true, "status read must not revoke approval");
});

check("valid continuity projects revision and next action but host-without-background resumes next turn", () => {
  const input = state({ continuity: continuity() });
  const before = JSON.stringify(input);
  const result = projectContinuityStatus(input);
  assert.equal(result.code, "CS-STATUS-ACTIVE");
  assert.deepEqual(result.continuity, { status: "valid", revision: 4 });
  assert.deepEqual(result.nextAction, { state: "known", value: "review" });
  assert.deepEqual(result.resume, { mode: "resume-on-next-turn", reasonCode: "host-no-background-wakeup" });
  assert.equal(input.continuity.resume.mode, "immediate", "projection must not rewrite persisted continuity");
  assert.equal(JSON.stringify(input), before, "projection must leave continuity byte-equivalent");
});

check("an evidenced background-capable host retains the sanctioned resume mode", () => {
  const result = projectContinuityStatus(state({ continuity: continuity() }), { hostSupportsBackground: true });
  assert.deepEqual(result.resume, { mode: "immediate", reasonCode: "active-turn" });
});

check("a bounded ETA is known only when the caller supplies an evidence-bound source", () => {
  const source = { path: "specs/2026-07-17-sprint-storm-operational-control/implementation-plan.md", sha256: A };
  const known = projectContinuityStatus(state(), { gateEta: { rangeMinutes: { min: 15, max: 45 }, source } });
  assert.deepEqual(known.eta, { state: "known", rangeMinutes: { min: 15, max: 45 }, source });
  const unsourced = projectContinuityStatus(state(), { gateEta: { rangeMinutes: { min: 15, max: 45 } } });
  assert.deepEqual(unsourced.eta, { state: "unknown", rangeMinutes: null, source: null });
});

check("a persisted B3 estimate projects only with matching current Git and evidence observations", () => {
  const evidence = {
    schema: "pipeline.gate-estimate-evidence.v1",
    featureId: FEATURE,
    gate: "security",
    observedAt: "2026-07-18T12:00:00.000Z",
    basis: [{ kind: "verify-run", reference: "evidence/verify.json", digest: B }],
    note: "Bounded remaining work.",
  };
  const input = state({ gateEstimate: {
    schema: "pipeline.gate-estimate.v1", id: "storm-security-1", featureId: FEATURE, gate: "security",
    objectFormat: "sha1", sourceOid: "e".repeat(40), evidence: { path: "evidence/eta.json", sha256: A },
    rangeMinutes: { min: 20, max: 40 }, recordedBy: "coordinator", recordedAt: "2026-07-18T12:01:00.000Z",
  } });
  const context = { observation: { ok: true, objectFormat: "sha1", sourceOid: "e".repeat(40) }, evidence: { ok: true, path: "evidence/eta.json", sha256: A, value: evidence } };
  assert.deepEqual(projectContinuityStatus(input, { gateEstimateContext: context }).eta, { state: "known", rangeMinutes: { min: 20, max: 40 }, source: { path: "evidence/eta.json", sha256: A } });
  assert.deepEqual(projectContinuityStatus(input, { gateEstimateContext: { ...context, observation: { ...context.observation, sourceOid: "f".repeat(40) } } }).eta, { state: "unknown", rangeMinutes: null, source: null });
});

check("a valid blocker is explicit and still does not terminate active work", () => {
  const blocked = continuity({
    queueHead: null,
    blocker: {
      type: "scope",
      signature: "scope-v1",
      resumeCondition: { kind: "po-decision", evidenceSha256: A },
      decisionBrief: null,
    },
    resume: { mode: "resume-on-next-turn", sourceRevision: 4, reasonCode: "blocker" },
  });
  const result = projectContinuityStatus(state({ continuity: blocked }));
  assert.equal(result.lifecycle, "active");
  assert.deepEqual(result.nextAction, { state: "blocked", value: null });
  assert.deepEqual(result.resume, { mode: "resume-on-next-turn", reasonCode: "host-no-background-wakeup" });
});

check("unsanctioned continuity additions cannot be treated as a sourced ETA", () => {
  const invalid = continuity({ eta: { rangeMinutes: { min: 10, max: 20 }, source: "guess" } });
  const result = projectContinuityStatus(state({ continuity: invalid }));
  assert.equal(result.code, "CS-STATUS-CONTINUITY-INVALID");
  assert.deepEqual(result.continuity, { status: "invalid", revision: null });
  assert.deepEqual(result.eta, { state: "unknown", rangeMinutes: null, source: null });
});

check("malformed read reports unavailable without attempting a repair", () => {
  const result = projectReadContinuityStatus({ status: "malformed", error: "invalid JSON" });
  assert.equal(result.stateStatus, "malformed");
  assert.equal(result.lifecycle, "unavailable");
  assert.equal(result.code, "CS-STATUS-STATE-MALFORMED");
});

check("status code register is unique and closed", () => {
  assert.equal(new Set(CONTINUITY_STATUS_CODES).size, CONTINUITY_STATUS_CODES.length);
  assert.equal(CONTINUITY_STATUS_CODES.every((code) => /^CS-STATUS-[A-Z-]+$/.test(code)), true);
});

process.stdout.write(`1..${passed}\n`);
