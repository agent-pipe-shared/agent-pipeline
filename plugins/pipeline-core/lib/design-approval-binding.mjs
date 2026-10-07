// SPDX-License-Identifier: SUL-1.0
/**
 * ADR-0085 U3 (decisions T, U and Z of the 2026-10-07 PO decisions): the design approval
 * binding, the object the one PO signature is given over.
 *
 *   U  the binding carries the complete open-finding set of the latest review receipt
 *      (empty on PASS), so the PO signs knowingly over open findings;
 *   Z  after a round-2 (delta) receipt, later source drift is not a refusal: the binding
 *      carries the CURRENT sources plus a visible `unreviewedSourceDelta`; after a round-1
 *      receipt the same drift stays a review-chain refusal (decided by the U1 chain check);
 *   T  a legacy design-workflow-package intent or record is told apart, never accepted here;
 *      the typed remedy is the visible re-read mode DWP2-LEGACY-APPROVED-REREAD.
 *
 * Import rule (the kernel module list stays closed; pinned by test case U3-19): this module
 * imports only node:crypto, the U1 chain check, the U2 receipt summary and the canonical /
 * intent primitives of the PO approval proof module.
 *
 * The module is pure: no filesystem, no git, no clock; every observation arrives as input
 * data. Every failure is a typed `{ ok: false, code, causes }` refusal with sorted causes
 * (empty unless a code names them); nothing here throws on caller data. Candidate-vs-HEAD
 * and signature checks belong to the later slices (P1, P3), not to this module.
 *
 * Contract: specs/sprint-alfred-epic/plans/adr-0085-u1-u3-api-contract.md, sections 4 and 6.
 */
import { createHash } from "node:crypto";

import { DesignConsistencyCheckError, reviewChainInconsistencies } from "./design-consistency-check.mjs";
import { summarizeDesignReviewReceipt } from "./design-review-receipt.mjs";
import { PO_APPROVAL_INTENT_SCHEMA, canonical, createPoApprovalIntent } from "./po-approval-proof.mjs";

export const DESIGN_APPROVAL_BINDING_SCHEMA = "pipeline.design-approval-binding.v1";
export const DESIGN_APPROVAL_REQUEST_SCHEMA = "pipeline.design-approval-request.v1";
/** Reserved for the approval record slice (P1); this module only classifies by it. */
export const DESIGN_APPROVAL_RECORD_SCHEMA = "pipeline.design-approval.v1";
export const DESIGN_APPROVAL_INTENT_KIND = "design-approval";
export const DESIGN_APPROVAL_POLICY_REVISION = "design-approval-v1";

const LEGACY_INTENT_KIND = "design-workflow-package";
const LEGACY_POLICY_REVISIONS = Object.freeze(["design-workflow-package-v1", "design-workflow-package-v2"]);
const LEGACY_RECORD_SCHEMA = "pipeline.design-workflow-package-approval.v1";
const LEGACY_REMEDY = "DWP2-LEGACY-APPROVED-REREAD";
const CHAIN_BINDING_CODE = "DCC-REVIEW-RECEIPT-BINDING";
const APPROVE_DECISION = "approve";

const SHA256_HEX = /^[a-f0-9]{64}$/u;
const FEATURE_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const FINDING_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){1,7}$/u;
const DRIVE_PREFIX = /^[A-Za-z]:/u;

const MAX_PATH_LENGTH = 240;
const MAX_COMPANIONS = 64;
const MAX_FINDING_IDS = 64;
const MAX_FINDING_ID_LENGTH = 80;
const MAX_RECEIPTS = 2;
const DELTA_ROUND = 2;
// Every bound path appears at most once per side (PRD, Spec and up to 64 companions).
const MAX_DELTA_ENTRIES = 2 * (MAX_COMPANIONS + 2);

