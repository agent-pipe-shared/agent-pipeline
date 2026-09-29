// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved sibling callback registration");
  completionCases.push({ id: "FCR" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { auditFixture } from "./feature-close-audit-test-fixture.mjs";
import { planFeatureCloseAudit } from "./feature-close-audit-preflight.mjs";
import { executeFeatureCloseAudit } from "./feature-close-audit-executor.mjs";
import { validateFeatureCloseAuditReceipt } from "./feature-close-audit-receipt.mjs";
import { verifyAuditBundle, verifyAuditBundleSync } from "./audit-bundle.mjs";

test("sync receipt readback requires external exact plan binding and matches async bundle verifier", async t => {
  const f = auditFixture(t), plan = await planFeatureCloseAudit(f.options), lifecycleId = "close-fixture";
  const built = await executeFeatureCloseAudit({ options: f.options, lifecycleId, expectedPlanSha256: plan.planSha256, activate: true });
  assert.equal(built.status, "verified-pending-close", JSON.stringify(built));
  const input = { repositoryRoot: f.root, lifecycleId, expectedPlanSha256: plan.planSha256, plan, receipt: built.receipt };
  assert.equal(validateFeatureCloseAuditReceipt(input).ok, true);
  assert.equal(validateFeatureCloseAuditReceipt({ ...input, expectedPlanSha256: undefined }).ok, false);
  assert.equal(validateFeatureCloseAuditReceipt({ ...input, lifecycleId: "different" }).ok, false);
  assert.equal(validateFeatureCloseAuditReceipt({ ...input, receipt: { ...built.receipt, extra: true } }).ok, false);
  const bundleRoot = join(f.root, plan.outputPath);
  assert.deepEqual(verifyAuditBundleSync({ bundleRoot }), await verifyAuditBundle({ bundleRoot }));
  const result = join(f.root, plan.result.path), original = readFileSync(result);
  writeFileSync(result, "changed"); assert.equal(validateFeatureCloseAuditReceipt(input).code, "FCA-SOURCE-DRIFT"); writeFileSync(result, original);
  writeFileSync(join(bundleRoot, "README.md"), "changed");
  assert.deepEqual(verifyAuditBundleSync({ bundleRoot }), await verifyAuditBundle({ bundleRoot }));
  assert.equal(validateFeatureCloseAuditReceipt(input).code, "FCA-BUNDLE-INVALID");
});

// Register each original sibling callback directly with the canonical recorder.
if (completionCases.length !== 1) throw new Error("Required completion case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
