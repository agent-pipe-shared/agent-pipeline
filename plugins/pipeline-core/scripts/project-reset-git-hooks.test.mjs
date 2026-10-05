// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC23C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,linkSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {planProjectReset,applyProjectReset} from './project-reset.mjs';
import {applyInstall as commitMsg} from './commit-msg-hook-install.mjs';
import {applyInstall as preCommit} from './pre-commit-hook-install.mjs';
import {applyInstall as prePush} from './pre-push-hook-install.mjs';
import {validateAgainstSchema} from '../lib/schema-lite.mjs';
import { devNull } from 'node:os';
const owned=process.env.PIPELINE_RESET_FIXTURE_ROOT ?? new URL('../../../../scratch/project-reset-git-hooks/',import.meta.url).pathname,plugin=new URL('../',import.meta.url).pathname,schema=JSON.parse(readFileSync(join(plugin,'scripts/project-reset-plan.schema.json')));
mkdirSync(join(owned,'fixtures'),{recursive:true});
function git(root,args){const r=spawnSync('git',args,{cwd:root,encoding:'utf8',timeout:20000});assert.equal(r.status,0,JSON.stringify({args,stderr:r.stderr}));return r.stdout;}
function fixture(t,{tier='legacy',hooks=true}={}){const root=mkdtempSync(join(owned,'fixtures/reset-'));t.after(()=>rmSync(root,{recursive:true,force:true}));git(root,['init','-q']);git(root,['config','user.name','Fixture']);git(root,['config','user.email','fixture@example.invalid']);
 const dir=join(root,tier==='legacy'?'.claude':'project');mkdirSync(dir);writeFileSync(join(dir,'pipeline.yaml'),'schema: pipeline.project.v1\n');writeFileSync(join(dir,'pipeline.json'),JSON.stringify({handover:'docs/handover.md'}));mkdirSync(join(root,'docs'));writeFileSync(join(root,'docs','handover.md'),'seeded\n');writeFileSync(join(root,'docs','adopter.md'),'keep this\n');mkdirSync(join(root,'specs/promoted'),{recursive:true});writeFileSync(join(root,'specs/promoted/spec.md'),'keep design\n');writeFileSync(join(root,'README'),'keep readme\n');
 git(root,['add','README']);git(root,['commit','-m','Initial commit']);
 if(hooks){const deps={rootDir:root,pluginLibDir:join(plugin,'lib'),pluginHooksDir:join(plugin,'hooks'),pluginScriptsDir:join(plugin,'scripts')};for(const install of [preCommit,commitMsg,prePush])assert.equal(install(deps).status,'installed');}
 return root;}
