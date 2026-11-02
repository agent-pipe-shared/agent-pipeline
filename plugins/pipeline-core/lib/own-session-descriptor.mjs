// SPDX-License-Identifier: SUL-1.0
//
// Which session descriptor is the RUNNING session's own? (candidate 17, runner neutrality)
//
// A session-bound hook creates one private descriptor per session, named `<runner>-<session id>`: `claude-<id>` for a Claude hook,
// `codex-<id>` for a Codex `spawn_agent` hook (lib/claude-hook-session-owner.mjs). The close cleanup receipt and the cleanup recovery
// must tell the closing session's OWN descriptor from a foreign one. They used to hard-code runner `claude`, so on Codex the own
// descriptor was counted as foreign and the receipt could never become `complete`.
//
// This module derives the id for the runner that is actually invoking, and says honestly when it cannot: Antigravity creates no
// session descriptor and a CLI process has no Antigravity session id, so the result is `unavailable` with the reason, never a guess.
// It never selects "the newest" or "the one with an unknown owner" descriptor: such a guess could hide a live foreign session.

import { resolveModelRoleHostSessionIdentity } from "./model-role-host-identity.mjs";
import { claudeHookDescriptorSessionId, codexHookDescriptorSessionId } from "./claude-hook-session-owner.mjs";

export const RUNNERS = Object.freeze(["claude", "codex", "antigravity"]);

/**
 * The invoking runner from the ambient environment (same rule as session-cleanup.mjs, ADR-0051): the CLAUDECODE marker, the Antigravity
 * markers, otherwise Codex. An explicit, valid runner always wins.
 */
export function invokingRunnerFromEnv(env = process.env, explicit = undefined) {
  if (explicit !== undefined && explicit !== null) return RUNNERS.includes(explicit) ? explicit : null;
  if (env?.CLAUDECODE === "1") return "claude";
  if (env?.ANTIGRAVITY_AGENT === "1" || env?.AI_AGENT === "antigravity") return "antigravity";
  return "codex";
}

/**
 * @returns {{runner: string|null, descriptorSessionId: string|null, derivation: "observed"|"unavailable", reason: string}}
 */
export function resolveOwnSessionDescriptor({ runner, env = process.env } = {}) {
  if (!RUNNERS.includes(runner)) {
    return { runner: null, descriptorSessionId: null, derivation: "unavailable", reason: "the invoking runner is not one of claude, codex, antigravity" };
  }
  if (runner === "antigravity") {
    return { runner, descriptorSessionId: null, derivation: "unavailable", reason: "antigravity creates no session descriptor and a command-line process does not carry its session id" };
  }
  const identity = resolveModelRoleHostSessionIdentity({ runner, env });
  if (!identity.ok) {
    return { runner, descriptorSessionId: null, derivation: "unavailable", reason: `${runner} did not expose a usable session id to this process (${identity.code})` };
  }
  const descriptorSessionId = runner === "claude" ? claudeHookDescriptorSessionId(identity.sessionId) : codexHookDescriptorSessionId(identity.sessionId);
  if (descriptorSessionId === null) {
    return { runner, descriptorSessionId: null, derivation: "unavailable", reason: `the ${runner} session id does not form a session descriptor id` };
  }
  return { runner, descriptorSessionId, derivation: "observed", reason: `${runner} session id read from the process environment` };
}
