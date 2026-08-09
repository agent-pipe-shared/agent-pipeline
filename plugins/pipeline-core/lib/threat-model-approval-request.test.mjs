// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createThreatModelApprovalRequest, verifyThreatModelApprovalRequest } from "./threat-model-approval-request.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";
import { approvalRequestFromExternalJson, parseArgs, run as runApprovalRequest } from "../scripts/po-approval-request.mjs";
import { parseGateArgs, run as runApprovalGate } from "../scripts/po-approval-gate.mjs";
import { parseHumanArgs, runHumanApproval } from "../scripts/po-human-approval.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const referenceModel = { schema: "pipeline.threat-model.v1", candidate: { commit: "c".repeat(40), tree: "d".repeat(40) }, policyRevision: "policy-v1", classification: "public", entities: [], lifecycle: "approved" };
const request = createThreatModelApprovalRequest({ candidate, featureId: "cyb-4", planBytes: Buffer.from("plan"), specBytes: Buffer.from("spec"), referenceModel });
const pair = generateKeyPairSync("ed25519"); const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const trustPolicy = { keyReference: "outside-agent-boundary", publicKeySha256: createHash("sha256").update(publicKey).digest("hex") };
const proof = { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: request.approvalIntent.sha256, keyReference: trustPolicy.keyReference, publicKey, signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), pair.privateKey).toString("base64") };

