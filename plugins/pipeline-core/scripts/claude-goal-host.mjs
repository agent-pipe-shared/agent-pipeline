// SPDX-License-Identifier: SUL-1.0
/**
 * Native Claude goal capability seam. The Claude runtime supplies the client;
 * absent set/get/clear operations are a typed unavailable outcome, never a
 * prompt-only approximation.
 */
import { createHash } from "node:crypto";
import { reconcileRunnerNativeContinuation } from "../lib/continuity-state.mjs";
import { renderCodexGoalObjective } from "./codex-goal-host.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
function hash(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function unavailable(code) { return { ok: false, code, status: "unavailable", readback: null }; }

export async function reconcileClaudeGoal({ action, sessionId, objective, generation }, { client } = {}) {
  if (!new Set(["set", "pause", "clear"]).has(action) || typeof sessionId !== "string" || sessionId.length === 0
    || typeof objective !== "string" || objective.length === 0 || objective.length > 4_000
    || !Number.isSafeInteger(generation) || generation < 0) return unavailable("CLG-INPUT");
  if (!client || typeof client.setGoal !== "function" || typeof client.getGoal !== "function" || typeof client.clearGoal !== "function") return unavailable("CLG-CAPABILITY");
  try {
    if (action === "set") {
      const current = await client.getGoal({ sessionId });
      if (current && current.sessionId === sessionId && current.objective !== objective) return unavailable("CLG-GOAL-IDENTITY-MISMATCH");
      if (current && current.sessionId === sessionId && current.objective === objective && current.status === "blocked") return unavailable("CLG-BLOCKED-RESUME-REQUIRED");
      if (!(current && current.sessionId === sessionId && current.objective === objective && current.status === "active")) {
        await client.setGoal({ sessionId, objective, status: "active" });
      }
    } else if (action === "pause") {
      const current = await client.getGoal({ sessionId });
      if (!(current && current.sessionId === sessionId && current.objective === objective && ["active", "paused"].includes(current.status))) {
        return unavailable("CLG-PAUSE-IDENTITY-MISMATCH");
      }
      if (current.status === "active") await client.setGoal({ sessionId, objective, status: "paused" });
    } else {
      const current = await client.getGoal({ sessionId });
      if (current && (current.sessionId !== sessionId || current.objective !== objective)) return unavailable("CLG-CLEAR-IDENTITY-MISMATCH");
      if (current !== null) await client.clearGoal({ sessionId });
    }
    const goal = await client.getGoal({ sessionId });
    if (action === "clear") return goal === null ? { ok: true, code: "CLG-CLEARED", status: "cleared", readback: { goalIdSha256: null, generation, status: "cleared" } } : unavailable("CLG-CLEAR-READBACK");
    const status = action === "pause" ? "paused" : "active";
    if (!goal || goal.sessionId !== sessionId || goal.objective !== objective || goal.status !== status) return unavailable("CLG-READBACK");
    return { ok: true, code: action === "pause" ? "CLG-PAUSED" : "CLG-ACTIVE", status, readback: { goalIdSha256: hash(`${sessionId}\n${objective}`), generation, observedAt: new Date().toISOString(), status } };
  } catch { return unavailable("CLG-TRANSPORT"); }
}

/**
 * Bind the continuation controller to the current Claude session-goal client.
 * Missing set/get/clear capability remains a typed unavailable result; this
 * wrapper never substitutes a prompt or replacement host.
 */
export async function reconcileClaudeNativeContinuation(input, { sessionId, client } = {}) {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return { ok: false, code: "RNC-CLAUDE-HOST", action: "none", expectedRevision: null, next: null, continuation: null };
  }
  return reconcileRunnerNativeContinuation({
    ...input,
    adapter: (goal) => {
      const objective = renderCodexGoalObjective(goal);
      return objective === null
        ? { ok: false, code: "RNC-CLAUDE-OBJECTIVE", status: "unavailable", readback: null }
        : reconcileClaudeGoal({ action: goal.action, sessionId, objective, generation: goal.generation }, { client });
    },
  });
}
