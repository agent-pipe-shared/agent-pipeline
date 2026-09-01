#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Observe loaded Pipeline update availability independently of repository
 * branch/upstream freshness. Remote objects land only in a disposable bare
 * repository; this helper never mutates project or loaded-plugin refs, config,
 * index, or worktree.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { resolveMarketplaceUrl } from "../hooks/staleness-check.mjs";
import { compareLoadedRulesetIdentity, normalizeRulesetSource } from "../lib/ruleset-source.mjs";
import { PUBLIC_MARKETPLACE_URL } from "../lib/public-core-origin-allowlist.mjs";
import {
  comparePipelineVersions,
  evaluateRulesetUpdatePolicy,
  readRulesetUpdatePolicy,
} from "./ruleset-update-policy.mjs";
import {
  readProjectPipelineUpdateAlphaRef,
  readProjectPipelineUpdateChannel,
  resolvePipelineUpdateChannel,
} from "./pipeline-update-channel.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

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
    // spawnSync's default killSignal (SIGTERM) can be trapped or otherwise
    // ignored by a stuck child (observed with `git` against a hung remote),
    // in which case spawnSync blocks until the child actually exits instead
    // of settling near `timeout` -- the "unsettled top-level await" hang.
    // SIGKILL cannot be trapped, so it guarantees the call settles.
    killSignal: options.killSignal ?? "SIGKILL",
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

/**
 * `channel` here is the full resolved channel-config object (ADR-0078), not
 * a bare string: `alpha`'s resolution needs `alphaRef`/`alphaRefReason`
 * alongside `channel.channel`.
 */
