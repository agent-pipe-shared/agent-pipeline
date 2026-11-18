#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { approvePublication, authorizePublication, closePublication, observePublication, preparePublication, publicationDigest, startReadback } from "../lib/publication-bundle.mjs";
import * as journalModule from "./publication-close-journal.mjs";
import { JOURNAL_SCHEMA, createPublicationLifecycle, importPublicationChannel, lifecycleDigest, publicationClosePaths, readCloseJournal, readPublicationLifecycle, recordCleanup, storePublicationLifecycle, validateCloseJournal } from "./publication-close-journal.mjs";
const h = (char, length = 64) => char.repeat(length);
const rawDigest = (value) => createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex");
const authority = { implementationResultDigest: h("1"), prdDigest: h("2"), specDigests: [h("3"), h("4"), h("5"), h("6"), h("7"), h("8")], verifyDigest: h("9"), criticDigest: h("a"), d2ReceiptDigest: h("b"), privateIntentDigest: h("c"), publicIntentDigest: h("d") };
const prerequisite = { d2: { phase: "verified", receiptDigest: h("b"), closePostimageDigest: h("e") }, closePostimageDigest: h("e"), afk: { status: "complete", receiptDigest: h("f") }, recoveryPending: false };
const evidence = (char, oid, tree) => ({ path: `evidence/${char}.json`, rawDigest: h(char), commit: oid, tree });
function receipt(channel, char) {
  const oid = h(char, 40), tree = h(char === "1" ? "2" : "4", 40), preimage = h("0", 40);
  let state = preparePublication({ channel, transactionId: `${channel}-1`, repositoryFingerprint: h("1"), sourceCommit: h("8", 40), sourceTree: h("9", 40), remoteFingerprint: h("2"), remoteName: "origin", destinationRef: "refs/heads/main", remotePreimageOid: preimage, candidateOid: oid, candidateTree: tree, ancestry: { baseOid: preimage, candidateOid: oid, descends: true }, identityProbe: evidence("3", oid, tree), verifyEvidence: evidence("4", oid, tree), securityEvidence: evidence("5", oid, tree), ...(channel === "neutral-public" ? { neutralEvidence: { planDigest: h("6"), reviewDigest: h("7"), leakageDigest: h("8"), metadataDigest: h("9"), endpointProbeDigest: h("a"), candidateCommit: oid, candidateTree: tree } } : {}) });
  state = approvePublication(state, { expectedRevision: 0, expectedStateSha256: publicationDigest(state), approvalId: `${channel}-approval`, attribution: "PO", approvedAt: 1, expiresAt: 2 });
  state = authorizePublication(state, { expectedRevision: 1, expectedStateSha256: publicationDigest(state), now: 2, command: ["git", "push", "--porcelain", "origin", `${oid}:refs/heads/main`] });
  state = observePublication(state, { expectedRevision: 2, expectedStateSha256: publicationDigest(state), observedOid: oid, observedAt: 3, status: "observed" });
  state = startReadback(state, { expectedRevision: 3, expectedStateSha256: publicationDigest(state), repositoryKind: "fresh-disposable", alternatesDisabled: true, destinationRef: "refs/heads/main" });
  return closePublication(state, { expectedRevision: 4, expectedStateSha256: publicationDigest(state), fetchedRef: "refs/heads/main", fetchedOid: oid, fetchedTree: tree, completedAt: 4 });
}
let tests = 0; const check = (name, fn) => { fn(); tests++; };
// The write side of the legacy close journal is removed; only the readers stay, so an old journal file (AC-047-27 compatibility) remains readable.
check("the legacy close-journal write side is gone", () => { for (const name of ["createCloseJournal", "advanceCloseJournal", "storeCloseJournal"]) assert.equal(name in journalModule, false, name); });
check("the legacy close-journal readers stay exported", () => { assert.equal(typeof journalModule.validateCloseJournal, "function"); assert.equal(typeof journalModule.readCloseJournal, "function"); });
const pendingJournal = { schema: JOURNAL_SCHEMA, lifecycleId: "batman", revision: 0, priorStateSha256: null, phase: "pending", candidateOid: h("a", 40), candidateTree: h("b", 40), authority, effects: [] };
const legacyJournal = { ...pendingJournal, revision: 1, priorStateSha256: lifecycleDigest(pendingJournal), phase: "implementation-result-bound", effects: [{ phase: "implementation-result-bound", inputDigest: h("c"), observedDigest: h("d") }] };
const common = mkdtempSync(join(tmpdir(), "publication-close-"));
const legacyPaths = publicationClosePaths(common, "batman");
mkdirSync(legacyPaths.directory, { recursive: true, mode: 0o700 });
writeFileSync(legacyPaths.journal, `${JSON.stringify(legacyJournal, null, 2)}\n`, { mode: 0o600 });
check("an old journal file stays valid", () => assert.equal(validateCloseJournal(legacyJournal), true));
check("recovery of an old journal names only the next phase", () => { const read = readCloseJournal(common, "batman"); assert.equal(read.nextPhase, "feature-closed"); assert.equal(read.journal.phase, "implementation-result-bound"); });
writeFileSync(legacyPaths.journal, "torn\n", { mode: 0o600 });
check("torn state blocks recovery", () => assert.throws(() => readCloseJournal(common, "batman"), /torn/));
rmSync(common, { recursive: true, force: true });
let lifecycle = createPublicationLifecycle({ lifecycleId: "batman", epicId: "epic", featureId: "feature", prerequisites: prerequisite });
const lifecycleCommon = mkdtempSync(join(tmpdir(), "publication-lifecycle-"));
let storedLifecycle = storePublicationLifecycle({ gitCommonDir: lifecycleCommon, lifecycle, expectedRawSha256: null });
check("aggregate lifecycle is durable mode 0600", () => { assert.equal(statSync(storedLifecycle.path).mode & 0o777, 0o600); assert.equal(readPublicationLifecycle(lifecycleCommon, "batman").lifecycle.status, "preparing"); });
const privateReceipt = receipt("private", "1");
const importArgs = (channel, value, completedAt) => {
  const receiptRawBytes = `${JSON.stringify(value, null, 2)}\n`;
  return { expectedRevision: lifecycle.revision, expectedStateSha256: lifecycleDigest(lifecycle), channel, receipt: value, receiptRawBytes, receiptRawDigest: rawDigest(value), receiptLocator: `publication/${channel}.json`, observation: { path: `publication/${channel}-readback.json`, rawDigest: h(channel === "private" ? "9" : "a"), endpointFingerprint: value.remoteFingerprint, ref: value.destinationRef, oid: value.candidateOid, tree: value.candidateTree, observedAt: completedAt } };
};
lifecycle = importPublicationChannel(lifecycle, importArgs("private", privateReceipt, 10));
storedLifecycle = storePublicationLifecycle({ gitCommonDir: lifecycleCommon, lifecycle, expectedRawSha256: storedLifecycle.rawDigest });
check("private import advances only private", () => { assert.equal(lifecycle.status, "private-complete"); assert.equal(lifecycle.channels["neutral-public"], null); });
const publicReceipt = receipt("neutral-public", "3");
lifecycle = importPublicationChannel(lifecycle, importArgs("neutral-public", publicReceipt, 11));
storedLifecycle = storePublicationLifecycle({ gitCommonDir: lifecycleCommon, lifecycle, expectedRawSha256: storedLifecycle.rawDigest });
check("both exact typed readbacks derive complete", () => assert.equal(lifecycle.status, "complete"));
const replayLifecycle = importPublicationChannel(lifecycle, { ...importArgs("private", privateReceipt, 10), expectedRevision: lifecycle.revision, expectedStateSha256: lifecycleDigest(lifecycle) });
check("identical channel replay is zero-state-change", () => assert.equal(replayLifecycle, lifecycle));
check("receipt raw digest is recomputed", () => assert.throws(() => importPublicationChannel(createPublicationLifecycle({ lifecycleId: "x", epicId: "epic", featureId: "feature", prerequisites: prerequisite }), { ...importArgs("private", privateReceipt, 10), expectedRevision: 0, expectedStateSha256: lifecycleDigest(createPublicationLifecycle({ lifecycleId: "x", epicId: "epic", featureId: "feature", prerequisites: prerequisite })), receiptRawDigest: h("0") }), /raw digest/));
lifecycle = recordCleanup(lifecycle, { expectedRevision: 2, expectedStateSha256: lifecycleDigest(lifecycle), status: "uncertain", evidenceDigest: h("f") });
storedLifecycle = storePublicationLifecycle({ gitCommonDir: lifecycleCommon, lifecycle, expectedRawSha256: storedLifecycle.rawDigest });
check("cleanup uncertainty blocks without erasing receipts", () => { assert.equal(lifecycle.status, "blocked"); assert.notEqual(lifecycle.channels.private, null); });
// Restated (QG-04) from the removed journal writer cases: the shared lock/CAS/replay paths, now through the lifecycle writer.
const lifecycleMtime = statSync(storedLifecycle.path).mtimeMs;
const lifecycleReplay = storePublicationLifecycle({ gitCommonDir: lifecycleCommon, lifecycle, expectedRawSha256: storedLifecycle.rawDigest });
check("identical durable replay does not replace the lifecycle", () => { assert.equal(lifecycleReplay.written, false); assert.equal(statSync(storedLifecycle.path).mtimeMs, lifecycleMtime); });
check("stale raw CAS blocks", () => assert.throws(() => storePublicationLifecycle({ gitCommonDir: lifecycleCommon, lifecycle, expectedRawSha256: h("0") }), /stale/));
const lifecycleLock = publicationClosePaths(lifecycleCommon, "batman").lock;
writeFileSync(lifecycleLock, "foreign-lock\n", { mode: 0o600 });
check("foreign writer lock is never removed", () => { assert.throws(() => storePublicationLifecycle({ gitCommonDir: lifecycleCommon, lifecycle, expectedRawSha256: storedLifecycle.rawDigest }), /EEXIST/); assert.equal(existsSync(lifecycleLock), true); });
unlinkSync(lifecycleLock);
rmSync(lifecycleCommon, { recursive: true, force: true });
console.log(`publication-close-journal: ${tests} tests passed`);
