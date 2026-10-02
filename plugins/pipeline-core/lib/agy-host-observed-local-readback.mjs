// SPDX-License-Identifier: SUL-1.0
/**
 * Independently re-read a private Agy observation. This is a local host claim,
 * not a provider attestation or a portable export. The public record alone
 * never satisfies any of these checks.
 */
import { execFileSync } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import { digest, loadStoredConsent, validateConsentRecord, validateDispatchBinding } from "./agy-session-authority.mjs";
import { agyHostGitEnvironment } from "./agy-host-commit-admission.mjs";
import { verifyAgySessionResultReadback, recheckAgyFamilyVerifiedReturn } from "./agy-session-dispatch.mjs";
import { AGY_HOST_OBSERVED_TRAILER, AGY_FAMILY_HOST_OBSERVED_TRAILER } from "./agy-host-observed-receipt.mjs";
import { readHeldModelFamilyInvocation } from "./model-family-host-store.mjs";
import { readAgyHostObservedReceipt } from "./agy-host-observed-store.mjs";
import { discoverRepository, loadSessionDescriptor } from "./worktree-lifecycle.mjs";
const familyReadbackScope = new AsyncLocalStorage();

/** Same-process qualified host scope, never serialized authority. A future
 * installed historical source must independently qualify equivalent evidence. */
export async function withAgyFamilyLocalReadback({ root, handle, operation } = {}) {
  if (typeof operation !== "function") return failed("AGY-LOCAL-FAMILY-OPERATION");
  const checked = await recheckAgyFamilyVerifiedReturn(handle); if (!checked.ok) return checked;
  if (root !== checked.source.root) return failed("AGY-LOCAL-FAMILY-ROOT-MISMATCH");
  return familyReadbackScope.run({ root, verified: checked.value }, operation);
}

