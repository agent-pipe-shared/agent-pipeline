import assert from 'node:assert/strict';
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC15C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import {mkdtempSync,writeFileSync,readFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {recordHumanGuardDenial,planHumanGuardOverride,prepareHumanGuardOverrideAuthorization,authorizeHumanGuardOverride,consumeHumanGuardOverride,verifyHumanGuardOverrideAudit} from './human-guard-override.mjs';
const plugin=join(dirname(fileURLToPath(import.meta.url)),'..');
const denials=[{guard:'guard-lifecycle-ready.mjs',reason:'GUARD-DEVPLAN-SHELL'}];
const input={file_path:'notes.md',content:'same exact tool input\n'};
function git(root,...args){const r=spawnSync('git',args,{cwd:root,encoding:'utf8',shell:false});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
function fixture(){const root=mkdtempSync(join(process.env.PIPELINE_HGO_SCAN_TEST_BASE??tmpdir(),'hgo-scan-'));git(root,'init','-q','-b','main');git(root,'config','user.name','Fixture');git(root,'config','user.email','fixture@example.invalid');writeFileSync(join(root,'README.md'),'fixture\n');writeFileSync(join(root,'pipeline.user.yaml'),'schema: "pipeline.user.v3"\ngates:\n  push_approval: "chat"\n');git(root,'add','.');git(root,'commit','-q','-m','fixture');return root;}
function arm(root,now){const scriptPath=join(plugin,'scripts','guard-human-override.mjs');const common={rootDir:root,pluginRoot:plugin,toolName:'Write',toolInput:input,denials};const req=recordHumanGuardDenial({...common,nowMs:now,ttlMs:100000});const plan=planHumanGuardOverride({...common,requestSha256:req.requestSha256,scriptPath,nowMs:now+100});const reason='Controlled attended scan regression';const prep=prepareHumanGuardOverrideAuthorization({...common,requestSha256:req.requestSha256,planSha256:plan.planSha256,reason,scriptPath,nowMs:now+200});const result=authorizeHumanGuardOverride({...common,requestSha256:req.requestSha256,planSha256:plan.planSha256,selectionSha256:prep.selectionSha256,reason,reasonSha256:prep.reasonSha256,scriptPath,nowMs:now+300,activate:true,dependencies:{isattyFn:()=>true,readLineFn:()=>`HGO-${prep.selectionSha256.slice(0,8).toUpperCase()}`}});assert.equal(result.status,'armed');return plan.planSha256;}
function consume(root){return consumeHumanGuardOverride({rootDir:root,pluginRoot:plugin,toolName:'Write',toolInput:input,denials,nowMs:9000});}
function store(root){return join(git(root,'rev-parse','--path-format=absolute','--git-common-dir'),'agent-pipeline','human-guard-overrides');}
function audit(root){return readFileSync(join(store(root),'audit.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s).event);}
function orderedPair(){for(let i=0;i<24;i++){const root=fixture();try{const head=git(root,'rev-parse','HEAD');const stale=arm(root,1000);writeFileSync(join(root,'changed.md'),'real worktree drift\n');const current=arm(root,5000);assert.equal(git(root,'rev-parse','HEAD'),head,'only worktree status changes');if(stale<current)return {root,stale,current};}catch(e){rmSync(root,{recursive:true,force:true});throw e;}rmSync(root,{recursive:true,force:true});}throw Error('bounded fixture generation did not produce stale-before-current digest order');}
test('HGO-SCAN: authenticated stale matching record cannot shadow a current matching capability',()=>{const {root,stale,current}=orderedPair();try{assert.ok(stale<current);const old=JSON.parse(readFileSync(join(store(root),'capabilities',`${stale}.json`)));const fresh=JSON.parse(readFileSync(join(store(root),'capabilities',`${current}.json`)));assert.equal(old.toolInputSha256,fresh.toolInputSha256);assert.ok(new Date(old.expiresAt).getTime()>9000,'old capability is not expired');const result=consume(root);assert.equal(result.status,'consumed');assert.equal(result.planSha256,current);const entries=audit(root);assert.deepEqual(entries.filter(e=>e.type==='rejected').map(e=>({plan:e.planSha256,checks:e.driftedChecks})),[{plan:stale,checks:['repository']}]);assert.equal(entries.filter(e=>e.type==='consumed').length,1);assert.equal(JSON.parse(readFileSync(join(store(root),'capabilities',`${stale}.json`))).status,'armed');assert.equal(readdirSync(join(store(root),'locks')).length,0);assert.ok(verifyHumanGuardOverrideAudit({rootDir:root}));}finally{rmSync(root,{recursive:true,force:true});}});
test('HGO-SCAN: stale-only candidates remain refused without capability consumption',()=>{const root=fixture();try{const stale=arm(root,1000);writeFileSync(join(root,'changed.md'),'drift\n');assert.deepEqual(consume(root),{status:'replan',code:'HGO-DRIFT'});assert.equal(JSON.parse(readFileSync(join(store(root),'capabilities',`${stale}.json`))).status,'armed');assert.equal(audit(root).some(e=>e.type==='consumed'),false);}finally{rmSync(root,{recursive:true,force:true});}});
test('HGO-SCAN: corrupt authenticated audit still fails globally before later valid candidates',()=>{const {root}=orderedPair();try{const path=join(store(root),'audit.jsonl');const lines=readFileSync(path,'utf8').trim().split('\n');const first=JSON.parse(lines[0]);first.event.at='2000-01-01T00:00:00.000Z';lines[0]=JSON.stringify(first);writeFileSync(path,lines.join('\n')+'\n',{mode:0o600});assert.deepEqual(consume(root),{status:'invalid',code:'HGO-AUDIT'});for(const name of readdirSync(join(store(root),'capabilities')))assert.equal(JSON.parse(readFileSync(join(store(root),'capabilities',name))).status,'armed');assert.equal(readdirSync(join(store(root),'locks')).length,0);}finally{rmSync(root,{recursive:true,force:true});}});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 3) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
