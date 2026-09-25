// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { portableAgyAuthorshipExportPath, portableAgyAuthorshipIntent,
  readPortableAgyAuthorshipExport, PORTABLE_AGY_AUTHORSHIP_SUBJECT_SCHEMA } from "../lib/portable-agy-authorship-export.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";
import { publishExclusiveAgyExportArtifact, runPortableAgyAuthorshipExport } from "./portable-agy-authorship-export.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
async function temporaryFixture(run) {
  const root = mkdtempSync(join(tmpdir(), "agy-export-request-publication-"));
  try { return await run(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("PAX01 export publication is exclusive and preserves its first exact bytes", () => temporaryFixture((root) => {
  const target = join(root, "export.json");
  const bytes = Buffer.from('{"proof":"first"}\n');
  publishExclusiveAgyExportArtifact(target, bytes, 0o644);
  assert.deepEqual(readFileSync(target), bytes);
  assert.throws(() => publishExclusiveAgyExportArtifact(target, Buffer.from('{"proof":"second"}\n'), 0o644));
  assert.deepEqual(readFileSync(target), bytes);
}));

test("PAX02 existing target and parent aliases cannot redirect a signed export", () => temporaryFixture((root) => {
  const outside = join(root, "outside.json");
  writeFileSync(outside, "outside\n");
  const alias = join(root, "export.json");
  symlinkSync(outside, alias);
  assert.throws(() => publishExclusiveAgyExportArtifact(alias, Buffer.from("new\n"), 0o644));
  assert.equal(readFileSync(outside, "utf8"), "outside\n");
  const realDir = join(root, "real");
  mkdirSync(realDir);
  symlinkSync(realDir, join(root, "alias"));
  assert.throws(() => publishExclusiveAgyExportArtifact(join(root, "alias", "export.json"),
    Buffer.from("new\n"), 0o644));
}));

test("PAX03 an absent local Agy record cannot create a signature request", () => temporaryFixture(async (root) => {
  git(root, "init", "-q");
  const result = await runPortableAgyAuthorshipExport([
    "prepare", "--root", root, "--task-id", "AGY-ABSENT-1",
  ]);
  assert.deepEqual(result, { ok: false, code: "agy-export-record-invalid" });
  assert.equal(existsSync(join(root, "scratch")), false);
}));

test("PAX04 a test-key proof publishes once and passes committed clone readback", () => temporaryFixture(async (root) => {
  git(root, "init", "-q");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "commit.gpgsign", "false");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyText = publicKey.export({ type: "spki", format: "pem" }).toString();
  mkdirSync(join(root, "project"));
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
    "Dispatch: AGY-PAX-1 (goldfish)\nAgy-Host-Observed: v1\nAI-Assisted: true");
  const authoredCommit = git(root, "rev-parse", "HEAD");
  const subject = {
    schema: PORTABLE_AGY_AUTHORSHIP_SUBJECT_SCHEMA, purpose: "portable-agy-authorship",
    taskId: "AGY-PAX-1", runner: "antigravity", model: "gemini-observed", effort: "high",
    candidateCommit: parent, authoredCommit, authoredTree: git(root, "rev-parse", "HEAD^{tree}"),
    parentCommit: parent, changedPaths: ["file.txt"], routePolicySha256: "a".repeat(64),
    consentSubjectSha256: "b".repeat(64), consentRecordSha256: "c".repeat(64),
    resultSha256: "d".repeat(64), reportSha256: "e".repeat(64),
    recordSha256: "f".repeat(64), hostReceiptSha256: "1".repeat(64), localVerdict: "bound",
  };
  const approvalIntent = portableAgyAuthorshipIntent(subject);
  const prepared = { ok: true, path: portableAgyAuthorshipExportPath(subject.taskId),
    subject, approvalIntent };
  const args = ["prepare", "--root", root, "--task-id", subject.taskId];
  const dependencies = { prepare: async () => prepared };
  const request = await runPortableAgyAuthorshipExport(args, dependencies);
  assert.equal(request.ok, true, JSON.stringify(request));
  assert.equal(request.intentSha256, approvalIntent.sha256);
  const requestBytes = readFileSync(request.requestPath);
  assert.deepEqual(await runPortableAgyAuthorshipExport(args, dependencies), request);
  assert.deepEqual(readFileSync(request.requestPath), requestBytes);
  assert.deepEqual(await runPortableAgyAuthorshipExport(["check", ...args.slice(1)], dependencies), {
    ok: true, code: "AGY-EXPORT-LOCAL-PASS-BOUND",
    requestPath: request.requestPath, intentSha256: approvalIntent.sha256,
  });
  writeFileSync(request.requestPath, requestBytes.toString("utf8").replace("gemini-observed", "forged-model"));
  assert.equal((await runPortableAgyAuthorshipExport(args, dependencies)).code,
    "AGY-EXPORT-REQUEST-DRIFT");
  assert.match(readFileSync(request.requestPath, "utf8"), /forged-model/u);
  assert.equal((await runPortableAgyAuthorshipExport(["check", ...args.slice(1)], dependencies)).code,
    "AGY-EXPORT-REQUEST-DRIFT");
  writeFileSync(request.requestPath, requestBytes);
  const proof = { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: approvalIntent.sha256,
    keyReference: "fixture-po", publicKey: publicKeyText,
    signatureBase64: sign(null, Buffer.from(approvalIntent.sha256, "utf8"), privateKey).toString("base64") };
  const proofPath = join(root, "scratch", `agy-authorship-export-proof-${sha(subject.taskId)}.json`);
  writeFileSync(proofPath, `${JSON.stringify({ ...proof, signatureBase64: Buffer.alloc(64).toString("base64") })}\n`);
  const rejected = await runPortableAgyAuthorshipExport(["publish", ...args.slice(1)], dependencies);
  assert.deepEqual(rejected, { ok: false, code: "AGY-EXPORT-PROOF-INVALID" });
  assert.equal(existsSync(join(root, prepared.path)), false);
  writeFileSync(proofPath, `${JSON.stringify(proof)}\n`);
  const published = await runPortableAgyAuthorshipExport(["publish", ...args.slice(1)], dependencies);
  assert.equal(published.ok, true, JSON.stringify(published));
  assert.equal(published.code, "AGY-EXPORT-PUBLISHED-UNCOMMITTED");
  const exportBytes = readFileSync(join(root, prepared.path));
  const repeat = await runPortableAgyAuthorshipExport(["publish", ...args.slice(1)], dependencies);
  assert.equal(repeat.code, "AGY-EXPORT-ALREADY-PUBLISHED");
  assert.deepEqual(readFileSync(join(root, prepared.path)), exportBytes);
  writeFileSync(join(root, prepared.path), `${exportBytes.toString("utf8")} `);
  assert.equal((await runPortableAgyAuthorshipExport(["publish", ...args.slice(1)], dependencies)).code,
    "AGY-EXPORT-PUBLICATION-DRIFT");
  writeFileSync(join(root, prepared.path), exportBytes);
  git(root, "add", prepared.path);
  git(root, "commit", "-qm", "publish signed Agy export");
  const cloneParent = mkdtempSync(join(tmpdir(), "agy-export-clone-"));
  try {
    const clone = join(cloneParent, "checkout");
    const copied = spawnSync("git", ["clone", "-q", root, clone], { encoding: "utf8", shell: false });
    assert.equal(copied.status, 0, copied.stderr);
    const checked = readPortableAgyAuthorshipExport({ root: clone, taskId: subject.taskId,
      commit: authoredCommit });
    assert.equal(checked.ok, true, JSON.stringify(checked));
    assert.equal(checked.authority, "host-observed-portable");
  } finally { rmSync(cloneParent, { recursive: true, force: true }); }
}));