function selectedChannelTarget(remoteUrl, channel, options) {
  if (channel.channel === "beta") {
    // D4: beta is a reserved, currently-inactive update channel.
    // `channel-inactive` is a deliberate, current product state -- distinct
    // from `channel-unavailable` (a transient/environmental failure that
    // invites a retry). It invites none, so no network call is ever
    // attempted for it: collapsing the two into one reason would tell an
    // operator to retry their way out of a decision. When beta activates,
    // its mechanism is already implemented below (`selectedTagFromRemote`'s
    // beta branch) -- activation only needs to stop short-circuiting here.
    return { selected: null, reason: "channel-inactive" };
  }
  if (channel.channel === "alpha") {
    // D3: alpha never resolves through a hardcoded refs/heads/main. It
    // resolves only from the persisted project field naming a branch (any
    // branch, `main` included, is a legitimate configuration). When no ref
    // is configured -- or the configured value is malformed -- there is
    // nothing honest to compare against, so alpha reports a typed result
    // rather than fabricating a comparison against an arbitrary ref.
    if (channel.alphaRefReason === "channel-unavailable") {
      // The calibration file itself could not be read at all -- genuinely
      // transient/environmental (ADR-0078 D3), so this is the one alphaRef
      // failure that legitimately shares channel-unavailable's meaning.
      return { selected: null, reason: "channel-unavailable" };
    }
    if (channel.alphaRefReason) {
      // "malformed-configuration" (a duplicate `pipelineUpdateAlphaRef` key)
      // or "invalid-alpha-ref" (a syntactically bad ref value): a
      // persistent, operator-fixable configuration error, NOT a transient or
      // environmental failure. Reporting it as channel-unavailable would
      // invite a retry that a config fix -- not a retry -- can resolve. Keep
      // this distinction: the same reasoning D4 already carries for
      // channel-inactive vs channel-unavailable. Passing the computed reason
      // straight through (rather than collapsing it again) is the fix.
      return { selected: null, reason: channel.alphaRefReason };
    }
    if (!channel.alphaRef) {
      return { selected: null, reason: "local-no-remote-claim" };
    }
  }
  const selector = channel.channel === "alpha" ? `refs/heads/${channel.alphaRef}` : "refs/tags/*";
  const remote = run("git", ["ls-remote", remoteUrl, selector], {
    ...options,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (remote.status !== 0) {
    return { selected: null, reason: remote.error?.code === "ETIMEDOUT" || remote.signal ? "timeout" : "remote-unavailable" };
  }
  if (channel.channel === "alpha") {
    const ref = `refs/heads/${channel.alphaRef}`;
    const escapedRef = ref.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const line = String(remote.stdout ?? "").trim().match(new RegExp(`^([0-9a-f]{40})\\s+${escapedRef}$`, "imu"));
    return line
      ? { selected: { ref, version: null, commit: line[1].toLowerCase() }, reason: null }
      : { selected: null, reason: "channel-unavailable" };
  }
  return selectedTagFromRemote(remote.stdout, channel.channel);
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
    alphaRefConfig: options.alphaRefConfig ?? readProjectPipelineUpdateAlphaRef(repoPath),
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
  const target = selectedChannelTarget(remoteUrl, channel, options);
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

/* --------------------------------------------------------------------------
 * PHX-0B WSL freshness host-action family.
 *
 * Restored from the pre-merge implementation (75b8361^1) after the 0.5.2
 * integration replaced this module's contents wholesale.  It coexists with the
 * update-availability service above rather than replacing it: the two answer
 * different questions (is a newer Pipeline released? vs. is the loaded ruleset
 * identical to the reviewed public HEAD?), and `migrateLegacyRulesetFreshness`
 * above already treats this family's envelope as the legacy input shape.
 *
 * The pre-merge names `result`, `relation`, `RULESET_FRESHNESS_SCHEMA` and
 * `inspectRulesetFreshness` collide with the merged base, which binds the last
 * two to the update-availability contract.  The merged bindings are left
 * untouched and the restored logic uses distinct local names.
 * ----------------------------------------------------------------------- */

export { PUBLIC_MARKETPLACE_URL };
export const FRESHNESS_NETWORK_PREFLIGHT_SCHEMA = "pipeline.ruleset-freshness-network-preflight.v1";
export const FRESHNESS_HOST_TRANSPORT_SCHEMA = "pipeline.ruleset-freshness-host-transport.v1";
export const FRESHNESS_HOST_ACTION_SCHEMA = "pipeline.ruleset-freshness-host-action.v1";
export const FRESHNESS_HOST_RESULT_SCHEMA = "pipeline.ruleset-freshness-host-result.v1";
export const FRESHNESS_HOST_RECEIPT_SCHEMA = "pipeline.ruleset-freshness-host-execution-receipt.v1";
export const FRESHNESS_HOST_CONTROL_SCHEMA = "pipeline.ruleset-freshness-host-control.v1";
export const WSL_FRESHNESS_BOUNDARY_ID = "pipeline-start-host-authorized-wsl";

const RULESET_FRESHNESS_V1_SCHEMA = "pipeline.ruleset-freshness.v1";
const SHA = /^[0-9a-f]{40,64}$/iu;
const SHA256 = /^[0-9a-f]{64}$/iu;
const BOUNDARY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const CODEX_CLAUDE_FALLBACK_STATUS = "codex-plugin-list-unavailable";

function safeIdentity(identity) {
  return identity?.status === "available" ? identity.value : null;
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function freshnessResult(status, fields = {}) {
  return {
    schema: RULESET_FRESHNESS_V1_SCHEMA,
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

function freshnessRelation(counts, fields) {
  const match = String(counts.stdout ?? "").trim().match(/^(\d+)\s+(\d+)$/u);
  if (counts.status !== 0 || !match) return freshnessResult("comparison-unavailable", { ...fields, reason: "comparison-failed" });
  const ahead = Number(match[1]);
  const behind = Number(match[2]);
  const status = ahead === 0 ? (behind === 0 ? "equal" : "behind") : behind === 0 ? "ahead" : "diverged";
  return freshnessResult(status, { ...fields, ahead, behind });
}

/**
 * A known network-restricted sandbox must not consume a speculative direct
 * fetch. The preflight binds the one selected host boundary by a non-secret
 * identifier; the host receives only this fixed public-HEAD operation.
 */
export function createFreshnessHostAction(boundaryId, expectedControlIdentitySha256) {
  if (typeof boundaryId !== "string" || !BOUNDARY_ID.test(boundaryId)
    || typeof expectedControlIdentitySha256 !== "string" || !SHA256.test(expectedControlIdentitySha256)) return null;
  const unsigned = {
    schema: FRESHNESS_HOST_ACTION_SCHEMA,
    boundaryId,
    expectedControlIdentitySha256,
    operation: "read-public-marketplace-head",
    access: "read-only",
    network: "enabled",
    command: Object.freeze({ executable: "git", argv: Object.freeze(["ls-remote", PUBLIC_MARKETPLACE_URL, "HEAD"]) }),
  };
  return Object.freeze({ ...unsigned, requestSha256: sha256(JSON.stringify(unsigned)) });
}

function selectHostTransport(networkPreflight, hostTransport) {
  if (networkPreflight === undefined && hostTransport === undefined) return null;
  if (!exactKeys(networkPreflight, ["schema", "network", "boundaryId", "expectedControlIdentitySha256"])
    || networkPreflight.schema !== FRESHNESS_NETWORK_PREFLIGHT_SCHEMA
    || !["enabled", "restricted"].includes(networkPreflight.network)
    || typeof networkPreflight.boundaryId !== "string" || !BOUNDARY_ID.test(networkPreflight.boundaryId)
    || typeof networkPreflight.expectedControlIdentitySha256 !== "string" || !SHA256.test(networkPreflight.expectedControlIdentitySha256)) return false;
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
    || receipt.hostControl.daemonIdentitySha256 !== action.expectedControlIdentitySha256
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
function observePublicRemoteIdentity({ remoteUrl = PUBLIC_MARKETPLACE_URL, spawn = spawnSync, timeoutMs = DEFAULT_TIMEOUT_MS, networkPreflight = undefined, hostTransport = undefined } = {}) {
  const selectedHost = selectHostTransport(networkPreflight, hostTransport);
  if (selectedHost === false) return { status: "remote-unavailable", identity: null, reason: "host-transport-required" };
  if (selectedHost !== null) {
    // The selected action is fixed to the reviewed public marketplace. It has
    // no consumer root, plugin root, cache path, HOME value, or private URL.
    const action = createFreshnessHostAction(selectedHost.boundaryId, networkPreflight.expectedControlIdentitySha256);
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
    return freshnessResult("loaded-remote-mismatch", { source: "self-application", loadedSha, remoteSha, reason: "loaded-plugin-root-unavailable" });
  }
  const fields = { source: "self-application", loadedSha, remoteSha };
  const localObject = git(pluginRoot, ["cat-file", "-e", `${remoteSha}^{commit}`], options);
  if (localObject.status === 0) {
    return freshnessRelation(git(pluginRoot, ["rev-list", "--left-right", "--count", `${loadedSha}...${remoteSha}`], options), fields);
  }

  // A selected restricted-boundary transport attests exactly the public-HEAD
  // observation above. It does not authorize a second network operation from
  // this common path. If that object is not already available locally, fail
  // closed rather than issuing an ambient `git fetch` in the sandbox.
  if (options.networkPreflight?.network === "restricted") {
    return freshnessResult("comparison-unavailable", { ...fields, reason: "remote-object-unavailable" });
  }

  const objectResult = git(pluginRoot, ["rev-parse", "--git-path", "objects"], options);
  const objectRaw = String(objectResult.stdout ?? "").trim();
  if (objectResult.status !== 0 || !objectRaw) return freshnessResult("comparison-unavailable", { ...fields, reason: "object-store-unavailable" });
  const objectPath = isAbsolute(objectRaw) ? objectRaw : resolve(pluginRoot, objectRaw);
  const temporary = mkdtempSync(join(tmpdir(), "pipeline-ruleset-freshness-"));
  try {
    const init = run("git", ["init", "--bare", "--quiet", temporary], options);
    if (init.status !== 0) return freshnessResult("comparison-unavailable", { ...fields, reason: "comparison-init-failed" });
    const env = {
      ...process.env,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: objectPath,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
    };
    const localRef = run("git", ["--git-dir", temporary, "update-ref", "refs/ruleset/local", loadedSha], { ...options, env });
    if (localRef.status !== 0) return freshnessResult("comparison-unavailable", { ...fields, reason: "local-ref-unavailable" });
    const fetch = run("git", ["--git-dir", temporary, "-c", "maintenance.auto=false", "fetch", "--quiet", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", options.remoteUrl ?? PUBLIC_MARKETPLACE_URL, `${remoteSha}:refs/ruleset/remote`], {
      ...options,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      env,
    });
    if (fetch.status !== 0) return freshnessResult("comparison-unavailable", { ...fields, reason: fetch.error?.code === "ETIMEDOUT" || fetch.signal ? "timeout" : "remote-object-unavailable" });
    return freshnessRelation(run("git", ["--git-dir", temporary, "rev-list", "--left-right", "--count", "refs/ruleset/local...refs/ruleset/remote"], { ...options, env }), fields);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

/**
 * Common PHX-0B contract. `repoPath` is retained only for call compatibility;
 * it is deliberately not inspected when sourceObservation is present.
 */
function inspectObservedRulesetFreshness(repoPath, options = {}) {
  const normalized = normalizeRulesetSource(options.sourceObservation);
  if (normalized.status !== "ready") return freshnessResult(normalized.status, { source: normalized.observation?.source.class ?? null });

  const source = normalized.observation.source.class;
  const loadedSha = safeIdentity(normalized.observation.loadedIdentity);
  if (source === "local-development" || source === "marketplace-private") {
    return freshnessResult(source, { source, loadedSha, reason: "public-remote-not-selected" });
  }
  if (source !== "marketplace-public" && source !== "self-application") {
    return freshnessResult("source-unavailable", { source, loadedSha });
  }

  const remote = validRemoteObservation(options.remoteObservation
    ?? observePublicRemoteIdentity({
      remoteUrl: options.remoteUrl ?? PUBLIC_MARKETPLACE_URL,
      spawn: options.spawn ?? spawnSync,
      timeoutMs: options.timeoutMs,
      networkPreflight: options.networkPreflight,
      hostTransport: options.hostTransport,
    }));
  if (remote.status !== "ready") return freshnessResult("remote-unavailable", { source, loadedSha, reason: remote.reason });
  const comparison = compareLoadedRulesetIdentity(normalized.observation, remote.identity);
  const remoteSha = safeIdentity(remote.identity);
  if (comparison.status === "equal") return freshnessResult("equal", { source, loadedSha, remoteSha, ahead: 0, behind: 0 });
  if (comparison.status !== "loaded-remote-mismatch") return freshnessResult(comparison.status, { source, loadedSha, remoteSha });
  if (source !== "self-application") return freshnessResult("loaded-remote-mismatch", { source, loadedSha, remoteSha });
  return compareSelfApplication(options.loadedPluginRoot, loadedSha, remoteSha, options);
}

/**
 * Separate Claude compatibility adapter.  It owns the legacy marketplace
 * settings lookup and consumer HEAD probe; neither is part of the common
 * PHX-0B source/freshness service.
 */
function inspectClaudeRulesetFreshness(repoPath, options = {}) {
  const repo = resolve(repoPath);
  const remoteUrl = options.remoteUrl ?? resolveMarketplaceUrl({ settingsPath: options.settingsPath ?? join(repo, ".claude", "settings.json") });
  const marketplaceSource = classifyClaudeMarketplaceUrl(remoteUrl);
  if (!marketplaceSource) return freshnessResult("source-unavailable", { reason: "claude-marketplace-unavailable" });
  // A private setting is not a public-freshness transport and therefore must
  // not probe the consumer checkout merely to construct an identity.
  if (marketplaceSource === "marketplace-private") {
    return freshnessResult("marketplace-private", { source: marketplaceSource, reason: "public-remote-not-selected" });
  }
  const sourceClass = options.selfApplication ? "self-application" : marketplaceSource;
  const loaded = options.loadedSha ? { status: 0, stdout: options.loadedSha } : git(repo, ["rev-parse", "--verify", "HEAD"], options);
  const value = String(loaded.stdout ?? "").trim().toLowerCase();
  if (loaded.status !== 0 || !SHA.test(value)) return freshnessResult("loaded-identity-unavailable", { reason: "claude-loaded-identity-unavailable" });
  const sourceObservation = {
    schema: "pipeline.ruleset-source.v1",
    runner: "claude",
    selectedPlugin: { id: "pipeline-core@agent-pipeline", version: options.version ?? "compatibility" },
    source: { class: sourceClass },
    loadedIdentity: { status: "available", algorithm: value.length === 40 ? "git-sha1" : "git-sha256", value },
    installedIdentity: { status: "available", algorithm: value.length === 40 ? "git-sha1" : "git-sha256", value },
  };
  return inspectObservedRulesetFreshness(repo, { ...options, sourceObservation, loadedPluginRoot: options.loadedPluginRoot ?? repo, remoteUrl });
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
    return inspectObservedRulesetFreshness(repoPath, {
      sourceObservation: codexObservation.observation,
      loadedPluginRoot,
      networkPreflight,
      hostTransport,
    });
  }
  if (codexObservation?.status === CODEX_CLAUDE_FALLBACK_STATUS) {
    return inspectClaude(repoPath, { loadedSha });
  }
  return freshnessResult(codexObservation?.status ?? "invalid-input", {
    source: codexObservation?.observation?.source?.class ?? null,
  });
}

/* --------------------------------------------------------------------------
 * PX0-AC-13 (second clause only: "without consuming a known-failing sandbox
 * attempt"): under the `host-authorized-wsl` execution boundary,
 * `inspectPipelineUpdateAvailability`'s two network-touching git calls
 * (`ls-remote`, the disposable-bare-repo `fetch`) are known to fail in this
 * sandbox -- there is no genuine cross-sandbox transport in this codebase
 * today (`docs/phoenix-governance-threat-model.md:53-57`: boundary-crossing
 * is an agent/runner tool-tier decision, not in-process code). A prior
 * version of this block spawned `/usr/bin/git` from inside the same
 * sandboxed process after a purely local Codex App-Server health check --
 * that never actually crossed any boundary and was a FAKE attestation,
 * confirmed by two independent investigation dispatches this session. It has
 * been removed. The replacement below is honest: it always returns a
 * synthetic non-zero result for a network-delegated call, WITHOUT ever
 * attempting to spawn a subprocess for it, so no doomed sandbox attempt is
 * wasted or left hanging. Every local-only call still passes straight
 * through to the real `spawn`, completely unmodified. This satisfies
 * PX0-AC-13's second clause only; the first clause ("SHALL use the selected
 * network-open/read-only host transport") requires a real cross-sandbox
 * transport that does not exist in this codebase and is out of scope here --
 * a separate, future work item.
 * ----------------------------------------------------------------------- */

/**
 * `git` argv shapes that touch the network inside
 * `inspectPipelineUpdateAvailability` -- exactly the two call sites design
 * §B.3 identifies as its network-delegated class (`selectedChannelTarget`'s
 * `ls-remote`, and the disposable-bare-repo `fetch`). Every other call this
 * function makes (`rev-parse`, `show`, `update-ref`, `rev-list`,
 * `init --bare`) is local-disk-only and stays on the ordinary local `spawn`,
 * unchanged.
 */
function isNetworkDelegatedGitInvocation(command, args) {
  return command === "git" && Array.isArray(args) && (args[0] === "ls-remote" || args.includes("fetch"));
}

/**
 * Build a fail-closed `options.spawn` substitute for
 * `inspectPipelineUpdateAvailability` under the `host-authorized-wsl`
 * boundary. A network-delegated call (see `isNetworkDelegatedGitInvocation`)
 * NEVER reaches a subprocess spawn here -- it is known to fail in this
 * sandbox, so no attempt is made, wasted, or left hanging; the function
 * returns a `spawnSync`-shaped non-zero result with no stdout instead, so
 * existing callers see their ordinary `"remote-unavailable"` outcome. Every
 * other call passes straight through to the plain local `spawn`, completely
 * unmodified, because none of them ever leaves the local machine.
 */
export function createWslHostFailClosedSpawn({
  spawn = spawnSync,
} = {}) {
  return function wslHostFailClosedSpawn(command, args, spawnOptions = {}) {
    if (!isNetworkDelegatedGitInvocation(command, args)) return spawn(command, args, spawnOptions);
    return { status: 1, stdout: "", stderr: "", signal: null, error: undefined, pid: undefined };
  };
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

/**
 * Design §B.2(a)'s corrected `executionBoundary` computation, duplicated here
 * deliberately rather than imported: `pipeline-start-preflight.mjs` already
 * imports `WSL_FRESHNESS_BOUNDARY_ID` FROM this module, so an import in the
 * opposite direction here would be circular. Both the `env.CLAUDECODE`-based
 * runner check and the `WSL_DISTRO_NAME`/`WSL_INTEROP` check are already
 * duplicated verbatim across several other files in this codebase (design
 * §B.4); this is the same established pattern, not a new one.
 */
function updateAvailabilityExecutionBoundary(env) {
  const runner = env.CLAUDECODE === "1" ? "claude" : "codex";
  const wsl = [env.WSL_DISTRO_NAME, env.WSL_INTEROP]
    .some((value) => typeof value === "string" && value.trim() !== "");
  return wsl && runner === "codex" ? "host-authorized-wsl" : "default";
}

export function runPipelineUpdateAvailabilityCli(argv, deps = {}) {
  const parsed = parseArgs(argv);
  if (!parsed) {
    (deps.stderr ?? process.stderr).write("ruleset-freshness: usage: ruleset-freshness.mjs [--repo <path>] [--loaded-version <version>] [--loaded-commit <sha>]\n");
    return { exitCode: 64, result: null };
  }
  // PX0-AC-13 (second clause only): supply a fail-closed `options.spawn`
  // only when the corrected boundary is "host-authorized-wsl" (Codex + WSL)
  // -- it never spawns a subprocess for the two network-delegated calls (see
  // `createWslHostFailClosedSpawn`). Every other boundary is byte-for-byte
  // the pre-existing call: `parsed` unmodified, falling through to
  // `inspectPipelineUpdateAvailability`'s own default direct `spawnSync`
  // path.
  const executionBoundary = updateAvailabilityExecutionBoundary(deps.env ?? process.env);
  const spawn = executionBoundary === "host-authorized-wsl"
    ? (deps.createFailClosedSpawn ?? createWslHostFailClosedSpawn)()
    : undefined;
  const inspectOptions = spawn ? { ...parsed, spawn } : parsed;
  const inspected = (deps.inspect ?? inspectPipelineUpdateAvailability)(parsed.repo, inspectOptions);
  (deps.stdout ?? process.stdout).write(`${JSON.stringify(inspected)}\n`);
  return { exitCode: inspected.blocking ? 2 : 0, result: inspected };
}

const isCli = isDirectInvocation(import.meta.url);
if (isCli) {
  const execution = runPipelineUpdateAvailabilityCli(process.argv.slice(2));
  process.exitCode = execution.exitCode;
}
