#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createFreshnessHostAction,
  FRESHNESS_HOST_RESULT_SCHEMA,
  FRESHNESS_HOST_TRANSPORT_SCHEMA,
  FRESHNESS_NETWORK_PREFLIGHT_SCHEMA,
  freshnessHostPlanForEnvironment,
  inspectClaudeRulesetFreshness,
  inspectCliRulesetFreshness,
  inspectRulesetFreshness,
  observePublicRemoteIdentity,
  PUBLIC_MARKETPLACE_URL,
  RULESET_FRESHNESS_SCHEMA,
  withFreshnessHostRequest,
} from "./ruleset-freshness.mjs";
import { executeRulesetFreshnessHostAction, inspectHostRulesetFreshness } from "./ruleset-freshness-host.mjs";

const roots = [];
const SCRIPT = fileURLToPath(new URL("./ruleset-freshness.mjs", import.meta.url));
const HOST_SCRIPT = fileURLToPath(new URL("./ruleset-freshness-host.mjs", import.meta.url));
function git(cwd, ...args) {
  const out = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout.trim();
}
function commit(repo, name) {
  writeFileSync(join(repo, `${name}.txt`), `${name}\n`);
  git(repo, "add", `${name}.txt`);
  git(repo, "commit", "-q", "-m", name);
}
function fixture(name) {
  const root = mkdtempSync(join(tmpdir(), `ruleset-freshness-${name}-`));
  roots.push(root);
  const remote = join(root, "public.git");
  const source = join(root, "source");
  git(root, "init", "--bare", "-q", remote);
  git(root, "init", "-q", "-b", "main", source);
  git(source, "config", "user.email", "ruleset@example.invalid");
  git(source, "config", "user.name", "Ruleset Test");
  commit(source, "base");
  git(source, "remote", "add", "public", remote);
  git(source, "push", "-q", "public", "main");
  git(remote, "symbolic-ref", "HEAD", "refs/heads/main");
  return { root, remote, source };
}
function sourceObservation(sha, sourceClass = "marketplace-public", installedSha = sha) {
  return {
    schema: "pipeline.ruleset-source.v1",
    runner: "codex",
    selectedPlugin: { id: "pipeline-core@agent-pipeline", version: "0.4.6+test" },
    source: { class: sourceClass },
    loadedIdentity: { status: "available", algorithm: "git-sha1", value: sha },
    installedIdentity: { status: "available", algorithm: "git-sha1", value: installedSha },
  };
}
function remoteObservation(sha) {
  return { status: "ready", identity: { status: "available", algorithm: "git-sha1", value: sha } };
}

test.after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("the default public remote observation is fixed, injected, and coordinate-free", () => {
  const calls = [];
  const sha = "d".repeat(40);
  const observed = observePublicRemoteIdentity({
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, signal: null, stdout: `${sha}\tHEAD\n` };
    },
  });
  assert.deepEqual(observed, {
    status: "ready",
    identity: { status: "available", algorithm: "git-sha1", value: sha },
    reason: null,
  });
  assert.deepEqual(calls[0].args, ["ls-remote", PUBLIC_MARKETPLACE_URL, "HEAD"]);
  assert.equal(JSON.stringify(observed).includes("github.com"), false);
});

test("a known restricted sandbox binds exactly one data-minimized network-open host action", () => {
  const { source } = fixture("selected-host-transport");
  const loaded = git(source, "rev-parse", "HEAD");
  let sandboxAttempts = 0;
  const actions = [];
  const boundaryId = "freshness-host-boundary-1";
  const value = inspectRulesetFreshness(source, {
    sourceObservation: sourceObservation(loaded),
    networkPreflight: {
      schema: FRESHNESS_NETWORK_PREFLIGHT_SCHEMA,
      network: "restricted",
      boundaryId,
    },
    hostTransport: {
      schema: FRESHNESS_HOST_TRANSPORT_SCHEMA,
      boundaryId,
      access: "read-only",
      network: "enabled",
      execute(action) {
        actions.push(action);
        return {
          schema: FRESHNESS_HOST_RESULT_SCHEMA,
          requestSha256: action.requestSha256,
          status: "completed",
          stdout: `${loaded}\tHEAD\n`,
        };
      },
    },
    spawn() {
      sandboxAttempts += 1;
      throw new Error("known restricted sandbox must not be attempted");
    },
  });
  assert.equal(value.status, "equal");
  assert.equal(sandboxAttempts, 0);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], createFreshnessHostAction(boundaryId));
  assert.equal(JSON.stringify(actions[0]).includes(source), false);
  assert.equal(JSON.stringify(actions[0]).includes(process.env.HOME ?? "not-set"), false);
});

