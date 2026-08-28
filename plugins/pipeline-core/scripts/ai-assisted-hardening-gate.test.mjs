// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateAiHardeningGate, INDEPENDENT_CHECK_COMMANDS, runIndependentChecks } from "./ai-assisted-hardening-gate.mjs";

const GATE_SCRIPT_PATH = fileURLToPath(new URL("./ai-assisted-hardening-gate.mjs", import.meta.url));

/** A throwaway root holding one self-excluded check's own command file, with a
 * controllable exit code -- for `runIndependentChecks`/`verifySelfExcludedAtCandidate`
 * (private, exercised only through `runIndependentChecks`), never the real
 * ~1458-path repository. */
function selfExcludedFixtureRoot(relativeFilePath, exitCode) {
  const dir = mkdtempSync(path.join(tmpdir(), "aihg-fixture-"));
  const filePath = path.join(dir, relativeFilePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `#!/usr/bin/env node\nprocess.exit(${exitCode});\n`);
  return dir;
}

/** A real, tiny two-commit git repository -- for the CLI-level (`main()`)
 * reviewer-identity precedence repro below. Never the real repository. */
function twoCommitGitFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "aihg-cli-fixture-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "fixture", GIT_AUTHOR_EMAIL: "author@example.test", GIT_COMMITTER_NAME: "fixture", GIT_COMMITTER_EMAIL: "author@example.test" };
  const run = (args) => spawnSync("git", args, { cwd: dir, encoding: "utf8", env });
  run(["init", "--quiet", "--initial-branch=main"]);
  writeFileSync(path.join(dir, "README.md"), "before\n");
  run(["add", "-A"]);
  run(["commit", "--quiet", "-m", "base"]);
  writeFileSync(path.join(dir, "README.md"), "after\n");
  run(["add", "-A"]);
  run(["commit", "--quiet", "-m", "candidate"]);
  return dir;
}

test("candidate gate applies CYB-5 controls to delivery metadata", () => {
  const result = evaluateAiHardeningGate({
    changedPaths: [".github/workflows/verify.yml", "plugins/pipeline-core/hooks/guard.mjs"],
    authorId: "delivery-agent", reviewerId: "pipeline-critic", independentChecks: ["workflow", "guard"],
  });
  assert.equal(result.allowed, true);
  assert.equal(result.checks.input.authority, "none");
  assert.equal(result.checks.authority.allowed, true);
  assert.equal(result.checks.integrity.allowed, true);
  assert.equal(result.checks.review.required, true);
});

test("candidate gate rejects privileged untrusted CI and self-review", () => {
  const result = evaluateAiHardeningGate({
    changedPaths: [".github/workflows/verify.yml"], event: "pull_request", privileged: true,
    authorId: "delivery-agent", reviewerId: "delivery-agent", independentChecks: ["workflow"],
  });
  assert.equal(result.allowed, false);
  assert.equal(result.checks.review.code, "AIH-INDEPENDENT-REVIEW-REQUIRED");
  assert.equal(result.checks.ci.code, "AIH-CI-ISOLATION-REQUIRED");
});

test("candidate gate rejects a claimed independent check that has no receipt", () => {
  const result = evaluateAiHardeningGate({ changedPaths: [".github/workflows/verify.yml"] });
  assert.equal(result.allowed, false);
  assert.equal(result.checks.integrity.code, "AIH-INDEPENDENT-CHECK-MISSING");
});

