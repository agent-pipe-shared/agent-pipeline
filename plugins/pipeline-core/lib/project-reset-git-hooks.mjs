// SPDX-License-Identifier: SUL-1.0
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {validateAgainstSchema} from './schema-lite.mjs';
import {observeGitHookFootprint,physicalFootprintPath,footprintIdentity,footprintFail,readPhysicalFootprint,removeManagedGitHook,GIT_HOOK_NAMES} from './git-hook-footprint.mjs';
const shape=JSON.parse(readFileSync(new URL('../scripts/project-reset-plan.schema.json',import.meta.url))).properties.gitHooks;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function planResetGitHooks(root){
 const observed=observeGitHookFootprint({rootDir:root});
 if(observed.worktrees.length!==1||observed.worktrees[0]!==root||observed.commonDir!==join(root,'.git'))footprintFail('PROJECT-RESET-GIT-HOOKS-SHARED');
 if(observed.hooks.some(h=>h.status==='conflict'))footprintFail('PROJECT-RESET-GIT-HOOKS-CONFLICT');
 return observed;
}
export function applyResetGitHooks({root,journal,fault}){
 const bound=journal.gitHooks;
 // Historical journals retain their historical digest and cannot acquire
 // hook removal authority. Safe legacy recovery requires no executable or
 // hook mechanics remaining before private-state quarantine.
 if(bound===undefined){
  if(!journal.remove.some(entry=>entry.kind==='privateState')&&!journal.keep.some(entry=>entry.kind==='privateState'))return;
  const observed=observeGitHookFootprint({rootDir:root});
  if(observed.hooks.some(h=>h.status!=='absent'))footprintFail('PROJECT-RESET-GIT-HOOKS-LEGACY-UNBOUND');
  return;
 }
 if(!validateAgainstSchema(bound,shape).valid||bound.root!==root||bound.commonDir!==join(root,'.git')||!same(bound.worktrees,[root])||!same(bound.hooks.map(h=>h.name),GIT_HOOK_NAMES))footprintFail('PROJECT-RESET-GIT-HOOKS-BINDING');
 for(const entry of bound.hooks)for(const key of ['hook','marker','impl'])if(entry[key]!==null&&!validateAgainstSchema(entry[key],{...shape.properties.hooks.items.properties[key],type:'object'}).valid)footprintFail('PROJECT-RESET-GIT-HOOKS-BINDING');
 if(!same(footprintIdentity(physicalFootprintPath(root,{directory:true})),bound.rootIdentity)||!same(footprintIdentity(physicalFootprintPath(bound.commonDir,{directory:true})),bound.commonIdentity))footprintFail('PROJECT-RESET-GIT-HOOKS-IDENTITY');
 const observed=observeGitHookFootprint({rootDir:root});
 if(!same(observed.worktrees,bound.worktrees))footprintFail('PROJECT-RESET-GIT-HOOKS-SHARED');
 // Verify every residual object before the first deletion, including objects
 // whose original plan was absent. Resume accepts only exact bound subsets.
 for(let index=0;index<bound.hooks.length;index++){
  const entry=bound.hooks[index],now=observed.hooks[index];
  if(!['owned','owned-partial','absent'].includes(entry.status)||!same([entry.hookPath,entry.state,entry.markerPath,entry.implPath],[now.hookPath,now.state,now.markerPath,now.implPath]))footprintFail('PROJECT-RESET-GIT-HOOKS-BINDING');
  for(const key of ['hook','marker','impl'])if(now[key]&&!same(now[key],entry[key]))footprintFail('PROJECT-RESET-GIT-HOOKS-DRIFT');
  if(entry.status==='absent'&&(entry.hook||entry.marker||entry.impl))footprintFail('PROJECT-RESET-GIT-HOOKS-BINDING');
  if(entry.status!=='absent'&&(!entry.marker||!entry.impl))footprintFail('PROJECT-RESET-GIT-HOOKS-BINDING');
 }
 for(let index=0;index<bound.hooks.length;index++){
  const entry=bound.hooks[index];
  if(entry.status!=='absent')removeManagedGitHook({rootDir:root,name:entry.name,expectedEntry:entry,deps:{afterShim:()=>fault('git-hook-shim',index)}});
  fault('git-hook-remove',index);
 }
 for(const entry of bound.hooks)if(readPhysicalFootprint(entry.hookPath))footprintFail('PROJECT-RESET-GIT-HOOKS-DRIFT');
 fault('git-hooks-complete');
}
