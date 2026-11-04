// SPDX-License-Identifier: SUL-1.0
/**
 * Q3 / AC-108: every human approval a gate consumed must be provable back to the human. These cases build a
 * REAL git repository, a REAL Ed25519 key pair and the exact record chain `approve-push` writes (subject ->
 * action -> intent -> detached proof -> private store entry plus consumption marker), then ask the read-only
 * trace for its verdict. Nothing is stubbed except the machine plane's home directory.
 */
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { criticalActionSha256, criticalActionSubjectSha256 } from "./critical-action-approval-request.mjs";
import { writeCriticalApproval } from "./critical-action-authorization.mjs";
import { createPoApprovalIntent } from "./po-approval-proof.mjs";
import { HUMAN_APPROVAL_TRACE_SCHEMA, traceHumanApprovals } from "./human-approval-trace.mjs";

const roots = [];
const NOW = "2026-11-04T10:00:00.000Z";
const EXPIRES = "2026-11-05T10:00:00.000Z";
const PLAN_SHA = "c".repeat(64);
const SPEC_SHA = "d".repeat(64);
const THREAT_PATH = "specs/demo/threat-model.md";
const THREAT_BODY = "# threat model\n";
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value !== null && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { publicPem, privateKey, publicKeySha256: createHash("sha256").update(publicPem).digest("hex") };
}

/** A git repository whose committed policy registers `anchors`, plus the threat-model file the push subject binds. */
function repository({ anchors }) {
  const root = mkdtempSync(join(tmpdir(), "approval-trace-")); roots.push(root);
  git(root, "init", "-q"); git(root, "config", "user.email", "t@example.invalid"); git(root, "config", "user.name", "t");
  mkdirSync(join(root, "project"), { recursive: true }); mkdirSync(join(root, "specs", "demo"), { recursive: true });
  writeFileSync(join(root, THREAT_PATH), THREAT_BODY);
  writeFileSync(join(root, "project", "critical-human-proof.json"), `${JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: anchors }, null, 2)}\n`);
  git(root, "add", "-A"); git(root, "commit", "-q", "-m", "fixture");
  const candidate = { commit: git(root, "rev-parse", "HEAD"), tree: git(root, "rev-parse", "HEAD^{tree}") };
  return { root, candidate, common: join(root, ".git") };
}

/** The chain approve-push writes. `signedFor` lets a case sign an intent for another candidate than the one recorded. */
function pushApproval({ key, candidate, signedFor = candidate, keyReference = "po-key-1" }) {
  const threatModel = { path: THREAT_PATH, sha256: createHash("sha256").update(THREAT_BODY).digest("hex") };
  const action = { kind: "push", subjectSha256: criticalActionSubjectSha256({ kind: "push", candidate, subject: { sourceCommit: candidate.commit, remote: "origin", destination: "refs/heads/main", threatModel } }), expiresAt: EXPIRES };
  const intent = createPoApprovalIntent({ kind: "critical-action", featureId: "demo-feature", planSha256: PLAN_SHA, specSha256: SPEC_SHA, candidate: signedFor, policyRevision: "critical-human-proof-v1", subjectSha256: criticalActionSha256(action), decision: "approved" });
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: intent.sha256, keyReference, publicKey: key.publicPem, signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), key.privateKey).toString("base64") };
  return { approvedBy: "Human", approvedAt: NOW, forCommit: candidate.commit, remote: "origin", destination: "refs/heads/main", threatModel,
    criticalProof: { proofSha256: createHash("sha256").update(canonical(proof)).digest("hex"), intentSha256: intent.sha256, action, proof } };
}
const stateFor = () => ({ activeFeature: { id: "demo-feature" }, planApproval: { poGateAuthority: { planSha256: PLAN_SHA, specSha256: SPEC_SHA } } });
const trace = (repo, extra = {}) => traceHumanApprovals({ repositoryRoot: repo.root, candidate: repo.candidate, state: stateFor(), ...extra });
const row = (result, kind = "push") => result.rows.find((entry) => entry.kind === kind);

test("a complete push chain is traced from the record to the registered human key", () => {
  const key = keypair(); const repo = repository({ anchors: [{ keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 }] });
  assert.equal(writeCriticalApproval({ gitCommonDir: repo.common, kind: "push", approval: pushApproval({ key, candidate: repo.candidate }) }).ok, true);
  const result = trace(repo);
  assert.equal(result.schema, HUMAN_APPROVAL_TRACE_SCHEMA);
  assert.equal(result.status, "traced"); assert.equal(row(result).verdict, "traced"); assert.equal(row(result).break, null);
  assert.equal(row(result).publicKeySha256, key.publicKeySha256);
});

test("a push approval that carries neither a proof nor an attribution is untraceable and names the break", () => {
  const key = keypair(); const repo = repository({ anchors: [{ keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 }] });
  const approval = { ...pushApproval({ key, candidate: repo.candidate }), criticalProof: null };
  writeCriticalApproval({ gitCommonDir: repo.common, kind: "push", approval });
  const result = trace(repo);
  assert.equal(result.status, "untraceable"); assert.equal(row(result).verdict, "untraceable"); assert.equal(row(result).break, "PROOF-MISSING");
});

