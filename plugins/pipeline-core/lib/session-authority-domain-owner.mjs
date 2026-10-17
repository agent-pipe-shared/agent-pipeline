// SPDX-License-Identifier: SUL-1.0
import { inspectWindowsOwnedAuthorityPath, observeWindowsAuthorityAncestor, readWindowsOwnedAuthorityFile, readWindowsAuthoritySourceModule, createWindowsOwnedAuthorityDirectory, publishWindowsOwnedAuthorityFile } from './windows-owned-authority-backend.mjs';
/** Source-only physical owner primitives. No wire input can brand a domain port. */
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {AsyncLocalStorage} from 'node:async_hooks';
import {constants,closeSync,fstatSync,fsyncSync,lstatSync,mkdirSync,openSync,readFileSync,readSync,readdirSync,realpathSync,renameSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,join,parse,relative,resolve,sep} from 'node:path';
import {canonical} from './po-approval-proof.mjs';
import {readOwnedSessionPowerEndpointSource} from './session-power-owned-lifecycle.mjs';
import {parseStrictJson} from './governance-event.mjs';
import {inspectSignedDescriptorCustodyRepository} from './worktree-lifecycle.mjs';
import {withSessionAuthorityBoundary,reserveSessionAuthorityMember,advanceSessionAuthorityMember,releaseSessionAuthorityMember,executeSourceOwnedSessionAuthorityDomainTransition,inspectSourceOwnedSessionAuthorityDomainTransitionRefresh,readSourceOwnedControlledModelTransitionSnapshot,observeSourceOwnedControlledModelTransitionRefresh,assertSourceOwnedDomainAuthorityMutablePreflight} from './session-authority-registry.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex'),digest=v=>hash(canonical(v));
export const authorityDomainDigest=digest;
const same=(a,b)=>canonical(a)===canonical(b);
const LIMIT=Object.freeze({entries:4096,depth:6,file:1048576,total:16777216});
const operationScope=new AsyncLocalStorage();
const transitionExecution=new AsyncLocalStorage(),transitionTickets=new WeakMap();
export function authorityOwnerFailure(reason){const error=new Error(reason);error.name='SessionAuthorityError';error.code='SDC-AUTHORITY-UNAVAILABLE';error.reason=reason;throw error;}
function identity(s){return {dev:String(s.dev),ino:String(s.ino),mode:s.mode,nlink:s.nlink};}
// Ancestor locators bind path custody, not siblings' directory membership.
function locatorIdentity(s){return {dev:String(s.dev),ino:String(s.ino),mode:s.mode,uid:s.uid,gid:s.gid};}
function stability(s){return {...identity(s),uid:s.uid,gid:s.gid,size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs};}
function owned(s,directory=false,path){if(process.platform==='win32'){if(!path)authorityOwnerFailure('domain-native-path-required');inspectWindowsOwnedAuthorityPath({path,directory});return;}if(s.isSymbolicLink()||(directory?!s.isDirectory():!s.isFile())||(!directory&&s.nlink!==1)||(s.mode&0o077)!==0||(typeof process.getuid==='function'&&s.uid!==process.getuid()))authorityOwnerFailure('domain-private-ownership');}
function chain(p,boundaryRoot=null){if(process.platform==='win32')return observedChain(p,boundaryRoot).present;if(typeof p!=='string'||!isAbsolute(p)||resolve(p)!==p)authorityOwnerFailure('domain-root-path');let current=parse(p).root;for(const segment of relative(current,p).split(sep).filter(Boolean)){current=join(current,segment);try{const s=lstatSync(current);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o022)!==0)authorityOwnerFailure('domain-ancestor-unsafe');}catch(e){if(e.code==='ENOENT')return false;throw e;}}return true;}
function observedChain(p,boundaryRoot=null){if(process.platform==='win32')return observedWindowsChain(p,boundaryRoot);if(typeof p!=='string'||!isAbsolute(p)||resolve(p)!==p)authorityOwnerFailure('domain-root-path');const rows=[];let current=parse(p).root;for(const segment of relative(current,p).split(sep).filter(Boolean)){current=join(current,segment);try{const s=lstatSync(current);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o022)!==0)authorityOwnerFailure('domain-ancestor-unsafe');rows.push({pathSha256:digest(current),identity:locatorIdentity(s)});}catch(e){if(e.code==='ENOENT')return {present:false,rows,firstAbsentSha256:digest(current)};throw e;}}return {present:true,rows};}
const nativeFactCustody=new WeakMap();
// Original native publication witnesses are private physical custody, never authority.
const nativePublicationCustody=new Map();
// PO decision 2026-10-17: directories strictly above the repository root are human-controlled (observed, never refused).
// The boundary is DERIVED from the walked path alone, never supplied by a caller: <X>\.git\agent-pipeline\... with <X>\.git an
// lstat-confirmed real directory yields X; anything else is null and keeps every strict check. The first marker occurrence is
// taken, so an odd nested path can only relax fewer ancestors, never more.
function windowsAuthorityBoundary(p){
  if(process.platform!=='win32'||typeof p!=='string'||!isAbsolute(p)||resolve(p)!==p)return null;
  const marker=sep+'.git'+sep+'agent-pipeline',lower=p.toLowerCase(),driveRoot=parse(p).root;
  for(let at=lower.indexOf(marker);at>0;at=lower.indexOf(marker,at+1)){
    const end=at+marker.length;if(end!==lower.length&&lower[end]!==sep)continue;
    const root=at<=driveRoot.length?driveRoot:p.slice(0,at);
    try{const s=lstatSync(join(root,'.git'));return s.isDirectory()&&!s.isSymbolicLink()?root:null;}catch{return null;}
  }
  return null;
}
function observedWindowsChain(p,boundaryRoot=null){
  if(typeof p!=='string'||!isAbsolute(p)||resolve(p)!==p)authorityOwnerFailure('domain-root-path');
  const rows=[];let current=parse(p).root;
  for(const next of [current,...relative(current,p).split(sep).filter(Boolean)]){
    if(next!==current)current=join(current,next);
    try{const s=lstatSync(current);if(!s.isDirectory()||s.isSymbolicLink())authorityOwnerFailure('domain-ancestor-unsafe');const native=observeWindowsAuthorityAncestor(boundaryRoot?{path:current,boundaryRoot}:{path:current});rows.push({pathSha256:digest(current),identity:locatorIdentity(s),nativeFactsSha256:native.nativeFactsSha256});}
    catch(e){if(e.code==='ENOENT')return {present:false,rows,firstAbsentSha256:digest(current)};throw e;}
  }
  return {present:true,rows};
}
function nativeJoinedRead(filePath,privateRecord){
  const before=lstatSync(filePath,{bigint:true});
  const native=(privateRecord?readWindowsOwnedAuthorityFile:readWindowsAuthoritySourceModule)({path:filePath,maxBytes:LIMIT.file});
  const after=lstatSync(filePath,{bigint:true}),parts=native.nativeFacts.split(':'),volume=BigInt(parts[0]),inode=(BigInt(parts[1])<<32n)+BigInt(parts[2]);
  // Node and native observations must identify the SAME volume and file, not a cast.
  if(before.dev!==volume||after.dev!==volume||before.ino!==inode||after.ino!==inode||before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs||before.nlink!==1n||after.nlink!==1n||BigInt(native.bytes.length)!==after.size)authorityOwnerFailure('domain-native-subject-join');
  return {...native,identity:{dev:volume.toString(),ino:inode.toString(),mode:Number(after.mode),nlink:1}};
}
function readWindowsDomainSource(namespaceId,filePath,semantic){
  const native=nativeJoinedRead(filePath,true),bytes=native.bytes,value=json(bytes),meaning=semantic({value,bytes});
  if(!meaning||typeof meaning!=='object'||Array.isArray(meaning))authorityOwnerFailure('domain-source-semantic');
  const sourceFact={namespaceId,pathSha256:digest(filePath),sha256:hash(bytes),size:bytes.length,identity:native.identity,semanticSha256:digest(meaning)};
  nativeFactCustody.set(sourceFact,native.nativeFactsSha256);return {value,bytes,sourceFact};
}
function json(bytes){try{return parseStrictJson(bytes);}catch{return null;}}
// PO decision 2026-10-17 (the pipeline protects against the agent, not the human): directories strictly above the plugin root are
// human-controlled host properties, observed and hashed but never refused. The boundary is DERIVED from this module's own location,
// never supplied by a caller, and is consumed by readModuleContext alone, and only for a source module lexically inside it
// (case-insensitive, separator-delimited); anything else is null and keeps every strict check. The plugin root itself and every
// directory below it stay strict, and POSIX never produces a boundary.
const PLUGIN_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function pluginRootBoundary(filePath){
  if(process.platform!=='win32'||typeof filePath!=='string')return null;
  const base=PLUGIN_ROOT.replace(/[\\/]+$/u,'');
  return filePath.length>base.length&&filePath.toLowerCase().startsWith(base.toLowerCase()+sep)?PLUGIN_ROOT:null;
}
function readModuleContext(filePath){
  if(process.platform==='win32'){if(!chain(dirname(filePath),pluginRootBoundary(filePath)))authorityOwnerFailure('domain-source-context-path');const native=nativeJoinedRead(filePath,false);return {pathSha256:digest(filePath),sha256:hash(native.bytes),identity:native.identity,size:native.bytes.length,nativeFactsSha256:native.nativeFactsSha256};}
  if(!chain(dirname(filePath))||realpathSync(filePath)!==filePath)authorityOwnerFailure('domain-source-context-path');
  let fd;try{const before=lstatSync(filePath);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||(before.mode&0o022)!==0||before.size>LIMIT.file)authorityOwnerFailure('domain-source-context-ownership');fd=openSync(filePath,constants.O_RDONLY|constants.O_NOFOLLOW);const opened=fstatSync(fd);if(!same(stability(before),stability(opened)))authorityOwnerFailure('domain-source-context-race');const buffer=Buffer.alloc(LIMIT.file+1);let size=0;while(size<buffer.length){const count=readSync(fd,buffer,size,buffer.length-size,size);if(!count)break;size+=count;}const after=lstatSync(filePath),final=fstatSync(fd);if(size>LIMIT.file||size!==final.size||!same(stability(opened),stability(final))||!same(stability(final),stability(after)))authorityOwnerFailure('domain-source-context-race');return {pathSha256:digest(filePath),sha256:hash(buffer.subarray(0,size)),identity:identity(final),size};}finally{if(fd!==undefined)closeSync(fd);}
}
export function readAuthoritySourceFile({namespaceId,filePath,semantic}){
  if(typeof namespaceId!=='string'||!namespaceId||typeof semantic!=='function'||!chain(dirname(filePath),windowsAuthorityBoundary(filePath)))authorityOwnerFailure('domain-source-input');
  if(process.platform==='win32')return readWindowsDomainSource(namespaceId,filePath,semantic);
  let fd;try{
    const before=lstatSync(filePath);owned(before);if(before.size>LIMIT.file)authorityOwnerFailure('domain-source-size');
    fd=openSync(filePath,constants.O_RDONLY|constants.O_NOFOLLOW);const opened=fstatSync(fd);owned(opened);
    if(!same(stability(before),stability(opened)))authorityOwnerFailure('domain-source-race');
    function boundedRead(){const chunks=[];let offset=0;while(offset<=LIMIT.file){const chunk=Buffer.alloc(Math.min(65536,LIMIT.file+1-offset)),size=readSync(fd,chunk,0,chunk.length,offset);if(size===0)break;chunks.push(chunk.subarray(0,size));offset+=size;}if(offset>LIMIT.file)authorityOwnerFailure('domain-source-size');return Buffer.concat(chunks,offset);}
    const bytes=boundedRead(),afterRead=fstatSync(fd),again=boundedRead(),final=fstatSync(fd),after=lstatSync(filePath);owned(afterRead);owned(final);owned(after);
    if(!same(stability(opened),stability(afterRead))||!same(stability(afterRead),stability(final))||!same(stability(final),stability(after))||bytes.length!==after.size||!bytes.equals(again))authorityOwnerFailure('domain-source-race');
    const value=json(bytes),meaning=semantic({value,bytes});if(!meaning||typeof meaning!=='object'||Array.isArray(meaning))authorityOwnerFailure('domain-source-semantic');
    return {value,bytes,sourceFact:{namespaceId,pathSha256:digest(filePath),sha256:hash(bytes),size:bytes.length,identity:identity(after),semanticSha256:digest(meaning)}};
  }finally{if(fd!==undefined)closeSync(fd);}
}
function readPowerEndpoint({namespaceId,filePath,relativePath,classifyEntry}){
  if(namespaceId!=='session-power-records'||process.platform==='win32'||!chain(dirname(filePath)))authorityOwnerFailure('domain-socket-source-unavailable');
  const before=lstatSync(filePath);
  const socket=s=>s.isSocket()&&!s.isSymbolicLink()&&s.nlink===1&&(s.mode&0o077)===0&&(typeof process.getuid!=='function'||s.uid===process.getuid());
  if(!socket(before))authorityOwnerFailure('domain-socket-private-ownership');
  const read=readOwnedSessionPowerEndpointSource({namespaceId,filePath});
  const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
  const valueKeys=['schema','repoFingerprint','sessionId','descriptorSha256','activationNonceSha256','controllerPid','controllerStart','controllerExecutableSha256','childPid','childStart','childExecutableSha256','handleId'];
  if(!exact(read,['value','bytes','sourceFact'])||!exact(read.value,valueKeys)||read.value.schema!=='pipeline.session-power-owned-endpoint.v1'||!Buffer.isBuffer(read.bytes)||read.bytes.length>LIMIT.file||!read.bytes.equals(Buffer.from(canonical(read.value)))||!exact(read.sourceFact,['namespaceId','pathSha256','sha256','size','identity','semanticSha256'])||!exact(read.sourceFact.identity,['dev','ino','mode','nlink']))authorityOwnerFailure('domain-socket-closed-observation');
  const after=lstatSync(filePath);
  if(!socket(after)||!same(stability(before),stability(after))||!same(read.sourceFact.identity,identity(after))||read.sourceFact.namespaceId!==namespaceId||read.sourceFact.pathSha256!==digest(filePath)||read.sourceFact.sha256!==hash(read.bytes)||read.sourceFact.size!==read.bytes.length||read.sourceFact.semanticSha256!==digest(read.value))authorityOwnerFailure('domain-socket-source-CAS');
  const meaning=classifyEntry({path:filePath,relativePath,value:read.value,bytes:read.bytes});
  if(!same(meaning,read.value))authorityOwnerFailure('domain-socket-classifier-semantic');
  return read;
}
export function readAuthorityNamespace({namespaceId,rootPath,classifyEntry}){
  if(typeof namespaceId!=='string'||typeof classifyEntry!=='function')authorityOwnerFailure('domain-namespace-input');
  const boundaryRoot=windowsAuthorityBoundary(rootPath),ancestors=observedChain(rootPath,boundaryRoot),present=ancestors.present,entries=[],membershipRows=[],socketReads=[];let count=0,total=0;
  if(present){owned(lstatSync(rootPath),true,rootPath);function walk(p,depth){if(depth>LIMIT.depth)authorityOwnerFailure('domain-depth');const before=lstatSync(p);owned(before,true,p);const nativeBefore=process.platform==='win32'?inspectWindowsOwnedAuthorityPath({path:p,directory:true}).nativeFactsSha256:null;const names=readdirSync(p).sort();membershipRows.push({path:relative(rootPath,p),identity:identity(before),names,...(nativeBefore?{nativeFactsSha256:nativeBefore}:{})});for(const name of names){if(++count>LIMIT.entries||!name||name==='.'||name==='..')authorityOwnerFailure('domain-entry-bound');const file=join(p,name),s=lstatSync(file);if(s.isDirectory()){walk(file,depth+1);continue;}const relativePath=relative(rootPath,file);const read=s.isSocket()?readPowerEndpoint({namespaceId,filePath:file,relativePath,classifyEntry}):readAuthoritySourceFile({namespaceId,filePath:file,semantic:({value,bytes})=>classifyEntry({path:file,relativePath,value,bytes})});if(s.isSocket())socketReads.push({file,relativePath,value:structuredClone(read.value),sourceFact:structuredClone(read.sourceFact)});total+=read.bytes.length;if(total>LIMIT.total)authorityOwnerFailure('domain-total-bound');entries.push({path:file,relativePath,value:read.value,sourceFact:read.sourceFact});}const after=lstatSync(p);if(nativeBefore&&nativeBefore!==inspectWindowsOwnedAuthorityPath({path:p,directory:true}).nativeFactsSha256)authorityOwnerFailure('domain-native-membership-race');if(!same(identity(before),identity(after))||!same(names,readdirSync(p).sort()))authorityOwnerFailure('domain-membership-race');}walk(rootPath,0);}else if(chain(rootPath,boundaryRoot))authorityOwnerFailure('domain-absence-race');
  for(const prior of socketReads){const fresh=readPowerEndpoint({namespaceId,filePath:prior.file,relativePath:prior.relativePath,classifyEntry});if(!same(prior.value,fresh.value)||!same(prior.sourceFact,fresh.sourceFact))authorityOwnerFailure('domain-socket-final-CAS');}
  if(!same(ancestors,observedChain(rootPath,boundaryRoot)))authorityOwnerFailure('domain-ancestor-race');
  const facts=entries.map(e=>e.sourceFact).sort((a,b)=>a.pathSha256.localeCompare(b.pathSha256));return {membership:{namespaceId,rootSha256:digest(rootPath),entrySetSha256:digest({present,ancestors,membershipRows,sourceFacts:facts,...(process.platform==='win32'?{nativeFacts:entries.map(e=>{const fact=nativeFactCustody.get(e.sourceFact);if(!fact)authorityOwnerFailure('domain-native-source-custody');return {pathSha256:e.sourceFact.pathSha256,nativeFactsSha256:fact};})}:{})}),entryCount:facts.length,sourceFacts:facts},entries};
}
export function actualAuthorityRepository(repository){const actual=inspectSignedDescriptorCustodyRepository(repository?.primaryRoot);if(!same(actual,repository))authorityOwnerFailure('domain-repository-drift');return actual;}
export function authorityRepositoryFromRoot(root){return inspectSignedDescriptorCustodyRepository(root);}
export function scanAuthorityDomain({rootPath,namespaceIds,classifyEntry}){
  const classifications=new Map(),read=readAuthorityNamespace({namespaceId:namespaceIds[0],rootPath,classifyEntry:entry=>{const classified=classifyEntry(entry);if(!classified||!namespaceIds.includes(classified.namespaceId)||typeof classified.active!=='boolean'||!classified.semantic)authorityOwnerFailure('domain-classification');classifications.set(entry.relativePath,classified);return classified.semantic;}});
  const facts=read.entries.map(e=>({...e.sourceFact,namespaceId:classifications.get(e.relativePath).namespaceId})),activeFacts=facts.filter((f,i)=>classifications.get(read.entries[i].relativePath).active);
  return {memberships:namespaceIds.map(namespaceId=>{const sourceFacts=facts.filter(f=>f.namespaceId===namespaceId);return {namespaceId,rootSha256:read.membership.rootSha256,entrySetSha256:digest({wholePhysicalMembership:read.membership.entrySetSha256,namespaceId,sourceFacts}),entryCount:sourceFacts.length,sourceFacts};}),activeFacts,entries:read.entries.map((e,i)=>({...e,rootPath,sourceFact:facts[i]}))};
}
export function mergeAuthoritySnapshots(snapshots,namespaceIds){return {memberships:namespaceIds.map(namespaceId=>{const rows=snapshots.flatMap(s=>s.memberships.filter(m=>m.namespaceId===namespaceId)),sourceFacts=rows.flatMap(m=>m.sourceFacts).sort((a,b)=>a.pathSha256.localeCompare(b.pathSha256));return {namespaceId,rootSha256:digest(rows.map(m=>m.rootSha256)),entrySetSha256:digest(rows.map(m=>m.entrySetSha256)),entryCount:sourceFacts.length,sourceFacts};}),activeFacts:snapshots.flatMap(s=>s.activeFacts),entries:snapshots.flatMap(s=>s.entries)};}
export function publishSourceOwnedAuthorityRoot({repository,producerId,rootPath,rootRecord}){
  const repo=actualAuthorityRepository(repository);if(!chain(rootPath)||realpathSync(rootPath)!==rootPath)authorityOwnerFailure('external-root-physical');owned(lstatSync(rootPath),true,rootPath);
  if(!/^[a-z][a-z0-9-]{2,79}$/.test(producerId)||!rootRecord||typeof rootRecord!=='object')authorityOwnerFailure('external-root-source-input');
  const file=join(repo.commonDir,'agent-pipeline',producerId,'external-roots',digest(rootPath)+'.json'),value={schema:'pipeline.source-owned-authority-root.v1',repositorySha256:digest({primaryRoot:repo.primaryRoot,commonDir:repo.commonDir}),rootPath,rootPathSha256:digest(rootPath),rootRecordSha256:digest(rootRecord)};
  const publishRoot=()=>{chain(dirname(file));privateParents(repo,file);try{const actual=readAuthoritySourceFile({namespaceId:'external-root',filePath:file,semantic:({value})=>value});if(!same(actual.value,value))authorityOwnerFailure('external-root-registration-CAS');return actual.sourceFact;}catch(e){if(e.code!=='ENOENT')throw e;publish(repo,file,value,null);return readAuthoritySourceFile({namespaceId:'external-root',filePath:file,semantic:({value})=>value}).sourceFact;}};
  const execution=transitionExecution.getStore();
  if(execution?.repositorySha256===digest({primaryRoot:repo.primaryRoot,commonDir:repo.commonDir})&&execution.enrollment?.registrationPathSha256===digest(file)&&execution.enrollment.externalRootPathSha256===digest(rootPath))return publishRoot();
  authorityOwnerFailure('external-root-source-transition-required');
}
export function classifyAuthorityLifetime({value,relativePath},producerId,namespaceId,repository){
  if(!value||Object.keys(value).sort().join(',')!==['schema','producerId','repositorySha256','bindingSha256','phase','identitySha256'].sort().join(',')||value.schema!=='pipeline.domain-authority-lifetime.v1'||value.producerId!==producerId||![value.repositorySha256,value.bindingSha256,value.identitySha256].every(v=>/^[a-f0-9]{64}$/.test(v))||relativePath.split(/[\\/]/).at(-1)!==value.bindingSha256+'.json'||(repository&&value.repositorySha256!==digest({primaryRoot:repository.primaryRoot,commonDir:repository.commonDir}))||!['armed','running','terminal-observed'].includes(value.phase))authorityOwnerFailure(producerId+':lifetime-shape');return {namespaceId,active:value.phase!=='terminal-observed',semantic:value};
}
function privateParents(repo,file){const path=dirname(file);if(!path.startsWith(repo.commonDir+sep))authorityOwnerFailure('domain-publication-root');let current=repo.commonDir;for(const segment of relative(current,path).split(sep)){current=join(current,segment);try{owned(lstatSync(current),true,current);}catch(e){if(e.code!=='ENOENT')throw e;if(process.platform==='win32')createWindowsOwnedAuthorityDirectory({path:current});else mkdirSync(current,{mode:0o700});owned(lstatSync(current),true,current);}}}
function publish(repo,file,value,expected){privateParents(repo,file);if(process.platform==='win32'){const bytes=Buffer.from(canonical(value)),key=digest({repository:{primaryRoot:repo.primaryRoot,commonDir:repo.commonDir},file}),prior=expected===null?null:nativePublicationCustody.get(key);if(expected!==null&&(!prior||prior.sha256!==expected))authorityOwnerFailure('domain-original-publication-witness-required');if(expected===null&&!nativePublicationCustody.has(key)&&nativePublicationCustody.size>=LIMIT.entries)authorityOwnerFailure('domain-publication-witness-bound');const published=publishWindowsOwnedAuthorityFile({path:file,bytes,expectedSha256:expected,expectedFacts:prior?.nativeFacts??null}),sha256=hash(bytes);nativePublicationCustody.set(key,Object.freeze({sha256,nativeFacts:published.nativeFacts}));return sha256;}let prior=null;function check(){if(expected===null){try{lstatSync(file);authorityOwnerFailure('domain-expected-absent');}catch(e){if(e.code!=='ENOENT')throw e;}}else{const actual=readAuthoritySourceFile({namespaceId:'lifetime',filePath:file,semantic:({value})=>value});if(actual.sourceFact.sha256!==expected||(prior&&!same(actual.sourceFact,prior)))authorityOwnerFailure('domain-publication-CAS');prior=actual.sourceFact;}}check();const bytes=Buffer.from(canonical(value)),temporary=file+'.tmp-'+randomBytes(16).toString('hex');let fd=openSync(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}check();renameSync(temporary,file);fd=openSync(dirname(file),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_DIRECTORY);try{fsyncSync(fd);}finally{closeSync(fd);}return hash(bytes);}

