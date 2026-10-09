// SPDX-License-Identifier: SUL-1.0
// TR-S2-F-20261009 / TR-S2-F2b-20261009 -- pure execution-lane credential classifier (TR-S2, BK 2).
//
// Contract: toil-resolution note section 3.4 "TR-S2" (revision a3), Ruling 76(a), and the Critic-round
// rulings 90 (F1-F7, cwd, exemptScripts), 97 and 106 (secretPatterns apply to file operands only); the pins are
// lib/execution-lane-credential.test.mjs (header assumptions 1-15).
//
//   classifyExecutionLaneCredential({ command, tool, targets, readScript })
//     -> null                                   the command is admitted
//     -> { refused: true, code, lane, reason }  the command names a protected credential target
//
// Properties:
//   - PURE and SYNCHRONOUS: no file-system access and no process spawning. The only outside input is the
//     injected, bounded `readScript(path) -> string | null`.
//   - NEVER THROWS: every fault (a throwing reader, malformed targets, a bad input, a stack overflow)
//     becomes a refusal. A fault is never an admission (I7).
//   - EVERY EXECUTABLE: all argv tokens of every segment are matched, not a list of interpreters.
//   - NESTED CARRIERS are scanned again: node -e/-p, python -c, bash/sh/dash/zsh -c (incl. -lc),
//     wsl.exe argv, powershell/pwsh -Command/-c/-File, cmd /c /k. Nesting deeper than MAX_DEPTH refuses.
//     A wsl.exe argv pass-through re-uses tokens and does not count as a level; an inline string or a
//     script's content that is scanned again does. A wrapper (env, sudo, timeout, ...) is looked through by
//     seeking forward to the first token that names a known carrier or search tool (F5).
//   - SCRIPT OPERANDS: the classifier is given no repository root, so it cannot tell an in-root script
//     from any other. It reads the script operands of every carrier through `readScript`: the first operand
//     of a shell, python or PowerShell -File carrier; the first positional .ps1 of a PowerShell carrier (F4);
//     the -r/--require/--import/--loader/--experimental-loader values and EVERY positional of node unless
//     -e/-p supplies the source (F5). An unreadable operand (null, a non-string, or a throw) refuses
//     (Ruling 76(a): an unreadable script cannot be cleared). The path handed to the reader is the absolute
//     native spelling when the operand names one (so the /mnt/<drive>/ spelling of an in-root path becomes
//     <D>:/...), the cwd-resolved path after a `cd` moved the working directory, else the operand.
//   - EXEMPT SCRIPTS (F2): `targets.exemptScripts` is a closed list of repo-relative paths whose CONTENT is
//     not scanned. A listed path matches exactly and case-sensitively on the normalised repo-relative operand,
//     at the point the content would be read, and only while no `cd` has moved the working directory. The
//     command line itself is always scanned.
//   - PowerShell encoded commands refuse outright (F1): a separate first pass over EVERY argv token of the
//     carrier, after positionals and after -Command/-File too, refuses any token that prefix-matches
//     EncodedCommand (minimum -e, plus -ec; the -, / and -- prefixes; an optional :/= value). -ea is the
//     -ErrorAction alias and is NOT part of that pass; it keeps its own-flag handling.
//   - SECRET PATTERNS (F3): `targets.secretPatterns` ({ suffixes, prefixes }, a closed set of kinds) match
//     the case-insensitive basename of a token in a FILE-OPERAND position, bare or directory-qualified.
//     They never apply to a pattern argument of rg, grep, git grep or Select-String (the first positional
//     only while no -e/--regexp/-f/--file/-Pattern supplies the pattern; the -e/--regexp value always), and
//     never to a token a carrier hands to a nested scan (-c text, node -e source, PowerShell command text,
//     the wsl pass-through, the cmd /c tail): those are scanned again as commands of their own.
//   - BASH ESCAPES (F6): under a sh syntax the text is also scanned with `text.replace(/\\([\s\S]?)/g, "$1")`
//     applied outside single quotes; either reading refuses.
//   - PowerShell -Name:value (F7): the value after the first colon is checked like an operand.
//   - WORKING DIRECTORY: `targets.cwd` (absolute) resolves relative tokens for ROOT matching only; the exact
//     secret-basename rule always sees the token as written. A plain `cd <path>` segment updates the cwd
//     after that segment's own scan.
//
// Known residuals (unchanged by this slice; wiring and tranche decide): dynamic constructs (variables,
// command substitution, globs in a directory component), a protected target reached through a script run
// by direct path rather than through a carrier, a carrier hidden inside a string argument of a
// non-carrier executable (path scanning still sees every path-like piece of such a string), scripts
// written in a language whose content is only path-scanned (node and python sources do not recurse into
// further carriers), and every cd form other than a plain `cd <path>` segment (cd -, subshell scoping).

const LANE = "execution-lane-credential";
const MAX_DEPTH = 3;
const MAX_TEXT = 4 * 1024 * 1024;

const KIND_CODES = Object.freeze({
  keyDirs: "ELC-KEY-DIRECTORY",
  credentialRoots: "ELC-CREDENTIAL-ROOT",
  machinePlaneRoots: "ELC-MACHINE-PLANE",
  secretBasenames: "ELC-SECRET-BASENAME",
});

class Refusal extends Error {
  constructor(code, reason) {
    super(reason);
    this.code = code;
    this.reason = reason;
  }
}

const refuse = (code, reason) => new Refusal(code, reason);

// --- path normalisation ----------------------------------------------------------------------------

function resolveSegments(path) {
  const kept = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") kept.pop();
    else kept.push(segment);
  }
  return kept.join("/");
}

