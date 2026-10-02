// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
const completionCases = [];
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
import {
  applyQualityPackage, authorizeQualityPackageCommit, qualityPackageIntentSha256,
  SIGNED_QUALITY_PACKAGE_SCHEMA,
} from "../lib/signed-quality-package.mjs";

const FIXTURE_TMP = fileURLToPath(new URL("../../tmp/", import.meta.url));
const GUARD = fileURLToPath(new URL("./guard-git.mjs", import.meta.url));
mkdirSync(FIXTURE_TMP, { recursive: true });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

function fixture() {
  const root = mkdtempSync(join(FIXTURE_TMP, "guard-integration-main-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "Fixture"]);
  writeFileSync(join(root, "subject.txt"), "before\n");
  mkdirSync(join(root, "project"));
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [],
    trustAnchors: [{ keyReference: "fixture-key", publicKeySha256: sha(publicKey) }],
  }));
  git(root, ["add", "subject.txt", "project/critical-human-proof.json"]);
  git(root, ["commit", "-qm", "base"]);
  const worktree = join(FIXTURE_TMP, `guard-integration-wt-${process.pid}-${Date.now()}`);
  git(root, ["worktree", "add", "-q", "-b", "integration", worktree, "HEAD"]);
  const controller = createGovernanceScopeController({ hostStateRoot: join(root, "fixture-host-state") });
  const enroll = controller.planDecision({ rootDir: root, decision: "enroll", by: "disposable-integration-fixture" });
  controller.applyDecision(enroll, { activate: true, planSha256: enroll.planSha256 });
  const record = {
    schema: SIGNED_QUALITY_PACKAGE_SCHEMA,
    baseCommit: git(worktree, ["rev-parse", "HEAD"]),
    unifiedDiff: "diff --git a/subject.txt b/subject.txt\nindex df967b9..3e75765 100644\n--- a/subject.txt\n+++ b/subject.txt\n@@ -1 +1 @@\n-before\n+after\n",
    expectedDigests: { "subject.txt": sha("after\n") },
  };
  record.intentSha256 = qualityPackageIntentSha256(record);
  const proof = {
    schema: "pipeline.po-approval-proof.v1", intentSha256: record.intentSha256,
    keyReference: "fixture-key", publicKey,
    signatureBase64: sign(null, Buffer.from(record.intentSha256), keys.privateKey).toString("base64"),
  };
  return { root, worktree, record, proof, trustPolicy: { keyReference: "fixture-key", publicKeySha256: sha(publicKey) } };
}

function authorizeAndStage(item) {
  assert.equal(applyQualityPackage({ repoRoot: item.worktree, packageIntent: item.record, proof: item.proof, trustPolicy: item.trustPolicy, applyToMain: true }).ok, true);
  git(item.worktree, ["add", "subject.txt"]);
  assert.equal(authorizeQualityPackageCommit({ repoRoot: item.worktree, packageIntent: item.record, proof: item.proof }).ok, true);
}

function command(item) {
  return `git -C ${JSON.stringify(item.worktree)} commit -m "chore: integrate package" --trailer "Dispatch: quality-package-${item.record.intentSha256} (integration)" --trailer "AI-Assisted: true"`;
}

function runGuard(item) {
  const { PIPELINE_GUARD_OVERRIDE: _dropInherited, ...env } = process.env;
  const result = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_input: { command: command(item) } }),
    cwd: item.root,
    encoding: "utf8",
    env: { ...env, CLAUDE_PROJECT_DIR: item.root },
    timeout: 20000,
  });
  return { code: result.status, stderr: result.stderr ?? "" };
}

for (const policy of ["off", "warn"]) {
  completionCases.push({ id: "GSI" + String(completionCases.length + 1).padStart(3, "0"), name: `guard-git admits signed integration only after independent worktree verification with marker mode ${policy}`, run: () => {
    const item = fixture();
    try {
      mkdirSync(join(item.root, ".claude"), { recursive: true });
      writeFileSync(join(item.root, ".claude", "guard-config.json"), JSON.stringify({ commitTrailerPolicy: policy }));
      authorizeAndStage(item);
      const result = runGuard(item);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(git(item.worktree, ["rev-parse", "HEAD"]), item.record.baseCommit, "PreToolUse guard does not perform the commit");
    } finally {
      git(item.root, ["worktree", "remove", "--force", item.worktree]);
      rmSync(item.root, { recursive: true, force: true });
    }
  } });
}

for (const kind of ["missing-authorization", "wrong-intent", "forged-proof"]) {
  completionCases.push({ id: "GSI" + String(completionCases.length + 1).padStart(3, "0"), name: `guard-git refuses ${kind} even when ordinary marker policy is off`, run: () => {
    const item = fixture();
    try {
      mkdirSync(join(item.root, ".claude"), { recursive: true });
      writeFileSync(join(item.root, ".claude", "guard-config.json"), JSON.stringify({ commitTrailerPolicy: "off" }));
      authorizeAndStage(item);
      const common = git(item.worktree, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
      const authorization = join(common, "agent-pipeline", "signed-quality-packages", "commit-authorizations", `${item.record.intentSha256}.json`);
      if (kind === "missing-authorization") rmSync(authorization);
      if (kind === "forged-proof") {
        const value = JSON.parse(readFileSync(authorization, "utf8"));
        value.proof.signatureBase64 = "AA==";
        writeFileSync(authorization, JSON.stringify(value), { mode: 0o600 });
      }
      if (kind === "wrong-intent") item.record.intentSha256 = "f".repeat(64);
      const result = runGuard(item);
      assert.equal(result.code, 2, result.stderr);
      assert.match(result.stderr, /GIT-03-INTEGRATION-EVIDENCE-REQUIRED/u);
    } finally {
      git(item.root, ["worktree", "remove", "--force", item.worktree]);
      rmSync(item.root, { recursive: true, force: true });
    }
  } });
}

registerTestCaseCompletion({ cases: completionCases, fd: 3, maxBytes: 65536 });
