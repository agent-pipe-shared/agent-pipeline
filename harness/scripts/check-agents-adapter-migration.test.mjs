// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { MIGRATED_AGENTS_ADAPTER } from "../../setup.mjs";
import { checkAgentsAdapterMigration } from "./check-agents-adapter-migration.mjs";

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`ok ${passed} - ${name}\n`); }

check("exact thin pointer is valid", () => assert.equal(checkAgentsAdapterMigration(MIGRATED_AGENTS_ADAPTER).ok, true));
for (const [name, text] of [
  ["missing adapter", null],
  ["second ruleset prose", `${MIGRATED_AGENTS_ADAPTER}\n## Guard rules\n`],
  ["private coordinate", `${MIGRATED_AGENTS_ADAPTER}\nprivate: synthetic\n`],
  ["Claude-hook equivalence", MIGRATED_AGENTS_ADAPTER.replace("no\nClaude hooks", "Claude hooks are equivalent")],
  ["global enforcement", MIGRATED_AGENTS_ADAPTER.replace("global host\nenforcement", "global host enforcement applies")],
]) {
  check(`${name} rejects fail-closed`, () => assert.equal(checkAgentsAdapterMigration(text).ok, false));
}
process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
