#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Claude/Codex native hook bridge for the explicitly marked Goldfish host-commit route. */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describeGrantRecord, isValidGrantAgentId } from "../lib/dispatch-budget-core.mjs";
import { resolveGitCommonDir } from "../lib/po-key-directory.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { integrateNativeGoldfishItemDelivery, resolveGovernedItemQueue } from "../lib/native-goldfish-host-state.mjs";
import { checkSubagentHandbackBeforeStop, finalizeNativeGoldfishHostReturn, readSubagentHandbackMessage, sanitizeStopFailureDetail, sanitizeStopFailureLock } from "../lib/native-goldfish-host-finalizer.mjs";
import { issueCriticSourceReturn } from "../lib/critic-source-return.mjs";
import { designReviewObservationNotice, recordDesignReviewObservation } from "../lib/design-review-observation.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
import { enterClaudeHookSessionOwner, enterCodexHookSessionOwner } from "../lib/claude-hook-session-owner.mjs";
import { isDirectInvocation as isGovernanceHookEntry } from "../lib/entrypoint.mjs";
import { admissionProgress } from "../lib/admission-progress.mjs";
import { observeEffectiveEffort } from "../lib/dispatch-model-enforcement.mjs";
import { hostCommitWaitCommand, readNativeGoldfishStopOutcome, writeNativeGoldfishStopOutcome } from "../lib/native-goldfish-stop-outcome.mjs";
import { fileURLToPath } from "node:url";

/**
 * C23 (draft ADR "a project's pipeline.user.yaml owns its routing", decision 6): beside a recorded Claude Goldfish commit the stop names the
 * effort that really ran (the `effort.level` the host reports) or says it is unobserved; the configured effort is read from the written
 * dispatch record. A line for stderr, or null for any other event, runner or outcome. Never a refusal; the closed record gains no field.
 */
export function effortObservationNotice({ root, runner, input, result } = {}) {
  if (runner !== "claude" || input?.hook_event_name !== "SubagentStop" || result?.status !== "authored-commit-recorded") return null;
  let configuredEffort = null;
  try {
    const target = result.record?.target;
    if (typeof target === "string") configuredEffort = JSON.parse(readFileSync(join(root, target), "utf8"))?.effort ?? null;
  } catch { configuredEffort = null; }
  const observation = observeEffectiveEffort({ configuredEffort, stopInput: input });
  if (observation.warning) return `WARNING (native-goldfish-host): ${observation.warning.code}: ${observation.warning.message}`;
  return `Effective effort observed: ${observation.observed} (configured ${observation.configured ?? "unrecorded"}).`;
}
// Repository admission precedes hook input hardening and all governed effects.
if (isGovernanceHookEntry(import.meta.url) && !observeGovernanceScope({ rootDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd() }).requiresEnforcement) process.exit(0);
// E5: the same opt-in authority trace the guard hooks write (progress marks while running, the tally line at exit); a no-op unless PIPELINE_AUTHORITY_TRACE is "1".
if (process.env.PIPELINE_AUTHORITY_TRACE === "1" && isGovernanceHookEntry(import.meta.url)) await (await import("../lib/authority-trace-hook.mjs")).installHookAuthorityTrace();


/** Called by the original Elephant host return adapter after actual checks.
 * This readback never runs ordinary checks again or trusts terminal prose. */
export function qualifyNativeGoldfishHookDelivery({root,result,deadlineMs=null}={}) {
  if(result?.status!=='authored-commit-recorded'||!result.delivery?.pendingSha256)return result;
  return {...result,integration:integrateNativeGoldfishItemDelivery({root,pendingSha256:result.delivery.pendingSha256},{deadlineMs})};
}

/** C29 K-38: the host timeout this hook runs under, per event, as hooks.json and codex-hooks.json register it (PreToolUse is the
 * SubagentHandback matcher at 120 s; every other registration is 300 s; a pin compares both files). The integration's sibling-race retries end
 * NATIVE_HOOK_AFTER_INTEGRATION_RESERVE_MS before that timeout, counted from process start, so a stop whose finalize already used most of the
 * window still writes its stop outcome and message before the host ends it. */
