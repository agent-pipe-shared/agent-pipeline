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
import {execFileSync} from 'node:child_process';
import {createHash,generateKeyPairSync,sign as cryptoSign} from 'node:crypto';
import {createPoApprovalIntent,canonical as canonicalJson} from '../po-approval-proof.mjs';
import {
  createInitialAdvisorContext,validateInitialAdvisorContext,validateInitialToFinalBinding,
  hashInitialAdvisorQuestion,buildInitialAdvisorQuestion,designAdvisorValueSha256,SOURCE_NAMES,
} from '../design-advisor-course.mjs';
import {verifyStoredDesignWorkflowPackageSignature,createDesignWorkflowPackageApprovalRequest,verifyDesignWorkflowPackageApproval} from '../design-workflow-approval.mjs';

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

test('AC-105 approval modes: signature-mode success - a validly signed approval record over a real answered v2 package verifies; drift is refused',()=>{
  mkdirSync(join(repoRoot,'scratch'),{recursive:true});
  const dir=mkdtempSync(join(repoRoot,'scratch','ac105-sig-'));
  try{
    const w=worlds();
    mkdirSync(join(dir,'docs'),{recursive:true});
    const prdBytes=Buffer.from('prd bytes\n'),specBytes=Buffer.from('spec bytes\n');
    writeFileSync(join(dir,'docs/prd.md'),prdBytes);writeFileSync(join(dir,'docs/spec.md'),specBytes);
    const sources={...w.revisedSources,prd:{path:'docs/prd.md',sha256:sha(prdBytes)},spec:{path:'docs/spec.md',sha256:sha(specBytes)}};
    const pkg={schema:'pipeline.design-workflow-package.v2',featureId:'feat-x',authoringDispatchId:'author-2',candidate:REV,sources,
      advisor:{status:'answered',runner:'codex',profile:'feature',route:{model:'gpt-x',effort:'high',sourceSha256:H('d'),candidateCommit:INIT.commit},
        initialContext:{path:'ev/initial.json',sha256:w.ctx.contextSha256},
        courseBinding:{courseId:'course-1',initialContextSha256:w.ctx.contextSha256,reservationId:'res-1',slot:1,routeStepSha256:H('e')},
        consultation:w.consultation,hostReceipt:{id:'hr-1',sha256:H('f')},receipt:{path:'ev/receipt.json',sha256:H('7')},report:{path:'ev/report.json',sha256:H('9')},
        disposition:w.disposition(),revisions:[w.rev]},
      readiness:{path:'ev/readiness.json',sha256:H('a'),dispatchId:'ready-1'},createdAt:'2026-10-16T11:30:00.000Z'};
    const pkgBytes=Buffer.from(JSON.stringify(pkg));
    writeFileSync(join(dir,'package.json'),pkgBytes);
    const packageSha256=sha(pkgBytes);
    const intent=createPoApprovalIntent({kind:'design-workflow-package',featureId:'feat-x',planSha256:pkg.sources.prd.sha256,specSha256:pkg.sources.spec.sha256,candidate:REV,policyRevision:'design-workflow-package-v2',subjectSha256:packageSha256,decision:'approve'});
    const {publicKey,privateKey}=generateKeyPairSync('ed25519');
    const publicKeyPem=publicKey.export({type:'spki',format:'pem'});
    const keyReference='po-test-key';
    const proof={schema:'pipeline.po-approval-proof.v1',intentSha256:intent.sha256,keyReference,publicKey:publicKeyPem,signatureBase64:cryptoSign(null,Buffer.from(intent.sha256,'utf8'),privateKey).toString('base64')};
    const anchors=[{keyReference,publicKeySha256:sha(publicKeyPem)}];
    const approval={schema:'pipeline.design-workflow-package-approval.v1',mode:'signature',approvedBy:`verified:${keyReference}`,approvedAt:'2026-10-16T12:00:00.000Z',packageSha256,intentSha256:intent.sha256,proofSha256:sha(canonicalJson(proof)),proof};
    const run=(over={})=>verifyStoredDesignWorkflowPackageSignature({repoRoot:dir,packagePath:'package.json',packageSha256,featureId:'feat-x',planPath:'docs/prd.md',planSha256:pkg.sources.prd.sha256,specPath:'docs/spec.md',specSha256:pkg.sources.spec.sha256,approval,anchors,...over});
    const ok=run();
    assert.equal(ok.ok,true,JSON.stringify(ok));
    assert.equal(ok.code,'DWP-APPROVAL-STORED-SIGNATURE-VERIFIED');
    assert.equal(ok.intentSha256,intent.sha256);
    assert.equal(ok.signer.keyReference,keyReference);
    // controls: each drift is refused, so the success is not a vacuous accept
    assert.equal(run({anchors:[{keyReference,publicKeySha256:H('0')}]}).ok,false,'foreign trust anchor');
    assert.equal(run({approval:{...approval,approvedBy:'verified:someone-else'}}).code,'DWP-APPROVAL-RECORD-DRIFT');
    assert.equal(run({approval:{...approval,intentSha256:H('0')}}).code,'DWP-APPROVAL-INTENT-DRIFT');
    assert.equal(run({approval:{...approval,proof:{...proof,signatureBase64:Buffer.alloc(64).toString('base64')}}}).ok,false,'forged signature');
    assert.equal(run({packageSha256:H('0')}).ok,false,'package digest drift');
    writeFileSync(join(dir,'docs/spec.md'),Buffer.from('spec changed\n'));
    assert.equal(run().code,'DWP-APPROVAL-SOURCE-DRIFT','source bytes changed after approval');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('AC-105 host limitation: coordinator -> package answered route and both approval modes end to end',async t=>{
  if(process.platform==='win32'){
    t.skip('typed host-limitation: win32 lacks the Linux-only codex-design-readiness-host-store (CRHS-INPUT), so advisorHostFixture/readinessFixture cannot run; owner Coordinator, due 2026-10-19, run on Linux/WSL (PO decision K7): node --test plugins/pipeline-core/lib/pins/advisor-question-contract-and-final-source-binding-conflict.test.mjs');
    return;
  }
  // The real route, driven here and not by spawning other suites: managed Advisor host -> coordinateInitialDesignAdvisory (answered)
  // -> advised committed revision -> fresh final Readiness -> v2 package reader -> approval request/signature. Loaded lazily so the
  // pure-contract cases above keep loading on a host without the Linux-only readiness store.
  const {advisorHostFixture}=await import('../codex-advisor-host.fixture.mjs');
  const {readinessFixture}=await import('../codex-readiness-finalization.fixture.mjs');
  const {runCodexToolFreeDesignReadiness}=await import('../codex-tool-free-design-readiness.mjs');
  const {verifyDesignReadinessHostExecution}=await import('../design-readiness-host-evidence.mjs');
  const {coordinateInitialDesignAdvisory}=await import('../design-advisory-coordinator-v2.mjs');
  const {readDesignWorkflowPackageV2FromRepository,readDesignReadinessPreparationFromRepository}=await import('../design-workflow-package-v2.mjs');
  const {runIsolatedStructuredHost}=await import('../codex-isolated-structured-host.mjs');
  const {observeAdvisorCandidate,observeInitialAdvisorSources}=await import('../design-advisor-provenance.mjs');
  const {canonicalJson:cj}=await import('../codex-sandbox-compatibility.mjs');
  const {readApprovedDesignWorkflowPackage}=await import('../design-workflow-package.mjs');
  const f=advisorHostFixture(t),rp=readinessFixture(t);
  const readinessInputs=join(f.root,'.git','agent-pipeline','design-readiness-inputs',f.repoFingerprint);mkdirSync(readinessInputs,{recursive:true,mode:0o700});
  const readinessInput=mkdtempSync(join(readinessInputs,'input-'));writeFileSync(join(readinessInput,'app-server'),readFileSync(join(rp.input,'app-server')));
  const git=a=>execFileSync('git',['-C',f.root,...a],{encoding:'utf8',timeout:10000}).trim();
  const sourcePaths=Object.fromEntries(Object.entries(f.sources).map(([name,s])=>[name,s.path]));
  const consultation=await coordinateInitialDesignAdvisory({repoRoot:f.root,featureId:'advisor-feature',authoringDispatchId:'elephant-author',sources:f.sources,reason:'risk-review',profile:'feature',dispatch:f.args.dispatch,route:f.route,hostExecution:f.execution});
  assert.equal(consultation.ok,true,JSON.stringify(consultation));
  assert.equal(consultation.status,'answered');
  mkdirSync(join(f.root,'evidence'));
  const publish=(name,bytes)=>{const path=`evidence/${name}`;writeFileSync(join(f.root,path),bytes);return {path,sha256:sha(bytes)};};
  const initialRef=publish('initial.json',JSON.stringify(consultation.initialContext)+'\n'),receiptRef=publish('advisor.json',consultation.receiptBytes),reportRef=publish('advisor-report.json',cj(consultation.report));
  const advisor=over=>({status:'answered',runner:'codex',profile:'feature',route:f.route,initialContext:initialRef,courseBinding:consultation.courseBinding,consultation:consultation.consultation,hostReceipt:consultation.hostReceipt,receipt:receiptRef,report:reportRef,...over});
  const disposition=(decision,revisionCommit)=>({schema:'pipeline.design-advisor-disposition.v1',courseId:consultation.courseBinding.courseId,consultationSha256:designAdvisorValueSha256(consultation.consultation),proposalSetSha256:consultation.consultation.proposalSetSha256,items:[{proposalId:'proposal-1',decision,rationale:'Recorded disposition of the actual Advisor proposal.',revisionCommit}],ownerDispatchId:'author-revision',createdAt:new Date().toISOString()});
  const preparationOf=(candidate,sources,adv)=>({schema:'pipeline.design-readiness-preparation.v2',featureId:'advisor-feature',authoringDispatchId:'elephant-author',candidate,sources,advisor:adv,createdAt:new Date().toISOString()});
  const readPreparation=path=>readDesignReadinessPreparationFromRepository({repoRoot:f.root,packagePath:path,trustedAdvisorExecutablePath:process.execPath});
  // Unchanged sources are measured while HEAD is still the initial candidate (reject: no revision; adopt without a revision: refused).
  const initialObserved=observeInitialAdvisorSources({repoRoot:f.root,candidate:f.candidate,sourcePaths});assert.equal(initialObserved.ok,true,JSON.stringify(initialObserved));
  const unchangedPreparation=preparationOf(f.candidate,initialObserved.sources,advisor({disposition:disposition('reject',null),revisions:[]}));
  publish('preparation-unchanged.json',cj(unchangedPreparation));
  const unchanged=readPreparation('evidence/preparation-unchanged.json');
  publish('preparation-adopt-unbound.json',cj(preparationOf(f.candidate,initialObserved.sources,advisor({disposition:disposition('adopt',f.candidate.commit),revisions:[]}))));
  const adoptUnbound=readPreparation('evidence/preparation-adopt-unbound.json');
  // Actual revision after advice, then fresh independent final Readiness over the revised candidate.
  writeFileSync(join(f.root,'design.md'),'Synthetic revised design adopting proposal-1.\n');git(['add','design.md']);git(['commit','-qm','adopt actual managed Advisor proposal']);
  const finalCandidate=observeAdvisorCandidate(f.root);
  const final=observeInitialAdvisorSources({repoRoot:f.root,candidate:finalCandidate,sourcePaths});assert.equal(final.ok,true,JSON.stringify(final));
  const finalRoute={...f.route,candidateCommit:finalCandidate.commit};
  const adopted=disposition('adopt',finalCandidate.commit);
  const revision={schema:'pipeline.design-advisor-revision.v1',courseId:consultation.courseBinding.courseId,seq:1,priorRevisionSha256:null,candidate:finalCandidate,sources:final.sources,parentCommit:f.candidate.commit,proposalIds:['proposal-1'],reason:'advisor-disposition'};
  const preparation=preparationOf(finalCandidate,final.sources,advisor({disposition:adopted,revisions:[revision]}));
  publish('preparation.json',cj(preparation));
  const prepared=readPreparation('evidence/preparation.json');assert.equal(prepared.ok,true,JSON.stringify(prepared));
  const ready=await runCodexToolFreeDesignReadiness({repoRoot:f.root,repoFingerprint:f.repoFingerprint,codexPath:process.execPath,store:f.store,dispatchId:'final-readiness',candidate:finalCandidate,sources:final.sources,route:finalRoute,inputDirectory:readinessInput,advisorObservation:prepared.advisorObservation,
    invokeHost:input=>{assert.ok(input.prompt.includes(cj(prepared.advisorObservation)));assert.equal(input.readinessAdvisorObservation.report.answer,consultation.report.answer);assert.deepEqual(input.readinessAdvisorObservation.advisor.disposition,adopted);return runIsolatedStructuredHost(input);},readCandidate:()=>observeAdvisorCandidate(f.root),readCommittedSource:(_root,commit,path)=>Buffer.from(execFileSync('git',['-C',f.root,'show',`${commit}:${path}`],{timeout:10000}))});
  assert.equal(ready.status,'reviewed',JSON.stringify(ready));
  const readyRef=publish('readiness.json',cj(ready.report));
  const pkg={...preparation,schema:'pipeline.design-workflow-package.v2',readiness:{...readyRef,dispatchId:'final-readiness'}};
  const packagePath='evidence/package.json',save=p=>writeFileSync(join(f.root,packagePath),JSON.stringify(p)+'\n');
  const verifyReadinessExecution=input=>verifyDesignReadinessHostExecution({...input,resolveRoute:()=>({state:'default',runner:'codex',...finalRoute}),resolveCodexExecutable:()=>process.execPath});
  const args={repoRoot:f.root,packagePath,trustedAdvisorExecutablePath:process.execPath,verifyReadinessExecution};
  const read=(p=pkg,over={})=>{save(p);return readDesignWorkflowPackageV2FromRepository({...args,...over});};
  const refused=(r,label)=>{assert.equal(r.ok,false,`${label}: ${JSON.stringify(r).slice(0,300)}`);assert.equal(r.implementationAuthority??false,false,label);return r.code;};

  const EXPECTED=[
    'revision after advice: the answered consultation stays on the initial candidate and the revised final package is admitted',
    'unchanged sources: reject disposition without revision is admitted, adopt without a revision is refused',
    'wrong question: a consultation bound to another question is refused by the package reader',
    'unrelated candidate: a consultation or revision chain not rooted in the initial candidate is refused',
    'forged chain: invented proposal, forged revision link and changed disposition are refused',
    'approval mode signature: request, proof, stored record and later-boundary reader accept the real answered package; drift is refused',
    'approval mode chat: a chat attestation over the same real package is refused and never grants authority',
  ];
  const passed=[];
  const sub=(name,fn)=>t.test(name,async st=>{await fn(st);passed.push(name);});
  await sub(EXPECTED[0],()=>{
    const ok=read();assert.equal(ok.ok,true,JSON.stringify(ok));
    assert.equal(ok.implementationAuthority,false);assert.equal(ok.approvalReview.approvalStatus,'pending-po-approval');
    assert.equal(consultation.consultation.dispatch.candidateCommit,f.candidate.commit,'consultation stays dispatched against the initial candidate');
    assert.notEqual(ok.candidate.commit,f.candidate.commit);assert.deepEqual(ok.candidate,finalCandidate);
    assert.equal(consultation.consultation.questionSha256,consultation.initialContext.questionSha256);
    assert.equal(consultation.initialContext.questionSha256,hashInitialAdvisorQuestion({reason:'risk-review',sources:consultation.initialContext.sources}));
    assert.deepEqual(consultation.initialContext.initialCandidate,f.candidate);
  });
  await sub(EXPECTED[1],()=>{
    assert.equal(unchanged.ok,true,JSON.stringify(unchanged));
    assert.deepEqual(unchangedPreparation.candidate,f.candidate);assert.deepEqual(unchangedPreparation.sources,consultation.initialContext.sources);
    assert.equal(refused(adoptUnbound,'adopt without revision').length>0,true);
  });
  await sub(EXPECTED[2],()=>{
    const zero=structuredClone(pkg);zero.advisor.consultation.questionSha256='0'.repeat(64);refused(read(zero),'zero question');
    const finalStyle=structuredClone(pkg);finalStyle.advisor.consultation.questionSha256=sha(['final prefixed question',...SOURCE_NAMES.map(n=>`${n}: ${final.sources[n].path} sha256=${final.sources[n].sha256}`)].join('\n'));refused(read(finalStyle),'final-source question');
  });
  await sub(EXPECTED[3],()=>{
    const relabeled=structuredClone(pkg);relabeled.advisor.consultation.dispatch.candidateCommit=finalCandidate.commit;relabeled.advisor.consultation.dispatch.candidateTree=finalCandidate.tree;refused(read(relabeled),'relabeled to the later candidate');
    const foreign=structuredClone(pkg);foreign.advisor.consultation.dispatch.candidateCommit=O('9');refused(read(foreign),'foreign dispatch candidate');
    const orphan=git(['commit-tree',finalCandidate.tree,'-m','orphan ancestry fixture']);
    const badAncestry=structuredClone(pkg);badAncestry.candidate.commit=orphan;badAncestry.advisor.revisions[0].candidate.commit=orphan;badAncestry.advisor.disposition.items[0].revisionCommit=orphan;
    assert.equal(refused(read(badAncestry,{requireCurrentCandidate:false}),'orphan ancestry'),'DAP-GIT-PARENT');
  });
  await sub(EXPECTED[4],()=>{
    const invented=structuredClone(pkg);invented.advisor.disposition.items[0].proposalId='invented-proposal';invented.advisor.revisions[0].proposalIds=['invented-proposal'];
    assert.equal(refused(read(invented),'invented proposal'),'DWP2-PROPOSAL-DISPOSITION');
    const seq=structuredClone(pkg);seq.advisor.revisions[0].seq=2;refused(read(seq),'forged revision seq');
    const link=structuredClone(pkg);link.advisor.revisions[0].priorRevisionSha256='0'.repeat(64);refused(read(link),'forged prior revision digest');
    const material=structuredClone(pkg);material.advisor.disposition.items[0].rationale='A changed, still valid disposition.';refused(read(material),'material disposition change needs fresh readiness');
  });
  save(pkg);
  const boundSet=[packagePath,readyRef.path,initialRef.path,receiptRef.path,reportRef.path];
  git(['add','--',...boundSet]);git(['commit','-qm','commit the design package and the artifacts it digests']);
  const approvalInput={...args,featureId:pkg.featureId,planPath:final.sources.prd.path,planSha256:final.sources.prd.sha256,specPath:final.sources.spec.path,specSha256:final.sources.spec.sha256,readCandidate:()=>observeAdvisorCandidate(f.root)};
  const requested=createDesignWorkflowPackageApprovalRequest(approvalInput);
  await sub(EXPECTED[5],()=>{
    assert.equal(requested.ok,true,JSON.stringify(requested));
    assert.equal(requested.request.advisorException,undefined,'an answered package carries no Advisor exception');
    const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'pem'}).toString(),keyReference='ac105-answered-po',anchors=[{keyReference,publicKeySha256:sha(Buffer.from(publicKey))}];
    const proof={schema:'pipeline.po-approval-proof.v1',intentSha256:requested.request.approvalIntent.sha256,keyReference,publicKey,signatureBase64:cryptoSign(null,Buffer.from(requested.request.approvalIntent.sha256),keys.privateKey).toString('base64')};
    const verified=verifyDesignWorkflowPackageApproval({...approvalInput,request:requested.request,anchors,proof});assert.equal(verified.ok,true,JSON.stringify(verified));
    const stored={schema:'pipeline.design-workflow-package-approval.v1',mode:'signature',approvedBy:`verified:${keyReference}`,approvedAt:new Date().toISOString(),packageSha256:requested.request.packageSha256,intentSha256:verified.intentSha256,proofSha256:verified.proofSha256,proof};
    const storedCheck=verifyStoredDesignWorkflowPackageSignature({...approvalInput,packageSha256:requested.request.packageSha256,approval:stored,anchors});assert.equal(storedCheck.ok,true,JSON.stringify(storedCheck));
    assert.equal(storedCheck.code,'DWP-APPROVAL-STORED-SIGNATURE-VERIFIED');
    const later=readApprovedDesignWorkflowPackage({...approvalInput,packageSha256:requested.request.packageSha256});assert.equal(later.ok,true,JSON.stringify(later));
    const forgedProof={...stored,proof:{...proof,signatureBase64:Buffer.from('forged').toString('base64')}};assert.equal(verifyStoredDesignWorkflowPackageSignature({...approvalInput,packageSha256:requested.request.packageSha256,approval:forgedProof,anchors}).ok,false,'forged signature');
    assert.equal(verifyStoredDesignWorkflowPackageSignature({...approvalInput,packageSha256:requested.request.packageSha256,approval:stored,anchors:[{keyReference,publicKeySha256:H('0')}]}).ok,false,'foreign trust anchor');
    assert.equal(verifyStoredDesignWorkflowPackageSignature({...approvalInput,packageSha256:H('0'),approval:stored,anchors}).ok,false,'package digest drift');
  });
  await sub(EXPECTED[6],()=>{
    assert.equal(requested.ok,true,JSON.stringify(requested));
    for(const mode of ['chat','signature-forged']){
      const chat={schema:'pipeline.design-workflow-package-approval.v1',mode,approvedBy:'po',approvedAt:new Date().toISOString(),packageSha256:requested.request.packageSha256,intentSha256:requested.request.approvalIntent.sha256,proofSha256:null,proof:null};
      const r=verifyStoredDesignWorkflowPackageSignature({...approvalInput,packageSha256:requested.request.packageSha256,approval:chat,anchors:[]});
      assert.equal(r.ok,false,mode);assert.equal(r.code,'DWP-APPROVAL-RECORD-SHAPE',mode);assert.notEqual(r.implementationAuthority,true,mode);
    }
  });
  assert.deepEqual(passed,EXPECTED,'every end-to-end sub-case must have run and passed');
  t.diagnostic(`AC-105 end-to-end sub-cases passed ${passed.length}/${EXPECTED.length}`);
  assert.equal(passed.length,7);
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
