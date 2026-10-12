// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import { submitPlan, approveSubmittedPlan, derivePlanLifecycle, reopenPlanDesign, sha256CanonicalJson } from '../../plugins/pipeline-core/lib/plan-spec-state-v2.mjs';
import { registerTestCaseCompletion } from '../../plugins/pipeline-core/lib/test-case-completion.mjs';
const h = n => n.repeat(64);
const authority = { schema:'pipeline.po-gate-authority.v2', humanFacing:'en', sourceSha256:h('4'),runtimeSha256:h('5'),receiptSha256:h('6'),repositoryFingerprint:h('7'),planPath:'specs/unit/prd.md',planSha256:h('1'),specPath:'specs/unit/spec.md',specSha256:h('2') };
const profileSha256=h('3');
const at='2026-10-09T10:00:00.000Z';
function continuity() { return {
  schema:'pipeline.continuity.v0',featureId:'unit',revision:0,
  runtime:{humanFacingLanguage:'en',activeDuty:'Coordinator',sessionCleanup:null},
  authority:{prd:{path:authority.planPath,sha256:h('8')},spec:{path:authority.specPath,sha256:h('9')},result:null},
  queueHead:{packageId:'continuity-adoption',actionId:'review-active-feature',nextAction:'review',productRetryCount:0,environmentRerouteCount:0,dispatch:null},
  blocker:null,acknowledgedFinal:null,resume:{mode:'immediate',sourceRevision:0,reasonCode:'active-turn'},
  recovery:null,decisionTxn:null,closeTransition:null,
  capacity:{concurrencyLimit:4,reservedCriticSlots:1,reservedRecoverySlots:1,fallbackPolicy:'defer'}
}; }
function draft() { return {schema:'pipeline.state.v0',activeFeature:{id:'unit',planPath:authority.planPath,phase:'design'},planApproved:false,continuity:continuity()}; }
function submitted(state=draft(), a=authority) {
  const r=submitPlan({state,expectedStateSha256:sha256CanonicalJson(state),poGateAuthority:a,profile:'mini',profileSha256,by:'Coordinator',at});
  assert.equal(r.ok,true,JSON.stringify(r)); return r.state;
}
function approved(state=submitted(), a=authority) {
  const r=approveSubmittedPlan({state,expectedStateSha256:sha256CanonicalJson(state),expectedSubmissionSha256:derivePlanLifecycle(state).submissionSha256,poGateAuthority:a,profileSha256,by:'PO',at});
  assert.equal(r.ok,true,JSON.stringify(r)); return r.state;
}
const changed={...authority,planSha256:h('a'),specSha256:h('b')};
const observation={planSha256:changed.planSha256,specSha256:changed.specSha256,profileSha256};
function reopened() {
  const before=approved();
  const r=reopenPlanDesign({state:before,expectedStateSha256:sha256CanonicalJson(before),by:'PO',at:'2026-10-09T10:05:00.000Z'});
  assert.equal(r.ok,true,JSON.stringify(r)); return {before,r};
}
const cases=[
  {id:'RPOP001',name:'approved drift recommends reopen',run(){const s=approved();assert.equal(derivePlanLifecycle(s).status,'approved');const d=derivePlanLifecycle(s,observation);assert.equal(d.ok,false);assert.equal(d.nextAction,'reopen-design');}},
  {id:'RPOP002',name:'actual reopen releases binding and retains history',run(){const {before,r}=reopened();assert.equal(r.replay,false);assert.equal(r.state.planApproved,false);assert.equal(r.state.activeFeature.phase,'design');assert.deepEqual(r.state.planSubmission,before.planSubmission);assert.equal(r.invalidation.invalidatedSubmissionSha256,sha256CanonicalJson(before.planSubmission));assert.equal(r.invalidation.invalidatedApprovalSha256,sha256CanonicalJson(before.planApproval));assert.equal(derivePlanLifecycle(r.state,observation).status,'draft');}},
  {id:'RPOP003',name:'released draft does not repeat reopen recommendation',run(){const {r}=reopened();const d=derivePlanLifecycle(r.state,observation);assert.equal(d.ok,true);assert.equal(d.status,'draft');assert.equal(d.approvalCurrent,false);assert.equal(d.nextAction,null,'released historical submission must not recommend reopening again');}},
  {id:'RPOP004',name:'identical reopen replay preserves canonical state',run(){const {r}=reopened();const again=reopenPlanDesign({state:r.state,expectedStateSha256:sha256CanonicalJson(r.state),by:'PO',at:'2026-10-09T10:05:00.000Z'});assert.equal(again.ok,true);assert.equal(again.replay,true);assert.equal(sha256CanonicalJson(again.state),sha256CanonicalJson(r.state));}},
  {id:'RPOP005',name:'fresh submission is unapproved and fresh approved drift reopens',run(){const {r}=reopened();const s=submitted(r.state,changed);assert.equal(s.planApproved,false);assert.equal(derivePlanLifecycle(s,observation).status,'awaiting-approval');const a=approved(s,changed);assert.equal(derivePlanLifecycle(a,observation).status,'approved');assert.equal(derivePlanLifecycle(a,{...observation,planSha256:h('c')}).nextAction,'reopen-design');}},
  {id:'RPOP006',name:'malformed authority and stale state remain refused',run(){const s=approved();assert.equal(reopenPlanDesign({state:s,expectedStateSha256:h('0'),by:'PO',at}).ok,false);assert.equal(derivePlanLifecycle({...s,planSubmission:{...s.planSubmission,planSha256:'invalid'}}).ok,false);assert.equal(submitPlan({state:draft(),expectedStateSha256:sha256CanonicalJson(draft()),poGateAuthority:{...authority,planSha256:'invalid'},profile:'mini',profileSha256,by:'Coordinator',at}).ok,false);}}
].map(c=>({...c,mode:'run'}));
registerTestCaseCompletion({cases,fd:3,maxBytes:32768});
