#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Records the exact native Claude background-task output association after a
 * Bash or PowerShell PostToolUse event. This is a non-blocking observer: it
 * never interprets stdout, XML, transcript prose, or tool-input text as a task
 * id and emits no output-derived authority.
 */
import { readFileSync } from "node:fs";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
import { recordClaudeTaskOutputReadScope } from "../lib/claude-task-output-read-scope.mjs";

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

/** Register only a structured native PostToolUse background task result. */
export function processClaudeTaskOutputPostToolUse(input, { projectDir } = {}) {
  if (!object(input) || input.hook_event_name !== "PostToolUse"
    || !["Bash", "PowerShell"].includes(input.tool_name)) {
    return { status: "absent", code: "CTORS-HOOK-NOT-APPLICABLE" };
  }
  const response = input.tool_response;
  if (!object(response) || !Object.hasOwn(response, "backgroundTaskId")) {
    return { status: "absent", code: "CTORS-NO-BACKGROUND-TASK" };
  }
  const taskId = response.backgroundTaskId;
  const selectedProjectDir = projectDir ?? input.cwd;
  return recordClaudeTaskOutputReadScope({
    projectDir: selectedProjectDir,
    cwd: input.cwd,
    sessionId: input.session_id,
    transcriptPath: input.transcript_path,
    toolUseId: input.tool_use_id,
    taskId,
  });
}

if (isDirectInvocation(import.meta.url)) {
  let input;
  try { input = JSON.parse(readFileSync(0, "utf8")); }
  catch { process.exit(0); }
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input?.cwd ?? process.cwd();
  // Admission precedes input hardening and private-state writes.
  if (!observeGovernanceScope({ rootDir: projectDir }).requiresEnforcement) process.exit(0);
  try { processClaudeTaskOutputPostToolUse(input, { projectDir }); }
  catch { /* PostToolUse remains non-blocking; no private receipt means no read scope. */ }
}
