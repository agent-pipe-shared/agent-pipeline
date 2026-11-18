// SPDX-License-Identifier: SUL-1.0
// Guard module "powershell-dialect" (layer 5), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { realpathSync } from "node:fs";
import { basename, dirname, join, win32 } from "node:path";
import { parseGuardCommand } from "../../hooks/guard-command-grammar.mjs";
import { isReadOnlyDiagnosticCommand, isSafeNamesOnlyDirectory } from "./shell-grammar.mjs";
import { exactReadyReceipt, verdict } from "./verdict.mjs";
import * as constants from "./constants.mjs";
import { PIPELINE_STATE_SCRIPT } from "./constants.mjs";
import { resolveSanctionedScriptInvocation } from "./sanctioned-args-scripts.mjs";
import { POWERSHELL_ADMITTED_SHAPES, POWERSHELL_GRAMMAR_EXAMPLES, READ_TARGET_CODE } from "./grammar-denials.mjs";
import { isHalfMovedRepairArgv, isPhysicalIntakeScratchPath } from "./write-scope.mjs";
import { ProjectOnboardingReadyError, requireProjectOnboardingReady } from "../project-onboarding-ready-gate.mjs";

// W7 Slice B parity: the lifecycle gate is never reached for PowerShell (evaluate.mjs returns powerShellScopeVerdict first), so the
// dialect observes readiness itself, and only after the argv already passed the operand validator. Admitted solely for a
// session-intent PORG-INVALID-OBSERVATION; a ready, partial, drifted or bootstrap-intent observation admits nothing.
function invalidSessionObservation(root, dependencies) {
  try {
    (dependencies?.requireProjectOnboardingReadyFn ?? requireProjectOnboardingReady)({ rootDir: root, intent: "session", runner: dependencies?.runner });
    return false;
  } catch (error) {
    return error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION" && error.intent === "session";
  }
}
import { containedLiteralReadPath, readTargetProtectedRootsAdvice, sessionReadScopeRoots } from "./read-scope.mjs";
import { isSanctionedLifecycleCommand } from "./command-catalogue.mjs";

function powerShellNamedArgs(argv, valueFlags, bareFlags = []) {
  const values = new Map();
  const bare = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index].toLowerCase();
    if (values.has(flag) || bare.has(flag)) return null;
    if (valueFlags.includes(flag)) {
      const value = argv[++index];
      if (typeof value !== "string" || value === "" || value.startsWith("-")) return null;
      values.set(flag, value);
    } else if (bareFlags.includes(flag)) bare.add(flag);
    else return null;
  }
  return { values, bare };
}

