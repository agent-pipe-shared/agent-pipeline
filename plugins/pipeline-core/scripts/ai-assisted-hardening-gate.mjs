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
import { fileURLToPath } from "node:url";
import {
  classifyInput,
  evaluateChangeIntegrity,
  evaluateCiAuthority,
  routeSecurityReview,
  validateEvidenceHygiene,
  validateTaskAuthority,
} from "../lib/ai-assisted-hardening.mjs";

export const AI_HARDENING_GATE_SCHEMA = "pipeline.ai-assisted-hardening-gate.v1";
export const INDEPENDENT_CHECKS = Object.freeze([
  "scope", "test", "guard", "policy", "dependency", "workflow", "evidence",
]);

function normalizePaths(paths) {
  return [...new Set((paths ?? []).filter((path) => typeof path === "string" && path))].sort();
}

/** Evaluate the current candidate without trusting its changed content. */
export function evaluateAiHardeningGate({
  changedPaths = [], event = "local", privileged = false, isolated = false,
  validated = false, authorId = "candidate-author", reviewerId = "pipeline-critic",
} = {}) {
  const paths = normalizePaths(changedPaths);
  const input = classifyInput({ source: "repository", content: paths.join("\n") });
  const authority = validateTaskAuthority({
    manifest: { operations: ["read-candidate", "run-independent-checks"], paths },
    request: { operations: ["read-candidate", "run-independent-checks"], paths },
  });
  const integrity = evaluateChangeIntegrity({ paths, independentChecks: INDEPENDENT_CHECKS });
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

function main() {
  const repoRoot = argument("--repo-root", process.cwd());
  const head = argument("--head", "HEAD");
  const base = argument("--base") ?? git(repoRoot, ["rev-parse", `${head}^`]);
  const result = evaluateAiHardeningGate({
    changedPaths: changedPathsForCandidate(repoRoot, base, head),
    event: argument("--event", process.env.GITHUB_EVENT_NAME ?? "local"),
    privileged: bool(argument("--privileged", "false")),
    isolated: bool(argument("--isolated", "false")),
    validated: bool(argument("--validated", "false")),
    authorId: argument("--author-id", "candidate-author"),
    reviewerId: argument("--reviewer-id", "pipeline-critic"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.allowed ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
