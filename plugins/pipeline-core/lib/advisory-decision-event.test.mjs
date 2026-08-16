#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  ADVISORY_DECISION_REASON_CODES,
  AdvisoryDecisionEventError,
  buildAdvisoryDecisionEvent,
} from "./advisory-decision-event.mjs";
import { ADVISORY_RECEIPT_SCHEMA, validateAdvisoryReceipt } from "./advisory-receipt.mjs";
import { AgentDecisionJournalError } from "./agent-decision-journal.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/** A first-attempt native success, matching advisory-receipt.test.mjs's own fixture conventions. */
const RECEIPT = Object.freeze({
  schema: ADVISORY_RECEIPT_SCHEMA,
  receiptId: "advisory-20260719-01",
  dispatch: {
    dispatchId: "dispatch-20260719-01",
    queueRevision: 7,
    candidateCommit: "a".repeat(40),
    candidateTree: "b".repeat(40),
  },
  duty: "advisory",
  profile: "epic",
  configuredRoute: {
    runner: "claude",
    selector: { kind: "alias", value: "fable" },
    effort: "max",
  },
  adapter: "native",
  observed: {
    status: "answered",
    identity: { provider: "anthropic", modelId: "claude-fable", effort: "max" },
  },
  questionSha256: sha256("bound advisory content"),
  answerSha256: sha256("sanitized advice"),
  fallback: { reason: "none", redactedErrorClass: null },
  emittedAtMs: 1_784_355_600_000,
});

const copy = (value) => structuredClone(value);
const byDimension = (entries) => [...entries].sort((left, right) => left.dimension.localeCompare(right.dimension));

test("A-AC-05 translates a first-attempt success into a validated selection event", () => {
  const event = buildAdvisoryDecisionEvent({ receipt: copy(RECEIPT), nowMs: 1_784_355_601_000 });
  assert.equal(event.kind, "selection");
  assert.equal(event.state, "declared");
  assert.equal(event.reasonCode, ADVISORY_DECISION_REASON_CODES.selection);
  assert.equal(event.reasonCode, "ADVISORY_ROUTE_SELECTED");
  assert.equal(event.eventId, "advisory-20260719-01-decision");
  assert.equal(event.relatedHumanDecisionId, null);
  assert.equal(event.supersedesEventId, null);
  assert.equal(
    event.candidateDigest,
    sha256(JSON.stringify({ candidateCommit: "a".repeat(40), candidateTree: "b".repeat(40) })),
  );
  // The event came back through validateAgentDecisionEvent, not around it.
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.identity), true);
  // A-AC-05 is identity provenance, not epistemic status: the two axes stay separate.
  assert.equal(Object.hasOwn(event, "assumptionState"), false);
  // No timestamp is smuggled onto a base shape that has no timestamp key.
  assert.equal(Object.hasOwn(event, "occurredAtEpochMs"), false);
});

test("A-AC-05 distinguishes a route that succeeded only after an earlier failure", () => {
  const fellBack = copy(RECEIPT);
  fellBack.adapter = "consult";
  fellBack.fallback = { reason: "native-unavailable", redactedErrorClass: "unavailable" };
  const fallbackEvent = buildAdvisoryDecisionEvent({ receipt: fellBack });
  assert.equal(fallbackEvent.kind, "fallback");
  assert.equal(fallbackEvent.reasonCode, ADVISORY_DECISION_REASON_CODES.fallback);
  assert.equal(fallbackEvent.reasonCode, "ADVISORY_ROUTE_FALLBACK");

  // Identical in every respect except kind/reasonCode and the adapter that answered.
  const selectionEvent = buildAdvisoryDecisionEvent({ receipt: copy(RECEIPT) });
  assert.deepEqual(
    {
      ...fallbackEvent,
      kind: "selection",
      reasonCode: "ADVISORY_ROUTE_SELECTED",
      identity: byDimension(fallbackEvent.identity).filter((entry) => entry.dimension !== "adapter"),
    },
    {
      ...selectionEvent,
      identity: byDimension(selectionEvent.identity).filter((entry) => entry.dimension !== "adapter"),
    },
  );
  assert.deepEqual(
    fallbackEvent.identity.find((entry) => entry.dimension === "adapter"),
    { dimension: "adapter", value: "consult", provenance: "same-dispatch-observed", assurance: "verified" },
  );
});

test("A-AC-05 records all five identity dimensions with an explicit provenance and assurance", () => {
  const event = buildAdvisoryDecisionEvent({ receipt: copy(RECEIPT) });
  assert.deepEqual(byDimension(event.identity), byDimension([
    // Re-derived here from observed.identity.provider, so this translator may claim `verified`.
    { dimension: "runner", value: "claude", provenance: "same-dispatch-observed", assurance: "verified" },
    // Self-reported; alias matching is enforced in advisory-coordinator.mjs, not re-run here.
    { dimension: "model", value: "claude-fable", provenance: "same-dispatch-observed", assurance: "reported" },
    { dimension: "effort", value: "max", provenance: "same-dispatch-observed", assurance: "reported" },
    // A fact about this dispatch's own control flow, not an external claim.
    { dimension: "adapter", value: "native", provenance: "same-dispatch-observed", assurance: "verified" },
    // Caller-supplied routing input; nothing observes it back.
    { dimension: "profile", value: "epic", provenance: "requested-route", assurance: "reported" },
  ]));
  assert.equal(new Set(event.identity.map((entry) => entry.dimension)).size, 5);
  for (const entry of event.identity) {
    assert.deepEqual(Object.keys(entry).sort(), ["assurance", "dimension", "provenance", "value"]);
  }
});

