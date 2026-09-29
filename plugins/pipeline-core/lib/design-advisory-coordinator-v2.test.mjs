import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC11C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import {advisorHostFixture} from './codex-advisor-host.fixture.mjs';
import {coordinateInitialDesignAdvisory} from './design-advisory-coordinator-v2.mjs';
import {createCodexAdvisorExecution} from './codex-advisor-execution.mjs';
import {createNativeInitialAdvisorExecution} from './native-initial-advisor-execution.mjs';
import {designAdvisorValueSha256} from './design-advisor-course.mjs';
import {loadRunnerProfilesV3Registry} from './runner-profiles-v3.mjs';
import {coordinateDesignAdvisory} from './design-advisory-coordinator.mjs';
import {runDesignAdvisoryCoordinator} from '../scripts/design-advisory-coordinator.mjs';
const args=f=>({repoRoot:f.root,featureId:'advisor-feature',authoringDispatchId:'elephant-author',sources:f.sources,reason:'risk-review',profile:'feature',dispatch:f.args.dispatch,route:f.route,hostExecution:f.execution});

test('actual managed unknown answer finalizes initial course and restart does not launch another consultation',async t=>{
 const f=advisorHostFixture(t),input=args(f);
 const result=await coordinateInitialDesignAdvisory(input);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.status,'answered');
 assert.equal(result.implementationAuthority,false);
 assert.match(result.report.answer,/Actual unknown-at-launch [a-f0-9-]{36}/);
 assert.equal(result.report.proposals.length,1);
 assert.equal(result.course.outcome,'answered');
 assert.equal(result.consultation.questionSha256,result.initialContext.questionSha256);
 const restart=await coordinateInitialDesignAdvisory(input);
 assert.equal(restart.ok,false);
 assert.equal(restart.code,'DAC2-COURSE-ALREADY-EXISTS');
 assert.equal(restart.status,'reuse-terminal');
 const decision=m=>({status:'approved',...m,decisionRef:'owner-new-question',decisionSha256:'a'.repeat(64)});
 const sameQuestion=await coordinateInitialDesignAdvisory({...input,newCourseParentId:result.courseBinding.courseId,observeInitialCourseDecision:decision});
 assert.equal(sameQuestion.code,'DACS-NO-NEW-SUBSTANTIVE-QUESTION');
 const changed={...input,reason:'architecture-tradeoff',dispatch:{...input.dispatch,dispatchId:'advisor-successor'},newCourseParentId:result.courseBinding.courseId};
 assert.equal((await coordinateInitialDesignAdvisory(changed)).code,'DAC2-COURSE-ALREADY-EXISTS');
 const successor=await coordinateInitialDesignAdvisory({...changed,observeInitialCourseDecision:decision});
 assert.equal(successor.status,'answered',JSON.stringify(successor));
 assert.notEqual(successor.courseBinding.courseId,result.courseBinding.courseId);
 assert.equal((await coordinateInitialDesignAdvisory({...changed,observeInitialCourseDecision:decision})).code,'DAC2-COURSE-ALREADY-EXISTS');
 const reused=await coordinateInitialDesignAdvisory({...input,dispatch:{...input.dispatch,dispatchId:'advisor-reused-decision'},newCourseParentId:successor.courseBinding.courseId,observeInitialCourseDecision:decision});
 assert.equal(reused.code,'DACS-OWNER-DECISION-REUSED');
});

test('metadata export denial precedes invalid declared source content reads',async t=>{
 const f=advisorHostFixture(t,'clean','denied'),input=args(f);
 input.sources=structuredClone(input.sources);
 input.sources.design.path='missing-design.md';
 const result=await coordinateInitialDesignAdvisory(input);
 assert.equal(result.ok,false);
 assert.notEqual(result.code,'DAP-PATH');
 assert.notEqual(result.code,'DAC2-SOURCE-DECLARATION');
 assert.equal(result.implementationAuthority,false);
 const gated=advisorHostFixture(t),admission={...gated.admission,admitHostExport:()=>({decision:++gated.calls.export===1?'approved':'denied'})};
 const execution=createCodexAdvisorExecution({repoRoot:gated.root,trustedExecutablePath:process.execPath,inputDirectory:gated.input,admission});
 const denied=await coordinateInitialDesignAdvisory({...args(gated),hostExecution:execution});
 assert.equal(denied.status,'unavailable-pending-final-approval',JSON.stringify(denied));
 assert.equal(denied.course.outcome,'permission-denied');
 assert.equal(denied.course.attempts.length,0);
 assert.equal(denied.failureEvidence.childStarted,false);
 assert.equal(denied.failureEvidence.inputSubmitted,false);
 assert.equal(denied.hostReceipt,null);
 assert.equal(execution.observeNoChild({...denied.failureEvidence.observation.courseBinding,reservationId:'foreign'}),null);
 const allowed=createCodexAdvisorExecution({repoRoot:gated.root,trustedExecutablePath:process.execPath,inputDirectory:gated.input,admission:gated.admission});
 assert.equal((await coordinateInitialDesignAdvisory({...args(gated),hostExecution:allowed})).code,'DAC2-COURSE-ALREADY-EXISTS');
});

