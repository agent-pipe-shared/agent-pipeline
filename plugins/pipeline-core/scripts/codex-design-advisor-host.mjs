// SPDX-License-Identifier: SUL-1.0
/** Source-owned ordinary Codex admission. No caller-provided approval callbacks. */
import {execFileSync} from 'node:child_process';
import {lstatSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCodexAdvisorExecution} from '../lib/codex-advisor-execution.mjs';
import {readPhysicalCodexAdvisorConsent} from '../lib/codex-advisor-admission.mjs';
import {advisorExact,advisorPublicPath,ADVISOR_SOURCE_NAMES} from '../lib/codex-advisor-request.mjs';
import {requireProjectOnboardingReady} from '../lib/project-onboarding-ready-gate.mjs';
import {resolveV3DutyRoute} from '../lib/critic-route-v3.mjs';
import {designAdvisorRouteSlots} from '../lib/design-advisor-course-store.mjs';
import {loadRunnerProfilesV3Registry} from '../lib/runner-profiles-v3.mjs';
import {resolveSystemExecutable} from '../lib/trusted-tool-resolution.mjs';
import {canonicalJson,sha256} from '../lib/codex-sandbox-compatibility.mjs';
import {createModelFamilyRuntimeHost} from '../lib/model-family-runtime-host.mjs';
import {createModelFamilyInvocationEntry} from '../lib/model-family-invocation.mjs';
import {resolvePoGateRepositoryTopology} from '../lib/po-gate-authority.mjs';

