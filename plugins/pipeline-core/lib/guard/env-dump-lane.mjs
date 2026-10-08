// SPDX-License-Identifier: SUL-1.0
// Guard module "env-dump-lane" (ENVDUMP-F): refuses a shell command whose effect is to print the process environment.
//
// Backlog: 2026-10-07-a-read-only-probe-can-dump-the-process-environment-into-a-transcript. A command that prints the
// environment writes every secret in that environment into a transcript that cannot be un-printed. The refusal is typed
// (GUARD-ENV-DUMP), applies to every session this guard sees (main and subagent), and carries NO override route and NO retry
// action: there is no legitimate agent need that outweighs it, so a lift would only be a place for the mistake to be repeated.
//
// The scan operates on the raw command text and is decided BEFORE every other Bash/PowerShell admission or denial (grammar,
// operator, read-scope, parse), so a dump command can never be classified as some other refusal -- or admitted by one.
// Every string handled here is DATA: nothing in this module spawns or evaluates a command.
//
// Scope is deliberately the closed list below and nothing wider. It is a static-text scan, not a shell: it does not expand
// variables, decode escapes beyond a backslash, follow aliases, or look through wrapper commands (`command env`, `sudo env`,
// `bash -c env`, `xargs`), and a command that reaches the environment by another name is out of its reach. The one wrapper it
// does look through is `env` itself: after the options and NAME=VALUE words, `env`'s command operand is classified by the same
// simple-command rule, recursively (`env printenv`, `env FOO=1 env`), because `env` runs that operand with the full environment, so a dump command there still dumps.

import { verdict } from "./verdict.mjs";

export const ENV_DUMP_DENIAL_CODE = "GUARD-ENV-DUMP";
export const ENV_DUMP_DENIAL_GUIDANCE = "prints the process environment; values may be secrets -- never run it; pass command strings as data";

