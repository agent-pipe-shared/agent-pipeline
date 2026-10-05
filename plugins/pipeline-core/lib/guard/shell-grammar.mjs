// SPDX-License-Identifier: SUL-1.0
// Guard module "shell-grammar" (layer 1), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { homedir } from "node:os";
import { realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isAllowedPassiveReadTarget } from "../passive-read-policy.mjs";
import { isBoundedReadOnlyPipeline, isBoundedSingleRg, parseGuardCommand } from "../../hooks/guard-command-grammar.mjs";
import { BOUNDED_PIPELINE_ADDITIONAL_ROOTS, CLAUDE_BASH_SHELL_DIALECT_PLATFORM } from "./constants.mjs";
import { MAX_AND_CHAIN_SEGMENTS } from "./grammar-denials.mjs";
import { commandPath, isProjectWritePath, isRealpathedWithinBoundary, pathInside, rawReadCandidatePath } from "./path-containment.mjs";

/**
 * GRAMMARHINT-1 AC-1: name the specific construct the ALREADY-COMPLETED parse rejected,
 * using only what parseGuardCommand() (guard-command-grammar.mjs, out of this dispatch's
 * scope) determined -- never a second, competing parse.
 *
 * GUARD-OPERATOR-UNAPPROVED / GUARD-REDIRECT-UNAPPROVED: the accepted() parse already
 * carries the exact operator/redirect token in parsed.operators / parsed.redirects; naming
 * those is a pure read of data the guard already holds, nothing re-derived. The redirect
 * target itself is never surfaced (AC-5: it can be an absolute, machine-specific path) --
 * only the operator/direction/fd, which is fixed vocabulary.
 *
 * GUARD-PARSE-UNSUPPORTED: parseGuardCommand()'s denied() branch does not preserve which of
 * its several rejection paths fired -- unbalanced quote, backtick, malformed redirect,
 * mismatched segment count and a raw control character are all indistinguishable once
 * denied() returns (guard-command-grammar.mjs, 5 call sites). Carrying that distinction
 * through denied() is a guard-command-grammar.mjs change and out of this dispatch's scope
 * (GRAMMARHINT-1 briefing SS4) -- reported, not made, per SS5's stop condition. The one
 * exception mirrored below is the control-character gate: parseGuardCommand()'s FIRST,
 * unconditional line (`command.trim() === "" || /[\0\r\n]/u.test(command)`) always
 * short-circuits before any tokenization runs, so if this predicate is true the real parser
 * is GUARANTEED, by that same unconditional early return, to have denied the command for
 * exactly this reason -- no other path through parseGuardCommand() can produce "denied" for
 * a command matching this test. Reading that off is not a second parser: no tokenization, no
 * admission decision, no possible drift from what the real parser already concluded.
 */
export function rejectedGrammarElement(code, command, parsed, root) {
  if (code === "GUARD-REDIRECT-UNAPPROVED" && parsed.redirects.length > 0) {
    const redirect = parsed.redirects[0];
    const token = redirect.fd === 2 ? "2>" : redirect.direction;
    return `the redirect operator "${token}"`;
  }
  if (code === "GUARD-OPERATOR-UNAPPROVED" && parsed.operators.length > 0) {
    return `the operator "${parsed.operators[0].operator}"`;
  }
  if (code === "GUARD-PARSE-UNSUPPORTED" && typeof command === "string") {
    // NVA-I-GRAMMAR DoD 4: named FIRST -- a well-formed `&&`-chain whose only fault is that
    // one segment is not independently admitted gets a specific, actionable reason instead of
    // falling through to the generic messages below (which would say nothing at all: none of
    // \n/\r/\0 need be present for this shape).
    const chainFault = typeof root === "string" ? rejectedAndChainSegment(command, root) : null;
    if (chainFault) {
      return `"&&"-chain segment ${chainFault.position} of ${chainFault.total} `
        + `("${chainFault.segment}") is not independently admitted as a read-only diagnostic `
        + "or an approved always-safe write";
    }
    if (/\n/u.test(command)) return "a newline character inside the command text";
    if (/\r/u.test(command)) return "a carriage-return character inside the command text";
    if (/\0/u.test(command)) return "a NUL character inside the command text";
  }
  return null;
}

export function simpleWords(command, root, options = {}) {
  const parsed = parseGuardCommand(command, root, options);
  if (parsed.parseStatus !== "accepted"
    || parsed.segments.length !== 1
    || parsed.operators.length !== 0
    || parsed.redirects.length !== 0) return null;
  return [parsed.segments[0].executable, ...parsed.segments[0].argv];
}

export function exactRoot(args, root, index) {
  return args[index] === "--root" && args[index + 1] === root;
}

// NVA-BOOTADMIT-2 (backlog: onboarding/runner-profile-migration allowlist admitted a flag
// SET only in one fixed order, so a caller that wrote the same flags in a different order --
// or, for intake-consent-apply, omitted an individually-optional value flag its own library
// function never required -- fell through to refusal even though the underlying command was
// exactly as sanctioned as the canonical ordering). Matches an argv TAIL (flags only; the
// caller has already peeled off any fixed leading subcommand/positional tokens such as
// `apply` or `plan repair`) against a declared per-subcommand spec, order-insensitive on the
// flag SET while staying exact on everything else:
//   - `spec.required` / `spec.optional`: sets of bare flags (e.g. `--activate`) that consume
//     only themselves; the only difference between the two is whether the flag has to have
//     been seen by the end of the walk.
//   - `spec.requiredValue` / `spec.optionalValue`: maps from a value flag to its validator.
//     A value flag consumes itself plus exactly the next token, which the validator must
//     accept; the only difference between the two maps is whether the flag has to have been
//     seen by the end of the walk.
// An unknown flag, a duplicated flag, a value flag with a missing or failing value, or a
// leftover positional token where nothing is declared all fall through to no-match -- the
// walk only ever advances by consuming a declared token (plus its value, for a value flag),
// so anything else it encounters ends the match immediately.
//   - `spec.requiredValueOneOf`: a map from value flag to validator of which EXACTLY ONE
//     must be present (NVA-INTAKEARGV-1). It consumes its value like any other value flag;
//     the difference is only in the end-of-walk check. Zero alternatives supplied, or two,
//     both fall through to no-match -- so this never widens the admitted set beyond "one of
//     these, and only one".
export function matchFlagSpec(argsTail, spec) {
  const required = spec.required ?? {};
  const optional = spec.optional ?? {};
  const requiredValue = spec.requiredValue ?? {};
  const optionalValue = spec.optionalValue ?? {};
  const requiredValueOneOf = spec.requiredValueOneOf ?? {};
  const seen = new Set();
  let index = 0;
  while (index < argsTail.length) {
    const token = argsTail[index];
    if (Object.prototype.hasOwnProperty.call(required, token)
      || Object.prototype.hasOwnProperty.call(optional, token)) {
      if (seen.has(token)) return false;
      seen.add(token);
      index += 1;
      continue;
    }
    let validator;
    if (Object.prototype.hasOwnProperty.call(requiredValue, token)) validator = requiredValue[token];
    else if (Object.prototype.hasOwnProperty.call(requiredValueOneOf, token)) validator = requiredValueOneOf[token];
    else validator = optionalValue[token];
    if (validator !== undefined) {
      if (seen.has(token)) return false;
      const value = argsTail[index + 1];
      if (value === undefined || !validator(value)) return false;
      seen.add(token);
      index += 2;
      continue;
    }
    return false;
  }
  const oneOfFlags = Object.keys(requiredValueOneOf);
  if (oneOfFlags.length > 0 && oneOfFlags.filter((flag) => seen.has(flag)).length !== 1) return false;
  return Object.keys(required).every((flag) => seen.has(flag))
    && Object.keys(requiredValue).every((flag) => seen.has(flag));
}

