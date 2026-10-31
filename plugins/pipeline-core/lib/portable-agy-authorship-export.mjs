// SPDX-License-Identifier: SUL-1.0
/** PO-signed, redacted bridge from a locally verified Agy Host-Commit to a clone. */
import { agyAuthoredRecordBytes } from "./agy-host-observed-receipt.mjs";
import { readAgyHostObservedReceipt } from "./agy-host-observed-store.mjs";
import { isSafeTaskId } from "./dispatch-record.mjs";
import { canonical } from "./po-approval-proof.mjs";
import { discoverRepository } from "./worktree-lifecycle.mjs";
import { PORTABLE_AGY_AUTHORSHIP_SUBJECT_SCHEMA, agyExact as exact, agyFail as fail, portableAgyAuthorshipExportPath, validSubject, portableAgyAuthorshipIntent } from "./review-admission-read.mjs";
export { PORTABLE_AGY_AUTHORSHIP_EXPORT_SCHEMA, PORTABLE_AGY_AUTHORSHIP_SUBJECT_SCHEMA, PORTABLE_AGY_AUTHORSHIP_INTENT_SCHEMA, PORTABLE_AGY_AUTHORSHIP_EXPORT_DIRECTORY, portableAgyAuthorshipExportPath, portableAgyAuthorshipIntent, verifyPortableAgyAuthorshipExport, readPortableAgyAuthorshipExport } from "./review-admission-read.mjs";

export const PORTABLE_AGY_AUTHORSHIP_REQUEST_SCHEMA = "pipeline.portable-agy-authorship-request.v1";
export function portableAgyAuthorshipRequest(prepared) {
  if (prepared?.ok !== true || !validSubject(prepared.subject)
    || prepared.path !== portableAgyAuthorshipExportPath(prepared.subject.taskId)
    || canonical(prepared.approvalIntent) !== canonical(portableAgyAuthorshipIntent(prepared.subject))) {
    throw new TypeError("portable Agy preparation is invalid");
  }
  return { schema: PORTABLE_AGY_AUTHORSHIP_REQUEST_SCHEMA,
    intentSha256: prepared.approvalIntent.sha256, exportPath: prepared.path,
    subject: prepared.subject, approvalIntent: prepared.approvalIntent };
}

export function validatePortableAgyAuthorshipRequest(request) {
  if (!exact(request, ["schema", "intentSha256", "exportPath", "subject", "approvalIntent"])
    || request.schema !== PORTABLE_AGY_AUTHORSHIP_REQUEST_SCHEMA
    || !validSubject(request.subject)
    || request.exportPath !== portableAgyAuthorshipExportPath(request.subject.taskId)) return false;
  const expected = portableAgyAuthorshipIntent(request.subject);
  return request.intentSha256 === expected.sha256
    && canonical(request.approvalIntent) === canonical(expected);
}

/** Refuses to prepare a positive export unless the local authorship verifier has PASSed. */
export async function preparePortableAgyAuthorshipExport({ root, taskId } = {}) {
  if (typeof root !== "string" || !isSafeTaskId(taskId)) return fail("agy-export-input");
  let repo;
  try { repo = discoverRepository(root); }
  catch { return fail("agy-export-repository-unavailable"); }
  if (repo.start !== repo.primaryRoot) return fail("agy-export-primary-root-required");
  // Dynamic import avoids an initialization cycle with the clone-side verifier.
  const { gitDeps, verifyCommit, VERDICT } = await import("../scripts/dispatch-authorship-verify.mjs");
  const deps = gitDeps({ repoRoot: repo.primaryRoot });
  let record;
  try { record = deps.readRecord(taskId); }
  catch { return fail("agy-export-record-unreadable"); }
  if (record?.schema !== "pipeline.dispatch-record.v4" || record.runner !== "antigravity"
    || record.outcomeClassification?.kind !== "authored-commit" || record.taskId !== taskId
    || !Array.isArray(record.commits) || record.commits.length !== 1) return fail("agy-export-record-invalid");
  const verdict = verifyCommit(record.commits[0], deps);
  if (verdict.verdict !== VERDICT.pass || verdict.classification !== "bound"
    || verdict.modelCheck?.classification !== "host-observed-local") return fail("agy-export-local-pass-required");
  const recordBytes = agyAuthoredRecordBytes(record);
  const stored = readAgyHostObservedReceipt({ commonDir: repo.commonDir, taskId, record, recordBytes });
  if (!stored.ok) return fail("agy-export-private-receipt-unavailable");
  const receipt = stored.receipt;
  const subject = { schema: PORTABLE_AGY_AUTHORSHIP_SUBJECT_SCHEMA,
    purpose: "portable-agy-authorship", taskId, runner: "antigravity",
    model: receipt.model, effort: receipt.effort,
    candidateCommit: receipt.candidateCommit, authoredCommit: receipt.commit,
    authoredTree: receipt.tree, parentCommit: receipt.parent,
    changedPaths: [...receipt.paths], routePolicySha256: receipt.routePolicySha256,
    consentSubjectSha256: receipt.consentSubjectSha256,
    consentRecordSha256: receipt.consentRecordSha256,
    resultSha256: receipt.resultSha256, reportSha256: receipt.reportSha256,
    recordSha256: receipt.recordSha256, hostReceiptSha256: stored.sha256,
    localVerdict: "bound" };
  if (!validSubject(subject)) return fail("agy-export-subject-invalid");
  return { ok: true, code: "agy-export-prepared", path: portableAgyAuthorshipExportPath(taskId),
    subject, approvalIntent: portableAgyAuthorshipIntent(subject) };
}
