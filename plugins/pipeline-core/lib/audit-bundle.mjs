// SPDX-License-Identifier: SUL-1.0
/** Candidate-bound, offline-verifiable audit bundle service. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { copyFile, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { canonicalSha256, canonicalizeJson, parseStrictJson } from "./governance-event.mjs";
import { validateFeaturePackage } from "./feature-package-topology.mjs";
import { resolveEffectiveOrganizationPolicy } from "./organization-policy.mjs";

const SHA = /^[a-f0-9]{64}$/u; const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u; const BUNDLE_ID = /^[a-z][a-z0-9-]{2,63}$/u;
function fail(code, message = "Audit bundle operation is invalid.") { const error = new Error(message); error.code = code; throw error; }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function rootPath(root, path, code) { if (typeof path !== "string" || path.length === 0 || isAbsolute(path) || path.includes("\\")) fail(code); const target = resolve(root, path); const check = relative(root, target); if (check === "" || check === ".." || check.startsWith(`..${sep}`) || isAbsolute(check)) fail(code); return target; }
function planShape(plan) { return exact(plan, ["schema", "status", "bundleId", "candidate", "effectivePolicy", "effectivePolicySha256", "artifacts"])
  && plan.schema === "pipeline.audit-bundle-plan.v1" && plan.status === "preview" && BUNDLE_ID.test(plan.bundleId) && exact(plan.candidate, ["commit", "tree"]) && OID.test(plan.candidate.commit) && OID.test(plan.candidate.tree) && SHA.test(plan.effectivePolicySha256) && canonicalSha256(plan.effectivePolicy) === plan.effectivePolicySha256 && Array.isArray(plan.artifacts) && plan.artifacts.length > 0 && plan.artifacts.every((entry) => exact(entry, ["sourcePath", "bundlePath", "sha256"]) && typeof entry.sourcePath === "string" && /^artifacts\/[0-9]{3}-[a-z-]+$/u.test(entry.bundlePath) && SHA.test(entry.sha256)); }

export function planAuditBundle({ repositoryRoot, manifestPath, bundleId, coreVersion, packs } = {}) {
  const root = resolve(repositoryRoot ?? ""); if (!BUNDLE_ID.test(bundleId ?? "")) fail("AB-BUNDLE-ID");
  const packageCheck = validateFeaturePackage(root, manifestPath); if (!packageCheck.ok || !packageCheck.receipt?.candidate) fail("AB-PACKAGE");
  const policy = resolveEffectiveOrganizationPolicy({ coreVersion, packs });
  const manifest = JSON.parse(readFileSync(join(root, packageCheck.receipt.manifest), "utf8"));
  const artifacts = manifest.artifacts.map((entry, index) => ({ sourcePath: entry.path, bundlePath: `artifacts/${String(index + 1).padStart(3, "0")}-${entry.class}`, sha256: entry.sha256 }));
  return Object.freeze({ schema: "pipeline.audit-bundle-plan.v1", status: "preview", bundleId, candidate: Object.freeze({ ...packageCheck.receipt.candidate }), effectivePolicy: policy, effectivePolicySha256: canonicalSha256(policy), artifacts: Object.freeze(artifacts.map((entry) => Object.freeze(entry))) });
}

export async function buildAuditBundle({ repositoryRoot, outputPath, plan } = {}) {
  const root = resolve(repositoryRoot ?? ""); if (!planShape(plan)) fail("AB-PLAN"); const output = rootPath(root, outputPath, "AB-OUTPUT");
  try { await lstat(output); fail("AB-OUTPUT-EXISTS"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  await mkdir(output, { recursive: false }); await mkdir(join(output, "artifacts"));
  for (const artifact of plan.artifacts) { const source = rootPath(root, artifact.sourcePath, "AB-SOURCE"); const bytes = await readFile(source); if (digest(bytes) !== artifact.sha256) fail("AB-SOURCE-DIGEST"); await copyFile(source, join(output, artifact.bundlePath)); }
  const manifest = { schema: "pipeline.audit-bundle-manifest.v1", bundleId: plan.bundleId, candidate: plan.candidate, effectivePolicySha256: plan.effectivePolicySha256, artifacts: plan.artifacts.map((entry) => ({ path: entry.bundlePath, sourcePath: entry.sourcePath, sha256: entry.sha256 })) };
  const bytes = `${canonicalizeJson(manifest)}\n`; await writeFile(join(output, "manifest.json"), bytes, { encoding: "utf8", flag: "wx", mode: 0o644 });
  return Object.freeze({ schema: "pipeline.audit-bundle-build-receipt.v1", status: "built", bundleId: plan.bundleId, outputPath, manifestSha256: digest(bytes), candidate: plan.candidate, effectivePolicySha256: plan.effectivePolicySha256 });
}

export async function verifyAuditBundle({ bundleRoot } = {}) {
  const root = resolve(bundleRoot ?? ""); let manifest;
  try { manifest = parseStrictJson(await readFile(join(root, "manifest.json"))); } catch { return Object.freeze({ schema: "pipeline.audit-bundle-verification.v1", status: "invalid", findings: Object.freeze(["AB-MANIFEST"]) }); }
  const findings = []; if (!exact(manifest, ["schema", "bundleId", "candidate", "effectivePolicySha256", "artifacts"]) || manifest.schema !== "pipeline.audit-bundle-manifest.v1" || !BUNDLE_ID.test(manifest.bundleId) || !exact(manifest.candidate, ["commit", "tree"]) || !OID.test(manifest.candidate.commit) || !OID.test(manifest.candidate.tree) || !SHA.test(manifest.effectivePolicySha256) || !Array.isArray(manifest.artifacts)) findings.push("AB-MANIFEST");
  for (const artifact of manifest.artifacts ?? []) { if (!exact(artifact, ["path", "sourcePath", "sha256"]) || typeof artifact.sourcePath !== "string" || !/^artifacts\/[0-9]{3}-[a-z-]+$/u.test(artifact.path) || !SHA.test(artifact.sha256)) { findings.push("AB-ARTIFACT"); continue; } try { if (digest(await readFile(join(root, artifact.path))) !== artifact.sha256) findings.push(`AB-DIGEST ${artifact.path}`); } catch { findings.push(`AB-MISSING ${artifact.path}`); } }
  return Object.freeze({ schema: "pipeline.audit-bundle-verification.v1", status: findings.length ? "invalid" : "verified", candidate: manifest.candidate ?? null, findings: Object.freeze(findings) });
}
