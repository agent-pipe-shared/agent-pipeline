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
  // GPGL-5: one POSIX-aware pass instead of two regex passes that ignored backslashes. An escaped
  // quote used to desynchronise the regexes, so a real command was swallowed into a "quoted span".
  let out = "";
  let i = 0;
  while (i < cmd.length) {
    const ch = cmd[i];
    if (ch === "\\") {
      // Outside quotes a backslash and the character it escapes are one literal unit: an escaped
      // quote is never a delimiter, so what follows it stays visible.
      out += cmd.slice(i, i + 2);
      i += 2;
      continue;
    }
    let span = null;
    let blank = "";
    if (ch === "$" && cmd[i + 1] === "'") {
      span = readAnsiCQuoted(cmd, i + 1);
      blank = "$''";
    } else if (ch === "'") {
      span = readSingleQuoted(cmd, i);
      blank = "''";
    } else if (ch === '"') {
      span = readDoubleQuoted(cmd, i);
      blank = '""';
    }
    if (span === null) {
      out += ch;
      i += 1;
      continue;
    }
    // An unterminated span is left exactly as written: nothing hides behind a quote that never closes.
    if (span.end === -1) return out + cmd.slice(i);
    out += blank;
    i = span.end + 1;
  }
  return out;
}

// ---- POSIX quoting primitives (GPGL-5) ---------------------------------------------------
// One quoting grammar shared by `stripQuotedSegments`, `tokenizeArgv` and the push classifier, so the three
// can never disagree about where a quoted span ends. Outside quotes a backslash escapes the next character;
// inside double quotes it escapes only `"`, `\`, `$`, a backtick and a newline (before any other character
// it is itself a literal); inside single quotes nothing is escaped; `$'...'` decodes ANSI-C escapes; adjacent
// quoted and unquoted parts of one word concatenate (`pu"sh"` is the word `push`).

