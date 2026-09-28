import {validateAdvisoryReceipt} from './advisory-receipt.mjs';
import {validateAdvisoryRouteSelection} from './advisory-route-selection.mjs';
// Source-capable private metadata reader and physical source observer; no writer.
import {constants,lstatSync,fstatSync,openSync,closeSync,readSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {canonicalJson} from './codex-sandbox-compatibility.mjs';
import {parseStrictJson} from './governance-event.mjs';
import {hostDigest,hostFault,checkedHostDirectory,readHostJournal} from './codex-host-process-journal.mjs';
import {verifyRegisteredCodexOwnership} from './codex-readiness-ownership-verifier.mjs';
import {resolvePoGateRepositoryTopology,derivePoGateRepositoryFingerprint} from './po-gate-authority.mjs';
export const FINALIZED_READINESS_SCHEMA='pipeline.codex-readiness-finalization.v1';
export const FINALIZED_READINESS_FILENAME='readiness-finalization.json';
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.keys(v).sort().join('\0')===[...keys].sort().join('\0');
const same=(a,b)=>canonicalJson(a)===canonicalJson(b),names=['input','prd','spec','design','traceability'];
const failure=()=>{throw hostFault('host-readiness-finalization-invalid');};
function boundedBytes(path,max){
 let fd;try{const b=lstatSync(path,{bigint:true});if(!b.isFile()||b.isSymbolicLink()||b.nlink!==1n||b.size>BigInt(max))failure();
  fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);const o=fstatSync(fd,{bigint:true}),fields=['dev','ino','uid','mode','nlink','size','mtimeNs','ctimeNs'];
  if(!fields.every(k=>o[k]===b[k]))failure();const buf=Buffer.alloc(max+1);let n=0,c;
  while(n<buf.length&&(c=readSync(fd,buf,n,buf.length-n,null))>0)n+=c;if(n>max)failure();
  const a=lstatSync(path,{bigint:true}),f=fstatSync(fd,{bigint:true});if(BigInt(n)!==b.size||![a,f].every(s=>fields.every(k=>s[k]===b[k])))failure();
  return {bytes:buf.subarray(0,n),stat:b};
 }finally{if(fd!==undefined)closeSync(fd);}
}
export function readReadinessSourceObservation(context,binding){
 if(!exact(context,['repoRoot','candidate','sources'])||typeof context.repoRoot!=='string'||resolve(context.repoRoot)!==context.repoRoot||realpathSync(context.repoRoot)!==context.repoRoot
  ||!exact(context.candidate,['commit','tree'])||!exact(context.sources,names)||context.candidate.commit!==binding.candidateCommit)failure();
 const topology=resolvePoGateRepositoryTopology(context.repoRoot);
 if(derivePoGateRepositoryFingerprint({gitCommonDir:topology.gitCommonDir,primaryRoot:topology.primaryRoot})!==binding.repoFingerprint)failure();
 const git=args=>execFileSync('git',args,{cwd:context.repoRoot,maxBuffer:524288,timeout:10000,stdio:['ignore','pipe','pipe']});
 const candidate={commit:git(['rev-parse','HEAD']).toString('utf8').trim(),tree:git(['rev-parse','HEAD^{tree}']).toString('utf8').trim()};
 if(!same(candidate,context.candidate))failure();
 const observed=Object.fromEntries(names.map(name=>{
  const s=context.sources[name];if(!exact(s,['path','sha256'])||!sha(s.sha256)||typeof s.path!=='string'||s.path.length<1||s.path.length>240
   ||/[\\:\0]/.test(s.path)||s.path.split('/').some(p=>!p||p==='.'||p==='..'))failure();
  let path=context.repoRoot;for(const p of s.path.split('/')){path=join(path,p);if(lstatSync(path).isSymbolicLink()||realpathSync(path)!==path)failure();}
  const {bytes}=boundedBytes(path,262144);new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const digest=hostDigest(bytes);if(digest!==s.sha256||!git(['show',`${candidate.commit}:${s.path}`]).equals(bytes))failure();
  return [name,{path:s.path,sha256:digest}];
 }));
 if(new Set(names.map(n=>observed[n].path)).size!==5)failure();
 return {repoFingerprint:binding.repoFingerprint,candidate,sources:observed,sourceReadbackSha256:hostDigest(observed)};
}
export function validateReadinessOutputCustody(c){
 try{const stream=['bytes','retainedBytes','sha256','ended','closed','errored','utf8Verified','bounded'];
  if(!exact(c,['schema','stdioStatus','stdin','stdout','stderr','finalMessageFrameSha256','reportRawJsonSha256','reportRawJsonBytes','reportCanonicalSha256'])
   ||c.schema!=='pipeline.codex-host-output-custody.v1'||c.stdioStatus!=='complete'||!exact(c.stdin,['finished','closed','errored'])||c.stdin.finished!==true||c.stdin.closed!==true||c.stdin.errored!==false
   ||!exact(c.stdout,[...stream,'frameCount','framingComplete','parserVerified'])||!exact(c.stderr,stream))return false;
  for(const s of [c.stdout,c.stderr])if(!Number.isSafeInteger(s.bytes)||s.bytes<0||s.bytes>8388608||s.retainedBytes!==s.bytes||!sha(s.sha256)
   ||s.ended!==true||s.closed!==true||s.errored!==false||s.utf8Verified!==true||s.bounded!==true||s.bytes===0&&s.sha256!==hostDigest(Buffer.alloc(0)))return false;
  return c.stdout.bytes>0&&Number.isSafeInteger(c.stdout.frameCount)&&c.stdout.frameCount>0&&c.stdout.frameCount<=c.stdout.bytes&&c.stdout.framingComplete===true&&c.stdout.parserVerified===true
   &&['finalMessageFrameSha256','reportRawJsonSha256','reportCanonicalSha256'].every(k=>sha(c[k]))&&Number.isSafeInteger(c.reportRawJsonBytes)&&c.reportRawJsonBytes>0&&c.reportRawJsonBytes<=c.stdout.bytes;
 }catch{return false;}
}
export function validateReadinessFinalization(v){
 try{return exact(v,['schema','purpose','receiptId','runId','intentSha256','repoFingerprint','dispatchId','candidate','sources','executableSha256','requestSha256','responseSha256','dutyReceiptSha256','session','controls','terminal','inputDisposition','ownership','outputCustody'])
  &&v.schema===FINALIZED_READINESS_SCHEMA&&v.purpose==='design-readiness'&&/^drh_[a-f0-9]{32}$/.test(v.receiptId)
  &&['runId','intentSha256','repoFingerprint','executableSha256','requestSha256','responseSha256','dutyReceiptSha256'].every(k=>sha(v[k]))
  &&validateReadinessOutputCustody(v.outputCustody)&&v.responseSha256===v.outputCustody.reportCanonicalSha256&&v.dutyReceiptSha256===v.responseSha256
  &&exact(v.candidate,['commit','tree'])&&exact(v.sources,names)&&names.every(n=>exact(v.sources[n],['path','sha256'])&&sha(v.sources[n].sha256))
  &&exact(v.session,['threadId','turnId','freshThreadStarted','ephemeralRequested','modelObserved','providerObserved'])&&typeof v.session.threadId==='string'&&typeof v.session.turnId==='string'
  &&v.session.freshThreadStarted===true&&v.session.ephemeralRequested===true&&v.session.providerObserved==='openai'
  &&exact(v.controls,['configurationVerified','profileVerified','mcpVerified','profileIntentSha256','unexpectedToolItems','serverRequests','sourceReadbackSha256','sourceSecondReadbackSha256'])
  &&v.controls.configurationVerified===true&&v.controls.profileVerified===true&&v.controls.mcpVerified===true&&sha(v.controls.profileIntentSha256)
  &&v.controls.unexpectedToolItems===0&&v.controls.serverRequests===0&&v.controls.sourceReadbackSha256===hostDigest(v.sources)&&v.controls.sourceSecondReadbackSha256===v.controls.sourceReadbackSha256
  &&exact(v.terminal,['exitCode','signal','spawnError','turnStatus','stdioStatus'])&&v.terminal.exitCode===0&&v.terminal.signal===null&&v.terminal.spawnError===false&&v.terminal.turnStatus==='completed'&&v.terminal.stdioStatus===v.outputCustody.stdioStatus
  &&exact(v.inputDisposition,['contract','status','recheck','submissionCount','requestSha256','recipeSha256'])&&v.inputDisposition.contract==='readiness'&&v.inputDisposition.status==='acknowledged'&&v.inputDisposition.recheck==='not-required'
  &&v.inputDisposition.submissionCount===1&&v.inputDisposition.requestSha256===v.requestSha256&&v.inputDisposition.recipeSha256===null
  &&exact(v.ownership,['intentReceiptSha256','boundProcessReceiptSha256','terminalReceiptSha256','status'])&&v.ownership.status==='closed';
 }catch{return false;}
}
export function readFinalizedReadinessObservation(directory,expected){
 try{checkedHostDirectory(directory);const read=()=>{
  const {bytes,stat}=boundedBytes(join(directory,FINALIZED_READINESS_FILENAME),65536);if(stat.uid!==BigInt(process.getuid())||(stat.mode&0o077n)!==0n)failure();
  const value=parseStrictJson(bytes);if(!validateReadinessFinalization(value)||canonicalJson(value)!==bytes.toString('utf8'))failure();return {value,sha256:hostDigest(bytes)};};
  const first=read(),second=read();if(first.sha256!==second.sha256)return null;const v=first.value,intent=readHostJournal(directory,'intent');
  if(!intent||v.receiptId!==intent.value.receiptId||v.runId!==intent.value.runId||v.intentSha256!==intent.sha256||v.executableSha256!==intent.value.executable.sha256
   ||v.repoFingerprint!==expected.repoFingerprint||v.dispatchId!==expected.dispatchId||!same(v.candidate,expected.candidate)||!same(v.sources,expected.sources)
   ||v.requestSha256!==expected.requestSha256||v.executableSha256!==expected.executableSha256||v.responseSha256!==expected.responseSha256||v.dutyReceiptSha256!==expected.dutyReceiptSha256
   ||v.session.modelObserved!==expected.route.model)return null;
  const ownership=verifyRegisteredCodexOwnership(directory,{receiptId:v.receiptId,repoFingerprint:v.repoFingerprint,dispatchId:v.dispatchId,candidateCommit:v.candidate.commit,requestSha256:v.requestSha256,executableSha256:v.executableSha256});
  if(!ownership||!same(ownership,v.ownership))return null;return first;
 }catch{return null;}
}

