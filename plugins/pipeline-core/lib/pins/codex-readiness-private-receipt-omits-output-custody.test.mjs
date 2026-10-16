// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.codex-readiness-private-receipt-omits-output-custody (AC-134, acceptance points 1-5).
// The private readiness receipt must carry host-observed output custody (digests and byte lengths of
// captured stdout/stderr, distinct frame/raw/canonical report digests) and fail closed without it.
// Validator-level cases are platform independent; the physical reader cap cases need the Linux-only host store.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {hostDigest} from '../codex-host-process-journal.mjs';
import {canonicalJson} from '../codex-sandbox-compatibility.mjs';
import {readinessFixture} from '../codex-readiness-finalization.fixture.mjs';
import {runCodexToolFreeDesignReadiness} from '../codex-tool-free-design-readiness.mjs';
import {validateReadinessFinalization,validateReadinessOutputCustody,readFinalizedReadinessObservation} from '../codex-readiness-finalization.mjs';

const h=c=>c.repeat(64),CAP=8388608,EMPTY=hostDigest(Buffer.alloc(0));
const stream=(o={})=>({bytes:100,retainedBytes:100,sha256:h('a'),ended:true,closed:true,errored:false,utf8Verified:true,bounded:true,...o});
const custody=()=>({schema:'pipeline.codex-host-output-custody.v1',stdioStatus:'complete',stdin:{finished:true,closed:true,errored:false},
 stdout:{...stream(),frameCount:3,framingComplete:true,parserVerified:true},stderr:stream({bytes:0,retainedBytes:0,sha256:EMPTY}),
 finalMessageFrameSha256:h('1'),reportRawJsonSha256:h('2'),reportRawJsonBytes:40,reportCanonicalSha256:h('3')});
function record(){
 const names=['input','prd','spec','design','traceability'],sources=Object.fromEntries(names.map(n=>[n,{path:n+'.md',sha256:h('4')}])),oc=custody();
 return {schema:'pipeline.codex-readiness-finalization.v1',purpose:'design-readiness',receiptId:'drh_'+'a'.repeat(32),runId:h('5'),intentSha256:h('6'),
  repoFingerprint:h('7'),dispatchId:'pin',candidate:{commit:'b'.repeat(40),tree:'c'.repeat(40)},sources,executableSha256:h('8'),requestSha256:h('9'),
  responseSha256:oc.reportCanonicalSha256,dutyReceiptSha256:oc.reportCanonicalSha256,
  session:{threadId:'t',turnId:'u',freshThreadStarted:true,ephemeralRequested:true,modelObserved:'m',providerObserved:'openai'},
  controls:{configurationVerified:true,profileVerified:true,mcpVerified:true,profileIntentSha256:h('d'),unexpectedToolItems:0,serverRequests:0,
   sourceReadbackSha256:hostDigest(sources),sourceSecondReadbackSha256:hostDigest(sources)},
  terminal:{exitCode:0,signal:null,spawnError:false,turnStatus:'completed',stdioStatus:'complete'},
  inputDisposition:{contract:'readiness',status:'acknowledged',recheck:'not-required',submissionCount:1,requestSha256:h('9'),recipeSha256:null},
  ownership:{intentReceiptSha256:h('e'),boundProcessReceiptSha256:h('f'),terminalReceiptSha256:h('0'),status:'closed'},outputCustody:oc};
}
const rejects=(mutate,label)=>{const r=record();mutate(r);assert.equal(validateReadinessFinalization(r),false,label);};

