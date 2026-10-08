// SPDX-License-Identifier: SUL-1.0
/**
 * gh-cmd.mjs -- the `gh` delivery classifier (PR-S1, slice 1 of pull request as a second delivery mode).
 *
 * Source: PO decision AN (specs/sprint-alfred-epic/plans/po-decisions-2026-10-07.md row AN) and the design note
 * specs/sprint-alfred-epic/design/pr-delivery-mode-2026-10-08.md, section 2 ("Common to all (slice 1)") and section 3
 * (test-first order, item 1). Under AN a pull request joins push as a second delivery mode; platform merge and
 * artifact hand-off are refused as typed "unsupported", never silently allowed. Pinned by gh-cmd.test.mjs.
 *
 * `gh release create` is NOT reclassified here: it keeps its documented separate authority (the PO approval described
 * in docs/push-release-flow.md). It is not an artifact hand-off and not read-only; as an unknown `gh` shape it falls
 * to the fail-closed DELIVERY-GH-UNCLASSIFIED refusal, which carries a `reason` naming that separate authority.
 *
 * NOT WIRED into any hook or caller. This module is a pure classifier; calling it from guard-push.mjs (and from every
 * other caller of commandIsGitPush) is a later, signed slice.
 *
 * DEPENDENCY-FREE LIBRARY: pure string-in/object-out, no node:fs or node:child_process. The only import is the shell
 * splitter of ./git-cmd.mjs, so a quote, an escape, a comment or a here-document is read exactly as the push
 * classifier reads it.
 *
 * Shape (an ALLOWLIST plus a fail-closed marker rule, in the style of commandIsGitPush in ./git-cmd.mjs):
 *   classifyGhCommand(command) -> one of
 *     { kind: "none" }                                  no `gh` invocation (a `gh` ARGUMENT, `echo gh pr merge 1`, is data)
 *     { kind: "read-only" }                             a `gh` invocation that cannot deliver or mutate
 *     { kind: "delivery", action: "pr-create", ... }    the one admitted delivery action of this slice
 *     { kind: "refused", code, reason }                 code is a member of GH_DELIVERY_CODES
 * A compound command is split into simple commands and the MOST SEVERE result wins:
 * refused > delivery > read-only > none.
 *
 * The rule, in order (per reading of a backslash, see READINGS):
 *   1. GH WORD. `gh` or `gh.exe` at an executable boundary of the raw text, of the dequoted view, or of any dequoted
 *      word. No gh word, no further rule: the result is `none`.
 *   2. MARKERS (command-wide, like git-cmd.mjs): with a gh word present, any of these makes the result
 *      DELIVERY-GH-UNCLASSIFIED because the classifier cannot read what runs: `$` or a backtick outside single quotes
 *      (substitution, expansion), an unquoted `(` `)` or `{` (subshell, group, brace expansion), a here-document body
 *      holding `$` or a backtick, a non-ASCII quote character, an unterminated or escaped-quote-outside-quotes shape,
 *      a here-document fed to a shell or interpreter that carries a gh word. Quoted text is data: the GraphQL query
 *      of `gh api graphql -f query='mutation{...}'` holds braces and parentheses and is read, not refused.
 *   3. SIMPLE COMMANDS. The text is split at unquoted `;` `&` `|` and newlines (comments and here-document bodies
 *      left out, using the regions scanShell reports). The command word is found after leading `NAME=value`
 *      assignments, looking through transparent wrappers (env, sudo, time, xargs, then, do, ...). `gh` is recognised
 *      by the basename of the command word (`/usr/bin/gh`, `gh.exe`). A runner that takes a command as text (bash -c,
 *      eval, ssh, cmd /c, powershell, find, ...) with a gh word among its arguments is DELIVERY-GH-UNCLASSIFIED.
 *   4. ALLOWLIST. Only the read-only subcommands in READ_ONLY_SUBCOMMANDS are `read-only`; every other `gh` shape is
 *      DELIVERY-GH-UNCLASSIFIED. ACCEPTED FALSE POSITIVES (the cost of the marker rule, same as commandIsGitPush):
 *      `gh pr view $(git branch --show-current)` and `bash -c 'gh pr view 1'` are refused as unclassified.
 *
 * `gh api`: the method comes from `-X` / `--method` and defaults to GET; any `-f` `-F` `--field` `--raw-field`
 * `--input` implies POST when no method is given. A GraphQL call (`gh api graphql`) is judged by its query text: a
 * `mergePullRequest` / `enablePullRequestAutoMerge` mutation is a platform merge, any other mutation is an API
 * mutation, a query is read-only, a query that cannot be read (`@file`, `--input`) is unclassified.
 *
 * NOT modelled: a `gh` run through a script file, an alias or a function defined elsewhere, or a program that spawns
 * gh itself. Those never put a gh word in the command text; the gate that wires this module owns that residue.
 */