const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
const familySelections=new WeakMap();
const fail=code=>{throw Object.assign(new Error(code),{code});};
function rootAt(root){const p=resolve(root);if(realpathSync(p)!==p||!lstatSync(p).isDirectory())fail('CADH-PHYSICAL-ROOT');return p;}
function git(root,args,maxBuffer=65537){return execFileSync('git',args,{cwd:root,maxBuffer,timeout:10000,stdio:['ignore','pipe','pipe']});}
function ready(root){requireProjectOnboardingReady({rootDir:root,intent:'dispatch',runner:'codex'});return {status:'ready'};}
function readyAtConstruction(root,familyPorts){return typeof familyPorts?.requireReady==='function'?familyPorts.requireReady(root):ready(root);}
function candidateAt(root){return {commit:git(root,['rev-parse','HEAD']).toString().trim(),tree:git(root,['rev-parse','HEAD^{tree}']).toString().trim()};}
function routeAt(root,candidate){
 const selected=resolveV3DutyRoute({rootDir:root,dutyId:'advisory',runner:'codex',candidateCommit:candidate.commit});
 const slots=designAdvisorRouteSlots({runner:'codex',registry:loadRunnerProfilesV3Registry()});
 if(selected.state!=='default'||slots.length!==1||slots[0].kind!=='consult'||slots[0].adapter!=='host-consult')fail('CADH-REGISTERED-CONSULT-UNAVAILABLE');
 return {model:selected.model,effort:selected.effort,sourceSha256:selected.sourceSha256,candidateCommit:selected.candidateCommit};
}
function configAt(root,candidate){
 const consent=readPhysicalCodexAdvisorConsent(root);
 if(consent.consent!=='approved')fail('CADH-EXPORT-DECLINED');
 // The complete committed V3 route authority and actual physical consent must
 // describe the same bytes; a worktree-only override cannot authorize export.
 if(sha256(git(root,['show',candidate.commit+':pipeline.user.yaml']))!==consent.sourceSha256)fail('CADH-PROJECT-AUTHORITY-DRIFT');
 return consent;
}
function blobsAt(root,candidate,sources){
 if(!advisorExact(sources,ADVISOR_SOURCE_NAMES))fail('CADH-SOURCE-METADATA');
 const seen=new Set();return Object.fromEntries(ADVISOR_SOURCE_NAMES.map(name=>{
  const ref=sources[name];if(!advisorExact(ref,['path','sha256'])||!advisorPublicPath(ref.path)||! /^[a-f0-9]{64}$/.test(ref.sha256)||seen.has(ref.path))fail('CADH-SOURCE-METADATA');seen.add(ref.path);
  // ls-tree exposes Git object identity only. Source contents, prompts and
  // evidence bundles are first read by the admitted coordinator afterwards.
  const row=git(root,['ls-tree',candidate.commit,'--',ref.path]).toString().trim();
  const match=/^100(?:644|755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t(.+)$/u.exec(row);
  if(!match||match[2]!==ref.path)fail('CADH-COMMITTED-SOURCE-UNAVAILABLE');return [name,match[1]];
 }));
}
/** Model-free observation, with no source-content read and no child launch. */
export async function inspectCodexInitialAdvisorMetadata({repoRoot,sources,familyPorts=null,invocationId=null,expectedCommit=null,expectedTree=null}={}){
 const root=rootAt(repoRoot);readyAtConstruction(root,familyPorts);const candidate=candidateAt(root),consent=configAt(root,candidate);
 if((expectedCommit!==null&&expectedCommit!==candidate.commit)||(expectedTree!==null&&expectedTree!==candidate.tree))fail('CADH-CANDIDATE-DRIFT');
 const topology=resolvePoGateRepositoryTopology(root),entry=familyPorts?.entry??createModelFamilyInvocationEntry({
  runtimeHost:createModelFamilyRuntimeHost({cwd:root,resolveCommonDir:()=>topology.gitCommonDir})});
 let route,family=null;const activation=entry.observeActivation();
 if(!activation?.ok)fail(activation?.code??'CADH-FAMILY-ACTIVATION-UNCERTAIN');
 if(activation.status==='active'){
  if(typeof invocationId!=='string'||!invocationId)fail('CADH-FAMILY-INVOCATION-UNAVAILABLE');
  const prepared=await entry.prepareCurrentModelFamilyInvocation({kind:'dispatch',runner:'codex',taskRoute:'duty.advisory',invocationId});
  if(!prepared?.ok||!prepared.value?.handle||!prepared.value?.receipt)fail(prepared?.code??'CADH-FAMILY-INVOCATION-UNAVAILABLE');
  const receipt=prepared.value.receipt;
  if(receipt.kind!=='model-family-invocation'||receipt.runner!=='codex'||receipt.taskRoute!=='duty.advisory'
    ||receipt.invocationId!==invocationId||receipt.candidateCommit!==candidate.commit||receipt.candidateTree!==candidate.tree
    ||typeof receipt.sessionId!=='string'||receipt.sessionId===invocationId||!receipt.selectedModelId
    ||!receipt.effort||!receipt.authoritySha256||!receipt.receiptSha256)fail('CADH-FAMILY-RECEIPT-BINDING');
  route={model:receipt.selectedModelId,effort:receipt.effort,sourceSha256:receipt.authoritySha256,candidateCommit:candidate.commit};
  family={entry,handle:prepared.value.handle,receipt,executionHost:familyPorts?.executionHost??null};
 }else if(activation.status==='inactive')route=routeAt(root,candidate);
 else fail('CADH-FAMILY-ACTIVATION-UNCERTAIN');
 const sourceBlobIds=blobsAt(root,candidate,sources);
 const selected=typeof familyPorts?.resolveCodexExecutable==='function'
  ?familyPorts.resolveCodexExecutable({root,runner:'codex'}):resolveSystemExecutable('codex');
 if(typeof selected!=='string')fail('CADH-CODEX-UNAVAILABLE');const codexPath=realpathSync(selected),stat=lstatSync(codexPath);if(!stat.isFile()||stat.isSymbolicLink()||!(stat.mode&0o111))fail('CADH-CODEX-UNAVAILABLE');
 readyAtConstruction(root,familyPorts);if(!same(candidateAt(root),candidate)||!same(configAt(root,candidate),consent)
  ||(!family&&!same(routeAt(root,candidate),route))||!same(blobsAt(root,candidate,sources),sourceBlobIds))fail('CADH-METADATA-DRIFT');
 const result=Object.freeze({candidate:Object.freeze(candidate),route:Object.freeze(route),sourceBlobIds:Object.freeze(sourceBlobIds),consentSha256:consent.sourceSha256,codexPath});
 if(family)familySelections.set(result,family);return result;
}
/** Only canonical source dependencies supply these sealed execution callbacks. */
export async function createNativeCodexDesignAdvisorExecution({repoRoot,sources,profile='epic',reason='risk-review',featureId,dispatch,familyPorts=null,initialObservation=null}={}){
 const root=rootAt(repoRoot),initial=initialObservation??await inspectCodexInitialAdvisorMetadata({repoRoot:root,sources,familyPorts,invocationId:dispatch?.dispatchId});
 const family=familySelections.get(initial)??null;
 if(family&&(!family.executionHost||typeof family.executionHost.recordModelFamilyExecution!=='function'
  ||typeof family.executionHost.readExecutionReceipt!=='function'))fail('CADH-FAMILY-EXECUTION-UNAVAILABLE');
 if(!['epic','feature'].includes(profile)||reason!=='risk-review'||typeof featureId!=='string'||!advisorExact(dispatch,['dispatchId','queueRevision','candidateCommit','candidateTree'])||dispatch.candidateCommit!==initial.candidate.commit||dispatch.candidateTree!==initial.candidate.tree)fail('CADH-DISPATCH');
 const base=structuredClone({candidate:initial.candidate,sources,featureId,profile,reason,dispatch,route:initial.route});
 const check=metadata=>{
  if(!metadata||!same(Object.fromEntries(Object.keys(base).map(k=>[k,metadata[k]])),base)||Object.keys(metadata).some(k=>!Object.hasOwn(base,k)&&!['initialContextSha256','courseBindingSha256'].includes(k)))fail('CADH-DISPATCH-METADATA');
  const candidate=candidateAt(root),consent=configAt(root,candidate),sourceBlobIds=blobsAt(root,candidate,base.sources);
  if(!same(candidate,initial.candidate)||!same({sourceBlobIds,consentSha256:consent.sourceSha256},
    {sourceBlobIds:initial.sourceBlobIds,consentSha256:initial.consentSha256}))fail('CADH-LIVE-ADMISSION-DRIFT');
  if(family){const held=family.entry.readHeld({runner:'codex',sessionId:family.receipt.sessionId,invocationId:family.receipt.invocationId});
   if(!held?.ok||!same(held.value,family.receipt))fail('CADH-FAMILY-HELD-SELECTION-DRIFT');
  }else if(!same(routeAt(root,initial.candidate),initial.route))fail('CADH-LIVE-ADMISSION-DRIFT');
  return metadata;
 };
 const admission=Object.freeze({requireReady:metadata=>{check(metadata);return readyAtConstruction(root,familyPorts);},observeCurrentMetadata:metadata=>structuredClone(check(metadata)),observeRegisteredRoute:metadata=>{check(metadata);return family?structuredClone(initial.route):routeAt(root,initial.candidate);},admitHostExport:metadata=>{
  check(metadata);
  // This admits the concrete repository-approved export. It does not claim
  // an enclosing Codex tool approval or successful execution. Managed launch
  // denial produces actual failure/recovery evidence, never an answered receipt.
  return {decision:configAt(root,initial.candidate).consent==='approved'?'approved':'denied'};
 }});
 return Object.freeze({observation:initial,execution:createCodexAdvisorExecution({repoRoot:root,trustedExecutablePath:initial.codexPath,admission,inputDirectory:root,familyInvocation:family})});
}
