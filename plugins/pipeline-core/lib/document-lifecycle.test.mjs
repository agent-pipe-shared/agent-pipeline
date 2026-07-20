#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { DOCUMENT_HOOKS_POLICY_SCHEMA } from "./document-hooks.mjs";
import {
  DOCUMENT_LIFECYCLE_SCHEMA,
  DocumentLifecycleError,
  applyDocumentLifecycleOutcomes,
  assessDocumentLifecycle,
  evaluateDocumentLifecycle,
  planDocumentLifecycle,
  validateDocumentLifecycle,
} from "./document-lifecycle.mjs";

const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);
const D = "d".repeat(40);
const POLICY_SHA = "e".repeat(64);
const COMMITMENT = "f".repeat(64);
const ZERO = "dh_aaaaaaaaaaaaaaaaaaaaaaaaaa";
const SECOND = "dh_aaaaaaaaaaaaaaaaaaaaaaaaae";
const ONES = "dh_77777777777777777777777774";
const RECEIPT = "dhr_aaaaaaaaaaaaaaaaaaaaaaaaaa";

const context = Object.freeze({ baseCommit: A, baseTree: B, candidateCommit: C, candidateTree: D, diffSha256: POLICY_SHA });

function policy(classes) {
  return { schema: DOCUMENT_HOOKS_POLICY_SCHEMA, classes };
}

function entry(overrides = {}) {
  return { classId: "operations", bindingId: ZERO, mode: "mandatory", events: ["verify"], ...overrides };
}

function completeFor(planned, overrides = {}) {
  return {
    classId: planned.classId,
    bindingId: planned.bindingId,
    mode: planned.mode,
    event: planned.event,
    disposition: "not-applicable",
    status: "complete",
    receiptId: RECEIPT,
    commitment: COMMITMENT,
    failureClass: null,
    rationalePresent: false,
    ...overrides,
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error instanceof DocumentLifecycleError && error.code === code);
}

test("absent Policy creates an explicit candidate-bound no-op", () => {
  const lifecycle = planDocumentLifecycle({ policy: null, policySha256: null, context });
  assert.deepEqual(lifecycle, {
    schema: DOCUMENT_LIFECYCLE_SCHEMA,
    policyStatus: "absent",
    policySha256: null,
    ...context,
    classes: [],
  });
  assert.deepEqual(assessDocumentLifecycle(lifecycle), { ready: true, blockers: [] });
  assert.deepEqual(evaluateDocumentLifecycle({ lifecycle, outcomes: [] }), { lifecycle, ready: true, blockers: [] });
  expectCode(() => planDocumentLifecycle({ policy: null, policySha256: POLICY_SHA, context }), "DL-POLICY");
});

test("configured Policy expands its normalized classes and events exactly once", () => {
  const source = policy([
    entry({ classId: "privacy", bindingId: ONES, mode: "advisory", events: ["close", "design-impact"] }),
    entry({ classId: "authorization", bindingId: SECOND, events: ["close", "verify", "design-impact"] }),
    entry({ classId: "authorization", bindingId: ZERO, events: ["verify"] }),
  ]);
  const lifecycle = planDocumentLifecycle({ policy: source, policySha256: POLICY_SHA, context });
  assert.deepEqual(lifecycle.classes.map(({ classId, bindingId, mode, event }) => [classId, bindingId, mode, event]), [
    ["authorization", ZERO, "mandatory", "verify"],
    ["authorization", SECOND, "mandatory", "design-impact"],
    ["authorization", SECOND, "mandatory", "verify"],
    ["authorization", SECOND, "mandatory", "close"],
    ["privacy", ONES, "advisory", "design-impact"],
    ["privacy", ONES, "advisory", "close"],
  ]);
  assert(lifecycle.classes.every((item) => item.status === "unavailable" && item.failureClass === "binding-unavailable"));
  assert.equal(validateDocumentLifecycle(lifecycle, { policy: source }), lifecycle);
});