function failed(code) { return { ok: false, code, authority: "unverifiable" }; }
function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024,
    env: { ...agyHostGitEnvironment(), GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1" },
  }).trimEnd();
}
function gitBinding(root, receipt) {
  try {
    const commit = git(root, ["rev-parse", "--verify", `${receipt.commit}^{commit}`]);
    const parent = git(root, ["rev-parse", "--verify", `${receipt.commit}^`]);
    const tree = git(root, ["rev-parse", "--verify", `${receipt.commit}^{tree}`]);
    const candidateTree = git(root, ["rev-parse", "--verify", `${receipt.candidateCommit}^{tree}`]);
    const paths = git(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", receipt.commit])
      .split("\0").filter(Boolean).sort();
    const message = git(root, ["show", "-s", "--format=%B", receipt.commit]);
    const lines = message.split(/\r?\n/u);
    return commit === receipt.commit && parent === receipt.parent && tree === receipt.tree
      && candidateTree === receipt.candidateTree
      && JSON.stringify(paths) === JSON.stringify(receipt.paths)
      && lines.filter((line) => line === `Dispatch: ${receipt.dispatchId} (goldfish)`).length === 1
      && lines.filter((line) => line === (receipt.schema === "pipeline.agy-host-observed-receipt.v2" ? AGY_FAMILY_HOST_OBSERVED_TRAILER : AGY_HOST_OBSERVED_TRAILER)).length === 1
      && lines.filter((line) => line === "AI-Assisted: true").length === 1;
  } catch { return false; }
}

export function inspectAgyHostObservedLocalReadback({ root, taskId, record, recordBytes } = {}) {
  let repo;
  try { repo = discoverRepository(root); }
  catch { return failed("AGY-LOCAL-REPOSITORY-UNAVAILABLE"); }
  if (repo.start !== repo.primaryRoot) return failed("AGY-LOCAL-NONPRIMARY-ROOT");
  const stored = readAgyHostObservedReceipt({ commonDir: repo.commonDir, taskId, record, recordBytes });
  if (!stored.ok) return failed("AGY-LOCAL-PRIVATE-RECEIPT-UNVERIFIABLE");
  const receipt = stored.receipt;
  let descriptor;
  let consent;
  try {
    descriptor = loadSessionDescriptor(repo.primaryRoot, receipt.sessionId,
      { expectedDescriptorSha256: receipt.descriptorSha256 });
    consent = loadStoredConsent(repo.primaryRoot, receipt.sessionId, receipt.descriptorSha256);
  } catch { return failed("AGY-LOCAL-SESSION-OR-CONSENT-UNVERIFIABLE"); }
  let consentDigest;
  try { consentDigest = digest(consent.record); } catch { return failed("AGY-LOCAL-CONSENT-BINDING"); }
  if (descriptor.repo.commonDir !== repo.commonDir || !consent.record || consent.revoked
    || consent.descriptor.repo.commonDir !== repo.commonDir
    || consent.record.decisionId !== receipt.consentDecisionId
    || consent.record.subjectSha256 !== receipt.consentSubjectSha256
    || consentDigest !== receipt.consentRecordSha256
    || (Number.isSafeInteger(consent.record.approvedAtMs)
      && consent.record.approvedAtMs > receipt.observedAtMs)) {
    return failed("AGY-LOCAL-CONSENT-BINDING");
  }
  const session = { id: receipt.sessionId, descriptorSha256: receipt.descriptorSha256 };
  if (receipt.schema === "pipeline.agy-host-observed-receipt.v2") {
    const source = familyReadbackScope.getStore(), witness = source?.verified?.witness;
    if (source?.root !== repo.primaryRoot || !witness || digest(witness.family) !== digest(receipt.family)
      || witness.observedAtMs !== receipt.observedAtMs || witness.dispatchId !== receipt.dispatchId
      || witness.consentRecordSha256 !== consentDigest || !receipt.paths.every(path => consent.record.allowedPaths.includes(path))) return failed("AGY-LOCAL-FAMILY-SOURCE-UNQUALIFIED");
    const i = receipt.family.invocation, b = receipt.family.bindings;
    const original = readHeldModelFamilyInvocation({ rootDir: `${repo.commonDir}/agent-pipeline`, key: { runner: "antigravity",
      installationBindingSha256: b.installationBindingSha256, accountBindingSha256: b.accountBindingSha256, sessionId: receipt.sessionId, invocationId: receipt.dispatchId } });
    if (!original.ok || digest(original.value) !== digest(i)) return failed("AGY-LOCAL-FAMILY-INVOCATION-DRIFT");
    const result = verifyAgySessionResultReadback({ resultRoot: repo.primaryRoot, resultPath: receipt.resultPath,
      receipt: { ok: true, path: receipt.resultPath, bytes: receipt.resultBytes, sha256: receipt.resultSha256 },
      dispatchId: receipt.dispatchId, candidate: { commit: receipt.candidateCommit, tree: receipt.candidateTree }, sessionId: receipt.sessionId,
      requestedModel: i.selectedModelId, expectedFinal: { outcome: "succeeded", reportSha256: receipt.reportSha256, changedPaths: record.report.changedFiles }, familyWitness: witness });
    if (!result.ok || result.final.report !== record.report.text || result.model !== receipt.model || !gitBinding(repo.primaryRoot, receipt)) return failed("AGY-LOCAL-FAMILY-RESULT-OR-GIT-DRIFT");
    return { ok: true, code: "AGY-LOCAL-HOST-OBSERVATION-VERIFIED", authority: "host-observed-local", receiptSha256: stored.sha256, commit: receipt.commit, taskId: receipt.dispatchId };
  }
  let consentCheck;
  try { consentCheck = validateConsentRecord(consent.record, { root: repo.primaryRoot,
    repository: repo, session, nowEpochMs: receipt.observedAtMs }); }
  catch { return failed("AGY-LOCAL-CONSENT-UNVERIFIABLE"); }
  if (!consentCheck.ok) return failed("AGY-LOCAL-CONSENT-UNVERIFIABLE");
  const scopeCheck = validateDispatchBinding(consent.record, { requestedModel: receipt.model,
    role: receipt.role, scope: receipt.scope, requiredPaths: receipt.scope.requiredPaths,
    nowEpochMs: receipt.observedAtMs });
  if (!scopeCheck.ok || !receipt.paths.every((path) => consent.record.allowedPaths.includes(path))) {
    return failed("AGY-LOCAL-CONSENT-SCOPE");
  }
  const result = verifyAgySessionResultReadback({ resultRoot: repo.primaryRoot,
    resultPath: receipt.resultPath,
    receipt: { ok: true, path: receipt.resultPath, bytes: receipt.resultBytes,
      sha256: receipt.resultSha256 },
    dispatchId: receipt.dispatchId,
    candidate: { commit: receipt.candidateCommit, tree: receipt.candidateTree },
    sessionId: receipt.sessionId, requestedModel: receipt.model,
    expectedFinal: { outcome: "succeeded", reportSha256: receipt.reportSha256,
      changedPaths: record.report.changedFiles } });
  if (!result.ok || result.final.report !== record.report.text
    || result.model !== receipt.model || result.reportSha256 !== receipt.reportSha256) {
    return failed("AGY-LOCAL-RESULT-UNVERIFIABLE");
  }
  if (!gitBinding(repo.primaryRoot, receipt)) return failed("AGY-LOCAL-GIT-BINDING");
  return { ok: true, code: "AGY-LOCAL-HOST-OBSERVATION-VERIFIED",
    authority: "host-observed-local", receiptSha256: stored.sha256,
    commit: receipt.commit, taskId: receipt.dispatchId };
}
