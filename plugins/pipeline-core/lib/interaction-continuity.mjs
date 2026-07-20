// SPDX-License-Identifier: Apache-2.0

/**
 * Pure interaction-continuity policy for an already-projected continuity state.
 *
 * This module deliberately performs no I/O and never returns the raw user message.
 * Consumers remain responsible for applying typed state transitions through the
 * sanctioned writer and for recording additive input in its owning artifact.
 */

export const INTERACTION_CONTINUITY_SCHEMA = "pipeline.interaction-continuity.v1";
export const INTERACTION_RESUME_SCHEMA = "pipeline.interaction-resume.v1";

export const INTERACTION_CATEGORIES = Object.freeze([
  "informational-question",
  "additive-input",
  "decision-or-gate",
  "explicit-control-change",
]);

export const INTERACTION_CONTINUITY_CODES = Object.freeze([
  "IC-CLASSIFIED",
  "IC-ANSWER-THEN-CONTINUE",
  "IC-RECORD-THEN-CONTINUE",
  "IC-DECIDE-THEN-CONTINUE",
  "IC-PERSIST-INTERRUPTION",
  "IC-TYPED-BLOCKER",
  "IC-NO-ACTIVE-WORK",
  "IC-PROJECTION-INVALID",
  "IC-INPUT-INVALID",
  "IC-TRAJECTORY-VALID",
  "IC-TRAJECTORY-INVALID",
]);

export const INTERACTION_RESUME_REASONS = Object.freeze([
  "pipeline-start",
  "manual-compact",
  "automatic-compact",
  "resume",
  "crash-bootstrap",
]);

