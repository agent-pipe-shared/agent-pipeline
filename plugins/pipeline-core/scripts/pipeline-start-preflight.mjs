#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Report loaded distribution identity and restart-handoff presence without secrets. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { measureBootstrapPayload } from "../lib/bootstrap-payload-budget.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { observeCodexPublicCoreIdentity, observePublicCoreIdentity } from "../lib/public-core-observation.mjs";
import { RULESET_SOURCE_SCHEMA } from "../lib/ruleset-source.mjs";
import {
  evaluateSelfApplicationAttestation,
  pluginRootHasSelfApplicationGit,
} from "../lib/self-application-attestation-gate.mjs";
import { WSL_FRESHNESS_BOUNDARY_ID } from "./ruleset-freshness.mjs";

export const SCHEMA = "pipeline.start-preflight.v1";
const PLUGIN_ID = "pipeline-core@agent-pipeline";
const LOCAL_PLUGIN_ID = "pipeline-core@agent-pipeline-local";
const NORMAL_BOOTSTRAP_CHECKS = Object.freeze([
  "lifecycle",
  "authority",
  "calibration",
  "handover",
  "verify",
  "continuation",
]);

export function normalBootstrapPayloadReceipt(payload) {
  const measurement = measureBootstrapPayload(payload, {
    mode: "normal",
    runner: "runner-neutral",
  });
  return {
    schema: "pipeline.bootstrap-payload-receipt.v1",
    mode: "normal",
    retainedChecks: NORMAL_BOOTSTRAP_CHECKS,
    originalMeasurement: measurement,
    emittedMeasurement: measurement,
    overBudget: !measurement.withinBudget,
    truncated: false,
  };
}

