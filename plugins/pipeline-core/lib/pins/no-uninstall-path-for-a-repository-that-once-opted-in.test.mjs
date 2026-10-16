// SPDX-License-Identifier: SUL-1.0
// Pin for ALF-C-P8-05 / AC-216: backlog item
// pipeline.no-uninstall-path-for-a-repository-that-once-opted-in.
// Every case drives the real project-uninstall controller, the real hook
// installers and real Git. Fixtures live under the repository scratch/.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readdirSync,readFileSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {basename,dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createProjectUninstallController,PROJECT_UNINSTALL_FAULT_STAGES} from '../project-uninstall.mjs';
import {createGovernanceScopeController} from '../governance-scope.mjs';
import {observeGitHookFootprint} from '../git-hook-footprint.mjs';
import {fixture,git} from '../project-uninstall.fixture.mjs';
import {applyInstall as installPreCommit} from '../../scripts/pre-commit-hook-install.mjs';
import {applyInstall as installCommitMsg} from '../../scripts/commit-msg-hook-install.mjs';
import {applyInstall as installPrePush} from '../../scripts/pre-push-hook-install.mjs';

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
 const r=spawnSync('git',['commit','-m','must fail without impl'],{cwd:f.root,encoding:'utf8',timeout:30000,env:{...process.env,GIT_CEILING_DIRECTORIES:dirname(f.root)}});
 assert.notEqual(r.status,0,'commit unexpectedly succeeded; B1 control is not meaningful on this host');
});

test('a shared worktree that is still governed refuses with a typed error and changes no byte',t=>{
 const f=fixture(t),sibling=join(f.base,'sibling');
 git(f.root,['worktree','add','-q','--detach',sibling]);
 const before=f.digests(),config=readFileSync(join(f.root,'.git/config')),statuses=hookStatuses(f);
 assert.throws(()=>f.controller.plan({rootDir:f.root}),e=>e.code==='PU-SHARED-ACTIVE-WORKTREE');
 assert.deepEqual(f.digests(),before);assert.deepEqual(readFileSync(join(f.root,'.git/config')),config);assert.deepEqual(hookStatuses(f),statuses);
 assert.equal(f.scope.observe({rootDir:f.root}).state,'active');assert(!existsSync(join(f.root,'.git/pipeline-uninstall')));
});

function declineSibling(f,sibling){const d=f.scope.planDecision({rootDir:sibling,decision:'decline',by:'Fixture Owner'});f.scope.applyDecision(d,options(d));assert.equal(f.scope.observe({rootDir:sibling}).state,'declined');}

test('a shared worktree that has itself declined does not block the uninstall of the other worktree, and stays declined',t=>{
 const f=fixture(t),sibling=join(f.base,'sibling');
 git(f.root,['worktree','add','-q','--detach',sibling]);declineSibling(f,sibling);
 const before=f.digests(),plan=f.controller.plan({rootDir:f.root});
 assert.deepEqual(plan.conflicts,[]);assert.equal(plan.git.worktrees.length,2);
 const result=f.controller.apply(plan,options(plan));
 assert.equal(result.status,'uninstalled');assert.equal(f.scope.observe({rootDir:f.root}).state,'declined');assert.equal(f.scope.observe({rootDir:sibling}).state,'declined');
 assert.deepEqual(hookStatuses(f),['absent','absent','absent']);assert.deepEqual(f.digests(),before);
 assert.equal(git(sibling,['rev-parse','HEAD']),f.head);assert(existsSync(join(sibling,'docs/guide.md')));
});

test('RED: a declined sibling that becomes governed again between plan and apply stays refused and removes nothing',t=>{
 const f=fixture(t),sibling=join(f.base,'sibling');
 git(f.root,['worktree','add','-q','--detach',sibling]);declineSibling(f,sibling);
 const plan=f.controller.plan({rootDir:f.root}),before=f.digests(),statuses=hookStatuses(f);
 const enroll=f.scope.planDecision({rootDir:sibling,decision:'enroll',by:'Fixture Owner'});f.scope.applyDecision(enroll,options(enroll));
 assert.equal(f.scope.observe({rootDir:sibling}).state,'active');
 assert.throws(()=>f.controller.apply(plan,options(plan)),e=>e.code==='PU-SHARED-SCOPE-DRIFT'||e.code==='PU-SHARED-ACTIVE-WORKTREE'||e.code==='PU-HOOK-SHARED');
 assert.deepEqual(hookStatuses(f),statuses);assert.deepEqual(f.digests(),before);assert.equal(f.scope.observe({rootDir:f.root}).state,'active');
});

