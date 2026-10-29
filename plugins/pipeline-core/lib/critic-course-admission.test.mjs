// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
const completionCases = [];
function test(name, run) { completionCases.push({id: "CCA" + String(completionCases.length + 1).padStart(3, "0"), name, run}); }
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { addCriticDiagnosticEvidence } from "./feature-package-registration.mjs";
import { runRegisterFeaturePackage } from "../scripts/register-feature-package.mjs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { compileCriticReviewLineage } from "./critic-review-lineage.mjs";
import { readCriticCourseAdmission, criticCourseRepair, resolveRegisteredCriticCourseIdentity, classifyRegisteredEvidenceOnlyCommits, deriveCriticCourseAdmission, deriveRegisteredCriticCourseDecision, deriveRegisteredCriticCourseSource, resolveRegisteredCriticCourseHistory, CriticCourseAdmissionError } from "./critic-course-admission.mjs";
import { sha256Canonical } from "./review-economy.mjs";

const H = (c) => c.repeat(64);
const O = (c) => c.repeat(40);
const path = "src/example.mjs";
const packet = (index) => {
  const chars = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c"];
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
    candidate: { ...synthetic.candidate, base: genesisCommit, commit: genesisCommit, tree: git(root, ["rev-parse", `${genesisCommit}^{tree}`]) },
    diff: { ...synthetic.diff, base: genesisCommit, commit: genesisCommit },
  };
  const first = history(firstPacket)[0];
  const bytes = `${JSON.stringify(first)}\n`;
  writeFileSync(join(root, evidencePath), bytes);
  const entry = { class: "candidate-evidence", path: evidencePath, sha256: hash(bytes), authority: false, mutability: "immutable", retention: "retain" };
  writeFileSync(join(root, manifestPath), `${JSON.stringify(manifest([entry]))}\n`);
  git(root, ["add", "."]); git(root, ["commit", "-qm", "registered review"]);
  return { root, featureId, manifestPath, evidencePath, manifest, entry, first, genesisCommit, candidateCommit: git(root, ["rev-parse", "HEAD"]) };
}
function fourRoundHistory(roundCount = 4) {
  const rows = history();
  for (let index = 1; index < roundCount; index += 1) {
    const currentPacket = packet(index);
    rows.push(compileCriticReviewLineage({
      packet: currentPacket,
      reviewId: `review-${index + 1}`,
      parent: rows.at(-1),
      packages: [{ id: "package", subjectSha256: H("d"), changedPaths: [path], integrationEdges: ["edge"] }],
      coverage: { changedPaths: [path], acceptanceIds: ["AC-1"], integrationEdges: ["edge"], complete: true, receiptSha256: H("e") },
      lane: { laneId: `lane-${index + 1}`, contextSha256: H((index + 3).toString(16)), evidenceSha256: H((index + 6).toString(16)) },
      verdict: { status: "findings", schemaValid: true, resultSha256: H("2"), failure: null },
      findings: [{ id: "finding-1", priorFindingId: "finding-1", severity: "high", status: "open", evidenceSha256: H((index + 2).toString(16)) }],
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

function diagnosticCarryCase() {
  const fx = registeredFixture();
  const logPath = `specs/${fx.featureId}/evidence/targeted.log`;
  const jsonPath = `specs/${fx.featureId}/evidence/diagnostic.json`;
  const tree = git(fx.root, ["rev-parse", `${fx.candidateCommit}^{tree}`]);
  const log = "command: node synthetic-check\nlabel: targeted-check\nexitCode: 0\n--- stdout ---\npass\n--- stderr ---\n";
  const value = { schema: "pipeline.critic-diagnostic-evidence.v1", producer: "critic-diagnostic-evidence",
    assurance: "captured-process-output-not-host-attested", candidate: {commit:fx.candidateCommit,tree},
    spec: {path:fx.manifestPath,sha256:hash(readFileSync(join(fx.root,fx.manifestPath)))},
    guardrails:[], fullVerify:{status:"not-run",evidence:null},
    targeted:{label:"targeted-check",status:"passed",exitCode:0,log:{path:logPath,sha256:hash(log)}}, pending:["full-verify"] };
  const json = `${JSON.stringify(value)}\n`;
  writeFileSync(join(fx.root,logPath),log);
  writeFileSync(join(fx.root,jsonPath),json);
  const entries = [fx.entry,
    {...fx.entry,path:jsonPath,sha256:hash(json)},
    {...fx.entry,path:logPath,sha256:hash(log)}];
  writeFileSync(join(fx.root,fx.manifestPath),`${JSON.stringify(fx.manifest(entries))}\n`);
  git(fx.root,["add","."]); git(fx.root,["commit","-qm","register diagnostic bundle"]);
  const candidateCommit=git(fx.root,["rev-parse","HEAD"]);
  const source=classifyRegisteredEvidenceOnlyCommits({repoRoot:fx.root,featureId:fx.featureId,baseCommit:fx.genesisCommit,candidateCommit});
  assert.deepEqual(source.evidenceOnlyCommits,[fx.candidateCommit,candidateCommit]);
  assert.deepEqual(source.correctionCommits,[]);
  writeFileSync(join(fx.root,logPath),"changed diagnostic output\n");
  git(fx.root,["add","."]); git(fx.root,["commit","-qm","change diagnostic content"]);
  const changedCommit=git(fx.root,["rev-parse","HEAD"]);
  const changed=classifyRegisteredEvidenceOnlyCommits({repoRoot:fx.root,featureId:fx.featureId,baseCommit:fx.genesisCommit,candidateCommit:changedCommit});
  assert.deepEqual(changed.correctionCommits,[changedCommit]);
  const unrelated=`specs/${fx.featureId}/evidence/unregistered.log`;
  writeFileSync(join(fx.root,unrelated),"unregistered\n");
  git(fx.root,["add","."]); git(fx.root,["commit","-qm","add unregistered log"]);
  const unregisteredCommit=git(fx.root,["rev-parse","HEAD"]);
  const unregistered=classifyRegisteredEvidenceOnlyCommits({repoRoot:fx.root,featureId:fx.featureId,baseCommit:fx.genesisCommit,candidateCommit:unregisteredCommit});
  assert.deepEqual(unregistered.correctionCommits,[changedCommit,unregisteredCommit]);
}

test("CCA14 one full and three successive parent-bound DIFF reviews are admitted", () => {
  for (const retainedCount of [1, 2, 3]) {
    const rows = fourRoundHistory(retainedCount);
    const next = packet(retainedCount);
    const decision = deriveCriticCourseAdmission({ history: rows, candidate: next.candidate, correctionCommitsInRange: 1, requestedMode: "delta", delta });
    assert.equal(decision.attempt.round, retainedCount + 1);
    assert.equal(decision.attempt.correctionCommits, retainedCount);
    assert.equal(decision.admission.ok, true);
    assert.equal(decision.admission.mode, "delta");
    assert.equal(decision.parentRecordSha256, rows.at(-1).recordSha256);
  }
});

test("CCA15 a new full review cannot be admitted after retained findings", () => {
  const decision = deriveCriticCourseAdmission({ ...correction(), requestedMode: "full", delta: {} });
  assert.equal(decision.admission.ok, false);
  assert.equal(decision.admission.code, "RE-FOLLOWUP-DELTA-REQUIRED");
});

test("D190 (a) a course at the old round limit admits a DIFF round, and the round after it", () => {
  for (const retainedCount of [4, 5]) {
    const rows = fourRoundHistory(retainedCount);
    const next = packet(retainedCount);
    const decision = deriveCriticCourseAdmission({ history: rows, candidate: next.candidate, correctionCommitsInRange: 1, requestedMode: "delta", delta });
    assert.equal(decision.attempt.round, retainedCount + 1);
    assert.equal(decision.admission.ok, true);
    assert.equal(decision.admission.mode, "delta");
    assert.equal(decision.parentRecordSha256, rows.at(-1).recordSha256);
  }
});

test("D190 (a2) a course past the old correction-commit limit admits a DIFF round", () => {
  const rows = fourRoundHistory(2);
  const next = packet(2);
  const decision = deriveCriticCourseAdmission({ history: rows, candidate: next.candidate, correctionCommitsInRange: 5, requestedMode: "delta", delta });
  assert.equal(decision.attempt.correctionCommits, 6);
  assert.equal(decision.admission.ok, true);
  assert.equal(decision.admission.mode, "delta");
});

test("D190 (b) a FULL request after a consumed round is still refused, also past the old limits", () => {
  const rows = fourRoundHistory(4);
  const decision = deriveCriticCourseAdmission({ history: rows, candidate: { base: rows.at(-1).candidate.commit, commit: O("6"), tree: O("7") }, correctionCommitsInRange: 1, requestedMode: "full", delta: {} });
  assert.equal(decision.admission.ok, false);
  assert.equal(decision.admission.code, "RE-CRITIC-ROUND-LIMIT");
  const early = deriveCriticCourseAdmission({ ...correction(), requestedMode: "full", delta: {} });
  assert.equal(early.admission.ok, false);
  assert.equal(early.admission.code, "RE-FOLLOWUP-DELTA-REQUIRED");
});

test("D190 (c) a DIFF round past the old limits whose range has no correction commit is still refused", () => {
  const rows = fourRoundHistory(4);
  const next = packet(4);
  assert.throws(() => deriveCriticCourseAdmission({ history: rows, candidate: next.candidate, correctionCommitsInRange: 0, requestedMode: "delta", delta }), rejects("CCA-CORRECTION-RANGE"));
});

function runtimeRequest(fx, overrides = {}) {
  return { repoRoot: fx.root, featureId: fx.featureId, baseCommit: fx.genesisCommit, candidateCommit: fx.candidateCommit, registrationCommit: fx.candidateCommit, requestedMode: "delta", acceptedReference: null, criterionLocator: null, deltaRequestPath: null, ...overrides };
}

test("CCA16 retained finding prose and replayed candidates never substitute for a consumed journal", () => {
  const fx = registeredFixture();
  for (const overrides of [{}, {requestedMode: "full"}, {baseCommit: fx.candidateCommit}]) {
    const actual = readCriticCourseAdmission(runtimeRequest(fx, overrides));
    assert.equal(actual.decision.status, "unavailable", JSON.stringify(actual));
    assert.equal(actual.decision.code, "CVL-COURSE-JOURNAL-UNAVAILABLE");
    assert.equal(actual.decision.mode, null);
  }
});

test("CCA17 a renamed feature without a registered counterpart cannot reset the retained course", () => {
  const fx = registeredFixture();
  const alias = "renamed-course-feature";
  mkdirSync(join(fx.root, "specs", alias), {recursive: true});
  writeFileSync(join(fx.root, "specs", alias, "lifecycle.json"), JSON.stringify({ ...fx.manifest([]), feature: {id: alias}, supersedes: fx.featureId }));
  git(fx.root, ["add", "."]); git(fx.root, ["commit", "-qm", "rename without bound alias"]);
  const registrationCommit = git(fx.root, ["rev-parse", "HEAD"]);
  const actual = resolveRegisteredCriticCourseIdentity({repoRoot: fx.root, featureId: alias, baseCommit: fx.genesisCommit, candidateCommit: fx.candidateCommit, registrationCommit, acceptedReference: null});
  assert.equal(actual.ok, false);
  assert.equal(actual.code, "CCA-ALIAS-MAPPING-UNAVAILABLE");
});

test("CCA18 dropping retained registration cannot create new genesis in the runtime reader", () => {
  const fx = registeredFixture();
  writeFileSync(join(fx.root, fx.manifestPath), JSON.stringify(fx.manifest([])));
  git(fx.root, ["add", "."]); git(fx.root, ["commit", "-qm", "drop history"]);
  const registrationCommit = git(fx.root, ["rev-parse", "HEAD"]);
  const actual = readCriticCourseAdmission(runtimeRequest(fx, {registrationCommit, requestedMode: "full"}));
  assert.equal(actual.decision.status, "refused");
  assert.equal(actual.decision.code, "CCA-REGISTRATION-REMOVED");
});

test("CCA19 registered diagnostic JSON and required log carry as one immutable candidate bundle", diagnosticCarryCase);
// D165-PF75B: the review unit is read at the commit that introduced it, not only at the genesis base.
function unitFixture({late, unit = true, bulk = 0}) {
  const root = mkdtempSync(join(tmpdir(), "critic-unit-intro-"));
  const featureId = "unit-feature", dir = `specs/${featureId}`, manifestPath = `${dir}/lifecycle.json`, specPath = `${dir}/spec.md`, unitPath = `${dir}/design/critic-review-unit.json`;
  mkdirSync(join(root, dir, "design"), {recursive: true}); mkdirSync(join(root, "src"), {recursive: true});
  git(root, ["init", "-q"]); git(root, ["config", "user.name", "Fixture"]); git(root, ["config", "user.email", "fixture@example.invalid"]);
  const commit = (message) => { git(root, ["add", "."]); git(root, ["commit", "-qm", message]); return git(root, ["rev-parse", "HEAD"]); };
  writeFileSync(join(root, "README.md"), "pre\n");
  const pre = commit("pre-manifest");
  writeFileSync(join(root, specPath), "# Spec\nAC-1 behavior\n");
  const artifacts = [{class: "spec", path: specPath, sha256: hash(readFileSync(join(root, specPath))), authority: true, mutability: "mutable", retention: "active"}];
  const write = () => writeFileSync(join(root, manifestPath), `${JSON.stringify({schema: "pipeline.feature-package.v1", feature: {id: featureId, rigor: 1}, state: "approved", artifacts})}\n`);
  const unitBody = (purpose) => JSON.stringify({schema: "pipeline.critic-review-unit.v1", kind: "feature-section", purpose, specPath, logicalWorkIds: ["work-one", "work-two"], criterionIds: ["AC-1"], deliveryBoundary: {mainRef: git(root, ["symbolic-ref", "HEAD"])}, singletonRationale: null});
  const addUnit = (purpose) => { writeFileSync(join(root, unitPath), unitBody(purpose)); const entry = {class: "design", path: unitPath, sha256: hash(readFileSync(join(root, unitPath))), authority: false, mutability: "immutable", retention: "retain"}; const at = artifacts.findIndex(e => e.path === unitPath); if (at >= 0) artifacts[at] = entry; else artifacts.push(entry); write(); };
  const out = {root, featureId, manifestPath, unitPath, pre, addUnit, commit, write, git: (...a) => git(root, a)};
  if (!late) { if (unit) addUnit("Deliver one behavior boundary"); else write(); out.base = commit("manifest with unit"); }
  else { write(); out.base = commit("manifest without unit"); writeFileSync(join(root, "src/code.mjs"), "export const delivered = 1;\n"); out.code = commit("delivered code"); if (unit) { addUnit("Deliver one behavior boundary"); out.unit = commit("late review unit"); } }
  if (bulk) { const lines = []; let parent = git(root, ["rev-parse", "HEAD"]); for (let i = 0; i < bulk; i++) { lines.push(`commit refs/heads/bulk\nmark :${i + 1}\ncommitter F <f@example.invalid> ${1700000000 + i} +0000\ndata 1\nx\n${i ? `from :${i}` : `from ${parent}`}\n`); } execFileSync("git", ["-C", root, "fast-import", "--quiet"], {input: lines.join("\n")}); git(root, ["reset", "-q", "--hard", "bulk"]); }
  writeFileSync(join(root, "src/code.mjs"), "export const delivered = 2;\n");
  out.candidate = commit("candidate");
  return out;
}
const unitRequest = (fx, overrides = {}) => runtimeRequest({root: fx.root, featureId: fx.featureId, genesisCommit: fx.base, candidateCommit: fx.candidate}, {requestedMode: "full", ...overrides});
const identityOf = (fx, candidate = fx.candidate) => resolveRegisteredCriticCourseIdentity({repoRoot: fx.root, featureId: fx.featureId, baseCommit: fx.base, candidateCommit: candidate, registrationCommit: candidate, acceptedReference: null});
test("D165-PF75B (a) a unit already listed at the base keeps decision and course key", () => {
  const fx = unitFixture({late: false});
  const actual = readCriticCourseAdmission(unitRequest(fx));
  assert.equal(actual.decision.code, "CCA-DETERMINISTIC-UNAVAILABLE", JSON.stringify(actual.decision));
  const identity = identityOf(fx);
  assert.equal(identity.ok, true);
  const subject = {repositoryFingerprint: identity.value.courseIdentity.repositoryFingerprint, originalFeatureId: fx.featureId, manifestPath: fx.manifestPath, originalManifestSha256: hash(git(fx.root, ["show", `${fx.base}:${fx.manifestPath}`]) + "\n"), genesisCandidate: identity.value.courseIdentity.genesisCandidate};
  assert.equal(identity.value.courseIdentity.courseKey, sha256Canonical(subject));
  assert.deepEqual(identity.value.courseIdentity.genesisCandidate.base, fx.base);
});
test("D165-PF75B (b) a unit introduced after the first review base is admitted from the commit that added the manifest", () => {
  const fx = unitFixture({late: true});
  const range = fx.git("rev-list", `${fx.base}..${fx.candidate}`).split("\n");
  assert.ok(range.includes(fx.code) && range.includes(fx.unit));
  const actual = readCriticCourseAdmission(unitRequest(fx));
  assert.equal(actual.decision.code, "CCA-DETERMINISTIC-UNAVAILABLE", JSON.stringify(actual.decision));
});
test("D165-PF75B (h) a base before the manifest stays refused and the repair names the registration commit", () => {
  const fx = unitFixture({late: true});
  const actual = readCriticCourseAdmission(unitRequest(fx, {baseCommit: fx.pre}));
  assert.equal(actual.decision.code, "CCA-MANIFEST-READ", JSON.stringify(actual.decision));
  const repair = criticCourseRepair("CCA-MANIFEST-READ");
  assert.equal(typeof repair, "string");
  assert.match(repair, /git log --diff-filter=A --format=%H -- specs\/<id>\/lifecycle\.json/u);
  assert.match(repair, /commit that (first )?added the feature manifest/u);
});
test("D165-PF75B (c) no commit between base and candidate lists the unit", () => {
  const fx = unitFixture({late: true, unit: false});
  const actual = readCriticCourseAdmission(unitRequest(fx));
  assert.equal(actual.decision.code, "CCA-REVIEW-UNIT-REQUIRED", JSON.stringify(actual.decision));
});
test("D165-PF75B (d) a late unit rewritten after its introduction is refused as a binding failure", () => {
  const fx = unitFixture({late: true});
  fx.addUnit("Rewritten scope after declaring");
  fx.candidate = fx.commit("rewrite unit");
  const actual = readCriticCourseAdmission(unitRequest(fx));
  assert.equal(actual.decision.code, "CCA-REVIEW-UNIT-BINDING", JSON.stringify(actual.decision));
});
test("D165-PF75B (e) a later round resolves the same introducing commit and the same course key", () => {
  // Criterion: determinism of the introducing commit and an unchanged course key. With no retained history the genesis candidate is the input candidate, so keys of different candidates differ by design; base and candidate are held fixed here.
  const fx = unitFixture({late: true});
  const first = readCriticCourseAdmission(unitRequest(fx)), again = readCriticCourseAdmission(unitRequest(fx));
  assert.equal(first.decision.code, "CCA-DETERMINISTIC-UNAVAILABLE", JSON.stringify(first.decision));
  assert.deepEqual(again, first);
  const one = identityOf(fx), two = identityOf(fx);
  assert.equal(one.ok && two.ok, true);
  assert.equal(two.value.courseIdentity.courseKey, one.value.courseIdentity.courseKey);
});
test("D165-PF75B (f) a range over 512 commits is refused", () => {
  const fx = unitFixture({late: true, bulk: 513});
  const actual = readCriticCourseAdmission(unitRequest(fx));
  assert.equal(actual.decision.code, "CCA-RANGE-BOUND", JSON.stringify(actual.decision));
});
test("D165-PF75B (g) the missing-unit repair no longer says the unit commit is the base of the first review", () => {
  const repair = criticCourseRepair("CCA-REVIEW-UNIT-REQUIRED");
  assert.doesNotMatch(repair, /base of the first review/u);
  assert.doesNotMatch(repair, /start the course's first review from it/u);
  assert.match(repair, /any base on the candidate history that already lists the feature manifest/u);
  assert.match(repair, /register-feature-package\.mjs --root <root> --add-review-unit/u);
});
// D165-CDR: a sanctioned command registers Critic diagnostic evidence in the feature manifest.
function diagFixture() {
  const fx = unitFixture({late: false});
  const dir = `specs/${fx.featureId}/evidence`;
  mkdirSync(join(fx.root, dir), {recursive: true});
  const specPath = `specs/${fx.featureId}/spec.md`, logPath = `${dir}/targeted.log`, jsonPath = `${dir}/diagnostic.json`;
  const log = "command: node synthetic-check\nlabel: targeted-check\nexitCode: 0\n--- stdout ---\npass\n--- stderr ---\n";
  const value = {schema: "pipeline.critic-diagnostic-evidence.v1", producer: "critic-diagnostic-evidence", assurance: "captured-process-output-not-host-attested",
    candidate: {commit: fx.candidate, tree: git(fx.root, ["rev-parse", `${fx.candidate}^{tree}`])},
    spec: {path: specPath, sha256: hash(readFileSync(join(fx.root, specPath)))}, guardrails: [], fullVerify: {status: "not-run", evidence: null},
    targeted: {label: "targeted-check", status: "passed", exitCode: 0, log: {path: logPath, sha256: hash(log)}}, pending: ["full-verify"]};
  const write = (v = value, p = jsonPath) => { writeFileSync(join(fx.root, p), `${JSON.stringify(v)}\n`); return p; };
  writeFileSync(join(fx.root, logPath), log); write();
  // The registration writer refuses a manifest that does not validate, so the working-tree manifest gets the full approved topology (closed keys, prd/acceptance/result/candidate-evidence).
  const topo = [["prd", "prd.md", true, "mutable", "active"], ["acceptance", "acceptance.md", false, "mutable", "active"], ["result", "result.md", false, "mutable", "active"], ["candidate-evidence", "evidence/seed.json", false, "immutable", "retain"]].map(([klass, rel, authority, mutability, retention]) => {
    const path = `specs/${fx.featureId}/${rel}`; writeFileSync(join(fx.root, path), `${klass}\n`);
    return {class: klass, path, sha256: hash(readFileSync(join(fx.root, path))), authority, mutability, retention};
  });
  const committed = JSON.parse(readFileSync(join(fx.root, fx.manifestPath), "utf8"));
  writeFileSync(join(fx.root, fx.manifestPath), `${JSON.stringify({...committed, artifacts: [...committed.artifacts, ...topo], candidate: null, supersedes: null})}\n`);
  const state = {activeFeature: {id: fx.featureId}};
  return {...fx, dir, specPath, logPath, jsonPath, value, log, write, state,
    manifestBytes: () => readFileSync(join(fx.root, fx.manifestPath)),
    register: (path = jsonPath) => addCriticDiagnosticEvidence({root: fx.root, state, path})};
}
test("D165-CDR (a) a valid diagnostic is registered with its log and the next admission no longer lacks deterministic evidence", () => {
  const fx = diagFixture();
  const result = fx.register();
  assert.equal(result.status, "diagnostic-added", JSON.stringify(result));
  const manifest = JSON.parse(fx.manifestBytes());
  for (const path of [fx.jsonPath, fx.logPath]) {
    const entry = manifest.artifacts.find(e => e.path === path);
    assert.deepEqual({...entry, sha256: undefined}, {class: "candidate-evidence", authority: false, mutability: "immutable", retention: "retain", path, sha256: undefined});
    assert.equal(entry.sha256, hash(readFileSync(join(fx.root, path))));
  }
  assert.deepEqual([...result.commitPaths].sort(), [fx.jsonPath, fx.logPath, fx.manifestPath].sort());
  fx.git("add", "."); fx.git("commit", "-qm", "register diagnostic");
  const registrationCommit = fx.git("rev-parse", "HEAD");
  const actual = readCriticCourseAdmission(runtimeRequest({root: fx.root, featureId: fx.featureId, genesisCommit: fx.base, candidateCommit: fx.candidate}, {requestedMode: "full", registrationCommit}));
  assert.notEqual(actual.decision.code, "CCA-DETERMINISTIC-UNAVAILABLE", JSON.stringify(actual.decision));
});
test("D165-CDR (b) another commit or tree is refused and the manifest is byte-identical", () => {
  for (const mutate of [(v, f) => { v.candidate.commit = f.pre; }, (v) => { v.candidate.tree = "1".repeat(40); }]) {
    const fx = diagFixture();
    const before = fx.manifestBytes();
    const value = structuredClone(fx.value); mutate(value, fx);
    const result = fx.register(fx.write(value));
    assert.equal(result.code, "FPR-DIAG-CANDIDATE", JSON.stringify(result));
    assert.deepEqual(fx.manifestBytes(), before);
  }
});
test("D165-CDR (c) a path outside the evidence directory, a symlink and a missing file are refused FPR-DIAG-PATH", () => {
  const fx = diagFixture();
  const before = fx.manifestBytes();
  writeFileSync(join(fx.root, "elsewhere.json"), readFileSync(join(fx.root, fx.jsonPath)));
  assert.equal(fx.register("elsewhere.json").code, "FPR-DIAG-PATH");
  assert.equal(fx.register(`${fx.dir}/missing.json`).code, "FPR-DIAG-PATH");
  assert.equal(fx.register(`specs/${fx.featureId}/evidence/../spec.md`).code, "FPR-DIAG-PATH");
  try { symlinkSync(join(fx.root, fx.jsonPath), join(fx.root, `${fx.dir}/link.json`), "file"); assert.equal(fx.register(`${fx.dir}/link.json`).code, "FPR-DIAG-PATH"); } catch (error) { if (error?.code !== "EPERM") throw error; }
  assert.deepEqual(fx.manifestBytes(), before);
});
test("D165-CDR (d) JSON that is not a diagnostic is refused FPR-DIAG-SCHEMA", () => {
  const fx = diagFixture();
  const before = fx.manifestBytes();
  assert.equal(fx.register(fx.write({schema: "something-else"}, `${fx.dir}/other.json`)).code, "FPR-DIAG-SCHEMA");
  assert.equal(fx.register(fx.write({...fx.value, extra: 1}, `${fx.dir}/extra.json`)).code, "FPR-DIAG-SCHEMA");
  writeFileSync(join(fx.root, `${fx.dir}/notjson.json`), "not json");
  assert.equal(fx.register(`${fx.dir}/notjson.json`).code, "FPR-DIAG-SCHEMA");
  assert.deepEqual(fx.manifestBytes(), before);
});
test("D165-CDR (e) a missing or altered member is refused FPR-DIAG-MEMBER", () => {
  const fx = diagFixture();
  const before = fx.manifestBytes();
  writeFileSync(join(fx.root, fx.logPath), "altered\n");
  assert.equal(fx.register().code, "FPR-DIAG-MEMBER");
  rmSync(join(fx.root, fx.logPath));
  assert.equal(fx.register().code, "FPR-DIAG-MEMBER");
  assert.deepEqual(fx.manifestBytes(), before);
});
test("D165-CDR (f) the same bytes twice are already-registered and other bytes at a registered path are FPR-DIAG-IMMUTABLE", () => {
  const fx = diagFixture();
  assert.equal(fx.register().status, "diagnostic-added");
  const once = fx.manifestBytes();
  assert.equal(fx.register().status, "already-registered");
  assert.deepEqual(fx.manifestBytes(), once);
  fx.write({...fx.value, pending: ["full-verify", "another"]});
  const result = fx.register();
  assert.equal(result.code, "FPR-DIAG-IMMUTABLE", JSON.stringify(result));
  assert.deepEqual(fx.manifestBytes(), once);
});
test("D165-CDR (g) the CLI accepts exactly the diagnostic shape and refuses any other FPR-ARGS", () => {
  const root = mkdtempSync(join(tmpdir(), "critic-diag-cli-"));
  const run = (argv) => { let text = ""; const code = runRegisterFeaturePackage(argv, (t) => { text += t; }); return {code, out: JSON.parse(text)}; };
  const accepted = run(["--root", root, "--add-diagnostic-evidence", "specs/x/evidence/d.json"]);
  assert.notEqual(accepted.out.code, "FPR-ARGS", JSON.stringify(accepted.out));
  for (const argv of [["--add-diagnostic-evidence", "p", "--root", root], ["--root", root, "--add-diagnostic-evidence"], ["--root", root, "--add-diagnostic-evidence", "--root"], ["--root", root, "--add-diagnostic-evidence", "a", "b"], ["--root", root, "--add-review-unit", "x"]]) {
    const refusal = run(argv);
    assert.equal(refusal.code, 2); assert.equal(refusal.out.code, "FPR-ARGS", JSON.stringify(argv));
  }
});
test("D165-CDR (h) the deterministic-unavailable repair names the producing and the registering command", () => {
  const repair = criticCourseRepair("CCA-DETERMINISTIC-UNAVAILABLE");
  assert.equal(typeof repair, "string");
  assert.match(repair, /scripts\/critic-diagnostic-evidence\.mjs/u);
  assert.match(repair, /register-feature-package\.mjs --root <root> --add-diagnostic-evidence <path>/u);
  assert.match(repair, /critic-dispatch-preflight\.mjs/u);
});
// D167-PF78: the producer writes where the registrar accepts it; the whole route is one chain.
import {produceCriticDiagnostic} from "./critic-diagnostic-producer.mjs";
import {planVerifySelection} from "./verify-selection.mjs";
function chainFixture({verifyAt}) {
  const fx = unitFixture({late: false});
  writeFileSync(join(fx.root, ".git/info/exclude"), "/evidence/\n");
  const dir = `specs/${fx.featureId}/evidence`, specPath = `specs/${fx.featureId}/spec.md`;
  const tree = git(fx.root, ["rev-parse", `${fx.candidate}^{tree}`]);
  const verify = {schema: "pipeline.verify-evidence.v0", commit: fx.candidate, tree, exitCode: 0, steps: [{name: "check", exitCode: 0}],
    selection: planVerifySelection({mode: "critic", candidateCommit: fx.candidate, registeredSuiteIds: ["check"], policy: {schema: "pipeline.verify-selection.v1", baseline: ["check"], areas: [{id: "all", paths: ["**"], suites: ["check"]}]}})};
  mkdirSync(join(fx.root, verifyAt.split("/").slice(0, -1).join("/")), {recursive: true});
  writeFileSync(join(fx.root, verifyAt), JSON.stringify(verify));
  const jsonPath = `${dir}/diagnostic.json`, logPath = `${dir}/targeted.log`;
  const value = produceCriticDiagnostic({root: fx.root, specPath, command: [process.execPath, "-e", "console.log('ok')"], logPath, fullVerifyPath: verifyAt});
  writeFileSync(join(fx.root, jsonPath), `${JSON.stringify(value, null, 2)}\n`);
  const topo = [["prd", "prd.md", true, "mutable", "active"], ["acceptance", "acceptance.md", false, "mutable", "active"], ["result", "result.md", false, "mutable", "active"], ["candidate-evidence", "evidence/seed.json", false, "immutable", "retain"]].map(([klass, rel, authority, mutability, retention]) => {
    const path = `specs/${fx.featureId}/${rel}`; writeFileSync(join(fx.root, path), `${klass}\n`);
    return {class: klass, path, sha256: hash(readFileSync(join(fx.root, path))), authority, mutability, retention};
  });
  const committed = JSON.parse(readFileSync(join(fx.root, fx.manifestPath), "utf8"));
  writeFileSync(join(fx.root, fx.manifestPath), `${JSON.stringify({...committed, artifacts: [...committed.artifacts, ...topo], candidate: null, supersedes: null})}\n`);
  return {...fx, value, jsonPath, logPath, register: () => addCriticDiagnosticEvidence({root: fx.root, state: {activeFeature: {id: fx.featureId}}, path: jsonPath})};
}
test("D167-PF78 (2,3) produce into specs/<id>/evidence with a copied full-verify member, register, and admission no longer lacks deterministic evidence", () => {
  const fx = chainFixture({verifyAt: "specs/unit-feature/evidence/verify-copy.json"});
  assert.equal(fx.value.fullVerify.status, "passed");
  const result = fx.register();
  assert.equal(result.status, "diagnostic-added", JSON.stringify(result));
  const manifest = JSON.parse(readFileSync(join(fx.root, fx.manifestPath), "utf8"));
  for (const path of [fx.jsonPath, fx.logPath, fx.value.fullVerify.evidence.path]) assert.ok(manifest.artifacts.some(e => e.path === path && e.class === "candidate-evidence"), path);
  fx.git("add", "."); fx.git("commit", "-qm", "register diagnostic");
  const registrationCommit = fx.git("rev-parse", "HEAD");
  const actual = readCriticCourseAdmission(runtimeRequest({root: fx.root, featureId: fx.featureId, genesisCommit: fx.base, candidateCommit: fx.candidate}, {requestedMode: "full", registrationCommit}));
  assert.notEqual(actual.decision.code, "CCA-DETERMINISTIC-UNAVAILABLE", JSON.stringify(actual.decision));
});
test("D167-PF78 (3) a diagnostic whose full-verify member is the fixed evidence/verify-latest.json is refused FPR-DIAG-PATH naming the copy-then-produce route", () => {
  const fx = chainFixture({verifyAt: "evidence/verify-latest.json"});
  const before = readFileSync(join(fx.root, fx.manifestPath));
  const result = fx.register();
  assert.equal(result.code, "FPR-DIAG-PATH", JSON.stringify(result));
  assert.match(result.message ?? JSON.stringify(result), /copy/u);
  assert.match(result.message ?? JSON.stringify(result), /--full-verify/u);
  assert.deepEqual(readFileSync(join(fx.root, fx.manifestPath)), before);
});
// G18 slice B: every reviewer-admission refusal code names a recovery or an explicit no-route.
const ccaCodes = [...new Set(readFileSync(new URL("./critic-course-admission.mjs", import.meta.url), "utf8").match(/CCA-[A-Z0-9]+(?:-[A-Z0-9]+)*/gu))].sort();
test("G18B (a) the enumerated CCA code set is non-trivial and includes the three repaired codes", () => {
  assert.ok(ccaCodes.length > 40, String(ccaCodes.length));
  for (const code of ["CCA-DETERMINISTIC-UNAVAILABLE", "CCA-REVIEW-UNIT-REQUIRED", "CCA-MANIFEST-READ"]) assert.ok(ccaCodes.includes(code), code);
});
test("G18B (b) every CCA refusal code yields a non-null recovery or an explicit no-route naming who decides", () => {
  for (const code of ccaCodes) {
    const repair = criticCourseRepair(code);
    assert.notEqual(repair, null, code);
    if (typeof repair === "string") { assert.ok(repair.length > 20, code); continue; }
    assert.equal(repair.route, "none", code);
    assert.ok(["PO", "Coordinator"].includes(repair.decidedBy), code);
    assert.equal(typeof repair.reason, "string", code);
    assert.ok(repair.reason.length > 0, code);
  }
});
test("G18B (c) the three existing repairs keep their exact text and non-CCA input stays null", () => {
  const sha = (v) => hash(Buffer.from(v));
  assert.equal(sha(criticCourseRepair("CCA-DETERMINISTIC-UNAVAILABLE")), "82c0cb9fd7335a83a67eb42e85f7f43cd33e413975da46e4008b6c093f331d32");
  assert.equal(sha(criticCourseRepair("CCA-REVIEW-UNIT-REQUIRED")), "5529bda66d4b0b02095cf06d726b032e7360a4692a00e859cb3801659162a4c4");
  assert.equal(sha(criticCourseRepair("CCA-MANIFEST-READ")), "4deceb8240578c2c85665690fe09bbac7d3ef571c450e98a84ac597a8d016def");
  assert.equal(criticCourseRepair("CDP-COURSE-UNAVAILABLE"), null);
  assert.equal(criticCourseRepair(undefined), null);
});
// D51-CARRY: diagnostic evidence bound to an ancestor commit A is carried to a later candidate B only across a registered evidence-only range.
function carryFixture() {
  const fx = diagFixture();
  fx.git("add", ".");
  fx.git("reset", "-q", "--", fx.logPath, fx.jsonPath);
  fx.git("commit", "-qm", "topology without diagnostic");
  const evidenced = fx.git("rev-parse", "HEAD");
  fx.write({...fx.value, candidate: {commit: evidenced, tree: fx.git("rev-parse", `${evidenced}^{tree}`)}});
  const result = fx.register();
  assert.equal(result.status, "diagnostic-added", JSON.stringify(result));
  fx.git("add", "."); fx.git("commit", "-qm", "register diagnostic for the evidenced commit");
  const registered = fx.git("rev-parse", "HEAD");
  const entries = [{path: fx.jsonPath, sha256: hash(readFileSync(join(fx.root, fx.jsonPath)))}];
  const admit = (candidate, registrationCommit = candidate) =>
    readCriticCourseAdmission(runtimeRequest({root: fx.root, featureId: fx.featureId, genesisCommit: fx.base, candidateCommit: candidate}, {requestedMode: "full", registrationCommit}));
  return {...fx, evidenced, registered, entries, admit};
}
test("D51-CARRY (a) evidence for A is accepted for B across a registered evidence-only range and the carry proof is in the digest", () => {
  const fx = carryFixture();
  const actual = fx.admit(fx.registered);
  assert.notEqual(actual.decision.code, "CCA-DETERMINISTIC-UNAVAILABLE", JSON.stringify(actual.decision));
  assert.match(actual.deterministicEvidenceSha256 ?? "", /^[0-9a-f]{64}$/u, JSON.stringify(actual));
  assert.notEqual(actual.deterministicEvidenceSha256, sha256Canonical(fx.entries));
});
test("D51-CARRY (b) evidence is not carried when a non-evidence file changed in the range", () => {
  const fx = carryFixture();
  writeFileSync(join(fx.root, "src/code.mjs"), "export const delivered = 3;\n");
  fx.git("add", "."); fx.git("commit", "-qm", "source change after evidence");
  const actual = fx.admit(fx.git("rev-parse", "HEAD"));
  assert.equal(actual.decision.code, "CCA-DETERMINISTIC-UNAVAILABLE", JSON.stringify(actual.decision));
});
test("D51-CARRY (c) evidence is not carried when the spec content differs at B", () => {
  const fx = carryFixture();
  writeFileSync(join(fx.root, fx.specPath), "# Spec\nAC-1 changed behavior\n");
  fx.git("add", "."); fx.git("commit", "-qm", "spec change after evidence");
  const actual = fx.admit(fx.git("rev-parse", "HEAD"));
  assert.equal(actual.decision.code, "CCA-DETERMINISTIC-UNAVAILABLE", JSON.stringify(actual.decision));
});
test("D51-CARRY (d) evidence is not carried when a correction commit exists in the range", () => {
  const fx = carryFixture();
  const manifest = JSON.parse(readFileSync(join(fx.root, fx.manifestPath), "utf8"));
  writeFileSync(join(fx.root, fx.manifestPath), `${JSON.stringify({...manifest, feature: {...manifest.feature, rigor: 2}})}\n`);
  fx.git("add", "."); fx.git("commit", "-qm", "manifest correction after evidence");
  const actual = fx.admit(fx.git("rev-parse", "HEAD"));
  assert.equal(actual.decision.code, "CCA-DETERMINISTIC-UNAVAILABLE", JSON.stringify(actual.decision));
});
test("D51-CARRY (e) exact-commit evidence behaves as before and records no carry in the digest", () => {
  const fx = carryFixture();
  const actual = fx.admit(fx.evidenced, fx.registered);
  assert.notEqual(actual.decision.code, "CCA-DETERMINISTIC-UNAVAILABLE", JSON.stringify(actual.decision));
  assert.equal(actual.deterministicEvidenceSha256, sha256Canonical(fx.entries), JSON.stringify(actual));
});
// PF-94 c16: a REAL consumed course round (claim, session finalization in the owner store), reused by the delta-request slice.
import { admitSessionCriticReview, finalizeSessionCriticReview } from "../scripts/session-critic-finalizer.mjs";
import { preflightCriticDispatch } from "../scripts/critic-dispatch-preflight.mjs";
import { registerGenericCriticBatch } from "./critic-generic-batch.mjs";
import { addCriticReviewLineage } from "./feature-package-registration.mjs";
import { chmodSync, existsSync, readdirSync } from "node:fs";
import { readConsumedCandidateResult } from "../scripts/critic-packet-preflight.mjs";
const pf94Commit = (root, message) => { git(root, ["add", "."]); git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", message]); return git(root, ["rev-parse", "HEAD"]); };
const pf94Guardrails = [".claude/pipeline.yaml", "governance/guidelines/review.md", "governance/policies/checklist.md"];
const pf94Verdict = { findings: [], deliberately_not_flagged: ["scope"], trajectory_verdict: "consistent", trajectory_evidence: "candidate evidence inspected", briefing_violations: [], pass: true };
// PF-98: a Delta range always contains the registered lineage and delta-request files, so the real route derives the
// correction input bindings for it and passes the file; this writes that file under scratch/ and returns its path.
import { deriveCriticCorrectionInputBindings } from "./critic-correction-input-bindings.mjs";
const pf94Bindings = (root, base, head) => {
  const path = `scratch/correction-input-bindings-${head.slice(0, 12)}.json`;
  mkdirSync(join(root, "scratch"), { recursive: true });
  writeFileSync(join(root, path), `${JSON.stringify(deriveCriticCorrectionInputBindings({ repoRoot: root, base, head, projectStateOptional: true }), null, 2)}\n`);
  return path;
};
const pf94Origin = (q) => ({ schema: "pipeline.session-critic-source-return.v1", issuer: "source", packetId: q.packetId, packetDigest: q.packetDigest, claimant: q.claimant, sessionId: q.sessionId, verdictSha256: q.verdictSha256, issuedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 60000 });
/** course=true: the course path (claim written at admit). course=false: the previous behaviour, generic batch plus caller-authored fallback, no course claim. */
// Options: course (true: course path with claim; false: generic batch + caller-authored fallback, no claim), failing (true: the round did NOT pass and carries one open major finding), featureId, logicalWorkIds, taskId.
export function consumedCourseRoundFixture({ course = true, failing = false, featureId = "held-feature", logicalWorkIds = ["scope-one", "scope-two"], taskId = "feature-held-task", extraCandidateFiles = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "pf94-course-round-"));
  git(root, ["init", "-q", "-b", "main"]);
  mkdirSync(join(root, ".claude"), { recursive: true }); mkdirSync(join(root, "governance", "guidelines"), { recursive: true }); mkdirSync(join(root, "governance", "policies"), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\ngovernance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\n");
  writeFileSync(join(root, "governance", "guidelines", "review.md"), "Review changed code.\n");
  writeFileSync(join(root, "governance", "policies", "checklist.md"), "- verify\n");
  writeFileSync(join(root, ".gitignore"), "/evidence/\n");
  pf94Commit(root, "base");
  const prefix = `specs/${featureId}`, specPath = `${prefix}/spec.md`, manifestPath = `${prefix}/lifecycle.json`, unitPath = `${prefix}/design/critic-review-unit.json`;
  mkdirSync(join(root, prefix, "design"), { recursive: true }); mkdirSync(join(root, prefix, "evidence"), { recursive: true });
  writeFileSync(join(root, specPath), "# Complete behavior\nAC-1: deliver complete behavior\n");
  const unit = { schema: "pipeline.critic-review-unit.v1", kind: "feature-section", purpose: "Deliver one complete behavior", specPath, logicalWorkIds, criterionIds: ["AC-1"], deliveryBoundary: { mainRef: git(root, ["symbolic-ref", "HEAD"]) }, singletonRationale: null };
  writeFileSync(join(root, unitPath), JSON.stringify(unit));
  // The registration writer refuses a manifest that does not validate: the approved topology (closed keys, prd/acceptance/result/candidate-evidence) is part of the fixture.
  const topo = [["prd", "prd.md", true, "mutable", "active"], ["acceptance", "acceptance.md", false, "mutable", "active"], ["result", "result.md", false, "mutable", "active"], ["candidate-evidence", "evidence/seed.json", false, "immutable", "retain"]].map(([klass, rel, authority, mutability, retention]) => {
    const path = `${prefix}/${rel}`; writeFileSync(join(root, path), `${klass}\n`);
    return { class: klass, path, sha256: hash(readFileSync(join(root, path))), authority, mutability, retention };
  });
  const manifest = { schema: "pipeline.feature-package.v1", feature: { id: featureId, rigor: 2 }, state: "approved", candidate: null, supersedes: null, artifacts: [
    { class: "spec", path: specPath, sha256: hash(readFileSync(join(root, specPath))), authority: true, mutability: "mutable", retention: "active" },
    { class: "design", path: unitPath, sha256: hash(readFileSync(join(root, unitPath))), authority: false, mutability: "immutable", retention: "retain" }, ...topo] };
  writeFileSync(join(root, manifestPath), JSON.stringify(manifest));
  const base = pf94Commit(root, "declare feature review unit");
  writeFileSync(join(root, specPath), "# Complete behavior\nAC-1: deliver complete behavior\nImplemented behavior.\n");
  manifest.artifacts[0].sha256 = hash(readFileSync(join(root, specPath)));
  writeFileSync(join(root, manifestPath), JSON.stringify(manifest));
  for (const extra of extraCandidateFiles) { mkdirSync(dirname(join(root, extra)), { recursive: true }); writeFileSync(join(root, extra), `export const marker = 1;\n`); }
  const candidate = pf94Commit(root, "integrate feature behavior");
  const record = { schema: "pipeline.dispatch-record.v3", taskId, agentType: "default", model: "gpt-5.6-luna", effort: "medium", rulesetSha: "b7797309cf6abe175fd52b0a8749d82b43714ea0", dispatcher: "elephant", outcome: "completed", commits: [candidate], candidateCommit: candidate, resultSha256: "a".repeat(64), log: [{ phase: "implement", toolUseCount: 1 }], report: { text: "done", changedFiles: [specPath] }, criticRequired: { schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 2, riskClass: "high", riskFlag: true, diff: { mechanical: false, architecture: false, guardrails: true, security: false } }, appliedRow: "T1" } };
  mkdirSync(join(root, "evidence"), { recursive: true });
  writeFileSync(join(root, `evidence/dispatch-record-${taskId}.json`), JSON.stringify(record));
  const logPath = `${prefix}/evidence/targeted.log`, diagnosticPath = `${prefix}/evidence/diagnostic.json`, capturedPath = `evidence/${featureId}-targeted.log`;
  const diagnostic = produceCriticDiagnostic({ root, candidate, specPath, guardrailPaths: [".claude/pipeline.yaml", "governance/guidelines/review.md", "governance/policies/checklist.md"], command: [process.execPath, "-e", "process.exit(0)"], logPath: capturedPath });
  writeFileSync(join(root, logPath), readFileSync(join(root, capturedPath)));
  diagnostic.targeted.log.path = logPath;
  writeFileSync(join(root, diagnosticPath), JSON.stringify(diagnostic));
  for (const path of [logPath, diagnosticPath]) manifest.artifacts.push({ class: "candidate-evidence", path, sha256: hash(readFileSync(join(root, path))), authority: false, mutability: "immutable", retention: "retain" });
  writeFileSync(join(root, manifestPath), JSON.stringify(manifest));
  const registrationCommit = pf94Commit(root, "register captured feature diagnostics");
  const preflightInput = { root, base, candidate, specPath, guardrailPaths: course ? [] : pf94Guardrails, evidencePaths: [diagnosticPath], priorCriticEvidencePath: null };
  if (course) preflightInput.courseContext = { featureId, registrationCommit, acceptedReference: null, criterionLocator: null, deltaRequestPath: null };
  const packetId = "9a".repeat(16);
  const request = { preflightInput, taskId, projectId: "pipeline", sessionId: "feature-held-review", packetId, route: { routeId: "session-critic", runner: "codex", adapter: "session-functional-equivalent", provider: "openai", modelTier: "higher-capability", effortTier: "xhigh" }, verdict: failing ? { ...pf94Verdict, pass: false, findings: [{ gap: "behavior missing", risk: "consumer breaks", severity: "major", evidence: `${specPath}:1`, spec_ref: "AC-1" }] } : pf94Verdict };
  let preflightBeforeBatch = null;
  if (!course) {
    preflightBeforeBatch = preflightCriticDispatch({ ...preflightInput, courseContext: { featureId, registrationCommit, acceptedReference: null, criterionLocator: null, deltaRequestPath: null } });
    assert.equal(preflightBeforeBatch.status, "packet-ready", JSON.stringify(preflightBeforeBatch));
    // The pre-rule preflight carried no course admission (generic path); strip it so the finalizer takes the generic-batch branch.
    preflightBeforeBatch = { ...preflightBeforeBatch, coordinatorOnly: { ...preflightBeforeBatch.coordinatorOnly, courseAdmission: null } };
    const controlRoot = join(root, ".git", "agent-pipeline", "critic-packets");
    mkdirSync(controlRoot, { recursive: true, mode: 0o700 }); chmodSync(join(root, ".git", "agent-pipeline"), 0o700); chmodSync(controlRoot, 0o700);
    const reg = registerGenericCriticBatch({ repoRoot: root, controlRoot, declaration: { taskId, baseCommit: base, candidateCommit: candidate, logicalWorkIds, specPath, guardrailPaths: pf94Guardrails, signedQualityImportAnchor: null, reviewUnitPath: unitPath } });
    request.genericBatchRef = { ...reg.batchRef, memberSha256: reg.memberSha256 };
    request.allowCallerAuthoredFallback = true;
  }
  // Upgrade state: the round was admitted BEFORE the course rule existed, so its preflight ran with no generic batch registered. Today's preflight refuses a feature unit whose work ids a generic batch owns (CGB-CONFLICT), so the packet-ready result computed beforehand is replayed through the dependency seam.
  const deps = course ? { readOriginalSourceReturnFn: pf94Origin } : { readOriginalSourceReturnFn: pf94Origin, preflightCriticDispatchFn: () => preflightBeforeBatch };
  admitSessionCriticReview(request, course ? {} : { preflightCriticDispatchFn: deps.preflightCriticDispatchFn });
  const finalized = finalizeSessionCriticReview(request, deps);
  assert.equal(finalized.status, "completed");
  const courseRequest = { repoRoot: root, featureId, baseCommit: base, candidateCommit: candidate, registrationCommit, requestedMode: "full", acceptedReference: null, criterionLocator: null, deltaRequestPath: null };
  return { root, featureId, base, candidate, registrationCommit, packetId, manifestPath, courseRequest, decisionBefore: readCriticCourseAdmission(courseRequest).decision, deltaBefore: readCriticCourseAdmission({ ...courseRequest, requestedMode: "delta" }).decision };
}
const pf94Lineage = (fx) => addCriticReviewLineage({ root: fx.root, packetId: fx.packetId });
test("PF94 LINEAGE (a) the verb registers the lineage of a real consumed course round and the next admission asks for the delta request", () => {
  const fx = consumedCourseRoundFixture();
  console.log("PF94 fixture admission before:", JSON.stringify(fx.decisionBefore), JSON.stringify(fx.deltaBefore));
  assert.equal(fx.decisionBefore.code, "RE-FIRST-FULL");
  assert.equal(fx.deltaBefore.code, "CCA-REQUESTED-MODE");
  const added = pf94Lineage(fx);
  assert.equal(added.status, "lineage-added", JSON.stringify(added));
  assert.match(added.lineagePath, new RegExp(`^specs/${fx.featureId}/evidence/critic-lineage-[a-f0-9]{64}\\.json$`, "u"));
  assert.deepEqual(added.commitPaths, [fx.manifestPath, added.lineagePath]);
  const registration = pf94Commit(fx.root, "register the lineage");
  const after = readCriticCourseAdmission({ ...fx.courseRequest, registrationCommit: registration, requestedMode: "delta" });
  console.log("PF94 admission after:", JSON.stringify(after.decision));
  // The fixture round PASSED, so the registered history of length 1 ends the course (RE-CONSUMED-PACKAGE-PASS); a round with findings asks for the delta request (CCA-DELTA-REQUIRED). Either way the history is read and CCA-REQUESTED-MODE is gone.
  assert.notEqual(after.decision.code, "CCA-REQUESTED-MODE", JSON.stringify(after.decision));
  assert.equal(after.decision.code, "RE-CONSUMED-PACKAGE-PASS", JSON.stringify(after.decision));
});
test("PF97 LINEAGE (special file names) the real registration route of a consumed course round accepts special file names up to the registered lineage", () => {
  const specialPaths = ["src/app/(app)/(auth)/anmelden/page.tsx", "src/app/[slug]/page.tsx", "src/app/@modal/(.)photo/page.tsx", "routes/$id.tsx", "src/with space.ts", `src/m${String.fromCodePoint(252)}ller.ts`, "src/a+b=c,d~e.ts", "src/with:colon.ts"];
  let fx;
  assert.doesNotThrow(() => { fx = consumedCourseRoundFixture({ extraCandidateFiles: specialPaths }); }, "step fixture: preflight, admission and finalize accept the special paths");
  const added = pf94Lineage(fx);
  assert.equal(added.status, "lineage-added", `step addCriticReviewLineage: ${JSON.stringify(added)}`);
  const lineage = JSON.parse(readFileSync(join(fx.root, added.lineagePath), "utf8"));
  const expected = execFileSync("git", ["diff", "--name-only", "-z", fx.base, fx.candidate], { cwd: fx.root, encoding: "utf8" }).split("\0").filter(Boolean);
  for (const p of specialPaths) assert.ok(expected.includes(p), `step expected range paths hold ${p}`);
  assert.deepEqual(lineage.diff.changedPaths, expected, "step registered lineage diff paths equal the sorted candidate paths, unquoted");
  pf94Commit(fx.root, "register the lineage");
  const registration = git(fx.root, ["rev-parse", "HEAD"]);
  const after = readCriticCourseAdmission({ ...fx.courseRequest, registrationCommit: registration, requestedMode: "delta" });
  assert.notEqual(after.decision.code, "CCA-REQUESTED-MODE", `step next delta admission: ${JSON.stringify(after.decision)}`);
  assert.doesNotMatch(JSON.stringify(after.decision), /path/iu, `step next delta admission refuses no path: ${JSON.stringify(after.decision)}`);
});
test("PF94 LINEAGE (b) replay is idempotent and names the same path", () => {
  const fx = consumedCourseRoundFixture();
  const first = pf94Lineage(fx);
  const again = pf94Lineage(fx);
  assert.equal(again.status, "already-registered", JSON.stringify(again));
  assert.equal(again.lineagePath, first.lineagePath);
  pf94Commit(fx.root, "register the lineage");
  const third = pf94Lineage(fx);
  assert.equal(third.status, "already-registered", JSON.stringify(third));
  assert.equal(third.lineagePath, first.lineagePath);
});
test("PF94 LINEAGE (c) an unconsumed packet is refused FPR-LINEAGE-NOT-CONSUMED and nothing is written", () => {
  const fx = consumedCourseRoundFixture();
  const before = readFileSync(join(fx.root, fx.manifestPath));
  const actual = addCriticReviewLineage({ root: fx.root, packetId: "ab".repeat(16) });
  assert.equal(actual.code, "FPR-LINEAGE-NOT-CONSUMED", JSON.stringify(actual));
  assert.deepEqual(readFileSync(join(fx.root, fx.manifestPath)), before);
});
test("PF94 LINEAGE (d) upgrade state: a round finalized outside the course (caller-authored fallback, no claim) is refused with the takeover repair", () => {
  const fx = consumedCourseRoundFixture({ course: false });
  const before = readFileSync(join(fx.root, fx.manifestPath));
  const actual = pf94Lineage(fx);
  assert.equal(actual.code, "FPR-LINEAGE-NO-COURSE-CLAIM", JSON.stringify(actual));
  for (const word of ["inspect-course-takeover", "supersede-course-takeover", "round 1"]) assert.ok(actual.reason.includes(word), actual.reason);
  assert.deepEqual(readFileSync(join(fx.root, fx.manifestPath)), before);
});
test("PF94 LINEAGE (g) a failing round with an open finding: after the lineage is registered the delta admission asks for the delta request", () => {
  const fx = consumedCourseRoundFixture({ failing: true });
  const added = pf94Lineage(fx);
  assert.equal(added.status, "lineage-added", JSON.stringify(added));
  const registration = pf94Commit(fx.root, "register the lineage");
  mkdirSync(join(fx.root, "src"), { recursive: true }); writeFileSync(join(fx.root, "src/fix.mjs"), "export const fixed = 1;\n");
  const correction = pf94Commit(fx.root, "correction after the failing round");
  // The deterministic gate needs registered diagnostic evidence bound to the CORRECTION candidate: produced and registered the way the fixture registers its round's diagnostic.
  const specPath = `specs/${fx.featureId}/spec.md`, logPath = `specs/${fx.featureId}/evidence/targeted-correction.log`, diagnosticPath = `specs/${fx.featureId}/evidence/diagnostic-correction.json`, capturedPath = `evidence/${fx.featureId}-targeted-correction.log`;
  const diagnostic = produceCriticDiagnostic({ root: fx.root, candidate: correction, specPath, guardrailPaths: pf94Guardrails, command: [process.execPath, "-e", "process.exit(0)"], logPath: capturedPath });
  writeFileSync(join(fx.root, logPath), readFileSync(join(fx.root, capturedPath)));
  diagnostic.targeted.log.path = logPath;
  writeFileSync(join(fx.root, diagnosticPath), JSON.stringify(diagnostic));
  const manifest = JSON.parse(readFileSync(join(fx.root, fx.manifestPath), "utf8"));
  for (const path of [logPath, diagnosticPath]) manifest.artifacts.push({ class: "candidate-evidence", path, sha256: hash(readFileSync(join(fx.root, path))), authority: false, mutability: "immutable", retention: "retain" });
  writeFileSync(join(fx.root, fx.manifestPath), JSON.stringify(manifest));
  const evidenceRegistration = pf94Commit(fx.root, "register the correction diagnostic");
  const after = readCriticCourseAdmission({ ...fx.courseRequest, baseCommit: fx.candidate, candidateCommit: correction, registrationCommit: evidenceRegistration, requestedMode: "delta" });
  console.log("PF94 (g) registration:", registration, "admission after:", JSON.stringify(after.decision));
  assert.equal(after.decision.code, "CCA-DELTA-REQUIRED", JSON.stringify(after.decision));
  const record = JSON.parse(readFileSync(join(fx.root, added.lineagePath), "utf8"));
  console.log("PF94 (g) record findings:", JSON.stringify(record.findings), JSON.stringify(record.verdict));
  assert.ok(record.findings.some((f) => f.status === "open"), JSON.stringify(record.findings));
});
test("PF94 LINEAGE (h) the receipt carries no coverage fields, only the reviewed range: the written coverage is bound to that receipt and range, and a failing round is still a complete review of the diff", () => {
  const fx = consumedCourseRoundFixture({ failing: true });
  const consumed = readConsumedCandidateResult({ controlRoot: join(fx.root, ".git", "agent-pipeline", "critic-packets"), packetId: fx.packetId });
  assert.deepEqual(Object.keys(consumed.receipt).filter((k) => /coverage|package|edge|complete/iu.test(k)), []);
  assert.deepEqual(consumed.receipt.reviewRange, { base: consumed.packet.candidate.base, commit: consumed.packet.candidate.commit, diffSha256: consumed.packet.diff.sha256 });
  assert.equal(consumed.receipt.reviewPass, false);
  const added = pf94Lineage(fx);
  assert.equal(added.status, "lineage-added", JSON.stringify(added));
  const record = JSON.parse(readFileSync(join(fx.root, added.lineagePath), "utf8"));
  assert.equal(record.coverage.receiptSha256, record.consumedResult.receiptSha256);
  assert.deepEqual(record.coverage.changedPaths, consumed.packet.diffPaths);
  assert.deepEqual(record.coverage.acceptanceIds, ["AC-1"]);
  assert.equal(record.verdict.status, "findings");
});
test("PF94 LINEAGE (e) HEAD behind a correction commit is refused FPR-LINEAGE-TRANSPORT and says to register before the next correction", () => {
  const fx = consumedCourseRoundFixture();
  mkdirSync(join(fx.root, "src"), { recursive: true }); writeFileSync(join(fx.root, "src/fix.mjs"), "export const fixed = 1;\n");
  pf94Commit(fx.root, "correction after the round");
  const actual = pf94Lineage(fx);
  assert.equal(actual.code, "FPR-LINEAGE-TRANSPORT", JSON.stringify(actual));
  assert.ok(actual.reason.includes("before the next correction commit"), actual.reason);
});
test("PF94 LINEAGE (f) the CLI accepts exactly the lineage shape", () => {
  const lines = [];
  for (const argv of [["--root", "/nonexistent-root", "--add-review-lineage"], ["--root", "/nonexistent-root", "--add-review-lineage", "--packet"], ["--root", "/nonexistent-root", "--add-review-lineage", "--packet", "--force"], ["--root", "/nonexistent-root", "--add-review-lineage", "--packet", "xyz"]]) {
    assert.equal(runRegisterFeaturePackage(argv, (text) => lines.push(text)), 2, argv.join(" "));
  }
  for (const line of lines) assert.equal(JSON.parse(line).code, "FPR-ARGS", line);
});
// PF94 DELTA: the verb --add-delta-request builds, writes and registers the canonical delta request of the next round. The namespace import keeps a missing export a per-case failure.
import * as pf94Fpr from "./feature-package-registration.mjs";
const pf94DeltaInput = () => ({ changedBehaviorClaims: ["fix-one"], pathInvariantMap: { "src/fix.mjs": ["inv-one"] }, coordinatorImpactConfirmed: true, trustBoundaryChanged: false, impactAmbiguous: false });
const pf94CommitPaths = (root, paths, message) => { git(root, ["add", "--", ...paths]); git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", message]); return git(root, ["rev-parse", "HEAD"]); };
// Default input works the way an operator does: call the verb once with a placeholder map, read the derived changed paths from the refusal, write one entry per printed path.
const pf94WriteInput = (fx, value) => {
  if (value === undefined) {
    writeFileSync(join(fx.root, "delta-input.json"), JSON.stringify({ ...pf94DeltaInput(), pathInvariantMap: { "placeholder.mjs": ["inv-one"] } }));
    const first = pf94Fpr.addCriticDeltaRequest({ root: fx.root, inputPath: "delta-input.json" });
    assert.equal(first.code, "FPR-DELTA-MAP", JSON.stringify(first));
    value = { ...pf94DeltaInput(), pathInvariantMap: Object.fromEntries(first.changedPaths.map((path) => [path, ["inv-one"]])) };
  }
  writeFileSync(join(fx.root, "delta-input.json"), typeof value === "string" ? value : JSON.stringify(value)); return "delta-input.json";
};
const pf94Delta = (fx, inputPath = "delta-input.json") => pf94Fpr.addCriticDeltaRequest({ root: fx.root, inputPath });
/** Failing round, lineage registered and committed, a correction commit; with diagnostic=true the correction diagnostic is produced and registered the way PF94 LINEAGE (g) does. */
function pf94DeltaFixture({ lineage = true, correction = true, diagnostic = true } = {}) {
  const fx = consumedCourseRoundFixture({ failing: true });
  let lineageAdded = null;
  if (lineage) { lineageAdded = pf94Lineage(fx); assert.equal(lineageAdded.status, "lineage-added", JSON.stringify(lineageAdded)); pf94CommitPaths(fx.root, lineageAdded.commitPaths, "register the lineage"); }
  let correctionCommit = null, evidenceRegistration = null;
  if (correction) { mkdirSync(join(fx.root, "src"), { recursive: true }); writeFileSync(join(fx.root, "src/fix.mjs"), "export const fixed = 1;\n"); correctionCommit = pf94Commit(fx.root, "correction after the failing round"); }
  if (correction && diagnostic) {
    const specPath = `specs/${fx.featureId}/spec.md`, logPath = `specs/${fx.featureId}/evidence/targeted-correction.log`, diagnosticPath = `specs/${fx.featureId}/evidence/diagnostic-correction.json`, capturedPath = `evidence/${fx.featureId}-targeted-correction.log`;
    const produced = produceCriticDiagnostic({ root: fx.root, candidate: correctionCommit, specPath, guardrailPaths: pf94Guardrails, command: [process.execPath, "-e", "process.exit(0)"], logPath: capturedPath });
    writeFileSync(join(fx.root, logPath), readFileSync(join(fx.root, capturedPath)));
    produced.targeted.log.path = logPath;
    writeFileSync(join(fx.root, diagnosticPath), JSON.stringify(produced));
    const manifest = JSON.parse(readFileSync(join(fx.root, fx.manifestPath), "utf8"));
    for (const path of [logPath, diagnosticPath]) manifest.artifacts.push({ class: "candidate-evidence", path, sha256: hash(readFileSync(join(fx.root, path))), authority: false, mutability: "immutable", retention: "retain" });
    writeFileSync(join(fx.root, fx.manifestPath), JSON.stringify(manifest));
    evidenceRegistration = pf94CommitPaths(fx.root, [fx.manifestPath, logPath, diagnosticPath], "register the correction diagnostic");
  }
  return { ...fx, lineageAdded, correctionCommit, evidenceRegistration };
}
test("PF94 DELTA (a) after the lineage, the correction and its diagnostic, the verb registers the delta request and the course admission in mode delta ends in an admitted delta", () => {
  const fx = pf94DeltaFixture();
  pf94WriteInput(fx);
  const added = pf94Delta(fx);
  assert.equal(added.status, "delta-request-added", JSON.stringify(added));
  assert.match(added.deltaRequestPath, new RegExp(`^specs/${fx.featureId}/evidence/critic-delta-request-[a-f0-9]{64}\\.json$`, "u"));
  assert.deepEqual(added.commitPaths, [fx.manifestPath, added.deltaRequestPath]);
  assert.equal(added.preflight.candidateCommit, fx.correctionCommit);
  assert.equal(added.preflight.baseCommit, fx.candidate);
  const registration = pf94CommitPaths(fx.root, added.commitPaths, "register the delta request");
  const after = readCriticCourseAdmission({ ...fx.courseRequest, baseCommit: fx.candidate, candidateCommit: fx.correctionCommit, registrationCommit: registration, requestedMode: "delta", deltaRequestPath: added.deltaRequestPath });
  console.log("PF94 DELTA (a) admission:", JSON.stringify(after.decision));
  assert.equal(after.decision.status, "admitted", JSON.stringify(after.decision));
  assert.equal(after.decision.mode, "delta");
  assert.equal(after.decision.code, "RE-DELTA-ADMITTED");
  assert.deepEqual(after.decision.affectedInvariantIds, ["inv-one"]);
});
test("PF94 ROUND2 (a) the real route continues after the admitted delta: round 2 is preflighted, admitted on the course path, finalized and registered as lineage round 2", () => {
  const fx = pf94DeltaFixture();
  const round1Lineage = JSON.parse(readFileSync(join(fx.root, fx.lineageAdded.lineagePath), "utf8"));
  pf94WriteInput(fx);
  const delta = pf94Delta(fx);
  assert.equal(delta.status, "delta-request-added", `step delta request: ${JSON.stringify(delta)}`);
  const registration = pf94CommitPaths(fx.root, delta.commitPaths, "register the delta request");
  const specPath = `specs/${fx.featureId}/spec.md`, diagnosticPath = `specs/${fx.featureId}/evidence/diagnostic-correction.json`;
  const taskId = "feature-held-task-round2", packetId = "9b".repeat(16);
  const record = { schema: "pipeline.dispatch-record.v3", taskId, agentType: "default", model: "gpt-5.6-luna", effort: "medium", rulesetSha: "b7797309cf6abe175fd52b0a8749d82b43714ea0", dispatcher: "elephant", outcome: "completed", commits: [fx.correctionCommit], candidateCommit: fx.correctionCommit, resultSha256: "a".repeat(64), log: [{ phase: "implement", toolUseCount: 1 }], report: { text: "done", changedFiles: ["src/fix.mjs"] }, criticRequired: { schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 2, riskClass: "high", riskFlag: true, diff: { mechanical: false, architecture: false, guardrails: true, security: false } }, appliedRow: "T1" } };
  writeFileSync(join(fx.root, `evidence/dispatch-record-${taskId}.json`), JSON.stringify(record));
  const preflightInput = { root: fx.root, base: fx.candidate, candidate: fx.correctionCommit, specPath, guardrailPaths: [], evidencePaths: [diagnosticPath], priorCriticEvidencePath: null, courseContext: { featureId: fx.featureId, registrationCommit: registration, acceptedReference: null, criterionLocator: null, deltaRequestPath: delta.deltaRequestPath }, correctionInputBindings: pf94Bindings(fx.root, fx.candidate, fx.correctionCommit) };
  const preflight = preflightCriticDispatch(preflightInput);
  assert.equal(preflight.status, "packet-ready", `step round 2 preflight is ready: ${JSON.stringify(preflight)}`);
  // The preflight exposes no mode field: delta mode is selected by the registered delta request path (preflight derives requestedMode from it) and the course admission carries the round counter.
  assert.equal(preflightInput.courseContext.deltaRequestPath, delta.deltaRequestPath, "step round 2 preflight is called in delta mode with the registered delta request path");
  assert.equal(preflight.coordinatorOnly.courseAdmission.round, 2, `step round 2 preflight carries course round 2: ${JSON.stringify(preflight.coordinatorOnly.courseAdmission)}`);
  const request = { preflightInput, taskId, projectId: "pipeline", sessionId: "feature-held-review-2", packetId, route: { routeId: "session-critic", runner: "codex", adapter: "session-functional-equivalent", provider: "openai", modelTier: "higher-capability", effortTier: "xhigh" }, verdict: pf94Verdict };
  let admitted;
  assert.doesNotThrow(() => { admitted = admitSessionCriticReview(request, {}); }, "step round 2 course admit (writes the claim) does not refuse");
  let finalized;
  assert.doesNotThrow(() => { finalized = finalizeSessionCriticReview(request, { readOriginalSourceReturnFn: pf94Origin }); }, "step round 2 finalize does not refuse");
  assert.equal(finalized.status, "completed", `step round 2 finalize completes: ${JSON.stringify(finalized)}`);
  const lineageAdded = addCriticReviewLineage({ root: fx.root, packetId });
  assert.equal(lineageAdded.status, "lineage-added", `step addCriticReviewLineage of round 2: ${JSON.stringify(lineageAdded)}`);
  const lineage = JSON.parse(readFileSync(join(fx.root, lineageAdded.lineagePath), "utf8"));
  assert.equal(lineage.course.reviewRound, 2, "step lineage record is round 2");
  assert.equal(lineage.parentReviewId, round1Lineage.reviewId, "step lineage parent is the review id of round 1");
  assert.notEqual(lineage.correction, null, "step lineage correction block is non-null");
  assert.equal(lineage.candidate.commit, fx.correctionCommit, "step lineage candidate is the round 2 candidate");
  const manifest = JSON.parse(readFileSync(join(fx.root, fx.manifestPath), "utf8"));
  assert.ok(manifest.artifacts.some((a) => a.path === lineageAdded.lineagePath), "step round 2 lineage file is in the manifest");
  const registration2 = pf94CommitPaths(fx.root, lineageAdded.commitPaths, "register the lineage of round 2");
  const next = readCriticCourseAdmission({ ...fx.courseRequest, baseCommit: fx.candidate, candidateCommit: fx.correctionCommit, registrationCommit: registration2, requestedMode: "delta", deltaRequestPath: delta.deltaRequestPath });
  assert.equal(next.decision.code, "RE-CONSUMED-PACKAGE-PASS", `step next admission decision: ${JSON.stringify(next.decision)}`);
});
test("PF94 ROUND2 (b) the lineage of round 2 without a registered delta request for its candidate is refused and registers nothing", () => {
  const fx = pf94DeltaFixture();
  pf94WriteInput(fx);
  const delta = pf94Delta(fx);
  assert.equal(delta.status, "delta-request-added", `step delta request: ${JSON.stringify(delta)}`);
  const registration = pf94CommitPaths(fx.root, delta.commitPaths, "register the delta request");
  const specPath = `specs/${fx.featureId}/spec.md`, diagnosticPath = `specs/${fx.featureId}/evidence/diagnostic-correction.json`;
  const taskId = "feature-held-task-round2b", packetId = "9c".repeat(16);
  const record = { schema: "pipeline.dispatch-record.v3", taskId, agentType: "default", model: "gpt-5.6-luna", effort: "medium", rulesetSha: "b7797309cf6abe175fd52b0a8749d82b43714ea0", dispatcher: "elephant", outcome: "completed", commits: [fx.correctionCommit], candidateCommit: fx.correctionCommit, resultSha256: "a".repeat(64), log: [{ phase: "implement", toolUseCount: 1 }], report: { text: "done", changedFiles: ["src/fix.mjs"] }, criticRequired: { schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 2, riskClass: "high", riskFlag: true, diff: { mechanical: false, architecture: false, guardrails: true, security: false } }, appliedRow: "T1" } };
  writeFileSync(join(fx.root, `evidence/dispatch-record-${taskId}.json`), JSON.stringify(record));
  const preflightInput = { root: fx.root, base: fx.candidate, candidate: fx.correctionCommit, specPath, guardrailPaths: [], evidencePaths: [diagnosticPath], priorCriticEvidencePath: null, courseContext: { featureId: fx.featureId, registrationCommit: registration, acceptedReference: null, criterionLocator: null, deltaRequestPath: delta.deltaRequestPath }, correctionInputBindings: pf94Bindings(fx.root, fx.candidate, fx.correctionCommit) };
  const request = { preflightInput, taskId, projectId: "pipeline", sessionId: "feature-held-review-2b", packetId, route: { routeId: "session-critic", runner: "codex", adapter: "session-functional-equivalent", provider: "openai", modelTier: "higher-capability", effortTier: "xhigh" }, verdict: pf94Verdict };
  admitSessionCriticReview(request, {});
  const finalized = finalizeSessionCriticReview(request, { readOriginalSourceReturnFn: pf94Origin });
  assert.equal(finalized.status, "completed", `step round 2 finalize completes: ${JSON.stringify(finalized)}`);
  // The delta request leaves the manifest (working tree only): the lineage must not guess one.
  const manifest = JSON.parse(readFileSync(join(fx.root, fx.manifestPath), "utf8"));
  manifest.artifacts = manifest.artifacts.filter((a) => a.path !== delta.deltaRequestPath);
  writeFileSync(join(fx.root, fx.manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
  const before = readFileSync(join(fx.root, fx.manifestPath));
  const lineageFilesBefore = readdirSync(join(fx.root, "specs", fx.featureId, "evidence")).filter((n) => n.startsWith("critic-lineage-")).sort();
  const refused = addCriticReviewLineage({ root: fx.root, packetId });
  assert.equal(refused.status, "refused", JSON.stringify(refused));
  assert.equal(refused.code, "FPR-LINEAGE-COMPILE", JSON.stringify(refused));
  assert.equal(refused.compileCode, "CCA-DELTA-REQUIRED", JSON.stringify(refused));
  assert.ok(readFileSync(join(fx.root, fx.manifestPath)).equals(before), "step manifest is byte-identical");
  assert.deepEqual(readdirSync(join(fx.root, "specs", fx.featureId, "evidence")).filter((n) => n.startsWith("critic-lineage-")).sort(), lineageFilesBefore, "step no round 2 lineage file was written");
});
test("PF94 DELTA (b) replay is idempotent, before and after the operator commit", () => {
  const fx = pf94DeltaFixture();
  pf94WriteInput(fx);
  const first = pf94Delta(fx);
  assert.equal(first.status, "delta-request-added", JSON.stringify(first));
  const again = pf94Delta(fx);
  assert.equal(again.status, "already-registered", JSON.stringify(again));
  assert.equal(again.deltaRequestPath, first.deltaRequestPath);
  pf94CommitPaths(fx.root, first.commitPaths, "register the delta request");
  const third = pf94Delta(fx);
  assert.equal(third.status, "already-registered", JSON.stringify(third));
  assert.equal(third.deltaRequestPath, first.deltaRequestPath);
});
test("PF94 DELTA (c) a pathInvariantMap whose keys differ from the changed paths is refused, prints the derived changed paths and writes nothing", () => {
  const fx = pf94DeltaFixture();
  pf94WriteInput(fx, { ...pf94DeltaInput(), pathInvariantMap: { "other/file.mjs": ["inv-one"] } });
  const before = readFileSync(join(fx.root, fx.manifestPath));
  const actual = pf94Delta(fx);
  assert.equal(actual.code, "FPR-DELTA-MAP", JSON.stringify(actual));
  console.log("PF94 DELTA (c) refusal:", JSON.stringify(actual));
  const courseChanged = git(fx.root, ["diff", "--name-only", fx.candidate, fx.correctionCommit]).split("\n").filter(Boolean).sort();
  assert.ok(courseChanged.length > 1 && courseChanged.includes("src/fix.mjs"), JSON.stringify(courseChanged));
  assert.deepEqual([...actual.changedPaths].sort(), courseChanged);
  for (const path of courseChanged) assert.ok(actual.reason.includes(path), actual.reason);
  assert.deepEqual(readFileSync(join(fx.root, fx.manifestPath)), before);
});
test("PF94 DELTA (d) a missing, an extra and a mistyped input key are refused FPR-DELTA-INPUT-SHAPE with the expected shape", () => {
  const fx = pf94DeltaFixture();
  const { impactAmbiguous: _omitted, ...missing } = pf94DeltaInput();
  for (const value of [missing, { ...pf94DeltaInput(), surprise: 1 }, { ...pf94DeltaInput(), trustBoundaryChanged: "no" }, "not json"]) {
    pf94WriteInput(fx, value);
    const actual = pf94Delta(fx);
    assert.equal(actual.code, "FPR-DELTA-INPUT-SHAPE", JSON.stringify(actual));
    assert.ok(actual.reason.includes("pathInvariantMap") && actual.reason.includes("changedBehaviorClaims"), actual.reason);
  }
  const absent = pf94Delta(fx, "no-such-input.json");
  assert.equal(absent.code, "FPR-DELTA-INPUT-PATH", JSON.stringify(absent));
});
test("PF94 DELTA (e) no registered lineage yet is refused and names the lineage verb", () => {
  const fx = pf94DeltaFixture({ lineage: false });
  pf94WriteInput(fx, pf94DeltaInput());
  const actual = pf94Delta(fx);
  assert.equal(actual.code, "FPR-DELTA-NO-LINEAGE", JSON.stringify(actual));
  assert.ok(actual.reason.includes("--add-review-lineage"), actual.reason);
});
test("PF94 DELTA (f) no correction commit since the last round is refused", () => {
  const fx = pf94DeltaFixture({ correction: false });
  pf94WriteInput(fx, pf94DeltaInput());
  const actual = pf94Delta(fx);
  assert.equal(actual.code, "FPR-DELTA-NO-CORRECTION", JSON.stringify(actual));
});
test("PF94 DELTA (g) no registered diagnostic evidence for the candidate is refused and names the produce and register commands", () => {
  const fx = pf94DeltaFixture({ diagnostic: false });
  pf94WriteInput(fx, pf94DeltaInput());
  const before = readFileSync(join(fx.root, fx.manifestPath));
  const actual = pf94Delta(fx);
  assert.equal(actual.code, "FPR-DELTA-NO-DIAGNOSTIC", JSON.stringify(actual));
  for (const word of ["critic-diagnostic-evidence", "--add-diagnostic-evidence"]) assert.ok(actual.reason.includes(word), actual.reason);
  assert.deepEqual(readFileSync(join(fx.root, fx.manifestPath)), before);
});
test("PF94 DELTA (h) the CLI accepts exactly the delta shape", () => {
  const lines = [];
  for (const argv of [["--root", "/nonexistent-root", "--add-delta-request"], ["--root", "/nonexistent-root", "--add-delta-request", "--force"], ["--root", "/nonexistent-root", "--add-delta-request", "a.json", "b.json"], ["--root", "/nonexistent-root", "--add-delta-request", ""]]) {
    assert.equal(runRegisterFeaturePackage(argv, (text) => lines.push(text)), 2, argv.join(" "));
  }
  for (const line of lines) assert.equal(JSON.parse(line).code, "FPR-ARGS", line);
  // The exact shape passes the argument check: with a real root and no authority State it reaches the State check instead.
  const bare = mkdtempSync(join(tmpdir(), "pf94-delta-cli-")), seen = [];
  assert.equal(runRegisterFeaturePackage(["--root", bare, "--add-delta-request", "delta-input.json"], (text) => seen.push(text)), 2);
  assert.equal(JSON.parse(seen[0]).code, "FPR-NO-APPROVED-PLAN", seen[0]);
});
// PF-94 operator documentation pins (text only; each pin reads the text an operator sees).
const pf94Read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
test("PF94 DOCS (a) the register-feature-package help lists every flag, the delta request route and the late lineage block", () => {
  const lines = [];
  assert.equal(runRegisterFeaturePackage(["--help"], (text) => lines.push(text)), 0);
  const help = lines.join("");
  const usage = help.split("\n")[0];
  for (const flag of ["--add-review-unit", "--add-diagnostic-evidence <path>", "--add-review-lineage --packet <packetId>", "--add-delta-request <input.json>"]) assert.ok(usage.includes(flag), `usage line names ${flag}`);
  assert.ok(help.includes("Critic delta request route (PF-94)"));
  for (const key of ["changedBehaviorClaims", "pathInvariantMap", "coordinatorImpactConfirmed", "trustBoundaryChanged", "impactAmbiguous"]) assert.ok(help.includes(key), `help names input key ${key}`);
  assert.ok(help.includes("pathInvariantMap must have exactly the changed paths"));
  assert.ok(help.includes("--add-delta-request <input.json>") && help.includes("critic-dispatch-preflight"));
  assert.ok(help.includes("Late lineage") && help.includes("CCA-TRANSPORT-SOURCE-DRIFT"));
  assert.ok(help.includes("inspect-course-takeover") && help.includes("supersede-course-takeover"));
});
test("PF94 DOCS (b) the lineage refusals name the late-lineage repair and keep their old text", () => {
  const source = pf94Read("./feature-package-registration.mjs");
  const sentence = "if correction commits already follow this round the lineage cannot be registered any more; retire the old batch with session-critic-finalizer inspect-course-takeover and supersede-course-takeover and rerun round 1 on the course path";
  assert.equal(source.split(sentence).length - 1, 2, "both FPR-LINEAGE-TRANSPORT/COMPILE reason texts carry the sentence");
  assert.ok(source.includes("so the lineage of round N must be registered BEFORE the next correction commit"));
  assert.ok(source.includes("the lineage of round N must be registered before the next correction commit"));
});
test("PF94 DOCS (c) SCF-TAKEOVER-REQUEST names the expected request shape and the finalizer help lists the takeover verbs", () => {
  const source = pf94Read("../scripts/session-critic-finalizer.mjs");
  assert.ok(source.includes("expected request"), "repair text names the expected request");
  assert.ok(source.includes("regular .json file"), "repair text names the file requirement");
  const help = execFileSync(process.execPath, [new URL("../scripts/session-critic-finalizer.mjs", import.meta.url).pathname, "--help"], { encoding: "utf8" });
  assert.ok(help.includes("inspect-course-takeover --root <repository-root> --request"));
  assert.ok(help.includes("supersede-course-takeover --root <repository-root> --request"));
});
test("PF94 DOCS (d) the Critic skill documents continuing a course and the continuation reference points to it", () => {
  const skill = pf94Read("../skills/critic-review/SKILL.md");
  const heading = "## Continuing a Critic course after the first round (PF-94)";
  const start = skill.indexOf(heading);
  assert.ok(start >= 0, "section heading");
  const rest = skill.slice(start + heading.length);
  const next = rest.search(/\n## /u);
  const section = heading + (next < 0 ? rest : rest.slice(0, next));
  assert.ok(section.split("\n").length <= 46, "section stays within 45 lines plus heading");
  for (const needle of ["inspect-course-takeover", "supersede-course-takeover", "--add-review-lineage --packet", "--add-diagnostic-evidence", "--add-delta-request", "CGB-CONFLICT", "CGB-TAKEOVER-COURSE", "CGB-TAKEOVER-HISTORY", "CGB-TAKEOVER-OPEN", "FPR-LINEAGE-TRANSPORT", "CCA-TRANSPORT-SOURCE-DRIFT", "CCA-DELTA-REQUIRED", "CCA-REQUESTED-MODE"]) assert.ok(section.includes(needle), `skill section names ${needle}`);
  const cont = pf94Read("../skills/pipeline-start/references/implementation-continuation.md");
  assert.ok(cont.includes("Continuing a Critic course after the first round (PF-94)"));
});
registerTestCaseCompletion({cases: completionCases, fd: 3, maxBytes: 16384});
