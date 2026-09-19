// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

import { PUSH_BATCH_CLOCK_POLICY, createPushBatchSubject, pushBatchMemberId, pushBatchSubjectSha256, validatePushBatchSelection, validatePushBatchSubject } from "./push-batch-contract.mjs";
import { criticalActionSubjectSha256 } from "./critical-action-approval-request.mjs";

const sha = (char) => char.repeat(64);
const oid = (char) => char.repeat(40);
const memberInput = ({ remote, endpointSha256, transportPolicySha256, destinationRef, expectedRemoteCommit, sourceCommit, sourceTree }) => ({ remote, endpointSha256, transportPolicySha256, destinationRef, expectedRemoteCommit, sourceCommit, sourceTree });
const reidentify = (subject, ordinal) => { subject.destinations[ordinal].memberId = pushBatchMemberId({ repositoryFingerprint: subject.repository.fingerprint, member: memberInput(subject.destinations[ordinal]) }); };
function batch(count = 2) {
  const subject = { schema: "pipeline.push-batch-subject.v2", repository: { fingerprint: sha("a"), objectFormat: "sha1" }, candidate: { commit: oid("b"), tree: oid("c") }, authority: { featureId: "nova", planSha256: sha("d"), specSha256: sha("e") }, policy: { manifestSha256: sha("f"), proofPolicySha256: sha("1"), destinationPolicySha256: sha("2") }, threatModel: { path: "threat-model.json", sha256: sha("3") }, previewBindingSha256: sha("4"), nonce: "preview-1", createdAt: "2026-09-19T10:00:00.000Z", expiresAt: "2026-09-19T11:00:00.000Z", ordering: "listed-stop-on-non-success", destinations: [] };
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const member = { remote: `origin-${ordinal}`, endpointSha256: sha("0123456789abcdef"[(ordinal + 5) % 16]), transportPolicySha256: sha("7"), destinationRef: `refs/heads/branch-${ordinal}`, expectedRemoteCommit: ordinal ? oid("8") : null, sourceCommit: subject.candidate.commit, sourceTree: subject.candidate.tree };
    subject.destinations.push({ ordinal, memberId: pushBatchMemberId({ repositoryFingerprint: subject.repository.fingerprint, member }), ...member });
  }
  return subject;
}
const valid = (subject, now = "2026-09-19T10:30:00.000Z") => validatePushBatchSubject({ subject, now, clockPolicy: PUSH_BATCH_CLOCK_POLICY.ENFORCE_VALIDITY });

