#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Observe loaded Pipeline update availability independently of repository
 * branch/upstream freshness. Remote objects land only in a disposable bare
 * repository; this helper never mutates project or loaded-plugin refs, config,
 * index, or worktree.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { resolveMarketplaceUrl } from "../hooks/staleness-check.mjs";
import {
  comparePipelineVersions,
  evaluateRulesetUpdatePolicy,
  readRulesetUpdatePolicy,
} from "./ruleset-update-policy.mjs";

export const PIPELINE_UPDATE_AVAILABILITY_SCHEMA =
  "pipeline.pipeline-update-availability.v1";
/** @deprecated Kept as an import alias while readers migrate to the new schema. */
export const RULESET_FRESHNESS_SCHEMA = PIPELINE_UPDATE_AVAILABILITY_SCHEMA;

const OID = /^[0-9a-f]{40}$/iu;
const DEFAULT_TIMEOUT_MS = 30_000;
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_RELATIVE_PATH = "plugins/pipeline-core/.codex-plugin/plugin.json";

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

function manifestIdentity(text) {
  try {
    const value = JSON.parse(text);
    return {
      version: typeof value?.version === "string" && value.version.trim() !== ""
        ? value.version
        : null,
      commit: OID.test(value?.gitCommitSha ?? "")
        ? value.gitCommitSha.toLowerCase()
        : null,
    };
  } catch {
    return { version: null, commit: null };
  }
}

