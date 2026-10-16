// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.advisor-question-contract-and-final-source-binding-conflict (AC-105, ALF-C-P18-01).
// Surviving producer = design-advisory-coordinator-v2 (createInitialAdvisorContext); surviving
// validator = design-workflow-package-v2 (validateInitialAdvisorContext + validateInitialToFinalBinding),
// both on the one shared contract in design-advisor-course.mjs. The pure contract is exercised for real
// (no mocks); the real coordinator -> package answered route needs the Linux-only readiness host store.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {
  createInitialAdvisorContext,validateInitialAdvisorContext,validateInitialToFinalBinding,
  hashInitialAdvisorQuestion,buildInitialAdvisorQuestion,designAdvisorValueSha256,SOURCE_NAMES,
} from '../design-advisor-course.mjs';
import {verifyStoredDesignWorkflowPackageSignature} from '../design-workflow-approval.mjs';

const libDir=fileURLToPath(new URL('..',import.meta.url));
const repoRoot=fileURLToPath(new URL('../../../../',import.meta.url));
const lib=name=>readFileSync(join(libDir,name),'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
const H=c=>c.repeat(64),O=c=>c.repeat(40);
const INIT={commit:O('1'),tree:O('2')},REV={commit:O('3'),tree:O('4')},REV2={commit:O('5'),tree:O('6')};
const bytes=Object.fromEntries(SOURCE_NAMES.map(n=>[n,Buffer.from(`${n} initial bytes\n`)]));
const refs=b=>Object.fromEntries(SOURCE_NAMES.map(n=>[n,{path:`docs/${n}.md`,sha256:sha(b[n])}]));
const makeInitial=(over={})=>{
  const r=createInitialAdvisorContext({repoFingerprint:H('b'),featureId:'feat-x',authoringDispatchId:'author-1',initialCandidate:INIT,sources:refs(bytes),sourceBytes:bytes,reason:'risk-review',routePolicySha256:H('c'),createdAt:'2026-10-16T10:00:00.000Z',...over});
  assert.equal(r.ok,true,JSON.stringify(r));return r;
};
const worlds=()=>{
  const ctx=makeInitial(),initial=ctx.context;
  const consultation={courseId:'course-1',initialContextSha256:ctx.contextSha256,dispatch:{dispatchId:'advisor-1',queueRevision:0,candidateCommit:INIT.commit,candidateTree:INIT.tree},questionSha256:initial.questionSha256,evidenceSha256:initial.evidenceSha256,receiptSha256:H('7'),answerSha256:H('8'),reportCanonicalSha256:H('9'),proposalSetSha256:H('a')};
  const revisedBytes={...bytes,design:Buffer.from('design revised after advice\n')};
  const revisedSources=refs(revisedBytes);
  const disposition=(items=[{proposalId:'p1',decision:'adopt',rationale:'Adopt the suggestion.',revisionCommit:REV.commit}])=>({schema:'pipeline.design-advisor-disposition.v1',courseId:'course-1',consultationSha256:designAdvisorValueSha256(consultation),proposalSetSha256:consultation.proposalSetSha256,items,ownerDispatchId:'author-2',createdAt:'2026-10-16T11:00:00.000Z'});
  const revision=(over={})=>({schema:'pipeline.design-advisor-revision.v1',courseId:'course-1',seq:1,priorRevisionSha256:null,candidate:REV,sources:revisedSources,parentCommit:INIT.commit,proposalIds:['p1'],reason:'advisor-disposition',...over});
  const rev=revision();
  return {ctx,initial,consultation,disposition,revision,rev,revisedSources,
    args:(over={})=>({initial,courseId:'course-1',consultation,disposition:disposition(),revisions:[rev],final:{candidate:REV,sources:revisedSources},...over})};
};
const code=r=>r.ok?'OK':r.code;

test('AC-105 shared question: producer context and package validator use one canonical initial question',()=>{
  const {ctx,initial}=worlds();
  assert.equal(initial.questionSha256,hashInitialAdvisorQuestion({reason:'risk-review',sources:initial.sources}));
  assert.equal(validateInitialAdvisorContext(initial).ok,true);
  assert.equal(validateInitialAdvisorContext(initial,{sourceBytes:bytes}).contextSha256,ctx.contextSha256);
  const q=buildInitialAdvisorQuestion({reason:'risk-review',sources:initial.sources});
  for(const n of SOURCE_NAMES)assert.ok(q.includes(`${n}: ${initial.sources[n].path} sha256=${initial.sources[n].sha256}`),n);
  // the initial question binds the INITIAL five sources, not future revised bytes
  const revisedDesign=refs({...bytes,design:Buffer.from('later')});
  assert.notEqual(hashInitialAdvisorQuestion({reason:'risk-review',sources:revisedDesign}),initial.questionSha256);
  assert.equal(validateInitialAdvisorContext({...initial,questionSha256:hashInitialAdvisorQuestion({reason:'risk-review',sources:revisedDesign})}).code,'DAC-INITIAL-QUESTION');
  assert.equal(validateInitialAdvisorContext({...initial,reason:'architecture-tradeoff'}).code,'DAC-INITIAL-QUESTION');
  // wiring: surviving producer and validator import the shared contract and own no second question text
  const coord=lib('design-advisory-coordinator-v2.mjs'),pkg=lib('design-workflow-package-v2.mjs');
  assert.match(coord,/createInitialAdvisorContext[^\n]*from '\.\/design-advisor-course\.mjs'/u);
  assert.match(pkg,/validateInitialAdvisorContext[^\n]*from '\.\/design-advisor-course\.mjs'/u);
  assert.match(pkg,/validateInitialToFinalBinding[^\n]*from '\.\/design-advisor-course\.mjs'/u);
  for(const s of [coord,pkg])assert.doesNotMatch(s,/Compare the original user input/u);
  assert.match(coord,/questionSha256:initial\.context\.questionSha256/u);
  assert.match(pkg,/receipt\.questionSha256!==initial\.questionSha256/u);
  assert.match(lib('../scripts/design-advisory-coordinator.mjs'),/design-advisory-coordinator-v2\.mjs/u);
});

test('AC-105 unchanged sources: answered consultation with reject/defer needs no revision and validates',()=>{
  const w=worlds();
  const items=[{proposalId:'p1',decision:'reject',rationale:'Not needed.',revisionCommit:null},{proposalId:'p2',decision:'defer',rationale:'Later.',revisionCommit:null}];
  const r=validateInitialToFinalBinding(w.args({disposition:w.disposition(items),revisions:[],final:{candidate:INIT,sources:w.initial.sources}}));
  assert.equal(code(r),'OK');
  assert.equal(r.initialContextSha256,w.ctx.contextSha256);
  assert.equal(r.implementationAuthority,false);
  assert.equal(r.physicalProvenanceVerified,false);
  // an adopted proposal with no revision is not silently accepted
  const adopt=w.disposition([{proposalId:'p1',decision:'adopt',rationale:'Adopt.',revisionCommit:REV.commit}]);
  assert.equal(code(validateInitialToFinalBinding(w.args({disposition:adopt,revisions:[],final:{candidate:INIT,sources:w.initial.sources}}))),'DAC-ADOPTED-PROPOSAL-UNBOUND');
});

test('AC-105 actual revision after advice: initial binding is preserved, final binds the revised endpoint',()=>{
  const w=worlds(),r=validateInitialToFinalBinding(w.args());
  assert.equal(code(r),'OK');
  assert.equal(w.consultation.dispatch.candidateCommit,INIT.commit,'consultation stays dispatched against the initial candidate');
  assert.notEqual(w.consultation.dispatch.candidateCommit,REV.commit);
  assert.equal(r.initialContextSha256,w.ctx.contextSha256);
  // final endpoint must be the end of the revision chain (candidate and sources)
  assert.equal(code(validateInitialToFinalBinding(w.args({final:{candidate:INIT,sources:w.revisedSources}}))),'DAC-FINAL-ENDPOINT');
  assert.equal(code(validateInitialToFinalBinding(w.args({final:{candidate:REV,sources:w.initial.sources}}))),'DAC-FINAL-ENDPOINT');
  assert.equal(code(validateInitialToFinalBinding(w.args({final:{candidate:REV2,sources:w.revisedSources}}))),'DAC-FINAL-ENDPOINT');
  // never relabel the earlier answer as dispatched against the later candidate
  const relabeled={...w.consultation,dispatch:{...w.consultation.dispatch,candidateCommit:REV.commit,candidateTree:REV.tree}};
  assert.equal(code(validateInitialToFinalBinding(w.args({consultation:relabeled}))),'DAC-INITIAL-CONSULTATION');
});

test('AC-105 wrong question: consultation or context bound to another question is refused',()=>{
  const w=worlds();
  assert.equal(code(validateInitialToFinalBinding(w.args({consultation:{...w.consultation,questionSha256:H('0')}}))),'DAC-INITIAL-CONSULTATION');
  const finalStyle=sha(['final prefixed question',...SOURCE_NAMES.map(n=>`${n}: ${w.revisedSources[n].path} sha256=${w.revisedSources[n].sha256}`)].join('\n'));
  assert.equal(code(validateInitialToFinalBinding(w.args({consultation:{...w.consultation,questionSha256:finalStyle}}))),'DAC-INITIAL-CONSULTATION');
  assert.equal(code(validateInitialToFinalBinding(w.args({initial:{...w.initial,questionSha256:finalStyle}}))),'DAC-INITIAL-QUESTION');
  assert.equal(code(validateInitialToFinalBinding(w.args({consultation:{...w.consultation,evidenceSha256:H('0')}}))),'DAC-INITIAL-CONSULTATION');
});

test('AC-105 unrelated initial candidate: consultation or revision chain not rooted in the initial candidate is refused',()=>{
  const w=worlds();
  const other={...w.consultation,dispatch:{...w.consultation.dispatch,candidateCommit:O('9'),candidateTree:O('8')}};
  assert.equal(code(validateInitialToFinalBinding(w.args({consultation:other}))),'DAC-INITIAL-CONSULTATION');
  assert.equal(code(validateInitialToFinalBinding(w.args({consultation:{...w.consultation,initialContextSha256:H('0')}}))),'DAC-INITIAL-CONSULTATION');
  assert.equal(code(validateInitialToFinalBinding(w.args({consultation:{...w.consultation,dispatch:{...w.consultation.dispatch,dispatchId:'author-1'}}}))),'DAC-INITIAL-CONSULTATION','advisor dispatch must differ from authoring dispatch');
  assert.equal(code(validateInitialToFinalBinding(w.args({revisions:[w.revision({parentCommit:O('9')})]}))),'DAC-REVISION-LINK');
});

test('AC-105 forged disposition and revision chain are refused',()=>{
  const w=worlds(),ok=items=>validateInitialToFinalBinding(w.args({disposition:items}));
  const good=w.disposition();
  assert.equal(code(ok(good)),'OK');
  for(const [label,d] of [
    ['foreign consultation digest',{...good,consultationSha256:H('0')}],
    ['foreign proposal set',{...good,proposalSetSha256:H('0')}],
    ['foreign course',{...good,courseId:'course-2'}],
    ['wrong schema',{...good,schema:'pipeline.design-advisor-disposition.v0'}],
    ['adopt without revision commit',w.disposition([{proposalId:'p1',decision:'adopt',rationale:'x',revisionCommit:null}])],
    ['reject with revision commit',w.disposition([{proposalId:'p1',decision:'reject',rationale:'x',revisionCommit:REV.commit}])],
    ['duplicate proposal ids',w.disposition([{proposalId:'p1',decision:'defer',rationale:'x',revisionCommit:null},{proposalId:'p1',decision:'defer',rationale:'y',revisionCommit:null}])],
    ['unknown decision',w.disposition([{proposalId:'p1',decision:'maybe',rationale:'x',revisionCommit:null}])],
  ])assert.equal(code(ok(d)),'DAC-DISPOSITION',label);
  const swapped=w.disposition([{proposalId:'p1',decision:'adopt',rationale:'x',revisionCommit:O('9')}]);
  assert.equal(code(ok(swapped)),'DAC-REVISION-LINK','adopted commit that is not the revision candidate');
  assert.equal(code(validateInitialToFinalBinding(w.args({revisions:[w.revision({proposalIds:['invented']})]}))),'DAC-REVISION-LINK');
  assert.equal(code(validateInitialToFinalBinding(w.args({revisions:[w.revision({proposalIds:[]})]}))),'DAC-ADOPTED-PROPOSAL-UNBOUND');
  for(const over of [{seq:2},{priorRevisionSha256:H('0')},{courseId:'course-2'},{schema:'pipeline.design-advisor-revision.v0'},{reason:'invented'}])
    assert.equal(code(validateInitialToFinalBinding(w.args({revisions:[w.revision(over)]}))),'DAC-REVISION-LINK',JSON.stringify(over));
  // a no-op revision (same candidate) and a second link with a wrong prior hash are refused
  assert.equal(code(validateInitialToFinalBinding(w.args({revisions:[w.revision({candidate:INIT})]}))),'DAC-REVISION-LINK');
  const second={...w.revision({seq:2,priorRevisionSha256:H('0'),parentCommit:REV.commit,candidate:REV2,proposalIds:[],reason:'packaging-only'})};
  assert.equal(code(validateInitialToFinalBinding(w.args({revisions:[w.rev,second],final:{candidate:REV2,sources:w.revisedSources}}))),'DAC-REVISION-LINK');
  const linked={...second,priorRevisionSha256:designAdvisorValueSha256(w.rev)};
  assert.equal(code(validateInitialToFinalBinding(w.args({revisions:[w.rev,linked],final:{candidate:REV2,sources:w.revisedSources}}))),'OK','valid chain control');
});

test('AC-105 new consultation only for a new substantive course, not for packaging or incorporating the advice',()=>{
  const w=worlds();
  // advice incorporation (design changes) and readiness correction need no new consultation
  assert.equal(code(validateInitialToFinalBinding(w.args())),'OK');
  const corr=w.revision({seq:2,priorRevisionSha256:designAdvisorValueSha256(w.rev),parentCommit:REV.commit,candidate:REV2,proposalIds:[],reason:'readiness-correction',sources:refs({...bytes,design:Buffer.from('readiness fix\n')})});
  assert.equal(code(validateInitialToFinalBinding(w.args({revisions:[w.rev,corr],final:{candidate:REV2,sources:corr.sources}}))),'OK');
  // routine packaging with identical sources is fine; packaging that drifts sources is refused
  const pack=w.revision({seq:2,priorRevisionSha256:designAdvisorValueSha256(w.rev),parentCommit:REV.commit,candidate:REV2,proposalIds:[],reason:'packaging-only',sources:w.revisedSources});
  assert.equal(code(validateInitialToFinalBinding(w.args({revisions:[w.rev,pack],final:{candidate:REV2,sources:w.revisedSources}}))),'OK');
  const drift={...pack,sources:corr.sources};
  assert.equal(code(validateInitialToFinalBinding(w.args({revisions:[w.rev,drift],final:{candidate:REV2,sources:corr.sources}}))),'DAC-PACKAGING-SOURCE-DRIFT');
  // changing the original user input is an explicit new substantive course
  const newInput=w.revision({sources:{...w.revisedSources,input:{path:'docs/input.md',sha256:sha('different original input')}}});
  assert.equal(code(validateInitialToFinalBinding(w.args({revisions:[newInput],final:{candidate:REV,sources:newInput.sources}}))),'DAC-NEW-COURSE-REQUIRED');
});

test('AC-105 unavailable/no-child evidence cannot mask a broken answered route',()=>{
  const w=worlds();
  assert.equal(code(validateInitialToFinalBinding(w.args({consultation:null}))),'DAC-INITIAL-CONSULTATION');
  assert.equal(code(validateInitialToFinalBinding(w.args({disposition:null}))),'DAC-DISPOSITION');
  const pkg=lib('design-workflow-package-v2.mjs');
  assert.match(pkg,/pkg\.advisor\.status==='unavailable'\)return readUnavailablePackage/u,'unavailable branch is separately validated');
  assert.match(pkg,/a\.status!=='answered'/u,'answered branch requires status answered');
});

