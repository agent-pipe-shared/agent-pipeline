// SPDX-License-Identifier: SUL-1.0
/** Source-method requester capabilities; serialized observations never issue handles. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, readSync, readdirSync, realpathSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { canonical } from './po-approval-proof.mjs';
import { discoverRepository, loadSessionDescriptor, startSessionDescriptor } from './worktree-lifecycle.mjs';
import * as retiredDescriptorOwner from './worktree-lifecycle.mjs';
import { observeLinuxProcess, sameProcess as sameLinuxProcess, hostDigest as processArgvDigest } from './codex-host-process-journal.mjs';
import { sameNativeDarwinProcess, assertDarwinInheritedRequesterSocket } from './darwin-native-process-observer.mjs';
import { observeNativePlatformProcess } from './native-platform-process-observer.mjs';
import * as managedRequesterOwner from './codex-host-process-journal.mjs';
import * as continuityVerificationIssuer from './onboarding-continuity.mjs';
import * as windowsRequesterRuntime from './windows-requester-runtime.mjs';
import { observeNativeWindowsProcess, sameNativeWindowsProcess } from './windows-native-process-observer.mjs';
import { readWindowsAuthoritySourceModule, readWindowsOwnedAuthorityFile, observeWindowsAuthorityAncestor, inspectWindowsAuthoritySourceImage, createWindowsOwnedAuthorityDirectory, inspectWindowsOwnedAuthorityPath } from './windows-owned-authority-backend.mjs';
import { parseStrictJson } from './governance-event.mjs';
import { derivePlanLifecycle as deriveApprovedControllerPlanLifecycle } from './plan-spec-state-v2.mjs';
import { readAcceptedDeliveryContract as readApprovedControllerAcceptedContract } from '../scripts/pipeline-state.mjs';
import { validateVerifySuiteReceipt } from './verify-resume.mjs';
import { validateVerifyCaseCompletionPolicy, validateVerifyCaseCompletionAttestation, verifyCaseCompletionPolicySha256 } from './verify-case-completion-receipt.mjs';

const SHA = /^[a-f0-9]{64}$/u, ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/u;
const MAX = 16384, TIMEOUT = 2000;
const descriptors = new WeakMap(), invocations = new WeakMap(), ports = new WeakMap();
const requesters = new WeakMap(), children = new WeakMap(), transports = new WeakMap(), faults = new WeakMap();
const active = new AsyncLocalStorage(), faultScope = new AsyncLocalStorage();
const usedChannels = new Set(), ownedChildren = new WeakSet();
const powerChildCaptures=new WeakMap(), childOriginExchanges=new WeakMap();
const powerControllerCaptures=new Set();
const unavailable = () => ({ status: 'unavailable', code: 'SDC-REQUESTER-UNAVAILABLE' });
const hash = b => createHash('sha256').update(b).digest('hex');
const digest = v => hash(canonical(v));
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v, keys) => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const opaque = (map, value) => { const h=Object.freeze({}); map.set(h,value); return h; };
function fail(code='SDC-REQUESTER-UNAVAILABLE',reason='requester prerequisite') {
  const e=new Error(reason);e.name='SessionAuthorityError';e.code=code;e.reason=reason;throw e;
}
function repository(input) {
  if (!object(input) || typeof input.primaryRoot !== 'string' || typeof input.commonDir !== 'string') fail('SDC-ROOT');
  const actual=discoverRepository(input.primaryRoot);
  if (actual.primaryRoot!==input.primaryRoot || actual.commonDir!==input.commonDir) fail('SDC-ROOT');
  return input;
}
const repositoryHash = r => digest({primaryRoot:r.primaryRoot,commonDir:r.commonDir});
function sameRepository(a,b) { return a.primaryRoot===b.primaryRoot && a.commonDir===b.commonDir; }
function pathFor(r,path) {
  if (typeof path!=='string' || !path.startsWith('.git/') || path.includes('\\') || path.split('/').some(p=>p===''||p==='.'||p==='..')) fail('SDC-PRIVATE-PATH');
  const absolute=resolve(r.commonDir,path.slice(5));
  let cursor=r.commonDir;
  for (const part of relative(r.commonDir,absolute).split(sep)) {
    cursor=join(cursor,part);
    const s=lstatSync(cursor);
    if(s.isSymbolicLink() || realpathSync(cursor)!==cursor)fail('SDC-PRIVATE-PATH');
  }
  return absolute;
}
function observePosixProcess(pid){return observeNativePlatformProcess(pid);}
function sameProcess(a,b){return process.platform==='darwin'?sameNativeDarwinProcess(a,b):sameLinuxProcess(a,b);}
function observedPosixCwd(observed){return process.platform==='darwin'?currentProcess(observed).cwd:realpathSync('/proc/'+observed.pid+'/cwd');}
function observedPosixArgv(observed){
  if(process.platform==='darwin')return [...currentProcess(observed).argv];
  const bytes=readFileSync('/proc/'+observed.pid+'/cmdline');if(bytes.length>65536)osvFail('OSV-INPUT-DRIFT');
  const argv=new TextDecoder('utf-8',{fatal:true}).decode(bytes).split('\0');
  if(argv.pop()!=='')osvFail('OSV-INPUT-DRIFT');return argv;
}
function privateDirectory(path) {
  const s=lstatSync(path);
  if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(path)!==path
    ||!['linux','darwin'].includes(process.platform)||s.uid!==process.getuid()||(s.mode&0o077)!==0)fail('SDC-PRIVATE-PATH');
}
function ensureNamespace(r) {
  if(process.platform==='win32'){windowsRequesterRuntime.ensureWindowsRequesterNamespace(osvWindowsStorage(r));return join(r.commonDir,'agent-pipeline','run','session-requesters');}
  let cursor=r.commonDir;
  for(const part of ['agent-pipeline','run','session-requesters']) {
    cursor=join(cursor,part);
    if(!existsSync(cursor))mkdirSync(cursor,{mode:0o700});
    const s=lstatSync(cursor);
    if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(cursor)!==cursor||s.uid!==process.getuid()
      ||(s.mode&0o022)!==0)fail('SDC-PRIVATE-PATH');
    if(part==='session-requesters')privateDirectory(cursor);
  }
  for(const child of ['transports','invocations']) {
    const path=join(cursor,child);if(!existsSync(path))mkdirSync(path,{mode:0o700});privateDirectory(path);
  }
  return cursor;
}
function identity(s) {return {dev:s.dev,ino:s.ino,mode:s.mode,nlink:s.nlink,size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs};}
function readPrivate(r,ref) {
  if(process.platform==='win32')return osvWindowsPrivate(r,ref).bytes;
  if(!exact(ref,['path','sha256','size'])||!SHA.test(ref.sha256)||!Number.isSafeInteger(ref.size)||ref.size<0||ref.size>MAX)fail('SDC-PRIVATE-PATH');
  const path=pathFor(r,ref.path),before=lstatSync(path);
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.uid!==process.getuid()||(before.mode&0o077)!==0||before.size>MAX)fail('SDC-PRIVATE-PATH');
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  let bytes;
  try {if(canonical(identity(fstatSync(fd)))!==canonical(identity(before)))fail('SDC-PRIVATE-PATH');bytes=readFileSync(fd);
    if(canonical(identity(fstatSync(fd)))!==canonical(identity(before)))fail('SDC-PRIVATE-PATH');}
  finally {closeSync(fd);}
  if(canonical(identity(lstatSync(path)))!==canonical(identity(before))||bytes.length!==ref.size||hash(bytes)!==ref.sha256)fail('SDC-AUTHORITY-CAS');
  return bytes;
}
function publish(r,path,value) {
  if(process.platform==='win32'){
    const result=windowsRequesterRuntime.publishWindowsRequesterPrivateRecord({storage:osvWindowsStorage(r),path:'.git/'+relative(r.commonDir,path).split(sep).join('/'),value,expectedRef:null});
    osvWindowsRemember(r,result.ref,result.nativeFactsSha256);return result.ref;
  }
  const bytes=Buffer.from(canonical(value)+'\n');if(bytes.length>MAX)fail('SDC-AUTHORITY-UNAVAILABLE');
  const parent=dirname(path);privateDirectory(parent);
  const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
  const directory=openSync(parent,constants.O_RDONLY|constants.O_DIRECTORY);try{fsyncSync(directory);}finally{closeSync(directory);}
  const ref={path:'.git/'+relative(r.commonDir,path).split(sep).join('/'),sha256:hash(bytes),size:bytes.length};readPrivate(r,ref);return ref;
}
function processIdentity(p) {
  if(p?.platform==='win32')return {pid:p.pid,startIdentitySha256:digest({start:p.start,bootIdentity:p.bootIdentity})};
  if(!p||['Z','X'].includes(p.state))fail();
  return {pid:p.pid,startIdentitySha256:digest({start:p.start,bootSha256:p.bootSha256})};
}
function currentProcess(expected) {if(expected?.platform==='win32'){const observed=osvObservedProcess(expected.pid);if(!osvSameProcess(expected,observed))fail();return observed;}const observed=observePosixProcess(expected.pid);if(!sameProcess(expected,observed))fail();return observed;}
function descriptor(r,handle) {
  const entry=descriptors.get(handle);if(!entry||!sameRepository(r,entry.repository))fail('SDC-DESCRIPTOR-CAS');
  const loaded=loadSessionDescriptor(r.primaryRoot,entry.sessionId,{expectedDescriptorSha256:entry.descriptorSha256});
  if(hash(loaded.ownerNonce)!==entry.ownerNonceSha256)fail('SDC-DESCRIPTOR-CAS');return entry;
}
export function createSourceOwnedDescriptorHandle(input) {
  if(!exact(input,['repository','sessionId','expectedDescriptorSha256','ownerNonceFile'])||input.ownerNonceFile!==null
    ||!ID.test(input.sessionId)||!SHA.test(input.expectedDescriptorSha256))fail('SDC-DESCRIPTOR-CAS');
  const r=repository(input.repository),loaded=loadSessionDescriptor(r.primaryRoot,input.sessionId,{expectedDescriptorSha256:input.expectedDescriptorSha256});
  return opaque(descriptors,{repository:r,sessionId:loaded.sessionId,descriptorSha256:loaded.descriptorSha256,ownerNonceSha256:hash(loaded.ownerNonce)});
}
/** Internal read-only registry join, never an invocation or native credential. */
export function inspectSourceOwnedDescriptorHandle({repository:input,descriptorHandle}) {
  const d=descriptor(repository(input),descriptorHandle);
  return Object.freeze({sessionId:d.sessionId,descriptorSha256:d.descriptorSha256,ownerNonceSha256:d.ownerNonceSha256});
}
function observeInvocation(handle,port) {
  const p=ports.get(port),i=invocations.get(handle);
  if(!p||!i||i.port!==port||p.disposed||!sameRepository(p.repository,i.repository))fail();
  if(i.sourceOwnerRecheck)i.sourceOwnerRecheck();
  currentProcess(i.process);readPrivate(i.repository,i.sourceRef);
  return {producerId:i.producerId,invocationBindingSha256:i.invocationBindingSha256,sourceRef:i.sourceRef,
    controllerIdentity:processIdentity(i.process),assurance:i.assurance};
}
function runtimePortFor(state) {
  let port;
  port=Object.freeze({
    observeCurrentInvocation:handle=>{try{return observeInvocation(handle,port);}catch{return unavailable();}},
    observeChildInvocation:handle=>{try{
      const child=children.get(handle);if(!child||child.runtimePort!==port||child.closed)fail();
      currentProcess(child.process);readPrivate(child.repository,child.sourceRef);
      return {invocationBindingSha256:child.invocationBindingSha256,sourceRef:child.sourceRef,childIdentity:processIdentity(child.process)};
    }catch{return unavailable();}},
    recheckCurrentBinding:({requesterHandle,bindingRef,transportRef})=>{try{
      const e=requesters.get(requesterHandle);if(!e||e.runtimePort!==port||canonical(bindingRef)!==canonical(e.bindingRef)
        ||canonical(transportRef)!==canonical(e.transportRef))fail();checkRequester(e);
      if(e.child)return {invocationBindingSha256:e.child.transport.childInvocationBindingSha256,
        sourceRef:e.child.sourceRef,childIdentity:processIdentity(e.child.process)};
      return observeInvocation(e.currentInvocationHandle,port);
    }catch{return unavailable();}},
  });
  ports.set(port,state);return port;
}
function nextGeneration(r,sessionId) {
  const root=ensureNamespace(r);let max=0;
  for(const name of readdirSync(root))if(name.startsWith(sessionId+'.')){
    const m=new RegExp('^'+sessionId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\.([1-9][0-9]*)\\.json$','u').exec(name);
    if(!m||!Number.isSafeInteger(Number(m[1])))fail('SDC-AUTHORITY-CAS');max=Math.max(max,Number(m[1]));
  }
  if(!Number.isSafeInteger(max+1))fail('SDC-AUTHORITY-CAS');return max+1;
}
function binding(r,d,invocation,transportSha256,generation) {
  return {schema:'pipeline.session-requester-binding.v1',repositorySha256:repositoryHash(r),sessionId:d.sessionId,
    descriptorSha256:d.descriptorSha256,ownerNonceSha256:d.ownerNonceSha256,
    invocationBindingSha256:invocation.invocationBindingSha256,producerId:invocation.producerId,generation,transportSha256,
    controllerIdentity:invocation.controllerIdentity,sourceRef:invocation.sourceRef};
}
export function bindSourceOwnedRequesterInvocation(input,runtimePort) {
  if(!exact(input,['repository','descriptorHandle','currentInvocationHandle']))fail();
  const r=repository(input.repository),d=descriptor(r,input.descriptorHandle),observed=observeInvocation(input.currentInvocationHandle,runtimePort);
  const i=invocations.get(input.currentInvocationHandle);if(!sameRepository(r,i.repository))fail();
  const previous=i.requesterHandle && requesters.get(i.requesterHandle);
  if(previous){if(previous.descriptorHandle!==input.descriptorHandle)fail('SDC-DESCRIPTOR-CAS');checkRequester(previous);return {requesterHandle:i.requesterHandle,bindingRef:previous.bindingRef};}
  const capability=randomBytes(32).toString('hex'),generation=nextGeneration(r,d.sessionId);
  const value=binding(r,d,observed,hash(capability),generation);
  const bindingRef=publish(r,join(ensureNamespace(r),d.sessionId+'.'+generation+'.json'),value);
  const requesterHandle=opaque(requesters,{repository:r,descriptorHandle:input.descriptorHandle,runtimePort,
    currentInvocationHandle:input.currentInvocationHandle,bindingRef,binding:value,capability,transportRef:null});
  i.requesterHandle=requesterHandle;return {requesterHandle,bindingRef};
}
export function withSourceOwnedAuthorityContext({requesterHandle,runtimePort},callback) {
  const entry=requesters.get(requesterHandle);if(!entry||entry.runtimePort!==runtimePort||typeof callback!=='function')fail();
  checkRequester(entry);const lifetime={live:true},context=Object.freeze({requesterHandle,runtimePort,repository:entry.repository,lifetime});
  return active.run(context,()=>{try{
    const result=callback();if(result&&typeof result.then==='function')return Promise.resolve(result).finally(()=>{lifetime.live=false;});
    lifetime.live=false;return result;
  }catch(error){lifetime.live=false;throw error;}});
}
export function readSourceOwnedAuthorityContext({repository:input}) {
  const context=active.getStore();if(!context?.lifetime.live||!sameRepository(repository(input),context.repository))return unavailable();
  try{checkRequester(requesters.get(context.requesterHandle));return {status:'bound',requesterHandle:context.requesterHandle,runtimePort:context.runtimePort};}catch{return unavailable();}
}
function checkRequester(entry) {
  if(!entry)fail();const r=repository(entry.repository),p=ports.get(entry.runtimePort);if(!p||p.disposed)fail();
  descriptor(r,entry.descriptorHandle);const bytes=readPrivate(r,entry.bindingRef),value=JSON.parse(bytes);
  if(canonical(value)!==canonical(entry.binding))fail();readPrivate(r,value.sourceRef);
  if(entry.child){
    const c=entry.child;currentProcess(c.process);currentProcess(c.parent);
    const transport=JSON.parse(readPrivate(r,entry.transportRef));
    if(canonical(transport)!==canonical(c.transport))fail();
    if(c.powerModule){readPrivate(r,c.sourceRef);if(canonical(powerControllerModule())!==canonical(c.powerModule))fail();}
    if(c.managedOriginHandle){managedOwnerPorts();const fresh=managedRequesterOwner.inspectManagedCodexRequesterChildOrigin({repository:r,originHandle:c.managedOriginHandle});
      sameOrigin(c.originObservation,fresh);}
  }else{
    const observed=observeInvocation(entry.currentInvocationHandle,entry.runtimePort);
    if(observed.invocationBindingSha256!==value.invocationBindingSha256||canonical(observed.controllerIdentity)!==canonical(value.controllerIdentity))fail();
  }
  return value;
}
export function createSignedCleanupRequesterObserver({repository:input,requesterHandle}) {
  return ({repository:requested}) => {try {
    const r=repository(input);if(!sameRepository(r,repository(requested)))fail();
    const entry=requesters.get(requesterHandle);if(!entry||!sameRepository(r,entry.repository))fail();
    if(!entry.child&&(!active.getStore()?.lifetime.live||active.getStore()?.requesterHandle!==requesterHandle))fail();
    const b=checkRequester(entry);
    return {status:'bound',requester:{sessionId:b.sessionId,descriptorSha256:b.descriptorSha256,
      ownerNonceSha256:b.ownerNonceSha256,transportRef:entry.transportRef??entry.bindingRef,
      assurance:entry.child?entry.child.assurance:invocations.get(entry.currentInvocationHandle).assurance}};
  }catch{return unavailable();}};
}
export function createSourceOwnedChildRuntimePort({repository:input}) {
  const r=repository(input),actual=observePosixProcess(process.pid);
  return runtimePortFor({repository:r,process:actual,childReader:true,disposed:false});
}
export function captureSourceOwnedChildInvocation({repository:input,currentInvocationHandle,child,spawnRequest},runtimePort) {
  const r=repository(input),parent=invocations.get(currentInvocationHandle);observeInvocation(currentInvocationHandle,runtimePort);
  if(!ownedChildren.has(child)||!parent||!sameRepository(r,parent.repository))fail();
  const observed=observePosixProcess(child.pid);
  if(!observed||observed.parentPid!==process.pid||observed.executable!==realpathSync(spawnRequest.executablePath)
    ||observed.argvSha256!==processArgvDigest([spawnRequest.executablePath,...spawnRequest.args]))fail();
  const capture=powerChildCaptures.get(child);
  const source={schema:capture?.schema??'pipeline.controlled-requester-child-invocation.v1',repositorySha256:repositoryHash(r),
    parentInvocationSha256:parent.invocationBindingSha256,process:observed,spawnRequest,
    ...(capture?{powerControllerModule:capture.powerControllerModule,parentRequesterBindingRef:capture.parentRequesterBindingRef}:{})};
  const sourceRef=publish(r,join(ensureNamespace(r),'invocations','child-'+randomBytes(12).toString('hex')+'.json'),source);
  const childInvocationHandle=opaque(children,{repository:r,parent,runtimePort,child,process:observed,sourceRef,
    invocationBindingSha256:digest(source),closed:false,spawnRequest,powerCapture:capture});
  if(capture)powerControllerCaptures.add(children.get(childInvocationHandle));
  return {childInvocationHandle,sourceRef};
}
export function createRequesterTransport({requesterHandle,childInvocationHandle},runtimePort) {
  const e=requesters.get(requesterHandle),c=children.get(childInvocationHandle);if(!e||!c||c.runtimePort!==runtimePort
    ||e.runtimePort!==runtimePort||!sameRepository(e.repository,c.repository)||c.closed||c.transportHandle)fail();
  checkRequester(e);currentProcess(c.process);readPrivate(c.repository,c.sourceRef);
  if(c.parent!==invocations.get(e.currentInvocationHandle))fail();
  const r=e.repository,d=descriptor(r,e.descriptorHandle),observed=observeInvocation(e.currentInvocationHandle,runtimePort);
  const capability=randomBytes(32).toString('hex'),transportSha256=hash(capability),generation=nextGeneration(r,d.sessionId);
  const b=binding(r,d,observed,transportSha256,generation);
  const bindingRef=publish(r,join(ensureNamespace(r),d.sessionId+'.'+generation+'.json'),b);
  const transport={schema:'pipeline.session-requester-transport.v1',repositorySha256:repositoryHash(r),bindingRef,
    transportSha256,childInvocationBindingSha256:c.invocationBindingSha256,childIdentity:processIdentity(c.process),
    producerId:observed.producerId,generation};
  const transportRef=publish(r,join(ensureNamespace(r),'transports','transport-'+randomBytes(12).toString('hex')+'.json'),transport);
  const h=opaque(transports,{repository:r,capability,transportRef,transport,child:c,used:false});c.transportHandle=h;return h;
}
export function createRequesterTransportMethodFault({fault}) {
  if(!['capability-mismatch','second-frame','oversize'].includes(fault))fail();return opaque(faults,fault);
}
export function withRequesterTransportMethodFault({fault},callback) {
  if(!faults.has(fault)||!active.getStore()?.lifetime.live||typeof callback!=='function')fail();return faultScope.run(faults.get(fault),callback);
}
const POWER_CONTROLLER_SHA256 = 'fd9f8b837acd6b9008a40bed98b95eb40cc4c4006e8719539b92b7e8ed75921e';
const MANAGED_OWNER_PORTS=['createManagedCodexRequesterChildOrigin','observeManagedCodexRequesterChildOrigin',
  'readManagedCodexRequesterTransportOrigin','inspectManagedCodexRequesterChildOrigin'];
const ORIGIN_KEYS=['schema','repositorySha256','sourceRef','invocationBindingSha256','controllerIdentity',
  'operationBindingSha256','association','memberRefSha256','requesterBindingSha256','childSourceRef',
  'childInvocationBindingSha256','childIdentity','assurance'];
function managedOwnerPorts() {
  if(MANAGED_OWNER_PORTS.some(name=>typeof managedRequesterOwner[name]!=='function'))fail('SDC-REQUESTER-UNAVAILABLE','managed-child-owner-port');
}
function powerControllerModule() {
  const path=fileURLToPath(new URL('../scripts/session-power-controller.mjs',import.meta.url)),before=lstatSync(path);
  if(!before.isFile()||before.isSymbolicLink()||realpathSync(path)!==path||before.size>65536||(before.mode&0o022)!==0)fail();
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
  try{if(canonical(identity(fstatSync(fd)))!==canonical(identity(before)))fail();bytes=readFileSync(fd);
    if(canonical(identity(fstatSync(fd)))!==canonical(identity(before)))fail();}finally{closeSync(fd);}
  if(canonical(identity(lstatSync(path)))!==canonical(identity(before))||hash(bytes)!==POWER_CONTROLLER_SHA256)fail();
  return {path,sha256:POWER_CONTROLLER_SHA256,identity:identity(before)};
}
function originalRequesterSubject(entry,assurance) {
  const d=descriptor(entry.repository,entry.descriptorHandle);
  return {sessionId:d.sessionId,descriptorSha256:d.descriptorSha256,ownerNonceSha256:d.ownerNonceSha256,
    transportRef:{...entry.bindingRef},assurance};
}
function assertChildProducer(entry,powerModule) {
  const i=invocations.get(entry.currentInvocationHandle);if(!i)fail();
  observeInvocation(entry.currentInvocationHandle,entry.runtimePort);
  if(i.producerId==='controlled-unit-method'){
    const source=JSON.parse(readPrivate(entry.repository,i.sourceRef));
    if(i.assurance!=='controlled-unit-method'||!exact(source,['schema','repositorySha256','process','assurance','fixtureRoot','eventId'])
      ||source.schema!=='pipeline.controlled-requester-invocation.v1'||source.assurance!=='controlled-unit-method'
      ||source.repositorySha256!==repositoryHash(entry.repository)||digest(source)!==i.invocationBindingSha256
      ||!sameProcess(source.process,currentProcess(i.process)))fail();
    return;
  }
  if(i.producerId!=='managed-codex'||!powerModule||!i.managedInvocationHandle)fail();
  managedOwnerPorts();
  // The actual owning inspector must prove current task/member eligibility;
  // no serialized producer label or physical scan can substitute its handle.
  managedRequesterSource(entry.repository,i.managedInvocationHandle);
}
function fixedPowerCapture(c) {
  if(!c||c.closed||!c.powerCapture||!ownedChildren.has(c.child)||!c.powerCapture.lifetime.live)fail();
  const capture=c.powerCapture,e=requesters.get(capture.requesterHandle);
  if(!e||e.runtimePort!==c.runtimePort||e.currentInvocationHandle!==capture.currentInvocationHandle
    ||!sameRepository(e.repository,c.repository)||canonical(e.bindingRef)!==canonical(capture.parentRequesterBindingRef))fail();
  checkRequester(e);currentProcess(c.process);currentProcess(c.parent.process);
  const module=powerControllerModule();if(canonical(module)!==canonical(capture.powerControllerModule))fail();
  const source=JSON.parse(readPrivate(c.repository,c.sourceRef));
  if(!exact(source,['schema','repositorySha256','parentInvocationSha256','process','spawnRequest','powerControllerModule','parentRequesterBindingRef'])
    ||source.schema!==capture.schema||source.repositorySha256!==repositoryHash(c.repository)
    ||source.parentInvocationSha256!==c.parent.invocationBindingSha256||!sameProcess(source.process,c.process)
    ||canonical(source.powerControllerModule)!==canonical(module)||canonical(source.parentRequesterBindingRef)!==canonical(e.bindingRef)
    ||canonical(source.spawnRequest)!==canonical(c.spawnRequest)||digest(source)!==c.invocationBindingSha256)fail();
  return {capture,e,module};
}
export function inspectSourceOwnedRequesterChildInvocation(input) {
  if(!exact(input,['repository','childInvocationHandle','runtimePort']))fail();
  const r=repository(input.repository),c=children.get(input.childInvocationHandle);
  if(!c||c.runtimePort!==input.runtimePort||!sameRepository(c.repository,r))fail();
  const {e,module}=fixedPowerCapture(c),observed=observeInvocation(e.currentInvocationHandle,e.runtimePort);
  return Object.freeze({repository:r,controllerIdentity:Object.freeze({...currentProcess(c.parent.process)}),
    childIdentity:Object.freeze({...currentProcess(c.process)}),childInvocationBindingSha256:c.invocationBindingSha256,
    childSourceRef:Object.freeze({...c.sourceRef}),spawnRequest:Object.freeze(structuredClone(c.spawnRequest)),
    powerControllerModule:Object.freeze(structuredClone(module)),descriptor:Object.freeze(inspectSourceOwnedDescriptorHandle({repository:r,descriptorHandle:e.descriptorHandle})),
    currentRequester:Object.freeze(originalRequesterSubject(e,observed.assurance)),requesterBindingRef:Object.freeze({...e.bindingRef})});
}
const STARTUP_ACK_KEYS=['schema','type','activationNonce','adapterId','platform','hostBootId',
  'controllerPid','controllerStart','controllerExecutableSha256','childPid','childStart','childExecutableSha256','handleId','startedAt'];
const ACK_TIMEOUT=5000;
function executableBytesSha256(path,deadline) {
  const before=lstatSync(path);if(!before.isFile()||before.isSymbolicLink()||realpathSync(path)!==path)fail();
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW),hasher=createHash('sha256');let size=0;
  try{if(canonical(identity(before))!==canonical(identity(fstatSync(fd))))fail();
    const buffer=Buffer.alloc(65536);while(true){if(performance.now()>deadline)fail();const n=readSync(fd,buffer,0,buffer.length,null);
      if(n===0)break;size+=n;if(size>before.size)fail();hasher.update(buffer.subarray(0,n));}
    if(size!==before.size||canonical(identity(before))!==canonical(identity(fstatSync(fd))))fail();
  }finally{closeSync(fd);}
  if(canonical(identity(before))!==canonical(identity(lstatSync(path))))fail();return hasher.digest('hex');
}
function powerProcessProjection(process,deadline) {
  const observed=currentProcess(process),boot=readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim().toLowerCase();
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(boot)||hash(boot)!==observed.bootSha256)fail();
  const executableSha256=executableBytesSha256(observed.executable,deadline);currentProcess(observed);
  return {pid:observed.pid,start:'linux:'+boot+':'+observed.start,executableSha256,hostBootId:'linux:'+boot};
}
function controllerSelector(value,c,deadline) {
  if(!exact(value,['pid','start','executableSha256'])||!Number.isSafeInteger(value.pid)||value.pid<1
    ||typeof value.start!=='string'||!SHA.test(value.executableSha256))fail();
  const actual=powerProcessProjection(c.process,deadline);
  if(value.pid!==actual.pid||value.start!==actual.start||value.executableSha256!==actual.executableSha256)fail();return actual;
}
function capturedPowerController(r,selector,runtimePort,deadline) {
  let matched=null;
  for(const c of powerControllerCaptures){if(c.closed||!sameRepository(c.repository,r)||c.process.pid!==selector?.pid
      ||(runtimePort!==undefined&&c.runtimePort!==runtimePort))continue;
    fixedPowerCapture(c);controllerSelector(selector,c,deadline);if(matched)fail();matched=c;}
  if(!matched)fail();return matched;
}
// The actual Source writer emits an ordinary JSON.stringify line. Retain that
// insertion order, not sorted canonical JSON. Roundtrip parity also rejects
// duplicate (including escaped) keys without inventing a second JSON grammar.
function decodeStartupAcknowledgement(bytes) {
  if(bytes.length>MAX)fail();const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),value=JSON.parse(text);
  if(!text.endsWith('\n')||JSON.stringify(value)+'\n'!==text||!exact(value,STARTUP_ACK_KEYS)
    ||value.schema!=='pipeline.session-power-controller-ack.v1'||value.type!=='startup-ack'
    ||value.adapterId!=='linux-systemd-inhibit-v1'||value.platform!=='linux'
    ||!SHA.test(value.activationNonce)||!SHA.test(value.handleId)
    ||!Number.isSafeInteger(value.controllerPid)||value.controllerPid<1||!Number.isSafeInteger(value.childPid)||value.childPid<1
    ||typeof value.controllerStart!=='string'||typeof value.childStart!=='string'
    ||!SHA.test(value.controllerExecutableSha256)||!SHA.test(value.childExecutableSha256)
    ||typeof value.hostBootId!=='string'||typeof value.startedAt!=='string'
    ||!/^\d{4}-\d{2}-\d{2}T/u.test(value.startedAt)||!Number.isFinite(Date.parse(value.startedAt)))fail();
  return value;
}
function readCapturedStartupLine(channel,deadline) {
  return new Promise((resolveLine,reject)=>{
    let bytes=Buffer.alloc(0),settled=false;
    const timer=setTimeout(()=>done(new Error('Power startup acknowledgement timeout')),Math.max(1,deadline-performance.now()));
    function cleanup(){clearTimeout(timer);channel.off('readable',readable);channel.off('error',error);channel.off('end',end);channel.off('close',end);channel.pause();}
    function done(error,line){if(settled)return;settled=true;cleanup();if(error)reject(error);else resolveLine(line);}
    function readable(){try{
      if(performance.now()>deadline)fail();let chunk;
      while((chunk=channel.read())!==null){bytes=Buffer.concat([bytes,chunk]);const newline=bytes.indexOf(10);
        if(newline>=0){const line=bytes.subarray(0,newline+1),remainder=bytes.subarray(newline+1);if(line.length>MAX)fail();
          if(remainder.length)channel.unshift(remainder);done(null,line);return;}
        if(bytes.length>MAX)fail();}
    }catch(error){done(error);}}
    function error(){done(new Error('Power startup acknowledgement channel'));}
    function end(){done(new Error('Power startup acknowledgement ended'));}
    channel.pause();channel.on('readable',readable);channel.once('error',error);channel.once('end',end);channel.once('close',end);readable();
  });
}
function validateCapturedStartup(c,ack,deadline,expectedInhibitor=null) {
  fixedPowerCapture(c);const controller=powerProcessProjection(c.process,deadline);
  if(ack.controllerPid!==controller.pid||ack.controllerStart!==controller.start
    ||ack.controllerExecutableSha256!==controller.executableSha256||ack.hostBootId!==controller.hostBootId)fail();
  const inhibitor=observeLinuxProcess(ack.childPid);
  if(!inhibitor||inhibitor.parentPid!==c.process.pid||(expectedInhibitor&&!sameProcess(expectedInhibitor,inhibitor)))fail();
  const actual=powerProcessProjection(inhibitor,deadline);
  if(ack.childStart!==actual.start||ack.childExecutableSha256!==actual.executableSha256||ack.hostBootId!==actual.hostBootId)fail();
  return inhibitor;
}
/** Actual private fixed-child FD3 custody only; copied acknowledgements cannot enter. */
export async function readSourceOwnedSessionPowerControllerStartupAcknowledgement(input,runtimePort) {
  let c;
  try{
    if(!exact(input,['repository','controllerIdentity']))fail();const r=repository(input.repository),deadline=performance.now()+ACK_TIMEOUT;
    c=capturedPowerController(r,input.controllerIdentity,runtimePort,deadline);
    if(c.startupAckState!==undefined||!ports.has(runtimePort)||ports.get(runtimePort).disposed)fail();
    c.startupAckState='reading';const channel=c.child.stdio[3];
    if(!channel||channel.destroyed||!channel.readable||!channel.writable)fail();
    const bytes=await readCapturedStartupLine(channel,deadline),ack=decodeStartupAcknowledgement(bytes);
    controllerSelector(input.controllerIdentity,c,deadline);
    const inhibitor=validateCapturedStartup(c,ack,deadline);
    c.startupAckCustody={ack:Object.freeze(structuredClone(ack)),inhibitor:Object.freeze({...inhibitor}),
      frameSha256:hash(bytes),channel,child:c.child,runtimePort};c.startupAckState='observed';
    return structuredClone(c.startupAckCustody.ack);
  }catch{if(c&&c.startupAckState==='reading')c.startupAckState='refused';return unavailable();}
}
/** Original-parent physical observation; foreign processes cannot reconstruct custody. */
export function observeSourceOwnedSessionPowerControllerChild(input) {
  try{
    if(!exact(input,['repository','sessionId','expectedDescriptorSha256','controllerIdentity'])
      ||!ID.test(input.sessionId)||!SHA.test(input.expectedDescriptorSha256))fail();
    const r=repository(input.repository),deadline=performance.now()+ACK_TIMEOUT;
    const c=capturedPowerController(r,input.controllerIdentity,undefined,deadline),custody=c.startupAckCustody;
    if(c.startupAckState!=='observed'||!custody||custody.child!==c.child||custody.channel!==c.child.stdio[3]
      ||custody.runtimePort!==c.runtimePort)fail();
    validateCapturedStartup(c,custody.ack,deadline,custody.inhibitor);
    const {e,module}=fixedPowerCapture(c),source=observeInvocation(e.currentInvocationHandle,e.runtimePort);
    const d=inspectSourceOwnedDescriptorHandle({repository:r,descriptorHandle:e.descriptorHandle});
    if(d.sessionId!==input.sessionId||d.descriptorSha256!==input.expectedDescriptorSha256)fail();
    return Object.freeze({status:'observed',repository:r,controllerIdentity:Object.freeze({...currentProcess(c.parent.process)}),
      childIdentity:Object.freeze({...currentProcess(c.process)}),childInvocationBindingSha256:c.invocationBindingSha256,
      childSourceRef:Object.freeze({...c.sourceRef}),spawnRequest:Object.freeze(structuredClone(c.spawnRequest)),
      powerControllerModule:Object.freeze(structuredClone(module)),descriptor:Object.freeze(d),
      currentRequester:Object.freeze(originalRequesterSubject(e,source.assurance)),requesterBindingRef:Object.freeze({...e.bindingRef}),
      assurance:source.assurance,startupAcknowledgement:Object.freeze(structuredClone(custody.ack))});
  }catch{return unavailable();}
}

