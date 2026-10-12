// SPDX-License-Identifier: SUL-1.0
/** Actual bounded Git/source observations. Never accepts caller-supplied ancestry booleans. */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync,constants,fstatSync,lstatSync,openSync,readSync,realpathSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {TextDecoder} from 'node:util';
import {SOURCE_NAMES,validateInitialAdvisorContext,validateInitialToFinalBinding,designAdvisorValueSha256} from './design-advisor-course.mjs';
const OID=/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u,sha=x=>createHash('sha256').update(x).digest('hex');
const decode=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const fail=code=>({ok:false,code});
function safePath(p){return typeof p==='string'&&/^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/u.test(p)&&p.split('/').every(s=>s!==''&&!s.startsWith('.')&&!['scratch','node_modules'].includes(s));}
function identity(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.mode===b.mode&&a.nlink===b.nlink&&a.size===b.size&&a.mtimeNs===b.mtimeNs;}
// FLAP3: a sibling create/delete in an ancestor directory (e.g. another agent's evidence/dispatch-record-*.json)
// changes that ancestor's mtime/size/nlink between the walk and the re-check. That is the one confirmed
// benign cause of DAP-PHYSICAL-PARENT-DRIFT, so only it is re-observed: a fresh full walk, 3 attempts,
// 50 then 100 ms. Every other error, and exhaustion, re-throws unchanged (fail-closed).
const PARENT_DRIFT_RETRY_DELAYS_MS=Object.freeze([50,100]);
function sleepSync(ms){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);}
export function reobserveAdvisorPhysicalDrift(read,{delaysMs=PARENT_DRIFT_RETRY_DELAYS_MS,sleep=sleepSync}={}){
 for(let attempt=0;;attempt++){
  try{return read();}
  catch(error){if(error?.message!=='DAP-PHYSICAL-PARENT-DRIFT'||attempt>=delaysMs.length)throw error;sleep(delaysMs[attempt]);}
 }
}
export function readAdvisorPhysicalBytes(repoRoot,path,maxBytes=262144){return reobserveAdvisorPhysicalDrift(()=>readAdvisorPhysicalBytesOnce(repoRoot,path,maxBytes));}
function readAdvisorPhysicalBytesOnce(repoRoot,path,maxBytes){
 if(!safePath(path)||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>1048576)throw Error('DAP-PHYSICAL-INPUT');
 const root=resolve(repoRoot),parents=[];let cursor=root,fd;
 try{
  for(const p of [root,...path.split('/').slice(0,-1)]){cursor=p===root?root:join(cursor,p);const st=lstatSync(cursor,{bigint:true});if(!st.isDirectory()||st.isSymbolicLink()||realpathSync(cursor)!==cursor)throw Error('DAP-PHYSICAL-PARENT');parents.push({path:cursor,st});}
  const target=join(root,...path.split('/'));if(!target.startsWith(root+sep))throw Error('DAP-PHYSICAL-ESCAPE');
  const before=lstatSync(target,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>BigInt(maxBytes)||realpathSync(target)!==target)throw Error('DAP-PHYSICAL-FILE');
  fd=openSync(target,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const opened=fstatSync(fd,{bigint:true});if(!identity(before,opened))throw Error('DAP-PHYSICAL-OPEN');
  const buffer=Buffer.alloc(maxBytes+1);let offset=0;while(offset<buffer.length){const n=readSync(fd,buffer,offset,buffer.length-offset,null);if(n===0)break;offset+=n;}if(offset>maxBytes)throw Error('DAP-PHYSICAL-BOUND');
  const after=fstatSync(fd,{bigint:true}),pathAfter=lstatSync(target,{bigint:true});if(!identity(opened,after)||!identity(after,pathAfter)||BigInt(offset)!==after.size||realpathSync(target)!==target)throw Error('DAP-PHYSICAL-DRIFT');
  for(const parent of parents){const now=lstatSync(parent.path,{bigint:true});if(!identity(parent.st,now)||!now.isDirectory()||now.isSymbolicLink()||realpathSync(parent.path)!==parent.path)throw Error('DAP-PHYSICAL-PARENT-DRIFT');}
  const bytes=Buffer.from(buffer.subarray(0,offset));if(!Buffer.from(decode.decode(bytes),'utf8').equals(bytes))throw Error('DAP-UTF8');return bytes;
 }finally{if(fd!==undefined)closeSync(fd);}
}
function git(repoRoot,args,maxBuffer=1048577){return execFileSync('git',['-C',resolve(repoRoot),...args],{encoding:null,maxBuffer,timeout:10000,stdio:['ignore','pipe','pipe']});}
export function observeAdvisorCandidate(repoRoot){return {commit:git(repoRoot,['rev-parse','HEAD'],256).toString('ascii').trim(),tree:git(repoRoot,['rev-parse','HEAD^{tree}'],256).toString('ascii').trim()};}
function candidateSources(repoRoot,candidate,sources){
 if(!OID.test(candidate?.commit??'')||!OID.test(candidate?.tree??''))throw Error('DAP-CANDIDATE');
 if(git(repoRoot,['rev-parse',`${candidate.commit}^{tree}`],256).toString('ascii').trim()!==candidate.tree)throw Error('DAP-TREE');
 const sourceBytes={},blobs={};let total=0;
 for(const name of SOURCE_NAMES){const ref=sources[name];if(!safePath(ref?.path))throw Error('DAP-SOURCE-PATH');const object=`${candidate.commit}:${ref.path}`;
  const oid=git(repoRoot,['rev-parse',object],256).toString('ascii').trim();if(!OID.test(oid))throw Error('DAP-BLOB-OID');
  if(git(repoRoot,['cat-file','-t',oid],32).toString('ascii').trim()!=='blob')throw Error('DAP-BLOB-TYPE');
  const sizeText=git(repoRoot,['cat-file','-s',oid],32).toString('ascii').trim();if(!/^(?:0|[1-9][0-9]*)$/u.test(sizeText))throw Error('DAP-BLOB-SIZE');const size=Number(sizeText);
  if(!Number.isSafeInteger(size)||size>262144||total+size>1048576)throw Error('DAP-BLOB-BOUND');
  const bytes=git(repoRoot,['cat-file','blob',oid],size+1);if(bytes.length!==size||sha(bytes)!==ref.sha256||!Buffer.from(decode.decode(bytes),'utf8').equals(bytes))throw Error('DAP-BLOB-DIGEST');
  total+=size;sourceBytes[name]=bytes;blobs[name]={path:ref.path,oid,sha256:sha(bytes),bytes:size};
 }
 return {sourceBytes,blobs};
}
export function observeInitialAdvisorSources({repoRoot,candidate,sourcePaths}={}){
 try{const refs={},sourceBytes={};let total=0;for(const n of SOURCE_NAMES){const bytes=readAdvisorPhysicalBytes(repoRoot,sourcePaths[n]);if(total+bytes.length>1048576)return fail('DAP-SOURCE-TOTAL');total+=bytes.length;refs[n]={path:sourcePaths[n],sha256:sha(bytes)};sourceBytes[n]=bytes;}
  const committed=candidateSources(repoRoot,candidate,refs);for(const n of SOURCE_NAMES)if(!sourceBytes[n].equals(committed.sourceBytes[n]))return fail('DAP-WORKTREE-DRIFT');
  return {ok:true,sources:refs,sourceBytes,blobs:committed.blobs};
 }catch(e){return fail(typeof e.message==='string'&&e.message.startsWith('DAP-')?e.message:'DAP-GIT-SOURCE');}
}
export function verifyAdvisorRevisionProvenance({repoRoot,initial,courseId,consultation,disposition,revisions,final,finalSourceBytes}={}){
 const check=validateInitialToFinalBinding({initial,courseId,consultation,disposition,revisions,final});if(!check.ok)return check;
 try{
  const start=candidateSources(repoRoot,initial.initialCandidate,initial.sources);const checked=validateInitialAdvisorContext(initial,{sourceBytes:start.sourceBytes});if(!checked.ok)return checked;
  const observations=[{candidate:initial.initialCandidate,blobs:start.blobs}];
  for(const revision of revisions){const parents=git(repoRoot,['rev-list','--parents','-n','1',revision.candidate.commit],4096).toString('ascii').trim().split(' ');if(parents[0]!==revision.candidate.commit||!parents.slice(1).includes(revision.parentCommit))return fail('DAP-GIT-PARENT');const observed=candidateSources(repoRoot,revision.candidate,revision.sources);observations.push({candidate:revision.candidate,parents:parents.slice(1),blobs:observed.blobs});}
  const end=candidateSources(repoRoot,final.candidate,final.sources);let total=0;
  for(const n of SOURCE_NAMES){const physical=readAdvisorPhysicalBytes(repoRoot,final.sources[n].path);if((total+=physical.length)>1048576)return fail('DAP-FINAL-TOTAL');if(!physical.equals(end.sourceBytes[n])||!Buffer.isBuffer(finalSourceBytes?.[n])||!physical.equals(finalSourceBytes[n]))return fail('DAP-FINAL-PHYSICAL');}
  return {ok:true,code:'DAP-COMMITTED-REVISION-CHAIN',initialContextSha256:checked.contextSha256,revisionChainSha256:designAdvisorValueSha256(revisions),observations,initialSourceBytes:start.sourceBytes,physicalProvenanceVerified:true,implementationAuthority:false};
 }catch(e){return fail(typeof e.message==='string'&&e.message.startsWith('DAP-')?e.message:'DAP-GIT-PROVENANCE');}
}
