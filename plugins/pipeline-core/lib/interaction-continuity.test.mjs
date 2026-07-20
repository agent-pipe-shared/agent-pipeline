// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import {
  INTERACTION_CATEGORIES,
  INTERACTION_CONTINUITY_CODES,
  INTERACTION_RESUME_REASONS,
  buildContinuationLine,
  classifyInteraction,
  planInteraction,
  projectInteractionResume,
  validateInteractionTrajectory,
} from "./interaction-continuity.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

const ACTIVE = Object.freeze({
  stateStatus: "ok",
  lifecycle: "active",
  code: "CS-STATUS-ACTIVE",
  activeFeature: { id: "batman", planPath: "specs/batman.md", phase: "implementation" },
  continuity: { status: "valid", revision: 7 },
  nextAction: { state: "known", value: "review" },
  resume: { mode: "resume-on-next-turn", reasonCode: "host-no-background-wakeup" },
  eta: { state: "unknown", rangeMinutes: null, source: null },
});

const PENDING_GATE = Object.freeze({
  id: "prd-release",
  kind: "gate",
  options: [
    { id: "approved", aliases: ["approved", "freigegeben"] },
    { id: "rejected", aliases: ["rejected", "abgelehnt"] },
  ],
});

function planned(message, options = {}) {
  return planInteraction({
    message,
    statusProjection: options.statusProjection ?? structuredClone(ACTIVE),
    pendingDecision: options.pendingDecision ?? null,
  });
}

check("category and code registries are closed and unique", () => {
  assert.deepEqual(new Set(INTERACTION_CATEGORIES).size, 4);
  assert.equal(new Set(INTERACTION_CONTINUITY_CODES).size, INTERACTION_CONTINUITY_CODES.length);
  assert.equal(new Set(INTERACTION_RESUME_REASONS).size, INTERACTION_RESUME_REASONS.length);
});

for (const [message, category] of [
  ["What is the status?", "informational-question"],
  ["Why did you choose this route?", "informational-question"],
  ["Wie lange dauert es noch?", "informational-question"],
  ["Bitte erkläre die Begründung.", "informational-question"],
  ["Also check the Windows path.", "additive-input"],
  ["Zusätzlich gilt dieses neue Beweisstück.", "additive-input"],
  ["Please pause the current work.", "explicit-control-change"],
  ["Brich die laufende Aufgabe ab.", "explicit-control-change"],
  ["Replace the current goal with release triage", "explicit-control-change"],
  ["Mach die Dokumentation stattdessen.", "explicit-control-change"],
]) {
  check(`classifies ${JSON.stringify(message)} as ${category}`, () => {
    assert.equal(classifyInteraction(message).category, category);
  });
}

check("ambiguous and negated wording preserve active work", () => {
  for (const message of ["Maybe another approach is better", "Don't stop the work", "Nicht pausieren, bitte weitermachen"] ) {
    const result = classifyInteraction(message);
    assert.equal(result.ok, true);
    assert.notEqual(result.category, "explicit-control-change");
  }
});

check("a gate answer is typed only against the exact pending gate", () => {
  const german = classifyInteraction("Freigegeben.", { pendingDecision: PENDING_GATE });
  assert.equal(german.category, "decision-or-gate");
  assert.deepEqual(german.decision, { id: "prd-release", kind: "gate", optionId: "approved" });
  assert.equal(classifyInteraction("freigegeben").category, "additive-input");
  assert.equal(classifyInteraction("freigegeben mit Änderung", { pendingDecision: PENDING_GATE }).category, "additive-input");
});

check("invalid or ambiguous decision schemas fail closed", () => {
  const duplicate = {
    ...PENDING_GATE,
    options: [
      { id: "yes", aliases: ["yes"] },
      { id: "also-yes", aliases: ["Yes."] },
    ],
  };
  assert.equal(classifyInteraction("yes", { pendingDecision: duplicate }).ok, false);
  assert.equal(classifyInteraction("").ok, false);
  assert.equal(classifyInteraction("x".repeat(4_097)).ok, false);
  assert.equal(classifyInteraction("status", null).ok, false);
  assert.equal(planInteraction(null).code, "IC-INPUT-INVALID");
  assert.equal(validateInteractionTrajectory(null).reason, "invalid-input");
});

check("informational planning is byte-preserving and resumes the exact action", () => {
  const status = structuredClone(ACTIVE);
  status.approvalState = { approved: true, digest: "a".repeat(64) };
  const before = JSON.stringify(status);
  const result = planInteraction({ message: "Status?", statusProjection: status });
  assert.equal(result.code, "IC-ANSWER-THEN-CONTINUE");
  assert.equal(result.continuityMutation, "forbidden");
  assert.equal(result.continuation, "required");
  assert.equal(result.terminalResponseAllowed, false);
  assert.deepEqual(result.active, { featureId: "batman", phase: "implementation", queueRevision: 7, nextAction: "review" });
  assert.equal(JSON.stringify(status), before);
});

