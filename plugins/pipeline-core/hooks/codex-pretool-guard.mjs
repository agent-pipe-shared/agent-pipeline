#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Translate provider-neutral guard exits into Codex PreToolUse denials. */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEBUG_PREFIX = "[pipeline.codex-pretool.v1]";
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
  ? ["guard-git.mjs", "guard-push.mjs"]
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
    cwd: process.cwd(), env: process.env, encoding: "utf8", input: rawInput,
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
if (denials.length > 0) deny(denials.join("\n"));
if (warnings.length > 0) process.stderr.write(`${warnings.join("\n")}\n`);
completed = true;
