// SPDX-License-Identifier: SUL-1.0
// Guard module "powershell-dialect" (layer 5), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { basename, win32 } from "node:path";
import { parseGuardCommand } from "../../hooks/guard-command-grammar.mjs";
import { isSafeNamesOnlyDirectory } from "./shell-grammar.mjs";
import { verdict } from "./verdict.mjs";
import { POWERSHELL_GRAMMAR_EXAMPLES } from "./grammar-denials.mjs";
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
import { containedLiteralReadPath, sessionReadScopeRoots } from "./read-scope.mjs";
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
export function sanctionedPowerShellNodeCall(command, root) {
  if (typeof command !== "string" || !/^\s*&\s+/u.test(command)) return false;
  const body = command.replace(/^\s*&\s+/u, "");
  if (/[\r\n;$`|<>]/u.test(body)) return false;
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

export function powerShellScopeVerdict(input, root, dependencies) {
  const command = input.tool_input.command ?? input.tool_input.CommandLine;
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
      : verdict(2, "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-READ-TARGET: use an exact passive path outside protected credential roots.\n"
        + `Name one exact file or directory path without a wildcard, for example "${POWERSHELL_GRAMMAR_EXAMPLES.read}".\n`);
  }
  if (["node", "node.exe"].includes(name) && isSanctionedLifecycleCommand(command, root)) return verdict(0);
  // Only the literal executable `git` / `git.exe` (never a path), argv exactly `mv A B` or `restore P`.
  if (["git", "git.exe"].includes(executable.toLowerCase())
    && isHalfMovedRepairArgv(argv, root, dependencies, { windows: true })
    && invalidSessionObservation(root, dependencies)) return verdict(0);
  return verdict(2, powerShellGrammarDenial("use a sanctioned Pipeline action or a contained literal read.", "literal"));
}

// C18-8 (AC-239): every GUARD-POWERSHELL-GRAMMAR refusal ends with one working example for the shape it refused (examples pinned as admitted
// by g23-read-help.test.mjs); the code and its first sentence are unchanged.
function powerShellGrammarDenial(sentence, shape) {
  return `BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-POWERSHELL-GRAMMAR: ${sentence}\n`
    + `Working example: ${POWERSHELL_GRAMMAR_EXAMPLES[shape]}\n`;
}