test("a restricted preflight without its exact selected host transport fails closed without a sandbox attempt", () => {
  let attempts = 0;
  const observed = observePublicRemoteIdentity({
    networkPreflight: {
      schema: FRESHNESS_NETWORK_PREFLIGHT_SCHEMA,
      network: "restricted",
      boundaryId: "freshness-host-boundary-2",
    },
    spawn() { attempts += 1; return { status: 0, stdout: `${"a".repeat(40)}\tHEAD\n` }; },
  });
  assert.deepEqual(observed, { status: "remote-unavailable", identity: null, reason: "host-transport-required" });
  assert.equal(attempts, 0);
});

test("WSL CLI planning emits a bound host request and never restores a default sandbox fallback", () => {
  const plan = freshnessHostPlanForEnvironment({ WSL_DISTRO_NAME: "Ubuntu" });
  assert.deepEqual(plan.networkPreflight, {
    schema: FRESHNESS_NETWORK_PREFLIGHT_SCHEMA,
    network: "restricted",
    boundaryId: "pipeline-start-host-authorized-wsl",
  });
  const unavailable = {
    schema: RULESET_FRESHNESS_SCHEMA,
    status: "remote-unavailable",
    source: "marketplace-public",
    loadedSha: "a".repeat(40),
    remoteSha: null,
    ahead: null,
    behind: null,
    writePermitted: false,
    reason: "host-transport-required",
  };
  const output = withFreshnessHostRequest(unavailable, plan);
  assert.deepEqual(output.nextAction, createFreshnessHostAction("pipeline-start-host-authorized-wsl"));
  assert.equal(JSON.stringify(output).includes("/home/"), false);
  assert.equal(JSON.stringify(output).includes(".codex"), false);
  assert.equal(freshnessHostPlanForEnvironment({}), null);
  assert.equal(withFreshnessHostRequest(unavailable, null), unavailable);
});

test("the normal Codex freshness entrypoint forwards a selected host transport", () => {
  const loaded = "a".repeat(40);
  const boundaryId = "freshness-host-boundary-cli";
  let directAttempts = 0;
  let hostCalls = 0;
  const value = inspectCliRulesetFreshness({
    repoPath: "/private/consumer-not-forwarded",
    codexObservation: { status: "ready", observation: sourceObservation(loaded) },
    networkPreflight: {
      schema: FRESHNESS_NETWORK_PREFLIGHT_SCHEMA,
      network: "restricted",
      boundaryId,
    },
    hostTransport: {
      schema: FRESHNESS_HOST_TRANSPORT_SCHEMA,
      boundaryId,
      access: "read-only",
      network: "enabled",
      execute(action) {
        hostCalls += 1;
        assert.deepEqual(action, createFreshnessHostAction(boundaryId));
        return { schema: FRESHNESS_HOST_RESULT_SCHEMA, requestSha256: action.requestSha256, status: "completed", stdout: `${loaded}\tHEAD\n` };
      },
    },
    // The direct spawn seam is intentionally absent from this entrypoint. A
    // hostile fallback would therefore have to reach the host transport first.
    inspectClaude() { directAttempts += 1; throw new Error("Claude fallback must not run"); },
  });
  assert.equal(value.status, "equal");
  assert.equal(hostCalls, 1);
  assert.equal(directAttempts, 0);
});

