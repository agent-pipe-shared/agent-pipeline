// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { recordCommandOffer, recordPipelineAttempt, recordCommandOutcome, acknowledgeNonMaterialOfferWithoutJournal, acknowledgeOfferUnderJournalingGap, recordCommandRecoveryDisposition, recordCommandRecoveryOccurrence, recordCommandUserAcknowledgement, recordPrivateHandoffCommitment, projectCommandOfferReplay } from "./external-command-offer.mjs";

const SHA = (character) => character.repeat(64);
function event(overrides = {}) { return { eventId: "offer-1", kind: "command-offer", state: "offered", reasonCode: "EXTERNAL_OPERATION_OFFERED", candidateDigest: SHA("a"), relatedHumanDecisionId: null, supersedesEventId: null, offerOrigin: "pipeline-initiated", operation: { operationClass: "governed-repair", version: "v1", governedArtifactSha256: SHA("b") }, target: { repositoryFingerprint: SHA("c"), scopeDigest: SHA("d") }, sideEffectClass: "non-authoritative", authorityRequirement: "not-required", policyDigest: SHA("e"), redactionPolicyDigest: SHA("f"), executionAssurance: "not-applicable", omissions: ["raw-command", "arguments", "private-coordinates", "unrestricted-output"], offerEventId: null, preEvidenceDigest: null, postEvidenceDigest: null, recoverability: "not-applicable", ...overrides }; }
function append(value) { return Promise.resolve({ eventId: value.eventId, candidateDigest: value.candidateDigest, integrity: "verified" }); }
function follow(state, overrides = {}) { return event({ eventId: `${state}-2`, state, offerEventId: "offer-1", executionAssurance: state, ...overrides }); }

test("records a public-safe offer before presentation and requires verified append readback", async () => {
  let seen = null;
  const receipt = await recordCommandOffer({ offer: event(), append: async (value) => { seen = value; return append(value); } });
  assert.equal(receipt.status, "offered");
  assert.equal(seen.command, undefined);
  await assert.rejects(recordCommandOffer({ offer: event(), append: async () => ({ eventId: "offer-1", candidateDigest: SHA("a"), integrity: "unknown" }) }), (error) => error.code === "ECO-READBACK");
});

test("requires a bound human decision for destructive pipeline attempts and appends before execution", async () => {
  const offerEvent = event({ relatedHumanDecisionId: "decision-1", sideEffectClass: "guard-bypass", authorityRequirement: "human-decision-required" });
  const attempt = follow("attempted", { relatedHumanDecisionId: "decision-1", sideEffectClass: "guard-bypass", authorityRequirement: "human-decision-required" });
  await assert.rejects(recordPipelineAttempt({ offer: offerEvent, attempt, append }), (error) => error.code === "ECO-AUTHORITY");
  const receipt = await recordPipelineAttempt({ offer: offerEvent, attempt, append, resolveHumanAuthority: async () => ({ granted: true, decisionId: "decision-1", candidateDigest: SHA("a") }) });
  assert.equal(receipt.status, "attempted");
});

test("keeps user execution unobserved and admits completion only with bounded evidence", async () => {
  const userOffer = event({ offerOrigin: "user-requested-pipeline-supplied" });
  const unobserved = follow("execution-unobserved", { offerOrigin: "user-requested-pipeline-supplied" });
  assert.equal((await recordCommandOutcome({ offer: userOffer, outcome: unobserved, append })).status, "execution-unobserved");
  const completed = follow("observed-completed", { postEvidenceDigest: SHA("9") });
  await assert.rejects(recordCommandOutcome({ offer: event(), outcome: completed, append }), (error) => error.code === "ECO-OUTCOME-EVIDENCE");
  assert.equal((await recordCommandOutcome({ offer: event(), outcome: completed, append, verifyOutcome: async () => ({ state: "observed-completed", postEvidenceDigest: SHA("9") }) })).status, "observed-completed");
});

test("retains failed, partial, cancelled, mismatch and unknown outcomes distinctly", async () => {
  for (const state of ["failed", "partial", "cancelled", "readback-mismatch", "unknown", "unavailable"]) assert.equal((await recordCommandOutcome({ offer: event(), outcome: follow(state), append })).status, state);
});

test("rejects offer substitution across candidate, repository, and scope", async () => {
  const substituted = follow("failed", { candidateDigest: SHA("0") });
  await assert.rejects(recordCommandOutcome({ offer: event(), outcome: substituted, append }), (error) => error.code === "ECO-OUTCOME");
});

test("R-AC-02: a considered recovery (recovery-proposed/recovered) has no correlation path — both states remain unreachable through the outcome recorder", async () => {
  const proposed = follow("recovery-proposed", { executionAssurance: "not-applicable" });
  await assert.rejects(recordCommandOutcome({ offer: event(), outcome: proposed, append }), (error) => error.code === "ECO-OUTCOME");
  const recovered = follow("recovered", { executionAssurance: "not-applicable" });
  await assert.rejects(recordCommandOutcome({ offer: event(), outcome: recovered, append }), (error) => error.code === "ECO-OUTCOME");
});

test("R-AC-02: recordCommandRecoveryDisposition correlates a considered recovery-proposed alternative to the existing offer, carrying its typed rejection reason", async () => {
  const proposed = follow("recovery-proposed", { eventId: "recovery-proposed-1", executionAssurance: "not-applicable", reasonCode: "SANCTIONED_PATH_REJECTED_POLICY_DENIED", candidateDigest: SHA("1") });
  const receipt = await recordCommandRecoveryDisposition({ anchor: event(), recovery: proposed, append });
  assert.equal(receipt.status, "recovery-proposed");
  assert.equal(receipt.offerEventId, "offer-1");
  assert.equal(receipt.candidateDigest, SHA("1"));
});

