// SPDX-License-Identifier: SUL-1.0
/** Closed, transport-independent subject contract for a signed push batch. */
import { createHash } from "node:crypto";

import { criticalActionSubjectSha256 } from "./critical-action-approval-request.mjs";
import { canonical } from "./po-approval-proof.mjs";

export const PUSH_BATCH_SUBJECT_SCHEMA = "pipeline.push-batch-subject.v2";
export const PUSH_BATCH_SELECTION_SCHEMA = "pipeline.push-batch-selection.v1";
export const PUSH_BATCH_ORDERING = "listed-stop-on-non-success";
export const PUSH_BATCH_CLOCK_POLICY = Object.freeze({ ENFORCE_VALIDITY: "enforce-validity" });
const SHA = /^[a-f0-9]{64}$/u;
const OIDS = Object.freeze({ sha1: /^[a-f0-9]{40}$/u, sha256: /^[a-f0-9]{64}$/u });
const MAX_DESTINATIONS = 32;
const MAX_UTF8_BYTES = 4096;
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const text = (value) => typeof value === "string" && value.length > 0 && Buffer.byteLength(value, "utf8") <= MAX_UTF8_BYTES;
const sha = (value) => typeof value === "string" && SHA.test(value);
const iso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const oid = (value, objectFormat) => typeof value === "string" && OIDS[objectFormat]?.test(value);
const id = (value) => text(value) && /^[A-Za-z][A-Za-z0-9._-]{0,127}$/u.test(value);
const denseArray = (value) => Array.isArray(value) && Object.keys(value).length === value.length
  && Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean);
const memberDigest = (value) => createHash("sha256").update(`pipeline.push-batch-member-id.v2\0${canonical(value)}`).digest("hex");