// Shared by every bounded-pipeline SINK below (isBoundedGrepPipeline's own grep-to-grep leg,
// and now isBoundedCatPipeline's grep-to-grep leg too): the identical single-command grep
// argv rule (`--files-with-matches` excluded, nothing else restricted) this file already
// applies outside a pipeline (isReadOnlySimpleWords below). Factored out once so a second
// pipeline SOURCE never means a second, parallel copy of this rule -- NVA-CATPIPE-1 briefing
// field 3, "reuse the SAME argv predicates the existing grep/head sinks already use".
function isValidPipelineGrepArgs(argv) {
  const safeFlags = new Set(["-n", "--line-number", "-i", "--ignore-case", "-F", "--fixed-strings", "-E", "--extended-regexp", "-v", "--invert-match", "-c", "--count"]);
  let index = 0;
  while (safeFlags.has(argv[index])) index += 1;
  const endedOptions = argv[index] === "--";
  if (endedOptions) index += 1;
  return index === argv.length - 1 && typeof argv[index] === "string" && argv[index] !== ""
    && (endedOptions || !argv[index].startsWith("-"));
}

function isValidScopedPipelineGrepSourceArgs(argv, root, extraRoots) {
  return isSafeExactGrepArgs(argv, root, extraRoots);
}

// Shared by every bounded-pipeline SINK ending in `head`: the exact two-token `-n N` shape
// (N in the same canonical 1..500 range guard-command-grammar.mjs's rg-to-head pipeline
// uses) isBoundedGrepPipeline already enforced inline.
//
// NVA-I-GRAMMAR: the combined `head -N` form (backlog: 2026-08-27-shell-grammar-reads-quoted-
// content-as-shell-syntax.md, repro 3) is now admitted here too, mirroring the identical
// `headOk` bound guard-command-grammar.mjs's own isBoundedReadOnlyPipeline (rg-to-head) has
// used since GF-078 bug 2 -- same canonical 1..500 range, same regex shape, checked both ways.
// `head -N` was previously refused for grep-to-head/cat-to-head while already admitted for
// rg-to-head: the identical bounded read, refused only because of which command sourced it.
const HEAD_PIPELINE_COUNT = /^(?:[1-9]|[1-9][0-9]|[1-4][0-9]{2}|500)$/u;

function isValidPipelineHeadArgs(argv) {
  return (argv.length === 2 && argv[0] === "-n" && HEAD_PIPELINE_COUNT.test(argv[1]))
    || (argv.length === 1 && argv[0].startsWith("-") && argv[0] !== "-"
      && HEAD_PIPELINE_COUNT.test(argv[0].slice(1)));
}

/**
 * Extends the bounded read-only pipeline family (guard-command-grammar.mjs's
 * isBoundedReadOnlyPipeline, rg-to-rg/rg-to-head only) with the "grep-to-grep"
 * and "grep-to-head" shapes: the same closed, bounded two-segment structure
 * already admitted for rg, applied to grep, because a bare `grep ... | head`
 * pipeline is the most frequent read-only diagnostic shape actually rejected
 * in practice (backlog/items/2026-07-26-readonly-command-guard-classification.md;
 * specs/sprint-phoenix-epic/RECOVERY.md R-02). Deliberately kept LOCAL to this
 * file rather than added to guard-command-grammar.mjs: this dispatch's briefed
 * scope is exactly guard-lifecycle-ready.mjs, the Dev-Plan gate file, and their
 * test files -- guard-command-grammar.mjs is a separate, unbriefed file, so this
 * duplicates only the bounded head-count/redirect shape already proven safe for
 * rg (never a general shell composer). The grep source/sink argv predicate
 * itself is identical to the already-accepted single-command grep rule below
 * (`--files-with-matches` excluded) -- this recognizes the SAME already-safe
 * command now composed via one bounded pipe, nothing more permissive.
 */
export function isBoundedGrepPipeline(parsed, root, extraRoots = BOUNDED_PIPELINE_ADDITIONAL_ROOTS) {
  if (!parsed || parsed.parseStatus !== "accepted"
    || parsed.segments.length !== 2
    || parsed.operators.length !== 1
    || parsed.operators[0].operator !== "|"
    || parsed.redirects.length > 1) return false;
  const windows = parsed.dialect === "windows-readonly-pipeline";
  const expectedGrep = windows ? "grep.exe" : "grep";
  const sourceName = basename(parsed.segments[0].executable).toLowerCase();
  if (sourceName !== expectedGrep) return false;
  if (!isValidScopedPipelineGrepSourceArgs(parsed.segments[0].argv, root, extraRoots)) return false;
  const sinkName = basename(parsed.segments[1].executable).toLowerCase();
  if (sinkName === expectedGrep) {
    return parsed.redirects.length === 0 && isValidPipelineGrepArgs(parsed.segments[1].argv);
  }
  if (sinkName !== (windows ? "head.exe" : "head")) return false;
  if (parsed.redirects.length === 1) {
    const redirect = parsed.redirects[0];
    if (redirect.segment !== 0 || redirect.fd !== 2 || redirect.direction !== ">"
      || (windows ? redirect.target.toLowerCase() !== "nul" : redirect.target !== "/dev/null")) return false;
  }
  return isValidPipelineHeadArgs(parsed.segments[1].argv);
}

// NVA-CATPIPE-1: the exact GNU/POSIX `cat` flags this predicate admits alongside one or more
// read paths, chosen deliberately narrow and as an ALLOWLIST (unlike isValidPipelineGrepArgs
// above, which is a denylist -- grep's flag surface changes WHAT matches, so excluding the one
// unsafe flag is the safe shape; cat's flags only ever change how already-read bytes are
// DISPLAYED, never which bytes are read or whether anything is written, so admitting a fixed,
// closed set and refusing everything else is both safe and simple). Every entry is a pure
// formatting toggle (numbering lines, marking line ends/tabs, showing non-printing characters,
// squeezing blank runs) or `-u` (unbuffered output, POSIX cat's only other defined flag) --
// none writes, none changes which paths are read. A flag this set does not recognise falls
// through to refusal below (fails closed), never silently ignored.
const CAT_PIPELINE_DISPLAY_FLAGS = new Set([
  "-A", "--show-all",
  "-b", "--number-nonblank",
  "-e",
  "-E", "--show-ends",
  "-n", "--number",
  "-s", "--squeeze-blank",
  "-t",
  "-T", "--show-tabs",
  "-u",
  "-v", "--show-nonprinting",
]);

// Cat source operands use the same exact-path policy as direct passive reads.
function isApprovedCatPipelineReadPath(value, root, extraRoots = []) {
  return typeof value === "string" && !value.startsWith("-")
    && isAllowedPassiveReadTarget(value, {
      rootDir: root, recursive: true, additionalRecursiveRoots: extraRoots,
    });
}

// cat's argv, source side: zero or more CAT_PIPELINE_DISPLAY_FLAGS entries (an optional `--`
// ends flag parsing, matching ordinary shell convention), then one or more read paths, each
// approved by isApprovedCatPipelineReadPath above. At least one path is required -- a `cat`
// with no path argument reads stdin only, which is not a file read this pipeline family
// exists to admit.
function isValidCatPipelineSourceArgs(argv, root, extraRoots = []) {
  let afterDashDash = false;
  const paths = [];
  for (const arg of argv) {
    if (!afterDashDash && arg === "--") { afterDashDash = true; continue; }
    if (!afterDashDash && arg.startsWith("-") && arg !== "-") {
      if (!CAT_PIPELINE_DISPLAY_FLAGS.has(arg)) return false;
      continue;
    }
    paths.push(arg);
  }
  return paths.length > 0 && paths.every((path) => isApprovedCatPipelineReadPath(path, root, extraRoots));
}

/**
 * NVA-CATPIPE-1. Extends the same bounded pipeline family isBoundedGrepPipeline established
 * (above) with a `cat`-sourced source: `cat <paths...> | grep ...` and
 * `cat <paths...> | head -n N`. Measured 2026-08-27: `cat <repo-file> | grep -c open` was
 * refused GUARD-OPERATOR-UNAPPROVED in this repository, and in a different governed
 * repository `cat .claude/pipeline.yaml .claude/pipeline.json .claude/settings.json | grep -E
 * '...'` was refused GUARD-GATE-STRENGTH-SHELL even though that refusal's own text claims cat
 * reads are admitted -- true only for the single-command form until now.
 *
 * Sink half identical to isBoundedGrepPipeline: the same isValidPipelineGrepArgs /
 * isValidPipelineHeadArgs helpers, one sink rule shared by both sources, never a second
 * parallel copy. Source half validated by isValidCatPipelineSourceArgs above -- see that
 * function and CAT_PIPELINE_DISPLAY_FLAGS for the flag-allowlist and path-restriction
 * rationale (deliberately narrower than the existing single-command `cat` rule).
 */