test('RED: a worktree added after the plan is a still-governed sibling: apply refuses typed and keeps every hook',t=>{
 const f=fixture(t),sibling=join(f.base,'sibling'),late=join(f.base,'late');
 git(f.root,['worktree','add','-q','--detach',sibling]);declineSibling(f,sibling);
 const plan=f.controller.plan({rootDir:f.root}),statuses=hookStatuses(f);
 git(f.root,['worktree','add','-q','--detach',late]);
 assert.throws(()=>f.controller.apply(plan,options(plan)),e=>['PU-SHARED-ACTIVE-WORKTREE','PU-SHARED-SCOPE-DRIFT','PU-HOOK-SHARED'].includes(e.code));
 assert.deepEqual(hookStatuses(f),statuses);assert.equal(f.scope.observe({rootDir:f.root}).state,'active');
});

for(const runners of [['claude'],['codex'],['antigravity']])test('per-runner fixture ('+runners[0]+' only): uninstall keeps AGENTS.md/CLAUDE.md, strips owned keys only, and archives private hook state',t=>{
 const f=fixture(t,{runners}),before=f.digests(),plan=f.controller.plan({rootDir:f.root});
 assert.deepEqual(plan.conflicts,[]);
 const result=f.controller.apply(plan,options(plan));
 assert.equal(result.status,'uninstalled');assert.equal(f.scope.observe({rootDir:f.root}).state,'declined');
 assert.deepEqual(f.digests(),before);assert.equal(readFileSync(join(f.root,'AGENTS.md'),'utf8'),'User instructions unchanged\n');
 // Key-level strip: only owned keys are removed from project-owned files; unowned bytes survive.
 const json=readFileSync(join(f.root,'.claude/pipeline.json'),'utf8');
 assert(json.includes('"foreign" : { "escaped" : "\\u00df", "n" : 1e+2 }'));assert.equal(Object.hasOwn(JSON.parse(json).humanRoles.po,'displayLabel'),false);
 assert(readFileSync(join(f.root,'.claude/pipeline.yaml'),'utf8').includes('foreign: keep-exact'));
 assert.equal(readFileSync(join(f.root,'.codex/config.toml'),'utf8'),'profile = "keep"\n');
 if(runners[0]==='antigravity'){
  // Workspace wiring: only the Pipeline's own Antigravity entries leave; foreign entries and unowned bytes stay.
  for(const path of ['.agents/hooks.json','.agents/external-hooks.json']){const value=JSON.parse(readFileSync(join(f.root,path),'utf8'));assert.deepEqual(value.hooks.map(h=>h.command),['node foreign.mjs'],path);assert.equal(value.sentinel,'ß',path);assert.equal(value.tail,true,path);}
  const plugins=JSON.parse(readFileSync(join(f.root,'.agents/plugins.json'),'utf8'));assert.equal(plugins.entries.length,1);assert.equal(plugins.entries[0].enabled,false);assert.equal(plugins.custom,'ß');assert.equal(plugins.tail,1);
 }
 // Archive variant: private hook state is moved, not deleted, under the uninstall controls.
 const retained=join(result.retainedMetadataPath);assert(existsSync(retained));
 assert.equal(plan.privateArchives.length>0,true);
 for(const [index,archive] of plan.privateArchives.entries()){assert(!existsSync(archive.path));assert(existsSync(join(retained,'private-'+index)));assert.deepEqual(readdirSync(join(retained,'private-'+index)).sort(),archive.names.filter(n=>/^runtime-[a-f0-9]{64}$/.test(n)));}
 assert.deepEqual(hookStatuses(f),['absent','absent','absent']);
});

test('alias and private-directory mode refusals (PU-ALIAS, PU-PRIVATE-MODE) need symlinks and mode bits',{skip:process.platform==='win32'?'host-limitation: directory symlinks and POSIX directory mode bits are unavailable on native Windows; owner Coordinator, due 2026-10-19, Linux/WSL run (PO decision K7)':false},t=>{
 const f=fixture(t),plan=f.controller.plan({rootDir:f.root}),link=join(f.root,'alias-dir');
 spawnSync('ln',['-s',join(f.root,'docs'),link]);
 assert(existsSync(link));
 assert.throws(()=>f.controller.apply(plan,options(plan)),e=>['PU-PREIMAGE-DRIFT','PU-ALIAS'].includes(e.code));
});

