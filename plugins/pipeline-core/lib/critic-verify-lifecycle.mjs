// SPDX-License-Identifier: SUL-1.0
/**
 * Private bridge between a completed fresh Critic and a Verify run.
 *
 * The public Verify JSON deliberately remains consumable evidence, not an
 * assertion that a reviewer existed.  This module records that assertion only
 * after re-reading the consumed Critic packet from the private journal.  A
 * feature close can consequently demand this record and cannot be fooled by a
 * caller-supplied `{ status: "passed" }` object.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { canonicalJson, sha256 } from "../scripts/critic-packet-preflight.mjs";
import { readConsumedCandidateReceipt } from "../scripts/critic-packet-preflight.mjs";
import { validateSessionCriticReceipt } from "../scripts/session-critic-finalizer.mjs";
import { classifyRegisteredEvidenceOnlyCommits } from "./critic-course-admission.mjs";

export const CRITIC_VERIFY_LIFECYCLE_RECEIPT_SCHEMA = "pipeline.critic-verify-lifecycle-receipt.v1";
export const CRITIC_VERIFY_CARRY_LIFECYCLE_RECEIPT_SCHEMA = "pipeline.critic-verify-lifecycle-receipt.v2";
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SHA = /^[a-f0-9]{64}$/u;
const PACKET = /^[a-f0-9]{32}$/u;
const FEATURE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function candidate(value) { return exact(value, ["commit", "tree"]) && OID.test(value.commit ?? "") && OID.test(value.tree ?? ""); }
function bytesSha256(value) { return createHash("sha256").update(value).digest("hex"); }

export function criticVerifyLifecycleId({ candidate: sourceCandidate, criticPacketId, verifyEvidenceSha256 }) {
  if (!candidate(sourceCandidate) || !PACKET.test(criticPacketId ?? "") || !SHA.test(verifyEvidenceSha256 ?? "")) fail("CVL-IDENTITY", "Lifecycle identity is invalid.");
  return sha256(canonicalJson({ candidate: sourceCandidate, criticPacketId, verifyEvidenceSha256 }));
}

function recordPath(privateRoot, id) {
  if (!SHA.test(id ?? "")) fail("CVL-IDENTITY", "Lifecycle receipt identity is invalid.");
  return join(privateRoot, "critic-verify-lifecycle", `${id}.json`);
}

/**
 * Read a consumed Critic receipt from its private packet and prove that the
 * receipt is the receipt for that packet's exact candidate and diff.  A
 * syntactically valid receipt on its own is deliberately insufficient: the
 * packet journal is the authority that makes it a completed, fresh review.
 */
export function readBoundConsumedCriticReceipt({ gitCommonDir, criticPacketId, candidate: sourceCandidate }, deps = {}) {
  if (typeof gitCommonDir !== "string" || gitCommonDir.length === 0 || !PACKET.test(criticPacketId ?? "") || !candidate(sourceCandidate)) {
    fail("CVL-INPUT", "Critic/Verify lifecycle input is invalid.");
  }
  const common = resolve(gitCommonDir);
  const readReceipt = deps.readConsumedCandidateReceiptFn ?? readConsumedCandidateReceipt;
  let consumed;
  try { consumed = readReceipt({ controlRoot: join(common, "agent-pipeline", "critic-packets"), packetId: criticPacketId }); }
  catch (error) { fail("CVL-CRITIC-UNAVAILABLE", `No consumed private Critic receipt is available for this packet (${error?.code ?? "unavailable"}).`); }
  const critic = consumed?.receipt;
  const packet = consumed?.packet;
  try { validateSessionCriticReceipt(critic); }
  catch { fail("CVL-CRITIC-INVALID", "Private Critic receipt is malformed."); }
  if (!packet || packet.packetId !== criticPacketId || critic.packetId !== criticPacketId
    || critic.packetDigest !== sha256(canonicalJson(packet))
    || packet.candidate?.base !== critic.candidate.base || packet.candidate?.commit !== critic.candidate.commit
    || packet.candidate?.tree !== critic.candidate.tree || packet.diff?.base !== critic.reviewRange.base
    || packet.diff?.commit !== critic.reviewRange.commit || packet.diff?.sha256 !== critic.reviewRange.diffSha256) {
    fail("CVL-CRITIC-PACKET-MISMATCH", "Private Critic receipt is not bound to its consumed packet.");
  }
  if (critic.reviewPass !== true) fail("CVL-CRITIC-FAILED", "Critic findings remain unresolved; Verify cannot attest this candidate.");
  if (critic.candidate.commit !== sourceCandidate.commit || critic.candidate.tree !== sourceCandidate.tree
    || critic.reviewRange.commit !== sourceCandidate.commit) fail("CVL-CRITIC-STALE", "Private Critic receipt is not bound to the Verify candidate.");
  return Object.freeze({ packet, critic, criticReceiptSha256: bytesSha256(canonicalJson(critic)) });
}