const BINDING_REQUIRED_KEYS = ["schema", "featureId", "sources", "reviewReceipts", "verdict", "openFindingIds"];
const BINDING_OPTIONAL_KEYS = ["unreviewedSourceDelta"];
const REQUEST_KEYS = ["schema", "binding", "bindingSha256", "approvalIntent"];
const CREATE_BINDING_KEYS = ["featureId", "receipts", "currentSources"];
const CREATE_REQUEST_KEYS = ["binding", "candidate"];
const VERIFY_KEYS = ["request", "featureId", "receipts", "currentSources"];

// ----------------------------------------------------------------------------- primitives

/** A refusal is the closed object { ok, code, causes } with unique, sorted causes. */
const refuse = (code, causes = []) => ({ ok: false, code, causes: [...new Set(causes)].sort() });
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const hasExactKeys = (value, keys) => isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const field = (value, key) => (isObject(value) && Object.hasOwn(value, key) ? value[key] : undefined);
const isSha = (value) => typeof value === "string" && SHA256_HEX.test(value);
const isFeatureId = (value) => typeof value === "string" && FEATURE_ID.test(value);
const compareUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sha256Of = (text) => createHash("sha256").update(text, "utf8").digest("hex");

/** Index loop on purpose: Array.prototype.every skips the holes of a sparse array. */
function allOf(list, predicate) {
  for (let index = 0; index < list.length; index += 1) if (!predicate(list[index], index)) return false;
  return true;
}

/** SafePath of the contract: a repository-relative, forward-slash path without traversal. */
function isSafePath(path) {
  if (typeof path !== "string" || path.length < 1 || path.length > MAX_PATH_LENGTH || path !== path.trim()) return false;
  if (path.includes("\\") || path.includes("\0")) return false;
  if (path.startsWith("/") || path.endsWith("/") || DRIVE_PREFIX.test(path)) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

// ----------------------------------------------------------------------------- binding shape

const isSourceRef = (value) => hasExactKeys(value, ["path", "sha256"]) && isSafePath(value.path) && isSha(value.sha256);

/** A SourceSet without null digests: distinct PRD and Spec paths, companions strictly ascending by path. */
function isSourceSet(value) {
  if (!hasExactKeys(value, ["prd", "spec", "companions"]) || !isSourceRef(value.prd) || !isSourceRef(value.spec)) return false;
  if (value.prd.path === value.spec.path) return false;
  const { companions } = value;
  if (!Array.isArray(companions) || companions.length > MAX_COMPANIONS) return false;
  return allOf(companions, (companion, index) => isSourceRef(companion)
    && companion.path !== value.prd.path
    && companion.path !== value.spec.path
    && (index === 0 || compareUnits(companions[index - 1].path, companion.path) < 0));
}

/** One to two entries, ascending rounds 1 and 2. */
function isReceiptList(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_RECEIPTS) return false;
  return allOf(value, (entry, index) => hasExactKeys(entry, ["path", "sha256", "round"]) && isSafePath(entry.path) && isSha(entry.sha256) && entry.round === index + 1);
}

/** The complete open set: unique, ascending by code unit, in the finding-id pattern. */
function isFindingList(value) {
  if (!Array.isArray(value) || value.length > MAX_FINDING_IDS) return false;
  return allOf(value, (id, index) => typeof id === "string" && id.length <= MAX_FINDING_ID_LENGTH && FINDING_ID.test(id)
    && (index === 0 || compareUnits(value[index - 1], id) < 0));
}

/** The digest the SourceSet holds for a path, or null when the path is not bound. */
function digestOfPath(sources, path) {
  if (sources.prd.path === path) return sources.prd.sha256;
  if (sources.spec.path === path) return sources.spec.sha256;
  const companion = sources.companions.find((entry) => entry.path === path);
  return companion === undefined ? null : companion.sha256;
}

const isDigestOrNull = (value) => value === null || isSha(value);

