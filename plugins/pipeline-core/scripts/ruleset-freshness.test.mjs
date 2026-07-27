#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { inspectRulesetFreshness, observePublicRemoteIdentity, PUBLIC_MARKETPLACE_URL, RULESET_FRESHNESS_SCHEMA } from "./ruleset-freshness.mjs";

const roots = [];
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
