// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LIVE_REQUEST_SCHEMA, parseArgs, runGoldfishAntigravityLiveHost } from "./goldfish-antigravity-live-host.mjs";
import { startSessionDescriptor } from "../lib/worktree-lifecycle.mjs";
import { buildSignatureIntent, consentSubject, digest } from "../lib/agy-session-authority.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";
import { runConsentCommand } from "./agy-session-consent.mjs";

const request = {
  schema: LIVE_REQUEST_SCHEMA,
  root: "/repo",
  resultRoot: "/repo",
  resultPath: "results/out.json",
  packet: { role: "pipeline-core:goldfish-implementor", transport: "antigravity" },
  sessionId: "session-1",
  descriptorSha256: "a".repeat(64),
  consent: null,
  requestedModel: "gemini-3.8-flash-high",
  effort: "high",
  scope: "implementation-scope",
  inputSha256: "a".repeat(64),
  timeoutMs: 1000,
};

test("live wrapper rejects a malformed request without launcher/model calls", async () => {
  const result = await runGoldfishAntigravityLiveHost({ schema: LIVE_REQUEST_SCHEMA }, { agyPath: "/unused" });
  assert.equal(result.code, "AGY-LIVE-REQUEST-SHAPE");
  assert.equal(result.modelCalls, 0);
  assert.equal(result.launcherCalls, 0);
});

test("live wrapper keeps no-consent at zero calls", async () => {
  const result = await runGoldfishAntigravityLiveHost(request, { agyPath: "/unused" });
  assert.equal(result.code, "AGY-SESSION-CONSENT-REQUIRED");
  assert.equal(result.modelCalls, 0);
  assert.equal(result.launcherCalls, 0);
});

test("argument parser is closed", () => {
  assert.deepEqual(parseArgs(["--request", "request.json"]), "request.json");
  assert.throws(() => parseArgs([]), /usage/u);
  assert.throws(() => parseArgs(["--request", "a", "extra"]), /usage/u);
});

test("real temporary session admits two distinct bounded fixture tasks and reuses stored consent", async () => {
  const root = mkdtempSync(join(tmpdir(), "agy-live-e2e-")); writeFileSync(join(root, "input.txt"), "input\n"); execFileSync("git", ["init", "-q"], { cwd: root }); execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root }); execFileSync("git", ["config", "user.name", "E2E"], { cwd: root }); execFileSync("git", ["add", "input.txt"], { cwd: root }); execFileSync("git", ["commit", "-q", "-m", "one"], { cwd: root }); const first = { commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim() };
  writeFileSync(join(root, "second.txt"), "second\n"); execFileSync("git", ["add", "second.txt"], { cwd: root }); execFileSync("git", ["commit", "-q", "-m", "two"], { cwd: root }); const second = { commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim() };
  const started = startSessionDescriptor(root, { sessionId: "live-e2e" }); const session = { id: started.sessionId, descriptorSha256: started.descriptorSha256 }; const expiresAtMs = Date.now() + 60_000; const subject = consentSubject({ repository: { primaryRoot: started.repo.primaryRoot, commonDir: started.repo.commonDir }, session, model: "gemini-3.8-flash-high", roles: ["pipeline-core:goldfish-implementor"], allowedPaths: ["input.txt", "second.txt"], scope: "implementation", fallbackPolicy: "none", expiresAtMs, decisionNonce: "live-decision-nonce" }); const intent = buildSignatureIntent({ featureId: "live-e2e", planSha256: "a".repeat(64), specSha256: "b".repeat(64), candidate: first, subjectSha256: digest(subject) }); const { publicKey, privateKey } = generateKeyPairSync("ed25519"); const publicKeyText = publicKey.export({ type: "spki", format: "pem" }); const record = { schema: "pipeline.agy-session-consent.v1", status: "approved", decisionId: "live-decision-nonce", mode: "signature", session, provider: "google", model: "gemini-3.8-flash-high", roles: subject.roles, allowedPaths: subject.allowedPaths, subject, subjectSha256: digest(subject), intent, proof: { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "live-key", publicKey: publicKeyText, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") }, approvedAtMs: Date.now(), expiresAtMs };
  const recordFile = join(root, "record.json"); writeFileSync(recordFile, JSON.stringify(record)); const policy = { ok: true, trustAnchors: [{ keyReference: "live-key", publicKeySha256: createHash("sha256").update(publicKeyText).digest("hex") }], trustAnchor: null }; await runConsentCommand(["record", "--root", root, "--session-id", started.sessionId, "--descriptor-sha256", started.descriptorSha256, "--record", recordFile], { policy });
  const agy = join(root, "agy-mock"); writeFileSync(agy, "#!/usr/bin/env node\nconsole.log(JSON.stringify({model:'gemini-3.8-flash-high',result:'ok'}));\n"); chmodSync(agy, 0o755); mkdirSync(join(root, "results")); const packet = (candidate, dispatchId, path) => ({ schema: "pipeline.role-dispatch-request.v1", dispatchId, transport: "antigravity", role: "pipeline-core:goldfish-implementor", prompt: "## Briefing\n### 1. Goal\nImplement bounded task.\n### 2. Context files\n- input.txt\n### 3. DoD checks\n- bounded\n### 4. Forbidden\n- unrelated\n### 5. Stop conditions\n- missing\n### 6. Dispatch-Metadata\nModel: gemini-3.8-flash-high; effort high; Ruleset-SHA: local-test.\n- **Tool budget (hard cap, first-class field):** <=40 tool uses.", candidate, requiredPaths: [path], requiredPathSha256: { [path]: createHash("sha256").update(readFileSync(join(root, path))).digest("hex") }, resultDestination: { kind: "return" } });
  const base = { schema: LIVE_REQUEST_SCHEMA, root, resultRoot: root, sessionId: started.sessionId, descriptorSha256: started.descriptorSha256, consent: "stored", requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "implementation", timeoutMs: 10_000, inputSha256: createHash("sha256").update("implementation").digest("hex") }; const one = await runGoldfishAntigravityLiveHost({ ...base, resultPath: "results/one.json", packet: packet(first, "one", "input.txt") }, { agyPath: agy, policy, nowEpochMs: Date.now() }); assert.equal(one.status, "succeeded", JSON.stringify(one)); const two = await runGoldfishAntigravityLiveHost({ ...base, resultPath: "results/two.json", packet: packet(second, "two", "second.txt") }, { agyPath: agy, policy, nowEpochMs: Date.now() }); assert.equal(two.status, "succeeded", JSON.stringify(two)); assert.equal(one.consent.subjectSha256, record.subjectSha256); assert.equal(two.consent.subjectSha256, record.subjectSha256);
});
