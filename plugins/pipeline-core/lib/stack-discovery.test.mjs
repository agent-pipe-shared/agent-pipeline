// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverStackMetadata } from "./stack-discovery.mjs";
const root = mkdtempSync(join(tmpdir(), "stack-discovery-")); const sentinel = join(root, "executed");
writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { postinstall: `touch ${sentinel}` } }));
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const one = discoverStackMetadata({ root, candidate }); const two = discoverStackMetadata({ root, candidate });
assert.equal(one.ok, true); assert.equal(one.digest, two.digest); assert.deepEqual(one.observations[0].trust, "untrusted"); assert.equal(existsSync(sentinel), false);
assert.deepEqual(discoverStackMetadata({ root, candidate: {} }), { ok: false, code: "STACK-DISCOVERY-INVALID" });
console.log("3 stack discovery checks passed");
