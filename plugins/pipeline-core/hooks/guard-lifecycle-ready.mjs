#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Codex implementation-write guard for already Pipeline-governed roots. */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

import {
  ProjectOnboardingReadyError,
  requireProjectOnboardingReady,
} from "../lib/project-onboarding-ready-gate.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "../lib/runtime-projection-v3.mjs";
import {
  hasCodexExistingGitControlMount,
  readCodexHostRepositoryInitAdmission,
} from "../lib/codex-host-layout.mjs";

const GOVERNANCE_MARKERS = [
  ".agent-pipeline/core.lock.json",
  "pipeline.user.yaml",
  ".claude/pipeline.json",
  ".claude/pipeline.yaml",
  ...loadRuntimeProjectionV3OwnedKeys().targets.map((target) => target.path),
].filter((value, index, values) => values.indexOf(value) === index);
const READY_RECEIPT_KEYS = ["intent", "schema", "status"];
const ONBOARDING_SCRIPT = fileURLToPath(new URL("../scripts/project-onboarding-v3.mjs", import.meta.url));
const MIGRATION_SCRIPT = fileURLToPath(new URL("../scripts/runner-profile-migration-v3.mjs", import.meta.url));
const LAUNCH_SCRIPT = fileURLToPath(new URL("../scripts/codex-onboarding-launch.mjs", import.meta.url));
const READBACK_SCRIPT = fileURLToPath(new URL("../scripts/codex-project-runtime-readback-host.mjs", import.meta.url));
const APP_SERVER_SCRIPT = fileURLToPath(new URL("../scripts/codex-app-server-health.mjs", import.meta.url));
const START_PREFLIGHT_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-start-preflight.mjs", import.meta.url));
const HOST_REPOSITORY_INIT_SCRIPT = fileURLToPath(new URL("../scripts/codex-host-repository-init.mjs", import.meta.url));
const HEX = /^[a-f0-9]{64}$/u;
const HOST_INIT_CROSS_VIEW_STATUSES = new Set([
  "repository-mount-read-only",
  "repository-control-path-invalid",
]);

function verdict(exitCode, stderr = "") {
  return { exitCode, stderr };
}

function exactReadyReceipt(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(READY_RECEIPT_KEYS)
    && value.schema === "pipeline.project-onboarding-ready-gate.v1"
    && value.status === "ready"
    && value.intent === "session";
}

function blocked() {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + "Pipeline-governed project writes require an exact V4 ready result for session intent.\n"
      + "Repair or complete onboarding through the typed lifecycle action before retrying.\n",
  );
}

function externalRestartOnly() {
  return verdict(
    2,
    "EXTERNAL ACTION REQUIRED (guard-lifecycle-ready, plugin pipeline-core): "
      + "restart-process is external-terminal/user-copy-only and must never be executed through a Codex tool call.\n"
      + "Stop this session, show the exact lifecycle launch.copyCommand in a fenced code block, "
      + "and ask the user to run it in a real external terminal.\n",
  );
}

function protectedStateWriterOnly() {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + ".claude/pipeline-state.json is writer-owned and must not be edited directly.\n"
      + "Use the exact sanctioned State or digest-bound lifecycle writer action.\n",
  );
}

function crossRepositoryMutationBlocked() {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + "A governed consumer session may write only inside its own physical project root.\n"
      + "Pipeline source, another repository, marketplace metadata, cachebuster updates, "
      + "and plugin installation require a separate session rooted at the exact target "
      + "plus their own explicit PO authorization.\n",
  );
}

function pathInside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Reject lexical escapes and escapes through an existing symlink ancestor. */
export function isProjectWritePath(filePath, root, dependencies = {}) {
  if (typeof filePath !== "string" || filePath.trim() === "" || filePath.includes("\0")) return false;
  const exists = dependencies.existsSyncFn ?? existsSync;
  const realpath = dependencies.realpathSyncFn ?? realpathSync;
  const requested = resolve(root, filePath);
  if (!pathInside(root, requested)) return false;
  let ancestor = requested;
  try {
    while (ancestor !== root && !exists(ancestor)) ancestor = dirname(ancestor);
    return pathInside(root, realpath(ancestor));
  } catch {
    return false;
  }
}

