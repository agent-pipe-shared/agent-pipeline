#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * PHX-0B ruleset freshness.
 *
 * The common path consumes a closed ruleset-source observation.  It never
 * reads a consumer's settings or HEAD: a pre-HEAD consumer is therefore a
 * normal caller.  The sole default network destination is the reviewed Public
 * Core marketplace.  Claude's historical settings-based lookup remains an
 * explicit compatibility adapter below, rather than contaminating the common
 * Codex/AGY contract.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { resolveMarketplaceUrl } from "../hooks/staleness-check.mjs";
import { observeCodexRulesetSource } from "../lib/codex-host-plugin-list.mjs";
import { compareLoadedRulesetIdentity, normalizeRulesetSource } from "../lib/ruleset-source.mjs";

export const RULESET_FRESHNESS_SCHEMA = "pipeline.ruleset-freshness.v1";
export const PUBLIC_MARKETPLACE_URL = "https://github.com/agent-pipe-shared/agent-pipeline.git";
export const FRESHNESS_NETWORK_PREFLIGHT_SCHEMA = "pipeline.ruleset-freshness-network-preflight.v1";
export const FRESHNESS_HOST_TRANSPORT_SCHEMA = "pipeline.ruleset-freshness-host-transport.v1";
export const FRESHNESS_HOST_ACTION_SCHEMA = "pipeline.ruleset-freshness-host-action.v1";
export const FRESHNESS_HOST_RESULT_SCHEMA = "pipeline.ruleset-freshness-host-result.v1";
export const FRESHNESS_HOST_RECEIPT_SCHEMA = "pipeline.ruleset-freshness-host-execution-receipt.v1";
export const FRESHNESS_HOST_CONTROL_SCHEMA = "pipeline.ruleset-freshness-host-control.v1";
export const WSL_FRESHNESS_BOUNDARY_ID = "pipeline-start-host-authorized-wsl";
const SHA = /^[0-9a-f]{40,64}$/iu;
const SHA256 = /^[0-9a-f]{64}$/iu;
const BOUNDARY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const DEFAULT_TIMEOUT_MS = 30_000;
const CODEX_CLAUDE_FALLBACK_STATUS = "codex-plugin-list-unavailable";

function run(command, args, options = {}) {
  return (options.spawn ?? spawnSync)(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    timeout: options.timeout ?? 5_000,
    shell: false,
    env: options.env ?? process.env,
  });
}

function git(repo, args, options = {}) {
  return run("git", ["-C", repo, ...args], { ...options, cwd: undefined });
}

