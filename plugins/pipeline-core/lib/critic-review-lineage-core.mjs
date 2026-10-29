// SPDX-License-Identifier: SUL-1.0
/**
 * Pure validation half of the closed Critic review lineage.
 *
 * This module holds the record shape, chain and transition validators that
 * critic-review-lineage.mjs re-exports unchanged. It is deliberately free of
 * file, process, child-process and import.meta access so that pure consumers
 * (the interruption source adapter) can depend on the validators without
 * reaching the Git/filesystem-reading admission and compile paths.
 * It imports only review-economy.mjs (node:crypto). Keep it that way: the
 * adapter's ambient-I/O tripwire test evaluates this module's entire import graph.
 */
import {
  REVIEW_LIMITS,
  canonicalJson,
  sha256Canonical,
} from "./review-economy.mjs";

export const CRITIC_REVIEW_LINEAGE_SCHEMA = "pipeline.critic-review-lineage.v1";
export const RELEASE_CRITIC_REVIEW_SCOPE_SCHEMA = "pipeline.release-critic-review-scope.v1";
export const CRITIC_REVIEW_FAILURES = Object.freeze([
  "no-result",
  "empty",
  "timeout",
  "child",
  "malformed",
  "incomplete",
  "drift",
  "internal",
]);
export const CRITIC_FINDING_SEVERITIES = Object.freeze(["critical", "high", "medium", "low"]);
export const CRITIC_FINDING_DISPOSITIONS = Object.freeze(["open", "fixed", "withdrawn", "superseded"]);
export const CRITIC_INVALIDATION_REASONS = Object.freeze([
  "explicit-broad-review",
  "delta-bindings-invalid",
  "unknown-changed-path",
  "trust-boundary-change",
  "impact-ambiguous",
  "prior-review-failure",
]);

