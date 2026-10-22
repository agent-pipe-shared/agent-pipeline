// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Synthetic METHOD signatures verified by the genuine authorization producer.
// Historical clock inputs are original writer API inputs, not stored JSON edits.
export async function createSweepAuthorityFixture({fixtureRoot,sourceRoot,course}) {
  assert(['armed-current','consumed-current','consumed-before-bind'].includes(course));
  assert.equal(resolve(sourceRoot),resolve(fixtureRoot,'../../../..'));
  const owner=await import(pathToFileURL(join(fixtureRoot,'state-owner.fixture.mjs')));
  const hgo=await import(pathToFileURL(join(sourceRoot,'plugins/pipeline-core/lib/human-guard-override.mjs')));
  const f=owner.staged.makeFixture('signature',{stage:'initialized'});
  const pair=generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({type:'spki',format:'pem'});
  const keyReference='disposable-sweep-METHOD-key';
  owner.staged.writeJson(f,'project/critical-human-proof.json',{schema:'pipeline.critical-human-proof-policy.v3',requiredKinds:['push'],waivedKinds:[],trustAnchors:[{keyReference,publicKeySha256:createHash('sha256').update(publicKey).digest('hex')}]});
  owner.staged.git(f,'add','--','project/critical-human-proof.json');
  owner.staged.git(f,'commit','-q','-m','test: bind disposable sweep METHOD public anchor');
  const pluginRoot=join(sourceRoot,'plugins/pipeline-core'),scriptPath=join(pluginRoot,'scripts/guard-human-override.mjs');
  const toolName='Write',toolInput={file_path:'method-authority-sweep-target.md',content:'Disposable METHOD operation\n'};
  const denials=[{guard:'guard-lifecycle-ready.mjs',reason:'GUARD-DEVPLAN-SHELL'}];
  // An unexpired consumed-before-bind case proves consumption eligibility rather
  // than merely expiry. The two current-owner cases are expired at sweep time.
  const nowMs=course==='consumed-before-bind'?Date.now():1000;
  const shared={rootDir:f.dir,pluginRoot,scriptPath};
  const denied=hgo.recordHumanGuardDenial({...shared,toolName,toolInput,denials,nowMs,ttlMs:86400000});
  assert.equal(denied.status,'planned');
  const planned=hgo.planHumanGuardOverride({...shared,requestSha256:denied.requestSha256,nowMs:nowMs+1});
  const prepared=hgo.prepareHumanGuardOverrideAuthorization({...shared,requestSha256:denied.requestSha256,planSha256:planned.planSha256,reason:hgo.HGO_SIGNATURE_REASON,nowMs:nowMs+2});
  const intent=hgo.buildHumanGuardOverrideSignatureIntent({prepared,planned});
  const proof={schema:'pipeline.po-approval-proof.v1',intentSha256:intent.sha256,keyReference,publicKey,signatureBase64:sign(null,Buffer.from(intent.sha256),pair.privateKey).toString('base64')};
  const authorize=()=>hgo.authorizeHumanGuardOverrideBySignature({...shared,requestSha256:denied.requestSha256,planSha256:planned.planSha256,proof,nowMs:nowMs+3});
  const consume=()=>hgo.consumeHumanGuardOverride({...shared,toolName,toolInput,denials,nowMs:nowMs+4});
  let authorization,consumption=null;
  if(course==='consumed-before-bind') {
    authorization=authorize();assert.equal(authorization.status,'armed');
    consumption=consume();assert.equal(consumption.status,'consumed');
    await owner.bindActualStateOwner(f);
  } else {
    await owner.bindActualStateOwner(f);
    authorization=f.runtime.run(authorize);assert.equal(authorization.status,'armed');
    if(course==='consumed-current') {consumption=f.runtime.run(consume);assert.equal(consumption.status,'consumed');}
  }
  return {f,hgo,shared,course,denied,planned,authorization,consumption,
    sweep:()=>f.runtime.run(()=>hgo.sweepHumanGuardOverrideRequests({rootDir:f.dir}))};
}
