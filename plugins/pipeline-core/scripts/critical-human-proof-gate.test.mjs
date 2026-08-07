// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createCriticalActionApprovalRequest, criticalActionSubjectSha256 } from "../lib/critical-action-approval-request.mjs";
import { run } from "./pipeline-state.mjs";

const root = mkdtempSync(join(tmpdir(), "critical-proof-gate-"));
const external = mkdtempSync(join(tmpdir(), "critical-proof-external-"));
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const planSha256 = createHash("sha256").update("plan").digest("hex");
const specSha256 = createHash("sha256").update("spec").digest("hex");
const now = "2026-08-02T18:40:00.000Z";
mkdirSync(join(root, "project"), { recursive: true });
mkdirSync(join(root, "specs", "sprint-nova-epic", "implementation"), { recursive: true });
writeFileSync(join(root, "specs", "sprint-nova-epic", "implementation", "critical-action-authorization-threat-model.md"), "fixture threat model\n");
writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push", "deploy", "publication"] }));
writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
  schema: "pipeline.state.v0", planApproved: true,
  activeFeature: { id: "sprint-nova-epic", planPath: "specs/sprint-nova-epic/prd.md", phase: "implementation" },
  planApproval: { poGateAuthority: { planSha256, specSha256 } },
}, null, 2));
const pushTarget = { remote: "origin", destination: "refs/heads/main" };
const threatModel = { path: "specs/sprint-nova-epic/implementation/critical-action-authorization-threat-model.md", sha256: createHash("sha256").update("fixture threat model\n").digest("hex") };
const subjectSha256 = criticalActionSubjectSha256({ kind: "push", candidate, subject: { sourceCommit: candidate.commit, ...pushTarget, threatModel } });
const request = createCriticalActionApprovalRequest({ candidate, featureId: "sprint-nova-epic", planBytes: Buffer.from("plan"), specBytes: Buffer.from("spec"), action: { kind: "push", subjectSha256, expiresAt: "2026-08-02T18:50:00.000Z" } });
const keys = generateKeyPairSync("ed25519");
const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
const authority = { keyReference: "test-key", publicKeySha256: createHash("sha256").update(publicKey).digest("hex") };
const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256, keyReference: "test-key", publicKey, signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), keys.privateKey).toString("base64") };
const requestPath = join(external, "request.json"); const authorityPath = join(external, "authority.json"); const proofPath = join(external, "proof.json");
writeFileSync(requestPath, JSON.stringify(request)); writeFileSync(authorityPath, JSON.stringify(authority)); writeFileSync(proofPath, JSON.stringify(proof));
const deps = { dir: root, now: () => now, gitHead: () => ({ ok: true, commit: candidate.commit }), gitCandidate: () => ({ ok: true, ...candidate }) };

assert.equal(run(["approve-push", "--by", "PO"], deps), 2);
const before = readFileSync(join(root, "project", "pipeline-state.json"), "utf8");
writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["deploy", "publication"] }));
assert.equal(run(["approve-push", "--by", "PO", "--remote", pushTarget.remote, "--destination", pushTarget.destination, "--proof-request", requestPath, "--proof-authority", authorityPath, "--proof", proofPath], deps), 2);
writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push", "deploy", "publication"] }));
assert.equal(run(["approve-push", "--by", "PO", "--remote", pushTarget.remote, "--destination", pushTarget.destination, "--proof-request", requestPath, "--proof-authority", authorityPath, "--proof", proofPath], deps), 0);
const after = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
assert.equal(after.pushApproval.lastApproved.forCommit, candidate.commit);
assert.equal(typeof after.pushApproval.lastApproved.criticalProof?.proofSha256, "string");
assert.equal(after.pushApproval.lastApproved.remote, pushTarget.remote);
assert.deepEqual(after.pushApproval.lastApproved.threatModel, threatModel);
assert.equal(after.criticalProofConsumption?.length, 1);
assert.equal(run(["approve-push", "--by", "PO", "--remote", pushTarget.remote, "--destination", pushTarget.destination, "--proof-request", requestPath, "--proof-authority", authorityPath, "--proof", proofPath], deps), 2);
assert.notEqual(before, JSON.stringify(after));