const CATEGORY_SET = new Set(INTERACTION_CATEGORIES);
const RESUME_REASON_SET = new Set(INTERACTION_RESUME_REASONS);
const DECISION_KINDS = new Set(["decision", "gate"]);
const CONTROL_ACTIONS = new Set(["pause", "cancel", "replace", "redirect"]);
const TERMINAL_REASONS = new Set(["completion", "named-gate", "typed-blocker", "incident", "explicit-control-change"]);
const EVENT_KINDS = new Set([
  "answer",
  "record-additive",
  "apply-decision",
  "persist-interruption",
  "execute-next-action",
  "terminal-response",
]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_MESSAGE_LENGTH = 4_096;
const MAX_ALIAS_LENGTH = 160;
const MAX_OPTIONS = 32;
const MAX_ALIASES = 16;
const MAX_EVENTS = 64;
const CONTINUATION_INSTRUCTION = "Answer informational messages, then continue the persisted next action.";

const INFORMATIONAL_PATTERNS = Object.freeze([
  /\bstatus\b/u,
  /\bprogress\b/u,
  /\beta\b/u,
  /\bestimat(?:e|ed|ion)\b/u,
  /\bhow (?:long|much longer)\b/u,
  /\bwhat(?:'s| is) (?:the )?(?:status|progress|reason)\b/u,
  /\bwhy\b/u,
  /\bexplain\b/u,
  /\brationale\b/u,
  /\breason(?:ing)?\b/u,
  /\bstand\b/u,
  /\bfortschritt\b/u,
  /\bwie lange\b/u,
  /\bwarum\b/u,
  /\berkl(?:ä|ae)r/u,
  /\bbegr(?:ü|ue)nd/u,
  /\bwas (?:ist|macht|passiert)\b/u,
]);

const CONTROL_PATTERNS = Object.freeze([
  ["pause", /^(?:please\s+)?(?:pause|hold|suspend)(?:\s+(?:(?:this|the|current|active)\s+){0,2}(?:work|task|run|implementation|feature))?[.!\s]*$/u],
  ["cancel", /^(?:please\s+)?(?:cancel|abort)(?:\s+(?:(?:this|the|current|active)\s+){0,2}(?:work|task|run|implementation|feature))?[.!\s]*$/u],
  ["cancel", /^(?:please\s+)?stop(?:\s+(?:(?:this|the|current|active)\s+){0,2}(?:work|task|run|implementation|feature))?[.!\s]*$/u],
  ["replace", /^(?:please\s+)?replace\s+(?:(?:this|the|current|active)\s+){0,2}(?:goal|task|work|feature)\s+with\b/iu],
  ["redirect", /^(?:please\s+)?(?:redirect|switch)\s+(?:(?:this|the|current|active)\s+){0,2}(?:(?:work|task|goal|focus)\s+)?(?:to|toward)\b/iu],
  ["redirect", /^(?:please\s+)?(?:do|work on|focus on)\s+.+\s+instead[.!\s]*$/iu],
  ["pause", /^(?:bitte\s+)?(?:pausiere|unterbrich)(?:\s+(?:(?:diese|die|aktuelle|laufende)\s+){0,2}(?:arbeit|aufgabe|umsetzung|phase))?[.!\s]*$/u],
  ["pause", /^(?:bitte\s+)?halte\s+(?:(?:diese|die|aktuelle|laufende)\s+){0,2}(?:arbeit|aufgabe|umsetzung|phase)\s+an[.!\s]*$/u],
  ["cancel", /^(?:bitte\s+)?(?:stoppe|beende)(?:\s+(?:(?:diese|die|aktuelle|laufende)\s+){0,2}(?:arbeit|aufgabe|umsetzung|phase))?[.!\s]*$/u],
  ["cancel", /^(?:bitte\s+)?brich\s+(?:(?:diese|die|aktuelle|laufende)\s+){0,2}(?:arbeit|aufgabe|umsetzung|phase)\s+ab[.!\s]*$/u],
  ["replace", /^(?:bitte\s+)?ersetze\s+(?:(?:dieses|das|aktuelle)\s+){0,2}(?:ziel|vorhaben|aufgabe)\s+durch\b/u],
  ["redirect", /^(?:bitte\s+)?(?:wechsle|wechsel)\s+(?:jetzt\s+)?(?:zu|auf)\b/u],
  ["redirect", /^(?:bitte\s+)?(?:mach|bearbeite|konzentriere dich auf)\s+.+\s+stattdessen[.!\s]*$/u],
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function safeBoundedText(value, maximum = MAX_MESSAGE_LENGTH) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && !/[\0\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

function normalizedText(value) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("und");
}

function normalizedAnswer(value) {
  return normalizedText(value).replace(/[.!?]+$/u, "").trim();
}

function invalidClassification(code = "IC-INPUT-INVALID") {
  return {
    ok: false,
    code,
    category: null,
    controlAction: null,
    decision: null,
  };
}

function validatePendingDecision(value) {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (!exactKeys(value, ["id", "kind", "options"])
    || !safeId(value.id)
    || !DECISION_KINDS.has(value.kind)
    || !Array.isArray(value.options)
    || value.options.length < 1
    || value.options.length > MAX_OPTIONS) return { ok: false };

  const optionIds = new Set();
  const aliases = new Map();
  for (const option of value.options) {
    if (!exactKeys(option, ["id", "aliases"])
      || !safeId(option.id)
      || optionIds.has(option.id)
      || !Array.isArray(option.aliases)
      || option.aliases.length < 1
      || option.aliases.length > MAX_ALIASES) return { ok: false };
    optionIds.add(option.id);
    for (const alias of option.aliases) {
      if (!safeBoundedText(alias, MAX_ALIAS_LENGTH)) return { ok: false };
      const normalized = normalizedAnswer(alias);
      if (normalized.length === 0 || aliases.has(normalized)) return { ok: false };
      aliases.set(normalized, option.id);
    }
  }
  return {
    ok: true,
    value: {
      id: value.id,
      kind: value.kind,
      aliases,
    },
  };
}

function explicitControl(text) {
  if (/^(?:do not|don't|dont|never|nicht|niemals)\s+(?:pause|stop|cancel|abort|pausier|stopp|beend|brich)/u.test(text)) return null;
  for (const [action, pattern] of CONTROL_PATTERNS) {
    if (pattern.test(text)) return action;
  }
  return null;
}

/**
 * Classify one bounded message. A typed decision is recognized only when the
 * complete normalized answer matches one unique option alias. Ambiguous prose
 * therefore falls back to additive-input and cannot synthesize an interruption.
 */
export function classifyInteraction(message, options = {}) {
  if (!isObject(options) || Object.keys(options).some((key) => key !== "pendingDecision")) return invalidClassification();
  const pendingDecision = options.pendingDecision ?? null;
  if (!safeBoundedText(message)) return invalidClassification();
  const checkedDecision = validatePendingDecision(pendingDecision);
  if (!checkedDecision.ok) return invalidClassification();
  const text = normalizedText(message);
  if (text.length === 0) return invalidClassification();

  const controlAction = explicitControl(text);
  if (controlAction !== null) {
    return {
      ok: true,
      code: "IC-CLASSIFIED",
      category: "explicit-control-change",
      controlAction,
      decision: null,
    };
  }

  if (checkedDecision.value !== null) {
    const optionId = checkedDecision.value.aliases.get(normalizedAnswer(message));
    if (optionId !== undefined) {
      return {
        ok: true,
        code: "IC-CLASSIFIED",
        category: "decision-or-gate",
        controlAction: null,
        decision: {
          id: checkedDecision.value.id,
          kind: checkedDecision.value.kind,
          optionId,
        },
      };
    }
  }

  if (INFORMATIONAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      ok: true,
      code: "IC-CLASSIFIED",
      category: "informational-question",
      controlAction: null,
      decision: null,
    };
  }

  return {
    ok: true,
    code: "IC-CLASSIFIED",
    category: "additive-input",
    controlAction: null,
    decision: null,
  };
}

function activeProjection(value) {
  if (!isObject(value) || !new Set(["ok", "absent"]).has(value.stateStatus)) return { state: "invalid", active: null };
  if (value.lifecycle === "inactive" && value.activeFeature === null) return { state: "inactive", active: null };
  if (value.stateStatus !== "ok") return { state: "invalid", active: null };
  if (value.lifecycle !== "active" || !isObject(value.activeFeature)
    || !safeId(value.activeFeature.id)
    || !safeBoundedText(value.activeFeature.phase, 128)
    || !isObject(value.continuity)
    || !isObject(value.nextAction)) return { state: "invalid", active: null };

  if (value.nextAction.state === "blocked" && value.nextAction.value === null
    && value.continuity.status === "valid"
    && Number.isSafeInteger(value.continuity.revision)
    && value.continuity.revision >= 0) {
    return {
      state: "blocked",
      active: {
        featureId: value.activeFeature.id,
        phase: value.activeFeature.phase,
        queueRevision: value.continuity.revision,
        nextAction: null,
      },
    };
  }

  if (value.nextAction.state !== "known" || !safeId(value.nextAction.value)
    || value.continuity.status !== "valid"
    || !Number.isSafeInteger(value.continuity.revision)
    || value.continuity.revision < 0) return { state: "invalid", active: null };
  return {
    state: "ready",
    active: {
      featureId: value.activeFeature.id,
      phase: value.activeFeature.phase,
      queueRevision: value.continuity.revision,
      nextAction: value.nextAction.value,
    },
  };
}

function plan({ code, classification, active, action, continuation, mutation, terminalResponseAllowed, artifactUpdateAllowed }) {
  return {
    schema: INTERACTION_CONTINUITY_SCHEMA,
    ok: code !== "IC-INPUT-INVALID" && code !== "IC-PROJECTION-INVALID",
    code,
    category: classification?.category ?? null,
    controlAction: classification?.controlAction ?? null,
    decision: classification?.decision ?? null,
    active,
    action,
    continuation,
    continuityMutation: mutation,
    terminalResponseAllowed,
    artifactUpdateAllowed,
  };
}

/**
 * Bind an interaction classification to the read-only continuity-status
 * projection. The returned plan is policy only; it never mutates either input.
 */
export function planInteraction(input = {}) {
  if (!isObject(input)
    || !Object.hasOwn(input, "message")
    || !Object.hasOwn(input, "statusProjection")
    || Object.keys(input).some((key) => !new Set(["message", "statusProjection", "pendingDecision"]).has(key))) {
    return plan({
      code: "IC-INPUT-INVALID",
      classification: null,
      active: null,
      action: "stop-for-input-diagnosis",
      continuation: "stopped",
      mutation: "forbidden",
      terminalResponseAllowed: false,
      artifactUpdateAllowed: false,
    });
  }
  const { message, statusProjection, pendingDecision = null } = input;
  const classification = classifyInteraction(message, { pendingDecision });
  if (!classification.ok) {
    return plan({
      code: "IC-INPUT-INVALID",
      classification: null,
      active: null,
      action: "stop-for-input-diagnosis",
      continuation: "stopped",
      mutation: "forbidden",
      terminalResponseAllowed: false,
      artifactUpdateAllowed: false,
    });
  }

  const projected = activeProjection(statusProjection);
  if (projected.state === "invalid") {
    return plan({
      code: "IC-PROJECTION-INVALID",
      classification,
      active: null,
      action: "stop-for-projection-diagnosis",
      continuation: "stopped",
      mutation: "forbidden",
      terminalResponseAllowed: true,
      artifactUpdateAllowed: false,
    });
  }
  if (projected.state === "inactive") {
    return plan({
      code: "IC-NO-ACTIVE-WORK",
      classification,
      active: null,
      action: "respond-without-continuation",
      continuation: "not-applicable",
      mutation: "forbidden",
      terminalResponseAllowed: true,
      artifactUpdateAllowed: classification.category === "additive-input",
    });
  }
  if (projected.state === "blocked") {
    if (classification.category === "decision-or-gate") {
      return plan({
        code: "IC-DECIDE-THEN-CONTINUE",
        classification,
        active: projected.active,
        action: "apply-typed-decision-then-execute-successor",
        continuation: "after-transition",
        mutation: "typed-decision-only",
        terminalResponseAllowed: false,
        artifactUpdateAllowed: false,
      });
    }
    if (classification.category === "explicit-control-change") {
      return plan({
        code: "IC-PERSIST-INTERRUPTION",
        classification,
        active: projected.active,
        action: "persist-typed-interruption",
        continuation: "interrupted",
        mutation: "typed-interruption-only",
        terminalResponseAllowed: true,
        artifactUpdateAllowed: false,
      });
    }
    return plan({
      code: "IC-TYPED-BLOCKER",
      classification,
      active: projected.active,
      action: "retain-typed-blocker",
      continuation: "blocked",
      mutation: "forbidden",
      terminalResponseAllowed: true,
      artifactUpdateAllowed: classification.category === "additive-input",
    });
  }

  if (classification.category === "informational-question") {
    return plan({
      code: "IC-ANSWER-THEN-CONTINUE",
      classification,
      active: projected.active,
      action: "answer-then-execute-next-action",
      continuation: "required",
      mutation: "forbidden",
      terminalResponseAllowed: false,
      artifactUpdateAllowed: false,
    });
  }
  if (classification.category === "additive-input") {
    return plan({
      code: "IC-RECORD-THEN-CONTINUE",
      classification,
      active: projected.active,
      action: "record-additive-then-execute-next-action",
      continuation: "required",
      mutation: "forbidden",
      terminalResponseAllowed: false,
      artifactUpdateAllowed: true,
    });
  }
  if (classification.category === "decision-or-gate") {
    return plan({
      code: "IC-DECIDE-THEN-CONTINUE",
      classification,
      active: projected.active,
      action: "apply-typed-decision-then-execute-successor",
      continuation: "after-transition",
      mutation: "typed-decision-only",
      terminalResponseAllowed: false,
      artifactUpdateAllowed: false,
    });
  }
  return plan({
    code: "IC-PERSIST-INTERRUPTION",
    classification,
    active: projected.active,
    action: "persist-typed-interruption",
    continuation: "interrupted",
    mutation: "typed-interruption-only",
    terminalResponseAllowed: true,
    artifactUpdateAllowed: false,
  });
}

/** Build the mandatory compact continuation line without user/private text. */
export function buildContinuationLine(active) {
  if (!isObject(active) || !safeId(active.featureId)
    || !safeBoundedText(active.phase, 128)
    || !Number.isSafeInteger(active.queueRevision) || active.queueRevision < 0
    || !safeId(active.nextAction)) return null;
  return `CONTINUATION feature=${JSON.stringify(active.featureId)} phase=${JSON.stringify(active.phase)} queueRevision=${active.queueRevision} nextAction=${JSON.stringify(active.nextAction)} · ${CONTINUATION_INSTRUCTION}`;
}

/**
 * Project the same active queue across pipeline-start, compact, resume and crash
 * bootstrap. The reason is metadata only; the continuation binding is unchanged.
 */
export function projectInteractionResume(statusProjection, reason) {
  if (!RESUME_REASON_SET.has(reason)) {
    return {
      schema: INTERACTION_RESUME_SCHEMA,
      ok: false,
      code: "IC-INPUT-INVALID",
      reason: null,
      continuationRequired: false,
      active: null,
      instruction: null,
      line: null,
    };
  }
  const projected = activeProjection(statusProjection);
  if (projected.state !== "ready") {
    return {
      schema: INTERACTION_RESUME_SCHEMA,
      ok: projected.state !== "invalid",
      code: projected.state === "blocked" ? "IC-TYPED-BLOCKER"
        : projected.state === "inactive" ? "IC-NO-ACTIVE-WORK" : "IC-PROJECTION-INVALID",
      reason,
      continuationRequired: false,
      active: projected.active,
      instruction: null,
      line: null,
    };
  }
  return {
    schema: INTERACTION_RESUME_SCHEMA,
    ok: true,
    code: "IC-ANSWER-THEN-CONTINUE",
    reason,
    continuationRequired: true,
    active: projected.active,
    instruction: CONTINUATION_INSTRUCTION,
    line: buildContinuationLine(projected.active),
  };
}

function validPlan(value) {
  return isObject(value)
    && value.schema === INTERACTION_CONTINUITY_SCHEMA
    && typeof value.code === "string"
    && (value.category === null || CATEGORY_SET.has(value.category))
    && (value.controlAction === null || CONTROL_ACTIONS.has(value.controlAction));
}

function validEvent(value) {
  if (!isObject(value) || !EVENT_KINDS.has(value.kind)) return false;
  if (value.kind === "answer" || value.kind === "record-additive") return exactKeys(value, ["kind"]);
  if (value.kind === "apply-decision") {
    return exactKeys(value, ["kind", "decisionId", "optionId", "successorQueueRevision", "successorNextAction"])
      && safeId(value.decisionId) && safeId(value.optionId)
      && Number.isSafeInteger(value.successorQueueRevision) && value.successorQueueRevision >= 0
      && safeId(value.successorNextAction);
  }
  if (value.kind === "persist-interruption") {
    return exactKeys(value, ["kind", "controlAction"]) && CONTROL_ACTIONS.has(value.controlAction);
  }
  if (value.kind === "execute-next-action") {
    return exactKeys(value, ["kind", "queueRevision", "nextAction"])
      && Number.isSafeInteger(value.queueRevision) && value.queueRevision >= 0
      && safeId(value.nextAction);
  }
  return exactKeys(value, ["kind", "reason"]) && TERMINAL_REASONS.has(value.reason);
}

function trajectory(ok, reason = null) {
  return {
    ok,
    code: ok ? "IC-TRAJECTORY-VALID" : "IC-TRAJECTORY-INVALID",
    reason,
  };
}

/**
 * Validate the observable interaction trajectory. In particular, an ordinary
 * question/addition must reach the same persisted action exactly once and cannot
 * be followed by a terminal response.
 */
export function validateInteractionTrajectory(input = {}) {
  if (!exactKeys(input, ["interactionPlan", "events"])) return trajectory(false, "invalid-input");
  const { interactionPlan, events } = input;
  if (!validPlan(interactionPlan) || !Array.isArray(events)
    || events.length > MAX_EVENTS || !events.every(validEvent)) return trajectory(false, "invalid-input");

  const kinds = events.map(({ kind }) => kind);
  const terminal = events.find(({ kind }) => kind === "terminal-response");
  const executions = events.filter(({ kind }) => kind === "execute-next-action");
  if (executions.length > 1) return trajectory(false, "duplicate-next-action");

  if (interactionPlan.code === "IC-TYPED-BLOCKER") {
    if (executions.length !== 0 || terminal?.reason !== "typed-blocker") {
      return trajectory(false, "typed-blocker-disposition-invalid");
    }
    const required = interactionPlan.category === "informational-question" ? "answer"
      : interactionPlan.category === "additive-input" ? "record-additive" : null;
    if (required !== null && (events.length !== 2 || kinds[0] !== required || kinds[1] !== "terminal-response")) {
      return trajectory(false, "typed-blocker-order-invalid");
    }
    return trajectory(true);
  }

  if (interactionPlan.category === "informational-question" || interactionPlan.category === "additive-input") {
    if (terminal !== undefined) return trajectory(false, "ordinary-interaction-became-terminal");
    if (!interactionPlan.active || executions.length !== 1) return trajectory(false, "persisted-next-action-missing");
    const execution = executions[0];
    if (execution.queueRevision !== interactionPlan.active.queueRevision
      || execution.nextAction !== interactionPlan.active.nextAction) return trajectory(false, "persisted-next-action-drift");
    const required = interactionPlan.category === "informational-question" ? "answer" : "record-additive";
    const requiredAt = kinds.indexOf(required);
    const executeAt = kinds.indexOf("execute-next-action");
    if (events.length !== 2 || requiredAt !== 0 || executeAt !== 1) return trajectory(false, "interaction-order-invalid");
    return trajectory(true);
  }

  if (interactionPlan.category === "decision-or-gate") {
    if (terminal !== undefined) return trajectory(false, "decision-became-terminal");
    const applied = events.filter(({ kind }) => kind === "apply-decision");
    if (applied.length !== 1 || executions.length !== 1) return trajectory(false, "decision-successor-missing");
    if (applied[0].decisionId !== interactionPlan.decision?.id
      || applied[0].optionId !== interactionPlan.decision?.optionId) return trajectory(false, "decision-binding-drift");
    if (interactionPlan.active !== null && applied[0].successorQueueRevision <= interactionPlan.active.queueRevision) {
      return trajectory(false, "decision-successor-revision-invalid");
    }
    if (executions[0].queueRevision !== applied[0].successorQueueRevision
      || executions[0].nextAction !== applied[0].successorNextAction) return trajectory(false, "decision-successor-drift");
    if (events.length !== 2 || kinds[0] !== "apply-decision" || kinds[1] !== "execute-next-action") {
      return trajectory(false, "decision-order-invalid");
    }
    return trajectory(true);
  }

  if (interactionPlan.category === "explicit-control-change") {
    const interruptions = events.filter(({ kind }) => kind === "persist-interruption");
    if (interruptions.length !== 1 || interruptions[0].controlAction !== interactionPlan.controlAction) {
      return trajectory(false, "interruption-binding-missing");
    }
    if (executions.length !== 0) return trajectory(false, "interrupted-work-executed");
    if (events.length < 1 || events.length > 2 || kinds[0] !== "persist-interruption"
      || (events.length === 2 && kinds[1] !== "terminal-response")) return trajectory(false, "interruption-order-invalid");
    if (terminal !== undefined && terminal.reason !== "explicit-control-change") {
      return trajectory(false, "terminal-reason-invalid");
    }
    return trajectory(true);
  }

  return trajectory(false, "non-runnable-plan");
}
