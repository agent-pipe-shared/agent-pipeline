// SPDX-License-Identifier: SUL-1.0
/**
 * Shape and byte binding for a future private Agy host observation. This
 * module does not establish who wrote the object: only a host-owned physical
 * store and an independent local readback may confer local authority.
 */
import { createHash } from "node:crypto";
import { canonicalizeJson } from "./governance-event.mjs";
import { declaredPaths, validateDispatchRecord } from "./dispatch-record.mjs";
import { agyAgentTypeForRole, validateAgyFamilyReturnBinding } from "./agy-final-return.mjs";

export const AGY_HOST_OBSERVED_RECEIPT_SCHEMA = "pipeline.agy-host-observed-receipt.v1";
export const AGY_HOST_OBSERVED_TRAILER = "Agy-Host-Observed: v1";
export const AGY_FAMILY_HOST_OBSERVED_RECEIPT_SCHEMA = "pipeline.agy-host-observed-receipt.v2";
export const AGY_FAMILY_HOST_OBSERVED_TRAILER = "Agy-Host-Observed: v2";
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const FIELDS = ["schema", "dispatchId", "sessionId", "descriptorSha256", "candidateCommit",
  "candidateTree",
  "runner", "role", "model", "effort", "routePolicySha256", "consentSubjectSha256",
  "consentDecisionId", "consentRecordSha256", "scope", "inputSha256", "observedAtMs",
  "resultSha256", "resultPath", "resultBytes", "reportSha256", "commit", "parent", "tree",
  "paths", "recordSha256"];
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const agyAuthoredRecordBytes = (record) => Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
function validScope(scope, subject) {
  return exact(scope, ["schema", "dispatchId", "candidate", "role", "requiredPaths",
    "requiredPathSha256", "resultDestination", "routePolicySha256"])
    && scope.schema === "pipeline.agy-implementation-scope.v1"
    && scope.dispatchId === subject.dispatchId && scope.role === subject.role
    && exact(scope.candidate, ["commit", "tree"])
    && scope.candidate.commit === subject.candidateCommit
    && scope.candidate.tree === subject.candidateTree
    && scope.resultDestination === subject.resultPath
    && scope.routePolicySha256 === subject.routePolicySha256
    && Array.isArray(scope.requiredPaths) && scope.requiredPaths.length <= 64
    && scope.requiredPaths.every((path) => typeof path === "string" && path.length > 0)
    && new Set(scope.requiredPaths).size === scope.requiredPaths.length
    && exact(scope.requiredPathSha256, scope.requiredPaths)
    && scope.requiredPaths.every((path) => SHA.test(scope.requiredPathSha256[path]));
}

export function validateAgyHostObservedReceiptShape(receipt, { record = null, recordBytes = null } = {}) {
  const family = receipt?.schema === AGY_FAMILY_HOST_OBSERVED_RECEIPT_SCHEMA;
  if (!exact(receipt, [...FIELDS, "receiptSha256", ...(family ? ["family"] : [])])) return false;
  const { receiptSha256, ...subject } = receipt;
  if (!(family ? subject.schema === AGY_FAMILY_HOST_OBSERVED_RECEIPT_SCHEMA : subject.schema === AGY_HOST_OBSERVED_RECEIPT_SCHEMA) || subject.runner !== "antigravity"
    || agyAgentTypeForRole(subject.role) === null
    || !ID.test(subject.dispatchId ?? "") || !ID.test(subject.sessionId ?? "")
    || !SHA.test(subject.descriptorSha256 ?? "")
    || !OID.test(subject.candidateCommit ?? "") || !OID.test(subject.candidateTree ?? "")
    || !OID.test(subject.commit ?? "")
    || subject.commit === subject.candidateCommit || subject.parent !== subject.candidateCommit
    || !OID.test(subject.tree ?? "") || !ID.test(subject.model ?? "")
    || !ID.test(subject.effort ?? "") || !SHA.test(subject.routePolicySha256 ?? "")
    || !SHA.test(subject.consentSubjectSha256 ?? "") || !ID.test(subject.consentDecisionId ?? "")
    || !SHA.test(subject.consentRecordSha256 ?? "") || !SHA.test(subject.inputSha256 ?? "")
    || !Number.isSafeInteger(subject.observedAtMs) || subject.observedAtMs < 1
    || !(family ? validateAgyFamilyReturnBinding(subject.family, subject) : validScope(subject.scope, subject))
    || !SHA.test(subject.resultSha256 ?? "")
    || typeof subject.resultPath !== "string" || subject.resultPath.startsWith("/")
    || subject.resultPath.includes("\\") || subject.resultPath.split("/").some((part) => !part || part === "." || part === "..")
    || !Number.isSafeInteger(subject.resultBytes) || subject.resultBytes < 1 || subject.resultBytes > 2 * 1024 * 1024
    || !SHA.test(subject.reportSha256 ?? "")
    || !SHA.test(subject.recordSha256 ?? "")
    || !Array.isArray(subject.paths) || subject.paths.length === 0 || subject.paths.length > 64
    || subject.paths.some((path) => typeof path !== "string")
    || new Set(subject.paths).size !== subject.paths.length
    || [...subject.paths].sort().join("\0") !== subject.paths.join("\0")
    || !SHA.test(receiptSha256 ?? "")) return false;
  try { if (receiptSha256 !== sha256(canonicalizeJson(subject))) return false; }
  catch { return false; }
  if (record === null && recordBytes === null) return true;
  if (!record || !Buffer.isBuffer(recordBytes) || sha256(recordBytes) !== subject.recordSha256) return false;
  try { validateDispatchRecord(record); } catch { return false; }
  return record.schema === "pipeline.dispatch-record.v4" && record.runner === "antigravity"
    && record.taskId === subject.dispatchId && record.agentType === agyAgentTypeForRole(subject.role)
    && record.model === subject.model && record.effort === subject.effort
    && record.rulesetSha === subject.routePolicySha256
    && record.candidateCommit === subject.commit && record.resultSha256 === subject.reportSha256
    && record.outcomeClassification?.kind === "authored-commit"
    && Array.isArray(record.commits) && record.commits.length === 1 && record.commits[0] === subject.commit
    && [...(declaredPaths(record) ?? [])].sort().join("\0") === subject.paths.join("\0")
    && recordBytes.equals(agyAuthoredRecordBytes(record));
}

