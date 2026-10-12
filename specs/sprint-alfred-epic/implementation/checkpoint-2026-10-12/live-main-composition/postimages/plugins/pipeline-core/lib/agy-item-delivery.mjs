// SPDX-License-Identifier: SUL-1.0
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, lstatSync, openSync, closeSync, fstatSync, constants } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { inspectSignedDescriptorCustodyRepository } from './worktree-lifecycle.mjs';
import { inspectGovernedItemDeliveryChecks } from './native-goldfish-host-state.mjs';
import { scopesOverlap } from './slice-queue.mjs';

const held = new WeakMap();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const fault = code => { throw Object.assign(new Error(code), {code}); };
function git(root,args) {
  return execFileSync('git', ['-C',root,...args], {encoding:'utf8',shell:false,timeout:10000,maxBuffer:4*1024*1024,
    env:{...process.env,GIT_DIR:undefined,GIT_WORK_TREE:undefined,GIT_COMMON_DIR:undefined,GIT_INDEX_FILE:undefined}}).trim();
}
function gitBytes(root,args){return execFileSync('git',['-C',root,...args],{shell:false,timeout:10000,maxBuffer:4*1024*1024,
  env:{...process.env,GIT_DIR:undefined,GIT_WORK_TREE:undefined,GIT_COMMON_DIR:undefined,GIT_INDEX_FILE:undefined}});}
function filesAt(root, candidate, files) {
  return files.map(file => {
    const path=resolve(root,file.path),rel=relative(root,path),stat=lstatSync(path);
    if(rel==='..'||rel.startsWith(`..${sep}`)||stat.isSymbolicLink()||!stat.isFile()||stat.size>4*1024*1024||realpathSync(path)!==path)fault('AGY-ITEM-CHECK-PATH');
    const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));let bytes;
    try {const opened=fstatSync(fd);bytes=readFileSync(fd);const after=fstatSync(fd),current=lstatSync(path);
      for(const key of ['dev','ino','size','mtimeMs','ctimeMs'])if(opened[key]!==stat[key]||after[key]!==opened[key]||current[key]!==opened[key])fault('AGY-ITEM-CHECK-DEPENDENCY-DRIFT');
    }finally{closeSync(fd);}
    const committed=execFileSync('git',['-C',root,'show',`${candidate.commit}:${file.path}`],{shell:false,timeout:10000,maxBuffer:4*1024*1024,
      env:{...process.env,GIT_DIR:undefined,GIT_WORK_TREE:undefined,GIT_COMMON_DIR:undefined,GIT_INDEX_FILE:undefined}});
    if(!bytes.equals(committed)||digest(bytes)!==file.sha256||bytes.length!==file.size)fault('AGY-ITEM-CHECK-DEPENDENCY-DRIFT');
    return file;
  });
}
/** Only an actual common check observation can mint this local delivery handle.
 * It is evidence, never a Source member or a release capability. */
export function bindAgyItemDeliveryChecks({root,itemDelivery,candidate,checkHandle,baseCommit,writeScope,changedPaths}) {
  const evidence=inspectGovernedItemDeliveryChecks({root,itemDelivery,candidate,handle:checkHandle});
  if(evidence.verdict!=='passed')fault('AGY-ITEM-TARGETED-CHECKS-FAILED');
  if(!Array.isArray(changedPaths)||!changedPaths.length||changedPaths.some(path=>!writeScope.some(scope=>scopesOverlap([scope],[path]))))fault('AGY-ITEM-DELIVERY-SCOPE');
  git(root,['merge-base','--is-ancestor',baseCommit,candidate.commit]);
  const actual=git(root,['diff','--name-only','-z',baseCommit,candidate.commit]).split('\0').filter(Boolean).sort();
  if(!equal(actual,[...changedPaths].sort()))fault('AGY-ITEM-DELIVERY-PATHS');
  const paths=actual.map(path=>({path,sha256:digest(gitBytes(root,['show',`${candidate.commit}:${path}`]))}));
  const value={schema:'pipeline.agy-item-delivery.v1',itemId:itemDelivery.itemId,sliceId:itemDelivery.sliceId,baseCommit,candidate,evidence,paths};
  const handle=Object.freeze({});held.set(handle,{root:realpathSync(root),value});
  return {handle,value:structuredClone(value)};
}
/** Read Main itself, ancestry, committed dependency bytes and delivered blobs.
 * The Source journal owner must still perform the release under its boundary. */
export function inspectAgyItemMainIntegration({root,handle}) {
  const row=held.get(handle);if(!row||realpathSync(root)!==row.root)fault('AGY-ITEM-DELIVERY-HANDLE');
  return inspectAgyItemMainIntegrationValue({root,value:row.value});
}
/** Read-only proof builder for a value independently recovered from the Source
 * journal. It grants no reservation, terminal handle or release authority. */
export function inspectAgyItemMainIntegrationValue({root,value}) {
  if(value?.schema!=='pipeline.agy-item-delivery.v1'||value.evidence?.schema!=='pipeline.item-targeted-checks.v1'||value.evidence.verdict!=='passed'||!value.evidence.results?.length
    ||value.evidence.results.some(row=>row.status!==0||row.signal||row.error)||!value.paths?.length)fault('AGY-ITEM-DELIVERY-EVIDENCE');
  const repository=inspectSignedDescriptorCustodyRepository(root);
  git(root,['merge-base','--is-ancestor',value.baseCommit,value.candidate.commit]);
  const initial=git(root,['diff','--name-only','-z',value.baseCommit,value.candidate.commit]).split('\0').filter(Boolean).sort();
  if(!equal(initial,value.paths.map(file=>file.path).sort()))fault('AGY-ITEM-DELIVERY-PATHS');
  const branch=git(root,['symbolic-ref','--short','HEAD']);
  if(!['main','Main'].includes(branch))fault('AGY-ITEM-MAIN-REQUIRED');
  git(root,['merge-base','--is-ancestor',value.candidate.commit,repository.candidate.commit]);
  filesAt(root,repository.candidate,value.evidence.files);
  for(const file of value.paths) {
    const bytes=gitBytes(root,['show',`${repository.candidate.commit}:${file.path}`]);
    if(digest(bytes)!==file.sha256)fault('AGY-ITEM-DELIVERED-PATH-DRIFT');
  }
  if(!equal(repository,inspectSignedDescriptorCustodyRepository(root)))fault('AGY-ITEM-INTEGRATION-CAS');
  return {schema:'pipeline.agy-item-main-integration.v1',repository,delivery:structuredClone(value),mainCommit:repository.candidate.commit};
}
