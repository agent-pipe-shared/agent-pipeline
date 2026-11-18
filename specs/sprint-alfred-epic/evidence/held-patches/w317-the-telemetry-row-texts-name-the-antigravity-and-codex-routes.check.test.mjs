// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const PATCH = join(dirname(fileURLToPath(import.meta.url)), "w317-the-telemetry-row-texts-name-the-antigravity-and-codex-routes.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/skills/pipeline-start/references/happy-path.md",
  "plugins/pipeline-core/config/runner-capabilities.json",
  "plugins/pipeline-core/scripts/runner-capabilities.test.mjs",
  "plugins/pipeline-core/skills/close-block/references/close-light-and-extensions.md",
]);

test("the w317 patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH));
  assert.ok(statSync(PATCH).size > 0);
});

test("the w317 patch touches only the four named files", () => {
  const files = readFileSync(PATCH, "utf8").split("\n").filter((line) => line.startsWith("diff --git ")).map((line) => line.split(" b/")[1]);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(ALLOWED.has(file), `unexpected file in patch: ${file}`);
  assert.equal(new Set(files).size, ALLOWED.size, "all four files are touched");
});
