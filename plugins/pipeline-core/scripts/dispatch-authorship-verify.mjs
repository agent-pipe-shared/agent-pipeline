#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Verify that a commit's authorship trailer BINDS to the dispatch record it names.
 *
 * WHY THIS EXISTS. Authorship of a production diff is supposed to be provable from
 * two artifacts: the `Dispatch: <TASK_ID> (goldfish)` commit trailer and the record
 * under `evidence/`. Three independent Critic rounds against the 0.5.4 candidate found
 * that the pair does not hold, in five shapes (backlog item
 * `2026-08-09-the-dispatch-record-does-not-bind-to-the-commit-it-vouches-for.md`).
 * The check that existed looked for the PRESENCE of a trailer. Every one of those
 * failures is about CORRESPONDENCE, and presence is the one property that carries no
 * information: a trailer costs one line and is written by the party being vouched for.
 *
 * This script checks correspondence. It is a standalone diagnostic — deliberately NOT
 * wired into `harness/scripts/verify.mjs` (TP-3) — so it can be run at close, in CI, or
 * by a Critic against a review set, without changing any gate's strength today.
 *
 * THE THREE DIMENSIONS, in decreasing order of evidential strength:
 *
 *   1. SHA binding (exact). If the record carries a `commit` field, it must prefix-match
 *      the commit under test. This is the only dimension that is proof rather than
 *      inference, and it is what catches a record naming a different commit entirely.
 *   2. Outcome terminality (exact). A record still at `in-progress` vouches for nothing.
 *      Terminality is decided by a DENYLIST, not an allowlist: the observed corpus already
 *      says `completed`, `success`, `done`, `completed-with-open-items`,
 *      `completed-by-elephant-finish` and `stopped-tool-budget`, and an allowlist would
 *      misclassify every new word someone reasonably invents.
 *   3. Path coverage (heuristic, and honestly the weakest). See LIMITS below.
 *
 * THE FOUR VERDICTS.
 *
 *   PASS          the trailer resolves to a terminal record that does not contradict the
 *                 commit, or the commit DECLARES itself Elephant-direct.
 *   FAIL          the trailer names a record that is absent, unfinished, or contradicts
 *                 the commit.
 *   UNVERIFIABLE  the evidence does not decide. Notably: a commit carrying NO `Dispatch:`
 *                 trailer at all. That is reported as `elephant-direct-undeclared` and it
 *                 is never a PASS — blessing silence would re-bless failure shape 1 of the
 *                 item (absent trailer on the two largest production diffs in the review
 *                 set) and weaken the fail-closed boundary Direction point 4 protects.
 *                 Declaring costs one line and earns a PASS; staying silent does not.
 *
 * LIMITS — what this script does NOT establish, stated plainly rather than implied away:
 *
 *   - PATH COVERAGE IS A HEURISTIC OVER PROSE. Records are heterogeneous. Some carry
 *     `report.changedFiles`; in others `report` is a bare string with no machine-readable
 *     path field at all. Where no structured path list exists the verdict is UNVERIFIABLE,
 *     never PASS — the script does not scrape free prose for path-like tokens and then
 *     call the result evidence.
 *   - IT DOES NOT DETECT A SEMANTIC CONTRADICTION. Failure shape 2 of the item — a record
 *     reading `stopped-tool-budget` and naming work it did not reach, while the commit
 *     performs exactly that work — passes dimension 2 here, because `stopped-tool-budget`
 *     IS terminal. Reading a record's prose against a diff's meaning is a Critic's job.
 *   - THE EVIDENCE REMAINS SELF-REPORTED. Both artifacts are written by the party being
 *     vouched for. This script raises the cost of an inconsistent story; it does not make
 *     the story externally observed.
 *   - ABSENT A `commit` FIELD, THERE IS NO SHA BINDING. Most existing records predate the
 *     convention, so dimension 1 is frequently silent rather than satisfied.
 *
 * EXIT CODES: 0 = every commit PASS. 1 = at least one FAIL. 2 = at least one UNVERIFIABLE
 * and no FAIL (with `--strict`, 2 is folded into 1). 3 = usage/environment error.
 *
 * Usage:
 *   node plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs <sha> [<sha> ...]
 *   node plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs --range main..HEAD
 *   node plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs --json <sha>
 *   node plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs --strict <sha>
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const DEFAULT_EVIDENCE_DIR = join(REPO_ROOT, "evidence");

/**
 * Outcomes that vouch for nothing. Anything NOT in this set counts as terminal — see the
 * header on why this is a denylist. `stopped-*` outcomes are terminal: the run ended, and
 * the record is a truthful account of a run that stopped.
 */
export const NON_TERMINAL_OUTCOMES = Object.freeze(["in-progress", "in progress", "started", "pending", "running"]);

