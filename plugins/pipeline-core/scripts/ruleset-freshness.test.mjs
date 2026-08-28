#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  createWslHostFailClosedSpawn,
  inspectPipelineUpdateAvailability,
  migrateLegacyRulesetFreshness,
  PIPELINE_UPDATE_AVAILABILITY_SCHEMA,
  PUBLIC_MARKETPLACE_URL,
  repositoryWritePermitted,
  resolvePipelineUpdateChannelConfig,
  runPipelineUpdateAvailabilityCli,
} from "./ruleset-freshness.mjs";
import {
  readProjectPipelineUpdateChannel,
  resolvePipelineUpdateChannel,
} from "./pipeline-update-channel.mjs";

const roots = [];
function git(cwd, ...args) {
  const out = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout.trim();
}
function configure(repo) {
  git(repo, "config", "user.email", "ruleset@example.invalid");
  git(repo, "config", "user.name", "Ruleset Test");
}
function manifestPath(repo) {
  return join(repo, "plugins", "pipeline-core", ".codex-plugin", "plugin.json");
}
function commitVersion(repo, version, name) {
  mkdirSync(join(repo, "plugins", "pipeline-core", ".codex-plugin"), { recursive: true });
  writeFileSync(manifestPath(repo), `${JSON.stringify({ name: "pipeline-core", version })}\n`);
  writeFileSync(join(repo, `${name}.txt`), `${name}\n`);
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", name);
}
function commit(repo, name) {
  writeFileSync(join(repo, `${name}.txt`), `${name}\n`);
  git(repo, "add", `${name}.txt`);
  git(repo, "commit", "-q", "-m", name);
}
function fixture(name, version = "0.4.7") {
  const root = mkdtempSync(join(tmpdir(), `ruleset-freshness-${name}-`));
  roots.push(root);
  const remote = join(root, "public.git");
  const source = join(root, "source");
  git(root, "init", "--bare", "-q", remote);
  git(root, "init", "-q", "-b", "main", source);
  configure(source);
  commitVersion(source, version, "base");
  git(source, "remote", "add", "public", remote);
  git(source, "push", "-q", "public", "main");
  git(remote, "symbolic-ref", "HEAD", "refs/heads/main");
  return { root, remote, source, pluginRoot: join(source, "plugins", "pipeline-core") };
}
function writeNeutralCalibration(repo, value) {
  const projectDir = join(repo, "project");
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, "pipeline.yaml"), "schemaVersion: 4\n");
  writeFileSync(join(projectDir, "pipeline.json"), JSON.stringify(value));
}
function snapshot(repo) {
  return {
    head: git(repo, "rev-parse", "HEAD"),
    refs: git(repo, "show-ref"),
    config: git(repo, "config", "--local", "--list"),
    status: git(repo, "status", "--porcelain=v1"),
    index: readFileSync(join(repo, ".git", "index")).toString("base64"),
  };
}
function blockingPolicy(build) {
  return {
    schema: "pipeline.ruleset-update-policy.v1",
    policyId: "pipeline-core-security-update-policy",
    policyVersion: 1,
    entries: [{
      id: "security-fixture",
      disposition: "blocking",
      publicSecurityReason: "This fixture build is affected by a public security issue.",
      match: { type: "exact-loaded-builds", builds: [build] },
    }],
  };
}

// ---- PX0-AC-13: honest fail-closed spawn for the CLI's two network-touching
// git calls (`ls-remote`, disposable-repo `fetch`) under the
// host-authorized-wsl boundary -- no subprocess is ever attempted for them. ----

/** A local disposable bare repo carrying exactly one valid stable release tag. */
function tagFixture(name, version) {
  const root = mkdtempSync(join(tmpdir(), `ruleset-freshness-cli-network-${name}-`));
  roots.push(root);
  const remote = join(root, "public.git");
  const source = join(root, "source");
  git(root, "init", "--bare", "-q", remote);
  git(root, "init", "-q", "-b", "main", source);
  configure(source);
  commit(source, "base");
  git(source, "tag", `v${version}`);
  git(source, "remote", "add", "public", remote);
  git(source, "push", "-q", "public", "main", "--tags");
  return remote;
}

/** Only `.claude/settings.json` shape `resolveMarketplaceUrl` accepts. */
function writeMarketplaceSettings(repo, url) {
  const match = String(url).match(/^https:\/\/github\.com\/(.+)\.git$/u);
  mkdirSync(join(repo, ".claude"), { recursive: true });
  writeFileSync(join(repo, ".claude", "settings.json"), JSON.stringify({
    extraKnownMarketplaces: { "agent-pipeline": { source: { source: "github", repo: match[1] } } },
  }));
}

