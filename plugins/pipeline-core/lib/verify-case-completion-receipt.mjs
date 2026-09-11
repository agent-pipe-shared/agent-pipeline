// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";

export const VERIFY_CASE_COMPLETION_POLICY_SCHEMA = "pipeline.verify-case-completion-policy.v1";
export const VERIFY_CASE_COMPLETION_ATTESTATION_SCHEMA = "pipeline.verify-case-completion-attestation.v1";

const TEST_SCHEMA = "pipeline.test-case-completion.v1";
const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/u;
const DISPOSITIONS = new Set(["pass", "fail", "skip", "todo"]);

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function digest(value) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function sortedUniqueIds(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 2_048
    && value.every((id, index) => ID.test(id) && (index === 0 || value[index - 1] < id));
}

export function validateVerifyCaseCompletionPolicy(value) {
  return exact(value, ["schema", "caseIds", "maxBytes"])
    && value.schema === VERIFY_CASE_COMPLETION_POLICY_SCHEMA
    && sortedUniqueIds(value.caseIds)
    && Number.isSafeInteger(value.maxBytes) && value.maxBytes >= 512 && value.maxBytes <= 1_048_576;
}

export function verifyCaseCompletionPolicySha256(value) {
  if (!validateVerifyCaseCompletionPolicy(value)) throw new TypeError("VERIFY-CASE-COMPLETION-POLICY");
  return digest(value);
}

export function validateVerifyCaseCompletionAttestation(value) {
  return exact(value, ["schema", "status", "policySha256", "caseSetSha256", "dispositionsSha256", "declaredCount", "disposedCount", "counts"])
    && value.schema === VERIFY_CASE_COMPLETION_ATTESTATION_SCHEMA && value.status === "complete"
    && SHA256.test(value.policySha256) && SHA256.test(value.caseSetSha256) && SHA256.test(value.dispositionsSha256)
    && Number.isSafeInteger(value.declaredCount) && value.declaredCount > 0
    && value.disposedCount === value.declaredCount
    && exact(value.counts, ["pass", "fail", "skip", "todo"])
    && Object.values(value.counts).every((count) => Number.isSafeInteger(count) && count >= 0)
    && Object.values(value.counts).reduce((sum, count) => sum + count, 0) === value.declaredCount;
}

export function parseVerifyCaseCompletion(bytes, policy) {
  if (!validateVerifyCaseCompletionPolicy(policy)) throw new TypeError("VERIFY-CASE-COMPLETION-POLICY");
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > policy.maxBytes) throw new Error("VERIFY-CASE-COMPLETION-BOUNDS");
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n") || Buffer.byteLength(text, "utf8") !== bytes.length) throw new Error("VERIFY-CASE-COMPLETION-ENCODING");
  let records;
  try { records = text.slice(0, -1).split("\n").map((line) => JSON.parse(line)); }
  catch { throw new Error("VERIFY-CASE-COMPLETION-JSON"); }
  const declared = records[0];
  const terminal = records.at(-1);
  if (!exact(declared, ["schema", "event", "caseIds", "caseCount", "caseSetSha256"])
    || declared.schema !== TEST_SCHEMA || declared.event !== "DECLARED"
    || canonical(declared.caseIds) !== canonical(policy.caseIds) || declared.caseCount !== policy.caseIds.length
    || declared.caseSetSha256 !== digest(policy.caseIds)) throw new Error("VERIFY-CASE-COMPLETION-DECLARATION");
  if (!exact(terminal, ["schema", "event", "declaredCount", "disposedCount", "caseIds", "caseSetSha256", "dispositionsSha256", "counts"])
    || terminal.schema !== TEST_SCHEMA || terminal.event !== "TERMINAL") throw new Error("VERIFY-CASE-COMPLETION-TERMINAL");
  const disposed = records.slice(1, -1);
  if (disposed.length !== policy.caseIds.length) throw new Error("VERIFY-CASE-COMPLETION-COUNT");
  const ordered = [];
  for (const [ordinal, record] of disposed.entries()) {
    if (!exact(record, ["schema", "event", "id", "ordinal", "disposition"])
      || record.schema !== TEST_SCHEMA || record.event !== "DISPOSED"
      || record.id !== policy.caseIds[ordinal] || record.ordinal !== ordinal || !DISPOSITIONS.has(record.disposition)) {
      throw new Error("VERIFY-CASE-COMPLETION-DISPOSITION");
    }
    ordered.push({ id: record.id, disposition: record.disposition });
  }
  const counts = { pass: 0, fail: 0, skip: 0, todo: 0 };
  for (const entry of ordered) counts[entry.disposition] += 1;
  if (terminal.declaredCount !== policy.caseIds.length || terminal.disposedCount !== policy.caseIds.length
    || canonical(terminal.caseIds) !== canonical(policy.caseIds) || terminal.caseSetSha256 !== digest(policy.caseIds)
    || terminal.dispositionsSha256 !== digest(ordered) || canonical(terminal.counts) !== canonical(counts)) {
    throw new Error("VERIFY-CASE-COMPLETION-TERMINAL-MISMATCH");
  }
  return Object.freeze({
    schema: VERIFY_CASE_COMPLETION_ATTESTATION_SCHEMA,
    status: "complete",
    policySha256: verifyCaseCompletionPolicySha256(policy),
    caseSetSha256: terminal.caseSetSha256,
    dispositionsSha256: terminal.dispositionsSha256,
    declaredCount: terminal.declaredCount,
    disposedCount: terminal.disposedCount,
    counts: Object.freeze({ ...counts }),
  });
}
