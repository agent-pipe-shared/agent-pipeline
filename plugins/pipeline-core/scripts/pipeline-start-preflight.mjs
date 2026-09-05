#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Report loaded distribution identity and restart-handoff presence without secrets. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { measureBootstrapPayload } from "../lib/bootstrap-payload-budget.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
// NVA-K-DRIVERREACH (backlog: 2026-08-28-the-guided-driver-is-neither-discoverable-nor-
// runnable.md): the same typed readiness check the readiness guard itself uses
// (guard-lifecycle-ready.mjs), reused here read-only to decide whether THIS bootstrap's
// `nextAction` should point a not-yet-onboarded project at the guided driver instead of the
// bare `inspect` -- never to re-implement or duplicate that guard's own logic.
import {
  ProjectOnboardingReadyError,
  requireProjectOnboardingReady,
} from "../lib/project-onboarding-ready-gate.mjs";
import { observeCodexPublicCoreIdentity, observePublicCoreIdentity } from "../lib/public-core-observation.mjs";
import { RULESET_SOURCE_SCHEMA } from "../lib/ruleset-source.mjs";
import { parseYaml } from "../lib/yaml-lite.mjs";
import {
  evaluateSelfApplicationAttestation,
  pluginRootHasSelfApplicationGit,
} from "../lib/self-application-attestation-gate.mjs";
import {
  bindScratchDescriptor,
  retireOrphanScratchDescriptors,
  retireOrphanWorktreeDirectories,
  retireRegisteredWorktrees,
} from "../lib/session-cleanup-recovery.mjs";
import {
  inspectSessionOwnerRuntime,
  listActiveSessionDescriptors,
} from "../lib/worktree-lifecycle.mjs";
import { planInstall } from "./pre-push-hook-install.mjs";
import { WSL_FRESHNESS_BOUNDARY_ID } from "./ruleset-freshness.mjs";

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
export const CONCURRENT_SESSION_WARNING_SCHEMA = "pipeline.concurrent-session-warning.v1";
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
  const executable = runner === "claude" ? "claude" : runner === "antigravity" ? "agy" : "codex";
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

/**
 * Codex's `plugin list --json` entry carries its own `source`/`marketplaceSource`
 * fields (unlike Claude's, which has no such fields and needs the host's separate
 * `known_marketplaces.json` registry instead -- see `claudeLocalDevelopmentAttested`),
 * so attestation here is a pure function of the candidate entry itself: both its
 * `marketplaceSource` and `source` report "local", and the entry's own installed
 * path resolves under that exact local marketplace root. Extracted so the
 * precedence check below can attest a LOCAL candidate before a match is chosen.
 */
function codexExactLocalSource(entry) {
  return entry?.marketplaceSource?.sourceType === "local"
    && typeof entry.marketplaceSource.source === "string"
    && isAbsolute(entry.marketplaceSource.source)
    && resolve(entry.marketplaceSource.source) === entry.marketplaceSource.source
    && entry?.source?.source === "local"
    && typeof entry.source.path === "string"
    && isAbsolute(entry.source.path)
    && resolve(entry.source.path) === entry.source.path
    && resolve(entry.marketplaceSource.source, "plugins", "pipeline-core") === entry.source.path;
}

/**
 * NVA-PLUGIN-PRECEDENCE: the Codex mirror of the Claude precedence rule
 * (`claudeAttestedLocalWinsOverOfficial`'s comment carries the full reasoning --
 * an attested local-development install is an explicit, machine-local act of
 * intent that outranks a released install of the SAME repository). Same shape,
 * same restriction -- exactly one eligible local entry, exactly one eligible
 * official entry, and the local entry itself attested -- only the attestation
 * SOURCE differs (the entry's own fields here, the host registry there), because
 * that is the only place the two runners' `plugin list --json` payloads diverge.
 * It does NOT collapse two entries of the SAME class: those stay ambiguous via
 * the check that follows, unchanged.
 */
