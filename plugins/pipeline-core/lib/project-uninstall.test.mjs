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
import {cpSync,linkSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import {tmpdir, devNull} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
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
 assert.throws(()=>f.controller.apply(plan,options(plan)),e=>e.code===(change==='drift'?'PU-PREIMAGE-DRIFT':change==='foreign-hook'?'PU-FOREIGN-HOOK-CONFLICT':'PU-OWNERSHIP-CONFLICT'));assert.deepEqual(readFileSync(join(f.root,'.git/config')),config);assert.deepEqual(observeGitHookFootprint({rootDir:f.root}),hooks);assert.deepEqual(f.digests(),bytes);assert(!existsSync(plan.controls));
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
function ac34Artifacts(f){return observeGitHookFootprint({rootDir:f.root}).hooks.flatMap(h=>[h.hookPath,h.markerPath,h.implPath]).filter(p=>existsSync(p)).map(p=>[p,footprintSha256(readFileSync(p))]);}
function ac34Refusal(f,hookName,foreignBytes){
 const hookPath=join(f.root,'.git/hooks',hookName),keyPath=join(f.base,'home/.keys/fixture.key');f.put('.git/hooks/'+hookName,foreignBytes);mkdirSync(dirname(keyPath),{recursive:true});writeFileSync(keyPath,'fixture-key-bytes\n');
 const hookBefore=readFileSync(hookPath),artifacts=ac34Artifacts(f),content=f.digests(),keyBefore=readFileSync(keyPath),config=readFileSync(join(f.root,'.git/config'));
 const plan=f.controller.plan({rootDir:f.root}),conflict=plan.conflicts.find(c=>c.code==='PU-FOREIGN-HOOK-CONFLICT');
 assert(conflict,'expected PU-FOREIGN-HOOK-CONFLICT, got '+JSON.stringify(plan.conflicts));assert.equal(conflict.path,hookPath);
 assert.throws(()=>f.controller.apply(plan,options(plan)),e=>e.code==='PU-FOREIGN-HOOK-CONFLICT'&&e.instructions?.removed===false&&typeof e.instructions?.attendedStep==='string'&&e.instructions.attendedStep.length>0&&e.instructions.hook==='.git/hooks/'+hookName);
 assert.deepEqual(readFileSync(hookPath),hookBefore);assert.deepEqual(ac34Artifacts(f),artifacts);assert.deepEqual(f.digests(),content);assert.deepEqual(readFileSync(keyPath),keyBefore);assert.deepEqual(readFileSync(join(f.root,'.git/config')),config);assert.equal(f.scope.observe({rootDir:f.root}).state,'active');
}
test('AC34: a foreign pre-commit hook is refused with PU-FOREIGN-HOOK-CONFLICT naming the file and nothing is removed',t=>{
 ac34Refusal(fixture(t,{hooks:false}),'pre-commit','#!/bin/sh\nexit 0\n');
});
test('AC34: a pipeline hook chaining a foreign hook is refused with PU-FOREIGN-HOOK-CONFLICT and nothing is removed',t=>{
 const f=fixture(t),hookPath=join(f.root,'.git/hooks/pre-commit');
 ac34Refusal(f,'pre-commit',readFileSync(hookPath,'utf8')+'\n# chained foreign hook\n"$(dirname "$0")/pre-commit.foreign" "$@" || exit $?\n');
});
test('AC34: control - only pipeline-owned hooks are removed and project data, backlog, specs and fixture keys stay untouched',t=>{
 const f=fixture(t),keyPath=join(f.base,'home/.keys/fixture.key');mkdirSync(dirname(keyPath),{recursive:true});writeFileSync(keyPath,'fixture-key-bytes\n');
 const keyBefore=readFileSync(keyPath),before=f.digests(),plan=f.controller.plan({rootDir:f.root});assert.deepEqual(plan.conflicts,[]);assert.deepEqual(plan.git.hooks.map(h=>h.status),['owned','owned','owned']);
 const markers=plan.git.hooks.map(h=>h.markerPath);assert(markers.every(p=>existsSync(p)));
 f.controller.apply(plan,options(plan));completed(f,plan);
 assert.deepEqual(f.digests(),before);assert.deepEqual(readFileSync(keyPath),keyBefore);assert(existsSync(join(f.root,'backlog/notes.md')));assert(existsSync(join(f.root,'specs/promoted/spec.md')));
 for(const h of plan.git.hooks)assert(!existsSync(h.hookPath)&&!existsSync(h.implPath)&&!existsSync(h.markerPath));
});
test('AC34-T3: after a foreign-hook refusal ordinary commit and push still work and history is intact',t=>{
 const f=fixture(t,{hooks:false});ac34Refusal(f,'pre-commit','#!/bin/sh\nexit 0\n');
 const before=git(f.root,['rev-parse','HEAD']),remote=join(f.base,'remote.git');mkdirSync(remote);git(remote,['init','--bare','-q']);
 f.put('README','Product change after refused uninstall\n');git(f.root,['add','README']);git(f.root,['commit','-m','Ordinary commit after refusal']);git(f.root,['remote','add','origin',remote]);git(f.root,['push','origin','main']);
 const after=git(f.root,['rev-parse','HEAD']);assert.notEqual(after,before);assert.equal(git(remote,['rev-parse','main']),after);git(f.root,['merge-base','--is-ancestor',before,after]);
});
test('AC34-T3: CLI apply prints the typed refusal with instructions',t=>{
 const f=fixture(t,{hooks:false});f.put('.git/hooks/pre-commit','#!/bin/sh\nexit 0\n');
 const home=join(f.base,'cli-home');mkdirSync(join(home,'.local/state/agent-pipeline'),{recursive:true});cpSync(join(f.base,'host-state'),join(home,'.local/state/agent-pipeline/activation'),{recursive:true});
 const script=fileURLToPath(new URL('../scripts/project-uninstall.mjs',import.meta.url)),env={...process.env,HOME:home,USERPROFILE:home};
 const run=args=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',env,timeout:60000});
 const planned=run(['plan','--root',f.root]);assert.equal(planned.status,0,planned.stdout+planned.stderr);const plan=JSON.parse(planned.stdout);
 const r=run(['apply','--root',f.root,'--activate','--plan-sha256',plan.planSha256]);assert.equal(r.status,1,r.stdout+r.stderr);
 const out=JSON.parse(r.stdout);assert.equal(out.schema,'pipeline.project-uninstall-error.v1');assert.equal(out.status,'refused');assert.equal(out.code,'PU-FOREIGN-HOOK-CONFLICT');
 assert.equal(out.instructions?.hook,'.git/hooks/pre-commit');assert.equal(out.instructions?.removed,false);assert.equal(typeof out.instructions?.attendedStep,'string');assert(out.instructions.attendedStep.length>0);
});

// ALF-C-AC216-B4. An active pre-push hook appends its own log.jsonl to its private state directory (recordLog in
// scripts/pre-push-hook-install.mjs), so a repository that ever pushed with the hook active must still plan clean and
// uninstall: the log is the hook's own private state and is archived with the rest. Anything else stays foreign.
const LOG_SCHEMA='pipeline.pre-push-hook-log.v1',LOG_AT='2026-10-17T08:15:30.123Z',LOG_COMMIT='a'.repeat(40);
const logRecord=extra=>({schema:LOG_SCHEMA,at:LOG_AT,verdict:'allowed',commit:LOG_COMMIT,localRef:'refs/heads/main',remoteRef:'refs/heads/main',reasons:[],...extra});
const logLine=record=>JSON.stringify(record)+'\n',goodLog=logLine(logRecord());
// Every record shape recordLog can emit: allowed, allowed-with-warnings, blocked (with and without a commit), and the notes.
const realisticLog=[logRecord(),logRecord({note:'push gate not configured or off',reasons:undefined}),logRecord({verdict:'allowed-with-warnings',reasons:['a warning']}),logRecord({verdict:'blocked',reasons:['evaluation fault']}),{schema:LOG_SCHEMA,at:LOG_AT,verdict:'blocked',note:'ref deletion',localRef:'(delete)',remoteRef:'refs/heads/gone'}].map(logLine).join('');
const hookState=(f,name)=>observeGitHookFootprint({rootDir:f.root}).hooks.find(h=>h.name===name).state;
function privateFootprint(f){return {statuses:observeGitHookFootprint({rootDir:f.root}).hooks.map(h=>h.status),config:readFileSync(join(f.root,'.git/config')),content:f.digests(),scope:f.scope.observe({rootDir:f.root}).state};}
test('AC216-B4: a pre-push private directory holding the hook\'s own valid log.jsonl plans without a conflict, is archived with the rest, and the uninstall completes',t=>{
 const f=fixture(t),state=hookState(f,'pre-push'),log=join(state,'log.jsonl');writeFileSync(log,realisticLog);
 const before=f.digests(),plan=f.controller.plan({rootDir:f.root});
 assert.deepEqual(plan.conflicts,[],'a repository that pushed with the hook active must plan clean');
 const archive=plan.privateArchives.find(a=>a.path===state);assert(archive,'the pre-push private directory is planned for archiving');assert(archive.names.includes('log.jsonl'),'the log is part of the archived names');
 const result=f.controller.apply(plan,options(plan));assert.equal(result.status,'uninstalled');completed(f,plan);
 assert(!existsSync(state),'the live private directory left with the hook');
 const retained=join(result.retainedMetadataPath,'private-'+plan.privateArchives.indexOf(archive));
 assert.deepEqual(readFileSync(join(retained,'log.jsonl')),Buffer.from(realisticLog),'the log is archived byte for byte, not deleted');assert.deepEqual(f.digests(),before);
 // The same holds for an empty log and for a repository whose hook never logged at all.
 const empty=fixture(t);writeFileSync(join(hookState(empty,'pre-push'),'log.jsonl'),'');const emptyPlan=empty.controller.plan({rootDir:empty.root});assert.deepEqual(emptyPlan.conflicts,[]);
 empty.controller.apply(emptyPlan,options(emptyPlan));completed(empty,emptyPlan);
});
test('AC216-B4: a log.jsonl whose content is not exactly the pre-push hook\'s own record schema is foreign private state (PU-PRIVATE-FOREIGN) and nothing changes',t=>{
 const f=fixture(t),state=hookState(f,'pre-push'),log=join(state,'log.jsonl'),shims=f.controller.plan({rootDir:f.root}).git.hooks.map(h=>h.hookPath);
 const invalid=[
  ['a malformed line after a valid record',goodLog+'{"schema":"'+LOG_SCHEMA+'",\n'],
  ['a torn final line',goodLog+JSON.stringify(logRecord()).slice(0,40)],
  ['a blank line between records',goodLog+'\n'+goodLog],
  ['a record that is an array','[]\n'],['a record that is null','null\n'],['a record that is a string','"text"\n'],
  ['another schema version',logLine(logRecord({schema:'pipeline.pre-push-hook-log.v2'}))],['no schema',logLine(logRecord({schema:undefined}))],
  ['a timestamp that is not an ISO instant',logLine(logRecord({at:'yesterday'}))],['a timestamp that is not a string',logLine(logRecord({at:1760689000000}))],['no timestamp',logLine(logRecord({at:undefined}))],
  ['a verdict the hook never writes',logLine(logRecord({verdict:'approved'}))],['no verdict',logLine(logRecord({verdict:undefined}))],
  ['a key the hook never writes',logLine(logRecord({exfil:'x'}))],['a prototype key',goodLog.replace('{','{"__proto__":{"x":1},')],
  ['a commit that is not a string',logLine(logRecord({commit:7}))],['reasons that are not an array',logLine(logRecord({reasons:'text'}))],['a reason that is not a string',logLine(logRecord({reasons:['ok',{nested:true}]}))],
  ['bytes that are not UTF-8',Buffer.concat([Buffer.from(goodLog),Buffer.from([0xff,0xfe,0x0a])])],['foreign text','user notes\n'],
 ];
 const baseline=privateFootprint(f);
 for(const [name,bytes] of invalid){
  writeFileSync(log,bytes);const plan=f.controller.plan({rootDir:f.root});
  assert.deepEqual(plan.conflicts.map(c=>[c.code,c.path]),[['PU-PRIVATE-FOREIGN',state]],name);
  assert.throws(()=>f.controller.apply(plan,options(plan)),e=>e.code==='PU-OWNERSHIP-CONFLICT',name);assert(!existsSync(plan.controls),name+': no controls were created');
  assert.deepEqual(readFileSync(log),Buffer.from(bytes),name+': the log itself is untouched');assert(shims.every(path=>existsSync(path)),name+': the shims stay');assert.deepEqual(privateFootprint(f),baseline,name);
 }
 // Control: the valid record next to which each of the above was written is itself admitted.
 writeFileSync(log,goodLog);assert.deepEqual(f.controller.plan({rootDir:f.root}).conflicts,[]);
});
test('AC216-B4: log.jsonl is admitted only as the pre-push hook\'s own regular file in a directory holding nothing else foreign',t=>{
 const f=fixture(t),state=hookState(f,'pre-push'),other=hookState(f,'pre-commit'),log=join(state,'log.jsonl'),outside=join(f.base,'outside.jsonl'),shims=f.controller.plan({rootDir:f.root}).git.hooks.map(h=>h.hookPath),baseline=privateFootprint(f);
 const refused=(name,at,code)=>{const plan=f.controller.plan({rootDir:f.root});assert.deepEqual(plan.conflicts.map(c=>[c.code,c.path]),[[code,at]],name);assert.throws(()=>f.controller.apply(plan,options(plan)),e=>e.code==='PU-OWNERSHIP-CONFLICT',name);assert(!existsSync(plan.controls),name);assert(shims.every(path=>existsSync(path)),name);};
 // A valid log next to a foreign extra file.
 writeFileSync(log,goodLog);writeFileSync(join(state,'notes.txt'),'foreign\n');refused('a foreign extra file beside a valid log',state,'PU-PRIVATE-FOREIGN');rmSync(join(state,'notes.txt'));
 // Only pre-push writes this file: the same valid record in another hook's private directory is foreign there.
 rmSync(log);writeFileSync(join(other,'log.jsonl'),goodLog);refused('a log.jsonl in the pre-commit private directory',other,'PU-PRIVATE-FOREIGN');rmSync(join(other,'log.jsonl'));
 // Same rigour as the decline marker: a regular file with one link and no symlink anywhere on the path.
 mkdirSync(log);refused('a directory named log.jsonl',state,'PU-FILE');rmSync(log,{recursive:true});
 writeFileSync(outside,goodLog);linkSync(outside,log);refused('a hard-linked log.jsonl',state,'PU-FILE');rmSync(log);
 let symlinked=true;try{symlinkSync(outside,log);}catch(e){if(!['EPERM','EACCES','ENOSYS','UNKNOWN'].includes(e.code))throw e;symlinked=false;}
 if(symlinked){refused('a symlinked log.jsonl',state,'PU-ALIAS');rmSync(log);}
 // Control: with the foreign shapes removed the directory plans clean again, and the host's symlink capability is the only variable above.
 writeFileSync(log,goodLog);assert.deepEqual(f.controller.plan({rootDir:f.root}).conflicts,[]);
 assert.deepEqual(readFileSync(outside,'utf8'),goodLog,'the file outside the private directory was never touched'+(symlinked?'':' (symlink creation unavailable on this host)'));
 assert.deepEqual(privateFootprint(f),baseline);
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 15) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
