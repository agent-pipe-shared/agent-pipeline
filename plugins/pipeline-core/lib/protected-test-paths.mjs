// SPDX-License-Identifier: SUL-1.0
/**
 * protected-test-paths — ONE definition of the configured protected-test-path rules, plus
 * the shell-lane write classifier that makes those rules independent of tool choice.
 *
 * WHY THIS FILE EXISTS
 *   `guard-testpath.mjs` enforced QG-04/GF-04 for `Edit|Write|NotebookEdit` only, and said
 *   so in its own header: "Plain shell file writes are not seen either … a Bash/PowerShell
 *   redirect (`>`, `Set-Content` etc.) reaching a protected path is unguarded (accepted
 *   gap)". `guardrails/global.md` GL-09 then classified the testpath gate as
 *   AUTHORITY-BEARING — one of the gates that must fail closed rather than open. Both
 *   statements cannot stand: an authority-bearing gate whose coverage depends on which
 *   write tool the agent picks is an honour system, and it was walked around on the first
 *   attempt by a well-behaved dispatch (backlog:
 *   2026-08-08-an-authority-gate-is-bypassable-by-choosing-a-different-write-tool.md).
 *
 *   This module closes the route dimension the same way the SIBLING authority gate already
 *   closed it: `guard-gate-strength.mjs` protects `Edit|Write|NotebookEdit` and exports
 *   `GATE_STRENGTH_PATHS` to `guard-lifecycle-ready.mjs`, which is already wired for
 *   `Bash|PowerShell` and enforces the same rule there (`GUARD-GATE-STRENGTH-SHELL`). The
 *   test-path rule now travels the identical two lanes out of one definition, so the
 *   protected set can never drift between them — and, exactly like its sibling, it needs no
 *   change to the TP-4-protected `hooks.json`, because the `Bash|PowerShell` matcher that
 *   reaches `guard-lifecycle-ready.mjs` already exists.
 *
 * WHY NOT A NAME-MENTION REFUSAL
 *   `GUARD-GATE-STRENGTH-SHELL` refuses any command whose text merely NAMES one of five
 *   config files, because reading them is rare and over-refusal costs a `-F` flag. That
 *   trade is wrong here and would break the gate it protects: protected test suites are
 *   meant to be RUN, and `node --test plugins/pipeline-core/hooks/guard-testpath.test.mjs`
 *   is the verification command this guard's own header prescribes. So this classifier
 *   detects WRITES — redirect targets, write-capable executables, and opaque interpreter
 *   payloads — and leaves reads and test runs alone.
 *
 * NOT COVERED, stated rather than hidden (QG-05)
 *   - A write performed by a SCRIPT the command merely executes (`node scratch/fix.mjs`,
 *     where `fix.mjs` writes a protected path) is invisible to any classifier that can only
 *     read a command line. No string check closes this; it is named here instead of implied.
 *   - Path expressions ASSEMBLED at runtime inside opaque interpreter code
 *     (`join(dir, base)`) defeat the path-token lane. The literal-basename lane below
 *     recovers the common shape of this, not all of it.
 *   - Symlinks, `..` traversal and case-only variants beyond the case-insensitive rule
 *     match: the same accepted trade-off `guard-testpath.mjs` and `guard-git.mjs` already
 *     document. This raises the gate from "any shell write walks past it" to "a shell write
 *     that names its target is refused"; it does not turn a regex guard into a sandbox.
 *
 * NVA-PREPUSH-1 UPDATE (2026-08-27): the first bullet above ("a write performed by a
 * SCRIPT the command merely executes ... is invisible to any classifier that can only
 * read a command line") was, until now, ALSO the description of the residual gap for
 * `git push` specifically — commit a8f861cc's message points here for exactly that
 * reason. That half is now covered, for `push` only, by a DIFFERENT mechanism than
 * this file's classifier: an optional git-level `.git/hooks/pre-push` hook
 * (plugins/pipeline-core/scripts/pre-push-hook-install.mjs) that git itself invokes
 * for every `git push` reaching this repository's remote, regardless of what shell
 * command, sub-process, or script issued it — so a sub-process-mediated push is no
 * longer invisible the way a sub-process-mediated protected-path WRITE still is here.
 * That hook mirrors ONLY guard-push.mjs's evidence-freshness + general-mode-approval
 * checks (see its own header for the exact, narrower scope and why); it is a git-level
 * backstop for `push`, not a fix to this classifier, and it does nothing for the other
 * two bullets above or for any protected-path write that is not a `git push`.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { parseGuardCommand } from "../hooks/guard-command-grammar.mjs";
import {
  LEGACY_GUARD_CONFIG,
  NEUTRAL_GUARD_CONFIG,
  resolveProjectAuthorityPaths,
} from "./project-authority.mjs";

/** Denial code for the shell lane; the write lane keeps guard-testpath's own message shape. */
export const TESTPATH_SHELL_DENIAL_CODE = "GUARD-TESTPATH-SHELL";

