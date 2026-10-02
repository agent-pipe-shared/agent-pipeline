// SPDX-License-Identifier: SUL-1.0
/** Immutable review resolution for a Critic-required authored v3/v4 record. */
import { createHash } from "node:crypto";
import { CRITIC_EVIDENCE_SCHEMA } from "./critic-skip-decision.mjs";
import { DISPATCH_RECORD_SCHEMA, PREVIOUS_DISPATCH_RECORD_SCHEMA, isNoDeliveryOutcome, isSafeTaskId, isTerminalOutcome, normalizeDispatchRecordPath } from "./dispatch-record.mjs";

export const CRITIC_DISPOSITION_ADDENDUM_SCHEMA = "pipeline.critic-disposition-addendum.v1";
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}$/u;
const PACKET_ID = /^[a-f0-9]{32}$/u;

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

export function criticDispositionAddendumPath(taskId) {
  if (!isSafeTaskId(taskId)) throw new TypeError("critic addendum taskId is unsafe");
  return `evidence/dispatch-critic-addendum-${taskId}.json`;
}

export function validateCriticDispositionAddendum(addendum, { recordPath, recordBytes, record } = {}) {
  if (!exactKeys(addendum, ["schema", "recordPath", "recordSha256", "taskId", "candidateCommit", "reviewCandidateCommit", "criticEvidence", "criticPacketId", "criticReceiptSha256"])
    || addendum.schema !== CRITIC_DISPOSITION_ADDENDUM_SCHEMA
    || !isSafeTaskId(addendum.taskId)
    || !SHA256.test(addendum.recordSha256 ?? "")
    || !PACKET_ID.test(addendum.criticPacketId ?? "")
    || !SHA256.test(addendum.criticReceiptSha256 ?? "")
    || !OID.test(addendum.candidateCommit ?? "")
    || !OID.test(addendum.reviewCandidateCommit ?? "")) throw new TypeError("critic addendum shape is invalid");
  normalizeDispatchRecordPath(addendum.recordPath, "critic addendum recordPath");
  const reference = addendum.criticEvidence;
  if (!exactKeys(reference, ["schema", "taskId", "candidateCommit", "path", "sha256"])
    || reference.schema !== CRITIC_EVIDENCE_SCHEMA
    || reference.taskId !== addendum.taskId
    || reference.candidateCommit !== addendum.candidateCommit
    || !SHA256.test(reference.sha256 ?? "")) throw new TypeError("critic addendum evidence binding is invalid");
  normalizeDispatchRecordPath(reference.path, "critic addendum evidence path");
  if (!/^(?:evidence|backlog\/evidence)\//u.test(reference.path)) throw new TypeError("critic addendum evidence must be under evidence");
  const undelivered = record?.outcomeClassification?.kind === "completed-undelivered"
    && record.commits?.length === 0;
  const interrupted = record?.runner === "antigravity"
    && record?.outcomeClassification?.kind === "stopped-without-commit"
    && record.commits?.length === 0 && record.log?.length === 1
    && record.log[0].phase === "interrupted";
  const authored = record?.outcomeClassification?.kind === "authored-commit"
    && Array.isArray(record.commits) && record.commits.length === 1
    && record.commits[0] === addendum.candidateCommit;
  const authoredV3 = record?.schema === PREVIOUS_DISPATCH_RECORD_SCHEMA
    && isTerminalOutcome(record.outcome) && !isNoDeliveryOutcome(record.outcome)
    && Array.isArray(record.commits) && record.commits.length > 0
    && record.commits.at(-1) === addendum.candidateCommit;
  if (recordPath !== `evidence/dispatch-record-${addendum.taskId}.json`
    || addendum.recordPath !== recordPath
    || !(recordBytes instanceof Uint8Array)
    || createHash("sha256").update(recordBytes).digest("hex") !== addendum.recordSha256
    || (record?.schema !== DISPATCH_RECORD_SCHEMA && !authoredV3)
    || record.taskId !== addendum.taskId
    || record.candidateCommit !== addendum.candidateCommit
    || !Object.hasOwn(record, "criticRequired")
    || (!undelivered && !interrupted && !authored && !authoredV3)) throw new TypeError("critic addendum does not bind an immutable Critic-required authored v3/v4 record");
  return addendum;
}