// Equivalent to the Git refname restrictions applicable to full branch targets.
const branchRef = (value) => text(value) && value.startsWith("refs/heads/") && value.length > "refs/heads/".length
  && !/[\u0000-\u0020\u007f~^:?*\\\[]/u.test(value) && !value.includes("..") && !value.includes("@{") && !value.endsWith("/")
  && value.split("/").every((part) => part !== "" && part !== "." && part !== ".." && !part.startsWith(".") && !part.endsWith(".lock") && !part.endsWith("."));
const candidate = (value, objectFormat) => own(value, ["commit", "tree"])
  && oid(value.commit, objectFormat) && oid(value.tree, objectFormat) && value.commit !== value.tree;

export function pushBatchMemberId({ repositoryFingerprint, member } = {}) {
  if (!sha(repositoryFingerprint) || !own(member, ["remote", "endpointSha256", "transportPolicySha256", "destinationRef", "expectedRemoteCommit", "sourceCommit", "sourceTree"])
    || !text(member.remote) || !sha(member.endpointSha256) || !sha(member.transportPolicySha256) || !branchRef(member.destinationRef)
    || (member.expectedRemoteCommit !== null && typeof member.expectedRemoteCommit !== "string") || typeof member.sourceCommit !== "string" || typeof member.sourceTree !== "string") {
    throw new TypeError("push batch member identity input is invalid");
  }
  return memberDigest({ repositoryFingerprint, ...member });
}

function validMember(member, subject, ordinal, seen) {
  const format = subject.repository.objectFormat;
  if (!own(member, ["ordinal", "memberId", "remote", "endpointSha256", "transportPolicySha256", "destinationRef", "expectedRemoteCommit", "sourceCommit", "sourceTree"])
    || member.ordinal !== ordinal || !sha(member.memberId) || !text(member.remote) || !sha(member.endpointSha256)
    || !sha(member.transportPolicySha256) || !branchRef(member.destinationRef)
    || (member.expectedRemoteCommit !== null && !oid(member.expectedRemoteCommit, format))
    || !oid(member.sourceCommit, format) || !oid(member.sourceTree, format)
    || member.sourceCommit !== subject.candidate.commit || member.sourceTree !== subject.candidate.tree) return false;
  const identity = pushBatchMemberId({ repositoryFingerprint: subject.repository.fingerprint, member: {
    remote: member.remote, endpointSha256: member.endpointSha256, transportPolicySha256: member.transportPolicySha256,
    destinationRef: member.destinationRef, expectedRemoteCommit: member.expectedRemoteCommit,
    sourceCommit: member.sourceCommit, sourceTree: member.sourceTree,
  } });
  const target = `${member.endpointSha256}\0${member.destinationRef}`;
  const remotePolicy = `${member.endpointSha256}\0${member.transportPolicySha256}`;
  const priorRemotePolicy = seen.remotePolicies.get(member.remote);
  if (identity !== member.memberId || seen.ids.has(member.memberId) || seen.targets.has(target)
    || (priorRemotePolicy !== undefined && priorRemotePolicy !== remotePolicy)) return false;
  seen.ids.add(member.memberId);
  seen.targets.add(target);
  seen.remotePolicies.set(member.remote, remotePolicy);
  return true;
}

export function assertPushBatchSubject(subject) {
  const keys = ["schema", "repository", "candidate", "authority", "policy", "threatModel", "previewBindingSha256", "nonce", "createdAt", "expiresAt", "ordering", "destinations"];
  if (!own(subject, keys) || subject.schema !== PUSH_BATCH_SUBJECT_SCHEMA || subject.ordering !== PUSH_BATCH_ORDERING
    || !own(subject.repository, ["fingerprint", "objectFormat"]) || !sha(subject.repository.fingerprint) || !Object.hasOwn(OIDS, subject.repository.objectFormat)
    || !candidate(subject.candidate, subject.repository.objectFormat)
    || !own(subject.authority, ["featureId", "planSha256", "specSha256"]) || !id(subject.authority.featureId) || !sha(subject.authority.planSha256) || !sha(subject.authority.specSha256)
    || !own(subject.policy, ["manifestSha256", "proofPolicySha256", "destinationPolicySha256"]) || !sha(subject.policy.manifestSha256) || !sha(subject.policy.proofPolicySha256) || !sha(subject.policy.destinationPolicySha256)
    || !own(subject.threatModel, ["path", "sha256"]) || !text(subject.threatModel.path) || !sha(subject.threatModel.sha256)
    || !sha(subject.previewBindingSha256) || !text(subject.nonce) || !iso(subject.createdAt) || !iso(subject.expiresAt)
    || Date.parse(subject.expiresAt) <= Date.parse(subject.createdAt) || !denseArray(subject.destinations)
    || subject.destinations.length < 1 || subject.destinations.length > MAX_DESTINATIONS) throw new TypeError("push batch subject is invalid");
  const seen = { ids: new Set(), targets: new Set(), remotePolicies: new Map() };
  if (!subject.destinations.every((member, ordinal) => validMember(member, subject, ordinal, seen))) throw new TypeError("push batch destination is invalid");
  return structuredClone(subject);
}

/** Producer-facing constructor: accepts only an already closed subject shape. */
export function createPushBatchSubject(subject) { return assertPushBatchSubject(subject); }

export function pushBatchSubjectSha256(subject) {
  const closedSubject = assertPushBatchSubject(subject);
  return criticalActionSubjectSha256({ kind: "push", candidate: closedSubject.candidate, subject: closedSubject });
}

/** Consumer-facing validation requires an explicit clock policy and never renews expiry. */
export function validatePushBatchSubject({ subject, now, clockPolicy } = {}) {
  let closedSubject;
  try { closedSubject = assertPushBatchSubject(subject); } catch { return { valid: false, code: "PUSH-BATCH-SUBJECT-INVALID" }; }
  if (clockPolicy !== PUSH_BATCH_CLOCK_POLICY.ENFORCE_VALIDITY) return { valid: false, code: "PUSH-BATCH-CLOCK-POLICY-REQUIRED" };
  if (!iso(now)) return { valid: false, code: "PUSH-BATCH-CLOCK-INVALID" };
  if (Date.parse(now) < Date.parse(closedSubject.createdAt)) return { valid: false, code: "PUSH-BATCH-NOT-YET-VALID" };
  if (Date.parse(now) >= Date.parse(closedSubject.expiresAt)) return { valid: false, code: "PUSH-BATCH-EXPIRED" };
  return { valid: true, code: "PUSH-BATCH-SUBJECT-VALID", subject: closedSubject, subjectSha256: pushBatchSubjectSha256(closedSubject) };
}

/** Resolves the closed selection against one validated, unexpired batch subject. */
export function validatePushBatchSelection({ selection, subject, now, clockPolicy } = {}) {
  const validated = validatePushBatchSubject({ subject, now, clockPolicy });
  if (!validated.valid) return validated;
  if (!own(selection, ["schema", "batchId", "subjectSha256", "memberId"])
    || selection.schema !== PUSH_BATCH_SELECTION_SCHEMA || !sha(selection.batchId) || !sha(selection.subjectSha256) || !sha(selection.memberId)
    || selection.batchId !== validated.subjectSha256 || selection.subjectSha256 !== validated.subjectSha256) {
    return { valid: false, code: "PUSH-BATCH-SELECTION-INVALID" };
  }
  const member = validated.subject.destinations.find((destination) => destination.memberId === selection.memberId);
  return member
    ? { valid: true, code: "PUSH-BATCH-SELECTION-VALID", batchId: selection.batchId, subjectSha256: validated.subjectSha256, member: structuredClone(member) }
    : { valid: false, code: "PUSH-BATCH-SELECTION-MEMBER-UNKNOWN" };
}
