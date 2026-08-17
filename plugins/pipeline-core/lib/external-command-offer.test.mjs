// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { recordCommandOffer, recordPipelineAttempt, recordCommandOutcome, acknowledgeNonMaterialOfferWithoutJournal, acknowledgeOfferUnderJournalingGap, recordCommandRecoveryDisposition, recordPrivateHandoffCommitment } from "./external-command-offer.mjs";

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
