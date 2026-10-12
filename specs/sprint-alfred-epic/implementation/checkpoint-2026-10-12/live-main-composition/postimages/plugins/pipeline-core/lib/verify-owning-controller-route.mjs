// SPDX-License-Identifier: SUL-1.0
// Closed harness navigation only. The fixed Controller independently authenticates
// its genuine course/requester; this module creates no runtime or authority handle.
import {createHash,randomBytes} from 'node:crypto';
import {constants,openSync,closeSync,fstatSync,lstatSync,readFileSync,realpathSync,mkdirSync,writeFileSync,fsyncSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {resolve,relative,join,sep,posix,dirname,isAbsolute} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseStrictJson} from './governance-event.mjs';

export const VERIFY_OWNING_CONTROLLER_ROUTE_SCHEMA='pipeline.verify-owning-controller-route.v1';
export const VERIFY_OWNING_CONTROLLER_SUPPORT_SCHEMA='pipeline.verify-owning-controller-support.v1';
export const VERIFY_OWNING_CONTROLLER_FILE='plugins/pipeline-core/scripts/owning-verification-controller.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('\0')===[...keys].sort().join('\0');
const variants={OSV001:['standard'],OSV002:['standard'],OSV003:['standard'],OSV004:['complete','missing','malformed','duplicate-declaration','incomplete','real-failure'],OSV005:['replay','deadline','disconnect'],OSV006:['standard'],OSV007:['standard'],OSV008:['standard']};
const specs=new Map();
for(const [caseId,list]of Object.entries(variants))for(const variant of list){const name=caseId.toLowerCase()+'-'+variant;specs.set(name,Object.freeze({name,caseId,variant,file:`scratch/osv-independent/${caseId.toLowerCase()}/${variant}.mjs`,taskSource:`project/owning-verification-tasks/${name}.json`,taskSchema:'pipeline.owning-verification-controller-check.v1'}));}
for(const caseId of ['MFHS001','MFHS015','MFHS020']){const name=caseId.toLowerCase()+'-genuine-standard';specs.set(name,Object.freeze({name,caseId,variant:'standard',file:`scratch/model-family-genuine-mutation/${caseId.toLowerCase()}-standard.mjs`,taskSource:`project/model-family-genuine-mutation-tasks/${caseId.toLowerCase()}-standard.json`,taskSchema:'pipeline.owning-model-qualification-controller-check.v1'}));}
export const VERIFY_OWNING_CONTROLLER_EXECUTABLE_IDS=Object.freeze([...specs.keys()].sort());
const SUPPORT_NAME='osv002-missing',SUPPORT_TARGET='scratch/osv-independent/osv002/missing.mjs';
function fail(code){const e=new Error(code);e.code=code;throw e;}
function safePath(value){return typeof value==='string'&&!value.includes('\\')&&!value.includes('\0')&&!posix.isAbsolute(value)&&posix.normalize(value)===value&&!value.split('/').some(x=>!x||x==='.'||x==='..');}
function policy(policy,caseId){return exact(policy,['schema','caseIds','maxBytes'])&&policy.schema==='pipeline.verify-case-completion-policy.v1'&&Array.isArray(policy.caseIds)&&policy.caseIds.length===1&&policy.caseIds[0]===caseId&&policy.maxBytes===65536;}

export function validateVerifyOwningControllerMetadata(suite){
  const hasRoute=Object.hasOwn(suite??{},'owningController'),hasSupport=Object.hasOwn(suite??{},'owningControllerSupport');
  if(!hasRoute&&!hasSupport)return specs.has(suite?.name)||suite?.name===SUPPORT_NAME?{ok:false,error:'OWNING-CONTROLLER-METADATA-REQUIRED'}:{ok:true,kind:'ordinary'};
  if(hasRoute&&hasSupport)return {ok:false,error:'OWNING-CONTROLLER-ROLE'};
  if(hasSupport){
    if(suite.name!==SUPPORT_NAME||suite.file!==SUPPORT_TARGET||!exact(suite.owningControllerSupport,['schema','requiredBy'])||suite.owningControllerSupport.schema!==VERIFY_OWNING_CONTROLLER_SUPPORT_SCHEMA||suite.owningControllerSupport.requiredBy!=='osv002-standard'||!policy(suite.caseCompletion,'OSVF001'))return {ok:false,error:'OWNING-CONTROLLER-SUPPORT'};
    return {ok:true,kind:'support'};
  }
  const spec=specs.get(suite.name);
  if(!spec||suite.file!==spec.file||!exact(suite.owningController,['schema','taskSource'])||suite.owningController.schema!==VERIFY_OWNING_CONTROLLER_ROUTE_SCHEMA||suite.owningController.taskSource!==spec.taskSource||!safePath(suite.owningController.taskSource)||!policy(suite.caseCompletion,spec.caseId)||Object.hasOwn(suite,'args'))return {ok:false,error:'OWNING-CONTROLLER-ROUTE'};
  return {ok:true,kind:'execution',spec};
}