test("a proof signed for another candidate does not trace to this candidate", () => {
  const key = keypair(); const repo = repository({ anchors: [{ keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 }] });
  writeCriticalApproval({ gitCommonDir: repo.common, kind: "push", approval: pushApproval({ key, candidate: repo.candidate, signedFor: { commit: "e".repeat(40), tree: "f".repeat(40) } }) });
  const result = trace(repo);
  assert.equal(result.status, "untraceable"); assert.equal(row(result).break, "INTENT-MISMATCH");
});

test("a key that is not in the registered set is untraceable", () => {
  const registered = keypair(); const stranger = keypair(); const repo = repository({ anchors: [{ keyReference: "po-key-1", publicKeySha256: registered.publicKeySha256 }] });
  writeCriticalApproval({ gitCommonDir: repo.common, kind: "push", approval: pushApproval({ key: stranger, candidate: repo.candidate }) });
  const result = trace(repo);
  assert.equal(result.status, "untraceable"); assert.equal(row(result).break, "TRUST-MISMATCH");
});

test("an open (empty) anchor set only traces a key that is this machine's registered operator key", () => {
  const key = keypair(); const repo = repository({ anchors: [] });
  writeCriticalApproval({ gitCommonDir: repo.common, kind: "push", approval: pushApproval({ key, candidate: repo.candidate }) });
  const home = mkdtempSync(join(tmpdir(), "machine-home-")); roots.push(home); const keyDirectory = mkdtempSync(join(tmpdir(), "po-key-dir-")); roots.push(keyDirectory);
  const unregistered = trace(repo, { machinePlaneDeps: { homedirFn: () => home } });
  assert.equal(row(unregistered).break, "KEY-NOT-REGISTERED");
  writeFileSync(join(keyDirectory, "trust-policy.json"), JSON.stringify({ keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 }));
  mkdirSync(join(home, ".agent-pipeline"), { recursive: true });
  writeFileSync(join(home, ".agent-pipeline", "machine.json"), JSON.stringify({ schema: "pipeline.machine-plane.v1", poKeyDirectory: keyDirectory, pushApprovalDefault: "signature", routing: null, language: null, session: null, usage: null, updatedAt: NOW }));
  assert.equal(trace(repo, { machinePlaneDeps: { homedirFn: () => home } }).status, "traced");
});

test("a proof that was consumed twice is a replay", () => {
  const key = keypair(); const repo = repository({ anchors: [{ keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 }] });
  const approval = pushApproval({ key, candidate: repo.candidate });
  writeCriticalApproval({ gitCommonDir: repo.common, kind: "push", approval });
  const directory = join(repo.common, "agent-pipeline", "critical-approvals", "approvals", "push");
  const [first] = readdirSync(directory);
  writeFileSync(join(directory, "9999999999999999-copy.json"), readFileSync(join(directory, first)));
  const result = trace(repo);
  assert.equal(result.status, "untraceable"); assert.ok(result.rows.some((entry) => entry.break === "REPLAYED"));
});

test("an approval whose proof was never consumed is untraceable", () => {
  const key = keypair(); const repo = repository({ anchors: [{ keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 }] });
  writeCriticalApproval({ gitCommonDir: repo.common, kind: "push", approval: pushApproval({ key, candidate: repo.candidate }) });
  rmSync(join(repo.common, "agent-pipeline", "critical-approvals", "consumed"), { recursive: true });
  assert.equal(row(trace(repo)).break, "NOT-CONSUMED");
});

test("a chat-mode approval is labelled attribution-only and never as proof", () => {
  const key = keypair(); const repo = repository({ anchors: [] });
  const approval = { ...pushApproval({ key, candidate: repo.candidate }), criticalProof: null, criticalProofWaiver: { kind: "push", mode: "chat-attributed-unattested", source: "pipeline.user.yaml" }, humanApproval: { kind: "push", mode: "chat-attributed-unattested" } };
  writeCriticalApproval({ gitCommonDir: repo.common, kind: "push", approval });
  const result = trace(repo);
  assert.equal(result.status, "attribution-only"); assert.equal(row(result).verdict, "attribution-only"); assert.equal(row(result).proofSha256, null);
});

test("a candidate with no approval record at all is untraceable, not silently clean", () => {
  const repo = repository({ anchors: [] });
  const result = trace(repo);
  assert.equal(result.status, "untraceable"); assert.equal(result.rows[0].break, "NO-APPROVAL-RECORD");
});

test("the trace only reads: the private store is byte-identical afterwards", () => {
  const key = keypair(); const repo = repository({ anchors: [{ keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 }] });
  writeCriticalApproval({ gitCommonDir: repo.common, kind: "push", approval: pushApproval({ key, candidate: repo.candidate }) });
  const listing = () => git(repo.root, "status", "--porcelain", "--ignored") + readdirSync(join(repo.common, "agent-pipeline", "critical-approvals", "consumed")).join();
  const before = listing(); trace(repo); assert.equal(listing(), before);
});
