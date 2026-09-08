// SPDX-License-Identifier: SUL-1.0
/**
 * Pure C1 source projection. These joins attest structural source validity,
 * never launch authority, collection completeness, or a live observation.
 */
import { createHash } from "node:crypto";
import { types } from "node:util";
import { parseStrictJson } from "./governance-event.mjs";
import { validateInvocationChain, invocationResolutionKey } from "./invocation-reliability.mjs";
import { validateSelectedSandboxDisposition, selectedSandboxDispositionDigest } from "./selected-sandbox-disposition.mjs";
import { validateCriticReviewHistory } from "./critic-review-lineage.mjs";
import { REVIEW_LIMITS } from "./review-economy.mjs";

const DOCUMENT_BYTES = 1_048_576;
const CALL_BYTES = 16_777_216;
const MAX_DEPTH = 64;
const STATUSES = new Set(["measured", "estimated", "unavailable", "unknown"]);
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const PUBLIC_ID = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u;
const PRIVATE_ID = /(?:^|[._:+-])(?:sk-|gh[pousr]_|github_pat_|AKIA[0-9A-Z]{16})/u;
// Private sentinels prevent a hostile exception from choosing a diagnostic.
const FAILURES = new Map(["SHAPE", "LIMIT", "JSON", "INVOCATION", "REVIEW", "BINDING", "PRIVACY"]
  .map((name) => [Symbol(name), `C1J-${name}`]));
const SENTINELS = Object.fromEntries([...FAILURES].map(([key, code]) => [code.slice(4), key]));
const fail = (name) => { throw SENTINELS[name]; };
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength").get;
const copyBytes = Uint8Array.prototype.set;
const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;

/** Snapshot own data properties only; do not invoke accessors or coercion. */
function contextRecord(value, keys) {
  try {
    if (value === null || typeof value !== "object") fail("SHAPE");
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail("SHAPE");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const names = Reflect.ownKeys(descriptors);
    if (names.length !== keys.length || names.some((key) => typeof key !== "string" || !keys.includes(key))) fail("SHAPE");
    const result = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !Object.hasOwn(descriptor, "value")) fail("SHAPE");
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    fail("SHAPE");
  }
}

function candidateContext(value) {
  if (value === null) return null;
  const candidate = contextRecord(value, ["commit", "tree"]);
  if (![candidate.commit, candidate.tree].every((entry) => typeof entry === "string" && OID.test(entry))
    || candidate.commit.length !== candidate.tree.length) fail("SHAPE");
  return candidate;
}

function scalarString(value) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail("JSON");
    } else if (code >= 0xdc00 && code <= 0xdfff) fail("JSON");
  }
}

function snapshotBytes(value) {
  if (value === null) return null;
  if (typeof value === "string") {
    if (value.length > DOCUMENT_BYTES) fail("LIMIT");
    scalarString(value); // Buffer encoding must never replace lone surrogates.
    if (Buffer.byteLength(value, "utf8") > DOCUMENT_BYTES) fail("LIMIT");
    return Buffer.from(value, "utf8");
  }
  if (!types.isUint8Array(value)) fail("SHAPE");
  let length;
  try { length = byteLength.call(value); } catch { fail("SHAPE"); }
  if (length > DOCUMENT_BYTES) fail("LIMIT");
  const snapshot = new Uint8Array(length);
  try { copyBytes.call(snapshot, value); } catch { fail("SHAPE"); }
  return snapshot;
}

/** Bound recursion before the owning strict parser sees the document. */
function checkDepth(source) {
  let depth = 0, quoted = false, escaped = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{" || char === "[") {
      if (++depth > MAX_DEPTH) fail("LIMIT");
    } else if (char === "}" || char === "]") depth--;
  }
}

function parseDocument(bytes) {
  if (bytes === null) return null;
  let source;
  // Keep the BOM in the decoded text so parseStrictJson rejects it.
  try { source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail("JSON"); }
  checkDepth(source);
  let document;
  try { document = parseStrictJson(source); } catch { fail("JSON"); }
  return { document, sha256: createHash("sha256").update(bytes).digest("hex") };
}

