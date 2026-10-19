import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes } from 'node:crypto';
import { constants, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical } from './po-approval-proof.mjs';
import { inspectSignedDescriptorCustodyRepository, withSignedDescriptorCustodyManifestLock } from './worktree-lifecycle.mjs';
import { inspectSourceOwnedDescriptorHandle } from './session-requester-bridge.mjs';
import * as onboarding from './onboarding-continuity.mjs';
import * as hgo from './human-guard-override.mjs';
import * as chat from './chat-gate-ceremony.mjs';
import * as state from '../scripts/pipeline-state.mjs';
import * as native from './native-goldfish-host-state.mjs';
import * as codex from './codex-host-process-journal.mjs';
import * as consent from './agy-session-authority.mjs';
import * as agy from './agy-session-dispatch.mjs';
import * as model from './model-family-host-store.mjs';
import * as afk from './afk-ledger.mjs';
import * as power from './session-power.mjs';
import * as worker from './local-worker-supervisor.mjs';
import * as windowsAuthority from './windows-owned-authority-backend.mjs';

export const SESSION_AUTHORITY_LIMITS = Object.freeze({ maxParticipants:12,maxNamespaceEntries:4096,maxRecordBytes:1048576,maxSourceEntryBytes:1048576,maxJournalEntryBytes:67108864,maxSourceTotalBytes:16777216,maxDirectoryDepth:6,maxModelFamilyReceipts:4096,maxNativePendingBytes:131072,maxNativeRequestBytes:7340032,maxRequesterBindingBytes:16384,maxTransportFrameBytes:16384,transportReadTimeoutMs:2000 });
export const SESSION_AUTHORITY_EVENT_STAGES = Object.freeze(['after-reservation-published-before-effects','after-owner-effects-readback','after-terminal-readback-before-release','after-release-published-before-member-update','after-member-release-published']);
const KINDS = Object.freeze(['continuity','override','ceremony','dispatch','armed-capability']);
// The human-guard-override append-only journals grow with every denial (PF-51): own bound, outside the total.
const JOURNAL_NAMESPACES = Object.freeze(['audit','command-offers']);
const definitions = [
  ['onboarding-continuity',onboarding,'OnboardingContinuity',['continuity'],['selected-state','cleanup-binding','cleanup-release'],['lib/onboarding-continuity.mjs']],
  ['human-guard-override',hgo,'HumanGuardOverride',['override','armed-capability'],['requests','plans','capabilities','briefed-authorizations','locks','audit','command-offers'],['lib/human-guard-override.mjs']],
  ['chat-gate',chat,'ChatGate',['ceremony'],['registered-ceremony-lifetimes'],['lib/chat-gate-ceremony.mjs','scripts/po-human-approval.mjs']],
  ['state-push-challenge',state,'StatePushChallenge',['ceremony'],['selected-state-push-challenge'],['scripts/pipeline-state.mjs']],
  ['native-goldfish',native,'NativeGoldfish',['dispatch'],['native-goldfish-host-commit'],['lib/native-goldfish-host-state.mjs','lib/native-goldfish-host-finalizer.mjs','lib/codex-onboarding-runtime.mjs','lib/native-managed-authority-support.mjs','lib/session-authority-domain-owner.mjs']],
  ['managed-codex',codex,'ManagedCodex',['dispatch'],['design-readiness-processes','advisor-processes'],['lib/codex-host-process-journal.mjs','lib/codex-host-process-supervisor.mjs','lib/native-managed-authority-support.mjs','lib/session-authority-domain-owner.mjs']],
  ['agy-session-consent',consent,'AgySessionConsent',['armed-capability'],['agy-session-consent','agy-session-consent-revocations'],['lib/agy-session-authority.mjs']],
  ['agy-family-dispatch',agy,'AgyFamilyDispatch',['dispatch','armed-capability'],['agy-host-observed','registered-opaque-context-lifetimes'],['lib/agy-session-dispatch.mjs','lib/agy-host-observed-store.mjs']],
  ['model-family-host',model,'ModelFamilyHost',['armed-capability'],['activation','generation-pointer','generations','receipts','writer-lock','registered-native-context-lifetimes'],['lib/model-family-host-store.mjs','lib/model-family-runtime-host.mjs','lib/model-family-invocation.mjs','lib/session-authority-domain-owner.mjs']],
  ['afk-ledger',afk,'AfkLedger',['armed-capability'],['registered-activations','activation-generations','writer-recovery-locks'],['lib/afk-ledger.mjs','lib/afk-transaction-host.mjs','lib/session-authority-domain-owner.mjs']],
  ['session-power',power,'SessionPower',['armed-capability'],['session-power-records','session-power-locks'],['lib/session-power.mjs','lib/session-authority-domain-owner.mjs']],
  ['local-worker-supervisor',worker,'LocalWorkerSupervisor',['dispatch','armed-capability'],['registered-external-state-roots','supervisor-state','supervisor-lifecycle'],['lib/local-worker-supervisor.mjs','lib/local-supervisor-state.mjs','lib/session-authority-domain-owner.mjs']],
];
const boundaryBrands=new WeakMap(), memberBrands=new WeakMap(), stageBrands=new WeakSet();
const boundaryContext=new AsyncLocalStorage(), stageContext=new AsyncLocalStorage();
const ROOT='agent-pipeline/session-authority';
const SHA=/^[a-f0-9]{64}$/, ID=/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=value=>hash(canonical(value));
const equal=(a,b)=>canonical(a)===canonical(b);
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
const fail=(code,reason)=>{const error=new Error(reason);error.name='SessionAuthorityError';error.code=code;error.reason=reason;throw error;};
const unavailable=(producer,reason)=>freeze({status:'unavailable',code:'SDC-AUTHORITY-UNAVAILABLE',producer,reason});
function exact(value,keys,label){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||!equal(Object.keys(value).sort(),[...keys].sort()))fail('SDC-AUTHORITY-UNAVAILABLE',`${label}:closed-shape`);return value;}
function sha(value){if(typeof value!=='string'||!SHA.test(value))fail('SDC-AUTHORITY-UNAVAILABLE','invalid-digest');return value;}
function id(value){if(typeof value!=='string'||!ID.test(value))fail('SDC-AUTHORITY-UNAVAILABLE','invalid-identifier');return value;}
function generation(value){if(!Number.isSafeInteger(value)||value<1)fail('SDC-AUTHORITY-CAS','invalid-generation');return value;}
function target(value){exact(value,['sessionId','descriptorSha256','ownerNonceSha256'],'target');id(value.sessionId);sha(value.descriptorSha256);sha(value.ownerNonceSha256);return value;}
function association(value){exact(value,['state','target'],'association');if(value.state==='bound')target(value.target);else if(value.state!=='unbound'||value.target!==null)fail('SDC-AUTHORITY-UNAVAILABLE','invalid-association');return value;}
function ref(value){exact(value,['path','sha256','size'],'ref');sha(value.sha256);if(!Number.isSafeInteger(value.size)||value.size<0||!/^\.git\/agent-pipeline\//.test(value.path)||value.path.split('/').some(p=>!p||p==='.'||p==='..')||value.path.includes('\\'))fail('SDC-PRIVATE-PATH','invalid-reference');return value;}
function repository(value){exact(value,['primaryRoot','commonDir','candidate'],'repository');const observed=inspectSignedDescriptorCustodyRepository(value.primaryRoot);if(!equal(value,observed))fail('SDC-ROOT','repository-binding-changed');return freeze(observed);}
const repoDigest=repo=>digest({primaryRoot:repo.primaryRoot,commonDir:repo.commonDir});
function safePath(repo,path){if(typeof path!=='string'||isAbsolute(path)||path.split('/').some(p=>!p||p==='.'||p==='..')||path.includes('\\'))fail('SDC-PRIVATE-PATH','unsafe-private-path');const result=resolve(repo.commonDir,path);if(!result.startsWith(`${repo.commonDir}${sep}`))fail('SDC-PRIVATE-PATH','outside-common-directory');let cursor=repo.commonDir;for(const part of path.split('/')){cursor=resolve(cursor,part);if(existsSync(cursor)&&lstatSync(cursor).isSymbolicLink())fail('SDC-PRIVATE-PATH','symlink-component');}return result;}

// Native observations are private physical CAS witnesses, never owner brands.
const windowsRecordFacts=new WeakMap();
function nativeWitness(path,observation,replace=false){
  const context=boundaryContext.getStore()??legacyControlContext.getStore();
  const witnesses=context?.nativeWitnesses;
  if(witnesses){const previous=witnesses.get(path);if(!replace&&previous!==undefined&&previous!==observation.nativeFacts)fail('SDC-AUTHORITY-CAS','windows-native-identity-drift');witnesses.set(path,observation.nativeFacts);}
  return observation;
}
function retainNativePublication(){
  const current=boundaryContext.getStore();if(current)current.retainDomainTransition=true;
  const legacy=legacyControlContext.getStore();if(legacy)legacy.custody.retain=true;
}
function nativePublish(repo,path,abs,bytes,expected){
  const original=expected===null?null:windowsRecordFacts.get(expected);
  if(expected!==null&&!original)fail('SDC-AUTHORITY-CAS','windows-publication-witness-missing');
  const prior=expected===null?null:readRaw(repo,path);
  if(prior&&!equal(prior.ref,expected))fail('SDC-AUTHORITY-CAS','publication-preimage-changed');
  if(prior&&windowsRecordFacts.get(prior.ref)?.nativeFacts!==original.nativeFacts)fail('SDC-AUTHORITY-CAS','windows-publication-identity-changed');
  let committed=false;
  try{
    const observed=windowsAuthority.publishWindowsOwnedAuthorityFile({path:abs,bytes,expectedSha256:expected?.sha256??null,expectedFacts:original?.nativeFacts??null});
    committed=observed.committed;nativeWitness(abs,observed,true);
    const read=readRaw(repo,path);if(read.ref.sha256!==hash(bytes)||windowsRecordFacts.get(read.ref)?.nativeFacts!==observed.nativeFacts)fail('SDC-AUTHORITY-CAS','publication-readback');
    return freeze(read.ref);
  }catch(error){if(committed||Object.getOwnPropertyDescriptor(error,'committed')?.value===true)retainNativePublication();throw error;}
}
function nativePrivateRead(repo,path){
  const abs=safePath(repo,path),observed=nativeWitness(abs,windowsAuthority.readWindowsOwnedAuthorityFile({path:abs,maxBytes:SESSION_AUTHORITY_LIMITS.maxRecordBytes}));
  const value={bytes:observed.bytes,ref:{path:`.git/${path}`,sha256:hash(observed.bytes),size:observed.bytes.length}};
  windowsRecordFacts.set(value.ref,observed);return value;
}
function nativeLockCreate(abs,bytes){return windowsAuthority.createWindowsOwnedAuthorityExclusiveFile({path:abs,bytes});}
function nativeLockRemove(abs,lock,original){
  if(!original||original.nativeFacts==='removed')fail('SDC-LOCK-HELD','windows-lock-witness-missing');
  windowsAuthority.removeWindowsOwnedAuthorityFile({path:abs,expectedSha256:lock.sha256,expectedFacts:original.nativeFacts});
}
function nativeSourceRead(path,maxBytes,privateRecord=false){
  const before=lstatSync(path),read=privateRecord?windowsAuthority.readWindowsOwnedAuthorityFile:windowsAuthority.readWindowsAuthoritySourceModule;
  const observed=read({path,maxBytes:Math.min(maxBytes,1048576)}),after=lstatSync(path);
  if(before.dev!==after.dev||before.ino!==after.ino||before.mode!==after.mode||after.nlink!==1||observed.bytes.length!==after.size)fail('SDC-AUTHORITY-CAS','windows-source-identity-drift');
  nativeWitness(path,observed);return {bytes:observed.bytes,stat:after,nativeFacts:observed.nativeFacts};
}
function owned(stat,directory=false,path=null){if(process.platform==='win32'){if(typeof path!=='string')fail('SDC-PRIVATE-PATH','windows-owned-path-required');const observation=windowsAuthority.inspectWindowsOwnedAuthorityPath({path,directory});return directory?observation:nativeWitness(path,observation);}if(stat.isSymbolicLink()||(directory?!stat.isDirectory():!stat.isFile())||(!directory&&stat.nlink!==1)||(stat.mode&0o077)!==0||(typeof process.getuid==='function'&&stat.uid!==process.getuid()))fail('SDC-PRIVATE-PATH','private-ownership');}
function readRaw(repo,path){if(process.platform==='win32'){lstatSync(safePath(repo,path));return nativePrivateRead(repo,path);}const abs=safePath(repo,path);let fd;try{const before=lstatSync(abs);owned(before);if(before.size>SESSION_AUTHORITY_LIMITS.maxRecordBytes)fail('SDC-AUTHORITY-UNAVAILABLE','oversized-record');fd=openSync(abs,constants.O_RDONLY|constants.O_NOFOLLOW);const opened=fstatSync(fd);owned(opened);const bytes=readFileSync(fd);const after=lstatSync(abs);if(before.dev!==opened.dev||before.ino!==opened.ino||opened.dev!==after.dev||opened.ino!==after.ino||before.mode!==after.mode||bytes.length!==after.size||!equal(hash(bytes),hash(readFileSync(abs))))fail('SDC-AUTHORITY-CAS','physical-record-drift');return {bytes,ref:{path:`.git/${path}`,sha256:hash(bytes),size:bytes.length}};}finally{if(fd!==undefined)closeSync(fd);}}
function readRecord(repo,path){const read=readRaw(repo,path);try{const value=JSON.parse(read.bytes.toString('utf8'));if(canonical(value)!==read.bytes.toString('utf8'))fail('SDC-AUTHORITY-UNAVAILABLE','noncanonical-record-json');return {...read,value};}catch{fail('SDC-AUTHORITY-UNAVAILABLE','invalid-record-json');}}
function readRef(repo,value){ref(value);const read=readRecord(repo,value.path.slice(5));if(!equal(read.ref,value))fail('SDC-AUTHORITY-CAS','reference-preimage-changed');return read;}
function privateDirectories(repo,path){if(process.platform==='win32'){let cursor=repo.commonDir;for(const part of dirname(path).split('/')){cursor=resolve(cursor,part);if(!existsSync(cursor))windowsAuthority.createWindowsOwnedAuthorityDirectory({path:cursor});windowsAuthority.inspectWindowsOwnedAuthorityPath({path:cursor,directory:true});}return;}let cursor=repo.commonDir;for(const part of dirname(path).split('/')){cursor=resolve(cursor,part);if(!existsSync(cursor))mkdirSync(cursor,{mode:0o700});owned(lstatSync(cursor),true);}}
function syncDirectory(path){const fd=openSync(path,constants.O_RDONLY);try{fsyncSync(fd);}finally{closeSync(fd);}}
function publish(repo,path,value,expected=null){safePath(repo,path);privateDirectories(repo,path);const abs=safePath(repo,path);const bytes=Buffer.from(canonical(value));if(bytes.length>SESSION_AUTHORITY_LIMITS.maxRecordBytes)fail('SDC-AUTHORITY-UNAVAILABLE','oversized-publication');if(expected===null){if(existsSync(abs))fail('SDC-AUTHORITY-CAS','expected-absent');}else if(!equal(readRaw(repo,path).ref,expected))fail('SDC-AUTHORITY-CAS','publication-preimage-changed');if(process.platform==='win32')return nativePublish(repo,path,abs,bytes,expected);const temp=`${path}.tmp-${randomBytes(16).toString('hex')}`;const tempAbs=safePath(repo,temp);let fd=openSync(tempAbs,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}if(expected===null){if(existsSync(abs))fail('SDC-AUTHORITY-CAS','publication-race');}else if(!equal(readRaw(repo,path).ref,expected))fail('SDC-AUTHORITY-CAS','publication-race');renameSync(tempAbs,abs);syncDirectory(dirname(abs));const read=readRaw(repo,path);if(read.ref.sha256!==hash(bytes))fail('SDC-AUTHORITY-CAS','publication-readback');return freeze(read.ref);}

export function createSessionAuthorityMethodStageObserver({onStage}){if(typeof onStage!=='function')fail('SDC-AUTHORITY-UNAVAILABLE','invalid-stage-observer');const value=Object.freeze({onStage});stageBrands.add(value);return value;}
export function withSessionAuthorityMethodStages({observer},callback){if(!stageBrands.has(observer)||typeof callback!=='function')fail('SDC-AUTHORITY-UNAVAILABLE','unbranded-stage-observer');return stageContext.run(observer,callback);}
function stage(name,record,memberRef,releaseRef=null){const observer=stageContext.getStore();if(observer)observer.onStage(freeze({stage:name,producerId:record.producerId,memberId:record.memberId,memberGeneration:record.memberGeneration,memberRef,releaseRef}));}

export function withSessionAuthorityBoundary({repository:input},callback){const repo=repository(input);if(typeof callback!=='function')fail('SDC-AUTHORITY-UNAVAILABLE','invalid-boundary-callback');const active=boundaryContext.getStore();if(active){if(!equal(active.repository,repo))fail('SDC-ROOT','nested-boundary-repository');return callback(active.token);}privateDirectories(repo,`${ROOT}/registry.lock`);const path=`${ROOT}/registry.lock`,abs=safePath(repo,path),bytes=Buffer.from(canonical({schema:'pipeline.session-authority-lock.v1',repositorySha256:repoDigest(repo),nonce:randomBytes(32).toString('hex')}));let fd,nativeLock;try{if(process.platform==='win32')nativeLock=nativeLockCreate(abs,bytes);else fd=openSync(abs,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}catch{fail('SDC-LOCK-HELD','registry-lock-held');}if(process.platform!=='win32'){try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}}const lock=readRaw(repo,path).ref;const token=Object.freeze({});const data={repository:repo,token,...(process.platform==='win32'?{nativeWitnesses:new Map([[abs,nativeLock.nativeFacts]])}:{})};boundaryBrands.set(token,data);try{return boundaryContext.run(data,()=>{migrateSourceUpdatedCatalogue(repo);const result=callback(token);if(result&&typeof result.then==='function')fail('SDC-AUTHORITY-UNAVAILABLE','asynchronous-boundary');return result;});}finally{boundaryBrands.delete(token);if(!equal(readRaw(repo,path).ref,lock))fail('SDC-LOCK-HELD','registry-lock-ownership-changed');if(data.retainDomainTransition===true)fail('SDC-LOCK-HELD','domain-transition-partial-effect-retained');if(process.platform==='win32')nativeLockRemove(abs,lock,nativeLock);else{unlinkSync(abs);syncDirectory(dirname(abs));}}}
function boundary(token){const found=boundaryBrands.get(token);if(!found||boundaryContext.getStore()?.token!==token)fail('SDC-AUTHORITY-UNAVAILABLE','expired-boundary');repository(found.repository);return found.repository;}

function participant(def){const [producerId,,prefix,kinds,namespaceIds,paths]=def;const sourcePaths=paths.map(path=>`plugins/pipeline-core/${path}`).sort();const sources=sourcePaths.map(path=>{const abs=fileURLToPath(new URL(`../${path.slice('plugins/pipeline-core/'.length)}`,import.meta.url));const s=lstatSync(abs);if(!s.isFile()||s.isSymbolicLink())fail('SDC-AUTHORITY-UNAVAILABLE',`${producerId}:source-file`);return {path,sha256:hash(process.platform==='win32'?nativeSourceRead(abs,SESSION_AUTHORITY_LIMITS.maxSourceEntryBytes).bytes:readFileSync(abs))};});return freeze({producerId,kinds:[...kinds],sourcePaths,sourceSha256:digest(sources),namespaceIds:[...namespaceIds]});}
function portsFor(repo,ports){if(!Array.isArray(ports)||ports.length!==12)fail('SDC-AUTHORITY-UNAVAILABLE','complete-twelve-ports-required');return definitions.map((def,index)=>{const row=ports[index];exact(row,['producerId','port'],'participant-port');if(row.producerId!==def[0])fail('SDC-AUTHORITY-UNAVAILABLE','participant-order');const predicate=def[1][`isOwned${def[2]}AuthorityProducerPort`];if(typeof predicate!=='function'||predicate(row.port,{repository:repo})!==true)fail('SDC-AUTHORITY-UNAVAILABLE',`${def[0]}:unowned-port`);for(const method of ['readBaseline','observeOperation','observeTerminal','reconcile','readAssurance'])if(typeof row.port[method]!=='function')fail('SDC-AUTHORITY-UNAVAILABLE',`${def[0]}:missing-method`);return {port:row.port,participant:participant(def)};});}
function sourceFacts(values,namespaces){if(!Array.isArray(values)||values.length>4096)fail('SDC-AUTHORITY-UNAVAILABLE','source-fact-bound');let total=0;for(const v of values){exact(v,['namespaceId','pathSha256','sha256','size','identity','semanticSha256'],'source-fact');if(!namespaces.includes(v.namespaceId))fail('SDC-AUTHORITY-UNAVAILABLE','unknown-namespace');sha(v.pathSha256);sha(v.sha256);sha(v.semanticSha256);exact(v.identity,['dev','ino','mode','nlink'],'source-identity');if(!/^\d+$/.test(v.identity.dev)||!/^\d+$/.test(v.identity.ino)||!Number.isSafeInteger(v.identity.mode)||v.identity.nlink!==1)fail('SDC-PRIVATE-PATH','source-identity');const journal=JOURNAL_NAMESPACES.includes(v.namespaceId),bound=v.namespaceId==='native-goldfish-host-commit'?SESSION_AUTHORITY_LIMITS.maxNativeRequestBytes:journal?SESSION_AUTHORITY_LIMITS.maxJournalEntryBytes:SESSION_AUTHORITY_LIMITS.maxSourceEntryBytes;if(!Number.isSafeInteger(v.size)||v.size<0||v.size>bound)fail('SDC-AUTHORITY-UNAVAILABLE',`source-entry-bound: a ${v.namespaceId} entry of ${v.size} bytes exceeds ${bound}`);if(!journal)total+=v.size;}if(total>SESSION_AUTHORITY_LIMITS.maxSourceTotalBytes)fail('SDC-AUTHORITY-UNAVAILABLE','source-total-bound');return values;}
function memberships(values,p){if(!Array.isArray(values)||values.length!==p.namespaceIds.length)fail('SDC-AUTHORITY-UNAVAILABLE',`${p.producerId}:namespace-closure`);let count=0;const seen=new Set();for(const v of values){exact(v,['namespaceId','rootSha256','entrySetSha256','entryCount','sourceFacts'],'membership');if(seen.has(v.namespaceId)||!p.namespaceIds.includes(v.namespaceId))fail('SDC-AUTHORITY-UNAVAILABLE','namespace-identity');seen.add(v.namespaceId);sha(v.rootSha256);sha(v.entrySetSha256);sourceFacts(v.sourceFacts,p.namespaceIds);if(!Number.isSafeInteger(v.entryCount)||v.entryCount<0||v.entryCount!==v.sourceFacts.length)fail('SDC-AUTHORITY-UNAVAILABLE','namespace-entry-count');count+=v.entryCount;}if(count>4096)fail('SDC-AUTHORITY-UNAVAILABLE','namespace-entry-bound');return values;}
function operation(port,handle,p){const v=port.observeOperation(handle);exact(v,['association','kinds','phase','bindingSha256','sourceFacts'],'operation');association(v.association);if(!Array.isArray(v.kinds)||!v.kinds.length||new Set(v.kinds).size!==v.kinds.length||v.kinds.some(k=>!p.kinds.includes(k))||!['reserved','armed','running','terminal-observed'].includes(v.phase))fail('SDC-AUTHORITY-UNAVAILABLE','operation-phase');sha(v.bindingSha256);sourceFacts(v.sourceFacts,p.namespaceIds);return v;}
const cataloguePath=`${ROOT}/catalogue.json`;
const producerPath=id=>`${ROOT}/producers/${id}.json`;
const memberPath=m=>`${ROOT}/members/${m.producerId}/${m.memberId}.${m.memberGeneration}.json`;
const releasePath=m=>`${ROOT}/releases/${m.producerId}/${m.memberId}.${m.memberGeneration}.json`;
const certificatePath=(producer,t,g)=>`${ROOT}/targets/${t.sessionId}/${producer}.${g}.json`;
const schema=name=>`pipeline.session-authority-${name}.v1`;
function sameRepository(record,repo){if(record.repositorySha256!==repoDigest(repo))fail('SDC-ROOT','record-repository');}
function validateMember(m,repo,p){exact(m,['schema','repositorySha256','producerId','memberId','memberGeneration','revision','association','kinds','bindingSha256','phase','sourceFacts','createdAt','updatedAt','releaseRef'],'member');sameRepository(m,repo);if(m.schema!==schema('member')||m.producerId!==p.producerId)fail('SDC-AUTHORITY-CAS','member-domain');id(m.memberId);generation(m.memberGeneration);generation(m.revision);association(m.association);sha(m.bindingSha256);sourceFacts(m.sourceFacts,p.namespaceIds);if(!Array.isArray(m.kinds)||!m.kinds.length||m.kinds.some(k=>!p.kinds.includes(k))||new Set(m.kinds).size!==m.kinds.length||!['reserved','armed','running','terminal-observed','released'].includes(m.phase))fail('SDC-AUTHORITY-CAS','member-phase');for(const t of [m.createdAt,m.updatedAt])if(typeof t!=='string'||!Number.isFinite(Date.parse(t))||new Date(t).toISOString()!==t)fail('SDC-AUTHORITY-CAS','member-time');if(m.phase==='released')ref(m.releaseRef);else if(m.releaseRef!==null)fail('SDC-AUTHORITY-CAS','unexpected-release');return m;}
function validateRelease(r,repo,m,p){exact(r,['schema','repositorySha256','producerId','memberId','memberGeneration','memberPreimageSha256','bindingSha256','terminal','sourceFacts','createdAt'],'release');sameRepository(r,repo);if(r.schema!==schema('release')||r.producerId!==m.producerId||r.memberId!==m.memberId||r.memberGeneration!==m.memberGeneration||r.bindingSha256!==m.bindingSha256||!['completed','cancelled','consumed','revoked','stopped','continuity-released'].includes(r.terminal))fail('SDC-AUTHORITY-CAS','release-domain');sha(r.memberPreimageSha256);sourceFacts(r.sourceFacts,p.namespaceIds);if(!r.sourceFacts.length||new Date(r.createdAt).toISOString()!==r.createdAt)fail('SDC-AUTHORITY-CAS','release-terminal-evidence');return r;}
function defaultPorts(repo){return definitions.map(def=>{const factory=def[1][`create${def[2]}AuthorityProducerPort`];if(typeof factory!=='function')fail('SDC-AUTHORITY-UNAVAILABLE',`${def[0]}:factory-unavailable`);return {producerId:def[0],port:factory({repository:repo})};});}
function boundaryPorts(token){const data=boundaryBrands.get(token);return data.ports??=portsFor(data.repository,defaultPorts(data.repository));}
function closedCatalogue(c,repo,ports){exact(c,['schema','repositorySha256','generation','participantSetSha256','participants','producers'],'catalogue');sameRepository(c,repo);generation(c.generation);const expected=ports.map(p=>p.participant);if(c.schema!==schema('catalogue')||!equal(c.participants,expected)||c.participantSetSha256!==digest(expected)||!Array.isArray(c.producers)||c.producers.length!==12)fail('SDC-AUTHORITY-UNAVAILABLE','catalogue-source-closure');return c;}
// PF-52: every participant binds its producer's installed source digest, so a plugin update that
// changes a producer source leaves a catalogue that can never close again. A readable catalogue of
// this repository whose participants differ from the installed ones is migrated under the lock:
// the whole registry is moved aside (retained, never deleted) and, when the producers, kinds and
// namespaces are unchanged, its records are republished bound to the installed sources, so every
// member, release and integration keeps its phase. Members and releases carry no source digest
// and are republished byte for byte; producers, catalogue and current target certificates are
// rebound. A changed producer structure, or any fault while rebinding, leaves the registry
// catalogue-less, and the next owner initializes it fresh from every producer's own namespace,
// as in a new repository. Another repository's catalogue is left for stateRead to refuse.
let installedParticipantsMemo=null;
function installedParticipants(){return installedParticipantsMemo??=freeze(definitions.map(participant));}
function moveRegistryAside(repo,aside){
  privateDirectories(repo,`${aside}/marker`);
  for(const name of readdirSync(safePath(repo,ROOT)).sort())if(name!=='registry.lock')renameSync(safePath(repo,`${ROOT}/${name}`),safePath(repo,`${aside}/${name}`));
  syncDirectory(safePath(repo,ROOT));
}
function rebindSourceUpdatedRegistry(repo,catalogue,aside,expected){
  const prior=catalogue.participants;
  if(!Array.isArray(prior)||prior.length!==expected.length||!Array.isArray(catalogue.producers)||catalogue.producers.length!==expected.length
    ||prior.some((p,i)=>p?.producerId!==expected[i].producerId||!equal(p.kinds,expected[i].kinds)||!equal(p.namespaceIds,expected[i].namespaceIds)))return false;
  const fromAside=value=>{ref(value);const local=value.path.slice(5);if(!local.startsWith(`${ROOT}/`))fail('SDC-PRIVATE-PATH','migration-reference');const read=readRecord(repo,`${aside}${local.slice(ROOT.length)}`);if(read.ref.sha256!==value.sha256||read.ref.size!==value.size)fail('SDC-AUTHORITY-CAS','migration-reference-preimage');return read.value;};
  const republish=(value,original)=>{const written=publish(repo,original.path.slice(5),value);if(!equal(written,original))fail('SDC-AUTHORITY-CAS','migration-republish');return written;};
  const participantSetSha256=digest(expected),targets=new Map(),rows=[];
  catalogue.producers.forEach((entry,i)=>{
    if(entry?.producerId!==expected[i].producerId)fail('SDC-AUTHORITY-CAS','migration-producer-order');
    const p=fromAside(entry.producerRef);
    const members=p.members.map(e=>{const m=fromAside(e.memberRef);const memberRef=republish(m,e.memberRef);
      const release=m.releaseRef?{value:fromAside(m.releaseRef),ref:republish(fromAside(m.releaseRef),m.releaseRef)}:null;return {value:m,ref:memberRef,release};});
    for(const c of p.targetCertificates)targets.set(digest(c.target),c.target);
    const value={...p,participantSetSha256,sourceSha256:expected[i].sourceSha256,targetCertificates:[]};
    rows.push({participant:expected[i],record:{value,ref:publish(repo,producerPath(p.producerId),value)},members,certificates:[]});
  });
  const value={...catalogue,participants:expected,participantSetSha256,producers:rows.map(row=>({producerId:row.participant.producerId,producerRef:row.record.ref,producerGeneration:row.record.value.generation}))};
  const state={catalogue:{value,ref:publish(repo,cataloguePath,value)},rows};
  for(const t of targets.values())refreshCertificates(repo,state,t);
  // A version that derives a producer baseline differently would fail namespace-drift at the next
  // read, so the rebind is checked against the producers themselves; a fault falls back to fresh.
  let ports=null;
  try{ports=definitions.map(def=>({producerId:def[0],port:def[1][`create${def[2]}AuthorityProducerPort`]({repository:repo})}));}catch{ports=null;}
  if(ports)stateRead(repo,portsFor(repo,ports));
  return true;
}
function migrateSourceUpdatedCatalogue(repo){
  if(!existsSync(safePath(repo,cataloguePath)))return null;
  let catalogue;try{catalogue=readRecord(repo,cataloguePath).value;}catch{return null;}
  if(!catalogue||typeof catalogue!=='object'||catalogue.schema!==schema('catalogue')||catalogue.repositorySha256!==repoDigest(repo))return null;
  const expected=installedParticipants();
  if(equal(catalogue.participants,expected)&&catalogue.participantSetSha256===digest(expected))return null;
  const old=typeof catalogue.participantSetSha256==='string'&&SHA.test(catalogue.participantSetSha256)?catalogue.participantSetSha256.slice(0,12):'unknown';
  const aside=`agent-pipeline/session-authority-abandoned/${new Date().toISOString().replace(/[^0-9]/g,'')}-${randomBytes(4).toString('hex')}-source-update-${old}`;
  moveRegistryAside(repo,aside);
  try{if(rebindSourceUpdatedRegistry(repo,catalogue,aside,expected))return {aside,mode:'rebound'};}
  catch{moveRegistryAside(repo,`${aside}-partial`);}
  return {aside,mode:'fresh'};
}
function registryClosure(repo,state){const known=new Set([cataloguePath]);for(const row of state.rows){known.add(row.record.ref.path.slice(5));for(const m of row.members){known.add(m.ref.path.slice(5));if(m.release)known.add(m.release.ref.path.slice(5));}for(const c of row.certificates)known.add(c.ref.path.slice(5));}let count=0,total=0;function walk(path,depth){if(depth>6)fail('SDC-AUTHORITY-UNAVAILABLE','registry-depth-bound');const abs=safePath(repo,path);owned(lstatSync(abs),true,abs);for(const name of readdirSync(abs).sort()){const child=`${path}/${name}`,s=lstatSync(safePath(repo,child));if(++count>4096)fail('SDC-AUTHORITY-UNAVAILABLE','registry-entry-bound');if(s.isDirectory()){walk(child,depth+1);continue;}owned(s,false,process.platform==='win32'?safePath(repo,child):null);total+=s.size;if(total>16777216)fail('SDC-AUTHORITY-UNAVAILABLE','registry-total-bound');if(known.has(child))continue;if(child===`${ROOT}/registry.lock`){const active=boundaryContext.getStore();if(!active||!equal(active.repository,repo))fail('SDC-LOCK-HELD','registry-lock-held');continue;}const read=readRecord(repo,child);if(read.value.schema===schema('release')){const row=state.rows.find(r=>r.participant.producerId===read.value.producerId);const member=row?.members.find(m=>m.value.memberId===read.value.memberId&&m.value.memberGeneration===read.value.memberGeneration);if(!member||member.value.phase!=='terminal-observed'||child!==releasePath(member.value))fail('SDC-AUTHORITY-CAS','unindexed-release');validateRelease(read.value,repo,member.value,row.participant);if(read.value.memberPreimageSha256!==member.ref.sha256)fail('SDC-AUTHORITY-CAS','release-prefix-preimage');continue;}if(read.value.schema===schema('target-certificate')){const c=read.value,row=state.rows.find(r=>r.participant.producerId===c.producerId),current=row?.certificates.find(p=>equal(p.value.target,c.target));exact(c,['schema','repositorySha256','producerId','participantSetSha256','sourceSha256','target','targetGeneration','memberRefs','releaseRefs','scopeFacts','projectionSha256'],'historical-certificate');sameRepository(c,repo);target(c.target);generation(c.targetGeneration);if(!current||c.targetGeneration>=current.value.targetGeneration||child!==certificatePath(c.producerId,c.target,c.targetGeneration))fail('SDC-AUTHORITY-CAS','unindexed-certificate');const {schema:ignored,repositorySha256:ignoredRepo,targetGeneration:ignoredGeneration,projectionSha256,...projected}=c;if(digest(projected)!==projectionSha256)fail('SDC-AUTHORITY-CAS','historical-certificate-digest');continue;}fail('SDC-AUTHORITY-UNAVAILABLE','unknown-registry-entry');}}walk(ROOT,0);}
function stateRead(repo,ports,{reconcile=true}={}){const catalogue=readRecord(repo,cataloguePath);closedCatalogue(catalogue.value,repo,ports);const rows=ports.map((pair,i)=>{const entry=catalogue.value.producers[i];exact(entry,['producerId','producerRef','producerGeneration'],'producer-index');if(entry.producerId!==pair.participant.producerId)fail('SDC-AUTHORITY-CAS','producer-index-order');const record=readRef(repo,entry.producerRef);const p=record.value;exact(p,['schema','repositorySha256','producerId','generation','participantSetSha256','sourceSha256','baseline','members','targetCertificates','lastTransitionSha256'],'producer');sameRepository(p,repo);generation(p.generation);sha(p.lastTransitionSha256);if(p.schema!==schema('producer')||p.producerId!==entry.producerId||p.generation!==entry.producerGeneration||p.participantSetSha256!==catalogue.value.participantSetSha256||p.sourceSha256!==pair.participant.sourceSha256||entry.producerRef.path!==`.git/${producerPath(p.producerId)}`)fail('SDC-AUTHORITY-CAS','producer-source-binding');memberships(p.baseline,pair.participant);if(!Array.isArray(p.members)||!Array.isArray(p.targetCertificates)||p.members.length>4096||p.targetCertificates.length>4096)fail('SDC-AUTHORITY-UNAVAILABLE','producer-record-bound');const members=p.members.map(e=>{exact(e,['memberId','memberGeneration','memberRef'],'member-index');const loaded=readRef(repo,e.memberRef);const m=validateMember(loaded.value,repo,pair.participant);if(m.memberId!==e.memberId||m.memberGeneration!==e.memberGeneration||e.memberRef.path!==`.git/${memberPath(m)}`)fail('SDC-AUTHORITY-CAS','member-index-binding');const release=m.releaseRef?readRef(repo,m.releaseRef):null;if(release)validateRelease(release.value,repo,m,pair.participant);return {...loaded,release};});if(new Set(members.map(m=>`${m.value.memberId}/${m.value.memberGeneration}`)).size!==members.length)fail('SDC-AUTHORITY-CAS','duplicate-member');const certificates=p.targetCertificates.map(e=>{exact(e,['target','targetGeneration','certificateRef'],'certificate-index');target(e.target);generation(e.targetGeneration);const loaded=readRef(repo,e.certificateRef),c=loaded.value;exact(c,['schema','repositorySha256','producerId','participantSetSha256','sourceSha256','target','targetGeneration','memberRefs','releaseRefs','scopeFacts','projectionSha256'],'target-certificate');sameRepository(c,repo);if(c.schema!==schema('target-certificate')||c.producerId!==p.producerId||!equal(c.target,e.target)||c.targetGeneration!==e.targetGeneration||c.participantSetSha256!==p.participantSetSha256||c.sourceSha256!==p.sourceSha256||e.certificateRef.path!==`.git/${certificatePath(p.producerId,c.target,c.targetGeneration)}`)fail('SDC-AUTHORITY-CAS','certificate-binding');for(const refs of [c.memberRefs,c.releaseRefs]){if(!Array.isArray(refs))fail('SDC-AUTHORITY-CAS','certificate-refs');refs.forEach(ref);}sourceFacts(c.scopeFacts,pair.participant.namespaceIds);const {schema:ignored,repositorySha256:ignoredRepo,targetGeneration:ignoredGen,projectionSha256,...projection}=c;if(c.projectionSha256!==digest(projection))fail('SDC-AUTHORITY-CAS','certificate-projection');return loaded;});const row={...pair,record,members,certificates};if(reconcile){const current=memberships(pair.port.reconcile({producerRecord:freeze(p),memberRecords:freeze(members.map(m=>m.value)),releaseRecords:freeze(members.filter(m=>m.release).map(m=>m.release.value))}),pair.participant);if(!equal(current,p.baseline))fail('SDC-AUTHORITY-CAS',`${p.producerId}:namespace-drift`);}return row;});const state={catalogue,rows};registryClosure(repo,state);return state;}
function saveProducer(repo,state,index,value){const row=state.rows[index];value.generation=generation(row.record.value.generation+1);row.record={value,ref:publish(repo,producerPath(value.producerId),value,row.record.ref)};const c={...state.catalogue.value,generation:generation(state.catalogue.value.generation+1),producers:state.catalogue.value.producers.map((e,i)=>i===index?{producerId:e.producerId,producerRef:row.record.ref,producerGeneration:value.generation}:e)};state.catalogue={value:c,ref:publish(repo,cataloguePath,c,state.catalogue.ref)};}
function sortedRefs(values){const map=new Map(values.map(v=>[v.path,v]));if(map.size!==values.length)for(const v of values)if(!equal(map.get(v.path),v))fail('SDC-AUTHORITY-CAS','conflicting-references');return [...map.values()].sort((a,b)=>a.path.localeCompare(b.path));}
function projection(row,t,participantSetSha256){const relevant=row.members.filter(m=>m.value.association.state==='unbound'||equal(m.value.association.target,t));const memberRefs=sortedRefs(relevant.filter(m=>m.value.phase!=='released').map(m=>m.ref));const releaseRefs=sortedRefs(relevant.filter(m=>m.release).map(m=>m.release.ref));const facts=relevant.flatMap(m=>m.value.sourceFacts);const lockFacts=row.record.value.baseline.flatMap(m=>m.sourceFacts).filter(f=>/lock/.test(f.namespaceId));for(const f of lockFacts)if(!facts.some(v=>equal(v,f)))facts.push(f);facts.sort((a,b)=>a.namespaceId.localeCompare(b.namespaceId)||a.pathSha256.localeCompare(b.pathSha256));return {target:t,producerId:row.participant.producerId,participantSetSha256,sourceSha256:row.participant.sourceSha256,memberRefs,releaseRefs,scopeFacts:facts};}
function refreshCertificates(repo,state,extraTarget=null){const targets=new Map();for(const row of state.rows)for(const c of row.certificates)targets.set(digest(c.value.target),c.value.target);if(extraTarget)targets.set(digest(extraTarget),extraTarget);for(let i=0;i<state.rows.length;i++){const row=state.rows[i];let changed=false;const certificates=[...row.certificates];for(const t of targets.values()){const projected=projection(row,t,state.catalogue.value.participantSetSha256);const prior=certificates.find(c=>equal(c.value.target,t));if(prior?.value.projectionSha256===digest(projected))continue;const generationValue=prior?generation(prior.value.targetGeneration+1):1;const value={schema:schema('target-certificate'),repositorySha256:repoDigest(repo),...projected,targetGeneration:generationValue,projectionSha256:digest(projected)};const written={value,ref:publish(repo,certificatePath(row.participant.producerId,t,generationValue),value)};if(prior)certificates.splice(certificates.indexOf(prior),1,written);else certificates.push(written);changed=true;}if(changed){row.certificates=certificates;const value={...row.record.value,targetCertificates:certificates.map(c=>({target:c.value.target,targetGeneration:c.value.targetGeneration,certificateRef:c.ref}))};saveProducer(repo,state,i,value);}}}
function updateMembership(repo,state,index,m,memberRef){const row=state.rows[index];const prior=row.members.find(x=>x.value.memberId===m.memberId&&x.value.memberGeneration===m.memberGeneration);const next={value:m,ref:memberRef,release:m.releaseRef?readRef(repo,m.releaseRef):null};if(prior)row.members.splice(row.members.indexOf(prior),1,next);else row.members.push(next);const value={...row.record.value,members:row.members.map(x=>({memberId:x.value.memberId,memberGeneration:x.value.memberGeneration,memberRef:x.ref})),lastTransitionSha256:digest({memberRef,releaseRef:m.releaseRef})};value.baseline=memberships(row.port.reconcile({producerRecord:freeze(structuredClone(value)),memberRecords:freeze(row.members.map(x=>x.value)),releaseRecords:freeze(row.members.filter(x=>x.release).map(x=>x.release.value))}),row.participant);saveProducer(repo,state,index,value);refreshCertificates(repo,state);return {memberRef,producerRef:row.record.ref,catalogueRef:state.catalogue.ref};}

/** PF-52: enter and leave one registry boundary, which migrates a catalogue left by another plugin version. */
export function migrateSourceUpdatedSessionAuthorityRegistry({repository:input}){return withSessionAuthorityBoundary({repository:input},()=>null);}
export function initializeSessionAuthorityRegistry({repository:input},ports){try{return withSessionAuthorityBoundary({repository:input},token=>{const repo=boundary(token);retiredRegistryAdmission(repo,'initialize');const pairs=portsFor(repo,ports);boundaryBrands.get(token).ports=pairs;if(existsSync(safePath(repo,cataloguePath))){const state=stateRead(repo,pairs);return freeze({status:'already-initialized',code:null,catalogueRef:state.catalogue.ref});}onboarding.prepareOnboardingContinuityAuthorityParent({repository:repo});const participants=pairs.map(p=>p.participant),participantSetSha256=digest(participants);
  // Critic F2: every producer is read and validated before anything is published, so a later producer's fault no longer leaves earlier records behind.
  const planned=pairs.map(pair=>{const baseline=pair.port.readBaseline();exact(baseline,['memberships','legacyOperations'],'baseline');memberships(baseline.memberships,pair.participant);if(!Array.isArray(baseline.legacyOperations)||baseline.legacyOperations.length>4096)fail('SDC-AUTHORITY-UNAVAILABLE','legacy-operation-bound');return {pair,baseline,observed:baseline.legacyOperations.map(handle=>operation(pair.port,handle,pair.participant))};});
  // A catalogue-less registry indexes nothing and so holds no authority: fragments of an interrupted initialization are moved aside (retained, never deleted).
  const fragments=['producers','members','releases','targets'].filter(name=>existsSync(safePath(repo,`${ROOT}/${name}`)));
  if(fragments.length){const aside=`agent-pipeline/session-authority-abandoned/${new Date().toISOString().replace(/[^0-9]/g,'')}-${randomBytes(4).toString('hex')}`;privateDirectories(repo,`${aside}/marker`);for(const name of fragments)renameSync(safePath(repo,`${ROOT}/${name}`),safePath(repo,`${aside}/${name}`));syncDirectory(safePath(repo,ROOT));}
  const producers=planned.map(({pair,baseline,observed:operations})=>{const members=[];for(const observed of operations){const now=new Date().toISOString();const member={schema:schema('member'),repositorySha256:repoDigest(repo),producerId:pair.participant.producerId,memberId:`member-${randomBytes(16).toString('hex')}`,memberGeneration:1,revision:1,...observed,createdAt:now,updatedAt:now,releaseRef:null};const memberRef=publish(repo,memberPath(member),member);members.push({memberId:member.memberId,memberGeneration:1,memberRef});}const value={schema:schema('producer'),repositorySha256:repoDigest(repo),producerId:pair.participant.producerId,generation:1,participantSetSha256,sourceSha256:pair.participant.sourceSha256,baseline:baseline.memberships,members,targetCertificates:[],lastTransitionSha256:digest({baseline:baseline.memberships,members})};return {producerId:value.producerId,producerRef:publish(repo,producerPath(value.producerId),value),producerGeneration:1};});const value={schema:schema('catalogue'),repositorySha256:repoDigest(repo),generation:1,participantSetSha256,participants,producers};const catalogueRef=publish(repo,cataloguePath,value);
  // PF-53: a fresh registry that does not read back is moved aside (retained) instead of leaving a catalogue nothing can read.
  try{stateRead(repo,pairs);}catch(error){moveRegistryAside(repo,`agent-pipeline/session-authority-abandoned/${new Date().toISOString().replace(/[^0-9]/g,'')}-${randomBytes(4).toString('hex')}-initialization-failed`);throw error;}
  return freeze({status:'initialized',code:null,catalogueRef});});}catch(error){return freeze({status:'unavailable',code:'SDC-AUTHORITY-UNAVAILABLE',catalogueRef:null,reason:typeof error?.reason==='string'?`${error.code??'error'}: ${error.reason}`.slice(0,200):String(error?.code??'error')});}}

export function registerSessionAuthorityTarget({boundary:token,descriptorHandle},ports){const repo=boundary(token);retiredRegistryAdmission(repo,'register-target');const t=target(inspectSourceOwnedDescriptorHandle({repository:repo,descriptorHandle}));const pairs=portsFor(repo,ports);boundaryBrands.get(token).ports=pairs;return withSignedDescriptorCustodyManifestLock(repo.primaryRoot,t.sessionId,()=>{const current=target(inspectSourceOwnedDescriptorHandle({repository:repo,descriptorHandle}));if(!equal(t,current))fail('SDC-DESCRIPTOR-CAS','target-descriptor-changed');const state=stateRead(repo,pairs);refreshCertificates(repo,state,t);return freeze({target:t,certificateRefs:state.rows.map(row=>row.certificates.find(c=>equal(c.value.target,t)).ref)});});}
function selectPort(repo,token,producerPort){const pairs=boundaryPorts(token);const index=pairs.findIndex(p=>p.port===producerPort);if(index!==-1)return {pairs,index};const found=definitions.findIndex(def=>typeof def[1][`isOwned${def[2]}AuthorityProducerPort`]==='function'&&def[1][`isOwned${def[2]}AuthorityProducerPort`](producerPort,{repository:repo})===true);if(found<0)fail('SDC-AUTHORITY-UNAVAILABLE','unowned-producer-port');pairs[found]={...pairs[found],port:producerPort};return {pairs,index:found};}
function descriptorGuard(repo,associationValue,callback){if(associationValue.state==='unbound')return callback();const t=associationValue.target;return withSignedDescriptorCustodyManifestLock(repo.primaryRoot,t.sessionId,()=>{const path=`agent-pipeline/session-descriptors/active/${t.sessionId}.json`;const read=readRaw(repo,path);const d=JSON.parse(read.bytes);if(read.ref.sha256!==t.descriptorSha256||typeof d.ownerNonce!=='string'||hash(d.ownerNonce)!==t.ownerNonceSha256)fail('SDC-DESCRIPTOR-CAS','bound-descriptor-changed');return callback();});}
export function reserveSessionAuthorityMember({boundary:token,producerPort,association:requested,operationHandle}){const repo=boundary(token);retiredRegistryAdmission(repo,'reserve');association(requested);const {pairs,index}=selectPort(repo,token,producerPort);const observed=operation(producerPort,operationHandle,pairs[index].participant);if(observed.phase!=='reserved'||!equal(observed.association,requested))fail('SDC-AUTHORITY-CAS','reservation-owner-binding');return descriptorGuard(repo,requested,()=>{const state=stateRead(repo,pairs);const now=new Date().toISOString();const m={schema:schema('member'),repositorySha256:repoDigest(repo),producerId:pairs[index].participant.producerId,memberId:`member-${randomBytes(16).toString('hex')}`,memberGeneration:generation(Math.max(0,...state.rows[index].members.map(x=>x.value.memberGeneration))+1),revision:1,...observed,createdAt:now,updatedAt:now,releaseRef:null};const memberRef=publish(repo,memberPath(m),m);const refs=updateMembership(repo,state,index,m,memberRef);const memberHandle=Object.freeze({});memberBrands.set(memberHandle,{repositorySha256:repoDigest(repo),producerPort,operationHandle,memberId:m.memberId,memberGeneration:m.memberGeneration});stage('after-reservation-published-before-effects',m,memberRef);return freeze({memberHandle,...refs});});}
function memberFor(repo,producerPort,memberHandle,expectedMemberRef,state,index){const brand=memberBrands.get(memberHandle);if(!brand||brand.repositorySha256!==repoDigest(repo)||brand.producerPort!==producerPort)fail('SDC-AUTHORITY-CAS','unowned-member-handle');ref(expectedMemberRef);const row=state.rows[index].members.find(x=>x.value.memberId===brand.memberId&&x.value.memberGeneration===brand.memberGeneration);if(!row||!equal(row.ref,expectedMemberRef))fail('SDC-AUTHORITY-CAS','member-preimage');return {row,brand};}
export function recoverSessionAuthorityMember({boundary:token,producerPort,operationHandle,expectedMemberRef}){const repo=boundary(token);retiredRegistryAdmission(repo,'recover');const {pairs,index}=selectPort(repo,token,producerPort);ref(expectedMemberRef);const state=stateRead(repo,pairs,{reconcile:false});const row=state.rows[index].members.find(m=>equal(m.ref,expectedMemberRef));if(!row||row.value.phase==='released')fail('SDC-AUTHORITY-CAS','recovery-member-preimage');const observed=operation(producerPort,operationHandle,pairs[index].participant);const m=row.value;if(!equal(observed.association,m.association)||observed.bindingSha256!==m.bindingSha256||!equal(observed.kinds,m.kinds)||observed.phase!==m.phase||!equal(observed.sourceFacts,m.sourceFacts))fail('SDC-AUTHORITY-CAS','recovery-owner-binding');const actual=memberships(producerPort.reconcile({producerRecord:freeze(structuredClone(state.rows[index].record.value)),memberRecords:freeze(state.rows[index].members.map(x=>x.value)),releaseRecords:freeze(state.rows[index].members.filter(x=>x.release).map(x=>x.release.value))}),pairs[index].participant);if(!equal(actual,state.rows[index].record.value.baseline))fail('SDC-AUTHORITY-CAS','recovery-namespace-drift');const memberHandle=Object.freeze({});memberBrands.set(memberHandle,{repositorySha256:repoDigest(repo),producerPort,operationHandle,memberId:m.memberId,memberGeneration:m.memberGeneration});return freeze({memberHandle,memberRef:row.ref,producerRef:state.rows[index].record.ref,catalogueRef:state.catalogue.ref});}
function advanceOwnedSessionAuthorityMember({boundary:token,producerPort,memberHandle,expectedMemberRef,operationHandle},refreshOnly=false){const repo=boundary(token);retiredRegistryAdmission(repo,'advance-terminal');const {pairs,index}=selectPort(repo,token,producerPort);const state=stateRead(repo,pairs,{reconcile:false});const {row,brand}=memberFor(repo,producerPort,memberHandle,expectedMemberRef,state,index);if(brand.operationHandle!==operationHandle)fail('SDC-AUTHORITY-CAS','operation-handle-changed');const observed=operation(producerPort,operationHandle,pairs[index].participant);const m=row.value;if(!equal(observed.association,m.association)||observed.bindingSha256!==m.bindingSha256||!equal(observed.kinds,m.kinds)||m.phase==='released')fail('SDC-AUTHORITY-CAS','operation-binding-changed');if(refreshOnly&&(!['native-goldfish','agy-family-dispatch'].includes(pairs[index].participant.producerId)||observed.phase!==m.phase))fail('SDC-AUTHORITY-CAS','source-refresh-phase');if(equal(observed,{association:m.association,kinds:m.kinds,phase:m.phase,bindingSha256:m.bindingSha256,sourceFacts:m.sourceFacts}))return freeze({memberRef:row.ref,producerRef:state.rows[index].record.ref,catalogueRef:state.catalogue.ref});const allowed={reserved:['armed','running','terminal-observed'],armed:['running','terminal-observed'],running:['terminal-observed'],'terminal-observed':[]};if(refreshOnly){if(!['native-goldfish','agy-family-dispatch'].includes(pairs[index].participant.producerId)||observed.phase!==m.phase)fail('SDC-AUTHORITY-CAS','source-refresh-phase');}else if(!allowed[m.phase]?.includes(observed.phase))fail('SDC-AUTHORITY-CAS','invalid-member-transition');return retiredRegistryDescriptorGuard(repo,m.association,()=>{const next={...m,...observed,revision:generation(m.revision+1),updatedAt:new Date().toISOString()};const memberRef=publish(repo,memberPath(next),next,row.ref);const refs=updateMembership(repo,state,index,next,memberRef);stage('after-owner-effects-readback',next,memberRef);return freeze(refs);});}
export function releaseSessionAuthorityMember({boundary:token,producerPort,memberHandle,expectedMemberRef,terminalHandle}){const repo=boundary(token);retiredRegistryAdmission(repo,'release-terminal');const {pairs,index}=selectPort(repo,token,producerPort);const state=stateRead(repo,pairs,{reconcile:false});const {row}=memberFor(repo,producerPort,memberHandle,expectedMemberRef,state,index);const m=row.value;if(m.phase!=='terminal-observed')fail('SDC-AUTHORITY-HELD','terminal-not-observed');const observed=producerPort.observeTerminal(terminalHandle);exact(observed,['terminal','sourceFacts'],'terminal');const value={schema:schema('release'),repositorySha256:repoDigest(repo),producerId:m.producerId,memberId:m.memberId,memberGeneration:m.memberGeneration,memberPreimageSha256:row.ref.sha256,bindingSha256:m.bindingSha256,...observed,createdAt:new Date().toISOString()};validateRelease(value,repo,m,pairs[index].participant);stage('after-terminal-readback-before-release',m,row.ref);const path=releasePath(m);let releaseRef;if(existsSync(safePath(repo,path))){const prior=readRecord(repo,path);validateRelease(prior.value,repo,m,pairs[index].participant);if(prior.value.memberPreimageSha256!==row.ref.sha256||prior.value.terminal!==observed.terminal||!equal(prior.value.sourceFacts,observed.sourceFacts))fail('SDC-AUTHORITY-CAS','release-prefix-changed');releaseRef=prior.ref;}else releaseRef=publish(repo,path,value);stage('after-release-published-before-member-update',m,row.ref,releaseRef);const next={...m,phase:'released',revision:generation(m.revision+1),updatedAt:new Date().toISOString(),releaseRef};const memberRef=publish(repo,memberPath(next),next,row.ref);const refs=updateMembership(repo,state,index,next,memberRef);stage('after-member-release-published',next,memberRef,releaseRef);return freeze({releaseRef,...refs});}

export function readSessionAuthoritySnapshot({repository:input,target:requested},ports){try{const repo=repository(input),t=target(requested),pairs=portsFor(repo,ports);const state=stateRead(repo,pairs);const certificates=state.rows.map(row=>{const c=row.certificates.find(c=>equal(c.value.target,t));if(!c||c.value.projectionSha256!==digest(projection(row,t,state.catalogue.value.participantSetSha256)))fail('SDC-AUTHORITY-CAS',`${row.participant.producerId}:stale-target-certificate`);return c;});const entries=KINDS.map(kind=>{const indexes=state.rows.map((row,i)=>row.participant.kinds.includes(kind)?i:-1).filter(i=>i>=0);const certificateRefs=sortedRefs(indexes.map(i=>certificates[i].ref)),relevantMemberRefs=sortedRefs(indexes.flatMap(i=>certificates[i].value.memberRefs)),releaseRefs=sortedRefs(indexes.flatMap(i=>certificates[i].value.releaseRefs)),scopeFacts=indexes.flatMap(i=>certificates[i].value.scopeFacts);const held=relevantMemberRefs.length>0||scopeFacts.some(f=>/lock/.test(f.namespaceId));const assurances=pairs.map(p=>p.port.readAssurance());if(assurances.some(a=>!['physical-readback','controlled-unit-method'].includes(a)))fail('SDC-AUTHORITY-UNAVAILABLE','source-assurance-unavailable');const assurance=assurances.includes('controlled-unit-method')?'controlled-unit-method':'physical-readback';return {kind,status:held?'held':releaseRefs.length?'cleared':'absent',producer:`session-authority-registry:${kind}`,sourceRefs:sortedRefs([...certificateRefs,...relevantMemberRefs,...releaseRefs]),bindingSha256:digest({target:t,certificateRefs,relevantMemberRefs,releaseRefs,scopeFacts}),assurance};});return freeze({status:'observed',catalogueRef:state.catalogue.ref,producerRefs:state.rows.map(row=>row.record.ref),entries,authoritySha256:digest(entries)});}catch{return unavailable('session-authority-registry','complete-physical-inventory-unavailable');}}

/** Read-only owner join: validates the existing exact reservation; never mints or advances a member. */
export function inspectSourceOwnedSessionAuthorityMember(input) {
  exact(input,['boundary','producerPort','memberHandle','operationHandle','expectedMemberRef'],'member-inspection');
  const {boundary:token,producerPort,memberHandle,operationHandle,expectedMemberRef}=input;
  const repo=boundary(token);
  const {pairs,index}=selectPort(repo,token,producerPort);
  const state=stateRead(repo,pairs);
  const {row,brand}=memberFor(repo,producerPort,memberHandle,expectedMemberRef,state,index);
  if(brand.operationHandle!==operationHandle)fail('SDC-AUTHORITY-CAS','operation-handle-changed');
  const m=row.value;
  if(m.phase==='released')fail('SDC-AUTHORITY-CAS','member-already-released');
  const observed=operation(producerPort,operationHandle,pairs[index].participant);
  if(!equal(observed,{association:m.association,kinds:m.kinds,phase:m.phase,bindingSha256:m.bindingSha256,sourceFacts:m.sourceFacts}))fail('SDC-AUTHORITY-CAS','inspection-owner-binding');
  return retiredRegistryDescriptorGuard(repo,m.association,()=>{
    // Reopen the current reference inside the existing descriptor lock too.
    const current=readRef(repo,row.ref);
    if(!equal(current.value,m))fail('SDC-AUTHORITY-CAS','inspection-member-drift');
    return freeze({memberRef:row.ref,producerRef:state.rows[index].record.ref,catalogueRef:state.catalogue.ref,
      association:structuredClone(m.association),kinds:[...m.kinds],phase:m.phase,
      bindingSha256:m.bindingSha256,memberId:m.memberId,memberGeneration:m.memberGeneration});
  });
}

function planningFacts(values,p) {
  sourceFacts(values,p.namespaceIds);
  const sorted=[...values].sort((a,b)=>a.namespaceId.localeCompare(b.namespaceId)||a.pathSha256.localeCompare(b.pathSha256));
  if(new Set(sorted.map(f=>f.namespaceId+'/'+f.pathSha256)).size!==sorted.length)fail('SDC-AUTHORITY-CAS','planning-duplicate-source');
  return sorted;
}
function planningBaseline(row) {
  const baseline=row.port.readBaseline();
  exact(baseline,['memberships','legacyOperations'],'planning-baseline');
  memberships(baseline.memberships,row.participant);
  if(!Array.isArray(baseline.legacyOperations)||baseline.legacyOperations.length>4096)fail('SDC-AUTHORITY-UNAVAILABLE','planning-legacy-bound');
  const legacy=baseline.legacyOperations.map(handle=>operation(row.port,handle,row.participant)).map(canonical).sort();
  const reconciled=memberships(row.port.reconcile({producerRecord:freeze(structuredClone(row.record.value)),memberRecords:freeze(row.members.map(m=>structuredClone(m.value))),releaseRecords:freeze(row.members.filter(m=>m.release).map(m=>structuredClone(m.release.value)))}),row.participant);
  if(!equal(reconciled,baseline.memberships))fail('SDC-AUTHORITY-CAS','planning-owner-inventory-disagreement');
  return {memberships:baseline.memberships,legacy};
}
/** HGO-owned non-arming publications only; no caller callback or rebase authority. */
export function executeSourceOwnedSessionAuthorityPlanning(input) {
  exact(input,['boundary','producerPort','planningHandle'],'planning-input');
  const {boundary:token,producerPort,planningHandle}=input,repo=boundary(token);retiredRegistryAdmission(repo,'planning');
  const {pairs,index}=selectPort(repo,token,producerPort);
  if(pairs[index].participant.producerId!=='human-guard-override')fail('SDC-AUTHORITY-UNAVAILABLE','planning-owner-not-hgo');
  for(const method of ['observePlanningOperation','executePlanningOperation','observePlanningTerminal'])if(typeof producerPort[method]!=='function')fail('SDC-AUTHORITY-UNAVAILABLE','planning-owner-method-missing');
  // Complete physical closure and all12 actual source baselines before effects.
  const state=stateRead(repo,pairs),before=state.rows.map(planningBaseline),row=state.rows[index],p=row.participant;
  before.forEach((v,i)=>{if(!equal(v.memberships,state.rows[i].record.value.baseline))fail('SDC-AUTHORITY-CAS','planning-preexisting-drift');});
  const plan=producerPort.observePlanningOperation(planningHandle);
  exact(plan,['entry','inputSha256','allowedNamespaces','allowedPathSha256s','sourceFacts'],'planning-operation');
  const allowedByEntry={'record-denial':['requests','audit','command-offers'],'plan-override':['plans'],'refreeze-plan':['plans','audit'],'sweep-requests':['requests','audit']};
  const allowed=allowedByEntry[plan.entry];
  if(!allowed)fail('SDC-AUTHORITY-UNAVAILABLE','planning-entry');
  sha(plan.inputSha256);
  if(!Array.isArray(plan.allowedNamespaces)||new Set(plan.allowedNamespaces).size!==plan.allowedNamespaces.length||plan.allowedNamespaces.some(ns=>!allowed.includes(ns)))fail('SDC-AUTHORITY-UNAVAILABLE','planning-namespace-scope');
  if(!Array.isArray(plan.allowedPathSha256s)||plan.allowedPathSha256s.length>64||new Set(plan.allowedPathSha256s).size!==plan.allowedPathSha256s.length)fail('SDC-AUTHORITY-UNAVAILABLE','planning-path-scope');
  plan.allowedPathSha256s.forEach(sha);
  const beforeFacts=planningFacts(before[index].memberships.flatMap(v=>v.sourceFacts),p);
  if(!equal(planningFacts(plan.sourceFacts,p),beforeFacts))fail('SDC-AUTHORITY-CAS','planning-source-preimage');
  // The source-owned handle executes exactly its original validated writer.
  // Any throw retains the prefix and old baseline; it is never auto-certified.
  const result=producerPort.executePlanningOperation(planningHandle);
  if(result&&typeof result.then==='function')fail('SDC-AUTHORITY-UNAVAILABLE','planning-asynchronous-writer');
  const terminal=producerPort.observePlanningTerminal(planningHandle);
  exact(terminal,['entry','inputSha256','sourceFacts','journalRefs','result'],'planning-terminal');
  if(terminal.entry!==plan.entry||terminal.inputSha256!==plan.inputSha256
    ||!(Object.is(terminal.result,result)||(result!==undefined&&terminal.result!==undefined&&equal(terminal.result,result))))fail('SDC-AUTHORITY-CAS','planning-terminal-binding');
  const afterState=stateRead(repo,pairs,{reconcile:false});
  if(!equal(afterState.catalogue.ref,state.catalogue.ref)||afterState.rows.some((r,i)=>!equal(r.record.ref,state.rows[i].record.ref)))fail('SDC-AUTHORITY-CAS','planning-registry-effects');
  const after=afterState.rows.map(planningBaseline);
  for(let i=0;i<after.length;i++){
    if(!equal(after[i].legacy,before[i].legacy))fail('SDC-AUTHORITY-CAS','planning-authority-operation-effects');
    if(i!==index&&!equal(after[i].memberships,before[i].memberships))fail('SDC-AUTHORITY-CAS','planning-foreign-producer-effects');
    // All retained authority members still have their original source facts;
    // producer reconcile accounts for them without inventing new generations.
    for(const member of state.rows[i].members)if(member.value.phase!=='released'){
      const matching=afterState.rows[i].members.find(m=>equal(m.ref,member.ref));
      if(!matching||!equal(matching.value,member.value))fail('SDC-AUTHORITY-CAS','planning-member-effects');
    }
  }
  for(const m of before[index].memberships){const observed=after[index].memberships.find(v=>v.namespaceId===m.namespaceId);if(!observed||observed.rootSha256!==m.rootSha256)fail('SDC-AUTHORITY-CAS','planning-namespace-root-drift');}
  const afterFacts=planningFacts(after[index].memberships.flatMap(v=>v.sourceFacts),p);
  if(!equal(planningFacts(terminal.sourceFacts,p),afterFacts))fail('SDC-AUTHORITY-CAS','planning-postread-disagreement');
  for(const member of row.members)if(member.value.phase!=='released')for(const fact of member.value.sourceFacts){
    const original=beforeFacts.find(f=>f.namespaceId===fact.namespaceId&&f.pathSha256===fact.pathSha256);
    const current=afterFacts.find(f=>f.namespaceId===fact.namespaceId&&f.pathSha256===fact.pathSha256);
    if(!original||!equal(original,fact)||!current||!equal(current,fact))fail('SDC-AUTHORITY-CAS','planning-retained-member-source-effects');
  }
  const permitted=f=>plan.allowedNamespaces.includes(f.namespaceId)&&plan.allowedPathSha256s.includes(f.pathSha256);
  if(!equal(beforeFacts.filter(f=>!permitted(f)),afterFacts.filter(f=>!permitted(f))))fail('SDC-AUTHORITY-CAS','planning-unintended-hgo-effects');
  if(!Array.isArray(terminal.journalRefs)||terminal.journalRefs.length===0||terminal.journalRefs.length>64)fail('SDC-AUTHORITY-UNAVAILABLE','planning-journal-bound');
  const seen=new Set();
  for(const journal of terminal.journalRefs){
    ref(journal);
    if(seen.has(journal.path)||!journal.path.startsWith('.git/agent-pipeline/human-guard-overrides/'))fail('SDC-PRIVATE-PATH','planning-journal-scope');seen.add(journal.path);
    const pathDigest=hash(journal.path.slice(5));
    const fact=afterFacts.find(f=>f.pathSha256===pathDigest&&permitted(f));
    if(!fact||fact.sha256!==journal.sha256||fact.size!==journal.size)fail('SDC-AUTHORITY-CAS','planning-journal-source');
    if(!equal(readRaw(repo,journal.path.slice(5)).ref,journal))fail('SDC-AUTHORITY-CAS','planning-journal-preimage');
  }
  // Reobserve all physical inventories after journal reads and before CAS.
  const fresh=afterState.rows.map(planningBaseline);
  if(fresh.some((v,i)=>!equal(v,after[i])))fail('SDC-AUTHORITY-CAS','planning-final-source-drift');
  saveProducer(repo,state,index,{...row.record.value,baseline:after[index].memberships,lastTransitionSha256:digest({entry:plan.entry,inputSha256:plan.inputSha256,journalRefs:terminal.journalRefs,beforeSha256:digest(before[index].memberships),afterSha256:digest(after[index].memberships)})});
  refreshCertificates(repo,state);
  return result;
}

// Shared-State publication is a source-owned transaction, never a caller rebase.
const stateWriteRefreshTickets = new WeakMap();
const stateWriteEntries = new Set(['state.set-feature','state.cancel-submitted-plan','state.cancel-mixed-plan-state','state.reopen-design','state.seal-plan-approval','state.set-gate-estimate','state.revoke-plan','state.set-phase-no-calibration']);
const stateIncidenceNamespaces = {'onboarding-continuity':'selected-state','state-push-challenge':'selected-state-push-challenge'};

/** Native return linkage reads the original reservation while its actual
 * observation has been published but has not yet advanced the namespace. Only
 * an owned native operation can use this join; all member Source facts still
 * match the exact authenticated registry record. It grants no mutation. */
export function inspectSourceOwnedNativeDispatchPendingRecord(input) {
  exact(input,['boundary','producerPort','operationHandle'],'native-pending-inspection');
  const repo=boundary(input.boundary),{pairs,index}=selectPort(repo,input.boundary,input.producerPort);
  if(pairs[index].participant.producerId!=='native-goldfish')fail('SDC-AUTHORITY-CAS','native-pending-producer');
  const state=stateRead(repo,pairs,{reconcile:false}),observed=operation(input.producerPort,input.operationHandle,pairs[index].participant);
  const members=state.rows[index].members.filter(row=>row.value.bindingSha256===observed.bindingSha256);
  if(members.length!==1)fail('SDC-AUTHORITY-CAS','native-pending-member');
  const row=members[0],member=row.value;
  if(!equal(member.association,observed.association)||!equal(member.kinds,observed.kinds)||!equal(member.sourceFacts,observed.sourceFacts)
    ||member.phase!==observed.phase&&!(member.phase==='released'&&observed.phase==='terminal-observed'))fail('SDC-AUTHORITY-CAS','native-pending-operation-drift');
  return freeze({memberRef:row.ref,record:structuredClone(member)});
}

export function inspectSourceOwnedSessionAuthorityProducerRecord(input) {
  exact(input,['boundary','producerPort'],'producer-record-inspection');
  const repo=boundary(input.boundary),{pairs,index}=selectPort(repo,input.boundary,input.producerPort);
  const current=stateRead(repo,pairs);
  return freeze({producerRef:current.rows[index].record.ref,catalogueRef:current.catalogue.ref,record:structuredClone(current.rows[index].record.value)});
}
export function inspectSourceOwnedSessionAuthorityMemberRecord(input) {
  exact(input,['boundary','producerPort','memberRef'],'member-record-inspection');
  const repo=boundary(input.boundary),{pairs,index}=selectPort(repo,input.boundary,input.producerPort);
  ref(input.memberRef);
  const current=stateRead(repo,pairs),member=current.rows[index].members.find(m=>equal(m.ref,input.memberRef));
  if(!member)fail('SDC-AUTHORITY-CAS','member-record-not-current');
  return freeze({memberRef:member.ref,producerRef:current.rows[index].record.ref,catalogueRef:current.catalogue.ref,record:structuredClone(member.value),releaseRef:member.release?.ref??null,releaseRecord:member.release?structuredClone(member.release.value):null});
}
export function inspectSourceOwnedSessionAuthorityStateRefresh(input) {
  exact(input,['boundary','producerPort','stateWriteHandle','ownerWitness'],'state-refresh-inspection');
  const repo=boundary(input.boundary),ticket=stateWriteRefreshTickets.get(input.ownerWitness);
  if(!ticket||ticket.token!==input.boundary||ticket.port!==input.producerPort||ticket.handle!==input.stateWriteHandle||ticket.repositorySha256!==repoDigest(repo))fail('SDC-AUTHORITY-CAS','unowned-state-refresh-ticket');
  // Mid-transaction reconciliation is deferred until every owning port has
  // received its own ticket; records and complete physical closure still read.
  const current=stateRead(repo,ticket.pairs,{reconcile:false}),row=current.rows[ticket.index];
  if(!equal(current.catalogue.ref,ticket.catalogueRef)||!equal(row.record.ref,ticket.producerRef))fail('SDC-AUTHORITY-CAS','state-refresh-ticket-drift');
  for(const item of ticket.members)if(!row.members.some(m=>equal(m.ref,item.memberRef)&&m.value.memberId===item.memberId&&m.value.memberGeneration===item.memberGeneration))fail('SDC-AUTHORITY-CAS','state-refresh-member-drift');
  return freeze({producerRef:row.record.ref,catalogueRef:current.catalogue.ref,members:structuredClone(ticket.members)});
}
function stateImage(image) {
  exact(image,['sha256','size','identity','semanticSha256'],'state-image');
  sourceFacts([{namespaceId:'selected-state',pathSha256:'0'.repeat(64),...image}],['selected-state']);
  return image;
}
function stateImageOf(fact) { const {sha256,size,identity,semanticSha256}=fact;return {sha256,size,identity,semanticSha256}; }
function stateSourceInventory(row,selectedPathSha256,push=null) {
  const value=row.port.readBaseline();
  exact(value,['memberships','legacyOperations'],'state-owner-baseline');
  memberships(value.memberships,row.participant);
  if(!Array.isArray(value.legacyOperations)||value.legacyOperations.length>4096)fail('SDC-AUTHORITY-UNAVAILABLE','state-owner-legacy-bound');
  const legacy=value.legacyOperations.map(h=>operation(row.port,h,row.participant));
  const legacyProjection=legacy.map(o=>{
    const projected={...o,sourceFacts:o.sourceFacts.filter(f=>f.pathSha256!==selectedPathSha256)};
    // Only the actual selected owning operation can change phase in this named
    // transaction. Identity and every other authority field remain compared.
    if(push&&row.port===push.producerPort&&o.bindingSha256===push.before.bindingSha256
      &&equal(o.association,push.before.association)&&equal(o.kinds,push.before.kinds))projected.phase=push.before.phase;
    return projected;
  }).map(canonical).sort();
  return {memberships:value.memberships,legacyOperationsSha256:digest(legacyProjection)};
}
function stateNonselectedConserved(before,after,pathSha256,p) {
  memberships(after,p);
  for(const prior of before){
    const next=after.find(m=>m.namespaceId===prior.namespaceId);
    if(!next||next.rootSha256!==prior.rootSha256)fail('SDC-AUTHORITY-CAS','state-namespace-root-drift');
    const a=prior.sourceFacts.filter(f=>f.pathSha256!==pathSha256),b=next.sourceFacts.filter(f=>f.pathSha256!==pathSha256);
    if(!equal(a,b))fail('SDC-AUTHORITY-CAS','state-nonselected-source-effects');
    if(!prior.sourceFacts.some(f=>f.pathSha256===pathSha256)&&!equal(prior,next))fail('SDC-AUTHORITY-CAS','state-unaffected-membership-effects');
  }
}
function stateRegistryUnchanged(before,after) {
  if(!equal(before.catalogue.ref,after.catalogue.ref)||before.rows.some((r,i)=>!equal(r.record.ref,after.rows[i].record.ref)||!equal(r.members.map(m=>({ref:m.ref,release:m.release?.ref??null})),after.rows[i].members.map(m=>({ref:m.ref,release:m.release?.ref??null})))))fail('SDC-AUTHORITY-CAS','state-writer-registry-effects');
}
function stateSelectedFacts(values,pathSha256,image,namespace) {
  for(const f of values.filter(f=>f.pathSha256===pathSha256))if(f.namespaceId!==namespace||!equal(stateImageOf(f),image))fail('SDC-AUTHORITY-CAS','state-selected-source-binding');
}
function stateVerifyOwner(row,handle,witness,inventory,plan,terminal,push=null) {
  const observation=row.port.verifySharedStateWrite(handle,witness);
  exact(observation,['memberships','memberObservations','legacyOperationsSha256'],'state-owner-witness');
  memberships(observation.memberships,row.participant);sha(observation.legacyOperationsSha256);
  if(!equal(observation.memberships,inventory.memberships)||observation.legacyOperationsSha256!==inventory.legacyOperationsSha256)fail('SDC-AUTHORITY-CAS','state-owner-witness-inventory');
  if(!Array.isArray(observation.memberObservations)||observation.memberObservations.length>4096)fail('SDC-AUTHORITY-UNAVAILABLE','state-member-observation-bound');
  const live=row.members.filter(m=>m.value.phase!=='released');
  if(observation.memberObservations.length!==live.length)fail('SDC-AUTHORITY-CAS','state-member-observation-closure');
  const seen=new Set();
  for(const o of observation.memberObservations){
    exact(o,['memberRef','association','kinds','phase','bindingSha256','sourceFacts'],'state-member-observation');ref(o.memberRef);
    if(seen.has(o.memberRef.path))fail('SDC-AUTHORITY-CAS','state-duplicate-member-observation');seen.add(o.memberRef.path);
    const old=live.find(m=>equal(m.ref,o.memberRef));
    const ownPush=push&&row.port===push.producerPort&&old&&old.value.memberId===push.memberId&&old.value.memberGeneration===push.memberGeneration;
    const expectedPhase=ownPush?push.after.phase:old?.value.phase;
    if(!old||!equal(o.association,old.value.association)||!equal(o.kinds,old.value.kinds)||o.phase!==expectedPhase||o.bindingSha256!==old.value.bindingSha256)fail('SDC-AUTHORITY-CAS','state-member-identity-effects');
    if(ownPush&&!equal(o,{memberRef:old.ref,...push.after}))fail('SDC-AUTHORITY-CAS','state-push-fresh-owner-observation');
    sourceFacts(o.sourceFacts,row.participant.namespaceIds);
    if(!equal(old.value.sourceFacts.filter(f=>f.pathSha256!==plan.selectedPathSha256),o.sourceFacts.filter(f=>f.pathSha256!==plan.selectedPathSha256)))fail('SDC-AUTHORITY-CAS','state-member-nonselected-effects');
    const oldSelected=old.value.sourceFacts.filter(f=>f.pathSha256===plan.selectedPathSha256),newSelected=o.sourceFacts.filter(f=>f.pathSha256===plan.selectedPathSha256);
    if(!equal(oldSelected.map(f=>f.namespaceId),newSelected.map(f=>f.namespaceId)))fail('SDC-AUTHORITY-CAS','state-member-selected-incidence');
    stateSelectedFacts(o.sourceFacts,plan.selectedPathSha256,terminal.postimage,stateIncidenceNamespaces[row.participant.producerId]);
  }
  return observation;
}
/** Common-first exact selected-file mutation; no observer, callback or wire fact can mint its handle. */
export function executeSourceOwnedSessionAuthorityStateWrite(input) {
  exact(input,['boundary','stateWriteHandle'],'state-write-input');
  const {boundary:token,stateWriteHandle:handle}=input,repo=boundary(token);retiredRegistryAdmission(repo,'state-write');
  for(const name of ['isOwnedStateAuthorityWriteHandle','observeStateAuthorityWrite','executeStateAuthorityWrite','observeStateAuthorityWriteTerminal'])if(typeof state[name]!=='function')fail('SDC-AUTHORITY-UNAVAILABLE','state-writer-method-missing');
  if(state.isOwnedStateAuthorityWriteHandle(handle,{repository:repo})!==true)fail('SDC-AUTHORITY-UNAVAILABLE','unowned-state-write-handle');
  const plan=state.observeStateAuthorityWrite(handle);
  exact(plan,['entry','repositorySha256','selectedPathSha256','preimage','affectedProducerIds'],'state-write-observation');
  const namedPushEntries={'state.approve-push.challenge':'challenge','state.approve-push.confirmation':'confirmation'};
  const namedEffect=namedPushEntries[plan.entry]??null;
  if((!stateWriteEntries.has(plan.entry)&&!namedEffect)||plan.repositorySha256!==repoDigest(repo))fail('SDC-AUTHORITY-CAS','state-write-entry-binding');
  sha(plan.selectedPathSha256);stateImage(plan.preimage);
  if(!Array.isArray(plan.affectedProducerIds)||new Set(plan.affectedProducerIds).size!==plan.affectedProducerIds.length)fail('SDC-AUTHORITY-UNAVAILABLE','state-owner-incidence-shape');
  // Absence is observed here, under the actual common lock, before factories.
  try{lstatSync(safePath(repo,cataloguePath));}catch(error){if(error.code==='ENOENT')return state.executeStateAuthorityWrite(handle);throw error;}
  const pairs=boundaryPorts(token);let before,push=null;
  if(namedEffect){
    if(typeof state.inspectOwnedStatePushWrite!=='function'||(namedEffect==='confirmation'&&typeof state.inspectOwnedStatePushTerminal!=='function'))fail('SDC-AUTHORITY-UNAVAILABLE','state-push-owner-inspector-missing');
    const own=state.inspectOwnedStatePushWrite(handle,{repository:repo});
    exact(own,['producerPort','operationHandle','memberHandle','expectedMemberRef','effect'],'state-push-source-context');
    if(own.effect!==namedEffect)fail('SDC-AUTHORITY-CAS','state-push-entry-effect');
    const selected=selectPort(repo,token,own.producerPort);
    if(selected.pairs[selected.index].participant.producerId!=='state-push-challenge'||selected.pairs.some((p,i)=>p.port!==pairs[i].port))fail('SDC-AUTHORITY-CAS','state-push-own-port');
    before=stateRead(repo,pairs);
    const joined=inspectSourceOwnedSessionAuthorityMember({boundary:token,producerPort:own.producerPort,operationHandle:own.operationHandle,memberHandle:own.memberHandle,expectedMemberRef:own.expectedMemberRef});
    const old=before.rows[selected.index].members.find(m=>equal(m.ref,own.expectedMemberRef));
    if(!old||joined.memberId!==old.value.memberId||joined.memberGeneration!==old.value.memberGeneration
      ||(namedEffect==='challenge'?old.value.phase!=='reserved':!['armed','running'].includes(old.value.phase)))fail('SDC-AUTHORITY-CAS','state-push-initial-phase');
    push={...own,memberId:old.value.memberId,memberGeneration:old.value.memberGeneration,before:{association:old.value.association,kinds:old.value.kinds,phase:old.value.phase,bindingSha256:old.value.bindingSha256,sourceFacts:old.value.sourceFacts},after:null};
  }
  if(!before)before=stateRead(repo,pairs);
  const pre=before.rows.map(r=>stateSourceInventory(r,plan.selectedPathSha256,push));
  for(let i=0;i<pre.length;i++)if(!equal(pre[i].memberships,before.rows[i].record.value.baseline))fail('SDC-AUTHORITY-CAS','state-preexisting-inventory-drift');
  const affected=[];
  for(let i=0;i<before.rows.length;i++){
    const row=before.rows[i],facts=pre[i].memberships.flatMap(m=>m.sourceFacts),liveFacts=row.members.filter(m=>m.value.phase!=='released').flatMap(m=>m.value.sourceFacts);
    if(![...facts,...liveFacts].some(f=>f.pathSha256===plan.selectedPathSha256))continue;
    const namespace=stateIncidenceNamespaces[row.participant.producerId];
    if(!namespace)fail('SDC-AUTHORITY-UNAVAILABLE','state-unknown-overlapping-owner');
    stateSelectedFacts([...facts,...liveFacts],plan.selectedPathSha256,plan.preimage,namespace);
    for(const method of ['observeSharedStateWrite','verifySharedStateWrite','refreshSharedStateMemberRefs'])if(typeof row.port[method]!=='function')fail('SDC-AUTHORITY-UNAVAILABLE',`${row.participant.producerId}:state-witness-method-missing`);
    affected.push(i);
  }
  if(!equal(affected.map(i=>before.rows[i].participant.producerId).sort(),[...plan.affectedProducerIds].sort()))fail('SDC-AUTHORITY-CAS','state-owner-incidence-disagreement');
  const witnesses=new Map();
  for(const i of affected){const row=before.rows[i],w=row.port.observeSharedStateWrite(handle,freeze({boundary:token,producerRecord:structuredClone(row.record.value),memberRecords:row.members.map(m=>structuredClone(m.value)),releaseRecords:row.members.filter(m=>m.release).map(m=>structuredClone(m.release.value))}));if(!w||typeof w!=='object'||stateWriteRefreshTickets.has(w)||[...witnesses.values()].includes(w))fail('SDC-AUTHORITY-UNAVAILABLE','state-owner-witness-unavailable');witnesses.set(i,w);}
  // Reobserve all12 after owner preparation, before the original transition.
  const finalPre=stateRead(repo,pairs);stateRegistryUnchanged(before,finalPre);
  if(finalPre.rows.some((r,i)=>!equal(stateSourceInventory(r,plan.selectedPathSha256,push),pre[i])))fail('SDC-AUTHORITY-CAS','state-preparation-effects');
  const result=state.executeStateAuthorityWrite(handle);
  if(result&&typeof result.then==='function')fail('SDC-AUTHORITY-UNAVAILABLE','state-asynchronous-writer');
  const terminal=state.observeStateAuthorityWriteTerminal(handle);
  exact(terminal,['entry','selectedPathSha256','preimage','postimage','result'],'state-write-terminal');stateImage(terminal.preimage);stateImage(terminal.postimage);
  if(terminal.entry!==plan.entry||terminal.selectedPathSha256!==plan.selectedPathSha256||!equal(terminal.preimage,plan.preimage)||!(Object.is(terminal.result,result)||(result!==undefined&&terminal.result!==undefined&&equal(terminal.result,result))))fail('SDC-AUTHORITY-CAS','state-terminal-binding');
  const after=stateRead(repo,pairs,{reconcile:false});stateRegistryUnchanged(before,after);
  if(push){
    const p=before.rows.find(r=>r.port===push.producerPort).participant;
    push.after=operation(push.producerPort,push.operationHandle,p);
    const expectedPhase=push.effect==='challenge'?'armed':'terminal-observed';
    if(push.after.phase!==expectedPhase||!equal(push.after.association,push.before.association)||!equal(push.after.kinds,push.before.kinds)||push.after.bindingSha256!==push.before.bindingSha256)fail('SDC-AUTHORITY-CAS','state-push-terminal-phase');
  }
  const post=after.rows.map(r=>stateSourceInventory(r,plan.selectedPathSha256,push)),verified=new Map();
  for(let i=0;i<post.length;i++){
    const row=before.rows[i];
    if(pre[i].legacyOperationsSha256!==post[i].legacyOperationsSha256)fail('SDC-AUTHORITY-CAS','state-legacy-operation-effects');
    if(!affected.includes(i)){if(!equal(pre[i],post[i]))fail('SDC-AUTHORITY-CAS','state-foreign-producer-effects');continue;}
    stateNonselectedConserved(pre[i].memberships,post[i].memberships,plan.selectedPathSha256,row.participant);
    const selected=post[i].memberships.flatMap(m=>m.sourceFacts).filter(f=>f.pathSha256===plan.selectedPathSha256);
    if(selected.length!==pre[i].memberships.flatMap(m=>m.sourceFacts).filter(f=>f.pathSha256===plan.selectedPathSha256).length)fail('SDC-AUTHORITY-CAS','state-selected-file-disappeared');
    stateSelectedFacts(selected,plan.selectedPathSha256,terminal.postimage,stateIncidenceNamespaces[row.participant.producerId]);
    verified.set(i,stateVerifyOwner(row,handle,witnesses.get(i),post[i],plan,terminal,push));
  }
  if(equal(terminal.preimage,terminal.postimage)&&!push){
    if(post.some((v,i)=>!equal(v,pre[i]))||[...verified].some(([i,v])=>v.memberObservations.some(o=>!equal(o.sourceFacts,before.rows[i].members.find(m=>equal(m.ref,o.memberRef)).value.sourceFacts))))fail('SDC-AUTHORITY-CAS','state-refused-writer-effects');
    stateRead(repo,pairs);return result;
  }
  const fresh=stateRead(repo,pairs,{reconcile:false});stateRegistryUnchanged(before,fresh);
  if(fresh.rows.some((r,i)=>!equal(stateSourceInventory(r,plan.selectedPathSha256,push),post[i])))fail('SDC-AUTHORITY-CAS','state-final-source-drift');
  const handoffs=new Map();
  try{
    for(const i of affected){
      const row=after.rows[i],observation=verified.get(i),changes=[];
      for(const o of observation.memberObservations){const member=row.members.find(m=>equal(m.ref,o.memberRef));if(equal(member.value.sourceFacts,o.sourceFacts)&&member.value.phase===o.phase)continue;const oldRef=member.ref,next={...member.value,phase:o.phase,sourceFacts:structuredClone(o.sourceFacts),revision:generation(member.value.revision+1),updatedAt:new Date().toISOString()};member.ref=publish(repo,memberPath(next),next,oldRef);member.value=next;changes.push({previousMemberRef:oldRef,memberRef:member.ref,memberId:next.memberId,memberGeneration:next.memberGeneration});}
      saveProducer(repo,after,i,{...row.record.value,baseline:structuredClone(post[i].memberships),members:row.members.map(m=>({memberId:m.value.memberId,memberGeneration:m.value.memberGeneration,memberRef:m.ref})),lastTransitionSha256:digest({entry:plan.entry,selectedPathSha256:plan.selectedPathSha256,preimage:terminal.preimage,postimage:terminal.postimage,members:changes})});
      handoffs.set(i,changes);
    }
    // Seal all tickets against the same actual publication prefix; each owner
    // can inspect only its own private witness, never a caller ref collection.
    for(const i of affected)stateWriteRefreshTickets.set(witnesses.get(i),{token,port:after.rows[i].port,handle,repositorySha256:repoDigest(repo),pairs,index:i,producerRef:after.rows[i].record.ref,catalogueRef:after.catalogue.ref,members:handoffs.get(i)});
    for(const i of affected){const returned=after.rows[i].port.refreshSharedStateMemberRefs(handle,witnesses.get(i),{boundary:token});if(returned&&typeof returned.then==='function')fail('SDC-AUTHORITY-UNAVAILABLE','state-asynchronous-ref-refresh');}
    const reconciled=stateRead(repo,pairs);
    if(reconciled.rows.some((r,i)=>!equal(stateSourceInventory(r,plan.selectedPathSha256,push),post[i])))fail('SDC-AUTHORITY-CAS','state-ref-refresh-source-effects');
    refreshCertificates(repo,reconciled);stateRead(repo,pairs);
    if(push?.effect==='confirmation'){
      if(typeof state.inspectOwnedStatePushTerminal!=='function')fail('SDC-AUTHORITY-HELD','state-push-terminal-inspector-missing');
      const terminalHandle=state.inspectOwnedStatePushTerminal(handle,{repository:repo});
      const current=stateRead(repo,pairs),ownRow=current.rows.find(r=>r.port===push.producerPort),ownMember=ownRow.members.find(m=>m.value.memberId===push.memberId&&m.value.memberGeneration===push.memberGeneration);
      if(!ownMember||ownMember.value.phase!=='terminal-observed')fail('SDC-AUTHORITY-HELD','state-push-terminal-member');
      releaseSessionAuthorityMember({boundary:token,producerPort:push.producerPort,memberHandle:push.memberHandle,expectedMemberRef:ownMember.ref,terminalHandle});
      stateRead(repo,pairs);
    }
    return result;
  }finally{for(const witness of witnesses.values())stateWriteRefreshTickets.delete(witness);}
}

// No-Git compatibility serialization does not create a Repository or boundary.
const legacyControlContext = new AsyncLocalStorage();
function legacyControlTopology(input) {
  exact(input,['primaryRoot','commonDir'],'legacy-control');
  if(typeof input.primaryRoot!=='string'||typeof input.commonDir!=='string')fail('SDC-ROOT','legacy-control-paths');
  const root=realpathSync(resolve(input.primaryRoot)),rootInfo=lstatSync(root);
  if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink())fail('SDC-ROOT','legacy-control-root');
  const control=resolve(root,'.git'),info=lstatSync(control);let gitDir;
  if(info.isDirectory()&&!info.isSymbolicLink())gitDir=realpathSync(control);
  else if(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1){
    const before=readFileSync(control,'utf8'),match=before.match(/^gitdir:\s*(.+?)\s*$/mu);
    if(!match||match[1].includes('\0'))fail('SDC-ROOT','legacy-gitdir-declaration');
    const location=resolve(root,match[1]),stat=lstatSync(location);
    if(!stat.isDirectory()||stat.isSymbolicLink())fail('SDC-ROOT','legacy-gitdir-directory');
    gitDir=realpathSync(location);
    const after=lstatSync(control);
    if(info.dev!==after.dev||info.ino!==after.ino||info.mode!==after.mode||before!==readFileSync(control,'utf8'))fail('SDC-AUTHORITY-CAS','legacy-gitdir-drift');
  }else fail('SDC-ROOT','legacy-control-path');
  let common=gitDir;const commonFile=resolve(gitDir,'commondir');let commonStat;
  try{commonStat=lstatSync(commonFile);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(commonStat){
    const stat=commonStat;
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)fail('SDC-ROOT','legacy-commondir-file');
    const bytes=readFileSync(commonFile,'utf8'),raw=bytes.trim();
    if(!raw||raw.includes('\0'))fail('SDC-ROOT','legacy-commondir-declaration');
    const location=resolve(gitDir,raw),physical=lstatSync(location);
    if(!physical.isDirectory()||physical.isSymbolicLink())fail('SDC-ROOT','legacy-common-directory');
    common=realpathSync(location);const after=lstatSync(commonFile);
    if(stat.dev!==after.dev||stat.ino!==after.ino||stat.mode!==after.mode||bytes!==readFileSync(commonFile,'utf8'))fail('SDC-AUTHORITY-CAS','legacy-commondir-drift');
  }
  if(resolve(input.primaryRoot)!==root||resolve(input.commonDir)!==common||realpathSync(input.commonDir)!==common)fail('SDC-ROOT','legacy-control-cas');
  return freeze({primaryRoot:root,commonDir:common});
}
function legacyCatalogue(repo) {
  try{
    const stat=lstatSync(safePath(repo,cataloguePath));owned(stat,false,process.platform==='win32'?safePath(repo,cataloguePath):null);
    // A present catalogue is not a legacy absence claim. Its canonical bytes
    // must be readable before the caller can take its normal all12 route.
    readRecord(repo,cataloguePath);return 'present';
  }catch(error){if(error.code!=='ENOENT')throw error;}
  // Missing catalogue with registry payloads is an interrupted/deleted registry.
  const root=safePath(repo,ROOT);let entries;
  try{owned(lstatSync(root),true,root);entries=readdirSync(root);}catch(error){if(error.code==='ENOENT')return 'absent';throw error;}
  for(const name of entries){
    if(name==='registry.lock')continue;
    if(!['producers','members','releases','targets'].includes(name))fail('SDC-AUTHORITY-HELD','legacy-partial-registry');
    const dir=safePath(repo,`${ROOT}/${name}`);owned(lstatSync(dir),true,dir);
    if(readdirSync(dir).length)fail('SDC-AUTHORITY-HELD','legacy-retained-registry');
  }
  return 'absent';
}
export function executeSourceOwnedLegacySessionAuthorityOperation(input,operationHandle) {
  const repo=legacyControlTopology(input);
  if(typeof hgo.isOwnedHumanGuardLegacyAuthorityOperation!=='function'||typeof hgo.executeOwnedHumanGuardLegacyAuthorityOperation!=='function'||hgo.isOwnedHumanGuardLegacyAuthorityOperation(operationHandle,repo)!==true)fail('SDC-AUTHORITY-UNAVAILABLE','legacy-operation-owner');
  if(retiredRegistryScopes.getStore())fail('SDC-AUTHORITY-HELD','retired-no-legacy-operation');
  const full=boundaryContext.getStore();
  if(full)retiredRegistryAdmission(full.repository,'legacy-operation');
  if(full){
    if(full.repository.primaryRoot!==repo.primaryRoot||full.repository.commonDir!==repo.commonDir)fail('SDC-ROOT','legacy-nested-full-root');
    boundary(full.token);
    if(legacyCatalogue(repo)!=='present')fail('SDC-AUTHORITY-HELD','legacy-full-catalogue-missing');
    return freeze({status:'catalogue-present'});
  }
  // Resolve and seal the physical declarations, not only their resulting tuple.
  // Directory timestamps/link counts can change during lawful namespace writes.
  const controlSnapshot=()=>{
    const observe=(path,optional=false)=>{
      let before;try{before=lstatSync(path);}catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
      if(before.isSymbolicLink()||(!before.isDirectory()&&!before.isFile())||(before.isFile()&&before.nlink!==1))fail('SDC-ROOT','legacy-control-identity');
      const bytes=before.isFile()?readFileSync(path):null,after=lstatSync(path);
      const identity=s=>({dev:String(s.dev),ino:String(s.ino),mode:s.mode,...(s.isFile()?{nlink:s.nlink}: {})});
      if(!equal(identity(before),identity(after))||(bytes&&!bytes.equals(readFileSync(path))))fail('SDC-AUTHORITY-CAS','legacy-control-observation-drift');
      const nativeObservation=process.platform==='win32'?(bytes?nativeSourceRead(path,SESSION_AUTHORITY_LIMITS.maxSourceEntryBytes):windowsAuthority.observeWindowsAuthorityAncestor({path})):null;
      if(bytes&&nativeObservation&&!bytes.equals(nativeObservation.bytes))fail('SDC-AUTHORITY-CAS','legacy-native-control-drift');
      return {path,identity:identity(after),sha256:bytes?hash(bytes):null,size:bytes?bytes.length:null,...(nativeObservation?{nativeFacts:nativeObservation.nativeFacts}:{})};
    };
    const control=resolve(repo.primaryRoot,'.git'),declaration=observe(control);
    const gitDir=lstatSync(control).isDirectory()?realpathSync(control):realpathSync(resolve(repo.primaryRoot,readFileSync(control,'utf8').match(/^gitdir:\s*(.+?)\s*$/mu)[1]));
    return {declaration,gitDirectory:observe(gitDir),commonDeclaration:observe(resolve(gitDir,'commondir'),true),commonDirectory:observe(repo.commonDir)};
  };
  const physicalControl=controlSnapshot();
  // Nested source operations share the same real lock's uncertain-effect flag.
  const nested=legacyControlContext.getStore(),custody=nested?.custody??{retain:false};
  const postimage=()=>{if(!equal(legacyControlTopology(input),repo)||!equal(controlSnapshot(),physicalControl)||legacyCatalogue(repo)!=='absent')fail('SDC-AUTHORITY-CAS','legacy-operation-postimage');};
  const run=()=>{
    if(!equal(legacyControlTopology(input),repo)||!equal(controlSnapshot(),physicalControl))fail('SDC-AUTHORITY-CAS','legacy-layout-preimage');
    if(legacyCatalogue(repo)==='present')return freeze({status:'catalogue-present'});
    if(hgo.isOwnedHumanGuardLegacyAuthorityOperation(operationHandle,repo)!==true)fail('SDC-AUTHORITY-CAS','legacy-operation-preimage');
    let result;
    try{result=hgo.executeOwnedHumanGuardLegacyAuthorityOperation(operationHandle);}catch(error){
      // A normal rejected writer with conserved physical control still cleans
      // up. An observed changed/unreadable post-prefix remains owned and held.
      try{postimage();}catch{custody.retain=true;}
      throw error;
    }
    if(result&&typeof result.then==='function'){custody.retain=true;fail('SDC-AUTHORITY-UNAVAILABLE','legacy-asynchronous-operation');}
    try{postimage();}catch(error){custody.retain=true;throw error;}
    return {status:'legacy-completed',result};
  };
  if(nested){
    if(!equal(nested.repo,repo)||!equal(readRaw(repo,`${ROOT}/registry.lock`).ref,nested.lock))fail('SDC-LOCK-HELD','legacy-nested-lock');
    return run();
  }
  privateDirectories(repo,`${ROOT}/registry.lock`);
  const lockPath=`${ROOT}/registry.lock`,abs=safePath(repo,lockPath),bytes=Buffer.from(canonical({schema:'pipeline.session-authority-legacy-lock.v1',repositorySha256:repoDigest(repo),nonce:randomBytes(32).toString('hex')}));
  let fd,nativeLock;try{if(process.platform==='win32')nativeLock=nativeLockCreate(abs,bytes);else fd=openSync(abs,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}catch{fail('SDC-LOCK-HELD','legacy-registry-lock-held');}
  if(process.platform!=='win32'){try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}}
  const lock=readRaw(repo,lockPath).ref;
  try{return legacyControlContext.run({repo,lock,custody,...(process.platform==='win32'?{nativeWitnesses:new Map([[abs,nativeLock.nativeFacts]])}:{})},run);}finally{
    if(!equal(readRaw(repo,lockPath).ref,lock))fail('SDC-LOCK-HELD','legacy-lock-ownership-changed');
    if(!custody.retain){if(process.platform==='win32')nativeLockRemove(abs,lock,nativeLock);else{unlinkSync(abs);syncDirectory(dirname(abs));}}
  }
}

// Companion writes are owned original State publications, not callback grants.
// These frames exist only at the two genuine companion publication checkpoints.
// They accept no caller callback, ticket constructor, boundary grant or writer.
const controlledContinuityCheckpointScope=new AsyncLocalStorage();
function controlledContinuityCheckpoint(repo,token,handle,pairs,affected,witnesses,after,stage) {
  const index=affected.find(i=>after.rows[i].participant.producerId==='onboarding-continuity');
  if(index===undefined||typeof onboarding.observeSourceOwnedControlledContinuityCompanionCheckpoint!=='function')return;
  const ownerWitness=witnesses.get(index),ticket=companionRefreshTickets.get(ownerWitness);
  const frame={repo,token,handle,pairs,index,ownerWitness,ticket,stage,used:false};
  return controlledContinuityCheckpointScope.run(frame,()=>{
    const returned=onboarding.observeSourceOwnedControlledContinuityCompanionCheckpoint({
      boundary:token,companionWriteHandle:handle,ownerWitness,stage});
    if(returned&&typeof returned.then==='function')fail('SDC-AUTHORITY-HELD','controlled-companion-asynchronous-checkpoint');
    return returned;
  });
}
function controlledContinuityRecordImage(repo,value) {
  const read=readRef(repo,value),path=safePath(repo,value.path.slice(5)),stat=lstatSync(path);
  return {path:value.path,sha256:read.ref.sha256,size:read.ref.size,
    identity:{dev:String(stat.dev),ino:String(stat.ino),mode:stat.mode,nlink:stat.nlink}};
}
export function executeSourceOwnedControlledContinuityTicketProbe(input) {
  exact(input,['probeHandle'],'controlled-companion-probe');
  const frame=controlledContinuityCheckpointScope.getStore();
  if(!frame||frame.used||boundary(frame.token)!==frame.repo||!frame.ticket
      ||companionRefreshTickets.get(frame.ownerWitness)!==frame.ticket
      ||frame.ticket.token!==frame.token||frame.ticket.handle!==frame.handle
      ||frame.ticket.index!==frame.index||frame.ticket.pairs!==frame.pairs
      ||frame.ticket.repositorySha256!==repoDigest(frame.repo))
    fail('SDC-AUTHORITY-UNAVAILABLE','controlled-companion-private-checkpoint-required');
  const inspected=onboarding.inspectSourceOwnedControlledContinuityTicketProbe({probeHandle:input.probeHandle,
    boundary:frame.token,companionWriteHandle:frame.handle,ownerWitness:frame.ownerWitness,
    repository:frame.repo,stage:frame.stage});
  if(!inspected||inspected.producerPort!==frame.ticket.port
      ||!['AFTICKET001','AFTICKET002','AFTICKET003','AFTICKET004'].includes(inspected.caseId))
    fail('SDC-AUTHORITY-UNAVAILABLE','controlled-companion-source-intent-required');
  frame.used=true;
  const original={boundary:frame.token,producerPort:frame.ticket.port,
    companionWriteHandle:frame.handle,ownerWitness:frame.ownerWitness};
  // Authenticate the original real ticket and complete physical Registry closure.
  const observed=inspectSourceOwnedSessionAuthorityCompanionRefresh(original);
  let before=null,afterFault=null,targetRef=null,probeInput=original;
  if(inspected.caseId==='AFTICKET001'){
    const other=frame.pairs.find(pair=>pair.participant.producerId==='chat-gate');
    if(!other||other.port===frame.ticket.port)fail('SDC-AUTHORITY-UNAVAILABLE','controlled-companion-chat-port-missing');
    probeInput={...original,producerPort:other.port};
  }else if(inspected.caseId==='AFTICKET002'){
    if(!inspected.referenceWriteHandle||inspected.referenceWriteHandle===frame.handle)
      fail('SDC-AUTHORITY-UNAVAILABLE','controlled-companion-reference-handle-missing');
    probeInput={...original,companionWriteHandle:inspected.referenceWriteHandle};
  }else if(inspected.caseId==='AFTICKET003'){
    if(frame.stage!=='after-owner-refresh-before-final-inventory'||!inspected.successorReservationOperationHandle)
      fail('SDC-AUTHORITY-UNAVAILABLE','controlled-companion-reservation-stage-missing');
    before=controlledContinuityRecordImage(frame.repo,observed.catalogueRef);
    // Real Source-created pre-bind operation; original reservation gates and write.
    const reserved=reserveSessionAuthorityMember({boundary:frame.token,producerPort:frame.ticket.port,
      association:inspected.association,operationHandle:inspected.successorReservationOperationHandle});
    afterFault=controlledContinuityRecordImage(frame.repo,reserved.catalogueRef);
  }else{
    if(frame.stage!=='after-live-companion-tickets-before-owner-refresh')
      fail('SDC-AUTHORITY-UNAVAILABLE','controlled-companion-member-fault-stage');
    const matching=observed.memberRecords.filter(record=>record.record.bindingSha256===inspected.operationBindingSha256
      &&equal(record.record.association,inspected.association)&&record.releaseRef===null
      &&record.releaseRecord===null&&record.record.phase==='armed');
    if(matching.length!==1)fail('SDC-AUTHORITY-CAS','controlled-companion-own-successor-missing');
    targetRef=matching[0].memberRef;before=controlledContinuityRecordImage(frame.repo,targetRef);
    const path=safePath(frame.repo,targetRef.path.slice(5));
    if(process.platform==='win32')fail('SDC-AUTHORITY-UNAVAILABLE','windows-method-append-unavailable');
    const fd=openSync(path,constants.O_RDWR|constants.O_APPEND|constants.O_NOFOLLOW);
    try{
      const opened=fstatSync(fd);owned(opened);
      if(String(opened.dev)!==before.identity.dev||String(opened.ino)!==before.identity.ino
          ||opened.mode!==before.identity.mode||hash(readFileSync(fd))!==before.sha256
          ||!equal(readRaw(frame.repo,targetRef.path.slice(5)).ref,targetRef))
        fail('SDC-AUTHORITY-CAS','controlled-companion-successor-inode-drift');
      writeFileSync(fd,Buffer.from(' '));fsyncSync(fd);
      const after=fstatSync(fd),actual=lstatSync(path),bytes=readFileSync(path);
      if(opened.dev!==after.dev||opened.ino!==after.ino||after.dev!==actual.dev||after.ino!==actual.ino
          ||actual.mode!==opened.mode||actual.nlink!==1||bytes.length!==before.size+1)
        fail('SDC-AUTHORITY-CAS','controlled-companion-successor-fault-race');
      afterFault={path:targetRef.path,sha256:hash(bytes),size:bytes.length,
        identity:{dev:String(actual.dev),ino:String(actual.ino),mode:actual.mode,nlink:actual.nlink}};
    }finally{closeSync(fd);}
  }
  let probeResult;
  try{probeResult=inspectSourceOwnedSessionAuthorityCompanionRefresh(probeInput);}
  catch(error){
    if(error?.name!=='SessionAuthorityError'||typeof error.code!=='string')throw error;
    probeResult=Object.freeze({name:error.name,code:error.code});
  }
  // An unexpected admitted result is retained so the independent negative fails.
  return freeze({before,afterFault,targetRef,probeResult});
}

const companionRefreshTickets=new WeakMap();
const companionEntries=new Set(['discard-feature','set-feature','continuity-init','submit-plan','present-plan','approve-plan','materialize-architecture','continuity-result-bootstrap-plan','continuity-result-bootstrap-apply','continuity-result-rebind-plan','continuity-result-rebind-apply','continuity-result-close-plan','continuity-result-close-apply','close-feature','afk-project']);
function companionEffectImage(repo,effect) {
  exact(effect,['scope','path','preimage','postimage'],'companion-effect');
  if(!['repository','common'].includes(effect.scope)||typeof effect.path!=='string'||isAbsolute(effect.path)||effect.path.includes('\\')||effect.path.split('/').some(p=>!p||p==='.'||p==='..')||(effect.scope==='repository'&&effect.path.split('/')[0]==='.git'))fail('SDC-PRIVATE-PATH','companion-effect-path');
  const root=effect.scope==='common'?repo.commonDir:repo.primaryRoot;
  if(realpathSync(root)!==root)fail('SDC-ROOT','companion-effect-root');
  let cursor=root;
  for(const part of effect.path.split('/')){cursor=resolve(cursor,part);let stat;try{stat=lstatSync(cursor);}catch(error){if(error.code==='ENOENT')return null;throw error;}if(stat.isSymbolicLink())fail('SDC-PRIVATE-PATH','companion-effect-symlink');if(cursor!==resolve(root,effect.path)&&!stat.isDirectory())fail('SDC-PRIVATE-PATH','companion-effect-parent');}
  const before=lstatSync(cursor);
  const identity=s=>({dev:String(s.dev),ino:String(s.ino),mode:s.mode,nlink:s.nlink});
  const safe=s=>{if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||(typeof process.getuid==='function'&&s.uid!==process.getuid())||s.size>SESSION_AUTHORITY_LIMITS.maxSourceTotalBytes)fail('SDC-PRIVATE-PATH','companion-effect-file');};
  if(process.platform==='win32'){
    const observed=nativeSourceRead(cursor,SESSION_AUTHORITY_LIMITS.maxSourceTotalBytes,effect.scope==='common'),bytes=observed.bytes;
    if(!equal(identity(before),identity(observed.stat)))fail('SDC-AUTHORITY-CAS','companion-effect-race');
    let semanticSha256=hash(bytes);try{const text=bytes.toString('utf8');if(Buffer.from(text).equals(bytes))semanticSha256=digest(JSON.parse(text));}catch{}
    return {sha256:hash(bytes),size:bytes.length,identity:identity(observed.stat),semanticSha256};
  }
  safe(before);let fd;
  try{fd=openSync(cursor,constants.O_RDONLY|constants.O_NOFOLLOW);const opened=fstatSync(fd);safe(opened);const bytes=readFileSync(fd),after=lstatSync(cursor);safe(after);if(!equal(identity(before),identity(opened))||!equal(identity(opened),identity(after))||bytes.length!==after.size||hash(bytes)!==hash(readFileSync(cursor)))fail('SDC-AUTHORITY-CAS','companion-effect-race');let semanticSha256=hash(bytes);try{const text=bytes.toString('utf8');if(Buffer.from(text).equals(bytes))semanticSha256=digest(JSON.parse(text));}catch{}return {sha256:hash(bytes),size:bytes.length,identity:identity(after),semanticSha256};}finally{if(fd!==undefined)closeSync(fd);}
}
function companionValidateImage(image){if(image!==null)stateImage(image);}
function companionFactMatches(fact,images){return images.some(image=>image!==null&&equal(stateImageOf(fact),image));}
function companionInventory(row,images){
  const baseline=row.port.readBaseline();exact(baseline,['memberships','legacyOperations'],'companion-baseline');memberships(baseline.memberships,row.participant);
  if(!Array.isArray(baseline.legacyOperations)||baseline.legacyOperations.length>SESSION_AUTHORITY_LIMITS.maxNamespaceEntries)fail('SDC-AUTHORITY-UNAVAILABLE','companion-legacy-bound');
  const legacy=baseline.legacyOperations.map(h=>operation(row.port,h,row.participant)).map(o=>({...o,sourceFacts:o.sourceFacts.filter(f=>!companionFactMatches(f,images))})).map(canonical).sort();
  return {memberships:baseline.memberships,legacyOperationsSha256:digest(legacy)};
}
function companionConserveFacts(before,after,preimages,postimages){if(!equal(before.filter(f=>!companionFactMatches(f,preimages)),after.filter(f=>!companionFactMatches(f,postimages))))fail('SDC-AUTHORITY-CAS','companion-unscoped-source-effects');}
export function inspectSourceOwnedSessionAuthorityCompanionRefresh(input){
  exact(input,['boundary','producerPort','companionWriteHandle','ownerWitness'],'companion-refresh-input');
  const {boundary:token,producerPort,companionWriteHandle:handle,ownerWitness}=input,repo=boundary(token),ticket=companionRefreshTickets.get(ownerWitness);
  if(!ticket||ticket.token!==token||ticket.port!==producerPort||ticket.handle!==handle||ticket.repositorySha256!==repoDigest(repo))fail('SDC-AUTHORITY-CAS','companion-unowned-refresh');
  const current=stateRead(repo,ticket.pairs,{reconcile:false}),row=current.rows[ticket.index];
  if(!equal(current.catalogue.ref,ticket.catalogueRef)||!equal(row.record.ref,ticket.producerRef))fail('SDC-AUTHORITY-CAS','companion-refresh-prefix-drift');
  for(const item of ticket.members)if(!row.members.some(m=>equal(m.ref,item.memberRef)&&m.value.memberId===item.memberId&&m.value.memberGeneration===item.memberGeneration))fail('SDC-AUTHORITY-CAS','companion-refresh-member-drift');
  // This private refresh ticket owns these exact already-published successors.
  // Reconciliation waits for every owner's normal ref settlement; complete
  // physical record/release/registry closure was checked by stateRead above.
  const memberRecords=ticket.members.map(item=>{
    const member=row.members.find(m=>equal(m.ref,item.memberRef)
      &&m.value.memberId===item.memberId&&m.value.memberGeneration===item.memberGeneration);
    return {memberRef:member.ref,producerRef:row.record.ref,catalogueRef:current.catalogue.ref,
      record:structuredClone(member.value),releaseRef:member.release?.ref??null,
      releaseRecord:member.release?structuredClone(member.release.value):null};
  });
  return freeze({producerRef:row.record.ref,catalogueRef:current.catalogue.ref,
    members:structuredClone(ticket.members),memberRecords});
}
export function executeSourceOwnedSessionAuthorityCompanionWrite(input){
  exact(input,['boundary','companionWriteHandle'],'companion-write-input');const {boundary:token,companionWriteHandle:handle}=input,repo=boundary(token);retiredRegistryAdmission(repo,'close-feature');
  for(const method of ['isOwnedStateAuthorityCompanionWriteHandle','observeStateAuthorityCompanionWrite','executeStateAuthorityCompanionWrite','observeStateAuthorityCompanionWriteTerminal'])if(typeof state[method]!=='function')fail('SDC-AUTHORITY-UNAVAILABLE','companion-state-method-missing');
  if(state.isOwnedStateAuthorityCompanionWriteHandle(handle,{repository:repo})!==true)fail('SDC-AUTHORITY-UNAVAILABLE','companion-unowned-state-handle');
  const plan=state.observeStateAuthorityCompanionWrite(handle);exact(plan,['entry','repositorySha256','effects','affectedProducerIds'],'companion-plan');
  if(!companionEntries.has(plan.entry)||plan.repositorySha256!==repoDigest(repo)||!Array.isArray(plan.effects)||plan.effects.length===0||plan.effects.length>SESSION_AUTHORITY_LIMITS.maxNamespaceEntries)fail('SDC-AUTHORITY-UNAVAILABLE','companion-plan-binding');
  const names=new Set();for(const effect of plan.effects){companionValidateImage(effect.preimage);if(effect.postimage!==null)fail('SDC-AUTHORITY-CAS','companion-premature-postseal');const name=effect.scope+'/'+effect.path;if(names.has(name))fail('SDC-AUTHORITY-CAS','companion-duplicate-effect');names.add(name);if(!equal(companionEffectImage(repo,effect),effect.preimage))fail('SDC-AUTHORITY-CAS','companion-preimage-drift');}
  if(!Array.isArray(plan.affectedProducerIds)||new Set(plan.affectedProducerIds).size!==plan.affectedProducerIds.length||plan.affectedProducerIds.some(id=>!['onboarding-continuity','state-push-challenge'].includes(id)))fail('SDC-AUTHORITY-UNAVAILABLE','companion-incidence-shape');
  if(legacyCatalogue(repo)==='absent')return state.executeStateAuthorityCompanionWrite(handle);
  const pairs=boundaryPorts(token),before=stateRead(repo,pairs),preimages=plan.effects.map(e=>e.preimage),pre=before.rows.map(r=>companionInventory(r,preimages));
  const affected=[];for(let i=0;i<before.rows.length;i++){
    const row=before.rows[i];if(!equal(pre[i].memberships,row.record.value.baseline))fail('SDC-AUTHORITY-CAS','companion-preexisting-drift');
    if(row.members.some(m=>m.value.phase==='released'&&m.value.sourceFacts.some(f=>companionFactMatches(f,preimages))))fail('SDC-AUTHORITY-UNAVAILABLE','companion-historical-owner-witness-missing');
    const overlap=[...pre[i].memberships.flatMap(m=>m.sourceFacts),...row.members.filter(m=>m.value.phase!=='released').flatMap(m=>m.value.sourceFacts)].some(f=>companionFactMatches(f,preimages));
    const declared=plan.affectedProducerIds.includes(row.participant.producerId);
    if(overlap&&!declared)fail('SDC-AUTHORITY-UNAVAILABLE','companion-unknown-overlapping-owner');
    if(declared){for(const method of ['observeCompanionStateWrite','verifyCompanionStateWrite','refreshCompanionStateMemberRefs'])if(typeof row.port[method]!=='function')fail('SDC-AUTHORITY-UNAVAILABLE','companion-owner-method-missing');affected.push(i);}
  }
  const witnesses=new Map();for(const i of affected){const row=before.rows[i],w=row.port.observeCompanionStateWrite(handle,freeze({boundary:token,producerRecord:structuredClone(row.record.value),memberRecords:row.members.map(m=>structuredClone(m.value)),releaseRecords:row.members.filter(m=>m.release).map(m=>structuredClone(m.release.value))}));if(!w||typeof w!=='object'||companionRefreshTickets.has(w)||[...witnesses.values()].includes(w))fail('SDC-AUTHORITY-UNAVAILABLE','companion-owner-witness-missing');witnesses.set(i,w);}
  const last=stateRead(repo,pairs);stateRegistryUnchanged(before,last);if(last.rows.some((r,i)=>!equal(companionInventory(r,preimages),pre[i])))fail('SDC-AUTHORITY-CAS','companion-prepare-effects');for(const e of plan.effects)if(!equal(companionEffectImage(repo,e),e.preimage))fail('SDC-AUTHORITY-CAS','companion-late-preimage');
  const result=state.executeStateAuthorityCompanionWrite(handle);
  // Preserve the original outer CLI integer or atomic writer JSON object.
  // This return comes only from the already-authenticated owning handle.
  const jsonValue=(value,seen=new Set())=>{
    if(value===null||typeof value==='string'||typeof value==='boolean')return true;
    if(typeof value==='number')return Number.isFinite(value);
    if(typeof value!=='object'||seen.has(value))return false;
    if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
    seen.add(value);
    const keys=Reflect.ownKeys(value);
    const valid=keys.every(key=>{if(Array.isArray(value)&&key==='length')return true;const property=Object.getOwnPropertyDescriptor(value,key);return typeof key==='string'&&property.enumerable&&Object.hasOwn(property,'value')&&jsonValue(property.value,seen);});
    seen.delete(value);return valid;
  };
  if(!Number.isInteger(result)&&(!result||Array.isArray(result)||typeof result!=='object'||!jsonValue(result)))fail('SDC-AUTHORITY-HELD','companion-writer-result');
  const terminal=state.observeStateAuthorityCompanionWriteTerminal(handle);exact(terminal,['entry','effects','result'],'companion-terminal');if(terminal.entry!==plan.entry||!jsonValue(terminal.result)||!equal(terminal.result,result)||!Array.isArray(terminal.effects)||terminal.effects.length!==plan.effects.length)fail('SDC-AUTHORITY-CAS','companion-terminal-binding');
  terminal.effects.forEach((e,i)=>{companionValidateImage(e.postimage);const p=plan.effects[i];if(e.scope!==p.scope||e.path!==p.path||!equal(e.preimage,p.preimage)||!equal(companionEffectImage(repo,e),e.postimage))fail('SDC-AUTHORITY-CAS','companion-postseal-binding');});
  const postimages=terminal.effects.map(e=>e.postimage),after=stateRead(repo,pairs,{reconcile:false});stateRegistryUnchanged(before,after);const post=after.rows.map(r=>companionInventory(r,postimages)),verified=new Map();
  for(let i=0;i<after.rows.length;i++){
    if(pre[i].legacyOperationsSha256!==post[i].legacyOperationsSha256)fail('SDC-AUTHORITY-CAS','companion-legacy-identity-effects');
    if(!affected.includes(i)){if(!equal(pre[i],post[i]))fail('SDC-AUTHORITY-CAS','companion-foreign-producer-effects');continue;}
    const row=before.rows[i];for(const old of pre[i].memberships){const next=post[i].memberships.find(m=>m.namespaceId===old.namespaceId);if(!next||next.rootSha256!==old.rootSha256)fail('SDC-AUTHORITY-CAS','companion-namespace-root');companionConserveFacts(old.sourceFacts,next.sourceFacts,preimages,postimages);}
    const observed=row.port.verifyCompanionStateWrite(handle,witnesses.get(i));exact(observed,['memberships','memberObservations','legacyOperationsSha256'],'companion-owner-verified');
    if(!equal(observed.memberships,post[i].memberships)||observed.legacyOperationsSha256!==post[i].legacyOperationsSha256||!Array.isArray(observed.memberObservations)||observed.memberObservations.length!==row.members.filter(m=>m.value.phase!=='released').length)fail('SDC-AUTHORITY-CAS','companion-owner-inventory');
    const seen=new Set();for(const o of observed.memberObservations){exact(o,['memberRef','association','kinds','phase','bindingSha256','sourceFacts'],'companion-member-observation');ref(o.memberRef);const old=row.members.find(m=>equal(m.ref,o.memberRef)&&m.value.phase!=='released');if(!old||seen.has(o.memberRef.path)||!equal(o.association,old.value.association)||!equal(o.kinds,old.value.kinds)||o.phase!==old.value.phase||o.bindingSha256!==old.value.bindingSha256)fail('SDC-AUTHORITY-CAS','companion-member-identity');seen.add(o.memberRef.path);sourceFacts(o.sourceFacts,row.participant.namespaceIds);companionConserveFacts(old.value.sourceFacts,o.sourceFacts,preimages,postimages);}
    verified.set(i,observed);
  }
  const final=stateRead(repo,pairs,{reconcile:false});stateRegistryUnchanged(before,final);if(final.rows.some((r,i)=>!equal(companionInventory(r,postimages),post[i])))fail('SDC-AUTHORITY-CAS','companion-final-source-drift');
  if(equal(preimages,postimages)){if(post.some((p,i)=>!equal(p,pre[i])))fail('SDC-AUTHORITY-CAS','companion-noeffect-drift');stateRead(repo,pairs);return result;}
  try{
    const handoffs=new Map();for(const i of affected){const row=after.rows[i],changes=[];for(const o of verified.get(i).memberObservations){const member=row.members.find(m=>equal(m.ref,o.memberRef));if(equal(member.value.sourceFacts,o.sourceFacts))continue;const oldRef=member.ref,next={...member.value,sourceFacts:structuredClone(o.sourceFacts),revision:generation(member.value.revision+1),updatedAt:new Date().toISOString()};member.ref=publish(repo,memberPath(next),next,oldRef);member.value=next;changes.push({previousMemberRef:oldRef,memberRef:member.ref,memberId:next.memberId,memberGeneration:next.memberGeneration});}saveProducer(repo,after,i,{...row.record.value,baseline:structuredClone(post[i].memberships),members:row.members.map(m=>({memberId:m.value.memberId,memberGeneration:m.value.memberGeneration,memberRef:m.ref})),lastTransitionSha256:digest({entry:plan.entry,effects:terminal.effects,members:changes})});handoffs.set(i,changes);}
    for(const i of affected)companionRefreshTickets.set(witnesses.get(i),{token,port:after.rows[i].port,handle,repositorySha256:repoDigest(repo),pairs,index:i,producerRef:after.rows[i].record.ref,catalogueRef:after.catalogue.ref,members:handoffs.get(i)});
    controlledContinuityCheckpoint(repo,token,handle,pairs,affected,witnesses,after,'after-live-companion-tickets-before-owner-refresh');
    for(const i of affected){const returned=after.rows[i].port.refreshCompanionStateMemberRefs(handle,witnesses.get(i),{boundary:token});if(returned&&typeof returned.then==='function')fail('SDC-AUTHORITY-HELD','companion-asynchronous-refresh');}
    controlledContinuityCheckpoint(repo,token,handle,pairs,affected,witnesses,after,'after-owner-refresh-before-final-inventory');
    const current=stateRead(repo,pairs);stateRegistryUnchanged(after,current);if(current.rows.some((r,i)=>!equal(companionInventory(r,postimages),post[i])))fail('SDC-AUTHORITY-CAS','companion-refresh-effects');refreshCertificates(repo,current);stateRead(repo,pairs);return result;
  }finally{for(const witness of witnesses.values())companionRefreshTickets.delete(witness);}
}

