#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Translate provider-neutral guard exits into Codex PreToolUse denials. */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateLifecycleReadyGuard, isSanctionedLifecycleCommand } from "./guard-lifecycle-ready.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "../lib/runtime-projection-v3.mjs";

const DEBUG_PREFIX = "[pipeline.codex-pretool.v1]";
const PLUGIN_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PIPELINE_START_SKILL = join(PLUGIN_ROOT, "skills", "pipeline-start", "SKILL.md");
let completed = false;

function diagnostic(code, fields = {}) {
  const tokens = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${JSON.stringify(String(value).slice(0, 160))}`);
  process.stderr.write(`${DEBUG_PREFIX} code=${code}${tokens.length === 0 ? "" : ` ${tokens.join(" ")}`}\n`);
}

function deny(reason, debug = undefined) {
  if (completed) return;
  completed = true;
  if (debug) diagnostic(debug.code, debug.fields);
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  })}\n`);
  process.exit(0);
}

// Codex reports a bare "hook exited with code 1" when an uncaught adapter
// exception escapes. Convert those into the normal, fail-closed hook response
// and leave a sanitized diagnostic for the next attended invocation.
process.on("uncaughtException", (error) => {
  deny("Codex PreToolUse guard failed internally; pipeline guards fail closed.", {
    code: "adapter-uncaught",
    fields: { name: error?.name, code: error?.code },
  });
});
process.on("unhandledRejection", (reason) => {
  deny("Codex PreToolUse guard failed internally; pipeline guards fail closed.", {
    code: "adapter-unhandled-rejection",
    fields: { name: reason?.name, code: reason?.code },
  });
});

let rawInput;
try { rawInput = readFileSync(0, "utf8"); }
catch (error) {
  deny("Codex PreToolUse input could not be read; pipeline guards fail closed.", {
    code: "stdin-read-failed",
    fields: { name: error?.name, code: error?.code },
  });
}

let input;
try { input = JSON.parse(rawInput); }
catch { deny("Codex PreToolUse input is not valid JSON; pipeline guards fail closed."); }