export function isBoundedCatPipeline(parsed, root, extraRoots = []) {
  if (!parsed || parsed.parseStatus !== "accepted"
    || parsed.segments.length !== 2
    || parsed.operators.length !== 1
    || parsed.operators[0].operator !== "|"
    || parsed.redirects.length > 1) return false;
  const windows = parsed.dialect === "windows-readonly-pipeline";
  const expectedCat = windows ? "cat.exe" : "cat";
  const sourceName = basename(parsed.segments[0].executable).toLowerCase();
  if (sourceName !== expectedCat) return false;
  if (!isValidCatPipelineSourceArgs(parsed.segments[0].argv, root, extraRoots)) return false;
  const sinkName = basename(parsed.segments[1].executable).toLowerCase();
  const expectedGrep = windows ? "grep.exe" : "grep";
  if (sinkName === expectedGrep) {
    return parsed.redirects.length === 0 && isValidPipelineGrepArgs(parsed.segments[1].argv);
  }
  if (sinkName !== (windows ? "head.exe" : "head")) return false;
  if (parsed.redirects.length === 1) {
    const redirect = parsed.redirects[0];
    if (redirect.segment !== 0 || redirect.fd !== 2 || redirect.direction !== ">"
      || (windows ? redirect.target.toLowerCase() !== "nul" : redirect.target !== "/dev/null")) return false;
  }
  return isValidPipelineHeadArgs(parsed.segments[1].argv);
}

/**
 * NVA-CF-GITPIPEALLOWLIST. Extends the same bounded pipeline family isBoundedGrepPipeline/
 * isBoundedCatPipeline established with a `git`-sourced source, scoped to `head` only:
 * `git <read-only-subcommand> ... | head -n N` / `git <read-only-subcommand> ... | head -N`.
 * Measured live this session: `git log | head` was refused GUARD-PARSE-UNSUPPORTED even though
 * `git log` alone is already unconditionally trusted read-only (isReadOnlySimpleWords' git
 * branch, via isReadOnlyGitSubcommand below).
 *
 * Subcommand trust is the SAME predicate the single-command git rule uses -- isReadOnlyGitSubcommand,
 * factored out of isReadOnlySimpleWords below so the two can never diverge; this pipeline family
 * never admits a git subcommand the single-command form doesn't already trust. Unlike that
 * single-command form (which applies no path restriction to git's own arguments), every non-flag
 * source argument is additionally scoped to the project root via the identical
 * isApprovedSingleCommandReadArg containment check the un-piped rg/grep/cat/head/tail/wc/stat/file
 * family already applies -- deliberately narrower than the single-command git rule, the same
 * discipline NVA-CATPIPE-1 already applied to the cat pipeline family for the same reason.
 *
 * Sink half identical to isBoundedGrepPipeline/isBoundedCatPipeline's head leg: `head` only
 * (no grep sink for git -- out of this dispatch's scope), same canonical 1..500 bound, same
 * optional trailing `2>/dev/null`.
 */
export function isBoundedGitPipeline(parsed, root, extraRoots = BOUNDED_PIPELINE_ADDITIONAL_ROOTS) {
  if (!parsed || parsed.parseStatus !== "accepted"
    || parsed.segments.length !== 2
    || parsed.operators.length !== 1
    || parsed.operators[0].operator !== "|"
    || parsed.redirects.length > 1) return false;
  const windows = parsed.dialect === "windows-readonly-pipeline";
  const expectedGit = windows ? "git.exe" : "git";
  const sourceName = basename(parsed.segments[0].executable).toLowerCase();
  if (sourceName !== expectedGit) return false;
  const sourceArgv = parsed.segments[0].argv;
  if (sourceArgv.length === 0) return false;
  let index = 0;
  while (index < sourceArgv.length && ["--no-pager", "-p", "--literal-pathspecs"].includes(sourceArgv[index])) {
    index += 1;
  }
  const subcommand = sourceArgv[index];
  const subargs = sourceArgv.slice(index + 1);
  if (!isReadOnlyGitSubcommand(subcommand, subargs)) return false;
  if (!subargs.every((arg) => isApprovedSingleCommandReadArg(arg, root, extraRoots))) return false;
  const sinkName = basename(parsed.segments[1].executable).toLowerCase();
  if (sinkName !== (windows ? "head.exe" : "head")) return false;
  if (parsed.redirects.length === 1) {
    const redirect = parsed.redirects[0];
    if (redirect.segment !== 0 || redirect.fd !== 2 || redirect.direction !== ">"
      || (windows ? redirect.target.toLowerCase() !== "nul" : redirect.target !== "/dev/null")) return false;
  }
  return isValidPipelineHeadArgs(parsed.segments[1].argv);
}

/**
 * Splits a command string on top-level `&&` occurrences only, mirroring
 * retryActionsForDeniedCommand's own quote- and escape-aware local scanner below (same
 * file) but for `&&` instead of `;`/newline. Deliberately NOT delegated to
 * guard-command-grammar.mjs's shared tokenizer: that tokenizer treats `&&` -- together
 * with `;`, `||`, bare `&`, `(`, `)` -- as an unconditional CONTROL rejection
 * (parseGuardCommand returns parseStatus "denied", segments/operators empty) for every
 * OTHER caller across the Pipeline, and this dispatch's briefed scope is
 * guard-lifecycle-ready.mjs only -- widening the SHARED tokenizer would touch every
 * consumer of parseGuardCommand, far outside it. So this file grows its own narrow
 * `&&`-only splitter, the same local-scanner shape already established here.
 *
 * ANY other control character (|, ;, bare &, <, >, (, )) at the top level aborts the
 * split entirely (returns null): admitting an `&&`-chain must never become a side door
 * for a DIFFERENT, still-unapproved operator riding along inside it -- in particular, a
 * chain ending in a pipe (e.g. `git log | head`) is deliberately NOT admitted by this
 * function. This is NOT an unbriefed shape: backlog/items/2026-08-19-closed-shell-
 * grammar-still-rejects-common-readonly-composition.md Proposal point 1 explicitly names
 * "the existing grep-to-grep/grep-to-head pipeline shape as a trailing stage" as accepted
 * scope, and the PO accepted it -- it is simply NOT YET implemented here, deliberately
 * deferred to a dedicated follow-up tracked separately from this dispatch. Each returned
 * part is re-validated independently through parseGuardCommand by the caller -- this
 * function only locates boundaries, it grants no authority on its own.
 */
