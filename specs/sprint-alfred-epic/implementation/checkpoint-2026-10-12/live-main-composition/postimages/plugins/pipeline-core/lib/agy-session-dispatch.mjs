// SPDX-License-Identifier: SUL-1.0

/**
 * Candidate-bound Antigravity implementation dispatch.
 *
 * This module deliberately does not create human consent.  The caller must
 * supply an already-produced, session-bound consent record from the attended
 * authority path.  It performs the last admission check, then delegates to
 * the existing runner-neutral role preflight and AGY process boundary.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

import { resolveGovernedItemQueue, prepareGovernedItemQueue, executeGovernedItemDeliveryChecks, readNativeReservedItemScopes, observeGovernedItemIntegrationReadiness } from "./native-goldfish-host-state.mjs";
import { bindAgyItemDeliveryChecks, inspectAgyItemMainIntegration, inspectAgyItemMainIntegrationValue } from "./agy-item-delivery.mjs";
import { parseDispatchSlice } from "./dispatch-policy.mjs";
import { scopesOverlap } from "./slice-queue.mjs";
import { invokeAgy } from "./antigravity-execution-host.mjs";
import { AGY_FINAL_RETURN_JSON_SCHEMA, validateAgyFinalReturn, validateAgyFamilyReturnBinding } from "./agy-final-return.mjs";
import { parseStrictJson } from "./governance-event.mjs";
import { bindStoredModelRoleDispatch } from "./model-role-host-session.mjs";
import { ROLE_DISPATCH_PREFLIGHT_SCHEMA, preflightRoleDispatch } from "./role-dispatch-preflight.mjs";
import { loadRunnerProfilesV3Registry, validateRunnerProfilesV3Registry } from "./runner-profiles-v3.mjs";
import { recheckAgyFamilyConsentBinding, AGY_FAMILY_BINDING_SCHEMA, releaseSourceOwnedAgyConsentAdmission, loadStoredConsent, validateConsentRecord } from "./agy-session-authority.mjs";
import { observeModelFamilyActivation } from "./model-family-runtime-host.mjs";
import { createModelFamilyRuntimeHost } from "./model-family-runtime-host.mjs";
import { createModelFamilyInvocationEntry } from "./model-family-invocation.mjs";
import { createModelFamilyExecutionHost, validateInvocationReadback, digest as familyDigest } from "./model-family-execution.mjs";
import { inspectSignedDescriptorCustodyRepository } from "./worktree-lifecycle.mjs";
import { inspectSourceOwnedCurrentAuthorityContext, inspectSourceOwnedRequesterInvocation } from "./session-requester-bridge.mjs";
import { withSessionAuthorityBoundary, reserveSessionAuthorityMember, advanceSessionAuthorityMember, refreshSourceOwnedDispatchAuthorityMember, releaseSessionAuthorityMember, inspectSourceOwnedSessionAuthorityProducerRecord, inspectSourceOwnedSessionAuthorityMemberRecord, recoverSessionAuthorityMember } from "./session-authority-registry.mjs";
import { createAgyAuthorityJournalOwner, inspectAgyAuthorityRepository, readAgyAuthorityInventory, withAgyAuthorityStoreTransaction } from "./agy-host-observed-store.mjs";
import { AGY_HOST_OBSERVED_RECEIPT_SCHEMA, AGY_FAMILY_HOST_OBSERVED_RECEIPT_SCHEMA } from "./agy-host-observed-receipt.mjs";

export const AGY_SESSION_DISPATCH_SCHEMA = "pipeline.agy-session-dispatch-receipt.v1";
export const AGY_SESSION_CONSENT_SCHEMA = "pipeline.agy-session-consent.v1";
export const AGY_SESSION_DISPATCH_CODES = Object.freeze({
  CONSENT_REQUIRED: "AGY-SESSION-CONSENT-REQUIRED",
  CONSENT_INVALID: "AGY-SESSION-CONSENT-INVALID",
  SESSION_MISMATCH: "AGY-SESSION-MISMATCH",
  ROLE_FORBIDDEN: "AGY-SESSION-ROLE-FORBIDDEN",
  MODEL_MISMATCH: "AGY-SESSION-MODEL-MISMATCH",
  INPUT_MISMATCH: "AGY-SESSION-INPUT-MISMATCH",
  RESULT_INVALID: "AGY-SESSION-RESULT-INVALID",
  RESULT_COLLISION: "AGY-SESSION-RESULT-COLLISION",
  AUTHORITY_UNAVAILABLE: "AGY-SESSION-AUTHORITY-UNAVAILABLE",
  PREFLIGHT_FAILED: "AGY-SESSION-PREFLIGHT-FAILED",
});

const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const IMPLEMENTATION_ROLES = new Set(["pipeline-core:goldfish-implementor", "pipeline-core:goldfish-mechanic"]);
const nativeContexts = new WeakMap();
const heldFamilyReturns = new WeakMap();
const admittedFamilyExecutions = new WeakMap();
const verifiedFamilyReturns = new WeakMap();
const dispatchProducerPorts = new WeakMap();
const itemDeliveryContexts = new WeakMap();

function authorityFailure(code) { throw Object.assign(new Error(code), { code }); }
function dispatchLegacy(entry) {
  if (entry.namespaceId !== "agy-host-observed" || ![AGY_HOST_OBSERVED_RECEIPT_SCHEMA, AGY_FAMILY_HOST_OBSERVED_RECEIPT_SCHEMA].includes(entry.value?.schema)
    || entry.name !== `${entry.value.dispatchId}.json` || !SHA256.test(entry.value.recordSha256 ?? "")) authorityFailure("AGY-DISPATCH-UNKNOWN-SOURCE");
  // Retained receipt bytes are evidence, not a currently armed invocation.
  return null;
}
export function createAgyFamilyDispatchAuthorityProducerPort({ repository }) {
  const repo = inspectAgyAuthorityRepository(repository);
  const owner = createAgyAuthorityJournalOwner({ repository: repo, namespaceIds: ["agy-host-observed", "registered-opaque-context-lifetimes"],
    journalNamespace: "registered-opaque-context-lifetimes", producerId: "agy-family-dispatch", kinds: ["dispatch", "armed-capability"], classifyLegacy: dispatchLegacy });
  dispatchProducerPorts.set(owner.port, { repository: repo, owner }); return owner.port;
}
export function isOwnedAgyFamilyDispatchAuthorityProducerPort(port, { repository } = {}) {
  const owned = dispatchProducerPorts.get(port); if (!owned) return false;
  try { const actual=inspectAgyAuthorityRepository(repository); return owned.repository.primaryRoot===actual.primaryRoot&&owned.repository.commonDir===actual.commonDir; } catch { return false; }
}
function observeDispatchRequester(repository, explicit = null) {
  const observed = explicit?.currentInvocationHandle && explicit?.runtimePort
    ? { ...inspectSourceOwnedRequesterInvocation({ repository, currentInvocationHandle: explicit.currentInvocationHandle, runtimePort: explicit.runtimePort }), currentInvocationHandle: explicit.currentInvocationHandle, runtimePort: explicit.runtimePort }
    : inspectSourceOwnedCurrentAuthorityContext({ repository });
  if (observed?.status !== "bound" || !observed.currentInvocationHandle || !observed.runtimePort) authorityFailure("AGY-SESSION-NATIVE-CARRIER-UNAVAILABLE");
  return observed;
}
function beginDispatchLifetime({ root, sessionId, descriptorSha256, packet, purpose, currentInvocationHandle, runtimePort, itemBriefing }) {
  const repository = inspectSignedDescriptorCustodyRepository(root), producerPort = createAgyFamilyDispatchAuthorityProducerPort({ repository });
  const { owner } = dispatchProducerPorts.get(producerPort);
  return withSessionAuthorityBoundary({ repository }, boundary => {
    const requester = observeDispatchRequester(repository, { currentInvocationHandle, runtimePort });
    const target = requester.currentRequester;
    if (target.sessionId !== sessionId || target.descriptorSha256 !== descriptorSha256
      || packet?.candidate?.commit !== repository.candidate.commit || packet?.candidate?.tree !== repository.candidate.tree) authorityFailure("AGY-SESSION-REQUESTER-CAS");
    let itemDelivery = null;
    if (IMPLEMENTATION_ROLES.has(packet.role)) {
      if(itemBriefing){const prepared=prepareGovernedItemQueue({root,itemDelivery:itemBriefing,candidate:repository.candidate,writeScope:packet.requiredPaths});if(prepared.status==='refused')authorityFailure(prepared.code);}
      const governed=resolveGovernedItemQueue({root});
      if(governed.status==='refused')authorityFailure(governed.code);
      if(governed.status==='required') {
        const named=parseDispatchSlice(packet.prompt),item=governed.normalized.slices.find(row=>row.id===named.sliceId);
        if(!item||item.state!=='ready'||!itemBriefing||itemBriefing.itemId!==item.delivery.itemId||itemBriefing.sliceId!==item.id)authorityFailure('AGY-ITEM-NOT-READY');
        if(item.dependsOn.length){const readiness=observeGovernedItemIntegrationReadiness({root});if(readiness.status!=='observed'||item.dependsOn.some(id=>!readiness.integrated.includes(id)))authorityFailure('AGY-ITEM-INTEGRATION-DEPENDENCY-HELD');}
        if(item.delivery.baseCommit!==repository.candidate.commit)authorityFailure('AGY-ITEM-BASE-MISMATCH');
        itemDelivery={itemId:item.delivery.itemId,sliceId:item.id,queuePath:governed.path,queueSha256:governed.sha256,writeScope:[...item.writeScope]};
        const criterionSha256=familyDigest(itemBriefing.criterionLocator);
        const {reservations}=readNativeReservedItemScopes({repository,boundary});
        for(const row of reservations) {
          if(row.criterionSha256===criterionSha256)authorityFailure('AGY-ITEM-CRITERION-OWNER-COLLISION');
          if(row.itemId===itemDelivery.itemId)authorityFailure('AGY-ITEM-OWNER-COLLISION');
          if(scopesOverlap(row.writeScope,itemDelivery.writeScope))authorityFailure('AGY-ITEM-SCOPE-COLLISION');
        }
        const agy=readAgyAuthorityInventory({repository,namespaceIds:['registered-opaque-context-lifetimes']});
        const latest=new Map();for(const row of agy.entries.filter(entry=>entry.value?.basis?.itemDelivery)){const prior=latest.get(row.value.operationId);if(!prior||(row.value.revision??0)>(prior.value.revision??0))latest.set(row.value.operationId,row);}
        const producer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort});
        const released=new Set(producer.record.members.map(member=>inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort,memberRef:member.memberRef}).record).filter(member=>member.phase==='released').map(member=>member.bindingSha256));
        for(const row of [...latest.values()].filter(entry=>!released.has(entry.value.bindingSha256))) {
          const previous=row.value.basis.itemDelivery;
          if(row.value.basis.itemBriefing?.criterionLocator&&familyDigest(row.value.basis.itemBriefing.criterionLocator)===criterionSha256)authorityFailure('AGY-ITEM-CRITERION-OWNER-COLLISION');
          if(previous.itemId===itemDelivery.itemId)authorityFailure('AGY-ITEM-OWNER-COLLISION');
          if(scopesOverlap(previous.writeScope,itemDelivery.writeScope))authorityFailure('AGY-ITEM-SCOPE-COLLISION');
        }
      }
    }
    const association = { state: "bound", target: { sessionId, descriptorSha256, ownerNonceSha256: target.ownerNonceSha256 } };
    const operationHandle = owner.create({ purpose, association, packetSha256: familyDigest(packet), candidate:repository.candidate, itemDelivery, itemBriefing:itemBriefing??null, controllerIdentity: requester.controllerIdentity,
      sourceRef: requester.sourceRef, invocationBindingSha256: requester.invocationBindingSha256, assurance: requester.assurance });
    const reservation = reserveSessionAuthorityMember({ boundary, producerPort, association, operationHandle });
    return withAgyAuthorityStoreTransaction({ repository, boundary, producerPort }, () => {
      owner.advance({ operationHandle, boundary, producerPort, phase: "armed" });
      const refs = advanceSessionAuthorityMember({ boundary, producerPort, memberHandle: reservation.memberHandle, expectedMemberRef: reservation.memberRef, operationHandle });
      return { repository, producerPort, owner, operationHandle, memberHandle: reservation.memberHandle, memberRef: refs.memberRef,
        requester, itemDelivery, itemBriefing, currentInvocationHandle: requester.currentInvocationHandle, runtimePort: requester.runtimePort, retainedOwnerContext: true };
    });
  });
}
function recheckDispatchLifetime(lifetime) {
  const repository=inspectSignedDescriptorCustodyRepository(lifetime.repository.primaryRoot);
  if(repository.primaryRoot!==lifetime.repository.primaryRoot||repository.commonDir!==lifetime.repository.commonDir)authorityFailure('AGY-SESSION-REPOSITORY-CAS');
  lifetime.repository=repository;
  const actual = observeDispatchRequester(lifetime.repository, lifetime);
  if (actual.requesterHandle !== lifetime.requester.requesterHandle || actual.descriptorHandle !== lifetime.requester.descriptorHandle
    || actual.invocationBindingSha256 !== lifetime.requester.invocationBindingSha256
    || familyDigest(actual.controllerIdentity) !== familyDigest(lifetime.requester.controllerIdentity)
    || familyDigest(actual.sourceRef) !== familyDigest(lifetime.requester.sourceRef) || actual.assurance !== lifetime.requester.assurance) authorityFailure("AGY-SESSION-REQUESTER-CAS");
  return actual;
}
function advanceDispatchLifetime(lifetime, phase, terminal = null, terminalEvidence = null) {
  recheckDispatchLifetime(lifetime);
  return withSessionAuthorityBoundary({ repository: lifetime.repository }, boundary => {
    recheckDispatchLifetime(lifetime);
    return withAgyAuthorityStoreTransaction({ repository: lifetime.repository, boundary, producerPort: lifetime.producerPort }, () => {
      const terminalHandle = lifetime.owner.advance({ operationHandle: lifetime.operationHandle, boundary, producerPort: lifetime.producerPort, phase, terminal, terminalEvidence });
      const observed=lifetime.owner.port.observeOperation(lifetime.operationHandle);
      const updater=phase==='running'&&lifetime.phase==='running'?refreshSourceOwnedDispatchAuthorityMember:advanceSessionAuthorityMember;
      const refs = updater({ boundary, producerPort: lifetime.producerPort, memberHandle: lifetime.memberHandle, expectedMemberRef: lifetime.memberRef, operationHandle: lifetime.operationHandle });
      lifetime.phase=observed.phase;
      lifetime.memberRef = refs.memberRef; return terminalHandle;
    });
  });
}
/** One synchronous evidence-store publication, not a native dispatch result or
 * native-context terminal witness. Its member covers the actual write/readback. */
