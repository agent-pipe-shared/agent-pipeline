// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC05C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,cpSync,existsSync,symlinkSync} from 'node:fs';
import {tmpdir, devNull} from 'node:os';
import {join} from 'node:path';
import {createAntigravityRefreshHost,observeAntigravityLoadedTopologyWithWiring} from './antigravity-topology-refresh-host.mjs';
import {observeAntigravityLoadedTopology,observeAntigravityPluginTopology,planAntigravityTopologyRefresh} from './antigravity-plugin-topology.mjs';
function fixture(t,cliVersion='1.2.12'){
 const base=mkdtempSync(join(tmpdir(),'agy-refresh-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
 const configRoot=join(base,'gemini'),workspaceRoot=join(base,'workspace'),approvedSourceRoot=join(base,'source'),old=join(configRoot,'config','plugins','agent-pipeline-core'),foreign=join(base,'foreign');
 const put=(path,v)=>{mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,JSON.stringify(v)+'\n');};
 function source(path,name='agent-pipeline-core',marker='current'){mkdirSync(join(path,'hooks'),{recursive:true});put(join(path,'plugin.json'),{name,version:'0.7.0'});put(join(path,'hooks.json'),{'pipeline-core':{PreInvocation:[{type:'command',command:'node hooks/antigravity-start-hint.mjs'}]}});writeFileSync(join(path,'hooks','antigravity-start-hint.mjs'),'// metadata fixture '+marker+'\n');return path;}
 source(approvedSourceRoot);source(old,undefined,'stale');source(foreign,'foreign-plugin');mkdirSync(join(workspaceRoot,'.agents'),{recursive:true});
 const imports=join(configRoot,'config','import_manifest.json'),global=join(configRoot,'config','plugins.json'),local=join(workspaceRoot,'.agents','plugins.json');
 put(imports,{imports:[{name:'agent-pipeline-core',source:'antigravity'},{name:'foreign-plugin',source:'claude'}],preserved:'import-key'});
 const unrelated={path:foreign,enabled:false};put(global,{entries:[{path:approvedSourceRoot},unrelated],custom:{keep:true}});put(local,{entries:[unrelated]});
 const calls=[];let failAt=null,drift=null,noCopy=false,afterAction=null;
 const cli=argv=>{calls.push([...argv]);if(argv[0]==='--version')return {status:'ok',version:cliVersion};if(drift){drift();drift=null;}if(argv.includes(failAt))return {status:'failed'};
  if(argv[1]==='uninstall'){rmSync(old,{recursive:true});const v=JSON.parse(readFileSync(imports));put(imports,{...v,imports:v.imports.filter(x=>x.name!=='agent-pipeline-core')});}
  if(argv[1]==='install'&&!noCopy){cpSync(approvedSourceRoot,old,{recursive:true});const v=JSON.parse(readFileSync(imports));put(imports,{...v,imports:[...v.imports,{name:'agent-pipeline-core',source:'antigravity'}]});}
  if(afterAction)afterAction(argv);return {status:'ok'};};
 const args={configRoot,workspaceRoot,approvedSourceRoot,scope:'global',globalChangeApproved:true,runCli:cli,writeInstalledReceipt:()=>({status:'written'})};
 return {base,configRoot,workspaceRoot,approvedSourceRoot,old,foreign,imports,global,local,put,args,calls,setFailure:v=>{failAt=v;},setDrift:fn=>{drift=fn;},disableCopy:()=>{noCopy=true;},setAfterAction:fn=>{afterAction=fn;}};
}
test('sealed fixture refresh converges managed/import/global/workspace/wiring and preserves foreign metadata',t=>{
 const f=fixture(t),wire=join(f.configRoot,'config','external-hooks.json');f.put(wire,{hooks:[{type:'command',command:'node "'+join(f.old,'hooks','antigravity-start-hint.mjs')+'"'},{type:'command',command:'foreign-check --safe'}],foreign:{keep:true}});
 f.put(f.local,{entries:[{path:f.old},{path:f.foreign,enabled:false}],custom:'workspace'});
 const host=createAntigravityRefreshHost(f.args),r=host.refresh();assert.equal(r.status,'refreshed',JSON.stringify(r));assert.equal(r.requiresFreshExecutingSession,true);
 assert.deepEqual(f.calls.map(a=>a[1]),[undefined,'validate','uninstall','validate','install']);
 const imported=JSON.parse(readFileSync(f.imports));assert.equal(imported.preserved,'import-key');assert(imported.imports.some(e=>e.name==='foreign-plugin'));
 const global=JSON.parse(readFileSync(f.global));assert.deepEqual(global.custom,{keep:true});assert.deepEqual(global.entries[1],{path:f.foreign,enabled:false});
 // D79: the tracked registry never carries a machine path. This used to expect the absolute source appended after the foreign entry; a global refresh now only REMOVES the absolute Pipeline entry (QG-04 justification).
 const local=JSON.parse(readFileSync(f.local));assert.equal(local.custom,'workspace');assert.deepEqual(local.entries,[{path:f.foreign,enabled:false}]);
 const hooks=JSON.parse(readFileSync(wire));assert.equal(hooks.hooks[0].command,'node "'+join(f.approvedSourceRoot,'hooks','antigravity-start-hint.mjs')+'"');assert.equal(hooks.hooks[1].command,'foreign-check --safe');
 assert.equal(observeAntigravityLoadedTopology({loadedPluginRoot:f.old,configRoot:f.configRoot,workspaceRoot:f.workspaceRoot}).status,'current');
 const count=f.calls.length,r2=host.refresh();assert.equal(r2.status,'refreshed');assert.equal(r2.changed,false);assert.equal(f.calls.length,count+1,'only finite read-only version check on repeated converged refresh');
});
test('workspace intent refuses stale global retirement; explicit global approval enables registry-only retirement',t=>{
 const f=fixture(t),before=readFileSync(f.global);let r=createAntigravityRefreshHost({...f.args,scope:'workspace',globalChangeApproved:false}).refresh();assert.equal(r.reason,'ATR-GLOBAL-SCOPE');assert.deepEqual(readFileSync(f.global),before);assert.equal(f.calls.length,1);
 // D79: the tracked registry never carries a machine path. This used to refresh with the source OUTSIDE the workspace and assert the absolute source path appended to the workspace registry; that is the leak this decision closes, so the outside source is now refused (nothing changes) and the refresh is driven with the source inside the workspace, asserting the repo-relative path (QG-04 justification).
 const localBefore=readFileSync(f.local);r=createAntigravityRefreshHost({...f.args,scope:'workspace'}).refresh();assert.equal(r.status,'refused');assert.equal(r.reason,'ATR-WORKSPACE-SOURCE-OUTSIDE');assert.match(r.guidance,/global option/);assert.equal(existsSync(f.old),true);assert.equal(f.calls.length,2,'only the two read-only version checks');assert.deepEqual(readFileSync(f.local),localBefore);assert.deepEqual(readFileSync(f.global),before);
 const g=fixture(t),inside=join(g.workspaceRoot,'plugins','pipeline-core');cpSync(g.approvedSourceRoot,inside,{recursive:true});
 r=createAntigravityRefreshHost({...g.args,approvedSourceRoot:inside,scope:'workspace'}).refresh();assert.equal(r.status,'refreshed',JSON.stringify(r));assert.equal(existsSync(g.old),false);assert.deepEqual(JSON.parse(readFileSync(g.local)).entries,[{path:g.foreign,enabled:false},{path:'plugins/pipeline-core'}]);assert.equal(JSON.parse(readFileSync(g.global)).entries.at(-1).path,inside,'the global registry keeps the absolute root');
});
test('empty workspace binds an existing matching managed copy and attests its exact source',t=>{
 // D79: the tracked registry never carries a machine path. The source used to lie outside the workspace and the workspace registry received its absolute path; the source now lies inside the workspace (global registry re-pointed to it) and the registry receives the repo-relative path (QG-04 justification).
 const f=fixture(t),inside=join(f.workspaceRoot,'plugins','pipeline-core');cpSync(f.approvedSourceRoot,inside,{recursive:true});rmSync(f.old,{recursive:true});cpSync(inside,f.old,{recursive:true});
 f.put(f.global,{entries:[{path:inside},{path:f.foreign,enabled:false}],custom:{keep:true}});
 rmSync(join(f.workspaceRoot,'.agents'),{recursive:true});
 const receipts=[];
 const host=createAntigravityRefreshHost({...f.args,approvedSourceRoot:inside,scope:'workspace',globalChangeApproved:false,writeInstalledReceipt:input=>{receipts.push(input);return {status:'written'};}});
 const plan=host.prepare();assert.equal(plan.status,'prepared',JSON.stringify(plan));
 assert.equal(plan.actions.some(action=>action.kind==='cli'),false);
 const result=host.apply(plan);assert.equal(result.status,'refreshed',JSON.stringify(result));
 assert.deepEqual(f.calls,[['--version'],['--version']]);
 assert.equal(existsSync(f.old),true);
 assert.deepEqual(JSON.parse(readFileSync(f.local)).entries,[{path:'plugins/pipeline-core'}]);
 assert.deepEqual(receipts,[{provider:'antigravity',plugin:{name:'pipeline-core',version:'0.7.0'},sourcePluginRoot:inside,installedPluginRoot:f.old}]);
 assert.equal(observeAntigravityLoadedTopology({loadedPluginRoot:f.old,configRoot:f.configRoot,workspaceRoot:f.workspaceRoot}).status,'current');
 assert.equal(observeAntigravityLoadedTopologyWithWiring({loadedPluginRoot:f.old,configRoot:f.configRoot,workspaceRoot:f.workspaceRoot}).status,'current');
 const rel=fixture(t),relSource=join(rel.workspaceRoot,'plugins','pipeline-core');cpSync(rel.approvedSourceRoot,relSource,{recursive:true});rmSync(rel.old,{recursive:true});
 const imports=JSON.parse(readFileSync(rel.imports));rel.put(rel.imports,{...imports,imports:imports.imports.filter(e=>e.name!=='agent-pipeline-core')});rel.put(rel.local,{entries:[{path:'plugins/pipeline-core'}]});
 const observed=observeAntigravityPluginTopology(rel.args);assert.equal(observed.registries.workspace.status,'observed');assert.equal(observed.registries.workspace.entries[0].root,relSource);assert.equal(observed.registries.workspace.entries[0].relative,true);
 // D79: a relative entry is a tracked, path-free binding that is never rewritten. These two lines used to expect a 'prepared' plan and a rebind of the entry to the absolute (outside) source; the outside source is now held/refused with the file untouched, and a source that IS the relative entry's root needs no change at all (QG-04 justification).
 const localBytes=readFileSync(rel.local);
 const held=planAntigravityTopologyRefresh({observation:observed,scope:'workspace',cliVersion:'1.2.14'});assert.equal(held.status,'held');assert.equal(held.reason,'AT-WORKSPACE-SOURCE-OUTSIDE');assert.match(held.guidance,/global option.*inside the workspace/);assert.deepEqual(held.actions,[]);
 assert.equal(createAntigravityRefreshHost({...rel.args,scope:'workspace',globalChangeApproved:false}).refresh().reason,'ATR-WORKSPACE-SOURCE-OUTSIDE');assert.deepEqual(readFileSync(rel.local),localBytes);
 rel.put(rel.global,{entries:[{path:relSource},{path:rel.foreign,enabled:false}]});
 const bound=observeAntigravityPluginTopology({...rel.args,approvedSourceRoot:relSource});
 assert.equal(planAntigravityTopologyRefresh({observation:bound,scope:'workspace',cliVersion:'1.2.14'}).status,'metadata-current');
 const boundResult=createAntigravityRefreshHost({...rel.args,approvedSourceRoot:relSource,scope:'workspace',globalChangeApproved:false}).refresh();assert.equal(boundResult.status,'refreshed',JSON.stringify(boundResult));assert.equal(boundResult.changed,false);assert.deepEqual(readFileSync(rel.local),localBytes);
 // A leaked absolute entry for the same source is replaced by the repo-relative path; a foreign entry stays.
 rel.put(rel.local,{entries:[{path:relSource},{path:rel.foreign,enabled:false}]});
 const leaked=planAntigravityTopologyRefresh({observation:observeAntigravityPluginTopology({...rel.args,approvedSourceRoot:relSource}),scope:'workspace',cliVersion:'1.2.14'});
 assert.equal(leaked.status,'prepared');assert.deepEqual(leaked.actions.map(a=>[a.kind,a.removeIndexes,a.appendPath]),[['registry-rebind',[0],'plugins/pipeline-core']]);
 assert.equal(createAntigravityRefreshHost({...rel.args,approvedSourceRoot:relSource,scope:'workspace',globalChangeApproved:false}).refresh().status,'refreshed');assert.deepEqual(JSON.parse(readFileSync(rel.local)).entries,[{path:rel.foreign,enabled:false},{path:'plugins/pipeline-core'}]);
 const globalRelative=fixture(t);globalRelative.put(globalRelative.global,{entries:[{path:'plugins/pipeline-core'}]});assert.equal(observeAntigravityPluginTopology(globalRelative.args).registries.global.status,'unavailable');
 const escaping=fixture(t);escaping.put(escaping.local,{entries:[{path:'../source'}]});assert.equal(observeAntigravityPluginTopology(escaping.args).registries.workspace.status,'unavailable');
 const aliased=fixture(t),alias=join(aliased.workspaceRoot,'plugins','pipeline-core');mkdirSync(join(alias,'..'),{recursive:true});symlinkSync(aliased.approvedSourceRoot,alias);aliased.put(aliased.local,{entries:[{path:'plugins/pipeline-core'}]});
 assert.equal(observeAntigravityPluginTopology(aliased.args).registries.workspace.status,'unavailable');
});
test('CLI interruption stops after actual partial uninstall; new explicit invocation recovers without hand-editing import metadata',t=>{
 const f=fixture(t);f.setFailure('install');const r=createAntigravityRefreshHost(f.args).refresh();assert.equal(r.status,'partial');assert.deepEqual(r.completed,['uninstall','validate']);assert(!existsSync(f.old));assert.equal(f.calls.length,5);
 f.setFailure(null);assert.equal(createAntigravityRefreshHost(f.args).refresh().status,'refreshed');
});
test('lying CLI success cannot replace physical managed-copy readback or attestation',t=>{
 const f=fixture(t);f.disableCopy();let r=createAntigravityRefreshHost(f.args).refresh();assert.equal(r.reason,'ATR-INSTALL-READBACK');assert.equal(r.status,'partial');
 const g=fixture(t);r=createAntigravityRefreshHost({...g.args,writeInstalledReceipt:()=>({status:'rejected'})}).refresh();assert.equal(r.reason,'ATR-ATTESTATION-FAILED');assert.equal(r.status,'partial');
});
test('source drift during lifecycle is detected before additional registry/wiring writes',t=>{
 const f=fixture(t),before=readFileSync(f.local);f.setDrift(()=>writeFileSync(join(f.approvedSourceRoot,'hooks','antigravity-start-hint.mjs'),'changed during uninstall'));
 const r=createAntigravityRefreshHost(f.args).refresh();assert.equal(r.reason,'ATR-SOURCE-DRIFT');assert.equal(f.calls.length,2);assert.deepEqual(readFileSync(f.local),before);
});
test('unknown pipeline-shaped wiring, shell expansion, alias and oversized configuration fail closed without destructive CLI',t=>{
 for(const command of ['node /deleted/plugins/pipeline-core/hooks/antigravity-start-hint.mjs','node "'+join(fixture(t).old,'hooks','antigravity-start-hint.mjs')+'"; echo injected']){
  const f=fixture(t);f.put(join(f.configRoot,'config','external-hooks.json'),{hooks:[{command}]});const r=createAntigravityRefreshHost(f.args).refresh();assert.equal(r.status,'refused');assert.equal(f.calls.length,1);
 }
 const f=fixture(t);rmSync(f.global);symlinkSync(f.local,f.global);assert.equal(createAntigravityRefreshHost(f.args).refresh().status,'refused');assert.equal(f.calls.length,1);
 const g=fixture(t);writeFileSync(g.global,' '.repeat(262145));assert.equal(createAntigravityRefreshHost(g.args).refresh().status,'refused');
});
test('arbitrary JSON callback and unknown CLI version never authorize refresh',t=>{
 const f=fixture(t);assert.throws(()=>createAntigravityRefreshHost({...f.args,runCli:{approved:true}}),/ATR-SEALED-CLI/);
 const before=readFileSync(f.imports);const r=createAntigravityRefreshHost({...f.args,runCli:()=>({status:'ok',version:'unobserved'})}).refresh();assert.equal(r.reason,'ATR-CLI-CAPABILITY');assert.deepEqual(readFileSync(f.imports),before);
});
test('observed Antigravity 1.2.13 admits the same bounded plugin refresh route',t=>{
 const f=fixture(t,'1.2.13');
 const observation=observeAntigravityPluginTopology(f.args);
 assert.equal(planAntigravityTopologyRefresh({observation,scope:'global',globalChangeApproved:true,cliVersion:'1.2.13'}).status,'prepared');
 for(const cliVersion of ['1.2.14','1.3.0','2.0.0'])assert.equal(planAntigravityTopologyRefresh({observation,scope:'global',globalChangeApproved:true,cliVersion}).status,'prepared');
 for(const cliVersion of ['1.2.11','1.1.99','0.99.99','unobserved'])assert.equal(planAntigravityTopologyRefresh({observation,scope:'global',globalChangeApproved:true,cliVersion}).reason,'AT-CLI-CAPABILITY-UNOBSERVED');
 const result=createAntigravityRefreshHost(f.args).refresh();
 assert.equal(result.status,'refreshed',JSON.stringify(result));
 assert.deepEqual(f.calls.map(argv=>argv[1]),[undefined,'validate','uninstall','validate','install']);
});
test('Antigravity 1.2.13 stale managed copy is refresh-required and the plan replaces it, never reports current',t=>{
 const f=fixture(t,'1.2.13'),loadedArgs={loadedPluginRoot:f.old,configRoot:f.configRoot,workspaceRoot:f.workspaceRoot};
 const staleBytes=readFileSync(join(f.old,'hooks','antigravity-start-hint.mjs'),'utf8');assert.match(staleBytes,/stale/);
 const loaded=observeAntigravityLoadedTopology(loadedArgs);
 assert.equal(loaded.status,'refresh-required',JSON.stringify(loaded));assert.equal(loaded.managedContentMismatch,true);assert.equal(loaded.loadedKind,'managed-copy');assert.notEqual(loaded.loadedContentSha256,loaded.sourceContentSha256);
 const wired=observeAntigravityLoadedTopologyWithWiring(loadedArgs);assert.notEqual(wired.status,'current');
 const observation=observeAntigravityPluginTopology(f.args),plan=planAntigravityTopologyRefresh({observation,scope:'global',globalChangeApproved:true,cliVersion:'1.2.13'});
 assert.equal(plan.status,'prepared',JSON.stringify(plan));assert.notEqual(plan.status,'metadata-current');
 assert.deepEqual(plan.actions.filter(a=>a.kind==='cli').map(a=>a.argv[1]),['validate','uninstall','validate','install']);
 // The host prepare() on an identically shaped fixture lists the same CLI order as the metadata planner (a second fixture keeps this fixture's recorded calls untouched).
 const prepared=createAntigravityRefreshHost(fixture(t,'1.2.13').args).prepare();assert.equal(prepared.status,'prepared',JSON.stringify(prepared));
 assert.deepEqual(prepared.actions.filter(a=>a.kind==='cli').map(a=>a.argv[1]),plan.actions.filter(a=>a.kind==='cli').map(a=>a.argv[1]));
 const result=createAntigravityRefreshHost(f.args).refresh();assert.equal(result.status,'refreshed',JSON.stringify(result));
 assert.deepEqual(f.calls.map(argv=>argv[1]),[undefined,'validate','uninstall','validate','install']);
 const replaced=readFileSync(join(f.old,'hooks','antigravity-start-hint.mjs'),'utf8');assert.doesNotMatch(replaced,/stale/);assert.match(replaced,/current/);
 const after=observeAntigravityLoadedTopology(loadedArgs);assert.equal(after.status,'current',JSON.stringify(after));assert.equal(after.managedContentMismatch,false);
});
test('PO decision 2026-10-14: live Antigravity 1.3.5 is admitted at prepare and refresh; lower or non-semver output stays refused',t=>{
 const f=fixture(t,'1.3.5'),host=createAntigravityRefreshHost(f.args);
 assert.equal(host.prepare().status,'prepared');
 const result=host.refresh();assert.equal(result.status,'refreshed',JSON.stringify(result));
 for(const version of ['1.2.11','1.1.99','agy 1.3.5','unobserved']){
  const g=fixture(t,version),h=createAntigravityRefreshHost(g.args);
  assert.equal(h.prepare().reason,'ATR-CLI-CAPABILITY',version);assert.equal(h.refresh().reason,'ATR-CLI-CAPABILITY',version);
 }
});
test('actual incident hooks.json surfaces and newly CLI-created wiring converge with untouched foreign command bytes',t=>{
 const f=fixture(t),globalHooks=join(f.configRoot,'config','hooks.json'),workspaceHooks=join(f.workspaceRoot,'.agents','hooks.json');
 f.put(workspaceHooks,{hooks:[{command:'node "'+join(f.old,'hooks','antigravity-start-hint.mjs')+'"'}]});
 f.setAfterAction(argv=>{if(argv[1]==='install')writeFileSync(globalHooks,' \n{ "hooks" : [ {"command":'+JSON.stringify('node "'+join(f.old,'hooks','antigravity-start-hint.mjs')+'"')+'},\n  { "command" : "foreign-check --safe", "custom" : "\\u00df" } ], "keep" : 1 }\n');});
 const r=createAntigravityRefreshHost(f.args).refresh();assert.equal(r.status,'refreshed',JSON.stringify(r));assert(r.completed.includes('post-cli-wiring-rebind'));
 assert(readFileSync(globalHooks,'utf8').includes('{ "command" : "foreign-check --safe", "custom" : "\\u00df" }'));assert(readFileSync(globalHooks,'utf8').endsWith(' ], "keep" : 1 }\n'));
 assert.equal(JSON.parse(readFileSync(workspaceHooks)).hooks[0].command,'node "'+join(f.approvedSourceRoot,'hooks','antigravity-start-hint.mjs')+'"');
});
test('CLI foreign registry/import drift is terminal partial failure, no subsequent compensation or receipt',t=>{
 const f=fixture(t);f.setAfterAction(argv=>{if(argv[1]==='uninstall')f.put(f.global,{entries:[{path:f.approvedSourceRoot}],custom:{keep:false}});});
 let r=createAntigravityRefreshHost(f.args).refresh();assert.equal(r.reason,'ATR-CLI-REGISTRY-DRIFT');assert.deepEqual(r.completed,['uninstall']);assert.equal(f.calls.length,3);
 const g=fixture(t);g.setAfterAction(argv=>{if(argv[1]==='install')g.put(g.imports,{imports:[{name:'agent-pipeline-core'}],preserved:'import-key'});});
 r=createAntigravityRefreshHost(g.args).refresh();assert.equal(r.reason,'ATR-CLI-FOREIGN-IMPORT-DRIFT');assert.equal(r.status,'partial');
});
test('prepare is read-only and apply accepts only the originating live plan once',t=>{
 const f=fixture(t),before=readFileSync(f.imports),host=createAntigravityRefreshHost(f.args),plan=host.prepare();
 assert.equal(plan.status,'prepared');assert.equal(Object.isFrozen(plan),true);assert.equal(Object.isFrozen(plan.actions),true);
 assert.deepEqual(f.calls,[['--version']]);assert.deepEqual(readFileSync(f.imports),before);
 assert.equal(host.apply(JSON.parse(JSON.stringify(plan))).reason,'ATR-UNOWNED-PLAN');
 assert.equal(createAntigravityRefreshHost(f.args).apply(plan).reason,'ATR-UNOWNED-PLAN');assert.equal(f.calls.length,1);
 const result=host.apply(plan);assert.equal(result.status,'refreshed',JSON.stringify(result));
 const count=f.calls.length;assert.equal(host.apply(plan).reason,'ATR-UNOWNED-PLAN');assert.equal(f.calls.length,count);
});
test('prepared source, actual hook bytes and registry preimages are bound before any mutation',t=>{
 for(const surface of ['source','hooks','registry']){
  const f=fixture(t),path=surface==='source'?join(f.approvedSourceRoot,'hooks','antigravity-start-hint.mjs'):surface==='hooks'?join(f.workspaceRoot,'.agents','hooks.json'):f.local;
  if(surface==='hooks')f.put(path,{hooks:[{command:'foreign-check --safe'}]});
  const host=createAntigravityRefreshHost(f.args),plan=host.prepare();assert.equal(plan.status,'prepared');
  writeFileSync(path,readFileSync(path,'utf8')+' \n');const before=readFileSync(f.imports);
  assert.equal(host.apply(plan).reason,'ATR-TOPOLOGY-DRIFT');assert.deepEqual(f.calls,[['--version']]);assert.deepEqual(readFileSync(f.imports),before);
  assert.equal(host.apply(plan).reason,'ATR-UNOWNED-PLAN','drift consumes the plan');
 }
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 15) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