function safeIdentity(identity) {
  return identity?.status === "available" ? identity.value : null;
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function result(status, fields = {}) {
  return {
    schema: RULESET_FRESHNESS_SCHEMA,
    status,
    source: fields.source ?? null,
    loadedSha: fields.loadedSha ?? null,
    remoteSha: fields.remoteSha ?? null,
    ahead: fields.ahead ?? null,
    behind: fields.behind ?? null,
    writePermitted: status === "equal" || status === "ahead",
    reason: fields.reason ?? null,
  };
}

function relation(counts, fields) {
  const match = String(counts.stdout ?? "").trim().match(/^(\d+)\s+(\d+)$/u);
  if (counts.status !== 0 || !match) return result("comparison-unavailable", { ...fields, reason: "comparison-failed" });
  const ahead = Number(match[1]);
  const behind = Number(match[2]);
  const status = ahead === 0 ? (behind === 0 ? "equal" : "behind") : behind === 0 ? "ahead" : "diverged";
  return result(status, { ...fields, ahead, behind });
}

/**
 * A known network-restricted sandbox must not consume a speculative direct
 * fetch. The preflight binds the one selected host boundary by a non-secret
 * identifier; the host receives only this fixed public-HEAD operation.
 */
export function createFreshnessHostAction(boundaryId) {
  if (typeof boundaryId !== "string" || !BOUNDARY_ID.test(boundaryId)) return null;
  const unsigned = {
    schema: FRESHNESS_HOST_ACTION_SCHEMA,
    boundaryId,
    operation: "read-public-marketplace-head",
    access: "read-only",
    network: "enabled",
    command: Object.freeze({ executable: "git", argv: Object.freeze(["ls-remote", PUBLIC_MARKETPLACE_URL, "HEAD"]) }),
  };
  return Object.freeze({ ...unsigned, requestSha256: sha256(JSON.stringify(unsigned)) });
}

/**
 * This is a request plan, never an executor. A host integration may pass the
 * returned preflight together with its exact host transport to
 * inspectCliRulesetFreshness; without that adapter the CLI emits this action
 * and fails closed rather than attempting network access in the sandbox.
 */
export function freshnessHostPlanForExecutionBoundary(executionBoundary) {
  if (executionBoundary !== "host-authorized-wsl") return null;
  const action = createFreshnessHostAction(WSL_FRESHNESS_BOUNDARY_ID);
  if (action === null) return null;
  return Object.freeze({
    networkPreflight: Object.freeze({
      schema: FRESHNESS_NETWORK_PREFLIGHT_SCHEMA,
      network: "restricted",
      boundaryId: WSL_FRESHNESS_BOUNDARY_ID,
    }),
    action,
  });
}

export function freshnessHostPlanForEnvironment(env = process.env) {
  const wsl = [env?.WSL_DISTRO_NAME, env?.WSL_INTEROP]
    .some((value) => typeof value === "string" && value.trim() !== "");
  return freshnessHostPlanForExecutionBoundary(wsl ? "host-authorized-wsl" : "default");
}

/** Add only an actionable public host request to a CLI result that needs it. */
export function withFreshnessHostRequest(inspected, plan) {
  if (!plan || inspected?.status !== "remote-unavailable" || inspected.reason !== "host-transport-required") return inspected;
  return { ...inspected, nextAction: plan.action };
}

function selectHostTransport(networkPreflight, hostTransport) {
  if (networkPreflight === undefined && hostTransport === undefined) return null;
  if (!exactKeys(networkPreflight, ["schema", "network", "boundaryId"])
    || networkPreflight.schema !== FRESHNESS_NETWORK_PREFLIGHT_SCHEMA
    || !["enabled", "restricted"].includes(networkPreflight.network)
    || typeof networkPreflight.boundaryId !== "string" || !BOUNDARY_ID.test(networkPreflight.boundaryId)) return false;
  if (networkPreflight.network === "enabled") return null;
  if (!exactKeys(hostTransport, ["schema", "boundaryId", "access", "network", "execute"])
    || hostTransport.schema !== FRESHNESS_HOST_TRANSPORT_SCHEMA
    || hostTransport.boundaryId !== networkPreflight.boundaryId
    || hostTransport.access !== "read-only" || hostTransport.network !== "enabled"
    || typeof hostTransport.execute !== "function") return false;
  return hostTransport;
}

function observeThroughSelectedHost(action, hostTransport) {
  let response;
  try { response = hostTransport.execute(action); } catch { return { status: "remote-unavailable", identity: null, reason: "host-transport-unavailable" }; }
  if (!exactKeys(response, ["schema", "requestSha256", "status", "stdout", "receipt"])
    || response.schema !== FRESHNESS_HOST_RESULT_SCHEMA
    || response.requestSha256 !== action.requestSha256
    || !["completed", "unavailable"].includes(response.status)
    || typeof response.stdout !== "string") return { status: "remote-unavailable", identity: null, reason: "host-transport-unavailable" };
  const value = response.stdout.trim().split(/\s+/u)[0]?.toLowerCase();
  const receipt = response.receipt;
  if (response.status !== "completed"
    || !exactKeys(receipt, ["schema", "boundaryId", "action", "requestSha256", "hostControl", "childStarted", "executable", "argv", "exitCode", "publicHeadOid"])
    || receipt.schema !== FRESHNESS_HOST_RECEIPT_SCHEMA
    || receipt.boundaryId !== hostTransport.boundaryId
    || JSON.stringify(receipt.action) !== JSON.stringify(action)
    || receipt.requestSha256 !== action.requestSha256
    || !exactKeys(receipt.hostControl, ["schema", "code", "appServerVersion", "daemonIdentitySha256"])
    || receipt.hostControl.schema !== FRESHNESS_HOST_CONTROL_SCHEMA
    || receipt.hostControl.code !== "CAS-READY"
    || typeof receipt.hostControl.appServerVersion !== "string"
    || receipt.hostControl.appServerVersion.length === 0
    || typeof receipt.hostControl.daemonIdentitySha256 !== "string"
    || !SHA256.test(receipt.hostControl.daemonIdentitySha256)
    || receipt.childStarted !== true
    || receipt.executable !== "/usr/bin/git"
    || JSON.stringify(receipt.argv) !== JSON.stringify(["ls-remote", PUBLIC_MARKETPLACE_URL, "HEAD"])
    || receipt.exitCode !== 0
    || typeof receipt.publicHeadOid !== "string"
    || receipt.publicHeadOid !== value
    || !SHA.test(value)
    || response.stdout !== `${value}\tHEAD\n`) return { status: "remote-unavailable", identity: null, reason: "host-transport-unavailable" };
  return {
    status: "ready",
    identity: { status: "available", algorithm: value.length === 40 ? "git-sha1" : "git-sha256", value },
    reason: null,
  };
}

/** A coordinate-free, host-bound observation envelope used by the common path. */
export function observePublicRemoteIdentity({ remoteUrl = PUBLIC_MARKETPLACE_URL, spawn = spawnSync, timeoutMs = DEFAULT_TIMEOUT_MS, networkPreflight = undefined, hostTransport = undefined } = {}) {
  const selectedHost = selectHostTransport(networkPreflight, hostTransport);
  if (selectedHost === false) return { status: "remote-unavailable", identity: null, reason: "host-transport-required" };
  if (selectedHost !== null) {
    // The selected action is fixed to the reviewed public marketplace. It has
    // no consumer root, plugin root, cache path, HOME value, or private URL.
    const action = createFreshnessHostAction(selectedHost.boundaryId);
    return action === null
      ? { status: "remote-unavailable", identity: null, reason: "host-transport-required" }
      : observeThroughSelectedHost(action, selectedHost);
  }
  let remote;
  try {
    remote = spawn("git", ["ls-remote", remoteUrl, "HEAD"], {
      encoding: "utf8",
      timeout: timeoutMs,
      shell: false,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
  } catch {
    return { status: "remote-unavailable", identity: null, reason: "remote-unavailable" };
  }
  const value = String(remote?.stdout ?? "").trim().split(/\s+/u)[0]?.toLowerCase();
  if (remote?.status !== 0 || !SHA.test(value)) {
    return {
      status: "remote-unavailable",
      identity: null,
      reason: remote?.error?.code === "ETIMEDOUT" || remote?.signal ? "timeout" : "remote-unavailable",
    };
  }
  return {
    status: "ready",
    identity: { status: "available", algorithm: value.length === 40 ? "git-sha1" : "git-sha256", value },
    reason: null,
  };
}

function validRemoteObservation(value) {
  if (value?.status === "ready" && value.identity?.status === "available") return value;
  return { status: "remote-unavailable", identity: null, reason: value?.reason === "timeout" ? "timeout" : "remote-unavailable" };
}

function classifyClaudeMarketplaceUrl(value) {
  // The compatibility resolver is intentionally stricter than URL parsing:
  // only the reviewed literal coordinate carries the public-source authority.
  if (value === PUBLIC_MARKETPLACE_URL) return "marketplace-public";
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:"
      || url.username !== ""
      || url.password !== ""
      || url.search !== ""
      || url.hash !== ""
      || url.hostname.length === 0) return null;
  } catch {
    return null;
  }
  return "marketplace-private";
}

function compareSelfApplication(pluginRoot, loadedSha, remoteSha, options = {}) {
  if (typeof pluginRoot !== "string" || pluginRoot.length === 0) {
    return result("loaded-remote-mismatch", { source: "self-application", loadedSha, remoteSha, reason: "loaded-plugin-root-unavailable" });
  }
  const fields = { source: "self-application", loadedSha, remoteSha };
  const localObject = git(pluginRoot, ["cat-file", "-e", `${remoteSha}^{commit}`], options);
  if (localObject.status === 0) {
    return relation(git(pluginRoot, ["rev-list", "--left-right", "--count", `${loadedSha}...${remoteSha}`], options), fields);
  }

  const objectResult = git(pluginRoot, ["rev-parse", "--git-path", "objects"], options);
  const objectRaw = String(objectResult.stdout ?? "").trim();
  if (objectResult.status !== 0 || !objectRaw) return result("comparison-unavailable", { ...fields, reason: "object-store-unavailable" });
  const objectPath = isAbsolute(objectRaw) ? objectRaw : resolve(pluginRoot, objectRaw);
  const temporary = mkdtempSync(join(tmpdir(), "pipeline-ruleset-freshness-"));
  try {
    const init = run("git", ["init", "--bare", "--quiet", temporary], options);
    if (init.status !== 0) return result("comparison-unavailable", { ...fields, reason: "comparison-init-failed" });
    const env = {
      ...process.env,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: objectPath,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
    };
    const localRef = run("git", ["--git-dir", temporary, "update-ref", "refs/ruleset/local", loadedSha], { ...options, env });
    if (localRef.status !== 0) return result("comparison-unavailable", { ...fields, reason: "local-ref-unavailable" });
    const fetch = run("git", ["--git-dir", temporary, "-c", "maintenance.auto=false", "fetch", "--quiet", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", options.remoteUrl ?? PUBLIC_MARKETPLACE_URL, `${remoteSha}:refs/ruleset/remote`], {
      ...options,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      env,
    });
    if (fetch.status !== 0) return result("comparison-unavailable", { ...fields, reason: fetch.error?.code === "ETIMEDOUT" || fetch.signal ? "timeout" : "remote-object-unavailable" });
    return relation(run("git", ["--git-dir", temporary, "rev-list", "--left-right", "--count", "refs/ruleset/local...refs/ruleset/remote"], { ...options, env }), fields);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

/**
 * Common PHX-0B contract. `repoPath` is retained only for call compatibility;
 * it is deliberately not inspected when sourceObservation is present.
 */
export function inspectRulesetFreshness(repoPath, options = {}) {
  const normalized = normalizeRulesetSource(options.sourceObservation);
  if (normalized.status !== "ready") return result(normalized.status, { source: normalized.observation?.source.class ?? null });

  const source = normalized.observation.source.class;
  const loadedSha = safeIdentity(normalized.observation.loadedIdentity);
  if (source === "local-development" || source === "marketplace-private") {
    return result(source, { source, loadedSha, reason: "public-remote-not-selected" });
  }
  if (source !== "marketplace-public" && source !== "self-application") {
    return result("source-unavailable", { source, loadedSha });
  }

  const remote = validRemoteObservation(options.remoteObservation
    ?? observePublicRemoteIdentity({
      remoteUrl: options.remoteUrl ?? PUBLIC_MARKETPLACE_URL,
      spawn: options.spawn ?? spawnSync,
      timeoutMs: options.timeoutMs,
      networkPreflight: options.networkPreflight,
      hostTransport: options.hostTransport,
    }));
  if (remote.status !== "ready") return result("remote-unavailable", { source, loadedSha, reason: remote.reason });
  const comparison = compareLoadedRulesetIdentity(normalized.observation, remote.identity);
  const remoteSha = safeIdentity(remote.identity);
  if (comparison.status === "equal") return result("equal", { source, loadedSha, remoteSha, ahead: 0, behind: 0 });
  if (comparison.status !== "loaded-remote-mismatch") return result(comparison.status, { source, loadedSha, remoteSha });
  if (source !== "self-application") return result("loaded-remote-mismatch", { source, loadedSha, remoteSha });
  return compareSelfApplication(options.loadedPluginRoot, loadedSha, remoteSha, options);
}

/**
 * Separate Claude compatibility adapter.  It owns the legacy marketplace
 * settings lookup and consumer HEAD probe; neither is part of the common
 * PHX-0B source/freshness service.
 */
export function inspectClaudeRulesetFreshness(repoPath, options = {}) {
  const repo = resolve(repoPath);
  const remoteUrl = options.remoteUrl ?? resolveMarketplaceUrl({ settingsPath: options.settingsPath ?? join(repo, ".claude", "settings.json") });
  const marketplaceSource = classifyClaudeMarketplaceUrl(remoteUrl);
  if (!marketplaceSource) return result("source-unavailable", { reason: "claude-marketplace-unavailable" });
  // A private setting is not a public-freshness transport and therefore must
  // not probe the consumer checkout merely to construct an identity.
  if (marketplaceSource === "marketplace-private") {
    return result("marketplace-private", { source: marketplaceSource, reason: "public-remote-not-selected" });
  }
  const sourceClass = options.selfApplication ? "self-application" : marketplaceSource;
  const loaded = options.loadedSha ? { status: 0, stdout: options.loadedSha } : git(repo, ["rev-parse", "--verify", "HEAD"], options);
  const value = String(loaded.stdout ?? "").trim().toLowerCase();
  if (loaded.status !== 0 || !SHA.test(value)) return result("loaded-identity-unavailable", { reason: "claude-loaded-identity-unavailable" });
  const sourceObservation = {
    schema: "pipeline.ruleset-source.v1",
    runner: "claude",
    selectedPlugin: { id: "pipeline-core@agent-pipeline", version: options.version ?? "compatibility" },
    source: { class: sourceClass },
    loadedIdentity: { status: "available", algorithm: value.length === 40 ? "git-sha1" : "git-sha256", value },
    installedIdentity: { status: "available", algorithm: value.length === 40 ? "git-sha1" : "git-sha256", value },
  };
  return inspectRulesetFreshness(repo, { ...options, sourceObservation, loadedPluginRoot: options.loadedPluginRoot ?? repo, remoteUrl });
}

/**
 * Keep Codex discovery authoritative. Claude compatibility is available only
 * when Codex itself could not be discovered, never for another typed Codex
 * outcome (including pre-HEAD and source-attestation failures).
 */
export function inspectCliRulesetFreshness({
  repoPath,
  loadedSha,
  loadedPluginRoot,
  codexObservation,
  networkPreflight = undefined,
  hostTransport = undefined,
  inspectClaude = inspectClaudeRulesetFreshness,
} = {}) {
  if (codexObservation?.status === "ready") {
    return inspectRulesetFreshness(repoPath, {
      sourceObservation: codexObservation.observation,
      loadedPluginRoot,
      networkPreflight,
      hostTransport,
    });
  }
  if (codexObservation?.status === CODEX_CLAUDE_FALLBACK_STATUS) {
    return inspectClaude(repoPath, { loadedSha });
  }
  return result(codexObservation?.status ?? "invalid-input", {
    source: codexObservation?.observation?.source?.class ?? null,
  });
}

function parseArgs(argv) {
  const parsed = { repo: process.env.CLAUDE_PROJECT_DIR || process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--repo" && argv[index + 1]) parsed.repo = argv[++index];
    else if (argv[index] === "--loaded-sha" && argv[index + 1]) parsed.loadedSha = argv[++index];
    else return null;
  }
  return parsed;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    process.stderr.write("ruleset-freshness: usage: ruleset-freshness.mjs [--repo <path>] [--loaded-sha <sha>]\n");
    process.exit(64);
  }
  const loadedPluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const codex = observeCodexRulesetSource({
    loadedPluginRoot,
    selfApplicationRoot: resolve(loadedPluginRoot, "..", ".."),
  });
  const hostPlan = freshnessHostPlanForEnvironment(process.env);
  const inspected = inspectCliRulesetFreshness({
    repoPath: parsed.repo,
    loadedSha: parsed.loadedSha,
    loadedPluginRoot,
    codexObservation: codex,
    networkPreflight: hostPlan?.networkPreflight,
  });
  const output = withFreshnessHostRequest(inspected, hostPlan);
  process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exit(inspected.status === "equal" || inspected.status === "ahead"
    || inspected.status === "remote-unavailable" && inspected.reason !== "host-transport-required" ? 0 : 2);
}
