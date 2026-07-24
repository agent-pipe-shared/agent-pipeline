#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * po-guarded-edit — generic PO-run applier for guard-testpath (TP-*) protected paths.
 *
 * WHY THIS FILE EXISTS
 *   guard-testpath.mjs (plugins/pipeline-core/hooks/guard-testpath.mjs) deliberately
 *   has no in-session override: an agent cannot lift a TP-* block even with explicit
 *   PO confirmation in the transcript, by design ("the guard binds agents, not
 *   humans"). Its documented escape hatch is the PO editing the protected file
 *   directly, outside any Claude Code session. This script is that escape hatch,
 *   generalized so it does not need to be re-invented per protected file: the PO
 *   supplies a small JSON job spec (exact old/new string pairs, Edit-tool style) and
 *   runs this script themselves in an ordinary terminal.
 *
 * SAFETY MODEL
 *   - This script is never invoked by an agent session, and it enforces that as a
 *     mechanical property, not just a convention: it refuses to run unless stdin is
 *     an interactive TTY, and it requires the operator to type the literal word
 *     "yes" before writing anything. A non-interactive caller (piped/redirected
 *     stdin, no TTY) gets a clean abort, not a silent apply.
 *   - Each job's oldString must match the target file exactly the requested number
 *     of times (default: exactly once) before ANY file is written — validation runs
 *     for the whole batch first, so a bad job in a batch blocks the good ones too
 *     instead of partially applying.
 *   - Target paths are resolved relative to the repository root and rejected if they
 *     resolve outside it (path traversal, absolute paths, other-drive paths).
 *   - This script does not stage or commit; the operator reviews `git diff` and
 *     commits themselves, same as any other hand-authored change.
 *
 * JOB FILE SCHEMA (JSON):
 *   { "jobs": [
 *       { "file": "harness/scripts/verify.mjs",         // repo-relative, forward slashes
 *         "oldString": "...",                            // exact substring, must be unique
 *         "newString": "...",                            // replacement
 *         "occurrences": 1,                               // optional, default 1
 *         "reason": "..." }                               // optional, shown in the preview
 *   ] }
 *   A bare array of job objects (no wrapping {"jobs": [...]}) is also accepted.
 *
 * USAGE (run directly by the PO, never via an agent's Bash/PowerShell tool):
 *   node plugins/pipeline-core/scripts/po-guarded-edit.mjs <path-to-job.json>
 *
 * VERIFY: node plugins/pipeline-core/scripts/po-guarded-edit.test.mjs
 */
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

const ABSOLUTE_LIKE = /^(?:[A-Za-z]:[\\/]|[\\/])/;

/** Pure validation + patch planning; performs a read but never a write. */
export function computeEdits(jobSpec, { repoRoot, readFile = (p) => readFileSync(p, "utf8") } = {}) {
  const jobs = Array.isArray(jobSpec)
    ? jobSpec
    : Array.isArray(jobSpec?.jobs)
      ? jobSpec.jobs
      : null;
  if (jobs === null || jobs.length === 0) {
    return { ok: false, errors: ['job spec must be an array, or {"jobs": [...]}, with at least one entry'] };
  }

  const errors = [];
  const edits = [];
  for (const [i, job] of jobs.entries()) {
    const label = `jobs[${i}]`;
    if (typeof job?.file !== "string" || job.file.length === 0) {
      errors.push(`${label}: missing "file"`);
      continue;
    }
    if (typeof job?.oldString !== "string" || job.oldString.length === 0) {
      errors.push(`${label}: missing "oldString"`);
      continue;
    }
    if (typeof job?.newString !== "string") {
      errors.push(`${label}: missing "newString"`);
      continue;
    }
    if (ABSOLUTE_LIKE.test(job.file)) {
      errors.push(`${label}: "file" must be repository-relative, got an absolute-looking path`);
      continue;
    }
    const expected = Number.isInteger(job.occurrences) && job.occurrences > 0 ? job.occurrences : 1;
    const absolute = resolve(repoRoot, job.file);
    const rel = relative(repoRoot, absolute);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      errors.push(`${label}: "file" resolves outside the repository root`);
      continue;
    }
    let physicalTarget;
    try {
      const stat = lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("target is not a regular non-symlink file");
      const physicalRoot = realpathSync(repoRoot);
      physicalTarget = realpathSync(absolute);
      const physicalRel = relative(physicalRoot, physicalTarget);
      if (physicalRel.startsWith("..") || isAbsolute(physicalRel)) throw new Error("target physically resolves outside the repository root");
    } catch (e) {
      errors.push(`${label}: unsafe physical target ${job.file} (${e.message})`);
      continue;
    }
    let before;
    try {
      before = readFile(physicalTarget);
    } catch (e) {
      errors.push(`${label}: cannot read ${job.file} (${e.message})`);
      continue;
    }
    const count = before.split(job.oldString).length - 1;
    if (count !== expected) {
      errors.push(`${label}: expected ${expected} occurrence(s) of oldString in ${job.file}, found ${count}`);
      continue;
    }
    const after = before.split(job.oldString).join(job.newString);
    edits.push({
      file: job.file,
      absolute: physicalTarget,
      before,
      after,
      oldString: job.oldString,
      newString: job.newString,
      reason: typeof job.reason === "string" ? job.reason : null,
    });
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, edits };
}

function printPlan(edits) {
  console.log(`Planned edits (${edits.length}):`);
  for (const edit of edits) {
    console.log(`\n--- ${edit.file} ---`);
    if (edit.reason) console.log(`reason: ${edit.reason}`);
    console.log("old:");
    console.log(edit.oldString);
    console.log("new:");
    console.log(edit.newString);
  }
  console.log("");
}

async function confirm(question) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise((res) => rl.question(question, res));
    return answer.trim() === "yes";
  } finally {
    rl.close();
  }
}