function parseSimpleShellWords(command, root) {
  if (typeof command !== "string" || command.trim() === "" || /[\0\r\n]/u.test(command)) return null;
  const words = [];
  let value = "";
  let mode = "plain";
  let started = false;
  let expands = false;
  const finish = () => {
    if (!started) return;
    if (expands) {
      if (value === "$PWD" || value === "${PWD}") value = root;
      else throw new Error("unsupported shell expansion");
    }
    words.push(value);
    value = "";
    started = false;
    expands = false;
  };
  try {
    for (let index = 0; index < command.length; index += 1) {
      const char = command[index];
      if (mode === "single") {
        if (char === "'") mode = "plain";
        else value += char;
        started = true;
        continue;
      }
      if (mode === "double") {
        if (char === "\"") {
          mode = "plain";
        } else if (char === "\\") {
          index += 1;
          if (index >= command.length) return null;
          value += command[index];
        } else {
          if (char === "$" || char === "`") expands = true;
          value += char;
        }
        started = true;
        continue;
      }
      if (/\s/u.test(char)) {
        finish();
        continue;
      }
      if (char === "'") {
        mode = "single";
        started = true;
        continue;
      }
      if (char === "\"") {
        mode = "double";
        started = true;
        continue;
      }
      if (char === "\\") {
        index += 1;
        if (index >= command.length) return null;
        value += command[index];
        started = true;
        continue;
      }
      if (/[;&|<>()]/u.test(char)) return null;
      if (char === "$" || char === "`") expands = true;
      value += char;
      started = true;
    }
    if (mode !== "plain") return null;
    finish();
  } catch {
    return null;
  }
  return words;
}

function exactRoot(args, root, index) {
  return args[index] === "--root" && args[index + 1] === root;
}

/**
 * Keep fail-closed lifecycle states diagnosable without turning arbitrary
 * shell syntax into a write bypass.  Only one simple command is accepted; the
 * parser already rejects control operators, redirections and command
 * substitution.
 */
export function isReadOnlyDiagnosticCommand(command, root) {
  const words = parseSimpleShellWords(command, root);
  if (!words || words.length === 0) return false;
  const executable = basename(words[0]).toLowerCase();
  const args = words.slice(1);
  if (executable === "pwd") return args.length === 0 || (args.length === 1 && args[0] === "-P");
  if (["ls", "rg", "grep", "cat", "head", "tail", "wc", "stat", "file"].includes(executable)) {
    return !args.some((arg) => arg === "--files-with-matches" && executable === "grep");
  }
  if (executable === "sed") {
    return !args.some((arg) => /^-[^-]*[iew]/u.test(arg) || /^--(?:in-place|expression|file)(?:=|$)/u.test(arg));
  }
  if (executable === "find") {
    return !args.some((arg) => ["-delete", "-exec", "-execdir", "-fprint", "-fprintf", "-fls", "-ok", "-okdir"].includes(arg));
  }
  if (executable !== "git") return false;
  let index = 0;
  if (args[index] === "-C") index += 2;
  const subcommand = args[index];
  const subargs = args.slice(index + 1);
  if (["status", "diff", "log", "show", "rev-parse", "ls-files", "ls-tree", "for-each-ref"].includes(subcommand)) {
    return true;
  }
  if (subcommand === "branch") {
    return subargs.length === 0 || subargs.every((arg) =>
      arg === "--list" || arg === "--show-current" || arg === "--contains" || arg.startsWith("--format="));
  }
  if (subcommand === "remote") return subargs.length === 0 || (subargs.length === 1 && subargs[0] === "-v");
  return subcommand === "config"
    && subargs.length >= 2
    && ["--get", "--get-all", "--get-regexp"].includes(subargs[0]);
}

function pipelineSourceRoot(root, exists = existsSync) {
  return exists(join(root, "plugins", "pipeline-core", ".codex-plugin", "plugin.json"))
    && exists(join(root, "harness", "scripts", "verify.mjs"));
}

function commandPath(value, root) {
  if (typeof value !== "string" || value === "" || value.startsWith("-")) return null;
  return resolve(root, value);
}

/**
 * Identify the concrete cross-repository mutation patterns involved in local
 * plugin development. Read-only commands remain handled by the diagnostic
 * allowlist; unknown commands do not gain mutation authority from this helper.
 */
