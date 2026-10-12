// SPDX-License-Identifier: SUL-1.0
// Controlled source-method observation. This is NOT a native dispatch record.
import {createHash,randomBytes} from 'node:crypto';
import {constants,openSync,closeSync,fstatSync,fsyncSync,lstatSync,readFileSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs';
import {join,dirname,resolve,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {isSuccessfulSpawn} from './successful-spawn.mjs';
import {produceCriticDiagnostic} from './critic-diagnostic-producer.mjs';
import {validateCriticDiagnostic} from './critic-diagnostic-evidence.mjs';
import {readCriticCourseAdmission} from './critic-course-admission.mjs';
import {inspectSignedDescriptorCustodyRepository} from './worktree-lifecycle.mjs';
import {inspectControlledMethodContinuityDispatchPreparation,completeControlledMethodContinuityDispatchPreparation} from './onboarding-continuity.mjs';

const handles=new WeakMap(),roots=new Map(),sha=b=>createHash('sha256').update(b).digest('hex');
const RULESET='b7115494a79c3271c224c51d0bd388b0ccfff931a4ae11a0cd6a7eb19ce0b88d';
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
function fail(code){const e=new Error(code);e.code=code;throw e;}
function exact(v,keys){return v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join()===keys.slice().sort().join();}
function physical(path){
  const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>1048576||realpathSync(path)!==path)fail('CMD-PHYSICAL');
  const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));let bytes;
  try{const f=fstatSync(fd);if(f.dev!==s.dev||f.ino!==s.ino||f.mode!==s.mode||f.nlink!==1)fail('CMD-CAS');bytes=readFileSync(fd);}finally{closeSync(fd);}
  const after=lstatSync(path);if(after.dev!==s.dev||after.ino!==s.ino||after.mode!==s.mode||after.nlink!==1||after.size!==bytes.length||sha(readFileSync(path))!==sha(bytes))fail('CMD-CAS');
  return bytes;
}
function directory(path){const s=lstatSync(path);if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(path)!==path||(typeof process.getuid==='function'&&s.uid!==process.getuid()))fail('CMD-DIRECTORY');return s;}
function dirIdentity(path){const s=directory(path);return {dev:String(s.dev),ino:String(s.ino),mode:s.mode&0o777};}
function repoPath(root,path){
  if(typeof path!=='string'||isAbsolute(path)||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'))fail('CMD-PATH');
  let at=root;for(const p of path.split('/')){at=join(at,p);try{const s=lstatSync(at);if(s.isSymbolicLink())fail('CMD-PATH');}catch(e){if(e.code!=='ENOENT')throw e;}}
  return at;
}
function reference(root,path){const bytes=physical(repoPath(root,path));return {path,sha256:sha(bytes),size:bytes.length};}
function put(path,bytes){
  directory(dirname(path));const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
  try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}if(!physical(path).equals(bytes))fail('CMD-READBACK');
  const s=lstatSync(path);return {sha256:sha(bytes),size:bytes.length,identity:{dev:String(s.dev),ino:String(s.ino),mode:s.mode&0o777,nlink:s.nlink}};
}
function git(record,args){
  const r=spawnSync('git',['-C',record.root,...args],{encoding:'utf8',shell:false,timeout:15000,maxBuffer:1048576,env:{...process.env}});
  if(!isSuccessfulSpawn(r)||r.signal!==null)fail('CMD-GIT');return String(r.stdout).trim();
}
function privateRef(record,path){const rel=relative(record.inputs.repository.commonDir,path).split(sep).join('/');if(!rel||rel.startsWith('../'))fail('CMD-PRIVATE-PATH');return {path:'.git/'+rel,...put(path,Buffer.from(canonical(record.value)))};}
function inspect(record){
  if(record.stage!=='complete'||roots.get(record.root)!==record||sha(physical(fileURLToPath(import.meta.url)))!==record.sourceSha256)fail('CMD-HANDLE');
  for(const row of record.directoryPins)if(canonical(dirIdentity(row.path))!==canonical(row.identity))fail('CMD-DIRECTORY-CAS');
  if(git(record,['rev-parse','HEAD'])!==record.repository.candidate.commit||git(record,['rev-parse','HEAD^{tree}'])!==record.repository.candidate.tree)fail('CMD-HEAD');
  for(const row of [record.attemptRef,record.terminalRef]){const path=join(record.inputs.repository.commonDir,row.path.slice(5)),bytes=physical(path),s=lstatSync(path),identity={dev:String(s.dev),ino:String(s.ino),mode:s.mode&0o777,nlink:s.nlink};if(sha(bytes)!==row.sha256||canonical(identity)!==canonical(row.identity)||(s.mode&0o077)!==0)fail('CMD-RECEIPT-CAS');}
  for(const row of record.evidenceRefs)if(sha(physical(repoPath(record.root,row.path)))!==row.sha256)fail('CMD-EVIDENCE-CAS');
  return Object.freeze({repository:structuredClone(record.repository),previousRepository:structuredClone(record.inputs.repository),featureId:record.inputs.featureId,
    taskId:record.taskId,reviewBaseCommit:record.inputs.reviewBaseCommit,reviewCandidate:structuredClone(record.reviewCandidate),registrationCommit:record.repository.candidate.commit,
    preparationRef:structuredClone(record.inputs.preparationRef),attemptRef:structuredClone(record.attemptRef),terminalRef:structuredClone(record.terminalRef),
    manifestBefore:structuredClone(record.manifestBefore),manifestAfter:structuredClone(record.manifestAfter),evidenceRefs:record.evidenceRefs.map(v=>({...v})),
    diagnosticRef:structuredClone(record.diagnosticRef),sourceSha256:record.sourceSha256,assurance:'controlled-source-method',native:false});
}

