// SPDX-License-Identifier: SUL-1.0
// The Controller authors its own task files. Existing JSON/files never mint a task event.
import {createHash,randomBytes} from 'node:crypto';
import {closeSync,constants,fstatSync,fsyncSync,lstatSync,mkdirSync,openSync,readFileSync,readSync,realpathSync,writeSync} from 'node:fs';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sameProcess as sameLinuxVerificationProcess} from './codex-host-process-journal.mjs';
import {sameNativeWindowsProcess} from './windows-native-process-observer.mjs';
import {readWindowsAuthoritySourceModule,inspectWindowsAuthoritySourceImage,observeWindowsAuthorityAncestor,
  createWindowsOwnedAuthorityDirectory,createWindowsOwnedAuthorityExclusiveFile} from './windows-owned-authority-backend.mjs';
import {loadDeclarativeVerifySuites} from './verify-suite-registration.mjs';
import {projectVerifyOwningControllerTaskSuite} from './verify-owning-controller-route.mjs';
import {acquireSourceOwnedContinuityVerificationOwner,inspectSourceOwnedContinuityVerificationOwner,
  registerSourceOwnedCourseVerificationAssociation,createSourceOwnedContinuityVerificationPort,inspectSourceOwnedControlledMethodVerificationPreparation} from './onboarding-continuity.mjs';

const preparations=new WeakMap(),controllers=new WeakMap();
const MAX_FILES=128,MAX_FILE=4*1024*1024,MAX_TOTAL=32*1024*1024;
const SHA=/^[a-f0-9]{64}$/;
export const OWNED_VERIFICATION_CODES=Object.freeze(['OSV-OWNER-UNAVAILABLE','OSV-COURSE-UNAVAILABLE',
  'OSV-ASSOCIATION-UNAVAILABLE','OSV-INPUT-DRIFT','OSV-EXCHANGE-UNAVAILABLE','OSV-REPLAY',
  'OSV-EXPIRED','OSV-VERIFY-FAILED','OSV-TERMINAL-UNAVAILABLE']);
