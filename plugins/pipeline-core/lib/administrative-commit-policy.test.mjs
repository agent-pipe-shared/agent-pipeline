// SPDX-License-Identifier: SUL-1.0
// Source-author regression package: controlled genuine Git/data methods only.
// Does not attest a Human, reviewer, provider, installed hook or native host.
import {registerTestCaseCompletion} from './test-case-completion.mjs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectAdministrativeCommit,validateAdministrativeCommitView,administrativeCommitPathspec} from './administrative-commit-policy.mjs';
import {finishedCommitMessageFindings} from './commit-message-policy.mjs';
import {parseBacklogItem,parseTransitionLedger,projectBacklog,transitionHash} from './backlog-state.mjs';
import {checkBacklogState,checkBacklogRegistrationCommit,writeBacklogProjections} from '../scripts/check-backlog-state.mjs';
import {applyBacklogReconciliation} from '../scripts/reconcile-backlog-ledger.mjs';
import {verifyCommit} from '../scripts/dispatch-authorship-verify.mjs';
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const message='docs(backlog): register administrative work\n\nKeep item intent and ledger evidence ordered.\n\nDispatch: administrative (elephant)\nAI-Assisted: true\n';
const cases=[];
const item=(id,status='open',extra='')=>`---\nschema: pipeline.backlog-item.v1\nid: pipeline.${id}\ntype: defect\nowner: pipeline\nstatus: ${status}\ncreated: 2026-10-11\nsource: controlled regression fixture\n${extra}---\n\n# ${id}\n\n## Description\n\nControlled item.\n`;
function fixture(){
  const root=mkdtempSync(join(tmpdir(),'administrative-commit-'));
  const env={...process.env,GIT_AUTHOR_NAME:'Controlled Fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Controlled Fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'};
  const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,env,encoding:'utf8',timeout:10000});assert.equal(r.error,undefined,'genuine fixture Git invocation');assert.equal(r.signal,null);assert.equal(r.status,0,'genuine fixture Git policy/setup refused');return r.stdout.trim();};
  const put=(path,bytes)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),bytes);};
  git('init','-q');
  cpSync(join(repository,'backlog/schemas'),join(root,'backlog/schemas'),{recursive:true});
  put('backlog/items/2026-10-11-existing.md',item('existing'));
  git('add','--','backlog');git('commit','-q','-m',message);
  const first=git('rev-parse','HEAD');
  const event={schema:'pipeline.backlog-transition.v1',sequence:1,id:'pipeline.existing',from:null,to:'open',at:'2026-10-11',actor:'controlled-fixture',reason:'Initialize actual fixture item',evidence:{kind:'fixture',commit:first,reference:'backlog/items/2026-10-11-existing.md'},previousHash:null,entryHash:''};
  event.entryHash=transitionHash(event);put('backlog/transitions.ndjson',JSON.stringify(event)+'\n');put('backlog/STATUS.md','');put('backlog/index.json','');
  assert.equal(writeBacklogProjections(root).ok,true);
  git('add','--','backlog');git('commit','-q','-m',message);
  assert.equal(checkBacklogState(root).ok,true);
  return {root,git,put,close:()=>rmSync(root,{recursive:true,force:true})};
}
function check(id,name,run){cases.push({id,name,run:async()=>{const f=fixture();try{await run(f);}finally{f.close();}}});}
check('ADM001','administrative planning exceeds both stage-0 caps honestly',({root,git,put})=>{
  for(const name of ['plan','spec','acceptance'])put(`specs/admin/${name}.md`,('Planning intent.\n').repeat(40));
  git('add','--','specs');const result=inspectAdministrativeCommit({repoRoot:root,message});assert.equal(result.ok,true);assert.equal(result.paths.length,3);
  assert.deepEqual(finishedCommitMessageFindings(message,{requireMarker:true,requireDispatch:true,administrativeAdmission:result}).findings,[]);
});
check('ADM002','mixed production changes refuse while exact exclusive pathspec preserves peers',({root,git,put})=>{
  put('specs/admin/plan.md','# Plan\n');put('src/production.mjs','export const x=1;\n');git('add','--','specs','src');
  assert.equal(inspectAdministrativeCommit({repoRoot:root,message}).code,'GIT-03-ADMINISTRATIVE-PATHS');
  const pathspec=administrativeCommitPathspec('git commit -F message.txt -- specs/admin/plan.md');assert.deepEqual(pathspec,['specs/admin/plan.md']);
  assert.equal(inspectAdministrativeCommit({repoRoot:root,message,pathspec}).ok,true);
  assert.equal(administrativeCommitPathspec('git commit -a -F message.txt -- specs/admin/plan.md'),null);
  assert.equal(administrativeCommitPathspec('git commit --include -F message.txt -- specs/admin/plan.md'),null);
});
check('ADM003','body-only duplicate and extended admin claims require exact final evidence',({root,git,put})=>{
  put('specs/admin/plan.md','# Plan\n');git('add','--','specs');
  for(const bad of [message+'Review: passed\n',message.replace('AI-Assisted: true','AI-Assisted: true\nAI-Assisted: true'),message+'\nBody prose\n'])assert.equal(inspectAdministrativeCommit({repoRoot:root,message:bad}).ok,false);
  assert(finishedCommitMessageFindings(message).findings.some((f)=>f.code==='GIT-03-ADMINISTRATIVE-EVIDENCE-REQUIRED'));
});
check('ADM004','projection content is derived from real source ledger, never caller assertion',({root,git,put})=>{
  put('backlog/index.json','{}\n');git('add','--','backlog/index.json');assert.equal(inspectAdministrativeCommit({repoRoot:root,message}).ok,false);
  const ledger=readFileSync(join(root,'backlog/transitions.ndjson'),'utf8');
  const parsed=parseBacklogItem(readFileSync(join(root,'backlog/items/2026-10-11-existing.md'),'utf8'),{path:'backlog/items/2026-10-11-existing.md'});
  const projected=projectBacklog([parsed.item],parseTransitionLedger(ledger).events);
  assert.equal(validateAdministrativeCommitView({message,paths:['backlog/index.json'],contents:{'backlog/index.json':projected.indexText},items:[parsed],ledger}).ok,true);
  assert.equal(validateAdministrativeCommitView({message,paths:['backlog/index.json'],contents:{'backlog/index.json':'{}\n'},items:[parsed],ledger}).ok,false);
});
check('ADM005','item-first precheck followed by real commit and official reconciliation stays strict',({root,git,put})=>{
  put('backlog/items/2026-10-11-new.md',item('new'));git('add','--','backlog/items/2026-10-11-new.md');
  assert.equal(checkBacklogState(root).ok,false);const before=checkBacklogRegistrationCommit(root);assert.equal(before.ok,true);assert.equal(before.pendingRegistration.length,1);assert.equal(before.projection,null);
  git('commit','-q','-m',message);const evidence=git('rev-parse','HEAD');assert.equal(checkBacklogState(root).ok,false);
  const applied=applyBacklogReconciliation(root);assert.equal(applied.ok,true);assert.equal(applied.wrote,true);assert.equal(applied.planned.find((e)=>e.id==='pipeline.new').evidence.commit,evidence);assert.equal(checkBacklogState(root).ok,true);
  git('add','--','backlog/transitions.ndjson','backlog/STATUS.md','backlog/index.json');assert.equal(inspectAdministrativeCommit({repoRoot:root,message}).ok,true);
});
check('ADM006','registration mode cannot conceal active work closures or existing-item changes',({root,git,put})=>{
  for(const status of ['in_progress','closed']){put('backlog/items/2026-10-11-new.md',item('new',status));git('add','--','backlog/items/2026-10-11-new.md');assert.equal(checkBacklogRegistrationCommit(root).ok,false);}
  put('backlog/items/2026-10-11-new.md',item('new','open','closure_commit: '+ 'a'.repeat(40)+'\n'));git('add','--','backlog/items/2026-10-11-new.md');assert.equal(checkBacklogRegistrationCommit(root).ok,false);
  put('backlog/items/2026-10-11-new.md',item('new'));put('backlog/items/2026-10-11-existing.md',item('existing')+'Changed intent.\n');git('add','--','backlog/items');assert.equal(checkBacklogRegistrationCommit(root).ok,false);
});
check('ADM007','unrelated baseline drift staged ledger and unstaged mismatch remain blocking',({root,git,put})=>{
  const path='backlog/items/2026-10-11-new.md';put(path,item('new'));git('add','--',path);assert.equal(checkBacklogRegistrationCommit(root).ok,true);
  put(path,item('new')+'Unstaged change.\n');assert.equal(checkBacklogRegistrationCommit(root).ok,false);put(path,item('new'));
  const status=readFileSync(join(root,'backlog/STATUS.md'),'utf8');put('backlog/STATUS.md','corrupt\n');assert.equal(checkBacklogRegistrationCommit(root).ok,false);put('backlog/STATUS.md',status);
  const ledger=readFileSync(join(root,'backlog/transitions.ndjson'),'utf8');put('backlog/transitions.ndjson',ledger+'\n');git('add','--','backlog/transitions.ndjson');assert.equal(checkBacklogRegistrationCommit(root).ok,false);put('backlog/transitions.ndjson',ledger);git('add','--','backlog/transitions.ndjson');
  put('backlog/items/2026-10-11-other.md',item('other'));assert.equal(checkBacklogRegistrationCommit(root).ok,false);
});
check('ADM008','actual committed content has admin provenance without a fictitious dispatch record',({root,git,put})=>{
  put('specs/admin/plan.md','# Actual plan\n');git('add','--','specs');git('commit','-q','-m',message);const sha=git('rev-parse','HEAD');
  assert.equal(inspectAdministrativeCommit({repoRoot:root,message,commitSha:sha}).ok,true);
  const result=verifyCommit(sha,{repoRoot:root,readCommitMessage:()=>git('log','-1','--format=%B',sha),readChangedPaths:()=>{throw new Error('No dispatch record/path stand-in expected');}});
  assert.equal(result.verdict,'PASS');assert.equal(result.classification,'elephant-administrative');
});
check('ASV001','exclusive commit must not attest staged item bytes after selected worktree became malformed',({root,git,put})=>{
  const path='backlog/items/2026-10-11-existing.md';
  put(path,item('existing')+'Staged valid intent.\n');git('add','--',path);
  const staged=git('show',':0:'+path);const index=git('ls-files','--stage','-z');
  put(path,'not a schema-valid backlog item\n');
  assert.notEqual(readFileSync(join(root,path),'utf8'),staged);
  // Genuine Git recognizes this tracked selected path; no commit/signature or fake Git outcome.
  git('commit','--dry-run','--only','--',path);
  const result=inspectAdministrativeCommit({repoRoot:root,message,pathspec:[path]});
  assert.equal(result.ok,false,'guard view must refuse selected worktree/index drift rather than attest stale staged bytes');
  assert.equal(git('ls-files','--stage','-z'),index,'inspection must not mutate the index');
});
check('ASV002','exclusive administrative selection retains unrelated staged production changes',({root,git,put})=>{
  const path='backlog/items/2026-10-11-existing.md';put(path,item('existing')+'Selected valid intent.\n');
  put('src/peer.mjs','export const peer=1;\n');git('add','--',path,'src/peer.mjs');
  const before=git('ls-files','--stage','-z');
  const result=inspectAdministrativeCommit({repoRoot:root,message,pathspec:[path]});
  assert.equal(result.ok,true);assert.deepEqual(result.paths,[path]);
  assert.equal(git('ls-files','--stage','-z'),before);
});
registerTestCaseCompletion({cases,fd:3,maxBytes:65536});