/**
 * Resolve the guard-config file exactly as `guard-testpath.mjs` always has: the authority
 * tier's own path when the project resolves, else the neutral tier if it exists on disk,
 * else the legacy tier. Kept here so both lanes read the same file rather than two
 * independently-drifting copies of this three-way choice.
 */
export function resolveGuardConfigPath(projectDir, { existsSyncFn = existsSync } = {}) {
  const authority = resolveProjectAuthorityPaths({ rootDir: projectDir });
  const relative = authority.status === "ready"
    ? authority.guardConfig
    : (existsSyncFn(join(projectDir, NEUTRAL_GUARD_CONFIG)) ? NEUTRAL_GUARD_CONFIG : LEGACY_GUARD_CONFIG);
  return join(projectDir, relative);
}

/**
 * Parse `protectedTestPaths` out of the resolved guard config.
 *
 * Semantics are byte-for-byte the ones `guard-testpath.mjs` shipped (they are its documented
 * config contract and its suite pins them): config absent -> no rules, silently; unreadable
 * JSON or an entry without a usable `pattern` -> that part skipped with a warning so a
 * broken config surfaces instead of silently losing protection; rule id is the explicit
 * `id` or `TP-<n>` counting skipped entries too; a missing `reason` is tolerated.
 */
export function loadProtectedTestPathRules({ rootDir, readFileSyncFn = readFileSync, existsSyncFn = existsSync } = {}) {
  const configPath = resolveGuardConfigPath(rootDir, { existsSyncFn });
  const warnings = [];
  /** @type {Array<{id: string, re: RegExp, reason: string}>} */
  const rules = [];
  let rawConfig = null;
  try {
    rawConfig = readFileSyncFn(configPath, "utf8");
  } catch {
    return { rules, warnings, configPath }; // absent -> no protected paths at all (the normal case)
  }
  try {
    const cfg = JSON.parse(rawConfig);
    const list = cfg?.protectedTestPaths;
    if (list !== undefined && !Array.isArray(list)) {
      warnings.push('"protectedTestPaths" is not an array -> ignored');
    }
    for (const [i, entry] of (Array.isArray(list) ? list : []).entries()) {
      if (typeof entry?.pattern !== "string" || entry.pattern === "") {
        warnings.push(`protectedTestPaths[${i}]: missing/empty "pattern" -> entry skipped`);
        continue;
      }
      try {
        rules.push({
          id: typeof entry?.id === "string" && entry.id !== "" ? entry.id : `TP-${i + 1}`,
          re: new RegExp(entry.pattern, "i"),
          reason:
            typeof entry?.reason === "string" && entry.reason !== ""
              ? entry.reason
              : `Protected test path matched: ${entry.pattern}`,
        });
      } catch (e) {
        warnings.push(`protectedTestPaths[${i}]: invalid regex (${e.message}) -> entry skipped`);
      }
    }
  } catch (e) {
    warnings.push(`unparseable JSON (${e.message}) -> no protected paths active`);
  }
  return { rules, warnings, configPath };
}

/** The write-lane match: backslashes folded, rules already case-insensitive. */
export function protectedTestPathRuleFor(rules, filePath) {
  if (typeof filePath !== "string" || filePath === "") return null;
  const normalized = filePath.replace(/\\/gu, "/");
  return rules.find((rule) => rule.re.test(normalized)) ?? null;
}

// ---------------------------------------------------------------------------------
// Shell lane
// ---------------------------------------------------------------------------------

/**
 * Executables that can put different bytes at, or remove, a path they name. Deliberately an
 * ALLOWLIST of writers rather than a denylist of readers: an executable nobody listed here
 * is not refused, so an unknown reader keeps working and an unknown WRITER is the named
 * residual above, not a silent hole this list pretends to have closed.
 *
 * QG-04 protects the suite against being "modified, weakened, skipped or DELETED", so the
 * removers belong here alongside the writers.
 */
const WRITE_EXECUTABLES = Object.freeze(new Set([
  "tee", "cp", "mv", "install", "ln", "rm", "unlink", "rmdir", "truncate", "shred",
  "touch", "dd", "patch", "split", "csplit", "gzip", "gunzip", "zip", "unzip", "tar",
]));

/** `sed`/`perl`/`ruby` only rewrite in place when told to; the flag is what makes them writers. */
const IN_PLACE_EXECUTABLES = Object.freeze(new Set(["sed", "perl", "ruby"]));
const IN_PLACE_FLAGS = Object.freeze(new Set(["-i", "--in-place"]));

