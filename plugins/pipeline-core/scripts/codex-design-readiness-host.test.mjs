// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import test from 'node:test';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,lstatSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,isAbsolute,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {advisoryEvidenceBundleSha256,buildAdvisoryEvidenceBundle} from '../lib/advisory-lifecycle-v2.mjs';
import {canonicalJson} from '../lib/codex-sandbox-compatibility.mjs';
import {derivePoGateRepositoryFingerprint} from '../lib/po-gate-authority.mjs';
import {validatePipelineUserV3} from '../lib/runner-profiles-v3.mjs';
import {parseYaml} from '../lib/yaml-lite.mjs';
import {runCodexDesignReadinessHost} from './codex-design-readiness-host.mjs';
import {canonical,createPoApprovalIntent} from '../lib/po-approval-proof.mjs';
import {createModelFamilyRuntimeHost} from '../lib/model-family-runtime-host.mjs';
import {createModelFamilyInvocationEntry} from '../lib/model-family-invocation.mjs';
import {createModelFamilyDiscoveryHost,RULE_FIELDS,pass,fail,digest as discoveryDigest} from '../lib/model-family-discovery.mjs';
import {createCodexFamilyAdapter} from '../lib/model-family-codex-adapter.mjs';
import {createModelFamilyExecutionHost} from '../lib/model-family-execution.mjs';
import {buildCodexToolFreeReadinessRequest} from '../lib/codex-tool-free-design-readiness.mjs';
function fixture(t){
  const root=mkdtempSync(join(tmpdir(),'readiness-activation-fixture-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const common=join(root,'.git');mkdirSync(common);const processes=join(root,'processes');mkdirSync(processes,{mode:0o700});
  writeFileSync(join(root,'pipeline.user.yaml'),readFileSync(new URL('../../../pipeline.user.yaml',import.meta.url)));
  const names=['input','prd','spec','design','traceability'];for(const name of names)writeFileSync(join(root,name+'.md'),'# '+name+'\nFixture.\n');
  const bundle=buildAdvisoryEvidenceBundle(root,names.map(name=>name+'.md').sort());
  const sources=Object.fromEntries(names.map(name=>[name,{path:name+'.md',sha256:bundle.references.find(entry=>entry.path===name+'.md').sha256}]));
  const candidate={commit:'a'.repeat(40),tree:'b'.repeat(40)};
  const repoFingerprint=derivePoGateRepositoryFingerprint({gitCommonDir:common,primaryRoot:root});
  const selected={dutyId:'readiness',runner:'codex',model:'configured-model',effort:'high',state:'default',sourceSha256:'c'.repeat(64),candidateCommit:candidate.commit};
  const args={repoRoot:root,repoFingerprint,dispatchId:'fixture-activation',sources,dispatch:{queueRevision:1,candidateCommit:candidate.commit,candidateTree:candidate.tree,referenceSetSha256:advisoryEvidenceBundleSha256(bundle)},
    sandboxRuntime:{schema:'pipeline.codex-sandbox-runtime.v1',repoRoot:root,codexPath:process.execPath}};
  const calls=[],report={outcome:'ready-for-po-review',hostExecution:{selectionId:'drh_'+ 'd'.repeat(32)}};
  const deps={resolveTopology:()=>({gitCommonDir:common,primaryRoot:root}),resolveV3ReadinessRoute:()=>selected,readCandidate:()=>candidate,
    createHostStore:()=>{calls.push('store');return {processRoot:processes};},runToolFreeReadiness:async request=>{calls.push(request);return {status:'reviewed',report};},
    verifyBinding:request=>{calls.push(request);return {ok:true};}};
  return {root,processes,candidate,args,deps,calls,report,selected};
}
const hash=v=>createHash('sha256').update(typeof v==='string'?v:canonical(v)).digest('hex');
const readinessTask='duty.readiness',familyModel='gpt-6-sol';
async function signedFamilyPorts(fx){
  const effort='high',role='worker',familyId='sol',observedAt='2026-10-01T12:00:00.000Z';
  const install=hash('readiness-install'),account=hash('readiness-account'),processBinding=hash('readiness-process');
  const bindings={installationBindingSha256:install,accountBindingSha256:account,hostProcessBindingSha256:processBinding};
  const taskRoutes=[{runner:'codex',taskRoute:readinessTask,role,effort,state:'default',selector:{kind:'model-id',value:familyModel}}];
  const configuredRoutes=[{runner:'codex',role,effort,selector:taskRoutes[0].selector}];
  const routeSource={ok:true,taskRoutes,configuredRoutes};
  const contract={schema:'pipeline.model-family-adapter-contract.v1',runner:'codex',familyId,
    discoveryModes:['complete-catalogue'],providerEvidenceSha256s:[hash('readiness-provider-contract')]};
  const rules={};let discoveryHandle=null;const nativeResults=new WeakMap();
  for(const name of RULE_FIELDS){
    const rule={id:`readiness-${name}`,version:1,sha256:hash(name)};contract[name]=rule;
    const run=name==='identityRule'?({phase,entry})=>phase==='coverage'
      ?pass('SYNTHETIC',{mode:'complete-catalogue',evidenceSha256:hash('coverage'),latestAliasEvidenceSha256:null})
      :pass('SYNTHETIC',{model:entry.model})
      :name==='releaseGroupingRule'?({entry})=>pass('SYNTHETIC',{releaseId:`sol-${entry.version.join('-')}`,familyId,
        groupingEvidenceSha256:hash('group')})
      :name==='versionRule'?({entry})=>pass('SYNTHETIC',entry.version)
      :name==='variantSelectionRule'?({entry})=>pass('SYNTHETIC',{modelId:entry.model,canonicalModelId:null,aliasEvidenceSha256:null})
      :name==='selectabilityRule'?()=>pass('SYNTHETIC',{released:true,visible:true,selectable:true})
      :name==='effortRule'?()=>pass('SYNTHETIC',{efforts:[effort],capabilityEvidenceSha256:hash('capability')})
      :name==='executionIdentityRule'?({runner,rawHostResult,bindings:actualBindings})=>{
        const actual=nativeResults.get(rawHostResult);
        if(runner!=='codex'||!actual||hash(actualBindings)!==hash(bindings))return fail('SYNTHETIC-EXECUTION-IDENTITY');
        return pass('SYNTHETIC-EXECUTION-IDENTITY',{actualModelIds:[actual.modelId],actualEffort:actual.effort,
          rawHostResultSha256:discoveryDigest(rawHostResult),hostObservationSha256:hash('readiness-native-observation')});
      }
      :({runner:actualRunner,record,variant,slot})=>{
        const discovery=discoveryHandle&&discoveryHost.readDiscovery(discoveryHandle).value;
        return pass('SYNTHETIC-COMPAT',{subjectSha256:discoveryDigest({runner:actualRunner,releaseId:record.releaseId,
          modelId:variant.modelId,...slot,discoverySha256:discoveryDigest(discovery),adapterContractSha256:discovery.adapterContractSha256}),
          evidenceSha256:hash('compatibility')});
      };
    rules[rule.id]={version:rule.version,sha256:rule.sha256,run};
  }
  const discoveryHost=createModelFamilyDiscoveryHost({rules,clock:()=>observedAt,
    compatibility:({runner:actualRunner,record,variant,slot,bindings:actualBindings})=>
      rules[contract.compatibilityRule.id].run({runner:actualRunner,record,variant,slot,bindings:actualBindings,contract}),
    execution:({runner,rawHostResult,bindings:actualBindings})=>{
      const actual=nativeResults.get(rawHostResult);
      if(runner!=='codex'||!actual||hash(actualBindings)!==hash(bindings))return fail('SYNTHETIC-EXECUTION-IDENTITY');
      return pass('SYNTHETIC-EXECUTION-IDENTITY',{actualModelIds:[actual.modelId],actualEffort:actual.effort,
        rawHostResultSha256:discoveryDigest(rawHostResult),hostObservationSha256:hash('readiness-native-observation')});
    },
    capture:async context=>pass('SYNTHETIC-CATALOGUE',{bindings:context.bindings,observedAt:context.observedAt,
      source:'readiness-family-fixture',pages:[{request:{id:1,method:'model/list',params:{cursor:null,limit:100,includeHidden:true}},
        responseBytes:JSON.stringify({id:1,result:{data:[{id:familyModel,model:familyModel,hidden:false,version:[6],released:true,
          supportedReasoningEfforts:[{reasoningEffort:effort}]}],nextCursor:null}})}]}),
    verifyProviderContract:({contractSha256,contract:value})=>pass('SYNTHETIC-CONTRACT',
      {contractSha256,providerEvidenceSha256s:value.providerEvidenceSha256s})});
  const discoveryContext=discoveryHost.createContext({runner:'codex',bindings,
    observedAt,expiresAt:'2026-10-01T12:01:00.000Z'}).value;
  const qualified=discoveryHost.qualifyContract(contract).value,adapter=createCodexFamilyAdapter(discoveryHost);
  const raw=await adapter.captureRawDiscovery(discoveryContext),coverage=adapter.verifyCoverage(raw.value,discoveryContext,qualified);
  const normalized=adapter.normalizeReleases(raw.value,qualified,coverage.value);discoveryHandle=normalized.value;
  const compatible=adapter.verifyCompatibility({discovery:discoveryHandle,releaseId:'sol-6',modelId:familyModel},
    {taskRoute:readinessTask,role,effort},discoveryContext,qualified);
  assert.equal(compatible.ok,true,compatible.code);discoveryHandle=compatible.value.discovery;
  const discovery=discoveryHost.readDiscovery(discoveryHandle).value;
  const prepContext={coverage:{familyId,coverageEvidenceSha256:hash('coverage'),unknownTargetFamilyEvidenceSha256s:[]},
    hardEligibility:{runner:'codex',taskRoute:readinessTask,role,effort,evidenceSha256:hash('hard'),minimumVersion:null,deniedModelIds:[]},
    variantRule:null,compatibility:{runner:'codex',taskRoute:readinessTask,role,effort,modelId:familyModel,evidenceSha256:hash('compatibility')},latestAlias:null};
  const {publicKey,privateKey}=generateKeyPairSync('ed25519'),publicPem=publicKey.export({format:'pem',type:'spki'});
  const trustAnchors=[{keyReference:'readiness-synthetic-key',publicKeySha256:hash(publicPem)}];
  const assignments=[{runner:'codex',role,effort,taskRoutes:[readinessTask],familyId,
    adapterContractSha256:discovery.adapterContractSha256,minimumVersion:[6],update:'latest'}];
  const subject={revision:'model-family-v2',predecessorAuthoritySha256:null,
    routeSourceSha256:hash({taskRoutes,configuredRoutes}),assignments,migration:null};
  const subjectSha256=hash(subject),candidateAtApproval={commit:fx.candidate.commit,tree:fx.candidate.tree};
  const approvalIntent=createPoApprovalIntent({kind:'model-role-policy',featureId:'model-role-routes',
    planSha256:subject.routeSourceSha256,specSha256:subjectSha256,candidate:candidateAtApproval,
    policyRevision:'model-family-v2',subjectSha256,decision:'approved'});
  const bundle={schema:'pipeline.model-family-approved-policy.v2',candidateAtApproval,subject,approvalIntent,
    proof:{schema:'pipeline.po-approval-proof.v1',intentSha256:approvalIntent.sha256,keyReference:trustAnchors[0].keyReference,
      publicKey:publicPem,signatureBase64:sign(null,Buffer.from(approvalIntent.sha256),privateKey).toString('base64')}};
  const common=join(fx.root,'.git'),nativeRequests=[],driverCalls=[],admissionCalls=[];
  mkdirSync(join(common,'agent-pipeline'),{mode:0o700});
  const trustedSources={readAuthorityInputs:()=>({bundle,routeSource,trustAnchors,predecessor:null}),readPinInputs:()=>[],
    captureFreshDiscovery:async()=>({ok:true,value:{discoveryHost,discoveryHandle,context:prepContext}}),
    readCurrentCandidate:()=>({candidateCommit:fx.candidate.commit,candidateTree:fx.candidate.tree}),
    resolveCurrentInvocationIdentity:({runner,taskRoute,invocationId})=>({ok:true,
      key:{runner,installationBindingSha256:install,accountBindingSha256:account,sessionId:'host-session-7',invocationId},
      assignment:{runner,taskRoute,role,effort,familyId},candidateCommit:fx.candidate.commit,candidateTree:fx.candidate.tree}),
    resolveInvocationContext:({runner,requestedSessionId,invocationId})=>({ok:true,
      key:{runner,installationBindingSha256:install,accountBindingSha256:account,sessionId:requestedSessionId,invocationId},
      assignment:{runner,taskRoute:readinessTask,role,effort,familyId},candidateCommit:fx.candidate.commit,candidateTree:fx.candidate.tree}),
    admitNativeRequest:({repositoryRoot,gitCommonDir,rootDir,invocation,key,assignment,request})=>{
      admissionCalls.push(request);assert.equal(repositoryRoot,fx.root);assert.equal(gitCommonDir,common);
      assert.equal(rootDir,join(common,'agent-pipeline'));assert.equal(invocation.sessionId,'host-session-7');
      assert.equal(invocation.invocationId,fx.args.dispatchId);assert.equal(invocation.taskRoute,readinessTask);
      assert.equal(key.sessionId,'host-session-7');assert.equal(assignment.taskRoute,readinessTask);
      assert.equal(request.schema,'pipeline.codex-design-readiness-native-request.v1');
      assert.equal(request.repoRoot,fx.root);assert.equal(request.dispatchId,fx.args.dispatchId);
      assert.equal(request.sessionId,'host-session-7');assert.equal(request.invocationId,fx.args.dispatchId);
      assert.equal(request.selectedModelId,familyModel);assert.equal(request.effort,effort);
      assert.equal(request.candidate.commit,fx.candidate.commit);assert.equal(request.candidate.tree,fx.candidate.tree);
      assert.equal(request.readinessSourceContext.repoRoot,fx.root);assert.equal(request.inputContract,'readiness');
      assert.equal(Object.isFrozen(request),true);assert.throws(()=>{request.prompt='tampered';},TypeError);
      return {ok:true,code:'SYNTHETIC-READINESS-REQUEST-ADMITTED'};
    },
    launchDriver:async({nativeRequest})=>{
      driverCalls.push(nativeRequest);await Promise.resolve();
      const rawHostResult=Object.freeze({kind:'synthetic-codex-native-return',dispatchId:fx.args.dispatchId});
      nativeResults.set(rawHostResult,{modelId:familyModel,effort});
      const report={schema:'pipeline.design-readiness-receipt.v1',dispatchId:fx.args.dispatchId,runner:'codex',
        candidate:fx.candidate,sources:fx.args.sources,outcome:'ready-for-po-review',findings:[],unresolvedChoices:[],summary:'synthetic ready'};
      const observed={receiptId:nativeRequest.managedProcess.receiptId,requestSha256:nativeRequest.requestSha256,
        ownership:{status:'closed'},journalDirectory:join(nativeRequest.managedProcess.journalParent,
          `codex-host-${nativeRequest.managedProcess.receiptId}`),finalizedReadiness:{sha256:hash('synthetic-finalized')}};
      return {ok:true,value:{rawHostResult,report,observed}};
    }};
  const runtimeHost=createModelFamilyRuntimeHost({cwd:fx.root,resolveCommonDir:()=>common,trustedSources,
    clock:()=>Date.parse('2026-10-01T12:00:30.000Z')});
  const activated=runtimeHost.store().activate();assert.equal(activated.ok,true,JSON.stringify(activated));
  const entry=createModelFamilyInvocationEntry({runtimeHost,routeSource});
  const executionHost=createModelFamilyExecutionHost({adapters:{codex:createCodexFamilyAdapter(discoveryHost)},
    readInvocation:async({invocationId})=>{const held=entry.readHeld({runner:'codex',sessionId:'host-session-7',invocationId});
      return held.ok?pass('SYNTHETIC-S4-READ',{invocation:held.value,bindings,provenanceSha256:hash('readiness-s4-provenance')}):held;},
    readLaunchEvidence:({invocation})=>pass('SYNTHETIC-CONTROLS',{invocationReceiptSha256:invocation.receiptSha256,runner:'codex',
      supported:{status:'supported',efforts:[invocation.effort],evidenceSha256:hash('supported')},
      requested:{modelId:invocation.selectedModelId,effort:invocation.effort,evidenceSha256:hash('requested')},
      configured:{modelId:invocation.selectedModelId,effort:invocation.effort,evidenceSha256:hash('configured'),assurance:'host-configured'},
      execution:{status:'succeeded',evidenceSha256:hash('executed')}}),
    contextForInvocation:()=>pass('SYNTHETIC-S2-CONTEXT',discoveryContext),
    appendExecution:()=>pass('SYNTHETIC-EXECUTION-AUDIT',null)});
  return {entry,executionHost,nativeRequests,driverCalls,admissionCalls,routeSource,discovery,cleanup(){rmSync(common,{recursive:true,force:true});}};
}
test('regular host maps only independently verified tool-free result and removes closed input',async t=>{
  const fx=fixture(t),result=await runCodexDesignReadinessHost(fx.args,fx.deps);
  assert.equal(result.status,'reviewed');assert.deepEqual(result.readinessReceipt,fx.report);assert.equal(result.assurance.class,'host-observed-tool-free');
  const request=fx.calls[1];assert.equal(request.route.model,fx.selected.model);assert.deepEqual(request.candidate,fx.candidate);
  assert.throws(()=>lstatSync(request.inputDirectory),{code:'ENOENT'});assert.equal(Object.keys(fx.calls[2].sourceBytes).length,5);
});
test('export declined refuses before store creation and any provider call',async t=>{
  const fx=fixture(t),path=join(fx.root,'pipeline.user.yaml');writeFileSync(path,readFileSync(path,'utf8').replace('consent: "approved"','consent: "declined"'));
  assert.equal((await runCodexDesignReadinessHost(fx.args,fx.deps)).code,'CODEX-READINESS-EXPORT-DENIED');assert.deepEqual(fx.calls,[]);
});
test('foreign repository and candidate route cannot select a provider',async t=>{
  const fx=fixture(t);assert.equal((await runCodexDesignReadinessHost({...fx.args,repoFingerprint:'e'.repeat(64)},fx.deps)).code,'CODEX-READINESS-REPOSITORY-MISMATCH');
  fx.selected.candidateCommit='f'.repeat(40);assert.equal((await runCodexDesignReadinessHost(fx.args,fx.deps)).code,'CODEX-READINESS-ROUTE-UNAVAILABLE');assert.deepEqual(fx.calls,[]);
});
test('source edits and stale dispatch fail before store or model effects',async t=>{
  const fx=fixture(t);writeFileSync(join(fx.root,'spec.md'),'Changed evidence.');assert.equal((await runCodexDesignReadinessHost(fx.args,fx.deps)).code,'CODEX-READINESS-EVIDENCE-MISMATCH');assert.deepEqual(fx.calls,[]);
});
test('host unavailable keeps recovery input and never tries another provider route',async t=>{
  const fx=fixture(t);fx.deps.runToolFreeReadiness=async request=>{fx.calls.push(request);return {status:'unavailable',code:'CTFR-HOST-UNAVAILABLE'};};
  const result=await runCodexDesignReadinessHost(fx.args,fx.deps);assert.equal(result.code,'CTFR-HOST-UNAVAILABLE');assert.equal(result.readinessReceipt,null);
  assert.equal(fx.calls.length,2);assert.equal(lstatSync(fx.calls[1].inputDirectory).isDirectory(),true);
});
test('private readback failure and post-turn candidate drift prevent reviewed publication',async t=>{
  const fx=fixture(t);fx.deps.verifyBinding=()=>({ok:false});assert.equal((await runCodexDesignReadinessHost(fx.args,fx.deps)).code,'CODEX-READINESS-READBACK-FAILED');
  fx.deps.verifyBinding=()=>({ok:true});let reads=0;fx.deps.readCandidate=()=>++reads===1?fx.candidate:{...fx.candidate,commit:'e'.repeat(40)};
  assert.equal((await runCodexDesignReadinessHost(fx.args,fx.deps)).code,'CODEX-READINESS-READBACK-FAILED');
});
test('actual not-ready remains a reviewed refusal of readiness',async t=>{
  const fx=fixture(t);fx.report.outcome='not-ready';const result=await runCodexDesignReadinessHost(fx.args,fx.deps);
  assert.equal(result.status,'reviewed');assert.equal(result.readinessReceipt.outcome,'not-ready');
});
test('active family never consults V3 and missing S6/source identity ports refuse before child preparation',async t=>{
  const fx=fixture(t);let nativeCalls=0,prepareCalls=0;
  fx.deps.familyEntry={observeActivation:()=>({ok:true,status:'active'}),
    prepareCurrentModelFamilyInvocation:async()=>{prepareCalls++;throw new Error('S6 port must be checked first');}};
  fx.deps.resolveV3ReadinessRoute=()=>{throw new Error('V3 route must not be consulted while family authority is active');};
  fx.deps.runToolFreeReadiness=async()=>{nativeCalls++;throw new Error('native runner must not start');};
  const result=await runCodexDesignReadinessHost(fx.args,fx.deps);
  assert.equal(result.code,'MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED');assert.equal(prepareCalls,0);assert.equal(nativeCalls,0);
});
test('active family refuses stale candidate and malformed/copied receipt before binding or child launch',async t=>{
  const fx=fixture(t);let binds=0,children=0;
  const handle=Object.freeze(Object.create(null)),receipt={kind:'model-family-invocation',runner:'codex',sessionId:'host-session',
    invocationId:fx.args.dispatchId,candidateCommit:fx.candidate.commit,candidateTree:fx.candidate.tree,taskRoute:'duty.readiness',
    role:'worker',effort:'high',selectedModelId:'family-model',authoritySha256:'a'.repeat(64),discoverySha256:'b'.repeat(64),
    packetBindingSha256:'c'.repeat(64),storeGeneration:1};
  fx.deps.familyExecutionHost={recordModelFamilyExecution:async()=>({ok:false}),readExecutionReceipt:()=>({ok:false})};
  fx.deps.familyEntry={observeActivation:()=>({ok:true,status:'active'}),
    prepareCurrentModelFamilyInvocation:async()=>({ok:true,value:{handle,receipt:{...receipt,invocationId:'copied-id'}}}),
    bindModelFamilyInvocation:async()=>{binds++;return {ok:true,value:Object.freeze(Object.create(null))};},
    launchModelFamilyInvocation:async()=>{children++;return {ok:true};}};
  fx.deps.resolveV3ReadinessRoute=()=>{throw new Error('no V3 fallback');};
  const malformed=await runCodexDesignReadinessHost(fx.args,fx.deps);
  assert.equal(malformed.code,'MODEL-FAMILY-RECEIPT-BINDING');assert.equal(binds,0);assert.equal(children,0);
  fx.deps.familyEntry.prepareCurrentModelFamilyInvocation=async()=>({ok:true,value:{handle,receipt}});
  fx.deps.readCandidate=()=>({...fx.candidate,commit:'e'.repeat(40)});
  const stale=await runCodexDesignReadinessHost(fx.args,fx.deps);
  assert.equal(stale.code,'CODEX-READINESS-CANDIDATE-DRIFT');assert.equal(binds,0);assert.equal(children,0);
});

test('active readiness carries immutable prompt through real signed S4/S2/S5 and accepts only S6 actual identity',async t=>{
  const fx=fixture(t),ports=await signedFamilyPorts(fx);let launchOutcomes=[],executionReceipt=null,expectedPrompt=null;
  const familyEntry={observeActivation:ports.entry.observeActivation,
    prepareCurrentModelFamilyInvocation:ports.entry.prepareCurrentModelFamilyInvocation,
    bindModelFamilyInvocation:ports.entry.bindModelFamilyInvocation,
    launchModelFamilyInvocation:async({binding})=>{
      const results=await Promise.all([ports.entry.launchModelFamilyInvocation({binding}),
        ports.entry.launchModelFamilyInvocation({binding})]);
      launchOutcomes=results.map(result=>result.ok?result.code:result.code);
      return results.find(result=>result.ok)??results[0];
    }};
  fx.deps.familyEntry=familyEntry;
  fx.deps.familyExecutionHost={recordModelFamilyExecution:args=>ports.executionHost.recordModelFamilyExecution(args),
    readExecutionReceipt(handle){const result=ports.executionHost.readExecutionReceipt(handle);executionReceipt=result.value;return result;}};
  fx.deps.resolveV3ReadinessRoute=()=>{throw new Error('active family must never consult V3');};
  fx.deps.runToolFreeReadiness=async request=>{
    const sourceContent=Object.fromEntries(['input','prd','spec','design','traceability'].map(name=>{
      const source=request.sources[name];return [name,{path:source.path,sha256:source.sha256,
        content:readFileSync(join(request.repoRoot,source.path),'utf8')}];
    }));
    const built=buildCodexToolFreeReadinessRequest({dispatchId:request.dispatchId,candidate:request.candidate,
      sources:request.sources,route:request.route,sourceContent,advisorObservation:null});
    expectedPrompt=built.prompt;
    const hostRequest={inputContract:'readiness',codexPath:request.codexPath,cwd:request.inputDirectory,
      model:request.route.model,effort:request.route.effort,prompt:built.prompt,outputSchema:built.outputSchema,
      readinessSourceContext:{repoRoot:request.repoRoot,candidate:request.candidate,sources:request.sources},
      readinessAdvisorObservation:null,startupTimeoutMs:45_000,turnTimeoutMs:600_000,
      managedProcess:{journalParent:request.store.processRoot,receiptId:'drh_'+'d'.repeat(32),
        binding:{repoFingerprint:request.repoFingerprint,dispatchId:request.dispatchId,
          candidateCommit:request.candidate.commit}}};
    const launchedPromise=request.invokeHost(hostRequest);
    hostRequest.prompt='caller mutation after bind';
    const launched=await launchedPromise;
    return launched.ok?{status:'reviewed',report:launched.report,assurance:'host-observed-tool-free'}
      :{status:'unavailable',code:launched.code};
  };
  try{
    const result=await runCodexDesignReadinessHost(fx.args,fx.deps);
    assert.equal(result.status,'reviewed',result.code);
    assert.equal(result.readinessReceipt.outcome,'ready-for-po-review');
    assert.equal(ports.admissionCalls.length,1);assert.equal(ports.driverCalls.length,1);
    assert.equal(ports.admissionCalls[0].sessionId,'host-session-7');
    assert.equal(ports.admissionCalls[0].sessionId===fx.args.dispatchId,false);
    assert.equal(ports.admissionCalls[0].invocationId,fx.args.dispatchId);
    assert.equal(ports.admissionCalls[0].prompt,expectedPrompt,'payload was snapshotted before caller mutation');
    assert.equal(ports.driverCalls[0].prompt,expectedPrompt);
    assert.equal(ports.driverCalls[0].selectedModelId,familyModel);
    assert.equal(ports.driverCalls[0].effort,'high');
    assert.equal(ports.driverCalls[0].candidate.commit,fx.candidate.commit);
    assert.equal(ports.driverCalls[0].repoRoot,fx.root);
    assert.equal(launchOutcomes.filter(code=>code==='MODEL-FAMILY-LAUNCH-RETURNED').length,1);
    assert.equal(launchOutcomes.filter(code=>code==='MODEL-FAMILY-NATIVE-CAPABILITY-REQUIRED').length,1);
    assert.equal(executionReceipt.outcome,'matched');
    assert.deepEqual(executionReceipt.actualModelIds,[familyModel]);
    assert.equal(executionReceipt.actualEffort,'high');
    assert.equal(lstatSync(fx.processes).isDirectory(),true);
    assert.equal(ports.discovery.schema,'pipeline.model-family-discovery.v1');
  }finally{ports.cleanup();}
});
