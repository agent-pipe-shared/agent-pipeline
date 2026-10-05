// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
import { canonicalSha256 } from "../lib/governance-event.mjs";
import { createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";
import { buildAuditPack, planAuditPack, verifyAuditPack } from "./audit-pack.mjs";
const completionCases = [];
function test(name, optionsOrRun, possibleRun) {
  const options = typeof optionsOrRun === "function" ? {} : optionsOrRun ?? {};
  const run = typeof optionsOrRun === "function" ? optionsOrRun : possibleRun;
  if (typeof name !== "string" || typeof run !== "function") throw new TypeError("invalid callback registration");
  const entry = { id: "AUDPK" + String(completionCases.length + 1).padStart(3, "0"), name, run };
  if (options.skip === true) entry.mode = "skip";
  completionCases.push(entry);
}


function git(root, ...args) { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" }).trim(); }
function completedPackageFixture() {
  const root = mkdtempSync(join(tmpdir(), "audit-pack-completed-"));
  git(root, "init", "--quiet", "--template=");
  git(root, "config", "user.name", "Audit Pack Fixture");
  git(root, "config", "user.email", "audit-pack-fixture@example.test");
  writeFileSync(join(root, ".gitignore"), "scratch/\n");
  const keyPair = generateKeyPairSync("ed25519");
  const publicKey = keyPair.publicKey.export({ type: "spki", format: "pem" });
  const keyReference = "audit-pack-test-key";
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [],
    trustAnchors: [{ keyReference, publicKeySha256: createHash("sha256").update(publicKey).digest("hex") }],
  }));
  const base = join(root, "specs", "case-completed");
  mkdirSync(base, { recursive: true });
  const files = [
    ["prd.md", "# PRD\n"], ["spec.md", "# Spec\n"], ["design-input.md", "# Design input\n"],
    ["acceptance.md", "# Acceptance\n"], ["result.md", "# Result\n"],
    ["candidate-evidence.json", "{\"schema\":\"fixture.evidence\"}\n"],
    ["scan-report.json", "{\"schema\":\"fixture.scan\",\"status\":\"complete\"}\n"],
  ];
  for (const [name, bytes] of files) writeFileSync(join(base, name), bytes);
  git(root, "add", ".gitignore", "project/critical-human-proof.json", "specs/case-completed");
  git(root, "commit", "--quiet", "-m", "test: create candidate inputs");
  const candidate = { commit: git(root, "rev-parse", "HEAD"), tree: git(root, "rev-parse", "HEAD^{tree}") };
  const classes = ["prd", "spec", "design", "acceptance", "result", "candidate-evidence", "candidate-evidence"];
  const artifacts = files.map(([name, bytes], index) => ({
    class: classes[index], path: `specs/case-completed/${name}`,
    sha256: createHash("sha256").update(bytes).digest("hex"), authority: index === 0 || index === 1,
    mutability: index >= 5 ? "immutable" : "mutable", retention: "active",
  }));
  writeFileSync(join(base, "lifecycle.json"), `${JSON.stringify({
    schema: "pipeline.feature-package.v1", feature: { id: "case-completed", rigor: 1 }, state: "completed",
    artifacts, candidate, supersedes: null,
  })}\n`);
  return { root, manifestPath: "specs/case-completed/lifecycle.json", keyPair, publicKey, keyReference };
}

function createApprovalEvidence(fixture, directory = "specs/case-completed/evidence") {
  const candidate = { commit: git(fixture.root, "rev-parse", "HEAD"), tree: git(fixture.root, "rev-parse", "HEAD^{tree}") };
  const intent = createPoApprovalIntent({ kind: "push", featureId: "case-completed", planSha256: "a".repeat(64), specSha256: "b".repeat(64), candidate, policyRevision: "v1", subjectSha256: "c".repeat(64), decision: "approve" });
  const signature = sign(null, Buffer.from(intent.sha256, "utf8"), fixture.keyPair.privateKey).toString("base64");
  const proof = { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: fixture.keyReference, publicKey: fixture.publicKey, signatureBase64: signature };
  const base = join(fixture.root, directory);
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, "intent.json"), `${JSON.stringify(intent)}\n`);
  writeFileSync(join(base, "proof.json"), `${JSON.stringify(proof)}\n`);
  return { intentPath: `${directory}/intent.json`, proofPath: `${directory}/proof.json` };
}

