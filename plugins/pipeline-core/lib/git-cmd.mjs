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

// ---- shared push-command detection --------------------------------------------------

/**
 * commandIsGitPush(cmd) -- the ONE source of truth for "is this command a git push",
 * extracted VERBATIM from guard-push.mjs's own three-branch `isPush` computation
 * (former lines ~239-336: the heredoc-aware whole-string-regex branch tested against
 * `commandRegion`, the env-skipping positional `directPush` branch, and the
 * `shellWrapperPush` branch). Every caller that needs to know "will guard-push.mjs
 * treat this as a push" MUST call this function instead of independently
 * hand-maintaining a partial reimplementation of it -- a caller that reimplements only
 * the whole-string branch silently loses detection for shapes like
 * `git.exe -C repo push origin main`, `sh -c "git push origin main"`,
 * `bash -c 'git push'`, or `ssh host "git push"` (NVA-A7FIX-1/2, Critic F-1).
 *
 * `cmd` is the ALREADY-PREPARED command string a caller hands in -- for guard-push.mjs,
 * that is its own `commandAfterDocumentedOverridePrefix` output (documented-override-
 * prefix stripping is guard-push-specific pre-processing that stays there); this
 * function performs no guard-specific pre-processing of its own and has no knowledge of
 * that prefix.
 *
 * Branch 1 (whole-string): tests `/\bgit\s+push\b/` against the quote-stripped,
 * lowercased, global-option-normalized command with here-document BODIES removed --
 * catches forms the positional branches below cannot see, such as
 * `git --git-dir=<path> push` and repeated `-C` overrides that `normalizeGlobalGitOptions`
 * folds away. The heredoc-body removal is here so a heredoc's DATA (not command text)
 * can never be mistaken for a push and can never glue two lines into a false match
 * either; on unbounded/pathological input it degrades to over-detection (fail-closed),
 * never under.
 *
 * Branch 2 (`directPush`, positional): matches `git`/`git.exe` directly followed by
 * `push` or `-C <dir> push`, after skipping a leading run of `NAME=value` assignments
 * and an optional `env` -- so `FOO=bar git push` and `env git push` are still detected
 * positionally.
 *
 * Branch 3 (`shellWrapperPush`, positional): matches a `sh`/`bash`/`zsh`/`dash`/`pwsh`/
 * `powershell`/`cmd`/`ssh` wrapper whose argument contains `git ... push`.
 *
 * Returns `true` if ANY of the three branches match.
 */
export function commandIsGitPush(cmd) {
  if (typeof cmd !== "string" || cmd === "") return false;
  const stripped = stripQuotedSegments(cmd);
  const normalized = normalizeGlobalGitOptions(stripped.toLowerCase());
  const commandRegion = (() => {
    const opener = /(^|\s)<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/u;
    let text = normalized;
    for (let pass = 0; pass < 64; pass += 1) {
      const match = opener.exec(text);
      if (match === null) return text;
      const openerStart = match.index + match[1].length;
      const afterOpener = match.index + match[0].length;
      const bodyStart = text.indexOf("\n", afterOpener);
      if (bodyStart === -1) {
        // An opener with no body: drop the opener token only.
        text = `${text.slice(0, openerStart)}\n${text.slice(afterOpener)}`;
        continue;
      }
      const terminator = new RegExp(`\\n[ \\t]*${match[3]}[ \\t]*(?=\\n|$)`, "u");
      const rest = text.slice(bodyStart);
      const found = rest.match(terminator);
      // No terminator line: this is not a here-document. Treating it as one would let
      // any `<<` delete the remainder of the command -- the arithmetic-shift fail-open.
      // Strip nothing and detect against the whole command instead.
      if (found === null) return normalized;
      text = `${text.slice(0, openerStart)}\n${text.slice(bodyStart + found.index + found[0].length)}`;
    }
    // Bounded-scan exhaustion: fall back to the unstripped command. Over-detection is
    // the safe direction; this is the branch that must never silently open the gate.
    return normalized;
  })();
  const rawDetectionTokens = tokenizeArgv(cmd);
  // Skip a leading `NAME=value` run and an optional `env`, so `FOO=bar git push` and
  // `env git push` are still detected POSITIONALLY.
  const detectionTokens = (() => {
    let index = 0;
    while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(rawDetectionTokens[index] ?? "")) index += 1;
    if (/^env(?:\.exe)?$/i.test(rawDetectionTokens[index] ?? "")) {
      index += 1;
      while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(rawDetectionTokens[index] ?? "")) index += 1;
    }
    return index === 0 ? rawDetectionTokens : rawDetectionTokens.slice(index);
  })();
  const directExecutable = /^(?:git|git\.exe)$/i.test(detectionTokens[0] ?? "");
  const directPush =
    directExecutable &&
    (detectionTokens[1]?.toLowerCase() === "push" ||
      (detectionTokens[1] === "-C" && detectionTokens[2] && detectionTokens[3]?.toLowerCase() === "push"));
  const shellWrapperPush = /^(?:(?:ba|z|da)?sh|pwsh|powershell|cmd|ssh)(?:\.exe)?$/i.test(detectionTokens[0] ?? "") &&
    detectionTokens.some((token) => /\bgit(?:\.exe)?(?:\s+-C\s+\S+)?\s+push\b/i.test(token));
  return /\bgit\s+push\b/.test(commandRegion) || directPush || shellWrapperPush;
}
