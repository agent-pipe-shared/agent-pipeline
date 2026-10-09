// SPDX-License-Identifier: SUL-1.0

/**
 * Closed command grammar for the lifecycle guard.
 *
 * This is deliberately not a shell parser. It recognizes the small direct
 * command subset used by Pipeline and one bounded read-only diagnostic
 * pipeline. Unsupported syntax returns no authoritative argv.
 */
import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { decodeBashAnsiCEscape } from "../lib/git-cmd.mjs";
import { isAllowedPassiveReadTarget } from "../lib/passive-read-policy.mjs";

const CONTROL = new Set([";", "&&", "||", "&", "(", ")"]);
const SEARCH_BOOLEAN = new Set([
  "-n", "--line-number", "-S", "--smart-case", "-i", "--ignore-case",
  "-s", "--case-sensitive", "-F", "--fixed-strings", "-w", "--word-regexp",
  "-x", "--line-regexp", "-l", "--files-with-matches", "-L",
  "--files-without-match", "--no-messages",
  // TR-B-F (T74): match-output spellings. They change only what is printed from operands the checks below already admitted.
  "-o", "--only-matching",
]);
const SEARCH_VALUE = new Set([
  "-A", "--after-context", "-B", "--before-context", "-C", "--context",
  "-t", "--type", "-T", "--type-not", "-e", "--regexp",
  "--max-count", "--max-depth", "-g", "--glob", "-f", "--file",
  "--max-columns",
]);
// Recursive rg must use its default hidden/ignore policy. Only a basename
// extension filter is admitted below; path globs and hidden-name selectors
// stay closed so this operand cannot widen the traversal roots.
const FILE_BOOLEAN = new Set(["--no-messages"]);
const FILE_VALUE = new Set(["-t", "--type", "-T", "--type-not", "--max-depth", "-g", "--glob"]);
const NUMERIC_VALUE = new Set([
  "-A", "--after-context", "-B", "--before-context", "-C", "--context",
  "--max-count", "--max-depth", "--max-columns",
]);
const REPEATABLE_SEARCH_VALUE = new Set(["-t", "--type", "-T", "--type-not"]);

function isBoundedFilenameFilter(value) {
  return typeof value === "string" && /^\*\.[A-Za-z0-9][A-Za-z0-9_-]{0,15}$/u.test(value);
}

function denied(code = "GUARD-PARSE-UNSUPPORTED") {
  return Object.freeze({
    schema: "pipeline.guard-command.v1",
    dialect: null,
    segments: Object.freeze([]),
    operators: Object.freeze([]),
    redirects: Object.freeze([]),
    parseStatus: "denied",
    denialCode: code,
  });
}

function accepted(dialect, segments, operators = [], redirects = []) {
  return Object.freeze({
    schema: "pipeline.guard-command.v1",
    dialect,
    segments: Object.freeze(segments.map((segment) => Object.freeze({
      executable: segment.executable,
      argv: Object.freeze([...segment.argv]),
    }))),
    operators: Object.freeze(operators.map((operator) => Object.freeze({ ...operator }))),
    redirects: Object.freeze(redirects.map((redirect) => Object.freeze({ ...redirect }))),
    parseStatus: "accepted",
    denialCode: null,
  });
}

