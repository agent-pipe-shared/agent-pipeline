// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";

export const REVIEW_ECONOMY_SCHEMA = "pipeline.review-economy.v1";
export const COURSE_CATALOG_VERSION = "pipeline-course-catalog.v1";
export const COURSE_KINDS = Object.freeze([
  "bounded-diagnosis",
  "scope-split",
  "authority-rebaseline",
  "preauthorized-route-change",
  "defer",
  "stop",
]);
export const COURSE_ELIMINATION_REASONS = Object.freeze([
  "not-applicable",
  "authority-missing",
  "budget-exhausted",
  "evidence-missing",
  "invariant-weakened",
  "route-unavailable",
  "trust-boundary-expansion",
  "materially-equivalent",
]);
export const TRUSTED_ENVIRONMENT_CODES = Object.freeze([
  "host-sandbox-bootstrap-rejected",
  "host-sandbox-capability-unsupported",
  "host-sandbox-broker-disconnected",
  "host-sandbox-calibrated-transport-failure",
]);
export const DIAGNOSTIC_TAIL_MAX_UTF8_BYTES = 4096;
export const REVIEW_LIMITS = Object.freeze({
  criticRounds: 4,
  correctionCommits: 3,
  productRetries: 1,
  environmentReroutes: 1,
});
export const CRITIC_REVIEW_ECONOMY_PROJECTION_SCHEMA = "pipeline.critic-review-economy-projection.v1";
export const CRITIC_REVIEW_FAILURE_CLASSES = Object.freeze([
  "no-result",
  "empty",
  "timeout",
  "child",
  "malformed",
  "incomplete",
  "drift",
  "internal",
]);
export const PROGRESS_COMPONENTS = Object.freeze([
  "boundTreeChanges",
  "verifiedOutputBytes",
  "traceBytes",
  "completedTestSteps",
  "deliveredResultBytes",
]);

