// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  compileCriticReviewLineage,
  criticReviewLineageDigest,
  validateCriticLineagePacketAdmission,
  validateCriticReviewLineage,
} from "./critic-review-lineage.mjs";

const A = "a".repeat(64);
const O = "1".repeat(40);
const packet = Object.freeze({
  packetId: "1".repeat(32),
  request: { projectId: "pipeline", taskId: "nova-a5", trigger: "T1" },
  candidate: { base: O, commit: O, tree: O },
  diff: { base: O, commit: O, path: ".git/review.diff", bytes: 1, sha256: A },
  diffPaths: ["plugins/pipeline-core/lib/example.mjs"],
  bindings: { requestSha256: A, diffPathsSha256: "b".repeat(64), governanceSha256: "c".repeat(64) },
});
const coverage = { paths: [...packet.diffPaths], acceptanceIds: ["NVA-A54-1"], integrationEdges: ["critic-packet-claim"] };
const packages = [{ id: "nova-a5", subjectSha256: "d".repeat(64) }];
const pending = { status: "pending", schemaValid: false, resultSha256: null, failure: null };
const noFindings = { status: "no-findings", schemaValid: true, resultSha256: "e".repeat(64), failure: null };
const none = { kind: "none", evidenceSha256: null };
let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`PASS CRL${String(passed).padStart(2, "0")} ${name}`); }
function compile(overrides = {}) {
  return compileCriticReviewLineage({
    packet,
    reviewId: "review-1",
    parent: null,
    packages,
    coverage,
    lane: { laneId: "independent-critic-1", evidenceSha256: "f".repeat(64) },
    verdict: pending,
    findings: [],
    correction: null,
    invalidation: none,
    reviewAttempt: { round: 1, correctionCommits: 0, requestedMode: "full" },
    ...overrides,
  });
}

check("ships a closed schema with the exact Nova A5 root", () => {
  const schema = JSON.parse(readFileSync(new URL("../scripts/critic-review-lineage.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["schema", "reviewId", "parentReviewId", "candidate", "diff", "references", "packages", "coverage", "request", "lane", "verdict", "findings", "correction", "invalidation", "course", "previousSha256", "recordSha256"]);
});

check("compiles a closed pending lineage and admits it against its exact packet", () => {
  const lineage = compile();
  assert.equal(validateCriticReviewLineage(lineage).ok, true);
  assert.equal(criticReviewLineageDigest(lineage), lineage.recordSha256);
  assert.deepEqual(validateCriticLineagePacketAdmission(lineage, packet), { ok: true, code: null, lineageSha256: lineage.recordSha256 });
});
check("rejects packet, digest and free-form-root drift", () => {
  const lineage = structuredClone(compile());
  lineage.recordSha256 = "0".repeat(64);
  assert.equal(validateCriticReviewLineage(lineage).ok, false);
  assert.equal(validateCriticLineagePacketAdmission(compile(), { ...packet, diffPaths: ["other.mjs"] }).ok, false);
  assert.throws(() => compile({ coverage: { ...coverage, briefing: "do not persist prose" } }));
});
check("accepts No findings only with a delivered typed result and complete coverage", () => {
  const complete = compile({ verdict: noFindings });
  assert.equal(validateCriticReviewLineage(complete).ok, true);
  const empty = structuredClone(complete);
  empty.coverage.acceptanceIds = [];
  assert.equal(validateCriticReviewLineage(empty).ok, false);
  const falseSuccess = structuredClone(complete);
  falseSuccess.verdict.failure = "transport";
  assert.equal(validateCriticReviewLineage(falseSuccess).ok, false);
  assert.throws(() => compile({ coverage: { ...coverage, paths: ["plugins/pipeline-core/lib/other.mjs"] } }), /CRL-COVERAGE-BINDING/u);
});
check("requires a fresh Critic and correction binding for a correction round", () => {
  const first = compile();
  const second = compile({
    reviewId: "review-2",
    parent: first,
    lane: { laneId: "independent-critic-2", evidenceSha256: "9".repeat(64) },
    correction: { commit: O, deltaSha256: "8".repeat(64), impactSha256: "7".repeat(64) },
    reviewAttempt: { round: 2, correctionCommits: 1, requestedMode: "full" },
  });
  assert.equal(second.parentReviewId, first.reviewId);
  assert.equal(second.previousSha256, first.recordSha256);
  assert.throws(() => compile({ parent: first, correction: { commit: O, deltaSha256: "8".repeat(64), impactSha256: "7".repeat(64) }, reviewAttempt: { round: 2, correctionCommits: 1, requestedMode: "full" } }));
});
check("turns four-plus-one rounds and three-plus-one corrections into a PO course gate", () => {
  const rounds = compile({ reviewAttempt: { round: 5, correctionCommits: 0, requestedMode: "full" } });
  const corrections = compile({ reviewAttempt: { round: 1, correctionCommits: 4, requestedMode: "full" } });
  assert.equal(rounds.course.outcome, "po-course-gate");
  assert.equal(corrections.course.outcome, "po-course-gate");
});
console.log(`${passed}/6 checks passed.`);
