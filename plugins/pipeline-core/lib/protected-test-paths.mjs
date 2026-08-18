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
 * Without this, TP-5 -- `(?:…guard-push(?:-v2)?|harness/scripts/pipeline-state)\.test\.mjs$`,
 * the rule guarding the very file the reported bypass wrote to -- reduced to a segment full
 * of metacharacters and yielded nothing.
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
      const key = `${rule.id} ${needle}`;
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

function ruleForEmbeddedPaths(rules, text) {
  if (typeof text !== "string" || text === "") return null;
  for (const token of text.match(PATH_TOKEN) ?? []) {
    const rule = ruleForCandidate(rules, token);
    if (rule !== null) return { rule, candidate: token };
  }
  return null;
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

function powershellHit(command, rules) {
  const words = command.trim().split(/\s+/u);
  if (words.length < 2) return null;
  if (!POWERSHELL_WRITE_VERBS.has(normalizedExecutable(words[0]))) return null;
  for (const word of words.slice(1)) {
    const stripped = word.replace(/^["']|["']$/gu, "");
    const direct = ruleForCandidate(rules, stripped);
    if (direct !== null) return hit(direct, stripped, "powershell-write-cmdlet");
    const embedded = ruleForEmbeddedPaths(rules, stripped);
    if (embedded !== null) return hit(embedded.rule, embedded.candidate, "powershell-write-cmdlet");
  }
  return null;
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

  if (toolName === "PowerShell") return powershellHit(command, rules);

  // A raw `>` on a protected path is the textbook shape from the item's own report. It is
  // read off the parse when the grammar accepts the command, and off the raw text when it
  // does not — an unparseable command is refused by the grammar today, but that refusal is
  // liftable by an HGO grammar capability, and this authority gate must not evaporate the
  // moment the grammar objection is cleared.
  const parsed = parseGuardCommand(command, root, { platform });
  if (parsed.parseStatus === "accepted") {
    for (const redirect of parsed.redirects) {
      if (redirect.direction !== ">") continue;
      const rule = ruleForCandidate(rules, redirect.target);
      if (rule !== null) return hit(rule, redirect.target, "redirect");
    }
    for (const segment of parsed.segments) {
      const executable = normalizedExecutable(segment.executable);
      const argv = [...segment.argv];

      const codeFlags = OPAQUE_CODE_FLAGS.get(executable);
      if (codeFlags !== undefined && argv.some((arg) => codeFlags.includes(arg.toLowerCase()))) {
        const payload = argv.join(" ");
        const embedded = ruleForEmbeddedPaths(rules, payload);
        if (embedded !== null) return hit(embedded.rule, embedded.candidate, "opaque-interpreter-code");
        const haystack = payload.replace(/\\/gu, "/").toLowerCase();
        for (const { rule, needle } of protectedTestPathBasenameNeedles(rules)) {
          if (containsWholeToken(haystack, needle)) return hit(rule, needle, "opaque-interpreter-code");
        }
        continue;
      }

      const inPlace = IN_PLACE_EXECUTABLES.has(executable)
        && argv.some((arg) => IN_PLACE_FLAGS.has(arg) || /^-[a-z]*i[a-z]*$/u.test(arg));
      const gitWrite = ["git"].includes(executable) && GIT_WRITE_VERBS.has(gitVerb(argv) ?? "");
      if (!WRITE_EXECUTABLES.has(executable) && !inPlace && !gitWrite) continue;

      for (const operand of operands(argv)) {
        const rule = ruleForCandidate(rules, operand);
        if (rule !== null) return hit(rule, operand, gitWrite ? "git-working-tree-write" : "write-command");
      }
    }
    return null;
  }

  // Unparseable: no authoritative argv exists, so fall back to path tokens in the raw text,
  // gated on the text also naming a write-capable executable or a `>` redirect. Deliberately
  // narrower than the gate-strength lane's unconditional name match, for the reason in this
  // module's header — a protected suite is meant to be run.
  const lowered = command.replace(/\\/gu, "/").toLowerCase();
  const writerNamed = />[^>]/u.test(command)
    || [...WRITE_EXECUTABLES, ...IN_PLACE_EXECUTABLES].some((name) => containsWholeToken(lowered, name))
    || [...OPAQUE_CODE_FLAGS.keys()].some((name) => containsWholeToken(lowered, name));
  if (!writerNamed) return null;
  const embedded = ruleForEmbeddedPaths(rules, command);
  return embedded === null ? null : hit(embedded.rule, embedded.candidate, "unparsed-command");
}

/** The subcommand of a `git` invocation, skipping the recognised global options. */
function gitVerb(argv) {
  let index = 0;
  while (index < argv.length && argv[index].startsWith("-")) {
    index += ["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(argv[index]) ? 2 : 1;
  }
  return argv[index] ?? null;
}