export const VERDICT = Object.freeze({ pass: "PASS", fail: "FAIL", unverifiable: "UNVERIFIABLE" });

/**
 * Parse the trailer block: the trailing contiguous run of `Key: value` lines. Anchoring on
 * the block rather than on `/^Dispatch:/m` anywhere means a `Dispatch:` mentioned in the
 * body prose cannot pose as authorship evidence.
 */
export function parseTrailerBlock(message) {
  const lines = String(message ?? "").replace(/\r\n/gu, "\n").split("\n");
  while (lines.length > 0 && lines.at(-1).trim() === "") lines.pop();
  const trailers = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const match = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/u.exec(lines[i]);
    if (!match) break;
    trailers.unshift({ key: match[1], value: match[2].trim() });
  }
  return trailers;
}

/**
 * `Dispatch: <ID> (<role>)`. The role lives in its own slot, so the Elephant form
 * (`Dispatch: stage-0 (elephant)`) falls out of the SAME grammar as the goldfish form and
 * classification is role-driven rather than a special-cased string.
 */
export function parseDispatchTrailer(message) {
  const trailer = parseTrailerBlock(message).find((entry) => entry.key.toLowerCase() === "dispatch");
  if (!trailer) return null;
  const match = /^(\S+)\s*\(([^)]+)\)$/u.exec(trailer.value);
  if (!match) return { raw: trailer.value, id: null, role: null, malformed: true };
  return { raw: trailer.value, id: match[1], role: match[2].trim().toLowerCase(), malformed: false };
}

export function isTerminalOutcome(outcome) {
  if (typeof outcome !== "string") return false;
  const normalized = outcome.trim().toLowerCase();
  if (normalized === "") return false;
  return !NON_TERMINAL_OUTCOMES.includes(normalized);
}

/** Two SHAs bind if either is a prefix of the other — records abbreviate inconsistently. */
export function shasBind(a, b) {
  const left = String(a ?? "").trim().toLowerCase();
  const right = String(b ?? "").trim().toLowerCase();
  if (left === "" || right === "") return false;
  return left.startsWith(right) || right.startsWith(left);
}

/**
 * Pull declared paths out of `report.changedFiles`. Entries are either objects with a
 * `path`, or strings shaped `"<path> - why it changed"` (the house style). Returns null —
 * distinct from an empty array — when the record has no machine-readable path field, which
 * is what makes the caller answer UNVERIFIABLE instead of FAIL.
 */
