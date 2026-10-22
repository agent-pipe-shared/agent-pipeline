// SPDX-License-Identifier: SUL-1.0
/**
 * Claude hook-observed session owner (PO decision T6-A, 2026-10-12).
 *
 * The in-process Source requester (`session-requester-bridge.mjs`) only exists inside a
 * controller process that launched the worker. Claude Code runs every PreToolUse/PostToolUse
 * hook as a fresh process, so that context is never present there and governed item admission
 * (`prepareGovernedItemQueue`) could never obtain a bound owner under Claude.
 *
 * This module supplies a narrower, explicitly labelled fallback: a hook process that has read
 * its own Claude hook input enters the scope with that input's `session_id`; the owner is the
 * private session descriptor for that id, created on first use through the existing
 * `worktree-lifecycle.mjs` writer and loaded (digest-checked) on every later use. The resulting
 * owner carries `ownerSource: "claude-hook-session-descriptor"`: it is hook-observed session
 * identity, NOT an authenticated requester, and it is only consulted when the in-process
 * requester context is unavailable. It grants nothing by itself; every approval, criterion,
 * scope, collision and review check downstream is unchanged.
 *
 * Scope is process-wide by design: one hook process handles exactly one hook input. Callers in
 * long-lived processes (tests) must `leaveClaudeHookSessionOwner()`.
 */
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { loadSessionDescriptor, startSessionDescriptor } from "./worktree-lifecycle.mjs";

// Distinct owner-source label. The registry's assurance vocabulary stays closed
// ('physical-readback' | 'controlled-unit-method'); the descriptor is a physical readback, so the
// owner reports 'physical-readback' and carries this label separately as `ownerSource`.
export const CLAUDE_HOOK_SESSION_OWNER_SOURCE = "claude-hook-session-descriptor";
// GDW01 (PO 2026-10-21): the same fallback for a Codex `spawn_agent` hook input, labelled as its own source.
export const CODEX_HOOK_SESSION_OWNER_SOURCE = "codex-hook-session-descriptor";
const CLAUDE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9-]{7,71}$/u;

let entered = null;

/** Map a Claude hook `session_id` to its private descriptor id, or null when unusable. */
export function claudeHookDescriptorSessionId(sessionId) {
  return typeof sessionId === "string" && CLAUDE_SESSION_ID.test(sessionId) ? `claude-${sessionId}` : null;
}

/** Enter the scope from a parsed Claude hook input. Returns whether a usable id was bound. */
export function enterClaudeHookSessionOwner({ root, input } = {}) {
  return enterHookSessionOwner(root, claudeHookDescriptorSessionId(input?.session_id), CLAUDE_HOOK_SESSION_OWNER_SOURCE);
}

/** Enter the scope from a parsed Codex hook input (`spawn_agent`). Returns whether a usable id was bound. */
export function enterCodexHookSessionOwner({ root, input } = {}) {
  const sessionId = input?.session_id;
  const descriptorSessionId = typeof sessionId === "string" && CLAUDE_SESSION_ID.test(sessionId) ? `codex-${sessionId}` : null;
  return enterHookSessionOwner(root, descriptorSessionId, CODEX_HOOK_SESSION_OWNER_SOURCE);
}

function enterHookSessionOwner(root, descriptorSessionId, ownerSource) {
  entered = null;
  if (!descriptorSessionId || typeof root !== "string" || root === "") return false;
  try { entered = { primaryRoot: realpathSync(resolve(root)), descriptorSessionId, ownerSource }; } catch { entered = null; }
  return entered !== null;
}

export function leaveClaudeHookSessionOwner() { entered = null; }

/**
 * Resolve the hook-observed owner for `repository` ({primaryRoot, commonDir}), or null.
 * Never throws: an unusable scope, a different repository or a descriptor fault is "no owner".
 */
export function readClaudeHookSessionOwner({ repository } = {}) {
  if (!entered || !repository?.primaryRoot) return null;
  let primaryRoot;
  try { primaryRoot = realpathSync(repository.primaryRoot); } catch { return null; }
  if (primaryRoot !== entered.primaryRoot) return null;
  let loaded;
  try { loaded = loadSessionDescriptor(primaryRoot, entered.descriptorSessionId); }
  catch (error) {
    if (error?.code !== "WT-SESSION-MISSING") return null;
    try {
      // No owner process coordinates: the hook process is transient, so any recorded pid
      // would read as dead and invite retirement of a live session's descriptor.
      startSessionDescriptor(primaryRoot, { sessionId: entered.descriptorSessionId, ownerRuntime: null });
    } catch (startError) { if (startError?.code !== "WT-SESSION-EXISTS") return null; }
    try { loaded = loadSessionDescriptor(primaryRoot, entered.descriptorSessionId); } catch { return null; }
  }
  if (loaded.repo?.commonDir !== repository.commonDir) return null;
  return Object.freeze({ sessionId: loaded.sessionId, descriptorSha256: loaded.descriptorSha256,
    ownerNonceSha256: ownerNonceDigest(loaded.ownerNonce), ownerSource: entered.ownerSource });
}

function ownerNonceDigest(nonce) { return createHash("sha256").update(Buffer.from(nonce)).digest("hex"); }
