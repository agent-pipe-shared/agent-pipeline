#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { approvePublication } from "./publication-bundle.mjs";
import { createPublicationCapabilityPreflight } from "./publication-capability-preflight.mjs";
import { approvePublicationV2, authorizePublicationV2, preparePublicationV2, validatePublicationV2 } from "./publication-bundle-v2.mjs";
import { publicationDigest } from "./publication-bundle.mjs";
const h = (c) => c.repeat(64); const oid = (c) => c.repeat(40);
const candidate = oid("c"); const tree = oid("d"); const base = oid("a");
const evidence = (name, c) => ({ path: `evidence/${name}.json`, rawDigest: h(c), commit: candidate, tree });
const capability = createPublicationCapabilityPreflight({
  preflightId: "nova-v2", candidate: { commit: candidate, tree },
  remote: { name: "origin", fingerprint: h("e"), status: "available", evidenceSha256: h("f") }, destinationRef: "refs/heads/release/nova", remotePreimage: base,
  credential: { status: "available", evidenceSha256: h("1") }, permissions: { status: "available", evidenceSha256: h("2") }, workflowUpdate: { status: "not-required", evidenceSha256: h("3") }, policy: { status: "available", evidenceSha256: h("4") }, executor: { status: "available", evidenceSha256: h("5") },
});
const prepared = preparePublicationV2({
  channel: "private", transactionId: "tx-v2", repositoryFingerprint: h("6"), sourceCommit: candidate, sourceTree: tree,
  remoteFingerprint: h("e"), remoteName: "origin", destinationRef: "refs/heads/release/nova", remotePreimageOid: base,
  candidateOid: candidate, candidateTree: tree, ancestry: { baseOid: base, candidateOid: candidate, descends: true },
  identityProbe: evidence("identity", "7"), verifyEvidence: evidence("verify", "8"), securityEvidence: evidence("security", "9"), criticEvidence: evidence("critic", "a"), releasePreflightEvidence: evidence("release", "b"),
  capabilityPreflight: capability, fastForwardProof: { baseOid: base, candidateOid: candidate, descends: true, proofSha256: publicationDigest({ schema: "pipeline.publication-fast-forward-proof.v1", baseOid: base, candidateOid: candidate, remoteFingerprint: h("e"), destinationRef: "refs/heads/release/nova" }) }, executorSha256: h("5"), neutralEvidence: null,
});
assert.equal(validatePublicationV2(prepared), true);
assert.throws(() => validatePublicationV2({ ...prepared, fastForwardProof: { ...prepared.fastForwardProof, proofSha256: h("0") } }), /proof digest/u);
assert.throws(() => approvePublication(prepared, {}), /publication state keys invalid|publication state invalid/u);
const approved = approvePublicationV2(prepared, { expectedRevision: 0, expectedStateSha256: publicationDigest(prepared), approvalId: "po-v2", attribution: "PO", approvedAt: 100, expiresAt: 1000 });
const authorized = authorizePublicationV2(approved, { expectedRevision: 1, expectedStateSha256: publicationDigest(approved), now: 110, command: ["git", "push", "--porcelain", "origin", `${candidate}:refs/heads/release/nova`] });
assert.equal(validatePublicationV2(authorized), true);
assert.throws(() => validatePublicationV2({ ...authorized, approval: { ...authorized.approval, expiresAt: authorized.approval.approvedAt } }), /approval invariants/u);
assert.throws(() => validatePublicationV2({ ...authorized, pushIntent: { ...authorized.pushIntent, authorizedAt: authorized.pushIntent.authorizedAt + 1 } }), /push intent drift/u);
assert.throws(() => validatePublicationV2({ ...authorized, reason: "unbound-reason" }), /reason invariant/u);
assert.throws(() => validatePublicationV2({ ...authorized, criticEvidence: evidence("critic", "f") }), /approval tuple drift/u);
assert.throws(() => authorizePublicationV2(approved, { expectedRevision: 1, expectedStateSha256: publicationDigest(approved), now: 110, command: ["git", "push", "--porcelain", "--force", "origin", `${candidate}:refs/heads/release/nova`] }), /push command invalid/u);
console.log("publication-bundle-v2: 9 tests passed");
