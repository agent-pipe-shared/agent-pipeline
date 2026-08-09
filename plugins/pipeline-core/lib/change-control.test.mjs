// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { appendChangeControlEntry, createChangeControlJournal, detectChangeClassShopping, evaluateChangeControlGate, projectChangeControlState, resolveChangeControlProfile, validateChangeControlProfile } from "./change-control.mjs";

const decisionReferenceFixture = {
  schema: "pipeline.human-decision-reference.v1",
  decisionId: "PHX-DEC-1",
  decisionDigest: "1".repeat(64),
  candidate: { commit: "2".repeat(40), tree: "3".repeat(40) },
  checkpoint: {
    repositoryFingerprint: "4".repeat(64),
    streamId: "human",
    sequence: 1,
    eventDigest: "5".repeat(64),
    candidateCommit: "2".repeat(40),
    candidateTree: "3".repeat(40),
  },
};

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) }; const artifact = { path: "specs/release/result.md", sha256: "c".repeat(64) }; const window = { startsAtEpochMs: 10, endsAtEpochMs: 20 };
function profile(overrides = {}) { return { schema: "pipeline.change-control-profile.v1", profileId: "production-change", policySha256: "d".repeat(64), changeClass: "normal", candidate, artifact, environment: "production", scopeSha256: "e".repeat(64), window, mandatory: true, standardTemplate: null, reviewPolicy: "mandatory", ...overrides }; }
function local(overrides = {}) { return { granted: true, candidate, artifact, environment: "production", scopeSha256: "e".repeat(64), emergencyAuthorized: false, ...overrides }; }
function receipt(overrides = {}) { return { schema: "pipeline.change-control-receipt.v1", profileId: "production-change", candidate, artifact, environment: "production", scopeSha256: "e".repeat(64), window, state: "approved", authenticated: true, ...overrides }; }
test("allows mandatory promotion only when independent local and external authority bind the exact same tuple", () => assert.deepEqual(evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local(), externalReceipt: receipt(), nowEpochMs: 15 }), { schema: "pipeline.change-control-gate.v1", status: "allowed", reason: "composed-authority" }));
test("blocks stale, unauthenticated, mismatched, unavailable, and outside-window external change state", () => {
  for (const externalReceipt of [null, receipt({ authenticated: false }), receipt({ state: "draft" }), receipt({ environment: "staging" })]) assert.equal(evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local(), externalReceipt, nowEpochMs: 15 }).status, "blocked");
  assert.equal(evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local(), externalReceipt: receipt(), nowEpochMs: 21 }).reason, "outside-window");
});
const binding = { profileId: "production-change", candidate, artifact, environment: "production", scopeSha256: "e".repeat(64), changeClass: "normal" };
const retrospectiveEvent = (forEvent, occurredAtEpochMs) => ({ class: "retrospective", forEvent, occurredAtEpochMs, evidenceSha256: "f".repeat(64) });
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
  assert.deepEqual(Object.keys(validateChangeControlProfile(profile())).sort(), ["artifact", "candidate", "changeClass", "environment", "mandatory", "policySha256", "profileId", "reviewPolicy", "schema", "scopeSha256", "standardTemplate", "window"]);
  // The change class vocabulary is closed; a provider class cannot widen it.
  assert.throws(() => validateChangeControlProfile(profile({ changeClass: "expedited" })), (error) => error.code === "CC-PROFILE");
});

test("requires explicit emergency authority and keeps not-required independent", () => {
  assert.equal(evaluateChangeControlGate({ profile: profile({ changeClass: "emergency" }), pipelineAuthority: local(), externalReceipt: receipt(), nowEpochMs: 15 }).reason, "emergency-authority");
  assert.equal(evaluateChangeControlGate({ profile: profile({ changeClass: "not-required", mandatory: false, reviewPolicy: null }), pipelineAuthority: local(), externalReceipt: null, nowEpochMs: 15 }).reason, "not-required");
  assert.throws(() => validateChangeControlProfile(profile({ changeClass: "not-required", mandatory: true })), (error) => error.code === "CC-PROFILE");
});

