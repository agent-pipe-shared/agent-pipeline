// SPDX-License-Identifier: SUL-1.0
/**
 * ADR-0085 U2 (decisions U and Z): the design review receipt.
 *
 * A receipt is the committed, byte-identical record of one design review round:
 * which sources (PRD, Spec, companions) were reviewed, by which reviewer, against
 * which report, and with which complete set of open findings. Round 1 is an
 * `initial` receipt; round 2 is a `delta` receipt chained to round 1 by path and
 * digest. There is no round 3 (DESIGN_REVIEW_MAX_ROUNDS).
 *
 * The module is pure: no filesystem, no git, no clock (the caller supplies
 * `reviewedAt` and every byte). Receipt bytes are exactly `canonical(receipt)` plus
 * one LF, and the receipt digest is the sha256 of those file bytes. Every failure is
 * a typed `{ ok: false, code }` refusal; nothing here throws on caller data.
 *
 * Import rule (kernel list stays closed; pinned by test case U2-19): this module
 * imports only node:crypto and the `canonical` function of po-approval-proof.mjs.
 *
 * Contract: specs/sprint-alfred-epic/plans/adr-0085-u1-u3-api-contract.md, section 3.
 */
import { createHash } from "node:crypto";
import { canonical } from "./po-approval-proof.mjs";

export const DESIGN_REVIEW_RECEIPT_SCHEMA = "pipeline.design-review-receipt.v1";
export const DESIGN_REVIEW_MAX_ROUNDS = 2;
export const DESIGN_REVIEW_RECEIPT_MAX_BYTES = 65536;

const DELTA_ROUND = 2;
const MAX_COMPANIONS = 64;
const MAX_FINDING_IDS = 64;
const MAX_FINDING_ID_LENGTH = 80;
const MAX_PATH_LENGTH = 240;

const SHA256 = /^[a-f0-9]{64}$/u;
const FEATURE_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const RUNNER = /^[a-z][a-z0-9-]{0,63}$/u;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:\[\]-]{0,127}$/u;
const FINDING_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){1,7}$/u;
const DRIVE_PREFIX = /^[A-Za-z]:/u;

const RECEIPT_KEYS = [
  "featureId", "kind", "openFindingIds", "previousReceiptPath", "previousReceiptSha256", "report",
  "reviewedAt", "reviewer", "round", "schema", "sources", "verdict",
];

// Strict decoding: invalid UTF-8 is not a receipt. `ignoreBOM: true` keeps a leading BOM in the
// text, so a BOM-prefixed file fails JSON parsing instead of being silently normalised.
const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const ENCODER = new TextEncoder();

// ----------------------------------------------------------------------------- primitives

