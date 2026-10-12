// SPDX-License-Identifier: SUL-1.0
// Genuine synthetic METHOD DAB/Git/crypto; no native runner or actual PO approval claim.
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import * as fxt from './architecture-prospective-materialization.fixture.mjs';
import {registerTestCaseCompletion} from './test-case-completion.mjs';
import {parseDesignDecisionBindings, prepareApprovedArchitectureMaterialization, readEffectiveDesignArchitectureAuthority} from './design-decision-bindings.mjs';
import {inspectArchitectureDesign, inspectArchitectureMaterializationTargets, publishArchitectureDesignTargets} from './architecture-design.mjs';
import {acquireContinuityLock, releaseContinuityLock} from '../scripts/pipeline-state.mjs';
import {createDesignApprovalRequest} from './design-approval-binding.mjs';
import {canonical} from './po-approval-proof.mjs';
const cases=[];
const test=(id,name,run)=>cases.push({id,name,run});
const json=value=>`${JSON.stringify(value,null,2)}\n`;
const output=(f,name)=>readFileSync(join(f.dir,name));
const noOutputs=f=>f.outputPaths.every(name=>!existsSync(join(f.dir,name)));
const refuse=result=>assert.equal(result.ok,false,JSON.stringify(result));
function edit(f,path,change){const value=JSON.parse(output(f,path));change(value);writeFileSync(join(f.dir,path),json(value));}
function refreshDraftManifest(f){f.descriptor.prospectiveArchitecture.sha256=fxt.hash(output(f,f.descriptor.prospectiveArchitecture.path));fxt.write(f,'specs/e2e/design.md','```pipeline-design-decision-bindings\n'+json(f.descriptor)+'```\n');}
function snapshot(f){return Object.fromEntries(f.outputPaths.filter(name=>existsSync(join(f.dir,name))).map(name=>[name,output(f,name)]));}
function transaction(f,action){const lock=acquireContinuityLock(f.dir,'prospective-method-test');assert(lock.ok,JSON.stringify(lock));try{return action(lock);}finally{releaseContinuityLock(lock);}}
function authority(f,basis){const value=fxt.inspect(f);return value.ok&&value.required&&canonical(value.approvalBasis)===canonical(basis);}

