// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAuditBundle, planAuditBundle, planAuditBundleSignature, signAuditBundle, verifyAuditBundle, verifyAuditBundleSignature } from "./audit-bundle.mjs";
import { canonicalSha256 } from "./governance-event.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
// E-AC-20 fixtures: a governance export adapter profile and a delivery receipt, matching the
// shapes of governance-export-adapter.mjs / governance-export-delivery.mjs (read-only reference;
// not imported here -- audit-bundle.mjs never validates these against the real adapter modules).
function adapterProfile() { return { schema: "pipeline.governance-export-adapter-profile.v1", profileId: "otel-collector", format: "otlp-json", adapterVersion: "1.0.0", maxBatchEvents: 100, maxPayloadBytes: 65536, acknowledgement: "per-batch", ordering: "per-stream", deduplication: true, advisory: false }; }
function deliveryReceipt() { return { destinationProfile: "otel-collector", policyRevision: "a".repeat(64), projectionDigest: "b".repeat(64), batchId: "batch-001", eventCount: 3, attempt: 1, acknowledgementClass: "accepted", terminalDisposition: "delivered", cursor: 3, lag: 0 }; }
function deliveryResult() { return { schema: "pipeline.governance-export-delivery-result.v1", outbox: { cursor: 3 }, mappings: [{ payload: "secret-content" }], acknowledgement: { receiptId: "x" }, receipt: deliveryReceipt(), advisory: false }; }
function pack() { return { schema: "pipeline.organization-policy-pack.v1", packId: "security-baseline", revision: "a".repeat(64), compatibility: { minimumCoreVersion: "0.4.0", maximumCoreVersion: "0.5.0" }, governanceFloors: { requireHumanDecisionLedger: true, allowExternalAuthority: false }, documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true }] }; }
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "audit-bundle-")); const id = "bundle-fixture"; const base = join(root, "specs", id); mkdirSync(base, { recursive: true }); const files = [["prd.md", "prd"], ["spec.md", "spec"], ["acceptance.md", "acceptance"], ["result.md", "result"], ["candidate.json", "candidate"]]; for (const [path, bytes] of files) writeFileSync(join(base, path), bytes);
  const artifacts = files.map(([path, bytes], index) => ({ class: ["prd", "spec", "acceptance", "result", "candidate-evidence"][index], path: `specs/${id}/${path}`, sha256: hash(bytes), authority: index < 2, mutability: index === 4 ? "immutable" : "mutable", retention: "active" }));
  writeFileSync(join(base, "lifecycle.json"), JSON.stringify({ schema: "pipeline.feature-package.v1", feature: { id, rigor: 1 }, state: "completed", artifacts, candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, supersedes: null })); return { root, manifest: `specs/${id}/lifecycle.json` };
}
test("builds and offline-verifies a candidate-bound bundle from a valid package", async () => {
  const input = fixture(); const plan = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] }); const receipt = await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan }); const verified = await verifyAuditBundle({ bundleRoot: join(input.root, "bundle") });
  assert.equal(receipt.status, "built"); assert.equal(verified.status, "verified"); assert.equal(verified.candidate.commit, "a".repeat(40));
});
test("detects tampered or missing bundle bytes", async () => {
  const input = fixture(); const plan = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] }); await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan }); writeFileSync(join(input.root, "bundle", "artifacts", "001-prd"), "changed"); const verified = await verifyAuditBundle({ bundleRoot: join(input.root, "bundle") }); assert.equal(verified.status, "invalid"); assert.ok(verified.findings.some((finding) => finding.startsWith("AB-DIGEST")));
});
test("signs and verifies only an unchanged manifest without identity or authority claims", async () => {
  const input = fixture(); const plan = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] }); await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan }); const request = await planAuditBundleSignature({ bundleRoot: join(input.root, "bundle"), algorithm: "test-ed25519", signerKeyId: "test-key" });
  const receipt = await signAuditBundle({ bundleRoot: join(input.root, "bundle"), request, sign: async () => ({ signature: "a".repeat(32), algorithm: "test-ed25519", signerKeyId: "test-key" }) }); const verified = await verifyAuditBundleSignature({ bundleRoot: join(input.root, "bundle"), verify: async () => ({ verified: true }) });
  assert.equal(receipt.assurance, "cryptographic-binding-only"); assert.equal(verified.status, "verified"); assert.equal(verified.assurance, "cryptographic-binding-only");
});
test("invalidates a signature when the manifest changes after signing", async () => {
  const input = fixture(); const plan = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] }); await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan }); const request = await planAuditBundleSignature({ bundleRoot: join(input.root, "bundle"), algorithm: "test-ed25519", signerKeyId: "test-key" }); await signAuditBundle({ bundleRoot: join(input.root, "bundle"), request, sign: async () => ({ signature: "a".repeat(32), algorithm: "test-ed25519", signerKeyId: "test-key" }) }); writeFileSync(join(input.root, "bundle", "manifest.json"), "{}"); const verified = await verifyAuditBundleSignature({ bundleRoot: join(input.root, "bundle"), verify: async () => ({ verified: true }) }); assert.equal(verified.status, "invalid");
});
function misplacedFixture() {
  const root = mkdtempSync(join(tmpdir(), "audit-bundle-misplaced-")); const id = "bundle-misplaced"; const base = join(root, "specs", id); mkdirSync(base, { recursive: true });
  const files = [["prd.md", "prd"], ["spec.md", "spec"], ["acceptance.md", "acceptance"], ["result.md", "result"]];
  for (const [path, bytes] of files) writeFileSync(join(base, path), bytes);
  const artifacts = [
    { class: "prd", path: `specs/${id}/prd.md`, sha256: hash("prd"), authority: true, mutability: "mutable", retention: "active" },
    { class: "spec", path: `specs/${id}/spec.md`, sha256: hash("spec"), authority: true, mutability: "mutable", retention: "active" },
    { class: "acceptance", path: `specs/${id}/acceptance.md`, sha256: hash("acceptance"), authority: false, mutability: "mutable", retention: "active" },
    { class: "result", path: `specs/${id}/result.md`, sha256: hash("result"), authority: false, mutability: "mutable", retention: "active" },
    { class: "candidate-evidence", path: "specs/other-package/escaped.json", sha256: hash("candidate"), authority: false, mutability: "immutable", retention: "active" },
  ];
  writeFileSync(join(base, "lifecycle.json"), JSON.stringify({ schema: "pipeline.feature-package.v1", feature: { id, rigor: 1 }, state: "completed", artifacts, candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, supersedes: null }));
  return { root, manifest: `specs/${id}/lifecycle.json` };
}
function illegallyMutableFixture() {
  const input = fixture(); const value = JSON.parse(readFileSync(join(input.root, input.manifest), "utf8"));
  value.artifacts = value.artifacts.map((artifact) => (artifact.class === "candidate-evidence" ? { ...artifact, mutability: "mutable" } : artifact));
  writeFileSync(join(input.root, input.manifest), JSON.stringify(value));
  return input;
}
function orphanedFixture() {
  const input = fixture();
  writeFileSync(join(input.root, "specs", "bundle-fixture", "orphan.md"), "orphan");
  return input;
}
// P-AC-06: a required artifact whose file is missing must reject the whole
// bundle plan rather than silently building around a hole.
test("P-AC-06 rejects a required artifact whose source file is missing", () => {
  const input = fixture(); unlinkSync(join(input.root, "specs", "bundle-fixture", "result.md"));
  assert.throws(() => planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] }), (error) => error.code === "AB-PACKAGE");
});
// P-AC-06: an artifact path outside its own package (specs/{id}/) is
// misplaced and must reject the plan even though the referenced bytes exist.
test("P-AC-06 rejects a required artifact bound outside its own package (misplaced)", () => {
  const input = misplacedFixture();
  assert.throws(() => planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] }), (error) => error.code === "AB-PACKAGE");
});
// P-AC-06: candidate-evidence is required to be immutable; declaring it
// mutable is an illegally-mutable required artifact and must reject the plan.
test("P-AC-06 rejects a candidate-evidence artifact declared mutable (illegally mutable)", () => {
  const input = illegallyMutableFixture();
  assert.throws(() => planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] }), (error) => error.code === "AB-PACKAGE");
});
// P-AC-06: a source file that changes after planning but before the bundle
// is written is stale relative to the plan's pinned digest.
test("P-AC-06 fails the build when a planned artifact goes stale before the bundle is written", async () => {
  const input = fixture(); const plan = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] });
  writeFileSync(join(input.root, "specs", "bundle-fixture", "result.md"), "result-changed");
  await assert.rejects(() => buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan }), (error) => error.code === "AB-SOURCE-DIGEST");
});
// P-AC-06: a source file truncated after planning but before the bundle is
// written must be caught the same way, not silently bundled short.
test("P-AC-06 fails the build when a planned artifact is truncated before the bundle is written", async () => {
  const input = fixture(); const plan = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] });
  writeFileSync(join(input.root, "specs", "bundle-fixture", "result.md"), "re");
  await assert.rejects(() => buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan }), (error) => error.code === "AB-SOURCE-DIGEST");
});
// P-AC-06: a file physically present under the package directory but not
// referenced by any manifest artifact entry is orphaned and must reject the
// plan, not be silently ignored.
test("P-AC-06 rejects a package file not referenced by any artifact (orphaned)", () => {
  const input = orphanedFixture();
  assert.throws(() => planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] }), (error) => error.code === "AB-PACKAGE");
});
// P-AC-10: a compliance claim must have no channel into a signed bundle,
// including one smuggled through the external signing provider's response.
test("P-AC-10 rejects a compliance claim smuggled through the bundle signing provider response", async () => {
  const input = fixture(); const plan = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] }); await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan });
  const request = await planAuditBundleSignature({ bundleRoot: join(input.root, "bundle"), algorithm: "test-ed25519", signerKeyId: "test-key" });
  await assert.rejects(() => signAuditBundle({ bundleRoot: join(input.root, "bundle"), request, sign: async () => ({ signature: "a".repeat(32), algorithm: "test-ed25519", signerKeyId: "test-key", complianceCertification: "PCI-DSS" }) }), (error) => error.code === "AB-SIGNATURE-PROVIDER");
});
// P-AC-10: the same closure applies to the verification provider response.
test("P-AC-10 rejects a compliance claim smuggled through the bundle signature verification provider response", async () => {
  const input = fixture(); const plan = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] }); await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan });
  const request = await planAuditBundleSignature({ bundleRoot: join(input.root, "bundle"), algorithm: "test-ed25519", signerKeyId: "test-key" });
  await signAuditBundle({ bundleRoot: join(input.root, "bundle"), request, sign: async () => ({ signature: "a".repeat(32), algorithm: "test-ed25519", signerKeyId: "test-key" }) });
  await assert.rejects(() => verifyAuditBundleSignature({ bundleRoot: join(input.root, "bundle"), verify: async () => ({ verified: true, complianceCertification: "PCI-DSS" }) }), (error) => error.code === "AB-SIGNATURE-VERIFY-PROVIDER");
});
// E-AC-20: export metadata is optional, narrowed to a profile digest plus the delivery receipt's
// own already-public-safe fields, and carries through the built manifest into a bundle that still
// offline-verifies -- proving the narrowed data is informational, not part of the trust chain.
test("E-AC-20 narrows optional export metadata to a profile digest and the receipt's own fields, and carries it through a verifying bundle", async () => {
  const input = fixture(); const profile = adapterProfile(); const receipt = deliveryReceipt();
  const plan = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()], exportEvidence: { profile, receipt } });
  assert.deepEqual(Object.keys(plan.exportMetadata).sort(), ["profileDigest", "receipt"]);
  assert.equal(plan.exportMetadata.profileDigest, canonicalSha256(profile));
  assert.deepEqual(plan.exportMetadata.receipt, receipt);
  const receipt2 = await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan });
  assert.equal(receipt2.status, "built");
  const manifest = JSON.parse(readFileSync(join(input.root, "bundle", "manifest.json"), "utf8"));
  assert.deepEqual(manifest.exportMetadata, plan.exportMetadata);
  const verified = await verifyAuditBundle({ bundleRoot: join(input.root, "bundle") });
  assert.equal(verified.status, "verified");
});
// E-AC-20: either half of export metadata may be supplied alone.
test("E-AC-20 accepts export metadata with only a profile digest or only a receipt", () => {
  const input = fixture();
  const profileOnly = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()], exportEvidence: { profile: adapterProfile() } });
  assert.deepEqual(Object.keys(profileOnly.exportMetadata), ["profileDigest"]);
  const receiptOnly = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()], exportEvidence: { receipt: deliveryReceipt() } });
  assert.deepEqual(Object.keys(receiptOnly.exportMetadata), ["receipt"]);
});
// E-AC-20: `mappings`/`outbox`/`acknowledgement` must never reach the bundle, including when a
// caller mistakenly passes the whole delivery result where only the receipt sub-object belongs.
test("E-AC-20 rejects export metadata when the receipt looks like the full delivery result instead of the receipt sub-object", () => {
  const input = fixture();
  assert.throws(() => planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()], exportEvidence: { receipt: deliveryResult() } }), (error) => error.code === "AB-EXPORT-RECEIPT");
  assert.throws(() => planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()], exportEvidence: {} }), (error) => error.code === "AB-EXPORT-METADATA");
  assert.throws(() => planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()], exportEvidence: { profile: adapterProfile(), rogue: true } }), (error) => error.code === "AB-EXPORT-METADATA");
});
// E-AC-20: omitting export metadata leaves the plan and manifest exactly as before this feature.
test("E-AC-20 leaves the plan and manifest unchanged when no export metadata is supplied", async () => {
  const input = fixture(); const plan = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] });
  assert.deepEqual(Object.keys(plan).sort(), ["artifacts", "bundleId", "candidate", "effectivePolicy", "effectivePolicySha256", "schema", "status"]);
  const receipt = await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan });
  assert.equal(receipt.status, "built");
  const manifest = JSON.parse(readFileSync(join(input.root, "bundle", "manifest.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest).sort(), ["artifacts", "bundleId", "candidate", "effectivePolicySha256", "schema"]);
});
// E-AC-20: export metadata is never source authority -- a bundle whose export metadata is
// internally inconsistent with the rest of the bundle (arbitrary digest, unrelated receipt values)
// still builds and verifies, because nothing in the trust chain ever reads it.
test("E-AC-20 still builds and verifies a bundle whose export metadata is deliberately wrong and internally inconsistent", async () => {
  const input = fixture();
  const wrongReceipt = { destinationProfile: "unrelated-destination", policyRevision: "f".repeat(64), projectionDigest: "0".repeat(64), batchId: "does-not-exist", eventCount: 999, attempt: 7, acknowledgementClass: "none", terminalDisposition: "quarantined", cursor: 0, lag: 999 };
  const plan = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()], exportEvidence: { profile: { unrelated: "profile-shape" }, receipt: wrongReceipt } });
  assert.notEqual(plan.exportMetadata.profileDigest, canonicalSha256(adapterProfile()));
  const receipt = await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan });
  assert.equal(receipt.status, "built");
  const verified = await verifyAuditBundle({ bundleRoot: join(input.root, "bundle") });
  assert.equal(verified.status, "verified");
});
