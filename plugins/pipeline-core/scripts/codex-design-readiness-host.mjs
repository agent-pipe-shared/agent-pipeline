// SPDX-License-Identifier: SUL-1.0
/** Codex-only, host-observed tool-free readiness. Never a selected-sandbox fallback. */
import {execFileSync} from 'node:child_process';
import {lstatSync,realpathSync,readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {isAbsolute,resolve,join} from 'node:path';
import {advisoryEvidenceBundleSha256,buildAdvisoryEvidenceBundle} from '../lib/advisory-lifecycle-v2.mjs';
import {canonicalJson} from '../lib/codex-sandbox-compatibility.mjs';
import {resolveV3DutyRoute} from '../lib/critic-route-v3.mjs';
import {resolvePoGateRepositoryTopology,derivePoGateRepositoryFingerprint} from '../lib/po-gate-authority.mjs';
import {validatePipelineUserV3} from '../lib/runner-profiles-v3.mjs';
import {parseYaml} from '../lib/yaml-lite.mjs';
import {createCodexDesignReadinessHostStore} from '../lib/codex-design-readiness-host-store.mjs';
import {runCodexToolFreeDesignReadiness,verifyCodexToolFreeBindingFromSources} from '../lib/codex-tool-free-design-readiness.mjs';
import {hostDigest} from '../lib/codex-host-process-journal.mjs';
import {validateModelFamilyExecutionReceipt} from '../lib/model-family-execution.mjs';
import {rereadCurrentReadinessAdvisorObservation} from '../lib/codex-readiness-finalization.mjs';
import {createModelFamilyRuntimeHost} from '../lib/model-family-runtime-host.mjs';
import {createModelFamilyInvocationEntry} from '../lib/model-family-invocation.mjs';

const NAMES=['input','prd','spec','design','traceability'];
const OID=/^[a-f0-9]{40}$/,SHA=/^[a-f0-9]{64}$/;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('\0')===[...keys].sort().join('\0');
const same=(left,right)=>canonicalJson(left)===canonicalJson(right);
function unavailable(code){return {status:'unavailable',code,readinessReceipt:null,assurance:{class:'no-usable-review',literal:null}};}
function currentCandidate(root){
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000,maxBuffer:524288,stdio:['ignore','pipe','pipe']}).trim();
  return {commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}'])};
}
const FAMILY_PACKET_FIELDS=['runner','sessionId','invocationId','candidateCommit','candidateTree','taskRoute','role','effort','selectedModelId','authoritySha256','discoverySha256','packetBindingSha256'];
function readinessFamilyPacket(receipt){return Object.freeze(Object.fromEntries(FAMILY_PACKET_FIELDS.map(key=>[key,receipt[key]])));}
async function runActiveFamilyReadiness({familyEntry,dispatchId,candidate,readCandidate,repoRoot,repoFingerprint,
  sources,sandboxRuntime,topology,advisorObservationRefs,advisorObservation,dependencies}){
  const executionHost=dependencies.familyExecutionHost;
  if(!executionHost||typeof executionHost.recordModelFamilyExecution!=='function'
    ||typeof executionHost.readExecutionReceipt!=='function')return {code:'MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED',inputDirectory:null};
  if(typeof familyEntry.prepareCurrentModelFamilyInvocation!=='function')return {code:'MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED',inputDirectory:null};
  let prepared;
  try{prepared=await familyEntry.prepareCurrentModelFamilyInvocation({kind:'dispatch',runner:'codex',taskRoute:'duty.readiness',invocationId:dispatchId});}
  catch{return {code:'MODEL-FAMILY-INVOCATION-UNAVAILABLE',inputDirectory:null};}
  if(!prepared?.ok||!exact(prepared.value,['handle','receipt']))return {code:prepared?.code??'MODEL-FAMILY-INVOCATION-UNAVAILABLE',inputDirectory:null};
  const receipt=prepared.value.receipt;
  if(!receipt||receipt.kind!=='model-family-invocation'||receipt.runner!=='codex'||receipt.taskRoute!=='duty.readiness'
    ||!receipt.sessionId||receipt.invocationId!==dispatchId||receipt.candidateCommit!==candidate.commit
    ||receipt.candidateTree!==candidate.tree||typeof receipt.selectedModelId!=='string'||!receipt.selectedModelId
    ||typeof receipt.effort!=='string'||!receipt.effort||!SHA.test(receipt.authoritySha256??'')
    ||!SHA.test(receipt.discoverySha256??'')||!SHA.test(receipt.packetBindingSha256??'')
    ||!Number.isSafeInteger(receipt.storeGeneration)||receipt.storeGeneration<1)return {code:'MODEL-FAMILY-RECEIPT-BINDING',inputDirectory:null};
  if(!same(readCandidate(),candidate))return {code:'CODEX-READINESS-CANDIDATE-DRIFT',inputDirectory:null};
  const route={model:receipt.selectedModelId,effort:receipt.effort,sourceSha256:receipt.authoritySha256,candidateCommit:candidate.commit};
  let store,inputDirectory;
  try{
    store=(dependencies.createHostStore??createCodexDesignReadinessHostStore)({gitCommonDir:topology.gitCommonDir,
      repoFingerprint,trustedExecutablePath:sandboxRuntime.codexPath});
    inputDirectory=mkdtempSync(join(store.processRoot,'input-'));
  }catch{return {code:'CODEX-READINESS-HOST-UNAVAILABLE',inputDirectory:null};}
  const invokeFamily=async request=>{
    if(!exact(request.readinessSourceContext,['repoRoot','candidate','sources'])
      ||request.readinessSourceContext.repoRoot!==repoRoot||!same(request.readinessSourceContext.candidate,candidate)
      ||!same(request.readinessSourceContext.sources,sources)||request.inputContract!=='readiness'
      ||request.codexPath!==sandboxRuntime.codexPath||request.cwd!==inputDirectory
      ||request.model!==receipt.selectedModelId||request.effort!==receipt.effort
      ||typeof request.prompt!=='string'||!request.prompt||!request.outputSchema||typeof request.outputSchema!=='object'
      ||request.startupTimeoutMs!==45_000||request.turnTimeoutMs!==600_000)return {ok:false,code:'MODEL-FAMILY-NATIVE-REQUEST-REFUSED'};
    const requestSha256=hostDigest(JSON.stringify({model:request.model,effort:request.effort,
      prompt:request.prompt,outputSchema:request.outputSchema}));
    const nativeRequest={schema:'pipeline.codex-design-readiness-native-request.v1',runner:'codex',taskRoute:'duty.readiness',
      repoRoot,repoFingerprint,dispatchId,sessionId:receipt.sessionId,invocationId:receipt.invocationId,
      candidate,sources,selectedModelId:receipt.selectedModelId,effort:receipt.effort,
      inputContract:request.inputContract,codexPath:request.codexPath,cwd:request.cwd,prompt:request.prompt,
      outputSchema:request.outputSchema,requestSha256,readinessSourceContext:request.readinessSourceContext,
      readinessAdvisorObservation:request.readinessAdvisorObservation??null,startupTimeoutMs:request.startupTimeoutMs,
      turnTimeoutMs:request.turnTimeoutMs,managedProcess:request.managedProcess};
    let binding;
    try{binding=await familyEntry.bindModelFamilyInvocation({invocation:prepared.value.handle,
      packet:readinessFamilyPacket(receipt),nativeRequest});}
    catch{return {ok:false,code:'MODEL-FAMILY-PRELAUNCH-UNAVAILABLE'};}
    if(!binding?.ok||!binding.value)return {ok:false,code:binding?.code??'MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED'};
    let launched;
    try{launched=await familyEntry.launchModelFamilyInvocation({binding:binding.value});}
    catch{return {ok:false,code:'MODEL-FAMILY-LAUNCH-FAILED'};}
    if(!launched?.ok||!launched.value||!exact(launched.value,['rawHostResult','report','observed']))
      return {ok:false,code:launched?.code??'MODEL-FAMILY-LAUNCH-FAILED'};
    let actual;
    try{actual=await executionHost.recordModelFamilyExecution({invocationId:receipt.invocationId,
      rawHostResult:launched.value.rawHostResult});}
    catch{return {ok:false,code:'MODEL-FAMILY-EXECUTION-IDENTITY-UNAVAILABLE'};}
    if(!actual?.ok||!actual.value)return {ok:false,code:actual?.code??'MODEL-FAMILY-EXECUTION-IDENTITY-UNAVAILABLE'};
    let execution;
    try{execution=executionHost.readExecutionReceipt(actual.value);}catch{return {ok:false,code:'MODEL-FAMILY-EXECUTION-IDENTITY-UNAVAILABLE'};}
    const proof=execution?.value;
    if(!execution?.ok||!validateModelFamilyExecutionReceipt(proof).ok
      ||proof.invocationReceiptSha256!==receipt.receiptSha256||proof.outcome!=='matched'
      ||proof.actualModelIds.length!==1||proof.actualModelIds[0]!==receipt.selectedModelId
      ||proof.actualEffort!==receipt.effort)return {ok:false,code:'MODEL-FAMILY-EXECUTION-IDENTITY-MISMATCH'};
    const observed=launched.value.observed;
    if(!observed||observed.requestSha256!==requestSha256)return {ok:false,code:'MODEL-FAMILY-NATIVE-REQUEST-REFUSED'};
    return {ok:true,report:launched.value.report,observed};
  };
  let result;
  try{result=await (dependencies.runToolFreeReadiness??runCodexToolFreeDesignReadiness)({repoRoot,repoFingerprint,
    dispatchId,candidate,sources,route,codexPath:sandboxRuntime.codexPath,inputDirectory,store,readCandidate,
    advisorObservationRefs,advisorObservation,invokeHost:invokeFamily});}
  catch{return {code:'CODEX-READINESS-HOST-FAILED',inputDirectory};}
  if(result?.status!=='reviewed'||!result.report)return {code:result?.code??'CODEX-READINESS-HOST-UNAVAILABLE',inputDirectory};
  if(!same(readCandidate(),candidate))return {code:'CODEX-READINESS-READBACK-FAILED',inputDirectory};
  return {status:'reviewed',result,inputDirectory};
}
export async function runCodexDesignReadinessHost({repoRoot,repoFingerprint,dispatchId,dispatch,sources,sandboxRuntime,advisorObservationRefs=null,advisorObservation=null},dependencies={}){
  let inputDirectory=null;
  try{
    if(typeof repoRoot!=='string'||!isAbsolute(repoRoot)||resolve(repoRoot)!==repoRoot||realpathSync(repoRoot)!==repoRoot
      ||!lstatSync(repoRoot).isDirectory()||!SHA.test(repoFingerprint??'')||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(dispatchId??'')
      ||!exact(dispatch,['queueRevision','candidateCommit','candidateTree','referenceSetSha256'])
      ||!Number.isSafeInteger(dispatch.queueRevision)||dispatch.queueRevision<0||!OID.test(dispatch.candidateCommit??'')
      ||!OID.test(dispatch.candidateTree??'')||!SHA.test(dispatch.referenceSetSha256??'')||!exact(sources,NAMES))return unavailable('CODEX-READINESS-INPUT');
    // Both standalone host and bootstrap enforce export denial before store creation or provider startup.
    const config=validatePipelineUserV3(parseYaml(readFileSync(join(repoRoot,'pipeline.user.yaml'),'utf8')),{source:'pipeline.user.yaml'});
    if(!config.ok||config.advisoryExport?.consent==='declined')return unavailable('CODEX-READINESS-EXPORT-DENIED');
    const topology=(dependencies.resolveTopology??resolvePoGateRepositoryTopology)(repoRoot);
    if(derivePoGateRepositoryFingerprint({gitCommonDir:topology.gitCommonDir,primaryRoot:topology.primaryRoot})!==repoFingerprint)return unavailable('CODEX-READINESS-REPOSITORY-MISMATCH');
    const candidate={commit:dispatch.candidateCommit,tree:dispatch.candidateTree};
    const familyEntry=dependencies.familyEntry??(dependencies.createFamilyEntry?.(repoRoot,topology)
      ??createModelFamilyInvocationEntry({runtimeHost:createModelFamilyRuntimeHost({cwd:repoRoot,resolveCommonDir:()=>topology.gitCommonDir})}));
    let activation;
    try{activation=familyEntry.observeActivation();}catch{return unavailable('MODEL-FAMILY-ACTIVATION-UNCERTAIN');}
    if(!activation?.ok)return unavailable(activation?.code??'MODEL-FAMILY-ACTIVATION-UNCERTAIN');
    if(activation.status==='active'){
      if(sandboxRuntime?.schema!=='pipeline.codex-sandbox-runtime.v1'||sandboxRuntime.repoRoot!==repoRoot
        ||typeof sandboxRuntime.codexPath!=='string'||!isAbsolute(sandboxRuntime.codexPath))return unavailable('CODEX-READINESS-EXECUTABLE-UNAVAILABLE');
      const active=await runActiveFamilyReadiness({familyEntry,dispatchId,candidate,
        readCandidate:()=> (dependencies.readCandidate??currentCandidate)(repoRoot),repoRoot,repoFingerprint,sources,
        sandboxRuntime,topology,advisorObservationRefs,advisorObservation,dependencies});
      inputDirectory=active.inputDirectory;
      if(active.status!=='reviewed')return unavailable(active.code??'CODEX-READINESS-HOST-UNAVAILABLE');
      try{if(inputDirectory)rmSync(inputDirectory,{recursive:true,force:false});inputDirectory=null;}
      catch(error){if(error?.code!=='ENOENT')return unavailable('CODEX-READINESS-READBACK-FAILED');inputDirectory=null;}
      return {status:'reviewed',readinessReceipt:active.result.report,
        assurance:{class:active.result.assurance??'host-observed-tool-free',literal:null}};
    }
    if(activation.status!=='inactive')return unavailable('MODEL-FAMILY-ACTIVATION-UNCERTAIN');
    const selected=(dependencies.resolveV3ReadinessRoute??resolveV3DutyRoute)({rootDir:repoRoot,dutyId:'readiness',runner:'codex',candidateCommit:candidate.commit});
    if(!exact(selected,['dutyId','runner','model','effort','state','sourceSha256','candidateCommit'])||selected.dutyId!=='readiness'
      ||selected.runner!=='codex'||selected.state!=='default'||selected.candidateCommit!==candidate.commit
      ||!SHA.test(selected.sourceSha256??'')||typeof selected.model!=='string'||!selected.model||typeof selected.effort!=='string'||!selected.effort)return unavailable('CODEX-READINESS-ROUTE-UNAVAILABLE');
    const route=Object.fromEntries(['model','effort','sourceSha256','candidateCommit'].map(key=>[key,selected[key]]));
    for(const name of NAMES){const source=sources[name];if(!exact(source,['path','sha256'])||typeof source.path!=='string'||!SHA.test(source.sha256??''))return unavailable('CODEX-READINESS-SOURCES');}
    const bundle=buildAdvisoryEvidenceBundle(repoRoot,NAMES.map(name=>sources[name].path).sort());
    if(advisoryEvidenceBundleSha256(bundle)!==dispatch.referenceSetSha256||bundle.references.some(entry=>!NAMES.some(name=>sources[name].path===entry.path&&sources[name].sha256===entry.sha256)))return unavailable('CODEX-READINESS-EVIDENCE-MISMATCH');
    if(sandboxRuntime?.schema!=='pipeline.codex-sandbox-runtime.v1'||sandboxRuntime.repoRoot!==repoRoot
      ||typeof sandboxRuntime.codexPath!=='string'||!isAbsolute(sandboxRuntime.codexPath))return unavailable('CODEX-READINESS-EXECUTABLE-UNAVAILABLE');
    const readCandidate=()=> (dependencies.readCandidate??currentCandidate)(repoRoot);
    if(!same(readCandidate(),candidate))return unavailable('CODEX-READINESS-CANDIDATE-DRIFT');
    if(advisorObservation!==null){if(advisorObservationRefs!==null||!same(advisorObservation.candidate,candidate))return unavailable('CODEX-READINESS-ADVISOR-BINDING');advisorObservation=rereadCurrentReadinessAdvisorObservation(repoRoot,advisorObservation,sources,sandboxRuntime.codexPath);}
    const store=(dependencies.createHostStore??createCodexDesignReadinessHostStore)({gitCommonDir:topology.gitCommonDir,repoFingerprint,trustedExecutablePath:sandboxRuntime.codexPath});
    inputDirectory=mkdtempSync(join(store.processRoot,'input-'));
    const result=await (dependencies.runToolFreeReadiness??runCodexToolFreeDesignReadiness)({repoRoot,repoFingerprint,dispatchId,candidate,sources,route,
      codexPath:sandboxRuntime.codexPath,inputDirectory,store,readCandidate,advisorObservationRefs,advisorObservation});
    if(result?.status!=='reviewed'||!result.report)return unavailable(result?.code??'CODEX-READINESS-HOST-UNAVAILABLE');
    const sourceBytes=Object.fromEntries(NAMES.map(name=>[name,{path:sources[name].path,bytes:readFileSync(join(repoRoot,sources[name].path))}]));
    const checked=(dependencies.verifyBinding??verifyCodexToolFreeBindingFromSources)({hostExecution:result.report.hostExecution,report:result.report,
      candidate,sources,route,sourceBytes,store,repoFingerprint,repoRoot,advisorObservationRefs,advisorObservation,trustedAdvisorExecutablePath:sandboxRuntime.codexPath});
    if(!checked.ok||!same(readCandidate(),candidate))return unavailable('CODEX-READINESS-READBACK-FAILED');
    // Only verified closed ownership authorizes removal of the empty input directory.
    rmSync(inputDirectory,{recursive:true,force:false});inputDirectory=null;
    return {status:'reviewed',readinessReceipt:result.report,assurance:{class:'host-observed-tool-free',literal:null}};
  }catch{return unavailable('CODEX-READINESS-HOST-FAILED');}
  // On unverified termination retain input and journal for registered recovery.
}