test("the dedicated WSL host adapter executes only the fixed public action", () => {
  const action = createFreshnessHostAction("pipeline-start-host-authorized-wsl");
  const sha = "e".repeat(40);
  const calls = [];
  const output = executeRulesetFreshnessHostAction(action, {
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, stdout: `${sha}\tHEAD\nprivate diagnostic that must not escape` };
    },
  });
  assert.deepEqual(calls[0].args, ["ls-remote", PUBLIC_MARKETPLACE_URL, "HEAD"]);
  assert.equal(calls[0].command, "/usr/bin/git");
  assert.equal(calls[0].options.cwd, "/");
  assert.equal(calls[0].options.shell, false);
  assert.deepEqual(calls[0].options.env, {
    GIT_ASKPASS: "/bin/false",
    GIT_CONFIG_COUNT: "0",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    HOME: "/nonexistent",
    LANG: "C",
    LC_ALL: "C",
    PATH: "/usr/bin:/bin",
    SSH_ASKPASS: "/bin/false",
  });
  assert.deepEqual(output, {
    schema: FRESHNESS_HOST_RESULT_SCHEMA,
    requestSha256: action.requestSha256,
    status: "completed",
    stdout: `${sha}\tHEAD\n`,
  });
  assert.equal(JSON.stringify(output).includes("private diagnostic"), false);

  const substituted = { ...action, boundaryId: "other-boundary" };
  assert.equal(executeRulesetFreshnessHostAction(substituted, {
    spawn() { throw new Error("substituted action must never run"); },
  }), null);
});

