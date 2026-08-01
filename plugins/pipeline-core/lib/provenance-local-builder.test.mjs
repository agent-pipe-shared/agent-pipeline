// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLocalProvenance } from "./provenance-local-builder.mjs";

const hash = (letter) => letter.repeat(64);
const root = mkdtempSync(join(tmpdir(), "provenance-builder-"));
mkdirSync(join(root, "dist"));
writeFileSync(join(root, "dist", "plugin.tgz"), "artifact\n");
writeFileSync(join(root, "package-lock.json"), "lock\n");
writeFileSync(join(root, "plugin.json"), "plugin\n");
const input = { root, artifact: { id: "plugin.tgz", path: "dist/plugin.tgz" }, candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, materials: ["plugin.json", "package-lock.json"], builder: { id: "local-reference", digest: hash("c") }, invocation: { id: "pack", parametersSha256: hash("d") }, environment: { kind: "test", identitySha256: hash("e") } };
const first = buildLocalProvenance(input);
const second = buildLocalProvenance(input);
assert.equal(first.ok, true);
assert.deepEqual(first, second);
assert.deepEqual(first.envelope.materials.map((entry) => entry.id), ["package-lock.json", "plugin.json"]);
assert.equal(first.envelope.assurance, "unverified");
assert.equal(buildLocalProvenance({ ...input, artifact: { ...input.artifact, path: "../outside" } }).code, "PROVENANCE-BUILDER-FILE-INVALID");
assert.equal(buildLocalProvenance({ ...input, materials: ["missing"] }).code, "PROVENANCE-BUILDER-FILE-INVALID");
console.log("5 provenance local-builder checks passed");
