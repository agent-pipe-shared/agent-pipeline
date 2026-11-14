// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAuditBundle, evidenceIndexFromLsTree, planAuditBundle,planAuditBundleSignature, signAuditBundle, verifyAuditBundle, verifyAuditBundleSignature } from "./audit-bundle.mjs";
import { canonicalSha256 } from "./governance-event.mjs";
import { closeDispatchProjectionBytes, projectCloseDispatches, readCloseDispatchInputs } from "./durable-evidence.mjs";
import { denyPrivateAbsolutePaths } from "./dispatch-record.mjs";
import { planVerifySelection } from "./verify-selection.mjs";
import { closeSbom } from "./sbom-close.mjs";
import { createSbomOverrideRequest } from "./sbom-override-authority.mjs";
import { verifyPoApprovalProof } from "./po-approval-proof.mjs";

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
test("detects a modified generated auditor README", async () => {
  const input = fixture(); const plan = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] }); await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan }); writeFileSync(join(input.root, "bundle", "README.md"), "tampered\n"); const verified = await verifyAuditBundle({ bundleRoot: join(input.root, "bundle") }); assert.equal(verified.status, "invalid"); assert.ok(verified.findings.includes("AB-README-DIGEST"));
});
test("keeps old bundles verifiable and CLI returns nonzero for invalid output", async () => {
  const input = fixture(); const plan = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] }); await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan }); const bundle = join(input.root, "bundle"); const manifest = JSON.parse(readFileSync(join(bundle, "manifest.json"), "utf8")); delete manifest.readmeSha256; writeFileSync(join(bundle, "manifest.json"), `${JSON.stringify(manifest)}\n`); rmSync(join(bundle, "README.md")); assert.equal((await verifyAuditBundle({ bundleRoot: bundle })).status, "verified");
  const invalid = join(input.root, "invalid"); mkdirSync(invalid); writeFileSync(join(invalid, "manifest.json"), "{}\n"); assert.throws(() => execFileSync(process.execPath, ["plugins/pipeline-core/scripts/audit-bundle.mjs", "verify", "--bundle", invalid], { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" }), (error) => error.status === 1);
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
  assert.deepEqual(Object.keys(manifest).sort(), ["artifacts", "bundleId", "candidate", "effectivePolicySha256", "readmeSha256", "schema"]);
});
// Q3 / AC-108: the bundle binds the audited candidate itself, carries the approval trace with its detached proofs, the
// release Verify record and the security scan, and reports every missing item as a typed gap.
const CANDIDATE = { commit: "a".repeat(40), tree: "b".repeat(40) };
const SELECTION_POLICY = { schema: "pipeline.verify-selection.v1", baseline: ["test"], areas: [{ id: "all", paths: ["**"], suites: ["test"] }] };
function evidenceFiles(root, { traceCandidate = CANDIDATE, traceStatus = "traced", verifyCandidate = CANDIDATE, verifyMode = "release", securityCandidate = CANDIDATE, securityFindings = [] } = {}) {
  mkdirSync(join(root, "evidence"), { recursive: true });
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: "c".repeat(64), keyReference: "po-key-1", publicKey: "-----BEGIN PUBLIC KEY-----\nx\n-----END PUBLIC KEY-----\n", signatureBase64: "c2ln" };
  const write = (name, value) => { writeFileSync(join(root, "evidence", name), `${JSON.stringify(value)}\n`); return `evidence/${name}`; };
  const selection = planVerifySelection({ mode: verifyMode, candidateCommit: verifyCandidate.commit, registeredSuiteIds: ["test"], policy: SELECTION_POLICY });
  return {
    traceReportPath: write("trace.json", { schema: "pipeline.human-approval-trace.v1", candidate: traceCandidate, status: traceStatus, counts: {}, rows: [{ kind: "push", verdict: traceStatus, proof }], outOfCandidate: 0, notEnumerated: [] }),
    proofPaths: [{ kind: "push", path: write("push-proof.json", proof) }],
    verifyRecordPath: write("verify.json", { schema: "pipeline.verify-evidence.v0", ...verifyCandidate, candidate: verifyCandidate, exitCode: 0, selection }),
    securityScanPath: write("security.json", { schema: "pipeline.security-evidence.v0", candidate: securityCandidate, findings: securityFindings, exitCode: 0 }),
  };
}
const planWith = (input, extra) => planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()], ...extra });
test("Q3 the bundle carries the trace, the detached proof, the release Verify record and the security scan, bound to the audited candidate", async () => {
  const input = fixture(); const plan = planWith(input, { candidate: CANDIDATE, evidence: evidenceFiles(input.root) });
  assert.deepEqual(plan.evidence.items.map((entry) => `${entry.item}:${entry.status}`), ["approval-trace:carried", "approval-proofs:push:carried", "verify-record:carried", "security-scan:carried"]);
  assert.ok(plan.evidence.items.every((entry) => entry.code === null)); assert.equal(plan.evidence.traceStatus, "traced");
  await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan });
  const manifest = JSON.parse(readFileSync(join(input.root, "bundle", "manifest.json"), "utf8"));
  assert.equal(manifest.candidate.commit, CANDIDATE.commit); assert.equal(manifest.candidate.tree, CANDIDATE.tree);
  assert.deepEqual(manifest.artifacts.slice(5).map((entry) => entry.path.replace(/^artifacts\/\d{3}-/u, "")), ["approval-trace", "approval-proof", "verify-record", "security-scan"]);
  assert.match(readFileSync(join(input.root, "bundle", "README.md"), "utf8"), /Human approval evidence/u);
  assert.equal((await verifyAuditBundle({ bundleRoot: join(input.root, "bundle") })).status, "verified");
  writeFileSync(join(input.root, "bundle", manifest.artifacts[8].path), "tampered");
  assert.ok((await verifyAuditBundle({ bundleRoot: join(input.root, "bundle") })).findings.some((finding) => finding.startsWith("AB-DIGEST")));
});
test("Q3 a missing item is a typed gap, never silently skipped", () => {
  const input = fixture(); const plan = planWith(input, { candidate: CANDIDATE, evidence: {} });
  assert.deepEqual(plan.evidence.items.map((entry) => `${entry.item}:${entry.status}:${entry.code}`), ["approval-trace:gap:NOT-REFERENCED", "approval-proofs:gap:NOT-REFERENCED", "verify-record:gap:NOT-REFERENCED", "security-scan:gap:NOT-REFERENCED"]);
  assert.equal(plan.artifacts.length, 5); assert.equal(plan.evidence.traceStatus, null);
});
// C22B (CGR-13, CGF-03, AC-108): the README counts the product commits and the evidence commits of the feature range apart, from a build input that is NOT a manifest field
// (the manifest and its keys are hashed by the verifier and the bindings), and says where the independence of a Critic round is recorded instead of restating it.
test("C22B CGR-13 the README states product and evidence commits separately without touching the manifest, and the bundle still verifies offline", async () => {
  const input = fixture(); const plan = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] });
  await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan, commitSplit: { schema: "pipeline.close-commit-split.v1", status: "counted", base: null, rangeSource: "first-commit-touching-feature-directory", product: 3, evidence: 5, total: 8 } });
  const readme = readFileSync(join(input.root, "bundle", "README.md"), "utf8");
  assert.match(readme, /## Commits of the feature range/u); assert.match(readme, /3 product commit\(s\)/u); assert.match(readme, /5 evidence commit\(s\)/u);
  const manifest = JSON.parse(readFileSync(join(input.root, "bundle", "manifest.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest).sort(), ["artifacts", "bundleId", "candidate", "effectivePolicySha256", "readmeSha256", "schema"], "no manifest field was added");
  assert.equal((await verifyAuditBundle({ bundleRoot: join(input.root, "bundle") })).status, "verified");
  await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle-unavailable", plan, commitSplit: { schema: "pipeline.close-commit-split.v1", status: "unavailable", reason: "git log failed" } });
  const absent = readFileSync(join(input.root, "bundle-unavailable", "README.md"), "utf8");
  assert.match(absent, /could not be counted/u); assert.doesNotMatch(absent, /product commit\(s\)/u, "no count is invented");
  await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle-plain", plan });
  assert.doesNotMatch(readFileSync(join(input.root, "bundle-plain", "README.md"), "utf8"), /Commits of the feature range/u, "a caller that passes no split gets the README it always got, apart from the assurance sentence");
});
test("C22B CGF-03 the README does not restate the assurance of a Critic round: it points at the receipt of each round", async () => {
  const input = fixture(); const plan = planAuditBundle({ repositoryRoot: input.root, manifestPath: input.manifest, bundleId: "release-evidence", coreVersion: "0.4.7", packs: [pack()] });
  await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan });
  const readme = readFileSync(join(input.root, "bundle", "README.md"), "utf8");
  assert.match(readme, /freshContext/u); assert.match(readme, /caller-authored-fallback/u); assert.match(readme, /receipt\.json/u); assert.match(readme, /states no independence of its own/u);
});
// C22 (CGR-12, AC-108): every Critic round report of the feature travels in the bundle; a round whose report was never exported (it lived only in a scratch directory) is a typed gap the README names.
test("C22 CGR-12 the bundle carries every Critic round report, names a round without a readable report, and verifies offline", async () => {
  const input = fixture(); const [one, two, three] = ["a", "b", "c"].map((letter) => letter.repeat(32));
  mkdirSync(join(input.root, "evidence"), { recursive: true }); writeFileSync(join(input.root, "evidence/round-one.md"), "# round one\n");
  const plan = planWith(input, { candidate: CANDIDATE, evidence: { criticReports: [{ packetId: one, path: "evidence/round-one.md" }, { packetId: two, path: null }, { packetId: three, path: "evidence/missing.md" }] } });
  assert.deepEqual(plan.evidence.items.map((entry) => `${entry.item}:${entry.status}:${entry.code}`), [`critic-report:${one}:carried:null`, `critic-report:${two}:gap:REPORT-NOT-EXPORTED`, `critic-report:${three}:gap:UNREADABLE`], "no approval item is invented when only reports are named");
  await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan });
  const readme = readFileSync(join(input.root, "bundle", "README.md"), "utf8");
  assert.match(readme, /Critic round reports/u); assert.ok(readme.includes(two) && readme.includes("REPORT-NOT-EXPORTED") && readme.includes(three) && readme.includes("UNREADABLE"), "the README names what is missing");
  const manifest = JSON.parse(readFileSync(join(input.root, "bundle", "manifest.json"), "utf8"));
  assert.equal((await verifyAuditBundle({ bundleRoot: join(input.root, "bundle") })).status, "verified");
  writeFileSync(join(input.root, "bundle", manifest.artifacts.at(-1).path), "tampered");
  assert.ok((await verifyAuditBundle({ bundleRoot: join(input.root, "bundle") })).findings.some((finding) => finding.startsWith("AB-DIGEST")));
  assert.throws(() => planWith(fixture(), { evidence: { criticReports: [{ packetId: "../x", path: null }] } }), (error) => error.code === "AB-EVIDENCE-INPUT");
});
// C28 (AC-108, WSL run): briefings, dispatch records and the security result stayed untracked, so the tracked bundle could not show them. What already existed: the signed proofs, the
// final Verify and Security records (follow-up lists under proofs/) and the Critic reports. The gap built here: each dispatch briefing's text with its digest and the dispatch records,
// redacted, as ONE bundle artifact (one evidence item, so no item limit is reachable), written by the close before the audit request.
const sha = (value) => createHash("sha256").update(value).digest("hex");
function dispatchRecord(taskId, extra = {}) {
  return { record: { taskId, schema: "pipeline.dispatch-record.v4", runner: "claude", agentType: "goldfish-deep", model: "claude-sonnet-5-5", effort: "high", rulesetSha: "r".repeat(64), dispatcher: "elephant", candidateCommit: "a".repeat(40), commits: [], outcome: "succeeded", outcomeClassification: { kind: "authored-commit" }, resultSha256: null, report: { changedFiles: ["plugins/pipeline-core/lib/x.mjs"] }, ...extra } };
}
const FEATURE_ID = "release-evidence";
// C28e (Codex test run, PO 2026-11-13): the projection no longer carries briefing text; a found briefing is `digest-only` with its source digest.
test("C28 / C28e the projection carries each found briefing as its digest only, never its text, and names every gap per dispatch", () => {
  const plain = "## Briefing\nTouch only plugins/pipeline-core/lib/x.mjs.\n"; const pathy = "Read /home/someone/src/repo/file.md and C:\\Users\\someone\\x.txt first.\n"; const secret = `token ghp_${"A".repeat(30)} here\n`;
  const briefings = new Map([
    ["D-PLAIN", [{ sha256: sha(plain), path: "scratch/a.md", text: plain, itemId: `${FEATURE_ID}.one` }]],
    ["D-PATH", [{ sha256: sha(pathy), path: "scratch/b.md", text: pathy, itemId: null }]],
    ["D-SECRET", [{ sha256: sha(secret), path: "scratch/c.md", text: secret, itemId: null }]],
    ["D-OTHER", [{ sha256: sha("o"), path: "scratch/d.md", text: "o", itemId: "another-feature.item" }]],
  ]);
  const records = [dispatchRecord("D-PLAIN"), dispatchRecord("D-PATH"), dispatchRecord("D-SECRET"), dispatchRecord("D-OTHER"), dispatchRecord("D-ATTESTED", { attestation: { briefingSha256: "9".repeat(64) } }), dispatchRecord("D-NONE")];
  const projection = projectCloseDispatches({ featureId: FEATURE_ID, records, briefings });
  const by = Object.fromEntries(projection.dispatches.map((entry) => [entry.taskId, entry]));
  assert.deepEqual(Object.keys(by).sort(), ["D-ATTESTED", "D-NONE", "D-PATH", "D-PLAIN", "D-SECRET"], "a dispatch whose briefing names another feature's item is not this feature's");
  for (const [taskId, text] of [["D-PLAIN", plain], ["D-PATH", pathy], ["D-SECRET", secret]]) {
    assert.deepEqual(by[taskId].briefing, { status: "digest-only", code: null, sourceSha256: sha(text), textSha256: null, text: null }, `${taskId}: only the digest of the briefing bytes`);
  }
  assert.ok(!JSON.stringify(projection).includes("Touch only"), "no briefing text is anywhere in the projection");
  assert.deepEqual({ status: by["D-ATTESTED"].briefing.status, code: by["D-ATTESTED"].briefing.code, sourceSha256: by["D-ATTESTED"].briefing.sourceSha256 }, { status: "gap", code: "BRIEFING-TEXT-UNAVAILABLE", sourceSha256: "9".repeat(64) });
  assert.deepEqual({ status: by["D-NONE"].briefing.status, code: by["D-NONE"].briefing.code }, { status: "gap", code: "BRIEFING-NOT-FOUND" });
  assert.doesNotThrow(() => denyPrivateAbsolutePaths(projection, "projection"), "no absolute host path is anywhere in the projection");
  assert.ok(!JSON.stringify(projection).includes("ghp_"), "no secret-shaped value is anywhere in the projection");
  assert.equal(by["D-PLAIN"].record.taskId, "D-PLAIN"); assert.equal(by["D-PLAIN"].record.outcome, "succeeded");
  const many = projectCloseDispatches({ featureId: FEATURE_ID, records: Array.from({ length: 250 }, (_, index) => dispatchRecord(`D-${String(index).padStart(3, "0")}`)), briefings: new Map() });
  assert.equal(many.dispatches.length, 200); assert.ok(many.gaps.some((gap) => gap.code === "DISPATCH-LIST-TRUNCATED" && gap.count === 50), "the cut is a typed gap, not silence");
  assert.ok(closeDispatchProjectionBytes(projection).toString("utf8").endsWith("\n"));
});
// C29 R13 (AGY run 3; PO tile 2026-11-13): the dispatch record files stay git-ignored, so each projected dispatch names the digest of its exact record bytes.
test("C29-R13 each projected dispatch names the path and digest of its local record file; the close's own reader supplies them", () => {
  const root = mkdtempSync(join(tmpdir(), "c29-r13-"));
  try {
    mkdirSync(join(root, "evidence"), { recursive: true });
    // A valid terminal v3 record (the shape the preflight's N33B fixture writes): the reader skips anything its validator refuses.
    const record = { schema: "pipeline.dispatch-record.v3", taskId: "D-FILE", agentType: "default", model: "gpt-5.6-luna", effort: "medium", rulesetSha: "b7797309cf6abe175fd52b0a8749d82b43714ea0", dispatcher: "elephant", outcome: "completed", commits: ["a".repeat(40)], candidateCommit: "a".repeat(40), resultSha256: "a".repeat(64), log: [{ phase: "implement", toolUseCount: 1 }], report: { text: "done", changedFiles: ["specs/spec.md"] }, criticRequired: { schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 2, riskClass: "high", riskFlag: true, diff: { mechanical: false, architecture: false, guardrails: true, security: false } }, appliedRow: "T1" } };
    const bytes = `${JSON.stringify(record)}\n`;
    writeFileSync(join(root, "evidence", "dispatch-record-D-FILE.json"), bytes);
    const inputs = readCloseDispatchInputs(root);
    const projection = projectCloseDispatches({ featureId: FEATURE_ID, ...inputs });
    assert.equal(projection.dispatches.length, 1, JSON.stringify(projection.gaps));
    assert.deepEqual(projection.dispatches[0].recordSource, { path: "evidence/dispatch-record-D-FILE.json", sha256: sha(bytes) });
    assert.equal(projectCloseDispatches({ featureId: FEATURE_ID, records: [dispatchRecord("D-BARE")] }).dispatches[0].recordSource, null, "no source given, none invented");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
function projectionBundle(input, projection) {
  mkdirSync(join(input.root, "evidence"), { recursive: true }); writeFileSync(join(input.root, "evidence/dispatch-projection.json"), closeDispatchProjectionBytes(projection));
  return planWith(input, { candidate: CANDIDATE, evidence: { dispatchProjectionPath: "evidence/dispatch-projection.json" } });
}
test("C28 the bundle carries the dispatch projection as one evidence item, verifies offline, and refuses an inconsistent or unredacted projection", async () => {
  const input = fixture(); const text = "Briefing text.\n";
  const projection = projectCloseDispatches({ featureId: FEATURE_ID, records: [dispatchRecord("D-ONE")], briefings: new Map([["D-ONE", [{ sha256: sha(text), path: "scratch/a.md", text, itemId: null }]]]) });
  const plan = projectionBundle(input, projection);
  assert.deepEqual(plan.evidence.items.map((entry) => `${entry.item}:${entry.status}:${entry.code}`), ["dispatch-projection:carried:null"], "only the named item: no approval item is invented");
  await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan });
  assert.match(readFileSync(join(input.root, "bundle", "README.md"), "utf8"), /Dispatch projection/u);
  assert.equal((await verifyAuditBundle({ bundleRoot: join(input.root, "bundle") })).status, "verified");
  // A producer that bound a text to a digest it does not hash to, or carried an absolute path, is caught offline even though the artifact digest is consistent with the manifest.
  // A bundle a former close wrote with a carried text still verifies (C28e keeps the older statuses readable).
  const legacy = structuredClone(projection); legacy.dispatches[0].briefing = { status: "carried", code: null, sourceSha256: sha(text), textSha256: sha(text), text };
  const fourth = fixture(); await buildAuditBundle({ repositoryRoot: fourth.root, outputPath: "bundle", plan: projectionBundle(fourth, legacy) });
  assert.equal((await verifyAuditBundle({ bundleRoot: join(fourth.root, "bundle") })).status, "verified", "a legacy carried projection verifies");
  const broken = structuredClone(projection); broken.dispatches[0].briefing.text = "Another text.\n";
  const inconsistent = projectionBundle(fixture(), broken); const second = fixture(); const badPlan = projectionBundle(second, broken);
  assert.ok(inconsistent.evidence.items.length === 1 && badPlan.evidence.items.length === 1);
  await buildAuditBundle({ repositoryRoot: second.root, outputPath: "bundle", plan: badPlan });
  assert.deepEqual((await verifyAuditBundle({ bundleRoot: join(second.root, "bundle") })).findings, ["AB-DISPATCH-PROJECTION"]);
  const leaky = structuredClone(projection); leaky.dispatches[0].record.changedFiles = ["/home/someone/x.mjs"];
  const third = fixture(); await buildAuditBundle({ repositoryRoot: third.root, outputPath: "bundle", plan: projectionBundle(third, leaky) });
  assert.deepEqual((await verifyAuditBundle({ bundleRoot: join(third.root, "bundle") })).findings, ["AB-DISPATCH-PROJECTION"]);
  const unreadable = planWith(fixture(), { candidate: CANDIDATE, evidence: { dispatchProjectionPath: "evidence/absent.json" } });
  assert.deepEqual(unreadable.evidence.items.map((entry) => `${entry.item}:${entry.status}:${entry.code}`), ["dispatch-projection:gap:UNREADABLE"]);
});
// ADR-0096 (D248): the close's list of gate-definition changes is its own bundle section, carried only when every change is proven and the list ends at the candidate.
function gateChangesBundle(input, record) {
  mkdirSync(join(input.root, "evidence"), { recursive: true }); writeFileSync(join(input.root, "evidence/gate-changes.json"), `${JSON.stringify(record)}\n`);
  return planWith(input, { candidate: CANDIDATE, evidence: { gateChangesRecordPath: "evidence/gate-changes.json" } });
}
test("ADR-0096 the bundle carries the gate-definition change list, codes a labelled proof, and refuses an unproven or foreign list", async () => {
  const change = (proof) => ({ commit: "a".repeat(40), parent: "b".repeat(40), path: "project/pipeline.json", change: "M", blobSha256: "c".repeat(64), ruleId: "GS-11", proof });
  const record = (changes, extra = {}) => ({ schema: "pipeline.gate-definition-changes.v1", status: "proven", base: null, head: CANDIDATE.commit, changes, unproven: [], ...extra });
  const input = fixture();
  const signed = gateChangesBundle(input, record([change({ kind: "human-guard-override", ref: "e".repeat(64), label: null })]));
  assert.deepEqual(signed.evidence.items.map((entry) => `${entry.item}:${entry.status}:${entry.code}`), ["gate-changes:carried:null"], "only the named item: no approval item is invented");
  await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan: signed });
  assert.match(readFileSync(join(input.root, "bundle", "README.md"), "utf8"), /## Gate-definition changes/u);
  assert.equal((await verifyAuditBundle({ bundleRoot: join(input.root, "bundle") })).status, "verified");
  const labelled = gateChangesBundle(fixture(), record([change({ kind: "po-acknowledgement", ref: "f".repeat(64), label: "acknowledged after the fact" })]));
  assert.deepEqual(labelled.evidence.items.map((entry) => `${entry.item}:${entry.status}:${entry.code}`), ["gate-changes:carried:GATE-CHANGE-LABELLED"]);
  const unproven = gateChangesBundle(fixture(), record([change(null)], { status: "unproven", unproven: [change(null)] }));
  assert.deepEqual(unproven.evidence.items.map((entry) => `${entry.item}:${entry.status}:${entry.code}`), ["gate-changes:gap:UNREADABLE"], "an unproven list never reaches a bundle as carried");
  const foreign = gateChangesBundle(fixture(), record([], { head: "9".repeat(40) }));
  assert.deepEqual(foreign.evidence.items.map((entry) => `${entry.item}:${entry.status}:${entry.code}`), ["gate-changes:gap:OTHER-CANDIDATE"]);
});
// C28c (PO decision 2026-11-11): the SBOM the close records is its own bundle section: the record, then the two documents it names, bound by digest and re-checked offline.
const LOCK = JSON.stringify({ lockfileVersion: 3, packages: { "": {}, "node_modules/left-pad": { version: "1.3.0" } } });
function sbomBundle(input, files, mutate = (value) => value) {
  const closed = closeSbom({ featureId: FEATURE_ID, evidenceDir: "evidence", tracked: Object.keys(files), read: (path) => files[path] ?? null, ...mutate({}) });
  for (const file of closed.files) { mkdirSync(join(input.root, "evidence/sbom"), { recursive: true }); writeFileSync(join(input.root, file.path), file.text); }
  return { closed, plan: planWith(input, { candidate: CANDIDATE, evidence: { sbomRecordPath: "evidence/sbom/record.json" } }) };
}
test("C28c the bundle carries the SBOM record and its documents, names the section, and verifies offline", async () => {
  const input = fixture(); const { closed, plan } = sbomBundle(input, { "package-lock.json": LOCK });
  assert.equal(closed.record.status, "complete");
  assert.deepEqual(plan.evidence.items.map((entry) => `${entry.item}:${entry.status}:${entry.code}`), ["sbom:carried:null", "sbom-document:cyclonedx-json:carried:null", "sbom-document:spdx-json:carried:null"], "only the SBOM items: no approval item is invented");
  await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan });
  assert.match(readFileSync(join(input.root, "bundle", "README.md"), "utf8"), /## Software bill of materials/u);
  assert.equal((await verifyAuditBundle({ bundleRoot: join(input.root, "bundle") })).status, "verified");
});
test("C28c a not-applicable and an overridden record are carried with their code named", async () => {
  const none = fixture(); const empty = sbomBundle(none, { "src/a.js": "x" });
  assert.deepEqual(empty.plan.evidence.items.map((entry) => `${entry.item}:${entry.code}`), ["sbom:SBOM-NOT-APPLICABLE"]);
  await buildAuditBundle({ repositoryRoot: none.root, outputPath: "bundle", plan: empty.plan });
  assert.equal((await verifyAuditBundle({ bundleRoot: join(none.root, "bundle") })).status, "verified");
  const over = fixture(); const gap = signedOverrideBundle(over, { "package-lock.json": LOCK, "yarn.lock": "x" });
  assert.deepEqual(gap.plan.evidence.items.map((entry) => `${entry.item}:${entry.status}:${entry.code}`), ["sbom:carried:SBOM-OVERRIDDEN", "sbom-document:cyclonedx-json:carried:null", "sbom-document:spdx-json:carried:null", "sbom-override:request:carried:null", "sbom-override:proof:carried:null"]);
  await buildAuditBundle({ repositoryRoot: over.root, outputPath: "bundle", plan: gap.plan });
  assert.equal((await verifyAuditBundle({ bundleRoot: join(over.root, "bundle") })).status, "verified");
  assert.match(readFileSync(join(over.root, "bundle", "README.md"), "utf8"), /SBOM-OVERRIDDEN/u);
});
// The PO's signed override: the bundle carries the request and the proof and the offline verifier checks the signature and what it binds.
function signedOverrideBundle(input, files, { keyReference = "po-key", edit = (request) => request } = {}) {
  const read = (path) => files[path] ?? null; const base = { featureId: FEATURE_ID, evidenceDir: "evidence", tracked: Object.keys(files), read };
  const blocked = closeSbom(base).blocks;
  const request = edit(createSbomOverrideRequest({ featureId: FEATURE_ID, blocked, candidate: { commit: "1".repeat(40), tree: "2".repeat(40) } }));
  const { publicKey, privateKey } = generateKeyPairSync("ed25519"); const pem = publicKey.export({ type: "spki", format: "pem" });
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256, keyReference, publicKey: pem, signatureBase64: cryptoSign(null, Buffer.from(request.approvalIntent.sha256, "utf8"), privateKey).toString("base64") };
  const authority = { kind: "po-signature", keyReference, intentSha256: request.intentSha256, proofSha256: verifyPoApprovalProof({ intent: request.approvalIntent, trustPolicy: { keyReference, publicKeySha256: hash(pem) }, proof }).proofSha256, candidateCommit: "1".repeat(40) };
  const closed = closeSbom({ ...base, override: "accepted by signature", authority, actor: "po" });
  mkdirSync(join(input.root, "evidence/sbom"), { recursive: true });
  for (const file of closed.files) writeFileSync(join(input.root, file.path), file.text);
  writeFileSync(join(input.root, "evidence/sbom/override-request.json"), `${JSON.stringify(request, null, 2)}\n`); writeFileSync(join(input.root, "evidence/sbom/override-proof.json"), `${JSON.stringify(proof, null, 2)}\n`);
  return { closed, plan: planWith(input, { candidate: CANDIDATE, evidence: { sbomRecordPath: "evidence/sbom/record.json" } }) };
}
test("C28c a signed override that does not hold offline is found: other findings in the request, a key the record does not name, a missing proof", async () => {
  const files = { "package-lock.json": LOCK, "yarn.lock": "x" };
  const tampered = async (options, mutate = () => {}) => {
    const input = fixture(); signedOverrideBundle(input, files, options); mutate(input);
    const plan = planWith(input, { candidate: CANDIDATE, evidence: { sbomRecordPath: "evidence/sbom/record.json" } });
    await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan });
    return (await verifyAuditBundle({ bundleRoot: join(input.root, "bundle") })).findings;
  };
  assert.deepEqual(await tampered({}), [], "an honest signed override verifies");
  // A request that names other findings than the record covered (it re-derives, so only the binding to the record catches it).
  assert.ok((await tampered({ edit: (request) => createSbomOverrideRequest({ featureId: FEATURE_ID, blocked: [{ ...request.blocked[0], path: "other.lock" }], candidate: request.candidate }) })).includes("AB-SBOM-OVERRIDE"));
  // A request that no longer re-derives from its own fields.
  assert.ok((await tampered({ edit: (request) => ({ ...request, featureId: "another-feature" }) })).includes("AB-SBOM-OVERRIDE"));
  // A proof whose signature does not match: replace the carried proof file's signature before the bundle is built.
  const forged = await tampered({}, (input) => { const path = join(input.root, "evidence/sbom/override-proof.json"); const proof = JSON.parse(readFileSync(path, "utf8")); writeFileSync(path, `${JSON.stringify({ ...proof, signatureBase64: Buffer.from("forged").toString("base64") }, null, 2)}\n`); });
  assert.ok(forged.includes("AB-SBOM-OVERRIDE"));
  // A missing proof file is a typed gap in the plan, never a silent pass.
  const input = fixture(); signedOverrideBundle(input, files); rmSync(join(input.root, "evidence/sbom/override-proof.json"));
  const plan = planWith(input, { candidate: CANDIDATE, evidence: { sbomRecordPath: "evidence/sbom/record.json" } });
  assert.ok(plan.evidence.items.some((entry) => entry.item === "sbom-override:proof" && entry.status === "gap" && entry.code === "UNREADABLE"));
  await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan });
  assert.ok((await verifyAuditBundle({ bundleRoot: join(input.root, "bundle") })).findings.includes("AB-SBOM-OVERRIDE"));
});
test("C28c an unreadable record or a document that does not match its recorded digest is a typed gap; a damaged carried document is found offline", async () => {
  const absent = planWith(fixture(), { candidate: CANDIDATE, evidence: { sbomRecordPath: "evidence/sbom/absent.json" } });
  assert.deepEqual(absent.evidence.items.map((entry) => `${entry.item}:${entry.status}:${entry.code}`), ["sbom:gap:UNREADABLE"]);
  const input = fixture(); const { plan } = sbomBundle(input, { "package-lock.json": LOCK });
  writeFileSync(join(input.root, "evidence/sbom/spdx.json"), "{}\n");
  const changed = planWith(input, { candidate: CANDIDATE, evidence: { sbomRecordPath: "evidence/sbom/record.json" } });
  assert.deepEqual(changed.evidence.items.map((entry) => `${entry.item}:${entry.status}:${entry.code}`), ["sbom:carried:null", "sbom-document:cyclonedx-json:carried:null", "sbom-document:spdx-json:gap:UNREADABLE"]);
  const second = fixture(); const built = sbomBundle(second, { "package-lock.json": LOCK });
  await buildAuditBundle({ repositoryRoot: second.root, outputPath: "bundle", plan: built.plan });
  const bundle = join(second.root, "bundle"); const manifest = JSON.parse(readFileSync(join(bundle, "manifest.json"), "utf8")); const target = manifest.artifacts.find((entry) => entry.path.endsWith("sbom-document")).path;
  const forged = Buffer.from("{\"bomFormat\":\"x\"}\n"); writeFileSync(join(bundle, target), forged);
  manifest.artifacts = manifest.artifacts.map((entry) => entry.path === target ? { ...entry, sha256: hash(forged) } : entry); writeFileSync(join(bundle, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const findings = (await verifyAuditBundle({ bundleRoot: bundle })).findings;
  assert.ok(findings.some((finding) => finding.startsWith("AB-SBOM-DOCUMENT")), findings.join(","));
  assert.ok(plan.evidence.items.length === 3);
});
test("Q3 evidence bound to another candidate or not passing is a typed gap and is not carried", () => {
  const other = { commit: "e".repeat(40), tree: "f".repeat(40) }; const input = fixture();
  const plan = planWith(input, { evidence: { ...evidenceFiles(input.root, { traceCandidate: other, verifyCandidate: other, securityCandidate: other }) } });
  assert.deepEqual(plan.evidence.items.filter((entry) => entry.status === "gap").map((entry) => `${entry.item}:${entry.code}`), ["approval-trace:OTHER-CANDIDATE", "verify-record:OTHER-CANDIDATE", "security-scan:OTHER-CANDIDATE"]);
  const input2 = fixture(); const plan2 = planWith(input2, { evidence: evidenceFiles(input2.root, { verifyMode: "candidate", securityFindings: [{ id: "x" }] }) });
  assert.deepEqual(plan2.evidence.items.filter((entry) => entry.status === "gap").map((entry) => `${entry.item}:${entry.code}`), ["verify-record:NOT-RELEASE-VERIFY", "security-scan:NOT-PASSING"]);
});
test("Q3 an untraceable or attribution-only trace is carried with its verdict named, not hidden", () => {
  const input = fixture(); const plan = planWith(input, { evidence: evidenceFiles(input.root, { traceStatus: "untraceable" }) });
  assert.equal(plan.evidence.traceStatus, "untraceable"); assert.equal(plan.evidence.items[0].code, "TRACE-UNTRACEABLE");
  const input2 = fixture(); assert.equal(planWith(input2, { evidence: evidenceFiles(input2.root, { traceStatus: "attribution-only" }) }).evidence.items[0].code, "TRACE-ATTRIBUTION-ONLY");
});
test("Q3 the bundle binds the audited candidate, not its parent, and refuses a different candidate", () => {
  const input = fixture(); assert.equal(planWith(input, { candidate: CANDIDATE }).candidate.commit, CANDIDATE.commit);
  for (const wrong of [{ commit: "9".repeat(40), tree: CANDIDATE.tree }, { commit: CANDIDATE.commit, tree: "9".repeat(40) }, { commit: CANDIDATE.commit }]) assert.throws(() => planWith(input, { candidate: wrong }), (error) => error.code === "AB-CANDIDATE-MISMATCH");
});
test("Q3 verification rejects a carried trace that is bound to another commit than the manifest", async () => {
  const input = fixture(); const plan = planWith(input, { evidence: evidenceFiles(input.root) }); await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan });
  const bundle = join(input.root, "bundle"); const manifest = JSON.parse(readFileSync(join(bundle, "manifest.json"), "utf8")); const tracePath = manifest.artifacts.find((entry) => entry.path.endsWith("approval-trace")).path;
  const forged = Buffer.from(`${JSON.stringify({ schema: "pipeline.human-approval-trace.v1", candidate: { commit: "e".repeat(40), tree: "f".repeat(40) }, status: "traced", rows: [] })}\n`); writeFileSync(join(bundle, tracePath), forged);
  manifest.artifacts = manifest.artifacts.map((entry) => entry.path === tracePath ? { ...entry, sha256: hash(forged) } : entry); writeFileSync(join(bundle, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  assert.ok((await verifyAuditBundle({ bundleRoot: bundle })).findings.includes("AB-EVIDENCE-TRACE-CANDIDATE"));
});
// P3 (C20D-P3-ONE-SHOT-CLOSE, AC-108): the signed approval proof envelopes live in the private store, outside the repository; the audit bundle copies
// the PUBLIC proof objects (never a key) into proofs/ with their digests in the manifest, and the offline verifier checks bytes, intent and signature.
function signedProof(intentSha256 = "d".repeat(64)) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { schema: "pipeline.po-approval-proof.v1", intentSha256, keyReference: "po-key-1", publicKey: publicKey.export({ type: "spki", format: "pem" }), signatureBase64: cryptoSign(null, Buffer.from(intentSha256, "utf8"), privateKey).toString("base64") };
}
test("P3 the bundle carries every signed proof envelope in proofs/ with matching digests, verifies offline, and a bundle without proofs keeps its old shape", async () => {
  const input = fixture(); const plan0 = planWith(input, { candidate: CANDIDATE }); assert.equal(Object.hasOwn(plan0, "proofs"), false);
  const plan = planWith(input, { candidate: CANDIDATE, proofs: [{ kind: "plan-approval", proof: signedProof("1".repeat(64)) }, { kind: "push", proof: signedProof("2".repeat(64)) }] });
  assert.deepEqual(plan.proofs.map((entry) => entry.bundlePath), ["proofs/001-plan-approval.json", "proofs/002-push.json"]);
  await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan }); const bundle = join(input.root, "bundle"); const manifest = JSON.parse(readFileSync(join(bundle, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.proofs.map((entry) => `${entry.kind}:${entry.path}:${entry.intentSha256}`), [`plan-approval:proofs/001-plan-approval.json:${"1".repeat(64)}`, `push:proofs/002-push.json:${"2".repeat(64)}`]);
  for (const entry of manifest.proofs) { const bytes = readFileSync(join(bundle, entry.path)); assert.equal(hash(bytes), entry.sha256); assert.doesNotMatch(bytes.toString("utf8"), /PRIVATE KEY/u); }
  assert.match(readFileSync(join(bundle, "README.md"), "utf8"), /proofs\/001-plan-approval\.json/u);
  assert.equal((await verifyAuditBundle({ bundleRoot: bundle })).status, "verified");
  const plain = join(input.root, "plain"); await buildAuditBundle({ repositoryRoot: input.root, outputPath: "plain", plan: plan0 }); assert.equal(Object.hasOwn(JSON.parse(readFileSync(join(plain, "manifest.json"), "utf8")), "proofs"), false);
});
test("P3 the verifier refuses a tampered proof at every level: bytes, the intent it names and the signature", async () => {
  const input = fixture(); const plan = planWith(input, { candidate: CANDIDATE, proofs: [{ kind: "plan-approval", proof: signedProof() }] }); await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan });
  const bundle = join(input.root, "bundle"); const manifestPath = join(bundle, "manifest.json"); const original = readFileSync(manifestPath); const proofPath = join(bundle, "proofs", "001-plan-approval.json"); const proofBytes = readFileSync(proofPath);
  writeFileSync(proofPath, `${proofBytes.toString("utf8")} `); assert.ok((await verifyAuditBundle({ bundleRoot: bundle })).findings.some((finding) => finding.startsWith("AB-DIGEST proofs/")));
  // the manifest and the proof rewritten together keep every digest consistent: the signature check is what refuses
  const rewrite = (mutate) => { const proof = mutate(JSON.parse(proofBytes.toString("utf8"))); const bytes = Buffer.from(`${JSON.stringify(proof)}\n`); writeFileSync(proofPath, bytes); const manifest = JSON.parse(original.toString("utf8")); manifest.proofs[0].sha256 = hash(bytes); writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`); };
  rewrite((proof) => ({ ...proof, signatureBase64: Buffer.alloc(64, 7).toString("base64") })); assert.ok((await verifyAuditBundle({ bundleRoot: bundle })).findings.includes("AB-PROOF-SIGNATURE proofs/001-plan-approval.json"));
  rewrite((proof) => ({ ...proof, intentSha256: "e".repeat(64) })); assert.ok((await verifyAuditBundle({ bundleRoot: bundle })).findings.includes("AB-PROOF-INTENT proofs/001-plan-approval.json"));
});
test("P3 planning refuses a proof that does not verify, or one that carries anything beyond the public proof fields", () => {
  const input = fixture(); const good = signedProof();
  assert.throws(() => planWith(input, { candidate: CANDIDATE, proofs: [{ kind: "push", proof: { ...good, signatureBase64: Buffer.alloc(64, 1).toString("base64") } }] }), (error) => error.code === "AB-PROOF-INVALID");
  assert.throws(() => planWith(input, { candidate: CANDIDATE, proofs: [{ kind: "push", proof: { ...good, privateKey: "-----BEGIN PRIVATE KEY-----" } }] }), (error) => error.code === "AB-PROOF-INVALID");
});
test("P3 collection reads the plan approval proof from State and the store envelopes of exactly the candidate commit; anything else is a typed gap or ignored", async () => {
  const { collectAuditProofs } = await import("./audit-proof-collection.mjs");
  const { criticalApprovalStoreRoot, CRITICAL_APPROVAL_STORE_SCHEMA } = await import("./critical-action-authorization.mjs");
  const common = mkdtempSync(join(tmpdir(), "audit-proofs-"));
  try {
    const envelope = (kind, forCommit, proof) => ({ schema: CRITICAL_APPROVAL_STORE_SCHEMA, kind, approval: { forCommit, criticalProof: { proof } } });
    const put = (kind, name, value) => { const directory = join(criticalApprovalStoreRoot(common), "approvals", kind); mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, name), JSON.stringify(value)); };
    put("push", "a.json", envelope("push", CANDIDATE.commit, signedProof("2".repeat(64))));
    put("push", "b.json", envelope("push", "f".repeat(40), signedProof("3".repeat(64))));
    put("feature-package-reconcile", "c.json", envelope("feature-package-reconcile", CANDIDATE.commit, { ...signedProof("4".repeat(64)), signatureBase64: Buffer.alloc(64, 1).toString("base64") }));
    const state = { planApproval: { designApproval: { mode: "signature", proof: signedProof("1".repeat(64)) } } };
    const collected = collectAuditProofs({ common, candidate: CANDIDATE, state });
    assert.deepEqual(collected.proofs.map((entry) => `${entry.kind}:${entry.proof.intentSha256}`), [`plan-approval:${"1".repeat(64)}`, `push:${"2".repeat(64)}`]);
    assert.deepEqual(collected.gaps.map((gap) => gap.code.split(":")[0]), ["PROOF-NOT-CARRIABLE"]);
    assert.deepEqual(collectAuditProofs({ common, candidate: CANDIDATE, state: { planApproval: { designApproval: { mode: "chat" } } } }).proofs.map((entry) => entry.kind), ["push"], "a chat-mode approval keeps no proof");
    assert.deepEqual(collectAuditProofs({}), { proofs: [], gaps: [] });
  } finally { rmSync(common, { recursive: true, force: true }); }
});
test("C21E the PO acknowledgement of a caller-authored Critic is found by its packet, not by the close candidate", async () => {
  const { collectAuditProofs } = await import("./audit-proof-collection.mjs");
  const { criticalApprovalStoreRoot, CRITICAL_APPROVAL_STORE_SCHEMA } = await import("./critical-action-authorization.mjs");
  const common = mkdtempSync(join(tmpdir(), "audit-proofs-ack-")); const kind = "acknowledge-caller-authored-critic";
  try {
    const directory = join(criticalApprovalStoreRoot(common), "approvals", kind); mkdirSync(directory, { recursive: true });
    const put = (name, packetId, intent) => writeFileSync(join(directory, name), JSON.stringify({ schema: CRITICAL_APPROVAL_STORE_SCHEMA, kind, approval: { forCommit: "e".repeat(40), packetId, criticalProof: { proof: signedProof(intent) } } }));
    put("a.json", "packet-one", "5".repeat(64)); put("b.json", "packet-two", "6".repeat(64));
    assert.deepEqual(collectAuditProofs({ common, candidate: CANDIDATE }).proofs, [], "without a packet nothing of this kind is collected");
    assert.deepEqual(collectAuditProofs({ common, candidate: CANDIDATE, criticPacketId: "packet-one" }).proofs.map((entry) => `${entry.kind}:${entry.proof.intentSha256}`), [`${kind}:${"5".repeat(64)}`]);
  } finally { rmSync(common, { recursive: true, force: true }); }
});
test("C21E the bundle lists the tracked evidence with Git blobs in manifest and README, verifies offline, and refuses a malformed index", async () => {
  const blob = "c".repeat(40); assert.equal(evidenceIndexFromLsTree(""), null);
  const index = evidenceIndexFromLsTree([`100644 blob ${blob}\tspecs/x/evidence/critic/r1/report.md`, `100644 blob ${blob}\tspecs/x/evidence/verify-candidate.json`, `100644 blob ${blob}\tspecs/x/result.md`, `100644 blob ${blob}\t"specs/x/quoted\\303\\244.md"`].join("\n"));
  assert.deepEqual(index.entries.map((entry) => entry.group), ["critic-reviews", "verify-records", "other"]); assert.equal(index.omitted, 1);
  const input = fixture(); const plan = planWith(input, { candidate: CANDIDATE, evidenceIndex: index });
  await buildAuditBundle({ repositoryRoot: input.root, outputPath: "bundle", plan }); const bundle = join(input.root, "bundle"); const manifestPath = join(bundle, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")); assert.deepEqual(manifest.evidenceIndex, index);
  const readme = readFileSync(join(bundle, "README.md"), "utf8"); assert.match(readme, /## Evidence index/u); assert.match(readme, /specs\/x\/evidence\/critic\/r1\/report\.md/u); assert.match(readme, /1 tracked path\(s\) could not be listed/u);
  assert.equal((await verifyAuditBundle({ bundleRoot: bundle })).status, "verified");
  manifest.evidenceIndex.entries[0].blob = "not-a-blob"; writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  assert.ok((await verifyAuditBundle({ bundleRoot: bundle })).findings.includes("AB-EVIDENCE-INDEX"));
  assert.throws(() => planWith(input, { candidate: CANDIDATE, evidenceIndex: { ...index, source: "by-hand" } }), (error) => error.code === "AB-EVIDENCE-INDEX");
});
// C20E-AP (AC-108): the push and release approvals come AFTER the close commit (the push approval signs the commit that carries the bundle), so their
// public proofs reach the bundle in a follow-up: new files under proofs/ plus ONE follow-up list; manifest.json and README.md stay byte for byte.
async function followUpBundle(proofs = [{ kind: "plan-approval", proof: signedProof("1".repeat(64)) }]) {
  const input = fixture(); const plan = planWith(input, { candidate: CANDIDATE, proofs }); mkdirSync(join(input.root, "audit-bundles", "release-evidence"), { recursive: true }); await buildAuditBundle({ repositoryRoot: input.root, outputPath: `audit-bundles/release-evidence/${CANDIDATE.commit}`, plan });
  return { ...input, bundleDir: `audit-bundles/release-evidence/${CANDIDATE.commit}`, bundle: join(input.root, "audit-bundles", "release-evidence", CANDIDATE.commit) };
}
test("a later approved commit gets its own numbered list, numbering continues, nothing is carried twice, and a tampered evidence record is found", async () => {
  const { writeAuditProofFollowUp } = await import("./audit-proof-collection.mjs");
  const input = await followUpBundle();
  const first = "a".repeat(40); const second = "b".repeat(40);
  const record = { kind: "final-verify", bytes: Buffer.from(`${JSON.stringify({ schema: "pipeline.verify-evidence.v0", commit: first })}\n`) };
  assert.equal(writeAuditProofFollowUp({ root: input.root, bundleDir: input.bundleDir, approvedCommit: first, proofs: [{ kind: "push", proof: signedProof("2".repeat(64)) }], evidence: [record] }).status, "written");
  assert.equal(writeAuditProofFollowUp({ root: input.root, bundleDir: input.bundleDir, approvedCommit: first, proofs: [{ kind: "push", proof: signedProof("2".repeat(64)) }] }).status, "already-followed-up", "the same commit gets no second list");
  const later = writeAuditProofFollowUp({ root: input.root, bundleDir: input.bundleDir, approvedCommit: second, proofs: [{ kind: "release-preflight", proof: signedProof("3".repeat(64)) }], evidence: [record] });
  assert.equal(later.status, "written");
  const names = readdirSync(join(input.bundle, "proofs")).sort();
  assert.ok(names.includes("follow-up.json") && names.includes("follow-up-002.json"), names.join());
  const list = JSON.parse(readFileSync(join(input.bundle, "proofs", "follow-up-002.json"), "utf8"));
  assert.equal(Object.hasOwn(list, "evidence"), false, "the same record is not carried twice");
  assert.deepEqual(list.proofs.map((entry) => entry.path), ["proofs/004-release-preflight.json"]);
  assert.equal((await verifyAuditBundle({ bundleRoot: input.bundle })).status, "verified");
  const carried = JSON.parse(readFileSync(join(input.bundle, "proofs", "follow-up.json"), "utf8")).evidence[0].path;
  writeFileSync(join(input.bundle, carried), "{}\n");
  assert.match(JSON.stringify(await verifyAuditBundle({ bundleRoot: input.bundle })), /AB-DIGEST/u);
});

test("C20E-AP the follow-up adds the push and release proofs as new files, leaves the manifest and README bytes alone, and the bundle verifies before and after", async () => {
  const { writeAuditProofFollowUp } = await import("./audit-proof-collection.mjs");
  const input = await followUpBundle(); const manifestBefore = readFileSync(join(input.bundle, "manifest.json")); const readmeBefore = readFileSync(join(input.bundle, "README.md"));
  assert.equal((await verifyAuditBundle({ bundleRoot: input.bundle })).status, "verified");
  const approved = "c".repeat(40);
  const written = writeAuditProofFollowUp({ root: input.root, bundleDir: input.bundleDir, approvedCommit: approved, proofs: [{ kind: "push", proof: signedProof("2".repeat(64)) }, { kind: "release-preflight", proof: signedProof("3".repeat(64)) }], attributions: [] });
  assert.equal(written.status, "written");
  assert.deepEqual(written.files.map((file) => file.path), [`${input.bundleDir}/proofs/002-push.json`, `${input.bundleDir}/proofs/003-release-preflight.json`, `${input.bundleDir}/proofs/follow-up.json`]);
  assert.deepEqual(readFileSync(join(input.bundle, "manifest.json")), manifestBefore, "manifest.json is create-only: unchanged");
  assert.deepEqual(readFileSync(join(input.bundle, "README.md")), readmeBefore, "README.md is unchanged");
  const list = JSON.parse(readFileSync(join(input.bundle, "proofs", "follow-up.json"), "utf8"));
  assert.equal(list.approvedCommit, approved); assert.deepEqual(list.candidate, CANDIDATE); assert.deepEqual(list.proofs.map((entry) => entry.kind), ["push", "release-preflight"]);
  for (const file of written.files) { const bytes = readFileSync(join(input.root, file.path)); assert.equal(hash(bytes), file.sha256); assert.doesNotMatch(bytes.toString("utf8"), /PRIVATE KEY/u); }
  assert.equal((await verifyAuditBundle({ bundleRoot: input.bundle })).status, "verified");
  assert.equal(writeAuditProofFollowUp({ root: input.root, bundleDir: input.bundleDir, approvedCommit: approved, proofs: [{ kind: "push", proof: signedProof("4".repeat(64)) }], attributions: [] }).status, "already-followed-up", "create-only: a second follow-up adds nothing");
});
test("C20E-AP the verifier refuses a tampered follow-up at every level: bytes, the intent it names and the signature", async () => {
  const { writeAuditProofFollowUp } = await import("./audit-proof-collection.mjs");
  const input = await followUpBundle(); writeAuditProofFollowUp({ root: input.root, bundleDir: input.bundleDir, approvedCommit: "c".repeat(40), proofs: [{ kind: "push", proof: signedProof("2".repeat(64)) }], attributions: [] });
  const proofPath = join(input.bundle, "proofs", "002-push.json"); const listPath = join(input.bundle, "proofs", "follow-up.json"); const proofBytes = readFileSync(proofPath); const listBytes = readFileSync(listPath);
  writeFileSync(proofPath, `${proofBytes.toString("utf8")} `); assert.ok((await verifyAuditBundle({ bundleRoot: input.bundle })).findings.some((finding) => finding.startsWith("AB-DIGEST proofs/002-push.json")));
  const rewrite = (mutate) => { const proof = mutate(JSON.parse(proofBytes.toString("utf8"))); const bytes = Buffer.from(`${JSON.stringify(proof)}\n`); writeFileSync(proofPath, bytes); const list = JSON.parse(listBytes.toString("utf8")); list.proofs[0].sha256 = hash(bytes); writeFileSync(listPath, `${JSON.stringify(list)}\n`); };
  rewrite((proof) => ({ ...proof, signatureBase64: Buffer.alloc(64, 7).toString("base64") })); assert.ok((await verifyAuditBundle({ bundleRoot: input.bundle })).findings.includes("AB-PROOF-SIGNATURE proofs/002-push.json"));
  rewrite((proof) => ({ ...proof, intentSha256: "e".repeat(64) })); assert.ok((await verifyAuditBundle({ bundleRoot: input.bundle })).findings.includes("AB-PROOF-INTENT proofs/002-push.json"));
  writeFileSync(listPath, "{}\n"); assert.ok((await verifyAuditBundle({ bundleRoot: input.bundle })).findings.includes("AB-FOLLOWUP"));
  writeFileSync(listPath, listBytes.toString("utf8").replace(CANDIDATE.commit, "9".repeat(40))); assert.ok((await verifyAuditBundle({ bundleRoot: input.bundle })).findings.includes("AB-FOLLOWUP"), "a follow-up bound to another candidate is refused");
});
test("C20E-AP a chat-mode approval is carried as an attribution record (kind, mode, time), never as a proof; a proof that does not verify is refused; the follow-up never holds a key", async () => {
  const { writeAuditProofFollowUp } = await import("./audit-proof-collection.mjs");
  const input = await followUpBundle();
  assert.throws(() => writeAuditProofFollowUp({ root: input.root, bundleDir: input.bundleDir, approvedCommit: "c".repeat(40), proofs: [{ kind: "push", proof: { ...signedProof(), signatureBase64: Buffer.alloc(64, 1).toString("base64") } }], attributions: [] }), (error) => error.code === "AB-PROOF-INVALID");
  assert.throws(() => writeAuditProofFollowUp({ root: input.root, bundleDir: input.bundleDir, approvedCommit: "c".repeat(40), proofs: [{ kind: "push", proof: { ...signedProof(), privateKey: "-----BEGIN PRIVATE KEY-----" } }], attributions: [] }), (error) => error.code === "AB-PROOF-INVALID");
  const written = writeAuditProofFollowUp({ root: input.root, bundleDir: input.bundleDir, approvedCommit: "c".repeat(40), proofs: [], attributions: [{ kind: "push", mode: "chat-attributed-unattested", approvedAt: "2026-11-08T10:00:00.000Z" }, { kind: "release-preflight", mode: "waiver", approvedAt: null }] });
  assert.deepEqual(written.files.map((file) => file.path), [`${input.bundleDir}/proofs/follow-up.json`], "no proof file is written for an attribution");
  const list = JSON.parse(readFileSync(join(input.bundle, "proofs", "follow-up.json"), "utf8")); assert.deepEqual(list.proofs, []); assert.equal(list.attributions.length, 2);
  assert.equal((await verifyAuditBundle({ bundleRoot: input.bundle })).status, "verified");
  const empty = await followUpBundle(); assert.equal(writeAuditProofFollowUp({ root: empty.root, bundleDir: empty.bundleDir, approvedCommit: "c".repeat(40), proofs: [], attributions: [] }).status, "nothing-to-carry");
});
test("C20E-AP the release step finds the feature's bundle (named after the package candidate, an ancestor of the approved commit), carries the signed push proof from the store and the release proof, and is never blocking without a bundle", async () => {
  const { prepareAuditProofFollowUp } = await import("./audit-proof-collection.mjs");
  const { criticalApprovalStoreRoot, CRITICAL_APPROVAL_STORE_SCHEMA } = await import("./critical-action-authorization.mjs");
  const root = mkdtempSync(join(tmpdir(), "audit-followup-prepare-")); const git = (...args) => execFileSync("git", ["-C", root, "-c", "user.name=T", "-c", "user.email=t@example.invalid", ...args], { encoding: "utf8" }).trim();
  try {
    git("init", "-q", "-b", "main"); writeFileSync(join(root, "a.txt"), "a\n"); git("add", "a.txt"); git("commit", "-q", "-m", "candidate"); const candidate = git("rev-parse", "HEAD"); const tree = git("rev-parse", "HEAD^{tree}");
    const common = join(root, ".git"); const noBundle = prepareAuditProofFollowUp({ root, featureId: "feature-x", approvedCommit: candidate, common, releaseProof: null, releaseApproval: null });
    assert.equal(noBundle.status, "no-bundle", "a release without a bundle is a typed notice, not a refusal");
    const dir = `audit-bundles/feature-x/${candidate}`; mkdirSync(join(root, dir, "proofs"), { recursive: true }); writeFileSync(join(root, dir, "manifest.json"), `${JSON.stringify({ schema: "pipeline.audit-bundle-manifest.v1", bundleId: "feature-x", candidate: { commit: candidate, tree }, proofs: [{ kind: "plan-approval", path: "proofs/001-plan-approval.json", sha256: "1".repeat(64), intentSha256: "1".repeat(64) }] })}\n`); writeFileSync(join(root, dir, "proofs", "001-plan-approval.json"), "{}\n");
    git("add", "-A"); git("commit", "-q", "-m", "close"); const approved = git("rev-parse", "HEAD");
    const put = (kind, name, value) => { const directory = join(criticalApprovalStoreRoot(common), "approvals", kind); mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, name), JSON.stringify(value)); };
    put("push", "a.json", { schema: CRITICAL_APPROVAL_STORE_SCHEMA, kind: "push", forCommit: approved, approvedAt: "2026-11-08T10:00:00.000Z", remote: "origin", destination: "refs/heads/main", approval: { forCommit: approved, approvedAt: "2026-11-08T10:00:00.000Z", remote: "origin", destination: "refs/heads/main", criticalProof: { proofSha256: "5".repeat(64), proof: signedProof("5".repeat(64)) } } });
    const result = prepareAuditProofFollowUp({ root, featureId: "feature-x", approvedCommit: approved, common, releaseProof: signedProof("6".repeat(64)), releaseApproval: { mode: "signature", approvedAt: "2026-11-08T11:00:00.000Z" } });
    assert.equal(result.status, "written", JSON.stringify(result)); assert.equal(result.bundleDir, dir);
    assert.deepEqual(result.files.map((file) => file.path), [`${dir}/proofs/002-push.json`, `${dir}/proofs/003-release-preflight.json`, `${dir}/proofs/follow-up.json`], "numbering continues after the manifest's proofs");
    const chat = prepareAuditProofFollowUp({ root, featureId: "feature-x", approvedCommit: approved, common, releaseProof: null, releaseApproval: { mode: "waiver", approvedAt: "2026-11-08T11:00:00.000Z" } });
    assert.equal(chat.status, "already-followed-up");
  } finally { rmSync(root, { recursive: true, force: true }); }
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
