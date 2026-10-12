// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerTestCaseCompletion} from '../lib/test-case-completion.mjs';
import {observePipelineStartPreflight} from './pipeline-start-preflight.mjs';
import {INSTALLED_PLUGIN_ATTESTATION_SETUP_BOUNDARY,INSTALLED_PLUGIN_PROTECTED_PATHS_BY_PROVIDER,installedPluginAttestationSetupCommand,readInstalledPluginAttestationSetup,writeCodexRegistryInstalledPluginReceipt} from './installed-plugin-attestation-host.mjs';
import {PO_HUMAN_APPROVAL_SETUP_BOUNDARY} from './po-human-approval.mjs';
import {isExactObservedInstalledPluginAttestationAction} from '../lib/guard/command-catalogue.mjs';

const pluginRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const scratchParent=resolve(pluginRoot,'../../scratch');
mkdirSync(scratchParent,{recursive:true});
const version='1.2.3-inline-test';
const cases=[
 {id:'IPAIA01',name:'Codex postinstall host boundary permits inline agent invocation',run(){
   const boundary=INSTALLED_PLUGIN_ATTESTATION_SETUP_BOUNDARY;
   assert.equal(boundary.executionBoundary,'host');
   assert.equal(boundary.codexToolCallPermitted,true,'approved host-postinstall repair must be executable inline by the Codex agent');
   assert.notEqual(boundary.invocation,'user-copy-only','postinstall must not mandate user copying');
 }},
 {id:'IPAIA02',name:'returned closed action matches producer, real admission, writer and readback',run(t){
   const base=mkdtempSync(join(scratchParent,'inline-attestation-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
   const sourceRoot=join(base,'source');const sourcePluginRoot=join(sourceRoot,'plugins/pipeline-core');
   const installedPluginRoot=join(base,'installed/pipeline-core');const receiptDirectory=join(base,'authority');
   const protectedPaths=INSTALLED_PLUGIN_PROTECTED_PATHS_BY_PROVIDER.codex;
   for(const path of protectedPaths){mkdirSync(dirname(join(sourcePluginRoot,path)),{recursive:true});writeFileSync(join(sourcePluginRoot,path),path.endsWith('plugin.json')?JSON.stringify({name:'pipeline-core',version,description:'fixture',hooks:'./hooks/codex-hooks.json',author:{name:'Fixture'},license:'SUL-1.0',interface:{displayName:'Fixture'}})+'\n':path.endsWith('.json')?'{}\n':'fixture\n');}
   function git(args){const result=spawnSync('git',args,{cwd:sourceRoot,encoding:'utf8',timeout:10000,env:{...process.env,GIT_CONFIG_GLOBAL:join(base,'absent-config'),GIT_CONFIG_NOSYSTEM:'1'}});assert.equal(result.status,0,result.stderr);}
   git(['init','--initial-branch=fixture']);git(['remote','add','origin','https://example.test/fixture/plugin.git']);git(['add','plugins/pipeline-core']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.test','-c','commit.gpgSign=false','commit','-m','fixture']);
   cpSync(sourcePluginRoot,installedPluginRoot,{recursive:true});
   const registryRoot=join(base,'registry');const registryPluginRoot=join(registryRoot,'plugins/pipeline-core');
   cpSync(sourcePluginRoot,registryPluginRoot,{recursive:true});
   // Byte-identical registry/cache snapshots legitimately need no receipt.
   // A real cache-only drift exercises recovery rather than that direct-root
   // happy path; the writer must reject it until this owned fixture is restored.
   const cacheDrift=join(installedPluginRoot,'fixture-cache-drift.txt');
   writeFileSync(cacheDrift,'owned fixture drift\n');
   const pluginList=()=>JSON.stringify({installed:[{pluginId:'pipeline-core@agent-pipeline-local',name:'pipeline-core',marketplaceName:'agent-pipeline-local',version,installed:true,enabled:true,source:{source:'local',path:registryPluginRoot},marketplaceSource:{sourceType:'local',source:registryRoot}}],available:[]});
   const unavailable={schema:'pipeline.installed-plugin-attestation-verification.v1',status:'unavailable',reasonCodes:['IPA-HOST-LOCATOR-UNAVAILABLE']};
   // Only unrelated governance/readiness observations are fixture seams. Source
   // selection, action producer, exact-command admission, writer provenance and
   // receipt verification are the real implementations.
   const observed=observePipelineStartPreflight({env:{},cwd:sourceRoot,scriptUrl:pathToFileURL(join(installedPluginRoot,'scripts/pipeline-start-preflight.mjs')).href,pluginList,
     read:()=>JSON.stringify({version}),
     observeGovernanceScopeFn:({rootDir})=>({schema:'pipeline.governance-scope.v1',state:'active',root:rootDir,scopeKey:'a'.repeat(64),repositoryKind:'git',provenance:{kind:'isolated-unit-capability',refs:[]},diagnostics:[],requiresEnforcement:true,hintAllowed:false}),
     checkCloneProvisioningFn:()=>({schema:'pipeline.clone-provisioning-report.v1',status:'ready',checks:[{id:'pre-commit-hook',status:'current'},{id:'commit-msg-hook',status:'current'}]}),
     observePrePushHookInstallationFn:()=>({state:'repository-unresolved'}),observeUnseenPushToRemoteFn:()=>({state:'repository-unresolved'}),requireProjectOnboardingReadyFn:()=>undefined,
     verifyLocalInstalledPluginReceiptFn:()=>unavailable,
     observe:()=>({schema:'pipeline.public-core-observation.v1',status:'ready',candidate:{repository:'https://example.test/fixture/plugin.git',branch:'fixture',commit:'a'.repeat(40),tree:'b'.repeat(40)},plugin:{name:'pipeline-core',version,manifestSha256:'c'.repeat(64),contentSha256:'d'.repeat(64)}}),
   });
   assert.equal(observed.status,'plugin-attestation-required',JSON.stringify(observed));
   const action=observed.nextAction;
   const schema=JSON.parse(readFileSync(join(pluginRoot,'scripts/installed-plugin-attestation-setup-action.schema.json')));
   assert.deepEqual(Object.keys(action).sort(),schema.required.toSorted());
   for(const [key,property] of Object.entries(schema.properties)){if('const' in property)assert.equal(action[key],property.const);}
   assert.deepEqual(action.expected,{schema:'pipeline.installed-plugin-attestation-host-result.v1',status:'written'});
   assert.equal(action.executionBoundary,INSTALLED_PLUGIN_ATTESTATION_SETUP_BOUNDARY.executionBoundary);
   const command=installedPluginAttestationSetupCommand({provider:'codex',version,sourcePluginRoot,installedPluginRoot,launcher:join(installedPluginRoot,'scripts/installed-plugin-attestation-host.mjs')});
   assert.equal(action.executable,command.executable);assert.deepEqual(action.argv,command.argv);
   assert.deepEqual(action,observed.installedPluginAttestation.setupAction);
   const quote=(value)=>"'"+value.replaceAll("'","'\\''")+"'";
   const rendered=[action.executable,...action.argv].map(quote).join(' ');
   const dependencies={observePipelineStartPreflightFn:()=>observed};
   assert.equal(isExactObservedInstalledPluginAttestationAction(rendered,sourceRoot,dependencies),true);
   assert.equal(isExactObservedInstalledPluginAttestationAction(rendered+' --provider claude',sourceRoot,dependencies),false);
   assert.equal(isExactObservedInstalledPluginAttestationAction(rendered.replace('write-local-from-codex-registry','write-local'),sourceRoot,dependencies),false);
   // Decode only the returned closed operation. Never execute a host CLI against
   // its default authority directory: inject owned Scratch storage into its
   // real operation and independent readback instead.
   assert.deepEqual(action.argv,[join(installedPluginRoot,'scripts/installed-plugin-attestation-host.mjs'),'write-local-from-codex-registry','--version',version,'--source-plugin-root',sourcePluginRoot,'--installed-plugin-root',installedPluginRoot]);
   const input={provider:'codex',plugin:{name:'pipeline-core',version:action.argv[3]},sourcePluginRoot:action.argv[5],installedPluginRoot:action.argv[7]};
   const refused=writeCodexRegistryInstalledPluginReceipt(input,{receiptDirectory,readPluginList:pluginList});
   assert.equal(refused.status,'rejected','cache drift must remain untrusted');
   rmSync(cacheDrift);
   const result=writeCodexRegistryInstalledPluginReceipt(input,{receiptDirectory,readPluginList:pluginList});
   assert.equal(result.schema,action.expected.schema);assert.equal(result.status,action.expected.status,JSON.stringify(result));
   const readback=readInstalledPluginAttestationSetup({provider:'codex',version,sourcePluginRoot,installedPluginRoot},{receiptDirectory,readPluginList:pluginList});
   assert.equal(readback.status,'verified',JSON.stringify(readback));assert.equal(readback.schema,action.expected.schema);assert.equal(readback.digest,result.receiptId);
 }},
 {id:'IPAIA03',name:'human signing and attended terminal actions retain copy-only boundaries',run(){
   assert.deepEqual(PO_HUMAN_APPROVAL_SETUP_BOUNDARY,{executionBoundary:'attended-external-terminal',invocation:'user-copy-only',codexToolCallPermitted:false});
   const catalog=JSON.parse(readFileSync(join(pluginRoot,'templates/human-terminal-actions/catalog.json')));
   const entries=catalog.templates??catalog.actions??catalog.entries;
   assert.ok(Array.isArray(entries),'catalog control collection must be known');
   const controls=entries.filter(entry=>entry.id!=='installed-plugin-attestation-setup'&&entry.boundary?.executionBoundary==='attended-external-terminal');
   assert.ok(controls.length>0,'at least one attended control required');
   for(const entry of controls){assert.equal(entry.boundary.invocation,'user-copy-only');assert.equal(entry.boundary.codexToolCallPermitted,false);}
 }},
];
assert.equal(cases.length,3);
registerTestCaseCompletion({cases,fd:Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD??3),maxBytes:Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES??65536)});
