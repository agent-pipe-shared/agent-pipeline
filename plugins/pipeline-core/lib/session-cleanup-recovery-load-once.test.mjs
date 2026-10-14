/**
 * ALF-C-HK-01F: one planSessionCleanupRecovery call loads each session
 * descriptor once per distinct argument tuple, even though the retirement,
 * external-archive and orphan-archive inspections (and their nested owner
 * inspections) each used to re-load it. The REAL inspectors run with an
 * injected, counting loader -- no private-path probes are spawned.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_SESSION_DESCRIPTOR_SCHEMA,
  inspectExternallyArchivedSession,
  inspectOrphanArchiveEligibility,
  inspectSessionOwnerRuntime,
  inspectSessionRetirement,
} from "./worktree-lifecycle.mjs";
import { planSessionCleanupRecovery } from "./session-cleanup-recovery.mjs";

const ROOT = "/fixture/root";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const DESCRIPTORS = [
  { sessionId: "session-a", descriptorSha256: SHA_A },
  { sessionId: "session-b", descriptorSha256: SHA_B },
];

function makeLoader({ failFor = null } = {}) {
  const loads = [];
  const loadFn = (startPath, sessionId, options = {}) => {
    loads.push(JSON.stringify([startPath, sessionId, options.expectedDescriptorSha256 ?? null]));
    if (failFor === sessionId) {
      throw Object.assign(new Error("load failed"), { code: "WT-FAKE-LOAD" });
    }
    const wanted = DESCRIPTORS.find((entry) => entry.sessionId === sessionId);
    return {
      repo: { primaryRoot: ROOT, commonDir: `${ROOT}/.git` },
      path: `${ROOT}/.git/${sessionId}.json`,
      sessionId,
      ownerNonce: "n".repeat(32),
      descriptorSha256: wanted.descriptorSha256,
      descriptorSchema: LEGACY_SESSION_DESCRIPTOR_SCHEMA,
      ownerRuntime: null,
    };
  };
  return { loads, loadFn };
}

function makeDeps(loadFn) {
  return {
    readOnboardingSessionCleanupBindingFn: () => ({ status: "design-unbound", root: ROOT }),
    listActiveSessionDescriptorsFn: () => DESCRIPTORS,
    loadSessionDescriptorFn: loadFn,
  };
}

function countBy(loads, pick) {
  const counts = new Map();
  for (const key of loads) counts.set(pick(key), (counts.get(pick(key)) ?? 0) + 1);
  return counts;
}

test("seam: the inspectors take their descriptor loader from options", () => {
  const { loads, loadFn } = makeLoader();
  const options = { expectedDescriptorSha256: SHA_A, loadSessionDescriptorFn: loadFn };
  assert.equal(inspectSessionRetirement(ROOT, "session-a", options).ownerStatus, "unobserved");
  assert.equal(loads.length, 2);
  assert.equal(inspectSessionOwnerRuntime(ROOT, "session-a", options).status, "unobserved");
  assert.equal(loads.length, 3);
  assert.equal(inspectExternallyArchivedSession(ROOT, "session-a", options).ownerStatus, "unobserved");
  assert.equal(loads.length, 5);
  assert.equal(inspectOrphanArchiveEligibility(ROOT, "session-a", options).ownerStatus, "unobserved");
  assert.equal(loads.length, 7);
});

test("one plan loads each descriptor tuple at most once across all inspections", () => {
  const { loads, loadFn } = makeLoader();
  const plan = planSessionCleanupRecovery({ rootDir: ROOT, deps: makeDeps(loadFn) });
  assert.ok(plan.status);
  assert.ok(loads.length > 0, "the injected loader must be exercised");
  for (const [key, count] of countBy(loads, (k) => k)) {
    assert.equal(count, 1, `loaded more than once: ${key}`);
  }
});

test("plan equals the original composition (every inspector with its own loader)", () => {
  const memoized = planSessionCleanupRecovery({ rootDir: ROOT, deps: makeDeps(makeLoader().loadFn) });
  const { loadFn } = makeLoader();
  const direct = planSessionCleanupRecovery({
    rootDir: ROOT,
    deps: {
      ...makeDeps(loadFn),
      inspectSessionRetirementFn: (root, id, o) => inspectSessionRetirement(root, id, { ...o, loadSessionDescriptorFn: loadFn }),
      inspectExternallyArchivedSessionFn: (root, id, o) => inspectExternallyArchivedSession(root, id, { ...o, loadSessionDescriptorFn: loadFn }),
      inspectOrphanArchiveEligibilityFn: (root, id, o) => inspectOrphanArchiveEligibility(root, id, { ...o, loadSessionDescriptorFn: loadFn }),
    },
  });
  assert.deepEqual(memoized, direct);
});

test("a throwing load is re-thrown identically and attempted once per tuple", () => {
  const { loads, loadFn } = makeLoader({ failFor: "session-a" });
  assert.throws(
    () => planSessionCleanupRecovery({ rootDir: ROOT, deps: makeDeps(loadFn) }),
    (error) => error.code === "WT-FAKE-LOAD",
  );
  assert.equal(loads.filter((key) => JSON.parse(key)[1] === "session-a").length, 1);
});

test("the load memo is call-scoped, not shared across calls", () => {
  const { loads, loadFn } = makeLoader();
  const deps = makeDeps(loadFn);
  planSessionCleanupRecovery({ rootDir: ROOT, deps });
  const first = loads.length;
  assert.ok(first > 0);
  planSessionCleanupRecovery({ rootDir: ROOT, deps });
  assert.equal(loads.length, first * 2);
});
