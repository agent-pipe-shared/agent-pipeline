// SPDX-License-Identifier: SUL-1.0
import { nativeManagedDigest, nativeManagedFault, nativeManagedRepository, nativeManagedCurrentOwner, nativeManagedSourceRef, readNativeManagedSource, readNativeManagedInventory, nativeManagedRegistryPresent, nativeManagedAssociation, nativeManagedPostTerminalRecord } from './native-managed-authority-support.mjs';
import { withSessionAuthorityBoundary, reserveSessionAuthorityMember, advanceSessionAuthorityMember, releaseSessionAuthorityMember, recoverSessionAuthorityMember, inspectSourceOwnedSessionAuthorityProducerRecord, inspectSourceOwnedSessionAuthorityMemberRecord } from './session-authority-registry.mjs';
import { inspectSignedDescriptorCustodyRepository } from './worktree-lifecycle.mjs';
import { inspectManagedCodexAuthorityTerminal, readManagedCodexTerminalJournal } from './codex-host-process-supervisor.mjs';
// Linux process journal for owned Codex readiness sessions.
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync,
  openSync, readFileSync, readSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from './codex-sandbox-compatibility.mjs';
import {canonical as requesterCanonical} from './po-approval-proof.mjs';
import { parseStrictJson } from './governance-event.mjs';
import {parseLinuxProcessStat,observeLinuxProcess,sameProcess as sameLinuxProcess,observeNativePlatformProcess,sameNativePlatformProcess,listNativePlatformSession} from './native-platform-process-observer.mjs';
import { observeNativeWindowsProcess, sameNativeWindowsProcess } from './windows-native-process-observer.mjs';
import { readWindowsOwnedAuthorityFile, inspectWindowsOwnedAuthorityPath, observeWindowsAuthorityAncestor, createWindowsOwnedAuthorityDirectory, createWindowsOwnedAuthorityExclusiveFile, inspectWindowsAuthoritySourceImage } from './windows-owned-authority-backend.mjs';

export const hostDigest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value)
  ? value : canonicalJson(value)).digest('hex');
export const hostFault = code => Object.assign(new Error(code), { code });
export {parseLinuxProcessStat,observeLinuxProcess};
export function sameProcess(a,b){return process.platform==='darwin'?sameNativePlatformProcess(a,b):sameLinuxProcess(a,b);}
export function checkedHostDirectory(path) {
  if(process.platform==='win32'){inspectWindowsOwnedAuthorityPath({path,directory:true});return path;}
  const absolute = resolve(path), stat = lstatSync(absolute);
  if (absolute !== path || realpathSync(path) !== path || stat.isSymbolicLink() || !stat.isDirectory()
    || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) throw hostFault('host-journal-directory-unsafe');
  return path;
}
// Registration is local to this controller. The private caller supplies the
// authoritative Git common directory; this helper is not repository discovery.
const registeredProcessRoots = new Map();
function rootIdentity(path, privateMode) {
  if(process.platform==='win32'){
    const observed=privateMode?inspectWindowsOwnedAuthorityPath({path,directory:true}):observeWindowsAuthorityAncestor({path});
    return {path,platform:'win32',privateMode,nativeFacts:observed.nativeFacts,nativeFactsSha256:observed.nativeFactsSha256,helperSha256:observed.helperSha256};
  }
  const stat = lstatSync(path);
  if (typeof path !== 'string' || resolve(path) !== path || realpathSync(path) !== path
    || !stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || (stat.mode & 0o022) !== 0 || privateMode && (stat.mode & 0o077) !== 0) throw hostFault('host-process-root-unsafe');
  return { path, dev: stat.dev, ino: stat.ino, uid: stat.uid, mode: stat.mode, privateMode };
}
function sameRootIdentity(expected) {
  const current = rootIdentity(expected.path, expected.privateMode);
  return (process.platform==='win32'?['platform','privateMode','nativeFacts','nativeFactsSha256','helperSha256']:['dev', 'ino', 'uid', 'mode']).every(key => current[key] === expected[key]);
}
/** Called by the sealed controller before createHostJournal, including re-entry. */
function materializeCodexHostProcessRoot({ gitCommonDir, repoFingerprint, purpose = 'design-readiness' } = {}) {
  if (!['linux','win32','darwin'].includes(process.platform)) throw hostFault('host-process-platform-unavailable');
  if (typeof gitCommonDir !== 'string' || typeof repoFingerprint !== 'string'
    || !/^[a-f0-9]{64}$/.test(repoFingerprint) || !['design-readiness', 'advisor'].includes(purpose)) {
    throw hostFault('host-process-root-registration-invalid');
  }
  if(process.platform==='darwin')observeNativePlatformProcess(process.pid);
  const roots = [rootIdentity(gitCommonDir, false)];
  const namespace = purpose === 'advisor' ? 'advisor-codex' : 'design-readiness-codex';
  let path = gitCommonDir;
  for (const segment of ['agent-pipeline', namespace, repoFingerprint, 'processes']) {
    path = join(path, segment);
    if(process.platform==='win32'){try{lstatSync(path);}catch(error){if(error.code!=='ENOENT')throw error;createWindowsOwnedAuthorityDirectory({path});}}
    else try { mkdirSync(path, { mode: 0o700 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
    // The shared parent is also used by sanctioned governance writers (0755).
    // Duty, repository and process directories remain owner-private.
    roots.push(rootIdentity(path, segment !== 'agent-pipeline'));
    if(process.platform!=='win32'){const fd = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY);
    try { fsyncSync(fd); } finally { closeSync(fd); }}
  }
  if (!roots.every(sameRootIdentity)) throw hostFault('host-process-root-changed');
  registeredProcessRoots.set(path, { purpose, repoFingerprint, roots });
  return path;
}
function assertProcessRoot(parent, binding) {
  if(process.platform==='win32'){
    const registration=registeredProcessRoots.get(parent);
    if(!registration||!['advisor','design-readiness'].includes(registration.purpose)||binding?.repoFingerprint!==registration.repoFingerprint
      ||!registration.roots.every(sameRootIdentity))throw hostFault('host-process-root-unregistered');return;
  }
  // Preserve the existing Readiness admission boundary and default behavior.
  if (/\/agent-pipeline\/design-readiness-codex\/[a-f0-9]{64}\/processes$/.test(parent)) return;
  const registration = registeredProcessRoots.get(parent);
  if (!registration || registration.purpose !== 'advisor'
    || binding?.repoFingerprint !== registration.repoFingerprint) throw hostFault('host-process-root-unregistered');
  if (!registration.roots.every(sameRootIdentity)) throw hostFault('host-process-root-changed');
}
const names = new Set(['intent', 'launcher', 'admission', 'child-intent', 'worker', 'child', 'exec-admission', 'execution', 'terminal', 'recovered-child', 'recovery', 'authority']);
export function writeHostJournal(directory, name, value) {
  if(process.platform==='win32'){
    checkedHostDirectory(directory);if(!names.has(name))throw hostFault('host-journal-name-invalid');
    const bytes=Buffer.from(canonicalJson(value)),path=join(directory,name+'.json');
    createWindowsOwnedAuthorityExclusiveFile({path,bytes});const read=verificationWindowsRead(path,524288);
    if(!read.bytes.equals(bytes))throw hostFault('host-journal-file-changed');return {value,sha256:hostDigest(bytes)};
  }
  checkedHostDirectory(directory);
  if (!names.has(name)) throw hostFault('host-journal-name-invalid');
  const bytes = Buffer.from(canonicalJson(value));
  const temporary = join(directory, `.pending-${randomBytes(16).toString('hex')}`);
  let fd;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeFileSync(fd, bytes); fsyncSync(fd); closeSync(fd); fd = undefined;
    linkSync(temporary, join(directory, `${name}.json`));
    const parent = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY);
    try { fsyncSync(parent); } finally { closeSync(parent); }
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    // Persist temporary-link removal before a caller may spawn. Otherwise a
    // crash can resurrect nlink=2 and invalidate the registered identity.
    const parent = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY);
    try { fsyncSync(parent); } finally { closeSync(parent); }
  }
  return { value, sha256: hostDigest(bytes) };
}
export function readHostJournal(directory, name) {
  if(process.platform==='win32'){
    checkedHostDirectory(directory);if(!names.has(name))throw hostFault('host-journal-name-invalid');
    const path=join(directory,name+'.json');try{lstatSync(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}
    const read=verificationWindowsRead(path,524288),value=parseStrictJson(read.bytes);
    if(canonicalJson(value)!==read.bytes.toString('utf8'))throw hostFault('host-journal-noncanonical');return {value,sha256:hostDigest(read.bytes)};
  }
  checkedHostDirectory(directory);
  if (!names.has(name)) throw hostFault('host-journal-name-invalid');
  const path = join(directory, `${name}.json`);
  let fd;
  try {
    const before = lstatSync(path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > 524288n || (before.mode & 0o077n) !== 0n
      || before.uid !== BigInt(process.getuid())) throw hostFault('host-journal-file-unsafe');
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(fd, { bigint: true });
    const fields = ['dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
    const same = stat => fields.every(key => stat[key] === before[key]);
    if (!same(opened)) throw hostFault('host-journal-file-changed');
    // The overflow byte bounds actual reads even if the file grows after fstat.
    const buffer = Buffer.alloc(524289);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(fd, buffer, length, buffer.length - length, length);
      if (count === 0) break;
      length += count;
    }
    if (length > 524288) throw hostFault('host-journal-file-unsafe');
    const after = lstatSync(path, { bigint: true });
    const final = fstatSync(fd, { bigint: true });
    if (BigInt(length) !== before.size || ![after, final].every(same)) throw hostFault('host-journal-file-changed');
    const bytes = buffer.subarray(0, length);
    const value = parseStrictJson(bytes);
    if (canonicalJson(value) !== bytes.toString('utf8')) throw hostFault('host-journal-noncanonical');
    return { value, sha256: hostDigest(bytes) };
  } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  finally { if (fd !== undefined) closeSync(fd); }
}
function createHostJournalUnchecked(parent, fields, { receiptId = `drh_${randomBytes(16).toString('hex')}` } = {}) {
  if (!['linux','win32','darwin'].includes(process.platform)) throw hostFault('host-process-platform-unavailable');
  if(process.platform==='darwin')observeNativePlatformProcess(process.pid);
  checkedHostDirectory(parent);
  assertProcessRoot(parent, fields?.binding);
  if (!fields || Object.keys(fields).sort().join(',') !== ['binding', 'executable', 'nodeExecutable', 'launcher', 'worker', 'args', 'cwd'].sort().join(',')) {
    throw hostFault('host-process-intent-invalid');
  }
  if (!/^drh_[a-f0-9]{32}$/.test(receiptId)) throw hostFault('host-process-receipt-id-invalid');
  const directory = join(parent, `codex-host-${receiptId}`);
  if(process.platform==='win32')createWindowsOwnedAuthorityDirectory({path:directory});else mkdirSync(directory, { mode: 0o700 });
  assertProcessRoot(parent, fields.binding);
  if(process.platform!=='win32'){const parentFd = openSync(parent, constants.O_RDONLY | constants.O_DIRECTORY);
  try { fsyncSync(parentFd); } finally { closeSync(parentFd); }}
  const runId = randomBytes(32).toString('hex');
  const record = { schema: 'pipeline.codex-host-process-intent.v1', runId, receiptId, ...fields,
    controller: process.platform==='win32'?verificationObserveProcess(process.pid):observeNativePlatformProcess(process.pid), createdAt: new Date().toISOString() };
  const intent = writeHostJournal(directory, 'intent', record);
  assertProcessRoot(parent, fields.binding);
  return { directory, intent };
}
export function listOwnedSession(launcher) {
  if(process.platform==='darwin')return listNativePlatformSession(launcher);
  if(process.platform==='win32')throw hostFault('host-native-process-tree-proof-unavailable');
  const members = [];
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    let stat;
    try { stat = parseLinuxProcessStat(readFileSync(`/proc/${entry}/stat`, 'utf8')); }
    catch (error) { if (error?.code === 'ENOENT' || error?.code === 'ESRCH') continue; throw error; }
    if (stat.session !== launcher.session || stat.group !== launcher.group || ['Z', 'X'].includes(stat.state)) continue;
    const observed = observeLinuxProcess(stat.pid);
    if (!observed) continue;
    if (observed.uid !== launcher.uid || observed.bootSha256 !== launcher.bootSha256
      || BigInt(observed.start) < BigInt(launcher.start)) throw hostFault('host-session-ownership-unverified');
    members.push(observed);
  }
  return members;
}
export function journalExecutable(path) {
  if(process.platform==='win32'){const physical=realpathSync(path),image=inspectWindowsAuthoritySourceImage({path:physical});return {path:physical,sha256:image.sha256};}
  const physical = realpathSync(path), stat = lstatSync(physical);
  if (!stat.isFile() || stat.uid !== process.getuid() && stat.uid !== 0 || !(stat.mode & 0o111)) throw hostFault('host-executable-invalid');
  return { path: physical, sha256: hostDigest(readFileSync(physical)) };
}

