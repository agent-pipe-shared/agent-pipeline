// SPDX-License-Identifier: SUL-1.0
/**
 * Complete one already-launched Agy Final Return in host order. Once Git may
 * have committed, every failure is recovery-required, never no-delivery.
 */
import { spawnSync } from "node:child_process";
import { agyHostGitEnvironment } from "../lib/agy-host-commit-admission.mjs";
import { commitAdmittedAgyReturn } from "../lib/agy-host-commit-execution.mjs";
import { agyAgentTypeForRole, draftAgyAuthoredRecordAfterCommit } from "../lib/agy-final-return.mjs";
import { agyAuthoredRecordBytes, draftAgyHostObservedReceipt } from "../lib/agy-host-observed-receipt.mjs";
import { persistAgyHostObservedReceipt } from "../lib/agy-host-observed-store.mjs";
import { verifyAgySessionResultReadback, recheckAgyFamilyVerifiedReturn } from "../lib/agy-session-dispatch.mjs";
import { digest, loadStoredConsent, validateConsentRecord, validateDispatchBinding } from "../lib/agy-session-authority.mjs";
import { writeHostObservedAgyDispatchRecord } from "./dispatch-record-write.mjs";
import { withAgyFamilyLocalReadback } from "../lib/agy-host-observed-local-readback.mjs";

const SHA = /^[a-f0-9]{64}$/u;
function recovery(code, commit = null) {
  return { status: "recovery-required", code, record: null, recoveryCommit: commit };
}

function observedCommitAfterException(baseline) {
  try {
    const result = spawnSync("git", ["-C", baseline.root, "rev-parse", "--verify", "HEAD^{commit}"], {
      encoding: "utf8", shell: false, timeout: 10_000, maxBuffer: 1024,
      env: agyHostGitEnvironment(),
    });
    const head = result.status === 0 ? result.stdout.trim() : null;
    return /^[a-f0-9]{40,64}$/u.test(head ?? "") && head !== baseline.candidateCommit ? head : null;
  } catch { return null; }
}

/** V2 admission requires the original private return capability, not witness JSON. */
export async function finalizeAgyFamilyHostObservedReturn({ sealed, launched } = {}) {
  const checked = await recheckAgyFamilyVerifiedReturn(launched?.familyReturnHandle);
  if (!checked.ok) return recovery(checked.code);
  const { witness, result, final } = checked.value;
  let packetMatches = false;
  try { packetMatches = digest(sealed?.packet) === checked.source.packetSha256; } catch { /* malformed sealed packet is a denial */ }
  if (sealed?.root !== checked.source.root || sealed.resultRoot !== checked.source.root
    || launched?.commitAdmission?.baseline?.root !== checked.source.root
    || sealed.resultPath !== witness.resultPath || launched.commitAdmission?.baseline?.resultPath !== witness.resultPath
    || !packetMatches
    || launched?.status !== "final-pending-host-commit" || launched.commitAdmission?.code !== "AGY-HOST-COMMIT-ADMITTED"
    || launched.commitAdmission?.recordPreflight?.code !== "AGY-RECORD-PREFLIGHT-READY"
    || witness.schema !== "pipeline.agy-host-model-witness.v2"
    || digest(witness) !== digest(launched.commitAdmission.modelWitness)
    || witness.dispatchId !== sealed?.packet?.dispatchId || witness.sessionId !== sealed.sessionId
    || witness.descriptorSha256 !== sealed.descriptorSha256 || witness.candidateCommit !== sealed.packet.candidate.commit
    || witness.candidateTree !== sealed.packet.candidate.tree || witness.effort !== sealed.effort
    || witness.family.invocation.selectedModelId !== sealed.requestedModel || witness.inputSha256 !== sealed.inputSha256
    || witness.routePolicySha256 !== sealed.routePolicySha256 || digest(witness.scope) !== digest(sealed.scope)
    || digest(result) !== digest(launched.result)) return recovery("AGY-FAMILY-FINALIZE-WITNESS-DRIFT");
  const readback = verifyAgySessionResultReadback({ resultRoot: sealed.resultRoot, resultPath: sealed.resultPath,
    receipt: result, dispatchId: witness.dispatchId, candidate: sealed.packet.candidate, sessionId: witness.sessionId,
    requestedModel: sealed.requestedModel, expectedFinal: final, familyWitness: witness });
  if (!readback.ok) return recovery("AGY-FAMILY-FINALIZE-RESULT-DRIFT");
  const admission = launched.commitAdmission;
  let committed;
  try {
    committed = commitAdmittedAgyReturn({ adapterVersion: 2, baseline: admission.baseline,
      final, allowedPaths: witness.family.consentBinding.allowedPaths,
      taskId: witness.dispatchId, priorAdmission: admission });
  } catch { return recovery("AGY-FAMILY-FINALIZE-COMMIT-EXCEPTION", observedCommitAfterException(admission.baseline)); }
  if (!committed?.ok) return recovery(committed?.code ?? "AGY-FAMILY-FINALIZE-COMMIT-INVALID", committed?.commit ?? observedCommitAfterException(admission.baseline));
  try {
    const draft = draftAgyAuthoredRecordAfterCommit({ taskId: witness.dispatchId,
      agentType: agyAgentTypeForRole(witness.role), observedModel: readback.model,
      effort: witness.effort, rulesetSha: witness.routePolicySha256,
      baselineCommit: witness.candidateCommit, candidateTree: witness.candidateTree,
      resultSha256: witness.resultSha256, resultPath: witness.resultPath, resultBytes: witness.resultBytes,
      consentSubjectSha256: witness.consentSubjectSha256, consentDecisionId: witness.consentDecisionId,
      consentRecordSha256: witness.consentRecordSha256, inputSha256: witness.inputSha256,
      observedAtMs: witness.observedAtMs, scope: witness.scope, sessionId: witness.sessionId,
      descriptorSha256: witness.descriptorSha256, final, modelWitness: witness,
      criticRequired: admission.criticRequired, commitReadback: committed });
    if (!draft.ok) return recovery("AGY-FAMILY-FINALIZE-RECORD-DRAFT", committed.commit);
    const privateDraft = draftAgyHostObservedReceipt({ modelWitness: witness, commitReadback: committed, record: draft.record });
    if (!privateDraft.ok) return recovery("AGY-FAMILY-FINALIZE-PRIVATE-DRAFT", committed.commit);
    const stored = loadStoredConsent(sealed.root, sealed.sessionId, sealed.descriptorSha256);
    const privateStored = persistAgyHostObservedReceipt({ commonDir: stored.descriptor.repo.commonDir,
      receipt: privateDraft.receipt, record: draft.record, recordBytes: agyAuthoredRecordBytes(draft.record) });
    if (!privateStored.ok) return recovery("AGY-FAMILY-FINALIZE-PRIVATE-STORE", committed.commit);
    const published = await withAgyFamilyLocalReadback({ root: sealed.root, handle: launched.familyReturnHandle,
      operation: () => writeHostObservedAgyDispatchRecord({ repoRoot: sealed.root,
        target: `evidence/dispatch-record-${witness.dispatchId}.json`, record: draft.record }) });
    if (!published?.target) return recovery("AGY-FAMILY-FINALIZE-RECORD-PUBLICATION", committed.commit);
    return { status: "authored-commit-recorded", code: "AGY-AUTHORED-RECORD-VERIFIED", recoveryCommit: null,
      record: { target: published.target, sha256: published.sha256, commit: committed.commit, authorship: "host-observed-local" } };
  } catch (error) { return recovery(`AGY-FAMILY-FINALIZE-POSTCOMMIT-${typeof error?.code === "string" ? error.code : "EXCEPTION"}`, committed.commit); }
}

