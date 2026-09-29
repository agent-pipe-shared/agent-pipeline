// SPDX-License-Identifier: SUL-1.0
// Source target: plugins/pipeline-core/lib/governance-scope.mjs
import {createHash,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {constants,closeSync,fchmodSync,fstatSync,fsyncSync,ftruncateSync,lstatSync,mkdirSync,openSync,readSync,realpathSync,renameSync,unlinkSync,writeSync} from 'node:fs';
import {dirname,join,parse,resolve,sep} from 'node:path';
import {homedir} from 'node:os';
import {discoverRepository} from './worktree-lifecycle.mjs';
import {hasCodexGitControlMount} from './codex-host-layout.mjs';
import {resolveOnboardingIntakeScope} from './codex-onboarding-runtime.mjs';
import {resolveIntakeCheckpointPaths} from './onboarding-continuity.mjs';
import {parseYaml} from './yaml-lite.mjs';
import {validatePipelineUserV3} from './runner-profiles-v3.mjs';
import {codexCustomAgentSeed,planRuntimeProjectionV3} from './runtime-projection-v3.mjs';
import {loadSchema} from './manifest.mjs';
import {validateAgainstSchema} from './schema-lite.mjs';
import {assessWindowsPrivatePath,hardenWindowsPrivateDirectory} from './windows-private-state.mjs';

export const GOVERNANCE_SCOPE_SCHEMA='pipeline.governance-scope.v1';
export const GOVERNANCE_ENROLLMENT_SCHEMA='pipeline.governance-enrollment.v1';
export const GOVERNANCE_DECISION_PLAN_SCHEMA='pipeline.governance-decision-plan.v1';
const MAX=262144;
const CONTROLLERS=new WeakSet();
const digest=b=>createHash('sha256').update(b).digest('hex');
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const identity=s=>({dev:String(s.dev),ino:String(s.ino)});
const sameIdentity=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
function fail(code,ownedGitTopology=false){throw Object.assign(new Error(code),{code,ownedGitTopology});}
function physical(path,{missing=false,directory=false}={}){
  path=resolve(path);let current=parse(path).root;
  for(const name of path.slice(current.length).split(sep).filter(Boolean)){
    current=join(current,name);let st;
    try{st=lstatSync(current);}catch(e){if(missing&&e.code==='ENOENT')return null;throw e;}
    if(st.isSymbolicLink())fail('GS-ALIAS');
    if(current!==path&&!st.isDirectory())fail('GS-PARENT');
  }
  const st=lstatSync(path);
  if(directory&&!st.isDirectory())fail('GS-DIRECTORY');
  if(realpathSync(path)!==path)fail('GS-IDENTITY');return st;
}
function readOptional(path,budget,max=MAX){
  const pre=physical(path,{missing:true});if(pre===null)return null;
  if(!pre.isFile()||pre.nlink!==1)fail('GS-FILE');
  if(pre.size>max||budget.used+pre.size>1048576)fail('GS-SIZE');
  const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
    const st=fstatSync(fd);if(!sameIdentity(identity(pre),identity(st))||!st.isFile()||st.nlink!==1||st.size>max)fail('GS-FD');
    const limit=Math.min(max,1048576-budget.used),buffer=Buffer.alloc(limit+1);let count=0;
    while(count<buffer.length){const n=readSync(fd,buffer,count,buffer.length-count,null);if(n===0)break;count+=n;}
    budget.used+=count;if(count>max||budget.used>1048576)fail('GS-SIZE');
    const after=fstatSync(fd),current=physical(path);
    if(!sameIdentity(identity(st),identity(current))||after.size!==count||current.size!==count||after.mtimeMs!==st.mtimeMs||after.ctimeMs!==st.ctimeMs||current.nlink!==1)fail('GS-DRIFT');
    const bytes=buffer.subarray(0,count),text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if(!Buffer.from(text,'utf8').equals(bytes))fail('GS-UTF8');
    return {text,sha256:digest(bytes),identity:identity(st),mode:st.mode&0o777,bytes:count};
  }finally{closeSync(fd);}
}
function physicalContext(rootDir){
  if(typeof rootDir!=='string'||rootDir.length===0||/[\x00-\x1f]/.test(rootDir))fail('GS-ROOT');
  const start=resolve(rootDir);physical(start,{directory:true});
  // Discover through the canonical physical Git topology. No Git init occurs.
  let repository=null,root=start,common=null,hostControlIdentity=null;
  try{repository=discoverRepository(start);}catch(gitError){
    // A failed Git topology probe is not evidence of a non-Git project.
    // Refuse a standalone host-store write when Git control exists nearby.
    let ancestor=start,ancestorDepth=0;
    const unavailable=(reason,errno=null)=>{throw Object.assign(new Error('GS-GIT-UNAVAILABLE'),{code:'GS-GIT-UNAVAILABLE',ownedGitTopology:true,topologyDiagnostic:{reason,errno:typeof errno==='string'?errno:null,gitCode:typeof gitError.code==='string'?gitError.code:null,gitReportsNotRepository:/not a git repository/.test(gitError.message??''),boundary:ancestor===start?'selected-root':ancestor===parse(ancestor).root?'filesystem-root':'ancestor',ancestorDepth}});};
    while(true){let control;try{control=lstatSync(join(ancestor,'.git'));}catch(e){if(e.code!=='ENOENT')unavailable('control-stat-unavailable',e.code);}if(control){
      // This exact native host layout has no local Git authority. Never write
      // its control mount or classify an arbitrary broken Git tree as absent.
      if(!hasCodexGitControlMount(ancestor))unavailable('unsupported-existing-control');
      physical(ancestor,{directory:true});root=ancestor;hostControlIdentity=identity(physical(join(root,'.git'),{directory:true}));break;
    }const parent=dirname(ancestor);if(parent===ancestor)break;ancestor=parent;ancestorDepth+=1;}
  }
  try{
  if(repository){
    // Select by exact lexical containment before touching worktree directories.
    // Missing or aliased unrelated rows cannot change this scope's authority.
    const roots=repository.worktrees.map(row=>row.path).filter(p=>typeof p==='string'&&(start===p||start.startsWith(p+sep))).sort((a,b)=>b.length-a.length);
    if(!roots.length)fail('GS-WORKTREE',true);root=roots[0];
    if(root!==resolve(root))fail('GS-WORKTREE',true);physical(root,{directory:true});
    common=repository.commonDir;physical(common,{directory:true});
  }
  const rootIdentity=identity(physical(root,{directory:true}));
  return {root,rootIdentity,repositoryKind:common?'git':'non-git',common,commonIdentity:common?identity(physical(common,{directory:true})):null,hostControlIdentity,scopeKey:digest(root)};
  }catch(e){
    // Once Git topology is known, a selected-root/common physical refusal
    // cannot erase that owned authority into inactive admission.
    if(repository)e.ownedGitTopology=true;throw e;
  }
}
function recordValid(record,ctx){
  return exact(record,['schema','root','rootIdentity','commonIdentity','scopeKey','state','by','decidedAt'])
    &&record.schema===GOVERNANCE_ENROLLMENT_SCHEMA&&record.root===ctx.root&&record.scopeKey===ctx.scopeKey
    &&exact(record.rootIdentity,['dev','ino'])&&sameIdentity(record.rootIdentity,ctx.rootIdentity)
    &&(ctx.common===null?record.commonIdentity===null:exact(record.commonIdentity,['dev','ino'])&&sameIdentity(record.commonIdentity,ctx.commonIdentity))
    &&['active','declined'].includes(record.state)&&typeof record.by==='string'&&record.by.trim().length>0&&record.by.length<=256&&!/[\x00-\x1f]/.test(record.by)&&iso(record.decidedAt);
}
function blockFor(key){return {start:`# BEGIN Agent-Pipeline activation ${key}\n`,end:`# END Agent-Pipeline activation ${key}\n`};}
function configRecord(text,key){
  const {start,end}=blockFor(key),a=text.indexOf(start);if(a<0){if(text.includes(`activation-${key}`))fail('GS-FOREIGN-CONFIG-KEY');return {record:null,block:null};}
  const b=text.indexOf(end,a);if(b<0||text.indexOf(start,a+start.length)>=0||text.indexOf(end,b+end.length)>=0)fail('GS-CONFIG-RECORD');
  const block=text.slice(a,b+end.length),prefix=start+`[agent-pipeline "activation-${key}"]\n\trecord = `;
  if(!block.startsWith(prefix)||!block.endsWith('\n'+end))fail('GS-CONFIG-RECORD');
  const encoded=block.slice(prefix.length,-('\n'+end).length);let raw,record;
  try{raw=JSON.parse(encoded);record=JSON.parse(raw);}catch{fail('GS-CONFIG-RECORD');}
  if(typeof raw!=='string'||JSON.stringify(record)!==raw||JSON.stringify(raw)!==encoded)fail('GS-CONFIG-RECORD');
  const rest=text.slice(0,a)+text.slice(b+end.length);if(rest.includes(`activation-${key}`))fail('GS-CONFIG-DUPLICATE');
  return {record,block};
}
function legacyPair(ctx,budget){
  for(const tier of ['project','.claude']){
    const manifest=readOptional(join(ctx.root,tier,'pipeline.yaml'),budget),calibration=readOptional(join(ctx.root,tier,'pipeline.json'),budget);
    if(!manifest||!calibration)continue;
    let m,c;try{m=parseYaml(manifest.text);c=JSON.parse(calibration.text);}catch{continue;}
    const valid=validateAgainstSchema(m,loadSchema()).errors.length===0
      &&c&&typeof c==='object'&&!Array.isArray(c)&&typeof c.project==='string'&&c.project.trim().length>0
      &&(c.verify===null||typeof c.verify==='string')&&['gated','full'].includes(c.autonomy)
      &&(typeof c.handover==='string'||(c.handover&&typeof c.handover.path==='string'));
    if(valid)return {state:'active',kind:'legacy-paired-authority',refs:[{path:tier+'/pipeline.yaml',sha256:manifest.sha256},{path:tier+'/pipeline.json',sha256:calibration.sha256}]};
  }
  return null;
}
function legacyObservation(ctx,budget){
  const marker=readOptional(join(ctx.root,'.agent-pipeline','onboarding-consent.json'),budget,65536);
  if(marker){let value;try{value=JSON.parse(marker.text);}catch{}
    if(exact(value,['schema','status','consentGivenAt'])&&value.schema==='pipeline.onboarding-consent-marker.v1'&&value.status==='consent-given-onboarding-incomplete'&&iso(value.consentGivenAt))return {state:'active',kind:'existing-consent',refs:[{path:'.agent-pipeline/onboarding-consent.json',sha256:marker.sha256}]};
  }
  const source=readOptional(join(ctx.root,'pipeline.user.yaml'),budget);
  if(!source)return legacyPair(ctx,budget)??{state:'inactive',kind:'none',refs:[]};
  let intent;try{intent=parseYaml(source.text);}catch{}
  if(!intent||!validatePipelineUserV3(intent).ok){const pair=legacyPair(ctx,budget);return pair?{...pair,state:'unverifiable-active'}:{state:'inactive',kind:'untrusted-config',refs:[]};}
  const refs=[{path:'pipeline.user.yaml',sha256:source.sha256}];
  let manifest,manifestPath='project/pipeline.yaml';
  try{manifest=readOptional(join(ctx.root,manifestPath),budget);if(!manifest){manifestPath='.claude/pipeline.yaml';manifest=readOptional(join(ctx.root,manifestPath),budget);}}catch{fail('GS-LEGACY-ACTIVE-PROJECTION');}
  if(!manifest)return {state:'unverifiable-active',kind:'legacy-v3-intent',refs};
  refs.push({path:manifestPath,sha256:manifest.sha256});
  // Only the manifest's owned projection is being observed. Other renderer
  // inputs are inert canonical seeds, not observed agent/runtime assertions.
  const baselines={'.claude/pipeline.yaml':{status:'present',bytes:manifest.text},'.claude/settings.json':{status:'present',bytes:'{}\n'},'.claude/pipeline.json':{status:'present',bytes:'{}\n'},'.codex/config.toml':{status:'present',bytes:''},'.codex/agents/implementor.toml':{status:'present',bytes:codexCustomAgentSeed('implementor')},'.codex/agents/critic.toml':{status:'present',bytes:codexCustomAgentSeed('critic')},'.codex/agents/consult-advisor.toml':{status:'present',bytes:''}};
  const plan=planRuntimeProjectionV3(intent,{source:'pipeline.user.yaml',baselines});
  const expected=plan.status==='ready'?plan.targets.find(t=>t.path==='.claude/pipeline.yaml')?.after?.bytes:null;
  return {state:typeof expected==='string'&&expected===manifest.text?'active':'unverifiable-active',kind:'legacy-v3-owned-projection',refs};
}
// Live validated projections and a bare decision record are enrollment, not a
// consumed State/intake/consent generation. Only owner-bound transactional
// history takes the retirement/fresh-consent route; absence is rechecked at CAS.
function enrollmentHistory(ctx){
  const paths=['project/pipeline-state.json','.claude/pipeline-state.json','.agent-pipeline/onboarding-consent.json','.claude/.runtime/agent-pipeline/onboarding','.agent-pipeline/enrollment-git-creation-barrier.json','.agent-pipeline/enrollment-git-creation.json'].map(path=>join(ctx.root,path));
  if(ctx.common||ctx.hostControlIdentity){const mode=ctx.common?'local':'host-managed',selected=resolveOnboardingIntakeScope(ctx.root,mode,{create:false}),intake=resolveIntakeCheckpointPaths({rootDir:ctx.root,repositoryCapability:mode});paths.push(intake.checkpoint,join(selected.directory,'enrollment-retirement.json'),join(selected.directory,'enrollment-retirement-archives'));}
  const budget={used:0},retained=[];
  for(const path of [...new Set(paths)]){const st=physical(path,{missing:true});if(st===null)continue;
    if(st.isDirectory())retained.push({path,identity:identity(st)});
    else{const raw=readOptional(path,budget);retained.push({path,identity:raw.identity,sha256:raw.sha256});}
  }
  return retained;
}
export function createGovernanceScopeController({hostStateRoot=join(homedir(),'.local','state','agent-pipeline','activation')}={}){
  // Sealed host constructor dependency. Do not populate this from tool JSON.
  const hostRoot=resolve(hostStateRoot),plans=new WeakMap(),positiveWitnesses=new Map();
  function storage(ctx){return ctx.common?join(ctx.common,'config'):join(hostRoot,ctx.scopeKey+'.json');}
  // Private historical proof is not a second decision authority. Only an
  // explicit sanctioned transaction writes it; it can preserve enforcement
  // when Git's sole current-decision config cannot be read by a fresh hook.
  function proofPath(ctx){return join(hostRoot,ctx.scopeKey+'.git-proof.json');}
  function readPositiveProof(root,rootIdentity){
    const path=proofPath({scopeKey:digest(root)});let scopedClaimObserved=false;
    const proofContext={root,rootIdentity,scopeKey:digest(root),repositoryKind:'unavailable',common:null,commonIdentity:null,hostControlIdentity:null};
    try{
    if(physical(hostRoot,{missing:true,directory:true})===null)return null;
    try{lstatSync(path);scopedClaimObserved=true;}catch(error){if(error.code==='ENOENT')return null;throw error;}
    const raw=readOptional(path,{used:0},65536);if(!raw)fail('GS-PROOF-DRIFT');
    privatePath(hostRoot,true);privatePath(path,false);let value;try{value=JSON.parse(raw.text);}catch{fail('GS-PROOF-JSON');}
    if(!exact(value,['schema','root','rootIdentity','commonPath','commonIdentity','scopeKey','by','decidedAt','planSha256'])
      ||value.schema!=='pipeline.governance-positive-proof.v1'||value.root!==root||value.scopeKey!==digest(root)
      ||!exact(value.rootIdentity,['dev','ino'])||!sameIdentity(value.rootIdentity,rootIdentity)
      ||typeof value.commonPath!=='string'||value.commonPath!==resolve(value.commonPath)
      ||!exact(value.commonIdentity,['dev','ino'])||!sameIdentity(value.commonIdentity,identity(physical(value.commonPath,{directory:true})))
      ||typeof value.by!=='string'||!value.by.trim()||value.by.length>256||/[\x00-\x1f]/.test(value.by)
      ||!iso(value.decidedAt)||!/^[a-f0-9]{64}$/.test(value.planSha256??''))fail('GS-PROOF-BINDING');
    const ctx={root,rootIdentity,scopeKey:value.scopeKey,repositoryKind:'unavailable',common:value.commonPath,commonIdentity:value.commonIdentity,hostControlIdentity:null};
    return {ctx,result:{state:'unverifiable-active',provenance:{kind:'explicit-local-decision',refs:[{path:value.scopeKey+'.git-proof.json',sha256:raw.sha256}]}}};
    }catch{throw Object.assign(new Error('GS-POSITIVE-PROOF'),{code:'GS-POSITIVE-PROOF',proofContext,scopedClaimObserved});}
  }
  function persistPositiveProof(ctx,plan){
    ensureHostRoot();const target=proofPath(ctx),prior=readOptional(target,{used:0},65536);
    if(prior){const proof=readPositiveProof(ctx.root,ctx.rootIdentity);if(!proof||proof.ctx.common!==ctx.common||!sameIdentity(proof.ctx.commonIdentity,ctx.commonIdentity))fail('GS-PROOF-BINDING');return;}
    const value={schema:'pipeline.governance-positive-proof.v1',root:ctx.root,rootIdentity:ctx.rootIdentity,commonPath:ctx.common,commonIdentity:ctx.commonIdentity,scopeKey:ctx.scopeKey,by:plan.by,decidedAt:new Date().toISOString(),planSha256:plan.planSha256};
    const temporary=target+'.'+randomBytes(32).toString('hex')+'.tmp';let fd=openSync(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|(constants.O_NOFOLLOW??0),0o600),fileIdentity=identity(fstatSync(fd));
    try{
      const data=Buffer.from(JSON.stringify(value)+'\n');let written=0;while(written<data.length){const n=writeSync(fd,data,written,data.length-written,null);if(n<=0)fail('GS-WRITE');written+=n;}fsyncSync(fd);closeSync(fd);fd=null;
      const actual=readOptional(target,{used:0},65536);if(actual?.sha256!==prior?.sha256||actual&& !sameIdentity(actual.identity,prior.identity)||!sameIdentity(identity(physical(temporary)),fileIdentity))fail('GS-PROOF-DRIFT');
      renameSync(temporary,target);syncDirectory(hostRoot);if(!readPositiveProof(ctx.root,ctx.rootIdentity))fail('GS-PROOF-READBACK');
    }finally{if(fd!==null)closeSync(fd);const st=physical(temporary,{missing:true});if(st&&sameIdentity(identity(st),fileIdentity))unlinkSync(temporary);}
  }
  function inspect(ctx){
    const budget={used:0},path=storage(ctx);let raw;
    try{raw=readOptional(path,budget);}catch{fail(ctx.common?'GS-CONFIG-UNAVAILABLE':'GS-RECORD');}
    let record=null,block=null;
    if(raw){
      if(ctx.common)({record,block}=configRecord(raw.text,ctx.scopeKey));
      else{privatePath(hostRoot,true);privatePath(path,false);try{record=JSON.parse(raw.text);}catch{fail('GS-RECORD');}}
    }
    if(record&&!recordValid(record,ctx))fail('GS-RECORD-BINDING');
    const legacy=record?null:legacyObservation(ctx,budget);
    const removal=record?null:readOptional(join(ctx.root,".agent-pipeline","enrollment-git-creation-barrier.json"),budget,4096);
    if(!record&&removal){let value;try{value=JSON.parse(removal.text);}catch{fail("GS-GIT-CREATION-BARRIER");}
      if(!exact(value,["schema","root","rootIdentity","planSha256","phase"])||value.schema!=="pipeline.enrollment-git-removal-barrier.v1"||value.root!==ctx.root||!exact(value.rootIdentity,["dev","ino"])||!sameIdentity(value.rootIdentity,ctx.rootIdentity)||!/^[a-f0-9]{64}$/u.test(value.planSha256)||!["requested","created","retired"].includes(value.phase))fail("GS-GIT-CREATION-BARRIER");
      if(value.phase!=="retired")return {ctx,path,raw,record,block,state:"declined",provenance:{kind:"enrollment-git-creation-removal-barrier",refs:[{path:".agent-pipeline/enrollment-git-creation-barrier.json",sha256:removal.sha256}]}};
    }
    return {ctx,path,raw,record,block,state:record?.state??legacy.state,provenance:record?{kind:'explicit-local-decision',refs:[{path:ctx.common?'git-common-config':ctx.scopeKey+'.json',sha256:raw.sha256}]}:{kind:legacy.kind,refs:legacy.refs}};
  }
  function observation(ctx,result,state=result?.state??'inactive',codes=[]){return freeze({schema:GOVERNANCE_SCOPE_SCHEMA,state,root:ctx?.root??null,scopeKey:ctx?.scopeKey??null,repositoryKind:ctx?.repositoryKind??'unavailable',provenance:result?.provenance??{kind:'none',refs:[]},diagnostics:codes,requiresEnforcement:['active','unverifiable-active'].includes(state),hintAllowed:state==='inactive'&&ctx!==null});}
  function verifiedObservation(ctx,result,state=result?.state??'inactive',codes=[]){
    // A bounded historical diagnostic witness, never a current decision. Its
    // only producer is a successfully rechecked, root/common-bound Git record.
    if(ctx.common&&result.record?.state==='active'){
      positiveWitnesses.delete(ctx.root);positiveWitnesses.set(ctx.root,freeze({...ctx}));
      while(positiveWitnesses.size>128)positiveWitnesses.delete(positiveWitnesses.keys().next().value);
    }else positiveWitnesses.delete(ctx.root);
    return observation(ctx,result,state,codes);
  }
  function diagnosticPositiveWitness(root,rootIdentity){
    const ctx=positiveWitnesses.get(root);if(!ctx)return null;
    try{if(!sameIdentity(ctx.rootIdentity,rootIdentity)||!sameIdentity(ctx.commonIdentity,identity(physical(ctx.common,{directory:true})))){positiveWitnesses.delete(root);return null;}}
    catch{return null;}
    return {ctx:{...ctx,repositoryKind:'unavailable'},result:{state:'unverifiable-active',provenance:{kind:'none',refs:[]}}};
  }
  function retainedEnrollment(rootDir){
    const root=resolve(rootDir),rootIdentity=identity(physical(root,{directory:true}));
    let proof=null,proofError=null;try{proof=readPositiveProof(root,rootIdentity);}catch(error){proofError=error;}
    if(proof){
      // A usable current decline still outranks historical enrollment when
      // only the Git topology probe is broken. Proof itself grants no decline.
      try{const raw=readOptional(join(proof.ctx.common,'config'),{used:0});if(raw){const {record}=configRecord(raw.text,proof.ctx.scopeKey);if(record&&recordValid(record,proof.ctx)&&record.state==='declined')return {ctx:proof.ctx,result:{state:'declined',provenance:{kind:'explicit-local-decision',refs:[{path:'git-common-config',sha256:raw.sha256}]}}};}}catch{}
      return proof;
    }
    // Git topology failure alone is never enrollment. Read only an actual
    // root-bound decision or typed legacy enrollment within this physical root.
    let current=null,legacy=null;
    try{
      const local=physical(join(root,'.git'),{missing:true}),common=local?.isDirectory()?join(root,'.git'):null;
      const ctx={root,rootIdentity,scopeKey:digest(root),repositoryKind:'unavailable',common,commonIdentity:common?identity(local):null,hostControlIdentity:null};
      if(common){const raw=readOptional(join(common,'config'),{used:0});if(raw){const {record}=configRecord(raw.text,ctx.scopeKey);if(record&&recordValid(record,ctx))current={ctx,result:{state:record.state,provenance:{kind:'explicit-local-decision',refs:[{path:'git-common-config',sha256:raw.sha256}]}}};}}
      const observed=legacyObservation(ctx,{used:0});if(['active','unverifiable-active'].includes(observed.state))legacy={ctx,result:{state:observed.state,provenance:{kind:observed.kind,refs:observed.refs}}};
    }catch{}
    if(current){if(current.result.state==='declined')positiveWitnesses.delete(root);return current;}
    if(legacy)return legacy;
    const witness=diagnosticPositiveWitness(root,rootIdentity);if(witness)return witness;
    if(proofError)throw proofError;
    return null;
  }
  function observe({rootDir}={}){
    let ctx=null;
    try{ctx=physicalContext(rootDir);const first=inspect(ctx);const secondCtx=physicalContext(rootDir),second=inspect(secondCtx);if(JSON.stringify(first)!==JSON.stringify(second))fail('GS-OBSERVATION-DRIFT');return verifiedObservation(ctx,first);}catch(e){
      // Observation through a lexical root alias must not disarm an enrolled
      // physical repository. Resolve only for read-only authority observation;
      // decision planning still rejects the alias and performs no mutation.
      if(ctx===null&&e.code==='GS-ALIAS')try{
        const canonical=realpathSync(resolve(rootDir));ctx=physicalContext(canonical);
        const first=inspect(ctx),secondCtx=physicalContext(canonical),second=inspect(secondCtx);
        if(JSON.stringify(first)!==JSON.stringify(second))fail('GS-OBSERVATION-DRIFT');
        const state=['active','unverifiable-active'].includes(first.state)?'unverifiable-active':first.state;
        return freeze({...verifiedObservation(ctx,first,state,['GS-ALIAS']),hintAllowed:false});
      }catch(canonicalError){e=canonicalError;}
      if(e.ownedGitTopology===true||e.code==='GS-CONFIG-UNAVAILABLE')try{
        const retained=retainedEnrollment(ctx?.root??rootDir);
        if(retained)return observation(retained.ctx,retained.result,retained.result.state==='declined'?'declined':'unverifiable-active',[e.code]);
      }catch(proofError){if(proofError.code==='GS-POSITIVE-PROOF'&&proofError.scopedClaimObserved===true)return observation(proofError.proofContext,null,'unverifiable-active',['GS-POSITIVE-PROOF']);}
      // Dedicated record failure is an owned active-claim failure. Bare path /
      // unrelated-marker failure alone cannot activate foreign projects.
      const dedicated=['GS-CONFIG-RECORD','GS-FOREIGN-CONFIG-KEY','GS-CONFIG-DUPLICATE','GS-RECORD','GS-RECORD-BINDING','GS-PRIVATE-MODE','GS-LEGACY-ACTIVE-PROJECTION'].includes(e.code);
      let legacyActive=false;
      if(ctx&&!dedicated)try{const legacy=legacyObservation(ctx,{used:0});legacyActive=['active','unverifiable-active'].includes(legacy.state);}catch{}
      return freeze({...observation(ctx,null,dedicated||legacyActive?'unverifiable-active':'inactive',[typeof e.code==='string'&&/^GS-/.test(e.code)?e.code:'GS-UNAVAILABLE']),hintAllowed:false});
    }
  }
  function planDecision({rootDir,decision,by}={}){
    if(!['enroll','decline'].includes(decision)||typeof by!=='string'||!by.trim()||by.length>256||/[\x00-\x1f]/.test(by))fail('GS-DECISION');
    const ctx=physicalContext(rootDir),before=inspect(ctx);const payload={schema:GOVERNANCE_DECISION_PLAN_SCHEMA,root:ctx.root,scopeKey:ctx.scopeKey,repositoryKind:ctx.repositoryKind,rootIdentity:ctx.rootIdentity,commonIdentity:ctx.commonIdentity,decision,by,preimageSha256:before.raw?.sha256??null};
    const plan=freeze({...payload,planSha256:digest(JSON.stringify(payload))});plans.set(plan,{ctx,before,history:decision==='enroll'?enrollmentHistory(ctx):null,serialized:JSON.stringify(plan)});return plan;
  }
  function applyDecision(plan,{activate=false,planSha256}={}){
    const known=plans.get(plan);if(!activate||!known||JSON.stringify(plan)!==known.serialized||planSha256!==plan.planSha256)fail('GS-PLAN');
    const ctx=physicalContext(plan.root);if(JSON.stringify(ctx)!==JSON.stringify(known.ctx))fail('GS-SCOPE-DRIFT');
    const current=inspect(ctx);if(current.raw?.sha256!==known.before.raw?.sha256)fail('GS-PREIMAGE-DRIFT');
    if(plan.decision==='enroll'&&current.state==='active'){if(ctx.common)persistPositiveProof(ctx,plan);plans.delete(plan);return observe({rootDir:ctx.root});}
    if(plan.decision==='enroll'&&current.state==='unverifiable-active')fail('GS-ACTIVE-UNVERIFIABLE');
    const history=plan.decision==='enroll'?enrollmentHistory(ctx):null;
    if(history!==null&&JSON.stringify(history)!==JSON.stringify(known.history))fail('GS-HISTORY-DRIFT');
    const retained=history!==null&&history.length>0;
    if(plan.decision==='enroll'&&ctx.common===null&&retained)return {schema:'pipeline.enrollment-retirement-recovery.v1',status:'refused',code:ctx.hostControlIdentity?'GS-HOST-MANAGED-RETAINED-HISTORY':'GS-NONGIT-RETAINED-HISTORY',nextAction:governanceEnrollmentRecoveryAction({rootDir:ctx.root})};
    const pending=plan.decision==='enroll'&&ctx.common!==null?readGovernanceEnrollmentRetirement({rootDir:ctx.root}):null;
    if(plan.decision==='enroll'&&current.state==='declined'&&pending!==null&&pending.phase!=='active'){
      persistPositiveProof(ctx,plan);
      invokeEnrollmentRetirement('retire-enrollment',{root:ctx.root,scopeKey:ctx.scopeKey,barrierSha256:current.raw.sha256,by:pending.by});plans.delete(plan);return observe({rootDir:ctx.root});
    }
    const record={schema:GOVERNANCE_ENROLLMENT_SCHEMA,root:ctx.root,rootIdentity:ctx.rootIdentity,commonIdentity:ctx.commonIdentity,scopeKey:ctx.scopeKey,state:plan.decision==='enroll'&&!retained?'active':'declined',by:plan.by,decidedAt:new Date().toISOString()};
    let bytes;
    if(ctx.common){const tags=blockFor(ctx.scopeKey),block=tags.start+`[agent-pipeline "activation-${ctx.scopeKey}"]\n\trecord = ${JSON.stringify(JSON.stringify(record))}\n`+tags.end;const text=current.raw?.text??'';bytes=current.block?text.replace(current.block,block):text+(text&&!text.endsWith('\n')?'\n':'')+block;}
    else{ensureHostRoot();bytes=JSON.stringify(record)+'\n';}
    const target=current.path,lock=target+'.lock';let fd=null,locked=false,lockIdentity;
    try{
      physical(dirname(target),{directory:true});fd=openSync(lock,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|(constants.O_NOFOLLOW??0),0o600);locked=true;lockIdentity=identity(fstatSync(fd));
      const afterLock=inspect(ctx);if(afterLock.raw?.sha256!==current.raw?.sha256)fail('GS-PREIMAGE-DRIFT');
      if(history!==null&&JSON.stringify(enrollmentHistory(ctx))!==JSON.stringify(history))fail('GS-HISTORY-DRIFT');
      // Publish historical positive proof before changing config: an interrupted
      // explicitly authorized enrollment remains governed diagnostically. An
      // inactive decline never creates positive enrollment provenance.
      if(ctx.common&&(plan.decision==='enroll'||current.state==='active'))persistPositiveProof(ctx,plan);
      const data=Buffer.from(bytes);let written=0;while(written<data.length){const n=writeSync(fd,data,written,data.length-written,null);if(n<=0)fail('GS-WRITE');written+=n;}if(ctx.common&&current.raw)fchmodSync(fd,current.raw.mode);fsyncSync(fd);closeSync(fd);fd=null;
      if(ctx.common&&current.raw){const pre=physical(target);if(!sameIdentity(identity(pre),current.raw.identity))fail('GS-PREIMAGE-DRIFT');}
      if(JSON.stringify(physicalContext(ctx.root))!==JSON.stringify(ctx)||!sameIdentity(identity(physical(lock)),lockIdentity))fail('GS-SCOPE-DRIFT');
      renameSync(lock,target);locked=false;syncDirectory(dirname(target));plans.delete(plan);
      const result=observe({rootDir:ctx.root});if(result.state!==record.state)fail('GS-WRITE-READBACK');
      if(plan.decision==='enroll'&&retained&&ctx.common!==null)invokeEnrollmentRetirement('retire-enrollment',{root:ctx.root,scopeKey:ctx.scopeKey,barrierSha256:inspect(ctx).raw.sha256,by:plan.by});
      if(plan.decision==='enroll'&&record.state!=='active'&&ctx.common===null)return {...result,enrollmentStatus:'awaiting-canonical-git-creation',nextAction:governanceEnrollmentRecoveryAction({rootDir:ctx.root})};return result;
    }finally{if(fd!==null)closeSync(fd);if(locked){const actual=physical(lock,{missing:true});if(actual&&sameIdentity(identity(actual),lockIdentity))unlinkSync(lock);}}
  }
  function ensureHostRoot(){
    const full=resolve(hostRoot);let current=parse(full).root,createdRoot=false;
    for(const name of full.slice(current.length).split(sep).filter(Boolean)){current=join(current,name);if(physical(current,{missing:true})===null){mkdirSync(current,{mode:0o700});syncDirectory(dirname(current));if(current===hostRoot)createdRoot=true;}physical(current,{directory:true});}
    if(process.platform==='win32'&&createdRoot&&hardenWindowsPrivateDirectory(hostRoot).status!=='secure')fail('GS-PRIVATE-MODE');
    privatePath(hostRoot,true);
  }
  function recordOnboardingEnrollment({rootDir,activate=false}={}){
    if(activate!==true)fail('GS-ONBOARDING-ACTIVATION');
    const ctx=physicalContext(rootDir),legacy=legacyObservation(ctx,{used:0});
    if(legacy.state!=='active')fail('GS-ONBOARDING-PROVENANCE');
    const current=observe({rootDir});
    if(current.state==='declined'){if(enrollmentHistory(ctx).length===0){const plan=planDecision({rootDir,decision:'enroll',by:'authenticated-onboarding-activate'});return applyDecision(plan,{activate:true,planSha256:plan.planSha256});}if(ctx.common===null)fail(ctx.hostControlIdentity?'GS-HOST-MANAGED-RETAINED-HISTORY':'GS-NONGIT-RETAINED-HISTORY');const pending=readGovernanceEnrollmentRetirement({rootDir});if(!pending||pending.phase!=='pending')fail('GS-RETIREMENT-REQUIRED');
      invokeEnrollmentRetirement('activate-enrollment',{root:ctx.root,scopeKey:ctx.scopeKey,barrierSha256:inspect(ctx).raw.sha256,by:pending.by});return observe({rootDir});}
    if(current.state!=='active')fail('GS-ONBOARDING-PROVENANCE');return current;
  }
  function acquireRetirementConfigLock(ctx,current,barrierSha256){
    const lock=current.path+'.lock';
    const descriptor={schema:'pipeline.enrollment-retirement-scope-lock.v1',root:ctx.root,rootIdentity:ctx.rootIdentity,commonIdentity:ctx.commonIdentity,scopeKey:ctx.scopeKey,configSha256:current.raw.sha256,pid:process.pid,nonce:randomBytes(32).toString('hex')};
    let fd;
    try{fd=openSync(lock,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|(constants.O_NOFOLLOW??0),0o600);}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      const prior=readOptional(lock,{used:0},4096);let value;try{value=JSON.parse(prior.text);}catch{fail('GS-RETIRE-FOREIGN-LOCK');}
      if(!exact(value,Object.keys(descriptor))||value.schema!==descriptor.schema||value.root!==ctx.root||value.scopeKey!==ctx.scopeKey||![current.raw.sha256,barrierSha256].includes(value.configSha256)||JSON.stringify(value.rootIdentity)!==JSON.stringify(ctx.rootIdentity)||JSON.stringify(value.commonIdentity)!==JSON.stringify(ctx.commonIdentity)||!Number.isSafeInteger(value.pid)||value.pid<=0||!/^[a-f0-9]{64}$/u.test(value.nonce??''))fail('GS-RETIRE-FOREIGN-LOCK');
      try{process.kill(value.pid,0);fail('GS-RETIRE-LIVE-LOCK');}catch(e){if(e.code!=='ESRCH')throw e;}
      const recovery=lock+'.retirement-recovery',guard=openSync(recovery,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|(constants.O_NOFOLLOW??0),0o600),guardId=identity(fstatSync(guard));
      try{
        const again=readOptional(lock,{used:0},4096);
        if(again.sha256!==prior.sha256||!sameIdentity(again.identity,prior.identity)||inspect(ctx).raw.sha256!==current.raw.sha256)fail('GS-RETIRE-LOCK-CAS');
        unlinkSync(lock);syncDirectory(dirname(lock));
        fd=openSync(lock,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|(constants.O_NOFOLLOW??0),0o600);
      }finally{closeSync(guard);const actual=physical(recovery,{missing:true});if(actual&&sameIdentity(identity(actual),guardId)){unlinkSync(recovery);syncDirectory(dirname(recovery));}}
    }
    const bytes=Buffer.from(JSON.stringify(descriptor)+'\n');let n=0;while(n<bytes.length){const written=writeSync(fd,bytes,n,bytes.length-n,n);if(written<=0)fail('GS-RETIRE-LOCK-WRITE');n+=written;}fsyncSync(fd);syncDirectory(dirname(lock));return fd;
  }

  /** Scope/config lock is always acquired before canonical intake and State locks. */
  function withRetirementScopeLock({rootDir,scopeKey,barrierSha256,activeScopeSha256=null},operation){
    const ctx=physicalContext(rootDir),current=inspect(ctx);
    if(ctx.scopeKey!==scopeKey||current.record===null
      ||!(current.state==='declined'&&current.raw.sha256===barrierSha256)
        &&!(current.state==='active'&&activeScopeSha256!==null&&current.raw.sha256===activeScopeSha256))fail('GS-RETIRE-BARRIER');
    const lock=current.path+'.lock';let fd=acquireRetirementConfigLock(ctx,current,barrierSha256),published=false;
    const lockId=identity(fstatSync(fd));
    try{
      if(inspect(physicalContext(rootDir)).raw.sha256!==current.raw.sha256)fail('GS-RETIRE-CAS');
      const activePostimage=({by,at})=>{
        const record={...current.record,state:'active',by,decidedAt:at};if(!recordValid(record,ctx))fail('GS-RETIRE-ACTIVE');
        if(!ctx.common)return JSON.stringify(record)+'\n';
        const tags=blockFor(ctx.scopeKey),block=tags.start+`[agent-pipeline "activation-${ctx.scopeKey}"]\n\trecord = ${JSON.stringify(JSON.stringify(record))}\n`+tags.end;
        return current.raw.text.replace(current.block,block);
      };
      const activate=({by,at,expectedSha256})=>{
        const bytes=Buffer.from(activePostimage({by,at}));if(digest(bytes)!==expectedSha256)fail('GS-RETIRE-ACTIVE-CAS');
        if(inspect(physicalContext(rootDir)).raw.sha256!==current.raw.sha256||!sameIdentity(identity(physical(lock)),lockId))fail('GS-RETIRE-CAS');
        const temporary=lock+'.activation-'+randomBytes(32).toString('hex');
        let output=openSync(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|(constants.O_NOFOLLOW??0),0o600),temporaryId=identity(fstatSync(output));
        try{
          let n=0;while(n<bytes.length){const written=writeSync(output,bytes,n,bytes.length-n,n);if(written<=0)fail('GS-RETIRE-WRITE');n+=written;}
          if(ctx.common)fchmodSync(output,current.raw.mode);fsyncSync(output);closeSync(output);output=null;
          if(inspect(physicalContext(rootDir)).raw.sha256!==current.raw.sha256||!sameIdentity(identity(physical(lock)),lockId))fail('GS-RETIRE-CAS');
          renameSync(temporary,current.path);syncDirectory(dirname(current.path));
        }finally{if(output!==null)closeSync(output);const actual=physical(temporary,{missing:true});if(actual&&sameIdentity(identity(actual),temporaryId))unlinkSync(temporary);}
        if(inspect(ctx).raw.sha256!==expectedSha256)fail('GS-RETIRE-READBACK');
      };
      return operation({root:ctx.root,rootIdentity:ctx.rootIdentity,commonIdentity:ctx.commonIdentity,scopeKey:ctx.scopeKey,state:current.state,activePostimage,activate});
    }finally{if(fd!==null)closeSync(fd);if(!published){const st=physical(lock,{missing:true});if(st&&sameIdentity(identity(st),lockId))unlinkSync(lock);}}
  }

  const controller=Object.freeze({observe,planDecision,applyDecision,recordOnboardingEnrollment,withRetirementScopeLock});CONTROLLERS.add(controller);return controller;
}
function privatePath(path,directory){const st=physical(path,{directory});if(process.platform==='win32'){if(assessWindowsPrivatePath(path).status!=='secure')fail('GS-PRIVATE-MODE');}else if((st.mode&0o777)!==(directory?0o700:0o600))fail('GS-PRIVATE-MODE');}
function syncDirectory(path){let fd;try{fd=openSync(path,constants.O_RDONLY);fsyncSync(fd);}catch(e){if(process.platform!=='win32'||!['EPERM','EINVAL','EISDIR','EACCES','ENOTSUP'].includes(e.code))throw e;}finally{if(fd!==undefined)closeSync(fd);}}
const defaultController=createGovernanceScopeController();
export const observeGovernanceScope=options=>defaultController.observe(options);
export const planGovernanceScopeDecision=options=>defaultController.planDecision(options);
export const applyGovernanceScopeDecision=(plan,options)=>defaultController.applyDecision(plan,options);
export const recordGovernanceEnrollmentAfterOnboarding=({controller=defaultController,...options}={})=>{
  if(!CONTROLLERS.has(controller))fail('GS-CONTROLLER');return controller.recordOnboardingEnrollment(options);
};


