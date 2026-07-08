#!/usr/bin/env node
/**
 * staleness-check — SessionStart hook: compares the installed pipeline-core plugin SHA
 * against the marketplace remote HEAD and surfaces a reminder/upgrade notice.
 *
 * Plugin: pipeline-core (Agent-Pipeline). Canon:
 * `harness/session-bootstrap.md` §3 (Verankerung) + §7 (SessionStart-hook OFFEN item).
 *
 * WHY THIS FILE EXISTS
 *   The bootstrap protocol (`harness/session-bootstrap.md`) needs to know whether the
 *   locally installed plugin is behind the canon repo BEFORE work starts. Doing that via
 *   a manual `git ls-remote` inside every session costs a turn; a SessionStart hook can
 *   supply the same evidence for free at session start (context line, or an upgrade
 *   notice) so bootstrap step 2 can consume it instead of re-running the check.
 *
 * FAIL-OPEN BY DESIGN (same philosophy as guard-git.mjs)
 *   This hook is strictly READ-ONLY and NEVER blocks the session: any error, offline
 *   state, network timeout, or malformed JSON anywhere in the chain (installed_plugins
 *   .json missing/corrupt, project settings.json missing/corrupt, unsupported marketplace
 *   source (neither github nor gitlab), git unavailable, ls-remote failing/hanging)
 *   silently degrades to the plain bootstrap context line and `process.exit(0)` - the hook
 *   never runs an update itself (re-entrancy) and never reports "stale" on a guess.
 *
 * RESOLUTION CHAIN
 *   1. `installed_plugins.json`: ALWAYS `path.join(os.homedir(), ".claude", "plugins",
 *      "installed_plugins.json")` - never a literal `~` (no shell expansion happens in
 *      Node, and both known machines are Windows). Entry lookup is keyed by
 *      `PLUGIN_ID` ("pipeline-core@agent-pipeline"); the installed_plugins.json schema
 *      (verified on the primary machine) maps that key to an ARRAY of
 *      per-scope install records - matched here by `projectPath` (normalized
 *      slashes/case for Windows), falling back to the sole entry when only one exists
 *      (single-project machine, or a user-scope install with no `projectPath` at all).
 *      Each matched record ALSO carries `scope` ("user" | "project") - resolved from the
 *      SAME matched entry as the SHA (`resolveInstalledScope`), never
 *      re-guessed independently, so the printed update command always matches the ACTUAL
 *      install this session is running under (the unscoped
 *      `claude plugin update` command defaults to `--scope user` server-side and fails
 *      with "not found" against the OTHER scope - hardcoding either one is wrong on the
 *      other machine/install shape).
 *   2. Marketplace URL: derived from the PROJECT's own committed `.claude/settings.json`
 *      -> `extraKnownMarketplaces.<name>.source` (name = the part of PLUGIN_ID after
 *      "@"). Supports `github` (-> `https://github.com/<repo>.git`) and `gitlab`
 *      (-> `https://<host>/<repo>.git`, `host` from an optional `source.host` field on
 *      the source object for self-hosted instances, else `gitlab.com` default). Never
 *      hardcoded - an unsupported source or a missing entry is treated as "cannot
 *      resolve" (fail-open).
 *   3. `git ls-remote <url> HEAD`, hard timeout `LS_REMOTE_TIMEOUT_MS` (8000 ms) - the
 *      only network call this hook ever makes.
 *   4. Verdict: SHA compared case-insensitively with a tolerant prefix match (7+ chars)
 *      so a short-SHA install record still compares correctly against ls-remote's full
 *      40-char SHA. On a STALE verdict, `buildPluginUpdateCommand` renders the scope-aware
 *      update command from step 1's resolved scope: `user` -> `--scope user`, `project` ->
 *      `--scope project`, unresolved (`null`/unknown) -> no scope flag, plus a hint to
 *      check the `scope` field in `installed_plugins.json` manually.
 *
 * TEST INJECTION SEAMS (module parameter injection - `staleness-check.test.mjs`)
 *   Every step above is a separate exported pure/near-pure function
 *   (`resolveInstalledEntry`, `resolveInstalledSha`, `resolveInstalledScope`,
 *   `resolveMarketplaceUrl`, `fetchRemoteSha`, `shaMatches`, `buildPluginUpdateCommand`,
 *   `decideOutput`) taking explicit parameters (paths, urls, command/args, timeout) -
 *   the test file imports and calls these directly with fixture data, never touching
 *   the real home directory, the real project settings, or the real network. `run()` is
 *   the only function that reads real environment (`os.homedir()`, `CLAUDE_PROJECT_DIR`)
 *   and calls `process.exit` - the test file additionally spawns THIS file as a real
 *   subprocess (env-var injection: `USERPROFILE`/`HOME` fakes homedir, `CLAUDE_PROJECT_DIR`
 *   fakes the project root) to assert the full CLI's exit code and stdout shape.
 *
 * OUTPUT CONTRACT (SessionStart hook JSON shape)
 *   - Fresh (SHAs match) or ANY unresolved/error step: plain text on stdout (one line),
 *     `process.exit(0)` - Claude Code adds a SessionStart hook's plain stdout to context
 *     automatically.
 *   - Stale (SHAs differ): JSON on stdout, `process.exit(0)` -
 *     `{ systemMessage: "<user-visible upgrade notice naming the 3 exact commands>",
 *        hookSpecificOutput: { hookEventName: "SessionStart",
 *                               additionalContext: "<installed-vs-remote SHA line>" } }`.
 *
 * MECHANICS: wired via `plugins/pipeline-core/hooks/hooks.json` (SessionStart, matcher
 * `startup|resume|clear`). No stdin contract is required (unlike PreToolUse hooks) -
 * SessionStart hooks receive session/env info Claude Code does not gate this check on.
 *
 * VERIFY: node plugins/pipeline-core/hooks/staleness-check.test.mjs
 * Manual smoke (from the repo root; always exits 0, stdout varies by machine state):
 *   node plugins/pipeline-core/hooks/staleness-check.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// ---- constants -----------------------------------------------------------------------
export const PLUGIN_ID = "pipeline-core@agent-pipeline";
export const BOOTSTRAP_LINE = "Agent-Pipeline: run /pipeline-core:pipeline-start before any work";
export const LS_REMOTE_TIMEOUT_MS = 8000;
export const CMD_MARKETPLACE_UPDATE = "claude plugin marketplace update agent-pipeline";
export const CMD_PLUGIN_UPDATE_BASE = "claude plugin update pipeline-core@agent-pipeline";
export const CMD_RELOAD = "/reload-plugins";

// ---- step 1: installed entry (fail-open: any read/parse/shape problem -> null) --------
/**
 * Resolve the matched install RECORD (not just the SHA) so SHA and scope always come from
 * the SAME entry - `resolveInstalledSha`/`resolveInstalledScope` below are thin accessors
 * over this one lookup, never a second independent guess.
 * @param {{installedPluginsPath: string, projectDir: string, pluginId?: string}} args
 * @returns {object|null}
 */
