// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC07C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';

import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadRunnerProfilesV3Registry, validatePipelineUserV3 } from './runner-profiles-v3.mjs';
import { resolveV3DutyRoute, resolveCriticHighRiskRoute } from './critic-route-v3.mjs';
import { parseYaml } from './yaml-lite.mjs';
function yaml(value,indent=''){
  if(Array.isArray(value))return value.map(entry=>entry!==null&&typeof entry==='object'?`${indent}-\n${yaml(entry,indent+'  ')}`:`${indent}- ${JSON.stringify(entry)}\n`).join('');
  return Object.entries(value).map(([key,entry])=>entry!==null&&typeof entry==='object'?`${indent}${key}:\n${yaml(entry,indent+'  ')}`:`${indent}${key}: ${JSON.stringify(entry)}\n`).join('');
}
const fixtureRoot=process.env.PIPELINE_SIGNING_FIXTURE_ROOT ?? new URL("../../../../scratch/default-signing/",import.meta.url).pathname;
mkdirSync(fixtureRoot,{recursive:true});
function fixture(t){
  const root=mkdtempSync(join(fixtureRoot,'registered-duty-selector-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const registry=loadRunnerProfilesV3Registry();
  const config={schema:'pipeline.user.v3',language:{human_facing:'en',agent_facing:'en'},agent_runtime:'other',runners:{enabled:['claude','codex'],default:'codex'},routing:{profiles:structuredClone(registry.profiles),duties:structuredClone(registry.duties)},usage:{common_projection:'pipeline.runner-usage.v1',raw_persistence:'none'},autonomy:{push_policy:'gated',branch_model:'feature-branch',wip_limit:1},gates:{dev_plan:'blocking',push:'blocking',security:'warn',claude_md_max_lines:300},session:{keep_awake:true},critic_export:structuredClone(registry.criticExportPolicy)};
  assert.equal(validatePipelineUserV3(config).ok,true);assert.deepEqual(parseYaml(yaml(config)),config);
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git(['init','--quiet']);git(['config','user.name','Synthetic route fixture']);git(['config','user.email','fixture@example.invalid']);
  function commit(current=config){writeFileSync(join(root,'pipeline.user.yaml'),yaml(current));git(['add','pipeline.user.yaml']);git(['commit','--quiet','-m','Synthetic isolated duty route']);return git(['rev-parse','HEAD']);}
  const candidateCommit=commit();return {root,registry,config,candidateCommit,commit,git};
}
test('registered Claude alias resolves from exact committed frozen V3 source',t=>{
  const f=fixture(t),cell=f.registry.duties.readiness.claude;
  assert.equal(cell.state,'default');assert.equal(cell.selector.kind,'alias');
  const route=resolveV3DutyRoute({rootDir:f.root,dutyId:'readiness',runner:'claude',candidateCommit:f.candidateCommit});
  assert.equal(route.model,cell.selector.value);assert.equal(route.effort,cell.effort);assert.equal(route.state,cell.state);assert.equal(route.candidateCommit,f.candidateCommit);assert.match(route.sourceSha256,/^[a-f0-9]{64}$/);
});
test('Codex model-id and high-risk Critic resolution retain registered source and effort',t=>{
  const f=fixture(t),readiness=resolveV3DutyRoute({rootDir:f.root,dutyId:'readiness',runner:'codex',candidateCommit:f.candidateCommit}),critic=resolveCriticHighRiskRoute({rootDir:f.root,candidateCommit:f.candidateCommit});
  assert.equal(readiness.model,f.registry.duties.readiness.codex.selector.value);assert.equal(critic.runner,'codex');assert.equal(critic.dutyId,'critic_high_risk');assert.equal(critic.model,f.registry.duties.critic_high_risk.codex.selector.value);assert.equal(critic.effort,f.registry.duties.critic_high_risk.codex.effort);
});
test('unknown kind or substituted registry selector is refused by full default validation',t=>{
  const f=fixture(t);
  for(const change of [{kind:'unknown',value:'sonnet'},{kind:'model-id',value:'sonnet'},{kind:'alias',value:'unregistered-alias'}]){
    const bad=structuredClone(f.config);bad.routing.duties.readiness.claude.selector=change;assert.equal(validatePipelineUserV3(bad).ok,false);
    const candidateCommit=f.commit(bad);assert.throws(()=>resolveV3DutyRoute({rootDir:f.root,dutyId:'readiness',runner:'claude',candidateCommit}),/did not pass V3 validation/);
  }
});
test('Codex cannot gain an alias through a changed committed cell',t=>{
  const f=fixture(t),bad=structuredClone(f.config);bad.routing.duties.critic_high_risk.codex.selector={kind:'alias',value:'opus'};
  const candidateCommit=f.commit(bad);assert.throws(()=>resolveCriticHighRiskRoute({rootDir:f.root,candidateCommit}),/did not pass V3 validation/);
});
test('malformed committed source and unavailable duty lookup fail without fallback',t=>{
  const f=fixture(t);assert.throws(()=>resolveV3DutyRoute({rootDir:f.root,dutyId:'absent',runner:'claude',candidateCommit:f.candidateCommit}),/requested duty route is unavailable/);
  writeFileSync(join(f.root,'pipeline.user.yaml'),'schema: broken\n');f.git(['add','pipeline.user.yaml']);f.git(['commit','--quiet','-m','Malformed fixture']);
  assert.throws(()=>resolveV3DutyRoute({rootDir:f.root,dutyId:'readiness',runner:'claude',candidateCommit:f.git(['rev-parse','HEAD'])}),/did not pass V3 validation/);
});
test('uncommitted edits cannot replace exact selected committed route authority',t=>{
  const f=fixture(t);writeFileSync(join(f.root,'pipeline.user.yaml'),'schema: broken\n');
  const route=resolveV3DutyRoute({rootDir:f.root,dutyId:'readiness',runner:'claude',candidateCommit:f.candidateCommit});assert.equal(route.model,f.registry.duties.readiness.claude.selector.value);
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 6) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