const sourceRoot = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
function publicId(value) {
  if (typeof value !== "string" || !PUBLIC_ID.test(value) || PRIVATE_ID.test(value)) fail("PRIVACY");
}

function invocationRows(source) {
  if (source === null) return [];
  const value = source.document;
  if (!sourceRoot(value, ["request", "attempts", "sandboxDisposition"])) fail("INVOCATION");
  let valid;
  try { valid = validateInvocationChain(value.request, value.attempts).ok; } catch { fail("INVOCATION"); }
  if (!valid) fail("INVOCATION");
  let resolutionKey = null;
  if (value.sandboxDisposition !== null) {
    const disposition = value.sandboxDisposition;
    try { valid = validateSelectedSandboxDisposition(disposition).ok; } catch { fail("INVOCATION"); }
    if (!valid) fail("INVOCATION");
    if (selectedSandboxDispositionDigest(disposition) !== value.request.sandboxDispositionSha256
      || disposition.duty !== value.request.duty) fail("BINDING");
    resolutionKey = invocationResolutionKey(value.request, disposition.fingerprint);
    if (resolutionKey === null) fail("BINDING");
  }
  return value.attempts.map(({ invocationId, attemptId, requestSha256, previousSha256, recordSha256 }) => {
    publicId(invocationId); publicId(attemptId);
    return { invocationId, attemptId, requestSha256, previousSha256, recordSha256, invocationResolutionKey: resolutionKey };
  }).sort((a, b) => ordinal(a.invocationId, b.invocationId) || ordinal(a.attemptId, b.attemptId));
}

function reviewRows(source, candidate) {
  if (source === null) return [];
  const history = source.document;
  if (!Array.isArray(history) || history.length === 0 || history.length > REVIEW_LIMITS.criticRounds + 1) fail("REVIEW");
  let valid;
  try { valid = validateCriticReviewHistory(history).ok; } catch { fail("REVIEW"); }
  if (!valid) fail("REVIEW");
  const latest = history[history.length - 1].candidate;
  if (candidate === null || candidate.commit !== latest.commit || candidate.tree !== latest.tree) fail("BINDING");
  return history.map(({ reviewId, parentReviewId, previousSha256, recordSha256 }) => {
    publicId(reviewId);
    if (parentReviewId !== null) publicId(parentReviewId);
    return { reviewId, parentReviewId, previousSha256, recordSha256 };
  }).sort((a, b) => ordinal(a.reviewId, b.reviewId));
}

/** Validate full source bytes and return only the existing C1 join schemas. */
export function projectC1SourceJoins(input) {
  try {
    const context = contextRecord(input, ["invocationBytes", "reviewBytes", "currentCandidate", "coverage"]);
    const candidate = candidateContext(context.currentCandidate);
    const coverage = contextRecord(context.coverage, ["invocations", "reviews"]);
    if (!STATUSES.has(coverage.invocations) || !STATUSES.has(coverage.reviews)) fail("SHAPE");
    const invocationBytes = snapshotBytes(context.invocationBytes);
    const reviewBytes = snapshotBytes(context.reviewBytes);
    if ((invocationBytes?.byteLength ?? 0) + (reviewBytes?.byteLength ?? 0) > CALL_BYTES) fail("LIMIT");
    for (const [bytes, status] of [[invocationBytes, coverage.invocations], [reviewBytes, coverage.reviews]]) {
      if (bytes === null && status !== "unknown" && status !== "unavailable") fail("BINDING");
    }
    const invocation = parseDocument(invocationBytes), review = parseDocument(reviewBytes);
    const joins = { invocations: invocationRows(invocation), reviews: reviewRows(review, candidate) };
    return { ok: true, code: null, projection: {
      joins, coverage, binding: { candidate },
      sourceSha256: { invocation: invocation?.sha256 ?? null, review: review?.sha256 ?? null },
    } };
  } catch (error) {
    return { ok: false, code: FAILURES.get(error) ?? "C1J-SHAPE", projection: null };
  }
}

