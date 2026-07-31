#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Report loaded distribution identity and restart-handoff presence without secrets. */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { observeCodexRulesetSource } from "../lib/codex-host-plugin-list.mjs";
import { WSL_FRESHNESS_BOUNDARY_ID } from "./ruleset-freshness.mjs";

export const SCHEMA = "pipeline.start-preflight.v1";
const PLUGIN_ID = "pipeline-core@agent-pipeline";
const LOCAL_PLUGIN_ID = "pipeline-core@agent-pipeline-local";

function readInstalledPluginList() {
  const result = spawnSync("codex", ["plugin", "list", "--json"], {
    encoding: "utf8",
    shell: false,
    timeout: 5_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0 || typeof result.stdout !== "string") return null;
  return result.stdout;
}

export function installedPipelineIdentity(pluginList = readInstalledPluginList) {
  let payload;
  try {
    payload = JSON.parse(pluginList());
  } catch {
    return null;
  }
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

export function installedPipelineVersion(pluginList = readInstalledPluginList) {
  return installedPipelineIdentity(pluginList)?.version ?? null;
}

/**
 * Return only the selected host route after a WSL preflight. Control identity
 * selection occurs in the authorized host helper immediately before it starts
 * the fixed Git child; a sandbox preflight must not claim host availability.
 */
export function freshnessHostActionForPreflight(preflight) {
  if (!preflight || typeof preflight !== "object"
    || preflight.schema !== SCHEMA
    || preflight.status !== "ready"
    || preflight.executionBoundary !== "host-authorized-wsl") return null;
  return Object.freeze({ executionBoundary: "host-authorized-wsl", boundaryId: WSL_FRESHNESS_BOUNDARY_ID });
}

export function observePipelineStartPreflight({
  env = process.env,
  pluginList = readInstalledPluginList,
  read = readFileSync,
  observeRulesetSource = observeCodexRulesetSource,
  scriptUrl = import.meta.url,
  cwd = process.cwd(),
} = {}) {
  const pluginRoot = resolve(dirname(fileURLToPath(scriptUrl)), "..");
  let version;
  try {
    const manifest = JSON.parse(read(resolve(pluginRoot, ".codex-plugin/plugin.json"), "utf8"));
    version = typeof manifest?.version === "string" && manifest.version.trim() !== ""
      ? manifest.version
      : null;
  } catch {
    version = null;
  }
  const installedIdentity = installedPipelineIdentity(pluginList);
  const installedVersion = installedIdentity?.version ?? null;
  let rulesetSource;
  try {
    rulesetSource = observeRulesetSource({
      loadedPluginRoot: pluginRoot,
      selfApplicationRoot: resolve(pluginRoot, "..", ".."),
    });
  } catch {
    rulesetSource = { schema: "pipeline.codex-ruleset-source-observation.v1", status: "codex-plugin-list-unavailable", observation: null };
  }
  const sourceReady = rulesetSource?.schema === "pipeline.codex-ruleset-source-observation.v1"
    && rulesetSource.status === "ready"
    && rulesetSource.observation !== null;
  const selectedPluginVersion = rulesetSource?.observation?.selectedPlugin?.version;
  const sourceVersionBound = sourceReady
    && selectedPluginVersion === version
    && (installedVersion === null || selectedPluginVersion === installedVersion);
  const ticket = Object.prototype.hasOwnProperty.call(env, "PIPELINE_CODEX_ONBOARDING_TICKET_ID")
    && String(env.PIPELINE_CODEX_ONBOARDING_TICKET_ID) !== "";
  const token = Object.prototype.hasOwnProperty.call(env, "PIPELINE_CODEX_ONBOARDING_TOKEN")
    && String(env.PIPELINE_CODEX_ONBOARDING_TOKEN) !== "";
  const wsl = [env.WSL_DISTRO_NAME, env.WSL_INTEROP]
    .some((value) => typeof value === "string" && value.trim() !== "");
  const executionBoundary = wsl ? "host-authorized-wsl" : "default";
  const status = !version
    ? "plugin-identity-unavailable"
    : installedIdentity?.ambiguous === true || installedVersion !== null && installedVersion !== version || !sourceVersionBound
      ? "plugin-refresh-required"
      : "ready";
  return {
    schema: SCHEMA,
    status,
    version,
    installedVersion,
    installedSource: installedIdentity?.source ?? "unknown",
    rulesetSource: {
      status: typeof rulesetSource?.status === "string" ? rulesetSource.status : "codex-plugin-list-unavailable",
      observation: sourceReady ? rulesetSource.observation : null,
    },
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
          ],
          mutation: false,
          requiresConfirmation: false,
          executionBoundary,
          expected: {
            schema: "pipeline.project-onboarding.v4",
          },
        }
      : null,
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

const invokedDirectly = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (invokedDirectly) process.exitCode = main();
