#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkGitignoreAnchoring,
  checkRepository,
  checkTopLevelDirectories,
  DEPTH_UNBOUNDED_GITIGNORE_PATTERNS,
  KNOWN_TOP_LEVEL_DIRS,
  parseGitignoreDirectoryPatterns,
} from "./check-directory-contract.mjs";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));

// ---- checkTopLevelDirectories -------------------------------------------------------

test("a file under a known top-level directory passes", () => {
  const findings = checkTopLevelDirectories(["docs/adr/0063-repository-directory-contract.md"]);
  assert.deepEqual(findings, []);
});

test("a root-level file with no directory component is not flagged", () => {
  const findings = checkTopLevelDirectories(["README.md", "CLAUDE.md"]);
  assert.deepEqual(findings, []);
});

test("a file under an undeclared top-level directory is one finding", () => {
  const findings = checkTopLevelDirectories(["notes/idea.md"], KNOWN_TOP_LEVEL_DIRS);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /^notes\/: top-level directory not named/u);
  assert.match(findings[0], /ADR-0063/u);
});

test("multiple files under one undeclared directory collapse to one finding with a count", () => {
  const findings = checkTopLevelDirectories(["tmp_stuff/a.txt", "tmp_stuff/b.txt", "tmp_stuff/c.txt"]);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /\(3 tracked files\)/u);
});

test("an undeclared directory with exactly one file uses singular phrasing", () => {
  const findings = checkTopLevelDirectories(["tmp_stuff/a.txt"]);
  assert.match(findings[0], /\(1 tracked file\)/u);
});

test("a custom knownDirs allowlist is honored", () => {
  const findings = checkTopLevelDirectories(["mine/a.txt"], { mine: "test-only allowlist entry" });
  assert.deepEqual(findings, []);
});

// ---- parseGitignoreDirectoryPatterns ------------------------------------------------

test("parseGitignoreDirectoryPatterns finds bare unanchored directory names", () => {
  const entries = parseGitignoreDirectoryPatterns("scratch/\n");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "scratch");
  assert.equal(entries[0].anchored, false);
  assert.equal(entries[0].line, 1);
});

test("parseGitignoreDirectoryPatterns recognizes a leading-slash anchor", () => {
  const entries = parseGitignoreDirectoryPatterns("/evidence/\n");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "evidence");
  assert.equal(entries[0].anchored, true);
});

test("parseGitignoreDirectoryPatterns skips patterns already anchored by an internal slash", () => {
  // git anchors any pattern containing a "/" other than a single trailing one to the
  // .gitignore's own directory regardless of a leading slash -- out of this check's scope.
  const entries = parseGitignoreDirectoryPatterns(".claude/worktrees/\n");
  assert.deepEqual(entries, []);
});

test("parseGitignoreDirectoryPatterns skips comments, blank lines, and negations", () => {
  const entries = parseGitignoreDirectoryPatterns("# comment\n\n!kept/\n");
  assert.deepEqual(entries, []);
});

test("parseGitignoreDirectoryPatterns skips wildcarded and file (non-directory) patterns", () => {
  const entries = parseGitignoreDirectoryPatterns("*.log\nfoo*/\n*.jsonl\n");
  assert.deepEqual(entries, []);
});

// ---- checkGitignoreAnchoring ---------------------------------------------------------

test("an unanchored bare directory pattern with no allowlist entry is a finding", () => {
  const findings = checkGitignoreAnchoring("scratch/\n", {});
  assert.equal(findings.length, 1);
  assert.match(findings[0], /^\.gitignore:1: "scratch\/" is an unanchored directory-name pattern/u);
});

test("an anchored bare directory pattern passes", () => {
  const findings = checkGitignoreAnchoring("/scratch/\n", {});
  assert.deepEqual(findings, []);
});

test("an allowlisted unanchored pattern passes and is marked used", () => {
  const findings = checkGitignoreAnchoring(".vscode/\n", { ".vscode/": "editor config, depth-unbounded by convention" });
  assert.deepEqual(findings, []);
});

test("a stale depth-unbounded allowlist entry (never matched) is itself a finding", () => {
  const findings = checkGitignoreAnchoring("/scratch/\n", { ".vscode/": "no longer present in .gitignore" });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /never matched an unanchored \.gitignore line/u);
});

test("every DEPTH_UNBOUNDED_GITIGNORE_PATTERNS entry carries a non-empty reason", () => {
  for (const [pattern, reason] of Object.entries(DEPTH_UNBOUNDED_GITIGNORE_PATTERNS)) {
    assert.ok(pattern.endsWith("/"), `${pattern} must be a directory pattern ending in "/"`);
    assert.equal(typeof reason, "string");
    assert.ok(reason.length >= 20, `reason for ${pattern} too short to be a real justification`);
  }
});

test("every KNOWN_TOP_LEVEL_DIRS entry carries a non-empty reason", () => {
  for (const [dir, reason] of Object.entries(KNOWN_TOP_LEVEL_DIRS)) {
    assert.equal(typeof dir, "string");
    assert.ok(!dir.includes("/"), `${dir} must be a single top-level path segment`);
    assert.equal(typeof reason, "string");
    assert.ok(reason.length >= 20, `reason for ${dir} too short to be a real justification`);
  }
});

// ---- checkRepository (fixture-driven) -------------------------------------------------

test("checkRepository combines both checks and sorts findings", () => {
  const { findings, stats } = checkRepository("/fixture-root", {
    files: ["docs/adr/0063-repository-directory-contract.md", "notes/idea.md"],
    knownDirs: KNOWN_TOP_LEVEL_DIRS,
    gitignoreText: "scratch/\n",
    depthUnboundedAllowlist: {},
  });
  assert.equal(findings.length, 2);
  assert.ok(findings.some((f) => f.startsWith(".gitignore:1:")));
  assert.ok(findings.some((f) => f.startsWith("notes/:")));
  assert.equal(stats.filesScanned, 2);
});

test("checkRepository reports nothing for a clean fixture", () => {
  const { findings } = checkRepository("/fixture-root", {
    files: ["docs/adr/0063-repository-directory-contract.md"],
    knownDirs: KNOWN_TOP_LEVEL_DIRS,
    gitignoreText: "/scratch/\n/evidence/\n.vscode/\n.idea/\n",
    depthUnboundedAllowlist: DEPTH_UNBOUNDED_GITIGNORE_PATTERNS,
  });
  assert.deepEqual(findings, []);
});

// ---- integration: the real repository, real .gitignore, real KNOWN_TOP_LEVEL_DIRS ----

test("the real repository passes this check today (regression guard for the ADR-0063 follow-up fix)", () => {
  const { findings } = checkRepository(REPO);
  assert.deepEqual(findings, [], JSON.stringify(findings, null, 2));
});

process.stdout.write("check-directory-contract: fixture and repository checks passed\n");
