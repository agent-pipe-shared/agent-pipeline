// SPDX-License-Identifier: SUL-1.0

/**
 * Pure public planner and evaluator for the Hawkeye document lifecycle.
 *
 * The Policy contains only generic class names and opaque binding IDs.  This
 * module deliberately does not load private bindings, paths, trigger patterns,
 * renderer data, or evidence.  A private coordinator supplies the redacted
 * outcome for each Policy pair; this module preserves the Policy's canonical
 * ordering and derives the public, close-blocking projection from it.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DOCUMENT_CLASS_IDS,
  DOCUMENT_HOOK_EVENTS,
  DOCUMENT_HOOK_MODES,
  DocumentHooksError,
  normalizeDocumentHooksPolicy,
} from "./document-hooks.mjs";

export const DOCUMENT_LIFECYCLE_SCHEMA = "pipeline.document-lifecycle.v1";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DOCUMENT_LIFECYCLE_SCHEMA_PATH = resolve(HERE, "../scripts/document-lifecycle.schema.json");

const ROOT_KEYS = [
  "schema", "policyStatus", "policySha256", "baseCommit", "baseTree",
  "candidateCommit", "candidateTree", "diffSha256", "classes",
];
const EVALUATION_KEYS = [
  "classId", "bindingId", "mode", "event", "disposition", "status",
  "receiptId", "commitment", "failureClass",
];
const OUTCOME_KEYS = [...EVALUATION_KEYS, "rationalePresent"];
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const BINDING_ID = /^dh_[a-z2-7]{25}[aeimquy4]$/u;
const RECEIPT_ID = /^dhr_[a-z2-7]{25}[aeimquy4]$/u;
const POLICY_STATUSES = new Set(["absent", "configured"]);
const DISPOSITIONS = new Set(["affected", "unaffected-with-reason", "not-applicable"]);
const STATUSES = new Set(["complete", "unavailable", "review-pending", "error", "abandoned"]);
const FAILURE_CLASSES = new Set([
  "binding-unavailable", "private-root-unavailable", "adapter-unavailable",
  "review-pending", "trigger-evaluation-error", "executable-drift", "data-invalid",
  "template-invalid", "render-failed", "output-invalid", "timeout", "response-invalid",
  "resource-limit", "review-rejected", "receipt-invalid", "digest-drift",
]);
const EVENT_ORDER = new Map(DOCUMENT_HOOK_EVENTS.map((event, index) => [event, index]));

export class DocumentLifecycleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DocumentLifecycleError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new DocumentLifecycleError(code, message);
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function canonicalOid(value, label) {
  if (typeof value !== "string" || !OID.test(value)) fail("DL-OID", `${label} must be a full SHA-1 or SHA-256 object ID.`);
  return value;
}

function canonicalSha(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) fail("DL-SHA", `${label} must be a lowercase SHA-256 digest.`);
  return value;
}

function pairKey(bindingId, event) {
  return `${bindingId}\u0000${event}`;
}

function defaultEvaluation(pair) {
  return {
    classId: pair.classId,
    bindingId: pair.bindingId,
    mode: pair.mode,
    event: pair.event,
    disposition: "affected",
    status: "unavailable",
    receiptId: null,
    commitment: null,
    failureClass: "binding-unavailable",
  };
}

function expectedPairs(policy) {
  return normalizeDocumentHooksPolicy(policy).classes.flatMap((entry) => entry.events.map((event) => ({
    classId: entry.classId,
    bindingId: entry.bindingId,
    mode: entry.mode,
    event,
  })));
}

function validateContext(value) {
  if (!exactKeys(value, ["baseCommit", "baseTree", "candidateCommit", "candidateTree", "diffSha256"])) {
    fail("DL-CONTEXT", "Document lifecycle context must contain exactly the candidate identity fields.");
  }
  return {
    baseCommit: canonicalOid(value.baseCommit, "baseCommit"),
    baseTree: canonicalOid(value.baseTree, "baseTree"),
    candidateCommit: canonicalOid(value.candidateCommit, "candidateCommit"),
    candidateTree: canonicalOid(value.candidateTree, "candidateTree"),
    diffSha256: canonicalSha(value.diffSha256, "diffSha256"),
  };
}

function validateEvaluation(value, label = "evaluation") {
  if (!exactKeys(value, EVALUATION_KEYS)) fail("DL-EVALUATION", `${label} has an invalid closed shape.`);
  if (!DOCUMENT_CLASS_IDS.includes(value.classId) || typeof value.bindingId !== "string" || !BINDING_ID.test(value.bindingId)
    || !DOCUMENT_HOOK_MODES.includes(value.mode) || !DOCUMENT_HOOK_EVENTS.includes(value.event)
    || !DISPOSITIONS.has(value.disposition) || !STATUSES.has(value.status)) {
    fail("DL-EVALUATION", `${label} has invalid public vocabulary.`);
  }
  const receiptPresent = value.receiptId !== null || value.commitment !== null;
  if (receiptPresent && (typeof value.receiptId !== "string" || !RECEIPT_ID.test(value.receiptId)
    || typeof value.commitment !== "string" || !SHA256.test(value.commitment))) {
    fail("DL-EVIDENCE", `${label} has an incomplete public evidence commitment.`);
  }
  if (!receiptPresent && (value.receiptId !== null || value.commitment !== null)) {
    fail("DL-EVIDENCE", `${label} has an incomplete public evidence commitment.`);
  }
  if (value.status === "complete") {
    if (!receiptPresent || value.failureClass !== null) fail("DL-COMPLETE", `${label} complete status requires a committed receipt and no failure class.`);
  } else if (value.status === "abandoned") {
    if (value.failureClass !== null || receiptPresent) fail("DL-ABANDONED", `${label} abandoned status must carry no evidence or failure class.`);
  } else {
    if (!FAILURE_CLASSES.has(value.failureClass)) fail("DL-FAILURE", `${label} unresolved status requires a known failure class.`);
    if (value.failureClass === "binding-unavailable" && receiptPresent) {
      fail("DL-BINDING", `${label} binding-unavailable cannot claim a private receipt.`);
    }
  }
  return value;
}

function samePair(left, right) {
  return left.classId === right.classId && left.bindingId === right.bindingId
    && left.mode === right.mode && left.event === right.event;
}

/**
 * Create the exact public lifecycle projection for a Policy and candidate.
 * `policy: null` is the explicit no-Policy no-op; it still binds candidate
 * identity so a caller can hash the projection as an authority input.
 */
