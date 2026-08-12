#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Report loaded distribution identity and restart-handoff presence without secrets. */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { measureBootstrapPayload } from "../lib/bootstrap-payload-budget.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { bindScratchDescriptor, retireOrphanScratchDescriptors } from "../lib/session-cleanup-recovery.mjs";

export const SCHEMA = "pipeline.start-preflight.v1";
/**
 * What `status` ranges over -- declared, not implied (SETUPSTATUS-1). This preflight resolves
 * the loaded plugin distribution's identity and nothing else: it never reads
 * `pipeline.user.yaml`, so `ready` is never a statement that project setup is complete. A
 * greenfield session read it as one, next to the SessionStart setup-check reporting the file
 * missing, and had no basis to choose. Naming the scope makes the two statements reconcilable
 * by construction; `setup-check.mjs`'s `reconcileSetupObservation` refuses an undeclared one.
 */
export const STATUS_SCOPE = "plugin-distribution-identity";
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

/**
 * PO decision 2026-08-11 (backlog/items/2026-08-11-preflight-user-and-matching-
 * project-scope-still-collide-as-ambiguous.md, option 2): a repo-committed
 * `scope: "project"` registration is a team decision and beats a machine-wide
 * `user`/`local`/absent-scope default for the SAME id -- it must shadow those
 * entries rather than merely coexist and trip ambiguity. Within one id-class's
 * already cwd-filtered eligible entries, if any `scope: "project"` entries are
 * present, they alone determine that id-class's count; non-project entries for
 * the same id are dropped from consideration. This is never a hardcoded
 * "collapse to 1": two or more genuinely eligible project-scope entries for the
 * SAME id (a real registry duplicate) still count as ambiguous. Only when NO
 * project-scope entry is eligible for an id-class does the prior unconditional
 * behavior (every eligible entry counts) remain unchanged.
 */
function shadowProjectScope(entries) {
  const projectEntries = entries.filter((entry) => entry.scope === "project");
  return projectEntries.length > 0 ? projectEntries : entries;
}

function installedPipelineIdentityClaude(payload, knownMarketplaces, cwd) {
  if (!Array.isArray(payload)) return null;
  const eligible = (entry) =>
    [PLUGIN_ID, LOCAL_PLUGIN_ID].includes(entry?.id)
    && entry?.enabled === true
    && typeof entry?.version === "string"
    && entry.version.trim() !== ""
    // A "project"-scope entry can only ever conflict with THIS session when it belongs to
    // the running project -- an enabled project-scope entry for an unrelated project on the
    // same host must never count toward this session's ambiguity check. Every other scope
    // ("user", "local", or the field absent) keeps its unconditional eligibility unchanged.
    && (entry?.scope !== "project"
      || (typeof entry?.projectPath === "string" && resolve(entry.projectPath) === resolve(cwd)));
  const localMatches = shadowProjectScope(payload.filter((entry) => eligible(entry) && entry.id === LOCAL_PLUGIN_ID));
  const officialMatches = shadowProjectScope(payload.filter((entry) => eligible(entry) && entry.id === PLUGIN_ID));
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
  cwd = process.cwd(),
) {
  let payload;
  try {
    payload = JSON.parse(pluginList());
  } catch {
    return null;
  }
  return runner === "claude"
    ? installedPipelineIdentityClaude(payload, knownMarketplaces, cwd)
    : installedPipelineIdentityCodex(payload);
}

export function installedPipelineVersion(pluginList = () => readInstalledPluginList("codex"), runner = "codex") {
  return installedPipelineIdentity(pluginList, runner)?.version ?? null;
}

