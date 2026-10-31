// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { inspectConsumedCriticEvidenceCarryForward, readBoundConsumedCriticReceipt, recordCriticVerifyLifecycle, readCriticVerifyLifecycle, residualFindingId } from "./critic-verify-lifecycle.mjs";
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
// D217 (N35 A): the close addendum reads the receipt through this very reader. `residual` is non-null exactly when a failed receipt is
// admitted through a valid acceptance, and a failed receipt without one never comes back as a bound receipt.
test("N35 the bound reader returns a non-null residual only for a failed receipt with a valid, exactly bound acceptance (D217 A)", t => {
  const common = fixture(t);
  const { failed, deps } = residualSetup([finding("a", "minor"), finding("b", "minor")]);
  const read = (extra) => readBoundConsumedCriticReceipt({ gitCommonDir: common, criticPacketId: failed.packetId, candidate }, { ...deps, ...extra });
  const bound = read({});
  assert.equal(bound.critic.reviewPass, false);
  assert.equal(bound.residual.basis, "po-acceptance-of-residual-minor-findings");
  assert.equal(bound.residual.findings.length, 2);
  for (const refused of [{ residualAcceptance: undefined }, { verifyResidualAcceptanceFn: () => ({ authorized: false }) },
    { residualAcceptance: { ...deps.residualAcceptance, criticReceiptSha256: sha("9") } },
    { readOpenFindingsFn: () => [finding("a", "minor"), finding("b", "major")] }]) {
    assert.throws(() => read(refused), error => error.code === "CVL-CRITIC-FAILED");
  }
  const passing = critic();
  assert.equal(readBoundConsumedCriticReceipt({ gitCommonDir: common, criticPacketId: passing.packetId, candidate },
    { readConsumedCandidateReceiptFn: () => consumed(passing) }).residual, null);
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

// N23 (consumer finding 2026-10-30): the tracked export of the consumed review sits between the reviewed and the
// pushed candidate. It carries the Critic; a forged, extended or mixed export stays unreviewed content, and the
// course counters (classification without the option) keep counting it as a correction.
import * as courseAdmission from "./critic-course-admission.mjs";
test("N23 the export commit of the consumed review carries the Critic; a forged, extended or mixed export does not", t => {
  const root = fixture(t);
  const git = (args) => execFileSync("git", ["-C", root, ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commitAll = (message) => {
    git(["add", "-A"]);
    git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", message]);
    return { commit: git(["rev-parse", "HEAD"]), tree: git(["rev-parse", "HEAD^{tree}"]) };
  };
  const featureId = "carry-feature";
  git(["init", "--quiet"]);
  mkdirSync(join(root, "specs", featureId), { recursive: true });
  writeFileSync(join(root, "source.txt"), "reviewed source\n");
  writeFileSync(join(root, `specs/${featureId}/lifecycle.json`), `${JSON.stringify({ schema: "pipeline.feature-package.v1",
    feature: { id: featureId, rigor: 1 }, state: "approved", artifacts: [] })}\n`);
  const reviewed = commitAll("reviewed source");
  const read = consumed(critic({ candidate: { base: oid("f"), ...reviewed },
    reviewRange: { base: oid("f"), commit: reviewed.commit, diffSha256: sha("1") } }));
  const deps = { readConsumedCandidateReceiptFn: () => read };
  const dir = `specs/${featureId}/evidence/critic/${read.receipt.packetId}`;
  const exportAt = (base, message, { receiptBytes = canonicalJson(read.receipt), report = "# Critic notes\n\nNo findings.\n",
    index = {}, extra = null, source = null } = {}) => {
    git(["checkout", "--quiet", "--detach", base]);
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, "receipt.json"), receiptBytes);
    writeFileSync(join(root, dir, "report.md"), report);
    writeFileSync(join(root, dir, "index.json"), canonicalJson({ schema: "pipeline.session-critic-evidence-index.v1",
      packetId: read.receipt.packetId, candidate: { commit: reviewed.commit, tree: reviewed.tree },
      receiptSha256: sha256(receiptBytes), reportSha256: sha256(report), reviewPass: true, findingCount: 0, ...index }));
    if (extra) writeFileSync(join(root, dir, extra), "extra\n");
    if (source) writeFileSync(join(root, "source.txt"), source);
    return commitAll(message);
  };
  const carry = (target) => inspectConsumedCriticEvidenceCarryForward({ repoRoot: root, gitCommonDir: join(root, ".git"),
    featureId, criticPacketId: read.receipt.packetId, targetCandidate: target }, deps);
  const exported = exportAt(reviewed.commit, "export the consumed review");
  assert.deepEqual(carry(exported).proof.evidenceOnlyCommits, [exported.commit]);
  assert.equal(courseAdmission.criticExportOnlyCommit(root, exported.commit, ["alias-feature", featureId], deps.readConsumedCandidateReceiptFn), true,
    "the lineage transport admits the export under any course feature id");
  assert.equal(courseAdmission.criticExportOnlyCommit(root, exported.commit, ["alias-feature"], deps.readConsumedCandidateReceiptFn), false);
  assert.equal(courseAdmission.criticExportOnlyCommit(root, exported.commit, [featureId]), false,
    "the production reader finds no consumed packet in this repository's private store");
  assert.deepEqual(courseAdmission.classifyRegisteredEvidenceOnlyCommits({ repoRoot: root, featureId, baseCommit: reviewed.commit,
    candidateCommit: exported.commit }).correctionCommits, [exported.commit], "course counters are unchanged without the option");
  const forged = {
    "reformatted receipt bytes": { receiptBytes: `${JSON.stringify(read.receipt)}\n` },
    "report digest of another report": { index: { reportSha256: sha256("another report\n") } },
    "foreign packet id in the index": { index: { packetId: "e".repeat(32) } },
    "review verdict differs from the receipt": { index: { reviewPass: false } },
    "an extra file in the export": { extra: "notes.md" },
    "a source change in the same commit": { source: "changed with the export\n" },
  };
  for (const [name, variant] of Object.entries(forged)) {
    assert.throws(() => carry(exportAt(reviewed.commit, name, variant)), error => error.code === "CVL-CARRY-CONTENT-CHANGED", name);
  }
  git(["checkout", "--quiet", "--detach", exported.commit]);
  writeFileSync(join(root, dir, "report.md"), "# Critic notes\n\nRewritten after the export.\n");
  assert.throws(() => carry(commitAll("modify the exported report")), error => error.code === "CVL-CARRY-CONTENT-CHANGED",
    "a later change to an exported file is not an export");
  assert.throws(() => inspectConsumedCriticEvidenceCarryForward({ repoRoot: root, gitCommonDir: join(root, ".git"), featureId,
    criticPacketId: read.receipt.packetId, targetCandidate: exported }, {}), error => error.code === "CVL-CRITIC-UNAVAILABLE",
  "without a consumed packet in the private store nothing carries");
});

// N22: a PO residual acceptance lives in a private record bound to the Critic receipt's own candidate and
// reaches the carry-forward, the lifecycle recorder and the readiness check through one shared loader.
import * as readiness from "./critic-verify-readiness.mjs";
function privateAcceptance(receipt, findings, over = {}) {
  const receiptSha = sha256(canonicalJson(consumed(receipt).receipt));
  const record = { schema: "pipeline.critic-residual-acceptance.v1", mode: "chat-attributed-unattested",
    forCommit: receipt.candidate.commit, forTree: receipt.candidate.tree,
    candidate: { commit: receipt.candidate.commit, tree: receipt.candidate.tree },
    criticReceiptSha256: receiptSha,
    findings: findings.map(f => ({ id: residualFindingId(f), severity: f.severity })).sort((a, b) => a.id.localeCompare(b.id)),
    approvedBy: "PO", approvedAt: "2026-10-30T10:00:00.000Z", criticalProof: null, ...over };
  return { receiptSha, record };
}
test("N22 the private acceptance bound to the Critic candidate carries a failed all-minor receipt to a later evidence-only target", t => {
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
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "reviewed source"]);
  const reviewed = { commit: git(["rev-parse", "HEAD"]), tree: git(["rev-parse", "HEAD^{tree}"]) };
  const findings = [finding("a", "minor")];
  const receipt = critic({ reviewPass: false, findingCount: 1, candidate: { base: oid("f"), ...reviewed },
    reviewRange: { base: oid("f"), commit: reviewed.commit, diffSha256: sha("1") } });
  const evidenceBytes = `${JSON.stringify({ schema: "fixture.review.v1", result: "pass" })}\n`;
  writeFileSync(join(root, evidencePath), evidenceBytes);
  writeFileSync(join(root, manifestPath), `${JSON.stringify(manifest([{ class: "candidate-evidence", path: evidencePath,
    sha256: sha256(evidenceBytes), authority: false, mutability: "immutable", retention: "retain" }]))}\n`);
  git(["add", "."]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "register immutable evidence"]);
  const target = { commit: git(["rev-parse", "HEAD"]), tree: git(["rev-parse", "HEAD^{tree}"]) };
  const common = join(root, ".git");
  const input = { repoRoot: root, gitCommonDir: common, featureId, criticPacketId: receipt.packetId, targetCandidate: target };
  const base = { readConsumedCandidateReceiptFn: () => consumed(receipt), readOpenFindingsFn: () => findings };
  assert.throws(() => inspectConsumedCriticEvidenceCarryForward(input, base), error => error.code === "CVL-CRITIC-FAILED");
  const { receiptSha, record } = privateAcceptance(receipt, findings);
  const written = readiness.writeResidualAcceptanceRecord({ gitCommonDir: common, criticReceiptSha256: receiptSha, record, consumption: null });
  assert.equal(written.ok, true);
  let seenState = null;
  const loaded = readiness.loadResidualAcceptanceDeps({ gitCommonDir: common, projectDir: root, criticReceiptSha256: receiptSha,
    authorizeFn: (arg) => { seenState = arg.state; return { authorized: true, mode: record.mode }; } });
  assert.notEqual(loaded, null);
  const carried = inspectConsumedCriticEvidenceCarryForward(input, { ...base, ...loaded });
  assert.equal(carried.proof.criticReceiptSha256, receiptSha);
  assert.deepEqual(seenState.residualAcceptance.lastAccepted, record);
  const recorded = recordCriticVerifyLifecycle({ repoRoot: root, featureId, gitCommonDir: common, criticPacketId: receipt.packetId,
    candidate: target, evidencePath: "evidence/verify.json", evidence: { ...evidence, candidate: target } }, { ...base, ...loaded });
  assert.equal(recorded.receipt.residualAcceptance.basis, "po-acceptance-of-residual-minor-findings");
  assert.equal(recorded.receipt.carryForward.proof.reviewedCandidate.commit, reviewed.commit);
});
test("N22 the loader is inert without a private record and writes refuse a replayed proof across records", t => {
  const common = fixture(t);
  const failed = critic({ reviewPass: false, findingCount: 1 });
  const findings = [finding("a", "minor")];
  const { receiptSha, record } = privateAcceptance(failed, findings);
  assert.equal(readiness.loadResidualAcceptanceDeps({ gitCommonDir: common, projectDir: common, criticReceiptSha256: receiptSha }), null);
  const consumption = { proofSha256: sha("7"), kind: "accept-residual-critic-findings", consumedAt: "2026-10-30T10:00:00.000Z" };
  assert.equal(readiness.writeResidualAcceptanceRecord({ gitCommonDir: common, criticReceiptSha256: receiptSha, record, consumption }).ok, true);
  const other = privateAcceptance(critic({ reviewPass: false, findingCount: 1, verdictSha256: sha("4") }), findings);
  const replay = readiness.writeResidualAcceptanceRecord({ gitCommonDir: common, criticReceiptSha256: other.receiptSha, record: other.record, consumption });
  assert.equal(replay.ok, false);
  assert.equal(replay.code, "CRITICAL-PROOF-REPLAY");
});
test("N22 readiness admits a failed all-minor receipt through the private acceptance on a clean tree", t => {
  const common = fixture(t);
  const failed = critic({ reviewPass: false, findingCount: 1 });
  const findings = [finding("a", "minor")];
  const fullEvidence = { ...evidence, commit: candidate.commit, tree: candidate.tree,
    verifyRun: { status: "passed", terminalSha256: sha("c") }, steps: [{ name: "configured-verify", exitCode: 0 }] };
  const { receiptSha, record } = privateAcceptance(failed, findings);
  const authorizeFn = () => ({ authorized: true, mode: record.mode });
  readiness.writeResidualAcceptanceRecord({ gitCommonDir: common, criticReceiptSha256: receiptSha, record, consumption: null });
  const base = { readConsumedCandidateReceiptFn: () => consumed(failed), readOpenFindingsFn: () => findings };
  const loaded = readiness.loadResidualAcceptanceDeps({ gitCommonDir: common, projectDir: common, criticReceiptSha256: receiptSha, authorizeFn });
  recordCriticVerifyLifecycle({ gitCommonDir: common, criticPacketId: failed.packetId, candidate,
    evidencePath: "evidence/verify-latest.json", evidence: fullEvidence }, { ...base, ...loaded });
  const readLifecycle = (options, residualDeps) => readCriticVerifyLifecycle(options, { ...base, ...(residualDeps ?? {}) });
  const admitted = inspectCriticBoundVerify({ repoRoot: common, gitCommonDir: common, head: candidate.commit, tree: candidate.tree,
    worktreeState: "clean", evidencePath: "evidence/verify-latest.json", evidence: fullEvidence, readLifecycle, residualAuthorizeFn: authorizeFn });
  assert.equal(admitted.code, "critic-bound-verify-valid");
  assert.equal(admitted.privateLifecycleBound, true);
});
