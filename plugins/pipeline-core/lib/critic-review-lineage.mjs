// SPDX-License-Identifier: SUL-1.0
/**
 * Closed, immutable Critic review lineage for Nova A5.
 *
 * This module neither launches a Critic nor stores a record.  It only compiles
 * and validates records that bind a prepared packet to one review course.
 */
import { admitReviewAttempt, canonicalJson, sha256Canonical } from "./review-economy.mjs";

export const CRITIC_REVIEW_LINEAGE_SCHEMA = "pipeline.critic-review-lineage.v1";
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PATH = /^(?!\/)(?!.*\\)[A-Za-z0-9._/-]{1,240}$/u;
const VERDICTS = new Set(["pending", "no-findings", "findings", "invalid"]);
const FINDING_STATES = new Set(["open", "fixed", "withdrawn", "superseded"]);
const FAILURES = new Set(["transport", "parse", "truncated", "infrastructure"]);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const sortedUnique = (values, valid) => Array.isArray(values) && values.length > 0 && values.length <= 256
  && values.every(valid) && values.every((value, index) => index === 0 || values[index - 1] < value);
const safePath = (value) => typeof value === "string" && PATH.test(value)
  && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
const candidate = (value) => exact(value, ["base", "commit", "tree"])
  && [value.base, value.commit, value.tree].every((entry) => OID.test(entry));
const digest = (value) => SHA.test(value);
const recordCore = (record) => {
  const { recordSha256, ...core } = record;
  return core;
};

function orderedRows(rows, valid, key) {
  return Array.isArray(rows) && rows.length > 0 && rows.length <= 256 && rows.every(valid)
    && rows.every((row, index) => index === 0 || key(rows[index - 1]) < key(row));
}

function packetCode(packet) {
  if (!object(packet) || !candidate(packet.candidate) || !exact(packet.diff, ["base", "commit", "path", "bytes", "sha256"])
    || !digest(packet.diff.sha256) || !Array.isArray(packet.diffPaths) || !packet.diffPaths.length
    || !packet.diffPaths.every(safePath) || !packet.diffPaths.every((path, index) => index === 0 || packet.diffPaths[index - 1] < path)
    || !object(packet.bindings) || !["requestSha256", "diffPathsSha256", "governanceSha256"].every((key) => digest(packet.bindings[key]))
    || typeof packet.packetId !== "string" || !/^[a-f0-9]{32}$/u.test(packet.packetId)) return "CRL-PACKET-SHAPE";
  return null;
}

