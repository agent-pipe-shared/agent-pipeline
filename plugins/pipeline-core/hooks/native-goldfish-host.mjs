#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Claude/Codex native hook bridge for the explicitly marked Goldfish host-commit route. */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describeGrantRecord, isValidGrantAgentId } from "../lib/dispatch-budget-core.mjs";
import { resolveGitCommonDir } from "../lib/po-key-directory.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { integrateNativeGoldfishItemDelivery } from "../lib/native-goldfish-host-state.mjs";
import { finalizeNativeGoldfishHostReturn, sanitizeStopFailureDetail } from "../lib/native-goldfish-host-finalizer.mjs";
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

/** D31/D32: the Claude SubagentStop block decision for a recorded checkpoint, or null.
 * Blocks only while a verified budget grant of this agent is not yet spent (one block per recorded grant, counted in
 * `grants/<agentId>.continued` next to the grant record) and never when a stop hook already blocked this turn
 * (`stop_hook_active`). Any fault reads as "no block": the stop proceeds exactly as before. */
export function nativeGoldfishCheckpointBlock({ commonDir, input, runner, result } = {}) {
  try {
    if (runner !== "claude" || input?.hook_event_name !== "SubagentStop" || result?.status !== "checkpoint-recorded") return null;
    if (input.stop_hook_active === true) return null;
    const agentId = input.agent_id;
    if (typeof commonDir !== "string" || !isValidGrantAgentId(agentId)) return null;
    const directory = join(commonDir, "agent-pipeline", "dispatch-budget", "grants");
    const grantPath = join(directory, `${agentId}.json`);
    if (!existsSync(grantPath)) return null;
    const described = describeGrantRecord(JSON.parse(readFileSync(grantPath, "utf8")), agentId);
    if (!described.ok) return null;
    const countPath = join(directory, `${agentId}.continued`);
    let used = 0;
    if (existsSync(countPath)) { used = Number.parseInt(readFileSync(countPath, "utf8"), 10); if (!Number.isSafeInteger(used) || used < 0) return null; }
    if (used >= described.count) return null;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(countPath, `${used + 1}\n`, { mode: 0o600 });
    return { decision: "block", reason: `Your budget checkpoint is recorded and the slice stays started. Do not stop: continue with the remaining work of your briefing from your continuation card. The recorded budget grant (${described.count - used} of ${described.count} remaining) adds up to ${described.last.extra} further tool calls. The Elephant may cancel the slice if what you are doing is not right; hand back again only at the next checkpoint or when the work is complete.` };
  } catch { return null; }
}

const STOP_FAILURE_SCHEMA ="pipeline.native-goldfish-host-stop-failure.v1";

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
        newest = { code: entry.code, dispatchId: typeof entry.dispatchId === "string" ? entry.dispatchId : null, observedAt,
          stage: typeof entry.stage === "string" ? entry.stage : null, reason: typeof entry.reason === "string" ? entry.reason : null,
          detail: sanitizeStopFailureDetail(entry.detail) };
      }
    }
    return newest;
  } catch { return null; }
}

/** AC-164: one short human sentence derived from a bounded failure detail, or "" when there is none. */
function describeFailureDetail(detail) {
  const clean = sanitizeStopFailureDetail(detail);
  if (!clean) return "";
  const parts = [];
  if (clean.condition) parts.push(`condition ${clean.condition}`);
  if (clean.conditions) parts.push(`conditions ${clean.conditions.join(", ")}`);
  if (clean.stagedPaths) parts.push(`staged ${clean.stagedPaths.join(", ")}`);
  if (clean.paths) parts.push(`paths ${clean.paths.join(", ")}`);
  if (clean.outsideAllowed) parts.push(`outside the allowed paths ${clean.outsideAllowed.join(", ")}`);
  if (clean.extraPaths) parts.push(`changed but not claimed ${clean.extraPaths.join(", ")}${clean.extraCount > clean.extraPaths.length ? ` (+${clean.extraCount - clean.extraPaths.length} more)` : ""}`);
  if (clean.missingPaths) parts.push(`claimed but not changed ${clean.missingPaths.join(", ")}${clean.missingCount > clean.missingPaths.length ? ` (+${clean.missingCount - clean.missingPaths.length} more)` : ""}`);
  if (clean.errorName) parts.push(`error ${clean.errorName}${clean.errorCode ? ` ${clean.errorCode}` : ""}`);
  if (clean.errorMessage) parts.push(`message "${clean.errorMessage}"`);
  if (clean.reason) parts.push(`reason ${clean.reason}`);
  return parts.length > 0 ? ` Cause: ${parts.join("; ")}. Do not edit the tree during a Goldfish run.` : "";
}

