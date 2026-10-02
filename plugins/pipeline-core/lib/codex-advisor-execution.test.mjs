// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC06C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {advisorHostFixture} from './codex-advisor-host.fixture.mjs';
import {createCodexAdvisorHostStore,verifyCodexAdvisorInitialExecution} from './codex-advisor-host-store.mjs';
import {createCodexAdvisorExecution,isCodexAdvisorExecution,getCodexAdvisorExecutionAdmission} from './codex-advisor-execution.mjs';
import {ADVISOR_FINALIZATION_FILENAME} from './codex-advisor-host-record.mjs';
import {canonicalJson} from './codex-sandbox-compatibility.mjs';
import {hostDigest} from './codex-host-process-journal.mjs';
import {advisorProposalSetSha256} from './codex-advisor-request.mjs';
import {createDesignAdvisorCourseStore} from './design-advisor-course-store.mjs';
import {designAdvisorValueSha256} from './design-advisor-course.mjs';
import {loadRunnerProfilesV3Registry} from './runner-profiles-v3.mjs';
async function run(f){const prepared=await f.execution.prepareInitial(f.args);assert.equal(prepared.ok,true,prepared.code);const result=await f.execution.executeInitial(f.args,prepared.preparedRequest);return {result,prepared};}
test('Advisor actual unknown managed output becomes fresh privately bound initial answer',async t=>{
 const f=advisorHostFixture(t);const gate=await f.execution.admitSourceMetadata({candidate:f.candidate,sources:f.sources,featureId:f.args.initialContext.featureId,profile:f.args.profile,reason:f.args.reason,dispatch:f.args.dispatch,route:f.route});assert.equal(gate.status,'admitted');assert.equal(isCodexAdvisorExecution(f.execution),true);assert.equal(isCodexAdvisorExecution({executeInitial(){}}),false);assert.deepEqual(getCodexAdvisorExecutionAdmission(f.execution),gate);
 const {result,prepared}=await run(f);assert.equal(result.ok,true,result.code);assert.match(result.report.answer,/^Actual unknown-at-launch /);assert.equal(Object.hasOwn(prepared.preparedRequest,'answerSha256'),false);assert.equal(result.projection.answerSha256,hostDigest(Buffer.from(result.report.answer)));assert.equal(result.projection.reportCanonicalSha256,hostDigest(result.report));assert.equal(result.projection.proposalSetSha256,advisorProposalSetSha256(result.report.proposals));assert.equal(result.projection.recipeSha256,prepared.preparedRequest.recipeSha256);
 const initialBinding={initialContext:f.args.initialContext,dispatch:f.args.dispatch,profile:f.args.profile,route:f.route,courseBinding:f.args.courseBinding};
 const fresh=createCodexAdvisorHostStore({repoRoot:f.root,trustedExecutablePath:process.execPath,initialBinding});const observed=fresh.readForBinding(result.hostReceipt);assert.ok(observed);assert.deepEqual(fresh.project(observed),result.projection);assert.equal(fresh.project(JSON.parse(JSON.stringify(observed))),null);assert.equal(fresh.verifyReport(observed,result.report,result.receipt),true);
 const reservationBinding={initialContext:f.args.initialContext,courseBinding:f.args.courseBinding,dispatch:f.args.dispatch,requestSha256:prepared.preparedRequest.requestSha256};
 const courseObservation=f.execution.courseHostStore.readForBinding(result.hostReceipt,reservationBinding);assert.ok(courseObservation);const courseProjection=f.execution.courseHostStore.project(courseObservation);assert.equal(Object.keys(courseProjection).length,11);assert.equal(courseProjection.requestSha256,prepared.preparedRequest.requestSha256);assert.equal(Object.hasOwn(courseProjection,'isolation'),false);assert.equal(f.execution.courseHostStore.readForBinding(result.hostReceipt,{...reservationBinding,requestSha256:'0'.repeat(64)}),null);
 assert.equal(verifyCodexAdvisorInitialExecution({repoRoot:f.root,...initialBinding,hostReceipt:result.hostReceipt,receipt:result.receipt,report:result.report,trustedExecutablePath:process.execPath}).ok,true);
 const updatedExecutable=join(f.root,'codex-after-update');writeFileSync(updatedExecutable,'#!/bin/sh\nexit 0\n');chmodSync(updatedExecutable,0o700);
 assert.equal(verifyCodexAdvisorInitialExecution({repoRoot:f.root,...initialBinding,hostReceipt:result.hostReceipt,receipt:result.receipt,report:result.report,trustedExecutablePath:updatedExecutable}).ok,true,'a later Codex binary must not invalidate the sealed historical process receipt');
 const forged=structuredClone(result.report);forged.answer='invented answer';assert.equal(fresh.verifyReport(observed,forged,result.receipt),false);
 assert.equal((await f.execution.executeInitial(f.args,prepared.preparedRequest)).code,'advisor-prepared-request-required');
 // A deliberate later design revision must not relabel/reexecute the initial answer.
 writeFileSync(join(f.root,'design.md'),'Intentional later design revision.\n');execFileSync('git',['add','design.md'],{cwd:f.root});execFileSync('git',['commit','--quiet','-m','Later revision'],{cwd:f.root});
 const restarted=createCodexAdvisorHostStore({repoRoot:f.root,trustedExecutablePath:process.execPath,initialBinding});assert.ok(restarted.readForBinding(result.hostReceipt));assert.equal((await f.execution.prepareInitial(f.args)).ok,false);
});
test('Advisor export denial refuses before any source prompt construction or child launch',async t=>{
 const f=advisorHostFixture(t,'clean','denied');writeFileSync(join(f.root,'design.md'),'changed after initial context');const prepared=await f.execution.prepareInitial(f.args);assert.equal(prepared.ok,false);assert.equal(prepared.code,'advisor-host-export-denied');assert.equal(existsSync(join(f.root,'.git','agent-pipeline','advisor-codex')),false);
 const absent=createCodexAdvisorExecution({repoRoot:f.root,trustedExecutablePath:process.execPath});assert.equal((await absent.prepareInitial(f.args)).code,'advisor-host-admission-unavailable');
});
test('Advisor unowned JSON, foreign executable, malformed custody and cross-citations fail',async t=>{
 const f=advisorHostFixture(t);const {result}=await run(f);assert.equal(result.ok,true,result.code);const initialBinding={initialContext:f.args.initialContext,dispatch:f.args.dispatch,profile:f.args.profile,route:f.route,courseBinding:f.args.courseBinding};
 const store=createCodexAdvisorHostStore({repoRoot:f.root,trustedExecutablePath:process.execPath,initialBinding});assert.equal(store.readForBinding({id:'drh_'+'0'.repeat(32),sha256:result.hostReceipt.sha256}),null);assert.equal(store.project({...result.projection}),null);
 assert.throws(()=>createCodexAdvisorHostStore({repoRoot:f.root,trustedExecutablePath:'/usr/bin/true',initialBinding}),{code:'advisor-store-trusted-executable-unavailable'});
 const path=join(store.processRoot,'codex-host-'+result.hostReceipt.id,ADVISOR_FINALIZATION_FILENAME),original=readFileSync(path),v=JSON.parse(original);v.outputCustody.stdout.ended=false;writeFileSync(path,canonicalJson(v));assert.equal(store.readForBinding({id:result.hostReceipt.id,sha256:hostDigest(v)}),null);writeFileSync(path,original);chmodSync(path,0o644);assert.equal(store.readForBinding(result.hostReceipt),null);
 const bad=advisorHostFixture(t,'cross-citation');const outcome=(await run(bad)).result;assert.equal(outcome.ok,false);assert.equal(outcome.outcome,'failed');assert.ok(outcome.hostReceipt);assert.equal(outcome.projection.answerSha256,null);assert.equal(outcome.projection.proposalSetSha256,null);
});
test('Advisor empty genuinely managed process never becomes an answered receipt',async t=>{const f=advisorHostFixture(t,'empty-process');const {result}=await run(f);assert.equal(result.ok,false);assert.equal(result.hostReceipt,null);assert.equal(result.actualHostResult,null);});

