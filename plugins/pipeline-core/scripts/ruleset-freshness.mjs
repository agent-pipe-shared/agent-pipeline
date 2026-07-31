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
import {
  readProjectPipelineUpdateChannel,
  resolvePipelineUpdateChannel,
} from "./pipeline-update-channel.mjs";

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
    pipelineUpdateAvailability: status,
    channel: fields.channel?.channel ?? null,
    channelSource: fields.channel?.source ?? null,
    ref: fields.selected?.ref ?? null,
    version: fields.selected?.version ?? null,
    commit: fields.selected?.commit ?? null,
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

function validTag(ref) {
  const numeric = "(?:0|[1-9]\\d*)";
  const match = String(ref).match(new RegExp(`^refs/tags/v(${numeric}\\.${numeric}\\.${numeric})(?:-beta\\.(${numeric}))?$`, "u"));
  if (!match) return null;
  return {
    core: match[1],
    beta: match[2] === undefined ? null : Number(match[2]),
    version: `${match[1]}${match[2] === undefined ? "" : `-beta.${match[2]}`}`,
  };
}

function selectedTagFromRemote(output, channel) {
  const tags = new Map();
  let ambiguous = false;
  for (const line of String(output ?? "").trim().split("\n")) {
    const match = line.match(/^([0-9a-f]{40})\s+(refs\/tags\/[^\s^]+)(\^\{\})?$/iu);
    if (!match) continue;
    const [, commit, ref, peeled] = match;
    const parsed = validTag(ref);
    if (!parsed) continue;
    const current = tags.get(ref) ?? { ref, ...parsed, commit: null, peeled: null };
    const field = peeled ? "peeled" : "commit";
    const oid = commit.toLowerCase();
    if (current[field] !== null && current[field] !== oid) ambiguous = true;
    current[field] = oid;
    tags.set(ref, current);
  }
  if (ambiguous) return { selected: null, reason: "channel-unavailable" };
  const candidates = [...tags.values()]
    .map((tag) => ({ ref: tag.ref, version: tag.version, commit: tag.peeled ?? tag.commit }))
    .filter((tag) => OID.test(tag.commit ?? ""));
  const descending = (left, right) => {
    const compared = comparePipelineVersions(left.version, right.version);
    return compared === null ? 0 : -compared;
  };
  if (channel === "stable") {
    const finals = candidates.filter((tag) => validTag(tag.ref)?.beta === null);
    finals.sort(descending);
    return finals[0]
      ? { selected: finals[0], reason: null }
      : { selected: null, reason: "channel-unavailable" };
  }

  // Beta follows the highest observed beta core line. A final tag is eligible
  // only when it is the exact final promotion of that same X.Y.Z line; an
  // unrelated, numerically higher final must never hijack the beta channel.
  const betas = candidates.filter((tag) => validTag(tag.ref)?.beta !== null);
  betas.sort(descending);
  const highestBeta = betas[0];
  if (!highestBeta) return { selected: null, reason: "channel-unavailable" };
  const core = validTag(highestBeta.ref).core;
  const promoted = candidates.find((tag) => tag.ref === `refs/tags/v${core}`);
  return { selected: promoted ?? highestBeta, reason: null };
}

