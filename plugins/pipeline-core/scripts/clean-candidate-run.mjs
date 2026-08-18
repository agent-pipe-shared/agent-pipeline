#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * clean-candidate-run.mjs — single entry point for the detached-worktree
 * clean-candidate route (backlog:
 * a-checkout-that-cannot-be-clean-defeats-every-cleanliness-gate).
 *
 * Two tracked files in the primary checkout (`.claude/settings.json`,
 * `project/resume-hint.json`) are permanently runtime-modified and never
 * committed, so any tool that gates on a clean working tree
 * (`harness/scripts/verify.mjs`'s candidate preflight,
 * `po-approval-request.mjs`'s `observeCleanCandidate`) refuses to run from
 * the primary tree by construction — not because anything is wrong with the
 * candidate. This entry point creates a detached worktree at an exact
 * candidate commit by reusing `../lib/worktree-lifecycle.mjs`'s
 * `createDetachedWorktree` (the same function `worktree-create.mjs`'s CLI
 * itself calls — worktree creation is never reimplemented here), runs the
 * requested command inside that worktree, copies back the complete known
 * evidence artifact set (`evidence/verify-latest.json` plus the
 * `security-latest` trio — whichever the command actually produced), and
 * removes the worktree via the paired teardown (`cleanupSession`) —
 * replacing the manually-remembered `.git/phx-verify` procedure (and its
 * two documented failure modes: a dirty-tree refusal and a partial artifact
 * copy) with one supported command.
 *
 * Usage:
 *   clean-candidate-run.mjs --repo <checkout> --oid <candidate-ref>
 *     [--purpose <label>] [--runner claude|codex] -- <command> [args...]
 *
 * A pre-existing worktree at the exact canonical (purpose, oid) target —
 * only reachable from an earlier interrupted run of this exact command — is
 * reused rather than treated as a conflict, and is removed with a direct
 * `git worktree remove` afterward, since no manifest resource was
 * registered for it under this invocation's own session.
 *
 * --runner names the invoking runner explicitly for the project-onboarding
 * readiness gate (ADR-0051), mirroring worktree-create.mjs; an explicit
 * --runner always wins, and absent one this CLI entry boundary derives it
 * from CLAUDECODE in its own environment.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  ProjectOnboardingReadyError,
  requireProjectOnboardingReady,
} from "../lib/project-onboarding-ready-gate.mjs";
import {
  WorktreeLifecycleError,
  canonicalDetachedTarget,
  canonicalJson,
  cleanupSession,
  createDetachedWorktree,
  discoverRepository,
  runGit,
} from "../lib/worktree-lifecycle.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const USAGE = `Usage:
  clean-candidate-run.mjs --repo <checkout> --oid <candidate-ref> [--purpose <label>] [--runner claude|codex] -- <command> [args...]

