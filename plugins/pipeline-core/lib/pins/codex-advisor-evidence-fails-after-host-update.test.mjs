// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.codex-advisor-evidence-fails-after-host-update (AC-129).
// Acceptance points covered:
//   A1 historical executable revalidated from the sealed journal (changed Codex binary must not invalidate)
//   A2 altered finalization / receipt / report still rejected; the Advisor is never silently omitted
//   A3 bounded first-failing-subcheck diagnostic, no private content or path in the output
//   A4 changed-executable and tampered-journal cases in targeted tests (installed-build greenfield replay is
//      a consumer/native hold and is NOT claimed here)
// No Codex CLI is invoked. POSIX-only cases (uid/mode bits) are skipped on native Windows with a typed reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,chmodSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {
  createAdvisorBindingDiagnosticRecorder,projectAdvisorBindingDiagnostic,ADVISOR_BINDING_DIAGNOSTIC_SCHEMA
} from '../codex-advisor-binding-diagnostic.mjs';
import {verifyCodexAdvisorInitialExecution} from '../codex-advisor-host-store.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const lib=join(here,'..');
const repo=join(here,'..','..','..','..');
const diagnosticPath=join(lib,'codex-advisor-binding-diagnostic.mjs');
const storePath=join(lib,'codex-advisor-host-store.mjs');

const HOST_LIMITATION = process.platform==='win32'
  ? 'host-limitation: POSIX uid/mode-bit and directory-symlink semantics unavailable on native Windows; owner Coordinator; due 2026-10-19 (Linux/WSL run, PO decision K7)'
  : false;

const PRIVATE_PATH='C:\\Users\\private-person\\secret-journal\\codex.exe';

/** Shared A3 contract, run against the real module and against RED mutants. */
function assertDiagnosticContract(mod){
  const {createAdvisorBindingDiagnosticRecorder:make,projectAdvisorBindingDiagnostic:project,ADVISOR_BINDING_DIAGNOSTIC_SCHEMA:schema}=mod;
  // empty recorder: nothing to report
  assert.equal(make().snapshot(),null);
  // first failure wins; a private path in the error never reaches the output
  const first=make();
  first.record('finalization-file-json',new Error(PRIVATE_PATH));
  first.record('store-intent',new Error('later'));
  const snap=first.snapshot();
  assert.deepEqual(Object.keys(snap).sort(),['cause','repair','schema','subcheck']);
  assert.equal(snap.schema,schema);
  assert.equal(snap.subcheck,'finalization-file-json');
  assert.equal(snap.cause,'advisor-binding-finalization-file-json');
  assert.deepEqual(snap.repair,{kind:'revalidate-owned-evidence',automatic:false,authority:'diagnostic-only'});
  assert.equal(JSON.stringify(snap).includes('private-person'),false);
  assert.equal(JSON.stringify(snap).includes('later'),false);
  // an unknown subcheck is collapsed into the closed set
  const unknown=make();unknown.record('not-a-real-check-C:\\leak');
  assert.equal(unknown.snapshot().subcheck,'binding-result');
  assert.equal(JSON.stringify(unknown.snapshot()).includes('leak'),false);
  // a message that merely contains a known cause plus private text is not adopted
  const embedded=make();embedded.record('store-roots-before',new Error(PRIVATE_PATH+' advisor-store-executable-drift'));
  assert.equal(embedded.snapshot().cause,'advisor-binding-store-roots-before');
  // a closed cause code is carried; retryable causes switch repair kind
  const coded=make();coded.record('store-roots-before',Object.assign(new Error('x'),{code:'advisor-store-executable-drift'}));
  assert.equal(coded.snapshot().cause,'advisor-store-executable-drift');
  const retry=make();retry.record('finalization-file-open','host-journal-file-changed');
  assert.deepEqual(retry.snapshot().repair,{kind:'repeat-bounded-read',automatic:false,authority:'diagnostic-only'});
  // projection reconstructs only closed values
  assert.deepEqual(project(JSON.parse(JSON.stringify(snap))),snap);
  assert.equal(project({...snap,cause:PRIVATE_PATH}),null);
  assert.equal(project({...snap,subcheck:'invented'}),null);
  assert.equal(project({...snap,schema:'other'}),null);
  assert.equal(project(null),null);
  assert.equal(project('text'),null);
  assert.deepEqual(Object.keys(project({...snap,extra:PRIVATE_PATH})).sort(),['cause','repair','schema','subcheck']);
}

test('A3: diagnostic contract holds on the real module (closed subcheck, first failure, no private content)',()=>{
  assertDiagnosticContract({createAdvisorBindingDiagnosticRecorder,projectAdvisorBindingDiagnostic,ADVISOR_BINDING_DIAGNOSTIC_SCHEMA});
});

