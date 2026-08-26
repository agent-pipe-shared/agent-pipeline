// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAuthorityRevisionIntent, verifyAuthorityRevisionProof, AUTHORITY_REVISION_PROOF_SCHEMA } from "./authority-revision-proof.mjs";
import { run as approval } from "../scripts/phoenix-authority-approval.mjs";

const hash = "a".repeat(64);
const request = { schema: "pipeline.continuity-authority-revision-request.v1", featureId: "sprint-phoenix-epic", expectedRevision: 0, preStateSha256: hash, oldAuthority: { prd: { path: "specs/sprint-phoenix-epic/prd_phoenix-epic.md", sha256: hash }, spec: { path: "specs/sprint-phoenix-epic/spec.md", sha256: hash } }, nextAuthority: { prd: { path: "specs/sprint-phoenix-epic/prd_phoenix-epic.md", sha256: hash }, spec: { path: "specs/sprint-phoenix-epic/spec-revision-20260802.md", sha256: hash } }, decision: { id: "phoenix-section-seven", sha256: hash, scope: { featureId: "sprint-phoenix-epic", phase: "design" } }, candidate: { commit: "b".repeat(40), tree: "c".repeat(40) }, evidence: { sha256: hash }, idempotencyKey: "phoenix-section-seven", expiresAt: "2026-12-31T00:00:00.000Z" };
test("proof binds the complete authority revision intent", () => { const intent = createAuthorityRevisionIntent(request); const { privateKey, publicKey } = generateKeyPairSync("ed25519"); const pem = publicKey.export({ type: "spki", format: "pem" }); const trustPolicy = { keyReference: "fixture", publicKeySha256: createHash("sha256").update(pem).digest("hex") }; const proof = { schema: AUTHORITY_REVISION_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "fixture", publicKey: pem, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") }; assert.equal(verifyAuthorityRevisionProof({ intent, trustPolicy, proof }).verified, true); assert.equal(verifyAuthorityRevisionProof({ intent, trustPolicy, proof: { ...proof, intentSha256: hash } }).verified, false); });

test("external proof becomes the authority revision approval shape", () => {
  const root = mkdtempSync(join(tmpdir(), "phoenix-authority-proof-")); const repo = join(root, "repo"); const directory = join(root, "external");
  try {
    const intent = createAuthorityRevisionIntent(request); const { privateKey, publicKey } = generateKeyPairSync("ed25519"); const pem = publicKey.export({ type: "spki", format: "pem" });
    mkdirSync(repo); writeFileSync(join(repo, "proposal.json"), JSON.stringify(request)); mkdirSync(directory);
    writeFileSync(join(directory, "phoenix-authority-revision-request.json"), JSON.stringify({ schema: "pipeline.continuity-authority-revision-request.v1", intent }));
    writeFileSync(join(directory, "trust-policy.json"), JSON.stringify({ keyReference: "fixture", publicKeySha256: createHash("sha256").update(pem).digest("hex") }));
    writeFileSync(join(directory, "phoenix-authority-revision-proof.json"), JSON.stringify({ schema: AUTHORITY_REVISION_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "fixture", publicKey: pem, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") }));
    const result = approval(["verify", "--repo-root", repo, "--directory", directory, "--proposal", "proposal.json"]);
    assert.equal(result.code, "PHOENIX-AUTHORITY-PROOF-VERIFIED"); assert.equal(result.approval.phase, "design"); assert.deepEqual(result.approval.oldAuthority, request.oldAuthority);
    writeFileSync(join(repo, "proposal.json"), JSON.stringify({ ...request, preStateSha256: "b".repeat(64) }));
    assert.throws(() => approval(["verify", "--repo-root", repo, "--directory", directory, "--proposal", "proposal.json"]), /does not bind/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// PX0-AC-05 negative clause (closes Critic Finding 1, px0-ac0305-06-critic-review-d827c1b3.md):
// decision.id must be constrained the same way its sibling identifiers (featureId,
// idempotencyKey) already are -- it must be IMPOSSIBLE to smuggle a private path, a
// prompt/command fragment, or unbounded length through the one caller-controlled field
// that lands verbatim in the durable, git-tracked receipt.
test("decision.id rejects a plausible private absolute path", () => {
  assert.throws(
    () => createAuthorityRevisionIntent({ ...request, decision: { ...request.decision, id: "/home/someuser/secret-project/notes.txt" } }),
    /authority revision intent is invalid/u,
  );
});

test("decision.id rejects embedded whitespace/newline (a pasted prompt/command fragment)", () => {
  assert.throws(
    () => createAuthorityRevisionIntent({ ...request, decision: { ...request.decision, id: "please run\nrm -rf /home/someuser" } }),
    /authority revision intent is invalid/u,
  );
  assert.throws(
    () => createAuthorityRevisionIntent({ ...request, decision: { ...request.decision, id: "decision with a space" } }),
    /authority revision intent is invalid/u,
  );
});

test("decision.id enforces a bounded length -- accepted at the bound, refused one past it", () => {
  const atBound = "a".repeat(64);
  const intent = createAuthorityRevisionIntent({ ...request, decision: { ...request.decision, id: atBound } });
  assert.equal(intent.value.decision.id, atBound);
  const overBound = "a".repeat(65);
  assert.throws(
    () => createAuthorityRevisionIntent({ ...request, decision: { ...request.decision, id: overBound } }),
    /authority revision intent is invalid/u,
  );
});

test("decision.id still accepts the existing legitimate slug shape unchanged (regression protection)", () => {
  const intent = createAuthorityRevisionIntent(request);
  assert.equal(intent.value.decision.id, "phoenix-section-seven");
});

// SETUP-1 mirror: trust-policy.json shape disagreement fix (backlog
// 2026-08-17-trust-policy-shape-disagreement-...), same latent bug in this
// sister verifier. `setup --human-name` writes a 3-key named shape
// {keyReference, publicKeySha256, humanName}; verifyAuthorityRevisionProof
// must accept it, exactly as it accepts the 2-key legacy shape, without
// loosening the precision of the `own()` check.
test("trustPolicy 3-key shape with humanName verifies", () => {
  const intent = createAuthorityRevisionIntent(request);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" });
  const trustPolicy = { keyReference: "fixture", publicKeySha256: createHash("sha256").update(pem).digest("hex"), humanName: "Nova the PO" };
  const proof = { schema: AUTHORITY_REVISION_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "fixture", publicKey: pem, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") };
  const result = verifyAuthorityRevisionProof({ intent, trustPolicy, proof });
  assert.equal(result.verified, true);
});

test("trustPolicy 2-key legacy shape (no humanName) still verifies (regression)", () => {
  const intent = createAuthorityRevisionIntent(request);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" });
  const trustPolicy = { keyReference: "fixture", publicKeySha256: createHash("sha256").update(pem).digest("hex") };
  const proof = { schema: AUTHORITY_REVISION_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "fixture", publicKey: pem, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") };
  assert.equal(verifyAuthorityRevisionProof({ intent, trustPolicy, proof }).verified, true);
});

test("trustPolicy with a required field missing still fails closed, humanName present or not", () => {
  const intent = createAuthorityRevisionIntent(request);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" });
  const publicKeySha256 = createHash("sha256").update(pem).digest("hex");
  const proof = { schema: AUTHORITY_REVISION_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "fixture", publicKey: pem, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") };
  const missingKeyReference = { publicKeySha256, humanName: "Nova the PO" };
  assert.equal(verifyAuthorityRevisionProof({ intent, trustPolicy: missingKeyReference, proof }).verified, false);
  assert.equal(verifyAuthorityRevisionProof({ intent, trustPolicy: missingKeyReference, proof }).code, "AR-PROOF-INVALID");
  const missingPublicKeySha256 = { keyReference: "fixture", humanName: "Nova the PO" };
  assert.equal(verifyAuthorityRevisionProof({ intent, trustPolicy: missingPublicKeySha256, proof }).verified, false);
  assert.equal(verifyAuthorityRevisionProof({ intent, trustPolicy: missingPublicKeySha256, proof }).code, "AR-PROOF-INVALID");
  const missingBothNoHumanName = { humanName: "Nova the PO" };
  assert.equal(verifyAuthorityRevisionProof({ intent, trustPolicy: missingBothNoHumanName, proof }).verified, false);
  assert.equal(verifyAuthorityRevisionProof({ intent, trustPolicy: missingBothNoHumanName, proof }).code, "AR-PROOF-INVALID");
});

test("trustPolicy precision bar: only humanName specifically is tolerated, a different extra key still fails closed", () => {
  const intent = createAuthorityRevisionIntent(request);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" });
  const trustPolicy = { keyReference: "fixture", publicKeySha256: createHash("sha256").update(pem).digest("hex") };
  const proof = { schema: AUTHORITY_REVISION_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "fixture", publicKey: pem, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") };
  const otherExtraKey = { ...trustPolicy, someOtherField: "x" };
  const otherExtraKeyResult = verifyAuthorityRevisionProof({ intent, trustPolicy: otherExtraKey, proof });
  assert.equal(otherExtraKeyResult.verified, false);
  assert.equal(otherExtraKeyResult.code, "AR-PROOF-INVALID");
});

test("proof's own own() check stays exactly as strict as before: an extra key on proof still fails closed", () => {
  const intent = createAuthorityRevisionIntent(request);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" });
  const trustPolicy = { keyReference: "fixture", publicKeySha256: createHash("sha256").update(pem).digest("hex") };
  const proof = { schema: AUTHORITY_REVISION_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "fixture", publicKey: pem, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") };
  const proofWithExtraKey = { ...proof, someOtherField: "x" };
  const proofWithExtraKeyResult = verifyAuthorityRevisionProof({ intent, trustPolicy, proof: proofWithExtraKey });
  assert.equal(proofWithExtraKeyResult.verified, false);
  assert.equal(proofWithExtraKeyResult.code, "AR-PROOF-INVALID");
});
