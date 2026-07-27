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
const SHA = /^[0-9a-f]{40,64}$/iu;
const DEFAULT_TIMEOUT_MS = 30_000;

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

/** A coordinate-free, host-bound observation envelope used by the common path. */
export function observePublicRemoteIdentity({ remoteUrl = PUBLIC_MARKETPLACE_URL, spawn = spawnSync, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
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
    ?? observePublicRemoteIdentity({ remoteUrl: options.remoteUrl ?? PUBLIC_MARKETPLACE_URL, spawn: options.spawn ?? spawnSync, timeoutMs: options.timeoutMs }));
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
  if (!remoteUrl) return result("source-unavailable", { reason: "claude-marketplace-unavailable" });
  const loaded = options.loadedSha ? { status: 0, stdout: options.loadedSha } : git(repo, ["rev-parse", "--verify", "HEAD"], options);
  const value = String(loaded.stdout ?? "").trim().toLowerCase();
  if (loaded.status !== 0 || !SHA.test(value)) return result("loaded-identity-unavailable", { reason: "claude-loaded-identity-unavailable" });
  const sourceObservation = {
    schema: "pipeline.ruleset-source.v1",
    runner: "claude",
    selectedPlugin: { id: "pipeline-core@agent-pipeline", version: options.version ?? "compatibility" },
    source: { class: options.selfApplication ? "self-application" : "marketplace-public" },
    loadedIdentity: { status: "available", algorithm: value.length === 40 ? "git-sha1" : "git-sha256", value },
    installedIdentity: { status: "available", algorithm: value.length === 40 ? "git-sha1" : "git-sha256", value },
  };
  return inspectRulesetFreshness(repo, { ...options, sourceObservation, loadedPluginRoot: options.loadedPluginRoot ?? repo, remoteUrl });
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
  // Native Codex readback is the primary path.  Claude's old source adapter is
  // only selected when that host readback is unavailable.
  const inspected = codex.status === "ready"
    ? inspectRulesetFreshness(parsed.repo, { sourceObservation: codex.observation, loadedPluginRoot })
    : inspectClaudeRulesetFreshness(parsed.repo, { loadedSha: parsed.loadedSha });
  process.stdout.write(`${JSON.stringify(inspected)}\n`);
  process.exit(inspected.status === "equal" || inspected.status === "ahead" || inspected.status === "remote-unavailable" ? 0 : 2);
}
