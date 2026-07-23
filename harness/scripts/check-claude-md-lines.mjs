#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-claude-md-lines.mjs — CLAUDE.md length gate (context economy, E10 / operating-model §6).
 *
 * Wired as a REAL A12 ritual extension: .claude/pipeline.json → ritualExtensions.close.pre
 * of this repo (self-application E13). close-block step 1 executes it as a shell entry;
 * a non-zero exit stops the close ritual with an explicit report.
 *
 * Behavior:
 *   - Reads `claudeMdMaxLines` from <projectRoot>/.claude/pipeline.json (default 200
 *     when the file or field is absent — the template default, CLAUDE.project.md).
 *   - Counts the lines of <projectRoot>/CLAUDE.md.
 *   - Exit 0: within the limit (prints the count as evidence).
 *   - Exit 2: over the limit, with a plain-text reason (consolidate, move to
 *     skills/hooks, or delete — growing means consolidating, operating-model §7).
 *   - Exit 2: CLAUDE.md missing (a project under the pipeline must have one).
 *
 * Project root resolution: CLAUDE_PROJECT_DIR (set by Claude Code for hooks/skills),
 * falling back to the process cwd — never a hardcoded path (two machines).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

let maxLines = 200; // template default (templates/CLAUDE.project.md)
let limitSource = "default (200)";
try {
  const calibration = JSON.parse(readFileSync(join(root, ".claude", "pipeline.json"), "utf8"));
  if (Number.isInteger(calibration?.claudeMdMaxLines) && calibration.claudeMdMaxLines > 0) {
    maxLines = calibration.claudeMdMaxLines;
    limitSource = ".claude/pipeline.json (claudeMdMaxLines)";
  }
} catch {
  // Calibration absent/unreadable → template default. The length gate must not
  // fail-open entirely: 200 is the documented default, not a guess.
}

let content;
try {
  content = readFileSync(join(root, "CLAUDE.md"), "utf8");
} catch {
  console.error(`LENGTH GATE FAILED: no CLAUDE.md found under ${root} — a pipeline-bound project must carry one.`);
  process.exit(2);
}

// Count lines the way an editor shows them (trailing newline does not add a line).
const lineCount = content.length === 0 ? 0 : content.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n").length;

if (lineCount > maxLines) {
  console.error(
    `LENGTH GATE RED: CLAUDE.md has ${lineCount} lines, limit is ${maxLines} (${limitSource}).\n` +
      `CLAUDE.md is loaded into EVERY session — growth taxes every session start (anti-pattern AP2: <PROJECT_B> reached 578 lines).\n` +
      `Fix: consolidate rules, move procedures to skills/hooks, or delete — do not raise the limit to get green (operating-model §7).`,
  );
  process.exit(2);
}

console.log(`LENGTH GATE GREEN: CLAUDE.md has ${lineCount} lines (limit ${maxLines}, source: ${limitSource}).`);
process.exit(0);
