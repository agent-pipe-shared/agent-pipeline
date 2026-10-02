// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runConsentCommand } from "./agy-session-consent.mjs";
import { startSessionDescriptor } from "../lib/worktree-lifecycle.mjs";
import { buildSignatureIntent, consentSubject, digest } from "../lib/agy-session-authority.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";
import { verifyModelFamilyAuthority } from "../lib/model-family-authority.mjs";
import { familyConsentAssignment, loadStoredConsent } from "../lib/agy-session-authority.mjs";

test("v2 CLI prepares family policy and stores/revokes independently signed reusable consent", async () => {
  const root = mkdtempSync(join(tmpdir(), "agy-family-consent-cli-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    const started = startSessionDescriptor(root, { sessionId: "v2-cli-session" }), session = { id: started.sessionId, descriptorSha256: started.descriptorSha256 };
    const { publicKey, privateKey } = generateKeyPairSync("ed25519"), pem = publicKey.export({ type: "spki", format: "pem" });
    const trustAnchors = [{ keyReference: "synthetic-v2-cli", publicKeySha256: createHash("sha256").update(pem).digest("hex") }];
    const signed = intent => ({ schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: trustAnchors[0].keyReference, publicKey: pem, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") });
    const candidate = { commit: "c".repeat(40), tree: "d".repeat(40) }, selector = { kind: "model-id", value: "synthetic-gemini" };
    const routeSource = { ok: true, taskRoutes: [{ taskRoute: "duty.implement", runner: "antigravity", role: "worker", effort: "high", state: "default", selector }], configuredRoutes: [{ runner: "antigravity", role: "worker", effort: "high", selector }] };
    const familySubject = { revision: "model-family-v2", predecessorAuthoritySha256: null, routeSourceSha256: digest({ taskRoutes: routeSource.taskRoutes, configuredRoutes: routeSource.configuredRoutes }), assignments: [{ runner: "antigravity", role: "worker", effort: "high", taskRoutes: ["duty.implement"], familyId: "gemini", adapterContractSha256: "a".repeat(64), minimumVersion: [1], update: "latest" }], migration: null };
    const value = { schema: "pipeline.po-approval-intent.v1", kind: "model-role-policy", featureId: "model-role-routes", planSha256: familySubject.routeSourceSha256, specSha256: digest(familySubject), candidate, policyRevision: "model-family-v2", subjectSha256: digest(familySubject), decision: "approved" }, approvalIntent = { value, sha256: digest(value) };
    const familyAuthorityInputs = { bundle: { schema: "pipeline.model-family-approved-policy.v2", candidateAtApproval: candidate, subject: familySubject, approvalIntent, proof: signed(approvalIntent) }, routeSource, trustAnchors };
    const verified = verifyModelFamilyAuthority(familyAuthorityInputs); assert.equal(verified.ok, true);
    const now = Date.now(), subject = { schema: "pipeline.agy-session-consent-subject.v2", repository: { primaryRoot: started.repo.primaryRoot, commonDir: started.repo.commonDir }, session, runner: "antigravity", provider: "google", familyAuthoritySha256: verified.value.authoritySha256, assignments: verified.value.assignments.map(familyConsentAssignment), roles: ["pipeline-core:goldfish-implementor"], allowedPaths: ["src/x.mjs"], scope: "implementation", fallbackPolicy: "none", expiresAtMs: now + 60000, decisionNonce: "synthetic-v2-cli-decision" };
    const subjectFile = join(root, "subject.json"), candidateFile = join(root, "candidate.json"), external = join(root, "record.json");
    writeFileSync(subjectFile, JSON.stringify(subject)); writeFileSync(candidateFile, JSON.stringify(candidate));
    const args = ["prepare", "--root", root, "--session-id", session.id, "--subject", subjectFile, "--feature-id", "fixture", "--plan-sha256", "a".repeat(64), "--spec-sha256", "b".repeat(64), "--candidate", candidateFile], deps = { readFamilyAuthority: () => familyAuthorityInputs, policy: { ok: true, trustAnchors } };
    await assert.rejects(() => runConsentCommand(args), /AGY-FAMILY-CONSENT-AUTHORITY/);
    const prepared = await runConsentCommand(args, deps); assert.equal(prepared.intent.value.policyRevision, "agy-session-family-v2"); assert.equal(prepared.subjectSha256, digest(subject));
    const record = { schema: "pipeline.agy-session-consent.v2", status: "approved", decisionId: subject.decisionNonce, mode: "signature", session, runner: "antigravity", provider: "google", familyAuthoritySha256: subject.familyAuthoritySha256, assignments: subject.assignments, roles: subject.roles, allowedPaths: subject.allowedPaths, subject, subjectSha256: prepared.subjectSha256, intent: prepared.intent, proof: signed(prepared.intent), attribution: null, approvedAtMs: now, expiresAtMs: subject.expiresAtMs };
    writeFileSync(external, JSON.stringify(record));
    const recordArgs = ["record", "--root", root, "--session-id", session.id, "--record", external];
    assert.equal((await runConsentCommand(recordArgs, deps)).status, "recorded");
    assert.deepEqual(loadStoredConsent(root, session.id, session.descriptorSha256).record, record);
    await runConsentCommand(["revoke", "--root", root, "--session-id", session.id]);
    await assert.rejects(() => runConsentCommand(recordArgs, deps), /AGY-CONSENT-REAUTH-REQUIRED/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("consent CLI requires an explicit command, repository and session", async () => {
  await assert.rejects(() => runConsentCommand([]), /Usage/u);
  await assert.rejects(() => runConsentCommand(["inspect", "--root", "/does/not/exist", "--session-id", "s"]), /ENOENT|WT-REPOSITORY/u);
});

test("real temporary Git session records, inspects, and revokes a verified signature", async () => {
  const root = mkdtempSync(join(tmpdir(), "agy-consent-e2e-")); writeFileSync(join(root, "input.txt"), "input\n"); execFileSync("git", ["init", "-q"], { cwd: root }); execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root }); execFileSync("git", ["config", "user.name", "E2E"], { cwd: root }); execFileSync("git", ["add", "input.txt"], { cwd: root }); execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: root });
  const started = startSessionDescriptor(root, { sessionId: "e2e-session" }); const session = { id: started.sessionId, descriptorSha256: started.descriptorSha256 }; const expiry = Date.now() + 60_000; const subject = consentSubject({ repository: { primaryRoot: started.repo.primaryRoot, commonDir: started.repo.commonDir }, session, model: "gemini-3.8-flash-high", roles: ["pipeline-core:goldfish-implementor"], allowedPaths: ["input.txt"], scope: "implementation", fallbackPolicy: "none", expiresAtMs: expiry, decisionNonce: "e2e-decision-nonce" });
  const intent = buildSignatureIntent({ featureId: "e2e", planSha256: "a".repeat(64), specSha256: "b".repeat(64), candidate: { commit: "c".repeat(40), tree: "d".repeat(40) }, subjectSha256: digest(subject) }); const { publicKey, privateKey } = generateKeyPairSync("ed25519"); const publicKeyText = publicKey.export({ type: "spki", format: "pem" }); const proof = { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "e2e-key", publicKey: publicKeyText, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") }; const record = { schema: "pipeline.agy-session-consent.v1", status: "approved", decisionId: "e2e-decision-nonce", mode: "signature", session, provider: "google", model: "gemini-3.8-flash-high", roles: subject.roles, allowedPaths: subject.allowedPaths, subject, subjectSha256: digest(subject), intent, proof, approvedAtMs: Date.now(), expiresAtMs: expiry };
  const external = join(root, "record.json"); writeFileSync(external, JSON.stringify(record)); const policy = { ok: true, trustAnchors: [{ keyReference: "e2e-key", publicKeySha256: createHash("sha256").update(publicKeyText).digest("hex") }], trustAnchor: null }; const recorded = await runConsentCommand(["record", "--root", root, "--session-id", started.sessionId, "--descriptor-sha256", started.descriptorSha256, "--record", external], { policy }); assert.equal(recorded.status, "recorded"); assert.equal((await runConsentCommand(["inspect", "--root", root, "--session-id", started.sessionId])).status, "approved"); assert.equal((await runConsentCommand(["revoke", "--root", root, "--session-id", started.sessionId])).status, "revoked"); assert.equal((await runConsentCommand(["inspect", "--root", root, "--session-id", started.sessionId])).status, "missing"); await assert.rejects(() => runConsentCommand(["record", "--root", root, "--session-id", started.sessionId, "--descriptor-sha256", started.descriptorSha256, "--record", external], { policy }), /AGY-CONSENT-REAUTH-REQUIRED/u);
});
