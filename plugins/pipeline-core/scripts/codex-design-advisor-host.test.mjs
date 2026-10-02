// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import {registerTestCaseCompletion} from '../lib/test-case-completion.mjs';
import {openSync as openCompletionDescriptor} from 'node:fs';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {advisorHostFixture} from '../lib/codex-advisor-host.fixture.mjs';
import {createInitialAdvisorContext} from '../lib/design-advisor-course.mjs';
import {hostDigest} from '../lib/codex-host-process-journal.mjs';
import {createPoApprovalIntent,canonical} from '../lib/po-approval-proof.mjs';
import {createModelFamilyRuntimeHost} from '../lib/model-family-runtime-host.mjs';
import {createModelFamilyInvocationEntry} from '../lib/model-family-invocation.mjs';
import {createModelFamilyDiscoveryHost,RULE_FIELDS,pass,fail,digest as dDigest} from '../lib/model-family-discovery.mjs';
import {createCodexFamilyAdapter} from '../lib/model-family-codex-adapter.mjs';
import {createModelFamilyExecutionHost} from '../lib/model-family-execution.mjs';
import {consumeModelFamilyHostDriverContext} from '../lib/model-family-host-store.mjs';
import {runIsolatedStructuredHost} from '../lib/codex-isolated-structured-host.mjs';
import {ADVISOR_FINALIZATION_FILENAME} from '../lib/codex-advisor-host-record.mjs';
import {validateCodexAdvisorInitialAnswer} from '../lib/codex-advisor-request.mjs';
import {canonicalJson} from '../lib/codex-sandbox-compatibility.mjs';
import {inspectCodexInitialAdvisorMetadata,createNativeCodexDesignAdvisorExecution} from './codex-design-advisor-host.mjs';

const hash=value=>createHash('sha256').update(typeof value==='string'?value:canonical(value)).digest('hex');
const taskRoute='duty.advisory',role='worker',effort='high',modelId='gpt-6-sol',familyId='sol';
const completionCases=[];
function test(name,run){completionCases.push({id:'CADH001',name,run});}

