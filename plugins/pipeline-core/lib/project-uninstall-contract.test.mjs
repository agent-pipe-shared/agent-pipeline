// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "UC01C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fixture} from './project-uninstall.fixture.mjs';
import {validateUninstallContract} from './project-uninstall-contract.mjs';
import {main} from '../scripts/project-uninstall.mjs';
import { devNull } from 'node:os';
test('closed uninstall schemas admit actual plans/journals and byte-identical mirrors; CLI rejects undeclared request fields',t=>{
 const f=fixture(t,{hooks:false}),plan=f.controller.plan({rootDir:f.root});assert.equal(validateUninstallContract('plan',plan),true);
 const request={schema:'pipeline.project-uninstall-request.v1',verb:'plan',rootDir:f.root,activate:false,planSha256:null};assert.equal(validateUninstallContract('request',request),true);assert.equal(validateUninstallContract('request',{...request,force:true}),false);
 assert.throws(()=>f.controller.apply(plan,{activate:true,planSha256:plan.planSha256,crashAt:'journal'}),/PU-SIMULATED-journal/);const path=join(plan.controls,plan.planSha256,'journal.json'),journal=JSON.parse(readFileSync(path));assert.equal(validateUninstallContract('journal',journal),true);
 for(const kind of ['request','plan','journal'])assert.deepEqual(readFileSync(new URL('../schemas/project-uninstall-'+kind+'.schema.json',import.meta.url)),readFileSync(new URL('../../../schemas/project-uninstall-'+kind+'.schema.json',import.meta.url)));
 let output;assert.equal(main(['plan','--root',f.root,'--force'],{write:v=>{output=v;}}),1);assert.equal(output.status,'refused');
});
for(const change of ['unknown-journal','unknown-plan','unknown-hook','plan-digest','journal-digest','actions','stage-order'])test('durable schema/digest binding refuses altered journal before any hook/key/decline mutation: '+change,t=>{
 const f=fixture(t,{hooks:true}),plan=f.controller.plan({rootDir:f.root});assert.throws(()=>f.controller.apply(plan,{activate:true,planSha256:plan.planSha256,crashAt:'journal'}));const path=join(plan.controls,plan.planSha256,'journal.json'),journal=JSON.parse(readFileSync(path)),config=readFileSync(join(f.root,'.git/config')),keys=readFileSync(join(f.root,'.claude/pipeline.json'));
 if(change==='unknown-journal')journal.force=true;if(change==='unknown-plan')journal.plan.force=true;if(change==='unknown-hook')journal.plan.git.hooks[0].force=true;if(change==='plan-digest')journal.plan.planSha256='0'.repeat(64);if(change==='journal-digest')journal.planSha256='0'.repeat(64);if(change==='actions')journal.actions[0].afterBytes+=' ';if(change==='stage-order')journal.completed=['decline'];
 writeFileSync(path,JSON.stringify(journal));assert.throws(()=>f.controller.resume({rootDir:f.root,activate:true,planSha256:plan.planSha256}),e=>e.code==='PU-JOURNAL');assert.deepEqual(readFileSync(join(f.root,'.git/config')),config);assert.deepEqual(readFileSync(join(f.root,'.claude/pipeline.json')),keys);assert.equal(f.scope.observe({rootDir:f.root}).state,'active');
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 8) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