export class OwnedContinuityVerificationError extends Error {
  constructor(code){super(code);this.name='OwnedContinuityVerificationError';this.code=code;}
}
export function ownedVerificationFail(code){throw new OwnedContinuityVerificationError(code);}
export function ownedVerificationExact(value,keys){return value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join('\0')===[...keys].sort().join('\0');}
export function ownedVerificationCanonical(value){
  if(Array.isArray(value))return '['+value.map(ownedVerificationCanonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+ownedVerificationCanonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function ownedVerificationDigest(value){return createHash('sha256').update(ownedVerificationCanonical(value)).digest('hex');}
export function ownedVerificationFreeze(value){if(value&&typeof value==='object'){for(const v of Object.values(value))ownedVerificationFreeze(v);Object.freeze(value);}return value;}
// Platform observations are facts only; no caller record creates an owner or attempt.
export function ownedVerificationSameProcess(a,b){
  if(process.platform!=='win32')return sameLinuxVerificationProcess(a,b);
  // Remote native cwd is unavailable, not a Linux cwd/principal cast. Source
  // floor.program binds actual own cwd; the bridge joins captured child cwd.
  return a?.platform==='win32'&&b?.platform==='win32'
    &&sameNativeWindowsProcess({...a,cwd:null},{...b,cwd:null});
}
function windowsAncestors(path){const rows=[];let cursor=dirname(path);
  while(true){const observation=observeWindowsAuthorityAncestor({path:cursor});
    rows.push({path:cursor,nativeFacts:observation.nativeFacts,nativeFactsSha256:observation.nativeFactsSha256,helperSha256:observation.helperSha256});
    const parent=dirname(cursor);if(parent===cursor)break;cursor=parent;}return rows;
}
function windowsPhysicalFile(path,{root,maxBytes}){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<0||maxBytes>256*1024*1024)ownedVerificationFail('OSV-INPUT-DRIFT');
  if(!isAbsolute(path)||resolve(path)!==path||realpathSync(path).toLowerCase()!==path.toLowerCase()
    ||path.startsWith('\\\\'))ownedVerificationFail('OSV-INPUT-DRIFT');
  if(root)pathInside(root,path);
  // The actual current Node image has its separate native readonly streaming
  // observer. No arbitrary large artifact inherits the image exception.
  if(path.toLowerCase()===realpathSync(process.execPath).toLowerCase()){
    const before=windowsAncestors(path),image=inspectWindowsAuthoritySourceImage({path});
    if(image.committed!==false||image.size>maxBytes||!equal(before,windowsAncestors(path)))ownedVerificationFail('OSV-INPUT-DRIFT');
    return {ref:ownedVerificationFreeze({path,sha256:image.sha256,size:image.size,
      identity:{platform:'win32',nativeFacts:image.nativeFacts,nativeFactsSha256:image.nativeFactsSha256,helperSha256:image.helperSha256}}),bytes:null};
  }
  const named=lstatSync(path);if(!named.isFile()||named.isSymbolicLink()||named.nlink!==1
    ||named.size>Math.min(maxBytes,1048576))ownedVerificationFail('OSV-INPUT-DRIFT');
  const before=windowsAncestors(path),image=readWindowsAuthoritySourceModule({path,maxBytes:Math.min(maxBytes,1048576)});
  if(!equal(before,windowsAncestors(path))||image.bytes.length!==named.size)ownedVerificationFail('OSV-INPUT-DRIFT');
  return {ref:ownedVerificationFreeze({path,sha256:createHash('sha256').update(image.bytes).digest('hex'),size:image.bytes.length,
    identity:{platform:'win32',nativeFacts:image.nativeFacts,nativeFactsSha256:image.nativeFactsSha256,helperSha256:image.helperSha256}}),bytes:image.bytes};
}
function identity(s){return {dev:s.dev,ino:s.ino,mode:s.mode,uid:s.uid,gid:s.gid,nlink:s.nlink};}
function equal(a,b){return ownedVerificationCanonical(a)===ownedVerificationCanonical(b);}
function pathInside(root,path){const r=relative(root,path);if(!r||r==='..'||r.startsWith('..'+sep)||isAbsolute(r))ownedVerificationFail('OSV-INPUT-DRIFT');return r;}
export function readOwnedVerificationPhysicalFile(path,{root=null,maxBytes=MAX_FILE}={}){
  if(process.platform==='win32')return windowsPhysicalFile(path,{root,maxBytes});
  if(!isAbsolute(path)||resolve(path)!==path||realpathSync(path)!==path)ownedVerificationFail('OSV-INPUT-DRIFT');
  if(root){pathInside(root,path);let cursor=root;for(const part of relative(root,dirname(path)).split(sep).filter(Boolean)){
    cursor=join(cursor,part);const s=lstatSync(cursor);if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(cursor)!==cursor)ownedVerificationFail('OSV-INPUT-DRIFT');}}
  const first=lstatSync(path);if(!first.isFile()||first.isSymbolicLink()||first.nlink!==1||first.size>maxBytes||maxBytes>256*1024*1024)ownedVerificationFail('OSV-INPUT-DRIFT');
  let fd;try{fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const before=fstatSync(fd);
    if(!equal(identity(first),identity(before))||first.size!==before.size)ownedVerificationFail('OSV-INPUT-DRIFT');
    const bytes=Buffer.alloc(before.size);let offset=0;while(offset<bytes.length){const n=readSync(fd,bytes,offset,bytes.length-offset,offset);if(n===0)ownedVerificationFail('OSV-INPUT-DRIFT');offset+=n;}
    const tail=Buffer.alloc(1);if(readSync(fd,tail,0,1,offset)!==0)ownedVerificationFail('OSV-INPUT-DRIFT');
    const after=fstatSync(fd),named=lstatSync(path);
    if(!equal(identity(before),identity(after))||!equal(identity(before),identity(named))||after.size!==before.size||named.size!==before.size
      ||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||realpathSync(path)!==path)ownedVerificationFail('OSV-INPUT-DRIFT');
    return {ref:ownedVerificationFreeze({path,sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length,identity:identity(before)}),bytes};
  }finally{if(fd!==undefined)closeSync(fd);}
}
export function recheckOwnedVerificationPhysicalRefs(refs){for(const ref of refs){if(!equal(readOwnedVerificationPhysicalFile(ref.path,{maxBytes:Math.max(MAX_FILE,ref.size)}).ref,ref))ownedVerificationFail('OSV-INPUT-DRIFT');}return true;}
export function readOwnedVerificationCandidate(repository){
  const git=args=>{const r=spawnSync('git',['-C',repository.primaryRoot,...args],{encoding:'utf8',shell:false,timeout:5000});
    if(r.error||r.signal||r.status!==0)ownedVerificationFail('OSV-INPUT-DRIFT');return r.stdout.trim();};
  const commit=git(['rev-parse','HEAD']),tree=git(['rev-parse','HEAD^{tree}']);
  if(!/^[a-f0-9]{40,64}$/.test(commit)||!/^[a-f0-9]{40,64}$/.test(tree))ownedVerificationFail('OSV-INPUT-DRIFT');
  return ownedVerificationFreeze({commit,tree});
}
function blob(repository,candidate,path,required=false){
  const rel=pathInside(repository.primaryRoot,path).split(sep).join('/');
  const r=spawnSync('git',['-C',repository.primaryRoot,'rev-parse','--verify',candidate.commit+':'+rel],{encoding:'utf8',shell:false,timeout:5000});
  if(r.error||r.signal)ownedVerificationFail('OSV-INPUT-DRIFT');
  if(r.status!==0){if(required)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');return null;}
  const oid=r.stdout.trim();if(!/^[a-f0-9]{40,64}$/.test(oid))ownedVerificationFail('OSV-INPUT-DRIFT');
  const contents=spawnSync('git',['-C',repository.primaryRoot,'cat-file','blob',oid],{encoding:null,shell:false,timeout:5000,maxBuffer:MAX_FILE});
  if(contents.error||contents.signal||contents.status!==0)ownedVerificationFail('OSV-INPUT-DRIFT');
  const actual=readOwnedVerificationPhysicalFile(path,{root:repository.primaryRoot});
  if(!Buffer.from(contents.stdout).equals(actual.bytes))ownedVerificationFail('OSV-INPUT-DRIFT');return oid;
}
export function readOwnedVerificationRegistration(repository,suiteId){
  const path=join(repository.primaryRoot,'harness','verify-suites.json');
  const image=readOwnedVerificationPhysicalFile(path,{root:repository.primaryRoot}),candidate=readOwnedVerificationCandidate(repository);
  const loaded=loadDeclarativeVerifySuites(path);if(!loaded.ok||!loaded.exists)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
  const rows=loaded.suites.filter(s=>s.name===suiteId);if(rows.length!==1||!rows[0].caseCompletion)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
  const entry=rows[0],file=resolve(repository.primaryRoot,entry.file);pathInside(repository.primaryRoot,file);
  // Raw committed entry remains the authority/readset evidence. This pure closed
  // projection only separates outer Controller FD3 from the authored inner suite;
  // the original private owner/preparation/association gates below stay mandatory.
  let selected;try{selected=projectVerifyOwningControllerTaskSuite(entry);}
  catch{ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');}
  if(!equal(image.ref,readOwnedVerificationPhysicalFile(path).ref))ownedVerificationFail('OSV-INPUT-DRIFT');
  return ownedVerificationFreeze({registration:{physicalRef:image.ref,candidateBlobOid:blob(repository,candidate,path,true),entry:structuredClone(entry)},candidate,
    selectedSuite:{...selected,file}});
}

// A deliberately closed lexical subset. Computed loading/resources/programs are refused,
// rather than treating a caller's inventory as proof that arbitrary JS has a closed runtime graph.
function tokens(text){const out=[];let i=0;
  const escape=()=>{i++;const c=text[i++],simple={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0','\\':'\\',"'":"'",'"':'"','`':'`','$':'$'};
    if(Object.hasOwn(simple,c))return simple[c];if(c==='\n')return '';
    if(c==='x'||c==='u'){const n=c==='x'?2:4,hex=text.slice(i,i+n);if(!new RegExp('^[a-fA-F0-9]{'+n+'}$').test(hex))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');i+=n;return String.fromCharCode(parseInt(hex,16));}
    ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');};
  const scan=(nested=false)=>{let braces=0;while(i<text.length){const c=text[i];
    if(nested&&c==='}'&&braces===0){i++;return;}
    if(/\s/.test(c)){i++;continue;}if(text.startsWith('//',i)){const end=text.indexOf('\n',i);i=end<0?text.length:end;continue;}
    if(text.startsWith('/*',i)){const end=text.indexOf('*/',i+2);if(end<0)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');i=end+2;continue;}
    if(c==='"'||c==="'"){const quote=c;let v='';i++;while(i<text.length&&text[i]!==quote){v+=text[i]==='\\'?escape():text[i++];}
      if(text[i]!==quote)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');i++;out.push({string:v});continue;}
    if(c==='`'){const rawTemplate=out.at(-1)?.word==='raw'&&out.at(-2)?.word==='.'&&out.at(-3)?.word==='String';let v='',computed=false;i++;out.push({word:'template'});while(i<text.length&&text[i]!=='`'){
      if(text.startsWith('${',i)){computed=true;i+=2;scan(true);}else if(rawTemplate&&text[i]==='\\'){v+=text[i++];if(i>=text.length)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');v+=text[i++];}else v+=text[i]==='\\'?escape():text[i++];}
      if(text[i]!=='`')ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');i++;if(!computed)out.push({string:v});continue;}
    if(c==='/'){
      const previous=out.at(-1)?.word;
      if(previous===undefined||['=','(','[',':',',','!','?',';','{','return','yield','||','=>'].includes(previous)){
        let bracket=false,closed=false;i++;while(i<text.length){const r=text[i++];if(r==='\\'){i++;continue;}
          if(r==='[')bracket=true;if(r===']')bracket=false;if(r==='/'&&!bracket){closed=true;break;}if(r==='\n')ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');}
        if(!closed)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');while(/[a-z]/i.test(text[i]??'')&&i<text.length)i++;out.push({word:'regexp'});continue;
      }
      out.push({word:'/'});i++;continue;
    }
    if(text.startsWith("||",i)){out.push({word:"||"});i+=2;continue;}
    if(text.startsWith("=>",i)){out.push({word:"=>"});i+=2;continue;}
    const m=/^[A-Za-z_$][\w$]*/.exec(text.slice(i));if(m){out.push({word:m[0]});i+=m[0].length;}else{out.push({word:c});i++;if(c==='{')braces++;if(c==='}')braces--;}}
    if(nested)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');};scan();return out;
}
export function collectOwnedVerificationClosure(repository,entryFiles){
  const todo=[...entryFiles],seen=new Map();let total=0;
  while(todo.length){const path=todo.shift();if(seen.has(path))continue;if(seen.size>=MAX_FILES)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
    const image=readOwnedVerificationPhysicalFile(path,{root:repository.primaryRoot});total+=image.ref.size;if(total>MAX_TOTAL)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');seen.set(path,image.ref);
    if(!/\.(?:mjs|cjs|js)$/.test(path))continue;
    const t=tokens(image.bytes.toString('utf8')),dependencies=[];
    for(let i=0;i<t.length;i++){const word=t[i].word;
      if(['eval','Function','createRequire','Worker','fork','spawn','spawnSync','exec','execSync','execFile','execFileSync'].includes(word))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
      if(t[i].string!==undefined&&t[i-1]?.word==='['&&t[i+1]?.word===']')ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
      if(['readFile','readFileSync','open','openSync','readdir','readdirSync','stat','statSync','lstat','lstatSync','access','accessSync'].includes(word)&&t[i+1]?.word==='as')ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
      if(['readFile','readFileSync','open','openSync','readdir','readdirSync','stat','statSync','lstat','lstatSync','access','accessSync'].includes(word)&&t[i-1]?.word==='.'&&t[i+1]?.word!=='(')ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
      if(['readFile','readFileSync','open','openSync','readdir','readdirSync','stat','statSync','lstat','lstatSync','access','accessSync'].includes(word)&&t[i+1]?.word==='('){
        const literal=t[i+2]?.string;if(literal===undefined)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
        if(!literal.startsWith('./')&&!literal.startsWith('../'))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');dependencies.push(literal);}
      if(word==='import'&&t[i+1]?.word==='.'){continue;}
      if(word==='import'||word==='require'){
        if(t[i+1]?.word==='('){if(t[i+2]?.string===undefined||t[i+3]?.word!==')')ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');dependencies.push(t[i+2].string);}
        else if(t[i+1]?.string!==undefined)dependencies.push(t[i+1].string);
        else{let found=false;for(let j=i+1;j<t.length&&j<i+80&&t[j].word!==';';j++){if(t[j].word==='from'&&t[j+1]?.string!==undefined){dependencies.push(t[j+1].string);found=true;break;}}
          if(!found)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');}
      }else if(word==='export'){for(let j=i+1;j<t.length&&j<i+80&&t[j].word!==';';j++){if(t[j].word==='from'&&t[j+1]?.string!==undefined){dependencies.push(t[j+1].string);break;}}}
      if(word==='URL'&&t[i-1]?.word==='new'){if(t[i+1]?.word!=='('||t[i+2]?.string===undefined)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');dependencies.push(t[i+2].string);}
    }
    for(const dependency of dependencies){if(dependency.startsWith('node:')){if(['node:vm','node:module','node:http','node:https','node:net','node:tls','node:dns'].includes(dependency))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');continue;}if(!dependency.startsWith('./')&&!dependency.startsWith('../'))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
      const target=resolve(dirname(path),dependency);pathInside(repository.primaryRoot,target);todo.push(target);}
  }
  return ownedVerificationFreeze([...seen.values()].sort((a,b)=>a.path.localeCompare(b.path)));
}
// Fixed Source directory metadata is not a module import. Exact Source/consumer pins
// authenticate this bounded origin contract; actual imports still require physical files.
const OWNED_SOURCE_DIRECTORY_ORIGINS=Object.freeze({"plugins/pipeline-core/lib/project-onboarding-v3.mjs":{"producer":"plugins/pipeline-core/lib/project-onboarding-v3.mjs","sha256":"d90075fcfc855a9c8458b4052aa6df0cd0bcb7226c3dcec194032a0968f32e14","consumers":{"plugins/pipeline-core/scripts/settings-allowlist-merge.mjs":"773da4ba5bb0f790812f238def024c603021837aa89767f3ec4584b887aba4fc"},"origins":{"..":{"targets":["../scripts/project-onboarding-v3.mjs"]},"../scripts/":{"targets":[]}}},"plugins/pipeline-core/scripts/pre-push-hook-install.mjs":{"producer":"plugins/pipeline-core/scripts/pre-push-hook-install.mjs","sha256":"952d25835426316bd0791d885b728f1c9de0d9884a94d139e78170218db842ac","consumers":{},"origins":{"..":{"targets":["../lib/manifest.mjs","../lib/verify-evidence-path.mjs","../lib/security-completeness-gate.mjs","../lib/push-destination-policy.mjs","../lib/checkpoint-push-audit.mjs","../lib/project-authority.mjs","../lib/checkpoint-push-approval.mjs","../lib/critical-human-proof-policy.mjs"]}},"evidence":"Exact preserved DYNAMIC_IMPORT_EDGES and immutable generator bytes; no generated import skipped"},"plugins/pipeline-core/scripts/pre-commit-hook-install.mjs":{"producer":"plugins/pipeline-core/scripts/pre-commit-hook-install.mjs","sha256":"71b16efa02b9c17c94fa6fd0b3f188f92abc930b42ffd2ee45a1236d2f55e270","consumers":{},"origins":{"..":{"targets":["./check-private-identifiers.mjs","../hooks/guard-gate-strength.mjs","../lib/protected-test-paths.mjs","./check-protected-path-integrity.mjs","../lib/signed-quality-package.mjs","../lib/handover-rotation.mjs","../lib/guard-maintenance-window.mjs","../lib/plan-spec-state-v2.mjs","./pipeline-state.mjs","../lib/staged-observation-doc-classification.mjs","../lib/calibration-verify-commit-transition.mjs"]}},"evidence":"Exact preserved DYNAMIC_IMPORT_EDGES and immutable generator bytes; no generated import skipped"},"plugins/pipeline-core/scripts/commit-msg-hook-install.mjs":{"producer":"plugins/pipeline-core/scripts/commit-msg-hook-install.mjs","sha256":"f9b9d285d4ca23cf44c6c4a80c58d3cd81943038d63c2374552314258b4fa054","consumers":{},"origins":{"..":{"targets":["../lib/commit-message-policy.mjs","../lib/signed-quality-package.mjs","../lib/project-authority.mjs","../lib/guard-devplan-policy.mjs","../lib/administrative-commit-policy.mjs"]}},"evidence":"Exact preserved DYNAMIC_IMPORT_EDGES and immutable generator bytes; no generated import skipped"},"plugins/pipeline-core/lib/consumer-verify.mjs":{"producer":"plugins/pipeline-core/lib/consumer-verify.mjs","sha256":"e11a60d64712a7c6b5e052c58510f297d791f30c1d1bdeedbf8107ba17d07b85","consumers":{},"origins":{"../":{"targets":["../scripts/consumer-verify-check.mjs"]}},"evidence":"Package-root policy hashing is directory data; real adapter dispatcher is independently fixed at Source line12"},"plugins/pipeline-core/hooks/guard-dispatch-budget.mjs":{"producer":"plugins/pipeline-core/hooks/guard-dispatch-budget.mjs","sha256":"8286ec55f906d52ffcf22e85651dc9414fcbcd2cd2b5610dba4f452333eb9f59","consumers":{},"origins":{"..":{"targets":["../scripts/goldfish-commit-command-flow.mjs","../scripts/dispatch-record-write.mjs"]}},"evidence":"Exact named script constants and literal joins; Source root comparison remains physical and no requester port is created"},"plugins/pipeline-core/scripts/pipeline-start-preflight.mjs":{"producer":"plugins/pipeline-core/scripts/pipeline-start-preflight.mjs","sha256":"529bb481eddffdc1a18e2d893ff424c24d0f3c23fe54310eb239d5b3209991f2","consumers":{"plugins/pipeline-core/scripts/pre-push-hook-install.mjs":"952d25835426316bd0791d885b728f1c9de0d9884a94d139e78170218db842ac"},"origins":{"../lib":{"targets":["../lib/manifest.mjs","../lib/verify-evidence-path.mjs","../lib/security-completeness-gate.mjs","../lib/push-destination-policy.mjs","../lib/checkpoint-push-audit.mjs","../lib/project-authority.mjs","../lib/checkpoint-push-approval.mjs","../lib/critical-human-proof-policy.mjs"]}},"evidence":"Fixed default lib directory passed to exact pre-push Source generator; its exact eight generated module targets remain in physical closure"},"plugins/pipeline-core/scripts/model-role-bootstrap.mjs":{"producer":"plugins/pipeline-core/scripts/model-role-bootstrap.mjs","sha256":"24071a97c9d31107b20caed8f8dd37db4eb572d4b3a7e393c144f316d8609607","consumers":{"plugins/pipeline-core/scripts/pipeline-start-preflight.mjs":"529bb481eddffdc1a18e2d893ff424c24d0f3c23fe54310eb239d5b3209991f2"},"origins":{"..":{"targets":[]}},"evidence":"Source default package root consumed by exact manifest-version observation only; no module/program load from this origin"},"plugins/pipeline-core/lib/dispatch-budget-binding.mjs":{"producer":"plugins/pipeline-core/lib/dispatch-budget-binding.mjs","sha256":"4eed0fb986c953fac948ffb64d62c502b6c9753eb7f9c36f6788f0b2df4f74c3","consumers":{},"origins":{"..":{"targets":[]}},"evidence":"Default Source directory only locates agent frontmatter data .md; this module has no importer/program load from the origin"},"plugins/pipeline-core/lib/doc-reader-documentation-snapshot.mjs":{"producer":"plugins/pipeline-core/lib/doc-reader-documentation-snapshot.mjs","sha256":"6611ea5d88b09a2acf394c5539d3d3191c8b85565df31dea17e61c7acd53225a","consumers":{"plugins/pipeline-core/lib/doc-reader-default-observers.mjs":"346dc5faa9072b5b2cb67270cb7d01f582a27084556a4a5c690421dab01a3264"},"origins":{"..":{"targets":["../reader-inputs/manifest.json","../reader-inputs/product-capability-inventory.json","../reader-inputs/observation-doc-governance.json","../reader-inputs/reader-review-protocol.md","../skills/reader-review/SKILL.md"],"targetSha256":{"../reader-inputs/manifest.json":"1039fe3be4dc6351d3c5a9f6b07ade1f1852432e8d11d66ef1c0cdef4165ab78","../reader-inputs/product-capability-inventory.json":"c4b97e145f008c989f29dc85d1cd508c25861282cc385e0843a98679fc5ce417","../reader-inputs/observation-doc-governance.json":"23bec3bf912551449c6b7e8282e6aa977b90566352cc655a678a331d4f5d7e73","../reader-inputs/reader-review-protocol.md":"3e1217a3ab7994a2fa9ac2986e61a803f1a3fbeba21f6c25f41bd7ad1a6057d0","../skills/reader-review/SKILL.md":"314e137abe661db2d7ac09f8552daff01aba4c9d7fc7343f8274362e3e48aa6f"}}},"evidence":"Exact immutable reader manifest/inputPaths and skill resources; directory data only, no module load or arbitrary path dictionary"}});
function ownedSourceUrlDependencies(repository,path,image,literal){
  const sourcePath=relative(repository.primaryRoot,path).split(sep).join("/");
  const contract=OWNED_SOURCE_DIRECTORY_ORIGINS[sourcePath],origin=contract?.origins[literal];
  if(!origin){
    if(!literal.startsWith("./")&&!literal.startsWith("../")&&literal!=="."&&literal!=="..")return [literal];
    pathInside(repository.primaryRoot,resolve(dirname(path),literal));
    let st;try{st=lstatSync(resolve(dirname(path),literal));}catch(error){if(error.code==="ENOENT")return [literal];throw error;}
    if(!st.isDirectory())return [literal];
  }
  if(!origin||createHash("sha256").update(image.bytes).digest("hex")!==contract.sha256)ownedVerificationFail("OSV-ASSOCIATION-UNAVAILABLE");
  for(const [consumerPath,expected] of Object.entries(contract.consumers)){
    const consumer=readOwnedVerificationPhysicalFile(resolve(repository.primaryRoot,consumerPath),{root:repository.primaryRoot});
    if(createHash("sha256").update(consumer.bytes).digest("hex")!==expected)ownedVerificationFail("OSV-ASSOCIATION-UNAVAILABLE");
  }
  const directory=resolve(dirname(path),literal);pathInside(repository.primaryRoot,directory);
  const st=lstatSync(directory);if(!st.isDirectory()||st.isSymbolicLink()||realpathSync(directory)!==directory)ownedVerificationFail("OSV-INPUT-DRIFT");
  for(const target of origin.targets){const file=resolve(dirname(path),target);pathInside(repository.primaryRoot,file);const image=readOwnedVerificationPhysicalFile(file,{root:repository.primaryRoot});if(origin.targetSha256&&createHash("sha256").update(image.bytes).digest("hex")!==origin.targetSha256[target])ownedVerificationFail("OSV-INPUT-DRIFT");}
  return origin.targets;
}
// Conservative physical closure only for this already enumerated exact Source site.
// This does not execute an import or grant a controller/runtime permission.
const OWNED_SOURCE_KNOWN_IMPORTS=Object.freeze({"plugins/pipeline-core/scripts/toolchain-preflight.mjs":{"importer":"plugins/pipeline-core/scripts/toolchain-preflight.mjs","sha256":"071fb27e1237d5f4022bd55bb262c09b01f6b7df322542180f4e89d644f27ed4","words":["HOOK_INSTALLERS","[","id","]"],"alternatives":["./pre-push-hook-install.mjs","./pre-commit-hook-install.mjs","./commit-msg-hook-install.mjs"],"declarationPath":"plugins/pipeline-core/lib/guard-maintenance-window-kernel-closure.test.mjs","declarationSha256":"e810c16d6c82f072ad45f5594e28d54a0fae0aa9e7e9351f5ff5eadb71cf7f55","normalizedDeclarationSha256":"b1c0e84808c18356624d628960b26ebdbf3fa842d6da8ed0e60b3baef82b070c","candidatePinFields":["plugins/pipeline-core/lib/owned-continuity-verification.mjs","plugins/pipeline-core/scripts/owning-verification-controller-controls.mjs"],"initializerSha256":"c2a826ac125687aedb1e3a7cdc7c5c270a98bf4c33b535b04be0042683bdbe69","map":{"pre-push-hook":"./pre-push-hook-install.mjs","pre-commit-hook":"./pre-commit-hook-install.mjs","commit-msg-hook":"./commit-msg-hook-install.mjs"},"ids":["pre-push-hook","pre-commit-hook","commit-msg-hook"]}});
// Exact Source literal node:url conversions preserve module identity; no runtime permission.
const OWNED_SOURCE_LITERAL_WRAPPERS=Object.freeze({"plugins/pipeline-core/lib/doc-reader-default-observers.mjs":{"importer":"plugins/pipeline-core/lib/doc-reader-default-observers.mjs","sha256":"346dc5faa9072b5b2cb67270cb7d01f582a27084556a4a5c690421dab01a3264","binding":"import {pathToFileURL,fileURLToPath} from 'node:url';","bindingSha256":"75d69fd894a82a56b49f2cf407b006820a79d2533f68c63923ff36286e31346c","lexeme":"import(pathToFileURL(fileURLToPath(new URL('../../../harness/scripts/check-doc-reader-binding.mjs',import.meta.url))))","arguments":["pathToFileURL","(","fileURLToPath","(","new","URL","(",{"string":"../../../harness/scripts/check-doc-reader-binding.mjs"},",","import",".","meta",".","url",")",")",")"],"target":"../../../harness/scripts/check-doc-reader-binding.mjs","targetSha256":"9108b0f70264a8e00f0495f9adce95dfe191ee19e7423589f651fb832c084a0b","targetCanonicalPath":"harness/scripts/check-doc-reader-binding.mjs"}});
function ownedSourceLiteralImportDependencies(repository,path,image,t,index){
  const sourcePath=relative(repository.primaryRoot,path).split(sep).join("/"),contract=OWNED_SOURCE_LITERAL_WRAPPERS[sourcePath];
  if(!contract)return null;
  if(createHash("sha256").update(image.bytes).digest("hex")!==contract.sha256)ownedVerificationFail("OSV-ASSOCIATION-UNAVAILABLE");
  if(!contract.arguments.every((expected,offset)=>typeof expected==="string"?t[index+2+offset]?.word===expected:t[index+2+offset]?.string===expected.string)||t[index+2+contract.arguments.length]?.word!==")")ownedVerificationFail("OSV-ASSOCIATION-UNAVAILABLE");
  const target=resolve(dirname(path),contract.target);pathInside(repository.primaryRoot,target);
  const file=readOwnedVerificationPhysicalFile(target,{root:repository.primaryRoot});
  if(createHash("sha256").update(file.bytes).digest("hex")!==contract.targetSha256)ownedVerificationFail("OSV-INPUT-DRIFT");
  return [contract.target];
}
function ownedSourceKnownImportDependencies(repository,path,image,t,index,declarations){
  const sourcePath=relative(repository.primaryRoot,path).split(sep).join("/"),contract=OWNED_SOURCE_KNOWN_IMPORTS[sourcePath];
  if(!contract||createHash("sha256").update(image.bytes).digest("hex")!==contract.sha256)ownedVerificationFail("OSV-ASSOCIATION-UNAVAILABLE");
  if(!contract.words.every((word,offset)=>t[index+2+offset]?.word===word)||t[index+2+contract.words.length]?.word!==")")ownedVerificationFail("OSV-ASSOCIATION-UNAVAILABLE");
  const declaration=readOwnedVerificationPhysicalFile(resolve(repository.primaryRoot,contract.declarationPath),{root:repository.primaryRoot});
  let normalized=declaration.bytes.toString("utf8");
  for(const field of contract.candidatePinFields){const prefix=JSON.stringify(field)+':"',index=normalized.indexOf(prefix);
    if(index<0||normalized.indexOf(prefix,index+prefix.length)>=0)ownedVerificationFail("OSV-ASSOCIATION-UNAVAILABLE");
    const start=index+prefix.length,value=normalized.slice(start,start+64);
    const physical=readOwnedVerificationPhysicalFile(resolve(repository.primaryRoot,field),{root:repository.primaryRoot});
    if(!/^[a-f0-9]{64}$/.test(value)||normalized[start+64]!=='"'||createHash("sha256").update(physical.bytes).digest("hex")!==value)ownedVerificationFail("OSV-ASSOCIATION-UNAVAILABLE");
    normalized=normalized.slice(0,start)+"0".repeat(64)+normalized.slice(start+64);
  }
  if(createHash("sha256").update(normalized).digest("hex")!==contract.normalizedDeclarationSha256)ownedVerificationFail("OSV-ASSOCIATION-UNAVAILABLE");
  const match=/const DYNAMIC_IMPORT_EDGES = (\{[\s\S]*?\n\});/.exec(declaration.bytes.toString("utf8"));
  if(!match||createHash("sha256").update(match[0]).digest("hex")!==contract.declarationSha256)ownedVerificationFail("OSV-ASSOCIATION-UNAVAILABLE");
  const previous=declarations.get(declaration.ref.path);if(previous&&ownedVerificationDigest(previous)!==ownedVerificationDigest(declaration.ref))ownedVerificationFail("OSV-INPUT-DRIFT");
  declarations.set(declaration.ref.path,declaration.ref);
  for(const target of contract.alternatives){if(!target.startsWith("./")&&!target.startsWith("../"))ownedVerificationFail("OSV-ASSOCIATION-UNAVAILABLE");
    const file=resolve(dirname(path),target);pathInside(repository.primaryRoot,file);readOwnedVerificationPhysicalFile(file,{root:repository.primaryRoot});}
  return contract.alternatives;
}
export function collectOwnedVerificationSourceModules(repository,entryFiles){
  const todo=[...entryFiles],seen=new Map(),declarations=new Map();let total=0;
  // Infrastructure owns its original private input readers; the fresh all12/source
  // inspections continue to validate those inputs. This table seals every literal
  // imported program/data module, rather than just claiming the nine entrypoints.
  while(todo.length){const path=todo.shift();if(seen.has(path))continue;if(seen.size>=2048)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
    const image=readOwnedVerificationPhysicalFile(path,{root:repository.primaryRoot});if((total+=image.ref.size)>64*1024*1024)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');seen.set(path,image.ref);
    if(!/\.(?:mjs|cjs|js)$/.test(path))continue;const t=tokens(image.bytes.toString('utf8')),dependencies=[];
    for(let i=0;i<t.length;i++){
      if(t[i].word==='import'&&t[i+1]?.word!=='.'){
        if(t[i+1]?.word==='('){if(t[i+2]?.string!==undefined&&t[i+3]?.word===')')dependencies.push(t[i+2].string);else dependencies.push(...(ownedSourceLiteralImportDependencies(repository,path,image,t,i)??ownedSourceKnownImportDependencies(repository,path,image,t,i,declarations)));}
        else if(t[i+1]?.string!==undefined)dependencies.push(t[i+1].string);
        else{let found=false;for(let j=i+1;j<t.length&&j<i+80&&t[j].word!==';';j++)if(t[j].word==='from'&&t[j+1]?.string!==undefined){dependencies.push(t[j+1].string);found=true;break;}
          if(!found)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');}
      }else if(t[i].word==='export'){for(let j=i+1;j<t.length&&j<i+80&&t[j].word!==';';j++)if(t[j].word==='from'&&t[j+1]?.string!==undefined){dependencies.push(t[j+1].string);break;}}
      else if(t[i].word==='URL'&&t[i-1]?.word==='new'&&t[i+2]?.string!==undefined)dependencies.push(...ownedSourceUrlDependencies(repository,path,image,t[i+2].string));
    }
    for(const dependency of dependencies){if(dependency.startsWith('node:'))continue;if(!dependency.startsWith('./')&&!dependency.startsWith('../'))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
      const target=resolve(dirname(path),dependency);pathInside(repository.primaryRoot,target);todo.push(target);}
  }
  for(const ref of declarations.values()){const previous=seen.get(ref.path);if(previous&&ownedVerificationDigest(previous)!==ownedVerificationDigest(ref))ownedVerificationFail("OSV-INPUT-DRIFT");seen.set(ref.path,ref);}
  return ownedVerificationFreeze([...seen.values()].sort((a,b)=>a.path.localeCompare(b.path)));
}
function authorFile(root,path,bytes){
  if(process.platform==='win32'){
    pathInside(root,path);if(bytes.length>1048576)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
    let cursor=root;
    for(const part of relative(root,dirname(path)).split(sep).filter(Boolean)){
      cursor=join(cursor,part);let named;
      try{named=lstatSync(cursor);}catch(error){if(error.code!=='ENOENT')throw error;createWindowsOwnedAuthorityDirectory({path:cursor});named=lstatSync(cursor);}
      if(!named.isDirectory()||named.isSymbolicLink())ownedVerificationFail('OSV-INPUT-DRIFT');
      observeWindowsAuthorityAncestor({path:cursor});
    }
    const publication=createWindowsOwnedAuthorityExclusiveFile({path,bytes});
    const image=readOwnedVerificationPhysicalFile(path,{root});
    if(!image.bytes.equals(bytes)||image.ref.identity.nativeFacts!==publication.nativeFacts
      ||image.ref.identity.nativeFactsSha256!==publication.nativeFactsSha256
      ||image.ref.identity.helperSha256!==publication.helperSha256)ownedVerificationFail('OSV-INPUT-DRIFT');
    return image.ref;
  }
  pathInside(root,path);let cursor=root;
  for(const part of relative(root,dirname(path)).split(sep).filter(Boolean)){cursor=join(cursor,part);try{mkdirSync(cursor,{mode:0o755});}catch(e){if(e.code!=='EEXIST')throw e;}
    const s=lstatSync(cursor);if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(cursor)!==cursor)ownedVerificationFail('OSV-INPUT-DRIFT');}
  let fd;try{fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o644);let offset=0;
    while(offset<bytes.length){const n=writeSync(fd,bytes,offset,bytes.length-offset);if(n<=0)ownedVerificationFail('OSV-INPUT-DRIFT');offset+=n;}fsyncSync(fd);
  }finally{if(fd!==undefined)closeSync(fd);}const d=openSync(dirname(path),constants.O_RDONLY);try{fsyncSync(d);}finally{closeSync(d);}
  const image=readOwnedVerificationPhysicalFile(path,{root});if(!image.bytes.equals(bytes))ownedVerificationFail('OSV-INPUT-DRIFT');return image.ref;
}
export function createSourceOwnedContinuityVerificationController(input){
  if(!ownedVerificationExact(input,['runtimePort']))ownedVerificationFail('OSV-OWNER-UNAVAILABLE');
  const {runtimePort}=input,owner=acquireSourceOwnedContinuityVerificationOwner({runtimePort});
  if(owner.status!=='acquired')ownedVerificationFail(owner.code);
  const handle=Object.freeze({}),record={ownerHandle:owner.ownerHandle,runtimePort};controllers.set(handle,record);
  return Object.freeze({
    authorOwnedTaskVerificationSuite(request){
      if(!ownedVerificationExact(request,['suiteId','files'])||typeof request.suiteId!=='string'||!Array.isArray(request.files)||request.files.length<1||request.files.length>MAX_FILES)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
      const current=inspectSourceOwnedContinuityVerificationOwner(record);if(current.status!=='current')ownedVerificationFail(current.code);
      const registered=readOwnedVerificationRegistration(current.repository,request.suiteId),paths=new Set(),images=[];let total=0;
      // Validate every absent target before the first effect. There is no existing-file adoption.
      for(const file of request.files){if(!ownedVerificationExact(file,['path','source'])||typeof file.path!=='string'||typeof file.source!=='string')ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
        const path=resolve(current.repository.primaryRoot,file.path);pathInside(current.repository.primaryRoot,path);
        if(!relative(current.repository.primaryRoot,path).split(sep).every(p=>p&&p!=='.'&&p!=='..')||paths.has(path))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
        if(!path.startsWith(join(current.repository.primaryRoot,'scratch')+sep)&&path!==registered.selectedSuite.file)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
        try{lstatSync(path);ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');}catch(e){if(e.code!=='ENOENT')throw e;}
        const bytes=Buffer.from(file.source);if(bytes.length>(process.platform==='win32'?1048576:MAX_FILE)||(total+=bytes.length)>MAX_TOTAL)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');paths.add(path);images.push({path,bytes});}
      if(!paths.has(registered.selectedSuite.file))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
      const authored=[];for(const image of images)authored.push(authorFile(current.repository.primaryRoot,image.path,image.bytes));
      const after=inspectSourceOwnedContinuityVerificationOwner(record);if(after.status!=='current'||!equal(current.course,after.course))ownedVerificationFail('OSV-INPUT-DRIFT');
      const taskPreparationHandle=Object.freeze({});preparations.set(taskPreparationHandle,{...record,controllerHandle:handle,
        course:current.course,registered,authored,nonce:randomBytes(32).toString('hex'),state:'authored'});
      return Object.freeze({status:'authored',taskPreparationHandle});
    },
    registerControlledMethodTaskVerificationSuite(request){
      if(!ownedVerificationExact(request,['preparationHandle','criticPacketId']))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
      const current=inspectSourceOwnedContinuityVerificationOwner(record);if(current.status!=='current')ownedVerificationFail(current.code);
      const controlledMethod={...record,preparationHandle:request.preparationHandle,criticPacketId:request.criticPacketId};
      const event=inspectSourceOwnedControlledMethodVerificationPreparation(controlledMethod);
      const taskPreparationHandle=Object.freeze({});preparations.set(taskPreparationHandle,{...record,controllerHandle:handle,
        course:current.course,registered:event.registered,kind:'controlled-method',controlledMethod,controlledMethodEvent:event,
        nonce:randomBytes(32).toString('hex'),state:'authored'});return Object.freeze({status:'authored',taskPreparationHandle});
    },
    completeOwnedTaskVerificationRegistration({taskPreparationHandle}){const entry=preparations.get(taskPreparationHandle);
      if(!entry||entry.controllerHandle!==handle||entry.state!=='authored')ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
      const result=registerSourceOwnedCourseVerificationAssociation({...record,taskPreparationHandle});entry.state='registered';return result;},
    acquireVerificationPort(){const current=inspectSourceOwnedContinuityVerificationOwner(record);if(current.status!=='current')ownedVerificationFail(current.code);
      return createSourceOwnedContinuityVerificationPort(current.issuer,runtimePort);}
  });
}
// Inspection grants nothing: only the original authoring map row is accepted by I03.
export function inspectSourceOwnedTaskVerificationPreparation({taskPreparationHandle,ownerHandle,runtimePort}){
  const entry=preparations.get(taskPreparationHandle);if(!entry||entry.ownerHandle!==ownerHandle||entry.runtimePort!==runtimePort
    ||entry.state!=='authored'||!controllers.has(entry.controllerHandle))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
  const current=inspectSourceOwnedContinuityVerificationOwner({ownerHandle,runtimePort});if(current.status!=='current'||!equal(current.course,entry.course))ownedVerificationFail('OSV-INPUT-DRIFT');
  if(entry.kind==='controlled-method'){
    const event=inspectSourceOwnedControlledMethodVerificationPreparation(entry.controlledMethod);
    if(!equal(event,entry.controlledMethodEvent)||!equal(event.course,current.course))ownedVerificationFail('OSV-INPUT-DRIFT');
    const closure=[event.suiteRef,...event.sourceModules.sourceClosure],unique=new Map(closure.map(ref=>[ref.path,ref]));
    const candidateBlobs=[{path:event.suiteRef.path,blobOid:blob(current.repository,event.registered.candidate,event.suiteRef.path,true)},
      ...event.refs.map(ref=>({path:resolve(current.repository.primaryRoot,ref.path),blobOid:blob(current.repository,event.registered.candidate,resolve(current.repository.primaryRoot,ref.path),true)}))];
    return ownedVerificationFreeze({course:event.course,registered:event.registered,closure:[...unique.values()],candidateBlobs,
      controlledMethod:entry.controlledMethod,controlledMethodEvent:event,
      taskRegistrationSha256:ownedVerificationDigest({course:event.course,registration:event.registered,sourceEvent:event,nonce:entry.nonce})});
  }
  recheckOwnedVerificationPhysicalRefs(entry.authored);
  const registered=readOwnedVerificationRegistration(current.repository,entry.registered.selectedSuite.name);
  // Normal task authoring may be committed before completion. Observe that actual
  // candidate here; never commit/stage, accept a supplied candidate, or change registration.
  if(!equal(registered.registration,entry.registered.registration)||!equal(registered.selectedSuite,entry.registered.selectedSuite))ownedVerificationFail('OSV-INPUT-DRIFT');
  const closure=collectOwnedVerificationClosure(current.repository,[registered.selectedSuite.file]);
  for(const ref of entry.authored)if(!closure.some(item=>equal(item,ref)))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
  const candidateBlobs=closure.map(ref=>({path:ref.path,blobOid:blob(current.repository,registered.candidate,ref.path)}));
  return ownedVerificationFreeze({course:current.course,registered,closure,candidateBlobs,
    taskRegistrationSha256:ownedVerificationDigest({course:current.course,registration:registered,authored:entry.authored,closure,candidateBlobs,nonce:entry.nonce})});
}
export function ownedVerificationModulePath(){return fileURLToPath(import.meta.url);}