function selectedChannelTarget(remoteUrl, channel, options) {
  const selector = channel === "alpha" ? "refs/heads/main" : "refs/tags/*";
  const remote = run("git", ["ls-remote", remoteUrl, selector], {
    ...options,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (remote.status !== 0) {
    return { selected: null, reason: remote.error?.code === "ETIMEDOUT" || remote.signal ? "timeout" : "remote-unavailable" };
  }
  if (channel === "alpha") {
    const line = String(remote.stdout ?? "").trim().match(/^([0-9a-f]{40})\s+refs\/heads\/main$/imu);
    return line
      ? { selected: { ref: "refs/heads/main", version: null, commit: line[1].toLowerCase() }, reason: null }
      : { selected: null, reason: "channel-unavailable" };
  }
  return selectedTagFromRemote(remote.stdout, channel);
}

/**
 * Bridge lifecycle-owned distribution topology into the closed channel
 * resolver. Only the persisted project field may override the trusted
 * distribution default; no caller-provided channel, URL, or Git ref crosses
 * this boundary.
 */
export function resolvePipelineUpdateChannelConfig(repoPath, options = {}) {
  return resolvePipelineUpdateChannel({
    projectConfig: options.projectConfig ?? readProjectPipelineUpdateChannel(repoPath),
    distributionTopology: options.distributionTopology,
    selfApplication: options.selfApplication === true,
  });
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
  const channel = resolvePipelineUpdateChannelConfig(repo, {
    ...options,
    pluginRoot: loaded.pluginRoot,
  });
  const settingsPath = options.settingsPath ?? join(repo, ".claude", "settings.json");
  const remoteUrl = options.remoteUrl ?? resolveMarketplaceUrl({ settingsPath });
  const policy = options.policy !== undefined
    ? options.policy
    : readRulesetUpdatePolicy(options.policyPath ?? join(loaded.pluginRoot, "config", "ruleset-update-policy.v1.json"));
  if (channel.status !== "ready") {
    const policyDisposition = evaluateRulesetUpdatePolicy(policy, loaded);
    return result("unknown", { loaded, channel, policyDisposition, reason: "channel-unavailable" });
  }
  if (!remoteUrl) {
    const policyDisposition = evaluateRulesetUpdatePolicy(policy, loaded);
    return result("unknown", { loaded, channel, policyDisposition, reason: "channel-unavailable" });
  }
  const target = selectedChannelTarget(remoteUrl, channel.channel, options);
  if (!target.selected) {
    const policyDisposition = evaluateRulesetUpdatePolicy(policy, loaded);
    return result("unknown", {
      loaded,
      channel,
      policyDisposition,
      reason: target.reason,
    });
  }
  const selected = target.selected;

  const temporary = mkdtempSync(join(tmpdir(), "pipeline-update-availability-"));
  try {
    const init = run("git", ["init", "--bare", "--quiet", temporary], options);
    if (init.status !== 0) {
      return result("unknown", {
        loaded,
        channel,
        selected,
        marketplace: { version: selected.version, commit: selected.commit },
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
      `${selected.commit}:refs/pipeline/marketplace`,
    ], {
      ...options,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      env,
    });
    if (fetch.status !== 0) {
      return result("unknown", {
        loaded,
        channel,
        selected,
        marketplace: { version: selected.version, commit: selected.commit },
        policyDisposition: evaluateRulesetUpdatePolicy(policy, loaded),
        reason: fetch.error?.code === "ETIMEDOUT" || fetch.signal
          ? "timeout"
          : "remote-object-unavailable",
      });
    }
    const marketplace = {
      version: options.marketplaceVersion ?? selected.version ?? readMarketplaceVersion(temporary, env, options),
      commit: selected.commit,
    };
    const compared = compareLoadedToMarketplace(temporary, env, loaded, marketplace, options);
    const policyDisposition = evaluateRulesetUpdatePolicy(policy, loaded);
    return result(compared.status, {
      loaded,
      marketplace,
      channel,
      selected: { ...selected, version: marketplace.version },
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

export function runPipelineUpdateAvailabilityCli(argv, deps = {}) {
  const parsed = parseArgs(argv);
  if (!parsed) {
    (deps.stderr ?? process.stderr).write("ruleset-freshness: usage: ruleset-freshness.mjs [--repo <path>] [--loaded-version <version>] [--loaded-commit <sha>]\n");
    return { exitCode: 64, result: null };
  }
  const inspected = (deps.inspect ?? inspectPipelineUpdateAvailability)(parsed.repo, parsed);
  (deps.stdout ?? process.stdout).write(`${JSON.stringify(inspected)}\n`);
  return { exitCode: inspected.blocking ? 2 : 0, result: inspected };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const execution = runPipelineUpdateAvailabilityCli(process.argv.slice(2));
  process.exitCode = execution.exitCode;
}