const SHA = /^[a-f0-9]{64}$/u;
export const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
// Any legitimate file name character; refuses C0/DEL/C1 controls (line breaks and NUL included) and the backslash anywhere.
// The negated empty class matches line breaks too, unlike a dot.
const PATH = /^(?!\/)(?![^]*[\u0000-\u001f\u007f-\u009f\\])[^]{1,512}$/u;
const PACKET_ID = /^[a-f0-9]{32}$/u;
const VERDICTS = new Set(["pending", "no-findings", "findings", "failed"]);
const FAILURES = new Set(CRITIC_REVIEW_FAILURES);
const FINDING_STATES = new Set(CRITIC_FINDING_DISPOSITIONS);
const SEVERITIES = new Set(CRITIC_FINDING_SEVERITIES);
export const INVALIDATION_REASONS = new Set(CRITIC_INVALIDATION_REASONS);
const REVIEW_MODES = new Set(["full", "delta", "none"]);
const COURSE_STATUSES = new Set(["admitted", "po-course-gate"]);
const ROOT_KEYS = Object.freeze([
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
export const REVIEW_ATTEMPT_KEYS = new Set([
  "round",
  "correctionCommits",
  "requestedMode",
  "base",
  "head",
  "tree",
  "changedPaths",
  "changedBehaviorClaims",
  "priorReceipt",
  "pathInvariantMap",
  "pathInvariantMapSha256",
  "coordinatorImpactConfirmed",
  "trustBoundaryChanged",
  "impactAmbiguous",
]);

export const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export const exact = (value, keys) => object(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));
export const digest = (value) => typeof value === "string" && SHA.test(value);
export const identifier = (value) => typeof value === "string" && ID.test(value);
export const safePath = (value) => typeof value === "string"
  && PATH.test(value)
  && Buffer.byteLength(value, "utf8") <= 512
  && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
export const sortedUnique = (values, valid, { allowEmpty = false, maximum = 256 } = {}) => Array.isArray(values)
  && (allowEmpty || values.length > 0)
  && values.length <= maximum
  && values.every(valid)
  && values.every((value, index) => index === 0 || values[index - 1] < value);
export const same = (left, right) => canonicalJson(left) === canonicalJson(right);
export const recordCore = ({ recordSha256: _recordSha256, ...core }) => core;

export function candidateCode(value) {
  return exact(value, ["commit", "tree"])
    && [value.commit, value.tree].every((entry) => typeof entry === "string" && OID.test(entry))
    ? null
    : "CRL-SHAPE-CANDIDATE";
}

export function orderedRows(rows, valid, key, { allowEmpty = false } = {}) {
  return Array.isArray(rows)
    && (allowEmpty || rows.length > 0)
    && rows.length <= 256
    && rows.every(valid)
    && rows.every((row, index) => index === 0 || key(rows[index - 1]) < key(row));
}

export function packetCode(packet) {
  if (!object(packet)
    || !PACKET_ID.test(packet.packetId ?? "")
    || !exact(packet.candidate, ["base", "commit", "tree"])
    || ![packet.candidate.base, packet.candidate.commit, packet.candidate.tree].every((entry) => OID.test(entry))
    || !exact(packet.diff, ["base", "commit", "path", "bytes", "sha256"])
    || packet.diff.base !== packet.candidate.base
    || packet.diff.commit !== packet.candidate.commit
    || !safePath(packet.diff.path)
    || !Number.isSafeInteger(packet.diff.bytes)
    || packet.diff.bytes < 0
    || !digest(packet.diff.sha256)
    || !sortedUnique(packet.diffPaths, safePath)
    || !object(packet.bindings)
    || !["requestSha256", "diffPathsSha256", "governanceSha256"].every((key) => digest(packet.bindings[key]))
    || !object(packet.request)) {
    return "CRL-PACKET-SHAPE";
  }
  return null;
}

export function packageCode(packages, coverage) {
  const valid = orderedRows(
    packages,
    (row) => exact(row, ["id", "subjectSha256", "changedPaths", "integrationEdges"])
      && identifier(row.id)
      && digest(row.subjectSha256)
      && sortedUnique(row.changedPaths, safePath)
      && sortedUnique(row.integrationEdges, identifier, { allowEmpty: true }),
    (row) => row.id,
  );
  if (!valid) return "CRL-SHAPE-PACKAGES";
  const flattenedPaths = packages.flatMap(({ changedPaths }) => changedPaths);
  if (new Set(flattenedPaths).size !== flattenedPaths.length) return "CRL-PACKAGE-PATH-OVERLAP";
  const packagePaths = [...flattenedPaths].sort();
  const packageEdges = [...new Set(packages.flatMap(({ integrationEdges }) => integrationEdges))].sort();
  if (!same(packagePaths, coverage.changedPaths) || !same(packageEdges, coverage.integrationEdges)) {
    return "CRL-PACKAGE-CLOSURE";
  }
  return null;
}

export function coverageCode(coverage) {
  if (!exact(coverage, ["changedPaths", "acceptanceIds", "integrationEdges", "complete", "receiptSha256"])
    || !sortedUnique(coverage.changedPaths, safePath)
    || !sortedUnique(coverage.acceptanceIds, identifier)
    || !sortedUnique(coverage.integrationEdges, identifier)
    || typeof coverage.complete !== "boolean"
    || !(coverage.receiptSha256 === null || digest(coverage.receiptSha256))) {
    return "CRL-SHAPE-COVERAGE";
  }
  if (coverage.complete !== (coverage.receiptSha256 !== null)) return "CRL-COVERAGE-RECEIPT";
  return null;
}

function findingCode(findings) {
  return orderedRows(
    findings,
    (row) => exact(row, ["id", "priorFindingId", "severity", "status", "evidenceSha256"])
      && identifier(row.id)
      && (row.priorFindingId === null || identifier(row.priorFindingId))
      && SEVERITIES.has(row.severity)
      && FINDING_STATES.has(row.status)
      && digest(row.evidenceSha256),
    (row) => row.id,
    { allowEmpty: true },
  )
    ? null
    : "CRL-SHAPE-FINDINGS";
}

export function invalidationCode(invalidation) {
  if (!exact(invalidation, ["kind", "reason", "evidenceSha256"])
    || !["none", "full-review-required"].includes(invalidation.kind)
    || !(invalidation.reason === null || INVALIDATION_REASONS.has(invalidation.reason))
    || !(invalidation.evidenceSha256 === null || digest(invalidation.evidenceSha256))) {
    return "CRL-SHAPE-INVALIDATION";
  }
  const none = invalidation.kind === "none";
  return none === (invalidation.reason === null && invalidation.evidenceSha256 === null)
    ? null
    : "CRL-INVALIDATION";
}

function courseCode(course) {
  if (!exact(course, ["reviewRound", "correctionCommitCount", "maxReviewRounds", "maxCorrectionCommits", "status"])
    || !Number.isSafeInteger(course.reviewRound)
    || course.reviewRound < 1
    || !Number.isSafeInteger(course.correctionCommitCount)
    || course.correctionCommitCount < 0
    || course.maxReviewRounds !== REVIEW_LIMITS.criticRounds
    || course.maxCorrectionCommits !== REVIEW_LIMITS.correctionCommits
    || !COURSE_STATUSES.has(course.status)) {
    return "CRL-SHAPE-COURSE";
  }
  const exhausted = course.reviewRound > REVIEW_LIMITS.criticRounds
    || course.correctionCommitCount > REVIEW_LIMITS.correctionCommits;
  // D190: a po-course-gate record must be exhausted; an admitted (diff) record may exceed the old limits.
  return course.status === "po-course-gate" && !exhausted ? "CRL-COURSE-GATE" : null;
}

export function compiledRequest(record) {
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
    ...(record.schema==='pipeline.critic-review-lineage.v2'?{courseBinding:record.courseBinding,consumedResult:record.consumedResult}:{}),
  };
}