export function withSourceOwnedAgyHostObservedPublication({ root, commonDir, receipt }, publish) {
  const repository = inspectSignedDescriptorCustodyRepository(root);
  if (repository.commonDir !== commonDir || typeof publish !== "function") authorityFailure("AGY-HOST-STORE-ROOT");
  const producerPort = createAgyFamilyDispatchAuthorityProducerPort({ repository }), { owner } = dispatchProducerPorts.get(producerPort);
  return withSessionAuthorityBoundary({ repository }, boundary => {
    const requester = inspectSourceOwnedCurrentAuthorityContext({ repository });
    if (requester?.status !== "bound" || requester.currentRequester.sessionId !== receipt.sessionId || requester.currentRequester.descriptorSha256 !== receipt.descriptorSha256) authorityFailure("AGY-HOST-STORE-REQUESTER-UNAVAILABLE");
    const association = { state: "bound", target: { sessionId: receipt.sessionId, descriptorSha256: receipt.descriptorSha256, ownerNonceSha256: requester.currentRequester.ownerNonceSha256 } };
    const operationHandle = owner.create({ purpose: "host-observed-publication", association, receiptSha256: familyDigest(receipt), sourceRef: requester.sourceRef,
      invocationBindingSha256: requester.invocationBindingSha256, controllerIdentity: requester.controllerIdentity, assurance: requester.assurance });
    const reservation = reserveSessionAuthorityMember({ boundary, producerPort, association, operationHandle });
    return withAgyAuthorityStoreTransaction({ repository, boundary, producerPort }, () => {
      const result = publish();
      if (result && typeof result.then === "function") authorityFailure("AGY-HOST-STORE-ASYNC");
      if (!result?.ok) return result; // Interrupted or failed writes retain reservation.
      const stored = readAgyAuthorityInventory({ repository, namespaceIds: ["agy-host-observed"] }).entries.find(e => e.name === `${receipt.dispatchId}.json`);
      if (!stored || stored.fact.sha256 !== result.sha256 || familyDigest(stored.value) !== familyDigest(receipt)) authorityFailure("AGY-HOST-STORE-CAS");
      const terminalHandle = owner.advance({ operationHandle, boundary, producerPort, phase: "terminal-observed", terminal: "completed", sourcePaths: [{ namespaceId: "agy-host-observed", pathSha256: stored.fact.pathSha256 }] });
      const refs = advanceSessionAuthorityMember({ boundary, producerPort, memberHandle: reservation.memberHandle, expectedMemberRef: reservation.memberRef, operationHandle });
      const released = releaseSessionAuthorityMember({ boundary, producerPort, memberHandle: reservation.memberHandle, expectedMemberRef: refs.memberRef, terminalHandle });
      return { ...result, authorityReleaseRef: released.releaseRef, assurance: requester.assurance };
    });
  });
}
/** Observation only. This cannot mint a native requester or hide an armed
 * model owner. Unsupported host carriers remain unavailable before admission. */
