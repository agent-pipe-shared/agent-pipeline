// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { canonical, createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";
import { PORTABLE_CRITIC_EXPORT_PATH, PORTABLE_CRITIC_EXPORT_SCHEMA,
  PORTABLE_CRITIC_EXPORT_SUBJECT_SCHEMA } from "../lib/portable-critic-export.mjs";
import { currentPortableCriticExportSource, runPortableCriticExport } from "./portable-critic-export.mjs";
import { canonicalJson as packetCanonicalJson, sha256 as packetSha256,
  claimCandidatePacket, consumeCandidatePacket, prepareCandidatePacket,
  recordCandidateResult } from "./critic-packet-preflight.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const candidate = { commit: "b".repeat(40), tree: "c".repeat(40) };
const planSha256 = "d".repeat(64);
const specSha256 = "e".repeat(64);

function fixture(root) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyText = publicKey.export({ type: "spki", format: "pem" }).toString();
  const subject = { schema: PORTABLE_CRITIC_EXPORT_SUBJECT_SCHEMA,
    purpose: "product-capability-final", inventoryPath: "docs/product-capability-inventory.json",
    candidate, producer: { kind: "consumed-session-critic", packetId: "a".repeat(32),
      packetDigest: "1".repeat(64), receiptSha256: "2".repeat(64), verdictSha256: "3".repeat(64),
      reviewRange: { base: "4".repeat(40), commit: candidate.commit, diffSha256: "5".repeat(64) },
      reviewPass: true } };
  const approvalIntent = createPoApprovalIntent({ kind: "critic-export", featureId: "sprint-alfred-epic",
    planSha256, specSha256, candidate, policyRevision: "v1",
    subjectSha256: sha(canonical(subject)), decision: "approve" });
  const source = { repo: { commonDir: join(root, ".git") }, candidate, planSha256, specSha256,
    trustAnchors: [{ keyReference: "fixture-po", publicKeySha256: sha(publicKeyText) }] };
  const proof = { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: approvalIntent.sha256,
    keyReference: "fixture-po", publicKey: publicKeyText,
    signatureBase64: sign(null, Buffer.from(approvalIntent.sha256, "utf8"), privateKey).toString("base64") };
  return { source, prepared: { subject, approvalIntent }, proof };
}

