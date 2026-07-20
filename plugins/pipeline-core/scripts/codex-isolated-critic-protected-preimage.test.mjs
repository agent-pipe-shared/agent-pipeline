#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..", "..");
const inventoryPath = join(scriptDir, "codex-isolated-critic-protected-preimage.v1.json");
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
const EXPECTED_PATHS = [
  "harness/review-protocol.md",
  "plugins/pipeline-core/agents/critic.md",
  "plugins/pipeline-core/scripts/codex-critic-dispatch.schema.json",
  "plugins/pipeline-core/scripts/codex-critic-host-return.schema.json",
  "plugins/pipeline-core/scripts/codex-critic-host.mjs",
  "plugins/pipeline-core/scripts/codex-critic-receipt.schema.json",
  "plugins/pipeline-core/scripts/critic-verdict.schema.json",
  "plugins/pipeline-core/skills/critic-review/SKILL.md",
  "roles/critic.md",
];

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

check("F1 protected inventory is closed and bound to the Storm baseline", () => {
  assert.deepEqual(Object.keys(inventory), ["schema", "baselineCommit", "files"]);
  assert.equal(inventory.schema, "pipeline.codex-isolated-critic-protected-preimage.v1");
  assert.equal(inventory.baselineCommit, "3e811d4f82652fa6b666e4e6df02e79d00c6c881");
  assert.deepEqual(inventory.files.map((entry) => entry.path), EXPECTED_PATHS);
  assert.equal(new Set(inventory.files.map((entry) => entry.path)).size, EXPECTED_PATHS.length);
});

check("F1 protected paths are regular in-repository files without aliasing", () => {
  const rootReal = realpathSync(repoRoot);
  for (const entry of inventory.files) {
    assert.deepEqual(Object.keys(entry), ["path", "rawSha256"]);
    assert.match(entry.path, /^[A-Za-z0-9][A-Za-z0-9._/-]*$/);
    const candidate = join(repoRoot, ...entry.path.split("/"));
    const candidateReal = realpathSync(candidate);
    assert.equal(candidateReal.startsWith(`${rootReal}${sep}`), true);
    assert.equal(relative(rootReal, candidateReal).split(sep).join("/"), entry.path);
    assert.equal(statSync(candidateReal).isFile(), true);
  }
});

check("F1 current Critic execution surfaces remain byte-identical to Storm", () => {
  for (const entry of inventory.files) {
    const actual = digest(readFileSync(join(repoRoot, ...entry.path.split("/"))));
    assert.equal(actual, entry.rawSha256, entry.path);
  }
});

check("F1 inventory records full lowercase SHA-256 values", () => {
  for (const entry of inventory.files) assert.match(entry.rawSha256, /^[0-9a-f]{64}$/);
});

process.stdout.write(`1..${passed}\n`);