const managedAuthorityPorts=new WeakMap(),managedAuthorityOperations=new WeakMap(),managedInvocationContexts=new WeakMap();
const managedAuthorityOwners=new Map();
function managedOwner(repository){
  const repo=nativeManagedRepository(repository),identity=nativeManagedDigest({primaryRoot:repo.primaryRoot,commonDir:repo.commonDir});
  let owner=managedAuthorityOwners.get(identity);
  if(!owner){owner={repository:repo,operations:new Map(),assurance:'physical-readback'};managedAuthorityOwners.set(identity,owner);}
  owner.repository=repo;return owner;
}
function managedScan(owner){
  const scans=readNativeManagedInventory(owner.repository,'managed-codex');
  for(const scan of scans){
    const directories=new Map();
    for(const entry of scan.entries){const directory=dirname(entry.path);if(!directories.has(directory))directories.set(directory,[]);directories.get(directory).push(entry);}
    for(const [directory,entries] of directories){
      const intent=entries.find(e=>e.relativePath.endsWith('/intent.json'));
      if(!intent||intent.value.schema!=='pipeline.codex-host-process-intent.v1'||!intent.value.controller||!intent.value.binding
        ||!Number.isSafeInteger(intent.value.controller.pid)||intent.value.controller.pid<1
        ||!(process.platform==='win32'?verificationSameProcess(intent.value.controller,intent.value.controller):(process.platform==='darwin'?/^\d+:\d+$/.test(intent.value.controller.start):/^\d+$/.test(intent.value.controller.start))&&/^[a-f0-9]{64}$/.test(intent.value.controller.bootSha256)&&sameProcess(intent.value.controller,intent.value.controller)))throw nativeManagedFault('managed-authority-intent-unresolved');
      let operation=owner.operations.get(directory);
      const authority=entries.find(e=>e.relativePath.endsWith('/authority.json'));
      if(authority&&(!authority.value||authority.value.schema!=='pipeline.codex-host-authority.v1'
        ||Object.keys(authority.value).sort().join(',')!=='association,intentSha256,operationSha256,schema'
        ||authority.value.intentSha256!==intent.sourceFact.sha256||!/^[a-f0-9]{64}$/.test(authority.value.operationSha256)))throw nativeManagedFault('managed-authority-durable-binding');
      if(authority)nativeManagedAssociation(authority.value.association);
      if(!operation){const handle=Object.freeze({});operation={handle,directory,intentSha256:intent.sourceFact.sha256,
        association:authority?nativeManagedAssociation(authority.value.association):{state:'unbound',target:null},descriptorHandle:null,phase:'running',
        bindingSha256:authority?.value.operationSha256??nativeManagedDigest({repository:{primaryRoot:owner.repository.primaryRoot,commonDir:owner.repository.commonDir},intentSha256:intent.sourceFact.sha256,runId:intent.value.runId})};
        managedAuthorityOperations.set(handle,{owner,operation});owner.operations.set(directory,operation);}
      if(operation.intentSha256!==intent.sourceFact.sha256)throw nativeManagedFault('managed-authority-intent-drift');
      if(authority&&(authority.value.operationSha256!==operation.bindingSha256||canonicalJson(authority.value.association)!==canonicalJson(operation.association)))throw nativeManagedFault('managed-authority-retained-owner-drift');
      const closed=readManagedCodexTerminalJournal({directory});
      // Post-terminal finalization records are published after the release, so a closed operation binds the same
      // facts it was released with; a record that appears before the terminal journal closes stays a bound fact.
      operation.namespaceId=scan.membership.namespaceId;operation.sourceFacts=entries.filter(e=>closed.status!=='closed'||!nativeManagedPostTerminalRecord(e.relativePath)).map(e=>e.sourceFact).sort((a,b)=>a.pathSha256.localeCompare(b.pathSha256));
      operation.intentEntry=intent;
      if(closed.status==='closed')operation.phase='terminal-observed';
      else if(!operation.memberHandle)operation.phase=entries.some(e=>e.relativePath.endsWith('/execution.json'))?'running':'armed';
    }
  }
  const intentPaths=new Set(scans.flatMap(scan=>scan.entries.filter(entry=>entry.relativePath.endsWith('/intent.json')).map(entry=>dirname(entry.path))));
  for(const operation of owner.operations.values())if(operation.intentSha256&&!intentPaths.has(operation.directory))throw nativeManagedFault('managed-authority-missing-intent');
  return scans;
}
function managedObserve(owner,handle){
  const entry=managedAuthorityOperations.get(handle);if(!entry||entry.owner!==owner)throw nativeManagedFault('managed-authority-operation-unowned');
  managedScan(owner);const operation=entry.operation;
  return {association:operation.association,kinds:['dispatch'],phase:operation.phase,bindingSha256:operation.bindingSha256,sourceFacts:operation.sourceFacts??[]};
}
export function createManagedCodexAuthorityProducerPort({repository}={}){
  const owner=managedOwner(repository),port=Object.freeze({
    readBaseline(){const scans=managedScan(owner);return {memberships:scans.map(s=>s.membership),legacyOperations:[...owner.operations.values()].filter(o=>o.phase!=='terminal-observed').map(o=>o.handle)};},
    observeOperation:handle=>managedObserve(owner,handle),
    observeTerminal(handle){const terminal=inspectManagedCodexAuthorityTerminal({repository:owner.repository,terminalHandle:handle});
      const operation=owner.operations.get(terminal.directory);if(!operation||operation.phase!=='terminal-observed')throw nativeManagedFault('managed-authority-terminal-unobserved');
      const observed=managedObserve(owner,operation.handle);if(!observed.sourceFacts.length)throw nativeManagedFault('managed-authority-terminal-empty');
      return {terminal:'completed',sourceFacts:observed.sourceFacts};},
    reconcile({memberRecords}){const scans=managedScan(owner);
      for(const operation of owner.operations.values()){
        const records=memberRecords.filter(m=>m.bindingSha256===operation.bindingSha256);
        if(records.length===0&&operation.phase==='reserved'&&!operation.intentEntry)continue;
        if(records.length===0&&operation.phase==='terminal-observed')continue;
        if(records.length!==1)throw nativeManagedFault('managed-authority-member-coverage');
        const observed=managedObserve(owner,operation.handle),member=records[0];
        if(canonicalJson(member.association)!==canonicalJson(observed.association)
          ||member.phase!=='released'&&member.phase!==observed.phase
          ||member.phase==='released'&&observed.phase!=='terminal-observed'
          ||canonicalJson(member.sourceFacts)!==canonicalJson(observed.sourceFacts))throw nativeManagedFault('managed-authority-member-drift');
      }return scans.map(s=>s.membership);},
    readAssurance:()=>owner.assurance,
  });managedAuthorityPorts.set(port,owner);return port;
}
export function isOwnedManagedCodexAuthorityProducerPort(port,{repository}={}){try{return managedAuthorityPorts.get(port)===managedOwner(repository);}catch{return false;}}
function createRegisteredManagedJournal(parent,fields,options){
  const registration=registeredProcessRoots.get(parent);
  if(!registration)throw hostFault('host-process-root-unregistered');
  const repository=inspectSignedDescriptorCustodyRepository(fields.cwd);
  if(registration.roots[0].path!==repository.commonDir)throw hostFault('host-process-repository-drift');
  if(!nativeManagedRegistryPresent(repository)){if(registration.pending)materializeCodexHostProcessRoot({gitCommonDir:registration.roots[0].path,repoFingerprint:registration.repoFingerprint,purpose:registration.purpose});return createHostJournalUnchecked(parent,fields,options);}
  const owner=managedOwner(repository),port=createManagedCodexAuthorityProducerPort({repository}),current=nativeManagedCurrentOwner(repository);
  const handle=Object.freeze({}),operation={handle,directory:null,association:current.association,descriptorHandle:current.descriptorHandle,
    phase:'reserved',sourceFacts:[],requestBinding:structuredClone(fields.binding),requestRepository:structuredClone(repository),requestRepoFingerprint:registration.repoFingerprint,bindingSha256:nativeManagedDigest({repository:{primaryRoot:repository.primaryRoot,commonDir:repository.commonDir},request:fields,operationNonce:randomBytes(32).toString('hex')})};
  operation.producerPort=port;
  managedAuthorityOperations.set(handle,{owner,operation});owner.operations.set(handle,operation);owner.assurance=current.assurance;
  return withSessionAuthorityBoundary({repository},boundary=>{
    const reserved=reserveSessionAuthorityMember({boundary,producerPort:port,association:operation.association,operationHandle:handle});
    operation.memberHandle=reserved.memberHandle;operation.memberRef=reserved.memberRef;
    if(registration.pending)materializeCodexHostProcessRoot({gitCommonDir:registration.roots[0].path,repoFingerprint:registration.repoFingerprint,purpose:registration.purpose});
    const journal=createHostJournalUnchecked(parent,fields,options);operation.directory=journal.directory;operation.intentSha256=journal.intent.sha256;
    writeHostJournal(journal.directory,'authority',{schema:'pipeline.codex-host-authority.v1',intentSha256:journal.intent.sha256,operationSha256:operation.bindingSha256,association:operation.association});
    owner.operations.delete(handle);owner.operations.set(journal.directory,operation);operation.phase='armed';
    const advanced=advanceSessionAuthorityMember({boundary,producerPort:port,memberHandle:operation.memberHandle,expectedMemberRef:operation.memberRef,operationHandle:handle});operation.memberRef=advanced.memberRef;
    return {...journal,authorityOperationHandle:handle};
  });
}
/** Enrollment is a source-owned plan. Materialize only after common-first reservation. */
export function registerCodexHostProcessRoot({gitCommonDir,repoFingerprint,purpose='design-readiness'}={}){
  if(!['linux','win32','darwin'].includes(process.platform)||typeof repoFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(repoFingerprint)
    ||!['design-readiness','advisor'].includes(purpose))throw hostFault('host-process-root-registration-invalid');
  if(process.platform==='darwin')observeNativePlatformProcess(process.pid);
  const common=rootIdentity(gitCommonDir,false),namespace=purpose==='advisor'?'advisor-codex':'design-readiness-codex';
  const path=join(gitCommonDir,'agent-pipeline',namespace,repoFingerprint,'processes');
  const previous=registeredProcessRoots.get(path);
  if(previous){if(previous.purpose!==purpose||previous.repoFingerprint!==repoFingerprint||!previous.roots.every(sameRootIdentity))throw hostFault('host-process-root-changed');return path;}
  registeredProcessRoots.set(path,{purpose,repoFingerprint,roots:[common],pending:true});return path;
}
export function createHostJournal(parent,fields,options={}){return createRegisteredManagedJournal(parent,fields,options);}
export function observeManagedCodexAuthorityRunning({directory,child}){
  const intent=readHostJournal(directory,'intent');if(!intent)throw hostFault('host-process-intent-missing');
  const repository=inspectSignedDescriptorCustodyRepository(intent.value.cwd),owner=managedOwner(repository);
  managedScan(owner);const operation=owner.operations.get(directory);
  if(!operation||!Number.isSafeInteger(child?.pid))throw hostFault('host-process-child-unavailable');
  const execution=readHostJournal(directory,'execution'),launcher=readHostJournal(directory,'launcher');
  if(!execution||!launcher||launcher.value.process.pid!==child.pid||!verificationSameProcess(launcher.value.process,verificationObserveProcess(child.pid))
    ||!verificationSameProcess(execution.value.process,verificationObserveProcess(execution.value.process.pid)))throw hostFault('host-process-authority-running-readback');
  if(operation.memberHandle){const port=operation.producerPort;if(!isOwnedManagedCodexAuthorityProducerPort(port,{repository}))throw nativeManagedFault('managed-authority-original-port-unavailable');withSessionAuthorityBoundary({repository},boundary=>{
    operation.phase='running';const advanced=advanceSessionAuthorityMember({boundary,producerPort:port,memberHandle:operation.memberHandle,expectedMemberRef:operation.memberRef,operationHandle:operation.handle});operation.memberRef=advanced.memberRef;
  });}
  const context=Object.freeze({});managedInvocationContexts.set(context,{owner,operation,child,live:true,controller:intent.value.controller,
    sourceRef:nativeManagedSourceRef(repository,join(directory,'intent.json'),operation.intentEntry.sourceFact)});
  return context;
}
export function isOwnedManagedCodexInvocationContext(handle,{repository}={}){try{inspectManagedCodexInvocationContext({repository,invocationHandle:handle});return true;}catch{return false;}}
export function inspectManagedCodexInvocationContext({repository,invocationHandle}){
  const entry=managedInvocationContexts.get(invocationHandle),owner=managedOwner(repository);
  if(!entry||entry.owner!==owner||!entry.live||!verificationSameProcess(entry.controller,verificationObserveProcess(entry.controller.pid)))throw hostFault('managed-current-context-unavailable');
  const intent=readHostJournal(entry.operation.directory,'intent');
  if(!intent||intent.sha256!==entry.sourceRef.sha256||!verificationSameProcess(intent.value.controller,entry.controller))throw hostFault('managed-current-context-drift');
  if(entry.operation.memberHandle&&entry.operation.descriptorHandle)originParent(owner.repository,invocationHandle);
  const launcher=readHostJournal(entry.operation.directory,'launcher');
  if(!launcher||launcher.value.process.pid!==entry.child.pid||!verificationSameProcess(launcher.value.process,verificationObserveProcess(entry.child.pid)))throw hostFault('managed-current-child-unavailable');
  return Object.freeze({repository:owner.repository,controller:Object.freeze({...entry.controller}),sourceRef:entry.sourceRef,
    invocationBindingSha256:nativeManagedDigest({intentSha256:intent.sha256,controller:entry.controller,bindingSha256:entry.operation.bindingSha256}),
    descriptorHandle:entry.operation.descriptorHandle,producerId:'managed-codex',assurance:owner.assurance==='controlled-unit-method'?'controlled-unit-method':'native-bound'});
}
export function completeManagedCodexAuthority({repository,terminalHandle,invocationHandle}){
  const terminal=inspectManagedCodexAuthorityTerminal({repository,terminalHandle}),owner=managedOwner(repository);managedScan(owner);
  const operation=owner.operations.get(terminal.directory);if(!operation)throw hostFault('managed-terminal-operation-missing');
  const context=managedInvocationContexts.get(invocationHandle);if(!context||context.operation!==operation)throw hostFault('managed-terminal-context-unowned');
  // Actual terminal inspector proves no surviving process. Failure keeps the member held.
  if(!operation.memberHandle){context.live=false;return {status:'legacy-unregistered'};}
  const port=operation.producerPort;if(!isOwnedManagedCodexAuthorityProducerPort(port,{repository}))throw nativeManagedFault('managed-authority-original-port-unavailable');
  const result=withSessionAuthorityBoundary({repository},boundary=>{
    operation.phase='terminal-observed';const advanced=advanceSessionAuthorityMember({boundary,producerPort:port,memberHandle:operation.memberHandle,expectedMemberRef:operation.memberRef,operationHandle:operation.handle});operation.memberRef=advanced.memberRef;
    return releaseSessionAuthorityMember({boundary,producerPort:port,memberHandle:operation.memberHandle,expectedMemberRef:operation.memberRef,terminalHandle});
  });context.live=false;return result;
}