// Characters that give a word structure when unquoted. A quoted part holding one of them is data (an
// argument such as `ssh -i key`), never command text, so the detection view blanks it.
const SHELL_STRUCTURAL_RE = /[\s;&|()<>`$"'\\]/u;

/** A single-quoted span whose opening quote is at `open`. `end` is the closing quote's index, -1 when unterminated. */
function readSingleQuoted(cmd, open) {
  const end = cmd.indexOf("'", open + 1);
  return end === -1 ? { end: -1, content: cmd.slice(open + 1) } : { end, content: cmd.slice(open + 1, end) };
}

/** An ANSI-C span; `open` is the index of the quote that follows the `$`. */
function readAnsiCQuoted(cmd, open) {
  let content = "";
  for (let i = open + 1; i < cmd.length; i += 1) {
    const ch = cmd[i];
    if (ch === "'") return { end: i, content };
    if (ch === "\\") {
      const decoded = decodeBashAnsiCEscape(cmd, i);
      content += decoded.value;
      i = decoded.end;
    } else content += ch;
  }
  return { end: -1, content };
}

/**
 * A double-quoted span whose opening quote is at `open`. One deliberate tolerance: a `\"` that is the last
 * non-blank text of the whole command (a Windows path such as `"C:\repo\"`) closes the span with the backslash
 * kept literal. POSIX would call that span unterminated, but nothing follows it, so no command can hide behind
 * it under either reading and the command is not routed to the push gate for it.
 */
function readDoubleQuoted(cmd, open) {
  let content = "";
  for (let i = open + 1; i < cmd.length; i += 1) {
    const ch = cmd[i];
    if (ch === '"') return { end: i, content };
    if (ch !== "\\") {
      content += ch;
      continue;
    }
    const next = cmd[i + 1];
    if (next === undefined) {
      content += ch;
      break;
    }
    if (next === '"' && /^\s*$/u.test(cmd.slice(i + 2))) return { end: i + 1, content: `${content}\\` };
    if (next === "\n") i += 1;
    else if (next === '"' || next === "\\" || next === "$" || next === "`") {
      content += next;
      i += 1;
    } else content += ch;
  }
  return { end: -1, content };
}

/**
 * scanShell(cmd, pathBackslash) -- one POSIX pass over `cmd` that returns what the classifier needs:
 *   words: the argv-style words (split on unquoted whitespace only, operators stay glued), dequoted;
 *   view: the command text for regex detection -- structure (whitespace, operators, newlines) kept as
 *     written, every quoted or escaped part replaced by its dequoted content (`pu"sh"` reads `push`), except
 *     a part that holds structural characters, which is blanked to `''` exactly like `stripQuotedSegments`
 *     blanks quoted prose, so `echo "git push"` is not a push;
 *   unterminated: an unclosed quote or a trailing lone backslash -- the text cannot be parsed with certainty;
 *   escapedQuoteOutsideQuotes: a backslash-escaped quote outside every quote, the shape that used to fake a span.
 * `pathBackslash` selects the other reading of an unquoted backslash before an ordinary character: a Windows
 * path separator (`C:\Git\bin\git.exe`) kept literally instead of a POSIX escape.
 */
function scanShell(cmd, pathBackslash = false) {
  const words = [];
  let view = "";
  let word = "";
  let sawAny = false;
  let unterminated = false;
  let escapedQuoteOutsideQuotes = false;

  const endWord = () => {
    if (!sawAny) return;
    words.push(word);
    // A word made only of empty quotes (`''`) adds nothing to the view yet still occupies an argument slot.
    if (word === "") view += '""';
    word = "";
    sawAny = false;
  };

  let i = 0;
  while (i < cmd.length) {
    const ch = cmd[i];
    if (/\s/u.test(ch)) {
      endWord();
      view += ch;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      const next = cmd[i + 1];
      if (next === undefined) {
        // A trailing lone backslash escapes nothing: the command is incomplete.
        word += ch;
        view += ch;
        sawAny = true;
        unterminated = true;
        i += 1;
        continue;
      }
      i += 2;
      if (next === "\n") continue; // line continuation: the shell drops both characters and the word goes on
      if (next === "'" || next === '"') escapedQuoteOutsideQuotes = true;
      sawAny = true;
      if (SHELL_STRUCTURAL_RE.test(next)) {
        word += next;
        view += `\\${next}`;
      } else if (pathBackslash) {
        word += `\\${next}`;
        view += `\\${next}`;
      } else {
        word += next;
        view += next;
      }
      continue;
    }
    let span = null;
    if (ch === "$" && cmd[i + 1] === "'") span = readAnsiCQuoted(cmd, i + 1);
    else if (ch === "'") span = readSingleQuoted(cmd, i);
    else if (ch === '"') span = readDoubleQuoted(cmd, i);
    if (span !== null) {
      sawAny = true;
      word += span.content;
      if (span.end === -1) {
        unterminated = true;
        view += cmd.slice(i);
        i = cmd.length;
      } else {
        view += SHELL_STRUCTURAL_RE.test(span.content) ? "''" : span.content;
        i = span.end + 1;
      }
      continue;
    }
    word += ch;
    view += ch;
    sawAny = true;
    i += 1;
  }
  endWord();
  return { words, view, unterminated, escapedQuoteOutsideQuotes };
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
// A single global-option VALUE token: ordinarily a run of non-whitespace characters
// (`\S+`), but a backslash immediately followed by whitespace is now consumed as part
// of the SAME token instead of ending it -- in an unquoted shell argument `\ ` is an
// escaped space (still one shell word, exactly like the quoted equivalent `' '`), and
// treating the bare `\S+` as a hard stop let a value such as `-c
// core.sshCommand=ssh\ -i\ /path\ -o\ IdentitiesOnly=yes` fracture into an accepted
// prefix plus an unrecognized leftover, which is how that exact form previously
// escaped push classification (NVA-PUSHCLASS-1). String.raw so the intended
// backslash count is what is actually typed, not derived by counting escapes.
const GIT_OPT_VALUE_TOKEN = String.raw`(?:\\\s|\S)+`;
const GIT_GLOBAL_OPT_ALT =
  `(?:${GIT_GLOBAL_OPT_SPACE_ARG})(?![\\w-])\\s+${GIT_OPT_VALUE_TOKEN}` +
  `|(?:${GIT_GLOBAL_OPT_EQ_OR_SPACE_ARG})(?:=${GIT_OPT_VALUE_TOKEN}|\\s+${GIT_OPT_VALUE_TOKEN})` +
  `|(?:${GIT_GLOBAL_OPT_EQ_ONLY_ARG})(?![\\w-])(?:=${GIT_OPT_VALUE_TOKEN})?` +
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
 * Decode one escape after a backslash in Bash's ANSI-C `$'...'` string form.
 *
 * The command-time Git policy and the lifecycle grammar must observe the same
 * argv that Bash passes to Git. Keep the decoder here, as the dependency-free
 * owner of the Git argv representation, rather than letting either caller
 * implement a subtly different escape dialect.
 */
export function decodeBashAnsiCEscape(source, index) {
  const next = source[index + 1];
  const simple = Object.freeze({
    a: "\u0007", b: "\b", e: "\u001b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v",
    "\\": "\\", "'": "'", '"': '"', "?": "?",
  });
  if (next === undefined) return { value: "\\", end: index };
  if (Object.hasOwn(simple, next)) return { value: simple[next], end: index + 1 };
  if (/[0-7]/u.test(next)) {
    let digits = next;
    let end = index + 1;
    while (digits.length < 3 && /[0-7]/u.test(source[end + 1] ?? "")) {
      end += 1;
      digits += source[end];
    }
    return { value: String.fromCodePoint(Number.parseInt(digits, 8)), end };
  }
  const hexLength = next === "u" ? 4 : next === "U" ? 8 : next === "x" ? 2 : 0;
  if (hexLength > 0) {
    const digits = source.slice(index + 2, index + 2 + hexLength);
    if (digits.length === hexLength && /^[0-9a-f]+$/iu.test(digits)) {
      const codePoint = Number.parseInt(digits, 16);
      if (codePoint <= 0x10ffff) return { value: String.fromCodePoint(codePoint), end: index + 1 + hexLength };
    }
  }
  return { value: `\\${next}`, end: index + 1 };
}

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
 * `abc`). Since GPGL-5 the tokenizer follows POSIX quoting (`scanShell`): outside quotes a
 * backslash escapes the next character (`p\ush` -> `push`; a backslash-newline pair is
 * removed); inside double quotes it escapes only `"`, `\`, `$`, a backtick and a newline;
 * inside single quotes nothing is escaped; `$'...'` decodes ANSI-C escapes.
 *
 * Tokenizes ONE command segment -- it does NOT split on `&&`/`;`/`|`; the caller
 * (guard-push.mjs's deploy branch) isolates the push segment first. NO new regex is
 * layered on top of this by the guard for extraction purposes -- see that file's own
 * header for how segment isolation and refspec/option identification build on the
 * plain token list this function returns.
 */
export function tokenizeArgv(cmd) {
  return scanShell(cmd).words;
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

// A `git`/`git.exe` word anywhere in the text: an unparseable quoting state only matters for a command that
// can carry a git invocation at all.
const GIT_WORD_RE = /\bgit(?:\.exe)?\b/iu;

// A `git`/`git.exe` word at a position an executable can occupy (see the boundary rule of
// GIT_EXECUTABLE_THEN_OPTION_RE below), without requiring a following option.
const GIT_WORD_AT_EXECUTABLE_BOUNDARY_RE = /(?:^|[\s;&|(`'"/\\])git(?:\.exe)?\b/iu;

// A quoted executable name: a quote, an optional path ending in a separator, `git`/`git.exe`,
// then a quote (`"git"`, `'git.exe'`, `"/usr/bin/git"`, `"C:\Git Tools\cmd\git.exe"`).
const QUOTED_GIT_WORD_RE = /["'](?:[^"']*[/\\])?git(?:\.exe)?["']/iu;
// A tokenizeArgv token that IS a git executable: the whole token, or its tail after a path
// separator or a shell operator that was glued to it (`x;"git"` unwraps to `x;git`).
const GIT_EXECUTABLE_TOKEN_RE = /(?:^|[;&|(`/\\])git(?:\.exe)?$/iu;
// A tokenizeArgv token that IS the push word, allowing shell operators glued to it
// (`push;`, `&&push`) but not a longer word (`push.txt`, `--no-push`) or a message token.
const PUSH_WORD_TOKEN_RE = /(?:^|[;&|(`])push(?:$|[;&|)`])/iu;

/**
 * hasQuotedGitWordBeforePushWord(cmd) -- true when `cmd` names git as a QUOTED executable
 * (`"git"`, `'git.exe'`, a quoted path ending in git) and a push word follows it later
 * (GPGL-3). `stripQuotedSegments` blanks `"git"` to `""`, so neither the whole-string
 * branch nor the global-option collapse ever sees the executable; the positional branch
 * only recognises `push` or `-C <dir> push` directly after it, so `"git" --unknown-opt push`
 * and `"git" -c a=b push` evade classification. Fail closed on the quoted-executable shape
 * instead of guessing what sits between the executable and the push word.
 */
function hasQuotedGitWordBeforePushWord(cmd, tokens) {
  if (!QUOTED_GIT_WORD_RE.test(cmd)) return false;
  const gitIndex = tokens.findIndex((token) => GIT_EXECUTABLE_TOKEN_RE.test(token));
  return gitIndex !== -1 && tokens.slice(gitIndex + 1).some((token) => PUSH_WORD_TOKEN_RE.test(token));
}

// Fail-closed check #2's pattern (GPGL-2): `git`/`git.exe` followed by whitespace and a
// `-`-prefixed token, where the `git` word only counts at a position an executable can
// occupy -- start of the command, or directly after whitespace, a shell operator (`;`,
// `&`, `|`, `(` which also covers `$(`, or a backtick), a quote, or a path separator
// (`/`, `\`). A bare `\b` boundary is not enough: it also holds between `-` and `g`, so
// the `git` inside `--no-git` (or `.git`, `=git`, `xgit`) read as an executable and a
// `gitleaks detect --no-git --redact` call was routed to the push gate as ambiguous.
const GIT_EXECUTABLE_THEN_OPTION_RE = /(?:^|[\s;&|(`'"/\\])git(?:\.exe)?\b\s+-\S/iu;

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
 * Fail-closed on uncertainty (NVA-PUSHCLASS-1, GPGL-3), checked BEFORE the three branches
 * and independently of them: at every call site this function has (codex-pretool-guard.mjs's
 * prefilter deciding whether guard-push.mjs runs at all; guard-push.mjs's own `if
 * (!isPush) process.exit(0)` fast path), returning `false` and returning "I cannot tell"
 * currently have the EXACT SAME effect -- the push gate never runs. For an ordinary
 * function that is a reasonable simplification; for a gate's own classifier it is the
 * wrong default, because it silently converts "unrecognized" into "definitely safe". So
 * this function now over-approximates on purpose in four situations, at the cost of
 * occasionally routing a genuinely non-push command to guard-push.mjs for nothing:
 * guard-push.mjs does the real evaluation once it actually runs, and a spurious run costs
 * nothing a missed push does not.
 *   1. An unresolvable quoting state anywhere in a command that mentions `git`/`git.exe`
 *      at all (an unterminated `'` or `"`) -- `stripQuotedSegments` and `tokenizeArgv`
 *      both assume balanced quoting, so downstream token boundaries cannot be trusted.
 *   2. A `git`/`git.exe` occurrence still immediately followed (after every RECOGNIZED
 *      global option has already been collapsed away by `normalizeGlobalGitOptions`) by a
 *      token that starts with `-` -- that token names a global option this file's
 *      whitelist does not know, so its value-consuming shape (does it take a value at
 *      all? space-separated or `=`-only? can the value contain more `-`-prefixed text?)
 *      is unknown, and the real subcommand position cannot be located with certainty.
 *      The `git` word only counts where an executable can stand (GPGL-2): at the start of
 *      the command, or preceded by whitespace, a shell operator (`;` `&` `|` `(` -- which
 *      also covers `$(` -- or a backtick), a quote, or a path separator (`/` `\`). A `git`
 *      preceded by `-`, `=`, `.` or a word character is part of an option or a longer
 *      word (`--no-git`, `--exclude=git`, `xgit`), never an executable, so a tool that
 *      merely carries such text (`gitleaks detect --no-git --redact`) is not routed to the
 *      push gate. A whitespace-separated literal `git` ARGUMENT (`gitleaks git --redact`)
 *      is deliberately still indistinguishable from the executable and stays refused:
 *      fail-closed, accepted.
 *   3. A backslash-escaped quote (`\'` or `\"`) OUTSIDE every quote, together with a
 *      `git`/`git.exe` word at an executable boundary (the same boundary rule as check #2,
 *      no option required) -- and NO push-word requirement (GPGL-3). GPGL-4 narrowed this
 *      with a raw-text push-word conjunct; GPGL-5 removed it again because a push word split
 *      by interior quotes (`pu"sh"`) never appears as that token in raw text (Critic finding
 *      F1: `echo \'; git pu"sh" origin main; echo \'`). A shell treats an escaped quote as a
 *      literal character, so text between two of them is executed. The scanner now follows
 *      that, and this check stays as a backstop that does not depend on the scanner being
 *      right about everything after the escape. An escaped quote INSIDE a double-quoted span
 *      or an ANSI-C `$'...'` string is parsed by the scanner and is not a trigger, which keeps
 *      `git commit -m "say \"hi\""` and `git log --grep "a \"push\" word"` out of the push gate.
 *      Detection itself (the three branches and checks #2/#4) runs on the DEQUOTED words and
 *      view, never on raw text: `git pu"sh"`, `g"it" push` and `git p\ush` all read `git push`.
 *      An unquoted backslash is read both as a POSIX escape and as a Windows path separator;
 *      either reading classifying as a push is enough. An unterminated quote or a trailing lone
 *      backslash fails closed under #1 as well. PowerShell quoting (backtick escapes, doubled
 *      quotes) follows neither reading and is NOT covered.
 *   4. A QUOTED git executable name (`"git"`, `'git.exe'`, a quoted path ending in git)
 *      with a push word later in the command (GPGL-3). Quote-stripping blanks `"git"`, so
 *      neither the whole-string branch nor the global-option collapse ever sees the
 *      executable, and the positional branch only knows `push` / `-C <dir> push` directly
 *      after it -- `"git" --unknown-opt push` and `"git" -c a=b push` evaded all three.
 *
 * Returns `true` if any fail-closed check fires, or if ANY of the three branches
 * match.
 */
export function commandIsGitPush(cmd) {
  if (typeof cmd !== "string" || cmd === "") return false;
  // An unquoted backslash has two readings: a POSIX escape (`p\ush` is `push`) and a Windows path
  // separator (`C:\Git\bin\git.exe push`). Which one a runner's shell applies is not known here, so
  // classify under both and fail closed when either reading is a push (GPGL-5).
  return classifyPush(cmd, false) || classifyPush(cmd, true);
}

/** One reading of `cmd` (see `scanShell` for `pathBackslash`); detection runs on the dequoted view and words. */
function classifyPush(cmd, pathBackslash) {
  const scan = scanShell(cmd, pathBackslash);
  const view = scan.view;
  // Fail-closed checks #1 and #3 (NVA-PUSHCLASS-1, GPGL-3, GPGL-5) and #4 (GPGL-3), independent of the branches below.
  if (scan.unterminated && (GIT_WORD_RE.test(cmd) || GIT_WORD_RE.test(view))) return true;
  if (
    scan.escapedQuoteOutsideQuotes &&
    (GIT_WORD_AT_EXECUTABLE_BOUNDARY_RE.test(cmd) || GIT_WORD_AT_EXECUTABLE_BOUNDARY_RE.test(view))
  ) return true;
  if (hasQuotedGitWordBeforePushWord(cmd, scan.words)) return true;
  const normalized = normalizeGlobalGitOptions(view.toLowerCase());
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
  // Fail-closed check #2 (see this function's own header): every RECOGNIZED global
  // option has already been collapsed away by normalizeGlobalGitOptions above, so a
  // `git`/`git.exe` still immediately followed by a `-`-prefixed token here names an
  // option this file does not know how to consume. Do not guess "not a push".
  if (GIT_EXECUTABLE_THEN_OPTION_RE.test(commandRegion)) return true;
  const rawDetectionTokens = scan.words;
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
  const executableToken = (detectionTokens[0] ?? "").split(/[\/\\]/).pop();
  const directExecutable = /^(?:git|git\.exe)$/i.test(executableToken);
  const directPush =
    directExecutable &&
    (detectionTokens[1]?.toLowerCase() === "push" ||
      (detectionTokens[1] === "-C" && detectionTokens[2] && detectionTokens[3]?.toLowerCase() === "push"));
  const shellWrapperPush = /^(?:(?:ba|z|da)?sh|pwsh|powershell|cmd|ssh)(?:\.exe)?$/i.test(executableToken) &&
    detectionTokens.some((token) => /\bgit(?:\.exe)?(?:\s+-C\s+\S+)?\s+push\b/i.test(token));
  return /\bgit\s+push\b/.test(commandRegion) || directPush || shellWrapperPush;
}
