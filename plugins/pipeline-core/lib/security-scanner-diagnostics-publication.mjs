// SPDX-License-Identifier: SUL-1.0
// Linux-only descriptor-anchored diagnostic publisher. No admission authority.
import { constants,openSync,closeSync,fstatSync,lstatSync,statfsSync,readSync,writeSync,fsyncSync,renameSync,unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { validateScannerDiagnostics,parseScannerDiagnostics } from "./security-scanner-diagnostics.mjs";

const TARGET="security-latest.diagnostics.json";
const STAGE=".security-latest.diagnostics.pending";
const MAX=16384;
const identity=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const anchor=fd=>`/proc/self/fd/${fd}`;
const flags=constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW;
const unavailable=code=>({status:"unavailable",code});
function ownedDirectory(stat){
  if(!stat.isDirectory()||stat.uid!==process.getuid()||(stat.mode&0o022)!==0)throw Error();
}
function ownedFile(stat){
  if(!stat.isFile()||stat.uid!==process.getuid()||stat.nlink!==1||(stat.mode&0o077)!==0||stat.size>MAX)throw Error();
}
function existing(path){try{return lstatSync(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function openRoot(root){
  if(typeof root!=="string"||root.length===0||root!==resolve(root)||root==='/')throw Error();
  let fd=openSync('/',flags);
  try{
    for(const part of root.split('/').filter(Boolean)){
      const path=`${anchor(fd)}/${part}`;
      const before=lstatSync(path);
      if(!before.isDirectory()||before.isSymbolicLink())throw Error();
      const next=openSync(path,flags);
      const after=fstatSync(next);
      if(!identity(before,after)){closeSync(next);throw Error();}
      closeSync(fd);fd=next;
    }
    ownedDirectory(fstatSync(fd));return fd;
  }catch(e){closeSync(fd);throw e;}
}
function readBounded(fd){
  const buffer=Buffer.alloc(MAX+1);let length=0;
  while(length<buffer.length){const n=readSync(fd,buffer,length,buffer.length-length,length);if(n===0)break;length+=n;}
  if(length>MAX)throw Error();return buffer.subarray(0,length);
}
function readCurrent(dirFd){
  const path=`${anchor(dirFd)}/${TARGET}`;
  const before=existing(path);if(before===null)return null;
  ownedFile(before);
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const stat=fstatSync(fd);ownedFile(stat);if(!identity(before,stat))throw Error();
    const bytes=readBounded(fd);const after=fstatSync(fd);if(!identity(stat,after)||after.size!==bytes.length)throw Error();
    // Accept old evidence bindings for latest-only replacement, but require a
    // valid owned diagnostic shape, not an arbitrary unrelated file.
    let candidate;try{candidate=JSON.parse(bytes.toString('utf8'));}catch{throw Error();}
    if(!parseScannerDiagnostics(bytes,{payloadSha256:candidate?.evidencePayloadSha256,candidate:candidate?.candidate}).ok)throw Error();
    return {stat,bytes};
  }finally{closeSync(fd);}
}

// observer is a transparent fault-injection seam for disposable tests only;
// it supplies no IO/capability override and cannot skip any following check.
export function publishScannerDiagnostics(root,record,{observer}={}){
  if(!validateScannerDiagnostics(record))return unavailable("diagnostic-record-invalid");
  const bytes=Buffer.from(JSON.stringify(record)+'\n');if(bytes.length>MAX)return unavailable("diagnostic-record-invalid");
  if(process.platform!=="linux"||!constants.O_NOFOLLOW||!constants.O_DIRECTORY||typeof process.getuid!=="function")return unavailable("diagnostic-publication-capability-unavailable");
  let rootFd=null,dirFd=null,stageFd=null,created=false,published=false,stageStat=null;
  try{
    if(statfsSync('/proc').type!==0x9fa0)throw Error();
    rootFd=openRoot(root);const rootStat=fstatSync(rootFd);
    const parentPath=`${anchor(rootFd)}/evidence`;
    const before=lstatSync(parentPath);ownedDirectory(before);
    dirFd=openSync(parentPath,flags);const dirStat=fstatSync(dirFd);
    ownedDirectory(dirStat);if(!identity(before,dirStat)||dirStat.dev!==rootStat.dev)throw Error();
    // The exclusive staging inode is the cooperative publication slot. It is
    // transient data, not a second lock/grant/authority record.
    const stagePath=`${anchor(dirFd)}/${STAGE}`;
    try{stageFd=openSync(stagePath,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}
    catch(e){if(e.code==='EEXIST')return unavailable("diagnostic-publication-busy");throw e;}
    created=true;stageStat=fstatSync(stageFd);ownedFile(stageStat);
    let offset=0;while(offset<bytes.length){const n=writeSync(stageFd,bytes,offset,bytes.length-offset,offset);if(n<=0)throw Error();offset+=n;}
    fsyncSync(stageFd);
    observer?.("staged");
    const current=readCurrent(dirFd);
    observer?.("precommit");
    const freshRoot=openRoot(root);
    try{if(!identity(rootStat,fstatSync(freshRoot)))throw Error();}finally{closeSync(freshRoot);}
    const currentDir=lstatSync(`${anchor(rootFd)}/evidence`);
    ownedDirectory(currentDir);if(!identity(dirStat,currentDir))throw Error();
    const stageNow=lstatSync(stagePath);ownedFile(stageNow);
    if(!identity(stageStat,stageNow)||stageNow.size!==bytes.length||!readBounded(stageFd).equals(bytes))throw Error();
    const targetNow=existing(`${anchor(dirFd)}/${TARGET}`);
    if(current===null ? targetNow!==null : targetNow===null||!identity(current.stat,targetNow))throw Error();
    if(targetNow!==null){ownedFile(targetNow);const again=readCurrent(dirFd);if(!again||!again.bytes.equals(current.bytes))throw Error();}
    renameSync(stagePath,`${anchor(dirFd)}/${TARGET}`);created=false;published=true;
    const committed=lstatSync(`${anchor(dirFd)}/${TARGET}`);ownedFile(committed);
    if(!identity(stageStat,committed))throw Error();
    fsyncSync(dirFd);
    return {status:"published",code:"diagnostic-sidecar-published",bytes:bytes.length};
  }catch{
    return unavailable(published ? "diagnostic-published-readback-or-durability-unavailable" : "diagnostic-publication-unavailable");
  }finally{
    if(created&&dirFd!==null&&stageStat!==null){
      try{const path=`${anchor(dirFd)}/${STAGE}`;const s=lstatSync(path);if(identity(stageStat,s)&&s.isFile()&&s.nlink===1)unlinkSync(path);}catch{/* fixed caller notice; no unsafe reclaim */}
    }
    for(const fd of [stageFd,dirFd,rootFd])if(fd!==null){try{closeSync(fd);}catch{/* no raw message */}}
  }
}