function readInstalledPluginList(runner) {
  const executable = runner === "claude" ? "claude" : "codex";
  const result = spawnSync(executable, ["plugin", "list", "--json"], {
    encoding: "utf8",
    shell: false,
    timeout: 5_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0 || typeof result.stdout !== "string") return null;
  return result.stdout;
}

/** Reads the host's own `~/.claude/plugins/known_marketplaces.json` (Claude-only registry). */
function readClaudeKnownMarketplaces() {
  return readFileSync(resolve(homedir(), ".claude", "plugins", "known_marketplaces.json"), "utf8");
}

function installedPipelineIdentityCodex(payload) {
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

/**
 * The registered marketplace name is the substring of `id`/`pluginId` after
 * the `@` -- the same convention both runners use (`pipeline-core@<name>`).
 */
function claudeMarketplaceName(id) {
  const at = id.indexOf("@");
  return at === -1 ? "" : id.slice(at + 1);
}

/**
 * Claude's `plugin list --json` carries no source/marketplaceSource fields
 * (unlike Codex), so a `local-development` claim can only be attested via
 * the host's own `known_marketplaces.json` registry: the marketplace this
 * id was installed from must be a `directory` source with an absolute,
 * normalized path. `projectPath` on the list entry is NOT usable for this --
 * it was measured to be populated identically for a github-sourced install.
 */
function claudeLocalDevelopmentAttested(entry, knownMarketplaces) {
  let registry;
  try {
    registry = JSON.parse(knownMarketplaces());
  } catch {
    return false;
  }
  if (registry === null || typeof registry !== "object" || Array.isArray(registry)) return false;
  const source = registry[claudeMarketplaceName(entry.id)]?.source;
  return source?.source === "directory"
    && typeof source.path === "string"
    && isAbsolute(source.path)
    && resolve(source.path) === source.path;
}

function installedPipelineIdentityClaude(payload, knownMarketplaces) {
  if (!Array.isArray(payload)) return null;
  const eligible = (entry) =>
    [PLUGIN_ID, LOCAL_PLUGIN_ID].includes(entry?.id)
    && entry?.enabled === true
    && typeof entry?.version === "string"
    && entry.version.trim() !== "";
  const localMatches = payload.filter((entry) => eligible(entry) && entry.id === LOCAL_PLUGIN_ID);
  const officialMatches = payload.filter((entry) => eligible(entry) && entry.id === PLUGIN_ID);
  if (localMatches.length + officialMatches.length > 1) {
    return { version: null, source: "unknown", ambiguous: true };
  }
  if (localMatches.length + officialMatches.length !== 1) return null;
  const matches = localMatches.length === 1 ? localMatches : officialMatches;
  const entry = matches[0];
  const isLocalId = entry.id === LOCAL_PLUGIN_ID;
  const attestedLocal = isLocalId && claudeLocalDevelopmentAttested(entry, knownMarketplaces);
  if (isLocalId && !attestedLocal) return null;
  return { version: entry.version, source: attestedLocal ? "local-development" : "unknown" };
}

export function installedPipelineIdentity(
  pluginList = () => readInstalledPluginList("codex"),
  runner = "codex",
  knownMarketplaces = readClaudeKnownMarketplaces,
) {
  let payload;
  try {
    payload = JSON.parse(pluginList());
  } catch {
    return null;
  }
  return runner === "claude"
    ? installedPipelineIdentityClaude(payload, knownMarketplaces)
    : installedPipelineIdentityCodex(payload);
}

export function installedPipelineVersion(pluginList = () => readInstalledPluginList("codex"), runner = "codex") {
  return installedPipelineIdentity(pluginList, runner)?.version ?? null;
}

/**
 * Return only the selected host route after a WSL preflight. Control identity
 * selection occurs in the authorized host helper immediately before it starts
 * the fixed Git child; a sandbox preflight must not claim host availability.
 *
 * Restored from 75b8361^1.  The projection below is the pre-merge allowlist,
 * extended by PHX-WP-PX0AC08 to admit `rulesetSource` now that
 * `observePipelineStartPreflight` actually populates it: previously the field
 * was always `undefined` here (never built at all), so it was a no-op inside
 * `JSON.stringify` regardless of whether it was listed; it is now a real
 * closed `pipeline.ruleset-source.v1` observation (or `null` when no loaded
 * distribution was resolved) and is bound like every other field on this
 * allowlist. The merged-base `bootstrapPayload` remains excluded from the
 * binding, unchanged.
 */
export function freshnessHostActionForPreflight(preflight) {
  if (!preflight || typeof preflight !== "object"
    || preflight.schema !== SCHEMA
    || preflight.status !== "ready"
    || preflight.executionBoundary !== "host-authorized-wsl") return null;
  // Bind the host freshness adapter to this exact preflight projection.  The
  // digest is opaque to callers, so it does not disclose the physical plugin
  // root or the normalized source observation carried by the preflight.
  const bound = {
    schema: preflight.schema,
    status: preflight.status,
    version: preflight.version,
    installedVersion: preflight.installedVersion,
    installedSource: preflight.installedSource,
    rulesetSource: preflight.rulesetSource,
    executionBoundary: preflight.executionBoundary,
    pluginRoot: preflight.pluginRoot,
    nextAction: preflight.nextAction,
  };
  return Object.freeze({
    executionBoundary: "host-authorized-wsl",
    boundaryId: WSL_FRESHNESS_BOUNDARY_ID,
    preflightSha256: createHash("sha256").update(JSON.stringify(bound)).digest("hex"),
  });
}

export function observePipelineStartPreflight({
  env = process.env,
  pluginList,
  read = readFileSync,
  scriptUrl = import.meta.url,
  cwd = process.cwd(),
  knownMarketplaces = readClaudeKnownMarketplaces,
  observe,
} = {}) {
  const pluginRoot = resolve(dirname(fileURLToPath(scriptUrl)), "..");
  // CLAUDECODE is set by every Claude Code session (main and subagent); its
  // absence keeps the historical Codex-CLI default. This is the one place a
  // session's own runner identity enters the onboarding chain -- without it,
  // a Claude session silently inherits Codex-only gates (App-Server health,
  // native runtime readback) that RUNNERS_WITHOUT_APP_SERVER/
  // RUNNERS_WITHOUT_NATIVE_READBACK exist specifically to exempt it from.
  // Resolved BEFORE the reads below: both the source-manifest read and the
  // installed-plugin-list read must resolve through this same runner
  // identity, so each runner reads and reports its own distribution only.
  const runner = env.CLAUDECODE === "1" ? "claude" : "codex";
  const manifestRelativePath = runner === "claude" ? ".claude-plugin/plugin.json" : ".codex-plugin/plugin.json";
  let version;
  try {
    const manifest = JSON.parse(read(resolve(pluginRoot, manifestRelativePath), "utf8"));
    version = typeof manifest?.version === "string" && manifest.version.trim() !== ""
      ? manifest.version
      : null;
  } catch {
    version = null;
  }
  const resolvedPluginList = pluginList ?? (() => readInstalledPluginList(runner));
  const installedIdentity = installedPipelineIdentity(resolvedPluginList, runner, knownMarketplaces);
  const installedVersion = installedIdentity?.version ?? null;
  const ticket = Object.prototype.hasOwnProperty.call(env, "PIPELINE_CODEX_ONBOARDING_TICKET_ID")
    && String(env.PIPELINE_CODEX_ONBOARDING_TICKET_ID) !== "";
  const token = Object.prototype.hasOwnProperty.call(env, "PIPELINE_CODEX_ONBOARDING_TOKEN")
    && String(env.PIPELINE_CODEX_ONBOARDING_TOKEN) !== "";
  const wsl = [env.WSL_DISTRO_NAME, env.WSL_INTEROP]
    .some((value) => typeof value === "string" && value.trim() !== "");
  // PX0-AC-13 / design §B.2(a): "host-authorized-wsl" is a Codex-specific,
  // App-Server-attested control-channel boundary. Claude Code under WSL has
  // no such mechanism (`hostControlBinding`/`observeCodexAppServer` are
  // Codex-only), so this must also gate on `runner`, not WSL presence alone.
  const executionBoundary = wsl && runner === "codex" ? "host-authorized-wsl" : "default";
  // Captures the exact origin/content observation `evaluateSelfApplicationAttestation`
  // (unmodified, imported read-only) resolves and calls internally, without a
  // second, independent invocation of the real observer: `observe` (below) is
  // an already-existing extension point of that function -- production code
  // never supplies one and always falls through to its own runner-based
  // default, so this wrapper reproduces that exact default-selection
  // (`observe ?? (runner === "codex" ? observeCodexPublicCoreIdentity :
  // observePublicCoreIdentity)`) itself, then forwards unmodified to it and
  // records the return value as a side effect. `evaluateSelfApplicationAttestation`
  // therefore receives a non-nullish `observe` on every call and always takes
  // that branch of its own `observe ?? (...)` selection -- functionally
  // identical to what it would have selected itself, so its pass/fail
  // semantics (`attestationFailed`) are unchanged; only the discarded
  // internal `normalized`/`observation` data is now additionally retained
  // here for `rulesetSource`. `capturedObservation` stays `null` exactly when
  // the function's own gate (`version && pluginRootHasSelfApplicationGit`)
  // never attempted an observation at all.
  let capturedObservation = null;
  const resolvedObserveForAttestation = observe
    ?? (runner === "codex" ? observeCodexPublicCoreIdentity : observePublicCoreIdentity);
  const captureObserve = (...args) => {
    capturedObservation = resolvedObserveForAttestation(...args);
    return capturedObservation;
  };
  const attestationFailed = evaluateSelfApplicationAttestation({
    pluginRoot, runner, version, observe: captureObserve,
  }).failed;
  const status = !version
    ? "plugin-identity-unavailable"
    : installedIdentity?.ambiguous === true || installedVersion !== null && installedVersion !== version || attestationFailed
      ? "plugin-refresh-required"
      : "ready";
  // PX0-AC-08: one closed runner-neutral source observation per bootstrap
  // resolution. Only built when a loaded distribution was actually resolved
  // (`version` truthy) -- the acceptance clause itself is conditioned on
  // that ("WHEN bootstrap resolves a loaded Pipeline distribution"), and the
  // schema has no "unavailable" variant for `selectedPlugin` the way it does
  // for the identity fields, so a valid observation cannot be constructed
  // without a real version string in the first place.
  let rulesetSource = null;
  if (version) {
    // Fixed mapping (briefing PHX-WP-PX0AC08, not a design choice made here):
    // self-application git checkout present -> "self-application"; else an
    // attested local-development registry match -> "local-development"; else
    // an ordinary remote/marketplace registry match -> "marketplace-public";
    // else (no attested installed identity at all) -> "unavailable". This
    // repo has no private-marketplace distinction today, so that class is
    // never selected here.
    const selfApplicationGit = pluginRootHasSelfApplicationGit(pluginRoot);
    const sourceClass = selfApplicationGit
      ? "self-application"
      : installedIdentity?.source === "local-development"
        ? "local-development"
        : installedIdentity?.source === "remote"
          ? "marketplace-public"
          : "unavailable";
    // The strongest available identity: the real content hash the
    // self-application attestation already derived above, when it derived
    // one; honestly `unavailable` for every other topology (no fabricated
    // git/content hash is invented for a marketplace-installed or
    // local-development copy -- see the linked backlog item for the
    // out-of-scope question of whether those topologies should eventually
    // get a stronger mechanism).
    const identityAvailable = selfApplicationGit && capturedObservation?.status === "ready";
    const loadedIdentity = identityAvailable
      ? { status: "available", algorithm: "content-sha256", value: capturedObservation.plugin.contentSha256 }
      : { status: "unavailable" };
    const installedIdentityForSource = identityAvailable
      ? { status: "available", algorithm: "content-sha256", value: capturedObservation.plugin.contentSha256 }
      : { status: "unavailable" };
    // selectedPlugin.id: reuses the self-application observation's own
    // resolved plugin name when one was actually derived (the same value
    // that internal computation itself uses for this field); otherwise
    // falls back to whichever of the two matching constants this module
    // already uses internally for installed-registry eligibility, chosen by
    // the same `local-development` vs. everything-else split as `source.class`.
    const selectedPluginId = identityAvailable
      ? capturedObservation.plugin.name
      : installedIdentity?.source === "local-development"
        ? LOCAL_PLUGIN_ID
        : PLUGIN_ID;
    rulesetSource = {
      schema: RULESET_SOURCE_SCHEMA,
      runner,
      selectedPlugin: { id: selectedPluginId, version },
      source: { class: sourceClass },
      loadedIdentity,
      installedIdentity: installedIdentityForSource,
    };
  }
  const result = {
    schema: SCHEMA,
    status,
    version,
    installedVersion,
    installedSource: installedIdentity?.source ?? "unknown",
    executionBoundary,
    pluginRoot,
    rulesetSource,
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
            "--runner",
            runner,
          ],
          mutation: false,
          requiresConfirmation: false,
          executionBoundary,
          expected: {
            schema: "pipeline.project-onboarding.v4",
          },
        }
      // "plugin-refresh-required" is a soft/advisory status, not a hard block
      // (design §A.5, correcting the prior nextAction: null defect -- that left
      // this branch with nothing to execute and no printable confirmation).
      // Nothing executes; the advisory is carried forward through bootstrap.
      : status === "plugin-refresh-required"
        ? {
            kind: "advisory",
            executable: null,
            argv: [],
            mutation: false,
            requiresConfirmation: false,
            executionBoundary,
            expected: {
              schema: "pipeline.plugin-refresh-advisory.v1",
            },
          }
        : null,
  };
  return {
    ...result,
    // This measures the exact normal-bootstrap envelope emitted before the
    // self-describing receipt. The receipt is retained in the same typed
    // preflight readback; no cached or static skill-size surrogate is used.
    bootstrapPayload: normalBootstrapPayloadReceipt(result),
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

if (isDirectInvocation(import.meta.url)) process.exitCode = main();
