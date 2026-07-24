#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * po-guarded-push — PO-run, interactive pusher for a non-main branch with
 * the same exact passing Verify/Security evidence required by the ordinary
 * guarded path.
 *
 * WHY THIS FILE EXISTS
 *   guard-push.mjs (a Claude Code PreToolUse hook, plugins/pipeline-core/hooks/guard-push.mjs)
 *   requires evidence/verify-latest.json and evidence/security-latest.json to
 *   be fresh (bound to the exact pushed commit and tree) AND exitCode === 0.
 *   This script preserves that boundary for human-run non-main pushes while
 *   additionally requiring an interactive confirmation and audit record.
 *
 * THIS IS NOT A TEST OR SECURITY OVERRIDE TOOL.
 *   A failed, missing, stale, or misbound gate always refuses before the
 *   confirmation prompt. Each run requires --reason; it is recorded verbatim
 *   in the audit log, not summarized or inferred.
 *
 * SAFETY MODEL
 *   - Refuses to run unless stdin is an interactive TTY (never agent-driven).
 *   - Requires the operator to type the literal word "yes" after reviewing
 *     the exact branch/remote/commit/reason and the passing evidence binding.
 *   - Refuses `main`/`master` outright — a hard-coded boundary, not a flag.
 *     Use the ordinary guarded path for main; that is where exitCode===0
 *     matters most.
 *   - Refuses if the checked-out branch does not match the requested
 *     --branch (protects against pushing the wrong branch by accident).
 *   - Never force-pushes, never deletes a ref, never rewrites history: a
 *     plain `git push -u <remote> <branch>` only, via execFile (no shell).
 *   - Appends one NDJSON record to evidence/dirty-push-log.ndjson (branch,
 *     remote, commit, tree, ISO timestamp, reason, and exact gate bindings)
 *     BEFORE pushing, so a failed push still
 *     leaves the record. Does not stage or commit that file — review
 *     `git diff` and commit it yourself, same as po-guarded-edit.mjs.
 *
 * USAGE (run directly by the PO, never via an agent's Bash/PowerShell tool):
 *   node plugins/pipeline-core/scripts/po-guarded-push.mjs \
 *     --branch feat/sentinel-windows-34-37-close \
 *     --reason "PO-reviewed release branch publication"
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

/** Reads an exact, clean, passing gate record for the commit/tree being pushed. */
export function readExactPassingEvidence(repoRoot, relPath, commit, tree) {
  try {
    const raw = readFileSync(join(repoRoot, relPath), "utf8");
    const data = JSON.parse(raw);
    const candidate = data.candidate ?? {};
    const evidenceCommit = data.commit ?? candidate.commit ?? null;
    const evidenceTree = data.tree ?? candidate.tree ?? null;
    return {
      valid: data.exitCode === 0 && evidenceCommit === commit && evidenceTree === tree
        && (candidate.status === undefined || candidate.status === "clean"),
      exitCode: typeof data.exitCode === "number" ? data.exitCode : null,
      commit: evidenceCommit,
      tree: evidenceTree,
    };
  } catch {
    return { valid: false, exitCode: null, commit: null, tree: null };
  }
}

/** Pure record construction; no I/O. */
export function buildAuditRecord({ branch, remote, reason, commit, tree, verifyEvidence, securityEvidence, timestamp }) {
  return {
    schema: "pipeline.po-guarded-push-audit.v2",
    timestamp,
    branch,
    remote,
    commit,
    tree,
    reason,
    evidence: { verify: verifyEvidence, security: securityEvidence },
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
  let tree;
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot }).toString().trim();
    tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repoRoot }).toString().trim();
  } catch (e) {
    console.error(`Cannot resolve HEAD: ${e.message}`);
    return 1;
  }

  const verifyEvidence = readExactPassingEvidence(repoRoot, "evidence/verify-latest.json", commit, tree);
  const securityEvidence = readExactPassingEvidence(repoRoot, "evidence/security-latest.json", commit, tree);
  if (!verifyEvidence.valid || !securityEvidence.valid) {
    console.error("Refusing to push — Verify and Security must both be exact, clean, passing evidence for HEAD.");
    return 1;
  }
  const record = buildAuditRecord({
    branch: args.branch,
    remote: args.remote,
    reason: args.reason,
    commit,
    tree,
    verifyEvidence,
    securityEvidence,
    timestamp: new Date().toISOString(),
  });

  console.log("This script enforces the exact passing gate before an interactive human branch push.\n");
  console.log(`branch:   ${record.branch}`);
  console.log(`remote:   ${record.remote}`);
  console.log(`commit:   ${record.commit}`);
  console.log(`tree:     ${record.tree}`);
  console.log(`verify evidence:   ${JSON.stringify(record.evidence.verify)}`);
  console.log(`security evidence: ${JSON.stringify(record.evidence.security)}`);
  console.log(`reason:   ${record.reason}\n`);

  if (!process.stdin.isTTY) {
    console.error("Refusing to run non-interactively (stdin is not a TTY). Nothing was pushed.");
    return 2;
  }
  const proceed = await confirm(`Push ${record.branch} to ${record.remote} with the passing evidence above? Type "yes" to proceed: `);
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