function verdictCode(record) {
  const { verdict, coverage, findings } = record;
  if (!exact(verdict, ["status", "schemaValid", "resultSha256", "failure"])
    || !VERDICTS.has(verdict.status)
    || typeof verdict.schemaValid !== "boolean"
    || !(verdict.resultSha256 === null || digest(verdict.resultSha256))
    || !(verdict.failure === null || FAILURES.has(verdict.failure))) {
    return "CRL-SHAPE-VERDICT";
  }
  if (verdict.status === "pending") {
    return !verdict.schemaValid
      && verdict.resultSha256 === null
      && verdict.failure === null
      && coverage.complete === false
      ? null
      : "CRL-PENDING";
  }
  if (verdict.status === "no-findings") {
    return verdict.schemaValid
      && digest(verdict.resultSha256)
      && verdict.failure === null
      && coverage.complete === true
      && findings.every(({ status }) => status !== "open")
      ? null
      : "CRL-NO-FINDINGS";
  }
  if (verdict.status === "findings") {
    return verdict.schemaValid
      && digest(verdict.resultSha256)
      && verdict.failure === null
      && coverage.complete === true
      && findings.some(({ status }) => status === "open")
      ? null
      : "CRL-FINDINGS";
  }
  if (verdict.schemaValid || verdict.failure === null) return "CRL-FAILED";
  if (verdict.failure === "no-result" && verdict.resultSha256 !== null) return "CRL-FAILED-NO-RESULT";
  if (["empty", "malformed", "incomplete"].includes(verdict.failure) && !digest(verdict.resultSha256)) {
    return "CRL-FAILED-DELIVERED";
  }
  if (verdict.failure === "incomplete" && coverage.complete) return "CRL-FAILED-INCOMPLETE";
  return null;
}

