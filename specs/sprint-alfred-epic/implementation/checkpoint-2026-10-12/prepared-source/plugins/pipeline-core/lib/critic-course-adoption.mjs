// SPDX-License-Identifier: SUL-1.0
/** Prospective accepted-course candidate preparation. No raw selection is authority.
 * Publication remains closed until the original issuer/ownership carrier is qualified. */
import {createHash} from 'node:crypto';
import {constants,openSync,closeSync,fstatSync,lstatSync,readFileSync,realpathSync} from 'node:fs';
import {isAbsolute,join,relative,resolve,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonicalJson} from './review-economy.mjs';
import {discoverRepository} from './worktree-lifecycle.mjs';
import {readState,readAcceptedDeliveryContract,observeCurrentPlanApprovalForCalibration} from '../scripts/pipeline-state.mjs';
import {parseAcceptedCriticCriterion} from './critic-accepted-contract.mjs';
import {readRetainedCriticAdoptionOwnership,publishRetainedCriticCourseAdoption,readRetainedCriticCourseAdoption} from './critic-generic-batch.mjs';
import {verifyQualityPackageIntegrationPostCommit} from './signed-quality-package.mjs';
import {inspectAcceptedCourseCandidateCorpus} from '../scripts/check-critic-skip-coverage.mjs';
import {validateDispatchRecord,validatePreviousDispatchRecord,validateLegacyDispatchRecord,DISPATCH_RECORD_SCHEMA,PREVIOUS_DISPATCH_RECORD_SCHEMA,LEGACY_DISPATCH_RECORD_SCHEMA} from './dispatch-record.mjs';