function codexAttestedLocalWinsOverOfficial(localMatches, officialMatches) {
  return localMatches.length === 1
    && officialMatches.length === 1
    && codexExactLocalSource(localMatches[0]);
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
  if (codexAttestedLocalWinsOverOfficial(localMatches, officialMatches)) {
    return { version: localMatches[0].version, source: "local-development" };
  }
  if (localMatches.length + officialMatches.length > 1) {
    return { version: null, source: "unknown", ambiguous: true };
  }
  if (localMatches.length + officialMatches.length !== 1) return null;
  const matches = localMatches.length === 1 ? localMatches : officialMatches;
  const entry = matches[0];
  const exactLocalSource = codexExactLocalSource(entry);
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

/**
 * NVA-PLUGIN-PRECEDENCE (2026-08-16): the repository declares THAT it is governed;
 * the machine decides WHICH build provides it. An attested local-development
 * install (`claudeLocalDevelopmentAttested`) is an explicit, machine-local act of
 * intent -- someone built and registered this exact plugin tree on THIS machine --
 * and that act of intent outranks a released install of the SAME repository, so
 * the pair resolves rather than failing closed. This deliberately does NOT
 * extend to: an UNATTESTED local id (no proven intent, so the unconditional
 * ambiguity/fallthrough below still applies to it exactly as before this change),
 * or two entries of the SAME class (two eligible local entries, or two eligible
 * official entries, are a genuine registry duplicate, not an expression of
 * intent, and still fail closed as ambiguous via the check that follows).
 */
function claudeAttestedLocalWinsOverOfficial(localMatches, officialMatches, knownMarketplaces) {
  return localMatches.length === 1
    && officialMatches.length === 1
    && claudeLocalDevelopmentAttested(localMatches[0], knownMarketplaces);
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
  if (claudeAttestedLocalWinsOverOfficial(localMatches, officialMatches, knownMarketplaces)) {
    return { version: localMatches[0].version, source: "local-development" };
  }
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

/**
 * The ONE place this file resolves "what version is this loaded plugin
 * distribution" -- reads the plugin's own manifest file directly
 * (`.claude-plugin/plugin.json` for the Claude runner, `.codex-plugin/plugin.json`
 * for every other runner, Antigravity included: it ships no manifest of its
 * own and is observed through the Codex-shaped one exactly like Codex itself).
 * `observePipelineStartPreflight` uses this for its own `version` field below;
 * `antigravity-start-hint.mjs` imports it directly for the SAME resolution
 * rather than re-deriving a second one (NVA-ARMEDPROOF-1) -- a lock's
 * recorded version must trace to this exact function, or a drift between two
 * independently-written manifest readers could silently un-bind the proof
 * from the build it is supposed to name.
 */
export function resolvePluginManifestVersion(pluginRoot, runner, read = readFileSync) {
  const manifestRelativePath = runner === "claude" ? ".claude-plugin/plugin.json" : ".codex-plugin/plugin.json";
  try {
    const manifest = JSON.parse(read(resolve(pluginRoot, manifestRelativePath), "utf8"));
    return typeof manifest?.version === "string" && manifest.version.trim() !== "" ? manifest.version : null;
  } catch {
    return null;
  }
}

export const ANTIGRAVITY_HARD_ENFORCEMENT_SCHEMA = "pipeline.antigravity-hard-enforcement-observation.v1";
// NVA-ARMEDPROOF-1: the fail-closed status `observePipelineStartPreflight` reports
// (instead of "ready") when the runner is Antigravity and the hard-enforcement
// layer was not observed this session -- see the `status` computation there.
export const ANTIGRAVITY_HARD_ENFORCEMENT_NOT_OBSERVED_STATUS = "antigravity-hard-enforcement-not-observed";
// 30 minutes: generous enough to absorb a slow session start (network calls, a
// subagent dispatch chain, IDE/daemon warm-up) between the hook's own write and
// this preflight running, while still being short enough that a lock left over
// from an earlier, genuinely different session -- hours or days old -- reads as
// stale rather than as evidence about the CURRENT one. See
// observeAntigravityHardEnforcement's own doc comment for why a window is the
// accepted substitute for an exact session match here.
export const ANTIGRAVITY_HARD_ENFORCEMENT_FRESH_WINDOW_MS = 30 * 60 * 1000;
const ANTIGRAVITY_HARD_ENFORCEMENT_WARNING =
  "pipeline-core: the Antigravity hard-enforcement layer (PreToolUse guard union) appears NOT " +
  "to have fired this session -- no freshly written session bootstrap lock was found under " +
  ".git/agent-pipeline/run/. This usually means the Antigravity CLI daemon could not resolve " +
  "`node` on its $PATH, so no hook process ever started this session. See GEMINI.md's " +
  "Prerequisites section for the known cause and workaround. This is observability only: it " +
  "does not and cannot make the enforcement layer fire.";

/**
 * Detects -- never fixes -- whether `antigravity-start-hint.mjs` (the
 * Antigravity `PreInvocation` hard-enforcement hook) fired at least once this
 * session, by looking for a freshly written session bootstrap lock under
 * `.git/agent-pipeline/run/session-<id>/requires-bootstrap.lock` -- the exact
 * literal path that hook writes inside its try block on every successful
 * firing (see its own source; `antigravity-pretool-guard.mjs`'s mandatory-
 * bootstrap hard block reads the identical path). backlog item
 * 2026-08-23-antigravity-hard-enforcement-layer-has-two-fail-open-paths.md,
 * "Candidate future direction": if the Antigravity daemon can never resolve
 * `node` on its `$PATH`, no hook process starts at all, so nothing inside a
 * hook can ever detect the gap -- this check runs from the bootstrap path
 * instead, which still executes even when every hook is inert.
 *
 * ANTIGRAVITY ONLY, BY DESIGN: the daemon/node-PATH fail-open this observes
 * is specific to that runner's background-daemon architecture (GEMINI.md
 * Prerequisites). Claude and Codex have no such daemon and no such gap --
 * the caller must gate the call itself on `runner === "antigravity"` rather
 * than relying on this function to no-op for other runners, so a Claude/Codex
 * bootstrap never even reaches this code path.
 *
 * SESSION IDENTITY GAP (deliberate, disclosed -- see
 * `runBootstrapScratchLifecycle`'s own doc comment above for the identical
 * limitation in a sibling mechanism): this preflight has no session id of its
 * own. A plain CLI bootstrap invocation reads no hook stdin, which is the only
 * place a session id is ever delivered here, so reliably matching "this exact
 * session's" lock file is not constructible from this call site. The accepted,
 * disclosed substitute is a freshness-window heuristic scanning EVERY
 * `session-<id>/requires-bootstrap.lock` under the run directory and taking the
 * single freshest mtime: within `freshWindowMs` of `now` counts as observed;
 * older (or absent entirely) reads exactly like "never fired," because a stale
 * lock from a different, already-ended session is not evidence about this one.
 *
 * FAIL-OPEN, NEVER THROWS: a detector ABOUT enforcement inertness that itself
 * crashes bootstrap would be strictly worse than the silent gap it exists to
 * surface. Every filesystem read here is wrapped so any unexpected failure
 * (run directory absent, unreadable, a raced/partial entry, a permissions
 * error) folds into "not observed" -- the same outcome a genuine absence
 * produces -- rather than propagating.
 *
 * VERSION BINDING (NVA-ARMEDPROOF-1): freshness alone is not proof. A lock
 * left behind by a plugin build that was since uninstalled or upgraded would
 * otherwise keep vouching for guards that are no longer installed -- the
 * proof must be bound to the exact build it proves, not merely to a recent
 * point in time. Every candidate lock's own recorded `version` must equal
 * `currentVersion` (the caller's already-resolved build version -- see
 * `resolvePluginManifestVersion`, reused here rather than re-derived) or it
 * is treated exactly like an absent lock: it never contributes to
 * `freshestAgeMs`, and the scan continues to other session entries. A lock
 * with no version field at all (written by a pre-binding build) or
 * unparseable content matches nothing, by the same rule. This is an
 * ADDITIONAL necessary condition alongside the freshness window above,
 * never a replacement for it.
 *
 * FAIL-OPEN SCOPE IS UNCHANGED BY THE ABOVE: "never throws" describes this
 * function's own robustness only. What changed with version binding is the
 * CONSEQUENCE a caller attaches to `observed: false`
 * (`observePipelineStartPreflight`'s `status` computation is now fail-closed
 * for it) -- the observer itself still folds every failure (a bad read, a
 * malformed lock, an absent or mismatched version) into the same
 * `observed: false` it already produced for "never fired at all".
 */
export function observeAntigravityHardEnforcement({
  rootDir = process.cwd(),
  now = Date.now(),
  freshWindowMs = ANTIGRAVITY_HARD_ENFORCEMENT_FRESH_WINDOW_MS,
  readdir = readdirSync,
  stat = statSync,
  read = readFileSync,
  currentVersion = null,
} = {}) {
  let freshestAgeMs = null;
  try {
    const runDir = resolve(rootDir, ".git", "agent-pipeline", "run");
    const entries = readdir(runDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry?.isDirectory?.() || !entry.name.startsWith("session-")) continue;
      try {
        const lockPath = resolve(runDir, entry.name, "requires-bootstrap.lock");
        const info = stat(lockPath);
        if (!info.isFile()) continue;
        const ageMs = now - info.mtimeMs;
        // A future mtime (clock skew, a corrupted filesystem) is never trusted
        // as evidence of freshness -- treated the same as no usable entry.
        if (ageMs < 0) continue;
        // Version binding: an entry whose lock does not name the CURRENT
        // build is skipped exactly like an absent lock (see doc comment
        // above) -- never counted towards `freshestAgeMs`.
        if (!lockVersionMatches(read, lockPath, currentVersion)) continue;
        if (freshestAgeMs === null || ageMs < freshestAgeMs) freshestAgeMs = ageMs;
      } catch {
        continue; // this one entry raced away or is unreadable; keep scanning the rest
      }
    }
  } catch {
    freshestAgeMs = null; // run directory absent, unreadable, or any other scan failure
  }
  const observed = freshestAgeMs !== null && freshestAgeMs <= freshWindowMs;
  return {
    schema: ANTIGRAVITY_HARD_ENFORCEMENT_SCHEMA,
    observed,
    freshWindowMs,
    warning: observed ? null : ANTIGRAVITY_HARD_ENFORCEMENT_WARNING,
  };
}

/**
 * A lock's recorded version must equal `currentVersion` exactly. Fail-closed
 * throughout: a mismatch, a missing version field, unparseable content, or a
 * `currentVersion` that is itself not a real non-empty string (the caller
 * could not resolve its own build's version, so there is nothing to bind a
 * lock to) all resolve to "does not match" -- never to "matches", and never
 * by throwing.
 */
function lockVersionMatches(read, lockPath, currentVersion) {
  if (typeof currentVersion !== "string" || currentVersion.trim() === "") return false;
  try {
    const parsed = JSON.parse(read(lockPath, "utf8"));
    const recordedVersion = parsed?.version;
    return typeof recordedVersion === "string" && recordedVersion.trim() !== "" && recordedVersion === currentVersion;
  } catch {
    return false; // older-build plain-text body, or any unreadable/malformed content
  }
}

export const PRE_PUSH_HOOK_OBSERVATION_SCHEMA = "pipeline.pre-push-hook-observation.v1";
/**
 * NVA-PREPUSHVISIBLE-1 (2026-08-27, corrects NVA-PREPUSHOBSERVE-1's original design): the
 * `pre-push` git hook is an OFFER, not a requirement -- the PO decided it is opt-in and
 * escapable by design. A live bootstrap against a real repository under the ORIGINAL
 * (pre-correction) design reported the session non-ready and unworkable purely because the
 * hook was not installed, which was wrong. No state `observePrePushHookInstallation` returns
 * (absent, declined, present-but-not-ours-or-modified, or installed-and-current) gates
 * readiness any more -- every one of them is carried in the result purely as an advisory
 * observation. The `PRE_PUSH_HOOK_NOT_INSTALLED_STATUS` constant this comment used to
 * document was removed along with the branch that produced it (see the `status` computation
 * in `observePipelineStartPreflight`) rather than left exported-but-unreachable dead code --
 * nothing in this codebase still imports or checks for that status string.
 */

// This installer script's own absolute, on-disk location -- resolved once, from THIS exact
// plugin copy, never a repo-relative guess (DoD (c)). pre-push-hook-install.mjs is a fixed
// sibling of this file (both live directly under plugins/pipeline-core/scripts/).
const PRE_PUSH_HOOK_INSTALLER_SCRIPT_PATH = fileURLToPath(new URL("./pre-push-hook-install.mjs", import.meta.url));

/** The exact command a human or agent runs to install the hook -- the installer's own
 * documented `--install` verb (pre-push-hook-install.mjs's CLI surface), resolved against the
 * repository actually being inspected. Never a hand-written shell line. */
function prePushHookInstallCommand(rootDir) {
  return {
    kind: "command",
    executable: "node",
    argv: [PRE_PUSH_HOOK_INSTALLER_SCRIPT_PATH, "--install"],
    cwd: resolve(rootDir),
    mutation: true,
    requiresConfirmation: false,
  };
}

/**
 * Detects -- never fixes, never installs -- whether `pre-push-hook-install.mjs`'s generated
 * `pre-push` git hook is installed for `rootDir`'s repository and still matches what that
 * installer's own marker recorded, using ONLY that installer's existing read-only
 * `planInstall` surface (never a second, duplicated read of the hook/marker files itself).
 *
 * STATES `planInstall` ACTUALLY DISTINGUISHES, and how they map here (DoD (a) "state in your
 * report which states you found and which you surfaced"):
 *   - "ready-to-upgrade" (hook present, belongs to this installer, its content sha256 still
 *     matches the marker's recorded hash) -> "installed-and-current".
 *   - "ready" (no hook file exists at all yet) -> "absent".
 *   - "declined" (a human declined the onboarding offer and no hook was ever installed since
 *     -- pre-push-hook-install.mjs's own decline marker) -> "declined", carrying `declinedAt`
 *     so a session can see the choice was made and when. NVA-PREPUSHVISIBLE-1: a decline is
 *     an ANSWERED question, not an open defect -- it never gates readiness, exactly like
 *     every other state this function returns (see `observePipelineStartPreflight`'s `status`
 *     computation). `planInstall` checks hook-presence before the decline marker, so this
 *     branch is only ever reached when no hook is actually on disk -- an install after a
 *     decline is not a permanent refusal (pre-push-hook-install.mjs's own contract) and
 *     reports "installed-and-current" via the branch above, exactly like any other install.
 *   - "foreign-hook-present" (a hook exists but there is no marker for it, the marker is
 *     unreadable/unparseable, or the hook's content no longer matches the marker's recorded
 *     hash) -> "present-but-not-ours-or-modified". `readMarker` (pre-push-hook-install.mjs)
 *     already folds an unreadable marker AND a malformed marker into "no marker" -- both
 *     degenerate inputs surface through this exact same branch, not a separate one.
 *   - "repository-unresolved" (no git directory resolvable at all, e.g. `rootDir` is not a
 *     git repository) -> "repository-unresolved", surfaced here as ITS OWN state rather than
 *     folded into "absent": no repository exists to hold a hook, so nothing about push
 *     enforcement was actually determined (unlike "absent", which IS a determination).
 *
 * NEVER GATES READINESS (NVA-PREPUSHVISIBLE-1): the hook is an offer, not a requirement --
 * every state this function returns is carried by `observePipelineStartPreflight` as a purely
 * advisory observation and never changes `status`/exit code. See that function's own wiring
 * comment.
 *
 * NEVER THROWS: an unexpected exception from `planInstallFn` (never observed from the real,
 * documented-read-only `planInstall`, but guarded here anyway) folds into
 * "repository-unresolved" -- the same "nothing was determined" outcome a genuine absence of a
 * repository already produces, never a crash. NEVER MUTATES OR INSTALLS ANYTHING: this
 * function only reads, via `planInstall`'s own read-only surface.
 */
export function observePrePushHookInstallation({ rootDir = process.cwd(), planInstallFn = planInstall } = {}) {
  let plan;
  try {
    plan = planInstallFn({ rootDir });
  } catch {
    plan = null;
  }
  if (!plan || plan.status === "repository-unresolved") {
    return { schema: PRE_PUSH_HOOK_OBSERVATION_SCHEMA, state: "repository-unresolved", installed: false, installCommand: null };
  }
  if (plan.status === "ready-to-upgrade") {
    return { schema: PRE_PUSH_HOOK_OBSERVATION_SCHEMA, state: "installed-and-current", installed: true, installCommand: null };
  }
  if (plan.status === "foreign-hook-present") {
    return {
      schema: PRE_PUSH_HOOK_OBSERVATION_SCHEMA,
      state: "present-but-not-ours-or-modified",
      installed: false,
      detail: plan.detail ?? null,
      installCommand: prePushHookInstallCommand(rootDir),
    };
  }
  if (plan.status === "declined") {
    return {
      schema: PRE_PUSH_HOOK_OBSERVATION_SCHEMA,
      state: "declined",
      installed: false,
      declinedAt: plan.declinedAt,
      installCommand: prePushHookInstallCommand(rootDir),
    };
  }
  // plan.status === "ready": the hook path does not exist yet.
  return {
    schema: PRE_PUSH_HOOK_OBSERVATION_SCHEMA,
    state: "absent",
    installed: false,
    installCommand: prePushHookInstallCommand(rootDir),
  };
}

export const PRE_PUSH_HOOK_UNSEEN_REMOTE_PUSH_SCHEMA = "pipeline.pre-push-hook-unseen-remote-push.v1";

/**
 * NVA-PREPUSHVISIBLE-1 (c): a push the installed hook never evaluated becomes visible by
 * comparing the current branch's remote-tracking ref (`@{u}`) against the hook's own durable
 * per-push record (`<git-common-dir>/agent-pipeline/pre-push-hook/log.jsonl`, appended by
 * every push the INSTALLED hook actually evaluates -- see pre-push-hook-install.mjs's
 * `renderImpl`/`recordLog`). A remote-tracking ref whose commit has no matching `commit`
 * field anywhere in that log is what a push the hook never saw looks like from here.
 *
 * CAREFUL AND HONEST BY DESIGN, NOT ACCUSATORY: the exact same absence is produced by (1) a
 * human operator's `git push --no-verify`, (2) a perfectly legitimate push made from another
 * clone or another machine that never had this hook installed, and (3) any push made before
 * this hook was ever installed here at all. This function reports what it observed --
 * "unseen" -- never what someone did; the caller/report layer is responsible for keeping that
 * distinction in its own wording (see this task's briefing).
 *
 * NEVER GATES READINESS: like every other pre-push-hook observation (NVA-PREPUSHVISIBLE-1),
 * this is evidence for a human, not a gate -- `observePipelineStartPreflight` carries it in
 * the result and never lets it change `status` or the exit code.
 *
 * "NOT-CHECKED" IS THE FAIL-OPEN DEFAULT for every case this function cannot positively
 * resolve: no remote-tracking ref configured for the current branch (never on a branch, no
 * upstream set), no git-common-dir resolvable at all, or no log file present yet (a
 * repository that never had the hook installed has nothing to compare against). None of these
 * are reported as "unseen" -- a repository with no log at all must never be reported as if
 * every one of its pushes bypassed something that was never there to bypass in the first
 * place. A malformed individual log LINE is skipped and never invalidates the rest of the
 * log, mirroring `parseRefUpdates`'s own "ignored, never fabricated" discipline.
 *
 * NEVER THROWS, NEVER MUTATES: every git/file operation is wrapped; any unexpected failure
 * folds into "not-checked", the same outcome a genuine absence already produces.
 */
export function observeUnseenPushToRemote({ rootDir = process.cwd() } = {}) {
  const notChecked = { schema: PRE_PUSH_HOOK_UNSEEN_REMOTE_PUSH_SCHEMA, state: "not-checked" };
  try {
    const run = (args) => {
      const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8", timeout: 10000 });
      return result.status === 0 && typeof result.stdout === "string" ? result.stdout.trim() : null;
    };
    const commonDir = run(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    if (!commonDir) return notChecked;
    const upstream = run(["rev-parse", "--symbolic-full-name", "@{u}"]);
    if (!upstream) return notChecked; // no branch, or no upstream configured
    const remoteCommit = run(["rev-parse", "@{u}"]);
    if (!remoteCommit) return notChecked;
    const logPath = resolve(commonDir, "agent-pipeline", "pre-push-hook", "log.jsonl");
    let raw;
    try {
      raw = readFileSync(logPath, "utf8");
    } catch {
      return notChecked; // no log at all -- nothing to compare against, never "unseen"
    }
    const seenCommits = new Set();
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);
        if (typeof entry?.commit === "string" && entry.commit !== "") seenCommits.add(entry.commit);
      } catch {
        continue; // one malformed line never invalidates the rest of the log
      }
    }
    return {
      schema: PRE_PUSH_HOOK_UNSEEN_REMOTE_PUSH_SCHEMA,
      state: seenCommits.has(remoteCommit) ? "seen" : "unseen",
      remoteRef: upstream,
      commit: remoteCommit,
    };
  } catch {
    return notChecked;
  }
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

