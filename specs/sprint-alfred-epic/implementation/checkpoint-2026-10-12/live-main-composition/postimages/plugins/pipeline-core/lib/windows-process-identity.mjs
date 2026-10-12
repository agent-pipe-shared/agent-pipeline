// SPDX-License-Identifier: SUL-1.0
// Read-only native process identity. No PATH lookup, script interpolation or recovery authority.
import {spawnSync} from 'node:child_process';
import {lstatSync} from 'node:fs';
import {WINDOWS_POWERSHELL_PATHS,sanitizeChildEnvironment} from './windows-private-state.mjs';
import {isSuccessfulSpawn} from './successful-spawn.mjs';

const MAX_TICKS=3155378975999999999n;
const QUERY=[
  "$ErrorActionPreference='Stop'",
  "try{$n=[int]::Parse($env:PIPELINE_PROCESS_IDENTITY_PID,[Globalization.CultureInfo]::InvariantCulture);try{$p=[Diagnostics.Process]::GetProcessById($n)}catch [ArgumentException]{[Console]::Out.Write('ABSENT');exit 0};$t=$p.StartTime.ToUniversalTime().Ticks;[Console]::Out.Write('PRESENT:'+$t.ToString('0',[Globalization.CultureInfo]::InvariantCulture))}catch{exit 1}",
].join(';');
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const unavailable=reason=>({status:'unavailable',reason});

/** Controlled run/lstat seams only observe mechanics; they never attest an actual Windows host. */
export function observeWindowsProcessIdentity(input,options={}){
  if(!object(input)||Object.keys(input).length!==1||!Object.hasOwn(input,'pid')
    ||!Number.isSafeInteger(input.pid)||input.pid<1||input.pid>2147483647)return unavailable('invalid-input');
  if(!object(options)||Object.keys(options).some(key=>!['run','lstat','environment'].includes(key))
    ||(options.run!==undefined&&typeof options.run!=='function')
    ||(options.lstat!==undefined&&typeof options.lstat!=='function')
    ||(options.environment!==undefined&&!object(options.environment)))return unavailable('invalid-options');
  const run=options.run??spawnSync,lstat=options.lstat??lstatSync;
  let executable=null;
  for(const path of WINDOWS_POWERSHELL_PATHS){
    try{const info=lstat(path);if(info.isFile()&&!info.isSymbolicLink()){executable=path;break;}}
    catch{/* Only the existing fixed system locations may be considered. */}
  }
  if(executable===null)return unavailable('fixed-powershell-unavailable');
  let result;
  try{
    result=run(executable,['-NoLogo','-NoProfile','-NonInteractive','-Command',QUERY],{
      encoding:'utf8',timeout:5000,maxBuffer:128,shell:false,windowsHide:true,
      stdio:['ignore','pipe','pipe'],
      env:{...sanitizeChildEnvironment(options.environment??process.env),PIPELINE_PROCESS_IDENTITY_PID:String(input.pid)},
    });
  }catch{return unavailable('native-query-failed');}
  if(!isSuccessfulSpawn(result)||result.signal!=null)return unavailable('native-query-failed');
  if(typeof result.stdout!=='string'||Buffer.byteLength(result.stdout,'utf8')>128
    ||(result.stderr!==undefined&&result.stderr!==null&&result.stderr!==''))return unavailable('native-output-malformed');
  const text=result.stdout.replace(/\r?\n$/u,'');
  if(text==='ABSENT')return {status:'absent',pid:input.pid};
  const match=/^PRESENT:([1-9][0-9]{0,18})$/u.exec(text);
  if(match===null||BigInt(match[1])>MAX_TICKS)return unavailable('native-output-malformed');
  return {status:'present',pid:input.pid,processStart:`win32-${match[1]}`};
}
