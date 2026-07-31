// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CRITIC_REVIEW_FAILURES,
  compileCriticReviewLineage,
  criticReviewLineageDigest,
  validateCriticLineagePacketAdmission,
  validateCriticReviewHistory,
  validateCriticReviewLineage,
} from "./critic-review-lineage.mjs";
import { sha256Canonical } from "./review-economy.mjs";

const H = (character) => character.repeat(64);
const O = (character) => character.repeat(40);
const PATH = "plugins/pipeline-core/lib/example.mjs";
const EDGE = "critic-packet-claim";
const ACCEPTANCE = "NVA-A54-1";
const packet1 = Object.freeze({
  packetId: "1".repeat(32),
  request: { projectId: "pipeline", taskId: "nova-a5", trigger: "T1" },
  candidate: { base: O("1"), commit: O("2"), tree: O("3") },
  diff: { base: O("1"), commit: O("2"), path: ".git/review.diff", bytes: 1, sha256: H("a") },
  diffPaths: [PATH],
  bindings: { requestSha256: H("b"), diffPathsSha256: H("c"), governanceSha256: H("d") },
});
const packet2 = Object.freeze({
  packetId: "2".repeat(32),
  request: { projectId: "pipeline", taskId: "nova-a5-correction", trigger: "T1" },
  candidate: { base: O("2"), commit: O("4"), tree: O("5") },
  diff: { base: O("2"), commit: O("4"), path: ".git/review.diff", bytes: 2, sha256: H("e") },
  diffPaths: [PATH],
  bindings: { requestSha256: H("f"), diffPathsSha256: H("6"), governanceSha256: H("7") },
});

