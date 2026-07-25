#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * po-guarded-push — PO-run pusher for a branch whose guard-push evidence
 * check cannot honestly pass because the failing Verify/Security suites are
 * inherited from the branch's base and are out of scope for the branch's own
 * diff (e.g. owned by a different, parallel session working on `main`).
 *
 * WHY THIS FILE EXISTS
 *   guard-push.mjs (a Claude Code PreToolUse hook, plugins/pipeline-core/hooks/guard-push.mjs)
 *   requires evidence/verify-latest.json and evidence/security-latest.json to
 *   be fresh (bound to the exact pushed commit) AND exitCode === 0, with no
 *   override mechanism — by design, the same "binds agents, not humans"
 *   boundary as guard-testpath.mjs (see po-guarded-edit.mjs in this same
 *   directory). It has no in-session escape hatch, even with explicit PO
 *   confirmation in the transcript: an agent session cannot honestly claim
 *   exitCode 0 when it is not, and must not fabricate evidence to satisfy the
 *   gate.
 *   The documented fallback for exactly this situation is the PO running the
 *   push themselves, outside any guarded session. There are no actual git
 *   hooks installed (.git/hooks/pre-push does not exist) — guard-push only
 *   intercepts an agent's own Bash/PowerShell tool calls inside a session, so
 *   this script does not disable, patch, or bypass anything; it simply runs
 *   the same `git push` a human could always run directly. Wrapping it here
 *   exists only to force a deliberate reason and leave a durable record, the
 *   same generalization request that produced po-guarded-edit.mjs.
 *
 * THIS IS NOT A GENERAL "SKIP TESTS AND PUSH" TOOL.
 *   Use it only when you (the PO) have independently confirmed that every
 *   failing suite is pre-existing on the branch's base / unrelated to the
 *   branch's own diff — never to push a branch whose OWN changes broke
 *   something. Each run requires --reason; it is recorded verbatim in the
 *   audit log, not summarized or inferred.
 *
 * SAFETY MODEL
 *   - Refuses to run unless stdin is an interactive TTY (never agent-driven).
 *   - Requires the operator to type the literal word "yes" after reviewing
 *     the exact branch/remote/commit/reason and the current verify/security
 *     evidence exit codes it is overriding.
 *   - Refuses `main`/`master` outright — a hard-coded boundary, not a flag.
 *     Use the ordinary guarded path for main; that is where exitCode===0
 *     matters most.
 *   - Refuses if the checked-out branch does not match the requested
 *     --branch (protects against pushing the wrong branch by accident).
 *   - Never force-pushes, never deletes a ref, never rewrites history: a
 *     plain `git push -u <remote> <branch>` only, via execFile (no shell).
 *   - Appends one NDJSON record to evidence/dirty-push-log.ndjson (branch,
 *     remote, commit, ISO timestamp, reason, and the verify/security
 *     exitCodes being overridden) BEFORE pushing, so a failed push still
 *     leaves the record. Does not stage or commit that file — review
 *     `git diff` and commit it yourself, same as po-guarded-edit.mjs.
 *
 * USAGE (run directly by the PO, never via an agent's Bash/PowerShell tool):
 *   node plugins/pipeline-core/scripts/po-guarded-push.mjs \
 *     --branch feat/sentinel-windows-34-37-close \
 *     --reason "8 pre-existing suites red on origin/main baseline (SSH alias, Codex CLI absent, license/doc-contract drift) -- verified identical on a clean origin/main worktree, none touch this branch's diff"
 *
 * VERIFY: node plugins/pipeline-core/scripts/po-guarded-push.test.mjs
 */
import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

const FORBIDDEN_BRANCHES = new Set(["main", "master"]);
const MIN_REASON_LENGTH = 20;

/** Pure argv parsing; no I/O. */
export function parseArgs(argv) {
  const args = { branch: null, remote: "origin", reason: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--branch") args.branch = argv[++i] ?? null;
    else if (token === "--remote") args.remote = argv[++i] ?? "origin";
    else if (token === "--reason") args.reason = argv[++i] ?? null;
  }
  return args;
}

/** Pure validation; no I/O. currentBranch is passed in, not read here. */
export function validateRequest({ branch, remote, reason, currentBranch }) {
  const errors = [];
  if (!branch) errors.push('missing required "--branch <name>"');
  if (branch && FORBIDDEN_BRANCHES.has(branch)) {
    errors.push(`refusing "${branch}" — this script never pushes main/master, use the ordinary guarded path`);
  }
  if (!remote) errors.push('missing "--remote" (default is "origin")');
  if (!reason || reason.trim().length < MIN_REASON_LENGTH) {
    errors.push(`missing or too-short "--reason" (>= ${MIN_REASON_LENGTH} chars) — state exactly why every failing suite is pre-existing/out of scope`);
  }
  if (branch && currentBranch && branch !== currentBranch) {
    errors.push(`checked-out branch "${currentBranch}" does not match requested --branch "${branch}" — refusing to push the wrong branch`);
  }
  return { ok: errors.length === 0, errors };
}

/** Best-effort read of one evidence file's exitCode; never throws. */
function readExitCode(repoRoot, relPath) {
  try {
    const raw = readFileSync(join(repoRoot, relPath), "utf8");
    const data = JSON.parse(raw);
    return typeof data.exitCode === "number" ? data.exitCode : null;
  } catch {
    return null;
  }
}

/** Pure record construction; no I/O. */
export function buildAuditRecord({ branch, remote, reason, commit, verifyExitCode, securityExitCode, timestamp }) {
  return {
    schema: "pipeline.po-guarded-push-audit.v1",
    timestamp,
    branch,
    remote,
    commit,
    reason,
    overriddenEvidence: { verifyExitCode, securityExitCode },
  };
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
  const args = parseArgs(argv.slice(2));
  const repoRoot = env.CLAUDE_PROJECT_DIR || process.cwd();

  let currentBranch = null;
  try {
    currentBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot }).toString().trim();
  } catch (e) {
    console.error(`Cannot resolve the checked-out branch: ${e.message}`);
    return 1;
  }

  const check = validateRequest({ ...args, currentBranch });
  if (!check.ok) {
    console.error("Refusing to push — validation failed:");
    for (const error of check.errors) console.error(`  - ${error}`);
    return 1;
  }

  let commit;
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot }).toString().trim();
  } catch (e) {
    console.error(`Cannot resolve HEAD: ${e.message}`);
    return 1;
  }

  const verifyExitCode = readExitCode(repoRoot, "evidence/verify-latest.json");
  const securityExitCode = readExitCode(repoRoot, "evidence/security-latest.json");
  const record = buildAuditRecord({
    branch: args.branch,
    remote: args.remote,
    reason: args.reason,
    commit,
    verifyExitCode,
    securityExitCode,
    timestamp: new Date().toISOString(),
  });

  console.log(
    "This script pushes a branch outside the in-session guard-push evidence gate. Run it " +
      "directly in your own terminal — it refuses to run when stdin is not an interactive TTY, " +
      "so it cannot be driven unattended by an agent session.\n",
  );
  console.log(`branch:   ${record.branch}`);
  console.log(`remote:   ${record.remote}`);
  console.log(`commit:   ${record.commit}`);
  console.log(`verify evidence exitCode:   ${JSON.stringify(record.overriddenEvidence.verifyExitCode)}`);
  console.log(`security evidence exitCode: ${JSON.stringify(record.overriddenEvidence.securityExitCode)}`);
  console.log(`reason:   ${record.reason}\n`);

  if (!process.stdin.isTTY) {
    console.error("Refusing to run non-interactively (stdin is not a TTY). Nothing was pushed.");
    return 2;
  }
  const proceed = await confirm(`Push ${record.branch} to ${record.remote} despite the evidence above? Type "yes" to proceed: `);
  if (!proceed) {
    console.log("Aborted — nothing was pushed, no audit record written.");
    return 2;
  }

  const logPath = join(repoRoot, "evidence", "dirty-push-log.ndjson");
  appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
  console.log(`Audit record appended: evidence/dirty-push-log.ndjson`);

  try {
    execFileSync("git", ["push", "-u", record.remote, record.branch], { cwd: repoRoot, stdio: "inherit" });
  } catch (e) {
    console.error(`\ngit push failed: ${e.message}`);
    console.error("The audit record above was already written even though the push failed — review it.");
    return 1;
  }

  console.log(
    "\nDone. This script did not stage or commit the audit log — review `git diff` and commit " +
      "evidence/dirty-push-log.ndjson yourself.",
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((code) => process.exit(code));
}
