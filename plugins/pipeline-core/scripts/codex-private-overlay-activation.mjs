#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { spawnSync as nodeSpawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { main as activationMain } from "./private-overlay-activation.mjs";

const SCHEMA = "pipeline.codex-private-overlay-source-resolution.v1";
const REJECTION = Object.freeze({
  schema: SCHEMA,
  status: "rejected",
  reasonCodes: ["SNT-A-CODEX-SOURCE-UNAVAILABLE"],
});
const USAGE = "Usage: codex-private-overlay-activation.mjs <inspect|plan|status|load-context> --project-root <absolute-path>\n       codex-private-overlay-activation.mjs activate --project-root <absolute-path> --expected-plan-sha256 <64hex>\n";
const SHA256 = /^[0-9a-f]{64}$/u;
const PLUGIN_VERSION = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$/u;
const MAX_JSON_BYTES = 64 * 1024;
const TIMEOUT_MS = 5000;
const MAX_BUFFER = 128 * 1024;
const DEPENDENCY_KEYS = Object.freeze(["spawnSync", "activationMain", "write", "writeError"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactObject(value, keys) {
  return isObject(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function canonicalLine(value) {
  return `${JSON.stringify(value)}\n`;
}

function invocation(argv) {
  if (!Array.isArray(argv) || !["inspect", "plan", "status", "load-context", "activate"].includes(argv[0])) return undefined;
  const parsed = { command: argv[0] };
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--project-root" && parsed.projectRoot === undefined && typeof value === "string" && !value.startsWith("--")) {
      parsed.projectRoot = value;
      index += 1;
    } else if (flag === "--expected-plan-sha256" && parsed.expectedPlanSha256 === undefined && typeof value === "string" && !value.startsWith("--")) {
      parsed.expectedPlanSha256 = value;
      index += 1;
    } else return undefined;
  }
  if (typeof parsed.projectRoot !== "string" || !isAbsolute(parsed.projectRoot)) return undefined;
  if (parsed.command === "activate") {
    if (typeof parsed.expectedPlanSha256 !== "string" || !SHA256.test(parsed.expectedPlanSha256)) return undefined;
  } else if (parsed.expectedPlanSha256 !== undefined) return undefined;
  return parsed;
}

function dependencies(overrides) {
  if (!isObject(overrides) || Object.keys(overrides).some((key) => !DEPENDENCY_KEYS.includes(key))) return null;
  const selected = {
    spawnSync: overrides.spawnSync ?? nodeSpawnSync,
    activationMain: overrides.activationMain ?? activationMain,
    write: overrides.write ?? process.stdout.write.bind(process.stdout),
    writeError: overrides.writeError ?? process.stderr.write.bind(process.stderr),
  };
  return Object.values(selected).every((value) => typeof value === "function") ? selected : null;
}

function safeWrite(overrides, channel, value) {
  const selected = typeof overrides?.[channel] === "function"
    ? overrides[channel]
    : channel === "writeError"
      ? process.stderr.write.bind(process.stderr)
      : process.stdout.write.bind(process.stdout);
  try { selected(value); } catch { /* The fixed result remains rejected even when output is unavailable. */ }
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

function sourcePluginRoot(document) {
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
  if (!exactObject(entry.marketplaceSource, ["sourceType", "source"])
    || entry.marketplaceSource.sourceType !== "git"
    || !safeGitMarketplaceSource(entry.marketplaceSource.source)) return null;
  return entry.source.path;
}

function resolveSourceRoot(spawn) {
  let result;
  try {
    result = spawn("codex", ["plugin", "list", "--marketplace", "agent-pipeline", "--json"], {
      encoding: "utf8",
      env: {
        GIT_TERMINAL_PROMPT: "0",
        LANG: "C",
        LC_ALL: "C",
        NO_COLOR: "1",
        PATH: process.env.PATH ?? "",
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
  let document;
  try { document = JSON.parse(result.stdout); } catch { return null; }
  return sourcePluginRoot(document);
}

function activationArgv(parsed, sourceRoot) {
  const argv = [
    parsed.command,
    "--project-root", parsed.projectRoot,
    "--source-plugin-root", sourceRoot,
  ];
  if (parsed.command === "activate") argv.push("--expected-plan-sha256", parsed.expectedPlanSha256);
  return argv;
}

/** Resolve the selected Codex marketplace source, then delegate without exposing it. */
export function main(argv, dependencyOverrides = {}) {
  const parsed = invocation(argv);
  if (parsed === undefined) {
    safeWrite(dependencyOverrides, "writeError", USAGE);
    return 64;
  }
  const deps = dependencies(dependencyOverrides);
  if (deps === null) {
    safeWrite(dependencyOverrides, "write", canonicalLine(REJECTION));
    return 2;
  }
  const sourceRoot = resolveSourceRoot(deps.spawnSync);
  if (sourceRoot === null) {
    safeWrite(dependencyOverrides, "write", canonicalLine(REJECTION));
    return 2;
  }
  try {
    const code = deps.activationMain(activationArgv(parsed, sourceRoot));
    if (Number.isInteger(code)) return code;
    safeWrite(dependencyOverrides, "write", canonicalLine(REJECTION));
    return 2;
  } catch {
    safeWrite(dependencyOverrides, "write", canonicalLine(REJECTION));
    return 2;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
