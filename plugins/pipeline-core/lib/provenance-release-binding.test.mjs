// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { evaluateReleasePromotionBinding } from "./provenance-release-binding.mjs";
const sha = "a".repeat(64); const valid = { subject: { id: "artifact", sha256: sha }, evidence: { sbomSha256: "b".repeat(64), securitySha256: "c".repeat(64), subjectSha256: sha } };
assert.deepEqual(evaluateReleasePromotionBinding(valid), { allowed: true, code: "RELEASE-BINDING-ALLOWED" });
assert.equal(evaluateReleasePromotionBinding({ ...valid, evidence: { ...valid.evidence, subjectSha256: "d".repeat(64) } }).code, "RELEASE-BINDING-SUBJECT-MISMATCH");
assert.equal(evaluateReleasePromotionBinding({}).allowed, false); console.log("3 release binding checks passed");
