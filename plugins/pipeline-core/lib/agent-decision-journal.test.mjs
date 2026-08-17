// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict"; import test from "node:test"; import { AgentDecisionJournalError, EVENT_CLASSES, JOURNALING_UNAVAILABLE_DISPOSITIONS, journalingUnavailableDisposition, representedEventClasses, resolveJournalingUnavailability, validateAgentDecisionEvent, validateCommandOfferEvent, validateLegacyImportObservationEvent } from "./agent-decision-journal.mjs";
const value=(overrides={})=>({eventId:"agent-1",kind:"assumption",state:"declared",reasonCode:"EVIDENCE_UNAVAILABLE",candidateDigest:"a".repeat(64),relatedHumanDecisionId:null,supersedesEventId:null,...overrides});
test("accepts a bounded observational agent assumption",()=>assert.equal(Object.isFrozen(validateAgentDecisionEvent(value())),true));
test("rejects free text, authority-shaped fields, and unbound supersession",()=>{for(const entry of [{...value(),reasonCode:"reason text"},{...value(),approval:true},value({state:"superseded"})])assert.throws(()=>validateAgentDecisionEvent(entry),(error)=>error instanceof AgentDecisionJournalError);});
const offer=(overrides={})=>({eventId:"offer-1",kind:"command-offer",state:"offered",reasonCode:"EXTERNAL_OPERATION_OFFERED",candidateDigest:"a".repeat(64),relatedHumanDecisionId:null,supersedesEventId:null,offerOrigin:"pipeline-initiated",operation:{operationClass:"governed-repair",version:"v1",governedArtifactSha256:"b".repeat(64)},target:{repositoryFingerprint:"c".repeat(64),scopeDigest:"d".repeat(64)},sideEffectClass:"non-authoritative",authorityRequirement:"not-required",policyDigest:"e".repeat(64),redactionPolicyDigest:"f".repeat(64),executionAssurance:"not-applicable",omissions:["raw-command","arguments","private-coordinates","unrestricted-output"],offerEventId:null,preEvidenceDigest:null,postEvidenceDigest:null,recoverability:"not-applicable",...overrides});
test("accepts a closed command-offer journal event while preserving raw command omissions",()=>assert.equal(validateCommandOfferEvent(offer()).kind,"command-offer"));
test("rejects command text, omitted privacy omissions, and authority-required offers without a decision",()=>{for(const entry of [{...offer(),command:"rm -rf"},{...offer(),omissions:["raw-command"]},offer({sideEffectClass:"guard-bypass",authorityRequirement:"human-decision-required"})])assert.throws(()=>validateAgentDecisionEvent(entry),(error)=>error instanceof AgentDecisionJournalError);});

// A-AC-07: representedEventClasses recognizes all seven named classes
// through fields/kinds this module already had -- no new `kind` was added
// to KINDS to close this criterion (see the function's own doc comment for
// the full per-class mapping decision).
test("A-AC-07 recognizes every named event class through an existing field or kind, never a new kind",()=>{
  assert.deepEqual([...EVENT_CLASSES].sort(),["authority","candidate","external-side-effect","privacy","recovery","security","verification-scope"]);
  const plain=validateAgentDecisionEvent(value());
  assert.deepEqual([...representedEventClasses(plain)].sort(),["candidate","privacy"]);
  const authored=validateAgentDecisionEvent(value({relatedHumanDecisionId:"human-1"}));
  assert.equal(representedEventClasses(authored).has("authority"),true);
  const scoped=validateAgentDecisionEvent(value({kind:"verification-scope"}));
  assert.equal(representedEventClasses(scoped).has("verification-scope"),true);
  const plainOffer=validateCommandOfferEvent(offer());
  const plainClasses=representedEventClasses(plainOffer);
  assert.equal(plainClasses.has("external-side-effect"),true);
  assert.equal(plainClasses.has("security"),false);
  assert.equal(plainClasses.has("recovery"),false);
  const securityOffer=validateCommandOfferEvent(offer({sideEffectClass:"guard-bypass",authorityRequirement:"human-decision-required",relatedHumanDecisionId:"human-1"}));
  const securityClasses=representedEventClasses(securityOffer);
  assert.equal(securityClasses.has("security"),true);
  assert.equal(securityClasses.has("authority"),true);
  const recoveryOffer=validateCommandOfferEvent(offer({recoverability:"rollback-required"}));
  assert.equal(representedEventClasses(recoveryOffer).has("recovery"),true);
});

// A-AC-10: the journaling-unavailable policy is an explicit, closed, total
// table over EVENT_CLASSES -- never an implicit default and never a
// prototype-chain lookup that could answer for a class nobody declared.
test("A-AC-10 declares an explicit fail-open/fail-closed disposition for every event class, with no implicit default",()=>{
  assert.deepEqual(Object.keys(JOURNALING_UNAVAILABLE_DISPOSITIONS).sort(),[...EVENT_CLASSES].sort());
  assert.equal(Object.isFrozen(JOURNALING_UNAVAILABLE_DISPOSITIONS),true);
  for(const entry of EVENT_CLASSES)assert.equal(["fail-open","fail-closed"].includes(journalingUnavailableDisposition(entry)),true);
  assert.deepEqual([...EVENT_CLASSES].filter((entry)=>journalingUnavailableDisposition(entry)==="fail-closed").sort(),["authority","recovery","security","verification-scope"]);
  for(const undeclared of ["","routine","material","toString","constructor",undefined,null])assert.throws(()=>journalingUnavailableDisposition(undeclared),(error)=>error instanceof AgentDecisionJournalError&&error.code==="ADJ-JOURNALING-POLICY-UNDECLARED");
});

// A-AC-10's second half: the gap is exposed as a typed record in BOTH
// directions, naming which classes decided the disposition -- not just an
// opaque proceed/refuse -- and it can never be mistaken for a journal receipt.
test("A-AC-10 exposes the journaling gap as a typed record naming which policy fired",()=>{
  const open=resolveJournalingUnavailability(offer());
  assert.equal(open.schema,"pipeline.agent-journaling-gap.v1");
  assert.equal(open.gap,"agent-journaling-unavailable");
  assert.equal(open.disposition,"fail-open");
  assert.equal(open.journaled,false);
  assert.equal(open.authority,"non-authoritative");
  assert.deepEqual([...open.eventClasses],["candidate","external-side-effect","privacy"]);
  assert.deepEqual([...open.decidingEventClasses],[]);
  assert.equal(open.eventId,"offer-1");
  assert.equal(open.candidateDigest,"a".repeat(64));
  assert.equal(Object.isFrozen(open),true);
  assert.equal(Object.isFrozen(open.eventClasses),true);
  assert.equal(Object.hasOwn(open,"status"),false);
  assert.notEqual(open.schema,"pipeline.external-command-offer-receipt.v1");
  const closed=resolveJournalingUnavailability(offer({sideEffectClass:"destructive",recoverability:"rollback-required"}));
  assert.equal(closed.disposition,"fail-closed");
  assert.deepEqual([...closed.decidingEventClasses],["recovery","security"]);
  assert.equal(resolveJournalingUnavailability(offer({relatedHumanDecisionId:"human-1"})).disposition,"fail-closed");
  assert.equal(resolveJournalingUnavailability(value({kind:"verification-scope"})).disposition,"fail-closed");
  assert.equal(resolveJournalingUnavailability(value()).disposition,"fail-open");
  assert.throws(()=>resolveJournalingUnavailability({...offer(),command:"rm -rf"}),(error)=>error instanceof AgentDecisionJournalError);
});
// R-AC-04: `requiredCleanup` records WHAT cleanup/readback is required,
// distinct from (and never folded into) `recoverability`'s own WHETHER
// category. Optional at the key level, so the plain `offer()` fixture and
// every other pre-existing fixture keeps validating with no key present.
test("R-AC-04 records a distinct required-cleanup/readback field, optional, scoped to a recoverability other than not-applicable",()=>{
  const withCleanup=validateCommandOfferEvent(offer({recoverability:"rollback-required",requiredCleanup:{cleanupClass:"manual-file-restore",status:"pending",digest:"7".repeat(64)}}));
  assert.deepEqual(withCleanup.requiredCleanup,{cleanupClass:"manual-file-restore",status:"pending",digest:"7".repeat(64)});
  assert.equal(Object.isFrozen(withCleanup.requiredCleanup),true);
  const withoutDigest=validateCommandOfferEvent(offer({recoverability:"cleanup-required",requiredCleanup:{cleanupClass:"readback-confirmation",status:"verified",digest:null}}));
  assert.equal(withoutDigest.requiredCleanup.digest,null);
  assert.equal(Object.hasOwn(validateCommandOfferEvent(offer()),"requiredCleanup"),false);
  assert.throws(()=>validateCommandOfferEvent(offer({recoverability:"rollback-required",requiredCleanup:{cleanupClass:"manual-file-restore",status:"unknown-status",digest:null}})),(error)=>error.code==="ADJ-COMMAND-OFFER");
  assert.throws(()=>validateCommandOfferEvent(offer({recoverability:"rollback-required",requiredCleanup:{cleanupClass:"manual-file-restore",status:"pending",digest:"not-a-digest"}})),(error)=>error.code==="ADJ-COMMAND-OFFER");
  assert.throws(()=>validateCommandOfferEvent(offer({recoverability:"not-applicable",requiredCleanup:{cleanupClass:"manual-file-restore",status:"pending",digest:null}})),(error)=>error.code==="ADJ-COMMAND-CLEANUP-SCOPE");
});

