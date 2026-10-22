// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,randomBytes} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

// Root-only controlled METHOD fixture: actual encrypted disposable key and real
// OpenSSL signing. isTTY is the existing METHOD dependency seam, not a Human or
// OS-terminal attestation. No real key, HOME override, or policy waiver is used.
export async function createSigningMethodFixture({fixtureRoot,sourceRoot}) {
  assert.equal(resolve(sourceRoot),resolve(fixtureRoot,'../../../..'));
  const owner=await import(pathToFileURL(join(fixtureRoot,'state-owner.fixture.mjs')));
  const hgo=await import(pathToFileURL(join(sourceRoot,'plugins/pipeline-core/lib/human-guard-override.mjs')));
  const cli=await import(pathToFileURL(join(sourceRoot,'plugins/pipeline-core/scripts/guard-human-override.mjs')));
  const po=await import(pathToFileURL(join(sourceRoot,'plugins/pipeline-core/scripts/po-human-approval.mjs')));
  const f=owner.staged.makeFixture('signature',{stage:'initialized'});
  const keys=mkdtempSync(join(process.cwd(),'method-signing-keys-'));
  const passphrase=randomBytes(32).toString('hex');
  const pair=generateKeyPairSync('ed25519',{privateKeyEncoding:{type:'pkcs8',format:'pem',cipher:'aes-256-cbc',passphrase},publicKeyEncoding:{type:'spki',format:'pem'}});
  const keyReference='disposable-controlled-method-signing';
  const publicKeySha256=createHash('sha256').update(pair.publicKey).digest('hex');
  const privateKey=join(keys,'po-private.pem');
  writeFileSync(privateKey,pair.privateKey,{flag:'wx',mode:0o600});
  writeFileSync(join(keys,'po-public.pem'),pair.publicKey,{flag:'wx',mode:0o600});
  writeFileSync(join(keys,'trust-policy.json'),JSON.stringify({keyReference,publicKeySha256,humanName:'Synthetic METHOD fixture; no Human authority'})+'\n',{flag:'wx',mode:0o600});
  owner.staged.writeJson(f,'project/critical-human-proof.json',{schema:'pipeline.critical-human-proof-policy.v3',requiredKinds:['push'],waivedKinds:[],trustAnchors:[{keyReference,publicKeySha256}]});
  owner.staged.git(f,'add','--','project/critical-human-proof.json');
  owner.staged.git(f,'commit','-q','-m','test: bind disposable METHOD public anchor');
  const pluginRoot=join(sourceRoot,'plugins/pipeline-core'),scriptPath=join(pluginRoot,'scripts/guard-human-override.mjs');
  const denied=hgo.recordHumanGuardDenial({rootDir:f.dir,pluginRoot,scriptPath,toolName:'Write',toolInput:{file_path:'method-signing-target.md',content:'METHOD input\n'},denials:[{guard:'guard-lifecycle-ready.mjs',reason:'GUARD-DEVPLAN-SHELL'}]});
  assert.equal(denied.status,'planned');
  const plan=hgo.planHumanGuardOverride({rootDir:f.dir,pluginRoot,scriptPath,requestSha256:denied.requestSha256});
  let emitted='',errors='';
  assert.equal(cli.main(['emit-signature-digest','--repo',f.dir,'--request-sha256',denied.requestSha256,'--plan-sha256',plan.planSha256],{write:value=>{emitted+=value;},writeError:value=>{errors+=value;}}),0);
  assert.equal(errors,'');const transport=JSON.parse(emitted);
  const request='scratch/method-signing-request.json';
  owner.staged.write(f,request,emitted);
  await owner.bindActualStateOwner(f);
  let signingSpawns=0;
  const probeTemporaryBase=process.cwd(),dependencies={isTTY:true,tmpdirFn:()=>probeTemporaryBase,homedirFn:()=>keys,stderrWriteFn:()=>{},spawn:(executable,args,options)=>{
    // Only the actual disposable key's genuine OpenSSL signing receives its
    // synthetic passphrase. Toolchain probes and every other child stay exact.
    if(executable==='openssl'&&args[0]==='pkeyutl'&&args.includes('-sign')&&args[args.indexOf('-inkey')+1]===privateKey) {
      signingSpawns++;
      return spawnSync(executable,[...args,'-passin',`pass:${passphrase}`],options);
    }
    return spawnSync(executable,args,options);
  }};
  return {f,transport,request,keys,publicKey:pair.publicKey,dependencies,
    signingSpawns:()=>signingSpawns,
    run:()=>f.runtime.run(()=>po.runHumanApproval(['sign-intent','--repo-root',f.dir,'--directory',keys,'--request',request],dependencies)),
    readRequest:()=>readFileSync(join(f.dir,request))};
}
