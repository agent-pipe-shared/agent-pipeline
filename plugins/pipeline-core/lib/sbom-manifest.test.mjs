// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalizeSbomPayload, SBOM_FORMAT_PROFILES, SBOM_MANIFEST_SCHEMA, validateSbomManifest, validateSbomPayload, validateSbomRecord } from "./sbom-manifest.mjs";

let passed = 0;
function test(name, fn) { try { fn(); passed += 1; console.log(`PASS ${name}`); } catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; } }
const hex = (character) => character.repeat(64);
const cdx = { bomFormat: "CycloneDX", specVersion: "1.6", version: 1, serialNumber: "urn:uuid:one", metadata: { timestamp: "2026-08-01T00:00:00Z", component: { name: "app" } }, components: [{ type: "library", "bom-ref": "pkg:npm/left-pad@1.3.0", name: "left-pad", version: "1.3.0", properties: [{ name: "pipeline.scope", value: "root" }] }], dependencies: [{ ref: "pkg:npm/left-pad@1.3.0", dependsOn: [] }] };
const cdxEquivalent = { dependencies: [{ dependsOn: [], ref: "pkg:npm/left-pad@1.3.0" }], components: [{ properties: [{ value: "root", name: "pipeline.scope" }], type: "library", "bom-ref": "pkg:npm/left-pad@1.3.0", name: "left-pad", version: "1.3.0" }], metadata: { component: { name: "app" }, timestamp: "2027-01-01T00:00:00Z" }, version: 1, specVersion: "1.6", bomFormat: "CycloneDX", serialNumber: "urn:uuid:two" };
const spdx = { spdxVersion: "SPDX-2.3", dataLicense: "CC0-1.0", SPDXID: "SPDXRef-DOCUMENT", name: "app", documentNamespace: "https://example.invalid/spdx/app", creationInfo: { created: "2026-08-01T00:00:00Z", creators: ["Tool: test"] }, packages: [{ SPDXID: "SPDXRef-left-pad", name: "left-pad", versionInfo: "1.3.0", externalRefs: [{ referenceType: "purl", referenceLocator: "pkg:npm/left-pad@1.3.0" }], annotations: [{ comment: "scope:root" }] }], relationships: [] };
const cdxDigest = canonicalizeSbomPayload("cyclonedx-json", cdx).sha256;
const spdxDigest = canonicalizeSbomPayload("spdx-json", spdx).sha256;
const recordDigest = createHash("sha256").update([`cyclonedx-json:${cdxDigest}`, `spdx-json:${spdxDigest}`].sort().join("\n")).digest("hex");
const manifest = {
  schema: SBOM_MANIFEST_SCHEMA,
  candidate: { repositoryFingerprint: "repo-fingerprint", commit: "a".repeat(40), tree: "b".repeat(40) }, sourceInputs: [{ path: "package-lock.json", sha256: hex("c") }], adapter: { id: "node-reference", version: "1.0.0", configSha256: hex("d") },
  formats: Object.entries(SBOM_FORMAT_PROFILES).map(([format, profile]) => ({ format, profile, payloadSha256: format === "cyclonedx-json" ? cdxDigest : spdxDigest })), components: [{ id: "pkg:npm/left-pad@1.3.0", scope: "root", provenance: "package-lock.json", relationships: [] }],
  completeness: { status: "complete", declared: 1, observed: 1 }, freshness: { status: "fresh", candidateMatches: true, sourceInputsMatch: true }, privacy: { classification: "public", exportPolicy: "public-redacted" },
  payload: { canonicalSha256: recordDigest, formats: { "cyclonedx-json": { profile: "CycloneDX-1.6", sha256: cdxDigest }, "spdx-json": { profile: "SPDX-2.3", sha256: spdxDigest } } }, lifecycle: { state: "complete", code: "SBOM-COMPLETE" },
};
test("pinned CycloneDX and SPDX profiles validate", () => { assert.equal(validateSbomPayload("cyclonedx-json", cdx).valid, true); assert.equal(validateSbomPayload("spdx-json", spdx).valid, true); });
test("volatile serials and timestamps do not affect a logical digest", () => assert.equal(canonicalizeSbomPayload("cyclonedx-json", cdx).sha256, canonicalizeSbomPayload("cyclonedx-json", cdxEquivalent).sha256));
test("unpinned and structurally malformed profiles fail closed", () => { assert.equal(validateSbomPayload("cyclonedx-json", { ...cdx, specVersion: "1.5" }).valid, false); assert.equal(validateSbomPayload("cyclonedx-json", { ...cdx, components: [{}] }).valid, false); assert.equal(validateSbomPayload("spdx-json", { ...spdx, dataLicense: "MIT" }).valid, false); assert.equal(validateSbomPayload("spdx-json", { ...spdx, creationInfo: { created: "now" } }).valid, false); assert.equal(validateSbomPayload("spdx-json", { ...spdx, packages: [{ SPDXID: "SPDXRef-bad", name: "bad", versionInfo: "1" }] }).valid, false); });
test("closed manifest validates", () => assert.deepEqual(validateSbomManifest(manifest), { valid: true }));
test("every required root field and unknown manifest field fail closed", () => {
  for (const field of Object.keys(manifest)) { const { [field]: omitted, ...withoutField } = manifest; assert.equal(validateSbomManifest(withoutField).valid, false, field); }
  assert.equal(validateSbomManifest({ ...manifest, findings: [] }).valid, false);
});
test("nested required fields and malformed digests fail closed", () => {
  const { tree, ...candidateWithoutTree } = manifest.candidate;
  assert.equal(validateSbomManifest({ ...manifest, candidate: candidateWithoutTree }).valid, false);
  assert.equal(validateSbomManifest({ ...manifest, sourceInputs: [{ ...manifest.sourceInputs[0], sha256: "not-a-digest" }] }).valid, false);
  assert.equal(validateSbomManifest({ ...manifest, payload: { ...manifest.payload, canonicalSha256: "not-a-digest" } }).valid, false);
});
test("complete cannot conceal stale, unmatched or partial evidence", () => { assert.equal(validateSbomManifest({ ...manifest, freshness: { ...manifest.freshness, status: "stale" } }).valid, false); assert.equal(validateSbomManifest({ ...manifest, freshness: { ...manifest.freshness, candidateMatches: false } }).valid, false); assert.equal(validateSbomManifest({ ...manifest, freshness: { ...manifest.freshness, sourceInputsMatch: false } }).valid, false); assert.equal(validateSbomManifest({ ...manifest, completeness: { ...manifest.completeness, status: "partial" } }).valid, false); });
test("manifest lifecycle code is bound to its declared state", () => assert.equal(validateSbomManifest({ ...manifest, lifecycle: { state: "complete", code: "SBOM-PARTIAL" } }).valid, false));
test("per-format and aggregate digest mismatches differ", () => { assert.equal(validateSbomRecord({ ...manifest, payload: { ...manifest.payload, formats: { ...manifest.payload.formats, "spdx-json": { ...manifest.payload.formats["spdx-json"], sha256: hex("e") } } } }, { "cyclonedx-json": cdx, "spdx-json": spdx }).code, "SBOM-PAYLOAD-DIGEST-MISMATCH"); assert.equal(validateSbomRecord({ ...manifest, payload: { ...manifest.payload, canonicalSha256: hex("f") } }, { "cyclonedx-json": cdx, "spdx-json": spdx }).code, "SBOM-CANONICAL-DIGEST-MISMATCH"); });
test("record binds both independently validated profiles", () => assert.deepEqual(validateSbomRecord(manifest, { "cyclonedx-json": cdx, "spdx-json": spdx }), { valid: true, digest: recordDigest }));
console.log(`\n${passed} passed`);
