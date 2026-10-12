import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFileSync,readdirSync,lstatSync,writeFileSync,existsSync} from 'node:fs';
import {createHash,verify} from 'node:crypto';
import {createSigningMethodFixture} from './signing-method.fixture.mjs';

export function signingMethodCases(configuration) {
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  function material(fixture) {
    const root=join(fixture.f.dir,'scratch');
    const records=readdirSync(root).filter(name=>name.startsWith('review-')&&name.endsWith('.json')).map(name=>{
      const path=join(root,name),bytes=readFileSync(path);return {path,bytes,record:JSON.parse(bytes)};
    }).filter(row=>row.record.schema==='pipeline.po-signing-review-material.v1'&&row.record.intentSha256===fixture.transport.intentSha256);
    assert.equal(records.length,1,'exact actual request-bound review material');return records[0];
  }
  function capture(action,onDisclosure=()=>{}) {
    const original=process.stdout.write;let output='';
    process.stdout.write=function(chunk,...args){output+=String(chunk);onDisclosure(String(chunk));return true;};
    try{return {result:action(),output};}finally{process.stdout.write=original;}
  }
  return [
    {id:'SDR001',scope:'controlled-encrypted-METHOD-signing-material',async run(){
      const fixture=await createSigningMethodFixture(configuration),request=fixture.readRequest();
      const {result,output}=capture(()=>fixture.run());
      assert.equal(result.ok,true);assert.equal(result.code,'PO-HUMAN-SIGN-INTENT-READY');
      assert.equal(fixture.signingSpawns(),1,'real disposable encrypted signing once');
      assert.equal(result.intentSha256,fixture.transport.intentSha256);
      const proof=JSON.parse(readFileSync(result.paths.proof));
      assert.equal(proof.intentSha256,fixture.transport.intentSha256);
      assert(verify(null,Buffer.from(proof.intentSha256),fixture.publicKey,Buffer.from(proof.signatureBase64,'base64')),'actual signature verifies exact original intent');
      const full=material(fixture),info=lstatSync(full.path);
      assert.equal(info.nlink,1);assert.equal(info.mode&0o777,0o600);
      assert.equal(full.record.request.sha256,sha(request));assert.deepEqual(full.record.request.record,fixture.transport);
      assert(Array.isArray(full.record.fullDisclosureLines));assert(full.record.fullDisclosureLines.length>0);
      assert(output.includes(sha(full.bytes)),'prompt names actual full-material byte digest');
      assert(output.trimEnd().split('\n').length<=25,'actual protected-key disclosure frame stays bounded');
      assert.deepEqual(fixture.readRequest(),request,'signing cannot rewrite request');
    }},
    {id:'SDR002',scope:'controlled-readiness-first-no-owner-request-read',async run(){
      const fixture=await createSigningMethodFixture(configuration);
      writeFileSync(join(fixture.keys,'po-public.pem'),'METHOD public key mismatch\n',{mode:0o600});
      let requestReads=0,privateReads=0;
      fixture.dependencies.readFile=(path,...args)=>{
        if(path===join(fixture.f.dir,fixture.request))requestReads++;
        if(path===join(fixture.keys,'po-private.pem'))privateReads++;
        return readFileSync(path,...args);
      };
      assert.throws(()=>fixture.run(),error=>Array.isArray(error.findings)&&error.findings.some(finding=>finding.findingId==='trust-anchor-match'&&finding.status!=='ok'));
      assert.equal(requestReads,0,'actual anchor failure precedes scratch request/describer');
      assert.equal(privateReads,0,'unmatched public anchor cannot open private key');assert.equal(fixture.signingSpawns(),0);
      assert.equal(readdirSync(join(fixture.f.dir,'scratch')).filter(name=>name.startsWith('review-')).length,0,'no material publication before readiness');
    }},
    {id:'SDR003',scope:'controlled-late-material-CAS-before-signing',async run(){
      const fixture=await createSigningMethodFixture(configuration);let changed=false;
      assert.throws(()=>capture(()=>fixture.run(),()=>{
        if(changed)return;const full=material(fixture);changed=true;
        writeFileSync(full.path,Buffer.concat([full.bytes,Buffer.from(' ')]),{mode:0o600});
      }),error=>typeof error.message==='string'&&error.message.includes('PO-SIGN-REVIEW-DRIFT'));
      assert(changed,'actual disclosure reached before exact owned material tamper');
      assert.equal(fixture.signingSpawns(),0,'late material drift refuses before private signing child');
      assert(!existsSync(join(fixture.keys,`proof-${fixture.transport.intentSha256}.json`)),'no proof published on drift');
    }}
  ];
}