const SHA256 = /^[a-f0-9]{64}$/;
const SHA40 = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_PATH = /^(?!\/)(?!.*\\)[A-Za-z0-9._/-]{1,240}$/;
const FAULT_DOMAINS = new Set(["product", "execution-environment", "unknown"]);
const SIGNALS = new Set(["SIGABRT", "SIGBUS", "SIGFPE", "SIGHUP", "SIGILL", "SIGINT", "SIGKILL", "SIGPIPE", "SIGQUIT", "SIGSEGV", "SIGTERM", "SIGTRAP"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function safeInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function validRepoPath(value) {
  return typeof value === "string" && SAFE_PATH.test(value)
    && value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("canonical JSON accepts safe integers only");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isObject(value)) throw new TypeError("canonical JSON accepts plain JSON values only");
  const keys = Object.keys(value).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function sha256Canonical(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export const COURSE_CATALOG_SHA256 = sha256Canonical({
  version: COURSE_CATALOG_VERSION,
  kinds: COURSE_KINDS,
  eliminationReasons: COURSE_ELIMINATION_REASONS,
});

function validNullableExit(value) {
  return value === null || (Number.isInteger(value) && value >= 0 && value <= 255);
}

function validNullableSignal(value) {
  return value === null || SIGNALS.has(value);
}

/** Stable failure signature. Raw tails, elapsed time, paths and free text have no input channel. */
export function failureSignature(failure) {
  const keys = ["faultDomain", "capabilityId", "stage", "runner", "stableErrorCode", "exitCode", "signal", "boundedTailSha256"];
  if (!exactKeys(failure, keys)
    || !FAULT_DOMAINS.has(failure.faultDomain)
    || ![failure.capabilityId, failure.stage, failure.runner, failure.stableErrorCode].every((value) => typeof value === "string" && SAFE_ID.test(value))
    || !validNullableExit(failure.exitCode)
    || !validNullableSignal(failure.signal)
    || !SHA256.test(failure.boundedTailSha256)) {
    throw new TypeError("invalid closed failure signature input");
  }
  return sha256Canonical(failure);
}

/**
 * Classify only structured evidence. Timeout/nonzero/empty output/free prose do
 * not occur in the positive predicate and therefore remain unknown.
 */
export function classifyFailureEvidence(evidence) {
  const keys = ["productVerdict", "host"];
  if (!exactKeys(evidence, keys)) return { faultDomain: "unknown", code: "RE-CLASSIFIER-SHAPE" };
  if (isObject(evidence.productVerdict)
    && exactKeys(evidence.productVerdict, ["schemaValid", "outcome"])
    && evidence.productVerdict.schemaValid === true) {
    return evidence.productVerdict.outcome === "failed"
      ? { faultDomain: "product", code: "RE-PRODUCT-VERDICT" }
      : { faultDomain: "unknown", code: "RE-SCHEMA-VALID-NONFAILURE" };
  }
  const host = evidence.host;
  if (!isObject(host)
    || !exactKeys(host, ["structured", "code", "beforeProductStart", "evidenceSha256", "diagnostic", "calibration"])
    || host.structured !== true
    || host.beforeProductStart !== true
    || !TRUSTED_ENVIRONMENT_CODES.includes(host.code)
    || !SHA256.test(host.evidenceSha256)
    || host.diagnostic === null || !validDiagnostic(host.diagnostic)) {
    return { faultDomain: "unknown", code: "RE-NO-TRUSTED-HOST-PREDICATE" };
  }
  if (host.code !== "host-sandbox-calibrated-transport-failure") {
    if (host.calibration !== null) return { faultDomain: "unknown", code: "RE-UNEXPECTED-CALIBRATION" };
    return { faultDomain: "execution-environment", code: host.code, evidenceSha256: host.evidenceSha256 };
  }
  const calibration = host.calibration;
  if (!isObject(calibration)
    || !exactKeys(calibration, ["fresh", "exactHostCliVersionPrimitive", "identicalControlDigests", "liveSignatureMatched", "receiptSha256"])
    || calibration.fresh !== true
    || calibration.exactHostCliVersionPrimitive !== true
    || calibration.identicalControlDigests !== true
    || calibration.liveSignatureMatched !== true
    || !SHA256.test(calibration.receiptSha256)) {
    return { faultDomain: "unknown", code: "RE-CALIBRATION-INCOMPLETE" };
  }
  return { faultDomain: "execution-environment", code: host.code, evidenceSha256: host.evidenceSha256 };
}

function validPathInvariantMap(map) {
  return isObject(map) && Object.entries(map).every(([path, invariants]) => validRepoPath(path)
    && Array.isArray(invariants) && invariants.length > 0
    && invariants.every((id) => typeof id === "string" && SAFE_ID.test(id))
    && new Set(invariants).size === invariants.length);
}

export function admitReviewAttempt(input) {
  if (!isObject(input)) return { ok: false, mode: null, code: "RE-REVIEW-SHAPE" };
  if (!safeInteger(input.round) || input.round < 1 || input.round > REVIEW_LIMITS.criticRounds) {
    return { ok: false, mode: null, code: "RE-CRITIC-ROUND-LIMIT", courseGateRequired: true };
  }
  if (!safeInteger(input.correctionCommits) || input.correctionCommits > REVIEW_LIMITS.correctionCommits) {
    return { ok: false, mode: null, code: "RE-CORRECTION-LIMIT", courseGateRequired: true };
  }
  if (input.round === 1 || input.requestedMode !== "delta") {
    return { ok: true, mode: "full", code: input.round === 1 ? "RE-FIRST-FULL" : "RE-REQUESTED-FULL", affectedInvariantIds: [] };
  }
  const bindingsValid = SHA40.test(input.base ?? "") && SHA40.test(input.head ?? "") && SHA40.test(input.tree ?? "")
    && Array.isArray(input.changedPaths) && input.changedPaths.length > 0
    && input.changedPaths.every((path) => validRepoPath(path))
    && Array.isArray(input.changedBehaviorClaims) && input.changedBehaviorClaims.length > 0
    && input.changedBehaviorClaims.every((claim) => typeof claim === "string" && SAFE_ID.test(claim))
    && isObject(input.priorReceipt) && exactKeys(input.priorReceipt, ["id", "sha256"])
    && SAFE_ID.test(input.priorReceipt.id ?? "") && SHA256.test(input.priorReceipt.sha256 ?? "")
    && validPathInvariantMap(input.pathInvariantMap)
    && SHA256.test(input.pathInvariantMapSha256 ?? "")
    && sha256Canonical(input.pathInvariantMap) === input.pathInvariantMapSha256
    && input.coordinatorImpactConfirmed === true
    && input.trustBoundaryChanged === false
    && input.impactAmbiguous === false;
  if (!bindingsValid) return { ok: true, mode: "full", code: "RE-DELTA-FALLBACK-BINDINGS", affectedInvariantIds: [] };
  const unknown = input.changedPaths.filter((path) => !Object.hasOwn(input.pathInvariantMap, path));
  if (unknown.length > 0) return { ok: true, mode: "full", code: "RE-DELTA-FALLBACK-UNKNOWN-PATH", affectedInvariantIds: [] };
  return {
    ok: true,
    mode: "delta",
    code: "RE-DELTA-ADMITTED",
    affectedInvariantIds: sortedUnique(input.changedPaths.flatMap((path) => input.pathInvariantMap[path])),
  };
}

const CRITIC_LINEAGE_ROOT_KEYS = Object.freeze([
  "schema",
  "reviewId",
  "parentReviewId",
  "candidate",
  "diff",
  "references",
  "packages",
  "coverage",
  "request",
  "lane",
  "verdict",
  "findings",
  "correction",
  "invalidation",
  "course",
  "previousSha256",
  "recordSha256",
]);
const CRITIC_VERDICT_STATUSES = Object.freeze(["pending", "no-findings", "findings", "failed"]);
const CRITIC_FINDING_SEVERITIES = Object.freeze(["critical", "high", "medium", "low"]);
const CRITIC_FINDING_DISPOSITIONS = Object.freeze(["open", "fixed", "withdrawn", "superseded"]);
const CRITIC_SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CRITIC_SAFE_PATH = /^(?!\/)(?!.*\\)[A-Za-z0-9._/-]{1,512}$/;
const CRITIC_OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const CRITIC_PACKET_ID = /^[a-f0-9]{32}$/;
const CRITIC_INVALIDATION_REASONS = new Set([
  "explicit-broad-review",
  "delta-bindings-invalid",
  "unknown-changed-path",
  "trust-boundary-change",
  "impact-ambiguous",
  "prior-review-failure",
]);

function criticPath(value) {
  return typeof value === "string"
    && CRITIC_SAFE_PATH.test(value)
    && Buffer.byteLength(value, "utf8") <= 512
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function criticSorted(values, valid, { allowEmpty = false } = {}) {
  return Array.isArray(values)
    && (allowEmpty || values.length > 0)
    && values.length <= 256
    && values.every(valid)
    && values.every((value, index) => index === 0 || values[index - 1] < value);
}

function criticSame(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function criticCompiledRequest(record) {
  return {
    packetId: record.request.packetId,
    candidate: record.candidate,
    diff: record.diff,
    references: record.references,
    packages: record.packages,
    coverage: {
      changedPaths: record.coverage.changedPaths,
      acceptanceIds: record.coverage.acceptanceIds,
      integrationEdges: record.coverage.integrationEdges,
    },
    mode: record.request.mode,
    admissionCode: record.request.admissionCode,
  };
}

function criticPackageCode(packages, coverage) {
  if (!Array.isArray(packages)
    || packages.length < 1
    || packages.length > 256
    || !packages.every((row) => exactKeys(row, ["id", "subjectSha256", "changedPaths", "integrationEdges"])
      && CRITIC_SAFE_ID.test(row.id ?? "")
      && SHA256.test(row.subjectSha256 ?? "")
      && criticSorted(row.changedPaths, criticPath)
      && criticSorted(row.integrationEdges, (value) => CRITIC_SAFE_ID.test(value), { allowEmpty: true }))
    || !packages.every((row, index) => index === 0 || packages[index - 1].id < row.id)) {
    return "RE-CRITIC-PROJECTION-PACKAGES";
  }
  const flattenedPaths = packages.flatMap(({ changedPaths }) => changedPaths);
  if (new Set(flattenedPaths).size !== flattenedPaths.length) {
    return "RE-CRITIC-PROJECTION-PACKAGE-OVERLAP";
  }
  const packagePaths = [...flattenedPaths].sort();
  const packageEdges = [...new Set(packages.flatMap(({ integrationEdges }) => integrationEdges))].sort();
  return criticSame(packagePaths, coverage.changedPaths)
    && criticSame(packageEdges, coverage.integrationEdges)
    ? null
    : "RE-CRITIC-PROJECTION-PACKAGE-CLOSURE";
}

function criticProjectionRecordCode(record) {
  if (!exactKeys(record, CRITIC_LINEAGE_ROOT_KEYS)
    || record.schema !== "pipeline.critic-review-lineage.v1"
    || !CRITIC_SAFE_ID.test(record.reviewId ?? "")
    || !(record.parentReviewId === null || CRITIC_SAFE_ID.test(record.parentReviewId))
    || !exactKeys(record.candidate, ["commit", "tree"])
    || !CRITIC_OID.test(record.candidate.commit ?? "")
    || !CRITIC_OID.test(record.candidate.tree ?? "")
    || !exactKeys(record.diff, ["base", "sha256", "changedPaths"])
    || !CRITIC_OID.test(record.diff.base ?? "")
    || !SHA256.test(record.diff.sha256 ?? "")
    || !criticSorted(record.diff.changedPaths, criticPath)
    || !exactKeys(record.references, ["packetSha256", "requestSha256", "diffPathsSha256", "governanceSha256"])
    || !Object.values(record.references).every((value) => SHA256.test(value))
    || !exactKeys(record.coverage, ["changedPaths", "acceptanceIds", "integrationEdges", "complete", "receiptSha256"])
    || !criticSorted(record.coverage.changedPaths, criticPath)
    || !criticSorted(record.coverage.acceptanceIds, (value) => CRITIC_SAFE_ID.test(value))
    || !criticSorted(record.coverage.integrationEdges, (value) => CRITIC_SAFE_ID.test(value))
    || typeof record.coverage.complete !== "boolean"
    || !(record.coverage.receiptSha256 === null || SHA256.test(record.coverage.receiptSha256))
    || record.coverage.complete !== (record.coverage.receiptSha256 !== null)
    || criticPackageCode(record.packages, record.coverage)
    || !exactKeys(record.request, ["packetId", "requestSha256", "compiledSha256", "mode", "admissionCode"])
    || !CRITIC_PACKET_ID.test(record.request.packetId ?? "")
    || !SHA256.test(record.request.requestSha256 ?? "")
    || !SHA256.test(record.request.compiledSha256 ?? "")
    || !new Set(["full", "delta", "none"]).has(record.request.mode)
    || typeof record.request.admissionCode !== "string"
    || !/^RE-[A-Z0-9-]{1,96}$/.test(record.request.admissionCode)
    || !exactKeys(record.lane, ["laneId", "contextSha256", "independent", "evidenceSha256", "freshFromReviewId"])
    || !CRITIC_SAFE_ID.test(record.lane.laneId ?? "")
    || !SHA256.test(record.lane.contextSha256 ?? "")
    || record.lane.independent !== true
    || !SHA256.test(record.lane.evidenceSha256 ?? "")
    || !(record.lane.freshFromReviewId === null || CRITIC_SAFE_ID.test(record.lane.freshFromReviewId))
    || !exactKeys(record.verdict, ["status", "schemaValid", "resultSha256", "failure"])
    || !CRITIC_VERDICT_STATUSES.includes(record.verdict.status)
    || typeof record.verdict.schemaValid !== "boolean"
    || !(record.verdict.resultSha256 === null || SHA256.test(record.verdict.resultSha256))
    || !(record.verdict.failure === null || CRITIC_REVIEW_FAILURE_CLASSES.includes(record.verdict.failure))
    || !Array.isArray(record.findings)
    || record.findings.length > 256
    || !record.findings.every((finding) => exactKeys(finding, ["id", "priorFindingId", "severity", "status", "evidenceSha256"])
      && CRITIC_SAFE_ID.test(finding.id ?? "")
      && (finding.priorFindingId === null || CRITIC_SAFE_ID.test(finding.priorFindingId))
      && CRITIC_FINDING_SEVERITIES.includes(finding.severity)
      && CRITIC_FINDING_DISPOSITIONS.includes(finding.status)
      && SHA256.test(finding.evidenceSha256 ?? ""))
    || !record.findings.every((finding, index) => index === 0 || record.findings[index - 1].id < finding.id)
    || !(record.correction === null || (exactKeys(record.correction, ["commit", "deltaSha256", "impactSha256"])
      && CRITIC_OID.test(record.correction.commit ?? "")
      && SHA256.test(record.correction.deltaSha256 ?? "")
      && SHA256.test(record.correction.impactSha256 ?? "")))
    || !exactKeys(record.invalidation, ["kind", "reason", "evidenceSha256"])
    || !new Set(["none", "full-review-required"]).has(record.invalidation.kind)
    || !(record.invalidation.reason === null || CRITIC_INVALIDATION_REASONS.has(record.invalidation.reason))
    || !(record.invalidation.evidenceSha256 === null || SHA256.test(record.invalidation.evidenceSha256))
    || !exactKeys(record.course, ["reviewRound", "correctionCommitCount", "maxReviewRounds", "maxCorrectionCommits", "status"])
    || record.course.maxReviewRounds !== REVIEW_LIMITS.criticRounds
    || record.course.maxCorrectionCommits !== REVIEW_LIMITS.correctionCommits
    || !safeInteger(record.course.reviewRound, REVIEW_LIMITS.criticRounds + 1)
    || record.course.reviewRound < 1
    || !safeInteger(record.course.correctionCommitCount, REVIEW_LIMITS.correctionCommits + 1)
    || !new Set(["admitted", "po-course-gate"]).has(record.course.status)
    || !(record.previousSha256 === null || SHA256.test(record.previousSha256))
    || !SHA256.test(record.recordSha256 ?? "")
    || record.recordSha256 !== sha256Canonical(Object.fromEntries(
      Object.entries(record).filter(([key]) => key !== "recordSha256"),
    ))) {
    return "RE-CRITIC-PROJECTION-SHAPE";
  }
  const admitted = record.course.status === "admitted";
  const exhausted = record.course.reviewRound > REVIEW_LIMITS.criticRounds
    || record.course.correctionCommitCount > REVIEW_LIMITS.correctionCommits;
  const noInvalidation = record.invalidation.kind === "none"
    && record.invalidation.reason === null
    && record.invalidation.evidenceSha256 === null;
  const fullInvalidation = record.invalidation.kind === "full-review-required"
    && CRITIC_INVALIDATION_REASONS.has(record.invalidation.reason)
    && SHA256.test(record.invalidation.evidenceSha256 ?? "");
  if (!criticSame(record.diff.changedPaths, record.coverage.changedPaths)
    || record.request.requestSha256 !== record.references.requestSha256
    || record.request.compiledSha256 !== sha256Canonical(criticCompiledRequest(record))
    || admitted === exhausted
    || admitted === (record.request.mode === "none")
    || record.parentReviewId === null
      && (record.previousSha256 !== null || record.lane.freshFromReviewId !== null || record.correction !== null)
    || record.parentReviewId !== null
      && (record.previousSha256 === null || record.lane.freshFromReviewId !== record.parentReviewId)
    || record.parentReviewId === null
      && record.findings.some(({ priorFindingId, status }) => priorFindingId !== null || status !== "open")
    || record.parentReviewId === null
      && ["pending", "failed"].includes(record.verdict.status)
      && record.findings.length !== 0
    || record.verdict.status === "pending"
      && (record.verdict.schemaValid || record.verdict.resultSha256 !== null || record.verdict.failure !== null || record.coverage.complete)
    || ["no-findings", "findings"].includes(record.verdict.status)
      && (!record.verdict.schemaValid || !SHA256.test(record.verdict.resultSha256 ?? "")
        || record.verdict.failure !== null || !record.coverage.complete)
    || record.verdict.status === "no-findings"
      && record.findings.some(({ status }) => status === "open")
    || record.verdict.status === "findings"
      && !record.findings.some(({ status }) => status === "open")
    || record.verdict.status === "failed"
      && (record.verdict.schemaValid || !CRITIC_REVIEW_FAILURE_CLASSES.includes(record.verdict.failure))
    || record.verdict.failure === "no-result"
      && record.verdict.resultSha256 !== null
    || ["empty", "malformed", "incomplete"].includes(record.verdict.failure)
      && !SHA256.test(record.verdict.resultSha256 ?? "")
    || record.verdict.failure === "incomplete"
      && record.coverage.complete
    || record.request.mode === "delta"
      && !noInvalidation
    || record.request.mode === "full"
      && record.parentReviewId === null
      && !noInvalidation
    || record.request.mode === "full"
      && record.parentReviewId !== null
      && !fullInvalidation
    || record.correction !== null
      && (record.correction.commit !== record.candidate.commit
        || record.correction.deltaSha256 !== record.diff.sha256
        || record.correction.impactSha256 !== sha256Canonical(record.coverage.integrationEdges))
    || record.findings.some(({ status }) => status === "superseded")
      && !fullInvalidation
    || record.course.status === "po-course-gate"
      && (record.parentReviewId === null
        || record.request.mode !== "none"
        || record.request.admissionCode !== "RE-PO-COURSE-GATE"
        || record.verdict.status !== "pending"
        || record.correction !== null
        || !noInvalidation)) {
    return "RE-CRITIC-PROJECTION-SEMANTICS";
  }
  return null;
}

function criticProjectionTransitionCode(parent, current) {
  if (parent.course.status !== "admitted"
    || current.parentReviewId !== parent.reviewId
    || current.previousSha256 !== parent.recordSha256
    || current.reviewId === parent.reviewId
    || current.lane.freshFromReviewId !== parent.reviewId
    || current.lane.laneId === parent.lane.laneId
    || current.lane.contextSha256 === parent.lane.contextSha256) {
    return "RE-CRITIC-PROJECTION-CHAIN";
  }
  if (current.course.status === "po-course-gate") {
    if (!criticSame(current.candidate, parent.candidate)
      || !criticSame(current.diff, parent.diff)
      || !criticSame(current.findings, parent.findings)) {
      return "RE-CRITIC-PROJECTION-COURSE-GATE-BINDING";
    }
    const roundStep = current.course.reviewRound - parent.course.reviewRound;
    const correctionStep = current.course.correctionCommitCount - parent.course.correctionCommitCount;
    const boundedNextStep = [0, 1].includes(roundStep)
      && [0, 1].includes(correctionStep)
      && roundStep + correctionStep >= 1;
    const crossesRound = parent.course.reviewRound === REVIEW_LIMITS.criticRounds
      && current.course.reviewRound === REVIEW_LIMITS.criticRounds + 1;
    const crossesCorrection = parent.course.correctionCommitCount === REVIEW_LIMITS.correctionCommits
      && current.course.correctionCommitCount === REVIEW_LIMITS.correctionCommits + 1;
    return boundedNextStep && (crossesRound || crossesCorrection)
      ? null
      : "RE-CRITIC-PROJECTION-COURSE-GATE";
  }
  if (current.course.reviewRound !== parent.course.reviewRound + 1) {
    return "RE-CRITIC-PROJECTION-COUNTERS";
  }
  const correctionStep = current.course.correctionCommitCount - parent.course.correctionCommitCount;
  if (![0, 1].includes(correctionStep)) return "RE-CRITIC-PROJECTION-COUNTERS";
  if (correctionStep === 1) {
    if (current.correction === null
      || current.diff.base !== parent.candidate.commit
      || current.correction.commit !== current.candidate.commit) {
      return "RE-CRITIC-PROJECTION-CORRECTION";
    }
  } else if (current.correction !== null
    || !criticSame(current.candidate, parent.candidate)
    || !criticSame(current.diff, parent.diff)
    || parent.verdict.status !== "failed"
    || current.invalidation.reason !== "prior-review-failure") {
    return "RE-CRITIC-PROJECTION-RERUN";
  }
  if (["pending", "failed"].includes(current.verdict.status)) {
    return criticSame(current.findings, parent.findings)
      ? null
      : "RE-CRITIC-PROJECTION-RETAINED-FINDINGS";
  }
  const parentById = new Map(parent.findings.map((finding) => [finding.id, finding]));
  const currentById = new Map(current.findings.map((finding) => [finding.id, finding]));
  for (const prior of parent.findings.filter(({ status }) => status === "open")) {
    const next = currentById.get(prior.id);
    if (!next || next.priorFindingId !== prior.id || next.severity !== prior.severity) {
      return "RE-CRITIC-PROJECTION-FINDING-DROPPED";
    }
  }
  for (const finding of current.findings) {
    const prior = finding.priorFindingId === null ? null : parentById.get(finding.priorFindingId);
    if (prior === null) {
      if (finding.status !== "open" || parentById.has(finding.id)) {
        return "RE-CRITIC-PROJECTION-NEW-FINDING";
      }
    } else if (!prior || prior.status !== "open" || finding.id !== prior.id) {
      return "RE-CRITIC-PROJECTION-FINDING-LINEAGE";
    }
  }
  return null;
}

/**
 * Project privacy-safe convergence and course consumption from validated A5
 * lineage records. The projection intentionally has no path, finding ID,
 * lane, provider, model, usage, cost or assurance channel. Retained evidence
 * is counted as occurrence only; the terminal status derives from the typed
 * verdict and never uses a generic PASS value.
 */
export function projectCriticReviewEconomy(records) {
  if (!Array.isArray(records) || records.length < 1 || records.length > REVIEW_LIMITS.criticRounds + 1) {
    return { ok: false, code: "RE-CRITIC-PROJECTION-INPUT" };
  }
  const reviewIds = new Set();
  const laneIds = new Set();
  const contextDigests = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const invalid = criticProjectionRecordCode(records[index]);
    if (invalid) return { ok: false, code: invalid, index };
    const record = records[index];
    if (reviewIds.has(record.reviewId)
      || laneIds.has(record.lane.laneId)
      || contextDigests.has(record.lane.contextSha256)) {
      return { ok: false, code: "RE-CRITIC-PROJECTION-REPLAY", index };
    }
    reviewIds.add(record.reviewId);
    laneIds.add(record.lane.laneId);
    contextDigests.add(record.lane.contextSha256);
    if (index === 0) {
      if (record.parentReviewId !== null || record.previousSha256 !== null
        || record.course.status !== "admitted"
        || record.course.reviewRound !== 1
        || record.course.correctionCommitCount !== 0) {
        return { ok: false, code: "RE-CRITIC-PROJECTION-GENESIS", index };
      }
    } else {
      const parent = records[index - 1];
      const transitionInvalid = criticProjectionTransitionCode(parent, record);
      if (transitionInvalid) return { ok: false, code: transitionInvalid, index };
    }
  }
  const admitted = records.filter(({ course }) => course.status === "admitted");
  const head = records.at(-1);
  const latestFindings = head.findings;
  const countBy = (values, catalog, key) => Object.fromEntries(
    catalog.map((entry) => [entry, values.filter((value) => value[key] === entry).length]),
  );
  const verdicts = {
    pending: admitted.filter(({ verdict }) => verdict.status === "pending").length,
    noFindings: admitted.filter(({ verdict }) => verdict.status === "no-findings").length,
    findings: admitted.filter(({ verdict }) => verdict.status === "findings").length,
    failed: admitted.filter(({ verdict }) => verdict.status === "failed").length,
  };
  const failures = Object.fromEntries(CRITIC_REVIEW_FAILURE_CLASSES.map((failure) => [
    failure,
    admitted.filter(({ verdict }) => verdict.failure === failure).length,
  ]));
  const projection = {
    schema: CRITIC_REVIEW_ECONOMY_PROJECTION_SCHEMA,
    inputSha256: sha256Canonical(records.map(({ recordSha256 }) => recordSha256)),
    requests: {
      admitted: admitted.length,
      courseGated: records.length - admitted.length,
    },
    consumption: {
      reviewRounds: Math.max(...admitted.map(({ course }) => course.reviewRound)),
      correctionCommits: Math.max(...admitted.map(({ course }) => course.correctionCommitCount)),
      maxReviewRounds: REVIEW_LIMITS.criticRounds,
      maxCorrectionCommits: REVIEW_LIMITS.correctionCommits,
      fullReviews: admitted.filter(({ request }) => request.mode === "full").length,
      deltaReviews: admitted.filter(({ request }) => request.mode === "delta").length,
    },
    verdicts,
    failures,
    findings: {
      total: latestFindings.length,
      bySeverity: countBy(latestFindings, CRITIC_FINDING_SEVERITIES, "severity"),
      byDisposition: countBy(latestFindings, CRITIC_FINDING_DISPOSITIONS, "status"),
    },
    retainedStages: {
      coverageReceipts: admitted.filter(({ coverage }) => coverage.receiptSha256 !== null).length,
      laneEvidence: admitted.length,
      resultDigests: admitted.filter(({ verdict }) => verdict.resultSha256 !== null).length,
    },
    status: head.course.status === "po-course-gate"
      ? "po-course-gate"
      : head.verdict.status === "no-findings"
        ? "converged"
        : head.verdict.status === "findings"
          ? "findings-open"
          : head.verdict.status,
  };
  return { ok: true, code: "RE-CRITIC-PROJECTION", projection };
}

function fallbackId(kind, seed) {
  return `${kind}-${sha256Canonical(seed).slice(0, 32)}`;
}

export function decideFailureAction(input) {
  if (!isObject(input) || !isObject(input.failure) || !isObject(input.counters)) {
    return { ok: false, action: "block", code: "RE-ACTION-SHAPE" };
  }
  let signature;
  try { signature = failureSignature(input.failure); } catch { return { ok: false, action: "block", code: "RE-FAILURE-SHAPE" }; }
  const { productRetryCount, environmentRerouteCount } = input.counters;
  if (!safeInteger(productRetryCount, 1) || !safeInteger(environmentRerouteCount, 1)) {
    return { ok: false, action: "block", code: "RE-COUNTER-SHAPE", signature };
  }
  const classification = classifyFailureEvidence(input.classificationEvidence);
  if (input.failure.faultDomain === "product") {
    if (classification.faultDomain !== "product") {
      return { ok: true, action: "unknown-blocker", code: "RE-PRODUCT-UNPROVEN", signature };
    }
    if (input.recoveredOriginChain === true) return { ok: true, action: "product-blocker", code: "RE-FALLBACK-PRODUCT-BLOCK", signature };
    if (productRetryCount === 0) return { ok: true, action: "product-retry", code: "RE-PRODUCT-RETRY-ONCE", signature, nextProductRetryCount: 1 };
    return {
      ok: true,
      action: "course-gate",
      code: "RE-PRODUCT-BUDGET-EXHAUSTED",
      signature,
      repeatedSignature: Array.isArray(input.priorFailureSignatures) && input.priorFailureSignatures.includes(signature),
    };
  }
  if (input.failure.faultDomain === "unknown") return { ok: true, action: "unknown-blocker", code: "RE-UNKNOWN-NO-RETRY", signature };
  if (classification.faultDomain !== "execution-environment"
    || !TRUSTED_ENVIRONMENT_CODES.includes(classification.code)) {
    return { ok: true, action: "unknown-blocker", code: "RE-ENVIRONMENT-UNPROVEN", signature };
  }
  const admission = input.failoverAdmission;
  const admissible = environmentRerouteCount === 0
    && isObject(admission)
    && admission.recoverySlotAvailable === true
    && admission.narrowRouteAvailable === true
    && admission.frozenBindingsMatch === true
    && admission.permissionsNarrowed === true
    && admission.mayDelegate === false
    && SAFE_ID.test(admission.originLaneId ?? "")
    && SAFE_ID.test(admission.originDispatchId ?? "")
    && safeInteger(admission.revision)
    && SHA256.test(admission.environmentEvidenceSha256 ?? "")
    && admission.environmentEvidenceSha256 === classification.evidenceSha256
    && SHA256.test(admission.narrowingContractSha256 ?? "");
  if (!admissible) return {
    ok: true,
    action: "course-gate",
    code: "RE-FAILOVER-NOT-ADMISSIBLE",
    signature,
    sameLaneRetryProhibited: true,
  };
  const seed = {
    originLaneId: admission.originLaneId,
    originDispatchId: admission.originDispatchId,
    revision: admission.revision,
    environmentEvidenceSha256: admission.environmentEvidenceSha256,
    narrowingContractSha256: admission.narrowingContractSha256,
  };
  const fallbackLaneId = fallbackId("fallback-lane", seed);
  const fallbackDispatchId = fallbackId("fallback-dispatch", { ...seed, fallbackLaneId });
  if (fallbackLaneId === admission.originLaneId || fallbackDispatchId === admission.originDispatchId) {
    return { ok: false, action: "block", code: "RE-FALLBACK-IDENTITY-COLLISION", signature };
  }
  return {
    ok: true,
    action: "environment-failover",
    code: "RE-ENVIRONMENT-FAILOVER-ONCE",
    signature,
    fallbackLaneId,
    fallbackDispatchId,
    nextEnvironmentRerouteCount: 1,
    productRetryCount,
    sameLaneRetryProhibited: true,
  };
}

function validProgress(vector) {
  return exactKeys(vector, PROGRESS_COMPONENTS)
    && PROGRESS_COMPONENTS.every((key) => safeInteger(vector[key]));
}

function validDiagnostic(diagnostic) {
  return diagnostic === null || (exactKeys(diagnostic, ["exitCode", "signal", "stdoutBytes", "stderrBytes", "stdoutOverflow", "stderrOverflow", "tailSha256", "capturedTailBytes"])
    && validNullableExit(diagnostic.exitCode)
    && validNullableSignal(diagnostic.signal)
    && safeInteger(diagnostic.stdoutBytes)
    && safeInteger(diagnostic.stderrBytes)
    && typeof diagnostic.stdoutOverflow === "boolean"
    && typeof diagnostic.stderrOverflow === "boolean"
    && SHA256.test(diagnostic.tailSha256)
    && safeInteger(diagnostic.capturedTailBytes, DIAGNOSTIC_TAIL_MAX_UTF8_BYTES));
}

export function evaluateProgress(previous, current, timing, diagnostic = null) {
  if (!validProgress(previous) || !validProgress(current)
    || !exactKeys(timing, ["nowMs", "lastProgressAtMs", "stagnationIntervalMs"])
    || !safeInteger(timing.nowMs) || !safeInteger(timing.lastProgressAtMs)
    || !safeInteger(timing.stagnationIntervalMs) || timing.stagnationIntervalMs < 1
    || timing.nowMs < timing.lastProgressAtMs || !validDiagnostic(diagnostic)) {
    return { ok: false, code: "RE-PROGRESS-SHAPE" };
  }
  if (PROGRESS_COMPONENTS.some((key) => current[key] < previous[key])) return { ok: false, code: "RE-PROGRESS-REGRESSION" };
  const advanced = PROGRESS_COMPONENTS.some((key) => current[key] > previous[key]);
  const lastProgressAtMs = advanced ? timing.nowMs : timing.lastProgressAtMs;
  const stagnant = !advanced && timing.nowMs - timing.lastProgressAtMs >= timing.stagnationIntervalMs;
  return {
    ok: true,
    code: advanced ? "RE-PROGRESS-ADVANCED" : stagnant ? "RE-STAGNANT" : "RE-PROGRESS-UNCHANGED",
    advanced,
    stagnant,
    lastProgressAtMs,
    diagnostic: stagnant ? diagnostic : null,
  };
}

export function admitCapacity(input) {
  if (!exactKeys(input, ["candidateFrozen", "sandboxedWork", "availableSlots", "criticSlotReserved", "recoverySlotReserved", "reviewRouteAvailable", "unavailabilityPolicy", "preauthorizedFallbackAvailable", "preauthorizedFallbackEvidenceSha256"])
    || typeof input.candidateFrozen !== "boolean" || typeof input.sandboxedWork !== "boolean"
    || !safeInteger(input.availableSlots) || typeof input.criticSlotReserved !== "boolean"
    || typeof input.recoverySlotReserved !== "boolean" || typeof input.reviewRouteAvailable !== "boolean"
    || !new Set(["defer", "preauthorized-fallback"]).has(input.unavailabilityPolicy)
    || typeof input.preauthorizedFallbackAvailable !== "boolean"
    || (input.preauthorizedFallbackEvidenceSha256 !== null && !SHA256.test(input.preauthorizedFallbackEvidenceSha256))) {
    return { ok: false, action: "block", code: "RE-CAPACITY-SHAPE" };
  }
  if (!input.candidateFrozen && (!input.criticSlotReserved || input.availableSlots < 1)) {
    return { ok: false, action: "capacity-blocker", code: "RE-CRITIC-SLOT-NOT-RESERVED" };
  }
  if (input.sandboxedWork && (!input.recoverySlotReserved || input.availableSlots < 1)) {
    return { ok: false, action: "capacity-blocker", code: "RE-RECOVERY-SLOT-NOT-RESERVED" };
  }
  const requiredDistinctSlots = (!input.candidateFrozen ? 1 : 0) + (input.sandboxedWork ? 1 : 0);
  if (input.availableSlots < requiredDistinctSlots) {
    return { ok: false, action: "capacity-blocker", code: "RE-DISTINCT-RESERVED-SLOTS-UNAVAILABLE" };
  }
  if (!input.reviewRouteAvailable) {
    if (input.unavailabilityPolicy === "preauthorized-fallback" && input.preauthorizedFallbackAvailable
      && SHA256.test(input.preauthorizedFallbackEvidenceSha256 ?? "")) {
      return { ok: true, action: "preauthorized-fallback", code: "RE-REVIEW-ROUTE-FALLBACK" };
    }
    return { ok: true, action: "defer", code: "RE-REVIEW-ROUTE-DEFER" };
  }
  return { ok: true, action: "continue", code: "RE-CAPACITY-ADMITTED" };
}

function validEvidenceList(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 32
    && value.every((entry) => exactKeys(entry, ["id", "sha256"]) && SAFE_ID.test(entry.id) && SHA256.test(entry.sha256))
    && new Set(value.map(({ id }) => id)).size === value.length;
}

function validStringList(value, maximum = 32) {
  return Array.isArray(value) && value.length <= maximum
    && value.every((entry) => typeof entry === "string" && SAFE_ID.test(entry))
    && new Set(value).size === value.length;
}

function validPathList(value, maximum = 128) {
  return Array.isArray(value) && value.length <= maximum
    && value.every(validRepoPath) && new Set(value).size === value.length;
}

function validTriggerRecord(record) {
  return exactKeys(record, ["attemptId", "attemptSha256", "resultId", "resultSha256", "evidence"])
    && SAFE_ID.test(record.attemptId ?? "") && SHA256.test(record.attemptSha256 ?? "")
    && SAFE_ID.test(record.resultId ?? "") && SHA256.test(record.resultSha256 ?? "")
    && validEvidenceList(record.evidence);
}

function validCourseOption(option) {
  const keys = ["optionId", "kind", "equivalenceKey", "expectedOutcome", "scopeDelta", "requiredEvidence", "timeCost", "residualRisk", "securityAssuranceClaims", "claimImpact", "reversibility", "authority", "permittedOperations", "trustBoundary", "newTrustBoundaries", "rollbackImpact", "resumeImpact", "resumePredicate", "continuationTransitionSha256"];
  return exactKeys(option, keys)
    && SAFE_ID.test(option.optionId ?? "") && COURSE_KINDS.includes(option.kind)
    && SAFE_ID.test(option.equivalenceKey ?? "") && typeof option.expectedOutcome === "string" && SAFE_ID.test(option.expectedOutcome)
    && exactKeys(option.scopeDelta, ["add", "modify", "remove"])
    && Object.values(option.scopeDelta).every((paths) => validPathList(paths))
    && new Set(Object.values(option.scopeDelta).flat()).size === Object.values(option.scopeDelta).flat().length
    && validEvidenceList(option.requiredEvidence)
    && exactKeys(option.timeCost, ["minimumMinutes", "maximumMinutes", "confidence"])
    && safeInteger(option.timeCost.minimumMinutes) && safeInteger(option.timeCost.maximumMinutes)
    && option.timeCost.maximumMinutes >= option.timeCost.minimumMinutes
    && new Set(["low", "medium", "high"]).has(option.timeCost.confidence)
    && SAFE_ID.test(option.residualRisk ?? "") && validStringList(option.securityAssuranceClaims)
    && exactKeys(option.claimImpact, ["addedClaims", "removedClaims", "retainedNonClaims"])
    && Object.values(option.claimImpact).every((claims) => validStringList(claims))
    && new Set(["reversible", "conditional", "irreversible"]).has(option.reversibility)
    && new Set(["po", "coordinator", "external"]).has(option.authority)
    && validStringList(option.permittedOperations)
    && new Set(["unchanged", "expanded"]).has(option.trustBoundary)
    && validStringList(option.newTrustBoundaries)
    && ((option.trustBoundary === "unchanged" && option.newTrustBoundaries.length === 0)
      || (option.trustBoundary === "expanded" && option.newTrustBoundaries.length > 0))
    && SAFE_ID.test(option.rollbackImpact ?? "") && SAFE_ID.test(option.resumeImpact ?? "")
    && (option.resumePredicate === null || SAFE_ID.test(option.resumePredicate))
    && (option.continuationTransitionSha256 === null || SHA256.test(option.continuationTransitionSha256))
    && (!["stop", "defer"].includes(option.kind) || option.authority === "po")
    && (option.kind !== "defer" || option.resumePredicate !== null)
    && (option.kind !== "stop" || option.resumePredicate === null)
    && (["stop", "defer"].includes(option.kind)
      ? option.continuationTransitionSha256 === null
      : SHA256.test(option.continuationTransitionSha256));
}

function validEliminatedCourse(entry) {
  return exactKeys(entry, ["kind", "reasonCode", "evidence"])
    && COURSE_KINDS.includes(entry.kind)
    && COURSE_ELIMINATION_REASONS.includes(entry.reasonCode)
    && validEvidenceList(entry.evidence);
}

export function validateCourseDecisionBrief(brief) {
  const keys = ["schema", "briefId", "featureId", "revision", "gateId", "blockerId", "commit", "tree", "authorityDigests", "catalogVersion", "catalogSha256", "normalizedFailureSignature", "similarityGroupId", "triggerEvidence", "observedCount", "configuredLimit", "gateTrigger", "consumedBudgets", "invariants", "nonClaims", "forbiddenOperations", "exactPoDecisionQuestion", "alternatives", "eliminated", "recommendation", "poDecisionRequired", "defaultAction"];
  if (!exactKeys(brief, keys) || brief.schema !== "pipeline.course-decision-brief.v1"
    || ![brief.briefId, brief.featureId, brief.gateId, brief.blockerId, brief.similarityGroupId].every((value) => SAFE_ID.test(value ?? ""))
    || !safeInteger(brief.revision) || !SHA40.test(brief.commit ?? "") || !SHA40.test(brief.tree ?? "")
    || !exactKeys(brief.authorityDigests, ["prd", "spec"])
    || !Object.values(brief.authorityDigests).every((digest) => SHA256.test(digest))
    || brief.catalogVersion !== COURSE_CATALOG_VERSION || brief.catalogSha256 !== COURSE_CATALOG_SHA256
    || !SHA256.test(brief.normalizedFailureSignature ?? "")
    || !Array.isArray(brief.triggerEvidence) || !brief.triggerEvidence.every(validTriggerRecord)
    || new Set(brief.triggerEvidence.map(({ attemptId }) => attemptId)).size !== brief.triggerEvidence.length
    || new Set(brief.triggerEvidence.map(({ resultId }) => resultId)).size !== brief.triggerEvidence.length
    || !safeInteger(brief.observedCount) || brief.observedCount < 1 || !safeInteger(brief.configuredLimit) || brief.configuredLimit < 1
    || brief.observedCount !== brief.triggerEvidence.length
    || !exactKeys(brief.gateTrigger, ["kind", "budget"])
    || !new Set(["repeated-signature", "budget-exhausted"]).has(brief.gateTrigger.kind)
    || (brief.gateTrigger.budget !== null && !new Set(["productRetries", "environmentReroutes", "reviewRounds", "correctionCommits"]).has(brief.gateTrigger.budget))
    || !exactKeys(brief.consumedBudgets, ["productRetries", "environmentReroutes", "reviewRounds", "correctionCommits"])
    || !safeInteger(brief.consumedBudgets.productRetries, 1) || !safeInteger(brief.consumedBudgets.environmentReroutes, 1)
    || !safeInteger(brief.consumedBudgets.reviewRounds, 4) || !safeInteger(brief.consumedBudgets.correctionCommits, 3)
    || !validStringList(brief.invariants) || brief.invariants.length === 0 || !validStringList(brief.nonClaims)
    || !validStringList(brief.forbiddenOperations) || brief.forbiddenOperations.length === 0 || typeof brief.exactPoDecisionQuestion !== "string"
    || brief.exactPoDecisionQuestion.length < 1 || brief.exactPoDecisionQuestion.length > 512
    || !Array.isArray(brief.alternatives) || !brief.alternatives.every(validCourseOption)
    || !Array.isArray(brief.eliminated) || !brief.eliminated.every(validEliminatedCourse)
    || brief.poDecisionRequired !== true || brief.defaultAction !== "no-action") {
    return { ok: false, code: "RE-BRIEF-SHAPE" };
  }
  const budgetLimits = { productRetries: 1, environmentReroutes: 1, reviewRounds: 4, correctionCommits: 3 };
  if (brief.gateTrigger.kind === "repeated-signature") {
    if (brief.gateTrigger.budget !== null || brief.observedCount <= brief.configuredLimit) return { ok: false, code: "RE-BRIEF-TRIGGER-NOT-PROVEN" };
  } else if (brief.gateTrigger.budget === null
    || brief.configuredLimit !== budgetLimits[brief.gateTrigger.budget]
    || brief.consumedBudgets[brief.gateTrigger.budget] !== budgetLimits[brief.gateTrigger.budget]) {
    return { ok: false, code: "RE-BRIEF-TRIGGER-NOT-PROVEN" };
  }
  const kinds = [...brief.alternatives.map(({ kind }) => kind), ...brief.eliminated.map(({ kind }) => kind)];
  if (kinds.length !== COURSE_KINDS.length || new Set(kinds).size !== COURSE_KINDS.length
    || COURSE_KINDS.some((kind) => !kinds.includes(kind))) return { ok: false, code: "RE-BRIEF-CATALOG-NOT-EXHAUSTED" };
  if (!["stop", "defer"].every((kind) => brief.alternatives.some((option) => option.kind === kind))) return { ok: false, code: "RE-BRIEF-STOP-DEFER-REQUIRED" };
  if (new Set(brief.alternatives.map(({ optionId }) => optionId)).size !== brief.alternatives.length
    || new Set(brief.alternatives.map(({ equivalenceKey }) => equivalenceKey)).size !== brief.alternatives.length) {
    return { ok: false, code: "RE-BRIEF-ALTERNATIVE-OVERLAP" };
  }
  if (brief.recommendation === null
    || !exactKeys(brief.recommendation, ["optionId", "evidence", "nonBinding"])
      || !brief.alternatives.some(({ optionId }) => optionId === brief.recommendation.optionId)
      || !validEvidenceList(brief.recommendation.evidence)
      || brief.recommendation.nonBinding !== true) return { ok: false, code: "RE-BRIEF-RECOMMENDATION" };
  return { ok: true, code: "RE-BRIEF-VALID", sha256: sha256Canonical(brief) };
}

export function buildCourseDecisionBrief(input) {
  const brief = {
    ...input,
    schema: "pipeline.course-decision-brief.v1",
    catalogVersion: COURSE_CATALOG_VERSION,
    catalogSha256: COURSE_CATALOG_SHA256,
    poDecisionRequired: true,
    defaultAction: "no-action",
  };
  const verdict = validateCourseDecisionBrief(brief);
  if (!verdict.ok) throw new TypeError(verdict.code);
  return { brief, sha256: verdict.sha256 };
}

export function validateCourseDecisionIntent(intent, binding) {
  const keys = ["schema", "idempotencyKey", "briefId", "briefSha256", "blockerSignature", "optionId", "poEvidenceSha256", "preStateSha256", "selectedTransitionSha256", "expectedRevision", "selectedRevision", "dispatchableRevision"];
  if (!exactKeys(intent, keys) || intent.schema !== "pipeline.course-decision-intent.v1"
    || ![intent.idempotencyKey, intent.briefId, intent.optionId].every((value) => SAFE_ID.test(value ?? ""))
    || !SHA256.test(intent.briefSha256 ?? "") || !SHA256.test(intent.blockerSignature ?? "") || !SHA256.test(intent.poEvidenceSha256 ?? "") || !SHA256.test(intent.preStateSha256 ?? "") || !SHA256.test(intent.selectedTransitionSha256 ?? "")
    || !safeInteger(intent.expectedRevision) || intent.selectedRevision !== intent.expectedRevision + 1
    || intent.dispatchableRevision !== intent.selectedRevision + 1
    || !exactKeys(binding, ["briefId", "briefSha256", "blockerSignature", "optionIds"])
    || binding.briefId !== intent.briefId || binding.briefSha256 !== intent.briefSha256
    || binding.blockerSignature !== intent.blockerSignature || !validStringList(binding.optionIds)
    || !binding.optionIds.includes(intent.optionId)) return { ok: false, code: "RE-INTENT-SHAPE-OR-BINDING" };
  return { ok: true, code: "RE-INTENT-VALID", sha256: sha256Canonical(intent) };
}

export function validateCourseDecisionReceipt(receipt, intent) {
  const keys = ["schema", "idempotencyKey", "intentSha256", "briefSha256", "blockerSignature", "optionId", "preStateSha256", "postStateSha256", "preRevision", "postRevision", "casOutcome"];
  if (!exactKeys(receipt, keys) || receipt.schema !== "pipeline.course-decision-receipt.v1"
    || !SAFE_ID.test(receipt.idempotencyKey ?? "") || !SHA256.test(receipt.intentSha256 ?? "")
    || !SHA256.test(receipt.briefSha256 ?? "") || !SHA256.test(receipt.blockerSignature ?? "")
    || !SAFE_ID.test(receipt.optionId ?? "") || !SHA256.test(receipt.preStateSha256 ?? "") || !SHA256.test(receipt.postStateSha256 ?? "")
    || !safeInteger(receipt.preRevision) || !safeInteger(receipt.postRevision)
    || !new Set(["applied", "stale", "conflict", "io-error"]).has(receipt.casOutcome)
    || !isObject(intent) || receipt.intentSha256 !== sha256Canonical(intent)
    || receipt.idempotencyKey !== intent.idempotencyKey || receipt.briefSha256 !== intent.briefSha256
    || receipt.blockerSignature !== intent.blockerSignature || receipt.optionId !== intent.optionId
    || receipt.preRevision !== intent.expectedRevision) return { ok: false, code: "RE-RECEIPT-SHAPE-OR-BINDING" };
  if (receipt.casOutcome === "applied") {
    if (receipt.postRevision !== intent.selectedRevision || receipt.postRevision !== receipt.preRevision + 1
      || receipt.postStateSha256 === receipt.preStateSha256) return { ok: false, code: "RE-RECEIPT-APPLIED-COHERENCE" };
  } else if (receipt.postRevision !== receipt.preRevision || receipt.postStateSha256 !== receipt.preStateSha256) {
    return { ok: false, code: "RE-RECEIPT-NONAPPLIED-COHERENCE" };
  }
  return { ok: true, code: "RE-RECEIPT-VALID", sha256: sha256Canonical(receipt) };
}

export function validateWorkflowFallbackReceipt(receipt) {
  const keys = ["schema", "creatorDuty", "featureId", "revision", "packageId", "actionId", "origin", "fault", "sameLaneRetryProhibited", "fallback", "bindings", "permissions", "budgets", "outputSchemaSha256", "mayDelegate", "globalWritesProhibited", "outcome", "resultSha256", "assurance"];
  if (!exactKeys(receipt, keys) || receipt.schema !== "pipeline.workflow-fallback-receipt.v1" || receipt.creatorDuty !== "Coordinator"
    || ![receipt.featureId, receipt.packageId, receipt.actionId].every((value) => SAFE_ID.test(value ?? "")) || !safeInteger(receipt.revision)
    || !exactKeys(receipt.origin, ["dispatchId", "attemptId", "laneId"])
    || !Object.values(receipt.origin).every((value) => SAFE_ID.test(value))
    || !exactKeys(receipt.fault, ["code", "evidenceSha256"]) || !TRUSTED_ENVIRONMENT_CODES.includes(receipt.fault.code) || !SHA256.test(receipt.fault.evidenceSha256)
    || receipt.sameLaneRetryProhibited !== true
    || !exactKeys(receipt.fallback, ["laneId", "dispatchId", "environmentRerouteCount"])
    || !SAFE_ID.test(receipt.fallback.laneId ?? "") || !SAFE_ID.test(receipt.fallback.dispatchId ?? "") || receipt.fallback.environmentRerouteCount !== 1
    || receipt.fallback.laneId === receipt.origin.laneId || receipt.fallback.dispatchId === receipt.origin.dispatchId
    || !exactKeys(receipt.bindings, ["taskSha256", "commit", "tree", "inputSha256", "authorityPaths", "authorityDigests"])
    || !SHA256.test(receipt.bindings.taskSha256) || !SHA40.test(receipt.bindings.commit) || !SHA40.test(receipt.bindings.tree) || !SHA256.test(receipt.bindings.inputSha256)
    || !exactKeys(receipt.bindings.authorityPaths, ["prd", "spec", "result"])
    || !Object.values(receipt.bindings.authorityPaths).every((path) => validRepoPath(path))
    || !exactKeys(receipt.bindings.authorityDigests, ["prd", "spec", "result"])
    || !Object.values(receipt.bindings.authorityDigests).every((digest) => SHA256.test(digest))
    || !exactKeys(receipt.permissions, ["readPaths", "writePaths", "tools"])
    || !Array.isArray(receipt.permissions.readPaths) || !Array.isArray(receipt.permissions.writePaths)
    || ![...receipt.permissions.readPaths, ...receipt.permissions.writePaths].every((path) => validRepoPath(path))
    || receipt.permissions.writePaths.some((path) => path.startsWith(".claude/") || path.startsWith(".pipeline/")
      || path === "docs/state.md" || Object.values(receipt.bindings.authorityPaths).includes(path))
    || !validStringList(receipt.permissions.tools)
    || !exactKeys(receipt.budgets, ["walltimeMs", "turns", "commands", "outputBytes"])
    || !Object.values(receipt.budgets).every((value) => safeInteger(value) && value > 0)
    || !SHA256.test(receipt.outputSchemaSha256 ?? "") || receipt.mayDelegate !== false || receipt.globalWritesProhibited !== true
    || !new Set(["pending", "running", "succeeded", "failed", "blocked"]).has(receipt.outcome)
    || (receipt.resultSha256 !== null && !SHA256.test(receipt.resultSha256))
    || (receipt.outcome === "succeeded" && receipt.resultSha256 === null)
    || (new Set(["pending", "running"]).has(receipt.outcome) && receipt.resultSha256 !== null)
    || receipt.assurance !== "normal-contractual-read-only; OS isolation not asserted") return { ok: false, code: "RE-FALLBACK-RECEIPT-SHAPE" };
  return { ok: true, code: "RE-FALLBACK-RECEIPT-VALID", sha256: sha256Canonical(receipt) };
}
