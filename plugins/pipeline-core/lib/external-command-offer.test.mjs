// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { recordCommandOffer, recordPipelineAttempt, recordCommandOutcome } from "./external-command-offer.mjs";

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

test("R-AC-04: binds operation class, target, exact pre/post evidence digests, and recoverability together on a state-mutating outcome; rejects malformed digests or an unrecognized recoverability value", async () => {
  const mutated = follow("cancelled", { preEvidenceDigest: SHA("1"), postEvidenceDigest: SHA("2"), recoverability: "rollback-required" });
  const receipt = await recordCommandOutcome({ offer: event(), outcome: mutated, append });
  assert.equal(receipt.status, "cancelled");
  const badDigest = follow("cancelled", { preEvidenceDigest: "not-a-digest", postEvidenceDigest: SHA("2"), recoverability: "rollback-required" });
  await assert.rejects(recordCommandOutcome({ offer: event(), outcome: badDigest, append }), (error) => error.code === "ADJ-COMMAND-OFFER");
  const badRecoverability = follow("cancelled", { preEvidenceDigest: SHA("1"), postEvidenceDigest: SHA("2"), recoverability: "irreversible" });
  await assert.rejects(recordCommandOutcome({ offer: event(), outcome: badRecoverability, append }), (error) => error.code === "ADJ-COMMAND-OFFER");
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