// Source-private I08 phase tickets. No callback, path list or JSON certificate
// supplied by a caller can mint a transition or a ref-refresh capability.
import * as domainTransitionOwner from './session-authority-domain-owner.mjs';
import { parseStrictJson as parseDomainTransitionJson } from './governance-event.mjs';
const domainTransitionExecutions = new WeakMap();
const domainTransitionProducers = new Set(['native-goldfish','managed-codex','agy-family-dispatch','model-family-host','afk-ledger','session-power','local-worker-supervisor']);
const domainTransitionRowKeys = ['memberRef','operationHandle','association','kinds','phase','bindingSha256','sourceFacts'];
function domainTransitionRow(row, participant) {
  exact(row,domainTransitionRowKeys,'domain-transition-member');ref(row.memberRef);
  association(row.association);sha(row.bindingSha256);sourceFacts(row.sourceFacts,participant.namespaceIds);
  if(!Array.isArray(row.kinds)||!row.kinds.length||new Set(row.kinds).size!==row.kinds.length||row.kinds.some(k=>!participant.kinds.includes(k))
    ||!['reserved','armed','running','terminal-observed'].includes(row.phase))fail('SDC-AUTHORITY-CAS','domain-transition-member-shape');
  return row;
}
function domainTransitionOwned(handle,repo,port) {
  if(typeof domainTransitionOwner.isOwnedDomainAuthorityTransitionHandle!=='function'
    ||domainTransitionOwner.isOwnedDomainAuthorityTransitionHandle(handle,{repository:repo,producerPort:port})!==true)fail('SDC-AUTHORITY-HELD','domain-transition-private-owner-unavailable');
}
function domainTransitionScope(scope,p) {
  exact(scope,['namespaceIds','mutablePathSha256s','creations','enrollment'],'domain-transition-write-scope');
  for(const [values,label] of [[scope.namespaceIds,'namespaces'],[scope.mutablePathSha256s,'mutable-paths']]){
    if(!Array.isArray(values)||values.length>4096||new Set(values).size!==values.length)fail('SDC-AUTHORITY-UNAVAILABLE',`domain-transition-${label}-bound`);
  }
  if(!scope.namespaceIds.length||scope.namespaceIds.some(n=>!p.namespaceIds.includes(n)))fail('SDC-AUTHORITY-UNAVAILABLE','domain-transition-namespace-scope');
  scope.mutablePathSha256s.forEach(sha);
  if(!Array.isArray(scope.creations)||scope.creations.length>4096)fail('SDC-AUTHORITY-UNAVAILABLE','domain-transition-creation-bound');
  for(const c of scope.creations){exact(c,['rootPathSha256','relativePattern'],'domain-transition-creation');sha(c.rootPathSha256);
    if(typeof c.relativePattern!=='string'||c.relativePattern.length>512||!c.relativePattern.startsWith('^')||!c.relativePattern.endsWith('$'))fail('SDC-AUTHORITY-UNAVAILABLE','domain-transition-source-pattern');
    try{new RegExp(c.relativePattern,'u');}catch{fail('SDC-AUTHORITY-UNAVAILABLE','domain-transition-source-pattern');}
  }
  if(scope.enrollment!==null){const e=scope.enrollment;exact(e,['registrationPathSha256','externalRootPathSha256','externalPreimageMemberships','anchorSourceFact'],'domain-transition-enrollment');
    sha(e.registrationPathSha256);sha(e.externalRootPathSha256);sourceFacts([e.anchorSourceFact],p.namespaceIds);
    memberships(e.externalPreimageMemberships,p);
    if(!e.externalPreimageMemberships.some(m=>m.sourceFacts.some(f=>equal(f,e.anchorSourceFact))))fail('SDC-AUTHORITY-CAS','domain-transition-root-anchor-preimage');
  }
}
function domainTransitionMatch(row,member,port,p) {
  domainTransitionRow(row,p);
  if(!member||member.value.phase==='released'||!equal(row.memberRef,member.ref))fail('SDC-AUTHORITY-CAS','domain-transition-current-member');
  const {memberRef,operationHandle,...observed}=row;
  const current=operation(port,operationHandle,p);
  if(!equal(observed,current)||!equal(current,{association:member.value.association,kinds:member.value.kinds,phase:member.value.phase,bindingSha256:member.value.bindingSha256,sourceFacts:member.value.sourceFacts}))fail('SDC-AUTHORITY-HELD','domain-transition-live-pin-unavailable');
}
function domainTransitionEntry(entry,p) {
  exact(entry,['path','rootPath','relativePath','sourceFact'],'domain-transition-entry');sourceFacts([entry.sourceFact],p.namespaceIds);
  if(typeof entry.path!=='string'||typeof entry.rootPath!=='string'||typeof entry.relativePath!=='string'
    ||!isAbsolute(entry.path)||!isAbsolute(entry.rootPath)||resolve(entry.path)!==entry.path||resolve(entry.rootPath)!==entry.rootPath
    ||entry.relativePath.length>2048||entry.relativePath===''||entry.relativePath.includes('\\')||entry.relativePath.split('/').some(s=>!s||s==='.'||s==='..')
    ||relative(entry.rootPath,entry.path).split(sep).join('/')!==entry.relativePath
    ||digest(entry.path)!==entry.sourceFact.pathSha256)fail('SDC-PRIVATE-PATH','domain-transition-entry-path');
  return entry;
}
function domainTransitionPhysical(entry,p) {
  domainTransitionEntry(entry,p);
  const read=domainTransitionOwner.readAuthoritySourceFile({namespaceId:entry.sourceFact.namespaceId,filePath:entry.path,semantic:({bytes})=>({rawSha256:hash(bytes)})});
  const {semanticSha256:ignoreA,...a}=read.sourceFact,{semanticSha256:ignoreB,...b}=entry.sourceFact;
  if(!equal(a,b))fail('SDC-AUTHORITY-CAS','domain-transition-physical-postimage');return read;
}
function domainTransitionAllowed(scope,entry,wasPresent,removed=false) {
  if(!scope.namespaceIds.includes(entry.sourceFact.namespaceId))return false;
  if(scope.mutablePathSha256s.includes(entry.sourceFact.pathSha256))return true;
  if(removed||wasPresent)return false;
  if(scope.enrollment?.registrationPathSha256===entry.sourceFact.pathSha256)return true;
  if(scope.enrollment?.externalRootPathSha256===digest(entry.rootPath)
    &&scope.enrollment.externalPreimageMemberships.some(m=>m.sourceFacts.some(f=>equal(f,entry.sourceFact))))return true;
  return scope.creations.some(c=>c.rootPathSha256===digest(entry.rootPath)&&new RegExp(c.relativePattern,'u').test(entry.relativePath));
}
function domainTransitionFactMap(values) {
  const map=new Map();for(const fact of values){const key=`${fact.namespaceId}/${fact.pathSha256}`;if(map.has(key))fail('SDC-AUTHORITY-CAS','domain-transition-duplicate-source');map.set(key,fact);}return map;
}
function domainTransitionInventory(before,terminal,scope,p,repo) {
  memberships(terminal.memberships,p);
  if(!Array.isArray(terminal.changedEntries)||!Array.isArray(terminal.removedEntries)||terminal.changedEntries.length+terminal.removedEntries.length>4096)fail('SDC-AUTHORITY-UNAVAILABLE','domain-transition-entry-bound');
  const old=domainTransitionFactMap(before.flatMap(m=>m.sourceFacts)),now=domainTransitionFactMap(terminal.memberships.flatMap(m=>m.sourceFacts));
  const changed=new Map(),removed=new Map();
  for(const entry of terminal.changedEntries){domainTransitionEntry(entry,p);const key=`${entry.sourceFact.namespaceId}/${entry.sourceFact.pathSha256}`;
    if(changed.has(key)||!equal(now.get(key),entry.sourceFact)||equal(old.get(key),entry.sourceFact)||!domainTransitionAllowed(scope,entry,old.has(key)))fail('SDC-AUTHORITY-CAS','domain-transition-unadmitted-postimage');
    domainTransitionPhysical(entry,p);changed.set(key,entry);
  }
  for(const entry of terminal.removedEntries){domainTransitionEntry(entry,p);const key=`${entry.sourceFact.namespaceId}/${entry.sourceFact.pathSha256}`;
    if(removed.has(key)||!equal(old.get(key),entry.sourceFact)||now.has(key)||!domainTransitionAllowed(scope,entry,true,true))fail('SDC-AUTHORITY-CAS','domain-transition-unadmitted-removal');
    try{lstatSync(entry.path);fail('SDC-AUTHORITY-CAS','domain-transition-removed-file-present');}catch(error){if(error.code!=='ENOENT')throw error;}removed.set(key,entry);
  }
  for(const [key,fact] of old)if(!now.has(key)?!removed.has(key):!equal(now.get(key),fact)&&!changed.has(key))fail('SDC-AUTHORITY-CAS','domain-transition-unwitnessed-old-source');
  for(const [key] of now)if(!old.has(key)&&!changed.has(key))fail('SDC-AUTHORITY-CAS','domain-transition-unwitnessed-creation');
  for(let i=0;i<before.length;i++){
    if(before[i].namespaceId!==terminal.memberships[i]?.namespaceId)fail('SDC-AUTHORITY-CAS','domain-transition-namespace-order');
    if(before[i].rootSha256!==terminal.memberships[i].rootSha256&&scope.enrollment===null)fail('SDC-AUTHORITY-CAS','domain-transition-root-rebase');
    if(!scope.namespaceIds.includes(before[i].namespaceId)&&!equal(before[i],terminal.memberships[i]))fail('SDC-AUTHORITY-CAS','domain-transition-nonselected-namespace');
  }
  if(scope.enrollment!==null){const e=scope.enrollment,entry=[...changed.values()].find(v=>v.sourceFact.pathSha256===e.registrationPathSha256);
    if(!entry||old.has(`${entry.sourceFact.namespaceId}/${entry.sourceFact.pathSha256}`))fail('SDC-AUTHORITY-CAS','domain-transition-root-index-not-new');
    const registration=parseDomainTransitionJson(domainTransitionPhysical(entry,p).bytes);
    exact(registration,['schema','repositorySha256','rootPath','rootPathSha256','rootRecordSha256'],'domain-transition-root-registration');
    if(registration.schema!=='pipeline.source-owned-authority-root.v1'||registration.repositorySha256!==repoDigest(repo)||registration.rootPathSha256!==e.externalRootPathSha256
      ||typeof registration.rootPath!=='string'||!isAbsolute(registration.rootPath)||resolve(registration.rootPath)!==registration.rootPath||realpathSync(registration.rootPath)!==registration.rootPath
      ||digest(registration.rootPath)!==e.externalRootPathSha256||registration.rootRecordSha256!==e.anchorSourceFact.semanticSha256)fail('SDC-AUTHORITY-CAS','domain-transition-root-anchor');
    const rootRows=terminal.changedEntries.filter(v=>digest(v.rootPath)===e.externalRootPathSha256);
    for(const m of e.externalPreimageMemberships)for(const f of m.sourceFacts)if(!rootRows.some(v=>equal(v.sourceFact,f))&&!terminal.memberships.some(n=>n.sourceFacts.some(v=>equal(v,f))))fail('SDC-AUTHORITY-CAS','domain-transition-external-preimage-lost');
  }
}
function domainTransitionMembers(pre,terminal,p,scope,writer) {
  if(!Array.isArray(terminal.memberObservations)||terminal.memberObservations.length!==pre.length)fail('SDC-AUTHORITY-CAS','domain-transition-member-closure');
  const seen=new Set();
  for(const next of terminal.memberObservations){domainTransitionRow(next,p);if(seen.has(next.memberRef.path))fail('SDC-AUTHORITY-CAS','domain-transition-duplicate-member');seen.add(next.memberRef.path);
    const old=pre.find(v=>equal(v.memberRef,next.memberRef));if(!old||old.operationHandle!==next.operationHandle||!equal(old.association,next.association)||!equal(old.kinds,next.kinds)||old.bindingSha256!==next.bindingSha256)fail('SDC-AUTHORITY-CAS','domain-transition-member-identity');
    if(next.phase!==old.phase){const transitions={reserved:['armed','running','terminal-observed'],armed:['running','terminal-observed'],running:['terminal-observed'],'terminal-observed':[]};
      if(old.operationHandle!==writer.operationHandle||!transitions[old.phase]?.includes(next.phase))fail('SDC-AUTHORITY-CAS','domain-transition-retained-phase');}
    const before=domainTransitionFactMap(old.sourceFacts),after=domainTransitionFactMap(next.sourceFacts);
    for(const [key,f] of before)if(!equal(after.get(key),f)&&!scope.mutablePathSha256s.includes(f.pathSha256))fail('SDC-AUTHORITY-CAS','domain-transition-retained-nonmutable');
    for(const f of next.sourceFacts)if(!terminal.memberships.some(n=>n.sourceFacts.some(v=>equal(v,f))))fail('SDC-AUTHORITY-CAS','domain-transition-member-postsource');
  }
}
export function executeSourceOwnedSessionAuthorityDomainTransition(input) {
  exact(input,['boundary','transitionHandle'],'domain-transition-input');const repo=boundary(input.boundary);retiredRegistryAdmission(repo,'domain-transition');
  for(const name of ['isOwnedDomainAuthorityTransitionHandle','observeDomainAuthorityTransition','executeDomainAuthorityTransition','observeDomainAuthorityTransitionTerminal','refreshDomainAuthorityTransitionRefs','readAuthoritySourceFile'])if(typeof domainTransitionOwner[name]!=='function')fail('SDC-AUTHORITY-UNAVAILABLE',`domain-transition-owner-api:${name}`);
  if(domainTransitionExecutions.has(input.transitionHandle))fail('SDC-AUTHORITY-CAS','domain-transition-replay');
  const plan=domainTransitionOwner.observeDomainAuthorityTransition(input.transitionHandle);
  exact(plan,['entry','repositorySha256','producerId','producerPort','writer','retainedMembers','memberships','writeScope','sourceContextSha256'],'domain-transition-plan');
  if(!domainTransitionProducers.has(plan.producerId)||plan.repositorySha256!==repoDigest(repo))fail('SDC-ROOT','domain-transition-domain');sha(plan.sourceContextSha256);
  if(typeof plan.entry!=='string'||!ID.test(plan.entry))fail('SDC-AUTHORITY-UNAVAILABLE','domain-transition-entry');
  domainTransitionOwned(input.transitionHandle,repo,plan.producerPort);
  const {pairs,index}=selectPort(repo,input.boundary,plan.producerPort),pair=pairs[index];if(pair.participant.producerId!==plan.producerId)fail('SDC-AUTHORITY-CAS','domain-transition-port-domain');
  domainTransitionScope(plan.writeScope,pair.participant);
  const before=stateRead(repo,pairs),own=before.rows[index];memberships(plan.memberships,pair.participant);
  if(!equal(plan.memberships,own.record.value.baseline))fail('SDC-AUTHORITY-CAS','domain-transition-preimage-namespace');
  if(!Array.isArray(plan.retainedMembers)||plan.retainedMembers.length>4095)fail('SDC-AUTHORITY-UNAVAILABLE','domain-transition-retained-bound');
  const pinned=[plan.writer,...plan.retainedMembers];if(new Set(pinned.map(v=>v.memberRef?.path)).size!==pinned.length)fail('SDC-AUTHORITY-CAS','domain-transition-member-duplicate');
  for(const row of pinned)domainTransitionMatch(row,own.members.find(m=>equal(m.ref,row.memberRef)),pair.port,pair.participant);
  for(const row of before.rows)for(const member of row.members.filter(m=>m.value.phase!=='released')){
    if(member.value.sourceFacts.some(f=>plan.writeScope.mutablePathSha256s.includes(f.pathSha256))
      &&(row!==own||!pinned.some(v=>equal(v.memberRef,member.ref))))fail('SDC-AUTHORITY-HELD','domain-transition-foreign-or-lost-mutable-owner');
  }
  const snapshot={catalogueRef:before.catalogue.ref,producerRefs:before.rows.map(r=>r.record.ref),memberRefs:before.rows.flatMap(r=>r.members.map(m=>m.ref)),releaseRefs:before.rows.flatMap(r=>r.members.filter(m=>m.release).map(m=>m.release.ref))};
  const ticket={boundary:input.boundary,repo,producerPort:pair.port,index,pairs,before,plan,pinned,updates:null,complete:false};domainTransitionExecutions.set(input.transitionHandle,ticket);
  let result;
  try{
    domainTransitionOwned(input.transitionHandle,repo,pair.port);
    result=domainTransitionOwner.executeDomainAuthorityTransition(input.transitionHandle);
    if(result&&typeof result.then==='function')fail('SDC-AUTHORITY-HELD','domain-transition-async-phase-needs-settled-ticket');
    const terminal=domainTransitionOwner.observeDomainAuthorityTransitionTerminal(input.transitionHandle);
    exact(terminal,['entry','repositorySha256','producerId','producerPort','memberships','memberObservations','changedEntries','removedEntries','result','sourceContextSha256'],'domain-transition-terminal');
    if(terminal.entry!==plan.entry||terminal.repositorySha256!==plan.repositorySha256||terminal.producerId!==plan.producerId||terminal.producerPort!==pair.port||terminal.sourceContextSha256!==plan.sourceContextSha256||terminal.result!==result)fail('SDC-AUTHORITY-CAS','domain-transition-terminal-binding');
    repository(repo);domainTransitionOwned(input.transitionHandle,repo,pair.port);
    const physical=stateRead(repo,pairs,{reconcile:false});
    const actualSnapshot={catalogueRef:physical.catalogue.ref,producerRefs:physical.rows.map(r=>r.record.ref),memberRefs:physical.rows.flatMap(r=>r.members.map(m=>m.ref)),releaseRefs:physical.rows.flatMap(r=>r.members.filter(m=>m.release).map(m=>m.release.ref))};
    if(!equal(snapshot,actualSnapshot))fail('SDC-AUTHORITY-CAS','domain-transition-registry-concurrent-writer');
    domainTransitionInventory(plan.memberships,terminal,plan.writeScope,pair.participant,repo);domainTransitionMembers(pinned,terminal,pair.participant,plan.writeScope,plan.writer);
    for(let i=0;i<physical.rows.length;i++)if(i!==index){const row=physical.rows[i],current=memberships(row.port.reconcile({producerRecord:freeze(structuredClone(row.record.value)),memberRecords:freeze(row.members.map(m=>structuredClone(m.value))),releaseRecords:freeze(row.members.filter(m=>m.release).map(m=>structuredClone(m.release.value)))}),row.participant);if(!equal(current,row.record.value.baseline))fail('SDC-AUTHORITY-CAS','domain-transition-other-owner-drift');}
    ticket.updates=[];
    for(const observed of terminal.memberObservations){const member=physical.rows[index].members.find(m=>equal(m.ref,observed.memberRef));
      const {memberRef,operationHandle,...nextObservation}=observed;
      if(!equal(operation(pair.port,operationHandle,pair.participant),nextObservation))fail('SDC-AUTHORITY-CAS','domain-transition-postoperation');
      if(equal({association:member.value.association,kinds:member.value.kinds,phase:member.value.phase,bindingSha256:member.value.bindingSha256,sourceFacts:member.value.sourceFacts},nextObservation)){ticket.updates.push({beforeMemberRef:memberRef,memberRef});continue;}
      const next={...member.value,...nextObservation,revision:generation(member.value.revision+1),updatedAt:new Date().toISOString()};
      const updated=publish(repo,memberPath(next),next,member.ref);ticket.updates.push({beforeMemberRef:member.ref,memberRef:updated});member.value=next;member.ref=updated;
    }
    const row=physical.rows[index],value={...row.record.value,baseline:terminal.memberships,members:row.members.map(m=>({memberId:m.value.memberId,memberGeneration:m.value.memberGeneration,memberRef:m.ref})),lastTransitionSha256:digest({entry:plan.entry,sourceContextSha256:plan.sourceContextSha256,updates:ticket.updates,baseline:terminal.memberships})};
    saveProducer(repo,physical,index,value);refreshCertificates(repo,physical);
    domainTransitionOwner.refreshDomainAuthorityTransitionRefs(input.transitionHandle,{boundary:input.boundary});
    stateRead(repo,pairs);ticket.complete=true;return result;
  }catch(error){boundaryBrands.get(input.boundary).retainDomainTransition=true;throw error;}
}
export function inspectSourceOwnedSessionAuthorityDomainTransitionRefresh(input) {
  exact(input,['boundary','producerPort','transitionHandle'],'domain-transition-refresh-input');const repo=boundary(input.boundary),ticket=domainTransitionExecutions.get(input.transitionHandle);
  if(!ticket||ticket.boundary!==input.boundary||ticket.producerPort!==input.producerPort||ticket.complete||ticket.updates===null||!equal(ticket.repo,repo))fail('SDC-AUTHORITY-CAS','domain-transition-refresh-ticket');
  domainTransitionOwned(input.transitionHandle,repo,input.producerPort);
  const state=stateRead(repo,ticket.pairs,{reconcile:false}),row=state.rows[ticket.index];
  for(const update of ticket.updates){const old=ticket.before.rows[ticket.index].members.find(m=>equal(m.ref,update.beforeMemberRef)),current=row.members.find(m=>equal(m.ref,update.memberRef));
    if(!old||!current||old.value.memberId!==current.value.memberId||old.value.memberGeneration!==current.value.memberGeneration||old.value.bindingSha256!==current.value.bindingSha256||!equal(old.value.association,current.value.association)||!equal(old.value.kinds,current.value.kinds))fail('SDC-AUTHORITY-CAS','domain-transition-refresh-physical-binding');}
  return freeze({memberUpdates:structuredClone(ticket.updates)});
}