test("R-AC-02: recordCommandRecoveryDisposition correlates a recovered selection, chained via supersedesEventId to the chosen recovery-proposed alternative, to the existing offer", async () => {
  const proposed = follow("recovery-proposed", { eventId: "recovery-proposed-2", executionAssurance: "not-applicable", reasonCode: "SANCTIONED_PATH_REJECTED_EVIDENCE_GAP", candidateDigest: SHA("2") });
  const proposedReceipt = await recordCommandRecoveryDisposition({ anchor: event(), recovery: proposed, append });
  assert.equal(proposedReceipt.status, "recovery-proposed");
  const recovered = follow("recovered", { eventId: "recovered-1", executionAssurance: "not-applicable", reasonCode: "SANCTIONED_PATH_REJECTED_EVIDENCE_GAP", candidateDigest: SHA("2"), supersedesEventId: proposedReceipt.eventId });
  const receipt = await recordCommandRecoveryDisposition({ anchor: event(), recovery: recovered, append });
  assert.equal(receipt.status, "recovered");
  assert.equal(receipt.offerEventId, "offer-1");
  assert.equal(recovered.supersedesEventId, proposedReceipt.eventId);
});

test("R-AC-02: recordCommandRecoveryDisposition fails closed on an undocumented evidence gap, cross-scope substitution, and a mismatched anchor state", async () => {
  const withEvidence = follow("recovery-proposed", { executionAssurance: "not-applicable", preEvidenceDigest: SHA("3") });
  await assert.rejects(recordCommandRecoveryDisposition({ anchor: event(), recovery: withEvidence, append }), (error) => error.code === "ECO-RECOVERY-EVIDENCE-GAP");
  const crossScope = follow("recovery-proposed", { executionAssurance: "not-applicable", target: { repositoryFingerprint: SHA("c"), scopeDigest: SHA("0") } });
  await assert.rejects(recordCommandRecoveryDisposition({ anchor: event(), recovery: crossScope, append }), (error) => error.code === "ECO-RECOVERY-LINK");
  const attemptedAnchor = follow("attempted");
  const proposed = follow("recovery-proposed", { executionAssurance: "not-applicable" });
  await assert.rejects(recordCommandRecoveryDisposition({ anchor: attemptedAnchor, recovery: proposed, append }), (error) => error.code === "ECO-RECOVERY-ANCHOR");
});

test("R-AC-04: binds operation class, target, exact pre/post evidence digests, and recoverability together on a state-mutating outcome; rejects malformed digests or an unrecognized recoverability value", async () => {
  const mutated = follow("cancelled", { preEvidenceDigest: SHA("1"), postEvidenceDigest: SHA("2"), recoverability: "rollback-required" });
  const receipt = await recordCommandOutcome({ offer: event(), outcome: mutated, append });
  assert.equal(receipt.status, "cancelled");
  const badDigest = follow("cancelled", { preEvidenceDigest: "not-a-digest", postEvidenceDigest: SHA("2"), recoverability: "rollback-required" });
  await assert.rejects(recordCommandOutcome({ offer: event(), outcome: badDigest, append }), (error) => error.code === "ADJ-COMMAND-OFFER");
  const badRecoverability = follow("cancelled", { preEvidenceDigest: SHA("1"), postEvidenceDigest: SHA("2"), recoverability: "irreversible" });
  await assert.rejects(recordCommandOutcome({ offer: event(), outcome: badRecoverability, append }), (error) => error.code === "ADJ-COMMAND-OFFER");
});

test("R-AC-04: requiredCleanup records what cleanup/readback is required, distinct from recoverability's own category, through recordCommandOutcome", async () => {
  const withCleanup = follow("cancelled", { preEvidenceDigest: SHA("1"), postEvidenceDigest: SHA("2"), recoverability: "rollback-required", requiredCleanup: { cleanupClass: "manual-file-restore", status: "pending", digest: SHA("8") } });
  const receipt = await recordCommandOutcome({ offer: event(), outcome: withCleanup, append });
  assert.equal(receipt.status, "cancelled");
  const malformedCleanup = follow("cancelled", { preEvidenceDigest: SHA("1"), postEvidenceDigest: SHA("2"), recoverability: "rollback-required", requiredCleanup: { cleanupClass: "manual-file-restore", status: "not-a-status", digest: null } });
  await assert.rejects(recordCommandOutcome({ offer: event(), outcome: malformedCleanup, append }), (error) => error.code === "ADJ-COMMAND-OFFER");
});

test("R-AC-08: a readback lifecycle event appends exactly once and never re-appends or mutates the original offer", async () => {
  const calls = [];
  const spy = async (value) => { calls.push(value); return append(value); };
  const originalOffer = event();
  const snapshot = JSON.parse(JSON.stringify(originalOffer));
  const readback = follow("readback-verified", { postEvidenceDigest: SHA("7") });
  const receipt = await recordCommandOutcome({ offer: originalOffer, outcome: readback, append: spy, verifyOutcome: async () => ({ state: "readback-verified", postEvidenceDigest: SHA("7") }) });
  assert.equal(receipt.status, "readback-verified");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].eventId, readback.eventId);
  assert.deepEqual(originalOffer, snapshot);
});

test("R-AC-09: a missing required offer link is never rendered successful", async () => {
  const missingLink = follow("failed", { offerEventId: null });
  await assert.rejects(recordCommandOutcome({ offer: event(), outcome: missingLink, append }), (error) => error.code === "ADJ-COMMAND-LINK");
});

test("R-AC-09: contradictory independent outcome evidence is never rendered successful", async () => {
  const completed = follow("observed-completed", { postEvidenceDigest: SHA("9") });
  await assert.rejects(recordCommandOutcome({ offer: event(), outcome: completed, append, verifyOutcome: async () => ({ state: "observed-completed", postEvidenceDigest: SHA("0") }) }), (error) => error.code === "ECO-OUTCOME-EVIDENCE");
});