/** Present only when non-empty and ascending by path; its current side is the binding's own sources. */
function isUnreviewedDelta(value, sources) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_DELTA_ENTRIES) return false;
  return allOf(value, (entry, index) => hasExactKeys(entry, ["path", "reviewedSha256", "currentSha256"])
    && isSafePath(entry.path)
    && isDigestOrNull(entry.reviewedSha256)
    && isDigestOrNull(entry.currentSha256)
    && entry.reviewedSha256 !== entry.currentSha256
    && entry.currentSha256 === digestOfPath(sources, entry.path)
    && (index === 0 || compareUnits(value[index - 1].path, entry.path) < 0));
}

function isValidBinding(binding) {
  if (!isObject(binding)) return false;
  const keys = Object.keys(binding);
  if (!BINDING_REQUIRED_KEYS.every((key) => Object.hasOwn(binding, key))) return false;
  if (!keys.every((key) => BINDING_REQUIRED_KEYS.includes(key) || BINDING_OPTIONAL_KEYS.includes(key))) return false;
  if (binding.schema !== DESIGN_APPROVAL_BINDING_SCHEMA || !isFeatureId(binding.featureId)) return false;
  if (!isSourceSet(binding.sources) || !isReceiptList(binding.reviewReceipts)) return false;
  if (binding.verdict !== "pass" && binding.verdict !== "open-findings") return false;
  if (!isFindingList(binding.openFindingIds)) return false;
  // Decision U: the verdict is PASS exactly when no finding is open.
  if ((binding.verdict === "pass") !== (binding.openFindingIds.length === 0)) return false;
  if (Object.hasOwn(binding, "unreviewedSourceDelta")) {
    // Decision Z: only a round-2 (delta) receipt makes later source drift a knowingly signed delta.
    if (binding.reviewReceipts[binding.reviewReceipts.length - 1].round !== DELTA_ROUND) return false;
    if (!isUnreviewedDelta(binding.unreviewedSourceDelta, binding.sources)) return false;
  }
  return true;
}

// ----------------------------------------------------------------------------- building

/** Paths whose digest differs between the reviewed and the current sources (same rule as U1). */
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

const copySources = (sources) => ({
  prd: { path: sources.prd.path, sha256: sources.prd.sha256 },
  spec: { path: sources.spec.path, sha256: sources.spec.sha256 },
  // A companion deleted since review (current sha256 null) is not bound; its delta entry still records the removal.
  companions: sources.companions.filter(({ sha256 }) => sha256 !== null).map(({ path, sha256 }) => ({ path, sha256 })),
});

/**
 * Build the binding over a receipt chain (oldest first) and the current sources.
 * Order: summarize every receipt (DAB-RECEIPT), run the U1 chain check (DAB-REVIEW-CHAIN),
 * build from the latest summary, validate the result (DAB-SHAPE).
 * @returns {{ ok: true, binding: object, bindingSha256: string } | { ok: false, code: string, causes: string[] }}
 */
export function createDesignApprovalBinding(input) {
  if (!hasExactKeys(input, CREATE_BINDING_KEYS) || !isFeatureId(input.featureId) || !Array.isArray(input.receipts)) return refuse("DAB-SHAPE");
  const { featureId, receipts, currentSources } = input;

  const summaries = [];
  const receiptCauses = [];
  for (let index = 0; index < receipts.length; index += 1) {
    const entry = receipts[index];
    const summarized = summarizeDesignReviewReceipt(isObject(entry) ? { path: entry.path, bytes: entry.bytes } : entry);
    if (summarized.ok) summaries.push(summarized.summary);
    else receiptCauses.push(summarized.code);
  }
  if (receiptCauses.length > 0) return refuse("DAB-RECEIPT", receiptCauses);

  let entries;
  try {
    entries = reviewChainInconsistencies({ featureId, receipts: summaries, currentSources });
  } catch (error) {
    if (error instanceof DesignConsistencyCheckError) return refuse("DAB-SHAPE");
    throw error;
  }
  if (entries.length > 0) return refuse("DAB-REVIEW-CHAIN", entries.map((entry) => entry.code));

  const latest = summaries[summaries.length - 1];
  const binding = {
    schema: DESIGN_APPROVAL_BINDING_SCHEMA,
    featureId,
    sources: copySources(currentSources),
    reviewReceipts: summaries.map(({ path, sha256, round }) => ({ path, sha256, round })),
    verdict: latest.verdict,
    openFindingIds: [...latest.openFindingIds],
  };
  if (latest.kind === "delta") {
    const delta = unreviewedSourceDelta(latest.sources, currentSources);
    if (delta.length > 0) binding.unreviewedSourceDelta = delta;
  }
  const validated = validateDesignApprovalBinding(binding);
  if (!validated.ok) return validated;
  return { ok: true, binding, bindingSha256: validated.bindingSha256 };
}