export function inspectSourceOwnedRequesterChildOriginExchange(input) {
  if(!exact(input,['repository','exchangeHandle']))fail();
  const r=repository(input.repository),x=childOriginExchanges.get(input.exchangeHandle);
  if(!x||!x.live||!sameRepository(r,x.repository))fail();
  const value=x.observe();
  return Object.freeze({...value,phase:x.phase,challengeSha256:x.challengeSha256,capabilitySha256:x.capabilitySha256,
    transportRef:Object.freeze({...x.transportRef}),originObservation:x.originObservation===null?null:Object.freeze(structuredClone(x.originObservation))});
}
function originObservation(value,context) {
  if(!exact(value,ORIGIN_KEYS)||value.schema!=='pipeline.managed-codex-requester-child-origin.v1'
    ||value.repositorySha256!==repositoryHash(context.repository)||!sameProcess(value.controllerIdentity,context.controllerIdentity)
    ||!sameProcess(value.childIdentity,context.childIdentity)||canonical(value.sourceRef)!==canonical(context.sourceRef)
    ||value.invocationBindingSha256!==context.invocationBindingSha256||canonical(value.childSourceRef)!==canonical(context.childSourceRef)
    ||value.childInvocationBindingSha256!==context.childInvocationBindingSha256
    ||value.requesterBindingSha256!==digest(context.currentRequester)||!SHA.test(value.operationBindingSha256)
    ||!SHA.test(value.memberRefSha256)||!object(value.association)
    ||!['controlled-unit-method','physical-readback'].includes(value.assurance)
    ||(context.currentRequester.assurance==='controlled-unit-method'&&value.assurance!=='controlled-unit-method'))fail();
  return value;
}
function sameOrigin(expected,observed) {
  if(!sameProcess(expected.controllerIdentity,observed.controllerIdentity)||!sameProcess(expected.childIdentity,observed.childIdentity))fail();
  const strip=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['controllerIdentity','childIdentity'].includes(key)));
  if(canonical(strip(expected))!==canonical(strip(observed)))fail();
}
function parentChallenge(channel,deadline) {
  return new Promise((resolveFrame,reject)=>{
    let bytes=Buffer.alloc(0),settled=false;const timeout=setTimeout(()=>bad(),Math.max(1,deadline-performance.now()));
    function bad(){clearTimeout(timeout);if(!settled){settled=true;reject(new Error('managed requester channel'));}else channel.destroy(new Error('managed requester extra frame'));}
    channel.on('data',chunk=>{if(settled)return bad();bytes=Buffer.concat([bytes,chunk]);if(bytes.length>MAX)return bad();
      const end=bytes.indexOf(10);if(end<0)return;if(end!==bytes.length-1)return bad();
      try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),value=JSON.parse(text);
        if(canonical(value)+'\n'!==text)fail();settled=true;clearTimeout(timeout);resolveFrame(value);}catch{bad();}});
    channel.once('error',bad);channel.once('end',()=>{if(!settled)bad();});
  });
}
async function sendManagedOrigin(channel,t,captured,entry,frame,deadline) {
  managedOwnerPorts();const parent=invocations.get(entry.currentInvocationHandle);
  const owner=managedRequesterOwner.createManagedCodexRequesterChildOrigin({repository:entry.repository,
    invocationHandle:parent.managedInvocationHandle,childInvocationHandle:captured.childInvocationHandle,runtimePort:entry.runtimePort});
  channel.write(canonical(frame)+'\n');
  const challenge=await parentChallenge(channel,deadline);
  if(performance.now()>deadline||!exact(challenge,['schema','nonce','transportSha256','childInvocationBindingSha256'])
    ||challenge.schema!=='pipeline.session-requester-managed-challenge.v1'||!SHA.test(challenge.nonce)
    ||challenge.transportSha256!==t.transport.transportSha256||challenge.childInvocationBindingSha256!==t.transport.childInvocationBindingSha256)fail();
  const x={repository:entry.repository,phase:'parent-challenge',live:true,challengeSha256:digest(challenge),
    capabilitySha256:hash(t.capability),transportRef:t.transportRef,originObservation:null,
    observe:()=>inspectSourceOwnedRequesterChildInvocation({repository:entry.repository,childInvocationHandle:captured.childInvocationHandle,runtimePort:entry.runtimePort})};
  const exchangeHandle=opaque(childOriginExchanges,x);
  try{
    const data=x.observe(),observation=managedRequesterOwner.observeManagedCodexRequesterChildOrigin({repository:entry.repository,originHandle:owner,exchangeHandle});
    originObservation(observation,{...data,sourceRef:parent.sourceRef,invocationBindingSha256:parent.invocationBindingSha256});
    if(performance.now()>deadline)fail();
    const response={schema:'pipeline.session-requester-managed-response.v1',nonce:challenge.nonce,
      transportSha256:challenge.transportSha256,childInvocationBindingSha256:challenge.childInvocationBindingSha256,
      originObservation:observation,proofSha256:digest({capability:t.capability,challenge,originObservation:observation})};
    const wire=canonical(response)+'\n';if(Buffer.byteLength(wire)>MAX)fail();
    await new Promise((resolveWrite,reject)=>{const timer=setTimeout(()=>reject(new Error('managed requester response timeout')),Math.max(1,deadline-performance.now()));
      channel.once('error',reject);channel.end(wire,()=>{clearTimeout(timer);resolveWrite();});});
  }finally{x.live=false;}
}
/** No caller-controlled executable/module/argv/channel/config can select Power. */
export async function spawnSessionPowerControllerChild(input,runtimePort) {
  try{if(!exact(input,['repository','requesterHandle']))fail();const r=repository(input.repository),module=powerControllerModule();
    return await spawnRequesterChildWithChannel({repository:r,requesterHandle:input.requesterHandle,
      executablePath:realpathSync(process.execPath),args:[module.path],cwd:r.primaryRoot,channelFd:4,startupTimeoutMs:TIMEOUT},runtimePort,module);
  }catch{return unavailable();}
}

