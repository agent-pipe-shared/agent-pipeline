// SPDX-License-Identifier: SUL-1.0
/**
 * Closed, immutable Critic review lineage for Nova A5.
 *
 * This module is deliberately runner- and storage-neutral. It compiles the
 * exact request/coverage/course record, validates one record or a synthetic
 * history, and admits only a pending, course-admitted record against the
 * prepared Critic packet. It never launches a Critic or upgrades retained
 * evidence into a verdict.
 */
import {
  REVIEW_LIMITS,
  admitReviewAttempt,
  canonicalJson,
  sha256Canonical,
} from "./review-economy.mjs";
import {readCriticCourseAdmission,resolveRegisteredCriticCourseIdentity} from './critic-course-admission.mjs';
import {readConsumedCriticCourseResult,readConsumedCourseClaimBinding,projectConsumedCriticFindings} from './critic-verify-lifecycle.mjs';
import {execFileSync} from 'node:child_process';
import {readConsumedCandidateResult} from '../scripts/critic-packet-preflight.mjs';
import {readAcceptedCriticCriterion} from './critic-accepted-contract.mjs';
import {
  CRITIC_REVIEW_LINEAGE_SCHEMA,
  RELEASE_CRITIC_REVIEW_SCOPE_SCHEMA,
  OID,
  INVALIDATION_REASONS,
  REVIEW_ATTEMPT_KEYS,
  object,
  exact,
  digest,
  identifier,
  safePath,
  sortedUnique,
  same,
  recordCore,
  candidateCode,
  orderedRows,
  packetCode,
  packageCode,
  coverageCode,
  invalidationCode,
  compiledRequest,
  transitionCode,
  validateCriticReviewLineage,
} from "./critic-review-lineage-core.mjs";

// The validators live in critic-review-lineage-core.mjs (pure import graph);
// they are re-exported here unchanged so every existing importer keeps this path.
export {
  CRITIC_REVIEW_LINEAGE_SCHEMA,
  RELEASE_CRITIC_REVIEW_SCOPE_SCHEMA,
  CRITIC_REVIEW_FAILURES,
  CRITIC_FINDING_SEVERITIES,
  CRITIC_FINDING_DISPOSITIONS,
  CRITIC_INVALIDATION_REASONS,
  criticReviewLineageDigest,
  validateCriticReviewLineage,
  validateCriticReviewHistory,
} from "./critic-review-lineage-core.mjs";

function reviewAttemptCode(attempt) {
  if (!object(attempt)
    || Object.keys(attempt).some((key) => !REVIEW_ATTEMPT_KEYS.has(key))
    || !Object.hasOwn(attempt, "round")
    || !Object.hasOwn(attempt, "correctionCommits")
    || !Object.hasOwn(attempt, "requestedMode")
    || !Number.isSafeInteger(attempt.round)
    || attempt.round < 1
    || !Number.isSafeInteger(attempt.correctionCommits)
    || attempt.correctionCommits < 0
    || !["full", "delta"].includes(attempt.requestedMode)) {
    return "CRL-REVIEW-ATTEMPT";
  }
  return null;
}

function expectedInvalidation(parent, attempt, admission) {
  if (parent === null || admission.courseGateRequired === true || admission.mode === "delta") {
    return { kind: "none", reason: null };
  }
  if (attempt.correctionCommits === parent.course.correctionCommitCount
    && parent.verdict.status === "failed") {
    return { kind: "full-review-required", reason: "prior-review-failure" };
  }
  if (attempt.requestedMode !== "delta") {
    return { kind: "full-review-required", reason: "explicit-broad-review" };
  }
  if (attempt.trustBoundaryChanged === true) {
    return { kind: "full-review-required", reason: "trust-boundary-change" };
  }
  if (attempt.impactAmbiguous === true) {
    return { kind: "full-review-required", reason: "impact-ambiguous" };
  }
  if (admission.code === "RE-DELTA-FALLBACK-UNKNOWN-PATH") {
    return { kind: "full-review-required", reason: "unknown-changed-path" };
  }
  return { kind: "full-review-required", reason: "delta-bindings-invalid" };
}

