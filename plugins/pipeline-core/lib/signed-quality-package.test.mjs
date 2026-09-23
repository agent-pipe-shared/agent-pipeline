import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyQualityPackage, authorizeQualityPackageCommit, qualityPackageIntentSha256, SIGNED_QUALITY_PACKAGE_SCHEMA, verifyQualityPackageCommitAuthorization } from "./signed-quality-package.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "signed-quality-package-"));
  git(root, ["init", "-q"]); git(root, ["config", "user.email", "test@example.invalid"]); git(root, ["config", "user.name", "Test"]);
  const keys = generateKeyPairSync("ed25519"); const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  writeFileSync(join(root, "subject.txt"), "before\n");
  mkdirSync(join(root, "project"));
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [{ keyReference: "test-key", publicKeySha256: sha(publicKey) }] }));
  git(root, ["add", "subject.txt", "project/critical-human-proof.json"]); git(root, ["commit", "-qm", "base"]);
  const record = { schema: SIGNED_QUALITY_PACKAGE_SCHEMA, baseCommit: git(root, ["rev-parse", "HEAD"]), unifiedDiff: "diff --git a/subject.txt b/subject.txt\nindex df967b9..3e75765 100644\n--- a/subject.txt\n+++ b/subject.txt\n@@ -1 +1 @@\n-before\n+after\n", expectedDigests: { "subject.txt": sha("after\n") } };
  record.intentSha256 = qualityPackageIntentSha256(record);
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: record.intentSha256, keyReference: "test-key", publicKey, signatureBase64: sign(null, Buffer.from(record.intentSha256), keys.privateKey).toString("base64") };
  return { root, record, proof, publicKey, privateKey: keys.privateKey, trustPolicy: { keyReference: "test-key", publicKeySha256: sha(publicKey) } };
}

function proofFor(record, item) {
  return { schema: "pipeline.po-approval-proof.v1", intentSha256: record.intentSha256, keyReference: "test-key", publicKey: item.publicKey, signatureBase64: sign(null, Buffer.from(record.intentSha256), item.privateKey).toString("base64") };
}

test("quality package requires matching human proof and only applies verified bytes", () => {
  const item = fixture();
  try {
    assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: item.record, proof: item.proof, trustPolicy: item.trustPolicy }).code, "QUALITY-PACKAGE-VERIFIED");
    assert.equal(readFileSync(join(item.root, "subject.txt"), "utf8"), "before\n");
    assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: item.record, proof: item.proof, trustPolicy: item.trustPolicy, applyToMain: true }).code, "QUALITY-PACKAGE-APPLIED");
    assert.equal(readFileSync(join(item.root, "subject.txt"), "utf8"), "after\n");
  } finally { rmSync(item.root, { recursive: true, force: true }); }
});

test("quality package commit authorization binds the whole staged index and committed trust policy", () => {
  const item = fixture();
  try {
    assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: item.record, proof: item.proof, trustPolicy: item.trustPolicy, applyToMain: true }).ok, true);
    git(item.root, ["add", "subject.txt"]);
    assert.equal(authorizeQualityPackageCommit({ repoRoot: item.root, packageIntent: item.record, proof: item.proof }).code, "QUALITY-PACKAGE-COMMIT-AUTHORIZED");
    assert.equal(verifyQualityPackageCommitAuthorization({ repoRoot: item.root }).code, "QUALITY-PACKAGE-COMMIT-VERIFIED");
    assert.equal(authorizeQualityPackageCommit({ repoRoot: item.root, packageIntent: item.record, proof: item.proof }).code, "QUALITY-PACKAGE-COMMIT-AUTHORIZED");
    const commonDir = git(item.root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    const receiptPath = join(commonDir, "agent-pipeline", "signed-quality-packages", "commit-authorizations", `${item.record.intentSha256}.json`);
    writeFileSync(receiptPath, "{}\n", { mode: 0o600 });
    assert.equal(authorizeQualityPackageCommit({ repoRoot: item.root, packageIntent: item.record, proof: item.proof }).ok, false);
    writeFileSync(join(item.root, "extra.txt"), "extra\n"); git(item.root, ["add", "extra.txt"]);
    assert.equal(verifyQualityPackageCommitAuthorization({ repoRoot: item.root }).ok, false);
  } finally { rmSync(item.root, { recursive: true, force: true }); }
});

test("quality package refuses symlinked package outputs and receipt-directory ancestors", () => {
  const item = fixture();
  const outside = mkdtempSync(join(tmpdir(), "signed-quality-package-outside-"));
  try {
    symlinkSync("subject.txt", join(item.root, "link.txt"));
    git(item.root, ["add", "link.txt"]);
    const record = { schema: SIGNED_QUALITY_PACKAGE_SCHEMA, baseCommit: git(item.root, ["rev-parse", "HEAD"]), unifiedDiff: execFileSync("git", ["diff", "--cached", "--binary", "HEAD"], { cwd: item.root, encoding: "utf8" }), expectedDigests: { "link.txt": sha("subject.txt") } };
    record.intentSha256 = qualityPackageIntentSha256(record);
    const proof = proofFor(record, item);
    assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: record, proof, trustPolicy: item.trustPolicy }).code, "QUALITY-PACKAGE-READBACK-MISMATCH");
    assert.equal(authorizeQualityPackageCommit({ repoRoot: item.root, packageIntent: record, proof }).code, "QUALITY-PACKAGE-COMMIT-INDEX-MISMATCH");
    git(item.root, ["restore", "--staged", "--source=HEAD", "--", "link.txt"]);
    writeFileSync(join(item.root, "subject.txt"), "after\n"); git(item.root, ["add", "subject.txt"]);
    symlinkSync(outside, join(item.root, ".git", "agent-pipeline"), "dir");
    assert.equal(authorizeQualityPackageCommit({ repoRoot: item.root, packageIntent: item.record, proof: item.proof }).code, "QUALITY-PACKAGE-COMMIT-STORAGE-INVALID");
  } finally { rmSync(item.root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test("quality package fails closed on tamper, unsafe paths, proof failure, and base drift", () => {
  const item = fixture();
  try {
    assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: { ...item.record, unifiedDiff: item.record.unifiedDiff.replace("after", "other") }, proof: item.proof, trustPolicy: item.trustPolicy }).code, "QUALITY-PACKAGE-INVALID");
    const unsafe = { ...item.record, expectedDigests: { "../outside.txt": sha("after\n") } }; unsafe.intentSha256 = qualityPackageIntentSha256(unsafe);
    assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: unsafe, proof: item.proof, trustPolicy: item.trustPolicy }).code, "QUALITY-PACKAGE-INVALID");
    assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: item.record, proof: { ...item.proof, signatureBase64: "AA==" }, trustPolicy: item.trustPolicy }).ok, false);
    writeFileSync(join(item.root, "drift.txt"), "x\n"); git(item.root, ["add", "drift.txt"]); git(item.root, ["commit", "-qm", "drift"]);
    assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: item.record, proof: item.proof, trustPolicy: item.trustPolicy, applyToMain: true }).code, "QUALITY-PACKAGE-BASE-DRIFT");
  } finally { rmSync(item.root, { recursive: true, force: true }); }
});
