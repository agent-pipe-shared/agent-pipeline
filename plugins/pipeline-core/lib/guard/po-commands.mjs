// SPDX-License-Identifier: SUL-1.0
// Guard module "po-commands" (layer 4), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { PASSIVE_READ_CREDENTIAL_ROOTS } from "../passive-read-policy.mjs";
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

// C6g1 F1 (ALF-C-C6G1-CORR-A): closed option tables for the cp/mv/install write-target judgement. An option that is
// not listed could consume or name a path operand, so the whole command fails closed instead of being guessed at.
const COPY_MOVE_INSTALL_OPTIONS = Object.freeze({
  cp: Object.freeze({
    shortFlags: "abdfHilLnPpRrsTuvxZ",
    shortValues: "St",
    longFlags: ["archive", "attributes-only", "backup", "copy-contents", "debug", "dereference", "force", "interactive", "link",
      "no-clobber", "no-dereference", "no-target-directory", "one-file-system", "parents", "preserve", "recursive", "reflink",
      "remove-destination", "strip-trailing-slashes", "symbolic-link", "update", "verbose", "context", "help", "version"],
    longValues: ["no-preserve", "sparse", "suffix", "target-directory"],
  }),
  mv: Object.freeze({
    shortFlags: "bfinTuvZ",
    shortValues: "St",
    longFlags: ["backup", "debug", "exchange", "force", "interactive", "no-clobber", "no-copy", "no-target-directory",
      "strip-trailing-slashes", "update", "verbose", "context", "help", "version"],
    longValues: ["suffix", "target-directory"],
  }),
  install: Object.freeze({
    shortFlags: "bcCdDpsTvZ",
    shortValues: "gmoSt",
    longFlags: ["backup", "compare", "debug", "directory", "no-target-directory", "preserve-timestamps", "preserve-context",
      "strip", "verbose", "context", "help", "version"],
    longValues: ["group", "mode", "owner", "strip-program", "suffix", "target-directory"],
  }),
});

/**
 * Every operand a cp/mv/install command writes, creates or removes, or null when an option cannot be placed.
 * cp and install write the destination (the -t/--target-directory value, else the last operand) and only read their
 * sources; mv also REMOVES every source; install -d creates every operand. `-t` is recognised glued, inside a short-option
 * cluster (-rtDIR, -vt DIR) and as any unambiguous prefix of --target-directory, as the underlying getopt does.
 */
function copyMoveInstallWrittenOperands(executable, args, readSources = null) {
  const spec = COPY_MOVE_INSTALL_OPTIONS[executable];
  const operands = [];
  let targetDirectory = null;
  let targetCount = 0;
  let createsDirectories = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") { operands.push(...args.slice(index + 1)); break; }
    if (arg === "-" || !arg.startsWith("-")) { operands.push(arg); continue; }
    if (arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      const name = arg.slice(2, equals < 0 ? undefined : equals);
      const known = [...spec.longFlags, ...spec.longValues];
      const matches = known.includes(name) ? [name] : known.filter((candidate) => name !== "" && candidate.startsWith(name));
      if (matches.length !== 1) return null;
      const option = matches[0];
      if (spec.longValues.includes(option)) {
        const value = equals >= 0 ? arg.slice(equals + 1) : args[++index];
        if (value === undefined) return null;
        if (option === "target-directory") { targetCount += 1; targetDirectory = value; }
      }
      if (executable === "install" && option === "directory") createsDirectories = true;
      continue;
    }
    for (let at = 1; at < arg.length; at += 1) {
      const letter = arg[at];
      if (spec.shortValues.includes(letter)) {
        const glued = arg.slice(at + 1);
        const value = glued !== "" ? glued : args[++index];
        if (value === undefined) return null;
        if (letter === "t") { targetCount += 1; targetDirectory = value; }
        break;
      }
      if (!spec.shortFlags.includes(letter)) return null;
      if (executable === "install" && letter === "d") createsDirectories = true;
    }
  }
  if (targetCount > 1) return null;
  // C6g1 G1-D3-F1: a cp/install source is only READ; hand it back so the caller can apply the passive read policy to it.
  if (readSources !== null && executable !== "mv" && !createsDirectories) {
    readSources.push(...(targetDirectory === null ? operands.slice(0, -1) : operands));
  }
  const written = [];
  if (executable === "install" && createsDirectories) written.push(...operands);
  else if (targetDirectory === null && operands.length > 0) written.push(operands[operands.length - 1]);
  if (targetDirectory !== null) written.push(targetDirectory);
  if (executable === "mv") written.push(...(targetDirectory === null ? operands.slice(0, -1) : operands));
  return written;
}

const CREDENTIAL_SECRET_BASENAME = new RegExp(
  PASSIVE_READ_CREDENTIAL_ROOTS.secretBasenameRegex.source, PASSIVE_READ_CREDENTIAL_ROOTS.secretBasenameRegex.flags,
);

/**
 * C6g1 G1-D3-F1 (AC-179): an OUTSIDE cp/install source is a read "subject to the read policy". Lexical judgement against the
 * passive-read-policy credential declaration only (home-relative credential roots, absolute credential paths, secret basenames);
 * every other outside source, and every in-project source, keeps its previous behaviour. An unexpandable `~user` fails closed.
 */
function isCredentialCopySource(arg, root) {
  if (typeof arg !== "string" || arg === "" || arg.startsWith("-")) return false;
  const home = homedir();
  let raw = arg;
  if (arg === "~") raw = home;
  else if (arg.startsWith("~/") || arg.startsWith("~\\")) raw = join(home, arg.slice(2));
  else if (arg.startsWith("~")) return true;
  const target = resolve(root, raw);
  if (pathInside(root, target)) return false;
  const fold = (path) => (process.platform === "win32" ? path.toLowerCase() : path);
  const roots = [
    ...PASSIVE_READ_CREDENTIAL_ROOTS.homeRelativePaths.map((path) => resolve(home, path)),
    ...PASSIVE_READ_CREDENTIAL_ROOTS.posixAbsolutePaths,
  ];
  return roots.some((credentialRoot) => pathInside(fold(credentialRoot), fold(target)))
    || CREDENTIAL_SECRET_BASENAME.test(basename(target));
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
    let written = args;
    if (["cp", "mv", "install"].includes(executable)) {
      // C6g1 F1: judge EVERY operand written, created or removed (destination or -t value, every mv source, every install -d
      // operand); an outside READ source of cp/install stays allowed, and an option the closed tables cannot place fails closed.
      const readSources = [];
      written = copyMoveInstallWrittenOperands(executable, args, readSources);
      if (written === null) return true;
      if (readSources.some((arg) => isCredentialCopySource(arg, root))) return true;
      return written.some((arg) => {
        const target = commandPath(arg, root);
        return target !== null && !pathInside(root, target);
      });
    }
    return written.some((arg) => {
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