// Separate terminal-only authority. No caller closure JSON can enter this scope.
import { inspectSourceOwnedRetiredOwnerTerminalContext } from './session-requester-bridge.mjs';
import { withOwnedSessionDescriptorClosureLock } from './worktree-lifecycle.mjs';
const retiredRegistryScopes=new AsyncLocalStorage();
function retiredRegistryObservation(repo){
  const observed=inspectSourceOwnedRetiredOwnerTerminalContext({repository:repo});
  if(observed.status!=='terminal-observed')return null;
  exact(observed,['status','descriptorHandle','requesterHandle','currentInvocationHandle','runtimePort','sourceRef','bindingRef','invocationBindingSha256','controllerIdentity','assurance','currentRequester','closure'],'retired-requester-observation');
  const c=observed.closure;exact(c,['status','target','descriptorRef','archiveRef','proofRef','closureRef','repository','assurance'],'retired-closure');
  if(c.status!=='closed'||c.assurance!=='physical-owner-retirement'||!equal(c.repository,repo))fail('SDC-DESCRIPTOR-CAS','retired-closure-binding');
  target(c.target);exact(observed.currentRequester,['sessionId','descriptorSha256','ownerNonceSha256','transportRef','assurance'],'retired-current-requester');
  ref(c.descriptorRef);
  const {transportRef,assurance,...requesterTarget}=observed.currentRequester;
  if(!equal(requesterTarget,c.target)||!equal(transportRef,observed.bindingRef)||assurance!==observed.assurance)fail('SDC-REQUESTER-UNAVAILABLE','retired-requester-target');
  for(const r of [observed.sourceRef,observed.bindingRef,c.archiveRef,c.proofRef,c.closureRef]){ref(r);if(!equal(readRaw(repo,r.path.slice(5)).ref,r))fail('SDC-AUTHORITY-CAS','retired-physical-source-ref');}
  const archive=readRaw(repo,c.archiveRef.path.slice(5));
  const d=JSON.parse(archive.bytes);
  if(archive.ref.sha256!==c.target.descriptorSha256||c.descriptorRef.sha256!==c.target.descriptorSha256||typeof d.ownerNonce!=='string'||hash(d.ownerNonce)!==c.target.ownerNonceSha256
    ||existsSync(safePath(repo,`agent-pipeline/session-descriptors/active/${c.target.sessionId}.json`)))fail('SDC-DESCRIPTOR-CAS','retired-archive-target');
  return observed;
}
function retiredRegistryAdmission(repo,entry){
  const observed=retiredRegistryObservation(repo);if(observed===null)return;
  const scope=retiredRegistryScopes.getStore();
  if(!scope||scope.entry!==entry||!equal(scope.repository,repo)||!equal(scope.target,observed.closure.target)
    ||scope.requesterHandle!==observed.requesterHandle||scope.currentInvocationHandle!==observed.currentInvocationHandle)fail('SDC-AUTHORITY-HELD','retired-terminal-entry-only');
  if(scope.admitted===true)fail('SDC-AUTHORITY-HELD','retired-reentrant-write');scope.admitted=true;
}
function retiredRegistryDescriptorGuard(repo,associationValue,callback){
  const scope=retiredRegistryScopes.getStore();if(!scope)return descriptorGuard(repo,associationValue,callback);
  if(associationValue.state!=='bound'||!equal(associationValue.target,scope.target))fail('SDC-DESCRIPTOR-CAS','retired-member-target');
  const perform=()=>{
    const before=retiredRegistryObservation(repo);if(!before||before.requesterHandle!==scope.requesterHandle)fail('SDC-DESCRIPTOR-CAS','retired-owner-expired');
    const result=callback();if(result&&typeof result.then==='function')fail('SDC-AUTHORITY-HELD','retired-asynchronous-operation');
    const after=retiredRegistryObservation(repo);if(!after||!equal(before.closure,after.closure)||before.currentInvocationHandle!==after.currentInvocationHandle)fail('SDC-DESCRIPTOR-CAS','retired-closure-postimage');return result;
  };
  if(scope.closureLocked===true)return perform();
  return withOwnedSessionDescriptorClosureLock({repository:repo,target:scope.target},()=>{
    scope.closureLocked=true;try{return perform();}finally{scope.closureLocked=false;}
  });
}
function retiredRegistryRun(input,entry,callback){
  if(retiredRegistryScopes.getStore())fail('SDC-AUTHORITY-HELD','retired-nested-operation');
  const repo=boundary(input.boundary),observed=retiredRegistryObservation(repo);if(!observed)fail('SDC-REQUESTER-UNAVAILABLE','retired-owner-context-required');
  const scope={entry,repository:repo,target:observed.closure.target,requesterHandle:observed.requesterHandle,currentInvocationHandle:observed.currentInvocationHandle};
  return retiredRegistryScopes.run(scope,()=>{
    if(entry==='close-feature'||entry==='release-terminal')return retiredRegistryDescriptorGuard(repo,{state:'bound',target:scope.target},()=>callback(repo,scope));
    const result=callback(repo,scope),after=retiredRegistryObservation(repo);
    if(!after||!equal(observed.closure,after.closure)||after.currentInvocationHandle!==scope.currentInvocationHandle)fail('SDC-DESCRIPTOR-CAS','retired-readback-context');return result;
  });
}
function retiredRegistryMember(input,repo,scope,{terminal=false}={}){
  const {pairs,index}=selectPort(repo,input.boundary,input.producerPort);
  if(pairs[index].participant.producerId!=='onboarding-continuity')fail('SDC-AUTHORITY-HELD','retired-owner-producer');
  const current=stateRead(repo,pairs,{reconcile:false}),{row,brand}=memberFor(repo,input.producerPort,input.memberHandle,input.expectedMemberRef,current,index);
  if(row.value.association.state!=='bound'||!equal(row.value.association.target,scope.target)||row.value.phase==='released')fail('SDC-DESCRIPTOR-CAS','retired-own-current-member');
  if(input.operationHandle!==undefined&&brand.operationHandle!==input.operationHandle)fail('SDC-AUTHORITY-CAS','retired-own-operation');
  if(terminal&&row.value.phase!=='terminal-observed')fail('SDC-AUTHORITY-HELD','retired-terminal-not-observed');
  return {row,brand,p:pairs[index].participant};
}
export function advanceSourceOwnedRetiredSessionAuthorityMember(input){
  exact(input,['boundary','producerPort','memberHandle','expectedMemberRef','operationHandle'],'retired-advance-input');
  return retiredRegistryRun(input,'advance-terminal',(repo,scope)=>{
    const {p}=retiredRegistryMember(input,repo,scope),observed=operation(input.producerPort,input.operationHandle,p);
    if(observed.phase!=='terminal-observed')fail('SDC-AUTHORITY-HELD','retired-only-terminal-advance');
    return advanceSessionAuthorityMember(input);
  });
}
export function releaseSourceOwnedRetiredSessionAuthorityMember(input){
  exact(input,['boundary','producerPort','memberHandle','expectedMemberRef','terminalHandle'],'retired-release-input');
  return retiredRegistryRun(input,'release-terminal',(repo,scope)=>{retiredRegistryMember(input,repo,scope,{terminal:true});return releaseSessionAuthorityMember(input);});
}
export function inspectSourceOwnedRetiredSessionAuthorityMember(input){
  exact(input,['boundary','producerPort','memberHandle','operationHandle','expectedMemberRef'],'retired-member-inspection');
  return retiredRegistryRun(input,'inspect-terminal',(repo,scope)=>{retiredRegistryMember(input,repo,scope);return inspectSourceOwnedSessionAuthorityMember(input);});
}
export function executeSourceOwnedRetiredSessionAuthorityCloseWrite(input){
  exact(input,['boundary','companionWriteHandle'],'retired-close-input');
  return retiredRegistryRun(input,'close-feature',(repo)=>{
    if(typeof state.isOwnedStateAuthorityCompanionWriteHandle!=='function'||state.isOwnedStateAuthorityCompanionWriteHandle(input.companionWriteHandle,{repository:repo})!==true)fail('SDC-AUTHORITY-HELD','retired-own-close-handle');
    const plan=state.observeStateAuthorityCompanionWrite(input.companionWriteHandle);
    if(plan.entry!=='close-feature')fail('SDC-AUTHORITY-HELD','retired-only-close-feature');
    return executeSourceOwnedSessionAuthorityCompanionWrite(input);
  });
}