test("A-AC-05 refuses an unanswered receipt with a named code instead of guessing an identity", () => {
  const exhausted = copy(RECEIPT);
  exhausted.observed = { status: "failed", identity: null };
  exhausted.answerSha256 = null;
  exhausted.fallback = { reason: "consult-unavailable", redactedErrorClass: "unavailable" };
  assert.deepEqual(validateAdvisoryReceipt(copy(exhausted)), { ok: true }, "the fixture must be a valid receipt");
  assert.throws(
    () => buildAdvisoryDecisionEvent({ receipt: exhausted }),
    (error) => error instanceof AdvisoryDecisionEventError && error.code === "ADE-RECEIPT-UNANSWERED",
    "an exhausted route must be refused by name, never translated into an identity-bearing event",
  );
});

test("A-AC-05 refuses a receipt whose observed provider contradicts the configured runner", () => {
  const drifted = copy(RECEIPT);
  drifted.observed.identity.provider = "openai";
  assert.deepEqual(validateAdvisoryReceipt(copy(drifted)), { ok: false, reason: "observed-runner-drift" });
  assert.throws(
    () => buildAdvisoryDecisionEvent({ receipt: drifted }),
    (error) => error instanceof AdvisoryDecisionEventError && error.code === "ADE-RECEIPT-INVALID",
    "a drifted receipt must be refused, never translated",
  );
});

test("A-AC-05's provider re-derivation is independent, not a restatement of the receipt validator", () => {
  // The receipt validator's own `observed-runner-drift` check makes a drifted
  // receipt structurally unreachable -- which is exactly why this translator's
  // second, independent check would be untested dead code without a receipt
  // that is valid WHEN validated and drifted when read afterwards. The number of
  // reads validation performs is probed rather than hard-coded, so this stays
  // true if that validator's internals change.
  const probe = copy(RECEIPT);
  let probeReads = 0;
  Object.defineProperty(probe.observed.identity, "provider", {
    configurable: true,
    enumerable: true,
    get() { probeReads += 1; return "anthropic"; },
  });
  assert.deepEqual(validateAdvisoryReceipt(probe), { ok: true }, "the probe receipt must validate");
  assert.ok(probeReads > 0, "the probe never observed a provider read");

  const hostile = copy(RECEIPT);
  let reads = 0;
  Object.defineProperty(hostile.observed.identity, "provider", {
    configurable: true,
    enumerable: true,
    get() { reads += 1; return reads > probeReads ? "openai" : "anthropic"; },
  });
  assert.throws(
    () => buildAdvisoryDecisionEvent({ receipt: hostile }),
    (error) => error instanceof AdvisoryDecisionEventError && error.code === "ADE-IDENTITY-DRIFT",
    "the translator trusted an already-validated receipt instead of re-deriving the runner itself",
  );
});

test("A-AC-05 lets the journal itself refuse a modelId the receipt pattern admits and the journal does not", () => {
  // advisory-receipt.mjs's MODEL_ID additionally allows `/`; agent-decision-journal.mjs's
  // ID does not. The gap is real and pre-existing; this translator neither pre-filters nor
  // normalizes it, so the journal stays the single source of truth for admissibility.
  const slashed = copy(RECEIPT);
  slashed.profile = "feature";
  slashed.adapter = "consult";
  slashed.configuredRoute = { runner: "codex", selector: { kind: "model-id", value: "openai/gpt-5.6-sol" }, effort: "xhigh" };
  slashed.observed.identity = { provider: "openai", modelId: "openai/gpt-5.6-sol", effort: "xhigh" };
  assert.deepEqual(validateAdvisoryReceipt(copy(slashed)), { ok: true }, "the receipt itself must stay valid");
  assert.throws(
    () => buildAdvisoryDecisionEvent({ receipt: slashed }),
    (error) => error instanceof AgentDecisionJournalError
      && !(error instanceof AdvisoryDecisionEventError)
      && error.code === "ADJ-SHAPE",
    "the refusal must come from the journal validator, not from a pre-check duplicated here",
  );
});

test("A-AC-05 translation is deterministic and reaches for no clock or randomness of its own", () => {
  const first = buildAdvisoryDecisionEvent({ receipt: copy(RECEIPT), nowMs: 1 });
  const second = buildAdvisoryDecisionEvent({ receipt: copy(RECEIPT), nowMs: 2_000_000_000_000 });
  assert.deepEqual(first, second, "an injected clock leaked into the translated event");
  const injected = buildAdvisoryDecisionEvent({ receipt: copy(RECEIPT), eventId: "advisory-decision-override-1" });
  assert.equal(injected.eventId, "advisory-decision-override-1");
  assert.deepEqual({ ...injected, eventId: first.eventId }, { ...first });
});

test("A-AC-05 refuses a non-receipt outright rather than translating whatever it was handed", () => {
  for (const receipt of [undefined, null, {}, { ...copy(RECEIPT), duty: "review" }]) {
    assert.throws(
      () => buildAdvisoryDecisionEvent({ receipt }),
      (error) => error instanceof AdvisoryDecisionEventError && error.code === "ADE-RECEIPT-INVALID",
      `a non-receipt input was not refused by name: ${JSON.stringify(receipt)}`,
    );
  }
});
