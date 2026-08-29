#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * SessionStart projection of Pipeline distribution-update availability.
 *
 * This hook deliberately does not inspect the current repository branch or
 * decide write admission. It delegates channel/ref selection and comparison to
 * the same helper used by pipeline-start, then renders a fail-open reminder.
 * It never updates a plugin, changes a channel, or blocks SessionStart.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
// NVA-STALENESSTLA-1: statically imported so this session-start hook needs no top-level
// await at all -- see inspectSessionStartUpdateAvailabilitySync below for why that matters.
import { inspectPipelineUpdateAvailability } from "../scripts/ruleset-freshness.mjs";
// NVA-W1-SCRATCHBIND: the scratch-descriptor bind/sweep bootstrap already exists
// (pipeline-start-preflight.mjs) but nothing in production ever supplied it a session
// identity -- see runScratchLifecycleForSessionStart below for the full wiring rationale.
// Static import, matching NVA-STALENESSTLA-1's discipline above: this call is synchronous
// end to end (spawnSync throughout), so no dynamic import is needed here either.
import { runBootstrapScratchLifecycle } from "../scripts/pipeline-start-preflight.mjs";

export const PLUGIN_ID = "pipeline-core@agent-pipeline";
export const BOOTSTRAP_LINE = "Agent-Pipeline: run /pipeline-core:pipeline-start before any work";
export const UPDATE_TIMEOUT_MS = 5_000;
export const PIPELINE_UPDATE_AVAILABILITY_SCHEMA =
  "pipeline.pipeline-update-availability.v1";

const UPDATE_STATUSES = new Set([
  "current",
  "update-available",
  "local-ahead",
  "unknown",
]);
const CHANNELS = new Set(["alpha", "beta", "stable"]);

/** Marketplace URL resolver retained as the shared, read-only source boundary. */
export function resolveMarketplaceUrl({ settingsPath, pluginId = PLUGIN_ID }) {
  let settings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch {
    return null;
  }
  const marketplaceName = pluginId.split("@")[1];
  if (!marketplaceName) return null;
  const source = settings?.extraKnownMarketplaces?.[marketplaceName]?.source;
  if (source?.source === "github" && typeof source.repo === "string" && source.repo !== "") {
    return `https://github.com/${source.repo}.git`;
  }
  if (source?.source === "gitlab" && typeof source.repo === "string" && source.repo !== "") {
    const host = typeof source.host === "string" && source.host !== ""
      ? source.host
      : "gitlab.com";
    return `https://${host}/${source.repo}.git`;
  }
  return null;
}

function unavailable(reason = "update-observation-unavailable") {
  return {
    schema: PIPELINE_UPDATE_AVAILABILITY_SCHEMA,
    status: "unknown",
    pipelineUpdateAvailability: "unknown",
    channel: null,
    channelSource: null,
    ref: null,
    version: null,
    commit: null,
    updateAvailable: false,
    updateRecommended: false,
    blocking: false,
    policyDisposition: null,
    reason,
  };
}

export function normalizePipelineUpdateAvailability(value) {
  if (value?.schema !== PIPELINE_UPDATE_AVAILABILITY_SCHEMA
    || !UPDATE_STATUSES.has(value.status)
    || value.pipelineUpdateAvailability !== value.status
    || (value.channel !== null && !CHANNELS.has(value.channel))
    || (value.ref !== null && typeof value.ref !== "string")) {
    return unavailable();
  }
  return value;
}

export function isExactSecurityPolicyBlock(value) {
  const disposition = value?.policyDisposition;
  return value?.blocking === true
    && disposition?.schema === "pipeline.ruleset-update-policy-disposition.v1"
    && disposition.status === "matched"
    && disposition.blocking === true
    && disposition.disposition === "blocking"
    && disposition.reason === "exact-security-policy-match"
    && typeof disposition.policyId === "string"
    && Number.isSafeInteger(disposition.policyVersion)
    && /^[a-f0-9]{64}$/u.test(disposition.policySha256 ?? "")
    && typeof disposition.entryId === "string"
    && typeof disposition.publicSecurityReason === "string";
}

function display(value) {
  return value === null || value === undefined || value === "" ? "unavailable" : String(value);
}

export function buildAvailabilityContext(value) {
  return [
    BOOTSTRAP_LINE,
    "repositoryFreshness=not-observed (writeAdmission=not-evaluated)",
    `pipelineUpdateAvailability=${value.status}`,
    `channel=${display(value.channel)}`,
    `channelSource=${display(value.channelSource)}`,
    `ref=${display(value.ref)}`,
    `reason=${display(value.reason)}`,
  ].join(" · ");
}

function updateMessage(value) {
  return "Agent-Pipeline update available "
    + `(channel ${display(value.channel)}, ref ${display(value.ref)}). `
    + "This is advisory distribution metadata, not repository freshness or write admission. "
    + "No update runs automatically; run pipeline-start for the runner-specific operator flow.";
}

