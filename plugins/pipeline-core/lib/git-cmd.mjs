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
 *
 * The push classifier `commandIsGitPush` below implements PO decisions B (the Q12 option-B fail-closed marker rule),
 * J (a backslash inside a path token is no marker), S (an escaped quote and a brace-expanded git word are candidates)
 * and X (a here-document is a marker only when a shell or interpreter receives it), see
 * specs/sprint-alfred-epic/plans/po-decisions-2026-10-06.md row Q12 and po-decisions-2026-10-07.md rows J, S and X.
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
 * The PowerShell reading does not use this function: it reads every span through `readPowerShellQuoted`.
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
 * scanShell(cmd, reading) -- one shell pass over `cmd` that returns what the classifier needs:
 *   words: the argv-style words (split on unquoted whitespace only, operators stay glued), dequoted;
 *   view: the command text for regex detection -- structure (whitespace, operators, newlines) kept as
 *     written, every quoted or escaped part replaced by its dequoted content (`pu"sh"` reads `push`), except
 *     a part that holds structural characters, which is blanked to `''` exactly like `stripQuotedSegments`
 *     blanks quoted prose, so `echo "git push"` is not a push;
 *   unterminated: an unclosed quote or a trailing lone backslash -- the text cannot be parsed with certainty;
 *   escapedQuoteOutsideQuotes: a backslash-escaped quote outside every quote, the shape that used to fake a span;
 *   regions: the comments and here-document bodies found, as `{ kind, start, end }` raw index ranges of the text.
 * Comments and here-document bodies (Q12-F7): a `#` that starts a word (start of the text, after whitespace or after an
 * unquoted `;` `&` `|` `(` `)`) opens a comment that runs to the end of its line; it adds nothing to `words` or `view`, so a
 * quote character in it opens no quote and the git word it may spell is no command. The lines after a `<<` / `<<-` opener up
 * to a line that is exactly its delimiter (`<<-`: after leading tabs) are the body: they are scanned as a text of their own,
 * so a quote that never closes inside the body (`don't`) ends with it and hides nothing after the terminator; a body is kept in
 * `words` and `view` as before, quoting balanced inside it still being read. An opener with no terminator line opens no body
 * (the arithmetic shift `1 << 2` is not a here-document). Not modelled: `<#` `#>` PowerShell block comments.
 * `reading` picks how a backslash is read (three readings, GPGL-7):
 *   READING_POSIX (default): an unquoted backslash escapes the next character; inside double quotes it escapes
 *     only `"`, `\`, `$`, a backtick and a newline.
 *   READING_WINDOWS_PATH: as POSIX, except an unquoted backslash before an ORDINARY character is a Windows path
 *     separator (`C:\Git\bin\git.exe`) kept literally; before a structural character it still escapes.
 *   READING_POWERSHELL: a backslash is ALWAYS an ordinary character -- unquoted and inside double quotes alike
 *     (PowerShell escapes with the backtick, not the backslash), so `\<space>` ends the word and `\"` closes a
 *     double-quoted span. `$'` is not ANSI-C quoting there: the `$` is literal and `'` opens a plain single-quoted
 *     span. Typographic quotes are string delimiters there (GPGL-8): any of the double class (U+0022, U+201C,
 *     U+201D, U+201E) opens a span that any other of that class closes, likewise for the single class (U+0027,
 *     U+2018, U+2019, U+201A, U+201B); the two classes never close each other. The detection view renders its
 *     backslash as `/` (a path separator, accepted at every boundary the classifier tests) so the option-value
 *     token of `normalizeGlobalGitOptions`, which reads `\<space>` as ONE escaped space, cannot swallow the push
 *     word that follows a drive path ending in a backslash. Not modelled (see `commandIsGitPush`): the backtick
 *     escape inside double quotes, here-strings.
 */
const READING_POSIX = "posix";
const READING_WINDOWS_PATH = "windows-path";
const READING_POWERSHELL = "powershell";

// The typographic quote characters PowerShell accepts as string delimiters, written as escapes so this file
// stays ASCII (GPGL-8). Each class contains its ASCII member.
const POWERSHELL_DOUBLE_QUOTES = new Set(['"', "“", "”", "„"]);
const POWERSHELL_SINGLE_QUOTES = new Set(["'", "‘", "’", "‚", "‛"]);

/** A PowerShell span whose opening quote is at `open`: it ends at the next character of the same quote class. */
function readPowerShellQuoted(cmd, open, closers) {
  for (let i = open + 1; i < cmd.length; i += 1) {
    if (closers.has(cmd[i])) return { end: i, content: cmd.slice(open + 1, i) };
  }
  return { end: -1, content: cmd.slice(open + 1) };
}

