#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  inspectPipelineUpdateAvailability,
  migrateLegacyRulesetFreshness,
  PIPELINE_UPDATE_AVAILABILITY_SCHEMA,
  repositoryWritePermitted,
} from "./ruleset-freshness.mjs";

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
  });
  assert.equal(value.schema, PIPELINE_UPDATE_AVAILABILITY_SCHEMA);
  assert.deepEqual(Object.keys(value).sort(), [
    "blocking",
    "loaded",
    "marketplace",
    "policyDisposition",
    "reason",
    "schema",
    "status",
    "updateAvailable",
    "updateRecommended",
  ]);
  assert.equal("branch" in value || "upstream" in value || "writePermitted" in value, false);
  assert.equal(value.status, "current");
  assert.equal(value.updateRecommended, false);
  assert.equal(value.blocking, false);
  assert.deepEqual(snapshot(source), before);

  commit(source, "local");
  const aheadBefore = snapshot(source);
  value = inspectPipelineUpdateAvailability(source, {
    remoteUrl: remote,
    pluginRoot,
    policy: null,
  });
  assert.equal(value.status, "local-ahead");
  assert.equal(value.loaded.commit, aheadBefore.head);
  assert.equal(value.marketplace.commit, before.head);
  assert.equal(value.blocking, false);
  assert.deepEqual(snapshot(source), aheadBefore);
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
  });
  assert.equal(diverged.status, "unknown");
  assert.equal(diverged.reason, "loaded-marketplace-diverged");
  assert.equal(diverged.blocking, false);

  const offline = inspectPipelineUpdateAvailability(source, {
    remoteUrl: join(source, "missing.git"),
    pluginRoot,
    policy: null,
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
