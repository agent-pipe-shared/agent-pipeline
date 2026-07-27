#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Nova A6 deterministic release eligibility reducer.
 *
 * This module deliberately observes no repository, remote, clock, credential,
 * consent text, or final-gate result.  Its caller supplies closed, bounded
 * observations.  `ready` therefore means only that the candidate is eligible
 * to begin independently operated final gates; it is never a release result.
 */
import { createHash } from "node:crypto";

export const RELEASE_PREFLIGHT_SCHEMA = "pipeline.release-preflight.v1";
export const RELEASE_PREFLIGHT_EXTENSION_SCHEMA = "pipeline.release-preflight-extension-input.v1";

const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u;
const PATH = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9._@+\/-]{1,240}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const DOCUMENTS = Object.freeze(["prd", "spec", "acceptance", "result"]);
const FINAL_GATES = Object.freeze(["verify", "security", "critic", "remote", "human"]);

export class ReleasePreflightError extends Error {
  constructor(code, message) { super(message); this.name = "ReleasePreflightError"; this.code = code; }
}

const fail = (code, message) => { throw new ReleasePreflightError(code, message); };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys, label) => {
  if (!object(value)) fail("RPF-SHAPE", `${label} must be an object`);
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail("RPF-SHAPE", `${label} has an unexpected field set`);
};
const digest = (value, label) => { if (typeof value !== "string" || !SHA256.test(value)) fail("RPF-DIGEST", `${label} must be a sha256 digest`); return value; };
const oid = (value, label) => { if (typeof value !== "string" || !OID.test(value)) fail("RPF-OID", `${label} must be an object ID`); return value; };
const path = (value, label) => { if (typeof value !== "string" || !PATH.test(value)) fail("RPF-PATH", `${label} must be a normalized repository-relative path`); return value; };
const iso = (value, label) => { if (typeof value !== "string" || !ISO.test(value) || !Number.isFinite(Date.parse(value))) fail("RPF-TIME", `${label} must be a canonical UTC date-time`); return value; };

/** Canonical bytes are stable across callers and are used only for record binding. */
export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isSafeInteger(value)) throw new TypeError("canonical JSON accepts safe integers only"); return String(value); }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!object(value)) throw new TypeError("canonical JSON accepts plain JSON values only");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
export function sha256(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }

function validateCandidate(value, label) {
  exact(value, ["commit", "tree"], label);
  oid(value.commit, `${label}.commit`); oid(value.tree, `${label}.tree`);
}
function validateVersion(value) {
  exact(value, ["candidateVersion", "decisionId", "decisionSha256", "targetVersion"], "version");
  digest(value.decisionId, "version.decisionId"); digest(value.decisionSha256, "version.decisionSha256");
  if (typeof value.targetVersion !== "string" || !VERSION.test(value.targetVersion)) fail("RPF-VERSION", "version.targetVersion must be stable SemVer");
  if (typeof value.candidateVersion !== "string" || !VERSION.test(value.candidateVersion)) fail("RPF-VERSION", "version.candidateVersion must be stable SemVer");
}
function validateRepository(value) {
  exact(value, ["clean", "headCommit", "headTree"], "repository");
  if (typeof value.clean !== "boolean") fail("RPF-REPOSITORY", "repository.clean must be boolean");
  oid(value.headCommit, "repository.headCommit"); oid(value.headTree, "repository.headTree");
}
function validateDocumentation(value) {
  exact(value, DOCUMENTS, "documentation");
  for (const kind of DOCUMENTS) {
    const document = value[kind]; exact(document, ["path", "sha256"], `documentation.${kind}`);
    path(document.path, `documentation.${kind}.path`); digest(document.sha256, `documentation.${kind}.sha256`);
  }
  const paths = DOCUMENTS.map((kind) => value[kind].path);
  if (new Set(paths).size !== paths.length) fail("RPF-DOCUMENTATION", "documentation destinations must be distinct");
}
function validateLifecycle(value) {
  exact(value, ["featureId", "manifestPath", "manifestSha256", "status"], "lifecycle");
  if (typeof value.featureId !== "string" || value.featureId.length === 0 || /[\0\r\n]/u.test(value.featureId)) fail("RPF-LIFECYCLE", "lifecycle.featureId is invalid");
  path(value.manifestPath, "lifecycle.manifestPath"); digest(value.manifestSha256, "lifecycle.manifestSha256");
  if (value.status !== "prepared") fail("RPF-LIFECYCLE", "lifecycle.status must be prepared");
}
function validateRetention(value, documentation) {
  exact(value, ["policySha256", "records"], "retention"); digest(value.policySha256, "retention.policySha256");
  if (!Array.isArray(value.records) || value.records.length !== DOCUMENTS.length) fail("RPF-RETENTION", "retention.records must contain one entry per durable document");
  const expected = new Set(DOCUMENTS.map((kind) => documentation[kind].path)); const seen = new Set();
  for (const [index, record] of value.records.entries()) {
    exact(record, ["archiveDigest", "archiveProvenanceSha256", "classification", "path", "retentionClass"], `retention.records[${index}]`);
    path(record.path, `retention.records[${index}].path`);
    if (!expected.has(record.path) || seen.has(record.path)) fail("RPF-RETENTION", "retention records must exactly cover durable documentation destinations");
    seen.add(record.path);
    if (!["public", "private"].includes(record.classification)) fail("RPF-CLASSIFICATION", "retention classification must be public or private");
    if (!["active", "archive"].includes(record.retentionClass)) fail("RPF-RETENTION", "retention class must be active or archive");
    const archivePresent = record.archiveDigest !== null || record.archiveProvenanceSha256 !== null;
    if (record.retentionClass === "archive") {
      digest(record.archiveDigest, "archive digest"); digest(record.archiveProvenanceSha256, "archive provenance");
    } else if (archivePresent) fail("RPF-RETENTION", "active retention cannot claim archive evidence");
  }
}
function validateConsent(value) {
  exact(value, ["authoritySha256", "decisionId", "evaluatedAt", "expiresAt", "status"], "consent");
  digest(value.authoritySha256, "consent.authoritySha256"); digest(value.decisionId, "consent.decisionId");
  const evaluated = Date.parse(iso(value.evaluatedAt, "consent.evaluatedAt")); const expiry = Date.parse(iso(value.expiresAt, "consent.expiresAt"));
  if (expiry < evaluated) fail("RPF-CONSENT", "consent expiry precedes its bounded readback");
  if (!["approved", "declined", "expired"].includes(value.status)) fail("RPF-CONSENT", "consent.status is invalid");
}
function validateGg03(value) {
  exact(value, ["binding", "required"], "gates.gg03");
  if (typeof value.required !== "boolean") fail("RPF-GG03", "gates.gg03.required must be boolean");
  if (!value.required) { if (value.binding !== null) fail("RPF-GG03", "an unrequired GG-03 binding must be null"); return; }
  exact(value.binding, ["authoritySha256", "candidateCommit", "candidateTree", "evidenceSha256", "operation", "schema"], "gates.gg03.binding");
  if (value.binding.schema !== "pipeline.gg-03-binding.v1" || value.binding.operation !== "protected-main-fast-forward") fail("RPF-GG03", "GG-03 binding is not an exact protected-main fast-forward binding");
  oid(value.binding.candidateCommit, "gates.gg03.binding.candidateCommit"); oid(value.binding.candidateTree, "gates.gg03.binding.candidateTree");
  digest(value.binding.authoritySha256, "gates.gg03.binding.authoritySha256"); digest(value.binding.evidenceSha256, "gates.gg03.binding.evidenceSha256");
}
function validateGates(value) {
  exact(value, ["gg03", "inventory"], "gates"); validateGg03(value.gg03);
  if (!Array.isArray(value.inventory) || value.inventory.length !== FINAL_GATES.length) fail("RPF-GATES", "gates.inventory must register every final gate exactly once");
  const seen = new Set();
  for (const [index, gate] of value.inventory.entries()) {
    exact(gate, ["id", "kind", "status"], `gates.inventory[${index}]`);
    if (!FINAL_GATES.includes(gate.id) || seen.has(gate.id)) fail("RPF-GATES", "gate inventory has an unknown or duplicate gate");
    seen.add(gate.id);
    const expectedKind = ["remote", "human"].includes(gate.id) ? "external" : "local-final";
    if (gate.kind !== expectedKind || gate.status !== "pending") fail("RPF-GATES", "gate inventory must retain pending local-final and external gates separately");
  }
}
function validateExtensions(value) {
  exact(value, ["registrySha256", "requirements", "schema", "status"], "extensions");
  if (value.schema !== RELEASE_PREFLIGHT_EXTENSION_SCHEMA || !["none", "registered"].includes(value.status) || !Array.isArray(value.requirements)) fail("RPF-EXTENSION", "extension input is invalid");
  if (value.status === "none") { if (value.registrySha256 !== null || value.requirements.length !== 0) fail("RPF-EXTENSION", "empty extension input cannot carry a registry or requirements"); return; }
  digest(value.registrySha256, "extensions.registrySha256");
  const identifiers = [];
  for (const [index, requirement] of value.requirements.entries()) {
    exact(requirement, ["id", "sha256", "status"], `extensions.requirements[${index}]`);
    if (typeof requirement.id !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(requirement.id) || requirement.status !== "accepted") fail("RPF-EXTENSION", "extension requirements must be accepted opaque identifiers");
    digest(requirement.sha256, `extensions.requirements[${index}].sha256`); identifiers.push(requirement.id);
  }
  if (identifiers.length === 0 || new Set(identifiers).size !== identifiers.length || identifiers.some((id, index) => index > 0 && identifiers[index - 1] >= id)) fail("RPF-EXTENSION", "registered extensions require distinct lexical opaque identifiers");
}