test('point 1: a complete receipt binds distinct frame/raw/canonical digests and stream digest plus byte length',()=>{
 const r=record();assert.equal(validateReadinessFinalization(r),true);assert.equal(validateReadinessOutputCustody(r.outputCustody),true);
 const c=r.outputCustody;assert.equal(new Set([c.finalMessageFrameSha256,c.reportRawJsonSha256,c.reportCanonicalSha256]).size,3);
 for(const s of [c.stdout,c.stderr]){assert.match(s.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(s.bytes));}
});
test('point 1: a receipt that omits output custody, or any custody member, is refused with a typed false result',()=>{
 rejects(r=>{delete r.outputCustody;},'custody absent');rejects(r=>{r.outputCustody=null;},'custody null');
 for(const k of ['schema','stdioStatus','stdin','stdout','stderr','finalMessageFrameSha256','reportRawJsonSha256','reportRawJsonBytes','reportCanonicalSha256'])
  rejects(r=>{delete r.outputCustody[k];},'missing '+k);
 for(const s of ['stdout','stderr'])for(const k of ['bytes','retainedBytes','sha256','ended','closed','errored','utf8Verified','bounded'])
  rejects(r=>{delete r.outputCustody[s][k];},`missing ${s}.${k}`);
 for(const k of ['frameCount','framingComplete','parserVerified'])rejects(r=>{delete r.outputCustody.stdout[k];},'missing stdout.'+k);
 rejects(r=>{r.outputCustody.extra=1;},'unknown custody member');rejects(r=>{r.outputCustody.stdout.extra=1;},'unknown stream member');
});
test('point 2: custody bindings to response, duty receipt and terminal status cannot be substituted or drift',()=>{
 rejects(r=>{r.responseSha256=h('b');},'response digest differs from canonical report digest');
 rejects(r=>{r.dutyReceiptSha256=h('b');},'duty receipt digest differs from response');
 rejects(r=>{r.responseSha256=r.dutyReceiptSha256=h('b');},'coordinated response/duty without custody canonical digest');
 rejects(r=>{r.outputCustody.reportCanonicalSha256='short';},'malformed canonical digest');
 for(const k of ['finalMessageFrameSha256','reportRawJsonSha256'])rejects(r=>{r.outputCustody[k]='E'.repeat(64);},'malformed '+k);
 rejects(r=>{r.terminal.stdioStatus='incomplete';},'terminal stdio status differs from custody');
 rejects(r=>{r.outputCustody.stdioStatus='incomplete';r.terminal.stdioStatus='incomplete';},'incomplete stdio custody');
});
test('point 3: truncated, failed, unclosed or unverified stdout/stderr never become a valid receipt',()=>{
 for(const s of ['stdout','stderr']){
  for(const [k,v] of [['ended',false],['closed',false],['errored',true],['utf8Verified',false],['bounded',false],['sha256','z'.repeat(64)],['retainedBytes',1],['bytes',-1],['bytes',1.5]])
   rejects(r=>{r.outputCustody[s][k]=v;},`${s}.${k}=${v}`);
  rejects(r=>{r.outputCustody[s].bytes=0;r.outputCustody[s].retainedBytes=0;r.outputCustody[s].sha256=h('a');},s+' empty stream with a non-empty digest');
 }
 for(const k of ['finished','closed'])rejects(r=>{r.outputCustody.stdin[k]=false;},'stdin.'+k);
 rejects(r=>{r.outputCustody.stdin.errored=true;},'stdin errored');
 rejects(r=>{r.outputCustody.stdout.bytes=0;r.outputCustody.stdout.retainedBytes=0;r.outputCustody.stdout.sha256=EMPTY;},'no stdout at all');
 rejects(r=>{r.outputCustody.stdout.frameCount=0;},'no frames');rejects(r=>{r.outputCustody.stdout.frameCount=101;},'more frames than bytes');
 rejects(r=>{r.outputCustody.stdout.framingComplete=false;},'incomplete framing');rejects(r=>{r.outputCustody.stdout.parserVerified=false;},'parser unverified');
 rejects(r=>{r.outputCustody.reportRawJsonBytes=0;},'zero raw report bytes');
});
test('point 3: output size cap and the byte beyond it, and raw report length bound, each give a typed result',()=>{
 const at=r=>{for(const s of ['stdout','stderr']){r.outputCustody[s].bytes=CAP;r.outputCustody[s].retainedBytes=CAP;}};
 const r=record();at(r);assert.equal(validateReadinessFinalization(r),true,'exactly at the cap');
 for(const s of ['stdout','stderr']){const o=record();at(o);o.outputCustody[s].bytes=CAP+1;o.outputCustody[s].retainedBytes=CAP+1;assert.equal(validateReadinessFinalization(o),false,s+' cap+1');}
 const edge=record();edge.outputCustody.reportRawJsonBytes=edge.outputCustody.stdout.bytes;assert.equal(validateReadinessFinalization(edge),true,'raw report equals stdout length');
 rejects(x=>{x.outputCustody.reportRawJsonBytes=x.outputCustody.stdout.bytes+1;},'raw report longer than stdout');
});
test('point 4: tool, MCP, server-request, session and control drift are refused even with valid custody',()=>{
 rejects(r=>{r.controls.unexpectedToolItems=1;},'unexpected tool item');rejects(r=>{r.controls.serverRequests=1;},'server request');
 for(const k of ['configurationVerified','profileVerified','mcpVerified'])rejects(r=>{r.controls[k]=false;},k);
 rejects(r=>{r.session.freshThreadStarted=false;},'no fresh thread admission');rejects(r=>{r.session.ephemeralRequested=false;},'not ephemeral');
 rejects(r=>{r.session.providerObserved='other';},'provider drift');rejects(r=>{r.terminal.turnStatus='interrupted';},'incomplete turn');
 rejects(r=>{r.terminal.exitCode=1;},'non-zero exit');rejects(r=>{r.terminal.signal='SIGKILL';},'killed');rejects(r=>{r.terminal.spawnError=true;},'spawn error');
 rejects(r=>{r.controls.sourceReadbackSha256=h('b');},'source readback drift');rejects(r=>{r.controls.sourceSecondReadbackSha256=h('b');},'second readback drift');
 rejects(r=>{r.inputDisposition.requestSha256=h('b');},'request digest drift');rejects(r=>{r.ownership.status='open';},'ownership not closed');
});
test('point 5: committed source paths and bytes stay bound: any source digest change breaks the readback binding',()=>{
 for(const n of ['input','prd','spec','design','traceability'])rejects(r=>{r.sources[n].sha256=h('b');},'source '+n);
 rejects(r=>{r.sources.design.path='other.md';r.controls.sourceReadbackSha256=r.controls.sourceSecondReadbackSha256=hostDigest(r.sources);r.sources.spec.sha256='x';},'malformed source digest');
 const rebound=record();rebound.sources.spec.sha256=h('b');rebound.controls.sourceReadbackSha256=rebound.controls.sourceSecondReadbackSha256=hostDigest(rebound.sources);
 assert.equal(validateReadinessFinalization(rebound),true,'coordinated rebinding is shape-valid; the physical reader compares it to independent expected sources');
});