// R-AC-09: `occurredAtEpochMs` closes the "stale" clause by giving a
// command-offer event a timestamp at all (previously none existed on this
// shape anywhere). Optional at the key level, exactly like `requiredCleanup`
// above, so every pre-existing fixture keeps validating with no key present.
// Format-validated only (a non-negative safe integer); no hardcoded
// staleness window is embedded here (see the function's own doc comment).
// The "duplicated" clause is deliberately not re-covered by a new mechanism
// here: it is already substantially covered by governance-event-store.mjs's
// idempotencyKey-based duplicate/conflict detection at the append layer
// (see the function's own doc comment and this file's A-AC-13 test above),
// and a pre-existing R-AC-13 test in external-command-offer.test.mjs
// documents that this validation layer intentionally delegates duplicate/
// retry detection to the caller-supplied append(), which this dispatch must
// not contradict.
test("R-AC-09 records a stale-evaluable occurrence timestamp, optional, format-validated, unscoped by state",()=>{
  const withTimestamp=validateCommandOfferEvent(offer({occurredAtEpochMs:1754000000000}));
  assert.equal(withTimestamp.occurredAtEpochMs,1754000000000);
  assert.equal(Object.hasOwn(validateCommandOfferEvent(offer()),"occurredAtEpochMs"),false,"absence must stay absence, not a synthesised value");
  const zero=validateCommandOfferEvent(offer({occurredAtEpochMs:0}));
  assert.equal(zero.occurredAtEpochMs,0,"zero is a valid epoch timestamp, not treated as falsy-absent");
  for(const state of ["offered","attempted","failed","recovery-proposed"]){
    const fixture=state==="offered"?offer({occurredAtEpochMs:5}):offer({state,executionAssurance:state==="recovery-proposed"?"not-applicable":state,offerEventId:"offer-origin",occurredAtEpochMs:5});
    assert.equal(validateCommandOfferEvent(fixture).occurredAtEpochMs,5,`occurredAtEpochMs was rejected or altered for state ${state}`);
  }
});
test("R-AC-09 rejects a malformed occurrence timestamp with ADJ-COMMAND-OFFER",()=>{
  for(const occurredAtEpochMs of [-1,1.5,"1754000000000",null,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])
    assert.throws(()=>validateCommandOfferEvent(offer({occurredAtEpochMs})),(error)=>error.code==="ADJ-COMMAND-OFFER",`malformed occurredAtEpochMs ${String(occurredAtEpochMs)} was admitted`);
});
// R-AC-11: `commitment`/`commitmentReceiptId` are the public-safe half of a
// private-only handoff detail the `omissions` array already mandates be
// excluded. Two flat, optional-at-the-key-level keys, mirroring
// document-lifecycle.mjs's receiptId+commitment pairing convention
// field-for-field (see the function's own doc comment); optional exactly
// like requiredCleanup/occurredAtEpochMs, so every pre-existing fixture
// keeps validating with no key present.
test("R-AC-11 records a public-safe commitment digest paired with a receipt id, optional, both-or-neither",()=>{
  const withCommitment=validateCommandOfferEvent(offer({commitment:"7".repeat(64),commitmentReceiptId:"restricted-record-1"}));
  assert.equal(withCommitment.commitment,"7".repeat(64));
  assert.equal(withCommitment.commitmentReceiptId,"restricted-record-1");
  const plain=validateCommandOfferEvent(offer());
  assert.equal(Object.hasOwn(plain,"commitment"),false,"absence must stay absence, not a synthesised value");
  assert.equal(Object.hasOwn(plain,"commitmentReceiptId"),false);
});
test("R-AC-11 rejects a malformed commitment digest or receipt id with ADJ-COMMAND-OFFER",()=>{
  assert.throws(()=>validateCommandOfferEvent(offer({commitment:"not-a-digest",commitmentReceiptId:"restricted-record-1"})),(error)=>error.code==="ADJ-COMMAND-OFFER");
  assert.throws(()=>validateCommandOfferEvent(offer({commitment:"7".repeat(64),commitmentReceiptId:""})),(error)=>error.code==="ADJ-COMMAND-OFFER");
  assert.throws(()=>validateCommandOfferEvent(offer({commitment:"7".repeat(64),commitmentReceiptId:"has a space"})),(error)=>error.code==="ADJ-COMMAND-OFFER");
});
test("R-AC-11 rejects one of the pair present without the other with ADJ-COMMAND-COMMITMENT-PAIRING",()=>{
  assert.throws(()=>validateCommandOfferEvent(offer({commitment:"7".repeat(64)})),(error)=>error.code==="ADJ-COMMAND-COMMITMENT-PAIRING");
  assert.throws(()=>validateCommandOfferEvent(offer({commitmentReceiptId:"restricted-record-1"})),(error)=>error.code==="ADJ-COMMAND-COMMITMENT-PAIRING");
});
// R-AC-05 enumerates what must never cross a durable boundary. The journal
// rejects rather than redacts, and it does so structurally: no prohibited field
// is representable in either event shape, and the single digest slot is typed
// as a governed artifact so a digest of arbitrary private command text has
// nowhere to live. This enumerates the criterion's own list instead of relying
// on the two sampled cases above.
const PROHIBITED={credential:"redacted-fixture",token:"redacted-fixture",account:"person-fixture",accountId:"person-fixture",sshKey:"redacted-fixture",privatePath:"/home/fixture/secret",privateCoordinates:"tenant-fixture",command:"rm -rf /",rawCommand:"rm -rf /",script:"#!/bin/sh\nrm -rf /",commandText:"rm -rf /",arguments:["--force"],shellHistory:"history-fixture",transcript:"transcript-fixture",prompt:"prompt-fixture",output:"unrestricted-output-fixture",unrestrictedOutput:"unrestricted-output-fixture",commandSha256:"9".repeat(64),scriptDigest:"9".repeat(64)};
test("R-AC-05 refuses every enumerated private field and every untyped digest at both journal boundaries",()=>{
  for(const [field,content] of Object.entries(PROHIBITED)){
    assert.throws(()=>validateAgentDecisionEvent({...value(),[field]:content}),(error)=>error instanceof AgentDecisionJournalError,`assumption admitted ${field}`);
    assert.throws(()=>validateAgentDecisionEvent({...offer(),[field]:content}),(error)=>error instanceof AgentDecisionJournalError,`command offer admitted ${field}`);
    assert.throws(()=>validateCommandOfferEvent(offer({operation:{operationClass:"governed-repair",version:"v1",governedArtifactSha256:"b".repeat(64),[field]:content}})),(error)=>error instanceof AgentDecisionJournalError,`operation admitted ${field}`);
    assert.throws(()=>validateCommandOfferEvent(offer({target:{repositoryFingerprint:"c".repeat(64),scopeDigest:"d".repeat(64),[field]:content}})),(error)=>error instanceof AgentDecisionJournalError,`target admitted ${field}`);
  }
  // Each mandatory omission is individually required, not merely the set size.
  for(const omitted of ["raw-command","arguments","private-coordinates","unrestricted-output"])
    assert.throws(()=>validateCommandOfferEvent(offer({omissions:["raw-command","arguments","private-coordinates","unrestricted-output","prompt"].filter((entry)=>entry!==omitted)})),(error)=>error instanceof AgentDecisionJournalError,`omission ${omitted} was optional`);
  // The permitted digest is the governed artifact one, and only that one.
  const accepted=validateCommandOfferEvent(offer());
  assert.equal(accepted.operation.governedArtifactSha256,"b".repeat(64));
  assert.deepEqual(Object.keys(accepted.operation).sort(),["governedArtifactSha256","operationClass","version"]);
  assert.deepEqual(Object.keys(accepted.target).sort(),["repositoryFingerprint","scopeDigest"]);
  assert.equal(Object.isFrozen(accepted.omissions),true);
  const serialized=JSON.stringify(accepted);
  for(const content of Object.values(PROHIBITED))assert.equal(serialized.includes(String(content)),false);
});

