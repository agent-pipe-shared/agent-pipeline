// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
const completionCases = [];
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
import {
  applyInstall, planInstall, renderImpl, renderShim,
} from "./commit-msg-hook-install.mjs";
import {
  applyQualityPackage, authorizeQualityPackageCommit, qualityPackageIntentSha256,
  SIGNED_QUALITY_PACKAGE_SCHEMA,
} from "../lib/signed-quality-package.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const PLUGIN_LIB_DIR = fileURLToPath(new URL("../lib", import.meta.url));
const FIXTURE_TMP = fileURLToPath(new URL("../../tmp/", import.meta.url));
mkdirSync(FIXTURE_TMP, { recursive: true });

function fixture() {
  const root = mkdtempSync(join(FIXTURE_TMP, "commit-msg-integration-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "Fixture"]);
  const hostStateRoot = join(root, '.git', 'fixture-host-state');
  const controller = createGovernanceScopeController({ hostStateRoot });
  const enrollment = controller.planDecision({ rootDir:root, decision:'enroll', by:'disposable-signed-integration-fixture' });
  assert.equal(controller.applyDecision(enrollment, {activate:true, planSha256:enrollment.planSha256}).state, 'active');
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  writeFileSync(join(root, "subject.txt"), "before\n");
  mkdirSync(join(root, "project"));
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [],
    trustAnchors: [{ keyReference: "fixture-key", publicKeySha256: sha(publicKey) }],
  }));
  git(root, ["add", "subject.txt", "project/critical-human-proof.json"]);
  git(root, ["commit", "-qm", "base"]);
  const record = {
    schema: SIGNED_QUALITY_PACKAGE_SCHEMA,
    baseCommit: git(root, ["rev-parse", "HEAD"]),
    unifiedDiff: "diff --git a/subject.txt b/subject.txt\nindex df967b9..3e75765 100644\n--- a/subject.txt\n+++ b/subject.txt\n@@ -1 +1 @@\n-before\n+after\n",
    expectedDigests: { "subject.txt": sha("after\n") },
  };
  record.intentSha256 = qualityPackageIntentSha256(record);
  const proof = {
    schema: "pipeline.po-approval-proof.v1", intentSha256: record.intentSha256,
    keyReference: "fixture-key", publicKey,
    signatureBase64: sign(null, Buffer.from(record.intentSha256), keys.privateKey).toString("base64"),
  };
  return { root, record, proof, privateKey: keys.privateKey, trustPolicy: { keyReference: "fixture-key", publicKeySha256: sha(publicKey) } };
}

function authorizeAndStage(item) {
  assert.equal(applyQualityPackage({ repoRoot: item.root, packageIntent: item.record, proof: item.proof, trustPolicy: item.trustPolicy, applyToMain: true }).ok, true);
  git(item.root, ["add", "subject.txt"]);
  assert.equal(authorizeQualityPackageCommit({ repoRoot: item.root, packageIntent: item.record, proof: item.proof }).ok, true);
}

function message(intent, ending = "") {
  return `chore: integrate reviewed package\n\nDispatch: quality-package-${intent} (integration)\nAI-Assisted: true\n${ending}`;
}

function install(item) {
  const plan = planInstall({rootDir:item.root, pluginLibDir:PLUGIN_LIB_DIR});
  assert.equal(plan.status, "ready");
  const installed = applyInstall({rootDir:item.root, pluginLibDir:PLUGIN_LIB_DIR});
  assert.equal(installed.status, "installed");
  assert.equal(existsSync(plan.hookPath), true);
  return {...plan, ...installed};
}

function attemptCommit(item, body) {
  const msg = join(item.root, "commit-message.txt");
  writeFileSync(msg, body);
  return spawnSync("git", ["commit", "-F", msg], { cwd: item.root, encoding: "utf8", shell: false, timeout: 20000 });
}

