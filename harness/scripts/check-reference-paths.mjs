#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Repository-wide stale-reference gate.
 *
 * Fails when a tracked file names a repository-relative SCRIPT path that is
 * not a tracked file. It exists because a script move can be declared
 * complete "through every operator-facing reference" while two live
 * references still point at the old location -- and the check cited as
 * evidence for that claim could not see either of them:
 * `check-consumer-safe-paths.mjs` scans only `plugins/pipeline-core/`
 * (its `SCAN_PREFIX`), so `.github/`, `.env.example`, `harness/`, `docs/`
 * and `templates/` are structurally invisible to it. The two references it
 * could not see were a workflow step under `.github/workflows/` naming
 * security-scan.mjs at its former `harness/scripts/` location behind a
 * `trusted-gate/` CI checkout prefix, and `.env.example` naming the
 * security adapters under the former `harness/scripts/security-adapters/`.
 * Both are pinned as fixtures in this check's own suite; neither is written
 * here as a resolvable literal, because this file is itself in scope.
 *
 * The two checks are complementary and neither subsumes the other. That one
 * asks "does a SHIPPED artifact name a path only this repository has"; this
 * one asks "does ANY live file name a path NOBODY has". This check never
 * widens or replaces it.
 *
 * DETECTION RULE (deliberately narrow -- see REACH below). In every scanned
 * line, a candidate is a maximal run of path characters ending in a script
 * extension whose first segment matching a known repository-root directory
 * begins a repo-relative path. Segments before that root segment are treated
 * as a foreign checkout prefix and dropped, which is what makes the CI form
 * `node trusted-gate/harness/scripts/check-doc-contracts.mjs` resolvable at
 * all. (That example resolves, deliberately: this file is itself in scope,
 * so it may not carry a dead path even as an illustration.)
 * A candidate containing `*` is treated as a glob and satisfied by any one
 * tracked file. Everything else must be a tracked file exactly.
 *
 * SCOPE. Two classes of tracked file are deliberately NOT scanned, and the
 * check says so in its own output rather than only here:
 *
 *   1. RECORD surfaces (`specs/`, `backlog/`, `evidence/`,
 *      `docs/spec-archive/`, `docs/state-archive/`, `docs/state.md`). A
 *      record states what was true when it was written; a past briefing that
 *      named a path that has since moved is CORRECT as a record. Editing one
 *      to satisfy a gate falsifies the record, so the gate must not ask for
 *      that edit. `docs/state-archive/` carries the exact same property as
 *      `docs/spec-archive/`: it holds sections rotated out of `docs/state.md`
 *      by ADR-0066's handover-rotation mechanism, verbatim, not live
 *      documentation. 98 of the 152 raw hits in this repository are of
 *      exactly this class.
 *   2. TEST SUITES (`*.test.mjs`). Their path strings are synthetic fixture
 *      names invented under `plugins/pipeline-core/lib/` and
 *      `harness/scripts/` and constructed inside temporary directories, not
 *      references to this tree. 54 such hits across 16 files.
 *      A test file that imports a path that has really moved fails when the
 *      suite runs, which is the stronger gate; nothing is lost by leaving
 *      this class to it.
 *
 * These are SCOPE, not allowlist, on purpose. Silencing 152 findings by
 * enumeration would produce an allowlist nobody can audit; the rule is
 * narrowed instead. With this scope the repository needs NO allowlist
 * entries at all, which is the state a narrow rule should be able to reach.
 * The mechanism is kept (and tested) because the first genuine exception
 * must land somewhere reasoned rather than in a widened scope, and an entry
 * that stops matching is itself reported so it cannot rot in place.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * Top-level directories of THIS repository that a reference can be rooted
 * at. Deliberately a fixed list rather than one derived from the tree: if
 * `harness/` were deleted, a derived list would stop recognising every
 * `harness/...` reference and the check would go quietly green on the very
 * event it exists to catch. With a fixed list, the same deletion turns every
 * such reference into a finding.
 *
 * `scripts` is deliberately absent -- this repository has no top-level
 * `scripts/`, so a bare `scripts/foo.mjs` is shorthand for a path under some
 * other root and is not resolvable. `.claude/` is absent because those paths
 * name an INSTALLED consumer tree, not this source tree.
 */