/**
 * Read-only eligibility proof for a reviewed commit followed solely by
 * immutable, feature-package-registered evidence commits. This is not itself
 * Verify admission or a persisted lifecycle receipt: the eventual consumer
 * must bind the returned digest to the target Verify evidence.
 */
export function inspectConsumedCriticEvidenceCarryForward({ repoRoot, gitCommonDir, featureId,
  criticPacketId, targetCandidate }, deps = {}) {
  if (typeof repoRoot !== "string" || !isAbsolute(repoRoot)
    || typeof gitCommonDir !== "string" || gitCommonDir.length === 0
    || !FEATURE_ID.test(featureId ?? "") || !PACKET.test(criticPacketId ?? "")
    || !candidate(targetCandidate)) fail("CVL-CARRY-INPUT", "Critic carry-forward input is invalid.");
  let consumed;
  try {
    consumed = (deps.readConsumedCandidateReceiptFn ?? readConsumedCandidateReceipt)({
      controlRoot: join(resolve(gitCommonDir), "agent-pipeline", "critic-packets"),
      packetId: criticPacketId,
    });
  } catch { fail("CVL-CRITIC-UNAVAILABLE", "Consumed Critic packet is unavailable."); }
  const reviewedCandidate = consumed?.packet?.candidate;
  if (!reviewedCandidate || !candidate({ commit: reviewedCandidate.commit, tree: reviewedCandidate.tree })
    || reviewedCandidate.commit === targetCandidate.commit) {
    fail("CVL-CARRY-INPUT", "Carry-forward requires distinct reviewed and target commits.");
  }
  const bound = readBoundConsumedCriticReceipt({ gitCommonDir, criticPacketId,
    candidate: { commit: reviewedCandidate.commit, tree: reviewedCandidate.tree } },
  { readConsumedCandidateReceiptFn: () => consumed });
  let range;
  try {
    range = (deps.classifyRegisteredEvidenceOnlyCommitsFn ?? classifyRegisteredEvidenceOnlyCommits)({
      repoRoot, featureId, baseCommit: reviewedCandidate.commit,
      candidateCommit: targetCandidate.commit,
    });
  } catch { fail("CVL-CARRY-RANGE", "Evidence-only Git range cannot be verified."); }
  if (range.candidateTree !== targetCandidate.tree
    || !Array.isArray(range.rangeCommits) || range.rangeCommits.length === 0
    || !Array.isArray(range.evidenceOnlyCommits)
    || range.evidenceOnlyCommits.length !== range.rangeCommits.length
    || !range.rangeCommits.every((commit, index) => commit === range.evidenceOnlyCommits[index])
    || !Array.isArray(range.correctionCommits) || range.correctionCommits.length !== 0) {
    fail("CVL-CARRY-CONTENT-CHANGED", "Critic carry-forward range contains unreviewed content.");
  }
  const proof = Object.freeze({
    schema: "pipeline.critic-evidence-carry-forward.v1", featureId,
    reviewedCandidate: { commit: reviewedCandidate.commit, tree: reviewedCandidate.tree },
    targetCandidate: { ...targetCandidate }, criticPacketId,
    criticReceiptSha256: bound.criticReceiptSha256,
    manifestSha256: range.manifestSha256,
    evidenceOnlyCommits: [...range.evidenceOnlyCommits],
  });
  return Object.freeze({ proof, proofSha256: sha256(canonicalJson(proof)) });
}

/**
 * Revalidate a consumed Critic packet and persist an immutable Verify binding.
 * `gitCommonDir` is supplied by the caller's already-resolved repository
 * boundary; this module never discovers or follows a user-provided path.
 */