const ENROLLMENT_WRITER=fileURLToPath(new URL('../scripts/pipeline-state.mjs',import.meta.url));
function invokeEnrollmentRetirement(command,{root,scopeKey,barrierSha256,by}){
 const result=JSON.parse(execFileSync(process.execPath,[ENROLLMENT_WRITER,command,'--root',root,'--scope-key',scopeKey,'--barrier-sha256',barrierSha256,'--by',by],{encoding:'utf8',maxBuffer:4194304,stdio:['ignore','pipe','pipe']}));
 if(result.schema!=='pipeline.enrollment-retirement-result.v1')fail('GS-RETIREMENT-RESULT');return result;
}
export function readGovernanceEnrollmentRetirement({rootDir}){
 const ctx=physicalContext(rootDir);
 if(ctx.hostControlIdentity){
  let retained;try{retained=enrollmentHistory(ctx);}catch{fail('GS-HOST-MANAGED-RETAINED-HISTORY');}
  const scope=defaultController.observe({rootDir:ctx.root});
  if(scope.state==='unverifiable-active')fail('GS-HOST-MANAGED-RETAINED-HISTORY');
  if(scope.state==='active')return null;
  if(retained.length>0)fail('GS-HOST-MANAGED-RETAINED-HISTORY');return null;
 }
 if(ctx.common===null){
  const scope=defaultController.observe({rootDir:ctx.root});
  if(scope.state==='unverifiable-active')fail(scope.diagnostics[0]??'GS-NONGIT-RETAINED-HISTORY');
  if(scope.state==='active')return null;if(noGitEnrollmentHistory(ctx.root))fail('GS-NONGIT-RETAINED-HISTORY');return null;
 }
 const result=JSON.parse(execFileSync(process.execPath,[ENROLLMENT_WRITER,'inspect-enrollment-retirement','--root',rootDir],{encoding:'utf8',maxBuffer:4194304,stdio:['ignore','pipe','pipe']}));
 if(result.schema!=='pipeline.enrollment-retirement-inspection.v1')fail('GS-RETIREMENT-INSPECTION');return result.journal;
}
export const withGovernanceRetirementScopeLock=(options,operation)=>defaultController.withRetirementScopeLock(options,operation);


