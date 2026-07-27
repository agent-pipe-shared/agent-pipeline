// SPDX-License-Identifier: SUL-1.0

/** Observe the selected Pipeline plugin directly from the Codex host. */
import { execFileSync as nodeExecFileSync, spawnSync as nodeSpawnSync } from "node:child_process";
import { dirname, isAbsolute, resolve } from "node:path";
import { normalizeRulesetSource, RULESET_SOURCE_SCHEMA } from "./ruleset-source.mjs";
import { observePublicCoreIdentity } from "./public-core-observation.mjs";
import { resolveTrustedSystemExecutable } from "./trusted-tool-resolution.mjs";

const PLUGIN_VERSION = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$/u;
const GIT_SHA1 = /^[0-9a-f]{40}$/u;
const GIT_SHA256 = /^[0-9a-f]{64}$/u;
const CONTENT_SHA256 = /^[0-9a-f]{64}$/u;
const MAX_JSON_BYTES = 64 * 1024;
const TIMEOUT_MS = 5000;
const MAX_BUFFER = 128 * 1024;
// This is an identity, not a prefix rule.  A credential-free HTTPS Git source
// can still be a private marketplace, so only the one reviewed Public-Core
// marketplace may become marketplace-public.
const PUBLIC_MARKETPLACE_URL = "https://github.com/agent-pipe-shared/agent-pipeline.git";
const PUBLIC_SELF_APPLICATION_ORIGINS = new Set([
  PUBLIC_MARKETPLACE_URL,
  "git@github-public:agent-pipe-shared/agent-pipeline.git",
]);

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

function classifyGitMarketplaceSource(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (!(url.protocol === "https:"
      && url.username === ""
      && url.password === ""
      && url.search === ""
      && url.hash === ""
      && url.hostname.length > 0)) return false;
    return url.href === PUBLIC_MARKETPLACE_URL ? "marketplace-public" : "marketplace-private";
  } catch {
    return false;
  }
}

function safeMarketplaceSource(value, pluginRoot) {
  if (!exactObject(value, ["sourceType", "source"])) return false;
  if (value.sourceType === "git") return classifyGitMarketplaceSource(value.source);
  // A local marketplace is the sanctioned SHA-phase development topology. It
  // is not a general local-path allowance: it must name precisely the
  // repository root containing the selected plugin source.
  return value.sourceType === "local"
    && localAbsolute(value.source)
    && value.source === dirname(dirname(pluginRoot));
}

function selectedPluginRecord(document) {
  if (!exactObject(document, ["installed", "available"])
    || !Array.isArray(document.installed)
    || !Array.isArray(document.available)) return null;
  const local = document.installed.filter((entry) =>
    entry?.pluginId === "pipeline-core@agent-pipeline-local");
  const official = document.installed.filter((entry) =>
    entry?.pluginId === "pipeline-core@agent-pipeline");
  // Local development and the released identity share the Codex App Server.
  // A simultaneous enabled registration is therefore an ambiguous authority,
  // not a preference for the local candidate.
  if (local.length + official.length !== 1) return null;
  const candidates = local.length === 1 ? local : official;
  const entry = candidates[0];
  if (!exactObject(entry, [
    "pluginId", "name", "marketplaceName", "version", "installed", "enabled",
    "source", "marketplaceSource", "installPolicy", "authPolicy",
  ])) return null;
  if (!["pipeline-core@agent-pipeline", "pipeline-core@agent-pipeline-local"].includes(entry.pluginId)
    || entry.name !== "pipeline-core"
    || entry.marketplaceName !== entry.pluginId.slice("pipeline-core@".length)
    || !PLUGIN_VERSION.test(entry.version)
    || entry.installed !== true
    || entry.enabled !== true
    || typeof entry.installPolicy !== "string"
    || typeof entry.authPolicy !== "string") return null;
  if (!exactObject(entry.source, ["source", "path"])
    || entry.source.source !== "local"
    || !localAbsolute(entry.source.path)) return null;
  const sourceClass = safeMarketplaceSource(entry.marketplaceSource, entry.source.path);
  if (!sourceClass) return null;
  if (entry.pluginId === "pipeline-core@agent-pipeline-local"
    && entry.marketplaceSource.sourceType !== "local") return null;
  return Object.freeze({
    path: entry.source.path,
    pluginId: entry.pluginId,
    version: entry.version,
    sourceClass: entry.marketplaceSource.sourceType === "git" ? sourceClass : "local-development",
  });
}

