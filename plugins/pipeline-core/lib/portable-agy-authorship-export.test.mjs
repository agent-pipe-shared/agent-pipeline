// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { canonical, PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";
import { PORTABLE_AGY_AUTHORSHIP_EXPORT_SCHEMA, PORTABLE_AGY_AUTHORSHIP_SUBJECT_SCHEMA,
  portableAgyAuthorshipExportPath, portableAgyAuthorshipIntent,
  preparePortableAgyAuthorshipExport, readPortableAgyAuthorshipExport,
  verifyPortableAgyAuthorshipExport } from "./portable-agy-authorship-export.mjs";
import { gitDeps, verifyCommit, VERDICT } from "../scripts/dispatch-authorship-verify.mjs";
import { evaluateRepositoryCriticSkipCoverage } from "../scripts/check-critic-skip-coverage.mjs";
import { agyAuthoredRecordBytes } from "./agy-host-observed-receipt.mjs";
import { validateDispatchRecord } from "./dispatch-record.mjs";
import { CRITIC_REQUIRED_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "./critic-skip-decision.mjs";
import { criticDispositionAddendumPath } from "./critic-disposition-addendum.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
function git(root, ...args) {
  const done = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false });
  assert.equal(done.status, 0, done.stderr);
  return done.stdout.trim();
}
async function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "portable-agy-authorship-"));
  try {
    git(root, "init", "-q");
    git(root, "config", "user.name", "Fixture");
    git(root, "config", "user.email", "fixture@example.invalid");
    git(root, "config", "commit.gpgsign", "false");
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyText = publicKey.export({ type: "spki", format: "pem" }).toString();
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: [], waivedKinds: [],
      trustAnchors: [{ keyReference: "fixture-po", publicKeySha256: sha(publicKeyText) }],
    }));
    writeFileSync(join(root, "file.txt"), "before\n");
    git(root, "add", "project/critical-human-proof.json", "file.txt");
    git(root, "commit", "-qm", "base");
    const parent = git(root, "rev-parse", "HEAD");
    writeFileSync(join(root, "file.txt"), "after\n");
    git(root, "add", "file.txt");
    git(root, "commit", "-qm", "feat(agy): delivered", "-m",
      "Dispatch: AGY-PUBLIC-1 (goldfish)\nAgy-Host-Observed: v1\nAI-Assisted: true");
    const commit = git(root, "rev-parse", "HEAD");
    const tree = git(root, "rev-parse", "HEAD^{tree}");
    const subject = { schema: PORTABLE_AGY_AUTHORSHIP_SUBJECT_SCHEMA,
      purpose: "portable-agy-authorship", taskId: "AGY-PUBLIC-1", runner: "antigravity",
      model: "gemini-3.8-flash", effort: "high", candidateCommit: parent,
      authoredCommit: commit, authoredTree: tree, parentCommit: parent,
      changedPaths: ["file.txt"], routePolicySha256: "a".repeat(64),
      consentSubjectSha256: "b".repeat(64), consentRecordSha256: "c".repeat(64),
      resultSha256: "d".repeat(64), reportSha256: "e".repeat(64),
      recordSha256: "f".repeat(64), hostReceiptSha256: "1".repeat(64),
      localVerdict: "bound" };
    const approvalIntent = portableAgyAuthorshipIntent(subject);
    const proof = { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: approvalIntent.sha256,
      keyReference: "fixture-po", publicKey: publicKeyText,
      signatureBase64: sign(null, Buffer.from(approvalIntent.sha256, "utf8"), privateKey).toString("base64") };
    const exportRecord = { schema: PORTABLE_AGY_AUTHORSHIP_EXPORT_SCHEMA, subject, approvalIntent, proof };
    return await run({ root, parent, commit, tree, exportRecord, publicKeyText, privateKey });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("PAE01 a signed redacted export binds the real Git commit in a checkout without private records", () => fixture(({ root, commit, exportRecord }) => {
  const cloneParent = mkdtempSync(join(tmpdir(), "portable-agy-clone-"));
  try {
    const path = portableAgyAuthorshipExportPath("AGY-PUBLIC-1");
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), `${canonical(exportRecord)}\n`);
    git(root, "add", path);
    git(root, "commit", "-qm", "publish signed Agy authorship export");
    const checked = readPortableAgyAuthorshipExport({ root, taskId: "AGY-PUBLIC-1", commit });
    assert.equal(checked.ok, true, JSON.stringify(checked));
    assert.equal(checked.authority, "host-observed-portable");
    const verdict = verifyCommit(commit, gitDeps({ repoRoot: root }));
    assert.equal(verdict.verdict, VERDICT.pass, JSON.stringify(verdict));
    assert.equal(verdict.classification, "agy-portable-export-verified");
    const clone = join(cloneParent, "checkout");
    const cloned = spawnSync("git", ["clone", "-q", root, clone], { encoding: "utf8", shell: false });
    assert.equal(cloned.status, 0, cloned.stderr);
    assert.equal(verifyCommit(commit, gitDeps({ repoRoot: clone })).classification,
      "agy-portable-export-verified");
    assert.equal(JSON.stringify(exportRecord).includes(root), false);
  } finally { rmSync(cloneParent, { recursive: true, force: true }); }
}));

