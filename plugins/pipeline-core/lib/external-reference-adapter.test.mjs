// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { applyExternalReferenceWrite, planExternalReferenceWrite, validateExternalReference } from "./external-reference-adapter.mjs";
import { canonicalSha256 } from "./governance-event.mjs";

const reference = () => ({ schema: "pipeline.external-reference.v1", systemClass: "issue-tracker", adapterProfile: "synthetic-issues", objectId: "issue-42", relation: "relates-to", authorityDirection: "pipeline-to-external", pipelineArtifact: { path: "specs/feature/result.md", sha256: "a".repeat(64) }, externalRevision: "rev-1", mode: "controlled-publication", freshness: { state: "fresh", observedAtEpochMs: 1 }, ownership: "pipeline-owned" });
const capabilities = { schema: "pipeline.external-adapter-capabilities.v1", adapterProfile: "synthetic-issues", systemClass: "issue-tracker", operations: ["inspect", "preview", "apply", "readback", "reconcile"] };
const desired = { requestId: "publish-42", changes: [{ field: "summary", valueSha256: "b".repeat(64), ownership: "pipeline-owned" }] };
test("requires inspection, exact preview, authority, idempotent apply and matching readback", async () => {
  const planned = await planExternalReferenceWrite({ reference: reference(), capabilities, desired, inspect: async () => ({ objectId: "issue-42", revision: "rev-1", state: "fresh" }), preview: async () => ({ previewDigest: "c".repeat(64) }) });
  assert.equal(planned.status, "preview"); const receipt = await applyExternalReferenceWrite({ plan: planned.plan, authorize: async (request) => ({ granted: true, ...request }), apply: async () => ({ status: "applied", revision: "rev-2" }), readback: async () => ({ objectId: "issue-42", revision: "rev-2", appliedDigest: canonicalSha256(desired.changes), state: "fresh" }) });
  assert.equal(receipt.status, "applied"); assert.equal(receipt.revision, "rev-2");
});
test("does not report success for revision, capability, authority, or readback conflicts", async () => {
  const stale = await planExternalReferenceWrite({ reference: reference(), capabilities, desired, inspect: async () => ({ objectId: "issue-42", revision: "rev-9", state: "fresh" }), preview: async () => ({ previewDigest: "c".repeat(64) }) }); assert.equal(stale.status, "conflict");
  const planned = await planExternalReferenceWrite({ reference: reference(), capabilities, desired, inspect: async () => ({ objectId: "issue-42", revision: "rev-1", state: "fresh" }), preview: async () => ({ previewDigest: "c".repeat(64) }) }); const denied = await applyExternalReferenceWrite({ plan: planned.plan, authorize: async (request) => ({ granted: false, ...request }), apply: async () => ({ status: "applied", revision: "rev-2" }), readback: async () => ({}) }); assert.equal(denied.status, "rejected");
  const mismatch = await applyExternalReferenceWrite({ plan: planned.plan, authorize: async (request) => ({ granted: true, ...request }), apply: async () => ({ status: "applied", revision: "rev-2" }), readback: async () => ({ objectId: "issue-42", revision: "rev-2", appliedDigest: "d".repeat(64), state: "fresh" }) }); assert.equal(mismatch.status, "reconciliation-required");
});
test("rejects unclosed references and blocks non-pipeline-owned writes", async () => {
  assert.throws(() => validateExternalReference({ ...reference(), privateUrl: "https://secret" }), (error) => error.code === "ERA-REFERENCE"); const rejected = await planExternalReferenceWrite({ reference: { ...reference(), ownership: "external-owned" }, capabilities, desired, inspect: async () => ({}), preview: async () => ({}) }); assert.equal(rejected.status, "rejected");
});
