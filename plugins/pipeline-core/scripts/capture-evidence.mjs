#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * capture-evidence.mjs -- the easy path for capturing a command's stdout/stderr into a tracked
 * evidence artifact, with this machine's absolute repository path (and home directory) replaced
 * by a stable placeholder BEFORE the bytes reach disk.
 *
 * WHY. `backlog/items/2026-09-02-red-evidence-captured-from-node-test-embeds-the-absolute-repository-path.md`
 * (NVA-B-REDCAPTURE-1): reproduce-first RED evidence is
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
 * Redact `repoRoot` (plain-path and `file://`-prefixed occurrences alike) and, separately,
 * `homeDir` occurrences that survive that first pass (i.e. outside the repository path).
 *
 * BOUNDED CLAIM, not a general one: a `file://` URL contains the repo-root string as a plain
 * substring after its scheme only when the path itself needs no percent-encoding. A path
 * containing a character a URL must encode (a space becomes `%20`, for example -- and this
 * repository is stated to run on two machines with different local paths, so this is not a
 * hypothetical) breaks that substring match, and the literal `repoRoot`/`homeDir` replace below
 * silently fails to find it. `findResidualHostPath` below exists precisely because this function
 * cannot be trusted to be complete on its own -- it is the fail-closed backstop, not this pass.
 */
export function redactText(text, repoRoot, homeDir) {
  if (typeof text !== "string" || text === "") return text;
  let result = replaceAll(text, repoRoot, REPO_ROOT_PLACEHOLDER);
  if (homeDir && homeDir !== repoRoot) {
    result = replaceAll(result, homeDir, HOME_PLACEHOLDER);
  }
  return result;
}

/**
 * Covered shapes (AC-2), each as a literal spelling and a percent-encoded-separator spelling
 * (AC-3 -- catches the case where a path was run through a generic URI-component encoder that
 * percent-encodes `/` and `\` themselves, rather than `pathToFileURL`'s narrower per-character
 * encoding that leaves ordinary separators alone):
 *
 *   - POSIX user-home path:      /home/<name>/...
 *   - macOS user-home path:      /Users/<name>/...
 *   - Windows drive-letter path: C:\...  and the C:/... forward-slash spelling
 *
 * The word-boundary lookbehind on both drive-letter patterns exists to avoid a false positive on
 * the "e:/" tail of an ordinary URL scheme like `file://` (a real false positive found empirically
 * against this file's own existing test fixtures). For the percent-encoded drive-letter pattern
 * specifically (NVA-B-REDFIX-1 F4), a plain word-character lookbehind alone made a REAL shape
 * unreachable: in a fully percent-encoded file URL (`file://%2FC%3A%2F...`), the drive letter is
 * legitimately preceded by the trailing `F` of the encoded path separator `%2F`, which the plain
 * lookbehind excluded identically to an ordinary mid-word letter. The pattern below therefore also
 * permits a match immediately after `%2F`/`%5C` (the encoded `/` and `\` separators) while still
 * excluding an ordinary mid-word letter -- see `capture-evidence.test.mjs` for both the
 * false-negative repro this replaces and the false-positive guard it must not reopen.
 */
