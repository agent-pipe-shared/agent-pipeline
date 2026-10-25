// SPDX-License-Identifier: SUL-1.0
// METHOD fixtures: actual Source transports, no discard execution or native attestation.
import '../po-discard-fixture-isolation.fixture.mjs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {after} from 'node:test';
import {registerTestCaseCompletion} from '../test-case-completion.mjs';
const self=fileURLToPath(import.meta.url),source=resolve(dirname(self),'../../../..');
const cli=join(source,'plugins/pipeline-core/scripts/pipeline-state.mjs');
const hooks=join(source,'plugins/pipeline-core/hooks');
if(process.argv[2]==='--worker'){
  const request=JSON.parse(process.argv[3]);
  if(request.enroll){
    const {createGovernanceScopeController}=await import('../governance-scope.mjs');
    const controller=createGovernanceScopeController();
    const plan=controller.planDecision({rootDir:request.root,decision:'enroll',by:'synthetic-method-owner'});
    assert.equal(controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256}).state,'active');
  }else{
    const {evaluateLifecycleReadyGuard}=await import('./evaluate.mjs');
    const result=evaluateLifecycleReadyGuard({tool_name:'Bash',tool_input:{command:request.command}},
      {projectDir:request.root,requireProjectOnboardingReadyFn:()=>({schema:'pipeline.project-onboarding-ready-gate.v1',status:'ready',intent:'session'}),
       recordHumanGuardDenialFn:()=>({status:'ineligible'})});
    process.stdout.write(JSON.stringify(result));
  }
  process.exit(0);
}
const parent=join(source,'scratch/podb');mkdirSync(parent,{recursive:true,mode:0o700});
const area=mkdtempSync(join(parent,'run-')),root=join(area,'repo'),home=join(area,'home');
for(const dir of [root,home])mkdirSync(dir,{mode:0o700});
writeFileSync(join(root,'pipeline.user.yaml'),'schema: pipeline.user.v1\ngates:\n  human_approval: chat\n');
const env={PATH:process.env.PATH,HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:join(home,'config'),XDG_STATE_HOME:join(home,'state'),
  GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:join(home,'gitconfig'),CLAUDE_PROJECT_DIR:root};