function releaseFindingCode(findings, changedPaths, directConsequencePaths, integrationEdges) {
  if (!orderedRows(
    findings,
    (finding) => exact(finding, ["id", "path", "basis", "evidenceSha256"])
      && identifier(finding.id)
      && safePath(finding.path)
      && ["changed-line", "direct-consequence"].includes(finding.basis)
      && digest(finding.evidenceSha256),
    (finding) => finding.id,
    { allowEmpty: true },
  )) return "CRL-RELEASE-FINDINGS-SHAPE";
  for (const finding of findings) {
    if (finding.basis === "changed-line" && !changedPaths.includes(finding.path)) {
      return "CRL-RELEASE-FINDING-OUTSIDE-DELTA";
    }
    if (finding.basis === "direct-consequence"
      && (!directConsequencePaths.includes(finding.path) || integrationEdges.length === 0)) {
      return "CRL-RELEASE-FINDING-NOT-DIRECT-CONSEQUENCE";
    }
  }
  return null;
}

const RELEASE_SCOPE_KEYS = [
  "schema", "mode", "parentReviewId", "previousReviewedCandidate", "previousFindingIds",
  "reviewedRange", "deltaSha256", "changedPaths", "impactClosure", "impactClosureSha256",
  "findings", "invalidation", "nextLineageParent", "scopeSha256",
];

function releaseScopeCode(scope) {
  if (!exact(scope, RELEASE_SCOPE_KEYS)
    || scope.schema !== RELEASE_CRITIC_REVIEW_SCOPE_SCHEMA
    || !["broad-first", "correction", "broad-correction"].includes(scope.mode)
    || !(scope.parentReviewId === null || identifier(scope.parentReviewId))
    || !(scope.previousReviewedCandidate === null || candidateCode(scope.previousReviewedCandidate) === null)
    || !sortedUnique(scope.previousFindingIds, identifier, { allowEmpty: true })
    || !exact(scope.reviewedRange, ["base", "head", "tree"])
    || ![scope.reviewedRange.base, scope.reviewedRange.head, scope.reviewedRange.tree].every((value) => OID.test(value))
    || !digest(scope.deltaSha256)
    || !sortedUnique(scope.changedPaths, safePath)
    || !exact(scope.impactClosure, ["changedPaths", "directConsequencePaths", "integrationEdges"])
    || !sortedUnique(scope.impactClosure.changedPaths, safePath)
    || !sortedUnique(scope.impactClosure.directConsequencePaths, safePath, { allowEmpty: true })
    || !sortedUnique(scope.impactClosure.integrationEdges, identifier, { allowEmpty: true })
    || !same(scope.changedPaths, scope.impactClosure.changedPaths)
    || scope.impactClosureSha256 !== sha256Canonical(scope.impactClosure.integrationEdges)
    || releaseFindingCode(scope.findings, scope.changedPaths,
      scope.impactClosure.directConsequencePaths, scope.impactClosure.integrationEdges)
    || invalidationCode(scope.invalidation)
    || candidateCode(scope.nextLineageParent)
    || !same(scope.nextLineageParent, {
      commit: scope.reviewedRange.head,
      tree: scope.reviewedRange.tree,
    })
    || !digest(scope.scopeSha256)
    || scope.scopeSha256 !== sha256Canonical(Object.fromEntries(
      Object.entries(scope).filter(([key]) => key !== "scopeSha256"),
    ))) return "CRL-RELEASE-SCOPE-SHAPE";
  const first = scope.mode === "broad-first";
  if (first
    ? !(scope.parentReviewId === null
      && scope.previousReviewedCandidate === null
      && scope.previousFindingIds.length === 0)
    : scope.parentReviewId === null || scope.previousReviewedCandidate === null) {
    return "CRL-RELEASE-SCOPE-PARENT";
  }
  if (first && scope.invalidation.kind !== "none") return "CRL-RELEASE-FIRST-BROAD";
  if (scope.mode === "correction" && (scope.invalidation.kind !== "none"
    || scope.reviewedRange.base !== scope.previousReviewedCandidate.commit)) {
    return "CRL-RELEASE-CORRECTION-RANGE";
  }
  if (scope.mode === "broad-correction" && scope.invalidation.kind !== "full-review-required") {
    return "CRL-RELEASE-BROAD-INVALIDATION";
  }
  return null;
}

