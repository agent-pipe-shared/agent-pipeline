// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { inspectConsumedCriticEvidenceCarryForward, recordCriticVerifyLifecycle, readCriticVerifyLifecycle, residualFindingId } from "./critic-verify-lifecycle.mjs";
import { inspectCriticBoundVerify } from "./critic-verify-readiness.mjs";
import { canonicalJson, sha256 } from "../scripts/critic-packet-preflight.mjs";
import { checkCurrentCriticBoundVerify } from "../scripts/check-critic-bound-verify.mjs";

const oid = char => char.repeat(40);
const sha = char => char.repeat(64);
const candidate = { commit: oid("a"), tree: oid("b") };
const evidence = { schema: "pipeline.verify-evidence.v0", exitCode: 0, candidate: { ...candidate }, verifyRun: { terminalSha256: sha("c") } };
function critic(overrides = {}) {
  return {
    schema: "pipeline.session-critic-receipt.v1", packetId: "d".repeat(32), packetDigest: sha("e"),
    session: { id: "review-1", freshContext: true, historyInherited: false, mayDelegate: false },
    candidate: { base: oid("f"), ...candidate }, reviewRange: { base: oid("f"), commit: candidate.commit, diffSha256: sha("1") },
    rulesetSha: oid("2"), assurance: "functional-equivalent-read-only; OS isolation not asserted", verdictSha256: sha("3"), findingCount: 0, reviewPass: true,
    ...overrides,
  };
}
function consumed(receipt) {
  const packet = {
    packetId: receipt.packetId,
    candidate: { ...receipt.candidate },
    diff: { base: receipt.reviewRange.base, commit: receipt.reviewRange.commit, sha256: receipt.reviewRange.diffSha256 },
  };
  receipt.packetDigest = sha256(canonicalJson(packet));
  return { packet, receipt };
}
function fixture(t) {
  const common = mkdtempSync(join(tmpdir(), "critic-verify-lifecycle-"));
  t.after(() => rmSync(common, { recursive: true, force: true }));
  return common;
}
test("records a consumed passing Critic receipt and rebinds exact Verify bytes", t => {
  const common = fixture(t);
  const source = critic();
  const deps = { readConsumedCandidateReceiptFn: () => consumed(source) };
  const recorded = recordCriticVerifyLifecycle({ gitCommonDir: common, criticPacketId: source.packetId, candidate, evidencePath: "evidence/verify.json", evidence }, {
    readConsumedCandidateReceiptFn: () => consumed(source),
  });
  const read = readCriticVerifyLifecycle({ gitCommonDir: common, id: recorded.receipt.id, candidate, evidencePath: "evidence/verify.json", evidence }, deps);
  assert.equal(read.receiptSha256, recorded.receiptSha256);
  assert.equal(read.receipt.critic.packetId, source.packetId);
});
test("refuses failed, stale, or forged Critic/Verify bindings", t => {
  const common = fixture(t);
  const failed = critic({ reviewPass: false, findingCount: 1 });
  assert.throws(() => recordCriticVerifyLifecycle({ gitCommonDir: common, criticPacketId: failed.packetId, candidate, evidencePath: "evidence/verify.json", evidence }, {
    readConsumedCandidateReceiptFn: () => consumed(failed),
  }), error => error.code === "CVL-CRITIC-FAILED");
  const stale = critic({ candidate: { base: oid("f"), commit: oid("4"), tree: candidate.tree }, reviewRange: { base: oid("f"), commit: oid("4"), diffSha256: sha("1") } });
  assert.throws(() => recordCriticVerifyLifecycle({ gitCommonDir: common, criticPacketId: stale.packetId, candidate, evidencePath: "evidence/verify.json", evidence }, {
    readConsumedCandidateReceiptFn: () => consumed(stale),
  }), error => error.code === "CVL-CRITIC-STALE");
  const source = critic();
  const recorded = recordCriticVerifyLifecycle({ gitCommonDir: common, criticPacketId: source.packetId, candidate, evidencePath: "evidence/verify.json", evidence }, {
    readConsumedCandidateReceiptFn: () => consumed(source),
  });
  assert.throws(() => readCriticVerifyLifecycle({ gitCommonDir: common, id: recorded.receipt.id, candidate, evidencePath: "evidence/verify.json", evidence: { ...evidence, startedAt: "forged" } }, {
    readConsumedCandidateReceiptFn: () => consumed(source),
  }), error => error.code === "CVL-VERIFY-DRIFT");
});
// Residual-finding acceptance (D190): a failed receipt qualifies only through a recorded PO acceptance
// that lists exactly the open findings, every one of lowest severity (minor).
const finding = (gap, severity) => ({ gap, risk: "r", severity, evidence: "e", spec_ref: "s" });
function residualSetup(findings, mutate = a => a) {
  const failed = critic({ reviewPass: false, findingCount: findings.length });
  const consumedFn = () => consumed(failed);
  const probe = recordReceiptSha(failed);
  const acceptance = mutate({
    schema: "pipeline.critic-residual-acceptance.v1", mode: "chat-attributed-unattested",
    candidate: { ...candidate }, criticReceiptSha256: probe,
    findings: findings.map(f => ({ id: residualFindingId(f), severity: f.severity })).sort((a, b) => a.id.localeCompare(b.id)),
  });
  return { failed, acceptance, deps: {
    readConsumedCandidateReceiptFn: consumedFn,
    readOpenFindingsFn: () => findings,
    residualAcceptance: acceptance,
    verifyResidualAcceptanceFn: () => ({ authorized: true, mode: acceptance.mode }),
  } };
}
function recordReceiptSha(failed) { return sha256(canonicalJson(consumed(failed).receipt)); }
const record = (common, failed, deps) => recordCriticVerifyLifecycle({ gitCommonDir: common, criticPacketId: failed.packetId, candidate, evidencePath: "evidence/verify.json", evidence }, deps);
test("a failed receipt with only minor findings qualifies through an exactly matching PO acceptance, labelled as acceptance", t => {
  const common = fixture(t);
  const { failed, deps } = residualSetup([finding("a", "minor"), finding("b", "minor")]);
  const recorded = record(common, failed, deps);
  assert.equal(recorded.receipt.residualAcceptance.basis, "po-acceptance-of-residual-minor-findings");
  assert.equal(recorded.receipt.residualAcceptance.findings.length, 2);
  const read = readCriticVerifyLifecycle({ gitCommonDir: common, id: recorded.receipt.id, candidate, evidencePath: "evidence/verify.json", evidence }, deps);
  assert.equal(read.receiptSha256, recorded.receiptSha256);
});
test("a major finding is never acceptable, even when an acceptance lists it", t => {
  const common = fixture(t);
  const { failed, deps } = residualSetup([finding("a", "minor"), finding("b", "major")]);
  assert.throws(() => record(common, failed, deps), error => error.code === "CVL-CRITIC-FAILED");
});
test("an acceptance bound to another commit, tree, receipt or finding list is refused", t => {
  const common = fixture(t);
  const one = [finding("a", "minor")];
  const variants = [
    a => ({ ...a, candidate: { ...a.candidate, commit: oid("9") } }),
    a => ({ ...a, candidate: { ...a.candidate, tree: oid("9") } }),
    a => ({ ...a, criticReceiptSha256: sha("9") }),
    a => ({ ...a, findings: [{ id: sha("9"), severity: "minor" }] }),
    a => ({ ...a, findings: [...a.findings, { id: sha("8"), severity: "minor" }] }),
  ];
  for (const mutate of variants) {
    const { failed, deps } = residualSetup(one, mutate);
    assert.throws(() => record(common, failed, deps), error => error.code === "CVL-CRITIC-FAILED");
  }
});
test("a missing or unverified acceptance leaves the failed receipt refused", t => {
  const common = fixture(t);
  const { failed, deps } = residualSetup([finding("a", "minor")]);
  assert.throws(() => record(common, failed, { ...deps, residualAcceptance: undefined }), error => error.code === "CVL-CRITIC-FAILED");
  assert.throws(() => record(common, failed, { ...deps, verifyResidualAcceptanceFn: () => ({ authorized: false }) }), error => error.code === "CVL-CRITIC-FAILED");
  // The lifecycle record is immutable and carries the mode (existing CVL-RECEIPT-COLLISION rule), so each mode gets its own fixture.
  for (const mode of ["chat-attributed-unattested", "signature"]) {
    const ok = record(fixture(t), failed,{ ...deps, verifyResidualAcceptanceFn: () => ({ authorized: true, mode }) });
    assert.equal(ok.receipt.residualAcceptance.mode, mode);
  }
});
test("a passing receipt is unchanged by the acceptance machinery", t => {
  const common = fixture(t);
  const source = critic();
  const recorded = record(common, source, { readConsumedCandidateReceiptFn: () => consumed(source), residualAcceptance: { junk: true } });
  assert.equal(recorded.receipt.residualAcceptance, undefined);
  assert.equal(recorded.receipt.schema, "pipeline.critic-verify-lifecycle-receipt.v1");
});
test("readback refuses missing consumed review and forged private lifecycle fields", t => {
  const common = fixture(t);
  const source = critic();
  const input = { gitCommonDir: common, criticPacketId: source.packetId,
    candidate, evidencePath: "evidence/verify.json", evidence };
  const deps = { readConsumedCandidateReceiptFn: () => consumed(source) };
  const recorded = recordCriticVerifyLifecycle(input, deps);
  const read = () => readCriticVerifyLifecycle({ gitCommonDir: common, id: recorded.receipt.id,
    candidate, evidencePath: input.evidencePath, evidence }, deps);
  assert.equal(read().receiptSha256, recorded.receiptSha256);
  assert.throws(() => readCriticVerifyLifecycle({ gitCommonDir: common, id: recorded.receipt.id,
    candidate, evidencePath: input.evidencePath, evidence }),
  error => error.code === "CVL-CRITIC-UNAVAILABLE");
  const target = join(common, "agent-pipeline", "critic-verify-lifecycle", `${recorded.receipt.id}.json`);
  writeFileSync(target, `${canonicalJson({ ...recorded.receipt,
    critic: { ...recorded.receipt.critic, verdictSha256: sha("4") } })}\n`);
  assert.throws(read, error => error.code === "CVL-CRITIC-DRIFT");
  writeFileSync(target, `${canonicalJson({ ...recorded.receipt,
    verify: { ...recorded.receipt.verify, evidenceSha256: sha("5") } })}\n`);
  assert.throws(read, error => error.code === "CVL-RECEIPT-IDENTITY");
  writeFileSync(target, `${canonicalJson({ ...recorded.receipt,
    verify: { ...recorded.receipt.verify, verifyRunTerminalSha256: sha("6") } })}\n`);
  assert.throws(read, error => error.code === "CVL-VERIFY-DRIFT");
});
test("refuses a valid-looking receipt whose packet digest or diff is not the consumed packet", t => {
  const common = fixture(t);
  const source = critic();
  const forged = consumed(source);
  forged.packet.diff.sha256 = sha("9");
  assert.throws(() => recordCriticVerifyLifecycle({ gitCommonDir: common, criticPacketId: source.packetId, candidate, evidencePath: "evidence/verify.json", evidence }, {
    readConsumedCandidateReceiptFn: () => forged,
  }), error => error.code === "CVL-CRITIC-PACKET-MISMATCH");
});
test("final readiness requires the exact clean producer evidence and its consumed Critic binding", t => {
  const common = fixture(t);
  const source = critic();
  const fullEvidence = { ...evidence, commit: candidate.commit, tree: candidate.tree,
    verifyRun: { status: "passed", terminalSha256: sha("c") },
    steps: [{ name: "configured-verify", exitCode: 0 }] };
  const input = { gitCommonDir: common, head: candidate.commit, tree: candidate.tree,
    worktreeState: "clean", evidencePath: "evidence/verify-latest.json", evidence: fullEvidence };
  assert.equal(inspectCriticBoundVerify(input).code, "private-critic-binding-unavailable");
  const recorded = recordCriticVerifyLifecycle({ gitCommonDir: common, criticPacketId: source.packetId,
    candidate, evidencePath: input.evidencePath, evidence: fullEvidence },
  { readConsumedCandidateReceiptFn: () => consumed(source) });
  const readLifecycle = (options) => readCriticVerifyLifecycle(options,
    { readConsumedCandidateReceiptFn: () => consumed(source) });
  const admitted = inspectCriticBoundVerify({ ...input, readLifecycle });
  assert.equal(admitted.currentCheckoutOk, true);
  assert.equal(admitted.receiptId, recorded.receipt.id);
  assert.equal(inspectCriticBoundVerify({ ...input, evidence: { ...fullEvidence,
    verifyRun: { terminalStatus: "passed", terminalSha256: sha("c") } }, readLifecycle }).headEvidenceOk, false,
  "a non-producer terminalStatus field cannot replace public Verify status");
  assert.equal(inspectCriticBoundVerify({ ...input, evidence: { ...fullEvidence,
    verifyRun: { status: "failed", terminalSha256: sha("c") } }, readLifecycle }).headEvidenceOk, false);
  assert.equal(inspectCriticBoundVerify({ ...input, worktreeState: "dirty", readLifecycle }).currentCheckoutOk, false);
  assert.equal(inspectCriticBoundVerify({ ...input, evidence: { ...fullEvidence, startedAt: "forged" },
    readLifecycle }).currentCheckoutOk, false);
  assert.equal(inspectCriticBoundVerify({ ...input, evidence: { ...fullEvidence,
    candidate: { binding: "exact" } }, readLifecycle }).headEvidenceOk, false);
});
test("the installed read-only checker refuses a green diagnostic receipt without private Critic binding", t => {
  const root = fixture(t);
  const git = (args) => execFileSync("git", ["-C", root, ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(["init", "--quiet"]);
  writeFileSync(join(root, "source.txt"), "source\n");
  writeFileSync(join(root, ".gitignore"), "evidence/\n");
  git(["add", "source.txt", ".gitignore"]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "commit", "--quiet", "-m", "fixture"]);
  const head = git(["rev-parse", "HEAD"]);
  const tree = git(["rev-parse", "HEAD^{tree}"]);
  const missing = checkCurrentCriticBoundVerify(root);
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "verify-evidence-not-exact-green");
  mkdirSync(join(root, "evidence"));
  writeFileSync(join(root, "evidence", "verify-latest.json"), JSON.stringify({
    schema: "pipeline.verify-evidence.v0", commit: head, tree,
    candidate: { commit: head, tree }, exitCode: 0,
    verifyRun: { status: "passed", terminalSha256: sha("c") },
    steps: [{ name: "configured-verify", exitCode: 0 }],
  }));
  const observed = checkCurrentCriticBoundVerify(root);
  assert.equal(observed.ok, false);
  assert.equal(observed.code, "private-critic-binding-unavailable");
  assert.equal(observed.privateLifecycleBound, false);
});