// C-AC-02: standard is one of the four distinct changeClass values and is paired
// with mandatory authority exactly like normal and emergency; only not-required
// may waive it. Standard's required INPUT FIELDS are now distinguished from
// normal's: a standard profile must bind a `standardTemplate` (`templateId` +
// `revision`), the externally pre-authorized template and its still-valid
// revision named by issue #24 §5, and every other class must carry it as
// `null`. What remains ABSENT for C-AC-02 is the other half: nothing here
// detects or rejects a class picked solely to avoid approval (see
// evidence/phx-wp-c.txt).
test("C-AC-02 validates standard as a distinct change class that still requires paired mandatory authority", () => {
  assert.equal(evaluateChangeControlGate({ profile: profile({ changeClass: "standard", standardTemplate: { templateId: "tmpl-1", revision: "rev-1" } }), pipelineAuthority: local(), externalReceipt: receipt(), nowEpochMs: 15 }).status, "allowed");
  assert.throws(() => validateChangeControlProfile(profile({ changeClass: "standard", mandatory: false, standardTemplate: { templateId: "tmpl-1", revision: "rev-1" } })), (error) => error.code === "CC-PROFILE");
});

// C-AC-02: standardTemplate is required, closed, and class-conditioned -- present
// and well-formed only when changeClass is "standard", null otherwise.
test("C-AC-02 requires a well-formed standardTemplate only when changeClass is standard", () => {
  assert.doesNotThrow(() => validateChangeControlProfile(profile({ changeClass: "standard", standardTemplate: { templateId: "tmpl-1", revision: "rev-1" } })));
  assert.throws(() => validateChangeControlProfile(profile({ changeClass: "standard" })), (error) => error.code === "CC-PROFILE");
  assert.throws(() => validateChangeControlProfile(profile({ changeClass: "normal", standardTemplate: { templateId: "tmpl-1", revision: "rev-1" } })), (error) => error.code === "CC-PROFILE");
  assert.throws(() => validateChangeControlProfile(profile({ changeClass: "standard", standardTemplate: { templateId: "tmpl-1" } })), (error) => error.code === "CC-PROFILE");
  assert.throws(() => validateChangeControlProfile(profile({ changeClass: "standard", standardTemplate: { templateId: "tmpl-1", revision: "rev-1", extra: "x" } })), (error) => error.code === "CC-PROFILE");
});

// C-AC-07: an emergency authorization is bound to the exact scope hash like any
// other class -- it cannot be reused across a mismatched scope, so "bounded
// scope" holds even under emergency.
test("C-AC-07 keeps emergency authority bounded to its exact scope instead of acting as a generic bypass", () => {
  const mismatched = evaluateChangeControlGate({
    profile: profile({ changeClass: "emergency" }),
    pipelineAuthority: local({ emergencyAuthorized: true, scopeSha256: "f".repeat(64) }),
    externalReceipt: receipt(),
    nowEpochMs: 15,
  });
  assert.equal(mismatched.status, "blocked");
  assert.equal(mismatched.reason, "pipeline-authority");
});

