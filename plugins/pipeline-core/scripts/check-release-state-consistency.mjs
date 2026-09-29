#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validatePublicReleaseState } from "../lib/public-release-state.mjs";

export const RELEASE_STATE_CHECK_SCHEMA = "pipeline.release-state-consistency.v1";
const SCRIPT_PATH = fileURLToPath(import.meta.url); const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const FINAL_TAG = /^refs\/tags\/v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
function git(root, args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 10_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
}
function finalTagOrder(left, right) {
  const a = FINAL_TAG.exec(left.ref)?.slice(1).map(BigInt);
  const b = FINAL_TAG.exec(right.ref)?.slice(1).map(BigInt);
  if (!a || !b) return 0;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? -1 : 1;
  return 0;
}
function nativeObserveLatestFinal(root) {
  const remote = git(root, ["remote", "get-url", "origin"]);
  let main; let tags;
  if (remote.status === 0) {
    const listed = git(root, ["ls-remote", "origin", "refs/heads/main", "refs/tags/v*"]);
    if (listed.status !== 0) return null;
    const rows = listed.stdout.trim().split("\n").map((line) => line.match(/^([0-9a-f]{40,64})\s+(refs\/(?:heads|tags)\/\S+)$/u)).filter(Boolean);
    main = rows.find((row) => row[2] === "refs/heads/main")?.[1];
    tags = rows.filter((row) => FINAL_TAG.test(row[2])).map((row) => ({ ref: row[2], commit: rows.find((peeled) => peeled[2] === `${row[2]}^{}`)?.[1] ?? row[1] }));
  } else {
    main = git(root, ["rev-parse", "--verify", "refs/heads/main^{commit}"]).stdout?.trim();
    const listed = git(root, ["tag", "--list", "v*"]);
    if (listed.status !== 0) return null;
    tags = listed.stdout.trim().split("\n").filter((name) => FINAL_TAG.test(`refs/tags/${name}`))
      .map((name) => ({ ref: `refs/tags/${name}`, commit: nativeObserve(root, name)?.commit }));
  }
  if (!OID.test(main ?? "")) return null;
  const reachable = [];
  for (const tag of tags) {
    if (!OID.test(tag.commit ?? "")) return null;
    const ancestor = git(root, ["merge-base", "--is-ancestor", tag.commit, main]);
    if (ancestor.status === 0) reachable.push(tag);
    else if (ancestor.status !== 1) return null;
  }
  reachable.sort(finalTagOrder);
  return reachable[0] ?? null;
}
function nativeObserve(root, tag) {
  const commit = spawnSync("git", ["rev-parse", "--verify", `${tag}^{commit}`], { cwd: root, encoding: "utf8" });
  if (commit.status !== 0) return null;
  const tree = spawnSync("git", ["rev-parse", "--verify", `${tag}^{tree}`], { cwd: root, encoding: "utf8" });
  if (tree.status !== 0 || !OID.test(commit.stdout.trim()) || !OID.test(tree.stdout.trim())) return null;
  return { commit: commit.stdout.trim(), tree: tree.stdout.trim() };
}
export function checkReleaseStateConsistency({ rootDir, projectionPath = "docs/release-state.json", statePath = "docs/state.md" }, dependencies = {}) {
  const root = resolve(rootDir); let projection; let state;
  try {
    projection = JSON.parse(readFileSync(resolve(root, projectionPath), "utf8"));
    state = readFileSync(resolve(root, statePath), "utf8");
  }
  catch { return { schema: RELEASE_STATE_CHECK_SCHEMA, status: "blocked", reasons: ["documentation-unavailable"], version: null, tag: null, commit: null, tree: null }; }
  try { validatePublicReleaseState(projection); }
  catch { return { schema: RELEASE_STATE_CHECK_SCHEMA, status: "blocked", reasons: ["projection-invalid"], version: null, tag: null, commit: null, tree: null }; }
  const observed = (dependencies.observeTag ?? nativeObserve)(root, projection.tag); const reasons = [];
  if (projection.tag !== `v${projection.version}`) reasons.push("version-tag-mismatch");
  if (projection.publicationStatus === "published") {
    if (observed === null) reasons.push("published-tag-unobserved");
    else if (observed.commit !== projection.commit || observed.tree !== projection.tree) reasons.push("published-identity-mismatch");
    const latest = (dependencies.observeLatestFinalTag ?? nativeObserveLatestFinal)(root);
    if (latest === null) reasons.push("latest-final-tag-unavailable");
    else if (latest.ref !== `refs/tags/${projection.tag}` || latest.commit !== projection.commit) reasons.push("published-final-tag-stale");
    const versionFile = (dependencies.observeTaggedVersion ?? ((repo, tag) => git(repo, ["show", `${tag}:VERSION`]).stdout?.trim()))(root, projection.tag);
    if (versionFile !== projection.version) reasons.push("tagged-version-mismatch");
  } else if (observed !== null) reasons.push("observed-tag-marked-unpublished");
  const marker = `**Release state:** version \`${projection.version}\` · tag \`${projection.tag}\` · commit \`${projection.commit}\` · tree \`${projection.tree}\` · status \`${projection.publicationStatus}\``;
  if (!state.includes(marker)) reasons.push("state-projection-mismatch");
  return { schema: RELEASE_STATE_CHECK_SCHEMA, status: reasons.length === 0 ? "consistent" : "blocked", reasons, version: projection.version, tag: projection.tag, commit: projection.commit, tree: projection.tree };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  const rootIndex = process.argv.indexOf("--root");
  if (rootIndex < 0 || process.argv[rootIndex + 1] === undefined || process.argv.length !== 4) {
    process.stderr.write(`${JSON.stringify({ schema: RELEASE_STATE_CHECK_SCHEMA, status: "rejected", reasons: ["invalid-cli"], version: null, tag: null, commit: null, tree: null })}\n`); process.exitCode = 2;
  } else {
    const result = checkReleaseStateConsistency({ rootDir: process.argv[rootIndex + 1] }); process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.status === "consistent" ? 0 : 2;
  }
}
