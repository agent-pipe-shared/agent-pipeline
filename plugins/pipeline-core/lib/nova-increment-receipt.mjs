// SPDX-License-Identifier: SUL-1.0
/**
 * Immutable Nova increment evidence.  This is deliberately a pure compiler:
 * it cannot write an evidence file, discover a Git revision, or activate the
 * next increment.  Those actions remain separate gate operations.
 */
import { canonicalJson, sha256Canonical } from "./review-economy.mjs";

export const NOVA_INCREMENT_RECEIPT_SCHEMA = "pipeline.nova-increment-receipt.v1";
export const NOVA_INCREMENT_READBACK_SCHEMA = "pipeline.nova-increment-readback.v1";
export const NOVA_A_ISSUES = Object.freeze([7, 8, 12, 14, 29, 38, 54, 56, 57]);
export const NOVA_A_PACKAGES = Object.freeze(["nova-a1", "nova-a2", "nova-a3", "nova-a4", "nova-a5", "nova-a6", "nova-a7"]);

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PATH = /^(?!\/)(?!.*\\\\)[A-Za-z0-9._@+/-]{1,512}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value) => typeof value === "string" && SHA.test(value);
const oid = (value) => typeof value === "string" && OID.test(value);
const safePath = (value) => typeof value === "string" && PATH.test(value)
  && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
const timestamp = (value) => typeof value === "string" && ISO.test(value) && Number.isFinite(Date.parse(value));
const candidate = (value) => exact(value, ["commit", "tree"]) && oid(value.commit) && oid(value.tree);
const evidenceRef = (value) => exact(value, ["kind", "path", "fileSha256", "recordSha256"])
  && ID.test(value.kind) && safePath(value.path) && digest(value.fileSha256)
  && (value.recordSha256 === null || digest(value.recordSha256));
const digestRef = (value, kind) => exact(value, ["kind", "path", "sha256"])
  && value.kind === kind && safePath(value.path) && digest(value.sha256);
const equalJson = (left, right) => canonicalJson(left) === canonicalJson(right);
const sorted = (rows, key) => Array.isArray(rows) && rows.length > 0 && rows.length <= 256
  && rows.every((row, index) => index === 0 || key(rows[index - 1]) < key(row));
const immutable = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
};
const NOVA_A_E1_PATHS = Object.freeze([
  "specs/sprint-nova-epic/evidence/nova-a/critic.json",
  "specs/sprint-nova-epic/evidence/nova-a/evidence-manifest.json",
  "specs/sprint-nova-epic/evidence/nova-a/increment-receipt.json",
  "specs/sprint-nova-epic/evidence/nova-a/security.json",
  "specs/sprint-nova-epic/evidence/nova-a/verify.json",
  "specs/sprint-nova-epic/result.md",
]);
const NOVA_A_E2_PATHS = Object.freeze([
  "specs/sprint-nova-epic/evidence/nova-a/increment-readback.json",
  "specs/sprint-nova-epic/evidence/nova-a/po-activation.json",
]);

function validIncrement(value) {
  return exact(value, ["sprint", "phase"]) && value.sprint === "Nova" && value.phase === "A";
}

function validIssues(value) {
  return Array.isArray(value) && value.length === NOVA_A_ISSUES.length
    && value.every((row, index) => exact(row, ["issue", "acceptanceIds", "status", "evidenceSha256"])
      && row.issue === NOVA_A_ISSUES[index] && Array.isArray(row.acceptanceIds) && row.acceptanceIds.length > 0
      && row.acceptanceIds.length <= 256 && row.acceptanceIds.every((id) => ID.test(id))
      && row.acceptanceIds.every((id, acceptanceIndex) => acceptanceIndex === 0 || row.acceptanceIds[acceptanceIndex - 1] < id)
      && row.status === "complete" && digest(row.evidenceSha256));
}

function validPackages(value) {
  return Array.isArray(value) && value.length === NOVA_A_PACKAGES.length
    && value.every((row, index) => exact(row, ["id", "status", "evidenceSha256"])
      && row.id === NOVA_A_PACKAGES[index] && row.status === "complete" && digest(row.evidenceSha256));
}

function validGates(value, testedCandidate) {
  const required = ["security", "verify"];
  return Array.isArray(value) && value.length === required.length && sorted(value, (row) => row.gate)
    && value.every((row, index) => exact(row, ["gate", "candidate", "evidence", "status"])
      && row.gate === required[index] && candidate(row.candidate) && equalJson(row.candidate, testedCandidate)
      && evidenceRef(row.evidence) && row.status === "passed");
}