export function inspectSourceOwnedAgyRequesterContext({ repository, context }) {
  const held = nativeContexts.get(context);
  if (!held || !held.authorityLifetime || inspectAgyAuthorityRepository(repository).primaryRoot !== held.authorityLifetime.repository.primaryRoot || repository.commonDir !== held.authorityLifetime.repository.commonDir) return { status: "unavailable", code: "AGY-SESSION-CONTEXT-UNAVAILABLE" };
  try { return { ...recheckDispatchLifetime(held.authorityLifetime), retainedOwnerContext: held.authorityLifetime.retainedOwnerContext }; }
  catch { return { status: "unavailable", code: "AGY-SESSION-CONTEXT-UNAVAILABLE" }; }
}

/** Shared scheduling readback. Only actual released Source members with a
 * completed journal and reverified Main delivery can satisfy a dependency. */
export function readAgyIntegratedItemDelivery({repository,boundary,governed}={}) {
  const producerPort=createAgyFamilyDispatchAuthorityProducerPort({repository});
  const producer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort});
  const inventory=readAgyAuthorityInventory({repository,namespaceIds:['registered-opaque-context-lifetimes']});
  const latest=new Map();for(const row of inventory.entries.filter(row=>row.value?.basis?.itemDelivery)){const prior=latest.get(row.value.operationId);if(!prior||(row.value.revision??0)>(prior.value.revision??0))latest.set(row.value.operationId,row);}
  const integrated=[];
  for(const member of producer.record.members){
    const observed=inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort,memberRef:member.memberRef});
    if(observed.record.phase!=='released'||observed.releaseRecord?.terminal!=='completed')continue;
    const row=[...latest.values()].find(row=>row.value.bindingSha256===observed.record.bindingSha256);
    if(!row?.value.basis.itemDelivery||row.value.phase!=='terminal-observed'||row.value.terminal!=='completed'||!row.value.terminalEvidence?.integration)continue;
    const original=row.value.basis.itemDelivery,item=governed?.normalized?.slices.find(item=>item.id===original.sliceId);
    if(!item||item.delivery.itemId!==original.itemId||item.delivery.baseCommit!==row.value.basis.candidate.commit||familyDigest(item.writeScope)!==familyDigest(original.writeScope))continue;
    const proof=inspectAgyItemMainIntegrationValue({root:repository.primaryRoot,value:row.value.terminalEvidence.integration.delivery});
    integrated.push({sliceId:original.sliceId,itemId:original.itemId,bindingSha256:row.value.bindingSha256,releaseRef:observed.releaseRef,mainCommit:proof.mainCommit});
  }
  return {status:'observed',code:'AGY-ITEM-INTEGRATION-READBACK',integratedSliceIds:integrated.map(item=>item.sliceId),integrated};
}

export function readAgyFamilyVerifiedReturn(handle) {
  const held = verifiedFamilyReturns.get(handle);
  return held ? { ok: true, value: structuredClone(held.value) } : { ok: false, code: "AGY-FAMILY-RETURN-HANDLE-REQUIRED" };
}

export async function prepareAgyFamilyVerifiedReturn({ context, ports, observedAtMs, routePolicySha256, inputSha256 } = {}) {
  const held = nativeContexts.get(context), raw = heldFamilyReturns.get(context);
  if (!held || !raw?.nativeResult?.ok || !SHA256.test(routePolicySha256 ?? "") || inputSha256 !== raw.nativeRequest.inputSha256) return { ok: false, code: "AGY-FAMILY-RETURN-CONTEXT-REQUIRED" };
  const checked = await verifyAgyFamilyHeldExecution({ context, ports, observedAtMs }); if (!checked.ok) return checked;
  const payload = checked.value.rawHostResult.payload;
  const final = validateAgyFinalReturn(payload, { dispatchId: held.packet.dispatchId, candidateCommit: held.packet.candidate.commit });
  if (!final.ok) return final;
  if (!final.changedPaths.every(path => held.consent.allowedPaths.includes(path))) return { ok: false, code: "AGY-FAMILY-RETURN-PATH" };
  const model = checked.value.family.executionReceipt.actualModelIds[0];
  const resultValue = { schema: "pipeline.agy-session-dispatch-result.v2", dispatchId: held.packet.dispatchId,
    candidate: held.packet.candidate, sessionId: held.sessionId, requestedModel: held.receipt.selectedModelId,
    observedModel: model, payload, family: checked.value.family };
  const published = writeExclusiveResult(held.root, held.resultPath, resultValue); if (!published.ok) return published;
  const witness = { schema: "pipeline.agy-host-model-witness.v2", sessionId: held.sessionId, descriptorSha256: held.descriptorSha256,
    dispatchId: held.packet.dispatchId, candidateCommit: held.packet.candidate.commit, candidateTree: held.packet.candidate.tree,
    role: held.packet.role, model, effort: held.receipt.effort, routePolicySha256, resultSha256: published.sha256,
    resultPath: published.path, resultBytes: published.bytes, reportSha256: final.reportSha256,
    consentSubjectSha256: held.consent.subjectSha256, consentDecisionId: held.consent.decisionId,
    consentRecordSha256: held.consent.consentRecordSha256, scope: held.scope, inputSha256, observedAtMs,
    family: checked.value.family };
  const handle = Object.freeze(Object.create(null)), value = { witness, result: published, final };
  verifiedFamilyReturns.set(handle, { context, value: structuredClone(value) });
  held.returnHandles.add(handle);
  return { ok: true, handle, ...structuredClone(value) };
}

export async function recheckAgyFamilyVerifiedReturn(handle) {
  const held = verifiedFamilyReturns.get(handle);
  if (!held) return { ok: false, code: "AGY-FAMILY-RETURN-HANDLE-REQUIRED" };
  const context = nativeContexts.get(held.context), w = held.value.witness;
  const consent = await recheckAgyFamilyConsentBinding({ authority: context.consentAuthority, handle: context.consentHandle,
    root: context.root, sessionId: context.sessionId, candidate: context.packet.candidate, consent: context.consent,
    invocationId: context.receipt.invocationId, requestedModel: context.receipt.selectedModelId, requestedEffort: context.receipt.effort,
    role: context.packet.role, scope: context.scope, requiredPaths: context.packet.requiredPaths, fallbackPolicy: context.fallbackPolicy,
    nowEpochMs: w.observedAtMs });
  return consent.ok ? { ...readAgyFamilyVerifiedReturn(handle), source: { root: context.root, packetSha256: familyDigest(context.packet), itemDelivery: context.authorityLifetime.itemDelivery !== null } } : consent;
}

/** Trusted source ports resolve original invocation provenance, independently
 * observed launch controls and S2 context. Wire JSON cannot supply them. */
export async function verifyAgyFamilyHeldExecution({ context, ports, observedAtMs } = {}) {
  const held = nativeContexts.get(context), returned = heldFamilyReturns.get(context);
  if (!held || !returned?.nativeResult?.ok) return { ok: false, code: "AGY-FAMILY-RETURN-CONTEXT-REQUIRED" };
  if (!Number.isSafeInteger(observedAtMs) || observedAtMs < returned.observedAtMs) return { ok: false, code: "AGY-FAMILY-RETURN-EVENT-TIME" };
  if (typeof ports?.readOriginalInvocation !== "function" || typeof ports?.readLaunchEvidence !== "function"
    || typeof ports?.contextForInvocation !== "function" || typeof ports?.adapters?.antigravity?.readActualExecutionIdentity !== "function") return { ok: false, code: "AGY-FAMILY-EXECUTION-PORTS-UNQUALIFIED" };
  const consent = await recheckAgyFamilyConsentBinding({ authority: held.consentAuthority, handle: held.consentHandle, root: held.root,
    sessionId: held.sessionId, candidate: held.packet.candidate, consent: held.consent, invocationId: held.receipt.invocationId,
    requestedModel: held.receipt.selectedModelId, requestedEffort: held.receipt.effort, role: held.packet.role, scope: held.scope,
    requiredPaths: held.packet.requiredPaths, fallbackPolicy: held.fallbackPolicy, nowEpochMs: observedAtMs });
  if (!consent.ok) return consent;
  if (admittedFamilyExecutions.has(context)) {
    const original = admittedFamilyExecutions.get(context);
    return original.observedAtMs === observedAtMs ? { ok: true, value: structuredClone(original) } : { ok: false, code: "AGY-FAMILY-RETURN-EVENT-TIME" };
  }
  let original;
  const execution = createModelFamilyExecutionHost({
    readInvocation: async () => {
      const read = await ports.readOriginalInvocation({ root: held.root, sessionId: held.sessionId, invocationId: held.receipt.invocationId, expectedReceiptSha256: held.receipt.receiptSha256 });
      const checked = validateInvocationReadback(read?.value); if (!read?.ok || !checked.ok || familyDigest(checked.value.invocation) !== familyDigest(held.receipt)) return { ok: false, code: "AGY-FAMILY-ORIGINAL-INVOCATION-DRIFT", retryable: false };
      original = checked.value; return { ok: true, code: "AGY-FAMILY-ORIGINAL-INVOCATION", value: original };
    },
    readLaunchEvidence: ports.readLaunchEvidence, adapters: ports.adapters, contextForInvocation: ports.contextForInvocation,
    verifyAlias: ports.verifyAlias,
  });
  const raw = returned.nativeResult.value;
  const recorded = await execution.recordModelFamilyExecution({ invocationId: held.receipt.invocationId, rawHostResult: raw });
  if (!recorded.ok) return recorded;
  const receipt = execution.readExecutionReceipt(recorded.value); if (!receipt.ok) return receipt;
  const family = { invocation: original.invocation, bindings: original.bindings, provenanceSha256: original.provenanceSha256,
    consentBinding: consent.projection, executionReceipt: receipt.value, nativeRequestSha256: familyDigest(returned.nativeRequest), rawHostResultSha256: familyDigest(raw) };
  const value = { family, observedAtMs, rawHostResult: structuredClone(raw) };
  admittedFamilyExecutions.set(context, value);
  return { ok: true, value: structuredClone(value) };
}

