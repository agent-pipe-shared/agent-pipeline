// SPDX-License-Identifier: SUL-1.0

/** Exact PO-decision contract for a complete design workflow package. */
import { execFileSync } from "node:child_process";
import { canonical, createPoApprovalIntent } from "./po-approval-proof.mjs";
import { designWorkflowAdvisorExceptionBinding, readApprovedDesignWorkflowPackage, readDesignWorkflowPackageFromRepository, rereadApprovedDesignWorkflowPackage } from "./design-workflow-package.mjs";
import { verifyAgainstTrustAnchors } from "./critical-human-proof-policy.mjs";

export const DESIGN_WORKFLOW_APPROVAL_REQUEST_SCHEMA = "pipeline.design-workflow-package-approval-request.v1";
export const DESIGN_WORKFLOW_APPROVAL_SCHEMA = "pipeline.design-workflow-package-approval.v1";
const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const SAFE_PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._/@:-]+$/u;
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const validCandidate = (value) => exact(value, ["commit", "tree"])
  && OID.test(value.commit ?? "") && OID.test(value.tree ?? "") && value.commit !== value.tree;
const validApprovalIntent = (value) => exact(value, ["value", "sha256"])
  && SHA256.test(value.sha256 ?? "")
  && value.value?.schema === "pipeline.po-approval-intent.v1"
  && value.value.kind === "design-workflow-package"
  && ID.test(value.value.featureId ?? "")
  && SHA256.test(value.value.planSha256 ?? "")
  && SHA256.test(value.value.specSha256 ?? "")
  && validCandidate(value.value.candidate)
  && ["design-workflow-package-v1", "design-workflow-package-v2"].includes(value.value.policyRevision)
  && SHA256.test(value.value.subjectSha256 ?? "")
  && value.value.decision === "approve";

function makeIntent({ featureId, planSha256, specSha256, candidate, packageSha256, packageSchema = "pipeline.design-workflow-package.v1" }) {
  return createPoApprovalIntent({
    kind: "design-workflow-package",
    featureId,
    planSha256,
    specSha256,
    candidate,
    policyRevision: packageSchema === "pipeline.design-workflow-package.v2" ? "design-workflow-package-v2" : "design-workflow-package-v1",
    subjectSha256: packageSha256,
    decision: "approve",
  });
}

function candidateReader(readCandidate) {
  return typeof readCandidate === "function" ? readCandidate : () => null;
}

/** Exit status of a git probe: 0, a numeric non-zero status, or null when git itself could not run. */
function gitStatus(repoRoot, args) {
  try {
    execFileSync("git", args, { cwd: repoRoot, shell: false, timeout: 10_000, stdio: ["ignore", "ignore", "ignore"] });
    return 0;
  } catch (error) { return typeof error?.status === "number" ? error.status : null; }
}

/**
 * Bound-path gate (R7-3a): the package path is digest-bound, so it must be a
 * tracked, clean file or the signature would bind bytes that do not travel.
 * Runs before any package content validation. A root that is not a git
 * repository (or has no HEAD yet) is outside the gate's reach and skipped.
 */
function refuseUnsoundBoundPath(repoRoot, packagePath) {
  if (typeof repoRoot !== "string" || !SAFE_PATH.test(packagePath ?? "")) return null;
  if (gitStatus(repoRoot, ["rev-parse", "--git-dir"]) !== 0) return null;
  if (gitStatus(repoRoot, ["check-ignore", "-q", "--", packagePath]) === 0) {
    return { ok: false, code: "DWP-BOUND-PATH-IGNORED",
      repair: `${packagePath} is git-ignored, so the signed package would not travel; write the package under a tracked specs/<feature>/evidence/ directory, then stage and commit it.` };
  }
  if (gitStatus(repoRoot, ["ls-files", "--error-unmatch", "--", packagePath]) === 1) {
    return { ok: false, code: "DWP-BOUND-PATH-UNTRACKED",
      repair: `${packagePath} is not tracked; stage it with git add and commit it before presenting the plan.` };
  }
  if (gitStatus(repoRoot, ["rev-parse", "--verify", "-q", "HEAD"]) === 0
    && gitStatus(repoRoot, ["diff", "--quiet", "HEAD", "--", packagePath]) === 1) {
    return { ok: false, code: "DWP-BOUND-PATH-MODIFIED",
      repair: `${packagePath} differs from HEAD; stage and commit the change before presenting the plan.` };
  }
  return null;
}

/**
 * Build the one final-approval request only after every package byte and source
 * is physically re-read against the current repository candidate.
 */