// A-AC-11 adds a second, distinct axis to the journal. `state` records what
// became of a claim; `assumptionState` records the epistemic ground it was held
// on. A claim can legitimately be inferred AND later contradicted, so the two
// vocabularies stay separate enums, neither constrains the other, and the
// overlapping words (`verified`, `contradicted`) are deliberately not the same
// value in the same slot. The key is optional because the criterion governs the
// case WHEN an assumption state is recorded; when present it fails closed.
import { readFileSync } from "node:fs";
const ASSUMPTION_STATES=["assumed","inferred","observed","verified","contradicted","unavailable","unknown"];
const LIFECYCLE_STATES=["declared","verified","contradicted","expired","invalidated","superseded"];
const CODE_PATTERN="^[A-Z][A-Z0-9._:-]{0,127}$";
test("A-AC-11 preserves each enumerated assumption state as a distinct typed value",()=>{
  const seen=new Set();
  for(const assumptionState of ASSUMPTION_STATES){
    const accepted=validateAgentDecisionEvent(value({assumptionState}));
    assert.equal(accepted.assumptionState,assumptionState,`assumption state ${assumptionState} was not preserved`);
    seen.add(accepted.assumptionState);
  }
  assert.equal(seen.size,ASSUMPTION_STATES.length,"the enumerated assumption states are not distinct");
});
test("A-AC-11 rejects unknown assumption states and keeps the two vocabularies unmerged",()=>{
  for(const assumptionState of ["declared","expired","invalidated","superseded","offered","Assumed","assumed ","assume","",null,0,true,undefined,[],{},["assumed"]])
    assert.throws(()=>validateAgentDecisionEvent(value({assumptionState})),(error)=>error instanceof AgentDecisionJournalError,`assumption state admitted ${JSON.stringify(assumptionState)??String(assumptionState)}`);
  for(const state of ["assumed","inferred","observed","unavailable","unknown"])
    assert.throws(()=>validateAgentDecisionEvent(value({state})),(error)=>error instanceof AgentDecisionJournalError,`the lifecycle axis admitted the epistemic value ${state}`);
  for(const field of ["assumptionstate","assumption_state","AssumptionState","epistemicState"])
    assert.throws(()=>validateAgentDecisionEvent({...value(),[field]:"assumed"}),(error)=>error instanceof AgentDecisionJournalError,`the shape admitted the unknown property ${field}`);
});
test("A-AC-11 leaves the assumption state optional and independent of the claim lifecycle",()=>{
  const unrecorded=validateAgentDecisionEvent(value());
  assert.equal(Object.hasOwn(unrecorded,"assumptionState"),false,"absence must stay absence, not a synthesised value");
  for(const state of LIFECYCLE_STATES)for(const assumptionState of ASSUMPTION_STATES){
    const accepted=validateAgentDecisionEvent(value({state,assumptionState,supersedesEventId:state==="superseded"?"agent-0":null}));
    assert.equal(accepted.state,state,`lifecycle ${state} was constrained by assumption state ${assumptionState}`);
    assert.equal(accepted.assumptionState,assumptionState,`assumption state ${assumptionState} was constrained by lifecycle ${state}`);
  }
});
test("A-AC-11 keeps the published schema closed and in step with the validator",()=>{
  const schema=JSON.parse(readFileSync(new URL("../../../governance/schemas/agent-decision-event.schema.json",import.meta.url),"utf8"));
  const branch=schema.oneOf.find((entry)=>entry.properties.kind.enum?.includes("assumption"));
  assert.deepEqual(branch.properties.assumptionState.enum,ASSUMPTION_STATES);
  assert.deepEqual(branch.properties.state.enum,LIFECYCLE_STATES);
  assert.equal(branch.required.includes("assumptionState"),false);
  assert.equal(branch.properties.revalidationTrigger.type,"string","A-AC-01: the published schema must carry the revalidation trigger the validator now admits");
  assert.equal(branch.properties.revalidationTrigger.pattern,CODE_PATTERN,"A-AC-01: the published revalidation-trigger pattern must be the validator's own bounded CODE pattern, not a looser string");
  assert.equal(branch.required.includes("revalidationTrigger"),false,"revalidationTrigger must stay optional, matching assumptionState");
  for(const entry of schema.oneOf)assert.equal(entry.additionalProperties,false,"a journal event shape stopped being closed");
});

// A-AC-01 adds the one clause of that criterion with no field anywhere on this
// shape: the revalidation trigger. `state` records what became of a claim and
// `assumptionState` the epistemic ground it was held on; `revalidationTrigger`
// records what would make it due for re-checking. It is a bounded stable
// identifier (the same CODE pattern `reasonCode` uses -- this module admits
// free text nowhere), optional at the key level exactly like `assumptionState`
// so every pre-existing fixture keeps validating unchanged, and deliberately
// NOT kind-scoped the way `identity` is: A-AC-01's own text narrows it to no
// subset of KINDS, so there is no ADJ-IDENTITY-SCOPE analogue to assert -- a
// shape-valid trigger is accepted on every kind, which the test below pins
// positively rather than leaving as an untested absence.
const AGENT_KINDS=["assumption","selection","verification-scope","fallback","escalation"];
test("A-AC-01 preserves a well-formed revalidation trigger as a bounded stable identifier",()=>{
  for(const revalidationTrigger of ["ON_NEXT_VERIFY_RUN","CANDIDATE.CHANGED","SPEC:REVISION-CHANGED","E",`A${"B".repeat(127)}`]){
    const accepted=validateAgentDecisionEvent(value({revalidationTrigger}));
    assert.equal(accepted.revalidationTrigger,revalidationTrigger,`revalidation trigger ${revalidationTrigger} was not preserved`);
    assert.equal(Object.isFrozen(accepted),true);
  }
});
test("A-AC-01 rejects free text and every non-string revalidation trigger with ADJ-SHAPE",()=>{
  for(const revalidationTrigger of ["revalidate this later","on_next_verify_run","ON NEXT VERIFY RUN","","1_TRIGGER",`A${"B".repeat(128)}`,null,undefined,0,1,true,false,[],["ON_NEXT_VERIFY_RUN"],{},{trigger:"ON_NEXT_VERIFY_RUN"}])
    assert.throws(()=>validateAgentDecisionEvent(value({revalidationTrigger})),(error)=>error instanceof AgentDecisionJournalError&&error.code==="ADJ-SHAPE",`revalidation trigger ${JSON.stringify(revalidationTrigger)??String(revalidationTrigger)} was admitted`);
  for(const field of ["revalidationtrigger","revalidation_trigger","RevalidationTrigger","revalidateOn"])
    assert.throws(()=>validateAgentDecisionEvent({...value(),[field]:"ON_NEXT_VERIFY_RUN"}),(error)=>error instanceof AgentDecisionJournalError,`the shape admitted the unknown property ${field}`);
  assert.throws(()=>validateCommandOfferEvent(offer({revalidationTrigger:"ON_NEXT_VERIFY_RUN"})),(error)=>error.code==="ADJ-COMMAND-OFFER","the command-offer shape must stay closed against the new key");
});
test("A-AC-01 leaves the revalidation trigger optional, unscoped by kind, and independent of the claim lifecycle",()=>{
  assert.equal(Object.hasOwn(validateAgentDecisionEvent(value()),"revalidationTrigger"),false,"absence must stay absence, not a synthesised value");
  for(const kind of AGENT_KINDS){
    const accepted=validateAgentDecisionEvent(value({kind,revalidationTrigger:"ON_NEXT_VERIFY_RUN"}));
    assert.equal(accepted.revalidationTrigger,"ON_NEXT_VERIFY_RUN",`kind ${kind} rejected or altered a shape-valid revalidation trigger; this field is deliberately unscoped, unlike identity`);
    assert.equal(Object.hasOwn(validateAgentDecisionEvent(value({kind})),"revalidationTrigger"),false,`kind ${kind} synthesised a revalidationTrigger key from its absence`);
  }
  for(const state of LIFECYCLE_STATES){
    const accepted=validateAgentDecisionEvent(value({state,revalidationTrigger:"CANDIDATE.CHANGED",supersedesEventId:state==="superseded"?"agent-0":null}));
    assert.equal(accepted.state,state,`lifecycle ${state} was constrained by the revalidation trigger`);
    assert.equal(accepted.revalidationTrigger,"CANDIDATE.CHANGED",`the revalidation trigger was constrained by lifecycle ${state}`);
  }
  const composed=validateAgentDecisionEvent(value({kind:"selection",assumptionState:"inferred",identity:[{dimension:"model",value:"claude-opus-5",provenance:"same-dispatch-observed",assurance:"verified"}],revalidationTrigger:"ROUTE.CHANGED"}));
  assert.equal(composed.revalidationTrigger,"ROUTE.CHANGED","the three optional axes must compose; none excludes another");
  assert.equal(composed.assumptionState,"inferred");
});

