// Source proposal integration tests; actual S1 observation, no scope callback.
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC03C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
const hookRoot=fileURLToPath(new URL('.',import.meta.url)),repoRoot=resolve(hookRoot,'../../..');
const runtime=["antigravity-pretool-guard.mjs","antigravity-slicing-hint.mjs","antigravity-start-hint.mjs","antigravity-stop-hook.mjs","codex-pretool-guard.mjs","codex-session-start-hint.mjs","codex-slicing-hint.mjs","guard-advisor-prohibition.mjs","guard-apply-patch.mjs","guard-devplan.mjs","guard-dispatch-budget.mjs","guard-dispatch.mjs","guard-el01-tripwire.mjs","guard-gate-strength.mjs","guard-git.mjs","guard-handover-size.mjs","guard-lifecycle-ready.mjs","guard-onboarding-consent-lock.mjs","guard-push.mjs","guard-slicing.mjs","guard-testpath.mjs","guard-worktree-isolation.mjs","native-goldfish-host.mjs","native-slicing.mjs","post-compact-reground.mjs","setup-check.mjs","staleness-check.mjs","stop-suggest.mjs"];
const sha=b=>createHash('sha256').update(b).digest('hex');
function tree(root,prefix=''){return readdirSync(join(root,prefix),{withFileTypes:true}).flatMap(e=>e.isDirectory()?tree(root,join(prefix,e.name)):[[join(prefix,e.name),sha(readFileSync(join(root,prefix,e.name)))] ]);}
function fixture(t,active=false){const scratch=join(repoRoot,'scratch');mkdirSync(scratch,{recursive:true});const dir=mkdtempSync(join(scratch,'governance-hook-scope-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const env={...process.env};for(const key of ['GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR'])delete env[key];execFileSync('git',['init','--quiet','--template='],{cwd:dir,env,stdio:['ignore','pipe','pipe']});if(active){mkdirSync(join(dir,'.agent-pipeline'));writeFileSync(join(dir,'.agent-pipeline/onboarding-consent.json'),JSON.stringify({schema:'pipeline.onboarding-consent-marker.v1',status:'consent-given-onboarding-incomplete',consentGivenAt:new Date().toISOString()}));}return dir;}
function call(dir,name,input='not JSON'){return spawnSync(process.execPath,[join(hookRoot,name)],{cwd:dir,input:typeof input==='string'?input:JSON.stringify(input),encoding:'utf8',timeout:30000,maxBuffer:524288,env:{...process.env,CLAUDE_PROJECT_DIR:dir,NODE_OPTIONS:'',NODE_PATH:''}});}
test('all enumerated hook entries leave never-enrolled repositories inert before malformed tool hardening',t=>{
 const dir=fixture(t);mkdirSync(join(dir,'project'));writeFileSync(join(dir,'AGENTS.md'),'Agent-Pipeline pointer only');writeFileSync(join(dir,'project/pipeline-state.json'),'{broken');const before=tree(dir);
 for(const name of runtime){if(name==='native-slicing.mjs')continue;const result=call(dir,name);assert.equal(result.status,0,name+': '+result.stderr);assert.doesNotMatch(result.stderr,/BLOCKED|HGO|mandatory.bootstrap/i,name);assert.deepEqual(tree(dir),before,name+' wrote outside enrollment');}
 const oversized=call(dir,'antigravity-pretool-guard.mjs','x'.repeat(1024*1024+1));assert.equal(oversized.status,0,oversized.stderr);assert.equal(JSON.parse(oversized.stdout).decision,'allow');assert.equal(oversized.stderr,'');assert.deepEqual(tree(dir),before);
});
test('inactive destructive union survives through Claude and native wrappers while ordinary commits and pushes bypass project conventions',t=>{
 const dir=fixture(t),before=tree(dir);
 for(const command of ['git reset --hard','git push --force','bash -c "git reset --hard"','git -c core.hooksPath=/dev/null status']){
  const legacy=call(dir,'guard-git.mjs',{tool_input:{command}});assert.equal(legacy.status,2,command+': '+legacy.stderr);assert.match(legacy.stderr,/GG-/);assert.doesNotMatch(legacy.stderr,/OVERRIDE|Ledger:|HGO/);
  const codex=call(dir,'codex-pretool-guard.mjs',{tool_name:'Bash',tool_input:{command},cwd:dir});assert.equal(codex.status,0);assert.equal(JSON.parse(codex.stdout).hookSpecificOutput.permissionDecision,'deny');
  const agy=call(dir,'antigravity-pretool-guard.mjs',{toolCall:{name:'run_command',args:{CommandLine:command,Cwd:dir}},workspacePaths:[dir]});assert.equal(agy.status,2);assert.match(agy.stdout+agy.stderr,/GG-/);
 }
 for(const command of ['git commit -m "ordinary message"','git push origin HEAD'])for(const name of ['guard-git.mjs','guard-push.mjs'])assert.equal(call(dir,name,{tool_input:{command}}).status,0,name+command);
 for(const command of ['git config --get core.hooksPath','git config core.hooksPath','git config --local --get-all core.hooksPath']){
  assert.equal(call(dir,'guard-git.mjs',{tool_input:{command}}).status,0,command);
  assert.equal(call(dir,'antigravity-pretool-guard.mjs',{toolCall:{name:'run_command',args:{CommandLine:command,Cwd:dir}},workspacePaths:[dir]}).status,0,command);
 }
 const combined=call(dir,'guard-git.mjs',{tool_input:{command:'git config --get core.hooksPath; git config --unset core.hooksPath'}});assert.equal(combined.status,2);assert.match(combined.stderr,/GG-20/);
 assert.deepEqual(tree(dir),before);
});
test('active canonical consent retains native input/role and lifecycle refusals',t=>{
 const dir=fixture(t,true);const codex=call(dir,'codex-pretool-guard.mjs','malformed');assert.equal(JSON.parse(codex.stdout).hookSpecificOutput.permissionDecision,'deny');
 const oversized=call(dir,'antigravity-pretool-guard.mjs','x'.repeat(1024*1024+1));assert.equal(oversized.status,2);assert.match(oversized.stderr,/stdin-read-failed|hook budget/);
 const agy=call(dir,'antigravity-pretool-guard.mjs',{toolCall:{name:'define_subagent',args:{name:'critic',enable_write_tools:true}},workspacePaths:[dir]});assert.equal(agy.status,2);assert.match(agy.stdout+agy.stderr,/read.only|Hardening/);
 const lifecycle=call(dir,'guard-lifecycle-ready.mjs',{tool_name:'Write',tool_input:{file_path:'src/impl.mjs'}});assert.equal(lifecycle.status,2);
});
test('actual enrolled Git record drift remains unverifiable-active and retains hardening',async t=>{
 const dir=fixture(t);const git=args=>execFileSync('git',args,{cwd:dir,stdio:['ignore','pipe','pipe']});git(['init','--quiet']);git(['config','user.name','Synthetic fixture']);git(['config','user.email','fixture@example.invalid']);git(['commit','--allow-empty','--quiet','-m','Synthetic fixture']);
 const {planGovernanceScopeDecision,applyGovernanceScopeDecision,observeGovernanceScope}=await import(pathToFileURL(join(repoRoot,'plugins/pipeline-core/lib/governance-scope.mjs')).href);
 const plan=planGovernanceScopeDecision({rootDir:dir,decision:'enroll',by:'Synthetic fixture operator'});applyGovernanceScopeDecision(plan,{activate:true,planSha256:plan.planSha256});const enrolled=observeGovernanceScope({rootDir:dir});assert.equal(enrolled.state,'active');git(['config','--local',`agent-pipeline.activation-${enrolled.scopeKey}.record`,'{broken']);assert.equal(observeGovernanceScope({rootDir:dir}).state,'unverifiable-active');
 const result=call(dir,'codex-pretool-guard.mjs','malformed');assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,'deny');
});
test('imported budget, lifecycle and Advisor-prohibition consumers return before private resolution or audit outside enrollment',async t=>{
 const dir=fixture(t),never=()=>{throw Error('private effects attempted before scope admission');};
 const imported=name=>import(pathToFileURL(join(hookRoot,name)).href);
 const budget=await imported('guard-dispatch-budget.mjs');assert.equal(budget.evaluateDispatchBudgetGuard({agent_id:'child',agent_type:'implementor'},{rootDir:dir,resolveGitCommonDirFn:never,nowFn:never}).exitCode,0);
 const advisor=await imported('guard-advisor-prohibition.mjs');assert.equal(advisor.evaluateAdvisorProhibitionGuard({tool_name:'Advisor',agent_id:'child',agent_type:'implementor'},{rootDir:dir,resolveGitCommonDirFn:never,persistAdvisorProhibitionAuditFn:never}).exitCode,0);
 const lifecycle=await imported('guard-lifecycle-ready.mjs');assert.equal(lifecycle.main('malformed',{projectDir:dir,writeErrorFn:never}),0);
});
test('actual Git decline suppresses all hints and budget/telemetry effects despite retained consent',async t=>{
 const dir=fixture(t,true);const git=args=>execFileSync('git',args,{cwd:dir,stdio:['ignore','pipe','pipe']});git(['init','--quiet']);
 const {planGovernanceScopeDecision,applyGovernanceScopeDecision,observeGovernanceScope}=await import(pathToFileURL(join(repoRoot,'plugins/pipeline-core/lib/governance-scope.mjs')).href);
 const plan=planGovernanceScopeDecision({rootDir:dir,decision:'decline',by:'Synthetic fixture operator'});const applied=applyGovernanceScopeDecision(plan,{activate:true,planSha256:plan.planSha256});assert.equal(observeGovernanceScope({rootDir:dir}).state,'declined',JSON.stringify(applied));const before=tree(dir);
 for(const name of ['codex-session-start-hint.mjs','antigravity-start-hint.mjs','guard-dispatch-budget.mjs','staleness-check.mjs','stop-suggest.mjs']){const result=call(dir,name,{invocationNum:0,workspacePaths:[dir],cwd:dir,session_id:'fixture',tool_name:'Write',tool_input:{file_path:'src/a'}});assert.equal(result.status,0,name+result.stderr);assert.doesNotMatch(result.stdout+result.stderr,/optional project workflow|install it|mandatory.bootstrap|BLOCKED|HGO/i);assert.deepEqual(tree(dir),before,name+' mutated declined repository');}
 const oversized=call(dir,'antigravity-pretool-guard.mjs','x'.repeat(1024*1024+1));assert.equal(oversized.status,0,oversized.stderr);assert.equal(JSON.parse(oversized.stdout).decision,'allow');assert.equal(oversized.stderr,'');assert.deepEqual(tree(dir),before);
});
test('active repository still enforces public commit metadata policy that an inactive repository does not acquire',t=>{
 const active=fixture(t,true),inactive=fixture(t),command='git commit -m "fix: fixture" -m "Session-Id: synthetic-session"';
 const enforced=call(active,'guard-git.mjs',{tool_input:{command}});assert.equal(enforced.status,2,enforced.stderr);assert.match(enforced.stderr,/GIT-03|session/i);
 assert.equal(call(inactive,'guard-git.mjs',{tool_input:{command}}).status,0);
});
test('all current runner hook commands are automatically enumerated into the source scope inventory',()=>{
 const wiring=['plugins/pipeline-core/hooks/hooks.json','plugins/pipeline-core/hooks/codex-hooks.json','plugins/pipeline-core/hooks.json'],wired=new Set();
 function walk(v){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')for(const[k,x]of Object.entries(v)){if(['command','commandWindows'].includes(k)&&typeof x==='string')for(const m of x.matchAll(/hooks\/([A-Za-z0-9.-]+\.mjs)/g))wired.add(m[1]);else walk(x);}}
 for(const path of wiring)walk(JSON.parse(readFileSync(join(repoRoot,path),'utf8')));assert.ok(wired.size>10);for(const name of wired)assert.ok(runtime.includes(name),'unadmitted runner wiring: '+name);
});

test('Antigravity slicing observes the active consumer workspace from inactive host cwd before native private state effects',t=>{
 const consumer=fixture(t,true),host=fixture(t),git=args=>execFileSync('git',args,{cwd:consumer,stdio:['ignore','pipe','pipe']});git(['init','--quiet']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);git(['commit','--allow-empty','--quiet','-m','Fixture']);
 const before=tree(consumer),hostBefore=tree(host),event={workspacePaths:[consumer],invocationNum:1,conversationId:'s2-fixture-session',toolCall:{name:'invoke_subagent',args:{Subagents:[{TypeName:'implementor',Prompt:'Synthetic task'}]}}};
 const result=call(host,'antigravity-slicing-hint.mjs',event);assert.equal(result.status,0,result.stderr);assert.ok(tree(consumer).some(([path])=>path.includes('native-slicing')),'active consumer native observer must run even when host cwd is inactive');assert.deepEqual(tree(host),hostBefore);
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 9) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
