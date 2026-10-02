// SPDX-License-Identifier: SUL-1.0
// Exact proposed first-restart boundary over fixture roots; no native Codex restart.
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC17C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {requireProjectOnboardingReady} from './project-onboarding-ready-gate.mjs';
import {root,dispose,fakeDeps,fakeGit,clearRuntimeBarrier} from './project-onboarding-v3.test.mjs';
import {inspectProjectOnboardingV3,planProjectOnboardingV3,applyProjectOnboardingV3,planProjectOnboardingLifecycleV4,applyProjectOnboardingLifecycleV4,planProjectOnboardingKickoffV4,applyProjectOnboardingKickoffV4} from './project-onboarding-v3.mjs';
import {persistRestartBarrier,readRestartBarrier,prepareRuntimeRestartBinding} from './codex-onboarding-runtime.mjs';
import {readOnboardingIntakeCheckpoint,readOnboardingIntakeMaterialInput} from './onboarding-continuity.mjs';
import {main as onboardingCli} from '../scripts/project-onboarding-v3.mjs';
import {sessionStartDecision} from '../hooks/codex-session-start-hint.mjs';

const prefix='Erster Auftrag: Größe, Straße und 🚀.\r\n\r\n'.repeat(120),tail='\r\n\r\n';
const request=prefix+'Anforderung '.repeat(Math.floor((14110-Buffer.byteLength(prefix+tail))/12));
const original=request+'x'.repeat(14110-Buffer.byteLength(request+tail))+tail;
const bytes=Buffer.from(original,'utf8'),expectedSha=createHash('sha256').update(bytes).digest('hex');
assert.equal(bytes.length,14110);
function invokeCapture(path,file){
  let stdout='',stderr='';
  const code=onboardingCli(['intake-consent-apply','--root',path,'--granted','--text-file',file,
    '--profile','feature','--language','de','--activate','--runner','codex'],{
    deps:{...fakeDeps,spawn:fakeGit},write:value=>{stdout+=value;},writeError:value=>{stderr+=value;},
  });
  assert.equal(code,0,stdout+stderr);
  return JSON.parse(stdout);
}
function boundary(t,capture){
  const path=root();t.after(()=>dispose(path));
  const git=spawnSync('git',['init','--initial-branch=main'],{cwd:path,encoding:'utf8'});
  assert.equal(git.status,0,git.stderr);
  const publications=[];
  const deps={...fakeDeps,persistRestartBarrier(options){
    const checkpoint=readOnboardingIntakeCheckpoint({rootDir:path,spawn:fakeGit});
    const material=readOnboardingIntakeMaterialInput({rootDir:path,spawn:fakeGit});
    publications.push({checkpointStatus:checkpoint.status,chunks:material.chunks,
      runtimeTargetAlreadyWritten:existsSync(join(path,'.codex','config.toml'))});
    return persistRestartBarrier(options);
  }};
  const portable=planProjectOnboardingV3({rootDir:path,deps,runner:'codex'});
  assert.equal(applyProjectOnboardingV3(portable,{rootDir:path,activate:true,deps}).status,'applied');
  const file=join(path,'scratch','original-request.txt');
  // source fixture path is inert; the CLI consumes the exact physical UTF-8 bytes.
  mkdirSync(join(path,'scratch'),{recursive:true});
  writeFileSync(file,bytes);
  if(capture){invokeCapture(path,file);invokeCapture(path,file);}
  const runtime=planProjectOnboardingLifecycleV4({rootDir:path,deps,operation:'runtime',runner:'codex'});
  if(!capture){
    assert.equal(runtime.status,'intake-required',JSON.stringify(runtime));
    assert.equal(runtime.nextAction.applyAction.argv[1],'intake-consent-apply');
    const denied=applyProjectOnboardingLifecycleV4({rootDir:path,deps,operation:'runtime',
      planSha256:'a'.repeat(64),activate:true,runner:'codex'});
    assert.equal(denied.status,'intake-required');
    assert.equal(publications.length,0);
    assert.equal(existsSync(join(path,'.codex','config.toml')),false);
    return {path,publications,barrier:readRestartBarrier({rootDir:path,spawn:fakeGit})};
  }
  const argv=runtime.nextAction.argv;
  const initialized=applyProjectOnboardingLifecycleV4({rootDir:path,deps,operation:'runtime',
    planSha256:argv[argv.indexOf('--plan-sha256')+1],activate:true,runner:'codex'});
  assert.equal(initialized.status,'restart-required');
  assert.equal(publications.length,1);
  assert.equal(publications[0].runtimeTargetAlreadyWritten,false);
  assert.deepEqual(readFileSync(file),bytes,'source input must survive');
  return {path,publications,barrier:readRestartBarrier({rootDir:path,spawn:fakeGit})};
}
test('proposed first runtime restart withholds plan and direct apply until explicit original-input capture',t=>{
  const observed=boundary(t,false);
  assert.equal(observed.publications.length,0);
  assert.equal(observed.barrier.status,'absent');
  console.log(JSON.stringify({scenario:'precondition-prevents-first-barrier',inputByteLength:bytes.length,
    inputSha256:expectedSha,checkpointBeforeBarrier:'absent',nativeCodexRestart:false}));
});
test('explicit existing consent capture preserves exact original bytes before barrier and after ticket consumption',t=>{
  const observed=boundary(t,true),atBarrier=observed.publications[0].chunks;
  assert.equal(atBarrier.length,1,'retry must not duplicate the request');
  assert.deepEqual(Buffer.from(atBarrier[0].text,'utf8'),bytes);
  assert.equal(atBarrier[0].sha256,expectedSha);
  clearRuntimeBarrier(observed.path,observed.barrier);
  const resumed=readOnboardingIntakeMaterialInput({rootDir:observed.path,spawn:fakeGit});
  assert.equal(resumed.chunks.length,1);
  assert.deepEqual(Buffer.from(resumed.chunks[0].text,'utf8'),bytes);
  const hint=sessionStartDecision(observed.path,existsSync,'controlled-next-session','codex');
  assert.equal(hint.governed,true);
  assert.equal(Buffer.from(hint.context,'utf8').includes(bytes),true);
  assert.equal(hint.context.indexOf(original),hint.context.lastIndexOf(original));
  console.log(JSON.stringify({scenario:'existing-storage-and-sessionstart-proven',inputByteLength:bytes.length,
    inputSha256:expectedSha,chunkCount:resumed.chunks.length,nativeCodexRestart:false}));
});

