// SPDX-License-Identifier: SUL-1.0
/** Actual transported controller custody. No wire object can issue a handle. */
import {createHash} from 'node:crypto';
import {userInfo} from 'node:os';
import {derivePoGateRepositoryFingerprint} from './po-gate-authority.mjs';
import {readAuthoritySourceFile} from './session-authority-domain-owner.mjs';
import {spawn} from 'node:child_process';
import {constants,closeSync,chmodSync,existsSync,fstatSync,lstatSync,openSync,readFileSync,readSync,realpathSync,readdirSync,readlinkSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import net,{Socket} from 'node:net';
import {fileURLToPath} from 'node:url';
import {canonical} from './po-approval-proof.mjs';
import {authorityRepositoryFromRoot} from './session-authority-domain-owner.mjs';
import {inspectSourceOwnedCurrentAuthorityContext,observeSourceOwnedSessionPowerControllerChild} from './session-requester-bridge.mjs';
import {ensurePrivateDirectory} from './private-boundary.mjs';
import {
  SessionPowerError,SESSION_POWER_HEARTBEAT_SECONDS,SESSION_POWER_LEASE_SECONDS,
  fixedAdapterLaunch,readLinuxProcessIdentity,resolveSessionPowerContext,readSessionPowerRecord,validateSessionPowerRecord,
  createStartingSessionPowerRecord,activateSessionPowerRecord,heartbeatSessionPowerRecord,
  createDisabledSessionPowerRecord,createUnavailableSessionPowerRecord,recoverSessionPowerRecord,stopSessionPowerRecord,
  reserveOwnedSessionPowerController,readOwnedSessionPowerOperationBinding,observeOwnedSessionPowerEffects,
  writeOwnedSessionPowerRecord,closeOwnedSessionPowerEndpoint,releaseOwnedSessionPowerController,
  prepareOwnedSessionPowerEndpointAddress,readSessionPowerAddressBinding,
} from './session-power.mjs';
import {validateControllerConfig,resolveControllerContext,startupAcknowledgement,readFrame,writeFrame} from '../scripts/session-power-controller.mjs';

const activations=new WeakMap(),endpoints=new Map();
const closeSourceServer=net.Server.prototype.close;
const hash=value=>createHash('sha256').update(value).digest('hex'),digest=value=>hash(canonical(value));
const CONTROLLER=fileURLToPath(new URL('../scripts/session-power-controller.mjs',import.meta.url));
const HELPER=fileURLToPath(new URL('../scripts/session-power-helper.mjs',import.meta.url));
const SELF=fileURLToPath(import.meta.url);
const sourcePaths=[SELF,CONTROLLER,fileURLToPath(new URL('./session-requester-bridge.mjs',import.meta.url))];
const proofKeys=['activationNonce','controllerPid','controllerStart','controllerExecutableSha256','childPid','childStart','childExecutableSha256','handleId'];
const tupleKeys=['activationNonce','adapterId','platform','hostBootId','controllerPid','controllerStart','controllerExecutableSha256','childPid','childStart','childExecutableSha256','handleId','startedAt'];
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
function fail(reason){throw new SessionPowerError('SP-CONTROLLER',reason);}
function statShape(s){return {dev:String(s.dev),ino:String(s.ino),mode:s.mode,nlink:s.nlink,uid:s.uid,gid:s.gid,size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs};}
function sourceFile(path){
  const before=lstatSync(path);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||(before.mode&0o022)!==0||before.size>1048576||realpathSync(path)!==path)fail('controller source ownership');
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const opened=fstatSync(fd);const read=()=>{const bytes=Buffer.alloc(before.size);let offset=0;while(offset<bytes.length){const n=readSync(fd,bytes,offset,bytes.length-offset,offset);if(!n)fail('controller source short read');offset+=n;}if(readSync(fd,Buffer.alloc(1),0,1,offset)!==0)fail('controller source changed size');return bytes;};const bytes=read(),again=read();
    if(digest(statShape(before))!==digest(statShape(opened))||digest(statShape(opened))!==digest(statShape(fstatSync(fd)))||digest(statShape(opened))!==digest(statShape(lstatSync(path)))||!bytes.equals(again))fail('controller source CAS');
    return {path,sha256:hash(bytes),identity:statShape(opened)};
  }finally{closeSync(fd);}
}
function proof(ack){return Object.fromEntries(proofKeys.map(key=>[key,ack[key]]));}
function sameProof(value,ack){return value!==null&&typeof value==='object'&&proofKeys.every(key=>value[key]===ack[key]);}
function selfIdentity(){
  const argv=readFileSync('/proc/self/cmdline').toString('utf8').split('\0').filter(Boolean);
  if(argv.length!==2||realpathSync(argv[0])!==realpathSync(process.execPath)||argv[1]!==CONTROLLER||realpathSync(CONTROLLER)!==CONTROLLER)fail('controller physical fixed argv');
  return readLinuxProcessIdentity(process.pid);
}
function activation(handle){const state=activations.get(handle);if(!state)fail('unowned controller activation');return state;}
function recheck(state){
  if(digest(sourcePaths.map(sourceFile))!==digest(state.sourceContext))fail('controller source generation drift');
  const actual=resolveSessionPowerContext(state.context.repo.primaryRoot,state.context.sessionId,state.context.descriptorSha256);
  if(digest(actual)!==digest(state.context))fail('controller descriptor context drift');
  const current=inspectSourceOwnedCurrentAuthorityContext({repository:state.repository});
  if(current.status!=='bound'||current.currentInvocationHandle!==null||current.requesterHandle!==state.requesterHandle
    ||current.currentRequester.sessionId!==actual.sessionId||current.currentRequester.descriptorSha256!==actual.descriptorSha256
    ||digest(current.sourceRef)!==digest(state.sourceRef)||current.invocationBindingSha256!==state.invocationBindingSha256)fail('controller requester custody drift');
  const self=selfIdentity();if(digest(self)!==digest(state.self))fail('controller process incarnation drift');
  if(state.child&&!state.childClosed){const child=readLinuxProcessIdentity(state.child.pid);if(digest(child)!==digest(state.childIdentity))fail('controller child incarnation drift');}
  return state;
}
export function inspectOwnedSessionPowerController(handle){
  const state=recheck(activation(handle));
  return Object.freeze({context:state.context,terminalObserved:state.childClosed&&state.serverClosed&&!existsSync(state.context.controlPath)});
}
function endpointValue(state){const a=state.ack;return {schema:'pipeline.session-power-owned-endpoint.v1',repoFingerprint:state.context.repoFingerprint,sessionId:state.context.sessionId,descriptorSha256:state.context.descriptorSha256,activationNonceSha256:hash(a.activationNonce),controllerPid:a.controllerPid,controllerStart:a.controllerStart,controllerExecutableSha256:a.controllerExecutableSha256,childPid:a.childPid,childStart:a.childStart,childExecutableSha256:a.childExecutableSha256,handleId:a.handleId};}