test("PCC01 prepare, check and publish require one unchanged consumed-review request and anchored proof", () => {
  const root = mkdtempSync(join(tmpdir(), "portable-critic-cli-"));
  try {
    mkdirSync(join(root, "specs/sprint-alfred-epic/evidence"), { recursive: true });
    const { source, prepared, proof } = fixture(root);
    const dependencies = { currentSource: () => source, prepare: () => prepared };
    const args = (action) => [action, "--root", root, "--packet-id", "a".repeat(32)];
    assert.equal(runPortableCriticExport(args("check"), dependencies).code,
      "CRITIC-EXPORT-REQUEST-UNAVAILABLE");
    const ready = runPortableCriticExport(args("prepare"), dependencies);
    assert.equal(ready.code, "CRITIC-EXPORT-SIGNATURE-REQUEST-READY");
    assert.equal(runPortableCriticExport(args("prepare"), dependencies).intentSha256,
      ready.intentSha256);
    assert.equal(runPortableCriticExport(args("check"), dependencies).code,
      "CRITIC-EXPORT-CONSUMED-REVIEW-BOUND");
    writeFileSync(join(root, "scratch", `portable-critic-export-proof-${"a".repeat(32)}.json`),
      `${JSON.stringify(proof)}\n`);
    const published = runPortableCriticExport(args("publish"), dependencies);
    assert.equal(published.code, "CRITIC-EXPORT-PUBLISHED");
    const bytes = readFileSync(join(root, PORTABLE_CRITIC_EXPORT_PATH));
    assert.equal(published.sha256, sha(bytes));
    assert.equal(JSON.parse(bytes).schema, PORTABLE_CRITIC_EXPORT_SCHEMA);
    assert.equal(runPortableCriticExport(args("publish"), dependencies).code,
      "CRITIC-EXPORT-PUBLICATION");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("PCC02 changed request or proof never publishes a Critic export", () => {
  const root = mkdtempSync(join(tmpdir(), "portable-critic-refusal-"));
  try {
    mkdirSync(join(root, "specs/sprint-alfred-epic/evidence"), { recursive: true });
    const { source, prepared, proof } = fixture(root);
    const dependencies = { currentSource: () => source, prepare: () => prepared };
    const args = (action) => [action, "--root", root, "--packet-id", "a".repeat(32)];
    assert.equal(runPortableCriticExport(args("prepare"), dependencies).ok, true);
    const proofPath = join(root, "scratch", `portable-critic-export-proof-${"a".repeat(32)}.json`);
    writeFileSync(proofPath, `${JSON.stringify({ ...proof, signatureBase64: "AAAA" })}\n`);
    assert.equal(runPortableCriticExport(args("publish"), dependencies).code,
      "CRITIC-EXPORT-PROOF-INVALID");
    const requestPath = join(root, "scratch", `portable-critic-export-request-${"a".repeat(32)}.json`);
    const request = JSON.parse(readFileSync(requestPath));
    request.subject.producer.verdictSha256 = "0".repeat(64);
    writeFileSync(requestPath, `${JSON.stringify(request)}\n`);
    assert.equal(runPortableCriticExport(args("check"), dependencies).code,
      "CRITIC-EXPORT-REQUEST-DRIFT");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("PCC03 real Git source refuses a dirty candidate", () => {
  const root = mkdtempSync(join(tmpdir(), "portable-critic-git-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid");
    git("config", "user.name", "Fixture");
    mkdirSync(join(root, "specs/sprint-alfred-epic/plans"), { recursive: true });
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "specs/sprint-alfred-epic/plans/sprint-alfred-execution-roadmap.md"), "plan\n");
    writeFileSync(join(root, "specs/sprint-alfred-epic/spec.md"), "spec\n");
    writeFileSync(join(root, "project/critical-human-proof.json"), JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v3",
      trustAnchors: [{ keyReference: "fixture", publicKeySha256: "a".repeat(64) }],
    }));
    git("add", "."); git("commit", "-q", "-m", "fixture");
    const clean = currentPortableCriticExportSource(root);
    assert.equal(clean?.candidate.commit, git("rev-parse", "HEAD"));
    assert.equal(clean?.planSha256, sha("plan\n"));
    writeFileSync(join(root, "unreviewed.txt"), "dirty\n");
    assert.equal(currentPortableCriticExportSource(root), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("PCC04 productive prepare reads a real consumed private packet without an injected preparer", () => {
  const root = mkdtempSync(join(tmpdir(), "portable-critic-consumed-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid");
    git("config", "user.name", "Fixture");
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyText = publicKey.export({ type: "spki", format: "pem" }).toString();
    mkdirSync(join(root, "specs/sprint-alfred-epic/plans"), { recursive: true });
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), "evidence/\nscratch/\n");
    const plan = "specs/sprint-alfred-epic/plans/sprint-alfred-execution-roadmap.md";
    const spec = "specs/sprint-alfred-epic/spec.md";
    writeFileSync(join(root, plan), "plan\n");
    writeFileSync(join(root, spec), "first\n");
    writeFileSync(join(root, "project/critical-human-proof.json"), JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v3",
      trustAnchors: [{ keyReference: "fixture", publicKeySha256: sha(publicKeyText) }],
    }));
    git("add", "."); git("commit", "-q", "-m", "base");
    const base = git("rev-parse", "HEAD");
    writeFileSync(join(root, spec), "reviewed\n");
    git("add", spec); git("commit", "-q", "-m", "candidate");
    const commit = git("rev-parse", "HEAD");
    const tree = git("rev-parse", "HEAD^{tree}");
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "evidence/dispatch-record-critic-export-fixture.json"), JSON.stringify({
      schema: "pipeline.dispatch-record.v4", taskId: "critic-export-fixture",
      agentType: "goldfish-implementor", model: "claude-sonnet-5", effort: "medium",
      rulesetSha: "fixture", dispatcher: "Elephant", candidateCommit: commit,
      resultSha256: null, outcome: "in-progress",
      outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" },
      commits: [], log: [], report: null,
      criticRequired: { schema: "pipeline.critic-required-decision.v1",
        trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 2,
          riskClass: "low", riskFlag: false,
          diff: { mechanical: false, architecture: false, guardrails: false, security: false } },
        appliedRow: "T3" },
    }));
    const commonDir = join(root, ".git");
    const controlRoot = join(commonDir, "agent-pipeline/critic-packets");
    mkdirSync(controlRoot, { recursive: true, mode: 0o700 });
    const packetId = "6".repeat(32);
    const prepared = prepareCandidatePacket({ repoRoot: root, controlRoot, packetId,
      taskId: "critic-export-fixture", projectId: "pipeline", baseCommit: base,
      candidateCommit: commit, rulesetOid: commit, trigger: "T1",
      route: { routeId: "fixture-critic", runner: "codex", adapter: "codex-functional-equivalent",
        provider: "openai", modelTier: "review", effortTier: "xhigh",
        assurance: "functional-equivalent-read-only; OS isolation not asserted",
        projectionDigest: "a".repeat(64) },
      references: [{ kind: "spec", path: spec }],
    });
    claimCandidatePacket({ controlRoot, packetId, adapter: prepared.packet.route.adapter,
      claimantNonce: "7".repeat(64) });
    recordCandidateResult({ controlRoot, packetId, result: { verdict: "pass" } });
    const packet = prepared.packet;
    const receipt = { schema: "pipeline.session-critic-receipt.v1", packetId,
      packetDigest: packetSha256(packetCanonicalJson(packet)),
      session: { id: "fresh-review", freshContext: true, historyInherited: false, mayDelegate: false },
      candidate: { ...packet.candidate }, reviewRange: { base: packet.diff.base,
        commit: packet.diff.commit, diffSha256: packet.diff.sha256 },
      rulesetSha: commit, assurance: "functional-equivalent-read-only; OS isolation not asserted",
      verdictSha256: "8".repeat(64), findingCount: 0, reviewPass: true };
    consumeCandidatePacket({ controlRoot, packetId, receipt });
    const args = (action) => [action, "--root", root, "--packet-id", packetId];
    const ready = runPortableCriticExport(args("prepare"));
    assert.equal(ready.code, "CRITIC-EXPORT-SIGNATURE-REQUEST-READY", JSON.stringify(ready));
    const request = JSON.parse(readFileSync(ready.requestPath));
    assert.equal(request.subject.candidate.commit, commit);
    assert.equal(request.subject.candidate.tree, tree);
    assert.equal(request.subject.producer.packetDigest, receipt.packetDigest);
    assert.equal(runPortableCriticExport(args("check")).code,
      "CRITIC-EXPORT-CONSUMED-REVIEW-BOUND");
    const receiptPath = join(controlRoot, packetId, "receipt.json");
    const originalReceipt = readFileSync(receiptPath);
    const changedReceipt = JSON.parse(originalReceipt);
    changedReceipt.body.verdictSha256 = "9".repeat(64);
    writeFileSync(receiptPath, JSON.stringify(changedReceipt));
    assert.equal(runPortableCriticExport(args("check")).code,
      "CRITIC-EXPORT-CONSUMED-REVIEW-UNAVAILABLE");
    writeFileSync(receiptPath, originalReceipt);
    // Restore the original journal bytes before signing; the negative mutation
    // above must not become the source of the published subject.
    assert.equal(runPortableCriticExport(args("check")).code,
      "CRITIC-EXPORT-CONSUMED-REVIEW-BOUND");
    const proof = { schema: PO_APPROVAL_PROOF_SCHEMA,
      intentSha256: request.approvalIntent.sha256, keyReference: "fixture", publicKey: publicKeyText,
      signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256, "utf8"), privateKey).toString("base64") };
    writeFileSync(join(root, "scratch", `portable-critic-export-proof-${packetId}.json`),
      `${JSON.stringify(proof)}\n`);
    mkdirSync(join(root, "specs/sprint-alfred-epic/evidence"), { recursive: true });
    const published = runPortableCriticExport(args("publish"));
    assert.equal(published.code, "CRITIC-EXPORT-PUBLISHED", JSON.stringify(published));
    const exportRecord = JSON.parse(readFileSync(join(root, PORTABLE_CRITIC_EXPORT_PATH)));
    assert.equal(exportRecord.subject.producer.receiptSha256,
      request.subject.producer.receiptSha256);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
