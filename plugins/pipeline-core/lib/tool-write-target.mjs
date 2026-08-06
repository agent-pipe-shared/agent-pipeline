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

/**
 * @param {unknown} toolInput the PreToolUse `tool_input` object
 * @param {string} [toolName] the calling tool, when the caller knows it
 *
 * When `toolName` is given, the key that tool actually writes wins outright. Without it
 * the order is a best guess. That distinction matters: a NotebookEdit payload carrying a
 * stray `file_path` would otherwise make all four guards judge a path the call is not
 * about to touch, which is a fail-open in the exact tool this module exists to cover.
 */
export function writeTargetPath(toolInput, toolName) {
  if (toolInput === null || typeof toolInput !== "object") return "";
  const read = (key) => {
    const value = /** @type {Record<string, unknown>} */ (toolInput)[key];
    return typeof value === "string" && value !== "" ? value : "";
  };
  if (toolName === "NotebookEdit") return read("notebook_path");
  if (toolName === "Edit" || toolName === "Write") return read("file_path");
  return read("file_path") || read("notebook_path");
}
