#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * capture-evidence.mjs -- the easy path for capturing a command's stdout/stderr into a tracked
 * evidence artifact, with this machine's absolute repository path (and home directory) replaced
 * by a stable placeholder BEFORE the bytes reach disk.
 *
 * WHY. `scratch/strip-redevidence.md` (NVA-B-REDCAPTURE-1): reproduce-first RED evidence is
 * required by briefings and ADR-0063, and a failing `node --test` run embeds Node's own assertion
 * stack traces, which carry the repository's absolute path in `file://` URL form. A GREEN capture
 * never does, because a passing run prints no stack traces -- so the trap fires only on the
 * artifact that must be captured first, and history cannot be rewritten once the bytes are
 * committed (guard union forbids it). The remedy that has failed twice in one day is "remember to
 * redact, then check" -- a post-write sanitising pass is not a remedy, because a rewritten
 * commit's earlier ancestor already carries the bytes. This script makes redaction the thing that
 * happens BEFORE the write, not after.
 *
 * REPOSITORY ROOT. Determined via `git rev-parse --show-toplevel` from the invoking process's
 * cwd -- never guessed from this script's own on-disk location, which would silently differ
 * between a source checkout and a plugin-symlinked install. A cwd outside any Git working tree is
 * a hard stop (thrown), not a guess: redacting against a wrong root would produce artifacts
 * redacted on one machine and not on another, which is worse than no tool (briefing stop
 * condition).
 *
 * ARTIFACT SHAPE. Matches the de facto convention already in `backlog/evidence/`
 * (`command:` / `label:` / `exitCode:` / `--- stdout ---` / `--- stderr ---`).
 *
 * CLI: `node plugins/pipeline-core/scripts/capture-evidence.mjs --out <path> --label <label> --
 *   <command> [args...]`
 * Exit code: the WRAPPED command's own exit code, always -- capturing a RED run must not look
 * green. A failure inside this script itself (cannot determine repo root, cannot write the
 * artifact, the wrapped command never ran to completion) exits 1 and never silently reports a
 * wrapped exit code it never observed.
 *
 * SPAWN FAILURE AND OVERFLOW. A non-zero exit and a spawn failure are different things and must
 * never collapse into the same reported outcome. `spawnSync` reports both an ordinary ENOENT
 * (command not found) AND a `maxBuffer` overflow (output larger than the buffer) the same way:
 * `result.error` set, `status: null`, `stdout`/`stderr` truncated or absent. Both cases throw
 * here and write NO artifact at all -- never a truncated-but-plausible-looking capture, never a
 * fabricated exit code. `maxBuffer` defaults to 64 MiB and is caller-overridable.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const REPO_ROOT_PLACEHOLDER = "<repo-root>";
export const HOME_PLACEHOLDER = "<home>";

/** Resolve the Git repository root for `cwd` via `git rev-parse --show-toplevel`. Throws --
 * never guesses -- when `cwd` is not inside a Git working tree. */
export function findRepoRoot(cwd = process.cwd()) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (result.status !== 0 || !result.stdout || !result.stdout.trim()) {
    const detail = result.stderr ? result.stderr.trim() : `git exited ${result.status ?? "unknown"}`;
    throw new Error(`capture-evidence: could not determine the repository root via \`git rev-parse --show-toplevel\` (${detail}).`);
  }
  return result.stdout.trim();
}

function replaceAll(text, needle, replacement) {
  if (!needle) return text;
  return text.split(needle).join(replacement);
}

/**
 * Redact `repoRoot` (plain-path and `file://`-prefixed occurrences alike -- a `file://` URL
 * simply contains the repo-root string as a substring after its scheme) and, separately,
 * `homeDir` occurrences that survive that first pass (i.e. outside the repository path).
 */
export function redactText(text, repoRoot, homeDir) {
  if (typeof text !== "string" || text === "") return text;
  let result = replaceAll(text, repoRoot, REPO_ROOT_PLACEHOLDER);
  if (homeDir && homeDir !== repoRoot) {
    result = replaceAll(result, homeDir, HOME_PLACEHOLDER);
  }
  return result;
}