test("R-AC-09: cross-repository and cross-scope substitution are rejected, not only candidate-digest substitution", async () => {
  const crossRepo = follow("failed", { target: { repositoryFingerprint: SHA("0"), scopeDigest: SHA("d") } });
  await assert.rejects(recordCommandOutcome({ offer: event(), outcome: crossRepo, append }), (error) => error.code === "ECO-OUTCOME");
  const crossScope = follow("failed", { target: { repositoryFingerprint: SHA("c"), scopeDigest: SHA("0") } });
  await assert.rejects(recordCommandOutcome({ offer: event(), outcome: crossScope, append }), (error) => error.code === "ECO-OUTCOME");
});

test("R-AC-09: a well-formed occurrence timestamp flows through recordCommandOffer end-to-end, and a malformed one is rejected before append", async () => {
  const withTimestamp = event({ occurredAtEpochMs: 1754000000000 });
  let seen = null;
  const receipt = await recordCommandOffer({ offer: withTimestamp, append: async (value) => { seen = value; return append(value); } });
  assert.equal(receipt.status, "offered");
  assert.equal(seen.occurredAtEpochMs, 1754000000000);
  const malformed = event({ occurredAtEpochMs: -1 });
  await assert.rejects(recordCommandOffer({ offer: malformed, append }), (error) => error.code === "ADJ-COMMAND-OFFER");
});

test("R-AC-09: an outcome's occurrence timestamp is never compared against the offer's -- a later, different value on the outcome is not treated as substitution", async () => {
  const offerWithTimestamp = event({ occurredAtEpochMs: 1754000000000 });
  const laterOutcome = follow("failed", { occurredAtEpochMs: 1754000005000 });
  const receipt = await recordCommandOutcome({ offer: offerWithTimestamp, outcome: laterOutcome, append });
  assert.equal(receipt.status, "failed");
});

test("R-AC-11: a public-safe typed omission is mandatory — dropping one of the four required labels is rejected; an extra sanctioned label (e.g. credential) is admitted", async () => {
  const incomplete = event({ omissions: ["raw-command", "arguments", "unrestricted-output"] });
  await assert.rejects(recordCommandOffer({ offer: incomplete, append }), (error) => error.code === "ADJ-COMMAND-OFFER");
  const withCredentialOmission = event({ omissions: ["raw-command", "arguments", "private-coordinates", "unrestricted-output", "credential"] });
  assert.equal((await recordCommandOffer({ offer: withCredentialOmission, append })).status, "offered");
});

test("R-AC-13: an offer carrying any raw command, argument, or secret-bearing field — benign or malicious content alike — is structurally rejected, never admitted", async () => {
  const withCommand = { ...event(), command: "rm -rf /" };
  await assert.rejects(recordCommandOffer({ offer: withCommand, append }), (error) => error.code === "ADJ-COMMAND-OFFER");
  const withArgs = { ...event(), rawArguments: ["--force"] };
  await assert.rejects(recordCommandOffer({ offer: withArgs, append }), (error) => error.code === "ADJ-COMMAND-OFFER");
});

test("R-AC-13: an independently public-safe governed script identity round-trips as a digest and is rejected when malformed, never as script content", async () => {
  const governed = event({ operation: { operationClass: "governed-repair", version: "v2", governedArtifactSha256: SHA("7") } });
  assert.equal((await recordCommandOffer({ offer: governed, append })).status, "offered");
  const malformedIdentity = event({ operation: { operationClass: "governed-repair", version: "v2", governedArtifactSha256: "not-a-sha" } });
  await assert.rejects(recordCommandOffer({ offer: malformedIdentity, append }), (error) => error.code === "ADJ-COMMAND-OFFER");
});

test("R-AC-13: approval-without-run states (acknowledged, authorized, copied) remain unreachable through the outcome recorder", async () => {
  for (const state of ["acknowledged", "authorized", "copied"]) {
    const outcome = follow(state, { executionAssurance: "not-applicable" });
    await assert.rejects(recordCommandOutcome({ offer: event(), outcome, append }), (error) => error.code === "ECO-OUTCOME");
  }
});

test("R-AC-13: duplicate/retry — recording the same outcome eventId twice is not detected or prevented at this layer (idempotency is delegated entirely to the append() callback)", async () => {
  const outcome = follow("failed");
  const first = await recordCommandOutcome({ offer: event(), outcome, append });
  const second = await recordCommandOutcome({ offer: event(), outcome, append });
  assert.equal(first.eventId, second.eventId);
  assert.equal(first.status, "failed");
  assert.equal(second.status, "failed");
});

test("R-AC-09: a duplicated lifecycle record is rendered invalid on replay, never successful, and is refused before append once the journal is supplied", async () => {
  const outcome = follow("failed");
  const journaled = [event(), outcome];
  const duplicated = projectCommandOfferReplay({ journaled: [...journaled, outcome] });
  assert.equal(duplicated.integrity, "invalid");
  assert.equal(duplicated.status, "duplicated");
  assert.equal(duplicated.reasonCode, "DUPLICATE_LIFECYCLE_EVENT_ID");
  assert.equal(projectCommandOfferReplay({ journaled }).integrity, "valid");
  let appended = 0;
  await assert.rejects(recordCommandOutcome({ offer: event(), outcome, journaled, append: async (value) => { appended += 1; return append(value); } }), (error) => error.code === "ECO-DUPLICATE" && error.replay.integrity === "invalid");
  assert.equal(appended, 0);
});