/**
 * Best-effort, read-only scan for another LIVE session already registered
 * under the SAME physical repository root as `startPath` -- the cheap,
 * PO-requested mitigation for A-AC-01's ordering-ambiguity risk, which only
 * matters when two agent sessions genuinely operate concurrently in the same
 * local checkout (a different branch/worktree/clone resolves to a different
 * physical repository root and is out of scope here, already handled
 * elsewhere). This never fails/blocks bootstrap: every uncertain outcome --
 * no repository at `startPath`, no descriptors registered, a malformed
 * descriptor, any read error -- degrades to `null`, never a thrown error and
 * never a false positive.
 *
 * Only a REAL, currently-running owner process (`inspectSessionOwnerRuntime`
 * status "live") on a session other than `currentSessionId` counts. A
 * stale/orphaned descriptor ("not-live"/"reused") or an inconclusive read
 * ("unavailable"/"unobserved") is never treated as a positive warning --
 * exactly the false-positive class the PO explicitly does not want (a stale
 * descriptor or a human reading in a second terminal must never warn).
 *
 * The returned object exposes nothing beyond what `inspectSessionOwnerRuntime`
 * already exposes for that other session (sessionId, descriptorSha256,
 * status) -- no nonce, no PID, no process-start identity, no conversation
 * data (see that function's own docstring for the same guarantee).
 */