/** Each actual owner keeps this object private; exported domain predicates own the brand. */
export function createDomainAuthorityOwner({repository,producerId,kinds,namespaceIds,scan,terminalObservation,sourceModulePaths,transitionScope}){
  const repo=actualAuthorityRepository(repository),handles=new WeakMap(),activeTransitions=new WeakSet(),live=new Map(),lifetimeRoot=join(repo.commonDir,'agent-pipeline',producerId,'authority-lifetimes');
  if(typeof scan!=='function'||typeof terminalObservation!=='function'||typeof transitionScope!=='function'||!Array.isArray(sourceModulePaths)||!sourceModulePaths.length||new Set(sourceModulePaths).size!==sourceModulePaths.length)authorityOwnerFailure('domain-owner-input');
  const sourceContext=sourceModulePaths.map(readModuleContext);function assertContext(){assertModuleContext(sourceContext,sourceModulePaths,producerId);}
  const repoSha=digest({primaryRoot:repo.primaryRoot,commonDir:repo.commonDir});
  // A real reservation's narrow publication/advance window, never a retained live-map fallback.
  let initialLifetimeWindow=null;
  function readInitialMember(operation){
    const ref=operation.member?.memberRef;
    if(!operation.member?.memberHandle||!ref||Object.keys(ref).sort().join(',')!=='path,sha256,size'||typeof ref.path!=='string'||!/^\.git\/agent-pipeline\/session-authority\/members\/local-worker-supervisor\/member-[a-f0-9]{32}\.[1-9][0-9]*\.json$/.test(ref.path)||! /^[a-f0-9]{64}$/.test(ref.sha256)||!Number.isSafeInteger(ref.size)||ref.size<0)authorityOwnerFailure(producerId+':initial-member-ref');
    const filePath=join(repo.commonDir,ref.path.slice(5));
    const read=readAuthoritySourceFile({namespaceId:namespaceIds.at(-1),filePath,semantic:({value})=>value}),m=read.value;
    if(canonical(m)!==read.bytes.toString('utf8')||!m||m.schema!=='pipeline.session-authority-member.v1'||m.repositorySha256!==repoSha||m.producerId!==producerId||m.bindingSha256!==operation.binding||!same(m.association,{state:'unbound',target:null})||!same(m.kinds,kinds)||m.releaseRef!==null||ref.path!=='.git/agent-pipeline/session-authority/members/'+producerId+'/'+m.memberId+'.'+m.memberGeneration+'.json')authorityOwnerFailure(producerId+':initial-member-binding');
    return read;
  }
  function initialLifetimeRead(operation){
    const expected={schema:'pipeline.domain-authority-lifetime.v1',producerId,repositorySha256:repoSha,bindingSha256:operation.binding,phase:'armed',identitySha256:digest(operation.identity)};
    if(operation.file!==join(lifetimeRoot,operation.binding+'.json'))authorityOwnerFailure(producerId+':initial-lifetime-path');
    const read=readAuthoritySourceFile({namespaceId:namespaceIds.at(-1),filePath:operation.file,semantic:({value})=>value});
    if(read.sourceFact.sha256!==operation.sha256||!same(read.value,expected)||canonical(read.value)!==read.bytes.toString('utf8'))authorityOwnerFailure(producerId+':initial-lifetime-CAS');
    return read;
  }
  function readCurrentInitialLifetime(...args){
    if(args.length)authorityOwnerFailure(producerId+':initial-lifetime-input');
    const scope=operationScope.getStore(),operation=initialLifetimeWindow?.operation??(scope?.owner===port?handles.get(scope.handle):null);
    if(producerId!=='local-worker-supervisor'||!operation||operation.identity?.enrollment!==true)return null;
    assertContext();actualAuthorityRepository(repo);
    const active=()=>initialLifetimeWindow?.operation===operation||(operationScope.getStore()?.owner===port&&operationScope.getStore()?.handle===operation.handle);
    if(!active()||handles.get(operation.handle)!==operation||live.get(operation.binding)!==operation||operation.phase!=='armed'||Object.keys(operation.identity).sort().join(',')!=='enrollment,requestSha256,stateRoot'||! /^[a-f0-9]{64}$/.test(operation.identity.requestSha256)||typeof operation.identity.stateRoot!=='string'||!isAbsolute(operation.identity.stateRoot)||resolve(operation.identity.stateRoot)!==operation.identity.stateRoot||!operation.initialLifetimeFact||!operation.initialMember)authorityOwnerFailure(producerId+':initial-lifetime-unowned');
    const read=initialLifetimeRead(operation),member=readInitialMember(operation);
    if(!same(read.sourceFact,operation.initialLifetimeFact))authorityOwnerFailure(producerId+':initial-lifetime-physical-drift');
    const prior=operation.initialMember;
    const exactRef=member.sourceFact.sha256===operation.member.memberRef.sha256&&member.sourceFact.size===operation.member.memberRef.size;
    const priorRecord=same(member.value,prior.value)&&same(member.sourceFact,prior.sourceFact);
    const successor={...prior.value,phase:'armed',sourceFacts:[read.sourceFact],revision:prior.value.revision+1,updatedAt:member.value.updatedAt};
    const validTime=typeof member.value.updatedAt==='string'&&Number.isFinite(Date.parse(member.value.updatedAt))&&new Date(member.value.updatedAt).toISOString()===member.value.updatedAt&&member.value.updatedAt>=prior.value.updatedAt;
    // Registry advances atomically while reserve has not yet returned its new ref.
    if(initialLifetimeWindow?.operation===operation){if(!(exactRef&&priorRecord)&&!(validTime&&same(member.value,successor)))authorityOwnerFailure(producerId+':initial-member-advance-CAS');}
    else if(!exactRef||member.value.phase!=='armed'||!same(member.value.sourceFacts,[read.sourceFact]))authorityOwnerFailure(producerId+':initial-current-member-CAS');
    const again=initialLifetimeRead(operation),memberAgain=readInitialMember(operation);
    if(!active()||handles.get(operation.handle)!==operation||live.get(operation.binding)!==operation||operation.phase!=='armed'||!same(read.sourceFact,again.sourceFact)||!same(member.sourceFact,memberAgain.sourceFact))authorityOwnerFailure(producerId+':initial-witness-race');
    // Serializable observation only: no handle, member token, Buffer or authority grant.
    return structuredClone({identity:operation.identity,bindingSha256:operation.binding,sourceFact:read.sourceFact});
  }
  function observe(handle){const operation=handles.get(handle);if(!operation)authorityOwnerFailure(producerId+':unowned-operation');actualAuthorityRepository(repo);const snapshot=scan();let facts=operation.legacyFact?[operation.legacyFact]:[];if(operation.file){const read=readAuthoritySourceFile({namespaceId:namespaceIds.at(-1),filePath:operation.file,semantic:({value})=>value});if(read.sourceFact.sha256!==operation.sha256)authorityOwnerFailure(producerId+':lifetime-CAS');const indexed=snapshot.memberships.flatMap(m=>m.sourceFacts).find(f=>f.pathSha256===read.sourceFact.pathSha256&&f.sha256===read.sourceFact.sha256);if(!indexed)authorityOwnerFailure(producerId+':lifetime-not-in-namespace');facts=[indexed,...(operation.effectFacts??[])];}return {association:{state:'unbound',target:null},kinds:[...kinds],phase:operation.phase,bindingSha256:operation.binding,sourceFacts:facts.sort((a,b)=>a.pathSha256.localeCompare(b.pathSha256))};}
  function legacyOperations(snapshot){return snapshot.activeFacts.filter(f=>![...live.values()].some(op=>op.file&&digest(op.file)===f.pathSha256||op.effectFacts?.some(owned=>same(owned,f)))).map(f=>{const handle=Object.freeze({});handles.set(handle,{phase:'armed',binding:digest({producerId,repoSha,legacy:f.pathSha256,semantic:f.semanticSha256}),legacyFact:f,file:null,sha256:null});return handle;});}
  const methods={
    readBaseline(){assertContext();actualAuthorityRepository(repo);const snapshot=scan();return {memberships:snapshot.memberships,legacyOperations:legacyOperations(snapshot)};},
    observeOperation:observe,
    observeTerminal(handle){const op=handles.get(handle);if(!op||op.phase!=='terminal-observed'||!op.terminalFacts?.length)authorityOwnerFailure(producerId+':terminal-unproved');const fresh=terminalObservation(op.result,op.identity);if(!fresh||!same(fresh.sourceFacts,op.terminalFacts))authorityOwnerFailure(producerId+':terminal-drift');return {terminal:fresh.terminal,sourceFacts:fresh.sourceFacts};},
    reconcile({producerRecord,memberRecords,releaseRecords}){actualAuthorityRepository(repo);const snapshot=scan();if(producerRecord?.producerId!==producerId||!Array.isArray(memberRecords)||!Array.isArray(releaseRecords))authorityOwnerFailure(producerId+':registry-shape');for(const m of memberRecords.filter(m=>m.phase!=='released')){if(m.producerId!==producerId||m.sourceFacts.some(f=>!snapshot.memberships.some(n=>n.sourceFacts.some(a=>same(a,f))))||m.phase==='reserved'&&!live.has(m.bindingSha256))authorityOwnerFailure(producerId+':unowned-retained-member');}for(const fact of snapshot.activeFacts){if(!memberRecords.some(m=>m.phase!=='released'&&m.sourceFacts.some(f=>same(f,fact))))authorityOwnerFailure(producerId+':unindexed-active-source');}return snapshot.memberships;},
    readAssurance(){assertContext();actualAuthorityRepository(repo);scan();return 'physical-readback';},
  };
  const port=Object.freeze(Object.fromEntries(Object.entries(methods).map(([name,method])=>[name,(...args)=>{assertContext();return method(...args);}])));
  function reserve(identity){const handle=Object.freeze({}),binding=digest({producerId,repoSha,identity,nonce:randomBytes(32).toString('hex')}),operation={phase:'reserved',handle,identity:structuredClone(identity),binding,file:null,sha256:null,result:null,terminalFacts:null,effectFacts:[],beforeFacts:scan().memberships.flatMap(m=>m.sourceFacts)};handles.set(handle,operation);live.set(binding,operation);const reserved=withSessionAuthorityBoundary({repository:repo},boundary=>reserveSessionAuthorityMember({boundary,producerPort:port,association:{state:'unbound',target:null},operationHandle:handle}));operation.member=reserved;if(producerId==='local-worker-supervisor'&&identity?.enrollment===true){const initial=readInitialMember(operation);if(initial.sourceFact.sha256!==reserved.memberRef.sha256||initial.sourceFact.size!==reserved.memberRef.size||initial.value.phase!=='reserved'||initial.value.sourceFacts.length!==0)authorityOwnerFailure(producerId+':initial-reservation-CAS');operation.initialMember={value:structuredClone(initial.value),sourceFact:structuredClone(initial.sourceFact)};}operation.file=join(lifetimeRoot,binding+'.json');const record={schema:'pipeline.domain-authority-lifetime.v1',producerId,repositorySha256:repoSha,bindingSha256:binding,phase:'armed',identitySha256:digest(identity)};withSessionAuthorityBoundary({repository:repo},boundary=>{operation.sha256=publish(repo,operation.file,record,null);operation.phase='armed';if(operation.initialMember){operation.initialLifetimeFact=initialLifetimeRead(operation).sourceFact;if(initialLifetimeWindow)authorityOwnerFailure(producerId+':initial-reservation-reentrant');initialLifetimeWindow={operation};}try{operation.member={...operation.member,...advanceSessionAuthorityMember({boundary,producerPort:port,memberHandle:reserved.memberHandle,expectedMemberRef:reserved.memberRef,operationHandle:handle})};}finally{if(initialLifetimeWindow?.operation===operation)initialLifetimeWindow=null;}});return handle;}
  function terminal(handle,result){const operation=handles.get(handle);if(!operation)authorityOwnerFailure(producerId+':unowned-terminal');const proof=terminalObservation(result,operation.identity);if(!proof?.sourceFacts?.length)return false;return withSessionAuthorityBoundary({repository:repo},boundary=>{operation.result=result;operation.terminalFacts=proof.sourceFacts;operation.phase='terminal-observed';const record={schema:'pipeline.domain-authority-lifetime.v1',producerId,repositorySha256:repoSha,bindingSha256:operation.binding,phase:'terminal-observed',identitySha256:digest({terminal:proof.terminal,sourceFacts:proof.sourceFacts})};operation.sha256=publish(repo,operation.file,record,operation.sha256);operation.member={...operation.member,...advanceSessionAuthorityMember({boundary,producerPort:port,memberHandle:operation.member.memberHandle,expectedMemberRef:operation.member.memberRef,operationHandle:handle})};const released=releaseSessionAuthorityMember({boundary,producerPort:port,memberHandle:operation.member.memberHandle,expectedMemberRef:operation.member.memberRef,terminalHandle:handle});operation.member={...operation.member,...released};live.delete(operation.binding);return true;});}
  function observeEffects(handle){const operation=handles.get(handle);if(!operation||(operation.phase!=='armed'&&!(operation.phase==='running'&&activeTransitions.has(operation))))authorityOwnerFailure(producerId+':effect-handle');return withSessionAuthorityBoundary({repository:repo},boundary=>{const current=scan().memberships.flatMap(m=>m.sourceFacts);operation.effectFacts=current.filter(f=>f.pathSha256!==digest(operation.file)&&!operation.beforeFacts.some(prior=>same(prior,f)));operation.phase='running';const record={schema:'pipeline.domain-authority-lifetime.v1',producerId,repositorySha256:repoSha,bindingSha256:operation.binding,phase:'running',identitySha256:digest({identity:operation.identity,effectFacts:operation.effectFacts})};operation.sha256=publish(repo,operation.file,record,operation.sha256);operation.member={...operation.member,...advanceSessionAuthorityMember({boundary,producerPort:port,memberHandle:operation.member.memberHandle,expectedMemberRef:operation.member.memberRef,operationHandle:handle})};});}
  function effectTransition(handle,effect){
    const writer=handles.get(handle);if(!writer||!live.has(writer.binding)||!writer.member?.memberRef||typeof effect!=='function')authorityOwnerFailure(producerId+':transition-writer');
    // Async native producers need their own source-owned settled journal phases.
    // Reject a declared async closure before any invocation or physical effect.
    if(effect.constructor?.name==='AsyncFunction')authorityOwnerFailure(producerId+':async-settled-phase-unavailable');
    return withSessionAuthorityBoundary({repository:repo},boundary=>{
      assertContext();actualAuthorityRepository(repo);
      const before=scan(),spec=transitionScope(writer.identity),sourceContextSha256=digest({repoSha,sourceContext,processId:process.pid,writerBinding:writer.binding});
      if(!spec||!Array.isArray(spec.mutablePaths)||!Array.isArray(spec.creations))authorityOwnerFailure(producerId+':source-transition-scope');
      // Existing-running refresh may publish only its own real lifetime inside this private ticket.
      const ownRunningLifetime=writer.phase==='running'&&activeTransitions.has(writer)?[writer.file]:[];
      if(ownRunningLifetime.length&&writer.file!==join(lifetimeRoot,writer.binding+'.json'))authorityOwnerFailure(producerId+':transition-running-lifetime-path');
      const mutablePathSha256s=[...new Set([...spec.mutablePaths,...ownRunningLifetime])].map(path=>{if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path)authorityOwnerFailure('domain-mutable-path');return digest(path);});
      const creations=spec.creations.map(row=>{if(typeof row.rootPath!=='string'||!isAbsolute(row.rootPath)||resolve(row.rootPath)!==row.rootPath||typeof row.relativePattern!=='string'||!row.relativePattern.startsWith('^')||!row.relativePattern.endsWith('$'))authorityOwnerFailure('domain-creation-scope');new RegExp(row.relativePattern);return {rootPathSha256:digest(row.rootPath),relativePattern:row.relativePattern};});
      let enrollment=null,externalBefore=[];
      if(spec.enrollment){const e=spec.enrollment;
        if(typeof e.registrationPath!=='string'||typeof e.rootPath!=='string'||!e.snapshot||!e.anchorSourceFact||!e.snapshot.entries.some(row=>same(row.sourceFact,e.anchorSourceFact))||!same([...new Set(e.snapshot.memberships.map(m=>m.namespaceId))].sort(),[...namespaceIds].sort()))authorityOwnerFailure('domain-enrollment-preimage');
        externalBefore=e.snapshot.entries;enrollment={registrationPathSha256:digest(e.registrationPath),externalRootPathSha256:digest(e.rootPath),externalPreimageMemberships:e.snapshot.memberships,anchorSourceFact:e.anchorSourceFact};
      }
      const retained=[...live.values()].filter(op=>op!==writer&&op.member?.memberRef);
      const observed=op=>({memberRef:op.member.memberRef,operationHandle:op.handle,...observe(op.handle)});
      const plan={entry:'pipeline.domain-authority-transition.v1',repositorySha256:repoSha,producerId,producerPort:port,writer:observed(writer),retainedMembers:retained.map(observed),memberships:before.memberships,writeScope:{namespaceIds:[...namespaceIds],mutablePathSha256s,creations,enrollment},sourceContextSha256};
      const ticket=Object.freeze({});
      const state={repository:repo,port,boundary,plan,before,externalBefore,writer,retained,spec,effect,executed:false,closed:false,terminal:null,refresh:null,assertContext,observe,scan};
      transitionTickets.set(ticket,state);
      const observation=controlledModelDomainActive.get(port);
      if(observation){if(observation.ticket!==null)observation.incomplete=true;else{observation.ticket=ticket;state.observation=observation;}}
      try{
        const result=executeSourceOwnedSessionAuthorityDomainTransition({boundary,transitionHandle:ticket});
        if(state.observation)try{controlledModelAfterExecution(state,ticket,result);}catch{state.observation.incomplete=true;}
        return result;
      }finally{
        state.closed=true;
        if(state.observation)try{controlledModelAfterClose(state,ticket);}catch{state.observation.incomplete=true;}
      }
    });
  }
  function transitionExisting(handle,effect){
    const operation=handles.get(handle),current=operationScope.getStore();
    if(!operation||!live.has(operation.binding)||!operation.member?.memberRef||!['armed','running'].includes(operation.phase)||activeTransitions.has(operation)||typeof effect!=='function'||effect.constructor?.name==='AsyncFunction'||(current?.owner===port&&current.handle!==handle))authorityOwnerFailure(producerId+':transition-existing-unowned');
    assertContext();actualAuthorityRepository(repo);activeTransitions.add(operation);
    try{return operationScope.run({owner:port,handle},()=>{
      const wasRunning=operation.phase==='running';
      const settledEffect=wasRunning?()=>{
        const result=effect();
        if(result&&typeof result.then==='function')authorityOwnerFailure(producerId+':async-settled-phase-unavailable');
        // Source-owned settled physical readback; no caller phase/facts/lifetime input.
        const current=scan().memberships.flatMap(m=>m.sourceFacts);
        const effects=current.filter(f=>f.pathSha256!==digest(operation.file)&&!operation.beforeFacts.some(prior=>same(prior,f)));
        const record={schema:'pipeline.domain-authority-lifetime.v1',producerId,repositorySha256:repoSha,bindingSha256:operation.binding,phase:'running',identitySha256:digest({identity:operation.identity,effectFacts:effects})};
        operation.sha256=publish(repo,operation.file,record,operation.sha256);
        return result;
      }:effect;
      const result=effectTransition(handle,settledEffect);
      if(result&&typeof result.then==='function')authorityOwnerFailure(producerId+':async-settled-phase-unavailable');
      // The private ticket already refreshed running source facts/member refs.
      if(!wasRunning)observeEffects(handle);
      return result;
    });}finally{activeTransitions.delete(operation);}
  }
  function preflightActivation(identity){
    if(producerId!=='model-family-host'||identity?.kind!=='activation')return;
    assertContext();actualAuthorityRepository(repo);
    const spec=transitionScope(identity);
    if(!spec||!Array.isArray(spec.mutablePaths)||spec.mutablePaths.length>4096)authorityOwnerFailure('domain-mutable-preflight-scope');
    const mutablePathSha256s=[...new Set(spec.mutablePaths)].map(path=>{
      if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path)authorityOwnerFailure('domain-mutable-preflight-path');return digest(path);
    });
    const ownedMembers=Object.freeze([...live.values()].filter(op=>op.member?.memberRef).map(op=>{
      const observation=observe(op.handle);
      return Object.freeze({memberRef:Object.freeze({...op.member.memberRef}),operationHandle:op.handle,
        association:Object.freeze({state:observation.association.state,target:observation.association.target?Object.freeze({...observation.association.target}):null}),
        kinds:Object.freeze([...observation.kinds]),phase:observation.phase,bindingSha256:observation.bindingSha256,
        sourceFacts:Object.freeze(observation.sourceFacts.map(f=>Object.freeze({...f,identity:Object.freeze({...f.identity})})))});
    }));
    const plan=Object.freeze({entry:'pipeline.domain-authority-mutable-preflight.v1',repositorySha256:repoSha,producerId,producerPort:port,mutablePathSha256s:Object.freeze(mutablePathSha256s),ownedMembers,sourceContextSha256:digest({repoSha,sourceContext,processId:process.pid,kind:'activation'})});
    return withSessionAuthorityBoundary({repository:repo},boundary=>{
      const handle=Object.freeze(Object.create(null)),state={repository:repo,port,assertContext,processId:process.pid,closed:false,observed:false,plan};
      domainMutablePreflights.set(handle,state);
      try{return assertSourceOwnedDomainAuthorityMutablePreflight({boundary,producerPort:port,preflightHandle:handle});}
      finally{state.closed=true;domainMutablePreflights.delete(handle);}
    });
  }

  function run(identity,effect,terminalProjection=null){if(typeof effect!=='function'||(terminalProjection!==null&&typeof terminalProjection!=='function'))authorityOwnerFailure('domain-effect');const current=operationScope.getStore();if(current?.owner===port)return effect();if(effect.constructor?.name==='AsyncFunction')authorityOwnerFailure(producerId+':async-settled-phase-unavailable');preflightActivation(identity);const handle=reserve(identity);const finish=result=>{observeEffects(handle);terminal(handle,terminalProjection?terminalProjection(result):result);return result;};return operationScope.run({owner:port,handle},()=>{let result;try{result=effectTransition(handle,effect);}catch(error){throw error;}return result&&typeof result.then==='function'?Promise.resolve(result).then(finish,error=>{observeEffects(handle);throw error;}):finish(result);});}
  const owner=Object.freeze({port,reserve,terminal,observeEffects,transitionExisting,run,readCurrentInitialLifetime,currentHandle(){const current=operationScope.getStore();return current?.owner===port?current.handle:null;},repository:repo});
  controlledModelDomainOwners.set(owner,{port,producerId,repository:repo,assertContext});
  return owner;
}


