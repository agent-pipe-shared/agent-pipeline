#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalDetachedTarget } from "../lib/worktree-lifecycle.mjs";
import { main } from "./clean-candidate-run.mjs";

const KNOWN_ARTIFACTS = [
  "evidence/verify-latest.json",
  "evidence/security-latest.json",
  "evidence/security-latest.v2.json",
  "evidence/security-latest.v2.verdict.json",
];

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result;
}

function makeFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "ccr-fixture-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, "add", "README.md");
  git(root, "commit", "-q", "-m", "initial");
  return root;
}

// A stand-in for a real cleanliness-gated command: it writes all four known
// evidence artifacts into its own CWD (the worktree, once spawned there),
// tagged with a marker so the test can prove exactly what landed back in
// the primary tree came from this run and not from a stale file.
function fakeCommandSource(marker) {
  return `
const fs = require("node:fs");
const path = require("node:path");
function w(rel, value) {
  const target = path.join(process.cwd(), rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value));
}
w("evidence/verify-latest.json", { artifact: "verify-latest", marker: "${marker}" });
w("evidence/security-latest.json", { artifact: "security-latest", marker: "${marker}" });
w("evidence/security-latest.v2.json", { artifact: "security-latest.v2", marker: "${marker}" });
w("evidence/security-latest.v2.verdict.json", { artifact: "security-latest.v2.verdict", marker: "${marker}" });
`;
}

function noOnboardingGate() {
  // The real project-onboarding readiness gate requires full project
  // calibration state this throwaway fixture repo never has; it is
  // orthogonal to the worktree-lifecycle behavior under test here, so it is
  // the one dependency this suite stubs -- everything else (worktree
  // creation, the target-command spawn, the artifact copy, and the
  // teardown) runs through the real, unmocked implementation.
  return () => {};
}

test("clean-candidate-run copies the complete artifact set back and leaves no worktree registered", () => {
  const repo = makeFixtureRepo();
  try {
    const marker = "run-a";
    const exitCode = main(
      ["--repo", repo, "--oid", "HEAD", "--purpose", "test-run", "--runner", "claude", "--", process.execPath, "-e", fakeCommandSource(marker)],
      { ...process.env, CLAUDECODE: "1" },
      { requireProjectOnboardingReadyFn: noOnboardingGate(), writeFn: () => {} },
    );
    assert.equal(exitCode, 0);

    for (const relative of KNOWN_ARTIFACTS) {
      const destination = join(repo, relative);
      assert.ok(existsSync(destination), `${relative} was not copied back`);
      const parsed = JSON.parse(readFileSync(destination, "utf8"));
      assert.equal(parsed.marker, marker, `${relative} does not carry this run's marker`);
    }

    const headOid = git(repo, "rev-parse", "HEAD").stdout.trim();
    const mapping = canonicalDetachedTarget(repo, "test-run", headOid);
    assert.equal(existsSync(mapping.target), false, "the worktree directory itself must be gone");
    const listed = git(repo, "worktree", "list", "--porcelain").stdout;
    assert.equal(listed.includes(mapping.target), false, "git worktree list must not still register the removed worktree");
    // Only the primary checkout itself may remain registered.
    const worktreeCount = listed.split("\n\n").filter((block) => block.trim() !== "").length;
    assert.equal(worktreeCount, 1, "no worktree besides the primary checkout may remain registered");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("clean-candidate-run does not copy artifacts the command never produced", () => {
  const repo = makeFixtureRepo();
  try {
    const partialSource = `
const fs = require("node:fs");
const path = require("node:path");
const target = path.join(process.cwd(), "evidence", "verify-latest.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify({ artifact: "verify-latest", marker: "partial" }));
`;
    const exitCode = main(
      ["--repo", repo, "--oid", "HEAD", "--purpose", "test-partial", "--runner", "claude", "--", process.execPath, "-e", partialSource],
      { ...process.env, CLAUDECODE: "1" },
      { requireProjectOnboardingReadyFn: noOnboardingGate(), writeFn: () => {} },
    );
    assert.equal(exitCode, 0);
    assert.ok(existsSync(join(repo, "evidence/verify-latest.json")));
    assert.equal(existsSync(join(repo, "evidence/security-latest.json")), false);
    assert.equal(existsSync(join(repo, "evidence/security-latest.v2.json")), false);
    assert.equal(existsSync(join(repo, "evidence/security-latest.v2.verdict.json")), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("clean-candidate-run reuses a pre-existing worktree at the identical canonical target and still removes it", () => {
  const repo = makeFixtureRepo();
  try {
    const headOid = git(repo, "rev-parse", "HEAD").stdout.trim();
    const mapping = canonicalDetachedTarget(repo, "reuse-run", headOid);
    git(repo, "worktree", "add", "-q", "--detach", mapping.target, headOid);
    assert.ok(existsSync(mapping.target), "fixture precondition: the worktree must pre-exist before the reuse call");

    const marker = "reused";
    const exitCode = main(
      ["--repo", repo, "--oid", "HEAD", "--purpose", "reuse-run", "--runner", "claude", "--", process.execPath, "-e", fakeCommandSource(marker)],
      { ...process.env, CLAUDECODE: "1" },
      { requireProjectOnboardingReadyFn: noOnboardingGate(), writeFn: () => {} },
    );
    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(readFileSync(join(repo, "evidence/verify-latest.json"), "utf8")).marker, marker);
    assert.equal(existsSync(mapping.target), false, "the reused worktree must still be removed afterward");
    const listed = git(repo, "worktree", "list", "--porcelain").stdout;
    assert.equal(listed.includes(mapping.target), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