// A-AC-05 adds a third, distinct axis: identity provenance/assurance. It is
// admissible only on the three kinds where an identity choice is actually
// material to the decision being recorded (`selection`, `escalation`,
// `fallback`); `assumption`/`verification-scope` never carry it, and presence
// there is its own named shape violation (ADJ-IDENTITY-SCOPE), distinct from
// the generic ADJ-SHAPE every other malformed field in this record falls
// under. The key stays optional the same way `assumptionState` is: absence
// must never change existing behavior.
const IDENTITY_DIMENSIONS=["runner","model","effort","profile","role","adapter","capability"];
const IDENTITY_PROVENANCE=["same-dispatch-observed","requested-route","inherited-session","unknown"];
const IDENTITY_ASSURANCE=["verified","reported","inferred","unknown"];
const identityEntry=(overrides={})=>({dimension:"model",value:"claude-sonnet-5",provenance:"same-dispatch-observed",assurance:"verified",...overrides});
test("A-AC-05 accepts a well-formed identity record on each identity-material kind",()=>{
  for(const kind of ["selection","escalation","fallback"]){
    const accepted=validateAgentDecisionEvent(value({kind,identity:[identityEntry()]}));
    assert.deepEqual(accepted.identity,[identityEntry()],`identity was not preserved for kind ${kind}`);
  }
});
test("A-AC-05 rejects identity present on assumption with ADJ-IDENTITY-SCOPE",()=>{
  assert.throws(()=>validateAgentDecisionEvent(value({kind:"assumption",identity:[identityEntry()]})),(error)=>error instanceof AgentDecisionJournalError&&error.code==="ADJ-IDENTITY-SCOPE","identity on assumption must fail with ADJ-IDENTITY-SCOPE specifically, not the generic ADJ-SHAPE");
});
test("A-AC-05 rejects identity present on verification-scope with ADJ-IDENTITY-SCOPE",()=>{
  assert.throws(()=>validateAgentDecisionEvent(value({kind:"verification-scope",identity:[identityEntry()]})),(error)=>error instanceof AgentDecisionJournalError&&error.code==="ADJ-IDENTITY-SCOPE","identity on verification-scope must fail with ADJ-IDENTITY-SCOPE specifically, not the generic ADJ-SHAPE");
});
test("A-AC-05 rejects two identity entries sharing the same dimension",()=>{
  assert.throws(()=>validateAgentDecisionEvent(value({kind:"selection",identity:[identityEntry(),identityEntry({value:"claude-haiku-5"})]})),(error)=>error instanceof AgentDecisionJournalError,"a duplicate-dimension identity array was admitted");
});
test("A-AC-05 rejects an empty identity array",()=>{
  assert.throws(()=>validateAgentDecisionEvent(value({kind:"selection",identity:[]})),(error)=>error instanceof AgentDecisionJournalError,"a zero-length identity array was admitted");
});
test("A-AC-05 rejects an identity array exceeding the seven-dimension bound",()=>{
  const eight=[...IDENTITY_DIMENSIONS.map((dimension)=>identityEntry({dimension})),identityEntry({value:"claude-haiku-5"})];
  assert.throws(()=>validateAgentDecisionEvent(value({kind:"selection",identity:eight})),(error)=>error instanceof AgentDecisionJournalError,"an 8-entry identity array was admitted");
});
test("A-AC-05 rejects an unrecognized dimension, provenance, or assurance value",()=>{
  for(const entry of [identityEntry({dimension:"language"}),identityEntry({provenance:"observed"}),identityEntry({assurance:"confirmed"})])
    assert.throws(()=>validateAgentDecisionEvent(value({kind:"selection",identity:[entry]})),(error)=>error instanceof AgentDecisionJournalError,`an unrecognized enum value in ${JSON.stringify(entry)} was admitted`);
});
test("A-AC-05 leaves every observational kind accepted with no identity key at all, unchanged",()=>{
  for(const kind of ["assumption","selection","verification-scope","fallback","escalation"]){
    const accepted=validateAgentDecisionEvent(value({kind}));
    assert.equal(Object.hasOwn(accepted,"identity"),false,`kind ${kind} synthesised an identity key from its absence`);
  }
});
test("A-AC-05 keeps the published identity schema closed and in step with the validator",()=>{
  const schema=JSON.parse(readFileSync(new URL("../../../governance/schemas/agent-decision-event.schema.json",import.meta.url),"utf8"));
  const branch=schema.oneOf.find((entry)=>entry.properties.kind.enum?.includes("assumption"));
  assert.deepEqual(branch.properties.identity.items.properties.dimension.enum,IDENTITY_DIMENSIONS);
  assert.deepEqual(branch.properties.identity.items.properties.provenance.enum,IDENTITY_PROVENANCE);
  assert.deepEqual(branch.properties.identity.items.properties.assurance.enum,IDENTITY_ASSURANCE);
  assert.equal(branch.properties.identity.minItems,1);
  assert.equal(branch.properties.identity.maxItems,7);
  assert.equal(branch.required.includes("identity"),false,"identity must stay optional, matching assumptionState");
});

// PHX-WP-A pins the previously unnamed sub-clauses of A-AC-02, A-AC-12 and
// A-AC-13. Where a journal-specific end-to-end property requires the shared
// store or export machinery, these tests build their own minimal fixtures
// rather than reaching into governance-event-store.test.mjs, which already
// covers the shared, origin-agnostic properties (idempotency, hash-chain,
// locking) generically and is not journal-specific. A-AC-07 and A-AC-14 are
// reported `absent` in evidence/phx-wp-a.txt instead of pinned here: neither
// the journal module, the shared store, nor the capture-policy schema has any
// concept of a per-event-class "mandatory" capture guarantee (A-AC-07), and
// the conformance suite is far short of the 13 named A-AC-14 scenarios (only
// a single shallow test per scenario would be possible, which the briefing
// forbids as padding).
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { canonicalSha256, canonicalizeJson, sealGovernanceEvent } from "./governance-event.mjs";
import { derivePoGateRepositoryFingerprint } from "./po-gate-authority.mjs";
import { discoverRepository } from "./worktree-lifecycle.mjs";
import { GovernanceEventStoreError, appendPortableGovernanceEvent, putRestrictedGovernanceEvent, queryPortableGovernanceStream, verifyPortableGovernanceStream } from "./governance-event-store.mjs";
import { projectGovernanceEvent, validateGovernanceExportPolicy } from "./governance-event-projection.mjs";

const AGENT_CANDIDATE={commit:"b".repeat(40),tree:"c".repeat(40)};
const UNAVAILABLE={state:"not-applicable"};
function agentRegistryFixture(fingerprint){
  return{schema:"pipeline.governance-stream-registry.v1",repositoryFingerprint:fingerprint,canonicalization:"RFC8785",digestAlgorithm:"sha-256",eventDigestDomain:"pipeline.governance-event.v1\0",storageRoot:"governance/events",streams:[
    {streamId:"human",origin:"human",authorityClass:"human-authority",relativeRoot:"human",storageProfile:"repository-public-safe",genesis:{sequence:0,eventDigest:null}},
    {streamId:"agent",origin:"agent",authorityClass:"non-authoritative",relativeRoot:"agent",storageProfile:"repository-public-safe",genesis:{sequence:0,eventDigest:null}},
    {streamId:"lifecycle",origin:"lifecycle",authorityClass:"non-authoritative",relativeRoot:"lifecycle",storageProfile:"repository-public-safe",genesis:{sequence:0,eventDigest:null}},
  ]};
}
function agentCapturePolicyFixture(){
  return{schema:"pipeline.governance-capture-policy.v1",policyId:"phx-wp-a-fixture",revision:"c".repeat(64),defaultAction:"deny",streams:[
    {origin:"human",purpose:"authority-history",materiality:"required",personalIdentifiability:"prohibited",contextualIdentifiability:"prohibited",storageProfile:"repository-public-safe",retention:"repository-retained",disclosure:"repository-visible",encryptionGeneration:null},
    {origin:"agent",purpose:"declared-assumption",materiality:"policy-selected",personalIdentifiability:"prohibited",contextualIdentifiability:"prohibited",storageProfile:"repository-public-safe",retention:"repository-retained",disclosure:"repository-visible",encryptionGeneration:null},
    {origin:"lifecycle",purpose:"deterministic-lifecycle",materiality:"required",personalIdentifiability:"prohibited",contextualIdentifiability:"prohibited",storageProfile:"repository-public-safe",retention:"repository-retained",disclosure:"repository-visible",encryptionGeneration:null},
  ],sanitizedReceipt:{allowEventId:true,allowEventDigest:true,allowCheckpoint:true,allowReasonText:false},mandatoryEventClasses:[]};
}
async function agentFixtureRoot(){
  const root=await mkdtemp(path.join(os.tmpdir(),"agent-decision-journal-"));
  execFileSync("git",["init","-q",root]);
  const repository=discoverRepository(root);
  const fingerprint=derivePoGateRepositoryFingerprint({gitCommonDir:repository.commonDir,primaryRoot:repository.primaryRoot});
  const capturePolicy=agentCapturePolicyFixture();
  const capturePolicyDigest=canonicalSha256(capturePolicy);
  await mkdir(path.join(root,"governance/events"),{recursive:true});
  await writeFile(path.join(root,"governance/events/registry.json"),`${canonicalizeJson(agentRegistryFixture(fingerprint))}\n`);
  await writeFile(path.join(root,"governance/events/capture-policy.json"),`${canonicalizeJson(capturePolicy)}\n`);
  return{root,fingerprint,capturePolicyDigest};
}
function agentIntent({fingerprint,capturePolicyDigest,eventId,idempotencyKey,eventType,payload}){
  return{
    schema:"pipeline.governance-event-envelope.v1",payloadSchema:"pipeline.agent-decision-event.v1",canonicalization:"RFC8785",digestAlgorithm:"sha-256",
    eventId,idempotencyKey,origin:"agent",authorityClass:"non-authoritative",eventType,
    occurredAtEpochMs:1,observedAtEpochMs:1,timeAssurance:"locally-observed",
    repositoryFingerprint:fingerprint,sourceUri:`urn:pipeline:repository:${fingerprint}`,streamId:"agent",
    correlation:{featureId:UNAVAILABLE,packageId:"phoenix-3",requestId:UNAVAILABLE,sessionId:UNAVAILABLE,dispatchId:"dispatch-1",traceId:UNAVAILABLE},
    candidate:AGENT_CANDIDATE,artifacts:[UNAVAILABLE],
    policy:{policyDigest:UNAVAILABLE,configurationDigest:UNAVAILABLE,capturePolicyDigest,redactionPolicyDigest:UNAVAILABLE},
    classification:"repository-public-safe",storageProfile:"repository-public-safe",retentionCompatibility:"repository-retained",disclosureClass:"repository-visible",
    payload,
  };
}