export async function spawnRequesterChild(input,runtimePort) {
  return spawnRequesterChildWithChannel(input,runtimePort);
}
async function spawnRequesterChildWithChannel(input,runtimePort,powerModule=null) {
  let child, observedChild;const deadline=performance.now()+TIMEOUT;
  try {
    if(!exact(input,['repository','requesterHandle','executablePath','args','cwd','channelFd','startupTimeoutMs'])
      ||input.channelFd!==4||!Number.isSafeInteger(input.startupTimeoutMs)||input.startupTimeoutMs<1
      ||input.startupTimeoutMs>10000||!Array.isArray(input.args)||input.args.some(a=>typeof a!=='string'||a.includes('\0')))fail();
    const r=repository(input.repository),e=requesters.get(input.requesterHandle);if(!e||e.runtimePort!==runtimePort
      ||!active.getStore()?.lifetime.live||active.getStore()?.requesterHandle!==input.requesterHandle||!sameRepository(r,e.repository))fail();checkRequester(e);assertChildProducer(e,powerModule);
    if(powerModule&&canonical(powerControllerModule())!==canonical(powerModule))fail();
    for(const path of [input.executablePath,input.cwd])if(typeof path!=='string'||!isAbsolute(path)||realpathSync(path)!==path||lstatSync(path).isSymbolicLink())fail();
    if(!lstatSync(input.executablePath).isFile()||!lstatSync(input.cwd).isDirectory()
      ||!(input.cwd===r.primaryRoot||input.cwd.startsWith(r.primaryRoot+sep)))fail();
    child=spawn(input.executablePath,input.args,{cwd:input.cwd,env:process.env,shell:false,stdio:['ignore','pipe','pipe',powerModule?'pipe':'ignore','pipe']});
    ownedChildren.add(child);
    if(powerModule){const context=active.getStore(),i=invocations.get(e.currentInvocationHandle);
      powerChildCaptures.set(child,{requesterHandle:input.requesterHandle,currentInvocationHandle:e.currentInvocationHandle,
        lifetime:context.lifetime,powerControllerModule:powerModule,parentRequesterBindingRef:{...e.bindingRef},
        schema:i.producerId==='managed-codex'?'pipeline.managed-requester-child-invocation.v1':'pipeline.controlled-power-requester-child-invocation.v1'});}
    let terminalResolve;const terminal=new Promise(resolve=>{terminalResolve=resolve;});
    let spawnError=null;child.on('error',e=>{spawnError=e;});child.once('close',(code,signal)=>terminalResolve({code,signal,spawnError}));
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('requester child startup timeout')),input.startupTimeoutMs);
      child.once('spawn',()=>{clearTimeout(timeout);resolve();});child.once('error',error=>{clearTimeout(timeout);reject(error);});});
    observedChild=observePosixProcess(child.pid);processIdentity(observedChild);
    const captured=captureSourceOwnedChildInvocation({repository:r,currentInvocationHandle:e.currentInvocationHandle,child,
      spawnRequest:{executablePath:input.executablePath,args:input.args,cwd:input.cwd}},runtimePort);
    if(powerModule&&canonical(powerControllerModule())!==canonical(powerModule))fail();
    const h=createRequesterTransport({requesterHandle:input.requesterHandle,childInvocationHandle:captured.childInvocationHandle},runtimePort),t=transports.get(h);
    let frame={schema:'pipeline.session-requester-transport-frame.v1',transportRef:t.transportRef,capability:t.capability};
    let wire=canonical(frame)+'\n';const fault=faultScope.getStore();
    if(fault){if(invocations.get(e.currentInvocationHandle).assurance!=='controlled-unit-method')fail();
      if(fault==='capability-mismatch')wire=canonical({...frame,capability:randomBytes(32).toString('hex')})+'\n';
      if(fault==='second-frame')wire+=wire;if(fault==='oversize')wire+=' '.repeat(MAX+1);}
    if(invocations.get(e.currentInvocationHandle).producerId==='managed-codex'){
      if(fault)fail();await sendManagedOrigin(child.stdio[4],t,captured,e,frame,deadline);
    }else await new Promise((resolve,reject)=>{child.stdio[4].once('error',reject);child.stdio[4].end(wire,resolve);});
    t.used=true;t.capability=null;
    const c=children.get(captured.childInvocationHandle);c.terminal=terminal;terminal.then(()=>{c.closed=true;powerControllerCaptures.delete(c);});
    const p=ports.get(runtimePort);p.children.add(c);
    return {status:'spawned',child,childInvocationHandle:captured.childInvocationHandle,transportRef:t.transportRef,terminal,
      close:async()=>{if(!c.closed){currentProcess(c.process);child.kill('SIGTERM');}return terminal;}};
  }catch{if(child&&observedChild&&child.exitCode===null&&child.signalCode===null){try{currentProcess(observedChild);child.kill('SIGTERM');}catch{}}
    return unavailable();}
}
function transportChannel(fd) {
  if(!Number.isInteger(fd)||fd<3||fd>31||usedChannels.has(fd))fail();usedChannels.add(fd);
  const stat=fstatSync(fd);if(!(stat.isFIFO()||stat.isSocket()))fail();
  const socket=new Socket({fd,readable:true,writable:true});socket.pause();
  let pending=Buffer.alloc(0);const deadline=performance.now()+TIMEOUT;
  try{if(process.platform==='darwin'){assertDarwinInheritedRequesterSocket(fd);}else{const info=readFileSync('/proc/self/fdinfo/'+fd,'utf8'),flags=/^flags:\s+([0-7]+)$/mu.exec(info);
    if(!flags||(Number.parseInt(flags[1],8)&constants.O_NONBLOCK)===0)fail();}
  }catch(error){socket.destroy();throw error;}
  function check(){if(performance.now()>deadline)fail();}
  function readChunk(){check();const bytes=Buffer.alloc(2048);let n;
    try{n=readSync(fd,bytes,0,bytes.length,null);}catch(e){if(e.code!=='EAGAIN'&&e.code!=='EWOULDBLOCK')throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2);return null;}
    return bytes.subarray(0,n);}
  return {close:()=>socket.destroy(),
    readLine(){while(true){check();const end=pending.indexOf(10);if(end>=0){const line=pending.subarray(0,end+1);pending=pending.subarray(end+1);
        if(line.length>MAX)fail();const text=new TextDecoder('utf-8',{fatal:true}).decode(line),value=JSON.parse(text);
        if(canonical(value)+'\n'!==text)fail();return value;}
      if(pending.length>MAX)fail();const part=readChunk();if(part===null)continue;if(part.length===0)fail();pending=Buffer.concat([pending,part]);}},
    writeLine(value){const bytes=Buffer.from(canonical(value)+'\n');if(bytes.length>MAX)fail();let at=0;
      while(at<bytes.length){check();try{const n=writeSync(fd,bytes,at,bytes.length-at,null);if(n<=0)fail();at+=n;}
        catch(e){if(e.code!=='EAGAIN'&&e.code!=='EWOULDBLOCK')throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2);}}},
    requireEnd(){if(pending.length!==0)fail();while(true){const part=readChunk();if(part===null)continue;if(part.length!==0)fail();return;}}
  };
}
function matchingChildSource(r,sha256,actual) {
  const root=join(r.commonDir,'agent-pipeline/run/session-requesters/invocations');privateDirectory(root);
  const names=readdirSync(root);if(names.length>4096)fail();let matched=null,ref=null;
  for(const name of names){if(!/^child-[a-f0-9]{24}\.json$/u.test(name))continue;
    const path=join(root,name),s=lstatSync(path);if(s.isSymbolicLink()||!s.isFile()||s.nlink!==1||s.uid!==process.getuid()||(s.mode&0o077)!==0||s.size>MAX)fail();
    const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
    try{if(canonical(identity(s))!==canonical(identity(fstatSync(fd))))fail();bytes=readFileSync(fd);
      if(canonical(identity(s))!==canonical(identity(fstatSync(fd))))fail();}finally{closeSync(fd);}
    if(canonical(identity(s))!==canonical(identity(lstatSync(path))))fail();
    if(digest(JSON.parse(bytes))!==sha256)continue;if(matched)fail();
    ref={path:'.git/'+relative(r.commonDir,path).split(sep).join('/'),sha256:hash(bytes),size:bytes.length};matched=JSON.parse(readPrivate(r,ref));
  }
  if(!matched||!sameProcess(matched.process,actual))fail();return {matched,ref};
}
function childPowerReadback(r,matched,ref,b,t,actual,parent,descriptorHandle,assurance) {
  const module=powerControllerModule(),keys=['schema','repositorySha256','parentInvocationSha256','process','spawnRequest','powerControllerModule','parentRequesterBindingRef'];
  if(!exact(matched,keys)||!['pipeline.controlled-power-requester-child-invocation.v1','pipeline.managed-requester-child-invocation.v1'].includes(matched.schema)
    ||canonical(matched.powerControllerModule)!==canonical(module)||!exact(matched.spawnRequest,['executablePath','args','cwd'])
    ||matched.spawnRequest.executablePath!==realpathSync(process.execPath)||matched.spawnRequest.cwd!==r.primaryRoot
    ||canonical(matched.spawnRequest.args)!==canonical([module.path]))fail();
  const original=JSON.parse(readPrivate(r,matched.parentRequesterBindingRef));
  const bindingKeys=['schema','repositorySha256','sessionId','descriptorSha256','ownerNonceSha256','invocationBindingSha256','producerId','generation','transportSha256','controllerIdentity','sourceRef'];
  if(!exact(original,bindingKeys)||original.schema!=='pipeline.session-requester-binding.v1'
    ||['repositorySha256','sessionId','descriptorSha256','ownerNonceSha256','invocationBindingSha256','producerId','controllerIdentity','sourceRef'].some(key=>canonical(original[key])!==canonical(b[key])))fail();
  const d=descriptor(r,descriptorHandle);
  const currentRequester={sessionId:d.sessionId,descriptorSha256:d.descriptorSha256,ownerNonceSha256:d.ownerNonceSha256,
    transportRef:{...matched.parentRequesterBindingRef},assurance};
  return {repository:r,controllerIdentity:currentProcess(parent),childIdentity:currentProcess(actual),childInvocationBindingSha256:t.childInvocationBindingSha256,
    childSourceRef:{...ref},spawnRequest:structuredClone(matched.spawnRequest),powerControllerModule:module,
    descriptor:inspectSourceOwnedDescriptorHandle({repository:r,descriptorHandle}),currentRequester,requesterBindingRef:{...matched.parentRequesterBindingRef}};
}
export function readRequesterTransport({repository:input,fd},runtimePort=createSourceOwnedChildRuntimePort({repository:input})) {
  let channel;
  try{
    const r=repository(input),p=ports.get(runtimePort);if(!p||!p.childReader||p.disposed||!sameRepository(r,p.repository))fail();
    const actual=currentProcess(p.process);channel=transportChannel(fd);const frame=channel.readLine();
    if(!exact(frame,['schema','transportRef','capability'])||frame.schema!=='pipeline.session-requester-transport-frame.v1'||!SHA.test(frame.capability))fail();
    const t=JSON.parse(readPrivate(r,frame.transportRef));
    if(!exact(t,['schema','repositorySha256','bindingRef','transportSha256','childInvocationBindingSha256','childIdentity','producerId','generation'])
      ||t.schema!=='pipeline.session-requester-transport.v1'||t.repositorySha256!==repositoryHash(r)||hash(frame.capability)!==t.transportSha256
      ||canonical(t.childIdentity)!==canonical(processIdentity(actual)))fail();
    const b=JSON.parse(readPrivate(r,t.bindingRef));
    const keys=['schema','repositorySha256','sessionId','descriptorSha256','ownerNonceSha256','invocationBindingSha256','producerId','generation','transportSha256','controllerIdentity','sourceRef'];
    if(!exact(b,keys)||b.schema!=='pipeline.session-requester-binding.v1'||b.repositorySha256!==repositoryHash(r)
      ||b.transportSha256!==t.transportSha256||b.generation!==t.generation||b.producerId!==t.producerId)fail();
    const origin=JSON.parse(readPrivate(r,b.sourceRef)),parent=observePosixProcess(actual.parentPid);
    if(!parent||canonical(processIdentity(parent))!==canonical(b.controllerIdentity))fail();
    const {matched,ref}=matchingChildSource(r,t.childInvocationBindingSha256,actual);
    if(matched.parentInvocationSha256!==b.invocationBindingSha256||matched.repositorySha256!==repositoryHash(r))fail();
    const descriptorHandle=createSourceOwnedDescriptorHandle({repository:r,sessionId:b.sessionId,expectedDescriptorSha256:b.descriptorSha256,ownerNonceFile:null});
    if(descriptor(r,descriptorHandle).ownerNonceSha256!==b.ownerNonceSha256)fail();
    let assurance,managedOriginHandle=null,observation=null;
    if(b.producerId==='controlled-unit-method'){
      channel.requireEnd();
      if(!sameProcess(origin.process,parent)||origin.repositorySha256!==repositoryHash(r)||digest(origin)!==b.invocationBindingSha256||origin.assurance!=='controlled-unit-method')fail();
      assurance='controlled-unit-method';
      if(matched.schema==='pipeline.controlled-power-requester-child-invocation.v1')childPowerReadback(r,matched,ref,b,t,actual,parent,descriptorHandle,assurance);
      else if(matched.schema!=='pipeline.controlled-requester-child-invocation.v1')fail();
    }else{
      if(b.producerId!=='managed-codex'||matched.schema!=='pipeline.managed-requester-child-invocation.v1')fail();managedOwnerPorts();
      // No managed label grants anything. The real parent owns the secret and
      // its journal proves the original source digest/task/member association.
      const challenge={schema:'pipeline.session-requester-managed-challenge.v1',nonce:randomBytes(32).toString('hex'),
        transportSha256:t.transportSha256,childInvocationBindingSha256:t.childInvocationBindingSha256};
      childPowerReadback(r,matched,ref,b,t,actual,parent,descriptorHandle,'physical-readback');
      channel.writeLine(challenge);const response=channel.readLine();channel.requireEnd();
      if(!exact(response,['schema','nonce','transportSha256','childInvocationBindingSha256','originObservation','proofSha256'])
        ||response.schema!=='pipeline.session-requester-managed-response.v1'||response.nonce!==challenge.nonce
        ||response.transportSha256!==challenge.transportSha256||response.childInvocationBindingSha256!==challenge.childInvocationBindingSha256
        ||response.proofSha256!==digest({capability:frame.capability,challenge,originObservation:response.originObservation}))fail();
      assurance=response.originObservation?.assurance;
      if(!['controlled-unit-method','physical-readback'].includes(assurance))fail();
      const observe=()=>childPowerReadback(r,matched,ref,b,t,currentProcess(actual),currentProcess(parent),descriptorHandle,assurance);
      const data=observe();observation=originObservation(response.originObservation,{...data,sourceRef:b.sourceRef,invocationBindingSha256:b.invocationBindingSha256});
      const x={repository:r,phase:'child-completed',live:true,challengeSha256:digest(challenge),capabilitySha256:hash(frame.capability),
        transportRef:frame.transportRef,originObservation:observation,observe};
      const exchangeHandle=opaque(childOriginExchanges,x);
      try{managedOriginHandle=managedRequesterOwner.readManagedCodexRequesterTransportOrigin({repository:r,sourceRef:b.sourceRef,
        invocationBindingSha256:b.invocationBindingSha256,controllerIdentity:parent,exchangeHandle});
        sameOrigin(observation,managedRequesterOwner.inspectManagedCodexRequesterChildOrigin({repository:r,originHandle:managedOriginHandle}));
      }finally{x.live=false;}
    }
    const requesterHandle=opaque(requesters,{repository:r,descriptorHandle,runtimePort,bindingRef:t.bindingRef,binding:b,transportRef:frame.transportRef,
      child:{process:actual,parent,transport:t,assurance,sourceRef:ref,managedOriginHandle,originObservation:observation,transportCapability:frame.capability,
        powerModule:matched.schema==='pipeline.controlled-requester-child-invocation.v1'?null:powerControllerModule()}});
    checkRequester(requesters.get(requesterHandle));return {status:'bound',requesterHandle};
  }catch{return unavailable();}finally{channel?.close();}
}
export function createControlledMethodRuntimeFixture(input) {
  if(!exact(input,['repository','fixtureRoot','sessionId'])||!ID.test(input.sessionId))fail();
  const r=repository(input.repository),base=join(r.commonDir,'agent-pipeline/controlled-method-fixtures');
  if(typeof input.fixtureRoot!=='string'||dirname(input.fixtureRoot)!==base||!ID.test(relative(base,input.fixtureRoot))||existsSync(input.fixtureRoot))fail();
  ensureNamespace(r); // Reject an aliased shared ancestor before fixture creation.
  let controlledWindowsDirectories=null;
  if(process.platform==='win32'){
    if(!existsSync(base))createWindowsOwnedAuthorityDirectory({path:base});
    const baseFacts=inspectWindowsOwnedAuthorityPath({path:base,directory:true});
    createWindowsOwnedAuthorityDirectory({path:input.fixtureRoot});
    const fixtureFacts=inspectWindowsOwnedAuthorityPath({path:input.fixtureRoot,directory:true});
    controlledWindowsDirectories=[{path:base,facts:baseFacts},{path:input.fixtureRoot,facts:fixtureFacts}];
  }else{
    if(!existsSync(base))mkdirSync(base,{recursive:true,mode:0o700});privateDirectory(base);
    mkdirSync(input.fixtureRoot,{mode:0o700});privateDirectory(input.fixtureRoot);
  }
  const started=startSessionDescriptor(r.primaryRoot,{sessionId:input.sessionId});
  const descriptorHandle=createSourceOwnedDescriptorHandle({repository:r,sessionId:started.sessionId,expectedDescriptorSha256:started.descriptorSha256,ownerNonceFile:null});
  const actual=process.platform==='win32'?osvObservedProcess(process.pid):observePosixProcess(process.pid),source={schema:'pipeline.controlled-requester-invocation.v1',repositorySha256:repositoryHash(r),
    process:actual,assurance:'controlled-unit-method',fixtureRoot:input.fixtureRoot,eventId:randomBytes(16).toString('hex')};processIdentity(actual);
  const sourceRef=publish(r,join(ensureNamespace(r),'invocations','current-'+randomBytes(12).toString('hex')+'.json'),source);
  const runtimePort=runtimePortFor({repository:r,disposed:false,children:new Set()});
  const currentInvocationHandle=opaque(invocations,{repository:r,process:actual,sourceRef,invocationBindingSha256:digest(source),
    producerId:'controlled-unit-method',assurance:'controlled-unit-method',port:runtimePort,
    ...(controlledWindowsDirectories?{sourceOwnerRecheck:()=>{
      const current=osvObservedProcess(process.pid);
      if(!sameNativeWindowsProcess(actual,current))fail('SDC-AUTHORITY-CAS');
      for(const expected of controlledWindowsDirectories){
        const observed=inspectWindowsOwnedAuthorityPath({path:expected.path,directory:true});
        if(expected.facts.nativeFacts!==observed.nativeFacts
          ||expected.facts.nativeFactsSha256!==observed.nativeFactsSha256
          ||expected.facts.helperSha256!==observed.helperSha256)fail('SDC-AUTHORITY-CAS');
      }
    }}:{})});
  const bound=bindSourceOwnedRequesterInvocation({repository:r,descriptorHandle,currentInvocationHandle},runtimePort);
  return {descriptorHandle,currentInvocationHandle,runtimePort,...bound,
    run:callback=>withSourceOwnedAuthorityContext({requesterHandle:bound.requesterHandle,runtimePort},callback),
    captureHookEvent:()=>unavailable(),
    adoptChild:({childInvocationHandle})=>{const c=children.get(childInvocationHandle);if(!c||c.runtimePort!==runtimePort||c.closed)fail();currentProcess(c.process);return childInvocationHandle;},
    attachTerminal:()=>unavailable(),
    dispose:async()=>{const p=ports.get(runtimePort),refs=[bound.bindingRef,sourceRef];let held=false;
      for(const c of p.children){if(!c.closed){try{currentProcess(c.process);c.child.kill('SIGTERM');await c.terminal;}catch{held=true;}}}
      // Requester disposal does not release authority registry members or descriptor history.
      p.disposed=true;return {status:held?'held':'closed',sourceRefs:refs};},
  };
}

