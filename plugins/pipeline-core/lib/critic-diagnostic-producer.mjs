// SPDX-License-Identifier: SUL-1.0
import { spawnSync } from "node:child_process";
import { captureEvidence } from "../scripts/capture-evidence.mjs";
import {
  CRITIC_DIAGNOSTIC_SCHEMA,
  diagnosticDigest,
  diagnosticPath,
  inspectCriticVerifyDiagnostic,
  newDiagnosticPath,
  readDiagnosticArtifact,
  validateCriticDiagnostic,
} from "./critic-diagnostic-evidence.mjs";

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
function fail(code) { const error = new Error(code); error.code = code; throw error; }

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
