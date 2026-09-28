// SPDX-License-Identifier: SUL-1.0
import {execFileSync} from 'node:child_process';
import {resolvePoGateRepositoryTopology, derivePoGateRepositoryFingerprint} from './po-gate-authority.mjs';
import {tmpdir} from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hostDigest } from './codex-host-process-journal.mjs';
import { runIsolatedStructuredHost } from './codex-isolated-structured-host.mjs';
import { createCodexDesignReadinessHostStore } from './codex-design-readiness-host-store.mjs';
import { runCodexToolFreeDesignReadiness, verifyCodexToolFreeBinding,
  verifyCodexToolFreeBindingFromSources } from './codex-tool-free-design-readiness.mjs';

export function readinessFixture(t, scenario = 'clean') {
  const root = mkdtempSync(join(tmpdir(), 'codex-composition-fixture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = join(root, 'input'); mkdirSync(input, { mode: 0o700 });
  const git = args => execFileSync('git', args, { cwd: root, timeout: 10000, maxBuffer: 524288, stdio: ['ignore','pipe','pipe'] });
  git(['init','--quiet']); git(['config','user.email','fixture@example.invalid']); git(['config','user.name','Synthetic fixture']);
  const sources = Object.fromEntries(['input', 'prd', 'spec', 'design', 'traceability'].map(name => {
    const content = `Synthetic ${name} document.\n`; writeFileSync(join(root, `${name}.md`), content);
    return [name, { path: `${name}.md`, sha256: hostDigest(content) }];
  }));
  git(['add', 'input.md', 'prd.md', 'spec.md', 'design.md', 'traceability.md']); git(['commit','--quiet','-m','Synthetic sources']);
  const candidate = { commit: git(['rev-parse','HEAD']).toString().trim(), tree: git(['rev-parse','HEAD^{tree}']).toString().trim() };
  const topology = resolvePoGateRepositoryTopology(root);
  const repoFingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: topology.gitCommonDir, primaryRoot: topology.primaryRoot });
  // Node runs this script as "app-server". No real provider is contacted.
  writeFileSync(join(input, 'app-server'), `
const {createInterface}=require('node:readline');
const scenario=${JSON.stringify(scenario)};
const args=process.argv.slice(2), overrides=args.filter((value,index)=>args[index-1]==='-c');
const profile=JSON.parse(overrides.find(value=>value.startsWith('default_permissions=')).split('=')[1]);
const features=Object.fromEntries(overrides.filter(value=>/^features\\.[^=]+=false$/.test(value)).map(value=>[value.slice(9,-6),false]));
const config={mcp_servers:{},features,notify:[],web_search:'disabled',project_doc_max_bytes:0,include_environment_context:false,
shell_environment_policy:{inherit:'none'},history:{persistence:'none'},permissions:{[profile]:{extends:null,network:{enabled:false},
filesystem:{':minimal':'read',[process.execPath]:'read',[process.cwd()]:'read',glob_scan_max_depth:null}}}};
const send=value=>process.stdout.write(JSON.stringify(value)+'\\n');
const rl=createInterface({input:process.stdin});
rl.on('line',line=>{const m=JSON.parse(line);
if(m.method==='initialize')send({id:m.id,result:{}});
else if(m.method==='config/read')send({id:m.id,result:{config}});
else if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'fresh-fixture-thread'},model:m.params.model,modelProvider:'openai',activePermissionProfile:{id:profile},approvalPolicy:'never'}});
else if(m.method==='mcpServerStatus/list')send({id:m.id,result:{data:[],nextCursor:null}});
else if(m.method==='turn/start'){
const p=m.params.outputSchema.properties, lit=value=>value.enum[0];
const report={schema:lit(p.schema),dispatchId:lit(p.dispatchId),runner:lit(p.runner),
candidate:Object.fromEntries(Object.entries(p.candidate.properties).map(([key,value])=>[key,lit(value)])),
sources:Object.fromEntries(Object.entries(p.sources.properties).map(([key,value])=>[key,Object.fromEntries(Object.entries(value.properties).map(([key,value])=>[key,lit(value)]))])),
outcome:scenario==='not-ready'?'not-ready':'ready-for-po-review',
findings:scenario==='ready-with-blocker'?[{code:'fixture-blocker',severity:'blocking',summary:'Synthetic blocker'}]:[],unresolvedChoices:[],summary:'Unknown-at-launch synthetic result '+require('node:crypto').randomUUID()};
send({id:m.id,result:{turn:{id:'fresh-fixture-turn'}}});
if(scenario==='tool-attempt')send({method:'item/completed',params:{threadId:'fresh-fixture-thread',turnId:'fresh-fixture-turn',item:{type:'commandExecution'}}});
send({method:'item/completed',params:{threadId:'fresh-fixture-thread',turnId:'fresh-fixture-turn',item:{type:'agentMessage',phase:'final_answer',text:JSON.stringify(report)}}});
send({method:'turn/completed',params:{threadId:'fresh-fixture-thread',turn:{id:'fresh-fixture-turn',status:'completed'}}});
}else if(m.method==='thread/unsubscribe'||m.method==='turn/interrupt')send({id:m.id,result:{}});
});
rl.on('close',()=>process.exit(0));
`);
  const common = join(root, '.git');
  const store = createCodexDesignReadinessHostStore({ gitCommonDir: common, repoFingerprint, trustedExecutablePath: process.execPath });
  const route = { model: 'fixture-model', effort: 'high', sourceSha256: 'b'.repeat(64), candidateCommit: candidate.commit };
  return { root, input, candidate, repoFingerprint, sources, store, route,
    args: { repoRoot: root, repoFingerprint, dispatchId: 'composition-fixture', candidate, sources, route,
      codexPath: process.execPath, inputDirectory: input, store, readCandidate: () => candidate,
      readCommittedSource: (_root, _commit, path) => Buffer.from(`Synthetic ${path.slice(0, -3)} document.\n`) } };
}