function makeS2(models,nativeResults,actualIdentity){
 const rules={},contract={schema:'pipeline.model-family-adapter-contract.v1',runner:'codex',familyId,
  discoveryModes:['complete-catalogue'],providerEvidenceSha256s:[hash('advisor-provider')]};let current=null,host;
 for(const name of RULE_FIELDS){const rule={id:`advisor-${name}`,version:1,sha256:hash(name)};contract[name]=rule;
  const run=name==='identityRule'?({phase,entry})=>phase==='coverage'?pass('SYNTHETIC',{mode:'complete-catalogue',evidenceSha256:hash('coverage'),latestAliasEvidenceSha256:null}):pass('SYNTHETIC',{model:entry.model})
   :name==='releaseGroupingRule'?({entry})=>pass('SYNTHETIC',{releaseId:`sol-${entry.version.join('-')}`,familyId,groupingEvidenceSha256:hash('group')})
   :name==='versionRule'?({entry})=>pass('SYNTHETIC',entry.version)
   :name==='variantSelectionRule'?({entry})=>pass('SYNTHETIC',{modelId:entry.model,canonicalModelId:null,aliasEvidenceSha256:null})
   :name==='selectabilityRule'?()=>pass('SYNTHETIC',{released:true,visible:true,selectable:true})
   :name==='effortRule'?({entry})=>pass('SYNTHETIC',{efforts:entry.supportedReasoningEfforts.map(x=>x.reasoningEffort),capabilityEvidenceSha256:hash('capability')})
   :name==='executionIdentityRule'?({runner,rawHostResult,bindings})=>{const observed=nativeResults.get(rawHostResult);if(runner==='codex'&&observed&&hash(bindings)===hash(observed.bindings)){actualIdentity.push({modelId:observed.modelId,effort:observed.effort});return pass('SYNTHETIC',{actualModelIds:[observed.modelId],actualEffort:observed.effort,rawHostResultSha256:dDigest(rawHostResult),hostObservationSha256:hash('advisor-exec-observed')});}return fail('SYNTHETIC-IDENTITY');}
   :()=>pass('SYNTHETIC-UNUSED',{});
  rules[rule.id]={version:rule.version,sha256:rule.sha256,run};}
 host=createModelFamilyDiscoveryHost({rules,clock:()=> '2026-10-01T12:00:00.000Z',
  capture:async context=>pass('SYNTHETIC-CATALOGUE',{bindings:context.bindings,observedAt:context.observedAt,source:'advisor-family-test',pages:[{request:{id:1,method:'model/list',params:{cursor:null,limit:100,includeHidden:true}},responseBytes:JSON.stringify({id:1,result:{data:models.map(version=>({id:modelId,model:modelId,hidden:false,version,released:true,supportedReasoningEfforts:[{reasoningEffort:effort}]})),nextCursor:null}})}]}),
  verifyProviderContract:({contractSha256,contract:value})=>pass('SYNTHETIC-CONTRACT',{contractSha256,providerEvidenceSha256s:value.providerEvidenceSha256s}),
  execution:({runner,rawHostResult,bindings})=>{const observed=nativeResults.get(rawHostResult);if(runner==='codex'&&observed&&hash(bindings)===hash(observed.bindings)){actualIdentity.push({modelId:observed.modelId,effort:observed.effort});return pass('SYNTHETIC',{actualModelIds:[observed.modelId],actualEffort:observed.effort,rawHostResultSha256:dDigest(rawHostResult),hostObservationSha256:hash('advisor-exec-observed')});}return fail('SYNTHETIC-IDENTITY');},
  compatibility:({runner,record,variant,slot,bindings})=>{const discovery=host.readDiscovery(current).value;return pass('SYNTHETIC-COMPAT',{subjectSha256:dDigest({runner,releaseId:record.releaseId,modelId:variant.modelId,...slot,discoverySha256:dDigest(discovery),adapterContractSha256:discovery.adapterContractSha256}),evidenceSha256:hash('advisor-compat')});}});
 const adapter=createCodexFamilyAdapter(host),contexts=new Map();
 return {host,contract,adapter,contexts,async capture(key){const context=host.createContext({runner:'codex',bindings:{installationBindingSha256:key.installationBindingSha256,accountBindingSha256:key.accountBindingSha256,hostProcessBindingSha256:hash('advisor-host-process')},observedAt:'2026-10-01T12:00:00.000Z',expiresAt:'2026-10-01T12:01:00.000Z'}).value;
   const qualified=host.qualifyContract(contract);const raw=await adapter.captureRawDiscovery(context);if(!raw.ok)return raw;const coverage=adapter.verifyCoverage(raw.value,context,qualified.value);if(!coverage.ok)return coverage;const normalized=adapter.normalizeReleases(raw.value,qualified.value,coverage.value);if(!normalized.ok)return normalized;current=normalized.value;
   const read=host.readDiscovery(current);if(!read.ok)return read;const compatible=adapter.verifyCompatibility({discovery:current,releaseId:read.value.records[0].releaseId,modelId},{taskRoute,role,effort},context,qualified.value);if(!compatible.ok)return compatible;
   const resolverContext={coverage:{familyId,coverageEvidenceSha256:hash('coverage'),unknownTargetFamilyEvidenceSha256s:[]},hardEligibility:{runner:'codex',taskRoute,role,effort,evidenceSha256:hash('hard'),minimumVersion:null,deniedModelIds:[]},variantRule:null,compatibility:{runner:'codex',taskRoute,role,effort,modelId,evidenceSha256:hash('advisor-compat')},latestAlias:null};
   contexts.set(key.invocationId,{context:resolverContext,handle:context,bindings:{installationBindingSha256:key.installationBindingSha256,accountBindingSha256:key.accountBindingSha256,hostProcessBindingSha256:hash('advisor-host-process')}});
   return {ok:true,value:{discoveryHost:host,discoveryHandle:compatible.value.discovery,context:contexts.get(key.invocationId).context}};}};
}