test("constructs deterministic wrapper-bound subjects and preserves the v1 wrapper preimage", () => {
  const subject = createPushBatchSubject(batch());
  const actual = pushBatchSubjectSha256(subject);
  assert.equal(actual, "15beda5c5073d9928c7433ea5a20b8ade9b01c0f62867bc915072f8c229dc0d2");
  assert.equal(actual, criticalActionSubjectSha256({ kind: "push", candidate: subject.candidate, subject }));
  assert.equal(actual, pushBatchSubjectSha256(subject));
});
test("rejects every signed-field mutation and forged member IDs", () => {
  for (const mutate of [(s) => { s.destinations[0].sourceCommit = oid("9"); }, (s) => { s.destinations[0].memberId = sha("9"); }, (s) => { s.destinations[0].unexpected = true; }, (s) => { s.policy.extra = true; }, (s) => { s.expiresAt = s.createdAt; }]) {
    const subject = batch(); mutate(subject); assert.throws(() => createPushBatchSubject(subject));
  }
});
test("allows one remote at one endpoint and policy across distinct refs", () => {
  const subject = batch();
  subject.destinations[1].remote = subject.destinations[0].remote;
  subject.destinations[1].endpointSha256 = subject.destinations[0].endpointSha256;
  subject.destinations[1].transportPolicySha256 = subject.destinations[0].transportPolicySha256;
  subject.destinations[1].destinationRef = "refs/heads/release";
  reidentify(subject, 1);
  assert.equal(createPushBatchSubject(subject).destinations.length, 2);
});
test("rejects duplicate endpoint/ref aliases and inconsistent policy for one remote", () => {
  const duplicate = batch();
  duplicate.destinations[1].remote = "mirror-alias";
  duplicate.destinations[1].endpointSha256 = duplicate.destinations[0].endpointSha256;
  duplicate.destinations[1].destinationRef = duplicate.destinations[0].destinationRef;
  reidentify(duplicate, 1);
  assert.throws(() => createPushBatchSubject(duplicate));
  const endpointDrift = batch();
  endpointDrift.destinations[1].remote = endpointDrift.destinations[0].remote;
  endpointDrift.destinations[1].endpointSha256 = sha("9");
  reidentify(endpointDrift, 1);
  assert.throws(() => createPushBatchSubject(endpointDrift));
  const policyDrift = batch();
  policyDrift.destinations[1].remote = policyDrift.destinations[0].remote;
  policyDrift.destinations[1].endpointSha256 = policyDrift.destinations[0].endpointSha256;
  policyDrift.destinations[1].transportPolicySha256 = sha("8");
  reidentify(policyDrift, 1);
  assert.throws(() => createPushBatchSubject(policyDrift));
});
test("rejects sparse arrays, null elements, bad OIDs, and Git-invalid refs", () => {
  const sparse = batch(); delete sparse.destinations[1]; assert.throws(() => createPushBatchSubject(sparse));
  const nullElement = batch(); nullElement.destinations[1] = null; assert.throws(() => createPushBatchSubject(nullElement));
  for (const ref of ["refs/heads/bad\u0000ref", "refs/heads/bad\u007fref", "refs/heads/has space", "refs/heads/bad..ref", "refs/heads/bad@{ref", "refs/heads/.hidden", "refs/heads/trailing.", "refs/heads/x.lock", "refs/heads/x?y", "refs/heads/x*y", "refs/heads/x[y", "refs/heads/x\\y", "refs/heads/x~y", "refs/tags/x", "refs/heads//x", "refs/heads/x/"]) { const subject = batch(); subject.destinations[0].destinationRef = ref; assert.throws(() => createPushBatchSubject(subject)); }
  const badOid = batch(); badOid.candidate.commit = oid("B"); assert.throws(() => createPushBatchSubject(badOid));
});
test("enforces destination bounds, ordering, candidate drift, and explicit inclusive/exclusive clock policy", () => {
  assert.equal(createPushBatchSubject(batch(32)).destinations.length, 32);
  assert.throws(() => createPushBatchSubject(batch(33)));
  const ordered = batch(); const reordered = batch(); reordered.destinations.reverse().forEach((member, ordinal) => { member.ordinal = ordinal; }); assert.notEqual(pushBatchSubjectSha256(ordered), pushBatchSubjectSha256(reordered));
  const drift = batch(); drift.destinations[0].sourceTree = oid("9"); reidentify(drift, 0); assert.throws(() => createPushBatchSubject(drift));
  const subject = batch(); assert.equal(validatePushBatchSubject({ subject }).code, "PUSH-BATCH-CLOCK-POLICY-REQUIRED"); assert.equal(valid(subject, "2026-09-19T09:59:59.999Z").code, "PUSH-BATCH-NOT-YET-VALID"); assert.equal(valid(subject, "2026-09-19T10:00:00.000Z").valid, true); assert.equal(valid(subject, "2026-09-19T11:00:00.000Z").code, "PUSH-BATCH-EXPIRED");
});
test("binds a closed selection exactly to the validated batch and member", () => {
  const subject = batch(); const subjectSha256 = pushBatchSubjectSha256(subject); const selection = { schema: "pipeline.push-batch-selection.v1", batchId: subjectSha256, subjectSha256, memberId: subject.destinations[0].memberId };
  assert.equal(validatePushBatchSelection({ selection, subject, now: "2026-09-19T10:30:00.000Z", clockPolicy: PUSH_BATCH_CLOCK_POLICY.ENFORCE_VALIDITY }).valid, true);
  for (const mutate of [(s) => { s.batchId = sha("0"); }, (s) => { s.subjectSha256 = sha("0"); }, (s) => { s.memberId = sha("0"); }, (s) => { s.extra = true; }]) { const altered = structuredClone(selection); mutate(altered); assert.equal(validatePushBatchSelection({ selection: altered, subject, now: "2026-09-19T10:30:00.000Z", clockPolicy: PUSH_BATCH_CLOCK_POLICY.ENFORCE_VALIDITY }).valid, false); }
});
