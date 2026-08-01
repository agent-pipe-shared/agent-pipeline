// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { discoverSbom, exportPublicSbom, previewSbomMigration } from "./sbom-discovery.mjs";
const sha = (value) => createHash("sha256").update(value).digest("hex"); let passed = 0;
function test(name, fn) { try { fn(); passed += 1; console.log(`PASS ${name}`); } catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; } }
function fixture(dir, artifactPath) { mkdirSync(join(dir, "specs", "feature", artifactPath.split("/").slice(0, -1).join("/")), { recursive: true }); const bytes = "{}\n"; writeFileSync(join(dir, "specs", "feature", artifactPath), bytes); const manifest = { schema: "pipeline.feature-package.v1", feature: { id: "feature", rigor: 1 }, state: "draft", candidate: null, supersedes: null, artifacts: [{ class: "prd", path: "specs/feature/prd.md", sha256: sha("prd"), authority: true, mutability: "mutable", retention: "active" }, { class: "supply-chain", path: `specs/feature/${artifactPath}`, sha256: sha(bytes), authority: false, mutability: "immutable", retention: "retain" }] }; writeFileSync(join(dir, "specs", "feature", "prd.md"), "prd"); writeFileSync(join(dir, "specs", "feature", "lifecycle.json"), JSON.stringify(manifest)); }
test("resolves declared artifacts across differing layouts without guessing", () => { const first = mkdtempSync(join(tmpdir(), "sbom-one-")); const second = mkdtempSync(join(tmpdir(), "sbom-two-")); fixture(first, "evidence/bom.json"); fixture(second, "records/immutable/bom.json"); assert.equal(discoverSbom(first).artifact.path, "specs/feature/evidence/bom.json"); assert.equal(discoverSbom(second).artifact.path, "specs/feature/records/immutable/bom.json"); });
test("public export redacts private canonical values and remains non-authoritative", () => { const canonical = { privacy: { classification: "private", exportPolicy: "private-only" }, components: [{ id: "internal", provenance: "registry", relationships: [] }], payload: { canonicalSha256: "a".repeat(64) } }; const result = exportPublicSbom(canonical); assert.equal(result.authoritative, false); assert.equal(result.components[0].id, "redacted"); assert.equal(canonical.components[0].id, "internal"); });
test("migration preview is zero-write and not-applicable for legacy-only roots", () => { const root = mkdtempSync(join(tmpdir(), "sbom-legacy-")); mkdirSync(join(root, "specs")); assert.deepEqual(previewSbomMigration(root).writes, []); assert.equal(previewSbomMigration(root).status, "not-applicable"); });
console.log(`\n${passed} passed`);
