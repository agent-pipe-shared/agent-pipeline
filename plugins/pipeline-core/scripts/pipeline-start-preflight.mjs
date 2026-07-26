#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Report loaded distribution identity and restart-handoff presence without secrets. */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA = "pipeline.start-preflight.v1";
const PLUGIN_ID = "pipeline-core@agent-pipeline";

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

export function installedPipelineVersion(pluginList = readInstalledPluginList) {
  let payload;
  try {
    payload = JSON.parse(pluginList());
  } catch {
    return null;
  }
  if (!Array.isArray(payload?.installed)) return null;
  const matches = payload.installed.filter((entry) =>
    entry?.pluginId === PLUGIN_ID
    && entry?.name === "pipeline-core"
    && entry?.marketplaceName === "agent-pipeline"
    && entry?.installed === true
    && entry?.enabled === true
    && typeof entry?.version === "string"
    && entry.version.trim() !== "");
  return matches.length === 1 ? matches[0].version : null;
}

export function observePipelineStartPreflight({
  env = process.env,
  pluginList = readInstalledPluginList,
  read = readFileSync,
  scriptUrl = import.meta.url,
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
  const installedVersion = installedPipelineVersion(pluginList);
  const ticket = Object.prototype.hasOwnProperty.call(env, "PIPELINE_CODEX_ONBOARDING_TICKET_ID")
    && String(env.PIPELINE_CODEX_ONBOARDING_TICKET_ID) !== "";
  const token = Object.prototype.hasOwnProperty.call(env, "PIPELINE_CODEX_ONBOARDING_TOKEN")
    && String(env.PIPELINE_CODEX_ONBOARDING_TOKEN) !== "";
  return {
    schema: SCHEMA,
    status: !version
      ? "plugin-identity-unavailable"
      : installedVersion !== null && installedVersion !== version
        ? "plugin-refresh-required"
        : "ready",
    version,
    installedVersion,
    pluginRoot,
    handoff: ticket && token ? "ready" : ticket || token ? "malformed" : "none",
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
