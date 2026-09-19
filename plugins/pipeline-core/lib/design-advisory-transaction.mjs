// SPDX-License-Identifier: SUL-1.0

/**
 * The single durable hand-off from a runner's Advisor transport to the public
 * design-advisory projection.  The projection is deliberately readable and
 * versioned with the package; it is not itself authority.  A consumer must
 * also read the matching immutable, repository-private transaction below.
 *
 * This closes the tempting but unsafe shortcut of writing
 * `project/design-advisory-admission.json` by hand: a public record without
 * its exact private receipt is a diagnostic, never an admission.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, fsyncSync, closeSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { validateAdvisoryReceipt } from "./advisory-receipt.mjs";
import { DESIGN_ADVISORY_RECORD_PATH, DESIGN_ADVISORY_RECORD_SCHEMA, evaluateDesignAdvisoryRecord } from "./design-advisory-enforcement.mjs";

export const DESIGN_ADVISORY_TRANSACTION_SCHEMA = "pipeline.design-advisory-transaction.v1";
export const DESIGN_ADVISORY_RECEIPT_DIRECTORY = "agent-pipeline/design-advisory-receipts";
export const DESIGN_ADVISORY_TRANSACTION_DIRECTORY = "agent-pipeline/design-advisory-transactions";

const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._/@:-]+$/u;

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function exact(value, names) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name)); }
function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function canonical(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function isInside(root, path) { const rel = relative(root, path); return rel !== "" && rel !== ".." && !rel.startsWith(`..${"/"}`) && !rel.startsWith("..\\"); }
function physicalDirectory(path, code) {
  let info;
  try { info = lstatSync(path); } catch { fail(code, "required directory is unavailable"); }
  if (!info.isDirectory() || info.isSymbolicLink()) fail(code, "directory is not physical");
  return resolve(path);
}
function physicalFile(path, code) {
  let info;
  try { info = lstatSync(path); } catch { fail(code, "required file is unavailable"); }
  if (!info.isFile() || info.isSymbolicLink()) fail(code, "file is not a physical regular file");
  return info;
}
function safeRelativePath(value, label) {
  if (typeof value !== "string" || !PATH.test(value)) fail("DAA-PATH", `${label} is not a normalized repository path`);
  return value;
}
function bytesAt(root, relativePath, code) {
  const path = resolve(root, safeRelativePath(relativePath, code));
  if (!isInside(root, path)) fail("DAA-PATH", `${code} escapes the repository`);
  physicalFile(path, code);
  try { return readFileSync(path); } catch { fail(code, "file cannot be read"); }
}
function checkedRoot(root) {
  const absolute = resolve(root);
  physicalDirectory(absolute, "DAA-ROOT");
  return absolute;
}
function checkedCommonDir(common) {
  if (!isAbsolute(common)) fail("DAA-COMMON", "git common directory must be absolute");
  const absolute = resolve(common);
  physicalDirectory(absolute, "DAA-COMMON");
  return absolute;
}
function checkedReceiptId(value) {
  if (!ID.test(value ?? "")) fail("DAA-RECEIPT-ID", "receipt id is invalid");
  return value;
}
function receiptPath(common, receiptId) { return join(common, DESIGN_ADVISORY_RECEIPT_DIRECTORY, `${checkedReceiptId(receiptId)}.json`); }
function transactionPath(common, publicSha256) {
  if (!SHA256.test(publicSha256 ?? "")) fail("DAA-TRANSACTION-ID", "public record digest is invalid");
  return join(common, DESIGN_ADVISORY_TRANSACTION_DIRECTORY, `${publicSha256}.json`);
}
function parseStrict(bytes, code) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(code, "JSON is malformed or not UTF-8"); }
}
function readExactReceipt(common, receiptId) {
  const target = receiptPath(common, receiptId);
  physicalFile(target, "DAA-RECEIPT-UNAVAILABLE");
  let bytes;
  try { bytes = readFileSync(target); } catch { fail("DAA-RECEIPT-UNAVAILABLE", "private Advisor receipt cannot be read"); }
  const receipt = parseStrict(bytes, "DAA-RECEIPT-INVALID");
  const checked = validateAdvisoryReceipt(receipt);
  // `receiptId` names the coordinator-reserved private target, not the
  // bridge's opaque receiptId.  Requiring those independent identifiers to
  // coincide made a real bridge output unusable; target identity is protected
  // by the immutable coordination record and the exact private file digest.
  if (!checked.ok) fail("DAA-RECEIPT-INVALID", "private Advisor receipt does not validate");
  return { path: target, bytes, sha256: sha(bytes), receipt };
}
function expectedRoute(runner, nativeAvailable) {
  if (runner === "claude" && nativeAvailable === true) return "native";
  if (["claude", "codex", "antigravity"].includes(runner)) return "generic-consult";
  fail("DAA-RUNNER", "Advisor runner is unsupported");
}
function makeAdmission({ featureId, planPath, specPath, planSha256, specSha256, receipt, nativeAvailable, disposition, rationale, finalApprovalValid }) {
  if (!ID.test(featureId ?? "") || !OID.test(receipt.dispatch?.candidateCommit ?? "") || !OID.test(receipt.dispatch?.candidateTree ?? "")) fail("DAA-BINDING", "feature or Advisor candidate binding is invalid");
  if (typeof nativeAvailable !== "boolean") fail("DAA-NATIVE-CAPABILITY", "native Advisor capability must be observed");
  const runner = receipt.configuredRoute.runner;
  const route = expectedRoute(runner, nativeAvailable);
  // The staged admission evaluator owns this digest contract.  It hashes the
  // in-memory receipt's JSON representation, not its private file bytes; keep
  // the two identities distinct so formatting changes cannot forge a receipt.
  const receiptSha256 = sha(JSON.stringify(receipt));
  const workflow = {
    schema: "pipeline.design-advisory-admission.v1",
    phase: "initial-design",
    dispatchId: receipt.dispatch.dispatchId,
    candidateCommit: receipt.dispatch.candidateCommit,
    candidateTree: receipt.dispatch.candidateTree,
    designSha256: planSha256,
    evidenceSha256: specSha256,
  };
  const shared = {
    status: receipt.observed.status === "answered" ? "complete" : "unavailable",
    route,
    mode: "fresh-read-only",
    readOnly: true,
    dispatchId: workflow.dispatchId,
    candidateCommit: workflow.candidateCommit,
    candidateTree: workflow.candidateTree,
    designSha256: workflow.designSha256,
    evidenceSha256: workflow.evidenceSha256,
    receiptSha256,
  };
  let admission;
  if (receipt.observed.status === "answered") {
    if (!exact(disposition, ["decision", "rationale"]) || !["accept", "decline"].includes(disposition.decision)
      || typeof disposition.rationale !== "string" || disposition.rationale.trim() === "") fail("DAA-DISPOSITION", "Elephant disposition is required for an answered Advisor");
    admission = {
      workflow,
      runner,
      nativeAvailable,
      advisor: { ...shared, failureCode: null },
      advisorReceipt: receipt,
      elephant: { decision: disposition.decision, rationale: disposition.rationale, dispatchId: workflow.dispatchId, designSha256: planSha256, evidenceSha256: specSha256, advisorReceiptSha256: receiptSha256 },
      finalException: null,
    };
  } else {
    if (disposition !== null || finalApprovalValid !== true) fail("DAA-UNAVAILABLE-FINAL-APPROVAL", "Advisor-unavailable admission requires the exact final PO approval");
    const failures = { unavailable: "route-unavailable", "timed-out": "timeout", "permission-denied": "permission-denied", failed: "invalid-output" };
    const failureCode = failures[receipt.observed.status];
    if (!failureCode) fail("DAA-RECEIPT-STATUS", "Advisor receipt status is not eligible for the unavailable exception");
    admission = {
      workflow,
      runner,
      nativeAvailable,
      advisor: { ...shared, failureCode },
      advisorReceipt: receipt,
      elephant: null,
      finalException: { kind: "advisor-unavailable", approval: "final", oneTime: true, approved: true, rationale: "Exact final PO approval was verified by the sanctioned authority reader.", dispatchId: workflow.dispatchId, designSha256: planSha256, evidenceSha256: specSha256, failureCode },
    };
  }
  const record = { schema: DESIGN_ADVISORY_RECORD_SCHEMA, featureId, planPath, specPath, admission };
  const checked = evaluateDesignAdvisoryRecord({ record, featureId, planPath, specPath, planSha256, specSha256, finalApprovalValid });
  if (!checked.ok) fail("DAA-ADMISSION", `generated Advisor admission is invalid (${checked.code})`);
  return record;
}
function writeNewOrExact(path, bytes, code) {
  if (existsSync(path)) {
    physicalFile(path, code);
    const previous = readFileSync(path);
    if (!previous.equals(bytes)) fail(code, "existing immutable transaction has different bytes");
    return false;
  }
  try { writeFileSync(path, bytes, { flag: "wx", mode: 0o600 }); }
  catch { fail(code, "immutable transaction could not be written"); }
  const observed = readFileSync(path);
  if (!observed.equals(bytes)) fail("DAA-PRIVATE-READBACK", "private transaction readback differs");
  return true;
}
function atomicPublicCas(root, bytes, expectedPublicSha256) {
  if (expectedPublicSha256 !== null && !SHA256.test(expectedPublicSha256 ?? "")) fail("DAA-PUBLIC-CAS", "expected public record digest is invalid");
  const target = join(root, DESIGN_ADVISORY_RECORD_PATH);
  const parent = dirname(target);
  physicalDirectory(parent, "DAA-PUBLIC-PARENT");
  let current = null;
  if (existsSync(target)) { physicalFile(target, "DAA-PUBLIC-PATH"); current = readFileSync(target); }
  const observedSha256 = current === null ? null : sha(current);
  if (observedSha256 !== expectedPublicSha256 && !(current !== null && current.equals(bytes))) fail("DAA-PUBLIC-CAS", "public admission projection changed before publication");
  if (current !== null && current.equals(bytes)) return { written: false, sha256: observedSha256 };
  const temporary = join(parent, `.${basename(target)}.${process.pid}.tmp`);
  let fd;
  try {
    fd = openSync(temporary, "wx", 0o600);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    renameSync(temporary, target);
  } catch (error) {
    if (fd !== undefined) try { closeSync(fd); } catch {}
    try { unlinkSync(temporary); } catch {}
    fail("DAA-PUBLIC-WRITE", "public admission projection could not be written");
  }
  const observed = readFileSync(target);
  if (!observed.equals(bytes)) fail("DAA-PUBLIC-READBACK", "public admission projection readback differs");
  return { written: true, sha256: sha(observed) };
}

/** Build and atomically publish the only supported Advisor admission projection. */
export function writeDesignAdvisoryTransaction({ repoRoot, gitCommonDir, featureId, planPath, specPath, receiptId, nativeAvailable, disposition = null, finalApprovalValid = false, expectedPublicSha256 = null } = {}) {
  const root = checkedRoot(repoRoot);
  const common = checkedCommonDir(gitCommonDir);
  const plan = bytesAt(root, planPath, "DAA-PLAN");
  const spec = bytesAt(root, specPath, "DAA-SPEC");
  const receiptObserved = readExactReceipt(common, receiptId);
  const record = makeAdmission({ featureId, planPath, specPath, planSha256: sha(plan), specSha256: sha(spec), receipt: receiptObserved.receipt, nativeAvailable, disposition, finalApprovalValid });
  const publicBytes = Buffer.from(canonical(record));
  const publicSha256 = sha(publicBytes);
  const transaction = {
    schema: DESIGN_ADVISORY_TRANSACTION_SCHEMA,
    id: publicSha256,
    publicRecordSha256: publicSha256,
    featureId,
    candidate: { commit: receiptObserved.receipt.dispatch.candidateCommit, tree: receiptObserved.receipt.dispatch.candidateTree },
    package: { planPath, planSha256: sha(plan), specPath, specSha256: sha(spec) },
    sourceReceipt: { id: receiptId, sha256: receiptObserved.sha256 },
  };
  const privateBytes = Buffer.from(canonical(transaction));
  const privateDir = join(common, DESIGN_ADVISORY_TRANSACTION_DIRECTORY);
  mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  physicalDirectory(privateDir, "DAA-PRIVATE-DIRECTORY");
  writeNewOrExact(transactionPath(common, publicSha256), privateBytes, "DAA-PRIVATE-COLLISION");
  const publicWrite = atomicPublicCas(root, publicBytes, expectedPublicSha256);
  return Object.freeze({ schema: "pipeline.design-advisory-transaction-write-receipt.v1", id: publicSha256, target: DESIGN_ADVISORY_RECORD_PATH, sha256: publicSha256, written: publicWrite.written, mode: record.admission.advisor.status });
}

