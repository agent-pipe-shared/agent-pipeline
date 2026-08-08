// SPDX-License-Identifier: SUL-1.0
/**
 * Focused coverage for the push threat-model resolution CB-1a introduced
 * (`resolvePushThreatModelArtifact`, `materialize-push-threat-model`).
 * See evidence/cb-1a-measurement.md for the measurement this responds to.
 *
 * Deliberately narrow: `critical-human-proof-gate.test.mjs` already covers
 * the rest of `approve-push`'s behaviour end to end (a valid signed proof
 * accepted once, replay refused, policy-kind refusal, etc.) and is
 * unaffected by this change other than its own fixture's threat-model path,
 * which is out of this dispatch's edit scope.
 */
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createCriticalActionApprovalRequest, criticalActionSubjectSha256 } from "../lib/critical-action-approval-request.mjs";
import { run } from "./pipeline-state.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const planSha256 = createHash("sha256").update("plan").digest("hex");
const specSha256 = createHash("sha256").update("spec").digest("hex");
const now = "2026-08-08T18:40:00.000Z";

function freshFixture() {
  const root = mktempProjectDir();
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push", "deploy", "publication"] }));
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0", planApproved: true,
    activeFeature: { id: "sprint-nova-epic", planPath: "specs/sprint-nova-epic/prd.md", phase: "implementation" },
    planApproval: { poGateAuthority: { planSha256, specSha256 } },
  }, null, 2));
  const deps = { dir: root, now: () => now, gitHead: () => ({ ok: true, commit: candidate.commit }), gitCandidate: () => ({ ok: true, ...candidate }) };
  return { root, deps };
}

function mktempProjectDir() {
  return mkdtempSync(join(tmpdir(), "cb-1a-fixture-"));
}

function capturedStderr(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => { lines.push(args.join(" ")); };
  try {
    const result = fn();
    return { result, lines };
  } finally {
    console.error = original;
  }
}

function withEnv(name, value, fn) {
  const had = Object.hasOwn(process.env, name);
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return fn();
  } finally {
    if (had) process.env[name] = previous;
    else delete process.env[name];
  }
}

// AC-6: a fixture project that is not this repository and has no sprint
// directory reaches proof verification -- via the materializing command the
// refusal itself names -- without ever hitting CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE.
{
  const { root, deps } = freshFixture();
  assert.equal(existsSync(join(root, "specs")), false, "fixture must have no sprint directory");

  const beforeMaterialize = capturedStderr(() => run(["approve-push", "--by", "PO", "--remote", "origin", "--destination", "refs/heads/main",
    "--proof-request", join(root, "missing-request.json"), "--proof-authority", join(root, "missing-authority.json"), "--proof", join(root, "missing-proof.json")], deps));
  assert.equal(beforeMaterialize.result, 2);
  assert.ok(beforeMaterialize.lines.some((line) => line.includes("CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE")),
    "before materializing, the refusal must name the missing-artifact code");
  assert.ok(beforeMaterialize.lines.some((line) => line.includes("materialize-push-threat-model")),
    "the refusal must name the exact command that creates the artifact (AC-3b)");

  const materialized = run(["materialize-push-threat-model"], deps);
  assert.equal(materialized, 0);
  const materializedPath = join(root, "project", "push-threat-model.md");
  assert.ok(existsSync(materializedPath), "materialize-push-threat-model must create project/push-threat-model.md");

  const afterMaterialize = capturedStderr(() => run(["approve-push", "--by", "PO", "--remote", "origin", "--destination", "refs/heads/main",
    "--proof-request", join(root, "missing-request.json"), "--proof-authority", join(root, "missing-authority.json"), "--proof", join(root, "missing-proof.json")], deps));
  assert.equal(afterMaterialize.result, 2, "still refused -- no valid proof was supplied");
  assert.ok(!afterMaterialize.lines.some((line) => line.includes("CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE")),
    "AC-6: after materializing, the artifact resolves -- the refusal is no longer the artifact-unavailable one");
  assert.ok(afterMaterialize.lines.some((line) => line.includes("CRITICAL-PROOF-EXTERNAL-PATH") || line.includes("proof was not consumed")),
    "the remaining refusal is for the (deliberately invalid) proof, not the artifact");
}

