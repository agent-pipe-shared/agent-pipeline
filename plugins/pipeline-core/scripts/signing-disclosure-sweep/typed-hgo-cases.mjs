// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Actual CLI emitter and indexed owner reader; no approval/signature is minted.
export async function typedHgoCases({fixtureRoot,sourceRoot}) {
  assert.equal(resolve(sourceRoot),resolve(fixtureRoot,'../../../..'),'all constructors and readers must load one graph instance');
  const owner=await import(pathToFileURL(join(fixtureRoot,'state-owner.fixture.mjs')));
  const hgo=await import(pathToFileURL(join(sourceRoot,'plugins/pipeline-core/lib/human-guard-override.mjs')));
  const cli=await import(pathToFileURL(join(sourceRoot,'plugins/pipeline-core/scripts/guard-human-override.mjs')));
  const pluginRoot=join(sourceRoot,'plugins/pipeline-core'),scriptPath=join(pluginRoot,'scripts/guard-human-override.mjs');
  async function setup() {
    const f=owner.staged.makeFixture('signature',{stage:'initialized'});
    const recorded=hgo.recordHumanGuardDenial({rootDir:f.dir,pluginRoot,scriptPath,toolName:'Write',
      toolInput:{file_path:'method-typed-disclosure.md',content:'Disposable METHOD input\n'},
      denials:[{guard:'guard-lifecycle-ready.mjs',reason:'GUARD-DEVPLAN-SHELL'}]});
    assert.equal(recorded.status,'planned');
    const plan=hgo.planHumanGuardOverride({rootDir:f.dir,pluginRoot,scriptPath,requestSha256:recorded.requestSha256});
    let output='',error='';
    const status=cli.main(['emit-signature-digest','--repo',f.dir,'--request-sha256',recorded.requestSha256,'--plan-sha256',plan.planSha256],
      {write:text=>{output+=text;},writeError:text=>{error+=text;}});
    assert.equal(status,0,'actual emitter must succeed; no fabricated transport fallback');assert.equal(error,'');
    const transport=JSON.parse(output);
    assert.deepEqual(Object.keys(transport).sort(),['intentSha256','planSha256','requestSha256','schema','selectionSha256']);
    assert.equal(transport.schema,'pipeline.human-guard-override-signature-digest.v1');
    await owner.bindActualStateOwner(f);
    return {f,transport,options:{rootDir:f.dir,pluginRoot,scriptPath}};
  }
  return [
    {id:'SDT001',scope:'actual-emitter-indexed-reader',async run(){
      const {f,transport,options}=await setup();
      const record=f.runtime.run(()=>hgo.describeHumanGuardOverrideSignatureRequest(transport,options));
      assert(record!==null,'genuine emitted request must resolve its actual indexed owner');
      assert.equal(record.resolved,true);
      assert.deepEqual(record.requestBinding,{requestSha256:transport.requestSha256,planSha256:transport.planSha256,selectionSha256:transport.selectionSha256});
      const material=readFileSync(record.materialArtifact.path);
      assert.equal(createHash('sha256').update(material).digest('hex'),record.materialArtifact.sha256,'actual physical full plan bytes bind the material digest');
      assert.equal(material.length,record.materialArtifact.bytes);
      assert(record.fullReviewMaterial!==null&&typeof record.fullReviewMaterial==='object','full material comes from genuine indexed plan');
      assert.deepEqual(JSON.parse(material),record.fullReviewMaterial,'full review is the actual same-FD owner plan, not invented disclosure');
    }},
    {id:'SDT002',scope:'exact-five-key-binding-refusal',async run(){
      const {f,transport,options}=await setup();
      for(const key of ['requestSha256','planSha256','selectionSha256','intentSha256']) {
        const wrong={...transport,[key]:(transport[key]==='00'.repeat(32)?'11':'00').repeat(32)};
        assert.equal(f.runtime.run(()=>hgo.describeHumanGuardOverrideSignatureRequest(wrong,options)),null,`altered ${key} must refuse`);
        const missing={...transport};delete missing[key];
        assert.equal(f.runtime.run(()=>hgo.describeHumanGuardOverrideSignatureRequest(missing,options)),null,`missing ${key} must refuse`);
      }
      for(const wrong of [{...transport,extra:true},{...transport,schema:'pipeline.foreign.v1'}])
        assert.equal(f.runtime.run(()=>hgo.describeHumanGuardOverrideSignatureRequest(wrong,options)),null,'foreign or extended shape must refuse');
      const after=f.runtime.run(()=>hgo.describeHumanGuardOverrideSignatureRequest(transport,options));
      assert(after!==null,'negative reads cannot consume or alter the genuine indexed preparation');
    }}
  ];
}
