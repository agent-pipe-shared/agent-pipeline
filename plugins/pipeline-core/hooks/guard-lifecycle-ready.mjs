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
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
  ProjectOnboardingReadyError,
  requireProjectOnboardingReady,
} from "../lib/project-onboarding-ready-gate.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "../lib/runtime-projection-v3.mjs";
import {
  hasCodexExistingGitControlMount,
  readCodexHostRepositoryInitAdmission,
} from "../lib/codex-host-layout.mjs";
import {
  isBoundedReadOnlyPipeline,
  parseGuardCommand,
} from "./guard-command-grammar.mjs";

const GOVERNANCE_MARKERS = [
  ".agent-pipeline/core.lock.json",
  "pipeline.user.yaml",
  "project/pipeline.json",
  "project/pipeline.yaml",
  ".claude/pipeline.json",
  ".claude/pipeline.yaml",
  ...loadRuntimeProjectionV3OwnedKeys().targets.map((target) => target.path),
].filter((value, index, values) => values.indexOf(value) === index);
const READY_RECEIPT_KEYS = ["intent", "schema", "status"];
const ONBOARDING_SCRIPT = fileURLToPath(new URL("../scripts/project-onboarding-v3.mjs", import.meta.url));
const MIGRATION_SCRIPT = fileURLToPath(new URL("../scripts/runner-profile-migration-v3.mjs", import.meta.url));
const V3_BOOTSTRAP_AUTHORITY_SCRIPT = fileURLToPath(new URL("../scripts/v3-bootstrap-authority.mjs", import.meta.url));
const LAUNCH_SCRIPT = fileURLToPath(new URL("../scripts/codex-onboarding-launch.mjs", import.meta.url));
const READBACK_SCRIPT = fileURLToPath(new URL("../scripts/codex-project-runtime-readback-host.mjs", import.meta.url));
const APP_SERVER_SCRIPT = fileURLToPath(new URL("../scripts/codex-app-server-health.mjs", import.meta.url));
const START_PREFLIGHT_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-start-preflight.mjs", import.meta.url));
const HOST_REPOSITORY_INIT_SCRIPT = fileURLToPath(new URL("../scripts/codex-host-repository-init.mjs", import.meta.url));
const SESSION_CLEANUP_SCRIPT = fileURLToPath(new URL("../scripts/session-cleanup.mjs", import.meta.url));
const PIPELINE_STATE_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-state.mjs", import.meta.url));
const PO_PROFILE_REPAIR_SCRIPT = fileURLToPath(new URL("../scripts/po-gate-profile-repair.mjs", import.meta.url));
const PROJECT_AUTHORITY_MIGRATION_SCRIPT = fileURLToPath(new URL("../scripts/project-authority-migration.mjs", import.meta.url));
const HUMAN_OVERRIDE_SCRIPT = fileURLToPath(new URL("../scripts/guard-human-override.mjs", import.meta.url));
const PRIVATE_OVERLAY_SCRIPT = fileURLToPath(new URL("../scripts/codex-private-overlay-activation.mjs", import.meta.url));
const PO_HUMAN_APPROVAL_SCRIPT = fileURLToPath(new URL("../scripts/po-human-approval.mjs", import.meta.url));
const PO_APPROVAL_GATE_SCRIPT = fileURLToPath(new URL("../scripts/po-approval-gate.mjs", import.meta.url));
const HEX = /^[a-f0-9]{64}$/u;
const HOST_INIT_CROSS_VIEW_STATUSES = new Set([
  "repository-mount-read-only",
  "repository-control-path-invalid",
]);
const CONTROLLING_NON_READY_STATUSES = new Set(
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
);

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