/** Actual private invocation/requester observation. It cannot issue a handle or grant launch authority. */
export function inspectSourceOwnedRequesterInvocation(input) {
  if(!exact(input,['repository','currentInvocationHandle','runtimePort']))fail();
  const r=repository(input.repository),i=invocations.get(input.currentInvocationHandle);
  if(!i||i.port!==input.runtimePort||!sameRepository(r,i.repository))fail();
  const observed=observeInvocation(input.currentInvocationHandle,input.runtimePort);
  const entry=requesters.get(i.requesterHandle);
  if(!entry||entry.currentInvocationHandle!==input.currentInvocationHandle||entry.runtimePort!==input.runtimePort
    ||!sameRepository(r,entry.repository))fail();
  const b=checkRequester(entry),d=descriptor(r,entry.descriptorHandle);
  if(b.invocationBindingSha256!==observed.invocationBindingSha256
    ||b.sessionId!==d.sessionId||b.descriptorSha256!==d.descriptorSha256||b.ownerNonceSha256!==d.ownerNonceSha256)fail('SDC-DESCRIPTOR-CAS');
  const sourceRef=Object.freeze({...observed.sourceRef});
  const currentRequester=Object.freeze({sessionId:d.sessionId,descriptorSha256:d.descriptorSha256,
    ownerNonceSha256:d.ownerNonceSha256,transportRef:Object.freeze({...entry.transportRef??entry.bindingRef}),assurance:observed.assurance});
  return Object.freeze({status:'bound',descriptorHandle:entry.descriptorHandle,requesterHandle:i.requesterHandle,
    sourceRef,invocationBindingSha256:observed.invocationBindingSha256,assurance:observed.assurance,controllerIdentity:Object.freeze({...observed.controllerIdentity}),currentRequester});
}

/** Actual active private context only. A transported child has no local parent invocation handle. */
export function inspectSourceOwnedCurrentAuthorityContext(input) {
  if(!exact(input,['repository']))fail();
  const r=repository(input.repository),context=active.getStore();
  if(!context?.lifetime.live||!sameRepository(r,context.repository))return unavailable();
  const entry=requesters.get(context.requesterHandle);
  if(!entry||entry.runtimePort!==context.runtimePort||!sameRepository(r,entry.repository))fail();
  if(entry.currentInvocationHandle){
    const observed=inspectSourceOwnedRequesterInvocation({repository:r,currentInvocationHandle:entry.currentInvocationHandle,runtimePort:entry.runtimePort});
    return Object.freeze({...observed,currentInvocationHandle:entry.currentInvocationHandle,runtimePort:entry.runtimePort});
  }
  if(!entry.child)fail();
  const b=checkRequester(entry),d=descriptor(r,entry.descriptorHandle),child=entry.child;
  currentProcess(child.process);readPrivate(r,child.sourceRef);
  if(b.sessionId!==d.sessionId||b.descriptorSha256!==d.descriptorSha256||b.ownerNonceSha256!==d.ownerNonceSha256)fail('SDC-DESCRIPTOR-CAS');
  return Object.freeze({status:'bound',descriptorHandle:entry.descriptorHandle,requesterHandle:context.requesterHandle,
    currentInvocationHandle:null,runtimePort:entry.runtimePort,sourceRef:Object.freeze({...child.sourceRef}),
    invocationBindingSha256:child.transport.childInvocationBindingSha256,
    controllerIdentity:Object.freeze(processIdentity(child.process)),assurance:child.assurance,
    currentRequester:Object.freeze({sessionId:d.sessionId,descriptorSha256:d.descriptorSha256,ownerNonceSha256:d.ownerNonceSha256,
      transportRef:Object.freeze({...entry.transportRef}),assurance:child.assurance})});
}
function managedRequesterSource(r,handle) {
  if(typeof managedRequesterOwner.isOwnedManagedCodexInvocationContext!=='function'
    ||typeof managedRequesterOwner.inspectManagedCodexInvocationContext!=='function'
    ||managedRequesterOwner.isOwnedManagedCodexInvocationContext(handle,{repository:r})!==true)fail('SDC-REQUESTER-UNAVAILABLE','managed-owner-context');
  const source=managedRequesterOwner.inspectManagedCodexInvocationContext({repository:r,invocationHandle:handle});
  if(!exact(source,['repository','controller','sourceRef','invocationBindingSha256','descriptorHandle','producerId','assurance'])
    ||!sameRepository(repository(source.repository),r)||source.producerId!=='managed-codex'||!source.descriptorHandle
    ||!SHA.test(source.invocationBindingSha256)||!['controlled-unit-method','physical-readback','native-bound'].includes(source.assurance))fail('SDC-REQUESTER-UNAVAILABLE','managed-source-observation');
  descriptor(r,source.descriptorHandle);currentProcess(source.controller);readPrivate(r,source.sourceRef);
  if(source.assurance!=='controlled-unit-method')managedOwnerPorts();
  return {...source,assurance:source.assurance==='controlled-unit-method'?'controlled-unit-method':'physical-readback'};
}
/** No public callback issuer: only the actual managed journal's private context can enter. */
export function createManagedCodexRequesterRuntime(input) {
  if(!exact(input,['repository','invocationHandle']))fail();
  const r=repository(input.repository),source=managedRequesterSource(r,input.invocationHandle);
  const runtimePort=runtimePortFor({repository:r,disposed:false,children:new Set()});
  const currentInvocationHandle=opaque(invocations,{repository:r,process:source.controller,sourceRef:source.sourceRef,
    invocationBindingSha256:source.invocationBindingSha256,producerId:'managed-codex',assurance:source.assurance,port:runtimePort,managedInvocationHandle:input.invocationHandle,
    sourceOwnerRecheck:()=>{
      const fresh=managedRequesterSource(r,input.invocationHandle);
      if(fresh.descriptorHandle!==source.descriptorHandle||!(process.platform==='win32'?osvSameProcess(fresh.controller,source.controller):sameProcess(fresh.controller,source.controller))
        ||canonical(fresh.sourceRef)!==canonical(source.sourceRef)||fresh.invocationBindingSha256!==source.invocationBindingSha256
        ||fresh.assurance!==source.assurance)fail('SDC-REQUESTER-UNAVAILABLE','managed-source-drift');
    }});
  const bound=bindSourceOwnedRequesterInvocation({repository:r,descriptorHandle:source.descriptorHandle,currentInvocationHandle},runtimePort);
  return {descriptorHandle:source.descriptorHandle,currentInvocationHandle,runtimePort,...bound,
    run:callback=>withSourceOwnedAuthorityContext({requesterHandle:bound.requesterHandle,runtimePort},callback),
    // Closing a bridge does not terminate or clear the owning journal/registry.
    dispose:()=>{ports.get(runtimePort).disposed=true;return {status:'closed',sourceRefs:[source.sourceRef,bound.bindingRef]};}};
}

// Retirement observation is a separate terminal-only domain. Normal descriptor,
// requester, transport and launch predicates remain active-descriptor checks.
const retiredOwnerTerminalContext=new AsyncLocalStorage();
function retiredOwnerTerminalObservation(data){
  const r=repository(data.repository);
  if(!data.live)fail('SDC-REQUESTER-UNAVAILABLE','retired-terminal-context-expired');
  const i=invocations.get(data.currentInvocationHandle),entry=requesters.get(data.requesterHandle),p=ports.get(data.runtimePort);
  if(!i||!entry||!p||p.disposed||entry.child||i.port!==data.runtimePort||i.requesterHandle!==data.requesterHandle||entry.currentInvocationHandle!==data.currentInvocationHandle||entry.runtimePort!==data.runtimePort||!sameRepository(i.repository,r)||!sameRepository(entry.repository,r))fail('SDC-REQUESTER-UNAVAILABLE','retired-terminal-original-invocation');
  const d=descriptors.get(entry.descriptorHandle);
  if(!d||!sameRepository(d.repository,r)||entry.descriptorHandle!==data.descriptorHandle)fail('SDC-DESCRIPTOR-CAS','retired-terminal-original-descriptor');
  const target={sessionId:d.sessionId,descriptorSha256:d.descriptorSha256,ownerNonceSha256:d.ownerNonceSha256};
  for(const name of ['observeOwnedSessionDescriptorOwnerHandle','observeOwnedSessionDescriptorClosureHandle','inspectOwnedSessionDescriptorClosureHandle'])if(typeof retiredDescriptorOwner[name]!=='function')fail('SDC-REQUESTER-UNAVAILABLE','retired-terminal-owner-port-missing');
  if(retiredDescriptorOwner.observeOwnedSessionDescriptorOwnerHandle({repository:r,target})!==data.ownerHandle||retiredDescriptorOwner.observeOwnedSessionDescriptorClosureHandle({repository:r,target,ownerHandle:data.ownerHandle})!==data.closureHandle)fail('SDC-DESCRIPTOR-CAS','retired-terminal-owner-association');
  const closure=retiredDescriptorOwner.inspectOwnedSessionDescriptorClosureHandle(data.closureHandle,{repository:r,target});
  if(!exact(closure,['status','target','descriptorRef','archiveRef','proofRef','closureRef','repository','assurance'])||closure.status!=='closed'||closure.assurance!=='physical-owner-retirement'||canonical(closure.target)!==canonical(target)||canonical(closure.repository)!==canonical(r)||closure.descriptorRef.sha256!==d.descriptorSha256)fail('SDC-DESCRIPTOR-CAS','retired-terminal-closure-readback');
  // No replacement invocation or binding is created. Every read observes the
  // original private source and the same executing process incarnation.
  const observed=observeInvocation(data.currentInvocationHandle,data.runtimePort),actual=observePosixProcess(process.pid);
  if(!sameProcess(i.process,actual))fail('SDC-REQUESTER-UNAVAILABLE','retired-terminal-current-process');
  const value=JSON.parse(readPrivate(r,entry.bindingRef));
  if(canonical(value)!==canonical(entry.binding)||value.sessionId!==target.sessionId||value.descriptorSha256!==target.descriptorSha256||value.ownerNonceSha256!==target.ownerNonceSha256||value.invocationBindingSha256!==observed.invocationBindingSha256||canonical(value.controllerIdentity)!==canonical(observed.controllerIdentity)||canonical(value.sourceRef)!==canonical(observed.sourceRef))fail('SDC-AUTHORITY-CAS','retired-terminal-binding-readback');
  readPrivate(r,value.sourceRef);
  return Object.freeze({status:'terminal-observed',descriptorHandle:entry.descriptorHandle,requesterHandle:data.requesterHandle,currentInvocationHandle:data.currentInvocationHandle,runtimePort:data.runtimePort,
    sourceRef:Object.freeze({...observed.sourceRef}),bindingRef:Object.freeze({...entry.bindingRef}),invocationBindingSha256:observed.invocationBindingSha256,controllerIdentity:Object.freeze({...observed.controllerIdentity}),assurance:observed.assurance,
    currentRequester:Object.freeze({...target,transportRef:Object.freeze({...entry.bindingRef}),assurance:observed.assurance}),
    closure:Object.freeze(structuredClone(closure))});
}
export function withSourceOwnedRetiredOwnerTerminalContext(input,callback){
  if(!exact(input,['repository','currentInvocationHandle','runtimePort','ownerHandle','closureHandle'])||typeof callback!=='function')fail('SDC-REQUESTER-UNAVAILABLE','retired-terminal-input');
  const r=repository(input.repository),i=invocations.get(input.currentInvocationHandle),entry=i&&requesters.get(i.requesterHandle);
  if(!entry||entry.runtimePort!==input.runtimePort||retiredOwnerTerminalContext.getStore())fail('SDC-REQUESTER-UNAVAILABLE','retired-terminal-original-context');
  const data={...input,repository:r,requesterHandle:i.requesterHandle,descriptorHandle:entry.descriptorHandle,live:true};
  retiredOwnerTerminalObservation(data);
  return retiredOwnerTerminalContext.run(data,()=>{try{const result=callback();if(result&&typeof result.then==='function')fail('SDC-REQUESTER-UNAVAILABLE','retired-terminal-asynchronous-callback');retiredOwnerTerminalObservation(data);return result;}finally{data.live=false;}});
}
export function inspectSourceOwnedRetiredOwnerTerminalContext(input){
  if(!exact(input,['repository']))fail('SDC-REQUESTER-UNAVAILABLE','retired-terminal-inspection');
  const data=retiredOwnerTerminalContext.getStore();if(!data||!sameRepository(repository(input.repository),data.repository))return unavailable();
  return retiredOwnerTerminalObservation(data);
}


