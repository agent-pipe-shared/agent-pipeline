// Source target: plugins/pipeline-core/scripts/project-activation.test.mjs
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC22C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from './project-activation.mjs';
test('actual sanctioned CLI plan/apply is digest-bound and rejects malformed or repeated flags',t=>{
  const root=mkdtempSync(join(tmpdir(),'scope-cli-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const git=spawnSync('git',['init','--initial-branch=main'],{cwd:root,encoding:'utf8',timeout:5000});assert.equal(git.status,0);
  const seen=[],invoke=args=>main(args,{write:value=>seen.push(value)});
  const config=join(root,'.git','config'),before=readFileSync(config,'utf8');
  assert.equal(invoke(['plan','--root',root,'--decision','decline','--by','Fixture']),0);const plan=seen.at(-1);assert.equal(readFileSync(config,'utf8'),before);
  assert.equal(invoke(['apply','--root',root,'--decision','decline','--by','Fixture','--plan-sha256','0'.repeat(64),'--activate']),2);assert.equal(readFileSync(config,'utf8'),before);
  assert.equal(invoke(['apply','--root',root,'--decision','decline','--by','Fixture','--plan-sha256',plan.planSha256,'--activate']),0);assert.equal(seen.at(-1).state,'declined');
  assert.equal(invoke(['inspect','--root',root]),0);assert.equal(seen.at(-1).hintAllowed,false);
  for(const args of [['plan','--root',root,'--root',root],['apply','--root',root,'--decision','enroll','--by','Fixture'],['inspect','--root',root,'--host-state-root','foreign'],['plan','--root',root,'--decision','fabricated','--by','Fixture']])assert.equal(invoke(args),2);
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 1) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
