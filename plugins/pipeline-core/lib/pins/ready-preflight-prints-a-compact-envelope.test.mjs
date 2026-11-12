// SPDX-License-Identifier: SUL-1.0
// Candidate 28c (PO tile 2026-11-11, context baseline): the ready preflight envelope stays in the model's
// context until the next compaction. On ready it prints only what is not green-and-repeated and keeps the full
// envelope in the session's bound scratch directory; the printed line is measured as printed.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { compactReadyEnvelope, withPrintedPayload } from "../../scripts/pipeline-start-preflight.mjs";
import { mkdtempTestScratch } from "../test-tmpdir.mjs";

const measurement = { schema: "pipeline.bootstrap-payload-measurement.v1", bytes: 3587, maxUpperBoundUnits: 45000, withinBudget: true };
function envelope(status = "ready", runner = "claude") {
  return {
    schema: "pipeline.start-preflight.v1",
    status,
    rulesetSource: { runner },
    nextAction: { kind: "command", argv: ["inspect"] },
    mandatoryHookReadiness: { status: "ready", required: [{ id: "pre-commit-hook", status: "current" }] },
    cloneProvisioning: { schema: "pipeline.clone-provisioning-report.v1", status: "ready", checks: [{ id: "pre-push-hook", status: "current", path: "/x/.git/hooks/pre-push" }] },
    bootstrapPayload: { schema: "pipeline.bootstrap-payload-receipt.v1", originalMeasurement: measurement, emittedMeasurement: { ...measurement } },
    bootstrapHousekeeping: {
      scratchLifecycle: { schema: "pipeline.bootstrap-scratch-lifecycle.v1", sweep: { retiredCount: 0 }, binding: { status: "bound", scratchRelativePath: "scratch/s1-abc" }, faults: [] },
      worktreeSweep: { schema: "pipeline.bootstrap-worktree-sweep.v1", sweep: { retainedCount: 5 }, faults: [] },
    },
    closeAndPushCapability: { schema: "pipeline.close-push-capability.v1", status: "ready", checks: [{ id: "node", status: "ready" }] },
    environmentReadiness: { schema: "pipeline.environment-readiness.v1", mutation: false, nonGating: true, ok: false, findings: [
      { findingId: "git-version", status: "ok", cause: "fine", repair: null },
      { findingId: "orphan-descriptors", status: "unknown", cause: "no probe", repair: { kind: "attended-prerequisite", summary: "long text" } },
    ] },
    agyStartHint: { governed: true, loaded: { status: "refresh-required" } },
    architectureOrientation: { status: "decision-recorded" },
    modelRoleBootstrap: { status: "unavailable" },
  };
}

test("a ready envelope prints a compact line and keeps the full envelope in the bound session scratch directory", () => {
  const root = mkdtempTestScratch("preflight-compact-");
  try {
    const full = envelope();
    const compact = compactReadyEnvelope(full, { rootDir: root });
    assert.equal(compact.fullEnvelope, "scratch/s1-abc/preflight-full.json");
    const stored = JSON.parse(readFileSync(join(root, compact.fullEnvelope), "utf8"));
    assert.deepEqual(stored, full, "the file holds the unchanged full envelope");
    assert.deepEqual(compact.environmentReadiness.findings, [full.environmentReadiness.findings[1]], "an open finding keeps its repair");
    assert.equal(compact.environmentReadiness.okCount, 1);
    assert.deepEqual(compact.cloneProvisioning, { schema: "pipeline.clone-provisioning-report.v1", status: "ready" });
    assert.equal(compact.bootstrapPayload.emittedMeasurement, "same-as-original");
    assert.equal(compact.bootstrapHousekeeping.scratchLifecycle.scratchRelativePath, "scratch/s1-abc");
    assert.equal(compact.bootstrapHousekeeping.worktreeSweep.schema, "pipeline.bootstrap-worktree-sweep.v1");
    assert.deepEqual(compact.closeAndPushCapability, { schema: "pipeline.close-push-capability.v1", status: "ready" });
    assert.equal(compact.agyStartHint, undefined, "the Antigravity hint is not printed in a Claude run");
    for (const kept of ["nextAction", "mandatoryHookReadiness", "architectureOrientation", "modelRoleBootstrap", "status", "rulesetSource"]) {
      assert.deepEqual(compact[kept], full[kept], `${kept} is printed unchanged`);
    }
    assert.ok(JSON.stringify(compact).length < JSON.stringify(full).length);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a non-ready status, an Antigravity run's hint, a missing binding and a failed write keep the full envelope", () => {
  const root = mkdtempTestScratch("preflight-compact-");
  try {
    const refused = envelope("hook-refresh-required");
    assert.equal(compactReadyEnvelope(refused, { rootDir: root }), refused);
    assert.equal(existsSync(join(root, "scratch")), false, "nothing is written for a non-ready status");
    assert.ok(compactReadyEnvelope(envelope("ready", "antigravity"), { rootDir: root }).agyStartHint, "an Antigravity run keeps its hint");
    const sourceless = envelope();
    delete sourceless.rulesetSource;
    assert.ok(compactReadyEnvelope(sourceless, { rootDir: root }).agyStartHint, "an unidentified runner keeps the hint");
    const unbound = envelope();
    unbound.bootstrapHousekeeping.scratchLifecycle.binding = { status: "unbound" };
    assert.equal(compactReadyEnvelope(unbound, { rootDir: root }), unbound);
    const climbing = envelope();
    climbing.bootstrapHousekeeping.scratchLifecycle.binding.scratchRelativePath = "scratch/../x";
    assert.equal(compactReadyEnvelope(climbing, { rootDir: root }), climbing);
    const failing = envelope();
    assert.equal(compactReadyEnvelope(failing, { rootDir: root, writeFile: () => { throw new Error("disk"); } }), failing);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the printed payload is measured on the printed line, not on the typed result", () => {
  const line = withPrintedPayload({ status: "ready", padding: "x".repeat(5000) });
  const printedBytes = Buffer.byteLength(JSON.stringify(line));
  assert.equal(line.printedPayload.metric, "utf8-byte-upper-bound");
  assert.ok(Math.abs(line.printedPayload.bytes - printedBytes) <= 16, `${line.printedPayload.bytes} vs ${printedBytes}`);
  assert.ok(line.printedPayload.bytes >= printedBytes, "an upper bound never under-reports");
  assert.equal(line.printedPayload.withinBudget, true);
  assert.equal(withPrintedPayload({ padding: "x".repeat(46000) }).printedPayload.withinBudget, false);
});
