// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {registerTestCaseCompletion} from '../lib/test-case-completion.mjs';
import {publishRuntimeNextAction,readRuntimeNextAction} from '../lib/runtime-handover-projection.mjs';
import {run,readState,statePhaseProjectionMarker} from './pipeline-state.mjs';
import {checkStatePhaseConsistency} from './check-state-phase-consistency.mjs';
const cases=[
 {id:'RHW001',name:'real Git lifecycle writer projects live state without rewriting staged handover',run(){
  const root=mkdtempSync(join(tmpdir(),'handover-writer-'));
  try {
   execFileSync('git',['init','-q',root]);mkdirSync(join(root,'docs'));mkdirSync(join(root,'project'));
   const handover='# Project state\n\n## Next action\n\nCommitted snapshot; inspect for current action.\n';
   writeFileSync(join(root,'docs/state.md'),handover);
   writeFileSync(join(root,'project/pipeline.json'),JSON.stringify({project:'handover-fixture',verify:null,handover:'docs/state.md'}));
   execFileSync('git',['-C',root,'add','docs/state.md']);
   const index=execFileSync('git',['-C',root,'diff','--cached','--binary']);
   assert.equal(run(['set-feature','--id','handover-fixture','--plan-path','specs/handover/prd.md'],{dir:root}),0);
   const observed=readState(root);assert.equal(observed.status,'ok');
   const projection=readRuntimeNextAction({rootDir:root,state:observed.state});
   assert.equal(projection.status,'available');assert.ok(projection.sectionText.includes(statePhaseProjectionMarker(observed.state)));
   assert.equal(readFileSync(join(root,'docs/state.md'),'utf8'),handover);
   assert.deepEqual(execFileSync('git',['-C',root,'diff','--cached','--binary']),index);
   const checked=checkStatePhaseConsistency({rootDir:root});
   assert.equal(checked.status,'consistent');assert.equal(checked.projection,'private-current-state');
  }finally{rmSync(root,{recursive:true,force:true});}
 }},
 {id:'RHW002',name:'private projection is bound to canonical current state and cannot hide a changed lifecycle',run(){
  const root=mkdtempSync(join(tmpdir(),'handover-stale-'));
  try {
   execFileSync('git',['init','-q',root]);mkdirSync(join(root,'docs'));
   const oldState={activeFeature:{id:'fixture',phase:'design'},planApproved:false};
   writeFileSync(join(root,'docs/state.md'),statePhaseProjectionMarker(oldState)+'\n');
   assert.equal(publishRuntimeNextAction({rootDir:root,state:oldState,sectionText:statePhaseProjectionMarker(oldState)+'\n'}).status,'projected');
   const state={...oldState,activeFeature:{...oldState.activeFeature,phase:'implementation'},planApproved:true};
   assert.equal(checkStatePhaseConsistency({rootDir:root},{readState:()=>({status:'ok',state})}).status,'blocked');
   assert.equal(publishRuntimeNextAction({rootDir:root,state,sectionText:statePhaseProjectionMarker(state)+'\n'}).status,'projected');
   assert.equal(checkStatePhaseConsistency({rootDir:root},{readState:()=>({status:'ok',state})}).status,'consistent');
   assert.equal(publishRuntimeNextAction({rootDir:root,state,sectionText:statePhaseProjectionMarker(oldState)+'\n'}).status,'projected');
   assert.equal(checkStatePhaseConsistency({rootDir:root},{readState:()=>({status:'ok',state})}).status,'blocked');
  }finally{rmSync(root,{recursive:true,force:true});}
 }},
];
registerTestCaseCompletion({cases,fd:3,maxBytes:65536});