// Fixed diagnostic read/probes, not a boundary/token or writer admission API.
function controlledModelTransitionInput(input) {
  exact(input,['boundary','transitionHandle','observationHandle'],'controlled-model-transition-input');
  const repo=boundary(input.boundary),ticket=domainTransitionExecutions.get(input.transitionHandle);
  if(!ticket||ticket.boundary!==input.boundary||ticket.plan.producerId!=='model-family-host'||!equal(ticket.repo,repo)
    ||domainTransitionOwner.isOwnedControlledDomainTransitionObservation(input.observationHandle,{repository:repo,transitionHandle:input.transitionHandle,boundary:input.boundary})!==true)fail('SDC-AUTHORITY-UNAVAILABLE','controlled-model-transition-unowned');
  return {repo,ticket};
}
function controlledModelPhysicalSnapshot(repo,ticket) {
  const actual=stateRead(repo,ticket.pairs,{reconcile:false});
  return digest({catalogue:actual.catalogue.ref,rows:actual.rows.map(row=>({producer:row.record.ref,members:row.members.map(member=>({member:member.ref,release:member.release?.ref??null}))}))});
}
export function readSourceOwnedControlledModelTransitionSnapshot(input) {
  const {repo,ticket}=controlledModelTransitionInput(input);
  return controlledModelPhysicalSnapshot(repo,ticket);
}
export function observeSourceOwnedControlledModelTransitionRefresh(input) {
  const {repo,ticket}=controlledModelTransitionInput(input);
  if(ticket.complete||ticket.updates===null)fail('SDC-AUTHORITY-UNAVAILABLE','controlled-model-refresh-stage-unavailable');
  const alternate=ticket.pairs.find(pair=>pair.port!==ticket.producerPort);
  if(!alternate)return null;
  const before=controlledModelPhysicalSnapshot(repo,ticket);let row=null;
  try {inspectSourceOwnedSessionAuthorityDomainTransitionRefresh({boundary:input.boundary,producerPort:alternate.port,transitionHandle:input.transitionHandle});}
  catch(error){if(error?.name==='SessionAuthorityError'&&error.code==='SDC-AUTHORITY-CAS'&&error.reason==='domain-transition-refresh-ticket')row={id:'wrong-port',stage:'private-ticket-validation-or-refresh',outcome:'refused',errorName:error.name,code:error.code,reason:error.reason};}
  if(!row||before!==controlledModelPhysicalSnapshot(repo,ticket))return null;
  return Object.freeze(row);
}

