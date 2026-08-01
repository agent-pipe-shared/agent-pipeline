// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createArtifactIdentity, evaluatePinningPolicy, evaluateProvenanceAdmission, evaluateProvenanceAppend, validateProvenanceEnvelope } from "./provenance-envelope.mjs";

const hash = (letter) => letter.repeat(64);
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const subject = { id: "plugin.tar", sha256: hash("c") };
const envelope = { schema: "pipeline.provenance-envelope.v1", candidate, subject, materials: [{ id: "package-lock.json", kind: "dependency", sha256: hash("d") }], builder: { id: "local-builder", digest: hash("e") }, invocation: { id: "build", parametersSha256: hash("f") }, environment: { kind: "local-test", identitySha256: hash("0") }, assurance: "verified", attestation: { keyReference: "test-key-1", signatureSha256: hash("1"), status: "verified" }, reproducibility: "repeatable-in-same-builder" };

assert.equal(validateProvenanceEnvelope(envelope).valid, true);
assert.equal(validateProvenanceEnvelope({ ...envelope, privateKey: "never" }).valid, false);
assert.equal(createArtifactIdentity("bundle", "canonical bytes").id, createArtifactIdentity("bundle", "canonical bytes").id);
for (const boundary of ["produce", "promote", "readback"]) assert.deepEqual(evaluateProvenanceAdmission({ boundary, envelope, expected: { candidate, subject } }), { allowed: true, code: "PROVENANCE-ADMISSION-ALLOWED" });
assert.equal(evaluateProvenanceAdmission({ boundary: "promote", envelope, expected: { candidate, subject: { ...subject, sha256: hash("9") } } }).code, "PROVENANCE-SUBJECT-MISMATCH");
assert.equal(evaluateProvenanceAdmission({ boundary: "readback", envelope: { ...envelope, attestation: { ...envelope.attestation, status: "revoked" } }, expected: { candidate, subject } }).allowed, false);
assert.deepEqual(evaluatePinningPolicy([{ kind: "action", value: "owner/action@" + "a".repeat(40) }, { kind: "image", value: "registry/image@sha256:" + hash("b") }]), { ok: true });
assert.equal(evaluatePinningPolicy([{ kind: "action", value: "owner/action@main" }]).code, "PROVENANCE-UNPINNED");
assert.equal(evaluateProvenanceAppend({ existing: [envelope], next: envelope }).code, "PROVENANCE-HISTORICAL-IMMUTABLE");
assert.deepEqual(evaluateProvenanceAppend({ existing: [envelope], next: { ...envelope, subject: { id: "next.tar", sha256: hash("8") } } }), { allowed: true, code: "PROVENANCE-APPEND-ALLOWED" });
assert.equal(evaluateProvenanceAppend({ existing: [{ schema: "invalid" }], next: envelope }).code, "PROVENANCE-APPEND-INVALID");
console.log("12 provenance envelope checks passed");