// C-AC-07 (WP-C-AC07): retrospective evidence -- necessarily after-the-fact,
// since appendChangeControlEntry refuses it before the local event it reviews
// exists and requires it strictly later in time -- is now required before an
// emergency-class deployment reports completed change control, even once its
// external update is published exactly as C-AC-06 already requires.
test("C-AC-07 requires retrospective evidence before an emergency-class deployment reports completed change control", () => {
  const emergencyBinding = { ...binding, changeClass: "emergency" };
  const emergencyJournalOf = (...entries) => entries.reduce(appendChangeControlEntry, createChangeControlJournal(emergencyBinding));
  const deployed = emergencyJournalOf(localEvent("began", 1), externalEvent("began", "published", 2), localEvent("validated", 3), externalEvent("validated", "published", 4));
  // The external update is published (C-AC-06's own bar), but without
  // retrospective evidence this is distinctly NOT completed, and distinctly
  // NOT the ordinary "external update outstanding" reconciliation-required
  // either -- both the status and the reason name the missing artifact.
  const pending = projectChangeControlState(deployed);
  assert.equal(pending.status, "emergency-review-required");
  assert.equal(pending.reason, "retrospective-evidence-outstanding");
  assert.notEqual(pending.status, "completed");
  assert.notEqual(pending.status, "reconciliation-required");
  // Missing the external update entirely is still ordinary reconciliation-
  // required, regardless of changeClass -- retrospective evidence is an
  // ADDITIONAL bar on top of C-AC-06's, never a substitute for it.
  const undeployedExternally = emergencyJournalOf(localEvent("began", 1), externalEvent("began", "published", 2), localEvent("validated", 3));
  assert.equal(projectChangeControlState(undeployedExternally).status, "reconciliation-required");
  assert.equal(projectChangeControlState(undeployedExternally).reason, "external-update-outstanding");
  // A retrospective entry cannot be backdated to or before the event it
  // reviews -- it must be a genuinely later act.
  assert.throws(() => appendChangeControlEntry(deployed, retrospectiveEvent("validated", 3)), (error) => error.code === "CC-JOURNAL-ORDER");
  assert.throws(() => appendChangeControlEntry(deployed, retrospectiveEvent("validated", 2)), (error) => error.code === "CC-JOURNAL-ORDER");
  // Nor can it review an event that never happened locally.
  assert.throws(() => appendChangeControlEntry(deployed, retrospectiveEvent("rolled-back", 5)), (error) => error.code === "CC-JOURNAL-ORDER");
  // Once genuinely later retrospective evidence for the validated event is
  // appended, the same journal now reports completed change control.
  const reviewed = appendChangeControlEntry(deployed, retrospectiveEvent("validated", 5));
  const completed = projectChangeControlState(reviewed);
  assert.equal(completed.status, "completed");
  assert.equal(completed.reason, "composed-change-control");
});

// C-AC-07 (WP-C-AC07): a non-emergency-class deployment's journal, append
// behavior, and completion projection are completely unaffected by the
// retrospective-evidence requirement -- the same assertions C-AC-06 already
// proves for `changeClass: "normal"` above hold unchanged for every other
// non-emergency class, with no retrospective entry ever appended.
test("C-AC-07 leaves a non-emergency-class deployment's journal and completion behavior unaffected", () => {
  for (const changeClass of ["standard", "normal", "not-required"]) {
    const classBinding = { ...binding, changeClass };
    const classJournalOf = (...entries) => entries.reduce(appendChangeControlEntry, createChangeControlJournal(classBinding));
    const deployed = classJournalOf(localEvent("began", 1), externalEvent("began", "published", 2), localEvent("validated", 3), externalEvent("validated", "published", 4));
    const state = projectChangeControlState(deployed);
    assert.equal(state.status, "completed", changeClass);
    assert.equal(state.reason, "composed-change-control", changeClass);
    // Missing the external update is still ordinary reconciliation-required,
    // never the emergency-only review status, for every non-emergency class.
    const outstanding = classJournalOf(localEvent("began", 1), externalEvent("began", "published", 2), localEvent("validated", 3));
    const outstandingState = projectChangeControlState(outstanding);
    assert.equal(outstandingState.status, "reconciliation-required", changeClass);
    assert.notEqual(outstandingState.status, "emergency-review-required", changeClass);
  }
});

// C-AC-12: the gate names a distinct, operator-visible reason when the external
// ITSM system is unreachable (no receipt at all) under a mandatory profile,
// separate from every other block reason. An explicit advisory policy mode
// distinct from not-required is ABSENT: mandatory:false is only permitted
// together with changeClass:"not-required" (line 10), and "not-required"
// short-circuits before ever consulting externalReceipt (line 24) -- so no
// configuration can apply an advisory policy while noting the external system
// is unavailable (see evidence/phx-wp-c.txt).
test("C-AC-12 names a distinct external-unavailable reason when the external ITSM system cannot be reached", () => {
  const blocked = evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local(), externalReceipt: null, nowEpochMs: 15 });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.reason, "external-unavailable");
});

