// SPDX-License-Identifier: SUL-1.0
/** Pure initial-to-final Advisor contracts. Results are integrity, never host authority. */
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {canonicalizeJson} from './governance-event.mjs';
export const INITIAL_CONTEXT_SCHEMA='pipeline.design-advisor-initial-context.v1';
export const COURSE_SCHEMA='pipeline.design-advisor-course.v1';
export const DISPOSITION_SCHEMA='pipeline.design-advisor-disposition.v1';
export const REVISION_SCHEMA='pipeline.design-advisor-revision.v1';
export const INITIAL_QUESTION_CONTRACT='initial-five-sources.v1';
export const SOURCE_NAMES=Object.freeze(['input','prd','spec','design','traceability']);
export const ADVISOR_REASONS=Object.freeze(['architecture-tradeoff','decision-ambiguity','evidence-conflict','recovery-choice','risk-review']);
export const MAX_COURSE_RECORD_BYTES=65536;
const SHA=/^[a-f0-9]{64}$/u,OID=/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u,ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
export function exactCourseObject(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||![null,Object.prototype].includes(Object.getPrototypeOf(value)))return false;const d=Object.getOwnPropertyDescriptors(value);return Object.keys(d).length===keys.length&&keys.every(k=>Object.hasOwn(d,k)&&Object.hasOwn(d[k],'value'));}
export function designAdvisorValueSha256(value){return createHash('sha256').update(canonicalizeJson(value),'utf8').digest('hex');}
export function designAdvisorBytesSha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
export function freezeCourseJson(value){return deepFreeze(JSON.parse(canonicalizeJson(value)));}
function deepFreeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))deepFreeze(x);Object.freeze(v);}return v;}
function fail(code){return {ok:false,code};}
function same(a,b){try{return canonicalizeJson(a)===canonicalizeJson(b);}catch{return false;}}
function boundedText(v,max=4096){return typeof v==='string'&&v.trim().length>0&&!v.includes('\0')&&Buffer.byteLength(v,'utf8')<=max&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v);}
function candidate(v){return exactCourseObject(v,['commit','tree'])&&OID.test(v.commit)&&OID.test(v.tree);}
function safePath(v){return typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/u.test(v)&&v.split('/').every(s=>s!==''&&!s.startsWith('.'))&&!v.split('/').some(s=>['scratch','node_modules'].includes(s));}
function sources(v){return exactCourseObject(v,SOURCE_NAMES)&&SOURCE_NAMES.every(n=>exactCourseObject(v[n],['path','sha256'])&&safePath(v[n].path)&&SHA.test(v[n].sha256))&&new Set(SOURCE_NAMES.map(n=>v[n].path)).size===5;}
function iso(v){try{return typeof v==='string'&&new Date(v).toISOString()===v;}catch{return false;}}
function metadataBound(v){try{return Buffer.byteLength(canonicalizeJson(v),'utf8')<=MAX_COURSE_RECORD_BYTES;}catch{return false;}}
export function buildInitialAdvisorQuestion({reason,sources:refs}={}){
  if(!ADVISOR_REASONS.includes(reason)||!sources(refs))throw new TypeError('DAC-INITIAL-QUESTION-INVALID');
  return ['Compare the original user input, PRD, Spec, initial design, and traceability mapping.','Identify omitted requirements, contradictions, untested claims, and unresolved decisions.',`reason: ${reason}`,...SOURCE_NAMES.map(n=>`${n}: ${refs[n].path} sha256=${refs[n].sha256}`)].join('\n');
}
export function hashInitialAdvisorQuestion(args){return designAdvisorBytesSha256(Buffer.from(buildInitialAdvisorQuestion(args),'utf8'));}
export function initialAdvisorEvidenceBundle({sources:refs,sourceBytes}={}){
  if(!sources(refs)||!exactCourseObject(sourceBytes,SOURCE_NAMES))return fail('DAC-INITIAL-SOURCES');
  const entries=[];let total=0;const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
  try{for(const n of SOURCE_NAMES){const b=sourceBytes[n];if(!Buffer.isBuffer(b)||b.length>262144||(total+=b.length)>1048576||designAdvisorBytesSha256(b)!==refs[n].sha256)return fail('DAC-INITIAL-SOURCE-BYTES');const content=decoder.decode(b);if(content.includes('\0'))return fail('DAC-INITIAL-SOURCE-BYTES');entries.push({path:refs[n].path,sha256:refs[n].sha256,bytes:b.length,content});}}
  catch{return fail('DAC-INITIAL-SOURCE-UTF8');}
  entries.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  const bundle={schema:'pipeline.advisory-evidence-bundle.v1',references:entries};
  return {ok:true,bundle:freezeCourseJson(bundle),evidenceSha256:designAdvisorValueSha256(bundle)};
}
export function validateInitialAdvisorContext(context,{sourceBytes}={}){
  if(!exactCourseObject(context,['schema','repoFingerprint','featureId','authoringDispatchId','initialCandidate','sources','reason','questionContract','questionSha256','evidenceSha256','routePolicySha256','createdAt'])||context.schema!==INITIAL_CONTEXT_SCHEMA||!SHA.test(context.repoFingerprint)||!ID.test(context.featureId)||!ID.test(context.authoringDispatchId)||!candidate(context.initialCandidate)||!sources(context.sources)||!ADVISOR_REASONS.includes(context.reason)||context.questionContract!==INITIAL_QUESTION_CONTRACT||!SHA.test(context.evidenceSha256)||!SHA.test(context.routePolicySha256)||!iso(context.createdAt)||!metadataBound(context))return fail('DAC-INITIAL-CONTEXT');
  if(context.questionSha256!==hashInitialAdvisorQuestion({reason:context.reason,sources:context.sources}))return fail('DAC-INITIAL-QUESTION');
  if(sourceBytes!==undefined){const b=initialAdvisorEvidenceBundle({sources:context.sources,sourceBytes});if(!b.ok)return b;if(b.evidenceSha256!==context.evidenceSha256)return fail('DAC-INITIAL-EVIDENCE');}
  return {ok:true,contextSha256:designAdvisorValueSha256(context)};
}
export function createInitialAdvisorContext({repoFingerprint,featureId,authoringDispatchId,initialCandidate,sources:refs,sourceBytes,reason,evidenceSha256,routePolicySha256,createdAt}={}){
  const b=initialAdvisorEvidenceBundle({sources:refs,sourceBytes});if(!b.ok)return b;
  if(evidenceSha256!==undefined&&evidenceSha256!==b.evidenceSha256)return fail('DAC-INITIAL-EVIDENCE');
  let questionSha256;try{questionSha256=hashInitialAdvisorQuestion({reason,sources:refs});}catch{return fail('DAC-INITIAL-QUESTION');}
  const context={schema:INITIAL_CONTEXT_SCHEMA,repoFingerprint,featureId,authoringDispatchId,initialCandidate,sources:refs,reason,questionContract:INITIAL_QUESTION_CONTRACT,questionSha256,evidenceSha256:b.evidenceSha256,routePolicySha256,createdAt};
  const check=validateInitialAdvisorContext(context,{sourceBytes});return check.ok?{...check,context:freezeCourseJson(context)}:check;
}
export function validateInitialToFinalBinding({initial,courseId,consultation,disposition,revisions,final}={}){
  const checked=validateInitialAdvisorContext(initial);if(!checked.ok)return checked;
  if(!ID.test(courseId??'')||!exactCourseObject(consultation,['courseId','initialContextSha256','dispatch','questionSha256','evidenceSha256','receiptSha256','answerSha256','reportCanonicalSha256','proposalSetSha256'])||consultation.courseId!==courseId||consultation.initialContextSha256!==checked.contextSha256||!exactCourseObject(consultation.dispatch,['dispatchId','queueRevision','candidateCommit','candidateTree'])||!ID.test(consultation.dispatch.dispatchId)||consultation.dispatch.dispatchId===initial.authoringDispatchId||!Number.isSafeInteger(consultation.dispatch.queueRevision)||consultation.dispatch.queueRevision<0||consultation.dispatch.candidateCommit!==initial.initialCandidate.commit||consultation.dispatch.candidateTree!==initial.initialCandidate.tree||consultation.questionSha256!==initial.questionSha256||consultation.evidenceSha256!==initial.evidenceSha256||!['receiptSha256','answerSha256','reportCanonicalSha256','proposalSetSha256'].every(n=>SHA.test(consultation[n]))||!metadataBound(consultation))return fail('DAC-INITIAL-CONSULTATION');
  if(!exactCourseObject(disposition,['schema','courseId','consultationSha256','proposalSetSha256','items','ownerDispatchId','createdAt'])||disposition.schema!==DISPOSITION_SCHEMA||disposition.courseId!==courseId||disposition.consultationSha256!==designAdvisorValueSha256(consultation)||disposition.proposalSetSha256!==consultation.proposalSetSha256||!ID.test(disposition.ownerDispatchId)||!iso(disposition.createdAt)||!Array.isArray(disposition.items)||disposition.items.length>32||!metadataBound(disposition)||!disposition.items.every(x=>exactCourseObject(x,['proposalId','decision','rationale','revisionCommit'])&&ID.test(x.proposalId)&&['adopt','reject','defer'].includes(x.decision)&&boundedText(x.rationale)&&(x.decision==='adopt'?OID.test(x.revisionCommit??''):x.revisionCommit===null))||new Set(disposition.items.map(x=>x.proposalId)).size!==disposition.items.length)return fail('DAC-DISPOSITION');
  if(!Array.isArray(revisions)||revisions.length>32||!exactCourseObject(final,['candidate','sources'])||!candidate(final.candidate)||!sources(final.sources))return fail('DAC-REVISION-SHAPE');
  let previous={candidate:initial.initialCandidate,sources:initial.sources},previousHash=null;
  const adopted=new Map(disposition.items.filter(x=>x.decision==='adopt').map(x=>[x.proposalId,x.revisionCommit]));const seen=new Set();
  for(let i=0;i<revisions.length;i++){
    const r=revisions[i];if(!exactCourseObject(r,['schema','courseId','seq','priorRevisionSha256','candidate','sources','parentCommit','proposalIds','reason'])||r.schema!==REVISION_SCHEMA||r.courseId!==courseId||r.seq!==i+1||r.priorRevisionSha256!==previousHash||r.parentCommit!==previous.candidate.commit||!candidate(r.candidate)||r.candidate.commit===previous.candidate.commit||!sources(r.sources)||!Array.isArray(r.proposalIds)||r.proposalIds.length>32||new Set(r.proposalIds).size!==r.proposalIds.length||!r.proposalIds.every(id=>ID.test(id)&&adopted.get(id)===r.candidate.commit&&!seen.has(id))||!['advisor-disposition','readiness-correction','packaging-only'].includes(r.reason)||!metadataBound(r))return fail('DAC-REVISION-LINK');
    if(!same(r.sources.input,initial.sources.input))return fail('DAC-NEW-COURSE-REQUIRED');
    if(r.reason==='packaging-only'&&!same(r.sources,previous.sources))return fail('DAC-PACKAGING-SOURCE-DRIFT');
    if(r.reason!=='advisor-disposition'&&r.proposalIds.length!==0)return fail('DAC-REVISION-PROPOSALS');
    for(const id of r.proposalIds)seen.add(id);previous=r;previousHash=designAdvisorValueSha256(r);
  }
  if(adopted.size!==seen.size)return fail('DAC-ADOPTED-PROPOSAL-UNBOUND');
  if(!same(previous.candidate,final.candidate)||!same(previous.sources,final.sources))return fail('DAC-FINAL-ENDPOINT');
  return {ok:true,code:'DAC-INITIAL-TO-FINAL-STRUCTURAL',initialContextSha256:checked.contextSha256,revisionChainSha256:designAdvisorValueSha256(revisions),physicalProvenanceVerified:false,implementationAuthority:false};
}
