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
