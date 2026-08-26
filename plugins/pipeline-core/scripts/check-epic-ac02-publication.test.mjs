#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_ROOT, checkEpicAc02Publication, discoverFeaturePackageManifests } from "./check-epic-ac02-publication.mjs";
import { createPublicReleaseState } from "../lib/public-release-state.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function commit(root, file, contents, message) {
  writeFileSync(join(root, file), contents);
  git(root, ["add", "--", file]);
  git(root, ["commit", "-m", message, "--quiet"]);
  return git(root, ["rev-parse", "HEAD"]);
}

/** A throwaway repository with an independent Nova branch, so the real Git primitives this
 * check spawns (for-each-ref, merge-base --is-ancestor, cat-file -e) run against real objects,
 * not a hand-built receipt. */
function buildRepo() {
  const root = mkdtempSync(join(tmpdir(), "epic-ac02-"));
  git(root, ["init", "--quiet"]);
  git(root, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Epic AC02 Test"]);
  mkdirSync(join(root, "specs", "test-epic"), { recursive: true });
  commit(root, "README.md", "base\n", "base");
  const mainTip = git(root, ["rev-parse", "HEAD"]);

  git(root, ["checkout", "--quiet", "-b", "feat/sprint-nova-codex-v046"]);
  const novaTip = commit(root, "nova-only.txt", "nova work\n", "nova-only work");

  git(root, ["checkout", "--quiet", "main"]);
  git(root, ["merge", "--no-ff", "--quiet", "-m", "phoenix merges nova", "feat/sprint-nova-codex-v046"]);
  const boundCommit = git(root, ["rev-parse", "HEAD"]);
  const boundTree = git(root, ["rev-parse", "HEAD^{tree}"]);

  return { root, mainTip, novaTip, boundCommit, boundTree };
}

function writeManifest(root, candidate) {
  const manifest = {
    schema: "pipeline.feature-package.v1",
    feature: { id: "test-epic", rigor: 2 },
    state: "verifying",
    artifacts: [],
    candidate,
    supersedes: null,
  };
  writeFileSync(join(root, "specs", "test-epic", "lifecycle.json"), JSON.stringify(manifest));
}

function writeReleaseState(root, { commit: releasedCommit, tree: releasedTree }) {
  mkdirSync(join(root, "docs"), { recursive: true });
  const record = createPublicReleaseState({
    version: "0.1.0",
    tag: "v0.1.0",
    commit: releasedCommit,
    tree: releasedTree,
    publicationStatus: "published",
    releaseUrlClass: "public-release",
    observedAt: "2026-08-17T00:00:00.000Z",
  });
  writeFileSync(join(root, "docs", "release-state.json"), JSON.stringify(record));
}

check("fails when the bound commit's ancestry carries Nova's unpublished commit", () => {
  const repo = buildRepo();
  try {
    writeReleaseState(repo.root, { commit: repo.mainTip, tree: git(repo.root, ["rev-parse", `${repo.mainTip}^{tree}`]) });
    writeManifest(repo.root, { commit: repo.boundCommit, tree: repo.boundTree });
    const result = checkEpicAc02Publication(repo.root);
    assert.equal(result.ok, false);
    assert.equal(result.failed.length, 1);
    const receipt = result.failed[0].receipt;
    assert.equal(receipt.status, "verification-failed");
    assert.equal(receipt.code, "PSI-PUB-CONSUMES-UNPUBLISHED-COMMIT");
    assert.deepEqual(receipt.findings, [{ code: "PSI-PUB-CONSUMES-UNPUBLISHED-COMMIT", epic: "nova", commit: repo.novaTip }]);
  } finally { rmSync(repo.root, { recursive: true, force: true }); }
});

check("permits once the release state advances past the consumed Nova commit", () => {
  const repo = buildRepo();
  try {
    writeReleaseState(repo.root, { commit: repo.boundCommit, tree: repo.boundTree });
    writeManifest(repo.root, { commit: repo.boundCommit, tree: repo.boundTree });
    const result = checkEpicAc02Publication(repo.root);
    assert.equal(result.ok, true);
    const receipt = result.results[0].receipt;
    assert.equal(receipt.status, "verification-permitted");
    assert.equal(receipt.code, "PSI-PUB-SIBLING-CONSUMPTION-PUBLISHED");
    assert.deepEqual(receipt.publishedConsumptions, [{ epic: "nova", commit: repo.novaTip }]);
  } finally { rmSync(repo.root, { recursive: true, force: true }); }
});

check("permits a manifest with no bound candidate commit without touching Git observations", () => {
  const repo = buildRepo();
  try {
    writeManifest(repo.root, null);
    const result = checkEpicAc02Publication(repo.root);
    assert.equal(result.ok, true);
    assert.equal(result.results[0].receipt.code, "PSI-PUB-NO-BOUND-COMMIT");
  } finally { rmSync(repo.root, { recursive: true, force: true }); }
});

check("permits a candidate commit with no sibling-Epic ancestry at all", () => {
  const repo = buildRepo();
  try {
    writeReleaseState(repo.root, { commit: repo.mainTip, tree: git(repo.root, ["rev-parse", `${repo.mainTip}^{tree}`]) });
    writeManifest(repo.root, { commit: repo.mainTip, tree: git(repo.root, ["rev-parse", `${repo.mainTip}^{tree}`]) });
    const result = checkEpicAc02Publication(repo.root);
    assert.equal(result.ok, true);
    assert.equal(result.results[0].receipt.code, "PSI-PUB-NO-SIBLING-CONSUMPTION");
  } finally { rmSync(repo.root, { recursive: true, force: true }); }
});

check("exercises the real specs/*/lifecycle.json manifests this repository holds today", () => {
  const manifests = discoverFeaturePackageManifests(DEFAULT_ROOT);
  assert.ok(manifests.length >= 3, `expected at least the 3 known real manifests, saw ${manifests.length}`);
  const result = checkEpicAc02Publication(DEFAULT_ROOT);
  assert.equal(result.ok, true, JSON.stringify(result.failed));
  for (const { id, receipt } of result.results) {
    assert.equal(receipt.status, "verification-permitted", `${id}: ${receipt.code}`);
  }
});

check("standalone invocation exits non-zero on a real refusal, zero otherwise", () => {
  const repo = buildRepo();
  try {
    const scriptPath = join(DEFAULT_ROOT, "plugins", "pipeline-core", "scripts", "check-epic-ac02-publication.mjs");
    writeReleaseState(repo.root, { commit: repo.mainTip, tree: git(repo.root, ["rev-parse", `${repo.mainTip}^{tree}`]) });
    writeManifest(repo.root, { commit: repo.boundCommit, tree: repo.boundTree });
    const failing = spawnSync(process.execPath, [scriptPath], { cwd: repo.root, encoding: "utf8" });
    assert.equal(failing.status, 2);
    assert.match(failing.stderr, /PSI-PUB-CONSUMES-UNPUBLISHED-COMMIT/u);

    writeManifest(repo.root, null);
    const passing = spawnSync(process.execPath, [scriptPath], { cwd: repo.root, encoding: "utf8" });
    assert.equal(passing.status, 0);
  } finally { rmSync(repo.root, { recursive: true, force: true }); }
});

console.log(`epic-ac02-publication-check: ${passed} passed, 0 failed`);
