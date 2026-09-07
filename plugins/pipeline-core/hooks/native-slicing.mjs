#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Private, fail-open state for runner-native ADR-0080 advisory hooks.
 *
 * This module deliberately stores hashes, counters, and lifecycle overlap only.
 * It never persists a prompt, transcript path, tool arguments, or user text.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { resolveGitCommonDir } from "./guard-dispatch-budget.mjs";

export const NATIVE_SLICING_THRESHOLD = 3;
const STATE_SCHEMA = "pipeline.native-slicing-state.v1";
const MAX_SEEN = 64;
const MAX_CHILDREN = 32;
const MAX_GROUPS = 16;
const MAX_GROUP_EVENTS = 16;
const MAX_STATE_BYTES = 32 * 1024;
const HASH_RE = /^[a-f0-9]{64}$/u;

export const SLICING_NUDGE = "Slicing default: if the remaining work is >=3 independent work packages with disjoint declared write scopes, no dependency edge, and a safe commit surface (worktree isolation, at most one committing slice, or a sequenced round), consider native parallel subagent dispatch. This is a nudge, never a requirement: sequential work needs no justification.";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function boundedPush(values, value, cap) {
  if (values.includes(value)) return false;
  values.push(value);
  if (values.length > cap) values.splice(0, values.length - cap);
  return true;
}

function sessionId(input, runner) {
  const candidate = input?.session_id ?? input?.sessionId ?? input?.conversationId;
  return typeof candidate === "string" && candidate !== "" ? `${runner}:${candidate}` : null;
}

export function nativeSlicingStatePath(commonDir, runner, rawSessionId) {
  return join(commonDir, "agent-pipeline", "native-slicing", `${runner}-${hash(rawSessionId).slice(0, 32)}.json`);
}

function freshState(runner) {
  return {
    schema: STATE_SCHEMA,
    runner,
    seen: [],
    activeChildren: [],
    serialRun: 0,
    serialNudgeDelivered: false,
    planBatches: [],
    groups: [],
    activeInvocation: null,
  };
}

function boundedHashes(value, cap) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string" && HASH_RE.test(entry)).slice(-cap);
}

function boundedGroups(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry && typeof entry === "object" && Number.isSafeInteger(entry.invocationNum) && entry.invocationNum >= 0)
    .slice(-MAX_GROUPS)
    .map((entry) => ({
      invocationNum: entry.invocationNum,
      events: boundedHashes(entry.events, MAX_GROUP_EVENTS),
      fanout: entry.fanout === true,
      completed: entry.completed === true,
    }));
}

function validatedState(parsed, runner) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || parsed.schema !== STATE_SCHEMA || parsed.runner !== runner) return freshState(runner);
  // Reconstruct the known schema instead of spreading persisted keys forward.
  return {
    schema: STATE_SCHEMA,
    runner,
    seen: boundedHashes(parsed.seen, MAX_SEEN),
    activeChildren: boundedHashes(parsed.activeChildren, MAX_CHILDREN),
    serialRun: Number.isSafeInteger(parsed.serialRun) && parsed.serialRun >= 0 && parsed.serialRun <= NATIVE_SLICING_THRESHOLD
      ? parsed.serialRun : 0,
    serialNudgeDelivered: parsed.serialNudgeDelivered === true,
    planBatches: boundedHashes(parsed.planBatches, MAX_SEEN),
    groups: boundedGroups(parsed.groups),
    activeInvocation: Number.isSafeInteger(parsed.activeInvocation) && parsed.activeInvocation >= 0
      ? parsed.activeInvocation : null,
  };
}

function loadState(commonDir, runner, rawSessionId, dependencies = {}) {
  const exists = dependencies.existsSyncFn ?? existsSync;
  const read = dependencies.readFileSyncFn ?? readFileSync;
  const path = nativeSlicingStatePath(commonDir, runner, rawSessionId);
  try {
    if (!exists(path)) return { path, state: freshState(runner) };
    const raw = read(path, "utf8");
    if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > MAX_STATE_BYTES) return { path, state: freshState(runner) };
    return { path, state: validatedState(JSON.parse(raw), runner) };
  } catch {
    return { path, state: freshState(runner) };
  }
}

