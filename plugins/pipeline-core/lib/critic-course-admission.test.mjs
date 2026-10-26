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
import { join } from "node:path";
import { compileCriticReviewLineage } from "./critic-review-lineage.mjs";
import { readCriticCourseAdmission, criticCourseRepair, resolveRegisteredCriticCourseIdentity, classifyRegisteredEvidenceOnlyCommits, deriveCriticCourseAdmission, deriveRegisteredCriticCourseDecision, deriveRegisteredCriticCourseSource, resolveRegisteredCriticCourseHistory, CriticCourseAdmissionError } from "./critic-course-admission.mjs";
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
registerTestCaseCompletion({cases: completionCases, fd: 3, maxBytes: 16384});
