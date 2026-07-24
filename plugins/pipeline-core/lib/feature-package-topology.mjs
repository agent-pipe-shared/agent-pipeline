// SPDX-License-Identifier: SUL-1.0
/**
 * Closed, portable feature-package topology.
 *
 * This is deliberately an opt-in authority: compatibility repositories are
 * inventoried but never guessed into a lifecycle state.  Once a package has a
 * lifecycle.json manifest, all its authority paths and evidence bindings are
 * checked through this single contract.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

export const FEATURE_PACKAGE_SCHEMA = "pipeline.feature-package.v1";
export const FEATURE_STATES = Object.freeze(["draft", "awaiting-approval", "approved", "implementing", "verifying", "completed", "superseded", "abandoned", "retained"]);
export const FEATURE_CLASSES = Object.freeze(["prd", "spec", "design", "plan", "acceptance", "result", "candidate-evidence"]);
const ACTIVE_STATES = new Set(["awaiting-approval", "approved", "implementing", "verifying", "completed"]);
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0"); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function canonicalRelative(root, value) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value) || value.includes("\\")) return null;
  const cleaned = normalize(value);
  if (cleaned !== value || value.split("/").some((part) => part === "." || part === ".." || part.length === 0)) return null;
  const full = resolve(root, value);
  const rel = relative(root, full);
  return rel === "" || rel.startsWith(`..${sep}`) || isAbsolute(rel) ? null : value;
}
function packageRelative(id, value) {
  const prefix = `specs/${id}/`;
  return typeof value === "string" && value.startsWith(prefix) ? value.slice(prefix.length) : null;
}
function regularFile(root, path, findings, code) {
  const safe = canonicalRelative(root, path);
  if (!safe) { findings.push(`${code}: unsafe path`); return null; }
  try {
    const stat = lstatSync(join(root, safe));
    if (!stat.isFile() || stat.isSymbolicLink()) { findings.push(`${code}: path must be a regular non-symlink file`); return null; }
    return safe;
  } catch { findings.push(`${code}: referenced file is missing`); return null; }
}
function walk(root, start) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) files.push(relative(root, full).split(sep).join("/"));
    }
  };
  if (existsSync(join(root, start))) visit(join(root, start));
  return files.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}

export function inventoryFeaturePackages(rootDir = process.cwd()) {
  const root = resolve(rootDir);
  const specs = join(root, "specs");
  if (!existsSync(specs)) return { packages: [], legacy: [], unknown: [] };
  const packages = []; const legacy = []; const unknown = [];
  for (const entry of readdirSync(specs, { withFileTypes: true }).sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) { unknown.push(`specs/${entry.name}`); continue; }
    const base = `specs/${entry.name}`;
    if (existsSync(join(root, base, "lifecycle.json"))) packages.push(`${base}/lifecycle.json`);
    else legacy.push(base);
  }
  return { packages, legacy, unknown };
}

/** Validate one complete package without treating historical files as authority. */
export function validateFeaturePackage(rootDir = process.cwd(), manifestPath) {
  const root = resolve(rootDir); const findings = [];
  const manifest = regularFile(root, manifestPath, findings, "FTP-MANIFEST");
  if (!manifest) return { ok: false, findings, receipt: null };
  let value;
  try { value = JSON.parse(readFileSync(join(root, manifest), "utf8")); }
  catch { return { ok: false, findings: [...findings, "FTP-MANIFEST: invalid JSON"], receipt: null }; }
  if (!exact(value, ["schema", "feature", "state", "artifacts", "candidate", "supersedes"])) findings.push("FTP-MANIFEST: closed schema keys are required");
  if (value?.schema !== FEATURE_PACKAGE_SCHEMA) findings.push("FTP-MANIFEST: unsupported schema");
  if (!exact(value?.feature, ["id", "rigor"]) || !SAFE_ID.test(value?.feature?.id ?? "") || ![1, 2].includes(value?.feature?.rigor)) findings.push("FTP-FEATURE: id and rigor are invalid");
  const id = value?.feature?.id;
  if (!FEATURE_STATES.includes(value?.state)) findings.push("FTP-STATE: unsupported lifecycle state");
  if (!Array.isArray(value?.artifacts)) findings.push("FTP-ARTIFACTS: artifacts must be an array");
  if (!(value?.candidate === null || exact(value?.candidate, ["commit", "tree"]))) findings.push("FTP-CANDIDATE: candidate must be null or a closed commit/tree binding");
  if (value?.candidate !== null && (!OID.test(value.candidate?.commit ?? "") || !OID.test(value.candidate?.tree ?? ""))) findings.push("FTP-CANDIDATE: candidate identity is invalid");
  if (!(value?.supersedes === null || (typeof value?.supersedes === "string" && SAFE_ID.test(value.supersedes)))) findings.push("FTP-SUPERSEDES: relationship must be null or a safe feature id");

  const seen = new Set(); const folded = new Set(); const classes = new Map();
  for (const [index, artifact] of (Array.isArray(value?.artifacts) ? value.artifacts : []).entries()) {
    const label = `FTP-ARTIFACT-${index}`;
    if (!exact(artifact, ["class", "path", "sha256", "authority", "mutability", "retention"])) { findings.push(`${label}: closed artifact keys are required`); continue; }
    if (!FEATURE_CLASSES.includes(artifact.class)) findings.push(`${label}: unsupported class`);
    const rel = packageRelative(id, artifact.path);
    if (!rel || !canonicalRelative(root, artifact.path)) findings.push(`${label}: path must be canonical within specs/${id}/`);
    const file = rel ? regularFile(root, artifact.path, findings, label) : null;
    const caseKey = typeof artifact.path === "string" ? artifact.path.normalize("NFC").toLocaleLowerCase("en-US") : "";
    if (caseKey && folded.has(caseKey)) findings.push(`${label}: case-fold or Unicode-normalization collision`);
    if (caseKey) folded.add(caseKey);
    if (file && seen.has(file)) findings.push(`${label}: duplicate artifact path`);
    if (file) seen.add(file);
    if (!SHA256.test(artifact.sha256 ?? "") || (file && digest(readFileSync(join(root, file))) !== artifact.sha256)) findings.push(`${label}: digest does not bind file bytes`);
    if (typeof artifact.authority !== "boolean" || !["mutable", "append-only", "immutable"].includes(artifact.mutability) || !["active", "retain", "archive"].includes(artifact.retention)) findings.push(`${label}: authority, mutability, or retention is invalid`);
    if (artifact.authority && !["prd", "spec", "acceptance", "result"].includes(artifact.class)) findings.push(`${label}: only authority classes may be authoritative`);
    if (artifact.class === "candidate-evidence" && (artifact.authority || artifact.mutability !== "immutable")) findings.push(`${label}: candidate evidence is immutable non-authority evidence`);
    classes.set(artifact.class, [...(classes.get(artifact.class) ?? []), artifact]);
  }
  const required = value?.state === "draft" ? ["prd"] : ACTIVE_STATES.has(value?.state) ? ["prd", "spec", "acceptance", "result", "candidate-evidence"] : [];
  for (const kind of required) if ((classes.get(kind) ?? []).length === 0) findings.push(`FTP-REQUIRED: ${kind} is required for ${value?.state}`);
  if (ACTIVE_STATES.has(value?.state)) for (const kind of ["prd", "spec"]) {
    const authority = (classes.get(kind) ?? []).filter((artifact) => artifact.authority);
    if (authority.length !== 1) findings.push(`FTP-AUTHORITY: exactly one authoritative ${kind} is required`);
  }
  if (["verifying", "completed"].includes(value?.state) && value?.candidate === null) findings.push("FTP-CANDIDATE: verifying/completed packages require an exact candidate binding");
  if (["superseded", "retained"].includes(value?.state) && value?.supersedes === null) findings.push("FTP-SUPERSEDES: retained/superseded packages require a relationship");
  const receipt = { schema: "pipeline.feature-package-receipt.v1", manifest, manifestSha256: digest(readFileSync(join(root, manifest))), featureId: SAFE_ID.test(id ?? "") ? id : null, state: FEATURE_STATES.includes(value?.state) ? value.state : null, candidate: value?.candidate ?? null, artifactCount: Array.isArray(value?.artifacts) ? value.artifacts.length : 0, findingCount: findings.length };
  return { ok: findings.length === 0, findings, receipt };
}