import { scanShell } from "./git-cmd.mjs";

export const GH_DELIVERY_CODES = Object.freeze([
  "DELIVERY-UNSUPPORTED-PLATFORM-MERGE",
  "DELIVERY-UNSUPPORTED-ARTIFACT-HANDOFF",
  "DELIVERY-UNSUPPORTED-API-MUTATION",
  "DELIVERY-UNSUPPORTED-PR-RETARGET",
  "DELIVERY-UNSUPPORTED-CROSS-REPO",
  "DELIVERY-PR-BINDING-INCOMPLETE",
  "DELIVERY-GH-UNCLASSIFIED",
]);

const [PLATFORM_MERGE, ARTIFACT_HANDOFF, API_MUTATION, PR_RETARGET, CROSS_REPO, BINDING_INCOMPLETE, UNCLASSIFIED] =
  GH_DELIVERY_CODES;

// The three readings of a backslash scanShell takes (see its header): a POSIX escape, a Windows path separator, the
// ordinary character PowerShell takes it for. Which shell a runner applies is not known, so classify under all three
// and keep the most severe result, as commandIsGitPush does.
const READING_POSIX = "posix";
const READING_WINDOWS_PATH = "windows-path";
const READING_POWERSHELL = "powershell";
const READINGS = [READING_POSIX, READING_WINDOWS_PATH, READING_POWERSHELL];

const NONE = Object.freeze({ kind: "none" });
const READ_ONLY = Object.freeze({ kind: "read-only" });
const SEVERITY = { none: 0, "read-only": 1, delivery: 2, refused: 3 };

const refused = (code, reason) => ({ kind: "refused", code, reason });
const unclassified = (reason) => refused(UNCLASSIFIED, reason);
const moreSevere = (a, b) => (SEVERITY[b.kind] > SEVERITY[a.kind] ? b : a);

