#!/usr/bin/env node
/**
 * staleness-check.test.mjs — versioned test suite for the SessionStart staleness hook
 * (staleness-check.mjs).
 *
 * Canon: spec `specs/2026-07-05-elephant-kontext-diaet/spec.md` R-M10.3, register E23.
 *
 * Coverage contract (spec-mandated scenarios):
 *   - fresh (installed SHA == remote HEAD SHA)
 *   - stale (installed SHA != remote HEAD SHA) -> valid JSON stdout with `systemMessage`
 *   - offline/timeout (git ls-remote fails or hangs) -> fail-open, exit 0
 *   - malformed installed_plugins.json -> fail-open, exit 0
 *   All fail-open paths exit 0 (asserted both at the function level and, for the
 *   file-parsing fail-open paths, at the real CLI-process level).
 *
 * Test strategy (module-parameter injection, per spec "env vars or module parameter"):
 *   - Steps 1-3 of the resolution chain (resolveInstalledSha / resolveMarketplaceUrl /
 *     fetchRemoteSha) and the pure verdict logic (shaMatches / decideOutput) are
 *     imported directly and called with fixture paths/values - no real HOME, no real
 *     project settings, no real network.
 *   - `fetchRemoteSha`'s "reachable remote" path is exercised against a REAL local git
 *     repo (git supports a local path as an ls-remote target) so the git-invocation
 *     mechanics are proven end-to-end without any network dependency.
 *   - `fetchRemoteSha`'s offline/timeout path is exercised by injecting a fake slow
 *     child process (`command`/`args` override) and a nonexistent command - fast,
 *     deterministic, and independent of the sandbox's actual network reachability (a
 *     real network attempt against a possibly-absent/possibly-present connection would
 *     not be deterministic across machines/CI - see header of staleness-check.mjs).
 *   - The full CLI (`run()`, `process.exit(0)`) is additionally verified by spawning the
 *     real script as a subprocess with `USERPROFILE`/`HOME` (fakes `os.homedir()`,
 *     confirmed on this Node/Windows combination) and `CLAUDE_PROJECT_DIR` (existing
 *     repo convention, see guard-git.test.mjs) pointed at temp fixtures - covering the
 *     malformed/missing-file fail-open paths at the real-process level.
 *
 * Run:   node plugins/pipeline-core/hooks/staleness-check.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PLUGIN_ID,
  BOOTSTRAP_LINE,
  CMD_MARKETPLACE_UPDATE,
  CMD_PLUGIN_UPDATE_BASE,
  CMD_RELOAD,
  resolveInstalledSha,
  resolveInstalledScope,
  resolveMarketplaceUrl,
  fetchRemoteSha,
  shaMatches,
  buildPluginUpdateCommand,
  decideOutput,
} from "./staleness-check.mjs";

const SCRIPT = fileURLToPath(new URL("./staleness-check.mjs", import.meta.url));
// Repo-relative, versioned fixture (not machine-specific) - three levels up from
// plugins/pipeline-core/hooks/ is the repo root.
const REAL_REPO_SETTINGS = fileURLToPath(new URL("../../../.claude/settings.json", import.meta.url));

let pass = 0;
const failures = [];
function ok(id, condition, detail) {
  if (condition) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}${detail !== undefined ? `: ${detail}` : ""}`);
    console.log(`FAIL  ${id}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

const WORKDIR = mkdtempSync(join(tmpdir(), "staleness-test-"));
function fixtureDir(name) {
  const dir = join(WORKDIR, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}
function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2));
}
function writeRaw(path, text) {
  writeFileSync(path, text);
}

// ======================================================================================
// resolveInstalledSha
// ======================================================================================
{
  const dir = fixtureDir("installed-match");
  const installedPath = join(dir, "installed_plugins.json");
  writeJson(installedPath, {
    version: 2,
    plugins: {
      [PLUGIN_ID]: [
        { scope: "project", projectPath: "D:\\Dev\\example-project", gitCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        { scope: "project", projectPath: "D:\\Dev\\other-project", gitCommitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
      ],
    },
  });
  const sha = resolveInstalledSha({ installedPluginsPath: installedPath, projectDir: "D:\\Dev\\example-project" });
  ok("resolveInstalledSha matches by projectPath", sha === "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", sha);

  const shaNorm = resolveInstalledSha({ installedPluginsPath: installedPath, projectDir: "d:/dev/example-project" });
  ok("resolveInstalledSha matches case/slash-insensitively", shaNorm === "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", shaNorm);
}

{
  const dir = fixtureDir("installed-single-fallback");
  const installedPath = join(dir, "installed_plugins.json");
  writeJson(installedPath, {
    version: 2,
    plugins: { [PLUGIN_ID]: [{ scope: "project", projectPath: "D:\\Dev\\other-project", gitCommitSha: "cccccccccccccccccccccccccccccccccccccccc" }] },
  });
  const sha = resolveInstalledSha({ installedPluginsPath: installedPath, projectDir: "D:\\Dev\\example-project" });
  ok("resolveInstalledSha falls back to sole entry when no projectPath matches", sha === "cccccccccccccccccccccccccccccccccccccccc", sha);
}

{
  const dir = fixtureDir("installed-ambiguous");
  const installedPath = join(dir, "installed_plugins.json");
  writeJson(installedPath, {
    version: 2,
    plugins: {
      [PLUGIN_ID]: [
        { scope: "project", projectPath: "D:\\Dev\\other-1", gitCommitSha: "1111111111111111111111111111111111111111" },
        { scope: "project", projectPath: "D:\\Dev\\other-2", gitCommitSha: "2222222222222222222222222222222222222222" },
      ],
    },
  });
  const sha = resolveInstalledSha({ installedPluginsPath: installedPath, projectDir: "D:\\Dev\\example-project" });
  ok("resolveInstalledSha returns null when ambiguous (no match, multiple entries)", sha === null, sha);
}

{
  const dir = fixtureDir("installed-malformed");
  const installedPath = join(dir, "installed_plugins.json");
  writeRaw(installedPath, "{ this is not valid JSON ][");
  const sha = resolveInstalledSha({ installedPluginsPath: installedPath, projectDir: "D:\\Dev\\example-project" });
  ok("resolveInstalledSha returns null on malformed JSON", sha === null, sha);
}

{
  const installedPath = join(WORKDIR, "does-not-exist.json");
  const sha = resolveInstalledSha({ installedPluginsPath: installedPath, projectDir: "D:\\Dev\\example-project" });
  ok("resolveInstalledSha returns null when file is missing", sha === null, sha);
}

{
  const dir = fixtureDir("installed-wrong-plugin");
  const installedPath = join(dir, "installed_plugins.json");
  writeJson(installedPath, {
    version: 2,
    plugins: { "other-plugin@other-marketplace": [{ projectPath: "x", gitCommitSha: "3333333333333333333333333333333333333333" }] },
  });
  const sha = resolveInstalledSha({ installedPluginsPath: installedPath, projectDir: "D:\\Dev\\example-project" });
  ok("resolveInstalledSha returns null when PLUGIN_ID entry is absent", sha === null, sha);
}

// ======================================================================================
// resolveInstalledScope (scope-aware plugin-update command, 2026-07-07)
// ======================================================================================
{
  // Reuses the "installed-match" fixture written above (both entries carry scope "project").
  const dir = fixtureDir("installed-match");
  const installedPath = join(dir, "installed_plugins.json");
  const scope = resolveInstalledScope({ installedPluginsPath: installedPath, projectDir: "D:\\Dev\\example-project" });
  ok("resolveInstalledScope resolves \"project\" by projectPath match (same entry as the SHA match)", scope === "project", scope);
}

{
  // Real-machine shape (verified 2026-07-07, this machine's installed_plugins.json): a
  // user-scope install has NO projectPath at all - single-entry fallback must still work.
  const dir = fixtureDir("installed-scope-user");
  const installedPath = join(dir, "installed_plugins.json");
  writeJson(installedPath, {
    version: 2,
    plugins: { [PLUGIN_ID]: [{ scope: "user", installPath: "C:\\fake\\cache\\path", gitCommitSha: "4444444444444444444444444444444444444444" }] },
  });
  const scope = resolveInstalledScope({ installedPluginsPath: installedPath, projectDir: "D:\\Dev\\example-project" });
  ok("resolveInstalledScope resolves \"user\" from a projectPath-less, single-entry user-scope install", scope === "user", scope);
  const sha = resolveInstalledSha({ installedPluginsPath: installedPath, projectDir: "D:\\Dev\\example-project" });
  ok("resolveInstalledSha still resolves the SHA of that same user-scope entry", sha === "4444444444444444444444444444444444444444", sha);
}

{
  // Reuses the "installed-ambiguous" fixture (no projectPath match, multiple entries -> null).
  const dir = fixtureDir("installed-ambiguous");
  const installedPath = join(dir, "installed_plugins.json");
  const scope = resolveInstalledScope({ installedPluginsPath: installedPath, projectDir: "D:\\Dev\\example-project" });
  ok("resolveInstalledScope returns null when ambiguous (no match, multiple entries)", scope === null, scope);
}

{
  const scope = resolveInstalledScope({ installedPluginsPath: join(WORKDIR, "does-not-exist.json"), projectDir: "D:\\Dev\\example-project" });
  ok("resolveInstalledScope returns null when file is missing", scope === null, scope);
}

// ======================================================================================
// buildPluginUpdateCommand (scope-aware, <PROJECT_B>-S39 finding 1 extended 2026-07-07) — the
// three cases the staleness-check DoD requires: user / project / unresolvable.
// ======================================================================================
ok(
  "buildPluginUpdateCommand user-scope: appends --scope user",
  buildPluginUpdateCommand("user") === `${CMD_PLUGIN_UPDATE_BASE} --scope user`,
  buildPluginUpdateCommand("user"),
);
ok(
  "buildPluginUpdateCommand project-scope: appends --scope project",
  buildPluginUpdateCommand("project") === `${CMD_PLUGIN_UPDATE_BASE} --scope project`,
  buildPluginUpdateCommand("project"),
);
{
  // "no scope flag" means the RUNNABLE command has no --scope appended (it is not a
  // prefix of a real "--scope user/project" invocation) - the prose HINT is allowed (and
  // expected) to name both flags as guidance for the PO to append manually.
  const cmd = buildPluginUpdateCommand(null);
  ok(
    "buildPluginUpdateCommand unresolved (null): the runnable command has no --scope flag appended",
    !cmd.startsWith(`${CMD_PLUGIN_UPDATE_BASE} --scope`),
    cmd,
  );
  ok("buildPluginUpdateCommand unresolved (null): still names the base command", cmd.includes(CMD_PLUGIN_UPDATE_BASE), cmd);
  ok("buildPluginUpdateCommand unresolved (null): hints at installed_plugins.json", cmd.includes("installed_plugins.json"), cmd);
}
{
  const cmd = buildPluginUpdateCommand("workspace"); // unknown scope value -> treated as unresolved
  ok(
    "buildPluginUpdateCommand unknown scope value: no --scope flag appended (fail-open, never guesses)",
    !cmd.startsWith(`${CMD_PLUGIN_UPDATE_BASE} --scope`),
    cmd,
  );
}

// ======================================================================================
// resolveMarketplaceUrl
// ======================================================================================
{
  const dir = fixtureDir("settings-github");
  const settingsPath = join(dir, "settings.json");
  writeJson(settingsPath, { extraKnownMarketplaces: { "agent-pipeline": { source: { source: "github", repo: "agent-pipeline/agent-pipeline" } } } });
  const url = resolveMarketplaceUrl({ settingsPath });
  ok("resolveMarketplaceUrl builds https URL from github source", url === "https://github.com/agent-pipeline/agent-pipeline.git", url);
}

{
  const dir = fixtureDir("settings-gitlab");
  const settingsPath = join(dir, "settings.json");
  writeJson(settingsPath, { extraKnownMarketplaces: { "agent-pipeline": { source: { source: "gitlab", repo: "your-org/agent-pipeline" } } } });
  const url = resolveMarketplaceUrl({ settingsPath });
  ok("resolveMarketplaceUrl builds https URL from gitlab source (gitlab.com default host)", url === "https://gitlab.com/your-org/agent-pipeline.git", url);
}

{
  const dir = fixtureDir("settings-gitlab-custom-host");
  const settingsPath = join(dir, "settings.json");
  writeJson(settingsPath, {
    extraKnownMarketplaces: { "agent-pipeline": { source: { source: "gitlab", repo: "your-org/agent-pipeline", host: "gitlab.example.com" } } },
  });
  const url = resolveMarketplaceUrl({ settingsPath });
  ok(
    "resolveMarketplaceUrl builds https URL from gitlab source with a configured host base (self-hosted instance)",
    url === "https://gitlab.example.com/your-org/agent-pipeline.git",
    url,
  );
}

{
  // Unknown/unsupported host source -> old fail-open behaviour unchanged (was the sole
  // "non-github" case before the gitlab branch existed; now proves neither the github nor
  // the gitlab branch mis-fires on a genuinely unrecognized `source.source` value).
  const dir = fixtureDir("settings-unknown-host");
  const settingsPath = join(dir, "settings.json");
  writeJson(settingsPath, { extraKnownMarketplaces: { "agent-pipeline": { source: { source: "git", url: "https://example.com/x.git" } } } });
  const url = resolveMarketplaceUrl({ settingsPath });
  ok("resolveMarketplaceUrl returns null for an unknown/unsupported host source (fail-open unchanged)", url === null, url);
}

{
  const dir = fixtureDir("settings-missing-marketplace");
  const settingsPath = join(dir, "settings.json");
  writeJson(settingsPath, { extraKnownMarketplaces: {} });
  const url = resolveMarketplaceUrl({ settingsPath });
  ok("resolveMarketplaceUrl returns null when the marketplace entry is absent", url === null, url);
}

{
  const dir = fixtureDir("settings-malformed");
  const settingsPath = join(dir, "settings.json");
  writeRaw(settingsPath, "{ not: json");
  const url = resolveMarketplaceUrl({ settingsPath });
  ok("resolveMarketplaceUrl returns null on malformed JSON", url === null, url);
}

{
  const url = resolveMarketplaceUrl({ settingsPath: join(WORKDIR, "no-such-settings.json") });
  ok("resolveMarketplaceUrl returns null when file is missing", url === null, url);
}

// Sanity check against the ACTUAL committed repo settings.json (regression guard - proves
// the derivation logic matches this repo's real, versioned configuration).
{
  const url = resolveMarketplaceUrl({ settingsPath: REAL_REPO_SETTINGS });
  ok(
    "resolveMarketplaceUrl matches this repo's real .claude/settings.json",
    url === "https://github.com/agent-pipeline/agent-pipeline.git",
    url,
  );
}

// ======================================================================================
// fetchRemoteSha
// ======================================================================================
{
  // Real local git repo as the "remote" - proves the ls-remote invocation mechanics work
  // end-to-end without any network dependency (git supports a local path as a target).
  const repoDir = fixtureDir("local-git-repo");
  const g = (args) => spawnSync("git", args, { cwd: repoDir, encoding: "utf8" });
  g(["init", "-q"]);
  g(["config", "user.email", "test@example.com"]);
  g(["config", "user.name", "Test"]);
  writeRaw(join(repoDir, "a.txt"), "hi\n");
  g(["add", "a.txt"]);
  g(["commit", "-q", "-m", "init"]);
  const headSha = g(["rev-parse", "HEAD"]).stdout.trim().toLowerCase();

  const sha = fetchRemoteSha({ url: repoDir });
  ok("fetchRemoteSha resolves a real local repo's HEAD", sha === headSha, `${sha} !== ${headSha}`);
}

{
  const sha = fetchRemoteSha({ url: "unused", command: "this-command-does-not-exist-xyz-12345" });
  ok("fetchRemoteSha returns null when the command is unavailable (offline-like)", sha === null, sha);
}

{
  const start = Date.now();
  const sha = fetchRemoteSha({
    url: "unused",
    timeoutMs: 300,
    command: process.execPath,
    args: ["-e", "setTimeout(()=>{}, 20000)"],
  });
  const elapsed = Date.now() - start;
  ok("fetchRemoteSha returns null on timeout (fail-open)", sha === null, sha);
  ok("fetchRemoteSha timeout is fast (killed near the injected 300ms, not the 20s sleep)", elapsed < 5000, `${elapsed}ms`);
}

{
  const sha = fetchRemoteSha({ url: "unused", command: process.execPath, args: ["-e", "console.log('not a sha')"] });
  ok("fetchRemoteSha returns null on malformed remote output", sha === null, sha);
}

// ======================================================================================
// shaMatches
// ======================================================================================
ok("shaMatches: identical", shaMatches("abc1234abc1234abc1234abc1234abc1234abcd", "abc1234abc1234abc1234abc1234abc1234abcd") === true);
ok("shaMatches: case-insensitive", shaMatches("ABC1234ABC1234ABC1234ABC1234ABC1234ABCD", "abc1234abc1234abc1234abc1234abc1234abcd") === true);
ok("shaMatches: short-prefix tolerant", shaMatches("abc1234", "abc1234abc1234abc1234abc1234abc1234abcd") === true);
ok("shaMatches: mismatch", shaMatches("1111111", "2222222") === false);
ok("shaMatches: null installed", shaMatches(null, "2222222") === false);
ok("shaMatches: null remote", shaMatches("1111111", null) === false);
ok("shaMatches: too-short prefix not compared", shaMatches("ab", "ab") === false);

// ======================================================================================
// decideOutput
// ======================================================================================
{
  const { stale, stdout, json } = decideOutput("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  ok("decideOutput fresh: stale=false", stale === false);
  ok("decideOutput fresh: not JSON", json === false);
  ok("decideOutput fresh: plain bootstrap line", stdout === BOOTSTRAP_LINE + "\n", stdout);
}

{
  const { stale, stdout, json } = decideOutput(null, null);
  ok("decideOutput unresolved (both null): stale=null (fail-open)", stale === null);
  ok("decideOutput unresolved: not JSON", json === false);
  ok("decideOutput unresolved: plain bootstrap line", stdout === BOOTSTRAP_LINE + "\n", stdout);
}

{
  const { stale, json } = decideOutput("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", null);
  ok("decideOutput unresolved (remote null): stale=null, plain text", stale === null && json === false);
}

{
  const installed = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const remote = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const { stale, stdout, json, payload } = decideOutput(installed, remote, "project");
  ok("decideOutput stale: stale=true", stale === true);
  ok("decideOutput stale: is JSON", json === true);
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    /* leave null, asserted below */
  }
  ok("decideOutput stale: stdout is valid JSON", parsed !== null, stdout);
  ok("decideOutput stale: has systemMessage string", typeof parsed?.systemMessage === "string" && parsed.systemMessage.length > 0);
  ok("decideOutput stale: systemMessage names marketplace-update command", parsed?.systemMessage?.includes(CMD_MARKETPLACE_UPDATE) === true);
  ok(
    "decideOutput stale: systemMessage names scope-aware plugin-update command (project)",
    parsed?.systemMessage?.includes(`${CMD_PLUGIN_UPDATE_BASE} --scope project`) === true,
  );
  ok("decideOutput stale: systemMessage names /reload-plugins", parsed?.systemMessage?.includes(CMD_RELOAD) === true);
  ok("decideOutput stale: hookSpecificOutput.hookEventName is SessionStart", parsed?.hookSpecificOutput?.hookEventName === "SessionStart");
  ok(
    "decideOutput stale: additionalContext states installed vs remote SHA",
    typeof parsed?.hookSpecificOutput?.additionalContext === "string" &&
      parsed.hookSpecificOutput.additionalContext.includes(installed.slice(0, 12)) &&
      parsed.hookSpecificOutput.additionalContext.includes(remote.slice(0, 12)),
  );
  ok("decideOutput stale: payload matches the parsed stdout", JSON.stringify(payload) === stdout.trim());
}

