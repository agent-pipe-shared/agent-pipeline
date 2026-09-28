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

// Separately declared current Advisor runtime evidence; five normative sources stay unchanged.
import {readCurrentReadinessAdvisorObservation} from './codex-readiness-finalization.mjs';
import {createAdvisoryRouteSelection} from './advisory-route-selection.mjs';
import {buildCodexToolFreeReadinessRequest,verifyCodexToolFreeBindingFromSources} from './codex-tool-free-design-readiness.mjs';
function currentAdvisorObservationFixture(f){
 const receipt={schema:'pipeline.advisory-receipt.v1',receiptId:'current-advisor',dispatch:{dispatchId:'current-advisor',queueRevision:0,candidateCommit:f.candidate.commit,candidateTree:f.candidate.tree},duty:'advisory',profile:'feature',configuredRoute:{runner:'codex',selector:{kind:'model-id',value:'fixture-model'},effort:'high'},adapter:'consult',observed:{status:'unavailable',identity:null},questionSha256:f.sources.design.sha256,answerSha256:null,fallback:{reason:'consult-unavailable',redactedErrorClass:'unavailable'},emittedAtMs:1000};
 const receiptBytes=Buffer.from(canonicalJson(receipt)),route=createAdvisoryRouteSelection({receipt,receiptBytes,code:'ordinary-consult-host-callback-unavailable'}),routeBytes=Buffer.from(canonicalJson(route));
 writeFileSync(join(f.root,'advisor.receipt.json'),receiptBytes);writeFileSync(join(f.root,'advisor.route.json'),routeBytes);
 const refs={receiptRef:{path:'advisor.receipt.json',sha256:hostDigest(receiptBytes)},routeRef:{path:'advisor.route.json',sha256:hostDigest(routeBytes)}};
 return {receipt,route,refs,observation:readCurrentReadinessAdvisorObservation({repoRoot:f.root,candidate:f.candidate,sources:f.sources,...refs})};
}
test('readiness supplemental Advisor metadata binds real current receipt, route, design question and bounded physical bytes',t=>{
 const f=readinessFixture(t),a=currentAdvisorObservationFixture(f);
 assert.equal(a.observation.receipt.observed.status,'unavailable');assert.equal(a.observation.route.childStarted,false);assert.equal(a.observation.route.attemptCount,0);
 const content=Object.fromEntries(Object.entries(f.sources).map(([n,s])=>[n,{...s,content:readFileSync(join(f.root,s.path),'utf8')}]));
 const plain=buildCodexToolFreeReadinessRequest({dispatchId:'review',candidate:f.candidate,sources:f.sources,route:f.route,sourceContent:content});
 const supplied=buildCodexToolFreeReadinessRequest({dispatchId:'review',candidate:f.candidate,sources:f.sources,route:f.route,sourceContent:content,advisorObservation:a.observation});
 assert.notEqual(plain.requestSha256,supplied.requestSha256);assert.ok(supplied.prompt.includes('SUPPLEMENTAL_UNTRUSTED_ADVISOR_OBSERVATION_JSON'));assert.equal(Object.keys(supplied.outputSchema.properties.sources.properties).length,5);assert.deepEqual(supplied.outputSchema,plain.outputSchema);
 assert.throws(()=>readCurrentReadinessAdvisorObservation({repoRoot:f.root,candidate:{...f.candidate,commit:'0'.repeat(40)},sources:f.sources,...a.refs}));
 assert.throws(()=>readCurrentReadinessAdvisorObservation({repoRoot:f.root,candidate:f.candidate,sources:{...f.sources,design:{...f.sources.design,sha256:'0'.repeat(64)}},...a.refs}));
 assert.throws(()=>readCurrentReadinessAdvisorObservation({repoRoot:f.root,candidate:f.candidate,sources:f.sources,...a.refs,routeRef:{...a.refs.routeRef,sha256:'0'.repeat(64)}}));
});
test('readiness supplemental Advisor physical aliases, oversized and duplicate-key observations refuse',t=>{
 const f=readinessFixture(t),a=currentAdvisorObservationFixture(f),path=join(f.root,a.refs.receiptRef.path),original=readFileSync(path);
 linkSync(path,join(f.root,'receipt-alias'));assert.throws(()=>readCurrentReadinessAdvisorObservation({repoRoot:f.root,candidate:f.candidate,sources:f.sources,...a.refs}));unlinkSync(join(f.root,'receipt-alias'));
 writeFileSync(path,Buffer.alloc(65537,32));assert.throws(()=>readCurrentReadinessAdvisorObservation({repoRoot:f.root,candidate:f.candidate,sources:f.sources,...a.refs}));
 writeFileSync(path,'{"schema":"a","schema":"b"}');assert.throws(()=>readCurrentReadinessAdvisorObservation({repoRoot:f.root,candidate:f.candidate,sources:f.sources,...a.refs}));writeFileSync(path,original);
});
test('readiness supplemental Advisor actual managed request and fresh default verifier bind declared runtime context',async t=>{
 const f=readinessFixture(t),a=currentAdvisorObservationFixture(f),script=join(f.input,'app-server');let child=readFileSync(script,'utf8');
 child=child.replace('const p=m.params.outputSchema.properties, lit=value=>value.enum[0];',`const p=m.params.outputSchema.properties, lit=value=>value.enum[0];
const marker='SUPPLEMENTAL_UNTRUSTED_ADVISOR_OBSERVATION_JSON\\n';const raw=m.params.input[0].text.split(marker)[1];
if(!raw)process.exit(23);const supplied=JSON.parse(raw.slice(raw.indexOf('{')));if(supplied.receipt.observed.status!=='unavailable'||supplied.route.childStarted!==false)process.exit(24);`);
 writeFileSync(script,child);
 const result=await runCodexToolFreeDesignReadiness({...f.args,advisorObservationRefs:a.refs});assert.equal(result.status,'reviewed',JSON.stringify(result));
 const sourceBytes=Object.fromEntries(Object.entries(f.sources).map(([n,s])=>[n,{path:s.path,bytes:readFileSync(join(f.root,s.path))}]));
 const args={repoRoot:f.root,hostExecution:result.report.hostExecution,readinessReceipt:result.report,candidate:f.candidate,sources:f.sources,sourceBytes,advisorObservationRefs:a.refs,resolveRoute:()=>({state:'default',runner:'codex',...f.route}),resolveCodexExecutable:()=>process.execPath};
 assert.equal(verifyDesignReadinessHostExecution(args).ok,true);
 assert.equal(verifyDesignReadinessHostExecution({...args,advisorObservationRefs:null}).ok,false,'fresh verifier cannot silently omit context bound into actual request');
 assert.equal(verifyCodexToolFreeBindingFromSources({repoRoot:f.root,hostExecution:result.report.hostExecution,report:result.report,candidate:f.candidate,sources:f.sources,sourceBytes,route:f.route,store:f.store,repoFingerprint:f.repoFingerprint,advisorObservationRefs:a.refs}).ok,true);
 assert.equal(Object.keys(result.report.sources).length,5);assert.equal(Object.hasOwn(result.report,'advisorObservation'),false);assert.equal(a.receipt.observed.identity,null);
 writeFileSync(join(f.root,'advisor.route.json'),readFileSync(join(f.root,'advisor.route.json'),'utf8')+' ');assert.equal(verifyDesignReadinessHostExecution(args).ok,false);
});
test('readiness supplemental Advisor drift after actual turn refuses publication and private readiness record',async t=>{
 const f=readinessFixture(t),a=currentAdvisorObservationFixture(f),script=join(f.input,'app-server');let child=readFileSync(script,'utf8');
 child=child.replace("send({method:'turn/completed'",`require('node:fs').appendFileSync(${JSON.stringify(join(f.root,'advisor.receipt.json'))},' ');send({method:'turn/completed'`);
 writeFileSync(script,child);const result=await runCodexToolFreeDesignReadiness({...f.args,advisorObservationRefs:a.refs});assert.equal(result.status,'unavailable');assert.equal(result.report,null);
});
