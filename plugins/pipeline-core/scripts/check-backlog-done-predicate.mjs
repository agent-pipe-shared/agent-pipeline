#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-backlog-done-predicate.mjs -- read backlog/items/'s optional `done_when` frontmatter
 * declaration and mechanically evaluate it against the current tree, so a `status:` can no
 * longer silently disagree with the repository.
 *
 * WHY THIS EXISTS (NVA-DONEWHEN-1). `status: closed` on a backlog item has always meant
 * "a human or agent asserted this is done" -- nothing mechanical ever checked whether the
 * asserted closure still holds, or whether an `open` item had in fact already been satisfied by
 * later work. This script turns that gap into a per-item, machine-checkable falsifier: an item
 * MAY declare `done_when: <predicate>` in its frontmatter, and this script evaluates that
 * predicate against the CURRENT tree and reports where the declaration and reality disagree.
 *
 * A sibling of check-backlog-sprint-assignment.mjs (same items-dir enumeration, same
 * `parseBacklogItem` frontmatter reader, same ignore-`ok`/`errors`-and-read-the-metadata-fields-
 * directly posture), deliberately scoped narrower: it reads exactly one field, `done_when`, and
 * evaluates it -- no ledger, no closure evidence, no generated projection.
 *
 * THE FIELD. `done_when` is a FLAT single-line string -- never a nested object, because this
 * repository's frontmatter dialect (`parseBacklogItem`, plugins/pipeline-core/lib/
 * backlog-state.mjs) is flat `key: value` and a nested shape would need a parser this repository
 * does not have. Its grammar is a leading verb plus arguments, and the vocabulary is CLOSED --
 * exactly these four forms, spelled verbatim:
 *
 *   - `path-exists <repo-relative-path>` -- satisfied when that path exists.
 *   - `contains <repo-relative-path> <needle>` -- satisfied when that file exists AND contains
 *     `<needle>` as a FIXED STRING (never a regex). `<needle>` is everything after the first
 *     space following the path, to end of line, taken literally including inner spaces -- path
 *     first precisely so the needle never needs quoting.
 *   - `script-exit-zero <repo-relative-script-path>` -- satisfied when `node <script>` exits 0.
 *     The script path MUST resolve inside `plugins/pipeline-core/scripts/` or `harness/scripts/`;
 *     anything else is MALFORMED, not merely unsatisfied. Run with no arguments, the repository
 *     root as cwd, and a hard timeout (`DEFAULT_SCRIPT_TIMEOUT_MS`); a timeout is MALFORMED,
 *     never "unsatisfied".
 *   - `manual` -- no machine predicate; an explicitly declared human judgment. The counterpart of
 *     `sprint: none` (check-backlog-sprint-assignment.mjs): distinguishable from omission, and
 *     never a finding at any status.
 *
 * PATH SAFETY, for every path argument in every verb: an absolute path, any `..` segment, or a
 * resolved real path that leaves the repository root is MALFORMED, never silently accepted.
 *
 * FOUR FINDING CLASSES, THREE FATAL TODAY. MALFORMED / STALE-OPEN / REGRESSION are exit-1
 * findings the moment a declared predicate contradicts the item's own status; UNDECLARED (an
 * `open`/`in_progress` item with no `done_when` at all) is counted and printed but NOT yet fatal
 * -- exactly the same "reported, not yet enforced" posture check-backlog-sprint-assignment.mjs
 * itself started from, before its own commit 6d81b33b declared a sprint for every item that was
 * `open` at the time and let that checker's mandatory-declaration rule graduate from reported to
 * enforced. UNDECLARED graduates to fatal the same way, in a later commit, once every open item
 * in this repository declares `done_when` -- until then this checker enforces only
 * CONTRADICTIONS between a declared predicate and the tree, never the absence of a declaration.
 *
 * `status: rejected` and `status: deferred` items are counted and never a finding, mirroring how
 * the sprint checker treats non-open statuses for its own optional field.
 *
 * EXIT CODES: 0 = no fatal finding. 1 = at least one fatal finding (MALFORMED, STALE-OPEN, or
 * REGRESSION). 3 = usage/environment error (the items directory could not be enumerated/read).
 *
 * SUITE REGISTRATION: this script's own `.test.mjs` sibling passes standalone but is NOT yet
 * registered in `harness/scripts/verify.mjs` -- that file is TP-3-protected and this repository's
 * push-approval mode offers no in-session override (see the opt-out entry this dispatch adds to
 * check-suite-registration.mjs's DELIBERATELY_UNREGISTERED array).
 *
 * Usage:
 *   node plugins/pipeline-core/scripts/check-backlog-done-predicate.mjs
 *   node plugins/pipeline-core/scripts/check-backlog-done-predicate.mjs --json
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseBacklogItem } from "../lib/backlog-state.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const ITEMS_DIR = "backlog/items";
export const ALLOWED_SCRIPT_PREFIXES = Object.freeze(["plugins/pipeline-core/scripts/", "harness/scripts/"]);
export const DEFAULT_SCRIPT_TIMEOUT_MS = 120000;
const SCHEMA = "pipeline.check-backlog-done-predicate.v1";
const OPEN_LIKE_STATUSES = Object.freeze(["open", "in_progress"]);

