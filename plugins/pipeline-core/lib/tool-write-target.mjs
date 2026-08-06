#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * The path a write-shaped tool call is about to touch.
 *
 * WHY. Every path-based guard in this plugin read `tool_input.file_path`, which is the
 * PreToolUse contract for `Edit` and `Write`. `NotebookEdit` is also a write-capable tool
 * and it names its target `notebook_path` instead -- so a guard that only knows
 * `file_path` sees an empty path and fails open, which for a PreToolUse guard means the
 * write is allowed.
 *
 * Found 2026-08-06 while auditing whether a failed bootstrap can still leave write access
 * behind: `NotebookEdit` appeared in NO matcher in `hooks.json`, so it was not reaching the
 * guards at all, and widening the matcher alone would not have helped for exactly this
 * reason. Both halves are needed, which is why this lives in one place rather than as four
 * `?? notebook_path` fallbacks that can drift apart.
 *
 * Returns "" when no usable path is present. Callers treat "" as "not my business" and
 * exit 0 -- deliberately unchanged, because a guard is a safety net for the paths it can
 * see, not a blanket refusal of malformed input.
 */

/** @param {unknown} toolInput the PreToolUse `tool_input` object */
export function writeTargetPath(toolInput) {
  if (toolInput === null || typeof toolInput !== "object") return "";
  for (const key of ["file_path", "notebook_path"]) {
    const value = /** @type {Record<string, unknown>} */ (toolInput)[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return "";
}
