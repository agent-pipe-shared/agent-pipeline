#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-suite-registration.mjs -- make an unregistered `*.test.mjs` suite LOUD instead
 * of silently invisible to `harness/scripts/verify.mjs`.
 *
 * WHY THIS EXISTS (backlog `2026-08-07-unregistered-suite-is-red-and-invisible-to-verify.md`
 * / `2026-08-08-a-hardening-round-cannot-register-the-suites-it-writes.md`, PO-decided
 * "candidate 1"). A suite file that exists, is runnable, and is not in `verify.mjs`'s
 * `TEST_SUITES` array contributes nothing to the gate and nothing reports it -- Verify goes
 * green on a candidate that carries a red, unrun suite. This script enumerates every
 * `*.test.mjs` file under `plugins/pipeline-core/` and `harness/`, parses the real
 * registration list out of `verify.mjs`'s source (statically -- there is no CLI flag or
 * export that dumps it), and fails loudly on anything neither registered nor in an
 * explicit, named, REASONED opt-out list.
 *
 * This is a standalone diagnostic -- deliberately NOT wired into `harness/scripts/verify.mjs`
 * itself (TP-3, no in-session override in this repo's `signature` push-approval mode). It can
 * be run at close, in CI, or by a Critic against a review set without touching any gate's
 * strength.
 *
 * PARSING STRATEGY: a depth-aware character scan (comments and string contents skipped)
 * locates EVERY `file:` key inside the `TEST_SUITES` array's source text and captures its
 * value verbatim, whatever shape it is written in -- no AST dependency, matching this
 * codebase's existing comfort with pure string/character-scan logic over its own source
 * (see `git-cmd.mjs`'s header and `guard-maintenance-window-kernel-closure.test.mjs`'s
 * scanner, which this mirrors). Only a value that is, in its entirety, a
 * `join(<base>, "<segment>", ...)` call is resolved to a path; `<base>` must be one of the
 * five directory constants `verify.mjs` itself defines (`repoRoot`, `scriptDir`, `hooksDir`,
 * `libDir`, `pluginScriptsDir`), and every remaining argument must be a fully-quoted string.
 * Every other shape -- a `file:` value that is not a `join(...)` call at all, an unrecognized
 * base identifier, or a `join(...)` call mixing a quoted segment with an unquoted/variable
 * argument -- FAILS CLOSED with a named diagnostic rather than being silently skipped,
 * truncated, or guessed at by a general-purpose JS-expression evaluator. A parser that
 * silently under-reads its own registration list would defeat the entire point of this check.
 *
 * LIMITS -- what this script does NOT establish, stated plainly:
 *
 *   - IT PARSES ONLY THE `TEST_SUITES` ARRAY, NOT VERIFY.MJS'S FULL REGISTERED-SUITE SET.
 *     `verify.mjs` also folds `SCOPED_VERIFY_SUITES` and `WINDOWS_ASSURANCE_VERIFY_SUITES`
 *     (both under `plugins/pipeline-core/`) into the suites it actually runs at runtime
 *     (`registeredSuites = [...TEST_SUITES, ...scopedTests, ...windowsAssuranceTests, ...]`).
 *     Suite files registered ONLY through those two arrays will therefore be reported as
 *     "unaccounted" by this script even though `verify.mjs` does run them -- a known,
 *     deliberate scope limit of this dispatch (NVA-SUITEREG-1), not a bug to be silently
 *     worked around here. The exact false-positive list this produces on this repo's current
 *     state belongs in the dispatch report for the Elephant to triage; this script does not
 *     special-case those two arrays away.
 *   - IT DOES NOT DETECT WHETHER A REGISTERED SUITE ACTUALLY PASSES. Registration and
 *     correctness are different questions; this script answers only "does every suite file
 *     appear somewhere the gate looks."
 *   - THE OPT-OUT LIST IS A DECISION ON THE RECORD, NOT A DECISION THIS SCRIPT MAKES. A
 *     `DELIBERATELY_UNREGISTERED` entry without a non-empty `reason` is rejected as a usage
 *     error (and the underlying file still reports as unaccounted) -- silence is never treated
 *     as consent to exclude.
 *   - REGISTERING THE ACTUAL GAPS THIS SCRIPT FINDS IS OUT OF SCOPE HERE. That is candidate 3
 *     of the same backlog pair: editing `harness/scripts/verify.mjs` is TP-3-protected and
 *     needs its own signed maintenance-window ceremony.
 *
 * EXIT CODES: 0 = every enumerated suite is registered or opted out with a reason.
 * 1 = at least one unaccounted suite file or invalid opt-out entry. 3 = usage/environment
 * error (verify.mjs unreadable, or its `TEST_SUITES` array could not be parsed at all).
 *
 * Usage:
 *   node plugins/pipeline-core/scripts/check-suite-registration.mjs
 *   node plugins/pipeline-core/scripts/check-suite-registration.mjs --json
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const VERIFY_SCRIPT_PATH = join(REPO_ROOT, "harness", "scripts", "verify.mjs");
export const ENUMERATION_ROOTS = Object.freeze([join(REPO_ROOT, "plugins", "pipeline-core"), join(REPO_ROOT, "harness")]);

/**
 * No suites are opted out today. Populate with `{ path, reason }` entries (repo-relative
 * `path`, non-empty `reason`) when a suite is DELIBERATELY excluded from Verify registration.
 * A bare path with no reason is a script usage error, not a silent pass -- see LIMITS above.
 */
export const DELIBERATELY_UNREGISTERED = Object.freeze([]);

/** The five directory constants `verify.mjs` itself defines, expressed as repo-relative segments. */
export const DIRECTORY_CONSTANTS = Object.freeze({
  repoRoot: Object.freeze([]),
  scriptDir: Object.freeze(["harness", "scripts"]),
  hooksDir: Object.freeze(["plugins", "pipeline-core", "hooks"]),
  libDir: Object.freeze(["plugins", "pipeline-core", "lib"]),
  pluginScriptsDir: Object.freeze(["plugins", "pipeline-core", "scripts"]),
});

/** Repo-relative path, forward-slash normalized, no leading `./`. */
export function normalizeRepoRelativePath(path) {
  return String(path).replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Defense-in-depth excludes named by the briefing. None of the three is reachable from
 * either enumeration root on THIS repo today (confirmed by a direct filesystem sweep during
 * authorship of this script) -- kept anyway because a future worktree, scratch dir, or
 * fixture "mutant" directory nested under either root would otherwise be silently swept in.
 */
export function isExcludedPath(relPath) {
  const normalized = normalizeRepoRelativePath(relPath);
  if (normalized === ".claude/worktrees" || normalized.startsWith(".claude/worktrees/") || normalized.includes("/.claude/worktrees/")) return true;
  if (normalized === "scratch" || normalized.startsWith("scratch/") || normalized.includes("/scratch/")) return true;
  if (normalized.includes("/mutant/")) return true;
  return false;
}

/** Recursively enumerate `*.test.mjs` files under `roots`, returned as sorted repo-relative paths. */
export function enumerateTestFiles(roots, { repoRoot = REPO_ROOT } = {}) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // an unreadable/absent root reports nothing rather than crashing enumeration
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const rel = normalizeRepoRelativePath(relative(repoRoot, abs));
      if (isExcludedPath(rel)) continue;
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".test.mjs")) found.push(rel);
    }
  };
  for (const root of roots) walk(root);
  return found.sort();
}

