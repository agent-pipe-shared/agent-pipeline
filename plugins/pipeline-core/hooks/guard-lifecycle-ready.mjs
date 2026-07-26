#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Codex implementation-write guard for already Pipeline-governed roots. */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ProjectOnboardingReadyError,
  requireProjectOnboardingReady,
} from "../lib/project-onboarding-ready-gate.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "../lib/runtime-projection-v3.mjs";
import { readCodexHostRepositoryInitAdmission } from "../lib/codex-host-layout.mjs";

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