test('caller supplied unbranded host object cannot mint a consultation course',async t=>{
 assert.equal((await coordinateDesignAdvisory({planPath:'legacy.md',specPath:'spec.md',invokeBridge:()=>{throw Error('must not launch');}})).code,'DAC-INITIAL-SOURCES-REQUIRED');
 await assert.rejects(runDesignAdvisoryCoordinator(['--runner','claude','--repo-root','/missing','--feature','legacy','--plan','legacy.md','--spec','spec.md','--decision','accept','--rationale-file','rationale.md']));
 for(const runner of ['claude','antigravity']){
  const native=advisorHostFixture(t),route={model:null,effort:null,sourceSha256:designAdvisorValueSha256(loadRunnerProfilesV3Registry()),candidateCommit:native.candidate.commit};
  const input={...args(native),runner,route,hostExecution:createNativeInitialAdvisorExecution({runner})};
  const unavailable=await coordinateDesignAdvisory(input);
  assert.equal(unavailable.status,'unavailable-pending-final-approval',JSON.stringify(unavailable));
  assert.equal(unavailable.code,'native-initial-answer-provenance-unavailable');
  assert.equal(unavailable.courseBinding.slot,0);
  assert.equal(unavailable.course.attempts.length,0);
  assert.equal(unavailable.failureEvidence.childStarted,false);
  assert.equal(unavailable.failureEvidence.inputSubmitted,false);
  assert.equal(unavailable.hostReceipt,null);
  assert.equal(unavailable.report,null);
  assert.equal(native.calls.export,0);
  assert.equal((await coordinateInitialDesignAdvisory({...input,dispatch:{...input.dispatch,dispatchId:'fresh-native-dispatch'},hostExecution:createNativeInitialAdvisorExecution({runner})})).status,'reuse-terminal');
  assert.equal((await coordinateInitialDesignAdvisory({...input,hostExecution:{...input.hostExecution}})).code,'DAC2-HOST-CAPABILITY');
  assert.equal((await coordinateInitialDesignAdvisory({...input,runner:runner==='claude'?'antigravity':'claude'})).code,'DAC2-HOST-CAPABILITY');
 }
 const f=advisorHostFixture(t),input=args(f);
 input.hostExecution={admitSourceMetadata:async()=>({status:'admitted'})};
 const result=await coordinateInitialDesignAdvisory(input);
 assert.equal(result.code,'DAC2-HOST-CAPABILITY');
 const failed=advisorHostFixture(t,'cross-citation'),terminal=await coordinateInitialDesignAdvisory(args(failed));
 assert.equal(terminal.status,'unavailable-pending-final-approval',JSON.stringify(terminal));
 assert.equal(terminal.receipt.observed.status,'failed');
 assert.equal(terminal.receipt.answerSha256,null);
 assert.ok(terminal.receiptBytes.length);
 assert.ok(terminal.hostReceipt);
 assert.equal(terminal.failureEvidence.childStarted,true);
 assert.equal(terminal.failureEvidence.inputSubmitted,true);
 assert.equal(terminal.course.attempts.length,1);
 assert.equal(terminal.failureEvidence.observation.answerSha256,null);
 assert.equal(terminal.report,null);
 const uncertain=advisorHostFixture(t,'empty-process'),recovery=await coordinateInitialDesignAdvisory(args(uncertain));
 assert.equal(recovery.status,'recovery-required');
 assert.equal(recovery.failureEvidence,undefined);
 assert.equal((await coordinateInitialDesignAdvisory(args(uncertain))).code,'DAC2-COURSE-ALREADY-EXISTS');
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 3) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
