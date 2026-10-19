// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.governance-scope-rejects-readonly-host-git-control (ALF-C-P1-05, AC-188).
// Drives the real governance-scope and codex-host-layout modules; nothing under test is mocked.
// Positive host-managed cases need a directory that is genuinely non-writable to this process. Where the
// host cannot manufacture one (native win32 ignores directory mode bits) they skip with a typed reason
// instead of passing vacuously; the fail-closed near-miss cases run on every host.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,existsSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,renameSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createGovernanceScopeController,governanceEnrollmentRecoveryAction,readGovernanceEnrollmentRetirement} from '../governance-scope.mjs';
import {hasCodexGitControlMount} from '../codex-host-layout.mjs';
import {assertFixtureIsolated,createFixtureBase,guardController} from '../test-fixture-isolation.mjs';

function fixture(t){
  // The base comes from createFixtureBase (Git ceiling + containment assertion); the controller is the guarded copy.
  const made=createFixtureBase('gs-readonly-host-'),base=made.base,root=join(base,'repo'),host=join(base,'host-store');
  mkdirSync(root);
  t.after(()=>{made.release();for(const p of [join(root,'.git'),join(base,'old-control')]){try{chmodSync(p,0o755);}catch{}}rmSync(base,{recursive:true,force:true});});
  assertFixtureIsolated(root);
  return {base,root,host,controller:guardController(createGovernanceScopeController({hostStateRoot:host}))};
}
function readonlyGit(root){const control=join(root,'.git');mkdirSync(control);chmodSync(control,0o555);return control;}
function hostLimitation(){
  const d=mkdtempSync(join(tmpdir(),'gs-readonly-probe-'));
  try{const probe={root:d};mkdirSync(join(d,'.git'));chmodSync(join(d,'.git'),0o555);const ok=hasCodexGitControlMount(d);chmodSync(join(d,'.git'),0o755);return ok?null:'host limitation: cannot create a non-writable empty .git directory on this host ('+process.platform+')';}
  finally{rmSync(d,{recursive:true,force:true});}
}
function files(root,prefix=''){const out=[];for(const e of readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=join(root,e.name);if(e.isDirectory())out.push(...files(p,prefix+e.name+'/'));else out.push([prefix+e.name,readFileSync(p).toString('hex')]);}return out;}
function decide(controller,root,decision){assertFixtureIsolated(root);const plan=controller.planDecision({rootDir:root,decision,by:'Fixture human answer'});return controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256});}
function put(root,path,bytes){const dest=join(root,path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,bytes);}
const limit=hostLimitation();

test('AC-188 point 1: fresh host enrollment works against a readonly empty .git, with no .git write',{skip:limit??false},t=>{
  const f=fixture(t),control=readonlyGit(f.root);
  assert.equal(hasCodexGitControlMount(f.root),true);
  const before=files(f.base),obs=f.controller.observe({rootDir:f.root});
  assert.equal(obs.state,'inactive');assert.equal(obs.repositoryKind,'non-git');
  assert.deepEqual(files(f.base),before);assert.equal(existsSync(f.host),false);
  assert.equal(readGovernanceEnrollmentRetirement({rootDir:f.root}),null);
  assert.equal(decide(f.controller,f.root,'enroll').state,'active');
  assert.equal(decide(f.controller,f.root,'decline').state,'declined');
  assert.equal(decide(f.controller,f.root,'enroll').state,'active');
  assert.deepEqual(readdirSync(control),[]);
});

test('AC-188 point 2: persisted host decisions stay root bound across controllers and other roots',{skip:limit??false},t=>{
  const f=fixture(t);readonlyGit(f.root);
  assert.equal(decide(f.controller,f.root,'enroll').state,'active');
  assert.equal(createGovernanceScopeController({hostStateRoot:f.host}).observe({rootDir:f.root}).state,'active');
  const other=join(f.base,'other');mkdirSync(other);readonlyGit(other);
  assert.notEqual(createGovernanceScopeController({hostStateRoot:f.host}).observe({rootDir:other}).state,'active');
  t.after(()=>{try{chmodSync(join(other,'.git'),0o755);}catch{}});
});

test('AC-188 point 3: mount drift between plan and apply is refused with GS-SCOPE-DRIFT and writes nothing',{skip:limit??false},t=>{
  const f=fixture(t),control=readonlyGit(f.root);
  const stale=f.controller.planDecision({rootDir:f.root,decision:'enroll',by:'Fixture explicit host enrollment'});
  chmodSync(control,0o755);renameSync(control,join(f.base,'old-control'));readonlyGit(f.root);
  const changed=files(f.base);
  assert.throws(()=>f.controller.applyDecision(stale,{activate:true,planSha256:stale.planSha256}),/GS-SCOPE-DRIFT/);
  assert.deepEqual(files(f.base),changed);
});

test('AC-188 point 4: corrupt host record fails closed',{skip:limit??false},t=>{
  const f=fixture(t);readonlyGit(f.root);
  const active=decide(f.controller,f.root,'enroll');assert.equal(active.state,'active');
  writeFileSync(join(f.host,active.scopeKey+'.json'),'{}\n');
  const obs=createGovernanceScopeController({hostStateRoot:f.host}).observe({rootDir:f.root});
  assert.notEqual(obs.state,'active');assert.notEqual(obs.state,'inactive');
  assert.equal(obs.requiresEnforcement,true);
});

