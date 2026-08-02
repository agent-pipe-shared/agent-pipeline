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
