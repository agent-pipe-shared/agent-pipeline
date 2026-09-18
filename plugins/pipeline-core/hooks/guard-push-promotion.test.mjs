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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { planVerifySelection } from "../lib/verify-selection.mjs";
import { createReleasePromotionEnvelope } from "../lib/release-promotion-envelope.mjs";

const GUARD = fileURLToPath(new URL("./guard-push.mjs", import.meta.url));
const ALL_DIRS = [];

function freshRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `guard-push-promo-${prefix}-`));
  ALL_DIRS.push(dir);
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "feature-1");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
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

function runGuard(cmd, repoDir) {
  return spawnSync(process.execPath, [GUARD], {
    cwd: repoDir,
    input: JSON.stringify({ tool_input: { command: cmd } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: repoDir },
  });
}

try {
  // Case 1: Valid promotion envelope allows record-only commit
  {
    const dir = freshRepo("allow");
    const commitS = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
    writeFile(dir, ".claude/pipeline.yaml", "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: standing-approved\n");

    // Commit R modifying only backlog/STATUS.md
    writeFile(dir, "backlog/STATUS.md", "# Status\n");
    gitAt(dir, "add", "backlog/STATUS.md");
    gitAt(dir, "commit", "-q", "-m", "docs(backlog): update status");
    const commitR = gitAt(dir, "rev-parse", "HEAD").stdout.trim();

    const releaseSel = planVerifySelection({
      mode: "release",
      candidateCommit: commitS,
      registeredSuiteIds: ["suite-a"],
      policy: { schema: "pipeline.verify-selection.v1", baseline: [], areas: [{ id: "doc", paths: ["README.md"], suites: ["suite-a"] }] },
      changedPaths: ["README.md"],
    });
    const verifyEvidence = { exitCode: 0, commit: commitS, selection: releaseSel };
    writeFile(dir, "evidence/verify-latest.json", verifyEvidence);

    const envelopeResult = createReleasePromotionEnvelope({
      repoDir: dir,
      sourceCommit: commitS,
      recordCommit: commitR,
      verifyEvidence,
    });
    assert.equal(envelopeResult.ok, true);
    writeFile(dir, "evidence/release-promotion-latest.json", envelopeResult.envelope);

    const res = runGuard("git push origin feature-1:refs/heads/feature-1", dir);
    assert.equal(res.status, 0, `Expected allow (exit 0), got ${res.status}: ${res.stderr}`);
    console.log("PASS  guard-push: valid promotion envelope allows record-only commit");

    // Case 2: Tampered envelope is rejected
    writeFile(dir, "evidence/release-promotion-latest.json", { ...envelopeResult.envelope, envelopeSha256: "0".repeat(64) });
    const resTampered = runGuard("git push origin feature-1:refs/heads/feature-1", dir);
    assert.equal(resTampered.status, 2, `Expected block (exit 2), got ${resTampered.status}`);
    assert.match(resTampered.stderr, /is stale/);
    console.log("PASS  guard-push: tampered promotion envelope is rejected");
  }

  console.log("guard-push-promotion: all tests passed");
} finally {
  for (const dir of ALL_DIRS) {
    rmSync(dir, { recursive: true, force: true });
  }
}