export function draftAgyHostObservedReceipt({ modelWitness, commitReadback, record } = {}) {
  const family = modelWitness?.schema === "pipeline.agy-host-model-witness.v2";
  if (!exact(modelWitness, ["schema", "sessionId", "descriptorSha256", "dispatchId",
    "candidateCommit", "candidateTree", "role", "model", "effort", "routePolicySha256", "resultSha256", "resultPath", "resultBytes",
    "reportSha256", "consentSubjectSha256", "consentDecisionId", "consentRecordSha256", "scope", "inputSha256", "observedAtMs", ...(family ? ["family"] : [])])
    || !(family ? validateAgyFamilyReturnBinding(modelWitness.family, modelWitness) : modelWitness.schema === "pipeline.agy-host-model-witness.v1")
    || !exact(commitReadback, ["ok", "code", "commit", "parent", "tree", "paths"])
    || commitReadback.ok !== true || commitReadback.code !== "AGY-HOST-COMMIT-READBACK-VERIFIED") {
    return { ok: false, code: "AGY-HOST-RECEIPT-INPUT" };
  }
  const subject = { schema: family ? AGY_FAMILY_HOST_OBSERVED_RECEIPT_SCHEMA : AGY_HOST_OBSERVED_RECEIPT_SCHEMA,
    dispatchId: modelWitness.dispatchId, sessionId: modelWitness.sessionId,
    descriptorSha256: modelWitness.descriptorSha256,
    candidateCommit: modelWitness.candidateCommit, candidateTree: modelWitness.candidateTree, runner: "antigravity",
    role: modelWitness.role, model: modelWitness.model, effort: modelWitness.effort,
    routePolicySha256: modelWitness.routePolicySha256,
    consentSubjectSha256: modelWitness.consentSubjectSha256,
    consentDecisionId: modelWitness.consentDecisionId,
    consentRecordSha256: modelWitness.consentRecordSha256,
    scope: structuredClone(modelWitness.scope), inputSha256: modelWitness.inputSha256,
    observedAtMs: modelWitness.observedAtMs,
    resultSha256: modelWitness.resultSha256, resultPath: modelWitness.resultPath,
    resultBytes: modelWitness.resultBytes, reportSha256: modelWitness.reportSha256,
    commit: commitReadback.commit, parent: commitReadback.parent, tree: commitReadback.tree,
    paths: [...commitReadback.paths].sort(), recordSha256: sha256(agyAuthoredRecordBytes(record)), ...(family ? { family: structuredClone(modelWitness.family) } : {}) };
  const receipt = { ...subject, receiptSha256: sha256(canonicalizeJson(subject)) };
  return validateAgyHostObservedReceiptShape(receipt, { record, recordBytes: agyAuthoredRecordBytes(record) })
    ? { ok: true, code: "AGY-HOST-RECEIPT-DRAFT-READY", receipt, authority: "unverified-until-private-readback" }
    : { ok: false, code: "AGY-HOST-RECEIPT-BINDING" };
}
