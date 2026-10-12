// SPDX-License-Identifier: SUL-1.0
// Actual Source-owned companion bridge, controlled METHOD only; no native-host or real PO claim.
import assert from 'node:assert/strict';
import {existsSync,readFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import * as fxt from './architecture-prospective-materialization.fixture.mjs';
import {inspectArchitectureMaterializationTargets} from './architecture-design.mjs';
import {inspectSignedDescriptorCustodyRepository} from './worktree-lifecycle.mjs';
import {createControlledMethodRuntimeFixture} from './session-requester-bridge.mjs';
import {createSessionAuthorityParticipantPorts} from './session-authority-observers.mjs';
import {observeSessionCleanupState} from './onboarding-continuity.mjs';
import * as reg from './session-authority-registry.mjs';
import {registerTestCaseCompletion} from './test-case-completion.mjs';
const cases=[];
const add=(id,name,run)=>cases.push({id,name,run});
const member=f=>{const bytes=readFileSync(join(f.repository.commonDir,f.memberPath.slice(5)));return {path:f.memberPath,sha256:fxt.hash(bytes),size:bytes.length};};
async function owner(brownfield=false){
 const f=fxt.makeAggregateFixture();
 if(brownfield)for(const path of ['architecture/map/index.md','architecture/map/inventory.json'])unlinkSync(join(f.dir,path));
 f.repository=inspectSignedDescriptorCustodyRepository(f.dir);
 f.runtime=createControlledMethodRuntimeFixture({repository:f.repository,fixtureRoot:join(f.repository.commonDir,'agent-pipeline/controlled-method-fixtures/prospective-materialization'),sessionId:'prospective-materialization'});
 const ports=createSessionAuthorityParticipantPorts({repository:f.repository});
 assert.equal(reg.initializeSessionAuthorityRegistry({repository:f.repository},ports).status,'initialized');
 f.port=ports.find(row=>row.producerId==='onboarding-continuity').port;
 await f.runtime.run(async()=>{
  const state=observeSessionCleanupState(f.dir);
  const prepared=f.port.prepareOperation({requesterHandle:f.runtime.requesterHandle,entry:'bind',input:{expectedStateSha256:state.stateSha256,expectedRevision:state.revision}});
  assert.equal(prepared.status,'prepared',JSON.stringify(prepared));
  const observed=f.port.observeOperation(prepared.operationHandle);
  const reserved=reg.withSessionAuthorityBoundary({repository:f.repository},boundary=>reg.reserveSessionAuthorityMember({boundary,producerPort:f.port,association:observed.association,operationHandle:prepared.operationHandle}));
  const executed=await f.port.executeOperation({operationHandle:prepared.operationHandle,memberHandle:reserved.memberHandle,expectedMemberRef:reserved.memberRef});
  assert.equal(executed.status,'executed',JSON.stringify(executed));
  Object.assign(f,{operationHandle:prepared.operationHandle,executionHandle:executed.executionHandle,memberHandle:reserved.memberHandle,memberPath:reserved.memberRef.path});
 });return f;
}
const request=f=>({operationHandle:f.operationHandle,executionHandle:f.executionHandle,expectedMemberRef:member(f),expectedStateSha256:fxt.hash(fxt.rawState(f)),entry:'materialize-architecture',argv:['materialize-architecture']});
async function invoke(f,input){return f.runtime.run(()=>f.port.executeCompanionOperation(input));}
async function release(f){
 await f.runtime.run(async()=>{
  const observed=observeSessionCleanupState(f.dir);
  const terminal=await f.port.finishOperation({operationHandle:f.operationHandle,executionHandle:f.executionHandle,entry:'release',input:{expectedStateSha256:observed.stateSha256,expectedRevision:observed.revision},expectedMemberRef:member(f)});
  assert.equal(terminal.status,'observed',JSON.stringify(terminal));
  reg.withSessionAuthorityBoundary({repository:f.repository},boundary=>reg.releaseSessionAuthorityMember({boundary,producerPort:f.port,memberHandle:f.memberHandle,expectedMemberRef:member(f),terminalHandle:terminal.terminalHandle}));
 });await f.runtime.dispose();
}
for(const [id,brownfield] of [['APMC001',false],['APMC002',true]])add(id,`${brownfield?'brownfield ADR-only':'greenfield map and ADR'} Source companion inventories, seals and reads back all exact manifest targets`,async()=>{
 const f=await owner(brownfield),inventory=inspectArchitectureMaterializationTargets(f.dir);
 assert(inventory.ok);assert.equal(inventory.targets.at(-1).path,inventory.prospective.referencePath);
 assert.equal(inventory.targets.some(target=>target.path==='architecture/design-materialization.json'),!brownfield);
 const result=await invoke(f,request(f));assert.equal(result.status,'completed',JSON.stringify(result));assert.equal(result.exitCode,0);
 assert.equal(result.assurance,'controlled-unit-method');
 for(const target of inventory.targets)assert.deepEqual(readFileSync(join(f.dir,target.path)),Buffer.from(target.bytes),target.path);
 assert.equal(inspectArchitectureMaterializationTargets(f.dir).targets.length,0);
 const replay=await invoke(f,request(f));assert.equal(replay.status,'completed',JSON.stringify(replay));assert.equal(replay.exitCode,0);
 for(const target of inventory.targets)assert.deepEqual(readFileSync(join(f.dir,target.path)),Buffer.from(target.bytes));
 await release(f);
});
add('APMC003','actual Source companion rejects stale and unowned requests before any accepted publication',async()=>{
 const f=await owner(),before=fxt.rawState(f),ref=member(f);
 for(const input of [{...request(f),expectedStateSha256:'0'.repeat(64)},{...request(f),operationHandle:Object.freeze({})}]){
  const result=await invoke(f,input);assert.equal(result.status,'unavailable');assert.equal(result.attempted,false);assert.equal(result.exitCode,null);
  assert.deepEqual(fxt.rawState(f),before);assert.deepEqual(member(f),ref);
  assert(f.outputPaths.every(path=>!existsSync(join(f.dir,path))));
 }
 await release(f);
});
registerTestCaseCompletion({cases,fd:3,maxBytes:8192});
