// SPDX-License-Identifier: SUL-1.0
import {registerTestCaseCompletion} from './test-case-completion.mjs';
const cases=[];
function test(name,options,run){
  if(typeof options==='function'){run=options;options={};}
  cases.push({id:'NPO'+String(cases.length+1).padStart(3,'0'),name,mode:options.skip?'skip':'run',run});
}
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileFunction} from 'node:vm';
import {createHash} from 'node:crypto';
import {observeNativePlatformProcess,sameNativePlatformProcess,observeLinuxProcess,parseLinuxProcessStat,NATIVE_PLATFORM_OBSERVER_SCHEMA} from './native-platform-process-observer.mjs';
import {observeNativeWindowsProcess} from './windows-native-process-observer.mjs';
test('shared native adapter retains actual Linux observation and negative identity controls',{skip:process.platform!=='linux'},()=>{
  assert.equal(NATIVE_PLATFORM_OBSERVER_SCHEMA,'pipeline.native-platform-process-observer.v1');
  const current=observeNativePlatformProcess(process.pid),legacy=observeLinuxProcess(process.pid);
  assert.deepEqual(current,legacy);assert.equal(sameNativePlatformProcess(current,legacy),true);
  const argv=readFileSync('/proc/self/cmdline').toString('utf8').split('\0').filter(Boolean);
  assert.equal(current.argvSha256,createHash('sha256').update(JSON.stringify(argv,null,2)+'\n').digest('hex'));
  for(const key of ['pid','start','group','session','uid','executable','argvSha256','bootSha256'])assert.equal(sameNativePlatformProcess(current,{...legacy,[key]:typeof legacy[key]==='number'?legacy[key]+1:legacy[key]+'wrong'}),false,key);
  assert.throws(()=>observeLinuxProcess(-1),{code:'host-process-platform-unavailable'});
  assert.throws(()=>parseLinuxProcessStat('broken'),{code:'host-proc-stat-invalid'});
});
test('native Windows observer rejects JSON/native-platform claims on foreign hosts',{skip:process.platform==='win32'},()=>{
  assert.equal(observeNativeWindowsProcess({pid:process.pid}).status,'unavailable');
  assert.equal(observeNativeWindowsProcess({pid:process.pid,platform:'win32',native:true}).status,'unavailable');
});
test('live native shared observer selects actual Darwin kernel; Linux API stays Linux-only',{skip:process.platform!=='darwin'},()=>{
  const current=observeNativePlatformProcess(process.pid);assert.equal(current.platform,'darwin');
  assert.equal(sameNativePlatformProcess(current,observeNativePlatformProcess(process.pid)),true);
  assert.throws(()=>observeLinuxProcess(process.pid),{code:'host-process-platform-unavailable'});
});

// Portable branch tests execute the actual bridge function bodies. They are
// regression unit evidence only, never liveWindows or liveDarwin authority.
const source=readFileSync(new URL('./session-requester-bridge.mjs',import.meta.url),'utf8');
const between=(start,end)=>{const begin=source.indexOf(start),stop=source.indexOf(end,begin);assert.ok(begin>=0&&stop>begin);return source.slice(begin,stop);};
test('actual Windows program branch keeps executable/module/argv/cwd custody and rejects drift',()=>{
  const body=between('function osvProgram(actual){','\n/** Readonly original');
  const actual={platform:'win32',pid:31,executable:'/node',cwd:'/repo',argv:['/node','/bridge']};
  let fresh=structuredClone(actual),refs=0;
  const p={platform:'win32',pid:31,cwd:()=>'/repo',execPath:'/node',argv:['/node','/bridge']};
  const fail=code=>{throw Object.assign(Error(code),{code});};
  const fn=compileFunction(body+'\nreturn osvProgram;',['process','osvObservedProcess','osvSameProcess','realpathSync','osvPhysicalRef','osvFail','sameNativeDarwinProcess','isAbsolute','readFileSync','processArgvDigest'])
    (p,()=>fresh,(a,b)=>JSON.stringify(a)===JSON.stringify(b),x=>x,path=>{refs++;return {path};},fail,()=>false,x=>x.startsWith('/'),()=>{throw Error('unexpected POSIX read');},()=>{throw Error('unexpected POSIX hash');});
  assert.deepEqual(fn(actual),{executable:{path:'/node'},module:{path:'/bridge'},argv:['/node','/bridge'],cwd:'/repo'});assert.equal(refs,2);
  fresh={...actual,cwd:'/changed'};assert.throws(()=>fn(actual),{code:'OSV-INPUT-DRIFT'});
  fresh={...actual,argv:['/node','/unbound']};assert.throws(()=>fn(actual),{code:'OSV-INPUT-DRIFT'});
});
test('Darwin program bridge consumes observed argv/cwd and keeps prerequisite/drift failures closed',()=>{
  const body=between('function osvProgram(actual){','\n/** Readonly original');
  const actual={platform:'darwin',pid:31,executable:'/node',cwd:'/repo',argv:['/node','/bridge']};let fresh=structuredClone(actual);
  const p={platform:'darwin',pid:31,cwd:()=>'/repo',execPath:'/node',argv:['/node','/bridge']};
  const fail=code=>{throw Object.assign(Error(code),{code});};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const fn=compileFunction(body+'\nreturn osvProgram;',['process','osvObservedProcess','osvSameProcess','realpathSync','osvPhysicalRef','osvFail','sameNativeDarwinProcess','isAbsolute','readFileSync','processArgvDigest'])
    (p,()=>fresh,same,x=>x,path=>({path}),fail,same,x=>x.startsWith('/'),()=>{throw Error('unexpected /proc read');},()=>{throw Error('unexpected Linux hash');});
  assert.deepEqual(fn(actual),{executable:{path:'/node'},module:{path:'/bridge'},argv:['/node','/bridge'],cwd:'/repo'});
  fresh={...actual,cwd:'/changed'};assert.throws(()=>fn(actual),{code:'OSV-INPUT-DRIFT'});
  fresh=null;assert.throws(()=>fn(actual));
});

registerTestCaseCompletion({fd:3,maxBytes:16384,cases});