// /mnt/<d>/..., /cygdrive/<d>/... and the MSYS /<d>/... spelling all name <D>:/...
function mapMountedPosix(posix) {
  const match = /^\/(?:(?:mnt|cygdrive)\/)?([A-Za-z])(?:\/(.*))?$/.exec(posix);
  return match ? `${match[1].toUpperCase()}:/${match[2] ?? ""}` : posix;
}

// Input uses forward slashes only. Returns every absolute interpretation (possibly none).
function absoluteForms(slashed) {
  let text = slashed;
  const device = /^\/\/[?.]\/(.*)$/.exec(text);
  if (device) {
    text = device[1];
    const unc = /^UNC\/(.*)$/i.exec(text);
    if (unc) text = `//${unc[1]}`;
  }
  text = text.replace(/^\/([A-Za-z]:\/)/, "$1");
  const drive = /^([A-Za-z]):\/(.*)$/.exec(text);
  if (drive) return [`${drive[1].toUpperCase()}:/${resolveSegments(drive[2])}`];
  const wslUnc = /^\/\/(?:wsl\$|wsl\.localhost)\/[^/]+(?:\/(.*))?$/i.exec(text);
  if (wslUnc) return [mapMountedPosix(`/${resolveSegments(wslUnc[1] ?? "")}`)];
  const forms = [];
  if (text.startsWith("//")) forms.push(`//${resolveSegments(text)}`);
  if (text.startsWith("/")) forms.push(mapMountedPosix(`/${resolveSegments(text)}`));
  return forms;
}

function isInside(candidate, root) {
  if (candidate === root) return true;
  return candidate.startsWith(root.endsWith("/") ? root : `${root}/`);
}

// A repo-relative spelling for the exemptScripts rule: backslashes are separators, "." and empty segments
// drop, ".." pops; anything absolute, home-relative, variable-bearing or escaping the root is null.
function normaliseRepoRelative(operand) {
  if (typeof operand !== "string" || operand === "" || /[$%]/.test(operand) || operand.startsWith("~")) return null;
  const slashed = operand.replace(/\\/g, "/");
  if (slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed)) return null;
  const kept = [];
  for (const segment of slashed.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (kept.length === 0) return null;
      kept.pop();
    } else {
      kept.push(segment);
    }
  }
  return kept.join("/");
}

// --- targets ---------------------------------------------------------------------------------------

function stringList(value, label) {
  if (!Array.isArray(value)) throw refuse("ELC-TARGETS-INVALID", `${label} is not an array`);
  const list = [];
  for (const entry of value) {
    if (entry === null || entry === undefined || entry === "") continue;
    if (typeof entry !== "string") throw refuse("ELC-TARGETS-INVALID", `${label} holds a non-string`);
    list.push(entry);
  }
  return list;
}

function buildEnvironment(targets) {
  if (targets === null || typeof targets !== "object" || Array.isArray(targets)) {
    throw refuse("ELC-TARGETS-INVALID", "targets is missing or not an object");
  }
  const roots = [];
  for (const kind of ["keyDirs", "credentialRoots", "machinePlaneRoots"]) {
    const list = targets[kind];
    if (!Array.isArray(list)) throw refuse("ELC-TARGETS-INVALID", `targets.${kind} is not an array`);
    for (const entry of list) {
      if (entry === null || entry === undefined || entry === "") continue;
      if (typeof entry !== "string") throw refuse("ELC-TARGETS-INVALID", `targets.${kind} holds a non-string`);
      const forms = absoluteForms(entry.replace(/\\/g, "/"));
      if (forms.length === 0) throw refuse("ELC-TARGETS-INVALID", `targets.${kind} holds a non-absolute path`);
      roots.push({ kind, forms: forms.map((form) => form.toLowerCase()) });
    }
  }
  if (!Array.isArray(targets.secretBasenames)) {
    throw refuse("ELC-TARGETS-INVALID", "targets.secretBasenames is not an array");
  }
  const secrets = new Set();
  for (const entry of targets.secretBasenames) {
    if (entry === null || entry === undefined || entry === "") continue;
    if (typeof entry !== "string") throw refuse("ELC-TARGETS-INVALID", "targets.secretBasenames holds a non-string");
    secrets.add(entry.toLowerCase());
  }
  const homes = targets.homes;
  if (homes === null || typeof homes !== "object" || Array.isArray(homes)) {
    throw refuse("ELC-TARGETS-INVALID", "targets.homes is missing or not an object");
  }
  const homeOf = (value, label) => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value !== "string") throw refuse("ELC-TARGETS-INVALID", `targets.homes.${label} is not a string`);
    const forms = absoluteForms(value.replace(/\\/g, "/"));
    if (forms.length === 0) throw refuse("ELC-TARGETS-INVALID", `targets.homes.${label} is not absolute`);
    return forms[forms.length - 1].replace(/\/+$/, "");
  };

  // F3: a closed { suffixes, prefixes } set. Absent means none; anything present must be exactly that shape.
  let patterns = null;
  if (targets.secretPatterns !== undefined) {
    const given = targets.secretPatterns;
    if (given === null || typeof given !== "object" || Array.isArray(given)) {
      throw refuse("ELC-TARGETS-INVALID", "targets.secretPatterns is not an object");
    }
    if (Object.keys(given).some((key) => key !== "suffixes" && key !== "prefixes")) {
      throw refuse("ELC-TARGETS-INVALID", "targets.secretPatterns holds an unknown key");
    }
    patterns = {
      suffixes: stringList(given.suffixes, "targets.secretPatterns.suffixes").map((entry) => entry.toLowerCase()),
      prefixes: stringList(given.prefixes, "targets.secretPatterns.prefixes").map((entry) => entry.toLowerCase()),
    };
  }

  // F2: a closed list of repo-relative paths whose content is not scanned.
  const exempt = new Set();
  if (targets.exemptScripts !== undefined) {
    for (const entry of stringList(targets.exemptScripts, "targets.exemptScripts")) {
      const relative = normaliseRepoRelative(entry);
      if (relative === null || relative === "") {
        throw refuse("ELC-TARGETS-INVALID", "targets.exemptScripts holds a path that is not repo-relative");
      }
      exempt.add(relative);
    }
  }

  // cwd: an absolute path, supplied as an input so the module stays pure.
  let cwd = null;
  if (targets.cwd !== undefined) {
    if (typeof targets.cwd !== "string") throw refuse("ELC-TARGETS-INVALID", "targets.cwd is not a string");
    const forms = absoluteForms(targets.cwd.replace(/\\/g, "/"));
    if (forms.length === 0) throw refuse("ELC-TARGETS-INVALID", "targets.cwd is not an absolute path");
    cwd = forms[0];
  }

  return {
    roots,
    secrets,
    patterns,
    exempt,
    cwd,
    homeNative: homeOf(homes.native, "native"),
    homeWsl: homeOf(homes.wsl, "wsl"),
  };
}