test("A-AC-02 accepts a linked follow-up event for every assumption lifecycle transition, and end-to-end preserves the original event unchanged when one is appended",async(t)=>{
  for(const state of ["verified","contradicted","expired","invalidated","superseded"]){
    const linked=validateAgentDecisionEvent(value({eventId:"agent-linked",state,supersedesEventId:"agent-original"}));
    assert.equal(linked.supersedesEventId,"agent-original",`A-AC-02: state ${state} did not accept a linked follow-up event`);
  }
  const{root,fingerprint,capturePolicyDigest}=await agentFixtureRoot();
  t.after(()=>rm(root,{recursive:true,force:true}));
  const originalPayload=validateAgentDecisionEvent({eventId:"agent-assumption-1",kind:"assumption",state:"declared",reasonCode:"EVIDENCE_UNAVAILABLE",candidateDigest:canonicalSha256(AGENT_CANDIDATE),relatedHumanDecisionId:null,supersedesEventId:null});
  const originalReceipt=await appendPortableGovernanceEvent({repositoryRoot:root,repositoryFingerprint:fingerprint,intent:agentIntent({fingerprint,capturePolicyDigest,eventId:"agent-event-original",idempotencyKey:"agent-idem-original",eventType:"agent.assumption",payload:originalPayload})});
  assert.equal(originalReceipt.outcome,"appended");
  const linkedPayload=validateAgentDecisionEvent({eventId:"agent-assumption-1-verified",kind:"assumption",state:"verified",reasonCode:"EVIDENCE_CONFIRMED",candidateDigest:canonicalSha256(AGENT_CANDIDATE),relatedHumanDecisionId:null,supersedesEventId:"agent-assumption-1"});
  const linkedReceipt=await appendPortableGovernanceEvent({repositoryRoot:root,repositoryFingerprint:fingerprint,intent:agentIntent({fingerprint,capturePolicyDigest,eventId:"agent-event-verified",idempotencyKey:"agent-idem-verified",eventType:"agent.assumption",payload:linkedPayload})});
  assert.equal(linkedReceipt.outcome,"appended");
  const stream=await queryPortableGovernanceStream({repositoryRoot:root,repositoryFingerprint:fingerprint,streamId:"agent",checkpoint:linkedReceipt.checkpoint});
  assert.equal(stream.events.length,2,"A-AC-02: both the original and the linked transition must be readable");
  assert.deepEqual({...stream.events[0].payload},{...originalPayload},"A-AC-02: appending the linked transition must not rewrite the original event");
  assert.equal(stream.events[1].payload.supersedesEventId,"agent-assumption-1","A-AC-02: the appended transition must carry the link back to the original");
});

test("A-AC-13 rejects a duplicate journal submission deterministically and preserves canonical history exactly once, while an exact idempotent replay is a typed no-write outcome",async(t)=>{
  const{root,fingerprint,capturePolicyDigest}=await agentFixtureRoot();
  t.after(()=>rm(root,{recursive:true,force:true}));
  const payload=validateAgentDecisionEvent({eventId:"agent-selection-1",kind:"selection",state:"declared",reasonCode:"ROUTE_SELECTED",candidateDigest:canonicalSha256(AGENT_CANDIDATE),relatedHumanDecisionId:null,supersedesEventId:null});
  const intent=agentIntent({fingerprint,capturePolicyDigest,eventId:"agent-event-selection-1",idempotencyKey:"agent-idem-selection-1",eventType:"agent.selection",payload});
  const first=await appendPortableGovernanceEvent({repositoryRoot:root,repositoryFingerprint:fingerprint,intent});
  assert.equal(first.outcome,"appended");
  const duplicate=await appendPortableGovernanceEvent({repositoryRoot:root,repositoryFingerprint:fingerprint,intent});
  assert.equal(duplicate.outcome,"idempotent-replay","A-AC-13: an exact duplicate journal submission must be a deterministic typed no-write outcome");
  assert.equal(duplicate.eventDigest,first.eventDigest);
  const conflictingPayload=validateAgentDecisionEvent({...payload,reasonCode:"ROUTE_RESELECTED"});
  const conflictingIntent=agentIntent({fingerprint,capturePolicyDigest,eventId:"agent-event-selection-1",idempotencyKey:"agent-idem-selection-1",eventType:"agent.selection",payload:conflictingPayload});
  await assert.rejects(()=>appendPortableGovernanceEvent({repositoryRoot:root,repositoryFingerprint:fingerprint,intent:conflictingIntent}),(error)=>error instanceof GovernanceEventStoreError&&error.code==="GES-IDEMPOTENCY-CONFLICT","A-AC-13: a conflicting duplicate journal submission under the same idempotency key must fail closed deterministically, not silently pick a winner");
  const stream=await queryPortableGovernanceStream({repositoryRoot:root,repositoryFingerprint:fingerprint,streamId:"agent",checkpoint:first.checkpoint});
  assert.equal(stream.events.length,1,"A-AC-13: exactly one canonical journal event must survive the duplicate/conflict submissions");
});

test("A-AC-12 keeps downstream export/projection policy independently configurable and structurally unable to weaken what capture already admitted",()=>{
  const payload=validateAgentDecisionEvent({eventId:"agent-export-1",kind:"assumption",state:"declared",reasonCode:"EVIDENCE_UNAVAILABLE",candidateDigest:canonicalSha256(AGENT_CANDIDATE),relatedHumanDecisionId:null,supersedesEventId:null});
  const fingerprint="a".repeat(64);
  const sealed=sealGovernanceEvent({
    ...agentIntent({fingerprint,capturePolicyDigest:"d".repeat(64),eventId:"agent-export-event-1",idempotencyKey:"agent-export-idem-1",eventType:"agent.assumption",payload}),
    sequence:1,previousEventDigest:null,payloadDigest:"0".repeat(64),eventDigest:"0".repeat(64),
  });
  const narrowExportPolicy=validateGovernanceExportPolicy({schema:"pipeline.governance-export-policy.v1",policyId:"agent-metadata-only",revision:"e".repeat(64),destinationProfile:"agent-siem",format:"ndjson",allowedFields:["eventId","eventType","eventDigest"]});
  const wideExportPolicy=validateGovernanceExportPolicy({schema:"pipeline.governance-export-policy.v1",policyId:"agent-wide-metadata",revision:"f".repeat(64),destinationProfile:"agent-otlp",format:"otlp-json",allowedFields:["eventId","eventType","occurredAtEpochMs","eventDigest","repositoryFingerprint","correlation","candidate","policyDigest"]});
  const narrow=projectGovernanceEvent({event:sealed,policy:narrowExportPolicy});
  const wide=projectGovernanceEvent({event:sealed,policy:wideExportPolicy});
  assert.equal(narrow.status,"projected");
  assert.deepEqual(Object.keys(narrow.projection.fields).sort(),["eventDigest","eventId","eventType"],"A-AC-12: the export policy applied to the same captured event must be independently configurable per policy, not fixed by capture eligibility");
  assert.notDeepEqual(Object.keys(narrow.projection.fields).sort(),Object.keys(wide.projection.fields).sort(),"A-AC-12: two independently configured export policies over the same captured event must be able to yield different projections");
  assert.equal(sealed.policy.capturePolicyDigest,"d".repeat(64),"A-AC-12: capture eligibility must stay unaffected by which downstream export policy is later chosen");
  assert.throws(()=>validateGovernanceExportPolicy({...wideExportPolicy,allowedFields:["payload"]}),(error)=>error.code==="GEP-POLICY","A-AC-12: an export policy naming the admitted payload as an allowed field must be structurally rejected, so no export configuration can weaken the boundary capture already admitted");
});

