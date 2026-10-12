// Actual source-owned setup. Loaded only by a Root-authorized isolated child.
// Requires a staged genuine base fixture and actual closed I03 source bridge.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import * as base from './base-p16.fixture.mjs';
import * as staged from './staged-p16.fixture.mjs';
import * as lifecycle from '../../lib/worktree-lifecycle.mjs';
import * as bridge from '../../lib/session-requester-bridge.mjs';
import * as observers from '../../lib/session-authority-observers.mjs';
import * as registry from '../../lib/session-authority-registry.mjs';
import * as continuity from '../../lib/onboarding-continuity.mjs';
export {base,staged,registry,continuity};
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const participantIds=['onboarding-continuity','human-guard-override','chat-gate','state-push-challenge','native-goldfish','managed-codex','agy-session-consent','agy-family-dispatch','model-family-host','afk-ledger','session-power','local-worker-supervisor'];
export function inventory(root){
 const rows=[];function visit(p){const s=lstatSync(p);assert(!s.isSymbolicLink());const row={path:relative(root,p)||'.',directory:s.isDirectory(),dev:String(s.dev),ino:String(s.ino),mode:s.mode,nlink:s.nlink,uid:s.uid};if(s.isDirectory()){rows.push(row);for(const name of readdirSync(p).sort())visit(join(p,name));}else{assert(s.isFile());const bytes=readFileSync(p);rows.push({...row,sha256:hash(bytes),size:bytes.length});}}visit(root);return rows;
}
export function readMember(f){
 assert(f.memberPath.startsWith('.git/agent-pipeline/session-authority/members/onboarding-continuity/'));
 const path=join(f.repository.commonDir,f.memberPath.slice(5)),s=lstatSync(path);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1);assert.equal(s.mode&0o077,0);
 const bytes=readFileSync(path);return {ref:{path:f.memberPath,sha256:hash(bytes),size:bytes.length},value:JSON.parse(bytes)};
}
export async function bindActualStateOwner(f){
 f.repository=lifecycle.inspectSignedDescriptorCustodyRepository(f.dir);
 f.runtime=bridge.createControlledMethodRuntimeFixture({repository:f.repository,fixtureRoot:join(f.repository.commonDir,'agent-pipeline/controlled-method-fixtures/full-state-owner'),sessionId:'full-state-owner-fixture'});
 f.ports=observers.createSessionAuthorityParticipantPorts({repository:f.repository});assert.deepEqual(f.ports.map(r=>r.producerId),participantIds);
 const init=registry.initializeSessionAuthorityRegistry({repository:f.repository},f.ports);assert(['initialized','already-initialized'].includes(init.status),JSON.stringify(init));
 f.port=f.ports.find(r=>r.producerId==='onboarding-continuity').port;
 // Availability is a preparation prerequisite, never a fake semantic failure.
 assert.equal(typeof f.port.executeCompanionOperation,'function','SOURCE PREREQUISITE: closed I03 bridge must actually exist before Root launch');
 await f.runtime.run(async()=>{
  const state=continuity.observeSessionCleanupState(f.dir);
  const prepared=f.port.prepareOperation({requesterHandle:f.runtime.requesterHandle,entry:'bind',input:{expectedStateSha256:state.stateSha256,expectedRevision:state.revision}});
  assert.equal(prepared.status,'prepared',JSON.stringify(prepared));
  const actual=f.port.observeOperation(prepared.operationHandle);
  const reserved=registry.withSessionAuthorityBoundary({repository:f.repository},boundary=>registry.reserveSessionAuthorityMember({boundary,producerPort:f.port,association:actual.association,operationHandle:prepared.operationHandle}));
  const executed=await f.port.executeOperation({operationHandle:prepared.operationHandle,memberHandle:reserved.memberHandle,expectedMemberRef:reserved.memberRef});assert.equal(executed.status,'executed',JSON.stringify(executed));
  f.operationHandle=prepared.operationHandle;f.executionHandle=executed.executionHandle;f.memberHandle=reserved.memberHandle;f.memberPath=reserved.memberRef.path;
 });
 const member=readMember(f);assert.equal(member.value.phase,'armed');assert.equal(member.value.producerId,'onboarding-continuity');
 return f;
}
export async function createImplementingStateOwner(){return bindActualStateOwner(staged.makeFixture('signature',{stage:'implementing'}));}
export async function createStageStateOwner(stage){return bindActualStateOwner(staged.makeFixture('signature',{stage}));}
export function actualRequest(f,argv){return {operationHandle:f.operationHandle,executionHandle:f.executionHandle,expectedMemberRef:readMember(f).ref,expectedStateSha256:hash(base.rawState(f)),entry:argv[0],argv:[...argv]};}
export async function invokeOwnedState(f,request){
 const logs=[],saved={log:console.log,warn:console.warn,error:console.error};for(const name of Object.keys(saved))console[name]=(...values)=>logs.push(values.map(String).join(' '));
 let result;try{result=await f.runtime.run(()=>f.port.executeCompanionOperation(request));}finally{Object.assign(console,saved);}
 return {result,text:logs.join('\n')};
}
export function requireCompleted(call){assert.equal(call.result.status,'completed',JSON.stringify(call.result));assert.equal(call.result.exitCode,0,call.text);return JSON.parse(call.text);}
export function requireSuccessfulCommand(call){assert.equal(call.result.status,'completed',JSON.stringify(call.result));assert.equal(call.result.exitCode,0,call.text);}
export function assertActualStateReadback(f,call,beforeMember){
 assert.deepEqual(Object.keys(call.result).sort(),['argvSha256','assurance','entry','exitCode','memberRef','statePostimage','statePreimage','status']);
 const member=readMember(f);preserveOwnerIdentity(beforeMember,member);
 assert.deepEqual(call.result.memberRef,member.ref);
 const state=base.rawState(f);assert.equal(call.result.statePostimage.sha256,hash(state));assert.equal(call.result.statePostimage.size,state.length);
 assert.deepEqual(Object.keys(call.result.statePostimage).sort(),['identity','semanticSha256','sha256','size']);
 assert.equal(call.result.statePostimage.identity.nlink,1);assert.equal(member.value.phase,'armed');
}
export function preserveOwnerIdentity(before,after){for(const key of ['memberId','generation','association','bindingSha256','kinds','phase'])assert.deepEqual(after.value[key],before.value[key],key+' owner identity');}
export async function requireStaleRefusal(f,argv){
 const request=actualRequest(f,argv),before=inventory(f.dir),member=readMember(f);request.expectedStateSha256='0'.repeat(64);
 const assertPreEffectRefusal=call=>{assert.deepEqual(Object.keys(call.result).sort(),['attempted','code','exitCode','status']);assert.equal(call.result.status,'unavailable');assert.equal(call.result.attempted,false);assert.equal(call.result.exitCode,null);assert.match(call.result.code,/^SDC-AUTHORITY-(?:CAS|UNAVAILABLE)$/u);};
 const stale=await invokeOwnedState(f,request);assertPreEffectRefusal(stale);assert.deepEqual(inventory(f.dir),before);assert.deepEqual(readMember(f),member);
 request.expectedStateSha256=hash(base.rawState(f));request.operationHandle=Object.freeze({});
 const unowned=await invokeOwnedState(f,request);assertPreEffectRefusal(unowned);assert.deepEqual(inventory(f.dir),before);assert.deepEqual(readMember(f),member);
}