function homeFor(ctx, env) {
  const home = ctx.inWsl ? env.homeWsl : env.homeNative;
  if (!home) {
    throw refuse(
      "ELC-HOME-UNRESOLVED",
      `no ${ctx.inWsl ? "WSL" : "native"} home is known, so a home-relative path cannot be cleared`,
    );
  }
  return home;
}

// --- candidate extraction and matching -------------------------------------------------------------

function substituteEnv(text, ctx, env) {
  if (!text.includes("$") && !text.includes("%")) return text;
  const native = (suffix) => {
    if (!env.homeNative) throw refuse("ELC-HOME-UNRESOLVED", "no native home is known");
    return env.homeNative + suffix;
  };
  return text
    .replace(/\$\{(?:env:)?HOME\}|\$(?:env:)?HOME(?![A-Za-z0-9_])/gi, () => homeFor(ctx, env))
    .replace(/%USERPROFILE%|\$\{(?:env:)?USERPROFILE\}|\$(?:env:)?USERPROFILE(?![A-Za-z0-9_])/gi, () => native(""))
    .replace(
      /%LOCALAPPDATA%|\$\{(?:env:)?LOCALAPPDATA\}|\$(?:env:)?LOCALAPPDATA(?![A-Za-z0-9_])/gi,
      () => native("/AppData/Local"),
    )
    .replace(/%APPDATA%|\$\{(?:env:)?APPDATA\}|\$(?:env:)?APPDATA(?![A-Za-z0-9_])/gi, () => native("/AppData/Roaming"));
}

// An option-attached form (--opt=<p>, file:<p>, @<p>, a file URL, a PowerShell -Name:<p>) is peeled until it
// stops changing.
function variantsOf(text) {
  const seen = new Set([text]);
  const queue = [text];
  while (queue.length > 0 && seen.size < 24) {
    const current = queue.shift();
    const next = [current.replace(/^[{}]+|[{}]+$/g, "")];
    if (current.startsWith("@")) next.push(current.slice(1));
    const option = /^[^=/\\\s]*=([\s\S]+)$/.exec(current);
    if (option) next.push(option[1]);
    const fileUrl = /^file:\/\/([\s\S]*)$/i.exec(current);
    if (fileUrl) next.push(fileUrl[1]);
    const label = /^[A-Za-z][A-Za-z0-9_.+-]+:(?!\/\/)([\s\S]+)$/.exec(current);
    if (label) next.push(label[1]);
    const powershellParameter = /^--?[A-Za-z][A-Za-z0-9_-]*:(.+)$/.exec(current);
    if (powershellParameter) next.push(powershellParameter[1]);
    for (const item of next) {
      if (item !== "" && !seen.has(item)) {
        seen.add(item);
        queue.push(item);
      }
    }
  }
  return seen;
}

// Returns the kind of protected target a candidate names, or null. The working directory resolves a relative
// candidate for ROOT matching only; the exact secret-basename rule needs a directory component AS WRITTEN.
function matchCandidate(candidate, ctx, env) {
  let text = candidate;
  if (text === "~" || /^~[\\/]/.test(text)) text = homeFor(ctx, env) + text.slice(1);
  const slashed = text.replace(/\\/g, "/");
  // A bare secret basename is admitted; a directory component (including "./") plus the basename is not.
  const trimmed = slashed.replace(/\/+$/, "");
  const cut = trimmed.lastIndexOf("/");
  if (cut >= 0 && env.secrets.has(trimmed.slice(cut + 1).toLowerCase())) return "secretBasenames";
  let forms = absoluteForms(slashed);
  if (forms.length === 0 && ctx.cwd) forms = absoluteForms(`${ctx.cwd}/${slashed}`);
  for (const form of forms) {
    const lower = form.toLowerCase();
    for (const root of env.roots) {
      for (const rootForm of root.forms) {
        if (isInside(lower, rootForm)) return root.kind;
      }
    }
  }
  return null;
}

// F3: the case-insensitive basename of a file operand, bare or directory-qualified.
function matchesSecretPattern(candidate, env) {
  if (!env.patterns) return false;
  const trimmed = candidate.replace(/\\/g, "/").replace(/\/+$/, "");
  const base = trimmed.slice(trimmed.lastIndexOf("/") + 1).toLowerCase();
  if (base === "") return false;
  return env.patterns.suffixes.some((suffix) => base.endsWith(suffix)) ||
    env.patterns.prefixes.some((prefix) => base.startsWith(prefix));
}

// `withPatterns` is true only for a token in a file-operand position; the roots and exact names always apply.
function checkToken(text, ctx, env, withPatterns) {
  if (text === "") return;
  for (const variant of variantsOf(substituteEnv(text, ctx, env))) {
    const kind = matchCandidate(variant, ctx, env);
    if (kind) throw refuse(KIND_CODES[kind], `the command names a protected target (${kind})`);
    if (withPatterns && matchesSecretPattern(variant, env)) {
      throw refuse("ELC-SECRET-PATTERN", "the command names a file whose name matches a secret pattern");
    }
  }
}

