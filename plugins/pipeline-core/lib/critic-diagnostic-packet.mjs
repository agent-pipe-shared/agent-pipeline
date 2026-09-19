// SPDX-License-Identifier: SUL-1.0
import { mkdirSync, readFileSync, lstatSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CRITIC_DIAGNOSTIC_SCHEMA, diagnosticDigest, diagnosticPath, inspectCriticVerifyDiagnostic, readDiagnosticArtifact, validateCriticDiagnostic } from "./critic-diagnostic-evidence.mjs";
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const PREFIX = ".git/agent-pipeline-diagnostics/";
function fail() { throw new Error("CPP-DIAGNOSTIC"); }
export function validateDiagnosticBundleShape(bundle) {
  try {
    if (!exact(bundle, ["schema", "items", "artifacts"]) || bundle.schema !== "pipeline.critic-diagnostic-bundle.v1" || !Array.isArray(bundle.items) || bundle.items.length === 0 || bundle.items.length > 8 || !Array.isArray(bundle.artifacts) || bundle.artifacts.length > 24) return false;
    let size = 0;
    const artifacts = new Map();
    for (const a of bundle.artifacts) {
      if (!exact(a, ["sourcePath", "path", "sha256", "content"]) || typeof a.content !== "string" || !/^[a-f0-9]{64}$/u.test(a.sha256) || a.path !== `${PREFIX}${a.sha256}.txt` || diagnosticDigest(a.content) !== a.sha256 || artifacts.has(a.sourcePath)) return false;
      diagnosticPath(a.sourcePath); size += Buffer.byteLength(a.content); artifacts.set(a.sourcePath, a);
    }
    if (size > 4 * 1024 * 1024 || new Set(bundle.items.map(i => i?.sourcePath)).size !== bundle.items.length) return false;
    const referenced = new Set();
    for (const i of bundle.items) {
      if (!exact(i, ["sourcePath", "path", "sha256", "status"]) || !exact(i.status, ["fullVerify", "targeted"]) || !["passed", "failed", "not-run", "not-established"].includes(i.status.fullVerify) || !["passed", "failed", "not-applicable"].includes(i.status.targeted)) return false;
      const a = artifacts.get(i.sourcePath);
      if (!a || i.path !== a.path || i.sha256 !== a.sha256) return false;
      referenced.add(i.sourcePath);
      const value = JSON.parse(a.content);
      if (value.schema === CRITIC_DIAGNOSTIC_SCHEMA) {
        referenced.add(value.targeted?.log?.path);
        if (value.fullVerify?.evidence) referenced.add(value.fullVerify.evidence.path);
      } else if (value.schema !== "pipeline.verify-evidence.v0") return false;
    }
    if (referenced.size !== artifacts.size || [...referenced].some(path => !artifacts.has(path))) return false;
    return true;
  } catch { return false; }
}
function statusOf(value, context) {
  if (value.schema === CRITIC_DIAGNOSTIC_SCHEMA) {
    const result = validateCriticDiagnostic(value, context);
    return { fullVerify: result.fullVerify, targeted: result.targeted.status };
  }
  const result = inspectCriticVerifyDiagnostic(value, context.candidate);
  return { fullVerify: result.execution === "full" ? result.status : "not-established", targeted: "not-applicable" };
}
export function createDiagnosticBundle({ root, candidate, evidencePaths, spec, guardrails }) {
  if (!Array.isArray(evidencePaths) || evidencePaths.length === 0 || evidencePaths.length > 8) fail();
  const artifacts = new Map();
  const include = sourcePath => {
    const bytes = readDiagnosticArtifact(root, sourcePath), content = bytes.toString("utf8");
    if (!Buffer.from(content).equals(bytes)) fail();
    const sha256 = diagnosticDigest(bytes);
    const artifact = { sourcePath, path: `${PREFIX}${sha256}.txt`, sha256, content };
    artifacts.set(sourcePath, artifact); return artifact;
  };
  const items = evidencePaths.map(sourcePath => {
    const artifact = include(sourcePath), value = JSON.parse(artifact.content);
    const status = statusOf(value, { root, candidate, spec, guardrails });
    if (value.schema === CRITIC_DIAGNOSTIC_SCHEMA) {
      include(value.targeted.log.path);
      if (value.fullVerify.evidence) include(value.fullVerify.evidence.path);
    }
    return { sourcePath, path: artifact.path, sha256: artifact.sha256, status };
  });
  const bundle = { schema: "pipeline.critic-diagnostic-bundle.v1", items, artifacts: [...artifacts.values()].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath)) };
  if (!validateDiagnosticBundleShape(bundle)) fail();
  return bundle;
}
export function materializeDiagnosticBundle(checkout, bundle) {
  if (!validateDiagnosticBundleShape(bundle)) fail();
  const written = new Set();
  for (const artifact of bundle.artifacts) {
    if (written.has(artifact.path)) continue;
    const target = join(checkout, artifact.path);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, artifact.content, { mode: 0o600, flag: "wx" });
    written.add(artifact.path);
  }
}
export function revalidateDiagnosticBundle({ checkout, candidate, bundle, spec, guardrails }) {
  if (!validateDiagnosticBundleShape(bundle)) fail();
  const bySource = new Map(bundle.artifacts.map(a => [a.sourcePath, a]));
  const readArtifact = path => {
    const artifact = bySource.get(path); if (!artifact) fail();
    const target = join(checkout, artifact.path), stat = lstatSync(target);
    const directory = dirname(target);
    if (lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== join(realpathSync(checkout), ".git", "agent-pipeline-diagnostics")) fail();
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024) fail();
    const bytes = readFileSync(target);
    if (diagnosticDigest(bytes) !== artifact.sha256) fail();
    return bytes;
  };
  for (const artifact of bundle.artifacts) readArtifact(artifact.sourcePath);
  for (const item of bundle.items) {
    const value = JSON.parse(readArtifact(item.sourcePath));
    const status = statusOf(value, { root: checkout, candidate, spec, guardrails, readArtifact });
    if (JSON.stringify(status) !== JSON.stringify(item.status)) fail();
  }
  return true;
}
export function diagnosticReviewerReferences(bundle) {
  if (!validateDiagnosticBundleShape(bundle)) fail();
  return { schema: "pipeline.critic-diagnostic-references.v1", items: bundle.items.map(({ path, sha256, status }) => ({ path, sha256, status })), references: bundle.artifacts.map(({ path, sha256 }) => ({ path, sha256 })) };
}