// A repository locator permits navigation only; it issues no authority.
const repositoryLocators=new Map();
export function registerSessionPowerAuthorityRepository(input){
  if(!exact(input,['repository'])||!input.repository||typeof input.repository.primaryRoot!=='string')fail('controller repository locator input');
  const actual=authorityRepositoryFromRoot(input.repository.primaryRoot);
  if(digest(actual)!==digest(input.repository))fail('controller repository locator drift');
  repositoryLocators.set(join(actual.commonDir,'agent-pipeline','session-power'),Object.freeze({...actual}));
  if(process.platform==='linux'){
    // Descriptor-independent navigation derives from an existing genuine repo.
    const root=join(userInfo().homedir,'.apsp',derivePoGateRepositoryFingerprint({gitCommonDir:actual.commonDir,primaryRoot:actual.primaryRoot}).slice(0,16));
    repositoryLocators.set(root,Object.freeze({...actual}));
  }
}
function boundedProc(path,max=1048576){
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const chunks=[];let size=0;while(true){const b=Buffer.alloc(4096),n=readSync(fd,b,0,b.length,null);if(!n)break;size+=n;if(size>max)fail('controller kernel observation bound');chunks.push(b.subarray(0,n));}return Buffer.concat(chunks);}finally{closeSync(fd);}
}
function kernelSocket(filePath,controllerPid){
  const rows=boundedProc('/proc/self/net/unix').toString('utf8').trim().split('\n');
  if(rows.length>8192)fail('controller socket table bound');
  const matches=[];for(const row of rows.slice(1)){const m=/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/.exec(row.trim());if(m?.[8]===filePath)matches.push(m);}
  if(matches.length!==1||matches[0][4]!=='00010000'||matches[0][5]!=='0001'||matches[0][6]!=='01'||!/^\d+$/.test(matches[0][7]))fail('controller kernel listening socket unavailable');
  const inode=matches[0][7],fdRoot='/proc/'+controllerPid+'/fd',names=readdirSync(fdRoot);
  if(names.length>4096)fail('controller descriptor bound');
  const owned=[];for(const name of names){if(!/^\d+$/.test(name))fail('controller descriptor name');try{if(readlinkSync(join(fdRoot,name))==='socket:['+inode+']')owned.push(name);}catch{fail('controller descriptor observation unavailable');}}
  if(owned.length!==1)fail('controller kernel socket custody unavailable');
  return {inode,fd:owned[0],row:matches[0].slice(1)};
}
function foreignEndpoint(input){
  let repository=null;for(const [prefix,candidate] of repositoryLocators){if(input.filePath.startsWith(prefix+'/')){if(repository)fail('controller repository locator ambiguous');repository=candidate;}}
  if(!repository)fail('controller endpoint foreign custody producer unavailable');
  if(digest(authorityRepositoryFromRoot(repository.primaryRoot))!==digest(repository))fail('controller repository locator changed');
  let context,recordPath,addressBindingSource=null;
  if(process.platform==='linux'){
    const prefix=join(userInfo().homedir,'.apsp',derivePoGateRepositoryFingerprint({gitCommonDir:repository.commonDir,primaryRoot:repository.primaryRoot}).slice(0,16)),rel=relative(prefix,input.filePath);
    if(!/^[a-f0-9]{24}\.sock$/.test(rel)||input.filePath!==join(prefix,rel)||!isAbsolute(input.filePath))fail('controller foreign endpoint path');
    const binding=readAuthoritySourceFile({namespaceId:'session-power-records',filePath:input.filePath.slice(0,-5)+'.binding.json',semantic:({value})=>value});
    if(!exact(binding.value,['schema','repositoryFingerprint','primaryRoot','commonDir','sessionId','descriptorSha256','recordPath','controlPath'])||binding.value.schema!=='pipeline.session-power-address-binding.v1')fail('controller foreign address binding');
    context=resolveSessionPowerContext(repository.primaryRoot,binding.value.sessionId,binding.value.descriptorSha256);
    const actual=readSessionPowerAddressBinding(context);
    if(digest(actual.sourceFact)!==digest(binding.sourceFact)||context.controlPath!==input.filePath)fail('controller foreign address binding CAS');
    recordPath=context.recordPath;addressBindingSource=actual.sourceFact;
  }else{
    const prefix=join(repository.commonDir,'agent-pipeline','session-power'),rel=relative(prefix,input.filePath),match=/^([a-f0-9]{64})\/([A-Za-z0-9._-]+)\.json\.sock$/.exec(rel);
    if(!match||input.filePath!==join(prefix,rel)||!isAbsolute(input.filePath))fail('controller foreign endpoint path');
    recordPath=input.filePath.slice(0,-5);
    const prior=JSON.parse(readFileSync(recordPath,'utf8'));
    context=resolveSessionPowerContext(repository.primaryRoot,match[2],prior.descriptorSha256);
  }
  const recordSource=sourceFile(recordPath),record=JSON.parse(readFileSync(recordPath,'utf8'));
  if(!validateSessionPowerRecord(record).ok||!['starting','active','cleanup-pending','stopped'].includes(record.status))fail('controller foreign record held');
  if(context.controlPath!==input.filePath||record.repoFingerprint!==context.repoFingerprint||record.sessionId!==context.sessionId||record.descriptorSha256!==context.descriptorSha256)fail('controller foreign descriptor projection');
  const selector={pid:record.controllerPid,start:record.controllerStart,executableSha256:record.controllerExecutableSha256};
  const observation=observeSourceOwnedSessionPowerControllerChild({repository,sessionId:context.sessionId,expectedDescriptorSha256:context.descriptorSha256,controllerIdentity:selector});
  if(observation.status!=='observed'||!['controlled-unit-method','physical-readback'].includes(observation.assurance))fail('controller endpoint foreign custody producer unavailable');
  const ack=observation.startupAcknowledgement;
  if(!exact(ack,['schema','type',...tupleKeys])||ack.schema!=='pipeline.session-power-controller-ack.v1'||ack.type!=='startup-ack'||!sameProof(record,ack)||tupleKeys.some(key=>record[key]!==ack[key]))fail('controller foreign startup binding');
  if(digest(observation.repository)!==digest(repository)||observation.childIdentity.pid!==selector.pid||observation.controllerIdentity.pid!==process.pid
    ||observation.currentRequester.sessionId!==context.sessionId||observation.currentRequester.descriptorSha256!==context.descriptorSha256
    ||observation.spawnRequest.cwd!==repository.primaryRoot||digest(observation.spawnRequest.args)!==digest([CONTROLLER])
    ||observation.powerControllerModule.path!==CONTROLLER||observation.powerControllerModule.sha256!==sourceFile(CONTROLLER).sha256)fail('controller foreign original parent/source binding');
  const before=lstatSync(input.filePath);
  if(!before.isSocket()||before.isSymbolicLink()||before.nlink!==1||(before.mode&0o077)!==0||typeof process.getuid!=='function'||before.uid!==process.getuid())fail('controller endpoint physical ownership');
  const controller=readLinuxProcessIdentity(selector.pid),full=observation.childIdentity;
  if(controller.start!==selector.start||controller.executableSha256!==selector.executableSha256
    ||controller.start!=='linux:'+boundedProc('/proc/sys/kernel/random/boot_id',128).toString('utf8').trim()+':'+full.start
    ||full.bootSha256!==hash(boundedProc('/proc/sys/kernel/random/boot_id',128).toString('utf8').trim())
    ||full.parentPid!==process.pid||full.uid!==process.getuid()||full.executable!==realpathSync('/proc/'+selector.pid+'/exe'))fail('controller foreign process incarnation');
  const argv=boundedProc('/proc/'+selector.pid+'/cmdline',16384).toString('utf8').split('\0').filter(Boolean);
  if(digest(argv)!==digest([observation.spawnRequest.executablePath,CONTROLLER])||full.argvSha256!==digest(argv))fail('controller foreign fixed argv');
  if(record.status!=='stopped'){
    const child=readLinuxProcessIdentity(ack.childPid);
    const childArgv=boundedProc('/proc/'+ack.childPid+'/cmdline',16384).toString('utf8').split('\0').filter(Boolean);
    const childStat=boundedProc('/proc/'+ack.childPid+'/stat',16384).toString('utf8'),fields=childStat.slice(childStat.lastIndexOf(')')+2).trim().split(' ');
    if(child.start!==ack.childStart||child.executableSha256!==ack.childExecutableSha256||Number(fields[1])!==selector.pid
      ||digest(childArgv)!==digest([observation.spawnRequest.executablePath,HELPER,'--controller-pid',String(selector.pid),'--controller-start',selector.start,'--lease-seconds',String(SESSION_POWER_LEASE_SECONDS)]))fail('controller foreign inhibitor binding');
  }
  const kernel=kernelSocket(input.filePath,selector.pid);
  const fresh=observeSourceOwnedSessionPowerControllerChild({repository,sessionId:context.sessionId,expectedDescriptorSha256:context.descriptorSha256,controllerIdentity:selector});
  const after=lstatSync(input.filePath);
  if(digest(observation)!==digest(fresh)||digest(controller)!==digest(readLinuxProcessIdentity(selector.pid))
    ||digest(statShape(before))!==digest(statShape(after))||digest(kernel)!==digest(kernelSocket(input.filePath,selector.pid))
    ||digest(recordSource)!==digest(sourceFile(recordPath))
    ||addressBindingSource&&digest(addressBindingSource)!==digest(readSessionPowerAddressBinding(context).sourceFact))fail('controller foreign endpoint CAS');
  const value={schema:'pipeline.session-power-owned-endpoint.v1',repoFingerprint:context.repoFingerprint,sessionId:context.sessionId,descriptorSha256:context.descriptorSha256,
    activationNonceSha256:hash(ack.activationNonce),controllerPid:ack.controllerPid,controllerStart:ack.controllerStart,controllerExecutableSha256:ack.controllerExecutableSha256,
    childPid:ack.childPid,childStart:ack.childStart,childExecutableSha256:ack.childExecutableSha256,handleId:ack.handleId};
  const bytes=Buffer.from(canonical(value));return {value,bytes,sourceFact:{namespaceId:input.namespaceId,pathSha256:digest(input.filePath),sha256:hash(bytes),size:bytes.length,identity:{dev:String(after.dev),ino:String(after.ino),mode:after.mode,nlink:after.nlink},semanticSha256:digest(value)}};
}