test('Advisor actual raw JSON overflow refuses despite a small valid canonical answer',async t=>{const f=advisorHostFixture(t),source=readFileSync(f.script,'utf8'),needle='text:JSON.stringify(report)';assert.equal(source.split(needle).length,2);writeFileSync(f.script,source.replace(needle,"text:' '.repeat(65537)+JSON.stringify(report)"));const {result}=await run(f);assert.equal(result.ok,false);assert.equal(result.outcome,'failed');assert.ok(result.hostReceipt);assert.equal(result.projection.answerSha256,null);assert.equal(result.projection.proposalSetSha256,null);assert.equal(result.observed?.outputCustody.reportRawJsonBytes>65536,true);});

test('Actual acknowledged closed invalid Advisor answer spends a typed failed course observation',async t=>{
 const f=advisorHostFixture(t,'cross-citation'),{result,prepared}=await run(f);assert.equal(result.ok,false);assert.equal(result.outcome,'failed');assert.ok(result.hostReceipt);assert.equal(result.receipt.observed.status,'failed');assert.equal(result.receipt.answerSha256,null);assert.deepEqual(result.failureEvidence,{outcome:'failed',code:'host-advisor-answer-contract-invalid',phase:'host-result-validation',childStarted:true,inputSubmitted:true,attemptCount:1});assert.ok(result.receiptBytes.equals(Buffer.from(canonicalJson(result.receipt))));
 const initialBinding={initialContext:f.args.initialContext,dispatch:f.args.dispatch,profile:f.args.profile,route:f.route,courseBinding:f.args.courseBinding},fresh=createCodexAdvisorHostStore({repoRoot:f.root,trustedExecutablePath:process.execPath,initialBinding}),observation=fresh.readForBinding(result.hostReceipt);assert.ok(observation);const projection=fresh.project(observation);assert.equal(projection.outcome,'failed');assert.equal(projection.answerSha256,null);assert.equal(projection.proposalSetSha256,null);assert.equal(fresh.verifyReport(observation,{...result.report},result.receipt),false);
 assert.deepEqual(fresh.failureEvidence(observation),result.failureEvidence);assert.equal(fresh.failureEvidence(JSON.parse(JSON.stringify(observation))),null);
 const reservation={initialContext:f.args.initialContext,courseBinding:f.args.courseBinding,dispatch:f.args.dispatch,requestSha256:prepared.preparedRequest.requestSha256},owned=f.execution.courseHostStore.readForBinding(result.hostReceipt,reservation);assert.ok(owned);assert.equal(f.execution.courseHostStore.project(owned).outcome,'failed');assert.equal(f.execution.courseHostStore.readForBinding(result.hostReceipt,{...reservation,requestSha256:'0'.repeat(64)}),null);assert.equal(fresh.project(JSON.parse(JSON.stringify(observation))),null);
 const privatePath=join(fresh.processRoot,'codex-host-'+result.hostReceipt.id,ADVISOR_FINALIZATION_FILENAME),bytes=readFileSync(privatePath),v=JSON.parse(bytes);assert.equal(v.schema,'pipeline.codex-advisor-failed-finalization.v1');assert.equal(Object.hasOwn(v,'report'),false);assert.equal(Object.hasOwn(v,'question'),false);assert.equal(v.inputDisposition.submissionCount,1);v.outcome='answered';v.receipt.observed.status='answered';writeFileSync(privatePath,canonicalJson(v));assert.equal(fresh.readForBinding({id:result.hostReceipt.id,sha256:hostDigest(v)}),null);writeFileSync(privatePath,bytes);
});
test('Durable single course finalizes actual managed failed turn without reset or no-child fiction',async t=>{
 const f=advisorHostFixture(t,'cross-citation'),registry=loadRunnerProfilesV3Registry(),initialContext={...f.args.initialContext,routePolicySha256:designAdvisorValueSha256(registry)};
 const store=createDesignAdvisorCourseStore({gitCommonDir:join(f.root,'.git'),repoFingerprint:f.repoFingerprint,featureId:initialContext.featureId,runner:'codex',registry,hostStore:f.execution.courseHostStore,observeInitialContext:context=>({status:'verified',contextSha256:designAdvisorValueSha256(context)})});
 const opened=await store.openInitialCourse({initialContext});assert.equal(opened.status,'available');const reserved=store.reserveCycle({courseId:opened.courseId,initialContextSha256:designAdvisorValueSha256(initialContext)});assert.equal(reserved.status,'reserved');const slot=reserved.slots[0];
 f.args.initialContext=initialContext;f.args.courseBinding={courseId:opened.courseId,initialContextSha256:designAdvisorValueSha256(initialContext),reservationId:reserved.reservationId,slot:slot.slot,routeStepSha256:slot.routeStepSha256};
 const prepared=await f.execution.prepareInitial(f.args);assert.equal(prepared.ok,true);assert.equal(store.reserveAttempt(reserved.token,{slot:slot.slot,routeStepSha256:slot.routeStepSha256,dispatch:f.args.dispatch,requestSha256:prepared.preparedRequest.requestSha256}).status,'attempt-reserved');
 const result=await f.execution.executeInitial(f.args,prepared.preparedRequest);assert.equal(result.outcome,'failed');assert.ok(result.hostReceipt);assert.equal((await store.finalizeAttempt(reserved.token,{hostReceipt:result.hostReceipt})).status,'attempt-finalized');const terminal=await store.finalizeCycle(reserved.token,{hostReceipt:result.hostReceipt});assert.equal(terminal.status,'reuse-terminal');assert.equal(terminal.outcome,'failed');assert.equal(terminal.terminalObservation.answerSha256,null);assert.equal(terminal.terminalObservation.proposalSetSha256,null);
 const final=store.readCurrent();assert.equal(final.status,'reuse-terminal');assert.equal(final.outcome,'failed');assert.equal(store.reserveCycle({courseId:opened.courseId,initialContextSha256:designAdvisorValueSha256(initialContext)}).status,'reuse-terminal');assert.notEqual(store.reserveAttempt(reserved.token,{slot:1,routeStepSha256:slot.routeStepSha256,dispatch:f.args.dispatch,requestSha256:prepared.preparedRequest.requestSha256}).status,'attempt-reserved');
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 7) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