export function recordCriticVerifyLifecycle({ repoRoot = null, featureId = null, gitCommonDir,
  criticPacketId, candidate: sourceCandidate, evidencePath, evidence }, deps = {}) {
  if (typeof gitCommonDir !== "string" || gitCommonDir.length === 0 || !PACKET.test(criticPacketId ?? "") || !candidate(sourceCandidate)
    || typeof evidencePath !== "string" || evidencePath.length === 0 || !evidence || typeof evidence !== "object"
    || (featureId === null) !== (repoRoot === null)) fail("CVL-INPUT", "Critic/Verify lifecycle input is invalid.");
  if (evidence.schema !== "pipeline.verify-evidence.v0" || evidence.exitCode !== 0 || !candidate(evidence.candidate)
    || evidence.candidate.commit !== sourceCandidate.commit || evidence.candidate.tree !== sourceCandidate.tree) fail("CVL-VERIFY", "Passing Verify evidence is not bound to the current candidate.");
  const common = resolve(gitCommonDir);
  const privateRoot = join(common, "agent-pipeline");
  const carry = featureId === null ? null : inspectConsumedCriticEvidenceCarryForward({
    repoRoot, gitCommonDir: common, featureId, criticPacketId, targetCandidate: sourceCandidate,
  }, deps);
  const bound = readBoundConsumedCriticReceipt({ gitCommonDir: common, criticPacketId,
    candidate: carry === null ? sourceCandidate : carry.proof.reviewedCandidate }, deps);
  const { critic } = bound;
  const verifyEvidenceSha256 = bytesSha256(canonicalJson(evidence));
  const criticReceiptSha256 = bound.criticReceiptSha256;
  const id = criticVerifyLifecycleId({ candidate: sourceCandidate, criticPacketId, verifyEvidenceSha256 });
  const receipt = Object.freeze({
    schema: carry === null ? CRITIC_VERIFY_LIFECYCLE_RECEIPT_SCHEMA : CRITIC_VERIFY_CARRY_LIFECYCLE_RECEIPT_SCHEMA,
    id,
    candidate: { ...sourceCandidate },
    critic: { packetId: criticPacketId, packetDigest: critic.packetDigest, receiptSha256: criticReceiptSha256, verdictSha256: critic.verdictSha256, reviewRange: { ...critic.reviewRange } },
    verify: { evidencePath, evidenceSha256: verifyEvidenceSha256, verifyRunTerminalSha256: evidence.verifyRun?.terminalSha256 ?? null },
    ...(carry === null ? {} : { carryForward: carry }),
  });
  const target = recordPath(privateRoot, id);
  mkdirSync(join(privateRoot, "critic-verify-lifecycle"), { recursive: true, mode: 0o700 });
  const encoded = `${canonicalJson(receipt)}\n`;
  if (existsSync(target)) {
    let previous;
    try { previous = readFileSync(target, "utf8"); } catch { fail("CVL-RECEIPT-READBACK", "Existing private lifecycle receipt cannot be read."); }
    if (previous !== encoded) fail("CVL-RECEIPT-COLLISION", "Existing lifecycle receipt has a different binding.");
  } else {
    try { writeFileSync(target, encoded, { flag: "wx", mode: 0o600 }); }
    catch { fail("CVL-RECEIPT-WRITE", "Private lifecycle receipt could not be persisted."); }
  }
  const observed = readFileSync(target, "utf8");
  if (observed !== encoded) fail("CVL-RECEIPT-READBACK", "Private lifecycle receipt readback differs.");
  return Object.freeze({ receipt, receiptSha256: bytesSha256(canonicalJson(receipt)), path: target });
}