// Managed child origins are issued only from the original owner and the
// requester's actual captured spawn/exchange. Wire observations are selectors.
import {
  inspectSourceOwnedDescriptorHandle,
  inspectSourceOwnedRequesterChildInvocation,
  inspectSourceOwnedRequesterChildOriginExchange,
} from './session-requester-bridge.mjs';
import { inspectSignedDescriptorCustodyInputs } from './worktree-lifecycle.mjs';
import { inspectSourceOwnedContinuityVerificationExchange, inspectSourceOwnedContinuityVerificationParentOriginExchange, inspectSourceOwnedContinuityVerificationChildOriginExchange } from './session-requester-bridge.mjs';
const managedRequesterOrigins = new WeakMap();
const originSchema = 'pipeline.managed-codex-requester-child-origin.v1';
function originEqual(a,b){return canonicalJson(a)===canonicalJson(b);}
function originSameObservation(a,b){
  const fields=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['controllerIdentity','childIdentity'].includes(key)));
  return verificationSameProcess(a.controllerIdentity,b.controllerIdentity)&&verificationSameProcess(a.childIdentity,b.childIdentity)&&originEqual(fields(a),fields(b));
}
function originExact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)
  ||Object.keys(value).sort().join(',')!==keys.slice().sort().join(','))throw hostFault('managed-origin-shape');}