/**
 * Slice out the `TEST_SUITES` array's own source text, from `const TEST_SUITES = [`
 * (inclusive of the opening bracket) up to the first `\n];` line after it. Bracket-counting
 * is deliberately NOT used: entries carry their own inline `[]` (e.g. `args: [...] : []`),
 * and the array's actual closing line is reliably the first bare `];` on its own line.
 */
export function parseTestSuitesBlock(sourceText) {
  const startMarker = "const TEST_SUITES = [";
  const startIndex = sourceText.indexOf(startMarker);
  if (startIndex === -1) throw new Error("PARSE-TEST-SUITES-START-NOT-FOUND: `const TEST_SUITES = [` not found in verify.mjs source");
  const bodyStart = startIndex + startMarker.length - 1; // position of the opening "["
  const terminator = "\n];";
  const terminatorIndex = sourceText.indexOf(terminator, bodyStart);
  if (terminatorIndex === -1) throw new Error("PARSE-TEST-SUITES-END-NOT-FOUND: no `\\n];` terminator found after the TEST_SUITES start marker");
  // terminatorIndex points at the "\n" of "\n];"; the closing "]" is one character further, at
  // terminatorIndex + 1, so the slice's exclusive end must be terminatorIndex + 2 to include it.
  return sourceText.slice(bodyStart, terminatorIndex + 2); // include the closing "]"
}