function observedPluginRecord({ spawnSync, resolveExecutable }) {
  let executable;
  try { executable = resolveExecutable("codex"); } catch { return { status: "codex-plugin-list-unavailable", record: null }; }
  if (!isObject(executable) || executable.ok !== true || !localAbsolute(executable.path)) {
    return { status: "codex-plugin-list-unavailable", record: null };
  }
  let result;
  try {
    result = spawnSync(executable.path, ["plugin", "list", "--json"], {
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
    return { status: "codex-plugin-list-unavailable", record: null };
  }
  if (!isObject(result)
    || result.status !== 0
    || result.signal !== null && result.signal !== undefined
    || result.error !== undefined
    || typeof result.stdout !== "string"
    || Buffer.byteLength(result.stdout, "utf8") === 0
    || Buffer.byteLength(result.stdout, "utf8") > MAX_JSON_BYTES) {
    return { status: "codex-plugin-list-unavailable", record: null };
  }
  let document;
  try { document = JSON.parse(result.stdout); } catch { return { status: "codex-plugin-list-unavailable", record: null }; }
  if (!exactObject(document, ["installed", "available"]) || !Array.isArray(document.installed)) {
    return { status: "codex-plugin-list-unavailable", record: null };
  }
  const candidates = document.installed.filter((entry) =>
    entry?.pluginId === "pipeline-core@agent-pipeline-local" || entry?.pluginId === "pipeline-core@agent-pipeline");
  if (candidates.length > 1) return { status: "codex-plugin-list-ambiguous", record: null };
  const record = selectedPluginRecord(document);
  return record === null
    ? { status: "codex-plugin-list-unavailable", record: null }
    : { status: "ready", record };
}

function unavailableIdentity() {
  return { status: "unavailable" };
}

function identityFromGitHead(path, executable, execFileSync) {
  let output;
  try {
    output = execFileSync(executable, ["-C", path, "rev-parse", "HEAD"], {
      encoding: "utf8",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return unavailableIdentity();
  }
  const value = typeof output === "string" ? output.trim() : "";
  if (GIT_SHA1.test(value)) return { status: "available", algorithm: "git-sha1", value };
  if (GIT_SHA256.test(value)) return { status: "available", algorithm: "git-sha256", value };
  return unavailableIdentity();
}

function adapterResult(status, observation = null) {
  return Object.freeze({
    schema: "pipeline.codex-ruleset-source-observation.v1",
    status,
    observation,
  });
}

/**
 * The version is intentionally not an input. It is observed only by executing
 * the fixed Codex host command with a closed environment and schema.
 */
export function observeSelectedCodexPipelinePlugin({ spawnSync = nodeSpawnSync, resolveExecutable = resolveTrustedSystemExecutable } = {}) {
  if (typeof spawnSync !== "function" || typeof resolveExecutable !== "function") return null;
  const result = observedPluginRecord({ spawnSync, resolveExecutable });
  return result.status === "ready"
    ? Object.freeze({ path: result.record.path, version: result.record.version })
    : null;
}

/**
 * Produce the PHX-0B public-safe Codex source observation. The caller supplies
 * the loaded plugin root from the already loaded distribution; native plugin
 * listing supplies the installed root. Neither path is retained in the result.
 */
export function observeCodexRulesetSource({
  loadedPluginRoot,
  selfApplicationRoot = undefined,
  spawnSync = nodeSpawnSync,
  execFileSync = nodeExecFileSync,
  resolveExecutable = resolveTrustedSystemExecutable,
  observeSelfApplication = observePublicCoreIdentity,
} = {}) {
  if (typeof spawnSync !== "function" || typeof execFileSync !== "function" || typeof resolveExecutable !== "function" || typeof observeSelfApplication !== "function"
    || !localAbsolute(loadedPluginRoot)
    || selfApplicationRoot !== undefined && !localAbsolute(selfApplicationRoot)) {
    return adapterResult("invalid-input");
  }
  const listed = observedPluginRecord({ spawnSync, resolveExecutable });
  if (listed.status !== "ready") return adapterResult(listed.status);

  let git;
  try { git = resolveExecutable("git"); } catch { return adapterResult("git-identity-unavailable"); }
  if (!isObject(git) || git.ok !== true || !localAbsolute(git.path)) return adapterResult("git-identity-unavailable");

  const identities = new Map();
  const identityFor = (path) => {
    if (!identities.has(path)) identities.set(path, identityFromGitHead(path, git.path, execFileSync));
    return identities.get(path);
  };
  const loadedIdentity = identityFor(loadedPluginRoot);
  const installedIdentity = identityFor(listed.record.path);
  const isSelfApplication = listed.record.sourceClass === "local-development"
    && loadedPluginRoot === listed.record.path
    && selfApplicationRoot === dirname(dirname(listed.record.path))
  if (isSelfApplication) {
    // Git equality alone is insufficient: a dirty loaded root can have the
    // expected HEAD while serving changed plugin bytes.  The established Public
    // Core observer verifies the exact checkout layout, clean Git state, and a
    // stable full content snapshot without placing either path in our output.
    const self = observeSelfApplication({
      sourcePluginRoot: loadedPluginRoot,
      installedPluginRoot: listed.record.path,
    }, { execFileSync });
    if (!isObject(self) || self.schema !== "pipeline.public-core-observation.v1" || self.status !== "ready") {
      return adapterResult("self-application-unattested");
    }
    // The general observer admits credential-free HTTPS and syntactically safe
    // SSH Git origins.  Self-application is narrower: only these reviewed
    // Public Core identities may gain public authority.  A private clone must
    // never inherit freshness/write authority merely because its local plugin
    // layout, HEAD, and content happen to match.
    if (!PUBLIC_SELF_APPLICATION_ORIGINS.has(self.candidate?.repository)
      || self.candidate?.commit !== loadedIdentity.value
      || !CONTENT_SHA256.test(self.plugin?.contentSha256)) {
      return adapterResult("self-application-unattested");
    }
  }
  const sourceClass = isSelfApplication ? "self-application" : listed.record.sourceClass;
  const source = {
    schema: RULESET_SOURCE_SCHEMA,
    runner: "codex",
    selectedPlugin: { id: listed.record.pluginId, version: listed.record.version },
    source: { class: sourceClass },
    loadedIdentity,
    installedIdentity,
  };
  const normalized = normalizeRulesetSource(source);
  if (loadedIdentity.status === "unavailable" || installedIdentity.status === "unavailable") {
    return adapterResult("pre-head", normalized.observation);
  }
  return adapterResult(normalized.status, normalized.observation);
}
