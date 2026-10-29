// SPDX-License-Identifier: SUL-1.0
// Source-owned native physical observations. This module issues no authority brand.
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {lstatSync,openSync,readFileSync,fstatSync,closeSync,constants,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {isAbsolute,resolve} from 'node:path';
import {WINDOWS_POWERSHELL_PATHS,sanitizeChildEnvironment} from './windows-private-state.mjs';
import {isSuccessfulSpawn} from './successful-spawn.mjs';

const HELPER_SHA256='e53c759fe421781ca45802cf5d96c4a0c2709c8d0490c58972a14b8f68171679';
const helperPath=fileURLToPath(new URL('./windows-owned-authority-native.ps1',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const factsPattern=/^[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-9]+:(?:directory|[0-9]+:[0-9]+):[0-9]+:[0-9]+:(?:directory|[0-9]+:[0-9]+):[a-f0-9]{64}$/u;
function fail(reason,committed=false){const detail=/^WIN-AUTH-DACL-(?:EMPTY|UNPROTECTED|ACE|FOREIGN)$/u.test(reason)?reason:undefined;const error=new Error(reason);error.name='SessionAuthorityError';error.code='SDC-AUTHORITY-UNAVAILABLE';error.reason=detail?'WIN-AUTH-DACL':reason;if(detail)error.detail=detail;error.committed=committed;throw error;}
function path(value){if(typeof value!=='string'||!isAbsolute(value)||resolve(value)!==value||value.length>32768||/[\u0000-\u001f]/u.test(value)||value.startsWith('\\\\')||value.slice(2).includes(':'))fail('WIN-AUTH-PATH');return value;}
function source(){let fd;try{const before=lstatSync(helperPath);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>32768||realpathSync(helperPath)!==helperPath)fail('WIN-AUTH-HELPER-CUSTODY');fd=openSync(helperPath,constants.O_RDONLY|constants.O_NOFOLLOW);const opened=fstatSync(fd),bytes=readFileSync(fd),after=fstatSync(fd),final=lstatSync(helperPath);for(const stat of [opened,after,final])if(stat.dev!==before.dev||stat.ino!==before.ino||stat.nlink!==1||stat.size!==before.size||stat.mtimeMs!==before.mtimeMs||stat.ctimeMs!==before.ctimeMs)fail('WIN-AUTH-HELPER-CAS');if(digest(bytes)!==HELPER_SHA256)fail('WIN-AUTH-HELPER-CAS');return bytes.toString('utf8');}finally{if(fd!==undefined)closeSync(fd);}}
// Opt-in authority trace (diagnostics only): plain module-level counters of every native spawn made here.
const nativeAuthorityCounters={count:0,ms:0,maxMs:0,failed:0};
const nativeAuthorityByOperation=new Map();
export function recordNativeAuthoritySpawn(operation,ms,ok){
 nativeAuthorityCounters.count+=1;nativeAuthorityCounters.ms+=ms;
 if(ms>nativeAuthorityCounters.maxMs)nativeAuthorityCounters.maxMs=ms;
 if(!ok)nativeAuthorityCounters.failed+=1;
 const name=String(operation);nativeAuthorityByOperation.set(name,(nativeAuthorityByOperation.get(name)??0)+1);
}
// Process-local memo of READ-ONLY native observations, keyed on the observed object's lstat identity (see invoke below).
const MEMO_MAX=512;
const MEMO_READ_ONLY=new Set(['inspect','ancestor','ancestor-above-root','read','read-source','inspect-source-image']);
const MEMO_MUTATING=new Set(['publish','create-directory','remove']);
const authorityMemo=new Map();
const authorityMemoCounters={hits:0,misses:0};
let testSeam={platform:undefined,spawn:undefined};
// Test seam: only an explicit import can set it; the CLI never does. Defaults to the real platform and spawn.
export function setWindowsOwnedAuthorityBackendTestSeam(seam){testSeam={platform:seam?.platform,spawn:seam?.spawn};}
export function resetWindowsOwnedAuthorityBackendMemo(){authorityMemo.clear();}
export function nativeAuthorityStats(){
 const byOperation={};for(const name of [...nativeAuthorityByOperation.keys()].sort())byOperation[name]=nativeAuthorityByOperation.get(name);
 return {...nativeAuthorityCounters,byOperation,authorityMemoHits:authorityMemoCounters.hits,authorityMemoMisses:authorityMemoCounters.misses,authorityMemoSize:authorityMemo.size};
}
function memoIdentity(target){try{const s=lstatSync(target,{bigint:true});if(!s.isFile()&&!s.isDirectory())return null;return [s.dev,s.ino,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs,s.birthtimeNs].join(':');}catch{return null;}}
function invoke(request){
 const operation=request.operation;
 if(MEMO_MUTATING.has(operation)){authorityMemo.clear();try{return invokeNative(request);}finally{authorityMemo.clear();}}
 if(!MEMO_READ_ONLY.has(operation)||process.env.PIPELINE_AUTHORITY_NO_MEMO==='1')return invokeNative(request);
 const key=JSON.stringify([operation,request.path,request.directory??null,request.boundaryRoot??null,request.maxBytes??null]);
 const before=memoIdentity(request.path);
 const entry=authorityMemo.get(key);
 if(entry!==undefined){if(before!==null&&entry.identity===before){authorityMemoCounters.hits+=1;return entry.value;}authorityMemo.delete(key);}
 authorityMemoCounters.misses+=1;
 const value=invokeNative(request);
 if(before!==null&&memoIdentity(request.path)===before){authorityMemo.delete(key);authorityMemo.set(key,{identity:before,value});while(authorityMemo.size>MEMO_MAX)authorityMemo.delete(authorityMemo.keys().next().value);}
 return value;
}
function invokeNative(request){
 if((testSeam.platform??process.platform)!=='win32')fail('WIN-AUTH-PLATFORM-UNAVAILABLE');
 const input=JSON.stringify(request);if(Buffer.byteLength(input)>1500000)fail('WIN-AUTH-INPUT');
 let executable=null;if(testSeam.spawn!==undefined)executable='test-seam';else for(const candidate of WINDOWS_POWERSHELL_PATHS){try{const stat=lstatSync(candidate);if(stat.isFile()&&!stat.isSymbolicLink()&&realpathSync(candidate).toLowerCase()===candidate.toLowerCase()){executable=candidate;break;}}catch{/* fixed system locations only */}}
 if(executable===null)fail('WIN-AUTH-SYSTEM-HELPER-UNAVAILABLE');
 // Execute the measured source bytes, not a subsequently reopened helper pathname.
 const script=source();let result;const spawnStartedAt=Date.now();try{result=(testSeam.spawn??spawnSync)(executable,['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{input,encoding:'utf8',timeout:15000,maxBuffer:1600000,shell:false,windowsHide:true,env:sanitizeChildEnvironment(process.env)});}catch{recordNativeAuthoritySpawn(request.operation,Date.now()-spawnStartedAt,false);fail('WIN-AUTH-NATIVE-UNAVAILABLE');}
 recordNativeAuthoritySpawn(request.operation,Date.now()-spawnStartedAt,isSuccessfulSpawn(result));
 let value;try{value=JSON.parse(result.stdout);}catch{fail('WIN-AUTH-NATIVE-UNAVAILABLE');}
 if(exact(value,['ok','code','committed'])&&value.ok===false&&typeof value.committed==='boolean'&&/^WIN-AUTH-[A-Z-]{1,64}$/u.test(value.code))fail(value.code,value.committed);
 if(request.operation==='inspect-source-image'){if(!isSuccessfulSpawn(result)||result.signal!=null||result.stderr!==''||!exact(value,['ok','facts','size','sha256','committed'])||value.ok!==true||value.committed!==false||typeof value.facts!=='string'||!factsPattern.test(value.facts)||!Number.isSafeInteger(value.size)||value.size<0||value.size>134217728||! /^[a-f0-9]{64}$/u.test(value.sha256))fail('WIN-AUTH-NATIVE-OUTPUT');const parts=value.facts.split(':');if(parts.length!==12||BigInt(parts[3])<1n||(BigInt(parts[5])<<32n)+BigInt(parts[6])!==BigInt(value.size))fail('WIN-AUTH-NATIVE-OUTPUT');return value;}
 if(!isSuccessfulSpawn(result)||result.signal!=null||result.stderr!==''||!exact(value,['ok','facts','bytes','committed'])||value.ok!==true||typeof value.committed!=='boolean'||typeof value.facts!=='string'||(value.facts!=='removed'&&!factsPattern.test(value.facts)))fail('WIN-AUTH-NATIVE-OUTPUT');
 return value;
}
function observation(result){return Object.freeze({nativeFacts:result.facts,nativeFactsSha256:digest(result.facts),helperSha256:HELPER_SHA256,committed:result.committed});}
export function inspectWindowsOwnedAuthorityPath(input){if(!exact(input,['path','directory'])||typeof input.directory!=='boolean')fail('WIN-AUTH-INPUT');return observation(invoke({operation:'inspect',path:path(input.path),directory:input.directory}));}
// A directory strictly above a caller-proven repository root is human-controlled. The optional closed input {path,boundaryRoot}
// selects that relaxation only when path is lexically a strict ancestor of boundaryRoot (re-proved natively); a path at or below
// the root, or unrelated to it, keeps every strict check. Owner/ACL facts are still hashed into the returned facts either way.
function strictlyAboveRoot(ancestor,root){const a=ancestor.replace(/\\+$/u,''),b=root.replace(/\\+$/u,'');return b.length>a.length&&b.toLowerCase().startsWith(a.toLowerCase()+'\\');}
export function observeWindowsAuthorityAncestor(input){
 if(exact(input,['path','boundaryRoot'])){const ancestor=path(input.path),root=path(input.boundaryRoot);return observation(invoke(strictlyAboveRoot(ancestor,root)?{operation:'ancestor-above-root',path:ancestor,boundaryRoot:root}:{operation:'ancestor',path:ancestor}));}
 if(!exact(input,['path']))fail('WIN-AUTH-INPUT');return observation(invoke({operation:'ancestor',path:path(input.path)}));}
function read(input,operation){if(!exact(input,['path','maxBytes'])||!Number.isSafeInteger(input.maxBytes)||input.maxBytes<0||input.maxBytes>1048576)fail('WIN-AUTH-INPUT');const result=invoke({operation,path:path(input.path),maxBytes:input.maxBytes});if(typeof result.bytes!=='string'||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(result.bytes))fail('WIN-AUTH-NATIVE-OUTPUT');const bytes=Buffer.from(result.bytes,'base64');if(bytes.length>input.maxBytes)fail('WIN-AUTH-SIZE');return Object.freeze({...observation(result),bytes});}
export function readWindowsOwnedAuthorityFile(input){return read(input,'read');}
export function readWindowsAuthoritySourceModule(input){return read(input,'read-source');}
export function inspectWindowsAuthoritySourceImage(input){if(!exact(input,['path']))fail('WIN-AUTH-INPUT');const result=invoke({operation:'inspect-source-image',path:path(input.path)});return Object.freeze({...observation(result),size:result.size,sha256:result.sha256});}
export function createWindowsOwnedAuthorityDirectory(input){if(!exact(input,['path']))fail('WIN-AUTH-INPUT');return observation(invoke({operation:'create-directory',path:path(input.path)}));}
export function publishWindowsOwnedAuthorityFile(input){if(!exact(input,['path','bytes','expectedSha256','expectedFacts'])||!Buffer.isBuffer(input.bytes)||input.bytes.length>1048576||(input.expectedSha256!==null&&!/^[a-f0-9]{64}$/u.test(input.expectedSha256))||((input.expectedSha256===null)!==(input.expectedFacts===null))||(input.expectedFacts!==null&&(typeof input.expectedFacts!=='string'||!factsPattern.test(input.expectedFacts))))fail('WIN-AUTH-INPUT');return observation(invoke({operation:'publish',path:path(input.path),bytes:input.bytes.toString('base64'),expectedSha256:input.expectedSha256,expectedFacts:input.expectedFacts}));}
export function createWindowsOwnedAuthorityExclusiveFile(input){if(!exact(input,['path','bytes']))fail('WIN-AUTH-INPUT');return publishWindowsOwnedAuthorityFile({...input,expectedSha256:null,expectedFacts:null});}
export function removeWindowsOwnedAuthorityFile(input){if(!exact(input,['path','expectedSha256','expectedFacts'])||! /^[a-f0-9]{64}$/u.test(input.expectedSha256)||typeof input.expectedFacts!=='string'||!factsPattern.test(input.expectedFacts))fail('WIN-AUTH-INPUT');return observation(invoke({operation:'remove',path:path(input.path),expectedSha256:input.expectedSha256,expectedFacts:input.expectedFacts}));}
