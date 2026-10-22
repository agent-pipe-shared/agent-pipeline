// SPDX-License-Identifier: SUL-1.0
// Host-owned lifecycle coordinator. No API accepts a deserialized action plan.
import {spawnSync} from 'node:child_process';
import {mkdirSync,lstatSync,realpathSync,openSync,closeSync,writeFileSync,fsyncSync,renameSync,unlinkSync,existsSync} from 'node:fs';
import {join,dirname,resolve,isAbsolute,relative,sep} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {observeAntigravityPluginTopology,observeAntigravityLoadedTopology,readAntigravityPhysicalJson,antigravityTopologySha256,supportsAntigravityPluginCliVersion,antigravityManagedPluginRoot,antigravityPathAbsent,antigravityRegistryEntries,antigravityWorkspaceRelativePath,ANTIGRAVITY_WORKSPACE_SOURCE_OUTSIDE_GUIDANCE} from './antigravity-plugin-topology.mjs';
import {rewriteAntigravityJsonBytes} from './antigravity-json-spans.mjs';
import {createHash} from 'node:crypto';
const NAME='agent-pipeline-core';
function directory(path){if(!isAbsolute(path)||resolve(path)!==path||realpathSync(path)!==path||!lstatSync(path).isDirectory())throw Error('ATR-DIRECTORY');}
function read(path){try{const f=readAntigravityPhysicalJson(path);return {status:'observed',...f};}catch(e){if(e.code==='ENOENT')return {status:'absent',sha256:null,value:null};throw Error('ATR-PHYSICAL-READ');}}
function write(path,bytes,expectedSha256){
 const parent=dirname(path);if(!existsSync(parent)){directory(dirname(parent));mkdirSync(parent,{mode:0o700});}directory(parent);
 const current=read(path);if(current.sha256!==expectedSha256)throw Error('ATR-PREIMAGE-DRIFT');
 const temporary=join(parent,'.pipeline-refresh-'+randomUUID()+'.tmp');let fd;
 try{fd=openSync(temporary,'wx',0o600);writeFileSync(fd,bytes);fsyncSync(fd);closeSync(fd);fd=undefined;
  if(read(path).sha256!==expectedSha256)throw Error('ATR-PREIMAGE-DRIFT');directory(parent);renameSync(temporary,path);
 }finally{if(fd!==undefined)closeSync(fd);if(existsSync(temporary))unlinkSync(temporary);}
 const result=read(path);if(result.sha256!==createHash('sha256').update(bytes).digest('hex'))throw Error('ATR-WRITE-READBACK');return result.sha256;
}
function command(value){
 // Exact literal Node/file/optional fixed hint-mode syntax, no shell operators.
 if(typeof value!=='string')return null;
 const m=/^node (?:"([^"\r\n$`]+)"|'([^'\r\n$`]+)'|([^\s"';&|<>$`]+))(?: (observe|deliver))?$/.exec(value);
 if(!m)return null;return {path:m[1]??m[2]??m[3],arg:m[4]??null};
}
function templates(root){
 const f=read(join(root,'hooks.json'));if(f.status!=='observed')throw Error('ATR-HOOK-MANIFEST');const set=new Set();
 function visit(v){if(v&&typeof v==='object'){if(typeof v.command==='string'){const c=command(v.command);if(!c||!/^hooks\/[a-z0-9-]+\.mjs$/.test(c.path))throw Error('ATR-HOOK-TEMPLATE');
    const path=join(root,c.path);const st=lstatSync(path);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||realpathSync(path)!==path)throw Error('ATR-HOOK-SCRIPT');set.add(c.path+'\0'+(c.arg??''));}
    for(const value of Object.values(v))visit(value);}}
 visit(f.value);return set;
}
// Separator-aware containment: the relative path (always '/'-separated) when `path` lies strictly inside `root`, else null.
function within(root,path){const rel=relative(root,path);if(rel===''||rel==='..'||rel.startsWith('..'+sep)||rel.startsWith('../')||isAbsolute(rel))return null;return rel.split(sep).join('/');}
function wiring(observation,configRoot,workspaceRoot){
 if(/["'\r\n$`;&|<>]/.test(observation.source.root))throw Error('ATR-UNSAFE-COMMAND-PATH');
 const roots=[observation.source,...observation.managed.candidates,...Object.values(observation.registries).flatMap(r=>r.entries)].filter(c=>c.status==='observed');
 const sets=new Map(roots.map(c=>[c.root,templates(c.root)]));const desired=sets.get(observation.source.root),result=[];
 // The managed-copy location while it is gone (an earlier uninstall removed it): its scripts cannot exist, so a command into it is Pipeline-owned.
 const managedRoot=antigravityManagedPluginRoot(configRoot,NAME),managedGone=antigravityPathAbsent(managedRoot);
 for(const [scope,path] of [['global',join(configRoot,'config','hooks.json')],['global',join(configRoot,'config','external-hooks.json')],['workspace',join(workspaceRoot,'.agents','hooks.json')],['workspace',join(workspaceRoot,'.agents','external-hooks.json')]]){
  const f=read(path);if(f.status==='absent'){result.push({scope,path,sha256:null,nextBytes:null,changes:0});continue;}
  let changes=0,visits=0;const replacements=[],deletions=[];
  function transform(value,location=[],parentArray=false){
   if(++visits>4096)throw Error('ATR-WIRING-BOUND');
   if(Array.isArray(value)){value.forEach((v,i)=>transform(v,[...location,i],true));return;}
   if(value===null||typeof value!=='object')return value;
   if(Object.hasOwn(value,'command')){
    const c=command(value.command);let owner=null,key=null;
    if(c&&isAbsolute(c.path)){
     for(const [root,set] of sets){{const rel=within(root,c.path);if(rel===null)continue;const candidate=rel+'\0'+(c.arg??'');if(set.has(candidate)){owner=root;key=candidate;break;}}}
     // Strictly inside the vanished managed location: owned whether or not the approved source still ships that script (rewritten, or deleted from its array below).
     if(owner===null&&managedGone){const rel=within(managedRoot,c.path);if(rel!==null){owner=managedRoot;key=rel+'\0'+(c.arg??'');}}
    }
    if(owner!==null){if(!desired.has(key)){if(!parentArray)throw Error('ATR-WIRING-OWNERSHIP-UNVERIFIABLE');changes++;deletions.push(location);return;}const [rel,arg]=key.split('\0'),next='node "'+join(observation.source.root,rel)+'"'+(arg?' '+arg:'');if(next!==value.command){changes++;replacements.push({path:[...location,'command'],value:next});}return;}
    // A pipeline-shaped but unproved command is held, not foreign-classified.
    if(typeof value.command==='string'&&(/pipeline-core|antigravity-(?:pretool|start|stop|slicing)/.test(value.command)||roots.some(r=>value.command.includes(r.root))))throw Error('ATR-WIRING-OWNERSHIP-UNVERIFIABLE');
    return value;
   }
   for(const [key,v] of Object.entries(value))transform(v,[...location,key]);
  }
  transform(f.value);result.push({scope,path,sha256:f.sha256,nextBytes:rewriteAntigravityJsonBytes(f.bytes,{replacements,deletions}),changes});
 }
 return result;
}
// D79: the tracked workspace registry never carries a machine path. A relative (tracked, path-free) entry is never a second root, never rewritten, never removed.
const conflicting=(registry,root)=>registry.entries.some(e=>e.status==='observed'&&e.relative!==true&&e.root!==root);
const refusal=(schema,e,extra={})=>{const reason=/^ATR-[A-Z-]+$/.test(e.message)?e.message:'ATR-UNAVAILABLE';return {schema,status:'refused',reason,...(reason==='ATR-WORKSPACE-SOURCE-OUTSIDE'?{guidance:ANTIGRAVITY_WORKSPACE_SOURCE_OUTSIDE_GUIDANCE}:{}),...extra};};
// What one registry needs, or null when it is bound. Global: exactly the source root. Workspace: no absolute Pipeline entry, plus (workspace scope only) a tracked relative entry naming the source, appended as the repo-relative path.
function registryChange(observation,selected,scope,workspaceRoot){
 const {tracked,pipeline,dangling}=antigravityRegistryEntries(observation.registries[selected]),source=observation.source;
 if(selected==='global'){
  const bound=pipeline.length===1&&pipeline[0].root===source.root,removed=(bound?dangling:[...pipeline,...dangling]).map(e=>e.index).sort((a,b)=>a-b);
  const append=!bound&&(selected===scope||pipeline.length>0)?source.root:null;
  return removed.length||append!==null?{removed,append}:null;
 }
 const removed=[...pipeline,...dangling].map(e=>e.index).sort((a,b)=>a-b),append=selected===scope&&!tracked.some(e=>e.root===source.root)?antigravityWorkspaceRelativePath(workspaceRoot,source.root):null;
 if(selected===scope&&append===null&&!tracked.some(e=>e.root===source.root))throw Error('ATR-WORKSPACE-SOURCE-OUTSIDE');
 return removed.length||append!==null?{removed,append}:null;
}
// The final readback of one registry: global holds only the source root (exactly once in its own scope); workspace holds no absolute Pipeline entry (and, in its own scope, a relative one naming the source).
function registryBound(final,selected,scope,source){
 const registry=final.registries[selected];if(registry.status!=='observed')return false;
 const {tracked,pipeline}=antigravityRegistryEntries(registry);
 if(selected==='global')return pipeline.every(e=>e.root===source.root)&&(selected!==scope||pipeline.length===1);
 return pipeline.length===0&&(selected!==scope||tracked.some(e=>e.root===source.root));
}
function physicalCli(path){if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||!lstatSync(path).isFile())throw Error('ATR-CLI');return realpathSync(path);}
export function resolveAntigravityCliPath(){const r=spawnSync(process.platform==='win32'?'where.exe':'which',['agy'],{encoding:'utf8',timeout:5000,maxBuffer:65536});if(r.status!==0||r.error)return null;try{return physicalCli(r.stdout.trim().split(/\r?\n/)[0]);}catch{return null;}}
export function observeAntigravityLoadedTopologyWithWiring(args){
 const result=observeAntigravityLoadedTopology(args);if(result.status==='unavailable')return result;
 try{const observation=observeAntigravityPluginTopology({configRoot:args.configRoot,workspaceRoot:args.workspaceRoot,approvedSourceRoot:result.sourcePluginRoot});const plans=wiring(observation,args.configRoot,args.workspaceRoot);return Object.freeze({...result,status:result.status==='current'&&plans.some(p=>p.changes>0)?'refresh-required':result.status,wiringStatus:plans.some(p=>p.changes>0)?'stale-owned':'current-or-foreign'});}
 catch(e){return Object.freeze({...result,status:'unavailable',reason:/^ATR-[A-Z-]+$/.test(e?.message)?e.message:'ATR-WIRING-OWNERSHIP-UNVERIFIABLE',wiringStatus:'unverifiable'});}
}
// `trackedRelative` (uninstall only): a tracked, path-free (repo-relative) entry is resolved against the workspace, must lie strictly inside it, and is then classified by its manifest name like an absolute one. Without the flag a relative entry stays unavailable (the refresh paths never own or remove a tracked entry). A relative entry that resolves elsewhere or cannot be read stays unavailable.
export function observeAntigravityWorkspaceBindings({workspaceRoot,trackedRelative=false}){
 const path=join(workspaceRoot,'.agents','plugins.json');
 try{directory(workspaceRoot);const f=read(path);if(f.status==='absent')return {schema:'pipeline.antigravity-workspace-bindings.v1',status:'absent',path,sha256:null,ownedIndexes:[],foreignIndexes:[]};
  if(!Array.isArray(f.value?.entries)||f.value.entries.length>128)throw Error('ATR-REGISTRY');const ownedIndexes=[],foreignIndexes=[];
  f.value.entries.forEach((entry,index)=>{if(typeof entry?.path!=='string')throw Error('ATR-REGISTRY');let target=entry.path;if(trackedRelative&&!isAbsolute(target)){target=resolve(workspaceRoot,target);if(within(workspaceRoot,target)===null)throw Error('ATR-REGISTRY');}directory(target);const manifest=read(join(target,'plugin.json'));if(manifest.status!=='observed'||typeof manifest.value?.name!=='string')throw Error('ATR-REGISTRY');(manifest.value.name===NAME?ownedIndexes:foreignIndexes).push(index);});
  return {schema:'pipeline.antigravity-workspace-bindings.v1',status:'observed',path,sha256:f.sha256,ownedIndexes,foreignIndexes};
 }catch{return {schema:'pipeline.antigravity-workspace-bindings.v1',status:'unavailable',path,sha256:null,ownedIndexes:[],foreignIndexes:[]};}
}
export function removeAntigravityWorkspaceRegistration({workspaceRoot,expectedSha256}){
 try{const o=observeAntigravityWorkspaceBindings({workspaceRoot});if(o.status==='absent'&&expectedSha256===null)return {status:'absent'};
  if(o.status!=='observed'||o.sha256!==expectedSha256)throw Error('ATR-REGISTRY-PREIMAGE');
  if(o.ownedIndexes.length===0)return {status:'absent'};
  const f=read(o.path),next=rewriteAntigravityJsonBytes(f.bytes,{deletions:o.ownedIndexes.map(i=>['entries',i])});write(o.path,next,expectedSha256);
  const after=observeAntigravityWorkspaceBindings({workspaceRoot});if(after.status!=='observed'||after.ownedIndexes.length)throw Error('ATR-REGISTRY-READBACK');return {status:'removed'};
 }catch{return {status:'refused',reason:'ATR-WORKSPACE-REGISTRY-UNVERIFIABLE'};}
}
export function createAntigravityRefreshHost({configRoot,workspaceRoot,approvedSourceRoot,scope,globalChangeApproved=false,cliPath=null,runCli,writeInstalledReceipt}={}){
 directory(configRoot);directory(workspaceRoot);directory(approvedSourceRoot);
 if(!['global','workspace'].includes(scope))throw Error('ATR-SCOPE');
 if(runCli!==undefined&&typeof runCli!=='function')throw Error('ATR-SEALED-CLI');
 // injected function is a sealed host dependency, never read from stdin/JSON.
 const invoke=runCli??((argv)=>{if(configRoot!==join(homedir(),'.gemini'))return {status:'unavailable'};const path=physicalCli(cliPath);const r=spawnSync(path,argv,{encoding:'utf8',timeout:20000,maxBuffer:65536});return r.error||r.signal||r.status!==0?{status:'failed'}:{status:'ok',version:argv[0]==='--version'?r.stdout.trim():null};});
 const args={configRoot,workspaceRoot,approvedSourceRoot},plans=new WeakMap();let active=false;
 const host={prepare(){
  try{
   const version=invoke(['--version']);if(version?.status!=='ok'||!supportsAntigravityPluginCliVersion(version.version))throw Error('ATR-CLI-CAPABILITY');
   const observation=observeAntigravityPluginTopology(args);
   if(observation.source.status!=='observed'||observation.managed.status==='unavailable'||observation.importState.status==='unavailable'||Object.values(observation.registries).some(r=>r.status==='unavailable'))throw Error('ATR-TOPOLOGY-UNVERIFIABLE');
   const hooks=wiring(observation,configRoot,workspaceRoot),copy=observation.managed.candidates[0];
   if(observation.managed.candidates.length>1||observation.importState.entries.length>1||(!!copy)!==(observation.importState.entries.length===1))throw Error('ATR-MANAGED-IMPORT-AMBIGUOUS');
   // A matching managed copy may remain active even for a workspace binding.
   // Its external attestation is written below after the exact final readback.
   // Only a stale copy requires a global lifecycle change.
   const retire=!!copy&&copy.content.sha256!==observation.source.content.sha256,install=scope==='global'&&(!copy||retire);
   const other=scope==='global'?'workspace':'global';
   if(conflicting(observation.registries[other],observation.source.root)&&!globalChangeApproved)throw Error('ATR-OTHER-SCOPE-CONFLICT');
   if((retire||install||hooks.some(h=>h.scope==='global'&&h.changes)||scope==='global')&&!globalChangeApproved)throw Error('ATR-GLOBAL-SCOPE');
   if(scope==='workspace'&&antigravityWorkspaceRelativePath(workspaceRoot,observation.source.root)===null)throw Error('ATR-WORKSPACE-SOURCE-OUTSIDE');
   // A replaced managed copy is retired only after the source validates, so the plan validates first and again before the install.
   const validation=()=>({kind:'cli',argv:Object.freeze(['plugin','validate',observation.source.root])}),actions=[];if(retire&&install)actions.push(validation());if(retire)actions.push({kind:'cli',argv:Object.freeze(['plugin','uninstall',NAME])});if(install)actions.push(validation(),{kind:'cli',argv:Object.freeze(['plugin','install',observation.source.root])});
   for(const h of hooks)if(h.changes)actions.push({kind:'owned-wiring-rebind',scope:h.scope,path:h.path,sha256:h.sha256,changes:h.changes,preserveForeignBytes:true});
   for(const selected of globalChangeApproved?[scope,other]:[scope]){const r=observation.registries[selected];if(registryChange(observation,selected,scope,workspaceRoot)!==null)actions.push({kind:'owned-registry-rebind',scope:selected,path:r.path,sha256:r.sha256,preserveForeignBytes:true});}
   const plan=Object.freeze({schema:'pipeline.antigravity-refresh-plan.v2',status:'prepared',scope,globalChangeApproved,sourceRoot:observation.source.root,sourceContentSha256:observation.source.content.sha256,observationSha256:antigravityTopologySha256(observation),actions:Object.freeze(actions.map(Object.freeze)),requiresFreshExecutingSession:true});plans.set(plan,plan.observationSha256);return plan;
  }catch(e){return Object.freeze(refusal('pipeline.antigravity-refresh-plan.v2',e));}
 },apply(plan){
  const bound=plans.get(plan);if(!bound)return {schema:'pipeline.antigravity-refresh-result.v1',status:'refused',reason:'ATR-UNOWNED-PLAN',completed:[]};
  plans.delete(plan);try{if(antigravityTopologySha256(observeAntigravityPluginTopology(args))!==bound)return {schema:'pipeline.antigravity-refresh-result.v1',status:'refused',reason:'ATR-TOPOLOGY-DRIFT',completed:[]};}catch{return {schema:'pipeline.antigravity-refresh-result.v1',status:'refused',reason:'ATR-TOPOLOGY-DRIFT',completed:[]};}
  return host.refresh();
 },refresh(){
  if(active)return {status:'refused',reason:'ATR-REENTRANT'};active=true;const completed=[];let changed=false;
  try{
   const version=invoke(['--version']);if(version?.status!=='ok'||!supportsAntigravityPluginCliVersion(version.version))throw Error('ATR-CLI-CAPABILITY');
   let observation=observeAntigravityPluginTopology(args);
   if(observation.source.status!=='observed'||observation.managed.status==='unavailable'||observation.importState.status==='unavailable'||Object.values(observation.registries).some(r=>r.status==='unavailable'))throw Error('ATR-TOPOLOGY-UNVERIFIABLE');
   const source=observation.source,managed=observation.managed.candidates,imports=observation.importState.entries;
   if(managed.length>1||imports.length>1||(managed.length===1)!==(imports.length===1))throw Error('ATR-MANAGED-IMPORT-AMBIGUOUS');
   const hookPlans=wiring(observation,configRoot,workspaceRoot);
   const other=scope==='workspace'?'global':'workspace';
   if(conflicting(observation.registries[other],source.root)&&!globalChangeApproved)throw Error('ATR-OTHER-SCOPE-CONFLICT');
   const retire=managed.length===1&&managed[0].content.sha256!==source.content.sha256;
   const install=scope==='global'&&(managed.length===0||retire);
   const globalWiring=hookPlans.some(p=>p.scope==='global'&&p.changes>0);
   if((retire||install||globalWiring||scope==='global')&&!globalChangeApproved)throw Error('ATR-GLOBAL-SCOPE');
   if(scope==='workspace'&&antigravityWorkspaceRelativePath(workspaceRoot,source.root)===null)throw Error('ATR-WORKSPACE-SOURCE-OUTSIDE');
   // Preserve the physically verified ownership/preimage before an authorized
   // CLI uninstall removes a root referenced by an existing registry entry.
   const registryPlans=(globalChangeApproved?[scope,other]:[scope]).map(selected=>({selected,registry:observation.registries[selected],...antigravityRegistryEntries(observation.registries[selected])})).filter(p=>p.selected===scope||p.pipeline.length>0||p.dangling.length>0).map(p=>({...p,change:registryChange(observation,p.selected,scope,workspaceRoot)}));
   let checkpoint=antigravityTopologySha256(observation);
   function recheck(){const fresh=observeAntigravityPluginTopology(args);if(antigravityTopologySha256(fresh)!==checkpoint)throw Error('ATR-TOPOLOGY-DRIFT');return fresh;}
   const registryDigests=Object.fromEntries(Object.entries(observation.registries).map(([key,r])=>[key,r.sha256]));
   const initialImport=read(join(configRoot,'config','import_manifest.json'));
   const foreignImports=initialImport.value?.imports?.filter(e=>e?.name!==NAME)??[];
   const foreignImportKeys=Object.fromEntries(Object.entries(initialImport.value??{}).filter(([key])=>key!=='imports'));
   // mutates=false marks a read-only CLI step (validate): its failure changed nothing, so the result stays "refused". A null label keeps a preflight out of `completed`.
   function cli(argv,label,mutates=true){recheck();if(mutates)changed=true;const r=invoke(Object.freeze([...argv]));if(r?.status!=='ok')throw Error('ATR-CLI-FAILED');if(label!==null)completed.push(label);observation=observeAntigravityPluginTopology(args);checkpoint=antigravityTopologySha256(observation);if(observation.source.content?.sha256!==source.content.sha256)throw Error('ATR-SOURCE-DRIFT');
    if(Object.entries(observation.registries).some(([key,r])=>r.sha256!==registryDigests[key]))throw Error('ATR-CLI-REGISTRY-DRIFT');
    const now=read(join(configRoot,'config','import_manifest.json'));
    if(antigravityTopologySha256(now.value?.imports?.filter(e=>e?.name!==NAME)??[])!==antigravityTopologySha256(foreignImports)||Object.entries(foreignImportKeys).some(([key,value])=>!Object.hasOwn(now.value??{},key)||antigravityTopologySha256(now.value[key])!==antigravityTopologySha256(value)))throw Error('ATR-CLI-FOREIGN-IMPORT-DRIFT');
   }
   // Validate before anything is retired: a source the CLI rejects must leave the existing managed copy untouched.
   if(retire&&install)cli(['plugin','validate',source.root],null,false);
   if(retire){cli(['plugin','uninstall',NAME],'uninstall');if(observation.managed.candidates.length||observation.importState.entries.length)throw Error('ATR-UNINSTALL-READBACK');}
   if(install){cli(['plugin','validate',source.root],'validate',false);cli(['plugin','install',source.root],'install');const copy=observation.managed.candidates[0];if(observation.managed.candidates.length!==1||observation.importState.entries.length!==1||copy.content.sha256!==source.content.sha256)throw Error('ATR-INSTALL-READBACK');}
   for(const hook of hookPlans)if(hook.changes){recheck();changed=true;write(hook.path,hook.nextBytes,hook.sha256);completed.push('wiring-rebind');observation=observeAntigravityPluginTopology(args);checkpoint=antigravityTopologySha256(observation);}
   // The owning CLI may create new hook metadata. Independently classify and
   // bind it after lifecycle; a stale/unknown new command cannot become success.
   const newWiring=wiring(observation,configRoot,workspaceRoot);
   for(const hook of newWiring)if(hook.changes){if(hook.scope==='global'&&!globalChangeApproved)throw Error('ATR-GLOBAL-SCOPE');recheck();changed=true;write(hook.path,hook.nextBytes,hook.sha256);completed.push('post-cli-wiring-rebind');observation=observeAntigravityPluginTopology(args);checkpoint=antigravityTopologySha256(observation);}
   for(const {selected,registry,change} of registryPlans){
    if(change!==null){recheck();const f=read(registry.path);const original=f.bytes??Buffer.from('{"entries":[]}\n');
     // A dangling managed entry (its directory is gone) is removed in the same owned rebind. Only the selected scope, or a registry already holding a Pipeline entry, gains the source root (the workspace registry: its repo-relative path); foreign and tracked relative entries are never touched.
     const appends=change.append!==null?[{path:['entries'],values:[{path:change.append}]}]:[];
     const next=rewriteAntigravityJsonBytes(original,{deletions:change.removed.map(i=>['entries',i]),...(appends.length?{appends}:{})});changed=true;write(registry.path,next,registry.sha256);completed.push(selected+'-registry-rebind');observation=observeAntigravityPluginTopology(args);checkpoint=antigravityTopologySha256(observation);}
   }
   const final=observeAntigravityPluginTopology(args);if(final.source.content?.sha256!==source.content.sha256||!registryBound(final,scope,scope,source))throw Error('ATR-FINAL-READBACK');
   if(registryPlans.some(({selected})=>!registryBound(final,selected,scope,source)))throw Error('ATR-FINAL-READBACK');
   if(wiring(final,configRoot,workspaceRoot).some(p=>p.changes>0))throw Error('ATR-FINAL-WIRING-READBACK');
   if(scope==='global'&&!final.managed.candidates[0])throw Error('ATR-FINAL-READBACK');
   if(final.managed.candidates.length){
    const copy=final.managed.candidates[0];if(copy.content.sha256!==source.content.sha256)throw Error('ATR-FINAL-READBACK');
    if(typeof writeInstalledReceipt!=='function')throw Error('ATR-ATTESTATION-UNAVAILABLE');
    const r=writeInstalledReceipt({provider:'antigravity',plugin:{name:'pipeline-core',version:source.version},sourcePluginRoot:source.root,installedPluginRoot:copy.root});if(r?.status!=='written')throw Error('ATR-ATTESTATION-FAILED');
   }
   return {schema:'pipeline.antigravity-refresh-result.v1',status:'refreshed',completed,changed,sourceContentSha256:source.content.sha256,finalTopologySha256:antigravityTopologySha256(final),requiresFreshExecutingSession:true};
  }catch(e){return {...refusal('pipeline.antigravity-refresh-result.v1',e,{completed,requiresFreshExecutingSession:true}),status:changed?'partial':'refused'};}
  finally{active=false;}
 }};return Object.freeze(host);
}