function originRef(value){originExact(value,['path','sha256','size']);
  if(typeof value.path!=='string'||!/^\.git\/agent-pipeline\//.test(value.path)
    ||value.path.includes('\\')||value.path.split('/').some(p=>!p||p==='.'||p==='..')
    ||!/^[a-f0-9]{64}$/.test(value.sha256)||!Number.isSafeInteger(value.size)||value.size<0)throw hostFault('managed-origin-reference');}
// A fixed bounded physical reader avoids invoking full12 reconciliation from
// a fresh requester check. It does not issue a member or an origin capability.
function originReadRecord(repository,path){
  if(process.platform==='win32')return managedWindowsRegistryRecord(repository,path);
  if(typeof path!=='string'||!path.startsWith('agent-pipeline/session-authority/')
    ||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'))throw hostFault('managed-origin-registry-path');
  let cursor=repository.commonDir;
  for(const segment of path.split('/')){cursor=join(cursor,segment);const s=lstatSync(cursor);
    if(s.isSymbolicLink()||realpathSync(cursor)!==cursor)throw hostFault('managed-origin-registry-alias');}
  let fd;
  try{
    const before=lstatSync(cursor,{bigint:true});
    const safe=s=>s.isFile()&&!s.isSymbolicLink()&&s.nlink===1n&&s.uid===BigInt(process.getuid())
      &&(s.mode&0o077n)===0n&&s.size<=524288n;
    const fields=['dev','ino','mode','uid','nlink','size','mtimeNs','ctimeNs'];
    const same=s=>fields.every(k=>s[k]===before[k]);
    if(!safe(before))throw hostFault('managed-origin-registry-unsafe');
    fd=openSync(cursor,constants.O_RDONLY|constants.O_NOFOLLOW);
    if(!safe(fstatSync(fd,{bigint:true}))||!same(fstatSync(fd,{bigint:true})))throw hostFault('managed-origin-registry-drift');
    const buffer=Buffer.alloc(524289);let length=0;
    while(length<buffer.length){const count=readSync(fd,buffer,length,buffer.length-length,length);if(!count)break;length+=count;}
    if(length>524288||BigInt(length)!==before.size||!same(fstatSync(fd,{bigint:true}))||!same(lstatSync(cursor,{bigint:true})))throw hostFault('managed-origin-registry-drift');
    const bytes=buffer.subarray(0,length),value=parseStrictJson(bytes);
    if(requesterCanonical(value)!==bytes.toString('utf8'))throw hostFault('managed-origin-registry-noncanonical');
    return {value,ref:{path:`.git/${path}`,sha256:hostDigest(bytes),size:length}};
  }finally{if(fd!==undefined)closeSync(fd);}
}
function originReadRef(repository,ref){originRef(ref);const row=originReadRecord(repository,ref.path.slice(5));
  if(!originEqual(row.ref,ref))throw hostFault('managed-origin-registry-ref-drift');return row;}
function originMember(repository,bindingSha256,association,expectedRef=null){
  const repositorySha256=nativeManagedDigest({primaryRoot:repository.primaryRoot,commonDir:repository.commonDir});
  const catalogue=originReadRecord(repository,'agent-pipeline/session-authority/catalogue.json');
  originExact(catalogue.value,['schema','repositorySha256','generation','participantSetSha256','participants','producers']);
  if(catalogue.value.schema!=='pipeline.session-authority-catalogue.v1'||catalogue.value.repositorySha256!==repositorySha256
    ||!Array.isArray(catalogue.value.participants)||catalogue.value.participants.length!==12
    ||nativeManagedDigest(catalogue.value.participants)!==catalogue.value.participantSetSha256
    ||!Array.isArray(catalogue.value.producers)||catalogue.value.producers.length!==12)throw hostFault('managed-origin-catalogue');
  const indexes=catalogue.value.producers.filter(p=>p.producerId==='managed-codex');
  if(indexes.length!==1)throw hostFault('managed-origin-producer-index');
  const index=indexes[0];originExact(index,['producerId','producerRef','producerGeneration']);
  if(index.producerRef.path!=='.git/agent-pipeline/session-authority/producers/managed-codex.json')throw hostFault('managed-origin-producer-path');
  const producer=originReadRef(repository,index.producerRef);
  originExact(producer.value,['schema','repositorySha256','producerId','generation','participantSetSha256','sourceSha256','baseline','members','targetCertificates','lastTransitionSha256']);
  if(producer.value.schema!=='pipeline.session-authority-producer.v1'||producer.value.producerId!=='managed-codex'
    ||producer.value.repositorySha256!==repositorySha256||producer.value.generation!==index.producerGeneration
    ||producer.value.participantSetSha256!==catalogue.value.participantSetSha256
    ||!Array.isArray(producer.value.members)||producer.value.members.length>4096)throw hostFault('managed-origin-producer');
  const matches=[];
  for(const row of producer.value.members){originExact(row,['memberId','memberGeneration','memberRef']);
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(row.memberId)||!Number.isSafeInteger(row.memberGeneration)||row.memberGeneration<1
      ||row.memberRef.path!==`.git/agent-pipeline/session-authority/members/managed-codex/${row.memberId}.${row.memberGeneration}.json`)throw hostFault('managed-origin-member-index');
    const member=originReadRef(repository,row.memberRef),m=member.value;
    originExact(m,['schema','repositorySha256','producerId','memberId','memberGeneration','revision','association','kinds','bindingSha256','phase','sourceFacts','createdAt','updatedAt','releaseRef']);
    if(m.schema!=='pipeline.session-authority-member.v1'||m.repositorySha256!==repositorySha256||m.producerId!=='managed-codex'
      ||m.memberId!==row.memberId||m.memberGeneration!==row.memberGeneration)throw hostFault('managed-origin-member');
    if(m.bindingSha256===bindingSha256)matches.push(member);
  }
  if(matches.length!==1)throw hostFault('managed-origin-member-coverage');
  const member=matches[0];
  if(!['armed','running'].includes(member.value.phase)||member.value.releaseRef!==null
    ||!originEqual(member.value.association,association)||!originEqual(member.value.kinds,['dispatch'])
    ||!Array.isArray(member.value.sourceFacts)||!member.value.sourceFacts.length
    ||expectedRef&&!originEqual(member.ref,expectedRef))throw hostFault('managed-origin-member-binding');
  if(!originEqual(originReadRecord(repository,'agent-pipeline/session-authority/catalogue.json').ref,catalogue.ref)
    ||!originEqual(originReadRef(repository,index.producerRef).ref,producer.ref))throw hostFault('managed-origin-index-drift');
  return member;
}
function originTask(repository,intent,expected=null,repoFingerprint=null){
  const binding=intent.value.binding;
  originExact(binding,['repoFingerprint','dispatchId','candidateCommit','requestSha256']);
  if(!/^[a-f0-9]{64}$/.test(binding.repoFingerprint)||!/^[a-f0-9]{64}$/.test(binding.requestSha256)
    ||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(binding.dispatchId)
    ||binding.candidateCommit!==repository.candidate.commit||intent.value.cwd!==repository.primaryRoot
    ||expected&&!originEqual(binding,expected)||repoFingerprint&&binding.repoFingerprint!==repoFingerprint)throw hostFault('managed-origin-task-binding');
}
function originJournal(repository,sourceRef,controllerIdentity,bindingSha256,association,expectedRef=null){
  originRef(sourceRef);
  if(!/^\.git\/agent-pipeline\/(design-readiness-codex|advisor-codex)\/[a-f0-9]{64}\/processes\/codex-host-drh_[a-f0-9]{32}\/intent\.json$/.test(sourceRef.path))throw hostFault('managed-origin-intent-path');
  const directory=dirname(join(repository.commonDir,sourceRef.path.slice(5)));
  const intent=readHostJournal(directory,'intent'),authority=readHostJournal(directory,'authority');
  if(!intent||intent.sha256!==sourceRef.sha256||Buffer.byteLength(canonicalJson(intent.value))!==sourceRef.size
    ||intent.value.schema!=='pipeline.codex-host-process-intent.v1'||!verificationSameProcess(controllerIdentity,intent.value.controller)
    ||!verificationSameProcess(controllerIdentity,verificationObserveProcess(controllerIdentity.pid)))throw hostFault('managed-origin-intent-binding');
  originTask(repository,intent,null,sourceRef.path.split('/')[3]);
  if(!authority)throw hostFault('managed-origin-authority-missing');
  originExact(authority.value,['schema','association','intentSha256','operationSha256']);
  if(authority.value.schema!=='pipeline.codex-host-authority.v1'||authority.value.intentSha256!==intent.sha256
    ||authority.value.operationSha256!==bindingSha256||!originEqual(authority.value.association,association))throw hostFault('managed-origin-authority-binding');
  nativeManagedAssociation(association);if(association.state!=='bound')throw hostFault('managed-origin-unbound');
  const launcher=readHostJournal(directory,'launcher'),execution=readHostJournal(directory,'execution');
  if(!launcher||!execution||launcher.value.intentSha256!==intent.sha256||launcher.value.runId!==intent.value.runId
    ||execution.value.runId!==intent.value.runId||execution.value.launcherSha256!==launcher.sha256
    ||!verificationSameProcess(launcher.value.process,verificationObserveProcess(launcher.value.process.pid))
    ||!verificationSameProcess(execution.value.process,verificationObserveProcess(execution.value.process.pid))
    ||readManagedCodexTerminalJournal({directory}).status==='closed')throw hostFault('managed-origin-process-lifetime');
  const member=originMember(repository,bindingSha256,association,expectedRef);
  const scans=readNativeManagedInventory(repository,'managed-codex');
  const entries=scans.flatMap(s=>s.entries).filter(e=>dirname(e.path)===directory);
  const facts=entries.map(e=>e.sourceFact).sort((a,b)=>a.pathSha256.localeCompare(b.pathSha256));
  if(!originEqual(facts,member.value.sourceFacts))throw hostFault('managed-origin-member-source-drift');
  const custody=inspectSignedDescriptorCustodyInputs(repository.primaryRoot,association.target.sessionId);
  if(!custody.activePresent||!originEqual(custody.repository,repository)
    ||custody.descriptor.sha256!==association.target.descriptorSha256
    ||hostDigest(custody.ownerNonce)!==association.target.ownerNonceSha256)throw hostFault('managed-origin-descriptor-drift');
  return {intent,member,custody,directory};
}
function originParent(repository,invocationHandle){
  const entry=managedInvocationContexts.get(invocationHandle),owner=managedOwner(repository);
  if(!entry||entry.owner!==owner||!entry.live||!entry.operation.memberHandle||!entry.operation.descriptorHandle
    ||!entry.operation.requestBinding||!entry.operation.requestRepository)throw hostFault('managed-origin-private-owner-required');
  if(!originEqual(entry.operation.requestRepository,repository))throw hostFault('managed-origin-owner-repository');
  const proof=originJournal(repository,entry.sourceRef,entry.controller,entry.operation.bindingSha256,entry.operation.association,entry.operation.memberRef);
  originTask(repository,proof.intent,entry.operation.requestBinding,entry.operation.requestRepoFingerprint);
  const descriptor=inspectSourceOwnedDescriptorHandle({repository,descriptorHandle:entry.operation.descriptorHandle});
  if(!originEqual(descriptor,entry.operation.association.target)||!verificationSameProcess(proof.intent.value.controller,entry.controller)
    ||!verificationSameProcess(readHostJournal(proof.directory,'launcher').value.process,verificationObserveProcess(entry.child.pid)))throw hostFault('managed-origin-private-owner-drift');
  return {entry,proof};
}
function originCapture(repository,capture){
  if(!originEqual(capture.repository,repository)||!verificationSameProcess(capture.controllerIdentity,verificationObserveProcess(capture.controllerIdentity.pid))
    ||!verificationSameProcess(capture.childIdentity,verificationObserveProcess(capture.childIdentity.pid))
    ||capture.childIdentity.parentPid!==capture.controllerIdentity.pid)throw hostFault('managed-origin-child-incarnation');
  originRef(capture.childSourceRef);originRef(capture.requesterBindingRef);
  originExact(capture.currentRequester,['sessionId','descriptorSha256','ownerNonceSha256','transportRef','assurance']);
  if(!originEqual(capture.currentRequester.transportRef,capture.requesterBindingRef)
    ||!['physical-readback','controlled-unit-method'].includes(capture.currentRequester.assurance)
    ||!originEqual(capture.descriptor,{sessionId:capture.currentRequester.sessionId,descriptorSha256:capture.currentRequester.descriptorSha256,ownerNonceSha256:capture.currentRequester.ownerNonceSha256}))throw hostFault('managed-origin-original-requester');
}
function originObservation(repository,capture,proof,controllerIdentity,bindingSha256){
  originCapture(repository,capture);
  if(!originEqual(capture.descriptor,proof.member.value.association.target)
    ||!verificationSameProcess(controllerIdentity,capture.controllerIdentity))throw hostFault('managed-origin-requester-owner-join');
  return Object.freeze({schema:originSchema,repositorySha256:nativeManagedDigest({primaryRoot:repository.primaryRoot,commonDir:repository.commonDir}),sourceRef:Object.freeze({...proof.sourceRef}),
    invocationBindingSha256:nativeManagedDigest({intentSha256:proof.intent.sha256,controller:controllerIdentity,bindingSha256}),
    controllerIdentity:Object.freeze({...controllerIdentity}),operationBindingSha256:bindingSha256,association:structuredClone(proof.member.value.association),
    memberRefSha256:nativeManagedDigest(proof.member.ref),requesterBindingSha256:nativeManagedDigest(capture.currentRequester),
    childSourceRef:Object.freeze({...capture.childSourceRef}),childInvocationBindingSha256:capture.childInvocationBindingSha256,
    childIdentity:Object.freeze({...capture.childIdentity}),assurance:capture.currentRequester.assurance==='controlled-unit-method'?'controlled-unit-method':'physical-readback'});
}
export function createManagedCodexRequesterChildOrigin(input){
  originExact(input,['repository','invocationHandle','childInvocationHandle','runtimePort']);
  const repository=nativeManagedRepository(input.repository),{entry,proof}=originParent(repository,input.invocationHandle);
  const capture=inspectSourceOwnedRequesterChildInvocation({repository,childInvocationHandle:input.childInvocationHandle,runtimePort:input.runtimePort});
  const observation=originObservation(repository,capture,{...proof,sourceRef:entry.sourceRef},entry.controller,entry.operation.bindingSha256);
  const handle=Object.freeze({});managedRequesterOrigins.set(handle,{kind:'parent',repository,invocationHandle:input.invocationHandle,
    childInvocationHandle:input.childInvocationHandle,runtimePort:input.runtimePort,observation,consumed:false});return handle;
}
export function observeManagedCodexRequesterChildOrigin(input){
  originExact(input,['repository','originHandle','exchangeHandle']);const repository=nativeManagedRepository(input.repository),data=managedRequesterOrigins.get(input.originHandle);
  if(!data||data.kind!=='parent'||data.consumed||!originEqual(data.repository,repository))throw hostFault('managed-origin-parent-unowned');
  const exchange=inspectSourceOwnedRequesterChildOriginExchange({repository,exchangeHandle:input.exchangeHandle});
  if(exchange.phase!=='parent-challenge'||exchange.originObservation!==null)throw hostFault('managed-origin-parent-exchange');
  const observation=inspectManagedCodexRequesterChildOrigin({repository,originHandle:input.originHandle});
  if(nativeManagedDigest(exchange.currentRequester)!==observation.requesterBindingSha256
    ||!originEqual(exchange.childSourceRef,observation.childSourceRef)||exchange.childInvocationBindingSha256!==observation.childInvocationBindingSha256
    ||!verificationSameProcess(exchange.childIdentity,observation.childIdentity)||!verificationSameProcess(exchange.controllerIdentity,observation.controllerIdentity))throw hostFault('managed-origin-challenge-child');
  data.consumed=true;return observation;
}
export function readManagedCodexRequesterTransportOrigin(input){
  originExact(input,['repository','sourceRef','invocationBindingSha256','controllerIdentity','exchangeHandle']);const repository=nativeManagedRepository(input.repository);
  const exchange=inspectSourceOwnedRequesterChildOriginExchange({repository,exchangeHandle:input.exchangeHandle});
  if(exchange.phase!=='child-completed')throw hostFault('managed-origin-child-exchange');
  const o=exchange.originObservation;
  originExact(o,['schema','repositorySha256','sourceRef','invocationBindingSha256','controllerIdentity','operationBindingSha256','association','memberRefSha256','requesterBindingSha256','childSourceRef','childInvocationBindingSha256','childIdentity','assurance']);
  if(o.schema!==originSchema||o.repositorySha256!==nativeManagedDigest({primaryRoot:repository.primaryRoot,commonDir:repository.commonDir})||!originEqual(o.sourceRef,input.sourceRef)
    ||o.invocationBindingSha256!==input.invocationBindingSha256||!originEqual(o.controllerIdentity,input.controllerIdentity))throw hostFault('managed-origin-child-selectors');
  const proof=originJournal(repository,o.sourceRef,o.controllerIdentity,o.operationBindingSha256,o.association);
  const observation=originObservation(repository,exchange,{...proof,sourceRef:o.sourceRef},o.controllerIdentity,o.operationBindingSha256);
  if(!originSameObservation(observation,o))throw hostFault('managed-origin-child-proof-drift');
  const handle=Object.freeze({});managedRequesterOrigins.set(handle,{kind:'child',repository,capture:structuredClone(exchange),observation});return handle;
}
export function inspectManagedCodexRequesterChildOrigin(input){
  originExact(input,['repository','originHandle']);const repository=nativeManagedRepository(input.repository),data=managedRequesterOrigins.get(input.originHandle);
  if(!data||!originEqual(data.repository,repository))throw hostFault('managed-origin-unowned');
  let capture,proof,sourceRef,controller,binding;
  if(data.kind==='parent'){
    const owner=originParent(repository,data.invocationHandle);proof=owner.proof;sourceRef=owner.entry.sourceRef;controller=owner.entry.controller;binding=owner.entry.operation.bindingSha256;
    capture=inspectSourceOwnedRequesterChildInvocation({repository,childInvocationHandle:data.childInvocationHandle,runtimePort:data.runtimePort});
  }else{
    const o=data.observation;capture=data.capture;sourceRef=o.sourceRef;controller=o.controllerIdentity;binding=o.operationBindingSha256;
    proof=originJournal(repository,sourceRef,controller,binding,o.association);
    // The exchange brand was consumed once; lifetime reads rely on its sealed
    // original physical refs and current processes/descriptor, not a wire flag.
    const file=readAuthorityOriginPrivate(repository,capture.childSourceRef),parent=readAuthorityOriginPrivate(repository,capture.requesterBindingRef);
    if(file.sha256!==capture.childSourceRef.sha256||parent.sha256!==capture.requesterBindingRef.sha256)throw hostFault('managed-origin-capture-drift');
  }
  const observed=originObservation(repository,capture,{...proof,sourceRef},controller,binding);
  if(!originSameObservation(observed,data.observation))throw hostFault('managed-origin-lifetime-drift');return observed;
}
function readAuthorityOriginPrivate(repository,ref){
  if(process.platform==='win32'){const row=verificationWindowsRecord(repository,ref);return {sha256:row.ref.sha256};}
  originRef(ref);const path=join(repository.commonDir,ref.path.slice(5));let cursor=repository.commonDir;
  for(const segment of ref.path.slice(5).split('/')){cursor=join(cursor,segment);if(lstatSync(cursor).isSymbolicLink()||realpathSync(cursor)!==cursor)throw hostFault('managed-origin-private-alias');}
  let fd;try{const before=lstatSync(path,{bigint:true});if(!before.isFile()||before.nlink!==1n||(before.mode&0o077n)!==0n
    ||before.uid!==BigInt(process.getuid())||before.size>524288n)throw hostFault('managed-origin-private-unsafe');
    fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);const fields=['dev','ino','mode','uid','nlink','size','mtimeNs','ctimeNs'];
    const same=s=>fields.every(k=>s[k]===before[k]);if(!same(fstatSync(fd,{bigint:true})))throw hostFault('managed-origin-private-drift');
    const buffer=Buffer.alloc(524289);let length=0;while(length<buffer.length){const n=readSync(fd,buffer,length,buffer.length-length,length);if(!n)break;length+=n;}
    if(BigInt(length)!==before.size||length>524288||!same(fstatSync(fd,{bigint:true}))||!same(lstatSync(path,{bigint:true})))throw hostFault('managed-origin-private-drift');
    const sha256=hostDigest(buffer.subarray(0,length));if(sha256!==ref.sha256||length!==ref.size)throw hostFault('managed-origin-private-ref');return {sha256};
  }finally{if(fd!==undefined)closeSync(fd);}
}