/** A non-mutating, idempotent transition preview. Application remains a human-gated writer. */
export function planFeaturePackageTransition(rootDir = process.cwd(), manifestPath, nextState) {
  const checked = validateFeaturePackage(rootDir, manifestPath);
  if (!checked.ok) return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: "invalid-current-package", findings: checked.findings };
  if (!FEATURE_STATES.includes(nextState)) return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: "invalid-target-state", findings: [] };
  if (checked.receipt.state === nextState) return { schema: "pipeline.feature-package-transition-plan.v1", status: "noop", manifest: checked.receipt.manifest, from: nextState, to: nextState, changes: [] };
  if (["completed", "retained"].includes(checked.receipt.state) || ["draft", "abandoned"].includes(nextState)) return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: "invalid-transition", findings: [] };
  return { schema: "pipeline.feature-package-transition-plan.v1", status: "preview", manifest: checked.receipt.manifest, from: checked.receipt.state, to: nextState, changes: [{ path: checked.receipt.manifest, operation: "replace-manifest-state" }], requiredAuthority: nextState === "awaiting-approval" ? "po" : "lifecycle" };
}

export function validateFeatureTopology(rootDir = process.cwd()) {
  const root = resolve(rootDir); const inventory = inventoryFeaturePackages(root); const findings = [];
  const receipts = inventory.packages.map((manifest) => {
    const checked = validateFeaturePackage(root, manifest);
    findings.push(...checked.findings.map((finding) => `${manifest}: ${finding}`));
    return checked.receipt;
  });
  for (const path of walk(root, "specs")) if (path.endsWith("/lifecycle.json") && !inventory.packages.includes(path)) findings.push(`${path}: FTP-INVENTORY: manifest is not in a safe feature package`);
  return { ok: findings.length === 0, schema: "pipeline.feature-topology-validation.v1", inventory, receipts, findings };
}
