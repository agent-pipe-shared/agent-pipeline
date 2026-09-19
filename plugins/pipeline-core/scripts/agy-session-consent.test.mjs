// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runConsentCommand } from "./agy-session-consent.mjs";
import { startSessionDescriptor } from "../lib/worktree-lifecycle.mjs";
import { buildSignatureIntent, consentSubject, digest } from "../lib/agy-session-authority.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";

test("consent CLI requires an explicit command, repository and session", async () => {
  await assert.rejects(() => runConsentCommand([]), /Usage/u);
  await assert.rejects(() => runConsentCommand(["inspect", "--root", "/does/not/exist", "--session-id", "s"]), /ENOENT|WT-REPOSITORY/u);
});

test("real temporary Git session records, inspects, and revokes a verified signature", async () => {
  const root = mkdtempSync(join(tmpdir(), "agy-consent-e2e-")); writeFileSync(join(root, "input.txt"), "input\n"); execFileSync("git", ["init", "-q"], { cwd: root }); execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root }); execFileSync("git", ["config", "user.name", "E2E"], { cwd: root }); execFileSync("git", ["add", "input.txt"], { cwd: root }); execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: root });
  const started = startSessionDescriptor(root, { sessionId: "e2e-session" }); const session = { id: started.sessionId, descriptorSha256: started.descriptorSha256 }; const expiry = Date.now() + 60_000; const subject = consentSubject({ repository: { primaryRoot: started.repo.primaryRoot, commonDir: started.repo.commonDir }, session, model: "gemini-3.8-flash-high", roles: ["pipeline-core:goldfish-implementor"], allowedPaths: ["input.txt"], scope: "implementation", fallbackPolicy: "none", expiresAtMs: expiry });
  const intent = buildSignatureIntent({ featureId: "e2e", planSha256: "a".repeat(64), specSha256: "b".repeat(64), candidate: { commit: "c".repeat(40), tree: "d".repeat(40) }, subjectSha256: digest(subject) }); const { publicKey, privateKey } = generateKeyPairSync("ed25519"); const publicKeyText = publicKey.export({ type: "spki", format: "pem" }); const proof = { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "e2e-key", publicKey: publicKeyText, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") }; const record = { schema: "pipeline.agy-session-consent.v1", status: "approved", decisionId: "e2e-decision", mode: "signature", session, provider: "google", model: "gemini-3.8-flash-high", roles: subject.roles, allowedPaths: subject.allowedPaths, subject, subjectSha256: digest(subject), intent, proof, approvedAtMs: Date.now(), expiresAtMs: expiry };
  const external = join(root, "record.json"); writeFileSync(external, JSON.stringify(record)); const policy = { ok: true, trustAnchors: [{ keyReference: "e2e-key", publicKeySha256: createHash("sha256").update(publicKeyText).digest("hex") }], trustAnchor: null }; const recorded = await runConsentCommand(["record", "--root", root, "--session-id", started.sessionId, "--descriptor-sha256", started.descriptorSha256, "--record", external], { policy }); assert.equal(recorded.status, "recorded"); assert.equal((await runConsentCommand(["inspect", "--root", root, "--session-id", started.sessionId])).status, "approved"); assert.equal((await runConsentCommand(["revoke", "--root", root, "--session-id", started.sessionId])).status, "revoked"); assert.equal((await runConsentCommand(["inspect", "--root", root, "--session-id", started.sessionId])).status, "missing"); await assert.rejects(() => runConsentCommand(["record", "--root", root, "--session-id", started.sessionId, "--descriptor-sha256", started.descriptorSha256, "--record", external], { policy }), /AGY-CONSENT-REAUTH-REQUIRED/u);
});