export function createDesignWorkflowPackageApprovalRequest({
  repoRoot, packagePath, featureId, planPath, planSha256, specPath, specSha256, readCandidate, verifyReadinessExecution, trustedAdvisorExecutablePath,
  roleRoutePreflight, evidenceBindings,
} = {}) {
  if (!ID.test(featureId ?? "") || !SAFE_PATH.test(planPath ?? "") || !SHA256.test(planSha256 ?? "")
    || !SAFE_PATH.test(specPath ?? "") || !SHA256.test(specSha256 ?? "")) return { ok: false, code: "DWP-APPROVAL-BINDING" };
  const boundPathRefusal = refuseUnsoundBoundPath(repoRoot, packagePath);
  if (boundPathRefusal) return boundPathRefusal;
  const packageRead = readDesignWorkflowPackageFromRepository({ repoRoot, packagePath, readCandidate: candidateReader(readCandidate),
    ...(verifyReadinessExecution ? { verifyReadinessExecution } : {}), trustedAdvisorExecutablePath, roleRoutePreflight, evidenceBindings });
  if (!packageRead.ok) return packageRead;
  const pkg = packageRead.workflowPackage;
  if (pkg.featureId !== featureId) return { ok: false, code: "DWP-APPROVAL-FEATURE-MISMATCH" };
  if (pkg.sources.prd.path !== planPath || pkg.sources.prd.sha256 !== planSha256
    || pkg.sources.spec.path !== specPath || pkg.sources.spec.sha256 !== specSha256) return { ok: false, code: "DWP-APPROVAL-PLAN-SPEC-MISMATCH" };
  let approvalIntent;
  try {
    approvalIntent = makeIntent({ featureId, planSha256, specSha256, candidate: pkg.candidate, packageSha256: packageRead.packageSha256, packageSchema: pkg.schema });
  } catch { return { ok: false, code: "DWP-APPROVAL-INTENT" }; }
  return {
    ok: true,
    request: {
      schema: DESIGN_WORKFLOW_APPROVAL_REQUEST_SCHEMA,
      packagePath,
      packageSha256: packageRead.packageSha256,
      approvalIntent,
      ...(designWorkflowAdvisorExceptionBinding(packageRead) ? { advisorException: designWorkflowAdvisorExceptionBinding(packageRead) } : {}),
    },
    packageRead,
  };
}

/** Recompute an on-disk request; never trust its self-declared digest or paths. */
export function validateDesignWorkflowPackageApprovalRequest({
  repoRoot, request, packagePath, featureId, planPath, planSha256, specPath, specSha256, readCandidate,
  verifyReadinessExecution,
  trustedAdvisorExecutablePath,
  allowUnrelatedCommits = false,
  roleRoutePreflight,
  evidenceBindings,
} = {}) {
  if (!exact(request, ["schema", "packagePath", "packageSha256", "approvalIntent", ...(Object.hasOwn(request ?? {}, "advisorException") ? ["advisorException"] : [])])
    || request.schema !== DESIGN_WORKFLOW_APPROVAL_REQUEST_SCHEMA
    || !SAFE_PATH.test(request.packagePath ?? "") || (packagePath !== undefined && request.packagePath !== packagePath)
    || !SHA256.test(request.packageSha256 ?? "") || !validApprovalIntent(request.approvalIntent)) return { ok: false, code: "DWP-APPROVAL-REQUEST-SHAPE" };
  const packageRead = allowUnrelatedCommits
    ? readApprovedDesignWorkflowPackage({
      repoRoot, packagePath: request.packagePath, packageSha256: request.packageSha256,
      featureId, planPath, planSha256, specPath, specSha256,
      readCandidate: candidateReader(readCandidate),
      trustedAdvisorExecutablePath, advisorExceptionBinding: request.advisorException ?? null,
    })
    : readDesignWorkflowPackageFromRepository({ repoRoot, packagePath: request.packagePath,
      readCandidate: candidateReader(readCandidate), ...(verifyReadinessExecution ? { verifyReadinessExecution } : {}), trustedAdvisorExecutablePath,
      roleRoutePreflight, evidenceBindings });
  if (!packageRead.ok) return packageRead;
  const pkg = packageRead.workflowPackage;
  if (canonical(designWorkflowAdvisorExceptionBinding(packageRead)) !== canonical(request.advisorException ?? null)) return { ok: false, code: "DWP-APPROVAL-ADVISOR-EXCEPTION-BINDING" };
  if (pkg.featureId !== featureId || pkg.sources.prd.path !== planPath || pkg.sources.prd.sha256 !== planSha256
    || pkg.sources.spec.path !== specPath || pkg.sources.spec.sha256 !== specSha256
    || packageRead.packageSha256 !== request.packageSha256) return { ok: false, code: "DWP-APPROVAL-BINDING" };
  let expected;
  try {
    expected = makeIntent({ featureId, planSha256, specSha256, candidate: pkg.candidate,
      packageSha256: request.packageSha256, packageSchema: pkg.schema });
  } catch { return { ok: false, code: "DWP-APPROVAL-INTENT" }; }
  if (canonical(expected) !== canonical(request.approvalIntent)) return { ok: false, code: "DWP-APPROVAL-INTENT-DRIFT" };
  return { ok: true, request, packageRead, packageSha256: request.packageSha256,
    intentSha256: expected.sha256 };
}

