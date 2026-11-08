// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAuditBundle, planAuditBundle, planAuditBundleSignature, signAuditBundle, verifyAuditBundle, verifyAuditBundleSignature } from "./audit-bundle.mjs";
import { canonicalSha256 } from "./governance-event.mjs";
import { planVerifySelection } from "./verify-selection.mjs";

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