/**
 * Inner spawn for local (non-network-delegated) calls reaching the CLI's
 * fail-closed `options.spawn` substitute. Genuinely runs `git` for every
 * call it receives -- it only ever rewrites the one reviewed
 * public-marketplace URL literal to a real local disposable fixture repo
 * path first (unused once no network-delegated call ever reaches it, but
 * kept so a local call, e.g. the loaded HEAD lookup, stays fully real).
 */
function localNetworkSubstituteSpawn(localRemoteUrl, calls) {
  return (command, args, opts) => {
    calls.push({ command, args: [...args], env: opts?.env });
    const rewritten = args.map((value) => (value === PUBLIC_MARKETPLACE_URL ? localRemoteUrl : value));
    return spawnSync(command, rewritten, opts);
  };
}

test("PX0-AC-13: under the host-authorized-wsl boundary, the update-availability CLI's network-delegated ls-remote never reaches any spawn substitute, while a local call still genuinely spawns and returns real data", () => {
  const remote = tagFixture("failclosed", "1.2.3");
  const repo = mkdtempSync(join(tmpdir(), "ruleset-freshness-cli-network-failclosed-repo-"));
  roots.push(repo);
  writeMarketplaceSettings(repo, PUBLIC_MARKETPLACE_URL);
  const calls = [];
  const createFailClosedSpawn = () => createWslHostFailClosedSpawn({
    spawn: localNetworkSubstituteSpawn(remote, calls),
  });
  let stdout = "";
  const execution = runPipelineUpdateAvailabilityCli(["--repo", repo], {
    env: { WSL_DISTRO_NAME: "Ubuntu" },
    createFailClosedSpawn,
    stdout: { write: (chunk) => { stdout += chunk; } },
  });
  assert.equal(calls.some((call) => call.args[0] === "ls-remote"), false,
    "a network-delegated call must never reach the substitute spawn -- no doomed sandbox attempt is made");
  assert.equal(calls.some((call) => call.args.includes("fetch")), false,
    "the disposable-repo fetch must likewise never reach the substitute spawn");
  const local = calls.find((call) => call.args.includes("rev-parse") && call.args.includes("HEAD"));
  assert.ok(local, "a genuinely local call (loaded HEAD) must still have been observed");
  assert.equal(local.command, "git", "local calls must pass straight through to the real spawn, unmodified");
  const result = JSON.parse(stdout);
  assert.equal(result.status, "unknown");
  assert.equal(result.reason, "remote-unavailable");
  assert.equal(execution.exitCode, 0);
});

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("loaded Pipeline equal/ahead results are metadata and never mutate the source", () => {
  const { remote, source, pluginRoot } = fixture("equal-ahead");
  const before = snapshot(source);
  let value = inspectPipelineUpdateAvailability(source, {
    remoteUrl: remote,
    pluginRoot,
    policy: null,
    selfApplication: true,
  });
  assert.equal(value.schema, PIPELINE_UPDATE_AVAILABILITY_SCHEMA);
  assert.deepEqual(Object.keys(value).sort(), [
    "blocking",
    "channel",
    "channelSource",
    "commit",
    "loaded",
    "marketplace",
    "pipelineUpdateAvailability",
    "policyDisposition",
    "reason",
    "ref",
    "schema",
    "status",
    "updateAvailable",
    "updateRecommended",
    "version",
  ]);
  assert.equal("branch" in value || "upstream" in value || "writePermitted" in value, false);
  assert.equal(value.status, "current");
  assert.equal(value.channel, "alpha");
  assert.equal(value.ref, "refs/heads/main");
  assert.equal(value.commit, before.head);
  assert.equal(value.pipelineUpdateAvailability, "current");
  assert.equal(value.updateRecommended, false);
  assert.equal(value.blocking, false);
  assert.deepEqual(snapshot(source), before);

  commit(source, "local");
  const aheadBefore = snapshot(source);
  value = inspectPipelineUpdateAvailability(source, {
    remoteUrl: remote,
    pluginRoot,
    policy: null,
    selfApplication: true,
  });
  assert.equal(value.status, "local-ahead");
  assert.equal(value.loaded.commit, aheadBefore.head);
  assert.equal(value.marketplace.commit, before.head);
  assert.equal(value.blocking, false);
  assert.deepEqual(snapshot(source), aheadBefore);
});