/** Actual local custody or genuine original-parent physical observation. */
export function readOwnedSessionPowerEndpointSource(input){
  if(!exact(input,['namespaceId','filePath'])||input.namespaceId!=='session-power-records')fail('controller endpoint observation input');
  const state=endpoints.get(input.filePath);
  if(!state){try{return foreignEndpoint(input);}catch(error){if(error instanceof SessionPowerError)throw error;fail('controller endpoint foreign custody observation unavailable');}}
  if(state.context.controlPath!==input.filePath||!state.server||state.serverClosed)fail('controller endpoint custody lost');
  const addressBindingSource=readSessionPowerAddressBinding(state.context)?.sourceFact??null;
  const before=lstatSync(input.filePath);
  if(!before.isSocket()||before.isSymbolicLink()||before.nlink!==1||(before.mode&0o077)!==0||typeof process.getuid!=='function'||before.uid!==process.getuid())fail('controller endpoint physical ownership');
  recheck(state);
  const binding=readOwnedSessionPowerOperationBinding(state.handle);
  if(binding.contextSha256!==digest(state.context))fail('controller original operation context drift');
  const after=lstatSync(input.filePath);
  if(digest(statShape(before))!==digest(statShape(after))||addressBindingSource&&digest(addressBindingSource)!==digest(readSessionPowerAddressBinding(state.context).sourceFact))fail('controller endpoint physical CAS');
  if(state.endpointIdentity&&digest(statShape(after))!==digest(state.endpointIdentity))fail('controller endpoint incarnation drift');
  const value=endpointValue(state),bytes=Buffer.from(canonical(value));
  return {value,bytes,sourceFact:{namespaceId:input.namespaceId,pathSha256:digest(input.filePath),sha256:hash(bytes),size:bytes.length,identity:{dev:String(after.dev),ino:String(after.ino),mode:after.mode,nlink:after.nlink},semanticSha256:digest(value)}};
}
/** Fixed original native close initiation; no supplied effect or Server. */
export function beginOwnedSessionPowerEndpointClose(handle){
  const state=recheck(activation(handle));
  if(process.platform!=='linux'||process.versions.node.split('.')[0]!=='24'||process.versions.uv?.split('.')[0]!=='1')fail('controller native close family unavailable');
  if(!state.childClosed||state.serverClosed||state.serverCloseInitiated||!(state.server instanceof net.Server)
    ||!state.server.listening||!state.endpointNativeHandle||state.server._handle!==state.endpointNativeHandle)fail('controller original native server custody unavailable');
  const observed=readOwnedSessionPowerEndpointSource({namespaceId:'session-power-records',filePath:state.context.controlPath});
  const actual=lstatSync(state.context.controlPath);
  if(String(actual.dev)!==observed.sourceFact.identity.dev||String(actual.ino)!==observed.sourceFact.identity.ino
    ||digest(statShape(actual))!==digest(state.endpointIdentity))fail('controller native close endpoint CAS');
  state.serverCloseInitiated=true;
  state.serverTerminal=new Promise((resolveClose,reject)=>{
    state.serverCloseResolve=resolveClose;state.serverCloseReject=reject;
  });state.serverTerminal.catch(()=>{});
  try{
    closeSourceServer.call(state.server,error=>{
      if(error){state.serverCloseReject(error);return;}
      state.serverClosed=true;endpoints.delete(state.context.controlPath);state.serverCloseResolve();
    });
  }catch(error){state.serverCloseReject(error);throw error;}
  // libuv1 removes its own stored pathname synchronously and clears it once.
  // Never perform a separate unlink or remove a newly observed replacement.
  if(state.server.listening||state.server._handle!==null||existsSync(state.context.controlPath))fail('controller native close synchronous removal unavailable');
  return Object.freeze({status:'close-initiated'});
}
function writeRecord(state,next,current){return writeOwnedSessionPowerRecord(state.handle,next,{expectedRevision:current?.revision??null});}
function revised(next,current){return {...next,revision:current?current.revision+1:0};}
function tupleRecord(state){return Object.fromEntries(tupleKeys.map(key=>[key,state.ack[key]]));}
function currentRecord(state){recheck(state);const current=readSessionPowerRecord(state.context);if(!current||!sameProof(current,state.ack))fail('controller current record tuple drift');return current;}
function clearTimers(state){if(state.heartbeatTimer)clearInterval(state.heartbeatTimer);if(state.leaseTimer)clearTimeout(state.leaseTimer);state.heartbeatTimer=null;state.leaseTimer=null;}
async function closeChild(state){
  if(state.childClosed)return;
  recheck(state);
  state.child.kill('SIGTERM');
  await Promise.race([state.childTerminal,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new SessionPowerError('SP-CONTROLLER','owned child stop timeout')),2000);state.childTerminal.finally(()=>clearTimeout(timer)).catch(()=>{});})]);
  if(!state.childClosed)fail('owned child close unobserved');
}
async function stopOwned(state){
  if(state.settling)fail('controller settlement already active');
  state.settling=true;clearTimers(state);
  try{await closeChild(state);const current=currentRecord(state);const stopped=stopSessionPowerRecord(current,{endpointProof:proof(state.ack)});if(digest(stopped)!==digest(current))writeRecord(state,stopped,current);return readSessionPowerRecord(state.context);}
  finally{state.settling=false;}
}
async function disableOwned(state,{failureClass=null}={}){
  if(state.settling)fail('controller settlement already active');
  state.settling=true;clearTimers(state);
  try{
    await closeChild(state);
    if(state.server&&!state.serverClosed){
      // Initiate the original Server's sole native pathname removal inside
      // the genuine synchronous transition, then await actual drain outside.
      closeOwnedSessionPowerEndpoint(state.handle);
      for(const socket of state.connections)socket.destroy();
      await state.serverTerminal;
    }
    if(existsSync(state.context.controlPath))fail('controller endpoint drain unproved');
    const current=readSessionPowerRecord(state.context);
    const next=revised(failureClass?createUnavailableSessionPowerRecord(state.context,failureClass):createDisabledSessionPowerRecord(state.context),current);
    writeRecord(state,next,current);
    if(!releaseOwnedSessionPowerController(state.handle))fail('controller original terminal held');
    state.terminalResolve({status:next.status});
    state.pipe.destroy();
    return next;
  }catch(error){state.terminalReject(error);throw error;}
  finally{state.settling=false;}
}
function holdFailure(state,error){clearTimers(state);state.terminalReject(error);}
async function settleFixedChild(state){
  const expected=[state.config.nodePath,HELPER,'--controller-pid',String(process.pid),'--controller-start',state.self.start,'--lease-seconds',String(SESSION_POWER_LEASE_SECONDS)];
  const deadline=Date.now()+2000;
  while(Date.now()<deadline){
    if(state.childClosed)fail('fixed inhibitor exited before settlement');
    try{const argv=readFileSync(`/proc/${state.child.pid}/cmdline`).toString('utf8').split('\0').filter(Boolean);
      if(digest(argv)===digest(expected)){
        const first=readLinuxProcessIdentity(state.child.pid);await new Promise(resolveWait=>setTimeout(resolveWait,10));
        const second=readLinuxProcessIdentity(state.child.pid);
        if(digest(first)===digest(second)&&second.executableSha256===state.self.executableSha256){state.childIdentity=second;return;}
      }
    }catch(error){if(state.childClosed)fail('fixed inhibitor exited before settlement');}
    await new Promise(resolveWait=>setTimeout(resolveWait,10));
  }
  fail('fixed inhibitor settlement unavailable');
}
async function handleRequest(state,request,socket){
  if(!request||request.activationNonce!==state.ack.activationNonce)return socket.destroy();
  if(request.type==='proof'&&exact(request,['type','activationNonce'])){recheck(state);writeFrame(socket,{schema:'pipeline.session-power-controller-ack.v1',type:'proof',committed:state.committed,...proof(state.ack)});socket.end();return;}
  if(!state.committed||!exact(request,['type',...proofKeys])||!sameProof(request,state.ack))return socket.destroy();
  if(request.type==='stop'){
    await stopOwned(state);writeFrame(socket,{schema:'pipeline.session-power-controller-ack.v1',type:'stopped',...proof(state.ack)});socket.end();return;
  }
  if(request.type==='recover'){
    const current=currentRecord(state),next=recoverSessionPowerRecord(current,{endpointProof:proof(state.ack)});
    if(digest(next)!==digest(current))writeRecord(state,next,current);
    writeFrame(socket,{schema:'pipeline.session-power-controller-ack.v1',type:'recovered',...proof(state.ack)});socket.end();return;
  }
  if(request.type==='disable'){socket.end();await disableOwned(state);return;}
  socket.destroy();
}
async function listen(state){
  if(existsSync(state.context.controlPath))fail('controller endpoint already exists');
  const server=net.createServer(socket=>{state.connections.add(socket);socket.once('close',()=>state.connections.delete(socket));readFrame(socket,{timeoutMs:2000}).then(request=>handleRequest(state,request,socket)).catch(error=>{socket.destroy();if(state.committed)holdFailure(state,error);});});
  state.server=server;
  await new Promise((resolveListen,reject)=>{server.once('error',reject);server.listen(state.context.controlPath,resolveListen);});
  chmodSync(state.context.controlPath,0o600);state.endpointIdentity=lstatSync(state.context.controlPath);state.endpointNativeHandle=server._handle;endpoints.set(state.context.controlPath,state);
  readOwnedSessionPowerEndpointSource({namespaceId:'session-power-records',filePath:state.context.controlPath});
}
export async function runOwnedSessionPowerController(configInput,pipe){
  const config=validateControllerConfig(configInput),context=resolveControllerContext(config),repository=authorityRepositoryFromRoot(context.repo.primaryRoot);
  if(process.platform!=='linux'||!(pipe instanceof Socket)||pipe._handle?.fd!==3)fail('controller private inherited channel unavailable');
  const fd=fstatSync(3);if(!fd.isSocket()&&!fd.isFIFO())fail('controller private inherited channel type');
  const current=inspectSourceOwnedCurrentAuthorityContext({repository}),self=selfIdentity();
  if(current.status!=='bound'||current.currentInvocationHandle!==null||current.currentRequester.sessionId!==context.sessionId||current.currentRequester.descriptorSha256!==context.descriptorSha256
    ||config.controller.pid!==process.pid||config.controller.start!==self.start||config.controller.executableSha256!==self.executableSha256
    ||realpathSync(config.nodePath)!==realpathSync(process.execPath)||config.helperPath!==HELPER)fail('controller Source requester/config join unavailable');
  const prior=readSessionPowerRecord(context);
  if(prior&&!['disabled','unavailable'].includes(prior.status))fail('controller retained prior record held');
  const handle=Object.freeze({}),state={handle,config,context,repository,self,requesterHandle:current.requesterHandle,sourceRef:current.sourceRef,invocationBindingSha256:current.invocationBindingSha256,
    sourceContext:sourcePaths.map(sourceFile),pipe,child:null,childIdentity:null,childClosed:true,server:null,serverClosed:true,connections:new Set(),endpointIdentity:null,ack:null,committed:false,settling:false,effectsObserved:false,heartbeatTimer:null,leaseTimer:null};
  state.terminal=new Promise((resolveTerminal,reject)=>{state.terminalResolve=resolveTerminal;state.terminalReject=reject;});
  // The direct entry awaits this same promise; avoid an unhandled early failure.
  state.terminal.catch(()=>{});activations.set(handle,state);recheck(state);
  reserveOwnedSessionPowerController(handle);
  try{
    prepareOwnedSessionPowerEndpointAddress(handle);state.effectsObserved=true;
    ensurePrivateDirectory(context.directory);sourceFile(HELPER);const executable=lstatSync('/usr/bin/systemd-inhibit');if(!executable.isFile()||executable.isSymbolicLink())fail('fixed inhibitor unavailable');
    const launch=fixedAdapterLaunch({platform:'linux',nodePath:config.nodePath,helperPath:HELPER,controllerPid:process.pid,controllerStart:self.start});
    const child=spawn(launch.command,launch.args,{shell:false,detached:false,stdio:'ignore',windowsHide:true});state.child=child;state.childClosed=false;
    state.childTerminal=new Promise(resolveChild=>{child.once('close',(code,signal)=>{state.childClosed=true;resolveChild({code,signal});if(state.committed&&!state.settling)void disableOwned(state).catch(error=>holdFailure(state,error));});});
    await new Promise((resolveSpawn,reject)=>{child.once('spawn',resolveSpawn);child.once('error',reject);});
    await settleFixedChild(state);state.ack=startupAcknowledgement(config,child);state.serverClosed=false;
    await listen(state);
    // The starting-record transaction freshly reconciles the actual socket and record.
    const starting=revised(createStartingSessionPowerRecord(context,tupleRecord(state)),prior);writeRecord(state,starting,prior);
    writeFrame(pipe,state.ack);
    const commit=await readFrame(pipe,{timeoutMs:5000});if(!exact(commit,['type',...proofKeys])||commit.type!=='commit'||!sameProof(commit,state.ack))fail('controller exact startup commit unavailable');
    const active=activateSessionPowerRecord(starting,{expectedRevision:starting.revision});writeRecord(state,active,starting);state.committed=true;
    writeFrame(pipe,{schema:'pipeline.session-power-controller-ack.v1',type:'committed-ack',...proof(state.ack)});
    state.heartbeatTimer=setInterval(()=>{if(state.settling)return;try{const record=currentRecord(state);writeRecord(state,heartbeatSessionPowerRecord(record,{expectedRevision:record.revision}),record);}catch(error){holdFailure(state,error);}},SESSION_POWER_HEARTBEAT_SECONDS*1000);
    state.leaseTimer=setTimeout(()=>{void disableOwned(state).catch(error=>holdFailure(state,error));},SESSION_POWER_LEASE_SECONDS*1000);
    return {ack:state.ack,shutdown:()=>disableOwned(state),terminal:state.terminal};
  }catch(error){
    // Actual no-effect startup failures can publish the no-context terminal.
    // An uncertain child/server/endpoint remains original-member held.
    if(state.childClosed&&!state.server&& !existsSync(context.controlPath)){
      try{if(!state.effectsObserved){observeOwnedSessionPowerEffects(handle);state.effectsObserved=true;}
        await disableOwned(state,{failureClass:'startup-failed'});
      }catch(terminalError){holdFailure(state,terminalError);}
    }else holdFailure(state,error);
    throw error;
  }
}