export function resolveInstalledEntry({ installedPluginsPath, projectDir, pluginId = PLUGIN_ID }) {
  let raw;
  try {
    raw = readFileSync(installedPluginsPath, "utf8");
  } catch {
    return null; // missing/unreadable file -> cannot determine, fail-open
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null; // malformed JSON -> fail-open
  }
  const entries = data?.plugins?.[pluginId];
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const norm = (p) => String(p ?? "").replace(/\\/g, "/").toLowerCase();
  const wantDir = norm(projectDir);
  const match = entries.find((e) => norm(e?.projectPath) === wantDir);
  return match ?? (entries.length === 1 ? entries[0] : null); // single-project/single-scope fallback
}

/**
 * @param {{installedPluginsPath: string, projectDir: string, pluginId?: string}} args
 * @returns {string|null}
 */
export function resolveInstalledSha({ installedPluginsPath, projectDir, pluginId = PLUGIN_ID }) {
  const entry = resolveInstalledEntry({ installedPluginsPath, projectDir, pluginId });
  const sha = entry?.gitCommitSha;
  return typeof sha === "string" && sha !== "" ? sha : null;
}

/**
 * Install scope of the matched record ("user" | "project"), or null when unresolvable.
 * Reuses `resolveInstalledEntry` so the scope is never a second guess independent of the
 * SHA lookup above.
 * @param {{installedPluginsPath: string, projectDir: string, pluginId?: string}} args
 * @returns {string|null}
 */