// PHX-WP-A2 pins the remaining A-AC-12 residual: a stream requiring a
// narrower boundary than repository-public-safe must either use the
// separately protected machine-local profile or fail closed before
// persistence. The registry validator hard-codes "repository-public-safe"
// for every known stream, the intent validator rejects any other declared
// profile, and the restricted profile is structurally owner-authenticated
// and outside the repository -- never reachable through the portable path.
test("A-AC-12 fails closed before persistence for a narrower-than-portable boundary, and the restricted profile stays separate, owner-authenticated, and outside the repository",async(t)=>{
  const{root,fingerprint,capturePolicyDigest}=await agentFixtureRoot();
  t.after(()=>rm(root,{recursive:true,force:true}));
  const narrowRegistryRoot=await mkdtemp(path.join(os.tmpdir(),"agent-decision-journal-narrow-"));
  t.after(()=>rm(narrowRegistryRoot,{recursive:true,force:true}));
  execFileSync("git",["init","-q",narrowRegistryRoot]);
  const narrowRepository=discoverRepository(narrowRegistryRoot);
  const narrowFingerprint=derivePoGateRepositoryFingerprint({gitCommonDir:narrowRepository.commonDir,primaryRoot:narrowRepository.primaryRoot});
  const narrowRegistry=agentRegistryFixture(narrowFingerprint);
  narrowRegistry.streams[1]={...narrowRegistry.streams[1],storageProfile:"restricted-machine-local"};
  const narrowCapturePolicy=agentCapturePolicyFixture();
  await mkdir(path.join(narrowRegistryRoot,"governance/events"),{recursive:true});
  await writeFile(path.join(narrowRegistryRoot,"governance/events/registry.json"),`${canonicalizeJson(narrowRegistry)}\n`);
  await writeFile(path.join(narrowRegistryRoot,"governance/events/capture-policy.json"),`${canonicalizeJson(narrowCapturePolicy)}\n`);
  const narrowPayload=validateAgentDecisionEvent({eventId:"agent-narrow-1",kind:"assumption",state:"declared",reasonCode:"EVIDENCE_UNAVAILABLE",candidateDigest:canonicalSha256(AGENT_CANDIDATE),relatedHumanDecisionId:null,supersedesEventId:null});
  await assert.rejects(()=>appendPortableGovernanceEvent({repositoryRoot:narrowRegistryRoot,repositoryFingerprint:narrowFingerprint,intent:agentIntent({fingerprint:narrowFingerprint,capturePolicyDigest:canonicalSha256(narrowCapturePolicy),eventId:"agent-event-narrow-1",idempotencyKey:"agent-idem-narrow-1",eventType:"agent.assumption",payload:narrowPayload})}),(error)=>error instanceof GovernanceEventStoreError&&error.code==="GES-REGISTRY","A-AC-12: a registry declaring a narrower-than-portable agent stream boundary must fail closed before any event is considered");
  const narrowIntent={...agentIntent({fingerprint,capturePolicyDigest,eventId:"agent-event-narrow-2",idempotencyKey:"agent-idem-narrow-2",eventType:"agent.assumption",payload:validateAgentDecisionEvent({eventId:"agent-narrow-2",kind:"assumption",state:"declared",reasonCode:"EVIDENCE_UNAVAILABLE",candidateDigest:canonicalSha256(AGENT_CANDIDATE),relatedHumanDecisionId:null,supersedesEventId:null})}),storageProfile:"restricted-machine-local"};
  await assert.rejects(()=>appendPortableGovernanceEvent({repositoryRoot:root,repositoryFingerprint:fingerprint,intent:narrowIntent}),(error)=>error instanceof GovernanceEventStoreError&&error.code==="GES-INTENT","A-AC-12: an intent declaring a narrower-than-portable boundary must fail closed before persistence");
  const unaffected=await queryPortableGovernanceStream({repositoryRoot:root,repositoryFingerprint:fingerprint,streamId:"agent"});
  assert.equal(unaffected.events.length,0,"A-AC-12: the rejected narrow-boundary intent must leave no trace in the portable stream");
  await assert.rejects(()=>putRestrictedGovernanceEvent({repositoryRoot:root,storeRoot:"relative/machine-local",repositoryFingerprint:fingerprint}),(error)=>error instanceof GovernanceEventStoreError&&error.code==="GES-RESTRICTED-ROOT","A-AC-12: the restricted machine-local profile must refuse a relative store root");
  await assert.rejects(()=>putRestrictedGovernanceEvent({repositoryRoot:root,storeRoot:path.join(root,"restricted-inside"),repositoryFingerprint:fingerprint}),(error)=>error instanceof GovernanceEventStoreError&&error.code==="GES-RESTRICTED-IN-REPOSITORY","A-AC-12: the restricted machine-local profile must refuse a store root inside the repository");
  const outsideRoot=await mkdtemp(path.join(os.tmpdir(),"agent-decision-journal-restricted-"));
  t.after(()=>rm(outsideRoot,{recursive:true,force:true}));
  await assert.rejects(()=>putRestrictedGovernanceEvent({repositoryRoot:root,storeRoot:outsideRoot,repositoryFingerprint:fingerprint}),(error)=>error instanceof GovernanceEventStoreError&&error.code==="GES-RESTRICTED-KEY","A-AC-12: even a legitimate outside-repository store root still requires the separately protected encryption key, never persisting on its absence");
});

// PHX-WP-A2 pins the remaining A-AC-13 residual: the store's generic
// concurrent/interrupted/out-of-order coverage, mirrored here against
// agent-kind fixtures so the guarantee is not left store-generic-only.
test("A-AC-13 gives agent-kind submissions the same deterministic interrupted, concurrent, and out-of-order outcomes as the generic store",async(t)=>{
  const{root,fingerprint,capturePolicyDigest}=await agentFixtureRoot();
  t.after(()=>rm(root,{recursive:true,force:true}));
  const agentPayload=(n)=>validateAgentDecisionEvent({eventId:`agent-race-${n}`,kind:"selection",state:"declared",reasonCode:"ROUTE_SELECTED",candidateDigest:canonicalSha256(AGENT_CANDIDATE),relatedHumanDecisionId:null,supersedesEventId:null});
  const agentAppend=(n)=>appendPortableGovernanceEvent({repositoryRoot:root,repositoryFingerprint:fingerprint,intent:agentIntent({fingerprint,capturePolicyDigest,eventId:`agent-event-race-${n}`,idempotencyKey:`agent-idem-race-${n}`,eventType:"agent.selection",payload:agentPayload(n)})});
  const first=await agentAppend(1);
  assert.equal(first.outcome,"appended");
  const streamRoot=path.join(root,"governance/events/agent");
  const orphan=path.join(streamRoot,".2-agent-crashed.json.0123456789abcdef01234567.tmp");
  await writeFile(orphan,"partial writer bytes");
  const readableAfterOrphan=await queryPortableGovernanceStream({repositoryRoot:root,repositoryFingerprint:fingerprint,streamId:"agent",checkpoint:first.checkpoint});
  assert.deepEqual(readableAfterOrphan.events.map((event)=>event.sequence),[1],"A-AC-13: unpublished agent-kind writer bytes must never be authority");
  const lock=path.join(streamRoot,".lock");
  await writeFile(lock,`${canonicalizeJson({schema:"pipeline.governance-event-stream-lock.v1",pid:process.pid})}\n`);
  await assert.rejects(()=>agentAppend("live-lock"),(error)=>error instanceof GovernanceEventStoreError&&error.code==="GES-LOCKED","A-AC-13: a live agent-kind writer lock must fail closed rather than interleave");
  await rm(lock);
  await writeFile(lock,`${canonicalizeJson({schema:"pipeline.governance-event-stream-lock.v1",pid:2147483647})}\n`);
  const second=await agentAppend(2);
  assert.equal(second.outcome,"appended","A-AC-13: a dead agent-kind writer lock must be recoverable by a later writer");
  await writeFile(lock,`${canonicalizeJson({schema:"pipeline.governance-event-stream-lock.v1",pid:2147483647})}\n`);
  const results=await Promise.allSettled([agentAppend("race-a"),agentAppend("race-b")]);
  const fulfilled=results.filter((result)=>result.status==="fulfilled");
  assert.ok(fulfilled.length>0,"A-AC-13: at least one racing agent-kind writer must succeed");
  for(const rejected of results.filter((result)=>result.status==="rejected"))assert.equal(rejected.reason.code,"GES-LOCKED","A-AC-13: a losing racing agent-kind writer must fail deterministically");
  const raced=await queryPortableGovernanceStream({repositoryRoot:root,repositoryFingerprint:fingerprint,streamId:"agent"});
  assert.equal(raced.events.length,2+fulfilled.length,"A-AC-13: every successful racing agent-kind writer produces exactly one durable canonical event");
  assert.deepEqual(raced.events.map((event)=>event.sequence),raced.events.map((_,index)=>index+1),"A-AC-13: the canonical agent-kind history stays one contiguous chain even under races");
  const outOfOrderPayload=agentPayload("out-of-order");
  const outOfOrder=sealGovernanceEvent({...agentIntent({fingerprint,capturePolicyDigest,eventId:"agent-event-out-of-order",idempotencyKey:"agent-idem-out-of-order",eventType:"agent.selection",payload:outOfOrderPayload}),sequence:99,previousEventDigest:raced.events.at(-1).eventDigest,payloadDigest:"0".repeat(64),eventDigest:"0".repeat(64)});
  await writeFile(path.join(streamRoot,"99-agent-event-out-of-order.json"),`${canonicalizeJson(outOfOrder)}\n`);
  await assert.rejects(()=>verifyPortableGovernanceStream({repositoryRoot:root,repositoryFingerprint:fingerprint,streamId:"agent"}),(error)=>error instanceof GovernanceEventStoreError&&error.code==="GES-CHAIN","A-AC-13: an out-of-order agent-kind canonical file must fail closed rather than being silently accepted into history");
});