// Source-owned early veto only; no authority adoption or writer grant.
export function assertSourceOwnedDomainAuthorityMutablePreflight(input) {
  exact(input,['boundary','producerPort','preflightHandle'],'domain-mutable-preflight-input');
  const repo=boundary(input.boundary);retiredRegistryAdmission(repo,'domain-transition');
  const definition=definitions.find(def=>def[0]==='model-family-host');
  if(!definition||typeof definition[1].isOwnedModelFamilyHostAuthorityProducerPort!=='function'
    ||definition[1].isOwnedModelFamilyHostAuthorityProducerPort(input.producerPort,{repository:repo})!==true
    ||domainTransitionOwner.isOwnedDomainAuthorityMutablePreflightHandle?.(input.preflightHandle,{repository:repo,producerPort:input.producerPort})!==true)fail('SDC-AUTHORITY-UNAVAILABLE','domain-mutable-preflight-unowned');
  const plan=domainTransitionOwner.observeDomainAuthorityMutablePreflight(input.preflightHandle);
  exact(plan,['entry','repositorySha256','producerId','producerPort','mutablePathSha256s','ownedMembers','sourceContextSha256'],'domain-mutable-preflight-plan');
  if(plan.entry!=='pipeline.domain-authority-mutable-preflight.v1'||plan.producerId!=='model-family-host'||plan.repositorySha256!==repoDigest(repo)||plan.producerPort!==input.producerPort)fail('SDC-ROOT','domain-mutable-preflight-binding');
  sha(plan.sourceContextSha256);
  if(!Array.isArray(plan.mutablePathSha256s)||plan.mutablePathSha256s.length>4096||new Set(plan.mutablePathSha256s).size!==plan.mutablePathSha256s.length
    ||!Array.isArray(plan.ownedMembers)||plan.ownedMembers.length>4096)fail('SDC-AUTHORITY-UNAVAILABLE','domain-mutable-preflight-bound');
  plan.mutablePathSha256s.forEach(sha);
  try{readRaw(repo,cataloguePath);}catch(error){if(error?.code==='ENOENT')return;throw error;}
  // These are physical participant descriptors, never fake runtime ports.
  const pairs=definitions.map(def=>({participant:participant(def)}));
  const before=stateRead(repo,pairs,{reconcile:false}),own=before.rows.find(row=>row.participant.producerId===plan.producerId);
  if(!own)fail('SDC-AUTHORITY-UNAVAILABLE','domain-mutable-preflight-producer');
  const modelBaseline=input.producerPort.readBaseline();
  exact(modelBaseline,['memberships','legacyOperations'],'domain-mutable-preflight-model-baseline');
  memberships(modelBaseline.memberships,own.participant);
  if(!Array.isArray(modelBaseline.legacyOperations)||modelBaseline.legacyOperations.length>4096
    ||!equal(modelBaseline.memberships,own.record.value.baseline))fail('SDC-AUTHORITY-CAS','domain-mutable-preflight-model-namespace');
  if(new Set(plan.ownedMembers.map(row=>row.memberRef?.path)).size!==plan.ownedMembers.length)fail('SDC-AUTHORITY-CAS','domain-mutable-preflight-duplicate');
  for(const observed of plan.ownedMembers){
    domainTransitionRow(observed,own.participant);
    const member=own.members.find(row=>equal(row.ref,observed.memberRef));
    if(!member||member.value.phase==='released')fail('SDC-AUTHORITY-CAS','domain-mutable-preflight-live-preimage');
    const {memberRef,operationHandle,...projection}=observed;
    if(!equal(operation(input.producerPort,operationHandle,own.participant),projection)
      ||!equal(projection,{association:member.value.association,kinds:member.value.kinds,phase:member.value.phase,bindingSha256:member.value.bindingSha256,sourceFacts:member.value.sourceFacts}))fail('SDC-AUTHORITY-CAS','domain-mutable-preflight-live-binding');
  }
  const overlap=before.rows.some(row=>row.members.some(member=>member.value.phase!=='released'
    &&member.value.sourceFacts.some(fact=>plan.mutablePathSha256s.includes(fact.pathSha256))
    &&(row!==own||!plan.ownedMembers.some(observed=>equal(observed.memberRef,member.ref)))));
  const snapshot=state=>({catalogueRef:state.catalogue.ref,producerRefs:state.rows.map(row=>row.record.ref),memberRefs:state.rows.flatMap(row=>row.members.map(member=>member.ref)),releaseRefs:state.rows.flatMap(row=>row.members.filter(member=>member.release).map(member=>member.release.ref))});
  if(!equal(snapshot(before),snapshot(stateRead(repo,pairs,{reconcile:false}))))fail('SDC-AUTHORITY-CAS','domain-mutable-preflight-physical-drift');
  const repeated=input.producerPort.readBaseline();
  exact(repeated,['memberships','legacyOperations'],'domain-mutable-preflight-model-baseline');memberships(repeated.memberships,own.participant);
  if(!Array.isArray(repeated.legacyOperations)||repeated.legacyOperations.length>4096||!equal(repeated.memberships,modelBaseline.memberships))fail('SDC-AUTHORITY-CAS','domain-mutable-preflight-model-drift');
  if(overlap)fail('SDC-AUTHORITY-HELD','domain-transition-foreign-or-lost-mutable-owner');
  // No admission result: the caller must still execute every ordinary gate.
}

// Only the two owning dispatch producers can refresh retained source facts.
// Operation and member handles are branded by their existing Source owners.
export function advanceSessionAuthorityMember(input){return advanceOwnedSessionAuthorityMember(input);}
export function refreshSourceOwnedDispatchAuthorityMember(input){return advanceOwnedSessionAuthorityMember(input,true);}