const checkCandidates = (text, ctx, env) => checkToken(text, ctx, env, false);

const DELIMITERS = /[\s'"`;|&<>(),[\]]+/;
const LITERALS = /'([^'\n]*)'|"([^"\n]*)"/g;

// Whole-text harvest: every delimiter-separated piece and every quoted literal (a literal may hold spaces).
// The secret patterns never apply here: a harvested piece has no operand position.
function harvest(text, ctx, env) {
  for (const piece of text.split(DELIMITERS)) checkCandidates(piece, ctx, env);
  for (const match of text.matchAll(LITERALS)) checkCandidates(match[1] ?? match[2], ctx, env);
}

// F6: bash removes a backslash and keeps the next character, except inside single quotes.
function unescapeOutsideSingleQuotes(text) {
  let out = "";
  let single = false;
  let double = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (single) {
      out += c;
      if (c === "'") single = false;
      continue;
    }
    if (c === "\\") {
      if (i + 1 < text.length) {
        out += text[i + 1];
        i += 1;
      }
      continue;
    }
    if (c === "'" && !double) single = true;
    else if (c === '"') double = !double;
    out += c;
  }
  return out;
}

// --- tokenizer -------------------------------------------------------------------------------------

// Backslashes are path separators here and never escape, except \" inside a shell double-quoted string
// (nested quoting) and \" or \' outside quotes. PowerShell escapes with the backtick.
function tokenize(text, syntax) {
  const segments = [];
  let segment = [];
  let buffer = "";
  let has = false;
  const endToken = () => {
    if (has) segment.push(buffer);
    buffer = "";
    has = false;
  };
  const endSegment = () => {
    endToken();
    if (segment.length > 0) segments.push(segment);
    segment = [];
  };
  const ps = syntax === "ps";
  const singleQuotes = syntax !== "cmd";
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "'" && singleQuotes) {
      has = true;
      const end = text.indexOf("'", i + 1);
      buffer += end < 0 ? text.slice(i + 1) : text.slice(i + 1, end);
      i = end < 0 ? text.length : end;
      continue;
    }
    if (c === '"') {
      has = true;
      let j = i + 1;
      for (; j < text.length; j += 1) {
        const d = text[j];
        if (d === '"') {
          if (ps && text[j + 1] === '"') {
            buffer += '"';
            j += 1;
            continue;
          }
          break;
        }
        if (ps && d === "`" && j + 1 < text.length) {
          j += 1;
          buffer += text[j];
          continue;
        }
        if (!ps && d === "\\" && text[j + 1] === '"') {
          j += 1;
          buffer += '"';
          continue;
        }
        buffer += d;
      }
      i = j;
      continue;
    }
    if (ps && c === "`") {
      if (i + 1 < text.length) {
        has = true;
        i += 1;
        buffer += text[i];
      }
      continue;
    }
    if (!ps && c === "\\" && (text[i + 1] === '"' || text[i + 1] === "'")) {
      has = true;
      i += 1;
      buffer += text[i];
      continue;
    }
    if (!ps && c === "$" && (text[i + 1] === "'" || text[i + 1] === '"')) continue;
    if (c === "\n") {
      endSegment();
      continue;
    }
    if (c === " " || c === "\t" || c === "\r" || /\s/.test(c)) {
      endToken();
      continue;
    }
    if (c === ";" || c === "&" || c === "|" || c === "(" || c === ")" || (!ps && c === "`")) {
      endSegment();
      continue;
    }
    if (c === "<" || c === ">") {
      endToken();
      continue;
    }
    buffer += c;
    has = true;
  }
  endSegment();
  return segments;
}

// --- carriers --------------------------------------------------------------------------------------