function dialectFor(command, platform) {
  if (/^\s*Get-Content(?:\s|$)/iu.test(command)) return "powershell-fixed-read";
  if (platform === "win32"
    || /^\s*(?:[A-Za-z]:\\|\\\\)/u.test(command)
    || /^\s*[^\s"']+\.exe(?:\s|$)/iu.test(command)) return "windows-direct";
  return "posix-simple";
}

function finishToken(tokens, state, root) {
  if (!state.started) return true;
  if (state.expansion) {
    if (state.value === "$PWD" || state.value === "${PWD}") state.value = root;
    else return false;
  }
  if (state.value.includes("\0")) return false;
  tokens.push(state.value);
  if (state.usedAnsiC) state.ansiCTokenIndexes.push(tokens.length - 1);
  state.value = "";
  state.started = false;
  state.expansion = false;
  state.usedAnsiC = false;
  return true;
}

function tokenize(command, root, dialect) {
  const tokens = [];
  const operators = [];
  const redirects = [];
  const windows = dialect === "windows-direct";
  const state = { value: "", started: false, expansion: false, usedAnsiC: false, ansiCTokenIndexes: [] };
  let quote = null;
  let ansiC = false;
  let segment = 0;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (ansiC) {
      if (char === "'") {
        ansiC = false;
      } else if (char === "\\") {
        const decoded = decodeBashAnsiCEscape(command, index);
        if (decoded.value.includes("\0")) return null;
        state.value += decoded.value;
        index = decoded.end;
      } else {
        state.value += char;
      }
      state.started = true;
      continue;
    }
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      } else if (!windows && quote === "\"" && char === "\\") {
        index += 1;
        if (index >= command.length) return null;
        state.value += command[index];
      } else {
        if (!windows && quote === "\"" && (char === "$" || char === "`")) state.expansion = true;
        state.value += char;
      }
      state.started = true;
      continue;
    }
    if (/\s/u.test(char)) {
      if (!finishToken(tokens, state, root)) return null;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      state.started = true;
      continue;
    }
    if (!windows && char === "$" && command[index + 1] === "'") {
      ansiC = true;
      state.usedAnsiC = true;
      state.started = true;
      index += 1;
      continue;
    }
    if (char === "\0" || char === "\r" || char === "\n" || char === "`") return null;
    if (char === "$" && !windows) state.expansion = true;
    if (char === "|" || char === ";" || char === "&" || char === "(" || char === ")") {
      if (!finishToken(tokens, state, root)) return null;
      const two = command.slice(index, index + 2);
      const operator = two === "&&" || two === "||" ? two : char;
      if (CONTROL.has(operator)) return null;
      tokens.push({ operator, segment });
      operators.push({ operator, beforeSegment: segment, afterSegment: segment + 1 });
      segment += 1;
      if (operator.length === 2) index += 1;
      continue;
    }
    if ((char === ">" || char === "<") || (char === "2" && command[index + 1] === ">")) {
      if (!finishToken(tokens, state, root)) return null;
      let fd = null;
      let direction = char;
      if (char === "2") {
        fd = 2;
        direction = ">";
        index += 1;
      }
      if (command[index + 1] === direction) return null;
      let cursor = index + 1;
      while (cursor < command.length && /\s/u.test(command[cursor])) cursor += 1;
      let target = "";
      while (cursor < command.length && !/\s/u.test(command[cursor])
        && !"|;&<>()".includes(command[cursor])) {
        target += command[cursor];
        cursor += 1;
      }
      if (target === "") return null;
      index = cursor - 1;
      const redirect = { segment, fd, direction, target };
      tokens.push({ redirect });
      redirects.push(redirect);
      continue;
    }
    if (!windows && char === "\\") {
      index += 1;
      if (index >= command.length) return null;
      state.value += command[index];
      state.started = true;
      continue;
    }
    state.value += char;
    state.started = true;
  }
  if (quote !== null || ansiC || !finishToken(tokens, state, root)) return null;
  return { tokens, operators, redirects, ansiCTokenIndexes: state.ansiCTokenIndexes };
}

function segmentsFromTokens(tokens) {
  const segments = [[]];
  for (const token of tokens) {
    if (typeof token === "string") segments.at(-1).push(token);
    else if (token.operator) segments.push([]);
  }
  if (segments.some((segment) => segment.length === 0)) return null;
  return segments.map(([executable, ...argv]) => ({ executable, argv }));
}

