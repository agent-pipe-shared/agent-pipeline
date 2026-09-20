#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-push-promotion.test.mjs — Coverage for guard-push.mjs release promotion envelope handling.
 *
 * SIBLING FILE, NOT AN EDIT TO guard-push.test.mjs -- guard-push.test.mjs is rule TP-5.
 * This companion test suite verifies that guard-push accepts record-only commits
 * with valid release-promotion envelopes and rejects invalid/tampered envelopes.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test as nodeTest } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { planVerifySelection } from "../lib/verify-selection.mjs";
import { createReleasePromotionEnvelope, SECURITY_EVIDENCE_DEFAULT_PATH } from "../lib/release-promotion-envelope.mjs";
const GUARD = fileURLToPath(new URL("./guard-push.mjs", import.meta.url));

function freshRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `guard-push-promo-${prefix}-`));
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  for (const args of [
    ["init", "-q", "-b", "feature-1"],
    ["config", "user.email", "goldfish@example.invalid"],
    ["config", "user.name", "Goldfish"],
  ]) assert.equal(git(...args).status, 0, `fixture git ${args[0]} failed`);
  writeFileSync(join(dir, "README.md"), "fixture\n");
  assert.equal(git("add", "README.md").status, 0, "fixture git add failed");
  assert.equal(git("commit", "-q", "-m", "init").status, 0, "fixture git commit failed");
  return dir;
}

function gitAt(dir, ...args) {
  return spawnSync("git", args, { cwd: dir, encoding: "utf8" });
}

function writeFile(dir, relPath, body) {
  const full = join(dir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, typeof body === "string" ? body : JSON.stringify(body));
}

function exactSecurityInput(dir, commit, marker = "") {
  const tree = gitAt(dir, "rev-parse", `${commit}^{tree}`).stdout.trim();
  const data = { schema: "pipeline.security-evidence.v1", exitCode: 0, candidate: { status: "clean", commit, tree }, marker };
  return { path: SECURITY_EVIDENCE_DEFAULT_PATH, raw: JSON.stringify(data), data };
}

