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

const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
const fail=code=>{throw Object.assign(new Error(code),{code});};
function rootAt(root){const p=resolve(root);if(realpathSync(p)!==p||!lstatSync(p).isDirectory())fail('CADH-PHYSICAL-ROOT');return p;}
function git(root,args,maxBuffer=65537){return execFileSync('git',args,{cwd:root,maxBuffer,timeout:10000,stdio:['ignore','pipe','pipe']});}
function ready(root){requireProjectOnboardingReady({rootDir:root,intent:'dispatch',runner:'codex'});return {status:'ready'};}
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
export function inspectCodexInitialAdvisorMetadata({repoRoot,sources}={}){
 const root=rootAt(repoRoot);ready(root);const candidate=candidateAt(root),consent=configAt(root,candidate),route=routeAt(root,candidate),sourceBlobIds=blobsAt(root,candidate,sources);
 const selected=resolveSystemExecutable('codex');if(typeof selected!=='string')fail('CADH-CODEX-UNAVAILABLE');const codexPath=realpathSync(selected),stat=lstatSync(codexPath);if(!stat.isFile()||stat.isSymbolicLink()||!(stat.mode&0o111))fail('CADH-CODEX-UNAVAILABLE');
 ready(root);if(!same(candidateAt(root),candidate)||!same(configAt(root,candidate),consent)||!same(routeAt(root,candidate),route)||!same(blobsAt(root,candidate,sources),sourceBlobIds))fail('CADH-METADATA-DRIFT');
 return Object.freeze({candidate:Object.freeze(candidate),route:Object.freeze(route),sourceBlobIds:Object.freeze(sourceBlobIds),consentSha256:consent.sourceSha256,codexPath});
}
/** Only canonical source dependencies supply these sealed execution callbacks. */
export function createNativeCodexDesignAdvisorExecution({repoRoot,sources,profile='epic',reason='risk-review',featureId,dispatch}={}){
 const root=rootAt(repoRoot),initial=inspectCodexInitialAdvisorMetadata({repoRoot:root,sources});
 if(!['epic','feature'].includes(profile)||reason!=='risk-review'||typeof featureId!=='string'||!advisorExact(dispatch,['dispatchId','queueRevision','candidateCommit','candidateTree'])||dispatch.candidateCommit!==initial.candidate.commit||dispatch.candidateTree!==initial.candidate.tree)fail('CADH-DISPATCH');
 const base=structuredClone({candidate:initial.candidate,sources,featureId,profile,reason,dispatch,route:initial.route});
 const check=metadata=>{
  if(!metadata||!same(Object.fromEntries(Object.keys(base).map(k=>[k,metadata[k]])),base)||Object.keys(metadata).some(k=>!Object.hasOwn(base,k)&&!['initialContextSha256','courseBindingSha256'].includes(k)))fail('CADH-DISPATCH-METADATA');
  const current=inspectCodexInitialAdvisorMetadata({repoRoot:root,sources:base.sources});if(!same(current,initial))fail('CADH-LIVE-ADMISSION-DRIFT');return metadata;
 };
 const admission=Object.freeze({requireReady:metadata=>{check(metadata);return ready(root);},observeCurrentMetadata:metadata=>structuredClone(check(metadata)),observeRegisteredRoute:metadata=>{check(metadata);return routeAt(root,initial.candidate);},admitHostExport:metadata=>{
  check(metadata);
  // This admits the concrete repository-approved export. It does not claim
  // an enclosing Codex tool approval or successful execution. Managed launch
  // denial produces actual failure/recovery evidence, never an answered receipt.
  return {decision:configAt(root,initial.candidate).consent==='approved'?'approved':'denied'};
 }});
 return Object.freeze({observation:initial,execution:createCodexAdvisorExecution({repoRoot:root,trustedExecutablePath:initial.codexPath,admission,inputDirectory:root})});
}
