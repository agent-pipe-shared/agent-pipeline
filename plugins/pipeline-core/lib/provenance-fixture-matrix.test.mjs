// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { evaluatePinningPolicy, evaluateProvenanceAdmission } from "./provenance-envelope.mjs";

const hash = (letter) => letter.repeat(64);
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const subject = { id: "bundle", sha256: hash("c") };
const materials = [{ id: "lock", kind: "dependency", sha256: hash("d") }];
const envelope = { schema: "pipeline.provenance-envelope.v1", candidate, subject, materials, builder: { id: "builder", digest: hash("e") }, invocation: { id: "build", parametersSha256: hash("f") }, environment: { kind: "local-test", identitySha256: hash("0") }, assurance: "verified", attestation: { keyReference: "test-key", signatureSha256: hash("1"), status: "verified" }, reproducibility: "repeatable-in-same-builder" };
const expected = { candidate, subject, materials, builderDigest: envelope.builder.digest };
const cases = [
  ["tampered artifact", { ...expected, subject: { ...subject, sha256: hash("2") } }, envelope, "PROVENANCE-SUBJECT-MISMATCH"],
  ["wrong source", { ...expected, candidate: { ...candidate, commit: "3".repeat(40) } }, envelope, "PROVENANCE-CANDIDATE-MISMATCH"],
  ["changed dependency", expected, { ...envelope, materials: [{ ...materials[0], sha256: hash("4") }] }, "PROVENANCE-MATERIAL-MISMATCH"],
  ["forged attestation", expected, { ...envelope, attestation: { ...envelope.attestation, status: "unverified" } }, "PROVENANCE-UNVERIFIED"],
  ["expired attestation", expected, { ...envelope, attestation: { ...envelope.attestation, status: "expired" } }, "PROVENANCE-UNVERIFIED"],
  ["revoked trust", expected, { ...envelope, attestation: { ...envelope.attestation, status: "revoked" } }, "PROVENANCE-UNVERIFIED"],
  ["independent-build mismatch", { ...expected, builderDigest: hash("5") }, envelope, "PROVENANCE-BUILDER-MISMATCH"],
];
for (const [name, fixtureExpected, fixtureEnvelope, code] of cases) assert.equal(evaluateProvenanceAdmission({ boundary: "promote", envelope: fixtureEnvelope, expected: fixtureExpected }).code, code, name);
assert.equal(evaluatePinningPolicy([{ kind: "image", value: "registry/image:latest" }]).code, "PROVENANCE-UNPINNED");
console.log(`${cases.length} provenance tamper fixtures passed`);