// PHX-WP-A2 pins seven of the seven remaining zero-coverage A-AC-14 named
// scenarios (excluding "decomposition", confirmed not representable: no
// "decomposition" value exists in `kind`, `state`, or any command-offer
// enum anywhere in agent-decision-journal.mjs). unverified-assumptions,
// later-confirmation, contradiction, candidate-invalidation and
// route-selection remain thinly covered by the generic A-AC-02/A-AC-11
// tests above and are deliberately not duplicated here.
test("A-AC-14 verification-scope-change is a representable, distinctly named scenario",()=>{
  const declared=validateAgentDecisionEvent({eventId:"agent-scope-1",kind:"verification-scope",state:"declared",reasonCode:"SCOPE_NARROWED",candidateDigest:canonicalSha256(AGENT_CANDIDATE),relatedHumanDecisionId:null,supersedesEventId:null});
  assert.equal(declared.kind,"verification-scope");
  const changed=validateAgentDecisionEvent({eventId:"agent-scope-2",kind:"verification-scope",state:"superseded",reasonCode:"SCOPE_WIDENED",candidateDigest:canonicalSha256(AGENT_CANDIDATE),relatedHumanDecisionId:null,supersedesEventId:"agent-scope-1"});
  assert.equal(changed.supersedesEventId,"agent-scope-1","A-AC-14: a verification-scope change must link back to the scope it changed");
});
test("A-AC-14 escalation is a representable, distinctly named scenario",()=>{
  const escalated=validateAgentDecisionEvent({eventId:"agent-escalation-1",kind:"escalation",state:"declared",reasonCode:"HUMAN_DECISION_REQUIRED",candidateDigest:canonicalSha256(AGENT_CANDIDATE),relatedHumanDecisionId:"human-decision-1",supersedesEventId:null});
  assert.equal(escalated.kind,"escalation");
  assert.equal(escalated.relatedHumanDecisionId,"human-decision-1","A-AC-14: an escalation must be able to link to the human decision it escalated to");
});
test("A-AC-14 fallback is a representable, distinctly named scenario",()=>{
  const fell=validateAgentDecisionEvent({eventId:"agent-fallback-1",kind:"fallback",state:"declared",reasonCode:"PRIMARY_ROUTE_UNAVAILABLE",candidateDigest:canonicalSha256(AGENT_CANDIDATE),relatedHumanDecisionId:null,supersedesEventId:null});
  assert.equal(fell.kind,"fallback");
});
test("A-AC-14 redaction is a representable, distinctly named scenario",()=>{
  const maximallyRedacted=validateCommandOfferEvent(offer({omissions:["raw-command","arguments","private-coordinates","unrestricted-output","prompt","transcript","credential"]}));
  assert.equal(maximallyRedacted.omissions.length,7,"A-AC-14: redaction must be able to omit every enumerated private-field class at once");
});
test("A-AC-14 retry is a representable, distinctly named scenario",()=>{
  const failedOffer=validateCommandOfferEvent(offer({eventId:"offer-retry-1",state:"failed",executionAssurance:"failed",offerEventId:"offer-retry-origin"}));
  assert.equal(failedOffer.state,"failed");
  const retried=validateCommandOfferEvent(offer({eventId:"offer-retry-2",state:"recovery-proposed",executionAssurance:"not-applicable",offerEventId:"offer-retry-origin",supersedesEventId:"offer-retry-1"}));
  assert.equal(retried.state,"recovery-proposed","A-AC-14: a retry after failure must be representable as its own typed state, not silently reusing the original offer");
  const recovered=validateCommandOfferEvent(offer({eventId:"offer-retry-3",state:"recovered",executionAssurance:"not-applicable",offerEventId:"offer-retry-2"}));
  assert.equal(recovered.state,"recovered");
});
test("A-AC-14 missing-journal-availability is a representable, distinctly named scenario",()=>{
  const unavailableAssumption=validateAgentDecisionEvent(value({assumptionState:"unavailable"}));
  assert.equal(unavailableAssumption.assumptionState,"unavailable");
  const unavailableOffer=validateCommandOfferEvent(offer({state:"unavailable",executionAssurance:"unavailable",offerEventId:"offer-unavailable-source"}));
  assert.equal(unavailableOffer.executionAssurance,"unavailable","A-AC-14: missing journal availability must be representable as its own typed unavailable state, not silently dropped");
});
test("A-AC-14 tampering is a representable, distinctly named scenario",async(t)=>{
  const{root,fingerprint,capturePolicyDigest}=await agentFixtureRoot();
  t.after(()=>rm(root,{recursive:true,force:true}));
  const payload=validateAgentDecisionEvent({eventId:"agent-tamper-1",kind:"selection",state:"declared",reasonCode:"ROUTE_SELECTED",candidateDigest:canonicalSha256(AGENT_CANDIDATE),relatedHumanDecisionId:null,supersedesEventId:null});
  const intent=agentIntent({fingerprint,capturePolicyDigest,eventId:"agent-event-tamper-1",idempotencyKey:"agent-idem-tamper-1",eventType:"agent.selection",payload});
  const receipt=await appendPortableGovernanceEvent({repositoryRoot:root,repositoryFingerprint:fingerprint,intent});
  assert.equal(receipt.outcome,"appended","A-AC-14: tampering must be proven against a validly written event, not a file that was never appended");
  const eventFile=path.join(root,receipt.eventPath);
  const stored=JSON.parse(await readFile(eventFile,"utf8"));
  const tampered={...stored,payload:{...stored.payload,reasonCode:"ROUTE_RESELECTED"}};
  await writeFile(eventFile,`${canonicalizeJson(tampered)}\n`);
  await assert.rejects(()=>verifyPortableGovernanceStream({repositoryRoot:root,repositoryFingerprint:fingerprint,streamId:"agent"}),(error)=>error instanceof GovernanceEventStoreError&&error.code==="GES-EVENT-INVALID","A-AC-14: a payload altered after a successful append must be detected on verify, never silently accepted into history");
  await assert.rejects(()=>queryPortableGovernanceStream({repositoryRoot:root,repositoryFingerprint:fingerprint,streamId:"agent"}),(error)=>error instanceof GovernanceEventStoreError&&error.code==="GES-EVENT-INVALID","A-AC-14: a payload altered after a successful append must be detected on query, never silently accepted into history");
});

