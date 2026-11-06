// SPDX-License-Identifier: SUL-1.0
// Source-owned native physical observations. This module issues no authority brand.
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {lstatSync,openSync,readFileSync,readSync,fstatSync,closeSync,constants,realpathSync,mkdirSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,isAbsolute,join,resolve,sep} from 'node:path';
import {WINDOWS_POWERSHELL_PATHS,sanitizeChildEnvironment} from './windows-private-state.mjs';
import {isSuccessfulSpawn} from './successful-spawn.mjs';
import {assertAdmissionDeadline} from './admission-deadline.mjs';

const HELPER_SHA256='77c9f91c1497c0b95bf0f38214a34dc339c4786cea03a939e59a470cbab71242';
const helperPath=fileURLToPath(new URL('./windows-owned-authority-native.ps1',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const factsPattern=/^[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-9]+:(?:directory|[0-9]+:[0-9]+):[0-9]+:[0-9]+:(?:directory|[0-9]+:[0-9]+):[a-f0-9]{64}$/u;
// Q10: the failure envelope may carry the one path the native open failed on (optional, bounded, no control characters).
const FAILED_PATH_MAX=4096;
let lastFailedPath=null;
/** The failed path of the most recent native failure in this process, or null when that failure carried none. */
export function lastWindowsAuthorityFailedPath(){return lastFailedPath;}
const failedPathValue=value=>typeof value==='string'&&value.length>0&&value.length<=FAILED_PATH_MAX&&!/[\u0000-\u001f\u007f]/u.test(value);
function fail(reason,committed=false,failedPath=undefined){const detail=/^WIN-AUTH-DACL-(?:EMPTY|UNPROTECTED|ACE|FOREIGN)$/u.test(reason)?reason:undefined;const error=new Error(reason);error.name='SessionAuthorityError';error.code='SDC-AUTHORITY-UNAVAILABLE';error.reason=detail?'WIN-AUTH-DACL':reason;if(detail)error.detail=detail;error.committed=committed;lastFailedPath=failedPath??null;if(failedPath!==undefined)error.failedPath=failedPath;throw error;}
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
 nativeSpawnMark(name,ms);
}
// With the opt-in authority trace installed (a writer on a well-known global, lib/admission-progress.mjs), every native observation also
// appends one line naming the operation, its duration and the two nearest callers outside the native modules (file:line only, no path,
// no input). A process the host ends leaves no exit line, and one counter line cannot say which caller made 220 observations; this can.
// Nothing runs without the trace: the stack is only read when a writer exists.
const NATIVE_SITE_SKIP=/windows-owned-authority-backend\.mjs|windows-private-state\.mjs|windows-authority-readiness\.mjs/u;
function nativeCallSites(){
 const limit=Error.stackTraceLimit;Error.stackTraceLimit=40;let stack='';
 try{stack=String(new Error().stack??'');}finally{Error.stackTraceLimit=limit;}
 const sites=[];
 for(const line of stack.split('\n').slice(1)){
  const match=/([A-Za-z0-9_.-]+\.(?:mjs|js|cjs)):(\d+):\d+\)?\s*$/u.exec(line);
  if(match===null||NATIVE_SITE_SKIP.test(line))continue;
  sites.push(`${match[1]}:${match[2]}`);if(sites.length===2)break;
 }
 return sites.join('<');
}
function nativeSpawnMark(name,ms){
 try{
  const progress=globalThis[Symbol.for('pipeline.authority-trace-progress')];
  if(typeof progress!=='function')return;
  progress(`native:${name}:${ms}ms:${nativeCallSites()}`);
 }catch{/* a diagnostic never changes the observation it describes */}
}
// Process-local memo of READ-ONLY native observations, keyed on the observed object's lstat identity (see invoke below).
const MEMO_MAX=512;
const MEMO_READ_ONLY=new Set(['inspect','ancestor','ancestor-above-root','read','read-source','inspect-source-image']);
const MEMO_MUTATING=new Set(['publish','create-directory','remove']);
const MEMO_BYTELESS=new Set(['inspect','ancestor','ancestor-above-root']);
const authorityMemo=new Map();
const authorityMemoCounters={hits:0,misses:0,persistedHits:0};
// Cross-process layer of the same memo. Every hook is a new process, and a dispatch or a refusal runs several of them, each re-observing the
// same unchanged installed sources, directories and records (about one PowerShell start, 0.5 to 1 s, per observation on Windows). The layer
// keeps only what this module itself observed and validated: a READ-ONLY observation, keyed as the in-process memo is, together with the
// object's lstat identity (device, file id, mode, links, size, mtime, ctime, birthtime). A persisted entry answers only while the object's
// CURRENT identity is equal to the stored one (a content write, an ACL or owner change and a replacement all change one of them), exactly the
// check every in-process hit already makes, so a stale entry is never returned; it is then only a longer-lived copy of the same trust. The
// file lives in the user's private application-data directory (not in the repository), is size-bounded, schema- and helper-bound, validated
// entry by entry on load (a malformed or foreign entry is dropped, never trusted), written by an atomic rename after merging what another
// process wrote meanwhile, and ignored entirely under PIPELINE_AUTHORITY_NO_MEMO=1. Any fault reading or writing it only means "no persisted
// answer": the observation then runs as before.
const PERSIST_SCHEMA='pipeline.authority-observation-memo.v1';
const PERSIST_MAX_ENTRIES=1024,PERSIST_MAX_VALUE_BASE64=24576,PERSIST_MAX_FILE_BYTES=8*1024*1024,PERSIST_FLUSH_EVERY=24;
const BASE64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
let persisted=null,persistedDirty=0,persistedExitHook=false;
const persistedDropped=new Set();
function persistedFile(){
 // A test that fakes the native spawn never touches the user's real file: it persists only when it names its own.
 if(testSeam.spawn!==undefined||testSeam.memoFile!==undefined)return testSeam.memoFile??null;
 const base=process.env.LOCALAPPDATA;
 return typeof base==='string'&&isAbsolute(base)&&resolve(base)===base?join(base,'agent-pipeline','authority-observation-memo.v1.json'):null;
}
function persistedValueShape(operation,value){
 if(!object(value)||value.ok!==true||value.committed!==false||typeof value.facts!=='string'||!factsPattern.test(value.facts))return false;
 if(operation==='inspect-source-image')return exact(value,['ok','facts','size','sha256','committed'])&&Number.isSafeInteger(value.size)&&value.size>=0&&value.size<=134217728&&/^[a-f0-9]{64}$/u.test(value.sha256);
 // w235 (19g Windows measurement): the two hottest sites, the registry closure walk (inspect) and the ancestor chain (ancestor,
 // ancestor-above-root), return no bytes and were never kept across processes, so every hook process paid them again. They are kept
 // under the same identity rule as every other entry: answered only while the object's current lstat identity equals the stored one.
 if(MEMO_BYTELESS.has(operation))return exact(value,['ok','facts','bytes','committed'])&&value.bytes===null;
 return exact(value,['ok','facts','bytes','committed'])&&typeof value.bytes==='string'&&value.bytes.length<=PERSIST_MAX_VALUE_BASE64&&BASE64.test(value.bytes);
}
function persistedEntryShape(row){
 if(!exact(row,['key','path','identity','value'])||typeof row.key!=='string'||row.key.length>34000||typeof row.path!=='string'||!isAbsolute(row.path)||typeof row.identity!=='string'||!/^[0-9:]{1,200}$/u.test(row.identity))return false;
 let parts;try{parts=JSON.parse(row.key);}catch{return false;}
 return Array.isArray(parts)&&parts.length===5&&MEMO_READ_ONLY.has(parts[0])&&parts[1]===row.path&&persistedValueShape(parts[0],row.value);
}
function readPersistedFile(file){
 const rows=new Map();
 try{
  const info=lstatSync(file);if(!info.isFile()||info.isSymbolicLink()||info.size>PERSIST_MAX_FILE_BYTES)return rows;
  const data=JSON.parse(readFileSync(file,'utf8'));
  if(!exact(data,['schema','helperSha256','entries'])||data.schema!==PERSIST_SCHEMA||data.helperSha256!==HELPER_SHA256||!Array.isArray(data.entries))return rows;
  for(const row of data.entries.slice(-PERSIST_MAX_ENTRIES))if(persistedEntryShape(row))rows.set(row.key,{path:row.path,identity:row.identity,value:row.value});
 }catch{/* no persisted answer */}
 return rows;
}
function loadPersisted(){
 if(persisted!==null)return persisted;
 const file=persistedFile();persisted=file===null?new Map():readPersistedFile(file);
 return persisted;
}
/** Writes the cross-process memo (merged with what another process wrote meanwhile) by an atomic rename. Runs at process exit and every few
 * new entries; a fault is swallowed because the memo only ever saves work. */
