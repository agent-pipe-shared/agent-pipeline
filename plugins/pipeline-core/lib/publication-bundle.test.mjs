#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import {
  approvePublication, authorizePublication, closePublication, observePublication,
  preparePublication, publicationDigest, publicationUncertaintyDigest,
  rearmPublication, startReadback, validatePublication,
} from "./publication-bundle.mjs";

const h = (char, length = 64) => char.repeat(length);
const evidence = (char) => ({ path: `evidence/${char}.json`, rawDigest: h(char), commit: h("e", 40), tree: h("f", 40) });
function prepareInput(channel = "private") {
  return {
    channel, transactionId: `${channel}-1`, repositoryFingerprint: h("a"), sourceCommit: h("b", 40), sourceTree: h("c", 40),
    remoteFingerprint: h("9"), remoteName: "origin", destinationRef: "refs/heads/main", remotePreimageOid: h("d", 40),
    candidateOid: h("e", 40), candidateTree: h("f", 40), ancestry: { baseOid: h("d", 40), candidateOid: h("e", 40), descends: true },
    identityProbe: evidence("1"), verifyEvidence: evidence("2"), securityEvidence: evidence("3"),
    ...(channel === "neutral-public" ? { neutralEvidence: { planDigest: h("4"), reviewDigest: h("5"), leakageDigest: h("6"), metadataDigest: h("7"), endpointProbeDigest: h("8"), candidateCommit: h("e", 40), candidateTree: h("f", 40) } } : {}),
  };
}
function fixture(channel = "private") { return preparePublication(prepareInput(channel)); }
let tests = 0;
function check(name, fn) { fn(); tests++; }
check("authoritative state cannot be overridden", () => assert.throws(() => preparePublication({ ...fixture(), schema: "evil" }), /keys/));
check("only exact SHA-1 or SHA-256 OID lengths are accepted", () => {
  for (const length of [41, 63]) assert.throws(() => preparePublication({ ...prepareInput(), sourceCommit: h("b", length) }), /sourceCommit invalid/);
  assert.equal(preparePublication({ ...prepareInput(), sourceCommit: h("b", 64) }).sourceCommit.length, 64);
});
check("unknown nested evidence key blocks", () => assert.throws(() => preparePublication({ ...fixture(), identityProbe: { ...evidence("1"), extra: true } }), /keys/));
check("channel substitution blocks", () => assert.throws(() => preparePublication({ ...fixture(), channel: "neutral-public" }), /keys/));
let state = fixture();
state = approvePublication(state, { expectedRevision: 0, expectedStateSha256: publicationDigest(state), approvalId: "po-1", attribution: "PO", approvedAt: 1000, expiresAt: 901000 });
state = authorizePublication(state, { expectedRevision: 1, expectedStateSha256: publicationDigest(state), now: 2000, command: ["git", "push", "--porcelain", "origin", `${h("e", 40)}:refs/heads/main`] });
state = observePublication(state, { expectedRevision: 2, expectedStateSha256: publicationDigest(state), observedOid: h("e", 40), observedAt: 3000, status: "observed" });
state = startReadback(state, { expectedRevision: 3, expectedStateSha256: publicationDigest(state), repositoryKind: "fresh-disposable", alternatesDisabled: true, destinationRef: "refs/heads/main" });
state = closePublication(state, { expectedRevision: 4, expectedStateSha256: publicationDigest(state), fetchedRef: "refs/heads/main", fetchedOid: h("e", 40), fetchedTree: h("f", 40), completedAt: 4000 });
check("closed invariant and recomputed receipt", () => assert.equal(validatePublication(state), true));
check("receipt digest drift blocks", () => assert.throws(() => validatePublication({ ...state, receiptDigest: h("0") }), /receipt/));
check("stale CAS blocks", () => assert.throws(() => approvePublication(fixture(), { expectedRevision: 4, expectedStateSha256: publicationDigest(fixture()), approvalId: "x", attribution: "PO", approvedAt: 0, expiresAt: 1 }), /stale/));
check("force-shaped command blocks", () => { const approved = approvePublication(fixture(), { expectedRevision: 0, expectedStateSha256: publicationDigest(fixture()), approvalId: "x", attribution: "PO", approvedAt: 0, expiresAt: 1 }); assert.throws(() => authorizePublication(approved, { expectedRevision: 1, expectedStateSha256: publicationDigest(approved), now: 1, command: ["git", "push", "--force", "origin"] }), /command/); });
let uncertain = fixture("neutral-public");
uncertain = approvePublication(uncertain, { expectedRevision: 0, expectedStateSha256: publicationDigest(uncertain), approvalId: "pub-1", attribution: "PO", approvedAt: 1, expiresAt: 2 });
uncertain = authorizePublication(uncertain, { expectedRevision: 1, expectedStateSha256: publicationDigest(uncertain), now: 2, command: ["git", "push", "--porcelain", "origin", `${h("e", 40)}:refs/heads/main`] });
uncertain = observePublication(uncertain, { expectedRevision: 2, expectedStateSha256: publicationDigest(uncertain), observedOid: h("d", 40), observedAt: 3, status: "observed" });
check("rearm requires attended uncertainty binding", () => assert.throws(() => rearmPublication(uncertain, { expectedRevision: 3, expectedStateSha256: publicationDigest(uncertain), freshPreimageOid: h("d", 40), candidateDescendsFromFreshPreimage: true, attended: true, priorUncertaintyDigest: h("0") }), /unbound/));
const rearmed = rearmPublication(uncertain, { expectedRevision: 3, expectedStateSha256: publicationDigest(uncertain), freshPreimageOid: h("d", 40), candidateDescendsFromFreshPreimage: true, attended: true, priorUncertaintyDigest: publicationUncertaintyDigest(uncertain) });
check("rearm clears consumed approval", () => assert.equal(rearmed.approval, null));
check("unknown remote result blocks recovery", () => { let value = fixture(); value = approvePublication(value, { expectedRevision: 0, expectedStateSha256: publicationDigest(value), approvalId: "x", attribution: "PO", approvedAt: 1, expiresAt: 2 }); value = authorizePublication(value, { expectedRevision: 1, expectedStateSha256: publicationDigest(value), now: 2, command: ["git", "push", "--porcelain", "origin", `${h("e", 40)}:refs/heads/main`] }); value = observePublication(value, { expectedRevision: 2, expectedStateSha256: publicationDigest(value), observedOid: null, observedAt: 3, status: "unknown" }); assert.equal(value.phase, "blocked-recovery"); });
console.log(`publication-bundle: ${tests} tests passed`);