/**
 * Compile the release-only review scope that sits beside the generic lineage.
 * The first review is broad. A normal correction is exactly the immutable
 * reviewed candidate..corrected candidate range plus deterministic impact
 * closure. Broader corrections require typed invalidation and establish the
 * corrected candidate as the next immutable parent.
 */
export function compileReleaseCriticReviewScope(input) {
  if (!exact(input, ["parent", "packet", "mode", "impactClosure", "findings", "invalidation"])
    || packetCode(input.packet)
    || !["broad-first", "correction", "broad-correction"].includes(input.mode)
    || !exact(input.impactClosure, ["changedPaths", "directConsequencePaths", "integrationEdges"])
    || !sortedUnique(input.impactClosure.changedPaths, safePath)
    || !sortedUnique(input.impactClosure.directConsequencePaths, safePath, { allowEmpty: true })
    || !sortedUnique(input.impactClosure.integrationEdges, identifier, { allowEmpty: true })
    || !same(input.impactClosure.changedPaths, input.packet.diffPaths)
    || invalidationCode(input.invalidation)) {
    throw new TypeError("CRL-RELEASE-SCOPE-SHAPE");
  }
  const parent = input.parent;
  if (input.mode === "broad-first") {
    if (parent !== null || input.invalidation.kind !== "none") {
      throw new TypeError("CRL-RELEASE-FIRST-BROAD");
    }
  } else {
    if (parent === null || !validateCriticReviewLineage(parent).ok) {
      throw new TypeError("CRL-RELEASE-PARENT");
    }
    if (input.mode === "correction") {
      if (input.packet.candidate.base !== parent.candidate.commit
        || input.invalidation.kind !== "none") {
        throw new TypeError("CRL-RELEASE-CORRECTION-RANGE");
      }
    } else if (input.invalidation.kind !== "full-review-required"
      || !INVALIDATION_REASONS.has(input.invalidation.reason)
      || !digest(input.invalidation.evidenceSha256)) {
      throw new TypeError("CRL-RELEASE-BROAD-INVALIDATION");
    }
  }
  const findingInvalid = releaseFindingCode(
    input.findings,
    input.impactClosure.changedPaths,
    input.impactClosure.directConsequencePaths,
    input.impactClosure.integrationEdges,
  );
  if (findingInvalid) throw new TypeError(findingInvalid);
  const core = {
    schema: RELEASE_CRITIC_REVIEW_SCOPE_SCHEMA,
    mode: input.mode,
    parentReviewId: parent?.reviewId ?? null,
    previousReviewedCandidate: parent?.candidate ?? null,
    previousFindingIds: parent?.findings.map(({ id }) => id).sort() ?? [],
    reviewedRange: {
      base: input.mode === "correction" ? parent.candidate.commit : input.packet.candidate.base,
      head: input.packet.candidate.commit,
      tree: input.packet.candidate.tree,
    },
    deltaSha256: input.packet.diff.sha256,
    changedPaths: [...input.packet.diffPaths],
    impactClosure: structuredClone(input.impactClosure),
    impactClosureSha256: sha256Canonical(input.impactClosure.integrationEdges),
    findings: structuredClone(input.findings),
    invalidation: structuredClone(input.invalidation),
    nextLineageParent: {
      commit: input.packet.candidate.commit,
      tree: input.packet.candidate.tree,
    },
  };
  const scope = {
    ...core,
    scopeSha256: sha256Canonical(core),
  };
  const invalid = releaseScopeCode(scope);
  if (invalid) throw new TypeError(invalid);
  return Object.freeze(scope);
}

