// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { discoverSbom, exportPublicSbom, previewSbomMigration } from "./sbom-discovery.mjs";
const sha = (value) => createHash("sha256").update(value).digest("hex"); let passed = 0;
function test(name, fn) { try { fn(); passed += 1; console.log(`PASS ${name}`); } catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; } }
const digest = (character) => character.repeat(64);
function canonicalManifest() { return {
  schema: "pipeline.sbom-manifest.v1", candidate: { repositoryFingerprint: sha("repo"), commit: "a".repeat(40), tree: "b".repeat(40) }, sourceInputs: [{ path: "package-lock.json", sha256: digest("c") }], adapter: { id: "node-reference", version: "1.0.0", configSha256: digest("d") },
  formats: [{ format: "cyclonedx-json", profile: "CycloneDX-1.6", payloadSha256: digest("e") }, { format: "spdx-json", profile: "SPDX-2.3", payloadSha256: digest("f") }], components: [{ id: "internal", scope: "internal/team", provenance: "registry", relationships: ["internal/child"] }],
  completeness: { status: "complete", declared: 1, observed: 1 }, freshness: { status: "fresh", candidateMatches: true, sourceInputsMatch: true }, privacy: { classification: "private", exportPolicy: "private-only" },
  payload: { canonicalSha256: digest("0"), formats: { "cyclonedx-json": { profile: "CycloneDX-1.6", sha256: digest("e") }, "spdx-json": { profile: "SPDX-2.3", sha256: digest("f") } } }, lifecycle: { state: "complete", code: "SBOM-COMPLETE" },
}; }
function fixture(dir, artifactPath) { mkdirSync(join(dir, "specs", "feature", artifactPath.split("/").slice(0, -1).join("/")), { recursive: true }); const bytes = "{}\n"; writeFileSync(join(dir, "specs", "feature", artifactPath), bytes); const manifest = { schema: "pipeline.feature-package.v1", feature: { id: "feature", rigor: 1 }, state: "draft", candidate: null, supersedes: null, artifacts: [{ class: "prd", path: "specs/feature/prd.md", sha256: sha("prd"), authority: true, mutability: "mutable", retention: "active" }, { class: "supply-chain", path: `specs/feature/${artifactPath}`, sha256: sha(bytes), authority: false, mutability: "immutable", retention: "retain" }] }; writeFileSync(join(dir, "specs", "feature", "prd.md"), "prd"); writeFileSync(join(dir, "specs", "feature", "lifecycle.json"), JSON.stringify(manifest)); }
test("resolves declared artifacts across differing layouts without guessing", () => { const first = mkdtempSync(join(tmpdir(), "sbom-one-")); const second = mkdtempSync(join(tmpdir(), "sbom-two-")); fixture(first, "evidence/bom.json"); fixture(second, "records/immutable/bom.json"); assert.equal(discoverSbom(first).artifact.path, "specs/feature/evidence/bom.json"); assert.equal(discoverSbom(second).artifact.path, "specs/feature/records/immutable/bom.json"); });
test("public export accepts only canonical manifests, redacts private identifiers and remains non-authoritative", () => { const canonical = canonicalManifest(); const result = exportPublicSbom(canonical); assert.equal(result.authoritative, false); assert.deepEqual(result.components[0], { id: "redacted", scope: "redacted", provenance: "redacted", relationships: [] }); assert.equal(canonical.components[0].scope, "internal/team"); assert.deepEqual(exportPublicSbom({ privacy: canonical.privacy, components: canonical.components, payload: canonical.payload }), { ok: false, code: "SBOM-EXPORT-INVALID" }); });
test("migration preview is zero-write and not-applicable for legacy-only roots", () => { const root = mkdtempSync(join(tmpdir(), "sbom-legacy-")); mkdirSync(join(root, "specs")); assert.deepEqual(previewSbomMigration(root).writes, []); assert.equal(previewSbomMigration(root).status, "not-applicable"); });
console.log(`\n${passed} passed`);
