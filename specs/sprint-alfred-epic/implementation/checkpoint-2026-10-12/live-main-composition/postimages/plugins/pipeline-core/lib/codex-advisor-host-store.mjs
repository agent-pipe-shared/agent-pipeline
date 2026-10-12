// SPDX-License-Identifier: SUL-1.0
// Fresh synchronous private reader. No writer or caller-result admission API.
import {lstatSync,realpathSync} from 'node:fs';
import {join,resolve,isAbsolute} from 'node:path';
import {canonicalJson} from './codex-sandbox-compatibility.mjs';
import {hostDigest,hostFault,journalExecutable,checkedHostDirectory,readHostJournal} from './codex-host-process-journal.mjs';
import {resolvePoGateRepositoryTopology,derivePoGateRepositoryFingerprint} from './po-gate-authority.mjs';
import {resolveSystemExecutable} from './trusted-tool-resolution.mjs';
import {advisorExact,validateCodexAdvisorInitialAnswer,advisorProposalSetSha256} from './codex-advisor-request.mjs';
import {inspectFinalizedAdvisorObservation} from './codex-advisor-host-record.mjs';
import {createAdvisorBindingDiagnosticRecorder} from './codex-advisor-binding-diagnostic.mjs';
const same=(a,b)=>canonicalJson(a)===canonicalJson(b),freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export function createCodexAdvisorHostStore({repoRoot,trustedExecutablePath=null,initialBinding=null}={}){
 if(typeof repoRoot!=='string'||resolve(repoRoot)!==repoRoot||realpathSync(repoRoot)!==repoRoot)throw hostFault('advisor-store-root-invalid');
 const topology=resolvePoGateRepositoryTopology(repoRoot),repoFingerprint=derivePoGateRepositoryFingerprint({gitCommonDir:topology.gitCommonDir,primaryRoot:topology.primaryRoot});
 const selected=trustedExecutablePath??resolveSystemExecutable('codex');
 if(typeof selected!=='string'||realpathSync(selected)!==selected)throw hostFault('advisor-store-trusted-executable-unavailable');
 const initialExecutable=journalExecutable(selected),processRoot=join(topology.gitCommonDir,'agent-pipeline','advisor-codex',repoFingerprint,'processes');
 const rootPaths=[topology.gitCommonDir,join(topology.gitCommonDir,'agent-pipeline'),join(topology.gitCommonDir,'agent-pipeline','advisor-codex'),join(topology.gitCommonDir,'agent-pipeline','advisor-codex',repoFingerprint),processRoot];
 const roots=rootPaths.map((path,index)=>{const s=lstatSync(path);if(realpathSync(path)!==path||s.isSymbolicLink()||!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o022)!==0||(index>1&&(s.mode&0o077)!==0))throw hostFault('advisor-store-private-root-invalid');return {path,dev:s.dev,ino:s.ino,uid:s.uid,mode:s.mode};});
 const bound=initialBinding===null?null:freeze(structuredClone(initialBinding)),handles=new WeakMap();
 let activeDiagnostics=null;const reject=(subcheck,error)=>{activeDiagnostics?.record(subcheck,error);return null;};
 function currentRoots(){const now=resolvePoGateRepositoryTopology(repoRoot);if(now.gitCommonDir!==topology.gitCommonDir||now.primaryRoot!==topology.primaryRoot)throw hostFault('advisor-store-topology-drift');for(const r of roots){const s=lstatSync(r.path);if(realpathSync(r.path)!==r.path||!['dev','ino','uid','mode'].every(k=>s[k]===r[k]))throw hostFault('advisor-store-root-drift');}const e=journalExecutable(selected);if(!same(e,initialExecutable))throw hostFault('advisor-store-executable-drift');return e;}
 function read(hostReceipt,initial){let subcheck='store-receipt';try{
 if(!advisorExact(hostReceipt,['id','sha256'])||!/^drh_[a-f0-9]{32}$/.test(hostReceipt.id)||!initial||initial.initialContext?.repoFingerprint!==repoFingerprint)return reject(subcheck);
 subcheck='store-roots-before';currentRoots();const directory=join(processRoot,'codex-host-'+hostReceipt.id);
 subcheck='store-directory';checkedHostDirectory(directory);subcheck='store-intent';const intent=readHostJournal(directory,'intent'),historical=intent?.value?.executable;
 subcheck='store-historical-executable';if(typeof historical?.path!=='string'||!isAbsolute(historical.path)||resolve(historical.path)!==historical.path||typeof historical.sha256!=='string'||!/^[a-f0-9]{64}$/.test(historical.sha256))return reject(subcheck);
 const executable={path:historical.path,sha256:historical.sha256,repoRoot};subcheck='store-finalization-readback';
 const inspect=()=>{const value=inspectFinalizedAdvisorObservation(directory,initial,executable);if(!value.observation)reject(value.diagnostic?.subcheck??subcheck,value.diagnostic?.cause);return value.observation;};
 const first=inspect(),second=inspect();if(!first||!second||first.sha256!==hostReceipt.sha256||second.sha256!==first.sha256)return reject(subcheck);
 subcheck='store-roots-after';currentRoots();return first;}catch(error){return reject(subcheck,error);}}

 const store={processRoot,repoFingerprint,
  readForBinding(hostReceipt,initial=bound){const snapshot=initial===null?null:structuredClone(initial),receipt=structuredClone(hostReceipt);if(bound&&!same(snapshot,bound))return reject('store-initial-binding');const result=read(receipt,snapshot);if(!result)return null;const handle=Object.freeze(Object.assign(Object.create(null),{schema:'pipeline.codex-advisor-private-observation.v1',hostReceipt:Object.freeze(receipt)}));handles.set(handle,{result,initial:snapshot,receipt});return handle;},
  project(handle){const saved=handles.get(handle);if(!saved)return reject('observation-handle');const fresh=read(saved.receipt,saved.initial);if(!fresh||fresh.sha256!==saved.result.sha256)return reject('projection-readback');const v=fresh.value;return freeze({courseBinding:structuredClone(v.initialBinding.courseBinding),outcome:v.schema==='pipeline.codex-advisor-failed-finalization.v1'?'failed':'answered',initialQuestionSha256:v.initialBinding.initialContext.questionSha256,initialEvidenceSha256:v.initialBinding.initialContext.evidenceSha256,hostReceipt:structuredClone(saved.receipt),advisoryReceipt:{id:v.receipt.receiptId,sha256:v.dutyReceiptSha256},answerSha256:v.answerSha256,reportCanonicalSha256:v.responseSha256,proposalSetSha256:v.proposalSetSha256,requestSha256:v.requestSha256,recipeSha256:v.recipeSha256,isolation:structuredClone(v.isolation)});},
  receipt(handle){const saved=handles.get(handle);const fresh=saved&&read(saved.receipt,saved.initial);return fresh&&fresh.sha256===saved.result.sha256?freeze(structuredClone(fresh.value.receipt)):null;},
  failureEvidence(handle){const saved=handles.get(handle),fresh=saved&&read(saved.receipt,saved.initial);if(!fresh||fresh.sha256!==saved.result.sha256||fresh.value.schema!=='pipeline.codex-advisor-failed-finalization.v1')return null;const v=fresh.value;return freeze({outcome:'failed',code:v.failureCode,phase:'host-result-validation',childStarted:true,inputSubmitted:v.inputDisposition.status==='acknowledged',attemptCount:v.inputDisposition.submissionCount});},
  verifyReport(handle,report,receipt){let subcheck='report-outcome';const failed=()=>{reject(subcheck);return false;};try{const saved=handles.get(handle),p=store.project(handle);if(!saved||!p||p.outcome!=='answered')return failed();
 subcheck='report-contract';if(!validateCodexAdvisorInitialAnswer(report,saved.initial))return failed();
 subcheck='report-digest';if(hostDigest(report)!==p.reportCanonicalSha256)return failed();
 subcheck='answer-digest';if(hostDigest(Buffer.from(report.answer))!==p.answerSha256)return failed();
 subcheck='proposal-digest';if(advisorProposalSetSha256(report.proposals)!==p.proposalSetSha256)return failed();
 subcheck='receipt-binding';if(!same(receipt,store.receipt(handle)))return failed();return true;}catch(error){reject(subcheck,error);return false;}},
 verifyBinding(hostReceipt,report,receipt){
  const diagnostics=createAdvisorBindingDiagnosticRecorder(),previous=activeDiagnostics;activeDiagnostics=diagnostics;
  try{const observation=store.readForBinding(hostReceipt),projection=observation&&store.project(observation);
   if(!projection||!store.verifyReport(observation,report,receipt)){diagnostics.record('binding-result');return {ok:false,code:'advisor-private-execution-binding-invalid',observation:null,projection:null,diagnostic:diagnostics.snapshot()};}
   return {ok:true,code:'advisor-private-execution-bound',observation,projection};
  }finally{activeDiagnostics=previous;}
 },
 };return Object.freeze(store);
}
export function verifyCodexAdvisorInitialExecution({repoRoot,initialContext,dispatch,profile,route,courseBinding,hostReceipt,receipt,report,trustedExecutablePath=null}={}){
 let subcheck='store-create';try{const initialBinding={initialContext,dispatch,profile,route,courseBinding},store=createCodexAdvisorHostStore({repoRoot,trustedExecutablePath,initialBinding});subcheck='binding-result';return store.verifyBinding(hostReceipt,report,receipt);}catch(error){const diagnostics=createAdvisorBindingDiagnosticRecorder();diagnostics.record(subcheck,error);return {ok:false,code:'advisor-private-execution-binding-unavailable',observation:null,projection:null,diagnostic:diagnostics.snapshot()};}
}