// Inert Source fragment; not application-ready and never imported by author.
// This transport core is composed into the requester only after the issuer's
// original operation/member physical-floor ABI is closed.
const OSV_WIRE_MAX=4*1024*1024, OSV_FRAME_LIMIT=20, OSV_TTL_MAX=120000;
const OSV_CODES=new Set(['OSV-OWNER-UNAVAILABLE','OSV-COURSE-UNAVAILABLE',
  'OSV-ASSOCIATION-UNAVAILABLE','OSV-INPUT-DRIFT','OSV-EXCHANGE-UNAVAILABLE',
  'OSV-REPLAY','OSV-EXPIRED','OSV-VERIFY-FAILED','OSV-TERMINAL-UNAVAILABLE']);
const osvAttempts=new WeakMap(), osvExchanges=new WeakMap(), osvChildContexts=new WeakMap();
function osvFail(code='OSV-EXCHANGE-UNAVAILABLE') {
  const error=new Error('owned verification unavailable');error.name='SessionAuthorityError';
  error.code=OSV_CODES.has(code)?code:'OSV-EXCHANGE-UNAVAILABLE';throw error;
}
function osvExact(value,keys){if(!exact(value,keys))osvFail();return value;}
function osvSame(a,b){if(canonical(a)!==canonical(b))osvFail('OSV-INPUT-DRIFT');}
function osvSameFloor(a,b){
  if(!osvSameProcess(a.controllerIdentity,b.controllerIdentity))osvFail('OSV-INPUT-DRIFT');
  const strip=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='controllerIdentity'));
  osvSame(strip(a),strip(b));
}
function osvDeadline(remaining){
  if(!Number.isSafeInteger(remaining)||remaining<1||remaining>OSV_TTL_MAX)osvFail('OSV-EXPIRED');
  return performance.now()+remaining;
}
function osvRemaining(deadline){const n=Math.floor(deadline-performance.now());if(n<1)osvFail('OSV-EXPIRED');return n;}
// One strict, bounded line protocol on the actual Source-created duplex pipe.
// No caller frame parser, socket factory, timing callback or successful return
// can replace the real channel. Extra bytes/frames are never silently dropped.
function osvWire(socket,deadline,abortController=null){
  if(!socket||socket.destroyed||!socket.readable||!socket.writable)osvFail();
  let buffer=Buffer.alloc(0),readCount=0,writeCount=0,pending=null,ended=false,closedError=null,finished=false;
  const frames=[];
  const expiry=setTimeout(()=>close('OSV-EXPIRED'),osvRemaining(deadline));
  function close(code='OSV-EXCHANGE-UNAVAILABLE'){
    if(closedError||finished)return;closedError=code;ended=true;clearTimeout(expiry);
    abortController?.abort();if(pending){const {reject}=pending;pending=null;reject(Object.assign(new Error('owned verification unavailable'),{name:'SessionAuthorityError',code}));}
    socket.destroy();
  }
  function decode(bytes){
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),value=JSON.parse(text);
    if(canonical(value)+'\n'!==text)osvFail();return value;
  }
  function deliver(){
    if(!pending||frames.length===0)return;const {resolve}=pending;pending=null;resolve(frames.shift());
  }
  socket.on('data',chunk=>{
    try{
      osvRemaining(deadline);if(ended||!Buffer.isBuffer(chunk))osvFail();
      buffer=Buffer.concat([buffer,chunk]);if(buffer.length>OSV_WIRE_MAX)osvFail();
      while(true){const end=buffer.indexOf(10);if(end<0)break;
        if(++readCount>OSV_FRAME_LIMIT)osvFail('OSV-REPLAY');
        const frame=decode(buffer.subarray(0,end+1));buffer=buffer.subarray(end+1);
        frames.push(frame);if(frames.length>1)osvFail('OSV-REPLAY');deliver();
      }
    }catch(error){close(OSV_CODES.has(error?.code)?error.code:'OSV-EXCHANGE-UNAVAILABLE');}
  });
  socket.once('error',()=>close());socket.once('end',()=>close());socket.once('close',()=>close());socket.resume();
  return Object.freeze({
    async read(){osvRemaining(deadline);if(closedError)osvFail(closedError);if(pending)osvFail('OSV-REPLAY');
      if(frames.length)return frames.shift();return new Promise((resolve,reject)=>{pending={resolve,reject};});},
    async write(value){
      osvRemaining(deadline);if(closedError)osvFail(closedError);if(++writeCount>OSV_FRAME_LIMIT)osvFail('OSV-REPLAY');
      const bytes=Buffer.from(canonical(value)+'\n');if(bytes.length>OSV_WIRE_MAX)osvFail();
      await new Promise((resolve,reject)=>socket.write(bytes,error=>error?reject(error):resolve()));
      osvRemaining(deadline);
    },
    check(){osvRemaining(deadline);if(closedError||ended||socket.destroyed)osvFail(closedError??'OSV-EXCHANGE-UNAVAILABLE');},
    close(){close();},
    revoke(){clearTimeout(expiry);abortController?.abort();socket.destroy();},
    finish(){if(pending||buffer.length||frames.length)osvFail('OSV-REPLAY');finished=true;clearTimeout(expiry);socket.destroy();},
  });
}
function osvInheritedSocket(){
  if(usedChannels.has(4)||!['linux','darwin'].includes(process.platform))osvFail();usedChannels.add(4);
  const stat=fstatSync(4);if(!(stat.isFIFO()||stat.isSocket()))osvFail();
  if(process.platform==='darwin'){const socket=new Socket({fd:4,readable:true,writable:true});socket.pause();
    try{assertDarwinInheritedRequesterSocket(4);return socket;}catch(error){socket.destroy();throw error;}}
  const info=readFileSync('/proc/self/fdinfo/4','utf8'),flags=/^flags:\s+([0-7]+)$/mu.exec(info);
  if(!flags||(Number.parseInt(flags[1],8)&constants.O_NONBLOCK)===0)osvFail();
  return new Socket({fd:4,readable:true,writable:true});
}
function osvPhysical(ref){
  if(process.platform==='win32'){osvWindowsPhysical(ref);return;}
  osvExact(ref,['path','sha256','size','identity']);
  osvExact(ref.identity,['dev','ino','mode','uid','gid','nlink']);
  if(typeof ref.path!=='string'||!isAbsolute(ref.path)||resolve(ref.path)!==ref.path
    ||!SHA.test(ref.sha256)||!Number.isSafeInteger(ref.size)||ref.size<0||ref.size>268435456
    ||ref.identity.nlink!==1)osvFail('OSV-INPUT-DRIFT');
  let cursor=dirname(ref.path);const ancestors=[];
  while(true){const s=lstatSync(cursor);if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(cursor)!==cursor
      ||(s.mode&0o022)!==0)osvFail('OSV-INPUT-DRIFT');
    ancestors.push({path:cursor,dev:s.dev,ino:s.ino,mode:s.mode,uid:s.uid,gid:s.gid});
    const parent=dirname(cursor);if(parent===cursor)break;cursor=parent;}
  const before=lstatSync(ref.path);if(!before.isFile()||before.isSymbolicLink()||realpathSync(ref.path)!==ref.path
    ||before.size!==ref.size||(before.mode&0o022)!==0
    ||Object.keys(ref.identity).some(k=>before[k]!==ref.identity[k]))osvFail('OSV-INPUT-DRIFT');
  const fd=openSync(ref.path,constants.O_RDONLY|constants.O_NOFOLLOW),hasher=createHash('sha256');
  try{
    osvSame(identity(before),identity(fstatSync(fd)));const block=Buffer.alloc(65536);let at=0;
    while(at<ref.size){const n=readSync(fd,block,0,Math.min(block.length,ref.size-at),at);if(n===0)osvFail('OSV-INPUT-DRIFT');hasher.update(block.subarray(0,n));at+=n;}
    if(readSync(fd,block,0,1,at)!==0)osvFail('OSV-INPUT-DRIFT');
    osvSame(identity(before),identity(fstatSync(fd)));osvSame(identity(before),identity(lstatSync(ref.path)));
    if(hasher.digest('hex')!==ref.sha256)osvFail('OSV-INPUT-DRIFT');
    for(const a of ancestors){const s=lstatSync(a.path);if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(a.path)!==a.path
      ||['dev','ino','mode','uid','gid'].some(k=>s[k]!==a[k]))osvFail('OSV-INPUT-DRIFT');}
  }finally{closeSync(fd);}
}
function osvEntry(binding,kind){
  const entry=binding[kind],module=fileURLToPath(new URL(kind==='guard'?'../hooks/guard-lifecycle-ready.mjs':'../scripts/owned-continuity-verification.mjs',import.meta.url));
  osvExact(entry,['module','executable','argv','cwd']);osvPhysical(entry.module);osvPhysical(entry.executable);
  const tail=kind==='guard'?['--runner','codex','--consume-owned-verification-guard','--channel-fd','4']
    :['--consume-owned-verification','--channel-fd','4'];
  if(entry.module.path!==module||entry.executable.path!==realpathSync(process.execPath)||entry.cwd!==binding.repository.primaryRoot)osvFail('OSV-INPUT-DRIFT');
  osvSame(entry.argv,[...process.execArgv,module,...tail]);return entry;
}
function osvBinding(binding,expectedSha256){
  osvExact(binding,['schema','repository','candidate','requester','requesterFloor','invocation','course','courseSha256','selectedStateRef',
    'approvalRefs','member','registration','associationSha256','suiteSha256','selectedSuite','sourceClosure','guard','executor','command','commandSha256','journalInputs']);
  if(binding.schema!=='pipeline.owned-continuity-verification.binding.v1'||digest(binding)!==expectedSha256
    ||!SHA.test(expectedSha256)||!SHA.test(binding.courseSha256)||!SHA.test(binding.suiteSha256)
    ||!SHA.test(binding.associationSha256)||typeof binding.command!=='string'||hash(binding.command)!==binding.commandSha256
    ||binding.invocation.assurance==='controlled-unit-method')osvFail('OSV-INPUT-DRIFT');
  repository(binding.repository);osvExact(binding.candidate,['commit','tree']);
  if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(binding.candidate.commit)||binding.candidate.tree.length!==binding.candidate.commit.length
    ||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(binding.candidate.tree))osvFail('OSV-INPUT-DRIFT');
  if(!Array.isArray(binding.sourceClosure)||binding.sourceClosure.length<1||binding.sourceClosure.length>4096
    ||new Set(binding.sourceClosure.map(ref=>ref.path)).size!==binding.sourceClosure.length)osvFail('OSV-INPUT-DRIFT');
  binding.sourceClosure.forEach(osvPhysical);osvPhysical(binding.selectedStateRef);
  if(!Array.isArray(binding.approvalRefs)||binding.approvalRefs.length>32)osvFail('OSV-INPUT-DRIFT');binding.approvalRefs.forEach(osvPhysical);
  osvEntry(binding,'guard');osvEntry(binding,'executor');
  osvExact(binding.journalInputs,['gitCommonDir','repoRoot','candidate','suites','policyInputs']);
  if(binding.journalInputs.gitCommonDir!==binding.repository.commonDir||binding.journalInputs.repoRoot!==binding.repository.primaryRoot
    ||!Array.isArray(binding.journalInputs.suites)||binding.journalInputs.suites.length!==1)osvFail('OSV-INPUT-DRIFT');
  osvSame(binding.journalInputs.candidate,binding.candidate);osvSame(binding.journalInputs.suites[0],binding.selectedSuite);
}
function osvPhysicalRef(path){
  if(process.platform==='win32')return osvWindowsPhysicalRef(path);
  if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path)osvFail('OSV-INPUT-DRIFT');
  const s=lstatSync(path),sha256=executableBytesSha256(path,performance.now()+TIMEOUT);
  const ref={path,sha256,size:s.size,identity:{dev:s.dev,ino:s.ino,mode:s.mode,uid:s.uid,gid:s.gid,nlink:s.nlink}};
  osvPhysical(ref);return ref;
}
function osvProgram(actual){
  if(process.platform==='win32'){
    const fresh=osvObservedProcess(process.pid);if(!osvSameProcess(actual,fresh)||fresh.cwd!==realpathSync(process.cwd()))osvFail('OSV-INPUT-DRIFT');
    const executable=osvPhysicalRef(realpathSync(process.execPath)),module=osvPhysicalRef(process.argv[1]);
    if(executable.path!==fresh.executable||fresh.argv.length<2||!fresh.argv.includes(module.path))osvFail('OSV-INPUT-DRIFT');
    return {executable,module,argv:[...fresh.argv],cwd:fresh.cwd};
  }
  if(process.platform==='darwin'){
    const fresh=osvObservedProcess(process.pid);
    if(!sameNativeDarwinProcess(actual,fresh)||fresh.cwd!==realpathSync(process.cwd())||!isAbsolute(process.argv[1]))osvFail('OSV-INPUT-DRIFT');
    const executable=osvPhysicalRef(realpathSync(process.execPath)),module=osvPhysicalRef(process.argv[1]);
    if(executable.path!==fresh.executable||fresh.argv.length<2||!fresh.argv.includes(module.path))osvFail('OSV-INPUT-DRIFT');
    return {executable,module,argv:[...fresh.argv],cwd:fresh.cwd};
  }
  if(process.platform!=='linux')osvFail('OSV-OWNER-UNAVAILABLE');
  const bytes=readFileSync('/proc/self/cmdline');if(bytes.length>65536)osvFail('OSV-OWNER-UNAVAILABLE');
  const argv=new TextDecoder('utf-8',{fatal:true}).decode(bytes).split('\0');
  if(argv.pop()!==''||argv.length<2||processArgvDigest(argv)!==actual.argvSha256
    ||!isAbsolute(process.argv[1]))osvFail('OSV-OWNER-UNAVAILABLE');
  const cwd=realpathSync('/proc/self/cwd'),executable=osvPhysicalRef(realpathSync(process.execPath)),module=osvPhysicalRef(process.argv[1]);
  if(executable.path!==actual.executable)osvFail('OSV-INPUT-DRIFT');return {executable,module,argv,cwd};
}
/** Readonly original private requester join; this does not issue an attempt. */
export function inspectSourceOwnedContinuityVerificationRequesterFloor(input){
  osvExact(input,['repository','requesterHandle','currentInvocationHandle','runtimePort']);
  const r=repository(input.repository),context=active.getStore(),entry=requesters.get(input.requesterHandle);
  if(!context?.lifetime.live||context.requesterHandle!==input.requesterHandle||context.runtimePort!==input.runtimePort
    ||!entry||entry.runtimePort!==input.runtimePort||!sameRepository(r,entry.repository)
    ||(entry.currentInvocationHandle??null)!==input.currentInvocationHandle)osvFail('OSV-OWNER-UNAVAILABLE');
  const b=checkRequester(entry),observed=inspectSourceOwnedCurrentAuthorityContext({repository:r});
  if(observed.status!=='bound'||observed.requesterHandle!==input.requesterHandle
    ||observed.assurance==='controlled-unit-method')osvFail('OSV-OWNER-UNAVAILABLE');
  const original=entry.currentInvocationHandle?invocations.get(entry.currentInvocationHandle)?.process:entry.child?.process;
  const actual=osvObservedProcess(process.pid);if(!original||!osvSameProcess(original,actual))osvFail('OSV-OWNER-UNAVAILABLE');
  const secret=entry.capability??entry.child?.transportCapability;
  if(!SHA.test(secret)||hash(secret)!==b.transportSha256)osvFail('OSV-OWNER-UNAVAILABLE');
  const program=osvProgram(actual);if(program.cwd!==r.primaryRoot)osvFail('OSV-INPUT-DRIFT');
  if(process.platform==='win32')program.nativePrivateRefs=[entry.bindingRef,observed.sourceRef,...(entry.transportRef?[entry.transportRef]:[])].map(ref=>({ref:{...ref},nativeFactsSha256:osvWindowsPrivate(r,ref).nativeFactsSha256}));
  return Object.freeze({repository:r,currentRequester:structuredClone(observed.currentRequester),
    bindingRef:{...entry.bindingRef},transportRef:entry.transportRef===null?null:{...entry.transportRef},
    bindingTransportSha256:b.transportSha256,sourceRef:{...observed.sourceRef},
    invocationBindingSha256:observed.invocationBindingSha256,controllerIdentity:{...actual},program});
}

