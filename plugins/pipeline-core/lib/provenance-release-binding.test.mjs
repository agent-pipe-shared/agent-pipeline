// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { evaluateReleasePromotionBinding } from "./provenance-release-binding.mjs";
const sha = "a".repeat(64); const subject = { id: "artifact", sha256: sha }; const valid = { subject, evidence: { sbom: { sha256: "b".repeat(64), subject }, security: { sha256: "c".repeat(64), subject } } };
assert.deepEqual(evaluateReleasePromotionBinding(valid), { allowed: true, code: "RELEASE-BINDING-ALLOWED" });
assert.equal(evaluateReleasePromotionBinding({ ...valid, evidence: { ...valid.evidence, sbom: { ...valid.evidence.sbom, subject: { ...subject, sha256: "d".repeat(64) } } } }).code, "RELEASE-BINDING-SUBJECT-MISMATCH");
assert.equal(evaluateReleasePromotionBinding({ ...valid, evidence: { ...valid.evidence, security: { ...valid.evidence.security, subject: { id: "other-artifact", sha256: sha } } } }).code, "RELEASE-BINDING-SUBJECT-MISMATCH");
assert.equal(evaluateReleasePromotionBinding({ ...valid, evidence: { ...valid.evidence, sbom: { sha256: "b".repeat(64), subjectSha256: sha } } }).allowed, false);
assert.equal(evaluateReleasePromotionBinding({}).allowed, false); console.log("5 release binding checks passed");
