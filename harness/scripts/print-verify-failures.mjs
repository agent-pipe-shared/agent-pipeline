#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * print-verify-failures.mjs — reads the verify evidence artifact plus the
 * private journal run directory for that run and prints, for every suite
 * that exited non-zero, its name, exit code, log path, and a bounded,
 * redacted tail of its captured stdout/stderr.
 *
 * WHY THIS EXISTS (NVA-B-CIDIAG). verify.mjs deliberately keeps complete suite
 * stdout/stderr in owner-private bounded logs and gives the interactive
 * channel only bounded machine-readable progress records (verify.mjs ~44-47).
 * That is the right default for an interactive session, but it left a CI
 * step log self-explaining nothing on failure: run 33471808564 failed with
 * three suites red and the step log carried only `diagnosticDigest` values,
 * no assertion text — an operator had to re-run locally or pull a private
 * artifact to see WHY. This script is the explicitly-invoked exception to
 * that contract: it never runs as part of `verify.mjs` itself, only when a
 * caller names it, and a CI step now does exactly that on failure (see
 * .github/workflows/verify.yml, step "Surface failing suite diagnostics",
 * `if: failure()`).
 *
 * IT IS A REPORTER, NEVER A GATE. It always exits 0 — whether or not any
 * failing suite is found, whether or not its own inputs are available. A
 * missing evidence artifact, a missing run directory, a missing per-suite
 * log, or unparsable JSON are all degraded to one bounded diagnostic line
 * naming what was missing; none of them throws.
 *
 * INPUT SHAPE. `evidence/verify-latest.json` (schema `pipeline.verify-evidence.v0`,
 * verify.mjs ~893-912) carries `steps[]` (`{name, exitCode, durationMs, reused}`)
 * and `verifyRun.runId`. The private journal run directory lives at
 * `<git-common-dir>/agent-pipeline/verify/runs/<runId>` (verify-journal.mjs
 * createVerifyRun/runVerifyJournal); each suite's sealed receipt is
 * `receipts/<verifySuiteArtifactName(suite.id)>.json` (verify-resume.mjs
 * ROOT_RECEIPT_KEYS) and its `log.path` is receipt-relative
 * (`logs/<artifact>.log`). `verifySuiteArtifactName` is a SHA-256 hex digest
 * of the suite id, never a human-readable slug — it is imported from
 * verify-journal.mjs rather than re-derived, per that module's own contract.
 *
 * NOT EVERY FAILING `steps[]` ENTRY IS A SUITE WITH A RECEIPT. Some entries
 * are synthetic preflight/aggregation steps verify.mjs pushes itself
 * (`candidate-preflight`, `verify-journal`, `verify-suite-registration-duplicates`,
 * `verify-terminal-coverage`, `candidate-binding`, the manual-check
 * placeholder, ...) that never went through runVerifyJournal and therefore
 * have no receipt/log. Those degrade through the exact same
 * "no suite log available" branch as a genuinely missing receipt/log would —
 * there is no special-case list of synthetic step names to keep in sync.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifySuiteArtifactName } from "../../plugins/pipeline-core/scripts/verify-journal.mjs";

export { verifySuiteArtifactName };

// AC-2: bounds are named constants, never magic numbers inline.
export const MAX_LINES_PER_SUITE = 200;
export const MAX_BYTES_PER_SUITE = 20000;
export const MAX_TOTAL_BYTES = 200000;

// AC-3: defence in depth for a log a CI step publishes — not a claim the logs
// contain secrets. A redacted span is replaced with this fixed marker; the
// surrounding line is preserved.
export const REDACTION_MARKER = "[REDACTED-CREDENTIAL]";

const GITHUB_TOKEN_RE = /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g;
const GITHUB_PAT_RE = /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g;
const AKIA_RE = /\bAKIA[0-9A-Z]{16}\b/g;
// Matches a PEM key-block marker line: dashes, the word BEGIN or END, an
// optional key-type word (RSA / EC / OPENSSH / ED25519 / ...), then the words
// PRIVATE and KEY, then closing dashes. Deliberately not spelled out here as
// one literal example string: a complete literal marker in a comment reads to
// a secret scanner as an embedded key header (measured: gitleaks rule
// "private-key" fired on exactly that literal in an earlier revision of this
// comment). No `g` flag on either pattern below: used with .test() per line,
// and a global-flag regex reused across .test() calls would leak lastIndex
// state.
const PRIVATE_KEY_BEGIN_RE = /-{5}BEGIN[\w ]*PRIVATE KEY-{5}/;
const PRIVATE_KEY_END_RE = /-{5}END[\w ]*PRIVATE KEY-{5}/;

