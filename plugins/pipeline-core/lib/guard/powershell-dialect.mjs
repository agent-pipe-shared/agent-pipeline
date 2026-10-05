// SPDX-License-Identifier: SUL-1.0
// Guard module "powershell-dialect" (layer 5), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { basename, win32 } from "node:path";
import { parseGuardCommand } from "../../hooks/guard-command-grammar.mjs";
import { isSafeNamesOnlyDirectory } from "./shell-grammar.mjs";
import { verdict } from "./verdict.mjs";
import { isPhysicalIntakeScratchPath } from "./write-scope.mjs";
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
    return verdict(2, "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-POWERSHELL-GRAMMAR: use one literal command.\n");
  }
  const parsed = parseGuardCommand(command, root, { platform: "win32" });
  if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
    || parsed.operators.length !== 0 || parsed.redirects.length !== 0) {
    return verdict(2, "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-POWERSHELL-GRAMMAR: use one literal command.\n");
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
    return verdict(2, "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-POWERSHELL-GRAMMAR: New-Item is limited to physically contained scratch files and directories.\n");
  }
  if (name === "set-content" || name === "add-content") {
    const named = powerShellNamedArgs(argv, ["-path", "-literalpath", "-value", "-encoding"], ["-nonewline"]);
    const target = named?.values.get("-literalpath") ?? named?.values.get("-path");
    const value = named?.values.get("-value");
    const encoding = named?.values.get("-encoding");
    if (named && !(named.values.has("-literalpath") && named.values.has("-path"))
      && target && value !== undefined && (encoding === undefined || encoding.toLowerCase() === "utf8")
      && powerShellScratchPath(target, root, dependencies)) return verdict(0);
    return verdict(2, "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-POWERSHELL-GRAMMAR: content writes are limited to physically contained scratch files.\n");
  }
  if (["get-content", "get-childitem", "get-item", "test-path"].includes(name)) {
    const namesOnly = name === "get-childitem"
      && argv.filter((arg) => arg.toLowerCase() === "-name").length === 1;
    const readArgv = namesOnly ? argv.filter((arg) => arg.toLowerCase() !== "-name") : argv;
    let target;
    if (readArgv.length === 0 && name === "get-childitem") target = ".";
    else if (readArgv.length === 1) target = readArgv[0];
    else if (readArgv.length === 2 && ["-literalpath", "-path"].includes(readArgv[0].toLowerCase())) target = readArgv[1];
    else return verdict(2, "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-POWERSHELL-GRAMMAR: unsupported read arguments.\n");
    return (containedLiteralReadPath(target, root, dependencies, sessionReadScopeRoots(input, dependencies))
      || (namesOnly && isSafeNamesOnlyDirectory(target, root, sessionReadScopeRoots(input, dependencies))))
      ? verdict(0)
      : verdict(2, "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-READ-TARGET: use an exact passive path outside protected credential roots.\n");
  }
  if (["node", "node.exe"].includes(name) && isSanctionedLifecycleCommand(command, root)) return verdict(0);
  return verdict(2, "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-POWERSHELL-GRAMMAR: use a sanctioned Pipeline action or a contained literal read.\n");
}