function lineageCode(record) {
  const root = ["schema", "reviewId", "parentReviewId", "candidate", "diff", "references", "packages", "coverage", "request", "lane", "verdict", "findings", "correction", "invalidation", "course", "previousSha256", "recordSha256"];
  if (!exact(record, root) || record.schema !== CRITIC_REVIEW_LINEAGE_SCHEMA || !ID.test(record.reviewId)
    || !(record.parentReviewId === null || ID.test(record.parentReviewId)) || !candidate(record.candidate)
    || !exact(record.diff, ["sha256", "paths"]) || !digest(record.diff.sha256) || !sortedUnique(record.diff.paths, safePath)
    || !exact(record.references, ["packetSha256", "requestSha256", "diffPathsSha256", "governanceSha256"])
    || !Object.values(record.references).every(digest)
    || !orderedRows(record.packages, (row) => exact(row, ["id", "subjectSha256"]) && ID.test(row.id) && digest(row.subjectSha256), (row) => row.id)
    || !exact(record.coverage, ["paths", "acceptanceIds", "integrationEdges", "complete"])
    || !sortedUnique(record.coverage.paths, safePath) || !sortedUnique(record.coverage.acceptanceIds, (value) => ID.test(value))
    || !sortedUnique(record.coverage.integrationEdges, (value) => ID.test(value)) || record.coverage.complete !== true
    || !exact(record.request, ["packetId", "requestSha256", "compiledSha256"])
    || !/^[a-f0-9]{32}$/u.test(record.request.packetId) || !digest(record.request.requestSha256) || !digest(record.request.compiledSha256)
    || !exact(record.lane, ["laneId", "independent", "evidenceSha256", "freshFromReviewId"])
    || !ID.test(record.lane.laneId) || record.lane.independent !== true || !digest(record.lane.evidenceSha256)
    || !(record.lane.freshFromReviewId === null || ID.test(record.lane.freshFromReviewId))
    || !exact(record.verdict, ["status", "schemaValid", "resultSha256", "failure"])
    || !VERDICTS.has(record.verdict.status) || typeof record.verdict.schemaValid !== "boolean"
    || !(record.verdict.resultSha256 === null || digest(record.verdict.resultSha256))
    || !(record.verdict.failure === null || FAILURES.has(record.verdict.failure))
    || !(Array.isArray(record.findings) && record.findings.length <= 256 && record.findings.every((row) => exact(row, ["id", "status", "evidenceSha256", "priorFindingId"])
      && ID.test(row.id) && FINDING_STATES.has(row.status) && digest(row.evidenceSha256)
      && (row.priorFindingId === null || ID.test(row.priorFindingId)))
      && record.findings.every((row, index) => index === 0 || record.findings[index - 1].id < row.id))
    || !(record.correction === null || (exact(record.correction, ["commit", "deltaSha256", "impactSha256"])
      && OID.test(record.correction.commit) && digest(record.correction.deltaSha256) && digest(record.correction.impactSha256)))
    || !exact(record.invalidation, ["kind", "evidenceSha256"])
    || !["none", "full-review-required"].includes(record.invalidation.kind)
    || !(record.invalidation.evidenceSha256 === null || digest(record.invalidation.evidenceSha256))
    || !exact(record.course, ["round", "correctionCommits", "mode", "code", "outcome"])
    || !Number.isSafeInteger(record.course.round) || record.course.round < 1 || !Number.isSafeInteger(record.course.correctionCommits) || record.course.correctionCommits < 0
    || !["full", "delta", "none"].includes(record.course.mode) || typeof record.course.code !== "string" || !["admitted", "po-course-gate"].includes(record.course.outcome)
    || !(record.previousSha256 === null || digest(record.previousSha256)) || !digest(record.recordSha256)) return "CRL-SHAPE";
  if (record.parentReviewId === null ? record.previousSha256 !== null || record.lane.freshFromReviewId !== null || record.correction !== null : record.previousSha256 === null || record.lane.freshFromReviewId !== record.parentReviewId || record.correction === null) return "CRL-CHAIN";
  if (canonicalJson(record.coverage.paths) !== canonicalJson(record.diff.paths)) return "CRL-COVERAGE-BINDING";
  if (record.invalidation.kind === "none" ? record.invalidation.evidenceSha256 !== null : record.invalidation.evidenceSha256 === null) return "CRL-INVALIDATION";
  if (record.verdict.status === "pending" && (record.verdict.schemaValid || record.verdict.resultSha256 !== null || record.verdict.failure !== null || record.findings.length !== 0)) return "CRL-PENDING";
  if (record.verdict.status === "no-findings" && (!record.verdict.schemaValid || !digest(record.verdict.resultSha256) || record.verdict.failure !== null || record.findings.length !== 0)) return "CRL-NO-FINDINGS";
  if (record.verdict.status === "findings" && (!record.verdict.schemaValid || !digest(record.verdict.resultSha256) || record.verdict.failure !== null || !record.findings.some((finding) => finding.status === "open"))) return "CRL-FINDINGS";
  if (record.verdict.status === "invalid" && (record.verdict.schemaValid || record.verdict.resultSha256 !== null || !FAILURES.has(record.verdict.failure))) return "CRL-INVALID";
  if (record.course.outcome === "po-course-gate" && (record.course.mode !== "none" || record.verdict.status !== "pending")) return "CRL-COURSE-GATE";
  return record.recordSha256 === sha256Canonical(recordCore(record)) ? null : "CRL-DIGEST";
}

export function criticReviewLineageDigest(record) {
  return lineageCode(record) ? null : record.recordSha256;
}

export function validateCriticReviewLineage(record) {
  const code = lineageCode(record);
  return code ? { ok: false, code } : { ok: true, code: null };
}

