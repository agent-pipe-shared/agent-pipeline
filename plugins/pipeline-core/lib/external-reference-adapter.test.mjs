// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { applyExternalReferenceWrite, bindCanonicalArtifactIdentity, planExternalReferenceWrite, reconcileExternalReference, validateExternalReference } from "./external-reference-adapter.mjs";
import { resolveCanonicalArtifactIdentity } from "./feature-package-topology.mjs";
import { canonicalSha256 } from "./governance-event.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const reference = () => ({ schema: "pipeline.external-reference.v1", systemClass: "issue-tracker", adapterProfile: "synthetic-issues", objectId: "issue-42", relation: "relates-to", authorityDirection: "pipeline-to-external", pipelineArtifact: { path: "specs/feature/result.md", sha256: "a".repeat(64) }, externalRevision: "rev-1", mode: "controlled-publication", freshness: { state: "fresh", observedAtEpochMs: 1 }, ownership: "pipeline-owned" });
const capabilities = { schema: "pipeline.external-adapter-capabilities.v1", adapterProfile: "synthetic-issues", systemClass: "issue-tracker", operations: ["inspect", "preview", "apply", "readback", "reconcile"] };
const desired = { requestId: "publish-42", changes: [{ field: "summary", valueSha256: "b".repeat(64), ownership: "pipeline-owned" }] };
const identity = (overrides = {}) => ({ schema: "pipeline.artifact-identity.v1", featureId: "feature", manifest: "specs/feature/lifecycle.json", manifestSha256: "e".repeat(64), lifecycleState: "implementing", candidate: null, class: "result", path: "specs/feature/result.md", sha256: "a".repeat(64), authority: true, mutability: "append-only", retention: "active", ...overrides });
const resolveIdentity = async () => ({ schema: "pipeline.canonical-artifact-identity.v1", status: "resolved", identity: identity(), findings: [] });
test("requires inspection, exact preview, authority, idempotent apply and matching readback", async () => {
  const planned = await planExternalReferenceWrite({ resolveIdentity, reference: reference(), capabilities, desired, inspect: async () => ({ objectId: "issue-42", revision: "rev-1", state: "fresh" }), preview: async () => ({ previewDigest: "c".repeat(64) }) });
  assert.equal(planned.status, "preview"); const receipt = await applyExternalReferenceWrite({ plan: planned.plan, authorize: async (request) => ({ granted: true, ...request }), apply: async () => ({ status: "applied", revision: "rev-2" }), readback: async () => ({ objectId: "issue-42", revision: "rev-2", appliedDigest: canonicalSha256(desired.changes), state: "fresh" }) });
  assert.equal(receipt.status, "applied"); assert.equal(receipt.revision, "rev-2");
});
test("does not report success for revision, capability, authority, or readback conflicts", async () => {
  const stale = await planExternalReferenceWrite({ resolveIdentity, reference: reference(), capabilities, desired, inspect: async () => ({ objectId: "issue-42", revision: "rev-9", state: "fresh" }), preview: async () => ({ previewDigest: "c".repeat(64) }) }); assert.equal(stale.status, "conflict");
  const planned = await planExternalReferenceWrite({ resolveIdentity, reference: reference(), capabilities, desired, inspect: async () => ({ objectId: "issue-42", revision: "rev-1", state: "fresh" }), preview: async () => ({ previewDigest: "c".repeat(64) }) }); const denied = await applyExternalReferenceWrite({ plan: planned.plan, authorize: async (request) => ({ granted: false, ...request }), apply: async () => ({ status: "applied", revision: "rev-2" }), readback: async () => ({}) }); assert.equal(denied.status, "rejected");
  const mismatch = await applyExternalReferenceWrite({ plan: planned.plan, authorize: async (request) => ({ granted: true, ...request }), apply: async () => ({ status: "applied", revision: "rev-2" }), readback: async () => ({ objectId: "issue-42", revision: "rev-2", appliedDigest: "d".repeat(64), state: "fresh" }) }); assert.equal(mismatch.status, "reconciliation-required");
});
test("rejects unclosed references and blocks non-pipeline-owned writes", async () => {
  assert.throws(() => validateExternalReference({ ...reference(), privateUrl: "https://secret" }), (error) => error.code === "ERA-REFERENCE"); const rejected = await planExternalReferenceWrite({ resolveIdentity, reference: { ...reference(), ownership: "external-owned" }, capabilities, desired, inspect: async () => ({}), preview: async () => ({}) }); assert.equal(rejected.status, "rejected");
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
  const inspection = await planExternalReferenceWrite({ resolveIdentity, reference: reference(), capabilities, desired, inspect: async () => ({ objectId: "issue-42", revision: "rev-1", state: "fresh", credential: "redacted-fixture", endpoint: "internal-endpoint-fixture" }), preview: async () => ({ previewDigest: "c".repeat(64) }) });
  assert.equal(inspection.status, "reconciliation-required");
  const planned = await planExternalReferenceWrite({ resolveIdentity, reference: reference(), capabilities, desired, inspect: async () => ({ objectId: "issue-42", revision: "rev-1", state: "fresh" }), preview: async () => ({ previewDigest: "c".repeat(64) }) });
  const applied = await applyExternalReferenceWrite({ plan: planned.plan, authorize: async (request) => ({ granted: true, ...request }), apply: async () => ({ status: "applied", revision: "rev-2", credential: "redacted-fixture" }), readback: async () => ({ objectId: "issue-42", revision: "rev-2", appliedDigest: canonicalSha256(desired.changes), state: "fresh" }) });
  assert.equal(applied.status, "reconciliation-required");
  assert.equal(applied.reason, "apply");
  const readback = await applyExternalReferenceWrite({ plan: planned.plan, authorize: async (request) => ({ granted: true, ...request }), apply: async () => ({ status: "applied", revision: "rev-2" }), readback: async () => ({ objectId: "issue-42", revision: "rev-2", appliedDigest: canonicalSha256(desired.changes), state: "fresh", endpoint: "internal-endpoint-fixture" }) });
  assert.equal(readback.status, "reconciliation-required");
  const serialized = JSON.stringify({ inspection, applied, readback, plan: planned.plan });
  for (const secret of ["redacted-fixture", "internal-endpoint-fixture"]) assert.equal(serialized.includes(secret), false);
});
// X-AC-10: a linked or published artifact resolves its sole canonical identity
// and lifecycle through the feature-package topology, never through the path
// carried in the reference.
test("X-AC-10 resolves the artifact's sole canonical identity through the feature package, not the path", async () => {
  const bound = await bindCanonicalArtifactIdentity({ reference: reference(), resolveIdentity });
  assert.equal(bound.status, "bound");
  assert.equal(bound.identity.featureId, "feature");
  assert.equal(bound.identity.manifest, "specs/feature/lifecycle.json");
  assert.equal(bound.identity.lifecycleState, "implementing");
  // An unresolved, ambiguous or invalid topology answer is never downgraded to
  // the path the reference happened to carry.
  for (const answer of [
    { schema: "pipeline.canonical-artifact-identity.v1", status: "unresolved", identity: null, findings: ["FTP-IDENTITY: no validated feature package binds this path"] },
    { schema: "pipeline.canonical-artifact-identity.v1", status: "ambiguous", identity: null, findings: ["FTP-IDENTITY: specs/other/lifecycle.json also binds specs/feature/result.md"] },
    { schema: "pipeline.canonical-artifact-identity.v1", status: "invalid", identity: null, findings: [] },
    // Resolved, but for a different artifact or different bytes than the link.
    { schema: "pipeline.canonical-artifact-identity.v1", status: "resolved", identity: identity({ path: "specs/feature/other.md" }), findings: [] },
    { schema: "pipeline.canonical-artifact-identity.v1", status: "resolved", identity: identity({ sha256: "9".repeat(64) }), findings: [] },
    // Structurally wrong answers from an untrusted resolver.
    { schema: "pipeline.canonical-artifact-identity.v1", status: "resolved", identity: identity({ lifecycleState: "shipped" }), findings: [] },
    { schema: "pipeline.canonical-artifact-identity.v1", status: "resolved", identity: identity({ class: "readme" }), findings: [] },
    { schema: "pipeline.canonical-artifact-identity.v1", status: "resolved", identity: { ...identity(), endpoint: "internal-endpoint-fixture" }, findings: [] },
    { schema: "pipeline.other.v1", status: "resolved", identity: identity(), findings: [] },
  ]) {
    const answered = async () => answer;
    assert.equal((await bindCanonicalArtifactIdentity({ reference: reference(), resolveIdentity: answered })).status, "rejected", JSON.stringify(answer));
    let contacted = false;
    const plan = await planExternalReferenceWrite({ resolveIdentity: answered, reference: reference(), capabilities, desired, inspect: async () => { contacted = true; return { objectId: "issue-42", revision: "rev-1", state: "fresh" }; }, preview: async () => ({ previewDigest: "c".repeat(64) }) });
    assert.equal(plan.status, "rejected"); assert.equal(plan.reason, "canonical-identity");
    // The provider is never contacted for an artifact whose identity is unknown.
    assert.equal(contacted, false);
  }
  await assert.rejects(() => bindCanonicalArtifactIdentity({ reference: reference() }), (error) => error.code === "ERA-IDENTITY-REQUEST");
  await assert.rejects(() => planExternalReferenceWrite({ reference: reference(), capabilities, desired, inspect: async () => ({}), preview: async () => ({}) }), (error) => error.code === "ERA-REQUEST");
  // The plan and the applied receipt bind that identity, so the digest changes
  // if the resolved identity does.
  const planned = await planExternalReferenceWrite({ resolveIdentity, reference: reference(), capabilities, desired, inspect: async () => ({ objectId: "issue-42", revision: "rev-1", state: "fresh" }), preview: async () => ({ previewDigest: "c".repeat(64) }) });
  assert.deepEqual(planned.plan.pipelineArtifactIdentity, identity());
  await assert.rejects(() => applyExternalReferenceWrite({ plan: { ...planned.plan, pipelineArtifactIdentity: identity({ featureId: "other-feature" }) }, authorize: async (request) => ({ granted: true, ...request }), apply: async () => ({ status: "applied", revision: "rev-2" }), readback: async () => ({}) }), (error) => error.code === "ERA-APPLY-REQUEST");
});

test("X-AC-10 resolves a live repository path through the feature package topology", () => {
  const resolved = resolveCanonicalArtifactIdentity(REPO_ROOT, "specs/sprint-phoenix-epic/spec.md");
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.identity.featureId, "sprint-phoenix-epic");
  assert.equal(resolved.identity.class, "spec");
  assert.equal(resolved.identity.authority, true);
  assert.equal(resolveCanonicalArtifactIdentity(REPO_ROOT, "README.md").status, "unresolved");
  assert.equal(resolveCanonicalArtifactIdentity(REPO_ROOT, "../outside").status, "invalid");
  assert.equal(resolveCanonicalArtifactIdentity(REPO_ROOT, "").status, "invalid");
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