// Inert additive Source fragment; legacy managed Power origin logic is untouched.
const verificationOrigins=new WeakMap();
function verificationOriginFault(){throw Object.assign(new Error('owned verification origin unavailable'),{name:'SessionAuthorityError',code:'OSV-OWNER-UNAVAILABLE'});}
function verificationPrivateRecord(repository,ref){
  if(process.platform==='win32')return verificationWindowsRecord(repository,ref);
  readAuthorityOriginPrivate(repository,ref);
  const path=join(repository.commonDir,ref.path.slice(5)),before=lstatSync(path);
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.uid!==process.getuid()
    ||(before.mode&0o077)!==0||before.size!==ref.size||before.size>524288||realpathSync(path)!==path)verificationOriginFault();
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  let bytes;const same=s=>['dev','ino','mode','uid','gid','nlink','size','mtimeMs','ctimeMs'].every(k=>s[k]===before[k]);
  try{if(!same(fstatSync(fd)))verificationOriginFault();bytes=Buffer.alloc(before.size);let at=0;
    while(at<bytes.length){const n=readSync(fd,bytes,at,bytes.length-at,at);if(n===0)verificationOriginFault();at+=n;}
    if(readSync(fd,Buffer.alloc(1),0,1,at)!==0||!same(fstatSync(fd))||!same(lstatSync(path))
      ||realpathSync(path)!==path||bytes.length!==ref.size||hostDigest(bytes)!==ref.sha256)verificationOriginFault();
  }finally{closeSync(fd);}
  return {ref:structuredClone(ref),value:parseStrictJson(bytes)};
}
function verificationOriginFloor(binding){
  const repository=nativeManagedRepository(binding.repository),floor=binding.requesterFloor;
  originExact(floor,['repository','currentRequester','bindingRef','transportRef','bindingTransportSha256',
    'sourceRef','invocationBindingSha256','controllerIdentity','program']);
  if(!originEqual(floor.repository,repository)||!originEqual(floor.currentRequester,binding.requester)
    ||floor.currentRequester.assurance==='controlled-unit-method')verificationOriginFault();
  const original=verificationPrivateRecord(repository,floor.bindingRef).value;
  originExact(original,['schema','repositorySha256','sessionId','descriptorSha256','ownerNonceSha256',
    'invocationBindingSha256','producerId','generation','transportSha256','controllerIdentity','sourceRef']);
  const target={sessionId:original.sessionId,descriptorSha256:original.descriptorSha256,ownerNonceSha256:original.ownerNonceSha256};
  if(original.schema!=='pipeline.session-requester-binding.v1'||!['managed-codex','approved-owning-controller'].includes(original.producerId)
    ||original.repositorySha256!==nativeManagedDigest({primaryRoot:repository.primaryRoot,commonDir:repository.commonDir})
    ||original.transportSha256!==floor.bindingTransportSha256
    ||!originEqual(target,{sessionId:binding.requester.sessionId,descriptorSha256:binding.requester.descriptorSha256,ownerNonceSha256:binding.requester.ownerNonceSha256})
    ||!originEqual(binding.member.association,{state:'bound',target}))verificationOriginFault();
  if(original.producerId==='approved-owning-controller')verificationApprovedControllerFloor(repository,floor,original,binding);
  else{
  // The original, sanctioned managed task journal/member remains mandatory.
  // A new capture or an OSV label never broadens the old namespace allowlist.
  originRef(original.sourceRef);
  const directory=dirname(join(repository.commonDir,original.sourceRef.path.slice(5))),authority=verificationReadTask(directory,'authority'),intent=verificationReadTask(directory,'intent');
  if(!authority||!intent)verificationOriginFault();
  const proof=process.platform==='win32'?verificationWindowsTaskProof(repository,original.sourceRef,intent.value.controller,authority.value.operationSha256,authority.value.association):originJournal(repository,original.sourceRef,intent.value.controller,authority.value.operationSha256,authority.value.association);
  if(!originEqual(proof.member.value.association,{state:'bound',target})
    ||nativeManagedDigest({pid:intent.value.controller.pid,startIdentitySha256:verificationStartDigest(intent.value.controller)})
      !==nativeManagedDigest(original.controllerIdentity))verificationOriginFault();
  if(floor.transportRef!==null){
    const transport=verificationPrivateRecord(repository,floor.transportRef).value;
    if(transport.schema!=='pipeline.session-requester-transport.v1'||!originEqual(transport.bindingRef,floor.bindingRef)
      ||transport.transportSha256!==floor.bindingTransportSha256
      ||transport.childInvocationBindingSha256!==floor.invocationBindingSha256)verificationOriginFault();
    const captured=verificationPrivateRecord(repository,floor.sourceRef).value;
    if(captured.schema!=='pipeline.managed-requester-child-invocation.v1'
      ||captured.parentInvocationSha256!==original.invocationBindingSha256
      ||!verificationSameProcess(captured.process,floor.controllerIdentity)
      ||nativeManagedDigest(captured)!==floor.invocationBindingSha256)verificationOriginFault();
  }else if(!originEqual(floor.sourceRef,original.sourceRef)||floor.invocationBindingSha256!==original.invocationBindingSha256
    ||!verificationSameProcess(intent.value.controller,floor.controllerIdentity))verificationOriginFault();
  }
  // Independently reopen the actual continuity producer/member/index. These
  // are physical corroboration of the parent-private I03 join, never a handle.
  const catalogue=verificationReadRef(repository,binding.member.catalogueRef),producer=verificationReadRef(repository,binding.member.producerRef),member=verificationReadRef(repository,binding.member.memberRef);
  const index=catalogue.value.producers?.filter(row=>row.producerId==='onboarding-continuity');
  if(original.producerId==='approved-owning-controller'&&(!Array.isArray(catalogue.value.participants)||catalogue.value.participants.length!==12
    ||!Array.isArray(catalogue.value.producers)||catalogue.value.producers.length!==12
    ||nativeManagedDigest(catalogue.value.participants)!==catalogue.value.participantSetSha256))verificationOriginFault();
  if(catalogue.value.schema!=='pipeline.session-authority-catalogue.v1'||index?.length!==1
    ||!originEqual(index[0].producerRef,binding.member.producerRef)||index[0].producerGeneration!==producer.value.generation
    ||producer.value.producerId!=='onboarding-continuity'||!producer.value.members?.some(row=>originEqual(row.memberRef,binding.member.memberRef))
    ||member.value.schema!=='pipeline.session-authority-member.v1'||member.value.producerId!=='onboarding-continuity'
    ||member.value.bindingSha256!==binding.member.bindingSha256||member.value.memberId!==binding.member.memberId
    ||member.value.memberGeneration!==binding.member.memberGeneration||!['armed','running'].includes(member.value.phase)
    ||member.value.releaseRef!==null||!originEqual(member.value.association,binding.member.association)
    ||!originEqual(member.value.kinds,binding.member.kinds))verificationOriginFault();
  if(!originEqual(verificationReadRef(repository,binding.member.catalogueRef).ref,catalogue.ref)
    ||!originEqual(verificationReadRef(repository,binding.member.producerRef).ref,producer.ref)
    ||!originEqual(verificationReadRef(repository,binding.member.memberRef).ref,member.ref))verificationOriginFault();
  return {repository,floor,memberRef:member.ref,original};
}
function verificationOriginObservation(data){
  const {binding,capture,bindingSha256,capabilitySha256,challengeSha256}=data;
  const proof=verificationOriginFloor(binding);
  if(nativeManagedDigest(binding)!==bindingSha256||capabilitySha256!==proof.floor.bindingTransportSha256
    ||!/^[a-f0-9]{64}$/.test(challengeSha256)
    ||!verificationSameProcess(capture.controllerIdentity,proof.floor.controllerIdentity)
    ||!verificationSameProcess(capture.controllerIdentity,verificationObserveProcess(capture.controllerIdentity.pid))
    ||!verificationSameProcess(capture.childIdentity,verificationObserveProcess(capture.childIdentity.pid))
    ||capture.childIdentity.parentPid!==capture.controllerIdentity.pid)verificationOriginFault();
  const captured=verificationPrivateRecord(proof.repository,capture.childSourceRef).value;
  if(captured.schema!=='pipeline.owned-continuity-verification.child.v1'||captured.kind!==capture.kind
    ||captured.bindingSha256!==bindingSha256||!verificationSameProcess(captured.process,capture.childIdentity)
    ||!verificationSameProcess(captured.controllerIdentity,capture.controllerIdentity)
    ||nativeManagedDigest(captured)!==capture.childInvocationBindingSha256
    ||!originEqual(captured.parentRequesterBindingRef,proof.floor.bindingRef))verificationOriginFault();
  return Object.freeze({schema:'pipeline.owned-continuity-verification.origin.v1',bindingSha256,
    requesterBindingSha256:nativeManagedDigest(proof.floor.bindingRef),memberRefSha256:nativeManagedDigest(proof.memberRef),
    kind:capture.kind,controllerIdentity:structuredClone(capture.controllerIdentity),childIdentity:structuredClone(capture.childIdentity),
    childSourceRef:structuredClone(capture.childSourceRef),childInvocationBindingSha256:capture.childInvocationBindingSha256,
    challengeSha256,capabilitySha256});
}
export function createSourceOwnedContinuityVerificationOrigin({exchangeHandle}){
  const exchange=inspectSourceOwnedContinuityVerificationExchange({exchangeHandle});
  if(!['guard-challenge','executor-challenge'].includes(exchange.phase))verificationOriginFault();
  const data=inspectSourceOwnedContinuityVerificationParentOriginExchange({exchangeHandle});
  const observation=verificationOriginObservation(data),handle=Object.freeze({});
  verificationOrigins.set(handle,{kind:'parent',exchangeHandle,data,observation,consumed:false});return handle;
}
export function observeSourceOwnedContinuityVerificationOrigin({originHandle,exchangeHandle}){
  const data=verificationOrigins.get(originHandle);
  if(!data||data.kind!=='parent'||data.exchangeHandle!==exchangeHandle||data.consumed)verificationOriginFault();
  const observed=inspectSourceOwnedContinuityVerificationOrigin({originHandle});data.consumed=true;return observed;
}
export function readSourceOwnedContinuityVerificationOrigin({exchangeHandle}){
  const data=inspectSourceOwnedContinuityVerificationChildOriginExchange({exchangeHandle}),observation=verificationOriginObservation(data),handle=Object.freeze({});
  verificationOrigins.set(handle,{kind:'child',exchangeHandle,data,observation,consumed:true});return handle;
}
export function inspectSourceOwnedContinuityVerificationOrigin({originHandle}){
  const data=verificationOrigins.get(originHandle);if(!data)verificationOriginFault();
  const fresh=data.kind==='parent'?inspectSourceOwnedContinuityVerificationParentOriginExchange({exchangeHandle:data.exchangeHandle})
    :inspectSourceOwnedContinuityVerificationChildOriginExchange({exchangeHandle:data.exchangeHandle});
  const observation=verificationOriginObservation(fresh);
  if(!originEqual(observation,data.observation))verificationOriginFault();return observation;
}

