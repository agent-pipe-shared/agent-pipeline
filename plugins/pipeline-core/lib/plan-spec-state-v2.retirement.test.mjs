// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import {openSync} from 'node:fs';
import * as c from './enrollment-retirement-coordinator.mjs';
import * as p from './plan-spec-state-v2.mjs';
import {registerTestCaseCompletion} from './test-case-completion.mjs';
import { devNull } from 'node:os';
const cases=[];function test(id,run){cases.push({id,name:id,run});}
const entry=slot=>c.retirementArchiveEntry({slot,path:'/fixture/'+slot,bytes:Buffer.from('old bytes '+slot),identity:{dev:'1',ino:'2'}}),input={root:'/fixture',rootIdentity:{dev:'1',ino:'2'},commonIdentity:{dev:'1',ino:'3'},scopeKey:'a'.repeat(64),barrierSha256:'b'.repeat(64),by:'fixture',at:'2026-09-29T00:00:00.000Z',entries:['state','intake','consent'].map(entry)};
await test('ERT03',()=>{const state={schema:'pipeline.state.v0',activeFeature:{id:'fixture',planPath:'specs/fixture/prd.md',phase:'implementation'},planApproved:true,planApproval:{approvedBy:'fixture',approvedAt:input.at}};assert.equal(p.derivePlanLifecycle(state).approvalCurrent,true);const result=p.retireEnrollmentPlan({state,expectedStateSha256:p.sha256CanonicalJson(state),by:'fixture',at:input.at});assert.equal(result.ok,true);assert.deepEqual(result.state.planApproval,state.planApproval);assert.equal(p.derivePlanLifecycle(result.state).approvalCurrent,false);assert.equal(p.derivePlanLifecycle({...result.state,planApproved:true}).approvalCurrent,false);});
await test('ERT04',()=>{const state={schema:'pipeline.state.v0',planApproved:true,planApproval:{approvedBy:'fixture',approvedAt:input.at}};assert.equal(p.retireEnrollmentPlan({state,expectedStateSha256:p.sha256CanonicalJson(state),by:'fixture',at:input.at}).ok,false);const empty={schema:'pipeline.state.v0'};assert.equal(p.retireEnrollmentPlan({state:empty,expectedStateSha256:p.sha256CanonicalJson(empty),by:'fixture',at:input.at}).ok,true);});

const fd=process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD===undefined?openSync(devNull,'w'):Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({cases,fd,maxBytes:Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES??'65536')});