test('proposed first restart reuses recorded consent while requiring existing original material',t=>{
  const fixture=boundary(t,false);
  let stdout='',stderr='';
  const code=onboardingCli(['intake-consent-apply','--root',fixture.path,'--granted',
    '--profile','feature','--language','de','--activate','--runner','codex'],{
    deps:{...fakeDeps,spawn:fakeGit},write:value=>{stdout+=value;},writeError:value=>{stderr+=value;}});
  assert.equal(code,0,stdout+stderr);
  const observed=planProjectOnboardingLifecycleV4({rootDir:fixture.path,deps:fakeDeps,operation:'runtime',runner:'codex'});
  assert.equal(observed.status,'intake-required');
  assert.equal(observed.nextAction.applyAction.argv[1],'intake-capture-apply');
  assert.equal(observed.nextAction.applyAction.argv.includes('--granted'),false);
  assert.match(observed.nextAction.guidance,/Do not ask the PO to repeat/);
  assert.equal(readRestartBarrier({rootDir:fixture.path,spawn:fakeGit}).status,'absent');
});

test('proposed first restart refuses checkpoint or material changes after planning and before publication',t=>{
  for(const late of [false,true]){
    const fixture=boundary(t,false);
    invokeCapture(fixture.path,join(fixture.path,'scratch','original-request.txt'));
    let publications=0;
    const mutate=()=>{
      const file=join(fixture.path,'scratch','additional-input.txt');
      writeFileSync(file,'Additional material in this controlled fixture.\n');
      invokeCapture(fixture.path,file);
    };
    const deps={...fakeDeps,
      prepareRuntimeRestartBinding(options){
        const binding=prepareRuntimeRestartBinding(options);
        if(late)mutate();
        return binding;
      },
      persistRestartBarrier(){publications++;throw new Error('must not publish drifting intake');},
    };
    const plan=planProjectOnboardingLifecycleV4({rootDir:fixture.path,deps,operation:'runtime',runner:'codex'});
    const argv=plan.nextAction.argv;
    if(!late)mutate();
    const result=applyProjectOnboardingLifecycleV4({rootDir:fixture.path,deps,operation:'runtime',runner:'codex',
      activate:true,planSha256:argv[argv.indexOf('--plan-sha256')+1]});
    assert.equal(publications,0);
    assert.equal(existsSync(join(fixture.path,'.codex','config.toml')),false);
    assert.equal(readRestartBarrier({rootDir:fixture.path,spawn:fakeGit}).status,'absent');
    if(late){
      assert.equal(result.status,'recovery-required');
      assert.ok(result.diagnostics.some(item=>item.code==='first_restart_material_plan_drift'));
    }else assert.equal(result.status,'runtime-initialization-required');
  }
});