function launch(script,args=[],input){const result=spawnSync(process.execPath,['--import',join(dirname(self),'../po-discard-fixture-isolation.fixture.mjs'),script,...args],{cwd:root,env,input:input===undefined?undefined:JSON.stringify(input),encoding:'utf8',timeout:60000,maxBuffer:1048576});assert.equal(result.error,undefined,result.error?.message);assert.equal(result.signal,null);return result;}
assert.equal(spawnSync('git',['init','-q',root],{cwd:root,env,encoding:'utf8'}).status,0);
assert.equal(launch(self,['--worker',JSON.stringify({root,enroll:true})]).status,0);
after(()=>rmSync(area,{recursive:true,force:true}));
const cases=[];function test(id,name,run){cases.push({id,name,run});}
const render=argv=>argv.map(value=>JSON.stringify(value)).join(' ');
const discard=render([process.execPath,cli,'discard-feature','--by','synthetic-po','--reason','synthetic abandonment']);
function checkReason(text){assert.match(text,/PO-DISCARD-HUMAN-ONLY/);assert.match(text,/own terminal|human-terminal/);assert.match(text,/discard-feature --by/);assert.doesNotMatch(text,/Human override available|guard-human-override|HGO-|sign-intent|verify-audit/);}
test('PODB001','READY exact Node/script identities deny only discard',()=>{
 for(const script of [cli,pathToFileURL(cli).href])for(const node of ['node',process.execPath]){
  const result=launch(self,['--worker',JSON.stringify({root,command:render([node,script,'discard-feature','--by','synthetic-po'])})]);
  assert.equal(result.status,0,result.stderr);const verdict=JSON.parse(result.stdout);assert.equal(verdict.exitCode,2);checkReason(verdict.stderr);
 }
 // Root-relative Source identity, with both supported quote forms.
 for(const quote of ['"',"'"]){const command=`node ${quote}${cli}${quote} discard-feature --by ${quote}synthetic-po${quote}`;const verdict=JSON.parse(launch(self,['--worker',JSON.stringify({root,command})]).stdout);assert.equal(verdict.exitCode,2);checkReason(verdict.stderr);}
 const relativeCommand=render(['node',relative(root,cli),'discard-feature','--by','synthetic-po']);
 const relativeVerdict=JSON.parse(launch(self,['--worker',JSON.stringify({root,command:relativeCommand})]).stdout);assert.equal(relativeVerdict.exitCode,2);checkReason(relativeVerdict.stderr);
});
test('PODB002','help and harmless read mentions remain agent work',()=>{
 for(const command of [render([process.execPath,cli,'--help']),`printf '%s' discard-feature`]){
  const result=JSON.parse(launch(self,['--worker',JSON.stringify({root,command})]).stdout);assert.equal(result.exitCode,0,result.stderr);
 }
 const helped=launch(cli,['--help']);assert.equal(helped.status,0,helped.stderr);assert.match(helped.stdout,/Human-terminal action/);assert.match(helped.stdout,/Signed-plan proof import remains agent work/);
});
test('PODB003','compound command stays refused by the closed grammar',()=>{
 const result=JSON.parse(launch(self,['--worker',JSON.stringify({root,command:discard+'; echo synthetic'})]).stdout);assert.equal(result.exitCode,2);assert.doesNotMatch(result.stderr,/PO-DISCARD-HUMAN-ONLY/);
});
for(const runner of ['claude','codex','antigravity'])test(`PODB00${cases.length+1}`,`actual ${runner} transport preserves human-only cause and no override`,()=>{
 const script=join(hooks,runner==='claude'?'guard-lifecycle-ready.mjs':`${runner}-pretool-guard.mjs`);
 const input=runner==='antigravity'?{cwd:root,toolCall:{name:'run_command',args:{CommandLine:discard,Cwd:root}}}:{cwd:root,session_id:'synthetic-discard-fixture',tool_name:'Bash',tool_input:{command:discard}};
 const result=launch(script,runner==='claude'?['--runner','claude']:[],input);assert.ok([0,2].includes(result.status),result.stderr);
 const text=runner==='claude'?result.stderr:result.stdout;checkReason(text);
 if(runner==='claude')assert.equal(result.status,2);
 else {const output=JSON.parse(result.stdout);if(runner==='codex'){assert.equal(output.hookSpecificOutput.hookEventName,'PreToolUse');assert.equal(output.hookSpecificOutput.permissionDecision,'deny');}else assert.equal(output.decision,'deny');}
 console.log(JSON.stringify({schema:'pipeline.po-discard-transport.v1',runner,status:result.status,discardExecuted:false,nativeAttestation:false}));
});
test('PODB007','direct planner and consumer refuse before private-state or process access',async()=>{
 const {recordHumanGuardDenial,consumeHumanGuardOverride,classifyNonLiftableGuardDenials}=await import('../human-guard-override.mjs');
 const denial=(code)=>({guard:'guard-lifecycle-ready.mjs',reason:`BLOCKED (guard-lifecycle-ready, plugin pipeline-core): ${code}: synthetic refusal`});
 for(const code of ['PO-DISCARD-HUMAN-ONLY','GUARD-READ-COMMAND-UNSUPPORTED','GUARD-READ-TARGET-MISSING']){
  const denials=[denial(code)];
  for(const api of [recordHumanGuardDenial,consumeHumanGuardOverride]){
   // An invalid root and throwing process callback prove classification precedes
   // topology, eligibility, audit, capability consumption and private key reads.
   const result=api({rootDir:null,pluginRoot:null,toolName:'Bash',toolInput:{command:discard},denials,spawn:()=>assert.fail('no child process before pure refusal'),appendCommandOffer:()=>assert.fail('no journal before pure refusal')});
   assert.equal(result.status,'non-liftable-recovery-required');assert.equal(result.code,code);assert.equal(result.cause,denials[0].reason);
   assert.equal(result.requestSha256,undefined);assert.equal(result.planSha256,undefined);assert.equal(result.mutated,undefined);
   if(code==='PO-DISCARD-HUMAN-ONLY')checkReason(result.cause+'\n'+result.nextAction.reason);
  }
 }
 for(const code of ['GUARD-READ-CREDENTIAL-TARGET','GUARD-CROSS-REPO-MUTATION','GUARD-GATE-STRENGTH-SHELL','SDC-AUTHORITY-UNAVAILABLE','GUARD-READ-SCOPE']){
  assert.equal(classifyNonLiftableGuardDenials([denial(code)]),null);
  assert.equal(classifyNonLiftableGuardDenials([denial('GUARD-READ-COMMAND-UNSUPPORTED'),denial(code)]),null);
  const mixed=[denial('PO-DISCARD-HUMAN-ONLY'),denial(code)];assert.equal(classifyNonLiftableGuardDenials(mixed).cause,mixed.map(d=>d.reason).join('\n'));
 }
 assert.equal(classifyNonLiftableGuardDenials([{guard:'guard-lifecycle-ready.mjs',reason:'GUARD-READ-CREDENTIAL-TARGET: a filename says GUARD-READ-COMMAND-UNSUPPORTED'}]),null);
 assert.equal(classifyNonLiftableGuardDenials([{guard:'other.mjs',reason:denial('GUARD-READ-COMMAND-UNSUPPORTED').reason}]),null);
});
test('PODB008','closed unsupported and missing reads keep actual adapter metadata without override',()=>{
 for(const runner of ['codex','antigravity'])for(const [command,code] of [['head -c 12 absent.txt','GUARD-READ-COMMAND-UNSUPPORTED'],['cat definitely-missing-fixture.txt','GUARD-READ-TARGET-MISSING']]){
  const input=runner==='antigravity'?{cwd:root,toolCall:{name:'run_command',args:{CommandLine:command,Cwd:root}}}:{cwd:root,session_id:'synthetic-read-fixture',tool_name:'Bash',tool_input:{command}};
  const result=launch(join(hooks,`${runner}-pretool-guard.mjs`),[],input);assert.equal(result.status,runner==='codex'?0:2,result.stderr);
  const output=JSON.parse(result.stdout);const reason=runner==='codex'?output.hookSpecificOutput.permissionDecisionReason:output.reason;
  assert.match(reason,new RegExp(code));assert.doesNotMatch(reason,/Human override available|guard-human-override|HGO-|sign-intent|verify-audit/);
  assert.equal(runner==='codex'?output.hookSpecificOutput.permissionDecision:output.decision,'deny');
 }
});
registerTestCaseCompletion({cases,fd:Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD??'3'),maxBytes:65536});
