// SPDX-License-Identifier: SUL-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFileSync, readFileSync, unlinkSync, chmodSync, linkSync, existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {readinessFixture} from './codex-readiness-finalization.fixture.mjs';
import {runCodexToolFreeDesignReadiness} from './codex-tool-free-design-readiness.mjs';
import {createCodexDesignReadinessHostStore} from './codex-design-readiness-host-store.mjs';
import {spawnManagedCodexHost} from './codex-host-process-supervisor.mjs';
import {validateCodexReadinessHostRecord} from './codex-readiness-host-record.mjs';
import {canonicalJson} from './codex-sandbox-compatibility.mjs';
import {hostDigest} from './codex-host-process-journal.mjs';
import {readFinalizedReadinessObservation} from './codex-readiness-finalization.mjs';
import {verifyDesignReadinessHostExecution} from './design-readiness-host-evidence.mjs';

async function success(t) {
 const f=readinessFixture(t),result=await runCodexToolFreeDesignReadiness(f.args);
 assert.equal(result.status,'reviewed',JSON.stringify(result));
 const saved=f.store.read(result.receiptId,result.expected);assert.ok(saved);
 return {...f,result,saved,journal:join(f.store.processRoot,'codex-host-'+result.receiptId)};
}
test('unknown-at-launch child output binds original frame, canonical report and genuine closed pipes across fresh physical reader',async t=>{
 const f=await success(t),record=f.saved.value;
 assert.match(f.result.report.summary,/Unknown-at-launch synthetic result [a-f0-9-]{36}$/);
 const actual=readFinalizedReadinessObservation(f.journal,f.result.expected);
 assert.ok(actual);assert.equal(actual.sha256,record.finalizationSha256);
 assert.equal(record.responseSha256,record.outputCustody.reportCanonicalSha256);
 assert.equal(record.dutyReceiptSha256,record.responseSha256);
 assert.notEqual(record.outputCustody.reportRawJsonSha256,record.outputCustody.finalMessageFrameSha256);
 assert.equal(record.outputCustody.stdin.closed,true);assert.equal(record.outputCustody.stdout.closed,true);
 assert.equal(record.outputCustody.stderr.closed,true);
 const fresh=createCodexDesignReadinessHostStore({gitCommonDir:join(f.root,'.git'),repoFingerprint:f.repoFingerprint,trustedExecutablePath:process.execPath});
 assert.equal(fresh.read(f.result.receiptId,f.result.expected).sha256,f.saved.sha256);
 const privateBytes=readFileSync(join(f.journal,'readiness-finalization.json'),'utf8');
 assert.equal(privateBytes.includes(f.result.report.summary),false);
 assert.equal(privateBytes.includes('Synthetic prd document'),false);
 assert.equal(privateBytes.includes('sourceContent'),false);
});
test('genuinely owned empty Node process cannot authorize a complete-looking caller report record',async t=>{
 const f=await success(t),receiptId='drh_'+randomBytes(16).toString('hex'),script=join(f.input,'empty.mjs');
 writeFileSync(script,"process.stdin.resume();process.stdin.on('end',()=>process.exit(0));");
 const managed=await spawnManagedCodexHost({journalParent:f.store.processRoot,executablePath:process.execPath,args:[script],cwd:f.input,receiptId,
  binding:{repoFingerprint:f.repoFingerprint,dispatchId:f.saved.value.dispatchId,candidateCommit:f.candidate.commit,requestSha256:f.saved.value.requestSha256}});
 t.after(async()=>{try{await managed.stop();}catch{}});
 managed.child.stdout.resume();managed.child.stderr.resume();managed.child.stdin.end();
 const closed=await managed.finish();assert.equal(closed.clean,true);
 const record=structuredClone(f.saved.value);record.receiptId=receiptId;record.ownership=closed.ownership;
 const expected=structuredClone(f.result.expected);expected.ownership=closed.ownership;
 assert.equal(validateCodexReadinessHostRecord(record,expected),true,'closed shape plus real ownership is insufficient');
 assert.equal(readFinalizedReadinessObservation(managed.directory,expected),null);
 assert.throws(()=>f.store.write(record,expected),{code:'CRHS-RECORD-OR-OWNERSHIP-INVALID'});
});
test('caller-coordinated digest, pipe, session, controls and private-pointer mutations are refused',async t=>{
 const f=await success(t),receiptPath=join(f.store.processRoot,'..','receipts',f.result.receiptId+'.json');unlinkSync(receiptPath);
 const mutations=[r=>r.finalizationSha256='f'.repeat(64),r=>r.outputCustody.stdout.closed=false,
  r=>r.outputCustody.stdout.bytes=8388609,r=>r.outputCustody.stdout.framingComplete=false,
  r=>r.outputCustody.reportRawJsonSha256='e'.repeat(64),r=>r.outputCustody.finalMessageFrameSha256='e'.repeat(64),
  r=>r.session.threadId='different-thread',r=>r.session.freshThreadStarted=false,r=>r.controls.serverRequests=1,
  r=>r.responseSha256=r.dutyReceiptSha256=r.outputCustody.reportCanonicalSha256='b'.repeat(64)];
 for(const mutate of mutations){const record=structuredClone(f.saved.value),expected=structuredClone(f.result.expected);mutate(record);
  expected.responseSha256=record.responseSha256;expected.dutyReceiptSha256=record.dutyReceiptSha256;
  assert.throws(()=>f.store.write(record,expected),{code:'CRHS-RECORD-OR-OWNERSHIP-INVALID'});
 }
 f.store.write(f.saved.value,f.result.expected);
 const wrong=createCodexDesignReadinessHostStore({gitCommonDir:join(f.root,'.git'),repoFingerprint:f.repoFingerprint,trustedExecutablePath:join(f.input,'app-server')});
 assert.equal(wrong.read(f.result.receiptId,f.result.expected),null);
});
test('private finalization mode, alias and coordinated-content drift invalidate existing receipt',async t=>{
 const f=await success(t),path=join(f.journal,'readiness-finalization.json');
 chmodSync(path,0o644);assert.equal(f.store.read(f.result.receiptId,f.result.expected),null);
 chmodSync(path,0o600);assert.ok(f.store.read(f.result.receiptId,f.result.expected));
 linkSync(path,join(f.root,'metadata-alias'));assert.equal(f.store.read(f.result.receiptId,f.result.expected),null);unlinkSync(join(f.root,'metadata-alias'));
 const metadata=JSON.parse(readFileSync(path));metadata.session.threadId='changed-private-thread';writeFileSync(path,canonicalJson(metadata));
 assert.equal(f.store.read(f.result.receiptId,f.result.expected),null);
});
test('public package verifier independently resolves trusted executable before fresh private store acceptance',async t=>{
 const f=await success(t),sourceBytes=Object.fromEntries(Object.entries(f.sources).map(([name,s])=>[name,{path:s.path,bytes:readFileSync(join(f.root,s.path))}]));
 const args={repoRoot:f.root,hostExecution:f.result.report.hostExecution,readinessReceipt:f.result.report,
  candidate:f.candidate,sources:f.sources,sourceBytes,
  resolveRoute:()=>({state:'default',runner:'codex',...f.route}),resolveCodexExecutable:name=>{assert.equal(name,'codex');return process.execPath;}};
 assert.equal(verifyDesignReadinessHostExecution(args).ok,true,'default store factory receives independently observed test binary');
 assert.equal(verifyDesignReadinessHostExecution({...args,resolveCodexExecutable:()=>null}).ok,false);
 assert.equal(verifyDesignReadinessHostExecution({...args,resolveCodexExecutable:()=>join(f.input,'app-server')}).ok,false);
 let resolved=0;
 const result=verifyDesignReadinessHostExecution({...args,resolveCodexExecutable:name=>{resolved++;return process.execPath;},
  codexHostStoreFactory:options=>{assert.equal(options.trustedExecutablePath,process.execPath);return createCodexDesignReadinessHostStore(options);}});
 assert.equal(result.ok,true);assert.equal(resolved,1);
});

