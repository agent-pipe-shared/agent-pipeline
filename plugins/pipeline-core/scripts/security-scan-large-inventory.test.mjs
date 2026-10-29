#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * security-scan-large-inventory.test.mjs -- pin for the candidate-identity buffer defect.
 *
 * THE DEFECT. `observeCandidate` reads the tracked-input inventory with `git ls-tree -r -z
 * --full-tree HEAD` through a spawn without `maxBuffer`. Node's default is 1 MiB; a repository whose
 * inventory is larger loses its stdout, the read reports null, and the whole candidate becomes
 * `git-identity-unavailable` -- a typed uncertainty that has nothing to do with the repository's
 * state. This repository's own inventory (about 1.9 MB) is in that class.
 *
 * The fixture commits enough long-named tracked files that the inventory is provably over 1 MiB,
 * then scans the clean tree. Only the license-check scanner runs (pure Node file reads).
 *
 * Run:   node --test plugins/pipeline-core/scripts/security-scan-large-inventory.test.mjs
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { runSecurityScan } from "./security-scan.mjs";

const MANIFEST = `schema: pipeline.manifest.v0

gates:
  security:
    mode: blocking
    type: automated

security:
  scanners:
    gitleaks:
      enabled: false
    osv-scanner:
      enabled: false
    semgrep:
      enabled: false
    license-check:
      enabled: true
`;

const BULK_FILES = 5000;
const LONG_NAME = "n".repeat(200);

function git(rootDir, args, input) {
  const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8", shell: false, input, maxBuffer: 1 << 28 });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function makeLargeInventoryFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "security-scan-large-inventory-test-"));
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  writeFileSync(join(rootDir, ".claude", "pipeline.yaml"), MANIFEST);
  writeFileSync(join(rootDir, ".claude", "pipeline.json"), JSON.stringify({ project: "security-fixture" }));
  const policiesDir = join(rootDir, "governance", "examples", "policies");
  mkdirSync(policiesDir, { recursive: true });
  writeFileSync(join(policiesDir, "license-allowlist.json"), JSON.stringify({ allow: ["MIT"], deny: ["GPL-3.0"] }));
  writeFileSync(join(rootDir, "third-party-licenses.json"), JSON.stringify({ dependencies: [{ name: "fixture-dependency", license: "MIT" }] }));
  git(rootDir, ["init", "-q"]);
  git(rootDir, ["config", "user.name", "Security Fixture"]);
  git(rootDir, ["config", "user.email", "security-fixture@example.invalid"]);
  git(rootDir, ["config", "commit.gpgsign", "false"]);
  git(rootDir, ["remote", "add", "origin", "https://example.invalid/pipeline/security-fixture.git"]);
  git(rootDir, ["add", "-A"]);
  const blob = git(rootDir, ["hash-object", "-w", "--stdin"], "bulk\n");
  const lines = [];
  for (let i = 0; i < BULK_FILES; i += 1) lines.push(`100644 ${blob}\tbulk/${String(i).padStart(5, "0")}-${LONG_NAME}`);
  git(rootDir, ["update-index", "--add", "--index-info"], `${lines.join("\n")}\n`);
  git(rootDir, ["commit", "-qm", "large inventory fixture"]);
  git(rootDir, ["checkout-index", "-a", "-f"]);
  return {
    rootDir,
    headCommit: git(rootDir, ["rev-parse", "HEAD"]),
    headTree: git(rootDir, ["rev-parse", "HEAD^{tree}"]),
  };
}

test("an inventory over the 1 MiB default spawn buffer still binds the candidate commit and tree", async () => {
  const fx = makeLargeInventoryFixture();
  try {
    const probe = spawnSync("git", ["ls-tree", "-r", "-z", "--full-tree", "HEAD"], { cwd: fx.rootDir, encoding: "buffer", maxBuffer: 1 << 28 });
    assert.equal(probe.status, 0);
    assert.ok(probe.stdout.length > 1024 * 1024, `fixture validity: inventory is ${probe.stdout.length} bytes, must exceed 1 MiB`);
    assert.equal(git(fx.rootDir, ["status", "--porcelain=v1", "--untracked-files=all"]), "", "fixture validity: tree is clean");

    const { evidence, exitCode } = await runSecurityScan({ rootDir: fx.rootDir, env: {}, timeoutMs: 60000 });
    assert.deepEqual({
      exitCode,
      candidateStatus: evidence.candidate.status,
      commit: evidence.candidate.commit,
      tree: evidence.candidate.tree,
      scanners: evidence.scanners.map((s) => ({ tool: s.tool, status: s.status, findingCount: s.findingCount })),
    }, {
      exitCode: 0,
      candidateStatus: "clean",
      commit: fx.headCommit,
      tree: fx.headTree,
      scanners: [{ tool: "license-check", status: "PASS", findingCount: 0 }],
    });
  } finally {
    rmSync(fx.rootDir, { recursive: true, force: true });
  }
});
