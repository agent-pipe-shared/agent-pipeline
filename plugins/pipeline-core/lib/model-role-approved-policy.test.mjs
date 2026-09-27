// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, openSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModelRolePolicyApprovalIntent, readModelRoleApprovedPolicy,
  verifyModelRoleApprovedPolicy } from "./model-role-approved-policy.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const cases = [];
function test(name, run) { cases.push({ id: `MRP${String(cases.length + 1).padStart(2, "0")}`, name, run }); }
const routeSource = { ok: true,
  taskRoutes: [
    { taskRoute: "duty.implement", runner: "codex", role: "worker", effort: "high" },
    { taskRoute: "duty.read", runner: "codex", role: "worker", effort: "medium" },
  ],
  configuredRoutes: [
    { runner: "codex", role: "worker", effort: "high", selector: { kind: "model-id", value: "old" } },
    { runner: "codex", role: "worker", effort: "medium", selector: { kind: "model-id", value: "old" } },
  ] };
const policy = { schema: "pipeline.model-role-policy.v1", runner: "codex", role: "worker",
  approved: [{ modelId: "approved", rank: 1, efforts: ["high", "medium"],
    compatibilityEvidenceSha256: "a".repeat(64) }] };
const approvedPolicies = routeSource.configuredRoutes.map(({ runner, role, effort }) =>
  ({ runner, role, effort, policy }));
const candidateAtApproval = { commit: "b".repeat(40), tree: "c".repeat(40) };
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ format: "pem", type: "spki" });
const trustAnchors = [{ keyReference: "po-key", publicKeySha256:
  createHash("sha256").update(publicPem).digest("hex") }];
function signedBundle(entries = approvedPolicies, source = routeSource) {
  const approvalIntent = createModelRolePolicyApprovalIntent({ routeSource: source,
    approvedPolicies: entries, candidateAtApproval });
  return { schema: "pipeline.model-role-approved-policy.v1", candidateAtApproval,
    approvedPolicies: entries, approvalIntent, proof: { schema: "pipeline.po-approval-proof.v1",
      intentSha256: approvalIntent.sha256, keyReference: "po-key", publicKey: publicPem,
      signatureBase64: sign(null, Buffer.from(approvalIntent.sha256, "utf8"), privateKey).toString("base64") } };
}

test("signed policy binds all task routes and remains valid after unrelated commits", () => {
  const bundle = signedBundle();
  const first = verifyModelRoleApprovedPolicy({ bundle, routeSource, trustAnchors });
  assert.equal(first.ok, true);
  assert.equal(first.approvedPolicies.length, 2);
  assert.equal(verifyModelRoleApprovedPolicy({ bundle, routeSource, trustAnchors }).ok, true,
    "the verifier does not compare the approval provenance with the current HEAD");
});

test("task remapping, policy edits, missing anchors and proof replacement fail closed", () => {
  const bundle = signedBundle();
  const remapped = structuredClone(routeSource);
  remapped.taskRoutes[0].role = "frontier";
  assert.equal(verifyModelRoleApprovedPolicy({ bundle, routeSource: remapped, trustAnchors }).ok, false);
  const changed = structuredClone(bundle);
  changed.approvedPolicies[0].policy.approved[0].modelId = "unapproved";
  assert.equal(verifyModelRoleApprovedPolicy({ bundle: changed, routeSource, trustAnchors }).ok, false);
  assert.equal(verifyModelRoleApprovedPolicy({ bundle, routeSource, trustAnchors: [] }).ok, false);
  const forged = structuredClone(bundle);
  forged.proof.signatureBase64 = "AA==";
  assert.equal(verifyModelRoleApprovedPolicy({ bundle: forged, routeSource, trustAnchors }).ok, false);
});

test("a role cannot carry inconsistent policy copies across its effort slots", () => {
  const different = structuredClone(approvedPolicies);
  different[1].policy = structuredClone(different[1].policy);
  different[1].policy.approved[0].rank = 2;
  const bundle = signedBundle(different);
  assert.equal(verifyModelRoleApprovedPolicy({ bundle, routeSource, trustAnchors }).code,
    "MODEL-ROLE-POLICY-INCONSISTENT-ROLE");
});

test("host reader requires an anchored proof and refuses a symlinked policy parent", () => {
  const root = mkdtempSync(join(tmpdir(), "model-role-policy-"));
  try {
    mkdirSync(join(root, "project"));
    const trustBytes = JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"],
      waivedKinds: [], trustAnchors,
    });
    const policyBytes = JSON.stringify(signedBundle());
    writeFileSync(join(root, "project", "critical-human-proof.json"), trustBytes);
    writeFileSync(join(root, "project", "model-role-approved-policy.v1.json"), policyBytes);
    assert.equal(readModelRoleApprovedPolicy({ rootDir: root, routeSource }).ok, true);
    const other = mkdtempSync(join(tmpdir(), "model-role-policy-other-"));
    try {
      writeFileSync(join(other, "critical-human-proof.json"), trustBytes);
      writeFileSync(join(other, "model-role-approved-policy.v1.json"), policyBytes);
      rmSync(join(root, "project"), { recursive: true });
      symlinkSync(other, join(root, "project"));
      assert.equal(readModelRoleApprovedPolicy({ rootDir: root, routeSource }).ok, false);
    } finally { rmSync(other, { recursive: true, force: true }); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("one installed runner may use a signed partial policy without approving absent runners", () => {
  const mixedSource = structuredClone(routeSource);
  mixedSource.taskRoutes.push({ taskRoute: "duty.implement", runner: "claude",
    role: "worker", effort: "medium" });
  mixedSource.configuredRoutes.push({ runner: "claude", role: "worker", effort: "medium",
    selector: { kind: "alias", value: "sonnet" } });
  const bundle = signedBundle(approvedPolicies, mixedSource);
  assert.equal(verifyModelRoleApprovedPolicy({ bundle, routeSource: mixedSource,
    trustAnchors, requiredRunner: "codex" }).ok, true);
  assert.equal(verifyModelRoleApprovedPolicy({ bundle, routeSource: mixedSource,
    trustAnchors, requiredRunner: "claude" }).code, "MODEL-ROLE-POLICY-ROUTES");
  assert.equal(verifyModelRoleApprovedPolicy({ bundle, routeSource: mixedSource,
    trustAnchors }).code, "MODEL-ROLE-POLICY-ROUTES");
});

assert.equal(cases.length, 5);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