/**
 * Parse the closed `done_when` grammar into `{ verb, ... }` on success or
 * `{ malformed: true, reason }` on an unrecognized shape. Purely syntactic -- does not touch the
 * filesystem and never resolves whether a path is safe (see `isSafeRepoRelativePath`).
 */
export function parseDoneWhen(raw) {
  if (typeof raw !== "string") return { malformed: true, reason: "done_when must be a string" };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { malformed: true, reason: "done_when must not be empty" };
  if (trimmed === "manual") return { verb: "manual" };
  const firstSpace = trimmed.indexOf(" ");
  const verb = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
  const rest = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1);
  if (verb === "path-exists") {
    const path = rest.trim();
    if (path.length === 0) return { malformed: true, reason: "path-exists requires a <repo-relative-path> argument" };
    return { verb, path };
  }
  if (verb === "contains") {
    const sp = rest.indexOf(" ");
    if (sp === -1) return { malformed: true, reason: "contains requires <repo-relative-path> <needle>" };
    const path = rest.slice(0, sp);
    const needle = rest.slice(sp + 1);
    if (path.length === 0 || needle.length === 0) return { malformed: true, reason: "contains requires <repo-relative-path> <needle>" };
    return { verb, path, needle };
  }
  if (verb === "script-exit-zero") {
    const path = rest.trim();
    if (path.length === 0) return { malformed: true, reason: "script-exit-zero requires a <repo-relative-script-path> argument" };
    return { verb, path };
  }
  return { malformed: true, reason: `unknown verb "${verb}" -- the vocabulary is closed to path-exists, contains, script-exit-zero, manual` };
}

/**
 * Reject an absolute path, any `..` segment, or a resolved real path that leaves `root`.
 * Applied to every path argument in every verb before it is ever touched.
 */
export function isSafeRepoRelativePath(rawPath, root = DEFAULT_ROOT) {
  if (typeof rawPath !== "string" || rawPath.length === 0) return false;
  if (rawPath.startsWith("/")) return false;
  if (/^[A-Za-z]:[\\/]/u.test(rawPath)) return false; // defense-in-depth: a Windows-drive absolute path
  const segments = rawPath.split(/[\\/]/u);
  if (segments.includes("..")) return false;
  const rootResolved = resolve(root);
  const target = resolve(rootResolved, rawPath);
  if (target !== rootResolved && !target.startsWith(rootResolved + sep)) return false;
  return true;
}

