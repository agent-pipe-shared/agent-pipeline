#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// commit-pipeline-owned.mjs --root <root> (--agent | --human) [--dry-run]
//
// PF-31, PF-36, PF-40 (D56 (2)): commits exactly the Pipeline's own dirty state files (the governed slice
// queue, and a tree guard-override audit log an older build left) so the clean-tree checks of push-prepare, push-init and the PO
// approval pass again. It refuses when anything else is dirty, naming those paths: it never commits, stashes
// or discards a file the Pipeline does not own. Runs from the agent's shell and from the PO's terminal.
// The caller states who runs it, and exactly one of the two flags is required: `--agent` adds the GIT-03
// provenance pair (`AI-Assisted: true`, `Dispatch: stage-0 (elephant)`) for an agent session; `--human`
// commits without provenance trailers, as a PO's own terminal commit does. A call naming neither is refused,
// so an agent that drops the flag gets a refusal, not an unmarked commit. Nothing is defaulted from a guess.
//
// Prints one JSON result. Exit 0: committed | nothing-to-commit | dry-run. Exit 2: refused.
import { spawnSync } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { classifyDirtyTree } from "../lib/pipeline-owned-files.mjs";
import { isSuccessfulSpawn } from "../lib/successful-spawn.mjs";

const SCHEMA = "pipeline.commit-pipeline-owned.v1";
const BODY = "chore(pipeline): commit the Pipeline's own state files\n\n"
  + "Committed by commit-pipeline-owned.mjs (PF-31/PF-36/PF-40): the governed slice queue,\n"
  + "and a tree guard-override audit log an older build left, are written by the Pipeline\n"
  + "itself and would otherwise keep the tree a push needs clean dirty.\n";
const AGENT_TRAILERS = "\nAI-Assisted: true\nDispatch: stage-0 (elephant)\n";

export function commitPipelineOwnedMessage({ agent }) {
  return agent ? BODY + AGENT_TRAILERS : BODY;
}

function parse(argv) {
  const usage = "usage: commit-pipeline-owned.mjs --root <root> (--agent | --human) [--dry-run]";
  const flags = { dryRun: false, agent: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dry-run" && !flags.dryRun) { flags.dryRun = true; continue; }
    if ((argv[index] === "--agent" || argv[index] === "--human") && flags.agent === undefined) { flags.agent = argv[index] === "--agent"; continue; }
    if (argv[index] === "--root" && flags.root === undefined && typeof argv[index + 1] === "string" && !argv[index + 1].startsWith("--")) { flags.root = argv[index + 1]; index += 1; continue; }
    return { error: usage };
  }
  if (flags.root === undefined) return { error: "--root <root> is required" };
  return flags.agent === undefined ? { error: `state who runs it: --agent (an agent session) or --human (a PO terminal commit); ${usage}` } : flags;
}

export function commitPipelineOwned(argv, { spawn = spawnSync } = {}) {
  const parsed = parse(argv);
  if (parsed.error) return { status: "refused", code: "CPO-ARGS", reason: parsed.error };
  let root;
  try { root = realpathSync(resolve(parsed.root)); if (!statSync(root).isDirectory()) throw new Error("not a directory"); }
  catch (error) { return { status: "refused", code: "CPO-ROOT", reason: `--root is not a directory: ${String(error?.message ?? error).slice(0, 200)}` }; }
  const git = (args) => spawn("git", ["-C", root, ...args], { encoding: "utf8" });
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (!isSuccessfulSpawn(status) || typeof status.stdout !== "string") return { status: "refused", code: "CPO-GIT", reason: "git status failed" };
  const { owned, others } = classifyDirtyTree(status.stdout);
  if (others.length) return { status: "refused", code: "CPO-FOREIGN-CHANGES", reason: "other files are uncommitted; this command commits only the Pipeline's own state files", others, owned };
  if (!owned.length) return { status: "nothing-to-commit", owned: [] };
  if (parsed.dryRun) return { status: "dry-run", owned };
  const add = git(["add", "--", ...owned]);
  if (!isSuccessfulSpawn(add)) return { status: "refused", code: "CPO-GIT", reason: "git add failed", owned };
  const commit = git(["commit", "-m", commitPipelineOwnedMessage({ agent: parsed.agent }), "--", ...owned]);
  if (!isSuccessfulSpawn(commit)) return { status: "refused", code: "CPO-GIT", reason: `git commit failed: ${String(commit.stderr ?? "").trim().slice(0, 300)}`, owned };
  const head = git(["rev-parse", "HEAD"]);
  return { status: "committed", owned, commit: isSuccessfulSpawn(head) ? head.stdout.trim() : null };
}

if (isDirectInvocation(import.meta.url)) {
  const result = commitPipelineOwned(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, ...result })}\n`);
  process.exitCode = result.status === "refused" ? 2 : 0;
}
