// SPDX-License-Identifier: SUL-1.0
// Source target: plugins/pipeline-core/lib/governance-onboarding.test.mjs
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC13C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir, devNull} from 'node:os';
import {join} from 'node:path';
import {createGovernanceScopeController,recordGovernanceEnrollmentAfterOnboarding} from './governance-scope.mjs';
import {planProjectOnboardingV3,applyProjectOnboardingV3} from './project-onboarding-v3.mjs';
test('actual authenticated V3 apply integrates central enrollment with real local Git and isolated machine plane',t=>{
  const base=mkdtempSync(join(tmpdir(),'scope-onboard-')),root=join(base,'repo'),emptyHome=join(base,'empty-user'),state=join(base,'host-state');mkdirSync(root);mkdirSync(emptyHome);t.after(()=>rmSync(base,{recursive:true,force:true}));
  const git=spawnSync('git',['init','--initial-branch=main'],{cwd:root,encoding:'utf8',timeout:5000});assert.equal(git.status,0);
  const controller=createGovernanceScopeController({hostStateRoot:state});
  const deps={homedir:()=>emptyHome,environment:{},readMachinePlane:()=>({status:'absent'}),governanceScopeController:controller};
  const plan=planProjectOnboardingV3({rootDir:root,runner:'claude',deps});assert.equal(plan.status,'ready',JSON.stringify(plan));
  const before=readFileSync(join(root,'.git','config'),'utf8');
  const denied=applyProjectOnboardingV3(plan,{rootDir:root,activate:false,deps});assert.equal(denied.status,'activation-required');assert.equal(readFileSync(join(root,'.git','config'),'utf8'),before);
  const result=applyProjectOnboardingV3(plan,{rootDir:root,activate:true,deps});assert.equal(result.status,'applied',JSON.stringify(result));assert.equal(result.governanceEnrollment.state,'active');assert.equal(controller.observe({rootDir:root}).state,'active');
  assert.throws(()=>recordGovernanceEnrollmentAfterOnboarding({rootDir:root,activate:true,controller:{recordOnboardingEnrollment:()=>({state:'active'})}}),/GS-CONTROLLER/);
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 1) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
