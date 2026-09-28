// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,lstatSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,isAbsolute,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {advisoryEvidenceBundleSha256,buildAdvisoryEvidenceBundle} from '../lib/advisory-lifecycle-v2.mjs';
import {canonicalJson} from '../lib/codex-sandbox-compatibility.mjs';
import {derivePoGateRepositoryFingerprint} from '../lib/po-gate-authority.mjs';
import {validatePipelineUserV3} from '../lib/runner-profiles-v3.mjs';
import {parseYaml} from '../lib/yaml-lite.mjs';
import {runCodexDesignReadinessHost} from './codex-design-readiness-host.mjs';
function fixture(t){
  const root=mkdtempSync(join(tmpdir(),'readiness-activation-fixture-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const common=join(root,'.git');mkdirSync(common);const processes=join(root,'processes');mkdirSync(processes,{mode:0o700});
  writeFileSync(join(root,'pipeline.user.yaml'),readFileSync(new URL('../../../pipeline.user.yaml',import.meta.url)));
  const names=['input','prd','spec','design','traceability'];for(const name of names)writeFileSync(join(root,name+'.md'),'# '+name+'\nFixture.\n');
  const bundle=buildAdvisoryEvidenceBundle(root,names.map(name=>name+'.md').sort());
  const sources=Object.fromEntries(names.map(name=>[name,{path:name+'.md',sha256:bundle.references.find(entry=>entry.path===name+'.md').sha256}]));
  const candidate={commit:'a'.repeat(40),tree:'b'.repeat(40)};
  const repoFingerprint=derivePoGateRepositoryFingerprint({gitCommonDir:common,primaryRoot:root});
  const selected={dutyId:'readiness',runner:'codex',model:'configured-model',effort:'high',state:'default',sourceSha256:'c'.repeat(64),candidateCommit:candidate.commit};
  const args={repoRoot:root,repoFingerprint,dispatchId:'fixture-activation',sources,dispatch:{queueRevision:1,candidateCommit:candidate.commit,candidateTree:candidate.tree,referenceSetSha256:advisoryEvidenceBundleSha256(bundle)},
    sandboxRuntime:{schema:'pipeline.codex-sandbox-runtime.v1',repoRoot:root,codexPath:process.execPath}};
  const calls=[],report={outcome:'ready-for-po-review',hostExecution:{selectionId:'drh_'+ 'd'.repeat(32)}};
  const deps={resolveTopology:()=>({gitCommonDir:common,primaryRoot:root}),resolveV3ReadinessRoute:()=>selected,readCandidate:()=>candidate,
    createHostStore:()=>{calls.push('store');return {processRoot:processes};},runToolFreeReadiness:async request=>{calls.push(request);return {status:'reviewed',report};},
    verifyBinding:request=>{calls.push(request);return {ok:true};}};
  return {root,processes,candidate,args,deps,calls,report,selected};
}
test('regular host maps only independently verified tool-free result and removes closed input',async t=>{
  const fx=fixture(t),result=await runCodexDesignReadinessHost(fx.args,fx.deps);
  assert.equal(result.status,'reviewed');assert.deepEqual(result.readinessReceipt,fx.report);assert.equal(result.assurance.class,'host-observed-tool-free');
  const request=fx.calls[1];assert.equal(request.route.model,fx.selected.model);assert.deepEqual(request.candidate,fx.candidate);
  assert.throws(()=>lstatSync(request.inputDirectory),{code:'ENOENT'});assert.equal(Object.keys(fx.calls[2].sourceBytes).length,5);
});
test('export declined refuses before store creation and any provider call',async t=>{
  const fx=fixture(t),path=join(fx.root,'pipeline.user.yaml');writeFileSync(path,readFileSync(path,'utf8').replace('consent: "approved"','consent: "declined"'));
  assert.equal((await runCodexDesignReadinessHost(fx.args,fx.deps)).code,'CODEX-READINESS-EXPORT-DENIED');assert.deepEqual(fx.calls,[]);
});
test('foreign repository and candidate route cannot select a provider',async t=>{
  const fx=fixture(t);assert.equal((await runCodexDesignReadinessHost({...fx.args,repoFingerprint:'e'.repeat(64)},fx.deps)).code,'CODEX-READINESS-REPOSITORY-MISMATCH');
  fx.selected.candidateCommit='f'.repeat(40);assert.equal((await runCodexDesignReadinessHost(fx.args,fx.deps)).code,'CODEX-READINESS-ROUTE-UNAVAILABLE');assert.deepEqual(fx.calls,[]);
});
test('source edits and stale dispatch fail before store or model effects',async t=>{
  const fx=fixture(t);writeFileSync(join(fx.root,'spec.md'),'Changed evidence.');assert.equal((await runCodexDesignReadinessHost(fx.args,fx.deps)).code,'CODEX-READINESS-EVIDENCE-MISMATCH');assert.deepEqual(fx.calls,[]);
});
test('host unavailable keeps recovery input and never tries another provider route',async t=>{
  const fx=fixture(t);fx.deps.runToolFreeReadiness=async request=>{fx.calls.push(request);return {status:'unavailable',code:'CTFR-HOST-UNAVAILABLE'};};
  const result=await runCodexDesignReadinessHost(fx.args,fx.deps);assert.equal(result.code,'CTFR-HOST-UNAVAILABLE');assert.equal(result.readinessReceipt,null);
  assert.equal(fx.calls.length,2);assert.equal(lstatSync(fx.calls[1].inputDirectory).isDirectory(),true);
});
test('private readback failure and post-turn candidate drift prevent reviewed publication',async t=>{
  const fx=fixture(t);fx.deps.verifyBinding=()=>({ok:false});assert.equal((await runCodexDesignReadinessHost(fx.args,fx.deps)).code,'CODEX-READINESS-READBACK-FAILED');
  fx.deps.verifyBinding=()=>({ok:true});let reads=0;fx.deps.readCandidate=()=>++reads===1?fx.candidate:{...fx.candidate,commit:'e'.repeat(40)};
  assert.equal((await runCodexDesignReadinessHost(fx.args,fx.deps)).code,'CODEX-READINESS-READBACK-FAILED');
});
test('actual not-ready remains a reviewed refusal of readiness',async t=>{
  const fx=fixture(t);fx.report.outcome='not-ready';const result=await runCodexDesignReadinessHost(fx.args,fx.deps);
  assert.equal(result.status,'reviewed');assert.equal(result.readinessReceipt.outcome,'not-ready');
});
