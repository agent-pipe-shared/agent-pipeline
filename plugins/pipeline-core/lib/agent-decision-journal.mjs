// SPDX-License-Identifier: SUL-1.0
/** Closed PHX-4 agent assumptions/selection payload; observational only. */
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u, CODE=/^[A-Z][A-Z0-9._:-]{0,127}$/u, SHA=/^[a-f0-9]{64}$/u;
const KINDS=new Set(["assumption","selection","verification-scope","fallback","escalation"]), STATES=new Set(["declared","verified","contradicted","expired","invalidated","superseded"]);
/** A-AC-11: the epistemic ground a claim was held on, a separate axis from the claim lifecycle `state`; the two never collapse into one enum. */
const ASSUMPTION_STATES=new Set(["assumed","inferred","observed","verified","contradicted","unavailable","unknown"]);
/** A-AC-05: identity provenance/assurance, admissible only on the kinds where an identity choice is material to the decision being recorded (`selection`, `escalation`, `fallback`); `assumption`/`verification-scope` never carry it. */
const IDENTITY_DIMENSIONS=new Set(["runner","model","effort","profile","role","adapter","capability"]), IDENTITY_PROVENANCE=new Set(["same-dispatch-observed","requested-route","inherited-session","unknown"]), IDENTITY_ASSURANCE=new Set(["verified","reported","inferred","unknown"]), IDENTITY_KINDS=new Set(["selection","escalation","fallback"]);
const COMMAND_STATES=new Set(["offered","acknowledged","authorized","copied","attempted","execution-unobserved","observed-completed","readback-verified","failed","partial","cancelled","unknown","unavailable","readback-mismatch","recovery-proposed","recovered"]);
const COMMAND_ASSURANCE=new Set(["not-applicable","attempted","execution-unobserved","observed-completed","readback-verified","failed","partial","cancelled","unknown","unavailable","readback-mismatch"]);
const OMITTABLE=new Set(["raw-command","arguments","private-coordinates","unrestricted-output","prompt","transcript","credential"]);
export class AgentDecisionJournalError extends Error { constructor(code){super("Agent decision event is invalid.");this.code=code;} }
const rec=(v)=>v!==null&&typeof v==="object"&&!Array.isArray(v), exact=(v,k)=>rec(v)&&Object.keys(v).length===k.length&&k.every((x)=>Object.hasOwn(v,x)); const fail=(c)=>{throw new AgentDecisionJournalError(c);};
const validIdentity=(identity)=>Array.isArray(identity)&&identity.length>=1&&identity.length<=7&&identity.every((entry)=>exact(entry,["dimension","value","provenance","assurance"])&&IDENTITY_DIMENSIONS.has(entry.dimension)&&ID.test(entry.value)&&IDENTITY_PROVENANCE.has(entry.provenance)&&IDENTITY_ASSURANCE.has(entry.assurance))&&new Set(identity.map((entry)=>entry.dimension)).size===identity.length;
/**
 * Admits only bounded reason codes/digests; this record can never grant authority.
 * `assumptionState` is optional because A-AC-11 governs the case WHEN an
 * assumption state is recorded; when the key is present it fails closed against
 * ASSUMPTION_STATES, and it constrains no `state` value and is constrained by none.
 * `identity` is optional the same way, for A-AC-05: WHEN an identity dimension is
 * recorded it fails closed against IDENTITY_DIMENSIONS/IDENTITY_PROVENANCE/
 * IDENTITY_ASSURANCE, and its presence is itself scoped to IDENTITY_KINDS
 * (ADJ-IDENTITY-SCOPE) because only `selection`/`escalation`/`fallback` ever have
 * a material identity choice to record.
 */
export function validateAgentDecisionEvent(value) {
  const keys=["eventId","kind","state","reasonCode","candidateDigest","relatedHumanDecisionId","supersedesEventId"];
  if(value?.kind==="command-offer") return validateCommandOfferEvent(value);
  const epistemic=rec(value)&&Object.hasOwn(value,"assumptionState");
  const identified=rec(value)&&Object.hasOwn(value,"identity");
  const extended=[...keys,...(epistemic?["assumptionState"]:[]),...(identified?["identity"]:[])];
  if(!exact(value,extended)||!ID.test(value.eventId)||!KINDS.has(value.kind)||!STATES.has(value.state)||(epistemic&&!ASSUMPTION_STATES.has(value.assumptionState))||(identified&&!validIdentity(value.identity))||!CODE.test(value.reasonCode)||!SHA.test(value.candidateDigest)||(value.relatedHumanDecisionId!==null&&(!ID.test(value.relatedHumanDecisionId)))||(value.supersedesEventId!==null&&!ID.test(value.supersedesEventId)))fail("ADJ-SHAPE");
  if(value.state==="superseded"&&value.supersedesEventId===null)fail("ADJ-SUPERSESSION");
  if(identified&&!IDENTITY_KINDS.has(value.kind))fail("ADJ-IDENTITY-SCOPE");
  return Object.freeze({...value,...(identified?{identity:Object.freeze(value.identity.map((entry)=>Object.freeze({...entry})))}:{})});
}

