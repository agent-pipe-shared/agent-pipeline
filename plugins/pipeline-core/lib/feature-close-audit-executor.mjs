// SPDX-License-Identifier: SUL-1.0
/** Coordinator-owned packaging only: no State mutation, signature or publication. */
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { buildAuditBundle } from "./audit-bundle.mjs";
import { canonicalizeJson } from "./governance-event.mjs";
import { planFeatureCloseAudit } from "./feature-close-audit-preflight.mjs";
import { publicationClosePaths, syncPublicationCloseDirectory } from "../scripts/publication-close-journal.mjs";
import { ensurePrivateDirectory } from "./private-boundary.mjs";
import { auditHash, makeFeatureCloseAuditReceipt, physicalAuditPath, validateFeatureCloseAuditReceipt } from "./feature-close-audit-receipt.mjs";

export async function executeFeatureCloseAudit({ options, lifecycleId, expectedPlanSha256, activate = false, fault = () => {} } = {}) {
  const blocked = (code, detail) => ({ status: "blocked", code, detail, featureClosed: false });
  if (!activate) return blocked("FCA-ACTIVATION-REQUIRED", "Apply only the existing confirmed coordinator action.");
  if (!/^[A-Za-z0-9._-]{1,100}$/u.test(lifecycleId ?? "") || [".", ".."].includes(lifecycleId)) return blocked("FCA-LIFECYCLE", "Use one exact coordinator lifecycle ID.");
  const plan = await planFeatureCloseAudit(options);
  if (!["build-required", "reuse-verified"].includes(plan.status)) return { ...plan, featureClosed: false };
  if (plan.planSha256 !== expectedPlanSha256) return blocked("FCA-PLAN-DRIFT", "Re-plan the exact candidate, package and policy; nothing was written.");
  let receiptPath;
  try {
    const root = realpathSync(resolve(options.repositoryRoot));
    const git = spawnSync("git", ["-C", root, "rev-parse", "--git-common-dir"], { encoding: "utf8", timeout: 10000 });
    if (git.status !== 0) return blocked("FCA-GIT-COMMON", "Private coordinator location is unavailable.");
    const common = realpathSync(resolve(root, git.stdout.trim()));
    const directory = publicationClosePaths(common, lifecycleId).directory;
    const evidenceDirectory = join(directory, "evidence");
    receiptPath = join(evidenceDirectory, "feature-close-audit.json");
    // Validate every existing private component before reading or creating it.
    physicalAuditPath(common, relative(common, receiptPath).replaceAll("\\", "/"));
    if (existsSync(receiptPath)) {
      const saved = JSON.parse(readFileSync(receiptPath, "utf8"));
      if (Object.keys(saved).sort().join() !== "plan,receipt") return blocked("FCA-RECEIPT-COLLISION", "Existing private receipt is not this operation; preserve it.");
      const verified = validateFeatureCloseAuditReceipt({ repositoryRoot: root, lifecycleId, expectedPlanSha256, plan: saved.plan, receipt: saved.receipt });
      if (!verified.ok || saved.plan.planSha256 !== plan.planSha256) return blocked("FCA-RECEIPT-COLLISION", "Existing receipt or bundle changed; preserve it and inspect the exact bindings.");
      return { status: "replayed", featureClosed: false, receiptPath, receipt: saved.receipt, receiptSha256: verified.receiptSha256 };
    }
    fault("before-build");
    if (plan.status === "build-required") {
      let cursor = root;
      for (const segment of dirname(plan.outputPath).split("/")) {
        if (segment === ".") continue;
        cursor = join(cursor, segment);
        if (!existsSync(cursor)) mkdirSync(cursor, { mode: 0o700 });
        if (!lstatSync(cursor).isDirectory() || lstatSync(cursor).isSymbolicLink()) throw new Error("FCA-UNSAFE-OUTPUT-PARENT");
      }
      await buildAuditBundle({ repositoryRoot: root, outputPath: plan.outputPath, plan: plan.bundlePlan });
    }
    fault("after-build");
    const current = await planFeatureCloseAudit(options);
    if (current.status !== "reuse-verified" || current.planSha256 !== expectedPlanSha256) return blocked("FCA-POSTBUILD-DRIFT", "Bundle remains local; source or candidate drifted and the feature remains unclosed.");
    // A durable receipt must not precede persistence of the bytes it references.
    for (const file of ["manifest.json", "README.md", ...plan.bundlePlan.artifacts.map(a => a.bundlePath)]) {
      const fd = openSync(physicalAuditPath(root, `${plan.outputPath}/${file}`), "r");
      try { fsyncSync(fd); } finally { closeSync(fd); }
    }
    const bundleRoot = physicalAuditPath(root, plan.outputPath);
    syncPublicationCloseDirectory(join(bundleRoot, "artifacts"));
    syncPublicationCloseDirectory(bundleRoot);
    syncPublicationCloseDirectory(dirname(bundleRoot));
    const receipt = makeFeatureCloseAuditReceipt(plan, lifecycleId, auditHash(readFileSync(physicalAuditPath(root, `${plan.outputPath}/manifest.json`))));
    const verified = validateFeatureCloseAuditReceipt({ repositoryRoot: root, lifecycleId, expectedPlanSha256, plan, receipt });
    if (!verified.ok) return blocked(verified.code, "Bundle verification failed; feature remains unclosed.");
    fault("after-verify");
    ensurePrivateDirectory(evidenceDirectory);
    const fd = openSync(receiptPath, "wx", 0o600);
    try { writeFileSync(fd, `${canonicalizeJson({ plan, receipt })}\n`); fsyncSync(fd); } finally { closeSync(fd); }
    syncPublicationCloseDirectory(evidenceDirectory);
    fault("after-receipt");
    return { status: "verified-pending-close", featureClosed: false, receiptPath, receipt, receiptSha256: verified.receiptSha256 };
  } catch (error) {
    return blocked(error.message?.startsWith("FCA-") ? error.message : "FCA-BUILD-OR-RECEIPT-FAILED", "No feature-close mutation occurred. Preserve any existing partial output; retry verifies complete output and refuses incomplete or conflicting output without overwriting it.");
  }
}