export function planDocumentLifecycle({ policy = null, policySha256 = null, context }) {
  const candidate = validateContext(context);
  if (policy === null) {
    if (policySha256 !== null) fail("DL-POLICY", "An absent Policy must have a null Policy digest.");
    return {
      schema: DOCUMENT_LIFECYCLE_SCHEMA,
      policyStatus: "absent",
      policySha256: null,
      ...candidate,
      classes: [],
    };
  }
  let pairs;
  try {
    pairs = expectedPairs(policy);
  } catch (error) {
    if (error instanceof DocumentHooksError) fail("DL-POLICY", "Document lifecycle requires a valid public document-hooks Policy.");
    throw error;
  }
  canonicalSha(policySha256, "policySha256");
  return {
    schema: DOCUMENT_LIFECYCLE_SCHEMA,
    policyStatus: "configured",
    policySha256,
    ...candidate,
    classes: pairs.map(defaultEvaluation),
  };
}

/** Validate an embedded lifecycle and, when supplied, bind it exactly to Policy pairs. */
export function validateDocumentLifecycle(value, { policy } = {}) {
  if (!exactKeys(value, ROOT_KEYS) || value.schema !== DOCUMENT_LIFECYCLE_SCHEMA || !POLICY_STATUSES.has(value.policyStatus)) {
    fail("DL-SCHEMA", "Document lifecycle has an invalid closed root shape.");
  }
  validateContext({
    baseCommit: value.baseCommit,
    baseTree: value.baseTree,
    candidateCommit: value.candidateCommit,
    candidateTree: value.candidateTree,
    diffSha256: value.diffSha256,
  });
  if (!Array.isArray(value.classes) || value.classes.length > 96) fail("DL-CLASSES", "Document lifecycle classes must contain at most 96 evaluations.");
  if (value.policyStatus === "absent") {
    if (value.policySha256 !== null || value.classes.length !== 0) fail("DL-ABSENT", "An absent Policy requires null digest and no evaluations.");
    if (policy !== undefined && policy !== null) fail("DL-POLICY", "A Policy cannot bind an absent lifecycle.");
    return value;
  }
  canonicalSha(value.policySha256, "policySha256");
  if (value.classes.length < 1) fail("DL-CLASSES", "A configured Policy requires one or more evaluations.");
  value.classes.forEach((entry, index) => validateEvaluation(entry, `classes[${index}]`));
  const seen = new Set();
  for (const entry of value.classes) {
    const key = pairKey(entry.bindingId, entry.event);
    if (seen.has(key)) fail("DL-PAIR-DUPLICATE", "Document lifecycle evaluations must be unique by binding and event.");
    seen.add(key);
  }
  if (policy !== undefined) {
    if (policy === null) fail("DL-POLICY", "A configured lifecycle requires its public Policy.");
    let pairs;
    try {
      pairs = expectedPairs(policy);
    } catch (error) {
      if (error instanceof DocumentHooksError) fail("DL-POLICY", "Document lifecycle requires a valid public document-hooks Policy.");
      throw error;
    }
    if (pairs.length !== value.classes.length || pairs.some((pair, index) => !samePair(pair, value.classes[index]))) {
      fail("DL-POLICY-ORDER", "Document lifecycle evaluations must exactly follow normalized Policy class and event order.");
    }
  } else {
    for (let index = 1; index < value.classes.length; index += 1) {
      const previous = value.classes[index - 1];
      const current = value.classes[index];
      const classOrder = Buffer.compare(Buffer.from(previous.classId), Buffer.from(current.classId));
      const bindingOrder = classOrder === 0 ? Buffer.compare(Buffer.from(previous.bindingId), Buffer.from(current.bindingId)) : classOrder;
      if (bindingOrder > 0 || (bindingOrder === 0 && EVENT_ORDER.get(previous.event) >= EVENT_ORDER.get(current.event))) {
        fail("DL-ORDER", "Document lifecycle evaluations are not in canonical public order.");
      }
    }
  }
  return value;
}

