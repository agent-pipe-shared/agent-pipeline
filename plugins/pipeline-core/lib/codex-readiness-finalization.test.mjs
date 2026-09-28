// SPDX-License-Identifier: SUL-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFileSync, readFileSync, unlinkSync, chmodSync, linkSync} from 'node:fs';
import {join} from 'node:path';
import {readinessFixture} from './codex-readiness-finalization.fixture.mjs';
import {runCodexToolFreeDesignReadiness} from './codex-tool-free-design-readiness.mjs';
import {createCodexDesignReadinessHostStore} from './codex-design-readiness-host-store.mjs';
import {spawnManagedCodexHost} from './codex-host-process-supervisor.mjs';
import {validateCodexReadinessHostRecord} from './codex-readiness-host-record.mjs';
import {canonicalJson} from './codex-sandbox-compatibility.mjs';
import {hostDigest} from './codex-host-process-journal.mjs';
import {readFinalizedReadinessObservation} from './codex-readiness-finalization.mjs';
import {verifyDesignReadinessHostExecution} from './design-readiness-host-evidence.mjs';

async function success(t) {
 const f=readinessFixture(t),result=await runCodexToolFreeDesignReadiness(f.args);
 assert.equal(result.status,'reviewed',JSON.stringify(result));
 const saved=f.store.read(result.receiptId,result.expected);assert.ok(saved);
 return {...f,result,saved,journal:join(f.store.processRoot,'codex-host-'+result.receiptId)};
}
test('unknown-at-launch child output binds original frame, canonical report and genuine closed pipes across fresh physical reader',async t=>{
 const f=await success(t),record=f.saved.value;
 assert.match(f.result.report.summary,/Unknown-at-launch synthetic result [a-f0-9-]{36}$/);
 const actual=readFinalizedReadinessObservation(f.journal,f.result.expected);
 assert.ok(actual);assert.equal(actual.sha256,record.finalizationSha256);
 assert.equal(record.responseSha256,record.outputCustody.reportCanonicalSha256);
 assert.equal(record.dutyReceiptSha256,record.responseSha256);
 assert.notEqual(record.outputCustody.reportRawJsonSha256,record.outputCustody.finalMessageFrameSha256);
 assert.equal(record.outputCustody.stdin.closed,true);assert.equal(record.outputCustody.stdout.closed,true);
 assert.equal(record.outputCustody.stderr.closed,true);
 const fresh=createCodexDesignReadinessHostStore({gitCommonDir:join(f.root,'.git'),repoFingerprint:f.repoFingerprint,trustedExecutablePath:process.execPath});
 assert.equal(fresh.read(f.result.receiptId,f.result.expected).sha256,f.saved.sha256);
 const privateBytes=readFileSync(join(f.journal,'readiness-finalization.json'),'utf8');
 assert.equal(privateBytes.includes(f.result.report.summary),false);
 assert.equal(privateBytes.includes('Synthetic prd document'),false);
 assert.equal(privateBytes.includes('sourceContent'),false);
});
test('genuinely owned empty Node process cannot authorize a complete-looking caller report record',async t=>{
 const f=await success(t),receiptId='drh_'+randomBytes(16).toString('hex'),script=join(f.input,'empty.mjs');
 writeFileSync(script,"process.stdin.resume();process.stdin.on('end',()=>process.exit(0));");
 const managed=await spawnManagedCodexHost({journalParent:f.store.processRoot,executablePath:process.execPath,args:[script],cwd:f.input,receiptId,
  binding:{repoFingerprint:f.repoFingerprint,dispatchId:f.saved.value.dispatchId,candidateCommit:f.candidate.commit,requestSha256:f.saved.value.requestSha256}});
 t.after(async()=>{try{await managed.stop();}catch{}});
 managed.child.stdout.resume();managed.child.stderr.resume();managed.child.stdin.end();
 const closed=await managed.finish();assert.equal(closed.clean,true);
 const record=structuredClone(f.saved.value);record.receiptId=receiptId;record.ownership=closed.ownership;
 const expected=structuredClone(f.result.expected);expected.ownership=closed.ownership;
 assert.equal(validateCodexReadinessHostRecord(record,expected),true,'closed shape plus real ownership is insufficient');
 assert.equal(readFinalizedReadinessObservation(managed.directory,expected),null);
 assert.throws(()=>f.store.write(record,expected),{code:'CRHS-RECORD-OR-OWNERSHIP-INVALID'});
});
test('caller-coordinated digest, pipe, session, controls and private-pointer mutations are refused',async t=>{
 const f=await success(t),receiptPath=join(f.store.processRoot,'..','receipts',f.result.receiptId+'.json');unlinkSync(receiptPath);
 const mutations=[r=>r.finalizationSha256='f'.repeat(64),r=>r.outputCustody.stdout.closed=false,
  r=>r.outputCustody.stdout.bytes=8388609,r=>r.outputCustody.stdout.framingComplete=false,
  r=>r.outputCustody.reportRawJsonSha256='e'.repeat(64),r=>r.outputCustody.finalMessageFrameSha256='e'.repeat(64),
  r=>r.session.threadId='different-thread',r=>r.session.freshThreadStarted=false,r=>r.controls.serverRequests=1,
  r=>r.responseSha256=r.dutyReceiptSha256=r.outputCustody.reportCanonicalSha256='b'.repeat(64)];
 for(const mutate of mutations){const record=structuredClone(f.saved.value),expected=structuredClone(f.result.expected);mutate(record);
  expected.responseSha256=record.responseSha256;expected.dutyReceiptSha256=record.dutyReceiptSha256;
  assert.throws(()=>f.store.write(record,expected),{code:'CRHS-RECORD-OR-OWNERSHIP-INVALID'});
 }
 f.store.write(f.saved.value,f.result.expected);
 const wrong=createCodexDesignReadinessHostStore({gitCommonDir:join(f.root,'.git'),repoFingerprint:f.repoFingerprint,trustedExecutablePath:join(f.input,'app-server')});
 assert.equal(wrong.read(f.result.receiptId,f.result.expected),null);
});
test('private finalization mode, alias and coordinated-content drift invalidate existing receipt',async t=>{
 const f=await success(t),path=join(f.journal,'readiness-finalization.json');
 chmodSync(path,0o644);assert.equal(f.store.read(f.result.receiptId,f.result.expected),null);
 chmodSync(path,0o600);assert.ok(f.store.read(f.result.receiptId,f.result.expected));
 linkSync(path,join(f.root,'metadata-alias'));assert.equal(f.store.read(f.result.receiptId,f.result.expected),null);unlinkSync(join(f.root,'metadata-alias'));
 const metadata=JSON.parse(readFileSync(path));metadata.session.threadId='changed-private-thread';writeFileSync(path,canonicalJson(metadata));
 assert.equal(f.store.read(f.result.receiptId,f.result.expected),null);
});
test('public package verifier independently resolves trusted executable before fresh private store acceptance',async t=>{
 const f=await success(t),sourceBytes=Object.fromEntries(Object.entries(f.sources).map(([name,s])=>[name,{path:s.path,bytes:readFileSync(join(f.root,s.path))}]));
 const args={repoRoot:f.root,hostExecution:f.result.report.hostExecution,readinessReceipt:f.result.report,
  candidate:f.candidate,sources:f.sources,sourceBytes,
  resolveRoute:()=>({state:'default',runner:'codex',...f.route}),resolveCodexExecutable:name=>{assert.equal(name,'codex');return process.execPath;}};
 assert.equal(verifyDesignReadinessHostExecution(args).ok,true,'default store factory receives independently observed test binary');
 assert.equal(verifyDesignReadinessHostExecution({...args,resolveCodexExecutable:()=>null}).ok,false);
 assert.equal(verifyDesignReadinessHostExecution({...args,resolveCodexExecutable:()=>join(f.input,'app-server')}).ok,false);
 let resolved=0;
 const result=verifyDesignReadinessHostExecution({...args,resolveCodexExecutable:name=>{resolved++;return process.execPath;},
  codexHostStoreFactory:options=>{assert.equal(options.trustedExecutablePath,process.execPath);return createCodexDesignReadinessHostStore(options);}});
 assert.equal(result.ok,true);assert.equal(resolved,1);
});
