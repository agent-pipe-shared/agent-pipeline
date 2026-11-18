// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const PATCH = join(dirname(fileURLToPath(import.meta.url)), "w3111-the-token-only-rows-estimate-the-dollar-half-from-listed-prices.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/usage-ledger.mjs",
  "plugins/pipeline-core/scripts/usage-ledger.test.mjs",
  "plugins/pipeline-core/config/model-list-prices.json",
  "plugins/pipeline-core/skills/close-feature/SKILL.md",
  "plugins/pipeline-core/config/runner-capabilities.json",
  "plugins/pipeline-core/scripts/runner-capabilities.test.mjs",
  "plugins/pipeline-core/skills/pipeline-start/references/happy-path.md",
  "plugins/pipeline-core/skills/close-block/references/close-light-and-extensions.md",
]);

// The patch is a delta on the base clone of candidate 31, so it is not applied against the repository here.
test("the w3111 patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH));
  assert.ok(statSync(PATCH).size > 0);
});

test("the w3111 patch touches only the named files", () => {
  const files = readFileSync(PATCH, "utf8").split("\n").filter((line) => line.startsWith("diff --git ")).map((line) => line.split(" b/")[1]);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(ALLOWED.has(file), `unexpected file in patch: ${file}`);
  assert.equal(new Set(files).size, ALLOWED.size, "all eight files are touched");
});
