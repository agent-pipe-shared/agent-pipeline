// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverStackMetadata, validateStackDiscovery } from "./stack-discovery.mjs";
const root = mkdtempSync(join(tmpdir(), "stack-discovery-")); const sentinel = join(root, "executed");
writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { postinstall: `touch ${sentinel}` } }));
execFileSync("git", ["-C", root, "init", "-q"]); execFileSync("git", ["-C", root, "config", "user.email", "stack@example.invalid"]); execFileSync("git", ["-C", root, "config", "user.name", "Stack test"]); execFileSync("git", ["-C", root, "add", "package.json"]); execFileSync("git", ["-C", root, "commit", "-qm", "fixture"]);
const candidate = { commit: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), tree: execFileSync("git", ["-C", root, "rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim() };
const one = discoverStackMetadata({ root, candidate }); const two = discoverStackMetadata({ root, candidate });
assert.equal(one.ok, true); assert.equal(one.digest, two.digest); assert.deepEqual(one.observations[0].trust, "untrusted"); assert.equal(existsSync(sentinel), false);
assert.deepEqual(validateStackDiscovery(one), { valid: true }); assert.equal(validateStackDiscovery({ ...one, digest: "c".repeat(64) }).valid, false);
assert.deepEqual(discoverStackMetadata({ root, candidate: {} }), { ok: false, code: "STACK-DISCOVERY-INVALID" });
assert.equal(discoverStackMetadata({ root, candidate: { ...candidate, tree: "c".repeat(40) } }).code, "STACK-DISCOVERY-CANDIDATE-MISMATCH");
console.log("3 stack discovery checks passed");
