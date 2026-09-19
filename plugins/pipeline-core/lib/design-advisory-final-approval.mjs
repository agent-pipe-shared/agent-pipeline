// SPDX-License-Identifier: SUL-1.0

/** Resolve the one exceptional Advisor bypass against the human ledger. */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const GOVERNANCE_AUTHORITY_CLI = fileURLToPath(new URL("../scripts/governance-authority.mjs", import.meta.url));

function exact(value, names) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));
}

/**
 * `true` only for an extant v3 ledger decision whose candidate and package
 * bytes are exact matches for the Advisor record.  Any unavailable authority,
 * legacy projection, malformed reference, or stale package is a denial.
 */
export function hasExactDesignAdvisorFinalApproval({ state, projectDir, featureId, planPath, specPath, planSha256, specSha256, candidateCommit, candidateTree }) {
  const approval = state?.planApproval;
  const feature = state?.activeFeature;
  const authority = approval?.poGateAuthority;
  const reference = approval?.humanDecision;
  if (!exact(feature, ["id", "planPath", "phase"]) || feature.id !== featureId || feature.planPath !== planPath
    || !exact(approval, ["schema", "approvedBy", "approvedAt", "specBoundBy", "specBoundAt", "poGateAuthority", "humanDecision"])
    || approval.schema !== "pipeline.plan-approval.v3"
    || !exact(authority, ["schema", "humanFacing", "sourceSha256", "runtimeSha256", "receiptSha256", "repositoryFingerprint", "planPath", "planSha256", "specPath", "specSha256"])
    || authority.planPath !== planPath || authority.specPath !== specPath
    || authority.planSha256 !== planSha256 || authority.specSha256 !== specSha256
    || !exact(reference, ["schema", "decisionId", "decisionDigest", "candidate", "checkpoint"])
    || reference.schema !== "pipeline.human-decision-reference.v1"
    || !SHA256.test(reference.decisionDigest ?? "")
    || !exact(reference.candidate, ["commit", "tree"])
    || reference.candidate.commit !== candidateCommit || reference.candidate.tree !== candidateTree
    || !OID.test(candidateCommit ?? "") || !OID.test(candidateTree ?? "")
    || !exact(reference.checkpoint, ["repositoryFingerprint", "streamId", "sequence", "eventDigest", "candidateCommit", "candidateTree"])
    || reference.checkpoint.repositoryFingerprint !== authority.repositoryFingerprint
    || reference.checkpoint.candidateCommit !== candidateCommit || reference.checkpoint.candidateTree !== candidateTree) return false;
  const request = {
    schema: "pipeline.governance-authority-request.v1",
    repositoryFingerprint: reference.checkpoint.repositoryFingerprint,
    decisionId: reference.decisionId,
    candidate: reference.candidate,
    checkpoint: reference.checkpoint,
    nowEpochMs: Date.now(),
  };
  const invoked = spawnSync(process.execPath, [GOVERNANCE_AUTHORITY_CLI, "--repo", resolve(projectDir), "--request-json", JSON.stringify(request)], { encoding: "utf8", timeout: 5000, shell: false });
  if (invoked.status !== 0) return false;
  let readback;
  try { readback = JSON.parse(invoked.stdout); } catch { return false; }
  if (!exact(readback, ["schema", "granted", "decisionId", "decisionDigest", "scope", "singleUse"])
    || readback.schema !== "pipeline.governance-authority-readback.v1" || readback.granted !== true
    || readback.decisionId !== reference.decisionId || readback.decisionDigest !== reference.decisionDigest || readback.singleUse !== true
    || !exact(readback.scope, ["repositoryFingerprint", "candidate", "packageId", "action", "environment", "artifacts"])
    || readback.scope.repositoryFingerprint !== authority.repositoryFingerprint
    || JSON.stringify(readback.scope.candidate) !== JSON.stringify(reference.candidate)
    || readback.scope.packageId !== featureId || readback.scope.action !== "APPROVE_PLAN" || readback.scope.environment !== "local"
    || !Array.isArray(readback.scope.artifacts)) return false;
  return [{ path: planPath, sha256: planSha256 }, { path: specPath, sha256: specSha256 }].every((expected) =>
    readback.scope.artifacts.some((entry) => exact(entry, ["path", "sha256"]) && entry.path === expected.path && entry.sha256 === expected.sha256));
}
