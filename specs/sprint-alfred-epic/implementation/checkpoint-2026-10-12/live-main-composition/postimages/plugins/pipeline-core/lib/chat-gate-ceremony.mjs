// SPDX-License-Identifier: SUL-1.0
/**
 * Shared chat-mode gate-kind primitive (AGY-CHATADAPTER-1).
 *
 * The confirmed defect this closes
 * (backlog/items/2026-08-25-chat-mode-push-approval-has-no-enforced-human-turn-boundary.md):
 * `pipeline-state.mjs`'s old `approve-push` chat-mode ceremony round-tripped
 * a challenge code entirely through agent-visible stdout/stdin -- nothing
 * stopped the SAME automated actor from reading the code its own first call
 * printed and immediately submitting it back via a second call, with no
 * live human ever involved.
 *
 * The property that actually closes this is the one `po-human-approval.mjs`'s
 * `defaultReadConfirmation()` already relies on for `signature` mode: a
 * `readSync(0, ...)` against file descriptor 0 reads whatever is attached to
 * THIS process's own stdin. An agent's own tool-calling harness invokes a
 * command with a non-interactive stdin (closed, /dev/null, or a plain pipe)
 * -- `process.stdin.isTTY` is falsy there, never `true` -- while a human
 * running the same command directly in their own terminal has a real TTY on
 * fd 0. Checking `isAttendedTerminal()` BEFORE any read is the actual
 * boundary: a pipe carrying the exact right bytes is NOT sufficient on its
 * own (`readSync` would happily read a pipe too), so the TTY check must
 * gate entry, not merely follow a successful read.
 *
 * This module is deliberately narrow: it is the confirming-step primitive
 * only. What is bound to a confirmation (a push's commit/remote/destination,
 * a kickoff `--language` value, ...) stays the caller's own business -- see
 * `pipeline-state.mjs`'s `approve-push` case and
 * `project-onboarding-v3.mjs`'s kickoff-language gate for the two callers
 * this ships with.
 */
import { readSync } from "node:fs";

export const CHAT_GATE_NOT_ATTENDED = "CHAT-GATE-NOT-ATTENDED";
export const CHAT_GATE_CONFIRMATION_MISMATCH = "CHAT-GATE-CONFIRMATION-MISMATCH";
export const CHAT_ATTRIBUTION_UNATTESTED = "chat-attributed-unattested";

/**
 * Describe the deliberately weak global-chat route without pretending that it is
 * a terminal, host, or cryptographic attestation.  The caller still owns the
 * subject binding (commit/ref, tool input, window scope, ...); this stable marker
 * makes the weaker basis visible in every persisted record.
 */
export function chatAttributionRecord({ kind, by = null } = {}) {
  if (typeof kind !== "string" || kind.trim() === "") throw new TypeError("chat attribution kind is required");
  if (by !== null && (typeof by !== "string" || by.trim() === "")) throw new TypeError("chat attribution by must be non-blank or null");
  return {
    mode: CHAT_ATTRIBUTION_UNATTESTED,
    kind,
    ...(by === null ? {} : { by }),
  };
}

/**
 * True only when fd 0 is a real terminal device. Never throws -- any
 * failure to determine TTY-ness is treated as "not attended", the fail-
 * closed direction for a security gate.
 *
 * `dependencies.isattyFn` is the injectable seam a test uses to simulate an
 * attended terminal without allocating a real one.
 */
export function isAttendedTerminal(dependencies = {}) {
  const isatty = dependencies.isattyFn ?? (() => process.stdin.isTTY === true);
  try {
    return isatty() === true;
  } catch {
    return false;
  }
}