export const CRITIC_COURSE_ADOPTION_SELECTION_SCHEMA='pipeline.critic-course-adoption-selection.v1';
export const CRITIC_COURSE_ADOPTION_PLAN_SCHEMA='pipeline.critic-course-adoption-plan.v1';
const OID=/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u,SHA=/^[a-f0-9]{64}$/u;
const keys=['schema','candidateCommit','historicalBaseCommit','functionalParentCommit','signedImportAnchor','acceptedCourseReference','membershipReference','historicalDebtDecisionReference'];
const handles=new WeakMap();
const digest=value=>createHash('sha256').update(Buffer.isBuffer(value)?value:canonicalJson(value)).digest('hex');
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
const exact=(value,names)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===names.length&&names.every(k=>Object.hasOwn(value,k));
const fail=code=>{throw Object.assign(new Error(code),{code});};
const held=code=>Object.freeze({schema:CRITIC_COURSE_ADOPTION_PLAN_SCHEMA,status:'held',code,scope:'fresh-review-preparation-only',qualification:'unknown',stateMutated:false,packetCreated:false,spawnAuthorized:false});
export function isCriticCourseAdoptionPath(path){return typeof path==='string'&&path.length>0&&path.length<=240&&!isAbsolute(path)&&!path.includes('\\')&&!path.includes('\0')&&path.split('/').every(p=>p&&p!=='.'&&p!=='..');}
function ref(value){return exact(value,['path','sha256'])&&isCriticCourseAdoptionPath(value.path)&&SHA.test(value.sha256);}
export function validateCriticCourseAdoptionSelection(value){
  if(!exact(value,keys)||value.schema!==CRITIC_COURSE_ADOPTION_SELECTION_SCHEMA
    ||![value.candidateCommit,value.historicalBaseCommit,value.functionalParentCommit].every(v=>typeof v==='string'&&OID.test(v))
    ||!exact(value.signedImportAnchor,['schema','intentSha256','integrationCommit'])
    ||value.signedImportAnchor.schema!=='pipeline.signed-quality-import-review-anchor.v1'
    ||!SHA.test(value.signedImportAnchor.intentSha256??'')||!OID.test(value.signedImportAnchor.integrationCommit??'')
    ||![value.acceptedCourseReference,value.membershipReference,value.historicalDebtDecisionReference].every(ref))return {ok:false,code:'CA-SELECTION'};
  const selected=[value.acceptedCourseReference.path,value.membershipReference.path,value.historicalDebtDecisionReference.path];
  return new Set(selected).size===selected.length?{ok:true}:{ok:false,code:'CA-REFERENCE-ALIASED'};
}
function physical(root,path){
  if(!isCriticCourseAdoptionPath(path))fail('CA-PATH');
  let cursor=root;
  for(const part of path.split('/')){cursor=join(cursor,part);if(lstatSync(cursor).isSymbolicLink())fail('CA-PHYSICAL');}
  const before=lstatSync(cursor);
  if(!before.isFile()||before.nlink!==1||before.size>1048576||realpathSync(cursor)!==cursor)fail('CA-PHYSICAL');
  const matches=s=>s.isFile()&&['dev','ino','mode','nlink','size','mtimeMs','ctimeMs'].every(k=>s[k]===before[k]);
  const fd=openSync(cursor,constants.O_RDONLY|(constants.O_NOFOLLOW??0));let bytes;
  try{if(!matches(fstatSync(fd)))fail('CA-CAS');bytes=readFileSync(fd);if(bytes.length!==before.size||!matches(fstatSync(fd))||!matches(lstatSync(cursor)))fail('CA-CAS');}finally{closeSync(fd);}
  return {bytes,fact:{path,sha256:digest(bytes),byteLength:bytes.length,mode:before.mode&0o777,device:before.dev,inode:before.ino}};
}
function selectedFile(root,reference){const image=physical(root,reference.path);if(image.fact.sha256!==reference.sha256)fail('CA-REFERENCE-DRIFT');return image;}
function git(root,args,bytes=false){const result=spawnSync('git',['-C',root,...args],{encoding:bytes?undefined:'utf8',shell:false,timeout:5000,maxBuffer:4*1024*1024,env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^GIT_/iu.test(k)))});if(result.error||result.signal||result.status!==0)fail('CA-GIT-UNAVAILABLE');return bytes?Buffer.from(result.stdout):result.stdout.trim();}
function sourceBound(reference,sources){return sources.some(s=>s.path===reference.path&&s.sha256===reference.sha256);}
function observe(rootDir,selection,{preparing=true}={}){
  if(!validateCriticCourseAdoptionSelection(selection).ok)fail('CA-SELECTION');
  if(typeof rootDir!=='string'||!isAbsolute(rootDir)||resolve(rootDir)!==rootDir||realpathSync(rootDir)!==rootDir)fail('CA-ROOT');
  const root=rootDir,repository=discoverRepository(root);
  if(!repository?.primaryRoot||!repository.commonDir)fail('CA-ROOT');
  const candidate={commit:git(root,['rev-parse','HEAD']),tree:git(root,['rev-parse','HEAD^{tree}'])};
  if(candidate.commit!==selection.candidateCommit||!OID.test(candidate.tree))fail('CA-CANDIDATE');
  const parent=git(root,['show','-s','--format=%P',candidate.commit]);
  if(parent!==selection.functionalParentCommit)fail('CA-PARENT');
  git(root,['merge-base','--is-ancestor',selection.historicalBaseCommit,candidate.commit]);
  git(root,['merge-base','--is-ancestor',selection.signedImportAnchor.integrationCommit,selection.functionalParentCommit]);
  const approval=observeCurrentPlanApprovalForCalibration({rootDir:root});
  if(approval.status!=='eligible')fail('CA-COURSE-UNAVAILABLE');
  const state=readState(root);
  if(state.status!=='ok'||state.state.planApproval?.acceptedContract?.path!==selection.acceptedCourseReference.path
    ||state.state.planApproval.acceptedContract.sha256!==selection.acceptedCourseReference.sha256)fail('CA-ACCEPTED-CONTRACT-UNAVAILABLE');
  const accepted=readAcceptedDeliveryContract({dir:root,envelopePath:selection.acceptedCourseReference.path});
  if(!accepted.ok||accepted.envelopeSha256!==selection.acceptedCourseReference.sha256||accepted.featureId!==state.state.activeFeature?.id)fail('CA-ACCEPTED-CONTRACT-UNAVAILABLE');
  const acceptedSources=[accepted.sources.prd,accepted.sources.spec,...accepted.sources.companions];
  if(!sourceBound(selection.membershipReference,acceptedSources)||!sourceBound(selection.historicalDebtDecisionReference,acceptedSources))fail('CA-MEMBERSHIP-UNBOUND');
  const contract=selectedFile(root,selection.acceptedCourseReference),mapping=selectedFile(root,selection.membershipReference),policy=selectedFile(root,selection.historicalDebtDecisionReference);
  const membership=JSON.parse(mapping.bytes),decision=JSON.parse(policy.bytes);
  if(!exact(membership,['schema','featureId','originalBatchRef','items','provenance'])||membership.schema!=='pipeline.critic-course-membership.v1'
    ||membership.featureId!==accepted.featureId||!Array.isArray(membership.items)||membership.items.length===0||membership.items.length>128)fail('CA-MEMBERSHIP');
  if(!exact(decision,['schema','scope','targetKind','membershipSha256','historicalDebt'])||decision.schema!=='pipeline.critic-course-adoption-policy.v1'
    ||decision.scope!=='fresh-review-preparation-only'||decision.targetKind!=='accepted-course-candidate'||decision.membershipSha256!==mapping.fact.sha256)fail('CA-POLICY-UNAVAILABLE');
  const sourceBindings=acceptedSources.map(s=>({...s,role:s.path===accepted.sources.spec.path?'spec':s.path===accepted.sources.prd.path?'prd':'companion'}));
  const work=[],facts=[contract.fact,mapping.fact,policy.fact];
  for(const item of membership.items){
    if(!exact(item,['logicalWorkId','criterionLocator'])||typeof item.logicalWorkId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/u.test(item.logicalWorkId))fail('CA-MEMBERSHIP');
    const located=physical(root,item.criterionLocator?.sourcePath),criterion=parseAcceptedCriticCriterion({sourceBytes:located.bytes,locator:item.criterionLocator,packageContext:{featureId:accepted.featureId,sourceBindings}});
    if(!['explicit-actual-independent-pass','no-explicit-criterion'].includes(criterion.status))fail('CA-CRITERION-UNBOUND');
    facts.push(located.fact);work.push(item.logicalWorkId);
  }
  if(new Set(work).size!==work.length||!same([...work].sort(),work))fail('CA-MEMBERSHIP');
  if(!exact(membership.provenance,['integrationCommit','intentSha256','functionalParentCommit'])
    ||membership.provenance.integrationCommit!==selection.signedImportAnchor.integrationCommit
    ||membership.provenance.intentSha256!==selection.signedImportAnchor.intentSha256
    ||membership.provenance.functionalParentCommit!==selection.functionalParentCommit)fail('CA-PROVENANCE-UNBOUND');
  const signed=verifyQualityPackageIntegrationPostCommit({repoRoot:root,commitSha:selection.signedImportAnchor.integrationCommit,intentSha256:selection.signedImportAnchor.intentSha256});
  if(!signed?.ok||signed.code!=='QUALITY-PACKAGE-INTEGRATION-POSTCOMMIT-VERIFIED'||signed.intentSha256!==selection.signedImportAnchor.intentSha256)fail('CA-PROVENANCE-UNBOUND');
  // A distinct aggregate-bound policy may name exact historical debt. Preserve
  // M4's byte/mode/base/excluded-current-task semantics; no old validator changes.
  const debt=decision.historicalDebt;
  if(!exact(debt,['scope','qualification','baseCommit','entries'])||debt.scope!=='fresh-review-admission-only'||debt.qualification!=='unknown'
    ||debt.baseCommit!==selection.historicalBaseCommit||!Array.isArray(debt.entries)||debt.entries.length>512)fail('CA-HISTORICAL-DEBT');
  const debtFacts=[],debtPaths=new Set();
  for(const entry of debt.entries){
    if(!exact(entry,['path','sha256','mode'])||!isCriticCourseAdoptionPath(entry.path)||!/^evidence\/dispatch-record-[^/]+\.json$/u.test(entry.path)
      ||!SHA.test(entry.sha256)||![0o644,0o755].includes(entry.mode)||debtPaths.has(entry.path))fail('CA-HISTORICAL-DEBT');
    debtPaths.add(entry.path);const image=physical(root,entry.path);let record,defective=false;
    try{record=JSON.parse(image.bytes);if(record.schema===DISPATCH_RECORD_SCHEMA)validateDispatchRecord(record);else if(record.schema===PREVIOUS_DISPATCH_RECORD_SCHEMA)validatePreviousDispatchRecord(record);else if(record.schema===LEGACY_DISPATCH_RECORD_SCHEMA)validateLegacyDispatchRecord(record);else if(!['pipeline.dispatch-record.v1','pipeline.dispatch-evidence.v1',undefined].includes(record.schema))defective=true;}catch{defective=true;}
    if(!defective||record?.taskId==='signed-import-'+selection.signedImportAnchor.intentSha256||image.fact.sha256!==entry.sha256||image.fact.mode!==entry.mode)fail('CA-HISTORICAL-DEBT');
    const row=git(root,['ls-tree',selection.historicalBaseCommit,'--',entry.path]);const match=/^(100644|100755) blob ([a-f0-9]{40,64})\t/u.exec(row);
    if(!match||match[1]!==((entry.mode&0o111)?'100755':'100644')||!git(root,['cat-file','blob',match[2]],true).equals(image.bytes))fail('CA-HISTORICAL-DEBT');
    facts.push(image.fact);debtFacts.push({...entry,byteLength:image.bytes.length,anchorBlob:match[2],qualification:'unknown'});
  }
  const historical={scope:debt.scope,qualification:'unknown',baseCommit:debt.baseCommit,entries:debtFacts,policySha256:policy.fact.sha256,authorityBasis:accepted.authorityBasis};
  const corpus=inspectAcceptedCourseCandidateCorpus({root,taskId:'signed-import-'+selection.signedImportAnchor.intentSha256,candidateCommit:candidate.commit,historicalEntries:debtFacts});
  if(corpus.status!=='observed')fail('CA-CORPUS-UNAVAILABLE');
  const ownership=readRetainedCriticAdoptionOwnership({repoRoot:root,controlRoot:join(repository.commonDir,'agent-pipeline','critic-packets'),batchRef:membership.originalBatchRef,logicalWorkIds:work});
  if(ownership.status!=='observed')fail(ownership.code??'CA-OWNERSHIP-UNAVAILABLE');
  if(preparing&&ownership.fullConsumed>0)fail('CA-CORRECTION-CARRIER-REQUIRED');
  const mainRef=git(repository.primaryRoot,['symbolic-ref','HEAD']),primaryCommit=git(repository.primaryRoot,['rev-parse',mainRef]);
  const ancestry=spawnSync('git',['-C',root,'merge-base','--is-ancestor',candidate.commit,primaryCommit],{shell:false,timeout:5000,stdio:'ignore',env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^GIT_/iu.test(k)))});
  if(ancestry.error||ancestry.signal||![0,1].includes(ancestry.status))fail('CA-GIT-UNAVAILABLE');
  const observation={candidate,featureId:accepted.featureId,approvalSha256:approval.approvalSha256,stateSha256:approval.stateSha256,acceptedEnvelopeSha256:accepted.envelopeSha256,
    logicalWorkIds:work,ownership:{batchRef:ownership.batchRef,logicalWorkIds:ownership.logicalWorkIds,registrationSha256:ownership.registrationSha256,newOwnership:false},historical,corpus:{sha256:corpus.corpusSha256,recordCount:corpus.recordCount},physical:facts,
    specification:{path:accepted.sources.spec.path,sha256:accepted.sources.spec.sha256},guardrailPaths:ownership.guardrailPaths,
    lineage:{historicalBaseCommit:selection.historicalBaseCommit,functionalParentCommit:selection.functionalParentCommit,integrationCommit:selection.signedImportAnchor.integrationCommit},
    primary:{mainRef,commit:primaryCommit,status:ancestry.status===0?'integrated':'not-integrated'}};
  const fresh=observeCurrentPlanApprovalForCalibration({rootDir:root});
  if(fresh.status!=='eligible'||fresh.stateSha256!==approval.stateSha256||fresh.approvalSha256!==approval.approvalSha256)fail('CA-CAS');
  for(const fact of facts)if(!same(physical(root,fact.path).fact,fact))fail('CA-CAS');
  if(git(root,['rev-parse','HEAD'])!==candidate.commit||git(repository.primaryRoot,['rev-parse',mainRef])!==primaryCommit)fail('CA-CAS');
  return observation;
}
/** No dependency callbacks or foreign producer JSON are accepted. */
export function planCriticCourseAdoption(input){
  try{if(!exact(input,['rootDir','selection']))return held('CA-INPUT');const selection=structuredClone(input.selection),facts=observe(input.rootDir,selection);
    const handle=Object.freeze({});handles.set(handle,{rootDir:input.rootDir,selection,facts});
    return Object.freeze({schema:CRITIC_COURSE_ADOPTION_PLAN_SCHEMA,status:'source-bound-preparation',code:'CA-PREPARED',scope:'fresh-review-preparation-only',qualification:'unknown',candidate:facts.candidate,primary:facts.primary,logicalWorkIds:facts.logicalWorkIds,budgetOwnership:facts.ownership,planSha256:digest(facts),handle,stateMutated:false,packetCreated:false,spawnAuthorized:false});
  }catch(error){return held(/^CA-|^CGB-ADOPTION-/u.test(error.code??'')?error.code:'CA-SOURCE-UNAVAILABLE');}
}
/** An opaque same-process handle is still preparation, never registration authority. */
export function inspectCriticCourseAdoptionHandle({rootDir,handle}={}){
  try{const bound=handles.get(handle);if(!bound||bound.rootDir!==rootDir)return held('CA-HANDLE');const fresh=observe(rootDir,bound.selection);if(!same(fresh,bound.facts))return held('CA-CAS');return Object.freeze({status:'source-bound-preparation',code:'CA-PREPARED',candidate:fresh.candidate,primary:fresh.primary,planSha256:digest(fresh),qualification:'unknown'});}catch(error){return held(error.code??'CA-SOURCE-UNAVAILABLE');}
}
/** Source consumers require this genuine handle, never a caller's descriptor. */
export function readSourceOwnedCriticAdoptionFacts({rootDir,handle}={}){const observed=inspectCriticCourseAdoptionHandle({rootDir,handle});if(observed.status!=='source-bound-preparation')return observed;const bound=handles.get(handle);return {status:'observed',rootDir,selection:structuredClone(bound.selection),facts:structuredClone(bound.facts),planSha256:observed.planSha256};}
export function publishCriticCourseAdoption({rootDir,handle,expectedPlanSha256}={}){const current=inspectCriticCourseAdoptionHandle({rootDir,handle});if(current.status!=='source-bound-preparation'||current.planSha256!==expectedPlanSha256)return held('CA-PUBLICATION-CAS');return publishRetainedCriticCourseAdoption({rootDir,handle,expectedPlanSha256});}
/** A retained source descriptor is data until the actual default readers revalidate it. */
export function revalidatePublishedCriticAdoptionDescriptor({rootDir,descriptor}={}){try{if(!exact(descriptor,['schema','rootDir','selection','facts','planSha256'])||descriptor.schema!=='pipeline.critic-course-adoption-descriptor.v1'||descriptor.rootDir!==rootDir||digest(descriptor.facts)!==descriptor.planSha256)return held('CA-DESCRIPTOR');const fresh=observe(rootDir,descriptor.selection,{preparing:false});return same(fresh,descriptor.facts)?{status:'observed',facts:fresh,planSha256:descriptor.planSha256}:held('CA-CAS');}catch(error){return held(error.code??'CA-SOURCE-UNAVAILABLE');}}
export function readPublishedCriticCourseAdoption({rootDir,reference}={}){return readRetainedCriticCourseAdoption({rootDir,reference});}
export function readCriticCourseAdoptionSelection({rootDir,path}={}){try{if(typeof rootDir!=='string'||realpathSync(rootDir)!==rootDir||!isCriticCourseAdoptionPath(path)||!path.startsWith('scratch/'))return {ok:false,code:'CA-SELECTION-PATH'};const value=JSON.parse(physical(rootDir,path).bytes);const valid=validateCriticCourseAdoptionSelection(value);return valid.ok?{ok:true,selection:value}:valid;}catch{return {ok:false,code:'CA-SELECTION-UNAVAILABLE'};}}