/**
 * AC-3 redaction pass. Applied line by line (never across a line boundary):
 * a private-key block is tracked by BEGIN/END marker lines (the markers
 * themselves are structure, not secret material, and are left intact so the
 * redacted output still shows a key was present); every line strictly
 * between them is replaced whole. Outside such a block, each of the four
 * credential-shape patterns is redacted wherever it matches within the line,
 * the rest of the line is preserved.
 */
export function redactText(text) {
  const lines = text.split("\n");
  let insideKeyBlock = false;
  const redacted = lines.map((line) => {
    if (PRIVATE_KEY_BEGIN_RE.test(line)) { insideKeyBlock = true; return line; }
    if (PRIVATE_KEY_END_RE.test(line)) { insideKeyBlock = false; return line; }
    if (insideKeyBlock) return REDACTION_MARKER;
    return line
      .replace(GITHUB_TOKEN_RE, REDACTION_MARKER)
      .replace(GITHUB_PAT_RE, REDACTION_MARKER)
      .replace(AKIA_RE, REDACTION_MARKER);
  });
  return redacted.join("\n");
}

// NVA-B-CIGREEN-1. A pure TAIL bound is exactly the wrong bound for the one
// line this reporter exists to surface. `node:test` emits `not ok N - <name>`
// in test order, so a failure EARLY in a long suite is the first thing dropped,
// and the tail that survives carries only the summary counts. Measured: CI run
// 33551001455 reported codex-onboarding-capabilities-tests red with 22 of 23
// tests passing, and which test failed was unrecoverable from the step log —
// its line had fallen into the omitted head. Failure-marker lines are therefore
// recovered out of the omitted portion and re-attached ahead of the tail,
// bounded by their own count so this cannot become an unbounded second copy of
// the log.
export const MAX_RECOVERED_FAILURE_LINES = 20;
export const RECOVERED_FAILURE_HEADER = "--- failing lines recovered from the omitted head ---";
// Deliberately broad across reporters: TAP (`not ok`), this repo's own
// hand-rolled suites (`FAIL  <name>`), the node:test spec reporter (`✖`), and
// the assertion class name that carries the message itself.
//
// Every alternative is anchored to the start of the line (round-L finding F7).
// The `AssertionError` alternative used to be unanchored, so it claimed any
// line that merely MENTIONS the class -- a passing test whose name contains it,
// a stack frame, a `# Subtest:` header -- and those lines then competed for the
// bounded recovery budget with the actual failures. node:test prints the real
// one as `  AssertionError [ERR_ASSERTION]: ...`, at the start of its own line,
// so anchoring costs no genuine detection; the `[A-Za-z]*` prefix keeps the
// subclasses (`RangeError`-style wrappers, `TypeAssertionError`) that reporters
// emit in the same position.
export const FAILURE_LINE_RE = /^\s*(?:not ok\b|FAIL\b|✖|✗|×|#\s*fail\b|[A-Za-z]*AssertionError\b)/u;

// The share of MAX_BYTES_PER_SUITE the recovered-failure block may occupy. It
// has to be a RESERVE rather than a remainder: the tail is bounded first, so
// without a reserve the recovered lines would have nothing left to fit into on
// exactly the suites that need them most.
const RECOVERED_BLOCK_BYTE_SHARE = 0.5;

/**
 * AC-2 per-suite bounding: at most MAX_LINES_PER_SUITE lines, then at most
 * MAX_BYTES_PER_SUITE bytes — for the WHOLE returned text, recovered failure
 * lines included. Both bounds keep the TAIL (the end of the content — where an
 * assertion failure's own message lives), never the head: a byte-bound overflow
 * is resolved by slicing the last bytes of the already line-bounded text, not by
 * dropping whole lines, so one line longer than the byte cap still yields a
 * useful (if partial) tail instead of being dropped entirely.
 *
 * Whatever both bounds drop is then re-scanned for failure-marker lines, and up
 * to MAX_RECOVERED_FAILURE_LINES of them are re-attached ahead of the tail under
 * RECOVERED_FAILURE_HEADER: a truncation that hides the failing test's own line
 * defeats the whole reporter.
 *
 * Round-L finding F7: recovery used to run AFTER the byte bound and merely
 * recompute `keptBytes`, so the returned text could exceed MAX_BYTES_PER_SUITE
 * by the size of the recovered block. `keptBytes` is what the global gate
 * spends, so a single suite whose omitted head carried many long failure-marker
 * lines could exhaust MAX_TOTAL_BYTES and omit every LATER failing suite's tail
 * entirely. The bound is now ENFORCED across both parts: the recovered block is
 * admitted line by line within its own byte reserve, and the tail is then shrunk
 * to whatever the cap leaves, so `keptBytes <= MAX_BYTES_PER_SUITE` always holds
 * and is always the true byte length of `text`.
 */
export function boundSuiteTail(text) {
  const originalBytes = Buffer.byteLength(text, "utf8");
  const allLines = text.split("\n");
  // A trailing newline produces one phantom empty trailing element; drop it
  // so it is never counted or reported as its own line.
  if (allLines.length > 0 && allLines[allLines.length - 1] === "") allLines.pop();
  const totalLines = allLines.length;
  const lineTruncated = totalLines > MAX_LINES_PER_SUITE;
  const lineTail = lineTruncated ? allLines.slice(totalLines - MAX_LINES_PER_SUITE) : allLines;
  let keptText = lineTail.join("\n");
  let keptBytes = Buffer.byteLength(keptText, "utf8");
  let byteTruncated = false;
  if (keptBytes > MAX_BYTES_PER_SUITE) {
    byteTruncated = true;
    const buffer = Buffer.from(keptText, "utf8");
    keptText = buffer.subarray(buffer.length - MAX_BYTES_PER_SUITE).toString("utf8");
    keptBytes = Buffer.byteLength(keptText, "utf8");
  }
  // Line EQUALITY, not `includes`: a short failure line that happens to occur
  // inside any kept line was previously treated as already present and dropped
  // from recovery (round-L finding F7).
  const keptLines = new Set(keptText.split("\n"));
  const recoveredFailureLines = (lineTruncated || byteTruncated)
    ? allLines
      .filter((line) => FAILURE_LINE_RE.test(line) && !keptLines.has(line))
      .slice(0, MAX_RECOVERED_FAILURE_LINES)
    : [];
  if (recoveredFailureLines.length > 0) {
    const headerBytes = Buffer.byteLength(RECOVERED_FAILURE_HEADER, "utf8") + 1;
    const reserve = Math.min(
      Math.floor(MAX_BYTES_PER_SUITE * RECOVERED_BLOCK_BYTE_SHARE),
      MAX_BYTES_PER_SUITE,
    );
    const admitted = [];
    let blockBytes = headerBytes;
    for (const line of recoveredFailureLines) {
      const cost = Buffer.byteLength(line, "utf8") + 1;
      if (blockBytes + cost > reserve) break;
      admitted.push(line);
      blockBytes += cost;
    }
    if (admitted.length > 0) {
      // Enforce, don't recompute: the tail gives up exactly what the recovered
      // block takes, so the joined text is bounded by MAX_BYTES_PER_SUITE.
      const tailBudget = Math.max(0, MAX_BYTES_PER_SUITE - blockBytes);
      if (Buffer.byteLength(keptText, "utf8") > tailBudget) {
        byteTruncated = true;
        const buffer = Buffer.from(keptText, "utf8");
        keptText = buffer.subarray(buffer.length - tailBudget).toString("utf8");
      }
      keptText = [RECOVERED_FAILURE_HEADER, ...admitted, keptText].join("\n");
      keptBytes = Buffer.byteLength(keptText, "utf8");
    }
  }
  const keptLineCount = keptText.length === 0 ? 0 : keptText.split("\n").length;
  return {
    text: keptText,
    totalLines,
    keptLineCount,
    keptBytes,
    originalBytes,
    omittedBytes: originalBytes - keptBytes,
    truncated: lineTruncated || byteTruncated,
  };
}

/**
 * Shrinks an already per-suite-bounded tail further to fit a remaining
 * global-budget byte count (AC-2's MAX_TOTAL_BYTES, applied across all
 * suites). Same tail-keeping rule as boundSuiteTail: the LAST `remaining`
 * bytes are kept, not the first.
 */
function shrinkToRemainingBudget(bounded, remaining) {
  const buffer = Buffer.from(bounded.text, "utf8");
  const newText = buffer.subarray(Math.max(0, buffer.length - remaining)).toString("utf8");
  const newBytes = Buffer.byteLength(newText, "utf8");
  return { ...bounded, text: newText, keptBytes: newBytes, omittedBytes: bounded.originalBytes - newBytes, truncated: true };
}

/**
 * Pure report builder — AC-1/AC-2/AC-3/AC-4. Never throws: every failure
 * mode degrades to one bounded diagnostic line and an early return. Takes
 * plain paths (never does its own git-plumbing lookups) so it is directly
 * fixturable against a temporary directory in tests, independent of the CLI
 * entrypoint's git resolution below.
 *
 * `evidencePath`  — absolute path to the verify evidence artifact JSON.
 * `runsRoot`      — absolute path to `<git-common-dir>/agent-pipeline/verify/runs`.
 * `repoRoot`      — absolute path used only to render repo-relative paths in
 *                    the output; never read from.
 */
export function buildFailureReport({ evidencePath, runsRoot, repoRoot }) {
  const lines = [];

  let evidenceRaw;
  try {
    evidenceRaw = readFileSync(evidencePath, "utf8");
  } catch {
    lines.push(`PRINT-VERIFY-FAILURES-NO-EVIDENCE: no verify evidence artifact found at ${relative(repoRoot, evidencePath)}; nothing to report.`);
    return { lines };
  }

  let evidence;
  try {
    evidence = JSON.parse(evidenceRaw);
  } catch (error) {
    lines.push(`PRINT-VERIFY-FAILURES-CORRUPT-EVIDENCE: ${relative(repoRoot, evidencePath)} is not valid JSON (${String(error.message ?? error).slice(0, 120)}); nothing to report.`);
    return { lines };
  }

  if (!evidence || typeof evidence !== "object" || !Array.isArray(evidence.steps)) {
    lines.push(`PRINT-VERIFY-FAILURES-CORRUPT-EVIDENCE: ${relative(repoRoot, evidencePath)} does not have the expected shape (missing a "steps" array); nothing to report.`);
    return { lines };
  }

  const commit = typeof evidence.commit === "string" ? evidence.commit : "unknown";
  const failingSteps = evidence.steps.filter((step) => step && typeof step.name === "string" && typeof step.exitCode === "number" && step.exitCode !== 0);

  if (failingSteps.length === 0) {
    lines.push(`PRINT-VERIFY-FAILURES-NONE: no failing suites (commit ${commit}, ${evidence.steps.length} step(s) all exited 0).`);
    return { lines };
  }

  const runId = evidence.verifyRun && typeof evidence.verifyRun.runId === "string" ? evidence.verifyRun.runId : null;
  let runDir = null;
  if (runId === null) {
    lines.push("PRINT-VERIFY-FAILURES-NO-RUN-ID: verify evidence carries no verifyRun.runId; per-suite logs are unavailable for this run.");
  } else {
    const candidateRunDir = join(runsRoot, runId);
    if (existsSync(candidateRunDir)) {
      runDir = candidateRunDir;
    } else {
      lines.push(`PRINT-VERIFY-FAILURES-NO-RUN-DIR: journal run directory for runId ${runId} was not found under ${relative(repoRoot, runsRoot)}; per-suite logs are unavailable.`);
    }
  }

  let globalBytesUsed = 0;
  for (const step of failingSteps) {
    lines.push(`=== ${step.name} (exit ${step.exitCode}) ===`);
    if (runDir === null) {
      lines.push(`PRINT-VERIFY-FAILURES-NO-SUITE-LOG: no log available for suite "${step.name}" (no run directory).`);
      continue;
    }

    const artifact = verifySuiteArtifactName(step.name);
    const receiptPath = join(runDir, "receipts", `${artifact}.json`);
    let receipt;
    try {
      receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    } catch {
      lines.push(`PRINT-VERIFY-FAILURES-NO-SUITE-LOG: no suite receipt found for "${step.name}" at ${relative(repoRoot, receiptPath)}; log unavailable.`);
      continue;
    }

    const logRelPath = receipt && receipt.log && typeof receipt.log.path === "string" ? receipt.log.path : null;
    if (logRelPath === null) {
      lines.push(`PRINT-VERIFY-FAILURES-NO-SUITE-LOG: suite receipt for "${step.name}" carries no log reference.`);
      continue;
    }

    const logPath = join(runDir, logRelPath);
    let logBytes;
    try {
      logBytes = readFileSync(logPath);
    } catch {
      lines.push(`PRINT-VERIFY-FAILURES-NO-SUITE-LOG: log file for "${step.name}" not found at ${relative(repoRoot, logPath)}.`);
      continue;
    }

    lines.push(`log: ${relative(repoRoot, logPath)}`);
    const redacted = redactText(logBytes.toString("utf8"));
    let bounded = boundSuiteTail(redacted);
    let globalTruncated = false;

    if (globalBytesUsed + bounded.keptBytes > MAX_TOTAL_BYTES) {
      const remaining = MAX_TOTAL_BYTES - globalBytesUsed;
      if (remaining <= 0) {
        lines.push(`PRINT-VERIFY-FAILURES-TRUNCATED: "${step.name}" log tail omitted entirely (${bounded.keptBytes} byte(s)) -- the ${MAX_TOTAL_BYTES}-byte total output cap was already reached.`);
        continue;
      }
      bounded = shrinkToRemainingBudget(bounded, remaining);
      globalTruncated = true;
    }

    if (bounded.truncated) {
      const globalNote = globalTruncated ? ` (the ${MAX_TOTAL_BYTES}-byte total output cap also applied)` : "";
      lines.push(`PRINT-VERIFY-FAILURES-TRUNCATED: "${step.name}" omitted ${bounded.omittedBytes} byte(s) of its log (kept ${bounded.keptBytes} of ${bounded.originalBytes} byte(s), originally ${bounded.totalLines} line(s))${globalNote}.`);
    }
    lines.push("--- log tail ---");
    if (bounded.text.length > 0) lines.push(bounded.text);
    globalBytesUsed += bounded.keptBytes;
  }

  return { lines };
}

function resolveGitPaths() {
  const commonDirResult = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" });
  if (commonDirResult.status !== 0 || commonDirResult.stdout.trim() === "") return null;
  const gitCommonDir = commonDirResult.stdout.trim();
  // Mirrors verify.mjs's own primaryRoot (dirname(gitCommonDirectory())):
  // evidence/verify-latest.json is always written at the PRIMARY worktree
  // root (verify.mjs ~108-123), never at the invoking worktree's own root.
  return { gitCommonDir, repoRoot: dirname(gitCommonDir) };
}

const isDirectInvocation = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) {
  try {
    const gitPaths = resolveGitPaths();
    if (gitPaths === null) {
      console.log("PRINT-VERIFY-FAILURES-NO-GIT: could not determine the git common directory (not a git repository, or git is unavailable); nothing to report.");
    } else {
      const { gitCommonDir, repoRoot } = gitPaths;
      const evidencePath = join(repoRoot, "evidence", "verify-latest.json");
      const runsRoot = join(gitCommonDir, "agent-pipeline", "verify", "runs");
      const { lines } = buildFailureReport({ evidencePath, runsRoot, repoRoot });
      console.log(lines.join("\n"));
    }
  } catch (error) {
    // Never throw: this is a reporter, not a gate (AC-1). An unanticipated
    // failure still degrades to one bounded diagnostic line and exit 0.
    console.log(`PRINT-VERIFY-FAILURES-UNEXPECTED-ERROR: ${String(error && error.message ? error.message : error).slice(0, 200)}`);
  }
  process.exit(0);
}