/**
 * git subcommands that can put different bytes in the working tree. The complement of
 * `GATE_STRENGTH_SHELL_SAFE_GIT_VERBS` in guard-lifecycle-ready.mjs and chosen for the same
 * measured reason: `git add`/`commit`/`diff`/`log`/`show`/`status` on a protected suite are
 * ordinary, necessary work and refusing them pushes agents into `git add -A`, which
 * `templates/prompts/agent-obligations.md` §6 forbids.
 */
const GIT_WRITE_VERBS = Object.freeze(new Set([
  "checkout", "restore", "switch", "stash", "apply", "reset", "clean", "rm", "mv", "am",
  "cherry-pick", "revert", "merge", "rebase",
]));

/**
 * Global git options that consume a following argv entry as their value (`-c KEY=VALUE`,
 * `-C <path>`, ...) rather than naming a path themselves. Mirrors the exact set `gitVerb()`
 * has always skipped past to find the subcommand -- reused here as the boundary for candidate
 * extraction too, so a global option's VALUE (e.g. `core.editor=true`) can never be mistaken
 * for a path the way it could when candidate extraction ran over the whole, unfiltered argv.
 * A glued form (`-ccore.editor=true`, one argv token) needs no separate entry here: it already
 * starts with `-`, so the generic "single dash-prefixed token, skip one" fallback below
 * consumes it correctly without ever treating it as carrying a following value.
 */
const GIT_GLOBAL_OPTIONS_WITH_VALUE = Object.freeze(new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]));

/**
 * git subcommands whose arguments are refs/commits/flags only -- never a real working-tree
 * pathspec -- so operand extraction must not invent a file candidate out of them at all.
 * `rebase` is the confirmed case (backlog:
 * 2026-09-01-an-authorized-rebase-demands-a-fresh-po-signature-after-every-conflict.md,
 * Requirement 3): every one of its arguments (`--continue`, `--show-current-patch`, `--onto
 * <ref>`, a branch/commit to rebase onto) is a flag or a revision, never a pathspec, so treating
 * the bare `rebase` token (or anything else its argv carries) as a file candidate is inventing
 * one where git's own grammar has none. This is deliberately NOT generalised to `merge`/
 * `cherry-pick`/`revert`/`switch`, which share the same shape but are outside this
 * requirement's stated scope and untested here.
 *
 * The exclusion covers this subcommand's OWN OPERANDS only -- not every token its argv carries.
 * A shell payload handed to an option (`rebase --exec <cmd>`) is a different token class and
 * keeps its own lane, `GIT_SHELL_PAYLOAD_OPTIONS` below; an earlier wording of this comment
 * claimed the wider exclusion and the code matched the claim, which silently admitted
 * `git rebase --exec "<write to a protected path>"` (round-K finding F2).
 */
const GIT_NO_PATHSPEC_VERBS = Object.freeze(new Set(["rebase"]));

/**
 * Options that hand a git subcommand an opaque SHELL COMMAND rather than a path or a revision,
 * per subcommand because the same short flag means different things elsewhere (`git clean -x`
 * is a boolean flag taking no value at all -- treating it as a payload option would invent
 * candidates out of its neighbours). `rebase`'s `--exec`/`-x` is the confirmed case:
 * Requirement 4 of the same backlog item lists `exec` among the shapes that must stay refused,
 * and its argument is arbitrary code that runs against the working tree.
 *
 * The payload's path-shaped runs go on the SAME `opaque-interpreter-code` lane as `node -e` and
 * `python3 -c` payloads, because it is the same class of input -- one opaque word whose inner
 * tokens are the real targets -- rather than a third mechanism for the same job. This is also
 * strictly wider than the pre-NVA-B-GITARGV behaviour, which made the payload a single
 * whole-string candidate and therefore only matched when the payload ENDED in a protected path.
 *
 * These are the CANONICAL spellings, not the accepted ones: git's `parse-options` resolves any
 * unambiguous abbreviation of a long option, so `gitShellPayloads()` matches the long entries
 * by prefix rather than by equality (round-L finding F1).
 */
const GIT_SHELL_PAYLOAD_OPTIONS = Object.freeze(new Map([
  ["rebase", Object.freeze(["--exec", "-x"])],
]));

/**
 * The long options of a `GIT_NO_PATHSPEC_VERBS` subcommand that are KNOWN to carry no shell
 * code -- a flag, a revision, a strategy name, a number. This table is the INVERSE of
 * `GIT_SHELL_PAYLOAD_OPTIONS`, and the inversion is the whole point of round-L finding F1:
 * behind a verb whose own operands yield no candidates at all, a table keyed on the PAYLOAD
 * options fails OPEN for every spelling it does not enumerate, while a table keyed on the SAFE
 * options fails CLOSED. An omission here costs one spurious candidate on an option nobody
 * passes; an omission there cost the entire gate.
 *
 * Matching is by PREFIX, because git resolves any unambiguous abbreviation and a classifier
 * that only recognises the full spelling is not reading the command git is reading. Measured,
 * not inferred -- real git 2.53.0 in a throwaway fixture repository: `git rebase --exe <cmd>
 * main`, `--ex <cmd>`, `--exe=<cmd>` and `--ex=<cmd>` each exited 0 and EXECUTED the payload;
 * `--e` was refused as ambiguous ("could be --empty or --exec") and `--execute` as unknown.
 *
 * Two deliberate boundaries. `--no-<x>` needs no entry: a parse-options negation is a boolean's
 * off switch and never takes a value. And this is long-option-only -- git abbreviates long
 * options and nothing else, so the bypass class does not exist for short flags, while a
 * fail-closed default for unrecognised SHORT options would invent a candidate out of every
 * `-s <strategy>` and `-X <option>` without closing anything measured.
 *
 * `--exec` is absent on purpose: it is the payload option, and listing it here would restore
 * the finding.
 */
