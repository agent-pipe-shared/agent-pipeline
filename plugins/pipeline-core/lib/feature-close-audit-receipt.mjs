// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalSha256, canonicalizeJson } from "./governance-event.mjs";
import { verifyAuditBundleSync } from "./audit-bundle.mjs";

export const auditHash = bytes => createHash("sha256").update(bytes).digest("hex");
const same = (a, b) => canonicalizeJson(a) === canonicalizeJson(b);
export function physicalAuditPath(root, relative) {
  if (typeof relative !== "string" || /[\\:\x00-\x1f]/u.test(relative) || relative.split("/").some(p => !p || p === "." || p === "..")) throw new Error("FCA-UNSAFE-PATH");
  let current = root;
  for (const part of relative.split("/")) {
    current = join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error("FCA-SYMLINK"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return current;
}
export function auditPlanBinding(plan) {
  return Object.fromEntries(["featureId", "candidate", "outputPath", "packageManifest", "result", "qualification", "bundlePlan"].map(key => [key, plan[key]]));
}
export function makeFeatureCloseAuditReceipt(plan, lifecycleId, manifestSha256) {
  return { schema: "pipeline.feature-close-audit-receipt.v1", lifecycleId, featureId: plan.featureId, sourceCandidate: plan.candidate, planSha256: plan.planSha256,
    packageManifestSha256: plan.packageManifest.sha256, resultSha256: plan.result.sha256, effectivePolicySha256: plan.bundlePlan.effectivePolicySha256,
    outputPath: plan.outputPath, manifestSha256, status: "verified-pending-close" };
}
/** Synchronous writer boundary: expectedPlanSha256 must come from coordinator authority. */
export function validateFeatureCloseAuditReceipt({ repositoryRoot, lifecycleId, expectedPlanSha256, plan, receipt } = {}) {
  try {
    if (!/^[A-Za-z0-9._-]{1,100}$/u.test(lifecycleId ?? "") || [".", ".."].includes(lifecycleId) || !/^[a-f0-9]{64}$/u.test(expectedPlanSha256 ?? "") || canonicalSha256(auditPlanBinding(plan)) !== expectedPlanSha256 || plan.planSha256 !== expectedPlanSha256) throw new Error("FCA-RECEIPT-BINDING");
    const root = realpathSync(resolve(repositoryRoot));
    if (!receipt || !/^[a-f0-9]{64}$/u.test(receipt.manifestSha256 ?? "") || !same(receipt, makeFeatureCloseAuditReceipt(plan, lifecycleId, receipt.manifestSha256))) throw new Error("FCA-RECEIPT-SHAPE");
    const git = arg => { const result = spawnSync("git", ["-C", root, "rev-parse", arg], { encoding: "utf8", timeout: 10000 }); return result.status === 0 ? result.stdout.trim() : null; };
    if (git("HEAD") !== plan.candidate.commit || git("HEAD^{tree}") !== plan.candidate.tree) throw new Error("FCA-CANDIDATE-CHANGED");
    for (const binding of [plan.packageManifest, plan.result, plan.qualification, ...plan.bundlePlan.artifacts.map(a => ({ path: a.sourcePath, sha256: a.sha256 }))]) {
      if (auditHash(readFileSync(physicalAuditPath(root, binding.path))) !== binding.sha256) throw new Error("FCA-SOURCE-DRIFT");
    }
    const target = physicalAuditPath(root, plan.outputPath);
    const bytes = readFileSync(physicalAuditPath(root, `${plan.outputPath}/manifest.json`));
    if (auditHash(bytes) !== receipt.manifestSha256) throw new Error("FCA-MANIFEST-DRIFT");
    const manifest = JSON.parse(bytes);
    if (!Array.isArray(manifest.artifacts)) throw new Error("FCA-BUNDLE-INVALID");
    for (const item of manifest.artifacts) physicalAuditPath(root, `${plan.outputPath}/${item.path}`);
    physicalAuditPath(root, `${plan.outputPath}/README.md`);
    const artifacts = plan.bundlePlan.artifacts.map(a => ({ path: a.bundlePath, sourcePath: a.sourcePath, sha256: a.sha256 }));
    if (!manifest.readmeSha256 || manifest.bundleId !== plan.featureId || !same(manifest.candidate, plan.candidate) || manifest.effectivePolicySha256 !== plan.bundlePlan.effectivePolicySha256 || !same(manifest.artifacts, artifacts) || verifyAuditBundleSync({ bundleRoot: target }).status !== "verified") throw new Error("FCA-BUNDLE-INVALID");
    return { ok: true, status: "verified-pending-close", receiptSha256: canonicalSha256(receipt) };
  } catch (error) { return { ok: false, code: error.message?.startsWith("FCA-") ? error.message : "FCA-RECEIPT-UNAVAILABLE" }; }
}
