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
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAntigravityRefreshHost} from './antigravity-topology-refresh-host.mjs';
import {observeAntigravityLoadedTopology} from './antigravity-plugin-topology.mjs';
function fixture(t){
 const base=mkdtempSync(join(tmpdir(),'agy-refresh-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
 const configRoot=join(base,'gemini'),workspaceRoot=join(base,'workspace'),approvedSourceRoot=join(base,'source'),old=join(configRoot,'config','plugins','agent-pipeline-core'),foreign=join(base,'foreign');
 const put=(path,v)=>{mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,JSON.stringify(v)+'\n');};
 function source(path,name='agent-pipeline-core',marker='current'){mkdirSync(join(path,'hooks'),{recursive:true});put(join(path,'plugin.json'),{name,version:'0.7.0'});put(join(path,'hooks.json'),{'pipeline-core':{PreInvocation:[{type:'command',command:'node hooks/antigravity-start-hint.mjs'}]}});writeFileSync(join(path,'hooks','antigravity-start-hint.mjs'),'// metadata fixture '+marker+'\n');return path;}
 source(approvedSourceRoot);source(old,undefined,'stale');source(foreign,'foreign-plugin');mkdirSync(join(workspaceRoot,'.agents'),{recursive:true});
 const imports=join(configRoot,'config','import_manifest.json'),global=join(configRoot,'config','plugins.json'),local=join(workspaceRoot,'.agents','plugins.json');
 put(imports,{imports:[{name:'agent-pipeline-core',source:'antigravity'},{name:'foreign-plugin',source:'claude'}],preserved:'import-key'});
 const unrelated={path:foreign,enabled:false};put(global,{entries:[{path:approvedSourceRoot},unrelated],custom:{keep:true}});put(local,{entries:[unrelated]});
 const calls=[];let failAt=null,drift=null,noCopy=false,afterAction=null;
 const cli=argv=>{calls.push([...argv]);if(argv[0]==='--version')return {status:'ok',version:'1.2.12'};if(drift){drift();drift=null;}if(argv.includes(failAt))return {status:'failed'};
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
 assert.deepEqual(f.calls.map(a=>a[1]),[undefined,'uninstall','validate','install']);
 const imported=JSON.parse(readFileSync(f.imports));assert.equal(imported.preserved,'import-key');assert(imported.imports.some(e=>e.name==='foreign-plugin'));
 const global=JSON.parse(readFileSync(f.global));assert.deepEqual(global.custom,{keep:true});assert.deepEqual(global.entries[1],{path:f.foreign,enabled:false});
 const local=JSON.parse(readFileSync(f.local));assert.equal(local.custom,'workspace');assert.deepEqual(local.entries,[{path:f.foreign,enabled:false},{path:f.approvedSourceRoot}]);
 const hooks=JSON.parse(readFileSync(wire));assert.equal(hooks.hooks[0].command,'node "'+join(f.approvedSourceRoot,'hooks','antigravity-start-hint.mjs')+'"');assert.equal(hooks.hooks[1].command,'foreign-check --safe');
 assert.equal(observeAntigravityLoadedTopology({loadedPluginRoot:f.old,configRoot:f.configRoot,workspaceRoot:f.workspaceRoot}).status,'current');
 const count=f.calls.length,r2=host.refresh();assert.equal(r2.status,'refreshed');assert.equal(r2.changed,false);assert.equal(f.calls.length,count+1,'only finite read-only version check on repeated converged refresh');
});
test('workspace intent refuses global retirement; explicit global scope enables registry-only retirement',t=>{
 const f=fixture(t),before=readFileSync(f.global);let r=createAntigravityRefreshHost({...f.args,scope:'workspace',globalChangeApproved:false}).refresh();assert.equal(r.reason,'ATR-GLOBAL-SCOPE');assert.deepEqual(readFileSync(f.global),before);assert.equal(f.calls.length,1);
 r=createAntigravityRefreshHost({...f.args,scope:'workspace'}).refresh();assert.equal(r.status,'refreshed');assert.equal(existsSync(f.old),false);assert.equal(JSON.parse(readFileSync(f.local)).entries.at(-1).path,f.approvedSourceRoot);
});
test('CLI interruption stops after actual partial uninstall; new explicit invocation recovers without hand-editing import metadata',t=>{
 const f=fixture(t);f.setFailure('install');const r=createAntigravityRefreshHost(f.args).refresh();assert.equal(r.status,'partial');assert.deepEqual(r.completed,['uninstall','validate']);assert(!existsSync(f.old));assert.equal(f.calls.length,4);
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
 let r=createAntigravityRefreshHost(f.args).refresh();assert.equal(r.reason,'ATR-CLI-REGISTRY-DRIFT');assert.deepEqual(r.completed,['uninstall']);assert.equal(f.calls.length,2);
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
if (completionCases.length !== 11) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
