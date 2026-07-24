// SPDX-License-Identifier: SUL-1.0

/** Observe the selected Pipeline plugin directly from the Codex host. */
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { dirname, isAbsolute, resolve } from "node:path";
import { resolveTrustedSystemExecutable } from "./trusted-tool-resolution.mjs";

const PLUGIN_VERSION = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$/u;
const MAX_JSON_BYTES = 64 * 1024;
const TIMEOUT_MS = 5000;
const MAX_BUFFER = 128 * 1024;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactObject(value, keys) {
  return isObject(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function localAbsolute(path) {
  return typeof path === "string"
    && path.length > 0
    && !path.includes("\0")
    && isAbsolute(path)
    && resolve(path) === path;
}

function safeGitMarketplaceSource(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.username === ""
      && url.password === ""
      && url.search === ""
      && url.hash === ""
      && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function safeMarketplaceSource(value, pluginRoot) {
  if (!exactObject(value, ["sourceType", "source"])) return false;
  if (value.sourceType === "git") return safeGitMarketplaceSource(value.source);
  // A local marketplace is the sanctioned SHA-phase development topology. It
  // is not a general local-path allowance: it must name precisely the
  // repository root containing the selected plugin source.
  return value.sourceType === "local"
    && localAbsolute(value.source)
    && value.source === dirname(dirname(pluginRoot));
}

function selectedPlugin(document) {
  if (!exactObject(document, ["installed", "available"])
    || !Array.isArray(document.installed)
    || !Array.isArray(document.available)
    || document.installed.length !== 1) return null;
  const entry = document.installed[0];
  if (!exactObject(entry, [
    "pluginId", "name", "marketplaceName", "version", "installed", "enabled",
    "source", "marketplaceSource", "installPolicy", "authPolicy",
  ])) return null;
  if (entry.pluginId !== "pipeline-core@agent-pipeline"
    || entry.name !== "pipeline-core"
    || entry.marketplaceName !== "agent-pipeline"
    || !PLUGIN_VERSION.test(entry.version)
    || entry.installed !== true
    || entry.enabled !== true
    || typeof entry.installPolicy !== "string"
    || typeof entry.authPolicy !== "string") return null;
  if (!exactObject(entry.source, ["source", "path"])
    || entry.source.source !== "local"
    || !localAbsolute(entry.source.path)) return null;
  if (!safeMarketplaceSource(entry.marketplaceSource, entry.source.path)) return null;
  return Object.freeze({ path: entry.source.path, version: entry.version });
}

/**
 * The version is intentionally not an input. It is observed only by executing
 * the fixed Codex host command with a closed environment and schema.
 */
export function observeSelectedCodexPipelinePlugin({ spawnSync = nodeSpawnSync, resolveExecutable = resolveTrustedSystemExecutable } = {}) {
  if (typeof spawnSync !== "function" || typeof resolveExecutable !== "function") return null;
  let executable;
  try { executable = resolveExecutable("codex"); } catch { return null; }
  if (!isObject(executable) || executable.ok !== true || !localAbsolute(executable.path)) return null;
  let result;
  try {
    result = spawnSync(executable.path, ["plugin", "list", "--marketplace", "agent-pipeline", "--json"], {
      encoding: "utf8",
      env: {
        GIT_TERMINAL_PROMPT: "0",
        LANG: "C",
        LC_ALL: "C",
        NO_COLOR: "1",
      },
      maxBuffer: MAX_BUFFER,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: TIMEOUT_MS,
    });
  } catch {
    return null;
  }
  if (!isObject(result)
    || result.status !== 0
    || result.signal !== null && result.signal !== undefined
    || result.error !== undefined
    || typeof result.stdout !== "string"
    || Buffer.byteLength(result.stdout, "utf8") === 0
    || Buffer.byteLength(result.stdout, "utf8") > MAX_JSON_BYTES) return null;
  try { return selectedPlugin(JSON.parse(result.stdout)); }
  catch { return null; }
}