export function splitTopLevelAndChain(command) {
  if (typeof command !== "string" || command.trim() === "" || /[\0`]/u.test(command)) return null;
  const parts = [];
  let quote = null;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      if (char === "\r" || char === "\n") return null;
      escaped = false;
      continue;
    }
    if (quote !== "'" && char === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === "\r" || char === "\n") return null;
    if (char === "&" && command[index + 1] === "&") {
      parts.push(command.slice(start, index).trim());
      start = index + 2;
      index += 1;
      continue;
    }
    if (";&<>()".includes(char)) return null;
  }
  if (quote !== null || escaped) return null;
  parts.push(command.slice(start).trim());
  if (parts.length < 2 || parts.length > MAX_AND_CHAIN_SEGMENTS) return null;
  if (parts.some((part) => part === "")) return null;
  return parts;
}

/**
 * The shared command grammar intentionally rejects physical newlines before it
 * tokenizes a shell command.  That is correct for mutations (a newline can
 * hide an additional command), but unnecessarily rejects a transcript-style
 * diagnostic block even when every line is independently admitted read-only.
 *
 * This local scanner is deliberately narrower than the existing `&&` lane:
 * it activates only when a physical line boundary is present and every part
 * must pass `isReadOnlyDiagnosticCommand` itself.  In particular it does not
 * inherit the `&&` lane's `mkdir -p` convenience exception.  Semicolons,
 * redirects, substitution, pipes, parentheses, escaped newlines, and quoted
 * newlines remain closed; each physical line is merely an alternative spelling
 * of several separate read-only tool calls.
 */
function splitTopLevelReadOnlyNewlineChain(command) {
  if (typeof command !== "string" || command.trim() === "" || /[\0`]/u.test(command)) return null;
  const parts = [];
  let quote = null;
  let escaped = false;
  let start = 0;
  let sawNewline = false;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      if (char === "\r" || char === "\n") return null;
      escaped = false;
      continue;
    }
    if (quote !== "'" && char === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === "\r" || char === "\n") {
      const part = command.slice(start, index).trim();
      if (part === "") return null;
      parts.push(part);
      if (char === "\r" && command[index + 1] === "\n") index += 1;
      start = index + 1;
      sawNewline = true;
      continue;
    }
    if (";&<>()|".includes(char)) return null;
  }
  if (quote !== null || escaped || !sawNewline) return null;
  const last = command.slice(start).trim();
  if (last === "") return null;
  parts.push(last);
  if (parts.length < 2 || parts.length > MAX_AND_CHAIN_SEGMENTS) return null;
  return parts;
}

// Narrow, explicit allowlist of safe `git log` display flags for the `&&`-chain family.
// A WHITELIST, not a denylist of known-bad flags -- so an unrecognized flag fails closed
// by construction ("if genuinely unsure whether a specific flag is safe, exclude it and
// disclose the exclusion rather than guessing it's fine"). `--all` is deliberately
// EXCLUDED (it reaches refs beyond the working branch); nothing resembling `-c`,
// `--exec`, a pager-invoking flag, or a credential-touching flag is in this set, and
// nothing outside this set is admitted regardless of how safe it looks.
const GIT_LOG_CHAIN_ALLOWED_FLAGS = new Set([
  "--oneline", "--stat", "--name-only", "--name-status", "--graph",
  "--no-merges", "--merges", "--reverse", "--abbrev-commit",
]);

function isChainEligibleGitLogArgs(argv) {
  let maxCountSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (GIT_LOG_CHAIN_ALLOWED_FLAGS.has(arg)) continue;
    if (/^-[1-9][0-9]{0,2}$/u.test(arg)) {
      if (maxCountSeen) return false;
      maxCountSeen = true;
      continue;
    }
    if (arg === "-n") {
      const value = argv[index + 1];
      if (maxCountSeen || typeof value !== "string" || !/^[1-9][0-9]{0,2}$/u.test(value)) return false;
      maxCountSeen = true;
      index += 1;
      continue;
    }
    if (/^--max-count=[1-9][0-9]{0,2}$/u.test(arg)) {
      if (maxCountSeen) return false;
      maxCountSeen = true;
      continue;
    }
    return false;
  }
  return true;
}

// The backlog item's exact "restricted to paths already permitted for agent writes --
// scratch/, scratchpad, `.claude/worktrees/**`" scope, minus `scratchpad`: `scratchpad`
// names an OS-external path (this session's own scratchpad directory, outside the repo),
// never reachable from this in-repo-only classifier -- a path outside `root` can never
// pass the `isProjectWritePath` containment check below, so admitting it here would be a
// silent no-op at best. Deliberately NOT the general `isProjectWritePath` predicate (that
// admits ANY in-repo path, which is exactly the bug this narrowing fixes): a governed but
// not-yet-onboarding-ready session must not be able to create a directory anywhere in the
// repo merely by riding the `&&`-chain family, bypassing the onboarding-readiness gate
// evaluateAfterGrammarAdmission() enforces below. `.claude/worktrees` is repo-relative
// from `root`, matching this file's own path-join convention (`join`, not a raw string).
const CHAIN_ELIGIBLE_MKDIR_PREFIXES = [
  "scratch",
  join(".claude", "worktrees"),
];

/**
 * `mkdir -p` chain eligibility: `isProjectWritePath` is still required (containment / no
 * symlink-escape through an existing ancestor), but it is now an ADDITIONAL check, never
 * the only gate -- the actual restriction is the prefix allowlist above. A target must
 * resolve, relative to `root`, to exactly `scratch/...` or `.claude/worktrees/...`.
 */
function isChainEligibleMkdirTarget(target, root) {
  if (!isProjectWritePath(target, root)) return false;
  const rel = relative(root, resolve(root, target));
  return CHAIN_ELIGIBLE_MKDIR_PREFIXES.some(
    (prefix) => rel === prefix || rel.startsWith(`${prefix}${sep}`),
  );
}

/**
 * The exact small set the backlog item names: git rev-parse, git log (restricted
 * flags), git status, echo, ls, mkdir -p (restricted to scratch/ or .claude/worktrees/,
 * see isChainEligibleMkdirTarget above). `git rev-parse`/`git status`/`ls` are admitted
 * with any argv here because isReadOnlySimpleWords below already admits them
 * unconditionally as single commands -- chaining grants no new authority over what each
 * already does alone. `echo` is admitted with any argv: it has no side effects (no
 * redirect can ride along, since every chain segment below is independently required to
 * parse with zero redirects of its own). Deliberately no `-C`/`-c` support here (unlike
 * the single-command git rule's `-C` handling): keeping the chain family free of the
 * cross-repository-reaching `-C` shape is a deliberate narrowing, not an oversight -- an
 * argv beginning with `-C` or `-c` simply fails every subcommand match below and is
 * refused.
 */
function isChainEligibleSegment(segment, root) {
  const executable = basename(segment.executable).toLowerCase();
  const argv = segment.argv;
  if (executable === "echo") return true;
  if (executable === "ls") return true;
  if (executable === "mkdir") {
    return argv.length === 2 && argv[0] === "-p" && isChainEligibleMkdirTarget(argv[1], root);
  }
  if (executable !== "git") return false;
  const subcommand = argv[0];
  if (subcommand === "rev-parse" || subcommand === "status") return true;
  if (subcommand === "log") return isChainEligibleGitLogArgs(argv.slice(1));
  return false;
}

/**
 * Extends the bounded-composition exception family (the same shape isBoundedGrepPipeline
 * above already established) to `&&`-chained read-only commands, per backlog/items/
 * 2026-08-19-closed-shell-grammar-still-rejects-common-readonly-composition.md Proposal
 * point 1, 2026-08-19-readonly-and-chain-grep-pipe-trailing-stage-not-implemented.md, and
 * (NVA-I-GRAMMAR) the PO's 2026-08-28 decision to admit `&&` generally, recorded in backlog/
 * items/2026-08-27-shell-grammar-reads-quoted-content-as-shell-syntax.md: "anything
 * expressible as `a && b` is already expressible as two tool calls, each classified exactly
 * as it would be inside the chain."
 *
 * Every segment (leading, middle, or trailing -- position no longer matters, per that same
 * no-new-authority argument) is admitted if EITHER of two independent, unioned tests passes,
 * never a verdict inherited from an earlier segment:
 *
 *   1. isReadOnlyDiagnosticCommand(part, root) -- the EXACT classifier a standalone Bash tool
 *      call carrying that same text would be judged by (evaluateLifecycleReadyGuard calls it
 *      identically, a few hundred lines below). Recursion is bounded: `part` is one segment
 *      already split on `&&`, so its own splitTopLevelAndChain() call finds none and returns
 *      null immediately, meaning isBoundedReadOnlyAndChain(part, ...) itself always resolves
 *      to false one level down -- no unbounded recursion, one extra cheap check per part.
 *   2. isChainEligibleSegment -- the small, pre-existing, explicitly-approved-even-though-not-
 *      "read-only" allowlist (echo; mkdir -p restricted to scratch/.claude/worktrees) kept
 *      unchanged so no previously-admitted chain shape regresses.
 *
 * A command failing this union is refused: it falls straight through to parseGuardCommand,
 * whose own tokenizer treats a top-level `&&` as an unconditional CONTROL rejection
 * (guard-command-grammar.mjs, out of this dispatch's scope) -- GUARD-PARSE-UNSUPPORTED, with
 * rejectedAndChainSegment() (below) naming which exact segment failed and why.
 */
