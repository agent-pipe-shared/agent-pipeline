// SPDX-License-Identifier: SUL-1.0

/**
 * Closed command grammar for the lifecycle guard.
 *
 * This is deliberately not a shell parser. It recognizes the small direct
 * command subset used by Pipeline and one bounded read-only diagnostic
 * pipeline. Unsupported syntax returns no authoritative argv.
 */
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

const CONTROL = new Set([";", "&&", "||", "&", "(", ")"]);
const SEARCH_BOOLEAN = new Set([
  "-n", "--line-number", "-S", "--smart-case", "-i", "--ignore-case",
  "-s", "--case-sensitive", "-F", "--fixed-strings", "-w", "--word-regexp",
  "-x", "--line-regexp", "-l", "--files-with-matches", "-L",
  "--files-without-match", "--hidden", "--no-ignore", "--no-messages",
]);
const SEARCH_VALUE = new Set([
  "-A", "--after-context", "-B", "--before-context", "-C", "--context",
  "-g", "--glob", "-t", "--type", "-T", "--type-not", "-e", "--regexp",
  "--max-count", "--max-depth",
]);
const FILE_BOOLEAN = new Set(["--hidden", "--no-ignore", "--no-messages"]);
const FILE_VALUE = new Set(["-g", "--glob", "-t", "--type", "-T", "--type-not", "--max-depth"]);
const NUMERIC_VALUE = new Set([
  "-A", "--after-context", "-B", "--before-context", "-C", "--context",
  "--max-count", "--max-depth",
]);
const REPEATABLE_SEARCH_VALUE = new Set(["-g", "--glob", "-t", "--type", "-T", "--type-not"]);

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
  tokens.push(state.value);
  state.value = "";
  state.started = false;
  state.expansion = false;
  return true;
}

function tokenize(command, root, dialect) {
  const tokens = [];
  const operators = [];
  const redirects = [];
  const windows = dialect === "windows-direct";
  const state = { value: "", started: false, expansion: false };
  let quote = null;
  let segment = 0;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
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
  if (quote !== null || !finishToken(tokens, state, root)) return null;
  return { tokens, operators, redirects };
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

export function parseGuardCommand(command, root, { platform = process.platform } = {}) {
  if (typeof command !== "string" || command.trim() === "" || /[\0\r\n]/u.test(command)) return denied();
  const dialect = dialectFor(command, platform);
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

/**
 * GF-078 bug 2: `additionalRoots` admits a read target under one more resolved root besides
 * the project root -- always resolved from `resolve(root, value)` first (a relative `value`
 * is still interpreted against the invocation root, `root`, exactly as before; only an
 * ABSOLUTE `value` can ever resolve outside `root` in the first place, so additionalRoots
 * only ever matters for that case). Every single, non-piped read-only command this guard
 * family admits elsewhere (`rg`, `grep`, `cat`, `head`, `tail`, `wc`, `stat`, `file` in
 * guard-lifecycle-ready.mjs's `isReadOnlyDiagnosticCommand`) carries NO path restriction at
 * all, so this bounded rg-to-rg/rg-to-head pipeline was the only read-only lane in the whole
 * guard family that refused a legitimate outside-root read -- a self-inspection of the
 * plugin's own installed directory, in particular. Passing one additional resolved root is
 * strictly narrower than that existing single-command allowance, never wider than it.
 */
function approvedReadPath(value, root, additionalRoots = []) {
  if (typeof value !== "string" || value === "" || value.includes("\0")) return false;
  // NVA-B-TILDEFIX-1 (backlog: 2026-09-06-a-leading-tilde-path-argument-is-admitted-as-inside-
  // the-project-root.md): a leading `~` is expanded by the real shell to an absolute
  // home-directory path BEFORE this argument ever reaches `resolve(root, value)` below --
  // resolving it against `root` there collapses it to a literal, never-realpathed
  // `<root>/~/...` string that pathInside() admits on lexical grounds alone, no ancestor-walk
  // even needed. Refused unconditionally, regardless of `additionalRoots` -- this function's
  // only caller (isBoundedReadOnlyPipeline, always inside a `|`-joined two-segment pipeline)
  // already denies with an existing code (GUARD-OPERATOR-UNAPPROVED or
  // GUARD-READ-SCOPE-OUTSIDE-ROOT) once containment fails here, so no self-referential-match
  // trick is needed to route this to a specific code the way guard-lifecycle-ready.mjs's
  // independent twin of this same one-line check must (see that file's
  // rawReadCandidatePath() -- not imported here; the import direction is fixed the other way,
  // this file exports to that one, never the reverse). Never existsSync/realpathSync -- a
  // narrow reject, not real tilde expansion.
  if (value.startsWith("~")) return false;
  if (value === ".") return true;
  try {
    const target = resolve(root, value);
    if (pathInside(resolve(root), target)) return true;
    return additionalRoots.some((extra) => {
      try { return pathInside(resolve(extra), target); } catch { return false; }
    });
  } catch {
    return false;
  }
}

function validateRg(argv, root, windows, additionalRoots = []) {
  const args = [...argv];
  const filesMode = args[0] === "--files";
  if (filesMode) args.shift();
  const booleans = filesMode ? FILE_BOOLEAN : SEARCH_BOOLEAN;
  const values = filesMode ? FILE_VALUE : SEARCH_VALUE;
  const seen = new Set();
  const paths = [];
  let patternCount = 0;
  let regexpProvided = false;
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
        if (["-e", "--regexp"].includes(arg)) regexpProvided = true;
        index += 1;
      }
      continue;
    }
    if (filesMode || regexpProvided || patternCount === 1) paths.push(arg);
    else patternCount += 1;
  }
  if ((!filesMode && !regexpProvided && patternCount !== 1)
    || (!filesMode && regexpProvided && patternCount !== 0)) return false;
  return paths.every((path) => approvedReadPath(path, root, additionalRoots))
    && (windows ? true : true);
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
  const headName = basename(parsed.segments[1].executable).toLowerCase();
  if (rgName !== expectedRg) return false;
  if (headName === expectedRg) {
    return parsed.redirects.length === 0
      && validateRg(parsed.segments[0].argv, root, windows, additionalRoots)
      && validateRg(parsed.segments[1].argv, root, windows, additionalRoots);
  }
  if (headName !== (windows ? "head.exe" : "head")) return false;
  if (parsed.redirects.length === 1) {
    const redirect = parsed.redirects[0];
    if (redirect.segment !== 0 || redirect.fd !== 2 || redirect.direction !== ">"
      || (windows ? redirect.target.toLowerCase() !== "nul" : redirect.target !== "/dev/null")) return false;
  }
  // GF-078 bug 2 (head -N sub-finding): a combined `-N` flag (`head -40`) is the shape an
  // agent naturally reaches for; only the two-token `-n 40` form was ever accepted, so the
  // narrower, equally-safe combined shape was refused for no bound-related reason. Same
  // canonical numeric range both ways, checked by the identical regex.
  const headArgs = parsed.segments[1].argv;
  const headCount = /^(?:[1-9]|[1-9][0-9]|[1-4][0-9]{2}|500)$/u;
  const headOk = (headArgs.length === 2 && headArgs[0] === "-n" && headCount.test(headArgs[1]))
    || (headArgs.length === 1 && headArgs[0].startsWith("-") && headCount.test(headArgs[0].slice(1)));
  if (!headOk) return false;
  return validateRg(parsed.segments[0].argv, root, windows, additionalRoots);
}