// `keepQuotedPaths` (decision X, receiver detection only): a quoted part that holds structural characters is not blanked
// to `''` but kept with every structural character except the backslash replaced by `_`, so a quoted path that names a
// shell (`"/c/Program Files/git/bin/bash"`) stays ONE word whose basename can be read. The default view is unchanged.
const RECEIVER_SPAN_BLANK_RE = /[\s;&|()<>`$"']/gu;

/**
 * The delimiter word of a here-document opener, quotes and escapes removed (`<<'EOF'`, `<<E"O"F` and `<<\EOF` all name
 * `EOF`); `from` is the index just after `<<` or `<<-`. Null when no usable word follows.
 */
function readHeredocDelimiter(cmd, from) {
  let i = from;
  while (cmd[i] === " " || cmd[i] === "\t") i += 1;
  let delimiter = "";
  while (i < cmd.length && !/[\s;&|<>()]/u.test(cmd[i])) {
    const ch = cmd[i];
    if (ch === "\\") {
      if (i + 1 >= cmd.length) return null;
      if (cmd[i + 1] !== "\n") delimiter += cmd[i + 1];
      i += 2;
      continue;
    }
    const open = ch === "$" && cmd[i + 1] === "'" ? i + 1 : i;
    if (cmd[open] === "'" || cmd[open] === '"') {
      const end = cmd.indexOf(cmd[open], open + 1);
      if (end === -1) return null;
      delimiter += cmd.slice(open + 1, end);
      i = end + 1;
      continue;
    }
    delimiter += ch;
    i += 1;
  }
  return delimiter === "" ? null : delimiter;
}

/**
 * The index where the here-document body that starts at `from` ends: the end of its terminator line, the newline after it
 * excluded. The terminator is a line that is exactly the delimiter (`<<-` strips leading tabs first). -1 when no terminator
 * line exists: the text is then not a here-document (the arithmetic shift `1 << 2` is no opener), see `classifyPush`.
 */
function findHeredocBodyEnd(cmd, from, heredoc) {
  let lineStart = from;
  while (lineStart <= cmd.length) {
    const newline = cmd.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? cmd.length : newline;
    const line = cmd.slice(lineStart, lineEnd);
    if ((heredoc.strip ? line.replace(/^\t+/u, "") : line) === heredoc.delimiter) return lineEnd;
    if (newline === -1) return -1;
    lineStart = newline + 1;
  }
  return -1;
}

function scanShell(cmd, reading = READING_POSIX, keepQuotedPaths = false) {
  const pathBackslash = reading === READING_WINDOWS_PATH;
  const powershell = reading === READING_POWERSHELL;
  const words = [];
  const regions = [];
  const pendingHeredocs = [];
  let view = "";
  let word = "";
  let sawAny = false;
  let unterminated = false;
  let escapedQuoteOutsideQuotes = false;
  // True while the next character would START a word: at the start of the text, after whitespace and after an unquoted
  // `;` `&` `|` `(` `)`. A `#` there opens a comment; anywhere else (`a#b`, `$#`, `${#x}`, a quoted or escaped `#`) it is
  // an ordinary character.
  let atWordStart = true;

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
      atWordStart = true;
      if (ch === "\n" && pendingHeredocs.length > 0) {
        // The body of the next here-document opened on the line that just ended. Its quote characters have no quoting
        // function for the text around it, so it is scanned as a text of its own: a quote that never closes inside the
        // body ends with the body instead of swallowing the lines after the terminator.
        const bodyEnd = findHeredocBodyEnd(cmd, i, pendingHeredocs.shift());
        if (bodyEnd === -1) pendingHeredocs.length = 0;
        else {
          regions.push({ kind: "heredoc-body", start: i, end: bodyEnd });
          const body = scanShell(cmd.slice(i, bodyEnd), reading, keepQuotedPaths);
          for (const bodyWord of body.words) words.push(bodyWord);
          view += body.view;
          if (body.escapedQuoteOutsideQuotes) escapedQuoteOutsideQuotes = true;
          i = bodyEnd;
        }
      }
      continue;
    }
    if (ch === "#" && atWordStart) {
      // A comment runs to the end of its line and is neither a word nor part of the view: the quote characters in it
      // open no quote, and what it says is not a command. The newline that ends it is read as usual.
      let end = cmd.indexOf("\n", i);
      if (end === -1) end = cmd.length;
      regions.push({ kind: "comment", start: i, end });
      i = end;
      continue;
    }
    if (ch === "\\" && powershell) {
      // PowerShell: an ordinary character. The next character is NOT consumed -- a space ends the word, a quote
      // opens a span, `;` separates commands. The view shows `/` (see `scanShell`'s header for why).
      word += ch;
      view += "/";
      sawAny = true;
      atWordStart = false;
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
        atWordStart = false;
        unterminated = true;
        i += 1;
        continue;
      }
      i += 2;
      if (next === "\n") continue; // line continuation: the shell drops both characters and the word goes on
      if (next === "'" || next === '"') escapedQuoteOutsideQuotes = true;
      sawAny = true;
      atWordStart = false;
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
    if (powershell && POWERSHELL_DOUBLE_QUOTES.has(ch)) span = readPowerShellQuoted(cmd, i, POWERSHELL_DOUBLE_QUOTES);
    else if (powershell && POWERSHELL_SINGLE_QUOTES.has(ch)) span = readPowerShellQuoted(cmd, i, POWERSHELL_SINGLE_QUOTES);
    else if (ch === "$" && cmd[i + 1] === "'" && !powershell) span = readAnsiCQuoted(cmd, i + 1);
    else if (ch === "'") span = readSingleQuoted(cmd, i);
    else if (ch === '"') span = readDoubleQuoted(cmd, i);
    if (span !== null) {
      sawAny = true;
      atWordStart = false;
      word += span.content;
      if (span.end === -1) {
        unterminated = true;
        view += cmd.slice(i);
        i = cmd.length;
      } else {
        if (!SHELL_STRUCTURAL_RE.test(span.content)) view += span.content;
        else view += keepQuotedPaths ? span.content.replace(RECEIVER_SPAN_BLANK_RE, "_") : "''";
        i = span.end + 1;
      }
      continue;
    }
    if (ch === "<" && cmd[i + 1] === "<") {
      // `<<` opens a here-document (`<<<` is a here-string and opens none). Its delimiter is read here only to find the body
      // at the next newline; the delimiter word itself is scanned as usual below.
      const hereString = cmd[i + 2] === "<";
      if (!hereString) {
        const strip = cmd[i + 2] === "-";
        const delimiter = readHeredocDelimiter(cmd, i + (strip ? 3 : 2));
        if (delimiter !== null) pendingHeredocs.push({ delimiter, strip });
      }
      const operator = hereString ? "<<<" : "<<";
      word += operator;
      view += operator;
      sawAny = true;
      atWordStart = false;
      i += operator.length;
      continue;
    }
    word += ch;
    view += ch;
    sawAny = true;
    atWordStart = ch === ";" || ch === "&" || ch === "|" || ch === "(" || ch === ")";
    i += 1;
  }
  endWord();
  return { words, view, unterminated, escapedQuoteOutsideQuotes, regions };
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
 * `abc`). Since GPGL-5 the tokenizer follows POSIX QUOTING (`scanShell`): inside double
 * quotes a backslash escapes only `"`, `\`, `$`, a backtick and a newline; inside single
 * quotes nothing is escaped; `$'...'` decodes ANSI-C escapes; a backslash-newline pair is
 * removed.
 *
 * ONE deliberate exception (GPGL-6): an UNQUOTED backslash before an ordinary character is
 * kept LITERALLY, the Windows-path-separator reading of `scanShell` (`READING_WINDOWS_PATH`), so
 * `git -C C:\Users\x\repo push origin main` yields the path `C:\Users\x\repo` and `p\ush`
 * stays `p\ush`. guard-push parses push targets and refspecs from this function's tokens
 * on native Windows, where those backslashes are separators; the POSIX reading (GPGL-5)
 * ate them and every push from a Windows path was refused as "not unambiguous". This is the
 * EXTRACTION view only. `commandIsGitPush` classifies under BOTH readings on its own, so
 * `git p\ush origin main` still fails closed as a push and an escaped-quote attack string
 * is still routed to the gate -- the classifier never depends on what this function does
 * with an unquoted backslash. An unquoted backslash before a structural character (a space,
 * a quote, another backslash, an operator) still escapes it in both readings.
 *
 * Tokenizes ONE command segment -- it does NOT split on `&&`/`;`/`|`; the caller
 * (guard-push.mjs's deploy branch) isolates the push segment first. NO new regex is
 * layered on top of this by the guard for extraction purposes -- see that file's own
 * header for how segment isolation and refspec/option identification build on the
 * plain token list this function returns.
 */
export function tokenizeArgv(cmd) {
  return scanShell(cmd, READING_WINDOWS_PATH).words;
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
// GIT_EXECUTABLE_THEN_OPTION_RE below), without requiring a following option. This is the "git word" of the
// fail-closed marker rule (`commandIsGitPush`): start of text, whitespace, `;` `&` `|` `(`, a backtick, a quote, a
// path separator, and -- because bash brace expansion can spell the git word (PO decision S: `{git,push}`) -- `{`
// and `,`.
const GIT_WORD_AT_EXECUTABLE_BOUNDARY_RE = /(?:^|[\s;&|(`'"/\\{,])git(?:\.exe)?\b/iu;

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

// ---- the fail-closed marker rule (PO decision Q12 option B, narrowed by decisions J and X, extended by S) ---------
//
// Why a rule on markers and not a model of what the shell will run: every shape-specific check this file used to
// carry (a `$(` here, a quoted substitution there, an escaped terminator, a brace list) was a deny-list entry for one
// way a shell can spell the push word, and the list never converged -- each Critic round found the next spelling.
// The marker rule inverts it: a text is plain until proven otherwise.

// Marker characters. `$` (every expansion form, PowerShell variables, `$"..."` locale quoting), a backtick
// (substitution, the PowerShell escape), `{` (parameter and brace expansion) and `(` `)` (substitution, subshell,
// PowerShell grouping) each let a shell spell the push word at run time. A non-ASCII quote character (U+2018 to
// U+201F) is a string delimiter to PowerShell and an ordinary character to every other reading, so what it encloses
// cannot be located with certainty. Written as escapes so this file stays ASCII. `<<` (here-document, `<<-`, the
// `<<<` here-string) is NOT in this list: since decision X it is a marker only when a shell or interpreter receives
// it (`hasShellHeredocReceiver`).
const FAIL_CLOSED_MARKER_RE = /[$`{()]|[\u2018-\u201F]/u;

// A nested shell invocation: the quoted string after the flag is a whole second command line that this file's view
// blanks as quoted prose (`bash -c 'git --no-pager push'`). `bash|sh|dash|zsh|ksh|csh|tcsh|fish|ash` with a `-c`
// flag word (`-c`, `-lc`, `-ic`), `cmd`/`cmd.exe` with `/c` or `/k`, `pwsh|powershell` with `-c`/`-Command`. Up to eight
// words, none of them a command separator, may sit between the shell word and the flag. `ssh` is not a shell word here
// (it is routed by the wrapper branch of `classifyPush`).
const NESTED_POSIX_SHELL_RE =
  /(?:^|[\s;&|(`'"/\\])(?:ba|z|da|k|c|fi|tc|a)?sh(?:\.exe)?(?:\s+[^\s;&|]+){0,8}?\s+-[A-Za-z]*c[A-Za-z]*(?![\w-])/iu;
const NESTED_WINDOWS_SHELL_RE =
  /(?:^|[\s;&|(`'"/\\])(?:cmd(?:\.exe)?(?:\s+[^\s;&|]+){0,8}?\s+\/[ck]|(?:pwsh|powershell)(?:\.exe)?(?:\s+[^\s;&|]+){0,8}?\s+-c[A-Za-z]*)(?![\w-])/iu;

// Decision J: a backslash is NOT a marker when it only occurs inside a path token, where it separates path segments and
// has no quoting or escape function. A path token is a WHOLE word (preceded by whitespace or the start of the text,
// followed by whitespace, `;` `&` `|` or the end), and only made of segment characters, so nothing that could act as an
// escape or a quote hides inside it:
//   - a drive path `X:\seg\seg`, unquoted, single-quoted or double-quoted (a quoted one may hold spaces);
//   - a relative path `seg\seg\seg`, unquoted, single-quoted or double-quoted;
//   - a drive path ending in a backslash: unquoted when whitespace or the end follows (`-C C:\repo\ status`), single-quoted
//     always (`'C:\repo\'`), double-quoted only when the closing quote is the last non-blank text of the command (`"C:\repo\"`
//     -- a shell may read that `\"` as an escaped quote, which is harmless only when nothing follows it; the tolerance of
//     `readDoubleQuoted`).
// Anything else with a backslash -- an escaped letter in a word (`pu\sh`), a backslash next to a quote, a doubled backslash,
// a backslash before a newline, a path glued to a quote or an operator -- stays a marker. A path-shaped word such as `pu\sh`
// is exempt from the MARKER, not from detection: the unmarked classification below reads it under all three readings and
// still sees `push`. Decision S: a backslash adjacent to a quote inside a double-quoted span that is not a path token
// (`"say \"hi\""`) is a marker, an accepted false positive; write commit messages with single quotes.
const PATH_SEGMENT = String.raw`[A-Za-z0-9_.@+~-]+`;
const PATH_SEGMENT_QUOTED = String.raw`[A-Za-z0-9_.@+~ -]+`;
const DRIVE_ROOT = String.raw`[A-Za-z]:\\`;
const PATH_TOKEN_END = String.raw`(?=[\s;&|]|$)`;
const PATH_TOKEN_RE = new RegExp(
  [
    // unquoted drive path, last character a path character
    String.raw`(?<!\S)${DRIVE_ROOT}(?:${PATH_SEGMENT}\\)*${PATH_SEGMENT}${PATH_TOKEN_END}`,
    // unquoted drive path ending in a backslash, a space or tab (or the end) after it
    String.raw`(?<!\S)${DRIVE_ROOT}(?:${PATH_SEGMENT}\\)*(?=[ \t]|$)`,
    // unquoted relative path
    String.raw`(?<!\S)${PATH_SEGMENT}(?:\\${PATH_SEGMENT})+${PATH_TOKEN_END}`,
    // single-quoted drive path (a trailing backslash is literal in every shell) or relative path
    String.raw`(?<!\S)'(?:${DRIVE_ROOT}(?:${PATH_SEGMENT_QUOTED}\\)*(?:${PATH_SEGMENT_QUOTED})?|${PATH_SEGMENT_QUOTED}(?:\\${PATH_SEGMENT_QUOTED})+)'${PATH_TOKEN_END}`,
    // double-quoted drive path or relative path, last character a path character
    String.raw`(?<!\S)"(?:${DRIVE_ROOT}(?:${PATH_SEGMENT_QUOTED}\\)*${PATH_SEGMENT_QUOTED}|${PATH_SEGMENT_QUOTED}(?:\\${PATH_SEGMENT_QUOTED})+)"${PATH_TOKEN_END}`,
    // double-quoted drive path ending in a backslash, the closing quote the last non-blank text of the command
    String.raw`(?<!\S)"${DRIVE_ROOT}(?:${PATH_SEGMENT_QUOTED}\\)*"(?=\s*$)`,
  ].join("|"),
  "gu",
);

/** True when `cmd` still holds a backslash after every path token (decision J) is taken out of it. */
function hasBackslashOutsidePathTokens(cmd) {
  return cmd.includes("\\") && cmd.replace(PATH_TOKEN_RE, " ").includes("\\");
}

// ---- brace expansion (PO decision S: a git word formed by brace expansion counts) ----------------------------------
// Bash expands an unquoted `{a,b}` list or `{x..y}` sequence before every other expansion, so `{git,push}` and `g{i..i}t`
// spell the git word without it ever appearing as a token. Only what the git-word test needs is modelled: comma lists
// (nested ones too) and single-character `{a..z}` sequences. A word that would expand to more than
// BRACE_EXPANSION_CAP alternatives, or that is longer than BRACE_WORD_MAX_LENGTH, is treated as if it spelled the git
// word: the safe direction.
const BRACE_EXPANSION_CAP = 256;
const BRACE_WORD_MAX_LENGTH = 4096;

/** The characters of a single-character range such as `a..e`, ascending or descending. */
function singleCharacterRange(from, to) {
  const first = from.codePointAt(0);
  const last = to.codePointAt(0);
  const step = first <= last ? 1 : -1;
  const characters = [];
  for (let code = first; ; code += step) {
    characters.push(String.fromCodePoint(code));
    if (code === last) return characters;
  }
}

/** The first expandable brace group of `text` (a comma list or a single-character range), or null. */
function findBraceGroup(text) {
  for (let open = text.indexOf("{"); open !== -1; open = text.indexOf("{", open + 1)) {
    let depth = 0;
    let close = -1;
    const commas = [];
    for (let i = open; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      } else if (ch === "," && depth === 1) commas.push(i);
    }
    if (close === -1) continue;
    let alternatives = null;
    if (commas.length > 0) {
      alternatives = [];
      let from = open + 1;
      for (const comma of commas) {
        alternatives.push(text.slice(from, comma));
        from = comma + 1;
      }
      alternatives.push(text.slice(from, close));
    } else {
      const range = /^([A-Za-z0-9])\.\.([A-Za-z0-9])$/u.exec(text.slice(open + 1, close));
      if (range !== null) alternatives = singleCharacterRange(range[1], range[2]);
    }
    if (alternatives !== null) return { open, close, alternatives };
  }
  return null;
}

/** Every brace expansion of one word, or null when there would be more than BRACE_EXPANSION_CAP. */
function expandBraceWord(word) {
  const done = [];
  const pending = [word];
  while (pending.length > 0) {
    const text = pending.pop();
    const group = findBraceGroup(text);
    if (group === null) done.push(text);
    else {
      for (const alternative of group.alternatives) {
        pending.push(`${text.slice(0, group.open)}${alternative}${text.slice(group.close + 1)}`);
      }
    }
    if (done.length + pending.length > BRACE_EXPANSION_CAP) return null;
  }
  return done;
}

/**
 * True when `text` spells a git word, as written or once the shell has removed its quotes and escapes (F1: `g"i"t`,
 * `g''it` and `g\it` are the word `git`). The dequoted view is read under all three readings of a backslash; a quoted part
 * that holds structural characters is blanked in it, so prose such as `echo "git push"` still names no git word through it.
 */
function spellsGitWord(text) {
  if (GIT_WORD_AT_EXECUTABLE_BOUNDARY_RE.test(text)) return true;
  return [READING_POSIX, READING_WINDOWS_PATH, READING_POWERSHELL].some((reading) =>
    GIT_WORD_AT_EXECUTABLE_BOUNDARY_RE.test(scanShell(text, reading).view),
  );
}

/**
 * The words of `cmd` split at unquoted whitespace and `;` `&` `|` `(` `)` `<` `>`, each kept as WRITTEN (quotes and
 * backslashes included): bash performs brace expansion before it removes quotes, so the alternatives of a brace group
 * have to be read from the raw word. A quoted part is skipped as a whole, so `{g"i"t," -c x",push}` stays one word; an
 * unterminated quote runs to the end of the text. A comment is no word and holds no quote, and the body of a here-document is a
 * text of its own (its words are split apart from the text around it), the regions `scanShell` reports.
 */
function splitRawWords(cmd) {
  const { regions } = scanShell(cmd);
  const words = [];
  let word = "";
  let i = 0;
  let nextRegion = 0;
  while (i < cmd.length) {
    const ch = cmd[i];
    while (nextRegion < regions.length && regions[nextRegion].end <= i) nextRegion += 1;
    const region = regions[nextRegion];
    if (region !== undefined && region.start === i) {
      if (word !== "") words.push(word);
      word = "";
      if (region.kind === "heredoc-body") for (const bodyWord of splitRawWords(cmd.slice(region.start, region.end))) words.push(bodyWord);
      i = region.end;
      continue;
    }
    if (/[\s;&|()<>]/u.test(ch)) {
      if (word !== "") words.push(word);
      word = "";
      i += 1;
      continue;
    }
    let span = null;
    let open = i;
    if (ch === "\\") {
      word += cmd.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (ch === "$" && cmd[i + 1] === "'") {
      open = i + 1;
      span = readAnsiCQuoted(cmd, open);
    } else if (ch === "'") span = readSingleQuoted(cmd, i);
    else if (ch === '"') span = readDoubleQuoted(cmd, i);
    if (span === null) {
      word += ch;
      i += 1;
      continue;
    }
    const stop = span.end === -1 ? cmd.length : span.end + 1;
    word += cmd.slice(i, stop);
    i = stop;
  }
  if (word !== "") words.push(word);
  return words;
}

/**
 * True when `cmd` holds a git word: `git`/`git.exe` at an executable boundary (GIT_WORD_AT_EXECUTABLE_BOUNDARY_RE),
 * written out, spelled with quotes or escapes that the shell removes (F1), or formed by brace expansion of one word of the
 * text, where every alternative is read as written and after quote removal (F2: `{g"i"t,push}`, `{"g"it,push}`).
 */
function hasGitWord(cmd) {
  if (spellsGitWord(cmd)) return true;
  if (!cmd.includes("{")) return false;
  for (const word of splitRawWords(cmd)) {
    if (!word.includes("{")) continue;
    if (word.length > BRACE_WORD_MAX_LENGTH) return true;
    const expansions = expandBraceWord(word);
    if (expansions === null || expansions.some(spellsGitWord)) return true;
  }
  return false;
}

// ---- here-document receivers (PO decision X) ---------------------------------------------------------------------
// `<<` (a here-document, `<<-`, the `<<<` here-string) hands text to a command. When that command is a shell or
// interpreter the text is a program it runs, so the operator is a fail-closed marker; when it is anything else
// (`git commit -F - <<EOF`, `cat <<EOF > notes.txt`) the text is data and the operator marks nothing. Every other marker
// still decides on the whole text, a here-document body included (an unquoted delimiter is expanded by the shell).
//
// The receiver is read from the detection view of `scanShell` (structure kept, quoted prose blanked), under all three
// readings of a backslash. The view is cut into units at a newline, `;`, `&&`, `||` and a lone `&`, but NOT at a pipe:
// a unit is a whole pipeline, so `cat <<EOF | sh` (the body is forwarded to a shell) is a shell receiver. A unit that
// holds `<<` is a shell receiver when ANY of its words names a shell or interpreter, so the receiver is found through a
// path, a `.exe` or version suffix and a wrapper word (`/usr/bin/env bash`, `sudo python3.11`, `exec sh`); a word with a
// glob character that could expand to such a name (`/bin/ba?h`) counts as well. Two more shapes forward the text to a
// command this view cannot name and fail closed: a compound command's closer (`... done <<EOF` feeds every command in
// the loop) and the `.` builtin in command position. The price is a spurious gate run for a data here-document in a unit
// that also names such a word (`git add -- node <<EOF`) or whose body holds a `<<` line next to a shell word: the safe
// direction. Decision AF extends the list with command RUNNERS (`hasRunnerHeredocReceiver`, below): xargs, at, batch, ed,
// ex, sqlite3, php, lua and `awk -f -`. Still NOT covered, because the decisions list receivers and do not model every
// command that runs text from standard input: see the header of `commandIsGitPush`.
const HEREDOC_RECEIVER_NAMES = new Set([
  "sh", "bash", "zsh", "ksh", "dash", "ash", "fish", "csh", "tcsh",
  "node", "nodejs", "python", "py", "perl", "ruby",
  "pwsh", "powershell", "cmd", "eval", "ssh",
  "source", "exec",
]);
const HEREDOC_COMPOUND_CLOSERS = new Set(["done", "fi", "esac"]);
// Decision AF: command RUNNERS, commands that execute their standard input as commands or as a program that can run
// commands. xargs appends the words it reads to its own argv and runs the result; at and batch hand the text to a shell as a
// job script; ed and ex run `!command`; sqlite3 runs `.shell`; php and lua read a program that shells out. `luajit` is lua
// under its other name. awk is a runner only when its PROGRAM comes from standard input (`awk -f -`): see `unitHasAwkStdinProgram`.
const HEREDOC_RUNNER_NAMES = new Set(["xargs", "at", "batch", "ed", "ex", "sqlite3", "php", "lua", "luajit"]);
const HEREDOC_AWK_NAMES = new Set(["awk", "gawk", "mawk", "nawk"]);
// The program-file options of awk (`-f`, and gawk's `-E` / `--exec` / `--file`) and the words that name standard input.
const AWK_PROGRAM_FILE_OPTIONS = new Set(["-f", "-E", "--file", "--exec"]);
const STDIN_FILE_WORD_RE = /^(?:-|\/dev\/stdin|\/dev\/fd\/0|\/proc\/self\/fd\/0)$/u;
const AWK_STDIN_PROGRAM_OPTION_RE = /^(?:-[fE]|--file=|--exec=)(?:-|\/dev\/stdin|\/dev\/fd\/0|\/proc\/self\/fd\/0)$/u;
// Probes a glob word is tested against: every receiver name, its `.exe` spelling, and a versioned python.
const HEREDOC_GLOB_PROBES = [...HEREDOC_RECEIVER_NAMES, "python3"].flatMap((name) => [name, `${name}.exe`]);
const HEREDOC_RUNNER_GLOB_PROBES = [...HEREDOC_RUNNER_NAMES, ...HEREDOC_AWK_NAMES].flatMap((name) => [name, `${name}.exe`]);
const HEREDOC_UNIT_SEPARATOR_RE = /\n|;|&&|\|\||(?<![<>|&])&(?!>)/u;
const HEREDOC_WORD_SPLIT_RE = /[\s|<>&]+/u;

/** True when a glob word (`*`, `?`, `[...]`) could expand to one of `probes`; unreadable globs answer true. */
function globCouldName(base, probes) {
  const source = base
    .replace(/[.+^${}()|\\]/gu, "\\$&")
    .replace(/\[[^\]]*\]/gu, ".")
    .replace(/[[\]]/gu, "\\$&")
    .replace(/\*/gu, ".*")
    .replace(/\?/gu, ".");
  try {
    const re = new RegExp(`^${source}$`, "u");
    return probes.some((probe) => re.test(probe));
  } catch {
    return true;
  }
}

/** The lowercase basename of one word of a command, quotes removed and a `.exe` suffix dropped (a quoted path stays one word). */
function heredocWordBase(word) {
  const unquoted = word.replace(/['"‘-‟]/gu, "");
  return unquoted.slice(Math.max(unquoted.lastIndexOf("/"), unquoted.lastIndexOf("\\")) + 1).toLowerCase().replace(/\.exe$/u, "");
}

/** True when `base` is in `names`, also without a trailing version (`python3.11`, `lua5.4`, `php8.2`). */
function baseIsNamed(base, names) {
  return names.has(base) || names.has(base.replace(/[0-9][0-9.]*$/u, ""));
}

/** True when one word of a command names a shell or interpreter (see the block comment above). */
function isHeredocReceiverWord(word) {
  const base = heredocWordBase(word);
  if (base === "") return false;
  if (baseIsNamed(base, HEREDOC_RECEIVER_NAMES)) return true;
  return /[*?[]/u.test(base) && globCouldName(base, HEREDOC_GLOB_PROBES);
}

/** True when one word of a command names a command runner of decision AF (xargs, at, ed, sqlite3, ...). */
function isHeredocRunnerWord(word) {
  const base = heredocWordBase(word);
  if (base === "") return false;
  if (baseIsNamed(base, HEREDOC_RUNNER_NAMES)) return true;
  return /[*?[]/u.test(base) && globCouldName(base, HEREDOC_RUNNER_GLOB_PROBES);
}

/** True when one word of a command names awk (or a glob that could): decision AF reads its program from `-f -` only. */
function isHeredocAwkWord(word) {
  const base = heredocWordBase(word);
  if (base === "") return false;
  if (baseIsNamed(base, HEREDOC_AWK_NAMES)) return true;
  return /[*?[]/u.test(base) && globCouldName(base, HEREDOC_RUNNER_GLOB_PROBES);
}

/** True when the words of a unit pass awk its PROGRAM on standard input: `-f -`, `-f /dev/stdin`, `-f-`, `--file=-`, ... */
function unitHasAwkStdinProgram(words) {
  const plain = words.map((word) => word.replace(/['"‘-‟]/gu, ""));
  return plain.some(
    (word, index) =>
      AWK_STDIN_PROGRAM_OPTION_RE.test(word) ||
      (AWK_PROGRAM_FILE_OPTIONS.has(word) && STDIN_FILE_WORD_RE.test(plain[index + 1] ?? "")),
  );
}

// F3: a pipe at the end of a line continues the pipeline on the next command line, and a here-document body is read right
// after the line that opened it. So in `cat <<EOF |` / body / `EOF` / `sh` the receiver stands AFTER the body. The bodies
// of the closed here-documents are therefore folded out of a second reading of the view, and a newline that follows a
// trailing pipe is not a cut. (A newline after a trailing `&&` or `||` needs no such rule: those operators are cuts of the
// unit on their own, and what follows them is not fed by the here-document.) The unfolded view is still read as before,
// so the folded reading only ever ADDS a receiver. A here-document whose terminator line cannot be found, opened on a
// line that ends in a pipe, takes the whole remaining text into its unit: the safe direction.
const HEREDOC_OPENER_RE = /(?<!<)<<(?!<)-?[ \t]*([^\s;&|<>()]+)/gu;
const TRAILING_PIPE_RE = /\|&?[ \t]*$/u;
const PIPE_LINE_CONTINUATION_RE = /(\|&?)[ \t]*(?:\n[ \t]*)+/gu;

/** `text` without the bodies (and terminator lines) of its here-documents; the opener lines stay. */
function foldHeredocBodies(text) {
  const lines = text.split("\n");
  const kept = [];
  for (let i = 0; i < lines.length; i += 1) {
    kept.push(lines[i]);
    for (const opener of lines[i].matchAll(HEREDOC_OPENER_RE)) {
      const terminator = lines.findIndex((line, index) => index > i && line.trim() === opener[1]);
      if (terminator === -1) {
        if (TRAILING_PIPE_RE.test(lines[i])) {
          kept[kept.length - 1] = `${lines[i]} ${lines.slice(i + 1).join(" ")}`;
          i = lines.length;
        }
        break;
      }
      i = terminator;
    }
  }
  return kept.join("\n");
}

/** True when one unit of the view (see the block comment above) hands a `<<` text to a shell or interpreter. */
function unitHasShellHeredocReceiver(unit) {
  if (!unit.includes("<<")) return false;
  const words = unit.split(HEREDOC_WORD_SPLIT_RE).filter((word) => word !== "");
  if (words.length > 0 && (words[0] === "." || HEREDOC_COMPOUND_CLOSERS.has(words[0]))) return true;
  return words.some(isHeredocReceiverWord);
}

/**
 * True when one unit of the view hands a `<<` text to a command runner (PO decision AF): a word naming xargs, at, batch, ed,
 * ex, sqlite3, php or lua, or awk with its program on standard input (`awk -f -`). Like the shell test, ANY word of the unit
 * counts, so a path, a `.exe` or version suffix, a wrapper word (`sudo xargs`) and a glob that could expand to a runner are
 * found as well; `awk NF <<EOF` (the here-document is awk's INPUT) is not a runner.
 */
function unitHasRunnerHeredocReceiver(unit) {
  if (!unit.includes("<<")) return false;
  const words = unit.split(HEREDOC_WORD_SPLIT_RE).filter((word) => word !== "");
  if (words.some(isHeredocRunnerWord)) return true;
  return words.some(isHeredocAwkWord) && unitHasAwkStdinProgram(words);
}

/** True when some unit of `cmd`, in the plain view or with its closed here-document bodies folded out, passes `unitTest`. */
function hasHeredocReceiver(cmd, unitTest) {
  if (!cmd.includes("<<")) return false;
  for (const reading of [READING_POSIX, READING_WINDOWS_PATH, READING_POWERSHELL]) {
    // F4: the receiver view keeps a quoted path (`"/c/Program Files/git/bin/bash"`) as one readable word.
    const view = scanShell(cmd, reading, true).view;
    const folded = foldHeredocBodies(view).replace(PIPE_LINE_CONTINUATION_RE, "$1 ");
    for (const text of [view, folded]) {
      if (text.split(HEREDOC_UNIT_SEPARATOR_RE).some(unitTest)) return true;
    }
  }
  return false;
}

/** True when `cmd` hands a `<<` text to a shell or interpreter (PO decision X). */
function hasShellHeredocReceiver(cmd) {
  return hasHeredocReceiver(cmd, unitHasShellHeredocReceiver);
}

/** True when `cmd` hands a `<<` text to a command runner (PO decision AF; see `unitHasRunnerHeredocReceiver`). */
function hasRunnerHeredocReceiver(cmd) {
  return hasHeredocReceiver(cmd, unitHasRunnerHeredocReceiver);
}

/**
 * True when `cmd` holds a `git` word a command runner could execute (decision AF). The body of a runner's here-document is
 * a program in a language of its own (`ed`: `!git push`, sqlite3: `.shell git push`, lua: `os.execute"git push"`), so the
 * word is not required to stand at a shell executable boundary: it is `git` as a word anywhere, written out or once the
 * shell has removed quotes and escapes (`!g''it`), or the boundary-anchored git word of the marker rule (`hasGitWord`: a
 * brace-expanded `{git,push}`).
 */
function hasRunnerGitWord(cmd) {
  if (GIT_WORD_RE.test(cmd) || hasGitWord(cmd)) return true;
  return [READING_POSIX, READING_WINDOWS_PATH, READING_POWERSHELL].some((reading) => GIT_WORD_RE.test(scanShell(cmd, reading).view));
}

/** True when `cmd` carries a fail-closed marker (see `commandIsGitPush`). */
function hasFailClosedMarker(cmd) {
  return (
    FAIL_CLOSED_MARKER_RE.test(cmd) ||
    NESTED_POSIX_SHELL_RE.test(cmd) ||
    NESTED_WINDOWS_SHELL_RE.test(cmd) ||
    hasBackslashOutsidePathTokens(cmd) ||
    hasShellHeredocReceiver(cmd)
  );
}

/**
 * commandIsGitPush(cmd) -- the ONE source of truth for "is this command a git push CANDIDATE", the question every
 * caller needs answered before it decides whether guard-push.mjs runs at all (codex-pretool-guard.mjs's prefilter;
 * guard-push.mjs's own `if (!isPush) process.exit(0)` fast path). At those call sites returning `false` and returning
 * "I cannot tell" have the EXACT SAME effect -- the push gate never runs -- so for this classifier "not a push" is the
 * unsafe answer, and the function is an ALLOWLIST of plain commands, not a deny-list of push spellings (PO decision Q12,
 * option B, "fail-closed marker", 2026-10-06; narrowed by decisions J and X and extended by decision S, 2026-10-07;
 * recorded in specs/sprint-alfred-epic/plans/po-decisions-2026-10-06.md row Q12 and po-decisions-2026-10-07.md rows J, S
 * and X). Every
 * caller MUST call this function instead of hand-maintaining a partial reimplementation of it (NVA-A7FIX-1/2, Critic
 * F-1). `cmd` is the ALREADY-PREPARED command string a caller hands in -- for guard-push.mjs its own
 * `commandAfterDocumentedOverridePrefix` output; this function performs no guard-specific pre-processing.
 *
 * The rule, in order:
 *   1. GIT WORD. `git` or `git.exe` at an executable boundary of the raw text: the start, after whitespace, `;` `&` `|`
 *      `(`, a backtick, a quote, a path separator (`/` `\`), or -- decision S, bash brace expansion -- after `{` or
 *      `,`. A git word formed by brace expansion (`{git,push}`, `g{i..i}t`) counts: brace groups of a word (comma
 *      lists, nested ones too, and single-character `{a..z}` ranges) are expanded to their alternatives before the
 *      test. The word is also read AFTER the shell removes quotes and escapes (F1: `g"i"t`, `g''it`, `g\it`), and every
 *      alternative of a brace group is read as written and after quote removal (F2: `{g"i"t,push}`, `{"g"it,push}`).
 *      No git word, no marker rule (an unrelated command is never a candidate on the marker rule's account).
 *   2. MARKERS. With a git word present, the text is a push CANDIDATE (`true`) when it holds ANY of:
 *        - `$`, a backtick, `{`, `(` or `)`;
 *        - `<<` (also `<<-` and the `<<<` here-string) when a shell or interpreter receives it (decision X): sh, bash,
 *          zsh, ksh, dash, ash, fish, csh, tcsh, node, python, perl, ruby, pwsh, powershell, cmd, eval, ssh -- named
 *          through a path, a `.exe` or version suffix, a wrapper word or a glob, and including a here-document piped
 *          into one (`cat <<EOF | sh`), also when the pipe ends its line and the shell stands after the body
 *          (F3: `cat <<EOF |` / body / `EOF` / `sh`), and a receiver named by a quoted path that holds whitespace
 *          (F4: `"/c/Program Files/git/bin/bash" <<EOF`; quoted prose that ends in such a path, `-m "see docs/bash"`, is
 *          the same accepted false positive); `source`, `exec`, the `.` builtin and a compound command's closer
 *          (`done <<EOF`) fail closed as well. A here-document fed to any other command (`git commit -F - <<EOF`,
 *          `cat <<EOF > notes.txt`) is data and is no marker by itself; see `hasShellHeredocReceiver`;
 *        - a non-ASCII quote character (U+2018 to U+201F);
 *        - a nested shell invocation: `bash|sh|dash|zsh|ksh|csh|tcsh|fish|ash` with `-c` (also `-lc`), `cmd|cmd.exe` with
 *          `/c` or `/k`, `pwsh|powershell` with `-c`/`-Command`;
 *        - a backslash, EXCEPT inside a path token (decision J, see PATH_TOKEN_RE): a drive path `X:\...` (a quoted one,
 *          and one ending in a backslash before its closing quote, included) or a relative path whose backslashes only
 *          separate segments. Decision S: a backslash adjacent to a quote inside a double-quoted span that is not a
 *          path token (`git commit -m "say \"hi\""`) IS a marker.
 *      A candidate is routed to guard-push.mjs, which does the real evaluation and refuses every non-exact push; a
 *      spurious run costs nothing a missed push does not.
 *   3. NO MARKER: the exact `push` subcommand detection, `classifyPush`, applies. It is run under all three readings of
 *      a backslash (a POSIX escape, a Windows path separator, the ordinary character PowerShell takes it for; ANY
 *      reading classifying as a push is enough, GPGL-5/6/7) and keeps its own fail-closed checks: #1 an unterminated
 *      quote anywhere in a command that mentions git; #2 a git word followed by an option the global-option whitelist
 *      does not know (so `git --totally-unknown-flag status` is a candidate, while `gitleaks detect --no-git --redact`
 *      is not: the git word only counts where an executable can stand, GPGL-2; a whitespace-separated literal `git`
 *      ARGUMENT such as `gitleaks git --redact` is indistinguishable from the executable and stays a candidate); #3 a
 *      backslash-escaped quote outside every quote beside a git word; #4 a QUOTED git executable name with a push word
 *      later in the command (GPGL-3). Checks #5 and #6 of earlier revisions (a shell expansion after a git word, a
 *      double-quoted substitution holding a git word) were shape-specific deny-list entries and are replaced by the
 *      marker rule; their shapes are all markers.
 *
 * ACCEPTED FALSE POSITIVES (the cost of option B, pinned by tests on purpose; fixing one by exempting an expansion
 * reopens the bypass class and needs a new PO decision, not a test edit): `git commit -m "$(date)"` and
 * `git diff $(git merge-base HEAD main)` (a `$`), any commit message with an escaped quote (`git commit -m "say \"hi\""`,
 * decision S -- use single quotes in commit messages), a `{`, `(` or `)` anywhere in a command that mentions git
 * (`git commit -m '{"a":1}'`, a here-document commit message whose body holds a parenthesis), a `-c` after a shell word
 * (`bash -lc 'git status'`), a data here-document in a unit that also names a shell word (`git add -- node <<EOF`).
 *
 * Without a marker the three branches of `classifyPush` apply (extracted VERBATIM from guard-push.mjs's own `isPush`
 * computation): branch 1 tests `/\bgit\s+push\b/` against the quote-stripped, lowercased, global-option-normalized view
 * with here-document bodies removed (so `git --git-dir=<path> push` and repeated `-C` overrides fold away); branch 2
 * (`directPush`) matches `git`/`git.exe` directly followed by `push` or `-C <dir> push` after a leading run of
 * `NAME=value` assignments and an optional `env`; branch 3 (`shellWrapperPush`) matches a
 * `sh|bash|zsh|dash|pwsh|powershell|cmd|ssh` wrapper whose argument contains `git ... push`.
 *
 * NOT modelled, still open (QG-06 needs an owner and an expiry set by the dispatcher; tracked in
 * backlog/items/2026-10-06-push-classifier-does-not-model-powershell-backtick-escapes.md): PowerShell here-strings
 * (`@"..."@`) hold no marker of the list above. Likewise, the receiver lists of decisions X and AF do not model every
 * command that runs text from standard input (vi/vim `-es`, `busybox` applets, ...): a here-document fed to one of those is
 * data to this rule (an extension of the receiver list is a new PO decision, not a test edit).
 *
 * DECISION AF (command runners, a rule after the marker rule, see `hasRunnerHeredocReceiver`): a here-document or here-string
 * received by xargs, at, batch, ed, ex, sqlite3, php, lua (and luajit) or by awk with its program on standard input
 * (`awk -f -`, `-f /dev/stdin`, `-f-`, `--file=-`, gawk `-E -`) is treated like one received by a shell: the command is a
 * candidate when the text holds a `git` word anywhere (`hasRunnerGitWord`: `!git` for ed and ex, `.shell git` for sqlite3, a
 * word inside a program string), whether or not a push word is spelled out. The receiver is found like a shell receiver
 * (any word of the unit, path, `.exe`/version suffix, wrapper word, glob, quoted path, here-document piped into it, a
 * receiver after the body). perl, python, ruby and node reading `-` or stdin were receivers already. `awk NF <<EOF` (the
 * here-document is awk's input) and any other command stay data. ACCEPTED FALSE POSITIVES of this rule: a runner
 * here-document in a text that merely mentions git, for example `xargs echo <<EOF` with a body line `git status`, and a
 * data here-document whose opener line holds a word that is also a runner name (`git add -- ed <<EOF`).
 *
 * HERE-DOCUMENT OPENER LINE: only the body (the lines after the opener line up to the terminator) is data. The rest of the
 * opener line is command text, so `cat <<EOF && git push origin main` / body / `EOF` is a candidate (`classifyPush` keeps
 * that rest when it removes the body).
 *
 * Returns `true` for a candidate, `false` for a command the rule proves plain.
 */
export function commandIsGitPush(cmd) {
  if (typeof cmd !== "string" || cmd === "") return false;
  if (hasGitWord(cmd) && hasFailClosedMarker(cmd)) return true;
  // Decision AF: a here-document fed to a command runner is a program the runner executes, so it is treated like one fed to a
  // shell. The git word it needs is read more loosely than the marker rule's (see `hasRunnerGitWord`): `ed` runs `!git push`.
  if (hasRunnerHeredocReceiver(cmd) && hasRunnerGitWord(cmd)) return true;
  // No marker. A backslash has three readings: a POSIX escape (`p\ush` is `push`), a Windows path separator
  // (`C:\Git\bin\git.exe push`) and the ordinary character PowerShell takes it for (`\"` closes a double-quoted span,
  // `\ ` ends a word). Which shell a runner applies is not known here, so classify under all three and fail closed
  // when ANY reading is a push (GPGL-5, GPGL-7).
  return (
    classifyPush(cmd, READING_POSIX) || classifyPush(cmd, READING_WINDOWS_PATH) || classifyPush(cmd, READING_POWERSHELL)
  );
}

/** One reading of `cmd` (see `scanShell` for `reading`); detection runs on the dequoted view and words. */
function classifyPush(cmd, reading) {
  const scan = scanShell(cmd, reading);
  const view = scan.view;
  // Fail-closed checks #1 and #3 (NVA-PUSHCLASS-1, GPGL-3, GPGL-5) and #4 (GPGL-3), independent of the branches below.
  if (scan.unterminated && (GIT_WORD_RE.test(cmd) || GIT_WORD_RE.test(view))) return true;
  if (
    scan.escapedQuoteOutsideQuotes &&
    (GIT_WORD_AT_EXECUTABLE_BOUNDARY_RE.test(cmd) || GIT_WORD_AT_EXECUTABLE_BOUNDARY_RE.test(view))
  ) return true;
  if (hasQuotedGitWordBeforePushWord(cmd, scan.words)) return true;
  const normalized = normalizeGlobalGitOptions(view.toLowerCase());
  // `source` with here-document BODIES removed (data, never command text); pathological input degrades to the
  // unstripped text. Only the body (the lines after the opener line, up to the terminator) is data: the rest of the OPENER
  // line is command text and is kept (`cat <<EOF && git push origin main` runs the push as its own command).
  const withoutHeredocBodies = (source) => {
    const opener = /(^|\s)<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/u;
    let text = source;
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
      if (found === null) return source;
      const restOfOpenerLine = text.slice(afterOpener, bodyStart);
      text = `${text.slice(0, openerStart)}${restOfOpenerLine}\n${text.slice(bodyStart + found.index + found[0].length)}`;
    }
    // Bounded-scan exhaustion: fall back to the unstripped command. Over-detection is
    // the safe direction; this is the branch that must never silently open the gate.
    return source;
  };
  const commandRegion = withoutHeredocBodies(normalized);
  // Fail-closed check #2 (see `commandIsGitPush`): every RECOGNIZED global option has already been collapsed away by
  // normalizeGlobalGitOptions above, so a `git`/`git.exe` still immediately followed by a `-`-prefixed token here names
  // an option this file does not know how to consume. Do not guess "not a push".
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
  // A bare `git.exe` (any letter case) after a separator: same word as `git`, at an executable boundary only
  // (`xgit.exe`, `git.exe.bak` and `gitk` stay non-git).
  const nonLeadingGitExePush = /(?:^|[\s;&|(`'"/\\])git\.exe\s+push\b/iu.test(commandRegion);
  return /\bgit\s+push\b/.test(commandRegion) || directPush || shellWrapperPush || nonLeadingGitExePush;
}
