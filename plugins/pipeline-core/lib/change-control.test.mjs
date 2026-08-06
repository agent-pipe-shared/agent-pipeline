// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { appendChangeControlEntry, createChangeControlJournal, evaluateChangeControlGate, projectChangeControlState, validateChangeControlProfile } from "./change-control.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) }; const artifact = { path: "specs/release/result.md", sha256: "c".repeat(64) }; const window = { startsAtEpochMs: 10, endsAtEpochMs: 20 };
function profile(overrides = {}) { return { schema: "pipeline.change-control-profile.v1", profileId: "production-change", policySha256: "d".repeat(64), changeClass: "normal", candidate, artifact, environment: "production", scopeSha256: "e".repeat(64), window, mandatory: true, ...overrides }; }
function local(overrides = {}) { return { granted: true, candidate, artifact, environment: "production", scopeSha256: "e".repeat(64), emergencyAuthorized: false, ...overrides }; }
function receipt(overrides = {}) { return { schema: "pipeline.change-control-receipt.v1", profileId: "production-change", candidate, artifact, environment: "production", scopeSha256: "e".repeat(64), window, state: "approved", authenticated: true, ...overrides }; }
test("allows mandatory promotion only when independent local and external authority bind the exact same tuple", () => assert.deepEqual(evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local(), externalReceipt: receipt(), nowEpochMs: 15 }), { schema: "pipeline.change-control-gate.v1", status: "allowed", reason: "composed-authority" }));
test("blocks stale, unauthenticated, mismatched, unavailable, and outside-window external change state", () => {
  for (const externalReceipt of [null, receipt({ authenticated: false }), receipt({ state: "draft" }), receipt({ environment: "staging" })]) assert.equal(evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local(), externalReceipt, nowEpochMs: 15 }).status, "blocked");
  assert.equal(evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local(), externalReceipt: receipt(), nowEpochMs: 21 }).reason, "outside-window");
});
const binding = { profileId: "production-change", candidate, artifact, environment: "production", scopeSha256: "e".repeat(64) };
const localEvent = (event, occurredAtEpochMs) => ({ class: "local", event, occurredAtEpochMs, evidenceSha256: "f".repeat(64) });
const externalEvent = (forEvent, disposition, occurredAtEpochMs, receiptId = null) => ({ class: "external", forEvent, disposition, occurredAtEpochMs, receiptId });
const journalOf = (...entries) => entries.reduce(appendChangeControlEntry, createChangeControlJournal(binding));

// C-AC-05: each deployment transition is published externally only after the
// local event exists, and failed attempts survive in the record.
test("C-AC-05 publishes an external update only after its local deployment event and preserves failed attempts", () => {
  for (const first of [externalEvent("began", "published", 1), localEvent("validated", 1), localEvent("failed", 1), localEvent("rolled-back", 1)]) {
    assert.throws(() => journalOf(first), (error) => error.code === "CC-JOURNAL-ORDER", `admitted ${JSON.stringify(first)} as the first entry`);
  }
  const started = journalOf(localEvent("began", 1));
  // Every transition is refused externally until its own local event exists.
  for (const event of ["validated", "failed", "rolled-back"]) assert.throws(() => appendChangeControlEntry(started, externalEvent(event, "published", 2)), (error) => error.code === "CC-JOURNAL-ORDER");
  assert.equal(appendChangeControlEntry(started, externalEvent("began", "published", 2)).entries.length, 2);
  // A later success never removes the attempts that failed before it.
  const retried = journalOf(localEvent("began", 1), externalEvent("began", "publish-failed", 2), externalEvent("began", "unavailable", 3), externalEvent("began", "published", 4, "receipt-1"));
  const state = projectChangeControlState(retried);
  assert.equal(state.attempts.length, 3);
  assert.equal(state.failedAttempts, 2);
  assert.deepEqual(state.attempts.map((entry) => entry.disposition), ["publish-failed", "unavailable", "published"]);
  assert.equal(Object.isFrozen(retried.entries), true);
  // Out-of-order local transitions and backwards timestamps are refused.
  assert.throws(() => appendChangeControlEntry(started, localEvent("began", 2)), (error) => error.code === "CC-JOURNAL-ORDER");
  assert.throws(() => appendChangeControlEntry(started, localEvent("validated", 0)), (error) => error.code === "CC-JOURNAL-ORDER");
  assert.throws(() => appendChangeControlEntry(started, { class: "local", event: "deployed", occurredAtEpochMs: 2, evidenceSha256: "f".repeat(64) }), (error) => error.code === "CC-JOURNAL-ENTRY");
  assert.throws(() => createChangeControlJournal({ ...binding, note: "free text" }), (error) => error.code === "CC-JOURNAL");
});