/**
 * Turns the raw bytes a human typed into the string they typed.
 *
 * UTF-8 first, because that is what a POSIX terminal and a UTF-8 Windows
 * console both send. But a Windows console running a legacy Western code
 * page (cp1252/cp850, still the default in many PowerShell and cmd.exe
 * windows) sends `é` as the single byte 0xE9, which is not valid UTF-8:
 * decoding it as UTF-8 yields U+FFFD, and the comparison against the value
 * the gate just PRINTED correctly can then never succeed. Measured live
 * 2026-08-28 on Windows, `pipeline-state.mjs po-authority-acknowledge-apply
 * --by "André"`: the prompt displayed the name correctly, and no way of
 * typing it was accepted -- a PO whose name carries an umlaut or accent was
 * locked out of every chat-mode gate on that platform
 * (backlog/items/2026-08-28-a-chat-gate-is-unusable-with-a-non-ascii-name-
 * on-windows.md).
 *
 * So: strict UTF-8, and only when the bytes are NOT valid UTF-8 -- a
 * deterministic property of the bytes themselves, not a guess or a
 * second-chance retry -- they are read as latin1, the correct reading of
 * that console's high bytes for every accented LETTER (cp1252 and latin1
 * agree across 0xC0-0xFF; they differ only in the 0x80-0x9F punctuation
 * range, which no name needs and which stays a mismatch).
 *
 * This widens no security boundary. The gate's proof of a live human is
 * `isAttendedTerminal()` -- a real TTY on fd 0 -- and the typed value is a
 * confirmation, never a secret. Reading the same keystrokes under the
 * encoding the terminal actually used admits no input a human did not type.
 */
export function decodeTypedLine(bytes) {
  const raw = Buffer.from(bytes);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    text = raw.toString("latin1");
  }
  return text.replace(/\r$/u, "").trim();
}

/**
 * Reads one line of plain-text input from the real controlling terminal
 * (fd 0). Mirrors `po-human-approval.mjs`'s own `defaultReadConfirmation()`
 * byte for byte -- same blocking `readSync(0, ...)` loop, same EAGAIN/EOF
 * handling, and the same shared `decodeTypedLine()` above (imported there,
 * not copied, so the two can no longer drift) -- so this primitive inherits
 * a property already proven safe there rather than defining a second,
 * divergent one.
 *
 * Callers MUST check `isAttendedTerminal()` first; this function does not
 * re-check it, so calling it against a non-TTY fd 0 would read whatever is
 * piped in (or block) instead of refusing cleanly -- exactly the property
 * `requireAttendedChatGateConfirmation` below exists to prevent a caller
 * from getting wrong.
 */
export function readAttendedLine(prompt, dependencies = {}) {
  const write = dependencies.writeFn ?? ((text) => process.stdout.write(text));
  write(prompt);
  const readByte = dependencies.readSyncFn ?? ((buffer) => readSync(0, buffer, 0, 1, null));
  const buffer = Buffer.alloc(1);
  const bytes = [];
  for (;;) {
    let read;
    try {
      read = readByte(buffer);
    } catch (error) {
      if (error?.code === "EAGAIN") continue;
      if (error?.code === "EOF") break;
      throw error;
    }
    if (read === 0 || buffer[0] === 10) break;
    bytes.push(buffer[0]);
  }
  return decodeTypedLine(bytes);
}

/**
 * The one reusable chat-mode confirming step. `expected` is the value the
 * human must type back (a challenge code, a fixed word, ...); `summaryLines`
 * describe what is being approved so the human reads it before confirming
 * (ADR-0061 Decision 4). Returns `{ ok: true }` or `{ ok: false, code }` --
 * never throws, so every caller (push, kickoff language, ...) gets the
 * identical two-valued contract and the identical failure codes.
 */
export function requireAttendedChatGateConfirmation({ summaryLines = [], expected, dependencies = {} }) {
  if (!isAttendedTerminal(dependencies)) return { ok: false, code: CHAT_GATE_NOT_ATTENDED };
  const prompt = [...summaryLines, "Type the confirmation value shown to you to proceed: "].join("\n");
  const read = dependencies.readLineFn ?? ((text) => readAttendedLine(text, dependencies));
  const answer = read(prompt);
  if (answer !== expected) return { ok: false, code: CHAT_GATE_CONFIRMATION_MISMATCH };
  return { ok: true };
}