/** Re-read the public projection and its immutable private transaction together. */
export function readDesignAdvisoryTransaction({ repoRoot, gitCommonDir, featureId, planPath, specPath, finalApprovalValid = false } = {}) {
  const root = checkedRoot(repoRoot);
  const common = checkedCommonDir(gitCommonDir);
  const plan = bytesAt(root, planPath, "DAA-PLAN");
  const spec = bytesAt(root, specPath, "DAA-SPEC");
  const publicPath = join(root, DESIGN_ADVISORY_RECORD_PATH);
  physicalFile(publicPath, "DAA-PUBLIC-UNAVAILABLE");
  const publicBytes = readFileSync(publicPath);
  const publicSha256 = sha(publicBytes);
  const record = parseStrict(publicBytes, "DAA-PUBLIC-INVALID");
  const evaluated = evaluateDesignAdvisoryRecord({ record, featureId, planPath, specPath, planSha256: sha(plan), specSha256: sha(spec), finalApprovalValid });
  if (!evaluated.ok) fail("DAA-PUBLIC-INVALID", `public Advisor record is invalid (${evaluated.code})`);
  const privatePath = transactionPath(common, publicSha256);
  physicalFile(privatePath, "DAA-PRIVATE-UNAVAILABLE");
  const transaction = parseStrict(readFileSync(privatePath), "DAA-PRIVATE-INVALID");
  if (!exact(transaction, ["schema", "id", "publicRecordSha256", "featureId", "candidate", "package", "sourceReceipt"])
    || transaction.schema !== DESIGN_ADVISORY_TRANSACTION_SCHEMA || transaction.id !== publicSha256 || transaction.publicRecordSha256 !== publicSha256
    || transaction.featureId !== featureId || !exact(transaction.candidate, ["commit", "tree"])
    || transaction.candidate.commit !== record.admission.workflow.candidateCommit || transaction.candidate.tree !== record.admission.workflow.candidateTree
    || !exact(transaction.package, ["planPath", "planSha256", "specPath", "specSha256"])
    || transaction.package.planPath !== planPath || transaction.package.planSha256 !== sha(plan) || transaction.package.specPath !== specPath || transaction.package.specSha256 !== sha(spec)
    || !exact(transaction.sourceReceipt, ["id", "sha256"]) || !ID.test(transaction.sourceReceipt.id ?? "") || !SHA256.test(transaction.sourceReceipt.sha256 ?? "")) {
    fail("DAA-PRIVATE-INVALID", "private Advisor transaction is malformed or stale");
  }
  const receiptObserved = readExactReceipt(common, transaction.sourceReceipt.id);
  if (receiptObserved.sha256 !== transaction.sourceReceipt.sha256 || JSON.stringify(receiptObserved.receipt) !== JSON.stringify(record.admission.advisorReceipt)) fail("DAA-RECEIPT-DRIFT", "private Advisor receipt differs from the public admission binding");
  return Object.freeze({ record, transaction, id: publicSha256, mode: evaluated.mode });
}