test("closed update-channel configuration defaults by distribution topology", () => {
  assert.deepEqual(resolvePipelineUpdateChannel({
    selfApplication: true,
  }), {
    status: "ready", channel: "alpha", source: "distribution-default",
    topology: "local-self-development", reason: null,
  });
  assert.deepEqual(resolvePipelineUpdateChannel({
    repoPath: "/tmp/consumer",
    pluginRoot: "/opt/pipeline-core",
  }), {
    status: "ready", channel: "stable", source: "distribution-default",
    topology: "installed-consumer", reason: null,
  });
  assert.equal(resolvePipelineUpdateChannel({ installedSource: "local-development" }).channel, "stable");
  assert.equal(resolvePipelineUpdateChannel({ updateChannel: "alpha" }).channel, "stable");
});

test("self-application topology keeps alpha when the loaded cache is outside its source checkout", () => {
  const { root, remote, source } = fixture("self-application-cache");
  const cache = join(root, "loaded-cache");
  git(root, "clone", "-q", remote, cache);
  const cachePluginRoot = join(cache, "plugins", "pipeline-core");
  const channel = resolvePipelineUpdateChannelConfig(source, {
    pluginRoot: cachePluginRoot,
    selfApplication: true,
  });
  assert.equal(channel.channel, "alpha");
  assert.equal(channel.topology, "local-self-development");
  assert.equal(resolvePipelineUpdateChannelConfig(source, {
    pluginRoot: cachePluginRoot,
  }).channel, "stable");
  const value = inspectPipelineUpdateAvailability(source, {
    remoteUrl: remote, pluginRoot: cachePluginRoot, policy: null, selfApplication: true,
  });
  assert.equal(value.channel, "alpha");
  assert.equal(value.ref, "refs/heads/main");
});

test("persisted project channel config is closed, read-only, and takes precedence", () => {
  const { remote, source, pluginRoot } = fixture("project-channel-config");
  const configDir = join(source, "project");
  for (const channel of ["alpha", "beta", "stable"]) {
    writeNeutralCalibration(source, {
      pipelineUpdateChannel: channel,
      ignoredRemote: "https://example.invalid/not-a-channel.git",
      ignoredRef: "refs/heads/untrusted",
    });
    const persisted = readProjectPipelineUpdateChannel(source);
    assert.equal(persisted.status, "ready");
    assert.equal(persisted.updateChannel, channel);
    assert.equal(resolvePipelineUpdateChannelConfig(source, {
      pluginRoot, selfApplication: true,
    }).channel, channel);
    if (channel === "alpha") {
      const value = inspectPipelineUpdateAvailability(source, {
        remoteUrl: remote, pluginRoot, policy: null, selfApplication: true,
      });
      assert.equal(value.channel, "alpha");
      assert.equal(value.ref, "refs/heads/main");
      assert.equal(value.status, "current");
      assert.equal(JSON.stringify(value).includes("example.invalid"), false);
    }
  }
  writeFileSync(join(configDir, "pipeline.json"), JSON.stringify({ pipelineUpdateChannel: "main" }));
  assert.equal(readProjectPipelineUpdateChannel(source).status, "unknown");
  writeFileSync(join(configDir, "pipeline.json"), "{not json");
  const malformed = readProjectPipelineUpdateChannel(source);
  assert.equal(malformed.status, "unknown");
  const unavailable = inspectPipelineUpdateAvailability(source, {
    remoteUrl: remote, pluginRoot, policy: null, selfApplication: true,
  });
  assert.equal(unavailable.status, "unknown");
  assert.equal(unavailable.reason, "channel-unavailable");
  assert.equal(unavailable.channel, null);
  assert.equal(unavailable.ref, null);
});

test("alpha observes only remote main", () => {
  const { root, remote, source, pluginRoot } = fixture("alpha-main");
  const publisher = join(root, "publisher");
  git(root, "clone", "-q", remote, publisher);
  configure(publisher);
  commitVersion(publisher, "0.4.8", "main-next");
  git(publisher, "push", "-q", "origin", "main");
  git(publisher, "tag", "v9.0.0");
  git(publisher, "push", "-q", "origin", "v9.0.0");

  const value = inspectPipelineUpdateAvailability(source, {
    remoteUrl: remote,
    pluginRoot,
    policy: null,
    projectConfig: { status: "ready", updateChannel: "alpha" },
  });
  assert.equal(value.channel, "alpha");
  assert.equal(value.ref, "refs/heads/main");
  assert.equal(value.version, "0.4.8");
  assert.equal(value.status, "update-available");
});

