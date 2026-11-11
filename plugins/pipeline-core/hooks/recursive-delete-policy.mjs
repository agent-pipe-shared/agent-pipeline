// SPDX-License-Identifier: SUL-1.0
/**
 * PO decision 2026-11-10 ("Eng begrenzen"): a recursive delete runs only under scratch/ and the folders the project names as throwaway in its
 * guard config (`throwawayDirs`). Elsewhere it is refused with the allowed route. Motive: `find $tmp -delete` with an unset variable deleted a main worktree.
 * Judges command TEXT only. A script that deletes on its own remains outside this rule.
 */
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const RECURSIVE_DELETE_RULE_ID = "GG-21";
const NESTING_LIMIT = 3;
const PREFIX_WORDS = new Set(["sudo", "command", "exec", "nice", "nohup", "time", "env"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const INLINE_DELETERS = [
  [/^(python\d*(\.\d+)?|py|pypy\d*)$/u, new Set(["-c"]), /\brmtree\b|\bremovedirs\b/u],
  [/^node$/u, new Set(["-e", "--eval", "-p", "--print"]), /\b(rmSync|rm|rmdirSync|rmdir)\b[\s\S]*\brecursive\b/u],
  [/^perl$/u, new Set(["-e", "-E"]), /\b(rmtree|remove_tree)\b/u],
  [/^ruby$/u, new Set(["-e"]), /\brm_r\b|\brm_rf\b|\bremove_dir\b/u],
];
const XARGS_VALUE_FLAGS = new Set(["-I", "-n", "-P", "-L", "-s", "-d", "-E", "-a"]);
const CONTROL_DIRS = new Set([".git", ".claude", "project"]);

/** Splits a command into simple commands of words. A word records whether expansion could change it. */
function parseSegments(command) {
  const segments = [[]];
  let word = null;
  let quote = null;
  const push = () => { if (word !== null) { segments.at(-1).push(word); word = null; } };
  const ensure = () => { word ??= { text: "", dynamic: false, quoted: false }; return word; };
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote === "'") { if (char === "'") quote = null; else ensure().text += char; continue; }
    if (quote === '"') {
      if (char === '"') { quote = null; continue; }
      if (char === "\\" && index + 1 < command.length) { index += 1; ensure().text += command[index]; continue; }
      if (char === "$" || char === "`") ensure().dynamic = true;
      ensure().text += char;
      continue;
    }
    if (char === "'" || char === '"') { quote = char; ensure().quoted = true; continue; }
    if (char === "\\" && index + 1 < command.length && /\s/u.test(command[index + 1])) { index += 1; continue; }
    if (/\s/u.test(char) && char !== "\n") { push(); continue; }
    if (char === ";" || char === "|" || char === "&" || char === "\n") { push(); segments.push([]); continue; }
    if (char === "(" || char === ")") { push(); if (char === "(") segments.push([]); continue; }
    if (char === "$" || char === "`" || char === "%") ensure().dynamic = true;
    ensure().text += char;
  }
  push();
  return segments.filter(segment => segment.length > 0);
}

const commandName = word => basename(word.text.replace(/\\/gu, "/")).toLowerCase().replace(/\.exe$/u, "");
const isRecursiveRmFlag = text => /^-[a-zA-Z]*[rR][a-zA-Z]*$/u.test(text) || (text.length > 2 && "--recursive".startsWith(text));

function withoutPrefixes(words) {
  let index = 0;
  while (index < words.length) {
    const text = words[index].text;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(text) || PREFIX_WORDS.has(commandName(words[index]))) { index += 1; continue; }
    break;
  }
  return words.slice(index);
}

function rmTargets(args) {
  let recursive = false;
  let afterMarker = false;
  const targets = [];
  for (const arg of args) {
    if (!afterMarker && arg.text === "--") { afterMarker = true; continue; }
    if (!afterMarker && arg.text.startsWith("-")) { recursive ||= isRecursiveRmFlag(arg.text); continue; }
    targets.push(arg);
  }
  return recursive ? targets : null;
}

function findDeletes(args) {
  return args.some((arg, index) => arg.text === "-delete"
    || (["-exec", "-execdir", "-ok", "-okdir"].includes(arg.text) && args[index + 1] !== undefined && ["rm", "rmdir", "shred"].includes(commandName(args[index + 1]))));
}

function findTargets(args) {
  const targets = [];
  for (let index = 0; index < args.length; index += 1) {
    const text = args[index].text;
    if (/^-[HLP]$/u.test(text) || /^-O\d*$/u.test(text)) continue;
    if (text === "-D") { index += 1; continue; }
    if (text.startsWith("-") || text === "(" || text === "!") break;
    targets.push(args[index]);
  }
  return targets.length ? targets : [{ text: ".", dynamic: false, quoted: false }];
}

function xargsRunsRecursiveRm(args) {
  let index = 0;
  while (index < args.length && args[index].text.startsWith("-")) index += XARGS_VALUE_FLAGS.has(args[index].text) ? 2 : 1;
  const rest = withoutPrefixes(args.slice(index));
  return rest.length > 0 && commandName(rest[0]) === "rm" && rmTargets(rest.slice(1)) !== null;
}

function removeItemTargets(args) {
  let recursive = false;
  const targets = [];
  for (let index = 0; index < args.length; index += 1) {
    const text = args[index].text;
    if (/^-r(e(c(u(r(s(e)?)?)?)?)?)?$/iu.test(text)) { recursive = true; continue; }
    if (/^-(path|literalpath|lp)$/iu.test(text)) { if (args[index + 1]) targets.push(args[index + 1]); index += 1; continue; }
    if (text.startsWith("-")) continue;
    targets.push(args[index]);
  }
  return recursive ? targets : null;
}

