// SPDX-License-Identifier: SUL-1.0
import '../scripts/g17-enrollment-fixture-isolation.mjs';
import { registerTestCaseCompletion } from './test-case-completion.mjs';
const cases = [];
function test(name, run) { cases.push({ id: 'G17P001', name, run(context) {
  if (process.platform !== 'linux' || !process.env.G17_PRIVATE_PARENT) {
    context.skip('G17 publication fixture requires supported Linux and an explicitly authorized short private parent; native qualification pending');
    return;
  }
  return run(context);
} }); }
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,rmSync,mkdtempSync,writeFileSync} from 'node:fs';
import {relative,sep,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {captureRepositoryFingerprint,canonicalJson,sha256} from '../scripts/codex-critic-host.mjs';
import {prepareSessionAuthorityRegistryFixture,nativeContractFixtureParent} from './test-item-approved-course-fixture.mjs';
import {createModelFamilyHostAuthorityLifecycle} from './model-family-host-store.mjs';
import {captureDomainAuthorityPublications,readDomainAuthorityPublications} from './session-authority-domain-owner.mjs';
import {captureSessionAuthorityPublications,readSessionAuthorityPublications} from './session-authority-registry.mjs';
import {readHeldCriticFamilyPublications} from '../scripts/codex-critic-session-route.mjs';

test('original publisher observations bind checked images and keep live authority private',async()=>{
  const seeded=mkdtempSync(join(nativeContractFixtureParent(),'g17-publication-'));
  const git=(...args)=>execFileSync('git',args,{cwd:seeded,stdio:'pipe'});
  git('init','-q');
  writeFileSync(join(seeded,'fixture.txt'),'owned fixture\n');
  git('add','--','fixture.txt');
  git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');
  const f=prepareSessionAuthorityRegistryFixture({root:seeded});
  const other=prepareSessionAuthorityRegistryFixture({prefix:'g17-other-publication-'});
  try{
    const owner=Object.freeze({}),binding={repository:f.repository,owner};
    const lifecycle=createModelFamilyHostAuthorityLifecycle({repository:f.repository});
    const originalInventory=captureRepositoryFingerprint(f.repoDir);
    const captured=await captureDomainAuthorityPublications(binding,()=>captureSessionAuthorityPublications(binding,()=>{
      const operation=lifecycle.reserve({unitPublication:'g17'});
      lifecycle.observeEffects(operation);
      return operation;
    }));
    const domain=readDomainAuthorityPublications(captured.handle,binding);
    const registry=readSessionAuthorityPublications(captured.result.handle,binding);
    assert.equal(domain.length,2);
    assert.ok(registry.length>=6);
    function frozen(value){if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const child of Object.values(value))frozen(child);}}
    for(const events of [domain,registry]){
      frozen(events);
      const latest=new Map();
      for(const event of events){
        assert.equal('owner' in event,false);assert.equal('boundary' in event,false);
        assert.equal('operationHandle' in event,false);assert.equal('producerPort' in event,false);
        assert.deepEqual(JSON.parse(JSON.stringify(event)),event);
        if(latest.has(event.path))assert.deepEqual(event.preimage,latest.get(event.path));
        else assert.equal(event.preimage?.sha256??null,event.expectedSha256??event.expectedRef?.sha256??null);
        assert.equal(event.postimage.mode,0o600);
        assert.throws(()=>{event.postimage.sha256='0'.repeat(64);},TypeError);
        latest.set(event.path,event.postimage);
      }
      for(const [path,image] of latest){const bytes=readFileSync(path);assert.equal(bytes.length,image.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),image.sha256);}
    }
    assert.equal(domain[0].preimage,null);
    // Execute the actual private reconciliation function over genuine original
    // publisher observations. This bounded pure-function check creates no route
    // handle and cannot admit a native execution or a receipt.
    const source=readFileSync(new URL('../scripts/codex-critic-host.mjs',import.meta.url),'utf8');
    const start=source.indexOf('function expectedOriginalPublicationFingerprint('),end=source.indexOf('\nfunction heldPreparedFamilyContext(',start);
    assert.ok(start>=0&&end>start);
    let events=[...domain,...registry];
    const reconcile=new Function('readHeldCriticFamilyPublications','canonicalJson','sha256','relative','sep','isInside','fail',source.slice(start,end)+'\nreturn expectedOriginalPublicationFingerprint;')(
      route=>{assert.equal(route,owner);return events;},canonicalJson,sha256,relative,sep,
      (root,path)=>path.startsWith(root+sep),message=>{throw Error(message);});
    assert.throws(()=>reconcile({route:owner,protectedSnapshots:{candidate:originalInventory}}),/CRITIC-FAMILY-PUBLICATION-PARENT-DRIFT/);
    console.log(JSON.stringify({originalWriterNewParent:'explicit-fail-closed',coverage:'actual-reconciler-with-original-publisher-observations'}));
    const beforeSecond=captureRepositoryFingerprint(f.repoDir);
    const second=await captureDomainAuthorityPublications(binding,()=>captureSessionAuthorityPublications(binding,()=>{
      const operation=lifecycle.reserve({unitPublication:'g17-second'});
      lifecycle.observeEffects(operation);
    }));
    events=[...readDomainAuthorityPublications(second.handle,binding),...readSessionAuthorityPublications(second.result.handle,binding)];
    const expected=reconcile({route:owner,protectedSnapshots:{candidate:beforeSecond}});
    assert.deepEqual(expected,{candidate:captureRepositoryFingerprint(f.repoDir).sha256},'original publications uniquely explain the actual full inventory');
    const drifted=structuredClone(beforeSecond);
    const catalogue=drifted.administrativeInventory.git.find(row=>row.path==='agent-pipeline/session-authority/catalogue.json');
    assert.ok(catalogue);catalogue.sha256='0'.repeat(64);
    assert.throws(()=>reconcile({route:owner,protectedSnapshots:{candidate:drifted}}),/publication preimage/);
    console.log(JSON.stringify({originalPreimages:'exact-full-inventory-chain',preimageDrift:'refused'}));
    assert.deepEqual(readDomainAuthorityPublications(captured.handle,binding),domain);
    for(const [reader,handle,foreign] of [[readDomainAuthorityPublications,captured.handle,captured.result.handle],[readSessionAuthorityPublications,captured.result.handle,captured.handle]]){
      for(const forged of [{},JSON.parse(JSON.stringify(handle)),foreign])assert.throws(()=>reader(forged,binding));
      assert.throws(()=>reader(handle,{...binding,owner:{}}));
      assert.throws(()=>reader(handle,{...binding,repository:other.repository}));
      assert.throws(()=>reader(handle));
    }
    assert.throws(()=>readHeldCriticFamilyPublications({}));
    await assert.rejects(captureDomainAuthorityPublications(binding,()=>captureDomainAuthorityPublications(binding,()=>null)));
    await assert.rejects(captureSessionAuthorityPublications(binding,()=>captureSessionAuthorityPublications(binding,()=>null)));
    await assert.rejects(captureDomainAuthorityPublications(binding,()=>{throw Error('original failure');}),/original failure/);
    await assert.rejects(captureSessionAuthorityPublications(binding,()=>{throw Error('original failure');}),/original failure/);
  }finally{rmSync(f.repoDir,{recursive:true,force:true});rmSync(other.repoDir,{recursive:true,force:true});}
});

registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? '3'), maxBytes: 65536 });