/** Compiles a closed record from a prepared packet and a single typed review stage. */
export function compileCriticReviewLineage(input) {
  const keys = ["packet", "reviewId", "parent", "packages", "coverage", "lane", "verdict", "findings", "correction", "invalidation", "reviewAttempt"];
  if (!exact(input, keys) || packetCode(input.packet)) throw new TypeError("CRL-COMPILE-SHAPE");
  const parent = input.parent;
  if (!(parent === null || validateCriticReviewLineage(parent).ok)) throw new TypeError("CRL-PARENT");
  if (parent !== null && (!input.correction || input.lane?.laneId === parent.lane.laneId)) throw new TypeError("CRL-FRESH-CRITIC");
  const admission = admitReviewAttempt(input.reviewAttempt);
  const courseGate = admission.courseGateRequired === true;
  const record = {
    schema: CRITIC_REVIEW_LINEAGE_SCHEMA,
    reviewId: input.reviewId,
    parentReviewId: parent?.reviewId ?? null,
    candidate: structuredClone(input.packet.candidate),
    diff: { sha256: input.packet.diff.sha256, paths: [...input.packet.diffPaths] },
    references: {
      packetSha256: sha256Canonical(input.packet),
      requestSha256: input.packet.bindings.requestSha256,
      diffPathsSha256: input.packet.bindings.diffPathsSha256,
      governanceSha256: input.packet.bindings.governanceSha256,
    },
    packages: structuredClone(input.packages),
    coverage: { ...structuredClone(input.coverage), complete: true },
    request: { packetId: input.packet.packetId, requestSha256: input.packet.bindings.requestSha256, compiledSha256: sha256Canonical(input.packet.request) },
    lane: { laneId: input.lane.laneId, independent: true, evidenceSha256: input.lane.evidenceSha256, freshFromReviewId: parent?.reviewId ?? null },
    verdict: structuredClone(input.verdict),
    findings: structuredClone(input.findings),
    correction: input.correction === null ? null : structuredClone(input.correction),
    invalidation: structuredClone(input.invalidation),
    course: courseGate
      ? { round: input.reviewAttempt.round, correctionCommits: input.reviewAttempt.correctionCommits, mode: "none", code: admission.code, outcome: "po-course-gate" }
      : { round: input.reviewAttempt.round, correctionCommits: input.reviewAttempt.correctionCommits, mode: admission.mode, code: admission.code, outcome: "admitted" },
    previousSha256: parent?.recordSha256 ?? null,
    recordSha256: "0".repeat(64),
  };
  record.recordSha256 = sha256Canonical(recordCore(record));
  const checked = validateCriticReviewLineage(record);
  if (!checked.ok) throw new TypeError(checked.code);
  return Object.freeze(record);
}

/** Revalidates the closed pre-launch binding against the live prepared packet. */
export function validateCriticLineagePacketAdmission(lineage, packet) {
  const valid = validateCriticReviewLineage(lineage);
  if (!valid.ok) return valid;
  const packetInvalid = packetCode(packet);
  if (packetInvalid) return { ok: false, code: packetInvalid };
  if (lineage.verdict.status !== "pending" || lineage.course.outcome !== "admitted") return { ok: false, code: "CRL-NOT-ADMISSIBLE" };
  const packetSha256 = sha256Canonical(packet);
  if (canonicalJson(lineage.candidate) !== canonicalJson(packet.candidate)
    || lineage.diff.sha256 !== packet.diff.sha256 || canonicalJson(lineage.diff.paths) !== canonicalJson(packet.diffPaths)
    || lineage.references.packetSha256 !== packetSha256 || lineage.references.requestSha256 !== packet.bindings.requestSha256
    || lineage.references.diffPathsSha256 !== packet.bindings.diffPathsSha256 || lineage.references.governanceSha256 !== packet.bindings.governanceSha256
    || lineage.request.packetId !== packet.packetId || lineage.request.requestSha256 !== packet.bindings.requestSha256
    || lineage.request.compiledSha256 !== sha256Canonical(packet.request)
    || canonicalJson(lineage.coverage.paths) !== canonicalJson(packet.diffPaths)) return { ok: false, code: "CRL-PACKET-BINDING" };
  return { ok: true, code: null, lineageSha256: lineage.recordSha256 };
}