check("repeated questions neither revise state nor create different plans", () => {
  const status = structuredClone(ACTIVE);
  const before = JSON.stringify(status);
  const first = planInteraction({ message: "ETA?", statusProjection: status });
  const second = planInteraction({ message: "ETA?", statusProjection: status });
  assert.deepEqual(second, first);
  assert.equal(first.active.queueRevision, 7);
  assert.equal(JSON.stringify(status), before);
});

check("additive input permits only its external artifact update", () => {
  const result = planned("Please also inspect the schema.");
  assert.equal(result.code, "IC-RECORD-THEN-CONTINUE");
  assert.equal(result.artifactUpdateAllowed, true);
  assert.equal(result.continuityMutation, "forbidden");
  assert.equal(result.active.nextAction, "review");
});

check("typed gate planning binds only the named transition and requires its successor", () => {
  const result = planned("approved", { pendingDecision: PENDING_GATE });
  assert.equal(result.code, "IC-DECIDE-THEN-CONTINUE");
  assert.equal(result.continuityMutation, "typed-decision-only");
  assert.equal(result.continuation, "after-transition");
  assert.deepEqual(result.decision, { id: "prd-release", kind: "gate", optionId: "approved" });
});

check("an explicit replacement requires a typed interruption", () => {
  const result = planned("Replace the current task with incident triage");
  assert.equal(result.code, "IC-PERSIST-INTERRUPTION");
  assert.equal(result.controlAction, "replace");
  assert.equal(result.continuityMutation, "typed-interruption-only");
  assert.equal(result.continuation, "interrupted");
  assert.equal(result.terminalResponseAllowed, true);
});

check("a typed blocker remains active but non-runnable", () => {
  const status = structuredClone(ACTIVE);
  status.nextAction = { state: "blocked", value: null };
  const result = planned("What is the status?", { statusProjection: status });
  assert.equal(result.code, "IC-TYPED-BLOCKER");
  assert.equal(result.continuation, "blocked");
  assert.equal(result.active.queueRevision, 7);
  assert.equal(validateInteractionTrajectory({
    interactionPlan: result,
    events: [{ kind: "answer" }, { kind: "terminal-response", reason: "typed-blocker" }],
  }).ok, true);
});

check("a gate answer or explicit control remains typed while work is blocked", () => {
  const status = structuredClone(ACTIVE);
  status.nextAction = { state: "blocked", value: null };
  const decision = planned("approved", { statusProjection: status, pendingDecision: PENDING_GATE });
  assert.equal(decision.code, "IC-DECIDE-THEN-CONTINUE");
  assert.equal(decision.continuityMutation, "typed-decision-only");
  const control = planned("Cancel the current task", { statusProjection: status });
  assert.equal(control.code, "IC-PERSIST-INTERRUPTION");
  assert.equal(control.continuityMutation, "typed-interruption-only");
});

check("malformed or stale projection fails closed without a mutation plan", () => {
  const stale = structuredClone(ACTIVE);
  stale.continuity = { status: "invalid", revision: null };
  const result = planned("Status?", { statusProjection: stale });
  assert.equal(result.ok, false);
  assert.equal(result.code, "IC-PROJECTION-INVALID");
  assert.equal(result.continuityMutation, "forbidden");
  assert.equal(result.active, null);
});

check("inactive work does not invent a continuation", () => {
  const inactive = {
    stateStatus: "absent",
    lifecycle: "inactive",
    activeFeature: null,
    continuity: { status: "absent", revision: null },
    nextAction: { state: "unknown", value: null },
  };
  const result = planned("Status?", { statusProjection: inactive });
  assert.equal(result.code, "IC-NO-ACTIVE-WORK");
  assert.equal(result.continuation, "not-applicable");
});

check("all resume reasons restore the same mandatory continuation binding", () => {
  const projections = INTERACTION_RESUME_REASONS.map((reason) => projectInteractionResume(structuredClone(ACTIVE), reason));
  for (const projection of projections) {
    assert.equal(projection.ok, true);
    assert.equal(projection.continuationRequired, true);
    assert.match(projection.line, /^CONTINUATION feature="batman" phase="implementation" queueRevision=7 nextAction="review"/);
    assert.match(projection.line, /Answer informational messages, then continue/);
  }
  const withoutReasons = projections.map(({ reason: _reason, ...projection }) => projection);
  assert.equal(new Set(withoutReasons.map(JSON.stringify)).size, 1);
});

check("resume projection contains no prompt, private path or rationale", () => {
  const result = projectInteractionResume(structuredClone(ACTIVE), "automatic-compact");
  const text = JSON.stringify(result);
  assert.equal(text.includes("userMessage"), false);
  assert.equal(text.includes("prompt"), false);
  assert.equal(text.includes("rationale"), false);
  assert.equal(text.includes("/home/"), false);
  assert.equal(result.line, buildContinuationLine(result.active));
});