const GIT_NO_PATHSPEC_VERB_KNOWN_OPTIONS = Object.freeze(new Map([
  ["rebase", Object.freeze([
    "--abort", "--allow-empty-message", "--apply", "--autosquash", "--autostash",
    "--committer-date-is-author-date", "--context", "--continue", "--edit-todo", "--empty",
    "--ff", "--force-rebase", "--fork-point", "--gpg-sign", "--help", "--ignore-date",
    "--ignore-whitespace", "--interactive", "--keep-base", "--keep-empty", "--merge", "--onto",
    "--quiet", "--quit", "--reapply-cherry-picks", "--rebase-merges", "--rerere-autoupdate",
    "--reschedule-failed-exec", "--reset-author-date", "--root", "--show-current-patch",
    "--signoff", "--skip", "--stat", "--strategy", "--strategy-option", "--update-refs",
    "--verbose", "--verify", "--whitespace",
  ])],
]));

/**
 * git subcommands with the `[<tree-ish>] [--] <pathspec>...` grammar, where an explicit `--`
 * unambiguously separates the (excluded) revision/tree-ish from the (included) pathspecs.
 * `checkout` and `restore` are the two Requirement 3 names (positive case 4: `git checkout
 * --ours -- backlog/item.md` must extract only the real pathspec, never `checkout`, `--ours`, or
 * a revision such as `HEAD`). `restore` was missing here at first while its tree-ish spelling
 * `--source <rev>` -- a SEPARATE argv entry, unlike the glued `--source=<rev>` -- still reached
 * the generic walk, so the two spellings of one flag disagreed (round-K finding F1).
 * Deliberately NOT extended to `reset`, which shares the identical grammar shape but is outside
 * this requirement's stated scope and untested here -- left on the generic extraction path
 * below, unchanged from before this fix.
 *
 * Without an explicit `--`, a bare `git checkout <token>` stays on the generic extraction path
 * (every non-flag token is still a candidate): git itself resolves that shape as either a branch
 * switch OR a path restore from HEAD depending on repository state, and treating it as never a
 * pathspec would silently stop detecting the genuine "restore a protected file from HEAD without
 * the safety `--`" bypass shape -- narrowing protection, which this fix must not do.
 */
const GIT_TREEISH_PATHSPEC_VERBS = Object.freeze(new Set(["checkout", "restore"]));

/**
 * Interpreters whose payload is one opaque word. Token matching sees a single argument, so
 * these get the wider treatment: every path-shaped run inside the payload is tested, and so
 * is the literal-basename lane below. This is the exact shape the reported bypass used
 * ("wrote the same bytes through Bash/Node `fs` instead").
 */
const OPAQUE_CODE_FLAGS = Object.freeze(new Map([
  ["node", ["-e", "--eval", "-p", "--print"]],
  ["deno", ["eval"]],
  ["bun", ["-e", "--eval"]],
  ["python", ["-c"]],
  ["python3", ["-c"]],
  ["py", ["-c"]],
  ["perl", ["-e", "-E"]],
  ["ruby", ["-e"]],
  ["php", ["-r"]],
  ["sh", ["-c"]],
  ["bash", ["-c"]],
  ["zsh", ["-c"]],
  ["dash", ["-c"]],
  ["ksh", ["-c"]],
  ["pwsh", ["-c", "-command"]],
  ["powershell", ["-c", "-command"]],
]));

/**
 * PowerShell cmdlets (and the shipped aliases for them) that write or delete a named path.
 * PowerShell never reaches the POSIX grammar below — `guard-lifecycle-ready.mjs` returns
 * early for it, deliberately — so this lane matches on the leading verb of the raw command
 * text instead, which is the shape `Set-Content project/guard-config.json` already proved
 * necessary for the sibling gate.
 */
const POWERSHELL_WRITE_VERBS = Object.freeze(new Set([
  "set-content", "add-content", "clear-content", "out-file", "tee-object",
  "copy-item", "move-item", "remove-item", "new-item", "rename-item", "set-item",
  "sc", "ac", "clc", "cpi", "mi", "ri", "ni", "rni", "si", "copy", "move", "del",
  "erase", "rd", "rm", "ren", "mv", "cp",
]));

