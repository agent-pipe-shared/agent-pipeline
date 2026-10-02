// SPDX-License-Identifier: SUL-1.0
import {spawnSync} from 'node:child_process';
import {lstatSync,readFileSync,realpathSync,statSync} from 'node:fs';
import {join,posix,resolve,sep} from 'node:path';
import {parseStrictJson} from '../../plugins/pipeline-core/lib/governance-event.mjs';
import {validateVerifyCaseCompletionPolicy,verifyCaseCompletionPolicySha256} from '../../plugins/pipeline-core/lib/verify-case-completion-receipt.mjs';

export const AUGMENTATION_SCHEMA='pipeline.verify-case-completion-augmentations.v1';
export const AUGMENTATION_PATH='harness/config/verify-case-completion-augmentations.v1.json';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const safeFile=v=>typeof v==='string'&&v.endsWith('.test.mjs')&&!/[\\\x00-\x20*?\[\]]/.test(v)&&!posix.isAbsolute(v)&&posix.normalize(v)===v&&!v.split('/').some(x=>!x||x==='.'||x==='..');
const SHA256=/^[a-f0-9]{64}$/;
const failure=(code,error)=>({ok:false,code,error});
const policySha256=policy=>verifyCaseCompletionPolicySha256(policy);
const isStrictMonotoneExtension=(previous,next)=>{
  if(next.caseIds.length<=previous.caseIds.length||next.maxBytes<previous.maxBytes)return false;
  let nextIndex=0;
  for(const id of previous.caseIds){while(nextIndex<next.caseIds.length&&next.caseIds[nextIndex]!==id)nextIndex++;if(nextIndex===next.caseIds.length)return false;nextIndex++;}
  return true;
};

export function validateVerifyCaseCompletionAugmentations(data){
  if(!exact(data,['schema','augmentations'])||data.schema!==AUGMENTATION_SCHEMA||!Array.isArray(data.augmentations)||data.augmentations.length>2048)return failure('AUG-SCHEMA','closed schema and augmentations array required');
  const names=new Set();
  for(const [i,row]of data.augmentations.entries()){
    const bound=object(row)&&Object.hasOwn(row,'previousPolicySha256');
    const keys=bound?['name','file','caseCompletion','previousPolicySha256']:['name','file','caseCompletion'];
    if(!exact(row,keys)||typeof row.name!=='string'||!row.name.trim()||/[\x00-\x1f]/.test(row.name)||!safeFile(row.file))return failure('AUG-ENTRY',`augmentation ${i} requires exact name, safe test file and policy`);
    if(bound&&(typeof row.previousPolicySha256!=='string'||!SHA256.test(row.previousPolicySha256)))return failure('AUG-PREIMAGE',`augmentation ${row.name} requires an exact previous-policy SHA-256`);
    if(names.has(row.name))return failure('AUG-DUPLICATE',`duplicate augmentation suite ID ${row.name}`);names.add(row.name);
    if(!validateVerifyCaseCompletionPolicy(row.caseCompletion))return failure('AUG-POLICY',`invalid policy for ${row.name}`);
  }
  return {ok:true};
}

export function applyVerifyCaseCompletionAugmentations(suites,data){
  const validation=validateVerifyCaseCompletionAugmentations(data);if(!validation.ok)return validation;
  if(!Array.isArray(suites))return failure('AUG-SUITES','registration sources must be an array');
  for(const [i,suite]of suites.entries()){if(!object(suite)||typeof suite.name!=='string'||!suite.name.trim()||typeof suite.file!=='string'||!suite.file.endsWith('.mjs')||suite.file.indexOf(String.fromCharCode(92))>=0||suite.file.split('').some(c=>c.charCodeAt(0)<33||['*','?','[',']'].includes(c))||posix.isAbsolute(suite.file)||posix.normalize(suite.file)!==suite.file||suite.file.split('/').some(x=>!x||x==='.'||x==='..'))return failure('AUG-SUITES',`registration source ${i} requires a name and safe module file`);}
  const additions=new Map();
  for(const row of data.augmentations){
    const matches=suites.filter(s=>s.name===row.name);
    if(matches.length!==1||matches[0].file!==row.file)return failure('AUG-TARGET',`augmentation ${row.name} must match one existing name and exact file`);
    const previous=matches[0].caseCompletion;
    const hasPrevious=Object.hasOwn(matches[0],'caseCompletion');
    const hasBinding=Object.hasOwn(row,'previousPolicySha256');
    if(!hasPrevious){
      if(hasBinding)return failure('AUG-PREIMAGE',`augmentation ${row.name} binds a previous policy but the target has none`);
    }else{
      if(!hasBinding)return failure('AUG-CONFLICT',`augmentation ${row.name} cannot shadow any existing policy without a previous-policy binding`);
      if(!validateVerifyCaseCompletionPolicy(previous)||policySha256(previous)!==row.previousPolicySha256)return failure('AUG-PREIMAGE',`augmentation ${row.name} previous-policy digest does not match the exact target preimage`);
      if(!isStrictMonotoneExtension(previous,row.caseCompletion))return failure('AUG-NON-MONOTONE',`augmentation ${row.name} must strictly extend the previous ordered case-ID set and not reduce maxBytes`);
    }
    additions.set(row.name,row.caseCompletion);
  }
  return {ok:true,suites:suites.map(s=>additions.has(s.name)?{...s,caseCompletion:structuredClone(additions.get(s.name))}:s)};
}

function readOptional(rootDir,candidate){
  const root=resolve(rootDir);
  if(candidate!==null){
    if(typeof candidate!=='string'||! /^[a-f0-9]{40}$/.test(candidate))throw Error('candidate must be an exact commit OID');
    const git=args=>{const r=spawnSync('git',args,{cwd:root,shell:false,timeout:10000,maxBuffer:1048576});if(r.status!==0)throw Error('candidate Git read failed');return r.stdout;};
    if(git(['rev-parse','--verify',`${candidate}^{commit}`]).toString('utf8').trim()!==candidate)throw Error('candidate commit binding failed');
    const entry=git(['ls-tree','-z',candidate,'--',AUGMENTATION_PATH]).toString('utf8');if(entry==='')return null;
    const match=/^100(?:644|755) blob [a-f0-9]{40}\t([^\0]+)\0$/.exec(entry);
    if(!match||match[1]!==AUGMENTATION_PATH)throw Error('augmentation is not the exact regular candidate blob');
    return git(['show',`${candidate}:${AUGMENTATION_PATH}`]);
  }
  const path=join(root,AUGMENTATION_PATH);
  try{lstatSync(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  const physicalRoot=realpathSync(root),physical=realpathSync(path);
  if(!physical.startsWith(physicalRoot+sep)||!statSync(physical).isFile())throw Error('augmentation must be a physical regular file inside the repository');
  return readFileSync(physical);
}

export function loadAndApplyVerifyCaseCompletionAugmentations({rootDir,suites,candidate=null}={}){
  try{
    const bytes=readOptional(rootDir,candidate),data=bytes===null?{schema:AUGMENTATION_SCHEMA,augmentations:[]}:parseStrictJson(bytes);
    const result=applyVerifyCaseCompletionAugmentations(suites,data);
    return {...result,exists:bytes!==null};
  }catch(error){return failure('AUG-READ',error.message);}
}
