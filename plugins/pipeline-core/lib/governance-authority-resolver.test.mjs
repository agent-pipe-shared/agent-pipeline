#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { createExternalHumanGovernanceIntent } from "./human-governance-ledger.mjs";
import { requireExternallyAttestedGovernanceAuthority, requireExternallyVerifiedGovernanceAuthority, requireGovernanceAuthority, requireGovernanceRoleException } from "./governance-authority-resolver.mjs";

const sha = "a".repeat(64); const candidate = { commit: "b".repeat(40), tree: "c".repeat(40) };
const decision = { decisionId: "decision-1", event: "granted", outcome: "granted", authorityClass: "product-owner", identityAssurance: "locally-attributed", timeAssurance: "locally-observed", scope: { repositoryFingerprint: sha, candidate, packageId: "sprint-phoenix-epic", action: "PLAN.APPROVE", environment: "local", artifacts: [{ path: "specs/sprint-phoenix-epic/spec.md", sha256: sha }] }, reasonCode: "SCOPE.ACCEPTED", policyDigest: sha, ruleDigest: sha, validity: { notBeforeEpochMs: 0, expiresAtEpochMs: 100, singleUse: true }, links: { requestDecisionId: "request-1", consumesDecisionId: null, revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null } };
test("resolver exposes only exact granted authority", () => {
  assert.equal(requireGovernanceAuthority({ decisions: [decision], decisionId: "decision-1", repositoryFingerprint: sha, candidate, nowEpochMs: 1 }).granted, true);
  assert.deepEqual(requireGovernanceAuthority({ decisions: [decision], decisionId: "decision-1", repositoryFingerprint: sha, candidate: { ...candidate, tree: "d".repeat(40) }, nowEpochMs: 1 }), { granted: false, reason: "scope-mismatch" });
});

// H-AC-10 regression: the role-exception class must not be able to reach a
// consumer as general authority. `scope` is byte-identical across the two human
// decision classes, so a consumer that matches on `scope.action` -- which is
// what both shipped guards do -- cannot tell an exception from an approval. The
// general boundary therefore refuses the class outright rather than handing it
// over with its constraints and follow-up review stripped off.
const roleException = {
  schema: "pipeline.human-role-exception-decision.v1",
  decisionId: "exception-1", event: "granted", outcome: "granted",
  exceptionClass: "direct-elephant-implementation",
  authorityClass: "product-owner", identityAssurance: "locally-attributed", timeAssurance: "locally-observed",
  scope: { ...decision.scope, action: "ROLE.EXCEPTION" },
  constraints: [{ kind: "no-guard-override", limit: null }],
  followUpReview: { review: "critic-review", dueByEpochMs: 200, satisfiedByDecisionId: null },
  reasonCode: "ROLE.EXCEPTION.GRANTED", policyDigest: sha, ruleDigest: sha,
  validity: { notBeforeEpochMs: 0, expiresAtEpochMs: 100, singleUse: true },
  links: decision.links,
};
const exceptionRequest = { decisions: [roleException], decisionId: "exception-1", repositoryFingerprint: sha, candidate, nowEpochMs: 1 };

test("H-AC-10 a role exception is never general authority", () => {
  assert.deepEqual(requireGovernanceAuthority(exceptionRequest), { granted: false, reason: "role-exception-not-general-authority" });
  // The bounds are not merely absent from the general result -- there is no
  // general result to attach them to.
  assert.equal(requireGovernanceAuthority(exceptionRequest).scope, undefined);
});

test("H-AC-10 the explicit role-exception boundary carries the bounds it grants under", () => {
  const granted = requireGovernanceRoleException(exceptionRequest);
  assert.equal(granted.granted, true);
  assert.equal(granted.exceptionClass, "direct-elephant-implementation");
  assert.deepEqual(granted.constraints.map((entry) => entry.kind), ["no-guard-override"]);
  assert.equal(granted.followUpReview.review, "critic-review");
  // And it is not a second door to an ordinary plan decision.
  assert.deepEqual(requireGovernanceRoleException({ decisions: [decision], decisionId: "decision-1", repositoryFingerprint: sha, candidate, nowEpochMs: 1 }), { granted: false, reason: "not-a-role-exception" });
});

test("external resolver reports proof verification without claiming human identity provenance", () => {
  const plan = { path: "specs/sprint-phoenix-epic/prd_phoenix-epic.md", sha256: "d".repeat(64) };
  const spec = { path: "specs/sprint-phoenix-epic/spec.md", sha256: sha };
  const grant = { ...decision, scope: { ...decision.scope, artifacts: [plan, spec] } };
  const intent = createExternalHumanGovernanceIntent({ decision: grant, plan, spec });
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: intent.sha256, keyReference: "external-po-v1", publicKey, signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), keys.privateKey).toString("base64") };
  const request = { decisions: [grant], decisionId: grant.decisionId, repositoryFingerprint: sha, candidate, nowEpochMs: 1, plan, spec, trustPolicy: { keyReference: proof.keyReference, publicKeySha256: createHash("sha256").update(publicKey).digest("hex") }, proof };
  assert.deepEqual(requireExternallyVerifiedGovernanceAuthority(request).proofTrustAssurance, "caller-supplied-policy");
  assert.equal(requireExternallyVerifiedGovernanceAuthority(request).identityAssurance, undefined);
  const compatibility = requireExternallyAttestedGovernanceAuthority(request);
  assert.equal(compatibility.granted, true);
  assert.equal(compatibility.identityAssurance, "local-human");
  assert.equal(compatibility.externalAttestationDeprecated, true);
  assert.deepEqual(requireExternallyVerifiedGovernanceAuthority({ ...request, proof: { ...proof, signatureBase64: "AA==" } }), { granted: false, reason: "external-proof-unverified", proofCode: "HGL-EXTERNAL-PROOF-MISMATCH" });
});