test('AC-105 approval modes: the stored-signature verifier admits signature records only; a chat-mode record is refused',()=>{
  for(const mode of ['chat','signature-forged','']){
    const approval={schema:'pipeline.design-workflow-package-approval.v1',mode,approvedBy:'po',approvedAt:'2026-10-16T12:00:00.000Z',packageSha256:H('1'),intentSha256:H('2'),proofSha256:null,proof:null};
    const r=verifyStoredDesignWorkflowPackageSignature({repoRoot,packagePath:'x.json',packageSha256:H('1'),featureId:'feat-x',planPath:'docs/prd.md',planSha256:H('3'),specPath:'docs/spec.md',specSha256:H('4'),approval,anchors:[]});
    assert.equal(r.ok,false,mode);assert.equal(r.code,'DWP-APPROVAL-RECORD-SHAPE',mode);
  }
});

test('AC-105 host limitation: coordinator -> package answered route and both approval modes end to end',t=>{
  if(process.platform==='win32'){
    t.skip('typed host-limitation: win32 lacks the Linux-only codex-design-readiness-host-store (CRHS-INPUT), so advisorHostFixture/readinessFixture cannot run; owner Coordinator, due 2026-10-19, run on Linux/WSL (PO decision K7): node --test plugins/pipeline-core/lib/design-workflow-package-v2.test.mjs plugins/pipeline-core/lib/design-advisory-coordinator-v2.test.mjs');
    return;
  }
  for(const f of ['design-workflow-package-v2.test.mjs','design-advisory-coordinator-v2.test.mjs']){
    const r=spawnSync(process.execPath,['--test',join(libDir,f)],{encoding:'utf8',timeout:240000});
    assert.equal(r.status,0,`${f}\n${r.stdout}\n${r.stderr}`);
  }
});