export function observeConcurrentSessionWarning({
  startPath,
  currentSessionId = null,
  listDescriptors = listActiveSessionDescriptors,
  inspectOwner = inspectSessionOwnerRuntime,
} = {}) {
  let descriptors;
  try {
    descriptors = listDescriptors(startPath);
  } catch {
    return null;
  }
  for (const descriptor of descriptors) {
    if (descriptor.sessionId === currentSessionId) continue;
    let owner;
    try {
      owner = inspectOwner(startPath, descriptor.sessionId, {
        expectedDescriptorSha256: descriptor.descriptorSha256,
      });
    } catch {
      continue;
    }
    if (owner.status === "live") {
      return {
        schema: CONCURRENT_SESSION_WARNING_SCHEMA,
        sessionId: owner.sessionId,
        descriptorSha256: owner.descriptorSha256,
        status: owner.status,
      };
    }
  }
  return null;
}

/**
 * The ONE shared "which runner is executing THIS process" resolution --
 * `scripts/project-onboarding-v3.mjs` imports this rather than carrying a second
 * copy of the same expression (backlog: a-po-ceremony-in-the-po-s-own-terminal-
 * resolves-the-wrong-runner.md). Deliberately distinct from "which runner is
 * this project for" (the `runner` parameter validated throughout
 * lib/project-onboarding-v3.mjs) -- see that module's own
 * OnboardingRunnerRequiredError comment for why an environment read was tried
 * and reverted INSIDE that library; this is the legitimate CLI/session entry
 * boundary that comment itself names.
 *
 * Three POSITIVE session signals, not two-plus-an-else-branch: CLAUDECODE=1 is
 * Claude Code's own marker; ANTIGRAVITY_AGENT=1 / AI_AGENT=antigravity is
 * Antigravity's; CODEX_SESSION_ID / CODEX_THREAD_ID (the same pair
 * native-hook-failure-memory.mjs and codex-onboarding-launch.mjs already treat
 * as Codex's own session identity) is now Codex's. Only when NONE of the three
 * fire is this genuinely a signal-less shell -- most concretely a PO's own
 * attended terminal, which is no runner at all and must never be guessed at by
 * elimination. In exactly that state, and only then, `rootDir`/`read` (when
 * supplied) are consulted for the project's OWN declared `runners.default` --
 * never overriding an actual runner's positive signal, which would otherwise
 * silently move a real Codex session onto the wrong lane in a dual-runner
 * repository whose default is Claude. Falls back to "codex" (the historical
 * default) when the repository declares nothing, or when no `rootDir`/`read`
 * was supplied at all -- which is the deliberate choice this file's own
 * preflight call below makes: `observePipelineStartPreflight` never reads
 * `pipeline.user.yaml` (see its STATUS_SCOPE comment / SETUPSTATUS-1), so its
 * own no-signal state stays exactly as it was before this change.
 */
