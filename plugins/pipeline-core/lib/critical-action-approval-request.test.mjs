// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";

import {
  CRITICAL_ACTION_KINDS, criticalActionSubjectSha256, createCriticalActionApprovalRequest,
  verifyCriticalActionApprovalRequest,
} from "./critical-action-approval-request.mjs";

let tests = 0;
const check = (name, fn) => { fn(); tests += 1; };
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const plan = Buffer.from("plan"); const spec = Buffer.from("spec");
const expiresAt = "2026-08-02T19:00:00.000Z";
const subjectSha256 = criticalActionSubjectSha256({ kind: "push", candidate, subject: { source: candidate.commit, remote: "origin", destination: "refs/heads/main" } });
const action = { kind: "push", subjectSha256, expiresAt };
const request = createCriticalActionApprovalRequest({ candidate, featureId: "sprint-nova-epic", planBytes: plan, specBytes: spec, action });
const keys = generateKeyPairSync("ed25519");
const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
const trustPolicy = { keyReference: "test-key", publicKeySha256: createHash("sha256").update(publicKey).digest("hex") };
const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256, keyReference: "test-key", publicKey, signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), keys.privateKey).toString("base64") };

check("valid exact proof verifies", () => assert.equal(verifyCriticalActionApprovalRequest({ request, trustPolicy, proof, expectedCandidate: candidate, expectedAction: action, now: "2026-08-02T18:30:00.000Z" }).verified, true));
check("candidate drift is rejected", () => assert.equal(verifyCriticalActionApprovalRequest({ request, trustPolicy, proof, expectedCandidate: { ...candidate, commit: "c".repeat(40) }, expectedAction: action, now: "2026-08-02T18:30:00.000Z" }).code, "CRITICAL-ACTION-REQUEST-MISMATCH"));
check("cross-kind use is rejected", () => assert.equal(verifyCriticalActionApprovalRequest({ request, trustPolicy, proof, expectedCandidate: candidate, expectedAction: { ...action, kind: "deploy" }, now: "2026-08-02T18:30:00.000Z" }).code, "CRITICAL-ACTION-REQUEST-MISMATCH"));
check("expired proof is rejected", () => assert.equal(verifyCriticalActionApprovalRequest({ request, trustPolicy, proof, expectedCandidate: candidate, expectedAction: action, now: "2026-08-02T19:00:00.001Z" }).code, "CRITICAL-ACTION-PROOF-EXPIRED"));
// D227: a minor-only residual-acceptance subject keeps its digest byte for byte (the literal was measured against the baseline
// before the reason class existed); a reason class is an extra signed key and changes the digest.
check("D227 the minor-only residual acceptance subject digest is unchanged and a reason class changes it", () => {
  const residualSubject = { criticReceiptSha256: "78ca0c8c095a436f51150503222f357a36934217d2c6d6dc4db884cc39070106", findings: [
    { id: "5f781b4e1e9e7602d42eceaadd25bed03a3fe26c2b17f98aeeb65b50bf140f8b", severity: "minor" },
    { id: "a250750cdb2e2ccb2dd2628008c663c8b5d5df60880dd412846336921d2950d3", severity: "minor" }] };
  const kind = "accept-residual-critic-findings";
  assert.equal(criticalActionSubjectSha256({ kind, candidate, subject: residualSubject }), "ea782ff58b4c44c7d988c0a7611d49802de076f3bf277abe71e69b6b1151e7c1");
  assert.notEqual(criticalActionSubjectSha256({ kind, candidate, subject: { ...residualSubject, reasonClass: "uncorrectable-past-authorship" } }),
    criticalActionSubjectSha256({ kind, candidate, subject: residualSubject }));
});
check("subject digest changes with target", () => assert.notEqual(subjectSha256, criticalActionSubjectSha256({ kind: "push", candidate, subject: { source: candidate.commit, remote: "origin", destination: "refs/heads/other" } })));

// ADR-0064: release-preflight is a fourth kind, not a reuse of an existing one. The source's
// own header comment (critical-action-approval-request.mjs) documents the full, since-extended
// history: ADR-0072 adds a fifth (governance-fork-disposition); PHX-WP-PAC08-RECONCILE-APPROVAL
// (ADR-0056's 2026-08-11 Follow-up) adds a sixth (feature-package-reconcile) -- every consumer
// uses an `includes()` membership test, so a new member only widens what is admissible and
// changes nothing about how push/deploy/publication/release-preflight are treated. d02409a8a adds a seventh
// (interruption-promotion, a signature-only kind consumed by po-human-approval.mjs).
check("CRITICAL_ACTION_KINDS holds the documented seven members in order", () => {
  assert.deepEqual(CRITICAL_ACTION_KINDS, ["push", "deploy", "publication", "release-preflight", "governance-fork-disposition", "feature-package-reconcile", "interruption-promotion", "accept-residual-critic-findings"]);
});
check("a release-preflight request round-trips end to end, and cross-kind substitution stays refused", () => {
  const rpSubject = { schema: "pipeline.release-preflight-consent-subject.v1", version: "1.2.3", base: { commit: "c".repeat(40), tree: "d".repeat(40) }, lifecycle: { featureId: "cyb-4", manifestPath: "lifecycle.json", manifestSha256: "e".repeat(64) }, retentionPolicySha256: "f".repeat(64) };
  const rpSubjectSha256 = criticalActionSubjectSha256({ kind: "release-preflight", candidate, subject: rpSubject });
  const rpAction = { kind: "release-preflight", subjectSha256: rpSubjectSha256, expiresAt };
  const rpRequest = createCriticalActionApprovalRequest({ candidate, featureId: "sprint-nova-epic", planBytes: plan, specBytes: spec, action: rpAction });
  const rpProof = { schema: "pipeline.po-approval-proof.v1", intentSha256: rpRequest.approvalIntent.sha256, keyReference: "test-key", publicKey, signatureBase64: sign(null, Buffer.from(rpRequest.approvalIntent.sha256), keys.privateKey).toString("base64") };
  const verified = verifyCriticalActionApprovalRequest({ request: rpRequest, trustPolicy, proof: rpProof, expectedCandidate: candidate, expectedAction: rpAction, now: "2026-08-02T18:30:00.000Z" });
  assert.equal(verified.verified, true);
  assert.equal(verifyCriticalActionApprovalRequest({ request: rpRequest, trustPolicy, proof: rpProof, expectedCandidate: candidate, expectedAction: { ...rpAction, kind: "publication" }, now: "2026-08-02T18:30:00.000Z" }).code, "CRITICAL-ACTION-REQUEST-MISMATCH");
});

console.log(`critical-action-approval-request: ${tests} tests passed`);
