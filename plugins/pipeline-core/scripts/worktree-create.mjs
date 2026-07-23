#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { lstatSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  WorktreeLifecycleError,
  canonicalJson,
  createBranchWorktree,
  createDetachedWorktree,
  migrateBranchWorktree,
} from "../lib/worktree-lifecycle.mjs";

const USAGE = `Usage:
  worktree-create.mjs branch --repo <checkout> --branch <branch>
  worktree-create.mjs detached --repo <checkout> --purpose <label> --oid <commit> --session <id> (--owner-nonce-file <0600-file> | PIPELINE_SESSION_OWNER_NONCE) [--resource-id <id>]
  worktree-create.mjs migrate --repo <checkout> --source <old-worktree> --branch <branch>

Creates only canonical <primary>/branch/... worktrees. Migration never renames a
directory and removes the old worktree only after an exact detached target copy
has been created and verified.
`;

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
  const allowed = command === "branch" ? new Set(["repo", "branch"])
    : command === "detached" ? new Set(["repo", "purpose", "oid", "session", "owner-nonce-file", "resource-id"])
      : new Set(["repo", "source", "branch"]);
  for (const name of Object.keys(flags)) if (!allowed.has(name)) throw new Error(`Unknown option: --${name}`);
  return { command, flags };
}

function required(flags, name) {
  if (!flags[name]) throw new Error(`Missing --${name}\n${USAGE}`);
  return flags[name];
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

export function main(argv = process.argv.slice(2), env = process.env) {
  const { command, flags } = parseArgs(argv);
  const repo = required(flags, "repo");
  let result;
  if (command === "branch") {
    result = createBranchWorktree(repo, required(flags, "branch"));
  } else if (command === "detached") {
    result = createDetachedWorktree(repo, required(flags, "purpose"), required(flags, "oid"), {
      sessionId: required(flags, "session"),
      ownerNonce: ownerNonce(flags, env),
      resourceId: flags["resource-id"],
    });
  } else {
    result = migrateBranchWorktree(repo, required(flags, "source"), required(flags, "branch"));
  }
  process.stdout.write(canonicalJson(publicResult(result)));
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    process.exitCode = main();
  } catch (error) {
    const code = error instanceof WorktreeLifecycleError ? error.code : "WT-ARGUMENT";
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 2;
  }
}