/** `script-exit-zero`'s path must resolve inside one of the two allowed script directories. */
export function isAllowedScriptPath(rawPath) {
  const normalized = String(rawPath).replace(/\\/gu, "/");
  return ALLOWED_SCRIPT_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/** Render a parsed predicate back into readable prose for a finding's "expected"/"observed" text. */
export function describePredicate(parsed) {
  if (parsed.verb === "manual") return "manual (no machine predicate)";
  if (parsed.verb === "path-exists") return `path-exists ${parsed.path}`;
  if (parsed.verb === "contains") return `contains ${parsed.path} ${JSON.stringify(parsed.needle)}`;
  if (parsed.verb === "script-exit-zero") return `script-exit-zero ${parsed.path}`;
  return "unrecognized predicate";
}

/**
 * Evaluate an already-`parseDoneWhen`-parsed predicate against `root`. Returns
 * `{ malformed: true, reason }` for an unsafe/disallowed path or a script timeout,
 * `{ verb: "manual", satisfied: null }` for `manual`, or `{ verb, satisfied: boolean, ... }`
 * for the three machine verbs. `timeoutMs` defaults to the real 120000ms hard cap; tests inject a
 * much shorter value to exercise the timeout path without waiting on it.
 */
export function evaluateDoneWhen(parsed, { root = DEFAULT_ROOT, timeoutMs = DEFAULT_SCRIPT_TIMEOUT_MS } = {}) {
  if (parsed.malformed) return { malformed: true, reason: parsed.reason };
  if (parsed.verb === "manual") return { verb: "manual", satisfied: null };
  if (parsed.verb === "path-exists") {
    if (!isSafeRepoRelativePath(parsed.path, root)) return { malformed: true, reason: `unsafe path: ${parsed.path}` };
    return { verb: parsed.verb, path: parsed.path, satisfied: existsSync(join(root, parsed.path)) };
  }
  if (parsed.verb === "contains") {
    if (!isSafeRepoRelativePath(parsed.path, root)) return { malformed: true, reason: `unsafe path: ${parsed.path}` };
    const abs = join(root, parsed.path);
    if (!existsSync(abs)) return { verb: parsed.verb, path: parsed.path, needle: parsed.needle, satisfied: false };
    let content;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      return { verb: parsed.verb, path: parsed.path, needle: parsed.needle, satisfied: false };
    }
    return { verb: parsed.verb, path: parsed.path, needle: parsed.needle, satisfied: content.includes(parsed.needle) };
  }
  if (parsed.verb === "script-exit-zero") {
    if (!isSafeRepoRelativePath(parsed.path, root)) return { malformed: true, reason: `unsafe path: ${parsed.path}` };
    if (!isAllowedScriptPath(parsed.path)) {
      return { malformed: true, reason: `script-exit-zero path must resolve inside ${ALLOWED_SCRIPT_PREFIXES.join(" or ")}: ${parsed.path}` };
    }
    const abs = join(root, parsed.path);
    const result = spawnSync(process.execPath, [abs], { cwd: root, timeout: timeoutMs, encoding: "utf8" });
    if (result.signal || result.error?.code === "ETIMEDOUT") {
      return { malformed: true, reason: `script-exit-zero timed out after ${timeoutMs}ms: ${parsed.path}` };
    }
    return { verb: parsed.verb, path: parsed.path, satisfied: result.status === 0 };
  }
  return { malformed: true, reason: "unreachable: parseDoneWhen returned an unrecognized verb" };
}

/**
 * Enumerate every current backlog item and evaluate its `done_when` declaration (if any) against
 * `status`. No ledger, no closure evidence -- one `readdirSync` plus one
 * `readFileSync`/`parseBacklogItem`/`evaluateDoneWhen` per item, mirroring
 * check-backlog-sprint-assignment.mjs's own enumeration.
 */
