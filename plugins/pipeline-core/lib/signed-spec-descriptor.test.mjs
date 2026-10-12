// SPDX-License-Identifier: SUL-1.0
// Genuine synthetic Source METHOD; no real human approval or native-host claim.
import assert from 'node:assert/strict';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import * as fxt from './architecture-prospective-materialization.fixture.mjs';
import {inspectArchitectureDesign, publishArchitectureDesignTargets} from './architecture-design.mjs';
import {prepareApprovedArchitectureMaterialization, readEffectiveDesignArchitectureAuthority} from './design-decision-bindings.mjs';
import {acquireContinuityLock, releaseContinuityLock} from '../scripts/pipeline-state.mjs';
import {registerTestCaseCompletion} from './test-case-completion.mjs';
const cases=[];
const test=(id,name,run)=>cases.push({id,name,run});
const noOutputs=f=>f.outputPaths.every(path=>!existsSync(join(f.dir,path)));
const block=f=>'\n```pipeline-design-decision-bindings\n'+JSON.stringify(f.descriptor)+'\n```\n';
const append=(f,path,text)=>fxt.write(f,path,Buffer.concat([fxt.bytes(f,path),Buffer.from(text)]));

test('SSD001','one genuinely signed Spec descriptor requires exact prospective ADR materialization via canonical state writer',()=>{
  const f=fxt.makeAggregateFixture({descriptorCarrier:'spec'}), row=f.prospectiveManifest.decisions[0];
  const signed=[fxt.PLAN,fxt.SPEC,...f.request.binding.sources.companions.map(ref=>ref.path)];
  const before=signed.map(path=>fxt.bytes(f,path));
  assert.equal(fxt.state(f).planApproval.schema,'pipeline.plan-approval.v9');
  assert.equal(inspectArchitectureDesign(f.dir).status,'materialization-required');
  const approved=fxt.owned(f);assert.equal(approved.approvalBasis.intentSha256,f.request.approvalIntent.sha256);
  const prepared=prepareApprovedArchitectureMaterialization(approved.handle);assert(prepared.ok&&prepared.required);
  fxt.must(f,['materialize-architecture']);
  for (const target of prepared.inventoryTargets) assert.deepEqual(fxt.bytes(f,target.path),Buffer.from(target.bytes));
  assert.equal(fxt.json(f,row.outputs.sidecar.path).status,'accepted');
  assert.equal(readEffectiveDesignArchitectureAuthority({rootDir:f.dir}).ok,true);
  assert.deepEqual(signed.map(path=>fxt.bytes(f,path)),before);
  fxt.assertPrivateState(f,f.initialState);
});
test('SSD002','Spec-carried signed authority rolls back staged publication and retries through canonical writer',()=>{
  const f=fxt.makeAggregateFixture({descriptorCarrier:'spec'}), owned=fxt.owned(f);
  const prepared=prepareApprovedArchitectureMaterialization(owned.handle), lock=acquireContinuityLock(f.dir,'signed-spec-rollback');
  assert(lock.ok);let result;
  try {let writes=0;result=publishArchitectureDesignTargets({rootDir:f.dir,lock,targets:prepared.targets,
    validateAuthority:()=>{const value=fxt.inspect(f);return value.ok&&value.required&&value.approvalBasis.intentSha256===prepared.approvalBasis.intentSha256;},
    io:{writeFileSync(fd,bytes){if(++writes===4)throw new Error('signed-spec-injected-failure');writeFileSync(fd,bytes);}}});}
  finally {releaseContinuityLock(lock);}
  assert.equal(result.status,'rolled-back');assert(noOutputs(f));assert(!existsSync(join(f.dir,prepared.referencePath)));
  fxt.assertPrivateState(f,f.initialState);fxt.must(f,['materialize-architecture']);
  assert.equal(readEffectiveDesignArchitectureAuthority({rootDir:f.dir}).ok,true);
});
test('SSD003','one genuinely signed PRD descriptor retains materialization behavior',()=>{
  const f=fxt.makeAggregateFixture({descriptorCarrier:'prd'});assert(fxt.owned(f).required);
  fxt.must(f,['materialize-architecture']);assert.equal(readEffectiveDesignArchitectureAuthority({rootDir:f.dir}).ok,true);
});
test('SSD004','Spec plus PRD or companion descriptor is ambiguous and cannot activate',()=>{
  for(const second of [fxt.PLAN,'specs/e2e/design.md']){
    const f=fxt.makeAggregateFixture({stage:'presented',descriptorCarrier:'spec'});append(f,second,block(f));
    assert.equal(fxt.draft(f).code,'DDB-DESCRIPTOR-AMBIGUOUS');
    assert.equal(fxt.inspect(f).ok,false);assert.notEqual(fxt.invoke(f,['materialize-architecture']).status,0);assert(noOutputs(f));
  }
});
test('SSD005','malformed Spec descriptor is refused even beside a valid companion descriptor',()=>{
  const f=fxt.makeAggregateFixture({stage:'presented'});append(f,fxt.SPEC,'\n```pipeline-design-decision-bindings\n{malformed}\n```\n');
  const result=fxt.draft(f);assert.equal(result.ok,false);assert.notEqual(result.code,'DDB-DESCRIPTOR-AMBIGUOUS');
  assert.equal(fxt.inspect(f).ok,false);assert(noOutputs(f));
});
test('SSD006','signed Spec source drift and corrupted signed proof still refuse all activation writes',()=>{
  for(const change of [f=>append(f,fxt.SPEC,' '),f=>{
    const path=fxt.stateRelative(f),state=fxt.json(f,path);state.planApproval.designApproval.proof.signatureBase64='AA==';fxt.writeJson(f,path,state);
  }]){
    const f=fxt.makeAggregateFixture({descriptorCarrier:'spec'});change(f);
    assert.equal(fxt.inspect(f).ok,false);assert.notEqual(fxt.invoke(f,['materialize-architecture']).status,0);assert(noOutputs(f));
  }
});
registerTestCaseCompletion({cases,fd:3,maxBytes:8192});