export function isBoundedReadOnlyAndChain(command, root, extraRoots = []) {
  const parts = splitTopLevelAndChain(command);
  if (!parts) return false;
  return parts.every((part) => isChainSegmentAdmitted(part, root, extraRoots));
}

function isBoundedReadOnlyNewlineChain(command, root, extraRoots = []) {
  const parts = splitTopLevelReadOnlyNewlineChain(command);
  return parts !== null && parts.every((part) => isReadOnlyDiagnosticCommand(part, root, extraRoots));
}

export function isChainSegmentAdmitted(part, root, extraRoots = []) {
  if (isReadOnlyDiagnosticCommand(part, root, extraRoots)) return true;
  const parsedPart = parseGuardCommand(part, root);
  return parsedPart.parseStatus === "accepted"
    && parsedPart.segments.length === 1
    && parsedPart.operators.length === 0
    && parsedPart.redirects.length === 0
    && isChainEligibleSegment(parsedPart.segments[0], root);
}

/**
 * DoD 4 (NVA-I-GRAMMAR): a refused `&&`-chain names WHICH segment failed, not just that the
 * whole command did -- "a chain refused as a whole teaches nothing" (backlog item, same id).
 * Returns null for anything that is not itself a syntactically well-formed `&&`-chain (so the
 * generic GUARD-PARSE-UNSUPPORTED messaging in rejectedGrammarElement is untouched for those);
 * otherwise the 1-based index, the exact segment text, and the total segment count of the
 * FIRST segment that fails the identical union isBoundedReadOnlyAndChain itself applies --
 * never a second, competing definition of "admitted".
 */
function rejectedAndChainSegment(command, root) {
  const parts = splitTopLevelAndChain(command);
  if (!parts) return null;
  const index = parts.findIndex((part) => !isChainSegmentAdmitted(part, root));
  if (index === -1) return null;
  return { position: index + 1, total: parts.length, segment: parts[index] };
}

/**
 * Admits a bare trailing `2>/dev/null` (POSIX) or `2>nul` (Windows) stderr redirect on a
 * command that is ALREADY independently classified read-only on its own, per backlog
 * Proposal point 2. Reuses parseGuardCommand's own redirect parsing (which already
 * respects quoting) rather than a raw-string scan, so a quoted argument that merely LOOKS
 * like a redirect can never be misread as one.
 *
 * `2>&1` is deliberately NOT admitted here: the shared tokenizer treats the `&` inside a
 * redirect target as a segment/operator terminator, so a bare `2>&1` never produces an
 * empty-vs-populated target it can accept -- parseGuardCommand returns parseStatus
 * "denied" for it today, exactly as it does for `&&`. Making `2>&1` parseable would mean
 * widening guard-command-grammar.mjs's tokenizer, out of this dispatch's briefed scope
 * (guard-lifecycle-ready.mjs and its test file only). Disclosed as a drawn boundary, not
 * implemented.
 */
function simpleWordsAllowingTrailingStderrDevNullRedirect(command, root) {
  const parsed = parseGuardCommand(command, root);
  if (parsed.parseStatus !== "accepted"
    || parsed.segments.length !== 1
    || parsed.operators.length !== 0
    || parsed.redirects.length !== 1) return null;
  const redirect = parsed.redirects[0];
  const windows = parsed.dialect === "windows-direct";
  const isAdmittedRedirect = redirect.fd === 2 && redirect.direction === ">"
    && (windows ? redirect.target.toLowerCase() === "nul" : redirect.target === "/dev/null");
  if (!isAdmittedRedirect) return null;
  return [parsed.segments[0].executable, ...parsed.segments[0].argv];
}

export function isReadOnlyDiagnosticCommandWithTrailingStderrRedirect(command, root, extraRoots = []) {
  const words = simpleWordsAllowingTrailingStderrDevNullRedirect(command, root);
  return words !== null
    && isReadOnlySimpleWords(words, root, [...BOUNDED_PIPELINE_ADDITIONAL_ROOTS, ...extraRoots]);
}

/** Passive operands use the shared path policy; executable inputs stay contained. */
function isApprovedSingleCommandReadArg(arg, root, extraRoots, executableInput = false) {
  if (commandPath(arg, root) === null) return true;
  if (!executableInput) return isAllowedPassiveReadTarget(arg, {
    rootDir: root, recursive: true, additionalRecursiveRoots: extraRoots,
  });
  const candidate = rawReadCandidatePath(arg, root);
  return candidate !== null
    && [root, ...extraRoots].some((boundary) => typeof boundary === "string"
      && boundary !== ""
      && isRealpathedWithinBoundary(candidate, boundary));
}

export function passiveCandidate(raw, root) {
  if (raw === "~") return homedir();
  if (raw.startsWith("~/") || (process.platform === "win32" && raw.startsWith("~\\"))) {
    return join(homedir(), raw.slice(2));
  }
  return isAbsolute(raw) ? raw : join(root, raw);
}

export function isSafeExactPassiveFile(raw, root, extraRoots = []) {
  if (typeof raw !== "string" || !raw || !isAllowedPassiveReadTarget(raw, {
    rootDir: root, recursive: true, additionalRecursiveRoots: extraRoots,
  })) return false;
  try { return statSync(passiveCandidate(raw, root)).isFile(); }
  catch { return false; }
}

function isSafeExactGrepArgs(args, root, extraRoots = []) {
  const flags = new Set(["-n", "--line-number", "-i", "--ignore-case", "-F", "--fixed-strings", "-E", "--extended-regexp", "-v", "--invert-match", "-c", "--count", "-H", "--with-filename", "-h", "--no-filename"]);
  let index = 0;
  while (flags.has(args[index])) index += 1;
  const endedOptions = args[index] === "--";
  if (endedOptions) index += 1;
  const pattern = args[index++];
  if (typeof pattern !== "string" || !pattern || (!endedOptions && pattern.startsWith("-"))) return false;
  const paths = args.slice(index);
  return paths.length > 0 && paths.every((path) => !path.startsWith("-")
    && isSafeExactPassiveFile(path, root, extraRoots));
}

// Directory enumeration may expose immediate child names only. Checking the
// physical directory again closes aliases to protected roots and ancestors.
export function isSafeNamesOnlyDirectory(raw, root, extraRoots = []) {
  if (!isAllowedPassiveReadTarget(raw, {
    rootDir: root, directoryListing: true,
    additionalRecursiveRoots: extraRoots,
  })) return false;
  const candidate = passiveCandidate(raw, root);
  try {
    const physical = realpathSync(candidate);
    return statSync(candidate).isDirectory()
      && isAllowedPassiveReadTarget(physical, {
        rootDir: physical, directoryListing: true,
        additionalRecursiveRoots: extraRoots,
      });
  } catch { return false; }
}

function isNamesOnlyLsArgs(args, root, extraRoots = []) {
  const flags = new Set(["-1", "-a", "-A", "--"]);
  let paths = 0;
  let afterDashDash = false;
  for (const arg of args) {
    if (!afterDashDash && arg === "--") { afterDashDash = true; continue; }
    if (!afterDashDash && arg.startsWith("-")) {
      if (!flags.has(arg)) return false;
      continue;
    }
    if (!isSafeNamesOnlyDirectory(arg, root, extraRoots)) return false;
    paths += 1;
  }
  return paths > 0;
}

/**
 * Keep fail-closed lifecycle states diagnosable without turning arbitrary
 * shell syntax into a write bypass.  Only one simple command is accepted; the
 * parser already rejects control operators, redirections and command
 * substitution. The bounded rg and grep pipeline families (above) are the
 * only two-segment exceptions.
 *
 * Shared tail logic, factored out of isReadOnlyDiagnosticCommand so the trailing-redirect
 * exception above can validate an already-tokenized `[executable, ...argv]` shape without
 * re-parsing (and without duplicating this whole classifier). Behavior for every existing
 * caller of isReadOnlyDiagnosticCommand is unchanged -- this is a pure extraction.
 *
 * `extraRoots` defaults to BOUNDED_PIPELINE_ADDITIONAL_ROOTS so both existing call sites
 * (neither of which passes a third argument) keep exactly the piped shape's own allowance
 * for reading this plugin's own installed root, for free.
 */
