// SPDX-License-Identifier: SUL-1.0
// Prepared physical diagnostics, never an executing-path attestation.
import {openSync,closeSync,readSync,fstatSync,lstatSync,realpathSync,opendirSync,constants} from 'node:fs';
import {resolve,join,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {parseStrictJson,canonicalizeJson} from './governance-event.mjs';

export const AGY_TOPOLOGY_SCHEMA='pipeline.antigravity-plugin-topology.v1';
export const AGY_FILE_LIMIT=262144, AGY_TREE_BYTES=67108864, AGY_TREE_FILES=4096;
const PUBLIC_FILE_LIMIT=2097152;
const snapshots=new WeakMap(), hash=b=>createHash('sha256').update(b).digest('hex');
export function supportsAntigravityPluginCliVersion(version){
  if(typeof version!=='string')return false;
  const match=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
  if(!match)return false;
  const [major,minor,patch]=match.slice(1).map(Number);
  if(![major,minor,patch].every(Number.isSafeInteger))return false;
  return major>1||(major===1&&(minor>2||(minor===2&&patch>=12)));
}
const valueHash=v=>hash(canonicalizeJson(v));
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
function same(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;}
function names(path,max){const dir=opendirSync(path),result=[];try{let entry;while((entry=dir.readSync())!==null){if(result.length>=max)throw Error('AT-DIRECTORY-BOUND');result.push(entry.name);}return result.sort();}finally{dir.closeSync();}}
function physicalDirectory(path){
  if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||realpathSync(path)!==path)throw Error('AT-ALIAS');
  const st=lstatSync(path);if(!st.isDirectory()||st.isSymbolicLink())throw Error('AT-DIRECTORY');return path;
}
// Bounded actual FD read, not an unbounded readFile followed by a size check.
function file(path,limit=AGY_FILE_LIMIT){
  physicalDirectory(resolve(path,'..'));let fd;
  try{
    const before=lstatSync(path,{bigint:true});
    if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>BigInt(limit))throw Error('AT-FILE');
    fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);const opened=fstatSync(fd,{bigint:true});
    if(!same(before,opened))throw Error('AT-DRIFT');
    const buf=Buffer.alloc(limit+1);let n=0,r;
    while(n<buf.length&&(r=readSync(fd,buf,n,buf.length-n,null))>0)n+=r;
    if(n>limit||BigInt(n)!==opened.size||!same(opened,fstatSync(fd,{bigint:true}))||!same(opened,lstatSync(path,{bigint:true})))throw Error('AT-DRIFT');
    const bytes=buf.subarray(0,n);return {bytes,sha256:hash(bytes),size:n};
  }finally{if(fd!==undefined)closeSync(fd);}
}
function json(path){const f=file(path);return {...f,value:parseStrictJson(f.bytes)};}
function optional(path){try{return {status:'observed',...json(path)};}catch(e){return {status:e.code==='ENOENT'?'absent':'unavailable'};}}
function tree(root){
  const refs=[];let total=0,dirs=0;physicalDirectory(root);
  function walk(dir,prefix='',depth=0){
    if(depth>16||++dirs>512)throw Error('AT-DIRECTORY-BOUND');
    const before=lstatSync(dir,{bigint:true});physicalDirectory(dir);
    for(const name of names(dir,AGY_TREE_FILES)){
      // Anchored names: "topology" must never be skipped because it contains "log".
      if(/^(?:\.git|auth|credentials|secrets|logs|sessions|history)$/i.test(name))throw Error('AT-PRIVATE-SURFACE');
      const path=join(dir,name),rel=prefix+name,st=lstatSync(path);
      if(st.isSymbolicLink())throw Error('AT-ALIAS');
      if(st.isDirectory())walk(path,rel+'/',depth+1);
      else if(st.isFile()){
        if(refs.length>=AGY_TREE_FILES)throw Error('AT-TREE-BOUND');
        const f=file(path,PUBLIC_FILE_LIMIT);total+=f.size;if(total>AGY_TREE_BYTES)throw Error('AT-TREE-BOUND');
        refs.push({path:rel,sha256:f.sha256,bytes:f.size});
      }else throw Error('AT-TYPE');
    }
    if(!same(before,lstatSync(dir,{bigint:true})))throw Error('AT-DRIFT');
  }
  walk(root);return {sha256:valueHash(refs),files:refs.length,bytes:total};
}
function candidate(root,pluginName){
  try{
    physicalDirectory(root);const m=json(join(root,'plugin.json'));
    if(typeof m.value?.name!=='string'||m.value.name.length>128||typeof m.value?.version!=='string'||m.value.version.length>128)throw Error('AT-MANIFEST');
    if(m.value.name!==pluginName)return {root,status:'foreign',name:m.value.name,manifestSha256:m.sha256};
    return {root,status:'observed',name:pluginName,version:m.value.version,manifestSha256:m.sha256,content:tree(root)};
  }catch{return {root,status:'unavailable'};}
}
function registry(path,pluginName){
  const f=optional(path);if(f.status!=='observed')return {path,status:f.status,sha256:null,entries:[]};
  if(!Array.isArray(f.value?.entries)||f.value.entries.length>128)return {path,status:'unavailable',sha256:f.sha256,entries:[]};
  const entries=f.value.entries.map((v,index)=>{
    if(typeof v?.path!=='string')return {index,status:'unavailable'};
    return {index,...candidate(v.path,pluginName)};
  });
  return {path,status:entries.some(e=>e.status==='unavailable')?'unavailable':'observed',sha256:f.sha256,entries};
}
export function observeAntigravityPluginTopology({configRoot,workspaceRoot,approvedSourceRoot,pluginName='agent-pipeline-core'}){
  if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(pluginName))throw Error('AT-NAME');
  physicalDirectory(configRoot);physicalDirectory(workspaceRoot);
  const source=candidate(approvedSourceRoot,pluginName), managed=[];let managedStatus='observed';
  try{
    const root=physicalDirectory(join(configRoot,'config','plugins'));
    for(const name of names(root,128)){const c=candidate(join(root,name),pluginName);if(c.status!=='foreign')managed.push(c);}
    if(managed.some(c=>c.status!=='observed'))managedStatus='unavailable';
  }catch(e){managedStatus=e.code==='ENOENT'?'absent':'unavailable';}
  const imported=optional(join(configRoot,'config','import_manifest.json'));
  let importState={status:imported.status,sha256:imported.sha256??null,entries:[]};
  if(imported.status==='observed'){
    if(!Array.isArray(imported.value?.imports)||imported.value.imports.length>128)importState.status='unavailable';
    else importState.entries=imported.value.imports.filter(e=>e?.name===pluginName).map(e=>({name:pluginName,source:typeof e.source==='string'?e.source:null}));
  }
  const registries={global:registry(join(configRoot,'config','plugins.json'),pluginName),workspace:registry(join(workspaceRoot,'.agents','plugins.json'),pluginName)};
  const wiring=[join(configRoot,'config','hooks.json'),join(configRoot,'config','external-hooks.json'),join(workspaceRoot,'.agents','hooks.json'),join(workspaceRoot,'.agents','external-hooks.json')].map(path=>{
    const f=optional(path);return {path,status:f.status,sha256:f.sha256??null,ownership:f.status==='observed'?'unclassified':'not-observed'};
  });
  const result=freeze({schema:AGY_TOPOLOGY_SCHEMA,source,managed:{status:managedStatus,candidates:managed},importState,registries,wiring,executingPath:'unknown'});
  snapshots.set(result,{configRoot,workspaceRoot,approvedSourceRoot,pluginName,digest:valueHash(result)});return result;
}
// Metadata plan only. Host admission/CLI invocation/atomic registry application
// and subsequent independent observation remain separate trusted responsibilities.
export function planAntigravityTopologyRefresh({observation,scope,globalChangeApproved=false,cliVersion}){
  const binding=snapshots.get(observation);if(!binding)throw Error('AT-NOT-PHYSICAL-OBSERVATION');
  const held=reason=>freeze({schema:'pipeline.antigravity-refresh-plan.v1',status:'held',reason,observationSha256:binding.digest,actions:[]});
  if(!['workspace','global'].includes(scope))return held('AT-SCOPE');
  if(!supportsAntigravityPluginCliVersion(cliVersion))return held('AT-CLI-CAPABILITY-UNOBSERVED');
  if(observation.source.status!=='observed'||observation.managed.status==='unavailable'||observation.importState.status==='unavailable'||Object.values(observation.registries).some(r=>r.status==='unavailable')||observation.wiring.some(w=>w.status==='unavailable'||w.status==='observed'))return held('AT-UNVERIFIABLE-SURFACE');
  const managed=observation.managed.candidates,imports=observation.importState.entries;
  if(managed.length>1||imports.length>1||(imports.length===1&&managed.length!==1)||(managed.length===1&&imports.length!==1))return held('AT-MANAGED-IMPORT-AMBIGUOUS');
  const desired=observation.source,old=managed[0];
  const other=observation.registries[scope==='global'?'workspace':'global'];
  if(other.entries.some(e=>e.status==='observed'&&e.root!==desired.root))return held('AT-OTHER-SCOPE-PIPELINE-CONFLICT');
  const needsManaged=scope==='global'&&(!old||old.content.sha256!==desired.content.sha256);
  // A managed copy is global. Per-project intent never silently retires it.
  if((needsManaged||(scope==='workspace'&&old))&&!globalChangeApproved)return held('AT-GLOBAL-CHANGE-REQUIRES-EXPLICIT-SCOPE');
  const actions=[];
  if(needsManaged||(scope==='workspace'&&old)){
    if(old)actions.push({kind:'cli',argv:['plugin','uninstall',binding.pluginName]});
    if(scope==='global')actions.push({kind:'cli',argv:['plugin','validate',desired.root]},{kind:'cli',argv:['plugin','install',desired.root]});
  }
  const registry=observation.registries[scope];
  const pipeline=registry.entries.filter(e=>e.status==='observed');
  if(pipeline.length!==1||pipeline[0].root!==desired.root)actions.push({kind:'registry-rebind',scope,path:registry.path,expectedSha256:registry.sha256,removeIndexes:pipeline.map(e=>e.index),appendPath:desired.root,preserveOtherEntries:true});
  return freeze({schema:'pipeline.antigravity-refresh-plan.v1',status:actions.length?'prepared':'metadata-current',observationSha256:binding.digest,sourceContentSha256:desired.content.sha256,actions,requiresIndependentReadback:true,executingPath:'unknown'});
}
export function reobserveAntigravityTopology(observation){const args=snapshots.get(observation);if(!args)throw Error('AT-NOT-PHYSICAL-OBSERVATION');return observeAntigravityPluginTopology(args);}
// Internal host adapter reads: never serialize their raw values into diagnostics.
export function readAntigravityPhysicalJson(path){return json(path);}
export function antigravityTopologySha256(value){return valueHash(value);}
export function observeAntigravityLoadedTopology({loadedPluginRoot,configRoot,workspaceRoot}){
  try{
    const loaded=candidate(loadedPluginRoot,'agent-pipeline-core');if(loaded.status!=='observed')throw Error('AT-LOADED-UNAVAILABLE');
    const global=registry(join(configRoot,'config','plugins.json'),'agent-pipeline-core'),workspace=registry(join(workspaceRoot,'.agents','plugins.json'),'agent-pipeline-core');
    if([global,workspace].some(r=>r.status==='unavailable'))throw Error('AT-REGISTRY-UNAVAILABLE');
    const roots=[...new Set([global,workspace].flatMap(r=>r.entries.filter(e=>e.status==='observed').map(e=>e.root)))];
    if(roots.length!==1)throw Error('AT-REGISTRY-AMBIGUOUS');
    const observation=observeAntigravityPluginTopology({configRoot,workspaceRoot,approvedSourceRoot:roots[0]});
    if(observation.source.status!=='observed'||observation.managed.status==='unavailable'||observation.importState.status==='unavailable')throw Error('AT-TOPOLOGY-UNAVAILABLE');
    const copies=observation.managed.candidates,imports=observation.importState.entries;
    if(copies.length>1||imports.length>1||(copies.length===1)!==(imports.length===1))throw Error('AT-MANAGED-IMPORT-AMBIGUOUS');
    const loadedKind=loadedPluginRoot===roots[0]?'direct':copies.some(c=>c.root===loadedPluginRoot)?'managed-copy':'unknown';
    const mismatches=copies.filter(c=>c.content.sha256!==observation.source.content.sha256);
    const current=loadedKind!=='unknown'&&loaded.content.sha256===observation.source.content.sha256&&mismatches.length===0;
    return Object.freeze({schema:'pipeline.antigravity-loaded-topology.v1',status:current?'current':'refresh-required',sourcePluginRoot:roots[0],loadedPluginRoot,loadedKind,sourceContentSha256:observation.source.content.sha256,loadedContentSha256:loaded.content.sha256,managedContentMismatch:mismatches.length>0,executingGuardAssurance:'not-established-by-topology'});
  }catch{return Object.freeze({schema:'pipeline.antigravity-loaded-topology.v1',status:'unavailable',reason:'AT-TOPOLOGY-UNVERIFIABLE',executingGuardAssurance:'not-established-by-topology'});}
}