// Physical reader cap cases: the host store is Linux-only (CRHS-INPUT elsewhere), so these are skipped on other platforms.
const linuxOnly=process.platform==='linux'?{}:{skip:'codex host store is Linux-only on this platform'};
test('point 5: finalization reader accepts a file exactly at 65536 bytes and refuses one byte more',linuxOnly,async t=>{
 const f=readinessFixture(t),result=await runCodexToolFreeDesignReadiness(f.args);assert.equal(result.status,'reviewed',JSON.stringify(result));
 const journal=join(f.store.processRoot,'codex-host-'+result.receiptId),path=join(journal,'readiness-finalization.json'),original=readFileSync(path);
 assert.ok(readFinalizedReadinessObservation(journal,result.expected));
 const meta=JSON.parse(original),pad=n=>{meta.session.threadId='x'.repeat(n);return Buffer.from(canonicalJson(meta));};
 const base=pad(0).length,atCap=pad(65536-base);assert.equal(atCap.length,65536);
 writeFileSync(path,atCap);assert.ok(readFinalizedReadinessObservation(journal,result.expected),'exactly at cap is read');
 const over=pad(65537-base);assert.equal(over.length,65537);
 writeFileSync(path,over);assert.equal(readFinalizedReadinessObservation(journal,result.expected),null,'cap+1 is refused');
 writeFileSync(path,original);assert.ok(readFinalizedReadinessObservation(journal,result.expected));
});
