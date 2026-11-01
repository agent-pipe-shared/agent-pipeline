// SPDX-License-Identifier: SUL-1.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { auditFixture } from "./feature-close-audit-test-fixture.mjs";
import { planFeatureCloseAudit } from "./feature-close-audit-preflight.mjs";
import { executeFeatureCloseAudit, syncAuditBundleFile } from "./feature-close-audit-executor.mjs";

test("executor creates real local bundle and durable receipt; identical retry is a no-write replay", async t => {
  const f = auditFixture(t), plan = await planFeatureCloseAudit(f.options);
  const input = { options: f.options, lifecycleId: "close-fixture", expectedPlanSha256: plan.planSha256, activate: true };
  const first = await executeFeatureCloseAudit(input);
  assert.equal(first.status, "verified-pending-close", JSON.stringify(first)); assert.equal(first.featureClosed, false);
  const before = readFileSync(first.receiptPath), replay = await executeFeatureCloseAudit(input);
  assert.equal(replay.status, "replayed", JSON.stringify(replay)); assert.deepEqual(readFileSync(first.receiptPath), before);
  assert.equal(existsSync(join(f.root, "project/pipeline-state.json")), false);
  writeFileSync(join(f.root, plan.outputPath, "README.md"), "tampered");
  assert.equal((await executeFeatureCloseAudit(input)).status, "blocked");
  assert.deepEqual(readFileSync(first.receiptPath), before);
});

test("preflight/digest/activation failures write no bundle or coordinator state", async t => {
  const f = auditFixture(t), plan = await planFeatureCloseAudit(f.options);
  for (const extra of [{ activate: false }, { expectedPlanSha256: "0".repeat(64) }, { options: { ...f.options, packs: [] } }]) {
    const result = await executeFeatureCloseAudit({ options: f.options, lifecycleId: "close-fixture", expectedPlanSha256: plan.planSha256, activate: true, ...extra });
    assert.equal(result.status, "blocked");
    assert.equal(existsSync(join(f.root, "audit-bundles")), false);
    assert.equal(existsSync(join(f.root, ".git/agent-pipeline")), false);
  }
});

test("crashes at completed build/verify/receipt boundaries recover without duplicate or overwrite", async t => {
  for (const point of ["before-build", "after-build", "after-verify", "after-receipt"]) {
    const f = auditFixture(t), plan = await planFeatureCloseAudit(f.options);
    const input = { options: f.options, lifecycleId: "close-fixture", expectedPlanSha256: plan.planSha256, activate: true };
    const failed = await executeFeatureCloseAudit({ ...input, fault: at => { if (at === point) throw new Error("simulated"); } });
    assert.equal(failed.status, "blocked", point); assert.equal(failed.featureClosed, false);
    const retry = await executeFeatureCloseAudit(input);
    assert.ok(["verified-pending-close", "replayed"].includes(retry.status), JSON.stringify(retry));
  }
});

test("partial output remains untouched; candidate drift after build creates no receipt", async t => {
  const f = auditFixture(t), plan = await planFeatureCloseAudit(f.options);
  const input = { options: f.options, lifecycleId: "close-fixture", expectedPlanSha256: plan.planSha256, activate: true };
  mkdirSync(join(f.root, plan.outputPath), { recursive: true }); writeFileSync(join(f.root, plan.outputPath, "foreign"), "keep");
  assert.equal((await executeFeatureCloseAudit(input)).status, "blocked");
  assert.equal(readFileSync(join(f.root, plan.outputPath, "foreign"), "utf8"), "keep");
  const other = auditFixture(t), otherPlan = await planFeatureCloseAudit(other.options);
  const failed = await executeFeatureCloseAudit({ options: other.options, lifecycleId: "close-fixture", expectedPlanSha256: otherPlan.planSha256, activate: true, fault: at => { if (at === "after-build") other.git(["commit", "--allow-empty", "-qm", "changed candidate"]); } });
  assert.equal(failed.code, "FCA-POSTBUILD-DRIFT");
  assert.equal(existsSync(join(other.root, ".git/agent-pipeline")), false);
});

test("windows file flush: write-capable handle first, a read-only or refused flush is tolerated, other errors still fail", () => {
  const eperm = Object.assign(new Error("operation not permitted"), { code: "EPERM" });
  const eio = Object.assign(new Error("input/output error"), { code: "EIO" });
  const calls = [];
  const spy = (open = () => 7, fsync = () => {}) => ({ open: (p, m) => { calls.push(["open", m]); return open(p, m); }, fsync: fd => { calls.push(["fsync", fd]); return fsync(fd); }, close: fd => { calls.push(["close", fd]); } });
  assert.deepEqual(syncAuditBundleFile("x", { platform: "win32", ...spy() }), { status: "synced" });
  assert.deepEqual(calls.slice(0, 3), [["open", "r+"], ["fsync", 7], ["close", 7]]);
  assert.deepEqual(syncAuditBundleFile("x", { platform: "win32", ...spy(() => { throw eperm; }) }), { status: "unsupported", stage: "open", code: "EPERM" });
  assert.deepEqual(syncAuditBundleFile("x", { platform: "win32", ...spy(undefined, () => { throw eperm; }) }), { status: "unsupported", stage: "fsync", code: "EPERM" });
  assert.throws(() => syncAuditBundleFile("x", { platform: "win32", ...spy(undefined, () => { throw eio; }) }), /input\/output/);
  calls.length = 0;
  assert.deepEqual(syncAuditBundleFile("x", { platform: "linux", ...spy() }), { status: "synced" });
  assert.equal(calls[0][1], "r");
  assert.throws(() => syncAuditBundleFile("x", { platform: "linux", ...spy(undefined, () => { throw eperm; }) }), /not permitted/);
});

test("a failure inside the build names its cause instead of hiding it", async t => {
  const f = auditFixture(t), plan = await planFeatureCloseAudit(f.options);
  const failed = await executeFeatureCloseAudit({ options: f.options, lifecycleId: "close-fixture", expectedPlanSha256: plan.planSha256, activate: true,
    fault: at => { if (at === "after-build") throw Object.assign(new Error("operation not permitted, fsync"), { code: "EPERM" }); } });
  assert.equal(failed.code, "FCA-BUILD-OR-RECEIPT-FAILED");
  assert.match(failed.detail, /Cause: EPERM operation not permitted, fsync/);
  // The consumer's retry: the verified bundle is left behind, a fresh plan reuses it, no rebuild, the receipt is written.
  const retryPlan = await planFeatureCloseAudit(f.options);
  assert.equal(retryPlan.status, "reuse-verified", JSON.stringify(retryPlan));
  const retried = await executeFeatureCloseAudit({ options: f.options, lifecycleId: "close-fixture", expectedPlanSha256: retryPlan.planSha256, activate: true });
  assert.equal(retried.status, "verified-pending-close", JSON.stringify(retried));
});
