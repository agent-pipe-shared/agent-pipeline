// SPDX-License-Identifier: SUL-1.0
import {spawnSync} from 'node:child_process';
import {lstatSync,readFileSync,realpathSync,statSync} from 'node:fs';
import {join,posix,resolve,sep} from 'node:path';
import {parseStrictJson} from '../../plugins/pipeline-core/lib/governance-event.mjs';
import {validateVerifyCaseCompletionPolicy} from '../../plugins/pipeline-core/lib/verify-case-completion-receipt.mjs';
import {validateDeclarativeVerifySuites} from './check-verify-suite-registration.mjs';

export const AUGMENTATION_SCHEMA='pipeline.verify-case-completion-augmentations.v1';
export const AUGMENTATION_PATH='harness/config/verify-case-completion-augmentations.v1.json';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const safeFile=v=>typeof v==='string'&&v.endsWith('.test.mjs')&&!/[\\\x00-\x20*?\[\]]/.test(v)&&!posix.isAbsolute(v)&&posix.normalize(v)===v&&!v.split('/').some(x=>!x||x==='.'||x==='..');
const failure=(code,error)=>({ok:false,code,error});

export function validateVerifyCaseCompletionAugmentations(data){
  if(!exact(data,['schema','augmentations'])||data.schema!==AUGMENTATION_SCHEMA||!Array.isArray(data.augmentations)||data.augmentations.length>2048)return failure('AUG-SCHEMA','closed schema and augmentations array required');
  const names=new Set();
  for(const [i,row]of data.augmentations.entries()){
    if(!exact(row,['name','file','caseCompletion'])||typeof row.name!=='string'||!row.name.trim()||/[\x00-\x1f]/.test(row.name)||!safeFile(row.file))return failure('AUG-ENTRY',`augmentation ${i} requires exact name, safe test file and policy`);
    if(names.has(row.name))return failure('AUG-DUPLICATE',`duplicate augmentation suite ID ${row.name}`);names.add(row.name);
    if(!validateVerifyCaseCompletionPolicy(row.caseCompletion))return failure('AUG-POLICY',`invalid policy for ${row.name}`);
  }
  return {ok:true};
}

export function applyVerifyCaseCompletionAugmentations(suites,data){
  const validation=validateVerifyCaseCompletionAugmentations(data);if(!validation.ok)return validation;
  const declared=validateDeclarativeVerifySuites({schema:'pipeline.verify-suites.v1',suites});if(!declared.ok)return failure('AUG-SUITES',declared.error);
  const additions=new Map();
  for(const row of data.augmentations){
    const matches=suites.filter(s=>s.name===row.name);
    if(matches.length!==1||matches[0].file!==row.file)return failure('AUG-TARGET',`augmentation ${row.name} must match one existing name and exact file`);
    if(Object.hasOwn(matches[0],'caseCompletion'))return failure('AUG-CONFLICT',`augmentation ${row.name} cannot shadow any existing policy`);
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