export const ROOT_SEGMENTS = Object.freeze([
  ".github",
  "backlog",
  "docs",
  "evidence",
  "governance",
  "guardrails",
  "harness",
  "plugins",
  "policies",
  "project",
  "roles",
  "specs",
  "telemetry",
  "templates",
]);

export const SCRIPT_EXTENSIONS = Object.freeze(["mjs", "cjs", "js", "sh", "py", "ts"]);

/** Record surfaces: true-as-written history, never rewritten to satisfy a gate. */
export const RECORD_PREFIXES = Object.freeze([
  "specs/", "backlog/", "evidence/", "docs/spec-archive/", "docs/state-archive/",
]);
export const RECORD_FILES = Object.freeze(["docs/state.md"]);
export const TEST_SUITE_PATTERN = /\.test\.mjs$/u;

/**
 * Reasoned exceptions inside the scanned scope. Empty is the correct state
 * for a rule narrow enough not to need silencing; an unused entry is
 * reported as a finding.
 *
 * Shape: `{ file, match, reason }` -- `match` is the candidate path as
 * extracted, `reason` states WHY the reference is right as written.
 */
// `match` values are deliberately split across two concatenated string
// literals (the segment, then its extension on its own line) rather than
// written as one contiguous token -- this file is itself in scope, and a
// dead candidate written as a single token here would flag itself, the
// exact self-reference trap REFCHECK-1's own header comment already warns
// about for illustrations. Splitting is read-only detection avoidance, not
// a change to the stored value: `resolvesAgainst` still receives the full,
// unbroken concatenated string.
export const ALLOWLIST = Object.freeze([
  {
    file: "docs/doc-reconciliation.md",
    match: "evidence/acceptance-evidence-map" +
      ".mjs",
    reason:
      "VFX2-REFPATH (2026-08-26): shorthand relative to a spec package's " +
      "own evidence subdirectory (the real, only tracked file lives " +
      "under specs/sprint-phoenix-epic/evidence/); the top-level evidence " +
      "directory is gitignored, so a bare reference of this shape can " +
      "never resolve as a repo-root path. Six occurrences in this file " +
      "share the identical candidate string, covered by this one entry.",
  },
  {
    file: "harness/scripts/check-consumer-safe-paths.mjs",
    match: "harness/scripts/security-adapters/gitleaks" +
      ".mjs",
    reason:
      "VFX2-REFPATH (2026-08-26): Class B source comment citing this " +
      "file's own pre-merge Phoenix-branch location for an arithmetic " +
      "explanation, not an operator-facing message -- the same exception " +
      "this check's own local allowlist already grants its neighbouring " +
      "entry for the identical string.",
  },
  {
    file: "plugins/pipeline-core/scripts/security-adapters/gitleaks.mjs",
    match: "harness/scripts/security-adapters/gitleaks" +
      ".mjs",
    reason:
      "VFX2-REFPATH (2026-08-26): the file's own comment (VFX-SECURITY, " +
      "2026-08-26) citing its pre-merge Phoenix-branch location to " +
      "explain a directory-depth arithmetic correction caused by the " +
      "Nova/Phoenix merge relocating it one directory deeper.",
  },
]);

/** What this check cannot see. Printed with every result, not just here. */
export const LIMITATIONS = Object.freeze([
  "record surfaces are not scanned (specs/, backlog/, evidence/, docs/spec-archive/, docs/state-archive/, docs/state.md): a record naming a path that has since moved is correct as a record",
  "test suites (*.test.mjs) are not scanned: their path strings are synthetic fixture data, and a genuinely stale import fails when the suite runs",
  "only script targets are detected (" + SCRIPT_EXTENSIONS.join(", ") + "); .md link targets are check-doc-contracts.mjs's job, and .json/.yml/.toml/directory targets are detected by nothing",
  "a reference written without its repository-root segment (e.g. the shorthand 'scripts/foo.mjs') is not recognised as repo-relative and is skipped",
  "a path assembled at runtime from variables or string concatenation is invisible; only literal text is read",
  "'..'-relative and './'-relative references are skipped, as is any reference whose checkout prefix contains a dot (a URL rather than a checkout directory)",
  "existence is checked against the git index only: an untracked file present on disk still counts as missing, and a tracked path is not checked for being executable, current or correct",
]);