{
  // Scope-aware command, user-scope install (this machine's real install shape, verified 2026-07-07).
  const { stdout } = decideOutput(
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "user",
  );
  const parsed = JSON.parse(stdout);
  ok(
    "decideOutput stale: systemMessage names scope-aware plugin-update command (user)",
    parsed.systemMessage.includes(`${CMD_PLUGIN_UPDATE_BASE} --scope user`),
    parsed.systemMessage,
  );
}

{
  // Scope unresolved (third argument omitted, defaults to null) -> command WITHOUT a
  // --scope flag, plus the installed_plugins.json hint - never guess a scope.
  const { stdout } = decideOutput("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  const parsed = JSON.parse(stdout);
  ok(
    "decideOutput stale: unresolved scope -> systemMessage carries the base command without a --scope flag appended",
    parsed.systemMessage.includes(CMD_PLUGIN_UPDATE_BASE) && !parsed.systemMessage.includes(`${CMD_PLUGIN_UPDATE_BASE} --scope`),
    parsed.systemMessage,
  );
  ok(
    "decideOutput stale: unresolved scope -> systemMessage hints at installed_plugins.json",
    parsed.systemMessage.includes("installed_plugins.json"),
    parsed.systemMessage,
  );
}

// ======================================================================================
// Full CLI process (spawns the real script; env-var injection fakes homedir/project dir)
// ======================================================================================
function runCli(fakeHome, fakeProjectDir) {
  const res = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: { ...process.env, USERPROFILE: fakeHome, HOME: fakeHome, CLAUDE_PROJECT_DIR: fakeProjectDir },
  });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}
