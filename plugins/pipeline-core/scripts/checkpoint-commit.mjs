#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * checkpoint-commit.mjs (D52): the sanctioned checkpoint-commit route for the Elephant.
 *
 * Commits an intermediate state (handover, runtime state file, slice queue, evidence) with the
 * `AI-Assisted: true` + `Checkpoint-Act: elephant` trailer pair, and ONLY when every changed
 * path is inside the checkpoint allowlist that `dispatch-authorship-verify.mjs` also reads.
 * Hooks stay on: the commit is never made with `--no-verify`. A refused run stages nothing.
 *
 * Usage:
 *   node checkpoint-commit.mjs --repo-root <dir> --message-file scratch/<name>.txt [--dry-run]
 *
 * The message file is repo-relative under `scratch/`, holds subject and body only (no
 * provenance trailers); the script appends the trailer pair. Prints one JSON receipt
 * (no absolute path). Exit 0 on success, 1 on refusal.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { finishedCommitMessageFindings, parseCommitTrailerBlock } from "../lib/commit-message-policy.mjs";
import { isCheckpointPath } from "./dispatch-authorship-verify.mjs";

export const CHECKPOINT_TRAILERS = Object.freeze(["AI-Assisted: true", "Checkpoint-Act: elephant"]);
const PROVENANCE_KEYS = new Set(["dispatch", "ai-assisted", "checkpoint-act"]);

const defaultGit = (args, { cwd, input } = {}) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false, input, maxBuffer: 1 << 26 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

const refuse = (code, detail, paths = []) => ({ ok: false, code, detail, paths });

function validMessageFile(messageFile) {
  if (typeof messageFile !== "string" || messageFile === "") return false;
  if (messageFile.startsWith("/") || messageFile.includes("\\") || messageFile.includes("\0")) return false;
  const segments = messageFile.split("/");
  if (segments.some((s) => s === ".." || s === "." || s === "")) return false;
  return segments[0] === "scratch" && segments.length >= 2;
}

/** Parse `git status --porcelain=v1 -z -uall` into index paths and all changed paths. */
function parseStatus(raw) {
  const parts = raw.split("\0");
  const staged = new Set();
  const all = new Set();
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    const x = entry[0];
    const y = entry[1];
    const path = entry.slice(3);
    const paths = [path];
    if (x === "R" || x === "C" || y === "R" || y === "C") { i += 1; if (parts[i]) paths.push(parts[i]); }
    for (const p of paths) {
      all.add(p);
      if (x !== " " && x !== "?" && x !== "!") staged.add(p);
    }
  }
  return { staged: [...staged].sort(), all: [...all].sort() };
}

export function runCheckpointCommit({ repoRoot, messageFile, dryRun = false } = {}, deps = {}) {
  const git = deps.git ?? defaultGit;
  if (!validMessageFile(messageFile)) {
    return refuse("CHECKPOINT-MESSAGE-FILE-INVALID", "the message file must be a repo-relative path under scratch/ without `..`");
  }
  let message;
  try {
    message = readFileSync(join(repoRoot, messageFile), "utf8");
  } catch {
    return refuse("CHECKPOINT-MESSAGE-FILE-INVALID", "the message file cannot be read");
  }
  if (message.trim() === "") return refuse("CHECKPOINT-MESSAGE-FILE-INVALID", "the message file is empty");
  if (parseCommitTrailerBlock(message).some((entry) => PROVENANCE_KEYS.has(entry.key.toLowerCase()))) {
    return refuse("CHECKPOINT-MESSAGE-HAS-PROVENANCE", "the message already carries Dispatch, AI-Assisted or Checkpoint-Act; the script appends the pair itself");
  }
  const correlation = finishedCommitMessageFindings(message).findings;
  if (correlation.length > 0) {
    return refuse("CHECKPOINT-MESSAGE-CORRELATION", correlation.map((f) => f.code).join(", "));
  }
  const status = git(["status", "--porcelain=v1", "-z", "-uall"], { cwd: repoRoot });
  if (status.status !== 0) return refuse("CHECKPOINT-GIT-FAILED", `git status failed: ${status.stderr.trim()}`);
  const parsed = parseStatus(status.stdout);
  const stagedOutside = parsed.staged.filter((p) => p !== messageFile && !isCheckpointPath(p));
  if (stagedOutside.length > 0) {
    return refuse("CHECKPOINT-INDEX-OUTSIDE-ALLOWLIST", "the index already holds paths outside the checkpoint allowlist", stagedOutside);
  }
  const paths = parsed.all.filter((p) => p !== messageFile);
  const outside = paths.filter((p) => !isCheckpointPath(p));
  if (outside.length > 0) {
    return refuse("CHECKPOINT-PATH-OUTSIDE-ALLOWLIST", "changed paths outside the checkpoint allowlist", outside);
  }
  if (paths.length === 0) return refuse("CHECKPOINT-EMPTY", "no changed path to commit");

  const finalMessage = `${message.replace(/\r\n/gu, "\n").trimEnd()}\n\n${CHECKPOINT_TRAILERS.join("\n")}\n`;
  const receipt = { schema: "pipeline.checkpoint-commit-receipt.v1", dryRun: dryRun === true, committed: false, commit: null, paths, trailers: [...CHECKPOINT_TRAILERS] };
  if (dryRun === true) return { ok: true, receipt };

  const add = git(["add", "--", ...paths], { cwd: repoRoot });
  if (add.status !== 0) return refuse("CHECKPOINT-GIT-FAILED", `git add failed: ${add.stderr.trim()}`, paths);
  const commit = git(["commit", "-F", "-"], { cwd: repoRoot, input: finalMessage });
  if (commit.status !== 0) return refuse("CHECKPOINT-GIT-FAILED", `git commit failed (hooks stay on): ${(commit.stderr || commit.stdout).trim()}`, paths);
  const head = git(["rev-parse", "HEAD"], { cwd: repoRoot });
  receipt.committed = true;
  receipt.commit = head.stdout.trim();
  return { ok: true, receipt };
}

function main(argv) {
  const options = { repoRoot: ".", messageFile: undefined, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--repo-root") options.repoRoot = argv[++i];
    else if (argv[i] === "--message-file") options.messageFile = argv[++i];
    else if (argv[i] === "--dry-run") options.dryRun = true;
    else { process.stderr.write(`unknown argument: ${argv[i]}\n`); return 2; }
  }
  const out = runCheckpointCommit(options);
  if (out.ok) { process.stdout.write(`${JSON.stringify(out.receipt)}\n`); return 0; }
  process.stdout.write(`${JSON.stringify({ schema: "pipeline.checkpoint-commit-refusal.v1", code: out.code, detail: out.detail, paths: out.paths })}\n`);
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
