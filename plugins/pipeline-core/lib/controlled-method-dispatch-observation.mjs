// SPDX-License-Identifier: SUL-1.0
// Private controlled-method evidence. Never a native/public dispatch or review grant.
import {createHash} from 'node:crypto';
import {constants,openSync,closeSync,fstatSync,fsyncSync,lstatSync,statSync,readFileSync,writeSync,realpathSync} from 'node:fs';
import {resolve,join,dirname,basename,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseStrictJson} from './governance-event.mjs';
import {inspectSourceOwnedControlledMethodDispatchHandle} from './controlled-continuity-method-dispatch.mjs';
import {validateCriticDiagnostic} from './critic-diagnostic-evidence.mjs';
import {readCriticCourseAdmission} from './critic-course-admission.mjs';

const observations=new WeakMap(),bindings=new WeakMap(),lifetimes=new Map();
const LIMIT=4096,MAX_BYTES=2*1024*1024;
const PRIVATE_PREFIX='agent-pipeline/controlled-method-fixtures/continuity-transitions';
const OBSERVATION_PATH=PRIVATE_PREFIX+'/method-dispatch/observation.json';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const equal=(a,b)=>canonical(a)===canonical(b);
function fail(code){const error=new Error(code);error.code=code;throw error;}
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||!equal(Object.keys(value).sort(),keys.slice().sort()))fail('CMO-INPUT');}
function identity(info){return {dev:String(info.dev),ino:String(info.ino),mode:info.mode&0o777,nlink:info.nlink};}
function directory(path){const info=lstatSync(path);if(!info.isDirectory()||info.isSymbolicLink()||realpathSync(path)!==path||(typeof process.getuid==='function'&&info.uid!==process.getuid()))fail('CMO-DIRECTORY');return {dev:String(info.dev),ino:String(info.ino),mode:info.mode&0o777};}
function physicalRoot(root){if(typeof root!=='string')fail('CMO-ROOT');const path=resolve(root);directory(path);return path;}
function contained(root,path){
  if(typeof path!=='string'||isAbsolute(path)||/[\\\x00-\x1f:]/u.test(path)||path.split('/').some(part=>!part||part==='.'||part==='..'))fail('CMO-PATH');
  const parts=path.split('/');let parent=root;directory(parent);
  for(const part of parts.slice(0,-1)){parent=join(parent,part);directory(parent);}
  return join(parent,parts.at(-1));
}
function physical(path,{privateFile=false}={}){
  const before=lstatSync(path);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size<=0||before.size>MAX_BYTES||realpathSync(path)!==path||(typeof process.getuid==='function'&&before.uid!==process.getuid())||(privateFile&&(before.mode&0o777)!==0o600))fail('CMO-FILE');
  const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));let bytes;
  try{const opened=fstatSync(fd);if(!equal(identity(before),identity(opened))||opened.size!==before.size)fail('CMO-CAS');bytes=readFileSync(fd);const after=fstatSync(fd);if(!equal(identity(opened),identity(after))||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||after.ctimeMs!==opened.ctimeMs)fail('CMO-CAS');}finally{closeSync(fd);}
  const after=lstatSync(path);if(!equal(identity(before),identity(after))||after.size!==bytes.length||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)fail('CMO-CAS');
  return {bytes,sha256:sha(bytes),size:bytes.length,identity:identity(after)};
}
function boundRead(root,ref,{privateFile=false}={}){
  if(!ref||typeof ref!=='object'||typeof ref.path!=='string'||!/^[a-f0-9]{64}$/u.test(ref.sha256??'')||!Number.isSafeInteger(ref.size)||ref.size<=0)fail('CMO-REFERENCE');
  const path=privateFile?(ref.path.startsWith('.git/'+PRIVATE_PREFIX+'/')?ref.path.slice(5):fail('CMO-PRIVATE-PATH')):ref.path;
  const read=physical(contained(root,path),{privateFile});if(read.sha256!==ref.sha256||read.size!==ref.size||(ref.identity&&!equal(read.identity,ref.identity)))fail('CMO-REFERENCE-CAS');return read;
}
function pins(observed){const paths=[observed.repository.primaryRoot,observed.repository.commonDir];let at=observed.repository.commonDir;for(const part of OBSERVATION_PATH.split('/').slice(0,-1)){at=join(at,part);paths.push(at);}return paths.map(path=>({path,identity:directory(path)}));}
function checkPins(rows){for(const row of rows)if(!equal(directory(row.path),row.identity))fail('CMO-DIRECTORY-CAS');}
function source(){const path=fileURLToPath(import.meta.url),read=physical(path);return {path,sha256:read.sha256,identity:read.identity};}
function verifySource(ref){const current=source();if(!equal(current,ref))fail('CMO-SOURCE-CAS');}
function observe(methodDispatchHandle,root){
  const value=inspectSourceOwnedControlledMethodDispatchHandle({methodDispatchHandle});
  if(value.assurance!=='controlled-source-method'||value.native!==false||value.repository.primaryRoot!==root||value.previousRepository.primaryRoot!==root||value.repository.commonDir!==value.previousRepository.commonDir)fail('CMO-REPOSITORY');
  directory(value.repository.commonDir);
  if(value.attemptRef.path!=='.git/'+PRIVATE_PREFIX+'/method-dispatch/attempt.json'||value.terminalRef.path!=='.git/'+PRIVATE_PREFIX+'/method-dispatch/terminal.json'||value.preparationRef.path!=='.git/'+PRIVATE_PREFIX+'/artifact-preparation.json')fail('CMO-NAMESPACE');
  const preparation=parseStrictJson(boundRead(value.repository.commonDir,value.preparationRef,{privateFile:true}).bytes);
  const attempt=parseStrictJson(boundRead(value.repository.commonDir,value.attemptRef,{privateFile:true}).bytes);
  const terminal=parseStrictJson(boundRead(value.repository.commonDir,value.terminalRef,{privateFile:true}).bytes);
  exact(preparation,['schema','repository','featureId','stateRef','acceptedRef','publicSources','verifySuite','reviewBaseCommit','calls','assurance','modelOrNativeAcceptance']);
  exact(attempt,['schema','taskId','featureId','preparationRef','reviewBaseCommit','candidate','specRef','suiteRef','methodologyRulesetSha256','command','sourceSha256','assurance']);
  exact(terminal,['schema','taskId','attemptRef','diagnosticRef','outcome','reviewCandidate','registrationCommit','evidenceRefs','sourceSha256','assurance','native','independentCriticPass']);
  if(preparation.schema!=='pipeline.controlled-continuity-artifact-preparation.v1'||preparation.assurance!=='method-source-producers-synthetic-inputs'||preparation.modelOrNativeAcceptance!==false||!equal(preparation.repository,value.previousRepository)||preparation.featureId!==value.featureId||preparation.reviewBaseCommit!==value.reviewBaseCommit)fail('CMO-PREPARATION');
  if(attempt.schema!=='pipeline.controlled-method-dispatch-attempt.v1'||attempt.taskId!==value.taskId||attempt.featureId!==value.featureId||!equal(attempt.preparationRef,value.preparationRef)||attempt.reviewBaseCommit!==value.reviewBaseCommit||!equal(attempt.candidate,value.reviewCandidate)||attempt.sourceSha256!==value.sourceSha256||attempt.assurance!==value.assurance||attempt.methodologyRulesetSha256!=='b7115494a79c3271c224c51d0bd388b0ccfff931a4ae11a0cd6a7eb19ce0b88d'||!equal(attempt.suiteRef,{path:preparation.verifySuite?.path,sha256:preparation.verifySuite?.sha256})||!equal(attempt.command,{kind:'canonical-node-syntax',arguments:['--check',attempt.suiteRef.path]}))fail('CMO-ATTEMPT');
  if(terminal.schema!=='pipeline.controlled-method-dispatch-terminal.v1'||terminal.taskId!==value.taskId||!equal(terminal.attemptRef,value.attemptRef)||!equal(terminal.diagnosticRef,value.diagnosticRef)||!equal(terminal.reviewCandidate,value.reviewCandidate)||terminal.registrationCommit!==value.registrationCommit||!equal(terminal.evidenceRefs,value.evidenceRefs)||terminal.sourceSha256!==value.sourceSha256||terminal.assurance!==value.assurance||terminal.native!==false||terminal.independentCriticPass!==false)fail('CMO-TERMINAL');
  if(!Array.isArray(value.evidenceRefs)||value.evidenceRefs.length!==3||!value.evidenceRefs.some(ref=>equal(ref,value.diagnosticRef))||!value.evidenceRefs.some(ref=>equal(ref,value.manifestAfter)))fail('CMO-EVIDENCE');
  for(const ref of value.evidenceRefs)boundRead(root,ref);
  const diagnostic=parseStrictJson(boundRead(root,value.diagnosticRef).bytes);
  const diagnosticObservation=validateCriticDiagnostic(diagnostic,{root,candidate:value.reviewCandidate,spec:attempt.specRef});
  if(!equal(terminal.outcome,{kind:'diagnostic-captured',exitCode:diagnostic.targeted.exitCode})||diagnostic.fullVerify.status!=='not-run'||diagnostic.targeted.label!=='controlled-method-syntax'||!diagnostic.pending.includes('independent-critic')||!diagnostic.pending.includes('full-verify'))fail('CMO-DIAGNOSTIC');
  const course=readCriticCourseAdmission({repoRoot:root,featureId:value.featureId,baseCommit:value.reviewBaseCommit,candidateCommit:value.reviewCandidate.commit,registrationCommit:value.registrationCommit,requestedMode:'full',acceptedReference:preparation.acceptedRef,criterionLocator:null,deltaRequestPath:null});
  if(course.decision?.status!=='admitted'||course.decision.mode!=='full')fail('CMO-COURSE-UNAVAILABLE');
  // Reopen genuine private producer and all bound inputs after default validators.
  if(!equal(value,inspectSourceOwnedControlledMethodDispatchHandle({methodDispatchHandle})))fail('CMO-PRODUCER-CAS');
  boundRead(value.repository.commonDir,value.preparationRef,{privateFile:true});
  return {value,diagnosticObservation,course};
}
function put(path,bytes){
  const parent=dirname(path),expected=directory(parent),saved=process.cwd();process.chdir(parent);
  try{
    const actual=statSync('.');if(!actual.isDirectory()||!equal(expected,{dev:String(actual.dev),ino:String(actual.ino),mode:actual.mode&0o777}))fail('CMO-DIRECTORY-CAS');
    const fd=openSync(basename(path),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
    try{const admitted=fstatSync(fd);if(!admitted.isFile()||admitted.nlink!==1||(admitted.mode&0o777)!==0o600)fail('CMO-WRITE');let offset=0;while(offset<bytes.length){const count=writeSync(fd,bytes,offset,bytes.length-offset,offset);if(!Number.isSafeInteger(count)||count<=0)fail('CMO-WRITE');offset+=count;}fsyncSync(fd);}finally{closeSync(fd);}
    const dir=openSync('.',constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{fsyncSync(dir);}finally{closeSync(dir);}
  }finally{process.chdir(saved);}
  const read=physical(path,{privateFile:true});if(!read.bytes.equals(bytes))fail('CMO-READBACK');
  return {path:'.git/'+OBSERVATION_PATH,sha256:read.sha256,size:read.size,identity:read.identity};
}

/** No request/target/record/model/command input exists on this private source route. */
export function writeSourceOwnedControlledMethodDispatchObservation(input){
  exact(input,['repoRoot','methodDispatchHandle']);const root=physicalRoot(input.repoRoot);
  const inspected=observe(input.methodDispatchHandle,root),value=inspected.value;
  if(lifetimes.has(root)||observations.has(input.methodDispatchHandle)||lifetimes.size>=LIMIT)fail('CMO-LIFETIME');
  const record={root,methodDispatchHandle:input.methodDispatchHandle,stage:'publishing',source:source(),pins:pins(value),inspected};
  // Retain failures; partial creation can never be retried or promoted by JSON.
  lifetimes.set(root,record);observations.set(input.methodDispatchHandle,record);
  const observation={schema:'pipeline.controlled-method-dispatch-observation.v1',...value,diagnosticObservation:inspected.diagnosticObservation,courseObservation:inspected.course,adapterSourceSha256:record.source.sha256,independentCriticPass:false};
  const bytes=Buffer.from(canonical(observation));if(bytes.length>MAX_BYTES)fail('CMO-BOUND');
  checkPins(record.pins);verifySource(record.source);
  record.ref=put(contained(value.repository.commonDir,OBSERVATION_PATH),bytes);
  checkPins(record.pins);verifySource(record.source);
  if(!equal(inspected,observe(input.methodDispatchHandle,root)))fail('CMO-PUBLISH-CAS');
  boundRead(value.repository.commonDir,record.ref,{privateFile:true});record.stage='published';
  return Object.freeze({schema:'pipeline.controlled-method-dispatch-publication.v1',taskId:value.taskId,observationRef:structuredClone(record.ref),assurance:'controlled-source-method',native:false,independentCriticPass:false});
}
function readPublished(methodDispatchHandle,root){
  const record=observations.get(methodDispatchHandle);if(!record||record.stage!=='published'||record.root!==root||lifetimes.get(root)!==record)fail('CMO-OBSERVATION-UNAVAILABLE');
  checkPins(record.pins);verifySource(record.source);const inspected=observe(methodDispatchHandle,root);
  if(!equal(inspected,record.inspected))fail('CMO-OBSERVATION-CAS');
  const read=boundRead(inspected.value.repository.commonDir,record.ref,{privateFile:true});
  const expected={schema:'pipeline.controlled-method-dispatch-observation.v1',...inspected.value,diagnosticObservation:inspected.diagnosticObservation,courseObservation:inspected.course,adapterSourceSha256:record.source.sha256,independentCriticPass:false};
  if(!read.bytes.equals(Buffer.from(canonical(expected))))fail('CMO-OBSERVATION-CAS');return record;
}
/** Dedicated METHOD binding; ordinary native/local Critic evidence remains unchanged. */
export function createLocalControlledMethodDispatchEvidenceBinding(input){
  exact(input,['root','taskId','reviewCandidateCommit','baseCommit','methodDispatchHandle']);
  const root=physicalRoot(input.root),record=readPublished(input.methodDispatchHandle,root),value=record.inspected.value;
  if(input.taskId!==value.taskId||input.reviewCandidateCommit!==value.reviewCandidate.commit||input.baseCommit!==value.reviewBaseCommit)fail('CMO-RANGE');
  if(record.binding)fail('CMO-BINDING-LIFETIME');
  const binding=Object.freeze({schema:'pipeline.local-controlled-method-dispatch-evidence.v1',taskId:value.taskId,reviewBaseCommit:value.reviewBaseCommit,reviewCandidateCommit:value.reviewCandidate.commit,registrationCommit:value.registrationCommit,observationRef:structuredClone(record.ref),assurance:'controlled-source-method',native:false,independentCriticPass:false});
  bindings.set(binding,{record,snapshot:canonical(binding)});record.binding=binding;return binding;
}
/** Genuine same-process binding only, for a separately owned controlled-method carrier. */
export function inspectLocalControlledMethodDispatchEvidenceBinding(input){
  exact(input,['binding','methodDispatchHandle']);const branded=bindings.get(input.binding);
  if(!branded||branded.record.methodDispatchHandle!==input.methodDispatchHandle||canonical(input.binding)!==branded.snapshot)fail('CMO-BINDING');
  const record=readPublished(input.methodDispatchHandle,branded.record.root);if(record!==branded.record||record.binding!==input.binding)fail('CMO-BINDING');
  return Object.freeze({binding:structuredClone(input.binding),dispatch:structuredClone(record.inspected.value),diagnosticObservation:structuredClone(record.inspected.diagnosticObservation),courseObservation:structuredClone(record.inspected.course)});
}