test('active Advisor keeps its signed S4/S2 selection through metadata rechecks and one S5/S6 native launch',async t=>{
 const fx=advisorHostFixture(t),git=args=>execFileSync('git',args,{cwd:fx.root,stdio:['ignore','pipe','pipe']});
 writeFileSync(join(fx.root,'pipeline.user.yaml'),'advisor_export:\n  consent: approved\n');git(['add','pipeline.user.yaml']);git(['commit','--quiet','-m','Add synthetic Advisor consent']);
 const candidate={commit:git(['rev-parse','HEAD']).toString().trim(),tree:git(['rev-parse','HEAD^{tree}']).toString().trim()};
 const common=join(fx.root,'.git');mkdirSync(join(common,'agent-pipeline'),{recursive:true,mode:0o700});
 const appServerPath=join(fx.root,'app-server'),answerPath=join(fx.root,'.native-advisor-answer.json');
 let appServer=readFileSync(fx.script,'utf8');
 appServer=appServer.replace("proposals:[{proposalId:'proposal-1',text:'Synthetic actual managed output suggestion',evidenceReferences:[refs[0]]}]};",
  `proposals:[{proposalId:'proposal-1',text:'Synthetic actual managed output suggestion',evidenceReferences:[refs[0]]}]};require('node:fs').writeFileSync(${JSON.stringify(answerPath)},JSON.stringify(report));`);
 writeFileSync(fx.script,appServer);writeFileSync(appServerPath,appServer);
 const bindings={installationBindingSha256:hash('advisor-install'),accountBindingSha256:hash('advisor-account')},dispatch={dispatchId:'advisor-native-fixture',queueRevision:0,candidateCommit:candidate.commit,candidateTree:candidate.tree};
 const routeSource={ok:true,taskRoutes:[{runner:'codex',taskRoute,role,effort,state:'default',selector:{kind:'model-id',value:modelId}}],configuredRoutes:[{runner:'codex',role,effort,selector:{kind:'model-id',value:modelId}}]};
 const nativeResults=new WeakMap(),actualIdentity=[],models=[[6]],s2=makeS2(models,nativeResults,actualIdentity),{publicKey,privateKey}=generateKeyPairSync('ed25519'),publicPem=publicKey.export({format:'pem',type:'spki'}),trustAnchors=[{keyReference:'advisor-ephemeral-test',publicKeySha256:hash(publicPem)}];
 const assignment={runner:'codex',role,effort,taskRoutes:[taskRoute],familyId,adapterContractSha256:dDigest(s2.contract),minimumVersion:[6],update:'latest'};
 const routeSourceSha256=hash({taskRoutes:routeSource.taskRoutes,configuredRoutes:routeSource.configuredRoutes}),subject={revision:'model-family-v2',predecessorAuthoritySha256:null,routeSourceSha256,assignments:[assignment],migration:null},subjectSha256=hash(subject),candidateAtApproval=candidate;
 const approvalIntent=createPoApprovalIntent({kind:'model-role-policy',featureId:'model-role-routes',planSha256:routeSourceSha256,specSha256:subjectSha256,candidate,policyRevision:'model-family-v2',subjectSha256,decision:'approved'});
 const bundle={schema:'pipeline.model-family-approved-policy.v2',candidateAtApproval,subject,approvalIntent,proof:{schema:'pipeline.po-approval-proof.v1',intentSha256:approvalIntent.sha256,keyReference:trustAnchors[0].keyReference,publicKey:publicPem,signatureBase64:sign(null,Buffer.from(approvalIntent.sha256),privateKey).toString('base64')}};
 const nativeRequests=[],launches=[],live={models,execution:null,args:null,launchResult:null};
 const trustedSources={readAuthorityInputs:()=>({bundle,routeSource,trustAnchors,predecessor:null}),readPinInputs:()=>[],readCurrentCandidate:()=>({candidateCommit:candidate.commit,candidateTree:candidate.tree}),
  captureFreshDiscovery:async({key})=>s2.capture(key),resolveCurrentInvocationIdentity:({invocationId})=>({ok:true,key:{runner:'codex',...bindings,sessionId:'advisor-host-session',invocationId},assignment:{runner:'codex',taskRoute,role,effort,familyId},candidateCommit:candidate.commit,candidateTree:candidate.tree}),
  resolveInvocationContext:({requestedSessionId,invocationId})=>({ok:true,key:{runner:'codex',...bindings,sessionId:requestedSessionId,invocationId},assignment:{runner:'codex',taskRoute,role,effort,familyId},candidateCommit:candidate.commit,candidateTree:candidate.tree}),
  admitNativeRequest:({request,invocation,key,assignment:actualAssignment,rootDir,repositoryRoot,gitCommonDir})=>{nativeRequests.push(request);assert.equal(rootDir,join(common,'agent-pipeline'));assert.equal(repositoryRoot,fx.root);assert.equal(gitCommonDir,common);assert.equal(key.sessionId,'advisor-host-session');assert.equal(actualAssignment.taskRoute,taskRoute);assert.equal(invocation.selectedModelId,modelId);assert.equal(request.sessionId,'advisor-host-session');assert.equal(request.invocationId,dispatch.dispatchId);assert.equal(request.candidate.commit,candidate.commit);assert.equal(request.sources.input.sha256,fx.sources.input.sha256);assert.equal(request.inputContract,'advisor');assert.equal(Object.isFrozen(request),true);return {ok:true,code:'SYNTHETIC-ADMITTED'};},
  launchDriver:async({nativeRequest,driverContext})=>{const consumed=consumeModelFamilyHostDriverContext(driverContext);assert.equal(consumed.ok,true);assert.equal(consumed.value.nativeRequest.requestSha256,nativeRequest.requestSha256);launches.push(nativeRequest);const result=await runIsolatedStructuredHost({codexPath:nativeRequest.codexPath,cwd:nativeRequest.cwd,model:nativeRequest.selectedModelId,effort:nativeRequest.effort,prompt:nativeRequest.prompt,outputSchema:nativeRequest.outputSchema,inputContract:'advisor',advisorRecipeSha256:nativeRequest.recipeSha256,advisorSourceContext:nativeRequest.advisorSourceContext,inputRecheckTimeoutMs:nativeRequest.inputRecheckTimeoutMs,managedProcess:nativeRequest.managedProcess,beforeTurnInput:async metadata=>{if(metadata.requestSha256!==nativeRequest.requestSha256||metadata.recipeSha256!==nativeRequest.recipeSha256)return {decision:'refused'};const recheck=await live.execution.admitInitial(live.args);return {decision:recheck.status==='admitted'?'approved':'refused'};}});live.launchResult=result;if(!result.ok&&!result.observed.finalizedAdvisorFailure)return {ok:false,code:'MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED'};if(!result.ok){const final=JSON.parse(readFileSync(join(result.observed.journalDirectory,ADVISOR_FINALIZATION_FILENAME),'utf8'));live.finalizationFailureCode=final.failureCode??null;}const raw=Object.freeze({kind:'advisor-synthetic-native-return',receiptId:result.observed.receiptId});if(result.ok)nativeResults.set(raw,{modelId,effort,bindings:{...bindings,hostProcessBindingSha256:hash('advisor-host-process')}});return {ok:true,value:{rawHostResult:raw,report:result.report,observed:result.observed}};}};
 const runtimeHost=createModelFamilyRuntimeHost({cwd:fx.root,resolveCommonDir:()=>common,trustedSources,clock:()=>Date.parse('2026-10-01T12:00:30.000Z')}),activation=runtimeHost.store().activate();assert.equal(activation.ok,true,JSON.stringify(activation));
 const entry=createModelFamilyInvocationEntry({runtimeHost,routeSource}),executionHost=createModelFamilyExecutionHost({adapters:{codex:s2.adapter},
  readInvocation:async({invocationId})=>{const held=entry.readHeld({runner:'codex',sessionId:'advisor-host-session',invocationId});return held.ok?pass('SYNTHETIC-S4-READ',{invocation:held.value,bindings:{...bindings,hostProcessBindingSha256:hash('advisor-host-process')},provenanceSha256:hash('advisor-provenance')}):held;},
  readLaunchEvidence:({invocation})=>pass('SYNTHETIC-CONTROLS',{invocationReceiptSha256:invocation.receiptSha256,runner:'codex',supported:{status:'supported',efforts:[effort],evidenceSha256:hash('supported')},requested:{modelId,effort,evidenceSha256:hash('requested')},configured:{modelId,effort,evidenceSha256:hash('configured'),assurance:'host-configured'},execution:{status:'succeeded',evidenceSha256:hash('executed')}}),
  contextForInvocation:({invocation})=>pass('SYNTHETIC-S2-CONTEXT',s2.contexts.get(invocation.invocationId)?.handle??fail('S2-CONTEXT-MISSING')),
  appendExecution:()=>pass('SYNTHETIC-AUDIT',null)});
 const familyPorts={entry,executionHost,requireReady:()=>({status:'ready'}),resolveCodexExecutable:()=>process.execPath},observation=await inspectCodexInitialAdvisorMetadata({repoRoot:fx.root,sources:fx.sources,familyPorts,invocationId:dispatch.dispatchId,expectedCommit:candidate.commit,expectedTree:candidate.tree});
 assert.equal(observation.route.model,modelId);assert.equal(observation.route.effort,effort);
 const native=await createNativeCodexDesignAdvisorExecution({repoRoot:fx.root,sources:fx.sources,featureId:'advisor-feature',profile:'feature',reason:'risk-review',dispatch,familyPorts,initialObservation:observation});
 const sourceBytes=Object.fromEntries(Object.entries(fx.sources).map(([name,source])=>[name,readFileSync(join(fx.root,source.path))]));
 const contextResult=createInitialAdvisorContext({repoFingerprint:fx.repoFingerprint,featureId:'advisor-feature',authoringDispatchId:'elephant-author',initialCandidate:candidate,sources:fx.sources,sourceBytes,reason:'risk-review',routePolicySha256:hostDigest(native.observation.route),createdAt:new Date().toISOString()});assert.equal(contextResult.ok,true,contextResult.code);
 const initialContext=contextResult.context,courseBinding={courseId:'advisor-native-course',initialContextSha256:contextResult.contextSha256,reservationId:'advisor-native-reservation',slot:1,routeStepSha256:hostDigest(native.observation.route)};
 live.execution=native.execution;live.args={initialContext,dispatch,profile:'feature',reason:'risk-review',route:native.observation.route,courseBinding};
 const prepared=await native.execution.prepareInitial(live.args);assert.equal(prepared.ok,true,prepared.code);
 const result=await native.execution.executeInitial(live.args,prepared.preparedRequest);const emittedAnswer=JSON.parse(readFileSync(answerPath,'utf8'));
 const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('\0')===[...keys].sort().join('\0');
 const citationValid=refs=>Array.isArray(refs)&&refs.length<=5&&refs.every((ref,index)=>exact(ref,['path','sha256'])&&Object.values(initialContext.sources).some(source=>canonicalJson(source)===canonicalJson(ref))&&(index===0||refs[index-1].path<ref.path));
 const answerDiagnostics={keys:Object.keys(emittedAnswer).sort(),shape:exact(emittedAnswer,['schema','dispatchId','initialContextSha256','questionSha256','evidenceSha256','answer','evidenceReferences','proposals']),
  schema:emittedAnswer.schema=== 'pipeline.design-advisor-answer.v2',dispatch:emittedAnswer.dispatchId===dispatch.dispatchId,
  context:emittedAnswer.initialContextSha256===courseBinding.initialContextSha256,question:emittedAnswer.questionSha256===initialContext.questionSha256,
  evidence:emittedAnswer.evidenceSha256===initialContext.evidenceSha256,citation:emittedAnswer.evidenceReferences?.[0]?.path===initialContext.sources.design.path&&emittedAnswer.evidenceReferences?.[0]?.sha256===initialContext.sources.design.sha256,
  citationValid:citationValid(emittedAnswer.evidenceReferences),proposalShape:exact(emittedAnswer.proposals?.[0],['proposalId','text','evidenceReferences']),proposalIds:new Set(emittedAnswer.proposals?.map(value=>value.proposalId)).size===emittedAnswer.proposals?.length,
  proposalId:/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(emittedAnswer.proposals?.[0]?.proposalId??''),proposalText:typeof emittedAnswer.proposals?.[0]?.text==='string'&&emittedAnswer.proposals[0].text.trim().length>0,
  proposalCitations:citationValid(emittedAnswer.proposals?.[0]?.evidenceReferences),answerText:typeof emittedAnswer.answer==='string'&&emittedAnswer.answer.trim().length>0,
  canonicalBytes:Buffer.byteLength(canonicalJson(emittedAnswer))};
 const answerBinding={initialContext,dispatch,courseBinding};
 assert.equal(validateCodexAdvisorInitialAnswer(emittedAnswer,answerBinding),true,JSON.stringify({answerDiagnostics,emittedAnswer,expectedSources:initialContext.sources}));
 assert.equal(result.ok,true,JSON.stringify({code:result.code,launch:live.launchResult?.code,failureCode:live.finalizationFailureCode,answerValidation:validateCodexAdvisorInitialAnswer(live.launchResult?.report,answerBinding),report:live.launchResult?.report,observed:live.launchResult?.observed}));assert.equal(result.outcome,'answered');
 assert.equal(nativeRequests.length,1);assert.equal(launches.length,1);assert.equal(launches[0].sessionId,'advisor-host-session');assert.notEqual(launches[0].sessionId,dispatch.dispatchId);assert.equal(result.projection.outcome,'answered');assert.deepEqual(actualIdentity,[{modelId,effort}]);
});

const completionFd=process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD===undefined
 ?openCompletionDescriptor(process.platform==='win32'?'NUL':'/dev/null','w')
 :Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({cases:completionCases,fd:completionFd,
 maxBytes:Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES??'65536')});