test("R-AC-09: two unlinked evidences for one offer are duplicated; an explicitly superseding re-record and a distinct later state are not", async () => {
  const offered = event();
  const first = follow("failed", { eventId: "failed-1" });
  const second = follow("failed", { eventId: "failed-3" });
  assert.equal(projectCommandOfferReplay({ journaled: [offered, first, second] }).reasonCode, "DUPLICATE_OFFER_EVIDENCE");
  const superseding = follow("failed", { eventId: "failed-3", supersedesEventId: "failed-1" });
  assert.equal(projectCommandOfferReplay({ journaled: [offered, first, superseding] }).integrity, "valid");
  const laterState = follow("readback-verified", { eventId: "readback-1", postEvidenceDigest: SHA("9") });
  assert.equal(projectCommandOfferReplay({ journaled: [offered, follow("execution-unobserved"), laterState] }).integrity, "valid");
  await assert.rejects(recordCommandOutcome({ offer: offered, outcome: second, append, journaled: [offered, first] }), (error) => error.code === "ECO-DUPLICATE" && error.replay.reasonCode === "DUPLICATE_OFFER_EVIDENCE");
});

test("R-AC-12: the motivating Phoenix bootstrap trajectory fixture — rejected guard path, attended local repair, unchanged public-privacy boundary, successful readback, no remote write and no machine-specific value", async () => {
  const guardOffer = event({ eventId: "trajectory-guard-1", relatedHumanDecisionId: "trajectory-guard-decision-1", sideEffectClass: "guard-bypass", authorityRequirement: "human-decision-required" });
  const guardAttempt = follow("attempted", { eventId: "trajectory-guard-1-attempt", offerEventId: "trajectory-guard-1", relatedHumanDecisionId: "trajectory-guard-decision-1", sideEffectClass: "guard-bypass", authorityRequirement: "human-decision-required" });
  await assert.rejects(recordPipelineAttempt({ offer: guardOffer, attempt: guardAttempt, append }), (error) => error.code === "ECO-AUTHORITY");

  let seen = null;
  const repairOffer = event({ eventId: "trajectory-repair-1", sideEffectClass: "non-authoritative", authorityRequirement: "not-required" });
  const repairReceipt = await recordCommandOffer({ offer: repairOffer, append: async (value) => { seen = value; return append(value); } });
  assert.equal(repairReceipt.status, "offered");
  assert.equal(seen.command, undefined);
  assert.equal(seen.rawArguments, undefined);

  const readback = follow("readback-verified", { eventId: "trajectory-repair-1-readback", offerEventId: "trajectory-repair-1", postEvidenceDigest: SHA("7") });
  const readbackReceipt = await recordCommandOutcome({ offer: repairOffer, outcome: readback, append, verifyOutcome: async () => ({ state: "readback-verified", postEvidenceDigest: SHA("7") }) });
  assert.equal(readbackReceipt.status, "readback-verified");

  assert.match(repairOffer.target.repositoryFingerprint, /^[0-9a-f]{64}$/);
  assert.match(repairOffer.target.scopeDigest, /^[0-9a-f]{64}$/);
});

test("R-AC-10: journaling unavailable still fails closed by default for recordCommandOffer/recordPipelineAttempt, unaffected by the new non-material exception path", async () => {
  await assert.rejects(recordCommandOffer({ offer: event() }), (error) => error.code === "ECO-APPEND");
  await assert.rejects(recordCommandOffer({ offer: event({ sideEffectClass: "destructive" }) }), (error) => error.code === "ECO-APPEND");
  const offerEvent = event({ relatedHumanDecisionId: "decision-1", sideEffectClass: "guard-bypass", authorityRequirement: "human-decision-required" });
  const attempt = follow("attempted", { relatedHumanDecisionId: "decision-1", sideEffectClass: "guard-bypass", authorityRequirement: "human-decision-required" });
  await assert.rejects(recordPipelineAttempt({ offer: offerEvent, attempt, resolveHumanAuthority: async () => ({ granted: true, decisionId: "decision-1", candidateDigest: SHA("a") }) }), (error) => error.code === "ECO-APPEND");
});

test("R-AC-10: a typed non-material exception is admitted for a non-authoritative, not-required offer when journaling is unavailable, and never claims execution", () => {
  const nonMaterial = event({ sideEffectClass: "non-authoritative", authorityRequirement: "not-required" });
  const exceptionReceipt = acknowledgeNonMaterialOfferWithoutJournal({ offer: nonMaterial });
  assert.equal(exceptionReceipt.eventId, "offer-1");
  assert.equal(exceptionReceipt.candidateDigest, SHA("a"));
  assert.equal(exceptionReceipt.journaled, false);
  assert.equal(exceptionReceipt.status, "unjournaled-non-material-exception");
});

test("R-AC-10: the non-material exception is rejected for destructive, guard-bypass, and authority-changing offers -- it never becomes a general journaling bypass", () => {
  for (const sideEffectClass of ["destructive", "guard-bypass", "authority-changing"]) {
    assert.throws(() => acknowledgeNonMaterialOfferWithoutJournal({ offer: event({ sideEffectClass }) }), (error) => error.code === "ECO-JOURNAL-EXCEPTION-SCOPE");
  }
});

test("R-AC-10: the non-material exception is rejected when authorityRequirement is human-decision-required, even for an otherwise non-authoritative offer", () => {
  const policyRequired = event({ authorityRequirement: "human-decision-required", relatedHumanDecisionId: "decision-1" });
  assert.throws(() => acknowledgeNonMaterialOfferWithoutJournal({ offer: policyRequired }), (error) => error.code === "ECO-JOURNAL-EXCEPTION-SCOPE");
});

test("R-AC-10: the non-material exception refuses to run when an append function is actually supplied -- it is not a shortcut around working journaling", () => {
  assert.throws(() => acknowledgeNonMaterialOfferWithoutJournal({ offer: event(), append }), (error) => error.code === "ECO-JOURNAL-EXCEPTION-SCOPE");
});