test("completed candidate audit pack is candidate-bound, partial on missing review proofs, and offline tamper-evident", () => {
  const fixture = completedPackageFixture();
  try {
    const plan = planAuditPack({
      repositoryRoot: fixture.root,
      manifestPath: fixture.manifestPath,
      packId: "case-audit-pack",
      outputPath: "scratch/audit-packs/case-audit-pack",
      criticPacketIds: [], approvalPairs: [], verifyEvidencePath: null,
    });
    assert.equal(plan.schema, "pipeline.audit-pack-plan.v1");
    assert.equal(plan.status, "preview");
    assert.equal(plan.packSha256, canonicalSha256(plan.pack));
    assert.match(plan.packSha256, /^[a-f0-9]{64}$/u);
    assert.deepEqual(Object.keys(plan).sort(), ["pack", "packSha256", "schema", "status"]);
    assert.deepEqual(Object.keys(plan.pack).sort(), [
      "approvals", "candidate", "criticReports", "featureId", "featurePackage", "missingEvidence",
      "outputPath", "packId", "privacyOmissions", "qualityPackageIntegrations", "scanSources", "schema",
      "sourceKindCounts", "sources", "status", "verifyEvidence",
    ].sort());
    assert.equal(plan.pack.schema, "pipeline.audit-pack.v1");
    assert.match(plan.pack.packId, /^[a-z][a-z0-9-]{2,63}$/u);
    assert.ok(["complete", "partial"].includes(plan.pack.status));
    assert.match(plan.pack.candidate.commit, /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
    assert.match(plan.pack.candidate.tree, /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
    assert.equal(plan.pack.status, "partial");
    assert.equal(plan.pack.featurePackage.state, "completed");
    assert.deepEqual([...plan.pack.missingEvidence].sort(), [
      "candidate-verify-evidence-not-referenced",
      "fresh-critic-report-not-referenced",
      "public-approval-proof-not-referenced",
    ]);
    assert.ok(plan.pack.sources.some((source) => source.kind === "design" && source.path.endsWith("design-input.md")));
    assert.equal(plan.pack.scanSources.length, 1);
    assert.ok(plan.pack.privacyOmissions.includes("private keys"));
    assert.ok(plan.pack.privacyOmissions.includes("raw private Critic packet and report prose"));

    const built = buildAuditPack({ repositoryRoot: fixture.root, plan });
    assert.equal(built.status, "partial");
    const verified = verifyAuditPack({ repositoryRoot: fixture.root, packPath: built.outputPath });
    assert.equal(verified.status, "partial");
    assert.equal(verified.assurance, "internal-digests-only");

    const builtManifest = JSON.parse(readFileSync(join(fixture.root, built.outputPath, "manifest.json"), "utf8"));
    writeFileSync(join(fixture.root, built.outputPath, builtManifest.artifacts[0].path), "tampered\n");
    const tampered = verifyAuditPack({ repositoryRoot: fixture.root, packPath: built.outputPath });
    assert.equal(tampered.status, "invalid");
    assert.ok(tampered.findings.some((finding) => finding.startsWith("AP-DIGEST:")));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("audit pack refuses public-proof references outside the candidate evidence boundary", () => {
  const fixture = completedPackageFixture();
  try {
    assert.throws(() => planAuditPack({
      repositoryRoot: fixture.root,
      manifestPath: fixture.manifestPath,
      packId: "case-audit-pack",
      outputPath: "scratch/audit-packs/case-audit-pack",
      criticPacketIds: [], verifyEvidencePath: null,
      approvalPairs: [{ intentPath: "project/private/intent.json", proofPath: "project/private/proof.json" }],
    }), { code: "AP-APPROVAL-PATH" });
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("audit pack verifies and copies exact public PO intent and proof bytes without exporting local authority metadata", () => {
  const fixture = completedPackageFixture();
  try {
    const approval = createApprovalEvidence(fixture);
    const plan = planAuditPack({
      repositoryRoot: fixture.root,
      manifestPath: fixture.manifestPath,
      packId: "case-audit-pack",
      outputPath: "scratch/audit-packs/case-audit-pack",
      criticPacketIds: [], approvalPairs: [approval], verifyEvidencePath: null,
    });
    assert.equal(plan.pack.approvals.length, 1);
    assert.equal(plan.pack.approvals[0].verification, "canonical-po-approval-proof-verified");
    assert.equal(plan.pack.sources.find((source) => source.path === approval.intentPath).candidateBound, false);
    assert.equal(plan.pack.sources.find((source) => source.path === approval.proofPath).candidateBound, false);
    const receipt = buildAuditPack({ repositoryRoot: fixture.root, plan });
    assert.equal(receipt.status, "partial");
    const verified = verifyAuditPack({ repositoryRoot: fixture.root, packPath: receipt.outputPath });
    assert.equal(verified.status, "partial", JSON.stringify(verified));
    const manifest = JSON.parse(readFileSync(join(fixture.root, receipt.outputPath, "manifest.json"), "utf8"));
    assert.ok(manifest.artifacts.some((artifact) => artifact.sourcePath === approval.proofPath));
    assert.equal(JSON.stringify(manifest).includes("privateKey"), false);
    assert.equal(JSON.stringify(manifest).includes(fixture.keyReference), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

if (completionCases.length !== 3) throw new Error("case completion count drift: expected 3, got " + completionCases.length);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: 65536 });