export function validateVerifyOwningControllerTask(suite,value){
  const result=validateVerifyOwningControllerMetadata(suite);
  if(!result.ok||result.kind!=='execution')return false;
  const {spec}=result,keys=spec.taskSchema==='pipeline.owning-model-qualification-controller-check.v1'?['schema','suiteId','caseId','variant','declarationPath']:['schema','suiteId','caseId','variant'];
  return exact(value,keys)&&value.schema===spec.taskSchema&&value.suiteId===suite.name&&value.caseId===spec.caseId&&value.variant===spec.variant&&(keys.length===4||value.declarationPath==='project/model-family-genuine-mutation-qualification.v1.json');
}

// Pure registration projection, not an execution capability. The owning core
// must retain the raw committed registration and its genuine private association.
// Outer Controller FD3 and genuinely authored inner OSV FD3 are distinct streams.
export function projectVerifyOwningControllerTaskSuite(suite){
  const result=validateVerifyOwningControllerMetadata(suite);if(!result.ok)fail(result.error);
  if(result.kind==='ordinary')return structuredClone(suite);
  const {owningController,owningControllerSupport,...inner}=structuredClone(suite);
  if(result.kind==='execution'&&result.spec.caseId.startsWith('OSV'))inner.caseCompletion={schema:'pipeline.verify-case-completion-policy.v1',caseIds:result.spec.variant==='incomplete'?['OSVF001','OSVF002']:['OSVF001'],maxBytes:65536};
  return inner;
}


// Input DATA custody only. These handles confer no requester/course authority.
const privateTaskInputs=new WeakMap();
function privateDirectory(root,directory){
  ancestors(root,join(directory,'task.json'));const s=lstatSync(directory);
  if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(directory)!==directory||(s.mode&4095)!==448||(typeof process.getuid==='function'&&s.uid!==process.getuid()))fail('VERIFY-OWNING-TASK-DIRECTORY');
  return {dev:s.dev,ino:s.ino,mode:s.mode,uid:s.uid};
}
function sameDirectory(root,directory,expected){if(JSON.stringify(privateDirectory(root,directory))!==JSON.stringify(expected))fail('VERIFY-OWNING-TASK-CAS');}
export function inspectMaterializedVerifyOwningControllerTaskInput(input){
  const entry=privateTaskInputs.get(input);if(!entry||entry.released)fail('VERIFY-OWNING-TASK-HANDLE');
  sameDirectory(entry.root,entry.directory,entry.directoryIdentity);const fresh=image(entry.root,entry.relativeFile);
  if(fresh.mode!==384||fresh.fileSha256!==entry.source.fileSha256||JSON.stringify(fresh.identity)!==JSON.stringify(entry.fileIdentity)||readdirSync(entry.directory).sort().join('\0')!=='task.json')fail('VERIFY-OWNING-TASK-CAS');
  return {committedInput:entry.source,materializedInput:{path:entry.relativeFile,fileSha256:fresh.fileSha256},physicalInput:{mode:fresh.mode,size:fresh.size,identity:fresh.identity,directoryIdentity:entry.directoryIdentity}};
}
export function materializeVerifyOwningControllerTaskInput({repoRoot,suite,candidateTree=null,supports=[]}){
  const invocation=inspectVerifyOwningControllerRoute({repoRoot,suite,candidateTree,supports}),root=rootPath(repoRoot),normalized=lexicalSuite(root,suite),source=image(root,normalized.owningController.taskSource);
  if(invocation.files.find(f=>f.path===source.path)?.fileSha256!==source.fileSha256)fail('VERIFY-OWNING-TASK-SOURCE-DRIFT');
  const scratch=join(root,'scratch');try{const s=lstatSync(scratch);if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(scratch)!==scratch||(s.mode&18)!==0)fail('VERIFY-OWNING-TASK-SCRATCH');}catch(e){if(e.code!=='ENOENT')throw e;mkdirSync(scratch,{mode:448});}
  const namespace=join(scratch,'owning-controller-inputs');try{lstatSync(namespace);}catch(e){if(e.code!=='ENOENT')throw e;mkdirSync(namespace,{mode:448});}privateDirectory(root,namespace);
  const directory=join(namespace,normalized.name+'-'+randomBytes(16).toString('hex'));mkdirSync(directory,{mode:448});const directoryIdentity=privateDirectory(root,directory),file=join(directory,'task.json'),relativeFile=relative(root,file).split(sep).join('/');
  let createdIdentity=null;
  try{
    const fd=openSync(file,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,384);
    try{writeFileSync(fd,source.bytes);fsyncSync(fd);const s=fstatSync(fd);createdIdentity={dev:s.dev,ino:s.ino};if(!s.isFile()||s.nlink!==1||(s.mode&4095)!==384)fail('VERIFY-OWNING-TASK-FILE');}finally{closeSync(fd);}
    const fresh=image(root,relativeFile);if(fresh.mode!==384||fresh.fileSha256!==source.fileSha256||fresh.identity.dev!==createdIdentity.dev||fresh.identity.ino!==createdIdentity.ino)fail('VERIFY-OWNING-TASK-CAS');
    const again=inspectVerifyOwningControllerRoute({repoRoot:root,suite,candidateTree,supports});if(again.routeSha256!==invocation.routeSha256)fail('VERIFY-OWNING-TASK-SOURCE-DRIFT');
    const input=Object.freeze({file:invocation.file,args:Object.freeze(['--root',root,'--suite',normalized.name,'--task-source',file])});
    privateTaskInputs.set(input,{root,directory,directoryIdentity,relativeFile,fileIdentity:fresh.identity,source:{path:source.path,fileSha256:source.fileSha256},released:false});inspectMaterializedVerifyOwningControllerTaskInput(input);return input;
  }catch(error){
    sameDirectory(root,directory,directoryIdentity);
    if(createdIdentity){const s=lstatSync(file);if(s.dev!==createdIdentity.dev||s.ino!==createdIdentity.ino||!s.isFile()||s.nlink!==1||(s.mode&4095)!==384)fail('VERIFY-OWNING-TASK-CLEANUP-CAS');unlinkSync(file);}
    if(readdirSync(directory).length!==0)fail('VERIFY-OWNING-TASK-CLEANUP-CAS');rmdirSync(directory);throw error;
  }
}
export function releaseMaterializedVerifyOwningControllerTaskInput(input){
  const entry=privateTaskInputs.get(input);if(!entry||entry.released)fail('VERIFY-OWNING-TASK-HANDLE');
  const observation=inspectMaterializedVerifyOwningControllerTaskInput(input);
  unlinkSync(join(entry.root,entry.relativeFile));sameDirectory(entry.root,entry.directory,entry.directoryIdentity);if(readdirSync(entry.directory).length!==0)fail('VERIFY-OWNING-TASK-CLEANUP-CAS');rmdirSync(entry.directory);entry.released=true;return observation;
}

