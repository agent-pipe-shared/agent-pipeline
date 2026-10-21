#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Claude/Codex native hook bridge for the explicitly marked Goldfish host-commit route. */
import { readFileSync } from "node:fs";
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

export function nativeGoldfishHookMessage(result) {
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
      ? "this Agent call ran in the background (run_in_background true, or an async_launched result), so no final return reached this hook and no pending host-commit state could complete it"
      : "no pending host-commit state was prepared for this launch (the PreToolUse WARNING names the preparation code)";
    // PF-26B: when the PreToolUse guard recorded why preparation failed, name that exact code instead of pointing at a warning.
    const prepared = typeof result.preparationCode === "string" ? ` The pre-launch preparation failed with ${result.preparationCode}.` : "";
    return `Goldfish host commit was not completed (${result.code}): ${why}.${prepared} No commit or authorship record is claimed. Orchestrator route: verify the child's diff yourself, commit it with the "Dispatch: <dispatchId> (goldfish)" trailer, and write the dispatch record via scripts/dispatch-record-write.mjs.`;
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
  const message = nativeGoldfishHookMessage(result);
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
