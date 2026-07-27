// SPDX-License-Identifier: SUL-1.0

/**
 * Closed, provider-neutral Git transport records.  This module never invokes
 * Git or a network client: adapters must obtain authority, perform the narrow
 * operation, and feed its sanitized readback back into this state machine.
 */
import { createHash } from "node:crypto";
import { canonicalForgeJson } from "./forge-capability.mjs";

export const GIT_TRANSPORT_SCHEMA = "pipeline.git-transport-operation.v1";

const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const REF = /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,240}$/u;
const ROOT_KEYS = ["schema", "operationId", "provider", "remote", "operation", "sourceCommit", "destinationRef", "expectedRemoteOid", "preview", "confirmation", "remoteReceipt", "readback", "state", "previousSha256", "recordSha256"];
const STATES = new Set(["requested", "previewed", "confirmed", "applied-unverified", "readback-verified", "rejected", "expired", "failed", "mismatch", "unknown"]);
const OPERATIONS = new Set(["ref.fetch", "branch.publish"]);

const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const clone = (value) => structuredClone(value);
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const digest = (value) => createHash("sha256").update(`${GIT_TRANSPORT_SCHEMA}\0${canonicalForgeJson(value)}`, "utf8").digest("hex");

function validRemote(value, provider) {
  return exact(value, ["baseUrlClass", "remoteUrlSha256", "projectCoordinatesSha256"])
    && ((provider === "github" && value.baseUrlClass === "github-com")
      || (provider === "gitlab" && ["gitlab-com", "self-managed"].includes(value.baseUrlClass)))
    && SHA256.test(value.remoteUrlSha256 ?? "") && SHA256.test(value.projectCoordinatesSha256 ?? "");
}
function validRef(value) {
  return typeof value === "string" && REF.test(value)
    && !value.includes("//") && !value.includes("..") && !value.endsWith(".") && !value.endsWith("/");
}
function previewDigest(record, expiresAt) {
  return digest({ operationId: record.operationId, provider: record.provider, remote: record.remote, operation: record.operation, sourceCommit: record.sourceCommit, destinationRef: record.destinationRef, expectedRemoteOid: record.expectedRemoteOid, expiresAt });
}
function seal(record) {
  const next = clone(record); next.recordSha256 = "0".repeat(64); next.recordSha256 = transportDigest(next); return freeze(next);
}

export function transportDigest(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const { recordSha256, ...semantic } = record;
  return digest(semantic);
}

function phaseCode(record, checkDigest = true) {
  if (!exact(record, ROOT_KEYS) || record.schema !== GIT_TRANSPORT_SCHEMA || !SAFE_ID.test(record.operationId ?? "")
    || !["github", "gitlab"].includes(record.provider) || !validRemote(record.remote, record.provider)
    || !OPERATIONS.has(record.operation) || !OID.test(record.sourceCommit ?? "") || !validRef(record.destinationRef)
    || !(record.expectedRemoteOid === null || OID.test(record.expectedRemoteOid ?? ""))
    || !STATES.has(record.state) || !(record.previousSha256 === null || SHA256.test(record.previousSha256 ?? ""))
    || !SHA256.test(record.recordSha256 ?? "")) return "SHAPE:git-transport";
  if (record.operation === "branch.publish" && record.expectedRemoteOid !== null) return "AUTHORITY:branch-must-be-new";
  if (record.operation === "ref.fetch" && record.expectedRemoteOid === null) return "AUTHORITY:fetch-needs-exact-ref";
  const p = record.preview; const c = record.confirmation; const r = record.remoteReceipt; const b = record.readback;
  if (!(p === null || (exact(p, ["previewSha256", "expiresAt"]) && SHA256.test(p.previewSha256 ?? "") && Number.isSafeInteger(p.expiresAt) && p.expiresAt >= 0))) return "SHAPE:transport-preview";
  if (!(c === null || (exact(c, ["authoritySha256", "previewSha256", "confirmedAt"]) && SHA256.test(c.authoritySha256 ?? "") && SHA256.test(c.previewSha256 ?? "") && Number.isSafeInteger(c.confirmedAt) && c.confirmedAt >= 0))) return "SHAPE:transport-confirmation";
  if (!(r === null || (exact(r, ["providerReceiptSha256", "acceptedAt", "status"]) && SHA256.test(r.providerReceiptSha256 ?? "") && Number.isSafeInteger(r.acceptedAt) && r.acceptedAt >= 0 && ["accepted", "rejected", "unknown"].includes(r.status)))) return "SHAPE:transport-receipt";
  if (!(b === null || (exact(b, ["observedOid", "expectedOid", "status", "observedAt"]) && OID.test(b.observedOid ?? "") && OID.test(b.expectedOid ?? "") && Number.isSafeInteger(b.observedAt) && b.observedAt >= 0 && ["matching", "mismatch", "unknown"].includes(b.status)))) return "SHAPE:transport-readback";
  if (p && (record.operation !== "branch.publish" || p.previewSha256 !== previewDigest(record, p.expiresAt))) return "BOUND:transport-preview";
  if (c && (!p || c.previewSha256 !== p.previewSha256 || c.confirmedAt >= p.expiresAt)) return "BOUND:transport-confirmation";
  if (r && ((record.operation === "branch.publish" && !c) || (c && r.acceptedAt < c.confirmedAt))) return "BOUND:transport-receipt";
  if (b && (!r || b.observedAt < r.acceptedAt)) return "BOUND:transport-readback";
  const needPreview = record.operation === "branch.publish";
  const has = { p: p !== null, c: c !== null, r: r !== null, b: b !== null };
  const expectedOid = record.operation === "branch.publish" ? record.sourceCommit : record.expectedRemoteOid;
  if (b && b.expectedOid !== expectedOid) return "BOUND:transport-readback";
  const validState = (
    record.state === "requested" && !has.p && !has.c && !has.r && !has.b
  ) || (record.state === "previewed" && needPreview && has.p && !has.c && !has.r && !has.b
  ) || (record.state === "confirmed" && needPreview && has.p && has.c && !has.r && !has.b
  ) || (record.state === "applied-unverified" && has.r && r.status === "accepted" && !has.b && (!needPreview || has.c)
  ) || (record.state === "readback-verified" && has.r && has.b && r.status === "accepted" && b.status === "matching" && b.observedOid === b.expectedOid && (!needPreview || has.c)
  ) || (record.state === "rejected" && !has.c && !has.r && !has.b
  ) || (record.state === "expired" && has.p && !has.c && !has.r && !has.b
  ) || (record.state === "failed" && has.r && r.status === "rejected" && !has.b && (!needPreview || has.c)
  ) || (record.state === "mismatch" && has.r && has.b && b.status === "mismatch" && b.observedOid !== b.expectedOid && (!needPreview || has.c)
  ) || (record.state === "unknown" && has.r && r.status === "unknown" && (!needPreview || has.c));
  if (!validState) return "CONFLICT:transport-state";
  if (checkDigest && transportDigest(record) !== record.recordSha256) return "CONFLICT:transport-digest";
  return null;
}