/** Bind one compiled generic lineage record to its release-only scope. */
export function validateReleaseCriticScopeAdmission(lineage, packet, scope) {
  const lineageValid = validateCriticReviewLineage(lineage);
  if (!lineageValid.ok) return lineageValid;
  const scopeInvalid = releaseScopeCode(scope);
  if (scopeInvalid) return { ok: false, code: scopeInvalid };
  if (packetCode(packet)
    || !same(lineage.candidate, { commit: packet.candidate.commit, tree: packet.candidate.tree })
    || lineage.parentReviewId !== scope.parentReviewId
    || lineage.diff.base !== scope.reviewedRange.base
    || lineage.diff.sha256 !== scope.deltaSha256
    || !same(lineage.diff.changedPaths, scope.changedPaths)
    || !same(scope.nextLineageParent, lineage.candidate)
    || !same(lineage.invalidation, scope.invalidation)) {
    return { ok: false, code: "CRL-RELEASE-SCOPE-BINDING" };
  }
  const expectedMode = scope.mode === "correction" ? "delta" : "full";
  if (lineage.request.mode !== expectedMode) return { ok: false, code: "CRL-RELEASE-MODE" };
  if (lineage.correction !== null
    && lineage.correction.impactSha256 !== scope.impactClosureSha256) {
    return { ok: false, code: "CRL-RELEASE-IMPACT-CLOSURE" };
  }
  const parentIds = new Set(scope.previousFindingIds);
  const scopedIds = new Set(scope.findings.map(({ id }) => id));
  const introducedIds = lineage.findings
    .filter(({ priorFindingId }) => priorFindingId === null)
    .map(({ id }) => id)
    .filter((id) => !parentIds.has(id));
  if (introducedIds.some((id) => !scopedIds.has(id))
    || [...scopedIds].some((id) => !introducedIds.includes(id))) {
    return { ok: false, code: "CRL-RELEASE-FINDING-SCOPE" };
  }
  return { ok: true, code: null, scopeSha256: scope.scopeSha256 };
}