function lineageCode(record) {
  const v2=record?.schema==='pipeline.critic-review-lineage.v2';
  if (!exact(record, v2?[...ROOT_KEYS,'courseBinding','consumedResult']:ROOT_KEYS)
    || !(record.schema === CRITIC_REVIEW_LINEAGE_SCHEMA || v2)
    || !identifier(record.reviewId)
    || !(record.parentReviewId === null || identifier(record.parentReviewId))
    || candidateCode(record.candidate)
    || !exact(record.diff, ["base", "sha256", "changedPaths"])
    || !OID.test(record.diff.base)
    || !digest(record.diff.sha256)
    || !sortedUnique(record.diff.changedPaths, safePath)
    || !exact(record.references, ["packetSha256", "requestSha256", "diffPathsSha256", "governanceSha256"])
    || !Object.values(record.references).every(digest)
    || coverageCode(record.coverage)
    || !exact(record.request, ["packetId", "requestSha256", "compiledSha256", "mode", "admissionCode"])
    || !PACKET_ID.test(record.request.packetId)
    || !digest(record.request.requestSha256)
    || !digest(record.request.compiledSha256)
    || !REVIEW_MODES.has(record.request.mode)
    || typeof record.request.admissionCode !== "string"
    || !/^RE-[A-Z0-9-]{1,96}$/u.test(record.request.admissionCode)
    || !exact(record.lane, ["laneId", "contextSha256", "independent", "evidenceSha256", "freshFromReviewId"])
    || !identifier(record.lane.laneId)
    || !digest(record.lane.contextSha256)
    || record.lane.independent !== true
    || !digest(record.lane.evidenceSha256)
    || !(record.lane.freshFromReviewId === null || identifier(record.lane.freshFromReviewId))
    || findingCode(record.findings)
    || !(record.correction === null || (exact(record.correction, ["commit", "deltaSha256", "impactSha256"])
      && OID.test(record.correction.commit)
      && digest(record.correction.deltaSha256)
      && digest(record.correction.impactSha256)))
    || invalidationCode(record.invalidation)
    || courseCode(record.course)
    || !(record.previousSha256 === null || digest(record.previousSha256))
    || !digest(record.recordSha256)) {
    return "CRL-SHAPE";
  }
  if(v2){const bound=v2BindingCode(record);if(bound)return bound;}
  if (!same(record.diff.changedPaths, record.coverage.changedPaths)) return "CRL-COVERAGE-BINDING";
  const packagesInvalid = packageCode(record.packages, record.coverage);
  if (packagesInvalid) return packagesInvalid;
  if (record.request.requestSha256 !== record.references.requestSha256
    || record.request.compiledSha256 !== sha256Canonical(compiledRequest(record))) {
    return "CRL-REQUEST-BINDING";
  }
  const verdictInvalid = verdictCode(record);
  if (verdictInvalid) return verdictInvalid;
  if (record.parentReviewId === null
    ? record.previousSha256 !== null || record.lane.freshFromReviewId !== null || record.correction !== null
    : record.previousSha256 === null || record.lane.freshFromReviewId !== record.parentReviewId) {
    return "CRL-CHAIN";
  }
  if (record.parentReviewId === null
    && ["pending", "failed"].includes(record.verdict.status)
    && record.findings.length !== 0) {
    return "CRL-GENESIS-FINDINGS";
  }
  if (record.parentReviewId === null
    && record.findings.some(({ priorFindingId, status }) => priorFindingId !== null || status !== "open")) {
    return "CRL-GENESIS-FINDINGS";
  }
  if (record.course.status === "po-course-gate") {
    if (record.parentReviewId === null
      || record.request.mode !== "none"
      || record.request.admissionCode !== "RE-PO-COURSE-GATE"
      || record.verdict.status !== "pending"
      || record.correction !== null
      || record.invalidation.kind !== "none") {
      return "CRL-COURSE-GATE";
    }
  } else if (record.request.mode === "none") {
    return "CRL-REQUEST-MODE";
  }
  if (record.request.mode === "delta" && record.invalidation.kind !== "none") return "CRL-DELTA-INVALIDATION";
  if (record.request.mode === "full" && record.parentReviewId === null && record.invalidation.kind !== "none") {
    return "CRL-FIRST-INVALIDATION";
  }
  if (record.request.mode === "full" && record.parentReviewId !== null && record.invalidation.kind !== "full-review-required") {
    return "CRL-FULL-INVALIDATION";
  }
  if (record.correction !== null && (record.correction.commit !== record.candidate.commit
    || record.correction.deltaSha256 !== record.diff.sha256
    || record.correction.impactSha256 !== sha256Canonical(record.coverage.integrationEdges))) {
    return "CRL-CORRECTION-BINDING";
  }
  if (record.findings.some(({ status }) => status === "superseded")
    && record.invalidation.kind !== "full-review-required") {
    return "CRL-SUPERSEDED-WITHOUT-INVALIDATION";
  }
  return record.recordSha256 === sha256Canonical(recordCore(record)) ? null : "CRL-DIGEST";
}