/** Re-read a receipt by its opaque ID and bind it to the expected candidate/evidence. */
export function readCriticVerifyLifecycle({ repoRoot = null, gitCommonDir, id,
  candidate: sourceCandidate, evidencePath = null, evidence }, deps = {}) {
  if (typeof gitCommonDir !== "string" || !SHA.test(id ?? "") || !candidate(sourceCandidate) || (evidencePath !== null && typeof evidencePath !== "string")) fail("CVL-INPUT", "Lifecycle read input is invalid.");
  const target = recordPath(join(resolve(gitCommonDir), "agent-pipeline"), id);
  let receipt;
  try { receipt = JSON.parse(readFileSync(target, "utf8")); } catch { fail("CVL-RECEIPT-UNAVAILABLE", "Private Critic/Verify lifecycle receipt is unavailable."); }
  const carrying = receipt?.schema === CRITIC_VERIFY_CARRY_LIFECYCLE_RECEIPT_SCHEMA;
  const keys = ["schema", "id", "candidate", "critic", "verify", ...(carrying ? ["carryForward"] : [])];
  if (!exact(receipt, keys) || (![CRITIC_VERIFY_LIFECYCLE_RECEIPT_SCHEMA,
    CRITIC_VERIFY_CARRY_LIFECYCLE_RECEIPT_SCHEMA].includes(receipt.schema))
    || receipt.id !== id || !candidate(receipt.candidate)
    || receipt.candidate.commit !== sourceCandidate.commit || receipt.candidate.tree !== sourceCandidate.tree
    || !exact(receipt.critic, ["packetId", "packetDigest", "receiptSha256", "verdictSha256", "reviewRange"])
    || !PACKET.test(receipt.critic.packetId ?? "") || !SHA.test(receipt.critic.packetDigest ?? "")
    || !SHA.test(receipt.critic.receiptSha256 ?? "") || !SHA.test(receipt.critic.verdictSha256 ?? "")
    || !exact(receipt.critic.reviewRange, ["base", "commit", "diffSha256"])
    || !OID.test(receipt.critic.reviewRange.base ?? "")
    || (!carrying && receipt.critic.reviewRange.commit !== sourceCandidate.commit)
    || (carrying && !OID.test(receipt.critic.reviewRange.commit ?? ""))
    || !SHA.test(receipt.critic.reviewRange.diffSha256 ?? "")
    || !exact(receipt.verify, ["evidencePath", "evidenceSha256", "verifyRunTerminalSha256"])
    || (evidencePath !== null && receipt.verify.evidencePath !== evidencePath) || !SHA.test(receipt.verify.evidenceSha256 ?? "")
    || (receipt.verify.verifyRunTerminalSha256 !== null && !SHA.test(receipt.verify.verifyRunTerminalSha256 ?? ""))) {
    fail("CVL-RECEIPT-INVALID", "Private lifecycle receipt is malformed or stale.");
  }
  if (criticVerifyLifecycleId({ candidate: sourceCandidate, criticPacketId: receipt.critic.packetId,
    verifyEvidenceSha256: receipt.verify.evidenceSha256 }) !== id) {
    fail("CVL-RECEIPT-IDENTITY", "Private lifecycle identity differs from its candidate and Verify binding.");
  }
  let carry = null;
  if (carrying) {
    if (typeof repoRoot !== "string" || !isAbsolute(repoRoot)
      || !exact(receipt.carryForward, ["proof", "proofSha256"])
      || !SHA.test(receipt.carryForward.proofSha256 ?? "")
      || !FEATURE_ID.test(receipt.carryForward.proof?.featureId ?? "")) {
      fail("CVL-CARRY-INVALID", "Private evidence-only carry binding is invalid.");
    }
    carry = inspectConsumedCriticEvidenceCarryForward({ repoRoot, gitCommonDir,
      featureId: receipt.carryForward.proof.featureId,
      criticPacketId: receipt.critic.packetId, targetCandidate: sourceCandidate }, deps);
    if (carry.proofSha256 !== receipt.carryForward.proofSha256
      || canonicalJson(carry.proof) !== canonicalJson(receipt.carryForward.proof)
      || receipt.critic.reviewRange.commit !== carry.proof.reviewedCandidate.commit) {
      fail("CVL-CARRY-DRIFT", "Private evidence-only carry proof differs from Git or the consumed review.");
    }
  }
  const bound = readBoundConsumedCriticReceipt({ gitCommonDir, criticPacketId: receipt.critic.packetId,
    candidate: carry === null ? sourceCandidate : carry.proof.reviewedCandidate }, deps);
  if (receipt.critic.packetDigest !== bound.critic.packetDigest
    || receipt.critic.receiptSha256 !== bound.criticReceiptSha256
    || receipt.critic.verdictSha256 !== bound.critic.verdictSha256
    || canonicalJson(receipt.critic.reviewRange) !== canonicalJson(bound.critic.reviewRange)) {
    fail("CVL-CRITIC-DRIFT", "Private lifecycle Critic binding differs from the consumed packet.");
  }
  if (evidence !== undefined) {
    if (evidence?.schema !== "pipeline.verify-evidence.v0" || evidence.exitCode !== 0
      || !candidate(evidence.candidate) || evidence.candidate.commit !== sourceCandidate.commit
      || evidence.candidate.tree !== sourceCandidate.tree) {
      fail("CVL-VERIFY", "Passing Verify evidence is not bound to the current candidate.");
    }
    if (bytesSha256(canonicalJson(evidence)) !== receipt.verify.evidenceSha256) {
      fail("CVL-VERIFY-DRIFT", "Verify evidence differs from the private lifecycle binding.");
    }
    if (receipt.verify.verifyRunTerminalSha256 !== (evidence.verifyRun?.terminalSha256 ?? null)) {
      fail("CVL-VERIFY-DRIFT", "Verify terminal receipt differs from the private lifecycle binding.");
    }
  }
  return Object.freeze({ receipt, receiptSha256: bytesSha256(canonicalJson(receipt)), path: target });
}