function apply(root,plan,deps={}){return applyProjectReset({rootDir:root,expectedPlanSha256:plan.planSha256,deps});}
function assertCommit(root){git(root,['add','README','docs/adopter.md','specs/promoted/spec.md']);git(root,['commit','-m','Ordinary commit after reset']);assert.equal(readFileSync(join(root,'docs/adopter.md'),'utf8'),'keep this\n');assert.equal(readFileSync(join(root,'specs/promoted/spec.md'),'utf8'),'keep design\n');}
for(const tier of ['legacy','neutral'])test('actual installed hooks reset and ordinary commit: '+tier,t=>{const root=fixture(t,{tier}),plan=planProjectReset({rootDir:root});assert.equal(plan.status,'ready',JSON.stringify(plan));assert.equal(validateAgainstSchema(plan,schema).valid,true);assert.deepEqual(plan.gitHooks.hooks.map(h=>h.status),['owned','owned','owned']);const result=apply(root,plan);assert.equal(result.status,'applied',JSON.stringify(result));assert.deepEqual(result.gitHooks,plan.gitHooks);assert.equal(validateAgainstSchema(result,schema).valid,true);assert.equal(existsSync(join(root,'.git/agent-pipeline')),false);for(const h of plan.gitHooks.hooks)assert.equal(existsSync(h.hookPath),false);assertCommit(root);assert.equal(apply(root,plan).status,'replayed');});
for(const crashAt of ['journal-rename','git-hook-shim','git-hook-remove','git-hooks-complete','move','quarantine-remove','journal-remove'])test('durable recovery and ordering: '+crashAt,t=>{const root=fixture(t),plan=planProjectReset({rootDir:root});assert.throws(()=>apply(root,plan,{crashAt}),/simulated fault/);if(['journal-rename','git-hook-shim','git-hook-remove','git-hooks-complete'].includes(crashAt)){assert.equal(existsSync(join(root,'.git/agent-pipeline')),true);assert.equal(existsSync(join(root,'.pipeline-reset-quarantine')),false);assert.equal(existsSync(join(root,'.claude/pipeline.yaml')),true);}const result=apply(root,plan);assert.equal(result.status,'applied',JSON.stringify(result));assertCommit(root);});
for(const change of ['foreign','drift','hardlink','symlink','hooksPath','shared'])test('safe refusal: '+change,t=>{const root=fixture(t,{hooks:change!=='foreign'});let plan=planProjectReset({rootDir:root});if(change==='foreign')writeFileSync(join(root,'.git/hooks/pre-commit'),'#!/bin/sh\nexit 0\n');if(change==='drift')writeFileSync(plan.gitHooks.hooks[0].hookPath,'changed\n');if(change==='symlink'){rmSync(plan.gitHooks.hooks[0].hookPath);symlinkSync(join(root,'README'),plan.gitHooks.hooks[0].hookPath);}if(change==='hardlink')linkSync(plan.gitHooks.hooks[0].hookPath,join(root,'hardlink'));
 if(change==='hooksPath'){mkdirSync(join(root,'custom-hooks'));git(root,['config','core.hooksPath','custom-hooks']);}if(change==='shared'){const child=join(root,'linked');git(root,['worktree','add','--detach',child]);}
 if(change==='drift'){const result=apply(root,plan);assert.equal(result.status,'refused');}else assert.notEqual(planProjectReset({rootDir:root}).status,'ready');assert.equal(existsSync(join(root,'.claude/pipeline.yaml')),true);});
test('journal tampering and post-fault drift refuse without quarantine',t=>{const root=fixture(t),plan=planProjectReset({rootDir:root});assert.throws(()=>apply(root,plan,{crashAt:'journal-rename'}));const path=join(root,'.pipeline-reset-journal.json'),journal=JSON.parse(readFileSync(path));journal.gitHooks.hooks[0].marker.sha256='0'.repeat(64);writeFileSync(path,JSON.stringify(journal));assert.equal(apply(root,plan).code,'PROJECT-RESET-GIT-HOOKS-JOURNAL-BINDING');assert.equal(existsSync(join(root,'.pipeline-reset-quarantine')),false);});
test('legacy receipt readable, legacy journal cannot gain removal authority',t=>{const root=fixture(t),plan=planProjectReset({rootDir:root});assert.throws(()=>apply(root,plan,{crashAt:'journal-rename'}));const path=join(root,'.pipeline-reset-journal.json'),journal=JSON.parse(readFileSync(path));delete journal.gitHooks;writeFileSync(path,JSON.stringify(journal));assert.equal(apply(root,plan).code,'PROJECT-RESET-GIT-HOOKS-LEGACY-UNBOUND');const legacy={schema:'pipeline.project-reset-apply-result.v1',status:'applied',code:null,root,authorityTier:'legacy',remove:[],keep:[],neverTouched:[],planSha256:plan.planSha256};writeFileSync(join(root,'.pipeline-reset-receipt.json'),JSON.stringify(legacy));assert.equal(apply(root,plan).status,'replayed');assert.equal('gitHooks' in apply(root,plan),false);assert.equal(validateAgainstSchema(legacy,schema).valid,true);});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 17) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