export async function run(argv = process.argv, env = process.env) {
  const jobPath = argv[2];
  if (!jobPath) {
    console.error("Usage: node po-guarded-edit.mjs <path-to-job.json>");
    return 1;
  }
  let jobSpec;
  try {
    jobSpec = JSON.parse(readFileSync(jobPath, "utf8"));
  } catch (e) {
    console.error(`Cannot read/parse job file: ${e.message}`);
    return 1;
  }

  const repoRoot = env.CLAUDE_PROJECT_DIR || process.cwd();
  const plan = computeEdits(jobSpec, { repoRoot });
  if (!plan.ok) {
    console.error("Refusing to apply — validation failed:");
    for (const error of plan.errors) console.error(`  - ${error}`);
    return 1;
  }

  console.log(
    "This script applies guard-protected (TP-*) edits. Run it directly in your own " +
      "terminal — it refuses to apply anything when stdin is not an interactive TTY, " +
      "so it cannot be driven unattended by an agent session.\n",
  );
  printPlan(plan.edits);

  if (!process.stdin.isTTY) {
    console.error("Refusing to apply non-interactively (stdin is not a TTY). No files were changed.");
    return 2;
  }
  const proceed = await confirm(`Apply ${plan.edits.length} edit(s) to the file(s) above? Type "yes" to proceed: `);
  if (!proceed) {
    console.log("Aborted — no files were changed.");
    return 2;
  }

  for (const edit of plan.edits) {
    try {
      const stat = lstatSync(edit.absolute);
      if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(edit.absolute) !== edit.absolute) throw new Error("target changed or is no longer a regular non-symlink file");
    } catch (error) {
      console.error(`Refusing to apply — target safety changed for ${edit.file}: ${error.message}`);
      return 1;
    }
    writeFileSync(edit.absolute, edit.after, "utf8");
    console.log(`Applied: ${edit.file}`);
  }
  console.log("\nDone. This script did not stage or commit — review `git diff` and commit yourself.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((code) => process.exit(code));
}
