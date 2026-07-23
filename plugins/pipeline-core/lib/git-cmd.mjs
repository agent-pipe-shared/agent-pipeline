// SPDX-License-Identifier: SUL-1.0
/**
 * git-cmd.mjs -- shared git-command normalization helpers, no library dependency.
 *
 * DEPENDENCY-FREE LIBRARY (plugins/pipeline-core/lib/): pure string-in/string-out
 * functions only, no node:fs/node:child_process/etc.
 *
 * Provenance: extracted VERBATIM from
 * plugins/pipeline-core/hooks/guard-git.mjs, which now imports these two helpers
 * instead of defining them inline -- zero behavior change (see that file's header
 * for the full QUOTE-STRIPPING / LOWERCASE NORMALIZATION / GLOBAL-OPTION
 * NORMALIZATION invariants this code implements; this module only relocates the
 * logic, it does not alter it).
 */

/**
 * Strip quoted segments (double- and single-quoted) from a command string so a
 * commit MESSAGE that merely mentions a destructive command never trips a
 * deny-rule match (<PROJECT_A>/<PROJECT_C> heritage; see guard-git.mjs header, QUOTE-
 * STRIPPING invariant). Former guard-git.mjs inline logic (~line 210).
 */
export function stripQuotedSegments(cmd) {
  return cmd.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
}

// ---- global git option recognition ----------------------------------------------------
// Normative recognized-options list -- former guard-git.mjs module-level
// constants (~lines 216-233), relocated verbatim.
const GIT_GLOBAL_OPT_SPACE_ARG = "-C|-c"; // mandatory space-separated arg only (no `=` form)
const GIT_GLOBAL_OPT_EQ_OR_SPACE_ARG = "--git-dir|--work-tree|--namespace"; // `--opt=<arg>` or `--opt <arg>`
const GIT_GLOBAL_OPT_EQ_ONLY_ARG = "--exec-path"; // `--opt` or `--opt=<arg>`, no space form
const GIT_GLOBAL_OPT_FLAG =
  "--no-pager|--paginate|-p|-P|--literal-pathspecs|--no-optional-locks|" +
  "--icase-pathspecs|--glob-pathspecs|--noglob-pathspecs|--bare|--no-replace-objects|" +
  "--no-lazy-fetch|--no-advice";
const GIT_GLOBAL_OPT_ALT =
  `(?:${GIT_GLOBAL_OPT_SPACE_ARG})(?![\\w-])\\s+\\S+` +
  `|(?:${GIT_GLOBAL_OPT_EQ_OR_SPACE_ARG})(?:=\\S*|\\s+\\S+)` +
  `|(?:${GIT_GLOBAL_OPT_EQ_ONLY_ARG})(?![\\w-])(?:=\\S*)?` +
  `|(?:${GIT_GLOBAL_OPT_FLAG})(?![\\w-])`;
// Repeats the recognized-option group directly after `git` so a whole run (`-C x -c
// a=b`) collapses in one pass, independently for every `git` invocation in the string
// (chained commands). An unrecognized token stops the repetition immediately, leaving
// it -- and the guard's rule-adjacency requirement -- exactly as before (tripwire
// honesty, never silently claimed covered).
const GIT_GLOBAL_OPT_PREFIX_RE = new RegExp(`\\bgit\\b(?:\\s+(?:${GIT_GLOBAL_OPT_ALT}))*`, "gi");

/**
 * Collapse recognized global git options away so union/extra rules see `git
 * <subcommand>` exactly as if the options were absent. Case-insensitive regardless of
 * the input's own case -- used on both the lowercased union string and the
 * original-case extra-blocker string. Former guard-git.mjs inline function
 * (~line 241).
 */
export function normalizeGlobalGitOptions(str) {
  return str.replace(GIT_GLOBAL_OPT_PREFIX_RE, "git");
}

// ---- quote-aware argv tokenizer + ref-glob matcher ------------------------------------

/**
 * tokenizeArgv(cmd) -- quote-aware argv tokenizer for push refspec EXTRACTION.
 *
 * Distinct from `stripQuotedSegments` (above): that helper DESTROYS quoted content
 * (`"v1.2.3"` -> `""`) which is correct for DETECTION (a commit message merely
 * mentioning a destructive command must not trip a rule) but unusable for EXTRACTION
 * (it would turn `git push origin "v1.2.3"` into an empty ref). This helper is the
 * extraction-safe counterpart: it splits `cmd` into argv tokens on UNQUOTED
 * whitespace, and for each token unwraps quote pairs (single or double) while
 * PRESERVING the inner content verbatim -- `"v1.2.3"` -> `v1.2.3`, `'refs/tags/v*'`
 * -> `refs/tags/v*`, a bare `v1.2.3` -> `v1.2.3` unchanged. A quote appearing anywhere
 * INSIDE a token (not just at its edges) also collapses to its content (`a"b"c` ->
 * `abc`) -- mirrors standard POSIX-ish quote unwrapping; the guard only needs
 * ref-shaped tokens to survive intact, not full shell-quoting fidelity.
 *
 * Tokenizes ONE command segment -- it does NOT split on `&&`/`;`/`|`; the caller
 * (guard-push.mjs's deploy branch) isolates the push segment first. NO new regex is
 * layered on top of this by the guard for extraction purposes -- see that file's own
 * header for how segment isolation and refspec/option identification build on the
 * plain token list this function returns.
 */
export function tokenizeArgv(cmd) {
  const tokens = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let sawAnyChar = false; // distinguishes an empty quoted token (`''`) from no token at all

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (inSingle) {
      if (ch === "'") inSingle = false;
      else current += ch;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      else current += ch;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      sawAnyChar = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      sawAnyChar = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (sawAnyChar) {
        tokens.push(current);
        current = "";
        sawAnyChar = false;
      }
      continue;
    }
    current += ch;
    sawAnyChar = true;
  }
  if (sawAnyChar) tokens.push(current);
  return tokens;
}

const REGEX_SPECIAL_CHAR_RE = /[.*+?^${}()|[\]\\]/;

/** Escapes ONE character for literal inclusion in a RegExp source string. */
function escapeRegexChar(ch) {
  return REGEX_SPECIAL_CHAR_RE.test(ch) ? `\\${ch}` : ch;
}

/**
 * refMatchesPattern(ref, pattern) -- pure glob matcher deciding whether a
 * fully-qualified git ref matches ONE manifest release-adapter trigger pattern (e.g.
 * `refs/tags/v*`). Fixed, security-appropriate semantics -- err toward MORE matches
 * (fail-toward-the-gate, same posture as the rest of this guard family): `*` matches
 * any run of characters INCLUDING `/` (greedy); no other wildcard syntax (`?`, `[...]`
 * are literal characters, not glob metacharacters); case-sensitive (git refs are); the
 * pattern must match the FULL ref string (anchored both ends). Implementation:
 * translate the pattern into an anchored RegExp with every non-`*` character
 * regex-escaped and each `*` -> `.*`.
 *
 * This lives here (pure string logic, this module's remit) rather than inline in the
 * deploy branch -- the guard calls this, never re-implementing ref-glob matching.
 */
export function refMatchesPattern(ref, pattern) {
  if (typeof ref !== "string" || typeof pattern !== "string") return false;
  let source = "^";
  for (const ch of pattern) {
    source += ch === "*" ? ".*" : escapeRegexChar(ch);
  }
  source += "$";
  let re;
  try {
    re = new RegExp(source);
  } catch {
    return false;
  }
  return re.test(ref);
}
