// SPDX-License-Identifier: SUL-1.0
import { spawnSync } from "node:child_process";
import { captureEvidence } from "../scripts/capture-evidence.mjs";
import {
  CRITIC_DIAGNOSTIC_SCHEMA,
  diagnosticDigest,
  diagnosticEvidenceLocation,
  diagnosticPath,
  fullVerifyExecutionRefusal,
  inspectCriticVerifyDiagnostic,
  newDiagnosticPath,
  readDiagnosticArtifact,
  validateCriticDiagnostic,
} from "./critic-diagnostic-evidence.mjs";
import { deriveRequiredCriticGuardrails } from "./critic-required-guardrails.mjs";
import { classifyEvidenceOnlyFollowers } from "./critic-course-admission.mjs";

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
function fail(code, message = code) { const error = new Error(message === code ? code : `${code}: ${message}`); error.code = code; throw error; }

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

/**
 * C30d (PO report on Claude Code, 2026-11-16): the refusal named only the code, and the commonest cause is an order trap, not a dirty tree: a commit made after the correction
 * commit leaves HEAD behind the candidate the delta route selects, so no diagnostic could be produced for it and the delta verb then found none (FPR-DELTA-NO-DIAGNOSTIC).
 * C30F-G2: followers that are all evidence-only (the export or the lineage of the previous round, a registration) no longer refuse, see `followerRefusal`; what still refuses is a
 * follower that is not evidence-only, a HEAD that is not a descendant of the candidate, or a tracked tree that differs from HEAD, and the message says which of them it is and what to do.
 */
function dirtyCandidateRefusal(root, bound, afterCapture = false, followerRefusal = null) {
  const head = git(root, ["rev-parse", "HEAD"]).trim();
  if (afterCapture) fail("CDI-DIRTY-CANDIDATE", `HEAD or the tracked tree changed while the command ran (the candidate is ${bound.commit.slice(0, 12)}); the command must not modify tracked files or move HEAD. The capture log was already written under evidence/; remove it before the next attempt.`);
  if (head !== bound.commit && followerRefusal === null) fail("CDI-DIRTY-CANDIDATE", `the working tree differs from HEAD ${head.slice(0, 12)}, the candidate ${bound.commit.slice(0, 12)} plus evidence-only commits: commit or remove the tracked changes first (git diff --name-only HEAD names them), then run this command again. Nothing was written.`);
  if (head !== bound.commit) {
    let followers = null;
    try { followers = Number.parseInt(git(root, ["rev-list", "--count", `${bound.commit}..${head}`]).trim(), 10); } catch { followers = null; }
    const why = followerRefusal.reason === "not-a-descendant" ? `HEAD is not a descendant of the candidate (rewritten or unrelated history)`
      : followerRefusal.reason === "no-feature" ? `the spec path ${followerRefusal.specPath} does not lie under specs/<feature-id>/, so no follower commit can be classified as evidence-only`
        : followerRefusal.reason === "touches-bound-source" ? `the commits after the candidate change the spec or a guardrail it binds`
          : followerRefusal.offending ? `commit ${followerRefusal.offending.slice(0, 12)} after the candidate is not an evidence-only commit` : `the commits after the candidate could not be read`;
    fail("CDI-DIRTY-CANDIDATE", `HEAD ${head.slice(0, 12)} is not the candidate ${bound.commit.slice(0, 12)}${Number.isInteger(followers) && followers > 0 ? `; ${followers} commit(s) follow the candidate` : ""}, and ${why}. The diagnostic is produced while HEAD is the candidate, or while every commit after it is an evidence-only commit (a manifest registration, the export of a consumed review, a disposition addendum) and the tracked tree is clean (register-feature-package.mjs --help, "Critic delta request route"). Otherwise produce it right after the correction commit and BEFORE any commit that is not evidence-only, or from a clean checkout of exactly the candidate (a detached checkout of ${bound.commit} used as --root), then place its log and its diagnostic file in this checkout under the same evidence paths and register them. Nothing was written.`);
  }
  fail("CDI-DIRTY-CANDIDATE", `the working tree differs from the candidate ${bound.commit.slice(0, 12)}: commit or remove the tracked changes first (git diff --name-only ${bound.commit.slice(0, 12)} names them), then run this command again. Nothing was written.`);
}

/**
 * C30F-G2: the HEAD a diagnostic may be produced at is the candidate itself, or a descendant whose every follower commit the course classifier
 * (`classifyEvidenceOnlyFollowers`, critic-course-admission.mjs) calls evidence-only and that leaves the bound spec and guardrails byte-identical.
 * Returns null when HEAD is admitted, otherwise the follower refusal for `dirtyCandidateRefusal`.
 */
