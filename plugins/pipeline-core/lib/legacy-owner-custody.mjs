// RV-2 (specs/sprint-alfred-epic/spec.md lines 1201-1203): CAS-conflict
// classification of a legacy session-cleanup receipt. Classify-only and
// read-only: this module never creates, writes, renames or deletes anything.
//
// RV-3 (spec lines 1204-1206): the detached human proof binds the legacy
// custody authorization. buildLegacyCustodyAuthorization() builds the signed
// package (receipt as sha256 + size or explicit absence, never bytes);
// verifyLegacyCustodyProof() checks a po-approval-proof envelope against an
// externally supplied anchor. The signed intent is a pure function of the
// package. Both functions are synchronous and touch no filesystem.
//
// RV-7 wiring TODO: the LOC- codes below (LOC-STATUS-MISMATCH,
// LOC-SCHEMA-MISMATCH, LOC-DIGEST-MISMATCH, LOC-COMPARE-FLAG-FALSE,
// LOC-COMPARE-FLAG-MISSING, LOC-FIELD-MISSING, LOC-RECEIPT-AMBIGUOUS, and the
// RV-3 codes LOC-SESSION-NOT-ENDED, LOC-PROOF-INVALID,
// LOC-PROOF-SIGNER-MISMATCH, LOC-PROOF-BINDING-MISMATCH) must be registered in
// lib/recovery-refusal-registry.mjs when RV-7 wiring lands.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { canonical, createPoApprovalIntent, verifyPoApprovalProof } from "./po-approval-proof.mjs";
import { CLEANUP_RECEIPT_SCHEMA } from "./worktree-lifecycle.mjs";

const CODES = Object.freeze({
  statusMismatch: "LOC-STATUS-MISMATCH",
  schemaMismatch: "LOC-SCHEMA-MISMATCH",
  digestMismatch: "LOC-DIGEST-MISMATCH",
  compareFlagFalse: "LOC-COMPARE-FLAG-FALSE",
  compareFlagMissing: "LOC-COMPARE-FLAG-MISSING",
  fieldMissing: "LOC-FIELD-MISSING",
  receiptAmbiguous: "LOC-RECEIPT-AMBIGUOUS",
});

const COMPARE_FLAGS = Object.freeze(["statusMatches", "schemaMatches", "digestMatches"]);
const EXPECTED_STATUS = "complete";

function unavailable(code) {
  return { status: "unavailable", code, mutated: false };
}

// Receipt file name rule replicated from cleanupReceiptPath
// (worktree-lifecycle.mjs line 1209): `<sessionId>.json` inside the receipts
// directory. The function is not exported, so the rule is mirrored here.
function receiptFileName(sessionId) {
  return `${sessionId}.json`;
}

function candidateNames(receiptsDirectory, sessionId) {
  let names;
  try {
    names = readdirSync(receiptsDirectory);
  } catch {
    return [];
  }
  const exact = receiptFileName(sessionId);
  return names.filter((name) => name === exact || name.startsWith(`${sessionId}.`)).sort();
}

export function classifyLegacyReceipt({ receiptsDirectory, sessionId, compare } = {}) {
  const names = candidateNames(receiptsDirectory, sessionId);
  if (names.length > 1) return unavailable(CODES.receiptAmbiguous);
  if (names.length === 0) return unavailable(CODES.fieldMissing);

  let receipt;
  try {
    receipt = JSON.parse(readFileSync(join(receiptsDirectory, names[0]), "utf8"));
  } catch {
    return unavailable(CODES.fieldMissing);
  }
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) {
    return unavailable(CODES.fieldMissing);
  }
  for (const field of ["schema", "status", "sessionSha256"]) {
    if (typeof receipt[field] !== "string" || receipt[field] === "") return unavailable(CODES.fieldMissing);
  }

  if (receipt.status !== EXPECTED_STATUS) return unavailable(CODES.statusMismatch);
  if (receipt.schema !== CLEANUP_RECEIPT_SCHEMA) return unavailable(CODES.schemaMismatch);
  const expectedDigest = createHash("sha256").update(Buffer.from(String(sessionId))).digest("hex");
  if (receipt.sessionSha256 !== expectedDigest) return unavailable(CODES.digestMismatch);

  const flags = compare !== null && typeof compare === "object" ? compare : {};
  for (const flag of COMPARE_FLAGS) {
    if (typeof flags[flag] !== "boolean") return unavailable(CODES.compareFlagMissing);
  }
  for (const flag of COMPARE_FLAGS) {
    if (flags[flag] !== true) return unavailable(CODES.compareFlagFalse);
  }

  return { classification: "matching", mutated: false };
}

