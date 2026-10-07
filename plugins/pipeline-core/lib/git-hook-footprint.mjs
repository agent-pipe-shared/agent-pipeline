// SPDX-License-Identifier: SUL-1.0
// Source target: plugins/pipeline-core/lib/git-hook-footprint.mjs
import {createHash} from 'node:crypto';
import {constants,closeSync,fstatSync,lstatSync,openSync,readSync,fsyncSync,realpathSync,unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,join,parse,resolve,sep} from 'node:path';
import {discoverRepository} from './worktree-lifecycle.mjs';
import {fsyncDirectoryDurable} from './fs-durability.mjs';
export const GIT_HOOK_NAMES=Object.freeze(['pre-commit','commit-msg','pre-push']);
export const footprintSha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function footprintFail(code){throw Object.assign(new Error(code),{code});}
// `within` names an ancestor directory the CALLER has already vetted with a full (rootless-prefix) call in the same
// operation and re-vets after it. Below it every component is still lstat'ed (symlink/junction/non-directory parent
// refused); only the repeated ancestor walk and the realpath round trip for the already-vetted prefix are skipped.
export function physicalFootprintPath(path,{missing=false,directory=false,within=null}={}){path=resolve(path);let part=parse(path).root,rest=path.slice(part.length),trusted=false,last=null;if(within){const base=resolve(within);if(path===base||path.startsWith(base.endsWith(sep)?base:base+sep)){part=base;rest=path.slice(base.length);trusted=true;}}for(const item of rest.split(sep).filter(Boolean)){part=join(part,item);let st;try{st=lstatSync(part);}catch(e){if(missing&&e.code==='ENOENT')return null;throw e;}if(st.isSymbolicLink())footprintFail('PU-ALIAS');if(part!==path&&!st.isDirectory())footprintFail('PU-PARENT');last=st;}const st=trusted&&last?last:lstatSync(path);if(directory&&!st.isDirectory())footprintFail('PU-DIRECTORY');if(!trusted&&realpathSync(path)!==path)footprintFail('PU-IDENTITY');return st;}
export const footprintFingerprint=st=>[st.dev,st.ino,st.size,st.mtimeMs,st.ctimeMs].join(':');
export const footprintIdentity=st=>({dev:String(st.dev),ino:String(st.ino)});
export function readPhysicalFootprint(path,{max=1048576,budget={used:0,max:33554432},within=null}={}){const pre=physicalFootprintPath(path,{missing:true,within});if(!pre)return null;if(!pre.isFile()||pre.nlink!==1)footprintFail('PU-FILE');if(pre.size>max||budget.used+pre.size>budget.max)footprintFail('PU-SIZE');const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const before=fstatSync(fd);if(before.ino!==pre.ino||before.dev!==pre.dev||before.nlink!==1||!before.isFile()||before.size>max)footprintFail('PU-FD');const capacity=Math.min(max,budget.max-budget.used),buffer=Buffer.alloc(/* the fstat length plus one sentinel byte: growth past it is still detected, and no max-size buffer is touched per file */Math.min(capacity,before.size)+1);let count=0;while(count<buffer.length){const n=readSync(fd,buffer,count,buffer.length-count,null);if(n===0)break;count+=n;}budget.used+=count;if(count>capacity)footprintFail('PU-SIZE');const after=fstatSync(fd),now=physicalFootprintPath(path,{within});if(after.ino!==now.ino||after.dev!==now.dev||after.size!==count||now.size!==count||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||now.mtimeMs!==after.mtimeMs||now.ctimeMs!==after.ctimeMs||now.nlink!==1)footprintFail('PU-DRIFT');const bytes=Buffer.from(buffer.subarray(0,count));return {path:resolve(path),bytes,sha256:footprintSha256(bytes),identity:footprintIdentity(after),fingerprint:footprintFingerprint(after),mode:after.mode&0o777};}finally{closeSync(fd);}}
export function observeGitHookFootprint({rootDir}={}){
 const root=resolve(rootDir);physicalFootprintPath(root,{directory:true});const repo=discoverRepository(root),rootRow=repo.worktrees.find(r=>resolve(r.path)===root);if(!rootRow)footprintFail('PU-WORKTREE');const common=resolve(repo.commonDir);physicalFootprintPath(common,{directory:true});const budget={used:0,max:33554432},hooks=[];
 for(const name of GIT_HOOK_NAMES){const hookPath=execFileSync('git',['rev-parse','--path-format=absolute','--git-path','hooks/'+name],{cwd:root,encoding:'utf8',timeout:5000}).trim(),expected=join(common,'hooks',name);if(resolve(hookPath)!==expected)footprintFail('PU-HOOKS-PATH');physicalFootprintPath(dirname(hookPath),{missing:true,directory:true});const state=join(common,'agent-pipeline',name+'-hook'),markerPath=join(state,'install-marker.json'),implPath=join(state,'impl.mjs'),hook=readPhysicalFootprint(hookPath,{budget}),marker=readPhysicalFootprint(markerPath,{budget}),impl=readPhysicalFootprint(implPath,{budget});let record=null;try{record=marker?JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(marker.bytes)):null;}catch{}
  const markerValid=marker&&impl&&record?.schema==='pipeline.'+name+'-hook-install.v1'&&record.hookPath===hookPath&&record.implPath===implPath&&typeof record.hookSha256==='string'&&/^[a-f0-9]{64}$/.test(record.hookSha256)&&record.implSha256===impl.sha256;
  const verified=hook&&markerValid&&record.hookSha256===hook.sha256;
  hooks.push({name,hookPath,state,markerPath,implPath,status:verified?'owned':!hook&&markerValid?'owned-partial':!hook&&!marker&&!impl?'absent':'conflict',hook:hook?{sha256:hook.sha256,identity:hook.identity,mode:hook.mode}:null,marker:marker?{sha256:marker.sha256,identity:marker.identity}:null,impl:impl?{sha256:impl.sha256,identity:impl.identity}:null});
 }
 return {schema:'pipeline.git-hook-footprint.v1',root,rootIdentity:footprintIdentity(physicalFootprintPath(root,{directory:true})),commonDir:common,commonIdentity:footprintIdentity(physicalFootprintPath(common,{directory:true})),worktrees:repo.worktrees.map(r=>resolve(r.path)).sort(),hooks};
}
export function planManagedGitHookRemoval({rootDir,name}={}){if(!GIT_HOOK_NAMES.includes(name))footprintFail('PU-HOOK-NAME');const all=observeGitHookFootprint({rootDir}),entry=all.hooks.find(h=>h.name===name);return {status:['owned','owned-partial'].includes(entry.status)?'ready':entry.status==='absent'?'nothing-to-remove':'refused-modified-hook',root:all.root,rootIdentity:all.rootIdentity,commonIdentity:all.commonIdentity,entry};}
export function removeManagedGitHook({rootDir,name,deps={},expectedEntry}={}){
 if(expectedEntry){
  if(expectedEntry.name!==name||!GIT_HOOK_NAMES.includes(name))footprintFail("PU-HOOK-NAME");
  const observed=observeGitHookFootprint({rootDir}),actual=observed.hooks.find(row=>row.name===name);
  if(observed.worktrees.length!==1||observed.worktrees[0]!==resolve(rootDir)||observed.commonDir!==join(resolve(rootDir),".git"))footprintFail("PU-HOOK-SHARED");
  if(["hookPath","state","markerPath","implPath"].some(key=>actual[key]!==expectedEntry[key]))footprintFail("PU-HOOK-PATH");
  const rows=[[expectedEntry.hookPath,"hook"],[expectedEntry.implPath,"impl"],[expectedEntry.markerPath,"marker"]];
  // Durable caller binding authorizes only the original physical objects.
  for(const [path,key] of rows){const row=readPhysicalFootprint(path),bound=expectedEntry[key];if(row&&(!bound||row.sha256!==bound.sha256||JSON.stringify(row.identity)!==JSON.stringify(bound.identity)||(key==="hook"&&row.mode!==bound.mode)))footprintFail("PU-HOOK-DRIFT");}
  for(const [path,key] of rows){const row=readPhysicalFootprint(path),bound=expectedEntry[key];if(row){if(!bound||row.sha256!==bound.sha256||JSON.stringify(row.identity)!==JSON.stringify(bound.identity))footprintFail("PU-HOOK-DRIFT");unlinkSync(path);fsyncDirectoryDurable(dirname(path));}if(key==="hook")deps.afterShim?.();}
  return {status:"removed",hookPath:expectedEntry.hookPath};
 }
 const plan=planManagedGitHookRemoval({rootDir,name});if(plan.status!=='ready')return plan;
 const current=planManagedGitHookRemoval({rootDir,name});if(JSON.stringify(current)!==JSON.stringify(plan))footprintFail('PU-HOOK-DRIFT');
 // The executable binding is retired first. Partial removal is recoverable
 // from the still physical marker+implementation pair, without a new gate.
 if(plan.entry.hook)unlinkSync(plan.entry.hookPath);
 if(deps.crashAfterShimRemoval===true)throw Object.assign(new Error('PU-SIMULATED-AFTER-SHIM'),{code:'PU-SIMULATED-AFTER-SHIM'});
 for(const [path,key] of [[plan.entry.implPath,'impl'],[plan.entry.markerPath,'marker']]){const now=readPhysicalFootprint(path);if(!now||now.sha256!==plan.entry[key].sha256||JSON.stringify(now.identity)!==JSON.stringify(plan.entry[key].identity))footprintFail('PU-HOOK-DRIFT');unlinkSync(path);}
 return {status:'removed',hookPath:plan.entry.hookPath};
}
