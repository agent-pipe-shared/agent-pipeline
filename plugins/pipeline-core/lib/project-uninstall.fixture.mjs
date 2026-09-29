// SPDX-License-Identifier: SUL-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createProjectUninstallController,PROJECT_UNINSTALL_FAULT_STAGES} from './project-uninstall.mjs';
import {createGovernanceScopeController} from './governance-scope.mjs';
import {footprintSha256,observeGitHookFootprint} from './git-hook-footprint.mjs';
import {loadRunnerProfilesV3Registry} from './runner-profiles-v3.mjs';
import {planRuntimeProjectionV3,readRuntimeProjectionV3Baselines,codexCustomAgentSeed} from './runtime-projection-v3.mjs';
import {applyInstall as installPreCommit} from '../scripts/pre-commit-hook-install.mjs';
import {applyInstall as installCommitMsg} from '../scripts/commit-msg-hook-install.mjs';
import {applyInstall as installPrePush} from '../scripts/pre-push-hook-install.mjs';
import {main as uninstallCli} from '../scripts/project-uninstall.mjs';
export function git(root,args){const r=spawnSync('git',args,{cwd:root,encoding:'utf8',timeout:15000});assert.equal(r.status,0,JSON.stringify({args,stderr:r.stderr,error:r.error?.code}));return r.stdout.trim();}
function yaml(v,level=0){const indent=' '.repeat(level);if(Array.isArray(v))return v.map(x=>typeof x==='object'?indent+'-\n'+yaml(x,level+2):indent+'- '+JSON.stringify(x)+'\n').join('');return Object.entries(v).map(([k,x])=>typeof x==='object'&&x!==null?indent+k+':\n'+yaml(x,level+2):indent+k+': '+JSON.stringify(x)+'\n').join('');}
export function fixture(t,{hooks=true,keys=true}={}){
 const base=mkdtempSync(join(tmpdir(),'uninstall-transaction-')),root=join(base,'repo');mkdirSync(root);t.after(()=>rmSync(base,{recursive:true,force:true}));git(root,['init','--initial-branch=main','-q']);git(root,['config','user.name','Fixture']);git(root,['config','user.email','fixture@example.invalid']);
 const put=(path,bytes)=>{const out=join(root,path);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,bytes);};
 const content={'AGENTS.md':'User instructions unchanged\n','CLAUDE.md':'User instructions too\n','README':'Product readme\n','docs/guide.md':'User guide\n','specs/promoted/spec.md':'Product design\n','backlog/notes.md':'Product history\n','architecture/map/index.md':'Product map\n'};for(const [path,bytes] of Object.entries(content))put(path,bytes);
 if(keys){const registry=loadRunnerProfilesV3Registry(),intent={schema:'pipeline.user.v3',language:{human_facing:'en',agent_facing:'en'},agent_runtime:'other',runners:{enabled:['claude','codex'],default:'codex'},routing:{profiles:registry.profiles,duties:registry.duties},usage:{common_projection:'pipeline.runner-usage.v1',raw_persistence:'none'},autonomy:{push_policy:'gated',branch_model:'feature-branch',wip_limit:1},gates:{dev_plan:'blocking',push:'blocking',security:'warn',claude_md_max_lines:300},critic_export:registry.criticExportPolicy,roles:{po:{display_label:'Fixture Owner'}},session:{keep_awake:true}};
  put('pipeline.user.yaml',yaml(intent));put('.claude/pipeline.json','{ "foreign" : { "escaped" : "\\u00df", "n" : 1e+2 }, "humanRoles" : { "po" : { "custom" : true } } }\n');put('.claude/settings.json','{ \"unowned\" : true }\n');put('.codex/config.toml','profile = \"keep\"\n');put('.codex/agents/consult-advisor.toml','name = \"stale\"\n');put('.claude/pipeline.yaml','# unowned-prefix\nlanguage:\n  human_facing: en\n  unowned_language_sentinel: exact\nmodelRouting:\n  stale: true\nrunnerRoutes:\n  worktype_feature_advisor:\n    runner: claude\n  worktype_mini_advisor:\n    runner: claude\nforeign: keep-exact\n');put('.codex/agents/implementor.toml',codexCustomAgentSeed('implementor')+'# foreign comment\n[foreign]\nmodel = "mine"\n');put('.codex/agents/critic.toml',codexCustomAgentSeed('critic'));
  const projected=planRuntimeProjectionV3(intent,{baselines:readRuntimeProjectionV3Baselines(root)});assert.equal(projected.status,'ready',JSON.stringify(projected));for(const row of projected.targets)if(row.after?.bytes!==undefined)put(row.path,row.after.bytes);
  // Insert physically distinct foreign bytes after projection without changing owned values.
  const json=join(root,'.claude/pipeline.json');const value=JSON.parse(readFileSync(json));value.foreign={escaped:'ß',n:100};writeFileSync(json,JSON.stringify(value).replace('"foreign":{"escaped":"ß","n":100}','"foreign" : { "escaped" : "\\u00df", "n" : 1e+2 }')+'\n');
  content['pipeline.user.yaml']=readFileSync(join(root,'pipeline.user.yaml'),'utf8');
 }
 const scope=createGovernanceScopeController({hostStateRoot:join(base,'host-state')}),enroll=scope.planDecision({rootDir:root,decision:'enroll',by:'Fixture Owner'});scope.applyDecision(enroll,{activate:true,planSha256:enroll.planSha256});
 const source=join(base,'minimal-public-source'),foreign=join(base,'foreign-plugin');mkdirSync(join(source,'lib'),{recursive:true});mkdirSync(foreign);writeFileSync(join(source,'plugin.json'),JSON.stringify({name:'agent-pipeline-core',version:'0.7.0'}));writeFileSync(join(foreign,'plugin.json'),JSON.stringify({name:'foreign-plugin',version:'1'}));
 // The publisher contract accepts this real Source module inventory. No hook
 // execution or complete runtime qualification is inferred from the snapshot.
 writeFileSync(join(source,'lib/governance-scope.mjs'),readFileSync(new URL('./governance-scope.mjs',import.meta.url)));
 writeFileSync(join(source,'protected-baseline.json'),readFileSync(new URL('../protected-baseline.json',import.meta.url)));
 mkdirSync(join(source,'hooks'),{recursive:true});writeFileSync(join(source,'hooks/antigravity-pretool-guard.mjs'),'// disposable manifest-bound hook\n');writeFileSync(join(source,'hooks.json'),JSON.stringify({hooks:[{type:'command',command:'node hooks/antigravity-pretool-guard.mjs',timeout:30}]}));
 for(const path of ['.agents/hooks.json','.agents/external-hooks.json'])put(path,' \n{ "sentinel" : "\\u00df", "hooks" : [ { "type" : "command", "command" : '+JSON.stringify('node "'+join(source,'hooks/antigravity-pretool-guard.mjs')+'"')+', "timeout" : 30 },\n { "command" : "node foreign.mjs", "keep" : 1e+2 } ], "tail" : true }\n');
 const workspace=' \n{ "custom" : "\\u00df", "entries" : [ {"path":'+JSON.stringify(source)+'},\n { "path" : '+JSON.stringify(foreign)+', "enabled" : false } ], "tail" : 1 }\n';put('.agents/plugins.json',workspace);
 git(root,['add','.']);git(root,['commit','-m','Initial content']);const head=git(root,['rev-parse','HEAD']);
 if(hooks)for(const install of [installPreCommit,installCommitMsg,installPrePush])assert.equal(install({rootDir:root,pluginLibDir:join(source,'lib'),pluginHooksDir:join(source,'hooks'),pluginScriptsDir:join(source,'scripts')}).status,'installed');
 const controller=createProjectUninstallController({hostStateRoot:join(base,'host-state')});
 const digests=()=>Object.fromEntries(Object.keys(content).map(path=>[path,footprintSha256(readFileSync(join(root,path)))]));
 return {base,root,put,content,controller,scope,head,digests,foreign};
}
