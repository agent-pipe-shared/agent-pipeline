// SPDX-License-Identifier: SUL-1.0
/** Read-only preflight. Snapshot qualification never closes a feature. */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { planAuditBundle, verifyAuditBundle } from "./audit-bundle.mjs";
import { validateFeaturePackage } from "./feature-package-topology.mjs";
import { canonicalSha256, canonicalizeJson } from "./governance-event.mjs";
import { verifyEvidenceSatisfiesBoundary } from "./verify-selection.mjs";

const ID = /^[a-z][a-z0-9-]{2,63}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const same = (a, b) => canonicalizeJson(a) === canonicalizeJson(b);
function safePath(root, relative) {
  if (typeof relative !== "string" || /[\\:\x00-\x1f]/u.test(relative) || relative.split("/").some(p => !p || p === "." || p === "..")) throw new Error("FCA-UNSAFE-PATH");
  let current = root;
  for (const part of relative.split("/")) {
    current = join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error("FCA-SYMLINK"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return current;
}
function blocked(code, remedy) { return { schema: "pipeline.feature-close-audit-preflight.v1", status: "blocked", code, remedy, mutation: false, requiresAdditionalApproval: false }; }

export async function planFeatureCloseAudit({ repositoryRoot, featureId, candidate, manifestPath, coreVersion, packs, outputPath } = {}) {
  if (!ID.test(featureId ?? "")) return blocked("FCA-FEATURE-ID", "Supply the exact active feature ID as one safe path component.");
  if (!candidate || Object.keys(candidate).sort().join() !== "commit,tree" || !OID.test(candidate.commit ?? "") || !OID.test(candidate.tree ?? "") || candidate.commit === candidate.tree || /^0+$/u.test(candidate.commit) || /^0+$/u.test(candidate.tree)) return blocked("FCA-CANDIDATE", "Resolve the qualified source candidate commit and tree before planning its snapshot.");
  if (!Array.isArray(packs) || packs.length === 0) return blocked("FCA-POLICY-REQUIRED", "Resolve the applicable organization policy packs and core version through the existing policy workflow; do not invent a policy to complete closure.");
  try {
    const root = realpathSync(resolve(repositoryRoot));
    safePath(root, manifestPath);
    const check = validateFeaturePackage(root, manifestPath);
    if (!check.ok || check.receipt.featureId !== featureId || check.receipt.state !== "completed" || !same(check.receipt.candidate, candidate)) return blocked("FCA-PACKAGE", "Complete and reconcile the exact feature package, Result and candidate evidence before snapshot planning.");
    const git = args => {
      const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 10000 });
      return result.status === 0 ? result.stdout.trim() : null;
    };
    if (git(["rev-parse", "HEAD"]) !== candidate.commit || git(["rev-parse", "HEAD^{tree}"]) !== candidate.tree) return blocked("FCA-CANDIDATE-CHANGED", "Requalify the actual current candidate and re-plan; never relabel historical evidence.");
    const manifestBytes = readFileSync(safePath(root, manifestPath));
    const manifest = JSON.parse(manifestBytes);
    const results = manifest.artifacts.filter(a => a.class === "result");
    if (results.length !== 1 || readFileSync(safePath(root, results[0].path)).length === 0) return blocked("FCA-RESULT", "Provide one non-empty digest-bound Result in the validated feature package.");
    const qualification = manifest.artifacts.filter(a => a.class === "candidate-evidence").find(a => {
      try {
        const value = JSON.parse(readFileSync(safePath(root, a.path), "utf8"));
        return value.schema === "pipeline.verify-evidence.v0" && value.exitCode === 0 && same(value.candidate, candidate) && value.commit === candidate.commit && value.tree === candidate.tree && verifyEvidenceSatisfiesBoundary(value, "candidate");
      } catch { return false; }
    });
    if (!qualification) return blocked("FCA-QUALIFICATION", "Produce passing candidate-bound Verify evidence and bind it into the package. Diagnostic or stale evidence is not qualification.");
    let bundlePlan;
    try { bundlePlan = planAuditBundle({ repositoryRoot: root, manifestPath, bundleId: featureId, coreVersion, packs }); }
    catch (error) { return blocked(error.code ?? "FCA-POLICY-INVALID", "Validate the package and applicable organization policy using their existing preparation workflows."); }
    const destination = outputPath ?? `audit-bundles/${featureId}/${candidate.commit}`;
    const target = safePath(root, destination);
    const binding = { featureId, candidate, outputPath: destination, packageManifest: { path: manifestPath, sha256: hash(manifestBytes) }, result: { path: results[0].path, sha256: results[0].sha256 }, qualification: { path: qualification.path, sha256: qualification.sha256 }, bundlePlan };
    let status = "build-required", existingManifestSha256 = null;
    let exists = false;
    try { exists = lstatSync(target).isDirectory(); if (!exists) return blocked("FCA-OUTPUT-COLLISION", "Preserve the existing output; select another explicit destination or inspect the collision."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (exists) {
      const bytes = readFileSync(safePath(root, `${destination}/manifest.json`));
      const prior = JSON.parse(bytes);
      // Check every manifest-selected path before the existing verifier reads it.
      if (!Array.isArray(prior.artifacts)) return blocked("FCA-OUTPUT-COLLISION", "Preserve the malformed existing snapshot and inspect it before retry.");
      for (const artifact of prior.artifacts) safePath(root, `${destination}/${artifact.path}`);
      safePath(root, `${destination}/README.md`);
      const verification = await verifyAuditBundle({ bundleRoot: target });
      const expectedArtifacts = bundlePlan.artifacts.map(a => ({ path: a.bundlePath, sourcePath: a.sourcePath, sha256: a.sha256 }));
      if (verification.status !== "verified" || !prior.readmeSha256 || prior.bundleId !== featureId || !same(prior.candidate, candidate) || prior.effectivePolicySha256 !== bundlePlan.effectivePolicySha256 || !same(prior.artifacts, expectedArtifacts)) return blocked("FCA-OUTPUT-COLLISION", "Existing snapshot is incomplete, changed or differently bound. Preserve it; inspect and use a distinct explicit output if recovery requires it.");
      status = "reuse-verified";
      existingManifestSha256 = hash(bytes);
    }
    return { schema: "pipeline.feature-close-audit-preflight.v1", status, ...binding, planSha256: canonicalSha256(binding), existingManifestSha256, mutation: false, requiresAdditionalApproval: false,
      assurance: "candidate-bound-local-snapshot-not-closure-or-backup", nextStep: status === "build-required" ? "Revalidate this plan, create missing destination parents safely, build create-only with bundlePlan, then verify before close." : "Revalidate the exact bundle and source bindings before the existing governed close transition." };
  } catch (error) { return blocked(error.message?.startsWith("FCA-") ? error.message : "FCA-INPUT-UNAVAILABLE", "Inspect missing, malformed or unsafe package/output inputs; preserve existing files and re-plan without writes."); }
}