function isStandaloneHeadTailReadArgs(args, root, extraRoots) {
  if (args.length === 0) return true; // Existing bare-command compatibility.
  let index = 0;
  let count;
  if (args[0] === "-n") {
    if (args.length < 2) return false;
    count = args[1];
    index = 2;
  } else if (/^-[0-9]+$/u.test(args[0])) {
    count = args[0].slice(1);
    index = 1;
  } else if (args[0].startsWith("-")) {
    return false;
  }
  if (count !== undefined && (!/^(?:[1-9]|[1-9][0-9]|[1-4][0-9]{2}|500)$/u.test(count)
    || Number(count) < 1 || Number(count) > 500)) return false;
  const paths = args.slice(index);
  if (paths.some((path) => path.startsWith("-"))) return false;
  return paths.length === 0 || paths.every((path) => isApprovedSingleCommandReadArg(path, root, extraRoots));
}

// ALFRED-QP4 (R5): Claude's Bash on native Windows is Git-Bash, which keeps the backslashes of a double-quoted word such as "D:\dir\file.md",
// while the guard's POSIX-dialect tokenizer treats every backslash in double quotes as an escape and so reads D:dirfile.md (no drive path, refused).
// For win32 ONLY, a double-quoted word that is a whole shell word and consists solely of a drive letter plus backslash-separated segments of
// letters, digits, dot, underscore, space and hyphen is shown to the grammar with forward slashes -- the same file on Windows. Anything else is
// returned untouched: any single quote or escaped double quote in the command (quote pairing would be ambiguous), an unbalanced quote, a
// word glued to other text, a backslash next to a dollar sign, backtick, backslash or quote. Targets, containment and the secret-tree screen stay
// the grammar's, unchanged: the rewritten command is judged by exactly the same predicate as its forward-slash spelling.
export function win32QuotedDrivePathCommand(command, platform = process.platform) {
  if (platform !== "win32" || typeof command !== "string" || !command.includes("\\") || command.includes("'") || /\\"/u.test(command)) return command;
  const parts = command.split('"');
  if (parts.length % 2 === 0) return command;
  for (let index = 1; index < parts.length; index += 2) {
    if (!/(?:^|\s)$/u.test(parts[index - 1]) || !/^(?:\s|$)/u.test(parts[index + 1])) continue;
    if (/^[A-Za-z]:(?:\\[A-Za-z0-9._ -]+)+$/u.test(parts[index])) parts[index] = parts[index].replaceAll("\\", "/");
  }
  return parts.join('"');
}

// ALFRED-QP4: label selection helper (never an admission). Does ANY non-flag operand of the single rejected command lexically resolve outside the
// project root? Uses the guard's own rawReadCandidatePath() (absolute stays absolute, "~" becomes an absolute sentinel, a relative operand is joined
// onto the root so a leading "../" leaves it) and pathInside(). A protected credential read outside the root (cat ~/.ssh/id_rsa, a secret-named file
// in another tree) is refused by the secret screen even when its own path is approved as a read root, so isOutsideRootSingleCommandRead() alone
// would call it "unsupported"; this keeps the scope code truthful for those.
// R2-2: for rg and grep the PATTERN positional and the value of an option that takes a value are not read targets (a pattern such as "// TODO" or
// "~x" looks like an absolute or home path but is text). The positionals left are the read targets; the VALUE of -f/--file (a pattern file the command
// reads) stays a target. Label selection only: an unknown option is treated as taking no value, which can only make the label more conservative.
const QP4_RG_SHORT_VALUE = "efgmABCtTrjMdE";

const QP4_GREP_SHORT_VALUE = "efmABCdD";

const QP4_RG_LONG_VALUE = new Set(["regexp", "file", "glob", "iglob", "max-count", "after-context", "before-context", "context", "type", "type-not", "type-add",
  "type-clear", "replace", "threads", "max-columns", "max-depth", "maxdepth", "max-filesize", "encoding", "colors", "color", "sort", "sortr", "path-separator",
  "pre", "pre-glob", "ignore-file", "engine", "context-separator", "field-context-separator", "field-match-separator", "dfa-size-limit", "regex-size-limit",
  "hostname-bin", "hyperlink-format"]);

const QP4_GREP_LONG_VALUE = new Set(["regexp", "file", "max-count", "after-context", "before-context", "context", "directories", "devices", "include",
  "exclude", "exclude-from", "exclude-dir", "label", "binary-files", "group-separator"]);

function qp4ReadTargetOperands(name, argv) {
  const rg = name === "rg";
  const shortValue = rg ? QP4_RG_SHORT_VALUE : QP4_GREP_SHORT_VALUE;
  const longValue = rg ? QP4_RG_LONG_VALUE : QP4_GREP_LONG_VALUE;
  const positionals = [];
  const fileValues = [];
  let explicitPattern = false;
  let endOfOptions = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (typeof token !== "string") continue;
    if (endOfOptions || !token.startsWith("-") || token === "-") { positionals.push(token); continue; }
    if (token === "--") { endOfOptions = true; continue; }
    let option = null;
    let attached = "";
    let consumesNext = false;
    if (token.startsWith("--")) {
      const equals = token.indexOf("=");
      const bare = equals === -1 ? token.slice(2) : token.slice(2, equals);
      if (rg && bare === "files") explicitPattern = true;
      if (!longValue.has(bare)) continue;
      option = bare;
      if (equals === -1) consumesNext = true; else attached = token.slice(equals + 1);
    } else {
      for (let k = 1; k < token.length; k += 1) {
        if (!shortValue.includes(token[k])) continue;
        option = token[k];
        attached = token.slice(k + 1);
        consumesNext = attached === "";
        break;
      }
      if (option === null) continue;
    }
    const patternFile = option === "f" || option === "file";
    if (patternFile || option === "e" || option === "regexp") explicitPattern = true;
    const value = consumesNext ? argv[index + 1] : attached;
    if (consumesNext) index += 1;
    if (patternFile && typeof value === "string" && value !== "") fileValues.push(value);
  }
  return [...(explicitPattern ? positionals : positionals.slice(1)), ...fileValues];
}

export function qp4OperandResolvesOutsideRoot(parsed, root) {
  if (!parsed || parsed.parseStatus !== "accepted" || parsed.segments.length !== 1) return false;
  const rootResolved = resolve(root);
  const executable = basename(String(parsed.segments[0].executable ?? "")).toLowerCase();
  const operands = executable === "rg" || executable === "grep" ? qp4ReadTargetOperands(executable, parsed.segments[0].argv) : parsed.segments[0].argv;
  return operands.some((token) => {
    if (typeof token !== "string" || token.includes("\0")) return false;
    const candidate = rawReadCandidatePath(token, root);
    return candidate !== null && !pathInside(rootResolved, resolve(candidate));
  });
}

