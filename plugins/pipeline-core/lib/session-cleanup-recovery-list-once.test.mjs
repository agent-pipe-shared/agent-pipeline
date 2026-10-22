// SPDX-License-Identifier: SUL-1.0
/**
 * ALF-C-HK-01D: one planSessionCleanupRecovery call lists the active session
 * descriptors once, even when the archive offer re-reads them. Fully injected
 * fakes -- no filesystem, no private-path probes.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ORPHAN_ARCHIVE_PLAN_SCHEMA,
  planOrphanDescriptorArchive,
  planSessionCleanupRecovery,
} from "./session-cleanup-recovery.mjs";

const ROOT = "/fixture/root";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const DESCRIPTORS = [
  { sessionId: "session-a", descriptorSha256: SHA_A },
  { sessionId: "session-b", descriptorSha256: SHA_B },
];

function makeDeps({ bindingStatus = "design-unbound", descriptors = DESCRIPTORS, listError = null } = {}) {
  const calls = [];
  const deps = {
    listActiveSessionDescriptorsFn: (...args) => {
      calls.push(args);
      if (listError !== null) throw listError;
      return descriptors;
    },
    readOnboardingSessionCleanupBindingFn: () => ({ status: bindingStatus, root: ROOT }),
    inspectSessionRetirementFn: (_root, sessionId) => ({ status: "unavailable", sessionId }),
    inspectExternallyArchivedSessionFn: (_root, sessionId) => ({ status: "absent", sessionId }),
    inspectOrphanArchiveEligibilityFn: (_root, sessionId) => (sessionId === "session-a"
      ? { status: "eligible", ownerStatus: "unavailable", resume: false }
      : { status: "refused", ownerStatus: "live", code: "WT-FAKE-REFUSED" }),
  };
  return { deps, calls };
}

test("archive-offer status lists descriptors exactly once", () => {
  const { deps, calls } = makeDeps();
  const plan = planSessionCleanupRecovery({ rootDir: ROOT, deps });
  assert.equal(plan.status, "orphan-recovery-unavailable");
  assert.equal(plan.archiveOrphan.candidates.length, 1);
  assert.equal(calls.length, 1);
});

test("plan equals the original two-listing composition", () => {
  const { deps } = makeDeps();
  const plan = planSessionCleanupRecovery({ rootDir: ROOT, deps });

  const fresh = makeDeps();
  const offer = planOrphanDescriptorArchive({ rootDir: ROOT, deps: fresh.deps });
  assert.equal(offer.schema, ORPHAN_ARCHIVE_PLAN_SCHEMA);
  const expected = {
    schema: plan.schema,
    status: "orphan-recovery-unavailable",
    activeDescriptorCount: DESCRIPTORS.length,
    archiveOrphan: { schema: offer.schema, candidates: offer.candidates },
  };
  assert.deepEqual(plan, expected);
});

test("a non-archive status still lists once and adds no offer", () => {
  const { deps, calls } = makeDeps({ bindingStatus: "closed-unbound", descriptors: [] });
  const plan = planSessionCleanupRecovery({ rootDir: ROOT, deps });
  assert.equal(plan.status, "not-needed");
  assert.equal("archiveOrphan" in plan, false);
  assert.equal(calls.length, 1);
});

test("a throwing listing surfaces the same exception", () => {
  const boom = Object.assign(new Error("listing failed"), { code: "WT-FAKE-LIST" });
  const { deps, calls } = makeDeps({ listError: boom });
  assert.throws(() => planSessionCleanupRecovery({ rootDir: ROOT, deps }), (error) => error === boom);
  assert.equal(calls.length, 1);
});

test("listing memo is call-scoped, not shared across calls", () => {
  const { deps, calls } = makeDeps();
  planSessionCleanupRecovery({ rootDir: ROOT, deps });
  planSessionCleanupRecovery({ rootDir: ROOT, deps });
  assert.equal(calls.length, 2);
});