function saveState(path, state, dependencies = {}) {
  const mkdir = dependencies.mkdirSyncFn ?? mkdirSync;
  const write = dependencies.writeFileSyncFn ?? writeFileSync;
  try {
    mkdir(dirname(path), { recursive: true, mode: 0o700 });
    write(path, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {
    // Observability/advisory storage is never a permission gate.
  }
}

function withState(input, runner, options, callback) {
  try {
    const rawSessionId = sessionId(input, runner);
    const rootDir = options.rootDir ?? input?.cwd ?? process.cwd();
    const commonDir = (options.resolveGitCommonDirFn ?? resolveGitCommonDir)(rootDir, options);
    if (!rawSessionId || !commonDir) return { due: false, output: null };
    const { path, state } = loadState(commonDir, runner, rawSessionId, options);
    const result = callback(state) ?? { due: false, output: null };
    saveState(path, state, options);
    return result;
  } catch {
    return { due: false, output: null };
  }
}

function toolName(input) {
  return String(input?.tool_name ?? input?.toolName ?? "");
}

function planPendingCount(toolInput) {
  const plan = toolInput?.plan ?? toolInput?.steps ?? toolInput?.todos;
  if (!Array.isArray(plan)) return 0;
  return plan.filter((entry) => entry && typeof entry === "object" && entry.status === "pending").length;
}

/** Evaluate the Codex native PreToolUse and Subagent lifecycle channels. */
export function observeCodexSlicing(input, eventName = "PreToolUse", options = {}) {
  return withState(input, "codex", options, (state) => {
    if (eventName === "SubagentStart") {
      const agentId = input?.agent_id ?? input?.agentId;
      if (typeof agentId === "string" && agentId !== "") boundedPush(state.activeChildren, hash(agentId), MAX_CHILDREN);
      return { due: false, output: null };
    }
    if (eventName === "SubagentStop") {
      const agentId = input?.agent_id ?? input?.agentId;
      if (typeof agentId === "string" && agentId !== "") {
        const id = hash(agentId);
        state.activeChildren = state.activeChildren.filter((active) => active !== id);
      }
      return { due: false, output: null };
    }
    if (eventName !== "PreToolUse") return { due: false, output: null };

    const name = toolName(input);
    const callId = input?.tool_use_id ?? input?.toolUseId;
    const inputValue = input?.tool_input ?? input?.toolInput ?? {};
    if (name === "spawn_agent") {
      // A missing exact call identity cannot distinguish a retry from another
      // serial dispatch, so it intentionally produces no sequence claim.
      if (typeof callId !== "string" || callId === "") return { due: false, output: null };
      const key = hash(["dispatch", callId]);
      if (!boundedPush(state.seen, key, MAX_SEEN)) return { due: false, output: null };
      if (state.activeChildren.length > 0) {
        state.serialRun = 0;
        state.serialNudgeDelivered = false;
        return { due: false, output: null };
      }
      state.serialRun += 1;
      if (state.serialRun === NATIVE_SLICING_THRESHOLD && !state.serialNudgeDelivered) {
        state.serialNudgeDelivered = true;
        return { due: true, output: SLICING_NUDGE };
      }
      return { due: false, output: null };
    }
    if (name === "update_plan") {
      const pending = planPendingCount(inputValue);
      if (pending < NATIVE_SLICING_THRESHOLD) return { due: false, output: null };
      const batch = hash(inputValue);
      if (!boundedPush(state.planBatches, batch, MAX_SEEN)) return { due: false, output: null };
      return { due: true, output: SLICING_NUDGE };
    }
    return { due: false, output: null };
  });
}

function antigravityInvocation(input) {
  const value = input?.invocationNum;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Queue an Antigravity native dispatch observation. It never emits a decision. */
export function observeAntigravitySlicing(input, options = {}) {
  return withState(input, "antigravity", options, (state) => {
    const call = input?.toolCall;
    const stepIdx = input?.stepIdx;
    // PreToolUse does not carry invocationNum. The immediately preceding
    // PreInvocation records it as activeInvocation for this session.
    if (!Number.isSafeInteger(state.activeInvocation) || state.activeInvocation < 0
      || !Number.isSafeInteger(stepIdx) || stepIdx < 0
      || call?.name !== "invoke_subagent" || !Array.isArray(call?.args?.Subagents)) {
      return { due: false, output: null };
    }
    // stepIdx distinguishes separate same-shaped calls while a repeated step
    // is a retry. The tool payload is hashed only in memory for that identity.
    const eventKey = hash([stepIdx, call]);
    let group = state.groups.find((entry) => entry.invocationNum === state.activeInvocation);
    if (!group) {
      group = { invocationNum: state.activeInvocation, events: [], fanout: false, completed: false };
      state.groups.push(group);
      if (state.groups.length > MAX_GROUPS) state.groups.splice(0, state.groups.length - MAX_GROUPS);
    }
    if (!boundedPush(group.events, eventKey, MAX_GROUP_EVENTS)) return { due: false, output: null };
    if (call.args.Subagents.length >= 2) group.fanout = true;
    return { due: false, output: null };
  });
}

/** Deliver one due Antigravity nudge before the next invocation group begins. */
export function deliverAntigravitySlicing(input, options = {}) {
  return withState(input, "antigravity", options, (state) => {
    const invocationNum = antigravityInvocation(input);
    if (invocationNum === null) return { due: false, output: null };
    let due = false;
    for (const group of state.groups) {
      if (group.completed || group.invocationNum >= invocationNum) continue;
      group.completed = true;
      if (group.fanout || group.events.length >= 2) {
        state.serialRun = 0;
        state.serialNudgeDelivered = false;
      } else if (group.events.length === 1) {
        state.serialRun += 1;
        if (state.serialRun === NATIVE_SLICING_THRESHOLD && !state.serialNudgeDelivered) {
          state.serialNudgeDelivered = true;
          due = true;
        }
      }
    }
    // This documented PreInvocation identity is the only group key carried
    // into subsequent PreToolUse events; repeated PreInvocation is harmless.
    state.activeInvocation = invocationNum;
    return { due, output: due ? SLICING_NUDGE : null };
  });
}
