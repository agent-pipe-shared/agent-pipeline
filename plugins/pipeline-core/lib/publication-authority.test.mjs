#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  approvePublicationAuthority, authorizePublicationAuthority, blockPublicationAuthority,
  closePublicationAuthority, observePublicationAuthority, preparePublicationAuthority,
  publicationAuthorityPaths, readPublicationAuthority, rearmPublicationAuthority,
  startPublicationReadback,
} from "./publication-authority.mjs";
import { publicationDigest, publicationUncertaintyDigest } from "./publication-bundle.mjs";

const h = (value, length = 64) => value.repeat(length);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const evidence = (value) => ({ path: `evidence/${value}.json`, rawDigest: h(value), commit: h("e", 40), tree: h("f", 40) });
const input = (channel = "private", transactionId = "delivery-1") => ({
  channel, transactionId, repositoryFingerprint: h("a"), sourceCommit: h("b", 40), sourceTree: h("c", 40),
  remoteFingerprint: h("9"), remoteName: "origin", destinationRef: "refs/heads/main", remotePreimageOid: h("d", 40),
  candidateOid: h("e", 40), candidateTree: h("f", 40), ancestry: { baseOid: h("d", 40), candidateOid: h("e", 40), descends: true },
  identityProbe: evidence("1"), verifyEvidence: evidence("2"), securityEvidence: evidence("3"),
  ...(channel === "neutral-public" ? { neutralEvidence: { planDigest: h("4"), reviewDigest: h("5"), leakageDigest: h("6"), metadataDigest: h("7"), endpointProbeDigest: h("8"), candidateCommit: h("e", 40), candidateTree: h("f", 40) } } : {}),
});
function common() { return mkdtempSync(join(tmpdir(), "publication-authority-")); }
function args(stored, gitCommonDir) { return { gitCommonDir, transactionId: stored.record.transactionId, channel: stored.record.channel, expectedRawSha256: stored.rawDigest }; }
let tests = 0;
function check(_name, fn) { fn(); tests++; }

