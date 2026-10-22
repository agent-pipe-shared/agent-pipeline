// SPDX-License-Identifier: SUL-1.0
// ALF-C-P14-01 / AC-203: host crash during Verify leaves a descriptor that no recovery verb can clear.
// Pins the recovery routes for an orphaned descriptor whose owner is unobservable (ownerPid -1 =>
// status `unavailable`): a zero-authority one is archived by the typed verb; a resource-bearing one
// is refused with a typed code naming the signed route and plan-human-recovery offers that signed
// custody candidate instead of only `retain-and-observe`.
// Point 4: readiness stays ready with a typed warning (never `partial`) for a FOREIGN unavailable-owner
// descriptor -- pinned through foreignDescriptorResidueWarning, the decision partialCleanupRecoveryResult
// uses to downgrade a descriptor-caused block to a warning on the ready result.
// RED proofs: in-memory mirrors of the archive verb / the foreign classifier with the relevant branch
// removed must make the same assertions fail (production is never edited).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  archiveOrphanSessionDescriptor,
  discoverRepository,
  inspectOrphanArchiveEligibility,
  listActiveSessionDescriptors,
  loadSessionDescriptor,
  startSessionDescriptor,
} from "../worktree-lifecycle.mjs";
import { main as sessionCleanupMain } from "../../scripts/session-cleanup.mjs";
import { foreignDescriptorResidueWarning } from "../project-onboarding-v3.mjs";
import { classifyActiveSessionDescriptors } from "../worktree-lifecycle.mjs";
import { inspectProjectOnboardingV3 } from "../project-onboarding-v3.mjs";
import { clearRuntimeBarrier, completeKickoff, dispose, fakeDeps, initializeRestartRequiredRoot, root as onboardingRoot } from "../project-onboarding-v3.test.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function fixture() {
  const scratch = join(REPO_ROOT, "scratch");
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "hcv-"));
  const run = (args) => {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  };
  run(["init", "--quiet"]);
  run(["config", "user.email", "fixture@example.invalid"]);
  run(["config", "user.name", "Fixture"]);
  writeFileSync(join(root, "seed.txt"), "seed\n");
  run(["add", "seed.txt"]);
  run(["commit", "--quiet", "-m", "seed"]);
  return root;
}

function orphan(root, id) {
  startSessionDescriptor(root, { sessionId: id, ownerNonce: `owner-nonce-${id}-000001`, ownerPid: -1 });
  const loaded = loadSessionDescriptor(root, id);
  return { sessionId: id, path: loaded.path, sha: loaded.descriptorSha256, bytes: readFileSync(loaded.path) };
}

function forgeManifest(root, id) {
  const dir = join(discoverRepository(root).commonDir, "agent-pipeline", "session-cleanup", "active");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), "{}\n");
}

function humanRecovery(root) {
  let out = "";
  sessionCleanupMain(["plan-human-recovery", "--repo", root], {}, {
    requireProjectOnboardingReadyFn() {},
    writeFn(value) { out += value; },
  });
  return JSON.parse(out);
}

const fields = (d) => ({ sessionId: d.sessionId, expectedDescriptorSha256: d.sha, by: "po-test", reason: "crashed Verify descriptor" });

