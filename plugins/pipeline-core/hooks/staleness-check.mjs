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

export function runSync(deps = {}) {
  const projectDir = deps.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const observed = inspectSessionStartUpdateAvailabilitySync(projectDir, deps);
  const decision = decideOutput(observed);
  (deps.stdout ?? process.stdout).write(decision.stdout);
  return { exitCode: 0, decision };
}

export async function run(deps = {}) {
  return runSync(deps);
}

if (isDirectInvocation(import.meta.url)) {
  runSync();
}
