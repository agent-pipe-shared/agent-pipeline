// SPDX-License-Identifier: SUL-1.0
/** Versioned native observer dispatch. Serialization does not issue authority. */
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {canonicalJson} from './codex-sandbox-compatibility.mjs';
import {observeNativeDarwinProcess,sameNativeDarwinProcess,listNativeDarwinProcessGroup} from './darwin-native-process-observer.mjs';
import {observeNativeWindowsProcess,sameNativeWindowsProcess} from './windows-native-process-observer.mjs';
const hostDigest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:canonicalJson(value)).digest('hex');
const hostFault=code=>Object.assign(new Error(code),{code});
export const NATIVE_PLATFORM_OBSERVER_SCHEMA='pipeline.native-platform-process-observer.v1';
export function parseLinuxProcessStat(text) {
  // comm can contain spaces and closing parentheses. Fields after its last
  // closing parenthesis start with field 3 (state); starttime is field 22.
  const end = text.lastIndexOf(')');
  const pid = Number(text.slice(0, text.indexOf(' ')));
  const fields = text.slice(end + 2).trim().split(/\s+/);
  if (end < 0 || !Number.isSafeInteger(pid) || pid < 1 || fields.length < 20
    || !/^\d+$/.test(fields[19])) throw hostFault('host-proc-stat-invalid');
  return { pid, state: fields[0], parentPid: Number(fields[1]), group: Number(fields[2]),
    session: Number(fields[3]), start: fields[19] };
}
export function observeLinuxProcess(pid) {
  if (process.platform !== 'linux' || !Number.isSafeInteger(pid) || pid < 1) throw hostFault('host-process-platform-unavailable');
  try {
    const before = parseLinuxProcessStat(readFileSync(`/proc/${pid}/stat`, 'utf8'));
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const uid = Number(/^Uid:\s+(\d+)/m.exec(status)?.[1]);
    const argv = readFileSync(`/proc/${pid}/cmdline`).toString('utf8').split('\0').filter(Boolean);
    const executable = realpathSync(`/proc/${pid}/exe`);
    const after = parseLinuxProcessStat(readFileSync(`/proc/${pid}/stat`, 'utf8'));
    if (before.start !== after.start || before.group !== after.group || before.session !== after.session
      || !Number.isSafeInteger(uid)) throw hostFault('host-process-identity-changed');
    return { ...after, uid, executable, argvSha256: hostDigest(argv),
      bootSha256: hostDigest(readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()) };
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ESRCH') return null;
    throw error;
  }
}
export function sameProcess(expected, observed) {
  return observed !== null && ['pid', 'start', 'group', 'session', 'uid', 'executable', 'argvSha256', 'bootSha256']
    .every(key => expected?.[key] === observed[key]) && !['Z', 'X'].includes(observed.state);
}

export function observeNativePlatformProcess(pid,options){
  if(process.platform==='linux')return observeLinuxProcess(pid);
  const result=process.platform==='darwin'?observeNativeDarwinProcess({pid},options):process.platform==='win32'?observeNativeWindowsProcess({pid},options):null;
  if(result?.status==='absent')return null;
  if(result?.status!=='present')throw hostFault(result?.code??result?.reason??'host-process-platform-unavailable');
  return result.process;
}
export function sameNativePlatformProcess(a,b){
  if(process.platform==='darwin')return sameNativeDarwinProcess(a,b);
  if(process.platform==='win32')return sameNativeWindowsProcess(a,b);
  return sameProcess(a,b);
}
export function listNativePlatformSession(launcher){
  if(process.platform!=='darwin')throw hostFault('host-native-process-tree-proof-unavailable');
  if(!sameNativeDarwinProcess(launcher,launcher))throw hostFault('host-session-ownership-unverified');
  const leader=observeNativePlatformProcess(launcher.pid);
  if(leader&&!sameNativeDarwinProcess(launcher,leader))throw hostFault('host-session-ownership-unverified');
  const members=[];
  const micros=start=>{const [s,u]=start.split(':');return BigInt(s)*1000000n+BigInt(u);};
  for(const pid of listNativeDarwinProcessGroup(launcher.group)){
    const observed=observeNativePlatformProcess(pid);if(!observed)continue;
    if(observed.session!==launcher.session||observed.group!==launcher.group)continue;
    if(observed.uid!==launcher.uid||observed.bootSha256!==launcher.bootSha256||micros(observed.start)<micros(launcher.start))throw hostFault('host-session-ownership-unverified');
    members.push(observed);
  }
  const after=observeNativePlatformProcess(launcher.pid);
  if(after&&!sameNativeDarwinProcess(launcher,after))throw hostFault('host-session-ownership-unverified');
  return members;
}
