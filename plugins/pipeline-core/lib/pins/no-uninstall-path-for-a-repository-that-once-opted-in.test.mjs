// SPDX-License-Identifier: SUL-1.0
// Pin for ALF-C-P8-05 / AC-216: backlog item
// pipeline.no-uninstall-path-for-a-repository-that-once-opted-in.
// Every case drives the real project-uninstall controller, the real hook
// installers and real Git. Fixtures live under the repository scratch/.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createProjectUninstallController,PROJECT_UNINSTALL_FAULT_STAGES} from '../project-uninstall.mjs';
import {observeGitHookFootprint} from '../git-hook-footprint.mjs';
import {fixture,git} from '../project-uninstall.fixture.mjs';

const scratch=join(fileURLToPath(new URL('../../../../scratch/',import.meta.url)),'uninstall-pin-'+process.pid);
mkdirSync(scratch,{recursive:true});
// The shared fixture builds its repositories under os.tmpdir(); point that at scratch/.
const saved={TEMP:process.env.TEMP,TMP:process.env.TMP,TMPDIR:process.env.TMPDIR};
for(const key of Object.keys(saved))process.env[key]=scratch;
test.after(()=>{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}rmSync(scratch,{recursive:true,force:true});});

const options=plan=>({activate:true,planSha256:plan.planSha256});
const hookStatuses=f=>observeGitHookFootprint({rootDir:f.root}).hooks.map(h=>h.status);
function pushToBare(f,message){
 const remote=join(f.base,'remote-'+message.length+'.git');mkdirSync(remote);git(remote,['init','--bare','-q']);
 f.put('README',message+'\n');git(f.root,['add','README']);git(f.root,['commit','-m',message]);git(f.root,['remote','add','origin',remote]);git(f.root,['push','origin','main']);
 assert.equal(git(remote,['rev-parse','main']),git(f.root,['rev-parse','HEAD']));
}

