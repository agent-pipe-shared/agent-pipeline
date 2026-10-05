// SPDX-License-Identifier: SUL-1.0
// Source target: plugins/pipeline-core/lib/git-hook-runtime-snapshot.mjs
import {closeSync,fsyncSync,lstatSync,mkdirSync,openSync,readdirSync,renameSync,rmdirSync,unlinkSync,writeFileSync,writeSync} from 'node:fs';
import {basename,dirname,join,relative,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {footprintFail,footprintFingerprint,footprintIdentity,footprintSha256,physicalFootprintPath,readPhysicalFootprint} from './git-hook-footprint.mjs';
import {assessWindowsPrivatePaths,hardenWindowsPrivateDirectory} from './windows-private-state.mjs';
const PUBLIC_DIRS=['lib','hooks','scripts','config','schemas'];
// Exact shipped root data required by the copied protected-baseline loader.
const PUBLIC_ROOT_FILES=Object.freeze(['protected-baseline.json']);
const SCHEMA='pipeline.git-hook-runtime-snapshot.v1';
const DEFAULT_INSTALL_BUDGET_MS=80000;
function publicPath(path){return typeof path==='string'&&!path.includes('\\')&&!path.split('/').some(s=>!s||s==='.'||s==='..'||s.startsWith('.'))&&(PUBLIC_ROOT_FILES.includes(path)||PUBLIC_DIRS.includes(path.split('/')[0]))&&/\.(?:mjs|js|json|yaml|yml|toml)$/.test(path)&&!/(?:\.test\.|\.fixture\.)/.test(path);}
// The root is vetted once with the full ancestor walk; every entry below it keeps its own lstat (symlink / junction /
// non-directory parent refused) but no longer re-walks and re-resolves the already-vetted ancestors per entry.
function enumerate(root){physicalFootprintPath(root,{directory:true});const names=[];for(const path of PUBLIC_ROOT_FILES){const entry=physicalFootprintPath(join(root,path),{missing:true,within:root});if(!entry)footprintFail('GHS-BASELINE-MISSING');if(!entry.isFile())footprintFail('PU-FILE');names.push(path);}for(const dir of PUBLIC_DIRS){const base=join(root,dir);if(!physicalFootprintPath(base,{missing:true,directory:true,within:root}))continue;const walk=path=>{for(const entry of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const target=join(path,entry.name);if(entry.isSymbolicLink())footprintFail('PU-ALIAS');if(entry.isDirectory()){if(!entry.name.startsWith('.'))walk(target);}else if(publicPath(relative(root,target).split('\\').join('/')))names.push(relative(root,target).split('\\').join('/'));if(names.length>4096)footprintFail('GHS-COUNT');}};walk(base);}return names.sort();}
function readInventory(root){const rootIdentity=footprintIdentity(physicalFootprintPath(root,{directory:true})),budget={used:0,max:67108864},paths=enumerate(root),items=paths.map(path=>{const read=readPhysicalFootprint(join(root,path),{max:4194304,budget,within:root});if(!read)footprintFail('GHS-MISSING');return {path,sha256:read.sha256,bytes:read.bytes,identity:read.identity};});if(JSON.stringify(paths)!==JSON.stringify(enumerate(root))||JSON.stringify(rootIdentity)!==JSON.stringify(footprintIdentity(physicalFootprintPath(root,{directory:true}))))footprintFail('GHS-DRIFT');return {rootIdentity,items};}
const publicItems=value=>value.items.map(({path,sha256})=>({path,sha256}));
function sourceRootOf(pluginLibDir){const sourceRoot=resolve(pluginLibDir,'..');physicalFootprintPath(sourceRoot,{directory:true});return sourceRoot;}
// The SOURCE tree is never trusted by stat fingerprint: every pass reads every file's bytes and hashes them in full, so a
// same-size, same-mtime edit between (or during) two passes still changes a digest and is refused as GHS-SOURCE-DRIFT.
// Two passes are equal only when they agree on every public path, content hash, root identity and per-file identity.
function assertSameSourceInventory(first,second){if(JSON.stringify(publicItems(first))!==JSON.stringify(publicItems(second))||JSON.stringify(first.rootIdentity)!==JSON.stringify(second.rootIdentity)||first.items.some((r,i)=>JSON.stringify(r.identity)!==JSON.stringify(second.items[i]?.identity)))footprintFail('GHS-SOURCE-DRIFT');}
function describeSourceInventory(first){const inventory=publicItems(first);if(!inventory.some(x=>x.path==='lib/governance-scope.mjs'))footprintFail('GHS-SCOPE-MISSING');const manifest={schema:SCHEMA,inventory},manifestBytes=JSON.stringify(manifest)+'\n';return {manifestBytes,manifestSha256:footprintSha256(manifestBytes)};}
// ONE full pass: the publish inventory. The publish re-reads the whole tree once more after the copy (assertSourceUnchanged).
function captureSourceInventory(pluginLibDir){const sourceRoot=sourceRootOf(pluginLibDir),first=readInventory(sourceRoot);return {sourceRoot,first,...describeSourceInventory(first)};}
// Stand-alone inspection (the pre-push installer compares its digest): two full passes that must agree.
export function inspectGitHookSourceSnapshot({pluginLibDir}){
 const sourceRoot=sourceRootOf(pluginLibDir),first=readInventory(sourceRoot),second=readInventory(sourceRoot);assertSameSourceInventory(first,second);
 return {sourceRoot,first,...describeSourceInventory(first)};
}
export function publishGitHookRuntimeSnapshot({pluginLibDir,stateDir,timeBudgetMs=DEFAULT_INSTALL_BUDGET_MS,onProgress}={}){
 if(!Number.isFinite(timeBudgetMs)||timeBudgetMs<=0||timeBudgetMs>80000)footprintFail('GHS-TIME-BUDGET');const state=resolve(stateDir),deadline=Date.now()+timeBudgetMs;physicalFootprintPath(state,{directory:true});const captured=captureSourceInventory(pluginLibDir),{first,manifestBytes,manifestSha256:digest}=captured,destination=join(state,'runtime-'+digest),temporary=join(state,'runtime-tmp-'+randomBytes(8).toString('hex'));
 cleanupOwnedStaleRuntimeTemps(state,onProgress,deadline);
 ensureBudget(deadline);
 if(physicalFootprintPath(destination,{missing:true})){verifyGitHookRuntimeSnapshot({snapshotRoot:destination,manifestSha256:digest,deadline,onProgress});assertSourceUnchanged(pluginLibDir,captured,deadline);ensureBudget(deadline);emitProgress(onProgress,'complete',1,1);return {root:destination,manifestSha256:digest,inventorySha256:digest,deadline};}
 let owner=null;mkdirSync(temporary,{mode:0o700});try{if(process.platform==='win32'&&hardenWindowsPrivateDirectory(temporary).status!=='secure')footprintFail('GHS-MODE');const directories=new Set([temporary]);owner=createRuntimeTempOwner(temporary,digest,first.items);writeRuntimeTempOwner(temporary,owner);for(let index=0;index<first.items.length;index++){ensureBudget(deadline);const item=first.items[index],target=join(temporary,item.path);if(!directories.has(dirname(target))){mkdirSync(dirname(target),{recursive:true,mode:0o700});directories.add(dirname(target));}writeSyncedFile(target,item.bytes);if((index+1)%128===0||index+1===first.items.length)emitProgress(onProgress,'copy',index+1,first.items.length);}writeFileSync(join(temporary,'snapshot.json'),manifestBytes,{flag:'wx',mode:0o600});syncFile(join(temporary,'snapshot.json'));verifyGitHookRuntimeSnapshot({snapshotRoot:temporary,manifestSha256:digest,deadline,onProgress});ensureBudget(deadline);for(const path of [...directories].sort((a,b)=>b.length-a.length))syncDirectory(path);assertSourceUnchanged(pluginLibDir,captured,deadline);ensureBudget(deadline);removeRuntimeTempOwner(temporary,owner);renameSync(temporary,destination);adoptVerifiedSnapshot(temporary,destination,digest);syncDirectory(state);ensureBudget(deadline);emitProgress(onProgress,'complete',1,1);return {root:destination,manifestSha256:digest,inventorySha256:digest,deadline};}catch(e){if(owner)try{removeOwnedRuntimeTemp({state,temporary,owner,allowLiveOwner:true});}catch{}throw e;}
}
// In-process verified-snapshot memo. It carries ONE fact across calls: the native win32 DACL of an entry was read and was
// private while the entry had the recorded stat fingerprint (dev/ino/size/mtime/ctime; NTFS bumps ctime on a DACL change).
// An entry whose fingerprint still matches skips only that DACL read. Everything else is repeated on EVERY call, hit or
// miss: every file is read and hashed in full against the manifest (a stat fingerprint is never trusted for content, so
// there is no "racily clean" special case), the manifest is re-read, the directory enumeration is compared with the
// manifest, and every path is lstat-vetted below the root. A failed verification drops the memo; a fresh process starts
// empty. The SOURCE tree has no memo at all (see assertSourceUnchanged).
const VERIFIED=new Map(),MAX_VERIFIED=16;
function adoptVerifiedSnapshot(from,to,digest){const fromKey=resolve(from)+'\n'+digest,memo=VERIFIED.get(fromKey);VERIFIED.delete(fromKey);if(!memo)return;try{memo.rootFp=footprintFingerprint(physicalFootprintPath(resolve(to),{directory:true}));VERIFIED.set(resolve(to)+'\n'+digest,memo);}catch{/* a root that cannot be re-fingerprinted is simply not remembered */}}
function snapshotDirectoryRows(root,paths){const dirs=new Set();for(const p of paths){let d=p.lastIndexOf('/')>0?p.slice(0,p.lastIndexOf('/')):'';while(d&&!dirs.has(d)){dirs.add(d);d=d.lastIndexOf('/')>0?d.slice(0,d.lastIndexOf('/')):'';}}return [...dirs].sort().map(d=>{const st=physicalFootprintPath(join(root,d),{missing:true,directory:true,within:root});if(!st)footprintFail('GHS-CONTENT');return [d,footprintFingerprint(st)];});}
export function verifyGitHookRuntimeSnapshot(options={}){
 const {snapshotRoot,manifestSha256}=options,deadline=options.deadline??Date.now()+DEFAULT_INSTALL_BUDGET_MS,root=resolve(snapshotRoot),key=root+'\n'+manifestSha256,memo=VERIFIED.get(key)??null;
 VERIFIED.delete(key);const record={},result=verifyFullGitHookRuntimeSnapshot({...options,deadline,record,memo});
 VERIFIED.set(key,record);if(VERIFIED.size>MAX_VERIFIED)VERIFIED.delete(VERIFIED.keys().next().value);return result;
}
function verifyFullGitHookRuntimeSnapshot({snapshotRoot,manifestSha256,deadline=Date.now()+DEFAULT_INSTALL_BUDGET_MS,onProgress,record=null,memo=null}={}){
 const root=resolve(snapshotRoot);ensureBudget(deadline);const rootStat=physicalFootprintPath(root,{directory:true});if(process.platform!=='win32'&&(rootStat.mode&0o777)!==0o700)footprintFail('GHS-MODE');const raw=readPhysicalFootprint(join(root,'snapshot.json'),{max:1048576,within:root});if(!raw||raw.sha256!==manifestSha256||(process.platform!=='win32'&&raw.mode!==0o600))footprintFail('GHS-MANIFEST');const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw.bytes));if(Object.keys(manifest).sort().join('|')!=='inventory|schema'||manifest.schema!==SCHEMA||!Array.isArray(manifest.inventory)||manifest.inventory.length>4096)footprintFail('GHS-MANIFEST');const paths=manifest.inventory.map(r=>r.path);if(new Set(paths).size!==paths.length||JSON.stringify(paths)!==JSON.stringify([...paths].sort()))footprintFail('GHS-MANIFEST');const budget={used:0,max:67108864},items=[],trustedFiles=new Map(memo?.files??[]),aclTargets=[];if(!memo||footprintFingerprint(rootStat)!==memo.rootFp)aclTargets.push({path:root,code:'GHS-MODE',identity:footprintIdentity(rootStat),directory:true,within:null});if(!memo||raw.fingerprint!==memo.manifestFp)aclTargets.push({path:raw.path,code:'GHS-MANIFEST',identity:raw.identity,directory:false,within:root});if(process.platform!=='win32'){if((rootStat.mode&0o777)!==0o700||raw.mode!==0o600)footprintFail('GHS-MANIFEST');}
 for(let index=0;index<manifest.inventory.length;index++){ensureBudget(deadline);const entry=manifest.inventory[index];if(Object.keys(entry).sort().join('|')!=='path|sha256'||!publicPath(entry.path)||typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256))footprintFail('GHS-MANIFEST');const row=readPhysicalFootprint(join(root,entry.path),{max:4194304,budget,within:root});if(!row||row.sha256!==entry.sha256||(process.platform!=='win32'&&row.mode!==0o600))footprintFail('GHS-CONTENT');items.push({path:row.path,identity:row.identity,fingerprint:row.fingerprint});if(trustedFiles.get(entry.path)!==row.fingerprint)aclTargets.push({path:row.path,code:'GHS-CONTENT',identity:row.identity,directory:false,within:root});if((index+1)%128===0||index+1===manifest.inventory.length)emitProgress(onProgress,'verify',index+1,manifest.inventory.length);}
 const dirRows=snapshotDirectoryRows(root,paths);
 if(process.platform==='win32'){const memoDirs=new Map(memo?.dirs??[]);for(const [dir,fp] of dirRows)if(memoDirs.get(dir)!==fp)aclTargets.push({path:join(root,dir),code:'GHS-MODE',identity:null,directory:true,within:root});if(aclTargets.length>0){const acl=assessWindowsPrivatePaths(aclTargets.map(target=>target.path),{timeoutForBatch:()=>Math.min(30000,deadline-Date.now()),batchSize:4096,onProgress:(done,total)=>{if(done%128===0||done===total)emitProgress(onProgress,'windows-acl',done,total);}});ensureBudget(deadline);if(acl.length!==aclTargets.length)footprintFail('GHS-MODE');for(let index=0;index<aclTargets.length;index++)if(acl[index]?.status!=='secure')footprintFail(aclTargets[index].code);for(const target of aclTargets){if(!target.identity)continue;const current=physicalFootprintPath(target.path,{directory:target.directory,within:target.within});if(JSON.stringify(footprintIdentity(current))!==JSON.stringify(target.identity))footprintFail('GHS-DRIFT');}}}
 if(JSON.stringify(paths)!==JSON.stringify(enumerate(root)))footprintFail('GHS-EXTRA');
 // The per-entry checks above vet entries below the root only; the root and its ancestors are re-vetted once here.
 if(JSON.stringify(footprintIdentity(physicalFootprintPath(root,{directory:true})))!==JSON.stringify(footprintIdentity(rootStat)))footprintFail('GHS-DRIFT');
 ensureBudget(deadline);if(record){record.rootFp=footprintFingerprint(rootStat);record.manifestFp=raw.fingerprint;record.dirs=dirRows;record.files=items.map((item,index)=>[paths[index],item.fingerprint]);}
 return {status:'verified',root,manifestSha256};
}
function ensureBudget(deadline){if(Date.now()>deadline)footprintFail('GHS-TIME-BUDGET');}
function emitProgress(callback,phase,completed,total){if(typeof callback==='function'){try{callback(Object.freeze({phase,completed,total}));}catch{}}}
// The second and last full source pass of a publish: the tree is read and hashed in full again after the copy and must equal the inventory pass.
function assertSourceUnchanged(pluginLibDir,captured,deadline){ensureBudget(deadline);const second=readInventory(sourceRootOf(pluginLibDir));assertSameSourceInventory(captured.first,second);if(describeSourceInventory(second).manifestSha256!==captured.manifestSha256)footprintFail('GHS-SOURCE-DRIFT');}
const OWNER_FILE='.runtime-owner.json',OWNER_SCHEMA='pipeline.git-hook-runtime-temp-owner.v1';
function createRuntimeTempOwner(temporary,digest,items){return {schema:OWNER_SCHEMA,directoryName:basename(temporary),temporaryIdentity:footprintIdentity(physicalFootprintPath(temporary,{directory:true})),pid:process.pid,nonce:randomBytes(32).toString('hex'),manifestSha256:digest,inventory:items.map(({path,sha256})=>({path,sha256}))};}
function writeRuntimeTempOwner(temporary,owner){writeFileSync(join(temporary,OWNER_FILE),JSON.stringify(owner)+'\n',{flag:'wx',mode:0o600});syncFile(join(temporary,OWNER_FILE));}
function removeRuntimeTempOwner(temporary,owner){const path=join(temporary,OWNER_FILE),row=readPhysicalFootprint(path,{max:1048576});if(!row||row.sha256!==footprintSha256(Buffer.from(JSON.stringify(owner)+'\n')))footprintFail('GHS-TEMP-OWNER');unlinkSync(path);syncDirectory(temporary);}
function validRuntimeTempOwner(value,directoryName){
 const keys=['schema','directoryName','temporaryIdentity','pid','nonce','manifestSha256','inventory'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key))
  ||value.schema!==OWNER_SCHEMA||value.directoryName!==directoryName||!value.temporaryIdentity||typeof value.temporaryIdentity.dev!=='string'||typeof value.temporaryIdentity.ino!=='string'||Object.keys(value.temporaryIdentity).sort().join('|')!=='dev|ino'||!Number.isSafeInteger(value.pid)||value.pid<1
  ||typeof value.nonce!=='string'||!/^[a-f0-9]{64}$/.test(value.nonce)||typeof value.manifestSha256!=='string'||!/^[a-f0-9]{64}$/.test(value.manifestSha256)
  ||!Array.isArray(value.inventory)||value.inventory.length>4096)return false;
 const paths=value.inventory.map(row=>row?.path);
 return new Set(paths).size===paths.length&&JSON.stringify(paths)===JSON.stringify([...paths].sort())
  &&value.inventory.every(row=>row&&Object.keys(row).sort().join('|')==='path|sha256'&&publicPath(row.path)&&/^[a-f0-9]{64}$/.test(row.sha256));
}
function ownerPidAlive(pid){try{process.kill(pid,0);return true;}catch(error){return error?.code!=='ESRCH';}}
function cleanupOwnedStaleRuntimeTemps(state,onProgress,deadline){
 let names;try{names=readdirSync(state).filter(name=>/^runtime-tmp-[a-f0-9]{16}$/.test(name)).sort();}catch{return;}
 if(names.length===0||names.length>8||Date.now()>=deadline)return;
 let removed=0;for(let index=0;index<names.length&&Date.now()<deadline;index++){const temporary=join(state,names[index]);try{if(removeOwnedRuntimeTemp({state,temporary,allowLiveOwner:false,deadline}))removed++;}catch{/* uncertain ownership or drift means retain the temporary tree */}}
 emitProgress(onProgress,'cleanup',removed,names.length);
}
function removeOwnedRuntimeTemp({state,temporary,owner:expectedOwner=null,allowLiveOwner=false,deadline=Date.now()+DEFAULT_INSTALL_BUDGET_MS}={}){
 const name=basename(temporary);if(!/^runtime-tmp-[a-f0-9]{16}$/.test(name))return false;
 const stateStat=physicalFootprintPath(state,{directory:true}),rootStat=physicalFootprintPath(temporary,{missing:true,directory:true});if(!rootStat)return false;
 const ownerPath=join(temporary,OWNER_FILE),ownerRow=readPhysicalFootprint(ownerPath,{max:1048576});if(!ownerRow)return false;
 let owner;try{owner=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(ownerRow.bytes));}catch{return false;}
 if(!validRuntimeTempOwner(owner,name)||JSON.stringify(owner.temporaryIdentity)!==JSON.stringify(footprintIdentity(rootStat)))return false;
 if(expectedOwner&&!ownerRow.bytes.equals(Buffer.from(JSON.stringify(expectedOwner)+'\n')))return false;
 if(allowLiveOwner?owner.pid!==process.pid:ownerPidAlive(owner.pid))return false;
 if(process.platform==='win32'){
  const acl=assessWindowsPrivatePaths([state,temporary,ownerPath],{batchSize:3,timeoutForBatch:()=>Math.min(1500,deadline-Date.now())});
  if(acl.length!==3||acl.some(row=>row.status!=='secure'))return false;
 }else if((stateStat.mode&0o777)!==0o700||(rootStat.mode&0o777)!==0o700||ownerRow.mode!==0o600)return false;
 const expected=new Map(owner.inventory.map(row=>[row.path,row.sha256])),expectedManifest=JSON.stringify({schema:SCHEMA,inventory:owner.inventory})+'\n';
 if(footprintSha256(Buffer.from(expectedManifest))!==owner.manifestSha256)return false;
 const directories=[],files=[],budget={used:0,max:67108864};
 function scan(directory,relativeDirectory=''){
  directories.push({path:directory,identity:footprintIdentity(physicalFootprintPath(directory,{directory:true}))});
  for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   const path=join(directory,entry.name),rel=relativeDirectory?relativeDirectory+'/'+entry.name:entry.name;
   const stat=physicalFootprintPath(path);
   if(stat.isDirectory()){
    const allowedDirectory=[...expected.keys()].some(item=>item.startsWith(rel+'/'));
    if(!allowedDirectory)return false;
    if(!scan(path,rel))return false;
   }else{
    const row=readPhysicalFootprint(path,{max:4194304,budget});if(!row)return false;
    if(rel===OWNER_FILE){if(row.sha256!==ownerRow.sha256||JSON.stringify(row.identity)!==JSON.stringify(ownerRow.identity))return false;}
    else if(rel==='snapshot.json'){if(row.sha256!==owner.manifestSha256||!row.bytes.equals(Buffer.from(expectedManifest)))return false;files.push({path,sha256:row.sha256,identity:row.identity});}
    else if(expected.get(rel)===row.sha256)files.push({path,sha256:row.sha256,identity:row.identity});
    else return false;
   }
  }
  return true;
 }
 if(!scan(temporary))return false;
 for(const file of files){const now=readPhysicalFootprint(file.path,{max:4194304});if(!now||now.sha256!==file.sha256||JSON.stringify(now.identity)!==JSON.stringify(file.identity))return false;unlinkSync(file.path);}
 for(const directory of directories.filter(row=>row.path!==temporary).sort((a,b)=>b.path.length-a.path.length)){
  const now=physicalFootprintPath(directory.path,{directory:true});if(JSON.stringify(footprintIdentity(now))!==JSON.stringify(directory.identity))return false;rmdirSync(directory.path);
 }
 const currentOwner=readPhysicalFootprint(ownerPath,{max:1048576});if(!currentOwner||currentOwner.sha256!==ownerRow.sha256||JSON.stringify(currentOwner.identity)!==JSON.stringify(ownerRow.identity))return false;
 unlinkSync(ownerPath);
 const stateNow=physicalFootprintPath(state,{directory:true}),rootNow=physicalFootprintPath(temporary,{directory:true});
 if(JSON.stringify(footprintIdentity(stateNow))!==JSON.stringify(footprintIdentity(stateStat))||JSON.stringify(footprintIdentity(rootNow))!==JSON.stringify(footprintIdentity(rootStat)))return false;
 rmdirSync(temporary);return true;
}
// Create-exclusive, write and fsync through ONE descriptor (the earlier shape reopened every copied file just to fsync it).
function writeSyncedFile(path,bytes){const fd=openSync(path,'wx',0o600);try{let offset=0;while(offset<bytes.length)offset+=writeSync(fd,bytes,offset,bytes.length-offset);try{fsyncSync(fd);}catch(e){if(['EPERM','EACCES','EINVAL','ENOTSUP'].includes(e.code))footprintFail('GHS-FILE-SYNC-UNAVAILABLE');throw e;}}finally{closeSync(fd);}}
function syncFile(path){let fd;try{fd=openSync(path,process.platform==='win32'?'r+':'r');fsyncSync(fd);}catch(e){if(['EPERM','EACCES','EINVAL','ENOTSUP'].includes(e.code))footprintFail('GHS-FILE-SYNC-UNAVAILABLE');throw e;}finally{if(fd!==undefined)closeSync(fd);}}
function syncDirectory(path){let fd;try{fd=openSync(path,'r');fsyncSync(fd);}catch(e){if(process.platform!=='win32'||!['EPERM','EINVAL','EISDIR','EACCES','ENOTSUP'].includes(e.code))throw e;}finally{if(fd!==undefined)closeSync(fd);}}