function blocked(code = "GUARD-LIFECYCLE-NOT-READY", lifecycleStatus = null, retryActions = []) {
  const grammarGuidance = {
    "GUARD-PARSE-UNSUPPORTED": "The command is outside the closed Pipeline shell grammar.",
    "GUARD-OPERATOR-UNAPPROVED": "The command contains an unapproved shell operator.",
    "GUARD-REDIRECT-UNAPPROVED": "The command contains an unapproved shell redirection.",
  };
  const typedLifecycleStatus = code === "GUARD-LIFECYCLE-NOT-READY"
    && CONTROLLING_NON_READY_STATUSES.has(lifecycleStatus)
    ? lifecycleStatus
    : null;
  const grammarReason = grammarGuidance[code];
  if (grammarReason) {
    const retryEnvelope = {
      schema: "pipeline.guard-retry-actions.v1",
      retryActions,
    };
    return verdict(
      2,
      "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
        + `${code}: ${grammarReason}\n`
        + "Use one simple shell command per tool call; issue independent read-only commands as separate parallel tool calls.\n"
        + "Do not retry by varying &&, ;, newline composition, pipelines, or redirects.\n"
        + "Only the exact bounded rg-to-head diagnostic pipeline is admitted as an exception.\n"
        + `${JSON.stringify(retryEnvelope)}\n`,
    );
  }
  const guidance = typedLifecycleStatus === null
    ? [
      "Pipeline-governed project writes require an exact V4 ready result for session intent.",
      "Re-run the typed project-onboarding-v3 session inspection and use only its returned nextAction.",
    ]
    : [
      `Pipeline session readiness is ${typedLifecycleStatus}.`,
      "Re-run the typed project-onboarding-v3 inspection with intent session and use only its returned nextAction.",
    ];
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${code}: `
      + `${guidance[0]}\n`
      + `${guidance[1]}\n`,
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
      + "Pipeline State is writer-owned and must not be edited directly.\n"
      + "Use the exact sanctioned State or digest-bound lifecycle writer action.\n",
  );
}

function crossRepositoryMutationBlocked() {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + "GUARD-CROSS-REPO-MUTATION: "
      + "A governed consumer session may write only inside its own physical project root.\n"
      + "Pipeline source, another repository, marketplace metadata, cachebuster updates, "
      + "and plugin installation require a separate session rooted at the exact target "
      + "plus their own explicit PO authorization.\n",
  );
}

function externalPoSigningOnly() {
  return verdict(
    2,
    "EXTERNAL ACTION REQUIRED (guard-lifecycle-ready, plugin pipeline-core): "
      + "PO setup and approve are human-terminal actions; the agent may prepare and verify only public request/proof artifacts.\n",
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

function simpleWords(command, root, options = {}) {
  const parsed = parseGuardCommand(command, root, options);
  if (parsed.parseStatus !== "accepted"
    || parsed.segments.length !== 1
    || parsed.operators.length !== 0
    || parsed.redirects.length !== 0) return null;
  return [parsed.segments[0].executable, ...parsed.segments[0].argv];
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
  const parsed = parseGuardCommand(command, root);
  if (isBoundedReadOnlyPipeline(parsed, root)) return true;
  const words = simpleWords(command, root);
  if (!words || words.length === 0) return false;
  const executable = basename(words[0]).toLowerCase();
  const args = words.slice(1);
  if (executable === "pwd") return args.length === 0 || (args.length === 1 && args[0] === "-P");
  if (["node", "node.exe"].includes(executable)) {
    return args.length === 2
      && args[0] === "--check"
      && !args[1].startsWith("-")
      && isProjectWritePath(args[1], root);
  }
  if (executable === "sha256sum") {
    const path = args.length === 1
      ? args[0]
      : args.length === 2 && args[0] === "--"
        ? args[1]
        : null;
    return typeof path === "string"
      && !path.startsWith("-")
      && isProjectWritePath(path, root);
  }
  if (executable === "shasum") {
    return args.length === 3
      && ["-a", "--algorithm"].includes(args[0])
      && args[1] === "256"
      && !args[2].startsWith("-")
      && isProjectWritePath(args[2], root);
  }
  if (["certutil", "certutil.exe"].includes(executable)) {
    return args.length === 3
      && args[0].toLowerCase() === "-hashfile"
      && !args[1].startsWith("-")
      && args[2].toUpperCase() === "SHA256"
      && isProjectWritePath(args[1], root);
  }
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
  // Fetch updates only remote-tracking/object state; it never changes the
  // index or working tree.  A stale or migration-required lifecycle must not
  // prevent an operator from observing the current upstream.  Destructive
  // adoption remains separately guarded at checkout/switch time.
  if (subcommand === "fetch") return true;
  return subcommand === "config"
    && subargs.length >= 2
    && ["--get", "--get-all", "--get-regexp"].includes(subargs[0]);
}

/**
 * Recover only independent semicolon-separated diagnostics.  This is a
 * correction hint, never an execution bypass: each returned argv must pass
 * the same closed single-command read-only policy on its own.
 */
export function retryActionsForDeniedCommand(command, root) {
  if (typeof command !== "string" || command.trim() === ""
    || /[\0\r\n`]/u.test(command) || /\$\s*\(/u.test(command)) return [];
  const parts = [];
  let quote = null;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote !== "'" && char === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === ";") {
      parts.push(command.slice(start, index).trim());
      start = index + 1;
      continue;
    }
    if ("|&<>()".includes(char)) return [];
  }
  if (quote !== null || escaped || parts.length === 0) return [];
  parts.push(command.slice(start).trim());
  if (parts.some((part) => part === "")) return [];
  const actions = [];
  for (const part of parts) {
    const parsed = parseGuardCommand(part, root);
    if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
      || parsed.operators.length !== 0 || parsed.redirects.length !== 0
      || !isReadOnlyDiagnosticCommand(part, root)) return [];
    actions.push({
      executable: parsed.segments[0].executable,
      argv: [...parsed.segments[0].argv],
      mutation: false,
      requiresConfirmation: false,
      executionBoundary: "separate-tool-call",
      expected: { exitCodes: [0, 1] },
    });
  }
  return actions;
}