/** Compiles a closed record from a prepared packet and one typed review stage. */
export function compileCriticReviewLineage(input) {
  const keys = ["packet", "reviewId", "parent", "packages", "coverage", "lane", "verdict", "findings", "correction", "invalidation", "reviewAttempt"];
  if (!exact(input, keys) || packetCode(input.packet) || reviewAttemptCode(input.reviewAttempt)) {
    throw new TypeError("CRL-COMPILE-SHAPE");
  }
  const parent = input.parent;
  if (!(parent === null || validateCriticReviewLineage(parent).ok)) throw new TypeError("CRL-PARENT");
  const admission = admitReviewAttempt(input.reviewAttempt);
  const courseGate = admission.courseGateRequired === true;
  // Refused ordinary/delta attempts cannot be compiled into admitted new records.
  // Existing historical validators and immutable records are left unchanged.
  if (!admission.ok && !courseGate) throw new TypeError("CRL-REVIEW-REFUSED");
  const expected = expectedInvalidation(parent, input.reviewAttempt, admission);
  if (!exact(input.invalidation, ["kind", "reason", "evidenceSha256"])
    || input.invalidation.kind !== expected.kind
    || input.invalidation.reason !== expected.reason) {
    throw new TypeError("CRL-INVALIDATION");
  }
  if (expected.kind === "none"
    ? input.invalidation.evidenceSha256 !== null
    : !digest(input.invalidation.evidenceSha256)) {
    throw new TypeError("CRL-INVALIDATION");
  }
  if (parent !== null && !courseGate && input.reviewAttempt.correctionCommits > parent.course.correctionCommitCount
    && input.correction === null) {
    throw new TypeError("CRL-CORRECTION");
  }
  const mode = courseGate ? "none" : admission.mode;
  const admissionCode = courseGate ? "RE-PO-COURSE-GATE" : admission.code;
  const record = {
    schema: CRITIC_REVIEW_LINEAGE_SCHEMA,
    reviewId: input.reviewId,
    parentReviewId: parent?.reviewId ?? null,
    candidate: {
      commit: input.packet.candidate.commit,
      tree: input.packet.candidate.tree,
    },
    diff: {
      base: input.packet.candidate.base,
      sha256: input.packet.diff.sha256,
      changedPaths: [...input.packet.diffPaths],
    },
    references: {
      packetSha256: sha256Canonical(input.packet),
      requestSha256: input.packet.bindings.requestSha256,
      diffPathsSha256: input.packet.bindings.diffPathsSha256,
      governanceSha256: input.packet.bindings.governanceSha256,
    },
    packages: structuredClone(input.packages),
    coverage: structuredClone(input.coverage),
    request: {
      packetId: input.packet.packetId,
      requestSha256: input.packet.bindings.requestSha256,
      compiledSha256: "0".repeat(64),
      mode,
      admissionCode,
    },
    lane: {
      laneId: input.lane.laneId,
      contextSha256: input.lane.contextSha256,
      independent: true,
      evidenceSha256: input.lane.evidenceSha256,
      freshFromReviewId: parent?.reviewId ?? null,
    },
    verdict: structuredClone(input.verdict),
    findings: structuredClone(input.findings),
    correction: courseGate || input.correction === null ? null : structuredClone(input.correction),
    invalidation: structuredClone(input.invalidation),
    course: {
      reviewRound: input.reviewAttempt.round,
      correctionCommitCount: input.reviewAttempt.correctionCommits,
      maxReviewRounds: REVIEW_LIMITS.criticRounds,
      maxCorrectionCommits: REVIEW_LIMITS.correctionCommits,
      status: courseGate ? "po-course-gate" : "admitted",
    },
    previousSha256: parent?.recordSha256 ?? null,
    recordSha256: "0".repeat(64),
  };
  record.request.compiledSha256 = sha256Canonical(compiledRequest(record));
  record.recordSha256 = sha256Canonical(recordCore(record));
  const checked = validateCriticReviewLineage(record);
  if (!checked.ok) throw new TypeError(checked.code);
  if (parent !== null) {
    const transitionInvalid = transitionCode(parent, record);
    if (transitionInvalid) throw new TypeError(transitionInvalid);
  }
  return Object.freeze(record);
}