/**
 * Scan `text` character-by-character (skipping `//` line comments and the contents of string
 * literals) tracking bracket/paren/brace nesting depth, and return every `file:` key found
 * together with the raw source text of its value -- i.e. everything between the key and the
 * next comma or closing delimiter AT THE SAME DEPTH the key itself was found at. This
 * deliberately does NOT assume the value is a `join(...)` call: whatever is written there (a
 * bare identifier, a differently-named function call, a template literal, anything else) is
 * captured verbatim, so the caller can classify -- and, if unrecognized, fail closed on --
 * every shape, not only the one shape this parser already knows how to resolve. A `file:`
 * key is matched only as a whole identifier (`profile:`/`filename:` do not match).
 */
export function extractFileKeyValues(text) {
  const values = [];
  const isIdentChar = (c) => c !== undefined && /[A-Za-z0-9_$]/.test(c);
  const n = text.length;
  let i = 0;
  let depth = 0;
  while (i < n) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < n && text[i] !== quote) {
        if (text[i] === "\\") i++;
        i++;
      }
      i++; // consume the closing quote (or run off the end of a malformed source)
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") {
      depth++;
      i++;
      continue;
    }
    if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      i++;
      continue;
    }
    if (text.startsWith("file", i) && !isIdentChar(text[i - 1]) && !isIdentChar(text[i + 4])) {
      let j = i + 4;
      while (j < n && /\s/.test(text[j])) j++;
      if (text[j] === ":") {
        j++;
        while (j < n && /\s/.test(text[j])) j++;
        const valueStart = j;
        const valueDepth = depth;
        while (j < n) {
          const vc = text[j];
          if (vc === "/" && text[j + 1] === "/") {
            while (j < n && text[j] !== "\n") j++;
            continue;
          }
          if (vc === '"' || vc === "'" || vc === "`") {
            const quote = vc;
            j++;
            while (j < n && text[j] !== quote) {
              if (text[j] === "\\") j++;
              j++;
            }
            j++;
            continue;
          }
          if (vc === "{" || vc === "(" || vc === "[") {
            depth++;
            j++;
            continue;
          }
          if (vc === "}" || vc === ")" || vc === "]") {
            if (depth === valueDepth) break; // closing delimiter of the enclosing structure
            depth--;
            j++;
            continue;
          }
          if (vc === "," && depth === valueDepth) break; // top-level separator
          j++;
        }
        values.push({ index: i, value: text.slice(valueStart, j).trim() });
        i = j;
        continue;
      }
    }
    i++;
  }
  return values;
}

/**
 * Split a `join(...)` call's argument-list text on top-level commas (respecting quotes and
 * any nested brackets), trimming each piece. A single trailing empty piece caused by a
 * trailing comma (`"a, b,"`) is dropped, matching normal JS trailing-comma semantics; an
 * empty piece anywhere else is kept, so the caller rejects it as neither a base identifier
 * nor a quoted string rather than silently ignoring it.
 */