function pipelineSourceRoot(root, exists = existsSync) {
  return exists(join(root, "plugins", "pipeline-core", ".codex-plugin", "plugin.json"))
    && exists(join(root, "harness", "scripts", "verify.mjs"));
}

function commandPath(value, root) {
  if (typeof value !== "string" || value === "" || value.startsWith("-")) return null;
  return resolve(root, value);
}

function hasExternalOutputRedirect(command, root) {
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote !== null) {
      if (char === quote) quote = null;
      else if (quote === "\"" && char === "\\") index += 1;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char !== ">") continue;
    if (command[index + 1] === ">" || command[index + 1] === "&") continue;
    let cursor = index + 1;
    while (cursor < command.length && /\s/u.test(command[cursor])) cursor += 1;
    let target = "";
    while (cursor < command.length && !/\s/u.test(command[cursor])
      && !"|;&<>()".includes(command[cursor])) {
      target += command[cursor];
      cursor += 1;
    }
    const resolved = commandPath(target, root);
    if (resolved !== null && !pathInside(root, resolved)) return true;
  }
  return false;
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

function isHumanPoSigningCommand(command, root) {
  const args = poApprovalArgs(command, root, PO_HUMAN_APPROVAL_SCRIPT);
  return args !== null && ["setup", "approve", "approve-all"].includes(args[0]);
}

/**
 * Identify the concrete cross-repository mutation patterns involved in local
 * plugin development. Read-only commands remain handled by the diagnostic
 * allowlist; unknown commands do not gain mutation authority from this helper.
 */
