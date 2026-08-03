#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validatePublicReleaseState } from "../lib/public-release-state.mjs";

export const RELEASE_STATE_CHECK_SCHEMA = "pipeline.release-state-consistency.v1";
const SCRIPT_PATH = fileURLToPath(import.meta.url); const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
function nativeObserve(root, tag) {
  const commit = spawnSync("git", ["rev-parse", "--verify", `${tag}^{commit}`], { cwd: root, encoding: "utf8" });
  if (commit.status !== 0) return null;
  const tree = spawnSync("git", ["rev-parse", "--verify", `${tag}^{tree}`], { cwd: root, encoding: "utf8" });
  if (tree.status !== 0 || !OID.test(commit.stdout.trim()) || !OID.test(tree.stdout.trim())) return null;
  return { commit: commit.stdout.trim(), tree: tree.stdout.trim() };
}
export function checkReleaseStateConsistency({ rootDir, projectionPath = "docs/release-state.json", statePath = "docs/state.md" }, dependencies = {}) {
  const root = resolve(rootDir); let projection; let state; let version;
  try {
    projection = JSON.parse(readFileSync(resolve(root, projectionPath), "utf8"));
    state = readFileSync(resolve(root, statePath), "utf8");
    version = readFileSync(resolve(root, "VERSION"), "utf8").trim();
  }
  catch { return { schema: RELEASE_STATE_CHECK_SCHEMA, status: "blocked", reasons: ["documentation-unavailable"], version: null, tag: null, commit: null, tree: null }; }
  try { validatePublicReleaseState(projection); }
  catch { return { schema: RELEASE_STATE_CHECK_SCHEMA, status: "blocked", reasons: ["projection-invalid"], version: null, tag: null, commit: null, tree: null }; }
  const observed = (dependencies.observeTag ?? nativeObserve)(root, projection.tag); const reasons = [];
  if (projection.tag !== `v${projection.version}`) reasons.push("version-tag-mismatch");
  if (version !== projection.version) reasons.push("source-version-projection-mismatch");
  if (projection.publicationStatus === "published") {
    if (observed === null) reasons.push("published-tag-unobserved");
    else if (observed.commit !== projection.commit || observed.tree !== projection.tree) reasons.push("published-identity-mismatch");
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