test("the dedicated WSL host adapter ignores hostile PATH and Git URL-rewrite state", () => {
  const action = createFreshnessHostAction("pipeline-start-host-authorized-wsl");
  const sha = "f".repeat(40);
  const hostileEnvironment = {
    PATH: "/tmp/attacker-bin",
    HOME: "/tmp/attacker-home",
    GIT_DIR: "/tmp/attacker-repository",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "url.https://attacker.invalid/.insteadof",
    GIT_CONFIG_VALUE_0: PUBLIC_MARKETPLACE_URL,
  };
  const previousEnvironment = Object.fromEntries(Object.keys(hostileEnvironment)
    .map((key) => [key, process.env[key]]));
  Object.assign(process.env, hostileEnvironment);
  const calls = [];
  let output;
  try {
    output = executeRulesetFreshnessHostAction(action, {
      spawn(command, args, options) {
        calls.push({ command, args, options });
        return { status: 0, stdout: `${sha}\tHEAD\n` };
      },
    });
  } finally {
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "/usr/bin/git");
  assert.equal(calls[0].options.env.PATH, "/usr/bin:/bin");
  assert.equal(calls[0].options.env.GIT_CONFIG_GLOBAL, "/dev/null");
  assert.equal(calls[0].options.env.GIT_CONFIG_NOSYSTEM, "1");
  for (const key of ["PATH", "HOME", "GIT_DIR", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0"]) {
    assert.equal(Object.hasOwn(calls[0].options.env, key), key === "PATH" || key === "HOME");
  }
  assert.equal(calls[0].options.env.GIT_CONFIG_COUNT, "0");
  assert.equal(output.status, "completed");
});

test("the host adapter produces the complete freshness result through its fixed transport", () => {
  const loaded = "a".repeat(40);
  const observed = inspectHostRulesetFreshness({
    repoPath: "/private/consumer-not-forwarded",
    loadedPluginRoot: "/private/plugin-not-forwarded",
    codexObservation: { status: "ready", observation: sourceObservation(loaded) },
    execute(action) {
      assert.deepEqual(action, createFreshnessHostAction("pipeline-start-host-authorized-wsl"));
      return {
        schema: FRESHNESS_HOST_RESULT_SCHEMA,
        requestSha256: action.requestSha256,
        status: "completed",
        stdout: `${loaded}\tHEAD\n`,
      };
    },
  });
  assert.equal(observed.status, "equal");
  assert.equal(observed.remoteSha, loaded);
  assert.equal(JSON.stringify(observed).includes("/private/"), false);
  const unavailable = inspectHostRulesetFreshness({
    repoPath: "/private/consumer-not-forwarded",
    loadedPluginRoot: "/private/plugin-not-forwarded",
    codexObservation: { status: "ready", observation: sourceObservation(loaded) },
    execute() { return null; },
  });
  assert.equal(unavailable.status, "remote-unavailable");
  assert.equal(unavailable.writePermitted, false);
  assert.notEqual(unavailable.status, "equal");
});

test("the host adapter has a real full-result CLI path and rejects arbitrary requests", () => {
  const valid = spawnSync(process.execPath, [HOST_SCRIPT, "--repo", process.cwd()], {
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  // The host executable is run directly, not injected into an in-process
  // transport. Network may be unavailable in a nested workspace sandbox, but
  // both typed outcomes prove the closed CLI path.
  if (valid.error?.code === "EPERM") return;
  assert.equal(valid.error, undefined);
  assert.ok([0, 2].includes(valid.status));
  const payload = JSON.parse(valid.stdout);
  assert.equal(payload.schema, RULESET_FRESHNESS_SCHEMA);
  assert.equal(typeof payload.status, "string");
  assert.equal(typeof payload.remoteSha === "string" || payload.remoteSha === null, true);

  const rejected = spawnSync(process.execPath, [HOST_SCRIPT, "--repo", process.cwd(), "--unexpected"], {
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(rejected.status, 64);
  assert.equal(rejected.stdout, "");
  assert.match(rejected.stderr, /usage/u);
});

test("self-application accepts equal and descendant loaded rulesets without consumer HEAD", () => {
  const { root, remote, source } = fixture("ahead");
  const preHeadConsumer = join(root, "pre-head-consumer");
  const base = git(source, "rev-parse", "HEAD");
  let value = inspectRulesetFreshness(preHeadConsumer, {
    sourceObservation: sourceObservation(base, "self-application"),
    loadedPluginRoot: source,
    remoteObservation: remoteObservation(base),
    remoteUrl: remote,
  });
  assert.equal(value.schema, RULESET_FRESHNESS_SCHEMA);
  assert.equal(value.status, "equal");
  assert.equal(value.writePermitted, true);
  commit(source, "local");
  const local = git(source, "rev-parse", "HEAD");
  value = inspectRulesetFreshness(preHeadConsumer, {
    sourceObservation: sourceObservation(local, "self-application"),
    loadedPluginRoot: source,
    remoteObservation: remoteObservation(base),
    remoteUrl: remote,
  });
  assert.equal(value.status, "ahead");
  assert.equal(value.ahead, 1);
  assert.equal(value.behind, 0);
  assert.equal(value.writePermitted, true);
});

test("self-application keeps behind and diverged distinct", () => {
  const { root, remote, source } = fixture("noncurrent");
  const publisher = join(root, "publisher");
  git(root, "clone", "-q", remote, publisher);
  git(publisher, "config", "user.email", "ruleset@example.invalid");
  git(publisher, "config", "user.name", "Ruleset Test");
  commit(publisher, "public-new");
  git(publisher, "push", "-q", "origin", "main");
  const publicHead = git(publisher, "rev-parse", "HEAD");
  let local = git(source, "rev-parse", "HEAD");
  let value = inspectRulesetFreshness(source, {
    sourceObservation: sourceObservation(local, "self-application"), loadedPluginRoot: source,
    remoteObservation: remoteObservation(publicHead), remoteUrl: remote,
  });
  assert.equal(value.status, "behind");
  assert.equal(value.writePermitted, false);
  commit(source, "private-new");
  local = git(source, "rev-parse", "HEAD");
  value = inspectRulesetFreshness(source, {
    sourceObservation: sourceObservation(local, "self-application"), loadedPluginRoot: source,
    remoteObservation: remoteObservation(publicHead), remoteUrl: remote,
  });
  assert.equal(value.status, "diverged");
  assert.equal(value.writePermitted, false);
});

test("consumer mismatch, offline public remote, and loaded/installed disagreement remain typed", () => {
  const { source } = fixture("typed");
  const loaded = git(source, "rev-parse", "HEAD");
  const remote = "b".repeat(40);
  const mismatch = inspectRulesetFreshness(source, {
    sourceObservation: sourceObservation(loaded), remoteObservation: remoteObservation(remote),
  });
  assert.equal(mismatch.status, "loaded-remote-mismatch");
  assert.equal(mismatch.writePermitted, false);

  const offline = inspectRulesetFreshness(source, {
    sourceObservation: sourceObservation(loaded), remoteObservation: { status: "remote-unavailable", identity: null, reason: "timeout" },
  });
  assert.equal(offline.status, "remote-unavailable");
  assert.equal(offline.reason, "timeout");

  const disagree = inspectRulesetFreshness(source, {
    sourceObservation: sourceObservation(loaded, "marketplace-public", "c".repeat(40)), remoteObservation: remoteObservation(loaded),
  });
  assert.equal(disagree.status, "loaded-installed-mismatch");
});

test("private and local sources do not perform or claim public remote freshness", () => {
  const { source } = fixture("private-local");
  const loaded = git(source, "rev-parse", "HEAD");
  for (const sourceClass of ["marketplace-private", "local-development"]) {
    const value = inspectRulesetFreshness(source, { sourceObservation: sourceObservation(loaded, sourceClass) });
    assert.equal(value.status, sourceClass);
    assert.equal(value.writePermitted, false);
    assert.equal(value.reason, "public-remote-not-selected");
  }
});

test("freshness diagnostics never include private remote coordinates", () => {
  const { source } = fixture("privacy");
  const loaded = git(source, "rev-parse", "HEAD");
  const privateRemote = "https://user:token@private.example.invalid/agent-pipeline.git";
  const value = inspectRulesetFreshness(source, {
    sourceObservation: sourceObservation(loaded, "marketplace-private"),
    remoteUrl: privateRemote,
  });
  assert.equal(JSON.stringify(value).includes(privateRemote), false);
  assert.equal(JSON.stringify(value).includes("private.example.invalid"), false);
});

test("CLI source and freshness diagnostics never disclose HOME, cache, or private coordinates", () => {
  const privateRepo = "/private/work/consumer-987";
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, [SCRIPT, "--repo", privateRepo], {
    encoding: "utf8",
    env: childEnv,
  });
  const combined = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  assert.equal(combined.includes(privateRepo), false);
  if (typeof process.env.HOME === "string" && process.env.HOME.length > 0) assert.equal(combined.includes(process.env.HOME), false);
  if (typeof process.env.CODEX_HOME === "string" && process.env.CODEX_HOME.length > 0) assert.equal(combined.includes(process.env.CODEX_HOME), false);
  // Codex's workspace sandbox can deny nested process creation before the
  // child reaches the CLI. That denial has no child output to inspect; a
  // normal host run remains the end-to-end assertion below.
  if (run.error?.code === "EPERM") return;
  assert.equal(run.error, undefined);
  assert.equal(run.status, 2);
  const payload = JSON.parse(run.stdout);
  assert.equal(payload.schema, RULESET_FRESHNESS_SCHEMA);
  assert.equal(typeof payload.status, "string");
});

test("Claude compatibility treats only the exact reviewed marketplace as public", () => {
  const { root, source } = fixture("claude-marketplace-source");
  const loaded = git(source, "rev-parse", "HEAD");
  const settings = join(root, "settings.json");
  let remoteCalls = 0;
  for (const sourceConfig of [
    { source: "gitlab", host: "git.internal.example", repo: "platform/agent-pipeline" },
    { source: "github", repo: "another-org/agent-pipeline" },
  ]) {
    writeFileSync(settings, JSON.stringify({ extraKnownMarketplaces: { "agent-pipeline": { source: sourceConfig } } }));
    const value = inspectClaudeRulesetFreshness(source, {
      settingsPath: settings,
      spawn() { remoteCalls += 1; throw new Error("private marketplace must not be queried"); },
    });
    assert.equal(value.status, "marketplace-private");
    assert.equal(value.writePermitted, false);
    assert.equal(value.reason, "public-remote-not-selected");
  }
  assert.equal(remoteCalls, 0);

  writeFileSync(settings, JSON.stringify({
    extraKnownMarketplaces: { "agent-pipeline": { source: { source: "github", repo: "agent-pipe-shared/agent-pipeline" } } },
  }));
  const publicValue = inspectClaudeRulesetFreshness(source, {
    settingsPath: settings,
    loadedSha: loaded,
    remoteObservation: remoteObservation(loaded),
  });
  assert.equal(publicValue.status, "equal");
  assert.equal(publicValue.writePermitted, true);
});

test("Claude compatibility rejects unsafe marketplace coordinates", () => {
  const { source } = fixture("claude-unsafe-marketplace");
  const value = inspectClaudeRulesetFreshness(source, {
    remoteUrl: "http://marketplace.example/agent-pipeline.git",
    spawn() { throw new Error("unsafe marketplace must not be queried"); },
  });
  assert.equal(value.status, "source-unavailable");
  assert.equal(value.writePermitted, false);
  assert.equal(value.reason, "claude-marketplace-unavailable");
});

test("CLI preserves typed Codex results without entering the Claude adapter", () => {
  const { root } = fixture("codex-typed-results");
  let readyClaudeCalls = 0;
  const ready = inspectCliRulesetFreshness({
    repoPath: join(root, "valid-but-pre-head-consumer"),
    codexObservation: { status: "ready", observation: sourceObservation("a".repeat(40), "marketplace-private") },
    inspectClaude() { readyClaudeCalls += 1; throw new Error("Claude fallback must not run"); },
  });
  assert.equal(ready.status, "marketplace-private");
  assert.equal(ready.writePermitted, false);
  assert.equal(readyClaudeCalls, 0);

  const preHead = {
    ...sourceObservation("a".repeat(40)),
    loadedIdentity: { status: "unavailable" },
    installedIdentity: { status: "unavailable" },
  };
  const typed = [
    { status: "pre-head", observation: preHead },
    { status: "codex-plugin-list-ambiguous", observation: null },
    { status: "loaded-installed-mismatch", observation: sourceObservation("a".repeat(40), "marketplace-public", "b".repeat(40)) },
    { status: "self-application-unattested", observation: null },
    { status: "invalid-input", observation: null },
  ];
  for (const codexObservation of typed) {
    let claudeCalls = 0;
    const value = inspectCliRulesetFreshness({
      repoPath: join(root, "valid-but-pre-head-consumer"),
      codexObservation,
      inspectClaude() { claudeCalls += 1; throw new Error("Claude fallback must not run"); },
    });
    assert.equal(value.status, codexObservation.status);
    assert.equal(value.writePermitted, false);
    assert.equal(claudeCalls, 0);
  }
});

test("CLI falls back to Claude only for a genuine unavailable Codex discovery", () => {
  const expected = {
    schema: RULESET_FRESHNESS_SCHEMA,
    status: "marketplace-private",
    source: "marketplace-private",
    loadedSha: null,
    remoteSha: null,
    ahead: null,
    behind: null,
    writePermitted: false,
    reason: "public-remote-not-selected",
  };
  let received = null;
  const value = inspectCliRulesetFreshness({
    repoPath: "C:\\portable\\consumer",
    loadedSha: "a".repeat(40),
    codexObservation: { status: "codex-plugin-list-unavailable", observation: null },
    inspectClaude(repo, options) {
      received = { repo, options };
      return expected;
    },
  });
  assert.equal(value, expected);
  assert.deepEqual(received, {
    repo: "C:\\portable\\consumer",
    options: { loadedSha: "a".repeat(40) },
  });
});