export function splitTopLevelArgs(argsText) {
  const parts = [];
  let current = "";
  let depth = 0;
  const n = argsText.length;
  let i = 0;
  while (i < n) {
    const ch = argsText[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      current += ch;
      i++;
      while (i < n && argsText[i] !== quote) {
        if (argsText[i] === "\\" && i + 1 < n) {
          current += argsText[i];
          i++;
        }
        current += argsText[i];
        i++;
      }
      if (i < n) {
        current += argsText[i]; // closing quote
        i++;
      }
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      current += ch;
      i++;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      current += ch;
      i++;
      continue;
    }
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  parts.push(current.trim());
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

const BASE_IDENTIFIER_ONLY_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const QUOTED_ARG_RE = /^"([^"]*)"$/;

/**
 * Parse every `file:` key's value inside the `TEST_SUITES` array's source text into a
 * repo-relative path. FAILS CLOSED (throws, naming every problem found in one message) on:
 *   - a `file:` value that is not, in its entirety, a `join(...)` call (any other shape -- a
 *     bare identifier, a differently-named function call, a template literal -- is named and
 *     rejected rather than silently producing no entry for that suite);
 *   - a `join(...)` call whose first argument is not a recognized base-directory identifier;
 *   - a `join(...)` call with no path segments at all;
 *   - a `join(...)` call mixing a quoted string segment with an unquoted/variable argument --
 *     every argument after the base MUST be a fully-quoted string, or the call is rejected
 *     rather than silently reconstructed from fewer segments than arguments.
 * See the module header for why: a parser that silently under-reads its own registration
 * list would defeat the entire point of this check.
 */
export function parseRegisteredSuiteFiles(sourceText) {
  const block = parseTestSuitesBlock(sourceText);
  const files = [];
  const problems = [];
  for (const { value } of extractFileKeyValues(block)) {
    const joinMatch = /^join\(([\s\S]*)\)$/.exec(value);
    if (!joinMatch) {
      problems.push(`file: value is not a recognized join(...) call: \`${value}\``);
      continue;
    }
    const argsText = joinMatch[1];
    const args = splitTopLevelArgs(argsText);
    const base = args[0] ?? "";
    if (!BASE_IDENTIFIER_ONLY_RE.test(base)) {
      problems.push(`no base identifier extractable from \`join(${argsText})\``);
      continue;
    }
    const baseSegments = DIRECTORY_CONSTANTS[base];
    if (baseSegments === undefined) {
      problems.push(`unknown base identifier \`${base}\` in \`join(${argsText})\` -- not one of ${Object.keys(DIRECTORY_CONSTANTS).join(", ")}`);
      continue;
    }
    const remaining = args.slice(1);
    if (remaining.length === 0) {
      problems.push(`no quoted path segment in \`join(${argsText})\``);
      continue;
    }
    const segments = [];
    let sawNonString = false;
    for (const arg of remaining) {
      const quotedMatch = QUOTED_ARG_RE.exec(arg);
      if (!quotedMatch) {
        problems.push(`join(...) argument is not a fully-quoted string: \`${arg}\` in \`join(${argsText})\``);
        sawNonString = true;
        continue;
      }
      segments.push(quotedMatch[1]);
    }
    if (sawNonString) continue;
    files.push(normalizeRepoRelativePath([...baseSegments, ...segments].join("/")));
  }
  if (problems.length > 0) {
    throw new Error(`PARSE-TEST-SUITES-UNRECOGNIZED-SHAPE (fails closed rather than guessing at a general-purpose JS-expression evaluator): ${problems.join("; ")}`);
  }
  return files;
}

