// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";

import { createThreatModelApprovalRequest, verifyThreatModelApprovalRequest } from "./threat-model-approval-request.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";
import { parseArgs } from "../scripts/po-approval-request.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const referenceModel = { schema: "pipeline.threat-model.v1", candidate: { commit: "c".repeat(40), tree: "d".repeat(40) }, policyRevision: "policy-v1", classification: "public", entities: [], lifecycle: "approved" };
const request = createThreatModelApprovalRequest({ candidate, featureId: "cyb-4", planBytes: Buffer.from("plan"), specBytes: Buffer.from("spec"), referenceModel });
const pair = generateKeyPairSync("ed25519"); const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const trustPolicy = { keyReference: "outside-agent-boundary", publicKeySha256: createHash("sha256").update(publicKey).digest("hex") };
const proof = { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: request.approvalIntent.sha256, keyReference: trustPolicy.keyReference, publicKey, signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), pair.privateKey).toString("base64") };

assert.deepEqual(request.candidate, candidate);
assert.deepEqual(request.model.candidate, candidate);
assert.notEqual(request.approvalReceipt.modelDigest, createHash("sha256").update(JSON.stringify(referenceModel)).digest("hex"));
assert.equal(verifyThreatModelApprovalRequest({ request, trustPolicy, proof }).verified, true);
assert.equal(verifyThreatModelApprovalRequest({ request: { ...request, candidate: { ...candidate, tree: "e".repeat(40) } }, trustPolicy, proof }).verified, false);
assert.equal(verifyThreatModelApprovalRequest({ request, trustPolicy: { ...trustPolicy, keyReference: "candidate-key" }, proof }).verified, false);
assert.deepEqual(parseArgs(["prepare", "--repo-root", "/external/repo", "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md", "--model", "model.json"]), { command: "prepare", repoRoot: "/external/repo", featureId: "cyb-4", plan: "plan.md", spec: "spec.md", model: "model.json" });
assert.ok(parseArgs(["prepare", "--repo-root", "/one", "--repo-root", "/two"]).error);
console.log("8 threat-model approval request checks passed");
