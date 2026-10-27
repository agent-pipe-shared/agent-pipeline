#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Claude/Codex native hook bridge for the explicitly marked Goldfish host-commit route. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveGitCommonDir } from "../lib/po-key-directory.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { integrateNativeGoldfishItemDelivery } from "../lib/native-goldfish-host-state.mjs";
import { finalizeNativeGoldfishHostReturn } from "../lib/native-goldfish-host-finalizer.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
import { enterClaudeHookSessionOwner } from "../lib/claude-hook-session-owner.mjs";
import { isDirectInvocation as isGovernanceHookEntry } from "../lib/entrypoint.mjs";
// Repository admission precedes hook input hardening and all governed effects.
if (isGovernanceHookEntry(import.meta.url) && !observeGovernanceScope({ rootDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd() }).requiresEnforcement) process.exit(0);


/** Called by the original Elephant host return adapter after actual checks.
 * This readback never runs ordinary checks again or trusts terminal prose. */
export function qualifyNativeGoldfishHookDelivery({root,result}={}) {
  if(result?.status!=='authored-commit-recorded'||!result.delivery?.pendingSha256)return result;
  return {...result,integration:integrateNativeGoldfishItemDelivery({root,pendingSha256:result.delivery.pendingSha256})};
}

const STOP_FAILURE_SCHEMA = "pipeline.native-goldfish-host-stop-failure.v1";

/** Newest stop-failure diagnostic the SubagentStop completion left (PF-61), or null. Diagnostic only: any fault reads as none. */
export function readNativeGoldfishStopFailure({ commonDir } = {}) {
  try {
    if (typeof commonDir !== "string" || commonDir.length === 0) return null;
    const directory = join(commonDir, "agent-pipeline", "run", "native-goldfish-host-diagnostics");
    let newest = null;
    for (const name of readdirSync(directory)) {
      if (!/^stop-failure-[0-9a-f]+\.json$/u.test(name) && !/^stop-failure-[A-Za-z0-9_-]+\.json$/u.test(name)) continue;
      let entry;
      try { entry = JSON.parse(readFileSync(join(directory, name), "utf8")); } catch { continue; }
      if (entry?.schema !== STOP_FAILURE_SCHEMA || typeof entry.code !== "string") continue;
      const observedAt = typeof entry.observedAt === "string" ? entry.observedAt : "";
      if (!newest || observedAt > newest.observedAt) {
        newest = { code: entry.code, dispatchId: typeof entry.dispatchId === "string" ? entry.dispatchId : null, observedAt };
      }
    }
    return newest;
  } catch { return null; }
}

function stopFailureNotice(failure) {
  if (!failure || typeof failure.code !== "string") return null;
  return `A background Goldfish host commit failed at its stop (${failure.code})${failure.dispatchId ? ` for ${failure.dispatchId}` : ""}${failure.observedAt ? ` at ${failure.observedAt}` : ""}. No commit or authorship record is claimed; inspect the worktree and recover explicitly.`;
}

export function nativeGoldfishHookMessage(result, { stopFailure = null } = {}) {
  const base = nativeGoldfishHookBaseMessage(result);
  const notice = stopFailureNotice(stopFailure);
  return base && notice ? `${base} ${notice}` : base ?? notice;
}

