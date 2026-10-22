// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Pure exported production formatter cases. These do not construct approval,
// validate requests, create review artifacts, sign, or claim real TTY evidence.
export async function presentationCases({sourceRoot}) {
  const {compactSigningDisclosure,formatHumanApprovalCliResult} = await import(pathToFileURL(join(sourceRoot,'plugins/pipeline-core/scripts/po-human-approval.mjs')));
  const intent='ab'.repeat(32), material='cd'.repeat(32);
  return [
    {id:'SDP001',scope:'pure-renderer',run(){
      const hidden='FULL-PRIVATE-TRANSCRIPT-SENTINEL';
      const record={resolved:true,lines:[`action: design\n${hidden}`, ...Array.from({length:1000},(_,i)=>`decision ${i}: ${'x'.repeat(2000)}`)]};
      const artifact={path:'scratch/disposable-review.json',sha256:material};
      const lines=compactSigningDisclosure({intentSha256:intent,record,materialArtifact:artifact});
      assert(Array.isArray(lines));assert(lines.length<=20,'summary must fit the frozen20+4 frame budget');
      assert(lines.every(line=>typeof line==='string'&&!/[\r\n\u001b]/.test(line)));
      assert(!lines.join('\n').includes(hidden),'multiline full material must not leak');
      assert(lines.some(line=>line.includes(intent)));assert(lines.some(line=>line.includes(material)));
      assert(lines.some(line=>line.includes(JSON.stringify(artifact.path))));
    }},
    {id:'SDP002',scope:'pure-renderer',run(){
      const record=Object.freeze({resolved:true,lines:Object.freeze(['action: a\u001bb\u0000c', 'decision: '+ 'z'.repeat(10000)])});
      const before=JSON.stringify(record);
      const lines=compactSigningDisclosure({intentSha256:intent,record});
      assert(lines.every(line=>!/[\p{C}]/u.test(line)));assert(lines.join('\n').length<2000,'bounded facts, not large terminal expansion');
      assert.equal(JSON.stringify(record),before,'rendering cannot mutate signed source data');
    }},
    {id:'SDP003',scope:'pure-renderer',run(){
      const lines=compactSigningDisclosure({intentSha256:intent,record:{resolved:false,lines:['action: fabricated purpose']}});
      assert(lines.join('\n').includes(intent));assert(!lines.join('\n').includes('fabricated purpose'));
      assert.match(lines.join('\n'),/purpose unavailable/);
      const omitted=compactSigningDisclosure({intentSha256:intent,record:{resolved:true,lines:Array.from({length:30},(_,i)=>'fact '+i)}});
      assert.match(omitted.join('\n'),/full review material is unavailable/);
      assert(!omitted.join('\n').includes('retained at the bound artifact'));
    }},
    {id:'SDP004',scope:'pure-input-refusal',run(){
      assert.throws(()=>compactSigningDisclosure({intentSha256:'wrong',record:{resolved:true,lines:[]}}));
      for(const artifact of [{path:'scratch/file\nINJECT',sha256:material},{path:'scratch/file',sha256:'wrong'},{path:'x'.repeat(1000),sha256:material}]) {
        assert.throws(()=>compactSigningDisclosure({intentSha256:intent,record:{resolved:true,lines:[]},materialArtifact:artifact}));
      }
    }},
    {id:'SDP005',scope:'pure-human-presentation',run(){
      for(const code of ['PO-HUMAN-SIGN-INTENT-READY','PO-HUMAN-PROOF-READY','PO-HUMAN-CRITICAL-AUTHORIZATION-READY']) {
        const result={ok:true,code,intentSha256:intent,signer:{sentinel:'NOT-HUMAN-OUTPUT'},paths:{proof:'scratch/proof.json',signer:'scratch/signer.json'},scratchProofPath:'scratch/mirror.json'};
        const before=JSON.stringify(result), output=formatHumanApprovalCliResult(result,{humanFacing:true});
        assert.equal(output.trimEnd().split('\n').length,1);
        assert.deepEqual(JSON.parse(output),{ok:true,code,proofPath:'scratch/proof.json'});
        assert(!output.includes('NOT-HUMAN-OUTPUT'));assert.equal(JSON.stringify(result),before);
      }
    }},
    {id:'SDP006',scope:'pure-machine-interface',run(){
      const result={ok:true,code:'PO-HUMAN-SIGN-INTENT-READY',intentSha256:intent,signer:{keyReference:'disposable'},paths:{proof:'scratch/proof.json',signer:'scratch/signer.json'},scratchProofPath:'scratch/mirror.json'};
      assert.deepEqual(JSON.parse(formatHumanApprovalCliResult(result,{humanFacing:false})),result);
      const failed={ok:false,code:'TYPED-REFUSAL',repair:{required:true}};
      assert.deepEqual(JSON.parse(formatHumanApprovalCliResult(failed,{humanFacing:true})),failed);
    }}
  ];
}
