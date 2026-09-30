// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC19C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,cpSync,rmSync,existsSync,symlinkSync,utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {refreshAntigravityInstallation} from '../install-agy.mjs';
import {resolveAntigravityRegistryInstalledRoot} from './installed-plugin-attestation-host.mjs';
import {observePipelineStartPreflight,pipelineStartPreflightExitCode,freshnessHostActionForPreflight,observeAntigravityHardEnforcement} from './pipeline-start-preflight.mjs';
import {createGovernanceScopeController} from '../lib/governance-scope.mjs';
import {observeAntigravityLoadedTopologyWithWiring,observeAntigravityWorkspaceBindings,removeAntigravityWorkspaceRegistration} from '../lib/antigravity-topology-refresh-host.mjs';
import {rewriteAntigravityJsonBytes} from '../lib/antigravity-json-spans.mjs';
function fixture(t){
 const base=mkdtempSync(join(tmpdir(),'agy-integrated-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
 const cfg=join(base,'gemini'),work=join(base,'workspace'),source=join(base,'source'),copy=join(cfg,'config','plugins','agent-pipeline-core');
 mkdirSync(join(cfg,'config','plugins'),{recursive:true});mkdirSync(join(work,'.agents'),{recursive:true});mkdirSync(join(source,'hooks'),{recursive:true});mkdirSync(join(source,'scripts'));
 const put=(path,v)=>writeFileSync(path,JSON.stringify(v)+'\n');put(join(source,'plugin.json'),{name:'agent-pipeline-core',version:'0.7.0'});put(join(source,'hooks.json'),{'pipeline-core':{PreInvocation:[{type:'command',command:'node hooks/antigravity-start-hint.mjs'}]}});writeFileSync(join(source,'hooks','antigravity-start-hint.mjs'),'// controlled fixture\n');
 put(join(cfg,'config','plugins.json'),{entries:[{path:source}]});const controller=createGovernanceScopeController({hostStateRoot:join(base,'private-scope')});
 const scope=()=>controller.observe({rootDir:work});
 const observe=(root=source)=>observePipelineStartPreflight({env:{ANTIGRAVITY_AGENT:'1'},cwd:work,scriptUrl:pathToFileURL(join(root,'scripts','pipeline-start-preflight.mjs')).href,antigravityConfigRoot:cfg,observeGovernanceScopeFn:scope,pluginList:()=>JSON.stringify({installed:[]}),observeAntigravityHardEnforcementFn:()=>({observed:true}),observePrePushHookInstallationFn:()=>({state:'repository-unresolved'}),observeUnseenPushToRemoteFn:()=>({state:'not-checked'}),requireProjectOnboardingReadyFn:()=>({status:'ready'}),observeArchitectureAdoptionOrientationFn:()=>({status:'not-required'}),inspectEffectiveArchitectureDecisionsFn:()=>({status:'advisory',projectionSha256:'a'.repeat(64),decisions:[],activeExceptions:[],findings:[]})});
 const enroll=decision=>{const plan=controller.planDecision({rootDir:work,decision,by:'Fixture Owner'});controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256});};
 return {base,cfg,work,source,copy,put,controller,scope,observe,enroll};
}
test('actual inactive/declined scope precedes plugin/runtime callbacks; unrelated instructions and registration never activate',t=>{
 const f=fixture(t);writeFileSync(join(f.work,'AGENTS.md'),'unrelated instructions');
 let called=0;const options={env:{ANTIGRAVITY_AGENT:'1'},cwd:f.work,observeGovernanceScopeFn:f.scope,read:()=>{called++;throw Error('must not read');},pluginList:()=>{called++;throw Error('must not enumerate');},observeAntigravityLoadedTopologyFn:()=>{called++;throw Error('must not inspect distribution');}};
 let r=observePipelineStartPreflight(options);assert.equal(r.status,'pipeline-governance-inactive');assert.equal(r.pipelineWorkPerformed,false);assert.equal(called,0);assert.equal(pipelineStartPreflightExitCode(r),0);assert.equal(freshnessHostActionForPreflight(r),null);assert.equal(r.nextAction.kind,'command');assert.equal(r.nextAction.executable,process.execPath);assert.match(r.nextAction.argv[0],/onboarding-init\.mjs$/u);assert.deepEqual(r.nextAction.argv.slice(-4),['--root',f.work,'--runner','antigravity']);
 for(const [signal,runner] of [[{CLAUDECODE:'1'},'claude'],[{CODEX_THREAD_ID:'fixture'},'codex']]){
  const inactive=observePipelineStartPreflight({...options,env:signal});
  assert.equal(inactive.status,'pipeline-governance-inactive');
  assert.deepEqual(inactive.nextAction.argv.slice(-4),['--root',f.work,'--runner',runner]);
  assert.equal(inactive.nextAction.mutation,false);
 }
 f.enroll('decline');r=observePipelineStartPreflight(options);assert.equal(r.status,'pipeline-governance-declined');assert.equal(r.nextAction,null);assert.equal(called,0);assert(!existsSync(join(f.work,'scratch')));assert(!existsSync(join(f.work,'.git')));
});
test('malformed or unverifiable active scope is blocked rather than silently inactive',t=>{
 const f=fixture(t);let calls=0;for(const scope of [{schema:'pipeline.governance-scope.v1',state:'inactive',root:f.work,requiresEnforcement:true,hintAllowed:true},null]){const r=observePipelineStartPreflight({cwd:f.work,observeGovernanceScopeFn:()=>scope,read:()=>{calls++;return '';}});assert.equal(r.status,'pipeline-governance-unverifiable');assert.equal(pipelineStartPreflightExitCode(r),2);assert.equal(r.nextAction,null);}assert.equal(calls,0);
});
test('actual preflight detects stale same-version managed snapshot and gives explicit host repair action',t=>{
 const f=fixture(t);f.enroll('enroll');cpSync(f.source,f.copy,{recursive:true});writeFileSync(join(f.copy,'hooks','antigravity-start-hint.mjs'),'// stale same-version bytes\n');f.put(join(f.cfg,'config','import_manifest.json'),{imports:[{name:'agent-pipeline-core'}]});
 const r=f.observe();assert.equal(r.status,'antigravity-topology-refresh-required');assert.equal(r.antigravityTopology.managedContentMismatch,true);assert.equal(r.nextAction.executionBoundary,'host');assert.equal(r.nextAction.requiresConfirmation,true);assert.equal(pipelineStartPreflightExitCode(r),2);
 assert.equal(resolveAntigravityRegistryInstalledRoot({installedPluginRoot:f.source,configRoot:f.cfg,workspaceRoot:f.work}),null);
});
test('fresh matching managed topology resolves actual loaded root but remains distinct-copy attestation subject',t=>{
 const f=fixture(t);f.enroll('enroll');cpSync(f.source,f.copy,{recursive:true});f.put(join(f.cfg,'config','import_manifest.json'),{imports:[{name:'agent-pipeline-core'}]});
 assert.equal(resolveAntigravityRegistryInstalledRoot({installedPluginRoot:f.copy,configRoot:f.cfg,workspaceRoot:f.work}),f.copy);const r=f.observe(f.copy);assert.equal(r.antigravityTopology.loadedKind,'managed-copy');assert.equal(r.status,'plugin-attestation-required','matching inventory cannot manufacture external host receipt');
});
test('owned external hook command is diagnosed stale independently of equal source version',t=>{
 const f=fixture(t);cpSync(f.source,f.copy,{recursive:true});f.put(join(f.cfg,'config','import_manifest.json'),{imports:[{name:'agent-pipeline-core'}]});f.put(join(f.cfg,'config','external-hooks.json'),{hooks:[{command:'node "'+join(f.copy,'hooks','antigravity-start-hint.mjs')+'"'}]});
 const r=observeAntigravityLoadedTopologyWithWiring({loadedPluginRoot:f.source,configRoot:f.cfg,workspaceRoot:f.work});assert.equal(r.status,'refresh-required');assert.equal(r.wiringStatus,'stale-owned');
});
test('installer exported host route invokes sealed lifecycle and independent physical readback instead of registry-only success',t=>{
 const f=fixture(t),calls=[];const runCli=argv=>{calls.push(argv);if(argv[0]==='--version')return {status:'ok',version:'1.2.12'};if(argv[1]==='install'){cpSync(f.source,f.copy,{recursive:true});f.put(join(f.cfg,'config','import_manifest.json'),{imports:[{name:'agent-pipeline-core'}]});}return {status:'ok'};};
 const r=refreshAntigravityInstallation({configRoot:f.cfg,workspaceRoot:f.work,approvedSourceRoot:f.source,scope:'global',globalChangeApproved:true},{runCli,writeInstalledReceipt:()=>({status:'written'})});assert.equal(r.status,'refreshed',JSON.stringify(r));assert.deepEqual(calls.map(a=>a[0]==='--version'?'version':a[1]),['version','version','validate','install']);assert.equal(r.requiresFreshExecutingSession,true);
});
test('physical current-version lock diagnostics reject old, malformed, future and aliased locks',t=>{
 const f=fixture(t),run=join(f.work,'.git','agent-pipeline','run'),now=Date.UTC(2026,8,28,12,0,0),mtime=(now-1000)/1000;
 const lock=(id,value)=>{const dir=join(run,'session-'+id);mkdirSync(dir,{recursive:true});const path=join(dir,'requires-bootstrap.lock');writeFileSync(path,typeof value==='string'?value:JSON.stringify(value));utimesSync(path,mtime,mtime);return path;};
 const observe=(clock=now)=>observeAntigravityHardEnforcement({rootDir:f.work,currentVersion:'0.7.0',now:clock});
 lock('old',{version:'0.6.9'});lock('malformed','not-json');
 let r=observe();assert.equal(r.observed,false);assert.equal(r.reason,'antigravity-lock-version-mismatch');assert.deepEqual(r.recordedVersions,['0.6.9']);assert.equal(r.evidenceClass,'mutable-lock-metadata');
 const current=lock('current',{version:'0.7.0'});r=observe();assert.equal(r.observed,true);assert.equal(r.reason,undefined);
 r=observe(now-60000);assert.equal(r.observed,false,'future timestamps cannot establish observation');
 r=observe(now+86400000);assert.equal(r.observed,false,'even the physically current-version lock expires');assert.equal(r.reason,undefined,'stale mismatches are not current-session diagnostics');
 rmSync(current);const target=join(f.base,'current-lock.json');f.put(target,{version:'0.7.0'});utimesSync(target,mtime,mtime);symlinkSync(target,current);r=observe();assert.equal(r.observed,false,'aliased lock is not physical session evidence');
});
test('workspace uninstall uses exact physical ownership and byte-preserving surgery, never globals',t=>{
 const f=fixture(t),foreign=join(f.base,'foreign');mkdirSync(foreign);f.put(join(foreign,'plugin.json'),{name:'foreign-plugin',version:'1'});
 const path=join(f.work,'.agents','plugins.json'),bytes=' \n{ "custom" : { "unicode" : "ß" }, "entries" : [ {"path":'+JSON.stringify(f.source)+'},\n  { "path" : '+JSON.stringify(foreign)+', "enabled" : false } ], "tail":1 }\n';writeFileSync(path,bytes);const globalBefore=readFileSync(join(f.cfg,'config','plugins.json'));
 const o=observeAntigravityWorkspaceBindings({workspaceRoot:f.work});assert.deepEqual(o.ownedIndexes,[0]);assert.equal(removeAntigravityWorkspaceRegistration({workspaceRoot:f.work,expectedSha256:o.sha256}).status,'removed');const after=readFileSync(path,'utf8');assert(after.includes('{ "path" : '+JSON.stringify(foreign)+', "enabled" : false }'));assert(after.startsWith(' \n{ "custom" : { "unicode" : "ß" }, "entries" : ['));assert(after.endsWith(' ], "tail":1 }\n'));assert.deepEqual(readFileSync(join(f.cfg,'config','plugins.json')),globalBefore);
 assert.equal(removeAntigravityWorkspaceRegistration({workspaceRoot:f.work,expectedSha256:o.sha256}).status,'refused');
});
test('bounded span rewriting preserves untouched escaped Unicode and rejects nonexistent surgery paths',()=>{
 const b=Buffer.from(' \n{"entries" : [ {"path":"owned"}, { "foreign":"\\u00df", "n":1e+2 } ], "keep" : true}\n');const r=rewriteAntigravityJsonBytes(b,{deletions:[['entries',0]]});assert(r.toString().includes('{ "foreign":"\\u00df", "n":1e+2 }'));assert(r.toString().endsWith(', "keep" : true}\n'));assert.throws(()=>rewriteAntigravityJsonBytes(b,{deletions:[['entries',8]]}));
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 9) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
