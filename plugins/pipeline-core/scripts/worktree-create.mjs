#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { lstatSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  ProjectOnboardingReadyError,
  requireProjectOnboardingReady,
} from "../lib/project-onboarding-ready-gate.mjs";
import {
  WorktreeLifecycleError,
  canonicalJson,
  createBranchWorktree,
  createDetachedWorktree,
  migrateBranchWorktree,
} from "../lib/worktree-lifecycle.mjs";

const USAGE = `Usage:
  worktree-create.mjs branch --repo <checkout> --branch <branch> [--runner claude|codex]
  worktree-create.mjs detached --repo <checkout> --purpose <label> --oid <commit> --session <id> (--owner-nonce-file <0600-file> | PIPELINE_SESSION_OWNER_NONCE) [--resource-id <id>] [--runner claude|codex]
  worktree-create.mjs migrate --repo <checkout> --source <old-worktree> --branch <branch> [--runner claude|codex]

Creates only canonical <primary>/branch/... worktrees. Migration never renames a
directory and removes the old worktree only after an exact detached target copy
has been created and verified.

--runner names the invoking runner explicitly for the project-onboarding
readiness gate (ADR-0051). When omitted, this CLI entry boundary derives it
from CLAUDECODE in its own environment, mirroring pipeline-start-preflight.mjs;
an explicit --runner always wins and an invalid explicit value fails closed.
`;
const RUNNERS = new Set(["claude", "codex"]);

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!new Set(["branch", "detached", "migrate"]).has(command)) throw new Error(USAGE);
  const flags = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error(USAGE);
    const name = key.slice(2);
    if (name in flags) throw new Error(`Duplicate option: ${key}`);
    flags[name] = value;
  }
  const allowed = command === "branch" ? new Set(["repo", "branch", "runner"])
    : command === "detached" ? new Set(["repo", "purpose", "oid", "session", "owner-nonce-file", "resource-id", "runner"])
      : new Set(["repo", "source", "branch", "runner"]);
  for (const name of Object.keys(flags)) if (!allowed.has(name)) throw new Error(`Unknown option: --${name}`);
  return { command, flags };
}

function required(flags, name) {
  if (!flags[name]) throw new Error(`Missing --${name}\n${USAGE}`);
  return flags[name];
}

/**
 * Resolve the invoking runner at this CLI entry boundary (ADR-0051): an
 * explicit --runner always wins; absent one, the ambient CLAUDECODE marker is
 * the legitimate source here (mirrors pipeline-start-preflight.mjs), and the
 * resolved value becomes an explicit argument to the gate from this point on
 * -- the gate itself never reads the environment
 * (ready-gate-env-var-runner-authority).
 */
function resolveRunner(flags, env) {
  if (flags.runner !== undefined) {
    if (!RUNNERS.has(flags.runner)) throw new Error(`Invalid --runner: ${flags.runner}\n${USAGE}`);
    return flags.runner;
  }
  return env.CLAUDECODE === "1" ? "claude" : "codex";
}

function ownerNonce(flags, env) {
  if (flags["owner-nonce-file"] && env.PIPELINE_SESSION_OWNER_NONCE) {
    throw new Error("Use either --owner-nonce-file or PIPELINE_SESSION_OWNER_NONCE, not both");
  }
  if (flags["owner-nonce-file"]) {
    const stat = lstatSync(flags["owner-nonce-file"]);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) {
      throw new Error("--owner-nonce-file must be a mode-0600 single-link regular file");
    }
    return readFileSync(flags["owner-nonce-file"], "utf8").trimEnd();
  }
  if (env.PIPELINE_SESSION_OWNER_NONCE) return env.PIPELINE_SESSION_OWNER_NONCE;
  throw new Error("Detached worktree creation requires --owner-nonce-file or PIPELINE_SESSION_OWNER_NONCE");
}

function publicResult(record) {
  return {
    schema: record.schema,
    status: record.status,
    lifecycle: record.lifecycle,
    physicalPath: record.physicalPath,
    ref: record.ref,
    oid: record.oid,
    purpose: record.purpose,
    sessionId: record.sessionId,
  };
}

export function main(argv = process.argv.slice(2), env = process.env, dependencies = {}) {
  const { command, flags } = parseArgs(argv);
  const repo = required(flags, "repo");
  const runner = resolveRunner(flags, env);
  (dependencies.requireProjectOnboardingReadyFn ?? requireProjectOnboardingReady)({
    rootDir: repo,
    intent: "dispatch",
    runner,
  });
  const createBranch = dependencies.createBranchWorktreeFn ?? createBranchWorktree;
  const createDetached = dependencies.createDetachedWorktreeFn ?? createDetachedWorktree;
  const migrateBranch = dependencies.migrateBranchWorktreeFn ?? migrateBranchWorktree;
  const write = dependencies.writeFn ?? ((value) => process.stdout.write(value));
  let result;
  if (command === "branch") {
    result = createBranch(repo, required(flags, "branch"));
  } else if (command === "detached") {
    result = createDetached(repo, required(flags, "purpose"), required(flags, "oid"), {
      sessionId: required(flags, "session"),
      ownerNonce: ownerNonce(flags, env),
      resourceId: flags["resource-id"],
    });
  } else {
    result = migrateBranch(repo, required(flags, "source"), required(flags, "branch"));
  }
  write(canonicalJson(publicResult(result)));
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    process.exitCode = main();
  } catch (error) {
    const code = error instanceof WorktreeLifecycleError || error instanceof ProjectOnboardingReadyError
      ? error.code
      : "WT-ARGUMENT";
    const detail = error instanceof ProjectOnboardingReadyError
      ? "project onboarding readiness denied worktree creation"
      : error.message;
    process.stderr.write(`${code}: ${detail}\n`);
    process.exitCode = 2;
  }
}