const deploySubject = { artifact: "v0.5.1-rc.1", environment: "production" };
const deployRequest = createCriticalActionApprovalRequest({
  candidate, featureId: "sprint-nova-epic", planBytes: Buffer.from("plan"), specBytes: Buffer.from("spec"),
  action: {
    kind: "deploy",
    subjectSha256: criticalActionSubjectSha256({ kind: "deploy", candidate, subject: deploySubject }),
    expiresAt: "2026-08-02T18:50:00.000Z",
  },
});
const deployProof = {
  schema: "pipeline.po-approval-proof.v1", intentSha256: deployRequest.approvalIntent.sha256, keyReference: "test-key", publicKey,
  signatureBase64: sign(null, Buffer.from(deployRequest.approvalIntent.sha256), keys.privateKey).toString("base64"),
};
const deployRequestPath = join(external, "deploy-request.json");
const deployProofPath = join(external, "deploy-proof.json");
writeFileSync(deployRequestPath, JSON.stringify(deployRequest)); writeFileSync(deployProofPath, JSON.stringify(deployProof));
assert.equal(run(["approve-deploy", "--env", deploySubject.environment, "--artifact", deploySubject.artifact, "--by", "PO"], deps), 2);
assert.equal(run(["approve-deploy", "--env", deploySubject.environment, "--artifact", deploySubject.artifact, "--by", "PO", "--proof-request", deployRequestPath, "--proof-authority", authorityPath, "--proof", deployProofPath], deps), 0);
const deployed = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
assert.equal(deployed.deployApprovals.at(-1).forArtifact, deploySubject.artifact);
assert.equal(typeof deployed.deployApprovals.at(-1).criticalProof?.proofSha256, "string");

const transactionId = "critical-publication-proof";
const evidence = (name) => ({ path: `evidence/${name}.json`, rawDigest: createHash("sha256").update(name).digest("hex"), commit: candidate.commit, tree: candidate.tree });
const publicationInput = {
  channel: "private", transactionId, repositoryFingerprint: "c".repeat(64), sourceCommit: candidate.commit, sourceTree: candidate.tree,
  remoteFingerprint: "d".repeat(64), remoteName: "origin", destinationRef: "refs/heads/main", remotePreimageOid: "e".repeat(40),
  candidateOid: candidate.commit, candidateTree: candidate.tree,
  ancestry: { baseOid: "e".repeat(40), candidateOid: candidate.commit, descends: true },
  identityProbe: evidence("identity"), verifyEvidence: evidence("verify"), securityEvidence: evidence("security"),
};
const publicationRequest = (expectedRevision, expectedStateSha256, input) => ({
  schema: "pipeline.publication-command.v1", transactionId, expectedRevision, expectedStateSha256, input,
});
const publicationRequestPath = join(root, "publication-request.json");
writeFileSync(publicationRequestPath, JSON.stringify(publicationRequest("absent", null, publicationInput)));
assert.equal(run(["publication-prepare", "--request-file", "publication-request.json"], { ...deps, gitCommonDir: () => ({ ok: true, path: root }) }), 0);
const prepared = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8")).publication.channels.private;
const approvalInput = { approvalId: "po-publication", attribution: "PO", approvedAt: Date.now(), expiresAt: Date.now() + 60_000 };
const publicationSubject = {
  transactionId, channel: prepared.channel, expectedRevision: 0,
  expectedStateSha256: prepared.publicationStateSha256, input: approvalInput,
};
const publicationProofRequest = createCriticalActionApprovalRequest({
  candidate, featureId: "sprint-nova-epic", planBytes: Buffer.from("plan"), specBytes: Buffer.from("spec"),
  action: {
    kind: "publication",
    subjectSha256: criticalActionSubjectSha256({ kind: "publication", candidate, subject: publicationSubject }),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  },
});
const publicationProof = {
  schema: "pipeline.po-approval-proof.v1", intentSha256: publicationProofRequest.approvalIntent.sha256, keyReference: "test-key", publicKey,
  signatureBase64: sign(null, Buffer.from(publicationProofRequest.approvalIntent.sha256), keys.privateKey).toString("base64"),
};
const publicationProofRequestPath = join(external, "publication-request.json");
const publicationProofPath = join(external, "publication-proof.json");
writeFileSync(publicationProofRequestPath, JSON.stringify(publicationProofRequest)); writeFileSync(publicationProofPath, JSON.stringify(publicationProof));
writeFileSync(publicationRequestPath, JSON.stringify(publicationRequest(0, prepared.publicationStateSha256, approvalInput)));
assert.equal(run(["publication-approve", "--request-file", "publication-request.json"], { ...deps, gitCommonDir: () => ({ ok: true, path: root }) }), 2);
assert.equal(run(["publication-approve", "--request-file", "publication-request.json", "--proof-request", publicationProofRequestPath, "--proof-authority", authorityPath, "--proof", publicationProofPath], { ...deps, gitCommonDir: () => ({ ok: true, path: root }) }), 0);
const published = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
assert.equal(typeof published.publicationCriticalProofs[transactionId]?.proofSha256, "string");
console.log("critical-human-proof-gate: 20 assertions passed");
