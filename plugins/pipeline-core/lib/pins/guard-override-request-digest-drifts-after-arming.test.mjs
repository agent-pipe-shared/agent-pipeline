#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// Regression pin ALF-C-P6-07 / AC-193 for backlog item
// pipeline.guard-override-request-digest-drifts-after-arming.
//
// Acceptance points exercised through the REAL human-guard-override module (no mocks):
//   A1  the governed digest covers only semantically effective inputs: a runner-cosmetic Bash
//       `description` never changes it, a changed `command` / non-Bash field always does;
//   A2  arming never changes the digest of the identical retry: seed -> sign -> arm -> retry
//       consumes the capability exactly once, also when volatile repository state (untracked
//       files) existed before seeding, and arming leaves the working tree untouched;
//   A3  the seed/sign/arm/identical-retry sequence runs on this host (native Windows or POSIX:
//       nothing here needs directory mode bits or directory symlinks, so no case is skipped);
//   A4  a genuine mismatch against an ARMED capability is named (HGO-INPUT-MISMATCH with the
//       expected/observed digest and differingInputs), never a bare fresh denial, and it does
//       not burn the capability.
//
// RED proof: the test imports the module under test from PIN_HGO_MODULE when set (a scratch
// mirror with the mutation applied); unset, it imports the production module. The "naive
// digest" control below also proves the A1 discriminator is meaningful without any mirror.

import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA } from "../po-approval-proof.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, "..", "..");
const SCRATCH = join(PLUGIN_ROOT, "..", "..", "scratch");
const moduleUnderTest = process.env.PIN_HGO_MODULE
  ? pathToFileURL(process.env.PIN_HGO_MODULE).href
  : new URL("../human-guard-override.mjs", import.meta.url).href;
const {
  authorizeHumanGuardOverrideBySignature,
  consumeHumanGuardOverride,
  HGO_SIGNATURE_REASON,
  planHumanGuardOverride,
  prepareHumanGuardOverrideAuthorization,
  recordHumanGuardDenial,
} = await import(moduleUnderTest);

const SCRIPT_PATH = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
const DENIALS = [{ guard: "guard-lifecycle-ready.mjs", reason: "GUARD-DEVPLAN-SHELL" }];
const KEY_REFERENCE = "pin-alf-c-p6-07-key";
const pair = generateKeyPairSync("ed25519");
const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" });
const publicKeySha256 = createHash("sha256").update(publicKeyPem).digest("hex");
const sentinel = (label) => createHash("sha256").update(label).digest("hex");

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return String(result.stdout).trim();
}

// Fixture lives under the repository's scratch/ (native Windows host rule), never the OS temp dir.
function fixture() {
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, "alf-c-p6-07-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push"],
    trustAnchor: { keyReference: KEY_REFERENCE, publicKeySha256 },
  }));
  git(root, "add", "README.md", "pipeline.user.yaml", "project/critical-human-proof.json");
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}

// seed (denial) -> plan -> prepare -> sign. Arming is a separate step so tests can observe it.
function seedAndSign(root, toolName, toolInput) {
  const shared = { rootDir: root, pluginRoot: PLUGIN_ROOT, scriptPath: SCRIPT_PATH };
  const recorded = recordHumanGuardDenial({ ...shared, toolName, toolInput, denials: DENIALS, nowMs: 1000 });
  assert.equal(recorded.status, "planned", `denial not plannable: ${JSON.stringify(recorded)}`);
  const plan = planHumanGuardOverride({ ...shared, requestSha256: recorded.requestSha256, nowMs: 1500 });
  const prepared = prepareHumanGuardOverrideAuthorization({
    ...shared, requestSha256: recorded.requestSha256, planSha256: plan.planSha256,
    reason: HGO_SIGNATURE_REASON, nowMs: 2000,
  });
  const intent = createPoApprovalIntent({
    kind: "guard-override",
    featureId: "human-guard-override",
    planSha256: sentinel("pipeline.human-guard-override-signature-plan.v1"),
    specSha256: sentinel("pipeline.human-guard-override-signature-spec.v1"),
    candidate: { commit: plan.repository.head, tree: plan.repository.tree },
    policyRevision: "human-guard-override-signature-v1",
    subjectSha256: prepared.selectionSha256,
    decision: "authorize",
  });
  const proof = {
    schema: PO_APPROVAL_PROOF_SCHEMA,
    intentSha256: intent.sha256,
    keyReference: KEY_REFERENCE,
    publicKey: publicKeyPem,
    signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), pair.privateKey).toString("base64"),
  };
  return { shared, recorded, plan, proof };
}

