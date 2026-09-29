// Actual Git + managed Node Advisor and Readiness output. Controls/resolver are
// explicitly synthetic test capabilities, not operator/provider authority.
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC12C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {advisorHostFixture} from './codex-advisor-host.fixture.mjs';
import {readinessFixture} from './codex-readiness-finalization.fixture.mjs';
import {runCodexToolFreeDesignReadiness} from './codex-tool-free-design-readiness.mjs';
import {verifyDesignReadinessHostExecution} from './design-readiness-host-evidence.mjs';
import {coordinateInitialDesignAdvisory} from './design-advisory-coordinator-v2.mjs';
import {readDesignWorkflowPackageV2FromRepository,readDesignReadinessPreparationFromRepository} from './design-workflow-package-v2.mjs';
import {runIsolatedStructuredHost} from './codex-isolated-structured-host.mjs';
import {observeAdvisorCandidate,observeInitialAdvisorSources} from './design-advisor-provenance.mjs';
import {designAdvisorValueSha256} from './design-advisor-course.mjs';
import {canonicalJson} from './codex-sandbox-compatibility.mjs';
import {createCodexAdvisorExecution} from './codex-advisor-execution.mjs';
import {createNativeInitialAdvisorExecution} from './native-initial-advisor-execution.mjs';
import {loadRunnerProfilesV3Registry} from './runner-profiles-v3.mjs';
import {exportCodexDesignAdvisorArtifacts} from '../scripts/codex-design-advisor-bootstrap.mjs';
import {createDesignWorkflowPackageApprovalRequest,validateDesignWorkflowPackageApprovalRequest,verifyDesignWorkflowPackageApproval,verifyStoredDesignWorkflowPackageSignature} from './design-workflow-approval.mjs';
import {readApprovedDesignWorkflowPackage} from './design-workflow-package.mjs';
import {resolveV3DutyRoute} from './critic-route-v3.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');