// Inert additive Source fragment. The issuer namespace is imported only in the
// composed product post; author checks this file with node --check only.
function osvIssuer(data){
  const context=active.getStore();
  if(!context?.lifetime.live||context!==data.context||context.runtimePort!==data.runtimePort
    ||context.requesterHandle!==data.requesterHandle)osvFail('OSV-OWNER-UNAVAILABLE');
  const actual=continuityVerificationIssuer.inspectSourceOwnedContinuityVerificationAttempt({
    verificationAttemptHandle:data.verificationAttemptHandle,runtimePort:data.runtimePort});
  if(actual?.status!=='current')osvFail(actual?.code??'OSV-OWNER-UNAVAILABLE');
  osvBinding(actual.binding,actual.bindingSha256);osvSame(actual.binding,data.binding);
  if(actual.bindingSha256!==data.bindingSha256)osvFail('OSV-INPUT-DRIFT');
  const floor=inspectSourceOwnedContinuityVerificationRequesterFloor({repository:data.binding.repository,
    requesterHandle:data.requesterHandle,currentInvocationHandle:data.entry.currentInvocationHandle??null,runtimePort:data.runtimePort});
  osvSameFloor(floor,data.binding.requesterFloor);osvRemaining(data.deadline);
  if(actual.deadlineRemainingMs<1)osvFail('OSV-EXPIRED');return actual;
}
function osvCaptureCurrent(c){
  if(!c||c.closed||!ownedChildren.has(c.child)||c.data.ended)osvFail('OSV-EXCHANGE-UNAVAILABLE');
  osvIssuer(c.data);currentProcess(c.process);currentProcess(c.controller);
  if(process.platform==='win32')osvWindowsSpawnCurrent(c);
  else if(observedPosixCwd(c.process)!==c.entry.cwd
    ||c.process.argvSha256!==processArgvDigest([c.entry.executable.path,...c.entry.argv]))osvFail('OSV-INPUT-DRIFT');
  const actual=JSON.parse(readPrivate(c.data.binding.repository,c.sourceRef));
  osvSame(actual,c.capture);osvEntry(c.data.binding,c.kind);return c;
}
function osvOriginData(c){
  return {binding:c.data.binding,bindingSha256:c.data.bindingSha256,capture:{kind:c.kind,
    controllerIdentity:c.controller,childIdentity:c.process,childSourceRef:c.sourceRef,
    childInvocationBindingSha256:c.invocationBindingSha256},
    capabilitySha256:c.data.binding.requesterFloor.bindingTransportSha256,challengeSha256:c.challengeSha256};
}
export function inspectSourceOwnedContinuityVerificationParentOriginExchange({exchangeHandle}){
  const x=osvExchanges.get(exchangeHandle);if(!x?.live||x.side!=='parent'||!SHA.test(x.child.challengeSha256))osvFail();
  return Object.freeze(osvOriginData(osvCaptureCurrent(x.child)));
}
export function inspectSourceOwnedContinuityVerificationExchange(input){
  osvExact(input,['exchangeHandle']);const x=osvExchanges.get(input.exchangeHandle);
  if(!x?.live||x.side!=='parent')osvFail();
  if(x.failure){
    const data=x.data,context=active.getStore();
    if(osvAttempts.get(data.verificationAttemptHandle)!==data||context!==data.context||!context?.lifetime.live
      ||context.runtimePort!==data.runtimePort||context.requesterHandle!==data.requesterHandle
      ||!data.failureTerminal||!SHA.test(x.challengeSha256))osvFail('OSV-OWNER-UNAVAILABLE');
    const c=x.child,entry=data.binding[x.kind];
    return Object.freeze({verificationAttemptHandle:data.verificationAttemptHandle,runtimePort:data.runtimePort,
      phase:'terminal',kind:x.kind,bindingSha256:data.bindingSha256,challengeSha256:x.challengeSha256,
      controllerIdentity:structuredClone(data.binding.requesterFloor.controllerIdentity),childIdentity:c?.process?{...c.process}:null,
      childSourceRef:c?.sourceRef?{...c.sourceRef}:null,childInvocationBindingSha256:c?.invocationBindingSha256??null,
      executable:entry.executable.path,argv:[...entry.argv],cwd:entry.cwd,commandSha256:data.binding.commandSha256,
      terminal:structuredClone(data.failureTerminal)});
  }
  const c=x.child;osvIssuer(c.data);
  if(x.phase==='terminal'){
    if(!c.closed||!c.acknowledged||!c.closeValue?.closeObserved||c.terminal===null)osvFail('OSV-TERMINAL-UNAVAILABLE');
  }else osvCaptureCurrent(c);
  return Object.freeze({verificationAttemptHandle:c.data.verificationAttemptHandle,runtimePort:c.data.runtimePort,
    phase:x.phase,kind:c.kind,bindingSha256:c.data.bindingSha256,challengeSha256:c.challengeSha256,
    controllerIdentity:{...c.controller},childIdentity:{...c.process},childSourceRef:{...c.sourceRef},
    childInvocationBindingSha256:c.invocationBindingSha256,executable:c.entry.executable.path,
    argv:[...c.entry.argv],cwd:c.entry.cwd,commandSha256:c.data.binding.commandSha256,
    terminal:x.phase==='terminal'?structuredClone(c.terminal):null});
}
function osvProof(secret,request,response){return digest({schema:'pipeline.owned-verification.proof.v1',secret,request,response});}
function osvCaptureOutput(stream){
  const hasher=createHash('sha256');let bytes=0,exceeded=false;
  stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>16777216)exceeded=true;hasher.update(chunk);});
  return ()=>({sha256:hasher.digest('hex'),bytes,exceeded});
}
async function osvSpawn(data,kind){
  const observed=osvIssuer(data);const entry=osvEntry(data.binding,kind);
  const windowsTransport=process.platform==='win32'?windowsRequesterRuntime.spawnWindowsRequesterChannel({storage:osvWindowsStorage(data.binding.repository),route:kind}):null;
  const child=windowsTransport?.child??spawn(entry.executable.path,entry.argv,{cwd:entry.cwd,env:process.env,shell:false,stdio:['ignore','pipe','pipe','ignore','pipe']});
  ownedChildren.add(child);const output=osvCaptureOutput(child.stdout),errors=osvCaptureOutput(child.stderr);
  let resolveClose;const close=new Promise(resolve=>{resolveClose=resolve;});let errorCode=null;
  const c={data,kind,entry,child,closed:false,acknowledged:false,terminal:null,challengeSha256:null};data.children.push(c);
  child.once('error',error=>{errorCode=typeof error?.code==='string'?error.code:'SPAWN-ERROR';});
  child.once('close',(code,signal)=>{
    c.closed=true;c.closeValue={code,signal:signal??null,errorCode,closeObserved:true,childIdentity:c.process?{...c.process}:null};
    c.captures={stdout:output(),stderr:errors()};resolveClose(c.closeValue);
  });c.close=close;
  if(!windowsTransport)await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Object.assign(new Error('owned verification unavailable'),{code:'OSV-EXPIRED'})),Math.min(10000,osvRemaining(data.deadline)));
    child.once('spawn',()=>{clearTimeout(timer);resolve();});child.once('error',()=>{clearTimeout(timer);reject(Object.assign(new Error('owned verification unavailable'),{code:'OSV-EXCHANGE-UNAVAILABLE'}));});
  });
  c.process=osvObservedProcess(child.pid);c.controller=osvObservedProcess(process.pid);
  if(!c.process||c.process.parentPid!==process.pid||!osvSameProcess(c.controller,data.binding.requesterFloor.controllerIdentity)
    ||c.process.executable!==entry.executable.path||c.process.argvSha256!==processArgvDigest([entry.executable.path,...entry.argv]))osvFail('OSV-INPUT-DRIFT');
  if(windowsTransport){c.windowsSpawnOrigin=windowsRequesterRuntime.readWindowsRequesterSpawnOrigin({child});osvWindowsSpawnCurrent(c);}
  c.capture={schema:'pipeline.owned-continuity-verification.child.v1',kind,bindingSha256:data.bindingSha256,
    process:c.process,controllerIdentity:c.controller,spawnRequest:{executablePath:entry.executable.path,args:entry.argv,cwd:entry.cwd},
    parentRequesterBindingRef:data.binding.requesterFloor.bindingRef,
    ...(windowsTransport?{windowsSpawnOrigin:c.windowsSpawnOrigin}:{})};
  c.sourceRef=publish(data.binding.repository,join(ensureNamespace(data.binding.repository),'invocations','child-'+randomBytes(12).toString('hex')+'.json'),c.capture);
  c.invocationBindingSha256=digest(c.capture);c.wire=windowsTransport?osvWindowsWire(windowsTransport.channel,data.deadline):osvWire(child.stdio[4],data.deadline);
  c.exchange=opaque(osvExchanges,{side:'parent',live:true,child:c,phase:kind==='guard'?'guard-challenge':'executor-challenge'});
  await c.wire.write({schema:'pipeline.owned-verification.offer.v1',kind,binding:data.binding,bindingSha256:data.bindingSha256,
    capture:osvOriginData(c).capture,capability:data.secret,deadlineRemainingMs:Math.min(observed.deadlineRemainingMs,osvRemaining(data.deadline))});
  const challenge=await c.wire.read();osvExact(challenge,['schema','kind','bindingSha256','nonce']);
  if(challenge.schema!=='pipeline.owned-verification.challenge.v1'||challenge.kind!==kind||challenge.bindingSha256!==data.bindingSha256||!SHA.test(challenge.nonce))osvFail('OSV-REPLAY');
  c.challengeSha256=digest(challenge);osvCaptureCurrent(c);
  const originHandle=managedRequesterOwner.createSourceOwnedContinuityVerificationOrigin({exchangeHandle:c.exchange});
  const origin=managedRequesterOwner.observeSourceOwnedContinuityVerificationOrigin({originHandle,exchangeHandle:c.exchange});
  const transition=kind==='guard'?continuityVerificationIssuer.claimSourceOwnedContinuityVerificationAttempt({verificationAttemptHandle:data.verificationAttemptHandle,runtimePort:data.runtimePort,guardExchangeHandle:c.exchange})
    :continuityVerificationIssuer.startSourceOwnedContinuityVerificationAttempt({verificationAttemptHandle:data.verificationAttemptHandle,runtimePort:data.runtimePort,executorExchangeHandle:c.exchange});
  if(transition?.status!==(kind==='guard'?'claimed':'running')||transition.bindingSha256!==data.bindingSha256)osvFail(transition?.code??'OSV-OWNER-UNAVAILABLE');
  const response={schema:'pipeline.owned-verification.authenticated.v1',kind,bindingSha256:data.bindingSha256,nonce:challenge.nonce,
    origin,deadlineRemainingMs:Math.min(osvIssuer(data).deadlineRemainingMs,osvRemaining(data.deadline))};
  await c.wire.write({...response,proofSha256:osvProof(data.secret,challenge,response)});return c;
}
async function osvParentRequest(c){
  const request=await c.wire.read();osvExact(request,['schema','kind','bindingSha256','nonce','sequence','action','payload']);
  if(request.schema!=='pipeline.owned-verification.request.v1'||request.kind!==c.kind||request.bindingSha256!==c.data.bindingSha256
    ||!SHA.test(request.nonce)||request.sequence!==(c.sequence??0)+1||c.nonces?.has(request.nonce))osvFail('OSV-REPLAY');
  c.sequence=request.sequence;(c.nonces??=new Set()).add(request.nonce);
  osvCaptureCurrent(c);return request;
}
async function osvReply(c,request,payload){
  const response={schema:'pipeline.owned-verification.reply.v1',kind:c.kind,bindingSha256:c.data.bindingSha256,
    nonce:request.nonce,sequence:request.sequence,action:request.action,payload,
    deadlineRemainingMs:Math.min(osvIssuer(c.data).deadlineRemainingMs,osvRemaining(c.data.deadline))};
  await c.wire.write({...response,proofSha256:osvProof(c.data.secret,request,response)});
}
/** Source fixes both children; this accepts only the original I03 attempt. */
export async function spawnSourceOwnedContinuityVerificationChild(input,runtimePort){
  let data;
  try{
    osvExact(input,['verificationAttemptHandle']);if(osvAttempts.has(input.verificationAttemptHandle))osvFail('OSV-REPLAY');
    const context=active.getStore(),entry=context?.requesterHandle?requesters.get(context.requesterHandle):null;
    if(!context?.lifetime.live||context.runtimePort!==runtimePort||!entry||entry.runtimePort!==runtimePort)osvFail('OSV-OWNER-UNAVAILABLE');
    const observed=continuityVerificationIssuer.inspectSourceOwnedContinuityVerificationAttempt({verificationAttemptHandle:input.verificationAttemptHandle,runtimePort});
    if(observed?.status!=='current'||observed.state!=='pending')osvFail(observed?.code??'OSV-OWNER-UNAVAILABLE');
    osvBinding(observed.binding,observed.bindingSha256);
    const secret=entry.capability??entry.child?.transportCapability;
    if(!SHA.test(secret)||hash(secret)!==observed.binding.requesterFloor.bindingTransportSha256)osvFail('OSV-OWNER-UNAVAILABLE');
    data={verificationAttemptHandle:input.verificationAttemptHandle,runtimePort,requesterHandle:context.requesterHandle,
      context,entry,binding:structuredClone(observed.binding),bindingSha256:observed.bindingSha256,
      deadline:osvDeadline(observed.deadlineRemainingMs),secret,children:[],ended:false};osvAttempts.set(input.verificationAttemptHandle,data);
    const guard=await osvSpawn(data,'guard'),decisionRequest=await osvParentRequest(guard);
    if(decisionRequest.action!=='guard-decision')osvFail('OSV-REPLAY');
    const decision=osvExact(decisionRequest.payload,['exitCode','code','commandSha256']);
    if(![0,2].includes(decision.exitCode)||decision.code!==(decision.exitCode===0?'OSV-GUARD-ADMITTED':'OSV-GUARD-REFUSED')
      ||decision.commandSha256!==data.binding.commandSha256)osvFail();
    await osvReply(guard,decisionRequest,{status:'acknowledged'});guard.acknowledged=true;
    const guardClose=await osvCloseChild(guard,data.deadline);
    if(decision.exitCode!==0||guardClose.code!==0||guardClose.signal!==null||guardClose.errorCode!==null
      ||guard.captures.stdout.exceeded||guard.captures.stderr.exceeded)osvFail('OSV-VERIFY-FAILED');
    const executor=await osvSpawn(data,'executor');let journal=null;
    while(journal===null){const request=await osvParentRequest(executor);
      if(request.action==='inspect'){if(request.payload!==null)osvFail();await osvReply(executor,request,{status:'current'});}
      else if(request.action==='journal-terminal'){journal=osvReadJournal(data.binding,request.payload);await osvReply(executor,request,{status:'acknowledged'});executor.acknowledged=true;}
      else osvFail('OSV-REPLAY');
    }
    const outerClose=await osvCloseChild(executor,data.deadline);executor.terminal={journal,outerClose,captures:executor.captures};
    if(executor.captures.stdout.exceeded||executor.captures.stderr.exceeded)osvFail('OSV-TERMINAL-UNAVAILABLE');
    const x=osvExchanges.get(executor.exchange);x.phase='terminal';
    const terminal=continuityVerificationIssuer.completeSourceOwnedContinuityVerificationAttempt({
      verificationAttemptHandle:data.verificationAttemptHandle,runtimePort,terminalExchangeHandle:executor.exchange});
    if(!['succeeded','failed'].includes(terminal?.status))osvFail(terminal?.code??'OSV-TERMINAL-UNAVAILABLE');return terminal;
  }catch(error){
    const code=OSV_CODES.has(error?.code)?error.code:'OSV-EXCHANGE-UNAVAILABLE';
    if(data){const c=data.children.at(-1);if(c&&!c.closed){try{await osvCloseChild(c,performance.now());}catch{}}
      data.failureTerminal={journal:null,outerClose:c?.closeValue??null,captures:c?.captures??null,
        childCreated:Boolean(c?.process),code};
      const failure=opaque(osvExchanges,{side:'parent',live:true,failure:true,data,child:c??null,kind:c?.kind??'guard',
        phase:'terminal',challengeSha256:c?.challengeSha256??hash(randomBytes(32))});
      try{continuityVerificationIssuer.completeSourceOwnedContinuityVerificationAttempt({
        verificationAttemptHandle:data.verificationAttemptHandle,runtimePort:data.runtimePort,terminalExchangeHandle:failure});
      }catch{}finally{osvExchanges.get(failure).live=false;}
    }
    return {status:'unavailable',code};
  }finally{
    if(data){data.ended=true;data.secret=null;
      for(const c of data.children){const x=osvExchanges.get(c.exchange);if(x)x.live=false;c.wire?.revoke();
        if(!c.closed&&c.process){try{currentProcess(c.process);c.child.kill('SIGTERM');}catch{}}
        if(!c.closed){try{await osvCloseChild(c,performance.now()+750);}catch{}}
      }
    }
  }
}