function outcomeToEvaluation(pair, outcome) {
  if (!exactKeys(outcome, OUTCOME_KEYS) || outcome.classId !== pair.classId || outcome.bindingId !== pair.bindingId
    || outcome.mode !== pair.mode || outcome.event !== pair.event || typeof outcome.rationalePresent !== "boolean") {
    fail("DL-OUTCOME", "Document lifecycle outcome does not exactly bind one planned class/event pair.");
  }
  const result = Object.fromEntries(EVALUATION_KEYS.map((key) => [key, outcome[key]]));
  validateEvaluation(result, "outcome");
  // A rationale is private evidence.  A caller cannot turn its absence into a
  // public passing disposition merely by asserting `unaffected-with-reason`.
  if (result.disposition === "unaffected-with-reason" && (!outcome.rationalePresent || result.status !== "complete")) {
    return {
      ...defaultEvaluation(pair),
      status: "review-pending",
      failureClass: "review-pending",
    };
  }
  return result;
}

/**
 * Replace every planned pair with one redacted coordinator outcome.  Input
 * order is irrelevant; the returned public lifecycle remains Policy ordered.
 */
export function applyDocumentLifecycleOutcomes(lifecycle, outcomes, { policy } = {}) {
  validateDocumentLifecycle(lifecycle, { policy });
  if (!Array.isArray(outcomes)) fail("DL-OUTCOMES", "Document lifecycle outcomes must be an array.");
  if (outcomes.length !== lifecycle.classes.length) fail("DL-OUTCOMES", "Document lifecycle needs exactly one outcome for every planned pair.");
  const byPair = new Map();
  for (const outcome of outcomes) {
    if (!object(outcome) || typeof outcome.bindingId !== "string" || typeof outcome.event !== "string") {
      fail("DL-OUTCOME", "Document lifecycle outcome lacks a pair identity.");
    }
    const key = pairKey(outcome.bindingId, outcome.event);
    if (byPair.has(key)) fail("DL-OUTCOME-DUPLICATE", "Document lifecycle outcomes may not duplicate a pair.");
    byPair.set(key, outcome);
  }
  const classes = lifecycle.classes.map((planned) => {
    const outcome = byPair.get(pairKey(planned.bindingId, planned.event));
    if (!outcome) fail("DL-OUTCOME-MISSING", "Document lifecycle outcome is missing a planned pair.");
    return outcomeToEvaluation(planned, outcome);
  });
  const evaluated = { ...lifecycle, classes };
  validateDocumentLifecycle(evaluated, { policy });
  return evaluated;
}

/** Return the mandatory close blockers without changing lifecycle evidence. */
export function assessDocumentLifecycle(lifecycle, { policy } = {}) {
  validateDocumentLifecycle(lifecycle, { policy });
  const blockers = lifecycle.classes
    .filter((entry) => entry.mode === "mandatory" && entry.status !== "complete")
    .map((entry) => ({
      classId: entry.classId,
      bindingId: entry.bindingId,
      event: entry.event,
      status: entry.status,
      failureClass: entry.failureClass,
    }));
  return { ready: blockers.length === 0, blockers };
}

/** Convenience evaluator: apply outcomes and return the explicit block decision. */
export function evaluateDocumentLifecycle({ lifecycle, outcomes, policy } = {}) {
  const evaluated = applyDocumentLifecycleOutcomes(lifecycle, outcomes, { policy });
  return { lifecycle: evaluated, ...assessDocumentLifecycle(evaluated, { policy }) };
}
