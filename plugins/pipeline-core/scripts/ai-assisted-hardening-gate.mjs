#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Candidate-bound admission gate for AI-assisted delivery work.
 *
 * The gate deliberately performs no publication and grants no authority. It
 * turns the CYB-5 controls into an executable Verify/CI boundary over the
 * candidate's actual changed-path set.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  classifyInput,
  evaluateChangeIntegrity,
  evaluateCiAuthority,
  evaluateSelfExcludedCheck,
  routeSecurityReview,
  validateEvidenceHygiene,
  validateTaskAuthority,
} from "../lib/ai-assisted-hardening.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const AI_HARDENING_GATE_SCHEMA = "pipeline.ai-assisted-hardening-gate.v1";
export const INDEPENDENT_CHECK_COMMANDS = Object.freeze({
  scope: "harness/scripts/check-doc-contracts.mjs",
  test: "plugins/pipeline-core/lib/ai-assisted-hardening.test.mjs",
  guard: "plugins/pipeline-core/hooks/guard-git.test.mjs",
  policy: "harness/scripts/validate-manifest.mjs",
  dependency: "plugins/pipeline-core/scripts/security-scan.mjs",
  workflow: "plugins/pipeline-core/lib/workflow-preflight.test.mjs",
  evidence: "plugins/pipeline-core/lib/security-evidence-evaluator.test.mjs",
});

function normalizePaths(paths) {
  return [...new Set((paths ?? []).filter((path) => typeof path === "string" && path))].sort();
}

/** Evaluate the current candidate without trusting its changed content. */
export function evaluateAiHardeningGate({
  changedPaths = [], event = "local", privileged = false, isolated = false,
  validated = false, authorId = "candidate-author", reviewerId = null, independentChecks = [],
} = {}) {
  const paths = normalizePaths(changedPaths);
  const input = classifyInput({ source: "repository", content: paths.join("\n") });
  const authority = validateTaskAuthority({
    manifest: { operations: ["read-candidate", "run-independent-checks"], paths },
    request: { operations: ["read-candidate", "run-independent-checks"], paths },
  });
  const integrity = evaluateChangeIntegrity({ paths, independentChecks });
  const review = routeSecurityReview({ changedPaths: paths, authorId, reviewerId });
  const ci = evaluateCiAuthority({ event, privileged, isolated, validated });
  const hygiene = validateEvidenceHygiene({ schema: AI_HARDENING_GATE_SCHEMA, changedPathCount: paths.length });
  const checks = Object.freeze({ input, authority, integrity, review, ci, hygiene });
  const allowed = input.trust === "untrusted" && input.authority === "none"
    && authority.allowed && integrity.allowed && review.allowed && ci.allowed && hygiene.allowed;
  return Object.freeze({
    schema: AI_HARDENING_GATE_SCHEMA,
    allowed,
    code: allowed ? "AIH-CANDIDATE-ADMITTED" : "AIH-CANDIDATE-REJECTED",
    changedPaths: Object.freeze(paths),
    checks,
  });
}

function git(repoRoot, args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || "git command failed").trim());
  return result.stdout.trim();
}

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function bool(value) {
  return value === true || value === "true";
}

export function changedPathsForCandidate(repoRoot, base, head) {
  return normalizePaths(git(repoRoot, ["diff", "--name-only", "--diff-filter=ACMR", base, head]).split("\n"));
}

/**
 * A self-excluded, root-pointable check cannot certify itself, but it can be
 * re-run at its BASE (pre-candidate) revision, pointed at the candidate root
 * via `--root`. This never trusts the candidate's own copy of the checker;
 * it materialises the checker's tree as it stood at `base` in a detached
 * worktree, runs THAT copy, and discards the worktree. Any failure along the
 * way (no base, worktree add fails, the base copy itself rejects) resolves
 * to "not counted" -- fail-closed, never a thrown exception that could be
 * mistaken for something else.
 */
