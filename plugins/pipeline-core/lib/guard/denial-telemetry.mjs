// SPDX-License-Identifier: SUL-1.0
// Guard module "denial-telemetry" (layer 5), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderProjectOnboardingAction } from "../project-onboarding-v3.mjs";
import { observeReturnedActionDenial, resetLifecycleDenial } from "../lifecycle-denial-loop.mjs";
import { readOnboardingIntakeCheckpoint } from "../onboarding-continuity.mjs";
import { resolveGitCommonDir } from "../../hooks/guard-dispatch-budget.mjs";
import { REPAIR_MAP_SCRIPT } from "./constants.mjs";
import { verdict } from "./verdict.mjs";
import { lifecycleSubagentIdentity } from "./bootstrap-receipt.mjs";
import { observedOnboardingCommandMatch } from "./command-catalogue.mjs";

/**
 * NVA-B-DENIALTRIM / NVA-B-TRIMKEY: the private, per-denial-class "have we already printed
 * the full grammar listing once for this reader" record, under the same
 * `<git-common-dir>/agent-pipeline/` tree bootstrapReceiptDir() above uses -- never under
 * `scratch/` or the working tree (that private tree is already agent-write-refused as
 * pipeline-owned state, the identical reasoning bootstrapReceiptDir()'s own header states).
 *
 * NOT keyed purely on `session_id`, and deliberately NOT full parity with
 * bootstrapReceiptPath()'s pure per-agentId keying either -- see denialClassesScopeKey()
 * immediately below for what it actually is: per-agent when a dispatched subagent is
 * resolvable, per-session_id for everything else (the orchestrator itself, and any
 * unresolved/invalid identity).
 */
function guardDenialClassesDir(commonDir) {
  return join(commonDir, "agent-pipeline", "guard-denial-classes");
}

function guardDenialClassesPath(commonDir, scopeKey) {
  return join(guardDenialClassesDir(commonDir), `${scopeKey}.json`);
}

/**
 * NVA-B-TRIMKEY (backlog/items/2026-09-01-the-denial-trim-state-is-keyed-per-session-not-per-
 * agent-as-its-comment-claims.md): the scope key isFirstDenialThisScope() persists state
 * under.
 *
 * Measured live, this dispatch, against this repository's own running harness (method:
 * dispatched as a subagent, then cross-checked THREE already-live, session_id/agentId-keyed
 * state trees this file and its siblings already write to on every real call --
 * `.claude/.stop-suggest-<session_id>.json` (stop-suggest.mjs), the bootstrap-receipt gate,
 * and guard-dispatch-budget.mjs's per-agent counter file -- rather than reading source and
 * assuming; see that backlog item's own resolution note for the full method and observation):
 * a dispatched subagent's PreToolUse (and Stop-hook) payloads carry the orchestrating
 * session's OWN `session_id`, unchanged -- a subagent is never assigned one of its own.
 * `.claude/.stop-suggest-<session_id>.json` exists ONLY for top-level orchestrating sessions,
 * never for any of the dozens of subagent dispatches observed under them, and the
 * orchestrator's own marker file was freshly rewritten DURING this very dispatch's turns.
 *
 * Keying purely on `session_id` therefore let a freshly dispatched subagent's FIRST denial of
 * a class render TRIMMED whenever its orchestrator (or a sibling subagent dispatched earlier
 * in the same session) had already triggered that class -- defeating the trim's own
 * requirement that the first denial of a class renders in full, for exactly the reader who
 * most needs it: a fresh-context subagent has no prior denial of its own to remember.
 *
 * The fix scopes state per DISPATCHED AGENT when subagentIdentity() resolves one -- the same
 * agentId bootstrapReceiptPath() already keys on (NVA-BOOTRECEIPT-1) -- falling back to
 * `session_id` for every shape that is not a resolved subagent:
 *  - the orchestrator itself has no agentId of its own, and legitimately keeps ONE
 *    session-wide trim scope across its own repeated denials -- this is unchanged behaviour,
 *    not a new gap;
 *  - an unresolved or invalid identity has no reliable per-agent key either; `session_id`
 *    stays the best available scope, and the worst case, exactly as before, is only ever
 *    extra full-text output, never a wrongly-trimmed denial.
 */