/** Only a real same-process private preparation handle can enter this constructor. */
export function prepareSourceOwnedControlledMethodDispatch(input){
  if(!exact(input,['repository','preparationHandle']))fail('CMD-INPUT');
  const {repository,preparationHandle}=input;
  const inputs=inspectControlledMethodContinuityDispatchPreparation({repository,preparationHandle});
  if(roots.has(inputs.repository.primaryRoot)||roots.size>=4096)fail('CMD-LIFETIME');
  const root=inputs.repository.primaryRoot,directoryPath=join(inputs.fixtureRoot,'method-dispatch');
  directory(root);directory(inputs.repository.commonDir);directory(inputs.fixtureRoot);
  const handle=Object.freeze({}),record={handle,inputs,root,directory:directoryPath,stage:'attempting',sourceSha256:sha(physical(fileURLToPath(import.meta.url)))};
  handles.set(handle,record);roots.set(root,record);
  mkdirSync(directoryPath,{mode:0o700});
  record.directoryPins=[root,inputs.repository.commonDir,inputs.fixtureRoot,directoryPath].map(path=>({path,identity:dirIdentity(path)}));
  const candidate={commit:git(record,['rev-parse','HEAD']),tree:git(record,['rev-parse','HEAD^{tree}'])};
  if(canonical(candidate)!==canonical(repository.candidate))fail('CMD-HEAD');record.reviewCandidate=candidate;
  const taskId=`method-continuity-${inputs.featureId}-${inputs.preparationRef.sha256.slice(0,16)}`;record.taskId=taskId;
  const command=[process.execPath,'--check',inputs.verifySuite.path];
  const attempt={schema:'pipeline.controlled-method-dispatch-attempt.v1',taskId,featureId:inputs.featureId,preparationRef:inputs.preparationRef,
    reviewBaseCommit:inputs.reviewBaseCommit,candidate,specRef:inputs.specRef,suiteRef:{path:inputs.verifySuite.path,sha256:inputs.verifySuite.sha256},
    methodologyRulesetSha256:RULESET,command:{kind:'canonical-node-syntax',arguments:['--check',inputs.verifySuite.path]},sourceSha256:record.sourceSha256,assurance:'controlled-source-method'};
  record.value=attempt;record.attemptRef=privateRef(record,join(directoryPath,'attempt.json'));
  const diagnostic=produceCriticDiagnostic({root,candidate:candidate.commit,specPath:inputs.specRef.path,guardrailPaths:[],command,label:'controlled-method-syntax',logPath:`evidence/${taskId}.log`,pending:['independent-critic','full-verify']});
  const afterCapture=inspectControlledMethodContinuityDispatchPreparation({repository,preparationHandle});
  if(canonical(afterCapture)!==canonical(inputs))fail('CMD-PREPARATION-CAS');
  for(const row of record.directoryPins)if(canonical(dirIdentity(row.path))!==canonical(row.identity))fail('CMD-DIRECTORY-CAS');
  const evidenceDir=`specs/${inputs.featureId}/evidence`,prefix=`${evidenceDir}/method-dispatch-${randomBytes(16).toString('hex')}`;
  directory(repoPath(root,evidenceDir));
  const originalLog=physical(repoPath(root,diagnostic.targeted.log.path)),logPath=prefix+'.log';
  put(repoPath(root,logPath),originalLog);const logRef=reference(root,logPath);
  diagnostic.targeted.log={path:logPath,sha256:logRef.sha256};validateCriticDiagnostic(diagnostic,{root,candidate});
  const diagnosticPath=prefix+'.json',diagnosticBytes=Buffer.from(canonical(diagnostic));put(repoPath(root,diagnosticPath),diagnosticBytes);record.diagnosticRef=reference(root,diagnosticPath);
  const manifestPath=inputs.manifestPath,manifestBytes=physical(repoPath(root,manifestPath)),manifest=JSON.parse(manifestBytes);
  record.manifestBefore={path:manifestPath,sha256:sha(manifestBytes),size:manifestBytes.length};
  if(manifest.feature?.id!==inputs.featureId||!Array.isArray(manifest.artifacts)||manifest.artifacts.length>4094)fail('CMD-MANIFEST');
  const added=[logRef,record.diagnosticRef].map(ref=>({class:'candidate-evidence',path:ref.path,sha256:ref.sha256,authority:false,mutability:'immutable',retention:'retain'}));
  if(added.some(v=>manifest.artifacts.some(x=>x.path===v.path)))fail('CMD-COLLISION');
  const next={...manifest,artifacts:[...manifest.artifacts,...added]},nextBytes=Buffer.from(JSON.stringify(next,null,2)+'\n');
  // Exact real preimage and finite manifest-only append; never caller JSON authority.
  const physicalManifest=repoPath(root,manifestPath),before=lstatSync(physicalManifest);
  const fd=openSync(physicalManifest,constants.O_WRONLY|(constants.O_NOFOLLOW??0));
  try{const opened=fstatSync(fd);if(opened.dev!==before.dev||opened.ino!==before.ino||opened.nlink!==1||sha(readFileSync(physicalManifest))!==record.manifestBefore.sha256)fail('CMD-MANIFEST-CAS');
    // Separate replacement is sealed and immediately physically reopened.
    writeFileSync(fd,nextBytes);const trailing=opened.size-nextBytes.length;if(trailing>0)fail('CMD-MANIFEST-SIZE');fsyncSync(fd);
  }finally{closeSync(fd);}if(!physical(physicalManifest).equals(nextBytes))fail('CMD-MANIFEST-READBACK');
  git(record,['add','-f','--',manifestPath,logPath,diagnosticPath]);
  git(record,['-c','user.name=AUTH Unit','-c','user.email=auth@example.invalid','commit','-q','-m','test(pipeline): register controlled method diagnostic\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true']);
  const registrationCommit=git(record,['rev-parse','HEAD']),tree=git(record,['rev-parse','HEAD^{tree}']);
  const changed=git(record,['diff','--name-only',candidate.commit,registrationCommit,'--']).split('\n').filter(Boolean).sort();
  if(canonical(changed)!==canonical([manifestPath,logPath,diagnosticPath].sort())||git(record,['rev-parse',registrationCommit+'^'])!==candidate.commit)fail('CMD-TRANSPORT');
  const admission=readCriticCourseAdmission({repoRoot:root,featureId:inputs.featureId,baseCommit:inputs.reviewBaseCommit,candidateCommit:candidate.commit,registrationCommit,requestedMode:'full',acceptedReference:inputs.acceptedRef,criterionLocator:null,deltaRequestPath:null});
  if(admission.decision?.status!=='admitted')fail('CMD-COURSE-OBSERVATION-UNAVAILABLE');
  record.manifestAfter=reference(root,manifestPath);record.evidenceRefs=[logRef,record.diagnosticRef,record.manifestAfter];
  record.repository=inspectSignedDescriptorCustodyRepository(root);
  if(record.repository.primaryRoot!==root||record.repository.commonDir!==inputs.repository.commonDir
      ||record.repository.candidate.commit!==registrationCommit||record.repository.candidate.tree!==tree)fail('CMD-REPOSITORY-CAS');
  for(const row of record.directoryPins)if(canonical(dirIdentity(row.path))!==canonical(row.identity))fail('CMD-DIRECTORY-CAS');
  record.value={schema:'pipeline.controlled-method-dispatch-terminal.v1',taskId,attemptRef:record.attemptRef,diagnosticRef:record.diagnosticRef,
    outcome:{kind:'diagnostic-captured',exitCode:diagnostic.targeted.exitCode},reviewCandidate:candidate,registrationCommit,
    evidenceRefs:record.evidenceRefs,sourceSha256:record.sourceSha256,assurance:'controlled-source-method',native:false,independentCriticPass:false};
  record.terminalRef=privateRef(record,join(directoryPath,'terminal.json'));record.stage='complete';
  completeControlledMethodContinuityDispatchPreparation({preparationHandle,methodDispatchHandle:handle});
  return Object.freeze({methodDispatchHandle:handle,...inspect(record),productionDispatchStatus:'unavailable',productionDispatchCode:'CMD-M5-METHOD-OBSERVATION-ADAPTER-UNAVAILABLE'});
}

/** Source-private opaque handle only. Returned receipt data cannot reconstruct it. */
export function inspectSourceOwnedControlledMethodDispatchHandle(input){
  if(!exact(input,['methodDispatchHandle']))fail('CMD-INPUT');
  const {methodDispatchHandle}=input;
  const record=handles.get(methodDispatchHandle);if(!record)fail('CMD-HANDLE');return inspect(record);
}