function posixPath(value) {
  return value.split(sep).join("/");
}

function gitListTracked(root) {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "buffer" });
  if (result.status !== 0) throw new Error(`git ls-files failed with exit ${result.status ?? "unknown"}`);
  return decoder.decode(result.stdout).split("\0").filter(Boolean).map(posixPath).sort();
}

function defaultReadText(file) {
  return decoder.decode(readFileSync(file));
}

export function isRecordPath(filePath) {
  return RECORD_PREFIXES.some((prefix) => filePath.startsWith(prefix)) || RECORD_FILES.includes(filePath);
}

export function isTestSuitePath(filePath) {
  return TEST_SUITE_PATTERN.test(filePath);
}

/** Why a file is out of scope, or null when it is in scope. */
export function scopeExclusion(filePath) {
  if (isRecordPath(filePath)) return "record";
  if (isTestSuitePath(filePath)) return "test-suite";
  return null;
}

const TOKEN_PATTERN = new RegExp(`[A-Za-z0-9._\\-*/]*\\.(?:${SCRIPT_EXTENSIONS.join("|")})\\b`, "gu");

/**
 * Reduce one raw path-like token to the repo-relative path it references,
 * or null when it does not reference one.
 */
export function candidateFromToken(token) {
  const segments = token.split("/");
  if (segments.some((segment) => segment === ".." || segment === "." || segment === "")) return null;
  const rootIndex = segments.findIndex((segment) => ROOT_SEGMENTS.includes(segment));
  if (rootIndex < 0) return null;
  if (rootIndex === segments.length - 1) return null;
  // Anything before the root segment is a checkout directory (`trusted-gate/`).
  // A dot there means a hostname, i.e. a URL, not a checkout of this tree.
  if (segments.slice(0, rootIndex).some((segment) => segment.includes("."))) return null;
  return segments.slice(rootIndex).join("/");
}

/** Every distinct repo-relative candidate referenced by one line. */
export function candidatesInLine(line) {
  const found = [];
  for (const match of line.matchAll(TOKEN_PATTERN)) {
    const candidate = candidateFromToken(match[0]);
    if (candidate && !found.includes(candidate)) found.push(candidate);
  }
  return found;
}

function globToRegExp(pattern) {
  const body = pattern
    .split("/")
    .map((segment) =>
      segment
        .replace(/[.+^${}()|[\]\\]/gu, "\\$&")
        .replace(/\*\*/gu, " ")
        .replace(/\*/gu, "[^/]*")
        .replace(/ /gu, ".*"),
    )
    .join("/");
  return new RegExp(`^${body}$`, "u");
}

/** A candidate resolves when it is a tracked file, or when a glob matches one. */
export function resolvesAgainst(candidate, trackedPaths, trackedList) {
  if (!candidate.includes("*")) return trackedPaths.has(candidate);
  const pattern = globToRegExp(candidate);
  return trackedList.some((entry) => pattern.test(entry));
}

