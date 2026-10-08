// SPDX-License-Identifier: SUL-1.0
// TR-S2-F-20261009 -- pure execution-lane credential classifier (TR-S2, BK 2).
//
// Contract: toil-resolution note section 3.4 "TR-S2" (revision a3) and Ruling 76(a); the pins are
// lib/execution-lane-credential.test.mjs (header assumptions 1-10).
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
//     script's content that is scanned again does.
//   - SCRIPT OPERANDS: the classifier is given no repository root, so it cannot tell an in-root script
//     from any other. It reads the first script operand of every carrier through `readScript`; an
//     unreadable operand (null, a non-string, or a throw) refuses (Ruling 76(a): an unreadable script
//     cannot be cleared). The path handed to the reader is the absolute native spelling when the operand
//     names one (so the /mnt/<drive>/ spelling of an in-root path becomes <D>:/...), else the operand.
//   - PowerShell encoded commands (-EncodedCommand, -enc, -ec, any unambiguous prefix) refuse outright,
//     because their text cannot be matched.
//
// Known residuals (unchanged by this slice; wiring and tranche decide): dynamic constructs (variables,
// command substitution, globs in a directory component), a protected target reached through a script run
// by direct path rather than through a carrier, a carrier hidden inside a string argument of a
// non-carrier executable (path scanning still sees every path-like piece of such a string), and
// scripts written in a language whose content is only path-scanned (node and python sources do not
// recurse into further carriers).

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

// --- targets ---------------------------------------------------------------------------------------

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
  return { roots, secrets, homeNative: homeOf(homes.native, "native"), homeWsl: homeOf(homes.wsl, "wsl") };
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

// An option-attached form (--opt=<p>, file:<p>, @<p>, a file URL) is peeled until it stops changing.
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
    for (const item of next) {
      if (item !== "" && !seen.has(item)) {
        seen.add(item);
        queue.push(item);
      }
    }
  }
  return seen;
}

// Returns the kind of protected target a candidate names, or null.
function matchCandidate(candidate, ctx, env) {
  let text = candidate;
  if (text === "~" || /^~[\\/]/.test(text)) text = homeFor(ctx, env) + text.slice(1);
  const slashed = text.replace(/\\/g, "/");
  // A bare secret basename is admitted; a directory component (including "./") plus the basename is not.
  const trimmed = slashed.replace(/\/+$/, "");
  const cut = trimmed.lastIndexOf("/");
  if (cut >= 0 && env.secrets.has(trimmed.slice(cut + 1).toLowerCase())) return "secretBasenames";
  for (const form of absoluteForms(slashed)) {
    const lower = form.toLowerCase();
    for (const root of env.roots) {
      for (const rootForm of root.forms) {
        if (isInside(lower, rootForm)) return root.kind;
      }
    }
  }
  return null;
}

function checkCandidates(text, ctx, env) {
  if (text === "") return;
  for (const variant of variantsOf(substituteEnv(text, ctx, env))) {
    const kind = matchCandidate(variant, ctx, env);
    if (kind) throw refuse(KIND_CODES[kind], `the command names a protected target (${kind})`);
  }
}

const DELIMITERS = /[\s'"`;|&<>(),[\]]+/;
const LITERALS = /'([^'\n]*)'|"([^"\n]*)"/g;