export function isReadOnlySimpleWords(words, root, extraRoots = BOUNDED_PIPELINE_ADDITIONAL_ROOTS) {
  if (!words || words.length === 0) return false;
  const executable = basename(words[0]).toLowerCase();
  const args = words.slice(1);
  if (executable === "pwd") return args.length === 0 || (args.length === 1 && args[0] === "-P");
  // A labelled separator is the one measured friction case for a read-only
  // chain.  Keep it narrow: printf's assignment form, arbitrary formats, and
  // all echo forms stay outside this diagnostic lane.  The format is data,
  // not a shell construct, and must be exactly a visible label bracketed by
  // literal newline escapes (for example `printf '\\n--- AGENT ---\\n'`).
  if (executable === "printf") return args.length === 1
    && (/^\\n[^%$`\\r\\n]+\\n$/u.test(args[0])
      || /^\n[^%$`\\\r\n\0-\x08\x0b\x0c\x0e-\x1f\x7f]+\n$/u.test(args[0]));
  if (["node", "node.exe"].includes(executable)) {
    if (args.length === 2
      && args[0] === "--check"
      && !args[1].startsWith("-")
      && isApprovedSingleCommandReadArg(args[1], root, extraRoots, true)) {
      return true;
    }
    if (args.length >= 1 && (args[0].endsWith(".test.mjs") || args[0].endsWith(".test.js") || args[0].endsWith(".test.cjs"))
      && isApprovedSingleCommandReadArg(args[0], root, extraRoots, true)) {
      return true;
    }

    return false;
  }
  if (executable === "sha256sum") {
    // backlog: 2026-08-08-the-guard-refuses-the-recovery-the-inspection-prescribes.md
    // (C3). Several path arguments are admitted, each subject to the identical
    // containment check a single path already applies -- `.every()` refuses
    // the whole command if even one entry escapes, so a mixed list cannot be
    // admitted because most of it is fine (AC-3).
    const paths = args[0] === "--" ? args.slice(1) : args;
    return paths.length > 0
      && paths.every((path) => typeof path === "string"
        && !path.startsWith("-")
        && isApprovedSingleCommandReadArg(path, root, extraRoots));
  }
  if (executable === "shasum") {
    if (args.length < 3 || !["-a", "--algorithm"].includes(args[0]) || args[1] !== "256") return false;
    const paths = args.slice(2);
    return paths.every((path) => typeof path === "string"
      && !path.startsWith("-")
      && isApprovedSingleCommandReadArg(path, root, extraRoots));
  }
  if (["certutil", "certutil.exe"].includes(executable)) {
    return args.length === 3
      && args[0].toLowerCase() === "-hashfile"
      && !args[1].startsWith("-")
      && args[2].toUpperCase() === "SHA256"
      && isApprovedSingleCommandReadArg(args[1], root, extraRoots);
  }
  if (["ls", "rg", "grep", "cat", "head", "tail", "wc", "stat", "file"].includes(executable)) {
    if (executable === "rg") return isBoundedSingleRg(args, root, extraRoots);
    if (executable === "grep") return isSafeExactGrepArgs(args, root, extraRoots);
    if (executable === "ls" && isNamesOnlyLsArgs(args, root, extraRoots)) return true;
    if (["head", "tail"].includes(executable)) return isStandaloneHeadTailReadArgs(args, root, extraRoots);
    if (args.some((arg) => arg === "--files-with-matches" && executable === "grep")) return false;
    // The single-command sibling of isOutsideRootBoundedDiagnosticRead's containment check --
    // see isOutsideRootSingleCommandRead() below, whose comment carries the item's done_when
    // marker.
    return args.every((arg) => isApprovedSingleCommandReadArg(arg, root, extraRoots));
  }
  if (executable === "sed") {
    // Only numeric print programs. sed's `e` command executes shell text, and
    // `w`/`i`/`a` can write or produce effects even without -i.
    const script = args[0] === "-n" ? args[1] : args[0];
    const paths = args.slice(args[0] === "-n" ? 2 : 1);
    return /^(?:[0-9]+(?:,[0-9]+)?|\$)p$/u.test(script ?? "")
      && paths.length > 0 && paths.every((path) => !path.startsWith("-")
        && isAllowedPassiveReadTarget(path, { rootDir: root }));
  }
  if (executable === "find") {
    // A closed predicate subset avoids -exec/-ok/-delete and output writers.
    let index = 0;
    while (index < args.length && !args[index].startsWith("-")) {
      if (!isAllowedPassiveReadTarget(args[index], { rootDir: root, recursive: true })) return false;
      index += 1;
    }
    if (index === 0) return false;
    while (index < args.length) {
      const option = args[index++];
      if (option === "-print") continue;
      if (["-maxdepth", "-mindepth"].includes(option)) {
        if (!/^(?:0|[1-9][0-9]*)$/u.test(args[index++] ?? "")) return false;
      } else if (option === "-type") {
        if (!["f", "d", "l"].includes(args[index++])) return false;
      } else if (["-name", "-iname"].includes(option)) {
        if (typeof args[index] !== "string" || !args[index] || args[index].startsWith("-")) return false;
        index += 1;
      } else return false;
    }
    return true;
  }
  if (executable !== "git") return false;
  let index = 0;
  while (index < args.length && args[index].startsWith("-")) {
    if (args[index] === "-C") {
      index += 2;
    } else if (["--no-pager", "-p", "--literal-pathspecs"].includes(args[index])) {
      index += 1;
    } else {
      break;
    }
  }
  const subcommand = args[index];
  const subargs = args.slice(index + 1);
  return isReadOnlyGitSubcommand(subcommand, subargs);
}

// NVA-CF-GITPIPEALLOWLIST: factored out of isReadOnlySimpleWords' git branch (pure extraction,
// behavior for the existing single-command caller unchanged) so isBoundedGitPipeline above can
// reuse the EXACT read-only-subcommand determination rather than a second, drift-prone copy.
// `-C <dir>` handling stays in the caller (isReadOnlySimpleWords) deliberately -- neither this
// function nor isBoundedGitPipeline support it, keeping both callers free of the
// cross-repository-reaching `-C` shape.
function isReadOnlyGitSubcommand(subcommand, subargs) {
  if (subargs.some((arg) =>
    /^(?:--output(?:=|$)|--ext-diff$|--textconv$|--no-index$|-o(?:$|[^-]))/u.test(arg))) return false;
  if (["status", "diff", "log", "show", "rev-parse", "ls-files", "ls-tree", "for-each-ref", "describe"].includes(subcommand)) {
    return true;
  }
  if (subcommand === "apply") {
    const operands = subargs[0] === "--check"
      ? (subargs[1] === "--" ? subargs.slice(2) : subargs.slice(1))
      : [];
    return operands.length > 0 && operands.every((arg) => !arg.startsWith("-") && /\.(?:diff|patch)$/iu.test(arg));
  }
  if (subcommand === "tag") {
    return subargs.length === 0 || subargs.every((arg) =>
      arg === "-l" || arg === "--list" || arg.startsWith("--format="));
  }
  if (subcommand === "branch") {
    return subargs.length === 0 || subargs.every((arg) =>
      arg === "-a" || arg === "-r" || arg === "-v" || arg === "-vv" || arg === "--list" || arg === "--show-current" || arg === "--contains" || arg.startsWith("--format="));
  }
  if (subcommand === "remote") return subargs.length === 0 || (subargs.length === 1 && subargs[0] === "-v");
  // Fetch updates only remote-tracking/object state; it never changes the
  // index or working tree.  A stale or migration-required lifecycle must not
  // prevent an operator from observing the current upstream.  Destructive
  // adoption remains separately guarded at checkout/switch time.
  if (subcommand === "fetch") return true;
  return subcommand === "config"
    && (subargs.includes("--list") || subargs.includes("-l")
      || (subargs.length >= 2 && ["--get", "--get-all", "--get-regexp"].includes(subargs[0])));
}

/**
 * `extraRoots` (NVA-B-READCONTAIN-2): zero or more additional, per-invocation resolved roots a
 * read target may also fall under, ADDITIVE to BOUNDED_PIPELINE_ADDITIONAL_ROOTS -- never a
 * replacement for it. Defaults to `[]` so every pre-existing call site naming only
 * `(command, root)` is unaffected. Threaded into the containment-checked lanes (the
 * single-command, git-pipeline, `&&`-chain/trailing-stderr-redirect, rg-to-rg/rg-to-head,
 * and cat-pipeline families), all backed by the shared realpath-safe containment discipline.
 */