export function observePipelineStartPreflight({
  env = process.env,
  pluginList,
  read = readFileSync,
  scriptUrl = import.meta.url,
  cwd = process.cwd(),
  knownMarketplaces = readClaudeKnownMarketplaces,
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
  const installedIdentity = installedPipelineIdentity(resolvedPluginList, runner, knownMarketplaces, cwd);
  const installedVersion = installedIdentity?.version ?? null;
  const ticket = Object.prototype.hasOwnProperty.call(env, "PIPELINE_CODEX_ONBOARDING_TICKET_ID")
    && String(env.PIPELINE_CODEX_ONBOARDING_TICKET_ID) !== "";
  const token = Object.prototype.hasOwnProperty.call(env, "PIPELINE_CODEX_ONBOARDING_TOKEN")
    && String(env.PIPELINE_CODEX_ONBOARDING_TOKEN) !== "";
  const wsl = [env.WSL_DISTRO_NAME, env.WSL_INTEROP]
    .some((value) => typeof value === "string" && value.trim() !== "");
  const executionBoundary = wsl ? "host-authorized-wsl" : "default";
  const status = !version
    ? "plugin-identity-unavailable"
    : installedIdentity?.ambiguous === true || installedVersion !== null && installedVersion !== version
      ? "plugin-refresh-required"
      : "ready";
  const result = {
    schema: SCHEMA,
    status,
    statusScope: STATUS_SCOPE,
    version,
    installedVersion,
    installedSource: installedIdentity?.source ?? "unknown",
    executionBoundary,
    pluginRoot,
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

export const SCRATCH_LIFECYCLE_SCHEMA = "pipeline.bootstrap-scratch-lifecycle.v1";

/**
 * The scratch-descriptor lifecycle's two BOOTSTRAP events, in the order the backlog item
 * (2026-08-08-the-scratch-cleanup-mechanism-exists-but-no-event-calls-it.md) requires after
 * the PO's correction: sweep the PREVIOUS session's orphans first, then bind this session's
 * own directory. Neither event is the close — a close is the least reliable moment to
 * schedule cleanup, because the sessions whose scratch directories most need collecting are
 * exactly the ones that ended abruptly and never reached one. Correctness therefore comes
 * from the sweep alone, and `releaseScratchDescriptor` stays a fast path nothing depends on.
 *
 * The sweep is descriptor-bound, never a wholesale clear: `retireOrphanScratchDescriptors`
 * removes only the exact directory a verified-dead session's own descriptor claims, re-reading
 * and re-validating each descriptor immediately before deleting. A bootstrap runs against a
 * tree whose other contents it did not create, so that binding matters more here, not less.
 *
 * FAIL-OPEN, ALWAYS. This is housekeeping attached to the bootstrap, never a gate on it: any
 * fault is recorded as a typed code and the bootstrap continues. Faults carry the library's
 * own `WT-*` codes only — never a message or a path, which is what would leak a machine-local
 * directory layout into a bootstrap log.
 *
 * SESSION IDENTITY: binding needs a stable per-session id and the preflight has no session
 * identity of its own (it reads no hook stdin, where `session_id` is delivered). A caller
 * that knows its own id supplies it via `PIPELINE_SCRATCH_SESSION_ID`; without one this
 * reports `unbound-no-session-identity` and performs the sweep only. Inventing an id per
 * invocation is deliberately NOT done — it would mint a fresh descriptor on every bootstrap
 * that no later sweep could ever match to a dead process, which is the unbounded growth this
 * whole mechanism exists to stop.
 *
 * NO PRE-EXISTING scratch/, NO SWEEP. Both `retireOrphanScratchDescriptors` and
 * `bindScratchDescriptor` resolve their scratch root via `physicalScratchRoot`, which
 * `mkdirSync`s `scratch/` unconditionally — including in a project where it never existed. A
 * consumer project's `.gitignore` predating onboarding does not ignore `scratch/`, so that
 * unconditional create dirties the tree on the very first bootstrap and can trip
 * `security-scan.mjs`'s dirty-tree refusal. Nothing can be bound to sweep if `scratch/` never
 * existed, so checking existence FIRST and skipping the whole lifecycle when it is absent loses
 * nothing: it only reaches (2) whether `rootDir` itself resolves at all, which the existing
 * fail-open path below still handles unchanged.
 */
export function runBootstrapScratchLifecycle({
  rootDir = process.cwd(),
  env = process.env,
  deps = {},
} = {}) {
  if (existsSync(rootDir) && !existsSync(resolve(rootDir, "scratch"))) {
    return {
      schema: SCRATCH_LIFECYCLE_SCHEMA,
      sweep: null,
      binding: { status: "skipped-no-scratch-directory" },
      faults: [],
    };
  }
  const faults = [];
  const faultCode = (error) => String(error?.code ?? "unknown");
  let sweep = null;
  try {
    const retired = retireOrphanScratchDescriptors({ rootDir, deps });
    sweep = { retiredCount: retired.retiredCount, retainedCount: retired.retained.length };
  } catch (error) {
    faults.push(`sweep:${faultCode(error)}`);
  }
  const sessionId = typeof env.PIPELINE_SCRATCH_SESSION_ID === "string" && env.PIPELINE_SCRATCH_SESSION_ID !== ""
    ? env.PIPELINE_SCRATCH_SESSION_ID
    : null;
  let binding = { status: "unbound-no-session-identity" };
  if (sessionId !== null) {
    try {
      const bound = bindScratchDescriptor({ rootDir, sessionId, deps });
      binding = { status: bound.status, scratchRelativePath: bound.scratchRelativePath };
    } catch (error) {
      binding = { status: "unavailable" };
      faults.push(`bind:${faultCode(error)}`);
    }
  }
  return { schema: SCRATCH_LIFECYCLE_SCHEMA, sweep, binding, faults };
}

export function main() {
  const result = observePipelineStartPreflight();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  // Deliberately on stderr and deliberately NOT a field of the typed preflight result:
  // stdout is a parsed `pipeline.start-preflight.v1` envelope under a measured payload
  // budget, so the housekeeping receipt travels beside it rather than inside it.
  try {
    process.stderr.write(`${JSON.stringify(runBootstrapScratchLifecycle())}\n`);
  } catch {
    // Housekeeping never decides a bootstrap's exit code.
  }
  return pipelineStartPreflightExitCode(result);
}

if (isDirectInvocation(import.meta.url)) process.exitCode = main();