export function resolveActiveRunner({ env = process.env, rootDir = null, read = readFileSync } = {}) {
  if (env.CLAUDECODE === "1") return "claude";
  if (env.ANTIGRAVITY_AGENT === "1" || env.AI_AGENT === "antigravity") return "antigravity";
  const hasCodexSessionSignal = ["CODEX_SESSION_ID", "CODEX_THREAD_ID"]
    .some((key) => typeof env[key] === "string" && env[key] !== "");
  if (hasCodexSessionSignal) return "codex";
  if (rootDir) {
    try {
      const parsed = parseYaml(read(resolve(rootDir, "pipeline.user.yaml"), "utf8"));
      if (typeof parsed?.runners?.default === "string" && parsed.runners.default !== "") {
        return parsed.runners.default;
      }
    } catch { /* absent/unreadable/unparseable source: fall through to the historical default */ }
  }
  return "codex";
}

export function observePipelineStartPreflight({
  env = process.env,
  pluginList,
  read = readFileSync,
  scriptUrl = import.meta.url,
  cwd = process.cwd(),
  knownMarketplaces = readClaudeKnownMarketplaces,
  observeAntigravityHardEnforcementFn = observeAntigravityHardEnforcement,
  observePrePushHookInstallationFn = observePrePushHookInstallation,
  observeUnseenPushToRemoteFn = observeUnseenPushToRemote,
  requireProjectOnboardingReadyFn = requireProjectOnboardingReady,
  observe,
  // PHX-WP-AAC01-MULTISESSION: identifies which already-registered session
  // descriptor (if any) is "this" call's own, so it is excluded from the
  // concurrent-session scan below. Undefined/null for every production
  // caller today (ordinary bootstrap does not yet register a descriptor of
  // its own -- see the module-level open-follow-up note at the bottom of
  // this file); callers that DO register one may pass its sessionId here.
  currentSessionId = null,
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
  const runner = resolveActiveRunner({ env, read });
  const version = resolvePluginManifestVersion(pluginRoot, runner, read);
  const resolvedPluginList = pluginList ?? (() => readInstalledPluginList(runner));
  const installedIdentity = installedPipelineIdentity(resolvedPluginList, runner, knownMarketplaces, cwd);
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
  // NVA-ARMEDPROOF-1: computed once, here, so both the `status` decision
  // below and the `antigravityHardEnforcement` field on the result (see the
  // `result` object further down) reuse the SAME observation -- never
  // invoked twice, and never invoked at all for a non-Antigravity runner
  // (observeAntigravityHardEnforcement's own "ANTIGRAVITY ONLY, BY DESIGN"
  // doc comment; proven by the "never invokes the Antigravity detector"
  // tests).
  const antigravityHardEnforcement = runner === "antigravity"
    ? observeAntigravityHardEnforcementFn({ rootDir: cwd, currentVersion: version })
    : null;
  // NVA-PREPUSHVISIBLE-1 (corrects NVA-PREPUSHOBSERVE-1): NOT runner-gated -- git hooks fire
  // in every runner alike -- so both of these are always computed. NEITHER ever gates
  // `status` below: the hook is an offer, not a requirement (see PRE_PUSH_HOOK_OBSERVATION_
  // SCHEMA's own doc comment above for the live-bootstrap incident that corrected this). Both
  // stay purely advisory fields on the result.
  const prePushHookObservation = observePrePushHookInstallationFn({ rootDir: cwd });
  const unseenRemotePush = observeUnseenPushToRemoteFn({ rootDir: cwd });
  const status = !version
    ? "plugin-identity-unavailable"
    : installedIdentity?.ambiguous === true || installedVersion !== null && installedVersion !== version || attestationFailed
      ? "plugin-refresh-required"
      // Fail-closed (NVA-ARMEDPROOF-1): a session whose Antigravity hard-
      // enforcement layer did not fire this session must never report
      // "ready" -- a plausible but actually-unenforced session is strictly
      // worse than one that visibly refuses to call itself ready. Checked
      // LAST, after the pre-existing non-ready reasons above, so a result
      // that is already non-ready for one of THOSE reasons keeps naming its
      // own reason rather than being masked by this one.
      : runner === "antigravity" && antigravityHardEnforcement.observed !== true
        ? ANTIGRAVITY_HARD_ENFORCEMENT_NOT_OBSERVED_STATUS
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
  // PHX-WP-AAC01-MULTISESSION: informational only. Computed unconditionally
  // (observeConcurrentSessionWarning never throws) and never influences
  // `status`/`nextAction`/any other field above -- see that function's own
  // docstring for the exact false-positive-avoidance contract.
  const concurrentSessionWarning = observeConcurrentSessionWarning({ startPath: cwd, currentSessionId });
  // NVA-K-DRIVERREACH: only asked when `status` (the PLUGIN/bootstrap-distribution
  // question above) is already "ready" -- this is exactly the branch that used to
  // unconditionally name the bare `inspect`, for a project that had not yet been
  // asked whether IT is ready. A project that already IS onboarding-ready keeps this
  // unchanged (falls through to the pre-existing `inspect` action below); only a
  // project this readily-observable check can affirmatively place at a non-ready
  // status gets pointed at the driver instead. Anything this check cannot cleanly
  // decide (an unresolvable root, a malformed observation, an invalid runner) falls
  // back to the pre-existing behaviour rather than guessing -- the same
  // fail-toward-the-status-quo posture every sibling observation in this file takes.
  let projectOnboardingNotReady = false;
  if (status === "ready") {
    try {
      requireProjectOnboardingReadyFn({ rootDir: cwd, intent: "bootstrap", runner });
    } catch (error) {
      projectOnboardingNotReady = error instanceof ProjectOnboardingReadyError
        && error.code === "PORG-NOT-READY";
    }
  }
  const result = {
    schema: SCHEMA,
    status,
    statusScope: STATUS_SCOPE,
    version,
    installedVersion,
    installedSource: installedIdentity?.source ?? "unknown",
    executionBoundary,
    pluginRoot,
    rulesetSource,
    handoff: ticket && token ? "ready" : ticket || token ? "malformed" : "none",
    concurrentSessionWarning,
    nextAction: status === "ready"
      ? projectOnboardingNotReady
        // NVA-K-DRIVERREACH: point discovery at the guided driver -- the one place this
        // skill already instructs an agent to execute the returned action verbatim, so
        // it is where an agent actually learns the driver exists and must be run.
        ? {
            kind: "command",
            executable: "node",
            argv: [
              resolve(pluginRoot, "scripts/onboarding-init.mjs"),
              "--root",
              resolve(cwd),
              "--runner",
              runner,
            ],
            mutation: false,
            requiresConfirmation: false,
            executionBoundary,
            expected: {
              schema: "pipeline.onboarding-init.v1",
            },
          }
        : {
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
    // Antigravity-only, and gated at the CALL itself (not merely at the field):
    // for Claude/Codex, observeAntigravityHardEnforcementFn is never invoked and
    // this key is absent from the envelope entirely, keeping their output
    // byte-identical to before this addition. Reuses the SAME observation the
    // `status` computation above already made -- see the comment there.
    ...(runner === "antigravity" ? { antigravityHardEnforcement } : {}),
    // Present for every runner alike (unlike the Antigravity field above) whenever the
    // observation actually determined something -- omitted only for "repository-unresolved"
    // so the envelope's key set stays exactly what it was before this addition for every
    // pre-existing caller whose `cwd` never resolves to a real repository (several of this
    // file's own pre-existing tests use exactly that fixture shape).
    ...(prePushHookObservation.state !== "repository-unresolved" ? { prePushHook: prePushHookObservation } : {}),
    // NVA-PREPUSHVISIBLE-1 (c): SAME omission condition as `prePushHook` immediately above,
    // deliberately reusing `prePushHookObservation`'s already-computed state rather than a
    // second one of `unseenRemotePush`'s own -- both observations resolve the identical
    // rootDir/cwd via `git rev-parse`, so an unresolvable repository folds both of them the
    // same way, and this keeps the envelope's key set unchanged for every pre-existing caller
    // whose `cwd` never resolves to a real repository (several of this file's own pre-existing
    // tests use exactly that fixture shape). "not-checked" for an otherwise-resolvable
    // repository (no upstream configured, or no log yet) stays fully visible -- it is itself
    // an informative outcome, unlike the unresolvable-repository case this omits. Purely
    // advisory either way: see `observeUnseenPushToRemote`'s own doc comment -- never gates
    // `status` or the exit code.
    ...(prePushHookObservation.state !== "repository-unresolved" ? { prePushHookUnseenRemotePush: unseenRemotePush } : {}),
  };
  return {
    ...result,
    // This measures the exact normal-bootstrap envelope emitted before the
    // self-describing receipt. The receipt is retained in the same typed
    // preflight readback; no cached or static skill-size surrogate is used.
    bootstrapPayload: normalBootstrapPayloadReceipt(result),
  };
}

// PHX-WP-AAC01-MULTISESSION -- OPEN FOLLOW-UP, documented honestly rather
// than silently left unaddressed: this file only reads already-registered
// session descriptors (`observeConcurrentSessionWarning`, above); it does
// NOT register one of its own for an ordinary Elephant/Claude/Codex
// bootstrap. `startSessionDescriptor` today has exactly one caller in the
// whole codebase (`codex-onboarding-capabilities.mjs`'s narrow onboarding
// capability probe, which registers and immediately retires within the same
// call -- it never leaves a lasting descriptor). Registering one here would
// require a real end-of-session retirement hook to avoid leaking an orphan
// descriptor per bootstrap; this preflight library file, invoked once at
// the START of bootstrap, has no such hook reachable from itself alone, and
// none was invented under time pressure (see this task's dispatch report).
// Net effect today: the warning field is real, wired, and exercised
// end-to-end by this task's own tests (which register descriptors directly
// via `startSessionDescriptor`), but stays structurally dormant in ordinary
// production use until a follow-up task adds (a) descriptor registration at
// a real bootstrap entry point and (b) its matching retirement at a real
// session-end hook.

export function pipelineStartPreflightExitCode(result) {
  // ANTIGRAVITY_HARD_ENFORCEMENT_NOT_OBSERVED_STATUS is deliberately absent from this
  // allowlist (NVA-ARMEDPROOF-1, fail-closed by omission): it falls through to the same
  // blocking exit code "plugin-identity-unavailable" already gets, with no separate case
  // needed here. The pre-push hook's own observation used to have an analogous non-ready
  // status here (NVA-PREPUSHOBSERVE-1's PRE_PUSH_HOOK_NOT_INSTALLED_STATUS); that status was
  // removed entirely, not merely omitted from this allowlist -- the hook is an offer, not a
  // requirement, and none of its states can produce a non-"ready" status any more
  // (NVA-PREPUSHVISIBLE-1; see PRE_PUSH_HOOK_OBSERVATION_SCHEMA's own doc comment above).
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

export const WORKTREE_SWEEP_SCHEMA = "pipeline.bootstrap-worktree-sweep.v1";

/**
 * A SEPARATE bootstrap event from `runBootstrapScratchLifecycle` above -- deliberately not
 * folded into that function or its `pipeline.bootstrap-scratch-lifecycle.v1` schema, so that
 * function's own pinned wiring tests (`pipeline-start-scratch-lifecycle.test.mjs`, asserting
 * exact `faults`/`sweep` shapes for the scratch-only lifecycle) stay unaffected by this
 * addition. Backlog: 2026-08-27-stale-worktree-directories-accumulate-with-no-sweep.md, whose
 * own Proposal names `retireOrphanScratchDescriptors`'s "sweep orphans on a later bootstrap"
 * shape as exactly what `.claude/worktrees/` needs -- this reuses that shape via the sibling
 * `retireOrphanWorktreeDirectories`, not a second, differently-designed sweeper.
 *
 * FAIL-OPEN, ALWAYS, identically to the scratch sweep: any fault is recorded as a typed code
 * and bootstrap continues. `retireOrphanWorktreeDirectories` never removes a directory git
 * still knows about (`git worktree list`) regardless of age, and never removes a directory
 * that does not carry a genuine worktree checkout's own `.git` pointer file -- see that
 * function's own doc comment in session-cleanup-recovery.mjs for the full safety predicate.
 *
 * NVA-B-WTLIVE-1: also runs `retireRegisteredWorktrees` -- the REGISTERED-worktree complement
 * (a worktree `git worktree list` still knows about, as opposed to the orphan-directory branch
 * above, which only ever considers one it no longer knows about at all). Wired in only once its
 * own fifth AC-2 condition (a liveness check against the worktree's own gitdir reflog) makes it
 * safe to run unattended: see session-cleanup-recovery.mjs's own doc comment on
 * `evaluateWorktreeCandidate`/`planRegisteredWorktreeRetirement` for the full five-condition
 * predicate and its evidence base. Combined into the SAME try/catch as the orphan branch above,
 * on purpose: a single fault from either branch must not mask or double-report against the
 * other, and the two branches' typed statuses are already namespaced by call site
 * (`retireOrphanWorktreeDirectories` / `retireRegisteredWorktrees`) inside their own `retained`
 * lists, so a combined fault code loses no diagnostic information a human would need.
 */
export function runBootstrapWorktreeSweep({ rootDir = process.cwd(), deps = {} } = {}) {
  const faultCode = (error) => String(error?.code ?? "unknown");
  try {
    const orphan = retireOrphanWorktreeDirectories({ rootDir, deps });
    const registered = retireRegisteredWorktrees({ rootDir, deps });
    return {
      schema: WORKTREE_SWEEP_SCHEMA,
      sweep: {
        retiredCount: orphan.retiredCount + registered.retiredCount,
        retainedCount: orphan.retained.length + registered.retained.length,
        orphan: { retiredCount: orphan.retiredCount, retainedCount: orphan.retained.length },
        registered: {
          retiredCount: registered.retiredCount,
          retainedCount: registered.retained.length,
          status: registered.status,
        },
      },
      faults: [],
    };
  } catch (error) {
    return {
      schema: WORKTREE_SWEEP_SCHEMA,
      sweep: null,
      faults: [`sweep:${faultCode(error)}`],
    };
  }
}

export function main() {
  const result = observePipelineStartPreflight();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  // Antigravity-only: the structured field above already carries this, but a
  // human watching the terminal reads stderr, not a JSON blob -- so the same
  // non-blocking warning is also printed here in plain text. Absent entirely
  // for Claude/Codex (the field itself is absent for them) and absent when
  // the hard-enforcement layer WAS observed this session (nothing to warn
  // about).
  if (result.antigravityHardEnforcement && result.antigravityHardEnforcement.observed === false) {
    try {
      process.stderr.write(`${result.antigravityHardEnforcement.warning}\n`);
    } catch {
      // stderr unavailable; the JSON field on stdout still carries the warning.
    }
  }
  // Deliberately on stderr and deliberately NOT a field of the typed preflight result:
  // stdout is a parsed `pipeline.start-preflight.v1` envelope under a measured payload
  // budget, so the housekeeping receipt travels beside it rather than inside it.
  try {
    process.stderr.write(`${JSON.stringify(runBootstrapScratchLifecycle())}\n`);
  } catch {
    // Housekeeping never decides a bootstrap's exit code.
  }
  // A second, independent housekeeping event (see runBootstrapWorktreeSweep's own doc
  // comment for why this is deliberately not folded into the scratch lifecycle above).
  // Wrapped the same way: never allowed to affect this function's return value.
  try {
    process.stderr.write(`${JSON.stringify(runBootstrapWorktreeSweep())}\n`);
  } catch {
    // Housekeeping never decides a bootstrap's exit code.
  }
  return pipelineStartPreflightExitCode(result);
}

if (isDirectInvocation(import.meta.url)) process.exitCode = main();