export function observeAgyFamilyDispatchActivation(root) {
  const observed = observeModelFamilyActivation({ cwd: root });
  if (observed.ok) return observed;
  try { execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_COMMON_DIR: undefined } }); }
  catch (error) { if (error.status === 128 && error.stderr?.toString().includes("not a git repository")) return { ok: true, status: "inactive", code: "MODEL-FAMILY-INACTIVE-NO-GIT" }; }
  return observed;
}

export async function dispatchAgyFamilyNativeContext({ context, inputSha256, timeoutMs, nowEpochMs, resultRoot } = {}) {
  const held = nativeContexts.get(context);
  if (!held) return rejected("AGY-SESSION-FAMILY-CONTEXT-REQUIRED", "context");
  return dispatchAgySession({ root: held.root, resultRoot: resultRoot ?? held.root, resultPath: held.resultPath, packet: held.packet,
    session: { id: held.sessionId, source: "runtime", observed: true }, consent: held.consent,
    requestedModel: held.receipt.selectedModelId, effort: held.receipt.effort, scope: held.scope, fallbackPolicy: held.fallbackPolicy,
    familyConsentAuthority: held.consentAuthority, familyConsentHandle: held.consentHandle, familyInvocationId: held.receipt.invocationId,
    familyNativeContext: context, inputSha256, timeoutMs, nowEpochMs });
}

export function readAgyFamilyNativeContext(context) {
  const held = nativeContexts.get(context);
  return held ? { ok: true, receipt: structuredClone(held.receipt), consent: structuredClone(held.consent), scope: structuredClone(held.scope), fallbackPolicy: structuredClone(held.fallbackPolicy) }
    : { ok: false, code: "AGY-SESSION-FAMILY-CONTEXT-REQUIRED" };
}

/** Terminal release joins the original source-owned model disposition. A
 * verified return alone leaves the opaque owner context held. */
export async function closeSourceOwnedAgyFamilyVerifiedReturn(handle) {
  const returned = verifiedFamilyReturns.get(handle), context = returned?.context, held = nativeContexts.get(context);
  if (!returned || !held || !admittedFamilyExecutions.has(context) || !held.consumed) return { ok: false, code: "AGY-FAMILY-RETURN-CONTEXT-REQUIRED" };
  const lifetime = held.authorityLifetime;
  if (typeof held.entry.disposeModelFamilyInvocation !== "function") return { ok: false, code: "AGY-SESSION-OWNER-CONTEXT-HELD", status: "held" };
  try {
    recheckDispatchLifetime(lifetime);
    const readback = verifyAgySessionResultReadback({ resultRoot: held.root, resultPath: held.resultPath, receipt: returned.value.result,
      dispatchId: held.packet.dispatchId, candidate: held.packet.candidate, sessionId: held.sessionId,
      requestedModel: held.receipt.selectedModelId, expectedFinal: returned.value.final, familyWitness: returned.value.witness });
    if (!readback.ok) return { ok: false, code: "AGY-SESSION-TERMINAL-RESULT-DRIFT", status: "held" };
    if(lifetime.itemDelivery){
      const checks=executeGovernedItemDeliveryChecks({root:held.root,itemDelivery:lifetime.itemBriefing,candidate:lifetime.repository.candidate});
      if(checks.status!=='observed'||checks.evidence.verdict!=='passed')return {ok:false,status:'held',code:checks.code};
      const delivery=bindAgyItemDeliveryChecks({root:held.root,itemDelivery:lifetime.itemBriefing,candidate:lifetime.repository.candidate,checkHandle:checks.handle,baseCommit:held.packet.candidate.commit,writeScope:lifetime.itemDelivery.writeScope,changedPaths:returned.value.final.changedPaths});
      lifetime.deliveryHandle=delivery.handle;
      lifetime.deliveryValue=delivery.value;
    }
    const disposed = await held.entry.disposeModelFamilyInvocation({ invocation: held.selected });
    if (!disposed?.ok || disposed.status !== "closed" || disposed.code !== "MODEL-FAMILY-INVOCATION-CLOSED"
      || disposed.receiptSha256 !== held.receipt.receiptSha256 || !["physical-readback", "controlled-unit-method"].includes(disposed.assurance)
      || !Array.isArray(disposed.sourceRefs) || !disposed.sourceRefs.length || disposed.sourceRefs.length > 64
      || disposed.sourceRefs.some(f => !SHA256.test(f?.sha256 ?? "") || !SHA256.test(f?.pathSha256 ?? "") || !SHA256.test(f?.semanticSha256 ?? "")
        || typeof f.namespaceId !== "string" || !Number.isSafeInteger(f.size) || f.size < 0 || f.identity?.nlink !== 1)) return { ok: false, code: "AGY-SESSION-OWNER-CONTEXT-HELD", status: "held" };
    const consentClosed = releaseSourceOwnedAgyConsentAdmission({ authority: held.consentAuthority, handle: held.consentHandle });
    if (!consentClosed.ok) return { ...consentClosed, status: "held" };
    // Every source-owned reader/binder of these Agy contexts now refuses. No
    // caller-provided terminal boolean or WeakMap absence initiated disposal.
    for (const returnHandle of held.returnHandles) verifiedFamilyReturns.delete(returnHandle);
    held.returnHandles.clear();
    heldFamilyReturns.delete(context); admittedFamilyExecutions.delete(context); nativeContexts.delete(context);
    lifetime.retainedOwnerContext = false;
    const terminalEvidence={ modelReceiptSha256: disposed.receiptSha256,
      modelTerminalSourceRefs: disposed.sourceRefs, verifiedResultSha256: returned.value.result.sha256, consentReleaseRef: consentClosed.releaseRef,
      ownerContextState: "source-invalidated" };
    // Product delivery remains owned after host contexts end. Neither a final
    // report nor context disposal proves targeted checks or Main integration.
    if(lifetime.itemDelivery){
      advanceDispatchLifetime(lifetime,'running',null,{schema:'pipeline.agy-item-delivery-checkpoint.v1',...terminalEvidence,delivery:lifetime.deliveryValue});
      const deliveryContext=Object.freeze({});itemDeliveryContexts.set(deliveryContext,{lifetime,terminalEvidence});
      return {ok:true,status:'delivered',code:'AGY-ITEM-RESERVATION-HELD',memberRef:lifetime.memberRef,deliveryContext,delivery:structuredClone(lifetime.deliveryValue)};
    }
    const terminalHandle = advanceDispatchLifetime(lifetime, "terminal-observed", "completed", terminalEvidence);
    return withSessionAuthorityBoundary({ repository: lifetime.repository }, boundary => {
      const released = releaseSessionAuthorityMember({ boundary, producerPort: lifetime.producerPort, memberHandle: lifetime.memberHandle, expectedMemberRef: lifetime.memberRef, terminalHandle });
      return { ok: true, status: "closed", code: "AGY-SESSION-SOURCE-OWNED-CONTEXT-CLOSED", releaseRef: released.releaseRef,
        assurance: lifetime.requester.assurance === "controlled-unit-method" || disposed.assurance === "controlled-unit-method" ? "controlled-unit-method" : "physical-readback",
        modelTerminalSourceRefs: structuredClone(disposed.sourceRefs) };
    });
  } catch (error) { return { ok: false, status: "held", code: error?.code ?? "AGY-SESSION-OWNER-CONTEXT-HELD" }; }
}