/** Revalidate the exact closed pre-launch binding against the live packet. */
export function validateCriticLineagePacketAdmission(lineage, packet) {
  const valid = validateCriticReviewLineage(lineage);
  if (!valid.ok) return valid;
  const packetInvalid = packetCode(packet);
  if (packetInvalid) return { ok: false, code: packetInvalid };
  if (lineage.verdict.status !== "pending"
    || lineage.coverage.complete !== false
    || lineage.coverage.receiptSha256 !== null
    || lineage.course.status !== "admitted"
    || !["full", "delta"].includes(lineage.request.mode)) {
    return { ok: false, code: "CRL-NOT-ADMISSIBLE" };
  }
  if (!same(lineage.candidate, { commit: packet.candidate.commit, tree: packet.candidate.tree })
    || lineage.diff.base !== packet.candidate.base
    || lineage.diff.sha256 !== packet.diff.sha256
    || !same(lineage.diff.changedPaths, packet.diffPaths)
    || lineage.references.packetSha256 !== sha256Canonical(packet)
    || lineage.references.requestSha256 !== packet.bindings.requestSha256
    || lineage.references.diffPathsSha256 !== packet.bindings.diffPathsSha256
    || lineage.references.governanceSha256 !== packet.bindings.governanceSha256
    || lineage.request.packetId !== packet.packetId
    || lineage.request.requestSha256 !== packet.bindings.requestSha256
    || lineage.request.compiledSha256 !== sha256Canonical(compiledRequest(lineage))
    || !same(lineage.coverage.changedPaths, packet.diffPaths)) {
    return { ok: false, code: "CRL-PACKET-BINDING" };
  }
  return { ok: true, code: null, lineageSha256: lineage.recordSha256 };
}
function bindingArtifact(record,featureId){const bytes=Buffer.from(canonicalJson(record)),sha256=sha256Canonical(record),path=`specs/${featureId}/evidence/critic-lineage-${sha256}.json`;return {path,sha256,bytes,registration:{class:'candidate-evidence',path,sha256,authority:false,mutability:'immutable',retention:'retain'}};}
function unchangedCarry(root,parent,packet){
 for(const path of parent.diff.changedPaths){if(packet.diffPaths.includes(path))continue;
  const read=commit=>execFileSync('git',['-C',root,'ls-tree','-z',commit,'--',path],{encoding:'buffer',stdio:['ignore','pipe','ignore'],maxBuffer:1024*1024});
  if(!read(parent.candidate.commit).equals(read(packet.candidate.commit)))throw Error('CRL-V2-CARRY-DRIFT');}
}
/** Terminal runtime compiler: consumed owner readback is mandatory, not caller lane/verdict. */
export function compileRegisteredCriticReviewLineage(input){try{
 if(!exact(input,['courseRequest','packetId','reviewId','parentReviewId','packages','coverage','correction','invalidation']))throw Error('CRL-V2-COMPILE-SHAPE');
 const admission=readCriticCourseAdmission(input.courseRequest);if(admission.decision?.status!=='admitted')throw Error(admission.decision?.code??'CRL-V2-COURSE');
 const resolved=resolveRegisteredCriticCourseIdentity(Object.fromEntries(['repoRoot','featureId','baseCommit','candidateCommit','registrationCommit','acceptedReference'].map(k=>[k,input.courseRequest[k]])));if(!resolved.ok)throw Error(resolved.code);
 const parent=resolved.value.registeredHistory.at(-1)?.record??null;if((parent?.reviewId??null)!==input.parentReviewId)throw Error('CRL-V2-PARENT');
 const observedPacket=readConsumedCandidateResult({controlRoot:resolved.value.resolvedRepository.controlRoot,packetId:input.packetId}).packet;
 const actual=readConsumedCriticCourseResult({resolvedRepository:resolved.value.resolvedRepository,packetId:input.packetId,expectedCandidate:{commit:admission.source.candidate.commit,tree:admission.source.candidate.tree},expectedRange:{base:admission.source.candidate.base,commit:admission.source.candidate.commit,diffSha256:observedPacket.diff.sha256},expectedRecord:null});
 if(!actual.ok)return actual;const {packet,receipt,result}=actual.value;
 if(packetCode(packet))throw Error('CRL-V2-PACKET');
 const {decision,...sourceSubject}=admission,courseSourceSha256=sha256Canonical(sourceSubject),courseDecisionSha256=sha256Canonical(decision);
 const observedClaim=readConsumedCourseClaimBinding({resolvedRepository:resolved.value.resolvedRepository,packetId:input.packetId,expectedCandidate:{commit:packet.candidate.commit,tree:packet.candidate.tree}});
 if(!observedClaim.ok)return observedClaim;const claim=observedClaim.value;
 if(claim.courseSourceSha256!==courseSourceSha256||claim.courseDecisionSha256!==courseDecisionSha256)throw Error('CRL-V2-CLAIM-DRIFT');
 if(coverageCode(input.coverage)||!input.coverage.complete||input.coverage.receiptSha256!==actual.value.receiptSha256||!same(input.coverage.changedPaths,packet.diffPaths)||packageCode(input.packages,input.coverage))throw Error('CRL-V2-COVERAGE');
 if(parent){unchangedCarry(input.courseRequest.repoRoot,parent,packet);if(!same(input.coverage.acceptanceIds,parent.coverage.acceptanceIds)||!same(input.coverage.integrationEdges,parent.coverage.integrationEdges))throw Error('CRL-V2-CARRY-COVERAGE');}
 const projected=projectConsumedCriticFindings({packetId:packet.packetId,findings:result.verdict.findings});
 const carried=(parent?.findings??[]).map(f=>f.status==='open'?{...f,priorFindingId:f.id,status:receipt.reviewPass?'fixed':'open'}:structuredClone(f));
 const findings=[...carried,...projected].sort((a,b)=>a.id.localeCompare(b.id));if(new Set(findings.map(f=>f.id)).size!==findings.length)throw Error('CRL-V2-FINDING-ID');
 const i=admission.courseIdentity,b=admission.budgets;
 let criterionSha256=null;
 if(admission.acceptance!==null){const observed=readAcceptedCriticCriterion({repoRoot:input.courseRequest.repoRoot,featureId:i.originalFeatureId,envelopePath:input.courseRequest.acceptedReference.path,criterionLocator:input.courseRequest.criterionLocator});if(!observed.ok)return observed;criterionSha256=sha256Canonical({acceptance:observed.acceptance,criterion:observed.criterion,source:observed.source,locator:observed.locator});}
 const record={schema:'pipeline.critic-review-lineage.v2',reviewId:input.reviewId,parentReviewId:parent?.reviewId??null,candidate:{commit:packet.candidate.commit,tree:packet.candidate.tree},diff:{base:packet.candidate.base,sha256:packet.diff.sha256,changedPaths:[...packet.diffPaths]},references:{packetSha256:sha256Canonical(packet),requestSha256:packet.bindings.requestSha256,diffPathsSha256:packet.bindings.diffPathsSha256,governanceSha256:packet.bindings.governanceSha256},packages:structuredClone(input.packages),coverage:structuredClone(input.coverage),request:{packetId:packet.packetId,requestSha256:packet.bindings.requestSha256,compiledSha256:'0'.repeat(64),mode:decision.mode,admissionCode:decision.code},lane:{laneId:result.session.id,contextSha256:sha256Canonical(result.session),independent:true,evidenceSha256:actual.value.receiptSha256,freshFromReviewId:parent?.reviewId??null},verdict:{status:receipt.reviewPass?'no-findings':'findings',schemaValid:true,resultSha256:actual.value.resultSha256,failure:null},findings,correction:structuredClone(input.correction),invalidation:structuredClone(input.invalidation),course:{reviewRound:b.reviewRound,correctionCommitCount:b.correctionCommitCount,maxReviewRounds:4,maxCorrectionCommits:3,status:'admitted'},previousSha256:parent?.recordSha256??null,recordSha256:'0'.repeat(64),courseBinding:{courseKey:i.courseKey,originalFeatureId:i.originalFeatureId,originalManifestSha256:i.originalManifestSha256,genesisCandidate:i.genesisCandidate,submissionSha256:i.submissionSha256,envelopeSha256:i.envelopeSha256,criterionSha256:admission.acceptance?sha256Canonical(admission.acceptance):null,deltaRequestSha256:admission.deltaRequestSha256,deterministicEvidenceSha256:admission.deterministicEvidenceSha256,courseSourceSha256,courseDecisionSha256},consumedResult:{packetId:packet.packetId,packetDigest:sha256Canonical(packet),receiptSha256:actual.value.receiptSha256,resultSha256:actual.value.resultSha256,verdictSha256:sha256Canonical(result.verdict),findingBindings:projected.map((f,index)=>({findingId:f.id,index,sha256:f.evidenceSha256}))}};
 // Owner packet/verdict digests use that owner's pretty JSON+LF encoding;
 // artifact/result/lineage digests keep the established compact canonical form.
 record.consumedResult.packetDigest=receipt.packetDigest;
 record.courseBinding.criterionSha256=criterionSha256;
 record.consumedResult.verdictSha256=receipt.verdictSha256;
 record.request.compiledSha256=sha256Canonical(compiledRequest(record));record.recordSha256=sha256Canonical(recordCore(record));const checked=validateCriticReviewLineage(record);if(!checked.ok)throw Error(checked.code);if(parent){const invalid=transitionCode(parent,record);if(invalid)throw Error(invalid);}
 return {ok:true,value:{record:Object.freeze(record),artifact:bindingArtifact(record,i.originalFeatureId)}};
 }catch(error){return {ok:false,status:'refused',code:error.code??error.message??'CRL-V2-COMPILE'};}}