function nativeGoldfishHookBaseMessage(result) {
  if (!result || result.status === "not-applicable" || result.status === "agent-bound") return null;
  if (result.status === "authored-commit-recorded") {
    return `Goldfish host commit verified: ${result.commit}; v4 dispatch record: ${result.record?.target ?? "written"}.${result.delivery?` Item checks ${result.delivery.checkStatus?.verdict??"unqualified"}; Main integration ${result.integration?.status??"pending"} (${result.integration?.code??"held"}).`:""}`;
  }
  if (result.status === "awaiting-subagent-stop") {
    // The SubagentStop completion route is registered and this launch is its pending state: nothing is committed yet.
    return `Goldfish background launch observed${result.dispatchId ? ` (${result.dispatchId})` : ""}: the host commit completes when this child stops (Claude SubagentStop hook), not at this launch. No commit or authorship record is claimed until then.`;
  }
  if (result.code === "NGHF-PENDING-UNAVAILABLE") {
    const why = result.reason === "async-launch"
      ? "this Agent call ran in the background (run_in_background true, or an async_launched result) and no pending host-commit state existed at PostToolUse time, so nothing can complete it at its stop"
      : "no pending host-commit state was prepared for this launch (the PreToolUse WARNING names the preparation code)";
    // PF-26B: when the PreToolUse guard recorded why preparation failed, name that exact code instead of pointing at a warning.
    const prepared = typeof result.preparationCode === "string" ? ` The pre-launch preparation failed with ${result.preparationCode}.` : "";
    return `Goldfish host commit was not completed (${result.code}): ${why}.${prepared} No commit or authorship record is claimed. Interim route: verify the child's diff yourself and commit it as the Elephant with the "Dispatch: <dispatchId> (goldfish)" trailer; that commit is not host-observed evidence. scripts/dispatch-record-write.mjs refuses a v4 authored-commit Claude record without host observation, so do not expect it to accept one for this launch.`;
  }
  if (result.code === "AGY-HOST-COMMIT-PIPELINE-PATH-UNIGNORED") {
    return `Goldfish host commit was not completed (${result.code}): the Pipeline's own working files (evidence/dispatch-route-*.json, scratch/) are not ignored by this project's .gitignore, so they count as changes the child never made. No commit or authorship record is claimed. Repair: add the lines /evidence/ and /scratch/ to the project's .gitignore and commit that change. Orchestrator route for this dispatch: verify the child's diff yourself, commit it with the "Dispatch: <dispatchId> (goldfish)" trailer, and write the dispatch record via scripts/dispatch-record-write.mjs.`;
  }
  return `Goldfish host commit was not completed (${result.code}). No commit or authorship record is claimed; inspect the worktree and recover explicitly if Git may have changed.`;
}

if (isDirectInvocation(import.meta.url)) {
  const runnerIndex = process.argv.indexOf("--runner");
  const runner = runnerIndex >= 0 ? process.argv[runnerIndex + 1] : null;
  if (!["claude", "codex"].includes(runner)) process.exit(0);
  let input;
  try { input = JSON.parse(readFileSync(0, "utf8")); }
  catch { process.exit(0); }
  // T6-A: bind this Claude hook process to its own hook-observed session owner.
  if (runner === "claude") enterClaudeHookSessionOwner({ root: input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), input });
  let result;
  try {
    result = finalizeNativeGoldfishHostReturn({ runner,
      root: process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd(), input });
  } catch { result = { status: "recovery-required", code: "NGHF-HOOK-EXCEPTION" }; }
  // A stop hook must never block the stop: a fault after the finalizer ran degrades to the recovery message, exit 0.
  try { result=qualifyNativeGoldfishHookDelivery({root:process.env.CLAUDE_PROJECT_DIR??input.cwd??process.cwd(),result}); }
  catch { result = { status: "recovery-required", code: "NGHF-HOOK-EXCEPTION", commit: result?.commit ?? null }; }
  // Slice C: a PostToolUse call is the one channel the Elephant reads, so a failed background stop is shown there.
  let stopFailure = null;
  if (runner === "claude" && input.hook_event_name === "PostToolUse" && ["Agent", "Task"].includes(input.tool_name)) {
    try { stopFailure = readNativeGoldfishStopFailure({ commonDir: resolveGitCommonDir(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd()) }); }
    catch { stopFailure = null; }
  }
  const message = nativeGoldfishHookMessage(result, { stopFailure });
  if (!message) process.exit(0);
  if (runner === "claude" && input.hook_event_name === "PostToolUse") {
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput: {
      hookEventName: "PostToolUse", additionalContext: message,
    } })}\n`);
  } else {
    // Claude and Codex SubagentStop have no documented context-injection field. Keep the hook
    // non-blocking (exit 0 always) and surface the exact status through its command stderr channel.
    process.stderr.write(`${message}\n`);
  }
  process.exit(0);
}
