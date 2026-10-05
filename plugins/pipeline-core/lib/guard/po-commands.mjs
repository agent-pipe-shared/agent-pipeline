// SPDX-License-Identifier: SUL-1.0
// Guard module "po-commands" (layer 4), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { existsSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { HUMAN_PO_SIGNING_COMMANDS } from "../../scripts/po-human-approval.mjs";
import { isBoundedReadOnlyPipeline, parseGuardCommand } from "../../hooks/guard-command-grammar.mjs";
import { BOUNDED_PIPELINE_ADDITIONAL_ROOTS, CLAUDE_BASH_SHELL_DIALECT_PLATFORM, PIPELINE_STATE_SCRIPT, PO_APPROVAL_GATE_SCRIPT, PO_HUMAN_APPROVAL_SCRIPT } from "./constants.mjs";
import { commandPath, isShellExternalPathToken, pathInside, pipelineSourceRoot } from "./path-containment.mjs";
import { isBoundedCatPipeline, isBoundedGitPipeline, isBoundedGrepPipeline, isBoundedReadOnlyAndChain, isReadOnlyDiagnosticCommand, isReadOnlyDiagnosticCommandWithTrailingStderrRedirect, simpleWords } from "./shell-grammar.mjs";
import { verdict } from "./verdict.mjs";
import { hasExternalOutputRedirect, isNullDeviceStderrRedirect } from "./read-scope.mjs";

export function externalPoSigningOnly() {
  return verdict(
    2,
    "EXTERNAL ACTION REQUIRED (guard-lifecycle-ready, plugin pipeline-core): "
      + "PO setup and approve are human-terminal actions; the agent may prepare and verify only public request/proof artifacts.\n",
  );
}

function poApprovalArgs(command, root, scriptPath) {
  const words = simpleWords(command, root);
  if (!words || words.length < 3 || resolve(root, words[1]) !== scriptPath) return null;
  return words.slice(2);
}

function externalApprovalDirectory(args, root, index) {
  return args[index] === "--directory"
    && typeof args[index + 1] === "string"
    && isAbsolute(args[index + 1])
    && !pathInside(root, resolve(args[index + 1]));
}

/**
 * Preparation and verification handle public, candidate-bound artifacts only.
 * They are agent work.  Setup and signing remain excluded below because they
 * can access the human's private key or terminal passphrase prompt.
 */
export function isAgentPoPublicCommand(command, root) {
  const args = poApprovalArgs(command, root, PO_APPROVAL_GATE_SCRIPT);
  if (!args) return false;
  const feature = (index) => args[index] === "--feature-id" && ["cyb-4", "cyb-5"].includes(args[index + 1]);
  if (["prepare-all", "verify-all"].includes(args[0])) {
    return args[1] === "--repo-root" && args[2] === root
      && externalApprovalDirectory(args, root, 3) && args.length === 5;
  }
  if (["prepare", "verify"].includes(args[0])
    && args[1] === "--repo-root" && args[2] === root
    && externalApprovalDirectory(args, root, 3)) {
    return args.length === 5 || (feature(5) && args.length === 7);
  }
  return false;
}

// The CLI owns the human-signing subset.  Prepare/verify commands remain agent work;
// importing the semantic list prevents this guard from silently drifting when the
// CLI adds another attended signing action.
export function isHumanPoSigningCommand(command, root) {
  const args = poApprovalArgs(command, root, PO_HUMAN_APPROVAL_SCRIPT);
  return args !== null && HUMAN_PO_SIGNING_COMMANDS.includes(args[0]);
}

export function isHumanPoProfileChangeCommand(command, root) {
  const args = poApprovalArgs(command, root, PIPELINE_STATE_SCRIPT);
  return args?.[0] === "po-authority-acknowledge-apply"
    && args.slice(1).some(value => value.startsWith("--profile") || value.startsWith("--reason"));
}

/**
 * Return just the mutating file operands of an in-place sed invocation.
 *
 * Sed's first non-option operand is its program unless an earlier -e/-f
 * supplied one.  It is therefore not a pathname, even when a perfectly
 * ordinary address begins with `/` (for example `/^alpha/d`).  Treating every
 * argv item as a file made that program look like an external absolute path
 * and incorrectly routed an in-root scratch edit through the cross-repository
 * denial.  Keep this parser deliberately small: it recognises only sed's
 * program-bearing options and returns the remaining non-option operands as
 * files.  Unknown options stay options rather than becoming paths.
 */
function sedInPlaceFileOperands(args) {
  const files = [];
  let programSupplied = false;
  let awaitingProgramOption = null;
  let optionsEnded = false;

  for (const arg of args) {
    if (awaitingProgramOption !== null) {
      programSupplied = true;
      awaitingProgramOption = null;
      continue;
    }
    if (!optionsEnded && arg === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && arg.startsWith("--")) {
      if (arg === "--expression" || arg === "--file") awaitingProgramOption = arg;
      else if (arg.startsWith("--expression=") || arg.startsWith("--file=")) programSupplied = true;
      continue;
    }
    if (!optionsEnded && arg.startsWith("-") && arg !== "-") {
      const shortOptions = arg.slice(1);
      const programOptionIndex = shortOptions.search(/[ef]/u);
      if (programOptionIndex >= 0) {
        if (programOptionIndex === shortOptions.length - 1) awaitingProgramOption = shortOptions[programOptionIndex];
        else programSupplied = true;
      }
      continue;
    }
    if (!programSupplied) {
      programSupplied = true;
      continue;
    }
    files.push(arg);
  }
  return files;
}