Creates (or reuses) a detached worktree at the exact candidate commit, runs
<command> inside it with that worktree as its working directory, copies back
the complete known evidence artifact set (evidence/verify-latest.json,
evidence/security-latest.json, evidence/security-latest.v2.json,
evidence/security-latest.v2.verdict.json -- whichever <command> actually
produced) into <checkout>, then removes the worktree.
`;

const RUNNERS = new Set(["claude", "codex"]);
const KNOWN_ARTIFACTS = [
  "evidence/verify-latest.json",
  "evidence/security-latest.json",
  "evidence/security-latest.v2.json",
  "evidence/security-latest.v2.verdict.json",
];

function parseArgs(argv) {
  const sep = argv.indexOf("--");
  if (sep === -1) throw new Error(USAGE);
  const head = argv.slice(0, sep);
  const command = argv.slice(sep + 1);
  if (command.length === 0) throw new Error(USAGE);
  const flags = {};
  for (let index = 0; index < head.length; index += 2) {
    const key = head[index];
    const value = head[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error(USAGE);
    const name = key.slice(2);
    if (name in flags) throw new Error(`Duplicate option: ${key}`);
    flags[name] = value;
  }
  const allowed = new Set(["repo", "oid", "purpose", "runner"]);
  for (const name of Object.keys(flags)) if (!allowed.has(name)) throw new Error(`Unknown option: --${name}`);
  return { flags, command };
}

function required(flags, name) {
  if (!flags[name]) throw new Error(`Missing --${name}\n${USAGE}`);
  return flags[name];
}

/**
 * Resolve the invoking runner at this CLI entry boundary (ADR-0051): an
 * explicit --runner always wins; absent one, the ambient CLAUDECODE marker
 * is the legitimate source here (mirrors worktree-create.mjs).
 */
function resolveRunner(flags, env) {
  if (flags.runner !== undefined) {
    if (!RUNNERS.has(flags.runner)) throw new Error(`Invalid --runner: ${flags.runner}\n${USAGE}`);
    return flags.runner;
  }
  return env.CLAUDECODE === "1" ? "claude" : "codex";
}

function resolveOid(cwd, oidish, runGitFn) {
  const oid = String(runGitFn(cwd, ["rev-parse", "--verify", `${oidish}^{commit}`]).stdout).trim();
  if (!/^[0-9a-f]{40}$/.test(oid) && !/^[0-9a-f]{64}$/.test(oid)) {
    throw new WorktreeLifecycleError("WT-INVALID-OID", "candidate ref did not resolve to a canonical commit OID");
  }
  return oid;
}

/**
 * Acquire the worktree named by exactly one deterministic (purpose, oid)
 * pair: create it fresh through the reused lifecycle (registered, and torn
 * down through its paired `cleanupSession`), or -- only when the identical
 * canonical target already exists -- reuse it and tear it down with a
 * direct `git worktree remove` since it carries no manifest resource under
 * this invocation's own session.
 */
function acquireWorktree(repo, purpose, oidish, sessionId, ownerNonce, dependencies) {
  const createDetached = dependencies.createDetachedWorktreeFn ?? createDetachedWorktree;
  try {
    const created = createDetached(repo, purpose, oidish, { sessionId, ownerNonce }, {});
    return { physicalPath: created.physicalPath, oid: created.oid, managed: true };
  } catch (error) {
    if (!(error instanceof WorktreeLifecycleError) || error.code !== "WT-TARGET-EXISTS") throw error;
    const repository = discoverRepository(repo);
    const oid = resolveOid(repository.primaryRoot, oidish, runGit);
    const mapping = canonicalDetachedTarget(repository.primaryRoot, purpose, oid);
    const head = String(runGit(mapping.target, ["rev-parse", "HEAD"]).stdout).trim();
    if (head !== oid) {
      throw new WorktreeLifecycleError("WT-REUSE-MISMATCH", "existing worktree at the canonical target is not at the requested candidate");
    }
    return { physicalPath: mapping.target, oid, managed: false };
  }
}

function releaseWorktree(repo, worktree, sessionId, ownerNonce, dependencies) {
  // Purge everything the run left behind (already copied out above) so the
  // registered-worktree cleanliness check below never sees runtime residue
  // (evidence/ is git-ignored, so an untracked/ignored artifact is exactly
  // what a fresh run leaves and exactly what `git clean` is for here).
  runGit(worktree.physicalPath, ["clean", "-xdff"]);
  if (worktree.managed) {
    const cleanup = (dependencies.cleanupSessionFn ?? cleanupSession)(repo, { sessionId, ownerNonce }, {});
    if (!cleanup.ok) throw new WorktreeLifecycleError("WT-CLEANUP-BLOCKED", "worktree cleanup did not complete");
    return cleanup.receipt;
  }
  runGit(repo, ["worktree", "remove", worktree.physicalPath]);
  if (existsSync(worktree.physicalPath)) fail("WT-CLEANUP-FAILED", "Git retained the reused worktree path");
  return { schema: "pipeline.clean-candidate-reused-cleanup.v1", status: "removed" };
}

function fail(code, message) {
  throw new WorktreeLifecycleError(code, message);
}

function copyArtifacts(worktreePath, repo) {
  const copied = [];
  for (const relative of KNOWN_ARTIFACTS) {
    const source = join(worktreePath, relative);
    if (!existsSync(source)) continue;
    const destination = join(repo, relative);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(source));
    copied.push(relative);
  }
  return copied;
}

export function main(argv = process.argv.slice(2), env = process.env, dependencies = {}) {
  const { flags, command } = parseArgs(argv);
  const repo = resolve(required(flags, "repo"));
  const oidish = required(flags, "oid");
  const purpose = flags.purpose ?? "clean-run";
  const runner = resolveRunner(flags, env);
  const requireReady = dependencies.requireProjectOnboardingReadyFn ?? requireProjectOnboardingReady;
  const spawn = dependencies.spawnFn ?? spawnSync;
  const write = dependencies.writeFn ?? ((value) => process.stdout.write(value));

  requireReady({ rootDir: repo, intent: "dispatch", runner });

  const sessionId = dependencies.sessionId ?? `clean-candidate-${randomBytes(8).toString("hex")}`;
  const ownerNonce = dependencies.ownerNonce ?? randomBytes(32).toString("base64url");

  const worktree = acquireWorktree(repo, purpose, oidish, sessionId, ownerNonce, dependencies);
  let commandResult;
  let copied = [];
  try {
    commandResult = spawn(command[0], command.slice(1), {
      cwd: worktree.physicalPath,
      env,
      stdio: "inherit",
    });
    if (commandResult.error) throw commandResult.error;
    copied = copyArtifacts(worktree.physicalPath, repo);
  } finally {
    releaseWorktree(repo, worktree, sessionId, ownerNonce, dependencies);
  }

  const exitCode = commandResult.status ?? 1;
  const output = {
    schema: "pipeline.clean-candidate-run-result.v1",
    repo,
    oid: worktree.oid,
    purpose,
    reusedExistingWorktree: !worktree.managed,
    command,
    commandExitCode: exitCode,
    copiedArtifacts: copied,
  };
  write(canonicalJson(output));
  return exitCode;
}

const invokedDirectly = isDirectInvocation(import.meta.url);
if (invokedDirectly) {
  try {
    process.exitCode = main();
  } catch (error) {
    const code = error instanceof WorktreeLifecycleError || error instanceof ProjectOnboardingReadyError
      ? error.code
      : "CCR-ARGUMENT";
    const detail = error instanceof ProjectOnboardingReadyError
      ? "project onboarding readiness denied clean-candidate worktree creation"
      : error.message;
    process.stderr.write(`${code}: ${detail}\n`);
    process.exitCode = 2;
  }
}