// Separately declared current Advisor runtime evidence; five normative sources stay unchanged.
import {readCurrentReadinessAdvisorObservation} from './codex-readiness-finalization.mjs';
import {createAdvisoryRouteSelection} from './advisory-route-selection.mjs';
import {createInitialAdvisorContext} from './design-advisor-course.mjs';
import {coordinateInitialDesignAdvisory} from './design-advisory-coordinator-v2.mjs';
import {createNativeInitialAdvisorExecution} from './native-initial-advisor-execution.mjs';
import {designAdvisorValueSha256} from './design-advisor-course.mjs';
import {loadRunnerProfilesV3Registry} from './runner-profiles-v3.mjs';
import {exportCodexDesignAdvisorArtifacts} from '../scripts/codex-design-advisor-bootstrap.mjs';
import {readDesignReadinessPreparationFromRepository} from './design-workflow-package-v2.mjs';
import {runIsolatedStructuredHost} from './codex-isolated-structured-host.mjs';
import {rereadCurrentReadinessAdvisorObservation} from './codex-readiness-finalization.mjs';
import {advisorHostFixture} from './codex-advisor-host.fixture.mjs';
import {runCodexDesignReadinessHost} from '../scripts/codex-design-readiness-host.mjs';
import {advisoryEvidenceBundleSha256,buildAdvisoryEvidenceBundle} from './advisory-lifecycle-v2.mjs';
import {execFileSync} from 'node:child_process';
import {resolveV3DutyRoute} from './critic-route-v3.mjs';
import {createCodexAdvisorExecution} from './codex-advisor-execution.mjs';
import {buildCodexToolFreeReadinessRequest,verifyCodexToolFreeBindingFromSources} from './codex-tool-free-design-readiness.mjs';
function currentAdvisorObservationFixture(f){
 const receipt={schema:'pipeline.advisory-receipt.v1',receiptId:'current-advisor',dispatch:{dispatchId:'current-advisor',queueRevision:0,candidateCommit:f.candidate.commit,candidateTree:f.candidate.tree},duty:'advisory',profile:'feature',configuredRoute:{runner:'codex',selector:{kind:'model-id',value:'fixture-model'},effort:'high'},adapter:'consult',observed:{status:'unavailable',identity:null},questionSha256:f.sources.design.sha256,answerSha256:null,fallback:{reason:'consult-unavailable',redactedErrorClass:'unavailable'},emittedAtMs:1000};
 const receiptBytes=Buffer.from(canonicalJson(receipt)),route=createAdvisoryRouteSelection({receipt,receiptBytes,code:'ordinary-consult-host-callback-unavailable'}),routeBytes=Buffer.from(canonicalJson(route));
 writeFileSync(join(f.root,'advisor.receipt.json'),receiptBytes);writeFileSync(join(f.root,'advisor.route.json'),routeBytes);
 const refs={receiptRef:{path:'advisor.receipt.json',sha256:hostDigest(receiptBytes)},routeRef:{path:'advisor.route.json',sha256:hostDigest(routeBytes)}};
 return {receipt,route,refs,observation:readCurrentReadinessAdvisorObservation({repoRoot:f.root,candidate:f.candidate,sources:f.sources,...refs})};
}
test('readiness supplemental Advisor metadata binds real current receipt, route, design question and bounded physical bytes',async t=>{
 const f=readinessFixture(t),a=currentAdvisorObservationFixture(f);
 assert.equal(a.observation.receipt.observed.status,'unavailable');assert.equal(a.observation.route.childStarted,false);assert.equal(a.observation.route.attemptCount,0);
 const content=Object.fromEntries(Object.entries(f.sources).map(([n,s])=>[n,{...s,content:readFileSync(join(f.root,s.path),'utf8')}]));
 const plain=buildCodexToolFreeReadinessRequest({dispatchId:'review',candidate:f.candidate,sources:f.sources,route:f.route,sourceContent:content});
 const supplied=buildCodexToolFreeReadinessRequest({dispatchId:'review',candidate:f.candidate,sources:f.sources,route:f.route,sourceContent:content,advisorObservation:a.observation});
 assert.notEqual(plain.requestSha256,supplied.requestSha256);assert.ok(supplied.prompt.includes('SUPPLEMENTAL_UNTRUSTED_ADVISOR_OBSERVATION_JSON'));assert.equal(Object.keys(supplied.outputSchema.properties.sources.properties).length,5);assert.deepEqual(supplied.outputSchema,plain.outputSchema);
 assert.throws(()=>readCurrentReadinessAdvisorObservation({repoRoot:f.root,candidate:{...f.candidate,commit:'0'.repeat(40)},sources:f.sources,...a.refs}));
 assert.throws(()=>readCurrentReadinessAdvisorObservation({repoRoot:f.root,candidate:f.candidate,sources:{...f.sources,design:{...f.sources.design,sha256:'0'.repeat(64)}},...a.refs}));
 assert.throws(()=>readCurrentReadinessAdvisorObservation({repoRoot:f.root,candidate:f.candidate,sources:f.sources,...a.refs,routeRef:{...a.refs.routeRef,sha256:'0'.repeat(64)}}));
 // Public files with internally consistent hashes cannot invent a private course.
 const initial=createInitialAdvisorContext({repoFingerprint:f.repoFingerprint,featureId:'fake-course-feature',authoringDispatchId:'fake-author',initialCandidate:f.candidate,sources:f.sources,sourceBytes:Object.fromEntries(Object.entries(f.sources).map(([n,s])=>[n,readFileSync(join(f.root,s.path))])),reason:'risk-review',routePolicySha256:hostDigest(f.route),createdAt:new Date().toISOString()});assert.equal(initial.ok,true);
 const binding={courseId:'fake-course',initialContextSha256:initial.contextSha256,reservationId:'fake-reservation',slot:1,routeStepSha256:'1'.repeat(64)};
 const failure={schema:'pipeline.design-advisor-failure.v1',courseBinding:binding,outcome:'failed',code:'fabricated-failure',phase:'fabricated-phase',childStarted:true,inputSubmitted:false,attemptCount:7,observation:{invented:true}};
 const publish=(path,value)=>{const bytes=Buffer.from(canonicalJson(value));writeFileSync(join(f.root,path),bytes);return {path,sha256:hostDigest(bytes)};};
 const fake={schema:'pipeline.readiness-advisor-observation.v2',candidate:f.candidate,sources:f.sources,featureId:'fake-course-feature',authoringDispatchId:'fake-author',initialContext:initial.context,receipt:null,report:null,failure,advisor:{status:'unavailable',runner:'codex',profile:'feature',route:{...f.route,model:'fabricated-model'},initialContext:publish('fake-initial.json',initial.context),courseBinding:binding,consultation:null,hostReceipt:null,receipt:null,report:null,disposition:null,revisions:[],failureEvidence:publish('fake-failure.json',failure),proposedException:{kind:'advisor-unavailable',approval:'final',oneTime:true,rationale:'Fabricated failure context.'}}};
 const counter=join(f.root,'readiness-child-counter');const script=join(f.input,'app-server');writeFileSync(script,readFileSync(script,'utf8').replace("else if(m.method==='turn/start'){",`else if(m.method==='turn/start'){require('node:fs').appendFileSync(${JSON.stringify(counter)},'turn\\n');`));
 const forged=await runCodexToolFreeDesignReadiness({...f.args,advisorObservation:fake});
 assert.equal(forged.status,'unavailable',JSON.stringify(forged));assert.equal(forged.receiptId,null);assert.equal(existsSync(counter),false,'forged context never reaches the managed child');
 writeFileSync(join(f.root,'pipeline.user.yaml'),readFileSync(new URL('../../../pipeline.user.yaml',import.meta.url)));
 let hostInvoked=false;const standalone=await runCodexDesignReadinessHost({repoRoot:f.root,repoFingerprint:f.repoFingerprint,dispatchId:'standalone-fake',dispatch:{queueRevision:0,candidateCommit:f.candidate.commit,candidateTree:f.candidate.tree,referenceSetSha256:advisoryEvidenceBundleSha256(buildAdvisoryEvidenceBundle(f.root,Object.values(f.sources).map(s=>s.path).sort()))},sources:f.sources,sandboxRuntime:{schema:'pipeline.codex-sandbox-runtime.v1',repoRoot:f.root,codexPath:process.execPath},advisorObservation:fake},{resolveV3ReadinessRoute:()=>({dutyId:'readiness',runner:'codex',state:'default',...f.route}),runToolFreeReadiness:()=>{hostInvoked=true;throw Error('must not invoke');}});assert.equal(standalone.status,'unavailable');assert.equal(hostInvoked,false);assert.equal(existsSync(counter),false);
 const direct=await runIsolatedStructuredHost({codexPath:process.execPath,cwd:f.input,model:f.route.model,effort:f.route.effort,prompt:supplied.prompt,outputSchema:supplied.outputSchema,inputContract:'readiness',readinessSourceContext:{repoRoot:f.root,candidate:f.candidate,sources:f.sources},readinessAdvisorObservation:fake,managedProcess:{journalParent:f.store.processRoot,receiptId:'drh_'+ '1'.repeat(32),binding:{repoFingerprint:f.repoFingerprint,dispatchId:'review',candidateCommit:f.candidate.commit}}});assert.equal(direct.ok,false);assert.equal(direct.code,'host-readiness-advisor-context-unavailable');assert.equal(existsSync(counter),false);
 const nativeRoute={model:null,effort:null,sourceSha256:designAdvisorValueSha256(loadRunnerProfilesV3Registry()),candidateCommit:f.candidate.commit};
 const unavailable=await coordinateInitialDesignAdvisory({repoRoot:f.root,runner:'claude',featureId:'verified-feature',authoringDispatchId:'verified-author',sources:f.sources,reason:'risk-review',profile:'feature',dispatch:{dispatchId:'initial-no-child',queueRevision:0,candidateCommit:f.candidate.commit,candidateTree:f.candidate.tree},route:nativeRoute,hostExecution:createNativeInitialAdvisorExecution({runner:'claude'})});
 assert.equal(unavailable.status,'unavailable-pending-final-approval',JSON.stringify(unavailable));mkdirSync(join(f.root,'evidence'));
 const artifacts=exportCodexDesignAdvisorArtifacts(f.root,'evidence/failure',unavailable);
 const preparation={schema:'pipeline.design-readiness-preparation.v2',featureId:'verified-feature',authoringDispatchId:'verified-author',candidate:f.candidate,sources:f.sources,advisor:{status:'unavailable',runner:'claude',profile:'feature',route:nativeRoute,initialContext:artifacts.initial,courseBinding:unavailable.courseBinding,consultation:null,hostReceipt:null,receipt:null,report:null,disposition:null,revisions:[],failureEvidence:artifacts.failure,proposedException:{kind:'advisor-unavailable',approval:'final',oneTime:true,rationale:'Review the proved no-child failure.'}},createdAt:new Date().toISOString()};
 publish('evidence/preparation.json',preparation);const prepared=readDesignReadinessPreparationFromRepository({repoRoot:f.root,packagePath:'evidence/preparation.json'});assert.equal(prepared.ok,true,JSON.stringify(prepared));
 const verified=prepared.advisorObservation;assert.deepEqual(rereadCurrentReadinessAdvisorObservation(f.root,verified,f.sources),verified);
 const accepted=await runCodexToolFreeDesignReadiness({...f.args,dispatchId:'verified-no-child-readiness',advisorObservation:verified});assert.equal(accepted.status,'reviewed',JSON.stringify(accepted));assert.equal(readFileSync(counter,'utf8'),'turn\n');assert.equal(Object.keys(accepted.report.sources).length,5);
 for(const change of [v=>{v.advisor.courseBinding.courseId='fabricated-private-course';v.failure.courseBinding.courseId='fabricated-private-course';},v=>{v.advisor.route.sourceSha256='0'.repeat(64);},v=>{v.failure.childStarted=true;v.failure.inputSubmitted=true;v.failure.outcome='failed';},v=>{v.candidate.commit='0'.repeat(40);},v=>{v.failure.observation.code='fabricated-terminal-observation';}]){
  const bad=structuredClone(verified);change(bad);bad.advisor.failureEvidence=publish(artifacts.failure.path,bad.failure);
  const refused=await runCodexToolFreeDesignReadiness({...f.args,advisorObservation:bad});assert.equal(refused.status,'unavailable');assert.equal(refused.receiptId,null);assert.equal(readFileSync(counter,'utf8'),'turn\n');
 }
 publish(artifacts.failure.path,verified.failure);
 const drift=await runCodexToolFreeDesignReadiness({...f.args,dispatchId:'drifting-no-child-readiness',advisorObservation:verified,invokeHost:async input=>{const result=await runIsolatedStructuredHost(input);writeFileSync(join(f.root,artifacts.failure.path),canonicalJson(verified.failure)+' ');return result;}});assert.equal(drift.status,'unavailable');assert.equal(drift.report,null);
 // Answered supplemental context still authenticates the actual host and course.
 const answered=advisorHostFixture(t),readiness=readinessFixture(t);
 const consultation=await coordinateInitialDesignAdvisory({repoRoot:answered.root,featureId:'advisor-feature',authoringDispatchId:'elephant-author',sources:answered.sources,reason:'risk-review',profile:'feature',dispatch:answered.args.dispatch,route:answered.route,hostExecution:answered.execution});assert.equal(consultation.ok,true,JSON.stringify(consultation));mkdirSync(join(answered.root,'evidence'));
 const answerArtifacts=exportCodexDesignAdvisorArtifacts(answered.root,'evidence/answer',consultation);
 const answerPreparation={schema:'pipeline.design-readiness-preparation.v2',featureId:'advisor-feature',authoringDispatchId:'elephant-author',candidate:answered.candidate,sources:answered.sources,advisor:{status:'answered',runner:'codex',profile:'feature',route:answered.route,initialContext:answerArtifacts.initial,courseBinding:consultation.courseBinding,consultation:consultation.consultation,hostReceipt:consultation.hostReceipt,receipt:answerArtifacts.receipt,report:answerArtifacts.report,disposition:{schema:'pipeline.design-advisor-disposition.v1',courseId:consultation.courseBinding.courseId,consultationSha256:designAdvisorValueSha256(consultation.consultation),proposalSetSha256:consultation.consultation.proposalSetSha256,items:[{proposalId:'proposal-1',decision:'reject',rationale:'Retain the documented design.',revisionCommit:null}],ownerDispatchId:'elephant-author',createdAt:new Date().toISOString()},revisions:[]},createdAt:new Date().toISOString()};writeFileSync(join(answered.root,'evidence/preparation.json'),canonicalJson(answerPreparation));
 const answerPrepared=readDesignReadinessPreparationFromRepository({repoRoot:answered.root,packagePath:'evidence/preparation.json',trustedAdvisorExecutablePath:process.execPath});assert.equal(answerPrepared.ok,true,JSON.stringify(answerPrepared));
 const wrongAuthor={...answerPreparation,authoringDispatchId:'fabricated-author'};writeFileSync(join(answered.root,'evidence/preparation.json'),canonicalJson(wrongAuthor));assert.equal(readDesignReadinessPreparationFromRepository({repoRoot:answered.root,packagePath:'evidence/preparation.json',trustedAdvisorExecutablePath:process.execPath}).code,'DWP2-COURSE-BINDING');writeFileSync(join(answered.root,'evidence/preparation.json'),canonicalJson(answerPreparation));
 const answerReady=await runCodexToolFreeDesignReadiness({...answered.args,repoRoot:answered.root,repoFingerprint:answered.repoFingerprint,candidate:answered.candidate,sources:answered.sources,route:answered.route,codexPath:process.execPath,store:answered.store,inputDirectory:readiness.input,dispatchId:'answered-final-readiness',readCandidate:()=>answered.candidate,advisorObservation:answerPrepared.advisorObservation});assert.equal(answerReady.status,'reviewed',JSON.stringify(answerReady));
 assert.deepEqual(rereadCurrentReadinessAdvisorObservation(answered.root,answerPrepared.advisorObservation,answered.sources,process.execPath),answerPrepared.advisorObservation);
 const wrongHost=structuredClone(answerPrepared.advisorObservation);wrongHost.advisor.hostReceipt.sha256='0'.repeat(64);const refusedAnswer=await runCodexToolFreeDesignReadiness({...answered.args,repoRoot:answered.root,repoFingerprint:answered.repoFingerprint,candidate:answered.candidate,sources:answered.sources,route:answered.route,codexPath:process.execPath,store:answered.store,inputDirectory:readiness.input,dispatchId:'forged-answered-readiness',readCandidate:()=>answered.candidate,advisorObservation:wrongHost});assert.equal(refusedAnswer.status,'unavailable');assert.equal(refusedAnswer.receiptId,null);
 const codex=advisorHostFixture(t);writeFileSync(join(codex.root,'pipeline.user.yaml'),readFileSync(new URL('../../../pipeline.user.yaml',import.meta.url)));const git=args=>execFileSync('git',args,{cwd:codex.root,encoding:'utf8'}).trim();git(['add','pipeline.user.yaml']);git(['commit','-qm','canonical synthetic no-child V3 authority']);codex.candidate={commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}'])};
 const selected=resolveV3DutyRoute({rootDir:codex.root,dutyId:'advisory',runner:'codex',candidateCommit:codex.candidate.commit});const codexRoute=Object.fromEntries(['model','effort','sourceSha256','candidateCommit'].map(k=>[k,selected[k]]));assert.equal(codexRoute.effort,'max');let exportCalls=0;
 const codexFailure=await coordinateInitialDesignAdvisory({repoRoot:codex.root,featureId:'canonical-no-child',authoringDispatchId:'canonical-author',sources:codex.sources,reason:'risk-review',profile:'feature',dispatch:{dispatchId:'canonical-advisor',queueRevision:0,candidateCommit:codex.candidate.commit,candidateTree:codex.candidate.tree},route:codexRoute,hostExecution:createCodexAdvisorExecution({repoRoot:codex.root,trustedExecutablePath:process.execPath,inputDirectory:codex.input,admission:{...codex.admission,admitHostExport:()=>({decision:++exportCalls===1?'approved':'denied'})}})});assert.equal(codexFailure.status,'unavailable-pending-final-approval',JSON.stringify(codexFailure));mkdirSync(join(codex.root,'evidence'));const codexArtifacts=exportCodexDesignAdvisorArtifacts(codex.root,'evidence/failure',codexFailure);
 const codexPreparation={...preparation,featureId:'canonical-no-child',authoringDispatchId:'canonical-author',candidate:codex.candidate,sources:codex.sources,advisor:{...preparation.advisor,runner:'codex',route:codexRoute,initialContext:codexArtifacts.initial,courseBinding:codexFailure.courseBinding,failureEvidence:codexArtifacts.failure}};writeFileSync(join(codex.root,'evidence/preparation.json'),canonicalJson(codexPreparation));const codexPrepared=readDesignReadinessPreparationFromRepository({repoRoot:codex.root,packagePath:'evidence/preparation.json'});assert.equal(codexPrepared.ok,true,JSON.stringify(codexPrepared));assert.deepEqual(rereadCurrentReadinessAdvisorObservation(codex.root,codexPrepared.advisorObservation,codex.sources),codexPrepared.advisorObservation);
 for(const key of ['model','effort','sourceSha256']){const wrong=structuredClone(codexPrepared.advisorObservation);wrong.advisor.route[key]=key==='sourceSha256'?'0'.repeat(64):key==='effort'?'low':'fabricated-model';assert.throws(()=>rereadCurrentReadinessAdvisorObservation(codex.root,wrong,codex.sources));}
});
test('readiness supplemental Advisor physical aliases, oversized and duplicate-key observations refuse',t=>{
 const f=readinessFixture(t),a=currentAdvisorObservationFixture(f),path=join(f.root,a.refs.receiptRef.path),original=readFileSync(path);
 linkSync(path,join(f.root,'receipt-alias'));assert.throws(()=>readCurrentReadinessAdvisorObservation({repoRoot:f.root,candidate:f.candidate,sources:f.sources,...a.refs}));unlinkSync(join(f.root,'receipt-alias'));
 writeFileSync(path,Buffer.alloc(65537,32));assert.throws(()=>readCurrentReadinessAdvisorObservation({repoRoot:f.root,candidate:f.candidate,sources:f.sources,...a.refs}));
 writeFileSync(path,'{"schema":"a","schema":"b"}');assert.throws(()=>readCurrentReadinessAdvisorObservation({repoRoot:f.root,candidate:f.candidate,sources:f.sources,...a.refs}));writeFileSync(path,original);
});
test('readiness supplemental Advisor actual managed request and fresh default verifier bind declared runtime context',async t=>{
 const f=readinessFixture(t),a=currentAdvisorObservationFixture(f),script=join(f.input,'app-server');let child=readFileSync(script,'utf8');
 child=child.replace('const p=m.params.outputSchema.properties, lit=value=>value.enum[0];',`const p=m.params.outputSchema.properties, lit=value=>value.enum[0];
const marker='SUPPLEMENTAL_UNTRUSTED_ADVISOR_OBSERVATION_JSON\\n';const raw=m.params.input[0].text.split(marker)[1];
if(!raw)process.exit(23);const supplied=JSON.parse(raw.slice(raw.indexOf('{')));if(supplied.receipt.observed.status!=='unavailable'||supplied.route.childStarted!==false)process.exit(24);`);
 writeFileSync(script,child);
 const result=await runCodexToolFreeDesignReadiness({...f.args,advisorObservationRefs:a.refs});assert.equal(result.status,'reviewed',JSON.stringify(result));
 const sourceBytes=Object.fromEntries(Object.entries(f.sources).map(([n,s])=>[n,{path:s.path,bytes:readFileSync(join(f.root,s.path))}]));
 const args={repoRoot:f.root,hostExecution:result.report.hostExecution,readinessReceipt:result.report,candidate:f.candidate,sources:f.sources,sourceBytes,advisorObservationRefs:a.refs,resolveRoute:()=>({state:'default',runner:'codex',...f.route}),resolveCodexExecutable:()=>process.execPath};
 assert.equal(verifyDesignReadinessHostExecution(args).ok,true);
 assert.equal(verifyDesignReadinessHostExecution({...args,advisorObservationRefs:null}).ok,false,'fresh verifier cannot silently omit context bound into actual request');
 assert.equal(verifyCodexToolFreeBindingFromSources({repoRoot:f.root,hostExecution:result.report.hostExecution,report:result.report,candidate:f.candidate,sources:f.sources,sourceBytes,route:f.route,store:f.store,repoFingerprint:f.repoFingerprint,advisorObservationRefs:a.refs}).ok,true);
 assert.equal(Object.keys(result.report.sources).length,5);assert.equal(Object.hasOwn(result.report,'advisorObservation'),false);assert.equal(a.receipt.observed.identity,null);
 writeFileSync(join(f.root,'advisor.route.json'),readFileSync(join(f.root,'advisor.route.json'),'utf8')+' ');assert.equal(verifyDesignReadinessHostExecution(args).ok,false);
});
test('readiness supplemental Advisor drift after actual turn refuses publication and private readiness record',async t=>{
 const f=readinessFixture(t),a=currentAdvisorObservationFixture(f),script=join(f.input,'app-server');let child=readFileSync(script,'utf8');
 child=child.replace("send({method:'turn/completed'",`require('node:fs').appendFileSync(${JSON.stringify(join(f.root,'advisor.receipt.json'))},' ');send({method:'turn/completed'`);
 writeFileSync(script,child);const result=await runCodexToolFreeDesignReadiness({...f.args,advisorObservationRefs:a.refs});assert.equal(result.status,'unavailable');assert.equal(result.report,null);
});