export const NATIVE_HOOK_AFTER_INTEGRATION_RESERVE_MS = 30_000;
export function nativeHookTimeoutMs(event) { return event === "PreToolUse" ? 120_000 : 300_000; }
export function nativeHookIntegrationDeadlineMs({ event, startedMs = performance.timeOrigin } = {}) {
  return startedMs + nativeHookTimeoutMs(event) - NATIVE_HOOK_AFTER_INTEGRATION_RESERVE_MS;
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

/**
 * G20-63: the model-visible SubagentStart notice for a Codex worker child that started with NO prepared dispatch state while a governed
 * feature is in implementation (an approved delivery course exists or is yet to be written). Such a child is not host-committed and its
 * slice is not integrated, and nothing else tells anyone: Codex runs no PreToolUse hook for spawn_agent, so the admission only happens when
 * the Elephant runs the prepare command first. Returns the text, or null when the notice does not apply (not a Codex worker, not governed,
 * no feature in implementation). Never throws.
 */
export function codexUnpreparedStartNotice({ root, input } = {}) {
  try {
    if (input?.hook_event_name !== "SubagentStart" || input?.agent_type !== "worker") return null;
    const governed = resolveGovernedItemQueue({ root });
    if (governed.status !== "required" && governed.code !== "SQ-DELIVERY-COURSE-ABSENT") return null;
    return "Pipeline notice (G20-63): this worker started with no prepared Goldfish dispatch, so its work will not be host-committed and its slice will not be integrated. "
      + "The Elephant must prepare a governed dispatch before spawn_agent: build the briefing with dispatch-briefing.mjs build --out scratch/<briefing>.md, run "
      + "node <plugin-root>/scripts/codex-native-dispatch-prepare.mjs prepare --root <repository-root> --briefing scratch/<briefing>.md, then call spawn_agent with the arguments it prints. "
      + "If you are such a Goldfish, finish the briefed work, leave your changes uncommitted and return the JSON contract; the Elephant has to prepare and re-dispatch before it counts.";
  } catch { return null; }
}

const STOP_FAILURE_SCHEMA ="pipeline.native-goldfish-host-stop-failure.v1";

/**
 * The stop-failure diagnostic to show (PF-61), or null. Diagnostic only: any fault reads as none. With a dispatchId the record of THAT
 * dispatch (its newest) wins over a newer record of another dispatch; without one, or without a match, the newest record wins. `others`
 * lists up to 3 further records, newest first (dispatch id, code, stage), so a second unresolved failure is never invisible.
 */
export function readNativeGoldfishStopFailure({ commonDir, dispatchId = null, strict = false } = {}) {
  try {
    if (typeof commonDir !== "string" || commonDir.length === 0) return null;
    // C28 (PO decision 2026-11-10): a hint attached to a PostToolUse is bound to its own dispatch. `strict` never falls back to the newest record of another
    // dispatch (a stale hint of one dispatch reached three unrelated read-only dispatches 1.5 hours later) and lists no other dispatch's failure.
    if (strict && (typeof dispatchId !== "string" || dispatchId === "")) return null;
    const directory = join(commonDir, "agent-pipeline", "run", "native-goldfish-host-diagnostics");
    const records = [];
    for (const name of readdirSync(directory)) {
      if (!/^stop-failure-[0-9a-f]+\.json$/u.test(name) && !/^stop-failure-[A-Za-z0-9_-]+\.json$/u.test(name)) continue;
      let entry;
      try { entry = JSON.parse(readFileSync(join(directory, name), "utf8")); } catch { continue; }
      if (entry?.schema !== STOP_FAILURE_SCHEMA || typeof entry.code !== "string") continue;
      const observedAt = typeof entry.observedAt === "string" ? entry.observedAt : "";
      {
        records.push({ code: entry.code, dispatchId: typeof entry.dispatchId === "string" ? entry.dispatchId : null, observedAt,
          commit: typeof entry.commit === "string" ? entry.commit : null,
          stage: typeof entry.stage === "string" ? entry.stage : null, reason: typeof entry.reason === "string" ? entry.reason : null,
          detail: sanitizeStopFailureDetail(entry.detail), lock: sanitizeStopFailureLock(entry.lock) });
      }
    }
    records.sort((a, b) => (a.observedAt < b.observedAt ? 1 : a.observedAt > b.observedAt ? -1 : 0));
    if (strict) {
      const own = records.find((r) => r.dispatchId === dispatchId) ?? null;
      if (!own) return null;
      // Bound to its status as well: once the dispatch's stop later ended with a recorded host commit, the failure is history, not a hint.
      const later = readNativeGoldfishStopOutcome({ commonDir, dispatchId, after: own.observedAt });
      return later?.status === "authored-commit-recorded" ? null : own;
    }
    const chosen = (typeof dispatchId === "string" && dispatchId !== "" ? records.find((r) => r.dispatchId === dispatchId) : null) ?? records[0] ?? null;
    if (!chosen) return null;
    const others = records.filter((r) => r !== chosen).slice(0, 3).map((r) => ({ dispatchId: r.dispatchId, code: r.code, stage: r.stage }));
    return others.length > 0 ? { ...chosen, others } : chosen;
  } catch { return null; }
}

/** AC-164: one short human sentence derived from a bounded failure detail, or "" when there is none. */
function describeFailureDetail(detail) {
  const parts = failureDetailParts(detail);
  return parts.length > 0 ? ` Cause: ${parts.join("; ")}. Do not edit the tree during a Goldfish run.` : "";
}

/** The bounded parts of a failure detail, in reading order (empty when there is none); shared by the stop notice and the handback refusal. */
function failureDetailParts(detail) {
  const clean = sanitizeStopFailureDetail(detail);
  if (!clean) return [];
  const parts = [];
  if (clean.condition) parts.push(`condition ${clean.condition}`);
  if (clean.conditions) parts.push(`conditions ${clean.conditions.join(", ")}`);
  if (clean.missingKeys) parts.push(`missing keys ${clean.missingKeys.join(", ")}`);
  if (clean.unexpectedKeys) parts.push(`unexpected keys ${clean.unexpectedKeys.join(", ")}`);
  if (clean.stagedPaths) parts.push(`staged ${clean.stagedPaths.join(", ")}`);
  if (clean.paths) parts.push(`paths ${clean.paths.join(", ")}`);
  if (clean.outsideAllowed) parts.push(`outside the allowed paths ${clean.outsideAllowed.join(", ")}`);
  if (clean.extraPaths) parts.push(`changed but not claimed ${clean.extraPaths.join(", ")}${clean.extraCount > clean.extraPaths.length ? ` (+${clean.extraCount - clean.extraPaths.length} more)` : ""}`);
  if (clean.missingPaths) parts.push(`claimed but not changed ${clean.missingPaths.join(", ")}${clean.missingCount > clean.missingPaths.length ? ` (+${clean.missingCount - clean.missingPaths.length} more)` : ""}`);
  if (clean.errorName) parts.push(`error ${clean.errorName}${clean.errorCode ? ` ${clean.errorCode}` : ""}`);
  if (clean.errorMessage) parts.push(`message "${clean.errorMessage}"`);
  if (clean.reason) parts.push(`reason ${clean.reason}`);
  return parts;
}

/** C23 (AC-108): the model-visible refusal of a broken SubagentHandback: the exact code, what is wrong, and the one repair. Never echoes the message. */
export function handbackRefusalMessage({ code, detail, refusal, limit }) {
  const parts = failureDetailParts(detail);
  return `Your SubagentHandback was refused before it was delivered (${code}${parts.length > 0 ? `: ${parts.join("; ")}` : ""}). The host cannot repair a return it cannot read, and the host commit would be lost at your stop. `
    + "Repair: send the complete JSON object again as the whole message (schema, dispatchId, candidateCommit, outcome, report, changedPaths, then the closing brace), and shorten report if it was long. "
    + `This is refusal ${refusal} of ${limit}; the attempt after the last one is allowed and the failure is then recorded at your stop.`;
}

/** E5: one short sentence naming the registry lock holder a failed stop met, or "" when the failure was not a lock. */
function describeLock(lock) {
  const clean = sanitizeStopFailureLock(lock);
  if (!clean) return "";
  const parts = [];
  if (clean.errorCode) parts.push(`error ${clean.errorCode}`);
  if (clean.waitedMs !== undefined) parts.push(`waited ${clean.waitedMs} ms`);
  if (clean.holderPid !== undefined) parts.push(`held by pid ${clean.holderPid}${clean.owner ? ` (${clean.owner})` : ""}${clean.acquiredAt ? ` since ${clean.acquiredAt}` : ""}`);
  return parts.length > 0 ? ` Registry lock: ${parts.join("; ")}.` : "";
}

/** E1: the one recovery sentence every failed host commit names -- the helper that verifies, commits and records in one step. */
const RECOVER_SCRIPT = fileURLToPath(new URL("../scripts/goldfish-host-commit-recover.mjs", import.meta.url));
/**
 * C28-HOST-COMMIT-RECOVERY: the recovery command complete, with the real script path, root and dispatch id (null when the root or the id is unknown or cannot be quoted
 * the one way Bash and PowerShell read alike). The briefing and hand-back names are the conventional ones the recovery helper itself suggests.
 */
export function hostCommitRecoverCommand({ root, dispatchId } = {}) {
  if (typeof root !== "string" || root === "" || `${RECOVER_SCRIPT}${root}`.includes("'") || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u.test(dispatchId ?? "")) return null;
  return `node '${RECOVER_SCRIPT}' plan --root '${root}' --dispatch-id ${dispatchId} --briefing scratch/briefing-${dispatchId}.md --handback scratch/handback-${dispatchId}.txt`;
}
function recoverySentence(dispatchId, { root = null, commit = null } = {}) {
  const exact = hostCommitRecoverCommand({ root, dispatchId });
  const landed = typeof commit === "string" && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(commit)
    ? ` The host commit already exists (${commit.slice(0, 12)}): the recovery commits nothing again and writes only the record that was lost.` : "";
  return `run scripts/goldfish-host-commit-recover.mjs plan --root <root>${dispatchId ? ` --dispatch-id ${dispatchId}` : ""} --briefing <briefing file> --handback <hand-back file> (the briefing is the file dispatch-briefing.mjs wrote for this dispatch, the hand-back file holds the text the Goldfish returned), check the planned paths, then run the same command as apply with the --expect-sha256 digest the plan printed; apply makes one ordinary commit with the dispatch trailer and writes the typed orchestrator-attested dispatch record, which is not host-observed evidence.`
    + (exact ? ` Exact command (write the briefing and the hand-back text to those two files first): ${exact}` : "")
    + landed + (exact ? " It is safe to run again: a second run says already-recovered and changes nothing." : "");
}
/**
 * The slug reason of a failure, wherever the finalizer put it: a stage failure carries `causeReason`, a commit exception carries it
 * inside its bounded `detail.reason` (and the persisted stop-failure record, whose own `reason` is then null, keeps that detail).
 */
function failureReason(entry) { return entry?.causeReason ?? entry?.reason ?? entry?.detail?.reason ?? null; }
/** A commit exception whose concurrent-commit ownership proof is missing needs the registry healed before the recovery. */
function healSentence(reason, entry = null) {
  if (reason === "native-concurrent-sibling-commit-unrecorded") {
    // K-34: the commit that moved HEAD is a sibling's host commit whose stop failed afterwards, so its lineage proof never came; waiting cannot help.
    const named = /sibling ([A-Za-z0-9._:-]{1,128}) commit ([0-9a-f]{7,40})/u.exec(String(entry?.detail?.errorMessage ?? ""));
    const sibling = named ? `${named[1]} (host commit ${named[2]})` : "a sibling Goldfish";
    return ` The cause is native-concurrent-sibling-commit-unrecorded: HEAD was moved by the host commit of ${sibling}, whose own stop then failed before it wrote that commit's lineage proof, so this stop cannot prove the commit and did not wait for it. Recover that sibling first (its stop-failure record names the code; the host commit exists, so its recovery writes only the lost record), then recover this dispatch the same way, onto the advanced HEAD. Heal only while no Goldfish is in flight: node <plugin-root>/scripts/routine-repair.mjs run heal --root <root> --reason "<why>".`;
  }
  return reason === "native-concurrent-unowned-head"
    ? ` The cause is native-concurrent-unowned-head: HEAD moved without a genuine return of this launch. Heal first: node <plugin-root>/scripts/routine-repair.mjs run heal --root <root> --reason "<why>" (only while no Goldfish is in flight).`
    : "";
}

/** Further unresolved stop-failure records, bounded, so a second failed dispatch is named rather than hidden behind the first. */
function describeOthers(others) {
  if (!Array.isArray(others) || others.length === 0) return "";
  const text = others.map((o) => `${String(o.dispatchId ?? "unknown").slice(0, 80)} (${String(o.code).slice(0, 60)}${o.stage ? `, stage ${String(o.stage).slice(0, 60)}` : ""})`).join("; ");
  return ` Other unresolved stop-failure records, newest first: ${text}.`;
}

function stopFailureNotice(failure, root = null) {
  if (!failure || typeof failure.code !== "string") return null;
  // PF-70: the stage and the slug reason, when recorded, name where and why the stop failed.
  const cause = [failure.stage ? `stage ${failure.stage}` : null, failure.reason ? `reason ${failure.reason}` : null].filter(Boolean).join(", ");
  // E1 (Claude Windows greenfield): a stop failure with no pending state named neither why nor the command that recovers it.
  // C28: every other failed host commit (an authority refusal, a commit or post-commit stage failure, an invalid record) names the same recovery.
  const recover = failure.code === "NGHF-PENDING-UNAVAILABLE"
    ? ` Cause: at its stop the child's pending host-commit state could not be read${typeof failure.reason === "string" && failure.reason !== "" ? "" : " (this record carries no reason; it may predate the reason field)"}. Recovery: ${recoverySentence(failure.dispatchId, { root })}`
    : failure.code === "NGHF-COMMIT-EXCEPTION"
      ? `${healSentence(failureReason(failure), failure)} Recovery: ${recoverySentence(failure.dispatchId, { root, commit: failure.commit })}`
      : ` Recovery: ${recoverySentence(failure.dispatchId, { root, commit: failure.commit })}`;
  return `A background Goldfish host commit failed at its stop (${failure.code}${cause ? `; ${cause}` : ""})${failure.dispatchId ? ` for ${failure.dispatchId}` : ""}${failure.observedAt ? ` at ${failure.observedAt}` : ""}. No commit or authorship record is claimed; inspect the worktree and recover explicitly.${recover}${describeLock(failure.lock)}${describeFailureDetail(failure.detail)}${describeOthers(failure.others)}`;
}

export function nativeGoldfishHookMessage(result, { stopFailure = null, waitCommand = null, root = null } = {}) {
  const base = nativeGoldfishHookBaseMessage(result, waitCommand, root);
  const notice = stopFailureNotice(stopFailure, root);
  return base && notice ? `${base} ${notice}` : base ?? notice;
}

function nativeGoldfishHookBaseMessage(result, waitCommand = null, root = null) {
  if (!result || result.status === "not-applicable" || result.status === "agent-bound") return null;
  if (result.status === "authored-commit-recorded") {
    return `Goldfish host commit verified: ${result.commit}; v4 dispatch record: ${result.record?.target ?? "written"}.${result.delivery?` Item checks ${result.delivery.checkStatus?.verdict??"unqualified"}; Main integration ${result.integration?.status??"pending"} (${result.integration?.code??"held"}).`:""}`;
  }
  if (result.status === "awaiting-subagent-stop") {
    // The SubagentStop completion route is registered and this launch is its pending state: nothing is committed yet.
    const launched = `Goldfish background launch observed${result.dispatchId ? ` (${result.dispatchId})` : ""}: the host commit completes when this child stops (Claude SubagentStop hook), not at this launch. No commit or authorship record is claimed until then.`;
    const waiting = "The hand-back arrives before that commit and the later \"Agent finished\" notice starts no turn, so never end the turn to wait for it";
    return waitCommand ? `${launched} ${waiting}: when the hand-back arrives, run exactly this in that same turn and continue from its answer: ${waitCommand}` : `${launched} ${waiting}: when the hand-back arrives, run scripts/wait-host-commit.mjs in that same turn and continue from its answer.`;
  }
  if (result.code === "NGHF-PENDING-UNAVAILABLE") {
    const why = result.reason === "async-launch"
      ? "this Agent call ran in the background (run_in_background true, or an async_launched result) and no pending host-commit state existed at PostToolUse time, so nothing can complete it at its stop"
      : "no pending host-commit state was prepared for this launch (the PreToolUse WARNING names the preparation code)";
    // PF-26B: when the PreToolUse guard recorded why preparation failed, name that exact code instead of pointing at a warning.
    const prepared = typeof result.preparationCode === "string" ? ` The pre-launch preparation failed with ${result.preparationCode}.` : "";
    return `Goldfish host commit was not completed (${result.code}): ${why}.${prepared} No commit or authorship record is claimed. Recovery: ${recoverySentence(result.dispatchId, { root })} scripts/dispatch-record-write.mjs still refuses a v4 authored-commit Claude record without host observation.`;
  }
  if (result.code === "NGHF-COMMIT-EXCEPTION") {
    return `Goldfish host commit was not completed (${result.code}). No commit or authorship record is claimed; inspect the worktree (Git may have changed).${healSentence(failureReason(result), result)} Recovery: ${recoverySentence(result.dispatchId ?? result.stopDispatchId, { root })}${describeFailureDetail(result.detail)}`;
  }
  if (result.code === "AGY-HOST-COMMIT-PIPELINE-PATH-UNIGNORED") {
    return `Goldfish host commit was not completed (${result.code}): the Pipeline's own working files (evidence/dispatch-route-*.json, scratch/) are not ignored by this project's .gitignore, so they count as changes the child never made. No commit or authorship record is claimed. Repair: add the lines /evidence/ and /scratch/ to the project's .gitignore and commit that change. Orchestrator route for this dispatch: verify the child's diff yourself, commit it with the "Dispatch: <dispatchId> (goldfish)" trailer, and write the dispatch record via scripts/dispatch-record-write.mjs.`;
  }
  // C28: a failure after the host commit (an invalid record, a Critic path disposition, a stage exception) and an authority refusal (SDC-AUTHORITY-UNAVAILABLE) both end here;
  // each names the one recovery command instead of "recover explicitly". The code of a failure that has nothing to recover (not-applicable) never reaches this line.
  const recovery = result.status === "recovery-required" || result.status === "not-finalized"
    ? ` Recovery: ${recoverySentence(result.dispatchId ?? result.stopDispatchId, { root, commit: result.commit })}` : "";
  return `Goldfish host commit was not completed (${result.code}). No commit or authorship record is claimed; inspect the worktree and recover explicitly if Git may have changed.${recovery}${describeFailureDetail(result.detail)}`;
}

/** G20-39: the self-describing line a Critic subagent stop prints (stderr; a stop hook's stdout is read as a decision). */
export function criticSourceReturnMessage(outcome) {
  const finalizeAs = "the verdict then finalizes as caller-authored-fallback, which the feature close admits only at rigor 0 and low risk (repair: a PO acknowledgement of the caller-authored Critic for this packet and candidate)";
  switch (outcome?.status) {
    case "unattributed": return `Critic Source return not issued: packet ${outcome.packetId} is a split round and the verdict names none of its entries; the child must begin trajectory_evidence with its scope marker (${outcome.entries.join(", ")}) and run again; ${finalizeAs}.`;
    case "issued": if (outcome.entryId !== undefined) return `Critic Source return issued for packet ${outcome.packetId}, split entry ${outcome.entryId}: when every child has returned, merge them with critic-split-merge.mjs --packet ${outcome.packetId} (no verdict needs copying), then finalize reads one record per entry.`;
      return `Critic Source return issued for packet ${outcome.packetId}: finalize reads it from the private control area and labels the verdict source-issued-origin when the verdict file is the returned JSON verbatim.`;
    case "already-issued": return `Critic Source return not issued: packet ${outcome.packetId} already holds ${outcome.entryId === undefined ? "one" : `this verdict for split entry ${outcome.entryId}`}; it is never overwritten.`;
    case "no-verdict": return `Critic Source return not issued: the Critic's final message carries no schema-shaped verdict JSON (return it as the whole message or as the last fenced json block); ${finalizeAs}.`;
    case "contradictory-verdict": return `Critic Source return not issued: the verdict says pass true against its own ${outcome.reason}; resume this Critic and have it return the verdict again with pass false or without that entry, which issues the record; ${finalizeAs}.`;
    case "no-open-packet": return `Critic Source return not issued: no claimed, admitted, unresulted session packet of this runner is open; ${finalizeAs}.`;
    case "ambiguous": return `Critic Source return not issued: ${outcome.count} session packets of this runner are open and the stop names none of them; release the stale ones (session-critic-finalizer.mjs release) and finalize; ${finalizeAs}.`;
    default: return `Critic Source return not issued (the private control area could not be read); ${finalizeAs}.`;
  }
}

if (isDirectInvocation(import.meta.url)) {
  const runnerIndex = process.argv.indexOf("--runner");
  const runner = runnerIndex >= 0 ? process.argv[runnerIndex + 1] : null;
  if (!["claude", "codex"].includes(runner)) process.exit(0);
  let input;
  try { input = JSON.parse(readFileSync(0, "utf8")); }
  catch { process.exit(0); }
  // E5: progress marks of the opt-in authority trace (no-ops without it): entry here, pending-read / lock-wait / lock-held / commit inside the
  // finalizer, exit on every way out.
  admissionProgress(`hook-entry:${typeof input?.hook_event_name === "string" ? input.hook_event_name.slice(0, 32) : "unknown"}`);
  process.once("exit", () => admissionProgress("exit"));
  // T6-A: bind this Claude hook process to its own hook-observed session owner.
  if (runner === "claude") enterClaudeHookSessionOwner({ root: input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), input });
  // G20-63: the Codex SubagentStart/SubagentStop hooks bind the same hook-observed owner (the prepare command's admission bound it for the
  // pending state); without it the stop's authority boundary refused SDC-AUTHORITY-UNAVAILABLE and nothing was host-committed.
  else enterCodexHookSessionOwner({ root: input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), input });
  // C23 (AC-108): the PreToolUse of a marked Goldfish's own SubagentHandback. A return the stop cannot read is refused here, while the worker
  // can still repair it (exit 2, the reason on stderr is the model-visible refusal). Every other PreToolUse, every doubt and every fault is exit 0.
  if (runner === "claude" && input.hook_event_name === "PreToolUse") {
    let refusal = null;
    try {
      const checked = checkSubagentHandbackBeforeStop({ root: process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd(), input });
      if (checked.action === "refuse") refusal = handbackRefusalMessage(checked);
    } catch { refusal = null; }
    if (refusal) { process.stderr.write(`${refusal}\n`); process.exit(2); }
    process.exit(0);
  }
  // D247 (L3 part 3): the end of a Claude design review dispatch (readiness-reviewer; foreground PostToolUse or background
  // SubagentStop) is recorded with the host's model and the returned text's digest. The hook reads the child transcript itself
  // and says one line; it never blocks. Every other call, and any fault, continues below exactly as before.
  if (runner === "claude" && ["PostToolUse", "SubagentStop"].includes(input.hook_event_name)) {
    let observed = { status: "not-applicable" };
    try {
      observed = recordDesignReviewObservation({ commonDir: resolveGitCommonDir(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd()), runner, input,
        readHandbackFn: readSubagentHandbackMessage });
    } catch { observed = { status: "not-applicable" }; }
    if (observed.status !== "not-applicable") {
      const notice = designReviewObservationNotice(observed);
      if (notice !== null && input.hook_event_name === "PostToolUse") {
        process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: notice } })}\n`);
      } else if (notice !== null) process.stderr.write(`${notice}\n`);
      process.exit(0);
    }
  }
  // G20-39: the Critic subagent's stop issues the Critic Source return record (this hook, never the calling agent). Any other stop, and
  // any fault here, continues below exactly as before; this branch never blocks the stop and prints nothing on stdout.
  if (input.hook_event_name === "SubagentStop") {
    try {
      const criticStop = issueCriticSourceReturn({ commonDir: resolveGitCommonDir(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd()), runner, input,
        readHandbackFn: runner === "claude" ? readSubagentHandbackMessage : null });
      if (criticStop.status !== "not-applicable") {
        process.stderr.write(`${criticSourceReturnMessage(criticStop)}\n`);
        process.exit(0);
      }
    } catch { /* fall through to the Goldfish route, which treats a non-Goldfish stop as not applicable */ }
  }
  let result;
  try {
    result = finalizeNativeGoldfishHostReturn({ runner,
      root: process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd(), input });
  } catch { result = { status: "recovery-required", code: "NGHF-HOOK-EXCEPTION" }; }
  // A stop hook never blocks the stop, with one deliberate exception (D31/D32): a recorded checkpoint with a remaining
  // budget grant makes the Claude SubagentStop block once so the Goldfish continues. Every fault degrades to the recovery
  // message, exit 0.
  try { result=qualifyNativeGoldfishHookDelivery({root:process.env.CLAUDE_PROJECT_DIR??input.cwd??process.cwd(),result,deadlineMs:nativeHookIntegrationDeadlineMs({event:input.hook_event_name})}); }
  catch { result = { status: "recovery-required", code: "NGHF-HOOK-EXCEPTION", commit: result?.commit ?? null }; }
  // G20-63: a Codex SubagentStart that bound nothing says so to the starting child (additionalContext), not only on the hook's stderr.
  if (runner === "codex" && input.hook_event_name === "SubagentStart" && result?.code === "NGHS-CODEX-START-UNBOUND") {
    const notice = codexUnpreparedStartNotice({ root: process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd(), input });
    if (notice) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: notice } })}\n`);
  }
  // Slice C: a PostToolUse call is the one channel the Elephant reads, so a failed background stop is shown there.
  let stopFailure = null;
  if (runner === "claude" && input.hook_event_name === "PostToolUse" && ["Agent", "Task"].includes(input.tool_name)) {
    try { stopFailure = readNativeGoldfishStopFailure({ commonDir: resolveGitCommonDir(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd()), dispatchId: result?.dispatchId ?? null, strict: true }); }
    catch { stopFailure = null; }
  }
  // C19L-W250: a stop that just left an unresolved stop-failure record names it here, only when the newest record is that dispatch's own.
  if (input.hook_event_name === "SubagentStop" && typeof result?.unresolvedStop?.dispatchId === "string") {
    try {
      const own = readNativeGoldfishStopFailure({ commonDir: resolveGitCommonDir(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd()), dispatchId: result.unresolvedStop.dispatchId });
      stopFailure = own?.dispatchId === result.unresolvedStop.dispatchId ? own : null;
    } catch { stopFailure = null; }
  }
  let block = null;
  try { block = nativeGoldfishCheckpointBlock({ commonDir: resolveGitCommonDir(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd()), input, runner, result }); }
  catch { block = null; }
  if (block) {
    process.stdout.write(`${JSON.stringify(block)}\n`);
    process.exit(0);
  }
  const projectRoot = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  const waitCommand = result?.status === "awaiting-subagent-stop" ? hostCommitWaitCommand({ root: projectRoot, dispatchId: result.dispatchId, after: new Date().toISOString() }) : null;
  const message = nativeGoldfishHookMessage(result, { stopFailure, waitCommand, root: projectRoot });
  // Last step of a Goldfish stop: the commit, the record and the integration are done, so whoever waits for this may start the next step.
  if (input.hook_event_name === "SubagentStop" && typeof result?.stopDispatchId === "string") {
    try { writeNativeGoldfishStopOutcome({ commonDir: resolveGitCommonDir(projectRoot), dispatchId: result.stopDispatchId, result, message }); }
    catch { /* a stop never depends on this record */ }
  }
  // C23: the effective effort of the stopped Claude Goldfish, observed or unobserved; stderr only, never a decision.
  try {
    const effortNote = effortObservationNotice({ root: process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd(), runner, input, result });
    if (effortNote) process.stderr.write(`${effortNote}\n`);
  } catch { /* an unreadable observation never changes the stop */ }
  if (!message) process.exit(0);
  if (runner === "claude" && input.hook_event_name === "PostToolUse") {
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput: {
      hookEventName: "PostToolUse", additionalContext: message,
    } })}\n`);
  } else {
    // Claude and Codex SubagentStop have no documented context-injection field. Keep the hook
    // non-blocking (exit 0 always) and surface the exact status through its command stderr channel.
    // C19L-W250: stderr of an exit-0 hook is not shown to the operator; a Claude SubagentStop that has just left an unresolved stop-failure
    // record also prints that notice as the common `systemMessage` field (never `decision`, so the stop is never blocked). Every other stop
    // keeps its empty stdout, which the checkpoint contract reads as "allowed".
    if (runner === "claude" && input.hook_event_name === "SubagentStop" && stopFailure && typeof result?.unresolvedStop?.dispatchId === "string")
      process.stdout.write(`${JSON.stringify({ systemMessage: message })}\n`);
    process.stderr.write(`${message}\n`);
  }
  process.exit(0);
}