/**
 * Identify the concrete cross-repository mutation patterns involved in local
 * plugin development. Read-only commands remain handled by the diagnostic
 * allowlist; unknown commands do not gain mutation authority from this helper.
 */
export function isForbiddenCrossRepositoryMutation(command, root, dependencies = {}) {
  const parsed = parseGuardCommand(command, root, { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM });
  if (isAgentPoPublicCommand(command, root)) return false;
  const poArgs = poApprovalArgs(command, root, PO_APPROVAL_GATE_SCRIPT);
  if (poArgs !== null) {
    // GF-078 bug 3: a bare, argument-free --help/--version is read-only and informational --
    // it mutates nothing, in this repository or any other, unlike every other shape this
    // script accepts (which is why every OTHER shape still falls straight through to the
    // blanket refusal below, unchanged). Narrow by construction: exactly one argument,
    // exactly one of the two flags; "prepare --help" or "--help extra" still hits the
    // blanket refusal exactly as before.
    if (poArgs.length === 1 && ["--help", "--version"].includes(poArgs[0])) return false;
    return true;
  }
  if (isBoundedReadOnlyPipeline(parsed, root, BOUNDED_PIPELINE_ADDITIONAL_ROOTS)) return false;
  if (isBoundedGrepPipeline(parsed, root)) return false;
  if (isBoundedCatPipeline(parsed, root, BOUNDED_PIPELINE_ADDITIONAL_ROOTS)) return false;
  if (isBoundedGitPipeline(parsed, root, BOUNDED_PIPELINE_ADDITIONAL_ROOTS)) return false;
  if (isBoundedReadOnlyAndChain(command, root)) return false;
  if (isReadOnlyDiagnosticCommandWithTrailingStderrRedirect(command, root)) return false;
  if (parsed.parseStatus !== "accepted" && hasExternalOutputRedirect(command, root)) return true;
  if (parsed.parseStatus === "accepted" && parsed.redirects.length > 0) {
    return parsed.redirects.some((redirect) => {
      if (isNullDeviceStderrRedirect(redirect.fd, redirect.target)) return false;
      const target = commandPath(redirect.target, root);
      return target !== null && !pathInside(root, target);
    });
  }
  const words = simpleWords(command, root);
  if (!words || words.length === 0) return false;
  const exists = dependencies.existsSyncFn ?? existsSync;
  const executable = basename(words[0]).toLowerCase();
  const args = words.slice(1);

  if (/codex(?:\.exe)?$/iu.test(executable)) {
    const pluginIndex = args.indexOf("plugin");
    if (pluginIndex >= 0) {
      const operation = args[pluginIndex + 1];
      if (["add", "remove", "update", "install", "uninstall"].includes(operation)) return true;
      if (operation === "marketplace"
        && ["add", "remove", "update"].includes(args[pluginIndex + 2])) return true;
    }
  }

  if (["python", "python3", "py"].includes(executable)) {
    const scriptIndex = args.findIndex((arg) => basename(arg) === "update_plugin_cachebuster.py");
    if (scriptIndex >= 0) {
      const target = commandPath(args[scriptIndex + 1], root);
      return !pipelineSourceRoot(root, exists) || target === null || !pathInside(root, target);
    }
  }

  if (executable === "git") {
    const cIndex = args.indexOf("-C");
    if (cIndex >= 0) {
      const target = commandPath(args[cIndex + 1], root);
      if (target !== null && !pathInside(root, target)
        && !isReadOnlyDiagnosticCommand(command, root)) return true;
    }
  }

  const mutatingTargets = new Set([
    "cp", "mv", "rm", "mkdir", "rmdir", "touch", "chmod", "chown", "chgrp",
    "ln", "install", "truncate", "tee", "rsync",
  ]);
  if (mutatingTargets.has(executable)) {
    return args.some((arg) => {
      const target = commandPath(arg, root);
      return target !== null && isShellExternalPathToken(arg) && !pathInside(root, target);
    });
  }
  if (executable === "sed" && args.some((arg) => /^-[^-]*i/u.test(arg) || /^--in-place(?:=|$)/u.test(arg))) {
    return sedInPlaceFileOperands(args).some((arg) => {
      const target = commandPath(arg, root);
      return target !== null && isShellExternalPathToken(arg) && !pathInside(root, target);
    });
  }
  return false;
}

export function isHostOnlyClaudeCaptureInvocation(command, root, toolName = "Bash") {
  if (typeof command !== "string") return false;
  const body = toolName === "PowerShell" ? command.replace(/^\s*&\s+/u, "") : command;
  const parsed = parseGuardCommand(body, root, toolName === "PowerShell" ? {platform:"win32"} : {});
  if (parsed.parseStatus !== "accepted") return false;
  const producers = new Set(["claude-task-output-scope-posttool.mjs", "claude-intake-prompt-capture.mjs"]);
  return parsed.segments.some(segment => {
    const executable = basename(segment.executable.replaceAll("\\", "/")).toLowerCase();
    if (!["node", "node.exe"].includes(executable)) return false;
    return segment.argv.some(word => producers.has(basename(word.replaceAll("\\", "/"))));
  });
}
