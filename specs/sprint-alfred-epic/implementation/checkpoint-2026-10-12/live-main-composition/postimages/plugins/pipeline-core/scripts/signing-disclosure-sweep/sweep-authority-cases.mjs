import assert from 'node:assert/strict';
import {readFileSync,readdirSync,lstatSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createSweepAuthorityFixture} from './sweep-authority.fixture.mjs';

export function sweepAuthorityCases(configuration) {
  const hash=b=>createHash('sha256').update(b).digest('hex');
  const base=f=>join(f.repository.commonDir,'agent-pipeline','human-guard-overrides');
  const request=x=>join(base(x.f),'requests',x.denied.requestSha256+'.json');
  function capture(x) {
    const root=base(x.f),files=[];let count=0;
    function walk(path,depth=0) {
      if(!existsSync(path))return;
      assert(depth<=8);const info=lstatSync(path);assert(!info.isSymbolicLink());
      if(info.isDirectory())for(const name of readdirSync(path)){assert(++count<=4096);walk(join(path,name),depth+1);}
      else {
        assert(info.isFile()&&info.nlink===1&&info.size<=1048576);
        files.push({path,sha256:hash(readFileSync(path)),dev:info.dev,ino:info.ino,mode:info.mode,nlink:info.nlink});
      }
    }
    for(const name of ['plans','capabilities','briefed-authorizations','authority-holds','audit.key'])walk(join(root,name));
    for(const name of ['members','releases'])walk(join(x.f.repository.commonDir,'agent-pipeline','session-authority',name));
    return {files,audit:readFileSync(join(root,'audit.jsonl'))};
  }
  function assertConserved(x,before,{append}) {
    for(const file of before.files) {
      const info=lstatSync(file.path);
      assert.equal(hash(readFileSync(file.path)),file.sha256,'original protected record bytes conserved');
      for(const key of ['dev','ino','mode','nlink'])assert.equal(info[key],file[key],'original protected physical record conserved');
    }
    const audit=readFileSync(join(base(x.f),'audit.jsonl'));
    if(append)assert.deepEqual(audit.subarray(0,before.audit.length),before.audit,'authenticated historical audit prefix conserved');
    else assert.deepEqual(audit,before.audit,'veto is read-only');
    assert.equal(x.hgo.verifyHumanGuardOverrideAudit({rootDir:x.f.dir}).status,'valid','genuine authenticated journal remains valid');
  }
  async function inspectMembers(x) {
    const registry=await import(pathToFileURL(join(configuration.sourceRoot,'plugins/pipeline-core/lib/session-authority-registry.mjs')));
    const producerPort=x.f.ports.find(row=>row.producerId==='human-guard-override').port;
    return x.f.runtime.run(()=>registry.withSessionAuthorityBoundary({repository:x.f.repository},boundary=>{
      const producer=registry.inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort});
      return producer.record.members.map(row=>registry.inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort,memberRef:row.memberRef}));
    }));
  }
  return [
    {id:'SDA001',scope:'actual-current-armed-expired-veto',async run(){
      const x=await createSweepAuthorityFixture({...configuration,course:'armed-current'});
      const capabilityPath=join(base(x.f),'capabilities',x.planned.planSha256+'.json');
      const cap=JSON.parse(readFileSync(capabilityPath));assert.equal(cap.status,'armed');
      assert(Date.parse(cap.expiresAt)<Date.now(),'expiry would otherwise permit removal');
      const members=await inspectMembers(x);assert(members.some(row=>row.record.phase==='armed'&&row.record.producerId==='human-guard-override'));
      const bytes=readFileSync(request(x)),before=capture(x),result=x.sweep();
      assert.equal(result.status,'absent');assert.equal(result.removed,0);
      assert.deepEqual(readFileSync(request(x)),bytes,'real armed request survives despite expiry');
      assertConserved(x,before,{append:false});
    }},
    {id:'SDA002',scope:'actual-released-history-hold-veto',async run(){
      const x=await createSweepAuthorityFixture({...configuration,course:'consumed-current'});
      const members=await inspectMembers(x),released=members.filter(row=>row.record.phase==='released'&&row.releaseRecord!==null);
      assert(released.length>0,'genuine owning consumption must publish a real release');
      const holdsRoot=join(base(x.f),'authority-holds'),holds=readdirSync(holdsRoot).map(name=>JSON.parse(readFileSync(join(holdsRoot,name))));
      assert(holds.some(hold=>released.some(row=>row.record.bindingSha256===hold.bindingSha256)&&hold.preimageRefs.some(ref=>ref.path===`.git/agent-pipeline/human-guard-overrides/requests/${x.denied.requestSha256}.json`)),'real released owner hold still names original request');
      const bytes=readFileSync(request(x)),before=capture(x),result=x.sweep();
      assert.equal(result.status,'absent');assert.equal(result.removed,0);
      assert.deepEqual(readFileSync(request(x)),bytes,'authenticated released history remains a veto');
      assertConserved(x,before,{append:false});
    }},
    {id:'SDA003',scope:'actual-authenticated-consumed-unexpired-cleanup',async run(){
      const x=await createSweepAuthorityFixture({...configuration,course:'consumed-before-bind'});
      const cap=JSON.parse(readFileSync(join(base(x.f),'capabilities',x.planned.planSha256+'.json')));
      assert.equal(cap.status,'consumed');assert(Date.parse(cap.expiresAt)>Date.now(),'positive cannot be explained by expiry');
      const holds=join(base(x.f),'authority-holds');assert(!existsSync(holds)||readdirSync(holds).length===0,'actual pre-bind producer course has no retained request hold');
      assert.equal(x.consumption.requestSha256,x.denied.requestSha256);
      const before=capture(x),result=x.sweep();
      assert.equal(result.status,'swept');assert.equal(result.removed,1);assert(!existsSync(request(x)));
      assertConserved(x,before,{append:true});
    }}
  ];
}
