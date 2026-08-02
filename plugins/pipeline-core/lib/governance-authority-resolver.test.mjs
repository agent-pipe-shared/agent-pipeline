#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { createExternalHumanGovernanceIntent } from "./human-governance-ledger.mjs";
import { requireExternallyVerifiedGovernanceAuthority, requireGovernanceAuthority } from "./governance-authority-resolver.mjs";

const sha = "a".repeat(64); const candidate = { commit: "b".repeat(40), tree: "c".repeat(40) };
const decision = { decisionId: "decision-1", event: "granted", outcome: "granted", authorityClass: "product-owner", identityAssurance: "locally-attributed", timeAssurance: "locally-observed", scope: { repositoryFingerprint: sha, candidate, packageId: "sprint-phoenix-epic", action: "PLAN.APPROVE", environment: "local", artifacts: [{ path: "specs/sprint-phoenix-epic/spec.md", sha256: sha }] }, reasonCode: "SCOPE.ACCEPTED", policyDigest: sha, ruleDigest: sha, validity: { notBeforeEpochMs: 0, expiresAtEpochMs: 100, singleUse: true }, links: { requestDecisionId: "request-1", consumesDecisionId: null, revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null } };
test("resolver exposes only exact granted authority", () => {
  assert.equal(requireGovernanceAuthority({ decisions: [decision], decisionId: "decision-1", repositoryFingerprint: sha, candidate, nowEpochMs: 1 }).granted, true);
  assert.deepEqual(requireGovernanceAuthority({ decisions: [decision], decisionId: "decision-1", repositoryFingerprint: sha, candidate: { ...candidate, tree: "d".repeat(40) }, nowEpochMs: 1 }), { granted: false, reason: "scope-mismatch" });
});

test("external resolver reports proof verification without claiming human identity provenance", () => {
  const plan = { path: "specs/sprint-phoenix-epic/prd_phoenix-epic.md", sha256: "d".repeat(64) };
  const spec = { path: "specs/sprint-phoenix-epic/spec.md", sha256: sha };
  const grant = { ...decision, scope: { ...decision.scope, artifacts: [plan, spec] } };
  const intent = createExternalHumanGovernanceIntent({ decision: grant, plan, spec });
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: intent.sha256, keyReference: "external-po-v1", publicKey, signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), keys.privateKey).toString("base64") };
  const request = { decisions: [grant], decisionId: grant.decisionId, repositoryFingerprint: sha, candidate, nowEpochMs: 1, plan, spec, trustPolicy: { keyReference: proof.keyReference, publicKeySha256: createHash("sha256").update(publicKey).digest("hex") }, proof };
  assert.deepEqual(requireExternallyVerifiedGovernanceAuthority(request).proofTrustAssurance, "caller-supplied-policy");
  assert.equal(requireExternallyVerifiedGovernanceAuthority(request).identityAssurance, undefined);
  assert.deepEqual(requireExternallyVerifiedGovernanceAuthority({ ...request, proof: { ...proof, signatureBase64: "AA==" } }), { granted: false, reason: "external-proof-unverified", proofCode: "HGL-EXTERNAL-PROOF-MISMATCH" });
});
