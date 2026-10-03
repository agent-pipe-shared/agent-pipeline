// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createGovernanceScopeController} from '../lib/governance-scope.mjs';
import {registerTestCaseCompletion} from '../lib/test-case-completion.mjs';
import {evaluateLifecycleReadyGuard,isHostOnlyClaudeCaptureInvocation} from './guard-lifecycle-ready.mjs';
const cases=[
 {id:'NCE001',name:'native capture producer commands are denied before ready and pending lifecycle admission',run(){
  const root=mkdtempSync(join(tmpdir(),'native-capture-entry-'));
  try {
   execFileSync('git',['init','-q',root]);
   const controller=createGovernanceScopeController({hostStateRoot:join(root,'.git','fixture-host-state')});
   const plan=controller.planDecision({rootDir:root,decision:'enroll',by:'isolated-native-capture-entry-fixture'});
   assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
   for(const status of ['ready','intake-required'])for(const tool_name of ['Bash','PowerShell'])for(const file of ['claude-task-output-scope-posttool.mjs','claude-intake-prompt-capture.mjs']){
    let observed=0;
    const command=(tool_name==='PowerShell'?"& 'node' ":'node ')+`'${join(root,'plugins/pipeline-core/hooks',file)}'`;
    const result=evaluateLifecycleReadyGuard({tool_name,tool_input:{command},session_id:'fixture-host-session'},
      {projectDir:root,inspectProjectOnboardingV3(){observed+=1;return {status};}});
    assert.equal(result.exitCode,2);assert.match(result.stderr,/GUARD-NATIVE-CAPTURE-HOST-ONLY/u);
    assert.equal(observed,0,'native producer admission must not depend on a ready-state shortcut');
   }
  }finally{rmSync(root,{recursive:true,force:true});}
 }},
 {id:'NCE002',name:'capture entry detection leaves passive source reads and ordinary product scripts unchanged',run(){
  const root=tmpdir();
  assert.equal(isHostOnlyClaudeCaptureInvocation("cat 'hooks/claude-intake-prompt-capture.mjs'",root),false);
  assert.equal(isHostOnlyClaudeCaptureInvocation("node 'src/application.mjs'",root),false);
  assert.equal(isHostOnlyClaudeCaptureInvocation("node --version",root),false);
  assert.equal(isHostOnlyClaudeCaptureInvocation("node 'hooks/claude-intake-prompt-capture.mjs'",root),true);
  assert.equal(isHostOnlyClaudeCaptureInvocation("& 'node.exe' 'hooks/claude-task-output-scope-posttool.mjs'",root,'PowerShell'),true);
 }},
];
registerTestCaseCompletion({cases,fd:3,maxBytes:65536});