function validCollisions(value) {
  return exact(value, ["status", "entries"]) && ["none", "reconciled"].includes(value.status)
    && Array.isArray(value.entries) && value.entries.length <= 256
    && value.entries.every((row) => exact(row, ["path", "status", "evidenceSha256"])
      && safePath(row.path) && row.status === "reconciled" && digest(row.evidenceSha256))
    && value.entries.every((row, index) => index === 0 || value.entries[index - 1].path < row.path)
    && (value.status === "none" ? value.entries.length === 0 : value.entries.length > 0);
}

function receiptCode(record) {
  const root = ["schema", "increment", "base", "candidate", "specification", "acceptance", "issues", "backlog", "packages", "gates", "critic", "collisions", "evidenceManifest", "result", "createdAt", "receiptSha256"];
  if (!exact(record, root) || record.schema !== NOVA_INCREMENT_RECEIPT_SCHEMA || !validIncrement(record.increment)
    || !candidate(record.base) || !candidate(record.candidate) || equalJson(record.base, record.candidate)
    || !digestRef(record.specification, "specification") || !digestRef(record.acceptance, "acceptance")
    || !validIssues(record.issues) || !exact(record.backlog, ["status", "evidence"]) || record.backlog.status !== "green" || !evidenceRef(record.backlog.evidence)
    || !validPackages(record.packages) || !validGates(record.gates, record.candidate)
    || !exact(record.critic, ["candidate", "evidence", "lineageSha256", "status"])
    || !candidate(record.critic.candidate) || !equalJson(record.critic.candidate, record.candidate)
    || !evidenceRef(record.critic.evidence) || !digest(record.critic.lineageSha256) || record.critic.status !== "accepted"
    || !validCollisions(record.collisions)
    || !exact(record.evidenceManifest, ["path", "fileSha256", "treeDigest"])
    || !safePath(record.evidenceManifest.path) || !digest(record.evidenceManifest.fileSha256) || !digest(record.evidenceManifest.treeDigest)
    || !exact(record.result, ["candidate", "evidence"]) || !candidate(record.result.candidate) || !equalJson(record.result.candidate, record.candidate) || !evidenceRef(record.result.evidence)
    || !timestamp(record.createdAt) || !digest(record.receiptSha256)) return "NIR-SHAPE";
  const { receiptSha256, ...core } = record;
  return receiptSha256 === sha256Canonical(core) ? null : "NIR-DIGEST";
}

function readbackCode(record, receipt) {
  const root = ["schema", "increment", "receiptPath", "receiptFileSha256", "testedCandidate", "evidenceCommit", "evidenceTree", "evidenceManifestSha256", "status", "observedAt", "recordSha256"];
  if (!exact(record, root) || record.schema !== NOVA_INCREMENT_READBACK_SCHEMA || !validIncrement(record.increment)
    || !safePath(record.receiptPath) || !digest(record.receiptFileSha256) || !candidate(record.testedCandidate)
    || !oid(record.evidenceCommit) || !oid(record.evidenceTree) || !digest(record.evidenceManifestSha256)
    || record.status !== "verified" || !timestamp(record.observedAt) || !digest(record.recordSha256)) return "NIR-READBACK-SHAPE";
  if (record.evidenceCommit === record.testedCandidate.commit || record.evidenceTree === record.testedCandidate.tree) return "NIR-READBACK-SELF-BINDING";
  const { recordSha256, ...core } = record;
  if (recordSha256 !== sha256Canonical(core)) return "NIR-READBACK-DIGEST";
  if (!validateNovaIncrementReceipt(receipt).ok) return "NIR-READBACK-RECEIPT";
  if (!equalJson(record.increment, receipt.increment) || !equalJson(record.testedCandidate, receipt.candidate)
    || record.evidenceManifestSha256 !== receipt.evidenceManifest.fileSha256) return "NIR-READBACK-BINDING";
  return null;
}

export function novaIncrementReceiptDigest(record) {
  return receiptCode(record) ? null : record.receiptSha256;
}

export function validateNovaIncrementReceipt(record) {
  const code = receiptCode(record);
  return code ? { ok: false, code } : { ok: true, code: null };
}