test('proposed first restart refuses corrupt evidence and unavailable continuity without publishing',t=>{
  const fixture=boundary(t,false);
  invokeCapture(fixture.path,join(fixture.path,'scratch','original-request.txt'));
  const observed=readOnboardingIntakeCheckpoint({rootDir:fixture.path,spawn:fakeGit});
  const entry=observed.value.materialInput[0];
  writeFileSync(join(observed.paths.evidenceDirectory,entry.sha256+'.txt'),'corrupted controlled fixture\n');
  const plan=planProjectOnboardingLifecycleV4({rootDir:fixture.path,deps:fakeDeps,operation:'runtime',runner:'codex'});
  assert.equal(plan.status,'continuity-observation-unavailable');
  assert.equal(plan.nextAction,null);
  assert.ok(plan.diagnostics.some(item=>item.code==='first_restart_material_observation_unavailable'));
  const unknown=planProjectOnboardingLifecycleV4({rootDir:fixture.path,
    deps:{...fakeDeps,classifyOnboardingContinuity:()=>({status:'unavailable'})},operation:'runtime',runner:'codex'});
  assert.equal(unknown.status,'continuity-observation-unavailable');
  assert.equal(unknown.nextAction,null);
  assert.equal(readRestartBarrier({rootDir:fixture.path,spawn:fakeGit}).status,'absent');
});

test('proposed first-intake observations remain valid closed envelopes at the actual readiness gate',t=>{
  const fixture=boundary(t,false);
  for(const captured of [false,true]){
    if(captured)invokeCapture(fixture.path,join(fixture.path,'scratch','original-request.txt'));
    const observed=inspectProjectOnboardingV3({rootDir:fixture.path,deps:fakeDeps,runner:'codex',intent:'session'});
    assert.equal(Object.hasOwn(observed,'firstRestartIntake'),false);
    assert.equal(observed.runtime.firstRestartIntake.status,captured?'captured':'capture-required');
    assert.throws(()=>requireProjectOnboardingReady({rootDir:fixture.path,runner:'codex',intent:'session',inspect:()=>observed}),
      error=>error.code==='PORG-NOT-READY'&&error.lifecycleStatus===observed.status,
      'valid non-ready observations must never degrade into PORG-INVALID-OBSERVATION');
  }
});

test('manual kickoff plan and direct apply cannot bypass missing first-restart material',t=>{
  const fixture=boundary(t,false);
  const options={rootDir:fixture.path,deps:fakeDeps,runner:'codex',goal:'Controlled manual kickoff.',language:'de'};
  const plan=planProjectOnboardingKickoffV4(options);
  assert.equal(plan.schema,'pipeline.project-onboarding.v4');
  assert.equal(plan.status,'intake-required');
  assert.equal(plan.runtime.firstRestartIntake.status,'capture-required');
  const applied=applyProjectOnboardingKickoffV4({...options,planSha256:'a'.repeat(64),activate:true});
  assert.equal(applied.status,'intake-required');
  assert.equal(applied.runtime.firstRestartIntake.status,'capture-required');
  assert.equal(readOnboardingIntakeCheckpoint({rootDir:fixture.path,spawn:fakeGit}).status,'absent');
  assert.equal(readRestartBarrier({rootDir:fixture.path,spawn:fakeGit}).status,'absent');
  assert.equal(inspectProjectOnboardingV3(options).continuity.status,'absent-pristine');
  assert.equal(existsSync(join(fixture.path,'.codex','config.toml')),false);
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 7) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
