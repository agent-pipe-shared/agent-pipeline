// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { CURRENT_MIGRATED_AGENTS_ADAPTER, MIGRATED_AGENTS_ADAPTER } from "../../setup.mjs";
import { checkAgentsAdapterMigration } from "./check-agents-adapter-migration.mjs";

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`ok ${passed} - ${name}\n`); }

check("legacy v1 thin pointer remains valid", () => {
  const result = checkAgentsAdapterMigration(MIGRATED_AGENTS_ADAPTER);
  assert.equal(result.ok, true);
  assert.equal(result.version, "v1-runtime-pointer");
});
check("current v2 architecture-map adapter is valid", () => {
  const result = checkAgentsAdapterMigration(CURRENT_MIGRATED_AGENTS_ADAPTER);
  assert.equal(result.ok, true);
  assert.equal(result.version, "v2-architecture-map");
});
for (const [name, text] of [
  ["missing adapter", null],
  ["second ruleset prose", `${MIGRATED_AGENTS_ADAPTER}\n## Guard rules\n`],
  ["map-enabled lookalike", CURRENT_MIGRATED_AGENTS_ADAPTER.replace("6. Owned implementation surface", "7. Owned implementation surface")],
  ["private coordinate", `${MIGRATED_AGENTS_ADAPTER}\nprivate: synthetic\n`],
  ["Claude-hook equivalence", MIGRATED_AGENTS_ADAPTER.replace("no\nClaude hooks", "Claude hooks are equivalent")],
  ["global enforcement", MIGRATED_AGENTS_ADAPTER.replace("global host\nenforcement", "global host enforcement applies")],
]) {
  check(`${name} rejects fail-closed`, () => assert.equal(checkAgentsAdapterMigration(text).ok, false));
}
process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
