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
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  ],sanitizedReceipt:{allowEventId:true,allowEventDigest:true,allowCheckpoint:true,allowReasonText:false}};
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

// PHX-WP-A2 pins six of the seven remaining zero-coverage A-AC-14 named
// scenarios (excluding "decomposition", confirmed not representable: no
// "decomposition" value exists in `kind`, `state`, or any command-offer
// enum anywhere in agent-decision-journal.mjs). "tampering" also stays
// gapped here: pinning it correctly requires confirming exactly which
// digest fields the store recomputes on read, which is store-generic
// verification machinery out of this file's budget, not a schema-shape
// question the other six scenarios below are. unverified-assumptions,
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
