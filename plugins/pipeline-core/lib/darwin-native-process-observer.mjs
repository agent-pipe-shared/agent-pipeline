// SPDX-License-Identifier: SUL-1.0
/** Kernel observation, never a caller observation or a portable fixture issuer. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, readFileSync, mkdtempSync, chmodSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
const sourcePath=fileURLToPath(new URL('./native/darwin-requester-observer.c',import.meta.url));
const hash=v=>createHash('sha256').update(v).digest('hex');
// Preserve the existing journal/requester argv digest contract exactly.
const argvDigest=argv=>hash(JSON.stringify(argv,null,2)+'\n');
const fault=code=>Object.assign(new Error(code),{code});
let helper=null;
function privateImage(path,expectedSha256=null){
  const s=lstatSync(path);
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.uid!==process.getuid()||(s.mode&0o022)!==0
    ||realpathSync(path)!==path)throw fault('darwin-observer-image-unsafe');
  if(s.size>16777216)throw fault('darwin-observer-image-unsafe');
  const bytes=readFileSync(path),sha256=hash(bytes),after=lstatSync(path);
  if(['dev','ino','size','mtimeMs','ctimeMs','mode','uid','nlink'].some(k=>s[k]!==after[k])
    ||expectedSha256!==null&&sha256!==expectedSha256)throw fault('darwin-observer-image-drift');
  return {bytes,sha256};
}
function nativeHelper(){
  if(process.platform!=='darwin')throw fault('darwin-observer-platform-unavailable');
  const source=privateImage(sourcePath);
  if(helper){
    const dir=lstatSync(helper.directory);
    if(!dir.isDirectory()||dir.isSymbolicLink()||dir.uid!==process.getuid()||(dir.mode&0o077)!==0
      ||realpathSync(helper.directory)!==helper.directory||helper.sourceSha256!==source.sha256)throw fault('darwin-observer-image-drift');
    privateImage(helper.path,helper.sha256);return helper;
  }
  // Fixed system compiler, clean environment, bounded build, no PATH lookup.
  const compiler='/usr/bin/clang';
  const compilerStat=lstatSync(compiler);
  if(!compilerStat.isFile()||compilerStat.isSymbolicLink()||compilerStat.uid!==0||(compilerStat.mode&0o022)!==0)throw fault('darwin-observer-sdk-unavailable');
  // Detect missing Command Line Tools without invoking Apple's install prompt.
  const developer=spawnSync('/usr/bin/xcode-select',['-p'],{encoding:'utf8',timeout:2000,maxBuffer:8192,env:{PATH:'/usr/bin:/bin'},stdio:['ignore','pipe','pipe']});
  if(developer.error||developer.status!==0||typeof developer.stdout!=='string'||!isAbsolute(developer.stdout.trim()))throw fault('darwin-observer-sdk-unavailable');
  const directory=mkdtempSync(join(realpathSync(tmpdir()),'pipeline-darwin-observer-'));chmodSync(directory,0o700);
  const path=join(directory,'observer'),input=join(directory,'observer.c');
  try{
    writeFileSync(input,source.bytes,{flag:'wx',mode:0o600});
    const result=spawnSync(compiler,['-std=c11','-D_DARWIN_C_SOURCE','-Wall','-Wextra','-Werror','-O2',input,'-o',path],
      {encoding:'utf8',timeout:30000,maxBuffer:65536,env:{PATH:'/usr/bin:/bin',TMPDIR:directory},stdio:['ignore','pipe','pipe']});
    const afterCompiler=lstatSync(compiler);
    if(result.error||result.status!==0||['dev','ino','size','mtimeMs','ctimeMs','mode','uid'].some(k=>compilerStat[k]!==afterCompiler[k]))throw fault('darwin-observer-sdk-unavailable');
    chmodSync(path,0o700);const image=privateImage(path);
    helper={path,directory,sha256:image.sha256,sourceSha256:source.sha256};
    process.once('exit',()=>{try{rmSync(directory,{recursive:true,force:true});}catch{}});return helper;
  }catch(error){rmSync(directory,{recursive:true,force:true});throw error;}
}
function run(args,fd=null){
  const h=nativeHelper();
  const result=spawnSync(h.path,args,{encoding:'utf8',timeout:2000,maxBuffer:600000,
    env:{PATH:'/usr/bin:/bin'},stdio:fd===null?['ignore','pipe','pipe']:['ignore','pipe','pipe','ignore',fd]});
  privateImage(h.path,h.sha256);privateImage(sourcePath,h.sourceSha256);
  if(result.error||result.signal||![0,3].includes(result.status))throw fault('darwin-observer-native-unavailable');
  return result.status===3?null:result.stdout;
}
const decode=hex=>{
  if(typeof hex!=='string'||hex.length>524288||!/^(?:[0-9a-f]{2})*$/u.test(hex))throw fault('darwin-observer-output-invalid');
  return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(hex,'hex'));
};
/** Parser is data-only; production entry always invokes the fixed native helper. */
export function parseDarwinNativeProcessOutput(text,pid){
  if(typeof text!=='string'||text.length>600000)throw fault('darwin-observer-output-invalid');
  const v=JSON.parse(text),keys=['pid','parentPid','group','session','uid','gid','ruid','rgid','svuid','svgid','start','boot','executableHex','cwdHex','procargsHex'];
  if(!v||JSON.stringify(v)+'\n'!==text||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k))||v.pid!==pid
    ||['pid','parentPid','group','session','uid','gid','ruid','rgid','svuid','svgid'].some(k=>!Number.isSafeInteger(v[k])||v[k]<0)
    ||v.pid<1||v.session<1||!/^\d+:\d+$/u.test(v.start)
    ||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(v.boot))throw fault('darwin-observer-output-invalid');
  const executable=decode(v.executableHex),cwd=decode(v.cwdHex);
  if(typeof v.procargsHex!=='string'||v.procargsHex.length>524288||!/^(?:[0-9a-f]{2})*$/u.test(v.procargsHex))throw fault('darwin-observer-output-invalid');
  const bytes=Buffer.from(v.procargsHex,'hex');
  if(bytes.length<5)throw fault('darwin-observer-output-invalid');
  // Supported Darwin arm64/x86_64 ABIs use little-endian native int argc.
  const count=bytes.readInt32LE(0);let at=4;
  const string=()=>{const end=bytes.indexOf(0,at);if(end<0)throw fault('darwin-observer-output-invalid');
    const value=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(at,end));at=end+1;return value;};
  if(count<1||count>4096||!string())throw fault('darwin-observer-output-invalid');
  while(at<bytes.length&&bytes[at]===0)at++;
  const argv=[];for(let i=0;i<count;i++)argv.push(string());
  if(at!==bytes.length||!argv[0]||!isAbsolute(executable)||!isAbsolute(cwd)||executable.includes('\0')||cwd.includes('\0'))throw fault('darwin-observer-output-invalid');
  return {platform:'darwin',pid:v.pid,parentPid:v.parentPid,group:v.group,session:v.session,
    uid:v.uid,gid:v.gid,ruid:v.ruid,rgid:v.rgid,svuid:v.svuid,svgid:v.svgid,
    start:v.start,state:'R',executable,cwd,argv,argvSha256:argvDigest(argv),bootSha256:hash(v.boot.toLowerCase())};
}
export function observeNativeDarwinProcess({pid}={}){
  if(process.platform!=='darwin')return {status:'unavailable',code:'darwin-observer-platform-unavailable'};
  if(!Number.isSafeInteger(pid)||pid<1||pid>2147483647)return {status:'unavailable',code:'darwin-observer-pid-invalid'};
  try{const text=run(['process',String(pid)]);if(text===null)return {status:'absent'};
    const observed=parseDarwinNativeProcessOutput(text,pid);
    if(observed.uid!==process.getuid())throw fault('darwin-observer-principal-mismatch');
    return {status:'present',process:observed};
  }catch(error){return {status:'unavailable',code:typeof error?.code==='string'?error.code:'darwin-observer-output-invalid'};}
}
export function sameNativeDarwinProcess(a,b){
  const valid=v=>v?.platform==='darwin'&&v.state==='R'&&Number.isSafeInteger(v.pid)&&v.pid>0
    &&['parentPid','group','session','uid','gid','ruid','rgid','svuid','svgid'].every(k=>Number.isSafeInteger(v[k])&&v[k]>=0)
    &&typeof v.start==='string'&&/^\d+:\d+$/u.test(v.start)
    &&typeof v.executable==='string'&&isAbsolute(v.executable)&&typeof v.cwd==='string'&&isAbsolute(v.cwd)
    &&Array.isArray(v.argv)&&v.argv.length>0&&v.argv.every(x=>typeof x==='string'&&!x.includes('\0'))
    &&v.argvSha256===argvDigest(v.argv)&&typeof v.bootSha256==='string'&&/^[a-f0-9]{64}$/u.test(v.bootSha256);
  return valid(a)&&valid(b)
    &&['pid','parentPid','start','group','session','uid','gid','ruid','rgid','svuid','svgid','executable','argvSha256','bootSha256','cwd'].every(k=>a[k]===b[k]);
}
export function assertDarwinInheritedRequesterSocket(fd){
  if(!Number.isInteger(fd)||fd<3||fd>31)throw fault('darwin-observer-fd-invalid');
  if(run(['inherited-fd'],fd)!=='{"nonblockingStream":true}\n')throw fault('darwin-observer-fd-unavailable');
}
export function listNativeDarwinProcessGroup(group){
  if(!Number.isSafeInteger(group)||group<1||group>2147483647)throw fault('darwin-observer-group-invalid');
  const rows=JSON.parse(run(['group',String(group)]));
  if(!Array.isArray(rows)||rows.length>=16384||new Set(rows).size!==rows.length||rows.some(pid=>!Number.isSafeInteger(pid)||pid<1||pid>2147483647))throw fault('darwin-observer-output-invalid');
  return rows;
}
/** execve does not emit Node's exit event; the owned worker releases explicitly. */
export function releaseDarwinNativeProcessObserver(){
  if(process.platform!=='darwin'||helper===null)return;
  const owned=helper;privateImage(owned.path,owned.sha256);
  rmSync(owned.directory,{recursive:true,force:true});helper=null;
}