function makeHome(name) {
  const home = fixtureDir(name);
  mkdirSync(join(home, ".claude", "plugins"), { recursive: true });
  return home;
}
function makeProject(name) {
  const proj = fixtureDir(name);
  mkdirSync(join(proj, ".claude"), { recursive: true });
  return proj;
}

{
  const home = makeHome("cli-malformed-installed");
  writeRaw(join(home, ".claude", "plugins", "installed_plugins.json"), "{ broken");
  const proj = makeProject("cli-malformed-installed-proj");
  const { status, stdout, stderr } = runCli(home, proj);
  ok("CLI malformed installed_plugins.json: exit 0", status === 0, `status=${status} stderr=${stderr}`);
  ok("CLI malformed installed_plugins.json: plain bootstrap line", stdout.trim() === BOOTSTRAP_LINE, stdout);
}

{
  const home = makeHome("cli-missing-installed");
  // installed_plugins.json intentionally not written.
  const proj = makeProject("cli-missing-installed-proj");
  const { status, stdout } = runCli(home, proj);
  ok("CLI missing installed_plugins.json: exit 0", status === 0);
  ok("CLI missing installed_plugins.json: plain bootstrap line", stdout.trim() === BOOTSTRAP_LINE, stdout);
}

{
  const home = makeHome("cli-missing-settings");
  const proj = makeProject("cli-missing-settings-proj");
  writeJson(join(home, ".claude", "plugins", "installed_plugins.json"), {
    version: 2,
    plugins: { [PLUGIN_ID]: [{ scope: "project", projectPath: proj, gitCommitSha: "dddddddddddddddddddddddddddddddddddddddd" }] },
  });
  // .claude/settings.json intentionally not written in the project fixture.
  const { status, stdout } = runCli(home, proj);
  ok("CLI valid installed + missing settings.json: exit 0", status === 0);
  ok("CLI valid installed + missing settings.json: plain bootstrap line", stdout.trim() === BOOTSTRAP_LINE, stdout);
}

