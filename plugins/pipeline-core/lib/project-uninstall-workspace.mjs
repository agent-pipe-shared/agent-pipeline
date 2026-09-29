// SPDX-License-Identifier: SUL-1.0
// Physically verified workspace ownership; unrelated JSON spans stay exact.
import {basename,dirname,isAbsolute,join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {readPhysicalFootprint,physicalFootprintPath,footprintSha256,footprintIdentity,footprintFail} from './git-hook-footprint.mjs';
import {parseStrictJson} from './governance-event.mjs';
import {rewriteAntigravityJsonBytes} from './antigravity-json-spans.mjs';
import {observeAntigravityWorkspaceBindings} from './antigravity-topology-refresh-host.mjs';
const parsed=value=>{const m=typeof value==='string'?/^node (?:"([^"\r\n$`]+)"|'([^'\r\n$`]+)'|([^\s"';&|<>$`]+))(?: (observe|deliver))?$/.exec(value):null;return m?{path:m[1]??m[2]??m[3],arg:m[4]??''}:null;};
const shaped=value=>typeof value==='string'&&/agent-pipeline|pipeline-core|antigravity-(?:pretool|start|stop|slicing)/.test(value);
export const uninstallWorkspacePath=entry=>['.agents/plugins.json','.agents/hooks.json','.agents/external-hooks.json'].includes(entry.path);
export function deriveUninstallWorkspaceFootprint({rootDir,workspace}){
 const observations=[],actions=[],conflicts=[],roots=[];
 function record(path,row,after){observations.push({path,sha256:row.sha256,identity:row.identity});if(after&&!after.equals(row.bytes))actions.push({path,kind:'owned-keys',beforeSha256:row.sha256,beforeIdentity:row.identity,afterBytes:after.toString('utf8'),afterSha256:footprintSha256(after),mode:row.mode});}
 if(workspace.status==='observed'){
  const path='.agents/plugins.json',row=readPhysicalFootprint(join(rootDir,path),{max:262144}),value=parseStrictJson(row.bytes);
  roots.push(...workspace.ownedIndexes.map(i=>value.entries[i].path));
  // The publisher owns only the original {path} registration element. A
  // matching manifest does not authorize deleting user-added entry fields.
  const modified=workspace.ownedIndexes.some(i=>Object.keys(value.entries[i]).length!==1||!Object.hasOwn(value.entries[i],'path'));
  if(modified){record(path,row,null);conflicts.push({path,code:'PU-WORKSPACE-WIRING-OWNERSHIP'});}
  else record(path,row,rewriteAntigravityJsonBytes(row.bytes,{deletions:workspace.ownedIndexes.map(i=>['entries',i])}));
 }
 for(const path of ['.agents/hooks.json','.agents/external-hooks.json']){
  const row=readPhysicalFootprint(join(rootDir,path),{max:262144});if(!row)continue;
  try {
   const value=parseStrictJson(row.bytes),deletions=[];let visits=0;
   function visit(v,location=[],array=false){
    if(++visits>4096||location.length>64)throw Error('PU-WORKSPACE-WIRING-BOUND');
    if(Array.isArray(v)){v.forEach((entry,i)=>visit(entry,[...location,i],true));return;}
    if(!v||typeof v!=='object')return;
    if(Object.hasOwn(v,'command')){
     const c=parsed(v.command);let owned=false,pipeline=false;
     if(c&&isAbsolute(c.path)&&basename(dirname(c.path))==='hooks'){
      const root=dirname(dirname(c.path));
      try {
       physicalFootprintPath(root,{directory:true});
       const manifest=readPhysicalFootprint(join(root,'plugin.json'),{max:262144});
       if(manifest&&parseStrictJson(manifest.bytes).name==='agent-pipeline-core'){
        pipeline=true;const templates=readPhysicalFootprint(join(root,'hooks.json'),{max:262144});if(!templates)throw Error('PU-WORKSPACE-WIRING-OWNERSHIP');
        let count=0;
        // A command proves its executable's origin, not ownership of added or
        // changed fields in the containing entry. Only the original template
        // shape and values may authorize deleting that whole array element.
        const entry=v;
        function template(v,depth=0){if(++count>4096||depth>64)throw Error('PU-WORKSPACE-WIRING-BOUND');if(!v||typeof v!=='object')return;const t=parsed(v.command);if(t&&t.path==='hooks/'+basename(c.path)&&t.arg===c.arg&&isDeepStrictEqual({...entry,command:v.command},{...v}))owned=true;for(const child of Object.values(v))template(child,depth+1);}
        template(parseStrictJson(templates.bytes));if(!owned||!readPhysicalFootprint(c.path,{max:262144}))throw Error('PU-WORKSPACE-WIRING-OWNERSHIP');
       }
      }catch {if(pipeline||shaped(v.command)||roots.some(root=>v.command.includes(root)))throw Error('PU-WORKSPACE-WIRING-OWNERSHIP');}
     }
     if(owned){if(!array)throw Error('PU-WORKSPACE-WIRING-OWNERSHIP');deletions.push(location);return;}
     if(shaped(v.command)||typeof v.command==='string'&&roots.some(root=>v.command.includes(root)))throw Error('PU-WORKSPACE-WIRING-OWNERSHIP');
     return;
    }
    for(const [key,child] of Object.entries(v))visit(child,[...location,key]);
   }
   visit(value);record(path,row,rewriteAntigravityJsonBytes(row.bytes,{deletions}));
  }catch {observations.push({path,sha256:row.sha256,identity:row.identity});conflicts.push({path,code:'PU-WORKSPACE-WIRING-OWNERSHIP'});}
 }
 return {observations,actions,conflicts};
}
export function requireUninstallPostconditions(journal,{rootDir,scope,stages=journal.completed}){
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 for(const stage of ['keys','workspace'])if(stages.includes(stage)){
  for(const [index,entry] of journal.actions.entries()){
   if(uninstallWorkspacePath(entry)!==(stage==='workspace'))continue;
   const current=readPhysicalFootprint(join(rootDir,entry.path));
   if(entry.kind==='retained-metadata'){
    const retained=readPhysicalFootprint(join(journal.controls,'retained','metadata-'+index));
    if(current||retained?.sha256!==entry.beforeSha256||!same(retained.identity,entry.beforeIdentity))footprintFail('PU-METADATA-DRIFT');
   }else if(current?.sha256!==entry.afterSha256)footprintFail(stage==='workspace'?'PU-WORKSPACE-DRIFT':'PU-KEY-DRIFT');
  }
  for(const entry of journal.plan.footprint.observations){if(uninstallWorkspacePath(entry)!==(stage==='workspace')||journal.actions.some(a=>a.path===entry.path))continue;if(readPhysicalFootprint(join(rootDir,entry.path))?.sha256!==entry.sha256)footprintFail(stage==='workspace'?'PU-WORKSPACE-DRIFT':'PU-KEY-DRIFT');}
  if(stage==='workspace'){
   const current=observeAntigravityWorkspaceBindings({workspaceRoot:rootDir});if(current.status==='unavailable'||current.ownedIndexes.length)footprintFail('PU-WORKSPACE-DRIFT');
   const wiring=deriveUninstallWorkspaceFootprint({rootDir,workspace:current});if(wiring.conflicts.length||wiring.actions.length)footprintFail('PU-WORKSPACE-DRIFT');
  }
 }
 if(stages.includes('decline')&&scope.observe({rootDir}).state!=='declined')footprintFail('PU-DECLINE-READBACK');
 if(stages.includes('private'))for(const [index,archive] of journal.plan.privateArchives.entries()){
  const dest=physicalFootprintPath(join(journal.controls,'retained','private-'+index),{missing:true,directory:true});
  if(physicalFootprintPath(archive.path,{missing:true,directory:true})||!dest||!same(footprintIdentity(dest),archive.identity))footprintFail('PU-PRIVATE-DRIFT');
 }
}
