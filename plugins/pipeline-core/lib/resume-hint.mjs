// SPDX-License-Identifier: SUL-1.0
/** Non-authoritative, discardable context for a brief session restart. */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, openSync, renameSync, unlinkSync, writeFileSync, closeSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const RESUME_HINT_SCHEMA = "pipeline.resume-hint.v1";
export const RESUME_HINT_PATH = "project/resume-hint.json";
export const RESUME_HINT_MAX_BYTES = 4_096;
export const RESUME_HINT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_FIELD_BYTES = 480;
const CONTEXT_KEYS = ["intent", "scope", "constraints", "questions"];
const SENSITIVE_OR_CONTROLLED_TEXT = /(?:```|\b(?:user|assistant|system)\s*:|https?:\/\/|\b(?:bearer|api[-_ ]?key|secret|password|credential|token|private key|approval|approved|authori[sz]ed)\b|\b(?:node|git|codex|npm|pnpm|yarn|bash|sh|python|curl)\b\s|[\\/|><$`@:]|\b(?:close[- ]?block|close[- ]?feature|pipeline[- ]?state)\b|\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:ghp_|glpat_|sk-)|(?:AKIA|ASIA)[A-Z0-9]{16}|\b[0-9a-f]{16,}\b|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b)/i;

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function digest(value) { return createHash("sha256").update(canonical(value), "utf8").digest("hex"); }
function validBasis(value) {
  return value === null || (exact(value, ["featureId", "planSha256", "specSha256"])
    && typeof value.featureId === "string" && SAFE_ID.test(value.featureId)
    && SHA256.test(value.planSha256) && SHA256.test(value.specSha256));
}
function validTimestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function opaqueToken(value) {
  return value.split(/\s+/).some((token) => {
    const compact = token.replace(/[^A-Za-z0-9_=-]/g, "");
    if (compact.length < 16) return false;
    const hasLower = /[a-z]/.test(compact); const hasUpper = /[A-Z]/.test(compact); const hasDigit = /\d/.test(compact);
    return /^[A-Z0-9]{16,}$/.test(compact) || (hasLower && hasUpper && hasDigit) || (compact.length >= 24 && (hasDigit || /[_=-]/.test(compact)));
  });
}
function validText(value) {
  return typeof value === "string" && value === value.trim() && value.length > 0
    && !/[\r\n\0]/.test(value) && Buffer.byteLength(value, "utf8") <= MAX_FIELD_BYTES
    && !SENSITIVE_OR_CONTROLLED_TEXT.test(value) && !opaqueToken(value);
}
function validTextList(value, maximum) { return Array.isArray(value) && value.length <= maximum && value.every(validText); }
function validContext(value) {
  return exact(value, CONTEXT_KEYS) && validText(value.intent)
    && validTextList(value.scope, 4) && validTextList(value.constraints, 4) && validTextList(value.questions, 3);
}

export function validateResumeHint(value) {
  if (!exact(value, ["schema", "nonAuthoritative", "context", "createdAt", "basis", "contentSha256"])
    || value.schema !== RESUME_HINT_SCHEMA || value.nonAuthoritative !== true
    || !validContext(value.context) || Buffer.byteLength(canonical(value.context), "utf8") > RESUME_HINT_MAX_BYTES
    || !validTimestamp(value.createdAt) || !validBasis(value.basis) || !SHA256.test(value.contentSha256)) return { ok: false, code: "RH-SCHEMA" };
  const { contentSha256, ...unsigned } = value;
  return digest(unsigned) === contentSha256 ? { ok: true, code: "RH-VALID" } : { ok: false, code: "RH-DIGEST" };
}

export function buildResumeHint({ context, basis = null, createdAt = new Date().toISOString() } = {}) {
  const unsigned = { schema: RESUME_HINT_SCHEMA, nonAuthoritative: true, context, createdAt, basis };
  const candidate = { ...unsigned, contentSha256: digest(unsigned) };
  const checked = validateResumeHint(candidate);
  if (!checked.ok) throw new Error(checked.code);
  return candidate;
}

function basisMatches(hintBasis, observedBasis) {
  if (hintBasis === null || observedBasis === null) return true;
  return hintBasis.featureId === observedBasis.featureId
    && hintBasis.planSha256 === observedBasis.planSha256
    && hintBasis.specSha256 === observedBasis.specSha256;
}

/** Passive observation only: no hint state can alter lifecycle readiness. */
export function inspectResumeHint({ rootDir, basis = null, now = Date.now(), fs = { existsSync, lstatSync, readFileSync } } = {}) {
  const path = join(rootDir, RESUME_HINT_PATH);
  try {
    if (!fs.existsSync(path)) return { status: "absent", hint: null };
    if (!fs.lstatSync(path).isFile()) return { status: "ignored-invalid", hint: null, code: "RH-NONREGULAR" };
    const parsed = JSON.parse(fs.readFileSync(path, "utf8"));
    const checked = validateResumeHint(parsed);
    if (!checked.ok) return { status: "ignored-invalid", hint: null, code: checked.code };
    const aged = now - Date.parse(parsed.createdAt) > RESUME_HINT_MAX_AGE_MS;
    if (aged || !basisMatches(parsed.basis, basis)) return { status: "challenged-stale", hint: parsed, code: aged ? "RH-AGED" : "RH-BASIS-DRIFT" };
    return { status: "available", hint: parsed };
  } catch {
    return { status: "ignored-invalid", hint: null, code: "RH-UNREADABLE" };
  }
}

/** Capture is permitted only after the portable project authority exists. */
export function captureResumeHint({ rootDir, context, basis = null, createdAt, fs = { existsSync, lstatSync, openSync, writeFileSync, closeSync, renameSync } } = {}) {
  const project = join(rootDir, "project");
  if (!fs.existsSync(join(project, "pipeline.yaml"))) throw new Error("RH-PROJECT-UNINITIALIZED");
  const hint = buildResumeHint({ context, basis, ...(createdAt === undefined ? {} : { createdAt }) });
  const target = join(rootDir, RESUME_HINT_PATH);
  const temporary = `${target}.tmp`;
  const fd = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(fd, `${JSON.stringify(hint, null, 2)}\n`, "utf8"); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temporary, target);
  return hint;
}

export function discardResumeHint({ rootDir, fs = { existsSync, lstatSync, unlinkSync } } = {}) {
  const target = join(rootDir, RESUME_HINT_PATH);
  if (!fs.existsSync(target)) return { status: "absent" };
  if (!fs.lstatSync(target).isFile()) return { status: "ignored-invalid", code: "RH-NONREGULAR" };
  fs.unlinkSync(target);
  return { status: "discarded" };
}
