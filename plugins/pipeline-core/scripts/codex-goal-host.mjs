// SPDX-License-Identifier: SUL-1.0
/** Bounded Codex App Server `thread/goal/*` adapter with mandatory readback. */
import { createHash } from "node:crypto";
import { reconcileRunnerNativeContinuation } from "../lib/continuity-state.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ACTIONS = new Set(["set", "clear"]);
const GOAL_STATES = new Set(["active", "paused", "blocked", "complete"]);

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function digest(value) { return typeof value === "string" && SHA256.test(value); }
function id(value) { return typeof value === "string" && SAFE_ID.test(value); }
function hash(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }

/** Render a bounded, non-secret native objective from an already-approved contract. */
export function renderCodexGoalObjective({ subject, generation, objective }) {
  if (!exact(subject, ["featureId", "phase", "packageId", "actionId"]) || !Object.values(subject).every(id)
    || !Number.isSafeInteger(generation) || generation < 0 || !digest(objective?.conditionSha256)) return null;
  return `Pipeline continuation: feature=${subject.featureId}; phase=${subject.phase}; package=${subject.packageId}; action=${subject.actionId}; generation=${generation}; condition=${objective.conditionSha256}. Continue only until verified completion, named PO gate, typed blocker, or explicit user control.`;
}

function validInput(value) {
  return exact(value, ["threadId", "action", "subject", "generation", "objective"])
    && typeof value.threadId === "string" && value.threadId.length > 0 && value.threadId.length <= 256
    && ACTIONS.has(value.action) && Number.isSafeInteger(value.generation) && value.generation >= 0
    && object(value.objective) && digest(value.objective.conditionSha256)
    && exact(value.subject, ["featureId", "phase", "packageId", "actionId"]) && Object.values(value.subject).every(id);
}

function unavailable(code) { return { ok: false, code, status: "unavailable", readback: null }; }

/**
 * A native blocked goal is a host-control stop, never an invitation to create
 * a replacement goal or silently continue work. The caller must surface this
 * exact operator action before another automatic pipeline step is attempted.
 */
export function renderCodexGoalBlockedNotice(goal) {
  if (!object(goal) || typeof goal.threadId !== "string" || typeof goal.objective !== "string" || goal.status !== "blocked") return null;
  return "Codex goal is blocked: automated Pipeline work is stopped. Resume this goal in the Codex CLI before continuing; mobile/read-only surfaces may not provide resume.";
}

/**
 * Execute exactly one requested native goal action followed by `thread/goal/get`.
 * `request` is the already-authenticated App Server JSON-RPC client; this adapter
 * intentionally does not start a second host or change its policy.
 */
export async function reconcileCodexGoal(input, { request } = {}) {
  if (!validInput(input) || typeof request !== "function") return unavailable("CGH-INPUT");
  const objective = renderCodexGoalObjective(input);
  if (objective === null) return unavailable("CGH-OBJECTIVE");
  try {
    if (input.action === "set") {
      const current = await request("thread/goal/get", { threadId: input.threadId });
      const goal = current?.goal ?? null;
      if (object(goal) && goal.threadId === input.threadId && goal.status === "blocked") {
        return {
          ok: false,
          code: "CGH-BLOCKED-RESUME-REQUIRED",
          status: "blocked",
          readback: { goalIdSha256: hash(`${goal.threadId}\n${goal.objective}`), generation: input.generation, observedAt: new Date().toISOString(), status: "blocked" },
          notice: renderCodexGoalBlockedNotice(goal),
        };
      }
      if (!(object(goal) && goal.threadId === input.threadId && goal.objective === objective && goal.status === "active")) {
        const set = await request("thread/goal/set", { threadId: input.threadId, objective, status: "active", tokenBudget: null });
        if (!object(set?.goal)) return unavailable("CGH-SET");
      }
    } else {
      const cleared = await request("thread/goal/clear", { threadId: input.threadId });
      if (cleared?.cleared !== true) return unavailable("CGH-CLEAR");
    }
    const observed = await request("thread/goal/get", { threadId: input.threadId });
    const goal = observed?.goal ?? null;
    if (input.action === "clear") {
      return goal === null ? { ok: true, code: "CGH-CLEARED", status: "cleared", readback: { goalIdSha256: null, generation: input.generation, status: "cleared" } } : unavailable("CGH-CLEAR-READBACK");
    }
    if (!object(goal) || goal.threadId !== input.threadId || goal.objective !== objective || goal.status !== "active"
      || !GOAL_STATES.has(goal.status)) return unavailable("CGH-READBACK");
    return { ok: true, code: "CGH-ACTIVE", status: "active", readback: { goalIdSha256: hash(`${goal.threadId}\n${goal.objective}`), generation: input.generation, observedAt: new Date().toISOString(), status: "active" } };
  } catch { return unavailable("CGH-TRANSPORT"); }
}

/**
 * Bind a validated continuity proposal to the current Codex App Server thread.
 * The host-local thread handle is consumed only by the adapter and is never
 * persisted in the continuation record returned for the sanctioned CAS.
 */
export async function reconcileCodexNativeContinuation(input, { threadId, request } = {}) {
  if (typeof threadId !== "string" || threadId.length === 0 || typeof request !== "function") {
    return { ok: false, code: "RNC-CODEX-HOST", action: "none", expectedRevision: null, next: null, continuation: null };
  }
  return reconcileRunnerNativeContinuation({
    ...input,
    adapter: (goal) => reconcileCodexGoal({
      action: goal.action,
      generation: goal.generation,
      objective: goal.objective,
      subject: {
        featureId: goal.subject.featureId,
        phase: goal.subject.phase,
        packageId: goal.subject.packageId,
        actionId: goal.subject.actionId,
      },
      threadId,
    }, { request }),
  });
}
