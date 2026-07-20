// SPDX-License-Identifier: Apache-2.0
import { canonicalJson, sha256Canonical } from "./afk-assumption-mode.mjs";
import { compareAndSwapAfkFeatureRef, observeAfkGitAuthority } from "./afk-git-adapter.mjs";

export const AFK_REVIEW_SCHEMA = "pipeline.afk-review.v1";
export const AFK_ENTRY_RECEIPT_SCHEMA = "pipeline.afk-entry-receipt.v1";
export const AFK_PROJECTION_SCHEMA = "pipeline.afk-projection.v1";

const HEX32 = /^[0-9a-f]{32}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const NORMAL_OPERATIONS = new Set(["dispatch", "git", "close", "push", "activate"]);
const RECOVERY_OPERATIONS = new Set(["afk-status", "afk-review", "afk-recover"]);

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return object(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function fail(code, detail = null, mutation = "none") {
  return { ok: false, code, detail, mutation };
}

function isoTime(value) {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function validEntry(entry) {
  return exactKeys(entry, ["entryId", "sequence", "resultCommit"])
    && safeId(entry.entryId) && Number.isSafeInteger(entry.sequence) && entry.sequence > 0
    && OID.test(entry.resultCommit);
}

function validFreeze(value) {
  return exactKeys(value, [
    "reviewId", "cause", "ledgerSequence", "ledgerHeadSha256", "privateRefOid",
    "featureRef", "featureBaseOid", "frozenAt",
  ]) && safeId(value.reviewId) && new Set(["expiry", "revocation", "explicit-review"]).has(value.cause)
    && Number.isSafeInteger(value.ledgerSequence) && value.ledgerSequence > 0
    && SHA256.test(value.ledgerHeadSha256) && OID.test(value.privateRefOid)
    && typeof value.featureRef === "string" && value.featureRef.startsWith("refs/heads/")
    && OID.test(value.featureBaseOid) && isoTime(value.frozenAt);
}

function validDisposition(value) {
  return exactKeys(value, ["entryId", "sequence", "decision"])
    && safeId(value.entryId) && Number.isSafeInteger(value.sequence) && value.sequence > 0
    && new Set(["accept", "reject"]).has(value.decision);
}

export function createAfkReviewIntent({
  activationId,
  reviewId,
  attributedBy,
  reviewedAt,
  freezeRecordSha256,
  featureBaseOid,
  entries,
  dispositions,
}) {
  if (!HEX32.test(activationId ?? "") || !safeId(reviewId)
    || typeof attributedBy !== "string" || attributedBy.length < 1 || attributedBy.length > 256
    || attributedBy.trim() !== attributedBy || /[\0\r\n]/u.test(attributedBy)
    || !isoTime(reviewedAt) || !SHA256.test(freezeRecordSha256 ?? "")
    || !OID.test(featureBaseOid ?? "") || !Array.isArray(entries) || !entries.every(validEntry)
    || !entries.every((entry, index) => index === 0 || entries[index - 1].sequence < entry.sequence)
    || !Array.isArray(dispositions) || dispositions.length !== entries.length
    || !dispositions.every(validDisposition)) return fail("AFK-REVIEW-INVALID");
  for (let index = 0; index < entries.length; index += 1) {
    if (dispositions[index].entryId !== entries[index].entryId
      || dispositions[index].sequence !== entries[index].sequence) return fail("AFK-REVIEW-COVERAGE-INVALID");
  }
  const firstReject = dispositions.findIndex((entry) => entry.decision === "reject");
  const acceptedPrefixLength = firstReject < 0 ? dispositions.length : firstReject;
  if (dispositions.slice(acceptedPrefixLength).some((entry) => entry.decision !== "reject")) {
    return fail("AFK-REVIEW-PREFIX-INVALID");
  }
  const promotionOid = acceptedPrefixLength === 0
    ? featureBaseOid
    : entries[acceptedPrefixLength - 1].resultCommit;
  const preceding = {
    schema: AFK_REVIEW_SCHEMA,
    activationId,
    reviewId,
    attributedBy,
    reviewedAt,
    freezeRecordSha256,
    dispositions,
    acceptedPrefixLength,
    promotionOid,
  };
  const review = { ...preceding, reviewSha256: sha256Canonical(preceding) };
  return { ok: true, review, entries };
}

export function validateAfkReview(value) {
  if (!exactKeys(value, [
    "schema", "activationId", "reviewId", "attributedBy", "reviewedAt", "freezeRecordSha256",
    "dispositions", "acceptedPrefixLength", "promotionOid", "reviewSha256",
  ]) || value.schema !== AFK_REVIEW_SCHEMA || !HEX32.test(value.activationId)
    || !safeId(value.reviewId) || typeof value.attributedBy !== "string"
    || value.attributedBy.length < 1 || value.attributedBy.length > 256 || !isoTime(value.reviewedAt)
    || !SHA256.test(value.freezeRecordSha256) || !Array.isArray(value.dispositions)
    || !value.dispositions.every(validDisposition) || !Number.isSafeInteger(value.acceptedPrefixLength)
    || value.acceptedPrefixLength < 0 || value.acceptedPrefixLength > value.dispositions.length
    || value.dispositions.slice(0, value.acceptedPrefixLength).some((entry) => entry.decision !== "accept")
    || value.dispositions.slice(value.acceptedPrefixLength).some((entry) => entry.decision !== "reject")
    || !OID.test(value.promotionOid) || !SHA256.test(value.reviewSha256)) return fail("AFK-REVIEW-INVALID");
  const { reviewSha256, ...preceding } = value;
  return reviewSha256 === sha256Canonical(preceding)
    ? { ok: true, review: value }
    : fail("AFK-REVIEW-DIGEST-MISMATCH");
}

export function createAfkEntryReceipt({ review, entry, decision }) {
  if (!validateAfkReview(review).ok || !validEntry(entry)
    || !new Set(["accept", "reject"]).has(decision)) return fail("AFK-ENTRY-RECEIPT-INVALID");
  const matching = review.dispositions.find((candidate) => candidate.entryId === entry.entryId
    && candidate.sequence === entry.sequence);
  if (matching?.decision !== decision) return fail("AFK-ENTRY-RECEIPT-INVALID");
  const preceding = {
    schema: AFK_ENTRY_RECEIPT_SCHEMA,
    activationId: review.activationId,
    reviewId: review.reviewId,
    reviewSha256: review.reviewSha256,
    entryId: entry.entryId,
    sequence: entry.sequence,
    decision,
    entryCommit: entry.resultCommit,
  };
  const receipt = { ...preceding, receiptSha256: sha256Canonical(preceding) };
  return { ok: true, receipt };
}

export function validateAfkEntryReceipt(value, review = null) {
  if (!exactKeys(value, [
    "schema", "activationId", "reviewId", "reviewSha256", "entryId", "sequence",
    "decision", "entryCommit", "receiptSha256",
  ]) || value.schema !== AFK_ENTRY_RECEIPT_SCHEMA || !HEX32.test(value.activationId)
    || !safeId(value.reviewId) || !SHA256.test(value.reviewSha256) || !safeId(value.entryId)
    || !Number.isSafeInteger(value.sequence) || value.sequence < 1
    || !new Set(["accept", "reject"]).has(value.decision) || !OID.test(value.entryCommit)
    || !SHA256.test(value.receiptSha256)) return fail("AFK-ENTRY-RECEIPT-INVALID");
  const { receiptSha256, ...preceding } = value;
  if (receiptSha256 !== sha256Canonical(preceding)) return fail("AFK-ENTRY-RECEIPT-DIGEST-MISMATCH");
  if (review !== null && (!validateAfkReview(review).ok || value.activationId !== review.activationId
    || value.reviewId !== review.reviewId || value.reviewSha256 !== review.reviewSha256)) {
    return fail("AFK-ENTRY-RECEIPT-REVIEW-MISMATCH");
  }
  return { ok: true, receipt: value };
}

function recordsByType(records, type) {
  return records.filter((record) => record.type === type).map((record) => record.body);
}

function uniqueRecord(records, type, predicate) {
  const matches = recordsByType(records, type).filter(predicate);
  return matches.length <= 1
    ? { ok: true, body: matches[0] }
    : fail("AFK-REVIEW-DUPLICATE-RECORD");
}

function exactDuplicate(existing, candidate) {
  return existing !== undefined && canonicalJson(existing) === canonicalJson(candidate);
}

export function executeAfkReviewTransaction({
  root,
  activationId,
  freeze,
  freezeRecordSha256,
  entries,
  dispositions,
  attributedBy,
  reviewedAt,
  existingRecords = [],
  appendRecord,
  linkedFeatureCheckouts,
  refreshProjection = null,
  fault = null,
}) {
  if (!HEX32.test(activationId ?? "") || !validFreeze(freeze)
    || !SHA256.test(freezeRecordSha256 ?? "") || typeof appendRecord !== "function"
    || typeof linkedFeatureCheckouts !== "function" || !Array.isArray(existingRecords)) {
    return fail("AFK-REVIEW-TRANSACTION-INVALID");
  }
  const freezeRecord = uniqueRecord(existingRecords, "review-freeze", (body) => body.reviewId === freeze.reviewId);
  if (!freezeRecord.ok) return freezeRecord;
  const matchingFreeze = freezeRecord.body;
  if (matchingFreeze !== undefined && !exactDuplicate(matchingFreeze, freeze)) return fail("AFK-REVIEW-FREEZE-CONFLICT");
  if (matchingFreeze === undefined) {
    const frozen = appendRecord("review-freeze", freeze, freeze.frozenAt);
    if (!frozen?.ok) return fail(frozen?.code ?? "AFK-REVIEW-FREEZE-FAILED");
  }
  fault?.("after-freeze", freeze);
  const planned = createAfkReviewIntent({
    activationId,
    reviewId: freeze.reviewId,
    attributedBy,
    reviewedAt,
    freezeRecordSha256,
    featureBaseOid: freeze.featureBaseOid,
    entries,
    dispositions,
  });
  if (!planned.ok) return { ...planned, mutation: "wal" };
  const review = planned.review;
  const intentRecord = uniqueRecord(existingRecords, "review-intent", (body) => body.reviewId === review.reviewId);
  if (!intentRecord.ok) return { ...intentRecord, mutation: "wal" };
  const existingIntent = intentRecord.body;
  const intentBody = {
    reviewId: review.reviewId,
    attributedBy: review.attributedBy,
    reviewedAt: review.reviewedAt,
    freezeRecordSha256: review.freezeRecordSha256,
    dispositions: review.dispositions,
    acceptedPrefixLength: review.acceptedPrefixLength,
    promotionOid: review.promotionOid,
    reviewSha256: review.reviewSha256,
  };
  if (existingIntent !== undefined && !exactDuplicate(existingIntent, intentBody)) return fail("AFK-REVIEW-DECISION-CONFLICT", null, "wal");
  if (existingIntent === undefined) {
    const intended = appendRecord("review-intent", intentBody, reviewedAt);
    if (!intended?.ok) return fail(intended?.code ?? "AFK-REVIEW-INTENT-FAILED", null, "wal");
  }
  fault?.("after-review-intent", review);
  const promotionBody = {
    reviewId: review.reviewId,
    featureRef: freeze.featureRef,
    baseOid: freeze.featureBaseOid,
    promotionOid: review.promotionOid,
    moved: review.promotionOid !== freeze.featureBaseOid,
  };
  const promotionRecord = uniqueRecord(existingRecords, "promotion-applied", (body) => body.reviewId === review.reviewId);
  if (!promotionRecord.ok) return { ...promotionRecord, mutation: "wal" };
  if (promotionRecord.body !== undefined && !exactDuplicate(promotionRecord.body, promotionBody)) {
    return fail("AFK-PROMOTION-RECORD-CONFLICT", null, "wal");
  }
  const expectedReceipts = [];
  for (let index = 0; index < entries.length; index += 1) {
    const made = createAfkEntryReceipt({ review, entry: entries[index], decision: dispositions[index].decision });
    if (!made.ok) return { ...made, mutation: "wal" };
    const receipt = made.receipt;
    const body = {
      reviewId: receipt.reviewId,
      entryId: receipt.entryId,
      sequence: receipt.sequence,
      decision: receipt.decision,
      entryCommit: receipt.entryCommit,
      receiptSha256: receipt.receiptSha256,
    };
    const receiptRecord = uniqueRecord(existingRecords, "entry-receipt",
      (candidate) => candidate.reviewId === review.reviewId && candidate.entryId === receipt.entryId);
    if (!receiptRecord.ok) return { ...receiptRecord, mutation: "wal" };
    if (receiptRecord.body !== undefined && !exactDuplicate(receiptRecord.body, body)) {
      return fail("AFK-ENTRY-RECEIPT-CONFLICT", null, "wal");
    }
    expectedReceipts.push({ receipt, body, existing: receiptRecord.body });
  }
  const receiptSha256List = expectedReceipts.map(({ receipt }) => receipt.receiptSha256);
  const completeBody = {
    reviewId: review.reviewId,
    reviewSha256: review.reviewSha256,
    promotionOid: review.promotionOid,
    receiptSha256List,
  };
  const completeRecord = uniqueRecord(existingRecords, "review-complete", (body) => body.reviewId === review.reviewId);
  if (!completeRecord.ok) return { ...completeRecord, mutation: "wal" };
  if (completeRecord.body !== undefined && !exactDuplicate(completeRecord.body, completeBody)) {
    return fail("AFK-REVIEW-COMPLETE-CONFLICT", null, "wal");
  }
  const privateRef = `refs/agent-pipeline/afk/${activationId}`;
  const privateAuthority = observeAfkGitAuthority(root, privateRef);
  if (!privateAuthority.ok || privateAuthority.refOid !== freeze.privateRefOid) {
    return fail("AFK-PRIVATE-REF-FROZEN-HEAD-CONFLICT", null, "wal");
  }
  let checkouts;
  try { checkouts = linkedFeatureCheckouts(freeze.featureRef); } catch { return fail("AFK-WORKTREE-INVENTORY-FAILED", null, "wal"); }
  if (!Number.isSafeInteger(checkouts) || checkouts !== 0) return fail("AFK-FEATURE-REF-CHECKED-OUT", null, "wal");
  const promoted = compareAndSwapAfkFeatureRef({
    root,
    featureRef: freeze.featureRef,
    baseOid: freeze.featureBaseOid,
    promotionOid: review.promotionOid,
  });
  if (!promoted.ok) return { ...promoted, mutation: "wal" };
  fault?.("after-promotion", review);
  if (promotionRecord.body === undefined) {
    const recorded = appendRecord("promotion-applied", promotionBody, reviewedAt);
    if (!recorded?.ok) return fail(recorded?.code ?? "AFK-PROMOTION-UNRECORDED", null, "wal+feature-ref");
  }
  for (let index = 0; index < expectedReceipts.length; index += 1) {
    const { receipt, body, existing } = expectedReceipts[index];
    if (existing === undefined) {
      const recorded = appendRecord("entry-receipt", body, reviewedAt);
      if (!recorded?.ok) return fail(recorded?.code ?? "AFK-ENTRY-RECEIPT-UNRECORDED", null, "wal+feature-ref");
    }
    fault?.("after-entry-receipt", { index, receipt });
  }
  let completed = null;
  if (completeRecord.body === undefined) {
    completed = appendRecord("review-complete", completeBody, reviewedAt);
    if (!completed?.ok) return fail(completed?.code ?? "AFK-REVIEW-COMPLETE-UNRECORDED", null, "wal+feature-ref");
  }
  if (typeof refreshProjection === "function") {
    try { refreshProjection({ review, complete: completed, status: "complete" }); } catch {
      return fail("AFK-PROJECTION-REFRESH-FAILED", null, "wal+feature-ref");
    }
  }
  return { ok: true, status: "complete", mutation: promoted.mutation === "none" ? "wal" : "wal+feature-ref", review, receipts: receiptSha256List };
}

function validProjection(value) {
  return exactKeys(value, [
    "schema", "activationId", "status", "ledgerSequence", "ledgerHeadSha256",
    "privateRefOid", "updatedAt",
  ]) && value.schema === AFK_PROJECTION_SCHEMA && HEX32.test(value.activationId)
    && new Set(["admitted", "active", "review-required", "blocked", "complete"]).has(value.status)
    && Number.isSafeInteger(value.ledgerSequence) && value.ledgerSequence > 0
    && SHA256.test(value.ledgerHeadSha256) && OID.test(value.privateRefOid) && isoTime(value.updatedAt);
}

export function afkGateStatus({ projection = null, ledger = null, receipts = null, operation = "dispatch" } = {}) {
  const absentProjection = projection === null || projection === undefined || projection === "off";
  const absentLedger = ledger === null || ledger === undefined;
  const absentReceipts = receipts === null || receipts === undefined || (Array.isArray(receipts) && receipts.length === 0);
  if (absentProjection && absentLedger && absentReceipts) {
    return { ok: true, status: "off", allowed: true, code: "AFK-GATE-OFF" };
  }
  if (absentProjection || absentLedger || !object(ledger) || ledger.ok !== true
    || !validProjection(projection) || ledger.sequence !== projection.ledgerSequence
    || ledger.headSha256 !== projection.ledgerHeadSha256
    || ledger.activationId !== projection.activationId
    || !Array.isArray(receipts)) {
    return { ok: false, status: "blocked", allowed: RECOVERY_OPERATIONS.has(operation), code: "AFK-GATE-AUTHORITY-MISMATCH" };
  }
  if (!receipts.every((receipt) => validateAfkEntryReceipt(receipt).ok
    && receipt.activationId === projection.activationId)) {
    return { ok: false, status: "blocked", allowed: RECOVERY_OPERATIONS.has(operation), code: "AFK-GATE-RECEIPT-INVALID" };
  }
  if (projection.status === "complete") {
    return { ok: true, status: "complete", allowed: true, code: "AFK-GATE-COMPLETE" };
  }
  if (projection.status === "active") {
    const allowed = operation === "afk-worker" || RECOVERY_OPERATIONS.has(operation);
    return { ok: allowed, status: "active", allowed, code: allowed ? "AFK-GATE-ACTIVE" : "AFK-GATE-ACTIVE-BLOCK" };
  }
  const recovery = RECOVERY_OPERATIONS.has(operation);
  return {
    ok: recovery,
    status: projection.status,
    allowed: recovery,
    code: recovery ? "AFK-GATE-RECOVERY-ONLY" : "AFK-GATE-INCOMPLETE-BLOCK",
  };
}

export function classifyWorkflowAfkGate(input) {
  const operation = input?.operation;
  if (!NORMAL_OPERATIONS.has(operation) && !RECOVERY_OPERATIONS.has(operation) && operation !== "afk-worker") {
    return fail("AFK-GATE-OPERATION-INVALID");
  }
  return afkGateStatus(input);
}