export function validateGitTransport(record) { const code = phaseCode(record); return code ? { ok: false, code } : { ok: true, code: null }; }
export function createGitTransportRequest(input) {
  if (!exact(input, ["operationId", "provider", "remote", "operation", "sourceCommit", "destinationRef", "expectedRemoteOid"])) throw new Error("SHAPE:transport-request");
  const record = { schema: GIT_TRANSPORT_SCHEMA, ...clone(input), preview: null, confirmation: null, remoteReceipt: null, readback: null, state: "requested", previousSha256: null, recordSha256: "0".repeat(64) };
  const code = phaseCode(record, false); if (code) throw new Error(code); return seal(record);
}
export function previewGitBranch(record, { expiresAt }) {
  if (!validateGitTransport(record).ok || record.operation !== "branch.publish" || record.state !== "requested" || !Number.isSafeInteger(expiresAt) || expiresAt < 0) return { ok: false, code: "AUTHORITY:transport-preview", transport: null };
  const next = clone(record); next.preview = { previewSha256: previewDigest(record, expiresAt), expiresAt }; next.state = "previewed"; next.previousSha256 = record.recordSha256; return { ok: true, code: null, transport: seal(next) };
}
export function confirmGitBranch(record, confirmation) {
  if (!validateGitTransport(record).ok || record.operation !== "branch.publish" || record.state !== "previewed" || !exact(confirmation, ["authoritySha256", "previewSha256", "confirmedAt"])) return { ok: false, code: "AUTHORITY:transport-confirmation", transport: null };
  if (confirmation.previewSha256 !== record.preview.previewSha256 || !SHA256.test(confirmation.authoritySha256 ?? "") || !Number.isSafeInteger(confirmation.confirmedAt) || confirmation.confirmedAt >= record.preview.expiresAt) return { ok: false, code: "BOUND:transport-confirmation", transport: null };
  const next = clone(record); next.confirmation = clone(confirmation); next.state = "confirmed"; next.previousSha256 = record.recordSha256; return { ok: true, code: null, transport: seal(next) };
}
export function applyGitTransport(record, receipt) {
  if (!validateGitTransport(record).ok || !["confirmed", "requested"].includes(record.state) || !exact(receipt, ["providerReceiptSha256", "acceptedAt", "status"])) return { ok: false, code: "AUTHORITY:transport-apply", transport: null };
  if (!SHA256.test(receipt.providerReceiptSha256 ?? "") || !Number.isSafeInteger(receipt.acceptedAt) || receipt.acceptedAt < 0 || !["accepted", "rejected", "unknown"].includes(receipt.status)) return { ok: false, code: "SHAPE:transport-receipt", transport: null };
  const next = clone(record); next.remoteReceipt = clone(receipt); next.previousSha256 = record.recordSha256; next.state = receipt.status === "accepted" ? "applied-unverified" : receipt.status === "rejected" ? "failed" : "unknown"; return { ok: true, code: null, transport: seal(next) };
}
export function readbackGitTransport(record, readback) {
  if (!validateGitTransport(record).ok || record.state !== "applied-unverified" || !exact(readback, ["observedOid", "expectedOid", "status", "observedAt"])) return { ok: false, code: "AUTHORITY:transport-readback", transport: null };
  const expectedOid = record.operation === "branch.publish" ? record.sourceCommit : record.expectedRemoteOid;
  if (!OID.test(readback.observedOid ?? "") || readback.expectedOid !== expectedOid || !Number.isSafeInteger(readback.observedAt) || readback.observedAt < record.remoteReceipt.acceptedAt || !["matching", "mismatch", "unknown"].includes(readback.status)) return { ok: false, code: "BOUND:transport-readback", transport: null };
  const next = clone(record); next.readback = clone(readback); next.previousSha256 = record.recordSha256; next.state = readback.status === "matching" && readback.observedOid === expectedOid ? "readback-verified" : readback.status === "mismatch" ? "mismatch" : "unknown"; return { ok: true, code: null, transport: seal(next) };
}
