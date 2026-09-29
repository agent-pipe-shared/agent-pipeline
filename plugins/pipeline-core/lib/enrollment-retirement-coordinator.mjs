// SPDX-License-Identifier: SUL-1.0
/** Closed, removal-only enrollment transaction values. Physical owners execute each step. */
import {createHash} from 'node:crypto';
export const RETIREMENT_ARCHIVE_SCHEMA='pipeline.enrollment-retirement-archive.v1';
export const RETIREMENT_JOURNAL_SCHEMA='pipeline.enrollment-retirement-coordinator.v1';
export const RETIREMENT_RESULT_SCHEMA='pipeline.enrollment-retirement-result.v1';
const SHA=/^[a-f0-9]{64}$/u;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const hash=b=>createHash('sha256').update(b).digest('hex');
export const retirementValueSha256=v=>hash(JSON.stringify(v));
const validIdentity=v=>exact(v,['dev','ino'])&&['dev','ino'].every(k=>typeof v[k]==='string'&&/^\d+$/u.test(v[k]));
const actor=v=>typeof v==='string'&&v.trim()&&v.length<=256&&!/[\x00-\x1f]/u.test(v);
const phases=['prepared','state-retired','intake-retired','consent-retired','pending','active'];
export function retirementArchiveEntry({slot,path,bytes,identity}){
 if(!['state','intake','consent'].includes(slot)||typeof path!=='string'||path.length>4096)throw Error('ER-ENTRY');
 if(bytes===null)return {slot,path,sha256:null,byteLength:0,bytesBase64:null,identity:null};
 if(!Buffer.isBuffer(bytes)||bytes.length>(slot==='consent'?65536:1048576)||!validIdentity(identity))throw Error('ER-ENTRY');
 return {slot,path,sha256:hash(bytes),byteLength:bytes.length,bytesBase64:bytes.toString('base64'),identity};
}
function validEntry(v){
 if(!exact(v,['slot','path','sha256','byteLength','bytesBase64','identity'])||!['state','intake','consent'].includes(v.slot)||typeof v.path!=='string'||v.path.length>4096)return false;
 if(v.sha256===null)return v.byteLength===0&&v.bytesBase64===null&&v.identity===null;
 if(!SHA.test(v.sha256)||!validIdentity(v.identity)||typeof v.bytesBase64!=='string'||!Number.isSafeInteger(v.byteLength)||v.byteLength<0||v.byteLength>(v.slot==='consent'?65536:1048576))return false;
 const b=Buffer.from(v.bytesBase64,'base64');return b.length===v.byteLength&&b.toString('base64')===v.bytesBase64&&hash(b)===v.sha256;
}
export function validateRetirementArchive(v){return exact(v,['schema','root','rootIdentity','commonIdentity','scopeKey','barrierSha256','priorGenerationSha256','by','at','entries','generationSha256'])
 &&v.schema===RETIREMENT_ARCHIVE_SCHEMA&&typeof v.root==='string'&&validIdentity(v.rootIdentity)&&(v.commonIdentity===null||validIdentity(v.commonIdentity))
 &&SHA.test(v.scopeKey)&&SHA.test(v.barrierSha256)&&(v.priorGenerationSha256===null||SHA.test(v.priorGenerationSha256))&&actor(v.by)&&iso(v.at)
 &&Array.isArray(v.entries)&&v.entries.length===3&&v.entries.every(validEntry)&&v.entries.map(e=>e.slot).join('|')==='state|intake|consent'
 &&SHA.test(v.generationSha256)&&v.generationSha256===retirementValueSha256(Object.fromEntries(Object.entries(v).filter(([k])=>k!=='generationSha256')));}
export function prepareEnrollmentRetirement({root,rootIdentity,commonIdentity,scopeKey,barrierSha256,priorGenerationSha256=null,by,at,entries}){
 const unsigned={schema:RETIREMENT_ARCHIVE_SCHEMA,root,rootIdentity,commonIdentity,scopeKey,barrierSha256,priorGenerationSha256,by,at,entries};
 const archive={...unsigned,generationSha256:retirementValueSha256(unsigned)};
 if(!validateRetirementArchive(archive))throw Error('ER-ARCHIVE');
 const journal={schema:RETIREMENT_JOURNAL_SCHEMA,root,rootIdentity,commonIdentity,scopeKey,barrierSha256,generationSha256:archive.generationSha256,priorGenerationSha256,archiveSha256:retirementValueSha256(archive),by,at,phase:'prepared',retiredStateSha256:null,retiredIntakeSha256:null,retiredConsentSha256:null,freshIntakeSha256:null,activeScopeSha256:null};
 return {archive,journal};
}
export function validateRetirementJournal(v){return exact(v,['schema','root','rootIdentity','commonIdentity','scopeKey','barrierSha256','generationSha256','priorGenerationSha256','archiveSha256','by','at','phase','retiredStateSha256','retiredIntakeSha256','retiredConsentSha256','freshIntakeSha256','activeScopeSha256'])
 &&v.schema===RETIREMENT_JOURNAL_SCHEMA&&typeof v.root==='string'&&validIdentity(v.rootIdentity)&&(v.commonIdentity===null||validIdentity(v.commonIdentity))&&actor(v.by)&&iso(v.at)&&phases.includes(v.phase)
 &&['scopeKey','barrierSha256','generationSha256','archiveSha256'].every(k=>SHA.test(v[k]))
 &&['priorGenerationSha256','retiredStateSha256','retiredIntakeSha256','retiredConsentSha256','freshIntakeSha256','activeScopeSha256'].every(k=>v[k]===null||SHA.test(v[k]))
 &&(phases.indexOf(v.phase)<2||SHA.test(v.retiredIntakeSha256??''))
 &&v.retiredConsentSha256===null
 &&(v.phase!=='active'||(SHA.test(v.freshIntakeSha256??'')&&SHA.test(v.activeScopeSha256??'')));}
export function advanceEnrollmentRetirement(journal,{phase,postimageSha256=null}={}){
 if(!validateRetirementJournal(journal)||phases.indexOf(phase)!==phases.indexOf(journal.phase)+1)throw Error('ER-PHASE');
 if(postimageSha256!==null&&!SHA.test(postimageSha256))throw Error('ER-POSTIMAGE');
 const field={'state-retired':'retiredStateSha256','intake-retired':'retiredIntakeSha256','consent-retired':'retiredConsentSha256','active':'activeScopeSha256'}[phase];
 return {...journal,phase,...(field?{[field]:postimageSha256}:{})};
}
export function bindEnrollmentFreshConsent(journal,checkpoint,intakeSha256){
 if(!validateRetirementJournal(journal)||journal.phase!=='pending'||!SHA.test(intakeSha256)||intakeSha256===journal.retiredIntakeSha256
 ||checkpoint?.retiredEnrollmentGenerationSha256!==journal.generationSha256||checkpoint.consent?.granted!==true||!iso(checkpoint.consent.at)||checkpoint.consent.at<journal.at)throw Error('ER-FRESH-CONSENT');
 return {...journal,freshIntakeSha256:intakeSha256};
}
export function retirementResult(journal,status){
 if(!validateRetirementJournal(journal)||!['retired','replayed','active','retained'].includes(status))throw Error('ER-RESULT');
 return {schema:RETIREMENT_RESULT_SCHEMA,status,generationSha256:journal.generationSha256,archiveSha256:journal.archiveSha256};
}
