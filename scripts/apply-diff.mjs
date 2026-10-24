#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Check, summarise and apply one or more diffs to the working tree.
 *
 * PURPOSE. The closed shell grammar refuses `git apply <diff>` as a tool call (GUARD-TESTPATH-SHELL-FAULT,
 * PO list row 57). This script runs the same `git apply --check`, `--stat` and apply through Node, so a
 * Goldfish hand-back (a `*.diff` or a `git format-patch` file) can be imported by the Elephant. It stages and
 * commits nothing; the caller commits by explicit pathspec afterwards. Protected guard sources
 * (`PB-GUARD-HOOKS`, for example `plugins/pipeline-core/lib/guard/*.mjs`) can be APPLIED here but their
 * commit is refused by the pre-commit hook and belongs to a human operator (`git commit --no-verify`).
 *
 * USAGE. node scripts/apply-diff.mjs <diff> [<diff> ...]
 *   Each diff is checked, summarised and applied in order; the first failure stops the run (exit 1, the
 *   remaining diffs are untouched). Paths are repository-relative.
 */
import { execFileSync } from "node:child_process";

const diffs = process.argv.slice(2);
if (diffs.length === 0) {
  console.error("usage: node scripts/apply-diff.mjs <diff> [<diff> ...]");
  process.exit(2);
}
for (const diff of diffs) {
  execFileSync("git", ["apply", "--check", diff], { stdio: "inherit" });
  execFileSync("git", ["apply", "--stat", diff], { stdio: "inherit" });
  execFileSync("git", ["apply", diff], { stdio: "inherit" });
  console.log("applied " + diff);
}