/** Maximal runs of characters a filename or path can be made of. */
const PATH_TOKEN = /[A-Za-z0-9_.\-/\\~]+/gu;

function normalizedExecutable(word) {
  if (typeof word !== "string" || word === "") return "";
  return basename(word.replace(/\\/gu, "/")).toLowerCase().replace(/\.exe$/u, "");
}

/**
 * A protected rule's literal basename, when the pattern's last path segment is a plain
 * escaped literal. Derived, never configured separately: the rule stays the single source
 * of truth and a pattern too clever to reduce simply contributes no needle (fail-open for
 * this ONE narrower lane, while the full-path lane keeps covering it).
 */
const NEEDLE_EXPANSION_CAP = 32;

/**
 * Expand the small regex shapes this repository's own rules actually use into literal
 * alternatives: innermost non-capturing groups, with or without a trailing `?`. Bounded by
 * NEEDLE_EXPANSION_CAP and by "innermost group contains no parenthesis", so a pattern using
 * anything richer simply stops expanding and contributes no needle rather than sending this
 * function looking for a general regex engine.
 *
 * Without this, a rule written as an alternation of two directories with a nested optional
 * group -- the shape guarding the very suite the reported bypass wrote to -- reduced to a
 * segment full of metacharacters and yielded nothing.
 */
function expandPatternAlternatives(body) {
  let alternatives = [body];
  for (let round = 0; round < 8; round += 1) {
    const next = [];
    let expanded = false;
    for (const candidate of alternatives) {
      const match = /\(\?:([^()]*)\)(\??)/u.exec(candidate);
      if (match === null) { next.push(candidate); continue; }
      expanded = true;
      const branches = match[1].split("|");
      if (match[2] === "?") branches.push("");
      for (const branch of branches) {
        next.push(candidate.slice(0, match.index) + branch + candidate.slice(match.index + match[0].length));
      }
    }
    alternatives = [...new Set(next)];
    if (!expanded || alternatives.length > NEEDLE_EXPANSION_CAP) break;
  }
  return alternatives.length > NEEDLE_EXPANSION_CAP ? [] : alternatives;
}

export function protectedTestPathBasenameNeedles(rules) {
  const needles = [];
  const seen = new Set();
  for (const rule of rules) {
    for (const alternative of expandPatternAlternatives(rule.re.source.replace(/\$$/u, ""))) {
      const segment = alternative.split("/").at(-1) ?? "";
      // Test for metacharacters with every `\X` escape pair REMOVED, never on the unescaped
      // result: `guard-git\.test\.mjs` is a pure literal, but its unescaped form contains
      // three dots and a naive check rejects every real rule this repository has.
      if (/[\\^$.*+?()[\]{}|]/u.test(segment.replace(/\\./gu, ""))) continue;
      const literal = segment.replace(/\\(.)/gu, "$1");
      if (literal === "") continue;
      const needle = literal.toLowerCase();
      const key = `${rule.id} ${needle}`;
      if (seen.has(key)) continue;
      seen.add(key);
      needles.push({ rule, needle });
    }
  }
  return needles;
}

/**
 * Whole-token containment, borrowed verbatim in spirit from `matchesProtectedBasename()` in
 * guard-lifecycle-ready.mjs: `guard-git.test.mjs.bak` is a different file from
 * `guard-git.test.mjs` and a raw `.includes()` cannot tell them apart.
 */