check("invalid resume reason and blocked projection never inject continuation", () => {
  assert.equal(projectInteractionResume(ACTIVE, "chat").ok, false);
  const blocked = structuredClone(ACTIVE);
  blocked.nextAction = { state: "blocked", value: null };
  const result = projectInteractionResume(blocked, "resume");
  assert.equal(result.code, "IC-TYPED-BLOCKER");
  assert.equal(result.line, null);
});

check("question trajectory requires answer then the byte-bound next action", () => {
  const interactionPlan = planned("What is the status?");
  assert.deepEqual(validateInteractionTrajectory({
    interactionPlan,
    events: [
      { kind: "answer" },
      { kind: "execute-next-action", queueRevision: 7, nextAction: "review" },
    ],
  }), { ok: true, code: "IC-TRAJECTORY-VALID", reason: null });
});

check("ordinary question followed by terminal response is rejected", () => {
  const result = validateInteractionTrajectory({
    interactionPlan: planned("ETA?"),
    events: [
      { kind: "answer" },
      { kind: "terminal-response", reason: "completion" },
    ],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "ordinary-interaction-became-terminal");
});

check("duplicate or drifted effects after repeated questions are rejected", () => {
  const interactionPlan = planned("Status?");
  const duplicate = validateInteractionTrajectory({
    interactionPlan,
    events: [
      { kind: "answer" },
      { kind: "execute-next-action", queueRevision: 7, nextAction: "review" },
      { kind: "execute-next-action", queueRevision: 7, nextAction: "review" },
    ],
  });
  assert.equal(duplicate.reason, "duplicate-next-action");
  const drift = validateInteractionTrajectory({
    interactionPlan,
    events: [{ kind: "answer" }, { kind: "execute-next-action", queueRevision: 8, nextAction: "review" }],
  });
  assert.equal(drift.reason, "persisted-next-action-drift");
});

check("additive trajectory records evidence before continuing", () => {
  const result = validateInteractionTrajectory({
    interactionPlan: planned("Also inspect this evidence."),
    events: [
      { kind: "record-additive" },
      { kind: "execute-next-action", queueRevision: 7, nextAction: "review" },
    ],
  });
  assert.equal(result.ok, true);
  const duplicate = validateInteractionTrajectory({
    interactionPlan: planned("Also inspect this evidence."),
    events: [
      { kind: "record-additive" },
      { kind: "record-additive" },
      { kind: "execute-next-action", queueRevision: 7, nextAction: "review" },
    ],
  });
  assert.equal(duplicate.reason, "interaction-order-invalid");
});

check("gate trajectory rejects a different decision and accepts the typed successor", () => {
  const interactionPlan = planned("approved", { pendingDecision: PENDING_GATE });
  const wrong = validateInteractionTrajectory({
    interactionPlan,
    events: [
      {
        kind: "apply-decision",
        decisionId: "other",
        optionId: "approved",
        successorQueueRevision: 8,
        successorNextAction: "dispatch",
      },
      { kind: "execute-next-action", queueRevision: 8, nextAction: "dispatch" },
    ],
  });
  assert.equal(wrong.reason, "decision-binding-drift");
  const valid = validateInteractionTrajectory({
    interactionPlan,
    events: [
      {
        kind: "apply-decision",
        decisionId: "prd-release",
        optionId: "approved",
        successorQueueRevision: 8,
        successorNextAction: "dispatch",
      },
      { kind: "execute-next-action", queueRevision: 8, nextAction: "dispatch" },
    ],
  });
  assert.equal(valid.ok, true);
  const drift = validateInteractionTrajectory({
    interactionPlan,
    events: [
      {
        kind: "apply-decision",
        decisionId: "prd-release",
        optionId: "approved",
        successorQueueRevision: 8,
        successorNextAction: "review",
      },
      { kind: "execute-next-action", queueRevision: 8, nextAction: "dispatch" },
    ],
  });
  assert.equal(drift.reason, "decision-successor-drift");
});

check("control-change trajectory persists interruption and cannot execute old work", () => {
  const interactionPlan = planned("Please pause the task.");
  const valid = validateInteractionTrajectory({
    interactionPlan,
    events: [
      { kind: "persist-interruption", controlAction: "pause" },
      { kind: "terminal-response", reason: "explicit-control-change" },
    ],
  });
  assert.equal(valid.ok, true);
  const invalid = validateInteractionTrajectory({
    interactionPlan,
    events: [
      { kind: "persist-interruption", controlAction: "pause" },
      { kind: "execute-next-action", queueRevision: 7, nextAction: "review" },
    ],
  });
  assert.equal(invalid.reason, "interrupted-work-executed");
});

process.stdout.write(`1..${passed}\n`);