test("beta selects the highest valid beta or stable tag, including annotated tags", () => {
  const { root, remote, source, pluginRoot } = fixture("beta-tags");
  const publisher = join(root, "publisher");
  git(root, "clone", "-q", remote, publisher);
  configure(publisher);
  commitVersion(publisher, "0.5.0-beta.2", "beta-two");
  git(publisher, "tag", "-a", "v0.5.0-beta.2", "-m", "beta two");
  commitVersion(publisher, "0.5.0-beta.3", "beta-three");
  git(publisher, "tag", "v0.5.0-beta.3");
  git(publisher, "tag", "v0.5.1-beta.01");
  commitVersion(publisher, "0.5.0", "stable-promotion");
  git(publisher, "tag", "-a", "v0.5.0", "-m", "stable promotion");
  git(publisher, "tag", "v0.5.1");
  git(publisher, "tag", "v99.0.0");
  git(publisher, "tag", "vnot-semver");
  git(publisher, "push", "-q", "origin", "main", "--tags");

  const value = inspectPipelineUpdateAvailability(source, {
    remoteUrl: remote,
    pluginRoot,
    policy: null,
    projectConfig: { status: "ready", updateChannel: "beta" },
  });
  assert.equal(value.channel, "beta");
  assert.equal(value.ref, "refs/tags/v0.5.0");
  assert.equal(value.version, "0.5.0");
  assert.equal(value.commit, git(publisher, "rev-parse", "v0.5.0^{}"));
  assert.equal(value.status, "update-available");

  git(remote, "update-ref", "-d", "refs/tags/v0.5.0");
  const prerelease = inspectPipelineUpdateAvailability(source, {
    remoteUrl: remote,
    pluginRoot,
    policy: null,
    projectConfig: { status: "ready", updateChannel: "beta" },
  });
  assert.equal(prerelease.ref, "refs/tags/v0.5.0-beta.3");
  assert.equal(prerelease.version, "0.5.0-beta.3");
});

test("stable selects only the highest final release tag and invalid or absent tags fail typed", () => {
  const { root, remote, source, pluginRoot } = fixture("stable-tags");
  const publisher = join(root, "publisher");
  git(root, "clone", "-q", remote, publisher);
  configure(publisher);
  commitVersion(publisher, "0.6.0-beta.9", "prerelease");
  git(publisher, "tag", "v0.6.0-beta.9");
  commitVersion(publisher, "0.5.1", "final");
  git(publisher, "tag", "v0.5.1");
  git(publisher, "tag", "v0.5");
  git(publisher, "push", "-q", "origin", "main", "--tags");
  const stable = inspectPipelineUpdateAvailability(source, {
    remoteUrl: remote,
    pluginRoot,
    policy: null,
    projectConfig: { status: "ready", updateChannel: "stable" },
  });
  assert.equal(stable.ref, "refs/tags/v0.5.1");
  assert.equal(stable.version, "0.5.1");
  assert.equal(stable.status, "update-available");

  const empty = fixture("stable-empty");
  git(empty.source, "tag", "vnot-semver");
  git(empty.source, "push", "-q", "public", "vnot-semver");
  const unavailable = inspectPipelineUpdateAvailability(empty.source, {
    remoteUrl: empty.remote,
    pluginRoot: empty.pluginRoot,
    policy: null,
    projectConfig: { status: "ready", updateChannel: "stable" },
  });
  assert.equal(unavailable.status, "unknown");
  assert.equal(unavailable.reason, "channel-unavailable");
  assert.equal(unavailable.ref, null);
  assert.equal(unavailable.commit, null);
});

test("older loaded Pipeline is update-available but ordinary repository writes stay permitted", () => {
  const { root, remote, source, pluginRoot } = fixture("older");
  const publisher = join(root, "publisher");
  git(root, "clone", "-q", remote, publisher);
  configure(publisher);
  commitVersion(publisher, "0.4.8", "public-new");
  git(publisher, "push", "-q", "origin", "main");

  const value = inspectPipelineUpdateAvailability(source, {
    remoteUrl: remote,
    pluginRoot,
    policy: null,
    selfApplication: true,
  });
  assert.equal(value.status, "update-available");
  assert.equal(value.updateAvailable, true);
  assert.equal(value.updateRecommended, true);
  assert.equal(value.policyDisposition.disposition, "advisory");
  assert.equal(value.blocking, false);
  assert.equal(repositoryWritePermitted({ status: "equal" }, value), true);
});

