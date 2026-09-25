// SPDX-License-Identifier: SUL-1.0
/** PO-signed, redacted bridge from a locally verified Agy Host-Commit to a clone. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { agyHostGitEnvironment } from "./agy-host-commit-admission.mjs";
import { AGY_HOST_OBSERVED_TRAILER, agyAuthoredRecordBytes } from "./agy-host-observed-receipt.mjs";
import { readAgyHostObservedReceipt } from "./agy-host-observed-store.mjs";
import { verifyAgainstTrustAnchors } from "./critical-human-proof-policy.mjs";
import { isSafeTaskId } from "./dispatch-record.mjs";
import { canonical } from "./po-approval-proof.mjs";
import { discoverRepository } from "./worktree-lifecycle.mjs";

export const PORTABLE_AGY_AUTHORSHIP_EXPORT_SCHEMA = "pipeline.portable-agy-authorship-export.v1";
export const PORTABLE_AGY_AUTHORSHIP_SUBJECT_SCHEMA = "pipeline.portable-agy-authorship-subject.v1";
export const PORTABLE_AGY_AUTHORSHIP_INTENT_SCHEMA = "pipeline.portable-agy-authorship-intent.v1";
export const PORTABLE_AGY_AUTHORSHIP_REQUEST_SCHEMA = "pipeline.portable-agy-authorship-request.v1";
export const PORTABLE_AGY_AUTHORSHIP_EXPORT_DIRECTORY = "project/agy-authorship-exports";
const TRUST_PATH = "project/critical-human-proof.json";
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const digest = (value) => sha256(canonical(value));
const fail = (code) => ({ ok: false, code });

export function portableAgyAuthorshipExportPath(taskId) {
  if (!isSafeTaskId(taskId)) throw new TypeError("portable Agy export task id is unsafe");
  return `${PORTABLE_AGY_AUTHORSHIP_EXPORT_DIRECTORY}/${taskId}.json`;
}

function validSubject(subject) {
  if (!exact(subject, ["schema", "purpose", "taskId", "runner", "model", "effort", "candidateCommit",
    "authoredCommit", "authoredTree", "parentCommit", "changedPaths", "routePolicySha256",
    "consentSubjectSha256", "consentRecordSha256", "resultSha256", "reportSha256",
    "recordSha256", "hostReceiptSha256", "localVerdict"])
    || subject.schema !== PORTABLE_AGY_AUTHORSHIP_SUBJECT_SCHEMA
    || subject.purpose !== "portable-agy-authorship" || subject.runner !== "antigravity"
    || subject.localVerdict !== "bound" || !isSafeTaskId(subject.taskId)
    || typeof subject.model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(subject.model)
    || typeof subject.effort !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(subject.effort)
    || ![subject.candidateCommit, subject.authoredCommit, subject.authoredTree, subject.parentCommit].every((v) => OID.test(v ?? ""))
    || subject.candidateCommit !== subject.parentCommit || subject.authoredCommit === subject.parentCommit
    || ![subject.routePolicySha256, subject.consentSubjectSha256, subject.consentRecordSha256,
      subject.resultSha256, subject.reportSha256, subject.recordSha256, subject.hostReceiptSha256]
      .every((v) => SHA.test(v ?? ""))) return false;
  const paths = subject.changedPaths;
  return Array.isArray(paths) && paths.length > 0 && paths.length <= 64
    && paths.every((path) => typeof path === "string" && path.length > 0
      && !path.startsWith("/") && !path.includes("\\")
      && !path.split("/").some((part) => !part || part === "." || part === ".."))
    && paths.every((path, index) => index === 0 || paths[index - 1] < path);
}

export function portableAgyAuthorshipIntent(subject) {
  if (!validSubject(subject)) throw new TypeError("portable Agy subject is invalid");
  const value = { schema: PORTABLE_AGY_AUTHORSHIP_INTENT_SCHEMA,
    kind: "agy-authorship-export", decision: "approve", purpose: subject.purpose,
    taskId: subject.taskId,
    candidate: { commit: subject.authoredCommit, tree: subject.authoredTree },
    subjectSha256: digest(subject) };
  return { value, sha256: digest(value) };
}

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

export function verifyPortableAgyAuthorshipExport({ exportRecord, taskId, commit, tree, parent,
  changedPaths, trustAnchors } = {}) {
  if (!exact(exportRecord, ["schema", "subject", "approvalIntent", "proof"])
    || exportRecord.schema !== PORTABLE_AGY_AUTHORSHIP_EXPORT_SCHEMA
    || !validSubject(exportRecord.subject) || exportRecord.subject.taskId !== taskId
    || exportRecord.subject.authoredCommit !== commit || exportRecord.subject.authoredTree !== tree
    || exportRecord.subject.parentCommit !== parent
    || canonical(exportRecord.subject.changedPaths) !== canonical(changedPaths)) return fail("agy-export-shape-or-git-binding");
  if (!Array.isArray(trustAnchors) || trustAnchors.length === 0) return fail("agy-export-trust-anchor-missing");
  const expected = portableAgyAuthorshipIntent(exportRecord.subject);
  if (!exact(exportRecord.approvalIntent, ["value", "sha256"])
    || canonical(exportRecord.approvalIntent) !== canonical(expected)) return fail("agy-export-intent-mismatch");
  const checked = verifyAgainstTrustAnchors({ intent: expected, anchors: trustAnchors,
    proof: exportRecord.proof });
  return checked.verified ? { ok: true, code: "agy-export-signature-verified",
    authority: "host-observed-portable", signer: checked.signer } : fail(checked.code);
}

function git(root, args, encoding = "utf8") {
  return execFileSync("git", ["-C", root, ...args], { encoding, timeout: 10_000,
    maxBuffer: 1024 * 1024,
    env: { ...agyHostGitEnvironment(), GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1" },
    stdio: ["ignore", "pipe", "ignore"] });
}

/** Physical, exact-HEAD clone reader; a missing export is not an authorship FAIL. */
export function readPortableAgyAuthorshipExport({ root, taskId, commit, record } = {}) {
  let path;
  try { path = portableAgyAuthorshipExportPath(taskId); }
  catch { return fail("agy-export-task-invalid"); }
  if (typeof root !== "string" || !OID.test(commit ?? "")) return fail("agy-export-input");
  let base;
  try { base = realpathSync(resolve(root)); }
  catch { return fail("agy-export-root-unavailable"); }
  let target = base;
  try {
    for (const segment of path.split("/")) {
      target = join(target, segment);
      const stat = lstatSync(target);
      if (stat.isSymbolicLink()) return fail("agy-export-path-alias");
    }
  } catch (error) {
    return fail(error?.code === "ENOENT" ? "agy-export-missing" : "agy-export-path-unreadable");
  }
  try {
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.size < 1 || stat.size > 128 * 1024) return fail("agy-export-file-invalid");
    const bytes = readFileSync(target);
    if (!bytes.equals(git(base, ["show", `HEAD:${path}`], null))) return fail("agy-export-committed-bytes-differ");
    const exportRecord = JSON.parse(bytes.toString("utf8"));
    if (!bytes.equals(Buffer.from(`${canonical(exportRecord)}\n`, "utf8"))) return fail("agy-export-canonical-bytes-differ");
    if (record !== undefined) {
      const subject = exportRecord.subject;
      const recordPath = `evidence/dispatch-record-${taskId}.json`;
      const evidence = join(base, "evidence");
      const physical = join(evidence, `dispatch-record-${taskId}.json`);
      const expected = agyAuthoredRecordBytes(record);
      const evidenceStat = lstatSync(evidence);
      const recordStat = lstatSync(physical);
      if (!evidenceStat.isDirectory() || evidenceStat.isSymbolicLink()
        || !recordStat.isFile() || recordStat.isSymbolicLink()
        || recordStat.size !== expected.length || !readFileSync(physical).equals(expected)
        || !git(base, ["show", `HEAD:${recordPath}`], null).equals(expected)
        || subject?.recordSha256 !== sha256(expected)
        || record.schema !== "pipeline.dispatch-record.v4"
        || record.outcomeClassification?.kind !== "authored-commit"
        || record.runner !== subject.runner || record.taskId !== taskId
        || record.model !== subject.model || record.effort !== subject.effort
        || record.rulesetSha !== subject.routePolicySha256
        || record.candidateCommit !== commit
        || !Array.isArray(record.commits) || record.commits.length !== 1
        || record.commits[0] !== commit
        || typeof record.report?.text !== "string"
        || record.resultSha256 !== sha256(record.report.text)
        || subject.reportSha256 !== record.resultSha256) {
        return fail("agy-export-record-binding-failed");
      }
    }
    const tree = String(git(base, ["rev-parse", `${commit}^{tree}`])).trim();
    const parent = String(git(base, ["rev-parse", `${commit}^`])).trim();
    const changedPaths = git(base, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", commit])
      .split("\0").filter(Boolean).sort();
    git(base, ["merge-base", "--is-ancestor", commit, "HEAD"]);
    const message = git(base, ["show", "-s", "--format=%B", commit]);
    const lines = message.trimEnd().split(/\r?\n/u);
    if (canonical(lines.slice(-3)) !== canonical([
      `Dispatch: ${taskId} (goldfish)`, AGY_HOST_OBSERVED_TRAILER, "AI-Assisted: true",
    ]) || lines.filter((line) => line === `Dispatch: ${taskId} (goldfish)`).length !== 1
      || lines.filter((line) => line === AGY_HOST_OBSERVED_TRAILER).length !== 1) return fail("agy-export-commit-trailers");
    const policy = JSON.parse(git(base, ["show", `${parent}:${TRUST_PATH}`]));
    const anchors = policy?.schema === "pipeline.critical-human-proof-policy.v3" ? policy.trustAnchors : null;
    return verifyPortableAgyAuthorshipExport({ exportRecord, taskId, commit, tree, parent,
      changedPaths, trustAnchors: anchors });
  } catch { return fail("agy-export-readback-failed"); }
}
