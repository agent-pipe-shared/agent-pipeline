#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalDetachedTarget } from "../lib/worktree-lifecycle.mjs";
import { verifyEvidenceFixture } from "../lib/verify-selection-fixture.mjs";
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
  writeFileSync(join(root, ".gitignore"), "/evidence/\n");
  git(root, "add", "README.md", ".gitignore");
  git(root, "commit", "-q", "-m", "initial");
  return root;
}

function writePushEvidence(root, commit, tree, { commitOverride = commit } = {}) {
  const evidence = verifyEvidenceFixture(commitOverride, "push");
  evidence.tree = tree;
  evidence.candidate = {
    start: { status: "clean", commit: commitOverride, tree },
    finish: { status: "clean", commit: commitOverride, tree },
    binding: "exact",
  };
  const path = join(root, "evidence", "verify-latest.json");
  mkdirSync(join(root, "evidence"), { recursive: true });
  writeFileSync(path, JSON.stringify(evidence));
}

function installPushInitProbe(root) {
  const script = join(root, "scripts", "push-init.mjs");
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(script, `
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const root = args[args.indexOf("--root") + 1];
const report = {
  cwd: process.cwd(),
  root,
  candidate: args[args.indexOf("--candidate") + 1],
  recordRef: args[args.indexOf("--record-ref") + 1],
  verify: JSON.parse(fs.readFileSync(path.join(root, "evidence", "verify-latest.json"), "utf8")),
};
fs.writeFileSync(process.env.CCR_PUSH_INIT_REPORT, JSON.stringify(report));
`);
  git(root, "add", "scripts/push-init.mjs");
  git(root, "commit", "-q", "-m", "add push-init probe");
  return script;
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

test("clean-candidate-run seeds exact push evidence and preserves the d93 substantive candidate plus 955 ledger-head refs", () => {
  const repo = makeFixtureRepo();
  const reportPath = join(repo, "push-init-report.json");
  try {
    const script = installPushInitProbe(repo);
    const head = git(repo, "rev-parse", "HEAD").stdout.trim();
    const tree = git(repo, "rev-parse", "HEAD^{tree}").stdout.trim();
    writePushEvidence(repo, head, tree);

    const substantive = "d93f2011c9f816fb4e203f5cf3afde5b2f91cf2f";
    const ledgerHead = "955d83f36ee60d602622c6c67996050fddf45862";
    const exitCode = main(
      [
        "--repo", repo, "--oid", "HEAD", "--purpose", "push-init-handoff", "--runner", "claude", "--",
        process.execPath, script,
        "--root", repo, "--by", "Fixture", "--remote", "origin", "--destination", "refs/heads/release",
        "--base", "base-ref", "--candidate", substantive, "--record-ref", ledgerHead,
      ],
      { ...process.env, CLAUDECODE: "1", CCR_PUSH_INIT_REPORT: reportPath },
      { requireProjectOnboardingReadyFn: noOnboardingGate(), writeFn: () => {} },
    );
    assert.equal(exitCode, 0);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.notEqual(report.root, repo, "the probe must observe the detached candidate, never the dirty primary checkout");
    assert.equal(report.cwd, report.root, "push-init runs in and reads from one detached candidate root");
    assert.equal(report.candidate, substantive, "the substantive candidate ref must not be rewritten to the reconciliation ledger head");
    assert.equal(report.recordRef, ledgerHead, "the later reconciliation ledger head must remain explicit");
    assert.equal(report.verify.commit, head, "only evidence bound to the detached candidate is seeded");
    assert.equal(report.verify.selection.mode, "push");
    assert.equal(existsSync(canonicalDetachedTarget(repo, "push-init-handoff", head).target), false, "the seeded candidate worktree must be removed");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("clean-candidate-run rejects stale primary Verify evidence before a push-init probe can run", () => {
  const repo = makeFixtureRepo();
  const reportPath = join(repo, "must-not-exist.json");
  try {
    const script = installPushInitProbe(repo);
    const head = git(repo, "rev-parse", "HEAD").stdout.trim();
    const tree = git(repo, "rev-parse", "HEAD^{tree}").stdout.trim();
    writePushEvidence(repo, head, tree, { commitOverride: "0".repeat(40) });
    assert.throws(() => main(
      [
        "--repo", repo, "--oid", "HEAD", "--purpose", "push-init-stale", "--runner", "claude", "--",
        process.execPath, script,
        "--root", repo, "--by", "Fixture", "--remote", "origin", "--destination", "refs/heads/release",
      ],
      { ...process.env, CLAUDECODE: "1", CCR_PUSH_INIT_REPORT: reportPath },
      { requireProjectOnboardingReadyFn: noOnboardingGate(), writeFn: () => {} },
    ), (error) => error?.code === "CCR-VERIFY-EVIDENCE-MISMATCH");
    assert.equal(existsSync(reportPath), false, "a stale evidence input must prevent command execution");
    assert.equal(existsSync(canonicalDetachedTarget(repo, "push-init-stale", head).target), false, "a rejected handoff still cleans its worktree");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("clean-candidate-run rejects a symlinked primary evidence input before a push-init probe can run", () => {
  const repo = makeFixtureRepo();
  const reportPath = join(repo, "must-not-run-symlink.json");
  try {
    const script = installPushInitProbe(repo);
    const head = git(repo, "rev-parse", "HEAD").stdout.trim();
    const tree = git(repo, "rev-parse", "HEAD^{tree}").stdout.trim();
    writePushEvidence(repo, head, tree);
    const evidencePath = join(repo, "evidence", "verify-latest.json");
    const heldPath = join(repo, "held-verify.json");
    writeFileSync(heldPath, readFileSync(evidencePath));
    rmSync(evidencePath);
    symlinkSync("../held-verify.json", evidencePath);
    assert.throws(() => main(
      [
        "--repo", repo, "--oid", "HEAD", "--purpose", "push-init-symlink", "--runner", "claude", "--",
        process.execPath, script,
        "--root", repo, "--by", "Fixture", "--remote", "origin", "--destination", "refs/heads/release",
      ],
      { ...process.env, CLAUDECODE: "1", CCR_PUSH_INIT_REPORT: reportPath },
      { requireProjectOnboardingReadyFn: noOnboardingGate(), writeFn: () => {} },
    ), (error) => error?.code === "CCR-EVIDENCE-UNTRUSTED");
    assert.equal(existsSync(reportPath), false, "a symlinked primary input must prevent command execution");
    assert.equal(existsSync(canonicalDetachedTarget(repo, "push-init-symlink", head).target), false, "a rejected symlink handoff still cleans its worktree");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
