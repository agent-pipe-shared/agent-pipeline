#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Fixed owning-course consumer. Task selectors/content never issue requester authority.
import {realpathSync,lstatSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {isAbsolute,relative,resolve,sep,dirname} from 'node:path';
import {parseStrictJson} from '../lib/governance-event.mjs';
import {inspectSignedDescriptorCustodyRepository} from '../lib/worktree-lifecycle.mjs';
import {createSourceOwnedApprovedControllerRequesterRuntime} from '../lib/session-requester-bridge.mjs';
import {bindOnboardingSessionCleanup,observeSessionCleanupState,releaseOnboardingSessionCleanup} from '../lib/onboarding-continuity.mjs';
import {createSourceOwnedContinuityVerificationController,readOwnedVerificationPhysicalFile,
  recheckOwnedVerificationPhysicalRefs,readOwnedVerificationCandidate,readOwnedVerificationRegistration,collectOwnedVerificationSourceModules} from '../lib/owned-continuity-verification.mjs';

const MAX_INPUT=1048576;
const CHECK_CASES=Object.freeze({
  OSV001:Object.freeze(['standard']),OSV002:Object.freeze(['standard']),OSV003:Object.freeze(['standard']),
  OSV004:Object.freeze(['complete','missing','malformed','duplicate-declaration','incomplete','real-failure']),
  OSV005:Object.freeze(['replay','deadline','disconnect']),OSV006:Object.freeze(['standard']),
  OSV007:Object.freeze(['standard']),OSV008:Object.freeze(['standard'])
});
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
function refuse(code){const error=new Error(code);error.name='OwningVerificationControllerError';error.code=code;throw error;}
function selectors(argv){
  if(argv.length!==6||argv[0]!=='--root'||argv[2]!=='--suite'||argv[4]!=='--task-source')refuse('OVC-INPUT');
  const root=argv[1],suiteId=argv[3],taskSource=argv[5];
  if(!isAbsolute(root)||resolve(root)!==root||realpathSync(root)!==root||process.cwd()!==root
    ||!isAbsolute(taskSource)||resolve(taskSource)!==taskSource||realpathSync(taskSource)!==taskSource
    ||typeof suiteId!=='string'||! /^[a-z0-9][a-z0-9._-]{0,119}$/u.test(suiteId))refuse('OVC-INPUT');
  const tail=relative(root,taskSource);
  if(!tail||tail==='..'||tail.startsWith('..'+sep)||isAbsolute(tail))refuse('OVC-INPUT');
  return {root,suiteId,taskSource};
}
function taskInput(selected){
  const input=readOwnedVerificationPhysicalFile(selected.taskSource,{root:selected.root,maxBytes:MAX_INPUT});
  const value=parseStrictJson(input.bytes);
  if(value?.schema==='pipeline.owning-verification-controller-check.v1'){
    if(!exact(value,['schema','suiteId','caseId','variant'])||value.suiteId!==selected.suiteId
      ||!Object.hasOwn(CHECK_CASES,value.caseId)||!CHECK_CASES[value.caseId].includes(value.variant)
      ||value.suiteId!==value.caseId.toLowerCase()+'-'+value.variant)refuse('OVC-CHECK-INPUT');
    return {value,ref:input.ref,check:true};
  }
  if(!exact(value,['schema','suiteId','files'])||value.schema!=='pipeline.owning-verification-task-source.v1'
    ||value.suiteId!==selected.suiteId||!Array.isArray(value.files)||value.files.length<1||value.files.length>128
    ||value.files.some(file=>!exact(file,['path','source'])||typeof file.path!=='string'||typeof file.source!=='string'))refuse('OVC-TASK-SOURCE');
  return {value,ref:input.ref};
}
// Nonarming observations only. The constructor independently authenticates the
// actual fixed kernel invocation and approval; this reader creates no brands.
export function inspectOwningVerificationControllerTaskSource(input){
  if(!exact(input,['rootDir','suiteId','taskSource']))refuse('OVC-INPUT');
  const selected=selectors(['--root',input.rootDir,'--suite',input.suiteId,'--task-source',input.taskSource]);
  const image=taskInput(selected),repository=inspectSignedDescriptorCustodyRepository(selected.root);
  if(repository.primaryRoot!==selected.root)refuse('OVC-INPUT');
  const registration=readOwnedVerificationRegistration(repository,selected.suiteId);
  try{lstatSync(registration.selectedSuite.file);refuse('OVC-CHECK-TARGET-EXISTS');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(image.check&&image.value.caseId==='OSV002')readOwnedVerificationRegistration(repository,'osv002-missing');
  // Infrastructure root derives only from this installed Source location,
  // separately from the actual owning repository/course/registration.
  const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..','..','..');
  const sourceClosure=collectOwnedVerificationSourceModules({primaryRoot:sourceRoot},[fileURLToPath(import.meta.url)]);
  recheckOwnedVerificationPhysicalRefs([...sourceClosure,image.ref]);
  return Object.freeze({kind:image.check?'check':'task',taskSourceRef:image.ref,sourceClosure,registration});
}
async function runClosedControllerCheck(selected,input,runtime){
  const repository=inspectSignedDescriptorCustodyRepository(selected.root);
  const observed=inspectOwningVerificationControllerTaskSource({rootDir:selected.root,suiteId:selected.suiteId,taskSource:selected.taskSource});
  if(observed.kind!=='check'||JSON.stringify(observed.taskSourceRef)!==JSON.stringify(input.ref))refuse('OVC-CHECK-INPUT');
  const registration=observed.registration,closure=observed.sourceClosure;
  recheckOwnedVerificationPhysicalRefs([...closure,input.ref]);
  const controls=await import('./owning-verification-controller-controls.mjs');
  recheckOwnedVerificationPhysicalRefs([...closure,input.ref]);
  const fresh=readOwnedVerificationRegistration(repository,selected.suiteId);
  if(JSON.stringify(fresh)!==JSON.stringify(registration))refuse('OVC-CHECK-REGISTRATION-DRIFT');
  if(typeof controls.runOwnedControllerCase!=='function')refuse('OVC-CHECK-MODULE');
  const result=await controls.runOwnedControllerCase(Object.freeze({caseId:input.value.caseId,variant:input.value.variant,
    context:Object.freeze({repository,runtimePort:runtime.runtimePort,disposeRequester:runtime.dispose})}));
  // No requester/Controller handle or callback result is serialized as authority.
  recheckOwnedVerificationPhysicalRefs([...closure,input.ref]);
  if(!exact(result,['schema','caseId','variant','status'])
    ||result.schema!=='pipeline.owning-verification-controller-check-result.v1'
    ||result.caseId!==input.value.caseId||result.variant!==input.value.variant||result.status!=='passed')refuse('OVC-CHECK-RESULT');
  return Object.freeze({schema:'pipeline.owning-verification-controller-result.v1',status:'succeeded',code:null,
    suiteId:selected.suiteId,caseId:input.value.caseId,variant:input.value.variant,taskSourceSha256:input.ref.sha256,
    candidate:registration.candidate});
}
function finishOwningControllerLifetime(selected,runtime,result,check){
  // Executed verification and owning terminal release are separate observations.
  // Only the real same-process Source writer may release the original binding.
  let cleanupRelease;
  if(result.status!=='succeeded'){
    cleanupRelease=Object.freeze({status:'held',code:'OVC-VERIFICATION-NOT-TERMINAL',committed:null});
  }else{
    try{
      const before=observeSessionCleanupState(selected.root);
      const released=releaseOnboardingSessionCleanup({rootDir:selected.root,sessionCleanup:runtime.sessionCleanup,
        expectedStateSha256:before.stateSha256,expectedRevision:before.revision});
      const after=observeSessionCleanupState(selected.root);
      if(released?.status!=='released'||released.sessionCleanup!==null||after.sessionCleanup!==null||after.orphanBinding
        ||JSON.stringify(after.state.activeFeature)!==JSON.stringify(before.state.activeFeature)
        ||JSON.stringify(after.state.planApproval)!==JSON.stringify(before.state.planApproval)
        ||after.state.planApproved!==before.state.planApproved)refuse('OVC-RELEASE-READBACK');
      cleanupRelease=Object.freeze({status:'released',code:null,stateSha256:after.stateSha256,
        revision:after.revision,mutated:released.mutated});
    }catch(error){
      const code=/^(?:SDC|SESSION-CLEANUP|OVC)-[A-Z0-9-]{1,80}$/u.test(error?.code??'')?error.code:'OVC-RELEASE-HELD';
      cleanupRelease=Object.freeze({status:'held',code,committed:typeof error?.committed==='boolean'?error.committed:null});
    }
  }
  if(!check&&result.status==='succeeded'&&cleanupRelease.status!=='released'){
    return Object.freeze({...result,status:'held',code:cleanupRelease.code,verificationStatus:result.status,
      cleanupRelease,owningLifetimeReleased:false});
  }
  return Object.freeze({...result,cleanupRelease,owningLifetimeReleased:cleanupRelease.status==='released'});
}
async function runOwningVerificationController(){
  const selected=selectors(process.argv.slice(2)),input=taskInput(selected);
  // The bridge independently authenticates the actual fixed entry/kernel argv,
  // real approved State and genuine process/source facts. This argument grants nothing.
  const runtime=createSourceOwnedApprovedControllerRequesterRuntime({rootDir:selected.root});
  try{return await runtime.run(async()=>{
    recheckOwnedVerificationPhysicalRefs([input.ref]);
    bindOnboardingSessionCleanup({rootDir:selected.root,sessionCleanup:runtime.sessionCleanup,
      expectedStateSha256:runtime.expectedStateSha256,expectedRevision:runtime.expectedRevision});
    if(input.check){
      const checked=await runClosedControllerCheck(selected,input,runtime);
      return finishOwningControllerLifetime(selected,runtime,checked,true);
    }
    const controller=createSourceOwnedContinuityVerificationController({runtimePort:runtime.runtimePort});
    const before=readOwnedVerificationCandidate({primaryRoot:selected.root});
    const authored=controller.authorOwnedTaskVerificationSuite({suiteId:selected.suiteId,files:input.value.files});
    if(authored.status!=='authored'||!authored.taskPreparationHandle)refuse('OVC-AUTHOR-UNAVAILABLE');
    // The selected registered suite is independently rediscovered by the genuine API.
    const registered=readOwnedVerificationRegistration({primaryRoot:selected.root},selected.suiteId);
    const suiteRef=readOwnedVerificationPhysicalFile(registered.selectedSuite.file,{root:selected.root,maxBytes:MAX_INPUT}).ref;
    // Existing protocol permits genuine untracked task files with complete physical
    // custody. Registration was independently committed BEFORE the owning lifetime.
    recheckOwnedVerificationPhysicalRefs([suiteRef,input.ref]);
    const candidate=readOwnedVerificationCandidate({primaryRoot:selected.root});
    if(candidate.commit!==before.commit||candidate.tree!==before.tree)refuse('OVC-CANDIDATE-DRIFT');
    const completed=controller.completeOwnedTaskVerificationRegistration({taskPreparationHandle:authored.taskPreparationHandle});
    if(completed.status!=='registered'||completed.suiteId!==selected.suiteId)refuse('OVC-REGISTRATION-UNAVAILABLE');
    const result=await controller.acquireVerificationPort().execute({suiteId:selected.suiteId});
    const executed=Object.freeze({schema:'pipeline.owning-verification-controller-result.v1',status:result.status,
      code:result.code??null,suiteId:selected.suiteId,associationSha256:completed.associationSha256,
      taskSourceSha256:input.ref.sha256,candidate});
    return finishOwningControllerLifetime(selected,runtime,executed,false);
  });}finally{await runtime.dispose();}
}
const entry=process.argv[1]&&resolve(process.argv[1]);
if(entry===fileURLToPath(import.meta.url)){
  runOwningVerificationController().then(result=>{
    process.stdout.write(JSON.stringify(result)+'\n');process.exitCode=result.status==='succeeded'?0:1;
  }).catch(error=>{
    const code=/^(?:OVC|OSV|SDC)-[A-Z0-9-]{1,80}$/u.test(error?.code??'')?error.code:'OVC-UNAVAILABLE';
    process.stderr.write(JSON.stringify({schema:'pipeline.owning-verification-controller-result.v1',status:'unavailable',code})+'\n');
    process.exitCode=1;
  });
}
