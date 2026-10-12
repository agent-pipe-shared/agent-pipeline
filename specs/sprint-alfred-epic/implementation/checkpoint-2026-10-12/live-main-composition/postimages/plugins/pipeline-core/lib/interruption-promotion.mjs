// SPDX-License-Identifier: SUL-1.0
/** Rebuilds and verifies the PO's detached AC-6 promotion approval on every read. */
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { criticalActionSubjectSha256, verifyCriticalActionApprovalRequest } from "./critical-action-approval-request.mjs";
import { readCriticalHumanProofPolicy, verifyAgainstTrustAnchors } from "./critical-human-proof-policy.mjs";
import { canonical } from "./po-approval-proof.mjs";
import { evaluatePromotionEvidence } from "./interruption-receipts.mjs";

export const INTERRUPTION_PROMOTION_APPROVAL_SCHEMA = "pipeline.interruption-promotion-approval.v1";
export const INTERRUPTION_PROMOTION_APPROVAL_PATH = "telemetry/interruption-promotion-approval.json";
const BASELINE_PATH = "telemetry/interruption-baseline.json";
const MAX_BASELINE_BYTES = 1024 * 1024;
const MAX_APPROVAL_BYTES = 64 * 1024;
const MAX_PROOF_BYTES = 128 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Trust follows the installed pipeline session, never the measured target root.
const GOVERNING_SESSION_ROOT = path.resolve(__dirname, "../../..");

const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) => plain(value) && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));
const iso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const digest = (value) => createHash("sha256").update(value).digest("hex");