function denialClassesScopeKey(input, dependencies) {
  const identity = lifecycleSubagentIdentity(input, dependencies);
  if (identity.kind === "subagent" && typeof identity.agentId === "string" && identity.agentId !== "") {
    return `agent-${identity.agentId}`;
  }
  return typeof input?.session_id === "string" && input.session_id !== "" ? input.session_id : null;
}

/**
 * NVA-B-DENIALTRIM / NVA-B-TRIMKEY: true on the first denial of `classKey` (a grammar-denial
 * `code`) within one scope (see denialClassesScopeKey() above -- per resolved subagent, or
 * per session_id when no subagent identity resolves); false once that same class has already
 * been recorded seen for that same scope. Consulted ONLY on an actual denial (never on an
 * admitted/lifted command) by the two grammar-denial call sites in
 * evaluateLifecycleReadyGuard() below, and only within their `if (!route.admitted)` branch.
 *
 * This is a token-cost trim, never a correctness gate -- every failure mode below fails open
 * to `true` (the full-length rendering), so a broken or unresolvable state store can only ever
 * cost extra output, never silently drop an actionable denial down to the short form:
 *  - no resolvable scope key at all (neither a resolved subagent's agentId, nor a usable
 *    `session_id` -- mirrors onboardingConsentBlocked()'s own convention: a non-string or
 *    empty `session_id` is treated as absent);
 *  - no resolvable `<git-common-dir>` (mirrors evaluateBootstrapReceiptGate()'s own
 *    fail-open-on-null-commonDir semantics);
 *  - any read, parse, mkdir, or write error against the per-scope state file.
 */
