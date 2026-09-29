// SPDX-License-Identifier: SUL-1.0
// Source target: plugins/pipeline-core/lib/project-pipeline-footprint.mjs
import {join} from 'node:path';
import {parseYaml} from './yaml-lite.mjs';
import {validatePipelineUserV3} from './runner-profiles-v3.mjs';
import {codexCustomAgentSeed,loadRuntimeProjectionV3OwnedKeys,planRuntimeProjectionV3} from './runtime-projection-v3.mjs';
import {planRuntimeProjectionOwnedRemoval} from './runtime-projection-removal.mjs';
import {derivePlanLifecycle} from './plan-spec-state-v2.mjs';
import {footprintSha256,readPhysicalFootprint} from './git-hook-footprint.mjs';
const strictUtf8=row=>new TextDecoder('utf-8',{fatal:true}).decode(row.bytes);
export function deriveContentPreservingPipelineFootprint({rootDir}){
 const budget={used:0,max:33554432},source=readPhysicalFootprint(join(rootDir,'pipeline.user.yaml'),{budget}),owned=loadRuntimeProjectionV3OwnedKeys(),observations=[],actions=[],conflicts=[],preserve=['AGENTS.md','CLAUDE.md','architecture/','docs/','specs/','backlog/','Git history','user-scope stores'];let intent=null;
 if(source)try{const v=parseYaml(strictUtf8(source));if(validatePipelineUserV3(v).ok)intent=v;}catch{}
 const defaultBytes={'.claude/settings.json':'{}\n','.claude/pipeline.json':'{}\n','.codex/config.toml':'','.codex/agents/implementor.toml':codexCustomAgentSeed('implementor'),'.codex/agents/critic.toml':codexCustomAgentSeed('critic'),'.codex/agents/consult-advisor.toml':''};
 const baselines={},rows=new Map();for(const target of owned.targets){const row=readPhysicalFootprint(join(rootDir,target.path),{budget});rows.set(target.path,row);baselines[target.path]={status:'present',bytes:row?strictUtf8(row):defaultBytes[target.path]??'schema: pipeline.manifest.v0\n'};}
 const neutralManifest=readPhysicalFootprint(join(rootDir,'project','pipeline.yaml'),{budget});if(!rows.get('.claude/pipeline.yaml')&&neutralManifest)baselines['.claude/pipeline.yaml']={status:'present',bytes:strictUtf8(neutralManifest)};
 const projected=intent?planRuntimeProjectionV3(intent,{source:'pipeline.user.yaml',baselines}):null;
 for(const target of owned.targets){const row=rows.get(target.path);if(!row)continue;observations.push({path:target.path,sha256:row.sha256,identity:row.identity});if(!target.ownedKeys.length)continue;const expected=projected?.status==='ready'?projected.targets.find(t=>t.path===target.path)?.after?.bytes:null;if(typeof expected!=='string'){conflicts.push({path:target.path,code:'PU-RUNTIME-OWNERSHIP-UNVERIFIED'});continue;}try{const removal=planRuntimeProjectionOwnedRemoval({format:target.format,bytes:strictUtf8(row),ownedKeys:target.ownedKeys,expectedBytes:expected});if(removal.status==='conflict')conflicts.push({path:target.path,code:removal.code});else if(removal.status==='ready')actions.push({path:target.path,kind:'owned-keys',beforeSha256:row.sha256,beforeIdentity:row.identity,afterBytes:removal.afterBytes,afterSha256:removal.afterSha256,mode:row.mode,ownedKeys:[...target.ownedKeys]});}catch(e){conflicts.push({path:target.path,code:e.code??'PU-RUNTIME-PARSE'});}}
 // Neutral authority mirrors contain retained project policy/content. Strip
 // the same owned projection keys instead of deleting either authority file.
 for(const mirror of owned.neutralAuthorityMirrors??[]){const row=mirror.path==='project/pipeline.yaml'?neutralManifest:readPhysicalFootprint(join(rootDir,mirror.path),{budget});if(!row)continue;observations.push({path:mirror.path,sha256:row.sha256,identity:row.identity});const target=owned.targets.find(t=>t.path===mirror.mirrorOf),expected=projected?.status==='ready'?projected.targets.find(t=>t.path===mirror.mirrorOf)?.after?.bytes:null;if(!target||typeof expected!=='string'){conflicts.push({path:mirror.path,code:'PU-RUNTIME-OWNERSHIP-UNVERIFIED'});continue;}try{const removal=planRuntimeProjectionOwnedRemoval({format:mirror.format,bytes:strictUtf8(row),ownedKeys:target.ownedKeys,expectedBytes:expected});if(removal.status==='conflict')conflicts.push({path:mirror.path,code:removal.code});else if(removal.status==='ready')actions.push({path:mirror.path,kind:'owned-keys',beforeSha256:row.sha256,beforeIdentity:row.identity,afterBytes:removal.afterBytes,afterSha256:removal.afterSha256,mode:row.mode,ownedKeys:[...target.ownedKeys]});}catch(e){conflicts.push({path:mirror.path,code:e.code??'PU-RUNTIME-PARSE'});}}
 for(const path of ['project/pipeline-state.json','.claude/pipeline-state.json','.agent-pipeline/onboarding-consent.json']){
  const row=readPhysicalFootprint(join(rootDir,path),{budget});if(!row)continue;
  observations.push({path,sha256:row.sha256,identity:row.identity});let value=null;
  try{value=JSON.parse(strictUtf8(row));}catch{}
  const state=path.endsWith('pipeline-state.json');
  const ownedMetadata=state?derivePlanLifecycle(value).ok:(value?.schema==='pipeline.onboarding-consent-marker.v1'&&value.status==='consent-given-onboarding-incomplete'&&Object.keys(value).sort().join('|')==='consentGivenAt|schema|status'&&typeof value.consentGivenAt==='string'&&Number.isFinite(Date.parse(value.consentGivenAt))&&new Date(value.consentGivenAt).toISOString()===value.consentGivenAt);
  if(ownedMetadata)actions.push({path,kind:'retained-metadata',beforeSha256:row.sha256,beforeIdentity:row.identity,mode:row.mode,afterBytes:null,afterSha256:null});
  else conflicts.push({path,code:'PU-METADATA-OWNERSHIP-UNVERIFIED'});
 }
 return {schema:'pipeline.content-preserving-footprint.v1',source:source?{path:'pipeline.user.yaml',sha256:source.sha256}:null,observations:observations.sort((a,b)=>a.path.localeCompare(b.path)),actions:actions.sort((a,b)=>a.path.localeCompare(b.path)),conflicts,preserve};
}
export function publicContentPreservingFootprint(footprint){return {...footprint,actions:footprint.actions.map(({afterBytes,...entry})=>entry)};}