function arm(root, seeded) {
  return authorizeHumanGuardOverrideBySignature({
    rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: seeded.recorded.requestSha256,
    planSha256: seeded.plan.planSha256, proof: seeded.proof, nowMs: 3000, scriptPath: SCRIPT_PATH,
  });
}

function retry(root, toolName, toolInput, nowMs = 4000) {
  return consumeHumanGuardOverride({ rootDir: root, pluginRoot: PLUGIN_ROOT, toolName, toolInput, denials: DENIALS, nowMs });
}

function withRoot(fn) {
  const root = fixture();
  try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

const COMMAND = "node tool.mjs --goal exact";

test("A2: seed, sign, arm and the identical Bash retry consumes the capability once", () => withRoot((root) => {
  const input = { command: COMMAND, description: "Run the tool" };
  const seeded = seedAndSign(root, "Bash", input);
  const armed = arm(root, seeded);
  assert.equal(armed.status, "armed");
  assert.equal(armed.planSha256, seeded.plan.planSha256);
  const consumed = retry(root, "Bash", { ...input });
  assert.equal(consumed.status, "consumed", JSON.stringify(consumed));
  assert.equal(consumed.planSha256, seeded.plan.planSha256);
  assert.equal(consumed.requestSha256, seeded.recorded.requestSha256);
  const again = retry(root, "Bash", { ...input }, 4500);
  assert.notEqual(again.status, "consumed", "one use only");
}));

test("A2: arming leaves the working tree untouched and the governed toolInputSha256 of the identical call stable", () => withRoot((root) => {
  // Volatile repository state that existed BEFORE seeding (the item's untracked project/ files).
  writeFileSync(join(root, "project", "untracked-note.md"), "volatile\n");
  const before = git(root, "status", "--porcelain=v1", "-uall");
  const input = { command: COMMAND };
  const seeded = seedAndSign(root, "Bash", input);
  arm(root, seeded);
  assert.equal(git(root, "status", "--porcelain=v1", "-uall"), before, "arming must not change repository state");
  // Governed digest: the identity consumeHumanGuardOverride matches on is toolInputSha256 (the request
  // record's requestSha256 additionally digests per-record metadata -- createdAt/expiresAt, repository
  // observation, policy -- which the item does not govern). Re-seeding the IDENTICAL call after arming
  // must therefore produce the same toolInputSha256 as the seeded call, and the same effective identity
  // the armed capability is consumed against.
  const reseeded = recordHumanGuardDenial({ ...seeded.shared, toolName: "Bash", toolInput: { ...input }, denials: DENIALS, nowMs: 3500 });
  assert.equal(reseeded.status, "planned", JSON.stringify(reseeded));
  const replanned = planHumanGuardOverride({ ...seeded.shared, requestSha256: reseeded.requestSha256, nowMs: 3600 });
  assert.equal(replanned.toolInputSha256, seeded.plan.toolInputSha256, "identical call keeps its governed toolInputSha256 after arming");
  assert.equal(retry(root, "Bash", { ...input }).status, "consumed");
}));

test("A1: a differing runner-cosmetic Bash description still consumes (live reproduction 2026-10-03)", () => withRoot((root) => {
  const seeded = seedAndSign(root, "Bash", { command: COMMAND, description: "original description text" });
  assert.equal(arm(root, seeded).status, "armed");
  const consumed = retry(root, "Bash", { command: COMMAND, description: "a different cosmetic description" });
  assert.equal(consumed.status, "consumed", JSON.stringify(consumed));
}));

test("A1: description present on only one side is equally cosmetic", () => withRoot((root) => {
  const seeded = seedAndSign(root, "Bash", { command: COMMAND });
  arm(root, seeded);
  assert.equal(retry(root, "Bash", { command: COMMAND, description: "added later" }).status, "consumed");
}));

test("A1 control: a naive whole-input digest WOULD differ, so the cosmetic case is a meaningful discriminator", () => {
  const naive = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  assert.notEqual(naive({ command: COMMAND, description: "a" }), naive({ command: COMMAND, description: "b" }));
  withRoot((root) => {
    const a = seedAndSign(root, "Bash", { command: COMMAND, description: "a" });
    assert.match(a.plan.toolInputSha256, /^[a-f0-9]{64}$/u);
    assert.notEqual(a.plan.toolInputSha256, naive({ command: COMMAND, description: "a" }),
      "the governed digest is not the naive whole-input digest");
  });
});

test("A1: a changed effective Bash input (command) is NOT cosmetic and does not consume", () => withRoot((root) => {
  const seeded = seedAndSign(root, "Bash", { command: COMMAND, description: "same" });
  arm(root, seeded);
  const refused = retry(root, "Bash", { command: `${COMMAND} --extra`, description: "same" });
  assert.notEqual(refused.status, "consumed");
}));

test("A1: non-Bash tools keep their complete input identity (no field is ignored)", () => withRoot((root) => {
  const input = { file_path: "notes.md", content: "signed recovery\n" };
  const seeded = seedAndSign(root, "Write", input);
  arm(root, seeded);
  const refused = retry(root, "Write", { ...input, description: "cosmetic-looking field on a non-Bash tool" });
  assert.equal(refused.status, "replan");
  assert.equal(refused.code, "HGO-INPUT-MISMATCH");
  assert.equal(retry(root, "Write", { ...input }, 4600).status, "consumed");
}));

test("A4: a mismatch against an armed capability names the differing digest inputs and does not burn it", () => withRoot((root) => {
  const input = { command: COMMAND };
  const seeded = seedAndSign(root, "Bash", input);
  assert.equal(arm(root, seeded).status, "armed");
  const changed = { command: `${COMMAND} --other` };
  const refused = retry(root, "Bash", changed);
  assert.equal(refused.status, "replan");
  assert.equal(refused.code, "HGO-INPUT-MISMATCH");
  const mismatch = refused.inputMismatch;
  assert.equal(mismatch.schema, "pipeline.human-guard-override-input-mismatch.v1");
  assert.equal(mismatch.code, "HGO-INPUT-MISMATCH");
  assert.deepEqual(mismatch.differingInputs, ["toolInputSha256"]);
  assert.equal(mismatch.requestSha256, seeded.recorded.requestSha256);
  assert.equal(mismatch.planSha256, seeded.plan.planSha256);
  assert.equal(mismatch.expectedToolInputSha256, seeded.plan.toolInputSha256);
  assert.match(mismatch.observedToolInputSha256, /^[a-f0-9]{64}$/u);
  assert.notEqual(mismatch.observedToolInputSha256, mismatch.expectedToolInputSha256);
  // The signature was not spent by the mismatching call: the identical retry still consumes.
  assert.equal(retry(root, "Bash", { ...input }, 4700).status, "consumed");
}));

test("A4: with no armed capability a different call is an ordinary absent result, disclosing no hashes", () => withRoot((root) => {
  const seeded = seedAndSign(root, "Bash", { command: COMMAND });
  assert.ok(seeded.plan.planSha256);
  const unarmed = retry(root, "Bash", { command: `${COMMAND} --other` });
  assert.equal(unarmed.status, "absent");
  assert.equal(unarmed.inputMismatch, undefined);
  const audit = readFileSync(join(git(root, "rev-parse", "--path-format=absolute", "--git-common-dir"),
    "agent-pipeline", "human-guard-overrides", "audit.jsonl"), "utf8");
  assert.equal(audit.includes("consumed"), false);
}));