function securityMessage(value) {
  const policy = value.policyDisposition;
  return "Agent-Pipeline F2 security update required "
    + `(policy ${policy.policyId} v${policy.policyVersion}, entry ${policy.entryId}; `
    + `channel ${display(value.channel)}, ref ${display(value.ref)}): `
    + `${policy.publicSecurityReason} Bootstrap must stop before confirmation; `
    + "SessionStart itself remains read-only and performs no update.";
}

export function decideOutput(observed) {
  const value = normalizePipelineUpdateAvailability(observed);
  const additionalContext = buildAvailabilityContext(value);
  const securityBlock = isExactSecurityPolicyBlock(value);
  const updateAvailable = value.status === "update-available";
  if (!securityBlock && !updateAvailable) {
    return {
      status: value.status,
      stdout: `${additionalContext}\n`,
      json: false,
      value,
    };
  }
  const payload = {
    systemMessage: securityBlock ? securityMessage(value) : updateMessage(value),
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext,
      repositoryFreshness: {
        status: "not-observed",
        writeAdmission: "not-evaluated",
      },
      pipelineUpdateAvailability: {
        schema: value.schema,
        status: value.status,
        channel: value.channel,
        channelSource: value.channelSource,
        ref: value.ref,
        version: value.version ?? null,
        commit: value.commit ?? null,
        updateRecommended: value.updateRecommended === true,
        blocking: securityBlock,
        policyDisposition: value.policyDisposition ?? null,
        reason: value.reason ?? null,
      },
    },
  };
  return {
    status: value.status,
    stdout: `${JSON.stringify(payload)}\n`,
    json: true,
    payload,
    value,
  };
}

/**
 * NVA-STALENESSTLA-1 (measured 2026-08-27 on a live Claude Code session on Windows):
 *
 *   SessionStart:startup hook error
 *   Failed with non-blocking status code: Warning: Detected unsettled top-level
 *   await at .../hooks/staleness-check.mjs:208
 *
 * The observation this hook performs is entirely synchronous -- `ruleset-freshness.mjs`
 * uses `spawnSync` throughout and has no top-level await of its own. The ONLY asynchrony
 * in the whole path was the `await import(...)` below, and the only reason the module
 * needed a top-level await at all was to await it. That combination is what Node reported:
 * a module-level await pending while the loop drains, on a hook that runs at every single
 * session start.
 *
 * The fix is structural, not a timeout: the helper is now a static import, the observation
 * is synchronous end to end, and the module's entry point is a plain synchronous call. A
 * hook on the session-start path cannot carry a top-level await, so this failure class is
 * removed rather than made less likely. `run()` stays async purely so existing callers and
 * the suite can keep awaiting it; its body no longer awaits anything real, so it always
 * settles on the microtask queue.
 *
 * The static import is safe where the dynamic one was defensive: `ruleset-freshness.mjs`
 * ships inside this same plugin, next to `entrypoint.mjs` which this file already imports
 * statically, so "the helper might be missing" was never a reachable state. A genuine load
 * failure now surfaces as a real error instead of being silently reported as `unavailable`.
 */
export function inspectSessionStartUpdateAvailabilitySync(projectDir, deps = {}) {
  const options = {
    distributionTopology: "installed-consumer",
    timeoutMs: deps.timeoutMs ?? UPDATE_TIMEOUT_MS,
  };
  try {
    if (typeof deps.inspect === "function") return deps.inspect(projectDir, options);
    return inspectPipelineUpdateAvailability(projectDir, options);
  } catch {
    return unavailable();
  }
}

export async function inspectSessionStartUpdateAvailability(projectDir, deps = {}) {
  return inspectSessionStartUpdateAvailabilitySync(projectDir, deps);
}

/**
 * NVA-W1-SCRATCHBIND: session_id resolution from this hook's own SessionStart stdin. Same
 * pure, never-throws shape as stop-suggest.mjs's own resolveSessionIdFromInput (a different
 * module, so the identical name does not collide) -- takes the already-JSON.parsed value, or
 * `null` if parsing failed.
 * @param {object|null} parsedInput
 * @returns {string|null}
 */
export function resolveSessionIdFromInput(parsedInput) {
  if (!parsedInput || typeof parsedInput !== "object") return null;
  const sid = parsedInput.session_id;
  return typeof sid === "string" && sid !== "" ? sid : null;
}

