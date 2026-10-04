// SPDX-License-Identifier: SUL-1.0
/** Actual initial consultation controller. No final PO decision or implementation authority. */
import {resolve} from 'node:path';
import {resolvePoGateRepositoryTopology,derivePoGateRepositoryFingerprint} from './po-gate-authority.mjs';
import {loadRunnerProfilesV3Registry} from './runner-profiles-v3.mjs';
import {SOURCE_NAMES,createInitialAdvisorContext,designAdvisorValueSha256,freezeCourseJson,exactCourseObject} from './design-advisor-course.mjs';
import {createDesignAdvisorCourseStore,readCurrentDesignAdvisorCourseWithInitialContext} from './design-advisor-course-store.mjs';
import {observeAdvisorCandidate,observeInitialAdvisorSources} from './design-advisor-provenance.mjs';
import {isCodexAdvisorExecution,getCodexAdvisorExecutionAdmission} from './codex-advisor-execution.mjs';
import {isNativeInitialAdvisorExecution,nativeInitialAdvisorRunner,nativeInitialAdvisorNoChildRoute} from './native-initial-advisor-execution.mjs';
const fail=code=>({ok:false,status:'refused',code,implementationAuthority:false});
function same(a,b){return designAdvisorValueSha256(a)===designAdvisorValueSha256(b);}
export async function coordinateInitialDesignAdvisory({repoRoot,featureId,authoringDispatchId,sources,reason='architecture-tradeoff',profile='epic',runner='codex',dispatch,route,hostExecution,now=()=>new Date().toISOString(),observeInitialCourseDecision,newCourseParentId=null}={}){
 // All ordinary input is detached before the first await. Executable/controller
 // capabilities are separately branded; public JSON cannot supply host authority.
 let input;try{input=freezeCourseJson({repoRoot:resolve(repoRoot),featureId,authoringDispatchId,sources,reason,profile,runner,dispatch,route,newCourseParentId});}catch{return fail('DAC2-INPUT');}
 const native=isNativeInitialAdvisorExecution(hostExecution);
 if(!(input.runner==='codex'&&isCodexAdvisorExecution(hostExecution))&&!(native&&nativeInitialAdvisorRunner(hostExecution)===input.runner))return fail('DAC2-HOST-CAPABILITY');
 const candidate=observeAdvisorCandidate(input.repoRoot);
 if(candidate.commit!==input.dispatch?.candidateCommit||candidate.tree!==input.dispatch?.candidateTree||input.dispatch.dispatchId===input.authoringDispatchId)return fail('DAC2-INITIAL-CANDIDATE');
 // This gate runs before initial source contents, canonical question or evidence
 // are built. Source references are declarations checked physically afterwards.
 const admitted=await hostExecution.admitSourceMetadata({candidate,sources:input.sources,featureId:input.featureId,profile:input.profile,reason:input.reason,dispatch:input.dispatch,route:input.route});
 const admission=native?hostExecution.getAdmission():getCodexAdvisorExecutionAdmission(hostExecution);
 if(admitted?.status!=='admitted'||admission?.status!=='admitted')return {ok:false,status:admitted?.status??'unavailable',code:admitted?.code??'DAC2-EXPORT-NOT-ADMITTED',implementationAuthority:false};
 if(!same(observeAdvisorCandidate(input.repoRoot),candidate))return fail('DAC2-METADATA-DRIFT');
 if(!exactCourseObject(input.sources,SOURCE_NAMES))return fail('DAC2-SOURCE-REFERENCES');
 const sourcePaths=Object.fromEntries(SOURCE_NAMES.map(n=>[n,input.sources[n].path]));
 const physical=observeInitialAdvisorSources({repoRoot:input.repoRoot,candidate,sourcePaths});if(!physical.ok)return physical;
 if(!same(physical.sources,input.sources))return fail('DAC2-SOURCE-DECLARATION');
 let topology;try{topology=resolvePoGateRepositoryTopology(input.repoRoot);}catch{return fail('DAC2-TOPOLOGY');}
 const repoFingerprint=derivePoGateRepositoryFingerprint(topology),registry=loadRunnerProfilesV3Registry();
 const initial=createInitialAdvisorContext({repoFingerprint,featureId:input.featureId,authoringDispatchId:input.authoringDispatchId,initialCandidate:candidate,sources:physical.sources,sourceBytes:physical.sourceBytes,reason:input.reason,routePolicySha256:designAdvisorValueSha256(registry),createdAt:now()});if(!initial.ok)return initial;
 const store=createDesignAdvisorCourseStore({gitCommonDir:topology.gitCommonDir,repoFingerprint,featureId:input.featureId,runner:input.runner,registry,
  observeInitialContext:context=>{const read=observeInitialAdvisorSources({repoRoot:input.repoRoot,candidate:context.initialCandidate,sourcePaths:Object.fromEntries(SOURCE_NAMES.map(n=>[n,context.sources[n].path]))});return read.ok&&same(read.sources,context.sources)?{status:'verified',contextSha256:designAdvisorValueSha256(context)}:{status:'unavailable',code:'DAC2-INITIAL-SOURCE-DRIFT'};},
  observeCourseDecision:observeInitialCourseDecision,
  observeNoChild:binding=>hostExecution.observeNoChild(binding),
  hostStore:hostExecution.courseHostStore,
 });
 const existing=store.readCurrent();
 if(existing.status!=='absent'&&!(existing.status==='reuse-terminal'&&input.newCourseParentId===existing.courseId&&typeof observeInitialCourseDecision==='function')){
  // Even a new dispatch/candidate cannot mint another cycle. A spent/uncertain
  // course is reused/recovered by its controller, never automatically reopened.
  return {ok:false,status:existing.status,code:'DAC2-COURSE-ALREADY-EXISTS',course:existing,implementationAuthority:false};
 }
 if(existing.status==='absent'&&input.newCourseParentId!==null)return fail('DAC2-NEW-COURSE-PARENT');
 const opened=existing.status==='absent'?await store.openInitialCourse({initialContext:initial.context}):await store.openNewCourse({initialContext:initial.context,parentCourseId:input.newCourseParentId});
 if(opened.status!=='available')return {ok:false,status:opened.status,code:opened.code??'DAC2-COURSE-OPEN',implementationAuthority:false};
 const reserved=store.reserveCycle({courseId:opened.courseId,initialContextSha256:initial.contextSha256});
 if(reserved.status!=='reserved'||!reserved.token)return {ok:false,status:reserved.status,code:reserved.code??'DAC2-CYCLE-RESERVATION',implementationAuthority:false};
 const slot=native?nativeInitialAdvisorNoChildRoute({runner:input.runner,registry}):reserved.slots[0];if(!slot)return fail('DAC2-REGISTERED-SLOT');
 const courseBinding=freezeCourseJson({courseId:opened.courseId,initialContextSha256:initial.contextSha256,reservationId:reserved.reservationId,slot:slot.slot,routeStepSha256:slot.routeStepSha256});
 const args={initialContext:initial.context,dispatch:input.dispatch,profile:input.profile,reason:input.reason,route:input.route,courseBinding};
 const preparedResult=await hostExecution.prepareInitial(args),prepared=preparedResult?.preparedRequest;
 if(!preparedResult?.ok||!prepared||typeof prepared.requestSha256!=='string'){
  const terminal=await store.finalizeNoChild(reserved.token);
  if(terminal.status==='reuse-terminal')return {ok:false,status:'unavailable-pending-final-approval',code:preparedResult?.code??'DAC2-NO-CHILD',initialContext:initial.context,courseBinding,course:terminal,failureEvidence:freezeCourseJson({schema:'pipeline.design-advisor-failure.v1',courseBinding,outcome:terminal.outcome,code:terminal.terminalObservation.code,phase:'preparation',childStarted:false,inputSubmitted:false,attemptCount:0,observation:terminal.terminalObservation}),hostReceipt:null,receipt:null,report:null,implementationAuthority:false};
  return {ok:false,status:'recovery-required',code:preparedResult?.code??'DAC2-PREPARE-UNCERTAIN',courseBinding,implementationAuthority:false};
 }
 const attempt=store.reserveAttempt(reserved.token,{slot:slot.slot,routeStepSha256:slot.routeStepSha256,dispatch:input.dispatch,requestSha256:prepared.requestSha256});
 if(attempt.status!=='attempt-reserved'||!same(attempt.courseBinding,courseBinding))return {ok:false,status:attempt.status,code:attempt.code??'DAC2-ATTEMPT-RESERVATION',implementationAuthority:false};
 let executed;try{executed=await hostExecution.executeInitial(args,prepared);}catch{return {ok:false,status:'recovery-required',code:'DAC2-EXECUTION-UNCERTAIN',courseBinding,implementationAuthority:false};}
 if(!executed?.hostReceipt)return {ok:false,status:'recovery-required',code:executed?.code??'DAC2-HOST-RECEIPT-ABSENT',courseBinding,implementationAuthority:false};
 const attemptFinalized=await store.finalizeAttempt(reserved.token,{hostReceipt:executed.hostReceipt});if(attemptFinalized.status!=='attempt-finalized')return {ok:false,status:attemptFinalized.status,code:attemptFinalized.code??'DAC2-ATTEMPT-FINALIZATION',implementationAuthority:false};
 const terminal=await store.finalizeCycle(reserved.token,{hostReceipt:executed.hostReceipt});
 if(terminal.status!=='reuse-terminal')return {ok:false,status:terminal.status,code:terminal.code??'DAC2-NO-USABLE-ANSWER',courseBinding,implementationAuthority:false};
 if(terminal.outcome!=='answered'){
  if(terminal.outcome!=='failed'||executed.receipt?.observed.status!=='failed'||!executed.receiptBytes||executed.failureEvidence?.attemptCount!==terminal.attempts.length)return fail('DAC2-FAILURE-PROJECTION');
  return {ok:false,status:'unavailable-pending-final-approval',code:executed.code??'DAC2-NO-USABLE-ANSWER',initialContext:initial.context,courseBinding,hostReceipt:executed.hostReceipt,receipt:executed.receipt,receiptBytes:Buffer.from(executed.receiptBytes),report:null,course:terminal,failureEvidence:freezeCourseJson({schema:'pipeline.design-advisor-failure.v1',courseBinding,...executed.failureEvidence,observation:terminal.terminalObservation}),implementationAuthority:false};
 }
 const report=executed.report,receipt=executed.receipt;if(!report||!receipt)return fail('DAC2-ANSWER-PROJECTION');
 const consultation=freezeCourseJson({courseId:opened.courseId,initialContextSha256:initial.contextSha256,dispatch:input.dispatch,questionSha256:initial.context.questionSha256,evidenceSha256:initial.context.evidenceSha256,receiptSha256:terminal.terminalObservation.advisoryReceipt.sha256,answerSha256:terminal.terminalObservation.answerSha256,reportCanonicalSha256:terminal.terminalObservation.reportCanonicalSha256,proposalSetSha256:terminal.terminalObservation.proposalSetSha256});
 return {ok:true,status:'answered',schema:'pipeline.design-advisory-coordinator-result.v2',initialContext:initial.context,courseBinding,consultation,receipt,receiptBytes:Buffer.from(executed.receiptBytes),report,hostReceipt:executed.hostReceipt,course:terminal,implementationAuthority:false};
}
/** Operator hotfix 4: re-derive, with no child, no write and no new cycle, the exact first-run no-child
 * export inputs of a terminal native (Claude/Antigravity) course from the private store. null = not
 * applicable (the caller keeps its refusal); a refusal never fabricates bytes the store does not hold. */