// An ANSI-C token is normally unavailable to the lifecycle grammar because it
// can decode control bytes that are not visible in the shell source. There
// are two deliberately tiny exceptions: a git commit message (below), and a
// display-only separator inside an otherwise read-only diagnostic chain. The
// latter is the exact argv of `printf $'\\n--- LABEL ---\\n'`: one argument,
// no format directives or shell-significant characters, and only its two
// boundary newlines as control bytes. It cannot select a path, redirect data,
// or cause a write.
function isAnsiCReadOnlyPrintfLabel(segment, ansiCTokenIndexes) {
  if (segment === undefined
    || basename(segment.executable).toLowerCase() !== "printf"
    || segment.argv.length !== 1
    || ansiCTokenIndexes.length !== 1
    || ansiCTokenIndexes[0] !== 1) return false;
  return /^\n[^%$`\\\r\n\0-\x08\x0b\x0c\x0e-\x1f\x7f]+\n$/u.test(segment.argv[0]);
}

export function parseGuardCommand(command, root, { platform = process.platform } = {}) {
  if (typeof command !== "string" || command.trim() === "" || /[\0\r\n]/u.test(command)) return denied();
  const dialect = dialectFor(command, platform);
  // `$'...'` is Bash-specific syntax. A native Windows command line must not
  // reinterpret it as a partly quoted argument and thereby bypass the narrow
  // POSIX-only multiline-message rule below.
  if (dialect === "windows-direct" && command.includes("$'")) return denied();
  if (dialect === "powershell-fixed-read") {
    const parsed = tokenize(command.trim(), root, "windows-direct");
    if (!parsed || parsed.operators.length !== 0 || parsed.redirects.length !== 0) return denied();
    const segments = segmentsFromTokens(parsed.tokens);
    if (!segments || segments.length !== 1) return denied();
    return accepted(dialect, segments);
  }
  const parsed = tokenize(command.trim(), root, dialect);
  if (!parsed) return denied();
  const segments = segmentsFromTokens(parsed.tokens);
  if (!segments) return denied();
  // A Bash ANSI-C token can contain a decoded newline even though the command
  // text itself has none. It is admitted only when it is exactly a `git
  // commit` message value: the narrow ergonomic form that needs multiline
  // provenance trailers. It remains unavailable to every other executable,
  // option, path argument, composition form, and Windows shell dialect.
  if (parsed.ansiCTokenIndexes.length > 0) {
    if (dialect !== "posix-simple" || segments.length !== 1) return denied();
    if (isAnsiCReadOnlyPrintfLabel(segments[0], parsed.ansiCTokenIndexes)) {
      return accepted(dialect, segments, parsed.operators, parsed.redirects);
    }
    if (!["git", "git.exe"].includes(basename(segments[0].executable).toLowerCase())
      || segments[0].argv[0] !== "commit") return denied();
    const messageValueIndexes = new Set();
    const argv = segments[0].argv;
    for (let index = 1; index < argv.length - 1; index += 1) {
      if (argv[index] === "-m" || argv[index] === "--message") messageValueIndexes.add(index + 1);
    }
    const ansiCArgIndexes = parsed.ansiCTokenIndexes.map((index) => index - 1);
    if (ansiCArgIndexes.length === 0
      || !ansiCArgIndexes.every((index) => messageValueIndexes.has(index)
        && /[\r\n]/u.test(argv[index])
        && !/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(argv[index]))) return denied();
  }
  const pipeline = parsed.operators.length > 0;
  const finalDialect = pipeline
    ? (dialect === "windows-direct" ? "windows-readonly-pipeline" : "posix-readonly-pipeline")
    : dialect;
  return accepted(finalDialect, segments, parsed.operators, parsed.redirects);
}

function canonicalInteger(value, maximum) {
  return /^(?:0|[1-9][0-9]*)$/u.test(value ?? "") && Number(value) <= maximum;
}

function pathInside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function rawReadCandidatePath(value, root) {
  if (typeof value !== "string" || value === "" || value.startsWith("-")) return null;
  if (value.startsWith("~")) return `${sep}${value}`;
  return isAbsolute(value) ? value : `${root}${sep}${value}`;
}

export function isRealpathedWithinBoundary(resolved, boundary, dependencies = {}) {
  if (resolved === boundary) return true;
  const exists = dependencies.existsSyncFn ?? existsSync;
  const realpath = dependencies.realpathSyncFn ?? realpathSync;
  const stat = dependencies.statSyncFn ?? statSync;
  let realBoundary;
  try {
    realBoundary = realpath(boundary);
    if (!stat(realBoundary).isDirectory()) return false;
  } catch {
    return false;
  }
  if (!pathInside(realBoundary, resolved)) return false;
  let ancestor = resolved;
  try {
    while (ancestor !== boundary && !exists(ancestor)) ancestor = dirname(ancestor);
    return pathInside(realBoundary, realpath(ancestor));
  } catch {
    return false;
  }
}

/** Exact passive file reads may use host paths; recursive searches stay scoped. */
function approvedReadPath(value, root, additionalRoots = []) {
  return isAllowedPassiveReadTarget(value, { rootDir: root, recursive: true, additionalRecursiveRoots: additionalRoots });
}

function hasExternalRecursiveGlobTarget(paths, root) {
  return paths.some((value) => {
    if (typeof value !== "string") return false;
    const candidate = isAbsolute(value) ? resolve(value) : resolve(root, value);
    if (isRealpathedWithinBoundary(candidate, root)) return false;
    try { return statSync(candidate).isDirectory(); }
    catch { return false; }
  });
}

function validateRg(argv, root, windows, additionalRoots = []) {
  // The policy's recursive inventory intentionally clears this variable.
  // A real rg process inheriting a config could re-enable hidden traversal or
  // --pre, so no rg read lane is valid while the host setting is active.
  if (typeof process.env.RIPGREP_CONFIG_PATH === "string"
    && process.env.RIPGREP_CONFIG_PATH !== "") return false;
  const args = [...argv];
  const filesMode = args[0] === "--files";
  if (filesMode) args.shift();
  const booleans = filesMode ? FILE_BOOLEAN : SEARCH_BOOLEAN;
  const values = filesMode ? FILE_VALUE : SEARCH_VALUE;
  const seen = new Set();
  const paths = [];
  let patternCount = 0;
  let regexpProvided = false;
  let patternFileProvided = false;
  const patternFiles = [];
  let globProvided = false;
  let afterDashDash = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!afterDashDash && arg === "--") {
      afterDashDash = true;
      continue;
    }
    if (!afterDashDash && arg.startsWith("-")) {
      if (arg.includes("=") || (!booleans.has(arg) && !values.has(arg))
        || (seen.has(arg) && !REPEATABLE_SEARCH_VALUE.has(arg))) return false;
      seen.add(arg);
      if (values.has(arg)) {
        const value = args[index + 1];
        if (typeof value !== "string" || value === "" || value.startsWith("-")) return false;
        if (NUMERIC_VALUE.has(arg) && !canonicalInteger(value, 500)) return false;
        // TR-B-F (T74): rg reads --max-columns 0 as "no limit", so only a positive bound (1..500) is admitted for it.
        if (arg === "--max-columns" && value === "0") return false;
        if (["-e", "--regexp"].includes(arg)) regexpProvided = true;
        if (["-g", "--glob"].includes(arg)) {
          if (globProvided || !isBoundedFilenameFilter(value)) return false;
          globProvided = true;
        }
        if (["-f", "--file"].includes(arg)) {
          if (patternFileProvided) return false;
          patternFileProvided = true;
          patternFiles.push(value);
        }
        index += 1;
      }
      continue;
    }
    if (filesMode || regexpProvided || patternFileProvided || patternCount === 1) paths.push(arg);
    else patternCount += 1;
  }
  if ((!filesMode && !regexpProvided && !patternFileProvided && patternCount !== 1)
    || (!filesMode && (regexpProvided || patternFileProvided) && patternCount !== 0)) return false;
  // Filename filters change which files a recursive search visits. They are
  // admitted for project searches, where the inventory is already bounded by
  // the project, but cannot be combined with an external approved directory:
  // that would make the directory boundary selective and could hide unsafe
  // entries from the policy's whole-tree check.
  if (globProvided && hasExternalRecursiveGlobTarget(paths, root)) return false;
  return [...(paths.length > 0 ? paths : ["." ]), ...patternFiles]
    .every((path) => approvedReadPath(path, root, additionalRoots))
    && (windows ? true : true);
}

