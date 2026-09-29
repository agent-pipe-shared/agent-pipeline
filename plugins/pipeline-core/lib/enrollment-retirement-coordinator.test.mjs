// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import {openSync} from 'node:fs';
import * as c from './enrollment-retirement-coordinator.mjs';
import * as p from './plan-spec-state-v2.mjs';
import {registerTestCaseCompletion} from './test-case-completion.mjs';
const cases=[];function test(id,run){cases.push({id,name:id,run});}
const entry=slot=>c.retirementArchiveEntry({slot,path:'/fixture/'+slot,bytes:Buffer.from('old bytes '+slot),identity:{dev:'1',ino:'2'}}),input={root:'/fixture',rootIdentity:{dev:'1',ino:'2'},commonIdentity:{dev:'1',ino:'3'},scopeKey:'a'.repeat(64),barrierSha256:'b'.repeat(64),by:'fixture',at:'2026-09-29T00:00:00.000Z',entries:['state','intake','consent'].map(entry)};
await test('ERT01',()=>{const prepared=c.prepareEnrollmentRetirement(input);assert.equal(c.validateRetirementArchive(prepared.archive),true);assert.deepEqual(Buffer.from(prepared.archive.entries[0].bytesBase64,'base64'),Buffer.from('old bytes state'));assert.notEqual(c.prepareEnrollmentRetirement({...input,barrierSha256:'c'.repeat(64)}).archive.generationSha256,prepared.archive.generationSha256);assert.equal(c.validateRetirementArchive({...prepared.archive,generationSha256:'d'.repeat(64)}),false);});
await test('ERT02',()=>{const {journal}=c.prepareEnrollmentRetirement(input);assert.equal(c.validateRetirementJournal({...journal,grant:true}),false);assert.throws(()=>c.advanceEnrollmentRetirement(journal,{phase:'pending'}));let j=journal;for(const phase of ['state-retired','intake-retired','consent-retired','pending'])j=c.advanceEnrollmentRetirement(j,{phase,postimageSha256:phase==='consent-retired'||phase==='pending'?null:'f'.repeat(64)});assert.throws(()=>c.bindEnrollmentFreshConsent(j,{retiredEnrollmentGenerationSha256:'e'.repeat(64),consent:{granted:true,at:input.at}},'a'.repeat(64)));const fresh={retiredEnrollmentGenerationSha256:j.generationSha256,consent:{granted:true,at:input.at}};const bound=c.bindEnrollmentFreshConsent(j,fresh,'a'.repeat(64));assert.equal(bound.freshIntakeSha256,'a'.repeat(64));assert.equal(j.freshIntakeSha256,null);});

const fd=process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD===undefined?openSync(process.platform==='win32'?'NUL':'/dev/null','w'):Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({cases,fd,maxBytes:Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES??'65536')});