test("AC-203 point 1: a zero-authority unavailable-owner descriptor is archived by the typed verb, byte-exact, audited, idempotent", () => {
  const root = fixture();
  try {
    const d = orphan(root, "hcv-zero");
    assert.equal(inspectOrphanArchiveEligibility(root, d.sessionId).status, "eligible");
    const human = humanRecovery(root);
    const ids = human.candidates.map((c) => c.id);
    assert.ok(ids.includes("retain-and-observe"));
    assert.ok(ids.includes("archive-orphan-descriptor"), "recovery plan must offer more than retain-and-observe");
    const result = archiveOrphanSessionDescriptor(root, fields(d));
    assert.equal(result.status, "archived");
    assert.equal(result.ownerStatus, "unavailable");
    assert.equal(existsSync(d.path), false);
    assert.deepEqual(readFileSync(result.archivePath), d.bytes);
    assert.deepEqual(listActiveSessionDescriptors(root), []);
    assert.equal(archiveOrphanSessionDescriptor(root, fields(d)).status, "already-archived");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("AC-203 point 2: a resource-bearing descriptor is refused by the zero-authority archive with a typed code naming the signed route, and nothing is lost", () => {
  const root = fixture();
  try {
    const d = orphan(root, "hcv-resources");
    forgeManifest(root, d.sessionId);
    const verdict = inspectOrphanArchiveEligibility(root, d.sessionId);
    assert.equal(verdict.status, "refused");
    assert.equal(verdict.code, "WT-ORPHAN-ARCHIVE-AUTHORITY");
    assert.match(verdict.reason, /signed custody recovery route/u);
    assert.throws(() => archiveOrphanSessionDescriptor(root, fields(d)), (e) => e.code === "WT-ORPHAN-ARCHIVE-AUTHORITY");
    assert.deepEqual(readFileSync(d.path), d.bytes);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("AC-203 point 3: plan-human-recovery for a resource-bearing orphan offers the signed descriptor-custody route, not only retain-and-observe", () => {
  const root = fixture();
  try {
    const d = orphan(root, "hcv-custody");
    forgeManifest(root, d.sessionId);
    const human = humanRecovery(root);
    const ids = human.candidates.map((c) => c.id);
    assert.ok(ids.includes("retain-and-observe"));
    assert.ok(ids.includes("signed-descriptor-custody"), "a typed route must exist for the resource-bearing orphan");
    assert.equal(ids.includes("archive-orphan-descriptor"), false, "zero-authority archive must not be offered for a resourced descriptor");
    assert.equal(human.automaticMutation, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function assertForeignWarns(root, d, deps = {}) {
  // No requester nonce => the unavailable-owner descriptor is foreign, so it may only warn.
  const warning = foreignDescriptorResidueWarning({ root, deps: { requesterOwnerNonce: "", ...deps } });
  assert.notEqual(warning, null, "a foreign unavailable-owner descriptor must downgrade to a warning, not block readiness");
  assert.equal(warning.code, "cleanup_residue_foreign");
  assert.equal(warning.severity, "warning");
  assert.equal(warning.nextAction.argv[1], "plan-archive-orphan");
  assert.equal(warning.nextAction.mutation, false);
  assert.deepEqual(readFileSync(d.path), d.bytes, "the warning must not touch the descriptor");
}

test("AC-203 point 4: a foreign unavailable-owner descriptor leaves readiness ready with a typed warning, and the descriptor is untouched", () => {
  const root = fixture();
  try {
    const d = orphan(root, "hcv-foreign");
    assert.equal(inspectOrphanArchiveEligibility(root, d.sessionId).status, "eligible");
    assertForeignWarns(root, d);
    // the requester's OWN descriptor is never downgraded (keeps blocking)
    const own = loadSessionDescriptor(root, d.sessionId);
    assert.equal(foreignDescriptorResidueWarning({ root, deps: { requesterOwnerNonce: own.ownerNonce } }), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// Point 4 (real readiness): the full session-readiness evaluation, not only the warning decision.
function realReadiness(path, deps = {}) {
  return inspectProjectOnboardingV3({
    runner: "codex", rootDir: path, intent: "session",
    deps: {
      ...fakeDeps,
      requesterOwnerNonce: "",
      planSessionCleanupRecovery() {
        return { schema: "pipeline.session-cleanup-recovery-plan.v1", status: "cleanup-required" };
      },
      ...deps,
    },
  });
}

test("AC-203 point 4 (real readiness): the real readiness evaluation over a foreign unavailable-owner descriptor stays ready with the warning, descriptor bytes untouched", () => {
  const previousNonce = process.env.PIPELINE_SESSION_OWNER_NONCE;
  delete process.env.PIPELINE_SESSION_OWNER_NONCE;
  const path = onboardingRoot();
  try {
    clearRuntimeBarrier(path, initializeRestartRequiredRoot(path));
    completeKickoff(path);
    const d = orphan(path, "hcv-ready");
    const observed = realReadiness(path);
    assert.equal(observed.status, "ready", JSON.stringify(observed.diagnostics));
    const warnings = observed.diagnostics.filter((x) => x.code === "cleanup_residue_foreign");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].severity, "warning");
    assert.equal(warnings[0].nextAction.argv[1], "plan-archive-orphan");
    assert.deepEqual(readFileSync(d.path), d.bytes, "readiness must not touch the descriptor");
    assert.equal(listActiveSessionDescriptors(path).length, 1);
    // Contrast: the same descriptor seen as the requester's OWN keeps the non-ready result.
    process.env.PIPELINE_SESSION_OWNER_NONCE = loadSessionDescriptor(path, d.sessionId).ownerNonce;
    const own = realReadiness(path, { requesterOwnerNonce: undefined });
    assert.notEqual(own.status, "ready", "the requester's own descriptor must still block readiness");
    assert.deepEqual(readFileSync(d.path), d.bytes);
  } finally {
    if (previousNonce === undefined) delete process.env.PIPELINE_SESSION_OWNER_NONCE;
    else process.env.PIPELINE_SESSION_OWNER_NONCE = previousNonce;
    dispose(path);
  }
});

test("AC-203 RED proof (point 1): an archive verb mirror with the removal branch deleted fails the point-1 assertions", () => {
  const root = fixture();
  try {
    const d = orphan(root, "hcv-red1");
    // mirror: reports "archived" but the removal branch is deleted, so the descriptor stays in place
    const mirror = () => ({ status: "archived", ownerStatus: "unavailable", archivePath: d.path });
    const result = mirror();
    assert.throws(() => assert.equal(existsSync(d.path), false), assert.AssertionError, "descriptor still present => point-1 'removed' assertion goes RED");
    assert.throws(() => assert.deepEqual(listActiveSessionDescriptors(root), []), assert.AssertionError, "still listed => point-1 'no active descriptor' assertion goes RED");
    assert.equal(result.status, "archived");
    // and the real verb satisfies the same assertion
    archiveOrphanSessionDescriptor(root, fields(d));
    assert.equal(existsSync(d.path), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("AC-203 RED proof (point 4): a classifier mirror with the foreign branch removed fails the point-4 assertions", () => {
  const root = fixture();
  try {
    const d = orphan(root, "hcv-red4");
    // mirror of classifyActiveSessionDescriptors with the foreign bucket removed (everything is "own")
    const noForeign = (r, o) => { const real = classifyActiveSessionDescriptors(r, o); return { own: [...real.own, ...real.foreign], foreign: [] }; };
    assert.throws(
      () => assertForeignWarns(root, d, { classifyActiveSessionDescriptors: noForeign }),
      assert.AssertionError,
      "without the foreign branch no warning is produced => point-4 assertion goes RED",
    );
    assertForeignWarns(root, d); // real classifier: GREEN
  } finally { rmSync(root, { recursive: true, force: true }); }
});