export function isFirstDenialThisScope(input, root, classKey, dependencies) {
  const scopeKey = denialClassesScopeKey(input, dependencies);
  if (!scopeKey) return true;
  const commonDir = (dependencies.resolveGitCommonDirFn ?? resolveGitCommonDir)(root, dependencies);
  if (commonDir === null) return true; // nowhere safe to persist -- fail open, full text every time
  const existsSyncFn = dependencies.existsSyncFn ?? existsSync;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  const writeFileSyncFn = dependencies.writeFileSyncFn ?? writeFileSync;
  const mkdirSyncFn = dependencies.mkdirSyncFn ?? mkdirSync;
  const statePath = guardDenialClassesPath(commonDir, scopeKey);
  try {
    let seenClasses = [];
    if (existsSyncFn(statePath)) {
      const parsed = JSON.parse(readFileSyncFn(statePath, "utf8"));
      if (Array.isArray(parsed?.seenClasses)) seenClasses = parsed.seenClasses;
    }
    if (seenClasses.includes(classKey)) return false;
    mkdirSyncFn(guardDenialClassesDir(commonDir), { recursive: true, mode: 0o700 });
    const updated = {
      schema: "pipeline.guard-denial-classes-seen.v1",
      seenClasses: [...seenClasses, classKey],
    };
    writeFileSyncFn(statePath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    return true;
  } catch {
    return true; // never let a state-store failure trim an actionable denial -- fail open
  }
}

/**
 * ADR-0059 Decision 5 / NOVA-LCR-HGO-2: everything below -- the LAUNCH_SCRIPT
 * external-restart refusal and the onboarding-readiness gate (denial code
 * GUARD-LIFECYCLE-NOT-READY) -- stays outside HGO's authority no matter how the
 * shell-grammar objection above was resolved. This function is the exact tail of
 * evaluateLifecycleReadyGuard() that used to be unreachable once a grammar capability
 * was consumed (verdict(0) returned immediately at the grammar check itself); it is now
 * called unconditionally so a lifted command is admitted only if these checks also
 * admit it. Its own logic is otherwise unchanged.
 */
// Telemetry never changes an admission/refusal. Only exact currently offered
// commands reach the counter; answer placeholders and unrelated attempts do not.
function lifecycleLoopScope(input, dependencies) {
  const identity = lifecycleSubagentIdentity(input, dependencies);
  if (!["orchestrator", "subagent"].includes(identity.kind)) return null;
  return {sessionId: input.session_id, agentId: identity.kind === "subagent" ? identity.agentId : null};
}

function lifecycleLoopState(observed, root, dependencies) {
  const checkpoint = (dependencies.readOnboardingIntakeCheckpointFn ?? readOnboardingIntakeCheckpoint)({
    rootDir: root, repositoryCapability: observed.repository?.mode ?? "local"});
  if (!["absent", "present"].includes(checkpoint.status)) throw new Error("intake observation unavailable");
  const index = observed.nextAction.argv.indexOf("--plan-sha256");
  return {
    sourceSha256: observed.runtime?.sourceSha256 ?? null,
    targetsSha256: observed.runtime?.targetsSha256 ?? null,
    barrierSha256: observed.runtime?.barrierSha256 ?? null,
    readbackSha256: observed.runtime?.readbackSha256 ?? null,
    stateSha256: observed.continuity?.stateSha256 ?? null,
    handoverSha256: observed.continuity?.handoverSha256 ?? null,
    historySha256: observed.continuity?.historySha256 ?? null,
    checkpointSha256: checkpoint.status === "present" ? checkpoint.sha256 : null,
    planSha256: index >= 0 ? observed.nextAction.argv[index + 1] : null,
  };
}

export function withLifecycleReturnedActionTelemetry(result, input, root, toolName, dependencies) {
  if (dependencies.runner !== "codex") return result;
  try {
    const scope = lifecycleLoopScope(input, dependencies);
    if (!scope) return result;
    const commonDir = (dependencies.resolveGitCommonDirFn ?? resolveGitCommonDir)(root, dependencies);
    if (!commonDir) return result;
    if (result.exitCode === 0) {
      (dependencies.resetLifecycleDenialFn ?? resetLifecycleDenial)({commonDir, scope});
      return result;
    }
    if (result.exitCode !== 2 || toolName !== "Bash" || !dependencies.lifecycleReturnedDenial
      || !result.stderr.startsWith("BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-LIFECYCLE-NOT-READY:")) return result;
    const match = observedOnboardingCommandMatch((input.tool_input.command ?? input.tool_input.CommandLine), root, dependencies);
    if (!match || match.observed.runner !== "codex" || match.observed.status !== dependencies.lifecycleReturnedDenial.status) {
      (dependencies.resetLifecycleDenialFn ?? resetLifecycleDenial)({commonDir, scope});
      return result;
    }
    const recorded = (dependencies.observeReturnedActionDenialFn ?? observeReturnedActionDenial)({
      commonDir, scope, offeredActionMatches: true, state: lifecycleLoopState(match.observed, root, dependencies),
      reason: dependencies.lifecycleReturnedDenial.reason, status: match.observed.status,
      action: {kind: match.action.kind, executable: match.action.executable, argv: match.action.argv},
    });
    if (recorded?.code !== "GUARD-LIFECYCLE-RETURNED-ACTION-LOOP" || recorded.count !== 2) return result;
    const diagnostic = {schema: "pipeline.lifecycle-returned-action-loop.v1", code: recorded.code, count: 2,
      actionFingerprint: recorded.actionFingerprint, stateFingerprint: recorded.stateFingerprint,
      mutation: false, nextAction: {kind: "command", executable: process.execPath, argv: [REPAIR_MAP_SCRIPT], mutation: false, requiresConfirmation: false}};
    const recovery = renderProjectOnboardingAction(diagnostic.nextAction);
    return verdict(2, "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-LIFECYCLE-NOT-READY: "
      + `Pipeline session readiness remains ${match.observed.status}. The exact returned action was refused twice against the same observed bindings.\n`
      + "Stop retrying this mutation until the observed bindings change; run the read-only diagnosis and report this bounded loop to the PO.\n"
      + "Read-only diagnosis: " + recovery + "\n" + JSON.stringify(diagnostic) + "\n");
  } catch {
    return result; // missing identities, storage faults and invalid records never create a loop claim
  }
}