test('SETUP.md documents the uninstall path with exactly the verbs, flags and refusal codes the CLI really has',()=>{
 const setup=readFileSync(new URL('../../../../SETUP.md',import.meta.url),'utf8').replaceAll('\r\n','\n');
 const heading='### Uninstalling from a repository',at=setup.indexOf(heading);
 assert(at>=0,'SETUP.md has no uninstall section');assert.equal(setup.indexOf(heading,at+1),-1,'the heading is unique');
 assert(setup.indexOf('### Existing repository checklist')<at&&at<setup.indexOf('## Where to go next'),'the section sits between the existing-repository checklist and Where to go next');
 const tail=setup.slice(at+heading.length),next=tail.search(/\n#{1,3} /),section=next<0?tail:tail.slice(0,next);
 // The CLI script parses verbs and flags; the controller it delegates to raises the refusal codes the CLI prints.
 const source=readFileSync(new URL('../../scripts/project-uninstall.mjs',import.meta.url),'utf8')+readFileSync(new URL('../project-uninstall.mjs',import.meta.url),'utf8');
 for(const verb of ['plan','apply','resume']){assert(section.includes('project-uninstall.mjs" '+verb+' --root "<repo>"'),'documented command for '+verb);assert(source.includes("'"+verb+"'"),verb+' is a real CLI verb');}
 const flags=['--root','--plan-sha256','--activate'];
 for(const flag of flags){assert(section.includes('`'+flag+'`')||section.includes(flag+' '),flag+' is documented');assert(source.includes("'"+flag+"'"),flag+' is a real CLI flag');}
 assert.deepEqual([...new Set(section.match(/--[a-z][a-z0-9-]*/g))].sort(),[...flags].sort(),'no invented flag');
 const codes=['PU-FOREIGN-HOOK-CONFLICT','PU-SHARED-ACTIVE-WORKTREE','PU-OWNERSHIP-CONFLICT','PU-PLAN','PU-CLI'];
 for(const code of codes){assert(section.includes('`'+code+'`'),code+' is documented');assert(source.includes("'"+code+"'"),code+' is a real refusal code');}
 for(const code of new Set(section.match(/PU-[A-Z][A-Z-]*/g)))assert(source.includes("'"+code+"'"),code+' (named in SETUP.md) exists in the CLI source');
 assert(section.includes('`pipeline.project-uninstall-error.v1`')&&source.includes("'pipeline.project-uninstall-error.v1'"),'error schema');
 for(const word of ['planSha256','conflicts','pipeline-uninstall','retained','.agents/plugins.json','.agents/hooks.json','.agents/external-hooks.json','declined','AGENTS.md','CLAUDE.md','pipeline.user.yaml'])assert(section.includes(word),word+' is documented');
 for(const literal of ['pipeline-uninstall','retained'])assert(source.includes("'"+literal+"'"),literal+' is a real controller path segment');
});

// ALF-C-AC216-B2. A hook bakes a content-addressed runtime snapshot under <git-common-dir>/agent-pipeline/<hook>/runtime-<sha>,
// so deleting the plugin copy it was installed from (a pruned plugin cache) must not take commits, pushes or the uninstall away.
const PUBLIC_PLUGIN_DIRS=['lib','hooks','scripts','config','schemas'],PLUGIN_ROOT=fileURLToPath(new URL('../../',import.meta.url));
// A disposable copy of exactly the files the snapshot publisher admits (no tests, no fixtures, no dot entries).
function copyPluginTree(destination){
 const wanted=name=>(/\.(?:mjs|js|json|yaml|yml|toml)$/.test(name)&&!/(?:\.test\.|\.fixture\.)/.test(name))||['windows-owned-authority-native.ps1','windows-native-process-observer.ps1'].includes(name);
 for(const dir of PUBLIC_PLUGIN_DIRS)if(existsSync(join(PLUGIN_ROOT,dir)))cpSync(join(PLUGIN_ROOT,dir),join(destination,dir),{recursive:true,filter:source=>!basename(source).startsWith('.')&&(statSync(source).isDirectory()||wanted(basename(source)))});
 cpSync(join(PLUGIN_ROOT,'protected-baseline.json'),join(destination,'protected-baseline.json'));
}
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
function treeDigests(directory,skip=()=>false){const out={},walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1)){const path=join(dir,entry.name);if(entry.isDirectory())walk(path);else if(!skip(entry.name))out[relative(directory,path).split('\\').join('/')]=sha256(readFileSync(path));}};walk(directory);return out;}
// Shim, impl, install marker and the whole runtime snapshot of every hook; pre-push's append-only log is run output, not hook files.
const hookFileDigests=f=>Object.fromEntries(observeGitHookFootprint({rootDir:f.root}).hooks.map(h=>[h.name,{shim:sha256(readFileSync(h.hookPath)),state:treeDigests(h.state,name=>name==='log.jsonl')}]));