function verifySelfExcludedAtBase(repoRoot, base, kind, file) {
  const decision = evaluateSelfExcludedCheck({ kind, baseRevisionExitCode: null });
  if (!decision.rootPointable || typeof base !== "string" || base.length === 0) return false;
  let worktreeDir;
  try {
    worktreeDir = mkdtempSync(path.join(tmpdir(), "vtp-self-excluded-"));
  } catch {
    return false;
  }
  try {
    const add = spawnSync("git", ["worktree", "add", "--detach", "--force", worktreeDir, base], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    if (add.status !== 0) return false;
    const run = spawnSync(process.execPath, [path.join(worktreeDir, file), "--root", repoRoot], {
      cwd: worktreeDir,
      stdio: "ignore",
    });
    return evaluateSelfExcludedCheck({ kind, baseRevisionExitCode: run.status }).counted;
  } catch {
    return false;
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", worktreeDir], { cwd: repoRoot, stdio: "ignore" });
    try { rmSync(worktreeDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
  }
}

/**
 * The candidate-suite-and-review path: run the check's own CANDIDATE-revision
 * copy (the same spawn shape the non-excluded branch already uses) and feed
 * its exit code, together with the reviewer/author identity, into
 * `evaluateSelfExcludedCheck`. This is never self-certification -- the suite
 * passing is mechanical evidence, the authority is the named human distinct
 * from the author, and both halves are required by that function.
 */
function verifySelfExcludedAtCandidate(repoRoot, kind, file, reviewerId, authorId) {
  const run = spawnSync(process.execPath, [file], { cwd: repoRoot, stdio: "ignore" });
  return evaluateSelfExcludedCheck({
    kind,
    candidateRevisionExitCode: run.status,
    reviewerId,
    authorId,
  }).counted;
}

/**
 * Run only fixed, separate checks for classes present in this candidate diff.
 * `base` is the delivery base (see `verify-topology-preflight.mjs`); it is
 * used ONLY to materialise a self-excluded, root-pointable check's own base
 * revision -- never to widen or narrow which classes are required.
 * `reviewerId`/`authorId` feed the candidate-suite-and-review fallback path
 * only; a caller that omits them keeps the exact previous base-only behaviour.
 */
export function runIndependentChecks(repoRoot, changedPaths, base = null, { reviewerId = null, authorId = null } = {}) {
  const required = evaluateChangeIntegrity({ paths: changedPaths, independentChecks: [] }).changed;
  return required.filter((kind) => {
    const file = INDEPENDENT_CHECK_COMMANDS[kind];
    if (!file) return false;
    if (changedPaths.includes(file)) {
      return verifySelfExcludedAtBase(repoRoot, base, kind, file)
        || verifySelfExcludedAtCandidate(repoRoot, kind, file, reviewerId, authorId);
    }
    return spawnSync(process.execPath, [file], { cwd: repoRoot, stdio: "ignore" }).status === 0;
  });
}

function main() {
  const repoRoot = argument("--repo-root", process.cwd());
  const head = argument("--head", "HEAD");
  const base = argument("--base") ?? git(repoRoot, ["rev-parse", `${head}^`]);
  const changedPaths = changedPathsForCandidate(repoRoot, base, head);
  const authorId = argument("--author-id", git(repoRoot, ["log", "-1", "--format=%ae", head]));
  const reviewerId = argument("--reviewer-id", process.env.PIPELINE_SECURITY_REVIEWER_ID ?? null);
  const result = evaluateAiHardeningGate({
    changedPaths,
    event: argument("--event", process.env.GITHUB_EVENT_NAME ?? "local"),
    privileged: bool(argument("--privileged", "false")),
    isolated: bool(argument("--isolated", "false")),
    validated: bool(argument("--validated", "false")),
    authorId,
    reviewerId,
    independentChecks: runIndependentChecks(repoRoot, changedPaths, base, { reviewerId, authorId }),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.allowed ? 0 : 1;
}

if (isDirectInvocation(import.meta.url)) main();
