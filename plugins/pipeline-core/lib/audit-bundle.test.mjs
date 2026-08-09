// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAuditBundle, planAuditBundle, planAuditBundleSignature, signAuditBundle, verifyAuditBundle, verifyAuditBundleSignature } from "./audit-bundle.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
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