export function isReadOnlyDiagnosticCommand(command, root, extraRoots = []) {
  command = win32QuotedDrivePathCommand(command);
  const parsed = parseGuardCommand(command, root, { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM });
  const pipelineRoots = [...BOUNDED_PIPELINE_ADDITIONAL_ROOTS, ...extraRoots];
  if (isBoundedReadOnlyPipeline(parsed, root, pipelineRoots)) return true;
  if (isBoundedGrepPipeline(parsed, root, pipelineRoots)) return true;
  if (isBoundedCatPipeline(parsed, root, pipelineRoots)) return true;
  if (isBoundedGitPipeline(parsed, root, pipelineRoots)) return true;
  if (isBoundedReadOnlyNewlineChain(command, root, extraRoots)) return true;
  if (isBoundedReadOnlyAndChain(command, root, extraRoots)) return true;
  if (isReadOnlyDiagnosticCommandWithTrailingStderrRedirect(command, root, extraRoots)) return true;
  return isReadOnlySimpleWords(simpleWords(command, root, { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM }), root, pipelineRoots);
}

export function isRejectedReadFamilyCommand(command, root) {
  const parsed = parseGuardCommand(command, root, { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM });
  if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
    || parsed.operators.length !== 0 || parsed.redirects.length !== 0) return false;
  const { executable, argv } = parsed.segments[0];
  const name = basename(executable).toLowerCase();
  if (["cat", "rg", "grep", "head", "tail", "wc", "stat", "file", "ls"].includes(name)) return true;
  if (name === "git" && argv[0] === "diff"
    && argv.some((arg) => arg === "--output" || arg.startsWith("--output=")
      || arg === "--ext-diff" || arg === "--textconv")) return true;
  if (["node", "node.exe"].includes(name)
    && argv.some((arg) => arg === "--test-reporter-destination"
      || arg.startsWith("--test-reporter-destination="))) return true;
  return false;
}

/**
 * GRAMMARHINT-1 AC-2 / GUARDFIX-2: the one GUARD-PARSE-UNSUPPORTED shape with a fixed, safe,
 * universally available remediation -- a `git commit ... -m <value>` (or `--message`) whose
 * message text carries a literal newline or carriage return, which the closed grammar can
 * never admit (control characters are refused unconditionally, parseGuardCommand()'s first
 * line, before any tokenization runs). Split the message into single-line -m arguments and
 * use Git's --trailer switches for the provenance block.
 *
 * It is delivered as MESSAGE TEXT, never as a typed retryAction. AC-047-140 admits an entry
 * into `pipeline.guard-retry-actions.v1` only when "every returned action is a
 * separate-tool-call, independently admitted read-only diagnostic", and `git commit -F` is a
 * mutation the closed grammar does not admit on its own -- not a borderline case but exactly
 * what that sentence excludes. Shipping it as an action also put the producer at odds with the
 * envelope's only in-repo consumer: denialRetryActions() (lib/human-guard-override.mjs) drops
 * every action whose `mutation` is not `false`, so it could never be executed through that
 * path either. Prose carries no such contract -- it can name a mutating fix without claiming
 * the envelope's read-only guarantee for it, which is why the help survives here undiminished.
 *
 * Detected narrowly, by raw text, never by re-parsing the command into the closed grammar:
 * "git commit" at the start, an -m/--message flag present, and a literal newline/CR
 * somewhere in the command. A false negative here only means no remediation line is printed
 * (never worse than the silence that preceded it); it can never print a wrong one, and
 * printing it never changes what the grammar admits (AC-3) -- the verdict is untouched, only
 * better explained. Deliberately narrow: `git -C <dir> commit` and other prefixed invocations
 * are not matched (reported as a known limitation, not silently claimed as covered).
 */
function commitMessageFileRemediation(command) {
  if (typeof command !== "string") return null;
  if (!/^\s*git\s+commit\b/u.test(command)) return null;
  if (!/(?:^|\s)-m(?:[\s"'=]|$)|(?:^|\s)--message\b/u.test(command)) return null;
  if (!/[\r\n]/u.test(command)) return null;
  return "Remediation: pass each paragraph as a single-line -m argument and provenance as Git --trailer arguments. "
    + "Run \"git add -- <paths>\" and then "
    + "\"git commit -m '<type(scope): subject>' -m '<why>' --trailer 'AI-Assisted: true' "
    + "--trailer 'Dispatch: <task> (<role>)' -- <paths>\" as separate tool calls, "
    + "naming the same exact paths in both. Include Dispatch only when the repository requires it.";
}

/**
 * Recognises an actual, unquoted here-document introducer without trying to admit or fully
 * parse heredocs. This deliberately understands only the small syntax needed to avoid a
 * misleading help line for quoted text such as `printf '<<EOF'`: outside quotes, `<<` (or
 * `<<-`) must be followed by one conservative delimiter token and a later line break.
 *
 * A false negative leaves today's refusal unchanged. A false positive would suggest Write/Edit
 * for ordinary quoted content, so this scanner is intentionally narrower than shell heredoc
 * syntax (which the closed grammar continues to reject in all forms).
 */
function hasHeredocIntroducer(command) {
  if (typeof command !== "string" || !/[\r\n]/u.test(command)) return false;
  let quote = null;
  let escaped = false;
  for (let index = 0; index < command.length - 1; index += 1) {
    const char = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char !== "<" || command[index + 1] !== "<") continue;

    let cursor = index + 2;
    if (command[cursor] === "-") cursor += 1;
    while (command[cursor] === " " || command[cursor] === "\t") cursor += 1;
    const delimiterStart = command[cursor];
    if (delimiterStart === "'" || delimiterStart === '"') {
      const delimiterEnd = command.indexOf(delimiterStart, cursor + 1);
      if (delimiterEnd > cursor + 1 && /[\r\n]/u.test(command.slice(delimiterEnd + 1))) return true;
      continue;
    }
    const delimiter = command.slice(cursor).match(/^[A-Za-z_][A-Za-z0-9_]*\b/u);
    if (delimiter !== null && /[\r\n]/u.test(command.slice(cursor + delimiter[0].length))) return true;
  }
  return false;
}

function heredocFileRemediation(command) {
  if (!hasHeredocIntroducer(command)) return null;
  return "Remediation: here-documents are not admitted by the closed shell grammar. "
    + "If the here-document was creating repository content, use Write for a new file or Edit for an existing file instead; "
    + "keep any resulting command as a separate tool call.";
}

export function grammarRemediation(command) {
  return commitMessageFileRemediation(command) ?? heredocFileRemediation(command);
}

/**
 * Recover only independent semicolon- or physical-newline-separated
 * diagnostics. This is a correction hint, never an execution bypass: each
 * returned argv must pass the same closed single-command read-only policy on
 * its own. Quoted and escaped newlines are deliberately not normalized -- a
 * newline inside quotes (the `git commit -m` case above) yields no action at
 * all, and its remediation is printed as message text instead. No caller may
 * add an entry past the per-part policy below: the returned list is the whole
 * envelope, and every element of it has passed that policy.
 */
export function retryActionsForDeniedCommand(command, root, extraRoots = []) {
  if (typeof command !== "string" || command.trim() === ""
    || /[\0`]/u.test(command) || /\$\s*\(/u.test(command)) return [];
  const parts = [];
  let quote = null;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      if (char === "\r" || char === "\n") return [];
      escaped = false;
      continue;
    }
    if (quote !== "'" && char === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === ";" || char === "\n" || char === "\r") {
      if (char === "\r" && command[index + 1] !== "\n") return [];
      parts.push(command.slice(start, index).trim());
      start = index + (char === "\r" ? 2 : 1);
      if (char === "\r") index += 1;
      continue;
    }
    if ("|&<>()".includes(char)) return [];
  }
  if (quote !== null || escaped || parts.length === 0) return [];
  parts.push(command.slice(start).trim());
  if (parts.some((part) => part === "")) return [];
  const actions = [];
  for (const part of parts) {
    const parsed = parseGuardCommand(part, root, { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM });
    if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
      || parsed.operators.length !== 0 || parsed.redirects.length !== 0
      || !isReadOnlyDiagnosticCommand(part, root, extraRoots)) return [];
    actions.push({
      executable: parsed.segments[0].executable,
      argv: [...parsed.segments[0].argv],
      mutation: false,
      requiresConfirmation: false,
      executionBoundary: "separate-tool-call",
      expected: { exitCodes: [0, 1] },
    });
  }
  return actions;
}
