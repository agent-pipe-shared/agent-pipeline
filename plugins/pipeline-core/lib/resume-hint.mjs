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
/**
 * NVA-BL-72: the write side was narrower than what a restart actually needs -- a working
 * card still lost "already-hit guard errors, established workarounds, and the exact state
 * of in-progress work" (the PO's own words after retesting GF-078). `progress` is additive
 * and OPTIONAL, never required: every card captured before this change has exactly the four
 * `CONTEXT_KEYS` and must keep validating unchanged (resume-hint.test.mjs's BASE/`corrected`
 * fixtures), so this cannot become a fifth required key. Same discipline as the other list
 * fields -- distilled statements only, never a transcript, a command line, or a guard denial's
 * raw invocation; a guard CODE plus a distilled resolution is exactly the shape this exists
 * to carry, and the shared FORBIDDEN_SHAPES/secret filters below apply to it unchanged.
 */
const CONTEXT_OPTIONAL_KEYS = ["progress"];
/**
 * Forbidden SHAPES, never the characters those shapes happen to contain. A colon,
 * slash, at-sign, dollar, pipe, backslash or angle bracket inside ordinary prose
 * carries no information; a scheme-qualified URL, an absolute path, a command
 * line, a credential-shaped token, a host address or a transcript marker does.
 * Each entry below is one such form, and every relaxation against the character
 * class this replaced is covered by an admission case in resume-hint.test.mjs.
 */