test("R-AC-10: the non-material exception is scoped to the offered state, not attempted or any outcome state", () => {
  assert.throws(() => acknowledgeNonMaterialOfferWithoutJournal({ offer: follow("attempted") }), (error) => error.code === "ECO-OFFER-STATE");
});

test("R-AC-11: recordPrivateHandoffCommitment stores a private-only handoff detail via a caller-supplied restricted-store put and returns a public-safe commitment digest, never the detail itself", async () => {
  let seen = null;
  const put = async (value) => { seen = value; return { commitmentReceiptId: "restricted-record-1", commitment: value.commitment }; };
  const result = await recordPrivateHandoffCommitment({ detail: "actual local-repair command text", put });
  assert.equal(result.commitment, createHash("sha256").update("actual local-repair command text", "utf8").digest("hex"));
  assert.equal(result.commitmentReceiptId, "restricted-record-1");
  assert.equal(Object.hasOwn(result, "detail"), false);
  assert.equal(seen.detail, "actual local-repair command text");
  assert.equal(Object.isFrozen(result), true);
});

test("R-AC-11: recordPrivateHandoffCommitment rejects a readback that reports a different commitment than what was computed", async () => {
  await assert.rejects(recordPrivateHandoffCommitment({ detail: "local-repair", put: async () => ({ commitmentReceiptId: "restricted-record-1", commitment: SHA("0") }) }), (error) => error.code === "ECO-COMMITMENT-READBACK");
});

test("R-AC-11: recordPrivateHandoffCommitment rejects a malformed put readback shape", async () => {
  await assert.rejects(recordPrivateHandoffCommitment({ detail: "local-repair", put: async (value) => ({ commitment: value.commitment }) }), (error) => error.code === "ECO-COMMITMENT-READBACK");
  await assert.rejects(recordPrivateHandoffCommitment({ detail: "local-repair", put: async (value) => ({ commitmentReceiptId: "", commitment: value.commitment }) }), (error) => error.code === "ECO-COMMITMENT-READBACK");
});

test("R-AC-11: recordPrivateHandoffCommitment fails closed when the private detail or the put callback is missing", async () => {
  await assert.rejects(recordPrivateHandoffCommitment({ put: async (value) => ({ commitmentReceiptId: "r-1", commitment: value.commitment }) }), (error) => error.code === "ECO-COMMITMENT-DETAIL");
  await assert.rejects(recordPrivateHandoffCommitment({ detail: "" , put: async (value) => ({ commitmentReceiptId: "r-1", commitment: value.commitment }) }), (error) => error.code === "ECO-COMMITMENT-DETAIL");
  await assert.rejects(recordPrivateHandoffCommitment({ detail: "local-repair" }), (error) => error.code === "ECO-COMMITMENT-PUT");
});

test("R-AC-11: end-to-end -- a stored private handoff detail's commitment flows into a public command-offer event and appends", async () => {
  const put = async (value) => ({ commitmentReceiptId: "restricted-record-42", commitment: value.commitment });
  const { commitment, commitmentReceiptId } = await recordPrivateHandoffCommitment({ detail: "the actual local-repair command text", put });
  const offerWithCommitment = event({ commitment, commitmentReceiptId });
  let seen = null;
  const receipt = await recordCommandOffer({ offer: offerWithCommitment, append: async (value) => { seen = value; return append(value); } });
  assert.equal(receipt.status, "offered");
  assert.equal(seen.commitment, commitment);
  assert.equal(seen.commitmentReceiptId, "restricted-record-42");
  assert.equal(seen.detail, undefined);
});

test("R-AC-11: a command-offer event carrying only one half of the commitment pair is rejected before append", async () => {
  await assert.rejects(recordCommandOffer({ offer: event({ commitment: SHA("7") }), append }), (error) => error.code === "ADJ-COMMAND-COMMITMENT-PAIRING");
  await assert.rejects(recordCommandOffer({ offer: event({ commitmentReceiptId: "restricted-record-1" }), append }), (error) => error.code === "ADJ-COMMAND-COMMITMENT-PAIRING");
});

test("R-AC-10: the exception receipt is structurally distinct from every journaled command state/appendValidated() receipt status, and cannot be reused as an offer/outcome event to claim completion", async () => {
  const nonMaterial = event({ sideEffectClass: "non-authoritative", authorityRequirement: "not-required" });
  const exceptionReceipt = acknowledgeNonMaterialOfferWithoutJournal({ offer: nonMaterial });
  assert.notEqual(exceptionReceipt.schema, "pipeline.external-command-offer-receipt.v1");
  for (const state of ["offered", "acknowledged", "authorized", "copied", "attempted", "execution-unobserved", "observed-completed", "readback-verified", "failed", "partial", "cancelled", "unknown", "unavailable", "readback-mismatch", "recovery-proposed", "recovered"]) {
    assert.notEqual(exceptionReceipt.status, state);
  }
  await assert.rejects(recordCommandOutcome({ offer: event(), outcome: exceptionReceipt, append }), (error) => error.code === "ADJ-COMMAND-OFFER");
  await assert.rejects(recordCommandOffer({ offer: exceptionReceipt, append }), (error) => error.code === "ADJ-COMMAND-OFFER");
});