export function resolveInstalledScope({ installedPluginsPath, projectDir, pluginId = PLUGIN_ID }) {
  const entry = resolveInstalledEntry({ installedPluginsPath, projectDir, pluginId });
  const scope = entry?.scope;
  return typeof scope === "string" && scope !== "" ? scope : null;
}

/**
 * Scope-aware `claude plugin update` command:
 * the unscoped command defaults to `--scope user` server-side and fails with "not found"
 * against the OTHER scope - hardcoding either flag is wrong on the other install shape.
 * @param {string|null} scope - "user" | "project" | null/unknown (unresolved)
 * @returns {string}
 */
export function buildPluginUpdateCommand(scope) {
  if (scope === "user") return `${CMD_PLUGIN_UPDATE_BASE} --scope user`;
  if (scope === "project") return `${CMD_PLUGIN_UPDATE_BASE} --scope project`;
  return (
    `${CMD_PLUGIN_UPDATE_BASE} (scope unresolved - check the "scope" field in ` +
    `~/.claude/plugins/installed_plugins.json, then append --scope user or --scope project)`
  );
}

// ---- step 2: marketplace URL (fail-open: any read/parse/shape/unsupported-host -> null) ----
/**
 * Host-neutral: supports `github` and `gitlab` marketplace sources (both keyed on
 * `source.repo`, "owner/repo" shape). `gitlab` additionally honours an optional
 * `source.host` field (self-hosted GitLab instance base domain, no scheme/slashes),
 * defaulting to `gitlab.com` when absent. Any other/unknown `source.source` value, or a
 * missing/malformed entry, is treated as "cannot resolve" (fail-open, unchanged).
 * @param {{settingsPath: string, pluginId?: string}} args
 * @returns {string|null}
 */
export function resolveMarketplaceUrl({ settingsPath, pluginId = PLUGIN_ID }) {
  let raw;
  try {
    raw = readFileSync(settingsPath, "utf8");
  } catch {
    return null;
  }
  let settings;
  try {
    settings = JSON.parse(raw);
  } catch {
    return null;
  }
  const marketplaceName = pluginId.split("@")[1];
  if (!marketplaceName) return null;
  const source = settings?.extraKnownMarketplaces?.[marketplaceName]?.source;
  const hasRepo = typeof source?.repo === "string" && source.repo !== "";
  if (source?.source === "github" && hasRepo) {
    return `https://github.com/${source.repo}.git`;
  }
  if (source?.source === "gitlab" && hasRepo) {
    const host = typeof source.host === "string" && source.host !== "" ? source.host : "gitlab.com";
    return `https://${host}/${source.repo}.git`;
  }
  return null; // unsupported/unknown source, or the entry/field is absent -> cannot resolve
}

// ---- step 3: git ls-remote (fail-open: any spawn error/timeout/non-zero/malformed) ----
/**
 * @param {{url: string, timeoutMs?: number, command?: string, args?: string[]}} args
 * @returns {string|null}
 */