/**
 * NVA-W1-SCRATCHBIND (backlog: 2026-08-08-the-scratch-cleanup-mechanism-exists-but-no-event-
 * calls-it.md, Point 1). The scratch-descriptor bind/sweep bootstrap
 * (`runBootstrapScratchLifecycle`) has existed since NVA-BL-82, but nothing in production ever
 * supplied it `PIPELINE_SCRATCH_SESSION_ID`, so binding always fell back to
 * `unbound-no-session-identity`. This SessionStart hook already receives a real per-session
 * `session_id` on its own stdin (Claude Code's standard hook input, delivered to every hook
 * type) and already runs at exactly the bootstrap moment the backlog item's Direction names
 * ("bind on session start; sweep on the NEXT session's bootstrap") -- extending THIS hook,
 * rather than adding a new hooks.json entry, keeps hooks.json (TP-4, edited only under explicit
 * PO approval) untouched, and is the "lowest-risk wiring route" the backlog item's own
 * 2026-08-25 re-triage named and left unimplemented.
 *
 * PID-vs-PPID DECISION (stated, not left a TODO): `bindScratchDescriptor` records a `pid` used
 * later to judge whether the binding session is still alive (`defaultProcessAlive` plus a
 * boot_id/start-ticks fingerprint, session-cleanup-recovery.mjs). This hook process itself is a
 * one-shot `node staleness-check.mjs` invocation that exits within milliseconds of writing its
 * output -- recording `process.pid` (what a naive per-invocation bind would do) would make
 * every binding read back as "orphan" on the very next sweep, regardless of whether the actual
 * agent session is still running, which is the exact unbounded-growth failure this whole
 * mechanism exists to prevent. `process.ppid` is used instead: Claude Code invokes this hook's
 * command as a child of the long-running per-session host process, so the parent pid persists
 * for the session's whole lifetime and is the correct liveness anchor. This is exactly the
 * semantics the backlog item's own investigation named as the intended fix ("i.e. process.ppid
 * ... rather than process.pid, a semantics decision not made anywhere in the code today"). A
 * PID can be reused by an unrelated process after the original one exits; that risk is already
 * covered by the existing boot_id+start-ticks fingerprint check in
 * session-cleanup-recovery.mjs, unchanged by this hook.
 *
 * FAIL-OPEN, ALWAYS -- identical discipline to pipeline-start-preflight.mjs's own scratch-
 * lifecycle call in `main()`: this never affects the hook's stdout decision or exit code, and
 * any fault (including a malformed/absent stdin payload) is swallowed and yields `null`.
 *
 * Testability, and the reason NOTHING here calls `readFileSync(0, ...)`: measured live
 * (2026-08-29) that an unconditional fd-0 read inside a function `node --test` calls directly
 * hangs the whole suite -- real hook invocations pipe a JSON payload and close the descriptor,
 * but a test harness's own stdin is not guaranteed closed the same way. This function therefore
 * NEVER reads stdin itself; it only ever consumes an already-resolved `deps.stdinPayload`
 * (`null` when absent). The one real stdin read lives solely at the direct-invocation entry
 * point below, exactly mirroring stop-suggest.mjs's own "read stdin once, only in `run()`"
 * discipline -- never inside a function a test calls.
 */
export function runScratchLifecycleForSessionStart(deps = {}) {
  const rootDir = deps.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const parsedInput = deps.stdinPayload ?? null;
  const sessionId = resolveSessionIdFromInput(parsedInput);
  const lifecycle = deps.scratchLifecycleFn ?? runBootstrapScratchLifecycle;
  const pidFn = deps.pidFn ?? (() => process.ppid);
  try {
    return lifecycle({
      rootDir,
      env: sessionId !== null ? { PIPELINE_SCRATCH_SESSION_ID: sessionId } : {},
      deps: { pidFn },
    });
  } catch {
    return null;
  }
}

export function runSync(deps = {}) {
  const projectDir = deps.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const observed = inspectSessionStartUpdateAvailabilitySync(projectDir, deps);
  const decision = decideOutput(observed);
  (deps.stdout ?? process.stdout).write(decision.stdout);
  // NVA-W1-SCRATCHBIND: housekeeping only -- deliberately on stderr and deliberately never
  // allowed to influence this hook's own stdout decision or exit code, matching
  // pipeline-start-preflight.mjs's own convention for the identical call.
  let scratchLifecycle = null;
  try {
    scratchLifecycle = runScratchLifecycleForSessionStart({ ...deps, projectDir });
    if (scratchLifecycle !== null) {
      (deps.stderr ?? process.stderr).write(`${JSON.stringify(scratchLifecycle)}\n`);
    }
  } catch {
    // Housekeeping never decides a bootstrap's exit code.
  }
  return { exitCode: 0, decision, scratchLifecycle };
}

export async function run(deps = {}) {
  return runSync(deps);
}

if (isDirectInvocation(import.meta.url)) {
  // NVA-W1-SCRATCHBIND: the one real stdin read for this hook, matching stop-suggest.mjs's
  // own "read once, only at the real entry point" discipline -- see
  // runScratchLifecycleForSessionStart's doc comment above for why this must never move into
  // a function a test calls directly.
  let stdinPayload = null;
  try {
    stdinPayload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    stdinPayload = null;
  }
  runSync({ stdinPayload });
}
