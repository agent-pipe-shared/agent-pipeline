// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CRITIC_REVIEW_FAILURES,
  compileReleaseCriticReviewScope,
  compileCriticReviewLineage,
  criticReviewLineageDigest,
  validateCriticLineagePacketAdmission,
  validateCriticReviewHistory,
  validateCriticReviewLineage,
  validateReleaseCriticScopeAdmission,
} from "./critic-review-lineage.mjs";
import { projectCriticReviewEconomy, sha256Canonical } from "./review-economy.mjs";
import { safePath, v2BindingCode } from "./critic-review-lineage-core.mjs";
import * as lineageCore from "./critic-review-lineage-core.mjs";

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

// Contract moved (review-economy admitReviewAttempt): from round 2 on, compile() admits only a
// "delta" attempt and refuses a "full" one before any invalidation check (CRL-REVIEW-REFUSED), so a
// later broad record can no longer be compiled. This helper re-seals a compiled delta record as the
// retained historical broad shape, which the record validators still accept and check.
function historicalBroad(deltaRecord, invalidation) {
  const record = structuredClone(deltaRecord);
  record.request.mode = "full";
  record.request.admissionCode = "RE-HISTORICAL-BROAD";
  record.invalidation = invalidation;
  record.request.compiledSha256 = sha256Canonical({
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
  });
  const { recordSha256: _previous, ...core } = record;
  record.recordSha256 = sha256Canonical(core);
  return record;
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
  const releaseScopeSchema = JSON.parse(readFileSync(
    new URL("../scripts/release-critic-review-scope.schema.json", import.meta.url),
    "utf8",
  ));
  assert.equal(releaseScopeSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(releaseScopeSchema.$id, "pipeline.release-critic-review-scope.v1");
  assert.equal(releaseScopeSchema.additionalProperties, false);
});