// Whole-text harvest: every delimiter-separated piece and every quoted literal (a literal may hold spaces).
function scanPieces(text, ctx, env) {
  for (const piece of text.split(DELIMITERS)) checkCandidates(piece, ctx, env);
  for (const match of text.matchAll(LITERALS)) checkCandidates(match[1] ?? match[2], ctx, env);
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
const NODE_VALUE_FLAGS = new Set([
  "-r", "--require", "--import", "--loader", "--experimental-loader", "-C", "--conditions", "--input-type",
  "--title",
]);
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

function isEncodedName(name) {
  return name === "e" || name === "ec" || name === "ea" || prefixOf("encodedcommand", name) ||
    prefixOf("encodedarguments", name);
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
  const forms = absoluteForms(text.replace(/\\/g, "/"));
  return forms.length > 0 ? forms[0] : text;
}

function readOperand(operand, patch, ctx, depth, env, io) {
  if (typeof io.readScript !== "function") throw refuse("ELC-FAULT", "no script reader was supplied");
  const content = io.readScript(scriptTarget(operand, ctx, env));
  if (typeof content !== "string") {
    throw refuse("ELC-SCRIPT-UNREADABLE", "a script operand could not be read, so it cannot be cleared");
  }
  nested(content, patch, ctx, depth, env, io);
}

function dispatch(argv, ctx, depth, env, io) {
  let start = 0;
  for (let guard = 0; guard < 8; guard += 1) {
    while (start < argv.length && ASSIGNMENT.test(argv[start])) start += 1;
    if (start >= argv.length) return;
    const exe = exeInfo(argv[start]);
    if (WRAPPERS.has(exe.name)) {
      start += 1;
      while (
        start < argv.length &&
        (argv[start].startsWith("-") || ASSIGNMENT.test(argv[start]) || /^\d+(?:\.\d+)?[smhd]?$/.test(argv[start]))
      ) {
        start += 1;
      }
      continue;
    }
    const kind = carrierKind(exe.name);
    if (kind === null) return;
    carry(kind, exe, argv, start, ctx, depth, env, io);
    return;
  }
}

function carry(kind, exe, argv, start, ctx, depth, env, io) {
  if (kind === "node") {
    for (let j = start + 1; j < argv.length; j += 1) {
      const token = argv[j];
      if (/^(?:-e|-p|-pe|-ep|--eval|--print)$/.test(token)) {
        if (j + 1 < argv.length) nested(argv[j + 1], SOURCE_ONLY, ctx, depth, env, io);
        return;
      }
      const attached = /^(?:--eval|--print)=([\s\S]*)$/.exec(token);
      if (attached) return nested(attached[1], SOURCE_ONLY, ctx, depth, env, io);
      if (token === "--") continue;
      if (token.startsWith("-")) {
        if (NODE_VALUE_FLAGS.has(token)) j += 1;
        continue;
      }
      return readOperand(token, SOURCE_ONLY, ctx, depth, env, io);
    }
    return;
  }
  if (kind === "python") {
    for (let j = start + 1; j < argv.length; j += 1) {
      const token = argv[j];
      if (/^-[A-Za-z]*c$/.test(token)) {
        if (j + 1 < argv.length) nested(argv[j + 1], SOURCE_ONLY, ctx, depth, env, io);
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
      scanArgv(argv.slice(rest), { ...ctx, ...SHELL_TEXT, inWsl: true }, depth, env, io);
    }
    return;
  }
  if (kind === "powershell") {
    for (let j = start + 1; j < argv.length; j += 1) {
      const raw = argv[j];
      if (!raw.startsWith("-")) return nested(argv.slice(j).join(" "), POWERSHELL_TEXT, ctx, depth, env, io);
      const colon = raw.indexOf(":");
      const name = (colon > 0 ? raw.slice(1, colon) : raw.slice(1)).toLowerCase();
      const attached = colon > 0 ? raw.slice(colon + 1) : null;
      if (isEncodedName(name)) {
        throw refuse("ELC-ENCODED-COMMAND", "an encoded PowerShell command cannot be matched, so it is refused");
      }
      if (name === "c" || prefixOf("command", name)) {
        const parts = attached === null ? argv.slice(j + 1) : [attached, ...argv.slice(j + 1)];
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
        if (j + 1 < argv.length) nested(argv.slice(j + 1).join(" "), CMD_TEXT, ctx, depth, env, io);
        return;
      }
    }
  }
}

function scanArgv(argv, ctx, depth, env, io) {
  for (const token of argv) checkCandidates(token, ctx, env);
  if (!ctx.sourceOnly) dispatch(argv, ctx, depth, env, io);
}

function scanText(text, ctx, depth, env, io) {
  if (typeof text !== "string" || text.length > MAX_TEXT) {
    throw refuse("ELC-OVERSIZE", "the text to scan is not a bounded string");
  }
  scanPieces(text, ctx, env);
  for (const argv of tokenize(text, ctx.syntax)) scanArgv(argv, ctx, depth, env, io);
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
    const ctx = { syntax: toolName === "powershell" ? "ps" : "sh", inWsl: false, sourceOnly: false };
    scanText(command, ctx, 0, env, { readScript });
    return null;
  } catch (error) {
    return refusalFrom(error);
  }
}