function windowsRdTargets(args) {
  if (!args.some(arg => /^\/s$/iu.test(arg.text))) return null;
  return args.filter(arg => !arg.text.startsWith("/"));
}

function inlineValue(args, flags) {
  for (let index = 0; index < args.length; index += 1) if (flags.has(args[index].text)) return args[index + 1] ?? null;
  return null;
}

/** Every delete this command would run: `{ targets }` for readable paths, `{ opaque }` when no target can be read from the text. */
function collectDeletes(command, depth = 0) {
  const found = [];
  for (const segment of parseSegments(command)) {
    const words = withoutPrefixes(segment);
    if (words.length === 0) continue;
    const name = commandName(words[0]);
    const args = words.slice(1);
    if (name === "rm") {
      const targets = rmTargets(args);
      if (targets) found.push({ targets });
    } else if (name === "find") {
      if (findDeletes(args)) found.push({ targets: findTargets(args) });
    } else if (name === "xargs") {
      if (xargsRunsRecursiveRm(args)) found.push({ opaque: "xargs rm -r takes its targets from its input" });
    } else if (name === "remove-item" || name === "ri" || name === "del" || name === "erase") {
      const targets = removeItemTargets(args);
      if (targets) found.push({ targets });
    } else if (name === "rd" || name === "rmdir") {
      const targets = windowsRdTargets(args);
      if (targets) found.push({ targets });
    } else if (SHELLS.has(name)) {
      const flagIndex = args.findIndex(arg => /^-[a-zA-Z]*c[a-zA-Z]*$/u.test(arg.text));
      if (flagIndex >= 0 && args[flagIndex + 1] && depth < NESTING_LIMIT) found.push(...collectDeletes(args[flagIndex + 1].text, depth + 1));
    } else {
      for (const [interpreter, flags, deletes] of INLINE_DELETERS) {
        if (!interpreter.test(name)) continue;
        const code = inlineValue(args, flags);
        if (code && deletes.test(code.text)) found.push({ opaque: `a ${name} one-liner deletes recursively` });
      }
    }
  }
  return found;
}

function nearestRepositoryRoot(start) {
  let current = start;
  for (;;) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function real(path) {
  let current = path;
  const tail = [];
  for (;;) {
    try { return join(realpathSync(current), ...tail.reverse()); } catch { /* not created yet: resolve its parent */ }
    const parent = dirname(current);
    if (parent === current) return path;
    tail.push(basename(current));
    current = parent;
  }
}

function contains(base, path, platform) {
  const rel = relative(platform === "win32" ? base.toLowerCase() : base, platform === "win32" ? path.toLowerCase() : path);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

/** The folder part a glob cannot widen: `scratch/out*` gives `scratch/`, a bare `*` gives the working directory. */
function literalPrefix(text) {
  const glob = text.search(/[*?[{]/u);
  if (glob < 0) return text;
  const head = text.slice(0, glob);
  const slash = head.lastIndexOf("/");
  return slash < 0 ? "." : head.slice(0, slash + 1);
}

/** A named folder must be a plain relative path below the root that holds no Pipeline state. */
export function validThrowawayDirs(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(entry => {
    if (typeof entry !== "string" || entry === "" || /[*?[{$`%]/u.test(entry)) return false;
    const parts = entry.replace(/\\/gu, "/").replace(/\/+$/u, "").split("/");
    return !isAbsolute(entry) && !/^[A-Za-z]:/u.test(entry) && parts.every(part => part !== "" && part !== "." && part !== "..") && !CONTROL_DIRS.has(parts[0].toLowerCase());
  });
}

function allowedBases(root, cwd, throwawayDirs) {
  const roots = [root, nearestRepositoryRoot(cwd)].filter(Boolean);
  return [...roots.map(entry => real(join(entry, "scratch"))), ...validThrowawayDirs(throwawayDirs).map(entry => real(join(root, entry)))];
}

function targetAllowed(word, bases, cwd, platform) {
  if (word.dynamic || word.text === "") return false;
  const spelled = literalPrefix(word.text.replace(/\\/gu, "/"));
  return bases.some(base => contains(base, real(resolve(cwd, spelled)), platform));
}

/** Null when the command deletes nothing recursively outside the allowed folders; otherwise the rule that refuses it. */
export function recursiveDeleteFinding(command, { root, cwd = root, throwawayDirs = [], guardConfigPath = "project/guard-config.json", platform = process.platform } = {}) {
  if (typeof command !== "string" || command === "") return null;
  const deletes = collectDeletes(command);
  if (deletes.length === 0) return null;
  const bases = allowedBases(root, cwd, throwawayDirs);
  const refused = [];
  for (const entry of deletes) {
    if (entry.opaque) refused.push(entry.opaque);
    else if (entry.targets.length === 0) refused.push("a recursive delete without a readable target");
    else for (const target of entry.targets) if (!targetAllowed(target, bases, cwd, platform)) refused.push(target.text || "an empty target");
  }
  if (refused.length === 0) return null;
  const named = [...new Set(refused)].slice(0, 5).join(", ");
  return { id: RECURSIVE_DELETE_RULE_ID,
    why: `Recursive delete outside the throwaway folders: ${named}. It is allowed only under scratch/ and in folders listed under "throwawayDirs" in ${guardConfigPath}, each named literally without a variable. To remove tracked files name them with git rm <file>; to empty a build folder add it to throwawayDirs.`,
    origin: "PO decision 2026-11-10 (recursive delete narrowed)" };
}