test("PAE02 altered checkout bytes, signed subject or absent export never produce PASS", () => fixture(({ root, commit, tree, parent, exportRecord, publicKeyText }) => {
  const path = portableAgyAuthorshipExportPath("AGY-PUBLIC-1");
  assert.equal(readPortableAgyAuthorshipExport({ root, taskId: "AGY-PUBLIC-1", commit }).code,
    "agy-export-missing");
  assert.equal(verifyCommit(commit, gitDeps({ repoRoot: root })).classification,
    "agy-portable-export-required");
  const valid = verifyPortableAgyAuthorshipExport({ exportRecord, taskId: "AGY-PUBLIC-1",
    commit, tree, parent, changedPaths: ["file.txt"],
    trustAnchors: [{ keyReference: "fixture-po", publicKeySha256: sha(publicKeyText) }] });
  assert.equal(valid.ok, true);
  const altered = structuredClone(exportRecord);
  altered.subject.model = "other-model";
  assert.equal(verifyPortableAgyAuthorshipExport({ exportRecord: altered, taskId: "AGY-PUBLIC-1",
    commit, tree, parent, changedPaths: ["file.txt"],
    trustAnchors: [{ keyReference: "fixture-po", publicKeySha256: sha(publicKeyText) }] }).ok, false);
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), `${canonical(exportRecord)}\n`);
  git(root, "add", path);
  git(root, "commit", "-qm", "publish signed Agy authorship export");
  writeFileSync(join(root, path), `${canonical(altered)}\n`);
  assert.equal(readPortableAgyAuthorshipExport({ root, taskId: "AGY-PUBLIC-1", commit }).code,
    "agy-export-committed-bytes-differ");
  assert.equal(verifyCommit(commit, gitDeps({ repoRoot: root })).classification,
    "agy-portable-export-invalid");
  assert.notEqual(readFileSync(join(root, path), "utf8"), `${canonical(exportRecord)}\n`);
}));

test("PAE03 producer refuses an absent private local authorship PASS and unsafe task id", async () => {
  await fixture(async ({ root }) => {
    const result = await preparePortableAgyAuthorshipExport({ root, taskId: "AGY-PUBLIC-1" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "agy-export-record-invalid");
  });
  assert.throws(() => portableAgyAuthorshipExportPath("../outside"));
});

test("PAE04 a signed but unanchored model claim cannot gain portable authority", () => fixture(({ root, commit, exportRecord }) => {
  const { publicKey: roguePublic, privateKey: roguePrivate } = generateKeyPairSync("ed25519");
  const rogueKey = roguePublic.export({ type: "spki", format: "pem" }).toString();
  const forged = structuredClone(exportRecord);
  forged.proof.publicKey = rogueKey;
  forged.proof.signatureBase64 = sign(null, Buffer.from(forged.approvalIntent.sha256, "utf8"),
    roguePrivate).toString("base64");
  const path = portableAgyAuthorshipExportPath("AGY-PUBLIC-1");
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), `${canonical(forged)}\n`);
  git(root, "add", path);
  git(root, "commit", "-qm", "publish unanchored Agy export");
  const checked = readPortableAgyAuthorshipExport({ root, taskId: "AGY-PUBLIC-1", commit });
  assert.equal(checked.ok, false);
  assert.equal(verifyCommit(commit, gitDeps({ repoRoot: root })).classification,
    "agy-portable-export-invalid");
}));