// Inert Source fragment: actual inherited exchange only, no caller FD selector.
function osvChildPrimitive(c){
  if(process.platform==='win32')return osvWindowsChildPrimitive(c);
  if(!c?.live||c.finished||c.signal.aborted)osvFail('OSV-EXCHANGE-UNAVAILABLE');
  osvRemaining(c.deadline);c.wire.check();osvBinding(c.binding,c.bindingSha256);
  const actual=observePosixProcess(process.pid),parent=observePosixProcess(actual?.parentPid);
  if(!sameProcess(c.capture.childIdentity,actual)||!sameProcess(c.capture.controllerIdentity,parent)
    ||actual.parentPid!==parent.pid||parent.pid!==process.ppid)osvFail('OSV-OWNER-UNAVAILABLE');
  const floor=c.binding.requesterFloor;if(!sameProcess(floor.controllerIdentity,c.capture.controllerIdentity))osvFail('OSV-INPUT-DRIFT');
  osvExact(floor.program,['executable','module','argv','cwd']);osvPhysical(floor.program.executable);osvPhysical(floor.program.module);
  const argv=observedPosixArgv(parent);
  if(!argv.includes(floor.program.module.path)||floor.program.cwd!==c.binding.repository.primaryRoot
    ||observedPosixCwd(parent)!==floor.program.cwd||parent.executable!==floor.program.executable.path)osvFail('OSV-INPUT-DRIFT');
  osvSame(argv,floor.program.argv);
  const original=JSON.parse(readPrivate(c.binding.repository,floor.bindingRef));
  if(original.transportSha256!==hash(c.secret)||original.transportSha256!==floor.bindingTransportSha256)osvFail('OSV-OWNER-UNAVAILABLE');
  const entry=osvEntry(c.binding,c.kind);
  if(actual.executable!==entry.executable.path||actual.argvSha256!==processArgvDigest([entry.executable.path,...entry.argv])
    ||observedPosixCwd(actual)!==entry.cwd)osvFail('OSV-INPUT-DRIFT');
  const captured=JSON.parse(readPrivate(c.binding.repository,c.capture.childSourceRef));
  if(captured.schema!=='pipeline.owned-continuity-verification.child.v1'||captured.kind!==c.kind
    ||captured.bindingSha256!==c.bindingSha256||digest(captured)!==c.capture.childInvocationBindingSha256
    ||!sameProcess(captured.process,actual)||!sameProcess(captured.controllerIdentity,parent))osvFail('OSV-INPUT-DRIFT');
  return c;
}
export function inspectSourceOwnedContinuityVerificationChildOriginExchange({exchangeHandle}){
  const x=osvExchanges.get(exchangeHandle);if(!x?.live||x.side!=='child')osvFail();
  const c=osvChildPrimitive(x.context);return Object.freeze({binding:c.binding,bindingSha256:c.bindingSha256,
    capture:c.capture,capabilitySha256:hash(c.secret),challengeSha256:c.challengeSha256});
}
function osvChildCurrent(c){
  osvChildPrimitive(c);
  const actual=managedRequesterOwner.inspectSourceOwnedContinuityVerificationOrigin({originHandle:c.originHandle});
  osvSame(actual,c.origin);return c;
}
async function osvConsume(kind){
  let c,wire;
  try{
    const controller=new AbortController();wire=process.platform==='win32'?osvWindowsWire(windowsRequesterRuntime.adoptInheritedWindowsRequesterChannel(),performance.now()+OSV_TTL_MAX,controller):osvWire(osvInheritedSocket(),performance.now()+OSV_TTL_MAX,controller);
    const offer=await wire.read();osvExact(offer,['schema','kind','binding','bindingSha256','capture','capability','deadlineRemainingMs']);
    if(offer.schema!=='pipeline.owned-verification.offer.v1'||offer.kind!==kind||!SHA.test(offer.capability))osvFail();
    osvExact(offer.capture,['kind','controllerIdentity','childIdentity','childSourceRef','childInvocationBindingSha256']);
    if(offer.capture.kind!==kind)osvFail();osvBinding(offer.binding,offer.bindingSha256);
    c={kind,wire,binding:offer.binding,bindingSha256:offer.bindingSha256,capture:offer.capture,
      secret:offer.capability,deadline:osvDeadline(offer.deadlineRemainingMs),signal:controller.signal,
      abortController:controller,live:true,finished:false,sequence:0,challengeSha256:null};
    c.expiry=setTimeout(()=>{controller.abort();wire.revoke();},osvRemaining(c.deadline));osvChildPrimitive(c);
    const challenge={schema:'pipeline.owned-verification.challenge.v1',kind,bindingSha256:c.bindingSha256,nonce:randomBytes(32).toString('hex')};
    c.challengeSha256=digest(challenge);await wire.write(challenge);
    const response=await wire.read();osvExact(response,['schema','kind','bindingSha256','nonce','origin','deadlineRemainingMs','proofSha256']);
    const {proofSha256,...body}=response;
    if(body.schema!=='pipeline.owned-verification.authenticated.v1'||body.kind!==kind||body.bindingSha256!==c.bindingSha256
      ||body.nonce!==challenge.nonce||proofSha256!==osvProof(c.secret,challenge,body))osvFail();
    const remaining=osvDeadline(body.deadlineRemainingMs);c.deadline=Math.min(c.deadline,remaining);
    c.exchange=opaque(osvExchanges,{side:'child',context:c,live:true});
    c.originHandle=managedRequesterOwner.readSourceOwnedContinuityVerificationOrigin({exchangeHandle:c.exchange});
    c.origin=managedRequesterOwner.inspectSourceOwnedContinuityVerificationOrigin({originHandle:c.originHandle});
    osvSame(c.origin,body.origin);osvChildCurrent(c);
    const handle=opaque(osvChildContexts,c);return kind==='guard'?{guardContextHandle:handle}:{verificationContextHandle:handle};
  }catch(error){if(c){c.live=false;clearTimeout(c.expiry);c.wire.revoke();c.secret=null;}else wire?.revoke();
    osvFail(OSV_CODES.has(error?.code)?error.code:'OSV-EXCHANGE-UNAVAILABLE');}
}
export async function consumeSourceOwnedContinuityVerificationExchange(){if(arguments.length!==0)osvFail();return osvConsume('guard');}
export async function consumeSourceOwnedContinuityVerificationExecutorExchange(){if(arguments.length!==0)osvFail();return osvConsume('executor');}
function osvChildHandle(input,key,kind){osvExact(input,[key]);const c=osvChildContexts.get(input[key]);if(c?.kind!==kind)osvFail();return osvChildCurrent(c);}
export function inspectSourceOwnedContinuityVerificationGuardContext(input){
  const c=osvChildHandle(input,'guardContextHandle','guard'),b=c.binding;
  return Object.freeze({repository:b.repository.primaryRoot,executable:b.executor.executable.path,argv:[...b.executor.argv],
    cwd:b.executor.cwd,command:b.command,commandSha256:b.commandSha256,bindingSha256:c.bindingSha256,
    candidateCommit:b.candidate.commit,candidateTree:b.candidate.tree,courseSha256:b.courseSha256,suiteSha256:b.suiteSha256});
}
async function osvChildRequest(c,action,payload){
  if(c.pending)osvFail('OSV-REPLAY');c.pending=true;
  try{osvChildCurrent(c);const request={schema:'pipeline.owned-verification.request.v1',kind:c.kind,
      bindingSha256:c.bindingSha256,nonce:randomBytes(32).toString('hex'),sequence:++c.sequence,action,payload};
    await c.wire.write(request);const response=await c.wire.read();
    osvExact(response,['schema','kind','bindingSha256','nonce','sequence','action','payload','deadlineRemainingMs','proofSha256']);
    const {proofSha256,...body}=response;
    if(body.schema!=='pipeline.owned-verification.reply.v1'||body.kind!==c.kind||body.bindingSha256!==c.bindingSha256
      ||body.nonce!==request.nonce||body.sequence!==request.sequence||body.action!==action
      ||proofSha256!==osvProof(c.secret,request,body))osvFail();
    c.deadline=Math.min(c.deadline,osvDeadline(body.deadlineRemainingMs));osvChildCurrent(c);return body.payload;
  }finally{c.pending=false;}
}
async function osvChildFinish(c){
  c.finished=true;c.live=false;clearTimeout(c.expiry);const x=osvExchanges.get(c.exchange);if(x)x.live=false;
  c.secret=null;await c.wire.finish();
}
export async function finishSourceOwnedContinuityVerificationGuardExchange(input){
  osvExact(input,['guardContextHandle','decision']);const c=osvChildHandle({guardContextHandle:input.guardContextHandle},'guardContextHandle','guard');
  const decision=osvExact(input.decision,['exitCode','code','commandSha256']);
  if(![0,2].includes(decision.exitCode)||decision.code!==(decision.exitCode===0?'OSV-GUARD-ADMITTED':'OSV-GUARD-REFUSED')
    ||decision.commandSha256!==c.binding.commandSha256)osvFail();
  const reply=await osvChildRequest(c,'guard-decision',decision);osvSame(reply,{status:'acknowledged'});await osvChildFinish(c);return reply;
}
export async function inspectSourceOwnedContinuityVerificationExecutorContext(input){
  const c=osvChildHandle(input,'verificationContextHandle','executor');
  const reply=await osvChildRequest(c,'inspect',null);osvSame(reply,{status:'current'});
  return Object.freeze({bindingSha256:c.bindingSha256,binding:structuredClone(c.binding),signal:c.signal});
}
export async function finalizeSourceOwnedContinuityVerificationExecutorExchange(input){
  osvExact(input,['verificationContextHandle','terminal']);
  const c=osvChildHandle({verificationContextHandle:input.verificationContextHandle},'verificationContextHandle','executor'),actual=input.terminal;
  if(!object(actual)||typeof actual.runId!=='string'||typeof actual.runDir!=='string'||!SHA.test(actual.policySha256)
    ||!Array.isArray(actual.steps)||actual.steps.length>1)osvFail('OSV-TERMINAL-UNAVAILABLE');
  const projection={runId:actual.runId,runDir:actual.runDir,policySha256:actual.policySha256,
    terminal:actual.terminal??null,status:actual.status??null,interruption:actual.interruption??null,steps:actual.steps};
  const reply=await osvChildRequest(c,'journal-terminal',projection);osvSame(reply,{status:'acknowledged'});
  await osvChildFinish(c);return reply;
}

// Inert Source fragment. Real durable journal readback is required before ACK;
// the child's claimed status or an alive acknowledgment cannot prove completion.
function osvEvidence(path,maxBytes=4*1024*1024,json=true){
  if(process.platform==='win32')return osvWindowsEvidence(path,maxBytes,json);
  if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path)osvFail('OSV-TERMINAL-UNAVAILABLE');
  let cursor=dirname(path);while(true){const s=lstatSync(cursor);if(!s.isDirectory()||s.isSymbolicLink()
      ||realpathSync(cursor)!==cursor||(s.mode&0o022)!==0)osvFail('OSV-TERMINAL-UNAVAILABLE');
    const parent=dirname(cursor);if(parent===cursor)break;cursor=parent;}
  const before=lstatSync(path);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1
    ||before.uid!==process.getuid()||(before.mode&0o077)!==0||before.size>maxBytes||realpathSync(path)!==path)osvFail('OSV-TERMINAL-UNAVAILABLE');
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
  try{osvSame(identity(before),identity(fstatSync(fd)));bytes=Buffer.alloc(before.size);let at=0;
    while(at<bytes.length){const n=readSync(fd,bytes,at,bytes.length-at,at);if(n===0)osvFail('OSV-TERMINAL-UNAVAILABLE');at+=n;}
    if(readSync(fd,Buffer.alloc(1),0,1,at)!==0)osvFail('OSV-TERMINAL-UNAVAILABLE');
    osvSame(identity(before),identity(fstatSync(fd)));osvSame(identity(before),identity(lstatSync(path)));
  }finally{closeSync(fd);}
  const ref={path,sha256:hash(bytes),size:bytes.length,identity:identity(before)};
  return {ref,value:json?parseStrictJson(bytes):null,bytes:json?null:bytes};
}
function osvRecordDigest(value,key){const {[key]:claimed,...body}=value;if(digest(body)!==claimed)osvFail('OSV-TERMINAL-UNAVAILABLE');}
function osvReadJournal(binding,projection){
  osvExact(projection,['runId','runDir','policySha256','terminal','status','interruption','steps']);
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(projection.runId)||!SHA.test(projection.policySha256)
    ||projection.runDir!==join(binding.repository.commonDir,'agent-pipeline','verify','runs',projection.runId)
    ||!Array.isArray(projection.steps)||projection.steps.length>1)osvFail('OSV-TERMINAL-UNAVAILABLE');
  const runDir=projection.runDir,manifest=osvEvidence(join(runDir,'manifest.json'));
  if(manifest.value.schema!=='pipeline.verify-run-manifest.v1'||manifest.value.runId!==projection.runId
    ||manifest.value.policySha256!==projection.policySha256||manifest.value.suites?.length!==1)osvFail('OSV-TERMINAL-UNAVAILABLE');
  osvRecordDigest(manifest.value,'manifestSha256');osvSame(manifest.value.candidate,binding.candidate);
  const selected=binding.selectedSuite,registered=manifest.value.suites[0];
  if(registered.id!==selected.name)osvFail('OSV-TERMINAL-UNAVAILABLE');
  osvSame(registered.caseCompletion,selected.caseCompletion??null);
  const progress=osvEvidence(join(runDir,'progress.jsonl'),16777216,false);
  const lines=new TextDecoder('utf-8',{fatal:true}).decode(progress.bytes);
  if(!lines.endsWith('\n'))osvFail('OSV-TERMINAL-UNAVAILABLE');
  const events=lines.slice(0,-1).split('\n').map(line=>parseStrictJson(Buffer.from(line)));
  if(events.length>4096||events.some(e=>e.runId!==projection.runId||e.suite!==selected.name))osvFail('OSV-TERMINAL-UNAVAILABLE');
  for(const event of events)osvSame(event.candidate,binding.candidate);
  if(projection.status==='interrupted'){
    if(projection.terminal!==null||projection.interruption===null)osvFail('OSV-TERMINAL-UNAVAILABLE');
    const interruption=osvEvidence(join(runDir,'interruption.json'));osvSame(interruption.value,projection.interruption);
    osvRecordDigest(interruption.value,'interruptionSha256');osvSame(interruption.value.candidate,binding.candidate);
    if(interruption.value.schema!=='pipeline.verify-run-interruption.v1'||interruption.value.runId!==projection.runId
      ||interruption.value.policySha256!==projection.policySha256||interruption.value.terminal!==null)osvFail('OSV-TERMINAL-UNAVAILABLE');
    return {runId:projection.runId,runDir,policySha256:projection.policySha256,candidate:binding.candidate,
      terminal:null,status:'interrupted',interruption:interruption.value,steps:projection.steps,
      dispatchedSuiteCount:interruption.value.dispatchedSuiteCount,refs:[manifest.ref,progress.ref,interruption.ref],caseCompletion:null};
  }
  if(projection.status!==null||projection.interruption!==null||projection.terminal===null)osvFail('OSV-TERMINAL-UNAVAILABLE');
  const terminal=osvEvidence(join(runDir,'terminal.json')),plan=osvEvidence(join(runDir,'resume-plan.json'));
  osvSame(terminal.value,projection.terminal);osvRecordDigest(terminal.value,'terminalSha256');osvRecordDigest(plan.value,'planSha256');
  if(terminal.value.schema!=='pipeline.verify-run-terminal.v1'||terminal.value.runId!==projection.runId
    ||terminal.value.policySha256!==projection.policySha256||terminal.value.planSha256!==plan.value.planSha256
    ||terminal.value.journalSha256!==progress.ref.sha256||!['passed','failed'].includes(terminal.value.status))osvFail('OSV-TERMINAL-UNAVAILABLE');
  osvSame(terminal.value.candidate,binding.candidate);osvSame(plan.value.candidate,binding.candidate);
  if(plan.value.reusable?.length!==0||plan.value.rerun?.length!==1||plan.value.rerun[0]!==selected.name)osvFail('OSV-TERMINAL-UNAVAILABLE');
  const receipt=osvEvidence(join(runDir,'receipts',hash(selected.name)+'.json'));
  const checked=validateVerifySuiteReceipt(receipt.value);if(checked.ok!==true)osvFail('OSV-TERMINAL-UNAVAILABLE');
  const r=receipt.value;
  if(r.runId!==projection.runId||r.suite!==selected.name||r.policySha256!==projection.policySha256
    ||r.implementationSha256!==registered.implementationSha256||r.environmentContractSha256!==registered.environmentContractSha256
    ||!Array.isArray(terminal.value.receipts)||terminal.value.receipts.length!==1||terminal.value.receipts[0]!==r.receiptSha256)osvFail('OSV-TERMINAL-UNAVAILABLE');
  osvSame(r.inputs,registered.inputs);osvSame(r.candidate,binding.candidate);
  if(!validateVerifyCaseCompletionPolicy(selected.caseCompletion)||!validateVerifyCaseCompletionAttestation(r.caseCompletion)
    ||r.caseCompletion.policySha256!==verifyCaseCompletionPolicySha256(selected.caseCompletion)
    ||r.caseCompletion.declaredCount!==selected.caseCompletion.caseIds.length
    ||r.caseCompletion.caseSetSha256!==digest(selected.caseCompletion.caseIds))osvFail('OSV-TERMINAL-UNAVAILABLE');
  const log=osvEvidence(join(runDir,'logs',hash(selected.name)+'.log'),16777216,false);
  if(r.log.path!=='logs/'+hash(selected.name)+'.log'||r.log.fileSha256!==log.ref.sha256||r.log.byteLength!==log.ref.size)osvFail('OSV-TERMINAL-UNAVAILABLE');
  const started=events.filter(e=>e.state==='started'),completed=events.filter(e=>e.state==='completed');
  if(started.length!==1||completed.length!==1||events.some(e=>e.state==='reused')
    ||completed[0].receiptSha256!==r.receiptSha256||projection.steps.length!==1)osvFail('OSV-TERMINAL-UNAVAILABLE');
  const step=osvExact(projection.steps[0],['name','exitCode','receiptSha256','reused','durationMs']);
  if(step.name!==selected.name||step.exitCode!==r.exitCode||step.receiptSha256!==r.receiptSha256||step.reused!==false
    ||!Number.isFinite(step.durationMs)||step.durationMs<0
    ||terminal.value.status!==(r.exitCode===0?'passed':'failed'))osvFail('OSV-TERMINAL-UNAVAILABLE');
  // Reopen every readback after reading all files; a replacement or byte drift
  // during assembly cannot be hidden by a separately successful receipt read.
  for(const evidence of [manifest,progress,terminal,plan,receipt,log]){
    const again=osvEvidence(evidence.ref.path,evidence.ref.path.endsWith('.log')||evidence.ref.path.endsWith('.jsonl')?16777216:4*1024*1024,false);
    osvSame(again.ref,evidence.ref);
  }
  return {runId:projection.runId,runDir,policySha256:projection.policySha256,candidate:binding.candidate,
    terminal:terminal.value,status:null,interruption:null,steps:projection.steps,dispatchedSuiteCount:started.length,
    refs:[manifest.ref,progress.ref,terminal.ref,plan.ref,receipt.ref,log.ref],caseCompletion:r.caseCompletion};
}
async function osvCloseChild(c,deadline){
  if(c.closed)return c.closeValue;
  const wait=ms=>new Promise(resolve=>{const timer=setTimeout(()=>resolve(null),ms);c.close.then(value=>{clearTimeout(timer);resolve(value);});});
  const remaining=Math.max(1,Math.floor(deadline-performance.now()));const value=await wait(remaining);if(value)return value;
  c.wire?.revoke();try{currentProcess(c.process);c.child.kill('SIGTERM');}catch{}
  if(await wait(750))osvFail('OSV-EXPIRED');
  try{currentProcess(c.process);c.child.kill('SIGKILL');}catch{}
  await wait(750);osvFail(c.closed?'OSV-EXPIRED':'OSV-TERMINAL-UNAVAILABLE');
}

