// SPDX-License-Identifier: SUL-1.0
// Held-patch check for C19-G1 (AC-140): the patch exists, applies to the repository HEAD and touches only the named files.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const REPO = resolve(import.meta.dirname, "..", "..", "..", "..");
const PATCH = join(import.meta.dirname, "w122-c19-g1-the-agent-prints-the-authorize-critical-line-for-deploy-publication-and-release-preflight.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/po-human-approval.mjs",
  "plugins/pipeline-core/scripts/pipeline-state.mjs",
  "plugins/pipeline-core/scripts/release-preflight-cli.mjs",
  "plugins/pipeline-core/templates/human-terminal-actions/catalog.json",
  "plugins/pipeline-core/scripts/release-preflight-cli.test.mjs",
  "plugins/pipeline-core/scripts/critical-human-proof-gate.test.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.test.mjs",
  "plugins/pipeline-core/lib/human-terminal-action-catalog.mjs",
  "plugins/pipeline-core/lib/human-terminal-action-catalog.test.mjs",
  "docs/human-authorization-inventory.md",
  "harness/scripts/check-auth-gate-inventory-drift.test.mjs",
]);

test("the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH));
  assert.ok(statSync(PATCH).size > 0);
});

test("git apply --check of the patch against the repository root exits 0", () => {
  const result = spawnSync("git", ["apply", "--check", PATCH], { cwd: REPO, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("the patch touches only the named files", () => {
  const result = spawnSync("git", ["apply", "--numstat", PATCH], { cwd: REPO, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const touched = result.stdout.split("\n").filter(Boolean).map((line) => line.split("\t")[2]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.has(path), `unexpected path ${path}`);
});