export function flushWindowsOwnedAuthorityBackendMemo(){
 if(persisted===null||persistedDirty===0)return;
 const file=persistedFile();if(file===null)return;
 let temp=null;
 try{
  const merged=new Map(readPersistedFile(file));for(const key of persistedDropped)merged.delete(key);
  for(const [key,entry] of persisted){merged.delete(key);merged.set(key,entry);}
  const rows=[...merged].slice(-PERSIST_MAX_ENTRIES).map(([key,entry])=>({key,path:entry.path,identity:entry.identity,value:entry.value}));
  const text=JSON.stringify({schema:PERSIST_SCHEMA,helperSha256:HELPER_SHA256,entries:rows});
  if(Buffer.byteLength(text)>PERSIST_MAX_FILE_BYTES)return;
  mkdirSync(dirname(file),{recursive:true,mode:0o700});
  temp=`${file}.${process.pid}.tmp`;writeFileSync(temp,text,{flag:'w',mode:0o600});renameSync(temp,file);temp=null;persistedDirty=0;persistedDropped.clear();
 }catch{/* the memo only saves work */}
 finally{if(temp!==null){try{unlinkSync(temp);}catch{/* already gone */}}}
}
function rememberPersisted(key,request,identity,value){
 if(typeof value?.bytes==='string'&&value.bytes.length>PERSIST_MAX_VALUE_BASE64)return;
 if(!persistedValueShape(request.operation,value))return;
 const rows=loadPersisted();rows.delete(key);rows.set(key,{path:request.path,identity,value});
 while(rows.size>PERSIST_MAX_ENTRIES)rows.delete(rows.keys().next().value);
 persistedDirty+=1;
 if(testSeam.memoFile===undefined&&!persistedExitHook){persistedExitHook=true;process.once('exit',flushWindowsOwnedAuthorityBackendMemo);}
 if(persistedDirty>=PERSIST_FLUSH_EVERY)flushWindowsOwnedAuthorityBackendMemo();
}
let testSeam={platform:undefined,spawn:undefined};
// Test seam: only an explicit import can set it; the CLI never does. Defaults to the real platform and spawn.
// `nodeReads` selects the Node answers for read and inspect (below); without it a seam that fakes the spawn keeps the native answers, a real run (no seam) uses Node.
export function setWindowsOwnedAuthorityBackendTestSeam(seam){testSeam={platform:seam?.platform,spawn:seam?.spawn,memoFile:seam?.memoFile,nodeReads:seam?.nodeReads,afterFirstPass:seam?.afterFirstPass};persisted=null;persistedDirty=0;persistedDropped.clear();}
// Clears the in-process memo and forgets the loaded cross-process copy (a new process starts with neither; the file itself stays).
export function resetWindowsOwnedAuthorityBackendMemo(){authorityMemo.clear();persisted=null;persistedDirty=0;persistedDropped.clear();}
export function nativeAuthorityStats(){
 const byOperation={};for(const name of [...nativeAuthorityByOperation.keys()].sort())byOperation[name]=nativeAuthorityByOperation.get(name);
 return {...nativeAuthorityCounters,byOperation,authorityMemoHits:authorityMemoCounters.hits,authorityMemoMisses:authorityMemoCounters.misses,authorityMemoPersistedHits:authorityMemoCounters.persistedHits,authorityMemoSize:authorityMemo.size};
}
function memoIdentity(target){try{const s=lstatSync(target,{bigint:true});if(!s.isFile()&&!s.isDirectory())return null;return [s.dev,s.ino,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs,s.birthtimeNs].join(':');}catch{return null;}}
// A write changes the object it names, the directory that lists it and everything below it (a directory removal); no other object. Every memo hit
// still compares the observed object's own identity (device, file id, size, times), so an entry elsewhere in the tree stays valid across the write
// and stays checked on every hit. Dropping only these entries, not the whole memo, keeps the many unrelated reads that follow a publish from
// each starting a new native process (about one second each on Windows).
function forgetMemoAround(written){
 // Paths compare without case: a case-insensitive file system may spell one object two ways, and dropping too much is harmless.
 const folded=written.toLowerCase(),parent=dirname(folded),below=folded.endsWith(sep)?folded:folded+sep;
 for(const [key,entry] of authorityMemo){const at=entry.path.toLowerCase();if(at===folded||at===parent||at.startsWith(below))authorityMemo.delete(key);}
 // The cross-process copy follows (hygiene only: a hit there is identity-checked anyway, and a write changes the identity of what it touched).
 if(persisted!==null)for(const [key,entry] of persisted){const at=entry.path.toLowerCase();if(at===folded||at===parent||at.startsWith(below)){persisted.delete(key);persistedDropped.add(key);persistedDirty+=1;}}
}
// C19I-W239 (O5c, PO decision 2026-11-06, protection loss accepted): the private read and inspect observations are answered in Node, not by one
// PowerShell start (about 470 ms) each. Identity comes from a bigint lstat; a symlink or junction, a link count other than one, the wrong object
// kind and a final path (realpath.native) that differs from the requested one (case-insensitively) are refused; a read compares the lstat
// identity before and after and the SHA-256 of two passes over the bytes. The facts string keeps the native shape (volume, file id, links,
// attributes stand-in, size, creation, write time, hash) so witnesses and the memo keep working; its last slot is a hash of the lstat identity
// where the native one hashes the security descriptor. Node-answered operations bypass the memo (cheap, and an older persisted entry holds
// native-shaped facts). Create, publish and remove stay native: see invokeMutating. What this gives up is listed in the held-patch notes.
const nodeReadsEnabled=()=>testSeam.nodeReads??testSeam.spawn===undefined;
const NODE_OPERATIONS=new Set(['inspect','read']);
const FILETIME_EPOCH_TICKS=116444736000000000n,UINT32=0xffffffffn;
const filetime=ns=>{const ticks=BigInt.asUintN(64,ns/100n+FILETIME_EPOCH_TICKS);return [ticks>>32n,ticks&UINT32];};
// A directory's facts leave out size and times that change with its membership (the native ones did the same).
const NODE_IDENTITY=['dev','ino','mode','nlink','size','mtimeNs','ctimeNs','birthtimeNs'],NODE_DIRECTORY_IDENTITY=['dev','ino','mode','birthtimeNs'];
const sameNodeIdentity=(a,b,directory)=>(directory?NODE_DIRECTORY_IDENTITY:NODE_IDENTITY).every(key=>a[key]===b[key]);
function nodeFacts(s,directory){
 const ino=BigInt.asUintN(64,s.ino),created=filetime(s.birthtimeNs);
 const stamp=digest(`pipeline.node-authority-facts.v1:${(directory?NODE_DIRECTORY_IDENTITY:NODE_IDENTITY).map(key=>s[key]).join(':')}`);
 return [s.dev,ino>>32n,ino&UINT32,s.nlink,s.mode,...(directory?['directory']:[s.size>>32n,s.size&UINT32]),created[0],created[1],...(directory?['directory']:filetime(s.mtimeNs)),stamp].join(':');
}
function nodeStat(target,directory){
 let s;try{s=lstatSync(target,{bigint:true});}catch{fail('WIN-AUTH-OPEN',false,target);}
 if(s.isSymbolicLink()||(directory?!s.isDirectory():(!s.isFile()||s.nlink!==1n)))fail('WIN-AUTH-ALIAS');
 return s;
}
function nodeFinalPath(target){
 let real;try{real=realpathSync.native(target);}catch{fail('WIN-AUTH-FINAL-PATH');}
 if(real.startsWith('\\\\?\\'))real=real.slice(4);
 const fold=value=>value.replace(/[\\/]+$/u,'').toLowerCase();
 if(fold(real)!==fold(target))fail('WIN-AUTH-ALIAS');
}
function nodeInspect(target,directory){
 const first=nodeStat(target,directory);nodeFinalPath(target);const second=nodeStat(target,directory);
 if(!sameNodeIdentity(first,second,directory))fail('WIN-AUTH-RACE');
 return {ok:true,facts:nodeFacts(second,directory),bytes:null,committed:false};
}
function nodePass(fd,size){
 const buffer=Buffer.allocUnsafe(size);let at=0;
 while(at<size){const count=readSync(fd,buffer,at,size-at,at);if(count===0)fail('WIN-AUTH-RACE');at+=count;}
 if(readSync(fd,Buffer.allocUnsafe(1),0,1,size)!==0)fail('WIN-AUTH-RACE');
 return buffer;
}
function nodeRead(target,maxBytes){
 const first=nodeStat(target,false);if(first.size>BigInt(maxBytes))fail('WIN-AUTH-SIZE');nodeFinalPath(target);
 let fd;try{fd=openSync(target,constants.O_RDONLY);}catch{fail('WIN-AUTH-OPEN',false,target);}
 let one,two;
 try{
  const opened=fstatSync(fd,{bigint:true});if(opened.dev!==first.dev||opened.ino!==first.ino)fail('WIN-AUTH-RACE');
  one=nodePass(fd,Number(first.size));testSeam.afterFirstPass?.();two=nodePass(fd,Number(first.size));
 }finally{closeSync(fd);}
 const last=nodeStat(target,false);
 if(!sameNodeIdentity(first,last,false)||!one.equals(two))fail('WIN-AUTH-RACE');
 return {ok:true,facts:nodeFacts(last,false),bytes:one,committed:false};
}
function nodeInvoke(request){
 if((testSeam.platform??process.platform)!=='win32')fail('WIN-AUTH-PLATFORM-UNAVAILABLE');
 const value=request.operation==='read'?nodeRead(request.path,request.maxBytes):nodeInspect(request.path,request.directory);
 return value.bytes===null?value:{...value,bytes:value.bytes.toString('base64')};
}
// Callers hold Node-shaped facts, the native helper compares its own: a compare-and-swap publish or a remove therefore (1) requires the Node
// facts and the bytes of the current file to equal the caller's witness, (2) takes the native facts of that same file with one native read,
// requires its bytes to match as well, (3) re-checks the Node witness, and only then hands the native facts to the native mutation, which
// keeps every one of its own checks, custody handles and read-backs. A publish or create returns the Node facts of what it wrote, so the next
// read agrees with it (the registry's publication read-back), after cross-checking volume and file id against the native answer.
function invokeMutating(request){
 const operation=request.operation;let native=request;
 if(operation==='remove'||(operation==='publish'&&request.expectedFacts!==null)){
  const witness=()=>{const current=nodeRead(request.path,1048576);if(digest(current.bytes)!==request.expectedSha256||current.facts!==request.expectedFacts)fail('WIN-AUTH-CAS');};
  witness();
  const current=invokeNative({operation:'read',path:request.path,maxBytes:1048576});
  if(typeof current.bytes!=='string'||digest(Buffer.from(current.bytes,'base64'))!==request.expectedSha256)fail('WIN-AUTH-CAS');
  witness();
  native={...request,expectedFacts:current.facts};
 }
 const value=invokeNative(native);
 if(operation==='remove')return value;
 try{
  const directory=operation==='create-directory',observed=directory?nodeInspect(request.path,true):nodeRead(request.path,1048576);
  if(!directory&&!observed.bytes.equals(Buffer.from(request.bytes,'base64')))fail('WIN-AUTH-READBACK');
  const reported=value.facts.split(':'),seen=observed.facts.split(':');
  if(reported[0]!==seen[0]||reported[1]!==seen[1]||reported[2]!==seen[2])fail('WIN-AUTH-READBACK');
  return {...value,facts:observed.facts};
 }catch(error){error.committed=value.committed;throw error;}
}
function invoke(request){
 const operation=request.operation;
 if(MEMO_MUTATING.has(operation)){forgetMemoAround(request.path);try{return nodeReadsEnabled()?invokeMutating(request):invokeNative(request);}finally{forgetMemoAround(request.path);}}
 if(NODE_OPERATIONS.has(operation)&&nodeReadsEnabled())return nodeInvoke(request);
 if(!MEMO_READ_ONLY.has(operation)||process.env.PIPELINE_AUTHORITY_NO_MEMO==='1')return invokeNative(request);
 const key=JSON.stringify([operation,request.path,request.directory??null,request.boundaryRoot??null,request.maxBytes??null]);
 const before=memoIdentity(request.path);
 const entry=authorityMemo.get(key);
 if(entry!==undefined){if(before!==null&&entry.identity===before){authorityMemoCounters.hits+=1;return entry.value;}authorityMemo.delete(key);}
 // Another process may have observed this very object, unchanged, a moment or hours ago: its entry answers only for the same identity.
 const stored=before===null?undefined:loadPersisted().get(key);
 if(stored!==undefined){
  if(stored.identity===before&&stored.path===request.path){authorityMemoCounters.hits+=1;authorityMemoCounters.persistedHits+=1;authorityMemo.delete(key);authorityMemo.set(key,{identity:before,value:stored.value,path:request.path});while(authorityMemo.size>MEMO_MAX)authorityMemo.delete(authorityMemo.keys().next().value);return stored.value;}
  persisted.delete(key);
 }
 authorityMemoCounters.misses+=1;
 // A read-only observation is the unit of cost on Windows (one PowerShell start); the admission deadline stops a long run of them. Never on
 // the mutating operations above: publish, remove and create-directory are the cleanup path and must always be allowed to finish.
 assertAdmissionDeadline();
 const value=invokeNative(request);
 if(before!==null&&memoIdentity(request.path)===before){authorityMemo.delete(key);authorityMemo.set(key,{identity:before,value,path:request.path});while(authorityMemo.size>MEMO_MAX)authorityMemo.delete(authorityMemo.keys().next().value);rememberPersisted(key,request,before,value);}
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
 if(exact(value,['ok','code','committed','path'])&&value.ok===false&&typeof value.committed==='boolean'&&/^WIN-AUTH-[A-Z-]{1,64}$/u.test(value.code)&&failedPathValue(value.path))fail(value.code,value.committed,value.path);
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
