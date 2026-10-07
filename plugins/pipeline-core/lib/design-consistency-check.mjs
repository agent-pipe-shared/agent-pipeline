// SPDX-License-Identifier: SUL-1.0
/**
 * ADR-0085 U1: the design-consistency checker, a pure function over data the caller
 * already read (decisions W, Y and Z of the 2026-10-07 PO decisions).
 *
 *   W  the requirement register is reconciled against `traceability.md`;
 *   Y  an undeclared register (no sidecar) is a visible skip, never a finding;
 *   Z  after a round-2 (delta) review receipt, later source drift is a visible
 *      `review.unreviewedSourceDelta` the PO may sign over knowingly; after a round-1
 *      receipt the same drift stays a binding inconsistency.
 *
 * Import rule (the future kernel module list stays closed): this module imports only
 * `node:crypto`, `canonical` from `./po-approval-proof.mjs` and `TECHNICAL_SPEC_MARKER`
 * from `./po-gate-authority.mjs`. It never imports the review-receipt module (U2), and
 * it does no filesystem, git or clock access: every observation arrives as input data.
 *
 * Contract: specs/sprint-alfred-epic/plans/adr-0085-u1-u3-api-contract.md sections 1, 2
 * and 6. A caller error is thrown as `DesignConsistencyCheckError` (`DCC-INPUT`); an
 * inconsistency in correct input is reported as an Entry, never thrown.
 */
import { createHash } from "node:crypto";

import { canonical } from "./po-approval-proof.mjs";
import { TECHNICAL_SPEC_MARKER } from "./po-gate-authority.mjs";

export const DESIGN_CONSISTENCY_CHECK_SCHEMA = "pipeline.design-consistency-check.v1";

/** Code table order is the primary sort key of every inconsistency list. */
export const DESIGN_CONSISTENCY_CODES = Object.freeze([
  "DCC-PATH-UNSAFE",
  "DCC-PATH-IGNORED",
  "DCC-PATH-UNTRACKED",
  "DCC-PATH-MODIFIED",
  "DCC-PRD-DIGEST-DRIFT",
  "DCC-SPEC-DIGEST-DRIFT",
  "DCC-PRD-MARKER-MISSING",
  "DCC-PRD-MARKER-DUPLICATE",
  "DCC-PRD-MARKER-STALE",
  "DCC-COMPANION-UNBOUND",
  "DCC-REGISTER-INVALID",
  "DCC-ID-DUPLICATE",
  "DCC-COUNT-MISMATCH",
  "DCC-REVIEW-RECEIPT-MISSING",
  "DCC-REVIEW-RECEIPT-BINDING",
  "DCC-REVIEW-ROUND-EXCEEDED",
  "DCC-REVIEW-DELTA-CHAIN",
]);

const CODE_INDEX = new Map(DESIGN_CONSISTENCY_CODES.map((code, index) => [code, index]));

export class DesignConsistencyCheckError extends Error {
  constructor(message) {
    super(message);
    this.name = "DesignConsistencyCheckError";
    this.code = "DCC-INPUT";
  }
}

const fail = (message) => {
  throw new DesignConsistencyCheckError(message);
};

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const FEATURE_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const REQUIREMENT_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){1,7}$/u;
const RT_CODE = /^RT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/u;
const DRR_CODE = /^DRR-[A-Z0-9]+(?:-[A-Z0-9]+)*$/u;
const REQUIREMENT_ID_MAX = 80;
const REGISTER_IDS_MAX = 64;
const COMPANIONS_MAX = 64;
const FINDING_IDS_MAX = 64;
const SAFE_PATH_MAX = 240;
const MAX_REVIEW_ROUNDS = 2;