export function declaredPaths(record) {
  const changed = record?.report?.changedFiles ?? record?.changedFiles;
  if (!Array.isArray(changed)) return null;
  const paths = [];
  for (const entry of changed) {
    const text = typeof entry === "string" ? entry : entry?.path;
    if (typeof text !== "string") continue;
    const token = text.trim().replace(/^[`'"]+/u, "").split(/[\s`'",]+/u)[0];
    if (token) paths.push(token.replace(/[.,;:]+$/u, ""));
  }
  return paths;
}

/**
 * A commit path is covered by an exact match or by a declared DIRECTORY prefix. Basename
 * matching is deliberately not accepted: `test.mjs` covering any `test.mjs` anywhere would
 * make coverage mean nothing.
 */
export function coveringPath(commitPath, declared) {
  const target = commitPath.replace(/^\.\//u, "");
  return (
    declared.find((entry) => {
      const candidate = entry.replace(/^\.\//u, "").replace(/\/$/u, "");
      return candidate === target || target.startsWith(`${candidate}/`);
    }) ?? null
  );
}

function result(sha, verdict, classification, reason, extra = {}) {
  return { sha, verdict, classification, reason, ...extra };
}

/**
 * The pure core. All I/O arrives through `deps` so the regression suite can drive synthetic
 * commits without building a git fixture repository.
 */
export function verifyCommit(sha, deps) {
  const { readCommitMessage, readChangedPaths, readRecord } = deps;
  let message;
  try {
    message = readCommitMessage(sha);
  } catch (error) {
    return result(sha, VERDICT.unverifiable, "commit-unreadable", `commit could not be read: ${error.message}`);
  }

  const dispatch = parseDispatchTrailer(message);
  if (!dispatch) {
    return result(
      sha,
      VERDICT.unverifiable,
      "elephant-direct-undeclared",
      "no `Dispatch:` trailer — unbound to any record; a stage-0 Elephant commit should declare `Dispatch: stage-0 (elephant)`",
    );
  }
  if (dispatch.malformed) {
    return result(sha, VERDICT.fail, "trailer-malformed", `\`Dispatch: ${dispatch.raw}\` does not match \`<ID> (<role>)\``);
  }
  if (dispatch.role === "elephant") {
    return result(sha, VERDICT.pass, "elephant-direct-declared", `declared Elephant-direct (\`${dispatch.raw}\`); no dispatch record expected`, {
      taskId: dispatch.id,
    });
  }
  if (dispatch.role !== "goldfish") {
    return result(sha, VERDICT.unverifiable, "unknown-role", `unrecognised dispatch role \`${dispatch.role}\``, { taskId: dispatch.id });
  }

  const taskId = dispatch.id;
  let record;
  try {
    record = readRecord(taskId);
  } catch (error) {
    return result(sha, VERDICT.fail, "record-unreadable", `record for \`${taskId}\` could not be read: ${error.message}`, { taskId });
  }
  if (record === null) {
    return result(sha, VERDICT.fail, "record-missing", `trailer names \`${taskId}\` but no dispatch-record-${taskId}.json exists`, { taskId });
  }
  if (typeof record.taskId === "string" && record.taskId.trim() !== "" && record.taskId.trim() !== taskId) {
    return result(sha, VERDICT.fail, "record-taskid-mismatch", `trailer names \`${taskId}\`, record's own taskId is \`${record.taskId}\``, { taskId });
  }
  if (!isTerminalOutcome(record.outcome)) {
    return result(sha, VERDICT.fail, "record-not-terminal", `record outcome \`${record.outcome ?? "(absent)"}\` is not terminal`, { taskId });
  }
  if (typeof record.commit === "string" && record.commit.trim() !== "" && !shasBind(sha, record.commit)) {
    return result(sha, VERDICT.fail, "record-names-different-commit", `record names commit \`${record.commit}\``, { taskId });
  }

  let changed;
  try {
    changed = readChangedPaths(sha);
  } catch (error) {
    return result(sha, VERDICT.unverifiable, "commit-paths-unreadable", `changed paths unreadable: ${error.message}`, { taskId });
  }

  const declared = declaredPaths(record);
  if (declared === null) {
    return result(sha, VERDICT.unverifiable, "record-has-no-machine-readable-paths", `record for \`${taskId}\` is terminal but declares no changedFiles`, {
      taskId,
    });
  }
  const uncovered = changed.filter((path) => coveringPath(path, declared) === null);
  if (uncovered.length > 0) {
    return result(sha, VERDICT.fail, "record-paths-do-not-cover", `record does not declare ${uncovered.length} changed path(s): ${uncovered.join(", ")}`, {
      taskId,
      uncovered,
    });
  }
  return result(sha, VERDICT.pass, "bound", `bound to \`${taskId}\` (outcome \`${record.outcome}\`, ${changed.length} path(s) covered)`, { taskId });
}

export function gitDeps({ repoRoot = REPO_ROOT, evidenceDir = DEFAULT_EVIDENCE_DIR } = {}) {
  const git = (args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return {
    readCommitMessage: (sha) => git(["show", "-s", "--format=%B", `${sha}^{commit}`]),
    readChangedPaths: (sha) =>
      git(["show", "--no-renames", "--name-only", "--format=", `${sha}^{commit}`])
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== ""),
    readRecord: (taskId) => readRecordFile(evidenceDir, taskId),
  };
}

/** The naming convention, confirmed against the real corpus: `dispatch-record-<TASK_ID>.json`. */
export function readRecordFile(evidenceDir, taskId) {
  const path = join(evidenceDir, `dispatch-record-${taskId}.json`);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  return JSON.parse(raw);
}

export function exitCodeFor(results, { strict = false } = {}) {
  if (results.some((entry) => entry.verdict === VERDICT.fail)) return 1;
  if (results.some((entry) => entry.verdict === VERDICT.unverifiable)) return strict ? 1 : 2;
  return 0;
}

export function formatLine(entry) {
  return `${entry.verdict.padEnd(12)} ${String(entry.sha).slice(0, 12).padEnd(12)} ${entry.classification}: ${entry.reason}`;
}

function main(argv) {
  const strict = argv.includes("--strict");
  const json = argv.includes("--json");
  const deps = gitDeps();
  const revisions = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--range") {
      const range = argv[i + 1];
      i += 1;
      if (!range) {
        process.stderr.write("--range needs a revision range\n");
        return 3;
      }
      const listed = execFileSync("git", ["rev-list", range], { cwd: REPO_ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
      revisions.push(...listed);
      continue;
    }
    if (argv[i].startsWith("--")) continue;
    revisions.push(argv[i]);
  }
  if (revisions.length === 0) {
    process.stderr.write("usage: dispatch-authorship-verify.mjs [--strict] [--json] <sha>... | --range <a>..<b>\n");
    return 3;
  }
  const results = revisions.map((sha) => verifyCommit(sha, deps));
  if (json) process.stdout.write(`${JSON.stringify({ schema: "pipeline.dispatch-authorship.v1", results }, null, 2)}\n`);
  else for (const entry of results) process.stdout.write(`${formatLine(entry)}\n`);
  return exitCodeFor(results, { strict });
}

if (isDirectInvocation(import.meta.url)) process.exit(main(process.argv.slice(2)));