test("loaded identity is independent from a Phoenix-shaped project checkout", () => {
  const { root, remote, source, pluginRoot } = fixture("phoenix");
  const projectRemote = join(root, "project.git");
  const project = join(root, "project");
  git(root, "init", "--bare", "-q", projectRemote);
  git(root, "init", "-q", "-b", "sprint_phoenix", project);
  configure(project);
  commit(project, "phoenix");
  git(project, "remote", "add", "origin", projectRemote);
  git(project, "push", "-q", "-u", "origin", "sprint_phoenix");

  const publisher = join(root, "publisher");
  git(root, "clone", "-q", remote, publisher);
  configure(publisher);
  commitVersion(publisher, "0.4.8", "marketplace-moved");
  git(publisher, "push", "-q", "origin", "main");

  const value = inspectPipelineUpdateAvailability(project, {
    remoteUrl: remote,
    pluginRoot,
    policy: null,
    projectConfig: { status: "ready", updateChannel: "alpha" },
  });
  assert.equal(value.status, "update-available");
  assert.equal(value.loaded.commit, git(source, "rev-parse", "HEAD"));
  assert.notEqual(value.loaded.commit, git(project, "rev-parse", "HEAD"));
  assert.equal(repositoryWritePermitted({ status: "equal", branch: "sprint_phoenix", upstream: "origin/sprint_phoenix" }, value), true);
});

test("offline and divergent loaded builds are typed unknown and nonblocking", () => {
  const { root, remote, source, pluginRoot } = fixture("unknown");
  const publisher = join(root, "publisher");
  git(root, "clone", "-q", remote, publisher);
  configure(publisher);
  commitVersion(publisher, "0.4.8", "public");
  git(publisher, "push", "-q", "origin", "main");
  commitVersion(source, "0.4.8-local.1", "private");
  const diverged = inspectPipelineUpdateAvailability(source, {
    remoteUrl: remote,
    pluginRoot,
    policy: null,
    selfApplication: true,
  });
  assert.equal(diverged.status, "unknown");
  assert.equal(diverged.reason, "loaded-marketplace-diverged");
  assert.equal(diverged.blocking, false);

  const offline = inspectPipelineUpdateAvailability(source, {
    remoteUrl: join(source, "missing.git"),
    pluginRoot,
    policy: null,
    selfApplication: true,
  });
  assert.equal(offline.status, "unknown");
  assert.equal(offline.reason, "remote-unavailable");
  assert.equal(offline.blocking, false);
  assert.equal(JSON.stringify(offline).includes("missing.git"), false);
});

test("only an exact plugin-shipped security policy match blocks", () => {
  const { remote, source, pluginRoot } = fixture("policy", "0.4.6");
  const commit = git(source, "rev-parse", "HEAD");
  const matched = inspectPipelineUpdateAvailability(source, {
    remoteUrl: remote,
    pluginRoot,
    policy: blockingPolicy({ version: "0.4.6", commit }),
  });
  assert.equal(matched.policyDisposition.status, "matched");
  assert.equal(matched.policyDisposition.blocking, true);
  assert.equal(matched.blocking, true);
  assert.equal(matched.updateRecommended, true);
  assert.equal(repositoryWritePermitted({ status: "equal" }, matched), false);

  const mismatch = inspectPipelineUpdateAvailability(source, {
    remoteUrl: remote,
    pluginRoot,
    policy: blockingPolicy({ version: "0.4.6", commit: "f".repeat(40) }),
  });
  assert.equal(mismatch.policyDisposition.status, "not-matched");
  assert.equal(mismatch.blocking, false);
  assert.equal(repositoryWritePermitted({ status: "equal" }, mismatch), true);
});

test("legacy writePermitted is update metadata and cannot override repository freshness", () => {
  const legacy = {
    schema: "pipeline.ruleset-freshness.v1",
    status: "behind",
    loadedSha: "a".repeat(40),
    remoteSha: "b".repeat(40),
    writePermitted: false,
  };
  const migrated = migrateLegacyRulesetFreshness(legacy);
  assert.equal(migrated.status, "update-available");
  assert.equal(migrated.reason, "legacy-ruleset-freshness-migrated");
  assert.equal(repositoryWritePermitted({ status: "equal" }, legacy), true);
  assert.equal(repositoryWritePermitted({ status: "behind" }, { ...legacy, writePermitted: true }), false);
});