test("PAE05 a committed v4 record uses only its exact signed export in a fresh clone", () => fixture(({ root, commit, exportRecord, privateKey }) => {
  const taskId = "AGY-PUBLIC-1";
  const report = { text: "Done.", changedFiles: ["file.txt"] };
  const record = validateDispatchRecord({
    schema: "pipeline.dispatch-record.v4", taskId, agentType: "goldfish-implementor",
    runner: "antigravity", model: exportRecord.subject.model, effort: "high",
    rulesetSha: exportRecord.subject.routePolicySha256, dispatcher: "Elephant", candidateCommit: commit,
    resultSha256: sha(report.text), outcome: "completed",
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" },
    commits: [commit], log: [], report,
    criticRequired: { schema: CRITIC_REQUIRED_SCHEMA,
      trigger: { schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 2, riskClass: "low", riskFlag: true,
        diff: { mechanical: false, architecture: false, guardrails: false, security: false } },
      appliedRow: "T3" },
  });
  const recordBytes = agyAuthoredRecordBytes(record);
  const signed = structuredClone(exportRecord);
  signed.subject.recordSha256 = sha(recordBytes);
  signed.subject.reportSha256 = record.resultSha256;
  signed.approvalIntent = portableAgyAuthorshipIntent(signed.subject);
  signed.proof.intentSha256 = signed.approvalIntent.sha256;
  signed.proof.signatureBase64 = sign(null, Buffer.from(signed.approvalIntent.sha256, "utf8"),
    privateKey).toString("base64");
  const exportPath = portableAgyAuthorshipExportPath(taskId);
  const recordPath = `evidence/dispatch-record-${taskId}.json`;
  mkdirSync(dirname(join(root, exportPath)), { recursive: true });
  mkdirSync(dirname(join(root, recordPath)), { recursive: true });
  writeFileSync(join(root, recordPath), recordBytes);
  const mismatched = structuredClone(signed);
  mismatched.subject.model = "other-signed-model";
  mismatched.approvalIntent = portableAgyAuthorshipIntent(mismatched.subject);
  mismatched.proof.intentSha256 = mismatched.approvalIntent.sha256;
  mismatched.proof.signatureBase64 = sign(null, Buffer.from(mismatched.approvalIntent.sha256, "utf8"),
    privateKey).toString("base64");
  writeFileSync(join(root, exportPath), `${canonical(mismatched)}\n`);
  git(root, "add", recordPath, exportPath);
  git(root, "commit", "-qm", "publish inconsistent signed Agy export");
  assert.equal(readPortableAgyAuthorshipExport({ root, taskId, commit, record }).code,
    "agy-export-record-binding-failed");
  writeFileSync(join(root, exportPath), `${canonical(signed)}\n`);
  git(root, "add", exportPath);
  git(root, "commit", "-qm", "correct signed Agy export");
  const cloneParent = mkdtempSync(join(tmpdir(), "portable-agy-record-clone-"));
  try {
    const clone = join(cloneParent, "checkout");
    const copied = spawnSync("git", ["clone", "-q", root, clone], { encoding: "utf8", shell: false });
    assert.equal(copied.status, 0, copied.stderr);
    const verdict = verifyCommit(commit, gitDeps({ repoRoot: clone }));
    assert.equal(verdict.verdict, VERDICT.pass, JSON.stringify(verdict));
    assert.equal(verdict.modelCheck.classification, "host-observed-portable");
    const coverage = evaluateRepositoryCriticSkipCoverage({ root: clone });
    assert.equal(coverage.ok, true, JSON.stringify(coverage));
    const invalidAddendumPath = join(clone, criticDispositionAddendumPath(taskId));
    writeFileSync(invalidAddendumPath, '{"schema":"invalid"}\n');
    assert.notEqual(verifyCommit(commit, gitDeps({ repoRoot: clone })).verdict, VERDICT.pass);
    assert.equal(evaluateRepositoryCriticSkipCoverage({ root: clone }).ok, false);
    rmSync(invalidAddendumPath);
    writeFileSync(join(clone, recordPath), `${recordBytes.toString("utf8")} `);
    assert.notEqual(verifyCommit(commit, gitDeps({ repoRoot: clone })).verdict, VERDICT.pass);
    assert.equal(evaluateRepositoryCriticSkipCoverage({ root: clone }).ok, false);
  } finally { rmSync(cloneParent, { recursive: true, force: true }); }
}));