/**
 * Validate opt-out entries. Returns a `Map` of normalized path -> reason for entries that pass
 * validation, and a list of `{ entry, code }` for entries that do not (missing path, missing
 * reason, or not an object at all). Invalid entries do NOT suppress the underlying finding.
 */
export function validateOptOutEntries(optOut) {
  const valid = new Map();
  const invalid = [];
  for (const entry of optOut ?? []) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      invalid.push({ entry, code: "OPT-OUT-ENTRY-NOT-AN-OBJECT" });
      continue;
    }
    const { path: rawPath, reason } = entry;
    if (typeof rawPath !== "string" || rawPath.trim() === "") {
      invalid.push({ entry, code: "OPT-OUT-PATH-MISSING" });
      continue;
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      invalid.push({ entry, code: "OPT-OUT-REASON-MISSING" });
      continue;
    }
    valid.set(normalizeRepoRelativePath(rawPath), reason.trim());
  }
  return { valid, invalid };
}

/**
 * The pure core. `enumeratedPaths`/`registeredPaths` are repo-relative path strings;
 * `optOut` is the raw `DELIBERATELY_UNREGISTERED`-shaped array. No filesystem access --
 * the regression suite drives this with synthetic sets.
 */
export function compareSuiteRegistration({ enumeratedPaths, registeredPaths, optOut = [] }) {
  const { valid: optOutMap, invalid: invalidOptOut } = validateOptOutEntries(optOut);
  const registeredSet = new Set((registeredPaths ?? []).map(normalizeRepoRelativePath));
  const unaccounted = [];
  const suppressed = [];
  for (const rawPath of enumeratedPaths ?? []) {
    const normalized = normalizeRepoRelativePath(rawPath);
    if (registeredSet.has(normalized)) continue;
    if (optOutMap.has(normalized)) {
      suppressed.push({ path: rawPath, reason: optOutMap.get(normalized) });
      continue;
    }
    unaccounted.push(rawPath);
  }
  return { ok: unaccounted.length === 0 && invalidOptOut.length === 0, unaccounted, suppressed, invalidOptOut };
}

function main(argv) {
  const json = argv.includes("--json");
  let source;
  try {
    source = readFileSync(VERIFY_SCRIPT_PATH, "utf8");
  } catch (error) {
    process.stderr.write(`CHECK-SUITE-REGISTRATION-VERIFY-UNREADABLE: ${error.message}\n`);
    return 3;
  }
  let registeredPaths;
  try {
    registeredPaths = parseRegisteredSuiteFiles(source);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 3;
  }
  const enumeratedPaths = enumerateTestFiles(ENUMERATION_ROOTS);
  const result = compareSuiteRegistration({ enumeratedPaths, registeredPaths, optOut: DELIBERATELY_UNREGISTERED });

  if (json) {
    process.stdout.write(`${JSON.stringify({ schema: "pipeline.check-suite-registration.v1", enumeratedCount: enumeratedPaths.length, registeredCount: registeredPaths.length, ...result }, null, 2)}\n`);
  } else {
    if (result.invalidOptOut.length > 0) {
      process.stdout.write(`Invalid opt-out entries (${result.invalidOptOut.length}):\n`);
      for (const entry of result.invalidOptOut) process.stdout.write(`  - ${entry.code}: ${JSON.stringify(entry.entry)}\n`);
    }
    if (result.unaccounted.length > 0) {
      process.stdout.write(`Unregistered test suites (${result.unaccounted.length}):\n`);
      for (const path of result.unaccounted) process.stdout.write(`  - ${path}\n`);
    }
    if (result.ok) {
      process.stdout.write(`OK: ${enumeratedPaths.length} suite file(s) enumerated against ${registeredPaths.length} TEST_SUITES entries; all registered or opted out with a reason.\n`);
    }
  }
  return result.ok ? 0 : 1;
}

if (isDirectInvocation(import.meta.url)) process.exit(main(process.argv.slice(2)));