// A `gh` / `gh.exe` word at a place an executable (or a quoted command string) can start.
const GH_WORD_RE = /(?:^|[\s;&|(){}`'"\\/<>=!,:@])gh(?:\.exe)?(?![\w.-])/iu;
const hasGhWord = (text) => GH_WORD_RE.test(text);
const NON_ASCII_QUOTE_RE = new RegExp("[\\u2018-\\u201F]", "u");
const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*\+?=/u;
const ESCAPABLE_RE = /[\s;&|()<>`$"'\\]/u;

// Wrappers that run the rest of their argument list as a command: look through them to the next executable.
const TRANSPARENT = new Set([
  "env", "command", "builtin", "exec", "sudo", "doas", "nohup", "time", "nice", "ionice", "timeout", "stdbuf", "setsid",
  "unbuffer", "xargs", "then", "do", "else", "elif", "if", "while", "until", "!", "call",
]);
// Runners that take a command (or a script) as TEXT or hand it to another process: a gh word among their arguments
// cannot be read, so it is unclassified. Shells, interpreters, remote and process launchers, alias definers.
const OPAQUE_RE =
  /^(?:(?:ba|z|da|k|c|tc|a)?sh|fish|cmd|pwsh|powershell|eval|source|\.|ssh|wsl|busybox|node|python[\d.]*|perl|ruby|php|lua|awk|gawk|find|watch|parallel|start|start-process|invoke-expression|iex|invoke-command|icm|npx|script|su|runas|at|batch|alias|set-alias|new-alias|sal|function|doskey|trap)$/u;

const commandBase = (word) => word.split(/[\\/]/u).pop().toLowerCase().replace(/\.exe$/u, "");
const isKnownExecutable = (base) => base === "gh" || TRANSPARENT.has(base) || OPAQUE_RE.test(base);

/**
 * One pass over the raw text that knows quotes: the simple commands (split at unquoted `;` `&` `|` newline), the first
 * marker found, and whether a quote never closed. Regions (comments, here-document bodies) come from scanShell and
 * are only honoured outside quotes.
 */
function lex(cmd, regions, reading) {
  const powershell = reading === READING_POWERSHELL;
  const windowsPath = reading === READING_WINDOWS_PATH;
  const segments = [];
  let current = "";
  let quote = null;
  let marker = null;
  const mark = (reason) => {
    if (marker === null) marker = reason;
  };
  let i = 0;
  while (i < cmd.length) {
    const region = quote === null ? regions.find((r) => i >= r.start && i < r.end) : undefined;
    if (region !== undefined) {
      if (region.kind === "heredoc-body" && /[$`]/u.test(cmd.slice(region.start, region.end))) {
        mark("a substitution in a here-document body");
      }
      i = region.end;
      continue;
    }
    const ch = cmd[i];
    if (quote === "'") {
      current += ch;
      if (ch === "'") quote = null;
      i += 1;
      continue;
    }
    if (quote === '"') {
      if (!powershell && ch === "\\" && i + 1 < cmd.length && '"\\$`\n'.includes(cmd[i + 1])) {
        current += cmd.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === "$" || ch === "`") mark("a substitution inside a double-quoted span");
      if (ch === '"') quote = null;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === "\\" && !powershell) {
      const next = cmd[i + 1];
      const width = next === undefined ? 1 : windowsPath && !ESCAPABLE_RE.test(next) ? 1 : 2;
      current += cmd.slice(i, i + width);
      i += width;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === "$" || ch === "`") mark("a shell expansion or command substitution");
    if (ch === "(" || ch === ")" || ch === "{") mark("a subshell, group or brace expansion");
    if (";&|\n\r".includes(ch)) {
      segments.push(current);
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  segments.push(current);
  return { segments, marker, unterminated: quote !== null };
}

/**
 * Flag parser for one gh subcommand. `spec` = { longValue:Set, longBool:Set, shortValue:Map(char -> long name),
 * shortBool:Map(char -> long name) }. Returns the values per long name (booleans as `true`), the positionals and
 * `unknown` when a flag is not in the spec or lacks its value (the caller then fails closed).
 */
function parseFlags(args, spec) {
  const values = new Map();
  const positionals = [];
  let unknown = false;
  const add = (name, value) => {
    if (!values.has(name)) values.set(name, []);
    values.get(name).push(value);
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      if (spec.longValue.has(name)) {
        if (eq !== -1) add(name, arg.slice(eq + 1));
        else if (i + 1 < args.length) {
          add(name, args[i + 1]);
          i += 1;
        } else unknown = true;
      } else if (spec.longBool.has(name) && eq === -1) add(name, true);
      else unknown = true;
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      for (let k = 1; k < arg.length; k += 1) {
        const c = arg[k];
        if (spec.shortBool.has(c)) {
          add(spec.shortBool.get(c), true);
          continue;
        }
        if (spec.shortValue.has(c)) {
          const name = spec.shortValue.get(c);
          const rest = arg.slice(k + 1);
          if (rest !== "") add(name, rest.startsWith("=") ? rest.slice(1) : rest);
          else if (i + 1 < args.length) {
            add(name, args[i + 1]);
            i += 1;
          } else unknown = true;
        } else unknown = true;
        break;
      }
      continue;
    }
    positionals.push(arg);
  }
  return { values, positionals, unknown };
}

const PR_CREATE_SPEC = {
  longValue: new Set([
    "title", "body", "body-file", "assignee", "label", "milestone", "project", "reviewer", "template", "head", "base",
    "repo", "recover",
  ]),
  longBool: new Set(["draft", "fill", "fill-first", "fill-verbose", "no-maintainer-edit", "web", "dry-run"]),
  shortValue: new Map([
    ["t", "title"], ["b", "body"], ["F", "body-file"], ["a", "assignee"], ["l", "label"], ["m", "milestone"],
    ["p", "project"], ["r", "reviewer"], ["T", "template"], ["H", "head"], ["B", "base"], ["R", "repo"],
  ]),
  shortBool: new Map([["d", "draft"], ["f", "fill"], ["w", "web"]]),
};

const API_SPEC = {
  longValue: new Set(["method", "raw-field", "field", "header", "hostname", "input", "jq", "template", "cache", "preview"]),
  longBool: new Set(["include", "paginate", "silent", "slurp", "verbose"]),
  shortValue: new Map([
    ["X", "method"], ["f", "raw-field"], ["F", "field"], ["H", "header"], ["q", "jq"], ["t", "template"], ["p", "preview"],
  ]),
  shortBool: new Map([["i", "include"]]),
};

const lastValue = (values, name) => {
  const all = values.get(name);
  return all === undefined ? undefined : all[all.length - 1];
};

function classifyPrCreate(args) {
  const { values, positionals, unknown } = parseFlags(args, PR_CREATE_SPEC);
  const head = lastValue(values, "head");
  const base = lastValue(values, "base");
  if (values.has("repo")) return refused(CROSS_REPO, "gh pr create names another repository (--repo)");
  if (typeof head === "string" && head.includes(":")) {
    return refused(CROSS_REPO, "gh pr create names an owner:branch head (fork or cross-repo pull request)");
  }
  if (unknown || positionals.length > 0) return unclassified("gh pr create with a flag or argument this classifier does not know");
  if (typeof head !== "string" || head === "" || typeof base !== "string" || base === "") {
    return refused(BINDING_INCOMPLETE, "gh pr create needs an explicit --head and --base");
  }
  return { kind: "delivery", action: "pr-create", head, base, draft: values.has("draft") };
}

function classifyPr(args) {
  const [sub, ...rest] = args;
  switch (sub) {
    case "merge":
      return refused(PLATFORM_MERGE, "gh pr merge is a platform merge");
    case "create":
      return classifyPrCreate(rest);
    case "edit":
      return rest.some((a) => a === "--base" || a.startsWith("--base=") || (/^-[^-]/u.test(a) && a.includes("B")))
        ? refused(PR_RETARGET, "gh pr edit --base would move an approved pull request")
        : unclassified("gh pr edit is not an admitted gh shape");
    case "view":
    case "list":
    case "status":
    case "checks":
    case "diff":
      return READ_ONLY;
    default:
      return unclassified("a gh pr subcommand outside the allowlist");
  }
}

const MERGE_MUTATION_RE = /\b(?:mergePullRequest|enablePullRequestAutoMerge)\b/u;
const MERGE_ENDPOINT_RE = /(?:^|\/)pulls\/[^/]+\/merge\/*$/iu;
const UPLOADS_HOST_RE = /(?:^|\/\/|\.)uploads\.github\.com(?:[/:]|$)/iu;

function classifyApi(args) {
  const { values, positionals, unknown } = parseFlags(args, API_SPEC);
  if (unknown || positionals.length !== 1) return unclassified("gh api with a flag or endpoint this classifier does not know");
  const endpoint = positionals[0];
  const path = endpoint.replace(/^https?:\/\/[^/]+/iu, "").replace(/[?#].*$/u, "").replace(/^\/+/u, "");
  const fields = ["raw-field", "field"].flatMap((name) => values.get(name) ?? []);
  const hasBody = fields.length > 0 || values.has("input");
  const explicit = lastValue(values, "method");
  const method = (typeof explicit === "string" && explicit !== "" ? explicit : hasBody ? "POST" : "GET").toUpperCase();
  const hosts = [endpoint, ...(values.get("hostname") ?? [])];
  if (method !== "GET" && hosts.some((h) => UPLOADS_HOST_RE.test(h))) {
    return refused(ARTIFACT_HANDOFF, "gh api to uploads.github.com hands an artifact over");
  }
  if (/^graphql$/iu.test(path)) {
    const queries = fields.filter((f) => f.startsWith("query="));
    if (values.has("input") || queries.length === 0 || queries.some((q) => q.startsWith("query=@"))) {
      return unclassified("a gh api graphql call whose query text cannot be read");
    }
    const text = fields.join("\n");
    if (MERGE_MUTATION_RE.test(text)) return refused(PLATFORM_MERGE, "a GraphQL pull request merge mutation");
    if (/\bmutation\b/u.test(text)) return refused(API_MUTATION, "a GraphQL mutation");
    return READ_ONLY;
  }
  if (method === "GET") return READ_ONLY;
  return MERGE_ENDPOINT_RE.test(path)
    ? refused(PLATFORM_MERGE, "a non-GET gh api call on a pull request merge endpoint")
    : refused(API_MUTATION, `a non-GET (${method}) gh api call`);
}

const READ_ONLY_SUBCOMMANDS = {
  issue: ["view", "list", "status"],
  repo: ["view", "list"],
  run: ["view", "list"],
  workflow: ["view", "list"],
  auth: ["status"],
  label: ["list"],
  cache: ["list"],
  ruleset: ["list", "view", "check"],
  variable: ["list", "get"],
  secret: ["list"],
  search: ["repos", "issues", "prs", "code", "commits"],
};
const READ_ONLY_TOP_LEVEL = new Set(["status", "version", "help"]);

/** Classify the arguments of a gh invocation (everything after the gh word). */
function classifyGhArgs(args) {
  if (args.length === 0) return READ_ONLY;
  const [top, ...rest] = args;
  if (top.startsWith("-")) {
    return args.length === 1 && ["--version", "--help", "-h"].includes(top)
      ? READ_ONLY
      : unclassified("a gh global flag this classifier does not know");
  }
  if (top === "api") return classifyApi(rest);
  if (top === "pr") return classifyPr(rest);
  const sub = rest[0];
  if (top === "release") {
    if (sub === "upload") return refused(ARTIFACT_HANDOFF, "gh release upload hands an artifact over");
    if (sub === "view" || sub === "list") return READ_ONLY;
    return unclassified(
      sub === "create"
        ? "gh release create keeps its separate PO-approval authority (docs/push-release-flow.md) and is not classified here"
        : "a gh release subcommand outside the allowlist",
    );
  }
  if (top === "gist") {
    if (sub === "create") return refused(ARTIFACT_HANDOFF, "gh gist create hands content over");
    if (sub === "view" || sub === "list") return READ_ONLY;
    return unclassified("a gh gist subcommand outside the allowlist");
  }
  if (READ_ONLY_TOP_LEVEL.has(top)) return READ_ONLY;
  if (READ_ONLY_SUBCOMMANDS[top]?.includes(sub)) return READ_ONLY;
  return unclassified("a gh command outside the read-only allowlist");
}

/** One simple command (dequoted words): find the command word and classify it. */
function classifySimple(words) {
  let index = 0;
  for (let hops = 0; hops < 16; hops += 1) {
    while (index < words.length && ASSIGNMENT_RE.test(words[index])) index += 1;
    if (index >= words.length) return NONE;
    const base = commandBase(words[index]);
    if (base === "gh") return classifyGhArgs(words.slice(index + 1));
    if (TRANSPARENT.has(base)) {
      const next = words.findIndex((w, k) => k > index && isKnownExecutable(commandBase(w)));
      if (next === -1) return NONE;
      index = next;
      continue;
    }
    if (OPAQUE_RE.test(base)) {
      return words.slice(index + 1).some(hasGhWord) ? unclassified("a gh word handed to a shell, interpreter or launcher") : NONE;
    }
    return NONE;
  }
  return unclassified("a wrapper chain too deep to read");
}

function classifyUnderReading(command, reading) {
  const scan = scanShell(command, reading);
  const ghWordPresent = hasGhWord(command) || hasGhWord(scan.view) || scan.words.some(hasGhWord);
  if (!ghWordPresent) return NONE;
  if (scan.unterminated || scan.escapedQuoteOutsideQuotes) {
    return unclassified("an unterminated quote or an escaped quote outside quotes beside a gh word");
  }
  if (NON_ASCII_QUOTE_RE.test(command)) return unclassified("a non-ASCII quote character beside a gh word");
  const lexed = lex(command, scan.regions, reading);
  if (lexed.marker !== null) return unclassified(`${lexed.marker} beside a gh word`);
  if (lexed.unterminated) return unclassified("an unterminated quote beside a gh word");
  // A here-document body is data unless a shell or interpreter receives it.
  const bodies = scan.regions.filter((r) => r.kind === "heredoc-body").map((r) => command.slice(r.start, r.end));
  if (bodies.some(hasGhWord) && scan.words.some((w) => OPAQUE_RE.test(commandBase(w)) || TRANSPARENT.has(commandBase(w)))) {
    return unclassified("a here-document with a gh word beside a shell, interpreter or wrapper");
  }
  let result = NONE;
  for (const segment of lexed.segments) {
    result = moreSevere(result, classifySimple(scanShell(segment, reading).words));
    if (result.kind === "refused") break;
  }
  return result;
}

/**
 * classifyGhCommand(command) -- see the header. Total: any non-string or empty input is `none`.
 */
export function classifyGhCommand(command) {
  if (typeof command !== "string" || command === "") return NONE;
  let result = NONE;
  for (const reading of READINGS) result = moreSevere(result, classifyUnderReading(command, reading));
  return result;
}