/**
 * Check a binding's closed shape and return its digest, sha256(utf8(canonical(binding))).
 * @returns {{ ok: true, bindingSha256: string } | { ok: false, code: "DAB-SHAPE", causes: string[] }}
 */
export function validateDesignApprovalBinding(binding) {
  if (!isValidBinding(binding)) return refuse("DAB-SHAPE");
  return { ok: true, bindingSha256: sha256Of(canonical(binding)) };
}

// ----------------------------------------------------------------------------- request

/** The approval intent over a binding; null when createPoApprovalIntent rejects the candidate or a field. */
function buildIntent(binding, bindingSha256, candidate) {
  try {
    return createPoApprovalIntent({
      kind: DESIGN_APPROVAL_INTENT_KIND,
      featureId: binding.featureId,
      planSha256: binding.sources.prd.sha256,
      specSha256: binding.sources.spec.sha256,
      candidate,
      policyRevision: DESIGN_APPROVAL_POLICY_REVISION,
      subjectSha256: bindingSha256,
      decision: APPROVE_DECISION,
    });
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

/**
 * Wrap a valid binding and a candidate (commit and tree) into the request the PO signs over.
 * @returns {{ ok: true, request: object, intentSha256: string } | { ok: false, code: string, causes: string[] }}
 */
export function createDesignApprovalRequest(input) {
  if (!isObject(input) || !Object.keys(input).every((key) => CREATE_REQUEST_KEYS.includes(key))) return refuse("DAB-SHAPE");
  const validated = validateDesignApprovalBinding(input.binding);
  if (!validated.ok) return validated;
  const intent = buildIntent(input.binding, validated.bindingSha256, input.candidate);
  if (intent === null) return refuse("DAB-INTENT");
  return {
    ok: true,
    request: {
      schema: DESIGN_APPROVAL_REQUEST_SCHEMA,
      binding: structuredClone(input.binding),
      bindingSha256: validated.bindingSha256,
      approvalIntent: { value: intent.value, sha256: intent.sha256 },
    },
    intentSha256: intent.sha256,
  };
}

/**
 * Verify a request against the receipts and sources as they are NOW. First failure wins:
 * (1) request keys or binding invalid, (2) intent kind, (3) feature mismatch, (4) recomputed
 * binding refusal passed through, (5) binding digest or content drift, (6) intent drift.
 * @returns {{ ok: true, bindingSha256: string, intentSha256: string, candidate: object, verdict: string, openFindingIds: string[] } | { ok: false, code: string, causes: string[] }}
 */
export function verifyDesignApprovalRequest(input) {
  if (!hasExactKeys(input, VERIFY_KEYS)) return refuse("DAB-SHAPE");
  const { request, featureId, receipts, currentSources } = input;

  // (1) the request is closed and its binding is a valid binding
  if (!hasExactKeys(request, REQUEST_KEYS) || request.schema !== DESIGN_APPROVAL_REQUEST_SCHEMA || !isSha(request.bindingSha256)) return refuse("DAB-SHAPE");
  const { approvalIntent } = request;
  if (!hasExactKeys(approvalIntent, ["value", "sha256"]) || !isObject(approvalIntent.value) || !isSha(approvalIntent.sha256)) return refuse("DAB-SHAPE");
  const validated = validateDesignApprovalBinding(request.binding);
  if (!validated.ok) return validated;

  // (2) the intent is the new design-approval intent, not a legacy or unknown one
  const intentClass = classifyDesignApprovalIntent(approvalIntent);
  if (intentClass === "legacy-design-workflow-package") return refuse("DAB-LEGACY-KIND", [LEGACY_REMEDY]);
  if (intentClass !== "design-approval") return refuse("DAB-KIND");

  // (3) the request is for the feature being verified
  if (request.binding.featureId !== featureId) return refuse("DAB-REVIEW-CHAIN", [CHAIN_BINDING_CODE]);

  // (4) recompute the binding from the receipts and sources as they are now
  const recomputed = createDesignApprovalBinding({ featureId, receipts, currentSources });
  if (!recomputed.ok) return recomputed;

  // (5) the request's binding and digest are exactly the recomputed ones
  if (request.bindingSha256 !== recomputed.bindingSha256 || canonical(request.binding) !== canonical(recomputed.binding)) return refuse("DAB-BINDING-DRIFT");

  // (6) the request's intent is exactly the one recomputed with the request's own candidate
  const candidate = field(approvalIntent.value, "candidate");
  const intent = buildIntent(recomputed.binding, recomputed.bindingSha256, candidate);
  if (intent === null) return refuse("DAB-INTENT");
  if (approvalIntent.sha256 !== intent.sha256 || canonical(approvalIntent.value) !== canonical(intent.value)) return refuse("DAB-INTENT-DRIFT");

  return {
    ok: true,
    bindingSha256: recomputed.bindingSha256,
    intentSha256: intent.sha256,
    candidate: { commit: candidate.commit, tree: candidate.tree },
    verdict: recomputed.binding.verdict,
    openFindingIds: [...recomputed.binding.openFindingIds],
  };
}

// ----------------------------------------------------------------------------- classifiers

/**
 * Classify an approval intent by kind, policy revision and schema. Takes the intent value or
 * the { value, sha256 } pair createPoApprovalIntent-based callers hold.
 * @returns {"design-approval" | "legacy-design-workflow-package" | "unknown"}
 */
export function classifyDesignApprovalIntent(intent) {
  const wrapped = field(intent, "value");
  const value = wrapped === undefined ? intent : wrapped;
  if (!isObject(value)) return "unknown";
  const kind = field(value, "kind");
  const policyRevision = field(value, "policyRevision");
  if (kind === DESIGN_APPROVAL_INTENT_KIND && policyRevision === DESIGN_APPROVAL_POLICY_REVISION && field(value, "schema") === PO_APPROVAL_INTENT_SCHEMA) return "design-approval";
  if (kind === LEGACY_INTENT_KIND && LEGACY_POLICY_REVISIONS.includes(policyRevision)) return "legacy-design-workflow-package";
  return "unknown";
}

/**
 * Classify an approval record by schema. A new-schema record carrying a package digest or an
 * advisor exception is a hybrid and invalid; a legacy record may carry its advisor exception.
 * Full validation of a new record belongs to the approval record slice (P1).
 * @returns {"design-approval" | "legacy-design-workflow-package" | "invalid" | "unknown"}
 */
export function classifyDesignApprovalRecord(record) {
  if (!isObject(record)) return "unknown";
  const schema = field(record, "schema");
  if (schema === LEGACY_RECORD_SCHEMA) return "legacy-design-workflow-package";
  if (schema === DESIGN_APPROVAL_RECORD_SCHEMA) {
    return Object.hasOwn(record, "packageSha256") || Object.hasOwn(record, "advisorException") ? "invalid" : "design-approval";
  }
  return "unknown";
}
