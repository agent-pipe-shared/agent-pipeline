// SPDX-License-Identifier: SUL-1.0
// Source target: plugins/pipeline-core/lib/git-hook-runtime-snapshot.mjs
import {closeSync,fsyncSync,lstatSync,mkdirSync,openSync,readdirSync,renameSync,rmdirSync,unlinkSync,writeFileSync} from 'node:fs';
import {basename,dirname,join,relative,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {footprintFail,footprintIdentity,footprintSha256,physicalFootprintPath,readPhysicalFootprint} from './git-hook-footprint.mjs';
import {assessWindowsPrivatePaths,hardenWindowsPrivateDirectory} from './windows-private-state.mjs';
const PUBLIC_DIRS=['lib','hooks','scripts','config','schemas'];
// Exact shipped root data required by the copied protected-baseline loader.
const PUBLIC_ROOT_FILES=Object.freeze(['protected-baseline.json']);
const SCHEMA='pipeline.git-hook-runtime-snapshot.v1';
const DEFAULT_INSTALL_BUDGET_MS=80000;
function publicPath(path){return typeof path==='string'&&!path.includes('\\')&&!path.split('/').some(s=>!s||s==='.'||s==='..'||s.startsWith('.'))&&(PUBLIC_ROOT_FILES.includes(path)||PUBLIC_DIRS.includes(path.split('/')[0]))&&/\.(?:mjs|js|json|yaml|yml|toml)$/.test(path)&&!/(?:\.test\.|\.fixture\.)/.test(path);}
function enumerate(root){const names=[];for(const path of PUBLIC_ROOT_FILES){const entry=physicalFootprintPath(join(root,path),{missing:true});if(!entry)footprintFail('GHS-BASELINE-MISSING');if(!entry.isFile())footprintFail('PU-FILE');names.push(path);}for(const dir of PUBLIC_DIRS){const base=join(root,dir);if(!physicalFootprintPath(base,{missing:true,directory:true}))continue;const walk=path=>{for(const entry of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const target=join(path,entry.name);physicalFootprintPath(target);if(entry.isDirectory()){if(!entry.name.startsWith('.'))walk(target);}else if(publicPath(relative(root,target).split('\\').join('/')))names.push(relative(root,target).split('\\').join('/'));if(names.length>4096)footprintFail('GHS-COUNT');}};walk(base);}return names.sort();}
function readInventory(root){const rootIdentity=footprintIdentity(physicalFootprintPath(root,{directory:true})),budget={used:0,max:67108864},paths=enumerate(root),items=paths.map(path=>{const read=readPhysicalFootprint(join(root,path),{max:4194304,budget});if(!read)footprintFail('GHS-MISSING');return {path,sha256:read.sha256,bytes:read.bytes,identity:read.identity};});if(JSON.stringify(paths)!==JSON.stringify(enumerate(root))||JSON.stringify(rootIdentity)!==JSON.stringify(footprintIdentity(physicalFootprintPath(root,{directory:true}))))footprintFail('GHS-DRIFT');return {rootIdentity,items};}
export function inspectGitHookSourceSnapshot({pluginLibDir}){
 const sourceRoot=resolve(pluginLibDir,'..');physicalFootprintPath(sourceRoot,{directory:true});const first=readInventory(sourceRoot),second=readInventory(sourceRoot);const publicItems=value=>value.items.map(({path,sha256})=>({path,sha256}));if(JSON.stringify(publicItems(first))!==JSON.stringify(publicItems(second))||JSON.stringify(first.rootIdentity)!==JSON.stringify(second.rootIdentity))footprintFail('GHS-SOURCE-DRIFT');
 if(first.items.some((r,i)=>JSON.stringify(r.identity)!==JSON.stringify(second.items[i]?.identity)))footprintFail('GHS-SOURCE-DRIFT');
 const inventory=publicItems(first);if(!inventory.some(x=>x.path==='lib/governance-scope.mjs'))footprintFail('GHS-SCOPE-MISSING');const manifest={schema:SCHEMA,inventory},manifestBytes=JSON.stringify(manifest)+'\n',manifestSha256=footprintSha256(manifestBytes);
 return {sourceRoot,first,manifestBytes,manifestSha256};
}
export function publishGitHookRuntimeSnapshot({pluginLibDir,stateDir,timeBudgetMs=DEFAULT_INSTALL_BUDGET_MS,onProgress}={}){
 if(!Number.isFinite(timeBudgetMs)||timeBudgetMs<=0||timeBudgetMs>80000)footprintFail('GHS-TIME-BUDGET');const state=resolve(stateDir),deadline=Date.now()+timeBudgetMs;physicalFootprintPath(state,{directory:true});const {first,manifestBytes,manifestSha256:digest}=inspectGitHookSourceSnapshot({pluginLibDir}),destination=join(state,'runtime-'+digest),temporary=join(state,'runtime-tmp-'+randomBytes(8).toString('hex'));
 cleanupOwnedStaleRuntimeTemps(state,onProgress,deadline);
 ensureBudget(deadline);
 if(physicalFootprintPath(destination,{missing:true})){verifyGitHookRuntimeSnapshot({snapshotRoot:destination,manifestSha256:digest,deadline,onProgress});assertSourceDigest(pluginLibDir,digest,deadline);ensureBudget(deadline);emitProgress(onProgress,'complete',1,1);return {root:destination,manifestSha256:digest,inventorySha256:digest,deadline};}
 let owner=null;mkdirSync(temporary,{mode:0o700});try{if(process.platform==='win32'&&hardenWindowsPrivateDirectory(temporary).status!=='secure')footprintFail('GHS-MODE');const directories=new Set([temporary]);owner=createRuntimeTempOwner(temporary,digest,first.items);writeRuntimeTempOwner(temporary,owner);for(let index=0;index<first.items.length;index++){ensureBudget(deadline);const item=first.items[index],target=join(temporary,item.path);mkdirSync(dirname(target),{recursive:true,mode:0o700});directories.add(dirname(target));writeFileSync(target,item.bytes,{flag:'wx',mode:0o600});syncFile(target);if((index+1)%128===0||index+1===first.items.length)emitProgress(onProgress,'copy',index+1,first.items.length);}writeFileSync(join(temporary,'snapshot.json'),manifestBytes,{flag:'wx',mode:0o600});syncFile(join(temporary,'snapshot.json'));verifyGitHookRuntimeSnapshot({snapshotRoot:temporary,manifestSha256:digest,deadline,onProgress});ensureBudget(deadline);for(const path of [...directories].sort((a,b)=>b.length-a.length))syncDirectory(path);assertSourceDigest(pluginLibDir,digest,deadline);ensureBudget(deadline);removeRuntimeTempOwner(temporary,owner);renameSync(temporary,destination);syncDirectory(state);ensureBudget(deadline);emitProgress(onProgress,'complete',1,1);return {root:destination,manifestSha256:digest,inventorySha256:digest,deadline};}catch(e){if(owner)try{removeOwnedRuntimeTemp({state,temporary,owner,allowLiveOwner:true});}catch{}throw e;}
}
export function verifyGitHookRuntimeSnapshot({snapshotRoot,manifestSha256,deadline=Date.now()+DEFAULT_INSTALL_BUDGET_MS,onProgress}={}){
 const root=resolve(snapshotRoot);ensureBudget(deadline);const rootStat=physicalFootprintPath(root,{directory:true});if(process.platform!=='win32'&&(rootStat.mode&0o777)!==0o700)footprintFail('GHS-MODE');const raw=readPhysicalFootprint(join(root,'snapshot.json'),{max:1048576});if(!raw||raw.sha256!==manifestSha256||(process.platform!=='win32'&&raw.mode!==0o600))footprintFail('GHS-MANIFEST');const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw.bytes));if(Object.keys(manifest).sort().join('|')!=='inventory|schema'||manifest.schema!==SCHEMA||!Array.isArray(manifest.inventory)||manifest.inventory.length>4096)footprintFail('GHS-MANIFEST');const paths=manifest.inventory.map(r=>r.path);if(new Set(paths).size!==paths.length||JSON.stringify(paths)!==JSON.stringify([...paths].sort()))footprintFail('GHS-MANIFEST');const budget={used:0,max:67108864},items=[],aclPaths=[root,raw.path];if(process.platform!=='win32'){if((rootStat.mode&0o777)!==0o700||raw.mode!==0o600)footprintFail('GHS-MANIFEST');}
 for(let index=0;index<manifest.inventory.length;index++){ensureBudget(deadline);const entry=manifest.inventory[index];if(Object.keys(entry).sort().join('|')!=='path|sha256'||!publicPath(entry.path)||typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256))footprintFail('GHS-MANIFEST');const row=readPhysicalFootprint(join(root,entry.path),{max:4194304,budget});if(!row||row.sha256!==entry.sha256||(process.platform!=='win32'&&row.mode!==0o600))footprintFail('GHS-CONTENT');items.push({path:row.path,identity:row.identity});aclPaths.push(row.path);if((index+1)%128===0||index+1===manifest.inventory.length)emitProgress(onProgress,'verify',index+1,manifest.inventory.length);}
 if(process.platform==='win32'){const acl=assessWindowsPrivatePaths(aclPaths,{timeoutForBatch:()=>Math.min(7000,deadline-Date.now()),batchSize:64,onProgress:(done,total)=>{if(done%128===0||done===total)emitProgress(onProgress,'windows-acl',done,total);}});ensureBudget(deadline);if(acl.length!==aclPaths.length||acl[0]?.status!=='secure')footprintFail('GHS-MODE');if(acl[1]?.status!=='secure')footprintFail('GHS-MANIFEST');for(let index=0;index<items.length;index++)if(acl[index+2]?.status!=='secure')footprintFail('GHS-CONTENT');for(let index=0;index<aclPaths.length;index++){const current=physicalFootprintPath(aclPaths[index],{directory:index===0});if(index===0&&JSON.stringify(footprintIdentity(current))!==JSON.stringify(footprintIdentity(rootStat)))footprintFail('GHS-DRIFT');if(index===1&&JSON.stringify(footprintIdentity(current))!==JSON.stringify(raw.identity))footprintFail('GHS-DRIFT');if(index>1&&JSON.stringify(footprintIdentity(current))!==JSON.stringify(items[index-2].identity))footprintFail('GHS-DRIFT');}}
 if(JSON.stringify(paths)!==JSON.stringify(enumerate(root)))footprintFail('GHS-EXTRA');ensureBudget(deadline);return {status:'verified',root,manifestSha256};
}
function ensureBudget(deadline){if(Date.now()>deadline)footprintFail('GHS-TIME-BUDGET');}
function emitProgress(callback,phase,completed,total){if(typeof callback==='function'){try{callback(Object.freeze({phase,completed,total}));}catch{}}}
function assertSourceDigest(pluginLibDir,digest,deadline){ensureBudget(deadline);const current=inspectGitHookSourceSnapshot({pluginLibDir});if(current.manifestSha256!==digest)footprintFail('GHS-SOURCE-DRIFT');}
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
function syncFile(path){let fd;try{fd=openSync(path,process.platform==='win32'?'r+':'r');fsyncSync(fd);}catch(e){if(['EPERM','EACCES','EINVAL','ENOTSUP'].includes(e.code))footprintFail('GHS-FILE-SYNC-UNAVAILABLE');throw e;}finally{if(fd!==undefined)closeSync(fd);}}
function syncDirectory(path){let fd;try{fd=openSync(path,'r');fsyncSync(fd);}catch(e){if(process.platform!=='win32'||!['EPERM','EINVAL','EISDIR','EACCES','ENOTSUP'].includes(e.code))throw e;}finally{if(fd!==undefined)closeSync(fd);}}