const refuse = (code) => ({ ok: false, code });
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isString = (value) => typeof value === "string";
const isSha256 = (value) => isString(value) && SHA256.test(value);
const compareUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sha256Of = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Own enumerable keys equal the expected set exactly (a closed object). */
function hasExactKeys(value, keys) {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/** Index loop on purpose: Array.prototype.every skips holes of a sparse array. */
function allOf(list, predicate) {
  for (let index = 0; index < list.length; index += 1) if (!predicate(list[index])) return false;
  return true;
}

/** SafePath (contract section 2): 1-240 chars, no surrounding whitespace, no backslash or NUL,
 * not absolute, no drive prefix, no trailing slash, no empty, dot or dot-dot segment. */
function isSafePath(path) {
  if (!isString(path) || path.length < 1 || path.length > MAX_PATH_LENGTH || path !== path.trim()) return false;
  if (path.includes("\\") || path.includes("\0")) return false;
  if (path.startsWith("/") || path.endsWith("/") || DRIVE_PREFIX.test(path)) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function isReviewedAt(value) {
  if (!isString(value)) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

/** Equality of two source sets is equality of their canonical forms. Fails closed. */
function sameSources(a, b) {
  if (!isObject(a) || !isObject(b)) return false;
  try {
    return canonical(a) === canonical(b);
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------- shape checks

const isFeatureId = (value) => isString(value) && FEATURE_ID.test(value);
const isRef = (value) => isObject(value) && hasExactKeys(value, ["path", "sha256"]) && isString(value.path) && isSha256(value.sha256);
const isReviewer = (value) => isObject(value) && hasExactKeys(value, ["model", "runner"]) && isString(value.runner) && RUNNER.test(value.runner) && isString(value.model) && MODEL.test(value.model);
const isSourcesShape = (value) => isObject(value) && hasExactKeys(value, ["companions", "prd", "spec"]) && isRef(value.prd) && isRef(value.spec) && Array.isArray(value.companions) && allOf(value.companions, isRef);
const isStringList = (value) => Array.isArray(value) && allOf(value, isString);
const isPreviousInput = (value) => isObject(value) && hasExactKeys(value, ["bytes", "path"]) && isString(value.path) && value.bytes instanceof Uint8Array;

// ----------------------------------------------------------------------------- semantic checks

/** Every bound path is a SafePath, and the report is a file of its own. */
function pathsAreAcceptable(reportPath, prdPath, specPath, companionPaths, previousPath) {
  const bound = [prdPath, specPath, ...companionPaths];
  if (previousPath !== null) bound.push(previousPath);
  if (!isSafePath(reportPath) || !allOf(bound, isSafePath)) return false;
  return !bound.includes(reportPath);
}

/** Companions are strictly ascending by code unit (so unique), at most 64, and overlap neither
 * the PRD nor the Spec; the PRD and the Spec are different files. */
function sourcesAreAcceptable(prdPath, specPath, companionPaths) {
  if (prdPath === specPath || companionPaths.length > MAX_COMPANIONS) return false;
  for (let index = 0; index < companionPaths.length; index += 1) {
    const path = companionPaths[index];
    if (path === prdPath || path === specPath) return false;
    if (index > 0 && !(companionPaths[index - 1] < path)) return false;
  }
  return true;
}

/** Finding IDs are in the ID pattern, at most 80 chars, strictly ascending by code unit, at most 64. */
function findingIdsAreAcceptable(ids) {
  if (ids.length > MAX_FINDING_IDS) return false;
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (id.length > MAX_FINDING_ID_LENGTH || !FINDING_ID.test(id)) return false;
    if (index > 0 && !(ids[index - 1] < id)) return false;
  }
  return true;
}

/** First failing code of a decoded receipt value, in the contract order, or null. */
function receiptRefusal(receipt) {
  if (!isObject(receipt) || !hasExactKeys(receipt, RECEIPT_KEYS)) return "DRR-SHAPE";
  const { sources, report, previousReceiptPath, previousReceiptSha256 } = receipt;
  const shapeOk = receipt.schema === DESIGN_REVIEW_RECEIPT_SCHEMA
    && isFeatureId(receipt.featureId)
    && (receipt.kind === "initial" || receipt.kind === "delta")
    && Number.isSafeInteger(receipt.round) && receipt.round >= 1
    && (previousReceiptPath === null || isString(previousReceiptPath))
    && (previousReceiptSha256 === null || isSha256(previousReceiptSha256))
    && isSourcesShape(sources)
    && isReviewer(receipt.reviewer)
    && isRef(report)
    && (receipt.verdict === "pass" || receipt.verdict === "open-findings")
    && isStringList(receipt.openFindingIds)
    && isReviewedAt(receipt.reviewedAt);
  if (!shapeOk) return "DRR-SHAPE";
  const companionPaths = sources.companions.map((companion) => companion.path);
  if (!pathsAreAcceptable(report.path, sources.prd.path, sources.spec.path, companionPaths, previousReceiptPath)) return "DRR-PATH";
  if (!sourcesAreAcceptable(sources.prd.path, sources.spec.path, companionPaths)) return "DRR-SOURCES";
  if (!findingIdsAreAcceptable(receipt.openFindingIds)) return "DRR-FINDING-IDS";
  if ((receipt.verdict === "pass") !== (receipt.openFindingIds.length === 0)) return "DRR-VERDICT";
  if (receipt.round > DESIGN_REVIEW_MAX_ROUNDS) return "DRR-ROUND-EXCEEDED";
  const withoutPrevious = previousReceiptPath === null && previousReceiptSha256 === null;
  const withPrevious = previousReceiptPath !== null && previousReceiptSha256 !== null;
  const consistent = receipt.kind === "initial" ? receipt.round === 1 && withoutPrevious : receipt.round === DELTA_ROUND && withPrevious;
  return consistent ? null : "DRR-KIND-ROUND";
}

// ----------------------------------------------------------------------------- public API

/**
 * Parse receipt file bytes. Refusal order: SIZE, JSON, NONCANONICAL, SHAPE, PATH, SOURCES,
 * FINDING-IDS, VERDICT, ROUND-EXCEEDED (round above 2), KIND-ROUND.
 * @param {Uint8Array} bytes
 * @returns {{ ok: true, receipt: object, sha256: string } | { ok: false, code: string }}
 */
export function parseDesignReviewReceipt(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > DESIGN_REVIEW_RECEIPT_MAX_BYTES) return refuse("DRR-SIZE");
  let text;
  let value;
  try {
    text = DECODER.decode(bytes);
    value = JSON.parse(text);
  } catch {
    return refuse("DRR-JSON");
  }
  try {
    if (`${canonical(value)}\n` !== text) return refuse("DRR-NONCANONICAL");
  } catch {
    return refuse("DRR-NONCANONICAL");
  }
  const code = receiptRefusal(value);
  if (code !== null) return refuse(code);
  return { ok: true, receipt: value, sha256: sha256Of(bytes) };
}

/**
 * Build a receipt and its canonical bytes. Sorts finding IDs and companions (code-unit order),
 * rejects duplicates, derives the verdict. `previous: null` makes an initial receipt;
 * `previous: { path, bytes }` makes the round-2 delta receipt chained to it.
 * @returns {{ ok: true, receipt: object, bytes: Uint8Array, sha256: string } | { ok: false, code: string }}
 */
export function createDesignReviewReceipt(input) {
  if (!isObject(input)) return refuse("DRR-SHAPE");
  const { featureId, previous, sources, reviewer, report, openFindingIds, reviewedAt } = input;
  const shapeOk = isFeatureId(featureId)
    && (previous === null || isPreviousInput(previous))
    && isSourcesShape(sources)
    && isReviewer(reviewer)
    && isRef(report)
    && isStringList(openFindingIds)
    && isReviewedAt(reviewedAt);
  if (!shapeOk) return refuse("DRR-SHAPE");

  const companions = sources.companions.map(({ path, sha256 }) => ({ path, sha256 })).sort((a, b) => compareUnits(a.path, b.path));
  const normalized = {
    prd: { path: sources.prd.path, sha256: sources.prd.sha256 },
    spec: { path: sources.spec.path, sha256: sources.spec.sha256 },
    companions,
  };
  const companionPaths = companions.map((companion) => companion.path);
  const previousPath = previous === null ? null : previous.path;
  if (!pathsAreAcceptable(report.path, normalized.prd.path, normalized.spec.path, companionPaths, previousPath)) return refuse("DRR-PATH");
  if (!sourcesAreAcceptable(normalized.prd.path, normalized.spec.path, companionPaths)) return refuse("DRR-SOURCES");
  const ids = [...openFindingIds].sort(compareUnits);
  if (!findingIdsAreAcceptable(ids)) return refuse("DRR-FINDING-IDS");

  let kind = "initial";
  let round = 1;
  let previousReceiptPath = null;
  let previousReceiptSha256 = null;
  if (previous !== null) {
    const parsed = parseDesignReviewReceipt(previous.bytes);
    if (!parsed.ok) return refuse("DRR-DELTA-CHAIN");
    const earlier = parsed.receipt;
    if (earlier.round >= DESIGN_REVIEW_MAX_ROUNDS) return refuse("DRR-ROUND-EXCEEDED");
    if (earlier.featureId !== featureId || earlier.sources.prd.path !== normalized.prd.path || earlier.sources.spec.path !== normalized.spec.path) return refuse("DRR-DELTA-CHAIN");
    if (sameSources(earlier.sources, normalized)) return refuse("DRR-DELTA-UNCHANGED");
    kind = "delta";
    round = DELTA_ROUND;
    previousReceiptPath = previous.path;
    previousReceiptSha256 = parsed.sha256;
  }

  const receipt = {
    schema: DESIGN_REVIEW_RECEIPT_SCHEMA,
    featureId,
    kind,
    round,
    previousReceiptPath,
    previousReceiptSha256,
    sources: normalized,
    reviewer: { runner: reviewer.runner, model: reviewer.model },
    report: { path: report.path, sha256: report.sha256 },
    verdict: ids.length === 0 ? "pass" : "open-findings",
    openFindingIds: ids,
    reviewedAt,
  };
  const bytes = ENCODER.encode(`${canonical(receipt)}\n`);
  // Self-check: what is returned is exactly what parse accepts from these bytes.
  const reparsed = parseDesignReviewReceipt(bytes);
  if (!reparsed.ok) return refuse(reparsed.code);
  return { ok: true, receipt: reparsed.receipt, bytes, sha256: reparsed.sha256 };
}

/**
 * Parse a receipt read from `path` and return the closed summary U1 and U3 consume:
 * the path and file digest plus every receipt field except schema, reviewer and reviewedAt.
 * @returns {{ ok: true, summary: object } | { ok: false, code: string }}
 */
export function summarizeDesignReviewReceipt(input) {
  if (!isObject(input)) return refuse("DRR-SHAPE");
  const { path, bytes } = input;
  const parsed = parseDesignReviewReceipt(bytes);
  if (!parsed.ok) return refuse(parsed.code);
  if (!isSafePath(path)) return refuse("DRR-PATH");
  const receipt = parsed.receipt;
  return {
    ok: true,
    summary: {
      path,
      sha256: parsed.sha256,
      featureId: receipt.featureId,
      kind: receipt.kind,
      round: receipt.round,
      previousReceiptPath: receipt.previousReceiptPath,
      previousReceiptSha256: receipt.previousReceiptSha256,
      sources: receipt.sources,
      report: receipt.report,
      verdict: receipt.verdict,
      openFindingIds: receipt.openFindingIds,
    },
  };
}

/**
 * Compare the sources a receipt was written against with the current sources. Equal canonical
 * forms pass. Any difference (digest, path, added, removed or absent companion) is
 * DRR-SOURCE-DRIFT; `nextRound` is 2 after an initial receipt and null after a delta (PO-Q2
 * option b leaves this module unchanged). Malformed input drifts rather than passes.
 * @returns {{ ok: true } | { ok: false, code: "DRR-SOURCE-DRIFT", nextRound: 2 | null }}
 */
export function checkDesignReviewReceiptSources(input) {
  const summary = isObject(input) ? input.summary : undefined;
  const currentSources = isObject(input) ? input.currentSources : undefined;
  if (isObject(summary) && sameSources(summary.sources, currentSources)) return { ok: true };
  const afterInitial = isObject(summary) && summary.kind === "initial" && summary.round === 1;
  return { ok: false, code: "DRR-SOURCE-DRIFT", nextRound: afterInitial ? DELTA_ROUND : null };
}