test('AC-105 meaningful: weakened scratch mirrors of the production validator accept what production refuses (RED proof)',async()=>{
  mkdirSync(join(repoRoot,'scratch'),{recursive:true});
  const dir=mkdtempSync(join(repoRoot,'scratch','ac105-mirror-'));
  try{
    const prod=lib('design-advisor-course.mjs');
    const gov=pathToFileURL(join(libDir,'governance-event.mjs')).href;
    const mutations={
      relabel:["consultation.dispatch.candidateCommit!==initial.initialCandidate.commit||",''],
      wrongQuestion:["consultation.questionSha256!==initial.questionSha256||",''],
      endpoint:["if(!same(previous.candidate,final.candidate)||!same(previous.sources,final.sources))return fail('DAC-FINAL-ENDPOINT');",''],
      unboundAdoption:["if(adopted.size!==seen.size)return fail('DAC-ADOPTED-PROPOSAL-UNBOUND');",''],
    };
    const w=worlds();
    const forgedConsultation=c=>w.args({consultation:c,disposition:{...w.disposition(),consultationSha256:designAdvisorValueSha256(c)}});
    const bad={
      relabel:forgedConsultation({...w.consultation,dispatch:{...w.consultation.dispatch,candidateCommit:REV.commit}}),
      wrongQuestion:forgedConsultation({...w.consultation,questionSha256:H('0')}),
      endpoint:w.args({final:{candidate:REV2,sources:w.revisedSources}}),
      unboundAdoption:w.args({revisions:[],final:{candidate:INIT,sources:w.initial.sources}}),
    };
    for(const [name,[from,to]] of Object.entries(mutations)){
      assert.ok(prod.includes(from),`mutation anchor present in production: ${name}`);
      const src=prod.replace(from,to).replace("from './governance-event.mjs'",`from '${gov}'`);
      assert.notEqual(src,prod);
      const file=join(dir,`${name}.mjs`);writeFileSync(file,src);
      const mirror=await import(pathToFileURL(file).href);
      assert.equal(validateInitialToFinalBinding(bad[name]).ok,false,`production refuses ${name}`);
      assert.equal(mirror.validateInitialToFinalBinding(bad[name]).ok,true,`weakened mirror accepts ${name} (case would go RED)`);
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
