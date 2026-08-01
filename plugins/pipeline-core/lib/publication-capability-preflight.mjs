// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";

export const PUBLICATION_CAPABILITY_PREFLIGHT_SCHEMA = "pipeline.publication-capability-preflight.v1";
export const CAPABILITY_STATES = Object.freeze(["available", "unavailable", "insufficient", "not-required"]);

const SHA256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const REF = /^refs\/heads\/[A-Za-z0-9._/-]+$/u;
const CELL_KEYS = ["status", "evidenceSha256"];
const REASONS = Object.freeze({
  credential: "credentials-unavailable",
  permissions: "ref-permission-insufficient",
  workflowUpdate: "workflow-permission-missing",
  policy: "repository-policy-rejected",
  executor: "executor-unavailable",
});

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys, label) => {
  if (!object(value)) throw new TypeError(`${label} invalid`);
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} keys invalid`);
};
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");

function validateCell(cell, label, required) {
  exact(cell, CELL_KEYS, label);
  if (!CAPABILITY_STATES.includes(cell.status) || !SHA256.test(cell.evidenceSha256 ?? "")) throw new TypeError(`${label} invalid`);
  if (required && cell.status === "not-required") throw new TypeError(`${label} is required`);
}

function payload(record) { const { recordSha256, ...rest } = record; return rest; }
export function publicationCapabilityPreflightDigest(record) {
  return sha256(`${PUBLICATION_CAPABILITY_PREFLIGHT_SCHEMA}\0${canonical(payload(record))}`);
}

export function createPublicationCapabilityPreflight(input) {
  exact(input, [
    "preflightId", "candidate", "remote", "destinationRef", "remotePreimage",
    "credential", "permissions", "workflowUpdate", "policy", "executor",
  ], "publication capability preflight input");
  if (typeof input.preflightId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(input.preflightId)) throw new TypeError("preflightId invalid");
  exact(input.candidate, ["commit", "tree"], "candidate");
  if (!OID.test(input.candidate.commit ?? "") || !OID.test(input.candidate.tree ?? "")) throw new TypeError("candidate invalid");
  exact(input.remote, ["name", "fingerprint", "status", "evidenceSha256"], "remote");
  if (typeof input.remote.name !== "string" || !/^[A-Za-z0-9._-]{1,80}$/u.test(input.remote.name)
    || !SHA256.test(input.remote.fingerprint ?? "")) throw new TypeError("remote invalid");
  validateCell({ status: input.remote.status, evidenceSha256: input.remote.evidenceSha256 }, "remote", true);
  if (!REF.test(input.destinationRef ?? "") || input.destinationRef.includes("..") || input.destinationRef.includes("*")) throw new TypeError("destinationRef invalid");
  if (input.remotePreimage !== null && !OID.test(input.remotePreimage ?? "")) throw new TypeError("remotePreimage invalid");
  validateCell(input.credential, "credential", true);
  validateCell(input.permissions, "permissions", true);
  validateCell(input.workflowUpdate, "workflowUpdate", false);
  validateCell(input.policy, "policy", true);
  validateCell(input.executor, "executor", true);
  const reasons = [];
  for (const key of ["remote", "credential", "permissions", "workflowUpdate", "policy", "executor"]) {
    const cell = input[key];
    if (!cell || !["available", "not-required"].includes(cell.status)) reasons.push(key === "remote" ? (cell?.status === "insufficient" ? "ambiguous-endpoint" : "transport-unavailable") : REASONS[key]);
  }
  const body = {
    schema: PUBLICATION_CAPABILITY_PREFLIGHT_SCHEMA,
    preflightId: input.preflightId,
    candidate: structuredClone(input.candidate), remote: structuredClone(input.remote),
    destinationRef: input.destinationRef, remotePreimage: input.remotePreimage,
    credential: structuredClone(input.credential), permissions: structuredClone(input.permissions),
    workflowUpdate: structuredClone(input.workflowUpdate), policy: structuredClone(input.policy),
    executor: structuredClone(input.executor),
    status: reasons.length === 0 ? "ready" : "blocked", reasons,
  };
  return Object.freeze({ ...body, recordSha256: publicationCapabilityPreflightDigest({ ...body, recordSha256: "0".repeat(64) }) });
}

export function validatePublicationCapabilityPreflight(record) {
  exact(record, [
    "schema", "preflightId", "candidate", "remote", "destinationRef", "remotePreimage",
    "credential", "permissions", "workflowUpdate", "policy", "executor",
    "status", "reasons", "recordSha256",
  ], "publication capability preflight");
  if (record.schema !== PUBLICATION_CAPABILITY_PREFLIGHT_SCHEMA || !SHA256.test(record.recordSha256 ?? "")) throw new TypeError("publication capability preflight invalid");
  const expected = createPublicationCapabilityPreflight({
    preflightId: record.preflightId, candidate: record.candidate, remote: record.remote,
    destinationRef: record.destinationRef, remotePreimage: record.remotePreimage,
    credential: record.credential, permissions: record.permissions,
    workflowUpdate: record.workflowUpdate, policy: record.policy, executor: record.executor,
  });
  if (canonical(record) !== canonical(expected)) throw new TypeError("publication capability preflight derivation invalid");
  return true;
}
