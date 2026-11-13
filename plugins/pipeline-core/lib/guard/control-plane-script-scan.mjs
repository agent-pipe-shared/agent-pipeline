// SPDX-License-Identifier: SUL-1.0
// C19-Q5 (AC-108): static scan of a repository-local node script for the Pipeline control-plane directory.
// The shell guard cannot see what a script does; it can read the script text. Another interpreter, or a path
// built at run time, is NOT covered -- the real boundary for those is host sandboxing.
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { verdict } from "./verdict.mjs";

export const CONTROLPLANE_SCRIPT_DENIAL_CODE = "GUARD-CONTROLPLANE-SCRIPT";
export const CONTROLPLANE_SHELL_WRITE_DENIAL_CODE = "GUARD-CONTROLPLANE-WRITE";
export const MAX_SCANNED_SCRIPT_BYTES = 256 * 1024;
const SCRIPT_EXTENSION = /\.(?:mjs|cjs|js)$/u;
const EXEMPT_PREFIX = "plugins/pipeline-core/";
// Exact tracked paths outside the plugin that legitimately own control-plane housekeeping. Known loophole: an
// agent that edits an exempt script can use the exemption, so edits to these paths belong under normal review.
const EXEMPT_PATHS = new Set(["scripts/housekeeping.mjs"]);
const SPELLINGS = [
  /\.git[\\/]+agent-pipeline/u,
  /['"`]\.git['"`]\s*,\s*['"`]agent-pipeline['"`]/u,
];
const GIT_DIR_EXPRESSION = /git-common-dir|gitCommonDir|gitDir|git_dir/u;
const AGENT_PIPELINE_LITERAL = /['"`][\\/]?agent-pipeline(?:[\\/]|['"`])/u;

function matchedSpelling(text) {
  for (const pattern of SPELLINGS) {
    const hit = pattern.exec(text);
    if (hit) return hit[0];
  }
  if (GIT_DIR_EXPRESSION.test(text)) {
    const hit = AGENT_PIPELINE_LITERAL.exec(text);
    if (hit) return `${GIT_DIR_EXPRESSION.exec(text)[0]} with ${hit[0]}`;
  }
  return null;
}

function words(segment) {
  return [...segment.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)].map((m) => m[1] ?? m[2] ?? m[3]);
}

function scriptCandidates(command) {
  const candidates = [];
  for (const segment of command.split(/[;&|\n]+/u)) {
    const [executable, ...args] = words(segment);
    if (executable === undefined || !/^node(?:\.exe)?$/iu.test(basename(executable.replaceAll("\\", "/")))) continue;
    for (const arg of args) if (!arg.startsWith("-") && SCRIPT_EXTENSION.test(arg)) candidates.push(arg);
  }
  return candidates;
}

function readableScript(arg, root) {
  try {
    const file = resolve(root, arg);
    const rel = relative(root, file);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
    const posixRel = rel.split(sep).join("/");
    if (posixRel.startsWith(EXEMPT_PREFIX) || EXEMPT_PATHS.has(posixRel)) return null;
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_SCANNED_SCRIPT_BYTES) return null;
    if (realpathSync(file) !== join(realpathSync(root), rel)) return null;
    return { rel: posixRel, text: readFileSync(file, "utf8") };
  } catch {
    return null;
  }
}

/** Returns { script, spelling } for the first script that names the control plane, else null. */
export function controlPlaneScriptHit(command, root) {
  if (typeof command !== "string") return null;
  for (const arg of scriptCandidates(command)) {
    const script = readableScript(arg, root);
    if (script === null) continue;
    const spelling = matchedSpelling(script.text);
    if (spelling !== null) return { script: script.rel, spelling };
  }
  return null;
}

// D247 follow-up (live probe 2026-11-13: cp, mv and rm into .git/agent-pipeline/ were all admitted). A shell segment that names
// the control-plane directory -- literally, or through a path whose real location lies in it -- is refused unless its command
// only reads and the segment carries no redirect. The plugin's own scripts write there with the file system and never name it.
const READ_ONLY_COMMANDS = new Set(["rg", "grep", "cat", "head", "tail", "wc", "stat", "file", "ls", "git"]);
const REDIRECT = />/u;
const DISCARD_REDIRECT = /\d?>{1,2}\s*\/dev\/null/gu;
const CONTROL_PLANE = /(?:^|[^A-Za-z0-9_.-])\.git[\\/]+agent-pipeline(?:[\\/]|$|['"`])/u;

function namesControlPlane(word, root) {
  if (typeof word !== "string" || word === "") return false;
  if (CONTROL_PLANE.test(word)) return true;
  if (word.startsWith("-")) return false;
  const plain = word.replace(/^[^=]*=(?=[./\\])/u, "").replace(/^\d?>{1,2}/u, "");
  if (plain === "") return false;
  try {
    let probe = resolve(root, plain);
    const rest = [];
    while (true) {
      try { lstatSync(probe); break; } catch { /* keep walking up */ }
      const parent = resolve(probe, "..");
      if (parent === probe) return false;
      rest.unshift(basename(probe));
      probe = parent;
    }
    return CONTROL_PLANE.test(join(realpathSync(probe), ...rest));
  } catch { return false; }
}

/** Returns { segment } for the first shell segment that would write the control-plane directory, else null. */
export function controlPlaneShellWriteHit(command, root) {
  if (typeof command !== "string") return null;
  for (const segment of command.split(/[;&|\n]+|&&|\|\|/u)) {
    const parts = words(segment);
    if (parts.length === 0 || !parts.some((word) => namesControlPlane(word, root))) continue;
    const executable = basename(String(parts[0]).replaceAll("\\", "/"));
    const sedInPlace = executable === "sed" && parts.some((word) => /^-[a-zA-Z]*i/u.test(word) || word.startsWith("--in-place"));
    const findMutates = executable === "find" && parts.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprintf", "-fls"].includes(word));
    const readOnly = (READ_ONLY_COMMANDS.has(executable) || (executable === "sed" && !sedInPlace) || (executable === "find" && !findMutates))
      && !REDIRECT.test(segment.replace(DISCARD_REDIRECT, ""));
    if (!readOnly) return { segment: segment.trim().slice(0, 200) };
  }
  return null;
}

export function controlPlaneShellWriteBlocked(hit) {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${CONTROLPLANE_SHELL_WRITE_DENIAL_CODE}: this command would change the Pipeline control-plane directory .git/agent-pipeline/ (${hit.segment}). `
      + "Only the plugin's hooks and sanctioned scripts write there; a record an agent could write would prove nothing.\n"
      + "Use scratch/ for notes and evidence, and the sanctioned Pipeline command for anything the pipeline records. Reading that directory stays admitted.\n",
  );
}

export function controlPlaneScriptBlocked(hit) {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${CONTROLPLANE_SCRIPT_DENIAL_CODE}: the script "${hit.script}" names the Pipeline control-plane directory (matched: ${hit.spelling}); `
      + "a script run through node is not allowed to read or write that state.\n"
      + "Use the sanctioned Pipeline commands for that state. A script that only READS evidence should take the path from a command-line argument instead of naming the directory itself.\n",
  );
}
