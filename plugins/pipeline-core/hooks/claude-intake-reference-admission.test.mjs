// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {registerTestCaseCompletion} from '../lib/test-case-completion.mjs';
import {automatedMutatingApplyArgv} from '../lib/onboarding-argv-shapes.mjs';
import {isSanctionedLifecycleCommand} from './guard-lifecycle-ready.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)).replace(/\/$/u,'');
const script=fileURLToPath(new URL('../scripts/project-onboarding-v3.mjs',import.meta.url));
const quote=value=>"'"+value.replaceAll("'","'\"'\"'")+"'";
const command=argv=>['node',script,...argv].map(quote).join(' ');
const references=[
 {schema:'pipeline.claude-intake-prompt-reference.v1',captureId:'a'.repeat(48),sessionId:'fixture-session',transcriptPathSha256:'b'.repeat(64),promptSha256:'c'.repeat(64),byteLength:123},
 {schema:'pipeline.claude-initial-prompt-reference.v1',pointerId:'a'.repeat(48),sessionId:'fixture-session',promptId:'1b6f7cef-6cf2-42f2-a689-36fb82f18b62',promptSha256:'c'.repeat(64),byteLength:123},
];
const argv=reference=>automatedMutatingApplyArgv('intake-capture-apply',root,{'--text-turn-ref':JSON.stringify(reference)});
registerTestCaseCompletion({cases:[
 {id:'CIR001',name:'both closed native references follow the actual shared argv shape into lifecycle admission',run(){
  for(const reference of references){
   const args=argv(reference);assert.equal(args.includes('--activate'),true);
   assert.equal(isSanctionedLifecycleCommand(command(args),root),true);
  }
  const file=automatedMutatingApplyArgv('intake-capture-apply',root,{'--text-file':'scratch/intake.md','--text-file-sha256':'d'.repeat(64)});
  assert.equal(isSanctionedLifecycleCommand(command(file),root),true);
 }},
 {id:'CIR002',name:'native reference admission refuses arbitrary paths, malformed digests, extra flags and premature consent reference',run(){
  for(const reference of references){
   for(const changed of [{...reference,path:'../../host.jsonl'},{...reference,promptSha256:'bad'},{...reference,byteLength:1000001},{...reference,sessionId:'../foreign'}]){
    assert.equal(isSanctionedLifecycleCommand(command(argv(changed)),root),false);
   }
   assert.equal(isSanctionedLifecycleCommand(command([...argv(reference),'--unexpected','yes']),root),false);
   assert.equal(isSanctionedLifecycleCommand(command(['intake-consent-apply','--root',root,'--granted','--text-turn-ref',JSON.stringify(reference),'--activate']),root),false);
  }
 }},
],fd:3,maxBytes:65536});