function followerRefusal(root, bound, head, specPath, guardrailPaths) {
  if (head === bound.commit) return null;
  const featureId = /^specs\/([A-Za-z0-9][A-Za-z0-9._-]*)\//u.exec(specPath)?.[1];
  if (featureId === undefined) return { reason: "no-feature", specPath };
  const classified = classifyEvidenceOnlyFollowers({ repoRoot: root, featureId, candidateCommit: bound.commit, headCommit: head });
  if (!classified.ok) return { reason: classified.reason, offending: classified.offending };
  const boundPaths = [specPath, ...guardrailPaths];
  if (git(root, ["diff", "--name-only", bound.commit, head, "--", ...boundPaths]).trim() !== "") return { reason: "touches-bound-source" };
  return null;
}

/** Execute, capture and bind an actual targeted run. No caller-supplied success flag. */
export function produceCriticDiagnostic({ root, candidate = "HEAD", baseRef = undefined, specPath, guardrailPaths = [], command, label = "targeted-check", logPath, fullVerifyPath = null, pending = [] }) {
  const bound = candidateBinding(root, candidate);
  if (baseRef !== undefined) {
    let base;
    try { base = git(root, ["rev-parse", "--verify", `${baseRef}^{commit}`]).trim(); } catch { fail("CDI-BASE"); }
    if (!OID.test(base)) fail("CDI-BASE");
    try { guardrailPaths = deriveRequiredCriticGuardrails({ root, candidate: bound.commit, base, explicitGuardrails: guardrailPaths }).paths; }
    catch (error) { fail(error?.code ?? "CDI-GUARDRAIL-DERIVATION"); }
  }
  const head = git(root, ["rev-parse", "HEAD"]).trim();
  const refused = followerRefusal(root, bound, head, specPath, [...new Set(guardrailPaths)]);
  if (refused !== null || git(root, ["diff", "--name-only", head, "--"]).trim() !== "") dirtyCandidateRefusal(root, bound, false, refused);
  newDiagnosticPath(root, logPath);
  if (diagnosticEvidenceLocation(logPath) === null || !Array.isArray(command) || command.length === 0) fail("CDI-CAPTURE-INPUT");
  // C21B: refused BEFORE the capture, otherwise the failed attempt leaves its log behind and the retry with the same names stops on CDI-OUTPUT-EXISTS.
  if (fullVerifyPath !== null && diagnosticEvidenceLocation(fullVerifyPath) === null) fail("CDI-PATH", `--full-verify ${fullVerifyPath} must lie under evidence/ or specs/<feature-id>/evidence/; move the Verify evidence there, or drop the flag and declare the gap with --pending full-verify. Nothing was written.`);
  const spec = source(root, bound.commit, specPath);
  const guardrails = [...new Set(guardrailPaths)].sort().map(path => source(root, bound.commit, path));
  const captured = captureEvidence({ command, label, out: logPath, cwd: root, repoRoot: root });
  if (git(root, ["rev-parse", "HEAD"]).trim() !== head || git(root, ["diff", "--name-only", head, "--"]).trim() !== "") dirtyCandidateRefusal(root, bound, true);
  const fullVerify = { status: "not-run", evidence: null };
  if (fullVerifyPath !== null) {
    const bytes = readDiagnosticArtifact(root, fullVerifyPath);
    const observed = inspectCriticVerifyDiagnostic(JSON.parse(bytes), bound);
    if (observed.execution !== "full") fail("CDI-FULL-VERIFY", fullVerifyExecutionRefusal(observed));
    fullVerify.status = observed.status; fullVerify.evidence = { path: fullVerifyPath, sha256: diagnosticDigest(bytes) };
  }
  const value = { schema: CRITIC_DIAGNOSTIC_SCHEMA, producer: "critic-diagnostic-evidence", assurance: "captured-process-output-not-host-attested", candidate: bound, spec, guardrails, fullVerify, targeted: { label, status: captured.exitCode === 0 ? "passed" : "failed", exitCode: captured.exitCode, log: { path: logPath, sha256: diagnosticDigest(readDiagnosticArtifact(root, logPath)) } }, pending: [...new Set([...pending, ...(fullVerify.status === "not-run" ? ["full-verify"] : [])])].sort() };
  validateCriticDiagnostic(value, { root, candidate: bound, spec, guardrails });
  return value;
}
