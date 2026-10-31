// SPDX-License-Identifier: SUL-1.0
/** M4A: exact historical debt permits preparation only; never completion. */
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonical, createPoApprovalIntent } from "./po-approval-proof.mjs";
import { requireAttendedChatGateConfirmation } from "./chat-gate-ceremony.mjs";
import { observeHistoricalFreshReviewTargetAuthority } from "../scripts/check-critic-skip-coverage.mjs";
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";
import { HISTORICAL_FRESH_REVIEW_REQUEST_SCHEMA, SCOPE, sha, hfrDigest as digest, serialized, own, fail, unavailable, context, observe, makeHandle, readSnapshot, live, requestFor, historicalFreshReviewPacketBinding } from "./review-admission-read.mjs";
export { revalidateHistoricalFreshReviewPacketBinding } from "./review-admission-read.mjs";
export { HISTORICAL_FRESH_REVIEW_REQUEST_SCHEMA, historicalFreshReviewCaptureFacts, readHistoricalFreshReviewApproval, readHistoricalFreshReviewAdmission, historicalFreshReviewPacketBinding } from "./review-admission-read.mjs";

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
function location(ctx,create=false){
  const pipeline=join(ctx.common,'agent-pipeline');privateDirectory(pipeline,create);
  const store=join(pipeline,'historical-fresh-review');privateDirectory(store,create);
  const dir=join(store,ctx.key);privateDirectory(dir,create);
  return dir;
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