export function transitionCode(parent, current) {
  if (parent.course.status !== "admitted") return "CRL-HISTORY-AFTER-GATE";
  if (current.parentReviewId !== parent.reviewId
    || current.previousSha256 !== parent.recordSha256
    || current.reviewId === parent.reviewId
    || current.lane.freshFromReviewId !== parent.reviewId
    || current.lane.laneId === parent.lane.laneId
    || current.lane.contextSha256 === parent.lane.contextSha256) {
    return "CRL-HISTORY-CHAIN";
  }
  if (current.course.status === "po-course-gate") {
    if (!same(current.candidate, parent.candidate)
      || !same(current.diff, parent.diff)
      || !same(current.findings, parent.findings)) {
      return "CRL-HISTORY-COURSE-GATE-BINDING";
    }
    const roundStep = current.course.reviewRound - parent.course.reviewRound;
    const correctionStep = current.course.correctionCommitCount - parent.course.correctionCommitCount;
    const boundedNextStep = [0, 1].includes(roundStep)
      && Number.isSafeInteger(correctionStep) && correctionStep >= 0
      && roundStep + correctionStep >= 1;
    const crossesRound = parent.course.reviewRound === REVIEW_LIMITS.criticRounds
      && current.course.reviewRound === REVIEW_LIMITS.criticRounds + 1;
    const crossesCorrection = parent.course.correctionCommitCount <= REVIEW_LIMITS.correctionCommits
      && current.course.correctionCommitCount > REVIEW_LIMITS.correctionCommits;
    return boundedNextStep && (crossesRound || crossesCorrection) ? null : "CRL-HISTORY-COURSE-GATE";
  }
  if (current.course.reviewRound !== parent.course.reviewRound + 1) return "CRL-HISTORY-ROUND";
  const correctionDelta = current.course.correctionCommitCount - parent.course.correctionCommitCount;
  if (!Number.isSafeInteger(correctionDelta) || correctionDelta < 0) return "CRL-HISTORY-CORRECTIONS";
  if (correctionDelta > 0) {
    if (current.correction === null
      || current.diff.base !== parent.candidate.commit
      || current.correction.commit !== current.candidate.commit) {
      return "CRL-HISTORY-CORRECTION-BINDING";
    }
  } else {
    if (current.correction !== null
      || !same(current.candidate, parent.candidate)
      || !same(current.diff, parent.diff)
      || parent.verdict.status !== "failed"
      || current.invalidation.reason !== "prior-review-failure") {
      return "CRL-HISTORY-RERUN";
    }
  }
  if (["pending", "failed"].includes(current.verdict.status)) {
    return same(current.findings, parent.findings) ? null : "CRL-HISTORY-RETAINED-FINDINGS";
  }
  const parentById = new Map(parent.findings.map((finding) => [finding.id, finding]));
  const currentById = new Map(current.findings.map((finding) => [finding.id, finding]));
  for (const prior of parent.findings.filter(({ status }) => status === "open")) {
    const next = currentById.get(prior.id);
    if (!next || next.priorFindingId !== prior.id || next.severity !== prior.severity) {
      return "CRL-HISTORY-FINDING-DROPPED";
    }
  }
  for (const finding of current.findings) {
    const prior = finding.priorFindingId === null ? null : parentById.get(finding.priorFindingId);
    if(current.schema==='pipeline.critic-review-lineage.v2' && prior?.status!=='open' && same(finding,prior))continue;
    if (prior === null) {
      if (finding.status !== "open" || parentById.has(finding.id)) return "CRL-HISTORY-NEW-FINDING";
    } else if (!prior || prior.status !== "open" || finding.id !== prior.id) {
      return "CRL-HISTORY-FINDING-LINEAGE";
    }
  }
  return null;
}

export function criticReviewLineageDigest(record) {
  return lineageCode(record) ? null : record.recordSha256;
}

export function validateCriticReviewLineage(record) {
  const code = lineageCode(record);
  return code ? { ok: false, code } : { ok: true, code: null };
}

/** Validate a complete oldest-to-newest synthetic or retained review course. */
// The PO decision removed the round cap; this bound only protects against a corrupt file.
const MAX_COURSE_HISTORY_RECORDS = 4096;