/** The original Source reservation is released only after actual Main readback.
 * Raw delivered/PASS objects cannot select a retained reservation. */
export function integrateSourceOwnedAgyItemDelivery({deliveryContext}={}) {
  const held=itemDeliveryContexts.get(deliveryContext);if(!held)return {ok:false,status:'held',code:'AGY-ITEM-DELIVERY-CONTEXT-REQUIRED'};
  try {
    const {lifetime,terminalEvidence}=held;
    recheckDispatchLifetime(lifetime);
    const integration=inspectAgyItemMainIntegration({root:lifetime.repository.primaryRoot,handle:lifetime.deliveryHandle});
    const terminalHandle=advanceDispatchLifetime(lifetime,'terminal-observed','completed',{...terminalEvidence,integration});
    const result=withSessionAuthorityBoundary({repository:lifetime.repository},boundary=>releaseSessionAuthorityMember({boundary,producerPort:lifetime.producerPort,memberHandle:lifetime.memberHandle,expectedMemberRef:lifetime.memberRef,terminalHandle}));
    itemDeliveryContexts.delete(deliveryContext);
    return {ok:true,status:'integrated',code:'AGY-ITEM-MAIN-INTEGRATED',releaseRef:result.releaseRef,integration};
  }catch(error){return {ok:false,status:'held',code:error.code??'AGY-ITEM-INTEGRATION-UNAVAILABLE'};}
}

/** Recover only a real current journal/member pair for the same authenticated
 * original owner. A JSON receipt or an old member revision cannot release it. */
export function recoverSourceOwnedAgyItemDelivery({root,memberRef}={}) {
  try {
    const repository=inspectSignedDescriptorCustodyRepository(root),producerPort=createAgyFamilyDispatchAuthorityProducerPort({repository}),{owner}=dispatchProducerPorts.get(producerPort);
    return withSessionAuthorityBoundary({repository},boundary=>{
      const requester=observeDispatchRequester(repository);
      const member=inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort,memberRef});
      const journal=readAgyAuthorityInventory({repository,namespaceIds:['registered-opaque-context-lifetimes']}).entries
        .filter(row=>row.value?.bindingSha256===member.record.bindingSha256).sort((a,b)=>(b.value.revision??0)-(a.value.revision??0))[0];
      const basis=journal?.value.basis,evidence=journal?.value.terminalEvidence;
      if(!['running','terminal-observed'].includes(member.record.phase)||journal?.value.phase!==member.record.phase||!basis.itemDelivery||evidence?.ownerContextState!=='source-invalidated'
        ||familyDigest(basis.association.target)!==familyDigest({sessionId:requester.currentRequester.sessionId,descriptorSha256:requester.currentRequester.descriptorSha256,ownerNonceSha256:requester.currentRequester.ownerNonceSha256})
        ||basis.invocationBindingSha256!==requester.invocationBindingSha256||familyDigest(basis.sourceRef)!==familyDigest(requester.sourceRef)
        ||familyDigest(basis.controllerIdentity)!==familyDigest(requester.controllerIdentity))authorityFailure('AGY-ITEM-RECOVERY-OWNER-CAS');
      const operationHandle=owner.restore(member.record.bindingSha256);
      const recovered=recoverSessionAuthorityMember({boundary,producerPort,operationHandle,expectedMemberRef:member.memberRef});
      const integration=inspectAgyItemMainIntegrationValue({root,value:evidence.delivery??evidence.integration?.delivery});
      return withAgyAuthorityStoreTransaction({repository,boundary,producerPort},()=>{
        const terminalHandle=member.record.phase==='terminal-observed'?owner.restoreTerminal(operationHandle):owner.advance({operationHandle,boundary,producerPort,phase:'terminal-observed',terminal:'completed',terminalEvidence:{...evidence,integration}});
        if(member.record.phase==='terminal-observed'&&journal.value.terminal!=='completed')authorityFailure('AGY-ITEM-RECOVERY-TERMINAL-CAS');
        const refs=member.record.phase==='terminal-observed'?{memberRef:recovered.memberRef}:advanceSessionAuthorityMember({boundary,producerPort,memberHandle:recovered.memberHandle,expectedMemberRef:recovered.memberRef,operationHandle});
        const released=releaseSessionAuthorityMember({boundary,producerPort,memberHandle:recovered.memberHandle,expectedMemberRef:refs.memberRef,terminalHandle});
        return {ok:true,status:'integrated',code:'AGY-ITEM-MAIN-INTEGRATED',releaseRef:released.releaseRef,integration};
      });
    });
  }catch(error){return {ok:false,status:'held',code:error.code??'AGY-ITEM-RECOVERY-UNAVAILABLE'};}
}

/** Cancellation observes genuine invocation disposal and the absence of product
 * residue. A stop request or process error alone leaves the reservation held. */
export async function cancelSourceOwnedAgyItemDispatch({context}={}) {
  const held=nativeContexts.get(context),lifetime=held?.authorityLifetime;
  if(!held||!lifetime?.itemDelivery||typeof held.entry.disposeModelFamilyInvocation!=='function')return {ok:false,status:'held',code:'AGY-ITEM-CANCELLATION-UNAVAILABLE'};
  try {
    recheckDispatchLifetime(lifetime);
    const root=held.root,args=['-C',root];
    const options={encoding:'utf8',shell:false,timeout:10000,maxBuffer:1024*1024,env:{...process.env,GIT_DIR:undefined,GIT_WORK_TREE:undefined,GIT_COMMON_DIR:undefined,GIT_INDEX_FILE:undefined}};
    const diff=execFileSync('git',[...args,'diff','--name-only','-z',held.packet.candidate.commit,lifetime.repository.candidate.commit,'--',...lifetime.itemDelivery.writeScope],options);
    const residue=execFileSync('git',[...args,'status','--porcelain=v1','-z','--untracked-files=all','--',...lifetime.itemDelivery.writeScope],options);
    if(diff.length||residue.length)return {ok:false,status:'held',code:'AGY-ITEM-CANCELLATION-PRODUCT-RESIDUE'};
    const disposed=await held.entry.disposeModelFamilyInvocation({invocation:held.selected});
    if(!disposed?.ok||disposed.status!=='closed'||disposed.code!=='MODEL-FAMILY-INVOCATION-CLOSED'||disposed.receiptSha256!==held.receipt.receiptSha256
      ||!['physical-readback','controlled-unit-method'].includes(disposed.assurance)||!Array.isArray(disposed.sourceRefs)||!disposed.sourceRefs.length
      ||disposed.sourceRefs.some(ref=>!SHA256.test(ref.sha256??'')||!SHA256.test(ref.pathSha256??'')||!SHA256.test(ref.semanticSha256??'')||ref.identity?.nlink!==1))return {ok:false,status:'held',code:'AGY-ITEM-CANCELLATION-UNAVAILABLE'};
    const consent=releaseSourceOwnedAgyConsentAdmission({authority:held.consentAuthority,handle:held.consentHandle});if(!consent.ok)return {...consent,status:'held'};
    if(execFileSync('git',[...args,'diff','--name-only','-z',held.packet.candidate.commit,'HEAD','--',...lifetime.itemDelivery.writeScope],options).length
      ||execFileSync('git',[...args,'status','--porcelain=v1','-z','--untracked-files=all','--',...lifetime.itemDelivery.writeScope],options).length)return {ok:false,status:'held',code:'AGY-ITEM-CANCELLATION-PRODUCT-RESIDUE'};
    for(const handle of held.returnHandles)verifiedFamilyReturns.delete(handle);
    heldFamilyReturns.delete(context);admittedFamilyExecutions.delete(context);nativeContexts.delete(context);lifetime.retainedOwnerContext=false;
    const terminalHandle=advanceDispatchLifetime(lifetime,'terminal-observed','cancelled',{modelReceiptSha256:disposed.receiptSha256,modelTerminalSourceRefs:disposed.sourceRefs,consentReleaseRef:consent.releaseRef,ownerContextState:'source-invalidated',productResidue:'absent'});
    const released=withSessionAuthorityBoundary({repository:lifetime.repository},boundary=>releaseSessionAuthorityMember({boundary,producerPort:lifetime.producerPort,memberHandle:lifetime.memberHandle,expectedMemberRef:lifetime.memberRef,terminalHandle}));
    return {ok:true,status:'cancelled',code:'AGY-ITEM-CANCELLED',releaseRef:released.releaseRef};
  }catch(error){return {ok:false,status:'held',code:error.code??'AGY-ITEM-CANCELLATION-UNAVAILABLE'};}
}

/** Preparation constructs the S5 entry here; a caller-shaped entry cannot
 * substitute opaque selections or launch methods. All ports are host seams. */
