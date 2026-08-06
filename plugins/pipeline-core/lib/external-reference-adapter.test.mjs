// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { applyExternalReferenceWrite, planExternalReferenceWrite, reconcileExternalReference, validateExternalReference } from "./external-reference-adapter.mjs";
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
// X-AC-07: adapter credentials and private coordinates stay in approved
// machine-local storage and never reach portable evidence or diagnostics. The
// reference, capability and receipt shapes are closed, so the property holds by
// construction; this proves the construction, and proves a receipt produced
// from a credential-bearing transport carries none of it onward.
test("X-AC-07 keeps credentials and private coordinates out of every portable adapter record", async () => {
  for (const field of ["credential", "token", "endpoint", "privatePath", "accountId"]) {
    assert.throws(() => validateExternalReference({ ...reference(), [field]: "redacted-fixture" }), (error) => error.code === "ERA-REFERENCE");
  }
  const inspection = await planExternalReferenceWrite({ reference: reference(), capabilities, desired, inspect: async () => ({ objectId: "issue-42", revision: "rev-1", state: "fresh", credential: "redacted-fixture", endpoint: "internal-endpoint-fixture" }), preview: async () => ({ previewDigest: "c".repeat(64) }) });
  assert.equal(inspection.status, "reconciliation-required");
  const planned = await planExternalReferenceWrite({ reference: reference(), capabilities, desired, inspect: async () => ({ objectId: "issue-42", revision: "rev-1", state: "fresh" }), preview: async () => ({ previewDigest: "c".repeat(64) }) });
  const applied = await applyExternalReferenceWrite({ plan: planned.plan, authorize: async (request) => ({ granted: true, ...request }), apply: async () => ({ status: "applied", revision: "rev-2", credential: "redacted-fixture" }), readback: async () => ({ objectId: "issue-42", revision: "rev-2", appliedDigest: canonicalSha256(desired.changes), state: "fresh" }) });
  assert.equal(applied.status, "reconciliation-required");
  assert.equal(applied.reason, "apply");
  const readback = await applyExternalReferenceWrite({ plan: planned.plan, authorize: async (request) => ({ granted: true, ...request }), apply: async () => ({ status: "applied", revision: "rev-2" }), readback: async () => ({ objectId: "issue-42", revision: "rev-2", appliedDigest: canonicalSha256(desired.changes), state: "fresh", endpoint: "internal-endpoint-fixture" }) });
  assert.equal(readback.status, "reconciliation-required");
  const serialized = JSON.stringify({ inspection, applied, readback, plan: planned.plan });
  for (const secret of ["redacted-fixture", "internal-endpoint-fixture"]) assert.equal(serialized.includes(secret), false);
});
test("preserves the closed normative relation taxonomy and rejects unknown relation semantics", () => {
  for (const relation of ["tracks", "specifies", "implements", "documents", "mirrors", "reviews", "evidences", "releases", "supersedes"]) assert.equal(validateExternalReference({ ...reference(), relation }).relation, relation);
  assert.throws(() => validateExternalReference({ ...reference(), relation: "looks-complete" }), (error) => error.code === "ERA-REFERENCE");
});
test("reconciles external observations without importing them as authority", async () => {
  const current = await reconcileExternalReference({ reference: reference(), capabilities, inspect: async () => ({ objectId: "issue-42", revision: "rev-1", state: "fresh" }) }); assert.equal(current.status, "current"); assert.equal(current.reference.authorityDirection, "pipeline-to-external");
  const moved = await reconcileExternalReference({ reference: reference(), capabilities, inspect: async () => ({ objectId: "issue-42", revision: "rev-2", state: "moved" }) }); assert.equal(moved.status, "reconciliation-required"); assert.equal(moved.reason, "freshness"); assert.equal(moved.reference.externalRevision, "rev-2");
  const malformed = await reconcileExternalReference({ reference: reference(), capabilities, inspect: async () => ({ objectId: "other", revision: "rev-1", state: "fresh" }) }); assert.equal(malformed.status, "reconciliation-required"); assert.equal(malformed.reference, null);
});