test("availability CLI rejects the removed direct channel bypass", () => {
  let stderr = "";
  const execution = runPipelineUpdateAvailabilityCli(["--channel", "alpha"], {
    stderr: { write: (chunk) => { stderr += chunk; } },
  });
  assert.equal(execution.exitCode, 64);
  assert.match(stderr, /usage/u);
});

test("availability CLI reads only neutral channel authority and otherwise defaults stable", () => {
  const alphaRoot = mkdtempSync(join(tmpdir(), "ruleset-freshness-cli-alpha-"));
  const consumerRoot = mkdtempSync(join(tmpdir(), "ruleset-freshness-cli-consumer-"));
  roots.push(alphaRoot, consumerRoot);
  writeNeutralCalibration(alphaRoot, { pipelineUpdateChannel: "alpha" });
  mkdirSync(join(alphaRoot, ".claude"), { recursive: true });
  writeFileSync(join(alphaRoot, ".claude", "pipeline.yaml"), "schemaVersion: 4\n");
  writeFileSync(join(alphaRoot, ".claude", "pipeline.json"), JSON.stringify({ pipelineUpdateChannel: "stable" }));

  const invoke = (repo) => {
    let stdout = "";
    const execution = runPipelineUpdateAvailabilityCli([
      "--repo",
      repo,
      "--loaded-version",
      "0.4.7",
      "--loaded-commit",
      "a".repeat(40),
    ], {
      stdout: { write: (chunk) => { stdout += chunk; } },
    });
    return { ...execution, stdout };
  };

  const alpha = invoke(alphaRoot);
  assert.equal(alpha.exitCode, 0);
  assert.equal(JSON.parse(alpha.stdout).channel, "alpha");
  assert.equal(JSON.parse(alpha.stdout).channelSource, "project-config");

  const consumer = invoke(consumerRoot);
  assert.equal(consumer.exitCode, 0);
  assert.equal(JSON.parse(consumer.stdout).channel, "stable");
  assert.equal(JSON.parse(consumer.stdout).channelSource, "distribution-default");
});

test("a remote git process that ignores SIGTERM still settles within timeoutMs, not the process's own runtime", () => {
  // Regression for the SessionStart "unsettled top-level await" warning
  // (backlog/items/2026-08-19-staleness-check-unsettled-top-level-await-warning.md):
  // spawnSync's default killSignal is SIGTERM, which a stuck/misbehaving `git`
  // process can trap or otherwise fail to honor. Without a forced-kill
  // fallback, the synchronous call blocks until the child actually exits --
  // here simulated as 3s -- instead of settling near the caller-provided
  // timeoutMs, which is exactly the shape of a hang that outlives the host's
  // own hook-execution timeout in production.
  const { remote, source, pluginRoot } = fixture("hung-ls-remote");
  const timeoutMs = 200;
  const spawn = (command, args, opts) => {
    if (args.includes("ls-remote")) {
      // Ignores SIGTERM and stays alive ~3s, which is the only property this
      // fixture needs. Spawned through process.execPath rather than
      // `bash -c "trap '' TERM; sleep 3"` because CI's runner-free Core Verify
      // step trims PATH to node/git/bash/sh: without `sleep` the child exited
      // immediately, so the call returned "remote-unavailable" and the assertion
      // below read as a real regression (backlog:
      // pipeline.core-verify-cannot-pass-under-the-ci-trimmed-path).
      return spawnSync(
        process.execPath,
        ["-e", "process.on('SIGTERM', () => {}); setTimeout(() => {}, 3000);"],
        opts,
      );
    }
    return spawnSync(command, args, opts);
  };
  const start = Date.now();
  const value = inspectPipelineUpdateAvailability(source, {
    remoteUrl: remote,
    pluginRoot,
    policy: null,
    selfApplication: true,
    timeoutMs,
    spawn,
  });
  const elapsed = Date.now() - start;
  assert.ok(
    elapsed < timeoutMs * 5,
    `expected the call to settle near timeoutMs=${timeoutMs}ms (allowing kill/process overhead), took ${elapsed}ms instead`,
  );
  assert.equal(value.status, "unknown");
  assert.equal(value.reason, "timeout");
  assert.equal(value.blocking, false);
});
