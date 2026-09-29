// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "UC02C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createProjectUninstallController,PROJECT_UNINSTALL_FAULT_STAGES} from './project-uninstall.mjs';
import {createGovernanceScopeController} from './governance-scope.mjs';
import {footprintSha256,observeGitHookFootprint} from './git-hook-footprint.mjs';
import {loadRunnerProfilesV3Registry} from './runner-profiles-v3.mjs';
import {planRuntimeProjectionV3,readRuntimeProjectionV3Baselines,codexCustomAgentSeed} from './runtime-projection-v3.mjs';
import {applyInstall as installPreCommit} from '../scripts/pre-commit-hook-install.mjs';
import {applyInstall as installCommitMsg} from '../scripts/commit-msg-hook-install.mjs';
import {applyInstall as installPrePush} from '../scripts/pre-push-hook-install.mjs';
import {main as uninstallCli} from '../scripts/project-uninstall.mjs';
import {fixture,git} from './project-uninstall.fixture.mjs';
const options=plan=>({activate:true,planSha256:plan.planSha256});
function completed(f,plan){const r=f.controller.resume({rootDir:f.root,...options(plan)});assert.equal(r.status,'uninstalled');assert.equal(r.implementationAuthority,false);assert.equal(f.scope.observe({rootDir:f.root}).state,'declined');assert.deepEqual(JSON.parse(readFileSync(r.journalPath)).completed,PROJECT_UNINSTALL_FAULT_STAGES.slice(1));assert(!r.journalPath.includes('/agent-pipeline/'));assert.deepEqual(observeGitHookFootprint({rootDir:f.root}).hooks.map(h=>h.status),['absent','absent','absent']);return r;}
test('default transaction preserves content/history and foreign bytes; retirement permits ordinary real commit and local bare push',t=>{
 const f=fixture(t),before=f.digests(),plan=f.controller.plan({rootDir:f.root});assert.deepEqual(plan.conflicts,[]);assert.equal(plan.preserveContent,true);assert.deepEqual(plan.git.hooks.map(h=>h.status),['owned','owned','owned']);
 const jsonBefore=readFileSync(join(f.root,'.claude/pipeline.json'),'utf8'),tomlBefore=readFileSync(join(f.root,'.codex/agents/implementor.toml'),'utf8');
 const r=f.controller.apply(plan,options(plan));assert.equal(r.status,'uninstalled');completed(f,plan);assert.deepEqual(f.digests(),before);assert.equal(git(f.root,['rev-parse','HEAD']),f.head);
 const jsonAfter=readFileSync(join(f.root,'.claude/pipeline.json'),'utf8');assert(jsonBefore.includes('"foreign" : { "escaped" : "\\u00df", "n" : 1e+2 }'));assert(jsonAfter.includes('"foreign" : { "escaped" : "\\u00df", "n" : 1e+2 }'));assert.equal(Object.hasOwn(JSON.parse(jsonAfter).humanRoles.po,'displayLabel'),false);assert.equal(JSON.parse(jsonAfter).humanRoles.po.custom,true);
 const tomlAfter=readFileSync(join(f.root,'.codex/agents/implementor.toml'),'utf8');assert(tomlBefore.includes('# foreign comment\n[foreign]\nmodel = "mine"\n'));assert(tomlAfter.includes('# foreign comment\n[foreign]\nmodel = "mine"\n'));assert(!/^model =/m.test(tomlAfter.split('[foreign]')[0]));
 const workspace=readFileSync(join(f.root,'.agents/plugins.json'),'utf8');assert(workspace.includes('{ "path" : '+JSON.stringify(f.foreign)+', "enabled" : false }'));assert(workspace.startsWith(' \n{ "custom" : "\\u00df"'));assert.equal(JSON.parse(workspace).entries.length,1);
 for(const path of ['.agents/hooks.json','.agents/external-hooks.json']){const bytes=readFileSync(join(f.root,path),'utf8');assert(bytes.startsWith(' \n{ "sentinel" : "\\u00df"'));assert(bytes.includes('{ "command" : "node foreign.mjs", "keep" : 1e+2 }'));assert.deepEqual(JSON.parse(bytes).hooks,[{command:'node foreign.mjs',keep:100}]);}
 const remote=join(f.base,'remote.git');mkdirSync(remote);git(remote,['init','--bare','-q']);f.put('README','Product change after retirement\n');git(f.root,['add','README']);git(f.root,['commit','-m','Ordinary post-uninstall commit']);git(f.root,['remote','add','origin',remote]);git(f.root,['push','origin','main']);assert.equal(git(remote,['rev-parse','main']),git(f.root,['rev-parse','HEAD']));
});
for(const change of ['foreign-hook','modified-key','drift'])test('refuse before mutation: '+change,t=>{
 if(change==='modified-key'){
  const modified=fixture(t),path='.agents/plugins.json',before=readFileSync(join(modified.root,path),'utf8'),value=JSON.parse(before);value.entries[0].userMetadata={keep:'exact'};
  const changed=JSON.stringify(value)+'\n';modified.put(path,changed);const refused=modified.controller.plan({rootDir:modified.root}),config=readFileSync(join(modified.root,'.git/config')),hooks=observeGitHookFootprint({rootDir:modified.root}),bytes=modified.digests();
  assert(refused.conflicts.some(c=>c.path===path&&c.code==='PU-WORKSPACE-WIRING-OWNERSHIP'));assert(!refused.footprint.actions.some(a=>a.path===path));
  assert.throws(()=>modified.controller.apply(refused,options(refused)),e=>e.code==='PU-OWNERSHIP-CONFLICT');
  assert.equal(readFileSync(join(modified.root,path),'utf8'),changed);assert.deepEqual(readFileSync(join(modified.root,'.git/config')),config);assert.deepEqual(observeGitHookFootprint({rootDir:modified.root}),hooks);assert.deepEqual(modified.digests(),bytes);assert(!existsSync(refused.controls));assert.equal(modified.scope.observe({rootDir:modified.root}).state,'active');
 }
 if(change==='modified-key')for(const path of ['.agents/hooks.json','.agents/external-hooks.json'])for(const alteration of ['timeout','metadata','removed-field']){
  const modified=fixture(t),before=readFileSync(join(modified.root,path),'utf8');
  const changed=alteration==='timeout'?before.replace('"timeout" : 30','"timeout" : 999'):alteration==='removed-field'?before.replace(', "timeout" : 30',''):before.replace('"timeout" : 30','"timeout" : 30, "userMetadata" : { "keep" : "exact" }');
  modified.put(path,changed);const refused=modified.controller.plan({rootDir:modified.root}),config=readFileSync(join(modified.root,'.git/config')),hooks=observeGitHookFootprint({rootDir:modified.root}),bytes=modified.digests();
  assert(refused.conflicts.some(c=>c.path===path&&c.code==='PU-WORKSPACE-WIRING-OWNERSHIP'));
  assert.throws(()=>modified.controller.apply(refused,options(refused)),e=>e.code==='PU-OWNERSHIP-CONFLICT');
  assert.equal(readFileSync(join(modified.root,path),'utf8'),changed);assert.deepEqual(readFileSync(join(modified.root,'.git/config')),config);assert.deepEqual(observeGitHookFootprint({rootDir:modified.root}),hooks);assert.deepEqual(modified.digests(),bytes);assert(!existsSync(refused.controls));assert.equal(modified.scope.observe({rootDir:modified.root}).state,'active');
 }
 const f=fixture(t,{hooks:change!=='foreign-hook'});if(change==='foreign-hook')f.put('.git/hooks/pre-commit','#!/bin/sh\nexit 0\n');if(change==='modified-key'){const path=join(f.root,'.claude/pipeline.json'),v=JSON.parse(readFileSync(path));v.humanRoles.po.displayLabel='Foreign Override';writeFileSync(path,JSON.stringify(v));}
 const plan=f.controller.plan({rootDir:f.root});if(change==='drift')f.put('.agents/plugins.json','{"entries":[]}\n');const config=readFileSync(join(f.root,'.git/config')),hooks=observeGitHookFootprint({rootDir:f.root}),bytes=f.digests();
 assert.throws(()=>f.controller.apply(plan,options(plan)),e=>e.code===(change==='drift'?'PU-PREIMAGE-DRIFT':'PU-OWNERSHIP-CONFLICT'));assert.deepEqual(readFileSync(join(f.root,'.git/config')),config);assert.deepEqual(observeGitHookFootprint({rootDir:f.root}),hooks);assert.deepEqual(f.digests(),bytes);assert(!existsSync(plan.controls));
});
test('partial shim interruption resumes by exact original entry and private journal survives removal',t=>{
 for(const [stage,path,code] of [['keys','.claude/pipeline.json','PU-KEY-DRIFT'],['workspace','.agents/plugins.json','PU-WORKSPACE-DRIFT'],['workspace','.agents/hooks.json','PU-WORKSPACE-DRIFT'],['workspace','.agents/external-hooks.json','PU-WORKSPACE-DRIFT']]){
  const stale=fixture(t),p=stale.controller.plan({rootDir:stale.root}),original=readFileSync(join(stale.root,path));assert.throws(()=>stale.controller.apply(p,{...options(p),crashAt:stage}),/PU-SIMULATED/);writeFileSync(join(stale.root,path),original);
  const journal=join(p.controls,p.planSha256,'journal.json'),before=readFileSync(journal);assert.throws(()=>stale.controller.resume({rootDir:stale.root,...options(p)}),e=>e.code===code);assert.deepEqual(readFileSync(journal),before);assert(p.privateArchives.every(a=>existsSync(a.path)));assert.deepEqual(readFileSync(join(stale.root,path)),original);
 }
 const collision=fixture(t);collision.put('.agents/hooks.json','{"hooks":[{"command":"node /unproved/pipeline-core/hooks/antigravity-pretool-guard.mjs"}]}');const collisionPlan=collision.controller.plan({rootDir:collision.root});assert(collisionPlan.conflicts.some(c=>c.code==='PU-WORKSPACE-WIRING-OWNERSHIP'));assert.throws(()=>collision.controller.apply(collisionPlan,options(collisionPlan)),e=>e.code==='PU-OWNERSHIP-CONFLICT');assert(!existsSync(collisionPlan.controls));
 const f=fixture(t),plan=f.controller.plan({rootDir:f.root}),before=f.digests();assert.throws(()=>f.controller.apply(plan,{...options(plan),crashDuringShim:'pre-commit'}),/PU-SIMULATED-AFTER-SHIM/);assert.equal(observeGitHookFootprint({rootDir:f.root}).hooks[0].status,'owned-partial');assert.equal(f.scope.observe({rootDir:f.root}).state,'active');
 const next=createProjectUninstallController({hostStateRoot:join(f.base,'host-state')}),r=next.resume({rootDir:f.root,...options(plan)});assert.equal(r.status,'uninstalled');completed(f,plan);assert.deepEqual(f.digests(),before);assert(existsSync(r.journalPath));assert(plan.privateArchives.every(a=>!existsSync(a.path)));
});
test('post-decline crash is durable; repeated new-controller resume is idempotent and CLI reads the same completion',t=>{
 const f=fixture(t),plan=f.controller.plan({rootDir:f.root}),before=f.digests();assert.throws(()=>f.controller.apply(plan,{...options(plan),crashAt:'decline'}),/PU-SIMULATED-decline/);assert.equal(f.scope.observe({rootDir:f.root}).state,'declined');assert(plan.privateArchives.every(a=>existsSync(a.path)));
 const fresh=createProjectUninstallController({hostStateRoot:join(f.base,'host-state')}),r=fresh.resume({rootDir:f.root,...options(plan)}),raw=readFileSync(r.journalPath);completed(f,plan);assert.deepEqual(readFileSync(r.journalPath),raw);assert.deepEqual(f.digests(),before);
 let output;assert.equal(uninstallCli(['resume','--root',f.root,'--activate','--plan-sha256',plan.planSha256],{write:v=>{output=v;}}),0);assert.equal(output.status,'uninstalled');assert.deepEqual(readFileSync(r.journalPath),raw);
 // A real reinstall can reuse the same state directory and runtime snapshot.
 // Completed shim removal must not authorize archiving that fresh implementation.
 const reinstalled=fixture(t),reinstallPlan=reinstalled.controller.plan({rootDir:reinstalled.root}),contentBefore=reinstalled.digests();
 assert.throws(()=>reinstalled.controller.apply(reinstallPlan,{...options(reinstallPlan),crashAt:'decline'}),/PU-SIMULATED-decline/);
 const hook=reinstallPlan.git.hooks.find(h=>h.name==='pre-commit'),stateBefore=statSync(hook.state),runtimeBefore=readdirSync(hook.state).filter(name=>name.startsWith('runtime-'));
 assert.equal(runtimeBefore.length,1);assert(!existsSync(hook.hookPath));assert(!existsSync(hook.implPath));
 const source=join(reinstalled.base,'minimal-public-source');
 assert.equal(installPreCommit({rootDir:reinstalled.root,pluginLibDir:join(source,'lib'),pluginHooksDir:join(source,'hooks'),pluginScriptsDir:join(source,'scripts')}).status,'installed');
 const stateAfter=statSync(hook.state);assert.equal(stateAfter.dev,stateBefore.dev);assert.equal(stateAfter.ino,stateBefore.ino);assert.deepEqual(readdirSync(hook.state).filter(name=>name.startsWith('runtime-')),runtimeBefore);
 assert.equal(observeGitHookFootprint({rootDir:reinstalled.root}).hooks[0].status,'owned');
 const retained=join(reinstallPlan.controls,reinstallPlan.planSha256,'retained'),journalPath=join(reinstallPlan.controls,reinstallPlan.planSha256,'journal.json'),journalBefore=readFileSync(journalPath),retainedBefore=readdirSync(retained),mechanicsBefore=[hook.hookPath,hook.implPath,hook.markerPath].map(path=>readFileSync(path));
 for(let attempt=0;attempt<2;attempt++){
  const recovery=createProjectUninstallController({hostStateRoot:join(reinstalled.base,'host-state')});
  assert.throws(()=>recovery.resume({rootDir:reinstalled.root,...options(reinstallPlan)}),e=>e.code==='PU-EXECUTABLE-REMAINS');
  assert.deepEqual(readFileSync(journalPath),journalBefore);assert.deepEqual(readdirSync(retained),retainedBefore);assert(reinstallPlan.privateArchives.every(a=>existsSync(a.path)));
  assert.deepEqual([hook.hookPath,hook.implPath,hook.markerPath].map(path=>readFileSync(path)),mechanicsBefore);assert.deepEqual(reinstalled.digests(),contentBefore);
  assert.equal(reinstalled.scope.observe({rootDir:reinstalled.root}).state,'declined');
 }
});
test('re-enrollment contract retains historical scope identity and does not retire unrelated approval-store bytes',t=>{
 const f=fixture(t,{keys:false}),path='.git/agent-pipeline/po-gate/retained-public-note.json';f.put(path,'{"history":"not-an-authority-receipt"}\n');const before=readFileSync(join(f.root,path)),key=f.scope.observe({rootDir:f.root}).scopeKey,plan=f.controller.plan({rootDir:f.root});f.controller.apply(plan,options(plan));const reenroll=f.scope.planDecision({rootDir:f.root,decision:'enroll',by:'Fixture Owner'});f.scope.applyDecision(reenroll,options(reenroll));assert.equal(f.scope.observe({rootDir:f.root}).state,'active');assert.equal(f.scope.observe({rootDir:f.root}).scopeKey,key);assert.deepEqual(readFileSync(join(f.root,path)),before);
 const journal=join(plan.controls,plan.planSha256,'journal.json'),journalBefore=readFileSync(journal);assert.throws(()=>f.controller.resume({rootDir:f.root,...options(plan)}),e=>e.code==='PU-DECLINE-READBACK');assert.deepEqual(readFileSync(journal),journalBefore);assert.equal(f.scope.observe({rootDir:f.root}).state,'active');
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 7) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