// OSV Windows read-only corroboration. Legacy Power process writers are unchanged.
function verificationObserveProcess(pid){if(process.platform!=='win32')return observeNativePlatformProcess(pid);const result=observeNativeWindowsProcess({pid});if(result.status!=='present')verificationOriginFault();return result.process;}
function verificationSameProcess(a,b){return process.platform==='win32'?a?.platform==='win32'&&b?.platform==='win32'&&sameNativeWindowsProcess({...a,cwd:null},{...b,cwd:null}):sameProcess(a,b);}
function verificationStartDigest(p){return nativeManagedDigest(p.platform==='win32'?{start:p.start,bootIdentity:p.bootIdentity}:{start:p.start,bootSha256:p.bootSha256});}
function verificationWindowsRecord(repository,ref){
  originRef(ref);const path=join(repository.commonDir,ref.path.slice(5));
  const native=verificationWindowsRead(path,524288,repository);
  if(native.bytes.length!==ref.size||hostDigest(native.bytes)!==ref.sha256)verificationOriginFault();
  return {ref:structuredClone(ref),value:parseStrictJson(native.bytes),nativeFactsSha256:native.nativeFactsSha256};
}
function verificationReadRef(repository,ref){return process.platform==='win32'?verificationWindowsRecord(repository,ref):originReadRef(repository,ref);}
function verificationReadTask(directory,name){
  if(process.platform!=='win32')return readHostJournal(directory,name);
  if(!names.has(name))verificationOriginFault();
  try{inspectWindowsOwnedAuthorityPath({path:directory,directory:true});const native=verificationWindowsRead(join(directory,name+'.json'),524288);
    return {value:parseStrictJson(native.bytes),sha256:hostDigest(native.bytes),nativeFactsSha256:native.nativeFactsSha256};
  }catch(error){if(error?.code==='ENOENT')return null;throw error;}
}
function verificationWindowsTaskProof(repository,sourceRef,controller,bindingSha256,association){
  originRef(sourceRef);
  if(!/^\.git\/agent-pipeline\/(design-readiness-codex|advisor-codex)\/[a-f0-9]{64}\/processes\/codex-host-drh_[a-f0-9]{32}\/intent\.json$/.test(sourceRef.path))verificationOriginFault();
  const directory=dirname(join(repository.commonDir,sourceRef.path.slice(5))),intent=verificationReadTask(directory,'intent'),authority=verificationReadTask(directory,'authority');
  if(!intent||!authority||intent.sha256!==sourceRef.sha256||Buffer.byteLength(canonicalJson(intent.value))!==sourceRef.size
    ||intent.value.schema!=='pipeline.codex-host-process-intent.v1'||!verificationSameProcess(controller,intent.value.controller)
    ||!verificationSameProcess(controller,verificationObserveProcess(controller.pid)))verificationOriginFault();
  originTask(repository,intent,null,sourceRef.path.split('/')[3]);
  originExact(authority.value,['schema','association','intentSha256','operationSha256']);
  if(authority.value.schema!=='pipeline.codex-host-authority.v1'||authority.value.intentSha256!==intent.sha256
    ||authority.value.operationSha256!==bindingSha256||!originEqual(authority.value.association,association)||association.state!=='bound')verificationOriginFault();
  nativeManagedAssociation(association);
  const launcher=verificationReadTask(directory,'launcher'),execution=verificationReadTask(directory,'execution');
  if(!launcher||!execution||launcher.value.intentSha256!==intent.sha256||launcher.value.runId!==intent.value.runId
    ||execution.value.runId!==intent.value.runId||execution.value.launcherSha256!==launcher.sha256
    ||!verificationSameProcess(launcher.value.process,verificationObserveProcess(launcher.value.process.pid))
    ||!verificationSameProcess(execution.value.process,verificationObserveProcess(execution.value.process.pid)))verificationOriginFault();
  const catalogue=verificationWindowsRecord(repository,{path:'.git/agent-pipeline/session-authority/catalogue.json',...verificationWindowsCatalogueRef(repository)});
  const repositorySha256=nativeManagedDigest({primaryRoot:repository.primaryRoot,commonDir:repository.commonDir});
  originExact(catalogue.value,['schema','repositorySha256','generation','participantSetSha256','participants','producers']);
  if(catalogue.value.schema!=='pipeline.session-authority-catalogue.v1'||catalogue.value.repositorySha256!==repositorySha256
    ||!Array.isArray(catalogue.value.participants)||catalogue.value.participants.length!==12
    ||nativeManagedDigest(catalogue.value.participants)!==catalogue.value.participantSetSha256
    ||!Array.isArray(catalogue.value.producers)||catalogue.value.producers.length!==12)verificationOriginFault();
  const index=catalogue.value.producers.filter(row=>row.producerId==='managed-codex');if(index.length!==1)verificationOriginFault();
  originExact(index[0],['producerId','producerRef','producerGeneration']);
  if(index[0].producerRef.path!=='.git/agent-pipeline/session-authority/producers/managed-codex.json')verificationOriginFault();
  const producer=verificationWindowsRecord(repository,index[0].producerRef);
  originExact(producer.value,['schema','repositorySha256','producerId','generation','participantSetSha256','sourceSha256','baseline','members','targetCertificates','lastTransitionSha256']);
  if(producer.value.schema!=='pipeline.session-authority-producer.v1'||producer.value.producerId!=='managed-codex'
    ||producer.value.repositorySha256!==repositorySha256||producer.value.participantSetSha256!==catalogue.value.participantSetSha256
    ||producer.value.generation!==index[0].producerGeneration||!Array.isArray(producer.value.members)||producer.value.members.length>4096)verificationOriginFault();
  const matches=producer.value.members.map(row=>{
    originExact(row,['memberId','memberGeneration','memberRef']);
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(row.memberId)||!Number.isSafeInteger(row.memberGeneration)||row.memberGeneration<1
      ||row.memberRef.path!==`.git/agent-pipeline/session-authority/members/managed-codex/${row.memberId}.${row.memberGeneration}.json`)verificationOriginFault();
    const member=verificationWindowsRecord(repository,row.memberRef),m=member.value;
    originExact(m,['schema','repositorySha256','producerId','memberId','memberGeneration','revision','association','kinds','bindingSha256','phase','sourceFacts','createdAt','updatedAt','releaseRef']);
    if(m.schema!=='pipeline.session-authority-member.v1'||m.repositorySha256!==repositorySha256||m.producerId!=='managed-codex'
      ||m.memberId!==row.memberId||m.memberGeneration!==row.memberGeneration)verificationOriginFault();return member;
  }).filter(row=>row.value.bindingSha256===bindingSha256);
  if(matches.length!==1)verificationOriginFault();const member=matches[0];
  if(!['armed','running'].includes(member.value.phase)||member.value.releaseRef!==null
    ||!originEqual(member.value.association,association)||!originEqual(member.value.kinds,['dispatch'])
    ||!Array.isArray(member.value.sourceFacts)||member.value.sourceFacts.length===0)verificationOriginFault();
  // Preserve the old closed-terminal refusal. Missing terminal is not a success;
  // it is only the expected active managed task state, corroborated below.
  const terminalPath=join(directory,'terminal.json');
  try{lstatSync(terminalPath);const terminal=verificationReadTask(directory,'terminal');
    if(!terminal||terminal.value.status==='closed')verificationOriginFault();
  }catch(error){if(error?.code!=='ENOENT')throw error;}
  const inventories=readNativeManagedInventory(repository,'managed-codex'),facts=inventories.flatMap(scan=>scan.entries).filter(entry=>dirname(entry.path)===directory).map(entry=>entry.sourceFact).sort((a,b)=>a.pathSha256.localeCompare(b.pathSha256));
  if(!originEqual(facts,member.value.sourceFacts))verificationOriginFault();
  const custody=inspectSignedDescriptorCustodyInputs(repository.primaryRoot,association.target.sessionId);
  if(!custody.activePresent||!originEqual(custody.repository,repository)||custody.descriptor.sha256!==association.target.descriptorSha256
    ||hostDigest(custody.ownerNonce)!==association.target.ownerNonceSha256)verificationOriginFault();
  for(const [name,row] of [['intent',intent],['authority',authority],['launcher',launcher],['execution',execution]])if(!originEqual(verificationReadTask(directory,name),row))verificationOriginFault();
  for(const saved of [catalogue,producer,member]){const fresh=verificationWindowsRecord(repository,saved.ref);
    if(!originEqual(fresh,saved))verificationOriginFault();}
  return {intent,member,custody,directory};
}
function verificationWindowsCatalogueRef(repository){
  const native=verificationWindowsRead(join(repository.commonDir,'agent-pipeline','session-authority','catalogue.json'),524288,repository);
  return {sha256:hostDigest(native.bytes),size:native.bytes.length};
}
// Directories strictly above the repository root are human-controlled (PO decision 2026-10-17): observed and hashed into the
// facts, never refused. Only a caller that carries its repository gets that boundary, and only for a path lexically inside
// repository.primaryRoot; every other caller and path keeps every strict check.
function verificationWindowsBoundary(path,repository){
  const root=repository?.primaryRoot;if(typeof root!=='string'||typeof path!=='string')return null;
  const base=root.replace(/\\+$/u,'');
  return path.length>base.length&&path.toLowerCase().startsWith(base.toLowerCase()+'\\')?root:null;
}
function verificationWindowsRead(path,maxBytes,repository=null){
  const boundaryRoot=verificationWindowsBoundary(path,repository);
  const ancestry=()=>{const rows=[];let cursor=dirname(path);while(true){const facts=observeWindowsAuthorityAncestor(boundaryRoot?{path:cursor,boundaryRoot}:{path:cursor});rows.push({path:cursor,nativeFacts:facts.nativeFacts,nativeFactsSha256:facts.nativeFactsSha256,helperSha256:facts.helperSha256});const parent=dirname(cursor);if(parent===cursor)break;cursor=parent;}return rows;};
  const before=ancestry(),result=readWindowsOwnedAuthorityFile({path,maxBytes});if(!originEqual(before,ancestry()))verificationOriginFault();return result;
}

