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
import { join, resolve } from "node:path";

import { canonicalJson, sha256 } from "../scripts/critic-packet-preflight.mjs";
import { readConsumedCandidateReceipt } from "../scripts/critic-packet-preflight.mjs";
import { validateSessionCriticReceipt } from "../scripts/session-critic-finalizer.mjs";

export const CRITIC_VERIFY_LIFECYCLE_RECEIPT_SCHEMA = "pipeline.critic-verify-lifecycle-receipt.v1";
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SHA = /^[a-f0-9]{64}$/u;
const PACKET = /^[a-f0-9]{32}$/u;

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
 * Revalidate a consumed Critic packet and persist an immutable Verify binding.
 * `gitCommonDir` is supplied by the caller's already-resolved repository
 * boundary; this module never discovers or follows a user-provided path.
 */
export function recordCriticVerifyLifecycle({ gitCommonDir, criticPacketId, candidate: sourceCandidate, evidencePath, evidence }, deps = {}) {
  if (typeof gitCommonDir !== "string" || gitCommonDir.length === 0 || !PACKET.test(criticPacketId ?? "") || !candidate(sourceCandidate)
    || typeof evidencePath !== "string" || evidencePath.length === 0 || !evidence || typeof evidence !== "object") fail("CVL-INPUT", "Critic/Verify lifecycle input is invalid.");
  if (evidence.schema !== "pipeline.verify-evidence.v0" || evidence.exitCode !== 0 || !candidate(evidence.candidate)
    || evidence.candidate.commit !== sourceCandidate.commit || evidence.candidate.tree !== sourceCandidate.tree) fail("CVL-VERIFY", "Passing Verify evidence is not bound to the current candidate.");
  const common = resolve(gitCommonDir);
  const privateRoot = join(common, "agent-pipeline");
  const readReceipt = deps.readConsumedCandidateReceiptFn ?? readConsumedCandidateReceipt;
  let consumed;
  try { consumed = readReceipt({ controlRoot: join(privateRoot, "critic-packets"), packetId: criticPacketId }); }
  catch { fail("CVL-CRITIC-UNAVAILABLE", "No consumed private Critic receipt is available for this packet."); }
  try { validateSessionCriticReceipt(consumed.receipt); }
  catch { fail("CVL-CRITIC-INVALID", "Private Critic receipt is malformed."); }
  const critic = consumed.receipt;
  if (critic.reviewPass !== true) fail("CVL-CRITIC-FAILED", "Critic findings remain unresolved; Verify cannot attest this candidate.");
  if (critic.candidate.commit !== sourceCandidate.commit || critic.candidate.tree !== sourceCandidate.tree
    || critic.reviewRange.commit !== sourceCandidate.commit) fail("CVL-CRITIC-STALE", "Private Critic receipt is not bound to the Verify candidate.");
  const verifyEvidenceSha256 = bytesSha256(canonicalJson(evidence));
  const criticReceiptSha256 = bytesSha256(canonicalJson(critic));
  const id = criticVerifyLifecycleId({ candidate: sourceCandidate, criticPacketId, verifyEvidenceSha256 });
  const receipt = Object.freeze({
    schema: CRITIC_VERIFY_LIFECYCLE_RECEIPT_SCHEMA,
    id,
    candidate: { ...sourceCandidate },
    critic: { packetId: criticPacketId, packetDigest: critic.packetDigest, receiptSha256: criticReceiptSha256, verdictSha256: critic.verdictSha256, reviewRange: { ...critic.reviewRange } },
    verify: { evidencePath, evidenceSha256: verifyEvidenceSha256, verifyRunTerminalSha256: evidence.verifyRun?.terminalSha256 ?? null },
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
export function readCriticVerifyLifecycle({ gitCommonDir, id, candidate: sourceCandidate, evidencePath, evidence }, deps = {}) {
  if (typeof gitCommonDir !== "string" || !SHA.test(id ?? "") || !candidate(sourceCandidate) || typeof evidencePath !== "string") fail("CVL-INPUT", "Lifecycle read input is invalid.");
  const target = recordPath(join(resolve(gitCommonDir), "agent-pipeline"), id);
  let receipt;
  try { receipt = JSON.parse(readFileSync(target, "utf8")); } catch { fail("CVL-RECEIPT-UNAVAILABLE", "Private Critic/Verify lifecycle receipt is unavailable."); }
  const keys = ["schema", "id", "candidate", "critic", "verify"];
  if (!exact(receipt, keys) || receipt.schema !== CRITIC_VERIFY_LIFECYCLE_RECEIPT_SCHEMA || receipt.id !== id || !candidate(receipt.candidate)
    || receipt.candidate.commit !== sourceCandidate.commit || receipt.candidate.tree !== sourceCandidate.tree
    || receipt.verify?.evidencePath !== evidencePath || !SHA.test(receipt.verify?.evidenceSha256 ?? "")) fail("CVL-RECEIPT-INVALID", "Private lifecycle receipt is malformed or stale.");
  if (evidence !== undefined && bytesSha256(canonicalJson(evidence)) !== receipt.verify.evidenceSha256) fail("CVL-VERIFY-DRIFT", "Verify evidence differs from the private lifecycle binding.");
  return Object.freeze({ receipt, receiptSha256: bytesSha256(canonicalJson(receipt)), path: target });
}
