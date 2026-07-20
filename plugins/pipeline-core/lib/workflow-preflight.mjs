// SPDX-License-Identifier: Apache-2.0
import { afkGateStatus } from "./afk-review.mjs";

const OPERATIONS = new Set([
  "dispatch",
  "git",
  "close",
  "push",
  "activate",
  "afk-worker",
  "afk-status",
  "afk-review",
  "afk-recover",
]);

export function classifyAfkWorkflowPreflight(input = {}) {
  if (!OPERATIONS.has(input.operation)) {
    return { ok: false, status: "blocked", allowed: false, code: "AFK-GATE-OPERATION-INVALID" };
  }
  return afkGateStatus(input);
}