const RESIDUAL_HOST_PATH_PATTERNS = Object.freeze([
  { name: "posix-home", regex: /\/home\/[^\s"'<>]+/gu },
  { name: "posix-home-percent-encoded", regex: /%2[fF]home%2[fF][^\s"'<>]*/gu },
  { name: "macos-home", regex: /\/Users\/[^\s"'<>]+/gu },
  { name: "macos-home-percent-encoded", regex: /%2[fF]Users%2[fF][^\s"'<>]*/gu },
  // Excludes a drive letter immediately preceded by another letter/digit/underscore/percent so
  // this does not fire on the "e:/" tail of an ordinary URL scheme like "file://" or "https://"
  // (a real false positive found empirically against this file's own existing test fixtures).
  { name: "windows-drive-letter", regex: /(?<![A-Za-z0-9_%])[A-Za-z]:[\\/][^\s"'<>]*/gu },
  // See the doc comment above: also permits the match right after an encoded `/` or `\`
  // separator (`%2F`/`%5C`), which a plain word-character lookbehind alone silently excluded.
  { name: "windows-drive-letter-percent-encoded", regex: /(?:(?<![A-Za-z0-9_%])|(?<=%2[fF])|(?<=%5[cC]))[A-Za-z]%3[aA][%\\/][^\s"'<>]*/gu },
]);

/**
 * Scan `text` for the earliest (lowest character-offset) surviving absolute host path among the
 * covered shapes. Returns `{ name, offset }` for the first match found, or `null` when none
 * survive. Deliberately returns only the pattern's NAME and OFFSET, never the matched substring
 * itself (AC-4) -- callers use this to build a refusal message, and a message carrying the
 * matched path would reproduce the exact defect this tool exists to prevent, one layer up.
 */
export function findResidualHostPath(text) {
  let earliest = null;
  for (const { name, regex } of RESIDUAL_HOST_PATH_PATTERNS) {
    regex.lastIndex = 0;
    const match = regex.exec(text);
    if (match && (earliest === null || match.index < earliest.offset)) {
      earliest = { name, offset: match.index };
    }
  }
  return earliest;
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

  // Fail-closed backstop (sibling of the spawn-failure throw above): redaction is a best-effort
  // string replace, not a proof. Refuse to write anything -- no partial file, no empty file, no
  // directory created that did not already exist -- if a known host-path shape survived it.
  const residual = findResidualHostPath(artifactText);
  if (residual) {
    throw new Error(
      `capture-evidence: refused to write -- a surviving absolute host path (shape: ${residual.name}) was ` +
        `found in the assembled artifact at character offset ${residual.offset}. No file was written.`,
    );
  }

  // F-E (NVA-B-REDFIX-2): resolve `out` against the CALLER'S `cwd`, not the implicit
  // `process.cwd()` -- `cwd` is an explicit, documented parameter of this function's call shape
  // (spawnSync above already uses it), so a caller whose `cwd` differs from the running process's
  // own directory previously got a silent divergence: the wrapped command ran in `cwd`, but a
  // relative `out` landed relative to `process.cwd()` instead. `resolve(cwd, out)` is a no-op for
  // an already-absolute `out` (every existing call site, including the CLI, passes one), so this
  // only changes behavior for a relative `out` combined with a non-default `cwd`.
  const resolvedOut = resolve(cwd, out);
  mkdirSync(dirname(resolvedOut), { recursive: true });
  writeFileSync(resolvedOut, artifactText);

  return { exitCode, out: resolvedOut };
}

export function parseArgs(argv) {
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

/**
 * Redact `text` against `repoRoot`/`homeDir`, then run the fail-closed backstop
 * (`findResidualHostPath`) on the REDACTED result before it is allowed to reach a CLI output
 * channel (F-B, NVA-B-REDFIX-2). `captureEvidence`'s backstop above only ever covered the
 * artifact BODY written to disk -- every message this CLI prints on its own (three error paths,
 * one success line) bypassed it entirely, so an `--out` resolving outside both `repoRoot` and
 * `homeDir` (a second checkout under another account, a `homedir()` that differs from the one
 * that produced a stray path, a symlink-resolved temp root) rendered a raw absolute host path on
 * stdout/stderr with nothing to catch it -- `redactText` is a prefix-exact string replace (see
 * its own header) and is silently incomplete on anything outside those two prefixes.
 *
 * Returns the redacted text when clean, or `null` when a residual host-path shape survives.
 * `null`, never the offending text, mirrors `findResidualHostPath`'s own AC-4 contract: a caller
 * building a fallback message names what happened, never repeats the leaking substring one layer
 * up in its own fallback string.
 */
function redactedOrNull(text, repoRoot, homeDir) {
  const redacted = redactText(text, repoRoot, homeDir);
  return findResidualHostPath(redacted) ? null : redacted;
}

// F2 (NVA-B-REDFIX-1) + F-A/F-B (NVA-B-REDFIX-2): captureEvidence() redacts the artifact BODY, but
// this CLI's own stdout/stderr are a separate channel -- exactly the absolute-host-path leak this
// tool exists to prevent, one layer up, on the channel a dispatch pastes verbatim into a report.
// repoRoot/homeDir are now resolved BEFORE parseArgs runs (F-A: parseArgs can itself throw, and
// its message interpolates the raw argv token verbatim -- an unsupported flag spelling such as
// `--out=<path>` puts a whole absolute path into that message, so this channel needs the same
// treatment as the other two, not none at all; repoRoot is not known yet at this point, so this
// path redacts against cwd, same as the findRepoRoot catch below already did). Every one of the
// four write sites below now goes through `redactedOrNull`, applying BOTH `redactText` and the
// `findResidualHostPath` backstop (F-B) -- never just the best-effort string replace alone.
//
// Design decision on a backstop hit: the exit-code contract (this file's header: "always the
// WRAPPED command's own exit code... never masked") is preserved without exception in both
// directions. The three error paths already set exitCode=1 regardless of message content, so a
// hit there only swaps the message text, never the code. The success line is different: by the
// time it runs, captureEvidence() has ALREADY written the artifact to disk, past its own
// redaction-plus-backstop check on the artifact body -- refusing to PRINT this line is not the
// same claim as refusing to TRUST that completed, already-checked write, and forcing exitCode=1
// here would misreport a wrapped command that actually ran to completion as an internal tool
// failure. So the success path keeps reporting the real wrapped exit code even when the artifact's
// own path cannot be safely printed; the operator is told a file WAS written and what it reported,
// just not exactly where, and can still locate it via the (redacted, known-safe) --out argument
// they supplied on the command line.
function runCli() {
  const cwd = process.cwd();
  const homeDir = homedir();
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    const safe = redactedOrNull(error.message, cwd, homeDir);
    process.stderr.write(
      `${safe ?? "capture-evidence: refused to print the argument error -- it contains an absolute host path outside the redaction boundary. Re-run with a shorter --out value to diagnose."}\n`,
    );
    process.exitCode = 1;
    return;
  }
  let repoRoot;
  try {
    repoRoot = findRepoRoot(cwd);
  } catch (error) {
    // repoRoot is not known yet here -- redact against cwd (the closest stand-in) and homeDir.
    const safe = redactedOrNull(error.message, cwd, homeDir);
    process.stderr.write(
      `capture-evidence: ${safe ?? "refused to print the repository-root error -- it contains an absolute host path outside the redaction boundary."}\n`,
    );
    process.exitCode = 1;
    return;
  }
  try {
    const { exitCode, out } = captureEvidence({ ...parsed, cwd, repoRoot, homeDir });
    const safeOut = redactedOrNull(out, repoRoot, homeDir);
    if (safeOut === null) {
      process.stdout.write(
        `capture-evidence: wrote the artifact (wrapped exit code ${exitCode}); its path cannot be safely printed -- it contains an absolute host path outside the redaction boundary.\n`,
      );
    } else {
      process.stdout.write(`capture-evidence: wrote ${safeOut} (wrapped exit code ${exitCode})\n`);
    }
    process.exitCode = exitCode;
  } catch (error) {
    const safe = redactedOrNull(error.message, repoRoot, homeDir);
    process.stderr.write(
      `capture-evidence: ${safe ?? "refused to print the error -- it contains an absolute host path outside the redaction boundary."}\n`,
    );
    process.exitCode = 1;
  }
}

if (isDirectInvocation(import.meta.url)) runCli();
