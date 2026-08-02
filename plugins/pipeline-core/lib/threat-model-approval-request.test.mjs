// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createThreatModelApprovalRequest, verifyThreatModelApprovalRequest } from "./threat-model-approval-request.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";
import { approvalRequestFromExternalJson, parseArgs, run as runApprovalRequest } from "../scripts/po-approval-request.mjs";
import { parseHumanArgs, runHumanApproval } from "../scripts/po-human-approval.mjs";

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
assert.equal(approvalRequestFromExternalJson({ ok: true, value: request }), request);
assert.deepEqual(parseHumanArgs(["setup", "--repo-root", "/repo", "--directory", "/human-po"]), { command: "setup", keyReference: "local-po-key", repoRoot: "/repo", directory: "/human-po" });
assert.ok(parseHumanArgs(["approve", "--directory", "relative"]).error);
const external = mkdtempSync(join(tmpdir(), "po-human-approval-")); const nominalRepo = `${external}-repo`;
writeFileSync(join(external, "request.json"), JSON.stringify({ ok: true, value: request })); writeFileSync(join(external, "authority.json"), JSON.stringify(trustPolicy)); writeFileSync(join(external, "proof.json"), JSON.stringify(proof));
assert.equal(runApprovalRequest(["verify", "--repo-root", nominalRepo, "--request", join(external, "request.json"), "--authority", join(external, "authority.json"), "--proof", join(external, "proof.json")], { observeCandidate: () => candidate }).value.verified, true);
assert.throws(() => runApprovalRequest(["verify", "--repo-root", nominalRepo, "--request", join(external, "request.json"), "--authority", join(external, "authority.json"), "--proof", join(external, "proof.json")], { observeCandidate: () => ({ ...candidate, tree: "f".repeat(40) }) }), /current clean candidate/u);
writeFileSync(join(external, "trust-policy.json"), JSON.stringify(trustPolicy)); writeFileSync(join(external, "po-public.pem"), publicKey); writeFileSync(join(external, "proof.json"), JSON.stringify(proof));
assert.equal(runHumanApproval(["verify", "--repo-root", nominalRepo, "--directory", external], { observeCandidate: () => candidate }).value.verified, true);
assert.throws(() => runHumanApproval(["verify", "--repo-root", nominalRepo, "--directory", external], { observeCandidate: () => ({ ...candidate, commit: "f".repeat(40) }) }), /current clean candidate/u);
const keyDirectory = mkdtempSync(join(tmpdir(), "po-human-key-"));
const setup = runHumanApproval(["setup", "--repo-root", nominalRepo, "--directory", keyDirectory], {
  spawn: (_executable, args) => {
    const output = args[args.indexOf("-out") + 1];
    writeFileSync(output, args.includes("-pubout") ? publicKey : "encrypted-private-key-placeholder");
    return { status: 0 };
  },
});
assert.equal(setup.code, "PO-HUMAN-AUTHORITY-READY");
assert.equal(JSON.parse(readFileSync(join(keyDirectory, "trust-policy.json"), "utf8")).publicKeySha256, trustPolicy.publicKeySha256);
assert.throws(() => runHumanApproval(["setup", "--repo-root", nominalRepo, "--directory", `${nominalRepo}/po`]), /outside the repository/u);
writeFileSync(join(external, "po-private.pem"), "encrypted-private-key-placeholder");
assert.equal(runHumanApproval(["approve", "--repo-root", nominalRepo, "--directory", external], { spawn: (_executable, args) => { writeFileSync(args[args.indexOf("-out") + 1], "detached-signature"); return { status: 0 }; } }).code, "PO-HUMAN-PROOF-READY");
assert.equal(JSON.parse(readFileSync(join(external, "proof.json"), "utf8")).intentSha256, request.approvalIntent.sha256);
console.log("20 threat-model approval request checks passed");