// Reuse the pipeline's closed rg option grammar for the direct-command lane.
// In particular, --pre and output options cannot be mistaken for path data.
export function isBoundedSingleRg(argv, root, additionalRoots = []) {
  return validateRg(argv, root, false, additionalRoots);
}

/**
 * Validate the small, bounded search-pipeline family.  A second rg consumes
 * only the first rg's stdout and is still a closed, read-only diagnostic.  It
 * covers the frequent `rg --files … | rg …` narrowing pattern without
 * admitting a general shell pipeline.
 *
 * `additionalRoots` (GF-078 bug 2): zero or more extra resolved roots a read target may
 * also fall under, threaded straight through to `approvedReadPath()`. Optional and
 * additive -- every existing call site naming only `(parsed, root)` is unaffected.
 */
export function isBoundedReadOnlyPipeline(parsed, root, additionalRoots = []) {
  if (!parsed || parsed.parseStatus !== "accepted"
    || parsed.segments.length !== 2
    || parsed.operators.length !== 1
    || parsed.operators[0].operator !== "|"
    || parsed.redirects.length > 1) return false;
  const windows = parsed.dialect === "windows-readonly-pipeline";
  const rgName = basename(parsed.segments[0].executable).toLowerCase();
  const expectedRg = windows ? "rg.exe" : "rg";
  const sinkName = basename(parsed.segments[1].executable).toLowerCase();
  if (rgName !== expectedRg) return false;
  if (sinkName === expectedRg) {
    return parsed.redirects.length === 0
      && validateRg(parsed.segments[0].argv, root, windows, additionalRoots)
      && validateRg(parsed.segments[1].argv, root, windows, additionalRoots);
  }
  // A bare `sort` consumes only the already-contained stdout of the same
  // validated `rg` source.  Keep this deliberately narrower than a general
  // sort permission: no sort flags, operands, redirects, or extra pipeline
  // stages are accepted, so `sort -o <file>` cannot gain a write route.
  const expectedSort = windows ? "sort.exe" : "sort";
  if (sinkName === expectedSort) {
    return parsed.redirects.length === 0
      && parsed.segments[1].argv.length === 0
      && validateRg(parsed.segments[0].argv, root, windows, additionalRoots);
  }
  // `tail` is as read-only as `head`; retain the identical, deliberately
  // bounded 1..500 line count.  The admission stays rg-sourced only -- this
  // is not a general pipe permission or a script-indirection exception.
  const expectedHead = windows ? "head.exe" : "head";
  const expectedTail = windows ? "tail.exe" : "tail";
  if (sinkName !== expectedHead && sinkName !== expectedTail) return false;
  if (parsed.redirects.length === 1) {
    const redirect = parsed.redirects[0];
    if (redirect.segment !== 0 || redirect.fd !== 2 || redirect.direction !== ">"
      || (windows ? redirect.target.toLowerCase() !== "nul" : redirect.target !== "/dev/null")) return false;
  }
  // GF-078 bug 2 (head -N sub-finding): a combined `-N` flag (`head -40`) is the shape an
  // agent naturally reaches for; only the two-token `-n 40` form was ever accepted, so the
  // narrower, equally-safe combined shape was refused for no bound-related reason. Same
  // canonical numeric range both ways, checked by the identical regex.
  const sinkArgs = parsed.segments[1].argv;
  const lineCount = /^(?:[1-9]|[1-9][0-9]|[1-4][0-9]{2}|500)$/u;
  const sinkOk = (sinkArgs.length === 2 && sinkArgs[0] === "-n" && lineCount.test(sinkArgs[1]))
    || (sinkArgs.length === 1 && sinkArgs[0].startsWith("-") && lineCount.test(sinkArgs[0].slice(1)));
  if (!sinkOk) return false;
  return validateRg(parsed.segments[0].argv, root, windows, additionalRoots);
}