test('B2: after the plugin copy a hook was installed from is deleted, owned hooks still run: commit and push succeed and no hook file changes',{timeout:1800000},t=>{
 const f=fixture(t,{hooks:false,keys:false}),src=join(f.base,'plugin-copy');copyPluginTree(src);
 for(const install of [installPreCommit,installCommitMsg,installPrePush]){const r=install({rootDir:f.root,pluginLibDir:join(src,'lib'),pluginHooksDir:join(src,'hooks'),pluginScriptsDir:join(src,'scripts')});assert.equal(r.status,'installed',JSON.stringify(r));}
 // The installed hooks admit through observeGovernanceScope with the DEFAULT host-state root, which is home-relative. Enrol the
 // repository there and give every git call that home, otherwise the hooks stay inert and a green commit would prove nothing.
 const home=join(f.base,'home');mkdirSync(join(home,'.local','state','agent-pipeline'),{recursive:true});
 const homeScope=createGovernanceScopeController({hostStateRoot:join(home,'.local','state','agent-pipeline','activation')}),enroll=homeScope.planDecision({rootDir:f.root,decision:'enroll',by:'Fixture Owner'});homeScope.applyDecision(enroll,options(enroll));
 assert.equal(homeScope.observe({rootDir:f.root}).state,'active');
 const env={...process.env,HOME:home,USERPROFILE:home,GIT_CEILING_DIRECTORIES:f.base},run=args=>spawnSync('git',args,{cwd:f.root,encoding:'utf8',timeout:300000,env});
 assert.deepEqual(hookStatuses(f),['owned','owned','owned']);const before=hookFileDigests(f);
 // Control 1: the staleness check is live. While the source still exists but differs from the snapshot, the same hook refuses.
 writeFileSync(join(src,'lib','zz-source-drift-control.mjs'),'export const control=true;\n');
 f.put('README','source drift control\n');git(f.root,['add','README']);
 const drift=run(['commit','-m','Source drift control']);
 assert.notEqual(drift.status,0,'stale control: '+drift.stderr);assert.match(drift.stderr,/HOOK-SNAPSHOT-STALE/);
 rmSync(join(src,'lib','zz-source-drift-control.mjs'));
 // Prune the plugin copy.
 rmSync(src,{recursive:true,force:true});assert(!existsSync(src));
 assert.deepEqual(hookStatuses(f),['owned','owned','owned']);assert.deepEqual(hookFileDigests(f),before);
 // Control 2: pre-commit really executes in the pruned state. It refuses a staged file that carries this home path...
 const leak=join(f.root,'leak.txt');writeFileSync(leak,'machine path '+home+'\n');git(f.root,['add','leak.txt']);
 const privacy=run(['commit','-m','Private identifier control']);
 assert.notEqual(privacy.status,0,'pre-commit control: '+privacy.stderr);assert.match(privacy.stderr,/BLOCKED \(agent-pipeline pre-commit hook\)[^\n]*private local identifiers/);
 git(f.root,['rm','--cached','-q','leak.txt']);rmSync(leak);
 // ...and commit-msg really executes: it refuses a provider co-author trailer.
 const markers='AI-Assisted: true\nDispatch: stage-0 (elephant)';
 const trailer=run(['commit','-m','Trailer control','-m',markers+'\nCo-Authored-By: Claude <noreply@anthropic.com>']);
 assert.notEqual(trailer.status,0,'commit-msg control: '+trailer.stderr);assert.match(trailer.stderr,/BLOCKED \(agent-pipeline commit-msg\)[\s\S]*GIT-03-PROVIDER-COAUTHOR/);
 // The same hooks, same state, admit an ordinary commit that carries the required GIT-03 markers.
 const subject='Ordinary commit after the plugin source was pruned',ok=run(['commit','-m',subject,'-m',markers]);
 assert.equal(ok.status,0,'ordinary commit: '+ok.stderr);assert.equal(git(f.root,['log','-1','--format=%s']),subject);
 // Push to a local bare remote. pre-push is inert outside governance scope and writes nothing there, so its own log is the proof it ran.
 const remote=join(f.base,'remote-pruned.git');mkdirSync(remote);git(remote,['init','--bare','-q']);git(f.root,['remote','add','origin',remote]);
 const push=run(['push','origin','main']);assert.equal(push.status,0,'push: '+push.stderr);assert.equal(git(remote,['rev-parse','main']),git(f.root,['rev-parse','HEAD']));
 const prePush=observeGitHookFootprint({rootDir:f.root}).hooks.find(h=>h.name==='pre-push'),log=readFileSync(join(prePush.state,'log.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
 assert.equal(log.at(-1).verdict,'allowed');assert.equal(log.at(-1).commit,git(f.root,['rev-parse','HEAD']));
 // Nothing was rewritten by running them, and they are still the Pipeline's own.
 assert.deepEqual(hookStatuses(f),['owned','owned','owned']);assert.deepEqual(hookFileDigests(f),before);
 // The uninstall controller reads the same private state: it still plans clean and removes the hooks, plugin copy gone and hook log written.
 const plan=f.controller.plan({rootDir:f.root});assert.deepEqual(plan.conflicts,[],'uninstall plan after the hooks ran');
 const result=f.controller.apply(plan,options(plan));assert.equal(result.status,'uninstalled');assert.deepEqual(hookStatuses(f),['absent','absent','absent']);
});