function loadedIdentity(options = {}) {
  const pluginRoot = resolve(options.pluginRoot ?? PLUGIN_ROOT);
  let manifest = { version: null, commit: null };
  try {
    manifest = manifestIdentity(readFileSync(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
  } catch {
    manifest = { version: null, commit: null };
  }
  const version = options.loadedVersion ?? manifest.version;
  let commit = options.loadedCommit ?? options.loadedSha ?? manifest.commit;
  let commitSource = options.loadedCommit || options.loadedSha
    ? "explicit"
    : manifest.commit
      ? "loaded-plugin-manifest"
      : null;
  if (!commit) {
    const observed = git(pluginRoot, ["rev-parse", "--verify", "HEAD"], options);
    const candidate = String(observed.stdout ?? "").trim().toLowerCase();
    if (observed.status === 0 && OID.test(candidate)) {
      commit = candidate;
      commitSource = "loaded-plugin-git";
    }
  }
  if (!OID.test(commit ?? "")) {
    commit = null;
    commitSource = null;
  }
  return { version, commit, commitSource, pluginRoot };
}

function result(status, fields = {}) {
  const updateAvailable = status === "update-available";
  const policyDisposition = fields.policyDisposition
    ?? evaluateRulesetUpdatePolicy(null, fields.loaded);
  return {
    schema: PIPELINE_UPDATE_AVAILABILITY_SCHEMA,
    status,
    loaded: {
      version: fields.loaded?.version ?? null,
      commit: fields.loaded?.commit ?? null,
      commitSource: fields.loaded?.commitSource ?? null,
    },
    marketplace: {
      version: fields.marketplace?.version ?? null,
      commit: fields.marketplace?.commit ?? null,
    },
    updateAvailable,
    updateRecommended: updateAvailable || policyDisposition.blocking,
    policyDisposition,
    blocking: policyDisposition.blocking,
    reason: fields.reason ?? null,
  };
}

function statusFromVersions(loadedVersion, marketplaceVersion) {
  const compared = comparePipelineVersions(loadedVersion, marketplaceVersion);
  if (compared === null) return null;
  if (compared < 0) return "update-available";
  if (compared > 0) return "local-ahead";
  return "current";
}

function relation(counts) {
  const match = String(counts.stdout ?? "").trim().match(/^(\d+)\s+(\d+)$/u);
  if (counts.status !== 0 || !match) return null;
  const ahead = Number(match[1]);
  const behind = Number(match[2]);
  if (ahead === 0 && behind === 0) return "current";
  if (ahead === 0) return "update-available";
  if (behind === 0) return "local-ahead";
  return null;
}

function pluginObjectPath(pluginRoot, options) {
  const observed = git(pluginRoot, ["rev-parse", "--git-path", "objects"], options);
  const raw = String(observed.stdout ?? "").trim();
  if (observed.status !== 0 || raw === "") return null;
  return isAbsolute(raw) ? raw : resolve(pluginRoot, raw);
}

function readMarketplaceVersion(temporary, env, options) {
  const path = options.marketplaceManifestPath ?? MANIFEST_RELATIVE_PATH;
  const observed = run("git", [
    "--git-dir",
    temporary,
    "show",
    `refs/pipeline/marketplace:${path}`,
  ], { ...options, env });
  return observed.status === 0 ? manifestIdentity(observed.stdout).version : null;
}

function compareLoadedToMarketplace(temporary, env, loaded, marketplace, options) {
  if (loaded.commit) {
    const localRef = run("git", [
      "--git-dir",
      temporary,
      "update-ref",
      "refs/pipeline/loaded",
      loaded.commit,
    ], { ...options, env });
    if (localRef.status === 0) {
      const status = relation(run("git", [
        "--git-dir",
        temporary,
        "rev-list",
        "--left-right",
        "--count",
        "refs/pipeline/loaded...refs/pipeline/marketplace",
      ], { ...options, env }));
      if (status) return { status, reason: null };
      return { status: "unknown", reason: "loaded-marketplace-diverged" };
    }
  }
  const versionStatus = statusFromVersions(loaded.version, marketplace.version);
  return versionStatus
    ? { status: versionStatus, reason: loaded.commit ? "loaded-commit-unavailable" : "version-comparison" }
    : { status: "unknown", reason: "loaded-comparison-unavailable" };
}

export function inspectPipelineUpdateAvailability(repoPath, options = {}) {
  const repo = resolve(repoPath);
  const loaded = loadedIdentity(options);
  const settingsPath = options.settingsPath ?? join(repo, ".claude", "settings.json");
  const remoteUrl = options.remoteUrl ?? resolveMarketplaceUrl({ settingsPath });
  const policy = options.policy !== undefined
    ? options.policy
    : readRulesetUpdatePolicy(options.policyPath ?? join(loaded.pluginRoot, "config", "ruleset-update-policy.v1.json"));
  if (!remoteUrl) {
    const policyDisposition = evaluateRulesetUpdatePolicy(policy, loaded);
    return result("unknown", { loaded, policyDisposition, reason: "marketplace-unavailable" });
  }

  const remote = run("git", ["ls-remote", remoteUrl, "HEAD"], {
    ...options,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  const remoteCommit = String(remote.stdout ?? "").trim().split(/\s+/u)[0]?.toLowerCase();
  if (remote.status !== 0 || !OID.test(remoteCommit)) {
    const policyDisposition = evaluateRulesetUpdatePolicy(policy, loaded);
    return result("unknown", {
      loaded,
      policyDisposition,
      reason: remote.error?.code === "ETIMEDOUT" || remote.signal ? "timeout" : "remote-unavailable",
    });
  }

  const temporary = mkdtempSync(join(tmpdir(), "pipeline-update-availability-"));
  try {
    const init = run("git", ["init", "--bare", "--quiet", temporary], options);
    if (init.status !== 0) {
      return result("unknown", {
        loaded,
        marketplace: { commit: remoteCommit },
        policyDisposition: evaluateRulesetUpdatePolicy(policy, loaded),
        reason: "comparison-init-failed",
      });
    }
    const alternate = pluginObjectPath(loaded.pluginRoot, options);
    const env = {
      ...process.env,
      ...(alternate ? { GIT_ALTERNATE_OBJECT_DIRECTORIES: alternate } : {}),
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
    };
    const fetch = run("git", [
      "--git-dir",
      temporary,
      "-c",
      "maintenance.auto=false",
      "fetch",
      "--quiet",
      "--no-tags",
      "--no-recurse-submodules",
      "--no-write-fetch-head",
      remoteUrl,
      `${remoteCommit}:refs/pipeline/marketplace`,
    ], {
      ...options,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      env,
    });
    if (fetch.status !== 0) {
      return result("unknown", {
        loaded,
        marketplace: { commit: remoteCommit },
        policyDisposition: evaluateRulesetUpdatePolicy(policy, loaded),
        reason: fetch.error?.code === "ETIMEDOUT" || fetch.signal
          ? "timeout"
          : "remote-object-unavailable",
      });
    }
    const marketplace = {
      version: options.marketplaceVersion ?? readMarketplaceVersion(temporary, env, options),
      commit: remoteCommit,
    };
    const compared = compareLoadedToMarketplace(temporary, env, loaded, marketplace, options);
    const policyDisposition = evaluateRulesetUpdatePolicy(policy, loaded);
    return result(compared.status, {
      loaded,
      marketplace,
      policyDisposition,
      reason: compared.reason,
    });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

/** @deprecated Use inspectPipelineUpdateAvailability. */
export const inspectRulesetFreshness = inspectPipelineUpdateAvailability;

/**
 * Convert the old ruleset-freshness shape into update metadata. Its historical
 * writePermitted value is deliberately ignored.
 */
export function migrateLegacyRulesetFreshness(value) {
  if (value?.schema === PIPELINE_UPDATE_AVAILABILITY_SCHEMA) return value;
  const status = value?.status === "equal"
    ? "current"
    : value?.status === "ahead"
      ? "local-ahead"
      : value?.status === "behind" || value?.status === "stale"
        ? "update-available"
        : "unknown";
  return result(status, {
    loaded: { version: null, commit: OID.test(value?.loadedSha ?? "") ? value.loadedSha : null, commitSource: "legacy" },
    marketplace: { version: null, commit: OID.test(value?.remoteSha ?? "") ? value.remoteSha : null },
    reason: "legacy-ruleset-freshness-migrated",
  });
}

/**
 * Ordinary write admission comes only from repository freshness. The sole
 * update-related exception is an exact blocking plugin-shipped policy match.
 */
export function repositoryWritePermitted(repositoryFreshness, updateAvailability = null) {
  const repositoryStatus = repositoryFreshness?.result?.status ?? repositoryFreshness?.status;
  const repositoryAllows = ["equal", "ahead", "local-only", "host-managed"].includes(repositoryStatus);
  const update = updateAvailability
    ? migrateLegacyRulesetFreshness(updateAvailability)
    : null;
  return repositoryAllows && update?.policyDisposition?.blocking !== true;
}

function parseArgs(argv) {
  const parsed = { repo: process.env.CLAUDE_PROJECT_DIR || process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--repo" && argv[index + 1]) parsed.repo = argv[++index];
    else if (["--loaded-sha", "--loaded-commit"].includes(argv[index]) && argv[index + 1]) parsed.loadedCommit = argv[++index];
    else if (argv[index] === "--loaded-version" && argv[index + 1]) parsed.loadedVersion = argv[++index];
    else return null;
  }
  return parsed;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    process.stderr.write("ruleset-freshness: usage: ruleset-freshness.mjs [--repo <path>] [--loaded-version <version>] [--loaded-commit <sha>]\n");
    process.exit(64);
  }
  const inspected = inspectPipelineUpdateAvailability(parsed.repo, parsed);
  process.stdout.write(`${JSON.stringify(inspected)}\n`);
  process.exit(inspected.blocking ? 2 : 0);
}