export const LEGACY_CUSTODY_AUTHORIZATION_SCHEMA = "pipeline.legacy-custody-authorization.v1";

const RV3_CODES = Object.freeze({
  sessionNotEnded: "LOC-SESSION-NOT-ENDED",
  proofInvalid: "LOC-PROOF-INVALID",
  signerMismatch: "LOC-PROOF-SIGNER-MISMATCH",
  bindingMismatch: "LOC-PROOF-BINDING-MISMATCH",
});

const PROOF_KEYS = Object.freeze(["intentSha256", "keyReference", "publicKey", "schema", "signatureBase64"]);
const PROOF_SCHEMA = "pipeline.po-approval-proof.v1";
const DOMAIN_SHA256 = createHash("sha256").update(LEGACY_CUSTODY_AUTHORIZATION_SCHEMA).digest("hex");

function refusal(code) {
  return { ok: false, code };
}

/** The signed intent: a pure function of the package. */
function custodyIntent(pkg) {
  return createPoApprovalIntent({
    kind: "legacy-custody",
    featureId: "legacy-custody",
    planSha256: DOMAIN_SHA256,
    specSha256: DOMAIN_SHA256,
    candidate: pkg.repository,
    policyRevision: "legacy-custody-v1",
    subjectSha256: createHash("sha256").update(canonical(pkg)).digest("hex"),
    decision: pkg.disposition,
  });
}

export function buildLegacyCustodyAuthorization({ repository, receipt, classification, disposition, sessionEnded, casPrecondition } = {}) {
  if (sessionEnded !== true) return refusal(RV3_CODES.sessionNotEnded);
  return structuredClone({
    schema: LEGACY_CUSTODY_AUTHORIZATION_SCHEMA,
    repository,
    receipt,
    classification,
    disposition,
    sessionEnded: true,
    casPrecondition,
  });
}

function wellFormedEnvelope(proof) {
  if (proof === null || typeof proof !== "object" || Array.isArray(proof)) return false;
  const keys = Object.keys(proof).sort();
  if (keys.length !== PROOF_KEYS.length || keys.some((key, index) => key !== PROOF_KEYS[index])) return false;
  if (proof.schema !== PROOF_SCHEMA) return false;
  return ["intentSha256", "keyReference", "publicKey", "signatureBase64"].every(
    (key) => typeof proof[key] === "string" && proof[key] !== "",
  );
}

export function verifyLegacyCustodyProof({ package: pkg, proof, anchor } = {}) {
  if (!wellFormedEnvelope(proof)) return refusal(RV3_CODES.proofInvalid);
  if (anchor === null || typeof anchor !== "object" || typeof anchor.keyReference !== "string" || typeof anchor.publicKeySha256 !== "string") {
    return refusal(RV3_CODES.proofInvalid);
  }
  const observed = createHash("sha256").update(proof.publicKey).digest("hex");
  if (proof.keyReference !== anchor.keyReference || observed !== anchor.publicKeySha256) {
    return refusal(RV3_CODES.signerMismatch);
  }
  let intent;
  try {
    intent = custodyIntent(pkg);
  } catch {
    return refusal(RV3_CODES.bindingMismatch);
  }
  if (proof.intentSha256 !== intent.sha256) return refusal(RV3_CODES.bindingMismatch);
  const result = verifyPoApprovalProof({ intent, trustPolicy: anchor, proof });
  if (result.verified !== true) {
    return refusal(result.code === "PO-APPROVAL-TRUST-MISMATCH" ? RV3_CODES.signerMismatch : RV3_CODES.proofInvalid);
  }
  return { ok: true };
}
