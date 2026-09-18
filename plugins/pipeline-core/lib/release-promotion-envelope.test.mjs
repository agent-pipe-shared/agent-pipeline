#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  isRecordOnlyPath,
  createReleasePromotionEnvelope,
  validateReleasePromotionEnvelope,
  RELEASE_PROMOTION_SCHEMA,
  MODE_INCLUSION_RULE,
} from "./release-promotion-envelope.mjs";
import { planVerifySelection } from "./verify-selection.mjs";

test("isRecordOnlyPath allowlist checks", () => {
  assert.equal(isRecordOnlyPath("evidence/verify-latest.json"), true);
  assert.equal(isRecordOnlyPath("backlog/evidence/2026-09-18-closure.md"), true);
  assert.equal(isRecordOnlyPath("specs/sprint-nova-epic/evidence/critic.md"), true);
  assert.equal(isRecordOnlyPath("specs/sprint-nova-epic/lifecycle.json"), true);
  assert.equal(isRecordOnlyPath("specs/sprint-nova-epic/result.md"), true);
  assert.equal(isRecordOnlyPath("backlog/STATUS.md"), true);
  assert.equal(isRecordOnlyPath("backlog/index.json"), true);
  assert.equal(isRecordOnlyPath("backlog/transitions.ndjson"), true);
  assert.equal(isRecordOnlyPath("backlog/items/2026-09-17-test.md"), true);
  assert.equal(isRecordOnlyPath("backlog/PO-TOPICS.md"), true);
  assert.equal(isRecordOnlyPath("docs/state.md"), true);
  assert.equal(isRecordOnlyPath(".claude/pipeline-state.json"), true);
  assert.equal(isRecordOnlyPath("project/pipeline-state.json"), true);

  // Non-allowlisted paths
  assert.equal(isRecordOnlyPath("plugins/pipeline-core/lib/foo.mjs"), false);
  assert.equal(isRecordOnlyPath("src/index.js"), false);
  assert.equal(isRecordOnlyPath("package.json"), false);
  assert.equal(isRecordOnlyPath("README.md"), false);
  assert.equal(isRecordOnlyPath("harness/scripts/verify.mjs"), false);
});

function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