const SHELL_TOOLS = "node|npx|npm|pnpm|yarn|bun|deno|git|gh|glab|codex|claude|bash|sh|zsh|pwsh|powershell|python3?|pip3?|ruby|perl|curl|wget|ssh|scp|rsync|docker|kubectl|cargo|sudo|chmod|chown|rm|mv|cp|cat|ls|export|eval|source|awk|sed|grep|rg|openssl|gpg|aws|gcloud|az|pipeline-state";
const COMMAND_ARGUMENT = String.raw`-{1,2}[A-Za-z][A-Za-z0-9-]*|[A-Za-z0-9._~-]*\/[A-Za-z0-9._~-]+|[A-Za-z0-9._-]+\.(?:mjs|cjs|js|ts|json|ya?ml|toml|sh|ps1|py|rb|pem|key|env|log|txt|md)\b`;
const SECRET_LABEL = String.raw`api[-_ ]?keys?|access[-_ ]?keys?|secrets?|tokens?|credentials?|passwords?|passphrases?|private[-_ ]?keys?|client[-_ ]?secrets?|authorization`;
const SECRET_ASSIGNMENT = new RegExp(String.raw`\b(?:${SECRET_LABEL})\b\s*([:=]{1,2})\s*(["'\x60]?)([^\s"'\x60]+)`, "gi");
const CLAUSE_END = /[,;.!?|)\]}]/;
const VALUE_ALPHABET = /[A-Za-z]\d|\d[A-Za-z]|[a-z][A-Z]/;
const VALUE_MIN_LENGTH = 10;       // no clause of distilled prose opens on a word this long after a credential label
const VALUE_MIN_DIGIT_LENGTH = 4;  // with a digit inside it, four characters are already enough to be a value
// A closed word class, not a lexicon: English prepositions and coordinating conjunctions are a
// finite set that does not grow. A clause that resumes on one of them has ended a noun phrase, so
// the candidate before it was that noun phrase — the value — and not the opening word of a sentence.
const VALUE_TRAILER = /^\s*(?:about|above|across|after|against|along|among|around|as|at|before|behind|below|beneath|beside|besides|between|beyond|by|despite|down|during|except|for|from|in|inside|into|near|of|off|on|onto|opposite|out|outside|over|past|per|since|than|through|throughout|till|to|toward|towards|under|underneath|until|up|upon|versus|via|with|within|without|and|but|nor|or|plus|so|yet)\b/i;
const FORBIDDEN_SHAPES = [
  /```|~~~/,                                                                                        // fenced code block
  /^\s*(?:user|assistant|system|human|developer|tool)\s*:/i,                                        // transcript role marker opening the text
  /\b(?:user|assistant|system)\s*:.*\b(?:user|assistant|system)\s*:/i,                              // several transcript turns inlined
  /<\s*\/?\s*(?:system|assistant|user|human|instructions?|prompt|script|tool_use|tool_result)\b/i,   // instruction or markup tag
  /\b[a-z][a-z0-9+.-]*:\/\//i,                                                                      // scheme-qualified URL
  /\b(?:javascript|vbscript):|\bdata:[a-z]+\/[a-z0-9.+-]+/i,                                        // executable or inline-payload scheme
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/,                                          // mailbox or ssh target
  /(?:^|[\s"'`(\[{<,;=|:])(?:~|\.{1,2})?\/[A-Za-z0-9._~-]/,                                         // POSIX absolute, home or relative path
  /\b[A-Za-z]:[\\/]|\\\\[A-Za-z0-9._-]+\\|%[A-Za-z_][A-Za-z0-9_]{2,}%/,                             // Windows drive path, UNC share or environment expansion
  /&&|\|\||\$\(|\$\{|\$[A-Z_]{2,}\b|>>|<<|\d?>&\d/,                                                 // shell operator, redirect or expansion
  new RegExp(`(?:^|[\\s"'\\x60(;|&])(?:${SHELL_TOOLS})\\s+(?:${COMMAND_ARGUMENT})`, "i"),           // command line carrying a flag or path argument
  /\bgit\s+(?:add|clone|commit|push|pull|fetch|checkout|switch|restore|branch|merge|rebase|reset|revert|stash|status|log|diff|show|init|config|remote|tag|worktree|cherry-pick|apply)\b/i, // git invocation
  /\b(?:npm|pnpm|yarn|npx|bun|deno|pip3?|cargo|docker|kubectl|brew|apt(?:-get)?)\s+(?:install|uninstall|add|remove|run|exec|ci|test|build|start|publish|login|pull|push|apply)\b/i,        // package or container invocation
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,                                                                    // IPv4 address
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,                                 // JWT
  /\b(?:ghp_|gho_|ghu_|ghs_|github_pat_|glpat[-_]|sk-|xox[baprs]-|AIza)/,                           // vendor credential prefix
  /(?:AKIA|ASIA)[A-Z0-9]{16}/i,                                                                     // AWS key id, deliberately not word-bounded
  /\b[0-9a-f]{16,}\b/i,                                                                             // long hex digest
  new RegExp(String.raw`\bbearer\s+[A-Za-z0-9._~+\/-]{8,}`, "i"),                                   // bearer credential
];

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
/**
 * A credential word next to a value is the leak; the bare word is ordinary design vocabulary.
 * The discriminator is the candidate itself, never what follows it: a value is `=`-assigned, is
 * quoted, is written in an alphabet no English word uses (letters mixed with digits, or an inner
 * capital), is longer than a word prose would open a clause with, or is short but digit-bearing.
 * Trailing words prove nothing — a label, a value and then "for the staging box" is still a leaked
 * value — so the clause-end tests below only ADD forms; they can never rescue a candidate the
 * alphabet and size tests already condemned. A length floor alone cannot tell "swordfish" from
 * "quarterly", which is why it is one union term here and not the whole rule. VALUE_TRAILER is the
 * remaining term, and it is deliberately PARTIAL: it sees a value whose clause resumes on a closed
 * word class, and it is blind to one whose clause resumes on a verb, because no shape separates
 * that from ordinary prose — only a word list would, and none is available here. The residual is
 * pinned as ADMITTED_RESIDUAL in resume-hint.test.mjs so the hole is visible rather than hidden.
 * Ties resolve toward rejection: this card is advisory, discardable and fails open, so the price
 * of over-rejection is one refused sentence, and the price of under-rejection is a credential
 * written into a git-trackable file.
 */
function secretValue(candidate) {
  return VALUE_ALPHABET.test(candidate) || candidate.length >= VALUE_MIN_LENGTH
    || (candidate.length >= VALUE_MIN_DIGIT_LENGTH && /\d/.test(candidate));
}
function secretAssignment(value) {
  for (const match of value.matchAll(SECRET_ASSIGNMENT)) {
    const [assignment, operator, quote, candidate] = match;
    if (operator.includes("=") || quote !== "" || secretValue(candidate)) return true;
    const rest = value.slice(match.index + assignment.length).split(CLAUSE_END, 1)[0];
    if (!/[A-Za-z0-9]/.test(rest) || VALUE_TRAILER.test(rest)) return true;
  }
  return false;
}
function validText(value) {
  return typeof value === "string" && value === value.trim() && value.length > 0
    && !/[\r\n\0]/.test(value) && Buffer.byteLength(value, "utf8") <= MAX_FIELD_BYTES
    && !FORBIDDEN_SHAPES.some((shape) => shape.test(value)) && !secretAssignment(value) && !opaqueToken(value);
}
function validTextList(value, maximum) { return Array.isArray(value) && value.length <= maximum && value.every(validText); }
/** Required keys must all be present; every present key must be required or optional -- never a bare `exact()`. */
function contextKeyShape(value) {
  if (!object(value)) return { missing: CONTEXT_KEYS, unexpected: [] };
  const missing = CONTEXT_KEYS.filter((key) => !Object.hasOwn(value, key));
  const unexpected = Object.keys(value).filter((key) => !CONTEXT_KEYS.includes(key) && !CONTEXT_OPTIONAL_KEYS.includes(key));
  return { missing, unexpected };
}
function validContext(value) {
  const { missing, unexpected } = contextKeyShape(value);
  if (missing.length > 0 || unexpected.length > 0) return false;
  if (!validText(value.intent) || !validTextList(value.scope, 4) || !validTextList(value.constraints, 4) || !validTextList(value.questions, 3)) {
    return false;
  }
  return !Object.hasOwn(value, "progress") || validTextList(value.progress, 4);
}

/**
 * Which field a rejected card actually failed on, as one short clause.
 *
 * `RH-SCHEMA` on its own is the whole answer a caller used to get, and a card is
 * rejected for a reason the caller cannot see: `intent` is a string while the
 * other three are arrays, and a card built with four strings -- the shape a
 * reader of the bootstrap skill produced on 2026-08-09 -- fails with no clue
 * which of the four keys was wrong. The verdict does not become permissive; it
 * becomes answerable.
 *
 * Deliberately shape-only. It never echoes a value: a field can be rejected for
 * carrying a secret or a credential-shaped token, and repeating it in a
 * diagnostic would print the exact thing the validator refused to persist.
 */
export function resumeHintContextDetail(value) {
  if (!object(value)) return "context must be an object";
  const { missing, unexpected } = contextKeyShape(value);
  if (missing.length > 0 || unexpected.length > 0) {
    return `context keys must be exactly ${CONTEXT_KEYS.join(", ")} (optionally also ${CONTEXT_OPTIONAL_KEYS.join(", ")})`
      + `${missing.length > 0 ? `; missing: ${missing.join(", ")}` : ""}`
      + `${unexpected.length > 0 ? `; unexpected: ${unexpected.join(", ")}` : ""}`;
  }
  if (!validText(value.intent)) {
    return "intent must be one non-empty single-line string, free of secrets and opaque tokens";
  }
  for (const [key, maximum] of [["scope", 4], ["constraints", 4], ["questions", 3]]) {
    if (validTextList(value[key], maximum)) continue;
    return Array.isArray(value[key])
      ? `${key} must be at most ${maximum} non-empty single-line strings, free of secrets and opaque tokens`
      : `${key} must be an ARRAY of at most ${maximum} short strings, not a ${typeof value[key]}`;
  }
  if (Object.hasOwn(value, "progress") && !validTextList(value.progress, 4)) {
    return Array.isArray(value.progress)
      ? "progress must be at most 4 non-empty single-line strings, free of secrets and opaque tokens"
      : `progress must be an ARRAY of at most 4 short strings, not a ${typeof value.progress}`;
  }
  return "context is not accepted in this shape";
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
  // The code stays the contract; the clause after it is what makes a rejection
  // actionable. A caller that built the card from the bootstrap skill's own
  // description used to receive the four bare characters `RH-SCHEMA` and had no
  // way to learn that three of the four keys are arrays.
  if (!checked.ok) {
    throw new Error(checked.code === "RH-SCHEMA" ? `${checked.code}: ${resumeHintContextDetail(context)}` : checked.code);
  }
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
