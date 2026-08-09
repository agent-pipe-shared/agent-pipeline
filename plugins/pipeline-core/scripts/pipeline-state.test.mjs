// SPDX-License-Identifier: SUL-1.0
/**
 * Focused coverage for the push threat-model resolution CB-1a introduced
 * (`resolvePushThreatModelArtifact`, `materialize-push-threat-model`).
 * See evidence/cb-1a-measurement.md for the measurement this responds to.
 *
 * There is exactly ONE resolution path -- `project/push-threat-model.md` --
 * deliberately not configurable (see the comment above
 * `PUSH_THREAT_MODEL_DEFAULT_PATH` in `pipeline-state.mjs`), so there is no
 * "configured path" scenario left to cover here.
 *
 * Deliberately narrow otherwise: `critical-human-proof-gate.test.mjs`
 * already covers the rest of `approve-push`'s behaviour end to end (replay
 * refused, policy-kind refusal, etc.).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createCriticalActionApprovalRequest, criticalActionSubjectSha256 } from "../lib/critical-action-approval-request.mjs";
import { run } from "./pipeline-state.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const planSha256 = createHash("sha256").update("plan").digest("hex");
const specSha256 = createHash("sha256").update("spec").digest("hex");
const now = "2026-08-08T18:40:00.000Z";

function mktempProjectDir() {
  return mkdtempSync(join(tmpdir(), "cb-1a-fixture-"));
}

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

function approvePushAttempt(root, deps, pushTarget = { remote: "origin", destination: "refs/heads/main" }) {
  return capturedStderr(() => run(["approve-push", "--by", "PO", "--remote", pushTarget.remote, "--destination", pushTarget.destination,
    "--proof-request", join(root, "missing-request.json"), "--proof-authority", join(root, "missing-authority.json"), "--proof", join(root, "missing-proof.json")], deps));
}

// AC-1/AC-2/AC-6: a fixture project that is not this repository and has no
// sprint directory, and has never had any environment variable naming a
// path, still ends up with a resolvable artifact -- via the materializing
// command the refusal itself names -- and then completes a REAL signed
// approval end to end, binding the exact bytes materialize-push-threat-model
// wrote.
{
  const { root, deps } = freshFixture();
  assert.equal(existsSync(join(root, "specs")), false, "fixture must have no sprint directory");
  assert.equal(process.env.PIPELINE_PUSH_THREAT_MODEL_PATH, undefined, "no environment variable governs this route (Correction 1)");

  const beforeMaterialize = approvePushAttempt(root, deps);
  assert.equal(beforeMaterialize.result, 2);
  assert.ok(beforeMaterialize.lines.some((line) => line.includes("CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE")),
    "before materializing, the refusal must name the missing-artifact code");
  assert.ok(beforeMaterialize.lines.some((line) => line.includes("materialize-push-threat-model")),
    "AC-3b: the refusal must name the exact command that creates the artifact");

  assert.equal(run(["materialize-push-threat-model"], deps), 0);
  const materializedPath = join(root, "project", "push-threat-model.md");
  assert.ok(existsSync(materializedPath), "materialize-push-threat-model must create project/push-threat-model.md");
  const materializedBytes = readFileSync(materializedPath);

  const afterMaterialize = approvePushAttempt(root, deps);
  assert.ok(!afterMaterialize.lines.some((line) => line.includes("CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE")),
    "AC-6: after materializing, the artifact resolves -- the refusal is no longer the artifact-unavailable one");

  // End-to-end: a real signed approval, over the artifact exactly as materialized.
  const external = mktempProjectDir();
  const pushTarget = { remote: "origin", destination: "refs/heads/main" };
  const expectedThreatModel = { path: "project/push-threat-model.md", sha256: createHash("sha256").update(materializedBytes).digest("hex") };
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

  const approved = run(["approve-push", "--by", "PO", "--remote", pushTarget.remote, "--destination", pushTarget.destination,
    "--proof-request", requestPath, "--proof-authority", authorityPath, "--proof", proofPath], deps);
  assert.equal(approved, 0, "AC-1/AC-6: the materialized artifact is fully bindable end to end, no sprint directory involved");
  const state = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
  assert.deepEqual(state.pushApproval.lastApproved.threatModel, expectedThreatModel);
}

// PUSHORDER-1. `gates.push_approval: chat` (ADR-0056) is the route for a human
// without key management, and until 2026-08-09 no consumer project could take it:
// `verifyCriticalHumanProof` consulted the policy file's `requiredKinds` BEFORE the
// operator's stand-down, so a project with no `project/critical-human-proof.json`
// -- which is every fresh consumer, the file being gate-strength protected with no
// materializer -- was refused with CRITICAL-PROOF-POLICY-KIND-REQUIRED. The refusal
// demanded the project declare push as proof-requiring in exactly the configuration
// where its operator had committed the opposite. Found by measuring the push gate's
// satisfying path end to end; nothing covered this code at all.
{
  const root = mktempProjectDir();
  const gitAt = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  gitAt("init", "-q", "-b", "main");
  gitAt("config", "user.email", "po@example.invalid");
  gitAt("config", "user.name", "PO");
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0", planApproved: true,
    activeFeature: { id: "sprint-nova-epic", planPath: "specs/sprint-nova-epic/prd.md", phase: "implementation" },
    planApproval: { poGateAuthority: { planSha256, specSha256 } },
  }, null, 2));
  // Deliberately NO project/critical-human-proof.json: the fresh-consumer shape.
  assert.equal(existsSync(join(root, "project", "critical-human-proof.json")), false);
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\ngates:\n  push_approval: chat\n");
  const deps = { dir: root, now: () => now, gitHead: () => ({ ok: true, commit: candidate.commit }), gitCandidate: () => ({ ok: true, ...candidate }) };
  assert.equal(run(["materialize-push-threat-model"], deps), 0);
  gitAt("add", "-A");
  gitAt("commit", "-q", "-m", "chat approval mode");

  const chatApproval = capturedStderr(() => run(["approve-push", "--by", "PO", "--remote", "origin", "--destination", "refs/heads/main"], deps));
  assert.equal(chatApproval.result, 0, `chat mode must be reachable without a policy file: ${chatApproval.lines.join(" ")}`);
  const recorded = JSON.parse(readFileSync(join(root, "project", "pipeline-state.json"), "utf8"));
  // The record has to say on its face that no proof backed it -- guard-push refuses
  // an approval recorded under a different policy than the one now in force.
  assert.equal(recorded.pushApproval.lastApproved.criticalProofWaiver.kind, "push");
  assert.equal(recorded.pushApproval.lastApproved.criticalProofWaiver.mode, "chat");

  // The other half of the ordering: with the stand-down absent, `signature` is the
  // default and the six-flag ceremony is still demanded. Moving the waiver check
  // ahead of `requiredKinds` must not have turned "no policy" into "no gate".
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\ngates:\n  push_approval: signature\n");
  gitAt("add", "-A");
  gitAt("commit", "-q", "-m", "signature approval mode");
  const signatureApproval = approvePushAttempt(root, deps);
  assert.equal(signatureApproval.result, 2, "signature mode must still refuse an unproven approval");
  assert.ok(signatureApproval.lines.some((line) => line.includes("CRITICAL-PROOF-POLICY-KIND-REQUIRED")),
    `the requiredKinds gate must survive for every non-waived kind: ${signatureApproval.lines.join(" ")}`);
}

// PUSHDIR-1. Both of these refusals used to name a `--dir` flag. There is no such
// flag anywhere in this script -- the project directory comes from
// CLAUDE_PROJECT_DIR or the cwd -- and `parseExactFlags` is closed, so a consumer
// who obeyed the message got the same refusal back for obeying it. Same class as
// the `--help` refusals both 2026-08-09 greenfield runs hit.
{
  const { root, deps } = freshFixture();
  const withPhantomFlag = capturedStderr(() => run(["materialize-push-threat-model", "--dir", root], deps));
  assert.equal(withPhantomFlag.result, 2);
  assert.ok(withPhantomFlag.lines.every((line) => !line.includes("--dir")),
    `a refusal must not name a flag this command rejects: ${withPhantomFlag.lines.join(" ")}`);
  const missingArtifact = approvePushAttempt(root, deps);
  assert.ok(missingArtifact.lines.every((line) => !line.includes("--dir")),
    `the artifact-unavailable refusal must not name a nonexistent flag: ${missingArtifact.lines.join(" ")}`);
  // And the signature-mode refusal has to name the alternative, or `signature`
  // reads as the only route -- which is how a session ends up in the source. This
  // is the FLAG-SET refusal, so it is reached by omitting the proof flags, which
  // is exactly what the 2026-08-09 Claude session did before it pushed anyway.
  const sixFlags = capturedStderr(() => run(["approve-push", "--by", "PO", "--remote", "origin", "--destination", "refs/heads/main"], deps));
  assert.equal(sixFlags.result, 2);
  assert.ok(sixFlags.lines.some((line) => line.includes("gates.push_approval: chat")),
    `the signature-mode refusal must name the chat alternative: ${sixFlags.lines.join(" ")}`);
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

// A non-UNAVAILABLE refusal (an unsafe file already at the conventional path)
// is reported plainly and does NOT steer the operator at
// materialize-push-threat-model, which would only refuse again there.
{
  const { root, deps } = freshFixture();
  const target = join(root, "project", "push-threat-model.md");
  const linkTarget = join(root, "project", "push-threat-model-real.md");
  writeFileSync(linkTarget, "not the real artifact\n");
  symlinkSync(linkTarget, target);
  const refused = approvePushAttempt(root, deps);
  assert.equal(refused.result, 2);
  assert.ok(refused.lines.some((line) => line.includes("CRITICAL-PROOF-BOUND-ARTIFACT-UNSAFE")));
  assert.ok(!refused.lines.some((line) => line.includes("materialize-push-threat-model")),
    "a symlink at the conventional path is not the missing-artifact case");
}

console.log("pipeline-state.test.mjs (CB-1a): all checks passed");