test("A-AC-10: journaling unavailable applies the represented event class's declared policy and exposes the gap in both directions", () => {
  const gap = acknowledgeOfferUnderJournalingGap({ offer: event() });
  assert.equal(gap.schema, "pipeline.agent-journaling-gap.v1");
  assert.equal(gap.gap, "agent-journaling-unavailable");
  assert.equal(gap.disposition, "fail-open");
  assert.equal(gap.journaled, false);
  assert.deepEqual([...gap.decidingEventClasses], []);
  assert.equal(gap.eventId, "offer-1");
  assert.equal(gap.candidateDigest, SHA("a"));
  for (const [overrides, deciding] of [
    [{ sideEffectClass: "destructive" }, ["security"]],
    [{ relatedHumanDecisionId: "decision-1" }, ["authority"]],
    [{ recoverability: "cleanup-required" }, ["recovery"]],
    [{ sideEffectClass: "guard-bypass", authorityRequirement: "human-decision-required", relatedHumanDecisionId: "decision-1" }, ["authority", "security"]],
  ]) {
    assert.throws(() => acknowledgeOfferUnderJournalingGap({ offer: event(overrides) }), (error) => {
      assert.equal(error.code, "ECO-JOURNALING-FAIL-CLOSED");
      assert.equal(error.gap.schema, "pipeline.agent-journaling-gap.v1");
      assert.equal(error.gap.disposition, "fail-closed");
      assert.equal(error.gap.journaled, false);
      assert.deepEqual([...error.gap.decidingEventClasses], deciding);
      return true;
    });
  }
});

// The safety invariant that lets A-AC-10's general table coexist with
// R-AC-10's narrow exception: the table can only ever be stricter, so its
// arrival grants no permission the already-tested exception did not.
test("A-AC-10: the general policy path is strictly stricter than R-AC-10's non-material exception, never looser", () => {
  const admits = (fn, offer) => { try { fn({ offer }); return true; } catch { return false; } };
  let stricterWitnesses = 0;
  for (const sideEffectClass of ["non-authoritative", "destructive", "guard-bypass", "authority-changing"]) {
    for (const recoverability of ["not-applicable", "recoverable", "cleanup-required", "rollback-required"]) {
      for (const relatedHumanDecisionId of [null, "decision-1"]) {
        const candidate = event({ sideEffectClass, recoverability, relatedHumanDecisionId });
        const general = admits(acknowledgeOfferUnderJournalingGap, candidate);
        const exception = admits(acknowledgeNonMaterialOfferWithoutJournal, candidate);
        if (general) assert.equal(exception, true, `${sideEffectClass}/${recoverability}/${relatedHumanDecisionId}`);
        if (exception && !general) stricterWitnesses += 1;
      }
    }
  }
  assert.equal(stricterWitnesses > 0, true);
});

test("A-AC-10: the journaling-gap path is scoped to a genuinely unavailable journal and the offered state, and its record is never a journal receipt", async () => {
  assert.throws(() => acknowledgeOfferUnderJournalingGap({ offer: event(), append }), (error) => error.code === "ECO-JOURNAL-EXCEPTION-SCOPE");
  assert.throws(() => acknowledgeOfferUnderJournalingGap({ offer: follow("attempted") }), (error) => error.code === "ECO-OFFER-STATE");
  assert.throws(() => acknowledgeOfferUnderJournalingGap({ offer: { ...event(), command: "rm -rf" } }), (error) => error.code === "ADJ-COMMAND-OFFER");
  const gap = acknowledgeOfferUnderJournalingGap({ offer: event() });
  assert.notEqual(gap.schema, "pipeline.external-command-offer-receipt.v1");
  await assert.rejects(recordCommandOffer({ offer: gap, append }), (error) => error.code === "ADJ-COMMAND-OFFER");
  await assert.rejects(recordCommandOutcome({ offer: event(), outcome: gap, append }), (error) => error.code === "ADJ-COMMAND-OFFER");
});

// R-AC-08's rollback/cleanup half: an OCCURRED undo, as its own appended
// lifecycle event. The prospective values these must never be confused with
// are `recoverability`'s closed category; the assertions below pin that
// separation directly rather than trusting the naming.
const PROSPECTIVE_RECOVERABILITY = ["not-applicable", "recoverable", "cleanup-required", "rollback-required"];
const REQUIREMENT_OF = { "rollback-performed": "rollback-required", "cleanup-performed": "cleanup-required" };
function occurred(state, anchorEventId, overrides = {}) {
  return event({ eventId: `${state}-1`, state, reasonCode: state === "rollback-performed" ? "RECOVERY_ROLLBACK_PERFORMED" : "RECOVERY_CLEANUP_PERFORMED", offerEventId: anchorEventId, executionAssurance: "not-applicable", recoverability: REQUIREMENT_OF[state], postEvidenceDigest: SHA("5"), ...overrides });
}

