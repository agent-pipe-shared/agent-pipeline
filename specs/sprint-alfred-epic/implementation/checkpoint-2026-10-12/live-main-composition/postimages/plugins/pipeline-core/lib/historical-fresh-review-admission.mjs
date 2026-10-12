// SPDX-License-Identifier: SUL-1.0
/** M4A: exact historical debt permits preparation only; never completion. */
import {createHash,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {closeSync,existsSync,fsyncSync,linkSync,lstatSync,mkdirSync,openSync,readFileSync,readdirSync,realpathSync,unlinkSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical,createPoApprovalIntent,verifyPoApprovalProof} from './po-approval-proof.mjs';
import {readHumanApprovalMode} from './critical-human-proof-policy.mjs';
import {requireAttendedChatGateConfirmation} from './chat-gate-ceremony.mjs';
import {derivePoGateRepositoryFingerprint,validatePoGateAuthorityForRepository} from './po-gate-authority.mjs';
import {resolveAuthorityArtifactPath} from './project-authority.mjs';
import {resolvePoKeyDirectory} from '../scripts/po-human-approval.mjs';
import {observeHistoricalFreshReviewTargetAuthority} from '../scripts/check-critic-skip-coverage.mjs';
import {validateDispatchRecord,validatePreviousDispatchRecord,validateLegacyDispatchRecord,DISPATCH_RECORD_SCHEMA,PREVIOUS_DISPATCH_RECORD_SCHEMA,LEGACY_DISPATCH_RECORD_SCHEMA} from './dispatch-record.mjs';
import {assessWindowsPrivatePath,hardenWindowsPrivateDirectory} from './windows-private-state.mjs';

export const HISTORICAL_FRESH_REVIEW_REQUEST_SCHEMA='pipeline.historical-fresh-review-request.v1';
const INVENTORY_SCHEMA='pipeline.historical-fresh-review-inventory.v1';
const SCOPE='fresh-review-admission-only';
const OID=/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const handles=new WeakMap();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=value=>sha(canonical(value));
const serialized=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const own=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
function fail(code){const error=new Error(code);error.code=code;throw error;}
function unavailable(code){return {status:'unavailable',code,qualification:'unknown',scope:SCOPE};}
function git(root,args){return execFileSync('git',args,{cwd:root,encoding:'buffer',shell:false,timeout:5000,maxBuffer:4*1024*1024,env:Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/iu.test(key)))});}
function text(root,args){return git(root,args).toString('utf8').trim();}
function safePath(root,path){
  if(typeof path!=='string'||!path||isAbsolute(path)||path.includes('\\')||path.split('/').some(part=>!part||part==='.'||part==='..'))fail('HFR-PATH');
  let cursor=root;
  for(const part of path.split('/')){cursor=join(cursor,part);if(lstatSync(cursor).isSymbolicLink())fail('HFR-ALIAS');}
  const absolute=realpathSync(cursor),rel=relative(root,absolute);
  if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))fail('HFR-PATH');
  return absolute;
}
function file(root,path,max=1048576){
  const absolute=safePath(root,path),before=lstatSync(absolute);
  if(!before.isFile()||before.nlink!==1||before.size>max)fail('HFR-PHYSICAL-FILE');
  const bytes=readFileSync(absolute),after=lstatSync(absolute);
  if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||after.nlink!==1)fail('HFR-FILE-DRIFT');
  return {bytes,fact:{path,sha256:sha(bytes),byteLength:bytes.length,mode:after.mode&0o777,device:after.dev,inode:after.ino}};
}
function privateDirectory(path,create=false){
  if(create&&!existsSync(path))mkdirSync(path,{mode:0o700});
  const info=lstatSync(path);
  if(!info.isDirectory()||info.isSymbolicLink()||realpathSync(path)!==path)fail('HFR-CONTROL');
  if(process.platform==='win32'){
    if(create&&hardenWindowsPrivateDirectory(path).status!=='secure')fail('HFR-WINDOWS-UNAVAILABLE');
    if(assessWindowsPrivatePath(path).status!=='secure')fail('HFR-WINDOWS-UNAVAILABLE');
  }else if((info.mode&0o077)!==0)fail('HFR-CONTROL');
  return path;
}
function exclusive(path,value){
  const bytes=serialized(value),temporary=path+'.tmp-'+process.pid+'-'+randomBytes(8).toString('hex');
  const fd=openSync(temporary,'wx',0o600);
  try{
    try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
    linkSync(temporary,path); // exact completed bytes; an existing snapshot never gets replaced
  }finally{unlinkSync(temporary);}
  if(process.platform!=='win32'){const parent=openSync(dirname(path),'r');try{fsyncSync(parent);}finally{closeSync(parent);}}
  else if(assessWindowsPrivatePath(path).status!=='secure')fail('HFR-WINDOWS-UNAVAILABLE');
  return sha(bytes);
}
function context(repository,currentTarget){
  const root=realpathSync(resolve(repository));
  if(!own(currentTarget,['kind','taskId','baseCommit','candidateCommit'])||!['admitted-dispatch','signed-quality-import'].includes(currentTarget.kind)
    ||typeof currentTarget.taskId!=='string'||!currentTarget.taskId||currentTarget.taskId.length>160||/[\u0000-\u001f\u007f]/u.test(currentTarget.taskId)||![currentTarget.baseCommit,currentTarget.candidateCommit].every(value=>OID.test(value)))fail('HFR-TARGET');
  const commit=text(root,['rev-parse','HEAD']),tree=text(root,['rev-parse','HEAD^{tree}']);
  if(commit!==currentTarget.candidateCommit||text(root,['cat-file','-t',commit])!=='commit')fail('HFR-CANDIDATE');
  const baseType=text(root,['cat-file','-t',currentTarget.baseCommit]);
  if(baseType==='commit')git(root,['merge-base','--is-ancestor',currentTarget.baseCommit,commit]);
  else if(baseType!=='tree'||text(root,['hash-object','-t','tree','--stdin'])!==currentTarget.baseCommit)fail('HFR-BASE');
  const common=realpathSync(resolve(root,text(root,['rev-parse','--git-common-dir'])));
  const repositoryFingerprint=derivePoGateRepositoryFingerprint({gitCommonDir:common,primaryRoot:root});
  return {root,common,repositoryFingerprint,target:{...currentTarget,candidateTree:tree},key:digest({repositoryFingerprint,currentTarget})};
}
function authoritySources(ctx){
  const authority=validatePoGateAuthorityForRepository({repoRoot:ctx.root});
  if(!authority.ok||typeof authority.value?.planPath!=='string')fail('HFR-PLAN-AUTHORITY-UNAVAILABLE');
  const statePath=resolveAuthorityArtifactPath('state',{rootDir:ctx.root}).relPath;
  if(typeof statePath!=='string')fail('HFR-STATE-UNAVAILABLE');
  const stateFile=file(ctx.root,statePath),state=JSON.parse(stateFile.bytes);
  const featureId=state.activeFeature?.id;
  if(typeof featureId!=='string'||state.activeFeature.planPath!==authority.value.planPath)fail('HFR-FEATURE');
  const plan=file(ctx.root,authority.value.planPath),spec=file(ctx.root,authority.value.specPath);
  const bound=validatePoGateAuthorityForRepository({repoRoot:ctx.root,expectedPlanSha256:plan.fact.sha256,expectedSpecSha256:spec.fact.sha256});
  if(!bound.ok||bound.value?.repositoryFingerprint!==ctx.repositoryFingerprint)fail('HFR-PLAN-AUTHORITY-UNAVAILABLE');
  const mode=readHumanApprovalMode(ctx.root);
  if(!['signature','chat'].includes(mode.mode)||!['default','pipeline.user.yaml'].includes(mode.source))fail('HFR-MODE-UNAVAILABLE');
  const sourceComposition=['./historical-fresh-review-admission.mjs','./po-approval-proof.mjs','./chat-gate-ceremony.mjs','./critical-human-proof-policy.mjs','./po-gate-authority.mjs','../scripts/check-critic-skip-coverage.mjs','../scripts/critic-packet-preflight.mjs','../scripts/po-human-approval.mjs'].map(path=>({path,sha256:sha(readFileSync(fileURLToPath(new URL(path,import.meta.url))))}));
  return {featureId,plan:plan.fact,spec:spec.fact,state:stateFile.fact,authority:bound.value,mode,sourceCompositionSha256:digest(sourceComposition),policyRevision:'m4-'+digest({authority:bound.value,mode}).slice(0,24)};
}
function observe(ctx){
  const dir=safePath(ctx.root,'evidence');
  const catalogue=readdirSync(dir,{withFileTypes:true}).filter(entry=>/^dispatch-record-.+\.json$/u.test(entry.name)).map(entry=>entry.name).sort();
  if(catalogue.length>512)fail('HFR-INVENTORY-BOUND');
  let totalBytes=0;
  const entries=catalogue.map(name=>{
    const path='evidence/'+name,{bytes,fact}=file(ctx.root,path);
    totalBytes+=bytes.length;if(totalBytes>8*1024*1024)fail('HFR-INVENTORY-BYTE-BOUND');
    let record=null,defectCodes=[];
    try{record=JSON.parse(bytes);}catch{defectCodes=['record-json-shape'];}
    if(record?.schema===DISPATCH_RECORD_SCHEMA){try{validateDispatchRecord(record);}catch{defectCodes=['record-v4-shape'];}}
    else if(record?.schema===PREVIOUS_DISPATCH_RECORD_SCHEMA){try{validatePreviousDispatchRecord(record);}catch{defectCodes=['record-v3-shape'];}}
    else if(record?.schema===LEGACY_DISPATCH_RECORD_SCHEMA){try{validateLegacyDispatchRecord(record);}catch{defectCodes=['record-v2-shape'];}}
    else if(record!==null&&!['pipeline.dispatch-record.v1','pipeline.dispatch-evidence.v1',undefined].includes(record?.schema))defectCodes=['record-schema-unsupported'];
    let historical=false,anchorBlob=null;
    if(defectCodes.length&&record?.taskId!==ctx.target.taskId){
      try{
        const row=text(ctx.root,['ls-tree',ctx.target.baseCommit,'--',path]);
        const match=/^(100644|100755) blob ([a-f0-9]{40,64})\t/u.exec(row);
        if(match&&match[1]===((fact.mode&0o111)?'100755':'100644')&&git(ctx.root,['cat-file','blob',match[2]]).equals(bytes)){historical=true;anchorBlob=match[2];}
      }catch{ /* Membership remains unproven and therefore unlisted/blocking. */ }
    }
    return {...fact,taskId:typeof record?.taskId==='string'&&record.taskId.length<=160?record.taskId:null,recordSchema:typeof record?.schema==='string'&&record.schema.length<=160?record.schema:null,defectCodes,historical,anchorBlob,qualification:'unknown'};
  });
  return {schema:INVENTORY_SCHEMA,repositoryFingerprint:ctx.repositoryFingerprint,target:ctx.target,scope:SCOPE,qualification:'unknown',entries,sources:authoritySources(ctx)};
}
function location(ctx,create=false){
  const pipeline=join(ctx.common,'agent-pipeline');privateDirectory(pipeline,create);
  const store=join(pipeline,'historical-fresh-review');privateDirectory(store,create);
  const dir=join(store,ctx.key);privateDirectory(dir,create);
  return dir;
}
function makeHandle(ctx,snapshot,dir){const handle=Object.freeze({});handles.set(handle,{ctx,snapshot,dir,inventorySha256:sha(serialized(snapshot))});return handle;}
function readSnapshot(dir){const raw=file(dir,'inventory.json').bytes,snapshot=JSON.parse(raw);if(!raw.equals(serialized(snapshot)))fail('HFR-INVENTORY-BYTE-DRIFT');return snapshot;}
function live(handle,repository){
  const retained=handles.get(handle);
  if(!retained||retained.ctx.root!==realpathSync(resolve(repository)))fail('HFR-HANDLE');
  const {kind,taskId,baseCommit,candidateCommit}=retained.ctx.target;
  const ctx=context(repository,{kind,taskId,baseCommit,candidateCommit});
  if(canonical(observe(ctx))!==canonical(retained.snapshot))fail('HFR-INVENTORY-DRIFT');
  return retained;
}
/** No raw record content is exported; all membership and target facts are derived. */
export function captureHistoricalFreshReviewInventory({repository,currentTarget}={}){
  try{
    const ctx=context(repository,currentTarget),snapshot=observe(ctx),handle=makeHandle(ctx,snapshot,null);
    const target=observeHistoricalFreshReviewTargetAuthority({repository:ctx.root,inventoryHandle:handle});
    if(target.targetValid!==true)fail('HFR-CURRENT-TARGET-UNAVAILABLE');
    const dir=location(ctx,true),path=join(dir,'inventory.json');
    exclusive(path,snapshot);
    const result=makeHandle(ctx,snapshot,dir);
    return {status:'captured',inventoryHandle:result,inventorySha256:sha(serialized(snapshot)),target:snapshot.target,historicalDebtCount:snapshot.entries.filter(entry=>entry.historical).length,qualification:'unknown',scope:SCOPE};
  }catch(error){return unavailable(error.code??'HFR-CAPTURE-UNAVAILABLE');}
}
/** Internal source observer seam: cloned/serialized caller objects are rejected. */
export function historicalFreshReviewCaptureFacts({repository,inventoryHandle}={}){
  const {snapshot}=live(inventoryHandle,repository);
  return {target:structuredClone(snapshot.target),entries:structuredClone(snapshot.entries)};
}
function requestFor(retained){
  const {snapshot,inventorySha256}=retained,subject={scope:SCOPE,qualification:'unknown',repositoryFingerprint:snapshot.repositoryFingerprint,inventorySha256,target:snapshot.target};
  const approvalIntent=createPoApprovalIntent({kind:'historical-fresh-review',featureId:snapshot.sources.featureId,planSha256:snapshot.sources.plan.sha256,specSha256:snapshot.sources.spec.sha256,candidate:{commit:snapshot.target.candidateCommit,tree:snapshot.target.candidateTree},policyRevision:snapshot.sources.policyRevision,subjectSha256:digest(subject),decision:'approve-fresh-review'});
  return {schema:HISTORICAL_FRESH_REVIEW_REQUEST_SCHEMA,subject,approvalIntent,intentSha256:approvalIntent.sha256,historicalDebtCount:snapshot.entries.filter(entry=>entry.historical).length};
}
export function prepareHistoricalFreshReviewApproval({repository,inventoryHandle}={}){
  try{const retained=live(inventoryHandle,repository);if(!retained.dir)fail('HFR-SNAPSHOT-UNPUBLISHED');const request=requestFor(retained);exclusive(join(retained.dir,'request.json'),request);return {status:'prepared',request,scope:SCOPE,qualification:'unknown'};}
  catch(error){return unavailable(error.code??'HFR-REQUEST-UNAVAILABLE');}
}
/** Existing attended ceremony; never invoked by the preparation or reader route. */
export function publishHistoricalFreshReviewChatApproval({repository,inventoryHandle}={}){
  try{
    const retained=live(inventoryHandle,repository),request=requestFor(retained);
    if(retained.snapshot.sources.mode.mode!=='chat'||!retained.dir)fail('HFR-CHAT-MODE');
    const confirmed=requireAttendedChatGateConfirmation({summaryLines:['Prepare fresh review only; historical qualification remains unknown.',`inventory sha256: ${retained.inventorySha256}`,`target: ${request.subject.target.taskId}@${request.subject.target.candidateCommit}`],expected:request.intentSha256});
    if(!confirmed.ok)fail(confirmed.code);
    live(inventoryHandle,repository);
    const receipt={schema:'pipeline.historical-fresh-review-chat-receipt.v1',intentSha256:request.intentSha256,subjectSha256:request.approvalIntent.value.subjectSha256,basis:'chat-attributed-unattested'};
    exclusive(join(retained.dir,'chat-approval.json'),receipt);
    return {status:'recorded',basis:receipt.basis,qualification:'unknown',scope:SCOPE};
  }catch(error){return unavailable(error.code??'HFR-CHAT-UNAVAILABLE');}
}
export function readHistoricalFreshReviewApproval({repository,inventoryHandle}={}){
  try{
    const retained=live(inventoryHandle,repository);if(!retained.dir)fail('HFR-SNAPSHOT-UNPUBLISHED');
    const request=requestFor(retained);
    const recorded=JSON.parse(file(retained.dir,'request.json').bytes);
    if(canonical(recorded)!==canonical(request))fail('HFR-REQUEST-DRIFT');
    let authoritySha256,basis;
    if(retained.snapshot.sources.mode.mode==='chat'){
      const raw=file(retained.dir,'chat-approval.json').bytes,receipt=JSON.parse(raw);
      if(!own(receipt,['schema','intentSha256','subjectSha256','basis'])||receipt.schema!=='pipeline.historical-fresh-review-chat-receipt.v1'||receipt.intentSha256!==request.intentSha256||receipt.subjectSha256!==request.approvalIntent.value.subjectSha256||receipt.basis!=='chat-attributed-unattested')fail('HFR-CHAT-DRIFT');
      authoritySha256=sha(raw);basis=receipt.basis;
    }else{
      const selected=resolvePoKeyDirectory({repoRoot:retained.ctx.root});
      if(selected.status!=='resolved')fail('HFR-EXTERNAL-AUTHORITY-UNAVAILABLE');
      const external=realpathSync(resolve(selected.directory)),rel=relative(retained.ctx.root,external);
      if(rel===''||(!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel)))fail('HFR-EXTERNAL-AUTHORITY-UNAVAILABLE');
      const trustPolicy=JSON.parse(file(external,'trust-policy.json').bytes);
      const proof=JSON.parse(file(external,`proof-${request.intentSha256}.json`).bytes);
      const verified=verifyPoApprovalProof({intent:request.approvalIntent,trustPolicy,proof});
      if(!verified.verified)fail(verified.code);
      authoritySha256=digest({trustPolicy,proof});basis='signature';
    }
    live(inventoryHandle,repository);
    return {status:'authorized',inventoryHandle,inventorySha256:retained.inventorySha256,authoritySha256,basis,scope:SCOPE,qualification:'unknown',target:structuredClone(retained.snapshot.target),repositoryFingerprint:retained.ctx.repositoryFingerprint};
  }catch(error){return unavailable(error.code??'HFR-APPROVAL-UNAVAILABLE');}
}
/** Noncreating production lookup; source observations are always recomputed. */
export function readHistoricalFreshReviewAdmission({repository,currentTarget}={}){
  try{
    const ctx=context(repository,currentTarget),dir=location(ctx),snapshot=readSnapshot(dir);
    if(canonical(snapshot)!==canonical(observe(ctx)))fail('HFR-INVENTORY-DRIFT');
    const handle=makeHandle(ctx,snapshot,dir),approval=readHistoricalFreshReviewApproval({repository,inventoryHandle:handle});
    if(approval.status!=='authorized')return approval;
    return {...approval,entries:structuredClone(snapshot.entries.filter(entry=>entry.historical)),sourceRepository:ctx.root};
  }catch(error){return unavailable(error.code??'HFR-ADMISSION-UNAVAILABLE');}
}
export function historicalFreshReviewPacketBinding({repository,currentTarget}={}){
  const approval=readHistoricalFreshReviewAdmission({repository,currentTarget});
  if(approval.status!=='authorized')return null;
  return {schema:'pipeline.historical-fresh-review-packet-binding.v1',sourceRepository:approval.sourceRepository,repositoryFingerprint:approval.repositoryFingerprint,inventorySha256:approval.inventorySha256,authoritySha256:approval.authoritySha256,basis:approval.basis,scope:SCOPE,qualification:'unknown',target:approval.target};
}
export function revalidateHistoricalFreshReviewPacketBinding(binding){
  try{
    if(!own(binding,['schema','sourceRepository','repositoryFingerprint','inventorySha256','authoritySha256','basis','scope','qualification','target'])||binding.schema!=='pipeline.historical-fresh-review-packet-binding.v1'||binding.scope!==SCOPE||binding.qualification!=='unknown')return false;
    const {kind,taskId,baseCommit,candidateCommit}=binding.target;
    return canonical(historicalFreshReviewPacketBinding({repository:binding.sourceRepository,currentTarget:{kind,taskId,baseCommit,candidateCommit}}))===canonical(binding);
  }catch{return false;}
}
export function describeHistoricalFreshReviewApprovalRequest(record,intentSha256,repository){
  if(!own(record,['schema','subject','approvalIntent','intentSha256','historicalDebtCount'])||record.schema!==HISTORICAL_FRESH_REVIEW_REQUEST_SCHEMA||record.intentSha256!==intentSha256)return null;
  try{
    const intent=createPoApprovalIntent(record.approvalIntent.value);
    if(intent.sha256!==intentSha256||canonical(intent)!==canonical(record.approvalIntent)||intent.value.kind!=='historical-fresh-review'||intent.value.decision!=='approve-fresh-review'||intent.value.subjectSha256!==digest(record.subject)||record.subject.scope!==SCOPE||record.subject.qualification!=='unknown'||typeof repository!=='string')return null;
    const {kind,taskId,baseCommit,candidateCommit}=record.subject.target;
    const ctx=context(repository,{kind,taskId,baseCommit,candidateCommit}),dir=location(ctx),snapshot=readSnapshot(dir);
    if(canonical(snapshot)!==canonical(observe(ctx))||canonical(requestFor({snapshot,inventorySha256:sha(serialized(snapshot))}))!==canonical(record))return null;
    return {resolved:true,lines:['action: prepare exact current target fresh review only',`target: ${record.subject.target.taskId}@${record.subject.target.candidateCommit}`,`inventory sha256: ${record.subject.inventorySha256}`,`historical debt entries: ${record.historicalDebtCount}`,'Historical qualification stays unknown. This grants no completion, push, acceptance or feature close.']};
  }catch{return null;}
}