export function isForbiddenCrossRepositoryMutation(command, root, dependencies = {}) {
  const parsed = parseGuardCommand(command, root);
  if (isAgentPoPublicCommand(command, root)) return false;
  if (poApprovalArgs(command, root, PO_APPROVAL_GATE_SCRIPT) !== null) return true;
  if (isBoundedReadOnlyPipeline(parsed, root)) return false;
  if (parsed.parseStatus !== "accepted" && hasExternalOutputRedirect(command, root)) return true;
  if (parsed.parseStatus === "accepted" && parsed.redirects.length > 0) {
    return parsed.redirects.some((redirect) => {
      if (redirect.fd === 2
        && (redirect.target === "/dev/null" || redirect.target.toLowerCase() === "nul")) return false;
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
  if (["plan", "plan-runtime", "plan-repair", "plan-readback", "plan-source-recovery", "plan-manifest-repair"].includes(args[0])
    && exactRoot(args, root, 1) && args.length === 3) return true;
  if (["plan-source-recovery", "plan-manifest-repair"].includes(args[0])
    && exactRoot(args, root, 1) && args.length === 3) return true;
  if (args[0] === "apply-manifest-repair"
    && exactRoot(args, root, 1)
    && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
    && args[5] === "--activate" && args.length === 6) return true;
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

function sanctionedSessionCleanupArgs(args, root) {
  if (["start", "status", "release-binding", "plan-recovery", "plan-privatization"].includes(args[0])) {
    return args[1] === "--repo" && args[2] === root && args.length === 3;
  }
  if (["apply-recovery", "apply-privatization"].includes(args[0])) {
    return args[1] === "--repo" && args[2] === root
      && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
      && args[5] === "--activate" && args.length === 6;
  }
  return args[0] === "cleanup"
    && args[1] === "--repo" && args[2] === root
    && args[3] === "--session-descriptor"
    && /^[A-Za-z0-9._-]{1,80}$/u.test(args[4] ?? "")
    && args[5] === "--expected-descriptor-sha256"
    && HEX.test(args[6] ?? "")
    && args.length === 7;
}

/**
 * A partially initialized lifecycle must not strand Git's own reversible
 * operation state. This admits only the exact local abort; ordinary status,
 * diff and rev-parse readback already use the read-only diagnostic path.
 */
export function isNarrowRepositoryRecoveryCommand(command, root) {
  const words = simpleWords(command, root);
  if (!words) return false;
  let index = 0;
  if (basename(words[index]).toLowerCase() !== "git") return false;
  index += 1;
  if (words[index] === "-C") {
    const target = words[index + 1];
    if (typeof target !== "string" || resolve(root, target) !== root) return false;
    index += 2;
  }
  return words[index] === "rebase"
    && words[index + 1] === "--abort"
    && index + 2 === words.length;
}

function sanctionedPoAuthorityRebindArgs(args) {
  if (args[0] === "po-authority-decision-plan" && args.length === 1) return true;
  if (args[0] === "po-authority-decision-select") {
    return args[1] === "--plan-sha256" && HEX.test(args[2] ?? "")
      && args[3] === "--planned-at"
      && typeof args[4] === "string" && Number.isFinite(Date.parse(args[4]))
      && new Date(args[4]).toISOString() === args[4]
      && args[5] === "--selection" && new Set(["prd", "spec"]).has(args[6])
      && args.length === 7;
  }
  if (args[0] === "po-authority-decision-apply") {
    return args[1] === "--plan-sha256" && HEX.test(args[2] ?? "")
      && args[3] === "--selection-digest" && HEX.test(args[4] ?? "")
      && args[5] === "--planned-at"
      && typeof args[6] === "string" && Number.isFinite(Date.parse(args[6]))
      && new Date(args[6]).toISOString() === args[6]
      && args[7] === "--selection" && args[8] === "spec"
      && args[9] === "--activate" && args.length === 10;
  }
  return args[0] === "po-authority-rebind-apply"
    && args[1] === "--plan-sha256"
    && HEX.test(args[2] ?? "")
    && args[3] === "--updated-at"
    && typeof args[4] === "string"
    && Number.isFinite(Date.parse(args[4]))
    && new Date(args[4]).toISOString() === args[4]
    && args[5] === "--activate"
    && args.length === 6;
}

function sanctionedPoProfileRepairArgs(args, root) {
  if (args[0] === "plan") return exactRoot(args, root, 1) && args.length === 3;
  return args[0] === "apply"
    && exactRoot(args, root, 1)
    && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
    && args[5] === "--activate" && args.length === 6;
}

function sanctionedProjectAuthorityMigrationArgs(args, root) {
  if (["inspect", "plan"].includes(args[0])) {
    return exactRoot(args, root, 1) && args.length === 3;
  }
  if (args[0] === "recover" && exactRoot(args, root, 1) && args.length === 3) return true;
  return ["apply", "recover"].includes(args[0])
    && exactRoot(args, root, 1)
    && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
    && args[5] === "--activate" && args.length === 6;
}

function sanctionedHumanOverrideArgs(args, root) {
  const exactAuthorRoot = (index) => args[index] === "--author-source-root"
    && args[index + 1] === join(root, "plugins", "pipeline-core");
  if (args[0] === "plan") {
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--request-sha256" && HEX.test(args[4] ?? "")
    return base && (args.length === 5 || (exactAuthorRoot(5) && args.length === 7));
  }
  if (args[0] === "prepare-authorization") {
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--request-sha256" && HEX.test(args[4] ?? "")
      && args[5] === "--plan-sha256" && HEX.test(args[6] ?? "")
      && args[7] === "--reason" && typeof args[8] === "string"
      && args[8].trim() !== "" && Buffer.byteLength(args[8], "utf8") <= 500;
    return base && (args.length === 9 || (exactAuthorRoot(9) && args.length === 11));
  }
  if (args[0] === "verify-audit") {
    return args[1] === "--repo" && args[2] === root && args.length === 3;
  }
  const base = args[0] === "authorize"
    && args[1] === "--repo" && args[2] === root
    && args[3] === "--request-sha256" && HEX.test(args[4] ?? "")
    && args[5] === "--plan-sha256" && HEX.test(args[6] ?? "")
    && args[7] === "--selection-sha256" && HEX.test(args[8] ?? "")
    && args[9] === "--reason" && typeof args[10] === "string"
    && args[10].trim() !== "" && Buffer.byteLength(args[10], "utf8") <= 500
    && args[11] === "--reason-sha256" && HEX.test(args[12] ?? "");
  return base && ((args[13] === "--activate" && args.length === 14)
    || (exactAuthorRoot(13) && args[15] === "--activate" && args.length === 16));
}

export function isSanctionedLifecycleCommand(command, root, options = {}) {
  const words = simpleWords(command, root, options);
  const platform = options.platform ?? process.platform;
  const directNode = platform === "win32" ? ["node", "node.exe"] : ["node"];
  const trustedNode = options.processExecPath ?? process.execPath;
  if (!words || words.length < 2 || ![...directNode, trustedNode].includes(words[0])) return false;
  const [script, ...args] = words.slice(1);
  if (script === ONBOARDING_SCRIPT) return sanctionedOnboardingArgs(args, root);
  if (script === MIGRATION_SCRIPT) return sanctionedMigrationArgs(args, root);
  if (script === V3_BOOTSTRAP_AUTHORITY_SCRIPT) {
    return exactRoot(args, root, 0) && args.length === 2;
  }
  if (script === LAUNCH_SCRIPT) {
    return exactRoot(args, root, 0)
      && args[2] === "--barrier-sha256" && HEX.test(args[3] ?? "")
      && args[4] === "--activate" && args.length === 5;
  }
  if (script === READBACK_SCRIPT) return exactRoot(args, root, 0) && args.length === 2;
  if (script === START_PREFLIGHT_SCRIPT) return args.length === 0;
  if (script === SESSION_CLEANUP_SCRIPT) return sanctionedSessionCleanupArgs(args, root);
  if (script === PIPELINE_STATE_SCRIPT) {
    return sanctionedPoAuthorityRebindArgs(args);
  }
  if (script === PO_PROFILE_REPAIR_SCRIPT) return sanctionedPoProfileRepairArgs(args, root);
  if (script === PROJECT_AUTHORITY_MIGRATION_SCRIPT) {
    return sanctionedProjectAuthorityMigrationArgs(args, root);
  }
  if (script === HUMAN_OVERRIDE_SCRIPT) return sanctionedHumanOverrideArgs(args, root);
  if (script === PRIVATE_OVERLAY_SCRIPT) {
    return args[0] === "route"
      && args[1] === "--project-root"
      && args[2] === root
      && args.length === 3;
  }
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
  if (toolName === "Bash" && isHumanPoSigningCommand(input.tool_input.command, root)) {
    return externalPoSigningOnly();
  }
  if (["Edit", "Write"].includes(toolName)) {
    if (!isProjectWritePath(input.tool_input.file_path, root, dependencies)) {
      return crossRepositoryMutationBlocked();
    }
    const requested = resolve(root, input.tool_input.file_path);
    if (requested === join(root, ".claude", "pipeline-state.json")
      || requested === join(root, "project", "pipeline-state.json")) {
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
  if (toolName === "Bash" && isNarrowRepositoryRecoveryCommand(input.tool_input.command, root)) {
    return verdict(0);
  }
  if (toolName === "Bash") {
    const parsed = parseGuardCommand(input.tool_input.command, root);
    if (parsed.parseStatus !== "accepted") {
      return blocked(
        "GUARD-PARSE-UNSUPPORTED",
        null,
        retryActionsForDeniedCommand(input.tool_input.command, root),
      );
    }
    if (parsed.operators.length > 0 || parsed.redirects.length > 0) {
      return blocked(parsed.redirects.length > 0
        ? "GUARD-REDIRECT-UNAPPROVED"
        : "GUARD-OPERATOR-UNAPPROVED", null, []);
    }
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
      : blocked(
        "GUARD-LIFECYCLE-NOT-READY",
        error instanceof ProjectOnboardingReadyError
          && error.code === "PORG-NOT-READY"
          && error.intent === "session"
          ? error.lifecycleStatus
          : null,
      );
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