// H-AC-08 gives the journal a third, independent event kind: a pre-Phoenix or
// external approval/override/deploy record whose original authority tuple
// cannot be reproven, imported only as this closed, explicitly unverified
// observation. Like `command-offer`, it is dispatched to its own validator
// before the 5-kind observational branch's `KINDS` check ever runs, and it
// rides the existing, unmodified `origin === "agent"` ->
// `authorityClass: "non-authoritative"` binding, so it structurally cannot
// satisfy a gate; that binding is exercised end-to-end elsewhere (this file's
// A-AC-02/A-AC-13 store-integration tests) and is not re-pinned here.
const LEGACY_SOURCE_CLASSES=["mutable-approval-state","guard-override-jsonl-record","deployment-approval-log","override-receipt","backlog-transition-record","release-change-evidence"];
const AUTHORITY_PROOF_STATUSES=["unprovable","not-attempted"];
const legacyImport=(overrides={})=>({eventId:"legacy-1",kind:"legacy-import-observation",state:"declared",reasonCode:"LEGACY_RECORD_IMPORTED",candidateDigest:"a".repeat(64),relatedHumanDecisionId:null,supersedesEventId:null,legacySourceClass:"mutable-approval-state",authorityProofStatus:"not-attempted",sourceReferencePath:null,sourceReferenceDigest:null,...overrides});
test("H-AC-08 accepts a well-formed legacy-import-observation via the dispatched kind and the direct validator, across representative legacySourceClass/authorityProofStatus/sourceReference combinations",()=>{
  for(const legacySourceClass of LEGACY_SOURCE_CLASSES){
    const accepted=validateAgentDecisionEvent(legacyImport({legacySourceClass}));
    assert.equal(accepted.legacySourceClass,legacySourceClass,`legacySourceClass ${legacySourceClass} was not preserved`);
    assert.equal(Object.isFrozen(accepted),true);
  }
  for(const authorityProofStatus of AUTHORITY_PROOF_STATUSES){
    const accepted=validateAgentDecisionEvent(legacyImport({authorityProofStatus,sourceReferencePath:"specs/legacy/override-log.jsonl",sourceReferenceDigest:"b".repeat(64)}));
    assert.equal(accepted.authorityProofStatus,authorityProofStatus,`authorityProofStatus ${authorityProofStatus} was not preserved`);
    assert.equal(accepted.sourceReferencePath,"specs/legacy/override-log.jsonl");
    assert.equal(accepted.sourceReferenceDigest,"b".repeat(64));
  }
  const nullPair=validateLegacyImportObservationEvent(legacyImport());
  assert.equal(nullPair.sourceReferencePath,null,"a fully-null sourceReferencePath must stay representable for legacy material with no stable reference at all");
  assert.equal(nullPair.sourceReferenceDigest,null);
});
test("H-AC-08 rejects an unrecognized legacySourceClass with ADJ-LEGACY-SHAPE",()=>{
  assert.throws(()=>validateAgentDecisionEvent(legacyImport({legacySourceClass:"unknown-legacy-class"})),(error)=>error instanceof AgentDecisionJournalError&&error.code==="ADJ-LEGACY-SHAPE","an unrecognized legacySourceClass was admitted");
});
test("H-AC-08 rejects an unrecognized authorityProofStatus",()=>{
  assert.throws(()=>validateAgentDecisionEvent(legacyImport({authorityProofStatus:"proven"})),(error)=>error instanceof AgentDecisionJournalError&&error.code==="ADJ-LEGACY-SHAPE","an unrecognized authorityProofStatus was admitted");
});
test("H-AC-08 rejects a superseded legacy-import-observation with no supersedesEventId, with ADJ-SUPERSESSION",()=>{
  assert.throws(()=>validateAgentDecisionEvent(legacyImport({state:"superseded"})),(error)=>error instanceof AgentDecisionJournalError&&error.code==="ADJ-SUPERSESSION","a superseded legacy-import-observation with no supersedesEventId was admitted");
  const superseded=validateAgentDecisionEvent(legacyImport({state:"superseded",supersedesEventId:"legacy-0"}));
  assert.equal(superseded.supersedesEventId,"legacy-0","H-AC-08: a genuinely provable later human-ledger decision must be able to supersede the unverified stand-in");
});
test("H-AC-08 rejects an extra/unknown key on a legacy-import-observation",()=>{
  assert.throws(()=>validateAgentDecisionEvent({...legacyImport(),approval:true}),(error)=>error instanceof AgentDecisionJournalError&&error.code==="ADJ-LEGACY-SHAPE","an extra key was admitted");
});
test("H-AC-08 rejects a sourceReferencePath escaping the repository or shaped as an absolute path",()=>{
  for(const sourceReferencePath of ["../secret","governance/../../etc/passwd","/etc/passwd"])
    assert.throws(()=>validateAgentDecisionEvent(legacyImport({sourceReferencePath,sourceReferenceDigest:"c".repeat(64)})),(error)=>error instanceof AgentDecisionJournalError&&error.code==="ADJ-LEGACY-SHAPE",`sourceReferencePath ${sourceReferencePath} was admitted`);
});
test("H-AC-08 keeps the published legacy-import-observation schema closed and in step with the validator",()=>{
  const schema=JSON.parse(readFileSync(new URL("../../../governance/schemas/agent-decision-event.schema.json",import.meta.url),"utf8"));
  const branch=schema.oneOf.find((entry)=>entry.properties.kind.const==="legacy-import-observation");
  assert.deepEqual(branch.properties.legacySourceClass.enum,LEGACY_SOURCE_CLASSES);
  assert.deepEqual(branch.properties.authorityProofStatus.enum,AUTHORITY_PROOF_STATUSES);
  assert.equal(branch.additionalProperties,false,"the legacy-import-observation shape stopped being closed");
  assert.deepEqual(branch.required.slice().sort(),["authorityProofStatus","candidateDigest","eventId","kind","legacySourceClass","reasonCode","relatedHumanDecisionId","sourceReferenceDigest","sourceReferencePath","state","supersedesEventId"]);
  for(const entry of schema.oneOf)assert.equal(entry.additionalProperties,false,"a journal event shape stopped being closed");
});

// R-AC-08: the two OCCURRED recovery facts. `recoverability` stays the
// prospective category; these are states, so a caller can never read "a
// rollback was required" as "a rollback happened".
const OCCURRED_RECOVERY=[["rollback-performed","rollback-required"],["cleanup-performed","cleanup-required"]];
test("R-AC-08 admits an occurred rollback/cleanup state only when it discharges the matching prospective requirement",()=>{
  for(const [state,recoverability] of OCCURRED_RECOVERY){
    const performed=validateCommandOfferEvent(offer({eventId:`${state}-1`,state,executionAssurance:"not-applicable",offerEventId:"offer-origin",recoverability,postEvidenceDigest:"a".repeat(64)}));
    assert.equal(performed.state,state,`${state} must be representable as its own occurred state, not as a recoverability value`);
    assert.equal(performed.recoverability,recoverability);
    assert.equal(Object.isFrozen(performed),true);
    for(const wrong of ["not-applicable","recoverable","rollback-required","cleanup-required"].filter((entry)=>entry!==recoverability))
      assert.throws(()=>validateCommandOfferEvent(offer({eventId:`${state}-2`,state,executionAssurance:"not-applicable",offerEventId:"offer-origin",recoverability:wrong})),(error)=>error instanceof AgentDecisionJournalError&&error.code==="ADJ-COMMAND-OCCURRENCE-SCOPE",`${state} was admitted against a ${wrong} record that never declared the requirement`);
    assert.throws(()=>validateCommandOfferEvent(offer({eventId:`${state}-3`,state,executionAssurance:"observed-completed",offerEventId:"offer-origin",recoverability})),(error)=>error instanceof AgentDecisionJournalError&&error.code==="ADJ-COMMAND-OCCURRENCE-SCOPE",`${state} was allowed to grade the offered command's execution as completed`);
    assert.throws(()=>validateCommandOfferEvent(offer({eventId:`${state}-4`,state,executionAssurance:"not-applicable",recoverability})),(error)=>error instanceof AgentDecisionJournalError&&error.code==="ADJ-COMMAND-LINK",`${state} was admitted with no link to the record it recovers from`);
  }
});
test("R-AC-08 keeps the published command-offer state enum in step with the validator for both occurred recovery states",()=>{
  const schema=JSON.parse(readFileSync(new URL("../../../governance/schemas/agent-decision-event.schema.json",import.meta.url),"utf8"));
  const branch=schema.oneOf.find((entry)=>entry.properties.kind.const==="command-offer");
  for(const [state] of OCCURRED_RECOVERY)assert.equal(branch.properties.state.enum.includes(state),true,`the published schema would reject a valid ${state} event`);
  assert.deepEqual(branch.properties.recoverability.enum,["not-applicable","recoverable","cleanup-required","rollback-required"],"the prospective recoverability category must not have grown an occurred value");
});