const ASSIGNMENT_WORD = /^[A-Za-z_][A-Za-z0-9_]*=/u;
// `process.env` not immediately followed by `.` or `[` is whole-object access; `process.env.NAME` / `process.env["NAME"]` is not.
const WHOLE_PROCESS_ENV = /process\.env(?![.\[])/u;
const POWERSHELL_ENV_LISTERS = new Set(["get-childitem", "gci", "dir", "ls", "get-item"]);
// A path argument that is the env: drive itself (optionally `-Path:`-attached, optionally followed by `\`, `/` or `*`).
const POWERSHELL_ENV_DRIVE = /^(?:-[a-z]+:)?env:[\\/]?\*?$/iu;
const POWERSHELL_GET_ENVIRONMENT_VARIABLES = /\[\s*Environment\s*\]\s*::\s*GetEnvironmentVariables\s*\(/iu;

/**
 * Quote-aware split of a command text into simple commands, each { words, targets }: `words` are the dequoted command words,
 * `targets` the dequoted redirect targets (kept apart so `env <<EOF` is "env with no operand" while a `< file` target is still
 * visible to the path rule). A new simple command starts at the beginning, after `|`, `&`, `;`, newline, `(`, `)`, `$(` and a
 * backtick. Text inside single quotes never opens a position; text inside double quotes does only through `$(` and a backtick.
 * `unbalanced` is true when a quote or substitution is not closed, which the caller treats as "cannot be trusted".
 */
function tokenize(text, powershell) {
  const commands = [];
  let unbalanced = false;
  const n = text.length;

  // Parses one command sequence starting at `start`; returns the index just past its terminator (`end`), or n.
  function sequence(start, end) {
    let i = start;
    let words = [];
    let targets = [];
    let word = null;
    let skipNext = false;
    let depth = 0;
    const finishWord = () => {
      if (word === null) return;
      (skipNext ? targets : words).push(word);
      skipNext = false;
      word = null;
    };
    const finishCommand = () => {
      finishWord();
      if (words.length > 0 || targets.length > 0) commands.push({ words, targets });
      words = [];
      targets = [];
      skipNext = false;
    };
    while (i < n) {
      const c = text[i];
      if (end === "`" && c === "`") { finishCommand(); return i + 1; }
      if (c === " " || c === "\t" || c === "\r") { finishWord(); i += 1; continue; }
      if (c === "\n" || c === ";" || c === "|" || c === "&") { finishCommand(); i += 1; continue; }
      if (c === "#" && word === null) {
        while (i < n && text[i] !== "\n") i += 1;
        continue;
      }
      if (c === "(") { finishCommand(); depth += 1; i += 1; continue; }
      if (c === ")") {
        finishCommand();
        if (depth > 0) depth -= 1;
        else if (end === ")") return i + 1;
        i += 1;
        continue;
      }
      if (c === "\\" && !powershell) {
        if (text[i + 1] === "\n") { i += 2; continue; }
        word = (word ?? "") + (i + 1 < n ? text[i + 1] : "");
        i += 2;
        continue;
      }
      if (c === "`") {
        if (powershell) {
          if (text[i + 1] === "\n") { i += 2; continue; }
          word = (word ?? "") + (i + 1 < n ? text[i + 1] : "");
          i += 2;
          continue;
        }
        i = sequence(i + 1, "`");
        word = word ?? "";
        continue;
      }
      if (c === "$" && text[i + 1] === "(") {
        i = sequence(i + 2, ")");
        word = word ?? "";
        continue;
      }
      if (c === "$" && text[i + 1] === "'" && !powershell) {
        let j = i + 2;
        let out = "";
        while (j < n && text[j] !== "'") {
          if (text[j] === "\\" && j + 1 < n) { out += text[j + 1]; j += 2; } else { out += text[j]; j += 1; }
        }
        if (j >= n) unbalanced = true;
        word = (word ?? "") + out;
        i = j + 1;
        continue;
      }
      if (c === "'") {
        const close = text.indexOf("'", i + 1);
        if (close === -1) {
          unbalanced = true;
          word = (word ?? "") + text.slice(i + 1);
          i = n;
          continue;
        }
        word = (word ?? "") + text.slice(i + 1, close);
        i = close + 1;
        continue;
      }
      if (c === "\"") {
        i += 1;
        word = word ?? "";
        let closed = false;
        while (i < n) {
          const d = text[i];
          if (d === "\"") { closed = true; i += 1; break; }
          if (d === "`" && powershell) { word += i + 1 < n ? text[i + 1] : ""; i += 2; continue; }
          if (d === "\\" && !powershell) {
            const next = text[i + 1];
            if (next === "\n") { i += 2; continue; }
            if (next === "\"" || next === "\\" || next === "$" || next === "`") { word += next; i += 2; continue; }
            word += d;
            i += 1;
            continue;
          }
          if (d === "$" && text[i + 1] === "(") { i = sequence(i + 2, ")"); continue; }
          if (d === "`" && !powershell) { i = sequence(i + 1, "`"); continue; }
          word += d;
          i += 1;
        }
        if (!closed) unbalanced = true;
        continue;
      }
      if (c === "<" || c === ">") {
        // A bare number glued to the operator is a file descriptor (`2>&1`), not an argument.
        if (word !== null && /^\d+$/u.test(word)) word = null; else finishWord();
        if (text[i + 1] === "(" && !powershell) {
          i = sequence(i + 2, ")");
          continue;
        }
        let j = i + 1;
        while (j < n && (text[j] === "<" || text[j] === ">" || text[j] === "&" || text[j] === "|")) j += 1;
        if (text[j] === "-" && text.slice(i, j) === "<<") j += 1;
        skipNext = true;
        i = j;
        continue;
      }
      word = (word ?? "") + c;
      i += 1;
    }
    finishCommand();
    if (end !== null) unbalanced = true;
    return n;
  }

  sequence(0, null);
  return { commands, unbalanced };
}

/** Conservative fallback for text the careful pass cannot trust: quotes group nothing, every separator splits. */
function tokenizeNaive(text) {
  const commands = [];
  for (const part of text.split(/[\n;|&()`<>]/u)) {
    const words = part.split(/\s+/u).map((word) => word.replace(/['"]/gu, "")).filter((word) => word !== "");
    if (words.length > 0) commands.push({ words, targets: [] });
  }
  return commands;
}

function commandName(word) {
  const last = word.split(/[\\/]/u).pop() ?? "";
  return last.replace(/\.exe$/iu, "").toLowerCase();
}

function splitWords(value) {
  try {
    const { commands } = tokenize(value, false);
    return commands.flatMap((command) => command.words);
  } catch {
    return value.split(/\s+/u).filter((word) => word !== "");
  }
}

// ENVDUMP ruling 51 (critic finding ENV-D1): the classifier must not be exhaustible by an adversarial `env` chain -- a crashed
// PreToolUse hook does not block, so an unbounded recursion would turn a hostile command into an admitted one. ONE nesting
// counter is shared by the two ways a chain deepens: the hop from an `env` to its command operand (`dumpRuleAt`) and the splice
// of a `-S`/`--split-string` value into the argv (`envCommandOperand`). The counter is never decremented: the chain is linear, so
// the count IS the depth. Beyond ENV_NESTING_LIMIT the classifier stops following it and answers "dump" (fail closed): no real
// command needs an `env` chain that deep, and a refusal there is an error the author can read, not a crash nobody sees.
// Operands are handled by (words, index) so a long flat chain is walked in place; the only copy left is the splice of a `-S`
// value, which the same counter bounds.
const ENV_NESTING_LIMIT = 32;
export const ENV_NESTING_LIMIT_RULE = "env-nesting-limit";
export const ENV_CLASSIFIER_ERROR_RULE = "env-classifier-error";
const NESTING_EXCEEDED = Symbol("env-nesting-exceeded");

/** Counts one more level on the shared counter; false once the chain is deeper than ENV_NESTING_LIMIT. */
function enterNesting(nesting) {
  nesting.depth += 1;
  return nesting.depth <= ENV_NESTING_LIMIT;
}

/**
 * `env` prints the environment unless it is given a command operand; options and NAME=VALUE words are not one. Scans
 * `words` from index `from` and returns { words, index, spliced }: the command `env` would run starts at `words[index]`
 * (`spliced` is true when `words` was built from a `-S` value and so may still hold empty words). Returns null when there is
 * no command operand, and NESTING_EXCEEDED when the shared counter ran out.
 */
function envCommandOperand(words, from, nesting) {
  let argv = words;
  let i = from;
  let spliced = false;
  let optionsEnded = false;
  // Replaces everything before `resumeAt` with the words of the `-S` value, then rescans from the start (a `-S` value is
  // re-parsed as env arguments). False when the shared counter is spent.
  const splice = (value, resumeAt) => {
    if (!enterNesting(nesting)) return false;
    const next = splitWords(value);
    for (let k = resumeAt; k < argv.length; k += 1) next.push(argv[k]);
    argv = next;
    i = 0;
    spliced = true;
    optionsEnded = false;
    return true;
  };
  scan: while (i < argv.length) {
    const arg = argv[i];
    if (!optionsEnded && arg === "--") { optionsEnded = true; i += 1; continue; }
    if (!optionsEnded && arg.length > 1 && arg.startsWith("-")) {
      if (arg.startsWith("--")) {
        const equals = arg.indexOf("=");
        const name = equals === -1 ? arg : arg.slice(0, equals);
        if (name === "--split-string") {
          const value = equals === -1 ? (argv[i + 1] ?? "") : arg.slice(equals + 1);
          if (!splice(value, equals === -1 ? i + 2 : i + 1)) return NESTING_EXCEEDED;
          continue;
        }
        i += equals === -1 && (name === "--unset" || name === "--chdir" || name === "--argv0") ? 2 : 1;
        continue;
      }
      const body = arg.slice(1);
      let consumed = 1;
      for (let p = 0; p < body.length; p += 1) {
        const flag = body[p];
        if (flag === "S") {
          const attached = body.slice(p + 1);
          const value = attached !== "" ? attached : (argv[i + 1] ?? "");
          if (!splice(value, attached !== "" ? i + 1 : i + 2)) return NESTING_EXCEEDED;
          continue scan;
        }
        if (flag === "u" || flag === "C" || flag === "a") {
          if (p === body.length - 1) consumed = 2;
          break;
        }
      }
      i += consumed;
      continue;
    }
    if (ASSIGNMENT_WORD.test(arg)) { i += 1; continue; }
    return { words: argv, index: i, spliced };
  }
  return null;
}

/** `node`/`deno`/`bun` `-e`/`-p`/`--eval`/`--print` whose script reads the whole `process.env` object. */
function runtimeEvalReadsWholeEnvironment(args) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    let script = null;
    if (arg === "-e" || arg === "-p" || arg === "--eval" || arg === "--print" || arg === "-pe" || arg === "-ep") script = args[i + 1] ?? "";
    else if (arg.startsWith("--eval=") || arg.startsWith("--print=")) script = arg.slice(arg.indexOf("=") + 1);
    if (script !== null && WHOLE_PROCESS_ENV.test(script)) return true;
  }
  return false;
}

function mentionsProcEnviron(word) {
  return word.includes("/proc/") && word.includes("/environ");
}

/** Returns a short rule label when this one simple command prints the environment, otherwise null. */
function dumpRule(command, powershell) {
  return dumpRuleAt(command.words.filter((word) => word !== ""), 0, command.targets, powershell, { depth: 0 }, false);
}

/**
 * Classifies the simple command whose words are `allWords[from..]` (`targets` are its redirect targets, only visible to the
 * `/proc/.../environ` path rule). `nesting` is the one counter shared with `envCommandOperand` (see ENV_NESTING_LIMIT).
 * `spliced` says `allWords` came from a `-S` value and may hold empty words, which are dropped before classification exactly
 * as the top-level filter drops them.
 */
function dumpRuleAt(allWords, from, targets, powershell, nesting, spliced) {
  for (let k = from; k < allWords.length; k += 1) if (mentionsProcEnviron(allWords[k])) return "proc-environ";
  if (targets.some(mentionsProcEnviron)) return "proc-environ";
  let words = allWords;
  let start = from;
  if (spliced) {
    words = [];
    for (let k = from; k < allWords.length; k += 1) if (allWords[k] !== "") words.push(allWords[k]);
    start = 0;
  }
  let first = start;
  while (first < words.length && ASSIGNMENT_WORD.test(words[first])) first += 1;
  if (first >= words.length) return null;
  const name = commandName(words[first]);
  if (name === "env") {
    // `env` runs its command operand with the full environment: no operand prints it, and an operand that is itself a dump
    // (`env printenv`, `env FOO=1 env`) prints it too. The operand is classified by this same rule and its label returned;
    // a chain deeper than ENV_NESTING_LIMIT is not followed any further and is refused as a dump.
    const operand = envCommandOperand(words, first + 1, nesting);
    if (operand === NESTING_EXCEEDED) return ENV_NESTING_LIMIT_RULE;
    if (operand === null) return "env-without-command";
    if (!enterNesting(nesting)) return ENV_NESTING_LIMIT_RULE;
    return dumpRuleAt(operand.words, operand.index, [], powershell, nesting, operand.spliced);
  }
  const args = words.slice(first + 1);
  switch (name) {
    case "printenv": return "printenv";
    case "set": return args.length === 0 ? "set-without-arguments" : null;
    case "export": return args.length === 0 || args.some((arg) => /^-[A-Za-z]*p[A-Za-z]*$/u.test(arg)) ? "export-listing" : null;
    case "declare":
    case "typeset":
      return args.length === 0 || args.some((arg) => /^-[A-Za-z]*[xp][A-Za-z]*$/u.test(arg)) ? "declare-listing" : null;
    case "node":
    case "deno":
    case "bun":
      return runtimeEvalReadsWholeEnvironment(args) ? "runtime-eval-process-env" : null;
    default: break;
  }
  if (powershell && POWERSHELL_ENV_LISTERS.has(name) && args.some((arg) => POWERSHELL_ENV_DRIVE.test(arg))) return "powershell-env-drive";
  return null;
}

/** Rule label for the first environment-printing simple command in `command`, or null. */
export function envDumpRule(command, toolName) {
  if (typeof command !== "string") return null;
  const powershell = toolName === "PowerShell";
  if (powershell && POWERSHELL_GET_ENVIRONMENT_VARIABLES.test(command)) return "powershell-get-environment-variables";
  let parsed;
  try {
    parsed = tokenize(command, powershell);
  } catch {
    parsed = { commands: tokenizeNaive(command), unbalanced: false };
  }
  const commands = parsed.unbalanced ? tokenizeNaive(command) : parsed.commands;
  for (const simple of commands) {
    const rule = dumpRule(simple, powershell);
    if (rule !== null) return rule;
  }
  return null;
}

/**
 * The GUARD-ENV-DUMP refusal, or null when the command does not print the environment. No override guidance and an empty
 * retryActions envelope on purpose: nothing lifts this refusal, so nothing is advertised.
 */
export function envDumpShellRefusal(command, toolName) {
  const rule = envDumpRule(command, toolName);
  if (rule === null) return null;
  return envDumpRefusal(rule);
}

/**
 * The same GUARD-ENV-DUMP refusal for a classifier that threw (ruling 51: fail closed). The caller cannot tell whether the
 * command prints the environment, so it is refused as if it did, under its own rule label.
 */
export function envDumpClassifierErrorRefusal() {
  return envDumpRefusal(ENV_CLASSIFIER_ERROR_RULE);
}

function envDumpRefusal(rule) {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${ENV_DUMP_DENIAL_CODE}: ${ENV_DUMP_DENIAL_GUIDANCE} (matched: ${rule}).\n`
      + `${JSON.stringify({ schema: "pipeline.guard-retry-actions.v1", retryActions: [] })}\n`,
  );
}
