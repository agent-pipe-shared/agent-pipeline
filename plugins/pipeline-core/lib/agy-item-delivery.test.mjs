// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { devNull } from 'node:os';
import { registerTestCaseCompletion } from './test-case-completion.mjs';
import { inspectSignedDescriptorCustodyRepository } from './worktree-lifecycle.mjs';
import { executeGovernedItemDeliveryChecks } from './native-goldfish-host-state.mjs';
import { bindAgyItemDeliveryChecks, inspectAgyItemMainIntegration } from './agy-item-delivery.mjs';
import { recoverSourceOwnedAgyItemDelivery, cancelSourceOwnedAgyItemDispatch, createAgyFamilyDispatchAuthorityProducerPort, prepareAgyFamilyNativeDispatch } from './agy-session-dispatch.mjs';
import { prepareApprovedItemCourseFixture } from './test-item-approved-course-fixture.mjs';
import { resolveGovernedItemQueue } from './native-goldfish-host-state.mjs';
import { createGovernanceScopeController } from './governance-scope.mjs';
import { createControlledMethodRuntimeFixture, inspectSourceOwnedCurrentAuthorityContext } from './session-requester-bridge.mjs';
import { createSessionAuthorityParticipantPorts } from './session-authority-observers.mjs';
import { initializeSessionAuthorityRegistry, withSessionAuthorityBoundary, inspectSourceOwnedSessionAuthorityProducerRecord, inspectSourceOwnedSessionAuthorityMemberRecord, createSessionAuthorityMethodStageObserver, withSessionAuthorityMethodStages } from './session-authority-registry.mjs';
import { nativeManagedDigest } from './native-managed-authority-support.mjs';
import { createAgyAuthorityJournalOwner } from './agy-host-observed-store.mjs';