export function isForbiddenCrossRepositoryMutation(command, root, dependencies = {}) {
  const words = parseSimpleShellWords(command, root);
  // The simple-word parser intentionally rejects redirection.  Detect an
  // absolute or parent-relative redirection target before its rejection can
  // turn into a ready-session escape from the project root.
  if (!words || words.length === 0) {
    const redirects = [...command.matchAll(/(?:^|[\s;|&])\d*(?:>>?|<>|>&|<&)\s*["']?([^\s"']+)/gu)];
    if (redirects.length === 0) return false;
    return redirects.some((redirect) => {
      const target = redirect[1];
      return target.includes("$") || target.includes("`") || target.includes("(")
        || !pathInside(root, resolve(root, target));
    });
  }
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
      return target !== null && isAbsolute(arg) && !pathInside(root, target);
    });
  }
  if (executable === "sed" && args.some((arg) => /^-[^-]*i/u.test(arg) || /^--in-place(?:=|$)/u.test(arg))) {
    return args.some((arg) => {
      const target = commandPath(arg, root);
      return target !== null && isAbsolute(arg) && !pathInside(root, target);
    });
  }
  return false;
}

function sanctionedOnboardingArgs(args, root) {
  if (args[0] === "inspect"
    && exactRoot(args, root, 1)
    && (args.length === 3
      || (args.length === 5 && args[3] === "--intent"
        && ["onboarding", "bootstrap", "session", "dispatch"].includes(args[4])))) return true;
  if (args[0] === "continuity" && args[1] === "inspect"
    && exactRoot(args, root, 2) && args.length === 4) return true;
  if (["plan", "plan-runtime", "plan-repair", "plan-readback"].includes(args[0])
    && exactRoot(args, root, 1) && args.length === 3) return true;
  if (["apply-portable-seed", "initialize-runtime", "apply-repair", "apply-readback"].includes(args[0])
    && exactRoot(args, root, 1)
    && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
    && args[5] === "--activate" && args.length === 6) return true;
  if (args[0] === "kickoff" && args[1] === "plan"
    && exactRoot(args, root, 2) && args[4] === "--goal"
    && typeof args[5] === "string" && args[5].trim() !== "" && args.length === 6) return true;
  return args[0] === "kickoff" && args[1] === "apply"
    && exactRoot(args, root, 2) && args[4] === "--goal"
    && typeof args[5] === "string" && args[5].trim() !== ""
    && args[6] === "--plan-sha256" && HEX.test(args[7] ?? "")
    && args[8] === "--activate" && args.length === 9;
}

function sanctionedMigrationArgs(args, root) {
  if (["inspect", "plan"].includes(args[0]) && exactRoot(args, root, 1) && args.length === 3) return true;
  if (args[0] !== "apply" || !exactRoot(args, root, 1)) return false;
  return (args.length === 4 && args[3] === "--activate")
    || (args.length === 5 && args[3] === "--initialize-missing-runtime" && args[4] === "--activate");
}

export function isSanctionedLifecycleCommand(command, root) {
  const words = parseSimpleShellWords(command, root);
  if (!words || words.length < 2 || !["node", process.execPath].includes(words[0])) return false;
  const [script, ...args] = words.slice(1);
  if (script === ONBOARDING_SCRIPT) return sanctionedOnboardingArgs(args, root);
  if (script === MIGRATION_SCRIPT) return sanctionedMigrationArgs(args, root);
  if (script === LAUNCH_SCRIPT) {
    return exactRoot(args, root, 0)
      && args[2] === "--barrier-sha256" && HEX.test(args[3] ?? "")
      && args[4] === "--activate" && args.length === 5;
  }
  if (script === READBACK_SCRIPT) return exactRoot(args, root, 0) && args.length === 2;
  if (script === START_PREFLIGHT_SCRIPT) return args.length === 0;
  if (script === HOST_REPOSITORY_INIT_SCRIPT) {
    if (args[0] === "plan") return exactRoot(args, root, 1) && args.length === 3;
    return args[0] === "apply"
      && exactRoot(args, root, 1)
      && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
      && args[5] === "--activate" && args.length === 6;
  }
  return script === APP_SERVER_SCRIPT
    && ["--recover", "--doctor"].includes(args[0])
    && args.length === 1;
}