test('AC-188 point 5: retained host history is a typed recovery requirement, never silently erased',{skip:limit??false},t=>{
  const f=fixture(t),control=readonlyGit(f.root);
  decide(f.controller,f.root,'enroll');decide(f.controller,f.root,'decline');
  mkdirSync(join(f.root,'.claude','.runtime','agent-pipeline','onboarding'),{recursive:true,mode:0o700});
  put(f.root,'project/pipeline-state.json','{}');
  const retained=files(f.base),refusal=decide(f.controller,f.root,'enroll');
  assert.equal(refusal.status,'refused');assert.equal(refusal.code,'GS-HOST-MANAGED-RETAINED-HISTORY');
  assert.equal(f.controller.observe({rootDir:f.root}).state,'declined');
  assert.throws(()=>readGovernanceEnrollmentRetirement({rootDir:f.root}),/GS-HOST-MANAGED-RETAINED-HISTORY/);
  assert.deepEqual(files(f.base),retained);
  const recovery=governanceEnrollmentRecoveryAction({rootDir:f.root,runner:'codex'});
  assert.equal(recovery.kind,'external-operator');assert.equal(recovery.mutation,false);
  assert.ok(recovery.argv.includes('inspect'));assert.ok(!recovery.argv.includes('apply'));assert.ok(!recovery.argv.includes('plan-enrollment-git-creation'));
  assert.deepEqual(readdirSync(control),[]);
});

test('AC-188 point 6: nonempty .git near miss is not a host mount and fails closed (every host)',t=>{
  const f=fixture(t),control=join(f.root,'.git');mkdirSync(control);put(f.root,'.git/foreign','retained');chmodSync(control,0o555);
  assert.equal(hasCodexGitControlMount(f.root),false);
  const before=files(f.base);
  assert.throws(()=>f.controller.planDecision({rootDir:f.root,decision:'enroll',by:'Fixture'}),e=>e.code==='GS-GIT-UNAVAILABLE'&&e.topologyDiagnostic.reason==='unsupported-existing-control');
  assert.equal(f.controller.observe({rootDir:f.root}).hintAllowed,false);
  assert.deepEqual(files(f.base),before);
});

test('AC-188 point 7: writable empty .git near miss is not a host mount and fails closed (every host)',t=>{
  const f=fixture(t),control=join(f.root,'.git');mkdirSync(control);chmodSync(control,0o755);
  assert.equal(hasCodexGitControlMount(f.root),false);
  assert.throws(()=>f.controller.planDecision({rootDir:f.root,decision:'enroll',by:'Fixture'}),/GS-GIT-UNAVAILABLE/);
  assert.equal(f.controller.observe({rootDir:f.root}).hintAllowed,false);
  assert.deepEqual(readdirSync(control),[]);
});

test('AC-188 point 8: aliased .git near miss is not a host mount and fails closed (skips where symlinks are refused)',t=>{
  const f=fixture(t),real=join(f.base,'real-control');mkdirSync(real);
  try{symlinkSync(real,join(f.root,'.git'),'dir');}catch(error){t.skip('host limitation: directory symlink refused ('+(error&&error.code)+')');return;}
  assert.equal(hasCodexGitControlMount(f.root),false);
  assert.throws(()=>f.controller.planDecision({rootDir:f.root,decision:'enroll',by:'Fixture'}),/GS-GIT-UNAVAILABLE/);
  assert.deepEqual(readdirSync(real),[]);
});

test('AC-188 point 9: existing local Git and non-Git enrollment paths remain intact',t=>{
  const g=fixture(t),run=args=>{const r=spawnSync('git',args,{cwd:g.root,encoding:'utf8',timeout:10000,shell:false});assert.equal(r.status,0,r.stderr);};
  run(['init','--initial-branch=main']);run(['config','user.name','Fixture']);run(['config','user.email','fixture@example.invalid']);run(['commit','--allow-empty','-m','fixture']);
  assert.equal(decide(g.controller,g.root,'enroll').state,'active');
  assert.equal(createGovernanceScopeController({hostStateRoot:g.host}).observe({rootDir:g.root}).state,'active');
  assert.equal(readGovernanceEnrollmentRetirement({rootDir:g.root}),null);
  const n=fixture(t);
  assert.equal(n.controller.observe({rootDir:n.root}).repositoryKind,'non-git');
  assert.equal(decide(n.controller,n.root,'enroll').state,'active');
  assert.equal(decide(n.controller,n.root,'decline').state,'declined');
  mkdirSync(join(n.root,'.claude','.runtime','agent-pipeline','onboarding'),{recursive:true,mode:0o700});put(n.root,'project/pipeline-state.json','{}');
  const refusal=decide(n.controller,n.root,'enroll');
  assert.equal(refusal.status,'refused');assert.equal(refusal.code,'GS-NONGIT-RETAINED-HISTORY');
});