function powerShellScratchPath(target, root, dependencies, allowScratchRoot = false) {
  return typeof target === "string" && target !== "" && !/[\0$`*?\[\]{}]/u.test(target)
    && !target.startsWith("~") && (process.platform === "win32" || !win32.isAbsolute(target))
    && isPhysicalIntakeScratchPath(target, root, dependencies, { allowScratchRoot });
}

// PowerShell requires the call operator for executable paths containing spaces. Admit only
// that one prefix when the remainder parses as a single literal Node invocation that the
// existing closed lifecycle argv validator already recognizes. This does not admit PowerShell
// composition, variables, splatting, or a general-purpose call operator.
// The bare `node <script> ...` spelling gets the same check, so a literal email in an answer flag does not depend on which spelling the agent chose (live
// Windows run: the bare form was refused for its `@`, the same argv passed in Bash). PowerShell evaluates an unquoted (...) argument, so one is refused outright.
export function sanctionedPowerShellNodeCall(command, root) {
  if (typeof command !== "string") return false;
  const body = command.replace(/^\s*&\s+/u, "");
  if (/[\r\n;$`|<>]/u.test(body)) return false;
  if (/[()]/u.test(body.replace(/'[^']*'|"[^"]*"/gu, ""))) return false;
  const parsed = parseGuardCommand(body, root, { platform: "win32" });
  if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
    || parsed.operators.length !== 0 || parsed.redirects.length !== 0) return false;
  const { executable, argv } = parsed.segments[0];
  if (!new Set(["node", "node.exe"]).has(basename(executable).toLowerCase()) || argv.length < 1) return false;
  // The parser returns dequoted argv. Reject PowerShell expansion and wildcard forms while
  // allowing ordinary literal values such as ops@example.test.
  if (argv.some((arg) => typeof arg !== "string" || arg === "" || /[\0$`*?\[\]{}]/u.test(arg) || arg.startsWith("@"))) return false;
  return isSanctionedLifecycleCommand(body, root, { platform: "win32", processExecPath: process.execPath });
}

// C19C-W169 (E7 PowerShell part): the pieces of the Bash grammar the dialect shares instead of re-listing.
const PLUGIN_ROOT = dirname(dirname(PIPELINE_STATE_SCRIPT));
const DISPATCH_BRIEFING_SCRIPT = join(PLUGIN_ROOT, "scripts", "dispatch-briefing.mjs");
const FOLDABLE_ENV_NAME = "PIPELINE_PLUGIN_ROOT";
// A literal `$env:NAME = "literal"` followed by `;` and ONE command. Value: no expansion, no composition character, no control character.
const ENV_ASSIGNMENT = /^\s*\$env:([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"$`;|&<>\r\n]*)"|'([^'$`;|&<>\r\n]*)')\s*;\s*([^\r\n]*?)\s*$/u;
// Read-only verbs of the sanctioned scripts (they print or plan, they do not apply); the apply/approve/configure verbs of the same scripts are not here.
const READY_READ_ONLY_VERBS = new Map([
  [PIPELINE_STATE_SCRIPT, ["continuity-authority-revision-plan", "continuity-result-bootstrap-plan"]],
  [DISPATCH_BRIEFING_SCRIPT, ["binding"]],
]);

const samePhysicalPath = (left, right) => {
  try {
    const a = realpathSync(left);
    const b = realpathSync(right);
    return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch { return false; }
};

// `$env:PIPELINE_PLUGIN_ROOT = "<this plugin's root>"; <one command>` -> the one command with the variable replaced by that literal. Anything else
// that starts with `$env:` is not folded (null) and meets the composition refusal below.
function foldPluginRootAssignment(command) {
  const match = ENV_ASSIGNMENT.exec(command);
  if (match === null || match[1].toUpperCase() !== FOLDABLE_ENV_NAME) return null;
  const value = match[2] ?? match[3];
  if (value === "" || !samePhysicalPath(value, PLUGIN_ROOT)) return null;
  const folded = match[4].replace(/\$env:PIPELINE_PLUGIN_ROOT\b/giu, () => value);
  return /[$`]/u.test(folded) || folded === "" ? null : folded;
}

// Every sanctioned script constant of the Bash grammar (constants.mjs, `*_SCRIPT`) plus dispatch-briefing, matched by physical identity.
const SANCTIONED_SCRIPTS = [...Object.entries(constants).filter(([name, value]) => name.endsWith("_SCRIPT") && typeof value === "string").map(([, value]) => value), DISPATCH_BRIEFING_SCRIPT];

function scriptIsSanctioned(script) {
  return SANCTIONED_SCRIPTS.some((candidate) => candidate === script || samePhysicalPath(candidate, script));
}

function sessionIsReady(root, dependencies) {
  try {
    return exactReadyReceipt((dependencies?.requireProjectOnboardingReadyFn ?? requireProjectOnboardingReady)({ rootDir: root, intent: "session", runner: dependencies?.runner }));
  } catch { return false; }
}

// `--help` of a sanctioned script, and its read-only plan/inspect/binding verbs, in a READY session. The Bash lane reaches the same commands through
// the ready lifecycle tail; a not-ready session keeps exactly the shapes isSanctionedLifecycleCommand lists.
function isReadyReadOnlyScriptRoute(command, root, dependencies) {
  const resolved = resolveSanctionedScriptInvocation(command, root, {});
  if (resolved === null || !scriptIsSanctioned(resolved.script)) return false;
  const { script, args } = resolved;
  if (args.some((arg) => typeof arg !== "string" || arg === "" || /[\0$`*?\[\]{}]/u.test(arg) || arg.startsWith("@"))) return false;
  const helpOnly = args.length === 1 && ["--help", "-h"].includes(args[0]);
  const verbs = [...READY_READ_ONLY_VERBS].find(([path]) => path === script || samePhysicalPath(path, script))?.[1] ?? [];
  return (helpOnly || verbs.includes(args[0])) && sessionIsReady(root, dependencies);
}

// The refusal for a shape the dialect does not admit: the sentence, the alternative for THAT shape, and the whole admitted table.
function powerShellRefusal(sentence, shape, alternative = POWERSHELL_GRAMMAR_EXAMPLES[shape]) {
  const render = (text) => text.replaceAll("<plugin-root>", PLUGIN_ROOT);
  return `BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-POWERSHELL-GRAMMAR: ${sentence}\n`
    + `Working example: ${render(alternative)}\n`
    + "The complete admitted PowerShell forms, with exact spellings:\n"
    + POWERSHELL_ADMITTED_SHAPES.map((entry) => `- ${render(entry.spelling)}\n  e.g. ${render(entry.example)}\n`).join("");
}

export function powerShellScopeVerdict(input, root, dependencies) {
  const original = input.tool_input.command ?? input.tool_input.CommandLine;
  const folded = typeof original === "string" && /^\s*\$env:/iu.test(original) ? foldPluginRootAssignment(original) : null;
  const command = folded ?? original;
  if (folded === null && typeof original === "string" && /^\s*\$env:/iu.test(original)) {
    return verdict(2, powerShellRefusal("an $env: assignment is admitted only as one literal PIPELINE_PLUGIN_ROOT assignment naming this plugin's root, followed by `;` and one literal command.", "literal",
      "$env:PIPELINE_PLUGIN_ROOT = \"<plugin-root>\"; node \"$env:PIPELINE_PLUGIN_ROOT/scripts/pipeline-start-preflight.mjs\""));
  }
  if (sanctionedPowerShellNodeCall(command, root)) return verdict(0);
  // PowerShell interpolation and composition must never be interpreted as a literal path.
  if (/[\r\n;$`@|&<>]/u.test(command)) {
    return verdict(2, powerShellGrammarDenial("use one literal command.", "literal"));
  }
  const parsed = parseGuardCommand(command, root, { platform: "win32" });
  if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
    || parsed.operators.length !== 0 || parsed.redirects.length !== 0) {
    return verdict(2, powerShellGrammarDenial("use one literal command.", "literal"));
  }
  const { executable, argv } = parsed.segments[0];
  const name = basename(executable).toLowerCase();
  // E7 (candidate 19, PO decision 2026-11-04): the Bash tool admits the version probes of node and git; the PowerShell tool refused them (measured on a
  // native Windows consumer). Exactly these three spellings, for the literal bare executable only (never a path); no other flag, no other argument.
  if ((["node", "node.exe"].includes(executable.toLowerCase()) && argv.length === 1 && (argv[0] === "--version" || argv[0] === "-v"))
    || (["git", "git.exe"].includes(executable.toLowerCase()) && argv.length === 1 && argv[0] === "--version")) return verdict(0);
  if (name === "new-item") {
    const named = powerShellNamedArgs(argv, ["-path", "-itemtype"], ["-force"]);
    const target = named?.values.get("-path");
    const itemType = named?.values.get("-itemtype")?.toLowerCase();
    if (target && ["directory", "file"].includes(itemType)
      && powerShellScratchPath(target, root, dependencies, itemType === "directory")) {
      return verdict(0);
    }
    return verdict(2, powerShellGrammarDenial("New-Item is limited to physically contained scratch files and directories.", "newItem"));
  }
  if (name === "set-content" || name === "add-content") {
    const named = powerShellNamedArgs(argv, ["-path", "-literalpath", "-value", "-encoding"], ["-nonewline"]);
    const target = named?.values.get("-literalpath") ?? named?.values.get("-path");
    const value = named?.values.get("-value");
    const encoding = named?.values.get("-encoding");
    if (named && !(named.values.has("-literalpath") && named.values.has("-path"))
      && target && value !== undefined && (encoding === undefined || encoding.toLowerCase() === "utf8")
      && powerShellScratchPath(target, root, dependencies)) return verdict(0);
    return verdict(2, powerShellGrammarDenial("content writes are limited to physically contained scratch files.", "contentWrite"));
  }
  if (["get-content", "get-childitem", "get-item", "test-path"].includes(name)) {
    const namesOnly = name === "get-childitem"
      && argv.filter((arg) => arg.toLowerCase() === "-name").length === 1;
    const readArgv = namesOnly ? argv.filter((arg) => arg.toLowerCase() !== "-name") : argv;
    let target;
    if (readArgv.length === 0 && name === "get-childitem") target = ".";
    else if (readArgv.length === 1) target = readArgv[0];
    else if (readArgv.length === 2 && ["-literalpath", "-path"].includes(readArgv[0].toLowerCase())) target = readArgv[1];
    else return verdict(2, powerShellGrammarDenial("unsupported read arguments.", "read"));
    return (containedLiteralReadPath(target, root, dependencies, sessionReadScopeRoots(input, dependencies))
      || (namesOnly && isSafeNamesOnlyDirectory(target, root, sessionReadScopeRoots(input, dependencies))))
      ? verdict(0)
      : verdict(2, `BLOCKED (guard-lifecycle-ready, plugin pipeline-core): ${READ_TARGET_CODE}: use an exact passive path outside protected credential roots.\n`
        + `Name one exact file or directory path without a wildcard, for example "${POWERSHELL_GRAMMAR_EXAMPLES.read}".\n`
        + `${readTargetProtectedRootsAdvice()}\n`);
  }
  if (["node", "node.exe"].includes(name)
    && (isSanctionedLifecycleCommand(command, root) || isReadyReadOnlyScriptRoute(command, root, dependencies))) return verdict(0);
  const bareExecutable = executable.toLowerCase();
  // Only the literal executable `git` / `git.exe` (never a path). A read-only observation gets the verdict the Bash grammar gives the same words
  // (isReadOnlyDiagnosticCommand is the table; the dialect keeps no list of its own). Characters PowerShell reads as syntax inside an argument
  // (a comma makes an array, parentheses a sub-expression, braces a script block) are refused before the words are handed to the POSIX reader.
  if (["git", "git.exe"].includes(bareExecutable)
    && !argv.some((arg) => /[(){},]/u.test(arg))
    && isReadOnlyDiagnosticCommand(["git", ...argv].map(posixWord).join(" "), root, sessionReadScopeRoots(input, dependencies))) return verdict(0);
  // E7 (candidate 19, PO decision 2026-11-04): `rg` is the same native program in both shells, so a read-only search gets the verdict the Bash grammar gives
  // the same words, with the same refusal of characters PowerShell reads as syntax. Builtins and aliases (`cat`, `ls`, `find`, `sed`) mean something else
  // in PowerShell than the Bash grammar validated and stay refused.
  if (["rg", "rg.exe"].includes(bareExecutable)
    && !argv.some((arg) => /[(){},]/u.test(arg))
    && isReadOnlyDiagnosticCommand(["rg", ...argv].map(posixWord).join(" "), root, sessionReadScopeRoots(input, dependencies))) return verdict(0);
  // Only the literal executable `git` / `git.exe` (never a path), argv exactly `mv A B` or `restore P`.
  if (["git", "git.exe"].includes(bareExecutable)
    && isHalfMovedRepairArgv(argv, root, dependencies, { windows: true })
    && invalidSessionObservation(root, dependencies)) return verdict(0);
  if (["git", "git.exe"].includes(bareExecutable)) {
    return verdict(2, powerShellRefusal("git is admitted from PowerShell for read-only observations only (the same read-only subcommands the Bash grammar admits); this command is not one.", "literal", "git status --short"));
  }
  if (["node", "node.exe"].includes(name) && argv.length > 0) {
    const script = argv[0];
    const own = typeof script === "string" && scriptIsSanctioned(script);
    return verdict(2, powerShellRefusal("node is admitted for a sanctioned Pipeline script exactly as the bootstrap or `pipeline-state.mjs inspect` prints it, and for the read-only plan, inspect and binding verbs of a sanctioned script in a ready session; this invocation is neither. If this runner also has a Bash tool, submit the same command there: the Bash lane admits the Pipeline's own scripts in a ready session.",
      "literal", own ? `node "${script}" --help` : "node \"<plugin-root>/scripts/pipeline-state.mjs\" inspect"));
  }
  return verdict(2, powerShellGrammarDenial("use a sanctioned Pipeline action or a contained literal read.", "literal"));
}

const posixWord = (word) => `'${String(word).replaceAll("'", "'\\''")}'`;

// C18-8 (AC-239): every GUARD-POWERSHELL-GRAMMAR refusal ends with one working example for the shape it refused (examples pinned as admitted
// by g23-read-help.test.mjs); the code and its first sentence are unchanged. C19C-W169: it also prints the table of admitted forms.
function powerShellGrammarDenial(sentence, shape) {
  return powerShellRefusal(sentence, shape);
}
