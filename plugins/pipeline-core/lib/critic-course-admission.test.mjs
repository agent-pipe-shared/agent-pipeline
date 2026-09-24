// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileCriticReviewLineage } from "./critic-review-lineage.mjs";
import { classifyRegisteredEvidenceOnlyCommits, deriveCriticCourseAdmission, deriveRegisteredCriticCourseDecision, deriveRegisteredCriticCourseSource, resolveRegisteredCriticCourseHistory, CriticCourseAdmissionError } from "./critic-course-admission.mjs";
import { sha256Canonical } from "./review-economy.mjs";

const H = (c) => c.repeat(64);
const O = (c) => c.repeat(40);
const path = "src/example.mjs";
const packet = (index) => {
  const chars = ["1", "2", "3", "4", "5", "6"];
  const base = O(chars[index]);
  const commit = O(chars[index + 1]);
  return {
    packetId: String(index + 1).repeat(32),
    request: { projectId: "pipeline", taskId: "critic-course", trigger: "T1" },
    candidate: { base, commit, tree: O(chars[index + 2]) },
    diff: { base, commit, path: ".git/review.diff", bytes: 1, sha256: H(chars[index + 1]) },
    diffPaths: [path],
    bindings: { requestSha256: H("a"), diffPathsSha256: H("b"), governanceSha256: H("c") },
  };
};
function history(firstPacket = packet(0)) {
  const first = compileCriticReviewLineage({
    packet: firstPacket,
    reviewId: "review-1",
    parent: null,
    packages: [{ id: "package", subjectSha256: H("d"), changedPaths: [path], integrationEdges: ["edge"] }],
    coverage: { changedPaths: [path], acceptanceIds: ["AC-1"], integrationEdges: ["edge"], complete: true, receiptSha256: H("e") },
    lane: { laneId: "lane-1", contextSha256: H("f"), evidenceSha256: H("1") },
    verdict: { status: "findings", schemaValid: true, resultSha256: H("2"), failure: null },
    findings: [{ id: "finding-1", priorFindingId: null, severity: "high", status: "open", evidenceSha256: H("3") }],
    correction: null,
    invalidation: { kind: "none", reason: null, evidenceSha256: null },
    reviewAttempt: { round: 1, correctionCommits: 0, requestedMode: "full" },
  });
  return [first];
}
const delta = {
  changedPaths: [path],
  changedBehaviorClaims: ["behavior-one"],
  priorReceipt: { id: "receipt-1", sha256: H("4") },
  pathInvariantMap: { [path]: ["INV-1"] },
  pathInvariantMapSha256: sha256Canonical({ [path]: ["INV-1"] }),
  coordinatorImpactConfirmed: true,
  trustBoundaryChanged: false,
  impactAmbiguous: false,
};
const genesis = () => ({ history: [], candidate: { base: O("1"), commit: O("2"), tree: O("3") }, correctionCommitsInRange: 0, requestedMode: "full", delta: {} });
const correction = (rows = history()) => ({ history: rows, candidate: { base: rows.at(-1).candidate.commit, commit: O("3"), tree: O("4") }, correctionCommitsInRange: 1, requestedMode: "delta", delta });
const rejects = (code) => (error) => error instanceof CriticCourseAdmissionError && error.code === code;
const git = (root, args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function registeredFixture() {
  const root = mkdtempSync(join(tmpdir(), "critic-course-source-"));
  const featureId = "course-feature";
  const evidencePath = `specs/${featureId}/evidence/critic-review-1.json`;
  const manifestPath = `specs/${featureId}/lifecycle.json`;
  mkdirSync(join(root, "specs", featureId, "evidence"), { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  const manifest = (artifacts) => ({ schema: "pipeline.feature-package.v1", feature: { id: featureId, rigor: 1 }, state: "approved", artifacts });
  writeFileSync(join(root, manifestPath), `${JSON.stringify(manifest([]))}\n`);
  git(root, ["add", "."]); git(root, ["commit", "-qm", "genesis"]);
  const genesisCommit = git(root, ["rev-parse", "HEAD"]);
  const synthetic = packet(0);
  const firstPacket = {
    ...synthetic,
    candidate: { ...synthetic.candidate, commit: genesisCommit, tree: git(root, ["rev-parse", `${genesisCommit}^{tree}`]) },
    diff: { ...synthetic.diff, commit: genesisCommit },
  };
  const first = history(firstPacket)[0];
  const bytes = `${JSON.stringify(first)}\n`;
  writeFileSync(join(root, evidencePath), bytes);
  const entry = { class: "candidate-evidence", path: evidencePath, sha256: hash(bytes), authority: false, mutability: "immutable", retention: "retain" };
  writeFileSync(join(root, manifestPath), `${JSON.stringify(manifest([entry]))}\n`);
  git(root, ["add", "."]); git(root, ["commit", "-qm", "registered review"]);
  return { root, featureId, manifestPath, evidencePath, manifest, entry, first, genesisCommit, candidateCommit: git(root, ["rev-parse", "HEAD"]) };
}
function fourRoundHistory() {
  const rows = history();
  for (let index = 1; index < 4; index += 1) {
    const currentPacket = packet(index);
    rows.push(compileCriticReviewLineage({
      packet: currentPacket,
      reviewId: `review-${index + 1}`,
      parent: rows.at(-1),
      packages: [{ id: "package", subjectSha256: H("d"), changedPaths: [path], integrationEdges: ["edge"] }],
      coverage: { changedPaths: [path], acceptanceIds: ["AC-1"], integrationEdges: ["edge"], complete: true, receiptSha256: H("e") },
      lane: { laneId: `lane-${index + 1}`, contextSha256: H(String(index + 3)), evidenceSha256: H(String(index + 6)) },
      verdict: { status: "findings", schemaValid: true, resultSha256: H("2"), failure: null },
      findings: [{ id: "finding-1", priorFindingId: "finding-1", severity: "high", status: "open", evidenceSha256: H(String(index + 2)) }],
      correction: { commit: currentPacket.candidate.commit, deltaSha256: currentPacket.diff.sha256, impactSha256: sha256Canonical(["edge"]) },
      invalidation: { kind: "none", reason: null, evidenceSha256: null },
      reviewAttempt: {
        round: index + 1, correctionCommits: index, requestedMode: "delta",
        base: currentPacket.candidate.base, head: currentPacket.candidate.commit, tree: currentPacket.candidate.tree,
        ...delta,
      },
    }));
  }
  return rows;
}

test("CCA01 genesis derives round one and rejects invented course counters", () => {
  const admitted = deriveCriticCourseAdmission(genesis());
  assert.equal(admitted.attempt.round, 1);
  assert.equal(admitted.attempt.correctionCommits, 0);
  assert.equal(admitted.admission.mode, "full");
  assert.throws(() => deriveCriticCourseAdmission({ ...genesis(), round: 1 }), rejects("CCA-SHAPE"));
  assert.throws(() => deriveCriticCourseAdmission({ ...genesis(), correctionCommitsInRange: 1 }), rejects("CCA-GENESIS"));
});

test("CCA02 correction derives round and cumulative commits from the validated parent", () => {
  const admitted = deriveCriticCourseAdmission(correction());
  assert.equal(admitted.attempt.round, 2);
  assert.equal(admitted.attempt.correctionCommits, 1);
  assert.equal(admitted.attempt.base, O("2"));
  assert.equal(admitted.admission.mode, "delta");
  assert.equal(admitted.parentRecordSha256, history()[0].recordSha256);
});

test("CCA03 rejects changed parent, missing correction and override-shaped delta", () => {
  const original = correction();
  assert.throws(() => deriveCriticCourseAdmission({ ...original, candidate: { ...original.candidate, base: O("9") } }), rejects("CCA-PARENT"));
  assert.throws(() => deriveCriticCourseAdmission({ ...original, correctionCommitsInRange: 0 }), rejects("CCA-CORRECTION-RANGE"));
  assert.throws(() => deriveCriticCourseAdmission({ ...original, delta: { ...delta, round: 1 } }), rejects("CCA-DELTA-SHAPE"));
  const forged = structuredClone(original.history);
  forged[0].course.reviewRound = 3;
  assert.throws(() => deriveCriticCourseAdmission({ ...original, history: forged }), rejects("CCA-HISTORY"));
});

test("CCA04 an exhausted retained course yields a PO gate, never another review", () => {
  const rows = fourRoundHistory();
  const decision = deriveCriticCourseAdmission({
    history: rows,
    candidate: { base: rows.at(-1).candidate.commit, commit: O("6"), tree: O("7") },
    correctionCommitsInRange: 1,
    requestedMode: "full",
    delta: {},
  });
  assert.equal(decision.attempt.round, 5);
  assert.equal(decision.attempt.correctionCommits, 4);
  assert.equal(decision.admission.courseGateRequired, true);
  assert.equal(decision.admission.ok, false);
});

test("CCA05 a caller-omitted history can look like genesis, so this pure helper is not spawn authority", () => {
  const retained = fourRoundHistory();
  const realCourse = deriveCriticCourseAdmission({
    history: retained,
    candidate: { base: retained.at(-1).candidate.commit, commit: O("6"), tree: O("7") },
    correctionCommitsInRange: 1,
    requestedMode: "full",
    delta: {},
  });
  assert.equal(realCourse.admission.courseGateRequired, true);
  const omitted = deriveCriticCourseAdmission({
    history: [],
    candidate: { base: retained.at(-1).candidate.commit, commit: O("6"), tree: O("7") },
    correctionCommitsInRange: 0,
    requestedMode: "full",
    delta: {},
  });
  assert.equal(omitted.attempt.round, 1);
  assert.equal(omitted.admission.ok, true);
});

test("CCA06 Git resolver retains the registered immutable Critic record", () => {
  const fx = registeredFixture();
  const source = resolveRegisteredCriticCourseHistory({ repoRoot: fx.root, featureId: fx.featureId, candidateCommit: fx.candidateCommit });
  assert.equal(source.history.length, 1);
  assert.equal(source.history[0].recordSha256, fx.first.recordSha256);
  assert.equal(source.manifestPath, fx.manifestPath);
});

test("CCA07 a later manifest cannot erase a prior Critic registration to reset the course", () => {
  const fx = registeredFixture();
  writeFileSync(join(fx.root, fx.manifestPath), `${JSON.stringify(fx.manifest([]))}\n`);
  git(fx.root, ["add", "."]); git(fx.root, ["commit", "-qm", "remove registration"]);
  const candidateCommit = git(fx.root, ["rev-parse", "HEAD"]);
  assert.throws(() => resolveRegisteredCriticCourseHistory({ repoRoot: fx.root, featureId: fx.featureId, candidateCommit }), rejects("CCA-REGISTRATION-REMOVED"));
});

test("CCA08 a retained registration fails if the evidence bytes drift", () => {
  const fx = registeredFixture();
  writeFileSync(join(fx.root, fx.evidencePath), `${JSON.stringify({ ...fx.first, reviewId: "forged" })}\n`);
  git(fx.root, ["add", "."]); git(fx.root, ["commit", "-qm", "mutate evidence"]);
  const candidateCommit = git(fx.root, ["rev-parse", "HEAD"]);
  assert.throws(() => resolveRegisteredCriticCourseHistory({ repoRoot: fx.root, featureId: fx.featureId, candidateCommit }), rejects("CCA-EVIDENCE-DIGEST"));
});

test("CCA09 unrelated historical candidate-evidence amendment does not erase the Critic course", () => {
  const fx = registeredFixture();
  const otherPath = `specs/${fx.featureId}/evidence/other.json`;
  const firstBytes = `${JSON.stringify({ schema: "other.evidence.v1", revision: 1 })}\n`;
  writeFileSync(join(fx.root, otherPath), firstBytes);
  let other = { ...fx.entry, path: otherPath, sha256: hash(firstBytes) };
  writeFileSync(join(fx.root, fx.manifestPath), `${JSON.stringify(fx.manifest([fx.entry, other]))}\n`);
  git(fx.root, ["add", "."]); git(fx.root, ["commit", "-qm", "register other evidence"]);
  const secondBytes = `${JSON.stringify({ schema: "other.evidence.v1", revision: 2 })}\n`;
  writeFileSync(join(fx.root, otherPath), secondBytes);
  other = { ...other, sha256: hash(secondBytes) };
  writeFileSync(join(fx.root, fx.manifestPath), `${JSON.stringify(fx.manifest([fx.entry, other]))}\n`);
  git(fx.root, ["add", "."]); git(fx.root, ["commit", "-qm", "amend other evidence"]);
  const candidateCommit = git(fx.root, ["rev-parse", "HEAD"]);
  const source = resolveRegisteredCriticCourseHistory({ repoRoot: fx.root, featureId: fx.featureId, candidateCommit });
  assert.equal(source.history.length, 1);
  assert.equal(source.history[0].recordSha256, fx.first.recordSha256);
});

test("CCA10 registered course source derives the real candidate range and rejects a mismatched parent", () => {
  const fx = registeredFixture();
  assert.throws(() => deriveRegisteredCriticCourseDecision({
    repoRoot: fx.root, featureId: fx.featureId, baseCommit: fx.genesisCommit,
    candidateCommit: fx.candidateCommit, requestedMode: "full", delta: {},
  }), rejects("CCA-CORRECTION-RANGE"));
  const nextPath = join(fx.root, "specs", fx.featureId, "next.md");
  writeFileSync(nextPath, "next change\n");
  git(fx.root, ["add", "."]); git(fx.root, ["commit", "-qm", "next candidate"]);
  const nextCommit = git(fx.root, ["rev-parse", "HEAD"]);
  const admitted = deriveRegisteredCriticCourseDecision({
    repoRoot: fx.root, featureId: fx.featureId, baseCommit: fx.genesisCommit,
    candidateCommit: nextCommit, requestedMode: "full", delta: {},
  });
  assert.equal(admitted.decision.attempt.round, 2);
  assert.equal(admitted.decision.attempt.correctionCommits, 1);
  assert.deepEqual(admitted.source.rangeCommits, [fx.candidateCommit, nextCommit]);
  assert.deepEqual(admitted.source.evidenceOnlyCommits, [fx.candidateCommit]);
  assert.deepEqual(admitted.source.correctionCommits, [nextCommit]);
  assert.throws(() => deriveRegisteredCriticCourseDecision({
    repoRoot: fx.root, featureId: fx.featureId, baseCommit: fx.genesisCommit,
    candidateCommit: nextCommit, requestedMode: "delta",
    delta: { changedPaths: [] },
  }), rejects("CCA-DELTA-COVERAGE"));
  assert.throws(() => deriveRegisteredCriticCourseSource({
    repoRoot: fx.root, featureId: fx.featureId, baseCommit: fx.candidateCommit, candidateCommit: nextCommit,
  }), rejects("CCA-PARENT"));
  const base = fx.genesisCommit;
  writeFileSync(join(fx.root, fx.manifestPath), `${JSON.stringify(fx.manifest([]))}\n`);
  git(fx.root, ["add", "."]); git(fx.root, ["commit", "-qm", "remove entry"]);
  assert.throws(() => deriveRegisteredCriticCourseSource({
    repoRoot: fx.root, featureId: fx.featureId, baseCommit: base, candidateCommit: git(fx.root, ["rev-parse", "HEAD"]),
  }), rejects("CCA-REGISTRATION-REMOVED"));
});

test("CCA11 genesis course source derives exact Git commits and changed paths", () => {
  const root = mkdtempSync(join(tmpdir(), "critic-course-genesis-"));
  const featureId = "genesis-feature";
  const directory = join(root, "specs", featureId);
  mkdirSync(directory, { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  writeFileSync(join(directory, "lifecycle.json"), `${JSON.stringify({ schema: "pipeline.feature-package.v1", feature: { id: featureId }, artifacts: [] })}\n`);
  git(root, ["add", "."]); git(root, ["commit", "-qm", "base"]);
  const baseCommit = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(join(directory, "source.md"), "changed\n");
  git(root, ["add", "."]); git(root, ["commit", "-qm", "candidate"]);
  const candidateCommit = git(root, ["rev-parse", "HEAD"]);
  const source = deriveRegisteredCriticCourseSource({ repoRoot: root, featureId, baseCommit, candidateCommit });
  assert.equal(source.history.length, 0);
  assert.deepEqual(source.rangeCommits, [candidateCommit]);
  assert.deepEqual(source.changedPaths, [`specs/${featureId}/source.md`]);
  const decision = deriveRegisteredCriticCourseDecision({
    repoRoot: root, featureId, baseCommit, candidateCommit, requestedMode: "full", delta: {},
  });
  assert.equal(decision.decision.attempt.round, 1);
  assert.equal(decision.decision.attempt.correctionCommits, 0);
});

test("CCA12 a mixed evidence-and-source commit still consumes correction budget", () => {
  const fx = registeredFixture();
  const extraPath = `specs/${fx.featureId}/evidence/extra.json`;
  const bytes = `${JSON.stringify({ schema: "other.evidence.v1" })}\n`;
  writeFileSync(join(fx.root, extraPath), bytes);
  writeFileSync(join(fx.root, "specs", fx.featureId, "source.md"), "corrected\n");
  writeFileSync(join(fx.root, fx.manifestPath), `${JSON.stringify(fx.manifest([
    fx.entry,
    { ...fx.entry, path: extraPath, sha256: hash(bytes) },
  ]))}\n`);
  git(fx.root, ["add", "."]); git(fx.root, ["commit", "-qm", "mixed correction"]);
  const mixedCommit = git(fx.root, ["rev-parse", "HEAD"]);
  const result = classifyRegisteredEvidenceOnlyCommits({
    repoRoot: fx.root, featureId: fx.featureId, baseCommit: fx.genesisCommit, candidateCommit: mixedCommit,
  });
  assert.deepEqual(result.evidenceOnlyCommits, [fx.candidateCommit]);
  assert.deepEqual(result.correctionCommits, [mixedCommit]);
});

test("CCA13 an authority change cannot hide in an evidence registration commit", () => {
  const fx = registeredFixture();
  const extraPath = `specs/${fx.featureId}/evidence/extra.json`;
  const bytes = `${JSON.stringify({ schema: "other.evidence.v1" })}\n`;
  writeFileSync(join(fx.root, extraPath), bytes);
  writeFileSync(join(fx.root, fx.manifestPath), `${JSON.stringify({
    ...fx.manifest([fx.entry, { ...fx.entry, path: extraPath, sha256: hash(bytes) }]),
    state: "implementing",
  })}\n`);
  git(fx.root, ["add", "."]); git(fx.root, ["commit", "-qm", "authority and evidence"]);
  const changedCommit = git(fx.root, ["rev-parse", "HEAD"]);
  const result = classifyRegisteredEvidenceOnlyCommits({
    repoRoot: fx.root, featureId: fx.featureId, baseCommit: fx.genesisCommit, candidateCommit: changedCommit,
  });
  assert.deepEqual(result.evidenceOnlyCommits, [fx.candidateCommit]);
  assert.deepEqual(result.correctionCommits, [changedCommit]);
});