const SHELLS = new Set(["bash", "sh", "dash", "zsh", "ksh", "ash"]);
const WRAPPERS = new Set([
  "env", "sudo", "doas", "nohup", "time", "command", "exec", "builtin", "nice", "ionice", "stdbuf",
  "timeout", "xargs", "setsid",
]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const NODE_PRELOAD_FLAGS = new Set(["-r", "--require", "--import", "--loader", "--experimental-loader"]);
const NODE_VALUE_FLAGS = new Set(["-C", "--conditions", "--input-type", "--title"]);
const WSL_VALUE_FLAGS = new Set(["-d", "--distribution", "-u", "--user", "--cd", "--shell-type"]);
const PS_VALUE_FLAGS = [
  "executionpolicy", "windowstyle", "workingdirectory", "version", "inputformat", "outputformat",
  "configurationname", "custompipename", "settingsfile",
];

const SOURCE_ONLY = Object.freeze({ syntax: "sh", sourceOnly: true });
const SHELL_TEXT = Object.freeze({ syntax: "sh", sourceOnly: false });
const POWERSHELL_TEXT = Object.freeze({ syntax: "ps", sourceOnly: false });
const CMD_TEXT = Object.freeze({ syntax: "cmd", sourceOnly: false });

function descend(depth) {
  if (depth + 1 > MAX_DEPTH) throw refuse("ELC-DEPTH", `nesting is deeper than ${MAX_DEPTH}`);
  return depth + 1;
}

function exeInfo(token) {
  const base = token.replace(/\\/g, "/").split("/").pop().toLowerCase();
  return { name: base.replace(/\.exe$/, ""), isExe: base.endsWith(".exe") };
}

function carrierKind(name) {
  if (name === "node" || name === "nodejs") return "node";
  if (/^python[0-9.]*w?$/.test(name) || name === "py") return "python";
  if (SHELLS.has(name)) return "shell";
  if (name === "wsl") return "wsl";
  if (name === "powershell" || name === "pwsh") return "powershell";
  if (name === "cmd") return "cmd";
  return null;
}

const prefixOf = (full, name, minimum = 2) => name.length >= minimum && full.startsWith(name);

// The own-flag test of the flag walk below (-ea included: there it IS an encoded-arguments spelling).
function isEncodedName(name) {
  return name === "e" || name === "ec" || name === "ea" || prefixOf("encodedcommand", name) ||
    prefixOf("encodedarguments", name);
}

// F1: the token-wise pass. -ea is deliberately absent: it is the -ErrorAction alias.
function isEncodedCommandToken(token) {
  const match = /^(?:--|-|\/)([A-Za-z]+)(?:[:=][\s\S]*)?$/.exec(token);
  if (!match) return false;
  const name = match[1].toLowerCase();
  return name === "ec" || "encodedcommand".startsWith(name);
}

function psTakesValue(name) {
  return name === "ep" || name === "w" || name === "wd" || name === "v" ||
    PS_VALUE_FLAGS.some((full) => prefixOf(full, name));
}

function nested(text, patch, ctx, depth, env, io) {
  scanText(text, { ...ctx, ...patch }, descend(depth), env, io);
}

function scriptTarget(operand, ctx, env) {
  let text = substituteEnv(operand, ctx, env);
  if (text === "~" || /^~[\\/]/.test(text)) text = homeFor(ctx, env) + text.slice(1);
  const slashed = text.replace(/\\/g, "/");
  const forms = absoluteForms(slashed);
  if (forms.length > 0) return forms[0];
  // A `cd` moved the working directory, so a relative operand no longer names the file the caller expects.
  if (ctx.cwdMoved && ctx.cwd) {
    const moved = absoluteForms(`${ctx.cwd}/${slashed}`);
    if (moved.length > 0) return moved[0];
  }
  return text;
}

function readOperand(operand, patch, ctx, depth, env, io) {
  // F2: an exempt script is not read at all, but only while no `cd` has moved the working directory.
  if (!ctx.cwdMoved && env.exempt.size > 0) {
    const relative = normaliseRepoRelative(operand);
    if (relative !== null && env.exempt.has(relative)) return;
  }
  if (typeof io.readScript !== "function") throw refuse("ELC-FAULT", "no script reader was supplied");
  const content = io.readScript(scriptTarget(operand, ctx, env));
  if (typeof content !== "string") {
    throw refuse("ELC-SCRIPT-UNREADABLE", "a script operand could not be read, so it cannot be cleared");
  }
  nested(content, patch, ctx, depth, env, io);
}

// --- search tools (F3: the pattern argument is not a file operand) -------------------------------------

// Only genuinely value-taking options are listed. A boolean mis-listed as valued would swallow the real
// pattern and turn the first FILE operand into the exempt "pattern", which under-refuses.
const RG = Object.freeze({
  short: new Set(["A", "B", "C", "e", "f", "g", "j", "m", "M", "r", "t", "T", "E", "d"]),
  long: new Set([
    "after-context", "before-context", "context", "glob", "iglob", "type", "type-not", "type-add", "type-clear",
    "max-count", "threads", "max-columns", "max-depth", "maxdepth", "max-filesize", "replace", "encoding", "sort",
    "sortr", "colors", "color", "context-separator", "field-context-separator", "field-match-separator",
    "path-separator", "pre", "pre-glob", "engine", "dfa-size-limit", "regex-size-limit", "ignore-file",
    "hostname-bin", "hyperlink-format", "generate",
  ]),
  noPattern: new Set(["files", "type-list", "generate"]),
});
const GREP = Object.freeze({
  short: new Set(["A", "B", "C", "m", "d", "D", "e", "f"]),
  long: new Set([
    "after-context", "before-context", "context", "max-count", "include", "exclude", "exclude-from", "exclude-dir",
    "directories", "devices", "binary-files", "label", "group-separator",
  ]),
  noPattern: new Set(),
});
const GIT_GREP = Object.freeze({
  short: new Set(["A", "B", "C", "m", "e", "f"]),
  long: new Set([
    "after-context", "before-context", "context", "max-count", "max-depth", "threads", "open-files-in-pager",
  ]),
  noPattern: new Set(),
});

const GIT_VALUE_OPTIONS = new Set([
  "-C", "-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env", "--attr-source",
]);

// Index just after the `grep` subcommand of a `git` word, or -1.
function gitGrepFrom(argv, at) {
  let j = at + 1;
  while (j < argv.length) {
    const token = argv[j];
    if (GIT_VALUE_OPTIONS.has(token)) j += 2;
    else if (token.startsWith("-")) j += 1;
    else break;
  }
  return j < argv.length && argv[j] === "grep" ? j + 1 : -1;
}

const SELECT_STRING_PARAMETERS = new Map([
  ["pattern", "pattern"], ["path", "valued"], ["literalpath", "valued"], ["inputobject", "valued"],
  ["include", "valued"], ["exclude", "valued"], ["context", "valued"], ["encoding", "valued"],
  ["culture", "valued"], ["casesensitive", "switch"], ["simplematch", "switch"], ["quiet", "switch"],
  ["list", "switch"], ["notmatch", "switch"], ["allmatches", "switch"], ["raw", "switch"],
  ["noemphasis", "switch"], ["verbose", "switch"], ["debug", "switch"], ["erroraction", "valued"],
  ["warningaction", "valued"], ["informationaction", "valued"], ["errorvariable", "valued"],
  ["warningvariable", "valued"], ["informationvariable", "valued"], ["outvariable", "valued"],
  ["outbuffer", "valued"], ["pipelinevariable", "valued"], ["progressaction", "valued"],
]);
const SELECT_STRING_ALIASES = new Map([
  ["ea", "valued"], ["wa", "valued"], ["ia", "valued"], ["ev", "valued"], ["wv", "valued"], ["iv", "valued"],
  ["ov", "valued"], ["ob", "valued"], ["pv", "valued"], ["vb", "switch"], ["db", "switch"],
]);

// An exact name or alias wins; otherwise a unique prefix; an ambiguous or unknown spelling is a switch.
function selectStringParameter(name) {
  if (SELECT_STRING_ALIASES.has(name)) return SELECT_STRING_ALIASES.get(name);
  if (SELECT_STRING_PARAMETERS.has(name)) return SELECT_STRING_PARAMETERS.get(name);
  const matches = [...SELECT_STRING_PARAMETERS.keys()].filter((full) => full.startsWith(name));
  return matches.length === 1 ? SELECT_STRING_PARAMETERS.get(matches[0]) : "switch";
}

// Marks, in `noPattern`, the tokens that are the PATTERN of a search command. Two passes: first find the
// pattern-supplying options; with none present the first positional is the pattern, with one present every
// positional is a file operand and only the -e/--regexp values stay exempt.
function layoutSearch(argv, from, spec, noPattern) {
  let patternOption = false;
  let afterDashes = false;
  const positionals = [];
  for (let j = from; j < argv.length; j += 1) {
    const token = argv[j];
    if (afterDashes) {
      positionals.push(j);
      continue;
    }
    if (token === "--") {
      afterDashes = true;
      continue;
    }
    if (token.startsWith("--")) {
      const equals = token.indexOf("=");
      const name = equals < 0 ? token.slice(2) : token.slice(2, equals);
      const attached = equals >= 0;
      if (name === "regexp") {
        patternOption = true;
        if (attached) noPattern.add(j);
        else if (j + 1 < argv.length) {
          noPattern.add(j + 1);
          j += 1;
        }
      } else if (name === "file") {
        patternOption = true;
        // The value is a file that is read: it stays a file operand, but it is not a positional.
        if (!attached && j + 1 < argv.length) j += 1;
      } else if (spec.noPattern.has(name)) {
        patternOption = true;
        if (!attached && spec.long.has(name) && j + 1 < argv.length) j += 1;
      } else if (!attached && spec.long.has(name) && j + 1 < argv.length) {
        j += 1;
      }
      continue;
    }
    if (token.length > 1 && token.startsWith("-")) {
      for (let k = 1; k < token.length; k += 1) {
        const flag = token[k];
        if (!spec.short.has(flag)) continue;
        const attached = k + 1 < token.length;
        if (flag === "e") {
          patternOption = true;
          if (attached) noPattern.add(j);
          else if (j + 1 < argv.length) {
            noPattern.add(j + 1);
            j += 1;
          }
        } else if (flag === "f") {
          patternOption = true;
          if (!attached && j + 1 < argv.length) j += 1;
        } else if (!attached && j + 1 < argv.length) {
          j += 1;
        }
        break;
      }
      continue;
    }
    positionals.push(j);
  }
  if (!patternOption && positionals.length > 0) noPattern.add(positionals[0]);
}

function layoutSelectString(argv, from, noPattern) {
  let patternOption = false;
  const positionals = [];
  for (let j = from; j < argv.length; j += 1) {
    const token = argv[j];
    if (/^-[A-Za-z]/.test(token)) {
      const colon = token.indexOf(":");
      const name = (colon > 0 ? token.slice(1, colon) : token.slice(1)).toLowerCase();
      const attached = colon > 0 && colon < token.length - 1;
      const kind = selectStringParameter(name);
      if (kind === "pattern") {
        patternOption = true;
        if (attached) noPattern.add(j);
        else if (j + 1 < argv.length) {
          noPattern.add(j + 1);
          j += 1;
        }
      } else if (kind === "valued" && !attached && j + 1 < argv.length) {
        j += 1;
      }
      continue;
    }
    positionals.push(j);
  }
  if (!patternOption && positionals.length > 0) noPattern.add(positionals[0]);
}

// What the word at argv[at] runs, if it is a carrier or a search tool; else null.
function commandAt(argv, at) {
  const exe = exeInfo(argv[at]);
  const carrier = carrierKind(exe.name);
  if (carrier !== null) return { kind: carrier, exe };
  if (exe.name === "rg" || exe.name === "ripgrep") return { kind: "search", exe, spec: RG, from: at + 1 };
  if (exe.name === "grep" || exe.name === "egrep" || exe.name === "fgrep") {
    return { kind: "search", exe, spec: GREP, from: at + 1 };
  }
  if (exe.name === "select-string" || exe.name === "sls") {
    return { kind: "search", exe, spec: null, from: at + 1 };
  }
  if (exe.name === "git") {
    const from = gitGrepFrom(argv, at);
    if (from >= 0) return { kind: "search", exe, spec: GIT_GREP, from };
  }
  return null;
}

function dispatch(argv, ctx, depth, env, io, noPattern) {
  let start = 0;
  for (let guard = 0; guard < 8; guard += 1) {
    while (start < argv.length && ASSIGNMENT.test(argv[start])) start += 1;
    if (start >= argv.length) return;
    noPattern.add(start);
    if (WRAPPERS.has(exeInfo(argv[start]).name)) {
      // F5: seek forward to the first token naming a known carrier instead of stopping at an option value.
      let next = -1;
      for (let j = start + 1; j < argv.length; j += 1) {
        if (commandAt(argv, j) !== null) {
          next = j;
          break;
        }
      }
      if (next < 0) return;
      start = next;
      continue;
    }
    const found = commandAt(argv, start);
    if (found === null) return;
    if (found.kind === "search") {
      if (found.spec === null) layoutSelectString(argv, found.from, noPattern);
      else layoutSearch(argv, found.from, found.spec, noPattern);
      return;
    }
    carry(found.kind, found.exe, argv, start, ctx, depth, env, io, noPattern);
    return;
  }
}

// `noPattern` collects the indexes of the tokens that must not meet the secret patterns: the executable
// words, a search pattern, and every token handed to a nested scan (that scan applies the patterns itself).
function carry(kind, exe, argv, start, ctx, depth, env, io, noPattern) {
  if (kind === "node") {
    const preloads = [];
    const sources = [];
    const positionals = [];
    let evalSeen = false;
    let afterFirst = false;
    let afterDashes = false;
    for (let j = start + 1; j < argv.length; j += 1) {
      const token = argv[j];
      if (afterDashes) {
        positionals.push(token);
        continue;
      }
      if (afterFirst) {
        // After the first positional the dash words are the script's own arguments, never node options.
        if (!token.startsWith("-")) positionals.push(token);
        continue;
      }
      if (token === "--") {
        afterDashes = true;
        continue;
      }
      if (/^(?:-e|-p|-pe|-ep|--eval|--print)$/.test(token)) {
        evalSeen = true;
        if (j + 1 < argv.length) {
          sources.push(argv[j + 1]);
          noPattern.add(j + 1);
          j += 1;
        }
        continue;
      }
      const attachedSource = /^(?:--eval|--print)=([\s\S]*)$/.exec(token);
      if (attachedSource) {
        evalSeen = true;
        sources.push(attachedSource[1]);
        noPattern.add(j);
        continue;
      }
      if (NODE_PRELOAD_FLAGS.has(token)) {
        if (j + 1 < argv.length) {
          preloads.push(argv[j + 1]);
          j += 1;
        }
        continue;
      }
      const attachedPreload = /^(?:--require|--import|--loader|--experimental-loader)=([\s\S]+)$/.exec(token);
      if (attachedPreload) {
        preloads.push(attachedPreload[1]);
        continue;
      }
      if (token.startsWith("-")) {
        if (NODE_VALUE_FLAGS.has(token)) j += 1;
        continue;
      }
      afterFirst = true;
      positionals.push(token);
    }
    for (const preload of preloads) readOperand(preload, SOURCE_ONLY, ctx, depth, env, io);
    for (const source of sources) nested(source, SOURCE_ONLY, ctx, depth, env, io);
    if (!evalSeen) {
      for (const positional of positionals) readOperand(positional, SOURCE_ONLY, ctx, depth, env, io);
    }
    return;
  }
  if (kind === "python") {
    for (let j = start + 1; j < argv.length; j += 1) {
      const token = argv[j];
      if (/^-[A-Za-z]*c$/.test(token)) {
        if (j + 1 < argv.length) {
          noPattern.add(j + 1);
          nested(argv[j + 1], SOURCE_ONLY, ctx, depth, env, io);
        }
        return;
      }
      if (/^-[A-Za-z]*m$/.test(token)) return;
      if (token.startsWith("-")) {
        if (token === "-W" || token === "-X" || token === "-Q") j += 1;
        continue;
      }
      return readOperand(token, SOURCE_ONLY, ctx, depth, env, io);
    }
    return;
  }
  if (kind === "shell") {
    const contexts = exe.isExe && !ctx.inWsl ? [ctx, { ...ctx, inWsl: true }] : [ctx];
    for (let j = start + 1; j < argv.length; j += 1) {
      const token = argv[j];
      if (/^-[A-Za-z]+$/.test(token) && token.includes("c")) {
        if (j + 1 < argv.length) {
          noPattern.add(j + 1);
          for (const variant of contexts) nested(argv[j + 1], SHELL_TEXT, variant, depth, env, io);
        }
        return;
      }
      if (token === "-o" || token === "-O" || token === "+o" || token === "+O") {
        j += 1;
        continue;
      }
      if (token.startsWith("-") || token.startsWith("+")) continue;
      for (const variant of contexts) readOperand(token, SHELL_TEXT, variant, depth, env, io);
      return;
    }
    return;
  }
  if (kind === "wsl") {
    let rest = -1;
    for (let j = start + 1; j < argv.length; j += 1) {
      const token = argv[j];
      if (token === "-e" || token === "--exec" || token === "--") {
        rest = j + 1;
        break;
      }
      if (WSL_VALUE_FLAGS.has(token)) {
        j += 1;
        continue;
      }
      if (token.startsWith("-")) continue;
      rest = j;
      break;
    }
    if (rest >= 0 && rest < argv.length) {
      for (let k = rest; k < argv.length; k += 1) noPattern.add(k);
      scanArgv(argv.slice(rest), { ...ctx, ...SHELL_TEXT, inWsl: true }, depth, env, io);
    }
    return;
  }
  if (kind === "powershell") {
    // F1: a separate first pass over EVERY argv token, independent of the positional and text parsing below.
    for (let j = start + 1; j < argv.length; j += 1) {
      if (isEncodedCommandToken(argv[j])) {
        throw refuse("ELC-ENCODED-COMMAND", "an encoded PowerShell command cannot be matched, so it is refused");
      }
    }
    const handOff = (from) => {
      for (let k = from; k < argv.length; k += 1) noPattern.add(k);
    };
    for (let j = start + 1; j < argv.length; j += 1) {
      const raw = argv[j];
      if (!raw.startsWith("-")) {
        handOff(j);
        // F4: a first positional .ps1 is read as a script AND scanned as command text.
        if (/\.ps1$/i.test(raw)) readOperand(raw, POWERSHELL_TEXT, ctx, depth, env, io);
        return nested(argv.slice(j).join(" "), POWERSHELL_TEXT, ctx, depth, env, io);
      }
      const colon = raw.indexOf(":");
      const name = (colon > 0 ? raw.slice(1, colon) : raw.slice(1)).toLowerCase();
      const attached = colon > 0 ? raw.slice(colon + 1) : null;
      if (isEncodedName(name)) {
        throw refuse("ELC-ENCODED-COMMAND", "an encoded PowerShell command cannot be matched, so it is refused");
      }
      if (name === "c" || prefixOf("command", name)) {
        const parts = attached === null ? argv.slice(j + 1) : [attached, ...argv.slice(j + 1)];
        handOff(attached === null ? j + 1 : j);
        return nested(parts.join(" "), POWERSHELL_TEXT, ctx, depth, env, io);
      }
      if (name === "f" || prefixOf("file", name)) {
        const operand = attached ?? argv[j + 1];
        if (operand !== undefined) readOperand(operand, POWERSHELL_TEXT, ctx, depth, env, io);
        return;
      }
      if (attached === null && psTakesValue(name)) j += 1;
    }
    return;
  }
  if (kind === "cmd") {
    for (let j = start + 1; j < argv.length; j += 1) {
      const flag = argv[j].toLowerCase();
      if (flag === "/c" || flag === "/k" || flag === "/r") {
        if (j + 1 < argv.length) {
          for (let k = j + 1; k < argv.length; k += 1) noPattern.add(k);
          nested(argv.slice(j + 1).join(" "), CMD_TEXT, ctx, depth, env, io);
        }
        return;
      }
    }
  }
}

// --- working directory -----------------------------------------------------------------------------

const CD_NAMES = new Set(["cd", "chdir", "pushd", "set-location", "sl", "push-location"]);

// A plain `cd <path>` segment. Returns { operand } (operand may be unknown) or null for any other segment.
function cdOperand(argv, ctx) {
  let at = 0;
  while (at < argv.length && ASSIGNMENT.test(argv[at])) at += 1;
  if (at >= argv.length || !CD_NAMES.has(argv[at].toLowerCase())) return null;
  const ps = ctx.syntax === "ps";
  for (let j = at + 1; j < argv.length; j += 1) {
    const token = argv[j];
    if (token === "--") return { operand: argv[j + 1] ?? null };
    if (ps) {
      const named = /^-(?:path|literalpath|pspath|lp)(?::([\s\S]*))?$/i.exec(token);
      if (named) return { operand: named[1] !== undefined && named[1] !== "" ? named[1] : (argv[j + 1] ?? null) };
    }
    if (token.length > 1 && token.startsWith("-")) continue;
    return { operand: token };
  }
  return { operand: ps ? null : "~" };
}

// `ctx` is the scan's own mutable copy, so a cd never leaks into the caller's context.
function applyCd(ctx, found, env) {
  ctx.cwdMoved = true;
  const operand = found.operand;
  if (typeof operand !== "string" || operand === "" || operand === "-") return;
  let text = substituteEnv(operand, ctx, env);
  if (text === "~" || /^~[\\/]/.test(text)) text = homeFor(ctx, env) + text.slice(1);
  const slashed = text.replace(/\\/g, "/");
  let forms = absoluteForms(slashed);
  if (forms.length === 0 && ctx.cwd) forms = absoluteForms(`${ctx.cwd}/${slashed}`);
  if (forms.length > 0) ctx.cwd = forms[0];
}

// --- scanning --------------------------------------------------------------------------------------

function scanArgv(argv, ctx, depth, env, io) {
  const noPattern = new Set();
  if (!ctx.sourceOnly) dispatch(argv, ctx, depth, env, io, noPattern);
  for (let i = 0; i < argv.length; i += 1) checkToken(argv[i], ctx, env, !noPattern.has(i));
}

function runSegments(segments, ctx, depth, env, io) {
  const local = { ...ctx };
  for (const argv of segments) {
    scanArgv(argv, local, depth, env, io);
    if (!local.sourceOnly) {
      const found = cdOperand(argv, local);
      if (found) applyCd(local, found, env);
    }
  }
}

function scanText(text, ctx, depth, env, io) {
  if (typeof text !== "string" || text.length > MAX_TEXT) {
    throw refuse("ELC-OVERSIZE", "the text to scan is not a bounded string");
  }
  harvest(text, ctx, env);
  runSegments(tokenize(text, ctx.syntax), ctx, depth, env, io);
  if (ctx.syntax === "sh") {
    // F6: the same text again with bash's backslash escapes removed outside single quotes.
    const unescaped = unescapeOutsideSingleQuotes(text);
    if (unescaped !== text) {
      harvest(unescaped, ctx, env);
      runSegments(tokenize(unescaped, "sh"), ctx, depth, env, io);
    }
  }
}

// --- entry point -----------------------------------------------------------------------------------

function refusalFrom(error) {
  const known = error instanceof Refusal;
  return Object.freeze({
    refused: true,
    code: known ? error.code : "ELC-FAULT",
    lane: LANE,
    reason: known ? error.reason : "the classifier faulted, and a fault refuses",
  });
}

export function classifyExecutionLaneCredential(input) {
  try {
    const { command, tool, targets, readScript } = input ?? {};
    if (typeof command !== "string") throw refuse("ELC-INPUT-INVALID", "command is not a string");
    const toolName = typeof tool === "string" ? tool.toLowerCase() : "";
    if (toolName !== "bash" && toolName !== "powershell") {
      throw refuse("ELC-INPUT-INVALID", "tool is neither bash nor powershell");
    }
    const env = buildEnvironment(targets);
    const ctx = {
      syntax: toolName === "powershell" ? "ps" : "sh",
      inWsl: false,
      sourceOnly: false,
      cwd: env.cwd,
      cwdMoved: false,
    };
    scanText(command, ctx, 0, env, { readScript });
    return null;
  } catch (error) {
    return refusalFrom(error);
  }
}