export function evaluateLifecycleReadyGuard(input, dependencies = {}) {
  const toolName = String(input?.tool_name ?? "");
  if (!["Bash", "Edit", "Write"].includes(toolName)) return verdict(0);
  if (["Edit", "Write"].includes(toolName)) {
    const filePath = input?.tool_input?.file_path;
    if (typeof filePath !== "string" || filePath.trim() === "" || filePath.includes("\0")) return blocked();
  } else {
    const command = input?.tool_input?.command;
    if (typeof command !== "string" || command.trim() === "" || command.includes("\0")) return blocked();
  }

  let root;
  try {
    const requestedRoot = dependencies.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    root = (dependencies.realpathSyncFn ?? realpathSync)(resolve(requestedRoot));
  } catch {
    return blocked();
  }

  let governed;
  try {
    const exists = dependencies.existsSyncFn ?? existsSync;
    governed = GOVERNANCE_MARKERS.some((marker) => exists(join(root, marker)));
  } catch {
    return blocked();
  }
  if (!governed) return verdict(0);
  if (["Edit", "Write"].includes(toolName)) {
    if (!isProjectWritePath(input.tool_input.file_path, root, dependencies)) {
      return crossRepositoryMutationBlocked();
    }
    const requested = resolve(root, input.tool_input.file_path);
    if (requested === join(root, ".claude", "pipeline-state.json")) {
      return protectedStateWriterOnly();
    }
  }
  if (toolName === "Bash"
    && isForbiddenCrossRepositoryMutation(input.tool_input.command, root, dependencies)) {
    return crossRepositoryMutationBlocked();
  }
  if (toolName === "Bash" && isReadOnlyDiagnosticCommand(input.tool_input.command, root)) {
    return verdict(0);
  }
  if (toolName === "Bash" && input.tool_input.command.includes(LAUNCH_SCRIPT)) {
    return externalRestartOnly();
  }

  let receipt;
  try {
    receipt = (dependencies.requireProjectOnboardingReadyFn ?? requireProjectOnboardingReady)({
      rootDir: root,
      intent: "session",
    });
  } catch (error) {
    // Codex 0.145 may execute PreToolUse against the physical host Git
    // directory while the successful bootstrap command sees protected virtual
    // control mounts. Accept only the explicit host-init admission written by
    // the confirmed lifecycle action and bound to this root, stable authority,
    // and immutable kickoff history, and only when the native observation
    // failed with the two exact repository-control statuses produced by that
    // cross-view mismatch. App Server, runtime, continuity, malformed
    // observations, and unknown exceptions must never inherit this admission.
    // The prepared sprint:NONE follow-up owns replacing this narrow hotfix
    // fallback with one native cross-view session attestation.
    const crossViewRepositoryFailure = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && HOST_INIT_CROSS_VIEW_STATUSES.has(error.lifecycleStatus);
    if (crossViewRepositoryFailure) {
      try {
        const admission = (dependencies.readCodexHostRepositoryInitAdmissionFn
          ?? readCodexHostRepositoryInitAdmission)(root);
        if (admission?.gitVersion) return verdict(0);
      } catch {}
      try {
        const existingControlMount = (dependencies.hasCodexExistingGitControlMountFn
          ?? hasCodexExistingGitControlMount)(root);
        if (existingControlMount === true) return verdict(0);
      } catch {}
    }
    return toolName === "Bash"
      && isSanctionedLifecycleCommand(input.tool_input.command, root)
      ? verdict(0)
      : blocked();
  }
  return exactReadyReceipt(receipt) ? verdict(0) : blocked();
}

export function main(rawInput = undefined, dependencies = {}) {
  let input;
  try {
    const raw = rawInput ?? readFileSync(0, "utf8");
    input = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    const result = blocked();
    (dependencies.writeErrorFn ?? ((value) => process.stderr.write(value)))(result.stderr);
    return result.exitCode;
  }
  const result = evaluateLifecycleReadyGuard(input, dependencies);
  if (result.stderr) {
    (dependencies.writeErrorFn ?? ((value) => process.stderr.write(value)))(result.stderr);
  }
  return result.exitCode;
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) process.exitCode = main();
