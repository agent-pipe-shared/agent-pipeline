// SPDX-License-Identifier: SUL-1.0
/**
 * Runner-neutral, fail-closed execution core for a signed push batch.
 *
 * Transport adapters observe and perform the native Git work. This module owns
 * the authorization binding, ordered stop-on-failure behavior, and the audit
 * sequence supplied to the external journal and governance outbox adapters.
 */
import { createHash } from "node:crypto";

import { verifyCriticalActionApprovalRequest } from "./critical-action-approval-request.mjs";
import { enqueueGovernanceExport } from "./governance-export-outbox.mjs";
import { canonical } from "./po-approval-proof.mjs";
import { PUSH_BATCH_CLOCK_POLICY, validatePushBatchSubject } from "./push-batch-contract.mjs";

export const PUSH_BATCH_AUDIT_SCHEMA = "pipeline.push-batch-audit.v1";
export const PUSH_BATCH_EXECUTION_SCHEMA = "pipeline.push-batch-execution.v1";
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const iso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const sha = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const fail = (code) => { const error = new Error("Push batch execution is invalid."); error.code = code; throw error; };

function validObservation(value, subject) {
  return exact(value, ["repositoryFingerprint", "candidate", "destinations"])
    && value.repositoryFingerprint === subject.repository.fingerprint
    && exact(value.candidate, ["commit", "tree"])
    && value.candidate.commit === subject.candidate.commit && value.candidate.tree === subject.candidate.tree
    && Array.isArray(value.destinations) && value.destinations.length === subject.destinations.length
    && value.destinations.every((item, ordinal) => exact(item, ["memberId", "endpointSha256", "remoteCommit"])
      && item.memberId === subject.destinations[ordinal].memberId && item.endpointSha256 === subject.destinations[ordinal].endpointSha256
      && (item.remoteCommit === null || OID.test(item.remoteCommit)));
}

function audit(subject, subjectSha256, member, at, state, detail) {
  if (!iso(at) || !["attempted", "pushed", "readback-verified", "failed"].includes(state)) fail("PUSH-BATCH-AUDIT-INPUT");
  const value = {
    schema: PUSH_BATCH_AUDIT_SCHEMA,
    batchId: subjectSha256,
    subjectSha256,
    memberId: member.memberId,
    ordinal: member.ordinal,
    occurredAt: at,
    state,
    detail,
  };
  return Object.freeze({ ...value, auditSha256: sha(value) });
}

function governanceProjection(record, { destinationProfile, policyRevision }) {
  if (typeof destinationProfile !== "string" || !SHA.test(policyRevision ?? "")) fail("PUSH-BATCH-OUTBOX-INPUT");
  return {
    schema: "pipeline.governance-export-event.v1",
    destinationEventId: sha({ schema: "pipeline.push-batch-governance-id.v1", auditSha256: record.auditSha256 }),
    destinationProfile,
    format: "pipeline.push-batch-audit.v1",
    policyRevision,
    sourceEventDigest: record.auditSha256,
    fields: { batchId: record.batchId, memberId: record.memberId, ordinal: record.ordinal, state: record.state },
  };
}

/**
 * Executes members only in their signed order. The journal callback is called
 * before the transport invocation and again with the exact result/readback.
 * A transport failure, preimage drift, journal failure or outbox failure ends
 * the batch immediately; later destinations are never attempted.
 */
export async function executePushBatch({ subject, request, trustPolicy, proof, now, observation, journal, outbox, exportProfile } = {}, dependencies = {}) {
  const validated = validatePushBatchSubject({ subject, now, clockPolicy: PUSH_BATCH_CLOCK_POLICY.ENFORCE_VALIDITY });
  if (!validated.valid) fail(validated.code);
  if (!validObservation(observation, validated.subject) || typeof journal !== "function" || typeof dependencies.push !== "function"
    || (outbox !== undefined && (exportProfile === undefined || typeof dependencies.persistOutbox !== "function"))) fail("PUSH-BATCH-EXECUTION-INPUT");
  const action = { kind: "push", subjectSha256: validated.subjectSha256, expiresAt: validated.subject.expiresAt };
  const approval = (dependencies.verifyApproval ?? verifyCriticalActionApprovalRequest)({ request, trustPolicy, proof, expectedCandidate: validated.subject.candidate, expectedAction: action, now });
  if (!approval?.verified || !SHA.test(approval.proofSha256 ?? "")) fail("PUSH-BATCH-APPROVAL");
  let nextOutbox = outbox;
  const records = [];
  for (const member of validated.subject.destinations) {
    const observed = observation.destinations[member.ordinal];
    if (observed.remoteCommit !== member.expectedRemoteCommit) {
      const record = audit(validated.subject, validated.subjectSha256, member, now, "failed", "remote-preimage-drift");
      await journal(record); records.push(record); return Object.freeze({ schema: PUSH_BATCH_EXECUTION_SCHEMA, status: "failed", subjectSha256: validated.subjectSha256, records: Object.freeze(records), outbox: nextOutbox });
    }
    const attempted = audit(validated.subject, validated.subjectSha256, member, now, "attempted", "fixed-git-push");
    await journal(attempted); records.push(attempted);
    let result;
    try { result = await dependencies.push({ remote: member.remote, sourceCommit: member.sourceCommit, destinationRef: member.destinationRef, expectedRemoteCommit: member.expectedRemoteCommit }); }
    catch { result = { pushed: false, remoteCommit: null }; }
    if (!exact(result, ["pushed", "remoteCommit"]) || typeof result.pushed !== "boolean" || (result.remoteCommit !== null && !OID.test(result.remoteCommit))) fail("PUSH-BATCH-TRANSPORT-RESULT");
    const state = result.pushed && result.remoteCommit === member.sourceCommit ? "readback-verified" : "failed";
    const record = audit(validated.subject, validated.subjectSha256, member, now, state, state === "readback-verified" ? "remote-readback-matched" : "push-or-readback-failed");
    await journal(record); records.push(record);
    if (state !== "readback-verified") return Object.freeze({ schema: PUSH_BATCH_EXECUTION_SCHEMA, status: "failed", subjectSha256: validated.subjectSha256, records: Object.freeze(records), outbox: nextOutbox });
    if (nextOutbox !== undefined) {
      nextOutbox = enqueueGovernanceExport(nextOutbox, governanceProjection(record, exportProfile));
      await dependencies.persistOutbox(nextOutbox);
    }
  }
  return Object.freeze({ schema: PUSH_BATCH_EXECUTION_SCHEMA, status: "readback-verified", subjectSha256: validated.subjectSha256, records: Object.freeze(records), outbox: nextOutbox });
}
