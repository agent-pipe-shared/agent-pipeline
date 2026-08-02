import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAuthorityRevisionIntent, verifyAuthorityRevisionProof, AUTHORITY_REVISION_PROOF_SCHEMA } from "./authority-revision-proof.mjs";
import { run as approval } from "../scripts/phoenix-authority-approval.mjs";

const hash = "a".repeat(64);
const request = { featureId: "sprint-phoenix-epic", oldAuthority: { prd: { path: "specs/sprint-phoenix-epic/prd_phoenix-epic.md", sha256: hash }, spec: { path: "specs/sprint-phoenix-epic/spec.md", sha256: hash } }, nextAuthority: { prd: { path: "specs/sprint-phoenix-epic/prd_phoenix-epic.md", sha256: hash }, spec: { path: "specs/sprint-phoenix-epic/spec-revision-20260802.md", sha256: hash } }, decision: { id: "phoenix-section-seven", sha256: hash, scope: { featureId: "sprint-phoenix-epic", phase: "design" } }, candidate: { commit: "b".repeat(40), tree: "c".repeat(40) }, evidence: { sha256: hash }, expiresAt: "2026-12-31T00:00:00.000Z" };
test("proof binds the complete authority revision intent", () => { const intent = createAuthorityRevisionIntent(request); const { privateKey, publicKey } = generateKeyPairSync("ed25519"); const pem = publicKey.export({ type: "spki", format: "pem" }); const trustPolicy = { keyReference: "fixture", publicKeySha256: createHash("sha256").update(pem).digest("hex") }; const proof = { schema: AUTHORITY_REVISION_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "fixture", publicKey: pem, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") }; assert.equal(verifyAuthorityRevisionProof({ intent, trustPolicy, proof }).verified, true); assert.equal(verifyAuthorityRevisionProof({ intent, trustPolicy, proof: { ...proof, intentSha256: hash } }).verified, false); });

test("external proof becomes the authority revision approval shape", () => {
  const directory = mkdtempSync(join(tmpdir(), "phoenix-authority-proof-"));
  try {
    const intent = createAuthorityRevisionIntent(request); const { privateKey, publicKey } = generateKeyPairSync("ed25519"); const pem = publicKey.export({ type: "spki", format: "pem" });
    writeFileSync(join(directory, "phoenix-authority-revision-request.json"), JSON.stringify({ schema: "pipeline.continuity-authority-revision-request.v1", intent }));
    writeFileSync(join(directory, "trust-policy.json"), JSON.stringify({ keyReference: "fixture", publicKeySha256: createHash("sha256").update(pem).digest("hex") }));
    writeFileSync(join(directory, "phoenix-authority-revision-proof.json"), JSON.stringify({ schema: AUTHORITY_REVISION_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "fixture", publicKey: pem, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") }));
    const result = approval(["verify", "--repo-root", "/repo", "--directory", directory, "--proposal", "proposal.json"]);
    assert.equal(result.code, "PHOENIX-AUTHORITY-PROOF-VERIFIED"); assert.equal(result.approval.phase, "design"); assert.deepEqual(result.approval.oldAuthority, request.oldAuthority);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