test('A3 RED: the same contract fails against scratch mirrors of the producer with each defect injected',async()=>{
  const source=readFileSync(diagnosticPath,'utf8');
  const mutants=[
    ['open subcheck set',"const check=checks.includes(subcheck)?subcheck:'binding-result'","const check=subcheck"],
    ['leaks error message as cause',"cause=causeOf(error)??'advisor-binding-'+check","cause=causeOf(error)??String(error?.message??('advisor-binding-'+check))"],
    ['keeps last failure not first',"if(first===null)first=diagnostic(subcheck,error)","first=diagnostic(subcheck,error)"],
    ['projection trusts foreign cause',"return projected.cause===value.cause?projected:null","return projected"]
  ];
  mkdirSync(join(repo,'scratch'),{recursive:true});
  const dir=mkdtempSync(join(repo,'scratch','codex-advisor-evidence-pin-'));
  try{
    mutants.forEach(([name,from,to])=>assert.equal(source.split(from).length,2,'mutation anchor must match once: '+name));
    for(let i=0;i<mutants.length;i++){
      const [name,from,to]=mutants[i],file=join(dir,'mirror-'+i+'.mjs');
      writeFileSync(file,source.replace(from,to));
      const mod=await import(pathToFileURL(file).href);
      assert.throws(()=>assertDiagnosticContract(mod),undefined,'contract must detect mutant: '+name);
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('A3/A2: an unusable store is a typed failure with a bounded diagnostic, never a silent pass',()=>{
  const relative='relative/private-repo-root';
  const result=verifyCodexAdvisorInitialExecution({repoRoot:relative,hostReceipt:{id:'drh_'+'0'.repeat(32),sha256:'0'.repeat(64)}});
  assert.equal(result.ok,false);
  assert.equal(result.code,'advisor-private-execution-binding-unavailable');
  assert.equal(result.observation,null);
  assert.equal(result.projection,null);
  assert.equal(result.diagnostic.subcheck,'store-create');
  assert.equal(result.diagnostic.cause,'advisor-store-root-invalid');
  assert.deepEqual(projectAdvisorBindingDiagnostic(result.diagnostic),result.diagnostic);
  assert.equal(JSON.stringify(result).includes('private-repo-root'),false);
  const bare=verifyCodexAdvisorInitialExecution();
  assert.equal(bare.ok,false);
  assert.equal(bare.diagnostic.subcheck,'store-create');
});

test('A1 (structural supplement): the reader revalidates the historical executable from the sealed intent journal',()=>{
  const source=readFileSync(storePath,'utf8');
  assert.ok(source.includes("const executable={path:historical.path,sha256:historical.sha256,repoRoot}"),'binding executable comes from the journalled intent, not the current CLI');
  assert.ok(source.includes("historical=intent?.value?.executable"),'historical executable read from the journal');
  assert.ok(source.includes("subcheck='store-historical-executable'"),'historical executable has its own bounded subcheck');
});

// ---- POSIX-only behavioural cases (real store, fixture host observations, no Codex CLI) ----
async function boundFixture(t){
  const {advisorHostFixture}=await import('../codex-advisor-host.fixture.mjs');
  const f=advisorHostFixture(t);
  const prepared=await f.execution.prepareInitial(f.args);
  assert.equal(prepared.ok,true,prepared.code);
  const result=await f.execution.executeInitial(f.args,prepared.preparedRequest);
  assert.equal(result.ok,true,result.code);
  const base={repoRoot:f.root,initialContext:f.args.initialContext,dispatch:f.args.dispatch,profile:f.args.profile,route:f.route,courseBinding:f.args.courseBinding,hostReceipt:result.hostReceipt,receipt:result.receipt,report:result.report};
  return {f,result,base};
}

test('A1/A4: a changed Codex executable does not invalidate the sealed historical Advisor evidence',{skip:HOST_LIMITATION},async t=>{
  const {f,base}=await boundFixture(t);
  assert.equal(verifyCodexAdvisorInitialExecution({...base,trustedExecutablePath:process.execPath}).ok,true);
  const updated=join(f.root,'codex-after-update');
  writeFileSync(updated,'#!/bin/sh\nexit 0\n');chmodSync(updated,0o700);
  const after=verifyCodexAdvisorInitialExecution({...base,trustedExecutablePath:updated});
  assert.equal(after.ok,true,after.code);
});

test('A2/A3/A4: tampered finalization journal is rejected with a bounded subcheck and no private content',{skip:HOST_LIMITATION},async t=>{
  const {f,result,base}=await boundFixture(t);
  const {createCodexAdvisorHostStore}=await import('../codex-advisor-host-store.mjs');
  const {ADVISOR_FINALIZATION_FILENAME}=await import('../codex-advisor-host-record.mjs');
  const {canonicalJson}=await import('../codex-sandbox-compatibility.mjs');
  const store=createCodexAdvisorHostStore({repoRoot:f.root,trustedExecutablePath:process.execPath});
  const path=join(store.processRoot,'codex-host-'+result.hostReceipt.id,ADVISOR_FINALIZATION_FILENAME),original=readFileSync(path),value=JSON.parse(original);
  try{
    value.outputCustody.stdout.ended=false;writeFileSync(path,canonicalJson(value));
    const tampered=verifyCodexAdvisorInitialExecution({...base,trustedExecutablePath:process.execPath});
    assert.equal(tampered.ok,false);
    assert.equal(tampered.code,'advisor-private-execution-binding-invalid');
    assert.equal(tampered.observation,null);
    assert.equal(tampered.projection,null);
    assert.ok(tampered.diagnostic);
    assert.deepEqual(projectAdvisorBindingDiagnostic(tampered.diagnostic),tampered.diagnostic);
    assert.equal(JSON.stringify(tampered).includes(f.root),false);
  }finally{writeFileSync(path,original);chmodSync(path,0o600);}
  assert.equal(verifyCodexAdvisorInitialExecution({...base,trustedExecutablePath:process.execPath}).ok,true);
});

test('A2: altered report or receipt is rejected; the Advisor result is never silently omitted',{skip:HOST_LIMITATION},async t=>{
  const {base}=await boundFixture(t);
  const forgedReport=structuredClone(base.report);forgedReport.answer='invented answer';
  const badReport=verifyCodexAdvisorInitialExecution({...base,report:forgedReport,trustedExecutablePath:process.execPath});
  assert.equal(badReport.ok,false);
  assert.equal(badReport.code,'advisor-private-execution-binding-invalid');
  assert.deepEqual(projectAdvisorBindingDiagnostic(badReport.diagnostic),badReport.diagnostic);
  const forgedReceipt=structuredClone(base.receipt);forgedReceipt.receiptId='forged';
  assert.equal(verifyCodexAdvisorInitialExecution({...base,receipt:forgedReceipt,trustedExecutablePath:process.execPath}).ok,false);
  assert.equal(verifyCodexAdvisorInitialExecution({...base,hostReceipt:{...base.hostReceipt,sha256:'0'.repeat(64)},trustedExecutablePath:process.execPath}).ok,false);
});

// ---- AC-135: a managed terminal binds its working directory to the repository, not to one root path string ----
test('AC-135: a managed terminal whose cwd is strictly inside the repository (not the root string) completes',{skip:HOST_LIMITATION},async t=>{
  const {f,result}=await boundFixture(t);
  assert.notEqual(f.input,f.root);
  assert.ok(f.input.startsWith(f.root+'/'),'the launch cwd is strictly inside the repository root');
  assert.equal(result.ok,true,result.code);
});

test('AC-135: cwdBoundToRepository accepts the roots and their interiors, and refuses everything else',async t=>{
  const {cwdBoundToRepository}=await import('../codex-host-process-supervisor.mjs');
  const {symlinkSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');
  const base=mkdtempSync(join(tmpdir(),'ac135-cwd-'));
  t.after(()=>rmSync(base,{recursive:true,force:true}));
  const primaryRoot=join(base,'root'),commonDir=join(base,'common'),sibling=primaryRoot+'2',elsewhere=join(base,'elsewhere');
  const inside=join(primaryRoot,'sub'),store=join(commonDir,'agent-pipeline','x','processes','input-x');
  for(const d of [inside,store,sibling,elsewhere])mkdirSync(d,{recursive:true});
  const link=join(primaryRoot,'escape');symlinkSync(elsewhere,link);
  const repository={primaryRoot,commonDir};
  assert.equal(cwdBoundToRepository(primaryRoot,repository),true,'equal to primaryRoot');
  assert.equal(cwdBoundToRepository(inside,repository),true,'strictly inside primaryRoot');
  assert.equal(cwdBoundToRepository(store,repository),true,'strictly inside commonDir, outside primaryRoot');
  assert.equal(cwdBoundToRepository(sibling,repository),false,'sibling sharing a name prefix');
  assert.equal(cwdBoundToRepository(join(base,'missing'),repository),false,'nonexistent');
  assert.equal(cwdBoundToRepository('relative/dir',repository),false,'relative');
  assert.equal(cwdBoundToRepository(link,repository),false,'symlink inside primaryRoot pointing outside both roots');
});
