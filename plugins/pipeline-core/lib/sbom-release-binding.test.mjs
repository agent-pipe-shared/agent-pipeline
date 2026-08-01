// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateNodeSbom, NODE_GRAPH_SCHEMA } from "./sbom-node-adapter.mjs";
import { bindSbomRelease, buildSbomAuditBundle } from "./sbom-release-binding.mjs";

let passed = 0; function test(name, fn) { try { fn(); passed += 1; console.log(`PASS ${name}`); } catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; } }
const digest = (value) => createHash("sha256").update(value).digest("hex");
const candidate = { repositoryFingerprint: "a".repeat(64), commit: "b".repeat(40), tree: "c".repeat(40) };

function input(release, ids = ["pkg:npm/a@1"]) {
  const graph = { schema: NODE_GRAPH_SCHEMA, components: ids.map((id) => ({ id, scope: "root", provenance: "lock", name: id.split("/").at(-1).split("@")[0], version: "1", dependencies: [] })) };
  const generated = generateNodeSbom(graph);
  const recordDigest = digest(Object.entries(generated.digests).map(([format, hash]) => `${format}:${hash}`).sort().join("\n"));
  const manifest = {
    schema: "pipeline.sbom-manifest.v1", candidate, sourceInputs: [{ path: "lock", sha256: "d".repeat(64) }], adapter: { id: "node", version: "1", configSha256: "e".repeat(64) },
    formats: [{ format: "cyclonedx-json", profile: "CycloneDX-1.6", payloadSha256: generated.digests["cyclonedx-json"] }, { format: "spdx-json", profile: "SPDX-2.3", payloadSha256: generated.digests["spdx-json"] }],
    components: graph.components.map((component) => ({ id: component.id, scope: component.scope, provenance: "lock", relationships: component.dependencies })), completeness: { status: "complete", declared: ids.length, observed: ids.length }, freshness: { status: "fresh", candidateMatches: true, sourceInputsMatch: true }, privacy: { classification: "public", exportPolicy: "public-redacted" },
    payload: { canonicalSha256: recordDigest, formats: { "cyclonedx-json": { profile: "CycloneDX-1.6", sha256: generated.digests["cyclonedx-json"] }, "spdx-json": { profile: "SPDX-2.3", sha256: generated.digests["spdx-json"] } } }, lifecycle: { state: "complete", code: "SBOM-COMPLETE" },
  };
  return { release, manifest, payloads: { "cyclonedx-json": generated.cyclonedx, "spdx-json": generated.spdx }, observedCandidate: candidate, validation: { valid: true, digest: recordDigest } };
}

test("binds an immutable release and computes the next delta", () => { const first = bindSbomRelease([], input("1.0.0", ["pkg:npm/a@1", "pkg:npm/b@1"])); const second = bindSbomRelease(first.history, input("1.1.0", ["pkg:npm/b@1", "pkg:npm/c@1"])); assert.deepEqual(second.entry.delta, { added: ["pkg:npm/c@1"], removed: ["pkg:npm/a@1"] }); assert.equal(bindSbomRelease(second.history, input("1.1.0")).code, "SBOM-RELEASE-IMMUTABLE"); });
test("rejects stale, partial or invalid release inputs", () => { const valid = input("1.0.0"); assert.equal(bindSbomRelease([], { ...valid, manifest: { ...valid.manifest, freshness: { status: "stale" } } }).ok, false); assert.equal(bindSbomRelease([], { ...valid, validation: { valid: false } }).code, "SBOM-RELEASE-PRECONDITION"); });
test("release binding recomputes both payload profiles and candidate identity", () => { const valid = input("1.0.0"); const malformed = { ...valid, payloads: { ...valid.payloads, "cyclonedx-json": { ...valid.payloads["cyclonedx-json"], dependencies: [{ ref: "pkg:npm/invented@1", dependsOn: [] }] } } }; assert.equal(bindSbomRelease([], malformed).code, "SBOM-RELEASE-PRECONDITION"); assert.equal(bindSbomRelease([], { ...valid, observedCandidate: { ...candidate, tree: "f".repeat(40) } }).code, "SBOM-RELEASE-PRECONDITION"); assert.equal(bindSbomRelease([], { ...valid, validation: { valid: true, digest: "f".repeat(64) } }).code, "SBOM-RELEASE-PRECONDITION"); });
test("audit bundle contains all required digest references only", () => { const hash = "a".repeat(64); const links = Object.fromEntries(["sbom", "policy", "completeness", "validation", "releaseBinding"].map((key) => [key, { schema: `pipeline.${key}.v1`, digest: hash }])); const bundle = buildSbomAuditBundle(links); assert.equal(bundle.ok, true); assert.equal(bundle.authoritative, false); assert.equal(buildSbomAuditBundle({ ...links, vex: {} }).ok, false); });
console.log(`\n${passed} passed`);
