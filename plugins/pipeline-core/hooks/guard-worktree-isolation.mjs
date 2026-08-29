#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Thin PreToolUse hook wrapper around lib/worktree-count-check.mjs. Advisory
 * only: exit 0 (allow) unless a mismatch was RESOLVED on this event, in which
 * case exit 1 (allow + stderr warning) -- never exit 2/block, because this
 * check cannot un-launch a dispatch that already ran. Fail-open on anything it
 * cannot read/resolve.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import {
  evaluateWorktreeCountCheckEvent,
  formatWorktreeIsolationMismatch,
} from "../lib/worktree-count-check.mjs";

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0); // unreadable input -> no opinion
}

const startPath = process.cwd();
const commonDirResult = spawnSync(
  "git",
  ["rev-parse", "--path-format=absolute", "--git-common-dir"],
  { cwd: startPath, encoding: "utf8" },
);
if (!commonDirResult || commonDirResult.status !== 0) process.exit(0); // not a repo -> no opinion
const commonDir = commonDirResult.stdout.trim();

const { resolved } = evaluateWorktreeCountCheckEvent({
  toolInput: input?.tool_input,
  transcriptPath: input?.transcript_path,
  commonDir,
  startPath,
});

const message = formatWorktreeIsolationMismatch(resolved);
if (message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
process.exit(0);