test("a consumed Critic carries only across exact immutable evidence registration, never mixed source changes", t => {
  const root = fixture(t);
  const git = (args) => execFileSync("git", ["-C", root, ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const featureId = "carry-feature";
  const manifestPath = `specs/${featureId}/lifecycle.json`;
  const evidencePath = `specs/${featureId}/evidence/review.json`;
  const manifest = (artifacts) => ({ schema: "pipeline.feature-package.v1",
    feature: { id: featureId, rigor: 1 }, state: "approved", artifacts });
  git(["init", "--quiet"]);
  mkdirSync(join(root, "specs", featureId, "evidence"), { recursive: true });
  writeFileSync(join(root, "source.txt"), "reviewed source\n");
  writeFileSync(join(root, manifestPath), `${JSON.stringify(manifest([]))}\n`);
  git(["add", "."]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "commit", "--quiet", "-m", "reviewed source"]);
  const reviewed = { commit: git(["rev-parse", "HEAD"]), tree: git(["rev-parse", "HEAD^{tree}"]) };
  const receipt = critic({ candidate: { base: oid("f"), ...reviewed },
    reviewRange: { base: oid("f"), commit: reviewed.commit, diffSha256: sha("1") } });
  const deps = { readConsumedCandidateReceiptFn: () => consumed(receipt) };
  const evidenceBytes = `${JSON.stringify({ schema: "fixture.review.v1", result: "pass" })}\n`;
  writeFileSync(join(root, evidencePath), evidenceBytes);
  writeFileSync(join(root, manifestPath), `${JSON.stringify(manifest([{
    class: "candidate-evidence", path: evidencePath, sha256: sha256(evidenceBytes),
    authority: false, mutability: "immutable", retention: "retain",
  }]))}\n`);
  git(["add", "."]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "commit", "--quiet", "-m", "register immutable evidence"]);
  const evidenceCommit = { commit: git(["rev-parse", "HEAD"]), tree: git(["rev-parse", "HEAD^{tree}"]) };
  const input = { repoRoot: root, gitCommonDir: join(root, ".git"), featureId,
    criticPacketId: receipt.packetId, targetCandidate: evidenceCommit };
  const carried = inspectConsumedCriticEvidenceCarryForward(input, deps);
  assert.deepEqual(carried.proof.evidenceOnlyCommits, [evidenceCommit.commit]);
  assert.equal(carried.proof.reviewedCandidate.commit, reviewed.commit);
  assert.match(carried.proofSha256, /^[a-f0-9]{64}$/u);
  const carriedEvidence = { ...evidence, candidate: evidenceCommit };
  const recorded = recordCriticVerifyLifecycle({ repoRoot: root, featureId,
    gitCommonDir: input.gitCommonDir, criticPacketId: receipt.packetId,
    candidate: evidenceCommit, evidencePath: "evidence/verify.json",
    evidence: carriedEvidence }, deps);
  assert.equal(recorded.receipt.schema, "pipeline.critic-verify-lifecycle-receipt.v2");
  const readInput = { repoRoot: root, gitCommonDir: input.gitCommonDir,
    id: recorded.receipt.id, candidate: evidenceCommit,
    evidencePath: "evidence/verify.json", evidence: carriedEvidence };
  assert.equal(readCriticVerifyLifecycle(readInput, deps).receiptSha256, recorded.receiptSha256);
  assert.throws(() => readCriticVerifyLifecycle({ ...readInput, repoRoot: null }, deps),
    error => error.code === "CVL-CARRY-INVALID");
  writeFileSync(recorded.path, `${canonicalJson({ ...recorded.receipt,
    carryForward: { ...recorded.receipt.carryForward, proofSha256: sha("9") } })}\n`);
  assert.throws(() => readCriticVerifyLifecycle(readInput, deps),
    error => error.code === "CVL-CARRY-DRIFT");
  writeFileSync(recorded.path, `${canonicalJson(recorded.receipt)}\n`);
  assert.throws(() => inspectConsumedCriticEvidenceCarryForward({ ...input,
    targetCandidate: { ...evidenceCommit, tree: oid("9") } }, deps),
  error => error.code === "CVL-CARRY-CONTENT-CHANGED");
  writeFileSync(join(root, "source.txt"), "changed after review\n");
  git(["add", "source.txt"]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "commit", "--quiet", "-m", "change source"]);
  const mixed = { commit: git(["rev-parse", "HEAD"]), tree: git(["rev-parse", "HEAD^{tree}"]) };
  assert.throws(() => inspectConsumedCriticEvidenceCarryForward({ ...input,
    targetCandidate: mixed }, deps), error => error.code === "CVL-CARRY-CONTENT-CHANGED");
});