/**
 * Closed, public-safe agent-journal event for a command or script offer.
 * No command text, argument, user identity, private path, or raw output is
 * admissible. The record is observational and can never grant authority.
 */
export function validateCommandOfferEvent(value) {
  const keys=["eventId","kind","state","reasonCode","candidateDigest","relatedHumanDecisionId","supersedesEventId","offerOrigin","operation","target","sideEffectClass","authorityRequirement","policyDigest","redactionPolicyDigest","executionAssurance","omissions","offerEventId","preEvidenceDigest","postEvidenceDigest","recoverability"];
  if(!exact(value,keys)||value.kind!=="command-offer"||!ID.test(value.eventId)||!COMMAND_STATES.has(value.state)||!CODE.test(value.reasonCode)||!SHA.test(value.candidateDigest)||(value.relatedHumanDecisionId!==null&&!ID.test(value.relatedHumanDecisionId))||(value.supersedesEventId!==null&&!ID.test(value.supersedesEventId))||!["pipeline-initiated","user-requested-pipeline-supplied"].includes(value.offerOrigin)||!exact(value.operation,["operationClass","version","governedArtifactSha256"])||!ID.test(value.operation.operationClass)||(value.operation.version!==null&&!ID.test(value.operation.version))||(value.operation.governedArtifactSha256!==null&&!SHA.test(value.operation.governedArtifactSha256))||!exact(value.target,["repositoryFingerprint","scopeDigest"])||!SHA.test(value.target.repositoryFingerprint)||!SHA.test(value.target.scopeDigest)||!["non-authoritative","destructive","guard-bypass","authority-changing"].includes(value.sideEffectClass)||!["not-required","human-decision-required"].includes(value.authorityRequirement)||!SHA.test(value.policyDigest)||!SHA.test(value.redactionPolicyDigest)||!COMMAND_ASSURANCE.has(value.executionAssurance)||!Array.isArray(value.omissions)||value.omissions.length<4||value.omissions.length>7||new Set(value.omissions).size!==value.omissions.length||value.omissions.some((entry)=>!OMITTABLE.has(entry))||!["raw-command","arguments","private-coordinates","unrestricted-output"].every((entry)=>value.omissions.includes(entry))||(value.offerEventId!==null&&!ID.test(value.offerEventId))||(value.preEvidenceDigest!==null&&!SHA.test(value.preEvidenceDigest))||(value.postEvidenceDigest!==null&&!SHA.test(value.postEvidenceDigest))||!["not-applicable","recoverable","cleanup-required","rollback-required"].includes(value.recoverability))fail("ADJ-COMMAND-OFFER");
  if(value.authorityRequirement==="human-decision-required"&&value.relatedHumanDecisionId===null)fail("ADJ-COMMAND-AUTHORITY");
  if(value.state==="offered"&&(value.offerEventId!==null||value.executionAssurance!=="not-applicable"||value.preEvidenceDigest!==null||value.postEvidenceDigest!==null))fail("ADJ-COMMAND-OFFER");
  if(value.state!=="offered"&&value.offerEventId===null)fail("ADJ-COMMAND-LINK");
  if(value.state==="attempted"&&value.executionAssurance!=="attempted")fail("ADJ-COMMAND-OUTCOME");
  if(value.state==="execution-unobserved"&&value.executionAssurance!=="execution-unobserved")fail("ADJ-COMMAND-OUTCOME");
  if(["observed-completed","readback-verified","failed","partial","cancelled","unknown","unavailable","readback-mismatch"].includes(value.state)&&value.executionAssurance!==value.state)fail("ADJ-COMMAND-OUTCOME");
  return Object.freeze({...value,operation:Object.freeze({...value.operation}),target:Object.freeze({...value.target}),omissions:Object.freeze([...value.omissions])});
}