// C-AC-12: reviewPolicy closes the gap the test above documented -- "advisory"
// still wants ITSM review when reachable, but never hard-blocks when it is
// not, surfacing a distinct, operator-visible reason instead.
test("C-AC-12 advisory review policy allows an unreachable external ITSM system with a distinct, operator-visible reason", () => {
  const advisoryProfile = profile({ reviewPolicy: "advisory" });
  const result = evaluateChangeControlGate({ profile: advisoryProfile, pipelineAuthority: local(), externalReceipt: null, nowEpochMs: 15 });
  assert.equal(result.status, "allowed");
  assert.equal(result.reason, "reconciliation-required");
  assert.notEqual(result.reason, "not-required");
  assert.notEqual(result.reason, "composed-authority");
});

// C-AC-12: advisory only changes what happens when the receipt is absent --
// when it is present, review composes exactly like a mandatory profile,
// including refusing an unapproved receipt.
test("C-AC-12 advisory review policy still composes authority normally when the external receipt is available", () => {
  const advisoryProfile = profile({ reviewPolicy: "advisory" });
  assert.deepEqual(evaluateChangeControlGate({ profile: advisoryProfile, pipelineAuthority: local(), externalReceipt: receipt(), nowEpochMs: 15 }), { schema: "pipeline.change-control-gate.v1", status: "allowed", reason: "composed-authority" });
  assert.equal(evaluateChangeControlGate({ profile: advisoryProfile, pipelineAuthority: local(), externalReceipt: receipt({ state: "rejected" }), nowEpochMs: 15 }).reason, "external-authority");
});

// C-AC-12: advisory is additive to, never a bypass of, the pre-existing
// pipeline-authority and emergency-authority checks -- both still run and can
// still block an advisory profile before reviewPolicy is ever consulted.
test("C-AC-12 advisory review policy never bypasses pipeline-authority or emergency-authority checks", () => {
  const advisoryProfile = profile({ reviewPolicy: "advisory" });
  assert.equal(evaluateChangeControlGate({ profile: advisoryProfile, pipelineAuthority: local({ granted: false }), externalReceipt: null, nowEpochMs: 15 }).reason, "pipeline-authority");
  const advisoryEmergency = profile({ changeClass: "emergency", reviewPolicy: "advisory" });
  assert.equal(evaluateChangeControlGate({ profile: advisoryEmergency, pipelineAuthority: local(), externalReceipt: null, nowEpochMs: 15 }).reason, "emergency-authority");
});

// C-AC-12: reviewPolicy is closed-vocabulary and class/mandatory-conditioned,
// exactly like standardTemplate -- required only when mandatory is true, null
// otherwise.
test("C-AC-12 requires a well-formed reviewPolicy only when mandatory is true", () => {
  assert.doesNotThrow(() => validateChangeControlProfile(profile({ reviewPolicy: "advisory" })));
  assert.throws(() => validateChangeControlProfile(profile({ reviewPolicy: null })), (error) => error.code === "CC-PROFILE");
  assert.throws(() => validateChangeControlProfile(profile({ reviewPolicy: "optional" })), (error) => error.code === "CC-PROFILE");
  assert.throws(() => validateChangeControlProfile(profile({ changeClass: "not-required", mandatory: false, reviewPolicy: "advisory" })), (error) => error.code === "CC-PROFILE");
  assert.doesNotThrow(() => validateChangeControlProfile(profile({ changeClass: "not-required", mandatory: false, reviewPolicy: null })));
});

// C-AC-09: resolving an environment's candidate profiles must always land on
// exactly one of not-required or one effective mandatory profile, never a
// silent pick among several mandatory candidates.
const notRequiredProfile = (overrides = {}) => profile({ profileId: "production-not-required", changeClass: "not-required", mandatory: false, reviewPolicy: null, ...overrides });
const emergencyProfile = (overrides = {}) => profile({ profileId: "production-emergency", changeClass: "emergency", ...overrides });

test("C-AC-09 resolves zero candidate profiles to not-required with no effective profile", () => {
  assert.deepEqual(resolveChangeControlProfile([]), { schema: "pipeline.change-control-resolution.v1", status: "not-required", profile: null });
});

