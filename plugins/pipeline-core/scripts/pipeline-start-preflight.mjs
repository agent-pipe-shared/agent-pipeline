#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Report loaded distribution identity and restart-handoff presence without secrets. */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { measureBootstrapPayload } from "../lib/bootstrap-payload-budget.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { observeCodexPublicCoreIdentity, observePublicCoreIdentity } from "../lib/public-core-observation.mjs";
import { PUBLIC_SELF_APPLICATION_ORIGINS } from "../lib/public-core-origin-allowlist.mjs";
import { normalizeRulesetSource, RULESET_SOURCE_SCHEMA } from "../lib/ruleset-source.mjs";

export const SCHEMA = "pipeline.start-preflight.v1";
const PLUGIN_ID = "pipeline-core@agent-pipeline";
const LOCAL_PLUGIN_ID = "pipeline-core@agent-pipeline-local";
const NORMAL_BOOTSTRAP_CHECKS = Object.freeze([
  "lifecycle",
  "authority",
  "calibration",
  "handover",
  "verify",
  "continuation",
]);

export function normalBootstrapPayloadReceipt(payload) {
  const measurement = measureBootstrapPayload(payload, {
    mode: "normal",
    runner: "runner-neutral",
  });
  return {
    schema: "pipeline.bootstrap-payload-receipt.v1",
    mode: "normal",
    retainedChecks: NORMAL_BOOTSTRAP_CHECKS,
    originalMeasurement: measurement,
    emittedMeasurement: measurement,
    overBudget: !measurement.withinBudget,
    truncated: false,
  };
}

