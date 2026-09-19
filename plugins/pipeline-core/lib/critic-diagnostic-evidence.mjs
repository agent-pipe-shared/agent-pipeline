// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { captureEvidence } from "../scripts/capture-evidence.mjs";
import { validateVerifySelection } from "./verify-selection.mjs";

export const CRITIC_DIAGNOSTIC_SCHEMA = "pipeline.critic-diagnostic-evidence.v1";
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export const diagnosticDigest = bytes => createHash("sha256").update(bytes).digest("hex");
function fail(code) { const error = new Error(code); error.code = code; throw error; }
export function diagnosticPath(path) {
  if (typeof path !== "string" || path.length > 240 || !path || isAbsolute(path) || /[\\\x00-\x1f:]/u.test(path) || path.split("/").some(part => !part || part === "." || part === "..")) fail("CDI-PATH");
  return path;
}
export function readDiagnosticArtifact(root, path) {
  diagnosticPath(path);
  const realRoot = realpathSync(root), absolute = resolve(realRoot, path);
  const rel = relative(realRoot, realpathSync(absolute));
  const stat = lstatSync(absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || stat.isSymbolicLink() || !stat.isFile() || stat.size > 16 * 1024 * 1024) fail("CDI-ARTIFACT");
  return readFileSync(absolute);
}
export function newDiagnosticPath(root, path) {
  diagnosticPath(path);
  if (!path.startsWith("evidence/")) fail("CDI-OUTPUT-PATH");
  const realRoot = realpathSync(root);
  let at = realRoot;
  for (const part of path.split("/")) {
    at = resolve(at, part);
    if (existsSync(at) && lstatSync(at).isSymbolicLink()) fail("CDI-OUTPUT-PATH");
  }
  if (existsSync(at)) fail("CDI-OUTPUT-EXISTS");
  return at;
}
function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 10000 });
  if (result.error || result.status !== 0) fail("CDI-GIT");
  return result.stdout;
}
function candidateBinding(root, candidate) {
  const commit = git(root, ["rev-parse", "--verify", `${candidate}^{commit}`]).trim();
  const tree = git(root, ["rev-parse", `${commit}^{tree}`]).trim();
  if (!OID.test(commit) || !OID.test(tree)) fail("CDI-CANDIDATE");
  return { commit, tree };
}
function source(root, candidate, path) {
  diagnosticPath(path);
  return { path, sha256: diagnosticDigest(git(root, ["show", `${candidate}:${path}`])) };
}
/** Critic diagnostics only. This NEVER satisfies candidate/push/release qualification. */
export function inspectCriticVerifyDiagnostic(value, candidate) {
  const s = value?.selection;
  if (value?.schema !== "pipeline.verify-evidence.v0" || value.commit !== candidate.commit || value.tree !== candidate.tree || !validateVerifySelection(s) || s.candidateCommit !== value.commit || s.mode !== "critic" || !(s.unmatchedPaths.length === 0 || (s.execution === "full" && s.omittedSuiteIds.length === 0)) || !Number.isInteger(value.exitCode) || value.exitCode < 0 || !Array.isArray(value.steps) || value.steps.length === 0 || value.steps.some(step => !step || typeof step.name !== "string" || !Number.isInteger(step.exitCode) || step.exitCode < 0)) fail("CDI-VERIFY");
  if (value.exitCode === 0 && value.steps.some(step => step.exitCode !== 0)) fail("CDI-VERIFY");
  return { kind: "verify-diagnostic", status: value.exitCode === 0 ? "passed" : "failed", exitCode: value.exitCode, mode: s.mode, execution: s.execution };
}
function validateReference(value) {
  if (!exact(value, ["path", "sha256"]) || !SHA.test(value.sha256)) fail("CDI-REFERENCE");
  diagnosticPath(value.path);
}
export function validateCriticDiagnostic(value, { root, candidate, spec = null, guardrails = null, readArtifact = path => readDiagnosticArtifact(root, path) } = {}) {
  if (!exact(value, ["schema", "producer", "assurance", "candidate", "spec", "guardrails", "fullVerify", "targeted", "pending"]) || value.schema !== CRITIC_DIAGNOSTIC_SCHEMA || value.producer !== "critic-diagnostic-evidence" || value.assurance !== "captured-process-output-not-host-attested" || !exact(value.candidate, ["commit", "tree"]) || !OID.test(value.candidate.commit) || !OID.test(value.candidate.tree) || value.candidate.commit !== candidate.commit || value.candidate.tree !== candidate.tree) fail("CDI-BINDING");
  validateReference(value.spec);
  if (!Array.isArray(value.guardrails) || value.guardrails.length > 128 || new Set(value.guardrails.map(row => row?.path)).size !== value.guardrails.length) fail("CDI-GUARDRAILS");
  value.guardrails.forEach(validateReference);
  for (const row of [value.spec, ...value.guardrails]) if (source(root, candidate.commit, row.path).sha256 !== row.sha256) fail("CDI-SOURCE-DIGEST");
  if (spec && (spec.path !== value.spec.path || spec.sha256 !== value.spec.sha256)) fail("CDI-SPEC");
  if (guardrails && guardrails.some(row => !value.guardrails.some(saved => saved.path === row.path && saved.sha256 === row.sha256))) fail("CDI-GUARDRAILS");
  if (!exact(value.fullVerify, ["status", "evidence"]) || !["not-run", "passed", "failed"].includes(value.fullVerify.status)) fail("CDI-FULL-VERIFY");
  if (value.fullVerify.status === "not-run") { if (value.fullVerify.evidence !== null) fail("CDI-FULL-VERIFY"); }
  else {
    validateReference(value.fullVerify.evidence);
    const bytes = readArtifact(value.fullVerify.evidence.path);
    if (diagnosticDigest(bytes) !== value.fullVerify.evidence.sha256) fail("CDI-DIGEST");
    const observed = inspectCriticVerifyDiagnostic(JSON.parse(bytes), candidate);
    if (observed.execution !== "full" || observed.status !== value.fullVerify.status) fail("CDI-FULL-VERIFY");
  }
  const t = value.targeted;
  if (!exact(t, ["label", "status", "exitCode", "log"]) || typeof t.label !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(t.label) || !Number.isInteger(t.exitCode) || t.exitCode < 0 || t.status !== (t.exitCode === 0 ? "passed" : "failed")) fail("CDI-TARGETED");
  validateReference(t.log);
  const log = readArtifact(t.log.path);
  if (diagnosticDigest(log) !== t.log.sha256 || !log.toString("utf8").startsWith("command: ") || !log.toString("utf8").includes(`\nlabel: ${t.label}\nexitCode: ${t.exitCode}\n--- stdout ---\n`) || !log.toString("utf8").includes("\n--- stderr ---\n")) fail("CDI-DIGEST");
  if (!Array.isArray(value.pending) || value.pending.some(id => typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(id)) || new Set(value.pending).size !== value.pending.length || (value.fullVerify.status === "not-run" && !value.pending.includes("full-verify"))) fail("CDI-PENDING");
  return { kind: "critic-diagnostic", fullVerify: value.fullVerify.status, targeted: { status: t.status, exitCode: t.exitCode, log: t.log }, pending: value.pending };
}
/** Execute, capture and bind an actual targeted run. No caller-supplied success flag. */
export function produceCriticDiagnostic({ root, candidate = "HEAD", specPath, guardrailPaths = [], command, label = "targeted-check", logPath, fullVerifyPath = null, pending = [] }) {
  const bound = candidateBinding(root, candidate);
  if (git(root, ["rev-parse", "HEAD"]).trim() !== bound.commit || git(root, ["diff", "--name-only", bound.commit, "--"]).trim() !== "") fail("CDI-DIRTY-CANDIDATE");
  newDiagnosticPath(root, logPath);
  if (!logPath.startsWith("evidence/") || !Array.isArray(command) || command.length === 0) fail("CDI-CAPTURE-INPUT");
  const spec = source(root, bound.commit, specPath);
  const guardrails = [...new Set(guardrailPaths)].sort().map(path => source(root, bound.commit, path));
  const captured = captureEvidence({ command, label, out: logPath, cwd: root, repoRoot: root });
  if (git(root, ["rev-parse", "HEAD"]).trim() !== bound.commit || git(root, ["diff", "--name-only", bound.commit, "--"]).trim() !== "") fail("CDI-DIRTY-CANDIDATE");
  const fullVerify = { status: "not-run", evidence: null };
  if (fullVerifyPath !== null) {
    const bytes = readDiagnosticArtifact(root, fullVerifyPath);
    const observed = inspectCriticVerifyDiagnostic(JSON.parse(bytes), bound);
    if (observed.execution !== "full") fail("CDI-FULL-VERIFY");
    fullVerify.status = observed.status; fullVerify.evidence = { path: fullVerifyPath, sha256: diagnosticDigest(bytes) };
  }
  const value = { schema: CRITIC_DIAGNOSTIC_SCHEMA, producer: "critic-diagnostic-evidence", assurance: "captured-process-output-not-host-attested", candidate: bound, spec, guardrails, fullVerify, targeted: { label, status: captured.exitCode === 0 ? "passed" : "failed", exitCode: captured.exitCode, log: { path: logPath, sha256: diagnosticDigest(readDiagnosticArtifact(root, logPath)) } }, pending: [...new Set([...pending, ...(fullVerify.status === "not-run" ? ["full-verify"] : [])])].sort() };
  validateCriticDiagnostic(value, { root, candidate: bound, spec, guardrails });
  return value;
}