// Windows OSV custody only. Native observations are facts, never requester grants.
const osvWindowsStores=new Map(),osvWindowsPrivateFacts=new Map();
function osvWindowsStorage(r){
  repository(r);const key=repositoryHash(r);let handle=osvWindowsStores.get(key);
  if(!handle){handle=windowsRequesterRuntime.createWindowsRequesterStorage({repository:r});osvWindowsStores.set(key,handle);}return handle;
}
function osvWindowsRemember(r,ref,nativeFactsSha256){
  const key=repositoryHash(r)+':'+ref.path,old=osvWindowsPrivateFacts.get(key);
  if(!SHA.test(nativeFactsSha256)||old&&(old.sha256!==ref.sha256||old.size!==ref.size||old.nativeFactsSha256!==nativeFactsSha256))osvFail('OSV-INPUT-DRIFT');
  osvWindowsPrivateFacts.set(key,{sha256:ref.sha256,size:ref.size,nativeFactsSha256});
}
function osvWindowsPrivate(r,ref){
  osvExact(ref,['path','sha256','size']);
  if(typeof ref.path!=='string'||!ref.path.startsWith('.git/agent-pipeline/')||ref.path.includes('\\')
    ||ref.path.split('/').some(part=>!part||part==='.'||part==='..')||!SHA.test(ref.sha256)
    ||!Number.isSafeInteger(ref.size)||ref.size<0||ref.size>MAX)osvFail('OSV-INPUT-DRIFT');
  // Existing managed task sources are outside the requester adapter's fixed
  // namespace. Read them through the same native private-file backend rather
  // than widening adapter publication/removal routes or fabricating a ref.
  // The repository root bounds the human-controlled ancestors above it (PO decision 2026-10-17); only a private file that
  // lexically lies inside r.primaryRoot gets that boundary, every other path keeps every strict check.
  const file=join(r.commonDir,ref.path.slice(5));
  const result=ref.path.startsWith('.git/agent-pipeline/run/session-requesters/')
    ?windowsRequesterRuntime.readWindowsRequesterPrivateRef({storage:osvWindowsStorage(r),ref})
    :osvWindowsRead(file,MAX,true,osvWindowsBoundary(file,r.primaryRoot));
  if(result.bytes.length!==ref.size||hash(result.bytes)!==ref.sha256)osvFail('OSV-INPUT-DRIFT');
  osvWindowsRemember(r,ref,result.nativeFactsSha256);return result;
}
function osvObservedProcess(pid){
  if(process.platform!=='win32')return observePosixProcess(pid);
  const result=observeNativeWindowsProcess({pid});if(result.status!=='present')osvFail('OSV-OWNER-UNAVAILABLE');return result.process;
}
function osvSameProcess(a,b){
  if(process.platform!=='win32')return sameProcess(a,b);
  // Foreign cwd is explicitly unavailable. Check own cwd separately and join
  // foreign cwd ONLY to the genuine adapter's original Source spawn record.
  return a?.platform==='win32'&&b?.platform==='win32'
    &&sameNativeWindowsProcess({...a,cwd:null},{...b,cwd:null});
}
// Directories strictly above the repository root are human-controlled: observed and hashed, never refused. Returns root
// only when path lexically lies strictly inside it (case-insensitive, backslash-delimited); otherwise null keeps strict.
function osvWindowsBoundary(path,root){
  if(typeof path!=='string'||typeof root!=='string')return null;
  const base=root.replace(/\\+$/u,'');
  return path.length>base.length&&path.toLowerCase().startsWith(base.toLowerCase()+'\\')?root:null;
}
function osvWindowsAncestors(path,boundaryRoot=null){
  const rows=[];let cursor=dirname(path);while(true){const native=observeWindowsAuthorityAncestor(boundaryRoot?{path:cursor,boundaryRoot}:{path:cursor});
    rows.push({path:cursor,nativeFacts:native.nativeFacts,nativeFactsSha256:native.nativeFactsSha256,helperSha256:native.helperSha256});
    const parent=dirname(cursor);if(parent===cursor)break;cursor=parent;}return rows;
}
function osvWindowsRead(path,maxBytes,privateFile=false,boundaryRoot=null){
  if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||path.startsWith('\\\\'))osvFail('OSV-INPUT-DRIFT');
  const before=osvWindowsAncestors(path,boundaryRoot);
  const result=privateFile?readWindowsOwnedAuthorityFile({path,maxBytes:Math.min(maxBytes,1048576)}):readWindowsAuthoritySourceModule({path,maxBytes:Math.min(maxBytes,1048576)});
  osvSame(before,osvWindowsAncestors(path,boundaryRoot));return result;
}
function osvWindowsPhysicalRef(path){
  if(path===realpathSync(process.execPath)){
    const observed=inspectWindowsAuthoritySourceImage({path});
    return {path,sha256:observed.sha256,size:observed.size,identity:{platform:'win32',nativeFacts:observed.nativeFacts,nativeFactsSha256:observed.nativeFactsSha256,helperSha256:observed.helperSha256}};
  }
  const observed=osvWindowsRead(path,1048576);
  return {path,sha256:hash(observed.bytes),size:observed.bytes.length,identity:{platform:'win32',nativeFacts:observed.nativeFacts,nativeFactsSha256:observed.nativeFactsSha256,helperSha256:observed.helperSha256}};
}
function osvWindowsPhysical(ref){
  osvExact(ref,['path','sha256','size','identity']);osvExact(ref.identity,['platform','nativeFacts','nativeFactsSha256','helperSha256']);
  if(ref.identity.platform!=='win32'||!SHA.test(ref.sha256)||!Number.isSafeInteger(ref.size)||ref.size<0)osvFail('OSV-INPUT-DRIFT');
  if(ref.path===realpathSync(process.execPath)){
    const image=inspectWindowsAuthoritySourceImage({path:ref.path});
    if(image.size!==ref.size||image.sha256!==ref.sha256)osvFail('OSV-INPUT-DRIFT');
    osvSame(ref.identity,{platform:'win32',nativeFacts:image.nativeFacts,nativeFactsSha256:image.nativeFactsSha256,helperSha256:image.helperSha256});return;
  }
  if(ref.size>1048576)osvFail('OSV-INPUT-DRIFT');const observed=osvWindowsRead(ref.path,ref.size);
  if(observed.bytes.length!==ref.size||hash(observed.bytes)!==ref.sha256)osvFail('OSV-INPUT-DRIFT');
  osvSame(ref.identity,{platform:'win32',nativeFacts:observed.nativeFacts,nativeFactsSha256:observed.nativeFactsSha256,helperSha256:observed.helperSha256});
}
function osvWindowsSpawnCurrent(c){
  const origin=windowsRequesterRuntime.readWindowsRequesterSpawnOrigin({child:c.child});
  if(origin.pid!==c.process.pid||origin.stdioSlot!==4||origin.executable!==c.entry.executable.path
    ||origin.cwd!==c.entry.cwd||origin.modulePath!==c.entry.module.path||origin.moduleSha256!==c.entry.module.sha256
    ||origin.moduleNativeFacts!==c.entry.module.identity.nativeFacts)osvFail('OSV-INPUT-DRIFT');
  osvSame(origin.argv,c.entry.argv);if(c.windowsSpawnOrigin)osvSame(origin,c.windowsSpawnOrigin);
  const child=osvObservedProcess(c.process.pid),parent=osvObservedProcess(process.pid);
  if(!osvSameProcess(child,c.process)||!osvSameProcess(parent,c.controller)
    ||child.parentPid!==parent.pid||child.parentStart!==parent.start
    ||child.parentPrincipalSid!==parent.principalSid||child.principalSid!==parent.principalSid
    ||child.sessionId!==parent.sessionId||child.bootIdentity!==parent.bootIdentity
    ||parent.cwd!==c.entry.cwd)osvFail('OSV-INPUT-DRIFT');
  osvSame(child.argv,[c.entry.executable.path,...c.entry.argv]);
}
function osvWindowsWire(port,deadline,controller=null){
  const expiry=setTimeout(()=>{controller?.abort();port.revoke();},osvRemaining(deadline));
  const aborted=()=>controller?.abort();port.signal.addEventListener('abort',aborted,{once:true});
  const closed=()=>{clearTimeout(expiry);port.signal.removeEventListener('abort',aborted);};
  return Object.freeze({async read(){osvRemaining(deadline);port.check();const line=await port.readLine();osvRemaining(deadline);return parseStrictJson(Buffer.from(line));},
    async write(value){osvRemaining(deadline);await port.writeLine(canonical(value));osvRemaining(deadline);},
    check(){osvRemaining(deadline);port.check();},close(){closed();port.revoke();},revoke(){closed();controller?.abort();port.revoke();},
    async finish(){await port.finish();closed();}});
}
function osvWindowsChildPrimitive(c){
  if(!c?.live||c.finished||c.signal.aborted)osvFail();osvRemaining(c.deadline);c.wire.check();osvBinding(c.binding,c.bindingSha256);
  const actual=osvObservedProcess(process.pid),parent=osvObservedProcess(actual.parentPid),floor=c.binding.requesterFloor;
  if(!osvSameProcess(c.capture.childIdentity,actual)||!osvSameProcess(c.capture.controllerIdentity,parent)
    ||!osvSameProcess(floor.controllerIdentity,parent)||actual.parentPid!==process.ppid
    ||actual.parentStart!==parent.start||actual.parentPrincipalSid!==parent.principalSid
    ||actual.principalSid!==parent.principalSid||actual.sessionId!==parent.sessionId||actual.bootIdentity!==parent.bootIdentity)osvFail('OSV-OWNER-UNAVAILABLE');
  osvExact(floor.program,['executable','module','argv','cwd','nativePrivateRefs']);osvPhysical(floor.program.executable);osvPhysical(floor.program.module);
  osvSame(parent.argv,floor.program.argv);
  if(parent.executable!==floor.program.executable.path||floor.program.cwd!==c.binding.repository.primaryRoot)osvFail('OSV-INPUT-DRIFT');
  if(!Array.isArray(floor.program.nativePrivateRefs)||floor.program.nativePrivateRefs.length<2||floor.program.nativePrivateRefs.length>3)osvFail('OSV-INPUT-DRIFT');
  const expected=[floor.bindingRef,floor.sourceRef,...(floor.transportRef?[floor.transportRef]:[])];
  for(let i=0;i<expected.length;i++){const row=floor.program.nativePrivateRefs[i];osvExact(row,['ref','nativeFactsSha256']);osvSame(row.ref,expected[i]);
    if(osvWindowsPrivate(c.binding.repository,row.ref).nativeFactsSha256!==row.nativeFactsSha256)osvFail('OSV-INPUT-DRIFT');}
  const original=JSON.parse(readPrivate(c.binding.repository,floor.bindingRef));
  if(original.transportSha256!==hash(c.secret)||original.transportSha256!==floor.bindingTransportSha256)osvFail('OSV-OWNER-UNAVAILABLE');
  const entry=osvEntry(c.binding,c.kind),captured=JSON.parse(readPrivate(c.binding.repository,c.capture.childSourceRef));
  if(actual.executable!==entry.executable.path||actual.cwd!==entry.cwd||captured.schema!=='pipeline.owned-continuity-verification.child.v1'
    ||captured.kind!==c.kind||captured.bindingSha256!==c.bindingSha256||digest(captured)!==c.capture.childInvocationBindingSha256
    ||!osvSameProcess(captured.process,actual)||!osvSameProcess(captured.controllerIdentity,parent))osvFail('OSV-INPUT-DRIFT');
  osvSame(actual.argv,[entry.executable.path,...entry.argv]);
  const spawn=captured.windowsSpawnOrigin;osvExact(spawn,['pid','executable','argv','cwd','modulePath','moduleSha256','moduleNativeFacts','stdioSlot']);
  if(spawn.pid!==actual.pid||spawn.executable!==entry.executable.path||spawn.cwd!==entry.cwd||spawn.cwd!==floor.program.cwd
    ||spawn.modulePath!==entry.module.path||spawn.moduleSha256!==entry.module.sha256
    ||spawn.moduleNativeFacts!==entry.module.identity.nativeFacts||spawn.stdioSlot!==4)osvFail('OSV-INPUT-DRIFT');
  osvSame(spawn.argv,entry.argv);return c;
}
function osvWindowsEvidence(path,maxBytes,json){
  const result=osvWindowsRead(path,maxBytes,true),bytes=result.bytes;
  return {ref:{path,sha256:hash(bytes),size:bytes.length,identity:{platform:'win32',nativeFacts:result.nativeFacts,nativeFactsSha256:result.nativeFactsSha256,helperSha256:result.helperSha256}},value:json?parseStrictJson(bytes):null,bytes:json?null:bytes};
}

// Initial approved Controller custody is a Source event, never a portable grant.
const approvedControllerRuntimes=new Map();
function approvedControllerCourse(rootDir,currentStatePath=null){
  let observed;
  if(currentStatePath===null)observed=continuityVerificationIssuer.observeSessionCleanupState(rootDir);
  else{
    // The existing I03 bind owns a temporary private-binding/State publication
    // interval. Recheck real approval bytes here; I03 retains its own private
    // tuple/member CAS, rather than recursively inspecting that interval.
    const before=osvPhysicalRef(currentStatePath),bytes=readFileSync(currentStatePath);
    if(hash(bytes)!==before.sha256)osvFail('OSV-INPUT-DRIFT');
    osvSame(before,osvPhysicalRef(currentStatePath));
    observed={path:currentStatePath,state:parseStrictJson(bytes),stateSha256:before.sha256};
  }
  const state=observed.state;
  if((currentStatePath===null&&(!observed.neutral||observed.mode!=='active'||observed.orphanBinding))||state?.schema!=='pipeline.state.v0'||state?.planApproved!==true
    ||!state.activeFeature||typeof state.activeFeature.id!=='string')osvFail('OSV-COURSE-UNAVAILABLE');
  const submission=state.planSubmission;
  if(!submission||typeof submission.planPath!=='string'||typeof submission.specPath!=='string')osvFail('OSV-COURSE-UNAVAILABLE');
  const paths=[submission.planPath,submission.specPath];
  const refs=paths.map(path=>{if(typeof path!=='string'||isAbsolute(path)||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'))osvFail('OSV-COURSE-UNAVAILABLE');return osvPhysicalRef(resolve(rootDir,path));});
  const lifecycle=deriveApprovedControllerPlanLifecycle(state,{planSha256:refs[0].sha256,specSha256:refs[1].sha256});
  if(!lifecycle.ok||lifecycle.approvalCurrent!==true||!['approved','implementing'].includes(lifecycle.status))osvFail('OSV-COURSE-UNAVAILABLE');
  const accepted=state.planApproval?.acceptedContract;
  if(accepted){const read=readApprovedControllerAcceptedContract({dir:rootDir,envelopePath:accepted.path});
    if(!read.ok||read.envelopeSha256!==accepted.sha256)osvFail('OSV-COURSE-UNAVAILABLE');
    refs.push(osvPhysicalRef(resolve(rootDir,accepted.path)));}
  const selectedStateRef=osvPhysicalRef(observed.path);
  // Reobserve the real state reader after physical capture; no caller JSON is accepted.
  if(currentStatePath===null){const again=continuityVerificationIssuer.observeSessionCleanupState(rootDir);
    if(digest(again.state)!==digest(state)||again.path!==observed.path||again.revision!==observed.revision)osvFail('OSV-INPUT-DRIFT');}
  refs.forEach(osvPhysical);osvPhysical(selectedStateRef);
  return {observed,selectedStateRef,refs,course:{featureId:state.activeFeature.id,approvalSha256:digest({approval:state.planApproval,submission,revocation:state.planRevocation??null,refs})}};
}
function approvedControllerProgram(rootDir){
  const controller=osvObservedProcess(process.pid),program=osvProgram(controller);
  const module=fileURLToPath(new URL('../scripts/owning-verification-controller.mjs',import.meta.url));
  const args=process.argv.slice(2);
  if(program.module.path!==module||program.cwd!==rootDir||args.length!==6||args[0]!=='--root'||args[1]!==rootDir
    ||args[2]!=='--suite'||!ID.test(args[3])||args[4]!=='--task-source'||!isAbsolute(args[5])||resolve(args[5])!==args[5])osvFail('OSV-OWNER-UNAVAILABLE');
  // The ordinary task-content input selects no authority; retain its genuine physical image.
  const taskSourceRef=osvPhysicalRef(args[5]);
  if(relative(rootDir,args[5]).startsWith('..'+sep)||relative(rootDir,args[5])==='..'||isAbsolute(relative(rootDir,args[5])))osvFail('OSV-OWNER-UNAVAILABLE');
  osvSame(program.argv,[process.argv0,...process.execArgv,module,...args]);
  return {controller,program,taskSourceRef,suiteId:args[3]};
}
/** Fixed production entry only; no session/PID/origin/dependency issuer inputs. */
export function createSourceOwnedApprovedControllerRequesterRuntime(input){
  osvExact(input,['rootDir']);
  if(typeof input.rootDir!=='string'||!isAbsolute(input.rootDir)||resolve(input.rootDir)!==input.rootDir)osvFail('OSV-OWNER-UNAVAILABLE');
  const r=retiredDescriptorOwner.inspectSignedDescriptorCustodyRepository(input.rootDir);
  if(r.primaryRoot!==input.rootDir||approvedControllerRuntimes.has(repositoryHash(r)))osvFail('OSV-REPLAY');
  const capture=approvedControllerProgram(r.primaryRoot),approved=approvedControllerCourse(r.primaryRoot);
  if(approved.observed.sessionCleanup!==null)osvFail('OSV-OWNER-UNAVAILABLE');
  const key=repositoryHash(r),lifetime={live:true};approvedControllerRuntimes.set(key,lifetime);
  let runtimePort;
  try{
    // All checks precede the unchanged Source-owned descriptor producer.
    const started=startSessionDescriptor(r.primaryRoot,{sessionId:'controller-'+randomBytes(12).toString('hex')});
    const descriptorHandle=createSourceOwnedDescriptorHandle({repository:r,sessionId:started.sessionId,expectedDescriptorSha256:started.descriptorSha256,ownerNonceFile:null});
    const source={schema:'pipeline.approved-owning-controller-invocation.v1',repositorySha256:key,process:capture.controller,
      program:capture.program,taskSourceRef:capture.taskSourceRef,suiteId:capture.suiteId,course:approved.course,
      approvalRefs:approved.refs,initialStateRef:approved.selectedStateRef,assurance:'physical-readback',eventId:randomBytes(16).toString('hex')};
    const sourceRef=publish(r,join(ensureNamespace(r),'invocations','controller-'+randomBytes(12).toString('hex')+'.json'),source);
    runtimePort=runtimePortFor({repository:r,disposed:false,children:new Set()});
    const recheck=()=>{
      if(!lifetime.live)osvFail('OSV-OWNER-UNAVAILABLE');
      const freshProgram=approvedControllerProgram(r.primaryRoot),freshCourse=approvedControllerCourse(r.primaryRoot,approved.selectedStateRef.path);
      if(!osvSameProcess(capture.controller,freshProgram.controller))osvFail('OSV-OWNER-UNAVAILABLE');
      osvSame(capture.program,freshProgram.program);osvSame(capture.taskSourceRef,freshProgram.taskSourceRef);
      osvSame(approved.course,freshCourse.course);osvSame(approved.refs,freshCourse.refs);readPrivate(r,sourceRef);
    };
    const currentInvocationHandle=opaque(invocations,{repository:r,process:capture.controller,sourceRef,
      invocationBindingSha256:digest(source),producerId:'approved-owning-controller',assurance:'physical-readback',port:runtimePort,sourceOwnerRecheck:recheck});
    const bound=bindSourceOwnedRequesterInvocation({repository:r,descriptorHandle,currentInvocationHandle},runtimePort);
    return Object.freeze({descriptorHandle,currentInvocationHandle,runtimePort,...bound,
      sessionCleanup:Object.freeze({sessionId:started.sessionId,descriptorSha256:started.descriptorSha256}),
      expectedStateSha256:approved.selectedStateRef.sha256,expectedRevision:approved.observed.revision,
      run:callback=>withSourceOwnedAuthorityContext({requesterHandle:bound.requesterHandle,runtimePort},callback),
      dispose:async()=>{lifetime.live=false;const port=ports.get(runtimePort);port.disposed=true;
        // Expiry never releases descriptor/history or a still-held Registry member.
        return {status:[...port.children].some(child=>!child.closed)?'held':'closed',sourceRefs:[sourceRef,bound.bindingRef]};}});
  }catch(error){lifetime.live=false;if(runtimePort)ports.get(runtimePort).disposed=true;throw error;}
}

/** Read-only current-course facts for preflight; never an enrollment grant. */
export function inspectSourceOwnedApprovedControllerCourse(input){
  osvExact(input,['rootDir']);
  if(typeof input.rootDir!=='string'||!isAbsolute(input.rootDir)||resolve(input.rootDir)!==input.rootDir)osvFail('OSV-OWNER-UNAVAILABLE');
  const repository=retiredDescriptorOwner.inspectSignedDescriptorCustodyRepository(input.rootDir);
  if(repository.primaryRoot!==input.rootDir)osvFail('OSV-OWNER-UNAVAILABLE');
  const approved=approvedControllerCourse(repository.primaryRoot);
  if(approved.observed.sessionCleanup!==null)osvFail('OSV-OWNER-UNAVAILABLE');
  osvSame(repository,retiredDescriptorOwner.inspectSignedDescriptorCustodyRepository(input.rootDir));
  // These freshly observed values carry no private handle or mutation brand.
  const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  return freeze({status:'current',repository,course:approved.course,selectedStateRef:approved.selectedStateRef,
    approvalRefs:approved.refs,expectedStateSha256:approved.selectedStateRef.sha256,
    expectedRevision:approved.observed.revision,sessionCleanup:null});
}