// --- F3 (Re-Critic vtpgate2-368458af): no test previously named
// `runIndependentChecks` or `verifySelfExcludedAtCandidate` (private, only
// reachable through `runIndependentChecks`), so the wiring that decides
// whether the self-excluded candidate-suite-and-review path is even reached
// was unverified. These exercise it against a real, tiny temporary
// git-repository-adjacent fixture (a directory holding the self-excluded
// check's own command file with a controllable exit code) -- never the real
// ~1458-path repository (Forbidden: at most two runs against that window).
test("runIndependentChecks: a self-excluded guard check counts through the candidate suite when the reviewer source is the repository variable", () => {
  const file = INDEPENDENT_CHECK_COMMANDS.guard;
  const repoRoot = selfExcludedFixtureRoot(file, 0);
  try {
    const result = runIndependentChecks(repoRoot, [file], null, {
      reviewerId: "reviewer-b", authorId: "author-a", reviewerSource: "repository-variable",
    });
    assert.deepEqual(result, ["guard"]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
test("runIndependentChecks: the same self-excluded guard check stays missing when the reviewer source is a cli argument", () => {
  const file = INDEPENDENT_CHECK_COMMANDS.guard;
  const repoRoot = selfExcludedFixtureRoot(file, 0);
  try {
    const result = runIndependentChecks(repoRoot, [file], null, {
      reviewerId: "reviewer-b", authorId: "author-a", reviewerSource: "cli-argument",
    });
    assert.deepEqual(result, []);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
test("runIndependentChecks: the same self-excluded guard check stays missing when no reviewer source is supplied at all (closes the precedence hole at the wiring layer)", () => {
  const file = INDEPENDENT_CHECK_COMMANDS.guard;
  const repoRoot = selfExcludedFixtureRoot(file, 0);
  try {
    const result = runIndependentChecks(repoRoot, [file], null, { reviewerId: "reviewer-b", authorId: "author-a" });
    assert.deepEqual(result, []);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
test("runIndependentChecks: a self-excluded guard check stays missing when the candidate-revision suite itself fails, regardless of reviewer source", () => {
  const file = INDEPENDENT_CHECK_COMMANDS.guard;
  const repoRoot = selfExcludedFixtureRoot(file, 1);
  try {
    const result = runIndependentChecks(repoRoot, [file], null, {
      reviewerId: "reviewer-b", authorId: "author-a", reviewerSource: "repository-variable",
    });
    assert.deepEqual(result, []);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

// --- BUGFIX repro (Re-Critic vtpgate2-368458af F1, `ai-assisted-hardening-
// gate.mjs:169`): `main()` gave `--reviewer-id` precedence over
// `PIPELINE_SECURITY_REVIEWER_ID`, so the author of a candidate could name
// their own "outside reviewer" via the flag and override the admin-controlled
// repository variable outright -- even when that variable already correctly
// named the author themselves (i.e. no real review at all). This stays in the
// suite as permanent regression coverage (bugfix module: "repro stays in the
// suite"). RED before the fix: `main()` neither resolves nor emits
// `reviewerIdentity`, so `parsed.reviewerIdentity` is `undefined` and this
// throws. GREEN after: the resolved identity is the trusted, admin-controlled
// environment value, never the flag.
test("BUGFIX repro: the CLI's emitted reviewerIdentity is the repository variable, never the --reviewer-id flag, even when the flag names a distinct identity", () => {
  const repoRoot = twoCommitGitFixture();
  try {
    const result = spawnSync(process.execPath, [
      GATE_SCRIPT_PATH,
      "--repo-root", repoRoot,
      "--author-id", "admin-reviewer",
      "--reviewer-id", "outside-flag",
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, PIPELINE_SECURITY_REVIEWER_ID: "admin-reviewer" },
    });
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.reviewerIdentity.source, "repository-variable");
    assert.equal(parsed.reviewerIdentity.id, "admin-reviewer");
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
test("the CLI falls back to the cli-argument source when no repository variable is present", () => {
  const repoRoot = twoCommitGitFixture();
  try {
    const env = { ...process.env };
    delete env.PIPELINE_SECURITY_REVIEWER_ID;
    const result = spawnSync(process.execPath, [
      GATE_SCRIPT_PATH,
      "--repo-root", repoRoot,
      "--author-id", "author-a",
      "--reviewer-id", "reviewer-b",
    ], { cwd: repoRoot, encoding: "utf8", env });
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.reviewerIdentity.source, "cli-argument");
    assert.equal(parsed.reviewerIdentity.id, "reviewer-b");
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
