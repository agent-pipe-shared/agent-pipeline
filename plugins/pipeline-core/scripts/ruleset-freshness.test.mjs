#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { inspectRulesetFreshness, RULESET_FRESHNESS_SCHEMA } from "./ruleset-freshness.mjs";

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

test.after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("self-application accepts equal and descendant local rulesets", () => {
  const { remote, source } = fixture("ahead");
  let value = inspectRulesetFreshness(source, { remoteUrl: remote, selfApplication: true });
  assert.equal(value.schema, RULESET_FRESHNESS_SCHEMA);
  assert.equal(value.status, "equal");
  assert.equal(value.writePermitted, true);
  commit(source, "local");
  value = inspectRulesetFreshness(source, { remoteUrl: remote, selfApplication: true });
  assert.equal(value.status, "ahead");
  assert.equal(value.ahead, 1);
  assert.equal(value.behind, 0);
  assert.equal(value.writePermitted, true);
});

test("self-application rejects behind and diverged rulesets", () => {
  const { root, remote, source } = fixture("noncurrent");
  const publisher = join(root, "publisher");
  git(root, "clone", "-q", remote, publisher);
  git(publisher, "config", "user.email", "ruleset@example.invalid");
  git(publisher, "config", "user.name", "Ruleset Test");
  commit(publisher, "public-new");
  git(publisher, "push", "-q", "origin", "main");
  let value = inspectRulesetFreshness(source, { remoteUrl: remote, selfApplication: true });
  assert.equal(value.status, "behind");
  assert.equal(value.writePermitted, false);
  commit(source, "private-new");
  value = inspectRulesetFreshness(source, { remoteUrl: remote, selfApplication: true });
  assert.equal(value.status, "diverged");
  assert.equal(value.writePermitted, false);
});

test("consumer mismatch stays stale and remote failure stays unknown", () => {
  const { remote, source } = fixture("consumer");
  commit(source, "installed-drift");
  const stale = inspectRulesetFreshness(source, { remoteUrl: remote, selfApplication: false });
  assert.equal(stale.status, "stale");
  assert.equal(stale.writePermitted, false);
  const unknown = inspectRulesetFreshness(source, { remoteUrl: join(source, "missing.git"), selfApplication: true });
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.reason, "remote-unavailable");
  assert.equal(JSON.stringify(unknown).includes("missing.git"), false);
});