{
  const home = makeHome("cli-malformed-settings");
  const proj = makeProject("cli-malformed-settings-proj");
  writeJson(join(home, ".claude", "plugins", "installed_plugins.json"), {
    version: 2,
    plugins: { [PLUGIN_ID]: [{ scope: "project", projectPath: proj, gitCommitSha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" }] },
  });
  writeRaw(join(proj, ".claude", "settings.json"), "{ not valid");
  const { status, stdout } = runCli(home, proj);
  ok("CLI valid installed + malformed settings.json: exit 0", status === 0);
  ok("CLI valid installed + malformed settings.json: plain bootstrap line", stdout.trim() === BOOTSTRAP_LINE, stdout);
}

{
  const home = makeHome("cli-non-github-source");
  const proj = makeProject("cli-non-github-source-proj");
  writeJson(join(home, ".claude", "plugins", "installed_plugins.json"), {
    version: 2,
    plugins: { [PLUGIN_ID]: [{ scope: "project", projectPath: proj, gitCommitSha: "ffffffffffffffffffffffffffffffffffffffff" }] },
  });
  writeJson(join(proj, ".claude", "settings.json"), {
    extraKnownMarketplaces: { "agent-pipeline": { source: { source: "git", url: "https://example.com/x.git" } } },
  });
  const { status, stdout } = runCli(home, proj);
  ok("CLI valid installed + unknown/unsupported marketplace source: exit 0", status === 0);
  ok("CLI valid installed + unknown/unsupported marketplace source: plain bootstrap line", stdout.trim() === BOOTSTRAP_LINE, stdout);
}

// NOTE: no full-CLI "gitlab source" case here by design - unlike the malformed/missing-file
// and unknown-source fixtures above (which all fail BEFORE reaching the network step), a
// gitlab source now resolves a real https URL, so a full run() invocation would make an
// actual `git ls-remote` network call - exactly the non-determinism the module-level
// fetchRemoteSha injection tests above exist to avoid (see file header). The URL-derivation
// itself ("gitlab source" analog to the github assertions) is covered at the
// resolveMarketplaceUrl unit level above (settings-gitlab / settings-gitlab-custom-host).

// ---- cleanup + summary -----------------------------------------------------------------
try {
  rmSync(WORKDIR, { recursive: true, force: true });
} catch {
  // best-effort cleanup; leftover temp dirs never fail the suite
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