export function finalizeAgyHostObservedReturn({ sealed, launched } = {}, dependencies = {}) {
  if (!sealed || launched?.status !== "final-pending-host-commit"
    || launched?.commitAdmission?.code !== "AGY-HOST-COMMIT-ADMITTED"
    || launched?.commitAdmission?.recordPreflight?.code !== "AGY-RECORD-PREFLIGHT-READY"
    || launched?.commitAdmission?.modelWitness?.schema !== "pipeline.agy-host-model-witness.v1"
    || sealed.scope?.schema !== "pipeline.agy-implementation-scope.v1"
    || !SHA.test(sealed.inputSha256 ?? "")) return recovery("AGY-FINALIZE-INPUT");
  const admission = launched.commitAdmission;
  const witness = admission.modelWitness;
  let scopeMatches;
  try { scopeMatches = digest(witness.scope) === digest(sealed.scope); }
  catch { return recovery("AGY-FINALIZE-WITNESS-DRIFT"); }
  if (witness.dispatchId !== sealed.packet.dispatchId
    || witness.sessionId !== sealed.sessionId
    || witness.descriptorSha256 !== sealed.descriptorSha256
    || witness.candidateCommit !== sealed.packet.candidate.commit
    || witness.candidateTree !== sealed.packet.candidate.tree
    || witness.resultPath !== sealed.resultPath
    || witness.resultBytes !== launched.result?.bytes
    || witness.resultSha256 !== launched.result?.sha256
    || witness.model !== sealed.requestedModel
    || witness.effort !== sealed.effort
    || witness.routePolicySha256 !== sealed.routePolicySha256
    || witness.inputSha256 !== sealed.inputSha256
    || !scopeMatches) return recovery("AGY-FINALIZE-WITNESS-DRIFT");
  let stored;
  try { stored = loadStoredConsent(sealed.root, sealed.sessionId, sealed.descriptorSha256); }
  catch { return recovery("AGY-FINALIZE-CONSENT-UNAVAILABLE"); }
  let consentDigest;
  try { consentDigest = digest(stored.record); }
  catch { return recovery("AGY-FINALIZE-CONSENT-DRIFT"); }
  if (!stored.record || stored.revoked || stored.record.decisionId !== witness.consentDecisionId
    || stored.record.subjectSha256 !== witness.consentSubjectSha256
    || consentDigest !== witness.consentRecordSha256) return recovery("AGY-FINALIZE-CONSENT-DRIFT");
  const nowEpochMs = Date.now();
  let consent;
  try { consent = validateConsentRecord(stored.record, { root: sealed.root,
    repository: stored.descriptor.repo,
    session: { id: sealed.sessionId, descriptorSha256: sealed.descriptorSha256 }, nowEpochMs }); }
  catch { return recovery("AGY-FINALIZE-CONSENT-UNVERIFIABLE"); }
  if (!consent.ok || !validateDispatchBinding(stored.record, { requestedModel: sealed.requestedModel,
    role: sealed.packet.role, scope: sealed.scope,
    requiredPaths: sealed.packet.requiredPaths, nowEpochMs }).ok) {
    return recovery("AGY-FINALIZE-CONSENT-UNVERIFIABLE");
  }
  const result = verifyAgySessionResultReadback({ resultRoot: sealed.resultRoot,
    resultPath: sealed.resultPath, receipt: launched.result,
    dispatchId: sealed.packet.dispatchId, candidate: sealed.packet.candidate,
    sessionId: sealed.sessionId, requestedModel: sealed.requestedModel,
    expectedFinal: admission.final });
  if (!result.ok || result.resultSha256 !== witness.resultSha256
    || result.reportSha256 !== witness.reportSha256
    || result.model !== witness.model) return recovery("AGY-FINALIZE-RESULT-DRIFT");
  let committed;
  try {
    committed = (dependencies.commitAdmittedAgyReturn ?? commitAdmittedAgyReturn)({ baseline: admission.baseline,
      final: result.final, allowedPaths: stored.record.allowedPaths,
      taskId: sealed.packet.dispatchId, priorAdmission: admission });
  } catch {
    // An exception is not evidence that Git did nothing. Preserve any changed
    // HEAD as a recovery hint, but never publish a no-commit observation.
    return recovery("AGY-FINALIZE-COMMIT-EXCEPTION", observedCommitAfterException(admission.baseline));
  }
  if (!committed || typeof committed !== "object" || Array.isArray(committed)) {
    return recovery("AGY-FINALIZE-COMMIT-INVALID", observedCommitAfterException(admission.baseline));
  }
  if (!committed.ok) return recovery(committed.code, committed.commit ?? null);
  try {
    const draft = draftAgyAuthoredRecordAfterCommit({ taskId: sealed.packet.dispatchId,
      agentType: agyAgentTypeForRole(sealed.packet.role), observedModel: result.model,
      effort: sealed.effort, rulesetSha: sealed.routePolicySha256,
      baselineCommit: sealed.packet.candidate.commit,
      candidateTree: sealed.packet.candidate.tree,
      resultSha256: result.resultSha256, resultPath: sealed.resultPath,
      resultBytes: launched.result.bytes, consentSubjectSha256: stored.record.subjectSha256,
      consentDecisionId: stored.record.decisionId, consentRecordSha256: consentDigest,
      inputSha256: sealed.inputSha256, observedAtMs: witness.observedAtMs,
      scope: sealed.scope, sessionId: sealed.sessionId,
      descriptorSha256: sealed.descriptorSha256,
      final: result.final, modelWitness: witness,
      criticRequired: admission.criticRequired, commitReadback: committed });
    if (!draft.ok) return recovery("AGY-FINALIZE-RECORD-DRAFT", committed.commit);
    const privateDraft = draftAgyHostObservedReceipt({ modelWitness: witness,
      commitReadback: committed, record: draft.record });
    if (!privateDraft.ok) return recovery("AGY-FINALIZE-PRIVATE-DRAFT", committed.commit);
    const privateStored = persistAgyHostObservedReceipt({ commonDir: stored.descriptor.repo.commonDir,
      receipt: privateDraft.receipt, record: draft.record,
      recordBytes: agyAuthoredRecordBytes(draft.record) });
    if (!privateStored.ok) return recovery("AGY-FINALIZE-PRIVATE-STORE", committed.commit);
    let published;
    try { published = writeHostObservedAgyDispatchRecord({ repoRoot: sealed.root,
      target: `evidence/dispatch-record-${sealed.packet.dispatchId}.json`, record: draft.record }); }
    catch { return recovery("AGY-FINALIZE-RECORD-PUBLICATION", committed.commit); }
    return { status: "authored-commit-recorded", code: "AGY-AUTHORED-RECORD-VERIFIED",
      recoveryCommit: null,
      record: { target: published.target, sha256: published.sha256,
        commit: committed.commit, authorship: "host-observed-local" } };
  } catch {
    return recovery("AGY-FINALIZE-POSTCOMMIT-EXCEPTION", committed.commit);
  }
}