const obsExact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.keys(v).sort().join('\0')===[...keys].sort().join('\0');
const obsSafe=p=>typeof p==='string'&&p.length>0&&p.length<=240&&!/[\\:\0]/.test(p)&&p.split('/').every(x=>x&&!x.startsWith('.')&&x!=='scratch'&&x!=='node_modules');
const obsSha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),obsFail=()=>{throw hostFault('readiness-advisor-observation-invalid');};
function obsRead(root,path){if(typeof root!=='string'||resolve(root)!==root||realpathSync(root)!==root||!obsSafe(path))obsFail();let target=root;for(const part of path.split('/')){target=join(target,part);if(lstatSync(target).isSymbolicLink()||realpathSync(target)!==target)obsFail();}let fd;try{const b=lstatSync(target,{bigint:true});if(!b.isFile()||b.nlink!==1n||b.size>65536n)obsFail();fd=openSync(target,constants.O_RDONLY|constants.O_NOFOLLOW);const fields=['dev','ino','uid','mode','nlink','size','mtimeNs','ctimeNs'],same=s=>fields.every(k=>s[k]===b[k]);if(!same(fstatSync(fd,{bigint:true})))obsFail();const buf=Buffer.alloc(65537);let n=0,c;while(n<buf.length&&(c=readSync(fd,buf,n,buf.length-n,null))>0)n+=c;if(n>65536||BigInt(n)!==b.size||![fstatSync(fd,{bigint:true}),lstatSync(target,{bigint:true})].every(same))obsFail();const bytes=buf.subarray(0,n);return {bytes,value:parseStrictJson(bytes),sha256:hostDigest(bytes)};}finally{if(fd!==undefined)closeSync(fd);}}
export function readCurrentReadinessAdvisorObservation({repoRoot,candidate,sources,receiptRef,routeRef,receiptPath=null,routePath=null}={}){
 if(!obsExact(candidate,['commit','tree'])||!obsExact(sources,['input','prd','spec','design','traceability'])||!obsExact(sources.design,['path','sha256'])||!obsSha(sources.design.sha256))obsFail();
 if(receiptRef===undefined&&routeRef===undefined){if(!obsSafe(receiptPath)||!obsSafe(routePath))obsFail();const first=obsRead(repoRoot,receiptPath),second=obsRead(repoRoot,routePath);receiptRef={path:receiptPath,sha256:first.sha256};routeRef={path:routePath,sha256:second.sha256};}
 if(!obsExact(receiptRef,['path','sha256'])||!obsExact(routeRef,['path','sha256'])||!obsSha(receiptRef.sha256)||!obsSha(routeRef.sha256)||receiptRef.path===routeRef.path)obsFail();
 const firstReceipt=obsRead(repoRoot,receiptRef.path),firstRoute=obsRead(repoRoot,routeRef.path),secondReceipt=obsRead(repoRoot,receiptRef.path),secondRoute=obsRead(repoRoot,routeRef.path);
 if(firstReceipt.sha256!==receiptRef.sha256||firstRoute.sha256!==routeRef.sha256||secondReceipt.sha256!==firstReceipt.sha256||secondRoute.sha256!==firstRoute.sha256||!validateAdvisoryReceipt(firstReceipt.value).ok||!validateAdvisoryRouteSelection({selection:firstRoute.value,receipt:firstReceipt.value,receiptBytes:firstReceipt.bytes}).ok||firstReceipt.value.questionSha256!==sources.design.sha256||firstReceipt.value.dispatch.candidateCommit!==candidate.commit||firstReceipt.value.dispatch.candidateTree!==candidate.tree||canonicalJson(firstRoute.value.candidate)!==canonicalJson(candidate))obsFail();
 return {schema:'pipeline.readiness-advisor-observation.v1',candidate:structuredClone(candidate),receiptRef:structuredClone(receiptRef),routeRef:structuredClone(routeRef),receipt:firstReceipt.value,route:firstRoute.value};
}
export function rereadCurrentReadinessAdvisorObservation(repoRoot,observation,sources){if(!obsExact(observation,['schema','candidate','receiptRef','routeRef','receipt','route'])||observation.schema!=='pipeline.readiness-advisor-observation.v1')obsFail();const current=readCurrentReadinessAdvisorObservation({repoRoot,candidate:observation.candidate,sources,receiptRef:observation.receiptRef,routeRef:observation.routeRef});if(canonicalJson(current)!==canonicalJson(observation))obsFail();return current;}
