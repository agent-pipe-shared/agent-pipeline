// RV-2 (specs/sprint-alfred-epic/spec.md lines 1201-1203): CAS-conflict
// classification of a legacy session-cleanup receipt. Classify-only and
// read-only: this module never creates, writes, renames or deletes anything.
//
// RV-7 wiring TODO: the LOC- codes below (LOC-STATUS-MISMATCH,
// LOC-SCHEMA-MISMATCH, LOC-DIGEST-MISMATCH, LOC-COMPARE-FLAG-FALSE,
// LOC-COMPARE-FLAG-MISSING, LOC-FIELD-MISSING, LOC-RECEIPT-AMBIGUOUS) must be
// registered in lib/recovery-refusal-registry.mjs when RV-7 wiring lands.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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