completionCases.push({ id: "CMSI" + String(completionCases.length + 1).padStart(3, "0"), name: "generated commit-msg hook admits the exact verified intent in a real Git commit", run: () => {
  const item = fixture();
  try {
    authorizeAndStage(item);
    const plan = install(item);
    const shim = readFileSync(plan.hookPath, "utf8");
    assert.equal(shim, renderShim(plan.implPath));
    const result = attemptCommit(item, message(item.record.intentSha256));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(item.root, ["show", "-s", "--format=%B", "HEAD"]), message(item.record.intentSha256).trimEnd());
  } finally { rmSync(item.root, { recursive: true, force: true }); }
} });

for (const kind of ["missing-authorization", "forged-signature", "wrong-intent", "malformed-trailer", "extended-trailer"]) {
  completionCases.push({ id: "CMSI" + String(completionCases.length + 1).padStart(3, "0"), name: `generated commit-msg hook refuses ${kind}`, run: () => {
    const item = fixture();
    try {
      authorizeAndStage(item);
      const plan = install(item);
      const common = git(item.root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
      const authorizationPath = join(common, "agent-pipeline", "signed-quality-packages", "commit-authorizations", `${item.record.intentSha256}.json`);
      if (kind === "missing-authorization") rmSync(authorizationPath);
      if (kind === "forged-signature") {
        const authorization = JSON.parse(readFileSync(authorizationPath, "utf8"));
        authorization.proof.signatureBase64 = "AA==";
        writeFileSync(authorizationPath, JSON.stringify(authorization), { mode: 0o600 });
      }
      const intent = kind === "wrong-intent" ? "f".repeat(64) : item.record.intentSha256;
      const extra = kind === "malformed-trailer" ? "Review: extra\n" : kind === "extended-trailer" ? "AI-Assisted: true\n" : "";
      const result = attemptCommit(item, message(intent, extra));
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stderr, /BLOCKED \(agent-pipeline commit-msg\)/u);
      assert.equal(git(item.root, ["rev-parse", "HEAD"]), item.record.baseCommit);
      assert.equal(existsSync(plan.implPath), true);
    } finally { rmSync(item.root, { recursive: true, force: true }); }
  } });
}

completionCases.push({ id: "CMSI" + String(completionCases.length + 1).padStart(3, "0"), name: "generated source is a self-contained Git boundary bound to the selected plugin library", run: () => {
  const generated = renderImpl(PLUGIN_LIB_DIR);
  assert.match(generated, /verifyQualityPackageIntegrationPreCommit/u);
  assert.match(generated, /finishedCommitMessageFindings/u);
  assert.match(generated, /messageSha256/u);
  assert.match(generated, /integrationAdmission/u);
} });

completionCases.push({ id: "CMSI" + String(completionCases.length + 1).padStart(3, "0"), name: "generated commit-msg hook preserves unconditional GIT-03 privacy refusal", run: () => {
  const item = fixture();
  try {
    authorizeAndStage(item);
    install(item);
    const result = attemptCommit(item, `${message(item.record.intentSha256)}\nCo-Authored-By: Codex <bot@openai.com>\nClaude-Session: https://claude.ai/code/session_01Fx\n`);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /GIT-03-PROVIDER-COAUTHOR/u);
    assert.match(result.stderr, /GIT-03-CORRELATION-TRAILER/u);
  } finally { rmSync(item.root, { recursive: true, force: true }); }
} });

completionCases.push({ id: "CMSI" + String(completionCases.length + 1).padStart(3, "0"), name: "generated commit-msg hook treats an unreadable finished message as blocking", run: () => {
  const item = fixture();
  try {
    const plan = install(item);
    const missing = join(item.root, "missing-message.txt");
    const result = spawnSync(process.execPath, [plan.implPath, missing], { cwd: item.root, encoding: "utf8", shell: false, timeout: 20000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /GIT-03-UNREADABLE-MESSAGE-FILE/u);
  } finally { rmSync(item.root, { recursive: true, force: true }); }
} });

registerTestCaseCompletion({ cases: completionCases, fd: 3, maxBytes: 65536 });