export function governanceEnrollmentRecoveryAction({rootDir,runner}){
 const ctx=physicalContext(rootDir);
 if(ctx.hostControlIdentity)return {kind:'external-operator',executable:process.execPath,argv:[fileURLToPath(new URL('../scripts/project-onboarding-v3.mjs',import.meta.url)),'inspect','--root',ctx.root,...(runner?['--runner',runner]:[]),'--intent','session'],mutation:false,requiresConfirmation:false,expected:{schema:'pipeline.project-onboarding.v4',statuses:['enrollment-history-recovery-required','enrollment-retirement-required','host-repository-init-required','intake-required','partial','ready']},guidance:'The local retirement writer cannot consume retained enrollment history through this host-managed Git control mount. The external host must restore the same selected physical repository writable Git control view without deleting or copying retained authority or foreign scope. Then run this exact nonmutating inspection; it grants no fresh consent or plan approval.'};
 return {kind:'command',executable:process.execPath,argv:[fileURLToPath(new URL('../scripts/project-onboarding-v3.mjs',import.meta.url)),'plan-enrollment-git-creation','--root',rootDir,...(runner?['--runner',runner]:[])],mutation:false,requiresConfirmation:false,expected:{schema:'pipeline.enrollment-git-creation.v1',statuses:['planned','retained','refused']}};
}
function noGitEnrollmentHistory(root){
 const candidates=['project/pipeline-state.json','.claude/pipeline-state.json','.agent-pipeline/onboarding-consent.json','.claude/.runtime/agent-pipeline/onboarding'];
 return candidates.some(path=>physical(join(root,path),{missing:true})!==null);
}


export function prepareGovernanceEnrollmentBeforeIntake({rootDir,controller=defaultController}){
 if(!CONTROLLERS.has(controller))fail('GS-CONTROLLER');const current=controller.observe({rootDir});if(current.state==='active')return current;
 const plan=controller.planDecision({rootDir,decision:'enroll',by:'authenticated-onboarding-activate'});return controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256});
}