function ownedTransition(handle){const state=transitionTickets.get(handle);if(!state||state.closed)authorityOwnerFailure('domain-transition-unowned-or-closed');state.assertContext();actualAuthorityRepository(state.repository);return state;}
export function isOwnedDomainAuthorityTransitionHandle(handle,{repository,producerPort}){try{const state=ownedTransition(handle);return state.port===producerPort&&same(state.repository,actualAuthorityRepository(repository));}catch{return false;}}
export function observeDomainAuthorityTransition(handle){const state=ownedTransition(handle);if(state.executed)authorityOwnerFailure('domain-transition-replayed-plan');return state.plan;}
function entryMap(entries){const map=new Map();for(const entry of entries){const prior=map.get(entry.sourceFact.pathSha256);if(!entry.rootPath||relative(entry.rootPath,entry.path)!==entry.relativePath||entry.relativePath.split(sep).includes('..')||digest(entry.path)!==entry.sourceFact.pathSha256||prior&&!same(prior,entry))authorityOwnerFailure('domain-transition-entry-identity');map.set(entry.sourceFact.pathSha256,entry);}return map;}
function witness(entry){return {path:entry.path,rootPath:entry.rootPath,relativePath:entry.relativePath,sourceFact:entry.sourceFact};}
export function executeDomainAuthorityTransition(handle){
  const state=ownedTransition(handle);if(state.executed)authorityOwnerFailure('domain-transition-replay');
  if(!same(state.before, state.scan()))authorityOwnerFailure('domain-transition-before-drift');
  state.executed=true;
  if(state.observation)state.observation.count+=1;
  const result=transitionExecution.run({repositorySha256:state.plan.repositorySha256,enrollment:state.plan.writeScope.enrollment},state.effect);
  if(result&&typeof result.then==='function')authorityOwnerFailure('domain-transition-async-effect-held');
  state.assertContext();actualAuthorityRepository(state.repository);
  const after=state.scan(),before=entryMap([...state.before.entries,...state.externalBefore]),post=entryMap(after.entries),changedEntries=[],removedEntries=[];
  const mutable=new Set(state.plan.writeScope.mutablePathSha256s),creations=state.plan.writeScope.creations;
  for(const [path,row] of post){const prior=before.get(path);if(prior&&same(prior.sourceFact,row.sourceFact))continue;
    if(prior&&!mutable.has(path))authorityOwnerFailure('domain-transition-unscoped-change');
    if(!prior&&!creations.some(c=>c.rootPathSha256===digest(row.rootPath)&&new RegExp(c.relativePattern).test(row.relativePath))&&path!==state.plan.writeScope.enrollment?.registrationPathSha256)authorityOwnerFailure('domain-transition-unscoped-creation');
    changedEntries.push(witness(row));
  }
  for(const [path,row] of before)if(!post.has(path)){if(!mutable.has(path))authorityOwnerFailure('domain-transition-unscoped-removal');removedEntries.push(witness(row));}
  // Enrolled old rows become newly observed catalogue rows, with their genuine
  // physical preimage witnesses; they are not forged fresh-file creations.
  for(const row of state.externalBefore)if(!state.before.entries.some(prior=>prior.path===row.path)&&!changedEntries.some(changed=>changed.path===row.path)){const actual=post.get(row.sourceFact.pathSha256);if(!actual||!same(actual.sourceFact,row.sourceFact))authorityOwnerFailure('domain-enrollment-existing-source-drift');changedEntries.push(witness(actual));}
  const affected=new Set([...changedEntries,...removedEntries].map(row=>row.sourceFact.pathSha256));
  const update=op=>{op.effectFacts=(op.effectFacts??[]).flatMap(fact=>{if(!affected.has(fact.pathSha256))return [fact];const actual=post.get(fact.pathSha256);return actual?[actual.sourceFact]:[];});};
  for(const op of state.retained)update(op);
  update(state.writer);for(const row of changedEntries)if(row.sourceFact.pathSha256!==digest(state.writer.file)&&!state.writer.effectFacts.some(f=>same(f,row.sourceFact)))state.writer.effectFacts.push(row.sourceFact);
  const observations=[state.writer,...state.retained].map(op=>({memberRef:op.member.memberRef,operationHandle:op.handle,...state.observe(op.handle)}));
  state.terminal={entry:state.plan.entry,repositorySha256:state.plan.repositorySha256,producerId:state.plan.producerId,producerPort:state.port,memberships:after.memberships,memberObservations:observations,changedEntries,removedEntries,result,sourceContextSha256:state.plan.sourceContextSha256};
  return result;
}
export function observeDomainAuthorityTransitionTerminal(handle){const state=ownedTransition(handle);if(!state.executed||!state.terminal||!same(state.terminal.memberships,state.scan().memberships))authorityOwnerFailure('domain-transition-terminal-unavailable-or-drift');return state.terminal;}
export function refreshDomainAuthorityTransitionRefs(handle,{boundary}){
  const state=ownedTransition(handle);if(boundary!==state.boundary||!state.terminal||state.refresh)authorityOwnerFailure('domain-transition-refresh-context');
  const actual=inspectSourceOwnedSessionAuthorityDomainTransitionRefresh({boundary,producerPort:state.port,transitionHandle:handle});
  if(!actual||Object.keys(actual).join(',')!=='memberUpdates'||!Array.isArray(actual.memberUpdates))authorityOwnerFailure('domain-transition-refresh-shape');
  const ops=[state.writer,...state.retained],expected=ops.map(op=>op.member.memberRef);
  if(actual.memberUpdates.length!==expected.length||new Set(actual.memberUpdates.map(row=>digest(row.beforeMemberRef))).size!==expected.length)authorityOwnerFailure('domain-transition-refresh-members');
  for(const op of ops){const update=actual.memberUpdates.find(row=>same(row.beforeMemberRef,op.member.memberRef));if(!update||!update.memberRef)authorityOwnerFailure('domain-transition-refresh-missing');op.member={...op.member,memberRef:update.memberRef};}
  state.refresh=actual;
  if(state.observation){
    const observation=state.observation;
    try{
      const before=digest(state.scan().memberships);
      const row=observeSourceOwnedControlledModelTransitionRefresh({boundary,transitionHandle:handle,observationHandle:observation.handle});
      if(!row)observation.incomplete=true;else observation.rows.push(row);
      observation.conserved=observation.conserved&&before===digest(state.scan().memberships);
    }catch{observation.incomplete=true;}
  }
  return actual;
}