check("schema path patterns accept every legitimate file name character and agree with safePath", () => {
  const lineageSchema = JSON.parse(readFileSync(new URL("../scripts/critic-review-lineage.schema.json", import.meta.url), "utf8"));
  const releaseSchema = JSON.parse(readFileSync(new URL("../scripts/release-critic-review-scope.schema.json", import.meta.url), "utf8"));
  const cp = (value) => String.fromCodePoint(value);
  const accepted = [
    "src/app/(app)/(auth)/anmelden/page.tsx", "src/app/[slug]/page.tsx", "src/app/@modal/(.)photo/page.tsx", "routes/$id.tsx",
    "src/with space/a.ts", `src/${cp(252)}ber/a.ts`, "src/a+b=c,d~e.ts", "src/a:b.ts", "src/a.ts ", "-lead/a.ts",
  ];
  const refused = [
    `src/a${cp(10)}b.ts`, `src/a.ts${cp(10)}`, `src/a${cp(0)}b.ts`, `src/a${cp(0x85)}b.ts`, `src/a${cp(0x7f)}b.ts`,
    `src/a${cp(92)}b.ts`, "/src/a.ts",
  ];
  const lineagePattern = new RegExp(lineageSchema.$defs.path.pattern);
  const releasePattern = new RegExp(releaseSchema.$defs.path.pattern);
  for (const path of accepted) {
    assert.equal(lineagePattern.test(path), true, `lineage accepts ${JSON.stringify(path)}`);
    assert.equal(releasePattern.test(path), true, `release accepts ${JSON.stringify(path)}`);
    assert.equal(safePath(path), true, `safePath accepts ${JSON.stringify(path)}`);
  }
  for (const path of [...refused, "src//a.ts", "src/./a.ts", "src/../a.ts"]) {
    assert.equal(lineagePattern.test(path), false, `lineage refuses ${JSON.stringify(path)}`);
    assert.equal(safePath(path), false, `safePath refuses ${JSON.stringify(path)}`);
  }
  for (const path of refused) assert.equal(releasePattern.test(path), false, `release refuses ${JSON.stringify(path)}`);
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

check("accepts two actual correction commits in one exact parent-to-candidate review range", () => {
  const first = compile({ coverage: completeCoverage(), verdict: findingsVerdict, findings: [findingOpen] });
  const second = compile({
    packet: packet2,
    reviewId: "review-two-commits",
    parent: first,
    coverage: completeCoverage(packet2),
    verdict: findingsVerdict,
    findings: [{ ...findingOpen, priorFindingId: findingOpen.id }],
    correction: correction(),
    invalidation: none,
    reviewAttempt: deltaAttempt(2, 2),
  });
  assert.equal(second.course.correctionCommitCount, 2);
  assert.equal(validateCriticReviewHistory([first, second]).ok, true);
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
  const laterReview = (overrides) => compile({
    packet: packet2,
    reviewId: "review-2",
    parent: first,
    coverage: completeCoverage(packet2),
    verdict: findingsVerdict,
    findings: [{ ...findingOpen, priorFindingId: findingOpen.id }],
    correction: correction(),
    ...overrides,
  });
  // Contract moved: a round-2 "full" attempt is now refused outright (was CRL-INVALIDATION when
  // the typed invalidation was missing); the typed-invalidation rule is checked on the delta
  // attempt (must carry none) and on the retained broad record (must carry a typed reason).
  assert.throws(() => laterReview({
    invalidation: none,
    reviewAttempt: { round: 2, correctionCommits: 1, requestedMode: "full" },
  }), /CRL-REVIEW-REFUSED/u);
  assert.throws(() => laterReview({
    invalidation: explicitFull,
    reviewAttempt: deltaAttempt(2, 1),
  }), /CRL-INVALIDATION/u);
  const delta = laterReview({ invalidation: none, reviewAttempt: deltaAttempt(2, 1) });
  assert.equal(
    validateCriticReviewLineage(historicalBroad(delta, none)).code,
    "CRL-FULL-INVALIDATION",
  );
  const broad = historicalBroad(delta, explicitFull);
  assert.equal(validateCriticReviewLineage(broad).ok, true);
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
    invalidation: none,
    reviewAttempt: deltaAttempt(2, 1),
  });
  assert.deepEqual(failed.findings, first.findings);
  // Contract moved: later rounds are delta-only with invalidation none, and a same-candidate rerun
  // (prior-review-failure, full) can no longer be compiled; the pending retry is a new correction.
  const retryPacket = {
    ...packet2,
    packetId: "3".repeat(32),
    candidate: { base: O("4"), commit: O("6"), tree: O("7") },
    diff: { ...packet2.diff, base: O("4"), commit: O("6"), sha256: H("1") },
    bindings: { ...packet2.bindings, requestSha256: H("e") },
  };
  const pendingRetry = compile({
    packet: retryPacket,
    reviewId: "review-3-pending",
    parent: failed,
    findings: structuredClone(failed.findings),
    correction: correction(retryPacket),
    invalidation: none,
    reviewAttempt: deltaAttempt(3, 2, retryPacket),
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

check("accepts a correction-budget crossing even when the exact Git range adds two commits", () => {
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
    // D190: the old correction cap gates a FULL request only (a diff round is admitted), so the gate record is built from a full request.
    reviewAttempt: { round: 4, correctionCommits: 4, requestedMode: "full" },
    lane: { laneId: "correction-gate-lane", contextSha256: H("6"), evidenceSha256: H("7") },
  });
  assert.equal(gate.course.status, "po-course-gate");
  assert.equal(validateCriticReviewHistory([...records, gate]).ok, true);

  const first = compile({ coverage: completeCoverage(), verdict: findingsVerdict, findings: [findingOpen] });
  const second = compile({
    packet: packet2, reviewId: "review-two-commits", parent: first,
    coverage: completeCoverage(packet2), verdict: findingsVerdict,
    findings: [{ ...findingOpen, priorFindingId: findingOpen.id }],
    correction: correction(), invalidation: none, reviewAttempt: deltaAttempt(2, 2),
  });
  const overrunPacket = {
    ...packet1,
    packetId: "8".repeat(32),
    candidate: { base: second.diff.base, ...structuredClone(second.candidate) },
    diff: { ...packet1.diff, base: second.diff.base, commit: second.candidate.commit, sha256: second.diff.sha256 },
  };
  const overrun = compile({
    packet: overrunPacket, reviewId: "review-two-more-commits-gate", parent: second,
    findings: structuredClone(second.findings), invalidation: none,
    reviewAttempt: { round: 3, correctionCommits: 4, requestedMode: "full" },
    lane: { laneId: "overrun-lane", contextSha256: H("d"), evidenceSha256: H("e") },
  });
  assert.equal(overrun.course.status, "po-course-gate");
  assert.equal(validateCriticReviewHistory([first, second, overrun]).ok, true);
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

check("release corrections bind the previous reviewed candidate, impact closure and finding scope", () => {
  const first = compile({
    coverage: completeCoverage(),
    verdict: findingsVerdict,
    findings: [findingOpen],
  });
  const firstScope = compileReleaseCriticReviewScope({
    parent: null,
    packet: packet1,
    mode: "broad-first",
    impactClosure: {
      changedPaths: [PATH],
      directConsequencePaths: [],
      integrationEdges: [EDGE],
    },
    findings: [{
      id: findingOpen.id,
      path: PATH,
      basis: "changed-line",
      evidenceSha256: findingOpen.evidenceSha256,
    }],
    invalidation: none,
  });
  assert.equal(validateReleaseCriticScopeAdmission(first, packet1, firstScope).ok, true);

  const newFinding = {
    id: "finding-2",
    priorFindingId: null,
    severity: "medium",
    status: "open",
    evidenceSha256: H("e"),
  };
  const fixed = { ...findingOpen, priorFindingId: findingOpen.id, status: "fixed", evidenceSha256: H("d") };
  const second = compile({
    packet: packet2,
    reviewId: "review-2-release",
    parent: first,
    coverage: completeCoverage(packet2),
    verdict: findingsVerdict,
    findings: [fixed, newFinding],
    correction: correction(),
    invalidation: none,
    reviewAttempt: deltaAttempt(2, 1),
  });
  const consequencePath = "plugins/pipeline-core/lib/dependent.mjs";
  const correctionScope = compileReleaseCriticReviewScope({
    parent: first,
    packet: packet2,
    mode: "correction",
    impactClosure: {
      changedPaths: [PATH],
      directConsequencePaths: [consequencePath],
      integrationEdges: [EDGE],
    },
    findings: [{
      id: newFinding.id,
      path: consequencePath,
      basis: "direct-consequence",
      evidenceSha256: newFinding.evidenceSha256,
    }],
    invalidation: none,
  });
  assert.equal(correctionScope.reviewedRange.base, first.candidate.commit);
  assert.deepEqual(correctionScope.nextLineageParent, second.candidate);
  assert.equal(validateReleaseCriticScopeAdmission(second, packet2, correctionScope).ok, true);
  assert.throws(() => compileReleaseCriticReviewScope({
    parent: first,
    packet: packet2,
    mode: "correction",
    impactClosure: {
      changedPaths: [PATH],
      directConsequencePaths: [],
      integrationEdges: [EDGE],
    },
    findings: [{
      id: "historical-finding",
      path: consequencePath,
      basis: "changed-line",
      evidenceSha256: H("f"),
    }],
    invalidation: none,
  }), /CRL-RELEASE-FINDING-OUTSIDE-DELTA/u);

  // Contract moved: a round-2 "full" attempt no longer compiles, so the broad record is the
  // retained historical shape (see historicalBroad), not a compiled one.
  const broad = historicalBroad(compile({
    packet: packet2,
    reviewId: "review-2-broad-release",
    parent: first,
    coverage: completeCoverage(packet2),
    verdict: noFindings,
    findings: [fixed],
    correction: correction(),
    invalidation: none,
    reviewAttempt: deltaAttempt(2, 1),
  }), explicitFull);
  const broadScope = compileReleaseCriticReviewScope({
    parent: first,
    packet: packet2,
    mode: "broad-correction",
    impactClosure: {
      changedPaths: [PATH],
      directConsequencePaths: [],
      integrationEdges: [EDGE],
    },
    findings: [],
    invalidation: explicitFull,
  });
  assert.equal(broadScope.invalidation.reason, "explicit-broad-review");
  assert.equal(validateReleaseCriticScopeAdmission(broad, packet2, broadScope).ok, true);
});

// PF-97 F1 (PO decision 2026-10-28): every legitimate file name character is allowed in a repository path.
const LEGITIMATE_PATHS = [
  "src/app/(app)/(auth)/anmelden/page.tsx",
  "src/app/[slug]/page.tsx",
  "src/app/@modal/(.)photo/page.tsx",
  "routes/$id.tsx",
  "src/with space/file name.ts",
  "src/über/ü.ts",
  "src/a+b=c,d~e.ts",
  "src/a:b.ts",
  "src/trail .ts",
  "src/-lead.ts",
  "src/50%#done.ts",
];
const REFUSED_PATHS = [
  "src/a\nb.ts",
  "src/a.ts\n",
  "src/a\rb.ts",
  "src/a\u0000b.ts",
  "src/a\u0085b.ts",
  "src/a\u007fb.ts",
  "src/a\u009fb.ts",
  "src/a\u0001b.ts",
  "src/a\\b.ts",
  "/src/a.ts",
  "src//a.ts",
  "src/./a.ts",
  "src/../a.ts",
  "src/",
  "",
  ".",
  "..",
];
check("allows every legitimate file name character in a repository path and refuses controls, backslash and bad segments", () => {
  for (const path of LEGITIMATE_PATHS) assert.equal(safePath(path), true, JSON.stringify(path));
  for (const path of REFUSED_PATHS) assert.equal(safePath(path), false, JSON.stringify(path));
  assert.equal(safePath(`${"a/".repeat(255)}a`), true);
  assert.equal(safePath("a".repeat(513)), false);
  assert.equal(safePath("ü".repeat(257)), false);
  assert.equal(safePath(null), false);
});
check("compiles and validates a lineage record whose packet diff path carries brackets, parentheses and an at sign", () => {
  const paths = [
    "src/app/(app)/(auth)/anmelden/page.tsx",
    "src/app/@modal/(.)photo/page.tsx",
    "src/app/[slug]/page.tsx",
  ];
  const packet = Object.freeze({ ...packet1, diffPaths: paths });
  const record = compile({ packet });
  assert.deepEqual(record.diff.changedPaths, paths);
  assert.equal(validateCriticReviewLineage(record).ok, true);
  assert.equal(validateCriticLineagePacketAdmission(record, packet).ok, true);
  assert.throws(() => compile({ packet: Object.freeze({ ...packet1, diffPaths: ["src/a\nb.ts"] }) }), /CRL-COMPILE-SHAPE|CRL-V2-PACKET/u);
});

check("D190 step rule: a delta round may step the correction count by more than one and still chain; full mode, a falling count and a skipped round stay refused", () => {
  const records = fourRoundHistory();
  const next = (parent, packet, round, count, mode = "delta") => {
    const record = compile({
      packet,
      reviewId: `review-step-${round}-${count}`,
      parent,
      coverage: completeCoverage(packet),
      verdict: findingsVerdict,
      findings: [{ ...findingOpen, priorFindingId: findingOpen.id, evidenceSha256: H("a") }],
      correction: correction(packet),
      invalidation: none,
      reviewAttempt: deltaAttempt(round, count, packet),
      lane: { laneId: `critic-lane-step-${round}-${count}`, contextSha256: H("e"), evidenceSha256: H("d") },
    });
    return mode === "delta" ? record : historicalBroad(record, explicitFull);
  };
  const packet5 = {
    ...packet2,
    packetId: "7".repeat(32),
    candidate: { base: O("8"), commit: O("a"), tree: O("b") },
    diff: { ...packet2.diff, base: O("8"), commit: O("a"), sha256: H("9") },
    bindings: { requestSha256: H("a"), diffPathsSha256: H("b"), governanceSha256: H("c") },
  };
  const chained = (history) => ({
    lineage: validateCriticReviewHistory(history),
    economy: projectCriticReviewEconomy(history),
  });
  // (a) parent round 1 / count 0, child delta round 2 / count 7
  const a = [records[0], next(records[0], packet2, 2, 7)];
  assert.equal(a[1].course.correctionCommitCount, 7);
  assert.equal(chained(a).lineage.ok, true);
  assert.equal(chained(a).economy.ok, true);
  // (b) parent at the old limits (round 4 / count 3), child delta round 5 / count 11
  const b = [...records, next(records.at(-1), packet5, 5, 11)];
  assert.equal(chained(b).lineage.ok, true);
  assert.equal(chained(b).economy.ok, true);
  // (c) a full-mode child with a step larger than one is refused
  const c = [records[0], next(records[0], packet2, 2, 7, "full")];
  assert.equal(chained(c).economy.ok, false);
  // (d) a falling count and a skipped round are refused (at composition or in the chain)
  const refused = (build) => {
    let history;
    try { history = build(); } catch { return true; }
    const r = chained(history);
    return r.lineage.ok === false && r.economy.ok === false;
  };
  assert.equal(refused(() => [...records, next(records.at(-1), packet5, 5, 2)]), true);
  assert.equal(refused(() => [...records, next(records.at(-1), packet5, 6, 11)]), true);
});

check("PF-102 a diff round past round 2 needs no exception binding; malformed bindings and the round-1 delta rule stay refused", () => {
  const binding = (over = {}) => ({
    courseKey: H("a"), originalFeatureId: "feature-one", originalManifestSha256: H("b"),
    genesisCandidate: { base: O("1"), commit: O("2"), tree: O("3") },
    submissionSha256: H("c"), envelopeSha256: H("d"), criterionSha256: null, deltaRequestSha256: H("e"),
    deterministicEvidenceSha256: H("f"), courseSourceSha256: H("1"), courseDecisionSha256: H("2"), ...over,
  });
  const record = (round, over) => ({ course: { reviewRound: round }, courseBinding: binding(over), consumedResult: null, verdict: { status: "pending" } });
  // Before D190 every round past 2 demanded a digest criterion and answered CRL-V2-EXCEPTION-BINDING (Glossover round 3).
  for (const round of [2, 3, 4, 5, 9]) assert.equal(v2BindingCode(record(round)), null, `round ${round}`);
  assert.equal(v2BindingCode(record(3, { criterionSha256: H("9") })), null, "an accepted exception criterion is still allowed");
  assert.equal(v2BindingCode(record(3, { criterionSha256: "not-a-digest" })), "CRL-V2-COURSE-BINDING");
  assert.equal(v2BindingCode(record(1)), "CRL-V2-DELTA-BINDING", "round 1 must not carry a delta request");
  assert.equal(v2BindingCode(record(4, { deltaRequestSha256: null })), "CRL-V2-DELTA-BINDING", "a diff round must carry its delta request");
});

// Consumer finding 2026-10-30: a full round (D204 fallback) over the whole feature range changed 357 paths, and the
// 256 of identifier lists refused its lineage as CRL-V2-PACKET. Changed-path lists are bound by MAX_REVIEW_PATHS.
check("a full round over more than 256 changed paths compiles, validates and admits its packet; the path bound still holds", () => {
  const paths = Array.from({ length: 357 }, (_, index) => `src/module-${String(index).padStart(3, "0")}.ts`);
  const packet = Object.freeze({ ...packet1, diffPaths: paths });
  const record = compile({ packet });
  assert.equal(record.diff.changedPaths.length, 357);
  assert.equal(validateCriticReviewLineage(record).ok, true);
  assert.equal(validateCriticLineagePacketAdmission(record, packet).ok, true);
  const MAX_REVIEW_PATHS = lineageCore.MAX_REVIEW_PATHS;
  const schema = JSON.parse(readFileSync(new URL("../scripts/critic-review-lineage.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.$defs.pathSet.maxItems, MAX_REVIEW_PATHS, "the schema states the same bound as the validators");
  const over = Array.from({ length: MAX_REVIEW_PATHS + 1 }, (_, index) => `src/m${index}.ts`);
  assert.throws(() => compile({ packet: Object.freeze({ ...packet1, diffPaths: over }) }), /CRL-COMPILE-SHAPE|CRL-V2-PACKET/u);
});

assert.equal(passed, 20);
console.log(`${passed}/20 checks passed.`);