export function rederiveNativeNoChildAdvisory({repoRoot,featureId,authoringDispatchId,sources,runner,existing}={}){
 if(!['claude','antigravity'].includes(runner)||existing?.status!=='reuse-terminal'||existing.outcome!=='unavailable'||!Array.isArray(existing.attempts)||existing.attempts.length!==0)return null;
 let topology;try{topology=resolvePoGateRepositoryTopology(resolve(repoRoot));}catch{return fail('DAC2-TOPOLOGY');}
 const repoFingerprint=derivePoGateRepositoryFingerprint(topology),registry=loadRunnerProfilesV3Registry();
 const read=readCurrentDesignAdvisorCourseWithInitialContext({gitCommonDir:topology.gitCommonDir,repoFingerprint,featureId,runner,registry});
 if(read.status!=='reuse-terminal'||read.courseId!==existing.courseId||read.stateSha256!==existing.stateSha256||read.outcome!=='unavailable'||!Array.isArray(read.attempts)||read.attempts.length!==0)return fail('DAC2-REEXPORT-STORE-DRIFT');
 const initialContext=read.initialContext,o=read.terminalObservation;
 if(designAdvisorValueSha256(initialContext)!==read.initialContextSha256||!exactCourseObject(o,['courseBinding','outcome','code','childStarted','inputSubmitted','attemptCount'])||!same(o.courseBinding,{courseId:read.courseId,initialContextSha256:read.initialContextSha256,reservationId:read.reservationId})||o.outcome!==read.outcome||o.childStarted!==false||o.inputSubmitted!==false||o.attemptCount!==0)return fail('DAC2-REEXPORT-NOT-NO-CHILD');
 if(initialContext.featureId!==featureId||initialContext.authoringDispatchId!==authoringDispatchId||!same(initialContext.sources,sources))return fail('DAC2-REEXPORT-SOURCE-DRIFT');
 if(initialContext.routePolicySha256!==designAdvisorValueSha256(registry))return fail('DAC2-REEXPORT-ROUTE-POLICY');
 const candidate=observeAdvisorCandidate(resolve(repoRoot));
 if(candidate.commit!==initialContext.initialCandidate.commit||candidate.tree!==initialContext.initialCandidate.tree)return {...fail('DAC2-REEXPORT-CANDIDATE-DRIFT'),initialCandidate:initialContext.initialCandidate,candidate};
 const slot=nativeInitialAdvisorNoChildRoute({runner,registry});if(!slot)return fail('DAC2-REGISTERED-SLOT');
 const courseBinding=freezeCourseJson({courseId:read.courseId,initialContextSha256:read.initialContextSha256,reservationId:read.reservationId,slot:slot.slot,routeStepSha256:slot.routeStepSha256});
 return {ok:false,status:'unavailable-pending-final-approval',code:o.code,initialContext,courseBinding,course:existing,failureEvidence:freezeCourseJson({schema:'pipeline.design-advisor-failure.v1',courseBinding,outcome:read.outcome,code:o.code,phase:'preparation',childStarted:false,inputSubmitted:false,attemptCount:0,observation:o}),hostReceipt:null,receipt:null,report:null,rederived:true,implementationAuthority:false};
}
