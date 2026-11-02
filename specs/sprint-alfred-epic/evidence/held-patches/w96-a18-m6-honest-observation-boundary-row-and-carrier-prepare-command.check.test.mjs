// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const PATCH = join(import.meta.dirname, "w96-a18-m6-honest-observation-boundary-row-and-carrier-prepare-command.patch");
const ALLOWED = [
  "plugins/pipeline-core/config/runner-capabilities.json",
  "plugins/pipeline-core/scripts/runner-capabilities.test.mjs",
  "plugins/pipeline-core/skills/pipeline-start/references/happy-path.md",
  "plugins/pipeline-core/hooks/guard-dispatch.mjs",
  "plugins/pipeline-core/hooks/guard-dispatch.test.mjs",
];

test("the w96 patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH));
  assert.ok(statSync(PATCH).size > 0);
});

test("the w96 patch applies to the repository root", () => {
  const result = spawnSync("git", ["apply", "--check", PATCH], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("the w96 patch touches only the named files", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = new Set([...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]));
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(ALLOWED.includes(file), `unexpected file ${file}`);
});