function lexicalSuite(repoRoot,suite){
  const file=relative(repoRoot,isAbsolute(suite.file)?resolve(suite.file):resolve(repoRoot,suite.file)).split(sep).join('/');
  if(!safePath(file))fail('VERIFY-OWNING-CONTROLLER-TARGET');
  return {...suite,file};
}
function rootPath(repoRoot){const root=resolve(repoRoot);if(realpathSync(root)!==root||!lstatSync(root).isDirectory())fail('VERIFY-OWNING-CONTROLLER-ROOT');return root;}
function ancestors(root,path){let cursor=dirname(path);while(cursor!==root){if(relative(root,cursor).startsWith('..'+sep)||cursor===dirname(cursor))fail('VERIFY-OWNING-CONTROLLER-PATH');let row;try{row=lstatSync(cursor);}catch(e){if(e.code==='ENOENT'){cursor=dirname(cursor);continue;}throw e;}if(!row.isDirectory()||row.isSymbolicLink()||realpathSync(cursor)!==cursor)fail('VERIFY-OWNING-CONTROLLER-PATH');cursor=dirname(cursor);}}
function absent(root,path){ancestors(root,path);try{lstatSync(path);}catch(e){if(e.code==='ENOENT')return;throw e;}fail('VERIFY-OWNING-CONTROLLER-TARGET-PRESENT');}
function image(root,rel){
  if(!safePath(rel))fail('VERIFY-OWNING-CONTROLLER-PATH');const path=join(root,rel);ancestors(root,path);if(realpathSync(path)!==path)fail('VERIFY-OWNING-CONTROLLER-PATH');
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const a=fstatSync(fd);if(!a.isFile()||a.nlink!==1||a.size>1048576)fail('VERIFY-OWNING-CONTROLLER-FILE');const bytes=readFileSync(fd),z=fstatSync(fd),n=lstatSync(path),keys=['dev','ino','mode','nlink','size','mtimeMs','ctimeMs'];for(const k of keys)if(a[k]!==z[k]||a[k]!==n[k])fail('VERIFY-OWNING-CONTROLLER-CAS');return {path:rel,fileSha256:hash(bytes),mode:a.mode&4095,size:a.size,identity:Object.fromEntries(keys.map(k=>[k,a[k]])),bytes};}finally{closeSync(fd);}
}
function git(root,args){const r=spawnSync('git',args,{cwd:root,env:process.env,shell:false,encoding:null,timeout:10000,maxBuffer:2097152});if(r.error||r.signal!==null||r.status!==0)fail('VERIFY-OWNING-CONTROLLER-GIT');return r.stdout;}
function selected(root,candidate){if(candidate===null||candidate===undefined)return git(root,['rev-parse','HEAD^{tree}']).toString().trim();if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(candidate))fail('VERIFY-OWNING-CONTROLLER-CANDIDATE');return candidate;}
function committed(root,ref,fact){const record=git(root,['ls-tree','-z',ref,'--',fact.path]).toString();const match=/^(100644|100755) blob [a-f0-9]{40,64}\t([^\0]+)\0$/u.exec(record);if(!match||match[2]!==fact.path||fact.mode!==(match[1]==='100644'?420:493)||hash(git(root,['show',ref+':'+fact.path]))!==fact.fileSha256)fail('VERIFY-OWNING-CONTROLLER-UNCOMMITTED');}
function committedAbsent(root,ref,file){if(git(root,['ls-tree','-z',ref,'--',file]).length!==0)fail('VERIFY-OWNING-CONTROLLER-TARGET-COMMITTED');}