function readInstalledPluginList(runner) {
  const executable = runner === "claude" ? "claude" : "codex";
  const result = spawnSync(executable, ["plugin", "list", "--json"], {
    encoding: "utf8",
    shell: false,
    timeout: 5_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0 || typeof result.stdout !== "string") return null;
  return result.stdout;
}

/** Reads the host's own `~/.claude/plugins/known_marketplaces.json` (Claude-only registry). */
function readClaudeKnownMarketplaces() {
  return readFileSync(resolve(homedir(), ".claude", "plugins", "known_marketplaces.json"), "utf8");
}

function installedPipelineIdentityCodex(payload) {
  if (!Array.isArray(payload?.installed)) return null;
  const eligible = (entry) =>
    [PLUGIN_ID, LOCAL_PLUGIN_ID].includes(entry?.pluginId)
    && entry?.name === "pipeline-core"
    && entry?.marketplaceName === entry.pluginId.slice("pipeline-core@".length)
    && entry?.installed === true
    && entry?.enabled === true
    && typeof entry?.version === "string"
    && entry.version.trim() !== "";
  const localMatches = payload.installed.filter((entry) =>
    eligible(entry) && entry.pluginId === LOCAL_PLUGIN_ID);
  const officialMatches = payload.installed.filter((entry) =>
    eligible(entry) && entry.pluginId === PLUGIN_ID);
  if (localMatches.length + officialMatches.length > 1) {
    return { version: null, source: "unknown", ambiguous: true };
  }
  if (localMatches.length + officialMatches.length !== 1) return null;
  const matches = localMatches.length === 1 ? localMatches : officialMatches;
  const entry = matches[0];
  const exactLocalSource = entry?.marketplaceSource?.sourceType === "local"
    && typeof entry.marketplaceSource.source === "string"
    && isAbsolute(entry.marketplaceSource.source)
    && resolve(entry.marketplaceSource.source) === entry.marketplaceSource.source
    && entry?.source?.source === "local"
    && typeof entry.source.path === "string"
    && isAbsolute(entry.source.path)
    && resolve(entry.source.path) === entry.source.path
    && resolve(entry.marketplaceSource.source, "plugins", "pipeline-core") === entry.source.path;
  if (entry.pluginId === LOCAL_PLUGIN_ID && !exactLocalSource) return null;
  let source = "unknown";
  if (entry?.marketplaceSource?.sourceType === "git") {
    source = "remote";
  } else if (exactLocalSource) {
    source = "local-development";
  }
  return { version: entry.version, source };
}

/**
 * The registered marketplace name is the substring of `id`/`pluginId` after
 * the `@` -- the same convention both runners use (`pipeline-core@<name>`).
 */
function claudeMarketplaceName(id) {
  const at = id.indexOf("@");
  return at === -1 ? "" : id.slice(at + 1);
}

/**
 * Claude's `plugin list --json` carries no source/marketplaceSource fields
 * (unlike Codex), so a `local-development` claim can only be attested via
 * the host's own `known_marketplaces.json` registry: the marketplace this
 * id was installed from must be a `directory` source with an absolute,
 * normalized path. `projectPath` on the list entry is NOT usable for this --
 * it was measured to be populated identically for a github-sourced install.
 */
function claudeLocalDevelopmentAttested(entry, knownMarketplaces) {
  let registry;
  try {
    registry = JSON.parse(knownMarketplaces());
  } catch {
    return false;
  }
  if (registry === null || typeof registry !== "object" || Array.isArray(registry)) return false;
  const source = registry[claudeMarketplaceName(entry.id)]?.source;
  return source?.source === "directory"
    && typeof source.path === "string"
    && isAbsolute(source.path)
    && resolve(source.path) === source.path;
}

function installedPipelineIdentityClaude(payload, knownMarketplaces) {
  if (!Array.isArray(payload)) return null;
  const eligible = (entry) =>
    [PLUGIN_ID, LOCAL_PLUGIN_ID].includes(entry?.id)
    && entry?.enabled === true
    && typeof entry?.version === "string"
    && entry.version.trim() !== "";
  const localMatches = payload.filter((entry) => eligible(entry) && entry.id === LOCAL_PLUGIN_ID);
  const officialMatches = payload.filter((entry) => eligible(entry) && entry.id === PLUGIN_ID);
  if (localMatches.length + officialMatches.length > 1) {
    return { version: null, source: "unknown", ambiguous: true };
  }
  if (localMatches.length + officialMatches.length !== 1) return null;
  const matches = localMatches.length === 1 ? localMatches : officialMatches;
  const entry = matches[0];
  const isLocalId = entry.id === LOCAL_PLUGIN_ID;
  const attestedLocal = isLocalId && claudeLocalDevelopmentAttested(entry, knownMarketplaces);
  if (isLocalId && !attestedLocal) return null;
  return { version: entry.version, source: attestedLocal ? "local-development" : "unknown" };
}

export function installedPipelineIdentity(
  pluginList = () => readInstalledPluginList("codex"),
  runner = "codex",
  knownMarketplaces = readClaudeKnownMarketplaces,
) {
  let payload;
  try {
    payload = JSON.parse(pluginList());
  } catch {
    return null;
  }
  return runner === "claude"
    ? installedPipelineIdentityClaude(payload, knownMarketplaces)
    : installedPipelineIdentityCodex(payload);
}

export function installedPipelineVersion(pluginList = () => readInstalledPluginList("codex"), runner = "codex") {
  return installedPipelineIdentity(pluginList, runner)?.version ?? null;
}

export function observePipelineStartPreflight({
  env = process.env,
  pluginList,
  read = readFileSync,
  scriptUrl = import.meta.url,
  cwd = process.cwd(),
  knownMarketplaces = readClaudeKnownMarketplaces,
  observe,
} = {}) {
  const pluginRoot = resolve(dirname(fileURLToPath(scriptUrl)), "..");
  // CLAUDECODE is set by every Claude Code session (main and subagent); its
  // absence keeps the historical Codex-CLI default. This is the one place a
  // session's own runner identity enters the onboarding chain -- without it,
  // a Claude session silently inherits Codex-only gates (App-Server health,
  // native runtime readback) that RUNNERS_WITHOUT_APP_SERVER/
  // RUNNERS_WITHOUT_NATIVE_READBACK exist specifically to exempt it from.
  // Resolved BEFORE the reads below: both the source-manifest read and the
  // installed-plugin-list read must resolve through this same runner
  // identity, so each runner reads and reports its own distribution only.
  const runner = env.CLAUDECODE === "1" ? "claude" : "codex";
  const manifestRelativePath = runner === "claude" ? ".claude-plugin/plugin.json" : ".codex-plugin/plugin.json";
  let version;
  try {
    const manifest = JSON.parse(read(resolve(pluginRoot, manifestRelativePath), "utf8"));
    version = typeof manifest?.version === "string" && manifest.version.trim() !== ""
      ? manifest.version
      : null;
  } catch {
    version = null;
  }
  const resolvedPluginList = pluginList ?? (() => readInstalledPluginList(runner));
  const installedIdentity = installedPipelineIdentity(resolvedPluginList, runner, knownMarketplaces);
  const installedVersion = installedIdentity?.version ?? null;
  const ticket = Object.prototype.hasOwnProperty.call(env, "PIPELINE_CODEX_ONBOARDING_TICKET_ID")
    && String(env.PIPELINE_CODEX_ONBOARDING_TICKET_ID) !== "";
  const token = Object.prototype.hasOwnProperty.call(env, "PIPELINE_CODEX_ONBOARDING_TOKEN")
    && String(env.PIPELINE_CODEX_ONBOARDING_TOKEN) !== "";
  const wsl = [env.WSL_DISTRO_NAME, env.WSL_INTEROP]
    .some((value) => typeof value === "string" && value.trim() !== "");
  const executionBoundary = wsl ? "host-authorized-wsl" : "default";
  // Origin/content attestation of the loaded plugin itself (design:
  // bootstrap-origin-allowlist-and-codex-wsl-freshness.md §A.2-§A.5). Mirrors
  // the calling pattern already established in private-overlay-activation.mjs:
  // `observe` defaults per-runner, self-referentially, to the same reused
  // Public-Core observers already proven safe on the private-overlay path.
  // Skipped when the manifest itself is unreadable -- `status` below already
  // hard-fails to "plugin-identity-unavailable" in that case regardless of
  // this result. A negative result never invents a new hard-fail status; it
  // only widens the existing "plugin-refresh-required" branch.
  const resolvedObserve = observe
    ?? (runner === "codex" ? observeCodexPublicCoreIdentity : observePublicCoreIdentity);
  let attestationFailed = false;
  if (version) {
    const observation = resolvedObserve({ sourcePluginRoot: pluginRoot, installedPluginRoot: pluginRoot }, {});
    const originAllowlisted = observation?.status === "ready"
      && PUBLIC_SELF_APPLICATION_ORIGINS.has(observation.candidate?.repository);
    // sourcePluginRoot === installedPluginRoot by construction here, so
    // loadedIdentity/installedIdentity are necessarily equal -- normalizeRulesetSource
    // is exercised for its schema-closure value and as a genuine production
    // caller, not as an independent content-hash match (design §A.4, PO-resolved).
    const normalized = observation?.status === "ready"
      ? normalizeRulesetSource({
          schema: RULESET_SOURCE_SCHEMA,
          runner,
          selectedPlugin: { id: observation.plugin.name, version: observation.plugin.version },
          source: { class: "self-application" },
          loadedIdentity: { status: "available", algorithm: "content-sha256", value: observation.plugin.contentSha256 },
          installedIdentity: { status: "available", algorithm: "content-sha256", value: observation.plugin.contentSha256 },
        })
      : null;
    attestationFailed = !originAllowlisted || normalized?.status !== "ready";
  }
  const status = !version
    ? "plugin-identity-unavailable"
    : installedIdentity?.ambiguous === true || installedVersion !== null && installedVersion !== version || attestationFailed
      ? "plugin-refresh-required"
      : "ready";
  const result = {
    schema: SCHEMA,
    status,
    version,
    installedVersion,
    installedSource: installedIdentity?.source ?? "unknown",
    executionBoundary,
    pluginRoot,
    handoff: ticket && token ? "ready" : ticket || token ? "malformed" : "none",
    nextAction: status === "ready"
      ? {
          kind: "command",
          executable: "node",
          argv: [
            resolve(pluginRoot, "scripts/project-onboarding-v3.mjs"),
            "inspect",
            "--root",
            resolve(cwd),
            "--intent",
            "bootstrap",
            "--runner",
            runner,
          ],
          mutation: false,
          requiresConfirmation: false,
          executionBoundary,
          expected: {
            schema: "pipeline.project-onboarding.v4",
          },
        }
      // "plugin-refresh-required" is a soft/advisory status, not a hard block
      // (design §A.5, correcting the prior nextAction: null defect -- that left
      // this branch with nothing to execute and no printable confirmation).
      // Nothing executes; the advisory is carried forward through bootstrap.
      : status === "plugin-refresh-required"
        ? {
            kind: "advisory",
            executable: null,
            argv: [],
            mutation: false,
            requiresConfirmation: false,
            executionBoundary,
            expected: {
              schema: "pipeline.plugin-refresh-advisory.v1",
            },
          }
        : null,
  };
  return {
    ...result,
    // This measures the exact normal-bootstrap envelope emitted before the
    // self-describing receipt. The receipt is retained in the same typed
    // preflight readback; no cached or static skill-size surrogate is used.
    bootstrapPayload: normalBootstrapPayloadReceipt(result),
  };
}

export function pipelineStartPreflightExitCode(result) {
  return result?.status === "ready" || result?.status === "plugin-refresh-required" ? 0 : 2;
}

export function main() {
  const result = observePipelineStartPreflight();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return pipelineStartPreflightExitCode(result);
}

if (isDirectInvocation(import.meta.url)) process.exitCode = main();
