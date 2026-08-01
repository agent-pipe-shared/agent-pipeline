#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicReleaseState } from "../lib/public-release-state.mjs";
import { checkReleaseStateConsistency } from "./check-release-state-consistency.mjs";
const root = mkdtempSync(join(tmpdir(), "release-state-")); mkdirSync(join(root, "docs"));
const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
assert.equal(git("init", "--quiet", "-b", "main").status, 0); git("config", "user.email", "release-state@example.invalid"); git("config", "user.name", "Release State Fixture");
writeFileSync(join(root, "release.txt"), "released\n"); git("add", "release.txt"); assert.equal(git("commit", "--quiet", "-m", "release").status, 0); assert.equal(git("tag", "v0.4.7").status, 0);
const commit = git("rev-parse", "v0.4.7^{commit}").stdout.trim(); const tree = git("rev-parse", "v0.4.7^{tree}").stdout.trim();
const projection = createPublicReleaseState({ version: "0.4.7", tag: "v0.4.7", commit, tree, publicationStatus: "published", releaseUrlClass: "public-release", observedAt: "2026-08-01T00:00:00.000Z" });
const write = (record, status = record.publicationStatus) => {
  writeFileSync(join(root, "docs/release-state.json"), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(join(root, "docs/state.md"), `**Release state:** version \`${record.version}\` · tag \`${record.tag}\` · commit \`${record.commit}\` · tree \`${record.tree}\` · status \`${status}\`\n`);
};
write(projection);
assert.equal(checkReleaseStateConsistency({ rootDir: root }).status, "consistent");
assert.deepEqual(checkReleaseStateConsistency({ rootDir: root }, { observeTag: () => ({ commit: "c".repeat(40), tree }) }).reasons, ["published-identity-mismatch"]);
const unpublished = createPublicReleaseState({ version: "0.4.7", tag: "v0.4.7", commit, tree, publicationStatus: "unpublished", releaseUrlClass: "none", observedAt: "2026-08-01T00:00:00.000Z" });
write(unpublished);
assert.deepEqual(checkReleaseStateConsistency({ rootDir: root }, { observeTag: () => ({ commit, tree }) }).reasons, ["observed-tag-marked-unpublished"]);
write(projection, "unpublished");
assert.deepEqual(checkReleaseStateConsistency({ rootDir: root }, { observeTag: () => ({ commit, tree }) }).reasons, ["state-projection-mismatch"]);
rmSync(root, { recursive: true, force: true }); console.log("release-state-consistency: 4 tests passed");