export async function prepareAgyFamilyNativeDispatch({ root, packet, sessionId, descriptorSha256, resultPath,
  consentAuthority, runtimeHost, routeSource,
  scope, fallbackPolicy, currentInvocationHandle, runtimePort, itemDelivery, nowEpochMs = Date.now() } = {}) {
  try {
    if (!IMPLEMENTATION_ROLES.has(packet?.role)) return { ok: false, code: "AGY-SESSION-ROLE-FORBIDDEN" };
    const authorityLifetime = beginDispatchLifetime({ root, sessionId, descriptorSha256, packet, purpose: "family-dispatch", currentInvocationHandle, runtimePort, itemBriefing:itemDelivery });
    const taskRoute = packet.role.endsWith("mechanic") ? "duty.mechanic" : "duty.implement";
    const entry = createModelFamilyInvocationEntry({ runtimeHost: runtimeHost ?? createModelFamilyRuntimeHost({ cwd: root }), ...(routeSource ? { routeSource } : {}) });
    const selected = await entry.prepareCurrentModelFamilyInvocation({ kind: "dispatch", runner: "antigravity", taskRoute, invocationId: packet.dispatchId });
    if (!selected.ok) return selected;
    const receipt = selected.value.receipt;
    if (receipt.sessionId !== sessionId || receipt.candidateCommit !== packet.candidate?.commit || receipt.candidateTree !== packet.candidate?.tree) return { ok: false, code: "AGY-CONSENT-CANDIDATE-MISMATCH" };
    if (typeof consentAuthority?.admit !== "function" || typeof consentAuthority?.bind !== "function") return { ok: false, code: "AGY-CONSENT-HOST-INVALID" };
    const admitted = await consentAuthority.admit({ root, sessionId, descriptorSha256, currentInvocationHandle: authorityLifetime.currentInvocationHandle, runtimePort: authorityLifetime.runtimePort, nowEpochMs }); if (!admitted.ok) return admitted;
    const request = { invocationId: packet.dispatchId, requestedModel: receipt.selectedModelId, requestedEffort: receipt.effort, role: packet.role, scope, requiredPaths: packet.requiredPaths, fallbackPolicy, nowEpochMs };
    const bound = await consentAuthority.bind(admitted.handle, request); if (!bound.ok) return bound;
    const checked = await recheckAgyFamilyConsentBinding({ authority: consentAuthority, handle: admitted.handle, root, sessionId, candidate: packet.candidate, consent: bound.projection, ...request });
    if (!checked.ok || checked.invocation.receiptSha256 !== receipt.receiptSha256) return checked.ok ? { ok: false, code: "AGY-CONSENT-INVOCATION-MISMATCH" } : checked;
    const context = Object.freeze(Object.create(null));
    nativeContexts.set(context, { entry, selected: selected.value.handle, receipt, consentAuthority, consentHandle: admitted.handle, consent: checked.projection,
      root, sessionId, descriptorSha256, resultPath, packet: structuredClone(packet), scope: structuredClone(scope), fallbackPolicy: structuredClone(fallbackPolicy), consumed: false, authorityLifetime, returnHandles: new Set() });
    return { ok: true, context, receipt: structuredClone(receipt), consent: checked.projection, assurance: authorityLifetime.requester.assurance };
  } catch (error) { return { ok: false, code: error.code ?? "AGY-SESSION-FAMILY-PREPARATION-UNAVAILABLE", launcherCalls: 0, modelCalls: 0 }; }
}

/** Internal next-slice seam: public receipts cannot resolve native result
 * context; the original private dispatch context is required. */
export function readAgyFamilyHeldReturn(context) {
  const held = heldFamilyReturns.get(context);
  return held ? { ok: true, value: structuredClone(held) } : { ok: false, code: "AGY-SESSION-FAMILY-RETURN-UNAVAILABLE" };
}

const digest = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value), "utf8").digest("hex");
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const rejected = (code, field, extra = {}) => ({
  schema: AGY_SESSION_DISPATCH_SCHEMA,
  status: "rejected",
  code,
  field,
  modelCalls: 0,
  launcherCalls: 0,
  ...extra,
});

function validSessionIdentity(identity) {
  return exact(identity, ["id", "source", "observed"])
    && SESSION_ID.test(identity.id ?? "")
    && identity.source === "runtime"
    && identity.observed === true;
}

function validateConsent(consent, { sessionId, model, role, scope, nowEpochMs }) {
  if (consent === undefined || consent === null) return { ok: false, code: AGY_SESSION_DISPATCH_CODES.CONSENT_REQUIRED };
  if (!exact(consent, ["schema", "status", "decisionId", "sessionId", "runner", "provider", "model", "role", "scope", "subjectSha256", "approvedAtMs", "expiresAtMs"]) || consent.schema !== AGY_SESSION_CONSENT_SCHEMA
    || consent.status !== "approved" || !SESSION_ID.test(consent.decisionId ?? "") || consent.sessionId !== sessionId
    || consent.runner !== "antigravity" || consent.provider !== "google" || consent.model !== model || consent.role !== role
    || digest(consent.scope) !== digest(scope) || !SHA256.test(consent.subjectSha256 ?? "")
    || !Number.isSafeInteger(consent.approvedAtMs) || !Number.isSafeInteger(consent.expiresAtMs)
    || consent.expiresAtMs <= consent.approvedAtMs || nowEpochMs >= consent.expiresAtMs) {
    return { ok: false, code: AGY_SESSION_DISPATCH_CODES.CONSENT_INVALID };
  }
  return { ok: true };
}

function safeResultPath(resultRoot, resultPath) {
  if (typeof resultPath !== "string" || resultPath.length === 0 || resultPath.includes("\\")
    || resultPath.startsWith("/") || resultPath.split("/").some((part) => !part || part === "." || part === "..")) return null;
  try {
    const rootLexical = resolve(resultRoot);
    const rootStat = lstatSync(rootLexical);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return null;
    const root = realpathSync(rootLexical);
    const target = resolve(root, resultPath);
    const rel = relative(root, target);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) return null;
    const parent = dirname(target);
    const parentStat = lstatSync(parent);
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || realpathSync(parent) !== parent) return null;
    try { lstatSync(target); return null; } catch (error) { if (error?.code !== "ENOENT") return null; }
  } catch (error) {
    return null;
  }
  return { root: resolve(resultRoot), target: resolve(resultRoot, resultPath), relative: resultPath };
}

function writeExclusiveResult(resultRoot, resultPath, value) {
  const location = safeResultPath(resultRoot, resultPath);
  if (location === null) return { ok: false, code: AGY_SESSION_DISPATCH_CODES.RESULT_COLLISION };
  try {
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
    writeFileSync(location.target, bytes, { flag: "wx", mode: 0o600 });
    return { ok: true, path: location.relative, bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch {
    return { ok: false, code: AGY_SESSION_DISPATCH_CODES.RESULT_COLLISION };
  }
}

/** Re-read the host's exclusive Final Return file before commit or non-authoring recovery. */
export function verifyAgySessionResultReadback({ resultRoot, resultPath, receipt, dispatchId,
  candidate, sessionId, requestedModel, expectedFinal, familyWitness = null } = {}) {
  if (!exact(receipt, ["ok", "path", "bytes", "sha256"]) || receipt.ok !== true || receipt.path !== resultPath
    || !Number.isSafeInteger(receipt.bytes) || receipt.bytes < 1 || receipt.bytes > 2 * 1024 * 1024
    || !SHA256.test(receipt.sha256 ?? "") || !OID.test(candidate?.commit ?? "")
    || !OID.test(candidate?.tree ?? "") || !SESSION_ID.test(sessionId ?? "")
    || typeof dispatchId !== "string" || dispatchId.length === 0
    || typeof requestedModel !== "string" || requestedModel.length === 0
    || !["succeeded", "failed", "blocked"].includes(expectedFinal?.outcome)
    || !SHA256.test(expectedFinal.reportSha256 ?? "")
    || !Array.isArray(expectedFinal.changedPaths)) {
    return { ok: false, code: "AGY-RESULT-READBACK-INPUT" };
  }
  let raw;
  try {
    const root = resolve(resultRoot);
    const rootStat = lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || realpathSync(root) !== root
      || typeof resultPath !== "string" || resultPath.startsWith("/") || resultPath.includes("\\")
      || resultPath.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("path");
    const target = resolve(root, resultPath);
    const rel = relative(root, target);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)
      || realpathSync(dirname(target)) !== dirname(target)) throw new Error("parent");
    const expected = lstatSync(target);
    if (!expected.isFile() || expected.isSymbolicLink() || realpathSync(target) !== target
      || expected.size !== receipt.bytes) throw new Error("file");
    const fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const before = fstatSync(fd);
      if (!before.isFile() || before.dev !== expected.dev || before.ino !== expected.ino
        || before.size !== receipt.bytes) throw new Error("inode");
      const buffer = Buffer.alloc(receipt.bytes + 1);
      let length = 0;
      while (length < buffer.length) {
        const count = readSync(fd, buffer, length, buffer.length - length, null);
        if (count === 0) break;
        length += count;
      }
      raw = buffer.subarray(0, length);
      const after = fstatSync(fd);
      const pathAfter = lstatSync(target);
      if (length !== receipt.bytes || after.dev !== before.dev || after.ino !== before.ino
        || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
        || pathAfter.dev !== before.dev || pathAfter.ino !== before.ino
        || realpathSync(target) !== target
        || createHash("sha256").update(raw).digest("hex") !== receipt.sha256) throw new Error("bytes");
    } finally { closeSync(fd); }
  } catch { return { ok: false, code: "AGY-RESULT-READBACK-DRIFT" }; }
  let result;
  try { result = parseStrictJson(raw); }
  catch { return { ok: false, code: "AGY-RESULT-READBACK-MALFORMED" }; }
  const family = result.schema === "pipeline.agy-session-dispatch-result.v2";
  if (!exact(result, ["schema", "dispatchId", "candidate", "sessionId", "requestedModel", "observedModel", "payload", ...(family ? ["family"] : [])])
    || !(family ? familyWitness?.schema === "pipeline.agy-host-model-witness.v2" && validateAgyFamilyReturnBinding(result.family, familyWitness)
      && familyDigest(result.family) === familyDigest(familyWitness.family) : result.schema === "pipeline.agy-session-dispatch-result.v1")
    || result.dispatchId !== dispatchId || result.sessionId !== sessionId
    || result.candidate?.commit !== candidate.commit || result.candidate?.tree !== candidate.tree
    || result.requestedModel !== requestedModel || (family ? result.observedModel !== familyWitness.model : result.observedModel !== requestedModel)) {
    return { ok: false, code: "AGY-RESULT-READBACK-BINDING" };
  }
  const final = validateAgyFinalReturn(result.payload, { dispatchId, candidateCommit: candidate.commit });
  if (!final.ok || final.outcome !== expectedFinal.outcome
    || final.reportSha256 !== expectedFinal.reportSha256
    || JSON.stringify(final.changedPaths) !== JSON.stringify(expectedFinal.changedPaths)) {
    return { ok: false, code: "AGY-RESULT-READBACK-FINAL" };
  }
  return { ok: true, code: "AGY-RESULT-READBACK-VERIFIED", model: result.observedModel,
    resultSha256: receipt.sha256, reportSha256: final.reportSha256, changedPaths: final.changedPaths,
    // The host-owned authored record needs the actual durable report bytes,
    // not a digest or a second model-supplied copy. Keep this on the internal
    // readback result; the outer Elephant receipt never includes report text.
    final };
}

