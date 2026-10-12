import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function image(path) {
  const stat=fs.lstatSync(path);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1);
  return {path,sha256:hash(fs.readFileSync(path)),dev:stat.dev,ino:stat.ino,mode:stat.mode,uid:stat.uid,gid:stat.gid,nlink:stat.nlink,size:stat.size};
}
function inventory(root,exclude=()=>false) {
  const files=[];let count=0;
  function walk(path,depth=0) {
    assert(depth<=12);const stat=fs.lstatSync(path);assert(!stat.isSymbolicLink());
    if(stat.isDirectory())for(const name of fs.readdirSync(path)){assert(++count<=8192);walk(join(path,name),depth+1);}
    else if(!exclude(path)){assert(stat.size<=1048576);files.push(image(path));}
  }
  walk(root);return files;
}
function conserve(rows) {for(const row of rows)assert.deepEqual(image(row.path),row,'original protected physical record conserved');}

export async function sweepPhysicalMethodCases({fixtureRoot,sourceRoot}) {
  assert.equal(resolve(sourceRoot),resolve(fixtureRoot,'../../../..'));
  const owner=await import(pathToFileURL(join(fixtureRoot,'state-owner.fixture.mjs')));
  const hgo=await import(pathToFileURL(join(sourceRoot,'plugins/pipeline-core/lib/human-guard-override.mjs')));
  const registry=await import(pathToFileURL(join(sourceRoot,'plugins/pipeline-core/lib/session-authority-registry.mjs')));
  async function setup(count) {
    const f=owner.staged.makeFixture('signature',{stage:'initialized'});
    const pluginRoot=join(sourceRoot,'plugins/pipeline-core'),scriptPath=join(pluginRoot,'scripts/guard-human-override.mjs');
    const records=[];
    for(let index=0;index<count;index++) {
      const record=hgo.recordHumanGuardDenial({rootDir:f.dir,pluginRoot,scriptPath,toolName:'Write',
        toolInput:{file_path:`physical-method-${count}-${index}.md`,content:`Disposable METHOD ${index}\n`},
        denials:[{guard:'guard-lifecycle-ready.mjs',reason:'GUARD-DEVPLAN-SHELL'}],nowMs:1000,ttlMs:86400000});
      assert.equal(record.status,'planned');assert.match(record.requestSha256,/^[a-f0-9]{64}$/);records.push(record);
    }
    await owner.bindActualStateOwner(f);
    const root=join(f.repository.commonDir,'agent-pipeline','human-guard-overrides');
    const requests=records.map(record=>image(join(root,'requests',record.requestSha256+'.json')));
    assert.equal(new Set(requests.map(row=>row.path)).size,count);
    for(const row of requests)assert(Date.parse(JSON.parse(fs.readFileSync(row.path)).expiresAt)<Date.now());
    return {f,root,requests,sweep:()=>f.runtime.run(()=>hgo.sweepHumanGuardOverrideRequests({rootDir:f.dir}))};
  }
  return [
    {id:'SDF001',scope:'isolated-METHOD-real-partial-unlink-EBADF',async run(){
      const x=await setup(2),authority=join(x.f.repository.commonDir,'agent-pipeline','session-authority');
      const protectedRows=[...inventory(x.root,path=>x.requests.some(row=>row.path===path)),...inventory(authority)];
      const auditBefore=fs.readFileSync(join(x.root,'audit.jsonl'));
      const originals=Object.fromEntries(['openSync','readSync','closeSync','unlinkSync'].map(name=>[name,fs[name]]));
      const descriptors=new Map();let removed=null,reached=0,observedError=null,openedFlags=null,faultRequest=null;
      fs.unlinkSync=function(path,...args) {
        if(typeof path!=='string'||!path.startsWith(join(x.root,'requests','.sweep-'))||!path.endsWith('/request.json'))return originals.unlinkSync(path,...args);
        const stat=fs.lstatSync(path),request=x.requests.find(row=>row.dev===stat.dev&&row.ino===stat.ino);
        const result=originals.unlinkSync(path,...args);
        if(request){assert.equal(removed,null,'only the first request may physically disappear');assert(!fs.existsSync(path));removed=request;}
        return result;
      };
      fs.openSync=function(path,flags,...args) {
        const fd=originals.openSync(path,flags,...args);
        if(removed&&reached===0&&typeof flags==='number'&&(flags&(fs.constants.O_WRONLY|fs.constants.O_RDWR))===0) {
          const request=x.requests.find(row=>row.path===path&&row!==removed);
          if(request){const stat=fs.fstatSync(fd);assert.equal(stat.dev,request.dev);assert.equal(stat.ino,request.ino);descriptors.set(fd,request);openedFlags=flags;}
        }
        return fd;
      };
      fs.readSync=function(fd,...args) {
        if(descriptors.has(fd)&&reached===0) {
          faultRequest=descriptors.get(fd);assert(removed);assert(!fs.existsSync(removed.path));reached++;
          originals.closeSync(fd);
          try{return originals.readSync(fd,...args);}catch(error){observedError=error.code;throw error;}
        }
        return originals.readSync(fd,...args);
      };
      fs.closeSync=function(fd){try{return originals.closeSync(fd);}finally{descriptors.delete(fd);}};
      syncBuiltinESMExports();let thrown=null,result;
      try{result=x.sweep();}catch(error){thrown=error;}
      finally{for(const [name,value]of Object.entries(originals))fs[name]=value;syncBuiltinESMExports();}
      assert.equal(reached,1);assert.equal(observedError,'EBADF');assert.equal(typeof openedFlags,'number');
      assert.equal(result,undefined);assert.equal(thrown?.name,'HumanGuardOverrideError');assert.equal(thrown?.code,'HGO-SWEEP-CAS');
      assert(!fs.existsSync(removed.path));assert.deepEqual(image(faultRequest.path),faultRequest);
      conserve(protectedRows);assert.deepEqual(fs.readFileSync(join(x.root,'audit.jsonl')),auditBefore);
      assert.equal(hgo.verifyHumanGuardOverrideAudit({rootDir:x.f.dir}).status,'valid');
      let admissionError=null;
      try{x.f.runtime.run(()=>registry.withSessionAuthorityBoundary({repository:x.f.repository},boundary=>
        registry.inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:x.f.ports.find(row=>row.producerId==='human-guard-override').port})));}
      catch(error){admissionError=error;}
      assert.equal(admissionError?.name,'SessionAuthorityError');
      assert(['SDC-AUTHORITY-CAS','SDC-AUTHORITY-UNAVAILABLE'].includes(admissionError?.code),'genuine subsequent admission must fail closed');
      conserve(protectedRows);assert(!fs.existsSync(removed.path));assert.deepEqual(image(faultRequest.path),faultRequest);
    }},
    {id:'SDF002',scope:'actual-61-per-operation-budget',async run(){
      const x=await setup(62),auditBefore=fs.readFileSync(join(x.root,'audit.jsonl'));
      const preserved=inventory(x.root,path=>x.requests.some(row=>row.path===path)||['audit.jsonl','audit.head.json'].some(name=>path===join(x.root,name)));
      const result=x.sweep();assert.equal(result.status,'swept');assert.equal(result.removed,61);
      assert.equal(result.retained,1);assert.equal(result.remainingEligible,1);
      const retained=x.requests.filter(row=>fs.existsSync(row.path));assert.equal(retained.length,1);assert.deepEqual(image(retained[0].path),retained[0]);
      conserve(preserved);const audit=fs.readFileSync(join(x.root,'audit.jsonl'));
      assert.deepEqual(audit.subarray(0,auditBefore.length),auditBefore);
      assert.equal(hgo.verifyHumanGuardOverrideAudit({rootDir:x.f.dir}).status,'valid');
    }}
  ];
}