// Declaration-only imports: the two owners exchange opaque handles, not callbacks.
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { canonical } from "./po-approval-proof.mjs";
import { inspectSignedDescriptorCustodyRepository } from "./worktree-lifecycle.mjs";
import { ensureHardenedPrivateDirectory } from "./hardened-private-directory.mjs";
import { assertPrivateRegularFile, writePrivateFileNoReplaceAtomic } from "./private-boundary.mjs";
import { parseStrictJson } from "./governance-event.mjs";
import { readSourceOwnedAuthorityContext, createSignedCleanupRequesterObserver } from "./session-requester-bridge.mjs";
import * as ceremonyRegistry from "./session-authority-registry.mjs";
import * as poCeremonyOwner from "../scripts/po-human-approval.mjs";

const ceremonyPorts = new WeakMap(), ceremonyOperations = new WeakMap(), ceremonyTerminals = new WeakMap();
const ceremonyPortCache = new Map(), ceremonyContext = new AsyncLocalStorage();
const CEREMONY_SCHEMA = "pipeline.registered-chat-gate-lifetime.v1";
const CEREMONY_NAMESPACE = "registered-ceremony-lifetimes";
const ceremonyHash = bytes => createHash("sha256").update(bytes).digest("hex");
const ceremonyDigest = value => ceremonyHash(canonical(value));
const ceremonyEqual = (a,b) => canonical(a) === canonical(b);
const ceremonyKeys = (v,keys) => v && typeof v === "object" && !Array.isArray(v)
  && ceremonyEqual(Object.keys(v).sort(),[...keys].sort());