test("release promotion envelope lifecycle and adversarial matrix", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "rel-promo-test-"));
  try {
    git(tempDir, ["init"]);
    git(tempDir, ["config", "user.name", "Test"]);
    git(tempDir, ["config", "user.email", "test@example.com"]);

    // Create initial commit
    mkdirSync(join(tempDir, "src"), { recursive: true });
    writeFileSync(join(tempDir, "src/code.mjs"), "export const x = 1;\n", "utf8");
    git(tempDir, ["add", "src/code.mjs"]);
    git(tempDir, ["commit", "-m", "feat: initial commit"]);
    const commitS = git(tempDir, ["rev-parse", "HEAD"]);

    // Plan full release verify on S
    const policy = {
      schema: "pipeline.verify-selection.v1",
      baseline: ["baseline"],
      areas: [
        { id: "source", paths: ["src/**"], suites: ["source-test"] },
      ],
    };
    const selection = planVerifySelection({
      mode: "release",
      candidateCommit: commitS,
      registeredSuiteIds: ["baseline", "source-test"],
      policy,
      changedPaths: ["src/code.mjs"],
    });
    const verifyEvidence = {
      commit: commitS,
      exitCode: 0,
      selection,
    };
    const securityEvidence = {
      commit: commitS,
      exitCode: 0,
    };

    // Create record-only commit R modifying backlog/STATUS.md and evidence/verify-latest.json
    mkdirSync(join(tempDir, "backlog"), { recursive: true });
    mkdirSync(join(tempDir, "evidence"), { recursive: true });
    writeFileSync(join(tempDir, "backlog/STATUS.md"), "# Status\n", "utf8");
    writeFileSync(join(tempDir, "evidence/verify-latest.json"), "{}", "utf8");
    git(tempDir, ["add", "backlog/STATUS.md", "evidence/verify-latest.json"]);
    git(tempDir, ["commit", "-m", "docs(backlog): record evidence"]);
    const commitR = git(tempDir, ["rev-parse", "HEAD"]);

    // 1. Valid S -> R promotion
    const created = createReleasePromotionEnvelope({
      repoDir: tempDir,
      sourceCommit: commitS,
      recordCommit: commitR,
      verifyEvidence,
      securityEvidence,
    });
    assert.equal(created.ok, true);
    assert.equal(created.envelope.schema, RELEASE_PROMOTION_SCHEMA);
    assert.equal(created.envelope.source.commit, commitS);
    assert.equal(created.envelope.record.commit, commitR);
    assert.equal(created.envelope.modeInclusion.rule, MODE_INCLUSION_RULE);

    // Validate for push boundary
    const validation = validateReleasePromotionEnvelope(created.envelope, {
      repoDir: tempDir,
      targetBoundary: "push",
    });
    assert.equal(validation.ok, true);
    assert.equal(validation.sourceCommit, commitS);
    assert.equal(validation.recordCommit, commitR);

    // 2. Adversarial case: reverse reuse (push to release)
    const reverse = validateReleasePromotionEnvelope(created.envelope, {
      repoDir: tempDir,
      targetBoundary: "release",
    });
    assert.equal(reverse.ok, false);
    assert.equal(reverse.reason, "reverse-inclusion-forbidden");

    // 3. Adversarial case: tampered envelope digest
    const tampered = validateReleasePromotionEnvelope({
      ...created.envelope,
      envelopeSha256: "0".repeat(64),
    }, {
      repoDir: tempDir,
      targetBoundary: "push",
    });
    assert.equal(tampered.ok, false);
    assert.equal(tampered.reason, "tampered-envelope");

    // 4. Adversarial case: S == R
    const same = createReleasePromotionEnvelope({
      repoDir: tempDir,
      sourceCommit: commitS,
      recordCommit: commitS,
      verifyEvidence,
      securityEvidence,
    });
    assert.equal(same.ok, false);
    assert.equal(same.reason, "source-equals-record");

    // 5. Adversarial case: R -> S (not an ancestor)
    const backwards = createReleasePromotionEnvelope({
      repoDir: tempDir,
      sourceCommit: commitR,
      recordCommit: commitS,
      verifyEvidence: { ...verifyEvidence, commit: commitR, selection: { ...selection, candidateCommit: commitR } },
      securityEvidence: { ...securityEvidence, commit: commitR },
    });
    assert.equal(backwards.ok, false);
    assert.equal(backwards.reason, "source-not-ancestor-of-record");

    // 6. Adversarial case: unallowlisted source change in delta
    writeFileSync(join(tempDir, "src/code.mjs"), "export const x = 2;\n", "utf8");
    git(tempDir, ["add", "src/code.mjs"]);
    git(tempDir, ["commit", "-m", "fix: altered source file"]);
    const commitR2 = git(tempDir, ["rev-parse", "HEAD"]);

    const unallowlisted = createReleasePromotionEnvelope({
      repoDir: tempDir,
      sourceCommit: commitS,
      recordCommit: commitR2,
      verifyEvidence,
      securityEvidence,
    });
    assert.equal(unallowlisted.ok, false);
    assert.equal(unallowlisted.reason, "unallowlisted-record-delta");
    assert.equal(unallowlisted.path, "src/code.mjs");

    // 7. Adversarial case: non-release verify evidence (e.g. push mode)
    const pushSel = planVerifySelection({
      mode: "push",
      candidateCommit: commitS,
      registeredSuiteIds: ["baseline", "source-test"],
      policy,
      changedPaths: ["src/code.mjs"],
    });
    const nonRelease = createReleasePromotionEnvelope({
      repoDir: tempDir,
      sourceCommit: commitS,
      recordCommit: commitR,
      verifyEvidence: { commit: commitS, exitCode: 0, selection: pushSel },
      securityEvidence,
    });
    assert.equal(nonRelease.ok, false);
    assert.equal(nonRelease.reason, "verify-evidence-not-full-release");

    // 8. Adversarial case: verify evidence for wrong commit
    const wrongCommit = createReleasePromotionEnvelope({
      repoDir: tempDir,
      sourceCommit: commitS,
      recordCommit: commitR,
      verifyEvidence: { commit: commitR, exitCode: 0, selection },
      securityEvidence,
    });
    assert.equal(wrongCommit.ok, false);
    assert.equal(wrongCommit.reason, "invalid-verify-evidence");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