test("C-AC-09 resolves exactly one non-mandatory candidate to not-required with no effective profile", () => {
  assert.deepEqual(resolveChangeControlProfile([notRequiredProfile()]), { schema: "pipeline.change-control-resolution.v1", status: "not-required", profile: null });
});

test("C-AC-09 resolves exactly one mandatory candidate to that single effective profile", () => {
  const result = resolveChangeControlProfile([profile()]);
  assert.equal(result.status, "effective");
  assert.equal(result.profile.profileId, "production-change");
  assert.equal(Object.isFrozen(result), true);
});

test("C-AC-09 rejects two mandatory candidates for the same tuple as ambiguous, with no changeClass tie-break", () => {
  assert.throws(() => resolveChangeControlProfile([profile(), emergencyProfile()]), (error) => error.code === "CC-RESOLVE-AMBIGUOUS");
  // Order does not matter: neither position nor changeClass rescues the pair.
  assert.throws(() => resolveChangeControlProfile([emergencyProfile(), profile()]), (error) => error.code === "CC-RESOLVE-AMBIGUOUS");
});

test("C-AC-09 resolves one mandatory candidate mixed with several non-mandatory candidates to the single mandatory profile", () => {
  const result = resolveChangeControlProfile([notRequiredProfile(), profile(), notRequiredProfile({ profileId: "production-not-required-2" })]);
  assert.equal(result.status, "effective");
  assert.equal(result.profile.profileId, "production-change");
  assert.notEqual(result.status, "not-required");
});

test("C-AC-09 rejects malformed input and candidates that do not share the same environment/candidate/artifact/scopeSha256 tuple", () => {
  assert.throws(() => resolveChangeControlProfile("not-an-array"), (error) => error.code === "CC-RESOLVE");
  assert.throws(() => resolveChangeControlProfile([profile({ profileId: "malformed", note: "provider-fixture" })]), (error) => error.code === "CC-PROFILE");
  assert.throws(() => resolveChangeControlProfile([notRequiredProfile(), notRequiredProfile({ profileId: "production-not-required-2", environment: "staging" })]), (error) => error.code === "CC-RESOLVE-SCOPE");
});

test("C-AC-02 flags class shopping when a not-required classification is chosen over a mandatory alternative for the exact same change", () => {
  const result = detectChangeClassShopping(notRequiredProfile(), [profile()]);
  assert.deepEqual(result, { schema: "pipeline.change-control-class-shopping.v1", flagged: true, reason: "lighter-than-resolved-classification", proposedChangeClass: "not-required", alternativeChangeClasses: ["normal"] });
  assert.equal(Object.isFrozen(result), true);
});

test("C-AC-02 flags class shopping when the same change carries more than one independently mandatory alternative classification", () => {
  const result = detectChangeClassShopping(notRequiredProfile(), [profile(), emergencyProfile()]);
  assert.equal(result.flagged, true);
  assert.equal(result.reason, "ambiguous-mandatory-alternatives");
});

test("C-AC-02 does not flag a mandatory classification with no same-tuple alternative, nor one offered alongside a lighter alternative it did not choose", () => {
  assert.deepEqual(detectChangeClassShopping(profile(), []), { schema: "pipeline.change-control-class-shopping.v1", flagged: false, reason: "no-alternative-classification", proposedChangeClass: "normal", alternativeChangeClasses: [] });
  const withLighterAlternative = detectChangeClassShopping(profile(), [notRequiredProfile()]);
  assert.equal(withLighterAlternative.flagged, false);
  assert.equal(withLighterAlternative.reason, "no-lighter-selection-detected");
});

test("C-AC-02 ignores alternatives for a different tuple and rejects malformed input", () => {
  assert.deepEqual(detectChangeClassShopping(notRequiredProfile(), [profile({ environment: "staging" })]), { schema: "pipeline.change-control-class-shopping.v1", flagged: false, reason: "no-alternative-classification", proposedChangeClass: "not-required", alternativeChangeClasses: [] });
  assert.throws(() => detectChangeClassShopping(profile({ note: "provider-fixture" }), []), (error) => error.code === "CC-PROFILE");
  assert.throws(() => detectChangeClassShopping(profile(), "not-an-array"), (error) => error.code === "CC-SHOPPING");
  assert.throws(() => detectChangeClassShopping(profile(), [profile({ note: "provider-fixture" })]), (error) => error.code === "CC-PROFILE");
});