export function verifyDesignWorkflowPackageApproval({
  repoRoot, request, proof, anchors, packagePath, featureId, planPath, planSha256, specPath, specSha256,
  readCandidate, verifyReadinessExecution, trustedAdvisorExecutablePath, allowUnrelatedCommits = false,
  roleRoutePreflight, evidenceBindings,
} = {}) {
  const checked = validateDesignWorkflowPackageApprovalRequest({ repoRoot, request, packagePath, featureId,
    planPath, planSha256, specPath, specSha256, readCandidate, verifyReadinessExecution, trustedAdvisorExecutablePath, allowUnrelatedCommits,
    roleRoutePreflight, evidenceBindings });
  if (!checked.ok) return checked;
  const verified = verifyAgainstTrustAnchors({ intent: request.approvalIntent, anchors, proof });
  if (!verified.verified) return { ok: false, code: verified.code ?? "DWP-APPROVAL-PROOF-INVALID" };
  return { ok: true, code: "DWP-APPROVAL-VERIFIED", packageSha256: checked.packageSha256,
    intentSha256: checked.intentSha256, proof: structuredClone(proof), proofSha256: verified.proofSha256,
    signer: verified.signer, packageRead: checked.packageRead,
    ...(request.advisorException ? { advisorException: structuredClone(request.advisorException) } : {}) };
}

/**
 * Re-derive and verify the signature persisted by approve-plan at the later
 * implementation boundary. The approval record is only a cache: its digest,
 * proof and human attribution are all checked against the physical package
 * and the independently configured trust anchors again here.
 *
 * ADR-0085 C2 (decision T): the package is re-read through
 * `rereadApprovedDesignWorkflowPackage`, which reads the package, the PRD and
 * the Spec only. No live candidate, course store, host evidence, revision chain
 * or readiness file is consulted, and the signature is checked against the trust
 * anchors directly rather than through `verifyDesignWorkflowPackageApproval`
 * (whose request validation re-reads with the live candidate). `readCandidate`
 * and `trustedAdvisorExecutablePath` are still accepted so existing callers keep
 * their call shape, and are unused here.
 */
export function verifyStoredDesignWorkflowPackageSignature({
  repoRoot, packagePath, packageSha256, featureId, planPath, planSha256, specPath, specSha256,
  approval, anchors, readCandidate, trustedAdvisorExecutablePath,
} = {}) {
  if (!exact(approval, ["schema", "mode", "approvedBy", "approvedAt", "packageSha256", "intentSha256", "proofSha256", "proof", ...(Object.hasOwn(approval ?? {}, "advisorException") ? ["advisorException"] : [])])
    || approval.schema !== DESIGN_WORKFLOW_APPROVAL_SCHEMA || approval.mode !== "signature"
    || approval.packageSha256 !== packageSha256 || !SHA256.test(approval.intentSha256 ?? "")
    || !SHA256.test(approval.proofSha256 ?? "")) return { ok: false, code: "DWP-APPROVAL-RECORD-SHAPE" };
  const packageRead = rereadApprovedDesignWorkflowPackage({
    repoRoot, packagePath, packageSha256, featureId, planPath, planSha256, specPath, specSha256,
    advisorExceptionBinding: approval.advisorException ?? null,
  });
  if (!packageRead.ok) return packageRead;
  let approvalIntent;
  try {
    approvalIntent = makeIntent({
      featureId, planSha256, specSha256,
      candidate: packageRead.workflowPackage.candidate,
      packageSha256,
      packageSchema: packageRead.workflowPackage.schema,
    });
  } catch { return { ok: false, code: "DWP-APPROVAL-INTENT" }; }
  if (approvalIntent.sha256 !== approval.intentSha256) return { ok: false, code: "DWP-APPROVAL-INTENT-DRIFT" };
  const verified = verifyAgainstTrustAnchors({ intent: approvalIntent, anchors, proof: approval.proof });
  if (!verified.verified) return { ok: false, code: verified.code ?? "DWP-APPROVAL-PROOF-INVALID" };
  if (verified.proofSha256 !== approval.proofSha256
    || approval.approvedBy !== `verified:${verified.signer.keyReference}`) {
    return { ok: false, code: "DWP-APPROVAL-RECORD-DRIFT" };
  }
  return { ok: true, code: "DWP-APPROVAL-STORED-SIGNATURE-VERIFIED", packageSha256,
    intentSha256: approvalIntent.sha256, proof: structuredClone(approval.proof), proofSha256: verified.proofSha256,
    signer: verified.signer, packageRead,
    ...(approval.advisorException ? { advisorException: structuredClone(approval.advisorException) } : {}) };
}
