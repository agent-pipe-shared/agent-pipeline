// SPDX-License-Identifier: SUL-1.0
// C30G-D3 check: the held patch exists, is not empty, applies to the repository HEAD and touches only the briefed files.
// No producer or product run.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const PATCH = join(import.meta.dirname, "w30g3-plugin-reload-leaves-no-dead-end.patch");
const REPOSITORY_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/pipeline-start-preflight.mjs",
  "plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs",
  "plugins/pipeline-core/scripts/repair-map.mjs",
  "plugins/pipeline-core/scripts/repair-map.test.mjs",
  "plugins/pipeline-core/lib/session-authority-registry.mjs",
  "plugins/pipeline-core/lib/hook-currentness.mjs",
  "plugins/pipeline-core/skills/pipeline-start/references/local-plugin-attestation.md",
]);

test("the patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0);
});

test("the patch applies to the repository HEAD (git apply --check)", { timeout: 60_000 }, () => {
  const result = spawnSync("git", ["apply", "--check", PATCH], { cwd: REPOSITORY_ROOT, encoding: "utf8", timeout: 50_000 });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test("the patch touches only the briefed files", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `${path} is outside the briefed files`);
});
