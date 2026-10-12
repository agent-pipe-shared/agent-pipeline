// SPDX-License-Identifier: SUL-1.0
// Observed committed package copies. Receipts are metadata, never deletion grants.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync,
  openSync, readSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { canonicalizeJson, parseStrictJson } from './governance-event.mjs';
import { isPhysicalScratchTarget, scratchLivePluginRoots } from './physical-scratch-boundary.mjs';
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from './windows-private-state.mjs';

const SCHEMA = 'pipeline.scratch-package-staging.v1';
const LIMIT = Object.freeze({ path:240, depth:16, members:512, directories:512, file:1048576,
  package:16777216, receipt:1048576, receipts:128, receiptTotal:16777216, total:67108864, listing:4194304 });
const HASH = /^[a-f0-9]{64}$/u, NUMBER = /^(?:0|[1-9][0-9]{0,31})$/u;
const FILE_KEYS = ['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'];
const LOCATOR_KEYS = ['dev','ino','mode','uid','gid'];
const operations = new WeakMap();
const canonical = canonicalizeJson, digest = value => createHash('sha256').update(
  Buffer.isBuffer(value) ? value : typeof value === 'string' ? value : canonical(value)).digest('hex');
const equal = (a,b) => canonical(a) === canonical(b);
const folded = p => p.normalize('NFC').toLowerCase();
const exact = (v,keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype,null].includes(Object.getPrototypeOf(v)) && Object.keys(v).sort().join('\0') === [...keys].sort().join('\0');
function fault(code) { throw Object.assign(new Error(code), {code}); }
function code(error) { return /^SPC-[A-Z-]{1,60}$/u.test(error?.code ?? '') ? error.code : 'SPC-OBSERVATION-UNAVAILABLE'; }
const below = (parent,path) => { const r=relative(parent,path);return r!==''&&r!=='..'&&!r.startsWith(`..${sep}`)&&!isAbsolute(r); };
const inSet = (parent,path) => folded(path)===folded(parent)||folded(path).startsWith(`${folded(parent)}/`);
function safePath(p) {
  return typeof p==='string' && p.length>0 && p.length<=LIMIT.path && p.split('/').length<=LIMIT.depth
    && p.split('/').every(n=>/^[A-Za-z0-9._-]+$/u.test(n)&&n!=='.'&&n!=='..'&&!n.endsWith('.')
      && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(n));
}
function stagingPath(p) { return safePath(p)&&p.startsWith('scratch/')&&!inSet('scratch/dispatch',p); }
function publicPath(p) { return safePath(p)&&!inSet('scratch',p)&&!inSet('.git',p); }
const identity = (s,keys=FILE_KEYS) => Object.fromEntries(keys.map(k=>[k,String(s[k])]));
function physicalDirectory(path) {
  const s=lstatSync(path,{bigint:true});
  if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(path)!==path)fault('SPC-DIRECTORY-UNSAFE');
  return s;
}
function privateDirectory(path,privateMode) {
  const s=physicalDirectory(path);
  if(process.platform==='win32') {
    if(assessWindowsPrivatePath(path).status!=='secure')fault('SPC-STORAGE-CUSTODY');
  } else if(typeof process.getuid!=='function'||s.uid!==BigInt(process.getuid())
    ||(s.mode & (privateMode?0o077n:0o022n))!==0n)fault('SPC-STORAGE-CUSTODY');
  return identity(s,LOCATOR_KEYS);
}
function readFile(path,max,privateMode=false) {
  let fd;
  try {
    const before=lstatSync(path,{bigint:true});
    if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>BigInt(max)
      ||realpathSync(path)!==path)fault('SPC-FILE-UNSAFE');
    if(privateMode) {
      if(process.platform==='win32') {if(assessWindowsPrivatePath(path).status!=='secure')fault('SPC-STORAGE-CUSTODY');}
      else if(before.uid!==BigInt(process.getuid())||(before.mode&0o077n)!==0n)fault('SPC-STORAGE-CUSTODY');
    }
    fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    const expected=identity(before),same=s=>equal(identity(s),expected);
    if(!same(fstatSync(fd,{bigint:true})))fault('SPC-FILE-CHANGED');
    const buffer=Buffer.alloc(max+1);let n=0,count;
    while(n<buffer.length&&(count=readSync(fd,buffer,n,buffer.length-n,n))>0)n+=count;
    if(n>max||BigInt(n)!==before.size||![lstatSync(path,{bigint:true}),fstatSync(fd,{bigint:true})].every(same))fault('SPC-FILE-CHANGED');
    if(privateMode&&process.platform==='win32'&&assessWindowsPrivatePath(path).status!=='secure')fault('SPC-STORAGE-CUSTODY');
    return {bytes:buffer.subarray(0,n),physicalIdentity:expected};
  } finally {if(fd!==undefined)closeSync(fd);}
}
function git(root,args,max=LIMIT.listing) {
  return execFileSync('git',args,{cwd:root,timeout:10000,maxBuffer:max,stdio:['ignore','pipe','pipe'],windowsHide:true});
}
const text = bytes => new TextDecoder('utf-8',{fatal:true}).decode(bytes);
function repository(root) {
  if(typeof root!=='string'||resolve(root)!==root||realpathSync(root)!==root)fault('SPC-REPOSITORY');
  physicalDirectory(root);
  const top=realpathSync(text(git(root,['rev-parse','--show-toplevel'])).trim());
  if(top!==root)fault('SPC-REPOSITORY');
  const common=resolve(root,text(git(root,['rev-parse','--git-common-dir'])).trim());
  privateDirectory(common,false);
  const format=text(git(root,['rev-parse','--show-object-format'])).trim();
  if(!['sha1','sha256'].includes(format))fault('SPC-OBJECT-FORMAT');
  const worktrees=text(git(root,['worktree','list','--porcelain']));
  const first=worktrees.split('\n')[0];
  if(!first.startsWith('worktree '))fault('SPC-REPOSITORY');
  const primaryRoot=realpathSync(first.slice(9));physicalDirectory(primaryRoot);
  return {root,primaryRoot,commonDir:common,objectFormat:format};
}
const validOid = (v,r) => typeof v==='string'&&new RegExp(`^[a-f0-9]{${r.objectFormat==='sha1'?40:64}}$`,'u').test(v)&&!/^0+$/u.test(v);
function committed(r,commit,prefix) {
  if(!validOid(commit,r)||!publicPath(prefix))fault('SPC-COMMITTED-INPUT');
  if(text(git(r.root,['cat-file','-t',commit],128)).trim()!=='commit')fault('SPC-COMMIT-OBJECT');
  const packageTreeOid=text(git(r.root,['rev-parse',`${commit}^{tree}`],256)).trim();
  const publicTreeOid=text(git(r.root,['rev-parse',`${commit}:${prefix}`],256)).trim();
  if(!validOid(packageTreeOid,r)||!validOid(publicTreeOid,r)||text(git(r.root,['cat-file','-t',publicTreeOid],128)).trim()!=='tree')fault('SPC-PREFIX-TREE');
  const listing=text(git(r.root,['ls-tree','-r','-z',publicTreeOid]));
  if(!listing.endsWith('\0'))fault('SPC-COMMITTED-SET');
  const rows=listing.split('\0').filter(Boolean),members=[],names=new Set();let total=0;
  if(rows.length<1||rows.length>LIMIT.members)fault('SPC-BOUND');
  for(const row of rows) {
    const tab=row.indexOf('\t'),fields=row.slice(0,tab).split(' '),suffix=row.slice(tab+1);
    if(tab<0||fields.length!==3||!['100644','100755'].includes(fields[0])||fields[1]!=='blob'
      ||!validOid(fields[2],r)||!safePath(suffix)||!publicPath(`${prefix}/${suffix}`)||names.has(folded(suffix)))fault('SPC-COMMITTED-SET');
    names.add(folded(suffix));
    const sizeText=text(git(r.root,['cat-file','-s',fields[2]],128)).trim();
    if(!NUMBER.test(sizeText)||BigInt(sizeText)>BigInt(LIMIT.file))fault('SPC-BOUND');
    const bytes=git(r.root,['cat-file','blob',fields[2]],LIMIT.file+1);total+=bytes.length;
    if(BigInt(bytes.length)!==BigInt(sizeText)||total>LIMIT.package)fault('SPC-BOUND');
    members.push({suffix,gitBlobOid:fields[2],gitMode:fields[0],sha256:digest(bytes)});
  }
  members.sort((a,b)=>a.suffix<b.suffix?-1:a.suffix>b.suffix?1:0);
  return {packageTreeOid,publicTreeOid,members,total};
}
function references(root) {
  const listing=text(git(root,['ls-files','-z'])),tracked=new Set(),contents=[];let total=0;
  for(const name of listing.split('\0').filter(Boolean)) {
    tracked.add(folded(name));
    if(!/\.(?:md|json|txt)$/iu.test(name))continue;
    const full=resolve(root,name);if(!below(root,full))fault('SPC-REFERENCES-UNAVAILABLE');
    let s;try{s=lstatSync(full);}catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR')continue;throw e;}
    if(!s.isFile()||s.isSymbolicLink())fault('SPC-REFERENCES-UNAVAILABLE');
    // Tracked reference documents may have historical multiple links; bounded
    // bytes are still checked before/after through the exact original path.
    const before=lstatSync(full,{bigint:true});if(before.size>BigInt(LIMIT.file))fault('SPC-REFERENCES-UNAVAILABLE');
    let fd;try{fd=openSync(full,constants.O_RDONLY|constants.O_NOFOLLOW);
      const expected=identity(before);if(!equal(identity(fstatSync(fd,{bigint:true})),expected))fault('SPC-REFERENCES-UNAVAILABLE');
      const buffer=Buffer.alloc(LIMIT.file+1);let n=0,c;while(n<buffer.length&&(c=readSync(fd,buffer,n,buffer.length-n,n))>0)n+=c;
      if(n>LIMIT.file||BigInt(n)!==before.size||![lstatSync(full,{bigint:true}),fstatSync(fd,{bigint:true})].every(s=>equal(identity(s),expected)))fault('SPC-REFERENCES-UNAVAILABLE');
      total+=n;if(total>LIMIT.total)fault('SPC-REFERENCES-UNAVAILABLE');contents.push(text(buffer.subarray(0,n)).replaceAll('\\','/'));
    }finally{if(fd!==undefined)closeSync(fd);}
  }
  return {tracked,text:contents.join('\n'),sha256:digest({listing,contents})};
}
function excluded(root,path,state,liveRoots) {
  if(inSet('scratch/dispatch',path)||state.text.includes(path)||!isPhysicalScratchTarget(path,{rootDir:root,liveRoots}))return true;
  const parts=path.split('/');return parts.some((_,i)=>state.tracked.has(folded(parts.slice(0,i+1).join('/'))));
}
function physical(r,path,state) {
  if(!stagingPath(path))fault('SPC-STAGING-PATH');
  const liveRoots=scratchLivePluginRoots();
  if(excluded(r.root,path,state,liveRoots))fault('SPC-EXCLUDED');
  const ancestors=[{path:'',...identity(physicalDirectory(r.root),LOCATOR_KEYS)}];let cursor=r.root;
  for(const part of path.split('/').slice(0,-1)) {cursor=join(cursor,part);ancestors.push({path:relative(r.root,cursor).split(sep).join('/'),...identity(physicalDirectory(cursor),LOCATOR_KEYS)});}
  const members=[],directories=[],names=new Set();let total=0;
  function walk(rel) {
    if(directories.length>=LIMIT.directories||rel.split('/').length>LIMIT.depth)fault('SPC-BOUND');
    const full=join(r.root,...rel.split('/')),before=physicalDirectory(full);
    directories.push({path:rel,...identity(before)});
    const entries=readdirSync(full).sort();
    for(const name of entries) {
      const child=`${rel}/${name}`;if(!safePath(child)||names.has(folded(child))||excluded(r.root,child,state,liveRoots))fault('SPC-EXCLUDED');
      names.add(folded(child));const s=lstatSync(join(r.root,...child.split('/')),{bigint:true});
      if(s.isDirectory()&&!s.isSymbolicLink())walk(child);
      else {
        if(members.length>=LIMIT.members)fault('SPC-BOUND');
        const file=readFile(join(r.root,...child.split('/')),LIMIT.file);total+=file.bytes.length;
        if(total>LIMIT.package)fault('SPC-BOUND');
        members.push({scratchPath:child,sha256:digest(file.bytes),gitMode:(s.mode&0o111n)!==0n?'100755':'100644',physicalIdentity:file.physicalIdentity});
      }
    }
    if(!equal(identity(physicalDirectory(full)),identity(before))||!equal(readdirSync(full).sort(),entries))fault('SPC-MEMBER-SET-CHANGED');
  }
  walk(path);members.sort((a,b)=>a.scratchPath<b.scratchPath?-1:1);directories.sort((a,b)=>a.path<b.path?-1:1);
  return {stagingIdentity:{ancestors,directories},members,total};
}
function joinRecord(r,path,commit,prefix) {
  const refs=references(r.root),tree=committed(r,commit,prefix),first=physical(r,path,refs),second=physical(r,path,refs);
  if(!equal(first,second)||references(r.root).sha256!==refs.sha256)fault('SPC-READSET-CHANGED');
  if(first.members.length!==tree.members.length)fault('SPC-SUFFIX-SET');
  const members=first.members.map((file,i)=>{
    const expected=tree.members[i];if(file.scratchPath!==`${path}/${expected.suffix}`||file.sha256!==expected.sha256||file.gitMode!==expected.gitMode)fault('SPC-SUFFIX-SET');
    return {scratchPath:file.scratchPath,publicPath:`${prefix}/${expected.suffix}`,gitBlobOid:expected.gitBlobOid,
      sha256:file.sha256,gitMode:file.gitMode,physicalIdentity:file.physicalIdentity};
  });
  return {schema:SCHEMA,repository:r,stagingPath:path,stagingIdentity:first.stagingIdentity,packageCommit:commit,
    packageTreeOid:tree.packageTreeOid,publicPrefix:prefix,publicTreeOid:tree.publicTreeOid,members,
    readsetSha256:digest({stagingIdentity:first.stagingIdentity,members})};
}
function validIdentity(v,keys) {return exact(v,keys)&&keys.every(k=>k==='path'?typeof v[k]==='string'&&v[k].length<=LIMIT.path:NUMBER.test(v[k]));}
function validate(v,r) {
  if(!exact(v,['schema','repository','stagingPath','stagingIdentity','packageCommit','packageTreeOid','publicPrefix','publicTreeOid','members','readsetSha256'])
    ||v.schema!==SCHEMA||!exact(v.repository,['root','primaryRoot','commonDir','objectFormat'])||!equal(v.repository,r)
    ||!stagingPath(v.stagingPath)||!publicPath(v.publicPrefix)||![v.packageCommit,v.packageTreeOid,v.publicTreeOid].every(o=>validOid(o,r))
    ||!exact(v.stagingIdentity,['ancestors','directories'])||!Array.isArray(v.stagingIdentity.ancestors)||v.stagingIdentity.ancestors.length<1||v.stagingIdentity.ancestors.length>LIMIT.depth
    ||!v.stagingIdentity.ancestors.every(a=>validIdentity(a,['path',...LOCATOR_KEYS]))||!Array.isArray(v.stagingIdentity.directories)
    ||v.stagingIdentity.directories.length<1||v.stagingIdentity.directories.length>LIMIT.directories||!v.stagingIdentity.directories.every(d=>validIdentity(d,['path',...FILE_KEYS])&&inSet(v.stagingPath,d.path))
    ||!Array.isArray(v.members)||v.members.length<1||v.members.length>LIMIT.members||!HASH.test(v.readsetSha256))fault('SPC-RECEIPT-INVALID');
  for(let i=0;i<v.members.length;i++) {const m=v.members[i];if(!exact(m,['scratchPath','publicPath','gitBlobOid','sha256','gitMode','physicalIdentity'])
    ||!safePath(m.scratchPath)||!inSet(v.stagingPath,m.scratchPath)||m.scratchPath===v.stagingPath||!publicPath(m.publicPath)
    ||m.publicPath!==`${v.publicPrefix}/${m.scratchPath.slice(v.stagingPath.length+1)}`||!validOid(m.gitBlobOid,r)||!HASH.test(m.sha256)
    ||!['100644','100755'].includes(m.gitMode)||!validIdentity(m.physicalIdentity,FILE_KEYS)||m.physicalIdentity.nlink!=='1'
    ||BigInt(m.physicalIdentity.size)>BigInt(LIMIT.file)||i>0&&v.members[i-1].scratchPath>=m.scratchPath)fault('SPC-RECEIPT-INVALID');}
  if(new Set(v.members.map(m=>folded(m.scratchPath))).size!==v.members.length
    ||new Set(v.stagingIdentity.directories.map(d=>folded(d.path))).size!==v.stagingIdentity.directories.length
    ||digest({stagingIdentity:v.stagingIdentity,members:v.members})!==v.readsetSha256)fault('SPC-RECEIPT-INVALID');
}
function storage(r,create=false) {
  const roots=[{path:r.commonDir,identity:privateDirectory(r.commonDir,false)}];let path=r.commonDir;
  for(const segment of ['agent-pipeline','scratch-package-staging']) {
    path=join(path,segment);let created=false;
    try{physicalDirectory(path);}catch(e){if(e.code!=='ENOENT')throw e;if(!create)return null;mkdirSync(path,{mode:0o700});created=true;}
    if(created&&process.platform==='win32'&&hardenWindowsPrivateDirectory(path).status!=='secure')fault('SPC-STORAGE-CUSTODY');
    roots.push({path,identity:privateDirectory(path,segment==='scratch-package-staging')});
    if(created)syncDirectory(dirname(path));
  }
  const check=()=>{for(const a of roots)if(!equal(privateDirectory(a.path,a.path===path),a.identity))fault('SPC-STORAGE-CHANGED');};
  check();return {path,check};
}
function lock(store) {
  const path=join(store.path,'.operation.lock');let fd;
  try{store.check();fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    writeFileSync(fd,'pipeline.scratch-package-staging.operation.v1\n');fsyncSync(fd);
    const expected=identity(fstatSync(fd,{bigint:true}));if(expected.nlink!=='1'||!equal(identity(lstatSync(path,{bigint:true})),expected))fault('SPC-LOCK-CHANGED');
    return {path,check(){store.check();if(!equal(identity(fstatSync(fd,{bigint:true})),expected)||!equal(identity(lstatSync(path,{bigint:true})),expected))fault('SPC-LOCK-CHANGED');},close(){
      try{if(equal(identity(lstatSync(path,{bigint:true})),expected))unlinkSync(path);}catch{/* preserve an unknown or missing lock */}finally{closeSync(fd);fd=undefined;}}};
  }catch(e){if(fd!==undefined)closeSync(fd);fault(e.code==='EEXIST'?'SPC-OPERATION-HELD':code(e));}
}
function readReceipt(store,name,r) {
  if(!/^[a-f0-9]{64}\.json$/u.test(name))fault('SPC-RECEIPT-INVALID');
  store.check();const path=join(store.path,name),first=readFile(path,LIMIT.receipt,true),second=readFile(path,LIMIT.receipt,true);
  if(!equal(first.physicalIdentity,second.physicalIdentity)||!first.bytes.equals(second.bytes)||digest(first.bytes)!==name.slice(0,-5))fault('SPC-RECEIPT-CHANGED');
  const value=parseStrictJson(first.bytes);if(canonical(value)!==text(first.bytes))fault('SPC-RECEIPT-INVALID');validate(value,r);
  return {value,name,path,sha256:digest(first.bytes),physicalIdentity:first.physicalIdentity};
}
function inspect(r,store,ownedLock=null) {
  const result={delete:[],blockedStagingPaths:[],holds:[],unknownScope:false},groups=[];
  if(!store)return {result,groups};
  try {
    store.check();ownedLock?.check();
    const names=readdirSync(store.path).sort(),receipts=names.filter(n=>n!=='.operation.lock');
    if(!ownedLock&&names.includes('.operation.lock'))fault('SPC-OPERATION-HELD');
    if(receipts.length>LIMIT.receipts||receipts.some(n=>!/^[a-f0-9]{64}\.json$/u.test(n)))fault('SPC-RECEIPT-INVALID');
    let total=0,packageTotal=0;
    for(const name of receipts) {
      let receipt;
      try {receipt=readReceipt(store,name,r);total+=Number(lstatSync(receipt.path).size);if(total>LIMIT.receiptTotal)fault('SPC-BOUND');}
      catch(e){result.unknownScope=true;result.holds.push({stagingPath:null,code:code(e)});continue;}
      const v=receipt.value;result.blockedStagingPaths.push(v.stagingPath);
      try {const observed=joinRecord(r,v.stagingPath,v.packageCommit,v.publicPrefix);
        if(!equal(observed,v))fault('SPC-READSET-CHANGED');
        packageTotal+=v.members.reduce((s,m)=>s+Number(m.physicalIdentity.size),0);if(packageTotal>LIMIT.total)fault('SPC-BOUND');
        if(groups.some(g=>inSet(g.receipt.value.stagingPath,v.stagingPath)||inSet(v.stagingPath,g.receipt.value.stagingPath)))fault('SPC-OVERLAPPING-SET');
        groups.push({receipt,deleted:new Set(),directoryOverrides:new Map()});
      }catch(e){result.holds.push({stagingPath:v.stagingPath,code:code(e)});}
    }
    if(!equal(readdirSync(store.path).sort(),names))fault('SPC-RECEIPT-SET-CHANGED');store.check();ownedLock?.check();
    result.blockedStagingPaths=[...new Set(result.blockedStagingPaths)].sort();
    if(!result.unknownScope)result.delete=groups.filter(g=>!result.holds.some(h=>h.stagingPath!==null&&(inSet(h.stagingPath,g.receipt.value.stagingPath)||inSet(g.receipt.value.stagingPath,h.stagingPath))))
      .flatMap(g=>g.receipt.value.members.map(m=>m.scratchPath)).sort();
  }catch(e){result.delete=[];result.unknownScope=true;result.holds.push({stagingPath:null,code:code(e)});}
  return {result,groups};
}
function syncDirectory(path) {let fd;try{fd=openSync(path,constants.O_RDONLY|constants.O_DIRECTORY);fsyncSync(fd);}catch{fault('SPC-STORAGE-DURABILITY-UNAVAILABLE');}finally{if(fd!==undefined)closeSync(fd);}}
function publish(store,value,r) {
  const bytes=Buffer.from(canonical(value));if(bytes.length>LIMIT.receipt)fault('SPC-BOUND');
  const hash=digest(bytes),name=`${hash}.json`,path=join(store.path,name);
  try{const existing=readReceipt(store,name,r);if(!equal(existing.value,value))fault('SPC-RECEIPT-INVALID');syncDirectory(store.path);return hash;}catch(e){if(e.code!=='ENOENT')throw e;}
  const temp=join(store.path,`.pending-${randomBytes(16).toString('hex')}`);let fd,expected;
  try {fd=openSync(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    writeFileSync(fd,bytes);fsyncSync(fd);expected=identity(fstatSync(fd,{bigint:true}));closeSync(fd);fd=undefined;
    store.check();if(!equal(readFile(temp,LIMIT.receipt,true).physicalIdentity,expected))fault('SPC-RECEIPT-CHANGED');linkSync(temp,path);
    // The temporary and destination are the same inode during this sole owned
    // publication window. Remove only that exact temporary before nlink1 readback.
    const now=lstatSync(temp,{bigint:true});if(now.dev!==BigInt(expected.dev)||now.ino!==BigInt(expected.ino)||now.nlink!==2n)fault('SPC-RECEIPT-CHANGED');
    unlinkSync(temp);expected=null;syncDirectory(store.path);
    const readback=readReceipt(store,name,r);if(!equal(readback.value,value))fault('SPC-RECEIPT-CHANGED');return hash;
  } finally {if(fd!==undefined)closeSync(fd);if(expected){try{const s=lstatSync(temp,{bigint:true});if(s.dev===BigInt(expected.dev)&&s.ino===BigInt(expected.ino)&&s.nlink===1n)unlinkSync(temp);}catch{/* retain unknown custody */}}}
}
export function registerPackageStaging(input) {
  let held;
  try {
    if(!exact(input,['root','stagingPath','packageCommit','publicPrefix']))fault('SPC-INPUT');
    const r=repository(input.root),value=joinRecord(r,input.stagingPath,input.packageCommit,input.publicPrefix),store=storage(r,true);
    held=lock(store);const previous=inspect(r,store,held);
    if(previous.result.unknownScope)fault('SPC-REGISTRATION-HELD');
    for(const path of previous.result.blockedStagingPaths)if(inSet(path,value.stagingPath)||inSet(value.stagingPath,path)) {
      const sameReceipt=previous.groups.find(g=>equal(g.receipt.value,value));if(!sameReceipt)fault('SPC-REGISTRATION-HELD');
    }
    if(!equal(joinRecord(r,input.stagingPath,input.packageCommit,input.publicPrefix),value))fault('SPC-READSET-CHANGED');
    held.check();const receiptSha256=publish(store,value,r);held.check();
    return {ok:true,code:'SCRATCH-PACKAGE-STAGING-REGISTERED',receiptSha256,memberCount:value.members.length};
  }catch(e){return {ok:false,code:code(e)};}finally{held?.close();}
}
export function inspectPackageStaging(input) {
  try{if(!exact(input,['root']))fault('SPC-INPUT');const r=repository(input.root);return inspect(r,storage(r)).result;}
  catch(e){return {delete:[],blockedStagingPaths:[],holds:[{stagingPath:null,code:code(e)}],unknownScope:true};}
}
export function beginPackageSweep(input) {
  if(!exact(input,['root']))fault('SPC-INPUT');const r=repository(input.root),store=storage(r);let held;
  try {held=store?lock(store):null;const observed=inspect(r,store,held),handle=Object.freeze({});
    operations.set(handle,{r,store,held,groups:observed.groups,inspection:observed.result,pendingMember:null,storageNames:store?readdirSync(store.path).sort():[]});return {handle,inspection:structuredClone(observed.result)};
  }catch(e){held?.close();throw e;}
}
function operation(handle) {const op=operations.get(handle);if(!op)fault('SPC-OPERATION-UNOWNED');op.held?.check();return op;}
function groupFor(op,path) {return op.groups.find(g=>op.inspection.delete.includes(path)&&g.receipt.value.members.some(m=>m.scratchPath===path));}
export function isPackageSweepMember(handle,path) {return Boolean(groupFor(operation(handle),path));}
function recheck(op,group) {
  if(!equal(readdirSync(op.store.path).sort(),op.storageNames))fault('SPC-RECEIPT-SET-CHANGED');
  const v=group.receipt.value,receipt=readReceipt(op.store,group.receipt.name,op.r);
  if(!equal(receipt.physicalIdentity,group.receipt.physicalIdentity)||receipt.sha256!==group.receipt.sha256||!equal(receipt.value,v))fault('SPC-RECEIPT-CHANGED');
  const tree=committed(op.r,v.packageCommit,v.publicPrefix);if(tree.packageTreeOid!==v.packageTreeOid||tree.publicTreeOid!==v.publicTreeOid)fault('SPC-COMMITTED-SET');
  const refs=references(op.r.root),a=physical(op.r,v.stagingPath,refs),b=physical(op.r,v.stagingPath,refs);
  if(!equal(a,b)||references(op.r.root).sha256!==refs.sha256)fault('SPC-READSET-CHANGED');
  const expected=v.members.filter(m=>!group.deleted.has(m.scratchPath));
  if(a.members.length!==expected.length||!equal(a.stagingIdentity.ancestors,v.stagingIdentity.ancestors))fault('SPC-MEMBER-SET-CHANGED');
  const expectedDirs=v.stagingIdentity.directories.map(d=>group.directoryOverrides.get(d.path)??d);
  if(!equal(a.stagingIdentity.directories,expectedDirs))fault('SPC-DIRECTORY-CHANGED');
  for(let i=0;i<expected.length;i++) {const e=expected[i],p=a.members[i],t=tree.members.find(m=>`${v.stagingPath}/${m.suffix}`===e.scratchPath);
    if(!t||p.scratchPath!==e.scratchPath||p.sha256!==e.sha256||p.gitMode!==e.gitMode||!equal(p.physicalIdentity,e.physicalIdentity)
      ||t.sha256!==e.sha256||t.gitMode!==e.gitMode||t.gitBlobOid!==e.gitBlobOid)fault('SPC-FILE-CHANGED');}
  if(!equal(readdirSync(op.store.path).sort(),op.storageNames))fault('SPC-RECEIPT-SET-CHANGED');op.held.check();return a;
}
export function recheckPackageSweepMember(handle,path) {
  const op=operation(handle),g=groupFor(op,path);if(!g||g.deleted.has(path))fault('SPC-OPERATION-MEMBER');recheck(op,g);
  const member=g.receipt.value.members.find(m=>m.scratchPath===path),actual=readFile(join(op.r.root,...path.split('/')),LIMIT.file);
  if(!equal(actual.physicalIdentity,member.physicalIdentity)||digest(actual.bytes)!==member.sha256)fault('SPC-FILE-CHANGED');
  op.pendingMember=path;
}
export function recordPackageSweepDeletion(handle,path) {
  const op=operation(handle),g=groupFor(op,path);if(!g||g.deleted.has(path)||op.pendingMember!==path)fault('SPC-OPERATION-MEMBER');
  try{lstatSync(join(op.r.root,...path.split('/')));fault('SPC-DELETION-READBACK');}catch(e){if(e.code!=='ENOENT')throw e;}
  const parent=path.slice(0,path.lastIndexOf('/')),old=g.directoryOverrides.get(parent)??g.receipt.value.stagingIdentity.directories.find(d=>d.path===parent);
  const current={path:parent,...identity(physicalDirectory(join(op.r.root,...parent.split('/'))))};
  if(!old||!['path',...LOCATOR_KEYS,'nlink'].every(k=>current[k]===old[k]))fault('SPC-DIRECTORY-CHANGED');
  g.deleted.add(path);op.pendingMember=null;g.directoryOverrides.set(parent,current);recheck(op,g);
}
export function closePackageSweep(handle) {
  const op=operations.get(handle);if(!op)fault('SPC-OPERATION-UNOWNED');operations.delete(handle);op.held?.close();
}
