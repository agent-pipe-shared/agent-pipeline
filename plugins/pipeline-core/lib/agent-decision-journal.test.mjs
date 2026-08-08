// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict"; import test from "node:test"; import { AgentDecisionJournalError, validateAgentDecisionEvent, validateCommandOfferEvent } from "./agent-decision-journal.mjs";
const value=(overrides={})=>({eventId:"agent-1",kind:"assumption",state:"declared",reasonCode:"EVIDENCE_UNAVAILABLE",candidateDigest:"a".repeat(64),relatedHumanDecisionId:null,supersedesEventId:null,...overrides});
test("accepts a bounded observational agent assumption",()=>assert.equal(Object.isFrozen(validateAgentDecisionEvent(value())),true));
test("rejects free text, authority-shaped fields, and unbound supersession",()=>{for(const entry of [{...value(),reasonCode:"reason text"},{...value(),approval:true},value({state:"superseded"})])assert.throws(()=>validateAgentDecisionEvent(entry),(error)=>error instanceof AgentDecisionJournalError);});
const offer=(overrides={})=>({eventId:"offer-1",kind:"command-offer",state:"offered",reasonCode:"EXTERNAL_OPERATION_OFFERED",candidateDigest:"a".repeat(64),relatedHumanDecisionId:null,supersedesEventId:null,offerOrigin:"pipeline-initiated",operation:{operationClass:"governed-repair",version:"v1",governedArtifactSha256:"b".repeat(64)},target:{repositoryFingerprint:"c".repeat(64),scopeDigest:"d".repeat(64)},sideEffectClass:"non-authoritative",authorityRequirement:"not-required",policyDigest:"e".repeat(64),redactionPolicyDigest:"f".repeat(64),executionAssurance:"not-applicable",omissions:["raw-command","arguments","private-coordinates","unrestricted-output"],offerEventId:null,preEvidenceDigest:null,postEvidenceDigest:null,recoverability:"not-applicable",...overrides});
test("accepts a closed command-offer journal event while preserving raw command omissions",()=>assert.equal(validateCommandOfferEvent(offer()).kind,"command-offer"));
test("rejects command text, omitted privacy omissions, and authority-required offers without a decision",()=>{for(const entry of [{...offer(),command:"rm -rf"},{...offer(),omissions:["raw-command"]},offer({sideEffectClass:"guard-bypass",authorityRequirement:"human-decision-required"})])assert.throws(()=>validateAgentDecisionEvent(entry),(error)=>error instanceof AgentDecisionJournalError);});
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
  for(const entry of schema.oneOf)assert.equal(entry.additionalProperties,false,"a journal event shape stopped being closed");
});