/** E1: the one recovery sentence every failed host commit names -- the helper that verifies, commits and records in one step. */
function recoverySentence(dispatchId) {
  return `run scripts/goldfish-host-commit-recover.mjs plan --root <root>${dispatchId ? ` --dispatch-id ${dispatchId}` : ""} --briefing <briefing file> --handback <hand-back file> (the briefing is the file dispatch-briefing.mjs wrote for this dispatch, the hand-back file holds the text the Goldfish returned), check the planned paths, then run the same command as apply with the --expect-sha256 digest the plan printed; apply makes one ordinary commit with the dispatch trailer and writes the typed orchestrator-attested dispatch record, which is not host-observed evidence.`;
}
/**
 * The slug reason of a failure, wherever the finalizer put it: a stage failure carries `causeReason`, a commit exception carries it
 * inside its bounded `detail.reason` (and the persisted stop-failure record, whose own `reason` is then null, keeps that detail).
 */
function failureReason(entry) { return entry?.causeReason ?? entry?.reason ?? entry?.detail?.reason ?? null; }
/** A commit exception whose concurrent-commit ownership proof is missing needs the registry healed before the recovery. */
function healSentence(reason) {
  return reason === "native-concurrent-unowned-head"
    ? ` The cause is native-concurrent-unowned-head: HEAD moved without a genuine return of this launch. Heal first: node <plugin-root>/scripts/routine-repair.mjs run heal --root <root> --reason "<why>" (only while no Goldfish is in flight).`
    : "";
}

function stopFailureNotice(failure) {
  if (!failure || typeof failure.code !== "string") return null;
  // PF-70: the stage and the slug reason, when recorded, name where and why the stop failed.
  const cause = [failure.stage ? `stage ${failure.stage}` : null, failure.reason ? `reason ${failure.reason}` : null].filter(Boolean).join(", ");
  // E1 (Claude Windows greenfield): a stop failure with no pending state named neither why nor the command that recovers it.
  const recover = failure.code === "NGHF-PENDING-UNAVAILABLE"
    ? ` Cause: at its stop the child's pending host-commit state could not be read${typeof failure.reason === "string" && failure.reason !== "" ? "" : " (this record carries no reason; it may predate the reason field)"}. Recovery: ${recoverySentence(failure.dispatchId)}`
    : failure.code === "NGHF-COMMIT-EXCEPTION"
      ? `${healSentence(failureReason(failure))} Recovery: ${recoverySentence(failure.dispatchId)}`
      : "";
  return `A background Goldfish host commit failed at its stop (${failure.code}${cause ? `; ${cause}` : ""})${failure.dispatchId ? ` for ${failure.dispatchId}` : ""}${failure.observedAt ? ` at ${failure.observedAt}` : ""}. No commit or authorship record is claimed; inspect the worktree and recover explicitly.${recover}${describeFailureDetail(failure.detail)}`;
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
    return `Goldfish host commit was not completed (${result.code}): ${why}.${prepared} No commit or authorship record is claimed. Recovery: ${recoverySentence(result.dispatchId)} scripts/dispatch-record-write.mjs still refuses a v4 authored-commit Claude record without host observation.`;
  }
  if (result.code === "NGHF-COMMIT-EXCEPTION") {
    return `Goldfish host commit was not completed (${result.code}). No commit or authorship record is claimed; inspect the worktree (Git may have changed).${healSentence(failureReason(result))} Recovery: ${recoverySentence(result.dispatchId)}${describeFailureDetail(result.detail)}`;
  }
  if (result.code === "AGY-HOST-COMMIT-PIPELINE-PATH-UNIGNORED") {
    return `Goldfish host commit was not completed (${result.code}): the Pipeline's own working files (evidence/dispatch-route-*.json, scratch/) are not ignored by this project's .gitignore, so they count as changes the child never made. No commit or authorship record is claimed. Repair: add the lines /evidence/ and /scratch/ to the project's .gitignore and commit that change. Orchestrator route for this dispatch: verify the child's diff yourself, commit it with the "Dispatch: <dispatchId> (goldfish)" trailer, and write the dispatch record via scripts/dispatch-record-write.mjs.`;
  }
  return `Goldfish host commit was not completed (${result.code}). No commit or authorship record is claimed; inspect the worktree and recover explicitly if Git may have changed.${describeFailureDetail(result.detail)}`;
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
  // A stop hook never blocks the stop, with one deliberate exception (D31/D32): a recorded checkpoint with a remaining
  // budget grant makes the Claude SubagentStop block once so the Goldfish continues. Every fault degrades to the recovery
  // message, exit 0.
  try { result=qualifyNativeGoldfishHookDelivery({root:process.env.CLAUDE_PROJECT_DIR??input.cwd??process.cwd(),result}); }
  catch { result = { status: "recovery-required", code: "NGHF-HOOK-EXCEPTION", commit: result?.commit ?? null }; }
  // Slice C: a PostToolUse call is the one channel the Elephant reads, so a failed background stop is shown there.
  let stopFailure = null;
  if (runner === "claude" && input.hook_event_name === "PostToolUse" && ["Agent", "Task"].includes(input.tool_name)) {
    try { stopFailure = readNativeGoldfishStopFailure({ commonDir: resolveGitCommonDir(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd()) }); }
    catch { stopFailure = null; }
  }
  let block = null;
  try { block = nativeGoldfishCheckpointBlock({ commonDir: resolveGitCommonDir(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd()), input, runner, result }); }
  catch { block = null; }
  if (block) {
    process.stdout.write(`${JSON.stringify(block)}\n`);
    process.exit(0);
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