function recordPayload(record) { const { recordSha256, ...payload } = record; return payload; }
export function releasePreflightRecordSha256(record) { return sha256(`${RELEASE_PREFLIGHT_SCHEMA}\0${canonicalJson(recordPayload(record))}`); }

/**
 * Evaluate fully supplied facts.  Invalid input is rejected rather than
 * converted into a false-success report; valid but incomplete facts produce
 * stable local blocker codes.
 */
export function createReleasePreflight(input) {
  exact(input, ["base", "candidate", "consent", "documentation", "extensions", "gates", "lifecycle", "preflightId", "repository", "retention", "version"], "release preflight input");
  if (typeof input.preflightId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(input.preflightId)) fail("RPF-ID", "preflightId is invalid");
  validateCandidate(input.candidate, "candidate"); validateCandidate(input.base, "base"); validateVersion(input.version); validateRepository(input.repository);
  validateDocumentation(input.documentation); validateLifecycle(input.lifecycle); validateRetention(input.retention, input.documentation);
  validateConsent(input.consent); validateGates(input.gates); validateExtensions(input.extensions);

  const reasons = [];
  if (input.candidate.commit === input.base.commit || input.candidate.tree === input.base.tree) reasons.push("candidate-base-drift");
  if (input.repository.headCommit !== input.candidate.commit || input.repository.headTree !== input.candidate.tree) reasons.push("candidate-repository-drift");
  if (!input.repository.clean) reasons.push("repository-not-clean");
  if (input.version.candidateVersion !== input.version.targetVersion) reasons.push("version-decision-mismatch");
  if (input.consent.status !== "approved") reasons.push("consent-not-approved");
  if (input.gates.gg03.required && (input.gates.gg03.binding.candidateCommit !== input.candidate.commit || input.gates.gg03.binding.candidateTree !== input.candidate.tree)) reasons.push("gg03-candidate-mismatch");
  const status = reasons.length === 0 ? "ready" : "blocked";
  const result = {
    schema: RELEASE_PREFLIGHT_SCHEMA,
    preflightId: input.preflightId,
    candidate: structuredClone(input.candidate),
    base: structuredClone(input.base),
    version: structuredClone(input.version),
    repository: structuredClone(input.repository),
    documentation: structuredClone(input.documentation),
    lifecycle: structuredClone(input.lifecycle),
    retention: structuredClone(input.retention),
    consent: structuredClone(input.consent),
    gates: structuredClone(input.gates),
    extensions: structuredClone(input.extensions),
    status,
    reasons,
    recordSha256: "0".repeat(64),
  };
  result.recordSha256 = releasePreflightRecordSha256(result);
  return Object.freeze(result);
}

export function validateReleasePreflight(record) {
  exact(record, ["base", "candidate", "consent", "documentation", "extensions", "gates", "lifecycle", "preflightId", "recordSha256", "reasons", "repository", "retention", "schema", "status", "version"], "release preflight record");
  if (record.schema !== RELEASE_PREFLIGHT_SCHEMA) fail("RPF-SCHEMA", "release preflight schema is invalid");
  const expected = createReleasePreflight({
    preflightId: record.preflightId, candidate: record.candidate, base: record.base, version: record.version, repository: record.repository,
    documentation: record.documentation, lifecycle: record.lifecycle, retention: record.retention, consent: record.consent, gates: record.gates, extensions: record.extensions,
  });
  if (record.status !== expected.status || canonicalJson(record.reasons) !== canonicalJson(expected.reasons)) fail("RPF-STATUS", "release preflight status or reasons are not derived from its inputs");
  if (record.recordSha256 !== expected.recordSha256) fail("RPF-HASH", "release preflight record hash does not bind its full record");
  return true;
}