export function fetchRemoteSha({ url, timeoutMs = LS_REMOTE_TIMEOUT_MS, command = "git", args }) {
  const spawnArgs = args ?? ["ls-remote", url, "HEAD"];
  let res;
  try {
    res = spawnSync(command, spawnArgs, { encoding: "utf8", timeout: timeoutMs, windowsHide: true });
  } catch {
    return null;
  }
  // Success is exactly: exit 0, no signal (not killed by the timeout), no spawn error
  // (ENOENT etc.) - anything else (offline, timeout-kill, git missing) is fail-open.
  if (!res || res.error || res.signal || res.status !== 0) return null;
  const firstLine = (res.stdout ?? "").split(/\r?\n/).find((l) => l.trim() !== "");
  const sha = firstLine?.trim().split(/\s+/)[0];
  return sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha.toLowerCase() : null;
}

// ---- verdict logic (pure) --------------------------------------------------------------
/** Tolerant compare: exact match, or a 7+ char prefix relationship (short-SHA tolerant). */
export function shaMatches(installed, remote) {
  if (!installed || !remote) return false;
  const a = String(installed).toLowerCase();
  const b = String(remote).toLowerCase();
  if (a.length < 7 || b.length < 7) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

export function buildStaleMessage(installedSha, remoteSha, scope) {
  const short = (s) => String(s).slice(0, 12);
  return (
    `Agent-Pipeline plugin is stale (installed ${short(installedSha)}, remote ${short(remoteSha)}). ` +
    `Update: \`${CMD_MARKETPLACE_UPDATE}\` -> \`${buildPluginUpdateCommand(scope)}\` -> \`${CMD_RELOAD}\`.`
  );
}

export function buildStaleContextLine(installedSha, remoteSha) {
  const short = (s) => String(s).slice(0, 12);
  return (
    `Agent-Pipeline: STALE (installed ${short(installedSha)} vs remote ${short(remoteSha)}) - ` +
    `run /pipeline-core:pipeline-start before any work`
  );
}

/**
 * Decide the hook's stdout given the two resolved SHAs (or null on any unresolved step)
 * and the resolved install scope (only used to render the scope-aware update command on
 * a stale verdict; irrelevant otherwise).
 * @param {string|null} installedSha
 * @param {string|null} remoteSha
 * @param {string|null} [scope] - "user" | "project" | null/unknown (unresolved)
 * @returns {{stale: boolean|null, stdout: string, json: boolean, payload?: object}}
 */
export function decideOutput(installedSha, remoteSha, scope = null) {
  if (!installedSha || !remoteSha) {
    return { stale: null, stdout: BOOTSTRAP_LINE + "\n", json: false };
  }
  if (shaMatches(installedSha, remoteSha)) {
    return { stale: false, stdout: BOOTSTRAP_LINE + "\n", json: false };
  }
  const payload = {
    systemMessage: buildStaleMessage(installedSha, remoteSha, scope),
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: buildStaleContextLine(installedSha, remoteSha),
    },
  };
  return { stale: true, stdout: JSON.stringify(payload) + "\n", json: true, payload };
}

// ---- CLI entrypoint: real environment, always exit 0 ----------------------------------
export function run() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const installedPluginsPath = join(homedir(), ".claude", "plugins", "installed_plugins.json");
  const settingsPath = join(projectDir, ".claude", "settings.json");

  const installedSha = resolveInstalledSha({ installedPluginsPath, projectDir });
  const scope = installedSha ? resolveInstalledScope({ installedPluginsPath, projectDir }) : null;
  const remoteUrl = installedSha ? resolveMarketplaceUrl({ settingsPath }) : null;
  const remoteSha = remoteUrl ? fetchRemoteSha({ url: remoteUrl }) : null;

  const { stdout } = decideOutput(installedSha, remoteSha, scope);
  process.stdout.write(stdout);
  process.exit(0); // NEVER blocks, regardless of outcome
}

// Only auto-run when executed directly (`node staleness-check.mjs`), never on import
// (the test file imports the functions above without triggering the real CLI/exit).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
