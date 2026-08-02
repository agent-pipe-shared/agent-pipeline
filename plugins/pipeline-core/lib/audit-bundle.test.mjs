// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
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