test("R-AC-08: an occurred rollback and an occurred cleanup are each appended exactly once as their own lifecycle event, distinct from every prospective recoverability value, and rewrite neither the original offer, the proposal, nor the authorization", async () => {
  for (const state of ["rollback-performed", "cleanup-performed"]) {
    const recoverability = REQUIREMENT_OF[state];
    const authorizedOffer = event({ relatedHumanDecisionId: "decision-1", authorityRequirement: "human-decision-required", recoverability });
    const proposal = follow("recovery-proposed", { eventId: "recovery-proposed-9", executionAssurance: "not-applicable", relatedHumanDecisionId: "decision-1", authorityRequirement: "human-decision-required", recoverability });
    const mutating = follow("failed", { eventId: "failed-9", relatedHumanDecisionId: "decision-1", authorityRequirement: "human-decision-required", recoverability, postEvidenceDigest: SHA("4") });
    await recordCommandRecoveryDisposition({ anchor: authorizedOffer, recovery: proposal, append });
    await recordCommandOutcome({ offer: authorizedOffer, outcome: mutating, append });

    // Byte witnesses over the three records R-AC-08 forbids rewriting.
    const witness = [authorizedOffer, proposal, mutating].map((record) => JSON.stringify(record));
    const occurrence = occurred(state, mutating.eventId, { relatedHumanDecisionId: "decision-1", authorityRequirement: "human-decision-required" });
    const calls = [];
    const receipt = await recordCommandRecoveryOccurrence({ anchor: mutating, occurrence, append: async (value) => { calls.push(value); return append(value); } });
    assert.equal(receipt.status, state, `${state} must be recorded as its own occurred state`);
    assert.equal(receipt.offerEventId, mutating.eventId, "the occurred undo must stay linked to the record that declared the requirement");
    assert.equal(calls.length, 1, `${state} must append exactly once`);
    assert.equal(calls[0].eventId, occurrence.eventId);
    assert.deepEqual([authorizedOffer, proposal, mutating].map((record) => JSON.stringify(record)), witness, "an occurred undo must never rewrite the offer, proposal, or authorization it recovers from");
    assert.equal(mutating.recoverability, recoverability, "the prospective requirement must survive its discharge unchanged");
    assert.equal(PROSPECTIVE_RECOVERABILITY.includes(receipt.status), false, "the occurred fact must not be any prospective recoverability value");

    // Append-once at the journal the events actually live in: a second
    // recording of the same occurrence is refused before append.
    let appended = 0;
    await assert.rejects(recordCommandRecoveryOccurrence({ anchor: mutating, occurrence, journaled: [authorizedOffer, proposal, mutating, occurrence], append: async (value) => { appended += 1; return append(value); } }), (error) => error.code === "ECO-DUPLICATE" && error.replay.reasonCode === "DUPLICATE_LIFECYCLE_EVENT_ID");
    assert.equal(appended, 0);
  }
});

test("R-AC-08: an occurred rollback/cleanup refuses every illegal predecessor state -- nothing an existing anchor state could transition into is widened", async () => {
  for (const state of ["rollback-performed", "cleanup-performed"]) {
    const recoverability = REQUIREMENT_OF[state];
    for (const anchorState of ["acknowledged", "authorized", "copied", "attempted", "recovery-proposed", "rollback-performed", "cleanup-performed"]) {
      const anchor = follow(anchorState, { eventId: `${anchorState}-7`, executionAssurance: anchorState === "attempted" ? "attempted" : "not-applicable", recoverability: anchorState === "rollback-performed" || anchorState === "cleanup-performed" ? REQUIREMENT_OF[anchorState] : recoverability, postEvidenceDigest: anchorState === "rollback-performed" || anchorState === "cleanup-performed" ? SHA("5") : null });
      await assert.rejects(recordCommandRecoveryOccurrence({ anchor, occurrence: occurred(state, anchor.eventId, { recoverability }), append }), (error) => error.code === "ECO-OCCURRENCE-ANCHOR", `${anchorState} was admitted as an anchor for ${state}`);
    }
    const offeredAnchor = event({ recoverability });
    await assert.rejects(recordCommandRecoveryOccurrence({ anchor: offeredAnchor, occurrence: occurred(state, offeredAnchor.eventId), append }), (error) => error.code === "ECO-OCCURRENCE-ANCHOR", "an offer alone has executed nothing that could have been undone");
    // The legal anchors stay legal: every bounded outcome and a selected recovery.
    for (const anchorState of ["execution-unobserved", "failed", "partial", "cancelled", "unknown", "unavailable", "readback-mismatch", "recovered"]) {
      const anchor = follow(anchorState, { eventId: `${anchorState}-6`, executionAssurance: anchorState === "recovered" ? "not-applicable" : anchorState, recoverability });
      assert.equal((await recordCommandRecoveryOccurrence({ anchor, occurrence: occurred(state, anchor.eventId), append })).status, state, `${anchorState} must remain a legal anchor for ${state}`);
    }
  }
});

test("R-AC-08: an occurred rollback/cleanup fails closed on an undeclared requirement, a mismatched or cross-scope link, a missing post-evidence digest, and a wrong state through this recorder", async () => {
  const anchor = follow("failed", { eventId: "failed-5", recoverability: "rollback-required" });
  await assert.rejects(recordCommandRecoveryOccurrence({ anchor: follow("failed", { eventId: "failed-5", recoverability: "recoverable" }), occurrence: occurred("rollback-performed", "failed-5"), append }), (error) => error.code === "ECO-OCCURRENCE-DISCHARGE");
  await assert.rejects(recordCommandRecoveryOccurrence({ anchor, occurrence: occurred("cleanup-performed", "failed-5"), append }), (error) => error.code === "ECO-OCCURRENCE-DISCHARGE");
  await assert.rejects(recordCommandRecoveryOccurrence({ anchor, occurrence: occurred("rollback-performed", "failed-4"), append }), (error) => error.code === "ECO-OCCURRENCE-LINK");
  await assert.rejects(recordCommandRecoveryOccurrence({ anchor, occurrence: occurred("rollback-performed", "failed-5", { target: { repositoryFingerprint: SHA("c"), scopeDigest: SHA("0") } }), append }), (error) => error.code === "ECO-OCCURRENCE-LINK");
  await assert.rejects(recordCommandRecoveryOccurrence({ anchor, occurrence: occurred("rollback-performed", "failed-5", { postEvidenceDigest: null }), append }), (error) => error.code === "ECO-OCCURRENCE-EVIDENCE");
  await assert.rejects(recordCommandRecoveryOccurrence({ anchor, occurrence: follow("recovered", { eventId: "recovered-5", executionAssurance: "not-applicable", offerEventId: "failed-5" }), append }), (error) => error.code === "ECO-OCCURRENCE-STATE");
  // Validator-level: the occurred state is structurally bound to the matching
  // prospective requirement and can never grade the offered command's execution.
  await assert.rejects(recordCommandRecoveryOccurrence({ anchor, occurrence: occurred("rollback-performed", "failed-5", { recoverability: "not-applicable" }), append }), (error) => error.code === "ADJ-COMMAND-OCCURRENCE-SCOPE");
  await assert.rejects(recordCommandRecoveryOccurrence({ anchor, occurrence: occurred("rollback-performed", "failed-5", { executionAssurance: "observed-completed" }), append }), (error) => error.code === "ADJ-COMMAND-OCCURRENCE-SCOPE");
});