test('genuine initial consultation survives an advised committed revision and fresh final Readiness, while forged bindings fail',async t=>{
 assert.ok(readFileSync(new URL('../schemas/pipeline.design-workflow-package.v2.json',import.meta.url)).equals(readFileSync(new URL('../../../schemas/pipeline.design-workflow-package.v2.json',import.meta.url))),'Source and root package schemas must remain byte-identical');
 const f=advisorHostFixture(t),readinessProcess=readinessFixture(t);
 const consultation=await coordinateInitialDesignAdvisory({repoRoot:f.root,featureId:'advisor-feature',authoringDispatchId:'elephant-author',sources:f.sources,reason:'risk-review',profile:'feature',dispatch:f.args.dispatch,route:f.route,hostExecution:f.execution});
 assert.equal(consultation.ok,true,JSON.stringify(consultation));
 const git=args=>execFileSync('git',['-C',f.root,...args],{encoding:'utf8',timeout:10000}).trim();
 writeFileSync(join(f.root,'design.md'),'Synthetic revised design adopting proposal-1.\n');
 git(['add','design.md']);git(['commit','-qm','adopt actual managed Advisor proposal']);
 const finalCandidate=observeAdvisorCandidate(f.root);
 const final=observeInitialAdvisorSources({repoRoot:f.root,candidate:finalCandidate,sourcePaths:Object.fromEntries(Object.entries(f.sources).map(([name,s])=>[name,s.path]))});
 assert.equal(final.ok,true,JSON.stringify(final));
 const finalRoute={...f.route,candidateCommit:finalCandidate.commit};
 const evidence='evidence';mkdirSync(join(f.root,evidence));
 const publish=(name,bytes)=>{const path=`${evidence}/${name}`;writeFileSync(join(f.root,path),bytes);return {path,sha256:sha(bytes)};};
 const initialRef=publish('initial.json',JSON.stringify(consultation.initialContext)+'\n');
 const receiptRef=publish('advisor.json',consultation.receiptBytes);
 const reportRef=publish('advisor-report.json',canonicalJson(consultation.report));
 const disposition={schema:'pipeline.design-advisor-disposition.v1',courseId:consultation.courseBinding.courseId,consultationSha256:designAdvisorValueSha256(consultation.consultation),proposalSetSha256:consultation.consultation.proposalSetSha256,items:[{proposalId:'proposal-1',decision:'adopt',rationale:'Document the suggested path.',revisionCommit:finalCandidate.commit}],ownerDispatchId:'author-revision',createdAt:new Date().toISOString()};
 const revision={schema:'pipeline.design-advisor-revision.v1',courseId:consultation.courseBinding.courseId,seq:1,priorRevisionSha256:null,candidate:finalCandidate,sources:final.sources,parentCommit:f.candidate.commit,proposalIds:['proposal-1'],reason:'advisor-disposition'};
 const preparation={schema:'pipeline.design-readiness-preparation.v2',featureId:'advisor-feature',authoringDispatchId:'elephant-author',candidate:finalCandidate,sources:final.sources,advisor:{status:'answered',runner:'codex',profile:'feature',route:f.route,initialContext:initialRef,courseBinding:consultation.courseBinding,consultation:consultation.consultation,hostReceipt:consultation.hostReceipt,receipt:receiptRef,report:reportRef,disposition,revisions:[revision]},createdAt:new Date().toISOString()};
 publish('preparation.json',canonicalJson(preparation));
 const prepared=readDesignReadinessPreparationFromRepository({repoRoot:f.root,packagePath:'evidence/preparation.json',trustedAdvisorExecutablePath:process.execPath});assert.equal(prepared.ok,true,JSON.stringify(prepared));
 const ready=await runCodexToolFreeDesignReadiness({repoRoot:f.root,repoFingerprint:f.repoFingerprint,codexPath:process.execPath,store:f.store,dispatchId:'final-readiness',candidate:finalCandidate,sources:final.sources,route:finalRoute,inputDirectory:readinessProcess.input,advisorObservation:prepared.advisorObservation,
  invokeHost:input=>{assert.ok(input.prompt.includes(canonicalJson(prepared.advisorObservation)));assert.equal(input.readinessAdvisorObservation.report.answer,consultation.report.answer);assert.deepEqual(input.readinessAdvisorObservation.advisor.disposition,disposition);return runIsolatedStructuredHost(input);},readCandidate:()=>observeAdvisorCandidate(f.root),readCommittedSource:(_root,commit,path)=>Buffer.from(execFileSync('git',['-C',f.root,'show',`${commit}:${path}`],{timeout:10000}))});
 assert.equal(ready.status,'reviewed',JSON.stringify(ready));
 const readyRef=publish('readiness.json',canonicalJson(ready.report));
 const pkg={...preparation,schema:'pipeline.design-workflow-package.v2',readiness:{...readyRef,dispatchId:'final-readiness'}};
 const packagePath='evidence/package.json';
 const writePackage=value=>writeFileSync(join(f.root,packagePath),JSON.stringify(value)+'\n');writePackage(pkg);
 const verifyReadinessExecution=input=>verifyDesignReadinessHostExecution({...input,resolveRoute:()=>({state:'default',runner:'codex',...finalRoute}),resolveCodexExecutable:()=>process.execPath});
 const args={repoRoot:f.root,packagePath,trustedAdvisorExecutablePath:process.execPath,verifyReadinessExecution};
 const accepted=readDesignWorkflowPackageV2FromRepository(args);
 assert.equal(accepted.ok,true,JSON.stringify(accepted));
 assert.equal(accepted.implementationAuthority,false);
 assert.notEqual(accepted.candidate.commit,consultation.initialContext.initialCandidate.commit);
 assert.equal(accepted.approvalReview.approvalStatus,'pending-po-approval');
 assert.equal(accepted.advisorDispatchId,'advisor-fixture');
 assert.equal(accepted.readinessDispatchId,'final-readiness');
 const materialDisposition=structuredClone(pkg);materialDisposition.advisor.disposition.items[0].rationale='A changed, still valid disposition.';writePackage(materialDisposition);assert.equal(readDesignWorkflowPackageV2FromRepository(args).ok,false,'material disposition changes require fresh independent readiness');
 const metadata=structuredClone(pkg);metadata.createdAt=new Date(Date.now()+1000).toISOString();writePackage(metadata);assert.equal(readDesignWorkflowPackageV2FromRepository(args).ok,true,'publication timestamp is not supplemental Advisor evidence');
 const wrong=structuredClone(pkg);wrong.advisor.consultation.questionSha256='0'.repeat(64);writePackage(wrong);
 assert.equal(readDesignWorkflowPackageV2FromRepository(args).ok,false);
 const forged=structuredClone(pkg);forged.advisor.disposition.items[0].proposalId='invented-proposal';forged.advisor.revisions[0].proposalIds=['invented-proposal'];writePackage(forged);
 assert.equal(readDesignWorkflowPackageV2FromRepository(args).code,'DWP2-PROPOSAL-DISPOSITION');
 writePackage(pkg);
 const orphan=git(['commit-tree',finalCandidate.tree,'-m','orphan ancestry fixture']);
 const badAncestry=structuredClone(pkg);badAncestry.candidate.commit=orphan;badAncestry.advisor.revisions[0].candidate.commit=orphan;badAncestry.advisor.disposition.items[0].revisionCommit=orphan;writePackage(badAncestry);
 assert.equal(readDesignWorkflowPackageV2FromRepository({...args,requireCurrentCandidate:false}).code,'DAP-GIT-PARENT');
 // The normal implementation commit changes HEAD while preserving the approved
 // immutable design package. Creation/presentation and consumption differ.
 writePackage(pkg);
 writeFileSync(join(f.root,'implementation.mjs'),'export const implemented = true;\n');
 git(['add','implementation.mjs']);git(['commit','-qm','ordinary planned implementation']);
 const implementationCandidate=observeAdvisorCandidate(f.root);
 assert.notEqual(implementationCandidate.commit,finalCandidate.commit);
 assert.equal(readDesignWorkflowPackageV2FromRepository(args).code,'DWP2-CURRENT-CANDIDATE');
 const consumed=readDesignWorkflowPackageV2FromRepository({...args,requireCurrentCandidate:false,requireReadinessExecution:false});
 assert.equal(consumed.ok,true,JSON.stringify(consumed));
 assert.equal(consumed.packageSha256,accepted.packageSha256);
 assert.deepEqual(consumed.candidate,accepted.candidate);
 assert.equal(consumed.implementationAuthority,false,'package reader itself never grants approval');
 // Failure and proved no-child packages keep real private course provenance,
 // expose an Advisor-only proposal, and retain independent final Readiness.
 for(const {runner,noChild} of [{runner:'codex',noChild:false},{runner:'codex',noChild:true},{runner:'claude',noChild:true},{runner:'antigravity',noChild:true}]){
  const failed=advisorHostFixture(t,'cross-citation'),readinessHost=readinessFixture(t);
  const native=runner!=='codex';
  // A no-child Codex record has no host receipt to bind an arbitrary route;
  // use the actual committed initial V3 duty authority in this fixture.
  if(runner==='codex'&&noChild){writeFileSync(join(failed.root,'pipeline.user.yaml'),readFileSync(new URL('../../../pipeline.user.yaml',import.meta.url)));execFileSync('git',['-C',failed.root,'add','pipeline.user.yaml']);execFileSync('git',['-C',failed.root,'commit','-qm','bind synthetic no-child route to V3 authority']);failed.candidate=observeAdvisorCandidate(failed.root);const selected=resolveV3DutyRoute({rootDir:failed.root,dutyId:'advisory',runner:'codex',candidateCommit:failed.candidate.commit});failed.route=Object.fromEntries(['model','effort','sourceSha256','candidateCommit'].map(k=>[k,selected[k]]));failed.args.dispatch={...failed.args.dispatch,candidateCommit:failed.candidate.commit,candidateTree:failed.candidate.tree};}
  const advisorRoute=native?{model:null,effort:null,sourceSha256:designAdvisorValueSha256(loadRunnerProfilesV3Registry()),candidateCommit:failed.candidate.commit}:failed.route;
  const hostExecution=native?createNativeInitialAdvisorExecution({runner}):noChild?createCodexAdvisorExecution({repoRoot:failed.root,trustedExecutablePath:process.execPath,inputDirectory:failed.input,admission:{...failed.admission,admitHostExport:()=>({decision:++failed.calls.export===1?'approved':'denied'})}}):failed.execution;
  const failure=await coordinateInitialDesignAdvisory({repoRoot:failed.root,runner,featureId:'advisor-feature',authoringDispatchId:'elephant-author',sources:failed.sources,reason:'risk-review',profile:'feature',dispatch:failed.args.dispatch,route:advisorRoute,hostExecution});
  assert.equal(failure.status,'unavailable-pending-final-approval',JSON.stringify(failure));
  const runGit=argv=>execFileSync('git',['-C',failed.root,...argv],{encoding:'utf8',timeout:10000}).trim();
  const revisions=[];
  if(!noChild){writeFileSync(join(failed.root,'design.md'),'Synthetic readiness correction after failed Advisor.\n');runGit(['add','design.md']);runGit(['commit','-qm','correct design before exception review']);}
  const candidate=observeAdvisorCandidate(failed.root),sources=observeInitialAdvisorSources({repoRoot:failed.root,candidate,sourcePaths:Object.fromEntries(Object.entries(failed.sources).map(([name,s])=>[name,s.path]))}).sources;
  if(!noChild)revisions.push({schema:'pipeline.design-advisor-revision.v1',courseId:failure.courseBinding.courseId,seq:1,priorRevisionSha256:null,candidate,sources,parentCommit:failed.candidate.commit,proposalIds:[],reason:'readiness-correction'});
  const route={...failed.route,candidateCommit:candidate.commit};
  mkdirSync(join(failed.root,'evidence'));
  const artifacts=exportCodexDesignAdvisorArtifacts(failed.root,'evidence/failure',failure);
  assert.ok(artifacts.failure);assert.ok(artifacts.initial);assert.equal(artifacts.report,undefined);assert.equal(artifacts.consultation,undefined);
  assert.equal(Boolean(artifacts.receipt),!noChild);
  const preparation={schema:'pipeline.design-readiness-preparation.v2',featureId:'advisor-feature',authoringDispatchId:'elephant-author',candidate,sources,advisor:{status:'unavailable',runner,profile:'feature',route:advisorRoute,initialContext:artifacts.initial,courseBinding:failure.courseBinding,consultation:null,hostReceipt:failure.hostReceipt,receipt:artifacts.receipt??null,report:null,disposition:null,revisions,failureEvidence:artifacts.failure,proposedException:{kind:'advisor-unavailable',approval:'final',oneTime:true,rationale:'Review the final design with the recorded Advisor failure.'}},createdAt:new Date().toISOString()};
  writeFileSync(join(failed.root,'evidence/preparation.json'),canonicalJson(preparation));
  const contextPrepared=readDesignReadinessPreparationFromRepository({repoRoot:failed.root,packagePath:'evidence/preparation.json',trustedAdvisorExecutablePath:process.execPath});assert.equal(contextPrepared.ok,true,JSON.stringify(contextPrepared));
  const ready=await runCodexToolFreeDesignReadiness({repoRoot:failed.root,repoFingerprint:failed.repoFingerprint,codexPath:process.execPath,store:failed.store,dispatchId:'failure-final-readiness',candidate,sources,route,inputDirectory:readinessHost.input,advisorObservation:contextPrepared.advisorObservation,
   invokeHost:input=>{assert.ok(input.prompt.includes(canonicalJson(contextPrepared.advisorObservation)));assert.deepEqual(input.readinessAdvisorObservation.failure,failure.failureEvidence);assert.deepEqual(input.readinessAdvisorObservation.advisor.proposedException,preparation.advisor.proposedException);return runIsolatedStructuredHost(input);},readCandidate:()=>observeAdvisorCandidate(failed.root),readCommittedSource:(_root,commit,path)=>Buffer.from(execFileSync('git',['-C',failed.root,'show',`${commit}:${path}`],{timeout:10000}))});
  assert.equal(ready.status,'reviewed',JSON.stringify(ready));
  const bytes=Buffer.from(canonicalJson(ready.report)),readinessRef={path:'evidence/readiness.json',sha256:sha(bytes),dispatchId:'failure-final-readiness'};writeFileSync(join(failed.root,readinessRef.path),bytes);
  const unavailable={...preparation,schema:'pipeline.design-workflow-package.v2',readiness:readinessRef};
  const packagePath='evidence/package.json',save=p=>writeFileSync(join(failed.root,packagePath),canonicalJson(p));save(unavailable);
  const input={repoRoot:failed.root,packagePath,trustedAdvisorExecutablePath:process.execPath,verifyReadinessExecution:input=>verifyDesignReadinessHostExecution({...input,resolveRoute:()=>({state:'default',runner:'codex',...route}),resolveCodexExecutable:()=>process.execPath})};
  const admitted=readDesignWorkflowPackageV2FromRepository(input);assert.equal(admitted.ok,true,JSON.stringify(admitted));assert.equal(admitted.advisorStatus,'unavailable');assert.equal(admitted.advisorExceptionRequired,true);assert.equal(admitted.approvalReview.approvalStatus,'pending-po-approval');assert.equal(admitted.implementationAuthority,false);assert.equal(admitted.approvalReview.initialConsultation.report,null);
  const changedDisposition=structuredClone(unavailable);changedDisposition.advisor.proposedException.rationale='Changed actual proposed exception disposition.';save(changedDisposition);assert.equal(readDesignWorkflowPackageV2FromRepository(input).ok,false,'changed unavailable disposition requires fresh readiness');save(unavailable);
  const approvalInput={...input,featureId:unavailable.featureId,planPath:sources.prd.path,planSha256:sources.prd.sha256,specPath:sources.spec.path,specSha256:sources.spec.sha256,readCandidate:()=>observeAdvisorCandidate(failed.root)},prepared=createDesignWorkflowPackageApprovalRequest(approvalInput);
  assert.equal(prepared.ok,true,JSON.stringify(prepared));assert.equal(prepared.request.advisorException.kind,'advisor-unavailable');assert.equal(prepared.request.advisorException.oneTime,true);assert.equal(prepared.request.advisorException.packageSha256,admitted.packageSha256);assert.equal(prepared.request.advisorException.failureEvidenceSha256,artifacts.failure.sha256);
  const omitted=structuredClone(prepared.request);delete omitted.advisorException;assert.equal(validateDesignWorkflowPackageApprovalRequest({...approvalInput,request:omitted}).code,'DWP-APPROVAL-ADVISOR-EXCEPTION-BINDING');
  const wrongDecision=structuredClone(prepared.request);wrongDecision.advisorException.oneTime=false;assert.equal(validateDesignWorkflowPackageApprovalRequest({...approvalInput,request:wrongDecision}).ok,false);
  const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'pem'}).toString(),anchors=[{keyReference:'final-exception-po',publicKeySha256:sha(Buffer.from(publicKey))}],proof={schema:'pipeline.po-approval-proof.v1',intentSha256:prepared.request.approvalIntent.sha256,keyReference:'final-exception-po',publicKey,signatureBase64:sign(null,Buffer.from(prepared.request.approvalIntent.sha256),keys.privateKey).toString('base64')};
  const finalApproval=verifyDesignWorkflowPackageApproval({...approvalInput,request:prepared.request,anchors,proof});assert.equal(finalApproval.ok,true,JSON.stringify(finalApproval));assert.deepEqual(finalApproval.advisorException,prepared.request.advisorException);
  const stored={schema:'pipeline.design-workflow-package-approval.v1',mode:'signature',approvedBy:'verified:final-exception-po',approvedAt:new Date().toISOString(),packageSha256:admitted.packageSha256,intentSha256:finalApproval.intentSha256,proofSha256:finalApproval.proofSha256,proof,advisorException:finalApproval.advisorException};
  assert.equal(readApprovedDesignWorkflowPackage({...approvalInput,packageSha256:admitted.packageSha256}).code,'DWP-APPROVAL-ADVISOR-EXCEPTION-BINDING');
  assert.equal(readApprovedDesignWorkflowPackage({...approvalInput,packageSha256:admitted.packageSha256,advisorExceptionBinding:stored.advisorException}).ok,true);
  assert.equal(verifyStoredDesignWorkflowPackageSignature({...approvalInput,packageSha256:admitted.packageSha256,approval:stored,anchors}).ok,true);
  const missingStored=structuredClone(stored);delete missingStored.advisorException;assert.equal(verifyStoredDesignWorkflowPackageSignature({...approvalInput,packageSha256:admitted.packageSha256,approval:missingStored,anchors}).ok,false);
  const replayed=structuredClone(stored);replayed.advisorException.packageSha256='0'.repeat(64);assert.equal(verifyStoredDesignWorkflowPackageSignature({...approvalInput,packageSha256:admitted.packageSha256,approval:replayed,anchors}).ok,false);
  const forgedProof=structuredClone(stored);forgedProof.proof.signatureBase64=Buffer.from('forged').toString('base64');assert.equal(verifyStoredDesignWorkflowPackageSignature({...approvalInput,packageSha256:admitted.packageSha256,approval:forgedProof,anchors}).ok,false);
  const forged=structuredClone(unavailable);forged.advisor.status='answered';save(forged);assert.equal(readDesignWorkflowPackageV2FromRepository(input).ok,false);
  const noReadiness=structuredClone(unavailable);noReadiness.readiness.sha256='0'.repeat(64);save(noReadiness);assert.equal(readDesignWorkflowPackageV2FromRepository(input).ok,false);
  const noException=structuredClone(unavailable);delete noException.advisor.proposedException;save(noException);assert.equal(readDesignWorkflowPackageV2FromRepository(input).code,'DWP2-PACKAGE-SCHEMA');
  for(const change of [a=>{a.extra='unbound';},a=>{a.report={};},a=>{a.disposition={};},a=>{a.consultation={};},a=>{a.proposedException.approved=true;}]){const wrong=structuredClone(unavailable);change(wrong.advisor);save(wrong);assert.equal(readDesignWorkflowPackageV2FromRepository(input).code,'DWP2-PACKAGE-SCHEMA');}
  const wrongSlot=structuredClone(unavailable);wrongSlot.advisor.courseBinding.routeStepSha256='0'.repeat(64);save(wrongSlot);assert.equal(readDesignWorkflowPackageV2FromRepository(input).code,'DWP2-COURSE-BINDING');
  const fabricated=structuredClone(failure.failureEvidence);fabricated.code='fabricated-failure';const tampered=Buffer.from(canonicalJson(fabricated));writeFileSync(join(failed.root,artifacts.failure.path),tampered);const edited=structuredClone(unavailable);edited.advisor.failureEvidence.sha256=sha(tampered);save(edited);assert.equal(readDesignWorkflowPackageV2FromRepository(input).ok,false);
  if(!noChild){const noHost=structuredClone(unavailable);noHost.advisor.hostReceipt=null;save(noHost);assert.equal(readDesignWorkflowPackageV2FromRepository(input).ok,false);}
 }
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 1) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
