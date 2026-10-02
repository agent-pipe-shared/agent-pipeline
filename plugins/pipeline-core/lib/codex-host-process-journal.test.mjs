// SPDX-License-Identifier: SUL-1.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {compileFunction} from 'node:vm';
import {createHash} from 'node:crypto';
import {canonicalJson} from './codex-sandbox-compatibility.mjs';
import {parseStrictJson} from './governance-event.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const proposed=fs.readFileSync(new URL('./codex-host-process-journal.mjs',import.meta.url),'utf8');
const reader=proposed.slice(proposed.indexOf('export function readHostJournal('),proposed.indexOf('export function createHostJournal(')).replace('export function','function');
assert.ok(reader.startsWith('function readHostJournal('));
function load(overrides={}) {
  const deps={...fs,dirname:undefined,join,parseStrictJson,canonicalJson,Buffer,
    process,names:new Set(['intent']),hostDigest:sha,
    hostFault:code=>Object.assign(Error(code),{code}),checkedHostDirectory:path=>{
      const stat=fs.lstatSync(path);
      if(resolve(path)!==path||fs.realpathSync(path)!==path||!stat.isDirectory()||stat.uid!==process.getuid()||(stat.mode&0o077)!==0)throw Error('unsafe fixture directory');
    },...overrides};
  return compileFunction(reader+'\nreturn readHostJournal;',Object.keys(deps))(...Object.values(deps));
}
function fixture(fn) {
  const root=fs.mkdtempSync(join(tmpdir(),'codex-journal-read-bounds-fixture-'));
  fs.chmodSync(root,0o700);
  const file=join(root,'intent.json');
  fs.writeFileSync(file,canonicalJson({schema:'controlled.fixture',value:'ü\r\n'}),{mode:0o600});
  try{return fn(root,file);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('exact prepared reader accepts real canonical private bytes',()=>fixture((root,file)=>{
  const actual=load()(root,'intent');assert.equal(actual.sha256,sha(fs.readFileSync(file)));
  assert.deepEqual(actual.value,parseStrictJson(fs.readFileSync(file)));
}));
test('actual oversized sparse journal refuses before allocation or descriptor read',()=>fixture((root,file)=>{
  fs.truncateSync(file,524289);let reads=0,allocs=0;
  const reader=load({readSync(){reads++;throw Error('unexpected read');},Buffer:{alloc(){allocs++;throw Error('unexpected alloc');}}});
  assert.throws(()=>reader(root,'intent'),{code:'host-journal-file-unsafe'});assert.equal(reads,0);assert.equal(allocs,0);
}));
test('racing growth is bounded to limit plus one and rejected',()=>fixture((root,file)=>{
  let reads=0,total=0,grown=false;
  const reader=load({fstatSync(fd,options){const stat=fs.fstatSync(fd,options);if(!grown){grown=true;fs.truncateSync(file,800000);}return stat;},
    readSync(fd,buffer,offset,length,position){reads++;assert.ok(buffer.length<=524289);const count=fs.readSync(fd,buffer,offset,length,position);total+=count;return count;}});
  assert.throws(()=>reader(root,'intent'),{code:'host-journal-file-unsafe'});assert.ok(reads>=1);assert.equal(total,524289);
}));
test('descriptor identity drift rejects before content read',()=>fixture(root=>{
  let reads=0;const reader=load({fstatSync(fd,options){const stat=fs.fstatSync(fd,options);return {...stat,ino:stat.ino+1n};},readSync(){reads++;return 0;}});
  assert.throws(()=>reader(root,'intent'),{code:'host-journal-file-changed'});assert.equal(reads,0);
}));
test('short descriptor content is rejected even with unchanged advertised stat',()=>fixture(root=>{
  const reader=load({readSync(){return 0;}});assert.throws(()=>reader(root,'intent'),{code:'host-journal-file-changed'});
}));
test('physical aliases, hardlinks and noncanonical JSON remain rejected',()=>fixture((root,file)=>{
  const reader=load();fs.unlinkSync(file);const target=join(root,'target');fs.writeFileSync(target,'{}',{mode:0o600});
  fs.symlinkSync(target,file);assert.throws(()=>reader(root,'intent'),{code:'host-journal-file-unsafe'});
  fs.unlinkSync(file);fs.linkSync(target,file);assert.throws(()=>reader(root,'intent'),{code:'host-journal-file-unsafe'});
  fs.unlinkSync(file);fs.writeFileSync(file,'{ "value": 1 }',{mode:0o600});assert.throws(()=>reader(root,'intent'),{code:'host-journal-noncanonical'});
}));