function quoteIfNeeded(token) {
  return /\s/u.test(token) ? JSON.stringify(token) : token;
}

export function formatArtifact({ command, label, exitCode, stdout, stderr }) {
  return `command: ${command}\nlabel: ${label}\nexitCode: ${exitCode}\n--- stdout ---\n${stdout ?? ""}\n--- stderr ---\n${stderr ?? ""}`;
}

/**
 * Run `command` (an argv array), capture and redact its stdout/stderr, and write the artifact to
 * `out`. Returns `{ exitCode, out }`; `exitCode` is always the wrapped command's own exit code
 * (0 for a signal-terminated child is never reported -- a killed child reports exit code 1, since
 * "no observed exit code" must never render as green).
 */
export function captureEvidence({
  command,
  label,
  out,
  cwd = process.cwd(),
  repoRoot,
  homeDir = homedir(),
  maxBuffer = 64 * 1024 * 1024,
}) {
  if (!Array.isArray(command) || command.length === 0) {
    throw new Error("capture-evidence: command must be a non-empty argv array");
  }
  if (!label) throw new Error("capture-evidence: label is required");
  if (!out) throw new Error("capture-evidence: out is required");

  const root = repoRoot ?? findRepoRoot(cwd);
  const result = spawnSync(command[0], command.slice(1), { cwd, encoding: "utf8", maxBuffer });
  if (result.error) {
    // The wrapped command never produced a real exit code -- a spawn failure (e.g. ENOENT), or a
    // `maxBuffer` overflow (Node reports this as an ENOBUFS-shaped `error`, with `status: null`
    // and truncated/absent `stdout`/`stderr`). Writing an artifact in either case would report a
    // plausible-looking exit code and a plausible-looking (but silently truncated) transcript for
    // a run that never actually completed -- the same "confident-wrong evidence" class this tool
    // exists to prevent, just in the other direction. Fail loudly instead: throw, write nothing.
    throw new Error(`capture-evidence: the wrapped command did not run to completion (${result.error.message}).`);
  }
  const exitCode = result.status === null ? 1 : result.status;
  const stdout = redactText(result.stdout ?? "", root, homeDir);
  const stderr = redactText(result.stderr ?? "", root, homeDir);
  const commandLine = redactText(command.map(quoteIfNeeded).join(" "), root, homeDir);
  const artifactText = formatArtifact({ command: commandLine, label, exitCode, stdout, stderr });

  const resolvedOut = resolve(out);
  mkdirSync(dirname(resolvedOut), { recursive: true });
  writeFileSync(resolvedOut, artifactText);

  return { exitCode, out: resolvedOut };
}

function parseArgs(argv) {
  const sepIndex = argv.indexOf("--");
  if (sepIndex < 0) {
    throw new Error("usage: capture-evidence.mjs --out <path> --label <label> -- <command> [args...]");
  }
  const flags = argv.slice(0, sepIndex);
  const command = argv.slice(sepIndex + 1);
  if (command.length === 0) {
    throw new Error("usage: capture-evidence.mjs --out <path> --label <label> -- <command> [args...]");
  }
  let out;
  let label;
  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i] === "--out") {
      out = flags[i + 1];
      i += 1;
    } else if (flags[i] === "--label") {
      label = flags[i + 1];
      i += 1;
    } else {
      throw new Error(`usage: capture-evidence.mjs --out <path> --label <label> -- <command> [args...] (unrecognized flag ${flags[i]})`);
    }
  }
  if (!out) throw new Error("usage: capture-evidence.mjs requires --out <path>");
  if (!label) throw new Error("usage: capture-evidence.mjs requires --label <label>");
  return { out, label, command };
}

function runCli() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  try {
    const { exitCode, out } = captureEvidence(parsed);
    process.stdout.write(`capture-evidence: wrote ${out} (wrapped exit code ${exitCode})\n`);
    process.exitCode = exitCode;
  } catch (error) {
    process.stderr.write(`capture-evidence: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (isDirectInvocation(import.meta.url)) runCli();