async function fixture(run) {
  const parent=new URL('../../../../../fixtures/',import.meta.url).pathname;mkdirSync(parent,{recursive:true,mode:0o700});
  const root=mkdtempSync(join(parent,'agy-item-'));
  const git=(...args)=>execFileSync('git',['-C',root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c',`core.hooksPath=${devNull}`,...args],{encoding:'utf8'}).trim();
  try{
    git('init','-q','-b','main');git('commit','--allow-empty','-qm','base');
    const baseCommit=git('rev-parse','HEAD');
    writeFileSync(join(root,'dependency.txt'),'expected\n');
    writeFileSync(join(root,'unit.test.cjs'),"require('node:test')('criterion',()=>require('node:assert/strict').equal(require('node:fs').readFileSync('dependency.txt','utf8'),'expected\\n'));\n");
    git('add','unit.test.cjs','dependency.txt');git('commit','-qm','delivery');
    const candidate=inspectSignedDescriptorCustodyRepository(root).candidate;
    const itemDelivery={schema:'pipeline.item-delivery-briefing.v1',sliceId:'ITEM-A',itemId:'AC-1',criterionLocator:{schema:'pipeline.critic-criterion-locator.v1',sourcePath:'specs/unit/spec.md',sourceSha256:'a'.repeat(64),criterionId:'AC-1',startByte:1,endByte:20,excerptSha256:'b'.repeat(64)},checks:[{id:'unit',path:'unit.test.cjs',dependencies:['dependency.txt']}]};
    const args={root,itemDelivery,candidate,baseCommit,writeScope:['unit.test.cjs','dependency.txt'],changedPaths:['unit.test.cjs','dependency.txt']};
    return await run({root,git,args,itemDelivery,candidate});
  }finally{rmSync(root,{recursive:true,force:true});}
}
const cases=[
  {id:'AGYID01',name:'real targeted checks bind delivered blobs and Main integration across unrelated HEAD advance',run:()=>fixture(({root,git,args})=>{
    const observed=executeGovernedItemDeliveryChecks(args);assert.equal(observed.evidence.verdict,'passed');
    const delivery=bindAgyItemDeliveryChecks({...args,checkHandle:observed.handle});
    const first=inspectAgyItemMainIntegration({root,handle:delivery.handle});assert.equal(first.mainCommit,args.candidate.commit);
    writeFileSync(join(root,'unrelated.txt'),'other\n');git('add','unrelated.txt');git('commit','-qm','unrelated Main integration');
    const advanced=inspectAgyItemMainIntegration({root,handle:delivery.handle});assert.notEqual(advanced.mainCommit,first.mainCommit);
  })},
  {id:'AGYID02',name:'forged PASS, delivery, empty changes and wrong scope cannot mint integration evidence',run:()=>fixture(({root,args})=>{
    assert.throws(()=>bindAgyItemDeliveryChecks({...args,checkHandle:{passed:true,evidence:{verdict:'passed'}}}),/unowned/);
    assert.throws(()=>inspectAgyItemMainIntegration({root,handle:{integrated:true}}),/DELIVERY-HANDLE/);
    const observed=executeGovernedItemDeliveryChecks(args);
    assert.throws(()=>bindAgyItemDeliveryChecks({...args,checkHandle:observed.handle,changedPaths:[]}),/DELIVERY-SCOPE/);
    assert.throws(()=>bindAgyItemDeliveryChecks({...args,checkHandle:observed.handle,writeScope:['other.txt']}),/DELIVERY-SCOPE/);
  })},
  {id:'AGYID03',name:'failed checks, dependency drift and non Main integration retain ownership',run:()=>fixture(({root,git,args})=>{
    const observed=executeGovernedItemDeliveryChecks(args),delivery=bindAgyItemDeliveryChecks({...args,checkHandle:observed.handle});
    git('checkout','-qb','feature');assert.throws(()=>inspectAgyItemMainIntegration({root,handle:delivery.handle}),/MAIN-REQUIRED/);git('checkout','-q','main');
    writeFileSync(join(root,'dependency.txt'),'regression\n');git('add','dependency.txt');git('commit','-qm','regression');
    assert.throws(()=>inspectAgyItemMainIntegration({root,handle:delivery.handle}),/DEPENDENCY-DRIFT/);
    const candidate=inspectSignedDescriptorCustodyRepository(root).candidate,failed=executeGovernedItemDeliveryChecks({...args,candidate});
    assert.equal(failed.evidence.verdict,'failed');assert.throws(()=>bindAgyItemDeliveryChecks({...args,candidate,checkHandle:failed.handle}),/TARGETED-CHECKS-FAILED/);
  })},
  {id:'AGYID04',name:'a seeded durable delivery checkpoint recovers its real Source member and release; replay and forged cancellation retain',run:()=>fixture(async({root,args})=>{
    // This is a durable-checkpoint recovery fixture, not native AGY execution
    // qualification. Genuine check processes and Source registry operations run.
    const checks=executeGovernedItemDeliveryChecks(args),delivery=bindAgyItemDeliveryChecks({...args,checkHandle:checks.handle});
    const repository=inspectSignedDescriptorCustodyRepository(root);
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});
    const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'controlled fixture explicit selection'});controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256});
    mkdirSync(join(root,'.claude'));
    writeFileSync(join(root,'.claude/pipeline.yaml'),'schema: pipeline.manifest.v0\n');
    const ref=path=>({path,sha256:'a'.repeat(64)});
    const continuity={schema:'pipeline.continuity.v0',featureId:'unit',revision:0,runtime:{humanFacingLanguage:'en',activeDuty:'Coordinator',sessionCleanup:null},authority:{prd:ref('specs/unit/prd.md'),spec:ref('specs/unit/spec.md'),result:ref('specs/unit/result.md')},queueHead:{packageId:'unit-package',actionId:'item-admission',nextAction:'dispatch',productRetryCount:0,environmentRerouteCount:0,dispatch:null},blocker:null,acknowledgedFinal:null,resume:{mode:'immediate',sourceRevision:0,reasonCode:'active-turn'},recovery:null,decisionTxn:null,closeTransition:null,capacity:{concurrencyLimit:3,reservedCriticSlots:1,reservedRecoverySlots:1,fallbackPolicy:'defer'}};
    writeFileSync(join(root,'.claude/pipeline-state.json'),JSON.stringify({schema:'pipeline.state.v0',activeFeature:{id:'unit',planPath:'specs/unit/plan.md',phase:'implementation'},planApproved:true,continuity}),{mode:0o600});
    const runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/agy-delivery'),sessionId:'agy-delivery-owner'});
    const requester=runtime.run(()=>inspectSourceOwnedCurrentAuthorityContext({repository}));
    const basis={association:{state:'bound',target:{sessionId:requester.currentRequester.sessionId,descriptorSha256:requester.currentRequester.descriptorSha256,ownerNonceSha256:requester.currentRequester.ownerNonceSha256}},candidate:repository.candidate,itemDelivery:{itemId:args.itemDelivery.itemId,sliceId:args.itemDelivery.sliceId,queuePath:'specs/unit/slice-queue.json',queueSha256:'c'.repeat(64),writeScope:args.writeScope},controllerIdentity:requester.controllerIdentity,sourceRef:requester.sourceRef,invocationBindingSha256:requester.invocationBindingSha256,assurance:requester.assurance};
    const directory=join(repository.commonDir,'agent-pipeline/run/agy-authority-contexts');mkdirSync(directory,{recursive:true,mode:0o700});
    const value={schema:'pipeline.agy-authority-lifetime.v2',producerId:'agy-family-dispatch',repositorySha256:nativeManagedDigest({primaryRoot:repository.primaryRoot,commonDir:repository.commonDir}),operationId:'d'.repeat(32),basis,bindingSha256:nativeManagedDigest(basis),phase:'running',revision:2,terminal:null,terminalEvidence:{schema:'pipeline.agy-item-delivery-checkpoint.v1',ownerContextState:'source-invalidated',delivery:delivery.value},sourcePaths:[]};
    writeFileSync(join(directory,`op.${value.operationId}.2.2.json`),JSON.stringify(value),{mode:0o600});
    const ports=createSessionAuthorityParticipantPorts({repository});assert.equal(initializeSessionAuthorityRegistry({repository},ports).status,'initialized');
    const port=createAgyFamilyDispatchAuthorityProducerPort({repository});
    const memberRef=withSessionAuthorityBoundary({repository},boundary=>inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:port}).record.members[0].memberRef);
    const interrupted=createSessionAuthorityMethodStageObserver({onStage:({stage})=>{if(stage==='after-terminal-readback-before-release')throw new Error('controlled fixture interruption after genuine Source terminal');}});
    const first=runtime.run(()=>withSessionAuthorityMethodStages({observer:interrupted},()=>recoverSourceOwnedAgyItemDelivery({root,memberRef})));assert.equal(first.ok,false);
    const retained=withSessionAuthorityBoundary({repository},boundary=>{const p=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:port});return inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort:port,memberRef:p.record.members[0].memberRef});});
    assert.equal(retained.record.phase,'terminal-observed');assert.equal(retained.releaseRef,null);
    const recovered=runtime.run(()=>recoverSourceOwnedAgyItemDelivery({root,memberRef:retained.memberRef}));assert.equal(recovered.status,'integrated',JSON.stringify(recovered));assert.ok(recovered.releaseRef);
    const current=withSessionAuthorityBoundary({repository},boundary=>{const producer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:port});return inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort:port,memberRef:producer.record.members[0].memberRef});});
    assert.equal(current.record.phase,'released');assert.equal(current.releaseRecord.terminal,'completed');
    assert.equal(runtime.run(()=>recoverSourceOwnedAgyItemDelivery({root,memberRef})).ok,false);
    assert.equal((await cancelSourceOwnedAgyItemDispatch({context:{stopped:true}})).ok,false);
  })},
  {id:'AGYID05',name:'actual original chat approval auto prepares AGY item queue and holds genuine admission when native model is unavailable',run:()=>fixture(async({root,args})=>{
    const controller=createGovernanceScopeController({hostStateRoot:join(root,'fixture-host')});
    const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'controlled fixture explicit selection'});controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256});
    const course=prepareApprovedItemCourseFixture({root});assert.equal(course.approval.status,'eligible');
    const repository=inspectSignedDescriptorCustodyRepository(root);
    const runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/agy-course'),sessionId:'agy-course-owner'});
    const ports=createSessionAuthorityParticipantPorts({repository});assert.equal(initializeSessionAuthorityRegistry({repository},ports).status,'initialized');
    const requester=runtime.run(()=>inspectSourceOwnedCurrentAuthorityContext({repository}));
    const itemDelivery={...args.itemDelivery,criterionLocator:course.criterionLocator,checks:[{id:'unit',path:'src/change.test.mjs',dependencies:['src/change.mjs']}]};
    const packet={role:'pipeline-core:goldfish-implementor',dispatchId:'ITEM-A',candidate:repository.candidate,prompt:'Goldfish briefing\nSlice: ITEM-A\nWrite scope: src/change.mjs\n',requiredPaths:['src/change.mjs']};
    const prepared=await runtime.run(()=>prepareAgyFamilyNativeDispatch({root,packet,itemDelivery,sessionId:requester.currentRequester.sessionId,descriptorSha256:requester.currentRequester.descriptorSha256,resultPath:'results/course.json'}));
    assert.equal(prepared.ok,false,'unavailable native model cannot be reported ready');
    const queue=resolveGovernedItemQueue({root});assert.equal(queue.status,'required',JSON.stringify(prepared));assert.equal(queue.normalized.slices[0].delivery.itemId,'AC-1');
    const port=createAgyFamilyDispatchAuthorityProducerPort({repository});
    const member=withSessionAuthorityBoundary({repository},boundary=>{const p=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:port});return inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort:port,memberRef:p.record.members[0].memberRef});});
    assert.equal(member.record.phase,'armed');assert.equal(member.releaseRef,null);
    assert.equal((await cancelSourceOwnedAgyItemDispatch({context:prepared.context})).ok,false,'uncertain preparation has no fabricated cancellation witness');
    const alias={...itemDelivery,itemId:'AC-1-ALIAS',sliceId:'ITEM-ALIAS',checks:[{id:'alias',path:'unit.test.cjs',dependencies:['dependency.txt']}]};
    const aliasPacket={...packet,dispatchId:'ITEM-ALIAS',requiredPaths:['dependency.txt'],prompt:packet.prompt.replaceAll('ITEM-A','ITEM-ALIAS').replace('src/change.mjs','dependency.txt')};
    const collided=await runtime.run(()=>prepareAgyFamilyNativeDispatch({root,packet:aliasPacket,itemDelivery:alias,sessionId:requester.currentRequester.sessionId,descriptorSha256:requester.currentRequester.descriptorSha256,resultPath:'results/alias.json'}));
    assert.equal(collided.code,'AGY-ITEM-CRITERION-OWNER-COLLISION','a caller alias of the same approved criterion cannot acquire another owner');

  })},
  {id:'AGYID06',name:'consent journal physical identity survives actual HEAD advance and candidate-bound v1 stays closed',run:()=>fixture(({root,git})=>{
    const repository=inspectSignedDescriptorCustodyRepository(root),directory=join(repository.commonDir,'agent-pipeline/run/agy-session-consent');mkdirSync(directory,{recursive:true,mode:0o700});
    const basis={association:{state:'unbound',target:null},candidate:repository.candidate};
    const value={schema:'pipeline.agy-authority-lifetime.v2',producerId:'agy-session-consent',repositorySha256:nativeManagedDigest({primaryRoot:repository.primaryRoot,commonDir:repository.commonDir}),operationId:'e'.repeat(32),basis,bindingSha256:nativeManagedDigest(basis),phase:'armed',revision:1,terminal:null,terminalEvidence:null,sourcePaths:[]};
    const file=join(directory,`op.${value.operationId}.1.1.json`);writeFileSync(file,JSON.stringify(value),{mode:0o600});
    const owner=createAgyAuthorityJournalOwner({repository,namespaceIds:['agy-session-consent','agy-session-consent-revocations'],journalNamespace:'agy-session-consent',producerId:'agy-session-consent',kinds:['armed-capability'],classifyLegacy:()=>null});
    const first=owner.port.readBaseline();assert.equal(first.legacyOperations.length,1);git('commit','--allow-empty','-qm','advance Main');assert.equal(owner.port.observeOperation(first.legacyOperations[0]).phase,'armed');
    rmSync(file);delete value.revision;value.schema='pipeline.agy-authority-lifetime.v1';value.repositorySha256=nativeManagedDigest(repository);writeFileSync(join(directory,`op.${value.operationId}.1.json`),JSON.stringify(value),{mode:0o600});
    assert.throws(()=>owner.port.readBaseline(),/AGY-AUTHORITY-JOURNAL/);
  })},
];
registerTestCaseCompletion({cases,fd:3,maxBytes:64*1024});