test("outcomes are order-independent but must completely cover the planned Policy", () => {
  const source = policy([
    entry({ events: ["verify", "close"] }),
    entry({ classId: "privacy", bindingId: SECOND, mode: "advisory", events: ["design-impact"] }),
  ]);
  const lifecycle = planDocumentLifecycle({ policy: source, policySha256: POLICY_SHA, context });
  const outcomes = lifecycle.classes.map(completeFor).reverse();
  const evaluated = applyDocumentLifecycleOutcomes(lifecycle, outcomes, { policy: source });
  assert.deepEqual(evaluated.classes.map((item) => item.event), ["verify", "close", "design-impact"]);
  assert.equal(assessDocumentLifecycle(evaluated, { policy: source }).ready, true);
  expectCode(() => applyDocumentLifecycleOutcomes(lifecycle, outcomes.slice(1), { policy: source }), "DL-OUTCOMES");
  expectCode(() => applyDocumentLifecycleOutcomes(lifecycle, [...outcomes, outcomes[0]], { policy: source }), "DL-OUTCOMES");
});

test("mandatory affected, unresolved evidence, and a missing rationale block close", () => {
  const source = policy([entry({ events: ["verify", "close"] })]);
  const lifecycle = planDocumentLifecycle({ policy: source, policySha256: POLICY_SHA, context });
  const [verify, close] = lifecycle.classes;
  const affected = completeFor(verify, { disposition: "affected" });
  const missingRationale = completeFor(close, { disposition: "unaffected-with-reason", rationalePresent: false });
  const result = evaluateDocumentLifecycle({ lifecycle, outcomes: [affected, missingRationale], policy: source });
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, [{
    classId: "operations", bindingId: ZERO, event: "close", status: "review-pending", failureClass: "review-pending",
  }]);
  assert.deepEqual(result.lifecycle.classes[1], {
    classId: "operations", bindingId: ZERO, mode: "mandatory", event: "close",
    disposition: "affected", status: "review-pending", receiptId: null, commitment: null, failureClass: "review-pending",
  });
  const unresolved = completeFor(verify, {
    disposition: "affected", status: "review-pending", receiptId: null, commitment: null, failureClass: "review-pending",
  });
  const unresolvedResult = evaluateDocumentLifecycle({ lifecycle, outcomes: [unresolved, completeFor(close)], policy: source });
  assert.equal(unresolvedResult.ready, false);
  assert.equal(unresolvedResult.blockers[0].event, "verify");
});

test("a rationale-bound unaffected outcome and advisory drift behave intentionally", () => {
  const source = policy([
    entry({ events: ["verify"] }),
    entry({ classId: "privacy", bindingId: SECOND, mode: "advisory", events: ["close"] }),
  ]);
  const lifecycle = planDocumentLifecycle({ policy: source, policySha256: POLICY_SHA, context });
  const [mandatory, advisory] = lifecycle.classes;
  const result = evaluateDocumentLifecycle({
    lifecycle,
    policy: source,
    outcomes: [
      completeFor(mandatory, { disposition: "unaffected-with-reason", rationalePresent: true }),
      completeFor(advisory, {
        disposition: "affected", status: "error", receiptId: null, commitment: null, failureClass: "render-failed",
      }),
    ],
  });
  assert.equal(result.ready, true);
  assert.equal(result.lifecycle.classes[0].disposition, "unaffected-with-reason");
  assert.equal(result.lifecycle.classes[1].status, "error");
});

test("closed records reject pair omission, malformed evidence, and policy-order drift", () => {
  const source = policy([entry({ events: ["verify", "close"] })]);
  const lifecycle = planDocumentLifecycle({ policy: source, policySha256: POLICY_SHA, context });
  const malformed = completeFor(lifecycle.classes[0], { commitment: null });
  expectCode(() => applyDocumentLifecycleOutcomes(lifecycle, [malformed, completeFor(lifecycle.classes[1])], { policy: source }), "DL-EVIDENCE");
  expectCode(() => validateDocumentLifecycle({ ...lifecycle, classes: [...lifecycle.classes].reverse() }, { policy: source }), "DL-POLICY-ORDER");
  expectCode(() => validateDocumentLifecycle({ ...lifecycle, extra: true }), "DL-SCHEMA");
});