/** Compile a receipt from already-observed, candidate-bound gate facts. */
export function compileNovaIncrementReceipt(input) {
  const keys = ["increment", "base", "candidate", "specification", "acceptance", "issues", "backlog", "packages", "gates", "critic", "collisions", "evidenceManifest", "result", "createdAt"];
  if (!exact(input, keys)) throw new TypeError("NIR-COMPILE-SHAPE");
  const record = { schema: NOVA_INCREMENT_RECEIPT_SCHEMA, ...structuredClone(input), receiptSha256: "0".repeat(64) };
  const { receiptSha256, ...core } = record;
  record.receiptSha256 = sha256Canonical(core);
  const checked = validateNovaIncrementReceipt(record);
  if (!checked.ok) throw new TypeError(checked.code);
  return immutable(record);
}

export function novaIncrementReadbackDigest(record, receipt) {
  return readbackCode(record, receipt) ? null : record.recordSha256;
}

export function validateNovaIncrementReadback(record, receipt) {
  const code = readbackCode(record, receipt);
  return code ? { ok: false, code } : { ok: true, code: null };
}

/**
 * Validates the external E1/E2 topology without adding an enclosing-commit
 * field to either immutable record.  Callers obtain parent/tree/path facts
 * from Git and pass them as a closed observation.
 */
export function validateNovaIncrementGateOnlyAncestry(input) {
  if (!exact(input, ["receipt", "readback", "e1", "e2", "poDecision", "e1ChangedPaths", "e2ChangedPaths"]) || !validateNovaIncrementReceipt(input.receipt).ok || !validateNovaIncrementReadback(input.readback, input.receipt).ok) return { ok: false, code: "NIR-ANCESTRY-SHAPE" };
  const gateCommit = (value) => exact(value, ["commit", "tree", "parentCommit"]) && oid(value.commit) && oid(value.tree) && oid(value.parentCommit);
  const changed = (value, allowed) => Array.isArray(value) && value.length > 0 && value.every((path, index) => safePath(path) && allowed.includes(path) && (index === 0 || value[index - 1] < path));
  if (!gateCommit(input.e1) || !gateCommit(input.e2) || !exact(input.poDecision, ["status", "receiptSha256"]) || input.poDecision.status !== "accepted" || input.poDecision.receiptSha256 !== input.receipt.receiptSha256 || !changed(input.e1ChangedPaths, NOVA_A_E1_PATHS) || !changed(input.e2ChangedPaths, NOVA_A_E2_PATHS)) return { ok: false, code: "NIR-ANCESTRY-SHAPE" };
  if (input.e1.commit !== input.readback.evidenceCommit || input.e1.tree !== input.readback.evidenceTree || input.e1.parentCommit !== input.receipt.candidate.commit || input.e2.parentCommit !== input.e1.commit || input.e1.commit === input.receipt.candidate.commit || input.e2.commit === input.receipt.candidate.commit) return { ok: false, code: "NIR-ANCESTRY-BINDING" };
  if (input.e1ChangedPaths.length !== NOVA_A_E1_PATHS.length || !NOVA_A_E1_PATHS.every((path) => input.e1ChangedPaths.includes(path)) || input.e2ChangedPaths.length !== NOVA_A_E2_PATHS.length || !NOVA_A_E2_PATHS.every((path) => input.e2ChangedPaths.includes(path))) return { ok: false, code: "NIR-ANCESTRY-PATHS" };
  return { ok: true, code: null };
}

/** Compile independent E1 readback evidence; it intentionally has no PO field. */
export function compileNovaIncrementReadback(input) {
  const keys = ["receipt", "receiptPath", "receiptFileSha256", "evidenceCommit", "evidenceTree", "status", "observedAt"];
  if (!exact(input, keys) || !validateNovaIncrementReceipt(input.receipt).ok) throw new TypeError("NIR-READBACK-COMPILE-SHAPE");
  const receipt = input.receipt;
  const record = {
    schema: NOVA_INCREMENT_READBACK_SCHEMA,
    increment: structuredClone(receipt.increment),
    receiptPath: input.receiptPath,
    receiptFileSha256: input.receiptFileSha256,
    testedCandidate: structuredClone(receipt.candidate),
    evidenceCommit: input.evidenceCommit,
    evidenceTree: input.evidenceTree,
    evidenceManifestSha256: receipt.evidenceManifest.fileSha256,
    status: input.status,
    observedAt: input.observedAt,
    recordSha256: "0".repeat(64),
  };
  const { recordSha256, ...core } = record;
  record.recordSha256 = sha256Canonical(core);
  const checked = validateNovaIncrementReadback(record, receipt);
  if (!checked.ok) throw new TypeError(checked.code);
  return immutable(record);
}