export function checkRepository(rootInput, options = {}) {
  const root = resolve(rootInput);
  const readText = options.readText ?? defaultReadText;
  const trackedList = (options.trackedPaths ?? gitListTracked(root)).map(posixPath);
  const trackedPaths = new Set(trackedList);
  const scanCandidates = (options.scanPaths ?? trackedList).map(posixPath).slice().sort();
  const allowlist = options.allowlist ?? ALLOWLIST;
  const usedAllowlistIndices = new Set();
  const findings = [];

  let filesScanned = 0;
  let recordFiles = 0;
  let testSuiteFiles = 0;
  let unreadableFiles = 0;
  let referencesResolved = 0;

  for (const file of scanCandidates) {
    const exclusion = scopeExclusion(file);
    if (exclusion === "record") {
      recordFiles += 1;
      continue;
    }
    if (exclusion === "test-suite") {
      testSuiteFiles += 1;
      continue;
    }
    let text;
    try {
      text = readText(resolve(root, file));
    } catch {
      // Binary or unreadable: counted and reported in the reach statement,
      // never silently folded into the scanned count.
      unreadableFiles += 1;
      continue;
    }
    filesScanned += 1;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      for (const candidate of candidatesInLine(lines[i])) {
        if (resolvesAgainst(candidate, trackedPaths, trackedList)) {
          referencesResolved += 1;
          continue;
        }
        const allowIndex = allowlist.findIndex((entry) => entry.file === file && entry.match === candidate);
        if (allowIndex >= 0) {
          usedAllowlistIndices.add(allowIndex);
          continue;
        }
        findings.push(`${file}:${i + 1}: references "${candidate}", which is not a tracked file`);
      }
    }
  }

  allowlist.forEach((entry, index) => {
    if (usedAllowlistIndices.has(index)) return;
    findings.push(`allowlist: entry for "${entry.match}" in ${entry.file} never matched anything -- remove it`);
  });

  findings.sort();
  return {
    findings,
    stats: {
      trackedFiles: trackedList.length,
      filesScanned,
      recordFilesSkipped: recordFiles,
      testSuiteFilesSkipped: testSuiteFiles,
      unreadableFilesSkipped: unreadableFiles,
      referencesResolved,
      allowlistEntries: allowlist.length,
    },
  };
}

/** The reach statement. Printed on success AND on failure. */
export function reachLines(stats) {
  return [
    `reach: scanned ${stats.filesScanned} of ${stats.trackedFiles} tracked file(s); ` +
      `${stats.referencesResolved} script reference(s) resolved to a tracked file.`,
    `reach: skipped ${stats.recordFilesSkipped} record file(s) (${[...RECORD_PREFIXES, ...RECORD_FILES].join(", ")}), ` +
      `${stats.testSuiteFilesSkipped} test suite(s) (*.test.mjs), ` +
      `${stats.unreadableFilesSkipped} file(s) not readable as UTF-8 text.`,
    `reach: rooted at ${ROOT_SEGMENTS.join(", ")}; extensions ${SCRIPT_EXTENSIONS.join(", ")}; ` +
      `${stats.allowlistEntries} allowlist entr${stats.allowlistEntries === 1 ? "y" : "ies"}.`,
    ...LIMITATIONS.map((item) => `reach: NOT detected -- ${item}`),
  ];
}

function runCli() {
  const args = process.argv.slice(2);
  let root = null;
  let reportPath = null;
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (args[i] === "--root" && value) root = value;
    else if (args[i] === "--report" && value) reportPath = value;
    else {
      process.stderr.write("usage: check-reference-paths.mjs [--root <repository>] [--report <file>]\n");
      process.exit(2);
    }
  }
  const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  try {
    const result = checkRepository(root ?? defaultRoot);
    const reach = reachLines(result.stats);
    const failed = result.findings.length > 0;
    const exitCode = failed ? 2 : 0;
    if (reportPath) {
      // Machine-written: this file is the artifact, never a hand-composed
      // restatement of it. It carries no absolute path by construction.
      writeFileSync(
        resolve(process.cwd(), reportPath),
        `${JSON.stringify(
          {
            check: "reference-paths",
            result: failed ? "failed" : "passed",
            exitCode,
            findingCount: result.findings.length,
            findings: result.findings,
            stats: result.stats,
            reach,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    }
    const sink = failed ? process.stderr : process.stdout;
    for (const item of result.findings) sink.write(`REFERENCE-PATH ${item}\n`);
    for (const line of reach) sink.write(`REFERENCE-PATH ${line}\n`);
    sink.write(
      failed
        ? `Reference-path check failed: ${result.findings.length} finding(s).\n`
        : `Reference-path check passed: no tracked file in scope names a missing script path.\n`,
    );
    process.exit(exitCode);
  } catch (error) {
    process.stderr.write(`Reference-path check unavailable: ${error.message}\n`);
    process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