function runGuard(cmd, repoDir) {
  return spawnSync(process.execPath, [GUARD], {
    cwd: repoDir,
    input: JSON.stringify({ tool_input: { command: cmd } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: repoDir },
  });
}

nodeTest("valid promotion envelope allows record-only commit", () => {
      const dir = freshRepo("allow");
      try {
        const commitSResult = gitAt(dir, "rev-parse", "HEAD");
        assert.equal(commitSResult.status, 0, "fixture source commit lookup failed");
        const commitS = commitSResult.stdout.trim();
        writeFile(dir, ".claude/pipeline.yaml", "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: standing-approved\n");

        // Commit R modifying only backlog/STATUS.md
        writeFile(dir, "backlog/STATUS.md", "# Status\n");
        assert.equal(gitAt(dir, "add", "backlog/STATUS.md").status, 0, "fixture record git add failed");
        assert.equal(gitAt(dir, "commit", "-q", "-m", "docs(backlog): update status").status, 0, "fixture record git commit failed");
        const commitRResult = gitAt(dir, "rev-parse", "HEAD");
        assert.equal(commitRResult.status, 0, "fixture record commit lookup failed");
        const commitR = commitRResult.stdout.trim();

        const releaseSel = planVerifySelection({
          mode: "release",
          candidateCommit: commitS,
          registeredSuiteIds: ["suite-a"],
          policy: { schema: "pipeline.verify-selection.v1", baseline: [], areas: [{ id: "doc", paths: ["README.md"], suites: ["suite-a"] }] },
          changedPaths: ["README.md"],
        });
        const verifyEvidence = { exitCode: 0, commit: commitS, selection: releaseSel };
        writeFile(dir, "evidence/verify-latest.json", verifyEvidence);
        const securityEvidence = exactSecurityInput(dir, commitS);
        writeFile(dir, SECURITY_EVIDENCE_DEFAULT_PATH, securityEvidence.raw);

        const envelopeResult = createReleasePromotionEnvelope({
          repoDir: dir,
          sourceCommit: commitS,
          recordCommit: commitR,
          verifyEvidence,
          securityEvidence,
        });
        assert.equal(envelopeResult.ok, true);
        writeFile(dir, "evidence/release-promotion-latest.json", envelopeResult.envelope);

        const res = runGuard("git push origin feature-1:refs/heads/feature-1", dir);
        assert.equal(res.status, 0, `Expected allow (exit 0), got ${res.status}: ${res.stderr}`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
});

nodeTest("tampered promotion envelope is rejected", () => {
      const dir = freshRepo("tampered");
      try {
        const commitSResult = gitAt(dir, "rev-parse", "HEAD");
        assert.equal(commitSResult.status, 0, "fixture source commit lookup failed");
        const commitS = commitSResult.stdout.trim();
        writeFile(dir, ".claude/pipeline.yaml", "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: standing-approved\n");
        writeFile(dir, "backlog/STATUS.md", "# Status\n");
        assert.equal(gitAt(dir, "add", "backlog/STATUS.md").status, 0, "fixture record git add failed");
        assert.equal(gitAt(dir, "commit", "-q", "-m", "docs(backlog): update status").status, 0, "fixture record git commit failed");
        const commitRResult = gitAt(dir, "rev-parse", "HEAD");
        assert.equal(commitRResult.status, 0, "fixture record commit lookup failed");
        const commitR = commitRResult.stdout.trim();

        const releaseSel = planVerifySelection({
          mode: "release",
          candidateCommit: commitS,
          registeredSuiteIds: ["suite-a"],
          policy: { schema: "pipeline.verify-selection.v1", baseline: [], areas: [{ id: "doc", paths: ["README.md"], suites: ["suite-a"] }] },
          changedPaths: ["README.md"],
        });
        const verifyEvidence = { exitCode: 0, commit: commitS, selection: releaseSel };
        writeFile(dir, "evidence/verify-latest.json", verifyEvidence);
        const securityEvidence = exactSecurityInput(dir, commitS);
        writeFile(dir, SECURITY_EVIDENCE_DEFAULT_PATH, securityEvidence.raw);
        const envelopeResult = createReleasePromotionEnvelope({ repoDir: dir, sourceCommit: commitS, recordCommit: commitR, verifyEvidence, securityEvidence });
        assert.equal(envelopeResult.ok, true);
        writeFile(dir, "evidence/release-promotion-latest.json", { ...envelopeResult.envelope, envelopeSha256: "0".repeat(64) });
        const resTampered = runGuard("git push origin feature-1:refs/heads/feature-1", dir);
        assert.equal(resTampered.status, 2, `Expected block (exit 2), got ${resTampered.status}`);
        assert.match(resTampered.stderr, /is stale/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
});

nodeTest("promotion rejects a substituted canonical Security file even when its JSON still has the same candidate", () => {
  const dir = freshRepo("security-byte-substitution");
  try {
    const commitS = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
    writeFile(dir, ".claude/pipeline.yaml", "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: standing-approved\n");
    writeFile(dir, "backlog/STATUS.md", "# Status\n");
    assert.equal(gitAt(dir, "add", "backlog/STATUS.md").status, 0);
    assert.equal(gitAt(dir, "commit", "-q", "-m", "docs: record").status, 0);
    const commitR = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
    const selection = planVerifySelection({ mode: "release", candidateCommit: commitS, registeredSuiteIds: ["suite-a"], policy: { schema: "pipeline.verify-selection.v1", baseline: [], areas: [{ id: "doc", paths: ["README.md"], suites: ["suite-a"] }] }, changedPaths: ["README.md"] });
    const verifyEvidence = { exitCode: 0, commit: commitS, selection };
    const securityEvidence = exactSecurityInput(dir, commitS, "original");
    const envelope = createReleasePromotionEnvelope({ repoDir: dir, sourceCommit: commitS, recordCommit: commitR, verifyEvidence, securityEvidence });
    assert.equal(envelope.ok, true);
    writeFile(dir, "evidence/verify-latest.json", verifyEvidence);
    // Same semantic candidate, distinct bytes: only the post-envelope source changed.
    writeFile(dir, SECURITY_EVIDENCE_DEFAULT_PATH, `${securityEvidence.raw}\n`);
    writeFile(dir, "evidence/release-promotion-latest.json", envelope.envelope);
    const result = runGuard("git push origin feature-1:refs/heads/feature-1", dir);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /stale/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

nodeTest("push-mode Verify cannot substitute for the release record bound by the envelope", () => {
  const dir = freshRepo("mode-substitution");
  try {
    const commitS = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
    writeFile(dir, ".claude/pipeline.yaml", "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: standing-approved\n");
    writeFile(dir, "backlog/STATUS.md", "# Status\n");
    assert.equal(gitAt(dir, "add", "backlog/STATUS.md").status, 0);
    assert.equal(gitAt(dir, "commit", "-q", "-m", "docs: record").status, 0);
    const commitR = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
    const inputs = { candidateCommit: commitS, registeredSuiteIds: ["suite-a"], policy: { schema: "pipeline.verify-selection.v1", baseline: [], areas: [{ id: "doc", paths: ["README.md"], suites: ["suite-a"] }] }, changedPaths: ["README.md"] };
    const releaseEvidence = { exitCode: 0, commit: commitS, selection: planVerifySelection({ ...inputs, mode: "release" }) };
    const pushEvidence = { exitCode: 0, commit: commitS, selection: planVerifySelection({ ...inputs, mode: "push" }) };
    const securityEvidence = exactSecurityInput(dir, commitS);
    const envelope = createReleasePromotionEnvelope({ repoDir: dir, sourceCommit: commitS, recordCommit: commitR, verifyEvidence: releaseEvidence, securityEvidence });
    assert.equal(envelope.ok, true);
    writeFile(dir, "evidence/verify-latest.json", pushEvidence);
    writeFile(dir, SECURITY_EVIDENCE_DEFAULT_PATH, securityEvidence.raw);
    writeFile(dir, "evidence/release-promotion-latest.json", envelope.envelope);
    const result = runGuard("git push origin feature-1:refs/heads/feature-1", dir);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /stale/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