const ceremonyFail = reason => {const error=new Error(reason);error.name="SessionAuthorityError";error.code="SDC-AUTHORITY-UNAVAILABLE";throw error;};
const ceremonyFreeze = v => {if(v && typeof v === "object"){for(const item of Object.values(v))ceremonyFreeze(item);Object.freeze(v);}return v;};
function ceremonyRepository(input) {
  if(!ceremonyKeys(input,["primaryRoot","commonDir","candidate"]))ceremonyFail("chat:repository-shape");
  const actual=inspectSignedDescriptorCustodyRepository(input.primaryRoot);
  if(!ceremonyEqual(actual,input))ceremonyFail("chat:repository-changed");
  return actual;
}
const ceremonyDirectory = repo => join(repo.commonDir,"agent-pipeline","chat-gate-ceremonies");
function ceremonyPhysical(repo,path) {
  const local=relative(repo.commonDir,path);
  if(isAbsolute(local)||local.startsWith(".."))ceremonyFail("chat:outside-common");
  let cursor=repo.commonDir;
  for(const segment of local.split(/[\\/]/u)){cursor=join(cursor,segment);if(lstatSync(cursor).isSymbolicLink())ceremonyFail("chat:symlink");}
  const before=assertPrivateRegularFile(path);
  if(before.size<1||before.size>1048576||(typeof process.getuid==="function"&&before.uid!==process.getuid()))ceremonyFail("chat:record-bound");
  const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  const identity=s=>[s.dev,s.ino,s.mode,s.nlink,s.size,s.mtimeMs,s.ctimeMs];
  try{
    if(!ceremonyEqual(identity(before),identity(fstatSync(fd))))ceremonyFail("chat:open-cas");
    const bytes=readFileSync(fd),after=assertPrivateRegularFile(path);
    if(bytes.length!==before.size||!ceremonyEqual(identity(before),identity(after))||!ceremonyEqual(identity(before),identity(fstatSync(fd))))ceremonyFail("chat:read-cas");
    const fact={namespaceId:CEREMONY_NAMESPACE,pathSha256:ceremonyHash(local.replace(/\\/gu,"/")),sha256:ceremonyHash(bytes),size:bytes.length,
      identity:{dev:String(after.dev),ino:String(after.ino),mode:after.mode,nlink:after.nlink},semanticSha256:ceremonyHash(bytes)};
    return {bytes,fact,ref:{path:`.git/${local.replace(/\\/gu,"/")}`,sha256:fact.sha256,size:fact.size}};
  }finally{closeSync(fd);}
}
function ceremonyRecord(repo,path) {
  const physical=ceremonyPhysical(repo,path),record=parseStrictJson(physical.bytes);
  if(!ceremonyKeys(record,["schema","id","repositorySha256","association","entry","inputSha256","bindingSha256","phase","terminal"])
    ||record.schema!==CEREMONY_SCHEMA||!/^[a-f0-9]{32}$/u.test(record.id)
    ||record.repositorySha256!==ceremonyDigest({primaryRoot:repo.primaryRoot,commonDir:repo.commonDir})
    ||!["attended-confirmation","po-human-approval"].includes(record.entry)
    ||!["reserved","running","terminal-observed"].includes(record.phase)
    ||![record.inputSha256,record.bindingSha256].every(x=>/^[a-f0-9]{64}$/u.test(x))
    ||!ceremonyKeys(record.association,["state","target"]))ceremonyFail("chat:record-shape");
  if(record.association.state==="bound"){
    const t=record.association.target;
    if(!ceremonyKeys(t,["sessionId","descriptorSha256","ownerNonceSha256"])||!/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/u.test(t.sessionId)
      ||![t.descriptorSha256,t.ownerNonceSha256].every(x=>/^[a-f0-9]{64}$/u.test(x)))ceremonyFail("chat:association");
  }else if(record.association.state!=="unbound"||record.association.target!==null)ceremonyFail("chat:association");
  if((record.phase==="terminal-observed")!==["completed","cancelled"].includes(record.terminal))ceremonyFail("chat:terminal-shape");
  if(record.phase!=="terminal-observed"&&record.terminal!==null)ceremonyFail("chat:terminal-shape");
  if(path!==join(ceremonyDirectory(repo),`${record.id}.${record.phase}.json`)
    ||canonical(record)!==physical.bytes.toString("utf8"))ceremonyFail("chat:record-canonical");
  const {bindingSha256,phase,terminal,...bound}=record;
  if(bindingSha256!==ceremonyDigest(bound))ceremonyFail("chat:binding");
  return {...physical,record};
}
function ceremonyInventory(repo) {
  const dir=ceremonyDirectory(repo),records=[],groups=new Map();
  let cursor=repo.commonDir;
  for(const segment of relative(repo.commonDir,dir).split(/[\\/]/u)){
    cursor=join(cursor,segment);let info;try{info=lstatSync(cursor);}catch(error){if(error.code==="ENOENT")break;throw error;}
    if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0||(typeof process.getuid==="function"&&info.uid!==process.getuid()))ceremonyFail("chat:unsafe-namespace-chain");
  }
  // lstat, rather than existsSync, preserves unreadable/broken-path failures.
  let directory;try{directory=lstatSync(dir);}catch(error){if(error.code!=="ENOENT")throw error;return {records,groups,memberships:[{namespaceId:CEREMONY_NAMESPACE,rootSha256:ceremonyDigest({commonDir:repo.commonDir,path:dir}),entrySetSha256:ceremonyDigest([]),entryCount:0,sourceFacts:[]}]};}
  if(!directory.isDirectory()||directory.isSymbolicLink()||(directory.mode&0o077)!==0
    ||(typeof process.getuid==="function"&&directory.uid!==process.getuid()))ceremonyFail("chat:unsafe-namespace");
  const names=readdirSync(dir).sort();if(names.length>4096)ceremonyFail("chat:inventory-bound");
  let total=0;
  for(const name of names){const row=ceremonyRecord(repo,join(dir,name));total+=row.bytes.length;if(total>16777216)ceremonyFail("chat:inventory-bytes");records.push(row);const group=groups.get(row.record.id)??[];group.push(row);groups.set(row.record.id,group);}
  for(const rows of groups.values()){
    const first=rows.find(x=>x.record.phase==="reserved");if(!first)ceremonyFail("chat:missing-reservation");
    for(const row of rows){const {phase,terminal,...a}=row.record,{phase:p,terminal:t,...b}=first.record;if(!ceremonyEqual(a,b))ceremonyFail("chat:history-binding");}
    if(rows.some(x=>x.record.phase==="terminal-observed")&&!rows.some(x=>x.record.phase==="running"))ceremonyFail("chat:missing-running");
  }
  const sourceFacts=records.map(x=>x.fact);
  return {records,groups,memberships:[{namespaceId:CEREMONY_NAMESPACE,rootSha256:ceremonyDigest({commonDir:repo.commonDir,path:dir}),entrySetSha256:ceremonyDigest(sourceFacts),entryCount:sourceFacts.length,sourceFacts}]};
}
function ceremonyObservation(data) {
  const repo=ceremonyRepository(data.repository),inventory=ceremonyInventory(repo),rows=inventory.groups.get(data.id)??[];
  if(!rows.length){if(data.phase!=="reserved")ceremonyFail("chat:lost-lifetime");return {association:data.association,kinds:["ceremony"],phase:"reserved",bindingSha256:data.bindingSha256,sourceFacts:[]};}
  const row=rows.find(x=>x.record.phase==="terminal-observed")??rows.find(x=>x.record.phase==="running")??rows[0];
  if(row.record.bindingSha256!==data.bindingSha256||!ceremonyEqual(row.record.association,data.association))ceremonyFail("chat:operation-binding");
  data.phase=row.record.phase;
  return {association:data.association,kinds:["ceremony"],phase:data.phase,bindingSha256:data.bindingSha256,sourceFacts:rows.map(x=>x.fact)};
}
function ceremonyPublish(data,phase,terminal=null) {
  const repo=ceremonyRepository(data.repository),dir=ceremonyDirectory(repo);
  ensureHardenedPrivateDirectory(repo.commonDir,dir);
  const record={...data.core,bindingSha256:data.bindingSha256,phase,terminal},path=join(dir,`${data.id}.${phase}.json`);
  if(!writePrivateFileNoReplaceAtomic(path,Buffer.from(canonical(record))).created)ceremonyFail("chat:publication-conflict");
  if(!ceremonyEqual(ceremonyRecord(repo,path).record,record))ceremonyFail("chat:publication-readback");
  data.phase=phase;
}
function ceremonyAssociation(repo,requesterHandle) {
  const context=readSourceOwnedAuthorityContext({repository:repo});
  if(context.status==="bound"){
    if(context.requesterHandle!==requesterHandle)ceremonyFail("chat:current-requester-mismatch");
    const observed=createSignedCleanupRequesterObserver({repository:repo,requesterHandle})({repository:repo});
    if(observed.status!=="bound")ceremonyFail("chat:requester-unavailable");
    const {sessionId,descriptorSha256,ownerNonceSha256}=observed.requester;
    return {state:"bound",target:{sessionId,descriptorSha256,ownerNonceSha256}};
  }
  if(requesterHandle!==null)ceremonyFail("chat:unowned-requester");
  // A direct sanctioned ceremony without a current runtime binding is real
  // unbound activity. It blocks every target; it is never native ownership.
  return {state:"unbound",target:null};
}
function ceremonyData(port,handle) {
  const data=ceremonyOperations.get(handle);if(!data||data.port!==port)ceremonyFail("chat:unowned-operation");ceremonyRepository(data.repository);return data;
}
function ceremonyPrepare(port,{requesterHandle=null,entry,input}) {
  const repo=ceremonyPorts.get(port).repository,association=ceremonyAssociation(repo,requesterHandle);
  let ownedInput,inputSha256;
  if(entry==="attended-confirmation"){
    if(!ceremonyKeys(input,["summaryLines","expected"])||typeof input.expected!=="string"||input.expected.length>16384
      ||!Array.isArray(input.summaryLines)||input.summaryLines.length>64||input.summaryLines.some(x=>typeof x!=="string"||x.length>4096))ceremonyFail("chat:confirmation-input");
    ownedInput={summaryLines:[...input.summaryLines],expected:input.expected};inputSha256=ceremonyDigest(ownedInput);
  }else if(entry==="po-human-approval"){
    if(!ceremonyKeys(input,["sourceOperationHandle"])||poCeremonyOwner.isOwnedPoHumanApprovalCeremonyOperation(input.sourceOperationHandle,{repository:repo})!==true)ceremonyFail("chat:po-operation-unowned");
    ownedInput=input;inputSha256=poCeremonyOwner.observePoHumanApprovalCeremonyOperation(input.sourceOperationHandle).inputSha256;
  }else ceremonyFail("chat:unsupported-entry");
  const id=randomBytes(16).toString("hex"),core={schema:CEREMONY_SCHEMA,id,repositorySha256:ceremonyDigest({primaryRoot:repo.primaryRoot,commonDir:repo.commonDir}),association,entry,inputSha256};
  const operationHandle=Object.freeze({}),data={port,repository:repo,id,core,association,entry,input:ownedInput,bindingSha256:ceremonyDigest(core),phase:"reserved",executed:false,executing:false,result:null,terminal:null,memberHandle:null,memberRef:null,operationHandle};
  ceremonyOperations.set(operationHandle,data);ceremonyLiveOperations.add(data);
  return {status:"prepared",operationHandle,inputSha256,preimageRefs:[]};
}
export function createChatGateAuthorityProducerPort({repository:input}) {
  const repo=ceremonyRepository(input),cached=ceremonyPortCache.get(repo.commonDir);
  if(cached&&isOwnedChatGateAuthorityProducerPort(cached,{repository:repo}))return cached;
  let port;
  port=Object.freeze({
    readAssurance(){ceremonyRepository(repo);return "physical-readback";},
    prepareOperation(input){return ceremonyPrepare(port,input);},
    observeOperation(handle){return ceremonyObservation(ceremonyData(port,handle));},
    executeOperation({operationHandle,memberHandle,expectedMemberRef}){
      const data=ceremonyData(port,operationHandle);if(data.executed)ceremonyFail("chat:operation-replay");
      ceremonyRegistry.withSessionAuthorityBoundary({repository:repo},boundary=>{
        ceremonyRegistry.inspectSourceOwnedSessionAuthorityMember({boundary,producerPort:port,memberHandle,operationHandle,expectedMemberRef});
        data.memberHandle=memberHandle;data.memberRef=expectedMemberRef;
        ceremonyPublish(data,"reserved");ceremonyPublish(data,"running");
        data.memberRef=ceremonyRegistry.advanceSessionAuthorityMember({boundary,producerPort:port,memberHandle,expectedMemberRef,operationHandle}).memberRef;
      });
      return ceremonyExecuteBody(data);
    },
    finishOperation({operationHandle,executionHandle,entry,input,expectedMemberRef}){
      const data=ceremonyData(port,operationHandle);
      if(executionHandle!==data.executionHandle||entry!=="prompt-return"||!ceremonyKeys(input,[])||!data.executed||data.executing)ceremonyFail("chat:terminal-unobserved");
      if(data.memberHandle)ceremonyRegistry.withSessionAuthorityBoundary({repository:repo},boundary=>{
        ceremonyRegistry.inspectSourceOwnedSessionAuthorityMember({boundary,producerPort:port,memberHandle:data.memberHandle,operationHandle,expectedMemberRef});
        if(!ceremonyEqual(expectedMemberRef,data.memberRef))ceremonyFail("chat:terminal-member-cas");
      });
      const observed=ceremonyObservation(data);if(observed.phase!=="terminal-observed")ceremonyFail("chat:terminal-readback");
      const terminalHandle=Object.freeze({});ceremonyTerminals.set(terminalHandle,{port,data});return {status:"observed",terminalHandle,sourceRefs:ceremonyInventory(repo).groups.get(data.id).map(x=>x.ref)};
    },
    observeTerminal(handle){const terminal=ceremonyTerminals.get(handle);if(!terminal||terminal.port!==port||terminal.data.executing)ceremonyFail("chat:unowned-terminal");const observed=ceremonyObservation(terminal.data);if(observed.phase!=="terminal-observed")ceremonyFail("chat:terminal-drift");return {terminal:terminal.data.terminal,sourceFacts:observed.sourceFacts};},
    readBaseline(){const inventory=ceremonyInventory(repo),legacyOperations=[];for(const rows of inventory.groups.values()){
      const last=rows.find(x=>x.record.phase==="terminal-observed")??rows.find(x=>x.record.phase==="running")??rows[0];
      if(last.record.phase==="terminal-observed")continue;
      const handle=Object.freeze({});ceremonyOperations.set(handle,{port,repository:repo,id:last.record.id,association:last.record.association,bindingSha256:last.record.bindingSha256,phase:last.record.phase});legacyOperations.push(handle);
    }return {memberships:inventory.memberships,legacyOperations};},
    reconcile({producerRecord,memberRecords,releaseRecords}){
      if(!producerRecord||!Array.isArray(memberRecords)||!Array.isArray(releaseRecords))ceremonyFail("chat:reconcile-shape");
      const inventory=ceremonyInventory(repo);
      for(const member of memberRecords){const rows=inventory.groups.get([...inventory.groups].find(([,values])=>values[0].record.bindingSha256===member.bindingSha256)?.[0]);
        if(!rows){const live=[...ceremonyLiveOperations].find(data=>data.port===port&&data.bindingSha256===member.bindingSha256);if(!live||member.phase!=="reserved"||member.sourceFacts.length!==0||!ceremonyEqual(member.association,live.association)||!ceremonyEqual(member.kinds,["ceremony"]))ceremonyFail("chat:member-without-source");continue;}
        const last=rows.find(x=>x.record.phase==="terminal-observed")??rows.find(x=>x.record.phase==="running")??rows[0];
        if(!ceremonyEqual(member.association,last.record.association)||!ceremonyEqual(member.kinds,["ceremony"])
          ||!(member.phase===last.record.phase||member.phase==="released"&&last.record.phase==="terminal-observed")
          ||!ceremonyEqual(member.sourceFacts,rows.map(x=>x.fact)))ceremonyFail("chat:member-source-drift");
      }
      for(const release of releaseRecords){const rows=[...inventory.groups.values()].find(values=>values[0].record.bindingSha256===release.bindingSha256),last=rows?.find(x=>x.record.phase==="terminal-observed");if(!last||last.record.terminal!==release.terminal||!ceremonyEqual(release.sourceFacts,rows.map(x=>x.fact)))ceremonyFail("chat:release-source-drift");}
      return inventory.memberships;
    },
  });
  ceremonyPorts.set(port,{repository:repo});ceremonyPortCache.set(repo.commonDir,port);return port;
}
export function isOwnedChatGateAuthorityProducerPort(port,{repository:input}={}){
  const data=port&&ceremonyPorts.get(port);if(!data)return false;try{return ceremonyEqual(data.repository,ceremonyRepository(input));}catch{return false;}
}
const ceremonyLiveOperations=new Set();
function ceremonyExecuteBody(data){
  data.executed=true;data.executing=true;ceremonyLiveOperations.add(data);
  let result,error;
  try{result=ceremonyContext.run(data,()=>data.entry==="po-human-approval"
    ?poCeremonyOwner.executeOwnedPoHumanApprovalCeremonyOperation(data.input.sourceOperationHandle)
    :requireAttendedChatGateConfirmation(data.input));}
  catch(caught){error=caught;}
  finally{data.executing=false;}
  data.result=result;data.terminal=error||result?.ok===false?"cancelled":"completed";
  ceremonyRegistry.withSessionAuthorityBoundary({repository:data.repository},boundary=>{
    ceremonyPublish(data,"terminal-observed",data.terminal);
    if(data.memberHandle)data.memberRef=ceremonyRegistry.advanceSessionAuthorityMember({boundary,producerPort:data.port,memberHandle:data.memberHandle,expectedMemberRef:data.memberRef,operationHandle:data.operationHandle}).memberRef;
  });
  data.executionHandle=Object.freeze({});ceremonyLiveOperations.delete(data);
  if(error)throw error;return {status:"executed",executionHandle:data.executionHandle,memberRef:data.memberRef===null?null:Object.freeze({...data.memberRef}),ownerResult:result,sourceRefs:ceremonyInventory(data.repository).groups.get(data.id).map(x=>x.ref)};
}
/** Source-owner adapter: no callable operation argument and no caller terminal verdict. */
function runRegisteredCeremony({repository:input,entry,input:ownerInput}){
  const repo=ceremonyRepository(input),port=createChatGateAuthorityProducerPort({repository:repo});
  const context=readSourceOwnedAuthorityContext({repository:repo}),requesterHandle=context.status==="bound"?context.requesterHandle:null;
  const prepared=port.prepareOperation({requesterHandle,entry,input:ownerInput}),data=ceremonyData(port,prepared.operationHandle);data.operationHandle=prepared.operationHandle;ceremonyLiveOperations.add(data);
  let cataloguePresent=false;
  ceremonyRegistry.withSessionAuthorityBoundary({repository:repo},boundary=>{
    try{lstatSync(join(repo.commonDir,"agent-pipeline","session-authority","catalogue.json"));cataloguePresent=true;}catch(error){if(error.code!=="ENOENT")throw error;}
    if(cataloguePresent){const reserved=ceremonyRegistry.reserveSessionAuthorityMember({boundary,producerPort:port,association:data.association,operationHandle:prepared.operationHandle});data.memberHandle=reserved.memberHandle;data.memberRef=reserved.memberRef;}
    ceremonyPublish(data,"reserved");ceremonyPublish(data,"running");
    if(data.memberHandle)data.memberRef=ceremonyRegistry.advanceSessionAuthorityMember({boundary,producerPort:port,memberHandle:data.memberHandle,expectedMemberRef:data.memberRef,operationHandle:prepared.operationHandle}).memberRef;
  });
  let executed,error;
  try{executed=ceremonyExecuteBody(data);}catch(caught){error=caught;}
  if(data.phase==="terminal-observed")ceremonyRegistry.withSessionAuthorityBoundary({repository:repo},boundary=>{
    if(data.memberHandle){const finished=port.finishOperation({operationHandle:prepared.operationHandle,executionHandle:data.executionHandle,entry:"prompt-return",input:{},expectedMemberRef:data.memberRef});ceremonyRegistry.releaseSessionAuthorityMember({boundary,producerPort:port,memberHandle:data.memberHandle,expectedMemberRef:data.memberRef,terminalHandle:finished.terminalHandle});}
  });
  if(error)throw error;return executed.ownerResult;
}

/** Actual PO owner handle; original signing policy remains in its owning source. */
export function runOwnedPoHumanApprovalCeremony({repository,sourceOperationHandle}){
  return runRegisteredCeremony({repository,entry:"po-human-approval",input:{sourceOperationHandle}});
}
/** Explicit source caller adapter. The production prompt observes its own fd0. */
export function runRegisteredAttendedChatGateConfirmation({repository,summaryLines,expected}){
  return runRegisteredCeremony({repository,entry:"attended-confirmation",input:{summaryLines,expected}});
}