const toolName = String(input?.tool_name ?? "");
const filePath = input?.tool_input?.file_path;
const command = String(input?.tool_input?.command ?? "");
// Codex supplies the session working directory in the native hook envelope and
// also launches the hook from that directory. CLAUDE_PROJECT_DIR belongs to
// the Claude compatibility surface and may be inherited from another process;
// using it here can make the guard inspect a different repository than the
// tool call it is deciding.
let projectRoot;
try {
  const nativeCwd = typeof input?.cwd === "string" && input.cwd.trim() !== ""
    ? input.cwd
    : process.cwd();
  projectRoot = realpathSync(resolve(nativeCwd));
} catch (error) {
  deny("Codex PreToolUse project root is unavailable; pipeline guards fail closed.", {
    code: "project-root-unavailable",
    fields: { name: error?.name, code: error?.code },
  });
}
const lifecycleGoverned = [
  ".agent-pipeline/core.lock.json",
  "pipeline.user.yaml",
  ".claude/pipeline.json",
  ".claude/pipeline.yaml",
  ...loadRuntimeProjectionV3OwnedKeys().targets.map((target) => target.path),
].some((marker) => existsSync(join(projectRoot, marker)));
const isLifecycleTool = toolName === "Bash" && isSanctionedLifecycleCommand(command, projectRoot);

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2
    && ((trimmed.startsWith("\"") && trimmed.endsWith("\""))
      || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Permit only the bootstrap's own immutable identity/read step. */
export function isBootstrapReadCommand(value, {
  pipelineStartSkill = PIPELINE_START_SKILL,
  platform = process.platform,
} = {}) {
  if (typeof value !== "string" || value.trim() === "" || /[\0\r\n;&|<>()`]/u.test(value)) return false;
  const command = value.trim();
  if (/^pwd(?:\s+-P)?$/u.test(command)) return true;
  let target = null;
  const sed = command.match(/^sed\s+-n\s+["']?\d+(?:,\d+)?p["']?\s+(.+)$/u);
  if (sed) target = sed[1];
  const cat = command.match(/^cat\s+(?:--\s+)?(.+)$/u);
  if (!target && cat) target = cat[1];
  const powerShell = command.match(/^(?:Get-Content|gc)\s+(?:(?:-LiteralPath|-Path)\s+)?(.+)$/iu);
  if (!target && powerShell) target = powerShell[1];
  const cmdType = platform === "win32" ? command.match(/^type\s+(.+)$/iu) : null;
  if (!target && cmdType) target = cmdType[1];
  if (!target) return false;
  try { return resolve(unquote(target)) === resolve(pipelineStartSkill); }
  catch { return false; }
}

const lifecycleShouldRun = lifecycleGoverned
  && !isLifecycleTool
  && !isBootstrapReadCommand(command)
  && ["Bash", "Edit", "Write"].includes(toolName);
const supportedTools = new Set(["Bash", "apply_patch", "Edit", "Write"]);
if (!supportedTools.has(toolName)) {
  deny(`Unsupported or missing Codex tool_name ${JSON.stringify(toolName)}; pipeline guards fail closed.`);
}
if (toolName === "Bash" && (typeof input?.tool_input?.command !== "string" || input.tool_input.command.trim() === "")) {
  deny("Bash input has no unambiguous command; pipeline command guards fail closed.");
}
if (["Edit", "Write"].includes(toolName) && (typeof filePath !== "string" || filePath.trim() === "")) {
  deny(`${toolName} input has no unambiguous file_path; pipeline write guards fail closed.`);
}

const guardNames = toolName === "Bash"
  ? [
    ...( /\bgit(?:\.exe)?\b/iu.test(command) ? ["guard-git.mjs"] : []),
    ...( /\bgit(?:\.exe)?(?:\s+-C\s+\S+)?\s+push\b/iu.test(command) ? ["guard-push.mjs"] : []),
    // The lifecycle tool validates its own typed arguments and plan digest.  Do
    // not make a bootstrap command depend on a second heavyweight hook process:
    // on Codex's nested sandbox that process can exhaust the hook's outer budget.
    // Lifecycle readiness is evaluated in this adapter process below.  Spawning
    // it recursively makes Codex's nested hook sandbox hit the outer timeout.
  ]
  : toolName === "apply_patch"
    ? ["guard-apply-patch.mjs"]
    : ["Edit", "Write"].includes(toolName)
      ? ["guard-testpath.mjs", "guard-devplan.mjs"]
      : [];

const denials = [];
const warnings = [];
for (const guardName of guardNames) {
  const guard = fileURLToPath(new URL(`./${guardName}`, import.meta.url));
  const result = spawnSync(process.execPath, [guard], {
    cwd: projectRoot,
    // Existing provider-neutral guards still consume CLAUDE_PROJECT_DIR.
    // Bind that compatibility variable to Codex's native, physical cwd rather
    // than forwarding a possibly stale inherited value.
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
    encoding: "utf8",
    input: rawInput,
    // A Codex hook has a ten-second outer budget. Bound each nested guard so
    // two sequential guards cannot turn a diagnosable timeout into an opaque
    // host-level exit-1 failure.
    timeout: 4_000,
  });
  const detail = String(result.stderr ?? "").trim();
  if (result.status === 2) denials.push(detail || `${guardName} denied the tool call.`);
  else if (result.status === 1) warnings.push(detail || `${guardName} returned a warning.`);
  else if (result.status !== 0) {
    const failure = result.error?.code ?? result.error?.name ?? result.signal ?? `exit-${String(result.status)}`;
    diagnostic("nested-guard-failed", { guard: guardName, failure });
    denials.push(`${guardName} failed unexpectedly (${failure}); pipeline guards fail closed.`);
  }
}
if (lifecycleShouldRun) {
  const lifecycle = evaluateLifecycleReadyGuard(input, { projectDir: projectRoot });
  if (lifecycle.exitCode === 2) denials.push(String(lifecycle.stderr ?? "guard-lifecycle-ready denied the tool call.").trim());
  else if (lifecycle.exitCode === 1) warnings.push(String(lifecycle.stderr ?? "guard-lifecycle-ready returned a warning.").trim());
}
if (denials.length > 0) deny(denials.join("\n"));
if (warnings.length > 0) process.stderr.write(`${warnings.join("\n")}\n`);
completed = true;