function managedWindowsRegistryRecord(repository,path){
  if(typeof path!=='string'||!path.startsWith('agent-pipeline/session-authority/')||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'))throw hostFault('managed-origin-registry-path');
  const bytes=verificationWindowsRead(join(repository.commonDir,path),524288,repository).bytes,value=parseStrictJson(bytes);
  if(canonicalJson(value)!==bytes.toString('utf8'))throw hostFault('managed-origin-registry-noncanonical');
  return {value,ref:{path:'.git/'+path,sha256:hostDigest(bytes),size:bytes.length}};
}

// Corroborate the distinct Source-created initial Controller observation.
// JSON alone never issues a requester; the authenticated original exchange and
// genuine continuity member below remain mandatory on both sides of FD4.
function verificationApprovedControllerFloor(repository,floor,original,binding){
  if(floor.transportRef!==null||!originEqual(floor.sourceRef,original.sourceRef)
    ||floor.invocationBindingSha256!==original.invocationBindingSha256)verificationOriginFault();
  const source=verificationPrivateRecord(repository,original.sourceRef).value;
  originExact(source,['schema','repositorySha256','process','program','taskSourceRef','suiteId','course','approvalRefs','initialStateRef','assurance','eventId']);
  if(source.schema!=='pipeline.approved-owning-controller-invocation.v1'||source.assurance!=='physical-readback'
    ||source.repositorySha256!==original.repositorySha256||nativeManagedDigest(source)!==original.invocationBindingSha256
    ||!verificationSameProcess(source.process,floor.controllerIdentity)
    ||!verificationSameProcess(source.process,verificationObserveProcess(source.process.pid))
    ||nativeManagedDigest({pid:source.process.pid,startIdentitySha256:verificationStartDigest(source.process)})!==nativeManagedDigest(original.controllerIdentity)
    ||source.course?.featureId!==binding.course.featureId||!/^[a-f0-9]{64}$/.test(source.course?.approvalSha256)
    ||!/^[a-f0-9]{32}$/.test(source.eventId)||!Array.isArray(source.approvalRefs)||source.approvalRefs.length<2)verificationOriginFault();
  const program=Object.fromEntries(Object.entries(floor.program).filter(([key])=>key!=='nativePrivateRefs'));
  if(!originEqual(source.program,program)||program.cwd!==repository.primaryRoot)verificationOriginFault();
  const module=fileURLToPath(new URL('../scripts/owning-verification-controller.mjs',import.meta.url));
  if(program.module.path!==module||program.argv.length<8)verificationOriginFault();
  const selectors=program.argv.slice(-6);
  if(selectors[0]!=='--root'||selectors[1]!==repository.primaryRoot||selectors[2]!=='--suite'||selectors[3]!==source.suiteId
    ||selectors[4]!=='--task-source'||selectors[5]!==source.taskSourceRef.path)verificationOriginFault();
  if(source.suiteId!==binding.selectedSuite.id)verificationOriginFault();
}