function readRegularUtf8(fileOrRoot, relativePath, maximum, missingCode, invalidCode) {
  const file = relativePath === null ? path.resolve(fileOrRoot) : path.join(path.resolve(fileOrRoot), relativePath);
  let fd = null;
  try {
    const before = lstatSync(file);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maximum) return { ok: false, code: invalidCode };
    fd = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) {
      return { ok: false, code: invalidCode };
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    const pathAfter = lstatSync(file);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size
      || pathAfter.isSymbolicLink() || pathAfter.nlink !== 1 || pathAfter.dev !== opened.dev || pathAfter.ino !== opened.ino) {
      return { ok: false, code: invalidCode };
    }
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) return { ok: false, code: invalidCode };
    return { ok: true, text };
  } catch (error) {
    return { ok: false, code: error?.code === "ENOENT" ? missingCode : "APR-IO" };
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function baselineSubject(parsed, baselineBytes) {
  if (!exactKeys(parsed, ["requestedWindow", "window", "coverage", "registrySha256", "scope", "limitations", "generatedAt"])) return null;
  if (!exactKeys(parsed.window, ["start", "end"])
    || !exactKeys(parsed.window.start, ["value", "status"])
    || !exactKeys(parsed.window.end, ["value", "status"])
    || !plain(parsed.coverage)
    || !SHA256.test(parsed.registrySha256 ?? "")
    || !exactKeys(parsed.scope, ["featureId", "packageId", "dispatchId"])
    || Object.values(parsed.scope).some((value) => value !== null && (typeof value !== "string" || value.trim() === ""))
    || !Array.isArray(parsed.limitations) || parsed.limitations.some((entry) => typeof entry !== "string")
    || !iso(parsed.generatedAt)) return null;
  if (parsed.requestedWindow !== null && (!exactKeys(parsed.requestedWindow, ["start", "end"])
    || !exactKeys(parsed.requestedWindow.start, ["value", "status"])
    || !exactKeys(parsed.requestedWindow.end, ["value", "status"]))) return null;
  const { start, end } = parsed.window;
  if (!new Set(["measured", "unknown"]).has(start.status) || !new Set(["measured", "unknown"]).has(end.status)
    || (start.value !== null && !iso(start.value)) || (end.value !== null && !iso(end.value))) return null;
  return {
    baselineSha256: digest(baselineBytes), registrySha256: parsed.registrySha256,
    window: structuredClone(parsed.window), coverage: structuredClone(parsed.coverage),
    scope: structuredClone(parsed.scope), limitations: structuredClone(parsed.limitations),
  };
}

function eligible(parsed, baselineText) {
  if (Object.values(parsed.scope).some((value) => value !== null)) return { ok: false, code: "APR-SCOPE-FILTERED" };
  if (Object.keys(parsed.coverage).sort().join(",") !== "followup,receipts"
    || parsed.coverage.receipts !== "measured" || parsed.coverage.followup !== "measured"
    || parsed.window.start.status !== "measured" || parsed.window.end.status !== "measured"
    || parsed.window.start.value === null || parsed.window.end.value === null
    || Date.parse(parsed.window.start.value) > Date.parse(parsed.window.end.value)) {
    return { ok: false, code: "APR-BASELINE-NOT-ELIGIBLE" };
  }
  if (evaluatePromotionEvidence({ baseline: baselineText }) !== "report-only") return { ok: false, code: "APR-BASELINE-INVALID" };
  return { ok: true };
}

function recordShape(record) {
  const subject = record?.subject;
  return exactKeys(record, ["schema", "kind", "mode", "by", "approvedAt", "subject", "subjectSha256", "proof"])
    && record.schema === INTERRUPTION_PROMOTION_APPROVAL_SCHEMA && record.kind === "interruption-promotion"
    && typeof record.mode === "string" && record.mode.trim() !== ""
    && typeof record.by === "string" && record.by.trim() !== "" && record.by.length <= 200
    && iso(record.approvedAt)
    && exactKeys(subject, ["baselineSha256", "registrySha256", "window", "coverage", "scope", "limitations"])
    && SHA256.test(subject.baselineSha256 ?? "") && SHA256.test(subject.registrySha256 ?? "")
    && exactKeys(subject.window, ["start", "end"])
    && exactKeys(subject.window.start, ["value", "status"]) && iso(subject.window.start.value) && subject.window.start.status === "measured"
    && exactKeys(subject.window.end, ["value", "status"]) && iso(subject.window.end.value) && subject.window.end.status === "measured"
    && plain(subject.coverage)
    && exactKeys(subject.scope, ["featureId", "packageId", "dispatchId"])
    && Object.values(subject.scope).every((value) => value === null || (typeof value === "string" && value.trim() !== ""))
    && Array.isArray(subject.limitations) && subject.limitations.every((value) => typeof value === "string")
    && SHA256.test(record.subjectSha256 ?? "") && exactKeys(record.proof, ["request", "signature"]);
}

function refusal(status, code, baselineSha256 = null) {
  return { status, code, baselineSha256, mode: null };
}

function loadCurrentSubject(root) {
  const baselineRead = readRegularUtf8(root, BASELINE_PATH, MAX_BASELINE_BYTES, "APR-BASELINE-MISSING", "APR-BASELINE-INVALID");
  if (!baselineRead.ok) return { ok: false, result: refusal("unavailable", baselineRead.code) };
  const baseline = parseJson(baselineRead.text);
  const subject = baselineSubject(baseline, baselineRead.text);
  if (!subject) return { ok: false, result: refusal("unavailable", "APR-BASELINE-INVALID") };
  const readiness = eligible(baseline, baselineRead.text);
  if (!readiness.ok) return { ok: false, result: refusal(readiness.code === "APR-BASELINE-INVALID" ? "unavailable" : "report-only", readiness.code, subject.baselineSha256) };
  return { ok: true, baseline, baselineText: baselineRead.text, subject };
}

function verifiedProof(request, signature, promotionSubject) {
  if (!plain(request?.value?.action) || !plain(request?.value?.candidate) || !plain(signature)) return { ok: false };
  const policy = readCriticalHumanProofPolicy(GOVERNING_SESSION_ROOT);
  if (!policy.ok) return { ok: false, code: "APR-ANCHOR-UNRESOLVED" };
  const anchors = policy.trustAnchors ?? (policy.trustAnchor ? [policy.trustAnchor] : []);
  let expectedAction;
  try {
    expectedAction = {
      kind: "interruption-promotion",
      subjectSha256: criticalActionSubjectSha256({ kind: "interruption-promotion", candidate: request.value.candidate, subject: promotionSubject }),
      expiresAt: request.value.action.expiresAt,
    };
  } catch { return { ok: false, code: "APR-PROOF-INVALID" }; }
  const trustPolicy = {
    keyReference: signature.keyReference,
    publicKeySha256: typeof signature.publicKey === "string" ? digest(Buffer.from(signature.publicKey, "utf8")) : "",
  };
  const requestCheck = verifyCriticalActionApprovalRequest({
    request: request.value,
    trustPolicy,
    proof: signature,
    expectedCandidate: request.value.candidate,
    expectedAction,
  });
  if (!requestCheck.verified) return { ok: false, code: "APR-PROOF-INVALID" };
  const signatureCheck = verifyAgainstTrustAnchors({ intent: request.value.approvalIntent, anchors, proof: signature });
  return signatureCheck.verified ? { ok: true, by: signature.keyReference } : { ok: false, code: "APR-PROOF-INVALID" };
}

/** Report-only AC-6 subject used by the signed `authorize-critical` request. */
export function readInterruptionPromotionSubject({ root } = {}) {
  if (typeof root !== "string" || root.trim() === "") return { ok: false, code: "APR-IO" };
  const current = loadCurrentSubject(root);
  return current.ok ? { ok: true, subject: current.subject, subjectSha256: digest(Buffer.from(canonical(current.subject), "utf8")) } : { ok: false, ...current.result };
}

/**
 * Agent-side record verb. It accepts only the public request and detached proof
 * emitted by `authorize-critical`; trust and the measured baseline are rebuilt
 * here before the single cache record is atomically replaced.
 */
export function recordInterruptionPromotion({ root, requestPath, proofPath } = {}) {
  if (typeof root !== "string" || root.trim() === "" || typeof requestPath !== "string" || typeof proofPath !== "string") {
    return { ok: false, status: "unavailable", code: "APR-IO" };
  }
  const current = loadCurrentSubject(root);
  if (!current.ok) return { ok: false, status: current.result.status, code: current.result.code };
  const requestRead = readRegularUtf8(requestPath, null, MAX_PROOF_BYTES, "APR-PROOF-MISSING", "APR-PROOF-INVALID");
  const proofRead = readRegularUtf8(proofPath, null, MAX_PROOF_BYTES, "APR-PROOF-MISSING", "APR-PROOF-INVALID");
  if (!requestRead.ok || !proofRead.ok) return { ok: false, status: "report-only", code: requestRead.code ?? proofRead.code };
  const request = parseJson(requestRead.text);
  const signature = parseJson(proofRead.text);
  if (!plain(request) || !plain(signature)) return { ok: false, status: "report-only", code: "APR-PROOF-INVALID" };
  const checked = verifiedProof({ value: request }, signature, current.subject);
  if (!checked.ok) return { ok: false, status: "report-only", code: checked.code ?? "APR-PROOF-INVALID" };
  const subjectSha256 = digest(Buffer.from(canonical(current.subject), "utf8"));
  const record = {
    schema: INTERRUPTION_PROMOTION_APPROVAL_SCHEMA,
    kind: "interruption-promotion",
    mode: "signature",
    by: checked.by,
    approvedAt: new Date().toISOString(),
    subject: current.subject,
    subjectSha256,
    proof: { request, signature },
  };
  if (!recordShape(record) || canonical(request.action) !== canonical({
    kind: "interruption-promotion",
    subjectSha256: criticalActionSubjectSha256({ kind: "interruption-promotion", candidate: request.candidate, subject: current.subject }),
    expiresAt: request.action?.expiresAt,
  })) return { ok: false, status: "report-only", code: "APR-PROOF-INVALID" };

  const rootDir = path.resolve(root);
  const directory = path.join(rootDir, "telemetry");
  const target = path.join(rootDir, INTERRUPTION_PROMOTION_APPROVAL_PATH);
  const temporary = path.join(directory, `.interruption-promotion.${process.pid}.${randomUUID()}.tmp`);
  let fd = null;
  try {
    const dirStat = lstatSync(directory);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) return { ok: false, status: "report-only", code: "APR-IO" };
    try {
      const prior = lstatSync(target);
      if (!prior.isFile() || prior.isSymbolicLink() || prior.nlink !== 1) return { ok: false, status: "report-only", code: "APR-IO" };
    } catch (error) { if (error?.code !== "ENOENT") throw error; }
    const beforeRename = readRegularUtf8(root, BASELINE_PATH, MAX_BASELINE_BYTES, "APR-BASELINE-MISSING", "APR-BASELINE-INVALID");
    if (!beforeRename.ok || digest(Buffer.from(beforeRename.text, "utf8")) !== current.subject.baselineSha256) {
      return { ok: false, status: "report-only", code: "APR-SUBJECT-MISMATCH" };
    }
    fd = openSync(temporary, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
    writeFileSync(fd, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8" });
    fsyncSync(fd);
    closeSync(fd); fd = null;
    renameSync(temporary, target);
    const dirFd = openSync(directory, fsConstants.O_RDONLY);
    try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
  } catch {
    if (fd !== null) closeSync(fd);
    try { unlinkSync(temporary); } catch {}
    return { ok: false, status: "report-only", code: "APR-IO" };
  }
  const readback = checkInterruptionPromotion({ root });
  if (readback.status !== "calibrated-pass" || readback.baselineSha256 !== current.subject.baselineSha256) {
    return { ok: false, status: readback.status, code: readback.code };
  }
  return { ok: true, status: "recorded", code: "APR-RECORD-WRITTEN", path: INTERRUPTION_PROMOTION_APPROVAL_PATH, baselineSha256: current.subject.baselineSha256 };
}

/** Rebuilds and verifies the signed approval on every status read. */
export function checkInterruptionPromotion({ root } = {}) {
  if (typeof root !== "string" || root.trim() === "") return refusal("unavailable", "APR-IO");
  const current = loadCurrentSubject(root);
  if (!current.ok) return current.result;
  const approvalRead = readRegularUtf8(root, INTERRUPTION_PROMOTION_APPROVAL_PATH, MAX_APPROVAL_BYTES, "APR-RECORD-MISSING", "APR-RECORD-INVALID");
  if (!approvalRead.ok) return refusal("report-only", approvalRead.code, current.subject.baselineSha256);
  const record = parseJson(approvalRead.text);
  if (!recordShape(record)) return refusal("report-only", "APR-RECORD-INVALID", current.subject.baselineSha256);
  if (record.mode !== "signature") return refusal("report-only", "APR-MODE-UNSUPPORTED", current.subject.baselineSha256);
  if (canonical(record.subject) !== canonical(current.subject)
    || record.subjectSha256 !== digest(Buffer.from(canonical(current.subject), "utf8"))) {
    return refusal("report-only", "APR-SUBJECT-MISMATCH", current.subject.baselineSha256);
  }
  const checked = verifiedProof({ value: record.proof.request }, record.proof.signature, current.subject);
  if (!checked.ok || record.by !== checked.by) return refusal("report-only", checked.code ?? "APR-PROOF-INVALID", current.subject.baselineSha256);
  const status = evaluatePromotionEvidence({ baseline: current.baselineText, poApproval: { baselineSha256: current.subject.baselineSha256 } });
  return status === "calibrated-pass"
    ? { status, code: "APR-APPROVED", baselineSha256: current.subject.baselineSha256, mode: "signature" }
    : refusal(status === "unavailable" ? "unavailable" : "report-only", "APR-BASELINE-NOT-ELIGIBLE", current.subject.baselineSha256);
}
