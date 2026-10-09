#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * security-scan-snapshot.test.mjs -- TR-I-T pins for toil row T32 (TOILRES slice TR-I,
 * specs/sprint-alfred-epic/design/toil-resolution-2026-10-08.md section 2 row T32, section 5 row 12).
 *
 * THE ROW. `security-scan.mjs` refuses a dirty working tree (`working-tree-not-clean`), so while
 * parallel dispatches leave the shared checkout dirty no agent can run the scan its DoD names.
 * Ruled resolution: scan a snapshot of HEAD (mechanism ruled: `git archive`) and record its tree
 * id; the dirty-tree refusal stays for shared-tree mode. This file pins the observable contract
 * only. It deliberately pins neither the snapshot method label nor `verifiedBeforeAfter`: a
 * `git archive` extract is not a repository, so `observeCandidate` cannot verify it the way it
 * verifies the detached worktree, and how the implementer binds identity there is its design.
 *
 * ASSUMPTIONS (the ruling fixes none of these spellings; the implementer may rename them and then
 * re-point the pins, but must not weaken what they assert):
 *   1. The mode is selected by one option key on `runSecurityScan`: `scanMode`, with the values
 *      "snapshot" (scan HEAD from an archive snapshot) and "shared-tree" (today's behaviour). The
 *      pins are made at the `runSecurityScan` option level, not at the CLI, because the CLI's
 *      `parseArgs` throws on an unknown flag, which would be a different RED than the missing mode.
 *   2. In snapshot mode `evidence.candidate.commit` and `evidence.candidate.tree` carry HEAD's
 *      commit id and `HEAD^{tree}` id. `candidate.tree` already equals `HEAD^{tree}` on today's
 *      dirty-refusal path, so that field alone proves nothing; the pins prove the scan ran on
 *      HEAD's BYTES through the license-check verdict instead.
 *   3. The scan leaves the caller's dirty worktree exactly as it found it.
 *   4. The existing default-mode dirty refusal is already pinned in security-scan.test.mjs
 *      ("runner: dirty Git candidate is rejected before a mutable scan"). The "shared-tree" case
 *      below passes the explicit key and so also guards that the new key cannot weaken it.
 *
 * NO real scanner binaries: gitleaks, osv-scanner and semgrep are disabled by the fixture
 * manifest; only license-check (pure Node file reads) runs. Every input it reads is COMMITTED,
 * because the adapter reads them from the scan root.
 *
 * PER-PIN STATE ON THE TREE THIS FILE WAS WRITTEN AGAINST:
 *   - "control: clean tree ..."            GREEN (fixture validity; today's detached-worktree path)
 *   - "T32 pin 1a ..." and "T32 pin 1b"    RED   (no snapshot mode exists; scanMode is not read, so
 *                                                 the dirty tree is refused: exit 2, scanner ERROR)
 *   - "T32 pin 2 ..."                      GREEN (the "shared-tree" key is not read yet and falls
 *                                                 through to the default refusal; it guards the
 *                                                 kept behaviour once the fix lands)
 *
 * Run:   node --test plugins/pipeline-core/scripts/security-scan-snapshot.test.mjs
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const MIT = { dependencies: [{ name: "fixture-dependency", license: "MIT" }] };
const GPL = { dependencies: [{ name: "fixture-dependency", license: "GPL-3.0" }] };

function git(rootDir, ...args) {
  const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function declaredPath(rootDir) {
  return join(rootDir, "third-party-licenses.json");
}

/**
 * A Git fixture whose COMMITTED state declares `committed` licenses against an allowlist that
 * allows MIT and denies GPL-3.0. When `dirty` is given, the declared file is then rewritten in the
 * working tree only (never staged), leaving a dirty shared tree whose bytes disagree with HEAD.
 */
function makeFixture({ committed, dirty = null }) {
  const rootDir = mkdtempSync(join(tmpdir(), "security-scan-snapshot-test-"));
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  writeFileSync(join(rootDir, ".claude", "pipeline.yaml"), MANIFEST);
  writeFileSync(join(rootDir, ".claude", "pipeline.json"), JSON.stringify({ project: "security-fixture" }));
  const policiesDir = join(rootDir, "governance", "examples", "policies");
  mkdirSync(policiesDir, { recursive: true });
  writeFileSync(join(policiesDir, "license-allowlist.json"), JSON.stringify({ allow: ["MIT"], deny: ["GPL-3.0"] }));
  writeFileSync(declaredPath(rootDir), JSON.stringify(committed));
  git(rootDir, "init", "-q");
  git(rootDir, "config", "user.name", "Security Fixture");
  git(rootDir, "config", "user.email", "security-fixture@example.invalid");
  git(rootDir, "config", "commit.gpgsign", "false");
  git(rootDir, "remote", "add", "origin", "https://example.invalid/pipeline/security-fixture.git");
  git(rootDir, "add", "-A");
  git(rootDir, "commit", "-qm", "security fixture");
  const dirtyBytes = dirty === null ? null : JSON.stringify(dirty);
  if (dirtyBytes !== null) writeFileSync(declaredPath(rootDir), dirtyBytes);
  return {
    rootDir,
    dirtyBytes,
    headCommit: git(rootDir, "rev-parse", "HEAD"),
    headTree: git(rootDir, "rev-parse", "HEAD^{tree}"),
  };
}

function summarize({ evidence, exitCode }) {
  return {
    exitCode,
    scanners: evidence.scanners.map((s) => ({ tool: s.tool, status: s.status, findingCount: s.findingCount })),
    commit: evidence.candidate.commit,
    tree: evidence.candidate.tree,
  };
}

async function scan(rootDir, extra = {}) {
  return runSecurityScan({ rootDir, env: {}, timeoutMs: 20000, ...extra });
}

test("control: clean tree, default mode scans HEAD and passes (fixture validity, GREEN today)", async () => {
  const fx = makeFixture({ committed: MIT });
  try {
    const result = await scan(fx.rootDir);
    assert.deepEqual(summarize(result), {
      exitCode: 0,
      scanners: [{ tool: "license-check", status: "PASS", findingCount: 0 }],
      commit: fx.headCommit,
      tree: fx.headTree,
    });
  } finally {
    rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test("T32 pin 1a (RED): snapshot mode scans HEAD's committed bytes on a dirty tree and binds HEAD's commit and tree", async () => {
  // HEAD declares MIT (allowed). The working tree is rewritten to GPL-3.0 (denied) and never
  // committed. A scan of HEAD passes; a scan of the working tree would report a finding; today's
  // refusal reports a scanner ERROR. Only the first matches the expectation below.
  const fx = makeFixture({ committed: MIT, dirty: GPL });
  try {
    const result = await scan(fx.rootDir, { scanMode: "snapshot" });
    assert.deepEqual(summarize(result), {
      exitCode: 0,
      scanners: [{ tool: "license-check", status: "PASS", findingCount: 0 }],
      commit: fx.headCommit,
      tree: fx.headTree,
    });
    assert.equal(readFileSync(declaredPath(fx.rootDir), "utf8"), fx.dirtyBytes, "the scan must leave the caller's dirty worktree untouched");
  } finally {
    rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test("T32 pin 1b (RED): snapshot mode reports the finding HEAD carries even when the dirty tree 'fixes' it", async () => {
  // The mirror of pin 1a, so that neither "skip everything and pass" nor "read the working tree"
  // can satisfy both. HEAD declares GPL-3.0 (denied); the uncommitted worktree says MIT.
  const fx = makeFixture({ committed: GPL, dirty: MIT });
  try {
    const result = await scan(fx.rootDir, { scanMode: "snapshot" });
    assert.deepEqual(summarize(result), {
      exitCode: 2,
      scanners: [{ tool: "license-check", status: "FINDINGS", findingCount: 1 }],
      commit: fx.headCommit,
      tree: fx.headTree,
    });
    assert.equal(readFileSync(declaredPath(fx.rootDir), "utf8"), fx.dirtyBytes, "the scan must leave the caller's dirty worktree untouched");
  } finally {
    rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test("T32 pin 2 (GREEN today, guards the kept behaviour): shared-tree mode still refuses a dirty tree", async () => {
  const fx = makeFixture({ committed: MIT, dirty: GPL });
  try {
    const { evidence, exitCode } = await scan(fx.rootDir, { scanMode: "shared-tree" });
    assert.deepEqual({
      exitCode,
      candidateStatus: evidence.candidate.status,
      candidateReason: evidence.candidate.reason,
      scanners: evidence.scanners.map((s) => ({ tool: s.tool, status: s.status, classification: s.classification, reason: s.reason })),
    }, {
      exitCode: 2,
      candidateStatus: "dirty",
      candidateReason: "working-tree-not-clean",
      scanners: [{ tool: "license-check", status: "ERROR", classification: "candidate_snapshot", reason: "working-tree-not-clean" }],
    });
    assert.equal(readFileSync(declaredPath(fx.rootDir), "utf8"), fx.dirtyBytes, "the refusal must leave the caller's dirty worktree untouched");
  } finally {
    rmSync(fx.rootDir, { recursive: true, force: true });
  }
});