test('APM001','one genuine committed signed DAB activates exact future ADR and preserves all proposed/history bytes',()=>{
  const f=fxt.makeAggregateFixture(),row=f.prospectiveManifest.decisions[0];
  const immutable=[row.proposedMarkdown.path,row.proposedSidecar.path,row.chatSelection.path,row.predecessor.markdown.path];
  const before=immutable.map(name=>output(f,name));assert(noOutputs(f));
  const subset=fxt.owned(f);
  refuse(fxt.ddb.retainApprovedDesignArchitectureReference(subset.handle));
  const prepared=prepareApprovedArchitectureMaterialization(subset.handle);
  assert(prepared.ok&&prepared.required);assert.equal(prepared.targets.at(-1).path,prepared.referencePath);
  fxt.must(f,['materialize-architecture']);
  assert.deepEqual(immutable.map(name=>output(f,name)),before);
  assert.equal(JSON.parse(output(f,row.outputs.sidecar.path)).status,'accepted');
  assert.equal(JSON.parse(output(f,row.predecessor.sidecar.path)).status,'superseded');
  const effective=readEffectiveDesignArchitectureAuthority({rootDir:f.dir});
  assert(effective.ok,JSON.stringify(effective));assert.equal(effective.decisions[0].id,row.id);
  assert.equal(effective.approvalBases[0].intentSha256,f.request.approvalIntent.sha256);
});
test('APM002','selected proposal and presented request create no accepted output before actual approval',()=>{
  const f=fxt.makeAggregateFixture({stage:'presented'});
  assert(fxt.draft(f).ok);assert(noOutputs(f));refuse(fxt.inspect(f));
  assert.notEqual(fxt.invoke(f,['materialize-architecture']).status,0);assert(noOutputs(f));
  refuse(prepareApprovedArchitectureMaterialization({ok:true,handle:{}}));
});
test('APM003','missing or corrupted aggregate proof refuses all activation writes',()=>{
  const f=fxt.makeAggregateFixture();
  edit(f,fxt.stateRelative(f),state=>{state.planApproval.designApproval.proof.signatureBase64='AA==';});
  refuse(fxt.inspect(f));assert.notEqual(fxt.invoke(f,['materialize-architecture']).status,0);assert(noOutputs(f));
});
test('APM004','output digest, traversal path, number and exact source digest drift refuse draft and approval',()=>{
  for(const change of [
    value=>{value.decisions[0].outputs.markdown.sha256='f'.repeat(64);},
    value=>{value.decisions[0].outputs.markdown.path='docs/adr/../escaped.md';},
    value=>{value.decisions[0].id='9999-other-number';},
    value=>{value.decisions[0].proposedMarkdown.sha256='e'.repeat(64);},
  ]){
    const f=fxt.makeAggregateFixture({stage:'presented'});
    edit(f,f.descriptor.prospectiveArchitecture.path,change);
    refreshDraftManifest(f);
    refuse(fxt.draft(f));refuse(fxt.inspect(f));assert(noOutputs(f));
  }
});
test('APM005','manifest must be an actual original candidate blob, not just an ancestor-foreign or uncommitted file',()=>{
  const f=fxt.makeAggregateFixture();
  fxt.git(f,'rm','--cached','--',f.descriptor.prospectiveArchitecture.path);
  fxt.git(f,'commit','-q','-m','test(apm): omit prospective manifest from candidate\n\nAI-Assisted: true');
  const candidate={commit:fxt.git(f,'rev-parse','HEAD'),tree:fxt.git(f,'rev-parse','HEAD^{tree}')};
  const request=createDesignApprovalRequest({binding:f.request.binding,candidate});assert(request.ok);
  fxt.writeJson(f,f.requestPath,request.request);
  edit(f,fxt.stateRelative(f),state=>{
    const proof={schema:'pipeline.po-approval-proof.v1',intentSha256:request.intentSha256,keyReference:f.keyReference,publicKey:f.publicKey,signatureBase64:f.signDigest(request.intentSha256)};
    state.planApproval.designApproval.intentSha256=request.intentSha256;
    state.planApproval.designApproval.proof=proof;state.planApproval.designApproval.proofSha256=fxt.hash(canonical(proof));
  });
  refuse(fxt.inspect(f));assert.notEqual(fxt.invoke(f,['materialize-architecture']).status,0);assert(noOutputs(f));
});
test('APM006','a physical manifest outside the signed companions never becomes a prospective authority',()=>{
  const f=fxt.makeAggregateFixture({stage:'presented'}),sources=fxt.sourceSet(f);
  sources.companions=sources.companions.filter(ref=>ref.path!==f.descriptor.prospectiveArchitecture.path);
  refuse(fxt.ddb.inspectDesignDecisionBindingsDraft({rootDir:f.dir,sources}));assert(noOutputs(f));
});
test('APM007','occupied numbered ADR or target collision preserves foreign bytes and publishes nothing',()=>{
  for(const path of ['docs/adr/9998-unrelated.md','docs/adr/9998-method-egm.json']){
    const f=fxt.makeAggregateFixture();fxt.write(f,path,'foreign immutable record\n');
    assert.notEqual(fxt.invoke(f,['materialize-architecture']).status,0);assert.equal(output(f,path).toString(),'foreign immutable record\n');
    assert.deepEqual(Object.keys(snapshot(f)),f.outputPaths.includes(path)?[path]:[]);
  }
});
test('APM008','historical Markdown and the original chat evidence remain exact bound inputs',()=>{
  for(const input of ['docs/adr/9997-method-original.md','specs/e2e/original-chat-selection.json']){
    const f=fxt.makeAggregateFixture();fxt.write(f,input,Buffer.concat([output(f,input),Buffer.from(' ')]));
    refuse(fxt.inspect(f));assert.notEqual(fxt.invoke(f,['materialize-architecture']).status,0);assert(noOutputs(f));
  }
});
test('APM009','genuine authority rechecks and staged failure roll back newly published targets, without visible retained authority',()=>{
  const f=fxt.makeAggregateFixture(),owned=fxt.owned(f),prepared=prepareApprovedArchitectureMaterialization(owned.handle);
  const result=transaction(f,lock=>{let writes=0;return publishArchitectureDesignTargets({rootDir:f.dir,lock,targets:prepared.targets,
    validateAuthority:()=>authority(f,prepared.approvalBasis),io:{writeFileSync(fd,bytes){if(++writes===4)throw new Error('method-injected-write-failure');writeFileSync(fd,bytes);}}});});
  assert.equal(result.status,'rolled-back');assert(noOutputs(f));assert(!existsSync(join(f.dir,prepared.referencePath)));
  fxt.must(f,['materialize-architecture']);assert.equal(readEffectiveDesignArchitectureAuthority({rootDir:f.dir}).ok,true);
});
test('APM010','a raced create-only target causes rollback while preserving the foreign competing occupant',()=>{
  const f=fxt.makeAggregateFixture(),owned=fxt.owned(f),prepared=prepareApprovedArchitectureMaterialization(owned.handle),collision=prepared.targets[2];
  const result=transaction(f,lock=>{let writes=0;return publishArchitectureDesignTargets({rootDir:f.dir,lock,targets:prepared.targets,
    validateAuthority:()=>authority(f,prepared.approvalBasis),io:{writeFileSync(fd,bytes){writeFileSync(fd,bytes);if(++writes===3)fxt.write(f,collision.path,'foreign race\n');}}});});
  assert.equal(result.status,'rolled-back');assert.equal(output(f,collision.path).toString(),'foreign race\n');assert(!existsSync(join(f.dir,prepared.referencePath)));
});
test('APM011','exact partial delivery is resumable; replay preserves materialized bytes and retained authority',()=>{
  const f=fxt.makeAggregateFixture(),prepared=prepareApprovedArchitectureMaterialization(fxt.owned(f).handle);
  const early=prepared.targets.find(target=>target.path===f.outputPaths[0]);fxt.write(f,early.path,early.bytes);
  fxt.must(f,['materialize-architecture']);const first=snapshot(f);const references=readdirSync(join(f.dir,'project/aggregate-design-architecture-references'));
  fxt.must(f,['materialize-architecture']);assert.deepEqual(snapshot(f),first);assert.deepEqual(readdirSync(join(f.dir,'project/aggregate-design-architecture-references')),references);
});
test('APM012','retained original aggregate proof remains verifiable without the former active feature state; output drift still revokes projection',()=>{
  const f=fxt.makeAggregateFixture();fxt.must(f,['materialize-architecture']);
  // Removal models the absence after close, not a claim that the close lifecycle passed.
  renameSync(join(f.dir,fxt.stateRelative(f)),join(f.dir,'retained-former-state.json'));
  const retained=readEffectiveDesignArchitectureAuthority({rootDir:f.dir});assert(retained.ok,JSON.stringify(retained));assert.equal(retained.decisions.length,1);
  fxt.write(f,f.outputPaths[0],Buffer.concat([output(f,f.outputPaths[0]),Buffer.from(' ')]));
  refuse(readEffectiveDesignArchitectureAuthority({rootDir:f.dir}));
});
test('APM013','existing closed descriptor v1 is retained; prospective fields require the explicit v2 contract',()=>{
  const binding={schema:'pipeline.design-decision-bindings.v1',repositoryFingerprint:'a'.repeat(64),featureId:'legacy',architectureDecisions:[],modelPolicy:null};
  const block=value=>Buffer.from('```pipeline-design-decision-bindings\n'+json(value)+'```\n');
  assert.equal(parseDesignDecisionBindings(block(binding)).schema,binding.schema);
  assert.throws(()=>parseDesignDecisionBindings(block({...binding,prospectiveArchitecture:{path:'specs/manifest.json',sha256:'b'.repeat(64)}})),/DDB-BINDINGS-SHAPE/u);
});
test('APM014','existing v1 accepted-file route still consumes a genuine original signed DAB and materializes its greenfield map',()=>{
  const f=fxt.makeAggregateFixture({legacy:true});assert(fxt.owned(f).required);
  fxt.must(f,['materialize-architecture']);assert.equal(readEffectiveDesignArchitectureAuthority({rootDir:f.dir}).ok,true);
  assert(existsSync(join(f.dir,'architecture/design-materialization.json')));
});
test('APM015','a later namespace reservation blocks pending numbering while later history does not erase materialized proof',()=>{
  const f=fxt.makeAggregateFixture();fxt.write(f,'docs/adr/9999-unrelated.md','# Later record\n');
  assert.equal(fxt.draft(f).code,'DDB-PROSPECTIVE-NUMBER-DRIFT');assert(noOutputs(f));
  const complete=fxt.makeAggregateFixture();fxt.must(complete,['materialize-architecture']);
  fxt.write(complete,'docs/adr/9999-unrelated.md','# Later record\n');
  assert.equal(readEffectiveDesignArchitectureAuthority({rootDir:complete.dir}).ok,true);
});
test('APM016','draft selection projection must preserve the exact original selected topic/text evidence',()=>{
  const f=fxt.makeAggregateFixture({stage:'presented'}),row=f.prospectiveManifest.decisions[0];
  edit(f,row.chatSelection.path,choice=>{choice.selections[0].text='Invented selection';});
  edit(f,f.descriptor.prospectiveArchitecture.path,manifest=>{manifest.decisions[0].chatSelection.sha256=fxt.hash(output(f,row.chatSelection.path));});
  refreshDraftManifest(f);
  // Update all declared input digests, so the semantic origin check is reached.
  const sources=fxt.sourceSet(f);
  assert.equal(fxt.ddb.inspectDesignDecisionBindingsDraft({rootDir:f.dir,sources}).code,'DDB-PROSPECTIVE-SELECTION-ORIGIN-DRIFT');
});
test('APM017','brownfield ADR-only pending activation inventories all exact targets without claiming map adoption',()=>{
  const f=fxt.makeAggregateFixture();
  for(const path of ['architecture/map/index.md','architecture/map/inventory.json'])unlinkSync(join(f.dir,path));
  const inspected=inspectArchitectureDesign(f.dir);assert.equal(inspected.status,'materialization-required');
  assert.equal(inspected.materializationKind,'prospective-adr-only');assert.equal(inspected.scope,null);
  const inventory=inspectArchitectureMaterializationTargets(f.dir);assert(inventory.ok,JSON.stringify(inventory));
  assert(!inventory.targets.some(target=>target.path.startsWith('architecture/')));
  assert.equal(inventory.targets.at(-1).path,inventory.prospective.referencePath);
  fxt.must(f,['materialize-architecture']);assert.equal(inspectArchitectureDesign(f.dir).status,'not-required');
  assert(readEffectiveDesignArchitectureAuthority({rootDir:f.dir}).ok);
});
test('APM018','greenfield exact inventory combines ADR and map publication with retained authority last',()=>{
  const f=fxt.makeAggregateFixture(),inventory=inspectArchitectureMaterializationTargets(f.dir);
  assert(inventory.ok);assert(inventory.targets.some(target=>target.path==='architecture/design-materialization.json'));
  for(const path of f.outputPaths)assert(inventory.targets.some(target=>target.path===path),path);
  assert.equal(inventory.targets.at(-1).path,inventory.prospective.referencePath);
  fxt.must(f,['materialize-architecture']);assert.equal(inspectArchitectureMaterializationTargets(f.dir).targets.length,0);
});
registerTestCaseCompletion({cases,fd:3,maxBytes:8192});