// AC-3c: materialize-push-threat-model refuses to overwrite an existing artifact.
{
  const { root, deps } = freshFixture();
  assert.equal(run(["materialize-push-threat-model"], deps), 0);
  const before = readFileSync(join(root, "project", "push-threat-model.md"), "utf8");
  const second = capturedStderr(() => run(["materialize-push-threat-model"], deps));
  assert.equal(second.result, 2);
  assert.ok(second.lines.some((line) => line.includes("already exists")));
  assert.equal(readFileSync(join(root, "project", "push-threat-model.md"), "utf8"), before, "an existing artifact must be byte-for-byte untouched");
}

// AC-7: a project that configures a path which does not resolve gets a clear
// refusal, never a silent fallback to the conventional default.
{
  const { root, deps } = freshFixture();
  assert.equal(run(["materialize-push-threat-model"], deps), 0, "the default artifact DOES exist in this fixture");
  withEnv("PIPELINE_PUSH_THREAT_MODEL_PATH", "does/not/exist.md", () => {
    const refused = capturedStderr(() => run(["approve-push", "--by", "PO", "--remote", "origin", "--destination", "refs/heads/main",
      "--proof-request", join(root, "missing-request.json"), "--proof-authority", join(root, "missing-authority.json"), "--proof", join(root, "missing-proof.json")], deps));
    assert.equal(refused.result, 2);
    assert.ok(refused.lines.some((line) => line.includes("CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE")),
      "AC-7: the configured path's own refusal, not a silent fallback to the default that DOES exist here");
    assert.ok(!refused.lines.some((line) => line.includes("materialize-push-threat-model")),
      "AC-7: a configured (non-default) path's refusal must not steer the operator at the default-only remedy");
  });
}

// AC-4: this repository keeps binding the document it binds today
// (specs/sprint-nova-epic/implementation/critical-action-authorization-threat-model.md)
// through the configuration route -- proved end to end with a real signed
// approval, not asserted.
{
  const root = mktempProjectDir();
  const external = mktempProjectDir();
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, "specs", "sprint-nova-epic", "implementation"), { recursive: true });
  const documentBytes = "fixture threat model, configured route\n";
  const documentPath = "specs/sprint-nova-epic/implementation/critical-action-authorization-threat-model.md";
  writeFileSync(join(root, documentPath), documentBytes);
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push", "deploy", "publication"] }));
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0", planApproved: true,
    activeFeature: { id: "sprint-nova-epic", planPath: "specs/sprint-nova-epic/prd.md", phase: "implementation" },
    planApproval: { poGateAuthority: { planSha256, specSha256 } },
  }, null, 2));
  const deps = { dir: root, now: () => now, gitHead: () => ({ ok: true, commit: candidate.commit }), gitCandidate: () => ({ ok: true, ...candidate }) };

  const pushTarget = { remote: "origin", destination: "refs/heads/main" };
  const expectedThreatModel = { path: documentPath, sha256: createHash("sha256").update(documentBytes).digest("hex") };
  const subjectSha256 = criticalActionSubjectSha256({ kind: "push", candidate, subject: { sourceCommit: candidate.commit, ...pushTarget, threatModel: expectedThreatModel } });
  const request = createCriticalActionApprovalRequest({ candidate, featureId: "sprint-nova-epic", planBytes: Buffer.from("plan"), specBytes: Buffer.from("spec"), action: { kind: "push", subjectSha256, expiresAt: "2026-08-08T18:50:00.000Z" } });
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  const authority = { keyReference: "test-key", publicKeySha256: createHash("sha256").update(publicKey).digest("hex") };
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256, keyReference: "test-key", publicKey, signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), keys.privateKey).toString("base64") };
  const requestPath = join(external, "request.json");
  const authorityPath = join(external, "authority.json");
  const proofPath = join(external, "proof.json");
  writeFileSync(requestPath, JSON.stringify(request));
  writeFileSync(authorityPath, JSON.stringify(authority));
  writeFileSync(proofPath, JSON.stringify(proof));

  withEnv("PIPELINE_PUSH_THREAT_MODEL_PATH", documentPath, () => {
    const approved = run(["approve-push", "--by", "PO", "--remote", pushTarget.remote, "--destination", pushTarget.destination,
      "--proof-request", requestPath, "--proof-authority", authorityPath, "--proof", proofPath], deps);
    assert.equal(approved, 0, "AC-4: the configuration route reproduces today's exact binding, end to end");
  });
  const state = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
  assert.deepEqual(state.pushApproval.lastApproved.threatModel, expectedThreatModel,
    "AC-4: the recorded threatModel is byte-for-byte the same {path, sha256} boundRepositoryArtifact always produced for this path");
}

console.log("pipeline-state.test.mjs (CB-1a): all checks passed");
