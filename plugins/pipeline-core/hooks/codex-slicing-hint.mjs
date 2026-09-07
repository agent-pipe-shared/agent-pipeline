#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Native Codex ADR-0080 advisory hook. Never changes a tool decision. */
import { readFileSync } from "node:fs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { observeCodexSlicing } from "./native-slicing.mjs";

export function codexSlicingOutput(input, eventName = "PreToolUse") {
  const result = observeCodexSlicing(input, eventName);
  if (!result.output) return "";
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: result.output,
    },
  });
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    const eventName = process.argv[2] ?? input?.hook_event_name ?? "PreToolUse";
    const output = codexSlicingOutput(input, eventName);
    if (output) process.stdout.write(output);
  } catch {
    // Advisory failures are deliberately silent and exit successfully.
  }
}
