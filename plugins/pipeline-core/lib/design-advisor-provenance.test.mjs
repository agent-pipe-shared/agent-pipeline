// SPDX-License-Identifier: SUL-1.0
// Actual Git/blob/source checks; consultation metadata is a pure contract fixture,
// not a host/advisor result. Genuine managed-output composition is tested separately.
import assert from 'node:assert/strict';
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC10C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir, devNull} from 'node:os';
import {join} from 'node:path';
import {SOURCE_NAMES,createInitialAdvisorContext,designAdvisorValueSha256} from './design-advisor-course.mjs';
import {observeAdvisorCandidate,observeInitialAdvisorSources,verifyAdvisorRevisionProvenance} from './design-advisor-provenance.mjs';
const h=c=>c.repeat(64);
function fixture(t){
 const repoRoot=mkdtempSync(join(tmpdir(),'advisor-provenance-'));t.after(()=>rmSync(repoRoot,{recursive:true,force:true}));
 const git=args=>execFileSync('git',['-C',repoRoot,...args],{encoding:'utf8'}).trim();git(['init','-q']);git(['config','user.name','Synthetic Fixture']);git(['config','user.email','fixture@example.invalid']);
 mkdirSync(join(repoRoot,'specs'));const sourcePaths=Object.fromEntries(SOURCE_NAMES.map(n=>[n,`specs/${n}.md`]));for(const n of SOURCE_NAMES)writeFileSync(join(repoRoot,sourcePaths[n]),`# ${n}\nCommitted initial source.\n`);git(['add','specs']);git(['commit','-qm','initial source']);
 const candidate=observeAdvisorCandidate(repoRoot),start=observeInitialAdvisorSources({repoRoot,candidate,sourcePaths});assert.equal(start.ok,true);
 const initial=createInitialAdvisorContext({repoFingerprint:h('a'),featureId:'fixture',authoringDispatchId:'author-1',initialCandidate:candidate,sources:start.sources,sourceBytes:start.sourceBytes,reason:'risk-review',routePolicySha256:h('b'),createdAt:'2026-09-28T09:00:00.000Z'});assert.equal(initial.ok,true);
 const courseId='course-fixture',consultation={courseId,initialContextSha256:initial.contextSha256,dispatch:{dispatchId:'consult-1',queueRevision:0,candidateCommit:candidate.commit,candidateTree:candidate.tree},questionSha256:initial.context.questionSha256,evidenceSha256:initial.context.evidenceSha256,receiptSha256:h('c'),answerSha256:h('d'),reportCanonicalSha256:h('e'),proposalSetSha256:h('f')};
 writeFileSync(join(repoRoot,sourcePaths.design),'# design\nAdopted proposal p1: document the missing failure path.\n');git(['add','specs/design.md']);git(['commit','-qm','adopt p1']);
 const finalCandidate=observeAdvisorCandidate(repoRoot),end=observeInitialAdvisorSources({repoRoot,candidate:finalCandidate,sourcePaths});assert.equal(end.ok,true);
 const disposition={schema:'pipeline.design-advisor-disposition.v1',courseId,consultationSha256:designAdvisorValueSha256(consultation),proposalSetSha256:consultation.proposalSetSha256,items:[{proposalId:'p1',decision:'adopt',rationale:'Document the actual failure path.',revisionCommit:finalCandidate.commit}],ownerDispatchId:'author-2',createdAt:'2026-09-28T09:01:00.000Z'};
 const revisions=[{schema:'pipeline.design-advisor-revision.v1',courseId,seq:1,priorRevisionSha256:null,candidate:finalCandidate,sources:end.sources,parentCommit:candidate.commit,proposalIds:['p1'],reason:'advisor-disposition'}];
 return {repoRoot,git,sourcePaths,args:{repoRoot,initial:initial.context,courseId,consultation,disposition,revisions,final:{candidate:finalCandidate,sources:end.sources},finalSourceBytes:end.sourceBytes}};
}
test('actual revised committed design validates against unchanged initial committed blobs',t=>{const f=fixture(t);const r=verifyAdvisorRevisionProvenance(f.args);assert.equal(r.ok,true,r.code);assert.equal(r.physicalProvenanceVerified,true);assert.notEqual(r.observations[0].blobs.design.sha256,r.observations[1].blobs.design.sha256);assert.equal(r.implementationAuthority,false);});
test('forged structurally linked revision with no actual Git parent fails',t=>{const f=fixture(t);const orphan=f.git(['commit-tree',f.args.final.candidate.tree,'-m','forged ancestry fixture']);const args=structuredClone(f.args);args.finalSourceBytes=f.args.finalSourceBytes;args.revisions[0].candidate.commit=orphan;args.final.candidate.commit=orphan;args.disposition.items[0].revisionCommit=orphan;const r=verifyAdvisorRevisionProvenance(args);assert.equal(r.ok,false);assert.equal(r.code,'DAP-GIT-PARENT');});
test('actual final worktree drift cannot satisfy committed revision endpoint',t=>{const f=fixture(t);writeFileSync(join(f.repoRoot,f.sourcePaths.design),'# uncommitted drift\n');const r=verifyAdvisorRevisionProvenance(f.args);assert.equal(r.ok,false);assert.equal(r.code,'DAP-FINAL-PHYSICAL');});
test('wrong initial question rejects before ancestry can qualify any revision',t=>{const f=fixture(t);const args={...f.args,initial:{...f.args.initial,questionSha256:h('0')}};const r=verifyAdvisorRevisionProvenance(args);assert.equal(r.ok,false);assert.equal(r.code,'DAC-INITIAL-QUESTION');});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 4) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
