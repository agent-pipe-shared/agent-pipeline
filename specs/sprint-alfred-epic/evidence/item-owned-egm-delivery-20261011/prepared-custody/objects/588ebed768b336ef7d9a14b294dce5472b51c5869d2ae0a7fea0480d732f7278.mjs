// SPDX-License-Identifier: SUL-1.0
// Native read-only process facts. No invocation/requester brand or authority is issued.
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {lstatSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {isAbsolute,resolve} from 'node:path';
import {WINDOWS_POWERSHELL_PATHS,sanitizeChildEnvironment} from './windows-private-state.mjs';
import {readWindowsAuthoritySourceModule,observeWindowsAuthorityAncestor} from './windows-owned-authority-backend.mjs';
import {isSuccessfulSpawn} from './successful-spawn.mjs';
import {parseStrictJson} from './governance-event.mjs';
import {performance} from 'node:perf_hooks';

const HELPER_SHA256='6c55d97eba1c18ef37befab1c6e6052301f8ecc0b90d1521a49e158a49fc4d40';
const HELPER=fileURLToPath(new URL('./windows-native-process-observer.ps1',import.meta.url));
const SHA=/^[a-f0-9]{64}$/u,SID=/^S-1-(?:[0-9]+-){1,14}[0-9]+$/u,TICKS=/^[1-9][0-9]{0,18}$/u;
const nativeKeys=['status','pid','parentPid','start','parentStart','sessionId','principalSid','parentPrincipalSid','executable','executableSha256','executableFactsSha256','argv','commandLineSha256','bootIdentity'];
const processKeys=[...nativeKeys.filter(key=>key!=='status'),'platform','argvSha256','cwd'];
const digest=value=>createHash('sha256').update(value).digest('hex');
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const unavailable=reason=>Object.freeze({status:'unavailable',reason});
const pid=value=>Number.isSafeInteger(value)&&value>=1&&value<=2147483647;
const sha=value=>typeof value==='string'&&SHA.test(value);
const ticks=value=>typeof value==='string'&&TICKS.test(value)&&BigInt(value)<=3155378975999999999n;
const sid=value=>typeof value==='string'&&value.length<=184&&SID.test(value);
const path=value=>typeof value==='string'&&value.length<=32768&&isAbsolute(value)&&resolve(value)===value&&!value.startsWith('\\\\')&&!/[\u0000-\u001f]/u.test(value)&&!value.slice(2).includes(':');
function validNative(value){
 return exact(value,nativeKeys)&&value.status==='present'&&pid(value.pid)&&pid(value.parentPid)&&value.pid!==value.parentPid
  &&ticks(value.start)&&ticks(value.parentStart)&&BigInt(value.parentStart)<=BigInt(value.start)
  &&Number.isSafeInteger(value.sessionId)&&value.sessionId>=0&&value.sessionId<=4294967295
  &&sid(value.principalSid)&&sid(value.parentPrincipalSid)&&path(value.executable)
  &&sha(value.executableSha256)&&sha(value.executableFactsSha256)&&sha(value.commandLineSha256)
  &&typeof value.bootIdentity==='string'&&value.bootIdentity.startsWith('win32-boot-')&&ticks(value.bootIdentity.slice(11))
  &&BigInt(value.bootIdentity.slice(11))<=BigInt(value.parentStart)
  &&Array.isArray(value.argv)&&value.argv.length>=1&&value.argv.length<=256
  &&value.argv.every(arg=>typeof arg==='string'&&arg.length<=32768&&!arg.includes('\0'))
  &&Buffer.byteLength(JSON.stringify(value.argv),'utf8')<=196608;
}
function observerTimeout(options) {
 if(options?.deadlineMs===undefined)return 15000;
 const remaining=Math.floor(options.deadlineMs-performance.now());
 if(!Number.isFinite(options.deadlineMs)||remaining<1)throw new Error('WPO-DEADLINE');
 return Math.min(15000,remaining);
}
function currentCwd(options){
 const named=process.cwd(),resolved=realpathSync(named),stat=lstatSync(named);
 if(!path(resolved)||!stat.isDirectory()||stat.isSymbolicLink()||resolved.toLowerCase()!==named.toLowerCase())throw new Error('WPO-CWD-CUSTODY');
 const native=observeWindowsAuthorityAncestor({path:resolved},options);
 return {path:resolved,dev:stat.dev,ino:stat.ino,facts:native.nativeFacts,hash:native.nativeFactsSha256};
}
function sameCwd(a,b){return a.path===b.path&&a.dev===b.dev&&a.ino===b.ino&&a.facts===b.facts&&a.hash===b.hash;}

/** No injectable runner/platform/record can assert native observations. */
export function observeNativeWindowsProcess(input,options){
 try{observerTimeout(options);}catch{return unavailable("WPO-DEADLINE");}
 if(!exact(input,['pid'])||!pid(input.pid))return unavailable('WPO-INPUT');
 if(process.platform!=='win32')return unavailable('WPO-PLATFORM-UNAVAILABLE');
 try{
  const own=input.pid===process.pid,cwd=own?currentCwd(options):null;
  const source=readWindowsAuthoritySourceModule({path:HELPER,maxBytes:65536},options);
  if(digest(source.bytes)!==HELPER_SHA256)return unavailable('WPO-HELPER-CAS');
  let executable=null;
  for(const candidate of WINDOWS_POWERSHELL_PATHS){try{const stat=lstatSync(candidate);if(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink>=1&&realpathSync(candidate).toLowerCase()===candidate.toLowerCase()){executable=candidate;break;}}catch{/* fixed system locations only */}}
  if(executable===null)return unavailable('WPO-FIXED-POWERSHELL-UNAVAILABLE');
  const tool=lstatSync(executable);
  const child=spawnSync(executable,['-NoLogo','-NoProfile','-NonInteractive','-Command',source.bytes.toString('utf8')],{
   input:JSON.stringify(input),encoding:'utf8',timeout:observerTimeout(options),maxBuffer:262144,shell:false,windowsHide:true,
   env:sanitizeChildEnvironment(process.env),stdio:['pipe','pipe','pipe'],
  });
  observerTimeout(options);
  if(!isSuccessfulSpawn(child)||child.signal!=null||typeof child.stdout!=='string'||Buffer.byteLength(child.stdout,'utf8')>262144||child.stderr!=='')return unavailable('WPO-NATIVE-UNAVAILABLE');
  const afterSource=readWindowsAuthoritySourceModule({path:HELPER,maxBytes:65536},options),afterTool=lstatSync(executable);
  if(source.nativeFacts!==afterSource.nativeFacts||source.nativeFactsSha256!==afterSource.nativeFactsSha256||!source.bytes.equals(afterSource.bytes)
   ||['dev','ino','nlink','size','mtimeMs','ctimeMs'].some(key=>tool[key]!==afterTool[key]))return unavailable('WPO-HELPER-CAS');
  const value=parseStrictJson(child.stdout);
  if(exact(value,['status','reason'])&&value.status==='unavailable'&&typeof value.reason==='string'&&/^WPO-[A-Z-]{1,64}$/u.test(value.reason))return unavailable(value.reason);
  if(exact(value,['status','pid'])&&value.status==='absent'&&value.pid===input.pid)return Object.freeze(value);
  if(!validNative(value)||value.pid!==input.pid)return unavailable('WPO-NATIVE-OUTPUT');
  if(own&&!sameCwd(cwd,currentCwd(options)))return unavailable('WPO-CWD-CHANGED');
  const {status,...facts}=value;
  return Object.freeze({status:'present',process:Object.freeze({...facts,platform:'win32',argv:Object.freeze([...facts.argv]),
   argvSha256:digest(JSON.stringify(facts.argv)),cwd:cwd?.path??null})});
 }catch(error){return unavailable(error?.reason==='WIN-AUTH-DEADLINE'||error?.message==='WPO-DEADLINE'?'WPO-DEADLINE':'WPO-OBSERVATION-UNAVAILABLE');}
}

function validProcess(value){
 if(!exact(value,processKeys)||value.platform!=='win32'||!sha(value.argvSha256)||(value.cwd!==null&&!path(value.cwd)))return false;
 const {platform,argvSha256,cwd,...native}=value;
 return validNative({status:'present',...native})&&argvSha256===digest(JSON.stringify(native.argv));
}
/** Equality is observation only; it neither creates nor validates an authority handle. */
export function sameNativeWindowsProcess(expected,observed){
 if(!validProcess(expected)||!validProcess(observed))return false;
 return processKeys.filter(key=>key!=='argv').every(key=>expected[key]===observed[key])
  &&expected.argv.length===observed.argv.length&&expected.argv.every((arg,index)=>arg===observed.argv[index]);
}