const INPUT_KEYS = ["submission", "prdBytes", "specBytes", "companions", "traceability", "register", "pathStates", "reviewReceipts"];
const SOURCES_ARGUMENT_KEYS = ["submission", "prdBytes", "specBytes", "companions", "pathStates"];
const SUBMISSION_KEYS = ["featureId", "planPath", "planSha256", "specPath", "specSha256"];
const PATH_STATE_KEYS = ["path", "tracked", "modified", "ignored", "regular", "sha256"];
const SUMMARY_KEYS = ["path", "sha256", "featureId", "kind", "round", "previousReceiptPath", "previousReceiptSha256", "sources", "report", "verdict", "openFindingIds"];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasExactKeys = (value, keys) => isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const isSha = (value) => typeof value === "string" && SHA256_HEX.test(value);
const isRequirementId = (value) => typeof value === "string" && value.length <= REQUIREMENT_ID_MAX && REQUIREMENT_ID.test(value);
const compareUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sha256Of = (value) => createHash("sha256").update(value).digest("hex");
const decodeUtf8 = (bytes) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
const isStub = (receipt) => Object.hasOwn(receipt, "refusal");

/** SafePath of the contract: a repository-relative, forward-slash path without traversal. */
function isSafePath(path) {
  if (typeof path !== "string" || path.length < 1 || path.length > SAFE_PATH_MAX || path !== path.trim()) return false;
  if (path.includes("\\") || path.includes("\0")) return false;
  if (path.startsWith("/") || /^[A-Za-z]:/u.test(path) || path.endsWith("/")) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function traceabilityPathFor(specPath) {
  const slash = specPath.lastIndexOf("/");
  return slash < 0 ? "traceability.md" : `${specPath.slice(0, slash)}/traceability.md`;
}

function makeEntry(code, { path = null, ids = [], expected = null, observed = null } = {}) {
  return { code, path, ids: [...ids].sort(compareUnits), expected, observed };
}

function compareNullableUnits(a, b) {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return compareUnits(a, b);
}

function compareEntries(a, b) {
  return (CODE_INDEX.get(a.code) - CODE_INDEX.get(b.code))
    || compareNullableUnits(a.path, b.path)
    || compareUnits(a.ids.join(","), b.ids.join(","))
    || compareNullableUnits(a.expected, b.expected)
    || compareNullableUnits(a.observed, b.observed);
}

// ---------------------------------------------------------------------------
// Input validation (every failure is a caller error: DCC-INPUT)
// ---------------------------------------------------------------------------

function assertSubmission(submission) {
  if (!hasExactKeys(submission, SUBMISSION_KEYS)) fail("submission must be an object with exactly the submission keys");
  if (typeof submission.featureId !== "string" || !FEATURE_ID.test(submission.featureId)) fail("submission.featureId is malformed");
  if (typeof submission.planPath !== "string" || typeof submission.specPath !== "string") fail("submission paths must be strings");
  if (submission.planPath === submission.specPath) fail("submission.planPath and submission.specPath must differ");
  if (!isSha(submission.planSha256) || !isSha(submission.specSha256)) fail("submission digests must be lowercase sha256 hex");
}

function assertBytes(value, label) {
  if (!(value instanceof Uint8Array)) fail(`${label} must be a Uint8Array`);
}

function assertCompanions(companions, submission) {
  if (!Array.isArray(companions)) fail("companions must be an array");
  if (companions.length > COMPANIONS_MAX) fail(`companions may hold at most ${COMPANIONS_MAX} paths`);
  const seen = new Set();
  for (const path of companions) {
    if (typeof path !== "string") fail("every companion must be a string path");
    if (seen.has(path)) fail("companions must be unique");
    if (path === submission.planPath || path === submission.specPath) fail("companions must not contain the PRD or Spec path");
    seen.add(path);
  }
}

function assertPathState(state) {
  if (!hasExactKeys(state, PATH_STATE_KEYS) || typeof state.path !== "string") fail("a pathStates entry is malformed");
  for (const flag of ["tracked", "modified", "ignored", "regular"]) {
    if (typeof state[flag] !== "boolean") fail(`pathStates ${flag} must be a boolean`);
  }
  if (state.sha256 !== null && !isSha(state.sha256)) fail("pathStates sha256 must be lowercase sha256 hex or null");
  if (state.tracked && state.ignored) fail("a path cannot be tracked and ignored at once");
}

function indexPathStates(pathStates) {
  if (!Array.isArray(pathStates)) fail("pathStates must be an array");
  const byPath = new Map();
  for (const state of pathStates) {
    assertPathState(state);
    if (byPath.has(state.path)) fail("pathStates must hold at most one entry per path");
    byPath.set(state.path, state);
  }
  return byPath;
}

function assertTraceability(traceability, specPath) {
  if (traceability === null) return;
  if (!hasExactKeys(traceability, ["path", "bytes"]) || typeof traceability.path !== "string") fail("traceability must be null or { path, bytes }");
  assertBytes(traceability.bytes, "traceability.bytes");
  if (traceability.path !== traceabilityPathFor(specPath)) fail("traceability.path must be <spec directory>/traceability.md");
}

function assertRegister(register, traceability) {
  if (!isObject(register)) fail("register must be an object");
  if (register.mode === "declared") {
    if (!hasExactKeys(register, ["mode", "mapPath", "ids"]) || typeof register.mapPath !== "string") fail("a declared register is { mode, mapPath, ids }");
    if (!Array.isArray(register.ids) || register.ids.length > REGISTER_IDS_MAX) fail(`register.ids must be an array of at most ${REGISTER_IDS_MAX} identifiers`);
    if (!register.ids.every(isRequirementId)) fail("register.ids holds an identifier that breaks the requirement id pattern");
    if (new Set(register.ids).size !== register.ids.length) fail("register.ids must be unique");
  } else if (register.mode === "undeclared") {
    if (!hasExactKeys(register, ["mode", "mapPath"]) || typeof register.mapPath !== "string") fail("an undeclared register is { mode, mapPath }");
  } else if (register.mode === "invalid") {
    if (!hasExactKeys(register, ["mode", "mapPath", "rtCode"]) || typeof register.mapPath !== "string") fail("an invalid register is { mode, mapPath, rtCode }");
    if (typeof register.rtCode !== "string" || !RT_CODE.test(register.rtCode)) fail("register.rtCode is malformed");
  } else {
    fail("register.mode must be declared, undeclared or invalid");
  }
  if (register.mode !== "undeclared" && traceability === null) fail("a declared or invalid register needs the traceability file");
}

/** A SourceSet; `allowNull` admits the null digest of an absent file (current sources only). */
function assertSourceSet(set, label, allowNull) {
  if (!hasExactKeys(set, ["prd", "spec", "companions"])) fail(`${label} must be a SourceSet`);
  for (const role of ["prd", "spec"]) {
    if (!hasExactKeys(set[role], ["path", "sha256"]) || typeof set[role].path !== "string" || !isSha(set[role].sha256)) fail(`${label}.${role} is malformed`);
  }
  if (set.prd.path === set.spec.path) fail(`${label} must bind distinct PRD and Spec paths`);
  if (!Array.isArray(set.companions) || set.companions.length > COMPANIONS_MAX) fail(`${label}.companions is malformed`);
  let previous = null;
  for (const companion of set.companions) {
    if (!hasExactKeys(companion, ["path", "sha256"]) || typeof companion.path !== "string") fail(`${label}.companions holds a malformed entry`);
    if (!(isSha(companion.sha256) || (allowNull && companion.sha256 === null))) fail(`${label}.companions holds a malformed digest`);
    if (companion.path === set.prd.path || companion.path === set.spec.path) fail(`${label}.companions must not repeat the PRD or Spec path`);
    if (previous !== null && compareUnits(previous, companion.path) >= 0) fail(`${label}.companions must be sorted and unique`);
    previous = companion.path;
  }
}

function assertSummary(summary) {
  if (!hasExactKeys(summary, SUMMARY_KEYS)) fail("a review receipt summary must carry exactly the ReceiptSummary keys");
  if (typeof summary.path !== "string" || !isSha(summary.sha256)) fail("a review receipt summary path or digest is malformed");
  if (typeof summary.featureId !== "string" || !FEATURE_ID.test(summary.featureId)) fail("a review receipt summary featureId is malformed");
  const linkPath = summary.previousReceiptPath;
  const linkSha = summary.previousReceiptSha256;
  if (summary.kind === "initial") {
    if (summary.round !== 1 || linkPath !== null || linkSha !== null) fail("an initial receipt summary is round 1 without a previous link");
  } else if (summary.kind === "delta") {
    if (summary.round !== 2 || typeof linkPath !== "string" || !isSha(linkSha)) fail("a delta receipt summary is round 2 with a previous link");
  } else {
    fail("a review receipt summary kind must be initial or delta");
  }
  assertSourceSet(summary.sources, "a review receipt summary sources", false);
  if (!hasExactKeys(summary.report, ["path", "sha256"]) || typeof summary.report.path !== "string" || !isSha(summary.report.sha256)) fail("a review receipt summary report is malformed");
  if (summary.verdict !== "pass" && summary.verdict !== "open-findings") fail("a review receipt summary verdict is malformed");
  const findings = summary.openFindingIds;
  if (!Array.isArray(findings) || findings.length > FINDING_IDS_MAX || !findings.every(isRequirementId) || new Set(findings).size !== findings.length) fail("a review receipt summary openFindingIds is malformed");
}

function assertStub(stub) {
  if (!hasExactKeys(stub, ["path", "refusal"]) || typeof stub.path !== "string") fail("a refused review receipt is { path, refusal }");
  if (typeof stub.refusal !== "string" || !DRR_CODE.test(stub.refusal)) fail("a review receipt refusal code is malformed");
}

function assertReceipts(receipts) {
  if (receipts === null) return;
  if (!Array.isArray(receipts)) fail("reviewReceipts must be null or an array");
  for (const receipt of receipts) {
    if (!isObject(receipt)) fail("a review receipt entry must be an object");
    if (isStub(receipt)) assertStub(receipt);
    else assertSummary(receipt);
  }
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

function buildSources(submission, prdBytes, specBytes, companions, stateByPath) {
  return {
    prd: { path: submission.planPath, sha256: sha256Of(prdBytes) },
    spec: { path: submission.specPath, sha256: sha256Of(specBytes) },
    companions: [...companions].sort(compareUnits).map((path) => ({ path, sha256: stateByPath.get(path).sha256 })),
  };
}

function assertSourceStates(stateByPath, submission, prdBytes, specBytes, companions) {
  for (const path of [submission.planPath, submission.specPath, ...companions]) {
    if (!stateByPath.has(path)) fail("pathStates must hold an entry for every bound path");
  }
  if (stateByPath.get(submission.planPath).sha256 !== sha256Of(prdBytes)) fail("the PRD pathStates digest must be the digest of the PRD bytes");
  if (stateByPath.get(submission.specPath).sha256 !== sha256Of(specBytes)) fail("the Spec pathStates digest must be the digest of the Spec bytes");
}

/** The current SourceSet (PRD, Spec, sorted companions) from the caller's observations. */
export function currentDesignSources(args) {
  if (!hasExactKeys(args, SOURCES_ARGUMENT_KEYS)) fail("currentDesignSources takes exactly { submission, prdBytes, specBytes, companions, pathStates }");
  const { submission, prdBytes, specBytes, companions, pathStates } = args;
  assertSubmission(submission);
  assertBytes(prdBytes, "prdBytes");
  assertBytes(specBytes, "specBytes");
  assertCompanions(companions, submission);
  const stateByPath = indexPathStates(pathStates);
  assertSourceStates(stateByPath, submission, prdBytes, specBytes, companions);
  return buildSources(submission, prdBytes, specBytes, companions, stateByPath);
}

/**
 * Paths whose digest differs between the latest receipt's sources and the current sources
 * (decision Z). A path present on one side only is listed with a null on the missing side.
 */
function unreviewedSourceDelta(reviewedSources, currentSources) {
  const flatten = (set) => new Map([[set.prd.path, set.prd.sha256], [set.spec.path, set.spec.sha256], ...set.companions.map(({ path, sha256 }) => [path, sha256])]);
  const reviewed = flatten(reviewedSources);
  const current = flatten(currentSources);
  const delta = [];
  for (const path of [...new Set([...reviewed.keys(), ...current.keys()])].sort(compareUnits)) {
    if (reviewed.has(path) && current.has(path) && reviewed.get(path) === current.get(path)) continue;
    delta.push({ path, reviewedSha256: reviewed.has(path) ? reviewed.get(path) : null, currentSha256: current.has(path) ? current.get(path) : null });
  }
  return delta;
}

// ---------------------------------------------------------------------------
// Review chain (single implementation, shared with the approval binding)
// ---------------------------------------------------------------------------

function analyzeReviewChain(featureId, receipts, currentSources) {
  if (receipts === null || receipts.length === 0) return { entries: [makeEntry("DCC-REVIEW-RECEIPT-MISSING")], stopped: true };
  const stubs = receipts.filter(isStub);
  if (stubs.length > 0) {
    return { entries: stubs.map((stub) => makeEntry("DCC-REVIEW-RECEIPT-BINDING", { path: stub.path, observed: stub.refusal })), stopped: true };
  }
  const entries = [];
  for (const summary of receipts) {
    if (summary.featureId !== featureId) {
      entries.push(makeEntry("DCC-REVIEW-RECEIPT-BINDING", { path: summary.path, expected: featureId, observed: summary.featureId }));
    }
  }
  if (receipts.length > MAX_REVIEW_ROUNDS) {
    entries.push(makeEntry("DCC-REVIEW-ROUND-EXCEEDED", { observed: String(receipts.length) }));
    return { entries, stopped: true };
  }
  const [first, second] = receipts;
  if (first.kind !== "initial") entries.push(makeEntry("DCC-REVIEW-DELTA-CHAIN", { path: first.path }));
  if (second !== undefined) {
    const brokenLink = second.kind !== "delta"
      || second.previousReceiptSha256 !== first.sha256
      || second.previousReceiptPath !== first.path
      || second.sources.prd.path !== first.sources.prd.path
      || second.sources.spec.path !== first.sources.spec.path;
    if (brokenLink) {
      entries.push(makeEntry("DCC-REVIEW-DELTA-CHAIN", { path: second.path, expected: first.sha256, observed: second.previousReceiptSha256 }));
    }
    if (canonical(second.sources) === canonical(first.sources)) entries.push(makeEntry("DCC-REVIEW-DELTA-CHAIN"));
  }
  const latest = receipts[receipts.length - 1];
  // Decision Z: drift after a round-2 (delta) receipt is a visible delta, not an inconsistency.
  if (latest.kind === "initial" && canonical(latest.sources) !== canonical(currentSources)) {
    entries.push(makeEntry("DCC-REVIEW-RECEIPT-BINDING", {
      path: latest.path,
      expected: sha256Of(canonical(currentSources)),
      observed: sha256Of(canonical(latest.sources)),
    }));
  }
  return { entries, stopped: false };
}

/** Review-chain inconsistencies for a featureId, a receipt chain (oldest first) and the current sources. */
export function reviewChainInconsistencies(args) {
  if (!hasExactKeys(args, ["featureId", "receipts", "currentSources"])) fail("reviewChainInconsistencies takes exactly { featureId, receipts, currentSources }");
  const { featureId, receipts, currentSources } = args;
  if (typeof featureId !== "string" || !FEATURE_ID.test(featureId)) fail("featureId is malformed");
  assertReceipts(receipts);
  assertSourceSet(currentSources, "currentSources", true);
  return analyzeReviewChain(featureId, receipts, currentSources).entries.sort(compareEntries);
}

// ---------------------------------------------------------------------------
// Register side
// ---------------------------------------------------------------------------

/** Maps an `evaluateRequirementTraceability` result or a thrown `RequirementTraceabilityError` to a register input. */
export function registerFromRequirementTraceability(resultOrError, mapPath) {
  if (typeof mapPath !== "string") fail("mapPath must be a string");
  // Recognised by name and code, not by import: this module's import list stays closed.
  if (resultOrError instanceof Error) {
    if (resultOrError.name === "RequirementTraceabilityError" && typeof resultOrError.code === "string" && RT_CODE.test(resultOrError.code)) {
      return { mode: "invalid", mapPath, rtCode: resultOrError.code };
    }
    fail("only a RequirementTraceabilityError can be mapped to a register");
  }
  if (isObject(resultOrError) && resultOrError.mode === "undeclared") return { mode: "undeclared", mapPath };
  if (isObject(resultOrError) && resultOrError.mode === "declared" && Array.isArray(resultOrError.criteria)) {
    const ids = resultOrError.criteria.map((criterion) => (isObject(criterion) ? criterion.id : undefined));
    if (!ids.every((id) => typeof id === "string")) fail("a declared requirement-traceability result holds a criterion without an id");
    return { mode: "declared", mapPath, ids: ids.sort(compareUnits) };
  }
  return fail("the value is neither a requirement-traceability result nor its error");
}

/** Valid requirement ids found in the first cell of the unfenced table rows, in document order, duplicates kept. */
export function parseTraceabilityIds(text) {
  if (typeof text !== "string") fail("traceability text must be a string");
  const ids = [];
  let fenced = false;
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !trimmed.startsWith("|")) continue;
    const rest = trimmed.slice(1);
    const close = rest.indexOf("|");
    let cell = (close < 0 ? rest : rest.slice(0, close)).trim();
    if (cell.length >= 2 && cell.startsWith("`") && cell.endsWith("`")) cell = cell.slice(1, -1);
    if (isRequirementId(cell)) ids.push(cell);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

/** Runs every clause over the observations and returns the closed result; throws only `DCC-INPUT`. */
export function checkDesignConsistency(input) {
  if (!hasExactKeys(input, INPUT_KEYS)) fail(`input must be an object with exactly the keys ${INPUT_KEYS.join(", ")}`);
  const { submission, prdBytes, specBytes, companions, traceability, register, pathStates, reviewReceipts } = input;
  assertSubmission(submission);
  assertBytes(prdBytes, "prdBytes");
  assertBytes(specBytes, "specBytes");
  assertCompanions(companions, submission);
  assertTraceability(traceability, submission.specPath);
  assertRegister(register, traceability);
  assertReceipts(reviewReceipts);

  const receipts = reviewReceipts ?? [];
  const bound = new Set([submission.planPath, submission.specPath, ...companions]);
  for (const receipt of receipts) {
    bound.add(receipt.path);
    if (!isStub(receipt)) bound.add(receipt.report.path);
  }
  const stateByPath = indexPathStates(pathStates);
  for (const path of stateByPath.keys()) {
    if (!bound.has(path)) fail("pathStates holds an entry for a path that is not bound");
  }
  assertSourceStates(stateByPath, submission, prdBytes, specBytes, companions);
  if (traceability !== null && stateByPath.has(traceability.path) && stateByPath.get(traceability.path).sha256 !== sha256Of(traceability.bytes)) {
    fail("the traceability pathStates digest must be the digest of the traceability bytes");
  }
  for (const receipt of receipts) {
    if (!isStub(receipt) && stateByPath.get(receipt.path).sha256 !== receipt.sha256) fail("a review receipt summary digest must be its pathStates digest");
  }

  const sources = buildSources(submission, prdBytes, specBytes, companions, stateByPath);
  const entries = [];

  // 1-4: path states of every bound path (a stronger finding suppresses the weaker ones).
  for (const path of bound) {
    const state = stateByPath.get(path);
    if (!isSafePath(path) || !state.regular) entries.push(makeEntry("DCC-PATH-UNSAFE", { path }));
    else if (state.ignored) entries.push(makeEntry("DCC-PATH-IGNORED", { path }));
    else if (!state.tracked) entries.push(makeEntry("DCC-PATH-UNTRACKED", { path }));
    else if (state.modified) entries.push(makeEntry("DCC-PATH-MODIFIED", { path }));
  }

  // 5-6: the submission digests against the bytes actually read.
  if (sources.prd.sha256 !== submission.planSha256) {
    entries.push(makeEntry("DCC-PRD-DIGEST-DRIFT", { path: submission.planPath, expected: submission.planSha256, observed: sources.prd.sha256 }));
  }
  if (sources.spec.sha256 !== submission.specSha256) {
    entries.push(makeEntry("DCC-SPEC-DIGEST-DRIFT", { path: submission.specPath, expected: submission.specSha256, observed: sources.spec.sha256 }));
  }

  // 7-9: the technical-spec marker, counted with the gate's own grammar on a fresh regex object.
  const markerGrammar = new RegExp(TECHNICAL_SPEC_MARKER.source, TECHNICAL_SPEC_MARKER.flags);
  const markerDigests = [...decodeUtf8(prdBytes).matchAll(markerGrammar)].map((match) => match[1]);
  if (markerDigests.length === 0) {
    entries.push(makeEntry("DCC-PRD-MARKER-MISSING", { path: submission.planPath }));
  } else if (markerDigests.length > 1) {
    entries.push(makeEntry("DCC-PRD-MARKER-DUPLICATE", { path: submission.planPath, observed: String(markerDigests.length) }));
  } else if (markerDigests[0] !== sources.spec.sha256) {
    entries.push(makeEntry("DCC-PRD-MARKER-STALE", { path: submission.planPath, expected: sources.spec.sha256, observed: markerDigests[0] }));
  }

  // 10: the files the register clauses read must be bound as companions.
  const companionSet = new Set(companions);
  if (traceability !== null && !companionSet.has(traceability.path)) entries.push(makeEntry("DCC-COMPANION-UNBOUND", { path: traceability.path }));
  if (register.mode !== "undeclared" && !companionSet.has(register.mapPath)) entries.push(makeEntry("DCC-COMPANION-UNBOUND", { path: register.mapPath }));

  // 11-13: register reconciliation (decision W; an undeclared register is a visible skip, decision Y).
  const registerBlock = { mode: register.mode, mapPath: register.mapPath, registerCount: null, traceabilityCount: null };
  if (register.mode === "invalid") {
    entries.push(makeEntry("DCC-REGISTER-INVALID", { path: register.mapPath, observed: register.rtCode }));
  } else if (register.mode === "declared") {
    const traceabilityIds = parseTraceabilityIds(decodeUtf8(traceability.bytes));
    registerBlock.registerCount = register.ids.length;
    registerBlock.traceabilityCount = traceabilityIds.length;
    const occurrences = new Map();
    for (const id of traceabilityIds) occurrences.set(id, (occurrences.get(id) ?? 0) + 1);
    const duplicates = [...occurrences].filter(([, count]) => count > 1).map(([id]) => id);
    if (duplicates.length > 0) entries.push(makeEntry("DCC-ID-DUPLICATE", { path: traceability.path, ids: duplicates }));
    const registered = new Set(register.ids);
    const listed = new Set(traceabilityIds);
    const missingFromTraceability = register.ids.filter((id) => !listed.has(id));
    const unregistered = [...listed].filter((id) => !registered.has(id));
    if (missingFromTraceability.length > 0) entries.push(makeEntry("DCC-COUNT-MISMATCH", { path: traceability.path, ids: missingFromTraceability }));
    if (unregistered.length > 0) entries.push(makeEntry("DCC-COUNT-MISMATCH", { path: register.mapPath, ids: unregistered }));
  }

  // 14-17: the review chain, plus drift of the review reports (this function only).
  const chain = analyzeReviewChain(submission.featureId, reviewReceipts, sources);
  const reviewEntries = [...chain.entries];
  if (!chain.stopped) {
    for (const summary of receipts) {
      const observed = stateByPath.get(summary.report.path).sha256;
      if (observed !== summary.report.sha256) {
        reviewEntries.push(makeEntry("DCC-REVIEW-RECEIPT-BINDING", { path: summary.report.path, expected: summary.report.sha256, observed }));
      }
    }
  }
  entries.push(...reviewEntries);

  let review = null;
  if (reviewEntries.length === 0) {
    const latest = receipts[receipts.length - 1];
    review = {
      rounds: receipts.length,
      latestReceiptSha256: latest.sha256,
      verdict: latest.verdict,
      openFindingIds: [...latest.openFindingIds].sort(compareUnits),
      unreviewedSourceDelta: unreviewedSourceDelta(latest.sources, sources),
    };
  }

  entries.sort(compareEntries);
  return {
    schema: DESIGN_CONSISTENCY_CHECK_SCHEMA,
    ok: entries.length === 0,
    featureId: submission.featureId,
    sources,
    register: registerBlock,
    review,
    inconsistencies: entries,
  };
}
