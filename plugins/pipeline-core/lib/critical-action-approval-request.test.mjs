// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";

import {
  criticalActionSubjectSha256, createCriticalActionApprovalRequest,
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
check("subject digest changes with target", () => assert.notEqual(subjectSha256, criticalActionSubjectSha256({ kind: "push", candidate, subject: { source: candidate.commit, remote: "origin", destination: "refs/heads/other" } })));

console.log(`critical-action-approval-request: ${tests} tests passed`);