/**
 * Admit and execute one implementation-only AGY dispatch. `consent` is an
 * input, never minted here; tests and callers can prove it came from the
 * attended human authority mechanism without this wrapper inventing a second
 * approval protocol.
 */
export async function dispatchAgySession({
  root,
  resultRoot = root,
  packet,
  resultPath,
  session,
  consent,
  familyConsentAuthority,
  familyConsentHandle,
  familyInvocationId,
  familyNativeContext,
  fallbackPolicy,
  requestedModel,
  modelRoleStore,
  readRegistry = loadRunnerProfilesV3Registry,
  effort = "high",
  scope,
  inputSha256,
  agyPath,
  timeoutMs = 300_000,
  env = process.env,
  signal,
  nowEpochMs = Date.now(),
  verifyAuthority,
  requireObservedModel = false,
  streamJson = false,
  requireStructuredFinal = false,
} = {}) {
  if (!validSessionIdentity(session)) return rejected(AGY_SESSION_DISPATCH_CODES.SESSION_MISMATCH, "session");
  if (!IMPLEMENTATION_ROLES.has(packet?.role)) return rejected(AGY_SESSION_DISPATCH_CODES.ROLE_FORBIDDEN, "packet.role");
  if (typeof requestedModel !== "string" || requestedModel.trim() === "") return rejected(AGY_SESSION_DISPATCH_CODES.MODEL_MISMATCH, "requestedModel");
  // Observe physical activation before the historical V3 fallback. No caller
  // flag, old consent or model-only binding can authorize a family launch.
  const activation = observeModelFamilyActivation({ cwd: root ?? process.cwd() });
  const familyRequested = activation.status !== "inactive" || consent?.schema === AGY_FAMILY_BINDING_SCHEMA
    || familyConsentAuthority !== undefined || familyConsentHandle !== undefined || familyInvocationId !== undefined || familyNativeContext !== undefined;
  if (familyRequested) {
    if (!activation.ok) return rejected(activation.code, "familyActivation");
    if (consent?.schema !== AGY_FAMILY_BINDING_SCHEMA) return rejected("AGY-SESSION-FAMILY-CONSENT-V2-REQUIRED", "consent");
    if (packet.transport !== "antigravity" || !SHA256.test(inputSha256 ?? "")
      || (scope?.dispatchId !== undefined && scope.dispatchId !== packet.dispatchId)) return rejected(AGY_SESSION_DISPATCH_CODES.INPUT_MISMATCH, "packet");
    const checked = await recheckAgyFamilyConsentBinding({ authority: familyConsentAuthority, handle: familyConsentHandle,
      root, sessionId: session.id, candidate: packet.candidate, consent, invocationId: familyInvocationId,
      requestedModel, requestedEffort: effort, role: packet.role, scope, requiredPaths: packet.requiredPaths,
      fallbackPolicy, nowEpochMs });
    if (!checked.ok) return rejected(checked.code, "familyConsent");
    const held = nativeContexts.get(familyNativeContext);
    if (held) {
      if (held.consumed || root !== held.root || session.id !== held.sessionId || resultPath !== held.resultPath
        || familyConsentAuthority !== held.consentAuthority || familyConsentHandle !== held.consentHandle
        || familyInvocationId !== held.receipt.invocationId || digest(packet) !== digest(held.packet)
        || digest(scope) !== digest(held.scope) || digest(fallbackPolicy) !== digest(held.fallbackPolicy)
        || checked.invocation.receiptSha256 !== held.receipt.receiptSha256) return rejected("AGY-SESSION-FAMILY-CONTEXT-MISMATCH", "familyNativeContext");
      const prepared = preflightRoleDispatch({ root, resultRoot, packet });
      if (prepared.status !== "prepared") return rejected(AGY_SESSION_DISPATCH_CODES.PREFLIGHT_FAILED, prepared.field ?? "packet", { preflight: prepared });
      if (!safeResultPath(resultRoot, resultPath)) return rejected(AGY_SESSION_DISPATCH_CODES.RESULT_COLLISION, "resultPath");
      const nativeRequest = { schema: "pipeline.agy-native-implementation-request.v2", root, resultRoot, resultPath,
        packet: prepared.packet, sessionId: session.id, descriptorSha256: held.descriptorSha256, requestedModel, effort,
        scope, fallbackPolicy, inputSha256, timeoutMs, consent: checked.projection };
      const r = held.receipt, bindingPacket = Object.fromEntries(["runner", "sessionId", "invocationId", "candidateCommit", "candidateTree", "taskRoute", "role", "effort", "selectedModelId", "authoritySha256", "discoverySha256", "packetBindingSha256"].map(k => [k, r[k]]));
      try { advanceDispatchLifetime(held.authorityLifetime, "running"); } catch (error) { return rejected(error.code ?? "AGY-SESSION-AUTHORITY-UNAVAILABLE", "authorityLifetime"); }
      const bound = await held.entry.bindModelFamilyInvocation({ invocation: held.selected, packet: bindingPacket, nativeRequest });
      if (!bound.ok) return rejected(bound.code, "nativeRequest");
      const finalConsent = await recheckAgyFamilyConsentBinding({ authority: familyConsentAuthority, handle: familyConsentHandle, root,
        sessionId: session.id, candidate: packet.candidate, consent, invocationId: familyInvocationId, requestedModel,
        requestedEffort: effort, role: packet.role, scope, requiredPaths: packet.requiredPaths, fallbackPolicy, nowEpochMs });
      if (!finalConsent.ok) return rejected(finalConsent.code, "familyConsent");
      try { recheckDispatchLifetime(held.authorityLifetime); } catch (error) { return rejected(error.code ?? "AGY-SESSION-AUTHORITY-UNAVAILABLE", "authorityLifetime"); }
      held.consumed = true;
      const launched = await held.entry.launchModelFamilyInvocation({ binding: bound.value });
      heldFamilyReturns.set(familyNativeContext, { invocation: r, consent: checked.projection, nativeRequest, nativeResult: launched, observedAtMs: nowEpochMs });
      return { schema: AGY_SESSION_DISPATCH_SCHEMA, status: launched.ok ? "recovery-required" : "unavailable",
        code: launched.ok ? "AGY-SESSION-FAMILY-RETURN-CONTRACT-UNQUALIFIED" : launched.code,
        dispatchId: packet.dispatchId, candidate: packet.candidate, requested: { provider: "google", model: requestedModel, effort, role: packet.role },
        launcherCalls: Number.isSafeInteger(launched.value?.launcherCalls) ? launched.value.launcherCalls : 0,
        modelCalls: Number.isSafeInteger(launched.value?.modelCalls) ? launched.value.modelCalls : 0,
        observed: { provider: "unknown", model: "unknown", effectiveSandbox: "unknown" }, result: null, record: null,
        family: { invocationSha256: r.receiptSha256, consentRecordSha256: checked.projection.consentRecordSha256 } };
    }
    if (familyNativeContext !== undefined) return rejected("AGY-SESSION-FAMILY-CONTEXT-REQUIRED", "familyNativeContext");
    // No opaque native preparation: never fall through to unchecked invokeAgy.
    return rejected("AGY-SESSION-FAMILY-SHARED-LAUNCH-UNAVAILABLE", "sharedLaunch", {
      preparation: { status: "consent-bound", consent: checked.projection, invocationSha256: checked.invocation.receiptSha256 },
    });
  }
  if (modelRoleStore !== undefined) {
    const taskRoute = packet.role === "pipeline-core:goldfish-mechanic" ? "duty.mechanic" : "duty.implement";
    let registry;
    try { registry = readRegistry(); } catch { return rejected("AGY-SESSION-MODEL-ROLE-NOT-BOUND", "modelRoleStore"); }
    if (!validateRunnerProfilesV3Registry(registry).ok)
      return rejected("AGY-SESSION-MODEL-ROLE-NOT-BOUND", "modelRoleStore");
    // Both bounded implementation agent types have the same productive V3
    // base duty. The mechanic-specific functional role is optional and may
    // still be unavailable; it cannot revoke the admitted implement route.
    const cell = registry.duties?.implement?.antigravity;
    if (!cell || cell.state === "unavailable")
      return rejected("AGY-SESSION-MODEL-ROLE-NOT-BOUND", "modelRoleStore");
    const v3Match = cell.selector?.kind === "model-id"
      && cell.selector.value === requestedModel && cell.effort === effort;
    let bound;
    try { bound = bindStoredModelRoleDispatch({ taskRoute, runner: "antigravity",
      sessionId: session.id, requestedModel, store: modelRoleStore }); }
    catch { bound = null; }
    if ((!bound?.ok || bound.effort !== effort) && !v3Match)
      return rejected("AGY-SESSION-MODEL-ROLE-NOT-BOUND", "modelRoleStore");
  }
  if ((typeof scope !== "string" && (scope === null || typeof scope !== "object" || Array.isArray(scope))) || (typeof scope === "string" && scope.trim() === "") || !SHA256.test(inputSha256 ?? "")) return rejected(AGY_SESSION_DISPATCH_CODES.INPUT_MISMATCH, "inputSha256");
  const consentCheck = validateConsent(consent, { sessionId: session.id, model: requestedModel, role: packet.role, scope, nowEpochMs });
  if (!consentCheck.ok) return rejected(consentCheck.code, "consent");
  if (typeof verifyAuthority !== "function") return rejected(AGY_SESSION_DISPATCH_CODES.AUTHORITY_UNAVAILABLE, "authority");
  let authorityOk = false;
  try { authorityOk = verifyAuthority({ consent: structuredClone(consent), session: structuredClone(session), scope, requestedModel, role: packet.role }) === true; } catch { authorityOk = false; }
  if (!authorityOk) return rejected(AGY_SESSION_DISPATCH_CODES.AUTHORITY_UNAVAILABLE, "authority");
  if (packet.transport !== "antigravity") return rejected(AGY_SESSION_DISPATCH_CODES.PREFLIGHT_FAILED, "packet.transport");

  const prepared = preflightRoleDispatch({ root, resultRoot, packet });
  if (prepared.status !== "prepared") return rejected(AGY_SESSION_DISPATCH_CODES.PREFLIGHT_FAILED, prepared.field ?? "packet", { preflight: prepared });
  if (prepared.candidate.commit !== packet.candidate.commit || prepared.candidate.tree !== packet.candidate.tree) {
    return rejected(AGY_SESSION_DISPATCH_CODES.INPUT_MISMATCH, "packet.candidate");
  }
  const resultLocation = safeResultPath(resultRoot, resultPath);
  if (resultLocation === null) return rejected(AGY_SESSION_DISPATCH_CODES.RESULT_COLLISION, "resultPath");

  const executionPacket = requireStructuredFinal ? {
    ...prepared.packet,
    prompt: `${prepared.packet.prompt}\n- **Host-bound Final Return:** Emit the --json-schema object with schema pipeline.agy-final-return.v1, dispatchId ${packet.dispatchId}, candidateCommit ${prepared.candidate.commit}, outcome, report and changedPaths. This is a claim for host validation, not permission to commit.\n`,
  } : prepared.packet;
  // The legacy verifier callback is not a requester capability. Join the real
  // private channel and reserve before invoking the native process boundary.
  let authorityLifetime;
  try {
    const stored = loadStoredConsent(root, session.id, consent.descriptorSha256 ?? consent.subject?.session?.descriptorSha256);
    const checked = validateConsentRecord(stored.record, { root, repository: stored.descriptor.repo, session: { id: session.id, descriptorSha256: stored.descriptor.descriptorSha256 }, nowEpochMs });
    if (!checked.ok || stored.revoked || stored.record.decisionId !== consent.decisionId || stored.record.subjectSha256 !== consent.subjectSha256) return rejected("AGY-CONSENT-RECORD-CHANGED", "consent");
    authorityLifetime = beginDispatchLifetime({ root, sessionId: session.id, descriptorSha256: stored.descriptor.descriptorSha256, packet: prepared.packet, purpose: "legacy-dispatch" });
    advanceDispatchLifetime(authorityLifetime, "running");
  } catch (error) { return rejected(error.code ?? "AGY-SESSION-NATIVE-CARRIER-UNAVAILABLE", "authorityLifetime"); }
  const invoked = await invokeAgy({ root, resultRoot, packet: executionPacket, agyPath, model: requestedModel, effort, timeoutMs, env, signal, streamJson, jsonSchema: requireStructuredFinal ? AGY_FINAL_RETURN_JSON_SCHEMA : null });
  const validatedFinal = invoked.ok === true && requireStructuredFinal
    ? validateAgyFinalReturn(invoked.payload, { dispatchId: packet.dispatchId, candidateCommit: prepared.candidate.commit }) : null;
  const receipt = {
    schema: AGY_SESSION_DISPATCH_SCHEMA,
    // A valid child Final Return still needs a host commit and a v4 record.
    // Neither a CLI exit nor a schema-constrained answer alone is delivery.
    status: invoked.ok === true ? validatedFinal?.ok === true ? "final-pending-host-commit" : "completed-undelivered" : "unavailable",
    code: invoked.ok === true ? validatedFinal?.ok === true ? "AGY-SESSION-FINAL-VALIDATED" : "AGY-SESSION-FINAL-UNDELIVERED" : invoked.code,
    dispatchId: packet.dispatchId,
    candidate: prepared.candidate,
    session: { id: session.id, source: session.source },
    requested: { provider: "google", model: requestedModel, effort, role: packet.role, scope, inputSha256 },
    observed: { model: invoked.observedModel ?? null, provider: null, effectiveSandbox: "unknown" },
    consent: { decisionId: consent.decisionId, subjectSha256: consent.subjectSha256 },
    launcherCalls: invoked.launcherCalls ?? 0,
    modelCalls: invoked.modelCalls ?? 0,
    processStarted: invoked.processStarted === true,
    processClosed: invoked.processClosed === true,
    transportResultObserved: invoked.transportResultObserved === true,
    result: null,
    final: validatedFinal?.ok === true ? { outcome: validatedFinal.outcome, reportSha256: validatedFinal.reportSha256, changedPaths: validatedFinal.changedPaths } : null,
  };
  if (invoked.ok !== true) return receipt;
  if (requireObservedModel === true && (typeof invoked.observedModel !== "string" || invoked.observedModel === "unknown")) {
    return { ...receipt, status: "unavailable", code: "AGY-SESSION-MODEL-UNOBSERVED" };
  }
  const published = writeExclusiveResult(resultRoot, resultPath, { schema: "pipeline.agy-session-dispatch-result.v1", dispatchId: packet.dispatchId, candidate: prepared.candidate, sessionId: session.id, requestedModel, observedModel: invoked.observedModel ?? null, payload: invoked.payload });
  if (!published.ok) return { ...receipt, status: "rejected", code: published.code, launcherCalls: invoked.launcherCalls ?? 0, modelCalls: invoked.modelCalls ?? 0 };
  return { ...receipt, result: published };
}

export const agySessionDispatchInternals = Object.freeze({ digest, validateConsent, safeResultPath, writeExclusiveResult });