export function inspectVerifyOwningControllerSupports({repoRoot,suites,candidateTree=null}){
  if(!suites.some(s=>Object.hasOwn(s,'owningController')||Object.hasOwn(s,'owningControllerSupport')))return [];
  const root=rootPath(repoRoot),ref=selected(root,candidateTree),rows=[];
  const normalized=suites.map(s=>lexicalSuite(root,s));
  for(const suite of normalized){const result=validateVerifyOwningControllerMetadata(suite);if(!result.ok)fail(result.error);if(result.kind!=='support')continue;if(rows.length||!normalized.some(s=>s.name==='osv002-standard'&&validateVerifyOwningControllerMetadata(s).kind==='execution'))fail('VERIFY-OWNING-CONTROLLER-SUPPORT-ORPHAN');absent(root,join(root,suite.file));committedAbsent(root,ref,suite.file);rows.push({name:suite.name,file:suite.file,requiredBy:'osv002-standard',caseCompletion:suite.caseCompletion,absent:true});}
  if(normalized.some(s=>s.name==='osv002-standard'&&Object.hasOwn(s,'owningController'))&&rows.length!==1)fail('VERIFY-OWNING-CONTROLLER-SUPPORT-MISSING');
  return rows;
}

export function inspectVerifyOwningControllerRoute({repoRoot,suite,candidateTree=null,supports=[]}){
  const root=rootPath(repoRoot),normalized=lexicalSuite(root,suite),validation=validateVerifyOwningControllerMetadata(normalized);
  if(!validation.ok||validation.kind!=='execution')fail('VERIFY-OWNING-CONTROLLER-ROUTE');
  const ref=selected(root,candidateTree);absent(root,join(root,normalized.file));committedAbsent(root,ref,normalized.file);
  const controller=image(root,VERIFY_OWNING_CONTROLLER_FILE),task=image(root,normalized.owningController.taskSource);committed(root,ref,controller);committed(root,ref,task);
  if(!validateVerifyOwningControllerTask(normalized,parseStrictJson(task.bytes)))fail('VERIFY-OWNING-CONTROLLER-TASK');
  const requiredSupports=normalized.name==='osv002-standard'?supports:[];
  if(normalized.name==='osv002-standard'){
    if(requiredSupports.length!==1||requiredSupports[0].name!==SUPPORT_NAME||requiredSupports[0].file!==SUPPORT_TARGET||requiredSupports[0].requiredBy!==normalized.name||requiredSupports[0].absent!==true||!policy(requiredSupports[0].caseCompletion,'OSVF001'))fail('VERIFY-OWNING-CONTROLLER-SUPPORT-MISSING');
    absent(root,join(root,SUPPORT_TARGET));committedAbsent(root,ref,SUPPORT_TARGET);
  }
  const args=['--root',root,'--suite',normalized.name,'--task-source',join(root,normalized.owningController.taskSource)];
  for(const fact of [controller,task]){const fresh=image(root,fact.path);if(fresh.fileSha256!==fact.fileSha256||JSON.stringify(fresh.identity)!==JSON.stringify(fact.identity))fail('VERIFY-OWNING-CONTROLLER-CAS');}
  absent(root,join(root,normalized.file));
  return {file:join(root,VERIFY_OWNING_CONTROLLER_FILE),args,implementationSha256:controller.fileSha256,files:[controller,task].map(({bytes,mode,size,identity,...fact})=>fact),routeSha256:hash(JSON.stringify({metadata:normalized.owningController,target:normalized.file,args,supports:requiredSupports})),supports:requiredSupports};
}