assert.deepEqual(request.candidate, candidate);
assert.deepEqual(request.model.candidate, candidate);
assert.notEqual(request.approvalReceipt.modelDigest, createHash("sha256").update(JSON.stringify(referenceModel)).digest("hex"));
assert.equal(verifyThreatModelApprovalRequest({ request, trustPolicy, proof }).verified, true);
assert.equal(verifyThreatModelApprovalRequest({ request: { ...request, candidate: { ...candidate, tree: "e".repeat(40) } }, trustPolicy, proof }).verified, false);
assert.equal(verifyThreatModelApprovalRequest({ request, trustPolicy: { ...trustPolicy, keyReference: "candidate-key" }, proof }).verified, false);
assert.deepEqual(parseArgs(["prepare", "--repo-root", "/external/repo", "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md", "--model", "model.json"]), { command: "prepare", repoRoot: "/external/repo", featureId: "cyb-4", plan: "plan.md", spec: "spec.md", model: "model.json" });
assert.ok(parseArgs(["prepare", "--repo-root", "/one", "--repo-root", "/two"]).error);
assert.equal(approvalRequestFromExternalJson({ ok: true, value: request }), request);
assert.deepEqual(parseHumanArgs(["setup", "--repo-root", "/repo", "--directory", "/human-po"]), { command: "setup", keyReference: "local-po-key", repoRoot: "/repo", directory: "/human-po" });
assert.deepEqual(parseHumanArgs(["prepare", "--repo-root", "/repo", "--directory", "/human-po", "--feature-id", "cyb-5", "--plan", "specs/plan.md", "--spec", "specs/spec.md", "--model", "specs/cyb-5/threat-model.json"]), { command: "prepare", keyReference: "local-po-key", repoRoot: "/repo", directory: "/human-po", featureId: "cyb-5", plan: "specs/plan.md", spec: "specs/spec.md", model: "specs/cyb-5/threat-model.json" });
assert.deepEqual(parseHumanArgs(["prepare-all", "--repo-root", "/repo", "--directory", "/human-po"]), { command: "prepare-all", keyReference: "local-po-key", repoRoot: "/repo", directory: "/human-po" });
assert.deepEqual(parseGateArgs(["verify", "--repo-root", "/repo", "--directory", "/human-po"]), { command: "verify", keyReference: "local-po-key", repoRoot: "/repo", directory: "/human-po" });
assert.deepEqual(parseGateArgs(["verify-all", "--repo-root", "/repo", "--directory", "/human-po"]), { command: "verify-all", keyReference: "local-po-key", repoRoot: "/repo", directory: "/human-po" });
assert.ok(parseGateArgs(["approve", "--repo-root", "/repo", "--directory", "/human-po"]).error);
assert.ok(parseGateArgs(["prepare-all", "--repo-root", "/repo", "--directory", "/human-po", "--feature-id", "cyb-4"]).error);
assert.ok(parseHumanArgs(["approve", "--directory", "relative"]).error);
const external = mkdtempSync(join(tmpdir(), "po-human-approval-")); const nominalRepo = mkdtempSync(join(tmpdir(), "po-human-repo-"));
writeFileSync(join(external, "request.json"), JSON.stringify({ ok: true, value: request })); writeFileSync(join(external, "authority.json"), JSON.stringify(trustPolicy)); writeFileSync(join(external, "proof.json"), JSON.stringify(proof));
assert.equal(runApprovalRequest(["verify", "--repo-root", nominalRepo, "--request", join(external, "request.json"), "--authority", join(external, "authority.json"), "--proof", join(external, "proof.json")], { observeCandidate: () => candidate }).value.verified, true);
assert.throws(() => runApprovalRequest(["verify", "--repo-root", nominalRepo, "--request", join(external, "request.json"), "--authority", join(external, "authority.json"), "--proof", join(external, "proof.json")], { observeCandidate: () => ({ ...candidate, tree: "f".repeat(40) }) }), /current clean candidate/u);
// GF-069: a fresh SETUP-1 (3-field) authority file -- the exact shape
// `po-human-approval.mjs setup --human-name` writes to trust-policy.json --
// must be accepted by `po-approval-request.mjs verify` exactly like the
// legacy 2-field shape above, not unconditionally rejected.
writeFileSync(join(external, "authority-setup1.json"), JSON.stringify({ ...trustPolicy, humanName: "Test Operator" }));
assert.equal(runApprovalRequest(["verify", "--repo-root", nominalRepo, "--request", join(external, "request.json"), "--authority", join(external, "authority-setup1.json"), "--proof", join(external, "proof.json")], { observeCandidate: () => candidate }).value.verified, true);
writeFileSync(join(external, "trust-policy.json"), JSON.stringify({ ...trustPolicy, humanName: "Test Operator" })); writeFileSync(join(external, "po-public.pem"), publicKey); writeFileSync(join(external, "proof.json"), JSON.stringify(proof));
assert.equal(runHumanApproval(["verify", "--repo-root", nominalRepo, "--directory", external], { observeCandidate: () => candidate }).value.verified, true);
assert.equal(runApprovalGate(["verify", "--repo-root", nominalRepo, "--directory", external], { observeCandidate: () => candidate }).value.verified, true);
assert.throws(() => runHumanApproval(["verify", "--repo-root", nominalRepo, "--directory", external], { observeCandidate: () => ({ ...candidate, commit: "f".repeat(40) }) }), /current clean candidate/u);
const keyDirectory = mkdtempSync(join(tmpdir(), "po-human-key-"));
const setup = runHumanApproval(["setup", "--repo-root", nominalRepo, "--directory", keyDirectory, "--human-name", "Test Operator"], {
  spawn: (_executable, args) => {
    const output = args[args.indexOf("-out") + 1];
    writeFileSync(output, args.includes("-pubout") ? publicKey : "encrypted-private-key-placeholder");
    return { status: 0 };
  },
});
assert.equal(setup.code, "PO-HUMAN-AUTHORITY-READY");
assert.equal(JSON.parse(readFileSync(join(keyDirectory, "trust-policy.json"), "utf8")).publicKeySha256, trustPolicy.publicKeySha256);
const recoveryDirectory = mkdtempSync(join(tmpdir(), "po-human-recovery-")); writeFileSync(join(recoveryDirectory, "po-private.pem"), "encrypted-private-key-placeholder"); writeFileSync(join(recoveryDirectory, "po-public.pem"), publicKey);
const recovered = runHumanApproval(["setup", "--repo-root", nominalRepo, "--directory", recoveryDirectory, "--human-name", "Test Operator"]);
assert.equal(recovered.recovered, true);
assert.equal(JSON.parse(readFileSync(join(recoveryDirectory, "trust-policy.json"), "utf8")).publicKeySha256, trustPolicy.publicKeySha256);
assert.equal(runHumanApproval(["setup", "--repo-root", nominalRepo, "--directory", recoveryDirectory]).recovered, false);
// FIXTURE-2: creating a brand-new key with no authority record yet to read a name from
// is refused, and the message names --human-name rather than reading as a generic usage
// error.
const freshDirectory = mkdtempSync(join(tmpdir(), "po-human-fresh-"));
assert.throws(() => runHumanApproval(["setup", "--repo-root", nominalRepo, "--directory", freshDirectory]), /--human-name/u);
// FIXTURE-2: recovery against a directory whose authority record predates --human-name
// (the old 2-key {keyReference, publicKeySha256} shape, no stored name) is refused with a
// message that says so, distinct from the generic "does not match the local public key".
const legacyDirectory = mkdtempSync(join(tmpdir(), "po-human-legacy-"));
writeFileSync(join(legacyDirectory, "po-private.pem"), "encrypted-private-key-placeholder");
writeFileSync(join(legacyDirectory, "po-public.pem"), publicKey);
writeFileSync(join(legacyDirectory, "trust-policy.json"), JSON.stringify(trustPolicy));
assert.throws(() => runHumanApproval(["setup", "--repo-root", nominalRepo, "--directory", legacyDirectory]), /predates/u);
assert.throws(() => runHumanApproval(["setup", "--repo-root", nominalRepo, "--directory", `${nominalRepo}/po`]), /outside the repository/u);
mkdirSync(join(nominalRepo, "inside")); const linkedDirectory = join(external, "linked-po"); symlinkSync(join(nominalRepo, "inside"), linkedDirectory, "dir");
assert.throws(() => runHumanApproval(["setup", "--repo-root", nominalRepo, "--directory", linkedDirectory]), /outside the repository/u);
const linkedParent = join(external, "linked-parent"); symlinkSync(nominalRepo, linkedParent, "dir");
assert.throws(() => runHumanApproval(["setup", "--repo-root", nominalRepo, "--directory", join(linkedParent, "new-po")]), /outside the repository/u);
assert.equal(existsSync(join(nominalRepo, "new-po")), false);
const poisonedDirectory = mkdtempSync(join(tmpdir(), "po-human-poisoned-")); writeFileSync(join(nominalRepo, "poisoned-private.pem"), "must-not-be-read");
symlinkSync(join(nominalRepo, "poisoned-private.pem"), join(poisonedDirectory, "po-private.pem"));
assert.throws(() => runHumanApproval(["setup", "--repo-root", nominalRepo, "--directory", poisonedDirectory]), /unlinked regular files/u);
const hardLinkedDirectory = mkdtempSync(join(tmpdir(), "po-human-hard-linked-")); linkSync(join(nominalRepo, "poisoned-private.pem"), join(hardLinkedDirectory, "po-private.pem"));
assert.throws(() => runHumanApproval(["setup", "--repo-root", nominalRepo, "--directory", hardLinkedDirectory]), /unlinked regular files/u);
writeFileSync(join(external, "po-private.pem"), "encrypted-private-key-placeholder");
// `readConfirmation` is injected here because signing is gated on an explicit typed
// human confirmation (NOVA-PO-CONFIRM-1); these checks cover the request/proof shape,
// not the gate, which has its own coverage in scripts/po-human-approval.test.mjs.
assert.equal(runHumanApproval(["approve", "--repo-root", nominalRepo, "--directory", external], { readConfirmation: () => "approve", spawn: (_executable, args) => { writeFileSync(args[args.indexOf("-out") + 1], "detached-signature"); return { status: 0 }; } }).code, "PO-HUMAN-PROOF-READY");
assert.equal(JSON.parse(readFileSync(join(external, "proof.json"), "utf8")).intentSha256, request.approvalIntent.sha256);
writeFileSync(join(external, "request-cyb-5.json"), JSON.stringify({ ok: true, value: request }));
assert.equal(runHumanApproval(["approve-all", "--repo-root", nominalRepo, "--directory", external], { readConfirmation: () => "approve", spawn: (_executable, args) => { writeFileSync(args[args.indexOf("-out") + 1], "detached-signature"); return { status: 0 }; } }).code, "PO-HUMAN-APPROVE-ALL-READY");
assert.equal(JSON.parse(readFileSync(join(external, "proof-cyb-5.json"), "utf8")).intentSha256, request.approvalIntent.sha256);
console.log("39 threat-model approval request checks passed");
