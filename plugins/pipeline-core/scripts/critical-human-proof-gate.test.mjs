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
writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push", "deploy", "publication"] }));
writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
  schema: "pipeline.state.v0", planApproved: true,
  activeFeature: { id: "sprint-nova-epic", planPath: "specs/sprint-nova-epic/prd.md", phase: "implementation" },
  planApproval: { poGateAuthority: { planSha256, specSha256 } },
}, null, 2));
const subjectSha256 = criticalActionSubjectSha256({ kind: "push", candidate, subject: { sourceCommit: candidate.commit } });
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
assert.equal(run(["approve-push", "--by", "PO", "--proof-request", requestPath, "--proof-authority", authorityPath, "--proof", proofPath], deps), 0);
const after = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
assert.equal(after.pushApproval.lastApproved.forCommit, candidate.commit);
assert.equal(typeof after.pushApproval.lastApproved.criticalProof?.proofSha256, "string");
assert.notEqual(before, JSON.stringify(after));
console.log("critical-human-proof-gate: 5 assertions passed");