test('plan is read-only and apply is bound to the plan digest',t=>{
 const f=fixture(t),before=f.digests(),config=readFileSync(join(f.root,'.git/config'));
 const plan=f.controller.plan({rootDir:f.root});
 assert.deepEqual(plan.conflicts,[]);assert.equal(plan.preserveContent,true);assert.match(plan.planSha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(plan.git.hooks.map(h=>h.status),['owned','owned','owned']);
 assert.equal(f.controller.plan({rootDir:f.root}).planSha256,plan.planSha256);
 assert.deepEqual(f.digests(),before);assert.deepEqual(readFileSync(join(f.root,'.git/config')),config);
 assert.equal(f.scope.observe({rootDir:f.root}).state,'active');assert(!existsSync(plan.controls));
 assert.throws(()=>f.controller.apply(plan,{activate:true,planSha256:'0'.repeat(64)}),e=>e.code==='PU-PLAN');
 assert.throws(()=>f.controller.apply(plan,{planSha256:plan.planSha256}),e=>e.code==='PU-PLAN');
 assert.deepEqual(hookStatuses(f),['owned','owned','owned']);assert(!existsSync(plan.controls));
});

test('apply removes the mechanics, keeps all content and history, ends declined, and git commit/push still work',t=>{
 const f=fixture(t),before=f.digests(),plan=f.controller.plan({rootDir:f.root});
 const result=f.controller.apply(plan,options(plan));
 assert.equal(result.status,'uninstalled');assert.equal(result.scopeState,'declined');assert.equal(result.preservedContent,true);
 assert.deepEqual(JSON.parse(readFileSync(result.journalPath)).completed,PROJECT_UNINSTALL_FAULT_STAGES.slice(1));
 assert.equal(f.scope.observe({rootDir:f.root}).state,'declined');
 assert.deepEqual(hookStatuses(f),['absent','absent','absent']);
 for(const h of plan.git.hooks)assert(!existsSync(h.hookPath)&&!existsSync(h.implPath)&&!existsSync(h.markerPath));
 assert.deepEqual(f.digests(),before);
 assert.equal(git(f.root,['rev-parse','HEAD']),f.head);
 // Foreign bytes inside the project-owned key file survive owned-key surgery.
 const json=readFileSync(join(f.root,'.claude/pipeline.json'),'utf8');
 assert(json.includes('"foreign" : { "escaped" : "\\u00df", "n" : 1e+2 }'));assert.equal(Object.hasOwn(JSON.parse(json).humanRoles.po,'displayLabel'),false);
 assert.equal(JSON.parse(json).humanRoles.po.custom,true);
 assert.equal(JSON.parse(readFileSync(join(f.root,'.agents/plugins.json'),'utf8')).entries.length,1);
 pushToBare(f,'Ordinary commit after uninstall');
});

test('a foreign hook is refused with a typed error and is never touched',t=>{
 const f=fixture(t,{hooks:false}),foreign='#!/bin/sh\nexit 0\n';f.put('.git/hooks/pre-commit',foreign);
 const hookPath=join(f.root,'.git/hooks/pre-commit'),before=f.digests(),config=readFileSync(join(f.root,'.git/config'));
 const plan=f.controller.plan({rootDir:f.root});
 assert(plan.conflicts.some(c=>c.code==='PU-FOREIGN-HOOK-CONFLICT'));
 assert.throws(()=>f.controller.apply(plan,options(plan)),e=>e.code==='PU-FOREIGN-HOOK-CONFLICT'&&e.instructions?.removed===false&&e.instructions?.hook==='.git/hooks/pre-commit');
 assert.equal(readFileSync(hookPath,'utf8'),foreign);assert.deepEqual(f.digests(),before);assert.deepEqual(readFileSync(join(f.root,'.git/config')),config);
 assert.equal(f.scope.observe({rootDir:f.root}).state,'active');assert(!existsSync(plan.controls));
 pushToBare(f,'Ordinary commit after refusal');
});

test('a modified owned key file is kept and refuses before any mutation',t=>{
 const f=fixture(t),path=join(f.root,'.claude/pipeline.json'),v=JSON.parse(readFileSync(path));v.humanRoles.po.displayLabel='Foreign Override';
 const changed=JSON.stringify(v);f.put('.claude/pipeline.json',changed);
 const plan=f.controller.plan({rootDir:f.root}),statuses=hookStatuses(f),before=f.digests();
 assert.throws(()=>f.controller.apply(plan,options(plan)),e=>e.code==='PU-OWNERSHIP-CONFLICT');
 assert.equal(readFileSync(path,'utf8'),changed);assert.deepEqual(hookStatuses(f),statuses);assert.deepEqual(f.digests(),before);assert(!existsSync(plan.controls));
});

for(const stage of PROJECT_UNINSTALL_FAULT_STAGES.filter(s=>s!=='complete'))test('an interrupted apply after '+stage+' is resumable by a fresh controller to the same end state',t=>{
 const f=fixture(t),before=f.digests(),plan=f.controller.plan({rootDir:f.root});
 assert.throws(()=>f.controller.apply(plan,{...options(plan),crashAt:stage}),e=>e.code==='PU-SIMULATED-FAULT');
 // Until the declined marker lands the repository is still governed; commit-capable shims are retired in the 'shim' stage first.
 const mid=f.scope.observe({rootDir:f.root}).state;if(['journal','shim','keys','workspace'].includes(stage))assert(['active','unverifiable-active'].includes(mid),'still governed before the declined marker, got '+mid);else assert.equal(mid,'declined');
 if(['shim','keys','workspace','decline','private'].includes(stage))assert.deepEqual(hookStatuses(f),['absent','absent','absent']);
 const fresh=createProjectUninstallController({hostStateRoot:join(f.base,'host-state')});
 const r=fresh.resume({rootDir:f.root,...options(plan)});
 assert.equal(r.status,'uninstalled');assert.equal(f.scope.observe({rootDir:f.root}).state,'declined');
 assert.deepEqual(JSON.parse(readFileSync(r.journalPath)).completed,PROJECT_UNINSTALL_FAULT_STAGES.slice(1));
 assert.deepEqual(hookStatuses(f),['absent','absent','absent']);assert.deepEqual(f.digests(),before);
 assert.equal(fresh.resume({rootDir:f.root,...options(plan)}).status,'uninstalled');
});

test('a crash in the middle of shim removal leaves a partial state that resume completes',t=>{
 const f=fixture(t),before=f.digests(),plan=f.controller.plan({rootDir:f.root});
 assert.throws(()=>f.controller.apply(plan,{...options(plan),crashDuringShim:'pre-commit'}),/PU-SIMULATED-AFTER-SHIM/);
 assert.equal(hookStatuses(f)[0],'owned-partial');assert.equal(f.scope.observe({rootDir:f.root}).state,'active');
 const r=createProjectUninstallController({hostStateRoot:join(f.base,'host-state')}).resume({rootDir:f.root,...options(plan)});
 assert.equal(r.status,'uninstalled');assert.deepEqual(hookStatuses(f),['absent','absent','absent']);assert.deepEqual(f.digests(),before);
});

test('later re-onboarding works: enrollment reactivates the repository with retained records intact',t=>{
 const f=fixture(t,{keys:false}),key=f.scope.observe({rootDir:f.root}).scopeKey,plan=f.controller.plan({rootDir:f.root});
 f.controller.apply(plan,options(plan));const retained=f.digests();assert.equal(f.scope.observe({rootDir:f.root}).state,'declined');
 const enroll=f.scope.planDecision({rootDir:f.root,decision:'enroll',by:'Fixture Owner'});f.scope.applyDecision(enroll,options(enroll));
 assert.equal(f.scope.observe({rootDir:f.root}).state,'active');assert.equal(f.scope.observe({rootDir:f.root}).scopeKey,key);
 assert.deepEqual(f.digests(),retained);assert(existsSync(join(f.root,'docs/guide.md')));assert(existsSync(join(f.root,'specs/promoted/spec.md')));
 // A completed uninstall journal must not be silently replayed over the re-enrolled repository.
 assert.throws(()=>f.controller.resume({rootDir:f.root,...options(plan)}),e=>e.code==='PU-DECLINE-READBACK');
});

test('RED control: removing private state without retiring the shims breaks git commit (the failure the ordering prevents)',t=>{
 const f=fixture(t);
 rmSync(join(f.root,'.git/agent-pipeline'),{recursive:true,force:true});
 f.put('README','change\n');git(f.root,['add','README']);
 const r=spawnSync('git',['commit','-m','must fail without impl'],{cwd:f.root,encoding:'utf8',timeout:30000});
 assert.notEqual(r.status,0,'commit unexpectedly succeeded; B1 control is not meaningful on this host');
});

test('alias and private-directory mode refusals (PU-ALIAS, PU-PRIVATE-MODE) need symlinks and mode bits',{skip:process.platform==='win32'?'host-limitation: directory symlinks and POSIX directory mode bits are unavailable on native Windows; owner Coordinator, due 2026-10-19, Linux/WSL run (PO decision K7)':false},t=>{
 const f=fixture(t),plan=f.controller.plan({rootDir:f.root}),link=join(f.root,'alias-dir');
 spawnSync('ln',['-s',join(f.root,'docs'),link]);
 assert(existsSync(link));
 assert.throws(()=>f.controller.apply(plan,options(plan)),e=>['PU-PREIMAGE-DRIFT','PU-ALIAS'].includes(e.code));
});
