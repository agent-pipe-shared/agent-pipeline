// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { generateNodeSbom, NODE_GRAPH_SCHEMA } from "./sbom-node-adapter.mjs";
import { evaluateSbomLifecycle } from "./sbom-manifest.mjs";
import { exportPublicSbom, previewSbomMigration } from "./sbom-discovery.mjs";
import { bindSbomRelease } from "./sbom-release-binding.mjs";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
let passed = 0; function test(name, fn) { try { fn(); passed += 1; console.log(`PASS ${name}`); } catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; } }
const base = { schema: NODE_GRAPH_SCHEMA, components: [{ id: "pkg:npm/a@1", scope: "app", name: "a", version: "1", dependencies: [] }] };
const facts = { applicability: "applicable", availability: "available", support: "supported", record: "present", candidateMatches: true, sourceInputsMatch: true, completeness: "complete" };
const digest = (value) => createHash("sha256").update(value).digest("hex");
function canonicalPrivateManifest() {
  const generated = generateNodeSbom(base); const payloadDigest = digest(Object.entries(generated.digests).map(([format, hash]) => `${format}:${hash}`).sort().join("\n"));
  return { schema: "pipeline.sbom-manifest.v1", candidate: { repositoryFingerprint: "f".repeat(64), commit: "a".repeat(40), tree: "b".repeat(40) }, sourceInputs: [{ path: "package-lock.json", sha256: "c".repeat(64) }], adapter: { id: "node-reference", version: "1", configSha256: "d".repeat(64) }, formats: [{ format: "cyclonedx-json", profile: "CycloneDX-1.6", payloadSha256: generated.digests["cyclonedx-json"] }, { format: "spdx-json", profile: "SPDX-2.3", payloadSha256: generated.digests["spdx-json"] }], components: [{ id: "secret", scope: "secret", provenance: "secret", relationships: ["secret"] }], completeness: { status: "complete", declared: 1, observed: 1 }, freshness: { status: "fresh", candidateMatches: true, sourceInputsMatch: true }, privacy: { classification: "private", exportPolicy: "private-only" }, payload: { canonicalSha256: payloadDigest, formats: { "cyclonedx-json": { profile: "CycloneDX-1.6", sha256: generated.digests["cyclonedx-json"] }, "spdx-json": { profile: "SPDX-2.3", sha256: generated.digests["spdx-json"] } } }, lifecycle: { state: "complete", code: "SBOM-COMPLETE" } };
}
test("single ecosystem", () => assert.equal(generateNodeSbom(base).valid, true));
test("multi ecosystem fixture semantics", () => assert.equal(generateNodeSbom({ ...base, components: [...base.components, { id: "pkg:other/b@1", scope: "other", name: "b", version: "1", dependencies: [] }] }).valid, true));
test("monorepo preserves separate scopes", () => assert.match(JSON.stringify(generateNodeSbom({ ...base, components: [...base.components, { id: "pkg:npm/b@1", scope: "packages/b", name: "b", version: "1", dependencies: [] }] }).cyclonedx), /packages\/b/));
test("missing transitive dependency", () => assert.equal(generateNodeSbom({ ...base, components: [{ ...base.components[0], dependencies: ["pkg:npm/missing@1"] }] }).code, "SBOM-NODE-TRANSITIVE-MISSING"));
test("unsupported component", () => assert.equal(evaluateSbomLifecycle({ ...facts, support: "unsupported" }).state, "unsupported"));
test("stale lockfile", () => assert.equal(evaluateSbomLifecycle({ ...facts, sourceInputsMatch: false }).state, "stale"));
test("malformed payload", () => assert.equal(generateNodeSbom({ schema: NODE_GRAPH_SCHEMA, components: [{}] }).valid, false));
test("digest mismatch class", () => assert.equal(evaluateSbomLifecycle({ ...facts, record: "invalid" }).state, "invalid"));
test("lossy conversion preserves relationships", () => { const graph = { ...base, components: [{ ...base.components[0], dependencies: ["pkg:npm/b@1"] }, { id: "pkg:npm/b@1", scope: "lib", name: "b", version: "1", dependencies: [] }] }; assert.equal(generateNodeSbom(graph).spdx.relationships[0].relatedSpdxElement, "SPDXRef-pkg:npm/b@1"); });
test("private metadata redaction", () => assert.equal(exportPublicSbom(canonicalPrivateManifest()).components[0].scope, "redacted"));
test("unsafe topology has no inferred artifact", () => { const root = mkdtempSync(join(tmpdir(), "sbom-unsafe-")); mkdirSync(join(root, "specs")); assert.equal(previewSbomMigration(root).status, "not-applicable"); });
test("deterministic regeneration", () => assert.deepEqual(generateNodeSbom(base).digests, generateNodeSbom(structuredClone(base)).digests));
test("release delta precondition", () => assert.equal(bindSbomRelease([], { release: "x", manifest: {}, validation: {} }).ok, false));
test("legacy baseline zero-write", () => { const root = mkdtempSync(join(tmpdir(), "sbom-legacy-")); mkdirSync(join(root, "specs")); assert.deepEqual(previewSbomMigration(root).writes, []); });
console.log(`\n${passed} fixture classes passed`);