// H-AC-12: pipelineAuthority.decisionReference is an entirely OPTIONAL 7th key. Its
// absence must leave every existing boolean-only assertion above byte-for-byte
// unaffected -- this test only ADDS new assertions, no existing test above is touched.
test("H-AC-12 pipelineAuthority.decisionReference absent leaves boolean-only behavior unchanged", () => {
  assert.deepEqual(Object.keys(local()).sort(), ["artifact", "candidate", "emergencyAuthorized", "environment", "granted", "scopeSha256"]);
  assert.deepEqual(evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local(), externalReceipt: receipt(), nowEpochMs: 15 }), { schema: "pipeline.change-control-gate.v1", status: "allowed", reason: "composed-authority" });
});

test("H-AC-12 dual-evaluates an OPTIONAL decisionReference against pipelineAuthority.granted, agreement allows", () => {
  const authority = local({ decisionReference: { reference: decisionReferenceFixture, resolved: true } });
  assert.deepEqual(evaluateChangeControlGate({ profile: profile(), pipelineAuthority: authority, externalReceipt: receipt(), nowEpochMs: 15 }), { schema: "pipeline.change-control-gate.v1", status: "allowed", reason: "composed-authority" });
});

test("H-AC-12 a decisionReference that disagrees with pipelineAuthority.granted fails closed with a distinct reason", () => {
  const authority = local({ decisionReference: { reference: decisionReferenceFixture, resolved: false } });
  const result = evaluateChangeControlGate({ profile: profile(), pipelineAuthority: authority, externalReceipt: receipt(), nowEpochMs: 15 });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "decision-reference-disagreement");
  assert.notEqual(result.reason, "pipeline-authority");
});

// Unlike guard-devplan.mjs's own raw-State reader (which must fail closed on malformed
// STATE data rather than crash), change-control.mjs's established convention is that
// every caller-supplied input is already validated upstream -- exactly like a malformed
// `externalReceipt` already throws CC-RECEIPT rather than silently reading as "blocked".
// A malformed `reference` is consistently rejected the same way, at the pipelineAuthority
// shape boundary, before dual-evaluation is ever reached.
test("H-AC-12 a malformed decisionReference.reference is rejected at the input boundary (CC-GATE), consistent with every other malformed input here", () => {
  const malformed = { reference: { ...decisionReferenceFixture, decisionDigest: "not-hex" }, resolved: true };
  assert.throws(() => evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local({ decisionReference: malformed }), externalReceipt: receipt(), nowEpochMs: 15 }), (error) => error.code === "CC-GATE");
});

test("H-AC-12 decisionReference must be a closed { reference, resolved } shape, or CC-GATE rejects it", () => {
  assert.throws(() => evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local({ decisionReference: null }), externalReceipt: receipt(), nowEpochMs: 15 }), (error) => error.code === "CC-GATE");
  assert.throws(() => evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local({ decisionReference: { reference: decisionReferenceFixture, resolved: "yes" } }), externalReceipt: receipt(), nowEpochMs: 15 }), (error) => error.code === "CC-GATE");
  assert.throws(() => evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local({ decisionReference: { reference: decisionReferenceFixture, resolved: true, extra: "x" } }), externalReceipt: receipt(), nowEpochMs: 15 }), (error) => error.code === "CC-GATE");
});

test("H-AC-12 decisionReference dual-evaluation still requires pipeline-authority to bind the exact tuple first", () => {
  const authority = local({ granted: false, decisionReference: { reference: decisionReferenceFixture, resolved: true } });
  const result = evaluateChangeControlGate({ profile: profile(), pipelineAuthority: authority, externalReceipt: receipt(), nowEpochMs: 15 });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "pipeline-authority");
});
