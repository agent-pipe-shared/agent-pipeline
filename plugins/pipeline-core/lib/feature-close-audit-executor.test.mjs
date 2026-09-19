// SPDX-License-Identifier: SUL-1.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { auditFixture } from "./feature-close-audit-test-fixture.mjs";
import { planFeatureCloseAudit } from "./feature-close-audit-preflight.mjs";
import { executeFeatureCloseAudit } from "./feature-close-audit-executor.mjs";

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
