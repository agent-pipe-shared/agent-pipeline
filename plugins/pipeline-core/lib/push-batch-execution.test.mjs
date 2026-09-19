// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

import { createGovernanceExportOutbox } from "./governance-export-outbox.mjs";
import { executePushBatch } from "./push-batch-execution.mjs";
import { pushBatchMemberId, pushBatchSubjectSha256 } from "./push-batch-contract.mjs";

const sha = (char) => char.repeat(64); const oid = (char) => char.repeat(40); const now = "2026-09-19T10:30:00.000Z";
function subject() {
  const value = { schema: "pipeline.push-batch-subject.v2", repository: { fingerprint: sha("a"), objectFormat: "sha1" }, candidate: { commit: oid("b"), tree: oid("c") }, authority: { featureId: "nova", planSha256: sha("d"), specSha256: sha("e") }, policy: { manifestSha256: sha("f"), proofPolicySha256: sha("1"), destinationPolicySha256: sha("2") }, threatModel: { path: "threat-model.json", sha256: sha("3") }, previewBindingSha256: sha("4"), nonce: "preview-1", createdAt: "2026-09-19T10:00:00.000Z", expiresAt: "2026-09-19T11:00:00.000Z", ordering: "listed-stop-on-non-success", destinations: [] };
  for (let ordinal = 0; ordinal < 2; ordinal += 1) { const member = { remote: `origin-${ordinal}`, endpointSha256: sha(String(ordinal + 5)), transportPolicySha256: sha("7"), destinationRef: `refs/heads/branch-${ordinal}`, expectedRemoteCommit: null, sourceCommit: value.candidate.commit, sourceTree: value.candidate.tree }; value.destinations.push({ ordinal, memberId: pushBatchMemberId({ repositoryFingerprint: value.repository.fingerprint, member }), ...member }); }
  return value;
}
function input(value) { return { subject: value, now, request: {}, trustPolicy: {}, proof: {}, observation: { repositoryFingerprint: value.repository.fingerprint, candidate: value.candidate, destinations: value.destinations.map((member) => ({ memberId: member.memberId, endpointSha256: member.endpointSha256, remoteCommit: null })) } }; }
const verified = () => ({ verified: true, proofSha256: sha("9") });

test("journals attempt and verified readback in signed order, then offers successful members to the outbox", async () => {
  const value = subject(); const rows = []; const calls = []; const outbox = createGovernanceExportOutbox({ destinationProfile: "governance", policyRevision: sha("8") });
  const persisted = []; const result = await executePushBatch({ ...input(value), journal: async (row) => rows.push(row), outbox, exportProfile: { destinationProfile: "governance", policyRevision: sha("8") } }, { verifyApproval: verified, push: async (member) => { calls.push(member.destinationRef); return { pushed: true, remoteCommit: member.sourceCommit }; }, persistOutbox: async (next) => persisted.push(next) });
  assert.equal(result.status, "readback-verified"); assert.deepEqual(calls, ["refs/heads/branch-0", "refs/heads/branch-1"]); assert.deepEqual(rows.map((row) => row.state), ["attempted", "readback-verified", "attempted", "readback-verified"]); assert.equal(result.outbox.entries.length, 2); assert.equal(persisted.length, 2); assert.equal(result.subjectSha256, pushBatchSubjectSha256(value));
});
test("journals a preimage failure and never attempts a later destination", async () => {
  const value = subject(); const rows = []; const data = input(value); data.observation.destinations[0].remoteCommit = oid("d"); let invoked = 0;
  const result = await executePushBatch({ ...data, journal: async (row) => rows.push(row) }, { verifyApproval: verified, push: async () => { invoked += 1; return { pushed: true, remoteCommit: value.candidate.commit }; } });
  assert.equal(result.status, "failed"); assert.equal(invoked, 0); assert.deepEqual(rows.map((row) => row.state), ["failed"]);
});
test("stops after a failed first push and preserves the prior attempt record", async () => {
  const value = subject(); const rows = []; let invoked = 0;
  const result = await executePushBatch({ ...input(value), journal: async (row) => rows.push(row) }, { verifyApproval: verified, push: async () => { invoked += 1; return { pushed: false, remoteCommit: null }; } });
  assert.equal(result.status, "failed"); assert.equal(invoked, 1); assert.deepEqual(rows.map((row) => row.state), ["attempted", "failed"]);
});