const pendingCoverage = (packet = packet1) => ({
  changedPaths: [...packet.diffPaths],
  acceptanceIds: [ACCEPTANCE],
  integrationEdges: [EDGE],
  complete: false,
  receiptSha256: null,
});
const completeCoverage = (packet = packet1) => ({
  ...pendingCoverage(packet),
  complete: true,
  receiptSha256: H("8"),
});
const packages = (packet = packet1) => [{
  id: "nova-a5",
  subjectSha256: H("9"),
  changedPaths: [...packet.diffPaths],
  integrationEdges: [EDGE],
}];
const pending = { status: "pending", schemaValid: false, resultSha256: null, failure: null };
const noFindings = { status: "no-findings", schemaValid: true, resultSha256: H("a"), failure: null };
const findingsVerdict = { status: "findings", schemaValid: true, resultSha256: H("b"), failure: null };
const findingOpen = {
  id: "finding-1",
  priorFindingId: null,
  severity: "high",
  status: "open",
  evidenceSha256: H("c"),
};
const none = { kind: "none", reason: null, evidenceSha256: null };
const explicitFull = { kind: "full-review-required", reason: "explicit-broad-review", evidenceSha256: H("d") };
const impactSha256 = sha256Canonical([EDGE]);

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS CRL${String(passed).padStart(2, "0")} ${name}`);
}

function compile(overrides = {}) {
  const packet = overrides.packet ?? packet1;
  const parent = overrides.parent ?? null;
  return compileCriticReviewLineage({
    packet,
    reviewId: overrides.reviewId ?? "review-1",
    parent,
    packages: overrides.packages ?? packages(packet),
    coverage: overrides.coverage ?? pendingCoverage(packet),
    lane: overrides.lane ?? {
      laneId: parent === null ? "critic-lane-1" : "critic-lane-2",
      contextSha256: parent === null ? H("1") : H("2"),
      evidenceSha256: parent === null ? H("3") : H("4"),
    },
    verdict: overrides.verdict ?? pending,
    findings: overrides.findings ?? [],
    correction: overrides.correction ?? null,
    invalidation: overrides.invalidation ?? (parent === null ? none : explicitFull),
    reviewAttempt: overrides.reviewAttempt ?? {
      round: parent === null ? 1 : parent.course.reviewRound + 1,
      correctionCommits: parent?.course.correctionCommitCount ?? 0,
      requestedMode: "full",
    },
  });
}

function correction(packet = packet2) {
  return {
    commit: packet.candidate.commit,
    deltaSha256: packet.diff.sha256,
    impactSha256,
  };
}

function deltaAttempt(round, correctionCommits, packet = packet2) {
  const pathInvariantMap = { [PATH]: ["INV-01", "INV-02"] };
  return {
    round,
    correctionCommits,
    requestedMode: "delta",
    base: packet.candidate.base,
    head: packet.candidate.commit,
    tree: packet.candidate.tree,
    changedPaths: [...packet.diffPaths],
    changedBehaviorClaims: ["acceptance-delta"],
    priorReceipt: { id: "review-receipt", sha256: H("5") },
    pathInvariantMap,
    pathInvariantMapSha256: sha256Canonical(pathInvariantMap),
    coordinatorImpactConfirmed: true,
    trustBoundaryChanged: false,
    impactAmbiguous: false,
  };
}

check("ships a complete Draft-2020-12 schema parallel to the runtime root and nested contracts", () => {
  const schema = JSON.parse(readFileSync(new URL("../scripts/critic-review-lineage.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, [
    "schema", "reviewId", "parentReviewId", "candidate", "diff", "references", "packages",
    "coverage", "request", "lane", "verdict", "findings", "correction", "invalidation",
    "course", "previousSha256", "recordSha256",
  ]);
  for (const definition of [
    "candidate", "diff", "references", "package", "coverage", "request", "lane",
    "verdict", "finding", "correction", "invalidation", "course",
  ]) assert.equal(schema.$defs[definition].additionalProperties, false, definition);
  assert.deepEqual(Object.keys(schema.$defs.coverage.properties), [
    "changedPaths", "acceptanceIds", "integrationEdges", "complete", "receiptSha256",
  ]);
  assert.deepEqual(Object.keys(schema.$defs.candidate.properties), ["commit", "tree"]);
  assert.deepEqual(Object.keys(schema.$defs.diff.properties), ["base", "sha256", "changedPaths"]);
  assert.deepEqual(Object.keys(schema.$defs.course.properties), [
    "reviewRound", "correctionCommitCount", "maxReviewRounds", "maxCorrectionCommits", "status",
  ]);
  assert.deepEqual(schema.$defs.verdict.properties.failure.enum.filter(Boolean), CRITIC_REVIEW_FAILURES);
});

check("retains pending incomplete/null coverage verbatim and admits only its exact compiled packet", () => {
  const lineage = compile();
  assert.equal(lineage.coverage.complete, false);
  assert.equal(lineage.coverage.receiptSha256, null);
  assert.equal(validateCriticReviewLineage(lineage).ok, true);
  assert.equal(criticReviewLineageDigest(lineage), lineage.recordSha256);
  assert.deepEqual(validateCriticLineagePacketAdmission(lineage, packet1), {
    ok: true,
    code: null,
    lineageSha256: lineage.recordSha256,
  });
});

check("never fabricates complete coverage and requires a receipt for every successful verdict", () => {
  const complete = compile({ coverage: completeCoverage(), verdict: noFindings });
  assert.equal(complete.coverage.complete, true);
  assert.equal(complete.coverage.receiptSha256, H("8"));
  assert.equal(validateCriticLineagePacketAdmission(complete, packet1).code, "CRL-NOT-ADMISSIBLE");
  assert.throws(
    () => compile({ verdict: noFindings }),
    /CRL-NO-FINDINGS/u,
  );
  assert.throws(
    () => compile({ coverage: { ...completeCoverage(), receiptSha256: null }, verdict: noFindings }),
    /CRL-SHAPE/u,
  );
});

check("keeps empty/no-result/timeout/child/malformed/incomplete/drift/internal distinct from No findings", () => {
  for (const failure of CRITIC_REVIEW_FAILURES) {
    const delivered = ["empty", "malformed", "incomplete"].includes(failure);
    const failed = {
      status: "failed",
      schemaValid: false,
      resultSha256: delivered ? H("e") : null,
      failure,
    };
    const record = compile({ verdict: failed });
    assert.equal(record.verdict.status, "failed");
    assert.notEqual(record.verdict.status, "no-findings");
  }
  assert.throws(
    () => compile({
      coverage: completeCoverage(),
      verdict: { ...noFindings, resultSha256: null },
    }),
    /CRL-NO-FINDINGS/u,
  );
  assert.throws(
    () => compile({
      coverage: completeCoverage(),
      verdict: { ...noFindings, failure: "empty" },
    }),
    /CRL-NO-FINDINGS/u,
  );
});

check("rejects free-form drift and deterministic package plans without exact integration closure", () => {
  assert.throws(() => compile({ coverage: { ...pendingCoverage(), briefing: "hidden prose" } }));
  assert.throws(() => compile({
    packages: [{
      ...packages()[0],
      changedPaths: ["plugins/pipeline-core/lib/other.mjs"],
    }],
  }), /CRL-PACKAGE-CLOSURE/u);
  assert.throws(() => compile({
    packages: [
      packages()[0],
      { ...packages()[0], id: "nova-a5-overlap", subjectSha256: H("f") },
    ],
  }), /CRL-PACKAGE-PATH-OVERLAP/u);
});

check("preserves stable finding IDs and accepts No findings only after explicit dispositions", () => {
  const first = compile({
    coverage: completeCoverage(),
    verdict: findingsVerdict,
    findings: [findingOpen],
  });
  const fixed = { ...findingOpen, priorFindingId: findingOpen.id, status: "fixed", evidenceSha256: H("d") };
  const second = compile({
    packet: packet2,
    reviewId: "review-2",
    parent: first,
    coverage: completeCoverage(packet2),
    verdict: noFindings,
    findings: [fixed],
    correction: correction(),
    invalidation: none,
    reviewAttempt: deltaAttempt(2, 1),
  });
  assert.equal(second.verdict.status, "no-findings");
  assert.deepEqual(validateCriticReviewHistory([first, second]), {
    ok: true,
    code: null,
    headSha256: second.recordSha256,
  });
  assert.throws(() => compile({
    packet: packet2,
    reviewId: "review-2-dropped",
    parent: first,
    coverage: completeCoverage(packet2),
    verdict: noFindings,
    findings: [],
    correction: correction(),
    invalidation: none,
    reviewAttempt: deltaAttempt(2, 1),
  }), /CRL-HISTORY-FINDING-DROPPED/u);
});

check("requires fresh lane and context identities for every correction review", () => {
  const first = compile({
    coverage: completeCoverage(),
    verdict: findingsVerdict,
    findings: [findingOpen],
  });
  assert.throws(() => compile({
    packet: packet2,
    reviewId: "review-2",
    parent: first,
    lane: {
      laneId: first.lane.laneId,
      contextSha256: first.lane.contextSha256,
      evidenceSha256: H("f"),
    },
    coverage: completeCoverage(packet2),
    verdict: findingsVerdict,
    findings: [{ ...findingOpen, priorFindingId: findingOpen.id }],
    correction: correction(),
    invalidation: none,
    reviewAttempt: deltaAttempt(2, 1),
  }), /CRL-HISTORY-CHAIN/u);
});

check("requires a typed invalidation for every later broad review", () => {
  const first = compile({
    coverage: completeCoverage(),
    verdict: findingsVerdict,
    findings: [findingOpen],
  });
  assert.throws(() => compile({
    packet: packet2,
    reviewId: "review-2",
    parent: first,
    coverage: completeCoverage(packet2),
    verdict: findingsVerdict,
    findings: [{ ...findingOpen, priorFindingId: findingOpen.id }],
    correction: correction(),
    invalidation: none,
    reviewAttempt: { round: 2, correctionCommits: 1, requestedMode: "full" },
  }), /CRL-INVALIDATION/u);
  const broad = compile({
    packet: packet2,
    reviewId: "review-2",
    parent: first,
    coverage: completeCoverage(packet2),
    verdict: findingsVerdict,
    findings: [{ ...findingOpen, priorFindingId: findingOpen.id }],
    correction: correction(),
    invalidation: explicitFull,
    reviewAttempt: { round: 2, correctionCommits: 1, requestedMode: "full" },
  });
  assert.equal(broad.request.mode, "full");
  assert.equal(broad.invalidation.reason, "explicit-broad-review");
});

check("genesis pending cannot invent findings while later failed/pending records retain them exactly", () => {
  assert.throws(() => compile({ findings: [findingOpen] }), /CRL-GENESIS-FINDINGS/u);
  const first = compile({
    coverage: completeCoverage(),
    verdict: findingsVerdict,
    findings: [findingOpen],
  });
  const failed = compile({
    packet: packet2,
    reviewId: "review-2-failed",
    parent: first,
    findings: [findingOpen],
    verdict: { status: "failed", schemaValid: false, resultSha256: null, failure: "timeout" },
    correction: correction(),
    invalidation: explicitFull,
    reviewAttempt: { round: 2, correctionCommits: 1, requestedMode: "full" },
  });
  assert.deepEqual(failed.findings, first.findings);
  const retryPacket = {
    ...packet2,
    packetId: "3".repeat(32),
    bindings: { ...packet2.bindings, requestSha256: H("e") },
  };
  const pendingRetry = compile({
    packet: retryPacket,
    reviewId: "review-3-pending",
    parent: failed,
    findings: structuredClone(failed.findings),
    invalidation: { kind: "full-review-required", reason: "prior-review-failure", evidenceSha256: H("e") },
    reviewAttempt: { round: 3, correctionCommits: 1, requestedMode: "full" },
    lane: { laneId: "critic-lane-3", contextSha256: H("f"), evidenceSha256: H("1") },
  });
  assert.deepEqual(pendingRetry.findings, failed.findings);
});

function fourRoundHistory() {
  const packets = [
    packet1,
    packet2,
    {
      ...packet2,
      packetId: "4".repeat(32),
      candidate: { base: O("4"), commit: O("6"), tree: O("7") },
      diff: { ...packet2.diff, base: O("4"), commit: O("6"), sha256: H("1") },
      bindings: { requestSha256: H("2"), diffPathsSha256: H("3"), governanceSha256: H("4") },
    },
    {
      ...packet2,
      packetId: "5".repeat(32),
      candidate: { base: O("6"), commit: O("8"), tree: O("9") },
      diff: { ...packet2.diff, base: O("6"), commit: O("8"), sha256: H("5") },
      bindings: { requestSha256: H("6"), diffPathsSha256: H("7"), governanceSha256: H("8") },
    },
  ];
  const records = [compile({
    packet: packets[0],
    coverage: completeCoverage(packets[0]),
    verdict: findingsVerdict,
    findings: [findingOpen],
  })];
  for (let index = 1; index < 4; index += 1) {
    const prior = records.at(-1);
    const packet = packets[index];
    records.push(compile({
      packet,
      reviewId: `review-${index + 1}`,
      parent: prior,
      coverage: completeCoverage(packet),
      verdict: findingsVerdict,
      findings: [{
        ...findingOpen,
        priorFindingId: findingOpen.id,
        evidenceSha256: H(String(index + 1)),
      }],
      correction: correction(packet),
      invalidation: none,
      reviewAttempt: deltaAttempt(index + 1, index, packet),
      lane: {
        laneId: `critic-lane-${index + 1}`,
        contextSha256: H(String(index + 1)),
        evidenceSha256: H(String(index + 5)),
      },
    }));
  }
  return records;
}

check("enforces the hard four-round/three-correction course and emits no fifth broad review", () => {
  const records = fourRoundHistory();
  assert.equal(validateCriticReviewHistory(records).ok, true);
  const parent = records.at(-1);
  const gate = compile({
    packet: {
      ...packet1,
      packetId: "6".repeat(32),
      candidate: { base: parent.diff.base, ...structuredClone(parent.candidate) },
      diff: {
        ...packet1.diff,
        base: parent.diff.base,
        commit: parent.candidate.commit,
        sha256: parent.diff.sha256,
      },
      bindings: { requestSha256: H("a"), diffPathsSha256: H("b"), governanceSha256: H("c") },
    },
    reviewId: "review-round-course-gate",
    parent,
    findings: structuredClone(parent.findings),
    invalidation: none,
    reviewAttempt: { round: 5, correctionCommits: 3, requestedMode: "full" },
    lane: { laneId: "unlaunched-lane", contextSha256: H("d"), evidenceSha256: H("e") },
  });
  assert.equal(gate.course.status, "po-course-gate");
  assert.equal(gate.request.mode, "none");
  assert.equal(validateCriticLineagePacketAdmission(gate, {
    ...packet1,
    packetId: gate.request.packetId,
  }).ok, false);
  assert.equal(validateCriticReviewHistory([...records, gate]).ok, true);
  const droppedAtGate = structuredClone(gate);
  droppedAtGate.findings = [];
  const droppedCore = structuredClone(droppedAtGate);
  delete droppedCore.recordSha256;
  droppedAtGate.recordSha256 = sha256Canonical(droppedCore);
  assert.equal(
    validateCriticReviewHistory([...records, droppedAtGate]).code,
    "CRL-HISTORY-COURSE-GATE-BINDING",
  );
  assert.throws(() => compile({
    packet: {
      ...packet1,
      packetId: "9".repeat(32),
      candidate: { base: records[0].diff.base, ...structuredClone(records[0].candidate) },
      diff: {
        ...packet1.diff,
        base: records[0].diff.base,
        commit: records[0].candidate.commit,
        sha256: records[0].diff.sha256,
      },
    },
    reviewId: "jumped-gate",
    parent: records[0],
    findings: structuredClone(records[0].findings),
    invalidation: none,
    reviewAttempt: { round: 5, correctionCommits: 0, requestedMode: "full" },
    lane: { laneId: "jumped-lane", contextSha256: H("f"), evidenceSha256: H("1") },
  }), /CRL-HISTORY-COURSE-GATE/u);
});

check("accepts only an exact next 3-to-4 correction gate", () => {
  const records = fourRoundHistory();
  const parent = records.at(-1);
  const packet = {
    ...packet1,
    packetId: "7".repeat(32),
    candidate: { base: parent.diff.base, ...structuredClone(parent.candidate) },
    diff: {
      ...packet1.diff,
      base: parent.diff.base,
      commit: parent.candidate.commit,
      sha256: parent.diff.sha256,
    },
    bindings: { requestSha256: H("3"), diffPathsSha256: H("4"), governanceSha256: H("5") },
  };
  const gate = compile({
    packet,
    reviewId: "correction-course-gate",
    parent,
    findings: structuredClone(parent.findings),
    invalidation: none,
    reviewAttempt: { round: 4, correctionCommits: 4, requestedMode: "delta" },
    lane: { laneId: "correction-gate-lane", contextSha256: H("6"), evidenceSha256: H("7") },
  });
  assert.equal(gate.course.status, "po-course-gate");
  assert.equal(validateCriticReviewHistory([...records, gate]).ok, true);
});

check("requires a parent for a course gate and accepts simultaneous exact 4/3 to 5/4 exhaustion", () => {
  assert.throws(() => compile({
    reviewId: "genesis-gate",
    reviewAttempt: { round: 5, correctionCommits: 0, requestedMode: "full" },
  }), /CRL-COURSE-GATE/u);
  const records = fourRoundHistory();
  const parent = records.at(-1);
  const packet = {
    ...packet1,
    packetId: "8".repeat(32),
    candidate: { base: parent.diff.base, ...structuredClone(parent.candidate) },
    diff: {
      ...packet1.diff,
      base: parent.diff.base,
      commit: parent.candidate.commit,
      sha256: parent.diff.sha256,
    },
    bindings: { requestSha256: H("4"), diffPathsSha256: H("5"), governanceSha256: H("6") },
  };
  const gate = compile({
    packet,
    reviewId: "simultaneous-course-gate",
    parent,
    findings: structuredClone(parent.findings),
    invalidation: none,
    reviewAttempt: { round: 5, correctionCommits: 4, requestedMode: "full" },
    lane: { laneId: "simultaneous-gate-lane", contextSha256: H("7"), evidenceSha256: H("8") },
  });
  assert.equal(gate.course.status, "po-course-gate");
  assert.equal(validateCriticReviewHistory([...records, gate]).ok, true);
});

console.log(`${passed}/12 checks passed.`);