export function validateCriticReviewHistory(records) {
  if (!Array.isArray(records) || records.length < 1 || records.length > MAX_COURSE_HISTORY_RECORDS) {
    return { ok: false, code: "CRL-HISTORY-SHAPE" };
  }
  const reviewIds = new Set();
  const laneIds = new Set();
  const contextDigests = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const invalid = lineageCode(record);
    if (invalid) return { ok: false, code: invalid, index };
    if (reviewIds.has(record.reviewId) || laneIds.has(record.lane.laneId)
      || contextDigests.has(record.lane.contextSha256)) {
      return { ok: false, code: "CRL-HISTORY-IDENTITY-REUSE", index };
    }
    reviewIds.add(record.reviewId);
    laneIds.add(record.lane.laneId);
    contextDigests.add(record.lane.contextSha256);
    if (index === 0) {
      if (record.parentReviewId !== null || record.previousSha256 !== null
        || record.course.status === "po-course-gate"
        || record.course.status === "admitted"
          && (record.course.reviewRound !== 1 || record.course.correctionCommitCount !== 0)) {
        return { ok: false, code: "CRL-HISTORY-GENESIS", index };
      }
    } else {
      const transitionInvalid = transitionCode(records[index - 1], record);
      if (transitionInvalid) return { ok: false, code: transitionInvalid, index };
    }
  }
  return { ok: true, code: null, headSha256: records.at(-1).recordSha256 };
}

const COURSE_BINDING_KEYS=['courseKey','originalFeatureId','originalManifestSha256','genesisCandidate','submissionSha256','envelopeSha256','criterionSha256','deltaRequestSha256','deterministicEvidenceSha256','courseSourceSha256','courseDecisionSha256'];
function v2BindingCode(record){
 const b=record.courseBinding,c=record.consumedResult;
 if(!exact(b,COURSE_BINDING_KEYS)||!identifier(b.originalFeatureId)||!digest(b.courseKey)||!digest(b.originalManifestSha256)
  ||!exact(b.genesisCandidate,['base','commit','tree'])||!Object.values(b.genesisCandidate).every(v=>OID.test(v??''))
  ||!['submissionSha256','envelopeSha256','criterionSha256','deltaRequestSha256'].every(k=>b[k]===null||digest(b[k]))
  ||!['deterministicEvidenceSha256','courseSourceSha256','courseDecisionSha256'].every(k=>digest(b[k])))return 'CRL-V2-COURSE-BINDING';
 if(record.course.reviewRound>2 && (!digest(b.submissionSha256)||!digest(b.envelopeSha256)||!digest(b.criterionSha256)))return 'CRL-V2-EXCEPTION-BINDING';
 if(record.course.reviewRound===1 ? b.deltaRequestSha256!==null : !digest(b.deltaRequestSha256))return 'CRL-V2-DELTA-BINDING';
 if(record.verdict.status==='pending')return c===null?null:'CRL-V2-PENDING-CONSUMED';
 if(!exact(c,['packetId','packetDigest','receiptSha256','resultSha256','verdictSha256','findingBindings'])||c.packetId!==record.request.packetId
  ||!['packetDigest','receiptSha256','resultSha256','verdictSha256'].every(k=>digest(c[k]))
  ||c.receiptSha256!==record.coverage.receiptSha256||c.resultSha256!==record.verdict.resultSha256
  ||!Array.isArray(c.findingBindings)||c.findingBindings.length>256)return 'CRL-V2-CONSUMED-BINDING';
 const ids=new Set();for(let index=0;index<c.findingBindings.length;index++){const row=c.findingBindings[index];if(!exact(row,['findingId','index','sha256'])||!identifier(row.findingId)||row.index!==index||!digest(row.sha256)||ids.has(row.findingId)||!record.findings.some(f=>f.id===row.findingId&&f.evidenceSha256===row.sha256))return 'CRL-V2-FINDING-BINDING';ids.add(row.findingId);}
 if(record.verdict.status==='findings' && c.findingBindings.length===0)return 'CRL-V2-FINDINGS-EMPTY';
 if(record.verdict.status==='no-findings' && c.findingBindings.length!==0)return 'CRL-V2-PASS-FINDINGS';
 return null;
}
