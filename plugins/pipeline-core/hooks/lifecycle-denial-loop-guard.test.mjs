import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC04C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {evaluateLifecycleReadyGuard} from './guard-lifecycle-ready.mjs';
import {planGovernanceScopeDecision,applyGovernanceScopeDecision} from '../lib/governance-scope.mjs';
import {ProjectOnboardingReadyError} from '../lib/project-onboarding-ready-gate.mjs';
const onboarding=fileURLToPath(new URL('../scripts/project-onboarding-v3.mjs',import.meta.url));
const repair=fileURLToPath(new URL('../scripts/repair-map.mjs',import.meta.url));
const secret='controlled-credential-not-for-telemetry';
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
const command=action=>[action.executable,...action.argv].map(quote).join(' ');
function fixture(t){
  const root=mkdtempSync(join(tmpdir(),'pipeline-loop-guard-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  assert.equal(spawnSync('git',['init','--quiet'],{cwd:root,encoding:'utf8'}).status,0);
  // Disposable fixture enrollment through the canonical physical plan/apply APIs.
  const enrollment=planGovernanceScopeDecision({rootDir:root,decision:'enroll',by:'controlled-denial-loop-fixture'});
  const enrolled=applyGovernanceScopeDecision(enrollment,{activate:true,planSha256:enrollment.planSha256});
  assert.equal(enrolled.state,'active','fixture is physically enrolled before denial assertions');
  writeFileSync(join(root,'pipeline.user.yaml'),'marker\n');
  mkdirSync(join(root,'scratch'));
  const writer=join(root,'scratch','disallowed-recovery.mjs');writeFileSync(writer,'// controlled fixture\n');
  const action={kind:'command',executable:process.execPath,argv:[writer,'--credential',secret],mutation:true,requiresConfirmation:false};
  const observed={schema:'pipeline.project-onboarding.v4',status:'intake-required',root,runner:'codex',intent:'session',
    repository:{mode:'local'},runtime:{sourceSha256:'a'.repeat(64)},continuity:{status:'absent-pristine'},nextAction:action};
  let inspections=0;
  const deps={projectDir:root,runner:'codex',subagentIdentityFn:()=>({kind:'orchestrator'}),
    readOnboardingIntakeCheckpointFn:()=>({status:'absent'}),
    requireProjectOnboardingReadyFn(){throw new ProjectOnboardingReadyError('PORG-NOT-READY','controlled not-ready',{intent:'session',lifecycleStatus:observed.status});},
    inspectProjectOnboardingV3Fn(){inspections++;return observed;}};
  const input={tool_name:'Bash',session_id:'loop-session-001',tool_input:{command:command(action)}};
  return {root,observed,deps,input,run:(patch={})=>evaluateLifecycleReadyGuard(input,{...deps,...patch}),inspectionCount:()=>inspections};
}
const hasLoop=result=>result.stderr.includes('GUARD-LIFECYCLE-RETURNED-ACTION-LOOP');
function privateBytes(root){
  const directory=join(root,'.git','agent-pipeline');
  const walk=path=>readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(path,entry.name)):[readFileSync(join(path,entry.name))]);
  return Buffer.concat(walk(directory)).toString('utf8');
}
test('actual guard retains exit2 and emits bounded alternate action on second exact returned refusal',t=>{
  const f=fixture(t),first=f.run(),second=f.run();
  assert.equal(first.exitCode,2);assert.equal(hasLoop(first),false);
  assert.equal(second.exitCode,2);assert.equal(hasLoop(second),true);
  assert.equal(f.inspectionCount(),2,'matcher and telemetry share one inspection per guard call');
  const diagnostic=JSON.parse(second.stderr.trim().split('\n').at(-1));
  assert.equal(diagnostic.count,2);assert.equal(diagnostic.mutation,false);
  assert.deepEqual(diagnostic.nextAction.argv,[repair]);
  assert.match(diagnostic.actionFingerprint,/^[a-f0-9]{64}$/);
  assert.equal(second.stderr.includes('Re-run the typed'),false,'loop response does not prescribe the same refused cycle');
  const stored=privateBytes(f.root);
  for(const value of [secret,f.root,f.input.session_id,'--credential','disallowed-recovery.mjs'])assert.equal(stored.includes(value),false,value);
  const diagnosed=evaluateLifecycleReadyGuard({...f.input,tool_input:{command:command(diagnostic.nextAction)}},f.deps);
  assert.equal(diagnosed.exitCode,0,'actual repair-map action is admitted read-only');
  const emitted=second.stderr.split('\n').find(line=>line.startsWith('Read-only diagnosis: ')).slice('Read-only diagnosis: '.length);
  assert.equal(evaluateLifecycleReadyGuard({...f.input,tool_input:{command:emitted}},f.deps).exitCode,0,
    'the emitted copy command itself is admitted without fragment assembly or eval');
});
test('actual guard distinguishes same-phase binding drift from a repeated returned refusal',t=>{
  const f=fixture(t);assert.equal(hasLoop(f.run()),false);assert.equal(hasLoop(f.run()),true);
  f.observed.runtime.sourceSha256='b'.repeat(64);
  assert.equal(hasLoop(f.run()),false);assert.equal(hasLoop(f.run()),true);
  f.deps.readOnboardingIntakeCheckpointFn=()=>({status:'present',sha256:'c'.repeat(64)});
  assert.equal(hasLoop(f.run()),false);assert.equal(hasLoop(f.run()),true);
});
test('actual guard resets after an admitted lifecycle action and an unrelated command attempt',t=>{
  const f=fixture(t),original=f.observed.nextAction;
  assert.equal(hasLoop(f.run()),false);
  const foreign=evaluateLifecycleReadyGuard({...f.input,tool_input:{command:f.input.tool_input.command+' --different'}},f.deps);
  assert.equal(foreign.exitCode,2);assert.equal(hasLoop(foreign),false);
  assert.equal(hasLoop(f.run()),false);assert.equal(hasLoop(f.run()),true);
  f.observed.nextAction={kind:'command',executable:process.execPath,argv:[onboarding,'inspect','--root',f.root,'--runner','codex','--intent','session'],mutation:false,requiresConfirmation:false};
  assert.equal(evaluateLifecycleReadyGuard({...f.input,tool_input:{command:command(f.observed.nextAction)}},f.deps).exitCode,0);
  f.observed.nextAction=original;
  assert.equal(hasLoop(f.run()),false);
});
test('actual guard isolates native agent scopes and excludes missing session identity',t=>{
  const f=fixture(t),a={...f.input,agent_id:'agent-a',agent_type:'worker'},b={...f.input,agent_id:'agent-b',agent_type:'worker'};
  assert.equal(hasLoop(evaluateLifecycleReadyGuard(a,f.deps)),false);
  assert.equal(hasLoop(evaluateLifecycleReadyGuard(b,f.deps)),false);
  assert.equal(hasLoop(evaluateLifecycleReadyGuard(a,f.deps)),true);
  assert.equal(hasLoop(evaluateLifecycleReadyGuard(b,f.deps)),true);
  const noSession={...f.input};delete noSession.session_id;
  assert.equal(hasLoop(evaluateLifecycleReadyGuard(noSession,f.deps)),false);
  assert.equal(hasLoop(evaluateLifecycleReadyGuard(noSession,f.deps)),false);
  for(let n=0;n<2;n++)assert.equal(hasLoop(f.run({subagentIdentityFn:()=>({kind:'unresolved'})})),false);
});
test('actual guard preserves refusal on telemetry failure and mismatched/invalid observation',t=>{
  const f=fixture(t),baseline=f.run();
  const failure=f.run({observeReturnedActionDenialFn(){throw new Error('controlled storage failure');}});
  assert.deepEqual(failure,baseline);
  f.observed.status='restart-required';
  const mismatch=f.run({requireProjectOnboardingReadyFn(){throw new ProjectOnboardingReadyError('PORG-NOT-READY','controlled',{intent:'session',lifecycleStatus:'intake-required'});}});
  assert.equal(mismatch.exitCode,2);assert.equal(hasLoop(mismatch),false);
  for(let n=0;n<2;n++){
    const invalid=f.run({requireProjectOnboardingReadyFn(){throw new ProjectOnboardingReadyError('PORG-INVALID-OBSERVATION','controlled',{intent:'session'});}});
    assert.equal(invalid.exitCode,2);assert.equal(hasLoop(invalid),false);
  }
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 5) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