const root = common();
let stored = preparePublicationAuthority({ gitCommonDir: root, input: input(), heldLocks: ["pipeline-state"] });
check("projection is durable mode 0600 with redacted candidate-bound reference", () => {
  assert.equal(statSync(stored.path).mode & 0o777, 0o600);
  assert.equal(stored.reference.phase, "prepared");
  assert.equal(stored.reference.candidateOid, h("e", 40));
  assert.equal("remoteFingerprint" in stored.reference, false);
});
check("a transaction id never becomes a directory component", () => assert.equal(publicationAuthorityPaths(root, "delivery/with/slashes").directory.includes("delivery/with"), false));
check("state-writer then authority is the only valid acquired-lock prefix", () => {
  assert.throws(() => preparePublicationAuthority({ gitCommonDir: root, input: input("private", "wrong-order"), heldLocks: ["publication-authority"] }), /lock order/);
});
check("channel substitution blocks before a transition", () => assert.throws(() => approvePublicationAuthority({ ...args(stored, root), channel: "neutral-public", expectedRevision: 0, expectedStateSha256: publicationDigest(stored.record.publication), approvalId: "po-1", attribution: "PO", approvedAt: 1, expiresAt: 2 }), /substitution/));
stored = approvePublicationAuthority({ ...args(stored, root), expectedRevision: 0, expectedStateSha256: publicationDigest(stored.record.publication), approvalId: "po-1", attribution: "PO", approvedAt: 1000, expiresAt: 901000, heldLocks: ["pipeline-state"] });
check("stale projection CAS blocks a replay", () => assert.throws(() => approvePublicationAuthority({ gitCommonDir: root, transactionId: "delivery-1", channel: "private", expectedRawSha256: h("0"), expectedRevision: 1, expectedStateSha256: publicationDigest(stored.record.publication), approvalId: "po-2", attribution: "PO", approvedAt: 1000, expiresAt: 901000 }), /stale/));
stored = authorizePublicationAuthority({ ...args(stored, root), expectedRevision: 1, expectedStateSha256: publicationDigest(stored.record.publication), now: 2000, command: ["git", "push", "--porcelain", "origin", `${h("e", 40)}:refs/heads/main`] });
check("authorization reference binds the exact ordinary push tuple", () => assert.equal(stored.reference.phase, "push-authorized"));
check("authorization replay cannot consume a second time", () => assert.throws(() => authorizePublicationAuthority({ ...args(stored, root), expectedRevision: 2, expectedStateSha256: publicationDigest(stored.record.publication), now: 2001, command: ["git", "push", "--porcelain", "origin", `${h("e", 40)}:refs/heads/main`] }), /approval absent|phase/));
stored = observePublicationAuthority({ ...args(stored, root), expectedRevision: 2, expectedStateSha256: publicationDigest(stored.record.publication), observedOid: h("d", 40), observedAt: 3000, status: "observed" });
check("preimage observation enters the recovery-only phase", () => assert.equal(stored.record.publication.phase, "reapproval-required"));
stored = rearmPublicationAuthority({ ...args(stored, root), expectedRevision: 3, expectedStateSha256: publicationDigest(stored.record.publication), freshPreimageOid: h("d", 40), candidateDescendsFromFreshPreimage: true, attended: true, priorUncertaintyDigest: publicationUncertaintyDigest(stored.record.publication) });
check("recovery retains tuple but removes spent approval", () => assert.equal(stored.record.publication.approval, null));
const lock = publicationAuthorityPaths(root, "delivery-1").lock;
writeFileSync(lock, "foreign-lock\n", { mode: 0o600 });
check("foreign authority lock is not stolen during recovery", () => {
  assert.throws(() => readPublicationAuthority({ gitCommonDir: root, transactionId: "delivery-1" }).record && approvePublicationAuthority({ ...args(stored, root), expectedRevision: 4, expectedStateSha256: publicationDigest(stored.record.publication), approvalId: "po-2", attribution: "PO", approvedAt: 4000, expiresAt: 904000 }), /EEXIST/);
  assert.equal(existsSync(lock), true);
});
unlinkSync(lock);
let blocked = blockPublicationAuthority({ ...args(stored, root), expectedRevision: 4, expectedStateSha256: publicationDigest(stored.record.publication), reason: "manual-review", reasonDigest: digest("manual-review"), blockedAt: 5000 });
check("explicit local block is fail-closed and candidate-bound", () => {
  assert.equal(blocked.record.status, "blocked");
  assert.equal(blocked.reference.candidateTree, h("f", 40));
  assert.throws(() => approvePublicationAuthority({ ...args(blocked, root), expectedRevision: 4, expectedStateSha256: publicationDigest(blocked.record.publication), approvalId: "po-3", attribution: "PO", approvedAt: 5001, expiresAt: 905001 }), /blocked/);
});
rmSync(root, { recursive: true, force: true });

const completeRoot = common();
let complete = preparePublicationAuthority({ gitCommonDir: completeRoot, input: input("neutral-public", "public-1") });
complete = approvePublicationAuthority({ ...args(complete, completeRoot), expectedRevision: 0, expectedStateSha256: publicationDigest(complete.record.publication), approvalId: "pub", attribution: "PO", approvedAt: 1, expiresAt: 2 });
complete = authorizePublicationAuthority({ ...args(complete, completeRoot), expectedRevision: 1, expectedStateSha256: publicationDigest(complete.record.publication), now: 2, command: ["git", "push", "--porcelain", "origin", `${h("e", 40)}:refs/heads/main`] });
complete = observePublicationAuthority({ ...args(complete, completeRoot), expectedRevision: 2, expectedStateSha256: publicationDigest(complete.record.publication), observedOid: h("e", 40), observedAt: 3, status: "observed" });
complete = startPublicationReadback({ ...args(complete, completeRoot), expectedRevision: 3, expectedStateSha256: publicationDigest(complete.record.publication), repositoryKind: "fresh-disposable", alternatesDisabled: true, destinationRef: "refs/heads/main" });
complete = closePublicationAuthority({ ...args(complete, completeRoot), expectedRevision: 4, expectedStateSha256: publicationDigest(complete.record.publication), fetchedRef: "refs/heads/main", fetchedOid: h("e", 40), fetchedTree: h("f", 40), completedAt: 4 });
check("closed receipt reference preserves the final receipt digest", () => assert.equal(complete.reference.receiptDigest, complete.record.publication.receiptDigest));
rmSync(completeRoot, { recursive: true, force: true });
console.log(`publication-authority: ${tests} tests passed`);