export function checkBacklogDonePredicate(root = DEFAULT_ROOT) {
  const findings = [];
  const empty = () => ({
    ok: true, findings: [], total: 0,
    malformed: 0, malformedItems: [],
    staleOpen: 0, staleOpenItems: [],
    regression: 0, regressionItems: [],
    undeclared: 0, undeclaredItems: [],
    openUndeclared: 0, openUndeclaredItems: [],
  });
  let itemNames = [];
  try {
    itemNames = readdirSync(join(root, ITEMS_DIR), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "TEMPLATE.md")
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    return { ...empty(), ok: false, usageError: true, findings: [`${ITEMS_DIR} is missing or unreadable: ${error.message}`] };
  }

  const malformedItems = [];
  const staleOpenItems = [];
  const regressionItems = [];
  const undeclaredItems = [];
  const openUndeclaredItems = [];

  for (const name of itemNames) {
    const repoPath = `${ITEMS_DIR}/${name}`;
    let text;
    try {
      text = readFileSync(join(root, repoPath), "utf8");
    } catch (error) {
      malformedItems.push(repoPath);
      findings.push(`MALFORMED ${repoPath}: expected a readable item file; observed unreadable: ${error.message}`);
      continue;
    }
    const parsedFile = parseBacklogItem(text, { path: repoPath });
    const status = parsedFile.item?.metadata?.status;
    const doneWhenRaw = parsedFile.item?.metadata?.done_when;
    const isOpenLike = OPEN_LIKE_STATUSES.includes(status);

    if (doneWhenRaw === undefined) {
      // pipeline.unparseable-declaration-is-malformed (NVA-R8-PARSEBLIND): `parseBacklogItem`
      // silently DROPS a `done_when` key whose value it could not parse (an unquoted comma or
      // brace -- see backlog-state.mjs's parseScalar), leaving `metadata.done_when` undefined --
      // indistinguishable from "no done_when: line at all" unless the checker also reads the
      // parser's own errors. React only to a parse error naming the `done_when` key specifically;
      // every other frontmatter parse error is out of scope for this checker.
      const doneWhenParseError = parsedFile.errors.find((error) => error.startsWith(`${repoPath}: done_when `));
      if (doneWhenParseError !== undefined) {
        malformedItems.push(repoPath);
        findings.push(`MALFORMED ${repoPath}: expected a well-formed done_when declaration; observed a done_when: line that failed to parse (${doneWhenParseError}) -- quote the value as a JSON string (e.g. done_when: "contains path a, b") to fix`);
        continue;
      }
      undeclaredItems.push(repoPath);
      if (isOpenLike) {
        openUndeclaredItems.push(repoPath);
        findings.push(`UNDECLARED ${repoPath}: expected a done_when declaration (status is ${status}); observed none -- reported only, not yet fatal`);
      }
      continue;
    }

    const parsed = parseDoneWhen(doneWhenRaw);
    const evaluated = evaluateDoneWhen(parsed, { root });
    if (evaluated.malformed) {
      malformedItems.push(repoPath);
      findings.push(`MALFORMED ${repoPath}: expected a well-formed done_when declaration; observed ${evaluated.reason} (done_when: ${JSON.stringify(doneWhenRaw)})`);
      continue;
    }
    if (evaluated.verb === "manual") continue; // never a finding, at any status

    const { satisfied } = evaluated;
    if (status === "closed" && !satisfied) {
      regressionItems.push(repoPath);
      findings.push(`REGRESSION ${repoPath}: expected ${describePredicate(parsed)} to hold (status is closed); observed unsatisfied`);
      continue;
    }
    if (isOpenLike && satisfied) {
      staleOpenItems.push(repoPath);
      findings.push(`STALE-OPEN ${repoPath}: expected ${describePredicate(parsed)} to still be unsatisfied (status is ${status}); observed already satisfied`);
      continue;
    }
    // rejected/deferred, or a status whose class does not apply to this outcome: correctly
    // declared, nothing to report.
  }

  const fatalCount = malformedItems.length + staleOpenItems.length + regressionItems.length;
  return {
    ok: fatalCount === 0,
    findings,
    total: itemNames.length,
    malformed: malformedItems.length,
    malformedItems,
    staleOpen: staleOpenItems.length,
    staleOpenItems,
    regression: regressionItems.length,
    regressionItems,
    undeclared: undeclaredItems.length,
    undeclaredItems,
    openUndeclared: openUndeclaredItems.length,
    openUndeclaredItems,
  };
}

/** 0 = no fatal finding. 1 = at least one fatal finding. 3 = usage/environment error. */
export function exitCodeFor(result) {
  if (result.usageError) return 3;
  return result.ok ? 0 : 1;
}

function main(argv) {
  const json = argv.includes("--json");
  const result = checkBacklogDonePredicate();
  if (json) {
    process.stdout.write(`${JSON.stringify({ schema: SCHEMA, ...result }, null, 2)}\n`);
    return exitCodeFor(result);
  }
  if (result.usageError) {
    process.stderr.write(`${result.findings.join("\n")}\n`);
    return exitCodeFor(result);
  }
  const lines = [
    `backlog items enumerated: ${result.total}`,
    `- malformed: ${result.malformed}`,
    `- stale-open (status open/in_progress, predicate already satisfied): ${result.staleOpen}`,
    `- regression (status closed, predicate not satisfied): ${result.regression}`,
    `- undeclared (no done_when at all, any status): ${result.undeclared}`,
    `- undeclared and open/in_progress (reported, not yet fatal): ${result.openUndeclared}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  if (result.findings.length > 0) {
    process.stdout.write(`Findings (${result.findings.length}):\n`);
    for (const finding of result.findings) process.stdout.write(`  - ${finding}\n`);
  }
  return exitCodeFor(result);
}

if (isDirectInvocation(import.meta.url)) process.exit(main(process.argv.slice(2)));