// Fixed controlled-method observations; no caller supplies a ticket or writer.
const controlledModelDomainOwners = new WeakMap();
const controlledModelDomainObservations = new WeakMap();
const controlledModelDomainActive = new WeakMap();
const controlledModelObservationIds = Object.freeze(['ticket-replay','wrong-port','wrong-repository','wrong-boundary','late-refresh','source-module-drift']);
function assertModuleContext(expected, paths, producerId) {
  if (!same(expected, paths.map(readModuleContext))) authorityOwnerFailure(producerId + ':module-context-drift');
}
export function createControlledDomainTransitionObservation({owner,counterpartOwner}) {
  const primary = controlledModelDomainOwners.get(owner), secondary = controlledModelDomainOwners.get(counterpartOwner);
  if (!primary || !secondary || primary.producerId !== 'model-family-host' || secondary.producerId !== 'model-family-host') throw new TypeError('genuine Model lifecycle pair required');
  primary.assertContext(); secondary.assertContext();
  const repo = actualAuthorityRepository(primary.repository), other = actualAuthorityRepository(secondary.repository);
  if (repo.primaryRoot === other.primaryRoot || repo.commonDir === other.commonDir) throw new TypeError('distinct Model repositories required');
  const modulePath = fileURLToPath(import.meta.url), captured = readModuleContext(modulePath), bytes = readFileSync(modulePath);
  if (bytes.length !== captured.size || hash(bytes) !== captured.sha256 || !same(captured,readModuleContext(modulePath))) authorityOwnerFailure('model-observation-module-copy-CAS');
  const file = join(repo.commonDir,'agent-pipeline','controlled-model-transition-observations',randomBytes(24).toString('hex'),'subject.mjs');
  privateParents(repo,join(dirname(dirname(file)),'parent-check'));
  if(process.platform==='win32'){createWindowsOwnedAuthorityDirectory({path:dirname(file)});publishWindowsOwnedAuthorityFile({path:file,bytes,expectedSha256:null,expectedFacts:null});}else{
  mkdirSync(dirname(file),{mode:0o700});owned(lstatSync(dirname(file)),true);
  const fd = openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try { writeFileSync(fd,bytes);fsyncSync(fd); } finally { closeSync(fd); }
  const directoryFd=openSync(dirname(file),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_DIRECTORY);
  try{fsyncSync(directoryFd);}finally{closeSync(directoryFd);}
  }
  const subject = readModuleContext(file);
  if(subject.sha256!==captured.sha256||subject.size!==bytes.length)authorityOwnerFailure('model-observation-subject-copy-CAS');
  const handle=Object.freeze(Object.create(null));
  controlledModelDomainObservations.set(handle,{handle,owner,primary,secondary,repository:repo,counterpartRepository:other,subjectPath:file,subject,used:false,settled:false,active:false,rows:[],count:0,result:null,resultObserved:false,resultIdentity:false,conserved:true,callbackCount:0,ticket:null,incomplete:false});
  return handle;
}
export function beginControlledDomainTransitionObservation(handle) {
  const held=controlledModelDomainObservations.get(handle);
  if(!held||held.used||controlledModelDomainActive.has(held.primary.port))throw new TypeError('unused owned Model observation required');
  held.primary.assertContext();held.secondary.assertContext();actualAuthorityRepository(held.repository);actualAuthorityRepository(held.counterpartRepository);
  if(!same(held.subject,readModuleContext(held.subjectPath)))authorityOwnerFailure('model-observation-subject-preimage');
  held.used=true;held.active=true;controlledModelDomainActive.set(held.primary.port,held);
}
export function finishControlledDomainTransitionObservation(handle,result) {
  const held=controlledModelDomainObservations.get(handle);
  if(!held||!held.used||!held.active)throw new TypeError('active owned Model observation required');
  held.resultIdentity=held.resultObserved&&held.result===result;
  held.settled=true;held.active=false;controlledModelDomainActive.delete(held.primary.port);
}
export function isOwnedControlledDomainTransitionObservation(handle,{repository,transitionHandle,boundary}) {
  const held=controlledModelDomainObservations.get(handle),state=transitionTickets.get(transitionHandle);
  if(!held||!held.active||held.ticket!==transitionHandle||!state||state.observation!==held||state.boundary!==boundary||state.port!==held.primary.port)return false;
  try {held.primary.assertContext();held.secondary.assertContext();return same(held.repository,actualAuthorityRepository(repository));}catch{return false;}
}
function controlledModelSnapshot(state,handle) {
  return digest({model:state.scan().memberships,registry:readSourceOwnedControlledModelTransitionSnapshot({boundary:state.boundary,transitionHandle:handle,observationHandle:state.observation.handle})});
}
function controlledModelProbe(state,handle,id,stage,action) {
  const held=state.observation;if(!held||held.incomplete)return;
  const before=controlledModelSnapshot(state,handle);let refusal=null;
  try {action();held.incomplete=true;} catch(error) {
    const allowed={
      'ticket-replay':['SDC-AUTHORITY-CAS','domain-transition-replay'],
      'late-refresh':['SDC-AUTHORITY-UNAVAILABLE','domain-transition-unowned-or-closed'],
      'source-module-drift':['SDC-AUTHORITY-UNAVAILABLE','model-family-host:module-context-drift'],
      'wrong-boundary':['SDC-ROOT','nested-boundary-repository'],
    }[id];
    if(error?.name==='SessionAuthorityError'&&allowed&&error.code===allowed[0]&&error.reason===allowed[1])refusal={id,stage,outcome:'refused',errorName:error.name,code:error.code,reason:error.reason};
    else held.incomplete=true;
  }
  held.conserved=held.conserved&&before===controlledModelSnapshot(state,handle);
  if(refusal)held.rows.push(refusal);
}
function controlledModelAfterExecution(state,handle,result) {
  const held=state.observation;if(!held)return;
  held.result=result;held.resultObserved=true;
  controlledModelProbe(state,handle,'ticket-replay','after-original-execution-before-ticket-close',()=>executeSourceOwnedSessionAuthorityDomainTransition({boundary:state.boundary,transitionHandle:handle}));
  const before=controlledModelSnapshot(state,handle);
  held.secondary.assertContext();const foreign=actualAuthorityRepository(held.counterpartRepository);
  if(isOwnedDomainAuthorityTransitionHandle(handle,{repository:foreign,producerPort:state.port})===false)held.rows.push({id:'wrong-repository',stage:'actual-source-owned-repository-port-predicate',outcome:'refused',errorName:null,code:null,reason:null});
  else held.incomplete=true;
  held.conserved=held.conserved&&before===controlledModelSnapshot(state,handle);
  controlledModelProbe(state,handle,'wrong-boundary','nested-foreign-boundary-before-callback',()=>withSessionAuthorityBoundary({repository:foreign},()=>{held.callbackCount+=1;isOwnedDomainAuthorityTransitionHandle(handle,{repository:foreign,producerPort:held.secondary.port});}));
  const subjectBefore=readModuleContext(held.subjectPath);
  if(!same(subjectBefore,held.subject))authorityOwnerFailure('model-observation-subject-drift-before-probe');
  const fd=openSync(held.subjectPath,constants.O_WRONLY|constants.O_APPEND|constants.O_NOFOLLOW);
  try {const opened=fstatSync(fd);if(!same(identity(opened),held.subject.identity)||opened.size!==held.subject.size)authorityOwnerFailure('model-observation-subject-FD-CAS');writeFileSync(fd,'\n// controlled-method custody observation only\n');fsyncSync(fd);}finally{closeSync(fd);}
  controlledModelProbe(state,handle,'source-module-drift','after-source-context-capture-before-revalidation',()=>assertModuleContext([held.subject],[held.subjectPath],'model-family-host'));
  held.primary.assertContext();held.secondary.assertContext();
}
function controlledModelAfterClose(state,handle) {
  if(state.observation)controlledModelProbe(state,handle,'late-refresh','after-refresh-and-ticket-finally-close',()=>refreshDomainAuthorityTransitionRefs(handle,{boundary:state.boundary}));
}
export function readControlledDomainTransitionObservation(handle) {
  const held=controlledModelDomainObservations.get(handle);
  if(!held||!held.settled||held.incomplete||held.count!==1||!held.resultIdentity||!held.conserved||held.callbackCount!==0||held.rows.length!==controlledModelObservationIds.length||new Set(held.rows.map(row=>row.id)).size!==held.rows.length||controlledModelObservationIds.some(id=>!held.rows.some(row=>row.id===id)))return null;
  try{held.primary.assertContext();held.secondary.assertContext();actualAuthorityRepository(held.repository);actualAuthorityRepository(held.counterpartRepository);}catch{return null;}
  const rows=controlledModelObservationIds.map(id=>Object.freeze({...held.rows.find(row=>row.id===id)}));
  return Object.freeze({schema:'pipeline.model-transition-observation.v1',caseId:'I08T011',observations:Object.freeze(rows),originalEffectCount:held.count,originalResultIdentityPreserved:held.resultIdentity,protectedHistoryConserved:held.conserved,wrongBoundaryCallbackReachCount:held.callbackCount,assurance:'controlled-unit-method'});
}

// Inert implementation draft. Issuing happens only inside the original owner closure.
const domainMutablePreflights=new WeakMap();
function ownedMutablePreflight(handle){
  const state=domainMutablePreflights.get(handle);
  if(!state||state.closed||state.processId!==process.pid)authorityOwnerFailure('domain-mutable-preflight-unowned-or-closed');
  state.assertContext();actualAuthorityRepository(state.repository);return state;
}
export function isOwnedDomainAuthorityMutablePreflightHandle(handle,{repository,producerPort}){
  try{const state=ownedMutablePreflight(handle);return !state.observed&&state.port===producerPort&&same(state.repository,actualAuthorityRepository(repository));}catch{return false;}
}
export function observeDomainAuthorityMutablePreflight(handle){
  const state=ownedMutablePreflight(handle);
  if(state.observed)authorityOwnerFailure('domain-mutable-preflight-replayed');
  state.observed=true;return state.plan;
}