// C-AC-06: a successful deployment whose external update or readback fails is
// reconciliation-required, with its evidence retained and no completion claim.
test("C-AC-06 enters reconciliation-required instead of claiming completed change control", () => {
  const deployed = journalOf(localEvent("began", 1), externalEvent("began", "published", 2), localEvent("validated", 3));
  for (const disposition of ["publish-failed", "readback-failed", "readback-mismatch", "unavailable"]) {
    const state = projectChangeControlState(appendChangeControlEntry(deployed, externalEvent("validated", disposition, 4)));
    assert.equal(state.status, "reconciliation-required", `disposition ${disposition}`);
    assert.equal(state.reason, "external-update-outstanding");
    assert.equal(state.deploymentEvent, "validated");
    assert.equal(state.deploymentEvidenceRetained, true);
  }
  // No external update at all is equally not completed.
  assert.equal(projectChangeControlState(deployed).status, "reconciliation-required");
  const completed = projectChangeControlState(appendChangeControlEntry(deployed, externalEvent("validated", "published", 4, "receipt-2")));
  assert.equal(completed.status, "completed");
  assert.equal(completed.reason, "composed-change-control");
  // An earlier success must not mask a later failure. Every case above appends
  // the failure before any successful publish, which an order-blind projection
  // passes; this is the same journal with the two in the other order.
  for (const disposition of ["publish-failed", "readback-failed", "readback-mismatch", "unavailable"]) {
    const regressed = appendChangeControlEntry(
      appendChangeControlEntry(deployed, externalEvent("validated", "published", 4, "receipt-2")),
      externalEvent("validated", disposition, 5),
    );
    const state = projectChangeControlState(regressed);
    assert.equal(state.status, "reconciliation-required", `late ${disposition}`);
    assert.equal(state.reason, "external-update-outstanding");
    // The successful attempt stays in the record; it just stops being current.
    assert.equal(state.attempts.length, 3);
    assert.equal(state.failedAttempts, 1);
  }
  // A published update for a different transition never completes this one.
  assert.equal(projectChangeControlState(appendChangeControlEntry(deployed, externalEvent("began", "published", 4))).status, "reconciliation-required");
  assert.equal(projectChangeControlState(createChangeControlJournal(binding)).status, "not-started");
  assert.equal(projectChangeControlState(journalOf(localEvent("began", 1))).status, "in-progress");
  const rolledBack = journalOf(localEvent("began", 1), localEvent("failed", 2), externalEvent("failed", "published", 3), localEvent("rolled-back", 4));
  assert.equal(projectChangeControlState(rolledBack).status, "reconciliation-required");
  assert.equal(projectChangeControlState(appendChangeControlEntry(rolledBack, externalEvent("rolled-back", "published", 5))).status, "rolled-back");
});

// C-AC-10: an automatically created external record is an observation. It never
// becomes external approval by virtue of existing.
test("C-AC-10 keeps an automatically created external record as draft or observation", () => {
  for (const state of ["draft", "rejected", "expired", "conflicting", "unknown", "unavailable"]) {
    const result = evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local(), externalReceipt: receipt({ state }), nowEpochMs: 15 });
    assert.equal(result.status, "blocked", state);
    assert.equal(result.reason, "external-authority");
  }
  // Approval alone is not enough: it must also be authenticated.
  assert.equal(evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local(), externalReceipt: receipt({ state: "approved", authenticated: false }), nowEpochMs: 15 }).reason, "external-authority");
  // And an approval state outside the taxonomy is never inferred into one.
  assert.throws(() => evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local(), externalReceipt: receipt({ state: "looks-approved" }), nowEpochMs: 15 }), (error) => error.code === "CC-RECEIPT");
});

// C-AC-11: provider product names and fields belong to adapter profiles, never
// to the provider-neutral deploy or change-control core.
test("C-AC-11 keeps provider names and fields out of the provider-neutral core schemas", () => {
  for (const field of ["serviceNowSysId", "jiraServiceDeskId", "remedyChangeType", "providerFields", "customFields"]) {
    assert.throws(() => validateChangeControlProfile(profile({ [field]: "provider-fixture" })), (error) => error.code === "CC-PROFILE", field);
    assert.throws(() => evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local(), externalReceipt: receipt({ [field]: "provider-fixture" }), nowEpochMs: 15 }), (error) => error.code === "CC-RECEIPT", field);
    assert.throws(() => evaluateChangeControlGate({ profile: profile(), pipelineAuthority: { ...local(), [field]: "provider-fixture" }, externalReceipt: receipt(), nowEpochMs: 15 }), (error) => error.code === "CC-GATE", field);
    assert.throws(() => createChangeControlJournal({ ...binding, [field]: "provider-fixture" }), (error) => error.code === "CC-JOURNAL", field);
  }
  assert.deepEqual(Object.keys(validateChangeControlProfile(profile())).sort(), ["artifact", "candidate", "changeClass", "environment", "mandatory", "policySha256", "profileId", "schema", "scopeSha256", "window"]);
  // The change class vocabulary is closed; a provider class cannot widen it.
  assert.throws(() => validateChangeControlProfile(profile({ changeClass: "expedited" })), (error) => error.code === "CC-PROFILE");
});

test("requires explicit emergency authority and keeps not-required independent", () => {
  assert.equal(evaluateChangeControlGate({ profile: profile({ changeClass: "emergency" }), pipelineAuthority: local(), externalReceipt: receipt(), nowEpochMs: 15 }).reason, "emergency-authority");
  assert.equal(evaluateChangeControlGate({ profile: profile({ changeClass: "not-required", mandatory: false }), pipelineAuthority: local(), externalReceipt: null, nowEpochMs: 15 }).reason, "not-required");
  assert.throws(() => validateChangeControlProfile(profile({ changeClass: "not-required", mandatory: true })), (error) => error.code === "CC-PROFILE");
});