test("R-AC-08: requiredCleanup keeps its own axis on an occurred cleanup -- still-pending contradicts the occurrence, and a verified claim needs an independent observation that matches", async () => {
  const anchor = follow("cancelled", { eventId: "cancelled-5", recoverability: "cleanup-required" });
  const withStatus = (status) => occurred("cleanup-performed", "cancelled-5", { requiredCleanup: { cleanupClass: "manual-file-restore", status, digest: SHA("8") } });
  await assert.rejects(recordCommandRecoveryOccurrence({ anchor, occurrence: withStatus("pending"), append }), (error) => error.code === "ECO-OCCURRENCE-CLEANUP");
  assert.equal((await recordCommandRecoveryOccurrence({ anchor, occurrence: withStatus("completed"), append })).status, "cleanup-performed");
  await assert.rejects(recordCommandRecoveryOccurrence({ anchor, occurrence: withStatus("verified"), append }), (error) => error.code === "ECO-OCCURRENCE-EVIDENCE");
  await assert.rejects(recordCommandRecoveryOccurrence({ anchor, occurrence: withStatus("verified"), append, verifyOccurrence: async () => ({ state: "cleanup-performed", postEvidenceDigest: SHA("0") }) }), (error) => error.code === "ECO-OCCURRENCE-EVIDENCE");
  assert.equal((await recordCommandRecoveryOccurrence({ anchor, occurrence: withStatus("verified"), append, verifyOccurrence: async () => ({ state: "cleanup-performed", postEvidenceDigest: SHA("5") }) })).status, "cleanup-performed");
});

test("R-AC-06: recordCommandUserAcknowledgement appends each of acknowledged, authorized, and copied, anchored to the existing offer", async () => {
  for (const state of ["acknowledged", "authorized", "copied"]) {
    const acknowledgement = follow(state, { executionAssurance: "not-applicable" });
    const receipt = await recordCommandUserAcknowledgement({ offer: event(), acknowledgement, append });
    assert.equal(receipt.status, state);
    assert.equal(receipt.offerEventId, "offer-1");
  }
});

test("R-AC-06: recordCommandUserAcknowledgement never labels a user response executed, completed, or succeeded -- only the three named states are reachable through this recorder", async () => {
  for (const state of ["execution-unobserved", "observed-completed", "attempted", "failed", "partial"]) {
    const acknowledgement = follow(state);
    await assert.rejects(recordCommandUserAcknowledgement({ offer: event(), acknowledgement, append }), (error) => error.code === "ECO-ACKNOWLEDGEMENT");
  }
  // "executed"/"completed"/"succeeded" are not even valid schema states --
  // structurally impossible to record through any path, this one included.
  for (const state of ["executed", "completed", "succeeded"]) {
    await assert.rejects(recordCommandUserAcknowledgement({ offer: event(), acknowledgement: follow(state), append }), (error) => error.code === "ADJ-COMMAND-OFFER");
  }
});

test("R-AC-06: recordCommandUserAcknowledgement rejects a non-offered anchor and offer substitution across candidate, repository, and scope", async () => {
  const acknowledgement = follow("acknowledged", { executionAssurance: "not-applicable" });
  await assert.rejects(recordCommandUserAcknowledgement({ offer: follow("attempted"), acknowledgement, append }), (error) => error.code === "ECO-ACKNOWLEDGEMENT");
  const substituted = follow("acknowledged", { executionAssurance: "not-applicable", candidateDigest: SHA("0") });
  await assert.rejects(recordCommandUserAcknowledgement({ offer: event(), acknowledgement: substituted, append }), (error) => error.code === "ECO-ACKNOWLEDGEMENT");
});

test("R-AC-06: recordCommandUserAcknowledgement follows the same append-once, readback-verified, duplicate-refusing discipline as every other recorder", async () => {
  const acknowledgement = follow("authorized", { eventId: "authorized-1", executionAssurance: "not-applicable" });
  const calls = [];
  const receipt = await recordCommandUserAcknowledgement({ offer: event(), acknowledgement, append: async (value) => { calls.push(value); return append(value); } });
  assert.equal(receipt.status, "authorized");
  assert.equal(calls.length, 1);
  await assert.rejects(recordCommandUserAcknowledgement({ offer: event(), acknowledgement, append: async () => ({ eventId: "authorized-1", candidateDigest: SHA("a"), integrity: "unknown" }) }), (error) => error.code === "ECO-READBACK");
  let appended = 0;
  await assert.rejects(recordCommandUserAcknowledgement({ offer: event(), acknowledgement, journaled: [event(), acknowledgement], append: async (value) => { appended += 1; return append(value); } }), (error) => error.code === "ECO-DUPLICATE" && error.replay.reasonCode === "DUPLICATE_LIFECYCLE_EVENT_ID");
  assert.equal(appended, 0);
});

test("R-AC-08: the occurred states are unreachable through the outcome recorder and the considered-recovery recorder, so the discharge guard has no bypass", async () => {
  for (const state of ["rollback-performed", "cleanup-performed"]) {
    const occurrence = occurred(state, "offer-1");
    await assert.rejects(recordCommandOutcome({ offer: event({ recoverability: REQUIREMENT_OF[state] }), outcome: occurrence, append }), (error) => error.code === "ECO-OUTCOME");
    await assert.rejects(recordCommandRecoveryDisposition({ anchor: event({ recoverability: REQUIREMENT_OF[state] }), recovery: occurrence, append }), (error) => error.code === "ECO-RECOVERY-STATE");
  }
});
