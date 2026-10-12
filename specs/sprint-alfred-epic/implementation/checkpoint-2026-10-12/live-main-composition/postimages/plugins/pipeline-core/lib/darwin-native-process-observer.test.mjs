// SPDX-License-Identifier: SUL-1.0
import {registerTestCaseCompletion} from './test-case-completion.mjs';
const cases=[];
function test(name,options,run){
  if(typeof options==='function'){run=options;options={};}
  cases.push({id:'DNO'+String(cases.length+1).padStart(3,'0'),name,mode:options.skip?'skip':'run',run});
}
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {realpathSync} from 'node:fs';
import {once} from 'node:events';
import {observeNativeDarwinProcess,parseDarwinNativeProcessOutput,sameNativeDarwinProcess,assertDarwinInheritedRequesterSocket} from './darwin-native-process-observer.mjs';
const hex=v=>Buffer.from(v).toString('hex');
function row(argv=['/native/node','/native/requester.mjs','space arg','', 'é']){
  const count=Buffer.alloc(4);count.writeInt32LE(argv.length);
  return {pid:42,parentPid:41,group:40,session:40,uid:501,gid:20,ruid:501,rgid:20,svuid:501,svgid:20,
    start:'1720000000:1234',boot:'12345678-1234-1234-1234-123456789ABC',executableHex:hex('/native/node'),cwdHex:hex('/repo'),
    procargsHex:Buffer.concat([count,Buffer.from('/native/node\0\0\0'+argv.join('\0')+'\0')]).toString('hex')};
}
const parse=v=>parseDarwinNativeProcessOutput(JSON.stringify(v)+'\n',42);
test('data parser preserves argument boundaries and rejects truncation, trailing environment, malformed identity',()=>{
  const v=row(),p=parse(v);assert.deepEqual(p.argv,['/native/node','/native/requester.mjs','space arg','','é']);
  assert.equal(p.cwd,'/repo');assert.equal(p.start,'1720000000:1234');
  assert.equal(parse(row(Array.from({length:200},(_,i)=>'arg'+i))).argv.length,200);
  for(const bad of [{...v,pid:43},{...v,boot:'caller-platform-true'},{...v,start:'bad'},
    {...v,executableHex:'ff'},{...v,cwdHex:hex('relative')},{...v,procargsHex:v.procargsHex.slice(0,-2)},
    {...v,procargsHex:v.procargsHex+hex('SECRET=value\0')},{...v,extra:true}])assert.throws(()=>parse(bad));
  assert.throws(()=>parseDarwinNativeProcessOutput(JSON.stringify(v).replace('"pid":42','"pid":9,"pid":42')+'\n',42));
});
test('equality checks start, parent, principal, boot, executable, argv and cwd independently',()=>{
  const p=parse(row());assert.equal(sameNativeDarwinProcess(p,{...p}),true);
  for(const key of ['pid','parentPid','group','session','uid','gid','ruid','rgid','svuid','svgid','start','bootSha256','executable','cwd','argvSha256']){
    const value=typeof p[key]==='number'?p[key]+1:p[key]+'changed';assert.equal(sameNativeDarwinProcess(p,{...p,[key]:value}),false,key);
  }
  assert.equal(sameNativeDarwinProcess({platform:'darwin'},{platform:'darwin'}),false);
  assert.equal(sameNativeDarwinProcess(p,{...p,argv:['forged']}),false);
});
test('foreign host cannot issue native facts or accept caller JSON/platform flags', {skip:process.platform==='darwin'},()=>{
  assert.deepEqual(observeNativeDarwinProcess({pid:process.pid,platform:'darwin',process:parse(row())}),{status:'unavailable',code:'darwin-observer-platform-unavailable'});
  assert.throws(()=>assertDarwinInheritedRequesterSocket(4),{code:'darwin-observer-platform-unavailable'});
});
test('live Darwin kernel observes own identity and native child argv/cwd/parent; descriptor probe is bounded', {skip:process.platform!=='darwin'},async()=>{
  const own=observeNativeDarwinProcess({pid:process.pid});
  assert.equal(own.status,'present',JSON.stringify(own));assert.equal(own.process.executable,realpathSync(process.execPath));
  assert.equal(own.process.cwd,realpathSync(process.cwd()));assert.equal(own.process.uid,process.getuid());
  assert.equal(own.process.parentPid,process.ppid);assert.equal(sameNativeDarwinProcess(own.process,observeNativeDarwinProcess({pid:process.pid}).process),true);
  const child=spawn(process.execPath,['-e','setTimeout(()=>{},30000)','space arg',''],{stdio:['ignore','ignore','ignore','ignore','pipe'],cwd:process.cwd()});
  try{await once(child,'spawn');const result=observeNativeDarwinProcess({pid:child.pid});assert.equal(result.status,'present',JSON.stringify(result));
    assert.equal(result.process.parentPid,process.pid);assert.equal(result.process.cwd,own.process.cwd);
    assert.deepEqual(result.process.argv.slice(-2),['space arg','']);
    // The helper checks the duplicated kernel descriptor, never a supplied flag.
    assertDarwinInheritedRequesterSocket(child.stdio[4]._handle.fd);
  }finally{child.kill('SIGTERM');await once(child,'exit');}
  assert.notEqual(observeNativeDarwinProcess({pid:child.pid}).status,'present');
  assert.throws(()=>assertDarwinInheritedRequesterSocket(1),{code:'darwin-observer-fd-invalid'});
});

registerTestCaseCompletion({fd:3,maxBytes:16384,cases});