function containsWholeToken(haystack, needle) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![a-z0-9._-])${escaped}(?![a-z0-9._-])`, "u").test(haystack);
}

function ruleForCandidate(rules, candidate) {
  if (typeof candidate !== "string" || candidate === "") return null;
  const normalized = candidate.replace(/\\/gu, "/");
  return rules.find((rule) => rule.re.test(normalized)) ?? null;
}

function hit(rule, candidate, lane) {
  return { rule, candidate, lane };
}

/** Non-flag operands of a segment, `--`-aware, with `dd`'s `of=` operand folded in. */
function operands(argv) {
  const values = [];
  let afterDashDash = false;
  for (const arg of argv) {
    if (!afterDashDash && arg === "--") { afterDashDash = true; continue; }
    if (!afterDashDash && arg.startsWith("-")) continue;
    values.push(arg.startsWith("of=") ? arg.slice(3) : arg);
  }
  return values;
}

/**
 * Real write-target operands for a git subcommand's OWN argv (the tokens after the
 * subcommand), per-subcommand rather than generic -- Requirement 3 of the backlog item named
 * on `GIT_NO_PATHSPEC_VERBS`/`GIT_TREEISH_PATHSPEC_VERBS` above. `verb` is never itself a
 * candidate here because it is never part of `postVerbArgv` (the caller slices it off), which
 * is what fixes the `checkout`/`rebase`-as-a-path defect for every verb, not only the two named
 * subcommands below.
 */
function gitWriteTargetOperands(verb, postVerbArgv) {
  if (GIT_NO_PATHSPEC_VERBS.has(verb)) return [];
  if (GIT_TREEISH_PATHSPEC_VERBS.has(verb)) {
    const dashDashIndex = postVerbArgv.indexOf("--");
    // An explicit `--` is the unambiguous git-grammar boundary: everything at-or-after it is
    // `operands()`'s ordinary "--"-aware walk, so passing the slice STARTING AT "--" both
    // drops every pre-"--" tree-ish/revision token and keeps every post-"--" pathspec,
    // including one that happens to start with "-".
    if (dashDashIndex !== -1) return operands(postVerbArgv.slice(dashDashIndex));
    // No "--" at all: stay on the generic path (see GIT_TREEISH_PATHSPEC_VERBS' own doc
    // comment for why -- this ambiguous shape must not narrow detection).
  }
  return operands(postVerbArgv);
}

/**
 * The opaque shell payloads a git subcommand's OWN argv hands to a payload-carrying option
 * (`GIT_SHELL_PAYLOAD_OPTIONS`). Separate from `gitWriteTargetOperands()` on purpose: these are
 * not operands of the subcommand and are not pathspecs -- they are code, and the caller puts
 * their path-shaped runs on the `opaque-interpreter-code` lane.
 *
 * Three rules for long options, applied in this order, and the order is load-bearing:
 *
 *   1. A name that is a PREFIX of a payload option (`--exec` -> `--exe`, `--ex`, `--e`) carries
 *      a payload. git's `parse-options` resolves unambiguous abbreviations; so does this. The
 *      over-approximation past git's own ambiguity check (`--e` is ambiguous for git, and
 *      accepted as a payload option here) is deliberate: re-encoding git's ambiguity table
 *      would repeat the enumeration mistake one layer down, and the cost is a candidate on a
 *      command git already refuses.
 *   2. A name that is a prefix of a `GIT_NO_PATHSPEC_VERB_KNOWN_OPTIONS` entry, or any `--no-`
 *      negation, carries none.
 *   3. Anything else, on a verb whose operands yield no candidates at all, is UNRECOGNISED and
 *      its argument is treated as a payload -- the fail-closed default round-L finding F1 asks
 *      for. The spelling nobody enumerated is caught here rather than admitted in silence.
 *
 * Short options are unchanged: `-x <cmd>`, the glued `-x<cmd>` and `-x=<cmd>`. No fail-closed
 * default applies to them (see `GIT_NO_PATHSPEC_VERB_KNOWN_OPTIONS` for why).
 *
 * Both the earlier byte-identical-spelling behaviour and its docblock -- which claimed "all
 * three spellings git accepts are covered" -- were measured wrong: git executed `--exe` and
 * `--ex`, and the classifier produced no candidate at all for either.
 */
function gitShellPayloads(verb, postVerbArgv) {
  const flags = GIT_SHELL_PAYLOAD_OPTIONS.get(verb) ?? [];
  const knownOptions = GIT_NO_PATHSPEC_VERB_KNOWN_OPTIONS.get(verb);
  // The fail-closed default is scoped to verbs that have no other candidate source at all; on
  // any other verb an unrecognised option's argument is still reachable as an operand.
  const failClosed = knownOptions !== undefined && GIT_NO_PATHSPEC_VERBS.has(verb);
  if (flags.length === 0 && !failClosed) return [];
  const longFlags = flags.filter((flag) => flag.startsWith("--"));
  const shortFlags = flags.filter((flag) => !flag.startsWith("--"));

  const payloads = [];
  for (let index = 0; index < postVerbArgv.length; index += 1) {
    const arg = postVerbArgv[index];

    if (arg.startsWith("--") && arg.length > 2) {
      const equals = arg.indexOf("=");
      const name = equals === -1 ? arg : arg.slice(0, equals);
      const gluedValue = equals === -1 ? null : arg.slice(equals + 1);
      const isPayloadOption = longFlags.some((flag) => flag.startsWith(name));
      const isKnownOption = name.startsWith("--no-")
        || (knownOptions ?? []).some((flag) => flag.startsWith(name));
      if (!isPayloadOption && (isKnownOption || !failClosed)) continue;
      if (gluedValue !== null) { payloads.push(gluedValue); continue; }
      const value = postVerbArgv[index + 1];
      // A trailing flag with no value carries no payload; consume the value so it can never be
      // read a second time as a bare operand.
      if (value === undefined) continue;
      // Rule 3 only: an unrecognised option followed by another option is a boolean next to its
      // neighbour, not an option with an argument. Rule 1 consumes unconditionally, because a
      // real shell payload may legitimately begin with "-".
      if (!isPayloadOption && value.startsWith("-")) continue;
      payloads.push(value);
      index += 1;
      continue;
    }

    if (shortFlags.includes(arg)) {
      const value = postVerbArgv[index + 1];
      if (value !== undefined) { payloads.push(value); index += 1; }
      continue;
    }
    const glued = shortFlags.find((flag) => arg.startsWith(flag) && arg.length > flag.length);
    if (glued === undefined) continue;
    payloads.push(arg.slice(glued.length + (arg[glued.length] === "=" ? 1 : 0)));
  }
  return payloads;
}

/**
 * PowerShell candidates: the raw write-cmdlet operand, plus any path-shaped sub-tokens
 * embedded inside it (an operand can carry characters PATH_TOKEN would otherwise split on,
 * e.g. a quoted argument with an inner separator) — the same coverage
 * `protectedTestPathShellHit()`'s PowerShell branch always gave, now expressed as candidates
 * rather than as an inline rule check.
 */
function powershellWriteTargets(command) {
  const words = command.trim().split(/\s+/u);
  if (words.length < 2) return [];
  if (!POWERSHELL_WRITE_VERBS.has(normalizedExecutable(words[0]))) return [];
  const targets = [];
  for (const word of words.slice(1)) {
    const stripped = word.replace(/^["']|["']$/gu, "");
    targets.push({ candidate: stripped, lane: "powershell-write-cmdlet" });
    for (const token of stripped.match(PATH_TOKEN) ?? []) {
      if (token === stripped) continue;
      targets.push({ candidate: token, lane: "powershell-write-cmdlet" });
    }
  }
  return targets;
}

/**
 * Extract every write-target CANDIDATE a shell command's syntax shows it touching —
 * redirect targets, write-capable-executable/git-write-verb operands, and path-shaped tokens
 * inside an opaque interpreter payload or an unparseable command — unfiltered by any
 * protected-path rule set. This is the "one definition" this module's header describes:
 * `protectedTestPathShellHit()` below is a thin filter over this list, and
 * `GUARD-DEVPLAN-SHELL` (guard-lifecycle-ready.mjs) reuses this SAME extraction for the
 * dev-plan lifecycle gate's shell lane, which has no rule set of its own to filter by — which
 * is exactly why this function takes no `rules` argument.
 *
 * A raw `>` on a protected path is the textbook shape from the item's own report. It is read
 * off the parse when the grammar accepts the command, and off the raw text when it does not —
 * an unparseable command is refused by the grammar today, but that refusal is liftable by an
 * HGO grammar capability, and an authority gate built on this extraction must not evaporate
 * the moment the grammar objection is cleared.
 *
 * @returns {Array<{candidate: string, lane: string}>} every candidate this command's syntax
 *   shows writing to, in the order a caller would test them against a rule set — not
 *   filtered, not deduplicated.
 */
export function extractShellWriteTargets({ command, root, toolName = "Bash", platform = process.platform } = {}) {
  if (typeof command !== "string" || command.trim() === "") return [];

  if (toolName === "PowerShell") return powershellWriteTargets(command);

  const targets = [];
  const parsed = parseGuardCommand(command, root, { platform });
  if (parsed.parseStatus === "accepted") {
    for (const redirect of parsed.redirects) {
      if (redirect.direction !== ">") continue;
      targets.push({ candidate: redirect.target, lane: "redirect" });
    }
    for (const segment of parsed.segments) {
      const executable = normalizedExecutable(segment.executable);
      const argv = [...segment.argv];

      const codeFlags = OPAQUE_CODE_FLAGS.get(executable);
      if (codeFlags !== undefined && argv.some((arg) => codeFlags.includes(arg.toLowerCase()))) {
        const payload = argv.join(" ");
        for (const token of payload.match(PATH_TOKEN) ?? []) {
          targets.push({ candidate: token, lane: "opaque-interpreter-code" });
        }
        continue;
      }

      const inPlace = IN_PLACE_EXECUTABLES.has(executable)
        && argv.some((arg) => IN_PLACE_FLAGS.has(arg) || /^-[a-z]*i[a-z]*$/u.test(arg));
      const isGit = executable === "git";
      const verbIndex = isGit ? gitVerbIndex(argv) : 0;
      const verb = isGit ? (argv[verbIndex] ?? null) : null;
      const gitWrite = isGit && GIT_WRITE_VERBS.has(verb ?? "");
      if (!WRITE_EXECUTABLES.has(executable) && !inPlace && !gitWrite) continue;

      // Subcommand-aware for git (never the subcommand itself, never a global option's value --
      // both excluded by starting AFTER verbIndex; per-verb pathspec rules beyond that live in
      // gitWriteTargetOperands()); the prior whole-argv `operands()` walk stays exactly as
      // before for every non-git writer.
      const postVerbArgv = gitWrite ? argv.slice(verbIndex + 1) : [];
      const targetOperands = gitWrite ? gitWriteTargetOperands(verb, postVerbArgv) : operands(argv);
      for (const operand of targetOperands) {
        targets.push({ candidate: operand, lane: gitWrite ? "git-working-tree-write" : "write-command" });
      }
      // A shell payload carried by a git option (`rebase --exec <cmd>`) is a different token
      // class from the subcommand's own operands, in the same argv: the operands are revisions
      // and stay non-candidates, while the payload is opaque interpreter code whose path-shaped
      // runs are candidates -- the same lane the `node -e`/`python3 -c` branch above uses, reused
      // rather than duplicated (round-K finding F2).
      for (const payload of gitShellPayloads(verb, postVerbArgv)) {
        for (const token of payload.match(PATH_TOKEN) ?? []) {
          targets.push({ candidate: token, lane: "opaque-interpreter-code" });
        }
      }
    }
    return targets;
  }

  // Unparseable: no authoritative argv exists, so fall back to path tokens in the raw text,
  // gated on the text also naming a write-capable executable or a `>` redirect. Deliberately
  // narrower than the gate-strength lane's unconditional name match, for the reason in this
  // module's header — a protected suite is meant to be run.
  const lowered = command.replace(/\\/gu, "/").toLowerCase();
  const writerNamed = />[^>]/u.test(command)
    || [...WRITE_EXECUTABLES, ...IN_PLACE_EXECUTABLES].some((name) => containsWholeToken(lowered, name))
    || [...OPAQUE_CODE_FLAGS.keys()].some((name) => containsWholeToken(lowered, name));
  if (!writerNamed) return [];
  for (const token of command.match(PATH_TOKEN) ?? []) {
    targets.push({ candidate: token, lane: "unparsed-command" });
  }
  return targets;
}

/**
 * Classify one shell command against the protected-test-path rules.
 *
 * @returns {{rule: {id: string, reason: string}, candidate: string, lane: string}|null}
 *   the FIRST rule this command was shown to write to, or null when nothing matched.
 */
export function protectedTestPathShellHit({ command, rules, root, toolName = "Bash", platform = process.platform } = {}) {
  if (typeof command !== "string" || command.trim() === "") return null;
  if (!Array.isArray(rules) || rules.length === 0) return null;

  for (const target of extractShellWriteTargets({ command, root, toolName, platform })) {
    const rule = ruleForCandidate(rules, target.candidate);
    if (rule !== null) return hit(rule, target.candidate, target.lane);
  }

  // Opaque-interpreter-code basename-needle fallback: intrinsically RULE-derived (it searches
  // a payload for a protected rule's own basename LITERAL, not a candidate the command text
  // alone determines — unlike everything extractShellWriteTargets() extracts above). It has
  // no analog for GUARD-DEVPLAN-SHELL, which has no rule set to derive a needle from, so it
  // stays here rather than in the shared, rule-independent extraction function. This is what
  // catches TPSHELL-1's `join(dir,'guard-push.test.mjs')` case — the embedded-path loop above
  // sees only the bare basename token, which the full protected-path regex never matches on
  // its own.
  if (toolName !== "PowerShell") {
    const parsed = parseGuardCommand(command, root, { platform });
    if (parsed.parseStatus === "accepted") {
      for (const segment of parsed.segments) {
        const executable = normalizedExecutable(segment.executable);
        const codeFlags = OPAQUE_CODE_FLAGS.get(executable);
        if (codeFlags === undefined) continue;
        const argv = [...segment.argv];
        if (!argv.some((arg) => codeFlags.includes(arg.toLowerCase()))) continue;
        const haystack = argv.join(" ").replace(/\\/gu, "/").toLowerCase();
        for (const { rule, needle } of protectedTestPathBasenameNeedles(rules)) {
          if (containsWholeToken(haystack, needle)) return hit(rule, needle, "opaque-interpreter-code");
        }
      }
    }
  }

  return null;
}

/**
 * The index of a `git` invocation's subcommand token in argv, skipping recognised global
 * options -- `-c`/`-C`/`--git-dir`/`--work-tree`/`--namespace` each consume their own value as
 * a SEPARATE following argv entry (also skipped); any other single dash-prefixed token
 * (including a glued form like `-ccore.editor=true`, which carries no separate value entry) is
 * skipped on its own. Returns `argv.length` when every token is a global option and no
 * subcommand token exists.
 */
function gitVerbIndex(argv) {
  let index = 0;
  while (index < argv.length && argv[index].startsWith("-")) {
    index += GIT_GLOBAL_OPTIONS_WITH_VALUE.has(argv[index]) ? 2 : 1;
  }
  return index;
}

/** The subcommand of a `git` invocation, skipping the recognised global options. */
function gitVerb(argv) {
  return argv[gitVerbIndex(argv)] ?? null;
}
